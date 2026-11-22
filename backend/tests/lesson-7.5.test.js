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
  console.log(" RUNNING TESTS: Lesson 7.5");
  console.log(" (Appointment Completion & Follow-up Notifications)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Hospital, Department, Doctor
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
      `SELECT u.id, u.full_name, u.email, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
       WHERE u.hospital_id = ? AND u.department_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital.id, department.id]
    );
    assert(doctors.length > 0, "Doctor must exist");
    const doctor = doctors[0];

    const doctorToken = jwt.sign(
      { sub: doctor.id, role: "doctor", hospitalId: hospital.id, tokenVersion: doctor.token_version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create doctor profile if missing
    await connection.execute(
      `INSERT INTO doctor_profiles (user_id, consultation_fee)
       VALUES (?, 500.00)
       ON DUPLICATE KEY UPDATE consultation_fee = 500.00`,
      [doctor.id]
    );

    // Ensure schedules for weekdays
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
      await connection.execute(
        `INSERT INTO doctor_schedules
          (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
         VALUES (?, ?, ?, '09:00:00', '17:00:00', 30, TRUE)
         ON DUPLICATE KEY UPDATE is_available = TRUE`,
        [doctor.id, hospital.id, day]
      );
    }

    // Create test patient
    const patientEmail = `pat.complete_${Date.now()}@example.com`;
    const [patRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const [patUserResult] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Gregor Mendel', ?, 'hash_dummy_patient', 'active')`,
      [patRoles[0].id, patientEmail]
    );
    const patientId = patUserResult.insertId;

    await connection.execute(
      `INSERT INTO patient_profiles (user_id, dob, gender, is_profile_completed)
       VALUES (?, '1992-07-20', 'male', TRUE)`,
      [patientId]
    );

    const patientToken = jwt.sign(
      { sub: patientId, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Pick 2 future dates
    const offset = 25 + (Math.floor(Date.now() / 1000) % 15);
    const date1 = new Date();
    date1.setDate(date1.getDate() + offset);
    while (date1.getDay() !== 1 && date1.getDay() !== 2) date1.setDate(date1.getDate() + 1);
    const date1Str = date1.toISOString().split("T")[0];

    const date2 = new Date(date1);
    date2.setDate(date2.getDate() + 2);
    while (date2.getDay() !== 2 && date2.getDay() !== 3 && date2.getDay() !== 4) date2.setDate(date2.getDate() + 1);
    const date2Str = date2.toISOString().split("T")[0];

    // Clean slot
    await connection.execute(
      "DELETE FROM appointments WHERE doctor_id = ? AND appointment_date IN (?, ?)",
      [doctor.id, date1Str, date2Str]
    );

    // Create an in_progress appointment that can transition to completed
    const aptNumber1 = `APT-COMP-${Date.now().toString().slice(-6)}`;
    const [aptRes] = await connection.execute(
      `INSERT INTO appointments
        (appointment_number, patient_id, hospital_id, department_id, doctor_id,
         appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, '11:00', '11:00:00', '11:30:00', 'in_progress', 'Clinical examination')`,
      [aptNumber1, patientId, hospital.id, department.id, doctor.id, date1Str]
    );
    const appointment1Id = aptRes.insertId;

    // -------------------------------------------------------------
    // TEST 1: Doctor Transitions in_progress -> completed -> Dispatches Completion Email
    // -------------------------------------------------------------
    console.log("[TEST 1] Transition in_progress -> completed -> Dispatches Consultation Summary Email");

    // Module 8 prerequisite: Start and submit consultation
    await fetch(`${BASE_URL}/consultations/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({ appointment_id: appointment1Id }),
    });
    const [cRow] = await pool.query("SELECT id FROM consultations WHERE appointment_id = ?", [appointment1Id]);
    await fetch(`${BASE_URL}/consultations/${cRow[0].id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({
        chief_complaint: "General physical follow-up",
        examination_findings: "Normal findings, stable",
        diagnosis: "Routine checkup",
        treatment_plan: "Maintain healthy diet and hydration",
      }),
    });

    const completeRes = await fetch(`${BASE_URL}/appointments/${appointment1Id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        status: "completed",
      }),
    });

    const completeData = await completeRes.json();
    assert.strictEqual(completeRes.status, 200, `Complete failed: ${JSON.stringify(completeData)}`);

    await new Promise((r) => setTimeout(r, 400));

    const patientEmails = getDevSentEmails(patientEmail);
    const completedEmail = patientEmails.find((e) => e.subject.includes("Consultation Summary") || e.subject.includes(aptNumber1));
    assert(completedEmail, "Completion email must be dispatched to patient");
    assert(completedEmail.text.includes("is marked as completed"), "Email must state appointment is completed");
    assert(completedEmail.text.includes("General Care Guidance"), "Email must contain aftercare recommendations");

    const [completeNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_completed'",
      [appointment1Id]
    );
    assert.strictEqual(completeNotif.length, 1, "Must have appointment_completed outbox record");
    console.log("  ✓ Consultation completion email successfully delivered and tracked in outbox");

    // -------------------------------------------------------------
    // TEST 2: Schedule Follow-up Appointment via POST /api/appointments/follow-up
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Schedule Follow-up Appointment -> Dispatches Follow-up Notification Linked to Parent Visit");
    const followUpRes = await fetch(`${BASE_URL}/appointments/follow-up`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        previous_appointment_id: appointment1Id,
        appointment_date: date2Str,
        appointment_time: "10:30",
        reason: "Two-week recovery progress review",
      }),
    });

    const followUpData = await followUpRes.json();
    assert.strictEqual(followUpRes.status, 201, `Follow-up failed: ${JSON.stringify(followUpData)}`);
    const newAptId = followUpData.data.id;
    const newAptNumber = followUpData.data.appointment_number;
    assert.strictEqual(followUpData.data.follow_up_to_id, appointment1Id, "Must link to parent appointment");

    await new Promise((r) => setTimeout(r, 400));

    const patientEmailsAfterFollowUp = getDevSentEmails(patientEmail);
    const followUpEmail = patientEmailsAfterFollowUp.find((e) => e.subject.includes("Follow-up") && e.subject.includes(newAptNumber));
    assert(followUpEmail, "Follow-up email must be received by patient");
    assert(followUpEmail.text.includes(aptNumber1), "Must reference previous consultation code");
    assert(followUpEmail.text.includes(date2Str), "Must state follow-up date");

    const [followUpNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'follow_up_scheduled'",
      [newAptId]
    );
    assert.strictEqual(followUpNotif.length, 1, "Must have follow_up_scheduled outbox record");
    console.log("  ✓ Follow-up appointment email dispatched referencing parent appointment number");

    // -------------------------------------------------------------
    // TEST 3: Duplicate Status Transition Attempt -> No Duplicate Email
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Duplicate status change attempt on completed appointment -> Rejected & No Duplicate Outbox Record");
    const dupRes = await fetch(`${BASE_URL}/appointments/${appointment1Id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({ status: "completed" }),
    });
    // From completed, transitioning to completed is invalid in state machine
    assert(dupRes.status >= 400, "Should reject transition from completed to completed");

    const [dupCheckRows] = await connection.execute(
      "SELECT COUNT(*) AS total FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_completed'",
      [appointment1Id]
    );
    assert.strictEqual(dupCheckRows[0].total, 1, "Must never generate duplicate completion notification");
    console.log("  ✓ Idempotency protected against duplicate completion notification");

    // Cleanup
    await connection.execute("DELETE FROM notifications WHERE appointment_id IN (?, ?)", [
      appointment1Id,
      newAptId,
    ]);
    await connection.execute("DELETE FROM appointments WHERE id IN (?, ?)", [newAptId, appointment1Id]);
    await connection.execute("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [patientId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.5 PASSED (100%)");
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
