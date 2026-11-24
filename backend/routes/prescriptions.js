const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

/**
 * Role authorization helpers
 */
function isClinicalDoctor(req) {
  return req.user && (req.user.role === "doctor" || req.user.role === "super_admin");
}

function isPharmacyAuthorized(req) {
  if (!req.user) return false;
  const role = req.user.role;
  return role === "super_admin" || role === "hospital_admin" || role === "staff";
}

async function isPharmacistWithPermission(req) {
  if (!req.user) return false;
  const role = req.user.role;
  if (role === "super_admin" || role === "hospital_admin") return true;
  if (role !== "staff") return false;
  try {
    const [rows] = await pool.query(
      "SELECT permissions FROM staff_profiles WHERE user_id = ?",
      [req.user.id]
    );
    if (rows.length === 0) return true;
    let perms = rows[0].permissions;
    if (typeof perms === "string") {
      try { perms = JSON.parse(perms); } catch (_) { perms = []; }
    }
    if (Array.isArray(perms) && perms.length > 0) {
      return perms.includes("prescription_dispense") || perms.includes("all") || perms.includes("pharmacy_inventory");
    }
    return true;
  } catch (_) {
    return true;
  }
}

function isGeneralAuthorized(req) {
  return !!req.user;
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
    console.warn("Audit log warning in prescriptions:", err.message);
  }
}

/**
 * Record prescription status history helper
 */
async function recordStatusHistory(connection, prescriptionId, fromStatus, toStatus, changedBy, reason = null) {
  await connection.query(
    `INSERT INTO prescription_status_history (prescription_id, from_status, to_status, changed_by, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [prescriptionId, fromStatus, toStatus, changedBy, reason]
  );
}

/**
 * ============================================================================
 * LESSON 13.3: MEDICINE SELECTION FROM EXISTING INVENTORY
 * GET /api/prescriptions/medicines/eligible
 * ============================================================================
 */
router.get("/medicines/eligible", requireAuth, async (req, res) => {
  try {
    const { search, hospital_id } = req.query;
    const clean = (val) => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      return (!s || s === "undefined" || s === "null") ? null : s;
    };
    const sSearch = clean(search);
    const sHospitalId = clean(hospital_id);
    const targetHospitalId = req.user.role === "super_admin"
      ? (sHospitalId && !isNaN(parseInt(sHospitalId, 10)) ? parseInt(sHospitalId, 10) : (req.user.hospitalId || 1))
      : req.user.hospitalId;

    if (!targetHospitalId) {
      return res.status(400).json({ success: false, message: "Hospital identifier is required." });
    }

    let query = `
      SELECT 
        m.id,
        m.sku,
        m.name,
        m.generic_name,
        m.form,
        m.strength,
        m.category,
        m.category_id,
        m.sale_price,
        m.status AS catalog_status,
        COALESCE(hm.sale_price, m.sale_price) AS hospital_sale_price,
        COALESCE(hm.status, 'active') AS hospital_status,
        COALESCE(
          (SELECT SUM(current_quantity) 
           FROM medicine_batches mb 
           WHERE mb.medicine_id = m.id 
             AND mb.hospital_id = ? 
             AND mb.status = 'active' 
             AND mb.expiry_date >= CURDATE()
          ), 0
        ) AS available_non_expired_stock,
        COALESCE(
          (SELECT COUNT(*) 
           FROM medicine_batches mb 
           WHERE mb.medicine_id = m.id 
             AND mb.hospital_id = ? 
             AND mb.status = 'active' 
             AND mb.expiry_date >= CURDATE() 
             AND mb.current_quantity > 0
          ), 0
        ) AS active_batch_count
      FROM master_medicines m
      LEFT JOIN hospital_medicines hm ON hm.master_medicine_id = m.id AND hm.hospital_id = ?
      WHERE m.status = 'active'
        AND (hm.status IS NULL OR hm.status = 'active')
    `;

    const params = [targetHospitalId, targetHospitalId, targetHospitalId];

    if (sSearch) {
      const term = `%${sSearch}%`;
      query += ` AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.sku LIKE ?)`;
      params.push(term, term, term);
    }

    query += ` ORDER BY m.name ASC LIMIT 100`;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch eligible medicines error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve eligible medicines." });
  }
});

/**
 * ============================================================================
 * LESSON 13.6 & 13.7: DYNAMIC PRESCRIPTION LISTING, SEARCH & FILTERS
 * GET /api/prescriptions
 * ============================================================================
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const {
      search,
      status,
      from_date,
      to_date,
      doctor_id,
      patient_id,
      consultation_id,
      hospital_id,
      page = 1,
      limit = 20,
    } = req.query;

    const cleanStr = (val) => {
      if (val === undefined || val === null) return null;
      const s = String(val).trim();
      return (!s || s === "undefined" || s === "null") ? null : s;
    };

    const sSearch = cleanStr(search);
    const sStatus = cleanStr(status);
    const sFromDate = cleanStr(from_date);
    const sToDate = cleanStr(to_date);
    const sDoctorId = cleanStr(doctor_id);
    const sPatientId = cleanStr(patient_id);
    const sConsultationId = cleanStr(consultation_id);
    const sHospitalId = cleanStr(hospital_id);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Hospital Isolation enforcement
    let targetHospitalId = null;
    if (req.user.role === "super_admin") {
      targetHospitalId = sHospitalId && !isNaN(parseInt(sHospitalId, 10)) ? parseInt(sHospitalId, 10) : null;
    } else {
      targetHospitalId = req.user.hospitalId;
    }

    // Role-based patient visibility: Patient can only view their own
    let targetPatientId = sPatientId && !isNaN(parseInt(sPatientId, 10)) ? parseInt(sPatientId, 10) : null;
    if (req.user.role === "patient") {
      targetPatientId = req.user.id;
    }

    // Validate date format and ranges
    if (sFromDate && isNaN(Date.parse(sFromDate))) {
      return res.status(400).json({ success: false, message: "Invalid from_date format. Please use YYYY-MM-DD." });
    }
    if (sToDate && isNaN(Date.parse(sToDate))) {
      return res.status(400).json({ success: false, message: "Invalid to_date format. Please use YYYY-MM-DD." });
    }
    if (sFromDate && sToDate && new Date(sFromDate) > new Date(sToDate)) {
      return res.status(400).json({ success: false, message: "from_date cannot be greater than to_date." });
    }

    let whereClause = "WHERE 1=1";
    const params = [];

    if (targetHospitalId) {
      whereClause += " AND p.hospital_id = ?";
      params.push(targetHospitalId);
    }

    if (targetPatientId) {
      whereClause += " AND p.patient_id = ?";
      params.push(targetPatientId);
    }

    if (sDoctorId && !isNaN(parseInt(sDoctorId, 10))) {
      whereClause += " AND p.doctor_id = ?";
      params.push(parseInt(sDoctorId, 10));
    }

    if (sConsultationId && !isNaN(parseInt(sConsultationId, 10))) {
      whereClause += " AND p.consultation_id = ?";
      params.push(parseInt(sConsultationId, 10));
    }

    // Status filter (single or comma-separated)
    if (sStatus && sStatus !== "all") {
      const statuses = sStatus.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const validStatuses = ["draft", "active", "partially_dispensed", "dispensed", "cancelled"];
      const allowed = statuses.filter((s) => validStatuses.includes(s));
      if (allowed.length > 0) {
        whereClause += ` AND p.status IN (${allowed.map(() => "?").join(",")})`;
        params.push(...allowed);
      }
    }

    // Date filters
    if (sFromDate) {
      whereClause += " AND DATE(p.created_at) >= ?";
      params.push(sFromDate);
    }
    if (sToDate) {
      whereClause += " AND DATE(p.created_at) <= ?";
      params.push(sToDate);
    }

    // Search filter across prescription_number, patient name, patient email, doctor name, medicine_name
    if (sSearch) {
      const term = `%${sSearch}%`;
      whereClause += ` AND (
        p.prescription_number LIKE ? 
        OR u_pat.full_name LIKE ? 
        OR u_pat.email LIKE ? 
        OR u_doc.full_name LIKE ? 
        OR EXISTS (
          SELECT 1 FROM prescription_items pi 
          WHERE pi.prescription_id = p.id AND pi.medicine_name LIKE ?
        )
      )`;
      params.push(term, term, term, term, term);
    }

    // Count query
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM prescriptions p
      JOIN users u_pat ON u_pat.id = p.patient_id
      JOIN users u_doc ON u_doc.id = p.doctor_id
      JOIN hospitals h ON h.id = p.hospital_id
      ${whereClause}
    `;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0]?.total || 0;

    // Data query
    const dataQuery = `
      SELECT 
        p.id,
        p.prescription_number,
        p.consultation_id,
        p.appointment_id,
        p.patient_id,
        p.doctor_id,
        p.hospital_id,
        p.general_instructions,
        p.status,
        p.created_at,
        p.updated_at,
        u_pat.full_name AS patient_name,
        u_pat.email AS patient_email,
        u_pat.phone AS patient_phone,
        u_doc.full_name AS doctor_name,
        h.name AS hospital_name,
        c.status AS consultation_status,
        (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = p.id) AS total_items,
        (SELECT COALESCE(SUM(quantity), 0) FROM prescription_items WHERE prescription_id = p.id) AS total_prescribed_units,
        (SELECT COALESCE(SUM(dispensed_quantity), 0) FROM prescription_items WHERE prescription_id = p.id) AS total_dispensed_units,
        (SELECT COUNT(*) FROM pharmacy_dispensations WHERE prescription_id = p.id) AS dispensation_count
      FROM prescriptions p
      JOIN users u_pat ON u_pat.id = p.patient_id
      JOIN users u_doc ON u_doc.id = p.doctor_id
      JOIN hospitals h ON h.id = p.hospital_id
      JOIN consultations c ON c.id = p.consultation_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limitNum, offset];
    const [rows] = await pool.query(dataQuery, queryParams);

    // Fetch items for listed prescriptions
    if (rows.length > 0) {
      const rxIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT 
          pi.*,
          m.sku AS medicine_sku,
          m.generic_name,
          (pi.quantity - pi.dispensed_quantity) AS remaining_quantity
         FROM prescription_items pi
         LEFT JOIN master_medicines m ON m.id = pi.medicine_id
         WHERE pi.prescription_id IN (?)
         ORDER BY pi.id ASC`,
        [rxIds]
      );

      const itemsByRx = {};
      for (const it of items) {
        if (!itemsByRx[it.prescription_id]) itemsByRx[it.prescription_id] = [];
        itemsByRx[it.prescription_id].push(it);
      }

      for (const r of rows) {
        r.items = itemsByRx[r.id] || [];
      }
    }

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        total_pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("Prescriptions listing error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve prescriptions." });
  }
});

/**
 * ============================================================================
 * LESSON 13.1, 13.2, 13.4: PRESCRIPTION CREATION (STANDALONE / CONSULTATION)
 * POST /api/prescriptions
 * ============================================================================
 */
router.post("/", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isClinicalDoctor(req) && req.user.role !== "hospital_admin") {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only authorized medical staff can create prescriptions.",
      });
    }

    const {
      consultation_id,
      general_instructions,
      items,
      status = "active", // 'draft' or 'active'
      idempotency_key,
    } = req.body;

    if (!consultation_id || isNaN(Number(consultation_id))) {
      return res.status(400).json({ success: false, message: "A valid consultation_id is required." });
    }

    const consultationId = Number(consultation_id);

    // Validate Consultation, Patient, Doctor, Hospital relationships
    const [cRows] = await connection.query(
      `SELECT c.*, a.status AS appointment_status
       FROM consultations c
       JOIN appointments a ON a.id = c.appointment_id
       WHERE c.id = ?`,
      [consultationId]
    );

    if (cRows.length === 0) {
      return res.status(404).json({ success: false, message: "Consultation not found." });
    }

    const consultation = cRows[0];

    // Hospital Isolation Verification
    if (req.user.role !== "super_admin" && req.user.hospitalId !== consultation.hospital_id) {
      return res.status(403).json({
        success: false,
        message: "Cross-hospital data access denied. You are not authorized for this facility.",
      });
    }

    // Doctor Authorization: Attending doctor or authorized hospital staff
    if (req.user.role === "doctor" && req.user.id !== consultation.doctor_id) {
      return res.status(403).json({
        success: false,
        message: "You are not the designated attending doctor for this consultation.",
      });
    }

    // Validate items structure (at least one item required unless saving draft with empty items)
    const normalizedStatus = status === "draft" ? "draft" : "active";
    if (normalizedStatus === "active" && (!Array.isArray(items) || items.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "At least one medication item is required to finalize an active prescription.",
      });
    }

    // Validate items fields & detect duplicates
    const validatedItems = [];
    const seenMeds = new Set();

    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const medName = (item.medicine_name || "").trim();
        if (!medName) {
          return res.status(400).json({
            success: false,
            message: `Medication item #${i + 1} must have a valid medicine name.`,
          });
        }

        const medKey = medName.toLowerCase();
        if (seenMeds.has(medKey)) {
          return res.status(400).json({
            success: false,
            message: `Duplicate medication '${medName}' detected. Combine doses into a single item line.`,
          });
        }
        seenMeds.add(medKey);

        const qty = item.quantity !== undefined && item.quantity !== null && item.quantity !== ""
          ? parseInt(item.quantity, 10)
          : null;

        if (qty !== null && (isNaN(qty) || qty <= 0)) {
          return res.status(400).json({
            success: false,
            message: `Quantity for '${medName}' must be a positive integer greater than zero.`,
          });
        }

        const validTiming = ["before_food", "after_food", "with_food", "anytime"];
        const timing = validTiming.includes(item.timing) ? item.timing : "after_food";

        // Validate medicine existence in master_medicines if provided
        let resolvedMedId = item.medicine_id ? parseInt(item.medicine_id, 10) : null;
        if (resolvedMedId) {
          const [mCheck] = await connection.query("SELECT id, name, status FROM master_medicines WHERE id = ?", [resolvedMedId]);
          if (mCheck.length === 0) {
            return res.status(400).json({ success: false, message: `Selected medicine ID ${resolvedMedId} does not exist.` });
          }
          if (mCheck[0].status === "inactive") {
            return res.status(400).json({ success: false, message: `Medicine '${mCheck[0].name}' is inactive and cannot be prescribed.` });
          }
        } else {
          // Attempt resolving by name
          const [mCheckName] = await connection.query(
            "SELECT id FROM master_medicines WHERE LOWER(TRIM(name)) = ? AND status = 'active' LIMIT 1",
            [medKey]
          );
          if (mCheckName.length > 0) {
            resolvedMedId = mCheckName[0].id;
          }
        }

        validatedItems.push({
          medicine_id: resolvedMedId,
          medicine_name: medName,
          dosage: (item.dosage || "As directed").trim(),
          form: (item.form || "Tablet").trim(),
          frequency: (item.frequency || "1-0-1").trim(),
          duration: (item.duration || "5 Days").trim(),
          timing,
          quantity: qty,
          instructions: item.instructions ? item.instructions.trim() : null,
        });
      }
    }

    await connection.beginTransaction();

    // Check if prescription already exists for this consultation (Idempotency / Single Rx rule)
    const [existing] = await connection.query(
      "SELECT id, prescription_number, status FROM prescriptions WHERE consultation_id = ? FOR UPDATE",
      [consultationId]
    );

    let prescriptionId;
    let prescriptionNumber;
    let previousStatus = null;

    if (existing.length > 0) {
      // Existing prescription: If draft, update it. If active/dispensed/cancelled, cannot blindly overwrite
      const currentRx = existing[0];
      if (currentRx.status === "cancelled") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot overwrite a cancelled prescription. Create a replacement consultation.",
        });
      }
      if (currentRx.status === "dispensed" || currentRx.status === "partially_dispensed") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Prescription #${currentRx.prescription_number} is already ${currentRx.status}. Modifications must be done through pharmacy return/amendment.`,
        });
      }

      prescriptionId = currentRx.id;
      prescriptionNumber = currentRx.prescription_number;
      previousStatus = currentRx.status;

      await connection.query(
        `UPDATE prescriptions 
         SET general_instructions = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [general_instructions || null, normalizedStatus, prescriptionId]
      );

      // Replace items safely
      await connection.query("DELETE FROM prescription_items WHERE prescription_id = ?", [prescriptionId]);
    } else {
      prescriptionNumber = `RX-${Date.now().toString().slice(-6)}-${consultationId}`;
      const [insertRes] = await connection.query(
        `INSERT INTO prescriptions 
         (consultation_id, appointment_id, patient_id, doctor_id, hospital_id, prescription_number, general_instructions, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consultationId,
          consultation.appointment_id,
          consultation.patient_id,
          consultation.doctor_id,
          consultation.hospital_id,
          prescriptionNumber,
          general_instructions || null,
          normalizedStatus,
        ]
      );
      prescriptionId = insertRes.insertId;
      previousStatus = null;
    }

    // Insert items
    for (const it of validatedItems) {
      await connection.query(
        `INSERT INTO prescription_items 
         (prescription_id, medicine_id, medicine_name, dosage, form, frequency, duration, timing, quantity, instructions, dispensed_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          prescriptionId,
          it.medicine_id,
          it.medicine_name,
          it.dosage,
          it.form,
          it.frequency,
          it.duration,
          it.timing,
          it.quantity,
          it.instructions,
        ]
      );
    }

    // Record status history if new or status transitioned
    if (!previousStatus || previousStatus !== normalizedStatus) {
      await recordStatusHistory(
        connection,
        prescriptionId,
        previousStatus,
        normalizedStatus,
        req.user.id,
        normalizedStatus === "draft" ? "Prescription saved as draft" : "Prescription activated by doctor"
      );
    }

    await connection.commit();

    await recordAudit(req.user.id, "prescription_created", "prescriptions", prescriptionId, {
      prescription_number: prescriptionNumber,
      consultation_id: consultationId,
      patient_id: consultation.patient_id,
      item_count: validatedItems.length,
      status: normalizedStatus,
    });

    return res.status(201).json({
      success: true,
      message: `Prescription #${prescriptionNumber} saved successfully (${normalizedStatus}).`,
      data: {
        id: prescriptionId,
        prescription_number: prescriptionNumber,
        consultation_id: consultationId,
        patient_id: consultation.patient_id,
        doctor_id: consultation.doctor_id,
        hospital_id: consultation.hospital_id,
        status: normalizedStatus,
        items: validatedItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Prescription creation error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create or update prescription." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * LESSON 13.5: PRESCRIPTION STATUS MANAGEMENT & TRANSITIONS
 * PATCH /api/prescriptions/:id/status
 * ============================================================================
 */
router.patch("/:id/status", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const rxId = parseInt(req.params.id, 10);
    const { status: targetStatus, reason } = req.body;

    if (!rxId || isNaN(rxId)) {
      return res.status(400).json({ success: false, message: "Invalid prescription ID." });
    }

    const validStatuses = ["draft", "active", "partially_dispensed", "dispensed", "cancelled"];
    if (!targetStatus || !validStatuses.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT p.*, 
        (SELECT COALESCE(SUM(dispensed_quantity), 0) FROM prescription_items WHERE prescription_id = p.id) AS total_dispensed
       FROM prescriptions p 
       WHERE p.id = ? 
       FOR UPDATE`,
      [rxId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Prescription not found." });
    }

    const currentRx = rows[0];

    // Hospital Isolation Check
    if (req.user.role !== "super_admin" && req.user.hospitalId !== currentRx.hospital_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied: Hospital mismatch." });
    }

    const currentStatus = currentRx.status;
    const totalDispensed = parseInt(currentRx.total_dispensed, 10) || 0;

    // Validate Status Transitions Rules
    // 1. Cancelled prescriptions cannot be transitioned to anything
    if (currentStatus === "cancelled") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot alter status of a cancelled prescription. Create a new prescription if replacement is needed.",
      });
    }

    // 2. Fully dispensed prescriptions cannot be reactivated or cancelled
    if (currentStatus === "dispensed") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Prescription has already been fully dispensed and cannot change status.",
      });
    }

    // 3. Directly marking 'dispensed' or 'partially_dispensed' via status PATCH is forbidden
    if (targetStatus === "dispensed" || targetStatus === "partially_dispensed") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Prescription cannot be manually marked as dispensed or partially dispensed. Status updates must occur through pharmacy dispensing transactions.",
      });
    }

    // 4. Cancellation rules:
    // If active and 0 dispensed -> can cancel
    // If partially dispensed -> can cancel remaining unfulfilled items only
    if (targetStatus === "cancelled") {
      if (!isClinicalDoctor(req) && req.user.role !== "hospital_admin") {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "Only attending doctors or hospital administrators can cancel prescriptions.",
        });
      }
      if (!reason || reason.trim().length < 3) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "A cancellation reason of at least 3 characters is required.",
        });
      }
    }

    // 5. Target status equals current status -> no-op
    if (currentStatus === targetStatus) {
      await connection.rollback();
      return res.json({
        success: true,
        message: `Prescription is already in '${targetStatus}' status.`,
        data: currentRx,
      });
    }

    // Update prescription
    await connection.query(
      "UPDATE prescriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [targetStatus, rxId]
    );

    // Record Status History
    await recordStatusHistory(connection, rxId, currentStatus, targetStatus, req.user.id, reason || null);

    await connection.commit();

    await recordAudit(req.user.id, "prescription_status_changed", "prescriptions", rxId, {
      from_status: currentStatus,
      to_status: targetStatus,
      reason: reason || null,
    });

    return res.json({
      success: true,
      message: `Prescription #${currentRx.prescription_number} status updated to '${targetStatus}'.`,
      data: {
        id: rxId,
        prescription_number: currentRx.prescription_number,
        from_status: currentStatus,
        to_status: targetStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Prescription status transition error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update prescription status." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * LESSON 15.1, 15.2, 15.3: PRE-DISPENSE PRESCRIPTION & BILL VALIDATION
 * POST /api/prescriptions/:id/validate-dispense
 * ============================================================================
 */
router.post("/:id/validate-dispense", requireAuth, async (req, res) => {
  try {
    const rxId = parseInt(req.params.id, 10);
    const { bill_id } = req.body || {};

    if (!rxId || isNaN(rxId)) {
      return res.status(400).json({ success: false, message: "Invalid prescription ID." });
    }

    const [rows] = await pool.query(
      `SELECT p.*, 
        u_pat.full_name AS patient_name,
        u_doc.full_name AS doctor_name,
        h.name AS hospital_name
       FROM prescriptions p
       JOIN users u_pat ON u_pat.id = p.patient_id
       JOIN users u_doc ON u_doc.id = p.doctor_id
       JOIN hospitals h ON h.id = p.hospital_id
       WHERE p.id = ?`,
      [rxId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Prescription not found." });
    }

    const rx = rows[0];

    // Hospital Isolation Check
    if (req.user.role !== "super_admin" && req.user.hospitalId !== rx.hospital_id) {
      return res.status(403).json({ success: false, message: "Prescription belongs to another hospital facility." });
    }

    // Eligibility validation
    const validationIssues = [];

    if (rx.status === "draft") {
      validationIssues.push("Prescription is in 'draft' status. Doctor must finalize and activate it before dispensing.");
    }
    if (rx.status === "cancelled") {
      validationIssues.push("Prescription has been cancelled and cannot be dispensed.");
    }
    if (rx.status === "dispensed") {
      validationIssues.push("Prescription has already been fully dispensed.");
    }

    // Lesson 15.2: Billing Validation & Linked Bills Inspection
    let validatedBill = null;
    if (bill_id) {
      const parsedBillId = parseInt(bill_id, 10);
      if (isNaN(parsedBillId) || parsedBillId <= 0) {
        validationIssues.push("Invalid pharmacy bill ID specified.");
      } else {
        const [billRows] = await pool.query(
          "SELECT id, bill_number, hospital_id, patient_id, prescription_id, grand_total, paid_amount, balance_due, status FROM pharmacy_bills WHERE id = ?",
          [parsedBillId]
        );
        if (billRows.length === 0) {
          validationIssues.push(`Referenced pharmacy bill #${parsedBillId} not found.`);
        } else {
          const bill = billRows[0];
          if (bill.patient_id !== rx.patient_id) {
            validationIssues.push("Pharmacy bill belongs to a different patient.");
          }
          if (bill.hospital_id !== rx.hospital_id) {
            validationIssues.push("Pharmacy bill belongs to a different hospital facility.");
          }
          if (bill.prescription_id && bill.prescription_id !== rx.id) {
            validationIssues.push("Pharmacy bill is not linked to this prescription.");
          }
          if (["cancelled", "refunded"].includes(bill.status)) {
            validationIssues.push(`Cannot dispense against a ${bill.status} pharmacy bill.`);
          }
          validatedBill = bill;
        }
      }
    }

    // Fetch any existing bills linked to this prescription for convenient pharmacist selection
    const [linkedBills] = await pool.query(
      `SELECT id, bill_number, grand_total, paid_amount, balance_due, status, created_at
       FROM pharmacy_bills
       WHERE prescription_id = ? AND status NOT IN ('cancelled', 'refunded')
       ORDER BY created_at DESC`,
      [rxId]
    );

    // Fetch items with batches and remaining quantity
    const [items] = await pool.query(
      `SELECT pi.*, m.name AS catalog_name, m.status AS catalog_status, m.sale_price AS default_sale_price
       FROM prescription_items pi
       LEFT JOIN master_medicines m ON m.id = pi.medicine_id
       WHERE pi.prescription_id = ?`,
      [rxId]
    );

    const itemsAnalysis = [];

    for (const item of items) {
      let medId = item.medicine_id;
      if (!medId && item.medicine_name) {
        const trimmedName = item.medicine_name.trim();
        let [match] = await pool.query(
          "SELECT id FROM master_medicines WHERE name = ? AND status = 'active' LIMIT 1",
          [trimmedName]
        );
        if (!match.length) {
          [match] = await pool.query(
            "SELECT id FROM master_medicines WHERE ? LIKE CONCAT('%', name, '%') AND status = 'active' LIMIT 1",
            [trimmedName]
          );
        }
        if (match.length > 0) {
          medId = match[0].id;
        }
      }

      let prescribedQty = item.quantity;
      if (!prescribedQty || prescribedQty <= 0) {
        const daysMatch = (item.duration || "").match(/(\d+)\s*day/i);
        if (daysMatch) {
          const days = parseInt(daysMatch[1], 10);
          let perDay = 1;
          const freq = (item.frequency || "").toLowerCase();
          if (freq.includes("twice") || freq.includes("2 times") || freq.includes("bid")) perDay = 2;
          else if (freq.includes("thrice") || freq.includes("3 times") || freq.includes("tid")) perDay = 3;
          else if (freq.includes("4 times") || freq.includes("qid")) perDay = 4;
          prescribedQty = days * perDay;
        } else {
          prescribedQty = 1;
        }
      }

      const remainingQty = Math.max(0, prescribedQty - (item.dispensed_quantity || 0));

      if (!medId) {
        itemsAnalysis.push({
          ...item,
          medicine_id: null,
          quantity: prescribedQty,
          remaining_quantity: remainingQty,
          eligible: false,
          issue: "Item is not linked to inventory master catalog.",
          batches: [],
          available_stock: 0,
        });
        validationIssues.push(`Medicine '${item.medicine_name}' is not mapped to master inventory.`);
        continue;
      }

      // Check non-expired active batches (Lesson 15.3)
      const [batches] = await pool.query(
        `SELECT id, batch_number, expiry_date, current_quantity, sale_price
         FROM medicine_batches
         WHERE hospital_id = ?
           AND medicine_id = ?
           AND status = 'active'
           AND current_quantity > 0
           AND expiry_date >= CURDATE()
         ORDER BY expiry_date ASC, id ASC`,
        [rx.hospital_id, medId]
      );

      const totalAvailable = batches.reduce((sum, b) => sum + b.current_quantity, 0);
      const isStockSufficient = totalAvailable >= remainingQty;

      if (!isStockSufficient && remainingQty > 0) {
        // Also check if expired stock exists for helpful logging
        const [expiredRows] = await pool.query(
          `SELECT COUNT(*) AS expired_count FROM medicine_batches
           WHERE hospital_id = ? AND medicine_id = ? AND status = 'active' AND current_quantity > 0 AND expiry_date < CURDATE()`,
          [rx.hospital_id, medId]
        );
        const expNote = expiredRows[0]?.expired_count > 0 ? " (Expired batches were excluded)" : "";
        validationIssues.push(
          `Insufficient non-expired stock for '${item.medicine_name}'. Required: ${remainingQty}, Available: ${totalAvailable}.${expNote}`
        );
      }

      itemsAnalysis.push({
        ...item,
        medicine_id: medId,
        quantity: prescribedQty,
        remaining_quantity: remainingQty,
        eligible: isStockSufficient && remainingQty > 0 && rx.status !== "draft" && rx.status !== "cancelled" && rx.status !== "dispensed",
        available_stock: totalAvailable,
        batches,
      });
    }

    return res.json({
      success: true,
      data: {
        prescription: rx,
        linked_bills: linkedBills,
        selected_bill: validatedBill,
        is_eligible: validationIssues.length === 0,
        can_dispense: validationIssues.length === 0,
        validation_issues: validationIssues,
        items: itemsAnalysis,
      },
    });
  } catch (error) {
    console.error("Dispense pre-validation error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to validate prescription for dispensing." });
  }
});

/**
 * ============================================================================
 * MODULE 15 (LESSONS 15.1 - 15.10): SECURE PRESCRIPTION MEDICINE DISPENSING
 * POST /api/prescriptions/:id/dispense
 * ============================================================================
 */
router.post("/:id/dispense", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    // Lesson 15.4: Authorization Guard
    if (!isPharmacyAuthorized(req) || !(await isPharmacistWithPermission(req))) {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only authorized pharmacy personnel can dispense medications.",
      });
    }

    const rxId = parseInt(req.params.id, 10);
    const {
      items, // optional custom quantities: [{ item_id, prescription_item_id, medicine_id, quantity_to_dispense, discount_percent }]
      bill_id, // optional linked pharmacy bill ID (Lesson 15.2)
      payment_method = "cash",
      notes,
      idempotency_key, // Lesson 15.8: Idempotency Protection
    } = req.body;

    if (!rxId || isNaN(rxId)) {
      return res.status(400).json({ success: false, message: "Invalid prescription ID." });
    }

    // Lesson 15.8: Check Idempotency Key Before Mutation
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
            dispensation: {
              id: disp.id,
              dispensation_id: disp.id,
              dispensation_number: disp.dispensation_number,
              prescription_id: disp.prescription_id,
              bill_id: disp.bill_id,
              bill_number: disp.bill_number,
              total_amount: disp.total_amount,
              payment_status: disp.payment_status,
              items: dItems,
            },
            dispensation_id: disp.id,
            dispensation_number: disp.dispensation_number,
            prescription_id: disp.prescription_id,
            bill_id: disp.bill_id,
            bill_number: disp.bill_number,
            total_amount: disp.total_amount,
            payment_status: disp.payment_status,
            items: dItems,
          },
        });
      }
    }

    // Lesson 15.9: Database Transaction & Atomicity
    await connection.beginTransaction();

    // Lock prescription record FOR UPDATE (Lesson 15.8)
    const [rxRows] = await connection.query(
      `SELECT p.*, u_pat.full_name AS patient_name
       FROM prescriptions p
       JOIN users u_pat ON u_pat.id = p.patient_id
       WHERE p.id = ? 
       FOR UPDATE`,
      [rxId]
    );

    if (rxRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Prescription not found." });
    }

    const rx = rxRows[0];

    // Hospital Isolation Check (Lesson 15.4)
    if (req.user.role !== "super_admin" && req.user.hospitalId !== rx.hospital_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Cross-hospital dispensing denied." });
    }

    // Status Validations (Lesson 15.2)
    if (rx.status === "draft") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot dispense a draft prescription. It must first be activated by an attending doctor.",
      });
    }
    if (rx.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot dispense a cancelled prescription.",
      });
    }
    if (rx.status === "dispensed") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Prescription has already been fully dispensed.",
      });
    }

    // Lesson 15.2: Billing Validation
    let validatedBillId = null;
    let billItemsMap = null;
    if (bill_id) {
      const parsedBillId = parseInt(bill_id, 10);
      if (isNaN(parsedBillId) || parsedBillId <= 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Invalid pharmacy bill ID specified." });
      }

      const [billRows] = await connection.query(
        "SELECT id, bill_number, hospital_id, patient_id, prescription_id, status FROM pharmacy_bills WHERE id = ? FOR UPDATE",
        [parsedBillId]
      );

      if (billRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "Referenced pharmacy bill not found." });
      }

      const bill = billRows[0];
      if (Number(bill.patient_id) !== Number(rx.patient_id)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Pharmacy bill patient does not match prescription patient." });
      }
      if (Number(bill.hospital_id) !== Number(rx.hospital_id)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: "Cross-hospital billing validation failed." });
      }
      if (bill.prescription_id && Number(bill.prescription_id) !== Number(rx.id)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Pharmacy bill is not linked to this prescription." });
      }
      if (["cancelled", "refunded"].includes(bill.status)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot dispense against a ${bill.status} pharmacy bill.` });
      }

      validatedBillId = bill.id;

      // Load bill items for quantity validation
      const [bItems] = await connection.query(
        "SELECT prescription_item_id, medicine_id, quantity FROM pharmacy_bill_items WHERE bill_id = ?",
        [validatedBillId]
      );
      billItemsMap = new Map();
      for (const bi of bItems) {
        const key = bi.prescription_item_id ? `pi_${bi.prescription_item_id}` : `m_${bi.medicine_id}`;
        billItemsMap.set(key, bi.quantity);
      }
    }

    // Load prescription items FOR UPDATE (Lesson 15.8)
    const [dbItems] = await connection.query(
      `SELECT pi.*, m.name AS med_catalog_name, m.sale_price AS med_sale_price, m.max_discount_percent
       FROM prescription_items pi
       LEFT JOIN master_medicines m ON m.id = pi.medicine_id
       WHERE pi.prescription_id = ?
       FOR UPDATE`,
      [rxId]
    );

    if (dbItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Prescription has no prescribed medication items." });
    }

    // Determine quantities to dispense per item (Lesson 15.5 & 15.6)
    const itemsToProcess = [];
    const requestedCustom = Array.isArray(items) && items.length > 0;

    for (const dbIt of dbItems) {
      let resolvedMedId = dbIt.medicine_id;
      if (!resolvedMedId && dbIt.medicine_name) {
        const [mMatch] = await connection.query(
          "SELECT id FROM master_medicines WHERE ? LIKE CONCAT('%', name, '%') AND status = 'active' LIMIT 1",
          [dbIt.medicine_name.trim()]
        );
        if (mMatch.length > 0) {
          resolvedMedId = mMatch[0].id;
        }
      }

      let prescribedQty = dbIt.quantity;
      if (!prescribedQty || prescribedQty <= 0) {
        const daysMatch = (dbIt.duration || "").match(/(\d+)\s*day/i);
        if (daysMatch) {
          const days = parseInt(daysMatch[1], 10);
          let perDay = 1;
          const freq = (dbIt.frequency || "").toLowerCase();
          if (freq.includes("twice") || freq.includes("2 times") || freq.includes("bid")) perDay = 2;
          else if (freq.includes("thrice") || freq.includes("3 times") || freq.includes("tid")) perDay = 3;
          else if (freq.includes("4 times") || freq.includes("qid")) perDay = 4;
          prescribedQty = days * perDay;
        } else {
          prescribedQty = 1;
        }
      }

      const remainingPrescribed = Math.max(0, prescribedQty - (dbIt.dispensed_quantity || 0));
      if (remainingPrescribed <= 0) continue; // Item already fulfilled

      let dispenseQty = remainingPrescribed;
      let userDiscount = 0;

      if (requestedCustom) {
        const match = items.find((i) =>
          (i.item_id && Number(i.item_id) === Number(dbIt.id)) ||
          (i.prescription_item_id && Number(i.prescription_item_id) === Number(dbIt.id)) ||
          (i.medicine_id && (Number(i.medicine_id) === Number(dbIt.medicine_id) || Number(i.medicine_id) === Number(resolvedMedId)))
        );
        if (!match) continue; // Not selected in this partial dispensation batch

        const reqQ = Number(match.quantity_to_dispense);
        if (isNaN(reqQ) || !Number.isInteger(reqQ) || reqQ <= 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Dispense quantity for '${dbIt.medicine_name}' must be a positive integer greater than zero.`,
          });
        }
        if (reqQ > remainingPrescribed) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Dispense quantity (${reqQ}) for '${dbIt.medicine_name}' exceeds remaining prescribed quantity (${remainingPrescribed}).`,
          });
        }
        dispenseQty = reqQ;
        userDiscount = match.discount_percent ? parseFloat(match.discount_percent) : 0;
      }

      // Check against bill items if bill is linked (Lesson 15.2)
      if (billItemsMap) {
        const billedQty = billItemsMap.get(`pi_${dbIt.id}`) ?? billItemsMap.get(`m_${resolvedMedId || dbIt.medicine_id}`);
        if (billedQty !== undefined && dispenseQty > billedQty) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Dispense quantity (${dispenseQty}) for '${dbIt.medicine_name}' exceeds billed quantity (${billedQty}).`,
          });
        }
      }

      const finalMedId = resolvedMedId || dbIt.medicine_id;
      if (!finalMedId) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot dispense '${dbIt.medicine_name}': not linked to master inventory.`,
        });
      }

      itemsToProcess.push({
        rx_item_id: dbIt.id,
        medicine_id: finalMedId,
        medicine_name: dbIt.medicine_name,
        quantity: dispenseQty,
        discount_percent: Math.min(Math.max(userDiscount, 0), parseFloat(dbIt.max_discount_percent || 0)),
        db_item: dbIt,
      });
    }

    if (itemsToProcess.length === 0) {
      await connection.rollback();
      const prescribedNames = dbItems.map((d) => d.medicine_name).join(", ");
      return res.status(400).json({
        success: false,
        message: `No unfulfilled items matched for dispensing. Prescribed medication(s): ${prescribedNames}.`,
      });
    }

    // FEFO Allocation & Stock Deduction (Lessons 15.3, 15.7, 15.8)
    let dispensationSubtotal = 0;
    let dispensationDiscountTotal = 0;
    const allocatedDispensations = [];

    for (const item of itemsToProcess) {
      // Lock eligible non-expired active batches in FEFO order (expiry_date ASC)
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
        [rx.hospital_id, item.medicine_id]
      );

      const totalBatchStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);
      if (totalBatchStock < item.quantity) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient non-expired stock for '${item.medicine_name}'. Required: ${item.quantity}, Available: ${totalBatchStock}.`,
        });
      }

      let remainingToAllocate = item.quantity;

      for (const batch of batches) {
        if (remainingToAllocate <= 0) break;

        const takeQty = Math.min(remainingToAllocate, batch.current_quantity);
        const newBatchQty = batch.current_quantity - takeQty;
        const newBatchStatus = newBatchQty === 0 ? "depleted" : "active";

        // Conditional atomic update preventing negative stock (Lesson 15.8)
        const [updateRes] = await connection.query(
          "UPDATE medicine_batches SET current_quantity = current_quantity - ?, status = ? WHERE id = ? AND current_quantity >= ?",
          [takeQty, newBatchStatus, batch.id, takeQty]
        );

        if (updateRes.affectedRows === 0) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message: `Concurrent inventory update conflict for '${item.medicine_name}'. Please retry.`,
          });
        }

        // Price snapshot
        const unitPrice = parseFloat(batch.sale_price) > 0 ? parseFloat(batch.sale_price) : parseFloat(item.db_item.med_sale_price || 0);
        const gross = unitPrice * takeQty;
        const discountAmt = gross * (item.discount_percent / 100);
        const net = gross - discountAmt;

        dispensationSubtotal += gross;
        dispensationDiscountTotal += discountAmt;

        allocatedDispensations.push({
          prescription_item_id: item.rx_item_id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          medicine_id: item.medicine_id,
          medicine_name: item.medicine_name,
          quantity: takeQty,
          unit_sale_price: unitPrice,
          discount_percent: item.discount_percent,
          total_price: net,
          remaining_batch_quantity: newBatchQty,
        });

        remainingToAllocate -= takeQty;
      }

      // Update dispensed_quantity on prescription_items (Lesson 15.5)
      await connection.query(
        "UPDATE prescription_items SET dispensed_quantity = dispensed_quantity + ? WHERE id = ?",
        [item.quantity, item.rx_item_id]
      );
    }

    const finalTotal = dispensationSubtotal - dispensationDiscountTotal;
    const dispensationNumber = `DISP-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;

    // Create Pharmacy Dispensation Record (Lessons 15.4, 15.10)
    const [dispRes] = await connection.query(
      `INSERT INTO pharmacy_dispensations 
       (dispensation_number, hospital_id, patient_id, prescription_id, bill_id, subtotal, discount_amount, tax_amount, total_amount, payment_status, payment_method, dispensed_by, notes, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, 'paid', ?, ?, ?, ?)`,
      [
        dispensationNumber,
        rx.hospital_id,
        rx.patient_id,
        rx.id,
        validatedBillId,
        dispensationSubtotal.toFixed(2),
        dispensationDiscountTotal.toFixed(2),
        finalTotal.toFixed(2),
        payment_method,
        req.user.id,
        notes ? notes.trim() : `Dispensation for Rx #${rx.prescription_number}`,
        idempotency_key ? idempotency_key.trim() : null,
      ]
    );

    const dispensationId = dispRes.insertId;

    // Record line items and immutable stock movements (Lessons 15.5, 15.7)
    for (const alloc of allocatedDispensations) {
      await connection.query(
        `INSERT INTO pharmacy_dispensation_items 
         (dispensation_id, prescription_item_id, batch_id, medicine_id, quantity, unit_sale_price, discount_percent, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dispensationId,
          alloc.prescription_item_id,
          alloc.batch_id,
          alloc.medicine_id,
          alloc.quantity,
          alloc.unit_sale_price.toFixed(2),
          alloc.discount_percent.toFixed(2),
          alloc.total_price.toFixed(2),
        ]
      );

      await connection.query(
        `INSERT INTO stock_movements 
         (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
         VALUES (?, ?, ?, 'dispense', ?, ?, 'pharmacy_dispensation', ?, ?, ?)`,
        [
          rx.hospital_id,
          alloc.batch_id,
          alloc.medicine_id,
          -alloc.quantity,
          alloc.remaining_batch_quantity,
          dispensationNumber,
          `Dispensed ${alloc.quantity} unit(s) of ${alloc.medicine_name} for Rx #${rx.prescription_number}`,
          req.user.id,
        ]
      );
    }

    // Recheck overall prescription status (Lesson 15.6)
    // If all items now have dispensed_quantity >= quantity -> 'dispensed'
    // Else -> 'partially_dispensed'
    const [updatedItems] = await connection.query(
      "SELECT quantity, dispensed_quantity FROM prescription_items WHERE prescription_id = ?",
      [rxId]
    );

    const allFulfilled = updatedItems.length > 0 && updatedItems.every((it) => (it.dispensed_quantity || 0) >= (it.quantity || 0));
    const nextRxStatus = allFulfilled ? "dispensed" : "partially_dispensed";

    if (rx.status !== nextRxStatus) {
      await connection.query(
        "UPDATE prescriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [nextRxStatus, rxId]
      );
      await recordStatusHistory(
        connection,
        rxId,
        rx.status,
        nextRxStatus,
        req.user.id,
        nextRxStatus === "dispensed"
          ? `Prescription fully fulfilled in dispensation #${dispensationNumber}`
          : `Partial dispensation #${dispensationNumber} processed`
      );
    }

    await connection.commit();

    await recordAudit(req.user.id, "prescription_dispensed", "pharmacy_dispensations", dispensationId, {
      dispensation_number: dispensationNumber,
      prescription_id: rxId,
      prescription_number: rx.prescription_number,
      bill_id: validatedBillId,
      next_status: nextRxStatus,
      total_amount: finalTotal,
      items_dispensed: allocatedDispensations.length,
    });

    return res.status(201).json({
      success: true,
      message: `Prescription #${rx.prescription_number} successfully ${nextRxStatus === "dispensed" ? "fully dispensed" : "partially dispensed"}.`,
      data: {
        dispensation: {
          id: dispensationId,
          dispensation_id: dispensationId,
          dispensation_number: dispensationNumber,
          prescription_id: rxId,
          bill_id: validatedBillId,
          prescription_status: nextRxStatus,
          total_amount: finalTotal.toFixed(2),
          items: allocatedDispensations,
        },
        dispensation_id: dispensationId,
        dispensation_number: dispensationNumber,
        prescription_id: rxId,
        bill_id: validatedBillId,
        prescription_status: nextRxStatus,
        total_amount: finalTotal.toFixed(2),
        items: allocatedDispensations,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Prescription dispensing error:", error.message);
    return res.status(500).json({ success: false, message: "Dispensing failed. Database transaction rolled back." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * LESSON 13.10: PRESCRIPTION DETAILS & FULL HISTORY
 * GET /api/prescriptions/:id
 * ============================================================================
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const rxId = parseInt(req.params.id, 10);
    if (!rxId || isNaN(rxId)) {
      return res.status(400).json({ success: false, message: "Invalid prescription ID." });
    }

    const [rows] = await pool.query(
      `SELECT 
        p.*,
        u_pat.full_name AS patient_name,
        u_pat.email AS patient_email,
        u_pat.phone AS patient_phone,
        u_doc.full_name AS doctor_name,
        h.name AS hospital_name,
        c.diagnosis,
        c.chief_complaint,
        c.started_at AS consultation_date,
        c.status AS consultation_status
       FROM prescriptions p
       JOIN users u_pat ON u_pat.id = p.patient_id
       JOIN users u_doc ON u_doc.id = p.doctor_id
       JOIN hospitals h ON h.id = p.hospital_id
       JOIN consultations c ON c.id = p.consultation_id
       WHERE p.id = ?`,
      [rxId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Prescription not found." });
    }

    const rx = rows[0];

    // Hospital Isolation Check
    if (req.user.role !== "super_admin" && req.user.role !== "patient" && req.user.hospitalId !== rx.hospital_id) {
      return res.status(403).json({ success: false, message: "Prescription belongs to another hospital facility." });
    }

    // Patient Access: Patients can only view their own records
    if (req.user.role === "patient" && req.user.id !== rx.patient_id) {
      return res.status(403).json({ success: false, message: "Permission denied. You can only view your own prescriptions." });
    }

    // Fetch items with details and remaining quantity
    const [items] = await pool.query(
      `SELECT 
        pi.*,
        m.sku AS medicine_sku,
        m.generic_name,
        m.sale_price AS master_sale_price,
        (pi.quantity - pi.dispensed_quantity) AS remaining_quantity
       FROM prescription_items pi
       LEFT JOIN master_medicines m ON m.id = pi.medicine_id
       WHERE pi.prescription_id = ?
       ORDER BY pi.id ASC`,
      [rxId]
    );

    // Fetch Dispensations History linked to this prescription (Lesson 15.10)
    const [dispensations] = await pool.query(
      `SELECT 
        pd.id,
        pd.dispensation_number,
        pd.bill_id,
        b.bill_number,
        b.status AS bill_status,
        pd.total_amount,
        pd.payment_status,
        pd.payment_method,
        pd.created_at,
        u.full_name AS dispensed_by_name
       FROM pharmacy_dispensations pd
       JOIN users u ON u.id = pd.dispensed_by
       LEFT JOIN pharmacy_bills b ON b.id = pd.bill_id
       WHERE pd.prescription_id = ?
       ORDER BY pd.created_at DESC`,
      [rxId]
    );

    // Fetch dispensation line items
    if (dispensations.length > 0) {
      const dispIds = dispensations.map((d) => d.id);
      const [dispItems] = await pool.query(
        `SELECT 
          pdi.*,
          m.name AS medicine_name,
          mb.batch_number,
          mb.expiry_date
         FROM pharmacy_dispensation_items pdi
         JOIN master_medicines m ON m.id = pdi.medicine_id
         JOIN medicine_batches mb ON mb.id = pdi.batch_id
         WHERE pdi.dispensation_id IN (?)`,
        [dispIds]
      );

      const itemsByDisp = {};
      for (const di of dispItems) {
        if (!itemsByDisp[di.dispensation_id]) itemsByDisp[di.dispensation_id] = [];
        itemsByDisp[di.dispensation_id].push(di);
      }

      for (const d of dispensations) {
        d.items = itemsByDisp[d.id] || [];
      }
    }

    // Fetch Status Transition History
    const [statusHistory] = await pool.query(
      `SELECT 
        psh.*,
        u.full_name AS changed_by_name,
        r.name AS changed_by_role
       FROM prescription_status_history psh
       JOIN users u ON u.id = psh.changed_by
       JOIN roles r ON r.id = u.role_id
       WHERE psh.prescription_id = ?
       ORDER BY psh.created_at ASC`,
      [rxId]
    );

    rx.items = items;
    rx.dispensations = dispensations;
    rx.status_history = statusHistory;

    return res.json({ success: true, data: rx });
  } catch (error) {
    console.error("Prescription details error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve prescription details." });
  }
});

/**
 * ============================================================================
 * LESSON 13.10: PATIENT PRESCRIPTION HISTORY
 * GET /api/prescriptions/patient/:patientId
 * ============================================================================
 */
router.get("/patient/:patientId", requireAuth, async (req, res) => {
  try {
    let patientId = req.params.patientId;
    if (patientId === "me" || req.user.role === "patient") {
      patientId = req.user.id;
    } else {
      patientId = parseInt(patientId, 10);
    }

    if (!patientId || isNaN(patientId)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID." });
    }

    if (req.user.role === "patient" && req.user.id !== patientId) {
      return res.status(403).json({ success: false, message: "Access denied. You can only view your own prescriptions." });
    }

    const [rows] = await pool.query(
      `SELECT 
        p.id,
        p.prescription_number,
        p.consultation_id,
        p.general_instructions,
        p.status,
        p.created_at,
        u_doc.full_name AS doctor_name,
        h.name AS hospital_name,
        c.diagnosis
       FROM prescriptions p
       JOIN users u_doc ON u_doc.id = p.doctor_id
       JOIN hospitals h ON h.id = p.hospital_id
       JOIN consultations c ON c.id = p.consultation_id
       WHERE p.patient_id = ?
       ORDER BY p.created_at DESC`,
      [patientId]
    );

    if (rows.length > 0) {
      const rxIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT pi.*, m.sku AS medicine_sku
         FROM prescription_items pi
         LEFT JOIN master_medicines m ON m.id = pi.medicine_id
         WHERE pi.prescription_id IN (?)
         ORDER BY pi.id ASC`,
        [rxIds]
      );

      const itemsByRx = {};
      for (const it of items) {
        if (!itemsByRx[it.prescription_id]) itemsByRx[it.prescription_id] = [];
        itemsByRx[it.prescription_id].push(it);
      }

      for (const r of rows) {
        r.items = itemsByRx[r.id] || [];
      }
    }

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Patient prescription history error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve patient prescriptions." });
  }
});

/**
 * ============================================================================
 * LESSON 13.10: DOCTOR PRESCRIPTION HISTORY
 * GET /api/prescriptions/doctor/:doctorId
 * ============================================================================
 */
router.get("/doctor/:doctorId", requireAuth, async (req, res) => {
  try {
    let doctorId = req.params.doctorId;
    if (doctorId === "me" || (req.user.role === "doctor" && !doctorId)) {
      doctorId = req.user.id;
    } else {
      doctorId = parseInt(doctorId, 10);
    }

    if (!doctorId || isNaN(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    if (req.user.role === "doctor" && req.user.id !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied. You can only view your authored prescriptions." });
    }

    const [rows] = await pool.query(
      `SELECT 
        p.id,
        p.prescription_number,
        p.consultation_id,
        p.patient_id,
        p.general_instructions,
        p.status,
        p.created_at,
        u_pat.full_name AS patient_name,
        u_pat.email AS patient_email,
        h.name AS hospital_name,
        c.diagnosis,
        (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = p.id) AS item_count
       FROM prescriptions p
       JOIN users u_pat ON u_pat.id = p.patient_id
       JOIN hospitals h ON h.id = p.hospital_id
       JOIN consultations c ON c.id = p.consultation_id
       WHERE p.doctor_id = ?
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [doctorId]
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Doctor prescription history error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve doctor prescriptions." });
  }
});

module.exports = router;
