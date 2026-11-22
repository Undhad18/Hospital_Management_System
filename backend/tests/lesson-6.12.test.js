const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
const API_BASE = "http://localhost:5000/api";

async function post(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function get(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "GET",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function patch(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("=== Running Lesson 6.12 Automated Test Suite ===");
  const stamp = Date.now();

  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L612 Hospital ${stamp}`, `L612-${stamp}`, `hosp612_${stamp}@test.com`, "+91-9876500060"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Ophthalmology', 'Eye care clinic', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Doctor
  const docEmail = `doc612_${stamp}@test.com`;
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Iris Vision', ?, ?, '+91-9876500061', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, docEmail, passHash]
  );
  const doctorId = docRes.insertId;

  // Staff (Receptionist)
  const staffEmail = `staff612_${stamp}@test.com`;
  const [staffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, 'Desk Receptionist Rita', ?, ?, '+91-9876500062', 'active')`,
    [roleMap.staff, hospitalId, staffEmail, passHash]
  );
  const staffId = staffRes.insertId;

  const staffToken = jwt.sign(
    { sub: String(staffId), email: staffEmail, role: "staff", hospitalId, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Patient 1 & 2
  const [p1] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Patient Alpha', ?, ?, '+91-9876500063', 'active')`,
    [roleMap.patient, `p1_${stamp}@test.com`, passHash]
  );
  const patient1Id = p1.insertId;

  const [p2] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Patient Beta', ?, ?, '+91-9876500064', 'active')`,
    [roleMap.patient, `p2_${stamp}@test.com`, passHash]
  );
  const patient2Id = p2.insertId;

  const tokenPat1 = jwt.sign(
    { sub: String(patient1Id), email: `p1_${stamp}@test.com`, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  // Insert appointment 1 for Today
  const [apt1Res] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '09:00:00', '09:00:00', '09:30:00', 'confirmed', 'Eye exam')`,
    [`APT-Q1-${stamp}`, patient1Id, hospitalId, departmentId, doctorId, today]
  );
  const apt1Id = apt1Res.insertId;

  // Insert appointment 2 for Today
  const [apt2Res] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '09:30:00', '09:30:00', '10:00:00', 'confirmed', 'Glaucoma check')`,
    [`APT-Q2-${stamp}`, patient2Id, hospitalId, departmentId, doctorId, today]
  );
  const apt2Id = apt2Res.insertId;

  // Insert appointment 3 for Tomorrow
  const [apt3Res] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '10:00:00', '10:00:00', '10:30:00', 'confirmed', 'Vision test')`,
    [`APT-Q3-${stamp}`, patient1Id, hospitalId, departmentId, doctorId, tomorrow]
  );
  const apt3Id = apt3Res.insertId;

  try {
    // TEST 1: Check-in role authorization check
    console.log("TEST 1: Patient cannot execute receptionist check-in...");
    const patCheckInRes = await patch(`/appointments/${apt1Id}/check-in`, {}, tokenPat1);
    assert.strictEqual(patCheckInRes.status, 403);
    assert.ok(patCheckInRes.body.message.includes("Only receptionists and hospital staff"));
    console.log("✓ TEST 1 Passed: Unauthorized check-in blocked.");

    // TEST 2: Check-in date restriction (Must be for today)
    console.log("TEST 2: Check-in rejected for future date appointment...");
    const futureCheckInRes = await patch(`/appointments/${apt3Id}/check-in`, {}, staffToken);
    assert.strictEqual(futureCheckInRes.status, 400);
    assert.ok(futureCheckInRes.body.message.includes("only permitted on the scheduled date"));
    console.log("✓ TEST 2 Passed: Early check-in on wrong date rejected.");

    // TEST 3: Receptionist Check-in assigns sequential Queue numbers
    console.log("TEST 3: Receptionist checks in first patient today (assigns Q-001)...");
    const checkIn1 = await patch(`/appointments/${apt1Id}/check-in`, {}, staffToken);
    assert.strictEqual(checkIn1.status, 200);
    assert.strictEqual(checkIn1.body.data.queue_number, "Q-001");
    assert.strictEqual(checkIn1.body.data.status, "in_waiting");

    console.log("TEST 3.1: Receptionist checks in second patient today (assigns Q-002)...");
    const checkIn2 = await patch(`/appointments/${apt2Id}/check-in`, {}, staffToken);
    assert.strictEqual(checkIn2.status, 200);
    assert.strictEqual(checkIn2.body.data.queue_number, "Q-002");
    assert.strictEqual(checkIn2.body.data.status, "in_waiting");

    // Verify duplicate check-in blocked
    const reCheckIn = await patch(`/appointments/${apt1Id}/check-in`, {}, staffToken);
    assert.strictEqual(reCheckIn.status, 400);
    assert.ok(reCheckIn.body.message.includes("already checked in"));
    console.log("✓ TEST 3 Passed: Sequential queue numbers Q-001 and Q-002 assigned, duplicate check-in blocked.");

    // TEST 4: Live Queue Telemetry Endpoint
    console.log("TEST 4: Querying live queue telemetry endpoint...");
    const liveQueueRes = await get("/appointments/queue/live", staffToken);
    assert.strictEqual(liveQueueRes.status, 200);
    assert.strictEqual(liveQueueRes.body.waiting_count, 2);
    assert.strictEqual(liveQueueRes.body.in_progress_count, 0);
    assert.strictEqual(liveQueueRes.body.queue.length, 2);
    assert.strictEqual(liveQueueRes.body.queue[0].queue_number, "Q-001");
    assert.strictEqual(liveQueueRes.body.queue[1].queue_number, "Q-002");
    console.log("✓ TEST 4 Passed: Live queue telemetry accurately reports in_waiting patient queue.");

    console.log("\n=======================================================");
    console.log("ALL LESSON 6.12 TESTS PASSED! (4 / 4)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup
    await pool.execute("DELETE FROM appointments WHERE hospital_id = ?", [hospitalId]);
    await pool.execute("DELETE FROM users WHERE hospital_id = ? OR id IN (?, ?)", [hospitalId, patient1Id, patient2Id]);
    await pool.execute("DELETE FROM departments WHERE id = ?", [departmentId]);
    await pool.execute("DELETE FROM hospitals WHERE id = ?", [hospitalId]);
  }
}

runTests()
  .then(async () => {
    await pool.end();
    setTimeout(() => process.exit(0), 100);
  })
  .catch(async (err) => {
    console.error("Lesson 6.12 Test Suite Failed:", err);
    await pool.end();
    setTimeout(() => process.exit(1), 100);
  });
