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

async function runTests() {
  console.log("=== Running Lessons 6.3 & 6.4 Automated Test Suite ===");
  const stamp = Date.now();

  // 1. Setup Test Fixtures: Hospital, Department, Doctor, Staff, Patient
  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L63 Hospital ${stamp}`, `L63-${stamp}`, `hosp63_${stamp}@test.com`, "+91-9876500020"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Pediatrics', 'Children healthcare', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Insert Doctor with Friday schedule (09:00 - 17:00, lunch 13:00 - 14:00)
  const doctorEmail = `doc63_${stamp}@test.com`;
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Sarah Connor', ?, ?, '+91-9876500021', 'active')`,
    [roleMap.doctor, hospitalId, departmentId, doctorEmail, passHash]
  );
  const doctorId = docRes.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee)
     VALUES (?, 'Pediatrician', 'MD Pediatrics', 10, 600.00)`,
    [doctorId]
  );

  await pool.execute(
    `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, break_start, break_end, is_available)
     VALUES (?, ?, 'friday', '09:00:00', '17:00:00', 30, '13:00:00', '14:00:00', TRUE)`,
    [doctorId, hospitalId]
  );

  // Insert Staff (Receptionist)
  const staffEmail = `staff63_${stamp}@test.com`;
  const [staffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, 'Receptionist John', ?, ?, '+91-9876500022', 'active')`,
    [roleMap.staff, hospitalId, staffEmail, passHash]
  );
  const staffId = staffRes.insertId;

  const staffToken = jwt.sign(
    { sub: String(staffId), email: staffEmail, role: "staff", hospitalId, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Insert Patient (Complete Profile)
  const patientEmail = `pat63_${stamp}@test.com`;
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Emily Watson', ?, ?, '+91-9876500023', 'active')`,
    [roleMap.patient, patientEmail, passHash]
  );
  const patientId = patRes.insertId;

  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
     VALUES (?, '2000-01-01', 'female', 'A+', '45 Ocean View', 'James Watson', '+91-9876500024', TRUE)`,
    [patientId]
  );

  const patientToken = jwt.sign(
    { sub: String(patientId), email: patientEmail, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Find next upcoming Friday
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getUTCDay() !== 5) { // 5 = Friday
    d.setDate(d.getDate() + 1);
  }
  const nextFridayStr = d.toISOString().split("T")[0];

  try {
    // TEST 1: Patient Self-Booking (Lesson 6.3 & 6.4)
    console.log("TEST 1: Patient books an in-person routine checkup appointment...");
    const bookingRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: nextFridayStr,
        appointment_time: "09:30:00",
        appointment_type: "routine_checkup",
        appointment_mode: "in_person",
        reason: "Annual child wellness check",
        payment_method: "cash",
      },
      patientToken
    );

    assert.strictEqual(bookingRes.status, 201);
    assert.strictEqual(bookingRes.body.success, true);
    const apt1 = bookingRes.body.data;
    assert.ok(apt1.appointment_number.startsWith("APT-"));
    assert.strictEqual(apt1.patient_id, patientId);
    assert.strictEqual(apt1.status, "pending"); // Starts as pending for patient self-booking
    assert.strictEqual(apt1.appointment_type, "routine_checkup");
    assert.strictEqual(apt1.appointment_mode, "in_person");
    assert.strictEqual(apt1.start_time, "09:30:00");
    assert.strictEqual(apt1.end_time, "10:00:00");
    assert.strictEqual(Number(apt1.consultation_fee), 600);
    console.log("✓ TEST 1 Passed: Patient booked appointment with pending initial status and computed slot times.");

    // TEST 2: Staff Booking on Behalf of Patient (Lesson 6.4)
    console.log("TEST 2: Staff member books a video consultation appointment on behalf of patient...");
    const staffBookingRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        patient_id: patientId,
        appointment_date: nextFridayStr,
        appointment_time: "10:30:00",
        appointment_type: "consultation",
        appointment_mode: "video_consultation",
        reason: "Follow-up video consultation booked by front desk",
        payment_method: "upi",
      },
      staffToken
    );

    // Note: Duplicate check: patient already has an active appointment on nextFridayStr with doctorId!
    // Conflict check should reject because patient cannot have 2 active bookings with same doctor on same day
    assert.strictEqual(staffBookingRes.status, 409);
    assert.ok(staffBookingRes.body.message.includes("already have an active appointment"));
    console.log("✓ TEST 2 Passed: Duplicate active appointment for patient on same day blocked.");

    // Create Patient 2 for staff booking
    const [pat2Res] = await pool.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
       VALUES (?, 'David Lee', ?, ?, '+91-9876500025', 'active')`,
      [roleMap.patient, `pat63_b_${stamp}@test.com`, passHash]
    );
    const patient2Id = pat2Res.insertId;

    const staffBooking2 = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        patient_id: patient2Id,
        appointment_date: nextFridayStr,
        appointment_time: "10:30:00",
        appointment_type: "consultation",
        appointment_mode: "video_consultation",
        reason: "Walk-in registration at reception",
        payment_method: "cash",
      },
      staffToken
    );

    assert.strictEqual(staffBooking2.status, 201);
    const apt2 = staffBooking2.body.data;
    assert.strictEqual(apt2.patient_id, patient2Id);
    assert.strictEqual(apt2.booked_by_staff_id, staffId);
    assert.strictEqual(apt2.status, "confirmed"); // Front-desk intake defaults to confirmed
    assert.strictEqual(apt2.appointment_mode, "video_consultation");
    console.log("✓ TEST 2.1 Passed: Staff booking completed with booked_by_staff_id and confirmed status.");

    // TEST 3: Validation of Invalid Types & Modes (Lesson 6.3)
    console.log("TEST 3: Validating appointment_type and appointment_mode enums...");
    const badTypeRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: nextFridayStr,
        appointment_time: "11:00:00",
        appointment_type: "invalid_surgery_type",
      },
      patientToken
    );
    assert.strictEqual(badTypeRes.status, 400);
    assert.ok(badTypeRes.body.message.includes("Invalid appointment_type"));

    const badModeRes = await post(
      "/appointments",
      {
        hospital_id: hospitalId,
        department_id: departmentId,
        doctor_id: doctorId,
        appointment_date: nextFridayStr,
        appointment_time: "11:00:00",
        appointment_mode: "telepathic_mode",
      },
      patientToken
    );
    assert.strictEqual(badModeRes.status, 400);
    assert.ok(badModeRes.body.message.includes("Invalid appointment_mode"));
    console.log("✓ TEST 3 Passed: Invalid types and modes rejected.");

    console.log("\n=======================================================");
    console.log("ALL LESSONS 6.3 & 6.4 TESTS PASSED! (3 / 3)");
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
    setTimeout(() => process.exit(0), 100);
  })
  .catch(async (err) => {
    console.error("Lessons 6.3 & 6.4 Test Suite Failed:", err);
    await pool.end();
    setTimeout(() => process.exit(1), 100);
  });
