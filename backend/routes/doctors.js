const express = require("express");
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
 * GET /api/doctors
 * List doctors based on user authority:
 * - Super Admin: all doctors or filtered by hospital_id, department_id, search, status
 * - Hospital Admin: doctors belonging to their hospital
 * - Doctor/Staff/Patient: active doctors for appointment scheduling/viewing
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
        d.master_department_id,
        u.designation_id,
        des.name AS designation_name,
        dp.experience_years,
        dp.qualifications,
        dp.specialization,
        dp.license_number,
        dp.license_expiry_date,
        dp.consultation_fee,
        dp.bio,
        u.must_change_password,
        u.credentials_sent_at,
        u.credential_delivery_status,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
      LEFT JOIN hospitals h ON h.id = u.hospital_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
    `;

    const conditions = [];
    const params = [];

    // Role-based isolation
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
      // Patients, Doctors, Staff: only active doctors in active hospitals
      conditions.push("u.status = 'active'");
      if (hospital_id) {
        conditions.push("u.hospital_id = ?");
        params.push(Number(hospital_id));
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
        "(u.full_name LIKE ? OR u.email LIKE ? OR dp.specialization LIKE ? OR des.name LIKE ? OR d.name LIKE ?)"
      );
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY u.full_name ASC";

    const [doctors] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    console.error("Failed to fetch doctors:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve doctors",
    });
  }
});

/**
 * GET /api/doctors/:id
 * Retrieve single doctor details including complete professional profile
 */
router.get("/:id", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
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
        dp.experience_years,
        dp.qualifications,
        dp.specialization,
        dp.license_number,
        dp.license_expiry_date,
        dp.consultation_fee,
        dp.bio,
        u.must_change_password,
        u.credentials_sent_at,
        u.credential_delivery_status,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
      LEFT JOIN hospitals h ON h.id = u.hospital_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN designations des ON des.id = u.designation_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
      WHERE u.id = ?
      LIMIT 1`,
      [doctorId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const doctor = rows[0];

    // Hospital Admin isolation check
    if (
      req.user.role === "hospital_admin" &&
      doctor.hospital_id !== req.user.hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot access doctors outside your assigned hospital",
      });
    }

    return res.json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    console.error("Failed to fetch doctor details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve doctor details",
    });
  }
});

/**
 * POST /api/doctors
 * Lessons 4.3, 4.4, 4.5: Create Doctor Account & Professional Profile
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
        experience_years,
        qualifications,
        specialization,
        license_number,
        license_expiry_date,
        consultation_fee,
        bio,
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

      // 3. Department Validation (Lesson 4.4)
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
            message: "Department must belong to the doctor's assigned active hospital",
          });
        }
        assignedDepartmentId = dId;
      }

      // 4. Designation Validation (Lesson 4.4)
      let assignedDesignationId = null;
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
            message: "Designation must be an active global title or belong to the doctor's assigned hospital",
          });
        }
        assignedDesignationId = desId;
      }

      // 5. Professional Profile Validations (Lesson 4.5)
      let fee = 0.0;
      if (consultation_fee !== undefined && consultation_fee !== null && consultation_fee !== "") {
        const parsedFee = Number(consultation_fee);
        if (isNaN(parsedFee) || parsedFee < 0) {
          return res.status(400).json({
            success: false,
            message: "Consultation fee cannot be negative",
          });
        }
        fee = parsedFee;
      }

      let expYears = 0;
      if (experience_years !== undefined && experience_years !== null && experience_years !== "") {
        const parsedExp = Number(experience_years);
        if (!Number.isInteger(parsedExp) || parsedExp < 0 || parsedExp > 80) {
          return res.status(400).json({
            success: false,
            message: "Years of experience must be a non-negative integer up to 80",
          });
        }
        expYears = parsedExp;
      }

      // Validate license expiry date format if provided
      let cleanExpiryDate = null;
      if (license_expiry_date) {
        const d = new Date(license_expiry_date);
        if (isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid license expiry date format (use YYYY-MM-DD)",
          });
        }
        cleanExpiryDate = license_expiry_date;
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

      // Fetch Doctor Role
      const [roles] = await connection.execute(
        "SELECT id FROM roles WHERE name = 'doctor' LIMIT 1"
      );
      if (!roles.length) {
        return res.status(500).json({
          success: false,
          message: "Doctor role is not configured",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const isTemporary = Boolean(temporary_password || must_change_password);

      // Newly created doctor accounts remain pending for administrator approval
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
      const newDoctorId = userResult.insertId;

      // Insert Doctor Profile (Lesson 4.5)
      await connection.execute(
        `INSERT INTO doctor_profiles
          (user_id, experience_years, qualifications, specialization,
           license_number, license_expiry_date, consultation_fee, bio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newDoctorId,
          expYears,
          qualifications ? qualifications.trim() : null,
          specialization ? specialization.trim() : null,
          license_number ? license_number.trim() : null,
          cleanExpiryDate,
          fee,
          bio ? bio.trim() : null,
        ]
      );

      await connection.commit();

      await logAudit({
        actorId: req.user.id,
        action: "DOCTOR_ACCOUNT_CREATED",
        targetType: "user",
        targetId: newDoctorId,
        details: {
          hospitalId: assignedHospitalId,
          departmentId: assignedDepartmentId,
          designationId: assignedDesignationId,
          specialization,
          consultationFee: fee,
        },
        ipAddress: req.ip,
      });

      // Module 7 (Lesson 7.1): Dispatch registration received notification (asynchronous, non-blocking)
      notifyAccountPendingReview({
        user: {
          id: newDoctorId,
          email: normalizedEmail,
          full_name: full_name.trim(),
          hospital_id: assignedHospitalId,
        },
        role: "doctor",
        hospitalName: hospitals[0]?.name,
        departmentName: assignedDepartmentId ? (await pool.execute("SELECT name FROM departments WHERE id = ?", [assignedDepartmentId]))[0][0]?.name : null,
      }).catch((notifErr) => console.error("[Notification] Doctor pending email error:", notifErr.message));

      return res.status(201).json({
        success: true,
        message: "Doctor account and professional profile created successfully (pending approval)",
        data: {
          id: newDoctorId,
          full_name: full_name.trim(),
          email: normalizedEmail,
          hospital_id: assignedHospitalId,
          department_id: assignedDepartmentId,
          designation_id: assignedDesignationId,
          status: accountStatus,
          experience_years: expYears,
          qualifications: qualifications ? qualifications.trim() : null,
          specialization: specialization ? specialization.trim() : null,
          license_number: license_number ? license_number.trim() : null,
          consultation_fee: fee,
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
      console.error("Failed to create doctor account:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create doctor account",
      });
    } finally {
      connection.release();
    }
  }
);

/**
 * PATCH /api/doctors/:id
 * Update Doctor account & professional profile
 * Permissions:
 * - Super Admin: Full edit capability
 * - Hospital Admin: Edit doctors within their hospital
 * - Doctor: Edit their own bio, contact phone, and consultation fee (strictly forbidden from self-approving or changing hospital)
 */
router.patch("/:id", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const [existing] = await connection.execute(
      `SELECT u.id, u.hospital_id, u.department_id, u.designation_id, u.status, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND r.name = 'doctor'
       LIMIT 1`,
      [doctorId]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }
    const currentDoc = existing[0];

    const isSuperAdmin = req.user.role === "super_admin";
    const isHospitalAdmin =
      req.user.role === "hospital_admin" &&
      req.user.hospitalId === currentDoc.hospital_id;
    const isSelfDoctor = req.user.role === "doctor" && req.user.id === doctorId;

    if (!isSuperAdmin && !isHospitalAdmin && !isSelfDoctor) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this doctor profile",
      });
    }

    const {
      full_name,
      phone,
      department_id,
      designation_id,
      status,
      experience_years,
      qualifications,
      specialization,
      license_number,
      license_expiry_date,
      consultation_fee,
      bio,
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

    if (bio !== undefined) {
      profileUpdates.push("bio = ?");
      profileValues.push(bio ? String(bio).trim() : null);
    }

    if (specialization !== undefined) {
      profileUpdates.push("specialization = ?");
      profileValues.push(specialization ? String(specialization).trim() : null);
    }

    if (qualifications !== undefined) {
      profileUpdates.push("qualifications = ?");
      profileValues.push(qualifications ? String(qualifications).trim() : null);
    }

    if (consultation_fee !== undefined) {
      const parsedFee = Number(consultation_fee);
      if (isNaN(parsedFee) || parsedFee < 0) {
        return res.status(400).json({
          success: false,
          message: "Consultation fee cannot be negative",
        });
      }
      profileUpdates.push("consultation_fee = ?");
      profileValues.push(parsedFee);
    }

    if (experience_years !== undefined) {
      const parsedExp = Number(experience_years);
      if (!Number.isInteger(parsedExp) || parsedExp < 0 || parsedExp > 80) {
        return res.status(400).json({
          success: false,
          message: "Years of experience must be a non-negative integer up to 80",
        });
      }
      profileUpdates.push("experience_years = ?");
      profileValues.push(parsedExp);
    }

    // License info:
    if (license_number !== undefined) {
      profileUpdates.push("license_number = ?");
      profileValues.push(license_number ? String(license_number).trim() : null);
    }

    if (license_expiry_date !== undefined) {
      if (license_expiry_date === null || license_expiry_date === "") {
        profileUpdates.push("license_expiry_date = NULL");
      } else {
        const d = new Date(license_expiry_date);
        if (isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid license expiry date format (use YYYY-MM-DD)",
          });
        }
        profileUpdates.push("license_expiry_date = ?");
        profileValues.push(license_expiry_date);
      }
    }

    // Administrative-only updates:
    if (full_name !== undefined) {
      if (isSelfDoctor && !isHospitalAdmin && !isSuperAdmin) {
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
          [dId, currentDoc.hospital_id]
        );
        if (!depts.length) {
          return res.status(400).json({
            success: false,
            message: "Department must belong to the doctor's hospital and be active",
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
          "SELECT id FROM designations WHERE id = ? AND (hospital_id IS NULL OR hospital_id = ?) AND status = 'active'",
          [desId, currentDoc.hospital_id]
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
      userValues.push(doctorId);
      await connection.execute(
        `UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`,
        userValues
      );
    }

    if (profileUpdates.length) {
      // Upsert doctor profile in case missing
      const [pCheck] = await connection.execute(
        "SELECT user_id FROM doctor_profiles WHERE user_id = ?",
        [doctorId]
      );
      if (pCheck.length === 0) {
        await connection.execute(
          "INSERT INTO doctor_profiles (user_id) VALUES (?)",
          [doctorId]
        );
      }
      profileValues.push(doctorId);
      await connection.execute(
        `UPDATE doctor_profiles SET ${profileUpdates.join(", ")} WHERE user_id = ?`,
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
        dp.experience_years,
        dp.qualifications,
        dp.specialization,
        dp.license_number,
        dp.license_expiry_date,
        dp.consultation_fee,
        dp.bio,
        u.updated_at
      FROM users u
      LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
      WHERE u.id = ? LIMIT 1`,
      [doctorId]
    );

    return res.json({
      success: true,
      message: "Doctor profile updated successfully",
      data: updatedRows[0] || null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update doctor profile:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update doctor profile",
    });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 6.2 — Doctor Availability, Recurring Schedules, Leaves & Dynamic Slots
 * ============================================================================
 */

const {
  parseTimeToMinutes,
  computeDoctorAvailableSlots,
} = require("../services/scheduleService");

const VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NUMERIC_TO_DAY = {
  0: "sunday",
  "0": "sunday",
  1: "monday",
  "1": "monday",
  2: "tuesday",
  "2": "tuesday",
  3: "wednesday",
  "3": "wednesday",
  4: "thursday",
  "4": "thursday",
  5: "friday",
  "5": "friday",
  6: "saturday",
  "6": "saturday",
  7: "sunday",
  "7": "sunday",
};

/**
 * Check if current user can edit doctor schedule/leaves
 */
async function canManageDoctor(reqUser, doctorId) {
  if (reqUser.role === "super_admin") return true;
  if (reqUser.role === "doctor" && Number(reqUser.id) === Number(doctorId)) return true;

  if (reqUser.role === "hospital_admin") {
    const [rows] = await pool.execute(
      "SELECT hospital_id FROM users WHERE id = ? LIMIT 1",
      [doctorId]
    );
    if (rows.length && Number(rows[0].hospital_id) === Number(reqUser.hospitalId)) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/doctors/:id/schedules
 * Fetch weekly recurring availability schedules for doctor
 */
router.get("/:id/schedules", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    const [schedules] = await pool.execute(
      `SELECT id, doctor_id, hospital_id, day_of_week, start_time, end_time,
              slot_duration_minutes, break_start, break_end, is_available, updated_at
       FROM doctor_schedules
       WHERE doctor_id = ?
       ORDER BY FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
      [doctorId]
    );

    return res.json({
      success: true,
      doctor_id: doctorId,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    console.error("Fetch doctor schedules error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve doctor schedules." });
  }
});

/**
 * PUT /api/doctors/:id/schedules
 * Set/update doctor recurring weekly schedules
 */
router.put("/:id/schedules", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    const authorized = await canManageDoctor(req.user, doctorId);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this doctor's schedule.",
      });
    }

    // Verify doctor exists and get hospital_id
    const [docRows] = await pool.execute(
      "SELECT id, hospital_id, status FROM users WHERE id = ? LIMIT 1",
      [doctorId]
    );
    if (!docRows.length) {
      return res.status(404).json({ success: false, message: "Doctor not found." });
    }
    const hospitalId = docRows[0].hospital_id;

    const payload = req.body;
    const scheduleItems = Array.isArray(payload.schedules)
      ? payload.schedules
      : Array.isArray(payload)
      ? payload
      : [payload];

    if (!scheduleItems.length) {
      return res.status(400).json({ success: false, message: "No schedule entries provided." });
    }

    // Validate each entry
    for (const item of scheduleItems) {
      const rawDay = String(item.day_of_week !== undefined && item.day_of_week !== null ? item.day_of_week : "").toLowerCase().trim();
      const day = NUMERIC_TO_DAY[rawDay] || rawDay;
      item.day_of_week = day;

      if (!VALID_DAYS.includes(day)) {
        return res.status(400).json({
          success: false,
          message: `Invalid day_of_week: '${rawDay}'. Must be one of: ${VALID_DAYS.join(", ")}.`,
        });
      }

      const startMins = parseTimeToMinutes(item.start_time);
      const endMins = parseTimeToMinutes(item.end_time);

      if (startMins === null || endMins === null) {
        return res.status(400).json({
          success: false,
          message: `Invalid start_time or end_time for ${day}. Format should be HH:MM or HH:MM:SS.`,
        });
      }

      if (startMins >= endMins) {
        return res.status(400).json({
          success: false,
          message: `Daily start_time must be strictly earlier than end_time for ${day}.`,
        });
      }

      if (item.break_start || item.break_end) {
        const breakStartMins = parseTimeToMinutes(item.break_start);
        const breakEndMins = parseTimeToMinutes(item.break_end);

        if (breakStartMins === null || breakEndMins === null) {
          return res.status(400).json({
            success: false,
            message: `Both break_start and break_end must be provided with valid format for ${day}.`,
          });
        }

        if (breakStartMins >= breakEndMins) {
          return res.status(400).json({
            success: false,
            message: `break_start must be earlier than break_end for ${day}.`,
          });
        }

        if (breakStartMins < startMins || breakEndMins > endMins) {
          return res.status(400).json({
            success: false,
            message: `Break period must fall completely within working hours (${item.start_time} - ${item.end_time}) for ${day}.`,
          });
        }
      }

      const slotDuration = Number(item.slot_duration_minutes || 30);
      if (isNaN(slotDuration) || slotDuration < 10 || slotDuration > 120) {
        return res.status(400).json({
          success: false,
          message: "slot_duration_minutes must be an integer between 10 and 120 minutes.",
        });
      }
    }

    // Upsert into doctor_schedules
    for (const item of scheduleItems) {
      const rawDay = String(item.day_of_week).toLowerCase().trim();
      const day = NUMERIC_TO_DAY[rawDay] || rawDay;
      const slotDuration = Number(item.slot_duration_minutes || 30);
      const isAvailable = item.is_available !== false;
      const breakStart = item.break_start || null;
      const breakEnd = item.break_end || null;

      await pool.execute(
        `INSERT INTO doctor_schedules
           (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, break_start, break_end, is_available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           slot_duration_minutes = VALUES(slot_duration_minutes),
           break_start = VALUES(break_start),
           break_end = VALUES(break_end),
           is_available = VALUES(is_available),
           updated_at = CURRENT_TIMESTAMP`,
        [
          doctorId,
          hospitalId,
          day,
          item.start_time,
          item.end_time,
          slotDuration,
          breakStart,
          breakEnd,
          isAvailable,
        ]
      );
    }

    const [updatedSchedules] = await pool.execute(
      `SELECT id, doctor_id, hospital_id, day_of_week, start_time, end_time,
              slot_duration_minutes, break_start, break_end, is_available
       FROM doctor_schedules
       WHERE doctor_id = ?
       ORDER BY FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
      [doctorId]
    );

    return res.json({
      success: true,
      message: "Doctor schedule updated successfully.",
      count: updatedSchedules.length,
      data: updatedSchedules,
    });
  } catch (error) {
    console.error("Save doctor schedule error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to save doctor schedule." });
  }
});

/**
 * GET /api/doctors/:id/leaves
 * List doctor leave dates
 */
router.get("/:id/leaves", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    const [leaves] = await pool.execute(
      "SELECT id, doctor_id, DATE_FORMAT(leave_date, '%Y-%m-%d') AS leave_date, reason, created_at FROM doctor_leaves WHERE doctor_id = ? ORDER BY leave_date ASC",
      [doctorId]
    );

    return res.json({
      success: true,
      doctor_id: doctorId,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    console.error("Fetch doctor leaves error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve doctor leaves." });
  }
});

/**
 * POST /api/doctors/:id/leaves
 * Mark specific date as unavailable (leave / holiday)
 */
router.post("/:id/leaves", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    const authorized = await canManageDoctor(req.user, doctorId);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this doctor's leave records.",
      });
    }

    const { leave_date, reason } = req.body || {};
    if (!leave_date || typeof leave_date !== "string") {
      return res.status(400).json({ success: false, message: "leave_date is required (YYYY-MM-DD)." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(`${leave_date}T00:00:00Z`);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid leave_date format (YYYY-MM-DD)." });
    }

    const todayYear = today.getFullYear();
    const todayMonth = String(today.getMonth() + 1).padStart(2, "0");
    const todayDay = String(today.getDate()).padStart(2, "0");
    const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

    if (leave_date < todayStr) {
      return res.status(400).json({ success: false, message: "Leave date cannot be in the past." });
    }

    // Insert or update leave record
    await pool.execute(
      `INSERT INTO doctor_leaves (doctor_id, leave_date, reason)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [doctorId, leave_date, (reason || "").trim() || "Doctor Leave / Holiday"]
    );

    const [leaveRows] = await pool.execute(
      "SELECT id, doctor_id, DATE_FORMAT(leave_date, '%Y-%m-%d') AS leave_date, reason, created_at FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ? LIMIT 1",
      [doctorId, leave_date]
    );

    return res.status(201).json({
      success: true,
      message: "Doctor leave date scheduled successfully.",
      data: leaveRows[0],
    });
  } catch (error) {
    console.error("Add doctor leave error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to schedule doctor leave." });
  }
});

/**
 * DELETE /api/doctors/:id/leaves/:leaveId
 * Remove leave date
 */
router.delete("/:id/leaves/:leaveId", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const leaveId = Number(req.params.leaveId);

    const authorized = await canManageDoctor(req.user, doctorId);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to manage this doctor's leave records.",
      });
    }

    const [deleteRes] = await pool.execute(
      "DELETE FROM doctor_leaves WHERE id = ? AND doctor_id = ?",
      [leaveId, doctorId]
    );

    if (deleteRes.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Leave record not found." });
    }

    return res.json({
      success: true,
      message: "Leave record cancelled successfully.",
    });
  } catch (error) {
    console.error("Delete doctor leave error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to delete doctor leave." });
  }
});

/**
 * GET /api/doctors/:id/available-slots?date=YYYY-MM-DD
 * Dynamic slot computation for a doctor on a specific date
 */
router.get("/:id/available-slots", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const { date } = req.query;

    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    if (!date) {
      return res.status(400).json({ success: false, message: "date parameter is required (YYYY-MM-DD)." });
    }

    const result = await computeDoctorAvailableSlots(pool, doctorId, date);
    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json({
      ...result,
      data: result.available_slots || [],
    });
  } catch (error) {
    console.error("Available slots computation error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to compute available slots." });
  }
});

module.exports = router;

