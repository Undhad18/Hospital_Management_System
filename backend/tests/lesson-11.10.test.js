const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

async function postMultipart(endpoint, formData, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
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

  const contentType = res.headers.get("content-type") || "";
  const contentDisposition = res.headers.get("content-disposition") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => "");
  }
  return { status: res.status, ok: res.ok, body: data, headers: res.headers, disposition: contentDisposition };
}

function createReportFormData(fileName, fileContent, status = "final", notes = "") {
  const formData = new FormData();
  const blob = new Blob([fileContent], { type: "application/pdf" });
  formData.append("report", blob, fileName);
  if (status) formData.append("status", status);
  if (notes) formData.append("notes", notes);
  return formData;
}

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.10 Patient & Doctor Report Access Tests ====");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

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

  // 1. Fixtures: Hospitals
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`National General Hospital ${stamp}`, `NGH1-${stamp}`, `ngh1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Provincial Care Hospital ${stamp}`, `PCH2-${stamp}`, `pch2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  // 2. Fixtures: Users
  // Patient 1 (H1)
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `Alice Patient ${stamp}`, `alice_${stamp}@m11.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;
  const patient1Token = makeToken(patient1Id, "patient", hospital1Id);

  // Patient 2 (H2)
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], hospital2Id, `Bob Patient ${stamp}`, `bob_${stamp}@m11.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;
  const patient2Token = makeToken(patient2Id, "patient", hospital2Id);

  // Doctor 1 (H1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `Dr. Gregory House ${stamp}`, `house_${stamp}@m11.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;
  const doc1Token = makeToken(doc1Id, "doctor", hospital1Id);

  // Doctor 2 (H2)
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital2Id, `Dr. John Watson ${stamp}`, `watson_${stamp}@m11.com`, passwordHash]
  );
  const doc2Id = doc2Res.insertId;
  const doc2Token = makeToken(doc2Id, "doctor", hospital2Id);

  // Staff 1 (H1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Staff Sarah ${stamp}`, `sarah_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;
  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);

  // Admin 1 (H1)
  const [admin1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `Admin Arthur ${stamp}`, `arthur_${stamp}@m11.com`, passwordHash]
  );
  const admin1Id = admin1Res.insertId;
  const admin1Token = makeToken(admin1Id, "hospital_admin", hospital1Id);

  // 3. Department & Appointment (H1)
  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status)
     VALUES (?, 'Diagnostics', 'active')`,
    [hospital1Id]
  );
  const deptId = deptRes.insertId;

  const [aptRes] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, queue_number, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00 AM', '10:00:00', '10:30:00', 'confirmed', 'Q-10A', 'Routine Review')`,
    [`APT-L10-${stamp}`, patient1Id, hospital1Id, deptId, doc1Id]
  );
  const appointment1Id = aptRes.insertId;

  // 4. Master Lab Test
  const [mtRes] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Comprehensive Diagnostic Profile', 'Biochemistry', 'Serum', 4, 'active')`,
    [`TEST-L10-${stamp}`]
  );
  const masterTestId = mtRes.insertId;

  // 5. Test Orders
  // Order A: Patient 1, Unpaid, Price 600.00
  const [oARes] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, appointment_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Comprehensive Diagnostic Profile', 'Biochemistry', 'routine', 600.00, 'unpaid', 'in_progress')`,
    [`ORD-10A-${stamp}`, patient1Id, doc1Id, hospital1Id, appointment1Id, masterTestId]
  );
  const orderAId = oARes.insertId;

  // Order B: Patient 1, Paid, Price 450.00
  const [oBRes] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, appointment_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Comprehensive Diagnostic Profile', 'Biochemistry', 'routine', 450.00, 'paid', 'in_progress')`,
    [`ORD-10B-${stamp}`, patient1Id, doc1Id, hospital1Id, appointment1Id, masterTestId]
  );
  const orderBId = oBRes.insertId;

  // Order C: Patient 1, Waived, Price 800.00
  const [oCRes] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, appointment_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status, clinical_notes)
     VALUES (?, ?, ?, ?, ?, ?, 'Comprehensive Diagnostic Profile', 'Biochemistry', 'routine', 800.00, 'waived', 'in_progress', '[FEE WAIVED]: Government scheme')`,
    [`ORD-10C-${stamp}`, patient1Id, doc1Id, hospital1Id, appointment1Id, masterTestId]
  );
  const orderCId = oCRes.insertId;

  // Order D: Patient 2 (Hospital 2), Paid, Price 500.00
  const [oDRes] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, 'Comprehensive Diagnostic Profile', 'Biochemistry', 'routine', 500.00, 'paid', 'in_progress')`,
    [`ORD-10D-${stamp}`, patient2Id, doc2Id, hospital2Id, masterTestId]
  );
  const orderDId = oDRes.insertId;

  // Order E: Patient 1, Doctor 1, Unpaid, for doctor clinical access check
  const [oERes] = await pool.execute(
    `INSERT INTO investigation_requests
       (order_number, patient_id, doctor_id, hospital_id, master_test_id,
        test_name, test_category, priority, price, payment_status, status)
     VALUES (?, ?, ?, ?, ?, 'Critical Cardiac Enzymes', 'Biochemistry', 'stat', 750.00, 'unpaid', 'in_progress')`,
    [`ORD-10E-${stamp}`, patient1Id, doc1Id, hospital1Id, masterTestId]
  );
  const orderEId = oERes.insertId;

  // 6. Upload PDF Reports
  const pdfTemplate = (title) =>
    `%PDF-1.4\n1 0 obj\n<< /Title (${title}) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;

  const upA = await postMultipart(
    `/labs/orders/${orderAId}/reports`,
    createReportFormData("report_a.pdf", pdfTemplate("Report A")),
    staff1Token
  );
  assert.strictEqual(upA.status, 201, `Failed to upload report A: ${JSON.stringify(upA.body)}`);
  const reportAId = upA.body.data.report.id;

  const upB = await postMultipart(
    `/labs/orders/${orderBId}/reports`,
    createReportFormData("report_b.pdf", pdfTemplate("Report B")),
    staff1Token
  );
  assert.strictEqual(upB.status, 201);
  const reportBId = upB.body.data.report.id;

  const upC = await postMultipart(
    `/labs/orders/${orderCId}/reports`,
    createReportFormData("report_c.pdf", pdfTemplate("Report C")),
    staff1Token
  );
  assert.strictEqual(upC.status, 201);
  const reportCId = upC.body.data.report.id;

  const upE = await postMultipart(
    `/labs/orders/${orderEId}/reports`,
    createReportFormData("report_e.pdf", pdfTemplate("Report E")),
    staff1Token
  );
  assert.strictEqual(upE.status, 201);
  const reportEId = upE.body.data.report.id;

  let passedTests = 0;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Patient report access blocked when order payment is unpaid
    // -------------------------------------------------------------------------
    console.log("Test 1: Patient access blocked for unpaid order report...");
    const dlFail = await get(`/labs/reports/${reportAId}/download`, patient1Token);
    assert(
      dlFail.status === 402 || dlFail.status === 403,
      `Expected HTTP 402/403, got ${dlFail.status}: ${JSON.stringify(dlFail.body)}`
    );
    assert(
      JSON.stringify(dlFail.body).toLowerCase().includes("payment"),
      "Error response must indicate payment is required"
    );

    const viewFail = await get(`/labs/reports/${reportAId}/view`, patient1Token);
    assert(
      viewFail.status === 402 || viewFail.status === 403,
      `Expected HTTP 402/403 for viewing unpaid report, got ${viewFail.status}`
    );
    console.log("✓ Test 1 Passed: Patient download and view safely blocked for unpaid order.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 2: Patient report access granted when order is paid
    // -------------------------------------------------------------------------
    console.log("Test 2: Patient report access granted for paid order...");
    const dlPaid = await get(`/labs/reports/${reportBId}/download`, patient1Token);
    assert.strictEqual(dlPaid.status, 200, `Expected HTTP 200, got ${dlPaid.status}`);
    assert(dlPaid.disposition.includes("attachment"), "Must send attachment disposition for download");
    assert(dlPaid.body.includes("%PDF-1.4"), "Body must contain PDF content");

    const viewPaid = await get(`/labs/reports/${reportBId}/view`, patient1Token);
    assert.strictEqual(viewPaid.status, 200);
    assert(viewPaid.disposition.includes("inline"), "Must send inline disposition for view");
    console.log("✓ Test 2 Passed: Patient can download and view report for fully paid order.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 3: Patient report access granted when order fee is waived
    // -------------------------------------------------------------------------
    console.log("Test 3: Patient report access granted for fee-waived order...");
    const dlWaived = await get(`/labs/reports/${reportCId}/download`, patient1Token);
    assert.strictEqual(dlWaived.status, 200, `Expected HTTP 200, got ${dlWaived.status}`);
    assert(dlWaived.body.includes("%PDF-1.4"));
    console.log("✓ Test 3 Passed: Patient can access report for fee-waived order.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 4: Dynamic unlock of report access upon payment settlement
    // -------------------------------------------------------------------------
    console.log("Test 4: Dynamic report unlock upon payment recording...");
    // Pay for Order A (was unpaid)
    const payA = await post(
      `/labs/orders/${orderAId}/payments`,
      { amount: 600.00, payment_method: "upi", transaction_reference: "UPI-UNLOCK-10" },
      staff1Token
    );
    assert.strictEqual(payA.status, 201);
    assert.strictEqual(payA.body.data.order.payment_status, "paid");

    // Now Patient 1 attempts to download Report A
    const dlUnlocked = await get(`/labs/reports/${reportAId}/download`, patient1Token);
    assert.strictEqual(dlUnlocked.status, 200, "Report A must be unlocked immediately after payment");
    console.log("✓ Test 4 Passed: Report immediately unlocked for patient once payment is recorded.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 5: Cross-patient data isolation protection
    // -------------------------------------------------------------------------
    console.log("Test 5: Cross-patient access protection...");
    const crossPat = await get(`/labs/reports/${reportBId}/download`, patient2Token);
    assert.strictEqual(crossPat.status, 403, "Patient 2 must be forbidden from accessing Patient 1's report");
    console.log("✓ Test 5 Passed: Cross-patient report download blocked with HTTP 403 Forbidden.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 6: Doctor report access for clinical care (unrestricted by payment)
    // -------------------------------------------------------------------------
    console.log("Test 6: Doctor report access unrestricted by patient payment status...");
    // Order E is unpaid (fee 750.00). Doctor 1 should still be able to download and view for clinical diagnostics.
    const docDl = await get(`/labs/reports/${reportEId}/download`, doc1Token);
    assert.strictEqual(docDl.status, 200, "Doctor must not be blocked by patient payment status");
    assert(docDl.body.includes("%PDF-1.4"));
    console.log("✓ Test 6 Passed: Doctor has clinical access to reports regardless of payment status.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 7: Cross-hospital doctor isolation
    // -------------------------------------------------------------------------
    console.log("Test 7: Cross-hospital doctor isolation check...");
    const crossDoc = await get(`/labs/reports/${reportBId}/download`, doc2Token);
    assert.strictEqual(crossDoc.status, 403, "Doctor from another hospital must be forbidden");
    console.log("✓ Test 7 Passed: Cross-hospital doctor report access blocked with HTTP 403.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 8: Order reports list metadata and lock status (GET /api/labs/orders/:id/reports)
    // -------------------------------------------------------------------------
    console.log("Test 8: Order reports list metadata and lock detection...");
    // Patient 1 queries Order E (unpaid): reports should have is_locked = true
    const patListE = await get(`/labs/orders/${orderEId}/reports`, patient1Token);
    assert.strictEqual(patListE.status, 200);
    assert.strictEqual(patListE.body.data[0].is_locked, true);
    assert(patListE.body.data[0].lock_reason.includes("Payment required"));

    // Patient 1 queries Order B (paid): reports should have is_locked = false
    const patListB = await get(`/labs/orders/${orderBId}/reports`, patient1Token);
    assert.strictEqual(patListB.status, 200);
    assert.strictEqual(patListB.body.data[0].is_locked, false);

    // Doctor 1 queries Order E (unpaid): doctor is not locked
    const docListE = await get(`/labs/orders/${orderEId}/reports`, doc1Token);
    assert.strictEqual(docListE.status, 200);
    assert.strictEqual(docListE.body.data[0].is_locked, false);
    console.log("✓ Test 8 Passed: Order reports list accurately returns role-sensitive lock flags.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 9: Patient portal convenience endpoint (GET /api/labs/my-reports)
    // -------------------------------------------------------------------------
    console.log("Test 9: Patient portal convenience endpoint (GET /api/labs/my-reports)...");
    const myReps = await get(`/labs/my-reports`, patient1Token);
    assert.strictEqual(myReps.status, 200);
    assert(Array.isArray(myReps.body.data));
    assert(myReps.body.data.length >= 3);
    const ordBItem = myReps.body.data.find((o) => o.id === orderBId);
    assert.strictEqual(ordBItem.payment_status, "paid");
    assert.strictEqual(ordBItem.is_locked, false);
    assert.ok(ordBItem.reports.length >= 1);
    console.log("✓ Test 9 Passed: Patient my-reports endpoint returns enriched investigations and reports.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 10: Doctor portal review endpoint (GET /api/labs/doctor-reviews)
    // -------------------------------------------------------------------------
    console.log("Test 10: Doctor portal review endpoint (GET /api/labs/doctor-reviews)...");
    const docReviews = await get(`/labs/doctor-reviews`, doc1Token);
    assert.strictEqual(docReviews.status, 200);
    assert(Array.isArray(docReviews.body.data));
    assert(docReviews.body.data.length >= 3);
    console.log("✓ Test 10 Passed: Doctor reviews endpoint returns clinical investigation findings.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 11: Appointment linked tests with reports (GET /api/labs/appointments/:id/tests)
    // -------------------------------------------------------------------------
    console.log("Test 11: Appointment linked tests with reports...");
    const aptTests = await get(`/labs/appointments/${appointment1Id}/tests`, patient1Token);
    assert.strictEqual(aptTests.status, 200);
    assert.strictEqual(aptTests.body.total_tests, 3); // Order A, B, C
    const testB = aptTests.body.tests.find((t) => t.id === orderBId);
    assert.ok(testB.reports && testB.reports.length >= 1, "Linked test must contain attached reports");
    assert.strictEqual(testB.is_locked, false);
    console.log("✓ Test 11 Passed: Appointment linked investigations include attached report objects.");
    passedTests++;

    // -------------------------------------------------------------------------
    // Test 12: Audit log verification for report access (VIEW & DOWNLOAD)
    // -------------------------------------------------------------------------
    console.log("Test 12: Audit log verification for report access...");
    const [auditRows] = await pool.execute(
      `SELECT action, target_type, target_id FROM audit_logs
       WHERE target_type = 'lab_reports' AND action IN ('DOWNLOAD_LAB_REPORT', 'VIEW_LAB_REPORT')
       ORDER BY id DESC LIMIT 10`
    );
    const actions = auditRows.map((a) => a.action);
    assert(actions.includes("DOWNLOAD_LAB_REPORT"), "Audit log must contain DOWNLOAD_LAB_REPORT");
    assert(actions.includes("VIEW_LAB_REPORT"), "Audit log must contain VIEW_LAB_REPORT");
    console.log("✓ Test 12 Passed: Audit logs successfully recorded for DOWNLOAD_LAB_REPORT and VIEW_LAB_REPORT.");
    passedTests++;

    console.log("\n==================================================================");
    console.log(`=== ALL ${passedTests} LESSON 11.10 TESTS PASSED CLEANLY! (100%) ==`);
    console.log("==================================================================\n");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED with error:\n", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
