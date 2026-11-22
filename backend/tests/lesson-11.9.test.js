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

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.9 Laboratory Payment Management Tests ======");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Hospitals
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Metro Lab Hospital ${stamp}`, `MLH1-${stamp}`, `mlh1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`City Diagnostic Hospital ${stamp}`, `CDH2-${stamp}`, `cdh2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

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

  // Staff 1 (H1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Lab Staff ${stamp}`, `staff1_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;
  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);

  // Admin 1 (H1)
  const [admin1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `H1 Admin ${stamp}`, `admin1_${stamp}@m11.com`, passwordHash]
  );
  const admin1Id = admin1Res.insertId;
  const admin1Token = makeToken(admin1Id, "hospital_admin", hospital1Id);

  // Staff 2 (H2 - Isolation check)
  const [staff2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital2Id, `H2 Staff ${stamp}`, `staff2_${stamp}@m11.com`, passwordHash]
  );
  const staff2Id = staff2Res.insertId;
  const staff2Token = makeToken(staff2Id, "staff", hospital2Id);

  // Patient 1 (H1)
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `Patient One ${stamp}`, `pat1_${stamp}@m11.com`, passwordHash]
  );
  const pat1Id = pat1Res.insertId;
  const pat1Token = makeToken(pat1Id, "patient", hospital1Id);

  // Patient 2 (H2)
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], hospital2Id, `Patient Two ${stamp}`, `pat2_${stamp}@m11.com`, passwordHash]
  );
  const pat2Id = pat2Res.insertId;
  const pat2Token = makeToken(pat2Id, "patient", hospital2Id);

  // Doctor 1 (H1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `Dr. Fleming ${stamp}`, `doc1_${stamp}@m11.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;

  // Master Test
  const [masterTestRes] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, ?, 'Biochemistry', 'Serum', 4, 'active')`,
    [`TEST-PAY-${stamp}`, `Lipid Profile Plus ${stamp}`]
  );
  const masterTestId = masterTestRes.insertId;

  // Hospital Test
  const [hTestRes] = await pool.execute(
    `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
     VALUES (?, ?, 850.00, 'active')`,
    [hospital1Id, masterTestId]
  );
  const hospitalTestId = hTestRes.insertId;

  // 3. Create Test Orders in investigation_requests
  // Order 1: Routine order, price 850.00, unpaid
  const [o1Res] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Biochemistry', 'routine', 850.00, 'unpaid', 'requested')`,
    [`ORD-PAY1-${stamp}`, pat1Id, doc1Id, hospital1Id, masterTestId, `Lipid Profile Plus ${stamp}`]
  );
  const order1Id = o1Res.insertId;

  // Order 2: Routine order, price 1200.00, unpaid (for waiver test)
  const [o2Res] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Biochemistry', 'urgent', 1200.00, 'unpaid', 'requested')`,
    [`ORD-PAY2-${stamp}`, pat1Id, doc1Id, hospital1Id, masterTestId, `Urgent Thyroid Panel ${stamp}`]
  );
  const order2Id = o2Res.insertId;

  // Order 3: Cancelled order (to test payment prevention on cancelled orders)
  const [o3Res] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status, cancellation_reason)
     VALUES (?, ?, ?, ?, ?, ?, 'Biochemistry', 'routine', 500.00, 'unpaid', 'cancelled', 'Sample corrupted')`,
    [`ORD-PAY3-${stamp}`, pat1Id, doc1Id, hospital1Id, masterTestId, `Routine Glucose ${stamp}`]
  );
  const order3Id = o3Res.insertId;

  // Order 4: Price 1000.00, for partial payments and refund test
  const [o4Res] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Biochemistry', 'routine', 1000.00, 'unpaid', 'requested')`,
    [`ORD-PAY4-${stamp}`, pat1Id, doc1Id, hospital1Id, masterTestId, `Full Metabolic Panel ${stamp}`]
  );
  const order4Id = o4Res.insertId;



  let passedTests = 0;
  let firstPaymentId = null;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Record full payment (POST /api/labs/orders/:id/payments)
    // -------------------------------------------------------------------------
    console.log("Test 1: Record full payment (POST /api/labs/orders/:id/payments)...");
    const payRes1 = await post(
      `/labs/orders/${order1Id}/payments`,
      {
        amount: 850.00,
        payment_method: "cash",
        transaction_reference: "CASH-REC-001",
        notes: "Collected at reception desk",
      },
      staff1Token
    );

    assert.strictEqual(payRes1.status, 201, `Expected HTTP 201, got ${payRes1.status}: ${JSON.stringify(payRes1.body)}`);
    assert.strictEqual(payRes1.body.success, true);
    assert.strictEqual(payRes1.body.data.order.payment_status, "paid");
    assert(payRes1.body.data.payment.receipt_number.startsWith("RCP-"), "Receipt number must start with RCP-");
    firstPaymentId = payRes1.body.data.payment.id;

    // Verify DB state
    const [dbPayRows] = await pool.execute(
      `SELECT * FROM lab_payments WHERE id = ?`,
      [firstPaymentId]
    );
    assert.strictEqual(dbPayRows.length, 1);
    assert.strictEqual(parseFloat(dbPayRows[0].amount), 850.00);
    assert.strictEqual(dbPayRows[0].payment_status, "paid");
    assert.strictEqual(dbPayRows[0].collected_by, staff1Id);

    const [dbOrder1] = await pool.execute(`SELECT payment_status FROM investigation_requests WHERE id = ?`, [order1Id]);
    assert.strictEqual(dbOrder1[0].payment_status, "paid");
    console.log("✓ Test 1 Passed: Full payment recorded and order status updated to 'paid'.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 2: Reject overpayment / double payment when already fully paid
    // -------------------------------------------------------------------------
    console.log("Test 2: Reject payment when order is already fully paid...");
    const payRes2 = await post(
      `/labs/orders/${order1Id}/payments`,
      { amount: 100.00, payment_method: "cash" },
      staff1Token
    );
    assert.strictEqual(payRes2.status, 400, "Should reject payment when order is already fully paid");
    assert(payRes2.body.message.includes("already fully paid"));
    console.log("✓ Test 2 Passed: Overpayment on fully paid order rejected.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 3: Reject payment on cancelled order
    // -------------------------------------------------------------------------
    console.log("Test 3: Reject payment on cancelled order...");
    const payRes3 = await post(
      `/labs/orders/${order3Id}/payments`,
      { amount: 500.00, payment_method: "card" },
      staff1Token
    );
    assert.strictEqual(payRes3.status, 400, "Should reject payment on cancelled order");
    assert(payRes3.body.message.includes("cancelled"));
    console.log("✓ Test 3 Passed: Payment on cancelled order safely blocked.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 4: Reject invalid or non-positive payment amount
    // -------------------------------------------------------------------------
    console.log("Test 4: Reject invalid or non-positive payment amount...");
    const payRes4 = await post(
      `/labs/orders/${order2Id}/payments`,
      { amount: -50.00, payment_method: "cash" },
      staff1Token
    );
    assert.strictEqual(payRes4.status, 400, "Should reject negative payment amount");
    console.log("✓ Test 4 Passed: Negative payment amount rejected.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 5: Cross-hospital isolation guard on payment collection
    // -------------------------------------------------------------------------
    console.log("Test 5: Cross-hospital isolation guard on payment collection...");
    const payRes5 = await post(
      `/labs/orders/${order2Id}/payments`,
      { amount: 1200.00, payment_method: "cash" },
      staff2Token // Staff from Hospital 2
    );
    assert.strictEqual(payRes5.status, 403, "Should return HTTP 403 Forbidden for cross-hospital payment");
    console.log("✓ Test 5 Passed: Cross-hospital payment attempt securely forbidden.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 6: Fee waiver requiring mandatory non-empty waiver reason
    // -------------------------------------------------------------------------
    console.log("Test 6: Fee waiver requiring mandatory non-empty waiver reason...");
    const waiveFailRes = await post(
      `/labs/orders/${order2Id}/waive`,
      { waiver_reason: "   " },
      admin1Token
    );
    assert.strictEqual(waiveFailRes.status, 400, "Should reject empty waiver reason");

    const waiveOkRes = await post(
      `/labs/orders/${order2Id}/waive`,
      { waiver_reason: "Ayushman Bharat scheme exemption approved by CMO" },
      admin1Token
    );
    assert.strictEqual(waiveOkRes.status, 200, `Expected HTTP 200, got ${waiveOkRes.status}`);
    assert.strictEqual(waiveOkRes.body.data.payment_status, "waived");

    const [dbOrder2] = await pool.execute(`SELECT payment_status, clinical_notes FROM investigation_requests WHERE id = ?`, [order2Id]);
    assert.strictEqual(dbOrder2[0].payment_status, "waived");
    assert(dbOrder2[0].clinical_notes.includes("[FEE WAIVED]"), "Clinical notes should append fee waiver audit");
    console.log("✓ Test 6 Passed: Fee waiver processed with reason and clinical notes updated.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 7: Reject waiver on already paid order
    // -------------------------------------------------------------------------
    console.log("Test 7: Reject waiver on already paid order...");
    const waivePaidRes = await post(
      `/labs/orders/${order1Id}/waive`,
      { waiver_reason: "Attempt waiver after payment" },
      admin1Token
    );
    assert.strictEqual(waivePaidRes.status, 400, "Should reject waiver for already paid order");
    console.log("✓ Test 7 Passed: Waiver rejected for already paid order.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 8: Reject payment on waived order
    // -------------------------------------------------------------------------
    console.log("Test 8: Reject payment on waived order...");
    const payWaivedRes = await post(
      `/labs/orders/${order2Id}/payments`,
      { amount: 1200.00, payment_method: "cash" },
      staff1Token
    );
    assert.strictEqual(payWaivedRes.status, 400, "Should reject payment on waived order");
    console.log("✓ Test 8 Passed: Payment on waived order blocked.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 9: Partial payments dynamic status update
    // -------------------------------------------------------------------------
    console.log("Test 9: Partial payments dynamic status update on Order 4...");
    // Order 4 price: 1000.00
    // Payment 1: 400.00 -> remaining 600.00 -> status still 'unpaid'
    const partPayRes1 = await post(
      `/labs/orders/${order4Id}/payments`,
      { amount: 400.00, payment_method: "upi", transaction_reference: "UPI-400-01" },
      staff1Token
    );
    assert.strictEqual(partPayRes1.status, 201);
    assert.strictEqual(partPayRes1.body.data.order.payment_status, "unpaid");
    const partPayment1Id = partPayRes1.body.data.payment.id;

    // Payment 2: 600.00 -> total 1000.00 -> status transitions to 'paid'
    const partPayRes2 = await post(
      `/labs/orders/${order4Id}/payments`,
      { amount: 600.00, payment_method: "card", transaction_reference: "CARD-600-02" },
      staff1Token
    );
    assert.strictEqual(partPayRes2.status, 201);
    assert.strictEqual(partPayRes2.body.data.order.payment_status, "paid");
    const partPayment2Id = partPayRes2.body.data.payment.id;

    console.log("✓ Test 9 Passed: Partial payments dynamically update status from 'unpaid' to 'paid'.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 10: Payment refund (POST /api/labs/payments/:paymentId/refund)
    // -------------------------------------------------------------------------
    console.log("Test 10: Payment refund and balance re-evaluation...");
    // Refund payment 2 (600.00). Remaining paid = 400.00 (less than 1000.00) -> order drops back to 'unpaid'
    const refundRes1 = await post(
      `/labs/payments/${partPayment2Id}/refund`,
      { refund_reason: "Customer requested card reversal" },
      admin1Token
    );
    assert.strictEqual(refundRes1.status, 200, `Expected HTTP 200, got ${refundRes1.status}: ${JSON.stringify(refundRes1.body)}`);
    assert.strictEqual(refundRes1.body.data.payment_status, "refunded");
    assert.strictEqual(refundRes1.body.data.order_payment_status, "unpaid");

    const [dbOrder4a] = await pool.execute(`SELECT payment_status FROM investigation_requests WHERE id = ?`, [order4Id]);
    assert.strictEqual(dbOrder4a[0].payment_status, "unpaid");

    // Refund payment 1 (400.00). Remaining paid = 0.00 -> order transitions to 'refunded'
    const refundRes2 = await post(
      `/labs/payments/${partPayment1Id}/refund`,
      { refund_reason: "Full cancellation adjustment" },
      admin1Token
    );
    assert.strictEqual(refundRes2.status, 200);
    assert.strictEqual(refundRes2.body.data.order_payment_status, "refunded");

    const [dbOrder4b] = await pool.execute(`SELECT payment_status FROM investigation_requests WHERE id = ?`, [order4Id]);
    assert.strictEqual(dbOrder4b[0].payment_status, "refunded");
    console.log("✓ Test 10 Passed: Payment refunds correctly reverse receipts and update order payment status.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 11: Reject refund without refund_reason or double refund
    // -------------------------------------------------------------------------
    console.log("Test 11: Reject refund without refund_reason or double refund...");
    const noReasonRes = await post(
      `/labs/payments/${firstPaymentId}/refund`,
      { refund_reason: "" },
      admin1Token
    );
    assert.strictEqual(noReasonRes.status, 400, "Should reject empty refund reason");

    const doubleRefundRes = await post(
      `/labs/payments/${partPayment1Id}/refund`,
      { refund_reason: "Attempt refund again" },
      admin1Token
    );
    assert.strictEqual(doubleRefundRes.status, 400, "Should reject double refund on already refunded receipt");
    console.log("✓ Test 11 Passed: Validation guards against empty refund reason and double refunds.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 12: Role authorization guard on refund (Staff cannot refund)
    // -------------------------------------------------------------------------
    console.log("Test 12: Role authorization guard on refund (Staff cannot refund)...");
    const staffRefundRes = await post(
      `/labs/payments/${firstPaymentId}/refund`,
      { refund_reason: "Unauthorized attempt" },
      staff1Token
    );
    assert.strictEqual(staffRefundRes.status, 403, "Staff role should not be authorized to issue refunds");
    console.log("✓ Test 12 Passed: Refund endpoint strictly restricted to administrator roles.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 13: Order payment history endpoint (GET /api/labs/orders/:id/payments)
    // -------------------------------------------------------------------------
    console.log("Test 13: Order payment history endpoint (GET /api/labs/orders/:id/payments)...");
    const histRes = await get(`/labs/orders/${order1Id}/payments`, staff1Token);
    assert.strictEqual(histRes.status, 200);
    assert(Array.isArray(histRes.body.data), "Payments should be returned as an array");
    assert.strictEqual(histRes.body.data.length, 1);
    assert.strictEqual(histRes.body.summary.price, 850.00);
    assert.strictEqual(histRes.body.summary.total_paid, 850.00);
    assert.strictEqual(histRes.body.summary.payment_status, "paid");
    console.log("✓ Test 13 Passed: Payment history and summary calculation verified.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 14: Single payment receipt details & patient data isolation
    // -------------------------------------------------------------------------
    console.log("Test 14: Single payment receipt details & patient isolation...");
    // Patient 1 views their own receipt
    const recOk = await get(`/labs/payments/${firstPaymentId}`, pat1Token);
    assert.strictEqual(recOk.status, 200);
    assert.strictEqual(recOk.body.data.receipt_number, dbPayRows[0].receipt_number);

    // Patient 2 attempts to view Patient 1's receipt -> 403 Forbidden
    const recForbidden = await get(`/labs/payments/${firstPaymentId}`, pat2Token);
    assert.strictEqual(recForbidden.status, 403, "Cross-patient receipt access should be forbidden");
    console.log("✓ Test 14 Passed: Single payment receipt endpoint with strict isolation verified.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 15: Audit trail logs verification
    // -------------------------------------------------------------------------
    console.log("Test 15: Audit trail logs verification...");
    const [auditRows] = await pool.execute(
      `SELECT action, target_type, target_id FROM audit_logs
       WHERE target_type IN ('lab_payments', 'investigation_requests')
       ORDER BY id DESC LIMIT 20`
    );
    const actions = auditRows.map((a) => a.action);
    assert(actions.includes("RECORD_LAB_PAYMENT"), "Audit log should contain RECORD_LAB_PAYMENT");
    assert(actions.includes("WAIVE_LAB_PAYMENT"), "Audit log should contain WAIVE_LAB_PAYMENT");
    assert(actions.includes("REFUND_LAB_PAYMENT"), "Audit log should contain REFUND_LAB_PAYMENT");
    console.log("✓ Test 15 Passed: Audit logs verified for RECORD_LAB_PAYMENT, WAIVE_LAB_PAYMENT, REFUND_LAB_PAYMENT.");
    passedTests++;

    console.log("\n==================================================================");
    console.log(`=== ALL ${passedTests} LESSON 11.9 TESTS PASSED CLEANLY! (100%) ===`);
    console.log("==================================================================\n");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED with error:\n", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
