const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { sendEmail, sendConsultationPaymentReceiptEmail } = require("../services/emailService");
const { generateConsultationReceiptPdf } = require("../services/receiptPdfService");

const router = express.Router();
router.use(requireAuth);

/**
 * Generate human-readable Bill Number: CBILL-YYYYMMDD-XXXX
 */
function generateConsultationBillNumber() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CBILL-${dateStr}-${rand}`;
}

/**
 * Generate human-readable Receipt Number: CRCP-YYYYMMDD-XXXX
 */
function generateConsultationReceiptNumber() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CRCP-${dateStr}-${rand}`;
}

/**
 * Helper to check whether the authenticated user is staff/receptionist/admin
 */
function isBillingAuthorized(req) {
  const role = req.user?.role;
  return ["super_admin", "hospital_admin", "staff"].includes(role);
}

/**
 * Helper to get normalized hospital ID from user session (handles both hospitalId and hospital_id)
 */
function getUserHospitalId(user) {
  return user ? (user.hospitalId || user.hospital_id || null) : null;
}

// -----------------------------------------------------------------------------
// LESSON 16.1 & 16.4: ELIGIBLE APPOINTMENTS FOR CONSULTATION BILLING
// -----------------------------------------------------------------------------
router.get("/eligible-appointments", async (req, res) => {
  try {
    if (!isBillingAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Unauthorized to access billing desk." });
    }

    const { hospital_id, search, status } = req.query;
    let targetHospitalId = getUserHospitalId(req.user);

    if (req.user.role === "super_admin") {
      targetHospitalId = hospital_id ? parseInt(hospital_id, 10) : null;
    }

    let query = `
      SELECT a.id AS appointment_id,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time,
             a.appointment_type,
             a.appointment_mode,
             a.status AS appointment_status,
             a.payment_method,
             a.consultation_fee AS appointment_fee,
             a.bill_id,
             a.hospital_id,
             h.name AS hospital_name,
             a.patient_id,
             pat.full_name AS patient_name,
             pat.email AS patient_email,
             pat.phone AS patient_phone,
             a.doctor_id,
             doc.full_name AS doctor_name,
             dp.specialization AS doctor_specialization,
             dp.consultation_fee AS doctor_profile_fee,
             d.name AS department_name,
             c.id AS consultation_id,
             c.status AS consultation_status,
             cb.id AS existing_bill_id,
             cb.bill_number AS existing_bill_number,
             cb.status AS existing_bill_status,
             cb.total_amount AS existing_bill_total,
             cb.paid_amount AS existing_bill_paid,
             cb.balance_due AS existing_bill_balance
      FROM appointments a
      LEFT JOIN hospitals h ON h.id = a.hospital_id
      LEFT JOIN users pat ON pat.id = a.patient_id
      LEFT JOIN users doc ON doc.id = a.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN consultations c ON c.appointment_id = a.id
      LEFT JOIN consultation_bills cb ON cb.appointment_id = a.id
      WHERE 1=1
    `;

    const params = [];

    if (targetHospitalId) {
      query += ` AND a.hospital_id = ?`;
      params.push(targetHospitalId);
    }

    // Exclude cancelled and rejected appointments from active billing queue
    query += ` AND a.status NOT IN ('cancelled', 'rejected')`;

    if (status === "unbilled") {
      query += ` AND cb.id IS NULL`;
    } else if (status === "pending_payment") {
      query += ` AND cb.id IS NOT NULL AND cb.status = 'pending'`;
    } else if (status === "paid") {
      query += ` AND cb.id IS NOT NULL AND cb.status = 'paid'`;
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (a.appointment_number LIKE ? OR pat.full_name LIKE ? OR pat.phone LIKE ? OR doc.full_name LIKE ? OR cb.bill_number LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY a.appointment_date DESC, a.created_at DESC LIMIT 100`;

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows.map((r) => ({
        ...r,
        authoritative_fee: Number(r.appointment_fee > 0 ? r.appointment_fee : (r.doctor_profile_fee || 0)),
      })),
    });
  } catch (err) {
    console.error("Eligible appointments query error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.1: FEE PREVIEW FOR APPOINTMENT
// -----------------------------------------------------------------------------
router.get("/fee-preview/:appointmentId", async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId, 10);
    if (!appointmentId) {
      return res.status(400).json({ success: false, message: "Valid appointment ID is required." });
    }

    const [apts] = await pool.query(
      `SELECT a.id, a.appointment_number, a.hospital_id, a.patient_id, a.doctor_id,
              a.consultation_fee AS appointment_fee, a.payment_method, a.status,
              h.name AS hospital_name,
              pat.full_name AS patient_name, pat.email AS patient_email,
              doc.full_name AS doctor_name,
              dp.consultation_fee AS doctor_profile_fee, dp.specialization,
              d.name AS department_name,
              c.id AS consultation_id,
              cb.id AS existing_bill_id, cb.bill_number, cb.status AS bill_status
       FROM appointments a
       LEFT JOIN hospitals h ON h.id = a.hospital_id
       LEFT JOIN users pat ON pat.id = a.patient_id
       LEFT JOIN users doc ON doc.id = a.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN consultations c ON c.appointment_id = a.id
       LEFT JOIN consultation_bills cb ON cb.appointment_id = a.id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    if (apts.length === 0) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const apt = apts[0];

    // Hospital Isolation Check
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && apt.hospital_id !== userHospId) {
      return res.status(403).json({ success: false, message: "Access denied to hospital appointment." });
    }

    // Authoritative fee calculation (prioritizes appointment fee snapshot, falls back to doctor profile fee)
    const authoritativeFee = Number(apt.appointment_fee > 0 ? apt.appointment_fee : (apt.doctor_profile_fee || 0));

    return res.json({
      success: true,
      data: {
        appointment_id: apt.id,
        appointment_number: apt.appointment_number,
        hospital_id: apt.hospital_id,
        hospital_name: apt.hospital_name,
        patient_id: apt.patient_id,
        patient_name: apt.patient_name,
        patient_email: apt.patient_email,
        doctor_id: apt.doctor_id,
        doctor_name: apt.doctor_name,
        doctor_specialization: apt.specialization,
        department_name: apt.department_name,
        consultation_id: apt.consultation_id,
        authoritative_fee: authoritativeFee,
        discount_amount: 0.0,
        tax_amount: 0.0, // 0% GST on healthcare consultation services (Lesson 16.10)
        total_amount: authoritativeFee,
        existing_bill: apt.existing_bill_id
          ? { id: apt.existing_bill_id, bill_number: apt.bill_number, status: apt.bill_status }
          : null,
      },
    });
  } catch (err) {
    console.error("Fee preview error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.1, 16.5, 16.9, 16.10: GENERATE CONSULTATION BILL
// -----------------------------------------------------------------------------
router.post("/bills", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isBillingAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Unauthorized to generate consultation bills." });
    }

    const { appointment_id, discount = 0, payment_method, notes, idempotency_key } = req.body;

    const appointmentId = parseInt(appointment_id, 10);
    if (!appointmentId) {
      return res.status(400).json({ success: false, message: "Valid appointment_id is required." });
    }

    await connection.beginTransaction();

    // 1. Check idempotency key first if provided (Lesson 16.9)
    if (idempotency_key) {
      const [existingByIdempotency] = await connection.query(
        "SELECT * FROM consultation_bills WHERE idempotency_key = ? LIMIT 1",
        [idempotency_key]
      );
      if (existingByIdempotency.length > 0) {
        await connection.commit();
        return res.json({
          success: true,
          message: "Bill retrieved via idempotency key.",
          already_exists: true,
          data: existingByIdempotency[0],
        });
      }
    }

    // 2. Lock & inspect appointment
    const [apts] = await connection.query(
      `SELECT a.*,
              h.name AS hospital_name,
              dp.consultation_fee AS doc_profile_fee
       FROM appointments a
       LEFT JOIN hospitals h ON h.id = a.hospital_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id
       WHERE a.id = ? FOR UPDATE`,
      [appointmentId]
    );

    if (apts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const apt = apts[0];

    // Hospital Isolation Check
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && apt.hospital_id !== userHospId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied to hospital appointment." });
    }

    if (["cancelled", "rejected"].includes(apt.status)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Cannot generate bill for ${apt.status} appointment.` });
    }

    // 3. Duplicate Bill Check for Appointment (Lesson 16.5 & 16.9)
    const [existingBills] = await connection.query(
      "SELECT * FROM consultation_bills WHERE appointment_id = ? LIMIT 1",
      [appointmentId]
    );

    if (existingBills.length > 0) {
      await connection.commit();
      return res.status(200).json({
        success: true,
        message: "Consultation bill already exists for this appointment.",
        already_exists: true,
        data: existingBills[0],
      });
    }

    // 4. Authoritative Fee Calculation (Lesson 16.1 & 16.10)
    // NEVER trust frontend-supplied amounts
    const feeAmount = Number(apt.consultation_fee > 0 ? apt.consultation_fee : (apt.doc_profile_fee || 0));
    const discountAmount = Math.max(0, Math.min(Number(discount) || 0, feeAmount));
    const taxAmount = 0.0; // Statutory 0% GST on physician consultations
    const totalAmount = Math.max(0, feeAmount - discountAmount);
    const paidAmount = 0.0; // Lesson 16.3: newly generated bill is NOT marked paid
    const balanceDue = totalAmount;
    const initialStatus = "pending";

    // Check if consultation record exists
    const [consults] = await connection.query(
      "SELECT id FROM consultations WHERE appointment_id = ? LIMIT 1",
      [appointmentId]
    );
    const consultationId = consults.length > 0 ? consults[0].id : null;

    // Generate unique CBILL number with collision retry
    let billNumber = generateConsultationBillNumber();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      const [dup] = await connection.query("SELECT id FROM consultation_bills WHERE bill_number = ? LIMIT 1", [billNumber]);
      if (dup.length === 0) {
        isUnique = true;
      } else {
        billNumber = generateConsultationBillNumber();
        attempts++;
      }
    }

    const payMethod = payment_method || apt.payment_method || "cash";

    const [insertResult] = await connection.query(
      `INSERT INTO consultation_bills
         (bill_number, hospital_id, patient_id, doctor_id, appointment_id, consultation_id,
          fee_amount, discount_amount, tax_amount, total_amount, paid_amount, balance_due,
          status, payment_method, idempotency_key, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billNumber,
        apt.hospital_id,
        apt.patient_id,
        apt.doctor_id,
        apt.id,
        consultationId,
        feeAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount,
        balanceDue,
        initialStatus,
        payMethod,
        idempotency_key || null,
        notes || null,
        req.user.id,
      ]
    );

    const billId = insertResult.insertId;

    // Update appointment with bill_id (bidirectional cross-reference)
    await connection.query("UPDATE appointments SET bill_id = ? WHERE id = ?", [billNumber, appointmentId]);

    // Audit Log
    await logAudit({
      actor_id: req.user.id,
      action: "GENERATE_CONSULTATION_BILL",
      target_type: "consultation_bill",
      target_id: billId,
      details: {
        bill_number: billNumber,
        appointment_id: appointmentId,
        fee_amount: feeAmount,
        total_amount: totalAmount,
        status: initialStatus,
      },
    });

    await connection.commit();

    const [createdBill] = await pool.query(
      `SELECT cb.*,
              h.name AS hospital_name,
              pat.full_name AS patient_name,
              pat.email AS patient_email,
              doc.full_name AS doctor_name,
              a.appointment_number
       FROM consultation_bills cb
       LEFT JOIN hospitals h ON h.id = cb.hospital_id
       LEFT JOIN users pat ON pat.id = cb.patient_id
       LEFT JOIN users doc ON doc.id = cb.doctor_id
       LEFT JOIN appointments a ON a.id = cb.appointment_id
       WHERE cb.id = ?`,
      [billId]
    );

    return res.status(201).json({
      success: true,
      message: `Consultation bill ${billNumber} generated successfully.`,
      data: createdBill[0],
    });
  } catch (err) {
    await connection.rollback();
    console.error("Consultation bill generation error:", err.message);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "A bill for this appointment or bill number already exists." });
    }
    return res.status(500).json({ success: false, message: "Internal server error." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.7: LIST CONSULTATION BILLS WITH FILTERS & ACCESS PERMISSIONS
// -----------------------------------------------------------------------------
router.get("/bills", async (req, res) => {
  try {
    const {
      hospital_id,
      patient_id,
      doctor_id,
      status,
      payment_method,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let query = `
      SELECT cb.*,
             h.name AS hospital_name,
             pat.full_name AS patient_name,
             pat.email AS patient_email,
             pat.phone AS patient_phone,
             doc.full_name AS doctor_name,
             dp.specialization AS doctor_specialization,
             d.name AS department_name,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time,
             creator.full_name AS created_by_name
      FROM consultation_bills cb
      LEFT JOIN hospitals h ON h.id = cb.hospital_id
      LEFT JOIN users pat ON pat.id = cb.patient_id
      LEFT JOIN users doc ON doc.id = cb.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = cb.doctor_id
      LEFT JOIN appointments a ON a.id = cb.appointment_id
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN users creator ON creator.id = cb.created_by
      WHERE 1=1
    `;

    const params = [];

    // Role-based scoping (Lesson 16.7)
    if (req.user.role === "patient") {
      query += ` AND cb.patient_id = ?`;
      params.push(req.user.id);
    } else if (req.user.role === "doctor") {
      query += ` AND cb.doctor_id = ?`;
      params.push(req.user.id);
    } else if (req.user.role !== "super_admin") {
      // hospital_admin and staff are scoped strictly to their hospital
      const userHospId = getUserHospitalId(req.user);
      query += ` AND cb.hospital_id = ?`;
      params.push(userHospId);
    } else if (hospital_id) {
      query += ` AND cb.hospital_id = ?`;
      params.push(parseInt(hospital_id, 10));
    }

    if (patient_id && req.user.role !== "patient") {
      query += ` AND cb.patient_id = ?`;
      params.push(parseInt(patient_id, 10));
    }

    if (doctor_id && req.user.role !== "doctor") {
      query += ` AND cb.doctor_id = ?`;
      params.push(parseInt(doctor_id, 10));
    }

    if (status) {
      query += ` AND cb.status = ?`;
      params.push(status);
    }

    if (payment_method) {
      query += ` AND cb.payment_method = ?`;
      params.push(payment_method);
    }

    if (startDate) {
      query += ` AND cb.created_at >= ?`;
      params.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      query += ` AND cb.created_at <= ?`;
      params.push(`${endDate} 23:59:59`);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (cb.bill_number LIKE ? OR a.appointment_number LIKE ? OR pat.full_name LIKE ? OR pat.phone LIKE ? OR doc.full_name LIKE ?)`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY cb.created_at DESC LIMIT ? OFFSET ?`;
    params.push(pageLimit, offset);

    const [rows] = await pool.query(query, params);

    return res.json({
      success: true,
      page: parseInt(page, 10),
      limit: pageLimit,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Consultation bills list error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.6: PATIENT-SCOPED BILLS & PAYMENT HISTORY
// -----------------------------------------------------------------------------
router.get("/patient/my-bills", async (req, res) => {
  try {
    // Only patient can access their own bills; user ID derived strictly from JWT
    const patientId = req.user.id;

    const [bills] = await pool.query(
      `SELECT cb.*,
              h.name AS hospital_name,
              h.upi_id,
              h.payee_name,
              h.qr_code_url,
              doc.full_name AS doctor_name,
              dp.specialization AS doctor_specialization,
              d.name AS department_name,
              a.appointment_number,
              DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
              a.appointment_time
       FROM consultation_bills cb
       LEFT JOIN hospitals h ON h.id = cb.hospital_id
       LEFT JOIN users doc ON doc.id = cb.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = cb.doctor_id
       LEFT JOIN appointments a ON a.id = cb.appointment_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE cb.patient_id = ?
       ORDER BY cb.created_at DESC`,
      [patientId]
    );

    // Also fetch associated payments
    const billIds = bills.map((b) => b.id);
    let paymentsByBillId = {};

    if (billIds.length > 0) {
      const [payments] = await pool.query(
        `SELECT cp.*, collector.full_name AS collected_by_name
         FROM consultation_payments cp
         LEFT JOIN users collector ON collector.id = cp.collected_by
         WHERE cp.bill_id IN (?)
         ORDER BY cp.created_at ASC`,
        [billIds]
      );
      for (const p of payments) {
        if (!paymentsByBillId[p.bill_id]) paymentsByBillId[p.bill_id] = [];
        paymentsByBillId[p.bill_id].push(p);
      }
    }

    const result = bills.map((b) => ({
      ...b,
      payments: paymentsByBillId[b.id] || [],
    }));

    return res.json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("Patient my-bills query error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// -----------------------------------------------------------------------------
// GET SINGLE CONSULTATION BILL WITH RECEIPT HISTORY
// -----------------------------------------------------------------------------
router.get("/bills/:id", async (req, res) => {
  try {
    const rawParam = req.params.id;
    let query = `
      SELECT cb.*,
             h.name AS hospital_name,
             h.phone AS hospital_phone,
             h.email AS hospital_email,
             h.address AS hospital_address,
             h.upi_id,
             h.payee_name,
             h.qr_code_url,
             pat.full_name AS patient_name,
             pat.email AS patient_email,
             pat.phone AS patient_phone,
             doc.full_name AS doctor_name,
             dp.specialization AS doctor_specialization,
             d.name AS department_name,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time,
             creator.full_name AS created_by_name
      FROM consultation_bills cb
      LEFT JOIN hospitals h ON h.id = cb.hospital_id
      LEFT JOIN users pat ON pat.id = cb.patient_id
      LEFT JOIN users doc ON doc.id = cb.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = cb.doctor_id
      LEFT JOIN appointments a ON a.id = cb.appointment_id
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN users creator ON creator.id = cb.created_by
      WHERE `;

    const params = [];
    if (/^\d+$/.test(rawParam)) {
      query += "cb.id = ?";
      params.push(parseInt(rawParam, 10));
    } else {
      query += "cb.bill_number = ?";
      params.push(rawParam);
    }
    query += " LIMIT 1";

    const [bills] = await pool.query(query, params);
    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Access control
    if (req.user.role === "patient" && bill.patient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to patient bill." });
    }
    if (req.user.role === "doctor" && bill.doctor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to doctor bill." });
    }
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      return res.status(403).json({ success: false, message: "Access denied to hospital bill." });
    }

    // Fetch payments
    const [payments] = await pool.query(
      `SELECT cp.*, collector.full_name AS collected_by_name
       FROM consultation_payments cp
       LEFT JOIN users collector ON collector.id = cp.collected_by
       WHERE cp.bill_id = ?
       ORDER BY cp.created_at ASC`,
      [bill.id]
    );

    return res.json({
      success: true,
      data: {
        ...bill,
        payments,
      },
    });
  } catch (err) {
    console.error("Consultation bill lookup error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.2, 16.3, 16.4, 16.9: RECORD CONSULTATION PAYMENT (CASH / UPI / GPAY)
// -----------------------------------------------------------------------------
router.post("/bills/:id/payments", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (!isBillingAuthorized(req)) {
      return res.status(403).json({ success: false, message: "Unauthorized to record consultation payment." });
    }

    const rawParam = req.params.id;
    const { amount, payment_method = "cash", transaction_reference, notes } = req.body;

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive payment amount is required." });
    }

    const validMethods = ["cash", "upi", "gpay"];
    if (!validMethods.includes(payment_method.toLowerCase())) {
      return res.status(400).json({ success: false, message: `Payment method must be one of: ${validMethods.join(", ")}` });
    }

    await connection.beginTransaction();

    // 1. Lock and retrieve bill
    let billQuery = `SELECT * FROM consultation_bills WHERE `;
    const billParams = [];
    if (/^\d+$/.test(rawParam)) {
      billQuery += "id = ?";
      billParams.push(parseInt(rawParam, 10));
    } else {
      billQuery += "bill_number = ?";
      billParams.push(rawParam);
    }
    billQuery += " FOR UPDATE";

    const [bills] = await connection.query(billQuery, billParams);
    if (bills.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Hospital Isolation Check
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied to hospital bill." });
    }

    if (bill.status === "paid" || Number(bill.balance_due) <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "This consultation bill is already fully paid." });
    }

    if (bill.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Cannot accept payments on a cancelled bill." });
    }

    // 2. Validate payment against outstanding balance (Prevent Overpayment - Lesson 16.4 & 16.9)
    const currentBalance = Number(bill.balance_due);
    if (payAmount > currentBalance + 0.01) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Payment amount ₹${payAmount.toFixed(2)} exceeds current outstanding balance of ₹${currentBalance.toFixed(2)}.`,
      });
    }

    // 3. For electronic payments (UPI/GPay), require transaction reference (Lesson 16.2)
    if (["upi", "gpay"].includes(payment_method.toLowerCase()) && (!transaction_reference || !transaction_reference.trim())) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "A valid transaction/reference ID is required for UPI/GPay payment confirmation.",
      });
    }

    // Check duplicate transaction reference if provided
    if (transaction_reference && transaction_reference.trim()) {
      const [dupRef] = await connection.query(
        "SELECT id FROM consultation_payments WHERE transaction_reference = ? AND payment_status = 'completed' LIMIT 1",
        [transaction_reference.trim()]
      );
      if (dupRef.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "A payment with this transaction reference has already been processed.",
        });
      }
    }

    // 4. Generate unique receipt number (CRCP-YYYYMMDD-XXXX)
    let receiptNumber = generateConsultationReceiptNumber();
    let isReceiptUnique = false;
    let rAttempts = 0;
    while (!isReceiptUnique && rAttempts < 5) {
      const [dup] = await connection.query("SELECT id FROM consultation_payments WHERE receipt_number = ? LIMIT 1", [receiptNumber]);
      if (dup.length === 0) {
        isReceiptUnique = true;
      } else {
        receiptNumber = generateConsultationReceiptNumber();
        rAttempts++;
      }
    }

    // 5. Insert payment record
    const [payResult] = await connection.query(
      `INSERT INTO consultation_payments
         (receipt_number, bill_id, appointment_id, hospital_id, patient_id, amount,
          payment_method, payment_status, transaction_reference, notes, collected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      [
        receiptNumber,
        bill.id,
        bill.appointment_id,
        bill.hospital_id,
        bill.patient_id,
        payAmount,
        payment_method.toLowerCase(),
        transaction_reference ? transaction_reference.trim() : null,
        notes || null,
        req.user.id, // Authenticated staff actor (Lesson 16.4)
      ]
    );

    const paymentId = payResult.insertId;

    // 6. Recalculate bill balance and transition status
    const newPaidAmount = Number(bill.paid_amount) + payAmount;
    const newBalanceDue = Math.max(0, Number(bill.total_amount) - newPaidAmount);
    const newBillStatus = newBalanceDue <= 0.01 ? "paid" : "partially_paid";

    await connection.query(
      `UPDATE consultation_bills
       SET paid_amount = ?, balance_due = ?, status = ?, payment_method = ?
       WHERE id = ?`,
      [newPaidAmount, newBalanceDue, newBillStatus, payment_method.toLowerCase(), bill.id]
    );

    // Audit Log
    await logAudit({
      actor_id: req.user.id,
      action: "COLLECT_CONSULTATION_PAYMENT",
      target_type: "consultation_payment",
      target_id: paymentId,
      details: {
        receipt_number: receiptNumber,
        bill_id: bill.id,
        bill_number: bill.bill_number,
        amount: payAmount,
        payment_method,
        new_balance: newBalanceDue,
        new_status: newBillStatus,
      },
    });

    await connection.commit();

    // 7. Automated Email Confirmation Dispatch (Lesson 16.8)
    // Runs outside transaction so mail failure never rolls back the committed payment
    let emailSent = false;
    try {
      const [ptData] = await pool.query(
        `SELECT pat.email, pat.full_name, h.name AS hospital_name, doc.full_name AS doctor_name, a.appointment_number
         FROM consultation_bills cb
         JOIN users pat ON pat.id = cb.patient_id
         JOIN hospitals h ON h.id = cb.hospital_id
         JOIN users doc ON doc.id = cb.doctor_id
         JOIN appointments a ON a.id = cb.appointment_id
         WHERE cb.id = ?`,
        [bill.id]
      );
      if (ptData.length > 0 && ptData[0].email) {
        const pt = ptData[0];
        await sendConsultationPaymentReceiptEmail({
          to: pt.email,
          patientName: pt.full_name,
          hospitalName: pt.hospital_name,
          doctorName: pt.doctor_name,
          appointmentNumber: pt.appointment_number,
          billNumber: bill.bill_number,
          receiptNumber,
          amountPaid: payAmount,
          balanceDue: newBalanceDue,
          paymentMethod: payment_method,
          billStatus: newBillStatus,
        });
        emailSent = true;
      }
    } catch (mailErr) {
      console.warn("Payment confirmation email warning:", mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Payment of ₹${payAmount.toFixed(2)} recorded successfully. Receipt #${receiptNumber} generated.`,
      data: {
        payment_id: paymentId,
        receipt_number: receiptNumber,
        bill_id: bill.id,
        bill_number: bill.bill_number,
        amount: payAmount,
        payment_method,
        paid_amount: newPaidAmount,
        balance_due: newBalanceDue,
        status: newBillStatus,
        email_sent: emailSent,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Consultation payment error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// MODULE 15 / LESSON 16.8: OFFICIAL RECEIPT PDF GENERATION & DOWNLOAD
// -----------------------------------------------------------------------------
router.get("/bills/:id/receipt-pdf", async (req, res) => {
  try {
    const rawParam = req.params.id;
    let query = `
      SELECT cb.*,
             h.name AS hospital_name,
             h.phone AS hospital_phone,
             h.email AS hospital_email,
             h.address AS hospital_address,
             h.upi_id,
             pat.full_name AS patient_name,
             pat.email AS patient_email,
             pat.phone AS patient_phone,
             doc.full_name AS doctor_name,
             dp.specialization AS doctor_specialization,
             d.name AS department_name,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time
      FROM consultation_bills cb
      LEFT JOIN hospitals h ON h.id = cb.hospital_id
      LEFT JOIN users pat ON pat.id = cb.patient_id
      LEFT JOIN users doc ON doc.id = cb.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = cb.doctor_id
      LEFT JOIN appointments a ON a.id = cb.appointment_id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE `;

    const params = [];
    if (/^\d+$/.test(rawParam)) {
      query += "cb.id = ?";
      params.push(parseInt(rawParam, 10));
    } else {
      query += "cb.bill_number = ?";
      params.push(rawParam);
    }
    query += " LIMIT 1";

    const [bills] = await pool.query(query, params);
    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Access control & Hospital isolation check
    if (req.user.role === "patient" && bill.patient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to patient bill." });
    }
    if (req.user.role === "doctor" && bill.doctor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to doctor bill." });
    }
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      return res.status(403).json({ success: false, message: "Access denied to hospital bill." });
    }

    // Fetch payments
    const [payments] = await pool.query(
      `SELECT cp.*, collector.full_name AS collector_name
       FROM consultation_payments cp
       LEFT JOIN users collector ON collector.id = cp.collected_by
       WHERE cp.bill_id = ?
       ORDER BY cp.id DESC`,
      [bill.id]
    );
    bill.payments = payments;

    const receiptNumber = payments.length > 0 ? payments[0].receipt_number : bill.bill_number;
    const paymentDate = payments.length > 0 ? payments[0].created_at : bill.created_at;

    const pdfBuffer = await generateConsultationReceiptPdf({
      ...bill,
      receipt_number: receiptNumber,
      payment_date: paymentDate,
    });

    await logAudit({
      actor_id: req.user.id,
      action: "DOWNLOAD_OFFICIAL_RECEIPT_PDF",
      target_type: "consultation_bill",
      target_id: bill.id,
      details: {
        receipt_number: receiptNumber,
        bill_number: bill.bill_number,
        appointment_number: bill.appointment_number,
        amount_paid: bill.paid_amount,
        balance_due: bill.balance_due,
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Official_Receipt_${receiptNumber}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error("Download receipt PDF error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to generate receipt PDF." });
  }
});

// -----------------------------------------------------------------------------
// MODULE 15 / LESSON 16.8: OFFICIAL RECEIPT EMAIL DISPATCH WITH PDF ATTACHMENT
// -----------------------------------------------------------------------------
router.post("/bills/:id/email-receipt", async (req, res) => {
  try {
    const rawParam = req.params.id;
    const { email } = req.body;

    let query = `
      SELECT cb.*,
             h.name AS hospital_name,
             h.phone AS hospital_phone,
             h.email AS hospital_email,
             h.address AS hospital_address,
             h.upi_id,
             pat.full_name AS patient_name,
             pat.email AS patient_email,
             pat.phone AS patient_phone,
             doc.full_name AS doctor_name,
             dp.specialization AS doctor_specialization,
             d.name AS department_name,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time
      FROM consultation_bills cb
      LEFT JOIN hospitals h ON h.id = cb.hospital_id
      LEFT JOIN users pat ON pat.id = cb.patient_id
      LEFT JOIN users doc ON doc.id = cb.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = cb.doctor_id
      LEFT JOIN appointments a ON a.id = cb.appointment_id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE `;

    const params = [];
    if (/^\d+$/.test(rawParam)) {
      query += "cb.id = ?";
      params.push(parseInt(rawParam, 10));
    } else {
      query += "cb.bill_number = ?";
      params.push(rawParam);
    }
    query += " LIMIT 1";

    const [bills] = await pool.query(query, params);
    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Hospital Isolation Check
    if (req.user.role === "patient" && bill.patient_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to patient bill." });
    }
    if (req.user.role === "doctor" && bill.doctor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied to doctor bill." });
    }
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const targetEmail = (email && String(email).trim()) || bill.patient_email;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!targetEmail || !emailRegex.test(targetEmail)) {
      return res.status(400).json({ success: false, message: "Valid recipient email address is required." });
    }

    // Fetch payments
    const [payments] = await pool.query(
      `SELECT cp.*, collector.full_name AS collector_name
       FROM consultation_payments cp
       LEFT JOIN users collector ON collector.id = cp.collected_by
       WHERE cp.bill_id = ?
       ORDER BY cp.id DESC`,
      [bill.id]
    );
    bill.payments = payments;

    const latestReceipt = payments.length > 0 ? payments[0].receipt_number : bill.bill_number;
    const paymentDate = payments.length > 0 ? payments[0].created_at : bill.created_at;
    const amountPaid = payments.length > 0 ? Number(payments[0].amount).toFixed(2) : Number(bill.paid_amount).toFixed(2);
    const totalAmount = Number(bill.total_amount).toFixed(2);
    const balanceDue = Number(bill.balance_due).toFixed(2);

    // 1. Generate Official Receipt PDF Buffer (Module 15 Requirement)
    const pdfBuffer = await generateConsultationReceiptPdf({
      ...bill,
      receipt_number: latestReceipt,
      payment_date: paymentDate,
    });

    // 2. Email Subject & Body according to Module 15 Specifications
    const emailSubject = `Official Payment Receipt – ${latestReceipt}`;

    const emailText = `Dear ${bill.patient_name},

Please find attached your official payment receipt for your consultation.

Official Receipt Summary:
- Patient Name: ${bill.patient_name}
- Receipt Number: ${latestReceipt}
- Appointment Reference: ${bill.appointment_number}
- Hospital Name: ${bill.hospital_name}
- Total Amount: Rs. ${totalAmount}
- Paid Amount: Rs. ${amountPaid}
- Balance Due: Rs. ${balanceDue}

The official receipt PDF is attached to this email for your insurance and medical records.

Sincerely,
${bill.hospital_name}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 18px;">Official Payment Receipt</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Receipt #: <strong>${latestReceipt}</strong> | Invoice #: <strong>${bill.bill_number}</strong></p>
        </div>
        <p style="color: #334155; font-size: 14px;">Dear <strong>${bill.patient_name}</strong>,</p>
        <p style="color: #334155; font-size: 14px;">Thank you for your visit. Your official consultation payment receipt has been issued and is attached as a PDF to this email.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Hospital Name:</td><td style="padding: 7px 0; font-weight: 600; text-align: right; color: #0f172a;">${bill.hospital_name}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Patient Name:</td><td style="padding: 7px 0; font-weight: 600; text-align: right; color: #0f172a;">${bill.patient_name}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Receipt Number:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #0284c7;">${latestReceipt}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Appointment Reference:</td><td style="padding: 7px 0; font-weight: 600; text-align: right; color: #0f172a;">${bill.appointment_number}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Total Amount:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #0284c7;">₹${totalAmount}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Paid Amount:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #16a34a;">₹${amountPaid}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Balance Due:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: ${Number(balanceDue) > 0 ? '#ea580c' : '#0f172a'};">₹${balanceDue}</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Consulting Physician:</td><td style="padding: 7px 0; text-align: right; color: #334155;">Dr. ${bill.doctor_name}</td></tr>
          </table>
        </div>

        <p style="color: #334155; font-size: 13px;">The official receipt PDF has been attached to this email. You can download and keep it for your tax, clinical, and insurance records.</p>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">Statutory Healthcare Exemption: Clinical consultation services are exempt from GST under Indian Tax Laws.</p>
      </div>
    `;

    // 3. Dispatch Email with Attached PDF
    const emailResult = await sendEmail({
      to: targetEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
      attachments: [
        {
          filename: `Official_Receipt_${latestReceipt}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // 4. Log Audit Trail
    await logAudit({
      actor_id: req.user.id,
      action: "DISPATCH_OFFICIAL_RECEIPT_EMAIL",
      target_type: "consultation_bill",
      target_id: bill.id,
      details: {
        recipient: targetEmail,
        receipt_number: latestReceipt,
        bill_number: bill.bill_number,
        appointment_number: bill.appointment_number,
        pdf_attached: true,
        delivery_mode: emailResult.mode,
        messageId: emailResult.messageId,
      },
    });

    const isMock = emailResult.mode === "dev_mock";
    const statusNote = isMock
      ? ` (Development Mock: Recorded in system log. To deliver live emails to your real inbox, enter your Google App Password in backend/.env under SMTP_PASS).`
      : ` (Live SMTP delivery confirmed).`;

    return res.json({
      success: true,
      message: `Receipt email dispatched successfully to ${targetEmail}.${statusNote}`,
      data: {
        recipient: targetEmail,
        receipt_number: latestReceipt,
        messageId: emailResult.messageId,
        pdf_attached: true,
        delivery_mode: emailResult.mode,
      },
    });
  } catch (err) {
    console.error("Manual email receipt dispatch error:", err.message);
    return res.status(500).json({ success: false, message: err.message || "Failed to dispatch receipt email." });
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.3: CANCEL CONSULTATION BILL
// -----------------------------------------------------------------------------
router.post("/bills/:id/cancel", allowRoles("hospital_admin", "super_admin"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const rawParam = req.params.id;
    const { reason } = req.body;

    await connection.beginTransaction();

    let query = "SELECT * FROM consultation_bills WHERE ";
    const params = [];
    if (/^\d+$/.test(rawParam)) {
      query += "id = ?";
      params.push(parseInt(rawParam, 10));
    } else {
      query += "bill_number = ?";
      params.push(rawParam);
    }
    query += " FOR UPDATE";

    const [bills] = await connection.query(query, params);
    if (bills.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Hospital isolation check
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (bill.status === "cancelled") {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Bill is already cancelled." });
    }

    if (Number(bill.paid_amount) > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a bill with active payments. Please refund settled amounts first.",
      });
    }

    await connection.query(
      "UPDATE consultation_bills SET status = 'cancelled', notes = CONCAT(IFNULL(notes, ''), ' [Cancelled: ', ?, ']') WHERE id = ?",
      [reason || "Administrative cancellation", bill.id]
    );

    await logAudit({
      actor_id: req.user.id,
      action: "CANCEL_CONSULTATION_BILL",
      target_type: "consultation_bill",
      target_id: bill.id,
      details: { bill_number: bill.bill_number, reason },
    });

    await connection.commit();

    return res.json({
      success: true,
      message: `Consultation bill ${bill.bill_number} has been cancelled successfully.`,
      data: { id: bill.id, bill_number: bill.bill_number, status: "cancelled" },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Consultation bill cancel error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// LESSON 16.3: REFUND CONSULTATION PAYMENT
// -----------------------------------------------------------------------------
router.post("/bills/:id/refund", allowRoles("hospital_admin", "super_admin"), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const rawParam = req.params.id;
    const { refund_amount, reason } = req.body;

    const rAmount = Number(refund_amount);
    if (isNaN(rAmount) || rAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive refund amount is required." });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: "Refund reason is mandatory." });
    }

    await connection.beginTransaction();

    let query = "SELECT * FROM consultation_bills WHERE ";
    const params = [];
    if (/^\d+$/.test(rawParam)) {
      query += "id = ?";
      params.push(parseInt(rawParam, 10));
    } else {
      query += "bill_number = ?";
      params.push(rawParam);
    }
    query += " FOR UPDATE";

    const [bills] = await connection.query(query, params);
    if (bills.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Consultation bill not found." });
    }

    const bill = bills[0];

    // Hospital isolation check
    const userHospId = getUserHospitalId(req.user);
    if (req.user.role !== "super_admin" && userHospId && bill.hospital_id !== userHospId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const currentPaid = Number(bill.paid_amount);
    if (currentPaid <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "No cleared payments available to refund." });
    }

    if (rAmount > currentPaid + 0.01) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Refund amount ₹${rAmount.toFixed(2)} exceeds total paid amount of ₹${currentPaid.toFixed(2)}.`,
      });
    }

    // Generate refund receipt
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    const refundReceiptNumber = `CRFD-${dateStr}-${rand}`;

    // Record refund in consultation_payments with status 'refunded'
    await connection.query(
      `INSERT INTO consultation_payments
         (receipt_number, bill_id, appointment_id, hospital_id, patient_id, amount,
          payment_method, payment_status, notes, collected_by)
       VALUES (?, ?, ?, ?, ?, ?, 'cash', 'refunded', ?, ?)`,
      [
        refundReceiptNumber,
        bill.id,
        bill.appointment_id,
        bill.hospital_id,
        bill.patient_id,
        rAmount,
        reason.trim(),
        req.user.id,
      ]
    );

    // Update bill totals
    const newPaidAmount = Math.max(0, currentPaid - rAmount);
    const newBalanceDue = Math.max(0, Number(bill.total_amount) - newPaidAmount);
    const newBillStatus = newPaidAmount <= 0.01 ? "refunded" : "partially_paid";

    await connection.query(
      "UPDATE consultation_bills SET paid_amount = ?, balance_due = ?, status = ? WHERE id = ?",
      [newPaidAmount, newBalanceDue, newBillStatus, bill.id]
    );

    await logAudit({
      actor_id: req.user.id,
      action: "REFUND_CONSULTATION_PAYMENT",
      target_type: "consultation_bill",
      target_id: bill.id,
      details: {
        bill_number: bill.bill_number,
        refund_receipt: refundReceiptNumber,
        refund_amount: rAmount,
        new_paid_amount: newPaidAmount,
        new_status: newBillStatus,
        reason,
      },
    });

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: `Refund of ₹${rAmount.toFixed(2)} processed successfully. Refund Receipt #${refundReceiptNumber}.`,
      data: {
        bill_id: bill.id,
        bill_number: bill.bill_number,
        refund_receipt: refundReceiptNumber,
        refund_amount: rAmount,
        paid_amount: newPaidAmount,
        balance_due: newBalanceDue,
        status: newBillStatus,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Consultation refund error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  } finally {
    connection.release();
  }
});

module.exports = router;
