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
  console.log("=== Running Module 14: Pharmacy Billing and Payment Complete Test Suite ===");
  console.log("================================================================================");

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Setup test tokens
  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  // 1. Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin M14', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m14_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Billing Test Hospital 1 ${stamp}`, `BTH1-${stamp}`, `bth1_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M14', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m14_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, hospitalId: hospital1Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 2 (for cross-hospital security testing)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Billing Test Hospital 2 ${stamp}`, `BTH2-${stamp}`, `bth2_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 2 M14', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m14_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, hospitalId: hospital2Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Pharmacist Staff in Hospital 1
  const [pharmStaffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Pharmacist Staff M14', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `pharm_m14_${stamp}@test.com`, passwordHash]
  );
  await pool.execute(
    `INSERT INTO staff_profiles (user_id, employee_id, shift_timing, permissions)
     VALUES (?, 'EMP-PH-M14', '08:00 - 16:00', JSON_ARRAY('prescription_dispense', 'pharmacy_inventory', 'medication_billing'))`,
    [pharmStaffRes.insertId]
  );
  const tokenPharmacist = jwt.sign(
    { sub: pharmStaffRes.insertId, hospitalId: hospital1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Patient 1 & Patient 2
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status, phone)
     VALUES (?, 'John Doe M14', ?, ?, 'active', '+91-9876500001')`,
    [roleMap["patient"], `patient1_m14_${stamp}@test.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;
  const tokenPatient1 = jwt.sign(
    { sub: patient1Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status, phone)
     VALUES (?, 'Jane Smith M14', ?, ?, 'active', '+91-9876500002')`,
    [roleMap["patient"], `patient2_m14_${stamp}@test.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;

  // 6. Attending Doctor in Hospital 1
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Sarah Jenkins M14', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `doc_m14_${stamp}@test.com`, passwordHash]
  );
  const doctor1Id = docRes.insertId;

  // 7. Seed Department & Appointment & Consultation for Hospital 1
  const [dept1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Internal Medicine M14', 'active')`,
    [hospital1Id]
  );
  const department1Id = dept1Res.insertId;

  const [appt1Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '09:30:00', 'consultation', 'completed')`,
    [`APT-M14-${stamp}-1`, patient1Id, doctor1Id, hospital1Id, department1Id]
  );
  const appt1Id = appt1Res.insertId;

  const [cons1Res] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'submitted', 'Fever & sore throat', 'Bacterial Pharyngitis')`,
    [appt1Id, patient1Id, doctor1Id, hospital1Id]
  );
  const consultation1Id = cons1Res.insertId;

  // 8. Seed Master Medicines with verified pricing
  // Med A: Unit Price ₹100, max discount 10%
  const [medARes] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, category, form, strength, purchase_price, sale_price, max_discount_percent, min_stock_alert_level, status)
     VALUES (?, 'Amoxicillin M14 500mg', 'Antibiotics', 'Capsule', '500 mg', 50.00, 100.00, 10.00, 20, 'active')`,
    [`AMOX-M14-${stamp}`]
  );
  const medicineAId = medARes.insertId;

  // Med B: Unit Price ₹250, max discount 5%
  const [medBRes] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, category, form, strength, purchase_price, sale_price, max_discount_percent, min_stock_alert_level, status)
     VALUES (?, 'Azithromycin M14 500mg', 'Antibiotics', 'Tablet', '500 mg', 120.00, 250.00, 5.00, 20, 'active')`,
    [`AZIT-M14-${stamp}`]
  );
  const medicineBId = medBRes.insertId;

  // 9. Create Prescriptions for testing
  // Rx 1: Active Prescription for Patient 1 in Hospital 1
  const rxNum1 = `RX-M14-${stamp}-1`;
  const [rx1Res] = await pool.execute(
    `INSERT INTO prescriptions (consultation_id, appointment_id, prescription_number, hospital_id, doctor_id, patient_id, general_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Take with warm water after meals', 'active')`,
    [consultation1Id, appt1Id, rxNum1, hospital1Id, doctor1Id, patient1Id]
  );
  const prescription1Id = rx1Res.insertId;

  // Prescribed items: 10 units of Med A, 4 units of Med B
  const [pi1Res] = await pool.execute(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, timing, quantity, dispensed_quantity)
     VALUES (?, ?, 'Amoxicillin M14 500mg', '500mg', '1-0-1', '5 days', 'after_food', 10, 0)`,
    [prescription1Id, medicineAId]
  );
  const rxItemAId = pi1Res.insertId;

  const [pi2Res] = await pool.execute(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, timing, quantity, dispensed_quantity)
     VALUES (?, ?, 'Azithromycin M14 500mg', '500mg', '1-0-0', '4 days', 'after_food', 4, 0)`,
    [prescription1Id, medicineBId]
  );
  const rxItemBId = pi2Res.insertId;

  // Rx 2: Draft Prescription (to verify draft rejection)
  const [rxDraftRes] = await pool.execute(
    `INSERT INTO prescriptions (consultation_id, appointment_id, prescription_number, hospital_id, doctor_id, patient_id, general_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Draft notes', 'draft')`,
    [consultation1Id, appt1Id, `RX-M14-DRAFT-${stamp}`, hospital1Id, doctor1Id, patient1Id]
  );
  const rxDraftId = rxDraftRes.insertId;

  // Rx 3: Cancelled Prescription (to verify cancelled rejection)
  const [rxCancelledRes] = await pool.execute(
    `INSERT INTO prescriptions (consultation_id, appointment_id, prescription_number, hospital_id, doctor_id, patient_id, general_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Cancelled notes', 'cancelled')`,
    [consultation1Id, appt1Id, `RX-M14-CANC-${stamp}`, hospital1Id, doctor1Id, patient1Id]
  );
  const rxCancelledId = rxCancelledRes.insertId;

  console.log("\n--- Testing Lesson 14.2: Prescription and Patient Validation ---");
  // Test A: Draft prescription billing rejection
  const draftBillRes = await post("/pharmacy/bills", {
    prescription_id: rxDraftId,
    patient_id: patient1Id,
    items: [{ prescription_item_id: rxItemAId, medicine_id: medicineAId, quantity: 5 }],
  }, tokenPharmacist);
  assert.strictEqual(draftBillRes.status, 400, "Draft prescription billing must be rejected");
  console.log("✔ Draft prescription billing strictly rejected.");

  // Test B: Cancelled prescription billing rejection
  const cancelledBillRes = await post("/pharmacy/bills", {
    prescription_id: rxCancelledId,
    patient_id: patient1Id,
    items: [{ prescription_item_id: rxItemAId, medicine_id: medicineAId, quantity: 5 }],
  }, tokenPharmacist);
  assert.strictEqual(cancelledBillRes.status, 400, "Cancelled prescription billing must be rejected");
  console.log("✔ Cancelled prescription billing strictly rejected.");

  // Test C: Cross-hospital prescription billing rejection
  const crossHospBillRes = await post("/pharmacy/bills", {
    prescription_id: prescription1Id,
    patient_id: patient1Id,
    items: [{ prescription_item_id: rxItemAId, medicine_id: medicineAId, quantity: 5 }],
  }, tokenHospitalAdmin2);
  assert.strictEqual(crossHospBillRes.status, 403, "Cross-hospital billing must be rejected");
  console.log("✔ Cross-hospital prescription billing access forbidden.");

  // Test D: Patient mismatch rejection
  const mismatchPatientRes = await post("/pharmacy/bills", {
    prescription_id: prescription1Id,
    patient_id: patient2Id, // Patient 2 does not match Rx 1 (which belongs to Patient 1)
    items: [{ prescription_item_id: rxItemAId, medicine_id: medicineAId, quantity: 5 }],
  }, tokenPharmacist);
  assert.strictEqual(mismatchPatientRes.status, 400, "Patient-Prescription mismatch must be rejected");
  console.log("✔ Patient and prescription mismatch correctly rejected.");

  // Test E: Excess quantity beyond prescribed limit rejection
  const excessQtyRes = await post("/pharmacy/bills", {
    prescription_id: prescription1Id,
    patient_id: patient1Id,
    items: [{ prescription_item_id: rxItemAId, medicine_id: medicineAId, quantity: 25 }], // 25 > 10 prescribed
  }, tokenPharmacist);
  assert.strictEqual(excessQtyRes.status, 400, "Excess quantity must be rejected");
  console.log("✔ Billing quantity exceeding prescribed limit strictly rejected.");

  console.log("\n--- Testing Lesson 14.1 & 14.3: Generating Bills & Medicine-Wise Unit Pricing ---");
  // Bill 10 units of Med A (Price ₹100) with 0% discount
  // Taxable line = 10 * 100 = 1000.00
  // Under Lesson 14.5: 12% GST on ₹1,000 = ₹120.00 -> Grand Total = ₹1,120.00
  const idempotencyKey1 = `IDEMP-${stamp}-1`;
  const validBillRes = await post("/pharmacy/bills", {
    prescription_id: prescription1Id,
    patient_id: patient1Id,
    idempotency_key: idempotencyKey1,
    items: [
      {
        prescription_item_id: rxItemAId,
        medicine_id: medicineAId,
        quantity: 10,
        discount_percent: 0,
      },
    ],
  }, tokenPharmacist);

  assert.strictEqual(validBillRes.status, 201, "Eligible prescription bill creation must succeed");
  const bill1 = validBillRes.body.data;
  assert.ok(bill1.bill_number.startsWith("PBILL-"), "Bill number must match PBILL format");
  assert.strictEqual(bill1.subtotal, "1000.00", "Subtotal must equal 10 * 100 = 1000.00");
  assert.strictEqual(bill1.taxable_amount, "1000.00", "Taxable amount must equal 1000.00");
  assert.strictEqual(bill1.gst_rate, "12.00", "GST rate must equal 12.00");
  assert.strictEqual(bill1.gst_amount, "120.00", "12% GST on 1000.00 must equal 120.00");
  assert.strictEqual(bill1.grand_total, "1120.00", "Grand total must equal 1000 + 120 = 1120.00");
  assert.strictEqual(bill1.balance_due, "1120.00", "Balance due must equal grand total initially");
  assert.strictEqual(bill1.status, "pending", "Initial bill status must be pending");
  console.log("✔ Bill successfully generated from prescription:", bill1.bill_number);
  console.log("✔ Authoritative medicine-wise pricing verified: Unit price ₹100.00.");

  console.log("\n--- Testing Lesson 14.4 & 14.5: Subtotal, Discount & 12% GST Calculation ---");
  console.log("✔ Verified: Taxable amount ₹1,000.00 results in ₹120.00 GST and Grand Total of ₹1,120.00.");

  // Test discount: 10% discount on ₹1,000 -> Gross 1000, Disc 100, Taxable 900 -> GST (12% of 900) = 108 -> Grand Total = 1008
  const discountedBillRes = await post("/pharmacy/bills", {
    patient_id: patient1Id,
    items: [
      {
        medicine_id: medicineAId,
        quantity: 10,
        discount_percent: 10, // Max permitted is 10%
      },
    ],
  }, tokenPharmacist);
  assert.strictEqual(discountedBillRes.status, 201, "Permitted discount bill must succeed");
  const discBill = discountedBillRes.body.data;
  assert.strictEqual(discBill.discount_amount, "100.00");
  assert.strictEqual(discBill.taxable_amount, "900.00");
  assert.strictEqual(discBill.gst_amount, "108.00");
  assert.strictEqual(discBill.grand_total, "1008.00");
  console.log("✔ Discount applied before tax: Subtotal ₹1,000, Disc ₹100, Taxable ₹900, GST ₹108, Total ₹1,008.");

  // Test exceeding discount limit rejection (15% requested when max is 10%)
  const excessDiscRes = await post("/pharmacy/bills", {
    patient_id: patient1Id,
    items: [
      {
        medicine_id: medicineAId,
        quantity: 10,
        discount_percent: 15,
      },
    ],
  }, tokenPharmacist);
  assert.strictEqual(excessDiscRes.status, 400, "Excess discount must be rejected");
  console.log("✔ Discount exceeding master medicine permitted limit strictly rejected.");

  console.log("\n--- Testing Lesson 14.8: Unique Bill Numbers & Duplicate Bill Prevention ---");
  // Retry same request with identical idempotency key
  const duplicateBillRes = await post("/pharmacy/bills", {
    prescription_id: prescription1Id,
    patient_id: patient1Id,
    idempotency_key: idempotencyKey1,
    items: [
      {
        prescription_item_id: rxItemAId,
        medicine_id: medicineAId,
        quantity: 10,
      },
    ],
  }, tokenPharmacist);
  assert.strictEqual(duplicateBillRes.status, 200, "Duplicate request with idempotency key must return 200 with existing bill");
  assert.strictEqual(duplicateBillRes.body.data.bill_number, bill1.bill_number, "Returned bill must be the existing bill");
  assert.strictEqual(duplicateBillRes.body.is_duplicate, true, "is_duplicate flag must be true");
  console.log("✔ Idempotent duplicate bill request safely handled without creating duplicate record.");

  console.log("\n--- Testing Lesson 14.10: Separating Prescription Status from Pharmacy Bill Status ---");
  // Verify that generating bill1 did NOT mark prescription as dispensed
  const [rxCheckRows] = await pool.execute("SELECT status FROM prescriptions WHERE id = ?", [prescription1Id]);
  assert.strictEqual(rxCheckRows[0].status, "active", "Prescription status must remain 'active' after billing");
  console.log("✔ Verified: Bill creation does NOT mark prescription as dispensed. Prescription remains 'active'.");

  console.log("\n--- Testing Lesson 14.6 & 14.7: Payment Methods & Status Management ---");
  // Test A: Security test - reject raw card numbers or CVV
  const rawCardRes = await post(`/pharmacy/bills/${bill1.id}/payments`, {
    amount: 500.00,
    payment_method: "card",
    card_number: "4111222233334444",
    cvv: "123",
  }, tokenPharmacist);
  assert.strictEqual(rawCardRes.status, 400, "Submitting raw card numbers or CVV must be strictly blocked");
  console.log("✔ Security enforced: Raw card credentials and CVVs strictly rejected.");

  // Test B: Failed payment attempt
  const failedPayRes = await post(`/pharmacy/bills/${bill1.id}/payments`, {
    amount: 500.00,
    payment_method: "upi",
    payment_status: "failed",
    notes: "Bank network timeout",
  }, tokenPharmacist);
  assert.strictEqual(failedPayRes.status, 200);
  assert.strictEqual(failedPayRes.body.success, false);
  // Verify bill balance was NOT affected
  const [billAfterFail] = await pool.execute("SELECT balance_due, status FROM pharmacy_bills WHERE id = ?", [bill1.id]);
  assert.strictEqual(billAfterFail[0].balance_due, "1120.00");
  assert.strictEqual(billAfterFail[0].status, "pending");
  console.log("✔ Failed payment recorded; bill balance and pending status preserved.");

  // Test C: Partial payment via UPI (Pay ₹620 of ₹1120 -> Remaining ₹500)
  const partialPayRes = await post(`/pharmacy/bills/${bill1.id}/payments`, {
    amount: 620.00,
    payment_method: "upi",
    payment_status: "completed",
    transaction_reference: `UPI-UTR-${stamp}`,
  }, tokenPharmacist);
  assert.strictEqual(partialPayRes.status, 201);
  assert.strictEqual(partialPayRes.body.data.paid_amount, "620.00");
  assert.strictEqual(partialPayRes.body.data.balance_due, "500.00");
  assert.strictEqual(partialPayRes.body.data.bill_status, "partially_paid");
  console.log("✔ Partial UPI payment recorded: Paid ₹620.00, Remaining balance ₹500.00, status 'partially_paid'.");

  // Test D: Overpayment prevention (Try to pay ₹600 when only ₹500 is due)
  const overpayRes = await post(`/pharmacy/bills/${bill1.id}/payments`, {
    amount: 600.00,
    payment_method: "cash",
  }, tokenPharmacist);
  assert.strictEqual(overpayRes.status, 400, "Overpayment must be rejected");
  console.log("✔ Overpayment strictly rejected.");

  // Test E: Settle remaining balance via Card (Pay ₹500 with card_last4)
  const fullPayRes = await post(`/pharmacy/bills/${bill1.id}/payments`, {
    amount: 500.00,
    payment_method: "card",
    payment_status: "completed",
    card_network: "Visa",
    card_last4: "4242",
    transaction_reference: `CARD-TXN-${stamp}`,
  }, tokenPharmacist);
  assert.strictEqual(fullPayRes.status, 201);
  assert.strictEqual(fullPayRes.body.data.paid_amount, "1120.00");
  assert.strictEqual(fullPayRes.body.data.balance_due, "0.00");
  assert.strictEqual(fullPayRes.body.data.bill_status, "paid");
  console.log("✔ Final payment settled: Paid ₹500.00 via Card, balance ₹0.00, bill status 'paid'.");

  // Test F: Refund workflow
  const paymentToRefundId = fullPayRes.body.data.payment_id;
  const refundRes = await post(`/pharmacy/payments/${paymentToRefundId}/refund`, {
    refund_amount: 200.00,
    reason: "Patient returned unopened blister pack",
  }, tokenPharmacist);
  assert.strictEqual(refundRes.status, 200);
  assert.strictEqual(refundRes.body.data.refund_amount, "200.00");
  assert.strictEqual(refundRes.body.data.new_paid_amount, "920.00");
  assert.strictEqual(refundRes.body.data.new_balance_due, "200.00");
  assert.strictEqual(refundRes.body.data.bill_status, "partially_paid");
  console.log("✔ Refund of ₹200.00 processed; original payment preserved and bill status adjusted.");

  console.log("\n--- Testing Lesson 14.9: Invoice Generation, Receipts & Email Dispatch ---");
  const invoiceRes = await get(`/pharmacy/bills/${bill1.id}/invoice`, tokenPharmacist);
  assert.strictEqual(invoiceRes.status, 200);
  assert.strictEqual(invoiceRes.body.data.invoice_number, bill1.bill_number);
  assert.strictEqual(invoiceRes.body.data.financials.gst_rate, "12.00");
  assert.strictEqual(invoiceRes.body.data.financials.gst_amount, "120.00");
  assert.ok(invoiceRes.body.data.payments.length >= 2, "Invoice includes payment history");
  console.log("✔ Itemized invoice payload retrieved successfully with 12% GST breakdown.");

  // Test email invoice dispatch
  const emailInvRes = await post(`/pharmacy/bills/${bill1.id}/email-invoice`, {
    email: `patient1_m14_${stamp}@test.com`,
  }, tokenPharmacist);
  assert.strictEqual(emailInvRes.status, 200);
  console.log("✔ Invoice email dispatched non-blockingly.");

  // Test email receipt dispatch
  const emailRcpRes = await post(`/pharmacy/payments/${paymentToRefundId}/email-receipt`, {
    email: `patient1_m14_${stamp}@test.com`,
  }, tokenPharmacist);
  assert.strictEqual(emailRcpRes.status, 200);
  console.log("✔ Payment receipt email dispatched non-blockingly.");

  console.log("\n--- Testing Lesson 14.11: Hospital vs Outside Pharmacy Purchase ---");
  // Record an Outside Pharmacy Purchase
  const outsidePurchaseRes = await post("/pharmacy/outside-purchases", {
    patient_id: patient1Id,
    prescription_id: prescription1Id,
    external_pharmacy_name: "Apollo Pharmacy Store #45",
    external_bill_number: `APOLLO-${stamp}`,
    items: [
      { medicine_name: "Cefixime 200mg", quantity: 10, unit_price: 15.00 },
      { medicine_name: "Paracetamol 650mg", quantity: 20, unit_price: 3.50 },
    ],
    notes: "Purchased from 24/7 retail chemist during emergency",
  }, tokenPharmacist);

  assert.strictEqual(outsidePurchaseRes.status, 201);
  const outData = outsidePurchaseRes.body.data;
  assert.strictEqual(outData.purchase_type, "outside");
  assert.strictEqual(outData.external_pharmacy_name, "Apollo Pharmacy Store #45");
  assert.strictEqual(outData.stock_deducted, false);

  // Critical verification: ensure NO hospital stock movements were logged for this outside purchase
  const [outsideMovements] = await pool.execute(
    "SELECT COUNT(*) AS count FROM stock_movements WHERE reference_id = ?",
    [outData.bill_number]
  );
  assert.strictEqual(outsideMovements[0].count, 0, "Outside purchase must NOT generate hospital stock movement");
  console.log("✔ Outside pharmacy purchase recorded: Zero hospital inventory deducted and zero hospital stock movements created.");

  console.log("\n================================================================================");
  console.log("=== ALL MODULE 14 TESTS PASSED SUCCESSFULLY! ===");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
