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

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "GET",
    headers,
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

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.3 Hospital-Specific Lab Pricing Test Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Two Active Hospitals
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`City Care Hospital ${stamp}`, `CCH-${stamp}`, `cch_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Apex Healthcare ${stamp}`, `AHC-${stamp}`, `ahc_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  // 2. Users: Super Admin, Hospital Admin 1, Hospital Admin 2, Doctor 1, Staff 1, Patient 1
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["super_admin"], `Super Admin ${stamp}`, `sa_${stamp}@m11.com`, passwordHash]
  );
  const saId = saRes.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `HA One ${stamp}`, `ha1_${stamp}@m11.com`, passwordHash]
  );
  const ha1Id = ha1Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `HA Two ${stamp}`, `ha2_${stamp}@m11.com`, passwordHash]
  );
  const ha2Id = ha2Res.insertId;

  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `Dr. Price Specialist ${stamp}`, `doc_${stamp}@m11.com`, passwordHash]
  );
  const docId = docRes.insertId;

  const [staffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Staff Worker ${stamp}`, `staff_${stamp}@m11.com`, passwordHash]
  );
  const staffId = staffRes.insertId;

  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `John Doe ${stamp}`, `pat_${stamp}@m11.com`, passwordHash]
  );
  const patientId = patRes.insertId;

  // Generate tokens
  function makeToken(id, role, hospId = null) {
    return jwt.sign(
      { sub: id, role, hospitalId: hospId, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
  }

  const superAdminToken = makeToken(saId, "super_admin");
  const ha1Token = makeToken(ha1Id, "hospital_admin", hospital1Id);
  const ha2Token = makeToken(ha2Id, "hospital_admin", hospital2Id);
  const doctorToken = makeToken(docId, "doctor", hospital1Id);
  const staffToken = makeToken(staffId, "staff", hospital1Id);
  const patientToken = makeToken(patientId, "patient");

  // Create a Master Test for pricing tests
  const testCode = `THY-${stamp.toString().slice(-4)}`;
  const [masterRes] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Thyroid Stimulating Hormone (TSH)', 'Endocrinology', 'Blood', 12, 'active')`,
    [testCode]
  );
  const masterTestId = masterRes.insertId;

  let hosp1OfferingId = null;
  let hosp2OfferingId = null;

  try {
    // ------------------------------------------------------------------------
    // Test 1: Hospitals can configure different rates for the same master test
    // ------------------------------------------------------------------------
    console.log("Test 1: Assign same master test to Hospital 1 (₹350.00) and Hospital 2 (₹550.00)...");
    const assignH1 = await post(
      "/labs/hospital-tests",
      {
        hospital_id: hospital1Id,
        master_test_id: masterTestId,
        price: 350.0,
      },
      ha1Token
    );
    assert.strictEqual(assignH1.status, 201, "Hospital 1 assignment failed");
    hosp1OfferingId = assignH1.body.data[0].id;
    assert.strictEqual(assignH1.body.data[0].price, 350.0);

    const assignH2 = await post(
      "/labs/hospital-tests",
      {
        hospital_id: hospital2Id,
        master_test_id: masterTestId,
        price: 550.0,
      },
      ha2Token
    );
    assert.strictEqual(assignH2.status, 201, "Hospital 2 assignment failed");
    hosp2OfferingId = assignH2.body.data[0].id;
    assert.strictEqual(assignH2.body.data[0].price, 550.0);
    console.log("-> PASSED: Independent hospital offerings created with hospital-specific prices.");

    // ------------------------------------------------------------------------
    // Test 2: Hospital Admin can update rate via PATCH /api/labs/hospital-tests/:id/price
    // ------------------------------------------------------------------------
    console.log("Test 2: Hospital Admin 1 updates rate from ₹350.00 to ₹425.50...");
    const updateRes = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: 425.5 },
      ha1Token
    );
    assert.strictEqual(updateRes.status, 200, "Price update failed");
    assert.strictEqual(updateRes.body.success, true);
    assert.strictEqual(updateRes.body.data.price, 425.5);
    assert.strictEqual(updateRes.body.data.previous_price, 350.0);

    // Verify Hospital 2's price remains completely unaffected
    const [h2Check] = await pool.query(
      "SELECT price FROM hospital_lab_tests WHERE id = ?",
      [hosp2OfferingId]
    );
    assert.strictEqual(parseFloat(h2Check[0].price), 550.0, "Hospital 2 price should not have changed");
    console.log("-> PASSED: Rate updated successfully, and other hospital prices remained untouched.");

    // ------------------------------------------------------------------------
    // Test 3: Validation: Rejection of negative, non-numeric, and missing prices
    // ------------------------------------------------------------------------
    console.log("Test 3: Price validation (reject negative, string, or missing)...");
    const negRes = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: -25.0 },
      ha1Token
    );
    assert.strictEqual(negRes.status, 400, "Negative price should return 400");

    const nanRes = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: "free_test" },
      ha1Token
    );
    assert.strictEqual(nanRes.status, 400, "Non-numeric price should return 400");

    const emptyRes = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      {},
      ha1Token
    );
    assert.strictEqual(emptyRes.status, 400, "Empty price payload should return 400");
    console.log("-> PASSED: Non-negative numerical validation rules enforced.");

    // ------------------------------------------------------------------------
    // Test 4: Role-based authorization: Doctors, Staff, and Patients cannot update prices
    // ------------------------------------------------------------------------
    console.log("Test 4: RBAC: Doctor, Staff, Patient cannot modify test prices...");
    const docTry = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: 100.0 },
      doctorToken
    );
    assert.strictEqual(docTry.status, 403, "Doctor should receive 403 Forbidden");

    const staffTry = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: 100.0 },
      staffToken
    );
    assert.strictEqual(staffTry.status, 403, "Staff should receive 403 Forbidden");

    const patTry = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: 100.0 },
      patientToken
    );
    assert.strictEqual(patTry.status, 403, "Patient should receive 403 Forbidden");
    console.log("-> PASSED: Role authorization strictly enforced (Super Admin and Hospital Admin only).");

    // ------------------------------------------------------------------------
    // Test 5: Hospital Data Isolation: HA 1 cannot modify HA 2's test prices
    // ------------------------------------------------------------------------
    console.log("Test 5: Cross-hospital data isolation: HA 1 attempts to change HA 2's rate...");
    const crossTry = await patch(
      `/labs/hospital-tests/${hosp2OfferingId}/price`,
      { price: 1.0 },
      ha1Token
    );
    assert.strictEqual(crossTry.status, 403, "Cross-hospital modification must return 403");
    console.log("-> PASSED: Cross-hospital price modification blocked.");

    // ------------------------------------------------------------------------
    // Test 6: Super Admin can update price for any hospital
    // ------------------------------------------------------------------------
    console.log("Test 6: Super Admin updates price for Hospital 2...");
    const saUpdate = await patch(
      `/labs/hospital-tests/${hosp2OfferingId}/price`,
      { price: 599.99 },
      superAdminToken
    );
    assert.strictEqual(saUpdate.status, 200, "Super Admin price update failed");
    assert.strictEqual(saUpdate.body.data.price, 599.99);
    console.log("-> PASSED: Super Admin has system-wide pricing oversight.");

    // ------------------------------------------------------------------------
    // Test 7: Historical Price Snapshotting: Existing orders lock their creation-time price
    // ------------------------------------------------------------------------
    console.log("Test 7: Order Price Snapshotting & Historical Immutability...");
    // Current price at Hospital 1 is 425.50.
    // Create an order via POST /api/labs/orders
    const orderRes = await post(
      "/labs/orders",
      {
        patient_id: patientId,
        hospital_id: hospital1Id,
        master_test_id: masterTestId,
        priority: "urgent",
      },
      doctorToken
    );
    assert.strictEqual(orderRes.status, 201, "Order placement failed");
    const orderId = orderRes.body.data.id;
    assert.strictEqual(orderRes.body.data.price, 425.5, "Snapshot price in response should be 425.50");

    // Check DB directly
    const [orderInDb] = await pool.query(
      "SELECT id, price, status, payment_status FROM investigation_requests WHERE id = ?",
      [orderId]
    );
    assert.strictEqual(parseFloat(orderInDb[0].price), 425.5, "Snapshot price in database must match creation rate");

    // Now HA 1 changes the offering price to ₹800.00
    console.log("-> Updating hospital rate to ₹800.00...");
    const rateBump = await patch(
      `/labs/hospital-tests/${hosp1OfferingId}/price`,
      { price: 800.0 },
      ha1Token
    );
    assert.strictEqual(rateBump.status, 200);

    // Verify historical order still retains ₹425.50!
    const [orderAfterBump] = await pool.query(
      "SELECT id, price FROM investigation_requests WHERE id = ?",
      [orderId]
    );
    assert.strictEqual(
      parseFloat(orderAfterBump[0].price),
      425.5,
      "CRITICAL: Historical order price must NOT be changed by subsequent catalog rate changes!"
    );

    // Verify new orders take the new ₹800.00 rate
    const newOrderRes = await post(
      "/labs/orders",
      {
        patient_id: patientId,
        hospital_id: hospital1Id,
        master_test_id: masterTestId,
      },
      doctorToken
    );
    assert.strictEqual(newOrderRes.status, 201);
    assert.strictEqual(newOrderRes.body.data.price, 800.0, "New order must snapshot newly updated rate of ₹800.00");
    console.log("-> PASSED: Order price snapshotting is completely immutable and isolated from subsequent price adjustments.");

    // ------------------------------------------------------------------------
    // Test 8: Audit Logging verification
    // ------------------------------------------------------------------------
    console.log("Test 8: Verifying price changes are logged to audit_logs table...");
    const [auditRows] = await pool.query(
      `SELECT action, target_type, target_id, details
       FROM audit_logs
       WHERE action = 'UPDATE_LAB_TEST_PRICE' AND target_id = ?
       ORDER BY id DESC LIMIT 1`,
      [hosp1OfferingId]
    );
    assert.ok(auditRows.length > 0, "Audit log entry must exist for price change");
    const auditRecord = auditRows[0];
    const details = typeof auditRecord.details === "string"
      ? JSON.parse(auditRecord.details)
      : auditRecord.details;

    assert.strictEqual(details.previous_price, 425.5);
    assert.strictEqual(details.new_price, 800.0);
    console.log("-> PASSED: Audit trail records previous_price and new_price accurately.");

    console.log("\n==================================================================");
    console.log("=== ALL LESSON 11.3 TESTS PASSED PERFECTLY ===");
    console.log("==================================================================");
  } finally {
    // Cleanup fixtures
    await pool.query("DELETE FROM audit_logs WHERE action = 'UPDATE_LAB_TEST_PRICE' AND target_id IN (?, ?)", [
      hosp1OfferingId || 0,
      hosp2OfferingId || 0,
    ]).catch(() => {});
    await pool.query("DELETE FROM investigation_requests WHERE hospital_id IN (?, ?)", [
      hospital1Id,
      hospital2Id,
    ]).catch(() => {});
    await pool.query("DELETE FROM hospital_lab_tests WHERE hospital_id IN (?, ?)", [
      hospital1Id,
      hospital2Id,
    ]).catch(() => {});
    await pool.query("DELETE FROM master_lab_tests WHERE id = ?", [masterTestId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)", [
      saId,
      ha1Id,
      ha2Id,
      docId,
      staffId,
      patientId,
    ]).catch(() => {});
    await pool.query("DELETE FROM hospitals WHERE id IN (?, ?)", [
      hospital1Id,
      hospital2Id,
    ]).catch(() => {});

    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
