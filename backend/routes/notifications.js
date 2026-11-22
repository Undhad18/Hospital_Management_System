/**
 * Notification Management Router (Module 7)
 * Provides administrative oversight, outbox inspection, failure retries,
 * and manual reminder trigger with strict hospital-level data isolation.
 */

const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { retryNotification } = require("../services/notificationService");
const { processUpcomingAppointmentReminders } = require("../services/reminderScheduler");
const { logAudit } = require("../services/auditService");

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/notifications
 * Administrative view of notification delivery history
 */
router.get("/", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Hospital Isolation (hospital_admin can only view their hospital's notifications)
    if (req.user.role === "hospital_admin") {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital is assigned to your account",
        });
      }
      conditions.push("n.hospital_id = ?");
      params.push(req.user.hospitalId);
    }

    if (status && ["pending", "processing", "sent", "failed"].includes(status)) {
      conditions.push("n.status = ?");
      params.push(status);
    }

    if (type && typeof type === "string" && type.trim()) {
      conditions.push("n.notification_type = ?");
      params.push(type.trim());
    }

    if (search && typeof search === "string" && search.trim()) {
      conditions.push("(n.recipient_email LIKE ? OR n.subject LIKE ? OR n.provider_message_id LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM notifications n ${whereClause}`,
      params
    );
    const totalRecords = countRows[0]?.total || 0;

    // Fetch records
    const selectSql = `
      SELECT n.id,
             n.recipient_email,
             n.recipient_user_id,
             n.hospital_id,
             n.appointment_id,
             n.notification_type,
             n.subject,
             n.status,
             n.attempts,
             n.max_attempts,
             n.last_attempt_at,
             n.sent_at,
             n.failed_at,
             n.next_retry_at,
             n.provider_message_id,
             n.error_message,
             n.created_at,
             h.name AS hospital_name,
             u.full_name AS recipient_name,
             apt.appointment_number
      FROM notifications n
      LEFT JOIN hospitals h ON h.id = n.hospital_id
      LEFT JOIN users u ON u.id = n.recipient_user_id
      LEFT JOIN appointments apt ON apt.id = n.appointment_id
      ${whereClause}
      ORDER BY n.id DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await pool.execute(selectSql, params);

    return res.json({
      success: true,
      total: totalRecords,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalRecords / limitNum),
      total_pages: Math.ceil(totalRecords / limitNum),
      data: rows,
    });
  } catch (error) {
    console.error("Fetch notifications error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve notification history",
    });
  }
});

/**
 * POST /api/notifications/:id/retry
 * Re-trigger a failed notification
 */
router.post("/:id/retry", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
      return res.status(400).json({ success: false, message: "Invalid notification ID" });
    }

    // Hospital Isolation check
    if (req.user.role === "hospital_admin") {
      const [check] = await pool.execute("SELECT hospital_id FROM notifications WHERE id = ? LIMIT 1", [
        notificationId,
      ]);
      if (!check.length || Number(check[0].hospital_id) !== Number(req.user.hospitalId)) {
        return res.status(403).json({ success: false, message: "Access restricted to your hospital's notifications" });
      }
    }

    const result = await retryNotification(notificationId);

    await logAudit({
      actorId: req.user.id,
      action: "RETRY_NOTIFICATION",
      targetType: "notification",
      targetId: notificationId,
      details: { outcome: result.status },
      ipAddress: req.ip,
    });

    return res.json({
      success: result.success,
      message: result.message,
      status: result.status,
    });
  } catch (error) {
    console.error("Retry notification error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retry notification delivery",
    });
  }
});

/**
 * POST /api/notifications/run-reminders
 * Trigger reminder batch job on-demand
 */
router.post("/run-reminders", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const { days_ahead = 2 } = req.body || {};
    const result = await processUpcomingAppointmentReminders({ daysAhead: days_ahead });

    await logAudit({
      actorId: req.user.id,
      action: "MANUAL_REMINDERS_TRIGGERED",
      targetType: "system",
      details: result,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `Reminder processing completed. ${result.sentCount} reminders sent.`,
      processedCount: result.sentCount,
      result,
    });
  } catch (error) {
    console.error("Run reminders error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to process reminders",
    });
  }
});

module.exports = router;
