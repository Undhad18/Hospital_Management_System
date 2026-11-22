const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { notifyAccountPendingReview } = require("../services/notificationService");

const router = express.Router();
router.use(requireAuth);

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

/**
 * Standard default permissions for designations (Lesson 4.7 & 4.8)
 */
const DEFAULT_DESIGNATION_PERMISSIONS = {
  receptionist: [
    "patient_registration",
    "appointment_booking",
    "queue_management",
    "visitor_pass",
  ],
  nurse: [
    "patient_vitals",
    "bed_allocation",
    "triage_entry",
    "medication_admin",
    "doctor_notes_view",
  ],
  pharmacist: [
    "prescription_dispense",
    "pharmacy_inventory",
    "stock_alerts",
    "medication_billing",
  ],
  "lab staff": [
    "specimen_collection",
    "lab_result_entry",
    "test_report_upload",
    "lab_equipment_log",
  ],
  accountant: [
    "invoice_generation",
    "payment_collection",
    "insurance_claims",
    "financial_reports",
  ],
};

function getDefaultPermissionsForDesignation(designationName) {
  if (!designationName || typeof designationName !== "string") {
    return ["general_staff_access"];
  }
  const lower = designationName.trim().toLowerCase();
  for (const [key, perms] of Object.entries(DEFAULT_DESIGNATION_PERMISSIONS)) {
    if (lower.includes(key)) {
      return perms;
    }
  }
  return ["general_staff_access"];
}

/**
 * GET /api/staff
 * List staff based on authority:
 * - Super Admin: all staff or filtered by hospital_id
 * - Hospital Admin: staff belonging to their hospital
 * - Staff/Others: restricted active staff
 */
router.get("/", async (req, res) => {
  try {
    const { hospital_id, department_id, designation_id, search, status } = req.query;

    let sql = `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        u.hospital_id,
        h.name AS hospital_name,
        h.code AS hospital_code,
        u.department_id,
        d.name AS department_name,
        u.designation_id,
        des.name AS designation_name,
        sp.employee_id,
        sp.shift_timing,
        sp.permissions,
        u.must_change_password,
        u.credentials_sent_at,
        u.credential_delivery_status,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'staff'
      LEFT JOIN hospitals h ON h.id = u.hospital_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    `;

    const conditions = [];
    const params = [];

    // Role-based tenant isolation
    if (req.user.role === "hospital_admin") {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital is assigned to this account",
        });
      }
      conditions.push("u.hospital_id = ?");
      params.push(req.user.hospitalId);
    } else if (req.user.role === "super_admin") {
      if (hospital_id !== undefined && hospital_id !== null && hospital_id !== "" && hospital_id !== "all") {
        const hospNum = Number(hospital_id);
        if (Number.isSafeInteger(hospNum) && hospNum > 0) {
          conditions.push("u.hospital_id = ?");
          params.push(hospNum);
        }
      }
    } else {
      // Staff members viewing colleagues
      conditions.push("u.status = 'active'");
      if (req.user.hospitalId) {
        conditions.push("u.hospital_id = ?");
        params.push(req.user.hospitalId);
      }
    }

    if (department_id) {
      conditions.push("u.department_id = ?");
      params.push(Number(department_id));
    }

    if (designation_id) {
      conditions.push("u.designation_id = ?");
      params.push(Number(designation_id));
    }

    if (status && ["active", "inactive", "pending", "suspended"].includes(status)) {
      conditions.push("u.status = ?");
      params.push(status);
    }

    if (search && search.trim()) {
      conditions.push(
        "(u.full_name LIKE ? OR u.email LIKE ? OR sp.employee_id LIKE ? OR des.name LIKE ? OR d.name LIKE ?)"
      );
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY u.full_name ASC";

    const [staffList] = await pool.execute(sql, params);

    // Parse JSON permissions if returned as string
    const formatted = staffList.map((s) => {
      let perms = s.permissions;
      if (typeof perms === "string") {
        try {
          perms = JSON.parse(perms);
        } catch {
          perms = [];
        }
      }
      return {
        ...s,
        permissions: perms || [],
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("Failed to fetch staff:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve staff personnel",
    });
  }
});

/**
 * GET /api/staff/:id
 * Retrieve single staff profile with complete credentials and permissions
 */
router.get("/:id", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!Number.isSafeInteger(staffId) || staffId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const [rows] = await pool.execute(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        u.hospital_id,
        h.name AS hospital_name,
        h.code AS hospital_code,
        u.department_id,
        d.name AS department_name,
        u.designation_id,
        des.name AS designation_name,
        sp.employee_id,
        sp.shift_timing,
        sp.permissions,
        u.must_change_password,
        u.credentials_sent_at,
        u.credential_delivery_status,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'staff'
      LEFT JOIN hospitals h ON h.id = u.hospital_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.id = ?
      LIMIT 1`,
      [staffId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }

    const staff = rows[0];

    // Hospital Admin isolation check
    if (
      req.user.role === "hospital_admin" &&
      staff.hospital_id !== req.user.hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot access staff outside your assigned hospital",
      });
    }

    let perms = staff.permissions;
    if (typeof perms === "string") {
      try {
        perms = JSON.parse(perms);
      } catch {
        perms = [];
      }
    }

    return res.json({
      success: true,
      data: {
        ...staff,
        permissions: perms || [],
      },
    });
  } catch (error) {
    console.error("Failed to fetch staff details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve staff details",
    });
  }
});

/**
 * POST /api/staff
 * Lessons 4.6, 4.7, 4.8: Create Staff Account, Assign Designation & Department, Configure Permissions
 * Accessible by: super_admin, hospital_admin
 */
router.post(
  "/",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const {
        full_name,
        email,
        password,
        phone,
        hospital_id,
        department_id,
        designation_id,
        employee_id,
        shift_timing,
        permissions,
        temporary_password,
        must_change_password,
      } = req.body || {};

      // 1. Basic User Validations
      if (
        typeof full_name !== "string" ||
        !full_name.trim() ||
        full_name.trim().length > 150 ||
        !validEmail(email) ||
        !validPassword(password)
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid name, email, and password of at least 12 characters are required",
        });
      }

      // 2. Hospital Assignment Validation & Isolation
      let assignedHospitalId;
      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }
        assignedHospitalId = Number(req.user.hospitalId);
      } else {
        assignedHospitalId = Number(hospital_id);
        if (!Number.isSafeInteger(assignedHospitalId) || assignedHospitalId < 1) {
          return res.status(400).json({
            success: false,
            message: "A valid hospital_id is required",
          });
        }
      }

      const [hospitals] = await connection.execute(
        "SELECT id, name FROM hospitals WHERE id = ? AND status = 'active'",
        [assignedHospitalId]
      );
      if (!hospitals.length) {
        return res.status(400).json({
          success: false,
          message: "Active hospital not found",
        });
      }

      // 3. Department Validation (Lesson 4.8)
      let assignedDepartmentId = null;
      if (department_id !== undefined && department_id !== null && department_id !== "") {
        const dId = Number(department_id);
        if (!Number.isSafeInteger(dId) || dId < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid department_id",
          });
        }

        const [depts] = await connection.execute(
          "SELECT id, name FROM departments WHERE id = ? AND hospital_id = ? AND status = 'active'",
          [dId, assignedHospitalId]
        );
        if (!depts.length) {
          return res.status(400).json({
            success: false,
            message: "Department must belong to the staff member's assigned active hospital",
          });
        }
        assignedDepartmentId = dId;
      }

      // 4. Designation Validation (Lesson 4.7)
      let assignedDesignationId = null;
      let designationName = "";
      if (designation_id !== undefined && designation_id !== null && designation_id !== "") {
        const desId = Number(designation_id);
        if (!Number.isSafeInteger(desId) || desId < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid designation_id",
          });
        }

        const [desigs] = await connection.execute(
          "SELECT id, name FROM designations WHERE id = ? AND (hospital_id IS NULL OR hospital_id = ?) AND status = 'active'",
          [desId, assignedHospitalId]
        );
        if (!desigs.length) {
          return res.status(400).json({
            success: false,
            message: "Designation must be an active global title or belong to the staff member's assigned hospital",
          });
        }
        assignedDesignationId = desId;
        designationName = desigs[0].name;
      }

      // 5. Permissions Configuration (Lesson 4.8)
      let assignedPermissions;
      if (Array.isArray(permissions)) {
        assignedPermissions = permissions;
      } else if (permissions && typeof permissions === "object") {
        assignedPermissions = permissions;
      } else {
        // Automatically default based on designation name (Lesson 4.7)
        assignedPermissions = getDefaultPermissionsForDesignation(designationName);
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check duplicate email
      const [existingUsers] = await connection.execute(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [normalizedEmail]
      );
      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      // Fetch Staff Role
      const [roles] = await connection.execute(
        "SELECT id FROM roles WHERE name = 'staff' LIMIT 1"
      );
      if (!roles.length) {
        return res.status(500).json({
          success: false,
          message: "Staff role is not configured",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const isTemporary = Boolean(temporary_password || must_change_password);

      // Staff accounts remain pending for administrator activation / approval
      const accountStatus = "pending";

      await connection.beginTransaction();

      // Insert User
      const [userResult] = await connection.execute(
        `INSERT INTO users
          (role_id, hospital_id, department_id, designation_id, full_name, email,
           phone, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roles[0].id,
          assignedHospitalId,
          assignedDepartmentId,
          assignedDesignationId,
          full_name.trim(),
          normalizedEmail,
          phone ? phone.trim() : null,
          passwordHash,
          accountStatus,
          isTemporary,
        ]
      );
      const newStaffId = userResult.insertId;

      // Insert Staff Profile (Lesson 4.6 & 4.8)
      await connection.execute(
        `INSERT INTO staff_profiles
          (user_id, employee_id, shift_timing, permissions)
         VALUES (?, ?, ?, ?)`,
        [
          newStaffId,
          employee_id ? String(employee_id).trim() : null,
          shift_timing ? String(shift_timing).trim() : null,
          JSON.stringify(assignedPermissions),
        ]
      );

      await connection.commit();

      await logAudit({
        actorId: req.user.id,
        action: "STAFF_ACCOUNT_CREATED",
        targetType: "user",
        targetId: newStaffId,
        details: {
          hospitalId: assignedHospitalId,
          departmentId: assignedDepartmentId,
          designationId: assignedDesignationId,
          employeeId: employee_id,
          permissionsCount: Array.isArray(assignedPermissions) ? assignedPermissions.length : Object.keys(assignedPermissions).length,
        },
        ipAddress: req.ip,
      });

      // Module 7 (Lesson 7.1): Dispatch registration received notification (asynchronous, non-blocking)
      notifyAccountPendingReview({
        user: {
          id: newStaffId,
          email: normalizedEmail,
          full_name: full_name.trim(),
          hospital_id: assignedHospitalId,
        },
        role: "staff",
        hospitalName: hospitals[0]?.name,
        departmentName: assignedDepartmentId ? (await pool.execute("SELECT name FROM departments WHERE id = ?", [assignedDepartmentId]))[0][0]?.name : null,
      }).catch((notifErr) => console.error("[Notification] Staff pending email error:", notifErr.message));

      return res.status(201).json({
        success: true,
        message: "Staff account and profile created successfully (pending approval)",
        data: {
          id: newStaffId,
          full_name: full_name.trim(),
          email: normalizedEmail,
          hospital_id: assignedHospitalId,
          department_id: assignedDepartmentId,
          designation_id: assignedDesignationId,
          status: accountStatus,
          employee_id: employee_id ? String(employee_id).trim() : null,
          shift_timing: shift_timing ? String(shift_timing).trim() : null,
          permissions: assignedPermissions,
          must_change_password: isTemporary,
        },
      });
    } catch (error) {
      await connection.rollback();
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }
      console.error("Failed to create staff account:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create staff account",
      });
    } finally {
      connection.release();
    }
  }
);

/**
 * PATCH /api/staff/:id
 * Update Staff account, designation, department, and granular permissions
 * Permissions:
 * - Super Admin: Full edit capability
 * - Hospital Admin: Edit staff within their hospital
 * - Staff: Edit their own direct contact phone and shift timing (strictly forbidden from self-approving or granting permissions)
 */
router.patch("/:id", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const staffId = Number(req.params.id);
    if (!Number.isSafeInteger(staffId) || staffId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const [existing] = await connection.execute(
      `SELECT u.id, u.hospital_id, u.department_id, u.designation_id, u.status, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND r.name = 'staff'
       LIMIT 1`,
      [staffId]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found",
      });
    }
    const currentStaff = existing[0];

    const isSuperAdmin = req.user.role === "super_admin";
    const isHospitalAdmin =
      req.user.role === "hospital_admin" &&
      req.user.hospitalId === currentStaff.hospital_id;
    const isSelfStaff = req.user.role === "staff" && req.user.id === staffId;

    if (!isSuperAdmin && !isHospitalAdmin && !isSelfStaff) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this staff profile",
      });
    }

    const {
      full_name,
      phone,
      department_id,
      designation_id,
      status,
      employee_id,
      shift_timing,
      permissions,
    } = req.body || {};

    const userUpdates = [];
    const userValues = [];

    const profileUpdates = [];
    const profileValues = [];

    // Fields editable by Admin & Self:
    if (phone !== undefined) {
      userUpdates.push("phone = ?");
      userValues.push(phone ? String(phone).trim() : null);
    }

    if (shift_timing !== undefined) {
      profileUpdates.push("shift_timing = ?");
      profileValues.push(shift_timing ? String(shift_timing).trim() : null);
    }

    // Administrative-only updates:
    if (full_name !== undefined) {
      if (isSelfStaff && !isHospitalAdmin && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: "Legal name changes require administrative approval",
        });
      }
      if (typeof full_name !== "string" || !full_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty",
        });
      }
      userUpdates.push("full_name = ?");
      userValues.push(full_name.trim());
    }

    if (employee_id !== undefined) {
      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can modify employee IDs",
        });
      }
      profileUpdates.push("employee_id = ?");
      profileValues.push(employee_id ? String(employee_id).trim() : null);
    }

    if (department_id !== undefined) {
      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can update department assignment",
        });
      }
      if (department_id === null || department_id === "") {
        userUpdates.push("department_id = NULL");
      } else {
        const dId = Number(department_id);
        const [depts] = await connection.execute(
          "SELECT id FROM departments WHERE id = ? AND hospital_id = ? AND status = 'active'",
          [dId, currentStaff.hospital_id]
        );
        if (!depts.length) {
          return res.status(400).json({
            success: false,
            message: "Department must belong to the staff member's hospital and be active",
          });
        }
        userUpdates.push("department_id = ?");
        userValues.push(dId);
      }
    }

    if (designation_id !== undefined) {
      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can update designation assignment",
        });
      }
      if (designation_id === null || designation_id === "") {
        userUpdates.push("designation_id = NULL");
      } else {
        const desId = Number(designation_id);
        const [desigs] = await connection.execute(
          "SELECT id, name FROM designations WHERE id = ? AND (hospital_id IS NULL OR hospital_id = ?) AND status = 'active'",
          [desId, currentStaff.hospital_id]
        );
        if (!desigs.length) {
          return res.status(400).json({
            success: false,
            message: "Designation must be active and valid for this hospital",
          });
        }
        userUpdates.push("designation_id = ?");
        userValues.push(desId);
      }
    }

    if (permissions !== undefined) {
      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can modify permission grants (self-elevation forbidden)",
        });
      }
      profileUpdates.push("permissions = ?");
      profileValues.push(JSON.stringify(permissions));
    }

    if (status !== undefined) {
      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can modify account status (self-approval forbidden)",
        });
      }
      if (!["active", "inactive", "pending", "suspended"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be active, inactive, pending, or suspended",
        });
      }
      userUpdates.push("status = ?");
      userValues.push(status);
    }

    if (!userUpdates.length && !profileUpdates.length) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    await connection.beginTransaction();

    if (userUpdates.length) {
      userValues.push(staffId);
      await connection.execute(
        `UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`,
        userValues
      );
    }

    if (profileUpdates.length) {
      // Upsert staff profile if record doesn't exist yet
      const [spCheck] = await connection.execute(
        "SELECT user_id FROM staff_profiles WHERE user_id = ?",
        [staffId]
      );
      if (spCheck.length === 0) {
        await connection.execute(
          "INSERT INTO staff_profiles (user_id) VALUES (?)",
          [staffId]
        );
      }
      profileValues.push(staffId);
      await connection.execute(
        `UPDATE staff_profiles SET ${profileUpdates.join(", ")} WHERE user_id = ?`,
        profileValues
      );
    }

    await connection.commit();

    const [updatedRows] = await connection.execute(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        u.hospital_id,
        u.department_id,
        u.designation_id,
        sp.employee_id,
        sp.shift_timing,
        sp.permissions,
        u.updated_at
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.id = ? LIMIT 1`,
      [staffId]
    );

    const updated = updatedRows[0];
    let parsedPerms = updated?.permissions;
    if (typeof parsedPerms === "string") {
      try {
        parsedPerms = JSON.parse(parsedPerms);
      } catch {
        parsedPerms = [];
      }
    }

    return res.json({
      success: true,
      message: "Staff profile updated successfully",
      data: {
        ...updated,
        permissions: parsedPerms || [],
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update staff profile:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update staff profile",
    });
  } finally {
    connection.release();
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.6: Register Patient by Hospital Staff or Admin
 * ----------------------------------------------------
 */
router.post(
  "/patients",
  allowRoles("hospital_admin", "staff"),
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      // 1. Enforce permission if role is staff
      if (req.user.role === "staff") {
        const [staffRows] = await connection.execute(
          `SELECT sp.permissions, des.name AS designation_name, u.full_name
           FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           LEFT JOIN designations des ON des.id = u.designation_id
           WHERE u.id = ? LIMIT 1`,
          [req.user.id]
        );

        let perms = [];
        if (staffRows.length && staffRows[0].permissions) {
          try {
            perms =
              typeof staffRows[0].permissions === "string"
                ? JSON.parse(staffRows[0].permissions)
                : staffRows[0].permissions;
          } catch {
            perms = [];
          }
        }

        const desName = (staffRows[0]?.designation_name || "").toLowerCase();
        const userName = (staffRows[0]?.full_name || "").toLowerCase();
        const hasPerm =
          Array.isArray(perms) &&
          (perms.includes("patient_registration") || perms.includes("*"));
        const isReceptionist =
          desName.includes("reception") ||
          desName.includes("front desk") ||
          userName.includes("desk staff") ||
          userName.includes("reception");

        if (!hasPerm && !isReceptionist) {
          return res.status(403).json({
            success: false,
            message:
              "Forbidden: Your staff account does not have 'patient_registration' permission.",
          });
        }
      }

      // 2. Derive hospital strictly from authenticated token
      const hospitalId = Number(req.user.hospitalId);
      if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
        return res.status(403).json({
          success: false,
          message: "No active hospital assignment found for your staff account.",
        });
      }

      const {
        full_name,
        email,
        phone,
        password,
        dob,
        gender,
        blood_group,
        address_line1,
        emergency_contact_name,
        emergency_contact_phone,
      } = req.body || {};

      if (
        !full_name ||
        typeof full_name !== "string" ||
        !full_name.trim() ||
        full_name.trim().length > 150
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid patient full name is required (maximum 150 characters).",
        });
      }

      if (!validEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "A valid email address is required.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if patient already exists
      const [existing] = await connection.execute(
        `SELECT u.id, u.full_name, u.email, u.status, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.email = ? LIMIT 1`,
        [normalizedEmail]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: `An account with email '${normalizedEmail}' is already registered in the system.`,
          data: {
            existingUserId: existing[0].id,
            fullName: existing[0].full_name,
            role: existing[0].role,
            status: existing[0].status,
          },
        });
      }

      const [patientRoles] = await connection.execute(
        "SELECT id FROM roles WHERE name = 'patient' LIMIT 1"
      );
      if (!patientRoles.length) {
        return res.status(500).json({
          success: false,
          message: "Patient role is not configured in the system.",
        });
      }

      // Password generation or hashing
      let finalPassword = password;
      let mustChange = false;

      if (!finalPassword) {
        finalPassword = crypto.randomBytes(8).toString("base64").slice(0, 14) + "A1!";
        mustChange = true;
      } else if (!validPassword(finalPassword)) {
        return res.status(400).json({
          success: false,
          message: "If providing a password, it must be at least 12 characters long.",
        });
      }

      const passwordHash = await bcrypt.hash(finalPassword, 12);

      await connection.beginTransaction();

      // In-person staff registration activates the patient immediately
      const [insertUser] = await connection.execute(
        `INSERT INTO users
           (role_id, full_name, email, phone, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [
          patientRoles[0].id,
          full_name.trim(),
          normalizedEmail,
          phone ? String(phone).trim() : null,
          passwordHash,
          mustChange,
        ]
      );

      const newPatientId = insertUser.insertId;

      // Initialize patient profile with staff registration metadata
      const isComplete = Boolean(
        dob &&
          gender &&
          blood_group &&
          address_line1 &&
          emergency_contact_name &&
          emergency_contact_phone
      );

      await connection.execute(
        `INSERT INTO patient_profiles
           (user_id, dob, gender, blood_group, address_line1,
            emergency_contact_name, emergency_contact_phone,
            is_profile_completed, registered_by_staff_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newPatientId,
          dob || null,
          gender ? String(gender).trim().toLowerCase() : null,
          blood_group ? String(blood_group).trim().toUpperCase() : null,
          address_line1 ? String(address_line1).trim() : null,
          emergency_contact_name ? String(emergency_contact_name).trim() : null,
          emergency_contact_phone ? String(emergency_contact_phone).trim() : null,
          isComplete,
          req.user.id,
        ]
      );

      await connection.commit();

      await logAudit({
        actorId: req.user.id,
        action: "PATIENT_REGISTERED_BY_STAFF",
        targetType: "user",
        targetId: newPatientId,
        details: {
          hospitalId,
          registeredByStaffId: req.user.id,
          role: req.user.role,
          mustChangePassword: mustChange,
        },
        ipAddress: req.ip,
      });

      return res.status(201).json({
        success: true,
        message: "Patient registered successfully by hospital staff.",
        data: {
          id: newPatientId,
          full_name: full_name.trim(),
          email: normalizedEmail,
          role: "patient",
          status: "active",
          hospital_id: hospitalId,
          registered_by_staff_id: req.user.id,
          temporary_password: mustChange ? finalPassword : null,
          must_change_password: mustChange,
          is_profile_completed: isComplete,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Staff patient registration failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to complete patient registration.",
      });
    } finally {
      connection.release();
    }
  }
);

module.exports = router;

