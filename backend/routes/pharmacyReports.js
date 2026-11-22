const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

/**
 * Normalizes hospital ID from authenticated user token
 */
function getUserHospitalId(user) {
  if (!user) return null;
  return user.hospitalId || user.hospital_id || null;
}

/**
 * Checks authorization for pharmacy reporting
 * Allowed roles: super_admin, hospital_admin, staff (pharmacist/inventory), receptionist (billing reports), doctor, patient (own reports)
 */
function checkReportingAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  const role = req.user.role;
  const allowed = ["super_admin", "hospital_admin", "staff", "receptionist", "doctor", "patient"];
  if (!allowed.includes(role)) {
    return res.status(403).json({ success: false, message: "Permission denied for pharmacy reports." });
  }
  next();
}

/**
 * Builds hospital scoping condition based on user role and query
 */
function getHospitalScope(user, queryHospitalId) {
  if (user.role === "super_admin") {
    if (queryHospitalId && !isNaN(parseInt(queryHospitalId, 10))) {
      return { hospitalId: parseInt(queryHospitalId, 10), isScoped: true };
    }
    return { hospitalId: null, isScoped: false }; // Cross-hospital view for super admin
  }
  const hid = getUserHospitalId(user);
  return { hospitalId: hid ? parseInt(hid, 10) : null, isScoped: true };
}

/**
 * ============================================================================
 * LESSON 17.6: PHARMACY DASHBOARD SUMMARY
 * ============================================================================
 * GET /api/pharmacy/reports/dashboard-summary
 */
router.get("/dashboard-summary", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    const { startDate, endDate, hospital_id } = req.query;
    const scope = getHospitalScope(req.user, hospital_id);

    // Patients only see their own summary if permitted
    const isPatient = req.user.role === "patient";
    const patientId = isPatient ? req.user.id : null;

    // Date filters (inclusive 00:00:00 to 23:59:59)
    let dateFilterBills = "";
    let dateFilterPayments = "";
    let dateFilterDispensations = "";
    let dateFilterPurchases = "";
    let dateFilterMovements = "";
    let dateFilterRefunds = "";

    const dateParams = [];
    if (startDate) {
      const s = startDate.includes(":") ? startDate : `${startDate} 00:00:00`;
      dateFilterBills += " AND b.created_at >= ?";
      dateFilterPayments += " AND p.created_at >= ?";
      dateFilterDispensations += " AND d.created_at >= ?";
      dateFilterPurchases += " AND mb.purchase_date >= DATE(?)";
      dateFilterMovements += " AND sm.created_at >= ?";
      dateFilterRefunds += " AND r.created_at >= ?";
      dateParams.push(s);
    }
    if (endDate) {
      const e = endDate.includes(":") ? endDate : `${endDate} 23:59:59`;
      dateFilterBills += " AND b.created_at <= ?";
      dateFilterPayments += " AND p.created_at <= ?";
      dateFilterDispensations += " AND d.created_at <= ?";
      dateFilterPurchases += " AND mb.purchase_date <= DATE(?)";
      dateFilterMovements += " AND sm.created_at <= ?";
      dateFilterRefunds += " AND r.created_at <= ?";
      dateParams.push(e);
    }

    // 1. Bills aggregate
    let billsSql = `
      SELECT 
        COUNT(b.id) AS total_bills_count,
        COALESCE(SUM(b.grand_total), 0) AS total_bills_amount,
        COALESCE(SUM(b.paid_amount), 0) AS total_bills_paid_recorded,
        COALESCE(SUM(b.balance_due), 0) AS total_balance_due,
        COUNT(CASE WHEN b.status = 'paid' THEN 1 END) AS paid_bills_count,
        COUNT(CASE WHEN b.status = 'partially_paid' THEN 1 END) AS partially_paid_bills_count,
        COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS pending_bills_count,
        COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bills_count,
        COUNT(CASE WHEN b.status = 'refunded' THEN 1 END) AS refunded_bills_count
      FROM pharmacy_bills b
      WHERE 1=1
    `;
    const billsParams = [];
    if (scope.isScoped && scope.hospitalId) {
      billsSql += " AND b.hospital_id = ?";
      billsParams.push(scope.hospitalId);
    }
    if (isPatient) {
      billsSql += " AND b.patient_id = ?";
      billsParams.push(patientId);
    }
    if (startDate) billsParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    if (endDate) billsParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    billsSql += dateFilterBills;

    const [billAggRows] = await pool.query(billsSql, billsParams);
    const billAgg = billAggRows[0] || {};

    // 2. Payments aggregate (Strict financial accuracy: sum completed payments directly)
    let paySql = `
      SELECT 
        COUNT(p.id) AS total_payments_count,
        COALESCE(SUM(CASE WHEN p.payment_status = 'completed' THEN p.amount ELSE 0 END), 0) AS completed_payments_amount,
        COALESCE(SUM(CASE WHEN p.payment_status = 'pending' THEN p.amount ELSE 0 END), 0) AS pending_payments_amount,
        COUNT(CASE WHEN p.payment_status = 'failed' THEN 1 END) AS failed_payments_count,
        COUNT(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'cash' THEN 1 END) AS cash_payments_count,
        COUNT(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'upi' THEN 1 END) AS upi_payments_count,
        COUNT(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'card' THEN 1 END) AS card_payments_count,
        COALESCE(SUM(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0) AS cash_collected_amount,
        COALESCE(SUM(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'upi' THEN p.amount ELSE 0 END), 0) AS upi_collected_amount,
        COALESCE(SUM(CASE WHEN p.payment_status = 'completed' AND p.payment_method = 'card' THEN p.amount ELSE 0 END), 0) AS card_collected_amount
      FROM pharmacy_payments p
      WHERE 1=1
    `;
    const payParams = [];
    if (scope.isScoped && scope.hospitalId) {
      paySql += " AND p.hospital_id = ?";
      payParams.push(scope.hospitalId);
    }
    if (isPatient) {
      paySql += " AND p.patient_id = ?";
      payParams.push(patientId);
    }
    if (startDate) payParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    if (endDate) payParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    paySql += dateFilterPayments;

    const [payAggRows] = await pool.query(paySql, payParams);
    const payAgg = payAggRows[0] || {};

    // 3. Refunds aggregate
    let refSql = `
      SELECT 
        COUNT(r.id) AS total_refunds_count,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN r.refund_amount ELSE 0 END), 0) AS completed_refunds_amount
      FROM pharmacy_refunds r
      WHERE 1=1
    `;
    const refParams = [];
    if (scope.isScoped && scope.hospitalId) {
      refSql += " AND r.hospital_id = ?";
      refParams.push(scope.hospitalId);
    }
    if (isPatient) {
      refSql += " AND r.patient_id = ?";
      refParams.push(patientId);
    }
    if (startDate) refParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    if (endDate) refParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    refSql += dateFilterRefunds;

    const [refAggRows] = await pool.query(refSql, refParams);
    const refAgg = refAggRows[0] || {};

    // 4. Dispensations aggregate
    let dispSql = `
      SELECT 
        COUNT(d.id) AS total_dispensations_count,
        COUNT(CASE WHEN d.payment_status = 'paid' THEN 1 END) AS paid_dispensations_count,
        COUNT(CASE WHEN d.payment_status = 'unpaid' THEN 1 END) AS unpaid_dispensations_count,
        COALESCE(SUM(d.total_amount), 0) AS total_dispensed_amount
      FROM pharmacy_dispensations d
      WHERE 1=1
    `;
    const dispParams = [];
    if (scope.isScoped && scope.hospitalId) {
      dispSql += " AND d.hospital_id = ?";
      dispParams.push(scope.hospitalId);
    }
    if (isPatient) {
      dispSql += " AND d.patient_id = ?";
      dispParams.push(patientId);
    }
    if (startDate) dispParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    if (endDate) dispParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    dispSql += dateFilterDispensations;

    const [dispAggRows] = await pool.query(dispSql, dispParams);
    const dispAgg = dispAggRows[0] || {};

    // 5. Prescriptions partially dispensed count
    let rxSql = `
      SELECT 
        COUNT(CASE WHEN pr.status = 'partially_dispensed' THEN 1 END) AS partially_dispensed_prescriptions,
        COUNT(CASE WHEN pr.status = 'dispensed' THEN 1 END) AS fully_dispensed_prescriptions
      FROM prescriptions pr
      WHERE 1=1
    `;
    const rxParams = [];
    if (scope.isScoped && scope.hospitalId) {
      rxSql += " AND pr.hospital_id = ?";
      rxParams.push(scope.hospitalId);
    }
    if (isPatient) {
      rxSql += " AND pr.patient_id = ?";
      rxParams.push(patientId);
    }
    const [rxAggRows] = await pool.query(rxSql, rxParams);
    const rxAgg = rxAggRows[0] || {};

    // 6. Purchases & Stock Procurement aggregate (Excluded for patients/receptionists)
    let purchaseExpenditure = 0;
    let purchaseBatchesCount = 0;
    let stockAdjustmentsCount = 0;

    if (!isPatient && req.user.role !== "receptionist") {
      let purchSql = `
        SELECT 
          COUNT(mb.id) AS total_purchased_batches,
          COALESCE(SUM(mb.initial_quantity * mb.purchase_price), 0) AS total_purchase_expenditure
        FROM medicine_batches mb
        WHERE 1=1
      `;
      const purchParams = [];
      if (scope.isScoped && scope.hospitalId) {
        purchSql += " AND mb.hospital_id = ?";
        purchParams.push(scope.hospitalId);
      }
      if (startDate) purchParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      if (endDate) purchParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      purchSql += dateFilterPurchases;

      const [purchAggRows] = await pool.query(purchSql, purchParams);
      if (purchAggRows.length > 0) {
        purchaseBatchesCount = parseInt(purchAggRows[0].total_purchased_batches, 10) || 0;
        purchaseExpenditure = parseFloat(purchAggRows[0].total_purchase_expenditure) || 0;
      }

      // Stock adjustments
      let moveSql = `
        SELECT COUNT(sm.id) AS adjustments_count
        FROM stock_movements sm
        WHERE sm.movement_type IN ('adjustment_add', 'adjustment_sub', 'return', 'write_off_expired', 'write_off_damaged')
      `;
      const moveParams = [];
      if (scope.isScoped && scope.hospitalId) {
        moveSql += " AND sm.hospital_id = ?";
        moveParams.push(scope.hospitalId);
      }
      if (startDate) moveParams.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      if (endDate) moveParams.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      moveSql += dateFilterMovements;

      const [moveAggRows] = await pool.query(moveSql, moveParams);
      if (moveAggRows.length > 0) {
        stockAdjustmentsCount = parseInt(moveAggRows[0].adjustments_count, 10) || 0;
      }
    }

    // Strict financial computation:
    const grossCollected = parseFloat(payAgg.completed_payments_amount) || 0;
    const refundsAmount = parseFloat(refAgg.completed_refunds_amount) || 0;
    const netRevenue = Math.max(0, Math.round((grossCollected - refundsAmount) * 100) / 100);

    return res.json({
      success: true,
      data: {
        summary: {
          total_bills_count: parseInt(billAgg.total_bills_count, 10) || 0,
          total_bills_amount: parseFloat(billAgg.total_bills_amount) || 0,
          completed_payments_amount: grossCollected,
          pending_dues_amount: parseFloat(billAgg.total_balance_due) || 0,
          failed_payments_count: parseInt(payAgg.failed_payments_count, 10) || 0,
          refund_amount: refundsAmount,
          net_revenue: netRevenue,
          total_dispensations_count: parseInt(dispAgg.total_dispensations_count, 10) || 0,
          partially_dispensed_prescriptions: parseInt(rxAgg.partially_dispensed_prescriptions, 10) || 0,
          purchase_expenditure: Math.round(purchaseExpenditure * 100) / 100,
          purchase_batches_count: purchaseBatchesCount,
          stock_adjustments_count: stockAdjustmentsCount,
        },
        payment_breakdown: {
          cash_amount: parseFloat(payAgg.cash_collected_amount) || 0,
          cash_count: parseInt(payAgg.cash_payments_count, 10) || 0,
          upi_amount: parseFloat(payAgg.upi_collected_amount) || 0,
          upi_count: parseInt(payAgg.upi_payments_count, 10) || 0,
          card_amount: parseFloat(payAgg.card_collected_amount) || 0,
          card_count: parseInt(payAgg.card_payments_count, 10) || 0,
        },
        bill_status_breakdown: {
          paid: parseInt(billAgg.paid_bills_count, 10) || 0,
          partially_paid: parseInt(billAgg.partially_paid_bills_count, 10) || 0,
          pending: parseInt(billAgg.pending_bills_count, 10) || 0,
          cancelled: parseInt(billAgg.cancelled_bills_count, 10) || 0,
          refunded: parseInt(billAgg.refunded_bills_count, 10) || 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate pharmacy dashboard summary." });
  }
});

/**
 * ============================================================================
 * LESSON 17.1, 17.4, 17.5: CENTRALIZED PHARMACY TRANSACTION HISTORY
 * ============================================================================
 * GET /api/pharmacy/reports/transactions
 */
router.get("/transactions", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      startDate,
      endDate,
      type, // 'all', 'bill', 'payment', 'dispensation', 'purchase', 'stock_adjustment', 'refund'
      paymentMethod, // 'cash', 'upi', 'card', 'all'
      paymentStatus, // 'completed', 'pending', 'failed', 'refunded', 'all'
      dispensingStatus, // 'dispensed', 'partially_dispensed', 'pending', 'cancelled', 'all'
      hospital_id,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const scope = getHospitalScope(req.user, hospital_id);
    const isPatient = req.user.role === "patient";
    const patientId = isPatient ? req.user.id : null;

    // Build unified UNION queries across supported operational transaction records
    const subQueries = [];
    const unionParams = [];

    const cleanType = (type || "all").toLowerCase().trim();
    const cleanPayMethod = (paymentMethod || "all").toLowerCase().trim();
    const cleanPayStatus = (paymentStatus || "all").toLowerCase().trim();
    const cleanDispStatus = (dispensingStatus || "all").toLowerCase().trim();
    const searchTerm = search && search.trim() ? `%${search.trim()}%` : null;

    // 1. BILL TRANSACTIONS
    if ((cleanType === "all" || cleanType === "bill") && !cleanPayMethod || cleanPayMethod === "all") {
      let q = `
        SELECT 
          b.id AS underlying_id,
          CONCAT('bill_', b.id) AS transaction_id,
          'bill' AS transaction_type,
          b.bill_number AS transaction_reference,
          b.bill_number AS bill_number,
          b.id AS bill_id,
          pr.prescription_number AS prescription_reference,
          pr.id AS prescription_id,
          b.patient_id,
          pu.full_name AS patient_name,
          pu.email AS patient_email,
          b.grand_total AS amount,
          NULL AS payment_method,
          b.status AS payment_status,
          pr.status AS dispensing_status,
          b.status AS current_status,
          b.hospital_id,
          h.name AS hospital_name,
          cb.full_name AS staff_name,
          b.created_at AS transaction_date,
          (SELECT COUNT(*) FROM pharmacy_bill_items WHERE bill_id = b.id) AS quantity,
          'Pharmacy Bill' AS medicine_summary
        FROM pharmacy_bills b
        JOIN hospitals h ON h.id = b.hospital_id
        JOIN users pu ON pu.id = b.patient_id
        JOIN users cb ON cb.id = b.created_by
        LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
        WHERE 1=1
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND b.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (isPatient) {
        q += " AND b.patient_id = ?";
        params.push(patientId);
      }
      if (startDate) {
        q += " AND b.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND b.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (cleanPayStatus && cleanPayStatus !== "all") {
        q += " AND b.status = ?";
        params.push(cleanPayStatus);
      }
      if (cleanDispStatus && cleanDispStatus !== "all") {
        q += " AND pr.status = ?";
        params.push(cleanDispStatus);
      }
      if (searchTerm) {
        q += ` AND (
          b.bill_number LIKE ? OR
          pu.full_name LIKE ? OR
          pu.email LIKE ? OR
          CAST(b.patient_id AS CHAR) LIKE ? OR
          pr.prescription_number LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    // 2. PAYMENT TRANSACTIONS
    if ((cleanType === "all" || cleanType === "payment") && (!cleanDispStatus || cleanDispStatus === "all")) {
      let q = `
        SELECT 
          p.id AS underlying_id,
          CONCAT('payment_', p.id) AS transaction_id,
          'payment' AS transaction_type,
          p.receipt_number AS transaction_reference,
          b.bill_number AS bill_number,
          b.id AS bill_id,
          pr.prescription_number AS prescription_reference,
          pr.id AS prescription_id,
          p.patient_id,
          pu.full_name AS patient_name,
          pu.email AS patient_email,
          p.amount AS amount,
          p.payment_method AS payment_method,
          p.payment_status AS payment_status,
          NULL AS dispensing_status,
          p.payment_status AS current_status,
          p.hospital_id,
          h.name AS hospital_name,
          cb.full_name AS staff_name,
          p.created_at AS transaction_date,
          1 AS quantity,
          CONCAT('Receipt: ', p.receipt_number, ' (', p.payment_method, ')') AS medicine_summary
        FROM pharmacy_payments p
        JOIN hospitals h ON h.id = p.hospital_id
        JOIN users pu ON pu.id = p.patient_id
        JOIN users cb ON cb.id = p.collected_by
        LEFT JOIN pharmacy_bills b ON b.id = p.bill_id
        LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
        WHERE 1=1
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND p.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (isPatient) {
        q += " AND p.patient_id = ?";
        params.push(patientId);
      }
      if (startDate) {
        q += " AND p.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND p.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (cleanPayMethod && cleanPayMethod !== "all") {
        q += " AND p.payment_method = ?";
        params.push(cleanPayMethod);
      }
      if (cleanPayStatus && cleanPayStatus !== "all") {
        q += " AND p.payment_status = ?";
        params.push(cleanPayStatus);
      }
      if (searchTerm) {
        q += ` AND (
          p.receipt_number LIKE ? OR
          b.bill_number LIKE ? OR
          pu.full_name LIKE ? OR
          pu.email LIKE ? OR
          CAST(p.patient_id AS CHAR) LIKE ? OR
          p.transaction_reference LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    // 3. DISPENSATION TRANSACTIONS
    if ((cleanType === "all" || cleanType === "dispensation") && (!cleanPayMethod || cleanPayMethod === "all")) {
      let q = `
        SELECT 
          d.id AS underlying_id,
          CONCAT('dispensation_', d.id) AS transaction_id,
          'dispensation' AS transaction_type,
          d.dispensation_number AS transaction_reference,
          b.bill_number AS bill_number,
          b.id AS bill_id,
          pr.prescription_number AS prescription_reference,
          pr.id AS prescription_id,
          d.patient_id,
          pu.full_name AS patient_name,
          pu.email AS patient_email,
          d.total_amount AS amount,
          d.payment_method AS payment_method,
          d.payment_status AS payment_status,
          pr.status AS dispensing_status,
          pr.status AS current_status,
          d.hospital_id,
          h.name AS hospital_name,
          db.full_name AS staff_name,
          d.created_at AS transaction_date,
          (SELECT COALESCE(SUM(quantity), 0) FROM pharmacy_dispensation_items WHERE dispensation_id = d.id) AS quantity,
          'Medicine Dispensation' AS medicine_summary
        FROM pharmacy_dispensations d
        JOIN hospitals h ON h.id = d.hospital_id
        JOIN users pu ON pu.id = d.patient_id
        JOIN users db ON db.id = d.dispensed_by
        LEFT JOIN prescriptions pr ON pr.id = d.prescription_id
        LEFT JOIN pharmacy_bills b ON b.id = d.bill_id
        WHERE 1=1
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND d.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (isPatient) {
        q += " AND d.patient_id = ?";
        params.push(patientId);
      }
      if (startDate) {
        q += " AND d.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND d.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (cleanDispStatus && cleanDispStatus !== "all") {
        q += " AND pr.status = ?";
        params.push(cleanDispStatus);
      }
      if (searchTerm) {
        q += ` AND (
          d.dispensation_number LIKE ? OR
          pr.prescription_number LIKE ? OR
          b.bill_number LIKE ? OR
          pu.full_name LIKE ? OR
          pu.email LIKE ? OR
          CAST(d.patient_id AS CHAR) LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    // 4. REFUND TRANSACTIONS
    if ((cleanType === "all" || cleanType === "refund") && (!cleanDispStatus || cleanDispStatus === "all") && (!cleanPayMethod || cleanPayMethod === "all")) {
      let q = `
        SELECT 
          r.id AS underlying_id,
          CONCAT('refund_', r.id) AS transaction_id,
          'refund' AS transaction_type,
          r.refund_number AS transaction_reference,
          b.bill_number AS bill_number,
          b.id AS bill_id,
          NULL AS prescription_reference,
          NULL AS prescription_id,
          r.patient_id,
          pu.full_name AS patient_name,
          pu.email AS patient_email,
          r.refund_amount AS amount,
          p.payment_method AS payment_method,
          'refunded' AS payment_status,
          NULL AS dispensing_status,
          r.status AS current_status,
          r.hospital_id,
          h.name AS hospital_name,
          rb.full_name AS staff_name,
          r.created_at AS transaction_date,
          1 AS quantity,
          CONCAT('Refund: ', r.refund_number, ' - ', r.reason) AS medicine_summary
        FROM pharmacy_refunds r
        JOIN hospitals h ON h.id = r.hospital_id
        JOIN users pu ON pu.id = r.patient_id
        JOIN users rb ON rb.id = r.refunded_by
        JOIN pharmacy_bills b ON b.id = r.bill_id
        JOIN pharmacy_payments p ON p.id = r.payment_id
        WHERE 1=1
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND r.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (isPatient) {
        q += " AND r.patient_id = ?";
        params.push(patientId);
      }
      if (startDate) {
        q += " AND r.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND r.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (searchTerm) {
        q += ` AND (
          r.refund_number LIKE ? OR
          b.bill_number LIKE ? OR
          p.receipt_number LIKE ? OR
          pu.full_name LIKE ? OR
          r.reason LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    // 5. MEDICINE PURCHASES (Batches) - Not visible to patients or receptionists
    if (!isPatient && req.user.role !== "receptionist" && (cleanType === "all" || cleanType === "purchase") && (!cleanPayMethod || cleanPayMethod === "all") && (!cleanPayStatus || cleanPayStatus === "all") && (!cleanDispStatus || cleanDispStatus === "all")) {
      let q = `
        SELECT 
          mb.id AS underlying_id,
          CONCAT('purchase_', mb.id) AS transaction_id,
          'purchase' AS transaction_type,
          mb.batch_number AS transaction_reference,
          NULL AS bill_number,
          NULL AS bill_id,
          NULL AS prescription_reference,
          NULL AS prescription_id,
          NULL AS patient_id,
          s.name AS patient_name, -- Supplier name mapped
          s.email AS patient_email,
          (mb.initial_quantity * mb.purchase_price) AS amount,
          'procurement' AS payment_method,
          mb.status AS payment_status,
          NULL AS dispensing_status,
          mb.status AS current_status,
          mb.hospital_id,
          h.name AS hospital_name,
          rb.full_name AS staff_name,
          mb.created_at AS transaction_date,
          mb.initial_quantity AS quantity,
          CONCAT(m.name, ' (SKU: ', COALESCE(m.sku, 'N/A'), ')') AS medicine_summary
        FROM medicine_batches mb
        JOIN hospitals h ON h.id = mb.hospital_id
        JOIN master_medicines m ON m.id = mb.medicine_id
        JOIN users rb ON rb.id = mb.received_by
        LEFT JOIN suppliers s ON s.id = mb.supplier_id
        WHERE 1=1
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND mb.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (startDate) {
        q += " AND mb.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND mb.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (searchTerm) {
        q += ` AND (
          mb.batch_number LIKE ? OR
          m.name LIKE ? OR
          m.sku LIKE ? OR
          s.name LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    // 6. STOCK ADJUSTMENTS - Not visible to patients or receptionists
    if (!isPatient && req.user.role !== "receptionist" && (cleanType === "all" || cleanType === "stock_adjustment") && (!cleanPayMethod || cleanPayMethod === "all") && (!cleanPayStatus || cleanPayStatus === "all") && (!cleanDispStatus || cleanDispStatus === "all")) {
      let q = `
        SELECT 
          sm.id AS underlying_id,
          CONCAT('movement_', sm.id) AS transaction_id,
          'stock_adjustment' AS transaction_type,
          CONCAT('SM-', sm.id) AS transaction_reference,
          NULL AS bill_number,
          NULL AS bill_id,
          NULL AS prescription_reference,
          NULL AS prescription_id,
          NULL AS patient_id,
          NULL AS patient_name,
          NULL AS patient_email,
          0.00 AS amount,
          NULL AS payment_method,
          sm.movement_type AS payment_status,
          NULL AS dispensing_status,
          sm.movement_type AS current_status,
          sm.hospital_id,
          h.name AS hospital_name,
          pb.full_name AS staff_name,
          sm.created_at AS transaction_date,
          sm.quantity_change AS quantity,
          CONCAT(m.name, ' (', sm.movement_type, ')') AS medicine_summary
        FROM stock_movements sm
        JOIN hospitals h ON h.id = sm.hospital_id
        JOIN master_medicines m ON m.id = sm.medicine_id
        JOIN users pb ON pb.id = sm.performed_by
        WHERE sm.movement_type IN ('adjustment_add', 'adjustment_sub', 'return', 'write_off_expired', 'write_off_damaged')
      `;
      const params = [];
      if (scope.isScoped && scope.hospitalId) {
        q += " AND sm.hospital_id = ?";
        params.push(scope.hospitalId);
      }
      if (startDate) {
        q += " AND sm.created_at >= ?";
        params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
      }
      if (endDate) {
        q += " AND sm.created_at <= ?";
        params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
      }
      if (searchTerm) {
        q += ` AND (
          m.name LIKE ? OR
          m.sku LIKE ? OR
          sm.reason LIKE ? OR
          CONCAT('SM-', sm.id) LIKE ?
        )`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
      subQueries.push(q);
      unionParams.push(...params);
    }

    if (subQueries.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0, total_pages: 0 },
      });
    }

    const fullUnionSql = subQueries.join(" UNION ALL ");

    // Count total query
    const countSql = `SELECT COUNT(*) AS total FROM (${fullUnionSql}) AS unified_timeline`;
    const [countRows] = await pool.query(countSql, unionParams);
    const totalRecords = countRows[0]?.total || 0;

    // Paginated list query
    const paginatedSql = `
      SELECT * FROM (${fullUnionSql}) AS unified_timeline
      ORDER BY transaction_date DESC
      LIMIT ? OFFSET ?
    `;
    const finalParams = [...unionParams, limitNum, offset];
    const [rows] = await pool.query(paginatedSql, finalParams);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum),
        total_pages: Math.ceil(totalRecords / limitNum),
      },
    });
  } catch (error) {
    console.error("List pharmacy transactions error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve pharmacy transaction history." });
  }
});

/**
 * ============================================================================
 * LESSON 17.2 & 17.3: BILL & PRESCRIPTION REFERENCE TRACKING & DEEP DETAILS
 * ============================================================================
 * GET /api/pharmacy/reports/transactions/:type/:id
 */
router.get("/transactions/:type/:id", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    const { type, id } = req.params;
    const recordId = parseInt(id, 10);
    if (!type || isNaN(recordId)) {
      return res.status(400).json({ success: false, message: "Invalid transaction reference parameters." });
    }

    const scope = getHospitalScope(req.user, null);
    const isPatient = req.user.role === "patient";

    if (type === "bill") {
      // 1. Bill details
      const [bills] = await pool.query(
        `SELECT b.*, 
                h.name AS hospital_name, 
                u.full_name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
                cb.full_name AS created_by_name,
                pr.prescription_number, pr.status AS prescription_status, pr.general_instructions,
                doc.full_name AS doctor_name, doc.id AS doctor_id
         FROM pharmacy_bills b
         JOIN hospitals h ON h.id = b.hospital_id
         JOIN users u ON u.id = b.patient_id
         JOIN users cb ON cb.id = b.created_by
         LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
         LEFT JOIN users doc ON doc.id = pr.doctor_id
         WHERE b.id = ?`,
        [recordId]
      );

      if (bills.length === 0) {
        return res.status(404).json({ success: false, message: "Pharmacy bill transaction not found." });
      }

      const bill = bills[0];

      // Hospital & patient authorization checks
      if (scope.isScoped && scope.hospitalId && bill.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }
      if (isPatient && bill.patient_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied. Patient mismatch." });
      }

      // Bill items
      const [items] = await pool.query(
        `SELECT bi.*, m.category, m.form AS standard_form, m.strength
         FROM pharmacy_bill_items bi
         LEFT JOIN master_medicines m ON m.id = bi.medicine_id
         WHERE bi.bill_id = ?
         ORDER BY bi.id ASC`,
        [bill.id]
      );

      // Associated payments
      const [payments] = await pool.query(
        `SELECT p.*, u.full_name AS collected_by_name
         FROM pharmacy_payments p
         JOIN users u ON u.id = p.collected_by
         WHERE p.bill_id = ?
         ORDER BY p.created_at ASC`,
        [bill.id]
      );

      // Associated dispensations
      const [dispensations] = await pool.query(
        `SELECT d.*, u.full_name AS dispensed_by_name
         FROM pharmacy_dispensations d
         JOIN users u ON u.id = d.dispensed_by
         WHERE d.bill_id = ?
         ORDER BY d.created_at ASC`,
        [bill.id]
      );

      // Associated refunds
      const [refunds] = await pool.query(
        `SELECT r.*, u.full_name AS refunded_by_name
         FROM pharmacy_refunds r
         JOIN users u ON u.id = r.refunded_by
         WHERE r.bill_id = ?
         ORDER BY r.created_at ASC`,
        [bill.id]
      );

      return res.json({
        success: true,
        data: {
          transaction_type: "bill",
          bill,
          items,
          payments,
          dispensations,
          refunds,
        },
      });
    } else if (type === "payment") {
      const [payments] = await pool.query(
        `SELECT p.*, h.name AS hospital_name, 
                u.full_name AS patient_name, u.email AS patient_email,
                cb.full_name AS collected_by_name,
                b.bill_number, b.grand_total AS bill_grand_total, b.paid_amount AS bill_paid_amount, b.balance_due AS bill_balance_due, b.status AS bill_status,
                pr.prescription_number, pr.id AS prescription_id
         FROM pharmacy_payments p
         JOIN hospitals h ON h.id = p.hospital_id
         JOIN users u ON u.id = p.patient_id
         JOIN users cb ON cb.id = p.collected_by
         JOIN pharmacy_bills b ON b.id = p.bill_id
         LEFT JOIN prescriptions pr ON pr.id = b.prescription_id
         WHERE p.id = ?`,
        [recordId]
      );

      if (payments.length === 0) {
        return res.status(404).json({ success: false, message: "Pharmacy payment transaction not found." });
      }

      const payment = payments[0];
      if (scope.isScoped && scope.hospitalId && payment.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }
      if (isPatient && payment.patient_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied. Patient mismatch." });
      }

      // Check for refund on this payment
      const [refunds] = await pool.query(
        `SELECT r.*, u.full_name AS refunded_by_name
         FROM pharmacy_refunds r
         JOIN users u ON u.id = r.refunded_by
         WHERE r.payment_id = ?`,
        [payment.id]
      );

      return res.json({
        success: true,
        data: {
          transaction_type: "payment",
          payment,
          refunds,
        },
      });
    } else if (type === "dispensation") {
      const [disps] = await pool.query(
        `SELECT d.*, h.name AS hospital_name,
                u.full_name AS patient_name, u.email AS patient_email,
                db.full_name AS dispensed_by_name,
                pr.prescription_number, pr.status AS prescription_status,
                b.bill_number, b.grand_total AS bill_grand_total, b.status AS bill_status
         FROM pharmacy_dispensations d
         JOIN hospitals h ON h.id = d.hospital_id
         JOIN users u ON u.id = d.patient_id
         JOIN users db ON db.id = d.dispensed_by
         LEFT JOIN prescriptions pr ON pr.id = d.prescription_id
         LEFT JOIN pharmacy_bills b ON b.id = d.bill_id
         WHERE d.id = ?`,
        [recordId]
      );

      if (disps.length === 0) {
        return res.status(404).json({ success: false, message: "Dispensation transaction not found." });
      }

      const dispensation = disps[0];
      if (scope.isScoped && scope.hospitalId && dispensation.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }
      if (isPatient && dispensation.patient_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied. Patient mismatch." });
      }

      // Dispensed item details with batch info
      const [items] = await pool.query(
        `SELECT di.*, m.name AS medicine_name, m.sku, m.form AS dosage_form,
                mb.batch_number, mb.expiry_date
         FROM pharmacy_dispensation_items di
         JOIN master_medicines m ON m.id = di.medicine_id
         JOIN medicine_batches mb ON mb.id = di.batch_id
         WHERE di.dispensation_id = ?`,
        [dispensation.id]
      );

      return res.json({
        success: true,
        data: {
          transaction_type: "dispensation",
          dispensation,
          items,
        },
      });
    } else if (type === "purchase") {
      if (isPatient || req.user.role === "receptionist") {
        return res.status(403).json({ success: false, message: "Permission denied for procurement records." });
      }
      const [batches] = await pool.query(
        `SELECT mb.*, h.name AS hospital_name,
                m.name AS medicine_name, m.sku, m.form AS dosage_form, m.strength,
                s.name AS supplier_name, s.contact_person, s.phone AS supplier_phone, s.email AS supplier_email,
                rb.full_name AS received_by_name
         FROM medicine_batches mb
         JOIN hospitals h ON h.id = mb.hospital_id
         JOIN master_medicines m ON m.id = mb.medicine_id
         JOIN users rb ON rb.id = mb.received_by
         LEFT JOIN suppliers s ON s.id = mb.supplier_id
         WHERE mb.id = ?`,
        [recordId]
      );

      if (batches.length === 0) {
        return res.status(404).json({ success: false, message: "Batch procurement record not found." });
      }

      const batch = batches[0];
      if (scope.isScoped && scope.hospitalId && batch.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }

      const [movements] = await pool.query(
        `SELECT sm.*, u.full_name AS performed_by_name
         FROM stock_movements sm
         JOIN users u ON u.id = sm.performed_by
         WHERE sm.batch_id = ?
         ORDER BY sm.created_at ASC`,
        [batch.id]
      );

      return res.json({
        success: true,
        data: {
          transaction_type: "purchase",
          batch,
          movements,
        },
      });
    } else if (type === "refund") {
      const [refunds] = await pool.query(
        `SELECT r.*, h.name AS hospital_name,
                u.full_name AS patient_name, u.email AS patient_email,
                rb.full_name AS refunded_by_name,
                p.receipt_number, p.amount AS original_payment_amount, p.payment_method,
                b.bill_number, b.grand_total AS bill_grand_total, b.status AS bill_status
         FROM pharmacy_refunds r
         JOIN hospitals h ON h.id = r.hospital_id
         JOIN users u ON u.id = r.patient_id
         JOIN users rb ON rb.id = r.refunded_by
         JOIN pharmacy_payments p ON p.id = r.payment_id
         JOIN pharmacy_bills b ON b.id = r.bill_id
         WHERE r.id = ?`,
        [recordId]
      );

      if (refunds.length === 0) {
        return res.status(404).json({ success: false, message: "Refund record not found." });
      }

      const refund = refunds[0];
      if (scope.isScoped && scope.hospitalId && refund.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }
      if (isPatient && refund.patient_id !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access denied. Patient mismatch." });
      }

      return res.json({
        success: true,
        data: {
          transaction_type: "refund",
          refund,
        },
      });
    } else if (type === "movement" || type === "stock_adjustment") {
      if (isPatient || req.user.role === "receptionist") {
        return res.status(403).json({ success: false, message: "Permission denied for inventory movement records." });
      }
      const [movements] = await pool.query(
        `SELECT sm.*, h.name AS hospital_name,
                m.name AS medicine_name, m.sku, m.form AS dosage_form,
                mb.batch_number, mb.expiry_date, mb.current_quantity AS batch_current_quantity,
                pb.full_name AS performed_by_name
         FROM stock_movements sm
         JOIN hospitals h ON h.id = sm.hospital_id
         JOIN master_medicines m ON m.id = sm.medicine_id
         JOIN medicine_batches mb ON mb.id = sm.batch_id
         JOIN users pb ON pb.id = sm.performed_by
         WHERE sm.id = ?`,
        [recordId]
      );

      if (movements.length === 0) {
        return res.status(404).json({ success: false, message: "Stock movement record not found." });
      }

      const movement = movements[0];
      if (scope.isScoped && scope.hospitalId && movement.hospital_id !== scope.hospitalId) {
        return res.status(403).json({ success: false, message: "Access denied. Cross-hospital transaction access prohibited." });
      }

      return res.json({
        success: true,
        data: {
          transaction_type: "stock_adjustment",
          movement,
        },
      });
    } else {
      return res.status(400).json({ success: false, message: `Unsupported transaction type: '${type}'.` });
    }
  } catch (error) {
    console.error("Fetch transaction details error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve transaction reference details." });
  }
});

/**
 * ============================================================================
 * LESSON 17.7A: DEDICATED PURCHASE / PROCUREMENT HISTORY
 * ============================================================================
 * GET /api/pharmacy/reports/purchases
 */
router.get("/purchases", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    if (req.user.role === "patient" || req.user.role === "receptionist") {
      return res.status(403).json({ success: false, message: "Permission denied for procurement history." });
    }
    const { page = 1, limit = 20, search, startDate, endDate, hospital_id } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const scope = getHospitalScope(req.user, hospital_id);

    let query = `
      SELECT mb.*, 
             h.name AS hospital_name,
             m.name AS medicine_name, m.sku, m.form AS dosage_form,
             s.name AS supplier_name, s.contact_person AS supplier_contact,
             rb.full_name AS received_by_name,
             (mb.initial_quantity * mb.purchase_price) AS total_purchase_cost
      FROM medicine_batches mb
      JOIN hospitals h ON h.id = mb.hospital_id
      JOIN master_medicines m ON m.id = mb.medicine_id
      JOIN users rb ON rb.id = mb.received_by
      LEFT JOIN suppliers s ON s.id = mb.supplier_id
      WHERE 1=1
    `;
    const params = [];

    if (scope.isScoped && scope.hospitalId) {
      query += " AND mb.hospital_id = ?";
      params.push(scope.hospitalId);
    }
    if (startDate) {
      query += " AND mb.purchase_date >= DATE(?)";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND mb.purchase_date <= DATE(?)";
      params.push(endDate);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += " AND (mb.batch_number LIKE ? OR m.name LIKE ? OR m.sku LIKE ? OR s.name LIKE ?)";
      params.push(term, term, term, term);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0]?.total || 0;

    query += " ORDER BY mb.purchase_date DESC, mb.id DESC LIMIT ? OFFSET ?";
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
    console.error("Procurement history error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve procurement history." });
  }
});

/**
 * ============================================================================
 * LESSON 17.7B: DEDICATED DISPENSING HISTORY
 * ============================================================================
 * GET /api/pharmacy/reports/dispensations
 */
router.get("/dispensations", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, startDate, endDate, hospital_id, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const scope = getHospitalScope(req.user, hospital_id);
    const isPatient = req.user.role === "patient";

    let query = `
      SELECT d.*, 
             h.name AS hospital_name,
             u.full_name AS patient_name, u.email AS patient_email,
             db.full_name AS dispensed_by_name,
             pr.prescription_number, pr.status AS prescription_status,
             b.bill_number, b.status AS bill_status,
             (SELECT COUNT(*) FROM pharmacy_dispensation_items WHERE dispensation_id = d.id) AS item_count,
             (SELECT COALESCE(SUM(quantity), 0) FROM pharmacy_dispensation_items WHERE dispensation_id = d.id) AS total_units_dispensed
      FROM pharmacy_dispensations d
      JOIN hospitals h ON h.id = d.hospital_id
      JOIN users u ON u.id = d.patient_id
      JOIN users db ON db.id = d.dispensed_by
      LEFT JOIN prescriptions pr ON pr.id = d.prescription_id
      LEFT JOIN pharmacy_bills b ON b.id = d.bill_id
      WHERE 1=1
    `;
    const params = [];

    if (scope.isScoped && scope.hospitalId) {
      query += " AND d.hospital_id = ?";
      params.push(scope.hospitalId);
    }
    if (isPatient) {
      query += " AND d.patient_id = ?";
      params.push(req.user.id);
    }
    if (startDate) {
      query += " AND d.created_at >= ?";
      params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    }
    if (endDate) {
      query += " AND d.created_at <= ?";
      params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    }
    if (status && status !== "all") {
      query += " AND pr.status = ?";
      params.push(status);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += " AND (d.dispensation_number LIKE ? OR pr.prescription_number LIKE ? OR b.bill_number LIKE ? OR u.full_name LIKE ?)";
      params.push(term, term, term, term);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0]?.total || 0;

    query += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?";
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
    console.error("Dispensing history error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve dispensing history." });
  }
});

/**
 * ============================================================================
 * LESSON 17.7C: DEDICATED REFUND AUDIT HISTORY
 * ============================================================================
 * GET /api/pharmacy/reports/refunds
 */
router.get("/refunds", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, startDate, endDate, hospital_id } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const scope = getHospitalScope(req.user, hospital_id);
    const isPatient = req.user.role === "patient";

    let query = `
      SELECT r.*,
             h.name AS hospital_name,
             u.full_name AS patient_name, u.email AS patient_email,
             rb.full_name AS refunded_by_name,
             p.receipt_number, p.amount AS original_payment_amount, p.payment_method,
             b.bill_number, b.grand_total AS bill_grand_total
      FROM pharmacy_refunds r
      JOIN hospitals h ON h.id = r.hospital_id
      JOIN users u ON u.id = r.patient_id
      JOIN users rb ON rb.id = r.refunded_by
      JOIN pharmacy_payments p ON p.id = r.payment_id
      JOIN pharmacy_bills b ON b.id = r.bill_id
      WHERE 1=1
    `;
    const params = [];

    if (scope.isScoped && scope.hospitalId) {
      query += " AND r.hospital_id = ?";
      params.push(scope.hospitalId);
    }
    if (isPatient) {
      query += " AND r.patient_id = ?";
      params.push(req.user.id);
    }
    if (startDate) {
      query += " AND r.created_at >= ?";
      params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    }
    if (endDate) {
      query += " AND r.created_at <= ?";
      params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += " AND (r.refund_number LIKE ? OR p.receipt_number LIKE ? OR b.bill_number LIKE ? OR u.full_name LIKE ? OR r.reason LIKE ?)";
      params.push(term, term, term, term, term);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0]?.total || 0;

    query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
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
    console.error("Refund history error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve refund history." });
  }
});

/**
 * ============================================================================
 * LESSON 17.7D: DEDICATED STOCK MOVEMENT AUDIT HISTORY
 * ============================================================================
 * GET /api/pharmacy/reports/stock-movements
 */
router.get("/stock-movements", requireAuth, checkReportingAccess, async (req, res) => {
  try {
    if (req.user.role === "patient" || req.user.role === "receptionist") {
      return res.status(403).json({ success: false, message: "Permission denied for stock movement history." });
    }
    const { page = 1, limit = 20, search, startDate, endDate, movement_type, hospital_id } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const scope = getHospitalScope(req.user, hospital_id);

    let query = `
      SELECT sm.*,
             h.name AS hospital_name,
             m.name AS medicine_name, m.sku, m.form AS dosage_form,
             mb.batch_number, mb.expiry_date,
             pb.full_name AS performed_by_name
      FROM stock_movements sm
      JOIN hospitals h ON h.id = sm.hospital_id
      JOIN master_medicines m ON m.id = sm.medicine_id
      JOIN medicine_batches mb ON mb.id = sm.batch_id
      JOIN users pb ON pb.id = sm.performed_by
      WHERE 1=1
    `;
    const params = [];

    if (scope.isScoped && scope.hospitalId) {
      query += " AND sm.hospital_id = ?";
      params.push(scope.hospitalId);
    }
    if (startDate) {
      query += " AND sm.created_at >= ?";
      params.push(startDate.includes(":") ? startDate : `${startDate} 00:00:00`);
    }
    if (endDate) {
      query += " AND sm.created_at <= ?";
      params.push(endDate.includes(":") ? endDate : `${endDate} 23:59:59`);
    }
    if (movement_type && movement_type !== "all") {
      query += " AND sm.movement_type = ?";
      params.push(movement_type);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += " AND (m.name LIKE ? OR m.sku LIKE ? OR mb.batch_number LIKE ? OR sm.reason LIKE ? OR sm.reference_id LIKE ?)";
      params.push(term, term, term, term, term);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const [countRows] = await pool.query(countSql, params);
    const totalCount = countRows[0]?.total || 0;

    query += " ORDER BY sm.created_at DESC LIMIT ? OFFSET ?";
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
    console.error("Stock movement history error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve stock movement history." });
  }
});

module.exports = router;
