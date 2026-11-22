/**
 * Notification Service (Module 7)
 * Centralizes email delivery, outbox logging, duplicate prevention (idempotency),
 * bounded retries, and failure recovery.
 */

const pool = require("../db");
const { sendEmail } = require("./emailService");
const templates = require("./emailTemplates");

/**
 * Dispatches an email notification with database audit & outbox recording.
 *
 * @param {Object} params
 * @param {string} params.recipientEmail
 * @param {number} [params.recipientUserId]
 * @param {number} [params.hospitalId]
 * @param {number} [params.appointmentId]
 * @param {string} params.notificationType
 * @param {string} params.subject
 * @param {string} params.bodyText
 * @param {string} [params.bodyHtml]
 * @param {string} [params.idempotencyKey]
 * @param {Object} [params.poolClient]
 * @returns {Promise<{ id: number, status: string, sent: boolean, duplicate: boolean }>}
 */
async function dispatchNotification({
  recipientEmail,
  recipientUserId = null,
  hospitalId = null,
  appointmentId = null,
  notificationType,
  subject,
  bodyText,
  bodyHtml = null,
  idempotencyKey = null,
  poolClient = null,
}) {
  const db = poolClient || pool;
  const normalizedEmail = String(recipientEmail || "").trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    console.warn(`[Notification] Skipped dispatch: Invalid recipient email '${recipientEmail}'`);
    return { id: null, status: "failed", sent: false, error: "Invalid email address" };
  }

  // 1. Idempotency Check: Prevent duplicate sends
  if (idempotencyKey) {
    try {
      const [existing] = await db.execute(
        `SELECT id, status, provider_message_id, attempts
         FROM notifications
         WHERE idempotency_key = ?
         LIMIT 1`,
        [idempotencyKey]
      );

      if (existing.length > 0) {
        const record = existing[0];
        console.log(`[Notification] Idempotent hit: Notification '${idempotencyKey}' already recorded (status: ${record.status})`);
        return {
          id: record.id,
          status: record.status,
          sent: record.status === "sent",
          duplicate: true,
        };
      }
    } catch (checkErr) {
      console.warn("[Notification] Error checking idempotency key:", checkErr.message);
    }
  }

  // 2. Insert record into notifications table as 'pending'
  let notificationId = null;
  try {
    const [insertResult] = await db.execute(
      `INSERT INTO notifications
        (recipient_email, recipient_user_id, hospital_id, appointment_id,
         notification_type, subject, body_text, body_html, status,
         attempts, max_attempts, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, ?)`,
      [
        normalizedEmail,
        recipientUserId ? Number(recipientUserId) : null,
        hospitalId ? Number(hospitalId) : null,
        appointmentId ? Number(appointmentId) : null,
        notificationType,
        subject,
        bodyText,
        bodyHtml,
        idempotencyKey,
      ]
    );
    notificationId = insertResult.insertId;
  } catch (insertErr) {
    // If unique constraint violation on idempotency_key, handle race condition gracefully
    if (insertErr.code === "ER_DUP_ENTRY" && idempotencyKey) {
      console.log(`[Notification] Race condition avoided for key: ${idempotencyKey}`);
      return { id: null, status: "pending", sent: false, duplicate: true };
    }
    console.error("[Notification] Failed to record outbox notification:", insertErr.message);
    // Proceed to attempt send even if log fails, or abort safely
  }

  // 3. Attempt Delivery
  try {
    const result = await sendEmail({
      to: normalizedEmail,
      subject,
      text: bodyText,
      html: bodyHtml,
    });

    if (notificationId) {
      await pool.execute(
        `UPDATE notifications
         SET status = 'sent',
             attempts = attempts + 1,
             sent_at = NOW(),
             last_attempt_at = NOW(),
             provider_message_id = ?
         WHERE id = ?`,
        [result.messageId || null, notificationId]
      );
    }

    return {
      id: notificationId,
      status: "sent",
      sent: true,
      duplicate: false,
      messageId: result.messageId,
    };
  } catch (deliveryErr) {
    console.error(`[Notification] Delivery failure to ${normalizedEmail}:`, deliveryErr.message);

    if (notificationId) {
      const sanitizedError = String(deliveryErr.message || "Unknown delivery error").substring(0, 490);
      await pool.execute(
        `UPDATE notifications
         SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
             attempts = attempts + 1,
             last_attempt_at = NOW(),
             failed_at = CASE WHEN attempts + 1 >= max_attempts THEN NOW() ELSE NULL END,
             next_retry_at = CASE WHEN attempts + 1 < max_attempts THEN DATE_ADD(NOW(), INTERVAL 5 MINUTE) ELSE NULL END,
             error_message = ?
         WHERE id = ?`,
        [sanitizedError, notificationId]
      );
    }

    // Do NOT rethrow: email failures should not crash or abort the parent business operation
    return {
      id: notificationId,
      status: "failed",
      sent: false,
      error: deliveryErr.message,
    };
  }
}

/**
 * Manually retry a failed notification (Lesson 7.8)
 */
async function retryNotification(notificationId) {
  const [rows] = await pool.execute(
    `SELECT id, recipient_email, subject, body_text, body_html, status, attempts, max_attempts
     FROM notifications
     WHERE id = ?
     LIMIT 1`,
    [notificationId]
  );

  if (!rows.length) {
    throw new Error("Notification record not found");
  }

  const notification = rows[0];
  if (notification.status === "sent") {
    return { success: true, message: "Notification was already successfully delivered.", status: "sent" };
  }

  await pool.execute("UPDATE notifications SET status = 'processing' WHERE id = ?", [notificationId]);

  try {
    const result = await sendEmail({
      to: notification.recipient_email,
      subject: notification.subject,
      text: notification.body_text,
      html: notification.body_html,
    });

    await pool.execute(
      `UPDATE notifications
       SET status = 'sent',
           attempts = attempts + 1,
           sent_at = NOW(),
           last_attempt_at = NOW(),
           provider_message_id = ?,
           error_message = NULL
       WHERE id = ?`,
      [result.messageId || null, notificationId]
    );

    return {
      success: true,
      message: "Notification re-sent successfully.",
      status: "sent",
      messageId: result.messageId,
    };
  } catch (err) {
    const sanitized = String(err.message || "Retry failed").substring(0, 490);
    await pool.execute(
      `UPDATE notifications
       SET status = 'failed',
           attempts = attempts + 1,
           last_attempt_at = NOW(),
           failed_at = NOW(),
           error_message = ?
       WHERE id = ?`,
      [sanitized, notificationId]
    );

    return {
      success: false,
      message: `Retry failed: ${err.message}`,
      status: "failed",
    };
  }
}

// ===========================================================================
// Higher-Level Domain Notification Triggers
// ===========================================================================

/**
 * Lesson 7.1: Doctor or Staff Account Registration Pending Review
 */
async function notifyAccountPendingReview({ user, role, hospitalName, departmentName }) {
  if (!user || !user.email) return;

  const { subject, text, html } = templates.accountPendingReviewTemplate({
    fullName: user.full_name,
    role,
    hospitalName,
    departmentName,
  });

  return dispatchNotification({
    recipientEmail: user.email,
    recipientUserId: user.id,
    hospitalId: user.hospital_id,
    notificationType: "account_pending_review",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `pending_review_${user.id}`,
  });
}

/**
 * Lesson 7.1: Account Approved
 */
async function notifyAccountApproved({ user, role, hospitalName, loginUrl }) {
  if (!user || !user.email) return;

  const { subject, text, html } = templates.accountApprovedTemplate({
    fullName: user.full_name,
    role,
    hospitalName,
    loginUrl,
  });

  return dispatchNotification({
    recipientEmail: user.email,
    recipientUserId: user.id,
    hospitalId: user.hospital_id,
    notificationType: "account_approved",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `account_approved_${user.id}_${Date.now()}`,
  });
}

/**
 * Lesson 7.2: Appointment Booking Received (Pending Review)
 */
async function notifyBookingReceived({
  appointment,
  patient,
  doctor,
  hospital,
  department,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.bookingReceivedTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    departmentName: department?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    appointmentType: appointment.appointment_type,
    appointmentMode: appointment.appointment_mode,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "booking_received",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `booking_received_${appointment.id}`,
  });
}

/**
 * Lesson 7.2: Appointment Booking Confirmed
 */
async function notifyBookingConfirmed({
  appointment,
  patient,
  doctor,
  hospital,
  department,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.bookingConfirmedTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    departmentName: department?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    appointmentType: appointment.appointment_type,
    appointmentMode: appointment.appointment_mode,
    consultationFee: appointment.consultation_fee,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "booking_confirmed",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `booking_confirmed_${appointment.id}`,
  });
}

/**
 * Lesson 7.3: Appointment Cancelled
 */
async function notifyAppointmentCancelled({
  appointment,
  patient,
  doctor,
  hospital,
  cancellationReason,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.appointmentCancelledTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    cancellationReason,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "appointment_cancelled",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `appointment_cancelled_${appointment.id}_${Date.now()}`,
  });
}

/**
 * Lesson 7.3: Appointment Rescheduled
 */
async function notifyAppointmentRescheduled({
  appointment,
  patient,
  doctor,
  hospital,
  department,
  previousDate,
  previousTime,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.appointmentRescheduledTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    departmentName: department?.name,
    doctorName: doctor?.full_name,
    previousDate,
    previousTime,
    newDate: appointment.appointment_date,
    newTime: appointment.appointment_time,
    appointmentMode: appointment.appointment_mode,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "appointment_rescheduled",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `rescheduled_${appointment.id}_${appointment.appointment_date}_${appointment.appointment_time}`,
  });
}

/**
 * Lesson 7.4: Appointment Reminder
 */
async function notifyAppointmentReminder({
  appointment,
  patient,
  doctor,
  hospital,
  department,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.appointmentReminderTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    departmentName: department?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    appointmentMode: appointment.appointment_mode,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "appointment_reminder",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `reminder_${appointment.id}_${appointment.appointment_date}`,
  });
}

/**
 * Lesson 7.5: Appointment Completed
 */
async function notifyAppointmentCompleted({
  appointment,
  patient,
  doctor,
  hospital,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.appointmentCompletedTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    hospitalName: hospital?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "appointment_completed",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `completed_${appointment.id}`,
  });
}

/**
 * Lesson 7.5: Follow-up Appointment Scheduled
 */
async function notifyFollowUpScheduled({
  appointment,
  previousAppointmentNumber,
  patient,
  doctor,
  hospital,
}) {
  if (!patient || !patient.email) return;

  const { subject, text, html } = templates.followUpScheduledTemplate({
    patientName: patient.full_name,
    appointmentNumber: appointment.appointment_number,
    previousAppointmentNumber,
    hospitalName: hospital?.name,
    doctorName: doctor?.full_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
  });

  return dispatchNotification({
    recipientEmail: patient.email,
    recipientUserId: patient.id,
    hospitalId: appointment.hospital_id,
    appointmentId: appointment.id,
    notificationType: "follow_up_scheduled",
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `follow_up_${appointment.id}`,
  });
}

module.exports = {
  dispatchNotification,
  retryNotification,
  notifyAccountPendingReview,
  notifyAccountApproved,
  notifyBookingReceived,
  notifyBookingConfirmed,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
  notifyAppointmentReminder,
  notifyAppointmentCompleted,
  notifyFollowUpScheduled,
};
