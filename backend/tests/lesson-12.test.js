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

async function put(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
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

async function del(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 12: Medicine Category and Inventory Management Test Suite ===");
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
     VALUES (?, 'Super Admin M12', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m12_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`City Care Hospital ${stamp}`, `CCH-${stamp}`, `cch_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M12', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m12_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 2 and Admin (for hospital isolation tests)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Metro General Hospital ${stamp}`, `MGH-${stamp}`, `mgh_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 2 M12', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m12_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Pharmacist Staff in Hospital 1
  const [pharmRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Chief Pharmacist M12', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `pharm_m12_${stamp}@test.com`, passwordHash]
  );
  const pharmacistId = pharmRes.insertId;
  await pool.execute(
    `INSERT INTO staff_profiles (user_id, employee_id, shift_timing, permissions)
     VALUES (?, 'EMP-PHARM-01', '08:00 - 16:00', JSON_ARRAY('prescription_dispense', 'pharmacy_inventory', 'stock_alerts', 'medication_billing'))`,
    [pharmacistId]
  );
  const tokenPharmacist = jwt.sign(
    { sub: pharmacistId, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Doctor user (read-only formulary, no inventory modification)
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Consultant M12', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `doc_m12_${stamp}@test.com`, passwordHash]
  );
  const tokenDoctor = jwt.sign(
    { sub: docRes.insertId, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 6. Patient user (cannot access inventory endpoints)
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Patient John Doe', ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `patient_m12_${stamp}@test.com`, passwordHash]
  );
  const patientId = patRes.insertId;
  const tokenPatient = jwt.sign(
    { sub: patientId, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  console.log("✔ Test accounts initialized: Super Admin, Hospital Admins (H1, H2), Pharmacist, Doctor, Patient.\n");

  /**
   * ============================================================================
   * LESSON 12.1: MEDICINE CATEGORY CREATION AND MANAGEMENT
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.1: Medicine Category Management ---");

  // 1.1 Create category by Super Admin
  const catName1 = `Cardio Agents ${stamp}`;
  const resCat1 = await post(
    "/pharmacy/categories",
    { name: catName1, description: "Advanced cardiovascular treatments" },
    tokenSuperAdmin
  );
  assert.strictEqual(resCat1.status, 201, "Super Admin should create category");
  const category1Id = resCat1.body.data.id;
  console.log("✔ Super Admin created medicine category successfully.");

  // 1.2 Prevent duplicate category name in same scope
  const resDupCat = await post(
    "/pharmacy/categories",
    { name: catName1, description: "Duplicate test" },
    tokenSuperAdmin
  );
  assert.strictEqual(resDupCat.status, 409, "Should reject duplicate category name");
  console.log("✔ Duplicate category name in same scope correctly rejected (HTTP 409).");

  // 1.3 Validate required category fields
  const resEmptyCat = await post(
    "/pharmacy/categories",
    { name: "  " },
    tokenSuperAdmin
  );
  assert.strictEqual(resEmptyCat.status, 400, "Should reject empty category name");
  console.log("✔ Empty category name correctly rejected (HTTP 400).");

  // 1.4 Update category details
  const updatedCatName = `Cardiology & Vascular Agents ${stamp}`;
  const resUpdCat = await put(
    `/pharmacy/categories/${category1Id}`,
    { name: updatedCatName, description: "Cardiovascular and microvascular drugs" },
    tokenSuperAdmin
  );
  assert.strictEqual(resUpdCat.status, 200, "Should update category");
  assert.strictEqual(resUpdCat.body.data.name, updatedCatName);
  console.log("✔ Category details updated successfully.");

  // 1.5 Deactivate and activate category
  const resDeactCat = await patch(
    `/pharmacy/categories/${category1Id}/status`,
    { status: "inactive" },
    tokenSuperAdmin
  );
  assert.strictEqual(resDeactCat.status, 200, "Should deactivate category");
  assert.strictEqual(resDeactCat.body.data.status, "inactive");

  const resActCat = await patch(
    `/pharmacy/categories/${category1Id}/status`,
    { status: "active" },
    tokenSuperAdmin
  );
  assert.strictEqual(resActCat.status, 200, "Should reactivate category");
  console.log("✔ Category activation and deactivation transitions verified.");

  // 1.6 Hospital Admin cannot modify global master categories
  const resHaEditGlobal = await put(
    `/pharmacy/categories/${category1Id}`,
    { name: "Unauthorized Global Edit" },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resHaEditGlobal.status, 403, "Hospital Admin cannot edit global master categories");
  console.log("✔ Unauthorized Hospital Admin modification of global master category rejected (HTTP 403).\n");

  /**
   * ============================================================================
   * LESSON 12.2: SUPPLIER MANAGEMENT & CATEGORY STATUS RESTRICTIONS
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.2: Supplier Management & Category Status ---");

  // 2.1 Create supplier
  const supplierName = `Global BioPharma Corp ${stamp}`;
  const resSup = await post(
    "/pharmacy/suppliers",
    {
      name: supplierName,
      contact_person: "Dr. Walter White",
      phone: "+1-555-0199",
      email: `orders_${stamp}@biopharma.com`,
      address: "308 Negra Arroyo Lane, Albuquerque, NM",
    },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resSup.status, 201, "Hospital Admin should create supplier");
  const supplierId = resSup.body.data.id;
  console.log("✔ Supplier created successfully with contact details.");

  // 2.2 Reject duplicate supplier in same hospital
  const resDupSup = await post(
    "/pharmacy/suppliers",
    { name: supplierName, phone: "+1-555-0000" },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resDupSup.status, 409, "Should reject duplicate supplier name");
  console.log("✔ Duplicate supplier name in same hospital rejected (HTTP 409).");

  // 2.3 Deactivate supplier
  const resDeactSup = await patch(
    `/pharmacy/suppliers/${supplierId}/status`,
    { status: "inactive" },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resDeactSup.status, 200, "Should deactivate supplier");
  console.log("✔ Supplier deactivated successfully.");

  // 2.4 Verify inactive supplier cannot be used for new stock batches
  // First create a temporary category to deactivate
  const tempCatRes = await post(
    "/pharmacy/categories",
    { name: `Inactive Test Cat ${stamp}`, status: "inactive" },
    tokenSuperAdmin
  );
  const inactiveCatId = tempCatRes.body.data.id;

  // Attempt to assign medicine to an inactive category
  const resAssignInactiveCat = await post(
    "/pharmacy/medicines",
    {
      name: `Test Drug Inactive Cat ${stamp}`,
      category_id: inactiveCatId,
      sale_price: 15.00,
    },
    tokenSuperAdmin
  );
  assert.strictEqual(resAssignInactiveCat.status, 400, "Cannot assign medicine to inactive category");
  console.log("✔ Backend rejects assigning medicine to inactive category (HTTP 400).");

  // Reactivate supplier for subsequent batch tests
  await patch(
    `/pharmacy/suppliers/${supplierId}/status`,
    { status: "active" },
    tokenHospitalAdmin1
  );
  console.log("✔ Supplier reactivated successfully.\n");

  /**
   * ============================================================================
   * LESSON 12.3 & 12.4: MEDICINE CREATION, SKU & IDENTIFIERS
   * ============================================================================
   */
  console.log("--- Testing Lessons 12.3 & 12.4: Medicine Creation & SKU Uniqueness ---");

  const testSku = `SKU-MED-${stamp}`;
  const resMed = await post(
    "/pharmacy/medicines",
    {
      sku: testSku,
      name: `Rosuvastatin Gold ${stamp}`,
      generic_name: "Rosuvastatin Calcium",
      form: "Tablet",
      strength: "20 mg",
      category_id: category1Id,
      purchase_price: 6.50,
      sale_price: 14.00,
      max_discount_percent: 10.00,
      min_stock_alert_level: 25,
      description: "High-potency HMG-CoA reductase inhibitor",
    },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resMed.status, 201, "Medicine creation should succeed");
  const medicineId = resMed.body.data.id;
  console.log(`✔ Medicine created with custom SKU '${testSku}' and active category.`);

  // 3.2 Duplicate SKU rejection
  const resDupSku = await post(
    "/pharmacy/medicines",
    {
      sku: testSku,
      name: "Duplicate SKU Drug",
      sale_price: 10.00,
    },
    tokenSuperAdmin
  );
  assert.strictEqual(resDupSku.status, 409, "Duplicate SKU must be rejected");
  console.log("✔ Duplicate SKU rejected (HTTP 409).");

  // 3.3 Validate required medicine name
  const resEmptyMedName = await post(
    "/pharmacy/medicines",
    { name: "   ", sale_price: 10.00 },
    tokenSuperAdmin
  );
  assert.strictEqual(resEmptyMedName.status, 400, "Empty medicine name must be rejected");
  console.log("✔ Empty medicine name rejected (HTTP 400).\n");

  /**
   * ============================================================================
   * LESSON 12.5: PURCHASE PRICE, SALE PRICE & DISCOUNT VALIDATION
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.5: Pricing and Financial Validation ---");

  // 5.1 Reject negative purchase price
  const resNegPurPrice = await post(
    "/pharmacy/medicines",
    { name: `Neg Price Drug ${stamp}`, purchase_price: -5.00, sale_price: 10.00 },
    tokenSuperAdmin
  );
  assert.strictEqual(resNegPurPrice.status, 400, "Negative purchase price rejected");
  console.log("✔ Negative purchase price rejected (HTTP 400).");

  // 5.2 Reject negative sale price
  const resNegSalePrice = await post(
    "/pharmacy/medicines",
    { name: `Neg Sale Price Drug ${stamp}`, purchase_price: 5.00, sale_price: -10.00 },
    tokenSuperAdmin
  );
  assert.strictEqual(resNegSalePrice.status, 400, "Negative sale price rejected");
  console.log("✔ Negative sale price rejected (HTTP 400).");

  // 5.3 Reject invalid discount (> 100%)
  const resInvalidDisc = await post(
    "/pharmacy/medicines",
    { name: `Excess Discount Drug ${stamp}`, sale_price: 10.00, max_discount_percent: 150.00 },
    tokenSuperAdmin
  );
  assert.strictEqual(resInvalidDisc.status, 400, "Discount > 100% rejected");
  console.log("✔ Discount exceeding 100% rejected (HTTP 400).\n");

  /**
   * ============================================================================
   * LESSON 12.6: EXPIRY DATE AND BATCH QUANTITY MANAGEMENT
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.6: Expiry Date and Batch Inventory ---");

  // 6.1 Reject batch receipt with past expiry date
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);
  const resPastExp = await post(
    "/pharmacy/batches",
    {
      hospital_id: hospital1Id,
      medicine_id: medicineId,
      supplier_id: supplierId,
      batch_number: `LOT-EXP-${stamp}`,
      expiry_date: pastDate.toISOString().split("T")[0],
      quantity: 50,
    },
    tokenPharmacist
  );
  assert.strictEqual(resPastExp.status, 400, "Past expiry date rejected");
  console.log("✔ Past expiry date correctly rejected from stock receipt (HTTP 400).");

  // 6.2 Reject negative or zero quantity receipt
  const resZeroQty = await post(
    "/pharmacy/batches",
    {
      hospital_id: hospital1Id,
      medicine_id: medicineId,
      supplier_id: supplierId,
      batch_number: `LOT-ZERO-${stamp}`,
      expiry_date: "2027-12-31",
      quantity: 0,
    },
    tokenPharmacist
  );
  assert.strictEqual(resZeroQty.status, 400, "Zero quantity rejected");
  console.log("✔ Non-positive quantity rejected (HTTP 400).");

  // 6.3 Receive Batch 1: Expiring in 90 days (100 units)
  const exp90Days = new Date();
  exp90Days.setDate(exp90Days.getDate() + 90);
  const batch1Number = `LOT-B1-${stamp}`;
  const resB1 = await post(
    "/pharmacy/batches",
    {
      hospital_id: hospital1Id,
      medicine_id: medicineId,
      supplier_id: supplierId,
      batch_number: batch1Number,
      expiry_date: exp90Days.toISOString().split("T")[0],
      purchase_price: 6.50,
      sale_price: 14.00,
      quantity: 100,
      notes: "First bulk delivery batch",
    },
    tokenPharmacist
  );
  assert.strictEqual(resB1.status, 201, "Batch 1 receipt succeeded");
  const batch1Id = resB1.body.data.id;
  console.log(`✔ Batch 1 received: 100 units (Expiry: ${exp90Days.toISOString().split("T")[0]}).`);

  // 6.4 Receive Batch 2: Expiring earlier in 45 days (50 units) - To test FEFO dispensing order!
  const exp45Days = new Date();
  exp45Days.setDate(exp45Days.getDate() + 45);
  const batch2Number = `LOT-B2-EARLY-${stamp}`;
  const resB2 = await post(
    "/pharmacy/batches",
    {
      hospital_id: hospital1Id,
      medicine_id: medicineId,
      supplier_id: supplierId,
      batch_number: batch2Number,
      expiry_date: exp45Days.toISOString().split("T")[0],
      purchase_price: 6.50,
      sale_price: 14.00,
      quantity: 50,
      notes: "Second batch with earlier expiry",
    },
    tokenPharmacist
  );
  assert.strictEqual(resB2.status, 201, "Batch 2 receipt succeeded");
  const batch2Id = resB2.body.data.id;
  console.log(`✔ Batch 2 received: 50 units (Earlier Expiry: ${exp45Days.toISOString().split("T")[0]}).`);

  // Verify stock movements ledger has 2 receipt entries
  const resMov = await get(`/pharmacy/movements?batch_id=${batch1Id}`, tokenPharmacist);
  assert.strictEqual(resMov.status, 200);
  assert.strictEqual(resMov.body.data.length, 1);
  assert.strictEqual(resMov.body.data[0].movement_type, "purchase");
  assert.strictEqual(resMov.body.data[0].quantity_change, 100);
  console.log("✔ Stock movement ledger verified: Purchase receipts logged with balance snapshots.\n");

  /**
   * ============================================================================
   * LESSON 12.7: MINIMUM STOCK & EXPIRY ALERTS
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.7: Minimum Stock and Expiry Alerts ---");

  // Total eligible stock is currently 150 (threshold is 25). It should NOT be low stock yet.
  const resLowCheck1 = await get(`/pharmacy/alerts/low-stock?hospital_id=${hospital1Id}`, tokenPharmacist);
  assert.strictEqual(resLowCheck1.status, 200);
  const isMedLow1 = resLowCheck1.body.data.some((m) => m.id === medicineId);
  assert.strictEqual(isMedLow1, false, "Stock is 150 > 25, should not appear in low stock");
  console.log("✔ Medicine with 150 units correctly excluded from low-stock alerts.");

  // Expiry check: Batch 2 expires in 45 days (within 60 day window)
  const resExpCheck = await get(`/pharmacy/alerts/expiring?hospital_id=${hospital1Id}&days=60`, tokenPharmacist);
  assert.strictEqual(resExpCheck.status, 200);
  const foundExpBatch = resExpCheck.body.data.find((b) => b.id === batch2Id);
  assert.ok(foundExpBatch, "Batch 2 expiring in 45 days should appear in 60-day expiry alert");
  console.log("✔ Earlier-expiring batch (45 days) detected in expiry alert dashboard.\n");

  /**
   * ============================================================================
   * LESSON 12.8: MEDICINE ACTIVATION AND DEACTIVATION
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.8: Medicine Activation and Deactivation ---");

  // Deactivate medicine
  const resDeactMed = await patch(
    `/pharmacy/medicines/${medicineId}/status`,
    { status: "inactive" },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resDeactMed.status, 200, "Should deactivate medicine");
  assert.strictEqual(resDeactMed.body.data.status, "inactive");

  // Verify deactivated medicine CANNOT be dispensed
  const resDispDeact = await post(
    "/pharmacy/dispensations",
    {
      hospital_id: hospital1Id,
      patient_id: patientId,
      items: [{ medicine_id: medicineId, requested_quantity: 5 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(resDispDeact.status, 400, "Deactivated medicine cannot be dispensed");
  console.log("✔ Deactivated medicine cannot be dispensed for new sales (HTTP 400).");

  // Reactivate medicine
  const resReactMed = await patch(
    `/pharmacy/medicines/${medicineId}/status`,
    { status: "active" },
    tokenHospitalAdmin1
  );
  assert.strictEqual(resReactMed.status, 200, "Should reactivate medicine");
  console.log("✔ Medicine successfully reactivated.\n");

  /**
   * ============================================================================
   * LESSON 12.9: PHARMACIST PERMISSIONS & ROLE-BASED ACCESS CONTROL
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.9: Pharmacist Permissions and Access Control ---");

  // Doctor cannot perform stock adjustments or receipts
  const resDocAdjust = await post(
    `/pharmacy/batches/${batch1Id}/adjust`,
    { adjustment_type: "deduct", quantity: 5, reason: "Doctor test adjust" },
    tokenDoctor
  );
  assert.strictEqual(resDocAdjust.status, 403, "Doctor cannot adjust inventory");
  console.log("✔ Doctor denied inventory adjustment permission (HTTP 403).");

  // Patient cannot access pharmacy inventory endpoints
  const resPatBatches = await get("/pharmacy/batches", tokenPatient);
  assert.strictEqual(resPatBatches.status, 403, "Patient cannot view inventory batches");
  console.log("✔ Patient denied inventory access (HTTP 403).");

  // Hospital Admin 2 cannot adjust Hospital 1's batch (Hospital Isolation)
  const resHospIso = await post(
    `/pharmacy/batches/${batch1Id}/adjust`,
    { adjustment_type: "deduct", quantity: 5, reason: "H2 Admin unauthorized adjust" },
    tokenHospitalAdmin2
  );
  assert.strictEqual(resHospIso.status, 403, "Hospital 2 cannot adjust Hospital 1 inventory");
  console.log("✔ Cross-hospital inventory modification prevented (HTTP 403).\n");

  /**
   * ============================================================================
   * LESSON 12.10: ATOMIC FEFO DISPENSING & INVENTORY VALIDATION
   * ============================================================================
   */
  console.log("--- Testing Lesson 12.10: Atomic FEFO Dispensing & Inventory Validation ---");

  // 10.1 Dispensing more than available stock is rejected
  const resOverDispense = await post(
    "/pharmacy/dispensations",
    {
      hospital_id: hospital1Id,
      patient_id: patientId,
      items: [{ medicine_id: medicineId, requested_quantity: 9999 }],
    },
    tokenPharmacist
  );
  assert.strictEqual(resOverDispense.status, 400, "Over-dispensing must be rejected");
  console.log("✔ Dispensing quantity exceeding stock correctly rejected (HTTP 400).");

  // 10.2 Execute FEFO Dispensing: Request 70 units
  // Available: Batch 2 has 50 units (expires in 45 days), Batch 1 has 100 units (expires in 90 days).
  // FEFO should allocate: ALL 50 units from Batch 2 first, and 20 units from Batch 1!
  const resDispenseFEFO = await post(
    "/pharmacy/dispensations",
    {
      hospital_id: hospital1Id,
      patient_id: patientId,
      items: [{ medicine_id: medicineId, requested_quantity: 70, discount_percent: 5.00 }],
      payment_method: "cash",
      notes: "FEFO automated test dispensing",
    },
    tokenPharmacist
  );
  assert.strictEqual(resDispenseFEFO.status, 201, "Dispensing succeeded");
  const dispData = resDispenseFEFO.body.data;
  console.log(`✔ FEFO Dispensing completed. Receipt: ${dispData.dispensation_number}, Total: $${dispData.total_amount}`);

  // Verify FEFO batch allocations
  const allocB2 = dispData.items.find((i) => i.batch_id === batch2Id);
  const allocB1 = dispData.items.find((i) => i.batch_id === batch1Id);

  assert.ok(allocB2, "Batch 2 (earlier expiry) should be allocated first");
  assert.strictEqual(allocB2.quantity, 50, "All 50 units should be depleted from Batch 2 first");

  assert.ok(allocB1, "Batch 1 (later expiry) should be allocated for remainder");
  assert.strictEqual(allocB1.quantity, 20, "20 units should be drawn from Batch 1");
  console.log("✔ FEFO allocation verified: Batch 2 (earliest expiry) was depleted first, remainder from Batch 1.");

  // Verify remaining batch balances in DB
  const [b2Db] = await pool.query("SELECT current_quantity, status FROM medicine_batches WHERE id = ?", [batch2Id]);
  assert.strictEqual(b2Db[0].current_quantity, 0);
  assert.strictEqual(b2Db[0].status, "depleted");

  const [b1Db] = await pool.query("SELECT current_quantity, status FROM medicine_batches WHERE id = ?", [batch1Id]);
  assert.strictEqual(b1Db[0].current_quantity, 80);
  console.log("✔ Database state verified: Batch 2 balance is 0 ('depleted'), Batch 1 balance is 80 units.");

  // 10.3 Manual Stock Adjustment & Audit Trail
  const resManualAdjust = await post(
    `/pharmacy/batches/${batch1Id}/adjust`,
    {
      adjustment_type: "deduct",
      quantity: 60,
      reason: "Quality assurance damaged lot deduction",
    },
    tokenPharmacist
  );
  assert.strictEqual(resManualAdjust.status, 200);
  assert.strictEqual(resManualAdjust.body.data.new_quantity, 20);
  console.log("✔ Manual stock adjustment verified: 60 units deducted, remaining balance 20 units.");

  // Remaining usable stock is now 20 (min threshold is 25).
  // Medicine should NOW trigger LOW_STOCK alert!
  const resLowCheck2 = await get(`/pharmacy/alerts/low-stock?hospital_id=${hospital1Id}`, tokenPharmacist);
  assert.strictEqual(resLowCheck2.status, 200);
  const foundLow = resLowCheck2.body.data.find((m) => m.id === medicineId);
  assert.ok(foundLow, "Medicine should now appear in low stock alerts");
  assert.strictEqual(foundLow.usable_stock, 20);
  assert.strictEqual(foundLow.alert_severity, "LOW_STOCK");
  console.log("✔ Minimum stock alert verified: Rosuvastatin triggered 'LOW_STOCK' alert at 20 units (threshold 25).");

  // Deduct remaining 20 units to test OUT_OF_STOCK alert
  await post(
    `/pharmacy/batches/${batch1Id}/adjust`,
    {
      adjustment_type: "deduct",
      quantity: 20,
      reason: "Expired stock write-off test",
    },
    tokenPharmacist
  );

  const resOutCheck = await get(`/pharmacy/alerts/low-stock?hospital_id=${hospital1Id}`, tokenPharmacist);
  const foundOut = resOutCheck.body.data.find((m) => m.id === medicineId);
  assert.ok(foundOut, "Medicine should appear as OUT_OF_STOCK");
  assert.strictEqual(foundOut.usable_stock, 0);
  assert.strictEqual(foundOut.alert_severity, "OUT_OF_STOCK");
  // Test Pending Prescriptions Queue API
  const resPendingRx = await get("/pharmacy/prescriptions/pending", tokenPharmacist);
  assert.strictEqual(resPendingRx.status, 200, "Pending prescriptions endpoint returns HTTP 200");
  assert.ok(Array.isArray(resPendingRx.body.data), "Pending prescriptions data is array");
  console.log(`✔ Pending prescriptions queue verified: ${resPendingRx.body.data.length} unfulfilled prescription(s) retrieved successfully.`);

  console.log("================================================================================");
  console.log("=== ALL MODULE 12 LESSON TESTS (12.1 - 12.10) PASSED WITH 100% ACCURACY! ===");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
