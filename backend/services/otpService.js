const crypto = require("crypto");
const pool = require("../db");
const { sendEmail } = require("./emailService");
const { passwordResetOtpTemplate, registrationOtpTemplate } = require("./emailTemplates");

function hashOtp(otp) {
  const secret = process.env.JWT_SECRET || "default_hms_salt";
  return crypto.createHash("sha256").update(otp + secret).digest("hex");
}

/**
 * Generate, store, and dispatch a 6-digit secure OTP
 * @param {string} email
 * @param {'registration' | 'password_reset'} purpose
 */
async function generateAndSendOtp(email, purpose) {
  const normalizedEmail = email.trim().toLowerCase();

  // Rate limiting check: check if an OTP was generated within the last 60 seconds
  const [recentOtps] = await pool.execute(
    `SELECT created_at
     FROM otp_verifications
     WHERE email = ? AND purpose = ?
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedEmail, purpose]
  );

  if (recentOtps.length > 0) {
    const elapsedSeconds = (Date.now() - new Date(recentOtps[0].created_at).getTime()) / 1000;
    if (elapsedSeconds < 60) {
      const waitSeconds = Math.ceil(60 - elapsedSeconds);
      const error = new Error(`Please wait ${waitSeconds} seconds before requesting a new code.`);
      error.statusCode = 429;
      throw error;
    }
  }

  // Generate 6-digit numeric OTP cryptographically
  const otp = crypto.randomInt(100000, 1000000).toString();
  const tokenHash = hashOtp(otp);

  // Invalidate any previous unconsumed codes for this email and purpose
  await pool.execute(
    `UPDATE otp_verifications
     SET consumed = TRUE
     WHERE email = ? AND purpose = ? AND consumed = FALSE`,
    [normalizedEmail, purpose]
  );

  // Expiration: 10 minutes from now
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.execute(
    `INSERT INTO otp_verifications
       (email, purpose, token_hash, expires_at, attempts, max_attempts, consumed)
     VALUES (?, ?, ?, ?, 0, 5, FALSE)`,
    [normalizedEmail, purpose, tokenHash, expiresAt]
  );

  // Module 7 (Lesson 7.6 & 7.7): Prepare branded, responsive email content
  let emailData;
  if (purpose === "password_reset") {
    emailData = passwordResetOtpTemplate({
      email: normalizedEmail,
      otp,
      expiresMinutes: 10,
    });
  } else {
    emailData = registrationOtpTemplate({
      email: normalizedEmail,
      otp,
      expiresMinutes: 10,
    });
  }

  await sendEmail({
    to: normalizedEmail,
    subject: emailData.subject,
    text: emailData.text,
    html: emailData.html,
  });

  // Module 7: Log notification attempt into outbox with redacted OTP to guarantee security
  await pool.execute(
    `INSERT INTO notifications
       (recipient_email, notification_type, subject, body_text, status, attempts, sent_at, last_attempt_at)
     VALUES (?, ?, ?, ?, 'sent', 1, NOW(), NOW())`,
    [
      normalizedEmail,
      purpose === "password_reset" ? "password_reset_otp" : "registration_otp",
      emailData.subject,
      `A 6-digit verification code was dispatched for ${purpose}. [OTP Code Redacted For Security]`,
    ]
  ).catch(() => {});

  return {
    success: true,
    message: "A 6-digit verification code has been sent to your email.",
  };
}

/**
 * Validate a submitted OTP code
 * @param {string} email
 * @param {'registration' | 'password_reset'} purpose
 * @param {string} otpCode
 */
async function verifyOtp(email, purpose, otpCode) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedOtp = String(otpCode || "").trim();

  if (!trimmedOtp || trimmedOtp.length !== 6) {
    return {
      success: false,
      message: "Please enter a valid 6-digit verification code.",
    };
  }

  const [records] = await pool.execute(
    `SELECT id, token_hash, expires_at, attempts, max_attempts, consumed
     FROM otp_verifications
     WHERE email = ? AND purpose = ? AND consumed = FALSE
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedEmail, purpose]
  );

  if (!records.length) {
    return {
      success: false,
      message: "No active verification code was found. Please request a new code.",
    };
  }

  const record = records[0];

  // Expiration check
  if (new Date() > new Date(record.expires_at)) {
    await pool.execute(
      "UPDATE otp_verifications SET consumed = TRUE WHERE id = ?",
      [record.id]
    );
    return {
      success: false,
      message: "The verification code has expired. Please request a new code.",
    };
  }

  // Attempt limit check
  if (record.attempts >= record.max_attempts) {
    await pool.execute(
      "UPDATE otp_verifications SET consumed = TRUE WHERE id = ?",
      [record.id]
    );
    return {
      success: false,
      message: "Maximum verification attempts exceeded. Please request a new code.",
    };
  }

  const expectedHash = hashOtp(trimmedOtp);
  if (expectedHash !== record.token_hash) {
    const updatedAttempts = record.attempts + 1;
    await pool.execute(
      "UPDATE otp_verifications SET attempts = ? WHERE id = ?",
      [updatedAttempts, record.id]
    );

    const remaining = record.max_attempts - updatedAttempts;
    if (remaining <= 0) {
      await pool.execute(
        "UPDATE otp_verifications SET consumed = TRUE WHERE id = ?",
        [record.id]
      );
      return {
        success: false,
        message: "Too many incorrect attempts. This code is now invalid. Please request a new code.",
      };
    }

    return {
      success: false,
      message: `Invalid code. ${remaining} attempt(s) remaining.`,
    };
  }

  // Success: mark consumed
  await pool.execute(
    "UPDATE otp_verifications SET consumed = TRUE WHERE id = ?",
    [record.id]
  );

  return {
    success: true,
    message: "Verification successful.",
  };
}

module.exports = {
  generateAndSendOtp,
  verifyOtp,
  hashOtp,
};
