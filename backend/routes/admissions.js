const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();
router.use(requireAuth);

/**
 * Valid admission statuses and allowed state transitions (Lesson 9.4)
 */
const VALID_ADMISSION_STATUSES = ["pending", "admitted", "discharged", "cancelled"];
const ACTIVE_STATUSES = ["pending", "admitted"];

const ALLOWED_ADMISSION_TRANSITIONS = {
  pending: ["admitted", "cancelled"],
  admitted: ["discharged"],
  discharged: [], // Terminal state
  cancelled: [],  // Terminal state
};

/**
 * Generate formatted admission tracking number (Lesson 9.1)
 */
function generateAdmissionNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ADM-${year}${month}${day}-${rand}`;
}

/**
 * Format and validate admission date/time (Lesson 9.3)
 */
function parseAndValidateAdmissionDate(dateInput) {
  if (!dateInput) {
    return { valid: false, message: "Admission date and time is required." };
  }

  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) {
    return { valid: false, message: "Invalid admission date and time format." };
  }

  // Reject dates more than 30 days in the future
  const maxFuture = new Date();
  maxFuture.setDate(maxFuture.getDate() + 30);
  if (parsed.getTime() > maxFuture.getTime()) {
    return {
      valid: false,
      message: "Admission date cannot be scheduled more than 30 days in advance.",
    };
  }

  // Format to MySQL DATETIME: YYYY-MM-DD HH:mm:ss
  const pad = (n) => String(n).padStart(2, "0");
  const mysqlDateTime = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate()
  )} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;

  return { valid: true, mysqlDateTime, parsedDate: parsed };
}

/**
 * Validate admission reason (Lesson 9.3)
 */
function validateAdmissionReason(reason) {
  if (!reason || typeof reason !== "string") {
    return { valid: false, message: "Admission reason is mandatory." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { valid: false, message: "Admission reason must be at least 5 characters long." };
  }
  if (trimmed.length > 1000) {
    return { valid: false, message: "Admission reason cannot exceed 1000 characters." };
  }
  return { valid: true, sanitized: trimmed };
}

/**
 * Validate all related entities and cross-hospital relationships (Lesson 9.2)
 */
async function validateAdmissionEntities(connection, {
  patient_id,
  hospital_id,
  doctor_id,
  department_id,
  appointment_id = null,
}) {
  // 1. Validate Patient
  const [patientRows] = await connection.execute(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [patient_id]
  );

  if (!patientRows.length) {
    return { valid: false, status: 404, message: "Patient record not found." };
  }
  const patient = patientRows[0];
  if (patient.role !== "patient") {
    return { valid: false, status: 400, message: "Specified user is not a patient." };
  }
  if (patient.status !== "active") {
    return { valid: false, status: 400, message: `Patient account is ${patient.status}. Only active patients can be admitted.` };
  }

  // 2. Validate Hospital
  const [hospitalRows] = await connection.execute(
    "SELECT id, name, code, status FROM hospitals WHERE id = ? LIMIT 1",
    [hospital_id]
  );
  if (!hospitalRows.length) {
    return { valid: false, status: 404, message: "Hospital not found." };
  }
  const hospital = hospitalRows[0];
  if (hospital.status !== "active") {
    return { valid: false, status: 400, message: "Selected hospital is not active." };
  }

  // 3. Validate Department belongs to the selected Hospital
  const [departmentRows] = await connection.execute(
    "SELECT id, name, hospital_id, status FROM departments WHERE id = ? LIMIT 1",
    [department_id]
  );
  if (!departmentRows.length) {
    return { valid: false, status: 404, message: "Department not found." };
  }
  const department = departmentRows[0];
  if (department.status !== "active") {
    return { valid: false, status: 400, message: "Selected department is inactive." };
  }
  if (Number(department.hospital_id) !== Number(hospital_id)) {
    return {
      valid: false,
      status: 400,
      message: "The specified department does not belong to the selected hospital.",
    };
  }

  // 4. Validate Doctor exists, is active, and is assigned to the selected Hospital and Department
  const [doctorRows] = await connection.execute(
    `SELECT u.id, u.full_name, u.email, u.status, u.hospital_id, u.department_id, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [doctor_id]
  );
  if (!doctorRows.length) {
    return { valid: false, status: 404, message: "Doctor record not found." };
  }
  const doctor = doctorRows[0];
  if (doctor.role !== "doctor") {
    return { valid: false, status: 400, message: "Specified user is not a doctor." };
  }
  if (doctor.status !== "active") {
    return { valid: false, status: 400, message: "Doctor account is not active." };
  }
  if (Number(doctor.hospital_id) !== Number(hospital_id)) {
    return {
      valid: false,
      status: 400,
      message: "The responsible doctor does not belong to the selected hospital.",
    };
  }
  if (Number(doctor.department_id) !== Number(department_id)) {
    return {
      valid: false,
      status: 400,
      message: "The responsible doctor is not assigned to the selected department.",
    };
  }

  // 5. Validate Appointment (if linked, Lesson 9.6)
  let appointment = null;
  if (appointment_id) {
    const [aptRows] = await connection.execute(
      `SELECT id, appointment_number, patient_id, hospital_id, doctor_id, department_id, status
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointment_id]
    );
    if (!aptRows.length) {
      return { valid: false, status: 404, message: "Linked appointment record not found." };
    }
    appointment = aptRows[0];
    if (Number(appointment.patient_id) !== Number(patient_id)) {
      return {
        valid: false,
        status: 400,
        message: "The linked appointment does not belong to the patient being admitted.",
      };
    }
    if (Number(appointment.hospital_id) !== Number(hospital_id)) {
      return {
        valid: false,
        status: 400,
        message: "The linked appointment is registered under a different hospital.",
      };
    }
    if (["cancelled", "rejected"].includes(appointment.status)) {
      return {
        valid: false,
        status: 400,
        message: `Cannot link an appointment with status '${appointment.status}'.`,
      };
    }
  }

  return {
    valid: true,
    patient,
    hospital,
    department,
    doctor,
    appointment,
  };
}

/**
 * Check if caller has permission for the specified hospital
 */
function verifyHospitalAccess(req, hospitalId) {
  if (req.user.role === "super_admin") return true;
  return Number(req.user.hospitalId) === Number(hospitalId);
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * Lesson 9.1 — Search eligible patients for admission
 * GET /api/admissions/patients/search?q=query
 */
router.get("/patients/search", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    if (!query || query.length < 2) {
      return res.json({ success: true, count: 0, data: [] });
    }

    const searchTerm = `%${query}%`;
    const [patients] = await pool.execute(
      `SELECT
         u.id, u.full_name, u.email, u.phone, u.status,
         pp.dob, pp.gender, pp.blood_group, pp.emergency_contact_name, pp.emergency_contact_phone,
         pp.allergies, pp.chronic_conditions,
         (SELECT COUNT(*) FROM admissions a WHERE a.patient_id = u.id AND a.status IN ('pending', 'admitted')) AS active_admissions_count
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'patient'
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.status = 'active'
         AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
       ORDER BY u.full_name ASC
       LIMIT 20`,
      [searchTerm, searchTerm, searchTerm]
    );

    return res.json({
      success: true,
      count: patients.length,
      data: patients,
    });
  } catch (error) {
    console.error("Search patients error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to search patients." });
  }
});

/**
 * Lesson 9.5 — Check if patient currently has an active admission
 * GET /api/admissions/active-check/:patient_id
 */
router.get("/active-check/:patient_id", async (req, res) => {
  try {
    const patientId = Number(req.params.patient_id);
    if (!patientId || isNaN(patientId)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID." });
    }

    // Role check: patients can only check themselves
    if (req.user.role === "patient" && Number(req.user.id) !== patientId) {
      return res.status(403).json({ success: false, message: "Unauthorized to check this patient." });
    }

    const [activeRows] = await pool.execute(
      `SELECT a.id, a.admission_number, a.status, a.admission_date, a.reason,
              h.id AS hospital_id, h.name AS hospital_name,
              d.name AS department_name,
              doc.full_name AS doctor_name
       FROM admissions a
       JOIN hospitals h ON h.id = a.hospital_id
       JOIN departments d ON d.id = a.department_id
       JOIN users doc ON doc.id = a.doctor_id
       WHERE a.patient_id = ? AND a.status IN ('pending', 'admitted')
       LIMIT 1`,
      [patientId]
    );

    const hasActiveAdmission = activeRows.length > 0;
    return res.json({
      success: true,
      hasActiveAdmission,
      activeAdmission: hasActiveAdmission ? activeRows[0] : null,
    });
  } catch (error) {
    console.error("Active admission check error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to check active admission status." });
  }
});

/**
 * Lesson 9.1 — Create New Patient Admission
 * POST /api/admissions
 */
router.post("/", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      patient_id,
      hospital_id,
      doctor_id,
      department_id,
      admission_date,
      reason,
      appointment_id = null,
      initial_status = "admitted",
    } = req.body || {};

    // 1. Mandatory parameter validation
    if (!patient_id || !hospital_id || !doctor_id || !department_id || !admission_date || !reason) {
      return res.status(400).json({
        success: false,
        message: "patient_id, hospital_id, doctor_id, department_id, admission_date, and reason are required.",
      });
    }

    // 2. Validate hospital-level data isolation for current user
    if (!verifyHospitalAccess(req, hospital_id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to create admissions for this hospital.",
      });
    }

    // 3. Validate initial status
    const statusToSet = initial_status || "admitted";
    if (!["pending", "admitted"].includes(statusToSet)) {
      return res.status(400).json({
        success: false,
        message: "Initial admission status must be either 'pending' or 'admitted'.",
      });
    }

    // 4. Validate admission date and time (Lesson 9.3)
    const dateCheck = parseAndValidateAdmissionDate(admission_date);
    if (!dateCheck.valid) {
      return res.status(400).json({ success: false, message: dateCheck.message });
    }

    // 5. Validate admission reason (Lesson 9.3)
    const reasonCheck = validateAdmissionReason(reason);
    if (!reasonCheck.valid) {
      return res.status(400).json({ success: false, message: reasonCheck.message });
    }

    // 6. Validate entity relationships (Lesson 9.2)
    const entityCheck = await validateAdmissionEntities(connection, {
      patient_id: Number(patient_id),
      hospital_id: Number(hospital_id),
      doctor_id: Number(doctor_id),
      department_id: Number(department_id),
      appointment_id: appointment_id ? Number(appointment_id) : null,
    });

    if (!entityCheck.valid) {
      return res.status(entityCheck.status || 400).json({
        success: false,
        message: entityCheck.message,
      });
    }

    // 7. Start Transaction: Pessimistic Lock to Prevent Duplicate Active Admissions (Lesson 9.5)
    await connection.beginTransaction();

    const [activeCheck] = await connection.execute(
      `SELECT id, admission_number, status, admission_date
       FROM admissions
       WHERE patient_id = ? AND status IN ('pending', 'admitted')
       LIMIT 1 FOR UPDATE`,
      [Number(patient_id)]
    );

    if (activeCheck.length > 0) {
      await connection.rollback();
      const existing = activeCheck[0];
      return res.status(409).json({
        success: false,
        message: `Patient already has an active admission (${existing.admission_number}, Status: '${existing.status}'). A patient cannot have multiple active admissions simultaneously.`,
        activeAdmission: existing,
      });
    }

    // 8. Generate Admission Tracking Number & Insert Admission Record
    const admissionNumber = generateAdmissionNumber();

    const [insertResult] = await connection.execute(
      `INSERT INTO admissions
         (admission_number, patient_id, hospital_id, doctor_id, department_id,
          appointment_id, admission_date, reason, status, admitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admissionNumber,
        Number(patient_id),
        Number(hospital_id),
        Number(doctor_id),
        Number(department_id),
        appointment_id ? Number(appointment_id) : null,
        dateCheck.mysqlDateTime,
        reasonCheck.sanitized,
        statusToSet,
        req.user.id,
      ]
    );

    const admissionId = insertResult.insertId;

    // 9. Record Initial History Entry (Lesson 9.4)
    await connection.execute(
      `INSERT INTO admission_status_history
         (admission_id, previous_status, new_status, changed_by, change_reason)
       VALUES (?, NULL, ?, ?, ?)`,
      [admissionId, statusToSet, req.user.id, "Initial patient admission created"]
    );

    // 10. Lesson 9.6 — Coordinate with Appointment Lifecycle if linked
    if (appointment_id && statusToSet === "admitted") {
      const linkedApt = entityCheck.appointment;
      // If appointment is in_waiting or in_progress, transition to admitted
      if (["in_waiting", "in_progress"].includes(linkedApt.status)) {
        await connection.execute(
          `UPDATE appointments
           SET status = 'admitted', status_changed_by = ?
           WHERE id = ?`,
          [req.user.id, Number(appointment_id)]
        );

        await logAudit(
          req.user.id,
          "UPDATE_APPOINTMENT_STATUS",
          "appointment",
          Number(appointment_id),
          {
            previous_status: linkedApt.status,
            new_status: "admitted",
            admission_id: admissionId,
            admission_number: admissionNumber,
            reason: `Coordinated admission: ${admissionNumber}`,
          },
          req.ip
        );
      }
    }

    await connection.commit();

    emitHospitalEvent(Number(hospital_id), "admissions:updated", {
      action: "created",
      admissionId,
      admissionNumber,
      status: statusToSet,
      patientId: Number(patient_id),
      departmentId: Number(department_id),
    });

    // 11. Log Audit
    await logAudit(
      req.user.id,
      "CREATE_ADMISSION",
      "admission",
      admissionId,
      {
        admission_number: admissionNumber,
        patient_id: Number(patient_id),
        hospital_id: Number(hospital_id),
        doctor_id: Number(doctor_id),
        department_id: Number(department_id),
        status: statusToSet,
        appointment_id: appointment_id ? Number(appointment_id) : null,
      },
      req.ip
    );

    // 12. Retrieve Enriched Admission Record
    const [createdRows] = await pool.execute(
      `SELECT a.*,
              DATE_FORMAT(a.admission_date, '%Y-%m-%d %H:%i:%s') AS admission_date_formatted,
              pat.full_name AS patient_name,
              pat.email AS patient_email,
              pat.phone AS patient_phone,
              pp.gender AS patient_gender,
              pp.blood_group AS patient_blood_group,
              pp.dob AS patient_dob,
              h.name AS hospital_name,
              d.name AS department_name,
              doc.full_name AS doctor_name,
              doc.email AS doctor_email,
              admin_user.full_name AS admitted_by_name,
              apt.appointment_number
       FROM admissions a
       JOIN users pat ON pat.id = a.patient_id
       LEFT JOIN patient_profiles pp ON pp.user_id = pat.id
       JOIN hospitals h ON h.id = a.hospital_id
       JOIN departments d ON d.id = a.department_id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN users admin_user ON admin_user.id = a.admitted_by
       LEFT JOIN appointments apt ON apt.id = a.appointment_id
       WHERE a.id = ? LIMIT 1`,
      [admissionId]
    );

    return res.status(201).json({
      success: true,
      message: "Patient admitted successfully.",
      data: createdRows[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create admission error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create patient admission." });
  } finally {
    connection.release();
  }
});

/**
 * Lesson 9.1 — List Admissions with Filters & Hospital Isolation
 * GET /api/admissions
 */
router.get("/", async (req, res) => {
  try {
    const {
      status,
      patient_id,
      doctor_id,
      department_id,
      hospital_id,
      search,
      date_from,
      date_to,
      limit = 50,
      offset = 0,
    } = req.query;

    let sql = `
      SELECT
        a.id,
        a.admission_number,
        a.patient_id,
        a.hospital_id,
        a.doctor_id,
        a.department_id,
        a.appointment_id,
        a.admission_date,
        DATE_FORMAT(a.admission_date, '%Y-%m-%d %H:%i:%s') AS admission_date_formatted,
        a.reason,
        a.status,
        a.discharged_at,
        DATE_FORMAT(a.discharged_at, '%Y-%m-%d %H:%i:%s') AS discharged_at_formatted,
        a.discharge_notes,
        a.admitted_by,
        a.created_at,
        a.updated_at,
        pat.full_name AS patient_name,
        pat.email AS patient_email,
        pat.phone AS patient_phone,
        pp.gender AS patient_gender,
        pp.blood_group AS patient_blood_group,
        h.name AS hospital_name,
        d.name AS department_name,
        doc.full_name AS doctor_name,
        apt.appointment_number
      FROM admissions a
      JOIN users pat ON pat.id = a.patient_id
      LEFT JOIN patient_profiles pp ON pp.user_id = pat.id
      JOIN hospitals h ON h.id = a.hospital_id
      JOIN departments d ON d.id = a.department_id
      JOIN users doc ON doc.id = a.doctor_id
      LEFT JOIN appointments apt ON apt.id = a.appointment_id
      WHERE 1=1
    `;

    const params = [];

    // Role-based scoping (hospital isolation)
    if (req.user.role === "patient") {
      sql += " AND a.patient_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "doctor") {
      sql += " AND a.hospital_id = ?";
      params.push(req.user.hospitalId);
    } else if (req.user.role === "hospital_admin" || req.user.role === "staff") {
      sql += " AND a.hospital_id = ?";
      params.push(req.user.hospitalId);
    } else if (req.user.role === "super_admin" && hospital_id) {
      sql += " AND a.hospital_id = ?";
      params.push(Number(hospital_id));
    }

    // Filter by status
    if (status) {
      if (status === "active") {
        sql += " AND a.status IN ('pending', 'admitted')";
      } else if (VALID_ADMISSION_STATUSES.includes(status)) {
        sql += " AND a.status = ?";
        params.push(status);
      }
    }

    // Filter by specific patient
    if (patient_id && req.user.role !== "patient") {
      sql += " AND a.patient_id = ?";
      params.push(Number(patient_id));
    }

    // Filter by specific doctor
    if (doctor_id) {
      sql += " AND a.doctor_id = ?";
      params.push(Number(doctor_id));
    }

    // Filter by department
    if (department_id) {
      sql += " AND a.department_id = ?";
      params.push(Number(department_id));
    }

    // Date range filters
    if (date_from) {
      sql += " AND a.admission_date >= ?";
      params.push(`${date_from} 00:00:00`);
    }
    if (date_to) {
      sql += " AND a.admission_date <= ?";
      params.push(`${date_to} 23:59:59`);
    }

    // Keyword search (Patient Name, Email, Phone, Admission Number)
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += " AND (pat.full_name LIKE ? OR pat.phone LIKE ? OR pat.email LIKE ? OR a.admission_number LIKE ?)";
      params.push(q, q, q, q);
    }

    sql += " ORDER BY a.admission_date DESC, a.id DESC LIMIT ? OFFSET ?";
    params.push(Number(limit) || 50, Number(offset) || 0);

    const [rows] = await pool.query(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("List admissions error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve admissions." });
  }
});

/**
 * Lesson 9.1 & 9.4 — Get Admission Details by ID
 * GET /api/admissions/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const admissionId = Number(req.params.id);
    if (!admissionId || isNaN(admissionId)) {
      return res.status(400).json({ success: false, message: "Invalid admission ID." });
    }

    const [rows] = await pool.execute(
      `SELECT
         a.*,
         DATE_FORMAT(a.admission_date, '%Y-%m-%d %H:%i:%s') AS admission_date_formatted,
         DATE_FORMAT(a.discharged_at, '%Y-%m-%d %H:%i:%s') AS discharged_at_formatted,
         pat.full_name AS patient_name,
         pat.email AS patient_email,
         pat.phone AS patient_phone,
         pp.dob AS patient_dob,
         pp.gender AS patient_gender,
         pp.blood_group AS patient_blood_group,
         pp.allergies,
         pp.chronic_conditions,
         pp.emergency_contact_name,
         pp.emergency_contact_phone,
         h.name AS hospital_name,
         h.code AS hospital_code,
         d.name AS department_name,
         doc.full_name AS doctor_name,
         doc.email AS doctor_email,
         doc.phone AS doctor_phone,
         admitted_user.full_name AS admitted_by_name,
         apt.appointment_number,
         apt.status AS appointment_status
       FROM admissions a
       JOIN users pat ON pat.id = a.patient_id
       LEFT JOIN patient_profiles pp ON pp.user_id = pat.id
       JOIN hospitals h ON h.id = a.hospital_id
       JOIN departments d ON d.id = a.department_id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN users admitted_user ON admitted_user.id = a.admitted_by
       LEFT JOIN appointments apt ON apt.id = a.appointment_id
       WHERE a.id = ? LIMIT 1`,
      [admissionId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Admission record not found." });
    }

    const admission = rows[0];

    // Authorization checks
    if (req.user.role === "patient" && Number(admission.patient_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to view this admission record." });
    }

    if (
      (req.user.role === "hospital_admin" || req.user.role === "staff" || req.user.role === "doctor") &&
      Number(admission.hospital_id) !== Number(req.user.hospitalId)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized to access admissions from another hospital." });
    }

    return res.json({ success: true, data: admission });
  } catch (error) {
    console.error("Get admission details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve admission details." });
  }
});

/**
 * Lesson 9.4 — Get Admission Status History
 * GET /api/admissions/:id/history
 */
router.get("/:id/history", async (req, res) => {
  try {
    const admissionId = Number(req.params.id);
    if (!admissionId || isNaN(admissionId)) {
      return res.status(400).json({ success: false, message: "Invalid admission ID." });
    }

    // Verify parent admission exists & check authorization
    const [admRows] = await pool.execute(
      "SELECT id, patient_id, hospital_id FROM admissions WHERE id = ? LIMIT 1",
      [admissionId]
    );

    if (!admRows.length) {
      return res.status(404).json({ success: false, message: "Admission record not found." });
    }

    const adm = admRows[0];
    if (req.user.role === "patient" && Number(adm.patient_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to view history for this admission." });
    }
    if (
      ["hospital_admin", "staff", "doctor"].includes(req.user.role) &&
      Number(adm.hospital_id) !== Number(req.user.hospitalId)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized to access history for another hospital." });
    }

    const [historyRows] = await pool.execute(
      `SELECT
         ash.id,
         ash.admission_id,
         ash.previous_status,
         ash.new_status,
         ash.changed_by,
         ash.change_reason,
         ash.created_at,
         DATE_FORMAT(ash.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_formatted,
         u.full_name AS changed_by_name,
         r.name AS changed_by_role
       FROM admission_status_history ash
       JOIN users u ON u.id = ash.changed_by
       JOIN roles r ON r.id = u.role_id
       WHERE ash.admission_id = ?
       ORDER BY ash.id ASC`,
      [admissionId]
    );

    return res.json({
      success: true,
      count: historyRows.length,
      data: historyRows,
    });
  } catch (error) {
    console.error("Get admission history error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve status history." });
  }
});

/**
 * Lesson 9.4 — Update Admission Status (Transitions & History)
 * PATCH /api/admissions/:id/status
 */
router.patch("/:id/status", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const admissionId = Number(req.params.id);
    const { status: targetStatus, reason = "" } = req.body || {};

    if (!targetStatus || !VALID_ADMISSION_STATUSES.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid admission status. Must be one of: ${VALID_ADMISSION_STATUSES.join(", ")}.`,
      });
    }

    await connection.beginTransaction();

    const [admRows] = await connection.execute(
      `SELECT id, admission_number, patient_id, hospital_id, doctor_id, status, appointment_id,
              admission_date, discharged_at
       FROM admissions WHERE id = ? LIMIT 1 FOR UPDATE`,
      [admissionId]
    );

    if (!admRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Admission record not found." });
    }

    const currentAdm = admRows[0];
    const currentStatus = currentAdm.status;

    // Check hospital isolation
    if (!verifyHospitalAccess(req, currentAdm.hospital_id)) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "You do not have permission to modify admissions for this hospital.",
      });
    }

    // Prevent no-op update
    if (targetStatus === currentStatus) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Admission is already in '${currentStatus}' status.`,
      });
    }

    // Validate lifecycle transition (Lesson 9.4)
    const allowedNext = ALLOWED_ADMISSION_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(targetStatus) && req.user.role !== "super_admin") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot transition admission status from '${currentStatus}' to '${targetStatus}'. Allowed transitions: ${
          allowedNext.length ? allowedNext.join(", ") : "none (terminal status)"
        }.`,
      });
    }

    // Prepare update query
    let updateSql = "UPDATE admissions SET status = ?";
    const updateParams = [targetStatus];

    if (targetStatus === "discharged") {
      updateSql += ", discharged_at = CURRENT_TIMESTAMP, discharge_notes = ?";
      updateParams.push((reason || "Discharged from inpatient care").trim());

      // Module 10 (Lesson 10.6): Automatically close active bed assignment and update bed status
      const [activeBedAssigns] = await connection.execute(
        `SELECT id, bed_id FROM bed_assignments
         WHERE admission_id = ? AND status = 'active' FOR UPDATE`,
        [admissionId]
      );

      if (activeBedAssigns.length > 0) {
        const activeAssignment = activeBedAssigns[0];
        // 1. Close active assignment
        await connection.execute(
          `UPDATE bed_assignments
           SET status = 'discharged', released_at = CURRENT_TIMESTAMP, released_by = ?,
               notes = CONCAT(IFNULL(notes, ''), ' | Auto-released via patient discharge')
           WHERE id = ?`,
          [req.user.id, activeAssignment.id]
        );

        // 2. Check bed status: Ensure bed is not marked available if it is under maintenance
        const [bedCheck] = await connection.execute(
          "SELECT id, status FROM beds WHERE id = ? FOR UPDATE",
          [activeAssignment.bed_id]
        );

        if (bedCheck.length > 0 && bedCheck[0].status === "occupied") {
          await connection.execute(
            "UPDATE beds SET status = 'available' WHERE id = ?",
            [activeAssignment.bed_id]
          );
        }
      }
    }

    updateSql += " WHERE id = ?";
    updateParams.push(admissionId);

    await connection.execute(updateSql, updateParams);

    // Record in admission_status_history
    await connection.execute(
      `INSERT INTO admission_status_history
         (admission_id, previous_status, new_status, changed_by, change_reason)
       VALUES (?, ?, ?, ?, ?)`,
      [
        admissionId,
        currentStatus,
        targetStatus,
        req.user.id,
        (reason || `Status updated to ${targetStatus}`).trim(),
      ]
    );

    // Lesson 9.6: If transitioning from pending to admitted and linked appointment exists
    if (targetStatus === "admitted" && currentAdm.appointment_id) {
      await connection.execute(
        `UPDATE appointments
         SET status = 'admitted', status_changed_by = ?
         WHERE id = ? AND status IN ('in_waiting', 'in_progress')`,
        [req.user.id, currentAdm.appointment_id]
      );
    }

    await connection.commit();

    emitHospitalEvent(currentAdm.hospital_id, "admissions:updated", {
      action: "status_updated",
      admissionId,
      status: targetStatus,
      previousStatus: currentStatus,
      patientId: currentAdm.patient_id,
    });

    if (targetStatus === "discharged") {
      emitHospitalEvent(currentAdm.hospital_id, "beds:updated", {
        action: "released_via_discharge",
        admissionId,
      });
    }

    // Log audit
    await logAudit(
      req.user.id,
      "UPDATE_ADMISSION_STATUS",
      "admission",
      admissionId,
      {
        admission_number: currentAdm.admission_number,
        previous_status: currentStatus,
        new_status: targetStatus,
        reason,
      },
      req.ip
    );

    // Fetch updated record
    const [updatedRows] = await pool.execute(
      `SELECT a.*,
              DATE_FORMAT(a.admission_date, '%Y-%m-%d %H:%i:%s') AS admission_date_formatted,
              DATE_FORMAT(a.discharged_at, '%Y-%m-%d %H:%i:%s') AS discharged_at_formatted
       FROM admissions a WHERE a.id = ? LIMIT 1`,
      [admissionId]
    );

    return res.json({
      success: true,
      message: `Admission status updated to '${targetStatus}'.`,
      data: updatedRows[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update admission status error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update admission status." });
  } finally {
    connection.release();
  }
});

module.exports = router;
