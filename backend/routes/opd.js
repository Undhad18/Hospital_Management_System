const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const {
  notifyAppointmentCompleted,
} = require("../services/notificationService");

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/opd/schedule?date=YYYY-MM-DD
 * Returns the authorized hospital/doctor relevant OPD appointments for the requested date.
 */
router.get("/schedule", async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split("T")[0];
    let sql = `
      SELECT
        a.id,
        a.appointment_number,
        a.patient_id,
        a.hospital_id,
        a.department_id,
        a.doctor_id,
        DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
        a.appointment_time,
        a.appointment_type,
        a.appointment_mode,
        a.start_time,
        a.end_time,
        a.status,
        a.reason,
        a.queue_number,
        DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time,
        a.check_in_time AS raw_check_in_time,
        h.name AS hospital_name,
        d.name AS department_name,
        doc.full_name AS doctor_name,
        pat.full_name AS patient_name,
        pat.phone AS patient_phone,
        pat.email AS patient_email
      FROM appointments a
      LEFT JOIN hospitals h ON h.id = a.hospital_id
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN users doc ON doc.id = a.doctor_id
      LEFT JOIN users pat ON pat.id = a.patient_id
      WHERE (a.appointment_date = ? OR DATE_FORMAT(a.appointment_date, '%Y-%m-%d') = ?)
    `;
    const params = [today, today];

    if (req.user.role === "doctor") {
      sql += " AND a.doctor_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      sql += " AND a.hospital_id = ?";
      params.push(req.user.hospitalId);
    }

    sql += " ORDER BY a.start_time ASC, a.id ASC";

    const [appointments] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    console.error("OPD schedule error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve OPD schedule." });
  }
});

/**
 * GET /api/opd/queue?date=YYYY-MM-DD
 * Returns the queue entries and persisted statuses required by the interface.
 */
router.get("/queue", async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split("T")[0];
    let sql = `
      SELECT
        a.id,
        a.appointment_number,
        a.queue_number,
        a.patient_id,
        a.doctor_id,
        a.department_id,
        a.status,
        DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time,
        a.check_in_time AS raw_check_in_time,
        a.appointment_time,
        pat.full_name AS patient_name,
        doc.full_name AS doctor_name,
        d.name AS department_name
      FROM appointments a
      JOIN users pat ON pat.id = a.patient_id
      JOIN users doc ON doc.id = a.doctor_id
      JOIN departments d ON d.id = a.department_id
      WHERE (a.appointment_date = ? OR DATE_FORMAT(a.appointment_date, '%Y-%m-%d') = ?)
        AND a.status IN ('in_waiting', 'in_progress', 'completed')
    `;
    const params = [today, today];

    if (req.user.role === "doctor") {
      sql += " AND a.doctor_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      sql += " AND a.hospital_id = ?";
      params.push(req.user.hospitalId);
    }

    sql += " ORDER BY a.check_in_time ASC, a.id ASC";

    const [queueRows] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: queueRows.length,
      data: queueRows,
    });
  } catch (error) {
    console.error("OPD queue error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve OPD queue." });
  }
});

/**
 * Helper: transition clinical status safely
 */
async function transitionClinicalStatus(req, res, targetStatus, customReason = "") {
  try {
    const appointmentId = Number(req.params.id);
    const { reason = customReason } = req.body || {};

    const [rows] = await pool.execute(
      `SELECT id, patient_id, hospital_id, doctor_id, status, queue_number, check_in_time,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const currentApt = rows[0];

    // Authorization check
    if (req.user.role === "doctor" && Number(currentApt.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "You can only update your assigned appointments." });
    }
    if ((req.user.role === "staff" || req.user.role === "hospital_admin") && Number(currentApt.hospital_id) !== Number(req.user.hospitalId)) {
      return res.status(403).json({ success: false, message: "Access restricted to your hospital." });
    }

    // Lesson 8.8: A consultation must be submitted before the appointment can be marked as completed
    if (targetStatus === "completed") {
      const [consultationCheck] = await pool.execute(
        `SELECT id, status FROM consultations WHERE appointment_id = ? LIMIT 1`,
        [appointmentId]
      );
      if (!consultationCheck.length || consultationCheck[0].status !== "submitted") {
        return res.status(400).json({
          success: false,
          message: "A consultation must be successfully submitted before the appointment can be marked as completed.",
        });
      }
    }

    // Assign sequential token if entering waiting queue and currently unassigned
    let queueNumber = currentApt.queue_number;
    if (targetStatus === "in_waiting" && !queueNumber) {
      const [qRows] = await pool.execute(
        `SELECT MAX(CAST(SUBSTRING(queue_number, 3) AS UNSIGNED)) AS max_queue_num,
                COUNT(*) AS total_checked_in
         FROM appointments
         WHERE hospital_id = ?
           AND (appointment_date = ? OR DATE_FORMAT(appointment_date, '%Y-%m-%d') = ?)
           AND queue_number LIKE 'Q-%'`,
        [currentApt.hospital_id, currentApt.appointment_date, currentApt.appointment_date]
      );
      const nextCount = Math.max(Number(qRows[0]?.max_queue_num) || 0, Number(qRows[0]?.total_checked_in) || 0) + 1;
      queueNumber = `Q-${String(nextCount).padStart(3, "0")}`;
    }

    let updateSql = "UPDATE appointments SET status = ?, status_changed_by = ?";
    const updateParams = [targetStatus, req.user.id];

    if (queueNumber && !currentApt.queue_number) {
      updateSql += ", queue_number = ?, check_in_time = CURRENT_TIMESTAMP, checked_in_by = ?";
      updateParams.push(queueNumber, req.user.id);
    } else if (targetStatus === "in_progress" && !currentApt.check_in_time) {
      updateSql += ", check_in_time = CURRENT_TIMESTAMP";
    }

    if (targetStatus === "admitted") {
      updateSql += ", reason = CONCAT(IFNULL(reason, ''), ' [Admitted: ', ?, ']')";
      updateParams.push((reason || "Admitted to inpatient care").trim());
    }

    updateSql += " WHERE id = ?";
    updateParams.push(appointmentId);

    await pool.execute(updateSql, updateParams);

    await logAudit(
      req.user.id,
      "OPD_STATUS_TRANSITION",
      "appointment",
      appointmentId,
      { previous_status: currentApt.status, new_status: targetStatus, reason },
      req.ip
    );

    const [updatedRows] = await pool.execute(
      `SELECT a.id, a.appointment_number, a.queue_number, a.status,
              DATE_FORMAT(a.check_in_time, '%r') AS check_in_time_12h,
              DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time_24h,
              a.check_in_time,
              pat.full_name AS patient_name,
              doc.full_name AS doctor_name,
              d.name AS department_name
       FROM appointments a
       JOIN users pat ON pat.id = a.patient_id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN departments d ON d.id = a.department_id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    return res.json({
      success: true,
      message: `Appointment status updated to '${targetStatus}'.`,
      status: targetStatus,
      data: updatedRows[0] || { id: appointmentId, status: targetStatus, queue_number: queueNumber },
    });
  } catch (error) {
    console.error("Clinical transition error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process clinical status transition." });
  }
}

/**
 * POST /api/opd/appointments/:id/start-consultation
 */
router.post("/appointments/:id/start-consultation", (req, res) => {
  return transitionClinicalStatus(req, res, "in_progress");
});

/**
 * POST /api/opd/appointments/:id/complete-consultation
 */
router.post("/appointments/:id/complete-consultation", (req, res) => {
  return transitionClinicalStatus(req, res, "completed");
});

/**
 * POST /api/opd/appointments/:id/admit
 */
router.post("/appointments/:id/admit", (req, res) => {
  return transitionClinicalStatus(req, res, "admitted", "Admitted to inpatient care");
});

/**
 * POST /api/opd/appointments/:id/waiting
 */
router.post("/appointments/:id/waiting", (req, res) => {
  return transitionClinicalStatus(req, res, "in_waiting");
});

module.exports = router;
