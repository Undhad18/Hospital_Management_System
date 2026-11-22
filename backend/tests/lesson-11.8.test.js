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

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("==================================================================");
  console.log("=== Running Lesson 11.8 Report Validation & SHA-256 Duplication ==");
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
    [`Precision Diagnostic Hospital ${stamp}`, `PDH1-${stamp}`, `pdh1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Apex Healthcare Hospital ${stamp}`, `AHH2-${stamp}`, `ahh2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  // 2. Users
  // Staff 1 (Hospital 1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Lab Tech Sarah ${stamp}`, `tech1_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;

  // Staff 2 (Hospital 2)
  const [staff2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital2Id, `Lab Tech Mike ${stamp}`, `tech2_${stamp}@m11.com`, passwordHash]
  );
  const staff2Id = staff2Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient Echo ${stamp}`, `pat1_${stamp}@m11.com`, passwordHash]
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

  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);
  const staff2Token = makeToken(staff2Id, "staff", hospital2Id);

  // 3. Master Test Fixture
  const [mtRes] = await pool.execute(
    `INSERT INTO master_lab_tests
     (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Lipid Profile Screen', 'Biochemistry', 'Serum', 5, 'active')`,
    [`TEST-LIP-${stamp}`]
  );
  const masterTestId = mtRes.insertId;

  // 4. Lab Orders Fixtures
  const orderNum1 = `LAB-VAL1-${stamp}`;
  const [o1Res] = await pool.execute(
    `INSERT INTO investigation_requests
     (order_number, patient_id, doctor_id, hospital_id, master_test_id, test_name, test_category, priority, price, status)
     VALUES (?, ?, ?, ?, ?, 'Lipid Profile Screen', 'Biochemistry', 'routine', 40.00, 'in_progress')`,
    [orderNum1, patient1Id, staff1Id, hospital1Id, masterTestId]
  );
  const order1Id = o1Res.insertId;

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

  // --- Helper to build multipart FormData ---
  function makePdfFormData(contentString, fileName = "report.pdf", status = "final", notes = "") {
    const formData = new FormData();
    const blob = new Blob([contentString], { type: "application/pdf" });
    formData.append("report", blob, fileName);
    if (status) formData.append("status", status);
    if (notes) formData.append("notes", notes);
    return formData;
  }

  // Valid PDF dummy content (starts with %PDF)
  const validPdf1 = "%PDF-1.4\n1 0 obj\n<< /Title (Lipid Profile v1) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
  const validPdf1Hash = crypto.createHash("sha256").update(Buffer.from(validPdf1)).digest("hex");

  // --- Test 1: Upload Valid Report (v1) ---
  const form1 = makePdfFormData(validPdf1, "lipid_results.pdf", "final", "Baseline lipid levels evaluated.");
  const res1 = await postMultipart(`/labs/orders/${order1Id}/reports`, form1, staff1Token);

  runCase("POST /api/labs/orders/:id/reports successfully accepts valid PDF and stores SHA-256 checksum", () => {
    assert.strictEqual(res1.status, 201, "Should return HTTP 201 Created");
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.data.report.version, 1);
    assert.strictEqual(res1.body.data.report.file_hash, validPdf1Hash);
  });

  // --- Test 2: Duplicate Rejection (Same Order, Same SHA-256) ---
  // Attempting to re-upload the EXACT SAME file to order 1
  const formDup = makePdfFormData(validPdf1, "lipid_results_reupload.pdf", "final", "Accidental duplicate upload");
  const resDup = await postMultipart(`/labs/orders/${order1Id}/reports`, formDup, staff1Token);

  runCase("Re-uploading identical file to the same order is rejected with HTTP 409 Conflict", () => {
    assert.strictEqual(resDup.status, 409, "Must return HTTP 409 Conflict");
    assert.strictEqual(resDup.body.success, false);
    assert.ok(
      resDup.body.message.toLowerCase().includes("duplicate report file detected"),
      `Expected duplicate file message, got: ${resDup.body.message}`
    );
    assert.strictEqual(resDup.body.data.existing_report_id, res1.body.data.report.id);
  });

  // --- Test 3: Verify No Duplicate Record Added to Database ---
  const [reportsCount] = await pool.query("SELECT COUNT(*) AS total FROM lab_reports WHERE order_id = ?", [order1Id]);
  runCase("Database retains single report record; no duplicate row inserted", () => {
    assert.strictEqual(reportsCount[0].total, 1, "Must still have exactly 1 report in database");
  });

  // --- Test 4: Uploading Distinct File Allowed as Version 2 ---
  const validPdf2 = "%PDF-1.4\n2 0 obj\n<< /Title (Lipid Profile v2 Follow-up) >>\nendobj\ntrailer\n<< /Root 2 0 R >>\n%%EOF";
  const form2 = makePdfFormData(validPdf2, "lipid_results_v2.pdf", "amended", "Follow-up revised values.");
  const res2 = await postMultipart(`/labs/orders/${order1Id}/reports`, form2, staff1Token);

  runCase("Uploading distinct file (different SHA-256) succeeds as Version 2", () => {
    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.body.data.report.version, 2);
    assert.notStrictEqual(res2.body.data.report.file_hash, validPdf1Hash);
  });

  // --- Test 5: Reject Empty File (0 Bytes) ---
  const emptyForm = new FormData();
  const emptyBlob = new Blob([], { type: "application/pdf" });
  emptyForm.append("report", emptyBlob, "empty.pdf");
  const resEmpty = await postMultipart(`/labs/orders/${order1Id}/reports`, emptyForm, staff1Token);

  runCase("Uploading empty file (0 bytes) is rejected with HTTP 400 Bad Request", () => {
    assert.strictEqual(resEmpty.status, 400);
    assert.strictEqual(resEmpty.body.success, false);
    assert.ok(
      resEmpty.body.message.toLowerCase().includes("empty"),
      `Expected error mentioning empty file, got: ${resEmpty.body.message}`
    );
  });

  // --- Test 6: Reject Corrupt / Disguised File (Magic Byte Validation) ---
  // A text file renamed to .pdf that does not have %PDF magic header
  const fakePdfContent = "This is a plain text file pretending to be a PDF.";
  const fakeForm = makePdfFormData(fakePdfContent, "fake_doc.pdf");
  const resFake = await postMultipart(`/labs/orders/${order1Id}/reports`, fakeForm, staff1Token);

  runCase("Uploading file with invalid file header/magic bytes is rejected with HTTP 400", () => {
    assert.strictEqual(resFake.status, 400);
    assert.strictEqual(resFake.body.success, false);
    assert.ok(
      resFake.body.message.toLowerCase().includes("corrupt") ||
      resFake.body.message.toLowerCase().includes("mismatched"),
      `Expected corrupt or mismatched signature error, got: ${resFake.body.message}`
    );
  });

  // --- Test 7: Reject Disallowed Extensions (.exe, .txt) ---
  const disallowedForm = new FormData();
  const txtBlob = new Blob(["echo hello"], { type: "text/plain" });
  disallowedForm.append("report", txtBlob, "script.txt");
  const resDisallowed = await postMultipart(`/labs/orders/${order1Id}/reports`, disallowedForm, staff1Token);

  runCase("Uploading unsupported file type (.txt) is rejected by upload filter with HTTP 400", () => {
    assert.strictEqual(resDisallowed.status, 400);
    assert.strictEqual(resDisallowed.body.success, false);
    assert.ok(
      resDisallowed.body.message.toLowerCase().includes("invalid laboratory report format") ||
      resDisallowed.body.message.toLowerCase().includes("allowed formats"),
      `Expected format error, got: ${resDisallowed.body.message}`
    );
  });

  // --- Test 8: Valid Image Formats (PNG magic byte verification) ---
  // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngBlob = new Blob([pngHeader], { type: "image/png" });
  const pngForm = new FormData();
  pngForm.append("report", pngBlob, "scanned_results.png");
  pngForm.append("status", "final");
  const resPng = await postMultipart(`/labs/orders/${order1Id}/reports`, pngForm, staff1Token);

  runCase("Uploading valid PNG image with proper magic header succeeds as Version 3", () => {
    assert.strictEqual(resPng.status, 201);
    assert.strictEqual(resPng.body.data.report.version, 3);
    assert.strictEqual(resPng.body.data.report.mime_type, "image/png");
  });

  // --- Test 9: Verify Table Index for SHA-256 Duplication Check ---
  const [indexRows] = await pool.query(
    `SHOW INDEX FROM lab_reports WHERE Key_name = 'idx_report_hash'`
  );
  runCase("Database maintains optimized compound index 'idx_report_hash' on (order_id, file_hash)", () => {
    assert.ok(indexRows.length >= 2, "Compound index idx_report_hash must exist with order_id and file_hash columns");
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
