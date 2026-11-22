const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.2");
  console.log(" (Appointment Booking Confirmation & Received Emails)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch active Hospital, Department, Doctor, and Patient
    const [hospitals] = await connection.execute(
      "SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY id ASC LIMIT 1"
    );
    assert(hospitals.length > 0, "Hospital must exist");
    const hospital = hospitals[0];

    const [depts] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital.id]
    );
    assert(depts.length > 0, "Department must exist");
    const department = depts[0];

    // Fetch active doctor
    const [doctors] = await connection.execute(
      `SELECT u.id, u.full_name, u.email
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
       WHERE u.hospital_id = ? AND u.department_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital.id, department.id]
    );
    assert(doctors.length > 0, "Doctor must exist in department");
    const doctor = doctors[0];

    // Ensure doctor schedule exists for booking
    await connection.execute(
      `INSERT INTO doctor_schedules
        (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
       VALUES (?, ?, 'monday', '09:00:00', '17:00:00', 30, TRUE)
       ON DUPLICATE KEY UPDATE is_available = TRUE`,
      [doctor.id, hospital.id]
    );
    await connection.execute(
      `INSERT INTO doctor_schedules
        (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
       VALUES (?, ?, 'tuesday', '09:00:00', '17:00:00', 30, TRUE)
       ON DUPLICATE KEY UPDATE is_available = TRUE`,
      [doctor.id, hospital.id]
    );
    await connection.execute(
      `INSERT INTO doctor_schedules
        (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
       VALUES (?, ?, 'wednesday', '09:00:00', '17:00:00', 30, TRUE)
       ON DUPLICATE KEY UPDATE is_available = TRUE`,
      [doctor.id, hospital.id]
    );

    // Create completed patient
    const patientEmail = `pat.m7_${Date.now()}@example.com`;
    const [patRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const [patUserResult] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Marie Curie', ?, 'hash_dummy_patient', 'active')`,
      [patRoles[0].id, patientEmail]
    );
    const patientId = patUserResult.insertId;

    await connection.execute(
      `INSERT INTO patient_profiles (user_id, dob, gender, is_profile_completed)
       VALUES (?, '1990-05-15', 'female', TRUE)`,
      [patientId]
    );

    const patientToken = jwt.sign(
      { sub: patientId, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Fetch Staff token for staff booking
    const [staffUsers] = await connection.execute(
      `SELECT u.id, u.hospital_id, u.token_version, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'staff'
       WHERE u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital.id]
    );
    assert(staffUsers.length > 0, "Staff user must exist");
    const staffUser = staffUsers[0];
    const staffToken = jwt.sign(
      { sub: staffUser.id, role: staffUser.role, hospitalId: staffUser.hospital_id, tokenVersion: staffUser.token_version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Pick target future booking date (using timestamp offset for clean slot isolation)
    const offsetDays = 14 + (Math.floor(Date.now() / 1000) % 30);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offsetDays);
    while (targetDate.getDay() !== 1 && targetDate.getDay() !== 2) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const dateStr = targetDate.toISOString().split("T")[0];

    // Clean any prior bookings for doctor on this slot
    await connection.execute(
      "DELETE FROM appointments WHERE doctor_id = ? AND appointment_date = ?",
      [doctor.id, dateStr]
    );

    // -------------------------------------------------------------
    // TEST 1: Patient Self-Booking -> "Booking Request Received" Email
    // -------------------------------------------------------------
    console.log("[TEST 1] Patient Self-Booking -> Dispatches 'Booking Request Received' Email");
    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        hospital_id: hospital.id,
        department_id: department.id,
        doctor_id: doctor.id,
        appointment_date: dateStr,
        appointment_time: "09:00",
        appointment_type: "consultation",
        appointment_mode: "in_person",
        reason: "General cardiac checkup",
      }),
    });

    const bookData = await bookRes.json();
    assert.strictEqual(bookRes.status, 201, `Booking failed: ${JSON.stringify(bookData)}`);
    assert.strictEqual(bookData.data.status, "pending", "Patient self-booking must default to 'pending'");
    const appointment1Id = bookData.data.id;
    const aptNumber1 = bookData.data.appointment_number;

    await new Promise((r) => setTimeout(r, 400));

    const patientEmails = getDevSentEmails(patientEmail);
    assert(patientEmails.length > 0, "Patient must receive booking email");
    const receivedEmail = patientEmails.find((e) => e.subject.includes("Request Received") || e.subject.includes(aptNumber1));
    assert(receivedEmail, "Must contain reference number in subject or body");
    assert(receivedEmail.text.includes("Pending Review"), "Email must state appointment is Pending Review");
    assert(!receivedEmail.text.includes("has been officially confirmed"), "Must NOT state confirmed when pending");

    const [notifRows] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'booking_received'",
      [appointment1Id]
    );
    assert.strictEqual(notifRows.length, 1, "Must record booking_received in notifications outbox");
    console.log("  ✓ Booking received email dispatched with Pending Review status & outbox tracking");

    // -------------------------------------------------------------
    // TEST 2: Staff Transitions Status to Confirmed -> "Appointment Confirmed" Email
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Transition Pending -> Confirmed -> Dispatches 'Appointment Confirmed' Email");
    const confirmRes = await fetch(`${BASE_URL}/appointments/${appointment1Id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        status: "confirmed",
      }),
    });

    const confirmData = await confirmRes.json();
    assert.strictEqual(confirmRes.status, 200, `Confirm status failed: ${JSON.stringify(confirmData)}`);

    await new Promise((r) => setTimeout(r, 400));

    const patientEmailsAfterConfirm = getDevSentEmails(patientEmail);
    const confirmedEmail = patientEmailsAfterConfirm.find((e) => e.subject.includes("Appointment Confirmed"));
    assert(confirmedEmail, "Confirmed email must be sent to patient");
    assert(confirmedEmail.text.includes("officially confirmed"), "Email text must state confirmed");
    assert(confirmedEmail.text.includes(aptNumber1), "Confirmed email must have appointment reference");

    const [confirmedNotifRows] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'booking_confirmed'",
      [appointment1Id]
    );
    assert.strictEqual(confirmedNotifRows.length, 1, "Must record booking_confirmed in outbox");
    console.log("  ✓ Confirmation email dispatched when status transitioned to confirmed");

    // -------------------------------------------------------------
    // TEST 3: Staff Direct Booking -> Direct "Appointment Confirmed" Email
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Staff Direct Booking -> Dispatches 'Appointment Confirmed' Email directly");
    // Pick second future booking date for Test 3 (to respect duplicate constraint on same date)
    const targetDate2 = new Date(targetDate);
    targetDate2.setDate(targetDate2.getDate() + 1);
    while (targetDate2.getDay() !== 1 && targetDate2.getDay() !== 2 && targetDate2.getDay() !== 3) {
      targetDate2.setDate(targetDate2.getDate() + 1);
    }
    const dateStr2 = targetDate2.toISOString().split("T")[0];

    await connection.execute(
      "DELETE FROM appointments WHERE doctor_id = ? AND appointment_date = ?",
      [doctor.id, dateStr2]
    );

    const staffBookRes = await fetch(`${BASE_URL}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        patient_id: patientId,
        hospital_id: hospital.id,
        department_id: department.id,
        doctor_id: doctor.id,
        appointment_date: dateStr2,
        appointment_time: "10:00",
        appointment_type: "consultation",
        appointment_mode: "in_person",
        reason: "Follow-up triage consultation",
      }),
    });

    const staffBookData = await staffBookRes.json();
    assert.strictEqual(staffBookRes.status, 201, `Staff booking failed: ${JSON.stringify(staffBookData)}`);
    assert.strictEqual(staffBookData.data.status, "confirmed", "Staff bookings must default to 'confirmed'");
    const appointment2Id = staffBookData.data.id;

    await new Promise((r) => setTimeout(r, 400));

    const [staffAptNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'booking_confirmed'",
      [appointment2Id]
    );
    assert.strictEqual(staffAptNotif.length, 1, "Direct confirmed booking must have outbox record");
    console.log("  ✓ Direct staff booking immediately dispatched confirmed notification");

    // Cleanup
    await connection.execute("DELETE FROM notifications WHERE appointment_id IN (?, ?)", [
      appointment1Id,
      appointment2Id,
    ]);
    await connection.execute("DELETE FROM appointments WHERE id IN (?, ?)", [appointment1Id, appointment2Id]);
    await connection.execute("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [patientId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.2 PASSED (100%)");
    console.log("=================================================\n");
    process.exit(0);
  } finally {
    connection.release();
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
