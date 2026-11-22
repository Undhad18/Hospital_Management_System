const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();
router.use(requireAuth);

const VALID_WARD_TYPES = [
  "general",
  "semi_private",
  "private",
  "icu",
  "emergency",
  "maternity",
  "pediatric",
  "surgical",
];

/**
 * Verify caller has authorization for the specified hospital (Lesson 10.10)
 */
function verifyHospitalAccess(req, hospitalId) {
  if (req.user.role === "super_admin") return true;
  return Number(req.user.hospitalId) === Number(hospitalId);
}

/**
 * Validate ward name (Lesson 10.1 & 10.2)
 */
function validateWardName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, message: "Ward name is required." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    return { valid: false, message: "Ward name must be between 2 and 120 characters." };
  }
  return { valid: true, sanitized: trimmed };
}

// ============================================================================
// WARD ENDPOINTS
// ============================================================================

/**
 * Lesson 10.1 & 10.10 — List Wards with Department, Hospital & Status Filters
 * GET /api/wards
 */
router.get("/", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const {
      hospital_id,
      department_id,
      status,
      ward_type,
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
        w.id,
        w.hospital_id,
        w.department_id,
        w.name,
        w.ward_type,
        w.capacity AS configured_capacity,
        w.status,
        w.created_at,
        w.updated_at,
        h.name AS hospital_name,
        h.code AS hospital_code,
        d.name AS department_name,
        d.status AS department_status,
        (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id) AS total_registered_beds,
        (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'available') AS available_beds,
        (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'occupied') AS occupied_beds,
        (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'maintenance') AS maintenance_beds
      FROM wards w
      JOIN hospitals h ON h.id = w.hospital_id
      JOIN departments d ON d.id = w.department_id
      WHERE 1=1
    `;

    const params = [];

    if (targetHospitalId) {
      sql += " AND w.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (department_id) {
      sql += " AND w.department_id = ?";
      params.push(Number(department_id));
    }

    if (status && ["active", "inactive"].includes(status)) {
      sql += " AND w.status = ?";
      params.push(status);
    }

    if (ward_type && VALID_WARD_TYPES.includes(ward_type)) {
      sql += " AND w.ward_type = ?";
      params.push(ward_type);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += " AND (w.name LIKE ? OR d.name LIKE ?)";
      params.push(q, q);
    }

    sql += " ORDER BY d.name ASC, w.name ASC LIMIT ? OFFSET ?";
    params.push(Number(limit) || 100, Number(offset) || 0);

    const [rows] = await pool.query(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("List wards error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve wards." });
  }
});

/**
 * Lesson 10.1 & 10.10 — Get Ward Details by ID
 * GET /api/wards/:id
 */
router.get("/:id", allowRoles("super_admin", "hospital_admin", "doctor", "staff"), async (req, res) => {
  try {
    const wardId = Number(req.params.id);
    if (!wardId || isNaN(wardId)) {
      return res.status(400).json({ success: false, message: "Invalid ward ID." });
    }

    const [rows] = await pool.execute(
      `SELECT
         w.id,
         w.hospital_id,
         w.department_id,
         w.name,
         w.ward_type,
         w.capacity AS configured_capacity,
         w.status,
         w.created_at,
         w.updated_at,
         h.name AS hospital_name,
         d.name AS department_name,
         (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id) AS total_registered_beds,
         (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'available') AS available_beds,
         (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'occupied') AS occupied_beds,
         (SELECT COUNT(*) FROM beds b WHERE b.ward_id = w.id AND b.status = 'maintenance') AS maintenance_beds
       FROM wards w
       JOIN hospitals h ON h.id = w.hospital_id
       JOIN departments d ON d.id = w.department_id
       WHERE w.id = ?
       LIMIT 1`,
      [wardId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Ward not found." });
    }

    const ward = rows[0];

    // Hospital data isolation
    if (!verifyHospitalAccess(req, ward.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to ward from another hospital." });
    }

    return res.json({ success: true, data: ward });
  } catch (error) {
    console.error("Get ward details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve ward details." });
  }
});

/**
 * Lesson 10.2 & 10.10 — Create Ward
 * POST /api/wards
 */
router.post("/", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const {
      hospital_id,
      department_id,
      name,
      ward_type = "general",
      capacity = 10,
      status = "active",
    } = req.body || {};

    const targetHospitalId = req.user.role === "super_admin" ? Number(hospital_id) : Number(req.user.hospitalId);

    if (!targetHospitalId) {
      return res.status(400).json({ success: false, message: "Hospital ID is required." });
    }

    if (!verifyHospitalAccess(req, targetHospitalId)) {
      return res.status(403).json({ success: false, message: "Unauthorized to create ward for this hospital." });
    }

    if (!department_id) {
      return res.status(400).json({ success: false, message: "Department ID is required." });
    }

    // Validate ward name
    const nameCheck = validateWardName(name);
    if (!nameCheck.valid) {
      return res.status(400).json({ success: false, message: nameCheck.message });
    }

    // Validate ward type
    if (!VALID_WARD_TYPES.includes(ward_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ward type. Allowed types: ${VALID_WARD_TYPES.join(", ")}.`,
      });
    }

    // Validate capacity
    const numCapacity = Number(capacity);
    if (isNaN(numCapacity) || numCapacity < 1 || numCapacity > 1000) {
      return res.status(400).json({
        success: false,
        message: "Ward capacity must be a positive integer between 1 and 1000.",
      });
    }

    // Verify department exists, belongs to target hospital, and is active (Lesson 10.2)
    const [deptRows] = await pool.execute(
      "SELECT id, hospital_id, name, status FROM departments WHERE id = ? LIMIT 1",
      [Number(department_id)]
    );

    if (!deptRows.length) {
      return res.status(404).json({ success: false, message: "Department not found." });
    }

    const dept = deptRows[0];
    if (Number(dept.hospital_id) !== targetHospitalId) {
      return res.status(400).json({
        success: false,
        message: "The specified department does not belong to the selected hospital.",
      });
    }

    if (dept.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Cannot create a ward in an inactive department.",
      });
    }

    // Verify duplicate ward name in this hospital & department (Lesson 10.2)
    const [dupRows] = await pool.execute(
      "SELECT id FROM wards WHERE hospital_id = ? AND department_id = ? AND name = ? LIMIT 1",
      [targetHospitalId, Number(department_id), nameCheck.sanitized]
    );

    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `A ward named '${nameCheck.sanitized}' already exists in this department.`,
      });
    }

    // Insert ward
    const [result] = await pool.execute(
      `INSERT INTO wards (hospital_id, department_id, name, ward_type, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        targetHospitalId,
        Number(department_id),
        nameCheck.sanitized,
        ward_type,
        numCapacity,
        status === "inactive" ? "inactive" : "active",
      ]
    );

    const newWardId = result.insertId;

    emitHospitalEvent(targetHospitalId, "wards:updated", {
      action: "created",
      wardId: newWardId,
      departmentId: Number(department_id),
      name: nameCheck.sanitized,
      capacity: numCapacity,
    });

    await logAudit(
      req.user.id,
      "CREATE_WARD",
      "ward",
      newWardId,
      {
        hospital_id: targetHospitalId,
        department_id: Number(department_id),
        name: nameCheck.sanitized,
        ward_type,
        capacity: numCapacity,
        status,
      },
      req.ip
    );

    const [createdRows] = await pool.execute(
      `SELECT w.*, h.name AS hospital_name, d.name AS department_name
       FROM wards w
       JOIN hospitals h ON h.id = w.hospital_id
       JOIN departments d ON d.id = w.department_id
       WHERE w.id = ? LIMIT 1`,
      [newWardId]
    );

    return res.status(201).json({
      success: true,
      message: "Ward created successfully.",
      data: createdRows[0],
    });
  } catch (error) {
    console.error("Create ward error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to create ward." });
  }
});

/**
 * Lesson 10.1, 10.2, 10.3 — Update Ward Details & Capacity Configuration
 * PUT /api/wards/:id
 */
router.put("/:id", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const wardId = Number(req.params.id);
    if (!wardId || isNaN(wardId)) {
      return res.status(400).json({ success: false, message: "Invalid ward ID." });
    }

    const { name, ward_type, capacity } = req.body || {};

    const [existingRows] = await pool.execute(
      "SELECT * FROM wards WHERE id = ? LIMIT 1",
      [wardId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: "Ward not found." });
    }

    const ward = existingRows[0];
    if (!verifyHospitalAccess(req, ward.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to modify ward from another hospital." });
    }

    // Name validation
    let sanitizedName = ward.name;
    if (name !== undefined) {
      const nameCheck = validateWardName(name);
      if (!nameCheck.valid) {
        return res.status(400).json({ success: false, message: nameCheck.message });
      }
      sanitizedName = nameCheck.sanitized;

      // Check duplicate name if changed
      if (sanitizedName.toLowerCase() !== ward.name.toLowerCase()) {
        const [dupRows] = await pool.execute(
          "SELECT id FROM wards WHERE hospital_id = ? AND department_id = ? AND name = ? AND id != ? LIMIT 1",
          [ward.hospital_id, ward.department_id, sanitizedName, wardId]
        );
        if (dupRows.length > 0) {
          return res.status(409).json({
            success: false,
            message: `A ward named '${sanitizedName}' already exists in this department.`,
          });
        }
      }
    }

    // Ward type validation
    let sanitizedType = ward.ward_type;
    if (ward_type !== undefined) {
      if (!VALID_WARD_TYPES.includes(ward_type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ward type. Allowed types: ${VALID_WARD_TYPES.join(", ")}.`,
        });
      }
      sanitizedType = ward_type;
    }

    // Capacity validation against registered and occupied beds (Lesson 10.3)
    let sanitizedCapacity = ward.capacity;
    if (capacity !== undefined) {
      const numCapacity = Number(capacity);
      if (isNaN(numCapacity) || numCapacity < 1 || numCapacity > 1000) {
        return res.status(400).json({
          success: false,
          message: "Ward capacity must be a positive integer between 1 and 1000.",
        });
      }

      // Check current occupancy and bed count
      const [bedStats] = await pool.execute(
        `SELECT
           COUNT(*) AS total_beds,
           SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied_beds
         FROM beds WHERE ward_id = ?`,
        [wardId]
      );

      const totalBeds = bedStats[0].total_beds || 0;
      const occupiedBeds = bedStats[0].occupied_beds || 0;

      // Do not reduce capacity below the occupied-bed count (Lesson 10.3)
      if (numCapacity < occupiedBeds) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce ward capacity to ${numCapacity}. There are currently ${occupiedBeds} occupied beds in this ward.`,
        });
      }

      // Prevent reducing capacity below total registered beds
      if (numCapacity < totalBeds) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce ward capacity to ${numCapacity}. The ward currently has ${totalBeds} registered beds.`,
        });
      }

      sanitizedCapacity = numCapacity;
    }

    await pool.execute(
      `UPDATE wards
       SET name = ?, ward_type = ?, capacity = ?
       WHERE id = ?`,
      [sanitizedName, sanitizedType, sanitizedCapacity, wardId]
    );

    emitHospitalEvent(ward.hospital_id, "wards:updated", {
      action: "updated",
      wardId,
      name: sanitizedName,
      wardType: sanitizedType,
      capacity: sanitizedCapacity,
    });

    await logAudit(
      req.user.id,
      "UPDATE_WARD",
      "ward",
      wardId,
      {
        previous: { name: ward.name, ward_type: ward.ward_type, capacity: ward.capacity },
        updated: { name: sanitizedName, ward_type: sanitizedType, capacity: sanitizedCapacity },
      },
      req.ip
    );

    const [updatedRows] = await pool.execute(
      `SELECT w.*, h.name AS hospital_name, d.name AS department_name
       FROM wards w
       JOIN hospitals h ON h.id = w.hospital_id
       JOIN departments d ON d.id = w.department_id
       WHERE w.id = ? LIMIT 1`,
      [wardId]
    );

    return res.json({
      success: true,
      message: "Ward updated successfully.",
      data: updatedRows[0],
    });
  } catch (error) {
    console.error("Update ward error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update ward." });
  }
});

/**
 * Lesson 10.1 — Ward Status Management (Deactivation Protection)
 * PATCH /api/wards/:id/status
 */
router.patch("/:id/status", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const wardId = Number(req.params.id);
    const { status: targetStatus } = req.body || {};

    if (!targetStatus || !["active", "inactive"].includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'active' or 'inactive'.",
      });
    }

    const [existingRows] = await pool.execute(
      "SELECT * FROM wards WHERE id = ? LIMIT 1",
      [wardId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: "Ward not found." });
    }

    const ward = existingRows[0];
    if (!verifyHospitalAccess(req, ward.hospital_id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to change status of ward from another hospital." });
    }

    if (ward.status === targetStatus) {
      return res.status(400).json({
        success: false,
        message: `Ward is already '${targetStatus}'.`,
      });
    }

    // Lesson 10.1: If ward is being deactivated, enforce restriction if it has occupied beds
    if (targetStatus === "inactive") {
      const [occupiedCheck] = await pool.execute(
        "SELECT COUNT(*) AS occupied_count FROM beds WHERE ward_id = ? AND status = 'occupied'",
        [wardId]
      );

      const occupiedCount = occupiedCheck[0].occupied_count || 0;
      if (occupiedCount > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot deactivate ward. It currently has ${occupiedCount} occupied bed(s). All patients must be discharged or transferred before deactivation.`,
        });
      }
    }

    await pool.execute(
      "UPDATE wards SET status = ? WHERE id = ?",
      [targetStatus, wardId]
    );

    emitHospitalEvent(ward.hospital_id, "wards:updated", {
      action: "status_updated",
      wardId,
      status: targetStatus,
    });

    await logAudit(
      req.user.id,
      "UPDATE_WARD_STATUS",
      "ward",
      wardId,
      {
        previous_status: ward.status,
        new_status: targetStatus,
      },
      req.ip
    );

    return res.json({
      success: true,
      message: `Ward successfully marked as '${targetStatus}'.`,
      data: { id: wardId, status: targetStatus },
    });
  } catch (error) {
    console.error("Update ward status error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update ward status." });
  }
});

module.exports = router;
