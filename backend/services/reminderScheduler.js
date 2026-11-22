/**
 * Appointment Reminder Scheduler Service (Lesson 7.4)
 * Runs autonomously in the Node.js backend.
 * Identifies eligible upcoming confirmed appointments within the configured reminder window,
 * re-verifies status prior to delivery, enforces idempotency, and records delivery tracking.
 */

const pool = require("../db");
const { notifyAppointmentReminder } = require("./notificationService");

let schedulerInterval = null;

/**
 * Scans and delivers reminders for eligible upcoming appointments.
 * Can be called automatically by the scheduler or invoked manually via API.
 *
 * @param {Object} options
 * @param {number} [options.daysAhead=2]
 * @returns {Promise<{ processedCount: number, sentCount: number, skippedCount: number, appointmentIds: number[] }>}
 */
async function processUpcomingAppointmentReminders({ daysAhead = 2 } = {}) {
  const windowDays = Math.max(1, Number(daysAhead) || 2);
  let sentCount = 0;
  let skippedCount = 0;
  const processedIds = [];

  const [eligibleAppointments] = await pool.execute(
    `SELECT a.id,
            a.appointment_number,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            a.appointment_time,
            a.appointment_mode,
            a.appointment_type,
            a.hospital_id,
            a.patient_id,
            a.doctor_id,
            a.status,
            a.reminder_sent_at,
            h.name AS hospital_name,
            d.name AS department_name,
            doc.full_name AS doctor_name,
            doc.email AS doctor_email,
            pat.full_name AS patient_name,
            pat.email AS patient_email
     FROM appointments a
     JOIN hospitals h ON h.id = a.hospital_id
     LEFT JOIN departments d ON d.id = a.department_id
     JOIN users doc ON doc.id = a.doctor_id
     JOIN users pat ON pat.id = a.patient_id
     WHERE a.status = 'confirmed'
       AND a.reminder_sent_at IS NULL
       AND a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY a.appointment_date ASC, a.appointment_time ASC
     LIMIT 100`,
    [windowDays]
  );

  for (const appt of eligibleAppointments) {
    // 1. Mandatory Pre-Send Status Recheck (Lesson 7.4)
    // Ensures cancelled or rescheduled appointments are never reminded
    const [statusRows] = await pool.execute(
      "SELECT status, reminder_sent_at FROM appointments WHERE id = ? LIMIT 1",
      [appt.id]
    );

    if (
      !statusRows.length ||
      statusRows[0].status !== "confirmed" ||
      statusRows[0].reminder_sent_at !== null
    ) {
      skippedCount++;
      continue;
    }

    // 2. Mark reminder_sent_at to prevent concurrent duplicate reminder triggers
    await pool.execute(
      "UPDATE appointments SET reminder_sent_at = NOW() WHERE id = ?",
      [appt.id]
    );

    // 3. Dispatch reminder notification via outbox
    try {
      const patientInfo = {
        id: appt.patient_id,
        full_name: appt.patient_name,
        email: appt.patient_email,
      };
      const doctorInfo = {
        id: appt.doctor_id,
        full_name: appt.doctor_name,
        email: appt.doctor_email,
      };
      const hospitalInfo = { name: appt.hospital_name };
      const departmentInfo = { name: appt.department_name };

      await notifyAppointmentReminder({
        appointment: appt,
        patient: patientInfo,
        doctor: doctorInfo,
        hospital: hospitalInfo,
        department: departmentInfo,
      });

      sentCount++;
      processedIds.push(appt.id);
    } catch (sendErr) {
      console.error(`[ReminderScheduler] Failed to dispatch reminder for #${appt.appointment_number}:`, sendErr.message);
      // Reset reminder_sent_at so it can be retried on next scheduler cycle
      await pool.execute("UPDATE appointments SET reminder_sent_at = NULL WHERE id = ?", [appt.id]);
      skippedCount++;
    }
  }

  return {
    processedCount: eligibleAppointments.length,
    sentCount,
    skippedCount,
    appointmentIds: processedIds,
  };
}

/**
 * Initializes autonomous background scheduler in backend process
 */
function startReminderScheduler(intervalMs = 15 * 60 * 1000) {
  if (schedulerInterval) return;

  console.log(`[ReminderScheduler] Initializing background reminder scheduler (Interval: ${intervalMs / 1000}s)`);

  // Initial scan upon startup
  setTimeout(() => {
    processUpcomingAppointmentReminders().catch((err) =>
      console.error("[ReminderScheduler] Startup scan error:", err.message)
    );
  }, 5000);

  schedulerInterval = setInterval(() => {
    processUpcomingAppointmentReminders().catch((err) =>
      console.error("[ReminderScheduler] Periodic scan error:", err.message)
    );
  }, intervalMs);
}

function stopReminderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[ReminderScheduler] Background reminder scheduler stopped");
  }
}

module.exports = {
  processUpcomingAppointmentReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
