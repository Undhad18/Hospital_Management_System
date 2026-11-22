const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";

async function post(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function get(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 17: Transaction History and Reporting Complete Test Suite ===");
  console.log("================================================================================");

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Setup roles
  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  // 1. Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin M17', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m17_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`M17 Test Hospital 1 ${stamp}`, `M17H1-${stamp}`, `m17h1_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M17 H1', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m17_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, hospitalId: hospital1Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 2 and Admin (for cross-hospital data isolation tests)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`M17 Test Hospital 2 ${stamp}`, `M17H2-${stamp}`, `m17h2_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M17 H2', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m17_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, hospitalId: hospital2Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Pharmacist Staff in Hospital 1
  const [pharmRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Pharmacist M17 H1', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `pharm_m17_${stamp}@test.com`, passwordHash]
  );
  const tokenPharmacist1 = jwt.sign(
    { sub: pharmRes.insertId, hospitalId: hospital1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Patient in Hospital 1
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Patient Rajesh M17', ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `patient_m17_${stamp}@test.com`, passwordHash]
  );
  const patient1Id = patRes.insertId;
  const tokenPatient1 = jwt.sign(
    { sub: patient1Id, hospitalId: hospital1Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 6. Doctor in Hospital 1
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Ramesh M17', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `dr_m17_${stamp}@test.com`, passwordHash]
  );
  const doctor1Id = docRes.insertId;

  // Department, Appointment, and Consultation for Hospital 1
  const [dept1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'General Medicine M17', 'active')`,
    [hospital1Id]
  );
  const department1Id = dept1Res.insertId;

  const [appt1Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00:00', 'consultation', 'completed')`,
    [`APT-M17-${stamp}`, patient1Id, doctor1Id, hospital1Id, department1Id]
  );
  const appt1Id = appt1Res.insertId;

  const [cons1Res] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'submitted', 'High fever and fatigue', 'Viral fever')`,
    [appt1Id, patient1Id, doctor1Id, hospital1Id]
  );
  const consultation1Id = cons1Res.insertId;

  // 7. Seed Master Medicine & Batch for Hospital 1
  const [medRes] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, category, form, strength, purchase_price, sale_price, min_stock_alert_level)
     VALUES (?, 'Paracetamol Extra M17', 'Analgesic', 'Tablet', '650mg', 2.00, 5.00, 20)`,
    [`SKU-M17-${stamp}`]
  );
  const medicineId = medRes.insertId;

  // Supplier
  const [supRes] = await pool.execute(
    `INSERT INTO suppliers (hospital_id, name, contact_person, phone, email, status)
     VALUES (?, 'Apex Pharma M17', 'Vikram Seth', '9876543210', 'apex@test.com', 'active')`,
    [hospital1Id]
  );
  const supplierId = supRes.insertId;

  // Medicine Batch
  const batchNumber = `BATCH-M17-${stamp}`;
  const [batchRes] = await pool.execute(
    `INSERT INTO medicine_batches 
     (hospital_id, medicine_id, supplier_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, ?, '2026-10-15', '2027-10-15', 2.00, 5.00, 200, 180, 'active', ?)`,
    [hospital1Id, medicineId, supplierId, batchNumber, ha1Res.insertId]
  );
  const batchId = batchRes.insertId;

  // Stock movement for purchase
  await pool.execute(
    `INSERT INTO stock_movements
     (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
     VALUES (?, ?, ?, 'purchase', 200, 200, 'medicine_batch', ?, 'Initial batch procurement', ?)`,
    [hospital1Id, batchId, medicineId, String(batchId), ha1Res.insertId]
  );

  // Stock movement adjustment
  await pool.execute(
    `INSERT INTO stock_movements
     (hospital_id, batch_id, medicine_id, movement_type, quantity_change, remaining_batch_quantity, reference_type, reference_id, reason, performed_by)
     VALUES (?, ?, ?, 'adjustment_add', 10, 210, 'manual_audit', 'AUDIT-01', 'Found surplus during count', ?)`,
    [hospital1Id, batchId, medicineId, ha1Res.insertId]
  );

  // 8. Create Prescription
  const rxNumber = `RX-M17-${stamp}`;
  const [rxRes] = await pool.execute(
    `INSERT INTO prescriptions (consultation_id, appointment_id, hospital_id, patient_id, doctor_id, prescription_number, general_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Take 1 tablet after meals for 5 days', 'partially_dispensed')`,
    [consultation1Id, appt1Id, hospital1Id, patient1Id, doctor1Id, rxNumber]
  );
  const prescriptionId = rxRes.insertId;

  // 9. Create Pharmacy Bill (PBILL)
  const billNumber = `PBILL-M17-${stamp}`;
  const [billRes] = await pool.execute(
    `INSERT INTO pharmacy_bills 
     (bill_number, hospital_id, patient_id, prescription_id, subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status, created_by)
     VALUES (?, ?, ?, ?, 100.00, 10.00, 90.00, 12.00, 10.80, 100.80, 50.00, 50.80, 'partially_paid', ?)`,
    [billNumber, hospital1Id, patient1Id, prescriptionId, ha1Res.insertId]
  );
  const billId = billRes.insertId;

  await pool.execute(
    `INSERT INTO pharmacy_bill_items
     (bill_id, medicine_id, medicine_name, sku, dosage_form, quantity, unit_price, discount_amount, taxable_amount, gst_amount, line_total)
     VALUES (?, ?, 'Paracetamol Extra M17', 'SKU-M17', 'Tablet', 20, 5.00, 10.00, 90.00, 10.80, 100.80)`,
    [billId, medicineId]
  );

  // 10. Create Pharmacy Payment
  const receiptNumber = `PRCP-M17-${stamp}`;
  const [payRes] = await pool.execute(
    `INSERT INTO pharmacy_payments
     (receipt_number, bill_id, hospital_id, patient_id, amount, payment_method, payment_status, transaction_reference, collected_by)
     VALUES (?, ?, ?, ?, 50.00, 'upi', 'completed', 'UPI-TXN-998877', ?)`,
    [receiptNumber, billId, hospital1Id, patient1Id, ha1Res.insertId]
  );
  const paymentId = payRes.insertId;

  // 11. Create Pharmacy Dispensation
  const dispNumber = `DISP-M17-${stamp}`;
  const [dispRes] = await pool.execute(
    `INSERT INTO pharmacy_dispensations
     (dispensation_number, hospital_id, patient_id, prescription_id, bill_id, subtotal, discount_amount, tax_amount, total_amount, payment_status, payment_method, dispensed_by, notes)
     VALUES (?, ?, ?, ?, ?, 90.00, 10.00, 10.80, 100.80, 'paid', 'upi', ?, 'Dispensed 10 of 20 tablets')`,
    [dispNumber, hospital1Id, patient1Id, prescriptionId, billId, pharmRes.insertId]
  );
  const dispensationId = dispRes.insertId;

  await pool.execute(
    `INSERT INTO pharmacy_dispensation_items
     (dispensation_id, batch_id, medicine_id, quantity, unit_sale_price, total_price)
     VALUES (?, ?, ?, 10, 5.00, 50.00)`,
    [dispensationId, batchId, medicineId]
  );

  // 12. Create Refund on Payment
  const refundNumber = `PREF-M17-${stamp}`;
  const [refRes] = await pool.execute(
    `INSERT INTO pharmacy_refunds
     (refund_number, payment_id, bill_id, hospital_id, patient_id, refund_amount, reason, status, refunded_by)
     VALUES (?, ?, ?, ?, ?, 10.00, 'Partial medicine returned', 'completed', ?)`,
    [refundNumber, paymentId, billId, hospital1Id, patient1Id, ha1Res.insertId]
  );
  const refundId = refRes.insertId;

  let passed = 0;
  let failed = 0;

  // TEST 1: Lesson 17.1 — Unified Pharmacy Transaction History
  console.log("\n[Test 1] Lesson 17.1: Centralized Pharmacy Transaction History");
  {
    const res = await get("/pharmacy/reports/transactions", tokenHospitalAdmin1);
    assert.strictEqual(res.status, 200, "Should return status 200");
    assert.strictEqual(res.body.success, true, "Should return success true");
    assert.ok(Array.isArray(res.body.data), "Data should be an array");
    assert.ok(res.body.data.length >= 5, "Should return multiple transaction types in timeline");

    const types = new Set(res.body.data.map((t) => t.transaction_type));
    assert.ok(types.has("bill"), "Should contain bill transactions");
    assert.ok(types.has("payment"), "Should contain payment transactions");
    assert.ok(types.has("dispensation"), "Should contain dispensation transactions");
    assert.ok(types.has("purchase"), "Should contain purchase transactions");
    assert.ok(types.has("stock_adjustment"), "Should contain stock adjustment transactions");
    assert.ok(types.has("refund"), "Should contain refund transactions");
    console.log("✓ Lesson 17.1 Passed: Centralized multi-type pharmacy transaction history loaded");
    passed++;
  }

  // TEST 2: Lesson 17.2 — Bill & Prescription Reference Tracking
  console.log("\n[Test 2] Lesson 17.2: Bill and Prescription Reference Tracking");
  {
    const res = await get(`/pharmacy/reports/transactions/bill/${billId}`, tokenHospitalAdmin1);
    assert.strictEqual(res.status, 200, "Should return 200 for bill details");
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.bill.bill_number, billNumber);
    assert.strictEqual(res.body.data.bill.prescription_number, rxNumber);
    assert.strictEqual(res.body.data.payments.length, 1);
    assert.strictEqual(res.body.data.payments[0].receipt_number, receiptNumber);
    assert.strictEqual(res.body.data.dispensations.length, 1);
    assert.strictEqual(res.body.data.dispensations[0].dispensation_number, dispNumber);
    assert.strictEqual(res.body.data.refunds.length, 1);
    assert.strictEqual(res.body.data.refunds[0].refund_number, refundNumber);
    console.log("✓ Lesson 17.2 Passed: Full cross-entity bill and prescription reference tracking resolved");
    passed++;
  }

  // TEST 3: Lesson 17.3 — Patient, Medicine and Dispensing Details
  console.log("\n[Test 3] Lesson 17.3: Patient, Medicine and Dispensing Details");
  {
    const res = await get(`/pharmacy/reports/transactions/dispensation/${dispensationId}`, tokenHospitalAdmin1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.dispensation.dispensation_number, dispNumber);
    assert.strictEqual(res.body.data.dispensation.patient_name, "Patient Rajesh M17");
    assert.ok(res.body.data.items.length >= 1, "Should have dispensed items");
    assert.strictEqual(res.body.data.items[0].batch_number, batchNumber);
    assert.strictEqual(res.body.data.items[0].quantity, 10);
    console.log("✓ Lesson 17.3 Passed: Deep medicine, batch, and dispensing itemization validated");
    passed++;
  }

  // TEST 4: Lesson 17.4 — Search by Bill, Patient and Prescription
  console.log("\n[Test 4] Lesson 17.4: Search by Bill Number, Patient and Prescription");
  {
    // Search by bill number
    const resBill = await get(`/pharmacy/reports/transactions?search=${billNumber}`, tokenHospitalAdmin1);
    assert.strictEqual(resBill.status, 200);
    assert.ok(resBill.body.data.some((r) => r.transaction_reference === billNumber));

    // Search by prescription number
    const resRx = await get(`/pharmacy/reports/transactions?search=${rxNumber}`, tokenHospitalAdmin1);
    assert.strictEqual(resRx.status, 200);
    assert.ok(resRx.body.data.some((r) => r.prescription_reference === rxNumber));

    // Search by patient name
    const resPat = await get(`/pharmacy/reports/transactions?search=Rajesh`, tokenHospitalAdmin1);
    assert.strictEqual(resPat.status, 200);
    assert.ok(resPat.body.data.some((r) => r.patient_name && r.patient_name.includes("Rajesh")));

    console.log("✓ Lesson 17.4 Passed: Search across bill numbers, prescription IDs, and patients functioning");
    passed++;
  }

  // TEST 5: Lesson 17.5 — Date Range, Payment and Dispensing Filters
  console.log("\n[Test 5] Lesson 17.5: Date Range, Payment and Dispensing Filters");
  {
    const today = new Date().toISOString().slice(0, 10);
    const resFiltered = await get(
      `/pharmacy/reports/transactions?startDate=${today}&endDate=${today}&type=payment&paymentMethod=upi&paymentStatus=completed`,
      tokenHospitalAdmin1
    );
    assert.strictEqual(resFiltered.status, 200);
    assert.ok(resFiltered.body.data.length >= 1);
    for (const item of resFiltered.body.data) {
      assert.strictEqual(item.transaction_type, "payment");
      assert.strictEqual(item.payment_method, "upi");
      assert.strictEqual(item.payment_status, "completed");
    }
    console.log("✓ Lesson 17.5 Passed: Date range (inclusive boundaries) and multi-facet filters verified");
    passed++;
  }

  // TEST 6: Lesson 17.6 — Pharmacy Dashboard Summary & Financial Hygiene
  console.log("\n[Test 6] Lesson 17.6: Pharmacy Dashboard Summary & Net Revenue");
  {
    const res = await get("/pharmacy/reports/dashboard-summary", tokenHospitalAdmin1);
    assert.strictEqual(res.status, 200);
    const sum = res.body.data.summary;
    assert.ok(sum.total_bills_count >= 1, "Should count bills");
    assert.ok(sum.completed_payments_amount >= 50.00, "Should aggregate completed payments");
    assert.ok(sum.refund_amount >= 10.00, "Should aggregate refunds");
    assert.strictEqual(sum.net_revenue, Math.round((sum.completed_payments_amount - sum.refund_amount) * 100) / 100);
    assert.ok(sum.purchase_expenditure >= 400.00, "Purchase procurement expenditure distinct from sales");
    assert.strictEqual(sum.partially_dispensed_prescriptions >= 1, true);
    console.log("✓ Lesson 17.6 Passed: Dashboard summary calculated accurately with zero double-counting");
    passed++;
  }

  // TEST 7: Lesson 17.7 — Purchase, Dispensing, Refund and Stock History Endpoints
  console.log("\n[Test 7] Lesson 17.7: Specialized Operational Histories");
  {
    // Purchases
    const resPurch = await get("/pharmacy/reports/purchases", tokenHospitalAdmin1);
    assert.strictEqual(resPurch.status, 200);
    assert.ok(resPurch.body.data.some((b) => b.batch_number === batchNumber));

    // Dispensations
    const resDisp = await get("/pharmacy/reports/dispensations", tokenHospitalAdmin1);
    assert.strictEqual(resDisp.status, 200);
    assert.ok(resDisp.body.data.some((d) => d.dispensation_number === dispNumber));

    // Refunds
    const resRef = await get("/pharmacy/reports/refunds", tokenHospitalAdmin1);
    assert.strictEqual(resRef.status, 200);
    assert.ok(resRef.body.data.some((r) => r.refund_number === refundNumber));

    // Stock Movements
    const resSm = await get("/pharmacy/reports/stock-movements", tokenHospitalAdmin1);
    assert.strictEqual(resSm.status, 200);
    assert.ok(resSm.body.data.some((sm) => sm.reason === "Found surplus during count"));

    console.log("✓ Lesson 17.7 Passed: All four specialized operational history endpoints verified");
    passed++;
  }

  // TEST 8: Lesson 17.8 — Role-Based Transaction Visibility & Cross-Hospital Scoping
  console.log("\n[Test 8] Lesson 17.8: Role-Based Transaction Visibility & Multi-Tenant Isolation");
  {
    // Hospital Admin 2 trying to access Hospital 1's bill
    const resCross = await get(`/pharmacy/reports/transactions/bill/${billId}`, tokenHospitalAdmin2);
    assert.strictEqual(resCross.status, 403, "Cross-hospital transaction access must be blocked with 403");

    // Super Admin accessing cross-hospital
    const resSa = await get(`/pharmacy/reports/transactions/bill/${billId}`, tokenSuperAdmin);
    assert.strictEqual(resSa.status, 200, "Super admin should be allowed access across hospitals");

    // Patient restricted to own transactions
    const resPatBills = await get("/pharmacy/reports/transactions?type=bill", tokenPatient1);
    assert.strictEqual(resPatBills.status, 200);
    for (const b of resPatBills.body.data) {
      assert.strictEqual(b.patient_id, patient1Id, "Patient must only receive their own records");
    }

    // Patient forbidden from accessing procurement or stock movements
    const resPatPurch = await get("/pharmacy/reports/purchases", tokenPatient1);
    assert.strictEqual(resPatPurch.status, 403, "Patient cannot access procurement purchases");

    console.log("✓ Lesson 17.8 Passed: Strict backend RBAC and hospital-level data isolation enforced");
    passed++;
  }

  console.log("\n================================================================================");
  console.log(`=== Module 17 Test Suite Finished: ${passed} Passed, ${failed} Failed ===`);
  console.log("================================================================================\n");

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
