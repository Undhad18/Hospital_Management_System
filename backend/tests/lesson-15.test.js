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
  console.log("=== Running Module 15: Medicine Dispensing & Stock Management Test Suite ===");
  console.log("================================================================================");

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fetch System Roles
  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  // 2. Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin M15', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m15_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Dispensing Hospital 1 ${stamp}`, `DH1-${stamp}`, `dh1_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 1 M15', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m15_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, hospitalId: hospital1Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Hospital 2 and Admin (for cross-hospital isolation testing)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Dispensing Hospital 2 ${stamp}`, `DH2-${stamp}`, `dh2_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 2 M15', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m15_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, hospitalId: hospital2Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Authorized Pharmacist Staff in Hospital 1
  const [pharmStaffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Lead Pharmacist M15', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `pharm_m15_${stamp}@test.com`, passwordHash]
  );
  const pharmacistUserId = pharmStaffRes.insertId;
  await pool.execute(
    `INSERT INTO staff_profiles (user_id, employee_id, shift_timing, permissions)
     VALUES (?, 'EMP-PH-M15', '08:00 - 16:00', JSON_ARRAY('prescription_dispense', 'pharmacy_inventory', 'medication_billing'))`,
    [pharmacistUserId]
  );
  const tokenPharmacist = jwt.sign(
    { sub: pharmacistUserId, hospitalId: hospital1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 6. Unauthorized Staff (No dispensing permission)
  const [unauthStaffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Receptionist M15', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `reception_m15_${stamp}@test.com`, passwordHash]
  );
  await pool.execute(
    `INSERT INTO staff_profiles (user_id, employee_id, shift_timing, permissions)
     VALUES (?, 'EMP-REC-M15', '09:00 - 17:00', JSON_ARRAY('patient_registration'))`,
    [unauthStaffRes.insertId]
  );
  const tokenUnauthorizedStaff = jwt.sign(
    { sub: unauthStaffRes.insertId, hospitalId: hospital1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 7. Patient User
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status, phone)
     VALUES (?, 'Arthur Dent M15', ?, ?, 'active', '+91-9876543210')`,
    [roleMap["patient"], `patient_m15_${stamp}@test.com`, passwordHash]
  );
  const patientId = patRes.insertId;
  const tokenPatient = jwt.sign(
    { sub: patientId, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 8. Doctor User in Hospital 1
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. McCoy M15', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `doc_m15_${stamp}@test.com`, passwordHash]
  );
  const doctorId = docRes.insertId;
  const tokenDoctor = jwt.sign(
    { sub: doctorId, hospitalId: hospital1Id, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 9. Department, Appointment & Consultation
  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Emergency Care M15', 'active')`,
    [hospital1Id]
  );
  const departmentId = deptRes.insertId;

  const [apptRes] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00:00', 'consultation', 'completed')`,
    [`APT-M15-${stamp}`, patientId, doctorId, hospital1Id, departmentId]
  );
  const appointmentId = apptRes.insertId;

  const [consRes] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'submitted', 'Acute respiratory infection', 'Pneumonia')`,
    [appointmentId, patientId, doctorId, hospital1Id]
  );
  const consultationId = consRes.insertId;

  let consultCounter = 1;
  async function createTestConsultation() {
    consultCounter++;
    const [a] = await pool.execute(
      `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
       VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00:00', 'consultation', 'completed')`,
      [`APT-M15-${stamp}-${consultCounter}`, patientId, doctorId, hospital1Id, departmentId]
    );
    const [c] = await pool.execute(
      `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
       VALUES (?, ?, ?, ?, 'submitted', 'Checkup', 'General Examination')`,
      [a.insertId, patientId, doctorId, hospital1Id]
    );
    return c.insertId;
  }

  // 10. Master Medicines & Inventory Batches in Hospital 1
  // Med 1: Amoxicillin 500mg
  const [med1Res] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, category, form, strength, purchase_price, sale_price, max_discount_percent, min_stock_alert_level, status)
     VALUES (?, 'Amoxicillin M15 500mg', 'Antibiotics', 'Capsule', '500 mg', 40.00, 80.00, 10.00, 10, 'active')`,
    [`SKU-AMOX-${stamp}`]
  );
  const med1Id = med1Res.insertId;
  await pool.execute(
    `INSERT INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, status) VALUES (?, ?, 80.00, 'active')`,
    [hospital1Id, med1Id]
  );

  // Med 2: Paracetamol 650mg
  const [med2Res] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, category, form, strength, purchase_price, sale_price, max_discount_percent, min_stock_alert_level, status)
     VALUES (?, 'Paracetamol M15 650mg', 'Analgesics', 'Tablet', '650 mg', 10.00, 20.00, 5.00, 15, 'active')`,
    [`SKU-PCM-${stamp}`]
  );
  const med2Id = med2Res.insertId;
  await pool.execute(
    `INSERT INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, status) VALUES (?, ?, 20.00, 'active')`,
    [hospital1Id, med2Id]
  );

  // Batches for Med 1:
  // Batch A: Expiring in +60 days (EARLIEST FEFO LOT), Qty = 10
  const [batchA] = await pool.execute(
    `INSERT INTO medicine_batches (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 40.00, 80.00, 10, 10, 'active', ?)`,
    [hospital1Id, med1Id, `BATCH-AMOX-EARLY-${stamp}`, pharmacistUserId]
  );
  const batchAId = batchA.insertId;

  // Batch B: Expiring in +180 days (LATER FEFO LOT), Qty = 25
  const [batchB] = await pool.execute(
    `INSERT INTO medicine_batches (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 180 DAY), 40.00, 80.00, 25, 25, 'active', ?)`,
    [hospital1Id, med1Id, `BATCH-AMOX-LATE-${stamp}`, pharmacistUserId]
  );
  const batchBId = batchB.insertId;

  // Batch Expired: Expired 10 days ago, Qty = 50 (MUST NEVER BE ALLOCATED)
  const [batchExp] = await pool.execute(
    `INSERT INTO medicine_batches (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 40.00, 80.00, 50, 50, 'active', ?)`,
    [hospital1Id, med1Id, `BATCH-AMOX-EXPIRED-${stamp}`, pharmacistUserId]
  );
  const batchExpId = batchExp.insertId;

  // Batch for Med 2: Qty = 15, expires in +120 days
  const [batchM2] = await pool.execute(
    `INSERT INTO medicine_batches (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 120 DAY), 10.00, 20.00, 15, 15, 'active', ?)`,
    [hospital1Id, med2Id, `BATCH-PCM-${stamp}`, pharmacistUserId]
  );
  const batchM2Id = batchM2.insertId;

  // 11. Create Doctor's Prescription 1 (Med 1: 15 units, Med 2: 5 units)
  const createRxRes = await post(
    "/prescriptions",
    {
      consultation_id: consultationId,
      status: "active",
      general_instructions: "Take with meals",
      items: [
        {
          medicine_id: med1Id,
          medicine_name: "Amoxicillin M15 500mg",
          dosage: "500mg",
          frequency: "TDS",
          duration: "5 days",
          quantity: 15,
        },
        {
          medicine_id: med2Id,
          medicine_name: "Paracetamol M15 650mg",
          dosage: "650mg",
          frequency: "PRN",
          duration: "5 days",
          quantity: 5,
        },
      ],
    },
    tokenDoctor
  );
  assert.strictEqual(createRxRes.status, 201, "Prescription creation must succeed");
  const rx1 = createRxRes.body.data;
  const rx1Id = rx1.id;
  console.log(`[SETUP] Seeded Prescription #${rx1.prescription_number} (ID: ${rx1Id})`);

  // Fetch prescription item IDs
  const [rxItems] = await pool.execute("SELECT id, medicine_id, quantity FROM prescription_items WHERE prescription_id = ?", [rx1Id]);
  const rxItemMed1 = rxItems.find((i) => i.medicine_id === med1Id);
  const rxItemMed2 = rxItems.find((i) => i.medicine_id === med2Id);

  // 12. Create Pharmacy Bills linked to Prescription 1
  // Bill A: Active paid bill
  const billACreate = await post(
    "/pharmacy/bills",
    {
      prescription_id: rx1Id,
      patient_id: patientId,
      items: [
        { prescription_item_id: rxItemMed1.id, medicine_id: med1Id, quantity: 15 },
        { prescription_item_id: rxItemMed2.id, medicine_id: med2Id, quantity: 5 },
      ],
    },
    tokenPharmacist
  );
  assert.strictEqual(billACreate.status, 201, "Bill A creation must succeed");
  const billAId = billACreate.body.data.id;

  // Pay Bill A in full
  await post(
    "/pharmacy/payments",
    {
      bill_id: billAId,
      amount: billACreate.body.data.grand_total,
      payment_method: "cash",
    },
    tokenPharmacist
  );

  // Bill B: Cancelled bill (for rejection testing)
  const billBCreate = await post(
    "/pharmacy/bills",
    {
      prescription_id: rx1Id,
      patient_id: patientId,
      items: [
        { prescription_item_id: rxItemMed1.id, medicine_id: med1Id, quantity: 5 },
      ],
    },
    tokenPharmacist
  );
  assert.strictEqual(billBCreate.status, 201, "Bill B creation must succeed");
  const billBId = billBCreate.body.data.id;
  await pool.execute("UPDATE pharmacy_bills SET status = 'cancelled' WHERE id = ?", [billBId]);

  console.log("[SETUP] Completed database seeding. Beginning Lesson 15.1 - 15.10 tests...\n");

  // ============================================================================
  // LESSON 15.1: Pharmacy Dispensing Workflow
  // ============================================================================
  console.log("--- Lesson 15.1: Pharmacy Dispensing Workflow ---");
  const pendingRxRes = await get("/pharmacy/prescriptions/pending", tokenPharmacist);
  assert.strictEqual(pendingRxRes.status, 200, "Pending prescriptions must be returned for pharmacist");
  const foundPending = pendingRxRes.body.data.find((p) => p.id === rx1Id);
  assert.ok(foundPending, "Prescription 1 must be present in the pending dispensing queue");
  console.log("✔ Lesson 15.1 Passed: Pending prescriptions queue accessible and lists eligible prescription.");

  // ============================================================================
  // LESSON 15.2: Verifying Prescription and Bill Before Dispensing
  // ============================================================================
  console.log("\n--- Lesson 15.2: Verifying Prescription and Bill Before Dispensing ---");
  // Pre-validate prescription
  const valRes = await post(`/prescriptions/${rx1Id}/validate-dispense`, {}, tokenPharmacist);
  assert.strictEqual(valRes.status, 200, "Validate dispense endpoint must succeed");
  assert.strictEqual(valRes.body.data.can_dispense, true, "Prescription 1 must be flagged dispensable");
  assert.ok(valRes.body.data.linked_bills.length >= 1, "Must list linked active bills");
  const linkedBillA = valRes.body.data.linked_bills.find((b) => b.id === billAId);
  assert.ok(linkedBillA, "Paid Bill A must be returned in linked bills");

  // Test: Dispensing with a cancelled bill must fail
  const badBillRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      bill_id: billBId,
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 5 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(badBillRes.status, 400, "Must reject dispensing with a cancelled bill");
  assert.match(badBillRes.body.message, /cancelled|refunded/i, "Error message must cite cancelled/refunded bill status");

  // Test: Dispensing with wrong hospital's bill must fail
  const [crossHospBill] = await pool.execute(
    `INSERT INTO pharmacy_bills (bill_number, hospital_id, patient_id, purchase_type, subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status, created_by)
     VALUES (?, ?, ?, 'hospital', 100.00, 0.00, 100.00, 0.00, 0.00, 100.00, 100.00, 0.00, 'paid', ?)`,
    [`BILL-CROSS-${stamp}`, hospital2Id, patientId, ha2Res.insertId]
  );
  const crossBillRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      bill_id: crossHospBill.insertId,
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 5 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(crossBillRes.status, 403, "Must reject bill from another hospital with 403 Forbidden");
  console.log("✔ Lesson 15.2 Passed: Bill validation enforces patient match, hospital isolation, and non-cancelled status.");

  // ============================================================================
  // LESSON 15.3: Checking Expiry and Available Stock (FEFO Allocation)
  // ============================================================================
  console.log("\n--- Lesson 15.3: Checking Expiry and Available Stock (FEFO Allocation) ---");
  // Check available stock diagnostics from validate endpoint
  const amoxValItem = valRes.body.data.items.find((i) => i.medicine_id === med1Id);
  // Total stock in DB for Med 1: Batch A (10) + Batch B (25) + Expired (50) = 85
  // But non-expired available stock MUST ONLY BE 10 + 25 = 35
  assert.strictEqual(amoxValItem.available_stock, 35, "Available stock must exclude expired batches (50 expired excluded)");

  // Attempt to dispense more stock than available non-expired stock (e.g. 50 units when only 35 non-expired exist)
  // First create a prescription asking for 50 units
  const rxOverStock = await post(
    "/prescriptions",
    {
      consultation_id: await createTestConsultation(),
      status: "active",
      items: [{ medicine_id: med1Id, medicine_name: "Amoxicillin M15 500mg", quantity: 50 }],
    },
    tokenDoctor
  );
  const rxOverStockId = rxOverStock.body.data.id;
  const [overItems] = await pool.execute("SELECT id FROM prescription_items WHERE prescription_id = ?", [rxOverStockId]);

  const overStockDispense = await post(
    `/prescriptions/${rxOverStockId}/dispense`,
    {
      items: [{ prescription_item_id: overItems[0].id, quantity_to_dispense: 50 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(overStockDispense.status, 400, "Must reject dispensing when stock is insufficient");
  assert.match(overStockDispense.body.message, /insufficient|stock/i, "Error message must report insufficient non-expired stock");
  console.log("✔ Lesson 15.3 Passed: Non-expired stock calculation verified; expired batches strictly excluded from availability.");

  // ============================================================================
  // LESSON 15.4: Dispensing Confirmation and Authorization (RBAC & Isolation)
  // ============================================================================
  console.log("\n--- Lesson 15.4: Dispensing Confirmation and Authorization ---");
  // Non-pharmacist staff (Receptionist) attempting dispense
  const unauthDispense = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 5 }],
    },
    tokenUnauthorizedStaff
  );
  assert.strictEqual(unauthDispense.status, 403, "Staff without dispensing permission must be rejected with 403 Forbidden");

  // Patient attempting dispense
  const patDispense = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 5 }],
    },
    tokenPatient
  );
  assert.strictEqual(patDispense.status, 403, "Patients must be rejected with 403 Forbidden");

  // Hospital Admin from Hospital 2 attempting to dispense Hospital 1's prescription
  const crossHospDispense = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 5 }],
    },
    tokenHospitalAdmin2
  );
  assert.strictEqual(crossHospDispense.status, 403, "Cross-hospital dispensing must be rejected with 403 Forbidden");
  console.log("✔ Lesson 15.4 Passed: Role-based access control and hospital data isolation strictly enforced.");

  // ============================================================================
  // LESSON 15.5: Recording Actual Dispensed Quantities
  // ============================================================================
  console.log("\n--- Lesson 15.5: Recording Actual Dispensed Quantities ---");
  // Test: Zero quantity
  const zeroQtyRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    { items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 0 }] },
    tokenPharmacist
  );
  assert.strictEqual(zeroQtyRes.status, 400, "Zero quantity must be rejected");

  // Test: Negative quantity
  const negQtyRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    { items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: -4 }] },
    tokenPharmacist
  );
  assert.strictEqual(negQtyRes.status, 400, "Negative quantity must be rejected");

  // Test: Fractional / non-integer quantity
  const floatQtyRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    { items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 3.5 }] },
    tokenPharmacist
  );
  assert.strictEqual(floatQtyRes.status, 400, "Fractional quantity must be rejected");

  // Test: Exceeding remaining prescribed quantity (prescribed 15, asking 20)
  const exceedQtyRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    { items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 20 }] },
    tokenPharmacist
  );
  assert.strictEqual(exceedQtyRes.status, 400, "Exceeding remaining prescribed quantity must be rejected");
  assert.match(exceedQtyRes.body.message, /exceeds remaining prescribed quantity/i);
  console.log("✔ Lesson 15.5 Passed: Quantity validation enforces positive whole integers <= remaining prescribed.");

  // ============================================================================
  // LESSON 15.6: Partial Dispensing and Prescription Status Updates
  // ============================================================================
  console.log("\n--- Lesson 15.6: Partial Dispensing and Prescription Status Updates ---");
  // Prescription 1 has Med 1: 15 units, Med 2: 5 units.
  // Step 1: Dispense 6 units of Med 1 and 2 units of Med 2 (Partial Dispensing)
  const partialDispenseRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      bill_id: billAId,
      items: [
        { prescription_item_id: rxItemMed1.id, quantity_to_dispense: 6 },
        { prescription_item_id: rxItemMed2.id, quantity_to_dispense: 2 },
      ],
      payment_method: "cash",
      notes: "First partial fulfillment",
    },
    tokenPharmacist
  );
  assert.strictEqual(partialDispenseRes.status, 201, "Partial dispensing must succeed with 201 Created");
  const pDisp = partialDispenseRes.body.data.dispensation;
  const disp1Number = pDisp.dispensation_number;
  assert.ok(disp1Number.startsWith("DISP-"), "Dispensation number must follow DISP-... format");

  // Verify prescription status updated to 'partially_dispensed'
  const [rxAfterPart] = await pool.execute("SELECT status FROM prescriptions WHERE id = ?", [rx1Id]);
  assert.strictEqual(rxAfterPart[0].status, "partially_dispensed", "Prescription status must transition to 'partially_dispensed'");

  // Verify prescription item dispensed_quantity updated
  const [itemsAfterPart] = await pool.execute("SELECT medicine_id, quantity, dispensed_quantity FROM prescription_items WHERE prescription_id = ?", [rx1Id]);
  const pAmox = itemsAfterPart.find((i) => i.medicine_id === med1Id);
  const pPcm = itemsAfterPart.find((i) => i.medicine_id === med2Id);
  assert.strictEqual(pAmox.dispensed_quantity, 6, "Med 1 dispensed_quantity must be 6");
  assert.strictEqual(pPcm.dispensed_quantity, 2, "Med 2 dispensed_quantity must be 2");

  // Verify status history audit entry
  const [historyRows1] = await pool.execute(
    "SELECT from_status, to_status, reason FROM prescription_status_history WHERE prescription_id = ? ORDER BY id DESC LIMIT 1",
    [rx1Id]
  );
  assert.strictEqual(historyRows1[0].to_status, "partially_dispensed", "Status history must record transition to 'partially_dispensed'");

  // Step 2: Dispense the remaining items (Med 1: 9 remaining, Med 2: 3 remaining) -> Full Dispensing
  const fullDispenseRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      bill_id: billAId,
      items: [
        { prescription_item_id: rxItemMed1.id, quantity_to_dispense: 9 },
        { prescription_item_id: rxItemMed2.id, quantity_to_dispense: 3 },
      ],
      payment_method: "cash",
      notes: "Final fulfillment",
    },
    tokenPharmacist
  );
  assert.strictEqual(fullDispenseRes.status, 201, "Final dispensing must succeed with 201 Created");

  // Verify prescription status transitioned to 'dispensed'
  const [rxAfterFull] = await pool.execute("SELECT status FROM prescriptions WHERE id = ?", [rx1Id]);
  assert.strictEqual(rxAfterFull[0].status, "dispensed", "Prescription status must transition to 'dispensed'");

  // Verify prescription items are 100% fulfilled
  const [itemsAfterFull] = await pool.execute("SELECT medicine_id, quantity, dispensed_quantity FROM prescription_items WHERE prescription_id = ?", [rx1Id]);
  for (const item of itemsAfterFull) {
    assert.strictEqual(item.quantity, item.dispensed_quantity, `Item ${item.medicine_id} must have quantity == dispensed_quantity`);
  }

  // Step 3: Attempting to dispense on an already fulfilled prescription must be rejected
  const overFullRes = await post(
    `/prescriptions/${rx1Id}/dispense`,
    {
      items: [{ prescription_item_id: rxItemMed1.id, quantity_to_dispense: 1 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(overFullRes.status, 400, "Dispensing on already fulfilled prescription must fail");
  console.log("✔ Lesson 15.6 Passed: Partial dispensing updates status to 'partially_dispensed'; final fulfillment sets 'dispensed' and blocks further dispensing.");

  // ============================================================================
  // LESSON 15.7: Deducting Stock After Successful Dispensing & Stock Movements
  // ============================================================================
  console.log("\n--- Lesson 15.7: Deducting Stock After Successful Dispensing & Stock Movements ---");
  // Total Amox dispensed in Rx 1: 6 + 9 = 15 units.
  // FEFO rule: Batch A had 10 units (earlier expiry), Batch B had 25 units (later expiry).
  // Batch A should have 10 - 10 = 0 units.
  // Batch B should have 25 - 5 = 20 units.
  const [batchARow] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchAId]);
  const [batchBRow] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchBId]);
  assert.strictEqual(batchARow[0].current_quantity, 0, "Batch A (earliest expiry) must be exhausted first (current_quantity = 0)");
  assert.strictEqual(batchBRow[0].current_quantity, 20, "Batch B must have 20 remaining (25 - 5 = 20)");

  // Expired batch must NEVER have been deducted
  const [batchExpRow] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchExpId]);
  assert.strictEqual(batchExpRow[0].current_quantity, 50, "Expired batch stock must remain completely untouched (50 units)");

  // Verify stock movements ledger entries
  const [movements] = await pool.execute(
    `SELECT movement_type, reference_type, quantity_change, batch_id
     FROM stock_movements
     WHERE hospital_id = ? AND reference_type = 'pharmacy_dispensation'
     ORDER BY id ASC`,
    [hospital1Id]
  );
  assert.ok(movements.length >= 2, "Stock movements must have recorded entries for dispensations");
  const dispMovements = movements.filter((m) => m.movement_type === "dispense");
  assert.ok(dispMovements.length >= 2, "Movements must be classified as 'dispense'");
  for (const m of dispMovements) {
    assert.ok(m.quantity_change < 0, "Dispensed stock movements must record negative quantities");
  }
  console.log("✔ Lesson 15.7 Passed: FEFO deduction accurately consumed earliest batch first, expired batch untouched, stock movements logged.");

  // ============================================================================
  // LESSON 15.8: Preventing Negative Stock and Duplicate Deduction (Idempotency)
  // ============================================================================
  console.log("\n--- Lesson 15.8: Preventing Negative Stock and Duplicate Deduction ---");
  // Create a new active prescription for idempotency testing
  const rxIdemRes = await post(
    "/prescriptions",
    {
      consultation_id: await createTestConsultation(),
      status: "active",
      items: [{ medicine_id: med1Id, medicine_name: "Amoxicillin M15 500mg", quantity: 4 }],
    },
    tokenDoctor
  );
  const rxIdemId = rxIdemRes.body.data.id;
  const [idemItems] = await pool.execute("SELECT id FROM prescription_items WHERE prescription_id = ?", [rxIdemId]);

  const uniqueKey = `IDEM-TEST-${stamp}-${Math.random().toString(36).slice(2, 8)}`;

  // First request with idempotency key
  const firstIdemRes = await post(
    `/prescriptions/${rxIdemId}/dispense`,
    {
      idempotency_key: uniqueKey,
      items: [{ prescription_item_id: idemItems[0].id, quantity_to_dispense: 4 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(firstIdemRes.status, 201, "First idempotent request must succeed");
  const firstDispId = firstIdemRes.body.data.dispensation.id;

  // Measure Batch B quantity after first request (was 20, minus 4 = 16)
  const [batchBAfterFirst] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchBId]);
  assert.strictEqual(batchBAfterFirst[0].current_quantity, 16, "Batch B must decrease to 16");

  // Replay identical request with SAME idempotency key (simulating network retry / double click)
  const secondIdemRes = await post(
    `/prescriptions/${rxIdemId}/dispense`,
    {
      idempotency_key: uniqueKey,
      items: [{ prescription_item_id: idemItems[0].id, quantity_to_dispense: 4 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(secondIdemRes.status, 200, "Replayed idempotent request must return 200 OK without re-executing");
  const replayedDispId = secondIdemRes.body.data?.dispensation?.id || secondIdemRes.body.data?.dispensation_id;
  assert.strictEqual(replayedDispId, firstDispId, "Must return existing dispensation record");

  // Verify stock was NOT deducted a second time
  const [batchBAfterSecond] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchBId]);
  assert.strictEqual(batchBAfterSecond[0].current_quantity, 16, "Stock must remain at 16, duplicate deduction prevented");
  console.log("✔ Lesson 15.8 Passed: Idempotency replay returns existing receipt; double deduction strictly prevented.");

  // ============================================================================
  // LESSON 15.9: Database Transactions and Rollback on Failure
  // ============================================================================
  console.log("\n--- Lesson 15.9: Database Transactions and Rollback on Failure ---");
  // Create a prescription with two items: Item 1 has sufficient stock, Item 2 asks for 999 units (impossible)
  const rxFailRes = await post(
    "/prescriptions",
    {
      consultation_id: await createTestConsultation(),
      status: "active",
      items: [
        { medicine_id: med1Id, medicine_name: "Amoxicillin M15 500mg", quantity: 2 },
        { medicine_id: med2Id, medicine_name: "Paracetamol M15 650mg", quantity: 999 },
      ],
    },
    tokenDoctor
  );
  const rxFailId = rxFailRes.body.data.id;
  const [failItems] = await pool.execute("SELECT id, medicine_id, quantity FROM prescription_items WHERE prescription_id = ?", [rxFailId]);
  const failItem1 = failItems.find((i) => i.medicine_id === med1Id);
  const failItem2 = failItems.find((i) => i.medicine_id === med2Id);

  // Measure stock before failed attempt
  const [batchBBeforeFail] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchBId]);
  const stockBeforeFail = batchBBeforeFail[0].current_quantity;

  const failDispenseRes = await post(
    `/prescriptions/${rxFailId}/dispense`,
    {
      items: [
        { prescription_item_id: failItem1.id, quantity_to_dispense: 2 },
        { prescription_item_id: failItem2.id, quantity_to_dispense: 999 },
      ],
    },
    tokenPharmacist
  );
  assert.strictEqual(failDispenseRes.status, 400, "Transaction must fail and reject dispensing");

  // Verify complete atomic rollback: Item 1's batch stock MUST NOT have been deducted
  const [batchBAfterFail] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [batchBId]);
  assert.strictEqual(batchBAfterFail[0].current_quantity, stockBeforeFail, "Atomic rollback verified: Batch stock unchanged");

  // Verify prescription status remains 'active'
  const [rxFailCheck] = await pool.execute("SELECT status FROM prescriptions WHERE id = ?", [rxFailId]);
  assert.strictEqual(rxFailCheck[0].status, "active", "Prescription status must remain 'active' after rollback");

  // Verify no orphaned dispensation records were inserted
  const [orphanedDisp] = await pool.execute("SELECT id FROM pharmacy_dispensations WHERE prescription_id = ?", [rxFailId]);
  assert.strictEqual(orphanedDisp.length, 0, "No dispensation records must exist for failed transaction");
  console.log("✔ Lesson 15.9 Passed: Atomic transaction rollback prevents partial stock deduction on failure.");

  // ============================================================================
  // LESSON 15.10: Recording Dispensing Staff and Timestamps
  // ============================================================================
  console.log("\n--- Lesson 15.10: Recording Dispensing Staff and Timestamps ---");
  // Inspect dispensation record from Lesson 15.6
  const [dispRecord] = await pool.execute(
    "SELECT dispensed_by, created_at, bill_id FROM pharmacy_dispensations WHERE dispensation_number = ?",
    [disp1Number]
  );
  assert.strictEqual(dispRecord.length, 1, "Dispensation record must exist");
  assert.strictEqual(dispRecord[0].dispensed_by, pharmacistUserId, "Must record the authenticated pharmacist's user ID");
  assert.ok(dispRecord[0].created_at, "Must record timestamp");
  assert.strictEqual(dispRecord[0].bill_id, billAId, "Must link to the validated bill ID");

  // Query prescription details via API: GET /api/prescriptions/:id
  const rxDetailRes = await get(`/prescriptions/${rx1Id}`, tokenPharmacist);
  assert.strictEqual(rxDetailRes.status, 200, "Prescription details request must succeed");
  const rxDetail = rxDetailRes.body.data;
  assert.ok(Array.isArray(rxDetail.dispensations), "Prescription details must include linked dispensations array");
  const linkedDisp1 = rxDetail.dispensations.find((d) => d.dispensation_number === disp1Number);
  assert.ok(linkedDisp1, "Linked dispensation must be returned in prescription audit trail");
  assert.strictEqual(linkedDisp1.dispensed_by_name, "Lead Pharmacist M15", "Dispensed by staff name must be returned");
  assert.strictEqual(linkedDisp1.bill_id, billAId, "Linked bill ID must be returned");
  assert.ok(linkedDisp1.bill_number, "Linked bill number must be returned");

  // Query dispensations listing via API: GET /api/pharmacy/dispensations
  const dispListRes = await get(`/pharmacy/dispensations?prescription_id=${rx1Id}`, tokenPharmacist);
  assert.strictEqual(dispListRes.status, 200, "Dispensations list endpoint must succeed");
  const foundInList = dispListRes.body.data.find((d) => d.dispensation_number === disp1Number);
  assert.ok(foundInList, "Dispensation must appear in pharmacy dispensations registry");
  assert.strictEqual(foundInList.dispensed_by_name, "Lead Pharmacist M15", "Dispensed by staff name must be present in registry");

  // Query single dispensation details via API: GET /api/pharmacy/dispensations/:id
  const singleDispRes = await get(`/pharmacy/dispensations/${pDisp.id}`, tokenPharmacist);
  assert.strictEqual(singleDispRes.status, 200, "Dispensation details endpoint must succeed");
  assert.strictEqual(singleDispRes.body.data.dispensation_number, disp1Number);
  assert.ok(Array.isArray(singleDispRes.body.data.items), "Items array must be returned");
  assert.strictEqual(singleDispRes.body.data.items.length, 2, "Must return 2 dispensed items");

  // Cross-hospital security check on GET /api/pharmacy/dispensations/:id
  const crossDispDetailRes = await get(`/pharmacy/dispensations/${pDisp.id}`, tokenHospitalAdmin2);
  assert.strictEqual(crossDispDetailRes.status, 403, "Cross-hospital dispensation view must be blocked with 403");

  console.log("✔ Lesson 15.10 Passed: Staff attribution, timestamps, bill linkage, and audit trail verified.");

  console.log("\n================================================================================");
  console.log("=== ALL MODULE 15 LESSON TESTS (15.1 - 15.10) PASSED SUCCESSFULLY! ===");
  console.log("================================================================================");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  });
