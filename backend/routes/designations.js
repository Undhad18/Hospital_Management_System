const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/designations — List designations based on role & hospital isolation
router.get("/", async (req, res) => {
  try {
    const { hospital_id, search, status } = req.query;

    let sql = `
      SELECT
        d.id,
        d.hospital_id,
        d.name,
        d.description,
        d.status,
        d.created_at,
        d.updated_at,
        h.name AS hospital_name
      FROM designations d
      LEFT JOIN hospitals h ON h.id = d.hospital_id
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
      // Hospital Admin sees global designations (hospital_id IS NULL) + their own hospital designations
      conditions.push("(d.hospital_id IS NULL OR d.hospital_id = ?)");
      params.push(req.user.hospitalId);
    } else if (req.user.role === "super_admin") {
      // Super Admin can optionally filter by hospital_id, or scope=global
      if (hospital_id === "global" || hospital_id === "null") {
        conditions.push("d.hospital_id IS NULL");
      } else if (hospital_id !== undefined) {
        const hospNum = Number(hospital_id);
        if (!Number.isSafeInteger(hospNum) || hospNum < 1) {
          return res.status(400).json({
            success: false,
            message: "hospital_id must be a positive integer",
          });
        }
        conditions.push("(d.hospital_id = ? OR d.hospital_id IS NULL)");
        params.push(hospNum);
      }
    } else {
      // Doctor, staff, patient view active global + active for their hospital
      if (req.user.hospitalId) {
        conditions.push("(d.hospital_id IS NULL OR d.hospital_id = ?) AND d.status = 'active'");
        params.push(req.user.hospitalId);
      } else {
        conditions.push("d.hospital_id IS NULL AND d.status = 'active'");
      }
    }

    if (status) {
      conditions.push("d.status = ?");
      params.push(status);
    }

    if (search && search.trim()) {
      conditions.push("(d.name LIKE ? OR d.description LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY (d.hospital_id IS NULL) DESC, d.name ASC";

    const [designations] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: designations.length,
      data: designations,
    });
  } catch (error) {
    console.error("Failed to fetch designations:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve designations",
    });
  }
});

// GET /api/designations/:id — Get single designation
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid designation ID",
      });
    }

    const [rows] = await pool.execute(
      `SELECT d.id, d.hospital_id, d.name, d.description, d.status, d.created_at, h.name AS hospital_name
       FROM designations d
       LEFT JOIN hospitals h ON h.id = d.hospital_id
       WHERE d.id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    const designation = rows[0];

    // Hospital Admin can only see global or their own hospital designation
    if (
      req.user.role === "hospital_admin" &&
      designation.hospital_id !== null &&
      designation.hospital_id !== req.user.hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to another hospital's designation",
      });
    }

    return res.json({
      success: true,
      data: designation,
    });
  } catch (error) {
    console.error("Failed to fetch designation detail:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve designation",
    });
  }
});

// POST /api/designations — Create designation
router.post(
  "/",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { name, description, status } = req.body || {};
      let hospitalId = null;

      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "No hospital is assigned to this account",
          });
        }
        // Strict isolation: Hospital Admin can only create for their own hospital
        hospitalId = req.user.hospitalId;
      } else if (req.user.role === "super_admin") {
        // Super Admin can create global (null) or hospital-specific
        if (req.body?.hospital_id !== undefined && req.body.hospital_id !== null && req.body.hospital_id !== "") {
          const hospNum = Number(req.body.hospital_id);
          if (!Number.isSafeInteger(hospNum) || hospNum < 1) {
            return res.status(400).json({
              success: false,
              message: "Invalid hospital_id",
            });
          }
          const [hospitals] = await pool.execute("SELECT id FROM hospitals WHERE id = ?", [hospNum]);
          if (!hospitals.length) {
            return res.status(400).json({
              success: false,
              message: "Specified hospital does not exist",
            });
          }
          hospitalId = hospNum;
        }
      }

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Designation name is required",
        });
      }

      const cleanName = name.trim();
      const cleanDesc = description ? description.trim() : null;
      const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

      // Prevent duplicate designation in the same scope
      const [existing] = await pool.execute(
        hospitalId === null
          ? "SELECT id FROM designations WHERE hospital_id IS NULL AND LOWER(name) = LOWER(?) LIMIT 1"
          : "SELECT id FROM designations WHERE hospital_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        hospitalId === null ? [cleanName] : [hospitalId, cleanName]
      );

      if (existing.length) {
        return res.status(409).json({
          success: false,
          message: "That designation already exists in this scope",
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO designations (hospital_id, name, description, status)
         VALUES (?, ?, ?, ?)`,
        [hospitalId, cleanName, cleanDesc, cleanStatus]
      );

      return res.status(201).json({
        success: true,
        message: "Designation created successfully",
        data: { id: result.insertId, hospital_id: hospitalId, name: cleanName },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "That designation already exists in this scope",
        });
      }

      console.error("Failed to create designation:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create designation",
      });
    }
  }
);

// PATCH /api/designations/:id — Update designation
router.patch(
  "/:id",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid designation ID",
        });
      }

      const [rows] = await pool.execute(
        "SELECT id, hospital_id, name FROM designations WHERE id = ?",
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Designation not found",
        });
      }

      const designation = rows[0];

      // Hospital Admin can only edit their own hospital's designation (CANNOT edit global or another hospital's)
      if (req.user.role === "hospital_admin") {
        if (!req.user.hospitalId || designation.hospital_id !== req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: "You can only edit designations belonging to your assigned hospital",
          });
        }
      }

      const { name, description, status } = req.body || {};
      const updates = [];
      const values = [];

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            success: false,
            message: "Designation name cannot be empty",
          });
        }
        const cleanName = name.trim();
        const [existing] = await pool.execute(
          designation.hospital_id === null
            ? "SELECT id FROM designations WHERE hospital_id IS NULL AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1"
            : "SELECT id FROM designations WHERE hospital_id = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1",
          designation.hospital_id === null ? [cleanName, id] : [designation.hospital_id, cleanName, id]
        );
        if (existing.length) {
          return res.status(409).json({
            success: false,
            message: "That designation already exists in this scope",
          });
        }
        updates.push("name = ?");
        values.push(cleanName);
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
      await pool.execute(
        `UPDATE designations SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      return res.json({
        success: true,
        message: "Designation updated successfully",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "That designation name already exists in this scope",
        });
      }

      console.error("Failed to update designation:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to update designation",
      });
    }
  }
);

module.exports = router;
