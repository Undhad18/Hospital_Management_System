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
  console.log("=== Running Lesson 11.6 Pending Laboratory Test Management Suite =");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Hospital 1 and Hospital 2
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Alpha General Hospital ${stamp}`, `AGH1-${stamp}`, `agh1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Beta Regional Medical ${stamp}`, `BRM2-${stamp}`, `brm2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  // Departments
  const [dept1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Pathology & Diagnostics', 'active')`,
    [hospital1Id]
  );
  const dept1Id = dept1Res.insertId;

  const [dept2Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Laboratory Medicine', 'active')`,
    [hospital2Id]
  );
  const dept2Id = dept2Res.insertId;

  // 2. Users
  // Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["super_admin"], `Super Admin ${stamp}`, `sa_${stamp}@m11.com`, passwordHash]
  );
  const saId = saRes.insertId;

  // Doctor 1 (Hospital 1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, dept1Id, `Dr. Gregory House ${stamp}`, `doc1_${stamp}@m11.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;

  // Staff 1 (Hospital 1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Staff Alice ${stamp}`, `staff1_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;

  // Staff 2 (Hospital 2)
  const [staff2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital2Id, `Staff Bob ${stamp}`, `staff2_${stamp}@m11.com`, passwordHash]
  );
  const staff2Id = staff2Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `John Doe ${stamp}`, `pat1_${stamp}@m11.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;

  function makeToken(id, role, hospId = null) {
    return jwt.sign(
      {
        sub: id,
        id,
        role,
        hospitalId: hospId,
        tokenVersion: 1,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
  }

  const saToken = makeToken(saId, "super_admin", null);
  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);
  const staff2Token = makeToken(staff2Id, "staff", hospital2Id);
  const doc1Token = makeToken(doc1Id, "doctor", hospital1Id);
  const pat1Token = makeToken(patient1Id, "patient", null);

  // 3. Master Laboratory Tests Fixtures
  const [mt1Res] = await pool.execute(
    `INSERT INTO master_lab_tests
     (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Serum Electrolytes Profile', 'Biochemistry', 'Serum', 4, 'active')`,
    [`TEST-ELEC-${stamp}`]
  );
  const masterTest1Id = mt1Res.insertId;

  const [mt2Res] = await pool.execute(
    `INSERT INTO master_lab_tests
     (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Complete Blood Count Plus', 'Hematology', 'Whole Blood', 2, 'active')`,
    [`TEST-CBC-${stamp}`]
  );
  const masterTest2Id = mt2Res.insertId;

  // 4. Create Initial Investigation Requests (Orders) for Hospital 1
  // Order 1: Routine Requested
  const orderNum1 = `LAB-TEST1-${stamp}`;
  const [o1Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status)
     VALUES (?, ?, ?, ?, ?, 'Serum Electrolytes Profile', 'Biochemistry', 'routine', 45.00, 'requested')`,
    [orderNum1, patient1Id, doc1Id, hospital1Id, masterTest1Id]
  );
  const order1Id = o1Res.insertId;

  // Order 2: STAT Requested (urgent)
  const orderNum2 = `LAB-TEST2-${stamp}`;
  const [o2Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status)
     VALUES (?, ?, ?, ?, ?, 'Complete Blood Count Plus', 'Hematology', 'stat', 65.00, 'requested')`,
    [orderNum2, patient1Id, doc1Id, hospital1Id, masterTest2Id]
  );
  const order2Id = o2Res.insertId;

  // Order 3: Already Completed
  const orderNum3 = `LAB-TEST3-${stamp}`;
  const [o3Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status, sample_collected_at, completed_at)
     VALUES (?, ?, ?, ?, ?, 'Serum Electrolytes Profile', 'Biochemistry', 'urgent', 45.00, 'completed', NOW(), NOW())`,
    [orderNum3, patient1Id, doc1Id, hospital1Id, masterTest1Id]
  );
  const order3Id = o3Res.insertId;

  let passed = 0;
  let total = 0;

  function runCase(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ Case ${total}: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ Case ${total}: ${desc}`);
      console.error(`    ${err.message}`);
    }
  }

  // --- Test 1: Fetch Pending Orders Queue (Default Pending Filter) ---
  const q1 = await get("/labs/orders", staff1Token);
  runCase("GET /api/labs/orders returns active pending queue (excluding completed by default)", () => {
    assert.strictEqual(q1.status, 200, "Should return HTTP 200");
    assert.strictEqual(q1.body.success, true, "Should succeed");
    assert.ok(Array.isArray(q1.body.data), "Should return data array");
    const foundOrder1 = q1.body.data.find((o) => o.id === order1Id);
    const foundOrder2 = q1.body.data.find((o) => o.id === order2Id);
    const foundOrder3 = q1.body.data.find((o) => o.id === order3Id);

    assert.ok(foundOrder1, "Order 1 (requested) must be present in pending queue");
    assert.ok(foundOrder2, "Order 2 (stat requested) must be present in pending queue");
    assert.strictEqual(foundOrder3, undefined, "Order 3 (completed) must NOT be present in pending queue");
  });

  // --- Test 2: Status Counters in Pending Queue ---
  runCase("Summary metrics (counts) accurately aggregate order states for hospital scope", () => {
    const counts = q1.body.counts;
    assert.ok(counts, "Counts object must be present in response");
    assert.ok(counts.total >= 3, "Total counts must reflect all hospital orders");
    assert.ok(counts.pending >= 2, "Pending count must include requested orders");
    assert.ok(counts.requested >= 2, "Requested count must be at least 2");
    assert.ok(counts.completed >= 1, "Completed count must be at least 1");
    assert.ok(counts.urgent_stat_count >= 1, "Urgent/STAT count must be at least 1");
  });

  // --- Test 3: Status Filter 'all' ---
  const qAll = await get("/labs/orders?status=all", staff1Token);
  runCase("GET /api/labs/orders?status=all returns all orders including completed", () => {
    assert.strictEqual(qAll.status, 200);
    const foundOrder3 = qAll.body.data.find((o) => o.id === order3Id);
    assert.ok(foundOrder3, "Order 3 (completed) must be present when status=all");
    assert.strictEqual(foundOrder3.status, "completed");
  });

  // --- Test 4: Priority & Search Filtering ---
  const qStat = await get("/labs/orders?priority=stat", staff1Token);
  runCase("GET /api/labs/orders?priority=stat filters strictly by STAT priority", () => {
    assert.strictEqual(qStat.status, 200);
    assert.ok(qStat.body.data.length >= 1);
    const allStat = qStat.body.data.every((o) => o.priority === "stat");
    assert.ok(allStat, "All returned items must have priority = 'stat'");
  });

  const qSearch = await get(`/labs/orders?q=${encodeURIComponent(orderNum1)}`, staff1Token);
  runCase("GET /api/labs/orders?q=... performs search by order number", () => {
    assert.strictEqual(qSearch.status, 200);
    assert.strictEqual(qSearch.body.data.length, 1);
    assert.strictEqual(qSearch.body.data[0].order_number, orderNum1);
  });

  // --- Test 5: Lifecycle Transition: requested -> sample_collected ---
  const tr1 = await patch(`/labs/orders/${order1Id}/status`, { status: "sample_collected" }, staff1Token);
  runCase("Transition 'requested' -> 'sample_collected' succeeds and sets sample_collected_at", () => {
    assert.strictEqual(tr1.status, 200);
    assert.strictEqual(tr1.body.success, true);
    assert.strictEqual(tr1.body.data.status, "sample_collected");
    assert.ok(tr1.body.data.sample_collected_at, "sample_collected_at timestamp must be set");
  });

  // --- Test 6: Lifecycle Transition: sample_collected -> in_progress ---
  const tr2 = await patch(`/labs/orders/${order1Id}/status`, { status: "in_progress" }, staff1Token);
  runCase("Transition 'sample_collected' -> 'in_progress' succeeds", () => {
    assert.strictEqual(tr2.status, 200);
    assert.strictEqual(tr2.body.success, true);
    assert.strictEqual(tr2.body.data.status, "in_progress");
  });

  // --- Test 7: Lifecycle Transition: in_progress -> completed ---
  const tr3 = await patch(`/labs/orders/${order1Id}/status`, { status: "completed" }, staff1Token);
  runCase("Transition 'in_progress' -> 'completed' succeeds and sets completed_at", () => {
    assert.strictEqual(tr3.status, 200);
    assert.strictEqual(tr3.body.success, true);
    assert.strictEqual(tr3.body.data.status, "completed");
    assert.ok(tr3.body.data.completed_at, "completed_at timestamp must be set");
  });

  // --- Test 8: Terminal State Immutability: completed order cannot be transitioned ---
  const trTerminal = await patch(`/labs/orders/${order1Id}/status`, { status: "in_progress" }, staff1Token);
  runCase("Modifying completed order fails with HTTP 400 terminal state guard", () => {
    assert.strictEqual(trTerminal.status, 400);
    assert.strictEqual(trTerminal.body.success, false);
    assert.ok(
      trTerminal.body.message.toLowerCase().includes("terminal state immutable") ||
      trTerminal.body.message.toLowerCase().includes("cannot be modified"),
      `Expected terminal state guard message, got: ${trTerminal.body.message}`
    );
  });

  // --- Test 9: Cancellation Requires Mandatory Reason ---
  const trCancelNoReason = await patch(`/labs/orders/${order2Id}/status`, { status: "cancelled" }, staff1Token);
  runCase("Cancelling order without cancellation_reason fails with HTTP 400", () => {
    assert.strictEqual(trCancelNoReason.status, 400);
    assert.strictEqual(trCancelNoReason.body.success, false);
    assert.ok(
      trCancelNoReason.body.message.toLowerCase().includes("cancellation_reason is required"),
      `Expected cancellation reason error message, got: ${trCancelNoReason.body.message}`
    );
  });

  // --- Test 10: Successful Cancellation With Reason & Immutability ---
  const trCancelOk = await patch(
    `/labs/orders/${order2Id}/status`,
    { status: "cancelled", cancellation_reason: "Patient fasting requirement not met; reschedule ordered." },
    staff1Token
  );
  runCase("Cancelling order with valid reason succeeds, sets cancelled_at and reason", () => {
    assert.strictEqual(trCancelOk.status, 200);
    assert.strictEqual(trCancelOk.body.success, true);
    assert.strictEqual(trCancelOk.body.data.status, "cancelled");
    assert.ok(trCancelOk.body.data.cancelled_at, "cancelled_at must be populated");
    assert.strictEqual(
      trCancelOk.body.data.cancellation_reason,
      "Patient fasting requirement not met; reschedule ordered."
    );
  });

  const trCancelReopen = await patch(`/labs/orders/${order2Id}/status`, { status: "requested" }, staff1Token);
  runCase("Modifying cancelled order fails with HTTP 400 terminal state guard", () => {
    assert.strictEqual(trCancelReopen.status, 400);
    assert.strictEqual(trCancelReopen.body.success, false);
    assert.ok(
      trCancelReopen.body.message.toLowerCase().includes("terminal state immutable") ||
      trCancelReopen.body.message.toLowerCase().includes("cannot be modified")
    );
  });

  // --- Test 11: Invalid State Skip (requested -> completed directly) ---
  const [o4Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status)
     VALUES (?, ?, ?, ?, ?, 'Complete Blood Count Plus', 'Hematology', 'routine', 65.00, 'requested')`,
    [`LAB-TEST4-${stamp}`, patient1Id, doc1Id, hospital1Id, masterTest2Id]
  );
  const order4Id = o4Res.insertId;

  const trSkip = await patch(`/labs/orders/${order4Id}/status`, { status: "completed" }, staff1Token);
  runCase("Invalid state skip from 'requested' directly to 'completed' fails with HTTP 400", () => {
    assert.strictEqual(trSkip.status, 400);
    assert.strictEqual(trSkip.body.success, false);
    assert.ok(
      trSkip.body.message.toLowerCase().includes("invalid state transition"),
      `Expected invalid state transition error, got: ${trSkip.body.message}`
    );
  });

  // --- Test 12: Hospital Data Isolation and Protection ---
  const trCrossHospital = await patch(
    `/labs/orders/${order4Id}/status`,
    { status: "sample_collected" },
    staff2Token // Staff from Hospital 2 attempting to modify Hospital 1's order
  );
  runCase("Staff from another hospital facility cannot modify order (HTTP 403 Forbidden)", () => {
    assert.strictEqual(trCrossHospital.status, 403);
    assert.strictEqual(trCrossHospital.body.success, false);
    assert.ok(trCrossHospital.body.message.toLowerCase().includes("access denied"));
  });

  // --- Test 13: Audit Logging Verification ---
  const [auditRows] = await pool.query(
    `SELECT target_id, action, details
     FROM audit_logs
     WHERE target_id = ? AND action = 'UPDATE_LAB_ORDER_STATUS'
     ORDER BY id DESC`,
    [order1Id]
  );
  runCase("Audit trail is reliably recorded in audit_logs table for status transitions", () => {
    assert.ok(auditRows.length >= 1, "Must have recorded status transitions in audit log");
    const latestAudit = typeof auditRows[0].details === "string" ? JSON.parse(auditRows[0].details) : auditRows[0].details;
    assert.strictEqual(latestAudit.new_status, "completed");
  });

  console.log("\n==================================================================");
  console.log(`=== Tests Complete: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%) ===`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests()
  .then(() => {
    pool.end();
  })
  .catch((err) => {
    console.error("Test execution failed with unhandled exception:", err);
    pool.end();
    process.exit(1);
  });
