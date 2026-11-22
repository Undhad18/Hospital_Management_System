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

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "DELETE",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.1 Master Lab Test Management Test Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Create Super Admin user
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin Test', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_lab_${stamp}@m11.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Create Hospital Admin user
  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Lab Test Hosp ${stamp}`, `LTH-${stamp}`, `hosp_${stamp}@m11.com`]
  );
  const hospitalId = hospRes.insertId;

  const [haRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin Test', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospitalId, `ha_lab_${stamp}@m11.com`, passwordHash]
  );
  const tokenHospitalAdmin = jwt.sign(
    { sub: haRes.insertId, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Create Doctor user
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Doctor Lab Test', ?, ?, 'active')`,
    [roleMap["doctor"], hospitalId, `doc_lab_${stamp}@m11.com`, passwordHash]
  );
  const tokenDoctor = jwt.sign(
    { sub: docRes.insertId, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated request rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Reject unauthenticated access to master tests catalog");
    const unauthGet = await get("/labs/master-tests");
    assert.strictEqual(unauthGet.status, 401, "Expected 401 for unauthenticated GET");
    console.log("✓ PASS: Unauthenticated access rejected with 401");

    // -------------------------------------------------------------
    // Test 2: Role Authorization: Non-super_admin cannot create master tests
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Hospital Admin and Doctor forbidden from creating master tests (Super Admin only)");
    const haCreate = await post(
      "/labs/master-tests",
      {
        test_code: `UNAUTH-${stamp}`,
        test_name: `Unauthorized Test ${stamp}`,
        category: "Biochemistry",
      },
      tokenHospitalAdmin
    );
    assert.strictEqual(haCreate.status, 403, "Expected 403 for Hospital Admin creating master test");

    const docCreate = await post(
      "/labs/master-tests",
      {
        test_code: `DOC-${stamp}`,
        test_name: `Doctor Test ${stamp}`,
        category: "Biochemistry",
      },
      tokenDoctor
    );
    assert.strictEqual(docCreate.status, 403, "Expected 403 for Doctor creating master test");
    console.log("✓ PASS: Non-super_admin roles correctly rejected with 403");

    // -------------------------------------------------------------
    // Test 3: Input validation: Required fields check
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Validate required fields on master test creation");
    const missingName = await post(
      "/labs/master-tests",
      { test_code: `TEST-${stamp}`, category: "Hematology" },
      tokenSuperAdmin
    );
    assert.strictEqual(missingName.status, 400, "Expected 400 when test_name is missing");

    const missingCode = await post(
      "/labs/master-tests",
      { test_name: `Valid Name ${stamp}`, category: "Hematology" },
      tokenSuperAdmin
    );
    assert.strictEqual(missingCode.status, 400, "Expected 400 when test_code is missing");

    const missingCat = await post(
      "/labs/master-tests",
      { test_code: `CODE-${stamp}`, test_name: `Valid Name ${stamp}` },
      tokenSuperAdmin
    );
    assert.strictEqual(missingCat.status, 400, "Expected 400 when category is missing");
    console.log("✓ PASS: Missing required fields properly rejected with 400");

    // -------------------------------------------------------------
    // Test 4: Super Admin successfully creates a new master test
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Super Admin creates a valid master lab test");
    const validTestPayload = {
      test_code: `LAB-GLUCOSE-${stamp}`,
      test_name: `Serum Fasting Glucose Panel ${stamp}`,
      category: "Biochemistry",
      sample_type: "Sodium Fluoride Plasma",
      standard_turnaround_hours: 4,
      description: "Quantitative measurement of fasting blood glucose concentration.",
      instructions: "Patient must maintain minimum 8-10 hours overnight fasting prior to sample draw.",
      status: "active",
    };

    const createRes = await post("/labs/master-tests", validTestPayload, tokenSuperAdmin);
    assert.strictEqual(createRes.status, 201, "Expected 201 Created for valid test");
    assert.strictEqual(createRes.body.success, true);
    assert.strictEqual(createRes.body.data.test_code, validTestPayload.test_code);
    assert.strictEqual(createRes.body.data.test_name, validTestPayload.test_name);
    assert.strictEqual(createRes.body.data.category, "Biochemistry");
    assert.strictEqual(createRes.body.data.status, "active");
    const createdTestId = createRes.body.data.id;
    console.log(`✓ PASS: Master lab test created successfully with ID #${createdTestId}`);

    // -------------------------------------------------------------
    // Test 5: Duplicate Prevention: Duplicate test code rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Prevent duplicate master test_code");
    const dupCodeRes = await post(
      "/labs/master-tests",
      {
        test_code: `LAB-GLUCOSE-${stamp}`, // Identical code
        test_name: `Different Name ${stamp}`,
        category: "Biochemistry",
      },
      tokenSuperAdmin
    );
    assert.strictEqual(dupCodeRes.status, 409, "Expected 409 Conflict for duplicate test_code");
    assert.strictEqual(dupCodeRes.body.success, false);
    console.log("✓ PASS: Duplicate test_code rejected with 409 Conflict");

    // -------------------------------------------------------------
    // Test 6: Duplicate Prevention: Duplicate test name rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Prevent duplicate master test_name");
    const dupNameRes = await post(
      "/labs/master-tests",
      {
        test_code: `DIFF-CODE-${stamp}`,
        test_name: `Serum Fasting Glucose Panel ${stamp}`, // Identical name
        category: "Biochemistry",
      },
      tokenSuperAdmin
    );
    assert.strictEqual(dupNameRes.status, 409, "Expected 409 Conflict for duplicate test_name");
    assert.strictEqual(dupNameRes.body.success, false);
    console.log("✓ PASS: Duplicate test_name rejected with 409 Conflict");

    // -------------------------------------------------------------
    // Test 7: Super Admin updates master test
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Super Admin updates master lab test details");
    const updatePayload = {
      test_code: `LAB-GLUCOSE-MOD-${stamp}`,
      test_name: `Serum Fasting Glucose Panel (Extended) ${stamp}`,
      category: "Biochemistry",
      sample_type: "Sodium Fluoride Plasma",
      standard_turnaround_hours: 6,
      description: "Updated description with extended clinical notes.",
      instructions: "10 hours fasting required.",
      status: "active",
    };

    const updateRes = await put(`/labs/master-tests/${createdTestId}`, updatePayload, tokenSuperAdmin);
    assert.strictEqual(updateRes.status, 200, "Expected 200 OK for master test update");
    assert.strictEqual(updateRes.body.data.test_code, updatePayload.test_code);
    assert.strictEqual(updateRes.body.data.test_name, updatePayload.test_name);
    assert.strictEqual(updateRes.body.data.standard_turnaround_hours, 6);
    console.log("✓ PASS: Master lab test updated successfully");

    // -------------------------------------------------------------
    // Test 8: Status Toggle (Deactivation and Activation)
    // -------------------------------------------------------------
    console.log("\n[TEST 8] Toggle master test status between active and inactive");
    const deactRes = await patch(`/labs/master-tests/${createdTestId}/status`, { status: "inactive" }, tokenSuperAdmin);
    assert.strictEqual(deactRes.status, 200);
    assert.strictEqual(deactRes.body.data.status, "inactive");

    // Verify non-super-admin does not see inactive test by default
    const docGet = await get(`/labs/master-tests?search=${encodeURIComponent(updatePayload.test_name)}`, tokenDoctor);
    assert.strictEqual(docGet.status, 200);
    const foundDoc = docGet.body.data.find((t) => t.id === createdTestId);
    assert.strictEqual(foundDoc, undefined, "Inactive test should not appear to doctor by default");

    // Reactivate
    const reactRes = await patch(`/labs/master-tests/${createdTestId}/status`, { status: "active" }, tokenSuperAdmin);
    assert.strictEqual(reactRes.status, 200);
    assert.strictEqual(reactRes.body.data.status, "active");
    console.log("✓ PASS: Status toggle behaves correctly and respects role filtering");

    // -------------------------------------------------------------
    // Test 9: Search and Filtering
    // -------------------------------------------------------------
    console.log("\n[TEST 9] Search and filter master laboratory test catalog");
    const searchRes = await get(`/labs/master-tests?q=GLUCOSE-MOD-${stamp}`, tokenSuperAdmin);
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.body.data.length >= 1, true);
    assert.strictEqual(searchRes.body.data[0].id, createdTestId);
    console.log("✓ PASS: Search and filtering returned expected records");

    // -------------------------------------------------------------
    // Test 10: Safe deletion: unreferenced test can be deleted
    // -------------------------------------------------------------
    console.log("\n[TEST 10] Deletion of unreferenced master test");
    const delRes = await del(`/labs/master-tests/${createdTestId}`, tokenSuperAdmin);
    assert.strictEqual(delRes.status, 200, "Expected 200 for unreferenced test deletion");
    assert.strictEqual(delRes.body.success, true);

    const verifyDel = await get(`/labs/master-tests/${createdTestId}`, tokenSuperAdmin);
    assert.strictEqual(verifyDel.status, 404, "Deleted test should now return 404");
    console.log("✓ PASS: Unreferenced master test deleted cleanly");

    // -------------------------------------------------------------
    // Test 11: Referenced test deletion rejection
    // -------------------------------------------------------------
    console.log("\n[TEST 11] Prevent deletion of test referenced by hospital offering or clinical orders");
    // Create test
    const refTestRes = await post(
      "/labs/master-tests",
      {
        test_code: `REF-TEST-${stamp}`,
        test_name: `Referenced Lipid Test ${stamp}`,
        category: "Biochemistry",
      },
      tokenSuperAdmin
    );
    const refTestId = refTestRes.body.data.id;

    // Simulate hospital offering assignment in database
    await pool.query(
      `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
       VALUES (?, ?, 350.00, 'active')`,
      [hospitalId, refTestId]
    );

    // Attempt deletion
    const blockedDel = await del(`/labs/master-tests/${refTestId}`, tokenSuperAdmin);
    assert.strictEqual(blockedDel.status, 409, "Expected 409 Conflict when deleting referenced test");
    console.log("✓ PASS: Deletion of referenced test strictly rejected with 409 Conflict");

    console.log("\n==================================================================");
    console.log("=== ALL LESSON 11.1 TESTS PASSED SUCCESSFULLY! ===");
    console.log("==================================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
}

runTests();
