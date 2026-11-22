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
  console.log("=== Running Lessons 6.5 & 6.6 Automated Test Suite ===");
  const stamp = Date.now();

  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L65 Hospital ${stamp}`, `L65-${stamp}`, `hosp65_${stamp}@test.com`, "+91-9876500030"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'General Medicine', 'Internal medicine clinic', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Doctor A
  const docAEmail = `doc65_a_${stamp}@test.com`;
  const [docARes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Aaron Adams', ?, ?, '+91-9876500031', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, docAEmail, passHash]
  );
  const docAId = docARes.insertId;

  const tokenDocA = jwt.sign(
    { sub: String(docAId), email: docAEmail, role: "doctor", hospitalId, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Doctor B
  const docBEmail = `doc65_b_${stamp}@test.com`;
  const [docBRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Bradley Cooper', ?, ?, '+91-9876500032', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, docBEmail, passHash]
  );
  const docBId = docBRes.insertId;

  const tokenDocB = jwt.sign(
    { sub: String(docBId), email: docBEmail, role: "doctor", hospitalId, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Patient
  const patientEmail = `pat65_${stamp}@test.com`;
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Alice Wonder', ?, ?, '+91-9876500033', 'active')`,
    [roleMap.patient, patientEmail, passHash]
  );
  const patientId = patRes.insertId;

  const tokenPatient = jwt.sign(
    { sub: String(patientId), email: patientEmail, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Staff (Nurse / Receptionist)
  const staffEmail = `staff65_${stamp}@test.com`;
  const [staffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, 'Nurse Clara', ?, ?, '+91-9876500034', 'active')`,
    [roleMap.staff, hospitalId, staffEmail, passHash]
  );
  const staffId = staffRes.insertId;

  const tokenStaff = jwt.sign(
    { sub: String(staffId), email: staffEmail, role: "staff", hospitalId, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Target date
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);
  const aptDateStr = futureDate.toISOString().split("T")[0];

  // Insert base appointment for Doctor A
  const aptNumA = `APT-65A-${stamp}`;
  const [aptARes] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '09:00:00', '09:00:00', '09:30:00', 'pending', 'Fever check')`,
    [aptNumA, patientId, hospitalId, departmentId, docAId, aptDateStr]
  );
  const aptAId = aptARes.insertId;

  // Insert base appointment for Doctor B
  const aptNumB = `APT-65B-${stamp}`;
  const [aptBRes] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '11:00:00', '11:00:00', '11:30:00', 'confirmed', 'Skin rash')`,
    [aptNumB, patientId, hospitalId, departmentId, docBId, aptDateStr]
  );
  const aptBId = aptBRes.insertId;

  try {
    // TEST 1: Doctor-Specific Appointment Visibility (Lesson 6.6)
    console.log("TEST 1: Verifying doctor-specific appointment visibility...");
    const docAAppointments = await get("/appointments", tokenDocA);
    assert.strictEqual(docAAppointments.status, 200);
    assert.ok(docAAppointments.body.data.every((a) => a.doctor_id === docAId));
    assert.ok(docAAppointments.body.data.some((a) => a.id === aptAId));
    assert.strictEqual(docAAppointments.body.data.some((a) => a.id === aptBId), false, "Doctor A must NOT see Doctor B's appointments");

    const docBAppointments = await get("/appointments", tokenDocB);
    assert.strictEqual(docBAppointments.status, 200);
    assert.ok(docBAppointments.body.data.every((a) => a.doctor_id === docBId));
    assert.ok(docBAppointments.body.data.some((a) => a.id === aptBId));
    assert.strictEqual(docBAppointments.body.data.some((a) => a.id === aptAId), false, "Doctor B must NOT see Doctor A's appointments");
    console.log("✓ TEST 1 Passed: Doctor visibility strictly isolated to own appointments.");

    // TEST 2: Role Permissions on Status Transitions (Lesson 6.5)
    console.log("TEST 2: Patient cannot confirm appointment...");
    const patientConfirmRes = await patch(
      `/appointments/${aptAId}/status`,
      { status: "confirmed" },
      tokenPatient
    );
    assert.strictEqual(patientConfirmRes.status, 403);
    assert.ok(patientConfirmRes.body.message.includes("Patients are only permitted to cancel appointments"));

    console.log("TEST 2.1: Doctor B cannot alter Doctor A's appointment...");
    const docBAlterRes = await patch(
      `/appointments/${aptAId}/status`,
      { status: "confirmed" },
      tokenDocB
    );
    assert.strictEqual(docBAlterRes.status, 403);
    assert.ok(docBAlterRes.body.message.includes("only update your assigned appointments"));
    console.log("✓ TEST 2 Passed: Unauthorized status transitions strictly rejected.");

    // TEST 3: Allowed Status Lifecycle Flow (Lesson 6.5)
    // 1. Doctor A confirms pending appointment -> confirmed
    console.log("TEST 3: Lifecycle step 1: Doctor A confirms appointment...");
    const confirmRes = await patch(`/appointments/${aptAId}/status`, { status: "confirmed" }, tokenDocA);
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.status, "confirmed");

    // 2. Staff checks in patient -> in_waiting
    console.log("TEST 3.1: Lifecycle step 2: Staff moves confirmed appointment to in_waiting...");
    const waitingRes = await patch(`/appointments/${aptAId}/status`, { status: "in_waiting" }, tokenStaff);
    assert.strictEqual(waitingRes.status, 200);
    assert.strictEqual(waitingRes.body.status, "in_waiting");

    // 3. Doctor starts consultation -> in_progress
    console.log("TEST 3.2: Lifecycle step 3: Doctor starts consultation (in_progress)...");
    const inProgressRes = await patch(`/appointments/${aptAId}/status`, { status: "in_progress" }, tokenDocA);
    assert.strictEqual(inProgressRes.status, 200);
    assert.strictEqual(inProgressRes.body.status, "in_progress");

    // 4. Doctor completes consultation -> completed
    console.log("TEST 3.3: Lifecycle step 4: Doctor marks consultation as completed...");
    // Module 8: Start and submit consultation first
    await post("/consultations/start", { appointment_id: aptAId }, tokenDocA);
    const [cRow] = await pool.query("SELECT id FROM consultations WHERE appointment_id = ?", [aptAId]);
    await post(`/consultations/${cRow[0].id}/submit`, {
      chief_complaint: "Routine cardiology checkup",
      examination_findings: "Normal heart sounds, vitals stable",
      diagnosis: "Essential Hypertension",
      treatment_plan: "Continue regular medications",
    }, tokenDocA);

    const completeRes = await patch(`/appointments/${aptAId}/status`, { status: "completed" }, tokenDocA);
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.body.status, "completed");

    // 5. Invalid transition: cannot transition completed to pending
    console.log("TEST 3.4: Lifecycle step 5: Completed appointment cannot transition back to pending...");
    const invalidStepRes = await patch(`/appointments/${aptAId}/status`, { status: "pending" }, tokenDocA);
    assert.strictEqual(invalidStepRes.status, 400);
    assert.ok(invalidStepRes.body.message.includes("Cannot transition status from 'completed' to 'pending'"));
    console.log("✓ TEST 3 Passed: 8-status lifecycle transition rules enforced successfully.");

    console.log("\n=======================================================");
    console.log("ALL LESSONS 6.5 & 6.6 TESTS PASSED! (3 / 3)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup
    await pool.execute("DELETE FROM appointments WHERE hospital_id = ?", [hospitalId]);
    await pool.execute("DELETE FROM users WHERE hospital_id = ? OR id = ?", [hospitalId, patientId]);
    await pool.execute("DELETE FROM departments WHERE id = ?", [departmentId]);
    await pool.execute("DELETE FROM hospitals WHERE id = ?", [hospitalId]);
  }
}

runTests()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Lessons 6.5 & 6.6 Test Suite Failed:", err);
    await pool.end();
    process.exit(1);
  });
