
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { emitHospitalEvent } = require("../services/socketService");
const router = express.Router();
router.use(
  requireAuth,
  allowRoles("super_admin", "hospital_admin")
);

// GET /api/departments
// Optional filter: /api/departments?hospital_id=1

router.get("/", async (req, res) => {
  try {
    const { hospital_id, search, status } = req.query;

    let sql = `
      SELECT
        d.id,
        d.hospital_id,
        d.master_department_id,
        md.name AS master_department_name,
        md.code AS master_department_code,
        d.name,
        d.description,
        d.status,
        d.created_at,
        d.updated_at,
        h.name AS hospital_name,
        COUNT(DISTINCT u.id) AS member_count
      FROM departments d
      INNER JOIN hospitals h ON h.id = d.hospital_id
      LEFT JOIN master_departments md ON md.id = d.master_department_id
      LEFT JOIN users u ON u.department_id = d.id
    `;

    const conditions = [];
    const params = [];

    if (req.user.role === "hospital_admin") {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital is assigned to this account",
        });
      }

      if (hospital_id !== undefined &&
          String(hospital_id) !== String(req.user.hospitalId)) {
        return res.status(403).json({
          success: false,
          message: "You cannot access another hospital's departments",
        });
      }

      conditions.push("d.hospital_id = ?");
      params.push(req.user.hospitalId);
    } else if (hospital_id !== undefined) {
      const hospitalId = Number(hospital_id);

      if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
        return res.status(400).json({
          success: false,
          message: "hospital_id must be a positive integer",
        });
      }

      conditions.push("d.hospital_id = ?");
      params.push(hospitalId);
    }

    if (status) {
      conditions.push("d.status = ?");
      params.push(status);
    }

    if (search && search.trim()) {
      conditions.push("(d.name LIKE ? OR d.description LIKE ? OR md.code LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " GROUP BY d.id ORDER BY h.name, d.name";

    const [departments] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    console.error("Failed to fetch departments:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve departments",
    });
  }
});

// GET /api/departments/:id — Get single department
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID",
      });
    }

    const [rows] = await pool.execute(
      `SELECT d.id, d.hospital_id, d.master_department_id,
              md.name AS master_department_name, md.code AS master_department_code,
              d.name, d.description, d.status, d.created_at, d.updated_at,
              h.name AS hospital_name, COUNT(DISTINCT u.id) AS member_count
       FROM departments d
       JOIN hospitals h ON h.id = d.hospital_id
       LEFT JOIN master_departments md ON md.id = d.master_department_id
       LEFT JOIN users u ON u.department_id = d.id
       WHERE d.id = ?
       GROUP BY d.id`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    const department = rows[0];

    if (
      req.user.role === "hospital_admin" &&
      department.hospital_id !== req.user.hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot view another hospital's department",
      });
    }

    return res.json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error("Failed to fetch department:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve department",
    });
  }
});

/**
 * POST /api/departments/assign-master
 * Lesson 4.1: Assign Master Department to a Hospital
 */
router.post(
  "/assign-master",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { master_department_id, custom_description } = req.body || {};
      let hospitalId = Number(req.body?.hospital_id);

      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }
        hospitalId = Number(req.user.hospitalId);
      }

      if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
        return res.status(400).json({
          success: false,
          message: "A valid hospital_id is required",
        });
      }

      const masterDeptId = Number(master_department_id);
      if (!Number.isSafeInteger(masterDeptId) || masterDeptId < 1) {
        return res.status(400).json({
          success: false,
          message: "A valid master_department_id is required",
        });
      }

      // Verify hospital is active
      const [hospitals] = await pool.execute(
        "SELECT id, name FROM hospitals WHERE id = ? AND status = 'active'",
        [hospitalId]
      );
      if (!hospitals.length) {
        return res.status(400).json({
          success: false,
          message: "Active hospital not found",
        });
      }

      // Verify master department is active
      const [masterDepts] = await pool.execute(
        "SELECT id, name, description, status FROM master_departments WHERE id = ? AND status = 'active'",
        [masterDeptId]
      );
      if (!masterDepts.length) {
        return res.status(400).json({
          success: false,
          message: "Active master department not found",
        });
      }
      const masterDept = masterDepts[0];

      // Prevent duplicate assignment: either by master_department_id or by name in this hospital
      const [existing] = await pool.execute(
        `SELECT id FROM departments
         WHERE hospital_id = ? AND (master_department_id = ? OR name = ?)
         LIMIT 1`,
        [hospitalId, masterDeptId, masterDept.name]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Department '${masterDept.name}' is already assigned to this hospital`,
        });
      }

      const desc = custom_description !== undefined && custom_description !== null && custom_description !== ""
        ? String(custom_description).trim()
        : masterDept.description;

      const [result] = await pool.execute(
        `INSERT INTO departments
          (hospital_id, master_department_id, name, description, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [hospitalId, masterDeptId, masterDept.name, desc]
      );

      emitHospitalEvent(hospitalId, "departments:updated", {
        action: "assigned_master",
        departmentId: result.insertId,
        masterDepartmentId: masterDeptId,
        name: masterDept.name,
      });

      return res.status(201).json({
        success: true,
        message: `Master department '${masterDept.name}' assigned successfully`,
        data: {
          id: result.insertId,
          hospital_id: hospitalId,
          master_department_id: masterDeptId,
          name: masterDept.name,
          description: desc,
          status: "active",
        },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "This department is already assigned to this hospital",
        });
      }
      console.error("Assign master department failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to assign master department",
      });
    }
  }
);

// Create custom hospital department (Lesson 4.2)
router.post(
  "/",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { name, description, master_department_id, status } = req.body || {};
      let hospitalId = Number(req.body?.hospital_id);

      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }

        hospitalId = Number(req.user.hospitalId);
      }

      if (
        !Number.isSafeInteger(hospitalId) ||
        hospitalId < 1 ||
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid hospital and department name are required",
        });
      }

      const [hospitals] = await pool.execute(
        "SELECT id FROM hospitals WHERE id = ? AND status = 'active'",
        [hospitalId]
      );

      if (!hospitals.length) {
        return res.status(400).json({
          success: false,
          message: "Active hospital not found",
        });
      }

      let masterDeptId = null;
      if (master_department_id) {
        const parsed = Number(master_department_id);
        if (Number.isSafeInteger(parsed) && parsed > 0) {
          masterDeptId = parsed;
        }
      }

      const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

      const [result] = await pool.execute(
        `INSERT INTO departments
          (hospital_id, master_department_id, name, description, status)
         VALUES (?, ?, ?, ?, ?)`,
        [hospitalId, masterDeptId, name.trim(), description || null, cleanStatus]
      );

      emitHospitalEvent(hospitalId, "departments:updated", {
        action: "created",
        departmentId: result.insertId,
        name: name.trim(),
        status: cleanStatus,
      });

      return res.status(201).json({
        success: true,
        message: "Department created",
        data: { id: result.insertId, hospital_id: hospitalId, name: name.trim(), status: cleanStatus },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "That department already exists in this hospital",
        });
      }

      console.error("Department creation failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create department",
      });
    }
  }
);

// Update department within the user's authorized hospital
router.patch(
  "/:id",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, status } = req.body || {};

      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid department ID",
        });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            success: false,
            message: "Department name cannot be empty",
          });
        }

        updates.push("name = ?");
        values.push(name.trim());
      }

      if (description !== undefined) {
        if (description !== null && typeof description !== "string") {
          return res.status(400).json({
            success: false,
            message: "Description must be text or null",
          });
        }

        updates.push("description = ?");
        values.push(description);
      }

      if (status !== undefined) {
        if (!["active", "inactive"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Status must be active or inactive",
          });
        }

        updates.push("status = ?");
        values.push(status);
      }

      if (!updates.length) {
        return res.status(400).json({
          success: false,
          message: "Provide at least one field to update",
        });
      }

      let sql = "UPDATE departments SET " +
        updates.join(", ") + " WHERE id = ?";
      values.push(id);

      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }

        sql += " AND hospital_id = ?";
        values.push(req.user.hospitalId);
      }

      const [result] = await pool.execute(sql, values);

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Department not found in your authorized scope",
        });
      }

      const [deptRows] = await pool.execute(
        "SELECT hospital_id, name, status FROM departments WHERE id = ? LIMIT 1",
        [id]
      );
      if (deptRows.length) {
        emitHospitalEvent(deptRows[0].hospital_id, "departments:updated", {
          action: "updated",
          departmentId: id,
          name: deptRows[0].name,
          status: deptRows[0].status,
        });
      }

      return res.json({
        success: true,
        message: "Department updated",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "That department name already exists in this hospital",
        });
      }

      console.error("Department update failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to update department",
      });
    }
  }
);

module.exports = router;


