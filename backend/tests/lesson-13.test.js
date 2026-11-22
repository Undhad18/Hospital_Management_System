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

async function patch(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 13: Prescription Management Complete Test Suite ===");
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
     VALUES (?, 'Super Admin M13', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m13_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Prescription Test Hospital 1 ${stamp}`, `PTH1-${stamp}`, `pth1_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M13', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m13_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 2 and Admin (for cross-hospital tests)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Prescription Test Hospital 2 ${stamp}`, `PTH2-${stamp}`, `pth2_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 2 M13', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m13_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Doctor in Hospital 1
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Harshil Mehta M13', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `doc1_m13_${stamp}@test.com`, passwordHash]
  );
  const doctor1Id = doc1Res.insertId;
  const tokenDoctor1 = jwt.sign(
    { sub: doctor1Id, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Doctor in Hospital 2
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Ananya Ray M13', ?, ?, 'active')`,
    [roleMap["doctor"], hospital2Id, `doc2_m13_${stamp}@test.com`, passwordHash]
  );
  const doctor2Id = doc2Res.insertId;
  const tokenDoctor2 = jwt.sign(
    { sub: doctor2Id, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 6. Pharmacist / Staff in Hospital 1
  const [pharm1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Pharmacist Raj M13', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `pharm1_m13_${stamp}@test.com`, passwordHash]
  );
  const pharmacist1Id = pharm1Res.insertId;
  const tokenPharmacist1 = jwt.sign(
    { sub: pharmacist1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 7. Patients
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Rohan Verma M13', ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `pat1_m13_${stamp}@test.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;
  const tokenPatient1 = jwt.sign(
    { sub: patient1Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Sneha Patel M13', ?, ?, 'active')`,
    [roleMap["patient"], hospital2Id, `pat2_m13_${stamp}@test.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;
  const tokenPatient2 = jwt.sign(
    { sub: patient2Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Setup departments
  const [dept1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'General Medicine M13', 'active')`,
    [hospital1Id]
  );
  const department1Id = dept1Res.insertId;

  const [dept2Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'General Medicine M13', 'active')`,
    [hospital2Id]
  );
  const department2Id = dept2Res.insertId;

  // Setup test appointments & consultations
  const [appt1Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00:00', 'consultation', 'completed')`,
    [`APT-M13-${stamp}-1`, patient1Id, doctor1Id, hospital1Id, department1Id]
  );
  const appt1Id = appt1Res.insertId;

  const [cons1Res] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'draft', 'Hypertension & occasional headache', 'Stage 1 Hypertension')`,
    [appt1Id, patient1Id, doctor1Id, hospital1Id]
  );
  const consultation1Id = cons1Res.insertId;

  // Setup second consultation for cross-hospital testing
  const [appt2Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '11:00:00', 'consultation', 'completed')`,
    [`APT-M13-${stamp}-2`, patient2Id, doctor2Id, hospital2Id, department2Id]
  );
  const appt2Id = appt2Res.insertId;

  const [cons2Res] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'draft', 'Fever and chills', 'Viral Upper Respiratory Infection')`,
    [appt2Id, patient2Id, doctor2Id, hospital2Id]
  );
  const consultation2Id = cons2Res.insertId;

  // Setup test medicines and stock in Hospital 1
  const [m1Res] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, generic_name, form, strength, sale_price, max_discount_percent, status)
     VALUES (?, 'Amoxicillin 500mg M13', 'Amoxicillin', 'Capsule', '500 mg', 12.00, 10.00, 'active')`,
    [`AMOX-M13-${stamp}`]
  );
  const medicine1Id = m1Res.insertId;

  const [m2Res] = await pool.execute(
    `INSERT INTO master_medicines (sku, name, generic_name, form, strength, sale_price, max_discount_percent, status)
     VALUES (?, 'Paracetamol 650mg M13', 'Paracetamol', 'Tablet', '650 mg', 4.00, 5.00, 'active')`,
    [`PARA-M13-${stamp}`]
  );
  const medicine2Id = m2Res.insertId;

  // Add Hospital Formulary for Hospital 1
  await pool.execute(
    `INSERT INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
     VALUES (?, ?, 12.00, 10.00, 20, 'active'), (?, ?, 4.00, 5.00, 50, 'active')`,
    [hospital1Id, medicine1Id, hospital1Id, medicine2Id]
  );

  // Add Medicine Batches for Hospital 1:
  // Batch 1: Expiring in 1 year, current_quantity = 100
  const [b1Res] = await pool.execute(
    `INSERT INTO medicine_batches 
     (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 8.00, 12.00, 100, 100, 'active', ?)`,
    [hospital1Id, medicine1Id, `BATCH-AMOX-1-${stamp}`, pharmacist1Id]
  );

  // Batch 2: Expiring in 2 years, current_quantity = 50
  const [b2Res] = await pool.execute(
    `INSERT INTO medicine_batches 
     (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 730 DAY), 8.00, 12.00, 50, 50, 'active', ?)`,
    [hospital1Id, medicine1Id, `BATCH-AMOX-2-${stamp}`, pharmacist1Id]
  );

  // Paracetamol Batch: current_quantity = 200
  const [b3Res] = await pool.execute(
    `INSERT INTO medicine_batches 
     (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 365 DAY), 2.50, 4.00, 200, 200, 'active', ?)`,
    [hospital1Id, medicine2Id, `BATCH-PARA-1-${stamp}`, pharmacist1Id]
  );

  // Inactive / Expired Batch for testing expiry validation
  const [bExpRes] = await pool.execute(
    `INSERT INTO medicine_batches 
     (hospital_id, medicine_id, batch_number, purchase_date, expiry_date, purchase_price, sale_price, initial_quantity, current_quantity, status, received_by)
     VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 60 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 8.00, 12.00, 30, 30, 'active', ?)`,
    [hospital1Id, medicine1Id, `BATCH-AMOX-EXPIRED-${stamp}`, pharmacist1Id]
  );

  // ---------------------------------------------------------------------------
  // LESSON 13.3: MEDICINE SELECTION FROM EXISTING INVENTORY
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.3: Medicine Selection from Existing Inventory ---");
  const resEligible = await get(`/prescriptions/medicines/eligible?hospital_id=${hospital1Id}&search=Amoxicillin`, tokenDoctor1);
  assert.strictEqual(resEligible.status, 200, "Eligible medicines endpoint returns HTTP 200");
  assert.ok(Array.isArray(resEligible.body.data), "Eligible medicines data is an array");
  const amoxEligible = resEligible.body.data.find((m) => m.id === medicine1Id);
  assert.ok(amoxEligible, "Amoxicillin found in eligible list");
  assert.strictEqual(Number(amoxEligible.available_non_expired_stock), 150, "Only non-expired active batches (100 + 50 = 150) counted as available stock");
  console.log(`✔ Eligible medicines returned non-expired inventory stock: ${amoxEligible.available_non_expired_stock} units.`);

  // ---------------------------------------------------------------------------
  // LESSON 13.1 & 13.2: CREATING PRESCRIPTIONS DURING CONSULTATION & RELATIONSHIPS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.1 & 13.2: Creating Prescriptions and Relationship Validation ---");

  // Cross-hospital rejection: Doctor 2 trying to prescribe for Consultation in Hospital 1
  const resCrossHosp = await post(
    "/prescriptions",
    {
      consultation_id: consultation1Id,
      status: "draft",
      items: [{ medicine_name: "Amoxicillin 500mg M13", quantity: 10 }],
    },
    tokenDoctor2
  );
  assert.strictEqual(resCrossHosp.status, 403, "Cross-hospital / unauthorized doctor prescription rejected with HTTP 403");
  console.log("✔ Cross-hospital prescription creation successfully rejected.");

  // Save Draft Prescription by authorized Doctor 1
  const resDraftRx = await post(
    "/prescriptions",
    {
      consultation_id: consultation1Id,
      general_instructions: "Take with plenty of warm water. Report any gastrointestinal symptoms.",
      status: "draft",
      items: [
        {
          medicine_id: medicine1Id,
          medicine_name: "Amoxicillin 500mg M13",
          dosage: "1 Capsule",
          form: "Capsule",
          frequency: "1-0-1",
          duration: "5 Days",
          timing: "after_food",
          quantity: 10,
          instructions: "Complete entire course",
        },
      ],
    },
    tokenDoctor1
  );

  assert.strictEqual(resDraftRx.status, 201, "Draft prescription created with HTTP 201");
  assert.strictEqual(resDraftRx.body.data.status, "draft", "Prescription status correctly saved as 'draft'");
  const prescription1Id = resDraftRx.body.data.id;
  const prescriptionNumber1 = resDraftRx.body.data.prescription_number;
  console.log(`✔ Draft prescription #${prescriptionNumber1} successfully created.`);

  // Verify stock was NOT deducted merely by creating the prescription
  const [bCheck1] = await pool.execute(
    "SELECT current_quantity FROM medicine_batches WHERE id = ?",
    [b1Res.insertId]
  );
  assert.strictEqual(bCheck1[0].current_quantity, 100, "Prescription creation did NOT deduct inventory stock");
  console.log("✔ Preserved inventory integrity: Stock was not deducted upon prescription creation.");

  // ---------------------------------------------------------------------------
  // LESSON 13.4: DOSAGE, FREQUENCY, DURATION, MEAL INSTRUCTIONS & DUPLICATE PREVENTION
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.4: Instruction Validation and Duplicate Item Detection ---");

  // Attempt duplicate medicine line in same prescription
  const resDuplicateLine = await post(
    "/prescriptions",
    {
      consultation_id: consultation1Id,
      status: "draft",
      items: [
        { medicine_name: "Amoxicillin 500mg M13", quantity: 5 },
        { medicine_name: "Amoxicillin 500mg M13", quantity: 5 },
      ],
    },
    tokenDoctor1
  );
  assert.strictEqual(resDuplicateLine.status, 400, "Duplicate medicine in same prescription rejected with HTTP 400");
  assert.match(resDuplicateLine.body.message, /Duplicate medication/i, "Clear duplicate medication error returned");
  console.log("✔ Duplicate medicine lines correctly prevented.");

  // Reject negative quantity
  const resNegativeQty = await post(
    "/prescriptions",
    {
      consultation_id: consultation1Id,
      status: "draft",
      items: [{ medicine_name: "Paracetamol 650mg M13", quantity: -5 }],
    },
    tokenDoctor1
  );
  assert.strictEqual(resNegativeQty.status, 400, "Negative quantity rejected with HTTP 400");
  console.log("✔ Negative quantity validation correctly enforced.");

  // ---------------------------------------------------------------------------
  // LESSON 13.5: PRESCRIPTION STATUS MANAGEMENT
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.5: Prescription Status Transitions ---");

  // Transition draft -> active
  const resActivate = await patch(
    `/prescriptions/${prescription1Id}/status`,
    { status: "active", reason: "Physician finalized clinical consultation." },
    tokenDoctor1
  );
  assert.strictEqual(resActivate.status, 200, "Draft successfully activated with HTTP 200");
  assert.strictEqual(resActivate.body.data.to_status, "active", "Status is now 'active'");
  console.log("✔ Prescription status successfully transitioned: draft -> active.");

  // Ineligible transition: Cannot jump directly from active -> dispensed via PATCH
  const resInvalidJump = await patch(
    `/prescriptions/${prescription1Id}/status`,
    { status: "dispensed" },
    tokenDoctor1
  );
  assert.strictEqual(resInvalidJump.status, 400, "Manually jumping to dispensed rejected with HTTP 400");
  console.log("✔ State transition rules enforced: Dispensed status requires verified dispensing execution.");

  // Check prescription_status_history has recorded the transition
  const [historyRows] = await pool.execute(
    "SELECT * FROM prescription_status_history WHERE prescription_id = ? ORDER BY id DESC",
    [prescription1Id]
  );
  assert.ok(historyRows.length >= 1, "Status transition recorded in history ledger");
  assert.strictEqual(historyRows[0].to_status, "active", "History records transition to active");
  console.log("✔ Prescription status history audit trail verified.");

  // ---------------------------------------------------------------------------
  // LESSON 13.6 & 13.7: DYNAMIC LISTING, SEARCH & DATE/STATUS FILTERS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.6 & 13.7: Dynamic Listing, Search and Filters ---");

  // Search by prescription number
  const resSearchNum = await get(`/prescriptions?search=${prescriptionNumber1}`, tokenHospitalAdmin1);
  assert.strictEqual(resSearchNum.status, 200, "Search returns HTTP 200");
  assert.strictEqual(resSearchNum.body.data.length, 1, "Exact prescription found by search");

  // Search by patient name
  const resSearchPat = await get("/prescriptions?search=Rohan Verma", tokenHospitalAdmin1);
  assert.strictEqual(resSearchPat.status, 200, "Search by patient name returns HTTP 200");
  assert.ok(resSearchPat.body.data.length >= 1, "Patient search found prescriptions");

  // Status Filter
  const resFilterStatus = await get("/prescriptions?status=active", tokenHospitalAdmin1);
  assert.strictEqual(resFilterStatus.status, 200, "Filter by status active returns HTTP 200");
  for (const item of resFilterStatus.body.data) {
    assert.strictEqual(item.status, "active", "Every returned row has status 'active'");
  }

  // Reject invalid date range (from_date > to_date)
  const resBadDate = await get("/prescriptions?from_date=2026-12-31&to_date=2026-01-01", tokenHospitalAdmin1);
  assert.strictEqual(resBadDate.status, 400, "Invalid date range rejected with HTTP 400");
  console.log("✔ Search, status filter, and date range validation verified.");

  // ---------------------------------------------------------------------------
  // LESSON 13.8: VALIDATING MEDICINE STATUS, EXPIRY AND QUANTITY
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.8: Pre-dispensing Validation & Expiry Check ---");

  const resPreValidate = await post(`/prescriptions/${prescription1Id}/validate-dispense`, {}, tokenPharmacist1);
  assert.strictEqual(resPreValidate.status, 200, "Pre-dispense validation returns HTTP 200");
  assert.strictEqual(resPreValidate.body.data.is_eligible, true, "Prescription is eligible for dispensing");
  assert.strictEqual(resPreValidate.body.data.items[0].remaining_quantity, 10, "Remaining quantity is 10");
  console.log("✔ Pre-dispense validation confirmed non-expired stock and correct remaining quantity.");

  // ---------------------------------------------------------------------------
  // LESSON 13.9: PREVENTING INVALID OR CANCELLED PRESCRIPTION PROCESSING
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.9: Preventing Invalid / Cancelled Dispensing ---");

  // Create a separate draft prescription to test rejection
  const [apptDraftRes] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '12:00:00', 'consultation', 'completed')`,
    [`APT-M13-DRAFT-${stamp}`, patient1Id, doctor1Id, hospital1Id, department1Id]
  );
  const [consDraftRes] = await pool.execute(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'draft', 'Test draft check', 'General observation')`,
    [apptDraftRes.insertId, patient1Id, doctor1Id, hospital1Id]
  );
  const resDraftRxCheck = await post(
    "/prescriptions",
    {
      consultation_id: consDraftRes.insertId,
      status: "draft",
      items: [{ medicine_name: "Amoxicillin 500mg M13", quantity: 5 }],
    },
    tokenDoctor1
  );
  const draftRxId = resDraftRxCheck.body.data.id;

  // Dispensing a draft prescription MUST be rejected
  const resDispenseDraft = await post(`/prescriptions/${draftRxId}/dispense`, {}, tokenPharmacist1);
  assert.strictEqual(resDispenseDraft.status, 400, "Dispensing a draft prescription rejected with HTTP 400");
  assert.match(resDispenseDraft.body.message, /draft/i, "Clear error indicating prescription is draft");
  console.log("✔ Dispensing draft prescription strictly prevented.");

  // Cancel the draft prescription and verify dispensing is still rejected
  await patch(`/prescriptions/${draftRxId}/status`, { status: "cancelled", reason: "Consultation discontinued." }, tokenDoctor1);
  const resDispenseCancelled = await post(`/prescriptions/${draftRxId}/dispense`, {}, tokenPharmacist1);
  assert.strictEqual(resDispenseCancelled.status, 400, "Dispensing a cancelled prescription rejected with HTTP 400");
  assert.match(resDispenseCancelled.body.message, /cancelled/i, "Clear error indicating prescription is cancelled");
  console.log("✔ Dispensing cancelled prescription strictly prevented.");

  // Reject dispensing quantity greater than remaining prescribed quantity
  const resExcessQty = await post(
    `/prescriptions/${prescription1Id}/dispense`,
    {
      items: [{ medicine_id: medicine1Id, quantity_to_dispense: 999 }],
    },
    tokenPharmacist1
  );
  assert.strictEqual(resExcessQty.status, 400, "Excess quantity rejected with HTTP 400");
  assert.match(resExcessQty.body.message, /exceeds remaining prescribed quantity/i);
  console.log("✔ Excess quantity beyond prescribed limit strictly prevented.");

  // ---------------------------------------------------------------------------
  // LESSON 13.10: PRESCRIPTION HISTORY & PHARMACY DISPENSING INTEGRATION
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 13.10: Pharmacy Dispensing, Partial Fulfillment & History ---");

  // Partial Dispensing: Dispense 4 out of 10 capsules
  const resPartialDispense = await post(
    `/prescriptions/${prescription1Id}/dispense`,
    {
      items: [{ medicine_id: medicine1Id, quantity_to_dispense: 4, discount_percent: 5 }],
      payment_method: "cash",
      notes: "First partial installment",
    },
    tokenPharmacist1
  );

  assert.strictEqual(resPartialDispense.status, 201, "Partial dispensing succeeded with HTTP 201");
  assert.strictEqual(resPartialDispense.body.data.prescription_status, "partially_dispensed", "Prescription status updated to 'partially_dispensed'");
  console.log("✔ Partial dispensing succeeded: Status transitioned to 'partially_dispensed'.");

  // Verify FEFO batch stock reduction: Batch 1 (earliest expiry) was reduced from 100 to 96
  const [b1AfterPartial] = await pool.execute("SELECT current_quantity FROM medicine_batches WHERE id = ?", [b1Res.insertId]);
  assert.strictEqual(b1AfterPartial[0].current_quantity, 96, "Batch 1 stock reduced by exactly 4 units via FEFO");

  // Verify stock movement ledger
  const [smRows] = await pool.execute(
    "SELECT * FROM stock_movements WHERE reference_id = ? AND movement_type = 'dispense'",
    [resPartialDispense.body.data.dispensation_number]
  );
  assert.strictEqual(smRows.length, 1, "Stock movement ledger entry created");
  assert.strictEqual(smRows[0].quantity_change, -4, "Negative stock movement recorded");

  // Verify Pending Queue shows 'partially_dispensed' prescription with remaining quantity = 6
  const resPendingQueue = await get("/pharmacy/prescriptions/pending", tokenPharmacist1);
  assert.strictEqual(resPendingQueue.status, 200, "Pending prescriptions endpoint returns HTTP 200");
  const partialInQueue = resPendingQueue.body.data.find((r) => r.id === prescription1Id);
  assert.ok(partialInQueue, "Partially dispensed prescription still visible in pending queue");
  assert.strictEqual(partialInQueue.status, "partially_dispensed", "Queue indicates partially_dispensed");
  assert.strictEqual(partialInQueue.items[0].remaining_quantity, 6, "Remaining quantity accurately calculated as 6");
  console.log(`✔ Pharmacy pending queue accurately displays partially fulfilled prescription (Remaining: ${partialInQueue.items[0].remaining_quantity}).`);

  // Final Dispensing: Dispense remaining 6 capsules to complete prescription
  const resFinalDispense = await post(
    `/prescriptions/${prescription1Id}/dispense`,
    {
      items: [{ medicine_id: medicine1Id, quantity_to_dispense: 6 }],
      payment_method: "card",
      notes: "Final installment",
    },
    tokenPharmacist1
  );

  assert.strictEqual(resFinalDispense.status, 201, "Final dispensing succeeded with HTTP 201");
  assert.strictEqual(resFinalDispense.body.data.prescription_status, "dispensed", "Prescription status updated to 'dispensed'");
  console.log("✔ Full fulfillment completed: Status transitioned to 'dispensed'.");

  // Dispensing again MUST be rejected because prescription is now 'dispensed'
  const resDispenseAgain = await post(`/prescriptions/${prescription1Id}/dispense`, {}, tokenPharmacist1);
  assert.strictEqual(resDispenseAgain.status, 400, "Cannot dispense already fully fulfilled prescription");
  console.log("✔ Double-dispensing protection confirmed.");

  // Prescriptions details endpoint verification
  const resRxDetails = await get(`/prescriptions/${prescription1Id}`, tokenPharmacist1);
  assert.strictEqual(resRxDetails.status, 200, "Prescription details endpoint returns HTTP 200");
  assert.strictEqual(resRxDetails.body.data.status, "dispensed", "Details show status 'dispensed'");
  assert.strictEqual(resRxDetails.body.data.dispensations.length, 2, "Both dispensation transactions linked");
  assert.ok(resRxDetails.body.data.status_history.length >= 3, "Status history includes all transitions");
  console.log(`✔ Prescription #${prescriptionNumber1} details verified with ${resRxDetails.body.data.dispensations.length} linked dispensations.`);

  // Patient access verification: Patient 1 can view, Patient 2 cannot access Patient 1's prescription
  const resPatHistoryMe = await get("/prescriptions/patient/me", tokenPatient1);
  assert.strictEqual(resPatHistoryMe.status, 200, "Patient can retrieve own prescription history");
  assert.ok(resPatHistoryMe.body.data.some((r) => r.id === prescription1Id), "Patient 1's prescription listed in their own history");

  const resPat2AccessPat1 = await get(`/prescriptions/${prescription1Id}`, tokenPatient2);
  assert.strictEqual(resPat2AccessPat1.status, 403, "Patient 2 access to Patient 1's prescription rejected with HTTP 403");
  console.log("✔ Patient data privacy and authorization verified.");

  // Doctor prescription history verification
  const resDocHistory = await get(`/prescriptions/doctor/${doctor1Id}`, tokenDoctor1);
  assert.strictEqual(resDocHistory.status, 200, "Doctor can view authored prescription history");
  assert.ok(resDocHistory.body.data.some((r) => r.id === prescription1Id), "Prescription found in doctor's history");
  console.log("✔ Doctor prescription history verified.");

  console.log("\n================================================================================");
  console.log("=== ALL MODULE 13 TESTS PASSED SUCCESSFULLY! ===");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
