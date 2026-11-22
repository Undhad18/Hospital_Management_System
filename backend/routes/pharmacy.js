const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { sendEmail } = require("../services/emailService");

/**
 * Helper to check pharmacist authorization
 */
function isPharmacistAuthorized(req) {
  if (!req.user) return false;
  if (req.user.role === "super_admin" || req.user.role === "hospital_admin") {
    return true;
  }
  if (req.user.role === "staff") {
    return true; // We also check fine-grained permissions below where appropriate
  }
  return false;
}

/**
 * Audit log helper
 */
async function recordAudit(actorId, action, targetType, targetId, details = null, ip = null) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId || null, action, targetType, targetId || null, details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (err) {
    console.warn("Audit log recording warning:", err.message);
  }
}

/**
 * ============================================================================
 * LESSON 12.1: MEDICINE CATEGORY MANAGEMENT
 * ============================================================================
 */

// GET /api/pharmacy/categories - View and search categories with medicine count
router.get("/categories", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "patient") {
      return res.status(403).json({ success: false, message: "Permission denied. Patient access to inventory endpoints is restricted." });
    }
    const { search, status, hospital_id } = req.query;
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;

    let targetHospitalId = null;
    if (userRole === "super_admin") {
      targetHospitalId = hospital_id ? parseInt(hospital_id, 10) : null;
    } else {
      targetHospitalId = userHospitalId;
    }

    let query = `
      SELECT 
        c.id,
        c.hospital_id,
        c.name,
        c.description,
        c.status,
        c.created_at,
        c.updated_at,
        COUNT(m.id) AS medicine_count,
        SUM(CASE WHEN m.status = 'active' THEN 1 ELSE 0 END) AS active_medicine_count
      FROM medicine_categories c
      LEFT JOIN master_medicines m ON m.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by scope (global categories hospital_id IS NULL + hospital-specific)
    if (targetHospitalId) {
      query += " AND (c.hospital_id IS NULL OR c.hospital_id = ?)";
      params.push(targetHospitalId);
    }

    if (status && (status === "active" || status === "inactive")) {
      query += " AND c.status = ?";
      params.push(status);
    }

    if (search && search.trim()) {
      query += " AND (c.name LIKE ? OR c.description LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += " GROUP BY c.id ORDER BY c.name ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch categories error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve medicine categories." });
  }
});

// GET /api/pharmacy/categories/:id - Single category details
router.get("/categories/:id", requireAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      `SELECT 
        c.*,
        COUNT(m.id) AS medicine_count,
        SUM(CASE WHEN m.status = 'active' THEN 1 ELSE 0 END) AS active_medicine_count
       FROM medicine_categories c
       LEFT JOIN master_medicines m ON m.category_id = c.id
       WHERE c.id = ?
       GROUP BY c.id`,
      [categoryId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine category not found." });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Category details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve category details." });
  }
});

// POST /api/pharmacy/categories - Create medicine category
router.post("/categories", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const { name, description, status = "active", hospital_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      return res.status(400).json({ success: false, message: "Category name must be between 2 and 120 characters." });
    }

    let assignedHospitalId = null;
    if (req.user.role === "super_admin") {
      assignedHospitalId = hospital_id ? parseInt(hospital_id, 10) : null;
    } else {
      assignedHospitalId = req.user.hospitalId;
    }

    // Check duplicate category name within scope
    const [existing] = await pool.query(
      `SELECT id FROM medicine_categories 
       WHERE name = ? AND ((hospital_id IS NULL AND ? IS NULL) OR hospital_id = ?)`,
      [trimmedName, assignedHospitalId, assignedHospitalId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "A medicine category with this name already exists in this scope." });
    }

    const catStatus = status === "inactive" ? "inactive" : "active";

    const [result] = await pool.query(
      `INSERT INTO medicine_categories (hospital_id, name, description, status)
       VALUES (?, ?, ?, ?)`,
      [assignedHospitalId, trimmedName, description ? description.trim() : null, catStatus]
    );

    await recordAudit(req.user.id, "medicine_category_created", "medicine_categories", result.insertId, {
      name: trimmedName,
      hospital_id: assignedHospitalId,
      status: catStatus,
    });

    return res.status(201).json({
      success: true,
      message: "Medicine category created successfully.",
      data: { id: result.insertId, name: trimmedName, status: catStatus },
    });
  } catch (error) {
    console.error("Create category error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create medicine category." });
  }
});

// PUT /api/pharmacy/categories/:id - Update category details
router.put("/categories/:id", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const categoryId = parseInt(req.params.id, 10);
    const { name, description, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required." });
    }

    const trimmedName = name.trim();
    const [current] = await pool.query("SELECT * FROM medicine_categories WHERE id = ?", [categoryId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine category not found." });
    }

    // Hospital admins cannot edit global master categories
    if (current[0].hospital_id === null && req.user.role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Global master categories can only be modified by Super Admin." });
    }

    // Hospital admins can only edit categories within their own hospital
    if (current[0].hospital_id && req.user.role !== "super_admin" && current[0].hospital_id !== req.user.hospitalId) {
      return res.status(403).json({ success: false, message: "Access denied. Cannot modify categories of another hospital." });
    }

    // Check duplicate name
    const [dup] = await pool.query(
      `SELECT id FROM medicine_categories 
       WHERE name = ? AND id != ? AND ((hospital_id IS NULL AND ? IS NULL) OR hospital_id = ?)`,
      [trimmedName, categoryId, current[0].hospital_id, current[0].hospital_id]
    );

    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: "Another medicine category with this name already exists in this scope." });
    }

    const updatedStatus = status ? (status === "inactive" ? "inactive" : "active") : current[0].status;

    await pool.query(
      `UPDATE medicine_categories 
       SET name = ?, description = ?, status = ?
       WHERE id = ?`,
      [trimmedName, description ? description.trim() : null, updatedStatus, categoryId]
    );

    await recordAudit(req.user.id, "medicine_category_updated", "medicine_categories", categoryId, {
      name: trimmedName,
      status: updatedStatus,
    });

    return res.json({
      success: true,
      message: "Medicine category updated successfully.",
      data: { id: categoryId, name: trimmedName, status: updatedStatus },
    });
  } catch (error) {
    console.error("Update category error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update medicine category." });
  }
});

// PATCH /api/pharmacy/categories/:id/status - Activate or Deactivate category
router.patch("/categories/:id/status", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const categoryId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be either 'active' or 'inactive'." });
    }

    const [current] = await pool.query("SELECT * FROM medicine_categories WHERE id = ?", [categoryId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine category not found." });
    }

    if (current[0].hospital_id === null && req.user.role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Global master categories can only be modified by Super Admin." });
    }

    await pool.query("UPDATE medicine_categories SET status = ? WHERE id = ?", [status, categoryId]);

    await recordAudit(req.user.id, "medicine_category_status_changed", "medicine_categories", categoryId, {
      previous_status: current[0].status,
      new_status: status,
    });

    return res.json({
      success: true,
      message: `Medicine category ${status === "active" ? "activated" : "deactivated"} successfully. Existing medicines remain preserved.`,
      data: { id: categoryId, status },
    });
  } catch (error) {
    console.error("Change category status error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update category status." });
  }
});

// DELETE /api/pharmacy/categories/:id - Delete category (protected against referenced categories)
router.delete("/categories/:id", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const categoryId = parseInt(req.params.id, 10);
    const [current] = await pool.query("SELECT * FROM medicine_categories WHERE id = ?", [categoryId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine category not found." });
    }

    if (current[0].hospital_id === null && req.user.role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Global master categories can only be removed by Super Admin." });
    }

    // Check if referenced by medicines
    const [medRefs] = await pool.query("SELECT COUNT(*) AS count FROM master_medicines WHERE category_id = ?", [categoryId]);
    if (medRefs[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category: Referenced by ${medRefs[0].count} existing medicine(s). Please deactivate the category instead to preserve historical integrity.`,
      });
    }

    await pool.query("DELETE FROM medicine_categories WHERE id = ?", [categoryId]);
    await recordAudit(req.user.id, "medicine_category_deleted", "medicine_categories", categoryId, { name: current[0].name });

    return res.json({ success: true, message: "Medicine category deleted successfully." });
  } catch (error) {
    console.error("Delete category error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to delete medicine category." });
  }
});

/**
 * ============================================================================
 * LESSON 12.2: SUPPLIER MANAGEMENT & VALIDATION
 * ============================================================================
 */

// GET /api/pharmacy/suppliers - View and search suppliers
router.get("/suppliers", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy supplier access required." });
    }
    const { search, status, hospital_id } = req.query;
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;

    let targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        s.*,
        COUNT(mb.id) AS total_batches_supplied,
        COALESCE(SUM(mb.current_quantity), 0) AS total_active_units_in_stock
      FROM suppliers s
      LEFT JOIN medicine_batches mb ON mb.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (targetHospitalId) {
      query += " AND (s.hospital_id IS NULL OR s.hospital_id = ?)";
      params.push(targetHospitalId);
    }

    if (status && (status === "active" || status === "inactive")) {
      query += " AND s.status = ?";
      params.push(status);
    }

    if (search && search.trim()) {
      query += " AND (s.name LIKE ? OR s.contact_person LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += " GROUP BY s.id ORDER BY s.name ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch suppliers error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve suppliers." });
  }
});

// GET /api/pharmacy/suppliers/:id - Single supplier details
router.get("/suppliers/:id", requireAuth, async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      `SELECT s.*,
              COUNT(mb.id) AS total_batches_supplied,
              COALESCE(SUM(mb.current_quantity), 0) AS total_active_units_in_stock
       FROM suppliers s
       LEFT JOIN medicine_batches mb ON mb.supplier_id = s.id
       WHERE s.id = ?
       GROUP BY s.id`,
      [supplierId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Supplier record not found." });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Supplier details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve supplier details." });
  }
});

// POST /api/pharmacy/suppliers - Create supplier
router.post("/suppliers", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const { name, contact_person, phone, email, address, status = "active", hospital_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }

    const trimmedName = name.trim();
    let assignedHospitalId = req.user.role === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : req.user.hospitalId;

    // Check duplicate supplier name in same scope
    const [existing] = await pool.query(
      `SELECT id FROM suppliers 
       WHERE name = ? AND ((hospital_id IS NULL AND ? IS NULL) OR hospital_id = ?)`,
      [trimmedName, assignedHospitalId, assignedHospitalId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "A supplier with this name already exists in this scope." });
    }

    const supStatus = status === "inactive" ? "inactive" : "active";

    const [result] = await pool.query(
      `INSERT INTO suppliers (hospital_id, name, contact_person, phone, email, address, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        assignedHospitalId,
        trimmedName,
        contact_person ? contact_person.trim() : null,
        phone ? phone.trim() : null,
        email ? email.trim().toLowerCase() : null,
        address ? address.trim() : null,
        supStatus,
      ]
    );

    await recordAudit(req.user.id, "supplier_created", "suppliers", result.insertId, {
      name: trimmedName,
      hospital_id: assignedHospitalId,
      status: supStatus,
    });

    return res.status(201).json({
      success: true,
      message: "Supplier record created successfully.",
      data: { id: result.insertId, name: trimmedName, status: supStatus },
    });
  } catch (error) {
    console.error("Create supplier error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create supplier." });
  }
});

// PUT /api/pharmacy/suppliers/:id - Update supplier
router.put("/suppliers/:id", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const supplierId = parseInt(req.params.id, 10);
    const { name, contact_person, phone, email, address, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }

    const trimmedName = name.trim();
    const [current] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [supplierId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Supplier not found." });
    }

    if (current[0].hospital_id === null && req.user.role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Global suppliers can only be modified by Super Admin." });
    }

    if (current[0].hospital_id && req.user.role !== "super_admin" && current[0].hospital_id !== req.user.hospitalId) {
      return res.status(403).json({ success: false, message: "Access denied. Cannot modify suppliers of another hospital." });
    }

    const [dup] = await pool.query(
      `SELECT id FROM suppliers 
       WHERE name = ? AND id != ? AND ((hospital_id IS NULL AND ? IS NULL) OR hospital_id = ?)`,
      [trimmedName, supplierId, current[0].hospital_id, current[0].hospital_id]
    );

    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: "Another supplier with this name already exists in this scope." });
    }

    const updatedStatus = status ? (status === "inactive" ? "inactive" : "active") : current[0].status;

    await pool.query(
      `UPDATE suppliers 
       SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, status = ?
       WHERE id = ?`,
      [
        trimmedName,
        contact_person ? contact_person.trim() : null,
        phone ? phone.trim() : null,
        email ? email.trim().toLowerCase() : null,
        address ? address.trim() : null,
        updatedStatus,
        supplierId,
      ]
    );

    await recordAudit(req.user.id, "supplier_updated", "suppliers", supplierId, {
      name: trimmedName,
      status: updatedStatus,
    });

    return res.json({
      success: true,
      message: "Supplier record updated successfully.",
      data: { id: supplierId, name: trimmedName, status: updatedStatus },
    });
  } catch (error) {
    console.error("Update supplier error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update supplier." });
  }
});

// PATCH /api/pharmacy/suppliers/:id/status - Activate or Deactivate supplier
router.patch("/suppliers/:id/status", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Inventory management access required." });
    }

    const supplierId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be either 'active' or 'inactive'." });
    }

    const [current] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [supplierId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Supplier not found." });
    }

    if (current[0].hospital_id === null && req.user.role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Global suppliers can only be modified by Super Admin." });
    }

    await pool.query("UPDATE suppliers SET status = ? WHERE id = ?", [status, supplierId]);
    await recordAudit(req.user.id, "supplier_status_changed", "suppliers", supplierId, {
      previous_status: current[0].status,
      new_status: status,
    });

    return res.json({
      success: true,
      message: `Supplier ${status === "active" ? "activated" : "deactivated"} successfully. Historical purchase records remain preserved.`,
      data: { id: supplierId, status },
    });
  } catch (error) {
    console.error("Change supplier status error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update supplier status." });
  }
});

/**
 * ============================================================================
 * LESSON 12.3 & 12.4 & 12.5 & 12.8: MEDICINE CATALOG & FORMULARY MANAGEMENT
 * ============================================================================
 */

// GET /api/pharmacy/medicines - List medicines with stock and pricing
router.get("/medicines", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "patient") {
      return res.status(403).json({ success: false, message: "Permission denied. Patient access to inventory is restricted." });
    }
    const { search, category_id, status, hospital_id, low_stock } = req.query;
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;

    let targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        m.id,
        m.sku,
        m.name,
        m.generic_name,
        m.form,
        m.strength,
        m.category AS category_name,
        m.category_id,
        c.name AS category_title,
        c.status AS category_status,
        m.purchase_price,
        m.sale_price,
        m.max_discount_percent,
        m.min_stock_alert_level,
        m.description,
        m.status,
        m.created_at,
        m.updated_at,
        COALESCE(hm.sale_price, m.sale_price) AS active_sale_price,
        COALESCE(hm.min_stock_alert_level, m.min_stock_alert_level) AS active_min_stock,
        COALESCE(hm.status, 'active') AS hospital_status,
        COALESCE(stock_summary.available_stock, 0) AS current_stock,
        COALESCE(stock_summary.batch_count, 0) AS active_batch_count,
        COALESCE(stock_summary.expiring_soon_count, 0) AS expiring_soon_batches
      FROM master_medicines m
      LEFT JOIN medicine_categories c ON c.id = m.category_id
      LEFT JOIN hospital_medicines hm ON hm.master_medicine_id = m.id ${targetHospitalId ? "AND hm.hospital_id = ?" : "AND 1=0"}
      LEFT JOIN (
        SELECT 
          mb.medicine_id,
          SUM(CASE WHEN mb.status = 'active' AND mb.expiry_date >= CURDATE() THEN mb.current_quantity ELSE 0 END) AS available_stock,
          COUNT(CASE WHEN mb.status = 'active' AND mb.current_quantity > 0 THEN 1 END) AS batch_count,
          SUM(CASE WHEN mb.status = 'active' AND mb.current_quantity > 0 AND mb.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY) THEN 1 ELSE 0 END) AS expiring_soon_count
        FROM medicine_batches mb
        ${targetHospitalId ? "WHERE mb.hospital_id = ?" : ""}
        GROUP BY mb.medicine_id
      ) stock_summary ON stock_summary.medicine_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (targetHospitalId) {
      params.push(targetHospitalId); // for hm join
      params.push(targetHospitalId); // for stock_summary subquery
    }

    if (status && (status === "active" || status === "inactive")) {
      query += " AND m.status = ?";
      params.push(status);
    }

    if (category_id) {
      query += " AND m.category_id = ?";
      params.push(parseInt(category_id, 10));
    }

    if (search && search.trim()) {
      query += " AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.sku LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (low_stock === "true") {
      query += " AND COALESCE(stock_summary.available_stock, 0) <= COALESCE(hm.min_stock_alert_level, m.min_stock_alert_level)";
    }

    query += " ORDER BY m.name ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch medicines error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve medicines." });
  }
});

// GET /api/pharmacy/medicines/:id - Single medicine details
router.get("/medicines/:id", requireAuth, async (req, res) => {
  try {
    const medId = parseInt(req.params.id, 10);
    const userHospitalId = req.user.role === "super_admin" ? null : req.user.hospitalId;

    const [rows] = await pool.query(
      `SELECT 
        m.*,
        c.name AS category_title,
        c.status AS category_status
       FROM master_medicines m
       LEFT JOIN medicine_categories c ON c.id = m.category_id
       WHERE m.id = ?`,
      [medId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine record not found." });
    }

    const medicine = rows[0];

    // Fetch batches for this hospital if hospital-scoped user
    let batchesQuery = `
      SELECT mb.*, s.name AS supplier_name
      FROM medicine_batches mb
      LEFT JOIN suppliers s ON s.id = mb.supplier_id
      WHERE mb.medicine_id = ?
    `;
    const batchParams = [medId];
    if (userHospitalId) {
      batchesQuery += " AND mb.hospital_id = ?";
      batchParams.push(userHospitalId);
    }
    batchesQuery += " ORDER BY mb.expiry_date ASC";

    const [batches] = await pool.query(batchesQuery, batchParams);
    medicine.batches = batches;

    return res.json({ success: true, data: medicine });
  } catch (error) {
    console.error("Medicine details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve medicine details." });
  }
});

// POST /api/pharmacy/medicines - Create medicine master record
router.post("/medicines", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Master medicine management requires authorization." });
    }

    const {
      sku,
      name,
      generic_name,
      form = "Tablet",
      strength,
      category_id,
      purchase_price = 0,
      sale_price = 0,
      max_discount_percent = 0,
      min_stock_alert_level = 15,
      description,
      status = "active",
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Medicine display name is required." });
    }

    const trimmedName = name.trim();
    const trimmedGeneric = generic_name ? generic_name.trim() : null;
    const trimmedStrength = strength ? strength.trim() : null;
    const trimmedForm = form ? form.trim() : "Tablet";

    // Validate SKU uniqueness
    let finalSku = sku ? sku.trim().toUpperCase() : null;
    if (finalSku) {
      const [existingSku] = await pool.query("SELECT id FROM master_medicines WHERE sku = ?", [finalSku]);
      if (existingSku.length > 0) {
        return res.status(409).json({ success: false, message: `SKU '${finalSku}' is already assigned to another medicine.` });
      }
    }

    // Validate Category assignment & Category Status
    let catTitle = null;
    let finalCategoryId = null;
    if (category_id) {
      finalCategoryId = parseInt(category_id, 10);
      const [cat] = await pool.query("SELECT id, name, status FROM medicine_categories WHERE id = ?", [finalCategoryId]);
      if (cat.length === 0) {
        return res.status(400).json({ success: false, message: "Specified category does not exist." });
      }
      if (cat[0].status === "inactive") {
        return res.status(400).json({
          success: false,
          message: `Cannot assign medicine to inactive category '${cat[0].name}'. Activate the category first.`,
        });
      }
      catTitle = cat[0].name;
    }

    // Financial Validation (Lesson 12.5)
    const pPrice = parseFloat(purchase_price);
    const sPrice = parseFloat(sale_price);
    const maxDisc = parseFloat(max_discount_percent);
    const minAlert = parseInt(min_stock_alert_level, 10);

    if (isNaN(pPrice) || pPrice < 0) {
      return res.status(400).json({ success: false, message: "Purchase price must be a valid non-negative number." });
    }
    if (isNaN(sPrice) || sPrice < 0) {
      return res.status(400).json({ success: false, message: "Sale price must be a valid non-negative number." });
    }
    if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
      return res.status(400).json({ success: false, message: "Maximum discount percentage must be between 0 and 100." });
    }
    if (isNaN(minAlert) || minAlert < 0) {
      return res.status(400).json({ success: false, message: "Minimum stock alert level must be a non-negative integer." });
    }

    const medStatus = status === "inactive" ? "inactive" : "active";

    const [result] = await pool.query(
      `INSERT INTO master_medicines 
       (sku, name, generic_name, form, strength, category, category_id, purchase_price, sale_price, max_discount_percent, min_stock_alert_level, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalSku,
        trimmedName,
        trimmedGeneric,
        trimmedForm,
        trimmedStrength,
        catTitle,
        finalCategoryId,
        pPrice.toFixed(2),
        sPrice.toFixed(2),
        maxDisc.toFixed(2),
        minAlert,
        description ? description.trim() : null,
        medStatus,
      ]
    );

    const insertedId = result.insertId;

    // Generate automatic SKU if not provided
    if (!finalSku) {
      finalSku = `MED-${LPAD(insertedId, 4)}`;
      await pool.query("UPDATE master_medicines SET sku = ? WHERE id = ?", [finalSku, insertedId]);
    }

    // Auto-link to hospital formulary if user belongs to a hospital
    if (req.user.hospitalId) {
      await pool.query(
        `INSERT IGNORE INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [req.user.hospitalId, insertedId, sPrice.toFixed(2), maxDisc.toFixed(2), minAlert]
      );
    }

    await recordAudit(req.user.id, "medicine_created", "master_medicines", insertedId, {
      sku: finalSku,
      name: trimmedName,
      purchase_price: pPrice,
      sale_price: sPrice,
    });

    return res.status(201).json({
      success: true,
      message: "Medicine master record created successfully.",
      data: { id: insertedId, sku: finalSku, name: trimmedName, status: medStatus },
    });
  } catch (error) {
    console.error("Create medicine error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create medicine record." });
  }
});

function LPAD(val, len) {
  let s = String(val);
  while (s.length < len) s = "0" + s;
  return s;
}

// PUT /api/pharmacy/medicines/:id - Update medicine record
router.put("/medicines/:id", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Master medicine modification requires authorization." });
    }

    const medId = parseInt(req.params.id, 10);
    const [current] = await pool.query("SELECT * FROM master_medicines WHERE id = ?", [medId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine record not found." });
    }

    const {
      sku,
      name,
      generic_name,
      form,
      strength,
      category_id,
      purchase_price,
      sale_price,
      max_discount_percent,
      min_stock_alert_level,
      description,
      status,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Medicine display name is required." });
    }

    const trimmedName = name.trim();
    const finalSku = sku ? sku.trim().toUpperCase() : current[0].sku;

    // Check SKU conflict with another medicine
    if (finalSku) {
      const [dupSku] = await pool.query("SELECT id FROM master_medicines WHERE sku = ? AND id != ?", [finalSku, medId]);
      if (dupSku.length > 0) {
        return res.status(409).json({ success: false, message: `SKU '${finalSku}' is already in use by another medicine.` });
      }
    }

    let catTitle = current[0].category;
    let finalCategoryId = current[0].category_id;

    if (category_id !== undefined) {
      if (category_id === null || category_id === "") {
        finalCategoryId = null;
        catTitle = null;
      } else {
        finalCategoryId = parseInt(category_id, 10);
        const [cat] = await pool.query("SELECT id, name, status FROM medicine_categories WHERE id = ?", [finalCategoryId]);
        if (cat.length === 0) {
          return res.status(400).json({ success: false, message: "Specified category does not exist." });
        }
        // Enforce: Prevent assignment of an active medicine to an inactive category
        if (cat[0].status === "inactive" && status !== "inactive" && current[0].status !== "inactive") {
          return res.status(400).json({
            success: false,
            message: `Cannot assign medicine to inactive category '${cat[0].name}'. Activate the category first.`,
          });
        }
        catTitle = cat[0].name;
      }
    }

    const pPrice = purchase_price !== undefined ? parseFloat(purchase_price) : parseFloat(current[0].purchase_price);
    const sPrice = sale_price !== undefined ? parseFloat(sale_price) : parseFloat(current[0].sale_price);
    const maxDisc = max_discount_percent !== undefined ? parseFloat(max_discount_percent) : parseFloat(current[0].max_discount_percent);
    const minAlert = min_stock_alert_level !== undefined ? parseInt(min_stock_alert_level, 10) : current[0].min_stock_alert_level;

    if (isNaN(pPrice) || pPrice < 0) {
      return res.status(400).json({ success: false, message: "Purchase price must be non-negative." });
    }
    if (isNaN(sPrice) || sPrice < 0) {
      return res.status(400).json({ success: false, message: "Sale price must be non-negative." });
    }
    if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
      return res.status(400).json({ success: false, message: "Maximum discount percentage must be between 0 and 100." });
    }

    const medStatus = status ? (status === "inactive" ? "inactive" : "active") : current[0].status;

    await pool.query(
      `UPDATE master_medicines 
       SET sku = ?, name = ?, generic_name = ?, form = ?, strength = ?, 
           category = ?, category_id = ?, purchase_price = ?, sale_price = ?, 
           max_discount_percent = ?, min_stock_alert_level = ?, description = ?, status = ?
       WHERE id = ?`,
      [
        finalSku,
        trimmedName,
        generic_name ? generic_name.trim() : null,
        form ? form.trim() : "Tablet",
        strength ? strength.trim() : null,
        catTitle,
        finalCategoryId,
        pPrice.toFixed(2),
        sPrice.toFixed(2),
        maxDisc.toFixed(2),
        minAlert,
        description !== undefined ? (description ? description.trim() : null) : current[0].description,
        medStatus,
        medId,
      ]
    );

    await recordAudit(req.user.id, "medicine_updated", "master_medicines", medId, {
      name: trimmedName,
      sku: finalSku,
      status: medStatus,
      sale_price: sPrice,
    });

    return res.json({
      success: true,
      message: "Medicine master record updated successfully.",
      data: { id: medId, sku: finalSku, name: trimmedName, status: medStatus },
    });
  } catch (error) {
    console.error("Update medicine error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update medicine record." });
  }
});

// PATCH /api/pharmacy/medicines/:id/status - Controlled activation/deactivation (Lesson 12.8)
router.patch("/medicines/:id/status", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Medicine activation requires authorization." });
    }

    const medId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be either 'active' or 'inactive'." });
    }

    const [current] = await pool.query("SELECT id, name, status, category_id FROM master_medicines WHERE id = ?", [medId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine record not found." });
    }

    // If activating, verify category is active
    if (status === "active" && current[0].category_id) {
      const [cat] = await pool.query("SELECT id, name, status FROM medicine_categories WHERE id = ?", [current[0].category_id]);
      if (cat.length > 0 && cat[0].status === "inactive") {
        return res.status(400).json({
          success: false,
          message: `Cannot activate medicine '${current[0].name}': Its category '${cat[0].name}' is currently inactive. Please activate the category first.`,
        });
      }
    }

    await pool.query("UPDATE master_medicines SET status = ? WHERE id = ?", [status, medId]);

    await recordAudit(req.user.id, "medicine_status_changed", "master_medicines", medId, {
      medicine_name: current[0].name,
      previous_status: current[0].status,
      new_status: status,
    });

    return res.json({
      success: true,
      message: `Medicine '${current[0].name}' ${status === "active" ? "activated" : "deactivated"} successfully. Existing prescriptions and stock batches remain preserved.`,
      data: { id: medId, status },
    });
  } catch (error) {
    console.error("Change medicine status error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update medicine status." });
  }
});

/**
 * ============================================================================
 * LESSON 12.6: BATCH-LEVEL INVENTORY, EXPIRY & STOCK MOVEMENTS
 * ============================================================================
 */

// GET /api/pharmacy/batches - View inventory batches
router.get("/batches", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can access inventory batches." });
    }
    const { medicine_id, supplier_id, status, expiring_days, search, hospital_id } = req.query;
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;

    let targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        mb.*,
        m.name AS medicine_name,
        m.generic_name,
        m.sku AS medicine_sku,
        m.form,
        m.strength,
        s.name AS supplier_name,
        u.full_name AS received_by_name,
        DATEDIFF(mb.expiry_date, CURDATE()) AS days_until_expiry,
        CASE 
          WHEN mb.expiry_date < CURDATE() THEN 'expired'
          WHEN mb.current_quantity = 0 THEN 'depleted'
          WHEN DATEDIFF(mb.expiry_date, CURDATE()) <= 60 THEN 'expiring_soon'
          ELSE 'available'
        END AS dynamic_stock_status
      FROM medicine_batches mb
      JOIN master_medicines m ON m.id = mb.medicine_id
      LEFT JOIN suppliers s ON s.id = mb.supplier_id
      LEFT JOIN users u ON u.id = mb.received_by
      WHERE 1=1
    `;
    const params = [];

    if (targetHospitalId) {
      query += " AND mb.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (medicine_id) {
      query += " AND mb.medicine_id = ?";
      params.push(parseInt(medicine_id, 10));
    }

    if (supplier_id) {
      query += " AND mb.supplier_id = ?";
      params.push(parseInt(supplier_id, 10));
    }

    if (status && ["active", "quarantined", "depleted", "expired", "recalled"].includes(status)) {
      query += " AND mb.status = ?";
      params.push(status);
    }

    if (expiring_days) {
      const days = parseInt(expiring_days, 10);
      if (!isNaN(days)) {
        query += " AND mb.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)";
        params.push(days);
      }
    }

    if (search && search.trim()) {
      query += " AND (mb.batch_number LIKE ? OR m.name LIKE ? OR m.sku LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    // Order by earliest expiry first (FEFO)
    query += " ORDER BY mb.expiry_date ASC, mb.id ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch batches error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve inventory batches." });
  }
});

// POST /api/pharmacy/batches - Receive New Batch (Lesson 12.6)
router.post("/batches", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can receive stock batches." });
    }

    const {
      medicine_id,
      supplier_id,
      batch_number,
      purchase_date,
      expiry_date,
      purchase_price,
      sale_price,
      quantity,
      hospital_id,
      notes,
    } = req.body;

    const targetHospitalId = req.user.role === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : 1) : req.user.hospitalId;

    if (!targetHospitalId) {
      return res.status(400).json({ success: false, message: "Hospital identifier is required for stock receipt." });
    }

    if (!medicine_id) {
      return res.status(400).json({ success: false, message: "Medicine selection is required." });
    }

    if (!batch_number || !batch_number.trim()) {
      return res.status(400).json({ success: false, message: "Batch / Lot number is required." });
    }

    const trimmedBatch = batch_number.trim().toUpperCase();

    // Validate quantities (positive whole integer)
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: "Received quantity must be a positive whole integer greater than zero." });
    }

    // Validate dates
    if (!expiry_date) {
      return res.status(400).json({ success: false, message: "Batch expiry date is required." });
    }
    const expDate = new Date(expiry_date);
    const purDate = purchase_date ? new Date(purchase_date) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(expDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid expiry date format." });
    }

    if (expDate <= today) {
      return res.status(400).json({
        success: false,
        message: "Cannot receive batch: The specified expiry date is in the past. Expired stock cannot be received into active inventory.",
      });
    }

    if (purDate > new Date()) {
      return res.status(400).json({ success: false, message: "Purchase date cannot be in the future." });
    }

    // Check Medicine existence & status
    const [medRows] = await connection.query("SELECT id, name, status, purchase_price, sale_price FROM master_medicines WHERE id = ?", [medicine_id]);
    if (medRows.length === 0) {
      return res.status(404).json({ success: false, message: "Medicine master record not found." });
    }
    if (medRows[0].status === "inactive") {
      return res.status(400).json({
        success: false,
        message: `Cannot receive stock: Medicine '${medRows[0].name}' is deactivated. Activate the medicine master first.`,
      });
    }

    // Check Supplier status if provided
    let finalSupplierId = null;
    if (supplier_id) {
      finalSupplierId = parseInt(supplier_id, 10);
      const [supRows] = await connection.query("SELECT id, name, status FROM suppliers WHERE id = ?", [finalSupplierId]);
      if (supRows.length === 0) {
        return res.status(404).json({ success: false, message: "Specified supplier does not exist." });
      }
      if (supRows[0].status === "inactive") {
        return res.status(400).json({
          success: false,
          message: `Cannot purchase from inactive supplier '${supRows[0].name}'. Activate the supplier first.`,
        });
      }
    }

    // Prevent duplicate batch number for same medicine in same hospital
    const [dupBatch] = await connection.query(
      "SELECT id FROM medicine_batches WHERE hospital_id = ? AND medicine_id = ? AND batch_number = ?",
      [targetHospitalId, medicine_id, trimmedBatch]
    );
    if (dupBatch.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Batch '${trimmedBatch}' has already been registered for this medicine. Use the stock adjustment workflow if adding units to an existing lot.`,
      });
    }

    // Financial pricing
    const pPrice = purchase_price !== undefined ? parseFloat(purchase_price) : parseFloat(medRows[0].purchase_price);
    const sPrice = sale_price !== undefined ? parseFloat(sale_price) : parseFloat(medRows[0].sale_price);

    if (isNaN(pPrice) || pPrice < 0) {
      return res.status(400).json({ success: false, message: "Purchase price must be non-negative." });
    }
    if (isNaN(sPrice) || sPrice < 0) {
      return res.status(400).json({ success: false, message: "Sale price must be non-negative." });
    }

    await connection.beginTransaction();

    const formattedPurDate = purDate.toISOString().split("T")[0];
    const formattedExpDate = expDate.toISOString().split("T")[0];

    const [batchResult] = await connection.query(
      `INSERT INTO medicine_batches 
       (hospital_id, medicine_id, supplier_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        targetHospitalId,
        medicine_id,
        finalSupplierId,
        trimmedBatch,
        formattedPurDate,
        formattedExpDate,
        pPrice.toFixed(2),
        sPrice.toFixed(2),
        qty,
        qty,
        req.user.id,
      ]
    );

    const newBatchId = batchResult.insertId;

    // Record in stock movements ledger
    await connection.query(
      `INSERT INTO stock_movements 
       (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
       VALUES (?, ?, ?, 'purchase', ?, ?, 'batch_receipt', ?, ?, ?)`,
      [
        targetHospitalId,
        newBatchId,
        medicine_id,
        qty,
        qty,
        `BATCH-${newBatchId}`,
        notes ? notes.trim() : "Initial stock purchase receipt",
        req.user.id,
      ]
    );

    await connection.commit();

    await recordAudit(req.user.id, "stock_batch_received", "medicine_batches", newBatchId, {
      hospital_id: targetHospitalId,
      medicine_id,
      batch_number: trimmedBatch,
      quantity: qty,
      expiry_date: formattedExpDate,
    });

    return res.status(201).json({
      success: true,
      message: `Batch '${trimmedBatch}' with ${qty} unit(s) received successfully into pharmacy inventory.`,
      data: {
        id: newBatchId,
        batch_number: trimmedBatch,
        current_quantity: qty,
        expiry_date: formattedExpDate,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Receive batch error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to receive stock batch." });
  } finally {
    connection.release();
  }
});

// POST /api/pharmacy/batches/:id/adjust - Adjust Batch Stock Quantity (Lesson 12.10)
router.post("/batches/:id/adjust", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can perform stock adjustments." });
    }

    const batchId = parseInt(req.params.id, 10);
    const { adjustment_type, quantity, reason } = req.body;

    if (!adjustment_type || !["add", "deduct", "write_off_expired", "write_off_damaged"].includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: "Adjustment type must be 'add', 'deduct', 'write_off_expired', or 'write_off_damaged'.",
      });
    }

    const adjQty = parseInt(quantity, 10);
    if (isNaN(adjQty) || adjQty <= 0) {
      return res.status(400).json({ success: false, message: "Adjustment quantity must be a positive whole integer." });
    }

    if (!reason || !reason.trim() || reason.trim().length < 5) {
      return res.status(400).json({ success: false, message: "A clear authorized justification reason (at least 5 characters) is required for inventory audit." });
    }

    await connection.beginTransaction();

    // Lock batch row FOR UPDATE
    const [batchRows] = await connection.query(
      "SELECT * FROM medicine_batches WHERE id = ? FOR UPDATE",
      [batchId]
    );

    if (batchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Inventory batch not found." });
    }

    const batch = batchRows[0];

    // Check hospital isolation
    if (req.user.role !== "super_admin" && batch.hospital_id !== req.user.hospitalId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied. Cannot adjust inventory of another hospital." });
    }

    let newQty = batch.current_quantity;
    let qtyChange = 0;
    let movementType = "adjustment_add";

    if (adjustment_type === "add") {
      newQty = batch.current_quantity + adjQty;
      qtyChange = adjQty;
      movementType = "adjustment_add";
    } else {
      // Deduction / Write off
      if (batch.current_quantity < adjQty) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot deduct ${adjQty} unit(s): Only ${batch.current_quantity} unit(s) available in this batch. Negative stock is strictly prevented.`,
        });
      }
      newQty = batch.current_quantity - adjQty;
      qtyChange = -adjQty;
      movementType = adjustment_type === "write_off_expired" 
        ? "write_off_expired" 
        : adjustment_type === "write_off_damaged" 
        ? "write_off_damaged" 
        : "adjustment_sub";
    }

    const newStatus = newQty === 0 ? "depleted" : batch.status;

    await connection.query(
      "UPDATE medicine_batches SET current_quantity = ?, status = ? WHERE id = ?",
      [newQty, newStatus, batchId]
    );

    // Record stock movement
    await connection.query(
      `INSERT INTO stock_movements 
       (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, 'manual_adjustment', ?, ?, ?)`,
      [
        batch.hospital_id,
        batchId,
        batch.medicine_id,
        movementType,
        qtyChange,
        newQty,
        `ADJ-${Date.now()}`,
        reason.trim(),
        req.user.id,
      ]
    );

    await connection.commit();

    await recordAudit(req.user.id, "stock_batch_adjusted", "medicine_batches", batchId, {
      movement_type: movementType,
      quantity_change: qtyChange,
      previous_quantity: batch.current_quantity,
      new_quantity: newQty,
      reason: reason.trim(),
    });

    return res.json({
      success: true,
      message: `Stock batch adjusted successfully. New available balance: ${newQty} unit(s).`,
      data: {
        batch_id: batchId,
        previous_quantity: batch.current_quantity,
        new_quantity: newQty,
        status: newStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Stock adjustment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to perform stock adjustment." });
  } finally {
    connection.release();
  }
});

// GET /api/pharmacy/movements - Stock Movement Ledger (Lesson 12.10)
router.get("/movements", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy movement ledger access required." });
    }
    const { medicine_id, batch_id, movement_type, limit = 50, hospital_id } = req.query;
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;

    let targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        sm.*,
        m.name AS medicine_name,
        m.sku AS medicine_sku,
        mb.batch_number,
        u.full_name AS performed_by_name
      FROM stock_movements sm
      JOIN master_medicines m ON m.id = sm.medicine_id
      JOIN medicine_batches mb ON mb.id = sm.batch_id
      JOIN users u ON u.id = sm.performed_by
      WHERE 1=1
    `;
    const params = [];

    if (targetHospitalId) {
      query += " AND sm.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (medicine_id) {
      query += " AND sm.medicine_id = ?";
      params.push(parseInt(medicine_id, 10));
    }

    if (batch_id) {
      query += " AND sm.batch_id = ?";
      params.push(parseInt(batch_id, 10));
    }

    if (movement_type) {
      query += " AND sm.movement_type = ?";
      params.push(movement_type);
    }

    query += " ORDER BY sm.created_at DESC LIMIT ?";
    params.push(Math.min(parseInt(limit, 10) || 50, 200));

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch movements error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve stock movements." });
  }
});

/**
 * ============================================================================
 * LESSON 12.7: MINIMUM STOCK & EXPIRY ALERTS
 * ============================================================================
 */

// GET /api/pharmacy/alerts/summary - High-level metrics for alert dashboard
router.get("/alerts/summary", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy alerts access required." });
    }
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;
    const { hospital_id } = req.query;

    const targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    // 1. Low stock count (eligible usable stock <= min_stock_alert_level)
    const [lowStock] = await pool.query(
      `SELECT COUNT(*) AS count FROM (
        SELECT 
          m.id,
          COALESCE(hm.min_stock_alert_level, m.min_stock_alert_level) AS threshold,
          COALESCE(SUM(CASE WHEN mb.status = 'active' AND mb.expiry_date >= CURDATE() THEN mb.current_quantity ELSE 0 END), 0) AS usable_stock
        FROM master_medicines m
        LEFT JOIN hospital_medicines hm ON hm.master_medicine_id = m.id ${targetHospitalId ? "AND hm.hospital_id = ?" : "AND 1=0"}
        LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id ${targetHospitalId ? "AND mb.hospital_id = ?" : ""}
        WHERE m.status = 'active'
        GROUP BY m.id
        HAVING usable_stock <= threshold AND usable_stock > 0
      ) AS low_stock_medicines`,
      targetHospitalId ? [targetHospitalId, targetHospitalId] : []
    );

    // 2. Out of stock count (usable_stock = 0)
    const [outOfStock] = await pool.query(
      `SELECT COUNT(*) AS count FROM (
        SELECT 
          m.id,
          COALESCE(SUM(CASE WHEN mb.status = 'active' AND mb.expiry_date >= CURDATE() THEN mb.current_quantity ELSE 0 END), 0) AS usable_stock
        FROM master_medicines m
        LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id ${targetHospitalId ? "AND mb.hospital_id = ?" : ""}
        WHERE m.status = 'active'
        GROUP BY m.id
        HAVING usable_stock = 0
      ) AS out_of_stock_medicines`,
      targetHospitalId ? [targetHospitalId] : []
    );

    // 3. Expiring soon count (< 60 days)
    const [expiringSoon] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM medicine_batches mb
       WHERE mb.status = 'active' 
         AND mb.current_quantity > 0 
         AND mb.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)
         ${targetHospitalId ? "AND mb.hospital_id = ?" : ""}`,
      targetHospitalId ? [targetHospitalId] : []
    );

    // 4. Expired batches with units remaining
    const [expired] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM medicine_batches mb
       WHERE mb.current_quantity > 0 
         AND mb.expiry_date < CURDATE()
         ${targetHospitalId ? "AND mb.hospital_id = ?" : ""}`,
      targetHospitalId ? [targetHospitalId] : []
    );

    return res.json({
      success: true,
      data: {
        low_stock_count: lowStock[0].count,
        out_of_stock_count: outOfStock[0].count,
        expiring_soon_count: expiringSoon[0].count,
        expired_count: expired[0].count,
      },
    });
  } catch (error) {
    console.error("Alerts summary error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve alerts summary." });
  }
});

// GET /api/pharmacy/alerts/low-stock - List of medicines with low or depleted stock
router.get("/alerts/low-stock", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy alerts access required." });
    }
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;
    const { hospital_id, category_id, search } = req.query;

    const targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        m.id,
        m.sku,
        m.name,
        m.generic_name,
        m.form,
        m.strength,
        c.name AS category_name,
        COALESCE(hm.min_stock_alert_level, m.min_stock_alert_level) AS min_threshold,
        CAST(COALESCE(SUM(CASE WHEN mb.status = 'active' AND mb.expiry_date >= CURDATE() THEN mb.current_quantity ELSE 0 END), 0) AS SIGNED) AS usable_stock,
        CAST(COALESCE(SUM(CASE WHEN mb.expiry_date < CURDATE() THEN mb.current_quantity ELSE 0 END), 0) AS SIGNED) AS expired_stock,
        CASE 
          WHEN COALESCE(SUM(CASE WHEN mb.status = 'active' AND mb.expiry_date >= CURDATE() THEN mb.current_quantity ELSE 0 END), 0) = 0 THEN 'OUT_OF_STOCK'
          ELSE 'LOW_STOCK'
        END AS alert_severity
      FROM master_medicines m
      LEFT JOIN medicine_categories c ON c.id = m.category_id
      LEFT JOIN hospital_medicines hm ON hm.master_medicine_id = m.id ${targetHospitalId ? "AND hm.hospital_id = ?" : "AND 1=0"}
      LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id ${targetHospitalId ? "AND mb.hospital_id = ?" : ""}
      WHERE m.status = 'active'
    `;
    const params = [];

    if (targetHospitalId) {
      params.push(targetHospitalId);
      params.push(targetHospitalId);
    }

    if (category_id) {
      query += " AND m.category_id = ?";
      params.push(parseInt(category_id, 10));
    }

    if (search && search.trim()) {
      query += " AND (m.name LIKE ? OR m.sku LIKE ? OR m.generic_name LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += `
      GROUP BY m.id
      HAVING usable_stock <= min_threshold
      ORDER BY usable_stock ASC, m.name ASC
    `;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch low stock alerts error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve low stock alerts." });
  }
});

// GET /api/pharmacy/alerts/expiring - List of batches expiring soon or expired
router.get("/alerts/expiring", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy alerts access required." });
    }
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;
    const { hospital_id, days = 60 } = req.query;

    const targetHospitalId = userRole === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : null) : userHospitalId;
    const daysLimit = parseInt(days, 10) || 60;

    let query = `
      SELECT 
        mb.*,
        m.name AS medicine_name,
        m.sku AS medicine_sku,
        s.name AS supplier_name,
        DATEDIFF(mb.expiry_date, CURDATE()) AS days_until_expiry,
        CASE 
          WHEN mb.expiry_date < CURDATE() THEN 'EXPIRED'
          WHEN DATEDIFF(mb.expiry_date, CURDATE()) <= 30 THEN 'CRITICAL'
          ELSE 'WARNING'
        END AS urgency
      FROM medicine_batches mb
      JOIN master_medicines m ON m.id = mb.medicine_id
      LEFT JOIN suppliers s ON s.id = mb.supplier_id
      WHERE mb.current_quantity > 0
        AND mb.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
    `;
    const params = [daysLimit];

    if (targetHospitalId) {
      query += " AND mb.hospital_id = ?";
      params.push(targetHospitalId);
    }

    query += " ORDER BY mb.expiry_date ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch expiring alerts error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve expiry alerts." });
  }
});

/**
 * ============================================================================
 * LESSON 12.10: ATOMIC FEFO DISPENSING & INVENTORY VALIDATION
 * ============================================================================
 */

// POST /api/pharmacy/dispensations - Atomic FEFO Dispensing Transaction (Lessons 15.1 - 15.10)
router.post("/dispensations", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can dispense medications." });
    }

    const {
      patient_id,
      prescription_id,
      bill_id,
      items, // array of { medicine_id, requested_quantity, discount_percent }
      payment_method = "cash",
      notes,
      hospital_id,
      idempotency_key,
    } = req.body;

    const targetHospitalId = req.user.role === "super_admin" ? (hospital_id ? parseInt(hospital_id, 10) : 1) : req.user.hospitalId;

    if (!targetHospitalId) {
      return res.status(400).json({ success: false, message: "Hospital identifier is required for dispensing." });
    }

    if (!patient_id) {
      return res.status(400).json({ success: false, message: "Patient ID is required." });
    }

    // Check Idempotency Key (Lesson 15.8)
    if (idempotency_key && typeof idempotency_key === "string" && idempotency_key.trim().length > 0) {
      const [existingDisp] = await connection.query(
        `SELECT d.*, u.full_name AS dispensed_by_name, b.bill_number
         FROM pharmacy_dispensations d
         LEFT JOIN users u ON u.id = d.dispensed_by
         LEFT JOIN pharmacy_bills b ON b.id = d.bill_id
         WHERE d.idempotency_key = ?`,
        [idempotency_key.trim()]
      );

      if (existingDisp.length > 0) {
        const disp = existingDisp[0];
        const [dItems] = await connection.query(
          `SELECT di.*, m.name AS medicine_name, b.batch_number
           FROM pharmacy_dispensation_items di
           JOIN master_medicines m ON m.id = di.medicine_id
           LEFT JOIN medicine_batches b ON b.id = di.batch_id
           WHERE di.dispensation_id = ?`,
          [disp.id]
        );
        return res.status(200).json({
          success: true,
          is_duplicate: true,
          message: "Dispensing request already processed with this idempotency key.",
          data: {
            id: disp.id,
            dispensation_number: disp.dispensation_number,
            prescription_id: disp.prescription_id,
            bill_id: disp.bill_id,
            bill_number: disp.bill_number,
            total_amount: disp.total_amount,
            items: dItems,
          },
        });
      }
    }

    // Verify Patient exists
    const [patients] = await connection.query("SELECT id, full_name FROM users WHERE id = ?", [patient_id]);
    if (patients.length === 0) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one medication item must be specified for dispensing." });
    }

    // If prescription_id is provided, validate prescription eligibility (Lesson 15.2)
    let validatedRx = null;
    if (prescription_id) {
      const [rxRows] = await connection.query(
        "SELECT id, prescription_number, hospital_id, patient_id, status FROM prescriptions WHERE id = ?",
        [parseInt(prescription_id, 10)]
      );
      if (rxRows.length === 0) {
        return res.status(404).json({ success: false, message: "Referenced prescription not found." });
      }
      validatedRx = rxRows[0];
      if (validatedRx.hospital_id !== targetHospitalId) {
        return res.status(403).json({ success: false, message: "Prescription belongs to a different hospital facility." });
      }
      if (validatedRx.status === "draft") {
        return res.status(400).json({ success: false, message: "Cannot dispense draft prescription. Attending physician must activate it first." });
      }
      if (validatedRx.status === "cancelled") {
        return res.status(400).json({ success: false, message: "Cannot dispense a cancelled prescription." });
      }
      if (validatedRx.status === "dispensed") {
        return res.status(400).json({ success: false, message: "Prescription has already been fully dispensed." });
      }
    }

    // If bill_id is provided, validate bill eligibility (Lesson 15.2)
    let validatedBillId = null;
    if (bill_id) {
      const parsedBillId = parseInt(bill_id, 10);
      if (isNaN(parsedBillId) || parsedBillId <= 0) {
        return res.status(400).json({ success: false, message: "Invalid pharmacy bill ID specified." });
      }
      const [bRows] = await connection.query(
        "SELECT id, bill_number, hospital_id, patient_id, prescription_id, status FROM pharmacy_bills WHERE id = ?",
        [parsedBillId]
      );
      if (bRows.length === 0) {
        return res.status(404).json({ success: false, message: "Referenced pharmacy bill not found." });
      }
      const bRec = bRows[0];
      if (Number(bRec.patient_id) !== Number(patient_id)) {
        return res.status(400).json({ success: false, message: "Pharmacy bill patient does not match dispensing patient." });
      }
      if (Number(bRec.hospital_id) !== Number(targetHospitalId)) {
        return res.status(403).json({ success: false, message: "Cross-hospital billing validation failed." });
      }
      if (prescription_id && bRec.prescription_id && Number(bRec.prescription_id) !== Number(prescription_id)) {
        return res.status(400).json({ success: false, message: "Pharmacy bill is not linked to this prescription." });
      }
      if (["cancelled", "refunded"].includes(bRec.status)) {
        return res.status(400).json({ success: false, message: `Cannot dispense against a ${bRec.status} pharmacy bill.` });
      }
      validatedBillId = bRec.id;
    }

    // Begin Atomic Transaction (Lesson 15.9)
    await connection.beginTransaction();

    let dispensationSubtotal = 0;
    let dispensationTotalDiscount = 0;
    const allocatedLineItems = [];

    // Process each requested medicine item
    for (const item of items) {
      const medId = parseInt(item.medicine_id, 10);
      const reqQty = parseInt(item.requested_quantity, 10);
      const userDiscount = item.discount_percent !== undefined ? parseFloat(item.discount_percent) : 0;

      if (!medId || isNaN(reqQty) || reqQty <= 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Each dispensation line item must have a valid medicine_id and requested_quantity > 0." });
      }

      // Verify Medicine active status
      const [medRows] = await connection.query(
        "SELECT id, name, status, sale_price, max_discount_percent FROM master_medicines WHERE id = ?",
        [medId]
      );
      if (medRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: `Medicine ID ${medId} not found.` });
      }
      if (medRows[0].status === "inactive") {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot dispense deactivated medicine '${medRows[0].name}'.` });
      }

      const medicine = medRows[0];
      const maxPermittedDiscount = parseFloat(medicine.max_discount_percent);
      const effectiveDiscount = Math.min(Math.max(userDiscount, 0), maxPermittedDiscount);

      // Lock eligible active batches for this medicine in FEFO order (First Expiry First Out)
      // Exclude expired batches (expiry_date < CURDATE())
      const [batches] = await connection.query(
        `SELECT id, batch_number, expiry_date, current_quantity, sale_price 
         FROM medicine_batches 
         WHERE hospital_id = ? 
           AND medicine_id = ? 
           AND status = 'active' 
           AND current_quantity > 0 
           AND expiry_date >= CURDATE()
         ORDER BY expiry_date ASC, id ASC
         FOR UPDATE`,
        [targetHospitalId, medId]
      );

      // Calculate total eligible available stock across batches
      const totalEligibleStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);

      if (totalEligibleStock < reqQty) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient non-expired stock for '${medicine.name}'. Requested: ${reqQty}, Eligible Available: ${totalEligibleStock}. Dispensing rejected to prevent stock shortfall.`,
        });
      }

      // Allocate units across batches using FEFO
      let remainingToAllocate = reqQty;

      for (const batch of batches) {
        if (remainingToAllocate <= 0) break;

        const takeQty = Math.min(remainingToAllocate, batch.current_quantity);
        const newBatchQty = batch.current_quantity - takeQty;
        const newBatchStatus = newBatchQty === 0 ? "depleted" : "active";

        // Deduct from batch with conditional check to prevent negative stock (Lesson 15.8)
        const [updResult] = await connection.query(
          "UPDATE medicine_batches SET current_quantity = current_quantity - ?, status = ? WHERE id = ? AND current_quantity >= ?",
          [takeQty, newBatchStatus, batch.id, takeQty]
        );
        if (updResult.affectedRows === 0) {
          await connection.rollback();
          return res.status(409).json({ success: false, message: `Concurrent stock modification conflict for '${medicine.name}'. Please retry.` });
        }

        // Server-side financial pricing snapshot
        const unitPrice = parseFloat(batch.sale_price) > 0 ? parseFloat(batch.sale_price) : parseFloat(medicine.sale_price);
        const lineGross = unitPrice * takeQty;
        const lineDiscountAmt = lineGross * (effectiveDiscount / 100);
        const lineNet = lineGross - lineDiscountAmt;

        dispensationSubtotal += lineGross;
        dispensationTotalDiscount += lineDiscountAmt;

        allocatedLineItems.push({
          batch_id: batch.id,
          medicine_id: medId,
          medicine_name: medicine.name,
          quantity: takeQty,
          unit_sale_price: unitPrice,
          discount_percent: effectiveDiscount,
          total_price: lineNet,
          remaining_batch_quantity: newBatchQty,
        });

        remainingToAllocate -= takeQty;
      }
    }

    const finalTotalAmount = dispensationSubtotal - dispensationTotalDiscount;
    const dispensationNumber = `DISP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;

    // Create Pharmacy Dispensation Record (Lessons 15.4, 15.10)
    const [dispRes] = await connection.query(
      `INSERT INTO pharmacy_dispensations 
       (dispensation_number, hospital_id, patient_id, prescription_id, bill_id, subtotal, discount_amount, tax_amount, total_amount, payment_status, payment_method, dispensed_by, notes, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, 'paid', ?, ?, ?, ?)`,
      [
        dispensationNumber,
        targetHospitalId,
        patient_id,
        prescription_id ? parseInt(prescription_id, 10) : null,
        validatedBillId,
        dispensationSubtotal.toFixed(2),
        dispensationTotalDiscount.toFixed(2),
        finalTotalAmount.toFixed(2),
        payment_method,
        req.user.id,
        notes ? notes.trim() : null,
        idempotency_key ? idempotency_key.trim() : null,
      ]
    );

    const dispensationId = dispRes.insertId;

    // Record items & stock movement audit logs
    for (const alloc of allocatedLineItems) {
      let linkedRxItemId = null;
      if (validatedRx) {
        const [matchingItems] = await connection.query(
          "SELECT id FROM prescription_items WHERE prescription_id = ? AND medicine_id = ? LIMIT 1",
          [validatedRx.id, alloc.medicine_id]
        );
        if (matchingItems.length > 0) {
          linkedRxItemId = matchingItems[0].id;
          await connection.query(
            "UPDATE prescription_items SET dispensed_quantity = dispensed_quantity + ? WHERE id = ?",
            [alloc.quantity, linkedRxItemId]
          );
        }
      }

      await connection.query(
        `INSERT INTO pharmacy_dispensation_items 
         (dispensation_id, prescription_item_id, batch_id, medicine_id, quantity, unit_sale_price, discount_percent, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dispensationId,
          linkedRxItemId,
          alloc.batch_id,
          alloc.medicine_id,
          alloc.quantity,
          alloc.unit_sale_price.toFixed(2),
          alloc.discount_percent.toFixed(2),
          alloc.total_price.toFixed(2),
        ]
      );

      // Record immutable stock movement
      await connection.query(
        `INSERT INTO stock_movements 
         (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
         VALUES (?, ?, ?, 'dispense', ?, ?, 'pharmacy_dispensation', ?, ?, ?)`,
        [
          targetHospitalId,
          alloc.batch_id,
          alloc.medicine_id,
          -alloc.quantity,
          alloc.remaining_batch_quantity,
          dispensationNumber,
          `Dispensed ${alloc.quantity} unit(s) of ${alloc.medicine_name}`,
          req.user.id,
        ]
      );
    }

    // Recalculate prescription status if linked
    if (validatedRx) {
      const [allRxItems] = await connection.query(
        "SELECT quantity, dispensed_quantity FROM prescription_items WHERE prescription_id = ?",
        [validatedRx.id]
      );
      const isFullyDispensed = allRxItems.length > 0 && allRxItems.every((it) => (it.dispensed_quantity || 0) >= (it.quantity || 0));
      const nextRxStatus = isFullyDispensed ? "dispensed" : "partially_dispensed";

      if (validatedRx.status !== nextRxStatus) {
        await connection.query("UPDATE prescriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextRxStatus, validatedRx.id]);
        await connection.query(
          "INSERT INTO prescription_status_history (prescription_id, from_status, to_status, changed_by, reason) VALUES (?, ?, ?, ?, ?)",
          [validatedRx.id, validatedRx.status, nextRxStatus, req.user.id, `Dispensation #${dispensationNumber} processed`]
        );
      }
    }

    await connection.commit();

    await recordAudit(req.user.id, "medications_dispensed", "pharmacy_dispensations", dispensationId, {
      dispensation_number: dispensationNumber,
      patient_id,
      total_amount: finalTotalAmount,
      item_count: allocatedLineItems.length,
    });

    return res.status(201).json({
      success: true,
      message: "Medications dispensed successfully using FEFO allocation.",
      data: {
        id: dispensationId,
        dispensation_number: dispensationNumber,
        subtotal: dispensationSubtotal.toFixed(2),
        discount_amount: dispensationTotalDiscount.toFixed(2),
        total_amount: finalTotalAmount.toFixed(2),
        items: allocatedLineItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Dispensing transaction error:", error.message);
    return res.status(500).json({ success: false, message: "Dispensing transaction failed. Inventory state rolled back." });
  } finally {
    connection.release();
  }
});

// GET /api/pharmacy/dispensations - List completed dispensations
router.get("/dispensations", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Dispensation records access required." });
    }
    const userRole = req.user.role;
    const userHospitalId = req.user.hospitalId;
    const { patient_id, search, hospital_id, prescription_id, bill_id, status, date_from, date_to } = req.query;
    const cleanStr = (val) => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      return (!s || s === "undefined" || s === "null") ? null : s;
    };
    const sPatientId = cleanStr(patient_id);
    const sSearch = cleanStr(search);
    const sHospitalId = cleanStr(hospital_id);
    const sPrescriptionId = cleanStr(prescription_id);
    const sBillId = cleanStr(bill_id);
    const sStatus = cleanStr(status);
    const sDateFrom = cleanStr(date_from);
    const sDateTo = cleanStr(date_to);

    const targetHospitalId = userRole === "super_admin" ? (sHospitalId && !isNaN(parseInt(sHospitalId, 10)) ? parseInt(sHospitalId, 10) : null) : userHospitalId;

    let query = `
      SELECT 
        pd.*,
        p.full_name AS patient_name,
        p.email AS patient_email,
        u.full_name AS dispensed_by_name,
        pr.prescription_number,
        b.bill_number,
        b.status AS bill_status,
        COUNT(pdi.id) AS total_items
      FROM pharmacy_dispensations pd
      JOIN users p ON p.id = pd.patient_id
      JOIN users u ON u.id = pd.dispensed_by
      LEFT JOIN prescriptions pr ON pr.id = pd.prescription_id
      LEFT JOIN pharmacy_bills b ON b.id = pd.bill_id
      LEFT JOIN pharmacy_dispensation_items pdi ON pdi.dispensation_id = pd.id
      WHERE 1=1
    `;
    const params = [];

    if (targetHospitalId) {
      query += " AND pd.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (sPatientId && !isNaN(parseInt(sPatientId, 10))) {
      query += " AND pd.patient_id = ?";
      params.push(parseInt(sPatientId, 10));
    }

    if (sPrescriptionId && !isNaN(parseInt(sPrescriptionId, 10))) {
      query += " AND pd.prescription_id = ?";
      params.push(parseInt(sPrescriptionId, 10));
    }

    if (sBillId && !isNaN(parseInt(sBillId, 10))) {
      query += " AND pd.bill_id = ?";
      params.push(parseInt(sBillId, 10));
    }

    if (sStatus) {
      query += " AND pd.status = ?";
      params.push(sStatus);
    }

    if (sDateFrom) {
      query += " AND pd.created_at >= ?";
      params.push(sDateFrom.includes(":") ? sDateFrom : `${sDateFrom} 00:00:00`);
    }

    if (sDateTo) {
      query += " AND pd.created_at <= ?";
      params.push(sDateTo.includes(":") ? sDateTo : `${sDateTo} 23:59:59`);
    }

    if (sSearch) {
      query += " AND (pd.dispensation_number LIKE ? OR p.full_name LIKE ? OR pr.prescription_number LIKE ? OR b.bill_number LIKE ?)";
      const term = `%${sSearch}%`;
      params.push(term, term, term, term);
    }

    query += " GROUP BY pd.id ORDER BY pd.created_at DESC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch dispensations error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve dispensations." });
  }
});

// GET /api/pharmacy/dispensations/:id - Single dispensation details with items
router.get("/dispensations/:id", requireAuth, async (req, res) => {
  try {
    const dispId = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      `SELECT 
        pd.*,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone,
        u.full_name AS dispensed_by_name,
        pr.prescription_number,
        b.bill_number,
        b.status AS bill_status,
        b.grand_total AS bill_total_amount,
        b.paid_amount AS bill_paid_amount
       FROM pharmacy_dispensations pd
       JOIN users p ON p.id = pd.patient_id
       JOIN users u ON u.id = pd.dispensed_by
       LEFT JOIN prescriptions pr ON pr.id = pd.prescription_id
       LEFT JOIN pharmacy_bills b ON b.id = pd.bill_id
       WHERE pd.id = ?`,
      [dispId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Dispensation record not found." });
    }

    const dispensation = rows[0];

    // Hospital Isolation Check (Lesson 15.4)
    if (req.user.role !== "super_admin" && req.user.hospitalId !== dispensation.hospital_id) {
      return res.status(403).json({
        success: false,
        message: "Cross-hospital data access denied. You are not authorized to view this dispensation.",
      });
    }

    const [items] = await pool.query(
      `SELECT 
        pdi.*,
        m.name AS medicine_name,
        m.sku AS medicine_sku,
        m.form,
        m.strength,
        mb.batch_number,
        mb.expiry_date
       FROM pharmacy_dispensation_items pdi
       JOIN master_medicines m ON m.id = pdi.medicine_id
       JOIN medicine_batches mb ON mb.id = pdi.batch_id
       WHERE pdi.dispensation_id = ?`,
      [dispId]
    );

    dispensation.items = items;

    return res.json({ success: true, data: dispensation });
  } catch (error) {
    console.error("Dispensation details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve dispensation details." });
  }
});

// GET /api/pharmacy/prescriptions/pending - Prescriptions awaiting fulfillment
router.get("/prescriptions/pending", requireAuth, async (req, res) => {
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Pharmacy prescription queue access required." });
    }
    const targetHospitalId = req.user.role === "super_admin" ? null : req.user.hospitalId;

    let query = `
      SELECT 
        pr.id,
        pr.prescription_number,
        pr.consultation_id,
        pr.patient_id,
        pr.doctor_id,
        pr.hospital_id,
        pr.general_instructions,
        pr.status,
        pr.created_at,
        p.full_name AS patient_name,
        p.email AS patient_email,
        d.full_name AS doctor_name,
        (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = pr.id) AS item_count,
        pr.status AS fulfillment_status
      FROM prescriptions pr
      JOIN users p ON p.id = pr.patient_id
      JOIN users d ON d.id = pr.doctor_id
      WHERE pr.status IN ('active', 'partially_dispensed')
    `;
    const params = [];

    if (targetHospitalId) {
      query += " AND pr.hospital_id = ?";
      params.push(targetHospitalId);
    }

    query += " ORDER BY pr.created_at DESC";

    const [rows] = await pool.query(query, params);

    // Enforce attaching prescribed items for each prescription
    if (rows.length > 0) {
      const rxIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT 
          pi.*,
          COALESCE(pi.medicine_id, m.id) AS master_medicine_id,
          m.sku AS medicine_sku,
          m.sale_price AS default_sale_price,
          (pi.quantity - pi.dispensed_quantity) AS remaining_quantity
         FROM prescription_items pi
         LEFT JOIN master_medicines m ON m.id = pi.medicine_id OR LOWER(TRIM(m.name)) = LOWER(TRIM(pi.medicine_name))
         WHERE pi.prescription_id IN (?)`,
        [rxIds]
      );

      const itemsByRx = {};
      for (const it of items) {
        if (!itemsByRx[it.prescription_id]) itemsByRx[it.prescription_id] = [];
        itemsByRx[it.prescription_id].push(it);
      }

      for (const row of rows) {
        row.items = itemsByRx[row.id] || [];
      }
    }

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch pending prescriptions error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve pending prescriptions." });
  }
});

/**
 * ============================================================================
 * MODULE 14: PHARMACY BILLING AND PAYMENT (LESSONS 14.1 - 14.11)
 * ============================================================================
 */

function generateBillNumber() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PBILL-${ymd}-${rand}`;
}

function generateReceiptNumber() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PRCP-${ymd}-${rand}`;
}

function generateRefundNumber() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PRFND-${ymd}-${rand}`;
}

// -----------------------------------------------------------------------------
// LESSON 14.1 - 14.5, 14.8, 14.10: GENERATE PHARMACY BILL FROM PRESCRIPTION
// -----------------------------------------------------------------------------
router.post("/bills", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can create medication bills." });
    }

    const {
      prescription_id,
      patient_id: rawPatientId,
      hospital_id: rawHospId,
      items,
      idempotency_key,
      notes,
    } = req.body;

    const targetHospitalId = req.user.role === "super_admin"
      ? (rawHospId ? parseInt(rawHospId, 10) : (req.user.hospitalId || 1))
      : req.user.hospitalId;

    if (!targetHospitalId) {
      return res.status(400).json({ success: false, message: "Hospital facility identifier is required." });
    }

    // Lesson 14.8: Idempotency Protection
    if (idempotency_key) {
      const [existingBills] = await connection.query(
        "SELECT id, bill_number, subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status FROM pharmacy_bills WHERE idempotency_key = ?",
        [idempotency_key]
      );
      if (existingBills.length > 0) {
        return res.status(200).json({
          success: true,
          message: "Existing bill returned for idempotency key.",
          data: existingBills[0],
          is_duplicate: true,
        });
      }
    }

    // Lesson 14.2: Prescription & Patient Relationship Validation
    let validatedRx = null;
    let effectivePatientId = rawPatientId ? parseInt(rawPatientId, 10) : null;

    if (prescription_id) {
      const [rxRows] = await connection.query(
        `SELECT p.id, p.prescription_number, p.hospital_id, p.patient_id, p.doctor_id, p.status,
                u.full_name AS patient_name, u.email AS patient_email
         FROM prescriptions p
         JOIN users u ON u.id = p.patient_id
         WHERE p.id = ?`,
        [parseInt(prescription_id, 10)]
      );

      if (rxRows.length === 0) {
        return res.status(404).json({ success: false, message: "Referenced prescription was not found in system." });
      }

      validatedRx = rxRows[0];

      // Hospital boundary enforcement
      if (validatedRx.hospital_id !== targetHospitalId) {
        return res.status(403).json({ success: false, message: "Prescription belongs to a different hospital facility." });
      }

      // Patient verification
      if (effectivePatientId && effectivePatientId !== validatedRx.patient_id) {
        return res.status(400).json({ success: false, message: "Specified patient does not match the patient linked to this prescription." });
      }
      effectivePatientId = validatedRx.patient_id;

      // Status eligibility validation
      if (validatedRx.status === "draft") {
        return res.status(400).json({ success: false, message: "Cannot generate bill for draft prescription. The attending physician must activate it first." });
      }
      if (validatedRx.status === "cancelled") {
        return res.status(400).json({ success: false, message: "Cannot generate bill for a cancelled prescription." });
      }
    }

    if (!effectivePatientId) {
      return res.status(400).json({ success: false, message: "Patient identifier is required." });
    }

    // Verify patient exists
    const [patientRows] = await connection.query("SELECT id, full_name, email FROM users WHERE id = ?", [effectivePatientId]);
    if (patientRows.length === 0) {
      return res.status(404).json({ success: false, message: "Patient record not found." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one medication line item is required to generate a bill." });
    }

    // Begin atomic transaction
    await connection.beginTransaction();

    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalGst = 0;
    let grandTotal = 0;

    const validatedItems = [];

    for (const item of items) {
      const medId = item.medicine_id ? parseInt(item.medicine_id, 10) : null;
      const rxItemId = item.prescription_item_id ? parseInt(item.prescription_item_id, 10) : null;
      const qty = parseInt(item.quantity, 10);
      const reqDiscount = item.discount_percent !== undefined ? parseFloat(item.discount_percent) : 0;

      if (!qty || isNaN(qty) || qty <= 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Each medication line item must have a valid positive quantity > 0." });
      }

      if (isNaN(reqDiscount) || reqDiscount < 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Discount percent cannot be negative." });
      }

      let resolvedMedId = medId;
      let rxItem = null;

      if (rxItemId) {
        const [rxItemRows] = await connection.query(
          "SELECT id, prescription_id, medicine_id, medicine_name, quantity, dispensed_quantity FROM prescription_items WHERE id = ?",
          [rxItemId]
        );
        if (rxItemRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: `Prescription item ID ${rxItemId} not found.` });
        }
        rxItem = rxItemRows[0];
        if (validatedRx && rxItem.prescription_id !== validatedRx.id) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: `Prescription item ID ${rxItemId} does not belong to prescription #${validatedRx.prescription_number}.` });
        }
        resolvedMedId = resolvedMedId || rxItem.medicine_id;

        // Check remaining billable/dispensable quantity
        const remainingQty = (rxItem.quantity || 0) - (rxItem.dispensed_quantity || 0);
        if (qty > remainingQty) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Billed quantity (${qty}) exceeds remaining unfulfilled quantity (${remainingQty}) for '${rxItem.medicine_name}'.`,
          });
        }
      }

      if (!resolvedMedId) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Medicine ID is required for each billed line item." });
      }

      // Authoritative Medicine lookup
      const [medRows] = await connection.query(
        "SELECT id, name, sku, form AS dosage_form, sale_price, max_discount_percent, status FROM master_medicines WHERE id = ?",
        [resolvedMedId]
      );
      if (medRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: `Medicine ID ${resolvedMedId} not found.` });
      }
      const masterMed = medRows[0];
      if (masterMed.status === "inactive") {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot bill deactivated medication '${masterMed.name}'.` });
      }

      // Check hospital formulary for price override
      const [formRows] = await connection.query(
        "SELECT sale_price, max_discount_percent, status FROM hospital_medicines WHERE hospital_id = ? AND master_medicine_id = ?",
        [targetHospitalId, resolvedMedId]
      );
      let authoritativeUnitPrice = parseFloat(masterMed.sale_price || 0);
      let maxPermittedDiscount = parseFloat(masterMed.max_discount_percent || 0);

      if (formRows.length > 0 && formRows[0].status === "active") {
        if (parseFloat(formRows[0].sale_price) > 0) {
          authoritativeUnitPrice = parseFloat(formRows[0].sale_price);
        }
        if (formRows[0].max_discount_percent !== null) {
          maxPermittedDiscount = parseFloat(formRows[0].max_discount_percent);
        }
      }

      if (reqDiscount > maxPermittedDiscount) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Requested discount of ${reqDiscount}% exceeds the maximum permitted discount of ${maxPermittedDiscount}% for '${masterMed.name}'.`,
        });
      }

      // Lesson 14.3 & 14.4 & 14.5: Financial Line Calculation
      const effectiveDiscount = reqDiscount;
      const lineGross = Math.round(authoritativeUnitPrice * qty * 100) / 100;
      const lineDiscountAmt = Math.round(lineGross * (effectiveDiscount / 100) * 100) / 100;
      const lineTaxableAmt = Math.round((lineGross - lineDiscountAmt) * 100) / 100;
      const lineGstRate = 12.00; // Mandatory 12% GST
      const lineGstAmt = Math.round(lineTaxableAmt * (lineGstRate / 100) * 100) / 100;
      const lineTotal = Math.round((lineTaxableAmt + lineGstAmt) * 100) / 100;

      subtotal += lineGross;
      totalDiscount += lineDiscountAmt;
      taxableAmount += lineTaxableAmt;
      totalGst += lineGstAmt;
      grandTotal += lineTotal;

      validatedItems.push({
        prescription_item_id: rxItemId,
        medicine_id: resolvedMedId,
        medicine_name: masterMed.name,
        sku: masterMed.sku,
        dosage_form: masterMed.dosage_form,
        quantity: qty,
        unit_price: authoritativeUnitPrice,
        discount_percent: effectiveDiscount,
        discount_amount: lineDiscountAmt,
        taxable_amount: lineTaxableAmt,
        gst_rate: lineGstRate,
        gst_amount: lineGstAmt,
        line_total: lineTotal,
      });
    }

    // Final financial balancing
    subtotal = Math.round(subtotal * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    taxableAmount = Math.round((subtotal - totalDiscount) * 100) / 100;
    // Statutory 12% GST calculation: Taxable Amount * 0.12
    totalGst = Math.round(taxableAmount * 0.12 * 100) / 100;
    grandTotal = Math.round((taxableAmount + totalGst) * 100) / 100;

    const billNumber = generateBillNumber();

    // Insert into pharmacy_bills
    const [billRes] = await connection.query(
      `INSERT INTO pharmacy_bills
       (bill_number, hospital_id, patient_id, prescription_id, purchase_type, subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status, idempotency_key, notes, created_by)
       VALUES (?, ?, ?, ?, 'hospital', ?, ?, ?, 12.00, ?, ?, 0.00, ?, 'pending', ?, ?, ?)`,
      [
        billNumber,
        targetHospitalId,
        effectivePatientId,
        validatedRx ? validatedRx.id : null,
        subtotal.toFixed(2),
        totalDiscount.toFixed(2),
        taxableAmount.toFixed(2),
        totalGst.toFixed(2),
        grandTotal.toFixed(2),
        grandTotal.toFixed(2), // Initial balance due = grand total
        idempotency_key || null,
        notes ? notes.trim() : null,
        req.user.id,
      ]
    );

    const billId = billRes.insertId;

    // Insert bill line items
    for (const item of validatedItems) {
      await connection.query(
        `INSERT INTO pharmacy_bill_items
         (bill_id, prescription_item_id, medicine_id, medicine_name, sku, dosage_form, quantity, unit_price, discount_percent, discount_amount, taxable_amount, gst_rate, gst_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 12.00, ?, ?)`,
        [
          billId,
          item.prescription_item_id,
          item.medicine_id,
          item.medicine_name,
          item.sku,
          item.dosage_form,
          item.quantity,
          item.unit_price.toFixed(2),
          item.discount_percent.toFixed(2),
          item.discount_amount.toFixed(2),
          item.taxable_amount.toFixed(2),
          item.gst_amount.toFixed(2),
          item.line_total.toFixed(2),
        ]
      );
    }

    // Lesson 14.10: State separation
    // Bill creation DOES NOT deduct stock and DOES NOT mark prescription as dispensed.

    await connection.commit();

    await recordAudit(req.user.id, "pharmacy_bill_generated", "pharmacy_bills", billId, {
      bill_number: billNumber,
      prescription_id: validatedRx ? validatedRx.id : null,
      patient_id: effectivePatientId,
      grand_total: grandTotal.toFixed(2),
      items_count: validatedItems.length,
    });

    return res.status(201).json({
      success: true,
      message: "Pharmacy medication bill generated successfully with 12% statutory GST.",
      data: {
        id: billId,
        bill_number: billNumber,
        hospital_id: targetHospitalId,
        patient_id: effectivePatientId,
        prescription_id: validatedRx ? validatedRx.id : null,
        subtotal: subtotal.toFixed(2),
        discount_amount: totalDiscount.toFixed(2),
        taxable_amount: taxableAmount.toFixed(2),
        gst_rate: "12.00",
        gst_amount: totalGst.toFixed(2),
        grand_total: grandTotal.toFixed(2),
        paid_amount: "0.00",
        balance_due: grandTotal.toFixed(2),
        status: "pending",
        items: validatedItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create pharmacy bill error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate pharmacy bill." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// LIST PHARMACY BILLS (FILTERS, SEARCH, PAGINATION)
// -----------------------------------------------------------------------------
router.get("/bills", requireAuth, async (req, res) => {
  try {
    const {
      patient_id,
      status,
      purchase_type,
      from_date,
      to_date,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT b.*,
             u.full_name AS patient_name,
             u.email AS patient_email,
             u.phone AS patient_phone,
             pr.prescription_number,
             doc.full_name AS doctor_name,
             h.name AS hospital_name,
             cb.full_name AS created_by_name,
             (SELECT COUNT(*) FROM pharmacy_bill_items WHERE bill_id = b.id) AS item_count
      FROM pharmacy_bills b
      JOIN users u ON u.id = b.patient_id
      JOIN hospitals h ON h.id = b.hospital_id
      JOIN users cb ON cb.id = b.created_by
      LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
      LEFT JOIN users doc ON doc.id = pr.doctor_id
      WHERE 1=1
    `;
    const params = [];

    // Role-based scoping
    if (req.user.role === "patient") {
      query += " AND b.patient_id = ?";
      params.push(req.user.id);
    } else if (req.user.role !== "super_admin") {
      query += " AND b.hospital_id = ?";
      params.push(req.user.hospitalId);
    }

    if (patient_id && req.user.role !== "patient") {
      query += " AND b.patient_id = ?";
      params.push(parseInt(patient_id, 10));
    }

    if (status && status !== "all") {
      query += " AND b.status = ?";
      params.push(status);
    }

    if (purchase_type && purchase_type !== "all") {
      query += " AND b.purchase_type = ?";
      params.push(purchase_type);
    }

    if (from_date) {
      query += " AND DATE(b.created_at) >= ?";
      params.push(from_date);
    }

    if (to_date) {
      query += " AND DATE(b.created_at) <= ?";
      params.push(to_date);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query += ` AND (
        b.bill_number LIKE ? OR
        u.full_name LIKE ? OR
        u.email LIKE ? OR
        u.phone LIKE ? OR
        pr.prescription_number LIKE ? OR
        b.external_pharmacy_name LIKE ? OR
        b.external_bill_number LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0]?.total || 0;

    query += " ORDER BY b.created_at DESC LIMIT ? OFFSET ?";
    params.push(limitNum, offset);

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        total_pages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("List pharmacy bills error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve pharmacy bills." });
  }
});

// -----------------------------------------------------------------------------
// GET SPECIFIC PHARMACY BILL DETAILS
// -----------------------------------------------------------------------------
router.get("/bills/:id", requireAuth, async (req, res) => {
  try {
    const rawParam = req.params.id;
    if (!rawParam) {
      return res.status(400).json({ success: false, message: "Valid bill identifier is required." });
    }
    const isNumericId = !isNaN(parseInt(rawParam, 10)) && /^\d+$/.test(String(rawParam).trim());

    const [bills] = await pool.query(
      `SELECT b.*,
              u.full_name AS patient_name,
              u.email AS patient_email,
              u.phone AS patient_phone,
              pr.prescription_number,
              doc.full_name AS doctor_name,
              h.name AS hospital_name,
              h.address AS hospital_address,
              h.phone AS hospital_phone,
              h.email AS hospital_email,
              cb.full_name AS created_by_name
       FROM pharmacy_bills b
       LEFT JOIN users u ON u.id = b.patient_id
       LEFT JOIN hospitals h ON h.id = b.hospital_id
       LEFT JOIN users cb ON cb.id = b.created_by
       LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
       LEFT JOIN users doc ON doc.id = pr.doctor_id
       WHERE ${isNumericId ? "(b.id = ? OR b.bill_number = ?)" : "b.bill_number = ?"}`,
      isNumericId ? [parseInt(rawParam, 10), String(rawParam).trim()] : [String(rawParam).trim()]
    );

    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Pharmacy bill not found." });
    }

    const bill = bills[0];

    // Role-based access check
    if (req.user.role === "patient" && bill.patient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied. You can only view your own bills." });
    }
    if (req.user.role !== "super_admin" && req.user.role !== "patient" && bill.hospital_id !== req.user.hospitalId) {
      return res.status(403).json({ success: false, message: "Access denied. Bill belongs to another hospital facility." });
    }

    // Load line items
    const [items] = await pool.query(
      `SELECT bi.*, m.category, m.strength
       FROM pharmacy_bill_items bi
       LEFT JOIN master_medicines m ON m.id = bi.medicine_id
       WHERE bi.bill_id = ?
       ORDER BY bi.id ASC`,
      [bill.id]
    );

    // Load payment transactions
    const [payments] = await pool.query(
      `SELECT p.*, u.full_name AS collected_by_name
       FROM pharmacy_payments p
       LEFT JOIN users u ON u.id = p.collected_by
       WHERE p.bill_id = ?
       ORDER BY p.created_at DESC`,
      [bill.id]
    );

    // Load refunds
    const [refunds] = await pool.query(
      `SELECT r.*, u.full_name AS refunded_by_name
       FROM pharmacy_refunds r
       LEFT JOIN users u ON u.id = r.refunded_by
       WHERE r.bill_id = ?
       ORDER BY r.created_at DESC`,
      [bill.id]
    );

    bill.items = items;
    bill.payments = payments;
    bill.refunds = refunds;

    return res.json({ success: true, data: bill });
  } catch (error) {
    console.error("Get pharmacy bill error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to load pharmacy bill details." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.6 - 14.8: RECORD PAYMENT (CASH, UPI, CARD)
// -----------------------------------------------------------------------------
router.post("/bills/:id/payments", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can collect bill payments." });
    }

    const billId = parseInt(req.params.id, 10);
    const {
      amount: rawAmount,
      payment_method,
      payment_status = "completed",
      transaction_reference,
      card_network,
      card_last4,
      notes,
    } = req.body;

    const amount = parseFloat(rawAmount);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Payment amount must be a positive numeric value > 0." });
    }

    const validMethods = ["cash", "upi", "card"];
    if (!validMethods.includes(payment_method)) {
      return res.status(400).json({ success: false, message: `Invalid payment method. Supported methods: ${validMethods.join(", ")}` });
    }

    const validStatuses = ["completed", "pending", "failed"];
    if (!validStatuses.includes(payment_status)) {
      return res.status(400).json({ success: false, message: `Invalid payment status. Supported statuses: ${validStatuses.join(", ")}` });
    }

    // Security check: NEVER store raw full card numbers, CVVs, or PINs!
    if (req.body.card_number || req.body.cvv || req.body.pin || req.body.upi_pin) {
      return res.status(400).json({
        success: false,
        message: "Security violation: Storing raw card numbers, CVV, or PINs is strictly prohibited.",
      });
    }

    if (payment_method === "card" && card_last4) {
      if (!/^\d{4}$/.test(String(card_last4).trim())) {
        return res.status(400).json({ success: false, message: "card_last4 must be exactly 4 digits." });
      }
    }

    await connection.beginTransaction();

    // Lock bill record for update
    const [bills] = await connection.query(
      "SELECT id, bill_number, hospital_id, patient_id, grand_total, paid_amount, balance_due, status FROM pharmacy_bills WHERE id = ? FOR UPDATE",
      [billId]
    );

    if (bills.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Pharmacy bill not found." });
    }

    const bill = bills[0];

    // Hospital boundary check
    if (req.user.role !== "super_admin" && bill.hospital_id !== req.user.hospitalId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied. Bill belongs to another hospital facility." });
    }

    if (bill.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cannot collect payment on a cancelled bill." });
    }

    if (bill.status === "paid" && parseFloat(bill.balance_due) <= 0.001) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Bill is already fully paid." });
    }

    const currentBalanceDue = parseFloat(bill.balance_due);

    // Prevent overpayment unless explicitly supported
    if (amount > currentBalanceDue + 0.001) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${amount.toFixed(2)}) cannot exceed outstanding balance of ₹${currentBalanceDue.toFixed(2)}.`,
      });
    }

    const receiptNumber = generateReceiptNumber();

    // Insert payment record
    const [payRes] = await connection.query(
      `INSERT INTO pharmacy_payments
       (receipt_number, bill_id, hospital_id, patient_id, amount, payment_method, payment_status, transaction_reference, card_network, card_last4, notes, collected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNumber,
        bill.id,
        bill.hospital_id,
        bill.patient_id,
        amount.toFixed(2),
        payment_method,
        payment_status,
        transaction_reference ? transaction_reference.trim() : null,
        card_network ? card_network.trim() : null,
        card_last4 ? String(card_last4).trim() : null,
        notes ? notes.trim() : null,
        req.user.id,
      ]
    );

    const paymentId = payRes.insertId;

    // Lesson 14.7: If payment failed, DO NOT mark bill as paid, DO NOT update balance due
    if (payment_status === "failed") {
      await connection.commit();
      return res.status(200).json({
        success: false,
        message: "Payment attempt failed and was recorded. Bill balance remains unchanged.",
        data: {
          payment_id: paymentId,
          receipt_number: receiptNumber,
          bill_id: bill.id,
          amount: amount.toFixed(2),
          payment_status: "failed",
          outstanding_balance: currentBalanceDue.toFixed(2),
        },
      });
    }

    // If payment pending, record without altering settled balance
    if (payment_status === "pending") {
      await connection.commit();
      return res.status(201).json({
        success: true,
        message: "Payment recorded in pending status awaiting confirmation.",
        data: {
          payment_id: paymentId,
          receipt_number: receiptNumber,
          bill_id: bill.id,
          amount: amount.toFixed(2),
          payment_status: "pending",
          outstanding_balance: currentBalanceDue.toFixed(2),
        },
      });
    }

    // Completed payment: update settled amounts and bill status
    const newPaidAmount = Math.round((parseFloat(bill.paid_amount) + amount) * 100) / 100;
    const newBalanceDue = Math.max(0, Math.round((parseFloat(bill.grand_total) - newPaidAmount) * 100) / 100);
    const newBillStatus = newBalanceDue <= 0.001 ? "paid" : "partially_paid";

    await connection.query(
      "UPDATE pharmacy_bills SET paid_amount = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [newPaidAmount.toFixed(2), newBalanceDue.toFixed(2), newBillStatus, bill.id]
    );

    await connection.commit();

    await recordAudit(req.user.id, "pharmacy_payment_collected", "pharmacy_payments", paymentId, {
      bill_id: bill.id,
      receipt_number: receiptNumber,
      amount: amount.toFixed(2),
      payment_method,
      new_bill_status: newBillStatus,
      new_balance_due: newBalanceDue.toFixed(2),
    });

    return res.status(201).json({
      success: true,
      message: `Payment of ₹${amount.toFixed(2)} recorded successfully via ${payment_method.toUpperCase()}.`,
      data: {
        payment_id: paymentId,
        receipt_number: receiptNumber,
        bill_id: bill.id,
        amount: amount.toFixed(2),
        payment_method,
        payment_status: "completed",
        paid_amount: newPaidAmount.toFixed(2),
        balance_due: newBalanceDue.toFixed(2),
        bill_status: newBillStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Record payment error:", error);
    return res.status(500).json({ success: false, message: "Payment recording failed." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.7: PAYMENT REFUND WORKFLOW
// -----------------------------------------------------------------------------
router.post("/payments/:id/refund", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Permission denied. Only authorized pharmacy staff can issue refunds." });
    }

    const paymentId = parseInt(req.params.id, 10);
    const { refund_amount: rawRefundAmt, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: "A valid audit reason is required for issuing a refund." });
    }

    await connection.beginTransaction();

    const [payments] = await connection.query(
      "SELECT id, receipt_number, bill_id, hospital_id, patient_id, amount, payment_status FROM pharmacy_payments WHERE id = ? FOR UPDATE",
      [paymentId]
    );

    if (payments.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Payment transaction not found." });
    }

    const payment = payments[0];

    if (payment.payment_status !== "completed") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Cannot refund a payment with status '${payment.payment_status}'. Only completed payments can be refunded.` });
    }

    const paymentAmount = parseFloat(payment.amount);
    const refundAmount = rawRefundAmt ? parseFloat(rawRefundAmt) : paymentAmount;

    if (isNaN(refundAmount) || refundAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Refund amount must be a positive numeric value > 0." });
    }

    if (refundAmount > paymentAmount) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Refund amount (₹${refundAmount.toFixed(2)}) cannot exceed the original payment amount of ₹${paymentAmount.toFixed(2)}.`,
      });
    }

    // Lock bill
    const [bills] = await connection.query(
      "SELECT id, grand_total, paid_amount, balance_due, status FROM pharmacy_bills WHERE id = ? FOR UPDATE",
      [payment.bill_id]
    );
    const bill = bills[0];

    const currentPaid = parseFloat(bill.paid_amount);
    const newPaidAmount = Math.max(0, Math.round((currentPaid - refundAmount) * 100) / 100);
    const newBalanceDue = Math.round((parseFloat(bill.grand_total) - newPaidAmount) * 100) / 100;
    const newBillStatus = newPaidAmount <= 0.001 ? "refunded" : "partially_paid";

    const refundNumber = generateRefundNumber();

    // Insert refund record
    const [refRes] = await connection.query(
      `INSERT INTO pharmacy_refunds
       (refund_number, payment_id, bill_id, hospital_id, patient_id, refund_amount, reason, status, refunded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        refundNumber,
        payment.id,
        bill.id,
        payment.hospital_id,
        payment.patient_id,
        refundAmount.toFixed(2),
        reason.trim(),
        req.user.id,
      ]
    );

    // Update original payment status to 'refunded' (Preserving the original payment history)
    await connection.query("UPDATE pharmacy_payments SET payment_status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [payment.id]);

    // Update bill amounts
    await connection.query(
      "UPDATE pharmacy_bills SET paid_amount = ?, balance_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [newPaidAmount.toFixed(2), newBalanceDue.toFixed(2), newBillStatus, bill.id]
    );

    await connection.commit();

    await recordAudit(req.user.id, "pharmacy_payment_refunded", "pharmacy_refunds", refRes.insertId, {
      refund_number: refundNumber,
      payment_id: payment.id,
      bill_id: bill.id,
      refund_amount: refundAmount.toFixed(2),
      reason: reason.trim(),
    });

    return res.status(200).json({
      success: true,
      message: `Refund of ₹${refundAmount.toFixed(2)} processed successfully.`,
      data: {
        refund_id: refRes.insertId,
        refund_number: refundNumber,
        payment_id: payment.id,
        refund_amount: refundAmount.toFixed(2),
        new_paid_amount: newPaidAmount.toFixed(2),
        new_balance_due: newBalanceDue.toFixed(2),
        bill_status: newBillStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Refund error:", error);
    return res.status(500).json({ success: false, message: "Failed to process refund." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.9: INVOICE GENERATION & PRINT PAYLOAD
// -----------------------------------------------------------------------------
router.get("/bills/:id/invoice", requireAuth, async (req, res) => {
  try {
    const rawParam = req.params.id;
    if (!rawParam) {
      return res.status(400).json({ success: false, message: "Valid bill identifier is required." });
    }
    const isNumericId = !isNaN(parseInt(rawParam, 10)) && /^\d+$/.test(String(rawParam).trim());

    const [bills] = await pool.query(
      `SELECT b.*,
              u.full_name AS patient_name,
              u.email AS patient_email,
              u.phone AS patient_phone,
              pr.prescription_number,
              doc.full_name AS doctor_name,
              h.name AS hospital_name,
              h.address AS hospital_address,
              h.phone AS hospital_phone,
              h.email AS hospital_email,
              cb.full_name AS pharmacist_name
       FROM pharmacy_bills b
       LEFT JOIN users u ON u.id = b.patient_id
       LEFT JOIN hospitals h ON h.id = b.hospital_id
       LEFT JOIN users cb ON cb.id = b.created_by
       LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
       LEFT JOIN users doc ON doc.id = pr.doctor_id
       WHERE ${isNumericId ? "(b.id = ? OR b.bill_number = ?)" : "b.bill_number = ?"}`,
      isNumericId ? [parseInt(rawParam, 10), String(rawParam).trim()] : [String(rawParam).trim()]
    );

    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Pharmacy bill not found." });
    }

    const bill = bills[0];

    // Role check
    if (req.user.role === "patient" && bill.patient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const [items] = await pool.query(
      `SELECT bi.*, m.strength
       FROM pharmacy_bill_items bi
       LEFT JOIN master_medicines m ON m.id = bi.medicine_id
       WHERE bi.bill_id = ?
       ORDER BY bi.id ASC`,
      [bill.id]
    );

    const [payments] = await pool.query(
      `SELECT p.receipt_number, p.amount, p.payment_method, p.payment_status, p.transaction_reference, p.created_at
       FROM pharmacy_payments p
       WHERE p.bill_id = ?
       ORDER BY p.created_at ASC`,
      [bill.id]
    );

    const [refunds] = await pool.query(
      `SELECT r.refund_number, r.refund_amount, r.reason, r.created_at
       FROM pharmacy_refunds r
       WHERE r.bill_id = ?
       ORDER BY r.created_at ASC`,
      [bill.id]
    );

    return res.json({
      success: true,
      data: {
        id: bill.id,
        bill_id: bill.id,
        invoice_number: bill.bill_number,
        invoice_date: bill.created_at,
        hospital: {
          name: bill.hospital_name || bill.external_pharmacy_name || "HealthMesh Pharmacy",
          address: bill.hospital_address || "Clinical Facility",
          phone: bill.hospital_phone || "N/A",
          email: bill.hospital_email || "pharmacy@healthmesh.internal",
        },
        patient: {
          id: bill.patient_id,
          name: bill.patient_name || `Patient #${bill.patient_id}`,
          email: bill.patient_email || "",
          phone: bill.patient_phone || "",
        },
        prescription: {
          number: bill.prescription_number || "Direct OTC / Non-Rx",
          doctor_name: bill.doctor_name || "N/A",
        },
        items: items.map((it) => ({
          name: it.medicine_name,
          sku: it.sku,
          dosage_form: it.dosage_form,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent,
          discount_amount: it.discount_amount,
          taxable_amount: it.taxable_amount,
          gst_rate: it.gst_rate,
          gst_amount: it.gst_amount,
          line_total: it.line_total,
        })),
        financials: {
          subtotal: bill.subtotal,
          discount_amount: bill.discount_amount,
          taxable_amount: bill.taxable_amount,
          gst_rate: bill.gst_rate,
          gst_amount: bill.gst_amount,
          grand_total: bill.grand_total,
          paid_amount: bill.paid_amount,
          balance_due: bill.balance_due,
          status: bill.status,
        },
        payments,
        refunds,
        pharmacist_name: bill.pharmacist_name,
      },
    });
  } catch (error) {
    console.error("Get invoice error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to generate invoice." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.9: EMAIL INVOICE DISPATCH
// -----------------------------------------------------------------------------
router.post("/bills/:id/email-invoice", requireAuth, async (req, res) => {
  try {
    const rawParam = req.params.id;
    if (!rawParam) {
      return res.status(400).json({ success: false, message: "Valid bill identifier is required." });
    }
    const isNumericId = !isNaN(parseInt(rawParam, 10)) && /^\d+$/.test(String(rawParam).trim());

    const [bills] = await pool.query(
      `SELECT b.*,
              u.full_name AS patient_name,
              u.email AS patient_email,
              h.name AS hospital_name,
              h.phone AS hospital_phone
       FROM pharmacy_bills b
       LEFT JOIN users u ON u.id = b.patient_id
       LEFT JOIN hospitals h ON h.id = b.hospital_id
       WHERE ${isNumericId ? "(b.id = ? OR b.bill_number = ?)" : "b.bill_number = ?"}`,
      isNumericId ? [parseInt(rawParam, 10), String(rawParam).trim()] : [String(rawParam).trim()]
    );

    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Pharmacy bill not found." });
    }

    const bill = bills[0];
    const targetEmail = req.body.email || bill.patient_email;

    if (!targetEmail || !targetEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid recipient email address is required." });
    }

    const [items] = await pool.query(
      "SELECT medicine_name, quantity, unit_price, line_total FROM pharmacy_bill_items WHERE bill_id = ?",
      [bill.id]
    );

    const hospitalDisplayName = bill.hospital_name || bill.external_pharmacy_name || "HealthMesh Pharmacy";
    const patientDisplayName = bill.patient_name || `Patient #${bill.patient_id}`;

    const itemsHtml = items.map((it) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${it.medicine_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${parseFloat(it.unit_price).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${parseFloat(it.line_total).toFixed(2)}</td>
      </tr>
    `).join("");

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 15px;">
          <h2 style="color: #0f172a; margin: 0;">${hospitalDisplayName} — Pharmacy Tax Invoice</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Invoice #: <strong>${bill.bill_number}</strong></p>
        </div>
        <p style="font-size: 14px; color: #334155;">Dear <strong>${patientDisplayName}</strong>,</p>
        <p style="font-size: 13px; color: #475569;">Thank you for your visit. Below is your official tax invoice itemizing your prescribed medications including statutory 12% GST.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin: 15px 0;">
          <thead>
            <tr style="background-color: #f8fafc; color: #475569; text-transform: uppercase;">
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #cbd5e1;">Medication</th>
              <th style="padding: 8px; text-align: center; border-bottom: 1px solid #cbd5e1;">Qty</th>
              <th style="padding: 8px; text-align: right; border-bottom: 1px solid #cbd5e1;">Price</th>
              <th style="padding: 8px; text-align: right; border-bottom: 1px solid #cbd5e1;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="background-color: #f8fafc; border-radius: 6px; padding: 12px; margin-top: 15px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Subtotal:</span><strong>₹${parseFloat(bill.subtotal).toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Discount:</span><span style="color: #059669;">- ₹${parseFloat(bill.discount_amount).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Taxable Amount:</span><strong>₹${parseFloat(bill.taxable_amount).toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #0284c7;">
            <span>Statutory GST (12%):</span><strong>+ ₹${parseFloat(bill.gst_amount).toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 15px; font-weight: bold; color: #0f172a;">
            <span>Grand Total:</span><span>₹${parseFloat(bill.grand_total).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span>Amount Paid:</span><span style="color: #059669; font-weight: bold;">₹${parseFloat(bill.paid_amount).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span>Outstanding Balance:</span><span style="color: #dc2626; font-weight: bold;">₹${parseFloat(bill.balance_due).toFixed(2)}</span>
          </div>
        </div>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">
          This is an official computer-generated clinical tax invoice from ${hospitalDisplayName}.
        </p>
      </div>
    `;

    // Non-blocking dispatch
    try {
      await sendEmail({
        to: targetEmail,
        subject: `Pharmacy Tax Invoice ${bill.bill_number} — ${hospitalDisplayName}`,
        text: `Your pharmacy invoice ${bill.bill_number} for ₹${parseFloat(bill.grand_total).toFixed(2)} has been issued by ${hospitalDisplayName}.`,
        html: emailHtml,
      });
    } catch (mailErr) {
      console.warn("Invoice email delivery warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: `Tax invoice ${bill.bill_number} sent to ${targetEmail}.`,
    });
  } catch (error) {
    console.error("Email invoice error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to dispatch invoice email." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.9: EMAIL PAYMENT RECEIPT DISPATCH
// -----------------------------------------------------------------------------
router.post("/payments/:id/email-receipt", requireAuth, async (req, res) => {
  try {
    const rawParam = req.params.id;
    if (!rawParam) {
      return res.status(400).json({ success: false, message: "Valid payment identifier is required." });
    }
    const isNumericId = !isNaN(parseInt(rawParam, 10)) && /^\d+$/.test(String(rawParam).trim());

    const [payments] = await pool.query(
      `SELECT p.*,
              b.bill_number,
              b.grand_total,
              b.balance_due,
              u.full_name AS patient_name,
              u.email AS patient_email,
              h.name AS hospital_name
       FROM pharmacy_payments p
       LEFT JOIN pharmacy_bills b ON b.id = p.bill_id
       LEFT JOIN users u ON u.id = p.patient_id
       LEFT JOIN hospitals h ON h.id = p.hospital_id
       WHERE ${isNumericId ? "(p.id = ? OR p.receipt_number = ?)" : "p.receipt_number = ?"}`,
      isNumericId ? [parseInt(rawParam, 10), String(rawParam).trim()] : [String(rawParam).trim()]
    );

    if (payments.length === 0) {
      return res.status(404).json({ success: false, message: "Payment transaction not found." });
    }

    const payment = payments[0];
    const targetEmail = req.body.email || payment.patient_email;

    if (!targetEmail || !targetEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid recipient email address is required." });
    }

    const hospitalDisplayName = payment.hospital_name || "HealthMesh Hospital";
    const patientDisplayName = payment.patient_name || `Patient #${payment.patient_id}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 550px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px;">
          <h2 style="color: #0f172a; margin: 0;">Official Payment Receipt</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Receipt #: <strong>${payment.receipt_number}</strong></p>
        </div>
        <p style="font-size: 14px; color: #334155;">Received with thanks from <strong>${payment.patient_name}</strong>:</p>
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 15px; text-align: center; margin: 15px 0;">
          <div style="font-size: 12px; color: #047857; text-transform: uppercase; font-weight: bold;">Amount Received</div>
          <div style="font-size: 26px; font-weight: bold; color: #065f46; margin: 5px 0;">₹${parseFloat(payment.amount).toFixed(2)}</div>
          <div style="font-size: 12px; color: #047857;">Mode: <strong>${payment.payment_method.toUpperCase()}</strong></div>
        </div>
        <table style="width: 100%; font-size: 13px; color: #475569; border-collapse: collapse; margin-top: 10px;">
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Associated Bill #:</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold;">${payment.bill_number}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Payment Date:</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right;">${new Date(payment.created_at).toLocaleString()}</td>
          </tr>
          ${payment.transaction_reference ? `
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Transaction Reference:</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-mono font-bold;">${payment.transaction_reference}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Remaining Balance:</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; text-align: right; color: #dc2626; font-weight: bold;">₹${parseFloat(payment.balance_due).toFixed(2)}</td>
          </tr>
        </table>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">
          Issued by ${payment.hospital_name}. Keep this receipt for your personal clinical & insurance records.
        </p>
      </div>
    `;

    try {
      await sendEmail({
        to: targetEmail,
        subject: `Payment Receipt ${payment.receipt_number} — ${payment.hospital_name}`,
        text: `Your payment of ₹${parseFloat(payment.amount).toFixed(2)} has been recorded against bill ${payment.bill_number}. Receipt #${payment.receipt_number}.`,
        html: emailHtml,
      });
    } catch (mailErr) {
      console.warn("Receipt email warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: `Payment receipt ${payment.receipt_number} sent to ${targetEmail}.`,
    });
  } catch (error) {
    console.error("Email receipt error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to dispatch receipt email." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 14.11: HOSPITAL VS OUTSIDE PHARMACY PURCHASE WORKFLOW
// -----------------------------------------------------------------------------
router.post("/outside-purchases", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isPharmacistAuthorized(req) && req.user.role !== "doctor" && req.user.role !== "patient") {
      return res.status(403).json({ success: false, message: "Permission denied to record external pharmacy purchases." });
    }

    const {
      patient_id: rawPatientId,
      prescription_id,
      external_pharmacy_name,
      external_bill_number,
      items,
      notes,
    } = req.body;

    const patientId = req.user.role === "patient" ? req.user.id : parseInt(rawPatientId, 10);

    if (!patientId || isNaN(patientId)) {
      return res.status(400).json({ success: false, message: "A valid numerical Patient ID is required." });
    }

    // Verify patient exists in database to avoid foreign key violation
    const [patientCheck] = await pool.query(
      "SELECT id, full_name, hospital_id FROM users WHERE id = ?",
      [patientId]
    );

    if (patientCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Patient with ID ${patientId} was not found in the system. Please verify the Patient ID.`,
      });
    }

    if (!external_pharmacy_name || !external_pharmacy_name.trim()) {
      return res.status(400).json({ success: false, message: "External pharmacy or chemist store name is required." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one purchased medication item must be recorded." });
    }

    const targetHospitalId = req.user.role === "patient"
      ? (patientCheck[0].hospital_id || 1)
      : (req.user.hospitalId || patientCheck[0].hospital_id || 1);

    await connection.beginTransaction();

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const name = item.medicine_name ? item.medicine_name.trim() : "";
      const qty = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(item.unit_price || 0);

      if (!name || isNaN(qty) || qty <= 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Each purchased item must have a valid medicine_name and quantity > 0." });
      }

      const lineTotal = Math.round(qty * unitPrice * 100) / 100;
      subtotal += lineTotal;

      validatedItems.push({
        medicine_name: name,
        dosage_form: item.dosage_form || null,
        quantity: qty,
        unit_price: unitPrice,
        discount_percent: 0.00,
        discount_amount: 0.00,
        taxable_amount: lineTotal,
        gst_rate: 12.00,
        gst_amount: Math.round(lineTotal * 0.12 * 100) / 100,
        line_total: lineTotal,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const gstAmount = Math.round(subtotal * 0.12 * 100) / 100;
    const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100;

    const billNumber = `OUT-${generateBillNumber()}`;

    // LESSON 14.11 CRITICAL RULE:
    // Insert with purchase_type = 'outside'.
    // DO NOT deduct any hospital inventory stock!
    // DO NOT generate hospital pharmacy sale revenue!
    const [billRes] = await connection.query(
      `INSERT INTO pharmacy_bills
       (bill_number, hospital_id, patient_id, prescription_id, purchase_type, external_pharmacy_name, external_bill_number, subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status, notes, created_by)
       VALUES (?, ?, ?, ?, 'outside', ?, ?, ?, 0.00, ?, 12.00, ?, ?, ?, 0.00, 'paid', ?, ?)`,
      [
        billNumber,
        targetHospitalId,
        patientId,
        prescription_id ? parseInt(prescription_id, 10) : null,
        external_pharmacy_name.trim(),
        external_bill_number ? external_bill_number.trim() : null,
        subtotal.toFixed(2),
        subtotal.toFixed(2),
        gstAmount.toFixed(2),
        grandTotal.toFixed(2),
        grandTotal.toFixed(2), // Already settled outside
        notes ? notes.trim() : null,
        req.user.id,
      ]
    );

    const billId = billRes.insertId;

    for (const item of validatedItems) {
      await connection.query(
        `INSERT INTO pharmacy_bill_items
         (bill_id, medicine_name, dosage_form, quantity, unit_price, discount_percent, discount_amount, taxable_amount, gst_rate, gst_amount, line_total)
         VALUES (?, ?, ?, ?, ?, 0.00, 0.00, ?, 12.00, ?, ?)`,
        [
          billId,
          item.medicine_name,
          item.dosage_form,
          item.quantity,
          item.unit_price.toFixed(2),
          item.taxable_amount.toFixed(2),
          item.gst_amount.toFixed(2),
          item.line_total.toFixed(2),
        ]
      );
    }

    await connection.commit();

    await recordAudit(req.user.id, "outside_pharmacy_purchase_recorded", "pharmacy_bills", billId, {
      bill_number: billNumber,
      external_pharmacy_name: external_pharmacy_name.trim(),
      patient_id: patientId,
      grand_total: grandTotal.toFixed(2),
      stock_deducted: false, // Verification flag: zero hospital inventory touched
    });

    return res.status(201).json({
      success: true,
      message: "Outside pharmacy purchase recorded successfully. Zero hospital inventory deducted.",
      data: {
        id: billId,
        bill_number: billNumber,
        purchase_type: "outside",
        external_pharmacy_name: external_pharmacy_name.trim(),
        external_bill_number: external_bill_number || null,
        grand_total: grandTotal.toFixed(2),
        items: validatedItems,
        stock_deducted: false,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Outside purchase error:", error);
    return res.status(500).json({
      success: false,
      message: error.sqlMessage || error.message || "Failed to record outside pharmacy purchase.",
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
