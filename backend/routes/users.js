const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { generateAndSendOtp } = require("../services/otpService");
const { logAudit } = require("../services/auditService");
const { sendCredentialEmail } = require("../services/emailService");
const { notifyAccountApproved, dispatchNotification } = require("../services/notificationService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();

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

// Public patient self-registration.
// Creates patient account in pending verification status and sends OTP
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
          "Provide a valid name, email, password (at least 12 characters), and optional phone.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await pool.execute(
      "SELECT id, status FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      if (existing[0].status === "active") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      // If pending, resend OTP
      try {
        await generateAndSendOtp(normalizedEmail, "registration");
        return res.status(200).json({
          success: true,
          message: "Registration pending. A fresh verification code has been sent.",
          data: { id: existing[0].id, email: normalizedEmail, requiresVerification: true },
        });
      } catch (err) {
        return res.status(err.statusCode || 400).json({
          success: false,
          message: err.message,
        });
      }
    }

    const [roles] = await pool.execute(
      "SELECT id FROM roles WHERE name = 'patient' LIMIT 1"
    );

    if (!roles.length) {
      return res.status(500).json({
        success: false,
        message: "Patient role is not configured",
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

    await generateAndSendOtp(normalizedEmail, "registration");

    return res.status(201).json({
      success: true,
      message: "Patient account created. Please verify your email with the 6-digit code sent to you.",
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
        message: "An account with this email already exists",
      });
    }

    console.error("Patient registration failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to register patient",
    });
  }
});

// Read user accounts — Super Admin reads all; Hospital Admin reads users for their hospital.
router.get(
  "/",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      let sql = `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.phone,
          r.name AS role,
          u.hospital_id,
          h.name AS hospital_name,
          u.department_id,
          d.name AS department_name,
          u.designation_id,
          des.name AS designation_name,
          dp.specialization,
          dp.experience_years,
          dp.consultation_fee,
          dp.license_number,
          dp.license_expiry_date,
          sp.employee_id,
          sp.shift_timing,
          sp.permissions,
          u.credential_delivery_status,
          u.credentials_sent_at,
          u.status,
          u.must_change_password,
          u.last_login_at,
          u.created_at
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN hospitals h ON h.id = u.hospital_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN designations des ON des.id = u.designation_id
        LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
        LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      `;

      const params = [];

      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }

        sql += " WHERE u.hospital_id = ? AND r.name != 'super_admin'";
        params.push(req.user.hospitalId);
      }

      sql += " ORDER BY u.created_at DESC";

      const [users] = await pool.execute(sql, params);

      return res.json({
        success: true,
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("Failed to fetch users:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to retrieve users",
      });
    }
  }
);

// Create users according to the authenticated creator's role.
router.post(
  "/",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const {
        full_name,
        email,
        password,
        phone,
        role: requestedRole,
        hospital_id,
        department_id,
        temporary_password,
        must_change_password,
      } = req.body || {};

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
          message: "Invalid name, email, password (at least 12 characters), or phone",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();
      let assignedHospitalId;
      let assignedDepartmentId = null;
      let accountStatus;

      if (req.user.role === "super_admin") {
        if (requestedRole !== "hospital_admin") {
          return res.status(403).json({
            success: false,
            message: "Super Admin may create Hospital Admin accounts through this endpoint",
          });
        }

        assignedHospitalId = Number(hospital_id);

        if (
          !Number.isSafeInteger(assignedHospitalId) ||
          assignedHospitalId < 1
        ) {
          return res.status(400).json({
            success: false,
            message: "A valid hospital_id is required",
          });
        }

        accountStatus = "active";
      } else {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }

        assignedHospitalId = Number(req.user.hospitalId);

        if (!["doctor", "staff", "patient"].includes(requestedRole)) {
          return res.status(403).json({
            success: false,
            message: "Hospital Admin cannot create this role",
          });
        }

        // Doctor and staff remain pending for approval.
        // Patient accounts created directly by Hospital Admin are active.
        accountStatus = ["doctor", "staff"].includes(requestedRole)
          ? "pending"
          : "active";
      }

      const [hospitals] = await pool.execute(
        "SELECT id FROM hospitals WHERE id = ? AND status = 'active' LIMIT 1",
        [assignedHospitalId]
      );

      if (!hospitals.length) {
        return res.status(400).json({
          success: false,
          message: "Active hospital not found",
        });
      }

      if (
        ["doctor", "staff"].includes(requestedRole) &&
        department_id !== undefined &&
        department_id !== null &&
        department_id !== ""
      ) {
        assignedDepartmentId = Number(department_id);

        if (
          !Number.isSafeInteger(assignedDepartmentId) ||
          assignedDepartmentId < 1
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid department_id",
          });
        }

        const [departments] = await pool.execute(
          `SELECT id FROM departments
           WHERE id = ? AND hospital_id = ? AND status = 'active'
           LIMIT 1`,
          [assignedDepartmentId, assignedHospitalId]
        );

        if (!departments.length) {
          return res.status(400).json({
            success: false,
            message: "Department must belong to the assigned active hospital",
          });
        }
      }

      const [roles] = await pool.execute(
        "SELECT id FROM roles WHERE name = ? LIMIT 1",
        [requestedRole]
      );

      if (!roles.length) {
        return res.status(400).json({
          success: false,
          message: "Requested role is not configured",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const isTemporary = Boolean(temporary_password || must_change_password);

      const [result] = await pool.execute(
        `INSERT INTO users
          (role_id, hospital_id, department_id, full_name, email,
           phone, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roles[0].id,
          assignedHospitalId,
          assignedDepartmentId,
          full_name.trim(),
          normalizedEmail,
          phone || null,
          passwordHash,
          accountStatus,
          isTemporary,
        ]
      );

      await logAudit({
        actorId: req.user.id,
        action: "USER_CREATED",
        targetType: "user",
        targetId: result.insertId,
        details: {
          role: requestedRole,
          hospitalId: assignedHospitalId,
          temporaryPassword: isTemporary,
        },
        ipAddress: req.ip,
      });

      if (assignedHospitalId) {
        emitHospitalEvent(assignedHospitalId, "staff:updated", {
          action: "created",
          userId: result.insertId,
          role: requestedRole,
          status: accountStatus,
          hospitalId: assignedHospitalId,
        });
      }

      return res.status(201).json({
        success: true,
        message: "User account created",
        data: {
          id: result.insertId,
          role: requestedRole,
          status: accountStatus,
          hospital_id: assignedHospitalId,
          department_id: assignedDepartmentId,
          must_change_password: isTemporary,
        },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      console.error("User creation failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create user account",
      });
    }
  }
);

/**
 * List pending Doctor and Staff accounts.
 * Accessible by hospital_admin (for their own hospital) and super_admin (across all hospitals).
 */
router.get(
  "/pending-approvals",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      let query = `
        SELECT
           u.id,
           u.full_name,
           u.email,
           u.phone,
           r.name AS role,
           d.name AS department_name,
           h.name AS hospital_name,
           u.hospital_id,
           u.status,
           u.created_at
         FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN hospitals h ON h.id = u.hospital_id
         WHERE u.status = 'pending'
           AND r.name IN ('doctor', 'staff')
      `;
      const params = [];

      if (req.user.role === "hospital_admin") {
        const hospitalId = Number(req.user.hospitalId);

        if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
          return res.status(403).json({
            success: false,
            message: "No valid hospital is assigned to this account",
          });
        }

        query += ` AND u.hospital_id = ?`;
        params.push(hospitalId);
      } else if (req.query.hospital_id) {
        const targetHospitalId = Number(req.query.hospital_id);
        if (Number.isSafeInteger(targetHospitalId) && targetHospitalId > 0) {
          query += ` AND u.hospital_id = ?`;
          params.push(targetHospitalId);
        }
      }

      query += ` ORDER BY u.created_at ASC`;

      const [users] = await pool.execute(query, params);

      return res.json({
        success: true,
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("Failed to fetch pending approvals:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve pending approvals",
      });
    }
  }
);

/**
 * Approve a pending Doctor or Staff account.
 * Accessible by hospital_admin (within their hospital) and super_admin.
 */
router.patch(
  "/:id/approve",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);

      if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      let updateQuery;
      let params;

      if (req.user.role === "hospital_admin") {
        const hospitalId = Number(req.user.hospitalId);

        if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
          return res.status(403).json({
            success: false,
            message: "No valid hospital is assigned to this account",
          });
        }

        updateQuery = `UPDATE users u
         INNER JOIN roles r ON r.id = u.role_id
         SET u.status = 'active'
         WHERE u.id = ?
           AND u.hospital_id = ?
           AND u.status = 'pending'
           AND r.name IN ('doctor', 'staff')`;
        params = [userId, hospitalId];
      } else {
        // super_admin has platform-wide authority
        updateQuery = `UPDATE users u
         INNER JOIN roles r ON r.id = u.role_id
         SET u.status = 'active'
         WHERE u.id = ?
           AND u.status = 'pending'
           AND r.name IN ('doctor', 'staff')`;
        params = [userId];
      }

      const [result] = await pool.execute(updateQuery, params);

      if (result.affectedRows !== 1) {
        return res.status(404).json({
          success: false,
          message:
            "No eligible pending Doctor or Staff account was found",
        });
      }

      await logAudit({
        actorId: req.user.id,
        action: "ACCOUNT_APPROVED",
        targetType: "user",
        targetId: userId,
        ipAddress: req.ip,
      });

      // Module 7 (Lesson 7.1): Dispatch account approved notification
      try {
        const [userRows] = await pool.execute(
          `SELECT u.id, u.full_name, u.email, u.hospital_id, r.name AS role, h.name AS hospital_name
           FROM users u
           JOIN roles r ON r.id = u.role_id
           LEFT JOIN hospitals h ON h.id = u.hospital_id
           WHERE u.id = ? LIMIT 1`,
          [userId]
        );
        if (userRows.length > 0) {
          const approvedUser = userRows[0];
          let loginUrl = "http://localhost:5174";
          if (approvedUser.role === "doctor") {
            loginUrl = process.env.DOCTOR_PORTAL_URL || "http://localhost:5175";
          } else if (approvedUser.role === "staff") {
            loginUrl = process.env.STAFF_PORTAL_URL || "http://localhost:5176";
          }
          notifyAccountApproved({
            user: approvedUser,
            role: approvedUser.role,
            hospitalName: approvedUser.hospital_name,
            loginUrl,
          }).catch((err) => console.error("[Notification] Account approved email error:", err.message));
        }
      } catch (notifErr) {
        console.error("[Notification] Error fetching user for approval email:", notifErr.message);
      }

      if (req.user.hospitalId) {
        emitHospitalEvent(req.user.hospitalId, "staff:updated", {
          action: "approved",
          userId,
          status: "active",
        });
      }

      return res.json({
        success: true,
        message: "Account approved successfully",
        data: {
          id: userId,
          status: "active",
        },
      });
    } catch (error) {
      console.error("Failed to approve user:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to approve account",
      });
    }
  }
);

/**
 * Lesson 2.7: Account Activation & Deactivation Management
 * Update account status (active, inactive, suspended)
 */
router.patch(
  "/:id/status",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      const { status: newStatus } = req.body || {};

      if (!Number.isSafeInteger(targetUserId) || targetUserId < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      if (!["active", "inactive", "suspended"].includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: "Status must be active, inactive, or suspended",
        });
      }

      // Prevent self-modification
      if (targetUserId === req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You cannot modify your own account status",
        });
      }

      // Fetch target user and their role/hospital
      const [targets] = await pool.execute(
        `SELECT u.id, u.hospital_id, u.status, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ?
         LIMIT 1`,
        [targetUserId]
      );

      if (!targets.length) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const target = targets[0];

      // Authorization rules:
      if (req.user.role === "hospital_admin") {
        // Hospital Admin cannot modify super_admin or other hospital_admins
        if (["super_admin", "hospital_admin"].includes(target.role)) {
          return res.status(403).json({
            success: false,
            message: "You do not have permission to modify this administrative user",
          });
        }

        // Must belong to the same hospital
        if (target.hospital_id !== req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "You cannot modify users outside of your assigned hospital",
          });
        }
      }

      // If deactivating or suspending, invalidate their active JWT sessions
      // by incrementing token_version
      const shouldInvalidate = newStatus !== "active";

      await pool.execute(
        `UPDATE users
         SET status = ?,
             token_version = CASE WHEN ? THEN token_version + 1 ELSE token_version END,
             updated_at = NOW()
         WHERE id = ?`,
        [newStatus, shouldInvalidate, targetUserId]
      );

      await logAudit({
        actorId: req.user.id,
        action: `ACCOUNT_STATUS_${newStatus.toUpperCase()}`,
        targetType: "user",
        targetId: targetUserId,
        details: { previousStatus: target.status, newStatus },
        ipAddress: req.ip,
      });

      if (target.hospital_id) {
        emitHospitalEvent(target.hospital_id, "staff:updated", {
          action: "status_updated",
          userId: targetUserId,
          status: newStatus,
          previousStatus: target.status,
        });
      }

      return res.json({
        success: true,
        message: `Account status updated to ${newStatus}`,
        data: {
          id: targetUserId,
          status: newStatus,
        },
      });
    } catch (error) {
      console.error("Failed to update user status:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to update account status",
      });
    }
  }
);

/**
 * POST /api/users/:id/send-credentials
 * Lesson 4.9: Sending Login Credentials to Doctors and Staff
 */
router.post(
  "/:id/send-credentials",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!Number.isSafeInteger(targetUserId) || targetUserId < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const [targetRows] = await pool.execute(
        `SELECT
          u.id,
          u.full_name,
          u.email,
          u.hospital_id,
          h.name AS hospital_name,
          r.name AS role,
          u.status
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN hospitals h ON h.id = u.hospital_id
        WHERE u.id = ?
        LIMIT 1`,
        [targetUserId]
      );

      if (!targetRows.length) {
        return res.status(404).json({
          success: false,
          message: "User account not found",
        });
      }

      const target = targetRows[0];

      // Multi-tenant hospital isolation check
      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId || target.hospital_id !== req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "You cannot manage credentials for users outside your assigned hospital",
          });
        }
        if (target.role === "super_admin" || (target.role === "hospital_admin" && target.id !== req.user.id)) {
          return res.status(403).json({
            success: false,
            message: "You can only dispatch credentials to doctors and staff",
          });
        }
      }

      // Generate secure temporary password
      let tempPassword = req.body?.custom_password;
      if (!tempPassword || typeof tempPassword !== "string" || tempPassword.length < 12) {
        const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const lowercase = "abcdefghjkmnpqrstuvwxyz";
        const digits = "23456789";
        const symbols = "!@#$%&*";
        const allChars = uppercase + lowercase + digits + symbols;
        let gen = "";
        gen += uppercase[Math.floor(Math.random() * uppercase.length)];
        gen += lowercase[Math.floor(Math.random() * lowercase.length)];
        gen += digits[Math.floor(Math.random() * digits.length)];
        gen += symbols[Math.floor(Math.random() * symbols.length)];
        for (let i = 4; i < 14; i++) {
          gen += allChars[Math.floor(Math.random() * allChars.length)];
        }
        tempPassword = gen.split("").sort(() => 0.5 - Math.random()).join("");
      }

      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Determine portal URL based on user role
      let portalUrl = "http://localhost:5177";
      if (target.role === "doctor") {
        portalUrl = process.env.DOCTOR_PORTAL_URL || "http://localhost:5175";
      } else if (target.role === "staff") {
        portalUrl = process.env.STAFF_PORTAL_URL || "http://localhost:5176";
      } else if (target.role === "hospital_admin") {
        portalUrl = process.env.HOSPITAL_ADMIN_PORTAL_URL || "http://localhost:5174";
      }

      // Update database: set temporary password, must_change_password = TRUE, activate if pending, credentials_sent_at = NOW(), credential_delivery_status = 'sent'
      await pool.execute(
        `UPDATE users
         SET password_hash = ?,
             must_change_password = TRUE,
             status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
             credentials_sent_at = NOW(),
             credential_delivery_status = 'sent',
             updated_at = NOW()
         WHERE id = ?`,
        [passwordHash, targetUserId]
      );

      // Dispatch credential email
      await sendCredentialEmail({
        to: target.email,
        fullName: target.full_name,
        role: target.role,
        temporaryPassword: tempPassword,
        loginUrl: portalUrl,
        hospitalName: target.hospital_name,
      });

      // Module 7 (Lesson 7.1): Log to notifications table
      await pool.execute(
        `INSERT INTO notifications
           (recipient_email, recipient_user_id, hospital_id, notification_type,
            subject, body_text, status, attempts, sent_at, last_attempt_at)
         VALUES (?, ?, ?, 'account_credentials', ?, ?, 'sent', 1, NOW(), NOW())`,
        [
          target.email,
          targetUserId,
          target.hospital_id,
          `Your Access Credentials — ${target.hospital_name || "HealthMesh Portal"}`,
          `Credentials dispatched for role ${target.role}. Temporary password assigned.`,
        ]
      ).catch(() => {});

      await logAudit({
        actorId: req.user.id,
        action: "CREDENTIALS_DISPATCHED",
        targetType: "user",
        targetId: targetUserId,
        details: {
          recipientEmail: target.email,
          role: target.role,
          hospitalId: target.hospital_id,
          portalUrl,
        },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: `Credentials successfully dispatched to ${target.email}`,
        data: {
          id: targetUserId,
          email: target.email,
          full_name: target.full_name,
          role: target.role,
          temporary_password: tempPassword,
          portal_url: portalUrl,
          credentials_sent_at: new Date().toISOString(),
          credential_delivery_status: "sent",
          must_change_password: true,
        },
      });
    } catch (error) {
      console.error("Failed to send credentials:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to send login credentials",
        error: error.message,
      });
    }
  }
);

module.exports = router;
