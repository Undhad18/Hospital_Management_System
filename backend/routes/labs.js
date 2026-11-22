const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { uploadLabReport, labReportUploadDir } = require("../middleware/upload");
const { logAudit } = require("../services/auditService");

const router = express.Router();

// Apply authentication to all laboratory management routes
router.use(requireAuth);

/**
 * ============================================================================
 * Lesson 11.1: Master Laboratory Test Catalog Management
 * ============================================================================
 */

/**
 * GET /api/labs/master-tests
 * List and search master laboratory tests with filtering and pagination.
 * Accessible to Super Admin, Hospital Admin, Doctor, and Staff.
 */
router.get(
  "/master-tests",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const {
        q = "",
        search = "",
        category = "",
        status = "",
        page = 1,
        limit = 50,
      } = req.query;

      const searchTerm = (q || search).trim();
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const whereConditions = [];
      const queryParams = [];

      // Non-super_admin users only see active tests by default unless explicitly permitted
      if (req.user.role !== "super_admin") {
        whereConditions.push("status = 'active'");
      } else if (status && status !== "all") {
        whereConditions.push("status = ?");
        queryParams.push(status);
      }

      if (category && category !== "all") {
        whereConditions.push("category = ?");
        queryParams.push(category);
      }

      if (searchTerm) {
        whereConditions.push(
          "(test_name LIKE ? OR test_code LIKE ? OR category LIKE ? OR description LIKE ?)"
        );
        const wild = `%${searchTerm}%`;
        queryParams.push(wild, wild, wild, wild);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

      // Total count
      const [countResult] = await pool.query(
        `SELECT COUNT(*) AS total FROM master_lab_tests ${whereClause}`,
        queryParams
      );
      const total = countResult[0].total;

      // Rows
      const [rows] = await pool.query(
        `SELECT
           id,
           test_code,
           test_name,
           category,
           sample_type,
           standard_turnaround_hours,
           description,
           instructions,
           status,
           created_at,
           updated_at
         FROM master_lab_tests
         ${whereClause}
         ORDER BY category ASC, test_name ASC
         LIMIT ? OFFSET ?`,
        [...queryParams, limitNum, offset]
      );

      return res.json({
        success: true,
        data: rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      });
    } catch (error) {
      console.error("Error fetching master lab tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve master laboratory test catalog",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/master-tests/:id
 * Retrieve single master laboratory test with usage stats.
 */
router.get(
  "/master-tests/:id",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [rows] = await pool.query(
        `SELECT
           id,
           test_code,
           test_name,
           category,
           sample_type,
           standard_turnaround_hours,
           description,
           instructions,
           status,
           created_at,
           updated_at
         FROM master_lab_tests
         WHERE id = ?`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Master laboratory test not found",
        });
      }

      const test = rows[0];

      // Usage stats: how many hospitals offer it, and how many orders have been placed
      const [[hospUsage]] = await pool.query(
        `SELECT COUNT(*) AS hospital_count FROM hospital_lab_tests WHERE master_test_id = ?`,
        [id]
      );
      const [[orderUsage]] = await pool.query(
        `SELECT COUNT(*) AS order_count FROM investigation_requests WHERE master_test_id = ?`,
        [id]
      );

      test.usage_stats = {
        hospitals_offering: hospUsage.hospital_count,
        orders_placed: orderUsage.order_count,
      };

      return res.json({
        success: true,
        data: test,
      });
    } catch (error) {
      console.error("Error fetching master lab test by id:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve master laboratory test details",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/master-tests
 * Create a new master laboratory test.
 * Super Admin only.
 */
router.post(
  "/master-tests",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const {
        test_code,
        test_name,
        category,
        sample_type = null,
        standard_turnaround_hours = 24,
        description = null,
        instructions = null,
        status = "active",
      } = req.body;

      // 1. Validation
      if (!test_name || !test_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Test name is required",
        });
      }

      if (!test_code || !test_code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Unique test code is required",
        });
      }

      if (!category || !category.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }

      const cleanCode = test_code.trim().toUpperCase();
      const cleanName = test_name.trim();
      const cleanCategory = category.trim();
      const turnaround = Math.max(1, parseInt(standard_turnaround_hours, 10) || 24);
      const cleanStatus = status === "inactive" ? "inactive" : "active";

      // 2. Uniqueness check for test_code
      const [existingCode] = await pool.query(
        `SELECT id, test_code FROM master_lab_tests WHERE UPPER(test_code) = ? LIMIT 1`,
        [cleanCode]
      );
      if (existingCode.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Master laboratory test with code '${cleanCode}' already exists`,
        });
      }

      // 3. Uniqueness check for test_name
      const [existingName] = await pool.query(
        `SELECT id, test_name FROM master_lab_tests WHERE LOWER(test_name) = LOWER(?) LIMIT 1`,
        [cleanName]
      );
      if (existingName.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Master laboratory test with name '${cleanName}' already exists`,
        });
      }

      // 4. Insert into master_lab_tests
      const [insertResult] = await pool.query(
        `INSERT INTO master_lab_tests
           (test_code, test_name, category, sample_type, standard_turnaround_hours, description, instructions, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanCode,
          cleanName,
          cleanCategory,
          sample_type ? sample_type.trim() : null,
          turnaround,
          description ? description.trim() : null,
          instructions ? instructions.trim() : null,
          cleanStatus,
        ]
      );

      const [newRow] = await pool.query(
        `SELECT id, test_code, test_name, category, sample_type, standard_turnaround_hours, description, instructions, status, created_at, updated_at
         FROM master_lab_tests WHERE id = ?`,
        [insertResult.insertId]
      );

      return res.status(201).json({
        success: true,
        message: "Master laboratory test created successfully",
        data: newRow[0],
      });
    } catch (error) {
      console.error("Error creating master lab test:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create master laboratory test",
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/labs/master-tests/:id
 * Update an existing master laboratory test.
 * Super Admin only.
 */
router.put(
  "/master-tests/:id",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        test_code,
        test_name,
        category,
        sample_type = null,
        standard_turnaround_hours = 24,
        description = null,
        instructions = null,
        status = "active",
      } = req.body;

      // 1. Check existing record
      const [existing] = await pool.query(
        `SELECT id FROM master_lab_tests WHERE id = ?`,
        [id]
      );
      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Master laboratory test not found",
        });
      }

      // 2. Validation
      if (!test_name || !test_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Test name is required",
        });
      }

      if (!test_code || !test_code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Unique test code is required",
        });
      }

      if (!category || !category.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }

      const cleanCode = test_code.trim().toUpperCase();
      const cleanName = test_name.trim();
      const cleanCategory = category.trim();
      const turnaround = Math.max(1, parseInt(standard_turnaround_hours, 10) || 24);
      const cleanStatus = status === "inactive" ? "inactive" : "active";

      // 3. Uniqueness checks excluding current ID
      const [duplicateCode] = await pool.query(
        `SELECT id FROM master_lab_tests WHERE UPPER(test_code) = ? AND id != ? LIMIT 1`,
        [cleanCode, id]
      );
      if (duplicateCode.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Another test with code '${cleanCode}' already exists`,
        });
      }

      const [duplicateName] = await pool.query(
        `SELECT id FROM master_lab_tests WHERE LOWER(test_name) = LOWER(?) AND id != ? LIMIT 1`,
        [cleanName, id]
      );
      if (duplicateName.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Another test with name '${cleanName}' already exists`,
        });
      }

      // 4. Update
      await pool.query(
        `UPDATE master_lab_tests
         SET test_code = ?,
             test_name = ?,
             category = ?,
             sample_type = ?,
             standard_turnaround_hours = ?,
             description = ?,
             instructions = ?,
             status = ?
         WHERE id = ?`,
        [
          cleanCode,
          cleanName,
          cleanCategory,
          sample_type ? sample_type.trim() : null,
          turnaround,
          description ? description.trim() : null,
          instructions ? instructions.trim() : null,
          cleanStatus,
          id,
        ]
      );

      const [updatedRow] = await pool.query(
        `SELECT id, test_code, test_name, category, sample_type, standard_turnaround_hours, description, instructions, status, created_at, updated_at
         FROM master_lab_tests WHERE id = ?`,
        [id]
      );

      return res.json({
        success: true,
        message: "Master laboratory test updated successfully",
        data: updatedRow[0],
      });
    } catch (error) {
      console.error("Error updating master lab test:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update master laboratory test",
        error: error.message,
      });
    }
  }
);

/**
 * PATCH /api/labs/master-tests/:id/status
 * Activate or deactivate master laboratory test.
 * Preserves all historical records.
 * Super Admin only.
 */
router.patch(
  "/master-tests/:id/status",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 'active' or 'inactive'",
        });
      }

      const [existing] = await pool.query(
        `SELECT id, test_name, status FROM master_lab_tests WHERE id = ?`,
        [id]
      );
      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Master laboratory test not found",
        });
      }

      await pool.query(
        `UPDATE master_lab_tests SET status = ? WHERE id = ?`,
        [status, id]
      );

      return res.json({
        success: true,
        message: `Master laboratory test status updated to ${status}`,
        data: { id: Number(id), status },
      });
    } catch (error) {
      console.error("Error toggling master lab test status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update master test status",
        error: error.message,
      });
    }
  }
);

/**
 * DELETE /api/labs/master-tests/:id
 * Delete master laboratory test IF AND ONLY IF it has never been assigned or ordered.
 * Prevents accidental deletion of referenced records.
 * Super Admin only.
 */
router.delete(
  "/master-tests/:id",
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [existing] = await pool.query(
        `SELECT id, test_name FROM master_lab_tests WHERE id = ?`,
        [id]
      );
      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Master laboratory test not found",
        });
      }

      // Check hospital assignments
      const [[hospUsage]] = await pool.query(
        `SELECT COUNT(*) AS count FROM hospital_lab_tests WHERE master_test_id = ?`,
        [id]
      );
      if (hospUsage.count > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete test: it is currently assigned to one or more hospitals. Deactivate the test instead to preserve audit history.",
        });
      }

      // Check laboratory orders
      const [[orderUsage]] = await pool.query(
        `SELECT COUNT(*) AS count FROM investigation_requests WHERE master_test_id = ?`,
        [id]
      );
      if (orderUsage.count > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot delete test: it is referenced in existing patient laboratory orders. Deactivate the test instead.",
        });
      }

      await pool.query(`DELETE FROM master_lab_tests WHERE id = ?`, [id]);

      return res.json({
        success: true,
        message: "Master laboratory test deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting master lab test:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete master laboratory test",
        error: error.message,
      });
    }
  }
);

/**
 * ============================================================================
 * Lesson 11.2: Assigning Laboratory Tests to Hospitals
 * ============================================================================
 */

/**
 * Helper: Resolve target hospital_id and verify data isolation
 */
function resolveHospitalId(req, requestedHospitalId) {
  if (req.user.role === "super_admin") {
    return requestedHospitalId ? parseInt(requestedHospitalId, 10) : null;
  }
  // For hospital_admin, doctor, staff: strictly enforced to their assigned hospital
  const userHospId = parseInt(req.user.hospitalId, 10);
  if (
    requestedHospitalId &&
    parseInt(requestedHospitalId, 10) !== userHospId
  ) {
    const err = new Error(
      "Access denied: You can only view and manage laboratory test offerings for your assigned hospital."
    );
    err.status = 403;
    throw err;
  }
  return userHospId;
}

/**
 * GET /api/labs/hospital-tests
 * List tests assigned to a hospital with search, category filter, and status filter.
 * Accessible to Super Admin, Hospital Admin, Doctor, and Staff.
 */
router.get(
  "/hospital-tests",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const {
        hospital_id,
        q = "",
        search = "",
        category = "",
        status = "",
        page = 1,
        limit = 50,
      } = req.query;

      let targetHospitalId;
      try {
        targetHospitalId = resolveHospitalId(req, hospital_id);
      } catch (authErr) {
        return res.status(authErr.status || 403).json({
          success: false,
          message: authErr.message,
        });
      }

      if (!targetHospitalId && req.user.role !== "super_admin") {
        return res.status(400).json({
          success: false,
          message: "No hospital associated with this user session.",
        });
      }

      const searchTerm = (q || search).trim();
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const whereConditions = [];
      const queryParams = [];

      if (targetHospitalId) {
        whereConditions.push("hlt.hospital_id = ?");
        queryParams.push(targetHospitalId);
      }

      // Doctors and Staff should only see active test offerings during consultations / ordering
      if (req.user.role === "doctor" || req.user.role === "staff") {
        whereConditions.push("hlt.status = 'active'");
        whereConditions.push("mlt.status = 'active'");
      } else if (status && status !== "all") {
        whereConditions.push("hlt.status = ?");
        queryParams.push(status);
      }

      if (category && category !== "all") {
        whereConditions.push("mlt.category = ?");
        queryParams.push(category);
      }

      if (searchTerm) {
        whereConditions.push(
          "(mlt.test_name LIKE ? OR mlt.test_code LIKE ? OR mlt.category LIKE ? OR h.name LIKE ?)"
        );
        const wild = `%${searchTerm}%`;
        queryParams.push(wild, wild, wild, wild);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

      // Count
      const [countResult] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         JOIN hospitals h ON h.id = hlt.hospital_id
         ${whereClause}`,
        queryParams
      );
      const total = countResult[0].total;

      // Rows
      const [rows] = await pool.query(
        `SELECT
           hlt.id,
           hlt.hospital_id,
           h.name AS hospital_name,
           h.code AS hospital_code,
           hlt.master_test_id,
           mlt.test_code,
           mlt.test_name,
           mlt.category,
           mlt.sample_type,
           mlt.standard_turnaround_hours,
           mlt.description,
           mlt.instructions,
           mlt.status AS master_status,
           hlt.price,
           hlt.status,
           hlt.created_at,
           hlt.updated_at
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         JOIN hospitals h ON h.id = hlt.hospital_id
         ${whereClause}
         ORDER BY mlt.category ASC, mlt.test_name ASC
         LIMIT ? OFFSET ?`,
        [...queryParams, limitNum, offset]
      );

      return res.json({
        success: true,
        data: rows,
        hospital_id: targetHospitalId,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      });
    } catch (error) {
      console.error("Error fetching hospital laboratory tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve hospital laboratory test offerings",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/hospital-tests/unassigned
 * Retrieve active master tests that have NOT yet been assigned to the specified hospital.
 * Powers the "Add Tests" catalog selector in the frontend.
 */
router.get(
  "/hospital-tests/unassigned",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { hospital_id, q = "", category = "" } = req.query;

      let targetHospitalId;
      try {
        targetHospitalId = resolveHospitalId(req, hospital_id);
      } catch (authErr) {
        return res.status(authErr.status || 403).json({
          success: false,
          message: authErr.message,
        });
      }

      if (!targetHospitalId) {
        return res.status(400).json({
          success: false,
          message: "Valid hospital_id is required",
        });
      }

      const whereConditions = [
        "mlt.status = 'active'",
        "mlt.id NOT IN (SELECT master_test_id FROM hospital_lab_tests WHERE hospital_id = ?)",
      ];
      const queryParams = [targetHospitalId];

      if (category && category !== "all") {
        whereConditions.push("mlt.category = ?");
        queryParams.push(category);
      }

      const searchTerm = q.trim();
      if (searchTerm) {
        whereConditions.push(
          "(mlt.test_name LIKE ? OR mlt.test_code LIKE ? OR mlt.category LIKE ?)"
        );
        const wild = `%${searchTerm}%`;
        queryParams.push(wild, wild, wild);
      }

      const [rows] = await pool.query(
        `SELECT
           mlt.id,
           mlt.test_code,
           mlt.test_name,
           mlt.category,
           mlt.sample_type,
           mlt.standard_turnaround_hours,
           mlt.description
         FROM master_lab_tests mlt
         WHERE ${whereConditions.join(" AND ")}
         ORDER BY mlt.category ASC, mlt.test_name ASC`,
        queryParams
      );

      return res.json({
        success: true,
        data: rows,
        hospital_id: targetHospitalId,
      });
    } catch (error) {
      console.error("Error fetching unassigned master lab tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve unassigned master laboratory tests",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/hospital-tests
 * Assign one or more master laboratory tests to a hospital.
 * Enforces hospital eligibility, master test eligibility, duplicate prevention, and hospital data isolation.
 */
router.post(
  "/hospital-tests",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const {
        hospital_id,
        master_test_id,
        master_test_ids,
        price = 0.0,
        status = "active",
      } = req.body;

      let targetHospitalId;
      try {
        targetHospitalId = resolveHospitalId(req, hospital_id);
      } catch (authErr) {
        return res.status(authErr.status || 403).json({
          success: false,
          message: authErr.message,
        });
      }

      if (!targetHospitalId) {
        return res.status(400).json({
          success: false,
          message: "Valid hospital_id is required",
        });
      }

      // 1. Verify Hospital exists and is active
      const [hospRows] = await pool.query(
        `SELECT id, name, status FROM hospitals WHERE id = ?`,
        [targetHospitalId]
      );
      if (!hospRows.length) {
        return res.status(404).json({
          success: false,
          message: "Hospital not found",
        });
      }
      if (hospRows[0].status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Cannot assign laboratory tests to an inactive hospital facility.",
        });
      }

      // Collect list of master_test_ids to assign
      const idsToAssign = [];
      if (Array.isArray(master_test_ids) && master_test_ids.length > 0) {
        idsToAssign.push(...master_test_ids.map((id) => Number(id)));
      } else if (master_test_id) {
        idsToAssign.push(Number(master_test_id));
      }

      if (idsToAssign.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one master_test_id is required",
        });
      }

      // Validate price (Lesson 11.3 pricing support)
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid non-negative number",
        });
      }

      const assignedResults = [];
      const duplicateCodes = [];

      for (const mId of idsToAssign) {
        // Verify master test exists and is active
        const [mRows] = await pool.query(
          `SELECT id, test_code, test_name, status FROM master_lab_tests WHERE id = ?`,
          [mId]
        );
        if (!mRows.length) {
          return res.status(404).json({
            success: false,
            message: `Master test ID #${mId} not found`,
          });
        }
        if (mRows[0].status !== "active") {
          return res.status(400).json({
            success: false,
            message: `Cannot assign inactive master test '${mRows[0].test_name}' (${mRows[0].test_code}). Activate it in master catalog first.`,
          });
        }

        // Duplicate Check: has this master test already been assigned to this hospital?
        const [existingAssignment] = await pool.query(
          `SELECT id FROM hospital_lab_tests WHERE hospital_id = ? AND master_test_id = ? LIMIT 1`,
          [targetHospitalId, mId]
        );

        if (existingAssignment.length > 0) {
          duplicateCodes.push(mRows[0].test_code);
          continue;
        }

        // Insert assignment
        const [insertRes] = await pool.query(
          `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
           VALUES (?, ?, ?, ?)`,
          [targetHospitalId, mId, numericPrice, status === "inactive" ? "inactive" : "active"]
        );

        assignedResults.push({
          id: insertRes.insertId,
          hospital_id: targetHospitalId,
          master_test_id: mId,
          test_code: mRows[0].test_code,
          test_name: mRows[0].test_name,
          price: numericPrice,
          status: status === "inactive" ? "inactive" : "active",
        });
      }

      // If single assignment requested and was duplicate -> 409 Conflict
      if (idsToAssign.length === 1 && duplicateCodes.length === 1) {
        return res.status(409).json({
          success: false,
          message: `Laboratory test '${duplicateCodes[0]}' is already assigned to this hospital.`,
        });
      }

      return res.status(201).json({
        success: true,
        message: `Successfully assigned ${assignedResults.length} test(s) to hospital.`,
        data: assignedResults,
        duplicates_skipped: duplicateCodes,
      });
    } catch (error) {
      console.error("Error assigning hospital laboratory tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to assign laboratory tests to hospital",
        error: error.message,
      });
    }
  }
);

/**
 * PATCH /api/labs/hospital-tests/:id/status
 * Activate or deactivate a hospital's laboratory test offering.
 * Preserves historical orders and ensures hospital isolation.
 */
router.patch(
  "/hospital-tests/:id/status",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 'active' or 'inactive'",
        });
      }

      const [existingRows] = await pool.query(
        `SELECT hlt.id, hlt.hospital_id, hlt.master_test_id, hlt.status, mlt.test_name
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         WHERE hlt.id = ?`,
        [id]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          success: false,
          message: "Hospital laboratory test offering not found",
        });
      }

      const item = existingRows[0];

      // Hospital data isolation check
      if (
        req.user.role === "hospital_admin" &&
        parseInt(item.hospital_id, 10) !== parseInt(req.user.hospitalId, 10)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot modify another hospital's laboratory test offerings.",
        });
      }

      await pool.query(
        `UPDATE hospital_lab_tests SET status = ? WHERE id = ?`,
        [status, id]
      );

      return res.json({
        success: true,
        message: `Test '${item.test_name}' is now ${status.toUpperCase()} for this hospital.`,
        data: { id: Number(id), status },
      });
    } catch (error) {
      console.error("Error updating hospital test status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update hospital test status",
        error: error.message,
      });
    }
  }
);

/**
 * DELETE /api/labs/hospital-tests/:id
 * Remove a test offering from a hospital if no clinical orders have been placed.
 * Preserves historical orders; if orders exist, removal is rejected with 409 Conflict.
 */
router.delete(
  "/hospital-tests/:id",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [existingRows] = await pool.query(
        `SELECT hlt.id, hlt.hospital_id, hlt.master_test_id, mlt.test_name, mlt.test_code
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         WHERE hlt.id = ?`,
        [id]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          success: false,
          message: "Hospital laboratory test offering not found",
        });
      }

      const item = existingRows[0];

      // Hospital data isolation check
      if (
        req.user.role === "hospital_admin" &&
        parseInt(item.hospital_id, 10) !== parseInt(req.user.hospitalId, 10)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot delete another hospital's laboratory offerings.",
        });
      }

      // Check if historical orders exist for this hospital + test
      const [[orderCheck]] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM investigation_requests
         WHERE hospital_id = ? AND master_test_id = ?`,
        [item.hospital_id, item.master_test_id]
      );

      if (orderCheck.count > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot remove '${item.test_name}' (${item.test_code}) as ${orderCheck.count} historical patient order(s) exist. Deactivate the test offering instead to preserve audit integrity.`,
        });
      }

      await pool.query(`DELETE FROM hospital_lab_tests WHERE id = ?`, [id]);

      return res.json({
        success: true,
        message: `Laboratory test offering '${item.test_name}' removed from hospital catalog.`,
      });
    } catch (error) {
      console.error("Error removing hospital lab test:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to remove hospital laboratory test offering",
        error: error.message,
      });
    }
  }
);

/**
 * ============================================================================
 * Lesson 11.3: Hospital-Specific Laboratory Pricing
 * ============================================================================
 */

/**
 * PATCH /api/labs/hospital-tests/:id/price
 * Update the hospital-specific pricing for a test offering.
 * Validates non-negative decimal, enforces hospital data isolation, and logs audit record.
 */
router.patch(
  "/hospital-tests/:id/price",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { price } = req.body;

      // 1. Validate price input
      if (price === undefined || price === null || price === "") {
        return res.status(400).json({
          success: false,
          message: "Price is required.",
        });
      }

      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || !isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid, non-negative number.",
        });
      }

      // Format strictly to 2 decimal places to prevent floating-point calculation anomalies
      const formattedPrice = Number(numericPrice.toFixed(2));

      // 2. Fetch existing offering record
      const [existingRows] = await pool.query(
        `SELECT
           hlt.id,
           hlt.hospital_id,
           hlt.master_test_id,
           hlt.price,
           mlt.test_code,
           mlt.test_name,
           h.name AS hospital_name
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         JOIN hospitals h ON h.id = hlt.hospital_id
         WHERE hlt.id = ?`,
        [id]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          success: false,
          message: "Hospital laboratory test offering not found.",
        });
      }

      const item = existingRows[0];

      // 3. Enforce Hospital Data Isolation
      if (
        req.user.role === "hospital_admin" &&
        parseInt(item.hospital_id, 10) !== parseInt(req.user.hospitalId, 10)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot alter pricing for another hospital.",
        });
      }

      const oldPrice = parseFloat(item.price);

      // 4. Update Price
      await pool.query(
        `UPDATE hospital_lab_tests SET price = ? WHERE id = ?`,
        [formattedPrice, id]
      );

      // 5. Audit Log (Lesson 11.3 Requirement: Record price changes per audit conventions)
      await logAudit(
        req.user.id,
        "UPDATE_LAB_TEST_PRICE",
        "hospital_lab_test",
        id,
        {
          hospital_id: item.hospital_id,
          master_test_id: item.master_test_id,
          test_code: item.test_code,
          test_name: item.test_name,
          previous_price: oldPrice,
          new_price: formattedPrice,
        },
        req.ip
      );

      return res.json({
        success: true,
        message: `Price for '${item.test_name}' updated from ₹${oldPrice.toFixed(2)} to ₹${formattedPrice.toFixed(2)}.`,
        data: {
          id: Number(id),
          hospital_id: item.hospital_id,
          master_test_id: item.master_test_id,
          test_code: item.test_code,
          test_name: item.test_name,
          previous_price: oldPrice,
          price: formattedPrice,
        },
      });
    } catch (error) {
      console.error("Error updating laboratory test price:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update laboratory test price.",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/orders
 * Place a laboratory order with hospital offering verification and server-side price snapshotting.
 * Server database strictly controls the price snapshot; frontend price payloads are ignored.
 */
router.post(
  "/orders",
  allowRoles("doctor", "staff", "hospital_admin", "super_admin"),
  async (req, res) => {
    try {
      const {
        patient_id,
        hospital_id,
        master_test_id,
        appointment_id = null,
        consultation_id = null,
        priority = "routine",
        clinical_notes = null,
      } = req.body;

      // 1. Determine target hospital
      let targetHospitalId;
      try {
        targetHospitalId = resolveHospitalId(req, hospital_id);
      } catch (authErr) {
        return res.status(authErr.status || 403).json({
          success: false,
          message: authErr.message,
        });
      }

      if (!targetHospitalId) {
        return res.status(400).json({
          success: false,
          message: "Hospital ID is required.",
        });
      }

      // 2. Validate patient exists
      const patientId = Number(patient_id);
      if (!patientId || isNaN(patientId)) {
        return res.status(400).json({
          success: false,
          message: "Valid patient_id is required.",
        });
      }

      const [patientRows] = await pool.query(
        `SELECT id, full_name, email FROM users WHERE id = ?`,
        [patientId]
      );
      if (!patientRows.length) {
        return res.status(404).json({
          success: false,
          message: "Patient record not found.",
        });
      }

      // 2b. If appointment_id is supplied, validate appointment exists, matches patient and hospital, and is not cancelled
      let appointmentDoctorId = null;
      if (appointment_id) {
        const aptId = Number(appointment_id);
        const [aptRows] = await pool.query(
          `SELECT id, patient_id, hospital_id, doctor_id, status FROM appointments WHERE id = ?`,
          [aptId]
        );
        if (!aptRows.length) {
          return res.status(404).json({
            success: false,
            message: "Linked appointment record not found.",
          });
        }
        const apt = aptRows[0];
        if (Number(apt.patient_id) !== patientId) {
          return res.status(400).json({
            success: false,
            message: "Patient ID does not match the linked appointment patient.",
          });
        }
        if (Number(apt.hospital_id) !== targetHospitalId) {
          return res.status(400).json({
            success: false,
            message: "Hospital ID does not match the linked appointment hospital facility.",
          });
        }
        if (["cancelled", "rejected"].includes(apt.status)) {
          return res.status(400).json({
            success: false,
            message: `Cannot link laboratory orders to an appointment in '${apt.status}' status.`,
          });
        }
        appointmentDoctorId = apt.doctor_id;
      }

      // 3. Verify Master Test & Hospital Offering Status
      const masterTestId = Number(master_test_id);
      if (!masterTestId || isNaN(masterTestId)) {
        return res.status(400).json({
          success: false,
          message: "Valid master_test_id is required.",
        });
      }

      const [offeringRows] = await pool.query(
        `SELECT
           hlt.id,
           hlt.price,
           hlt.status AS hospital_test_status,
           mlt.test_code,
           mlt.test_name,
           mlt.category,
           mlt.status AS master_status
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         WHERE hlt.hospital_id = ? AND hlt.master_test_id = ?`,
        [targetHospitalId, masterTestId]
      );

      if (!offeringRows.length) {
        return res.status(400).json({
          success: false,
          message: "The requested laboratory test is not offered by this hospital.",
        });
      }

      const offering = offeringRows[0];
      if (offering.hospital_test_status !== "active" || offering.master_status !== "active") {
        return res.status(400).json({
          success: false,
          message: `The test '${offering.test_name}' is currently unavailable/inactive at this hospital.`,
        });
      }

      // 4. PRICE SNAPSHOT: Strictly determined by the database offering at time of order creation!
      const priceSnapshot = parseFloat(offering.price) || 0.0;

      // 5. Generate unique order number
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `LAB-${datePart}-${randomPart}`;

      // Doctor ID: If caller is doctor, use their user ID; otherwise if doctor specified or null
      let doctorId = req.user.role === "doctor" ? req.user.id : req.body.doctor_id || null;
      if (!doctorId) {
        // Fallback to first active doctor at hospital or assigned doctor
        const [docFallback] = await pool.query(
          `SELECT u.id FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE r.name = 'doctor' AND (u.hospital_id = ? OR ? IS NULL) AND u.status = 'active'
           LIMIT 1`,
          [targetHospitalId, targetHospitalId]
        );
        doctorId = docFallback.length > 0 ? docFallback[0].id : req.user.id;
      }

      const validPriority = ["routine", "urgent", "stat"].includes(priority)
        ? priority
        : "routine";

      // 6. Insert Order Record
      const [insertRes] = await pool.query(
        `INSERT INTO investigation_requests
           (order_number, consultation_id, appointment_id, patient_id, doctor_id, hospital_id,
            master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'requested')`,
        [
          orderNumber,
          consultation_id || null,
          appointment_id || null,
          patientId,
          doctorId,
          targetHospitalId,
          masterTestId,
          offering.test_name,
          offering.category,
          validPriority,
          clinical_notes || null,
          priceSnapshot,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Laboratory order created successfully.",
        data: {
          id: insertRes.insertId,
          order_number: orderNumber,
          patient_id: patientId,
          hospital_id: targetHospitalId,
          master_test_id: masterTestId,
          test_name: offering.test_name,
          test_code: offering.test_code,
          price: priceSnapshot, // Snapshot price stored
          priority: validPriority,
          status: "requested",
          payment_status: "unpaid",
        },
      });
    } catch (error) {
      console.error("Error creating laboratory order:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create laboratory order.",
        error: error.message,
      });
    }
  }
);

/**
 * ============================================================================
 * Lesson 11.5: Linking Tests to Patient Appointments
 * ============================================================================
 */

/**
 * GET /api/labs/appointments/:appointmentId/tests
 * Retrieve all laboratory investigations ordered for a specific patient appointment.
 * Accessible to Patient (own appointment), Doctor, Staff, Hospital Admin, Super Admin.
 */
router.get(
  "/appointments/:appointmentId/tests",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const appointmentId = Number(req.params.appointmentId);
      if (!appointmentId || isNaN(appointmentId)) {
        return res.status(400).json({
          success: false,
          message: "Valid appointmentId is required.",
        });
      }

      // 1. Fetch appointment details
      const [aptRows] = await pool.query(
        `SELECT
           a.id,
           a.appointment_number,
           a.patient_id,
           pat.full_name AS patient_name,
           pat.email AS patient_email,
           a.doctor_id,
           doc.full_name AS doctor_name,
           a.hospital_id,
           h.name AS hospital_name,
           DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
           a.appointment_time,
           a.status AS appointment_status
         FROM appointments a
         JOIN users pat ON pat.id = a.patient_id
         LEFT JOIN users doc ON doc.id = a.doctor_id
         JOIN hospitals h ON h.id = a.hospital_id
         WHERE a.id = ?`,
        [appointmentId]
      );

      if (!aptRows.length) {
        return res.status(404).json({
          success: false,
          message: "Appointment record not found.",
        });
      }

      const appt = aptRows[0];

      // 2. Data Isolation & Ownership Validation
      if (req.user.role === "patient" && Number(appt.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view laboratory tests for your own appointments.",
        });
      }

      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(appt.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Cross-hospital appointment access forbidden.",
        });
      }

      // 3. Query all linked investigation requests
      const [tests] = await pool.query(
        `SELECT
           ir.id,
           ir.order_number,
           ir.consultation_id,
           ir.appointment_id,
           ir.patient_id,
           ir.doctor_id,
           ir.hospital_id,
           ir.master_test_id,
           ir.test_name,
           ir.test_category,
           ir.priority,
           ir.clinical_notes,
           ir.price,
           ir.payment_status,
           ir.status,
           ir.sample_collected_at,
           ir.completed_at,
           ir.created_at,
           mlt.test_code,
           mlt.sample_type,
           mlt.standard_turnaround_hours
         FROM investigation_requests ir
         LEFT JOIN master_lab_tests mlt ON mlt.id = ir.master_test_id
         WHERE ir.appointment_id = ?
         ORDER BY ir.id ASC`,
        [appointmentId]
      );

      const totalAmount = tests.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

      // Query reports for all tests in this appointment
      const testIds = tests.map((t) => t.id);
      let reportsByOrder = {};
      if (testIds.length > 0) {
        const [repRows] = await pool.query(
          `SELECT
             lr.id,
             lr.order_id,
             lr.report_number,
             lr.original_filename,
             lr.file_size,
             lr.mime_type,
             lr.version,
             lr.status,
             lr.created_at
           FROM lab_reports lr
           WHERE lr.order_id IN (?)
           ORDER BY lr.version DESC`,
          [testIds]
        );
        for (const r of repRows) {
          if (!reportsByOrder[r.order_id]) reportsByOrder[r.order_id] = [];
          reportsByOrder[r.order_id].push(r);
        }
      }

      const enrichedTests = tests.map((t) => {
        const isLocked =
          req.user.role === "patient" && !["paid", "waived"].includes(t.payment_status);
        const orderReports = (reportsByOrder[t.id] || []).map((rpt) => ({
          ...rpt,
          is_locked: isLocked,
        }));
        return {
          ...t,
          price: parseFloat(t.price || 0),
          is_locked: isLocked,
          reports: orderReports,
        };
      });

      return res.json({
        success: true,
        appointment: appt,
        tests: enrichedTests,
        total_tests: enrichedTests.length,
        total_amount: Number(totalAmount.toFixed(2)),
      });
    } catch (error) {
      console.error("Error fetching appointment laboratory tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory tests for this appointment.",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/appointments/:appointmentId/tests
 * Order laboratory test(s) linked directly to a specific appointment.
 * Automatically validates patient and hospital consistency, snapshots pricing,
 * and generates unique order number(s).
 */
router.post(
  "/appointments/:appointmentId/tests",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const appointmentId = Number(req.params.appointmentId);
      if (!appointmentId || isNaN(appointmentId)) {
        return res.status(400).json({
          success: false,
          message: "Valid appointmentId is required.",
        });
      }

      // 1. Fetch appointment details
      const [aptRows] = await pool.query(
        `SELECT id, appointment_number, patient_id, doctor_id, hospital_id, status
         FROM appointments
         WHERE id = ?`,
        [appointmentId]
      );

      if (!aptRows.length) {
        return res.status(404).json({
          success: false,
          message: "Appointment record not found.",
        });
      }

      const appt = aptRows[0];

      // 2. Validate Hospital Isolation
      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(appt.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot order laboratory tests for another hospital's appointment.",
        });
      }

      // 3. Appointment status validation
      if (["cancelled", "rejected"].includes(appt.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot link laboratory orders to an appointment in '${appt.status}' status.`,
        });
      }

      // 4. Collect tests from body
      const {
        master_test_id,
        master_test_ids,
        tests: rawTests,
        priority = "routine",
        clinical_notes = null,
        doctor_id = null,
      } = req.body;

      const itemsToOrder = [];
      if (Array.isArray(rawTests) && rawTests.length > 0) {
        for (const item of rawTests) {
          itemsToOrder.push({
            master_test_id: Number(item.master_test_id || item.id),
            priority: item.priority || priority,
            clinical_notes: item.clinical_notes || clinical_notes,
          });
        }
      } else if (Array.isArray(master_test_ids) && master_test_ids.length > 0) {
        for (const mId of master_test_ids) {
          itemsToOrder.push({
            master_test_id: Number(mId),
            priority,
            clinical_notes,
          });
        }
      } else if (master_test_id) {
        itemsToOrder.push({
          master_test_id: Number(master_test_id),
          priority,
          clinical_notes,
        });
      }

      if (itemsToOrder.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one laboratory test (master_test_id) is required.",
        });
      }

      const assignedDoctorId = doctor_id
        ? Number(doctor_id)
        : req.user.role === "doctor"
        ? req.user.id
        : appt.doctor_id;

      const createdOrders = [];

      for (const item of itemsToOrder) {
        // Verify offering at appointment's hospital
        const [offeringRows] = await pool.query(
          `SELECT hlt.price, hlt.status AS hosp_status, mlt.id AS m_id, mlt.test_code, mlt.test_name, mlt.category
           FROM hospital_lab_tests hlt
           JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
           WHERE hlt.hospital_id = ? AND hlt.master_test_id = ?`,
          [appt.hospital_id, item.master_test_id]
        );

        if (!offeringRows.length) {
          return res.status(400).json({
            success: false,
            message: `Laboratory test ID #${item.master_test_id} is not offered by this hospital.`,
          });
        }

        const off = offeringRows[0];
        if (off.hosp_status !== "active") {
          return res.status(400).json({
            success: false,
            message: `Laboratory test '${off.test_name}' is currently inactive for this hospital facility.`,
          });
        }

        // Price snapshotting
        const priceSnapshot = parseFloat(off.price) || 0.0;

        // Order Number
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `LAB-${datePart}-${randomPart}`;

        const validPriority = ["routine", "urgent", "stat"].includes(item.priority)
          ? item.priority
          : "routine";

        const [insertRes] = await pool.query(
          `INSERT INTO investigation_requests
             (order_number, appointment_id, patient_id, doctor_id, hospital_id,
              master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'requested')`,
          [
            orderNumber,
            appt.id,
            appt.patient_id,
            assignedDoctorId,
            appt.hospital_id,
            off.m_id,
            off.test_name,
            off.category,
            validPriority,
            item.clinical_notes || null,
            priceSnapshot,
          ]
        );

        createdOrders.push({
          id: insertRes.insertId,
          order_number: orderNumber,
          appointment_id: appt.id,
          patient_id: appt.patient_id,
          hospital_id: appt.hospital_id,
          master_test_id: off.m_id,
          test_name: off.test_name,
          test_code: off.test_code,
          price: priceSnapshot,
          priority: validPriority,
          status: "requested",
          payment_status: "unpaid",
        });
      }

      return res.status(201).json({
        success: true,
        message: `Successfully linked ${createdOrders.length} test order(s) to Appointment #${appt.appointment_number}.`,
        data: createdOrders,
      });
    } catch (error) {
      console.error("Error creating appointment laboratory tests:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to order laboratory tests for this appointment.",
        error: error.message,
      });
    }
  }
);

/**
 * PATCH /api/labs/orders/:id/link-appointment
 * Link or re-link an existing laboratory order to an appointment.
 * Strictly verifies patient_id and hospital_id consistency.
 */
router.patch(
  "/orders/:id/link-appointment",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { appointment_id } = req.body;

      if (!appointment_id) {
        return res.status(400).json({
          success: false,
          message: "appointment_id is required.",
        });
      }

      const targetAptId = Number(appointment_id);

      // 1. Fetch order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, hospital_id, appointment_id, status
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];

      // 2. Fetch appointment
      const [aptRows] = await pool.query(
        `SELECT id, appointment_number, patient_id, hospital_id, status
         FROM appointments
         WHERE id = ?`,
        [targetAptId]
      );

      if (!aptRows.length) {
        return res.status(404).json({
          success: false,
          message: "Target appointment record not found.",
        });
      }

      const apt = aptRows[0];

      // 3. Hospital isolation check
      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(apt.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot link orders across hospital facilities.",
        });
      }

      // 4. Verify patient consistency
      if (Number(apt.patient_id) !== Number(order.patient_id)) {
        return res.status(400).json({
          success: false,
          message: "Patient ID mismatch: Cannot link order to an appointment belonging to another patient.",
        });
      }

      // 5. Verify hospital consistency
      if (Number(apt.hospital_id) !== Number(order.hospital_id)) {
        return res.status(400).json({
          success: false,
          message: "Hospital facility mismatch: Order and appointment must belong to the same hospital facility.",
        });
      }

      // 6. Check appointment status
      if (["cancelled", "rejected"].includes(apt.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot link order to an appointment in '${apt.status}' status.`,
        });
      }

      // 7. Update appointment link
      await pool.query(
        `UPDATE investigation_requests SET appointment_id = ? WHERE id = ?`,
        [targetAptId, orderId]
      );

      return res.json({
        success: true,
        message: `Laboratory order '${order.order_number}' successfully linked to Appointment #${apt.appointment_number}.`,
        data: {
          id: orderId,
          order_number: order.order_number,
          appointment_id: targetAptId,
        },
      });
    } catch (error) {
      console.error("Error linking order to appointment:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to link laboratory order to appointment.",
        error: error.message,
      });
    }
  }
);

/**
 * ============================================================================
 * Lesson 11.6: Pending Laboratory Test Management
 * ============================================================================
 */

/**
 * Helper to build status transition rules and guards
 */
const VALID_LAB_TRANSITIONS = {
  requested: ["sample_collected", "cancelled"],
  sample_collected: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Helper to fetch complete order with joined entities
 */
async function fetchFullOrderById(orderId) {
  const [rows] = await pool.query(
    `SELECT
       ir.id,
       ir.order_number,
       ir.consultation_id,
       ir.appointment_id,
       ir.patient_id,
       ir.doctor_id,
       ir.hospital_id,
       ir.master_test_id,
       ir.test_name,
       ir.test_category,
       ir.priority,
       ir.clinical_notes,
       ir.price,
       ir.payment_status,
       ir.status,
       ir.sample_collected_at,
       ir.completed_at,
       ir.cancelled_at,
       ir.cancellation_reason,
       ir.created_at,
       ir.updated_at,
       u_pat.full_name AS patient_name,
       u_pat.email AS patient_email,
       u_pat.phone AS patient_phone,
       u_doc.full_name AS doctor_name,
       u_doc.email AS doctor_email,
       h.name AS hospital_name,
       apt.appointment_number,
       apt.appointment_date,
       mlt.test_code,
       mlt.sample_type,
       mlt.standard_turnaround_hours
     FROM investigation_requests ir
     JOIN users u_pat ON u_pat.id = ir.patient_id
     JOIN users u_doc ON u_doc.id = ir.doctor_id
     JOIN hospitals h ON h.id = ir.hospital_id
     LEFT JOIN appointments apt ON apt.id = ir.appointment_id
     LEFT JOIN master_lab_tests mlt ON mlt.id = ir.master_test_id
     WHERE ir.id = ?`,
    [orderId]
  );

  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: row.id,
    order_number: row.order_number,
    consultation_id: row.consultation_id,
    appointment_id: row.appointment_id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    hospital_id: row.hospital_id,
    master_test_id: row.master_test_id,
    test_name: row.test_name,
    test_category: row.test_category,
    priority: row.priority,
    clinical_notes: row.clinical_notes,
    price: parseFloat(row.price || 0),
    payment_status: row.payment_status,
    status: row.status,
    sample_collected_at: row.sample_collected_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    cancellation_reason: row.cancellation_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    patient: {
      id: row.patient_id,
      full_name: row.patient_name || "",
      email: row.patient_email,
      phone: row.patient_phone,
    },
    doctor: {
      id: row.doctor_id,
      full_name: row.doctor_name || "",
      email: row.doctor_email,
    },
    hospital: {
      id: row.hospital_id,
      name: row.hospital_name,
    },
    appointment: row.appointment_id
      ? {
          id: row.appointment_id,
          appointment_number: row.appointment_number,
          appointment_date: row.appointment_date,
        }
      : null,
    master_test: row.master_test_id
      ? {
          id: row.master_test_id,
          test_code: row.test_code,
          test_name: row.test_name,
          sample_type: row.sample_type,
          standard_turnaround_hours: row.standard_turnaround_hours,
        }
      : null,
  };
}

/**
 * GET /api/labs/orders
 * GET /api/labs/pending
 * Pending Laboratory Test Queue with multi-criteria filtering, hospital isolation,
 * priority grouping, search, and summary operational counters.
 */
async function handleGetLabOrdersQueue(req, res) {
  try {
    const {
      status = "pending", // "pending" | "all" | "requested" | "sample_collected" | "in_progress" | "completed" | "cancelled"
      priority = "all",
      category = "all",
      payment_status = "all",
      search = "",
      q = "",
      date_from = "",
      date_to = "",
      patient_id = "",
      appointment_id = "",
      page = 1,
      limit = 25,
      sort_by = "priority_first", // "priority_first" | "newest" | "oldest"
    } = req.query;

    const searchTerm = (search || q).trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = [];
    const queryParams = [];

    // 1. Role-based isolation
    if (req.user.role === "patient") {
      whereConditions.push("ir.patient_id = ?");
      queryParams.push(req.user.id);
    } else if (["hospital_admin", "doctor", "staff"].includes(req.user.role)) {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Missing hospital facility association.",
        });
      }
      whereConditions.push("ir.hospital_id = ?");
      queryParams.push(req.user.hospitalId);
    } else if (req.user.role === "super_admin" && req.query.hospital_id) {
      whereConditions.push("ir.hospital_id = ?");
      queryParams.push(Number(req.query.hospital_id));
    }

    // 2. Status filter
    if (!status || status === "pending") {
      whereConditions.push("ir.status IN ('requested', 'sample_collected', 'in_progress')");
    } else if (status !== "all") {
      whereConditions.push("ir.status = ?");
      queryParams.push(status);
    }

    // 3. Priority filter
    if (priority && priority !== "all") {
      whereConditions.push("ir.priority = ?");
      queryParams.push(priority);
    }

    // 4. Category filter
    if (category && category !== "all") {
      whereConditions.push("(ir.test_category = ? OR mlt.category = ?)");
      queryParams.push(category, category);
    }

    // 5. Payment status filter
    if (payment_status && payment_status !== "all") {
      whereConditions.push("ir.payment_status = ?");
      queryParams.push(payment_status);
    }

    // 6. Patient / Appointment filters
    if (patient_id) {
      whereConditions.push("ir.patient_id = ?");
      queryParams.push(Number(patient_id));
    }
    if (appointment_id) {
      whereConditions.push("ir.appointment_id = ?");
      queryParams.push(Number(appointment_id));
    }

    // 7. Date range filters
    if (date_from) {
      whereConditions.push("ir.created_at >= ?");
      queryParams.push(date_from.length <= 10 ? `${date_from} 00:00:00` : date_from);
    }
    if (date_to) {
      whereConditions.push("ir.created_at <= ?");
      queryParams.push(date_to.length <= 10 ? `${date_to} 23:59:59` : date_to);
    }

    // 8. Search query across order number, test name, test code, patient name, doctor name
    if (searchTerm) {
      whereConditions.push(
        `(ir.order_number LIKE ? OR
          ir.test_name LIKE ? OR
          mlt.test_code LIKE ? OR
          u_pat.full_name LIKE ? OR
          u_pat.email LIKE ? OR
          u_doc.full_name LIKE ?)`
      );
      const wild = `%${searchTerm}%`;
      queryParams.push(wild, wild, wild, wild, wild, wild);
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Calculate total matching records for pagination
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM investigation_requests ir
       JOIN users u_pat ON u_pat.id = ir.patient_id
       JOIN users u_doc ON u_doc.id = ir.doctor_id
       JOIN hospitals h ON h.id = ir.hospital_id
       LEFT JOIN appointments apt ON apt.id = ir.appointment_id
       LEFT JOIN master_lab_tests mlt ON mlt.id = ir.master_test_id
       ${whereClause}`,
      queryParams
    );
    const total = countRows[0].total;

    // Sorting order
    let orderByClause = "ORDER BY ir.created_at DESC";
    if (sort_by === "priority_first") {
      orderByClause = `ORDER BY
        CASE ir.priority
          WHEN 'stat' THEN 1
          WHEN 'urgent' THEN 2
          ELSE 3
        END ASC,
        ir.created_at DESC`;
    } else if (sort_by === "oldest") {
      orderByClause = "ORDER BY ir.created_at ASC";
    }

    // Fetch data page
    const [rows] = await pool.query(
      `SELECT
         ir.id,
         ir.order_number,
         ir.consultation_id,
         ir.appointment_id,
         ir.patient_id,
         ir.doctor_id,
         ir.hospital_id,
         ir.master_test_id,
         ir.test_name,
         ir.test_category,
         ir.priority,
         ir.clinical_notes,
         ir.price,
         ir.payment_status,
         ir.status,
         ir.sample_collected_at,
         ir.completed_at,
         ir.cancelled_at,
         ir.cancellation_reason,
         ir.created_at,
         ir.updated_at,
         u_pat.full_name AS patient_name,
         u_pat.email AS patient_email,
         u_pat.phone AS patient_phone,
         u_doc.full_name AS doctor_name,
         u_doc.email AS doctor_email,
         h.name AS hospital_name,
         apt.appointment_number,
         apt.appointment_date,
         mlt.test_code,
         mlt.sample_type,
         mlt.standard_turnaround_hours
       FROM investigation_requests ir
       JOIN users u_pat ON u_pat.id = ir.patient_id
       JOIN users u_doc ON u_doc.id = ir.doctor_id
       JOIN hospitals h ON h.id = ir.hospital_id
       LEFT JOIN appointments apt ON apt.id = ir.appointment_id
       LEFT JOIN master_lab_tests mlt ON mlt.id = ir.master_test_id
       ${whereClause}
       ${orderByClause}
       LIMIT ? OFFSET ?`,
      [...queryParams, limitNum, offset]
    );

    // Format output items
    const data = rows.map((row) => ({
      id: row.id,
      order_number: row.order_number,
      consultation_id: row.consultation_id,
      appointment_id: row.appointment_id,
      patient_id: row.patient_id,
      doctor_id: row.doctor_id,
      hospital_id: row.hospital_id,
      master_test_id: row.master_test_id,
      test_name: row.test_name,
      test_category: row.test_category,
      priority: row.priority,
      clinical_notes: row.clinical_notes,
      price: parseFloat(row.price || 0),
      payment_status: row.payment_status,
      status: row.status,
      sample_collected_at: row.sample_collected_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      cancellation_reason: row.cancellation_reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
      patient: {
        id: row.patient_id,
        full_name: row.patient_name || "",
        email: row.patient_email,
        phone: row.patient_phone,
      },
      doctor: {
        id: row.doctor_id,
        full_name: row.doctor_name || "",
        email: row.doctor_email,
      },
      hospital: {
        id: row.hospital_id,
        name: row.hospital_name,
      },
      appointment: row.appointment_id
        ? {
            id: row.appointment_id,
            appointment_number: row.appointment_number,
            appointment_date: row.appointment_date,
          }
        : null,
      master_test: row.master_test_id
        ? {
            id: row.master_test_id,
            test_code: row.test_code,
            test_name: row.test_name,
            sample_type: row.sample_type,
            standard_turnaround_hours: row.standard_turnaround_hours,
          }
        : null,
    }));

    // Calculate scope summary metrics
    const scopeConditions = [];
    const scopeParams = [];
    if (req.user.role === "patient") {
      scopeConditions.push("patient_id = ?");
      scopeParams.push(req.user.id);
    } else if (["hospital_admin", "doctor", "staff"].includes(req.user.role)) {
      scopeConditions.push("hospital_id = ?");
      scopeParams.push(req.user.hospitalId);
    } else if (req.user.role === "super_admin" && req.query.hospital_id) {
      scopeConditions.push("hospital_id = ?");
      scopeParams.push(Number(req.query.hospital_id));
    }
    const scopeWhere = scopeConditions.length ? `WHERE ${scopeConditions.join(" AND ")}` : "";

    const [metricRows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('requested', 'sample_collected', 'in_progress') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) AS requested,
         SUM(CASE WHEN status = 'sample_collected' THEN 1 ELSE 0 END) AS sample_collected,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN priority IN ('urgent', 'stat') AND status IN ('requested', 'sample_collected', 'in_progress') THEN 1 ELSE 0 END) AS urgent_stat_count
       FROM investigation_requests
       ${scopeWhere}`,
      scopeParams
    );

    const counts = {
      total: Number(metricRows[0]?.total || 0),
      pending: Number(metricRows[0]?.pending || 0),
      requested: Number(metricRows[0]?.requested || 0),
      sample_collected: Number(metricRows[0]?.sample_collected || 0),
      in_progress: Number(metricRows[0]?.in_progress || 0),
      completed: Number(metricRows[0]?.completed || 0),
      cancelled: Number(metricRows[0]?.cancelled || 0),
      urgent_stat_count: Number(metricRows[0]?.urgent_stat_count || 0),
    };

    return res.json({
      success: true,
      data,
      counts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        total_pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("Error retrieving laboratory orders queue:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve laboratory orders queue.",
      error: error.message,
    });
  }
}

router.get("/orders", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), handleGetLabOrdersQueue);
router.get("/pending", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), handleGetLabOrdersQueue);

/**
 * GET /api/labs/orders/:id
 * Retrieve single laboratory investigation order details.
 */
router.get(
  "/orders/:id",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await fetchFullOrderById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      // Hospital & Role isolation check
      if (req.user.role === "patient" && Number(order.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view your own laboratory orders.",
        });
      }

      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: This laboratory order belongs to another hospital facility.",
        });
      }

      // Fetch attached reports if any
      const [reports] = await pool.query(
        `SELECT
           lr.id,
           lr.report_number,
           lr.original_filename,
           lr.file_size,
           lr.mime_type,
           lr.file_hash,
           lr.version,
           lr.status,
           lr.notes,
           lr.created_at,
           u.full_name AS uploader_name
         FROM lab_reports lr
         JOIN users u ON u.id = lr.uploaded_by
         WHERE lr.order_id = ?
         ORDER BY lr.version DESC, lr.created_at DESC`,
        [orderId]
      );

      // Fetch attached payments if any
      const [payments] = await pool.query(
        `SELECT
           lp.id,
           lp.receipt_number,
           lp.amount,
           lp.payment_method,
           lp.payment_status,
           lp.transaction_reference,
           lp.notes,
           lp.created_at,
           u.full_name AS collected_by_name
         FROM lab_payments lp
         JOIN users u ON u.id = lp.collected_by
         WHERE lp.order_id = ?
         ORDER BY lp.created_at DESC`,
        [orderId]
      );

      return res.json({
        success: true,
        data: {
          ...order,
          reports,
          payments,
        },
      });
    } catch (error) {
      console.error("Error retrieving laboratory order details:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory order details.",
        error: error.message,
      });
    }
  }
);

/**
 * PATCH /api/labs/orders/:id/status
 * Update laboratory order workflow status with strict lifecycle transition rules,
 * immutability guards, mandatory cancellation reasons, and audit logging.
 */
router.patch(
  "/orders/:id/status",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status: targetStatus, cancellation_reason, notes } = req.body;

      if (!targetStatus) {
        return res.status(400).json({
          success: false,
          message: "status field is required.",
        });
      }

      const validStatuses = ["requested", "sample_collected", "in_progress", "completed", "cancelled"];
      if (!validStatuses.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status '${targetStatus}'. Allowed statuses are: ${validStatuses.join(", ")}.`,
        });
      }

      // 1. Fetch current order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, doctor_id, hospital_id, status, clinical_notes,
                sample_collected_at, completed_at, cancelled_at, cancellation_reason
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const currentOrder = orderRows[0];
      const currentStatus = currentOrder.status;

      // 2. Hospital isolation guard
      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(currentOrder.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot modify orders belonging to another hospital facility.",
        });
      }

      // 3. Terminal state immutability guard
      if (currentStatus === "completed") {
        return res.status(400).json({
          success: false,
          message: "Terminal state immutable: completed laboratory order cannot be modified.",
        });
      }

      if (currentStatus === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Terminal state immutable: cancelled laboratory order cannot be modified.",
        });
      }

      // 4. Same state idempotency
      if (currentStatus === targetStatus) {
        const fullOrder = await fetchFullOrderById(orderId);
        return res.json({
          success: true,
          message: `Laboratory order '${currentOrder.order_number}' is already in status '${targetStatus}'.`,
          data: fullOrder,
        });
      }

      // 5. Lifecycle transition graph validation
      const allowedNextStates = VALID_LAB_TRANSITIONS[currentStatus] || [];
      if (!allowedNextStates.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid state transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions are: ${allowedNextStates.join(", ")}.`,
        });
      }

      // 6. Cancellation reason validation
      if (targetStatus === "cancelled") {
        if (!cancellation_reason || !cancellation_reason.trim()) {
          return res.status(400).json({
            success: false,
            message: "cancellation_reason is required when cancelling a laboratory order.",
          });
        }
      }

      // 7. Execute transition with timestamp updates
      const updateFields = ["status = ?"];
      const updateParams = [targetStatus];

      if (targetStatus === "sample_collected") {
        updateFields.push("sample_collected_at = COALESCE(sample_collected_at, CURRENT_TIMESTAMP)");
      } else if (targetStatus === "completed") {
        updateFields.push("completed_at = CURRENT_TIMESTAMP");
      } else if (targetStatus === "cancelled") {
        updateFields.push("cancelled_at = CURRENT_TIMESTAMP");
        updateFields.push("cancellation_reason = ?");
        updateParams.push(cancellation_reason.trim());
      }

      if (notes && notes.trim()) {
        const appendedNotes = currentOrder.clinical_notes
          ? `${currentOrder.clinical_notes}\n[${targetStatus.toUpperCase()} NOTE]: ${notes.trim()}`
          : `[${targetStatus.toUpperCase()} NOTE]: ${notes.trim()}`;
        updateFields.push("clinical_notes = ?");
        updateParams.push(appendedNotes);
      }

      updateParams.push(orderId);

      await pool.query(
        `UPDATE investigation_requests
         SET ${updateFields.join(", ")}
         WHERE id = ?`,
        updateParams
      );

      // 8. Audit logging
      await logAudit(
        req.user.id,
        "UPDATE_LAB_ORDER_STATUS",
        "investigation_requests",
        orderId,
        {
          order_number: currentOrder.order_number,
          old_status: currentStatus,
          new_status: targetStatus,
          cancellation_reason: targetStatus === "cancelled" ? cancellation_reason.trim() : null,
        }
      );

      // 9. Fetch and return updated order
      const updatedOrder = await fetchFullOrderById(orderId);

      return res.json({
        success: true,
        message: `Laboratory order '${currentOrder.order_number}' transitioned from '${currentStatus}' to '${targetStatus}'.`,
        data: updatedOrder,
      });
    } catch (error) {
      console.error("Error updating laboratory order status:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update laboratory order status.",
        error: error.message,
      });
    }
  }
);

/**
 * Convenient action shortcuts
 */
router.post(
  "/orders/:id/collect-sample",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res, next) => {
    req.body = { ...req.body, status: "sample_collected" };
    // Invoke PATCH status handler logic directly
    const [orderRows] = await pool.query("SELECT id FROM investigation_requests WHERE id = ?", [req.params.id]);
    if (!orderRows.length) {
      return res.status(404).json({ success: false, message: "Laboratory order record not found." });
    }
    // Re-route by calling status PATCH handler
    req.url = `/orders/${req.params.id}/status`;
    req.method = "PATCH";
    return router.handle(req, res, next);
  }
);

router.post(
  "/orders/:id/start-analysis",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res, next) => {
    req.body = { ...req.body, status: "in_progress" };
    req.url = `/orders/${req.params.id}/status`;
    req.method = "PATCH";
    return router.handle(req, res, next);
  }
);

router.post(
  "/orders/:id/cancel",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res, next) => {
    req.body = { ...req.body, status: "cancelled" };
    req.url = `/orders/${req.params.id}/status`;
    req.method = "PATCH";
    return router.handle(req, res, next);
  }
);

/**
 * ============================================================================
 * Lesson 11.7 & 11.8: Uploading, Linking, and Validating Laboratory Reports
 * (File Validation and Duplicate Prevention via SHA-256)
 * ============================================================================
 */

/**
 * Validate magic bytes / file signatures to prevent disguised files
 */
function validateLabReportSignature(buffer, mimetype, originalname) {
  if (!buffer || buffer.length < 4) return false;
  const ext = path.extname(originalname || "").toLowerCase();

  // PDF (%PDF) -> 0x25 0x50 0x44 0x46
  if (mimetype === "application/pdf" || ext === ".pdf") {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  // PNG -> 0x89 0x50 0x4E 0x47
  if (mimetype === "image/png" || ext === ".png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    );
  }

  // JPEG -> 0xFF 0xD8 0xFF
  if (
    ["image/jpeg", "image/jpg"].includes(mimetype) ||
    [".jpg", ".jpeg"].includes(ext)
  ) {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // WebP -> RIFF....WEBP
  if (mimetype === "image/webp" || ext === ".webp") {
    return (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.length >= 12 &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

/**
 * POST /api/labs/orders/:id/reports
 * Upload and securely link a laboratory test report to an investigation order.
 * Enforces file size limits, non-empty validation, MIME and magic-byte checks,
 * duplicate detection via SHA-256 checksums, and versioning.
 */
router.post(
  "/orders/:id/reports",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  (req, res, next) => {
    uploadLabReport.fields([
      { name: "report", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File size exceeds the allowed limit of 15MB.",
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || "Failed to upload report file.",
        });
      }
      // Normalize single file reference
      req.file = req.file || req.files?.report?.[0] || req.files?.file?.[0];
      next();
    });
  },
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);

      // 1. Validate file presence
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Report file is required (supported formats: PDF, JPEG, PNG, WebP).",
        });
      }

      // 2. Validate non-empty file (0 bytes)
      if (req.file.size === 0) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid file: Uploaded report document is empty (0 bytes).",
        });
      }

      // 3. Fetch order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, doctor_id, hospital_id, status, sample_collected_at, completed_at
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];

      // 4. Hospital isolation guard
      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot upload reports for orders of another hospital facility.",
        });
      }

      // 5. Reject upload for cancelled orders
      if (order.status === "cancelled") {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Cannot upload laboratory reports for a cancelled order.",
        });
      }

      // 6. Inspect buffer and validate magic byte file signature
      const fileBuffer = fs.readFileSync(req.file.path);
      if (fileBuffer.length === 0) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid file: Uploaded report document is empty (0 bytes).",
        });
      }

      const isSignatureValid = validateLabReportSignature(
        fileBuffer,
        req.file.mimetype,
        req.file.originalname
      );

      if (!isSignatureValid) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message:
            "Corrupt or mismatched file format: File contents do not match declared MIME type.",
        });
      }

      // 7. Calculate SHA-256 hash
      const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      // 8. DUPLICATE PREVENTION: Check if identical report has already been uploaded for this order
      const [existingDuplicates] = await pool.query(
        `SELECT id, report_number, version, original_filename, created_at
         FROM lab_reports
         WHERE order_id = ? AND file_hash = ?`,
        [orderId, fileHash]
      );

      if (existingDuplicates.length > 0) {
        const dup = existingDuplicates[0];
        // Clean up uploaded duplicate file from storage immediately
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(409).json({
          success: false,
          message: `Duplicate report file detected: An identical report has already been uploaded for this laboratory order (Report #${dup.report_number}, Version ${dup.version}).`,
          data: {
            existing_report_id: dup.id,
            report_number: dup.report_number,
            version: dup.version,
            file_hash: fileHash,
            original_filename: dup.original_filename,
            uploaded_at: dup.created_at,
          },
        });
      }

      // 9. Calculate next version for this order
      const [verRows] = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM lab_reports
         WHERE order_id = ?`,
        [orderId]
      );
      const nextVersion = verRows[0].next_version || 1;

      // 10. Generate unique report number
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const reportNumber = `RPT-${dateStr}-${String(order.id).padStart(4, "0")}-V${nextVersion}`;

      const reportStatus = req.body.status && ["final", "preliminary", "amended"].includes(req.body.status)
        ? req.body.status
        : "final";
      const notes = req.body.notes ? req.body.notes.trim() : null;
      const storageKey = req.file.filename;

      // 8. Insert into lab_reports
      const [insertRes] = await pool.query(
        `INSERT INTO lab_reports
           (order_id, patient_id, hospital_id, report_number, storage_key, original_filename,
            file_size, mime_type, file_hash, version, uploaded_by, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          order.patient_id,
          order.hospital_id,
          reportNumber,
          storageKey,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          fileHash,
          nextVersion,
          req.user.id,
          reportStatus,
          notes,
        ]
      );

      const reportId = insertRes.insertId;

      // 9. Update order lifecycle status if report is final
      let updatedStatus = order.status;
      if (reportStatus === "final" && order.status !== "completed") {
        await pool.query(
          `UPDATE investigation_requests
           SET status = 'completed',
               sample_collected_at = COALESCE(sample_collected_at, CURRENT_TIMESTAMP),
               completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
           WHERE id = ?`,
          [orderId]
        );
        updatedStatus = "completed";
      }

      // 10. Audit log
      await logAudit(
        req.user.id,
        "UPLOAD_LAB_REPORT",
        "lab_reports",
        reportId,
        {
          order_id: orderId,
          order_number: order.order_number,
          report_number: reportNumber,
          version: nextVersion,
          file_hash: fileHash,
          file_size: req.file.size,
          original_filename: req.file.originalname,
          order_status: updatedStatus,
        }
      );

      // 11. Fetch inserted report
      const [newReportRows] = await pool.query(
        `SELECT
           lr.id,
           lr.order_id,
           lr.patient_id,
           lr.hospital_id,
           lr.report_number,
           lr.storage_key,
           lr.original_filename,
           lr.file_size,
           lr.mime_type,
           lr.file_hash,
           lr.version,
           lr.status,
           lr.notes,
           lr.created_at,
           u.full_name AS uploader_name
         FROM lab_reports lr
         JOIN users u ON u.id = lr.uploaded_by
         WHERE lr.id = ?`,
        [reportId]
      );

      return res.status(201).json({
        success: true,
        message: `Laboratory report '${reportNumber}' (v${nextVersion}) successfully uploaded and linked to Order #${order.order_number}.`,
        data: {
          report: newReportRows[0],
          order: {
            id: orderId,
            order_number: order.order_number,
            status: updatedStatus,
          },
        },
      });
    } catch (error) {
      console.error("Error uploading laboratory report:", error);
      // Clean up file on unexpected error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({
        success: false,
        message: "Failed to upload laboratory report.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/orders/:id/reports
 * Retrieve all reports (and report versions) attached to a specific laboratory order.
 * Patient and Doctor report access controls applied with payment enforcement metadata.
 */
router.get(
  "/orders/:id/reports",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);

      // Verify order exists
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, doctor_id, hospital_id, status, price, payment_status
         FROM investigation_requests WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];

      // Authorization guard
      if (req.user.role === "patient" && Number(order.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view reports for your own orders.",
        });
      }

      if (
        ["hospital_admin", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: This laboratory order belongs to another hospital facility.",
        });
      }

      if (
        req.user.role === "doctor" &&
        Number(order.hospital_id) !== Number(req.user.hospitalId) &&
        Number(order.doctor_id) !== Number(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Cross-hospital doctor report access is forbidden.",
        });
      }

      const [reports] = await pool.query(
        `SELECT
           lr.id,
           lr.order_id,
           lr.patient_id,
           lr.hospital_id,
           lr.report_number,
           lr.storage_key,
           lr.original_filename,
           lr.file_size,
           lr.mime_type,
           lr.file_hash,
           lr.version,
           lr.status,
           lr.notes,
           lr.created_at,
           u.full_name AS uploader_name,
           u.email AS uploader_email
         FROM lab_reports lr
         JOIN users u ON u.id = lr.uploaded_by
         WHERE lr.order_id = ?
         ORDER BY lr.version DESC, lr.created_at DESC`,
        [orderId]
      );

      // Lesson 11.10: Lock detection for patient users
      const isLockedForPatient =
        req.user.role === "patient" && !["paid", "waived"].includes(order.payment_status);

      const enrichedReports = reports.map((r) => ({
        ...r,
        is_locked: isLockedForPatient,
        lock_reason: isLockedForPatient
          ? `Payment required: Order charges of ₹${parseFloat(order.price || 0).toFixed(2)} must be settled or waived before downloading report.`
          : null,
      }));

      return res.json({
        success: true,
        data: enrichedReports,
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          price: parseFloat(order.price || 0),
          payment_status: order.payment_status,
          is_locked: isLockedForPatient,
        },
      });
    } catch (error) {
      console.error("Error retrieving laboratory reports for order:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory reports.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/reports/:id
 * Retrieve single laboratory report metadata.
 */
router.get(
  "/reports/:id",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const reportId = Number(req.params.id);

      const [reports] = await pool.query(
        `SELECT
           lr.id,
           lr.order_id,
           lr.patient_id,
           lr.hospital_id,
           lr.report_number,
           lr.storage_key,
           lr.original_filename,
           lr.file_size,
           lr.mime_type,
           lr.file_hash,
           lr.version,
           lr.status,
           lr.notes,
           lr.created_at,
           ir.order_number,
           ir.test_name,
           ir.price AS order_price,
           ir.payment_status,
           ir.doctor_id,
           u.full_name AS uploader_name
         FROM lab_reports lr
         JOIN investigation_requests ir ON ir.id = lr.order_id
         JOIN users u ON u.id = lr.uploaded_by
         WHERE lr.id = ?`,
        [reportId]
      );

      if (!reports.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory report record not found.",
        });
      }

      const report = reports[0];

      // Authorization guard
      if (req.user.role === "patient" && Number(report.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view your own laboratory reports.",
        });
      }

      if (
        ["hospital_admin", "staff"].includes(req.user.role) &&
        Number(report.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: This report belongs to another hospital facility.",
        });
      }

      if (
        req.user.role === "doctor" &&
        Number(report.hospital_id) !== Number(req.user.hospitalId) &&
        Number(report.doctor_id) !== Number(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Cross-hospital doctor report access is forbidden.",
        });
      }

      const isLocked =
        req.user.role === "patient" && !["paid", "waived"].includes(report.payment_status);

      return res.json({
        success: true,
        data: {
          ...report,
          is_locked: isLocked,
          lock_reason: isLocked
            ? `Payment required: Settle fee of ₹${parseFloat(report.order_price || 0).toFixed(2)} to unlock report.`
            : null,
        },
      });
    } catch (error) {
      console.error("Error retrieving laboratory report metadata:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory report metadata.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/reports/:id/download
 * GET /api/labs/reports/:id/view
 * Securely stream or download laboratory report file with role authorization,
 * hospital isolation, payment enforcement for patients, and access audit logging.
 */
async function handleServeLabReportFile(req, res, isDownload = false) {
  try {
    const reportId = Number(req.params.id);

    const [reports] = await pool.query(
      `SELECT lr.id, lr.order_id, lr.patient_id, lr.hospital_id, lr.report_number, lr.storage_key, lr.original_filename, lr.mime_type,
              ir.payment_status, ir.price, ir.order_number, ir.doctor_id
       FROM lab_reports lr
       JOIN investigation_requests ir ON ir.id = lr.order_id
       WHERE lr.id = ?`,
      [reportId]
    );

    if (!reports.length) {
      return res.status(404).json({
        success: false,
        message: "Laboratory report record not found.",
      });
    }

    const report = reports[0];

    // Authorization guard
    if (req.user.role === "patient") {
      if (Number(report.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only access your own laboratory report files.",
        });
      }

      // Lesson 11.10: Payment enforcement for patients
      if (!["paid", "waived"].includes(report.payment_status)) {
        return res.status(402).json({
          success: false,
          message: `Payment required: Laboratory report access is locked until the order fee of ₹${parseFloat(report.price || 0).toFixed(2)} is settled or waived. Current payment status is '${report.payment_status}'.`,
          payment_status: report.payment_status,
          order_id: report.order_id,
          order_number: report.order_number,
          price: parseFloat(report.price || 0),
        });
      }
    }

    if (
      ["hospital_admin", "staff"].includes(req.user.role) &&
      Number(report.hospital_id) !== Number(req.user.hospitalId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied: This report belongs to another hospital facility.",
      });
    }

    if (
      req.user.role === "doctor" &&
      Number(report.hospital_id) !== Number(req.user.hospitalId) &&
      Number(report.doctor_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Cross-hospital doctor report access is forbidden.",
      });
    }

    const filePath = path.join(labReportUploadDir, report.storage_key);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Report file artifact not found on storage disk.",
      });
    }

    // Lesson 11.10: Audit Log for report access (view or download)
    try {
      await logAudit(
        req.user.id,
        isDownload ? "DOWNLOAD_LAB_REPORT" : "VIEW_LAB_REPORT",
        "lab_reports",
        report.id,
        {
          order_id: report.order_id,
          order_number: report.order_number,
          report_number: report.report_number,
          user_id: req.user.id,
          user_role: req.user.role,
          access_mode: isDownload ? "download" : "view",
        }
      );
    } catch (auditErr) {
      console.warn("Failed to write report access audit log:", auditErr.message);
    }

    res.setHeader("Content-Type", report.mime_type || "application/octet-stream");
    const disposition = isDownload ? "attachment" : "inline";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${encodeURIComponent(report.original_filename)}"`
    );

    return res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error("Error streaming laboratory report file:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to stream laboratory report file.",
      error: error.message,
    });
  }
}

router.get("/reports/:id/download", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), (req, res) => {
  return handleServeLabReportFile(req, res, true);
});

router.get("/reports/:id/view", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), (req, res) => {
  return handleServeLabReportFile(req, res, false);
});

router.get("/reports/:id/file", allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"), (req, res) => {
  return handleServeLabReportFile(req, res, false);
});

/**
 * GET /api/labs/my-reports
 * Retrieve all laboratory investigation orders and their reports for the authenticated patient.
 */
router.get(
  "/my-reports",
  allowRoles("patient"),
  async (req, res) => {
    try {
      const patientId = req.user.id;
      const { search = "", status = "" } = req.query;

      const whereConditions = ["ir.patient_id = ?"];
      const queryParams = [patientId];

      if (status && status !== "all") {
        whereConditions.push("ir.status = ?");
        queryParams.push(status);
      }

      if (search) {
        whereConditions.push("(ir.test_name LIKE ? OR ir.order_number LIKE ?)");
        queryParams.push(`%${search}%`, `%${search}%`);
      }

      const [orders] = await pool.query(
        `SELECT
           ir.id,
           ir.order_number,
           ir.consultation_id,
           ir.appointment_id,
           ir.test_name,
           ir.test_category,
           ir.priority,
           ir.clinical_notes,
           ir.price,
           ir.payment_status,
           ir.status,
           ir.sample_collected_at,
           ir.completed_at,
           ir.created_at,
           u_doc.full_name AS doctor_name,
           h.name AS hospital_name,
           apt.appointment_number,
           apt.appointment_date
         FROM investigation_requests ir
         JOIN users u_doc ON u_doc.id = ir.doctor_id
         JOIN hospitals h ON h.id = ir.hospital_id
         LEFT JOIN appointments apt ON apt.id = ir.appointment_id
         WHERE ${whereConditions.join(" AND ")}
         ORDER BY ir.created_at DESC`,
        queryParams
      );

      // Attach reports to orders
      const orderIds = orders.map((o) => o.id);
      let reportsByOrder = {};
      if (orderIds.length > 0) {
        const [reportRows] = await pool.query(
          `SELECT lr.id, lr.order_id, lr.report_number, lr.original_filename, lr.file_size, lr.mime_type, lr.version, lr.status, lr.created_at
           FROM lab_reports lr
           WHERE lr.order_id IN (?)
           ORDER BY lr.version DESC`,
          [orderIds]
        );
        for (const r of reportRows) {
          if (!reportsByOrder[r.order_id]) reportsByOrder[r.order_id] = [];
          reportsByOrder[r.order_id].push(r);
        }
      }

      const enrichedOrders = orders.map((o) => {
        const isLocked = !["paid", "waived"].includes(o.payment_status);
        const orderReports = (reportsByOrder[o.id] || []).map((rpt) => ({
          ...rpt,
          is_locked: isLocked,
        }));

        return {
          ...o,
          price: parseFloat(o.price || 0),
          is_locked: isLocked,
          lock_reason: isLocked
            ? `Payment required: Settle fee of ₹${parseFloat(o.price || 0).toFixed(2)} to unlock reports.`
            : null,
          reports: orderReports,
        };
      });

      return res.json({
        success: true,
        data: enrichedOrders,
        total: enrichedOrders.length,
      });
    } catch (error) {
      console.error("Error retrieving patient lab reports:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve your laboratory reports.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/doctor-reviews
 * Retrieve completed or in-progress laboratory investigations for the doctor's review.
 */
router.get(
  "/doctor-reviews",
  allowRoles("doctor"),
  async (req, res) => {
    try {
      const doctorId = req.user.id;
      const hospitalId = req.user.hospitalId;
      const { search = "", patient_id = "", status = "all" } = req.query;

      const whereConditions = ["(ir.doctor_id = ? OR ir.hospital_id = ?)"];
      const queryParams = [doctorId, hospitalId];

      if (patient_id) {
        whereConditions.push("ir.patient_id = ?");
        queryParams.push(Number(patient_id));
      }

      if (status && status !== "all") {
        whereConditions.push("ir.status = ?");
        queryParams.push(status);
      }

      if (search) {
        whereConditions.push("(ir.test_name LIKE ? OR ir.order_number LIKE ? OR u_pat.full_name LIKE ?)");
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const [orders] = await pool.query(
        `SELECT
           ir.id,
           ir.order_number,
           ir.consultation_id,
           ir.appointment_id,
           ir.patient_id,
           ir.doctor_id,
           ir.hospital_id,
           ir.test_name,
           ir.test_category,
           ir.priority,
           ir.clinical_notes,
           ir.price,
           ir.payment_status,
           ir.status,
           ir.sample_collected_at,
           ir.completed_at,
           ir.created_at,
           u_pat.full_name AS patient_name,
           u_pat.email AS patient_email,
           h.name AS hospital_name,
           apt.appointment_number
         FROM investigation_requests ir
         JOIN users u_pat ON u_pat.id = ir.patient_id
         JOIN hospitals h ON h.id = ir.hospital_id
         LEFT JOIN appointments apt ON apt.id = ir.appointment_id
         WHERE ${whereConditions.join(" AND ")}
         ORDER BY ir.created_at DESC`,
        queryParams
      );

      // Attach reports to orders
      const orderIds = orders.map((o) => o.id);
      let reportsByOrder = {};
      if (orderIds.length > 0) {
        const [reportRows] = await pool.query(
          `SELECT lr.id, lr.order_id, lr.report_number, lr.original_filename, lr.file_size, lr.mime_type, lr.version, lr.status, lr.created_at
           FROM lab_reports lr
           WHERE lr.order_id IN (?)
           ORDER BY lr.version DESC`,
          [orderIds]
        );
        for (const r of reportRows) {
          if (!reportsByOrder[r.order_id]) reportsByOrder[r.order_id] = [];
          reportsByOrder[r.order_id].push(r);
        }
      }

      const enrichedOrders = orders.map((o) => ({
        ...o,
        price: parseFloat(o.price || 0),
        reports: reportsByOrder[o.id] || [],
      }));

      return res.json({
        success: true,
        data: enrichedOrders,
        total: enrichedOrders.length,
      });
    } catch (error) {
      console.error("Error retrieving doctor lab reviews:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory investigations for review.",
        error: error.message,
      });
    }
  }
);


/**
 * ============================================================================
 * Lesson 11.9: Laboratory Payment Status Management
 * ============================================================================
 */

/**
 * POST /api/labs/orders/:id/payments
 * Record a payment receipt for a laboratory investigation order.
 * Updates order payment status ('paid' or 'unpaid'), generates unique receipt,
 * and records an audit log.
 */
router.post(
  "/orders/:id/payments",
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      let { amount, payment_method = "cash", transaction_reference, notes } = req.body;

      // 1. Fetch order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, hospital_id, price, payment_status, status
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];
      const orderPrice = parseFloat(order.price || 0);

      // 2. Hospital isolation guard
      if (
        ["hospital_admin", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot process payments for another hospital facility.",
        });
      }

      // 3. Status guards
      if (order.status === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Cannot process payment for a cancelled laboratory order.",
        });
      }

      if (order.payment_status === "waived") {
        return res.status(400).json({
          success: false,
          message: "Cannot collect payment on a waived laboratory order.",
        });
      }

      // Default amount to order price if omitted
      if (amount === undefined || amount === null || amount === "") {
        amount = orderPrice;
      }
      const payAmount = parseFloat(amount);

      if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount must be a positive numerical value greater than 0.",
        });
      }

      const validMethods = ["cash", "upi", "card"];
      const method = validMethods.includes(payment_method?.toLowerCase())
        ? payment_method.toLowerCase()
        : "cash";

      // 4. Query current total paid
      const [sumRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM lab_payments
         WHERE order_id = ? AND payment_status = 'paid'`,
        [orderId]
      );
      const existingPaid = parseFloat(sumRows[0].total_paid || 0);

      if (order.payment_status === "paid" && existingPaid >= orderPrice) {
        return res.status(400).json({
          success: false,
          message: `Order #${order.order_number} is already fully paid (Total Paid: ₹${existingPaid.toFixed(2)}).`,
        });
      }

      const newTotalPaid = existingPaid + payAmount;
      const willBeFullyPaid = newTotalPaid >= orderPrice;
      const targetPaymentStatus = willBeFullyPaid ? "paid" : "unpaid";

      // 5. Generate unique receipt number
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const receiptNumber = `RCP-${dateStr}-${String(orderId).padStart(4, "0")}-${randomPart}`;

      // 6. Insert lab_payments record
      const [payRes] = await pool.query(
        `INSERT INTO lab_payments
           (order_id, patient_id, hospital_id, receipt_number, amount,
            payment_method, transaction_reference, payment_status, collected_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`,
        [
          orderId,
          order.patient_id,
          order.hospital_id,
          receiptNumber,
          payAmount,
          method,
          transaction_reference ? transaction_reference.trim() : null,
          req.user.id,
          notes ? notes.trim() : null,
        ]
      );

      const paymentId = payRes.insertId;

      // 7. Update investigation_requests payment_status
      await pool.query(
        `UPDATE investigation_requests
         SET payment_status = ?
         WHERE id = ?`,
        [targetPaymentStatus, orderId]
      );

      // 8. Audit log
      await logAudit(
        req.user.id,
        "RECORD_LAB_PAYMENT",
        "lab_payments",
        paymentId,
        {
          order_id: orderId,
          order_number: order.order_number,
          receipt_number: receiptNumber,
          amount: payAmount,
          payment_method: method,
          transaction_reference: transaction_reference || null,
          previous_payment_status: order.payment_status,
          new_payment_status: targetPaymentStatus,
          total_paid: newTotalPaid,
          order_price: orderPrice,
        }
      );

      // 9. Fetch inserted payment details
      const [newPayRows] = await pool.query(
        `SELECT
           lp.id,
           lp.order_id,
           lp.patient_id,
           lp.hospital_id,
           lp.receipt_number,
           lp.amount,
           lp.payment_method,
           lp.transaction_reference,
           lp.payment_status,
           lp.notes,
           lp.created_at,
           u.full_name AS collected_by_name
         FROM lab_payments lp
         JOIN users u ON u.id = lp.collected_by
         WHERE lp.id = ?`,
        [paymentId]
      );

      return res.status(201).json({
        success: true,
        message: `Payment of ₹${payAmount.toFixed(2)} recorded successfully (Receipt #${receiptNumber}). Order payment status is now '${targetPaymentStatus}'.`,
        data: {
          payment: newPayRows[0],
          order: {
            id: orderId,
            order_number: order.order_number,
            price: orderPrice,
            total_paid: newTotalPaid,
            payment_status: targetPaymentStatus,
          },
        },
      });
    } catch (error) {
      console.error("Error recording laboratory payment:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to record laboratory payment.",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/orders/:id/waive
 * Waive laboratory order fees (for authorized administrators/supervisors).
 * Requires mandatory non-empty waiver reason.
 */
router.post(
  "/orders/:id/waive",
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { waiver_reason } = req.body;

      if (!waiver_reason || !waiver_reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "waiver_reason is mandatory when waiving laboratory test charges.",
        });
      }

      // 1. Fetch order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, hospital_id, price, payment_status, status, clinical_notes
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];

      // 2. Hospital isolation guard
      if (
        ["hospital_admin", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot waive orders belonging to another hospital facility.",
        });
      }

      // 3. Status guards
      if (order.status === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Cannot waive payment for a cancelled laboratory order.",
        });
      }

      if (order.payment_status === "paid") {
        return res.status(400).json({
          success: false,
          message: "Cannot waive payment for an order that is already marked as paid.",
        });
      }

      if (order.payment_status === "waived") {
        return res.status(400).json({
          success: false,
          message: "This laboratory order has already been waived.",
        });
      }

      // 4. Update order to waived
      const appendedNotes = order.clinical_notes
        ? `${order.clinical_notes}\n[FEE WAIVED]: ${waiver_reason.trim()}`
        : `[FEE WAIVED]: ${waiver_reason.trim()}`;

      await pool.query(
        `UPDATE investigation_requests
         SET payment_status = 'waived',
             clinical_notes = ?
         WHERE id = ?`,
        [appendedNotes, orderId]
      );

      // 5. Audit log
      await logAudit(
        req.user.id,
        "WAIVE_LAB_PAYMENT",
        "investigation_requests",
        orderId,
        {
          order_number: order.order_number,
          order_price: parseFloat(order.price || 0),
          waiver_reason: waiver_reason.trim(),
        }
      );

      return res.json({
        success: true,
        message: `Laboratory charges for Order #${order.order_number} were successfully waived.`,
        data: {
          id: orderId,
          order_number: order.order_number,
          payment_status: "waived",
          waiver_reason: waiver_reason.trim(),
        },
      });
    } catch (error) {
      console.error("Error waiving laboratory payment:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to waive laboratory payment.",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/labs/payments/:paymentId/refund
 * Refund a previously collected laboratory payment receipt.
 */
router.post(
  "/payments/:paymentId/refund",
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const paymentId = Number(req.params.paymentId);
      const { refund_reason } = req.body;

      if (!refund_reason || !refund_reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "refund_reason is mandatory when processing a payment refund.",
        });
      }

      // 1. Fetch payment
      const [payRows] = await pool.query(
        `SELECT lp.*, ir.order_number, ir.price AS order_price
         FROM lab_payments lp
         JOIN investigation_requests ir ON ir.id = lp.order_id
         WHERE lp.id = ?`,
        [paymentId]
      );

      if (!payRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory payment receipt record not found.",
        });
      }

      const payment = payRows[0];

      // 2. Hospital isolation guard
      if (
        req.user.role === "hospital_admin" &&
        Number(payment.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You cannot refund payments belonging to another hospital facility.",
        });
      }

      // 3. Refund guard
      if (payment.payment_status === "refunded") {
        return res.status(400).json({
          success: false,
          message: "This payment receipt has already been refunded.",
        });
      }

      // 4. Update payment record
      const updatedNotes = payment.notes
        ? `${payment.notes} [REFUND: ${refund_reason.trim()}]`
        : `[REFUND: ${refund_reason.trim()}]`;

      await pool.query(
        `UPDATE lab_payments
         SET payment_status = 'refunded',
             notes = ?
         WHERE id = ?`,
        [updatedNotes, paymentId]
      );

      // 5. Re-evaluate remaining valid payments on the order
      const [remRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS remaining_paid
         FROM lab_payments
         WHERE order_id = ? AND payment_status = 'paid'`,
        [payment.order_id]
      );
      const remainingPaid = parseFloat(remRows[0].remaining_paid || 0);
      const orderPrice = parseFloat(payment.order_price || 0);

      let newOrderPaymentStatus = "unpaid";
      if (remainingPaid >= orderPrice && orderPrice > 0) {
        newOrderPaymentStatus = "paid";
      } else if (remainingPaid === 0) {
        newOrderPaymentStatus = "refunded";
      }

      await pool.query(
        `UPDATE investigation_requests
         SET payment_status = ?
         WHERE id = ?`,
        [newOrderPaymentStatus, payment.order_id]
      );

      // 6. Audit log
      await logAudit(
        req.user.id,
        "REFUND_LAB_PAYMENT",
        "lab_payments",
        paymentId,
        {
          order_id: payment.order_id,
          order_number: payment.order_number,
          receipt_number: payment.receipt_number,
          refunded_amount: parseFloat(payment.amount),
          refund_reason: refund_reason.trim(),
          remaining_paid: remainingPaid,
          order_payment_status: newOrderPaymentStatus,
        }
      );

      return res.json({
        success: true,
        message: `Payment receipt #${payment.receipt_number} (₹${parseFloat(payment.amount).toFixed(2)}) was successfully refunded.`,
        data: {
          payment_id: paymentId,
          receipt_number: payment.receipt_number,
          refunded_amount: parseFloat(payment.amount),
          payment_status: "refunded",
          order_payment_status: newOrderPaymentStatus,
        },
      });
    } catch (error) {
      console.error("Error refunding laboratory payment:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to refund laboratory payment.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/orders/:id/payments
 * Retrieve all payment receipts and transaction records for a laboratory order.
 */
router.get(
  "/orders/:id/payments",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);

      // 1. Fetch order
      const [orderRows] = await pool.query(
        `SELECT id, order_number, patient_id, hospital_id, price, payment_status
         FROM investigation_requests
         WHERE id = ?`,
        [orderId]
      );

      if (!orderRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory order record not found.",
        });
      }

      const order = orderRows[0];

      // 2. Isolation checks
      if (req.user.role === "patient" && Number(order.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view payments for your own orders.",
        });
      }

      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(order.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: This laboratory order belongs to another hospital facility.",
        });
      }

      // 3. Fetch payments
      const [payments] = await pool.query(
        `SELECT
           lp.id,
           lp.order_id,
           lp.patient_id,
           lp.hospital_id,
           lp.receipt_number,
           lp.amount,
           lp.payment_method,
           lp.transaction_reference,
           lp.payment_status,
           lp.notes,
           lp.created_at,
           u.full_name AS collected_by_name
         FROM lab_payments lp
         JOIN users u ON u.id = lp.collected_by
         WHERE lp.order_id = ?
         ORDER BY lp.created_at DESC`,
        [orderId]
      );

      const [sumRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM lab_payments
         WHERE order_id = ? AND payment_status = 'paid'`,
        [orderId]
      );

      return res.json({
        success: true,
        data: payments,
        summary: {
          order_id: order.id,
          order_number: order.order_number,
          price: parseFloat(order.price || 0),
          total_paid: parseFloat(sumRows[0].total_paid || 0),
          payment_status: order.payment_status,
        },
      });
    } catch (error) {
      console.error("Error retrieving laboratory payments:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve laboratory payments.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/labs/payments/:paymentId
 * Retrieve single laboratory payment receipt metadata.
 */
router.get(
  "/payments/:paymentId",
  allowRoles("super_admin", "hospital_admin", "doctor", "staff", "patient"),
  async (req, res) => {
    try {
      const paymentId = Number(req.params.paymentId);

      const [payRows] = await pool.query(
        `SELECT
           lp.*,
           ir.order_number,
           ir.test_name,
           ir.price AS order_price,
           u.full_name AS collected_by_name,
           u_pat.full_name AS patient_name,
           h.name AS hospital_name
         FROM lab_payments lp
         JOIN investigation_requests ir ON ir.id = lp.order_id
         JOIN users u ON u.id = lp.collected_by
         JOIN users u_pat ON u_pat.id = lp.patient_id
         JOIN hospitals h ON h.id = lp.hospital_id
         WHERE lp.id = ?`,
        [paymentId]
      );

      if (!payRows.length) {
        return res.status(404).json({
          success: false,
          message: "Laboratory payment receipt not found.",
        });
      }

      const payment = payRows[0];

      // Authorization guard
      if (req.user.role === "patient" && Number(payment.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only view your own payment receipts.",
        });
      }

      if (
        ["hospital_admin", "doctor", "staff"].includes(req.user.role) &&
        Number(payment.hospital_id) !== Number(req.user.hospitalId)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: This payment receipt belongs to another hospital facility.",
        });
      }

      return res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      console.error("Error retrieving payment receipt:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve payment receipt.",
        error: error.message,
      });
    }
  }
);

module.exports = router;


