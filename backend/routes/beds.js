const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();
router.use(requireAuth);

const VALID_BED_TYPES = [
  "standard",
  "icu",
  "pediatric",
  "bariatric",
  "electric",
  "ventilator_enabled",
];

const VALID_BED_STATUSES = ["available", "occupied", "maintenance"];

/**
 * Verify caller has authorization for the specified hospital (Lesson 10.10)
 */
function verifyHospitalAccess(req, hospitalId) {
  if (req.user.role === "super_admin") return true;
  return Number(req.user.hospitalId) === Number(hospitalId);
}

/**
 * Validate bed number identifier (Lesson 10.3)
 */
function validateBedNumber(bedNumber) {
  if (!bedNumber || typeof bedNumber !== "string") {
    return { valid: false, message: "Bed number or identifier is required." };
  }
  const trimmed = bedNumber.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { valid: false, message: "Bed number must be between 1 and 50 characters." };
  }
  return { valid: true, sanitized: trimmed };
}

// ============================================================================
// BED MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Lessons 10.3, 10.4, 10.10 — List Beds with Ward, Department & Status Filters
 * GET /api/beds
 */
router.get("/", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const {
      ward_id,
      department_id,
      hospital_id,
      status,
      bed_type,
      search,
      limit = 100,
      offset = 0,
    } = req.query;

    let targetHospitalId = null;
    if (req.user.role !== "super_admin") {
      targetHospitalId = req.user.hospitalId;
    } else if (hospital_id) {
      targetHospitalId = Number(hospital_id);
    }

    let sql = `
      SELECT
        b.id,
        b.ward_id,
        b.bed_number,
        b.bed_type,
        b.daily_rate,
        b.status,
        b.maintenance_reason,
        b.created_at,
        b.updated_at,
        w.name AS ward_name,
        w.ward_type,
        w.status AS ward_status,
        w.capacity AS ward_capacity,
        d.id AS department_id,
        d.name AS department_name,
        h.id AS hospital_id,
        h.name AS hospital_name,
        -- Active assignment details if currently occupied
        ba.id AS active_assignment_id,
        ba.admission_id,
        ba.patient_id,
        ba.assigned_at,
        DATE_FORMAT(ba.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at_formatted,
        pat.full_name AS patient_name,
        adm.admission_number,
        assigned_user.full_name AS assigned_by_name
      FROM beds b
      JOIN wards w ON w.id = b.ward_id
      JOIN departments d ON d.id = w.department_id
      JOIN hospitals h ON h.id = w.hospital_id
      LEFT JOIN bed_assignments ba ON ba.bed_id = b.id AND ba.status = 'active'
      LEFT JOIN users pat ON pat.id = ba.patient_id
      LEFT JOIN admissions adm ON adm.id = ba.admission_id
      LEFT JOIN users assigned_user ON assigned_user.id = ba.assigned_by
      WHERE 1=1
    `;

    const params = [];

    if (targetHospitalId) {
      sql += " AND w.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (ward_id) {
      sql += " AND b.ward_id = ?";
      params.push(Number(ward_id));
    }

    if (department_id) {
      sql += " AND w.department_id = ?";
      params.push(Number(department_id));
    }

    if (status && VALID_BED_STATUSES.includes(status)) {
      sql += " AND b.status = ?";
      params.push(status);
    }

    if (bed_type && VALID_BED_TYPES.includes(bed_type)) {
      sql += " AND b.bed_type = ?";
      params.push(bed_type);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += " AND (b.bed_number LIKE ? OR pat.full_name LIKE ? OR adm.admission_number LIKE ?)";
      params.push(q, q, q);
    }

    sql += " ORDER BY w.name ASC, b.bed_number ASC LIMIT ? OFFSET ?";
    params.push(Number(limit) || 100, Number(offset) || 0);

    const [rows] = await pool.query(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("List beds error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve beds." });
  }
});

/**
 * Lesson 10.3 & 10.10 — Get Bed Details by ID
 * GET /api/beds/:id
 */
router.get("/:id", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const bedId = Number(req.params.id);
    if (!bedId || isNaN(bedId)) {
      return res.status(400).json({ success: false, message: "Invalid bed ID." });
    }

    const [rows] = await pool.execute(
      `SELECT
         b.id,
         b.ward_id,
         b.bed_number,
         b.bed_type,
         b.daily_rate,
         b.status,
         b.maintenance_reason,
         b.created_at,
         b.updated_at,
         w.name AS ward_name,
         w.ward_type,
         w.capacity AS ward_capacity,
         w.hospital_id,
         d.id AS department_id,
         d.name AS department_name,
         h.name AS hospital_name,
         ba.id AS active_assignment_id,
         ba.admission_id,
         ba.patient_id,
         ba.assigned_at,
         DATE_FORMAT(ba.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at_formatted,
         pat.full_name AS patient_name,
         adm.admission_number,
         assigned_user.full_name AS assigned_by_name
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       JOIN departments d ON d.id = w.department_id
       JOIN hospitals h ON h.id = w.hospital_id
       LEFT JOIN bed_assignments ba ON ba.bed_id = b.id AND ba.status = 'active'
       LEFT JOIN users pat ON pat.id = ba.patient_id
       LEFT JOIN admissions adm ON adm.id = ba.admission_id
       LEFT JOIN users assigned_user ON assigned_user.id = ba.assigned_by
       WHERE b.id = ?
       LIMIT 1`,
      [bedId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Bed record not found." });
    }

    const bed = rows[0];

    // Hospital isolation
    if (!verifyHospitalAccess(req, bed.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to bed from another hospital." });
    }

    return res.json({ success: true, data: bed });
  } catch (error) {
    console.error("Get bed details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve bed details." });
  }
});

/**
 * Lesson 10.3 & 10.10 — Create Bed within Ward (Capacity Enforcement)
 * POST /api/beds
 */
router.post("/", allowRoles("super_admin", "hospital_admin", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      ward_id,
      bed_number,
      bed_type = "standard",
      daily_rate = 0.00,
    } = req.body || {};

    if (!ward_id) {
      return res.status(400).json({ success: false, message: "Ward ID is required." });
    }

    const bedNumberCheck = validateBedNumber(bed_number);
    if (!bedNumberCheck.valid) {
      return res.status(400).json({ success: false, message: bedNumberCheck.message });
    }

    if (!VALID_BED_TYPES.includes(bed_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid bed type. Allowed types: ${VALID_BED_TYPES.join(", ")}.`,
      });
    }

    const numDailyRate = Number(daily_rate) || 0.00;
    if (numDailyRate < 0) {
      return res.status(400).json({ success: false, message: "Daily rate cannot be negative." });
    }

    await connection.beginTransaction();

    // Lock ward row for capacity calculation (Lesson 10.3)
    const [wardRows] = await connection.execute(
      `SELECT id, hospital_id, department_id, name, capacity, status
       FROM wards WHERE id = ? LIMIT 1 FOR UPDATE`,
      [Number(ward_id)]
    );

    if (!wardRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Ward not found." });
    }

    const ward = wardRows[0];

    // Hospital access validation
    if (!verifyHospitalAccess(req, ward.hospital_id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized to create beds in this hospital." });
    }

    if (ward.status !== "active") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cannot create beds in an inactive ward." });
    }

    // Capacity enforcement (Lesson 10.3)
    const [bedCountRows] = await connection.execute(
      "SELECT COUNT(*) AS total_beds FROM beds WHERE ward_id = ?",
      [ward.id]
    );

    const currentTotalBeds = bedCountRows[0].total_beds || 0;
    if (currentTotalBeds >= ward.capacity) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Ward '${ward.name}' has reached its configured maximum capacity of ${ward.capacity} beds. Increase ward capacity before creating additional beds.`,
      });
    }

    // Check duplicate bed identifier within the ward scope (Lesson 10.3)
    const [dupCheck] = await connection.execute(
      "SELECT id FROM beds WHERE ward_id = ? AND bed_number = ? LIMIT 1",
      [ward.id, bedNumberCheck.sanitized]
    );

    if (dupCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Bed '${bedNumberCheck.sanitized}' already exists in ward '${ward.name}'.`,
      });
    }

    // Insert bed record
    const [insertResult] = await connection.execute(
      `INSERT INTO beds (ward_id, bed_number, bed_type, daily_rate, status)
       VALUES (?, ?, ?, ?, 'available')`,
      [ward.id, bedNumberCheck.sanitized, bed_type, numDailyRate]
    );

    const bedId = insertResult.insertId;

    await connection.commit();

    emitHospitalEvent(ward.hospital_id, "beds:updated", {
      action: "created",
      bedId,
      wardId: ward.id,
      bedNumber: bedNumberCheck.sanitized,
      status: "available",
    });

    await logAudit(
      req.user.id,
      "CREATE_BED",
      "bed",
      bedId,
      {
        ward_id: ward.id,
        ward_name: ward.name,
        bed_number: bedNumberCheck.sanitized,
        bed_type,
        daily_rate: numDailyRate,
      },
      req.ip
    );

    const [createdRows] = await pool.execute(
      `SELECT b.*, w.name AS ward_name, w.hospital_id, d.name AS department_name
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       JOIN departments d ON d.id = w.department_id
       WHERE b.id = ? LIMIT 1`,
      [bedId]
    );

    return res.status(201).json({
      success: true,
      message: "Bed created successfully.",
      data: createdRows[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create bed error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create bed." });
  } finally {
    connection.release();
  }
});

/**
 * Lesson 10.3 — Update Bed Attributes
 * PUT /api/beds/:id
 */
router.put("/:id", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const bedId = Number(req.params.id);
    if (!bedId || isNaN(bedId)) {
      return res.status(400).json({ success: false, message: "Invalid bed ID." });
    }

    const { bed_number, bed_type, daily_rate } = req.body || {};

    const [existingRows] = await pool.execute(
      `SELECT b.*, w.hospital_id, w.name AS ward_name
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       WHERE b.id = ? LIMIT 1`,
      [bedId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: "Bed not found." });
    }

    const bed = existingRows[0];
    if (!verifyHospitalAccess(req, bed.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to modify bed from another hospital." });
    }

    let sanitizedBedNumber = bed.bed_number;
    if (bed_number !== undefined) {
      const check = validateBedNumber(bed_number);
      if (!check.valid) {
        return res.status(400).json({ success: false, message: check.message });
      }
      sanitizedBedNumber = check.sanitized;

      if (sanitizedBedNumber.toLowerCase() !== bed.bed_number.toLowerCase()) {
        const [dupCheck] = await pool.execute(
          "SELECT id FROM beds WHERE ward_id = ? AND bed_number = ? AND id != ? LIMIT 1",
          [bed.ward_id, sanitizedBedNumber, bedId]
        );
        if (dupCheck.length > 0) {
          return res.status(409).json({
            success: false,
            message: `Bed '${sanitizedBedNumber}' already exists in ward '${bed.ward_name}'.`,
          });
        }
      }
    }

    let sanitizedType = bed.bed_type;
    if (bed_type !== undefined) {
      if (!VALID_BED_TYPES.includes(bed_type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid bed type. Allowed types: ${VALID_BED_TYPES.join(", ")}.`,
        });
      }
      sanitizedType = bed_type;
    }

    let sanitizedRate = bed.daily_rate;
    if (daily_rate !== undefined) {
      const numRate = Number(daily_rate);
      if (isNaN(numRate) || numRate < 0) {
        return res.status(400).json({ success: false, message: "Invalid daily rate." });
      }
      sanitizedRate = numRate;
    }

    await pool.execute(
      "UPDATE beds SET bed_number = ?, bed_type = ?, daily_rate = ? WHERE id = ?",
      [sanitizedBedNumber, sanitizedType, sanitizedRate, bedId]
    );

    emitHospitalEvent(bed.hospital_id, "beds:updated", {
      action: "updated",
      bedId,
      wardId: bed.ward_id,
      bedNumber: sanitizedBedNumber,
      bedType: sanitizedType,
      dailyRate: sanitizedRate,
    });

    await logAudit(
      req.user.id,
      "UPDATE_BED",
      "bed",
      bedId,
      {
        previous: { bed_number: bed.bed_number, bed_type: bed.bed_type, daily_rate: bed.daily_rate },
        updated: { bed_number: sanitizedBedNumber, bed_type: sanitizedType, daily_rate: sanitizedRate },
      },
      req.ip
    );

    const [updatedRows] = await pool.execute("SELECT * FROM beds WHERE id = ? LIMIT 1", [bedId]);

    return res.json({
      success: true,
      message: "Bed updated successfully.",
      data: updatedRows[0],
    });
  } catch (error) {
    console.error("Update bed error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update bed." });
  }
});

/**
 * Lesson 10.5 & 10.9 — Assign Bed to Admitted Patient (Concurrency-Safe Transaction)
 * POST /api/beds/assign
 */
router.post("/assign", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { bed_id, admission_id, notes = "" } = req.body || {};

    if (!bed_id || !admission_id) {
      return res.status(400).json({
        success: false,
        message: "bed_id and admission_id are mandatory.",
      });
    }

    await connection.beginTransaction();

    // 1. Lock bed row and check status (Lesson 10.4, 10.7, 10.9)
    const [bedRows] = await connection.execute(
      `SELECT b.id, b.ward_id, b.bed_number, b.status, b.maintenance_reason,
              w.hospital_id, w.department_id, w.name AS ward_name, w.status AS ward_status
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       WHERE b.id = ? LIMIT 1 FOR UPDATE`,
      [Number(bed_id)]
    );

    if (!bedRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Bed not found." });
    }

    const bed = bedRows[0];

    // Hospital authorization check
    if (!verifyHospitalAccess(req, bed.hospital_id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized to assign bed belonging to another hospital." });
    }

    if (bed.ward_status !== "active") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cannot assign bed in an inactive ward." });
    }

    // Verify bed availability (Lesson 10.4 & 10.7)
    if (bed.status === "occupied") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Bed '${bed.bed_number}' is already occupied. Simultaneous allocation rejected.`,
      });
    }

    if (bed.status === "maintenance") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Bed '${bed.bed_number}' is currently under maintenance (${bed.maintenance_reason || "Scheduled service"}) and cannot be allocated.`,
      });
    }

    if (bed.status !== "available") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Bed is in status '${bed.status}' and cannot be assigned.`,
      });
    }

    // 2. Lock admission row and validate eligibility (Lesson 10.5)
    const [admissionRows] = await connection.execute(
      `SELECT a.id, a.admission_number, a.patient_id, a.hospital_id, a.department_id, a.status
       FROM admissions a
       WHERE a.id = ? LIMIT 1 FOR UPDATE`,
      [Number(admission_id)]
    );

    if (!admissionRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Admission record not found." });
    }

    const admission = admissionRows[0];

    // Cross-hospital validation: Admission hospital must match Bed hospital (Lesson 10.5 & 10.10)
    if (Number(admission.hospital_id) !== Number(bed.hospital_id)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cross-hospital assignment rejected. Bed and patient admission belong to different hospitals.",
      });
    }

    // Admission status must be active (admitted or pending)
    if (admission.status === "discharged") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot assign a bed to a discharged admission.",
      });
    }

    if (admission.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot assign a bed to a cancelled admission.",
      });
    }

    // 3. Concurrency check: Ensure no active assignment exists for this bed (Lesson 10.9)
    const [activeBedAssignRows] = await connection.execute(
      "SELECT id FROM bed_assignments WHERE bed_id = ? AND status = 'active' LIMIT 1 FOR UPDATE",
      [bed.id]
    );

    if (activeBedAssignRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Bed '${bed.bed_number}' already has an active assignment record.`,
      });
    }

    // 4. Concurrency check: Ensure no active assignment exists for this admission (Lesson 10.9)
    const [activeAdmAssignRows] = await connection.execute(
      `SELECT ba.id, b.bed_number, w.name AS ward_name
       FROM bed_assignments ba
       JOIN beds b ON b.id = ba.bed_id
       JOIN wards w ON w.id = ba.ward_id
       WHERE ba.admission_id = ? AND ba.status = 'active' LIMIT 1 FOR UPDATE`,
      [admission.id]
    );

    if (activeAdmAssignRows.length > 0) {
      await connection.rollback();
      const existing = activeAdmAssignRows[0];
      return res.status(409).json({
        success: false,
        message: `This admission already has an active bed assignment (Bed ${existing.bed_number} in ${existing.ward_name}). Multi-bed active assignments are prohibited.`,
      });
    }

    // 5. Create active bed assignment (Lesson 10.5 & 10.8)
    const [assignResult] = await connection.execute(
      `INSERT INTO bed_assignments
         (bed_id, admission_id, patient_id, ward_id, hospital_id, assigned_at, status, assigned_by, notes)
       VALUES (?, ?, ?, ?, ?, NOW(), 'active', ?, ?)`,
      [
        bed.id,
        admission.id,
        admission.patient_id,
        bed.ward_id,
        bed.hospital_id,
        req.user.id,
        (notes || "Patient admitted and assigned to bed").trim(),
      ]
    );

    const assignmentId = assignResult.insertId;

    // 6. Atomically update bed status to 'occupied' (Lesson 10.4 & 10.5)
    await connection.execute(
      "UPDATE beds SET status = 'occupied' WHERE id = ?",
      [bed.id]
    );

    // If admission status was 'pending', transition it to 'admitted'
    if (admission.status === "pending") {
      await connection.execute(
        "UPDATE admissions SET status = 'admitted' WHERE id = ?",
        [admission.id]
      );
      await connection.execute(
        `INSERT INTO admission_status_history
           (admission_id, previous_status, new_status, changed_by, change_reason)
         VALUES (?, 'pending', 'admitted', ?, 'Bed assigned to patient')`,
        [admission.id, req.user.id]
      );
    }

    await connection.commit();

    emitHospitalEvent(bed.hospital_id, "beds:updated", {
      action: "assigned",
      bedId: bed.id,
      admissionId: admission.id,
      status: "occupied",
    });
    emitHospitalEvent(bed.hospital_id, "admissions:updated", {
      action: "bed_assigned",
      admissionId: admission.id,
      bedId: bed.id,
    });

    await logAudit(
      req.user.id,
      "ASSIGN_BED",
      "bed",
      bed.id,
      {
        assignment_id: assignmentId,
        bed_number: bed.bed_number,
        admission_id: admission.id,
        admission_number: admission.admission_number,
        patient_id: admission.patient_id,
        ward_id: bed.ward_id,
      },
      req.ip
    );

    // Fetch enriched assignment record
    const [assignmentRows] = await pool.execute(
      `SELECT
         ba.*,
         DATE_FORMAT(ba.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at_formatted,
         b.bed_number,
         b.bed_type,
         w.name AS ward_name,
         adm.admission_number,
         pat.full_name AS patient_name,
         pat.phone AS patient_phone,
         assigned_user.full_name AS assigned_by_name
       FROM bed_assignments ba
       JOIN beds b ON b.id = ba.bed_id
       JOIN wards w ON w.id = ba.ward_id
       JOIN admissions adm ON adm.id = ba.admission_id
       JOIN users pat ON pat.id = ba.patient_id
       JOIN users assigned_user ON assigned_user.id = ba.assigned_by
       WHERE ba.id = ? LIMIT 1`,
      [assignmentId]
    );

    return res.status(201).json({
      success: true,
      message: `Bed '${bed.bed_number}' successfully assigned to admission ${admission.admission_number}.`,
      data: assignmentRows[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Assign bed error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to assign bed." });
  } finally {
    connection.release();
  }
});

/**
 * Lesson 10.6 — Release Bed Assignment (Discharge / Transfer)
 * POST /api/beds/release
 */
router.post("/release", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { bed_id, admission_id, reason = "Discharged / Bed released" } = req.body || {};

    if (!bed_id && !admission_id) {
      return res.status(400).json({
        success: false,
        message: "Either bed_id or admission_id is required to release a bed assignment.",
      });
    }

    await connection.beginTransaction();

    let lookupSql = "SELECT * FROM bed_assignments WHERE status = 'active'";
    const lookupParams = [];

    if (bed_id) {
      lookupSql += " AND bed_id = ?";
      lookupParams.push(Number(bed_id));
    }
    if (admission_id) {
      lookupSql += " AND admission_id = ?";
      lookupParams.push(Number(admission_id));
    }
    lookupSql += " LIMIT 1 FOR UPDATE";

    const [assignmentRows] = await connection.execute(lookupSql, lookupParams);

    if (!assignmentRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "No active bed assignment found for the specified bed or admission.",
      });
    }

    const assignment = assignmentRows[0];

    // Hospital authorization check
    if (!verifyHospitalAccess(req, assignment.hospital_id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized to release bed for another hospital." });
    }

    // Close the active assignment record
    await connection.execute(
      `UPDATE bed_assignments
       SET status = 'discharged', released_at = NOW(), released_by = ?, notes = CONCAT(IFNULL(notes, ''), ' | Release notes: ', ?)
       WHERE id = ?`,
      [req.user.id, reason.trim(), assignment.id]
    );

    // Update bed status: check if bed was placed in maintenance while occupied
    const [bedRows] = await connection.execute(
      "SELECT id, status FROM beds WHERE id = ? FOR UPDATE",
      [assignment.bed_id]
    );

    if (bedRows.length > 0) {
      const currentBed = bedRows[0];
      // Only set to available if not under maintenance
      if (currentBed.status !== "maintenance") {
        await connection.execute(
          "UPDATE beds SET status = 'available' WHERE id = ?",
          [assignment.bed_id]
        );
      }
    }

    await connection.commit();

    emitHospitalEvent(assignment.hospital_id, "beds:updated", {
      action: "released",
      bedId: assignment.bed_id,
      admissionId: assignment.admission_id,
      status: "available",
    });
    emitHospitalEvent(assignment.hospital_id, "admissions:updated", {
      action: "bed_released",
      admissionId: assignment.admission_id,
      bedId: assignment.bed_id,
    });

    await logAudit(
      req.user.id,
      "RELEASE_BED",
      "bed",
      assignment.bed_id,
      {
        assignment_id: assignment.id,
        admission_id: assignment.admission_id,
        patient_id: assignment.patient_id,
        reason,
      },
      req.ip
    );

    return res.json({
      success: true,
      message: "Bed assignment successfully closed and bed marked as available.",
      data: { assignment_id: assignment.id, bed_id: assignment.bed_id },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Release bed error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to release bed assignment." });
  } finally {
    connection.release();
  }
});

/**
 * Lesson 10.4 & 10.7 — Bed Maintenance Management
 * POST /api/beds/:id/maintenance
 */
router.post("/:id/maintenance", allowRoles("super_admin", "hospital_admin", "staff"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const bedId = Number(req.params.id);
    const { action, reason } = req.body || {};

    if (!bedId || isNaN(bedId)) {
      return res.status(400).json({ success: false, message: "Invalid bed ID." });
    }

    if (!action || !["place", "return"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Maintenance action must be either 'place' (place in maintenance) or 'return' (return to service).",
      });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "A descriptive maintenance reason is required (minimum 3 characters).",
      });
    }

    await connection.beginTransaction();

    const [bedRows] = await connection.execute(
      `SELECT b.id, b.bed_number, b.status, b.maintenance_reason, w.hospital_id, w.name AS ward_name
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       WHERE b.id = ? LIMIT 1 FOR UPDATE`,
      [bedId]
    );

    if (!bedRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Bed not found." });
    }

    const bed = bedRows[0];

    // Hospital authorization check
    if (!verifyHospitalAccess(req, bed.hospital_id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized to change maintenance status of bed from another hospital." });
    }

    if (action === "place") {
      // Lesson 10.4 & 10.7: If a bed is being placed under maintenance, validate whether it is occupied.
      if (bed.status === "occupied") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: `Cannot place bed '${bed.bed_number}' under maintenance while it is occupied. The patient must be transferred or discharged first.`,
        });
      }

      if (bed.status === "maintenance") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Bed '${bed.bed_number}' is already under maintenance.`,
        });
      }

      // Update bed status to maintenance
      await connection.execute(
        "UPDATE beds SET status = 'maintenance', maintenance_reason = ? WHERE id = ?",
        [reason.trim(), bedId]
      );

      // Record maintenance log (Lesson 10.7)
      await connection.execute(
        `INSERT INTO bed_maintenance_logs (bed_id, action, reason, performed_by)
         VALUES (?, 'placed_in_maintenance', ?, ?)`,
        [bedId, reason.trim(), req.user.id]
      );

      await connection.commit();

      emitHospitalEvent(bed.hospital_id, "beds:updated", {
        action: "maintenance_placed",
        bedId,
        status: "maintenance",
        reason: reason.trim(),
      });

      await logAudit(
        req.user.id,
        "BED_MAINTENANCE_PLACED",
        "bed",
        bedId,
        { bed_number: bed.bed_number, reason: reason.trim() },
        req.ip
      );

      return res.json({
        success: true,
        message: `Bed '${bed.bed_number}' placed under maintenance.`,
        data: { id: bedId, status: "maintenance", maintenance_reason: reason.trim() },
      });
    }

    if (action === "return") {
      if (bed.status !== "maintenance") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Bed '${bed.bed_number}' is not currently under maintenance.`,
        });
      }

      // Check if any conflicting active assignment exists
      const [activeAssign] = await connection.execute(
        "SELECT id FROM bed_assignments WHERE bed_id = ? AND status = 'active' LIMIT 1",
        [bedId]
      );

      if (activeAssign.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Data inconsistency: bed has an active assignment record. Cannot return to service automatically.",
        });
      }

      // Return bed to service (available)
      await connection.execute(
        "UPDATE beds SET status = 'available', maintenance_reason = NULL WHERE id = ?",
        [bedId]
      );

      // Record maintenance log
      await connection.execute(
        `INSERT INTO bed_maintenance_logs (bed_id, action, reason, performed_by)
         VALUES (?, 'returned_to_service', ?, ?)`,
        [bedId, reason.trim(), req.user.id]
      );

      await connection.commit();

      emitHospitalEvent(bed.hospital_id, "beds:updated", {
        action: "maintenance_returned",
        bedId,
        status: "available",
      });

      await logAudit(
        req.user.id,
        "BED_MAINTENANCE_RETURNED",
        "bed",
        bedId,
        { bed_number: bed.bed_number, reason: reason.trim() },
        req.ip
      );

      return res.json({
        success: true,
        message: `Bed '${bed.bed_number}' returned to active service and is now available.`,
        data: { id: bedId, status: "available", maintenance_reason: null },
      });
    }
  } catch (error) {
    await connection.rollback();
    console.error("Bed maintenance error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update bed maintenance status." });
  } finally {
    connection.release();
  }
});

/**
 * Lesson 10.8 — Bed Assignment & Occupancy History
 * GET /api/beds/:id/history
 */
router.get("/:id/history", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const bedId = Number(req.params.id);
    if (!bedId || isNaN(bedId)) {
      return res.status(400).json({ success: false, message: "Invalid bed ID." });
    }

    const [bedRows] = await pool.execute(
      `SELECT b.id, b.bed_number, w.hospital_id, w.name AS ward_name
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       WHERE b.id = ? LIMIT 1`,
      [bedId]
    );

    if (!bedRows.length) {
      return res.status(404).json({ success: false, message: "Bed not found." });
    }

    const bed = bedRows[0];
    if (!verifyHospitalAccess(req, bed.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to access assignment history for another hospital." });
    }

    const [assignments] = await pool.execute(
      `SELECT
         ba.id,
         ba.bed_id,
         ba.admission_id,
         ba.patient_id,
         ba.ward_id,
         ba.hospital_id,
         ba.assigned_at,
         DATE_FORMAT(ba.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at_formatted,
         ba.released_at,
         DATE_FORMAT(ba.released_at, '%Y-%m-%d %H:%i:%s') AS released_at_formatted,
         ba.status,
         ba.notes,
         pat.full_name AS patient_name,
         pat.email AS patient_email,
         pat.phone AS patient_phone,
         adm.admission_number,
         adm.admission_date,
         assigned_user.full_name AS assigned_by_name,
         released_user.full_name AS released_by_name
       FROM bed_assignments ba
       JOIN users pat ON pat.id = ba.patient_id
       JOIN admissions adm ON adm.id = ba.admission_id
       JOIN users assigned_user ON assigned_user.id = ba.assigned_by
       LEFT JOIN users released_user ON released_user.id = ba.released_by
       WHERE ba.bed_id = ?
       ORDER BY ba.assigned_at DESC, ba.id DESC`,
      [bedId]
    );

    const [maintenanceLogs] = await pool.execute(
      `SELECT
         bml.id,
         bml.bed_id,
         bml.action,
         bml.reason,
         bml.created_at,
         DATE_FORMAT(bml.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_formatted,
         u.full_name AS performed_by_name
       FROM bed_maintenance_logs bml
       JOIN users u ON u.id = bml.performed_by
       WHERE bml.bed_id = ?
       ORDER BY bml.created_at DESC, bml.id DESC`,
      [bedId]
    );

    return res.json({
      success: true,
      bed: { id: bed.id, bed_number: bed.bed_number, ward_name: bed.ward_name },
      assignment_count: assignments.length,
      assignments,
      maintenance_logs: maintenanceLogs,
    });
  } catch (error) {
    console.error("Get bed history error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve bed history." });
  }
});

/**
 * Lesson 10.8 — Get Bed Assignment for a Specific Admission
 * GET /api/beds/admission/:admission_id
 */
router.get("/admission/:admission_id", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), async (req, res) => {
  try {
    const admissionId = Number(req.params.admission_id);
    if (!admissionId || isNaN(admissionId)) {
      return res.status(400).json({ success: false, message: "Invalid admission ID." });
    }

    const [admRows] = await pool.execute(
      "SELECT id, patient_id, hospital_id FROM admissions WHERE id = ? LIMIT 1",
      [admissionId]
    );

    if (!admRows.length) {
      return res.status(404).json({ success: false, message: "Admission not found." });
    }

    const adm = admRows[0];

    // Authorization: patient can only view their own
    if (req.user.role === "patient" && Number(req.user.id) !== Number(adm.patient_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to view this admission's bed assignment." });
    }

    if (req.user.role !== "super_admin" && req.user.role !== "patient" && !verifyHospitalAccess(req, adm.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to access admission from another hospital." });
    }

    const [assignments] = await pool.execute(
      `SELECT
         ba.*,
         DATE_FORMAT(ba.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at_formatted,
         DATE_FORMAT(ba.released_at, '%Y-%m-%d %H:%i:%s') AS released_at_formatted,
         b.bed_number,
         b.bed_type,
         b.daily_rate,
         w.name AS ward_name,
         w.ward_type,
         d.name AS department_name,
         assigned_user.full_name AS assigned_by_name,
         released_user.full_name AS released_by_name
       FROM bed_assignments ba
       JOIN beds b ON b.id = ba.bed_id
       JOIN wards w ON w.id = ba.ward_id
       JOIN departments d ON d.id = w.department_id
       JOIN users assigned_user ON assigned_user.id = ba.assigned_by
       LEFT JOIN users released_user ON released_user.id = ba.released_by
       WHERE ba.admission_id = ?
       ORDER BY ba.assigned_at DESC, ba.id DESC`,
      [admissionId]
    );

    const activeAssignment = assignments.find((a) => a.status === "active") || null;

    return res.json({
      success: true,
      activeAssignment,
      allAssignments: assignments,
    });
  } catch (error) {
    console.error("Get admission bed assignment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve admission bed assignment." });
  }
});

module.exports = router;
