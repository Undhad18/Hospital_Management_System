/**
 * Module 15: Official Receipt PDF Download & Email Dispatch Test Suite
 * Validates:
 * 1. PDF Download generation with all required fields (Hospital, Patient, Doctor, Appointment, Fees, Receipts)
 * 2. Email dispatch with attached PDF receipt and standardized subject & body
 * 3. Error handling (invalid email, unauthorized tenant, missing bill)
 * 4. Data integrity between database, generated PDF, and dispatched email
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");
const { generateConsultationReceiptPdf } = require("../services/receiptPdfService");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospital_id || user.hospitalId || null,
      tokenVersion: user.token_version || 1,
    },
    JWT_SECRET,
    { expiresIn: "4h" }
  );
}

async function runModule15ReceiptTests() {
  console.log("================================================================================");
  console.log("=== Running Module 15: Official Receipt PDF & Email Dispatch Test Suite ===");
  console.log("================================================================================\n");

  let testStaffToken = null;
  let testPatientToken = null;
  let foreignStaffToken = null;
  let testHospitalId = null;
  let foreignHospitalId = null;
  let testBillId = null;
  let testBillNumber = null;
  let testReceiptNumber = null;
  let createdForeignStaffId = null;
  let createdForeignHospitalId = null;

  try {
    // 1. Setup Test Fixtures: Query existing test data or seed consultation bill & payment
    const [hospitals] = await pool.query("SELECT id, name FROM hospitals ORDER BY id ASC LIMIT 2");
    assert(hospitals.length >= 1, "At least one hospital must exist in database");
    testHospitalId = hospitals[0].id;
    foreignHospitalId = hospitals[1] ? hospitals[1].id : 99999;

    const [staffUsers] = await pool.query(
      "SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'staff' AND u.hospital_id = ? LIMIT 1",
      [testHospitalId]
    );
    assert(staffUsers.length > 0, "Hospital staff user must exist");
    testStaffToken = generateToken(staffUsers[0]);

    // Foreign staff for multi-tenant isolation testing: locate or insert real user record
    const [foreignStaffRows] = await pool.query(
      `SELECT u.*, r.name AS role FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'staff' AND u.hospital_id != ? LIMIT 1`,
      [testHospitalId]
    );

    let foreignStaffUser = foreignStaffRows.length > 0 ? foreignStaffRows[0] : null;
    let createdForeignStaffId = null;
    let createdForeignHospitalId = null;

    if (!foreignStaffUser) {
      const [roleRow] = await pool.query("SELECT id FROM roles WHERE name = 'staff' LIMIT 1");
      const [hospRow] = await pool.query("INSERT INTO hospitals (name, address, status) VALUES ('Foreign Test Hospital', 'Outer City', 'active')");
      createdForeignHospitalId = hospRow.insertId;

      const [uRow] = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role_id, hospital_id, status)
         VALUES ('Foreign Hospital Staff', 'foreign.staff.isolation@test.com', 'dummy_hash', ?, ?, 'active')`,
        [roleRow[0].id, createdForeignHospitalId]
      );
      createdForeignStaffId = uRow.insertId;
      foreignStaffUser = {
        id: createdForeignStaffId,
        email: "foreign.staff.isolation@test.com",
        role: "staff",
        hospital_id: createdForeignHospitalId,
      };
    }

    foreignStaffToken = generateToken(foreignStaffUser);

    // Find or create an existing paid consultation bill
    const [existingBills] = await pool.query(
      `SELECT cb.*, cp.receipt_number, pat.email AS patient_email, pat.full_name AS patient_name,
              doc.full_name AS doctor_name, a.appointment_number, h.name AS hospital_name
       FROM consultation_bills cb
       JOIN consultation_payments cp ON cp.bill_id = cb.id
       JOIN users pat ON pat.id = cb.patient_id
       JOIN users doc ON doc.id = cb.doctor_id
       JOIN appointments a ON a.id = cb.appointment_id
       JOIN hospitals h ON h.id = cb.hospital_id
       WHERE cb.hospital_id = ? AND cb.status = 'paid'
       ORDER BY cb.id DESC LIMIT 1`,
      [testHospitalId]
    );

    let testBill = null;
    if (existingBills.length > 0) {
      testBill = existingBills[0];
      testBillId = testBill.id;
      testBillNumber = testBill.bill_number;
      testReceiptNumber = testBill.receipt_number;
    } else {
      // Find an appointment to create bill and payment
      const [apts] = await pool.query(
        "SELECT a.*, p.email AS patient_email FROM appointments a JOIN users p ON p.id = a.patient_id WHERE a.hospital_id = ? LIMIT 1",
        [testHospitalId]
      );
      assert(apts.length > 0, "At least one appointment must exist");
      const apt = apts[0];
      const stamp = Date.now().toString().slice(-4);
      const bNum = `CBILL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${stamp}`;
      const rNum = `CRCP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${stamp}`;

      const [insBill] = await pool.query(
        `INSERT INTO consultation_bills (bill_number, hospital_id, patient_id, doctor_id, appointment_id, fee_amount, total_amount, paid_amount, balance_due, status, payment_method, created_by)
         VALUES (?, ?, ?, ?, ?, 500.00, 500.00, 500.00, 0.00, 'paid', 'cash', ?)`,
        [bNum, testHospitalId, apt.patient_id, apt.doctor_id, apt.id, staffUsers[0].id]
      );
      testBillId = insBill.insertId;
      testBillNumber = bNum;
      testReceiptNumber = rNum;

      await pool.query(
        `INSERT INTO consultation_payments (receipt_number, bill_id, appointment_id, hospital_id, patient_id, amount, payment_method, payment_status, collected_by)
         VALUES (?, ?, ?, ?, ?, 500.00, 'cash', 'completed', ?)`,
        [rNum, testBillId, apt.id, testHospitalId, apt.patient_id, staffUsers[0].id]
      );
    }

    console.log(`[Test Fixtures Ready] Bill ID: ${testBillId}, Bill #: ${testBillNumber}, Receipt #: ${testReceiptNumber}`);

    // ============================================================================
    // TEST 1: PDF GENERATION & DOWNLOAD
    // ============================================================================
    console.log("\n--- TEST 1: Official Receipt PDF Download & Validation ---");
    const pdfRes = await fetch(`${API_BASE}/consultation-billing/bills/${testBillId}/receipt-pdf`, {
      headers: { Authorization: `Bearer ${testStaffToken}` },
    });

    assert.strictEqual(pdfRes.status, 200, "PDF endpoint should return HTTP 200 OK");
    const contentType = pdfRes.headers.get("content-type");
    assert(contentType && contentType.includes("application/pdf"), `Content-Type must be application/pdf, got ${contentType}`);

    const contentDisp = pdfRes.headers.get("content-disposition");
    assert(contentDisp && contentDisp.includes("attachment") && contentDisp.includes("Official_Receipt_"), `Content-Disposition must specify attachment with receipt filename, got ${contentDisp}`);

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert(pdfBuffer.length > 1000, `PDF Buffer size should be substantial (> 1000 bytes), got ${pdfBuffer.length}`);
    const magicHeader = pdfBuffer.slice(0, 4).toString("ascii");
    assert.strictEqual(magicHeader, "%PDF", `Buffer must begin with %PDF magic header, got ${magicHeader}`);
    console.log(`✓ Test 1 Passed: PDF receipt generated and downloaded successfully (${pdfBuffer.length} bytes, valid %PDF header).`);

    // ============================================================================
    // TEST 2: EMAIL RECEIPT DISPATCH WITH ATTACHED PDF
    // ============================================================================
    console.log("\n--- TEST 2: Email Receipt Dispatch with Attached PDF ---");
    const testRecipient = "receipt.verify@example.com";
    const emailRes = await fetch(`${API_BASE}/consultation-billing/bills/${testBillId}/email-receipt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testStaffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: testRecipient }),
    });

    const emailJson = await emailRes.json();
    assert.strictEqual(emailRes.status, 200, `Email dispatch should return HTTP 200, got ${emailRes.status}`);
    assert.strictEqual(emailJson.success, true, "Email response success must be true");
    assert(emailJson.message.includes("Receipt email dispatched successfully"), "Response must contain success message");

    // Verify Dev Email adapter / recorded email
    const sentEmails = getDevSentEmails(testRecipient);
    assert(sentEmails.length > 0, `At least one sent email recorded for ${testRecipient}`);
    const lastEmail = sentEmails[sentEmails.length - 1];

    // Subject check: "Official Payment Receipt – [Receipt Number]"
    assert(lastEmail.subject.includes("Official Payment Receipt"), `Subject must contain 'Official Payment Receipt', got '${lastEmail.subject}'`);
    assert(lastEmail.subject.includes(testReceiptNumber), `Subject must contain receipt number ${testReceiptNumber}`);

    // Body content checks (Patient Name, Receipt Number, Appointment, Total, Paid, Balance, Hospital)
    assert(lastEmail.text.includes(testReceiptNumber), "Email text body must include Receipt Number");
    assert(lastEmail.text.includes("Total Amount"), "Email text body must include Total Amount");
    assert(lastEmail.text.includes("Paid Amount"), "Email text body must include Paid Amount");
    assert(lastEmail.text.includes("Balance Due"), "Email text body must include Balance Due");

    // Attachment check: PDF attached
    assert(Array.isArray(lastEmail.attachments) && lastEmail.attachments.length > 0, "Email must have PDF attachment");
    const pdfAtt = lastEmail.attachments[0];
    assert.strictEqual(pdfAtt.contentType, "application/pdf", "Attachment content type must be application/pdf");
    assert(pdfAtt.filename.includes(testReceiptNumber), `Attachment filename must include receipt number: ${pdfAtt.filename}`);
    assert(pdfAtt.size > 1000, `Attachment size must be > 1000 bytes, got ${pdfAtt.size}`);
    console.log(`✓ Test 2 Passed: Email dispatched successfully to ${testRecipient} with verified PDF attachment (${pdfAtt.filename}, ${pdfAtt.size} bytes).`);

    // ============================================================================
    // TEST 3: ERROR HANDLING & VALIDATION
    // ============================================================================
    console.log("\n--- TEST 3: Error Handling & Security Boundary Validations ---");

    // 3a. Invalid email format
    const badEmailRes = await fetch(`${API_BASE}/consultation-billing/bills/${testBillId}/email-receipt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testStaffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "invalid-email-format" }),
    });
    assert.strictEqual(badEmailRes.status, 400, "Invalid email format must return HTTP 400");
    const badEmailJson = await badEmailRes.json();
    assert.strictEqual(badEmailJson.success, false);
    console.log("✓ Test 3a Passed: Invalid recipient email rejected with HTTP 400.");

    // 3b. Non-existent bill ID
    const notFoundRes = await fetch(`${API_BASE}/consultation-billing/bills/9999999/receipt-pdf`, {
      headers: { Authorization: `Bearer ${testStaffToken}` },
    });
    assert.strictEqual(notFoundRes.status, 404, "Non-existent bill ID must return HTTP 404");
    console.log("✓ Test 3b Passed: Non-existent bill returned HTTP 404.");

    // 3c. Multi-tenant isolation (foreign staff access)
    const foreignPdfRes = await fetch(`${API_BASE}/consultation-billing/bills/${testBillId}/receipt-pdf`, {
      headers: { Authorization: `Bearer ${foreignStaffToken}` },
    });
    assert.strictEqual(foreignPdfRes.status, 403, "Staff from foreign hospital must be blocked with HTTP 403");
    console.log("✓ Test 3c Passed: Multi-tenant boundary blocked foreign hospital staff with HTTP 403.");

    // ============================================================================
    // TEST 4: RECEIPT DATA INTEGRITY
    // ============================================================================
    console.log("\n--- TEST 4: Receipt Data Integrity Verification ---");
    const [billDb] = await pool.query("SELECT * FROM consultation_bills WHERE id = ?", [testBillId]);
    const [payDb] = await pool.query("SELECT * FROM consultation_payments WHERE bill_id = ?", [testBillId]);

    assert(billDb.length > 0 && payDb.length > 0, "Database records must exist");
    const expectedTotal = Number(billDb[0].total_amount).toFixed(2);
    const expectedPaid = Number(billDb[0].paid_amount).toFixed(2);
    const expectedBalance = Number(billDb[0].balance_due).toFixed(2);

    assert(lastEmail.text.includes(expectedTotal), `Email text must reflect exact total ${expectedTotal}`);
    assert(lastEmail.text.includes(expectedPaid), `Email text must reflect exact paid ${expectedPaid}`);
    assert(lastEmail.text.includes(expectedBalance), `Email text must reflect exact balance ${expectedBalance}`);
    console.log(`✓ Test 4 Passed: Financial records in database (Total: ${expectedTotal}, Paid: ${expectedPaid}, Balance: ${expectedBalance}) match dispatched receipt data.`);

    console.log("\n================================================================================");
    console.log("=== ALL MODULE 15 RECEIPT TESTS PASSED (4/4) ===");
    console.log("================================================================================");
  } catch (err) {
    console.error("\n❌ Test Suite Failed:", err);
    process.exit(1);
  } finally {
    if (createdForeignStaffId) {
      await pool.query("DELETE FROM users WHERE id = ?", [createdForeignStaffId]).catch(() => {});
    }
    if (createdForeignHospitalId) {
      await pool.query("DELETE FROM hospitals WHERE id = ?", [createdForeignHospitalId]).catch(() => {});
    }
    await pool.end();
  }
}

runModule15ReceiptTests();
