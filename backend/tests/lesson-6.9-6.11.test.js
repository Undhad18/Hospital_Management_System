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
  console.log("=== Running Lessons 6.9, 6.10 & 6.11 Automated Test Suite ===");
  const stamp = Date.now();

  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L69 Hospital ${stamp}`, `L69-${stamp}`, `hosp69_${stamp}@test.com`, "+91-9876500050"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'ENT Clinic', 'Ear, nose, and throat', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Insert Doctor with Thursday schedule
  const doctorEmail = `doc69_${stamp}@test.com`;
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Emily ENT', ?, ?, '+91-9876500051', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, doctorEmail, passHash]
  );
  const doctorId = docRes.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee)
     VALUES (?, 'ENT Specialist', 'MS ENT', 11, 750.00)`,
    [doctorId]
  );

  await pool.execute(
    `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
     VALUES (?, ?, 'thursday', '09:00:00', '17:00:00', 30, TRUE)`,
    [doctorId, hospitalId]
  );

  // Insert Patient
  const patientEmail = `pat69_${stamp}@test.com`;
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'George Miller', ?, ?, '+91-9876500052', 'active')`,
    [roleMap.patient, patientEmail, passHash]
  );
  const patientId = patRes.insertId;

  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
     VALUES (?, '1988-12-04', 'male', 'AB+', '100 King Street', 'Sarah Miller', '+91-9876500053', TRUE)`,
    [patientId]
  );

  const patientToken = jwt.sign(
    { sub: String(patientId), email: patientEmail, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Find next upcoming Thursday (Thursday A) and the Thursday after that (Thursday B)
  const d1 = new Date();
  d1.setDate(d1.getDate() + 1);
  while (d1.getUTCDay() !== 4) { // 4 = Thursday
    d1.setDate(d1.getDate() + 1);
  }
  const thursAStr = d1.toISOString().split("T")[0];

  const d2 = new Date(d1);
  d2.setDate(d2.getDate() + 7);
  const thursBStr = d2.toISOString().split("T")[0];

  try {
    // TEST 1: Lesson 6.11: Future-Date Validation & Three-Month Booking Window
    console.log("TEST 1: Verifying past date rejection (Lesson 6.11)...");
    const pastBookingRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: "2024-01-01",
        appointment_time: "10:00:00",
      },
      patientToken
    );
    assert.strictEqual(pastBookingRes.status, 400);
    assert.ok(pastBookingRes.body.message.includes("cannot be in the past"));
    console.log("✓ TEST 1 Passed: Past dates rejected.");

    console.log("TEST 1.1: Verifying three-month booking window limit (Lesson 6.11)...");
    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 120); // 4 months in future
    const farFutureStr = farFutureDate.toISOString().split("T")[0];

    const farFutureRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: farFutureStr,
        appointment_time: "10:00:00",
      },
      patientToken
    );
    assert.strictEqual(farFutureRes.status, 400);
    assert.ok(farFutureRes.body.message.includes("maximum 3-month window"));
    console.log("✓ TEST 1.1 Passed: Dates beyond 3 months rejected.");

    // TEST 2: Valid Initial Booking on Thursday A
    console.log("TEST 2: Booking initial appointment on Thursday A...");
    const bookRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: thursAStr,
        appointment_time: "09:30:00",
        appointment_type: "consultation",
        reason: "Sinus congestion",
      },
      patientToken
    );
    assert.strictEqual(bookRes.status, 201);
    const appointmentId = bookRes.body.data.id;
    console.log("✓ TEST 2 Passed: Initial appointment created.");

    // TEST 3: Rescheduling to Thursday B (Lesson 6.9)
    console.log("TEST 3: Rescheduling appointment from Thursday A to Thursday B...");
    const rescheduleRes = await patch(
      `/appointments/${appointmentId}/reschedule`,
      {
        appointment_date: thursBStr,
        appointment_time: "11:00:00",
        reason: "Work meeting conflict on Thursday A",
      },
      patientToken
    );
    assert.strictEqual(rescheduleRes.status, 200);
    assert.strictEqual(rescheduleRes.body.appointment_date, thursBStr);
    assert.ok(rescheduleRes.body.appointment_time.includes("11:00"));

    // Verify DB update
    const [updatedRows] = await pool.execute(
      "SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time, reason FROM appointments WHERE id = ?",
      [appointmentId]
    );
    assert.strictEqual(updatedRows[0].appointment_date, thursBStr);
    assert.ok(updatedRows[0].reason.includes("Work meeting conflict"));
    console.log("✓ TEST 3 Passed: Appointment rescheduled to new date/time with conflict check.");

    // TEST 4: Follow-up Appointment Booking (Lesson 6.10)
    console.log("TEST 4: Scheduling a follow-up appointment linked to initial appointment...");
    // Find Thursday C (14 days after Thursday B)
    const d3 = new Date(d2);
    d3.setDate(d3.getDate() + 7);
    const thursCStr = d3.toISOString().split("T")[0];

    const followUpRes = await post(
      "/appointments/follow-up",
      {
        previous_appointment_id: appointmentId,
        appointment_date: thursCStr,
        appointment_time: "10:30:00",
        reason: "Follow-up check on sinus medication response",
      },
      patientToken
    );

    assert.strictEqual(followUpRes.status, 201);
    assert.strictEqual(followUpRes.body.data.follow_up_to_id, appointmentId);

    // Verify DB linkage
    const [fuRows] = await pool.execute(
      "SELECT id, appointment_type, follow_up_to_id FROM appointments WHERE id = ?",
      [followUpRes.body.data.id]
    );
    assert.strictEqual(fuRows[0].appointment_type, "follow_up");
    assert.strictEqual(fuRows[0].follow_up_to_id, appointmentId);
    console.log("✓ TEST 4 Passed: Follow-up appointment linked to previous appointment ID.");

    console.log("\n=======================================================");
    console.log("ALL LESSONS 6.9, 6.10 & 6.11 TESTS PASSED! (4 / 4)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup
    await pool.execute("DELETE FROM appointments WHERE hospital_id = ?", [hospitalId]);
    await pool.execute("DELETE FROM doctor_schedules WHERE doctor_id = ?", [doctorId]);
    await pool.execute("DELETE FROM doctor_profiles WHERE user_id = ?", [doctorId]);
    await pool.execute("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]);
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
    console.error("Lessons 6.9-6.11 Test Suite Failed:", err);
    await pool.end();
    process.exit(1);
  });
