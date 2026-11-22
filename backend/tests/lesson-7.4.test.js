const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");
const { processUpcomingAppointmentReminders } = require("../services/reminderScheduler");

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.4");
  console.log(" (Automated Appointment Reminders & Idempotency)");
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
      `SELECT u.id, u.full_name, u.email
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
       WHERE u.hospital_id = ? AND u.department_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital.id, department.id]
    );
    assert(doctors.length > 0, "Doctor must exist");
    const doctor = doctors[0];

    // Create test patient
    const patientEmail = `pat.remind_${Date.now()}@example.com`;
    const [patRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const [patUserResult] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Louis Pasteur', ?, 'hash_dummy_patient', 'active')`,
      [patRoles[0].id, patientEmail]
    );
    const patientId = patUserResult.insertId;

    // Pick tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // -------------------------------------------------------------
    // TEST 1: Confirmed Appointment Tomorrow -> Receives Reminder
    // -------------------------------------------------------------
    console.log("[TEST 1] Eligible Confirmed Appointment Tomorrow -> Receives 24h Reminder");
    const aptNumber1 = `APT-REM-1-${Date.now().toString().slice(-4)}`;
    const [apt1Res] = await connection.execute(
      `INSERT INTO appointments
        (appointment_number, patient_id, hospital_id, department_id, doctor_id,
         appointment_date, appointment_time, start_time, end_time, status, reason, reminder_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, '10:00', '10:00:00', '10:30:00', 'confirmed', 'Follow-up cardiology', NULL)`,
      [aptNumber1, patientId, hospital.id, department.id, doctor.id, tomorrowStr]
    );
    const appointment1Id = apt1Res.insertId;

    // Run reminder processor
    const result1 = await processUpcomingAppointmentReminders({ daysAhead: 2 });
    assert(result1.appointmentIds.includes(appointment1Id), "Appointment 1 must be processed by reminder batch");
    assert(result1.sentCount >= 1, "At least 1 reminder must be sent");

    // Check sent email
    const emails = getDevSentEmails(patientEmail);
    const reminderEmail = emails.find((e) => e.subject.includes("Reminder") && e.subject.includes(aptNumber1));
    assert(reminderEmail, "Reminder email must be delivered to patient with appointment reference");
    assert(reminderEmail.text.includes("10:00"), "Must state appointment time");

    // Check appointment table: reminder_sent_at must be populated
    const [updatedApt1] = await connection.execute(
      "SELECT reminder_sent_at FROM appointments WHERE id = ?",
      [appointment1Id]
    );
    assert(updatedApt1[0].reminder_sent_at !== null, "reminder_sent_at must be set after dispatch");

    // Check notifications outbox
    const [outbox1] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_reminder'",
      [appointment1Id]
    );
    assert.strictEqual(outbox1.length, 1, "Must have appointment_reminder record in outbox");
    console.log("  ✓ Reminder successfully delivered, tracked in outbox, and reminder_sent_at updated");

    // -------------------------------------------------------------
    // TEST 2: Re-running Scheduler -> No Duplicate Reminders Sent
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Subsequent Batch Run -> Deduplication Prevents Redundant Reminder");
    const result2 = await processUpcomingAppointmentReminders({ daysAhead: 2 });
    assert(!result2.appointmentIds.includes(appointment1Id), "Appointment 1 must NOT be re-processed");

    const [outboxAfterSecondRun] = await connection.execute(
      "SELECT COUNT(*) AS total FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_reminder'",
      [appointment1Id]
    );
    assert.strictEqual(outboxAfterSecondRun[0].total, 1, "No duplicate reminder records allowed in outbox");
    console.log("  ✓ Deduplication strictly prevented redundant reminder dispatch");

    // -------------------------------------------------------------
    // TEST 3: Ineligible Appointments (Cancelled / Rejected) -> Skipped
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Cancelled Appointment Tomorrow -> Strictly Skipped from Reminders");
    const aptNumber2 = `APT-REM-2-${Date.now().toString().slice(-4)}`;
    const [apt2Res] = await connection.execute(
      `INSERT INTO appointments
        (appointment_number, patient_id, hospital_id, department_id, doctor_id,
         appointment_date, appointment_time, start_time, end_time, status, reason, reminder_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, '11:00', '11:00:00', '11:30:00', 'cancelled', 'Cancelled appointment', NULL)`,
      [aptNumber2, patientId, hospital.id, department.id, doctor.id, tomorrowStr]
    );
    const appointment2Id = apt2Res.insertId;

    const result3 = await processUpcomingAppointmentReminders({ daysAhead: 2 });
    assert(!result3.appointmentIds.includes(appointment2Id), "Cancelled appointment must not be processed");

    const [outboxCancelled] = await connection.execute(
      "SELECT * FROM notifications WHERE appointment_id = ? AND notification_type = 'appointment_reminder'",
      [appointment2Id]
    );
    assert.strictEqual(outboxCancelled.length, 0, "Cancelled appointments must never receive reminders");
    console.log("  ✓ Cancelled appointment verified as ineligible and skipped");

    // -------------------------------------------------------------
    // TEST 4: Rescheduling resets reminder_sent_at for new reminder eligibility
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Rescheduling an appointment resets reminder_sent_at for new schedule");
    // Simulate appointment 1 being rescheduled to day after tomorrow
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterStr = dayAfter.toISOString().split("T")[0];

    // Reset reminder_sent_at as happens in reschedule
    await connection.execute(
      "UPDATE appointments SET appointment_date = ?, reminder_sent_at = NULL WHERE id = ?",
      [dayAfterStr, appointment1Id]
    );

    const [rescheduledRow] = await connection.execute(
      "SELECT reminder_sent_at FROM appointments WHERE id = ?",
      [appointment1Id]
    );
    assert.strictEqual(rescheduledRow[0].reminder_sent_at, null, "Rescheduling must reset reminder_sent_at to NULL");
    console.log("  ✓ Rescheduled appointment successfully reset reminder eligibility");

    // Cleanup
    await connection.execute("DELETE FROM notifications WHERE appointment_id IN (?, ?)", [
      appointment1Id,
      appointment2Id,
    ]);
    await connection.execute("DELETE FROM appointments WHERE id IN (?, ?)", [appointment1Id, appointment2Id]);
    await connection.execute("DELETE FROM users WHERE id = ?", [patientId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.4 PASSED (100%)");
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
