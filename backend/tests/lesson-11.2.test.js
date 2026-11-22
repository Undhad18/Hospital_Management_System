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

async function del(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "DELETE",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.2 Hospital Laboratory Tests Test Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Two Active Hospitals + One Inactive Hospital
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`City Hospital Alpha ${stamp}`, `CHA-${stamp}`, `h1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Metro Hospital Beta ${stamp}`, `MHB-${stamp}`, `h2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  const [h3Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'inactive')`,
    [`Inactive Hospital Gamma ${stamp}`, `IHG-${stamp}`, `h3_${stamp}@m11.com`]
  );
  const hospital3Id = h3Res.insertId;

  // 2. Users: Super Admin, Hospital Admin 1, Hospital Admin 2, Doctor 1
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin 11.2', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_${stamp}@m11.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'HA Alpha', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_${stamp}@m11.com`, passwordHash]
  );
  const tokenHA1 = jwt.sign(
    { sub: ha1Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'HA Beta', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_${stamp}@m11.com`, passwordHash]
  );
  const tokenHA2 = jwt.sign(
    { sub: ha2Res.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Dr. Alpha Physician', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `doc1_${stamp}@m11.com`, passwordHash]
  );
  const tokenDoc1 = jwt.sign(
    { sub: doc1Res.insertId, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Create Master Tests for testing assignment
  const [m1Res] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, ?, 'Biochemistry', 'Serum', 6, 'active')`,
    [`M11-CBC-${stamp}`, `Master Test 1 ${stamp}`]
  );
  const masterTest1Id = m1Res.insertId;

  const [m2Res] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, ?, 'Cardiology Diagnostics', 'ECG Trace', 1, 'active')`,
    [`M11-ECG-${stamp}`, `Master Test 2 ${stamp}`]
  );
  const masterTest2Id = m2Res.insertId;

  // Inactive Master Test
  const [mInactiveRes] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, ?, 'Hematology', 'Whole Blood', 12, 'inactive')`,
    [`M11-INACT-${stamp}`, `Master Test Inactive ${stamp}`]
  );
  const masterInactiveId = mInactiveRes.insertId;

  try {
    // -------------------------------------------------------------
    // Test 1: Fetch Unassigned Master Tests for Hospital 1
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Fetch available unassigned master tests for Hospital 1");
    const unassignedRes = await get("/labs/hospital-tests/unassigned", tokenHA1);
    assert.strictEqual(unassignedRes.status, 200, "Expected 200 OK for unassigned master tests");
    assert.strictEqual(unassignedRes.body.success, true);
    const hasM1 = unassignedRes.body.data.some((t) => t.id === masterTest1Id);
    const hasM2 = unassignedRes.body.data.some((t) => t.id === masterTest2Id);
    const hasInactive = unassignedRes.body.data.some((t) => t.id === masterInactiveId);
    assert.strictEqual(hasM1, true, "Master Test 1 should be available for assignment");
    assert.strictEqual(hasM2, true, "Master Test 2 should be available for assignment");
    assert.strictEqual(hasInactive, false, "Inactive Master Test must not be listed for assignment");
    console.log("✓ PASS: Unassigned active master tests listed correctly");

    // -------------------------------------------------------------
    // Test 2: Hospital Admin 1 assigns master tests to Hospital 1
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Hospital Admin 1 assigns Master Test 1 to Hospital 1");
    const assignRes = await post(
      "/labs/hospital-tests",
      {
        master_test_id: masterTest1Id,
        price: 320.50,
        status: "active",
      },
      tokenHA1
    );
    assert.strictEqual(assignRes.status, 201, "Expected 201 Created for test assignment");
    assert.strictEqual(assignRes.body.success, true);
    assert.strictEqual(assignRes.body.data[0].master_test_id, masterTest1Id);
    assert.strictEqual(assignRes.body.data[0].hospital_id, hospital1Id);
    assert.strictEqual(assignRes.body.data[0].price, 320.50);
    const hospitalTest1Id = assignRes.body.data[0].id;
    console.log(`✓ PASS: Test assigned successfully to Hospital 1 with ID #${hospitalTest1Id}`);

    // -------------------------------------------------------------
    // Test 3: Duplicate Assignment Prevention
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Prevent duplicate assignment of the same test to the same hospital");
    const dupAssign = await post(
      "/labs/hospital-tests",
      {
        master_test_id: masterTest1Id,
        price: 400.00,
      },
      tokenHA1
    );
    assert.strictEqual(dupAssign.status, 409, "Expected 409 Conflict for duplicate test assignment");
    assert.strictEqual(dupAssign.body.success, false);
    console.log("✓ PASS: Duplicate assignment to same hospital rejected with 409 Conflict");

    // -------------------------------------------------------------
    // Test 4: Hospital Data Isolation - Hospital Admin 1 cannot assign to Hospital 2
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Enforce hospital isolation: HA 1 cannot assign tests to Hospital 2");
    const crossAssign = await post(
      "/labs/hospital-tests",
      {
        hospital_id: hospital2Id, // Attempting to target Hospital 2
        master_test_id: masterTest2Id,
      },
      tokenHA1
    );
    assert.strictEqual(crossAssign.status, 403, "Expected 403 Forbidden for cross-hospital assignment");
    console.log("✓ PASS: Cross-hospital assignment attempt strictly blocked with 403");

    // -------------------------------------------------------------
    // Test 5: Hospital Admin 1 cannot view Hospital 2 test offerings
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Enforce hospital isolation: HA 1 cannot view Hospital 2 offerings");
    const crossView = await get(`/labs/hospital-tests?hospital_id=${hospital2Id}`, tokenHA1);
    assert.strictEqual(crossView.status, 403, "Expected 403 Forbidden for cross-hospital view attempt");
    console.log("✓ PASS: Cross-hospital view attempt strictly blocked with 403");

    // -------------------------------------------------------------
    // Test 6: Inactive Hospital rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Reject assignment to an inactive hospital facility");
    const inactiveHospAssign = await post(
      "/labs/hospital-tests",
      {
        hospital_id: hospital3Id,
        master_test_id: masterTest1Id,
      },
      tokenSuperAdmin
    );
    assert.strictEqual(inactiveHospAssign.status, 400, "Expected 400 when assigning to inactive hospital");
    console.log("✓ PASS: Assignment to inactive hospital rejected with 400 Bad Request");

    // -------------------------------------------------------------
    // Test 7: Inactive Master Test rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Reject assignment of an inactive master test");
    const inactiveMasterAssign = await post(
      "/labs/hospital-tests",
      {
        master_test_id: masterInactiveId,
      },
      tokenHA1
    );
    assert.strictEqual(inactiveMasterAssign.status, 400, "Expected 400 when assigning inactive master test");
    console.log("✓ PASS: Inactive master test assignment rejected with 400 Bad Request");

    // -------------------------------------------------------------
    // Test 8: Activate / Deactivate Hospital Offering
    // -------------------------------------------------------------
    console.log("\n[TEST 8] Toggle offering status (Active -> Inactive -> Active)");
    const deactRes = await patch(`/labs/hospital-tests/${hospitalTest1Id}/status`, { status: "inactive" }, tokenHA1);
    assert.strictEqual(deactRes.status, 200);
    assert.strictEqual(deactRes.body.data.status, "inactive");

    // Doctor at Hospital 1 should NOT see inactive offerings during consultation/queue
    const docList = await get("/labs/hospital-tests", tokenDoc1);
    assert.strictEqual(docList.status, 200);
    const docSeesTest = docList.body.data.some((t) => t.id === hospitalTest1Id);
    assert.strictEqual(docSeesTest, false, "Doctor must not see inactive hospital offerings");

    // Re-activate
    const reactRes = await patch(`/labs/hospital-tests/${hospitalTest1Id}/status`, { status: "active" }, tokenHA1);
    assert.strictEqual(reactRes.status, 200);
    assert.strictEqual(reactRes.body.data.status, "active");
    console.log("✓ PASS: Status toggling functions properly and hides inactive offerings from doctors");

    // -------------------------------------------------------------
    // Test 9: Cross-hospital status modification blocked
    // -------------------------------------------------------------
    console.log("\n[TEST 9] Hospital Admin 2 cannot modify Hospital 1's test offering status");
    const crossStatusMod = await patch(`/labs/hospital-tests/${hospitalTest1Id}/status`, { status: "inactive" }, tokenHA2);
    assert.strictEqual(crossStatusMod.status, 403, "Expected 403 Forbidden for cross-hospital status update");
    console.log("✓ PASS: Cross-hospital status modification blocked with 403");

    // -------------------------------------------------------------
    // Test 10: Preserving Historical Orders & Blocking Dangerous Deletion
    // -------------------------------------------------------------
    console.log("\n[TEST 10] Deactivating a test preserves historical patient orders");
    // Create patient and clinical order referencing this test
    const [patRes] = await pool.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Patient 11.2', ?, ?, 'active')`,
      [roleMap["patient"], `pat_${stamp}@m11.com`, passwordHash]
    );
    const patientId = patRes.insertId;

    const [orderRes] = await pool.execute(
      `INSERT INTO investigation_requests
         (hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, price, status)
       VALUES (?, ?, ?, ?, 'Master Test 1 ${stamp}', 'Biochemistry', 320.50, 'requested')`,
      [hospital1Id, patientId, doc1Res.insertId, masterTest1Id]
    );
    const orderId = orderRes.insertId;

    // Deactivate the hospital offering
    await patch(`/labs/hospital-tests/${hospitalTest1Id}/status`, { status: "inactive" }, tokenHA1);

    // Verify patient order is completely intact
    const [persistedOrder] = await pool.query(
      "SELECT id, status, price FROM investigation_requests WHERE id = ?",
      [orderId]
    );
    assert.strictEqual(persistedOrder.length, 1);
    assert.strictEqual(persistedOrder[0].status, "requested");
    assert.strictEqual(parseFloat(persistedOrder[0].price), 320.50);
    console.log("✓ Historical patient order safely preserved after offering deactivation");

    // Attempting DELETE on this assigned test must be rejected because historical orders exist!
    console.log("\n[TEST 11] Reject deletion of test offering with existing patient orders");
    const blockedDelete = await del(`/labs/hospital-tests/${hospitalTest1Id}`, tokenHA1);
    assert.strictEqual(blockedDelete.status, 409, "Expected 409 Conflict when deleting offering with orders");
    console.log("✓ PASS: Deletion of test offering with historical orders blocked with 409 Conflict");

    // -------------------------------------------------------------
    // Test 12: Assign second test and safely remove it when unreferenced
    // -------------------------------------------------------------
    console.log("\n[TEST 12] Safely remove unreferenced test offering from hospital catalog");
    const assign2 = await post(
      "/labs/hospital-tests",
      {
        master_test_id: masterTest2Id,
        price: 150.00,
      },
      tokenHA1
    );
    const hospitalTest2Id = assign2.body.data[0].id;

    const delRes = await del(`/labs/hospital-tests/${hospitalTest2Id}`, tokenHA1);
    assert.strictEqual(delRes.status, 200, "Unreferenced test offering can be removed");
    console.log("✓ PASS: Unreferenced test offering successfully removed from hospital catalog");

    console.log("\n==================================================================");
    console.log("=== ALL LESSON 11.2 TESTS PASSED SUCCESSFULLY! ===");
    console.log("==================================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
}

runTests();
