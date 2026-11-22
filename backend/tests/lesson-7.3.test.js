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
  console.log(" RUNNING TESTS: Lesson 7.3");
  console.log(" (Appointment Cancellation & Rescheduling Emails)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Hospital, Dept, Doctor
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

    const [doctors] = await connection.execute(
      `SELECT u.id, u.full_name, u.email
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
       WHERE u.hospital_id = ? AND u.department_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital.id, department.id]
    );
    assert(doctors.length > 0, "Doctor must exist");
    const doctor = doctors[0];

    // Ensure schedules for monday, tuesday, wednesday, thursday
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
      await connection.execute(
        `INSERT INTO doctor_schedules
          (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
         VALUES (?, ?, ?, '09:00:00', '17:00:00', 30, TRUE)
         ON DUPLICATE KEY UPDATE is_available = TRUE`,
        [doctor.id, hospital.id, day]
      );
    }

    // Create completed patient
    const patientEmail = `pat.cancel_${Date.now()}@example.com`;
    const [patRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const [patUserResult] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Charles Darwin', ?, 'hash_dummy_patient', 'active')`,
      [patRoles[0].id, patientEmail]
    );
    const patientId = patUserResult.insertId;

    await connection.execute(
      `INSERT INTO patient_profiles (user_id, dob, gender, is_profile_completed)
       VALUES (?, '1985-02-12', 'male', TRUE)`,
      [patientId]
    );

    const patientToken = jwt.sign(
      { sub: patientId, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Pick 2 future dates
    const offset = 20 + (Math.floor(Date.now() / 1000) % 20);
    const date1 = new Date();
    date1.setDate(date1.getDate() + offset);
    while (date1.getDay() !== 1 && date1.getDay() !== 2) date1.setDate(date1.getDate() + 1);
    const date1Str = date1.toISOString().split("T")[0];

    const date2 = new Date(date1);
    date2.setDate(date2.getDate() + 1);
    while (date2.getDay() !== 2 && date2.getDay() !== 3) date2.setDate(date2.getDate() + 1);
    const date2Str = date2.toISOString().split("T")[0];

    // Clean any prior bookings for test
    await connection.execute(
      "DELETE FROM appointments WHERE doctor_id = ? AND appointment_date IN (?, ?)",
      [doctor.id, date1Str, date2Str]
    );

    // Create an initial confirmed appointment for testing cancellation
    const [aptRes] = await connection.execute(
      `INSERT INTO appointments
        (appointment_number, patient_id, hospital_id, department_id, doctor_id,
         appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, '11:00', '11:00:00', '11:30:00', 'confirmed', 'Initial consultation')`,
      [`APT-CANC-${Date.now().toString().slice(-6)}`, patientId, hospital.id, department.id, doctor.id, date1Str]
    );
    const appointment1Id = aptRes.insertId;

    // -------------------------------------------------------------
    // TEST 1: Cancel Appointment via PATCH /api/appointments/:id/cancel
    // -------------------------------------------------------------
    console.log("[TEST 1] Cancel Appointment -> Dispatches Cancellation Email");
    const cancelRes = await fetch(`${BASE_URL}/appointments/${appointment1Id}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        reason: "Personal scheduling conflict",
      }),
    });

    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelRes.status, 200, `Cancel failed: ${JSON.stringify(cancelData)}`);

    await new Promise((r) => setTimeout(r, 400));

    const patientEmails = getDevSentEmails(patientEmail);
    const cancelEmail = patientEmails.find((e) => e.subject.includes("Appointment Cancelled"));
    assert(cancelEmail, "Cancellation email must be received by patient");
    assert(cancelEmail.text.includes("Personal scheduling conflict"), "Email must contain cancellation reason");
    assert(cancelEmail.text.includes(date1Str), "Email must contain original appointment date");

    const [cancelNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_cancelled'",
      [appointment1Id]
    );
    assert.strictEqual(cancelNotif.length, 1, "Must record appointment_cancelled in outbox");
    console.log("  ✓ Cancellation email dispatched with reason, original schedule, and outbox record");

    // -------------------------------------------------------------
    // TEST 2: Reschedule Appointment via PATCH /api/appointments/:id/reschedule
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Reschedule Appointment -> Dispatches Rescheduling Email with Old & New Schedules");
    // Create a second active confirmed appointment to reschedule
    const [apt2Res] = await connection.execute(
      `INSERT INTO appointments
        (appointment_number, patient_id, hospital_id, department_id, doctor_id,
         appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, '14:00', '14:00:00', '14:30:00', 'confirmed', 'Follow-up check')`,
      [`APT-RESCH-${Date.now().toString().slice(-6)}`, patientId, hospital.id, department.id, doctor.id, date1Str]
    );
    const appointment2Id = apt2Res.insertId;

    const rescheduleRes = await fetch(`${BASE_URL}/appointments/${appointment2Id}/reschedule`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        appointment_date: date2Str,
        appointment_time: "15:00",
        reason: "Prefer afternoon visit next day",
      }),
    });

    const rescheduleData = await rescheduleRes.json();
    assert.strictEqual(rescheduleRes.status, 200, `Reschedule failed: ${JSON.stringify(rescheduleData)}`);

    await new Promise((r) => setTimeout(r, 400));

    const patientEmailsAfterReschedule = getDevSentEmails(patientEmail);
    const reschedEmail = patientEmailsAfterReschedule.find((e) => e.subject.includes("Appointment Rescheduled"));
    assert(reschedEmail, "Reschedule email must be dispatched to patient");
    assert(reschedEmail.text.includes(date1Str), "Email must display previous date");
    assert(reschedEmail.text.includes(date2Str), "Email must display NEW scheduled date");

    const [reschedNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_rescheduled'",
      [appointment2Id]
    );
    assert.strictEqual(reschedNotif.length, 1, "Must record appointment_rescheduled in outbox");
    console.log("  ✓ Reschedule email dispatched displaying previous and updated schedule");

    // -------------------------------------------------------------
    // TEST 3: Failed cancellation on already cancelled appointment -> No duplicate email
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Repeat Cancellation on already cancelled appointment -> Rejected & No Duplicate Email");
    const repeatCancelRes = await fetch(`${BASE_URL}/appointments/${appointment1Id}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({ reason: "Duplicate cancel attempt" }),
    });

    assert.strictEqual(repeatCancelRes.status, 400, "Must reject repeat cancellation");
    const [cancelNotifsAfter] = await connection.execute(
      "SELECT COUNT(*) AS total FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_cancelled'",
      [appointment1Id]
    );
    assert.strictEqual(cancelNotifsAfter[0].total, 1, "Must NOT generate duplicate cancellation email on rejected request");
    console.log("  ✓ Rejected repeat cancellation did not dispatch duplicate notification");

    // Cleanup
    await connection.execute("DELETE FROM notifications WHERE appointment_id IN (?, ?)", [
      appointment1Id,
      appointment2Id,
    ]);
    await connection.execute("DELETE FROM appointments WHERE id IN (?, ?)", [appointment1Id, appointment2Id]);
    await connection.execute("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [patientId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.3 PASSED (100%)");
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
