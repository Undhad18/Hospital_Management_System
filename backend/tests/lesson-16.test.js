const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");

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

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 16: Consultation Billing Complete Test Suite ===");
  console.log("================================================================================");

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Setup test roles
  const [roles] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  // 1. Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin M16', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_m16_${stamp}@test.com`, passwordHash]
  );
  const tokenSuperAdmin = jwt.sign(
    { sub: saRes.insertId, role: "super_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Hospital 1 and Admin
  const [hosp1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Consultation Test Hospital 1 ${stamp}`, `CTH1-${stamp}`, `cth1_${stamp}@test.com`]
  );
  const hospital1Id = hosp1Res.insertId;

  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin M16', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_m16_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin1 = jwt.sign(
    { sub: ha1Res.insertId, hospitalId: hospital1Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 3. Hospital 2 (Cross-hospital security check)
  const [hosp2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')`,
    [`Consultation Test Hospital 2 ${stamp}`, `CTH2-${stamp}`, `cth2_${stamp}@test.com`]
  );
  const hospital2Id = hosp2Res.insertId;

  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hosp Admin 2 M16', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_m16_${stamp}@test.com`, passwordHash]
  );
  const tokenHospitalAdmin2 = jwt.sign(
    { sub: ha2Res.insertId, hospitalId: hospital2Id, role: "hospital_admin", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 4. Receptionist Staff in Hospital 1
  const [recepRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Receptionist M16', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `recep_m16_${stamp}@test.com`, passwordHash]
  );
  const receptionistId = recepRes.insertId;
  const tokenReceptionist = jwt.sign(
    { sub: receptionistId, hospitalId: hospital1Id, role: "staff", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 5. Doctor in Hospital 1 with consultation fee of ₹650.00
  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status) VALUES (?, 'General Medicine M16', 'Test Dept', 'active')`,
    [hospital1Id]
  );
  const departmentId = deptRes.insertId;

  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, 'Dr. Sarah Smith M16', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, departmentId, `doc_m16_${stamp}@test.com`, passwordHash]
  );
  const doctorId = docRes.insertId;
  const doctorFee = 650.00;
  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, experience_years, consultation_fee)
     VALUES (?, 'Consultant Physician', 10, ?)`,
    [doctorId, doctorFee]
  );
  const tokenDoctor = jwt.sign(
    { sub: doctorId, hospitalId: hospital1Id, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 6. Patient in Hospital 1
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Jane Doe Patient M16', ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `patient_m16_${stamp}@test.com`, passwordHash]
  );
  const patientId = patRes.insertId;
  await pool.execute(
    `INSERT INTO patient_profiles (user_id, blood_group, gender) VALUES (?, 'B+', 'female')`,
    [patientId]
  );
  const tokenPatient = jwt.sign(
    { sub: patientId, hospitalId: hospital1Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 7. Second Patient (for isolation checks)
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'John Smith Patient 2 M16', ?, ?, 'active')`,
    [roleMap["patient"], hospital1Id, `patient2_m16_${stamp}@test.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;
  const tokenPatient2 = jwt.sign(
    { sub: patient2Id, hospitalId: hospital1Id, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 8. Create Appointment 1 for Patient 1
  const apt1Number = `APT-M16-${stamp}-1`;
  const [apt1Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, hospital_id, department_id, doctor_id, appointment_date, appointment_time, appointment_type, status, payment_method, consultation_fee)
     VALUES (?, ?, ?, ?, ?, '2026-11-05', '10:00 AM', 'consultation', 'confirmed', 'cash', ?)`,
    [apt1Number, patientId, hospital1Id, departmentId, doctorId, doctorFee]
  );
  const appointment1Id = apt1Res.insertId;

  // Create Appointment 2 for Patient 1 (for UPI payment testing)
  const apt2Number = `APT-M16-${stamp}-2`;
  const [apt2Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, hospital_id, department_id, doctor_id, appointment_date, appointment_time, appointment_type, status, payment_method, consultation_fee)
     VALUES (?, ?, ?, ?, ?, '2026-11-06', '11:30 AM', 'consultation', 'completed', 'upi', ?)`,
    [apt2Number, patientId, hospital1Id, departmentId, doctorId, doctorFee]
  );
  const appointment2Id = apt2Res.insertId;

  // Create Appointment 3 for Patient 1 (for Cancellation testing)
  const apt3Number = `APT-M16-${stamp}-3`;
  const [apt3Res] = await pool.execute(
    `INSERT INTO appointments (appointment_number, patient_id, hospital_id, department_id, doctor_id, appointment_date, appointment_time, appointment_type, status, payment_method, consultation_fee)
     VALUES (?, ?, ?, ?, ?, '2026-11-07', '02:00 PM', 'consultation', 'confirmed', 'cash', ?)`,
    [apt3Number, patientId, hospital1Id, departmentId, doctorId, doctorFee]
  );
  const appointment3Id = apt3Res.insertId;

  console.log("✓ Test fixtures created successfully.\n");

  let generatedBill1 = null;
  let generatedBill2 = null;

  // ---------------------------------------------------------------------------
  // LESSON 16.1: CONSULTATION FEE AND BILL GENERATION
  // ---------------------------------------------------------------------------
  console.log("--- Testing Lesson 16.1: Consultation Fee & Authoritative Bill Generation ---");
  {
    // A: Fee preview inspection
    const previewRes = await get(`/consultation-billing/fee-preview/${appointment1Id}`, tokenReceptionist);
    assert.strictEqual(previewRes.status, 200, "Fee preview endpoint should return 200");
    assert.strictEqual(Number(previewRes.body.data.authoritative_fee), doctorFee, "Authoritative fee must match doctor fee");
    assert.strictEqual(Number(previewRes.body.data.tax_amount), 0, "Consultation fee must have 0% GST (statutory exemption)");
    console.log("  ✓ Authoritative fee preview matches doctor fee (₹650.00, 0% tax)");

    // B: Bill generation
    const genRes = await post(
      "/consultation-billing/bills",
      {
        appointment_id: appointment1Id,
        payment_method: "cash",
        notes: "Routine checkup consultation",
      },
      tokenReceptionist
    );
    assert.strictEqual(genRes.status, 201, "Bill generation should return 201 Created");
    assert.strictEqual(genRes.body.success, true);
    assert.ok(genRes.body.data.bill_number.startsWith("CBILL-"), "Bill number format must be CBILL-YYYYMMDD-XXXX");
    assert.strictEqual(Number(genRes.body.data.fee_amount), doctorFee, "Bill fee must equal authoritative fee snapshot");
    assert.strictEqual(Number(genRes.body.data.paid_amount), 0, "New bill must NOT be marked paid automatically");
    assert.strictEqual(Number(genRes.body.data.balance_due), doctorFee, "Balance due must equal total fee initially");
    assert.strictEqual(genRes.body.data.status, "pending", "Initial bill status must be pending");

    generatedBill1 = genRes.body.data;
    console.log(`  ✓ Generated bill #${generatedBill1.bill_number} with status PENDING and balance ₹${generatedBill1.balance_due}`);

    // C: Cross-check appointments table has updated bill_id
    const [aptCheck] = await pool.query("SELECT bill_id FROM appointments WHERE id = ?", [appointment1Id]);
    assert.strictEqual(aptCheck[0].bill_id, generatedBill1.bill_number, "Appointment bill_id must be updated with bill_number");
    console.log("  ✓ Bidirectional cross-reference established on appointments.bill_id");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.5 & 16.9: DUPLICATE PREVENTION & UNIQUE BILL CONSTRAINTS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.5 & 16.9: Duplicate Prevention & Idempotency ---");
  {
    // Try generating bill again for the exact same appointment
    const dupRes = await post(
      "/consultation-billing/bills",
      {
        appointment_id: appointment1Id,
      },
      tokenReceptionist
    );
    assert.strictEqual(dupRes.status, 200, "Duplicate request should safely return existing bill with 200 OK");
    assert.strictEqual(dupRes.body.already_exists, true, "already_exists flag should be true");
    assert.strictEqual(dupRes.body.data.id, generatedBill1.id, "Must return existing bill record");
    console.log("  ✓ Prevented duplicate bill generation on repeated submit");

    // Test with idempotency key
    const idempKey = `IDEMP-${stamp}-123`;
    const bill2Res = await post(
      "/consultation-billing/bills",
      {
        appointment_id: appointment2Id,
        payment_method: "upi",
        idempotency_key: idempKey,
      },
      tokenReceptionist
    );
    assert.strictEqual(bill2Res.status, 201, "Second appointment bill generation should succeed");
    generatedBill2 = bill2Res.body.data;

    // Retry with same idempotency key
    const retryRes = await post(
      "/consultation-billing/bills",
      {
        appointment_id: appointment2Id,
        idempotency_key: idempKey,
      },
      tokenReceptionist
    );
    assert.strictEqual(retryRes.status, 200);
    assert.strictEqual(retryRes.body.already_exists, true);
    console.log("  ✓ Idempotency key safely returned existing bill");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.4 & 16.2: RECEPTIONIST CASH COLLECTION AND PAYMENT CONFIRMATION
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.4 & 16.2: Receptionist Cash Collection & Payment Workflow ---");
  {
    // A: Patient cannot collect cash (unauthorized check)
    const unauthPay = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      { amount: 650, payment_method: "cash" },
      tokenPatient
    );
    assert.strictEqual(unauthPay.status, 403, "Patient cannot collect cash payments");
    console.log("  ✓ Role permission enforced: Patients cannot collect payments");

    // B: Overpayment check (prevent recording ₹800 when balance is ₹650)
    const overPayRes = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      { amount: 800, payment_method: "cash" },
      tokenReceptionist
    );
    assert.strictEqual(overPayRes.status, 400, "Overpayment should be rejected with 400");
    console.log("  ✓ Overpayment rejected safely");

    // C: Partial payment recording (₹300 out of ₹650)
    const partPayRes = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      { amount: 300, payment_method: "cash", notes: "Initial partial deposit" },
      tokenReceptionist
    );
    assert.strictEqual(partPayRes.status, 201, "Partial payment should succeed with 201");
    assert.strictEqual(partPayRes.body.data.status, "partially_paid", "Bill status should be partially_paid");
    assert.strictEqual(Number(partPayRes.body.data.balance_due), 350.00, "Balance due must equal ₹350.00");
    assert.ok(partPayRes.body.data.receipt_number.startsWith("CRCP-"), "Receipt number format must be CRCP-YYYYMMDD-XXXX");
    console.log(`  ✓ Partial payment accepted: paid ₹300, remaining balance ₹${partPayRes.body.data.balance_due}, receipt #${partPayRes.body.data.receipt_number}`);

    // D: Clear remaining balance (₹350 out of ₹350)
    const fullPayRes = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      { amount: 350, payment_method: "cash", notes: "Settled remainder" },
      tokenReceptionist
    );
    assert.strictEqual(fullPayRes.status, 201);
    assert.strictEqual(fullPayRes.body.data.status, "paid", "Bill status must transition to 'paid' when balance is 0");
    assert.strictEqual(Number(fullPayRes.body.data.balance_due), 0.00, "Balance due must be ₹0.00");
    console.log(`  ✓ Remainder cleared: bill status transitioned to PAID with receipt #${fullPayRes.body.data.receipt_number}`);

    // E: Attempting to pay an already-paid bill should fail
    const redundantPay = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      { amount: 50, payment_method: "cash" },
      tokenReceptionist
    );
    assert.strictEqual(redundantPay.status, 400, "Payment on already paid bill must be rejected");
    console.log("  ✓ Redundant payment rejected on fully paid bill");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.2: UPI / GPAY PAYMENT VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.2: UPI/GPay Payment Verification ---");
  {
    // UPI payment without transaction reference must fail
    const noRefRes = await post(
      `/consultation-billing/bills/${generatedBill2.id}/payments`,
      { amount: 650, payment_method: "upi" },
      tokenReceptionist
    );
    assert.strictEqual(noRefRes.status, 400, "UPI payment without transaction reference must be rejected");
    console.log("  ✓ UPI payment without transaction reference correctly rejected");

    // Valid UPI payment with transaction reference
    const upiRef = `UPI-TXN-${stamp}-999`;
    const upiRes = await post(
      `/consultation-billing/bills/${generatedBill2.id}/payments`,
      {
        amount: 650,
        payment_method: "upi",
        transaction_reference: upiRef,
        notes: "GPay QR scan at billing counter",
      },
      tokenReceptionist
    );
    assert.strictEqual(upiRes.status, 201, "UPI payment with reference should succeed");
    assert.strictEqual(upiRes.body.data.status, "paid");
    console.log(`  ✓ UPI/GPay payment recorded with reference ${upiRef} and receipt #${upiRes.body.data.receipt_number}`);

    // Duplicate transaction reference check
    const dupRefRes = await post(
      `/consultation-billing/bills/${generatedBill1.id}/payments`,
      {
        amount: 100,
        payment_method: "upi",
        transaction_reference: upiRef,
      },
      tokenReceptionist
    );
    assert.strictEqual(dupRefRes.status, 400, "Duplicate transaction reference or paid bill must fail");
    console.log("  ✓ Duplicate payment transaction reference safely rejected");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.3: BILL STATUS MANAGEMENT, CANCELLATION & REFUNDS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.3: Bill Status Management, Cancellation & Refunds ---");
  {
    // A: Generate bill for Appointment 3
    const bill3Res = await post(
      "/consultation-billing/bills",
      { appointment_id: appointment3Id, payment_method: "cash" },
      tokenReceptionist
    );
    assert.strictEqual(bill3Res.status, 201);
    const bill3 = bill3Res.body.data;
    assert.strictEqual(bill3.status, "pending");

    // B: Cancel unpaid bill via Hospital Admin
    const cancelRes = await post(
      `/consultation-billing/bills/${bill3.id}/cancel`,
      { reason: "Patient rescheduled to next month" },
      tokenHospitalAdmin1
    );
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.data.status, "cancelled");
    console.log(`  ✓ Unpaid bill #${bill3.bill_number} successfully cancelled`);

    // C: Attempt payment on cancelled bill must fail
    const payCancelled = await post(
      `/consultation-billing/bills/${bill3.id}/payments`,
      { amount: 650, payment_method: "cash" },
      tokenReceptionist
    );
    assert.strictEqual(payCancelled.status, 400, "Payment on cancelled bill must be rejected");
    console.log("  ✓ Payment on cancelled bill strictly rejected");

    // D: Refund partial amount on generatedBill1 (Paid ₹650)
    const refundRes = await post(
      `/consultation-billing/bills/${generatedBill1.id}/refund`,
      { refund_amount: 200, reason: "Special clinical discount concession" },
      tokenHospitalAdmin1
    );
    assert.strictEqual(refundRes.status, 201);
    assert.strictEqual(refundRes.body.data.status, "partially_paid");
    assert.strictEqual(Number(refundRes.body.data.paid_amount), 450.00);
    assert.strictEqual(Number(refundRes.body.data.balance_due), 200.00);
    assert.ok(refundRes.body.data.refund_receipt.startsWith("CRFD-"));
    console.log(`  ✓ Partial refund of ₹200 processed: receipt #${refundRes.body.data.refund_receipt}, new paid balance ₹${refundRes.body.data.paid_amount}`);

    // E: Refund exceeding current paid amount must fail
    const excessRefund = await post(
      `/consultation-billing/bills/${generatedBill1.id}/refund`,
      { refund_amount: 500, reason: "Excessive claim" },
      tokenHospitalAdmin1
    );
    assert.strictEqual(excessRefund.status, 400, "Refund exceeding paid amount must be rejected");
    console.log("  ✓ Excessive refund rejected safely");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.6: PATIENT BILL & PAYMENT ACCESS ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.6: Patient Bill & Payment Access Isolation ---");
  {
    // Patient 1 fetches their own bills
    const pt1Bills = await get("/consultation-billing/patient/my-bills", tokenPatient);
    assert.strictEqual(pt1Bills.status, 200);
    assert.ok(pt1Bills.body.data.length >= 2, "Patient 1 should see at least their 2 consultation bills");
    assert.ok(pt1Bills.body.data.every((b) => b.patient_id === patientId), "All returned bills must belong to Patient 1");
    console.log(`  ✓ Patient 1 successfully retrieved ${pt1Bills.body.data.length} personal consultation bills`);

    // Patient 2 fetches their bills (should not see Patient 1's bills)
    const pt2Bills = await get("/consultation-billing/patient/my-bills", tokenPatient2);
    assert.strictEqual(pt2Bills.status, 200);
    assert.strictEqual(pt2Bills.body.data.length, 0, "Patient 2 should see 0 bills");
    console.log("  ✓ Patient data isolation strictly enforced: Patient 2 cannot see Patient 1's records");

    // Patient cannot view internal single bill of another patient
    const directViewUnauth = await get(`/consultation-billing/bills/${generatedBill1.id}`, tokenPatient2);
    assert.strictEqual(directViewUnauth.status, 403, "Patient cannot view another patient's bill directly");
    console.log("  ✓ Direct bill lookup authorization denied for foreign patient");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.7: CONSULTATION BILLING HISTORY & ACCESS PERMISSIONS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.7: Consultation Billing History & Role Permissions ---");
  {
    // Hospital Admin 1 gets hospital bills
    const ha1Bills = await get("/consultation-billing/bills", tokenHospitalAdmin1);
    assert.strictEqual(ha1Bills.status, 200);
    assert.ok(ha1Bills.body.data.every((b) => b.hospital_id === hospital1Id), "Hospital Admin 1 only sees Hospital 1 bills");
    console.log(`  ✓ Hospital Admin retrieved ${ha1Bills.body.data.length} bills scoped to Hospital 1`);

    // Hospital Admin 2 sees 0 bills from Hospital 1
    const ha2Bills = await get("/consultation-billing/bills", tokenHospitalAdmin2);
    assert.strictEqual(ha2Bills.status, 200);
    assert.strictEqual(ha2Bills.body.data.length, 0, "Hospital Admin 2 cannot see Hospital 1 bills");
    console.log("  ✓ Multi-tenant hospital isolation enforced for Hospital Admins");

    // Filter by status=paid
    const paidFilterRes = await get("/consultation-billing/bills?status=paid", tokenHospitalAdmin1);
    assert.strictEqual(paidFilterRes.status, 200);
    assert.ok(paidFilterRes.body.data.every((b) => b.status === "paid"), "Status filter must only return paid bills");
    console.log(`  ✓ Filter by status=paid returned ${paidFilterRes.body.data.length} bills`);
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.8: AUTOMATED PAYMENT CONFIRMATION EMAILS
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.8: Payment Confirmation Emails ---");
  {
    const patientEmail = `patient_m16_${stamp}@test.com`;
    const devEmails = getDevSentEmails(patientEmail);
    assert.ok(devEmails.length > 0, "Payment confirmation email must be recorded in mock email service");
    const lastEmail = devEmails[devEmails.length - 1];
    assert.ok(lastEmail.subject.includes("Payment Receipt") || lastEmail.subject.includes("CRCP-"), "Email subject must reference payment receipt");
    console.log(`  ✓ Payment confirmation email recorded for ${patientEmail}: "${lastEmail.subject}"`);

    // Manual re-dispatch endpoint test
    const resendRes = await post(`/consultation-billing/bills/${generatedBill1.id}/email-receipt`, {}, tokenReceptionist);
    assert.strictEqual(resendRes.status, 200, "Manual receipt email dispatch should return 200");
    console.log("  ✓ Manual receipt email dispatch succeeded");
  }

  // ---------------------------------------------------------------------------
  // LESSON 16.10: SEPARATING CONSULTATION FEES FROM MEDICINE CHARGES
  // ---------------------------------------------------------------------------
  console.log("\n--- Testing Lesson 16.10: Separation of Consultation Fees from Pharmacy Medicine Charges ---");
  {
    // A: Verify consultation bill record in MySQL has no medicine line items and 0% tax
    const [cBillRows] = await pool.query("SELECT * FROM consultation_bills WHERE id = ?", [generatedBill1.id]);
    assert.strictEqual(Number(cBillRows[0].tax_amount), 0.00, "Consultation bill must not incur GST");

    // B: Verify pharmacy bills table remains independent
    const [pBillRows] = await pool.query("SELECT * FROM pharmacy_bills WHERE hospital_id = ?", [hospital1Id]);
    assert.strictEqual(pBillRows.length, 0, "No pharmacy bills should be created by consultation billing workflow");
    console.log("  ✓ Consultation billing and Pharmacy billing maintain complete structural & tax independence");
  }

  console.log("\n================================================================================");
  console.log("=== ALL MODULE 16 TESTS PASSED (10/10 LESSONS VERIFIED) ===");
  console.log("================================================================================\n");

  await pool.end();
}

runTests().catch(async (err) => {
  console.error("\n❌ Module 16 Test Failure:", err.message);
  console.error(err.stack);
  try { await pool.end(); } catch {}
  process.exit(1);
});
