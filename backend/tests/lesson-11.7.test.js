const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";

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
  let data;
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => "");
  }

  return { status: res.status, ok: res.ok, body: data, headers: res.headers };
}

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.7 Uploading and Linking Lab Reports Suite ===");
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
    [`Memorial Clinical Center ${stamp}`, `MCC1-${stamp}`, `mcc1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`County Health Hospital ${stamp}`, `CHH2-${stamp}`, `chh2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

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
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, `Dr. Watson ${stamp}`, `doc1_${stamp}@m11.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;

  // Staff 1 (Hospital 1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Staff Carol ${stamp}`, `staff1_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;

  // Staff 2 (Hospital 2)
  const [staff2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital2Id, `Staff Dave ${stamp}`, `staff2_${stamp}@m11.com`, passwordHash]
  );
  const staff2Id = staff2Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient One ${stamp}`, `pat1_${stamp}@m11.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;

  // Patient 2
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient Two ${stamp}`, `pat2_${stamp}@m11.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;

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

  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);
  const staff2Token = makeToken(staff2Id, "staff", hospital2Id);
  const doc1Token = makeToken(doc1Id, "doctor", hospital1Id);
  const pat1Token = makeToken(patient1Id, "patient", null);
  const pat2Token = makeToken(patient2Id, "patient", null);

  // 3. Master Test Fixture
  const [mtRes] = await pool.execute(
    `INSERT INTO master_lab_tests
     (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Comprehensive Metabolic Panel', 'Biochemistry', 'Serum', 6, 'active')`,
    [`TEST-CMP-${stamp}`]
  );
  const masterTestId = mtRes.insertId;

  // 4. Lab Orders Fixtures
  // Order 1: In progress
  const orderNum1 = `LAB-RPT1-${stamp}`;
  const [o1Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status)
     VALUES (?, ?, ?, ?, ?, 'Comprehensive Metabolic Panel', 'Biochemistry', 'routine', 50.00, 'in_progress')`,
    [orderNum1, patient1Id, doc1Id, hospital1Id, masterTestId]
  );
  const order1Id = o1Res.insertId;

  // Order 2: Cancelled
  const orderNum2 = `LAB-RPT2-${stamp}`;
  const [o2Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status, cancelled_at, cancellation_reason)
     VALUES (?, ?, ?, ?, ?, 'Comprehensive Metabolic Panel', 'Biochemistry', 'routine', 50.00, 'cancelled', NOW(), 'Patient unfasted')`,
    [orderNum2, patient1Id, doc1Id, hospital1Id, masterTestId]
  );
  const order2Id = o2Res.insertId;

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

  // --- Helper to create dummy file FormData ---
  function createReportFormData(fileName, fileContent, status = "final", notes = "") {
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: "application/pdf" });
    formData.append("report", blob, fileName);
    if (status) formData.append("status", status);
    if (notes) formData.append("notes", notes);
    return { formData, expectedHash: crypto.createHash("sha256").update(Buffer.from(fileContent)).digest("hex") };
  }

  // --- Test 1: Staff 1 Uploads Report Version 1 for Order 1 ---
  const dummyPdf1 = "%PDF-1.4\n1 0 obj\n<< /Title (Metabolic Panel Report V1) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
  const { formData: form1, expectedHash: hash1 } = createReportFormData("cmp_results_v1.pdf", dummyPdf1, "final", "All biochemical analytes within reference intervals.");

  const up1 = await postMultipart(`/labs/orders/${order1Id}/reports`, form1, staff1Token);
  let report1Id = null;

  runCase("POST /api/labs/orders/:id/reports uploads report, creates v1 record with SHA-256 hash", () => {
    assert.strictEqual(up1.status, 201, "Expected HTTP 201 Created");
    assert.strictEqual(up1.body.success, true);
    assert.ok(up1.body.data.report, "Must return created report object");
    report1Id = up1.body.data.report.id;
    assert.strictEqual(up1.body.data.report.version, 1, "First report must be version 1");
    assert.strictEqual(up1.body.data.report.file_hash, hash1, "Calculated file hash must match SHA-256");
    assert.strictEqual(up1.body.data.report.status, "final");
    assert.ok(up1.body.data.report.report_number.startsWith("RPT-"), "Report number must follow RPT- prefix");
  });

  // --- Test 2: Order Status Auto-Completion on Final Report ---
  runCase("Uploading final report auto-completes order and populates completed_at timestamp", async () => {
    assert.strictEqual(up1.body.data.order.status, "completed", "Order must transition to completed");
    const [chk] = await pool.query("SELECT status, completed_at FROM investigation_requests WHERE id = ?", [order1Id]);
    assert.strictEqual(chk[0].status, "completed");
    assert.ok(chk[0].completed_at, "completed_at must be populated");
  });

  // --- Test 3: Upload Report Version 2 (Amended Findings) ---
  const dummyPdf2 = "%PDF-1.4\n2 0 obj\n<< /Title (Metabolic Panel Report V2 Amended) >>\nendobj\ntrailer\n<< /Root 2 0 R >>\n%%EOF";
  const { formData: form2, expectedHash: hash2 } = createReportFormData("cmp_results_v2.pdf", dummyPdf2, "amended", "Added eGFR calculation addendum.");

  const up2 = await postMultipart(`/labs/orders/${order1Id}/reports`, form2, staff1Token);
  let report2Id = null;

  runCase("Uploading second report increments version to v2 with distinct hash", () => {
    assert.strictEqual(up2.status, 201);
    assert.strictEqual(up2.body.data.report.version, 2, "Second report must have version 2");
    report2Id = up2.body.data.report.id;
    assert.strictEqual(up2.body.data.report.file_hash, hash2);
    assert.strictEqual(up2.body.data.report.status, "amended");
    assert.notStrictEqual(report1Id, report2Id, "New report must have unique ID");
  });

  // --- Test 4: Reject Upload for Cancelled Order ---
  const { formData: formCancel } = createReportFormData("cancelled_order_report.pdf", dummyPdf1);
  const upCancel = await postMultipart(`/labs/orders/${order2Id}/reports`, formCancel, staff1Token);

  runCase("Uploading report for cancelled order is rejected with HTTP 400 Bad Request", () => {
    assert.strictEqual(upCancel.status, 400);
    assert.strictEqual(upCancel.body.success, false);
    assert.ok(
      upCancel.body.message.toLowerCase().includes("cancelled"),
      `Expected error mentioning cancelled order, got: ${upCancel.body.message}`
    );
  });

  // --- Test 5: Reject Patient Report Upload (RBAC) ---
  const { formData: formPat } = createReportFormData("patient_self_upload.pdf", dummyPdf1);
  const upPat = await postMultipart(`/labs/orders/${order1Id}/reports`, formPat, pat1Token);

  runCase("Patient attempting to upload report is rejected with HTTP 403 Forbidden", () => {
    assert.strictEqual(upPat.status, 403);
  });

  // --- Test 6: Cross-Hospital Isolation on Upload ---
  const { formData: formCross } = createReportFormData("cross_hospital.pdf", dummyPdf1);
  const upCross = await postMultipart(`/labs/orders/${order1Id}/reports`, formCross, staff2Token);

  runCase("Staff from Hospital 2 cannot upload report for Hospital 1 order (HTTP 403 Forbidden)", () => {
    assert.strictEqual(upCross.status, 403);
    assert.strictEqual(upCross.body.success, false);
  });

  // --- Test 7: GET /api/labs/orders/:id/reports Lists All Versions ---
  const listReports = await get(`/labs/orders/${order1Id}/reports`, staff1Token);

  runCase("GET /api/labs/orders/:id/reports returns all report versions (v2 first, then v1)", () => {
    assert.strictEqual(listReports.status, 200);
    assert.strictEqual(listReports.body.success, true);
    assert.strictEqual(listReports.body.data.length, 2, "Must return 2 versions");
    assert.strictEqual(listReports.body.data[0].version, 2, "First element must be v2");
    assert.strictEqual(listReports.body.data[1].version, 1, "Second element must be v1");
    assert.ok(listReports.body.data[0].uploader_name, "Must include uploader name");
  });

  // --- Test 8: Patient 1 Can Retrieve Their Own Order Reports ---
  const patList = await get(`/labs/orders/${order1Id}/reports`, pat1Token);

  runCase("Patient 1 can retrieve attached reports for their own order", () => {
    assert.strictEqual(patList.status, 200);
    assert.strictEqual(patList.body.data.length, 2);
  });

  // --- Test 9: Patient 2 Forbidden from Accessing Patient 1's Reports ---
  const pat2List = await get(`/labs/orders/${order1Id}/reports`, pat2Token);

  runCase("Patient 2 cannot access reports of Patient 1 (HTTP 403 Forbidden)", () => {
    assert.strictEqual(pat2List.status, 403);
  });

  // --- Test 10: GET /api/labs/reports/:id Single Report Metadata ---
  const metaReport = await get(`/labs/reports/${report1Id}`, doc1Token);

  runCase("GET /api/labs/reports/:id returns single report metadata and joined order details", () => {
    assert.strictEqual(metaReport.status, 200);
    assert.strictEqual(metaReport.body.data.id, report1Id);
    assert.strictEqual(metaReport.body.data.order_number, orderNum1);
  });

  // --- Test 11: File Download and View Endpoints ---
  const dlRes = await get(`/labs/reports/${report1Id}/download`, staff1Token);
  runCase("GET /api/labs/reports/:id/download streams file with attachment disposition", () => {
    assert.strictEqual(dlRes.status, 200);
    assert.ok(dlRes.headers.get("content-disposition")?.includes("attachment"));
    assert.strictEqual(dlRes.body, dummyPdf1);
  });

  const viewRes = await get(`/labs/reports/${report1Id}/view`, pat1Token);
  runCase("GET /api/labs/reports/:id/view streams file with inline disposition for patient", () => {
    assert.strictEqual(viewRes.status, 200);
    assert.ok(viewRes.headers.get("content-disposition")?.includes("inline"));
    assert.strictEqual(viewRes.body, dummyPdf1);
  });

  // --- Test 12: Audit Logging for Report Upload ---
  const [auditRows] = await pool.query(
    `SELECT target_id, action, details
     FROM audit_logs
     WHERE target_id = ? AND action = 'UPLOAD_LAB_REPORT'
     ORDER BY id DESC`,
    [report1Id]
  );

  runCase("Audit trail is written to audit_logs for UPLOAD_LAB_REPORT", () => {
    assert.ok(auditRows.length >= 1, "Must have recorded audit log entry for report upload");
    const details = typeof auditRows[0].details === "string" ? JSON.parse(auditRows[0].details) : auditRows[0].details;
    assert.strictEqual(details.version, 1);
    assert.strictEqual(details.file_hash, hash1);
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
