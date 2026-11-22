const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/master-departments
 * Optional filters:
 * - search: string
 * - status: 'active' | 'inactive'
 * - hospital_id: number (annotates each master department with assignment state for this hospital)
 * - filter: 'all' | 'assigned' | 'unassigned'
 */
router.get("/", async (req, res) => {
  try {
    const { search, status, hospital_id, filter } = req.query;

    let targetHospitalId = null;
    if (req.user.role === "hospital_admin") {
      targetHospitalId = req.user.hospitalId ? Number(req.user.hospitalId) : null;
    } else if (hospital_id !== undefined && hospital_id !== null && hospital_id !== "") {
      const parsed = Number(hospital_id);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        targetHospitalId = parsed;
      }
    }

    let sql;
    const params = [];

    if (targetHospitalId) {
      sql = `
        SELECT
          md.id,
          md.name,
          md.code,
          md.description,
          md.status,
          md.created_at,
          CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned,
          d.id AS hospital_department_id,
          d.status AS hospital_department_status
        FROM master_departments md
        LEFT JOIN departments d ON d.master_department_id = md.id AND d.hospital_id = ?
      `;
      params.push(targetHospitalId);
    } else {
      sql = `
        SELECT
          md.id,
          md.name,
          md.code,
          md.description,
          md.status,
          md.created_at,
          COUNT(DISTINCT d.id) AS assigned_hospital_count
        FROM master_departments md
        LEFT JOIN departments d ON d.master_department_id = md.id
      `;
    }

    const conditions = [];

    if (status) {
      conditions.push("md.status = ?");
      params.push(status);
    }

    if (search && search.trim()) {
      conditions.push("(md.name LIKE ? OR md.code LIKE ? OR md.description LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (targetHospitalId && filter === "unassigned") {
      conditions.push("d.id IS NULL");
    } else if (targetHospitalId && filter === "assigned") {
      conditions.push("d.id IS NOT NULL");
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    if (!targetHospitalId) {
      sql += " GROUP BY md.id";
    }

    sql += " ORDER BY md.name ASC";

    const [rows] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows.map((r) => ({
        ...r,
        is_assigned: Boolean(r.is_assigned),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch master departments:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve master departments",
    });
  }
});

/**
 * GET /api/master-departments/:id
 * Retrieve a single master department by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid master department ID",
      });
    }

    const [rows] = await pool.execute(
      `SELECT md.id, md.name, md.code, md.description, md.status, md.created_at,
              COUNT(DISTINCT d.id) AS assigned_hospital_count
       FROM master_departments md
       LEFT JOIN departments d ON d.master_department_id = md.id
       WHERE md.id = ?
       GROUP BY md.id`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Master department not found",
      });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Failed to fetch master department:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve master department",
    });
  }
});

/**
 * POST /api/master-departments
 * Create new global master department (Super Admin only)
 */
router.post(
  "/",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const { name, code, description, status } = req.body || {};

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Department name is required",
        });
      }

      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Department code is required",
        });
      }

      const cleanName = name.trim();
      const cleanCode = code.trim().toUpperCase();
      const cleanDesc = description ? description.trim() : null;
      const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

      const [result] = await pool.execute(
        `INSERT INTO master_departments (name, code, description, status)
         VALUES (?, ?, ?, ?)`,
        [cleanName, cleanCode, cleanDesc, cleanStatus]
      );

      return res.status(201).json({
        success: true,
        message: "Master department created successfully",
        data: {
          id: result.insertId,
          name: cleanName,
          code: cleanCode,
          status: cleanStatus,
        },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "A master department with this name or code already exists",
        });
      }

      console.error("Failed to create master department:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create master department",
      });
    }
  }
);

/**
 * PATCH /api/master-departments/:id
 * Update global master department (Super Admin only)
 */
router.patch(
  "/:id",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid master department ID",
        });
      }

      const { name, code, description, status } = req.body || {};
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

      if (code !== undefined) {
        if (typeof code !== "string" || !code.trim()) {
          return res.status(400).json({
            success: false,
            message: "Department code cannot be empty",
          });
        }
        updates.push("code = ?");
        values.push(code.trim().toUpperCase());
      }

      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description ? description.trim() : null);
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
          message: "No fields provided to update",
        });
      }

      values.push(id);
      const [result] = await pool.execute(
        `UPDATE master_departments SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Master department not found",
        });
      }

      return res.json({
        success: true,
        message: "Master department updated successfully",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "A master department with this name or code already exists",
        });
      }

      console.error("Failed to update master department:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to update master department",
      });
    }
  }
);

module.exports = router;
