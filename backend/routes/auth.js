const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateAndSendOtp, verifyOtp } = require("../services/otpService");
const { logAudit } = require("../services/auditService");
const { getDevSentEmails } = require("../services/emailService");
const { verifyGoogleIdToken } = require("../services/googleAuthService");

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

function validEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    email.trim().length <= 190
  );
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 12;
}

// ----------------------------------------------------
// Lesson 2.1: Login
// ----------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const [users] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.password_hash,
         u.status,
         u.must_change_password,
         u.token_version,
         u.hospital_id,
         u.department_id,
         r.name AS role,
         h.status AS hospital_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       WHERE u.email = ?
       LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    const user = users[0];

    const passwordMatches = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.hospital_id && user.hospital_status !== "active") {
      return res.status(403).json({
        success: false,
        message: "The hospital associated with this account is inactive",
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Your account is pending verification or administrator approval.",
        status: "pending",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact your administrator.",
        status: "suspended",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or disabled. Please contact your administrator.",
        status: "inactive",
      });
    }

    await pool.execute(
      "UPDATE users SET last_login_at = NOW() WHERE id = ?",
      [user.id]
    );

    const token = jwt.sign(
      {
        sub: String(user.id),
        role: user.role,
        hospitalId: user.hospital_id,
        tokenVersion: user.token_version,
        mustChangePassword: Boolean(user.must_change_password),
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      token,
      expiresIn: 2592000,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospital_id,
        departmentId: user.department_id,
        status: user.status,
        mustChangePassword: Boolean(user.must_change_password),
      },
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to process login",
    });
  }
});

// Current user profile check
router.get("/me", requireAuth, async (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// ----------------------------------------------------
// Lesson 2.2: Patient Self-Registration & OTP Verification
// ----------------------------------------------------
router.post("/register-patient", async (req, res) => {
  try {
    const { full_name, email, password, phone } = req.body || {};

    if (
      typeof full_name !== "string" ||
      !full_name.trim() ||
      full_name.trim().length > 150 ||
      !validEmail(email) ||
      !validPassword(password) ||
      (phone !== undefined &&
        phone !== null &&
        typeof phone !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide a valid name, email, password (at least 12 characters), and optional phone number.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already registered
    const [existing] = await pool.execute(
      "SELECT id, status FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      // If user exists and is already active, return 409
      if (existing[0].status === "active") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }

      // If user exists but is pending email verification, resend OTP
      try {
        await generateAndSendOtp(normalizedEmail, "registration");
        return res.status(200).json({
          success: true,
          message: "Your registration is pending verification. A fresh verification code has been sent.",
          data: { email: normalizedEmail, requiresVerification: true },
        });
      } catch (otpErr) {
        return res.status(otpErr.statusCode || 400).json({
          success: false,
          message: otpErr.message,
        });
      }
    }

    const [roles] = await pool.execute(
      "SELECT id FROM roles WHERE name = 'patient' LIMIT 1"
    );

    if (!roles.length) {
      return res.status(500).json({
        success: false,
        message: "Patient role is not configured.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
        (role_id, full_name, email, phone, password_hash, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        roles[0].id,
        full_name.trim(),
        normalizedEmail,
        phone ? phone.trim() : null,
        passwordHash,
      ]
    );

    // Initialize baseline patient profile record
    try {
      await pool.execute(
        `INSERT INTO patient_profiles (user_id, is_profile_completed) VALUES (?, FALSE)
         ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [result.insertId]
      );
    } catch (profErr) {
      console.warn("Notice on patient_profiles init:", profErr.message);
    }

    // Generate and send OTP for registration
    await generateAndSendOtp(normalizedEmail, "registration");

    return res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email with the 6-digit code sent to you.",
      data: {
        id: result.insertId,
        email: normalizedEmail,
        requiresVerification: true,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Patient registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to complete registration.",
    });
  }
});

// Verify Registration OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, purpose = "registration" } = req.body || {};

    if (!email || !validEmail(email) || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and a 6-digit verification code are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const verification = await verifyOtp(normalizedEmail, purpose, otp);

    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message,
      });
    }

    if (purpose === "registration") {
      // Activate patient account
      const [updateResult] = await pool.execute(
        `UPDATE users u
         JOIN roles r ON r.id = u.role_id
         SET u.status = 'active'
         WHERE u.email = ? AND u.status = 'pending' AND r.name = 'patient'`,
        [normalizedEmail]
      );

      if (updateResult.affectedRows === 0) {
        return res.status(200).json({
          success: true,
          message: "Email verified. Your account may require administrative approval before login.",
        });
      }

      await logAudit({
        action: "PATIENT_EMAIL_VERIFIED",
        targetType: "user",
        details: { email: normalizedEmail },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: "Email verified successfully! You can now sign in.",
      });
    }

    return res.json({
      success: true,
      message: "Verification code validated successfully.",
    });
  } catch (error) {
    console.error("OTP verification error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify code.",
    });
  }
});

// ----------------------------------------------------
// Lesson 5.2: Google Sign-In & Safe Account Linking
// ----------------------------------------------------
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body || {};

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google ID credential token is required.",
      });
    }

    const googleUser = await verifyGoogleIdToken(credential);

    if (!googleUser.email_verified) {
      return res.status(403).json({
        success: false,
        message: "Your Google account email has not been verified by Google.",
      });
    }

    const { email, sub: googleId, name: fullName } = googleUser;

    // 1. Check if any user already has this google_id
    const [usersWithGoogleId] = await pool.execute(
      `SELECT u.id, u.email, u.full_name, u.status, u.token_version, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.google_id = ?
       LIMIT 1`,
      [googleId]
    );

    // 2. Check if an existing account has this email
    const [usersWithEmail] = await pool.execute(
      `SELECT u.id, u.email, u.full_name, u.google_id, u.status, u.token_version, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    );

    let targetUser = null;

    if (usersWithGoogleId.length > 0) {
      targetUser = usersWithGoogleId[0];

      // If user matched by google_id but token has a different email, prevent conflict
      if (targetUser.email !== email) {
        return res.status(409).json({
          success: false,
          message: "Google identifier conflict: This Google identity is already associated with another account.",
        });
      }
    } else if (usersWithEmail.length > 0) {
      targetUser = usersWithEmail[0];

      // Strict role check: Google sign-in on patient portal only permits patient role
      if (targetUser.role !== "patient") {
        return res.status(403).json({
          success: false,
          message: `This email address is registered for an administrative or clinical role (${targetUser.role}). Google self-service login is restricted to patients.`,
        });
      }

      // If the email already has a DIFFERENT google_id assigned, prevent account hijacking
      if (targetUser.google_id && targetUser.google_id !== googleId) {
        return res.status(409).json({
          success: false,
          message: "Account linking conflict: This email account is already linked to a different Google account.",
        });
      }

      // Safe linking: Link google_id to the existing verified patient account and activate if pending
      await pool.execute(
        `UPDATE users
         SET google_id = ?, status = 'active', updated_at = NOW()
         WHERE id = ?`,
        [googleId, targetUser.id]
      );
      targetUser.status = "active";
    } else {
      // New patient registration via Google
      const [roles] = await pool.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
      if (!roles.length) {
        return res.status(500).json({ success: false, message: "Patient role is not configured." });
      }

      // Generate random high-entropy hash so account cannot be accessed with empty password
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const [insertRes] = await pool.execute(
        `INSERT INTO users (role_id, full_name, email, google_id, password_hash, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [roles[0].id, fullName, email, googleId, passwordHash]
      );

      const newUserId = insertRes.insertId;

      // Initialize patient profile
      try {
        await pool.execute(
          `INSERT INTO patient_profiles (user_id, is_profile_completed) VALUES (?, FALSE)
           ON DUPLICATE KEY UPDATE updated_at = NOW()`,
          [newUserId]
        );
      } catch (profErr) {
        console.warn("Notice on patient_profiles init:", profErr.message);
      }

      targetUser = {
        id: newUserId,
        full_name: fullName,
        email,
        role: "patient",
        status: "active",
        token_version: 1,
      };

      await logAudit({
        actorId: newUserId,
        action: "PATIENT_GOOGLE_REGISTERED",
        targetType: "user",
        targetId: newUserId,
        details: { email, googleId },
        ipAddress: req.ip,
      });
    }

    // Account status checks
    if (targetUser.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact hospital administration.",
        status: "suspended",
      });
    }

    if (targetUser.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active. Please contact administrator.",
        status: targetUser.status,
      });
    }

    // Role check
    if (targetUser.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only patient accounts can sign in to the Patient Portal.",
      });
    }

    // Update last login timestamp
    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [targetUser.id]);

    const token = jwt.sign(
      {
        sub: String(targetUser.id),
        role: "patient",
        hospitalId: null,
        tokenVersion: targetUser.token_version || 1,
        mustChangePassword: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await logAudit({
      actorId: targetUser.id,
      action: "PATIENT_GOOGLE_LOGIN_SUCCESS",
      targetType: "user",
      targetId: targetUser.id,
      details: { email },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      token,
      expiresIn: 2592000,
      user: {
        id: targetUser.id,
        fullName: targetUser.full_name,
        email: targetUser.email,
        role: "patient",
        status: "active",
        mustChangePassword: false,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    console.error("Google sign-in error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to complete Google authentication.",
    });
  }
});

// Resend OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email, purpose = "registration" } = req.body || {};

    if (!email || !validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify user exists
    const [users] = await pool.execute(
      "SELECT id, status FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (!users.length) {
      // Prevent enumeration: return generic success
      return res.json({
        success: true,
        message: "If that email is registered, a new code has been sent.",
      });
    }

    try {
      await generateAndSendOtp(normalizedEmail, purpose);
      return res.json({
        success: true,
        message: "A new verification code has been sent to your email.",
      });
    } catch (otpErr) {
      return res.status(otpErr.statusCode || 400).json({
        success: false,
        message: otpErr.message,
      });
    }
  } catch (error) {
    console.error("Resend OTP error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to resend verification code.",
    });
  }
});

// ----------------------------------------------------
// Lesson 2.3: Forgot Password & Password Reset
// ----------------------------------------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email || !validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.execute(
      "SELECT id, status FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    // Prevent account enumeration: always return 200 with standard message
    if (users.length && users[0].status === "active") {
      try {
        await generateAndSendOtp(normalizedEmail, "password_reset");
      } catch (err) {
        if (err.statusCode === 429) {
          return res.status(429).json({
            success: false,
            message: err.message,
          });
        }
        console.error("Failed to send password reset code:", err.message);
      }
    }

    return res.json({
      success: true,
      message:
        "If an account with that email exists, password reset instructions have been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request.",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, new_password, confirm_password } = req.body || {};

    if (!email || !validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid email is required.",
      });
    }

    if (!otp || String(otp).trim().length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Valid 6-digit reset code is required.",
      });
    }

    if (!validPassword(new_password)) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 12 characters long.",
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: "Password and confirmation do not match.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const verification = await verifyOtp(normalizedEmail, "password_reset", otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message,
      });
    }

    const [users] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (!users.length) {
      return res.status(400).json({
        success: false,
        message: "Account not found.",
      });
    }

    const userId = users[0].id;
    const passwordHash = await bcrypt.hash(new_password, 12);

    // Update password, clear must_change_password, and increment token_version
    // to invalidate all existing sessions
    await pool.execute(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = FALSE,
           token_version = token_version + 1,
           updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, userId]
    );

    await logAudit({
      actorId: userId,
      action: "PASSWORD_RESET_SUCCESS",
      targetType: "user",
      targetId: userId,
      details: { email: normalizedEmail },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: "Your password has been reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("Password reset error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to reset password.",
    });
  }
});

// ----------------------------------------------------
// Lesson 2.4: Change Password (First-Login & User Profile)
// ----------------------------------------------------
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const current_password = req.body?.current_password || req.body?.currentPassword;
    const new_password = req.body?.new_password || req.body?.newPassword;
    const confirm_password =
      req.body?.confirm_password !== undefined
        ? req.body.confirm_password
        : req.body?.confirmPassword !== undefined
        ? req.body.confirmPassword
        : new_password;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (!validPassword(new_password)) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 12 characters long.",
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match.",
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password.",
      });
    }

    // Retrieve user's current password hash and token_version
    const [users] = await pool.execute(
      "SELECT id, password_hash, token_version FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = users[0];
    const matches = await bcrypt.compare(current_password, user.password_hash);
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: "Incorrect current password.",
      });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const newTokenVersion = user.token_version + 1;

    await pool.execute(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = FALSE,
           token_version = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [newHash, newTokenVersion, user.id]
    );

    await logAudit({
      actorId: user.id,
      action: "PASSWORD_CHANGED",
      targetType: "user",
      targetId: user.id,
      ipAddress: req.ip,
    });

    // Generate a fresh JWT with updated tokenVersion and mustChangePassword = false
    const token = jwt.sign(
      {
        sub: String(user.id),
        role: req.user.role,
        hospitalId: req.user.hospitalId,
        tokenVersion: newTokenVersion,
        mustChangePassword: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: "Password changed successfully.",
      token,
      user: {
        ...req.user,
        mustChangePassword: false,
        tokenVersion: newTokenVersion,
      },
    });
  } catch (error) {
    console.error("Change password error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to change password.",
    });
  }
});

// Development-only endpoint to inspect sent OTPs safely in testing
if (process.env.NODE_ENV !== "production") {
  router.get("/dev-last-otp", (req, res) => {
    const { email } = req.query;
    const emails = getDevSentEmails(email);
    return res.json({
      success: true,
      lastEmail: emails[emails.length - 1] || null,
    });
  });
}

module.exports = router;
