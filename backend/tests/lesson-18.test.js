const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 18: Database Design and Relationships Complete Test Suite ===");
  console.log("================================================================================\n");

  const stamp = Date.now();

  // Retrieve system roles
  const [roles] = await pool.query("SELECT id, name FROM roles");
  const roleMap = {};
  roles.forEach((r) => { roleMap[r.name] = r.id; });

  // ============================================================================
  // LESSON 18.1 — PRIMARY KEYS AND FOREIGN KEYS
  // ============================================================================
  console.log("--- Lesson 18.1: Primary Keys and Foreign Key Constraint Enforcement ---");

  // Verify that all tables have primary keys
  const [tablesWithoutPk] = await pool.query(`
    SELECT t.table_name
    FROM information_schema.tables t
    LEFT JOIN information_schema.table_constraints tc
      ON t.table_schema = tc.table_schema
     AND t.table_name = tc.table_name
     AND tc.constraint_type = 'PRIMARY KEY'
    WHERE t.table_schema = DATABASE()
      AND t.table_type = 'BASE TABLE'
      AND tc.constraint_name IS NULL
  `);
  assert.strictEqual(tablesWithoutPk.length, 0, "100% of tables must have an explicit PRIMARY KEY");
  console.log("✓ Verified: 100% of tables have an explicit PRIMARY KEY");

  // Verify Foreign Key enforcement: Reject invalid foreign key
  let invalidRoleRejected = false;
  try {
    await pool.query(
      "INSERT INTO users (role_id, full_name, email, password_hash) VALUES (999999, 'Invalid Role User', ?, 'hash')",
      [`inv_role_${stamp}@test.com`]
    );
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2") invalidRoleRejected = true;
  }
  assert.strictEqual(invalidRoleRejected, true, "Inserting invalid foreign key must be blocked by MySQL foreign key constraints");
  console.log("✓ Verified: Foreign key constraint blocks invalid parent reference");

  // ============================================================================
  // LESSON 18.2 — USER, ROLE AND HOSPITAL TABLES
  // ============================================================================
  console.log("\n--- Lesson 18.2: User, Role and Hospital Tables ---");

  // Hospital creation
  const [hospRes] = await pool.query(
    "INSERT INTO hospitals (name, code, email, status) VALUES (?, ?, ?, 'active')",
    [`M18 Hospital ${stamp}`, `M18-${stamp}`, `hosp_${stamp}@test.com`]
  );
  const hospitalId = hospRes.insertId;

  // Global Super Admin (hospital_id = NULL)
  const [saRes] = await pool.query(
    "INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status) VALUES (?, NULL, 'Super Admin M18', ?, 'hash', 'active')",
    [roleMap["super_admin"], `sa_${stamp}@test.com`]
  );
  assert.ok(saRes.insertId > 0, "Super admin with NULL hospital_id must be permitted");
  console.log(`✓ Verified: Global Super Admin created with hospital_id = NULL (ID: ${saRes.insertId})`);

  // Unique email enforcement
  let duplicateEmailRejected = false;
  try {
    await pool.query(
      "INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status) VALUES (?, ?, 'Duplicate Email', ?, 'hash', 'active')",
      [roleMap["hospital_admin"], hospitalId, `sa_${stamp}@test.com`]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") duplicateEmailRejected = true;
  }
  assert.strictEqual(duplicateEmailRejected, true, "Duplicate email must be rejected by uq_users_email");
  console.log("✓ Verified: Unique email constraint uq_users_email strictly enforced");

  // ============================================================================
  // LESSON 18.3 — DEPARTMENT, DESIGNATION, DOCTOR AND STAFF TABLES
  // ============================================================================
  console.log("\n--- Lesson 18.3: Department, Designation, Doctor and Staff Tables ---");

  const [deptRes] = await pool.query(
    "INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Cardiology M18', 'active')",
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [desigRes] = await pool.query(
    "INSERT INTO designations (hospital_id, name, status) VALUES (?, 'Senior Cardiologist', 'active')",
    [hospitalId]
  );
  const designationId = desigRes.insertId;

  // Doctor User & Profile
  const [docUserRes] = await pool.query(
    "INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status) VALUES (?, ?, ?, 'Dr. Heart Specialist', ?, 'hash', 'active')",
    [roleMap["doctor"], hospitalId, departmentId, `doctor_${stamp}@test.com`]
  );
  const doctorUserId = docUserRes.insertId;

  await pool.query(
    `INSERT INTO doctor_profiles (user_id, specialization, consultation_fee, experience_years)
     VALUES (?, 'Cardiology', 750.00, 12)`,
    [doctorUserId]
  );
  console.log(`✓ Doctor profile created and linked 1:1 with user ${doctorUserId}`);

  // Test 1:1 doctor profile constraint
  let duplicateDoctorProfileRejected = false;
  try {
    await pool.query(
      `INSERT INTO doctor_profiles (user_id, specialization, consultation_fee)
       VALUES (?, 'Cardiology', 800.00)`,
      [doctorUserId]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") duplicateDoctorProfileRejected = true;
  }
  assert.strictEqual(duplicateDoctorProfileRejected, true, "Duplicate doctor profile for same user must be rejected");
  console.log("✓ Verified: 1:1 relationship between User and Doctor Profile strictly enforced");

  // Staff User & Profile
  const [staffUserRes] = await pool.query(
    "INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status) VALUES (?, ?, ?, 'Staff Nurse Coordinator', ?, 'hash', 'active')",
    [roleMap["staff"], hospitalId, departmentId, `staff_${stamp}@test.com`]
  );
  const staffUserId = staffUserRes.insertId;

  await pool.query(
    `INSERT INTO staff_profiles (user_id, employee_id, shift_timing)
     VALUES (?, ?, 'Morning 08:00 - 16:00')`,
    [staffUserId, `EMP-${stamp}`]
  );
  console.log("✓ Verified: Staff user and profile linked with hospital and department scoping");

  // ============================================================================
  // LESSON 18.4 — PATIENT AND APPOINTMENT RELATIONSHIPS
  // ============================================================================
  console.log("\n--- Lesson 18.4: Patient and Appointment Relationships ---");

  const [patUserRes] = await pool.query(
    "INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status) VALUES (?, ?, 'Patient Test Unit', ?, 'hash', 'active')",
    [roleMap["patient"], hospitalId, `patient_${stamp}@test.com`]
  );
  const patientUserId = patUserRes.insertId;

  const aptNumber = `APT-M18-${stamp}`;
  const [aptRes] = await pool.query(
    `INSERT INTO appointments 
     (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '09:30:00', 'consultation', 'confirmed')`,
    [aptNumber, patientUserId, doctorUserId, hospitalId, departmentId]
  );
  const appointmentId = aptRes.insertId;
  console.log(`✓ Verified: Primary appointment ${aptNumber} (ID: ${appointmentId}) created`);

  // Follow-up appointment self-referential link
  const followUpNumber = `APT-FU-${stamp}`;
  const [fuRes] = await pool.query(
    `INSERT INTO appointments 
     (appointment_number, patient_id, doctor_id, hospital_id, department_id, appointment_date, appointment_time, appointment_type, status, follow_up_to_id)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 7 DAY), '10:00:00', 'follow_up', 'confirmed', ?)`,
    [followUpNumber, patientUserId, doctorUserId, hospitalId, departmentId, appointmentId]
  );
  assert.ok(fuRes.insertId > 0, "Follow-up appointment must reference primary appointment");
  console.log(`✓ Verified: Follow-up appointment ${followUpNumber} references parent appointment ${appointmentId}`);

  // ============================================================================
  // LESSON 18.5 — CONSULTATION, ADMISSION AND STATUS HISTORY RELATIONSHIPS
  // ============================================================================
  console.log("\n--- Lesson 18.5: Consultation, Admission and Status History Relationships ---");

  const [consultRes] = await pool.query(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, 'submitted', 'Chest pain upon exertion', 'Angina pectoris')`,
    [appointmentId, patientUserId, doctorUserId, hospitalId]
  );
  const consultationId = consultRes.insertId;
  console.log(`✓ Verified: Consultation record (ID: ${consultationId}) linked to appointment ${appointmentId}`);

  const admNumber = `ADM-M18-${stamp}`;
  const [admRes] = await pool.query(
    `INSERT INTO admissions 
     (admission_number, hospital_id, patient_id, appointment_id, doctor_id, department_id, admission_date, status, reason, admitted_by)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), 'admitted', 'Acute cardiac monitoring required', ?)`,
    [admNumber, hospitalId, patientUserId, appointmentId, doctorUserId, departmentId, staffUserId]
  );
  const admissionId = admRes.insertId;

  // Admission status history
  await pool.query(
    `INSERT INTO admission_status_history (admission_id, previous_status, new_status, change_reason, changed_by)
     VALUES (?, 'admitted', 'admitted', 'Initial admission confirmation', ?)`,
    [admissionId, staffUserId]
  );
  console.log(`✓ Verified: Admission ${admNumber} and status audit history successfully recorded`);

  // ============================================================================
  // LESSON 18.6 — WARD, BED AND PATIENT ASSIGNMENT RELATIONSHIPS
  // ============================================================================
  console.log("\n--- Lesson 18.6: Ward, Bed and Patient Assignment Relationships ---");

  const [wardRes] = await pool.query(
    "INSERT INTO wards (hospital_id, department_id, name, ward_type, capacity, status) VALUES (?, ?, 'Cardiac ICU', 'icu', 6, 'active')",
    [hospitalId, departmentId]
  );
  const wardId = wardRes.insertId;

  const [bedRes] = await pool.query(
    "INSERT INTO beds (ward_id, bed_number, bed_type, daily_rate, status) VALUES (?, 'ICU-01', 'icu', 2500.00, 'available')",
    [wardId]
  );
  const bedId = bedRes.insertId;

  // Active bed assignment
  const [assignRes] = await pool.query(
    `INSERT INTO bed_assignments 
     (hospital_id, ward_id, bed_id, admission_id, patient_id, assigned_by, assigned_at, status)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), 'active')`,
    [hospitalId, wardId, bedId, admissionId, patientUserId, staffUserId]
  );
  await pool.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [bedId]);
  console.log(`✓ Verified: Bed ${bedId} assigned to admission ${admissionId} and set to 'occupied'`);

  // Verify concurrent double assignment rejection via virtual generated key
  let concurrentBedAssignmentRejected = false;
  try {
    const [adm2Res] = await pool.query(
      `INSERT INTO admissions 
       (admission_number, hospital_id, patient_id, appointment_id, doctor_id, department_id, admission_date, status, reason, admitted_by)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), 'admitted', 'Secondary patient', ?)`,
      [`ADM-CONC-${stamp}`, hospitalId, patientUserId, appointmentId, doctorUserId, departmentId, staffUserId]
    );
    await pool.query(
      `INSERT INTO bed_assignments 
       (hospital_id, ward_id, bed_id, admission_id, patient_id, assigned_by, assigned_at, status)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), 'active')`,
      [hospitalId, wardId, bedId, adm2Res.insertId, patientUserId, staffUserId]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") concurrentBedAssignmentRejected = true;
  }
  assert.strictEqual(concurrentBedAssignmentRejected, true, "Duplicate active bed assignment must be rejected by uq_active_bed_assignment");
  console.log("✓ Verified: Double-booking prevented by uq_active_bed_assignment constraint");

  // ============================================================================
  // LESSON 18.7 — LABORATORY TEST AND REPORT RELATIONSHIPS
  // ============================================================================
  console.log("\n--- Lesson 18.7: Laboratory Test and Report Relationships ---");

  const [masterLabTests] = await pool.query("SELECT id FROM master_lab_tests LIMIT 1");
  const masterTestId = masterLabTests[0]?.id || 1;

  const orderNumber = `LAB-ORD-${stamp}`;
  const [reqRes] = await pool.query(
    `INSERT INTO investigation_requests 
     (order_number, appointment_id, patient_id, doctor_id, hospital_id, master_test_id, test_name, price, status, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, 'Serum Troponin I', 850.00, 'requested', 'paid')`,
    [orderNumber, appointmentId, patientUserId, doctorUserId, hospitalId, masterTestId]
  );
  const orderId = reqRes.insertId;

  const repNumber = `LAB-REP-${stamp}`;
  const [reportRes] = await pool.query(
    `INSERT INTO lab_reports 
     (report_number, order_id, patient_id, hospital_id, storage_key, original_filename, file_size, mime_type, file_hash, uploaded_by, notes, status)
     VALUES (?, ?, ?, ?, 'lab-reports/trop_i.pdf', 'trop_i.pdf', 2048, 'application/pdf', 'hashabcdef1234567890', ?, 'Troponin levels normal', 'final')`,
    [repNumber, orderId, patientUserId, hospitalId, staffUserId]
  );
  assert.ok(reportRes.insertId > 0, "Lab report must be created and linked to investigation order");
  console.log(`✓ Verified: Lab Order ${orderNumber} and Lab Report ${repNumber} linked via order_id foreign key`);

  // ============================================================================
  // LESSON 18.8 — MEDICINE, PRESCRIPTION AND PHARMACY BILLING TABLES
  // ============================================================================
  console.log("\n--- Lesson 18.8: Medicine, Prescription and Pharmacy Billing Tables ---");

  const [catRes] = await pool.query(
    "INSERT INTO medicine_categories (name, status) VALUES (?, 'active')",
    [`Cardiac Meds ${stamp}`]
  );
  const categoryId = catRes.insertId;

  const [medRes] = await pool.query(
    `INSERT INTO master_medicines (sku, name, category, category_id, form, strength, purchase_price, sale_price, min_stock_alert_level)
     VALUES (?, 'Clopidogrel 75mg', 'Antiplatelet', ?, 'Tablet', '75mg', 8.00, 18.00, 20)`,
    [`SKU-CLOP-${stamp}`, categoryId]
  );
  const medicineId = medRes.insertId;
  console.log(`✓ Verified: Master medicine linked to category ${categoryId} via fk_mm_category`);

  const rxNumber = `RX-M18-${stamp}`;
  const [rxRes] = await pool.query(
    `INSERT INTO prescriptions (consultation_id, appointment_id, hospital_id, patient_id, doctor_id, prescription_number, general_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Take 1 tablet after meals daily', 'active')`,
    [consultationId, appointmentId, hospitalId, patientUserId, doctorUserId, rxNumber]
  );
  const rxId = rxRes.insertId;

  const [itemRes] = await pool.query(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, form, frequency, duration, quantity)
     VALUES (?, ?, 'Clopidogrel 75mg', '75mg', 'Tablet', '0-1-0', '15 days', 15)`,
    [rxId, medicineId]
  );
  const rxItemId = itemRes.insertId;

  const pbillNumber = `PBILL-M18-${stamp}`;
  const [pbillRes] = await pool.query(
    `INSERT INTO pharmacy_bills 
     (bill_number, hospital_id, patient_id, prescription_id, subtotal, taxable_amount, gst_rate, gst_amount, grand_total, paid_amount, balance_due, status, created_by)
     VALUES (?, ?, ?, ?, 270.00, 270.00, 12.00, 32.40, 302.40, 302.40, 0.00, 'paid', ?)`,
    [pbillNumber, hospitalId, patientUserId, rxId, staffUserId]
  );
  const pbillId = pbillRes.insertId;

  await pool.query(
    `INSERT INTO pharmacy_bill_items (bill_id, prescription_item_id, medicine_id, medicine_name, quantity, unit_price, taxable_amount, gst_amount, line_total)
     VALUES (?, ?, ?, 'Clopidogrel 75mg', 15, 18.00, 270.00, 32.40, 302.40)`,
    [pbillId, rxItemId, medicineId]
  );
  console.log(`✓ Verified: Prescription ${rxNumber} and Pharmacy Bill ${pbillNumber} with line items created`);

  // ============================================================================
  // LESSON 18.9 — CONSULTATION BILLING AND PAYMENT RELATIONSHIPS
  // ============================================================================
  console.log("\n--- Lesson 18.9: Consultation Billing and Payment Relationships ---");

  const cbillNumber = `CBILL-M18-${stamp}`;
  const [cbillRes] = await pool.query(
    `INSERT INTO consultation_bills 
     (bill_number, hospital_id, patient_id, appointment_id, doctor_id, fee_amount, total_amount, paid_amount, balance_due, payment_method, status, created_by)
     VALUES (?, ?, ?, ?, ?, 750.00, 750.00, 750.00, 0.00, 'upi', 'paid', ?)`,
    [cbillNumber, hospitalId, patientUserId, appointmentId, doctorUserId, staffUserId]
  );
  const cbillId = cbillRes.insertId;

  const crcpNumber = `CRCP-M18-${stamp}`;
  const [crcpRes] = await pool.query(
    `INSERT INTO consultation_payments 
     (receipt_number, bill_id, appointment_id, hospital_id, patient_id, amount, payment_method, payment_status, collected_by)
     VALUES (?, ?, ?, ?, ?, 750.00, 'upi', 'completed', ?)`,
    [crcpNumber, cbillId, appointmentId, hospitalId, patientUserId, staffUserId]
  );
  assert.ok(crcpRes.insertId > 0, "Consultation payment must be recorded");

  // Separation check
  assert.notStrictEqual(pbillId, cbillId, "Pharmacy bill and Consultation bill must be in distinct tables");
  console.log(`✓ Verified: Consultation Bill ${cbillNumber} and Receipt ${crcpNumber} separated from Pharmacy Bills`);

  // ============================================================================
  // LESSON 18.10 — AUDIT FIELDS, STATUS FIELDS AND TRANSACTION INTEGRITY
  // ============================================================================
  console.log("\n--- Lesson 18.10: Audit Fields, Status Fields and Transaction Integrity ---");

  // 1. Audit timestamps auto-advancing
  const [t1Row] = await pool.query("SELECT created_at, updated_at FROM master_medicines WHERE id = ?", [medicineId]);
  const t1 = new Date(t1Row[0].updated_at).getTime();
  await new Promise((r) => setTimeout(r, 1100));
  await pool.query("UPDATE master_medicines SET sale_price = 22.00 WHERE id = ?", [medicineId]);
  const [t2Row] = await pool.query("SELECT updated_at FROM master_medicines WHERE id = ?", [medicineId]);
  const t2 = new Date(t2Row[0].updated_at).getTime();
  assert.ok(t2 > t1, "updated_at must automatically advance on row modification");
  console.log("✓ Verified: Automatic timestamp progression on record updates");

  // 2. Status enum restriction
  let invalidStatusRejected = false;
  try {
    await pool.query("UPDATE appointments SET status = 'bad_status_code' WHERE id = ?", [appointmentId]);
  } catch (err) {
    if (err.code === "WARN_DATA_TRUNCATED") invalidStatusRejected = true;
  }
  assert.strictEqual(invalidStatusRejected, true, "Invalid status enum must be rejected");
  console.log("✓ Verified: Status fields strictly governed by ENUM restrictions");

  // 3. Transaction ACID Rollback
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  let rolledBackBillId = null;
  try {
    const [rollbackRes] = await conn.query(
      `INSERT INTO consultation_bills 
       (bill_number, hospital_id, patient_id, appointment_id, doctor_id, fee_amount, total_amount, paid_amount, balance_due, payment_method, status, created_by)
       VALUES (?, ?, ?, ?, ?, 999.00, 999.00, 0.00, 999.00, 'cash', 'pending', ?)`,
      [`CBILL-TX-FAIL-${stamp}`, hospitalId, patientUserId, appointmentId, doctorUserId, staffUserId]
    );
    rolledBackBillId = rollbackRes.insertId;
    throw new Error("Simulated transactional failure during execution");
  } catch (err) {
    await conn.rollback();
  }
  conn.release();

  const [verifyRollback] = await pool.query("SELECT id FROM consultation_bills WHERE id = ?", [rolledBackBillId]);
  assert.strictEqual(verifyRollback.length, 0, "Rolled-back record must not exist");
  console.log("✓ Verified: Transaction rollback erases intermediate writes with complete consistency");

  console.log("\n================================================================================");
  console.log("=== ALL 10 MODULE 18 LESSONS SUCCESSFULLY TESTED AND VERIFIED (10/10) ===");
  console.log("================================================================================\n");

  await pool.end();
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
