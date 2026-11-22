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
  console.log("=== Running Lessons 6.7 & 6.8 Automated Test Suite ===");
  const stamp = Date.now();

  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L67 Hospital ${stamp}`, `L67-${stamp}`, `hosp67_${stamp}@test.com`, "+91-9876500040"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Dermatology', 'Skin and hair clinic', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Insert Doctor with Wednesday schedule (09:00 - 17:00)
  const doctorEmail = `doc67_${stamp}@test.com`;
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Derma Specialist', ?, ?, '+91-9876500041', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, doctorEmail, passHash]
  );
  const doctorId = docRes.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee)
     VALUES (?, 'Dermatologist', 'MD Dermatology', 8, 700.00)`,
    [doctorId]
  );

  await pool.execute(
    `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
     VALUES (?, ?, 'wednesday', '09:00:00', '17:00:00', 30, TRUE)`,
    [doctorId, hospitalId]
  );

  // Insert Patient 1 (Alice)
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Alice Skin', ?, ?, '+91-9876500042', 'active')`,
    [roleMap.patient, `pat67_a_${stamp}@test.com`, passHash]
  );
  const patient1Id = pat1Res.insertId;
  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
     VALUES (?, '1995-03-21', 'female', 'B+', '77 Rose Lane', 'Tom Skin', '+91-9876500043', TRUE)`,
    [patient1Id]
  );

  const tokenPat1 = jwt.sign(
    { sub: String(patient1Id), email: `pat67_a_${stamp}@test.com`, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Insert Patient 2 (Bob)
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Bob Skin', ?, ?, '+91-9876500044', 'active')`,
    [roleMap.patient, `pat67_b_${stamp}@test.com`, passHash]
  );
  const patient2Id = pat2Res.insertId;
  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
     VALUES (?, '1992-07-11', 'male', 'O+', '88 Oak Street', 'Mary Skin', '+91-9876500045', TRUE)`,
    [patient2Id]
  );

  const tokenPat2 = jwt.sign(
    { sub: String(patient2Id), email: `pat67_b_${stamp}@test.com`, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Find next upcoming Wednesday
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getUTCDay() !== 3) { // 3 = Wednesday
    d.setDate(d.getDate() + 1);
  }
  const nextWedStr = d.toISOString().split("T")[0];

  try {
    // TEST 1: Simultaneous Booking Conflict / Race Condition (Lesson 6.7)
    console.log("TEST 1: Simulating concurrent booking for the same slot...");
    const [resAlice, resBob] = await Promise.all([
      post(
        "/appointments",
        {
          hospital_id: hospitalId,
          department_id: departmentId,
          doctor_id: doctorId,
          appointment_date: nextWedStr,
          appointment_time: "10:00:00",
          appointment_type: "consultation",
        },
        tokenPat1
      ),
      post(
        "/appointments",
        {
          hospital_id: hospitalId,
          department_id: departmentId,
          doctor_id: doctorId,
          appointment_date: nextWedStr,
          appointment_time: "10:00:00",
          appointment_type: "consultation",
        },
        tokenPat2
      ),
    ]);

    // Exactly one must succeed (201) and one must be rejected (409)
    const statuses = [resAlice.status, resBob.status].sort();
    assert.deepStrictEqual(statuses, [201, 409], "One booking must succeed and one must be rejected with 409 Conflict");
    console.log("✓ TEST 1 Passed: Concurrency lock prevented double-booking collision.");

    // TEST 2: Duplicate booking prevention on same date (Lesson 6.7)
    console.log("TEST 2: Patient attempts second booking with same doctor on same date...");
    const winnerToken = resAlice.status === 201 ? tokenPat1 : tokenPat2;
    const dupRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: nextWedStr,
        appointment_time: "11:00:00", // Different time, but same doctor & date
        appointment_type: "routine_checkup",
      },
      winnerToken
    );
    assert.strictEqual(dupRes.status, 409);
    assert.ok(dupRes.body.message.includes("already have an active appointment scheduled with this doctor on this date"));
    console.log("✓ TEST 2 Passed: Duplicate active appointment on same date blocked.");

    // TEST 3: 4-Hour Advance Cancellation Rule (Lesson 6.8)
    console.log("TEST 3: Testing 4-hour advance cancellation rule...");
    const today = new Date().toISOString().split("T")[0];
    const nowHours = new Date().getHours();
    const imminentTime = `${String(nowHours + 1).padStart(2, "0")}:00:00`; // 1 hour from now

    // Insert an appointment scheduled in 1 hour
    const [imminentRes] = await pool.execute(
      `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '11:30:00', 'confirmed', 'Urgent rash')`,
      [`APT-IMM-${stamp}`, patient1Id, hospitalId, departmentId, doctorId, today, imminentTime, imminentTime]
    );
    const imminentAptId = imminentRes.insertId;

    const cancelImminentRes = await patch(
      `/appointments/${imminentAptId}/cancel`,
      { reason: "Feeling better" },
      tokenPat1
    );
    assert.strictEqual(cancelImminentRes.status, 400);
    assert.ok(cancelImminentRes.body.message.includes("cannot be cancelled within 4 hours"));
    console.log("✓ TEST 3 Passed: Cancellation blocked when less than 4 hours ahead.");

    // TEST 4: Valid Cancellation Outside Cut-off Window (Lesson 6.8)
    console.log("TEST 4: Cancelling appointment with > 4 hours advance notice...");
    const winnerAptId = resAlice.status === 201 ? resAlice.body.data.id : resBob.body.data.id;
    const cancelValidRes = await patch(
      `/appointments/${winnerAptId}/cancel`,
      { reason: "Family event on Wednesday" },
      winnerToken
    );
    assert.strictEqual(cancelValidRes.status, 200);

    // Verify DB record has cancellation reason and cancelled_by
    const [cancelledRows] = await pool.execute(
      "SELECT status, cancellation_reason, cancelled_by FROM appointments WHERE id = ?",
      [winnerAptId]
    );
    assert.strictEqual(cancelledRows[0].status, "cancelled");
    assert.strictEqual(cancelledRows[0].cancellation_reason, "Family event on Wednesday");
    assert.ok(cancelledRows[0].cancelled_by);
    console.log("✓ TEST 4 Passed: Valid cancellation recorded cancellation_reason and cancelled_by.");

    console.log("\n=======================================================");
    console.log("ALL LESSONS 6.7 & 6.8 TESTS PASSED! (4 / 4)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup
    await pool.execute("DELETE FROM appointments WHERE hospital_id = ?", [hospitalId]);
    await pool.execute("DELETE FROM doctor_schedules WHERE doctor_id = ?", [doctorId]);
    await pool.execute("DELETE FROM doctor_profiles WHERE user_id = ?", [doctorId]);
    await pool.execute("DELETE FROM patient_profiles WHERE user_id IN (?, ?)", [patient1Id, patient2Id]);
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
    console.error("Lessons 6.7 & 6.8 Test Suite Failed:", err);
    await pool.end();
    setTimeout(() => process.exit(1), 100);
  });
