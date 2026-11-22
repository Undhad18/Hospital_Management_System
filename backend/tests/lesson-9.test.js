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
  console.log("=== Running Module 9 Patient Admission Management Test Suite ===");
  const stamp = Date.now();

  // 1. Setup Test Fixtures:
  // - Hospital 1 & Hospital 2
  // - Department 1 (Hosp 1) & Department 2 (Hosp 2)
  // - Doctor 1 (Hosp 1, Dept 1) & Doctor 2 (Hosp 2, Dept 2)
  // - Hospital Admin 1 (Hosp 1)
  // - Staff 1 (Hosp 1)
  // - Patient 1 & Patient 2

  // Roles
  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  // Hospitals
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M9 Hospital Alpha ${stamp}`, `M9A-${stamp}`, `h1_${stamp}@test.com`, "+91-9876500111"]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M9 Hospital Beta ${stamp}`, `M9B-${stamp}`, `h2_${stamp}@test.com`, "+91-9876500222"]
  );
  const hospital2Id = h2Res.insertId;

  // Departments
  const [d1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Cardiology Inpatient', 'active')`,
    [hospital1Id]
  );
  const dept1Id = d1Res.insertId;

  const [d2Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Neurology Inpatient', 'active')`,
    [hospital2Id]
  );
  const dept2Id = d2Res.insertId;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Doctor 1 (Hospital 1, Dept 1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, dept1Id, `Dr. M9 Physician ${stamp}`, `dr1_${stamp}@test.com`, passwordHash]
  );
  const doctor1Id = doc1Res.insertId;

  // Doctor 2 (Hospital 2, Dept 2)
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital2Id, dept2Id, `Dr. M9 Beta Doc ${stamp}`, `dr2_${stamp}@test.com`, passwordHash]
  );
  const doctor2Id = doc2Res.insertId;

  // Hospital Admin 1 (Hospital 1)
  const [admin1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `M9 Hosp Admin ${stamp}`, `admin1_${stamp}@test.com`, passwordHash]
  );
  const admin1Id = admin1Res.insertId;

  // Staff 1 (Hospital 1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `M9 FrontDesk Staff ${stamp}`, `staff1_${stamp}@test.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `M9 Patient Alpha ${stamp}`, `pat1_${stamp}@test.com`, "+91-9876543210", passwordHash]
  );
  const patient1Id = pat1Res.insertId;

  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, is_profile_completed)
     VALUES (?, '1990-05-15', 'male', 'O+', TRUE)`,
    [patient1Id]
  );

  // Patient 2
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `M9 Patient Beta ${stamp}`, `pat2_${stamp}@test.com`, "+91-9876543211", passwordHash]
  );
  const patient2Id = pat2Res.insertId;

  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, is_profile_completed)
     VALUES (?, '1995-08-20', 'female', 'A+', TRUE)`,
    [patient2Id]
  );

  // JWT Tokens
  const tokenAdmin1 = jwt.sign({ sub: admin1Id }, JWT_SECRET, { expiresIn: "1h" });
  const tokenStaff1 = jwt.sign({ sub: staff1Id }, JWT_SECRET, { expiresIn: "1h" });
  const tokenDoctor1 = jwt.sign({ sub: doctor1Id }, JWT_SECRET, { expiresIn: "1h" });
  const tokenPatient1 = jwt.sign({ sub: patient1Id }, JWT_SECRET, { expiresIn: "1h" });

  console.log("✓ Fixtures created successfully");

  // ============================================================================
  // Lesson 9.1: Patient Admission Workflow
  // ============================================================================
  console.log("\n--- Testing Lesson 9.1: Patient Admission Workflow ---");

  // Test 9.1.1: Missing required fields rejected with 400
  const missingFieldRes = await post("/admissions", {
    patient_id: patient1Id,
    hospital_id: hospital1Id,
    // missing doctor_id, department_id, admission_date, reason
  }, tokenStaff1);
  assert.strictEqual(missingFieldRes.status, 400);
  assert.strictEqual(missingFieldRes.body.success, false);
  console.log("✓ Missing required fields rejected with 400");

  // Test 9.1.2: Unauthorized role (Patient) cannot create admission
  const unauthRes = await post("/admissions", {
    patient_id: patient1Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Severe acute chest pain and cardiac observation",
  }, tokenPatient1);
  assert.strictEqual(unauthRes.status, 403);
  console.log("✓ Unauthorized patient role cannot create admission");

  // Test 9.1.3: Authorized Staff creates valid admission
  const validAdmPayload = {
    patient_id: patient1Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Severe acute chest pain requiring inpatient cardiac monitoring",
    initial_status: "admitted",
  };
  const createAdmRes = await post("/admissions", validAdmPayload, tokenStaff1);
  assert.strictEqual(createAdmRes.status, 201);
  assert.strictEqual(createAdmRes.body.success, true);
  assert(createAdmRes.body.data.admission_number.startsWith("ADM-"));
  assert.strictEqual(createAdmRes.body.data.status, "admitted");
  const admission1Id = createAdmRes.body.data.id;
  const admission1Number = createAdmRes.body.data.admission_number;
  console.log(`✓ Admission created successfully: ID ${admission1Id}, Number ${admission1Number}`);

  // Test 9.1.4: Retrieve admission details by ID
  const getAdmRes = await get(`/admissions/${admission1Id}`, tokenStaff1);
  assert.strictEqual(getAdmRes.status, 200);
  assert.strictEqual(getAdmRes.body.data.id, admission1Id);
  assert.strictEqual(getAdmRes.body.data.patient_name, `M9 Patient Alpha ${stamp}`);
  assert.strictEqual(getAdmRes.body.data.doctor_name, `Dr. M9 Physician ${stamp}`);
  assert.strictEqual(getAdmRes.body.data.department_name, "Cardiology Inpatient");
  console.log("✓ Admission details retrieved with enriched patient, doctor, and department details");

  // Test 9.1.5: Patient can view their own admission
  const patientViewRes = await get(`/admissions/${admission1Id}`, tokenPatient1);
  assert.strictEqual(patientViewRes.status, 200);
  assert.strictEqual(patientViewRes.body.data.id, admission1Id);
  console.log("✓ Patient can view their own admission record");

  // ============================================================================
  // Lesson 9.2: Linking Admission to Patient, Hospital, Doctor and Department
  // ============================================================================
  console.log("\n--- Testing Lesson 9.2: Entity Relationships & Validations ---");

  // Test 9.2.1: Nonexistent patient rejected
  const fakePatRes = await post("/admissions", {
    patient_id: 99999999,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Emergency inpatient care required",
  }, tokenStaff1);
  assert.strictEqual(fakePatRes.status, 404);
  console.log("✓ Nonexistent patient rejected with 404");

  // Test 9.2.2: Department belonging to another hospital rejected
  const wrongDeptRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept2Id, // dept2 belongs to hospital 2!
    admission_date: new Date().toISOString(),
    reason: "Emergency neurological observation",
  }, tokenStaff1);
  assert.strictEqual(wrongDeptRes.status, 400);
  assert(wrongDeptRes.body.message.includes("department does not belong"));
  console.log("✓ Department from different hospital rejected");

  // Test 9.2.3: Doctor belonging to another hospital rejected
  const wrongDocRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor2Id, // doctor2 belongs to hospital 2!
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Emergency neurological observation",
  }, tokenStaff1);
  assert.strictEqual(wrongDocRes.status, 400);
  assert(wrongDocRes.body.message.includes("doctor does not belong"));
  console.log("✓ Doctor from different hospital rejected");

  // Test 9.2.4: Cross-hospital data access blocked (Staff 1 cannot admit to Hospital 2)
  const crossHospRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital2Id,
    doctor_id: doctor2Id,
    department_id: dept2Id,
    admission_date: new Date().toISOString(),
    reason: "Emergency inpatient care",
  }, tokenStaff1);
  assert.strictEqual(crossHospRes.status, 403);
  console.log("✓ Cross-hospital admission creation blocked with 403");

  // ============================================================================
  // Lesson 9.3: Admission Date, Time and Reason
  // ============================================================================
  console.log("\n--- Testing Lesson 9.3: Admission Date, Time and Reason ---");

  // Test 9.3.1: Invalid date format rejected
  const invalidDateRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: "invalid-date-string",
    reason: "Observation for high fever",
  }, tokenStaff1);
  assert.strictEqual(invalidDateRes.status, 400);
  assert(invalidDateRes.body.message.includes("Invalid admission date"));
  console.log("✓ Invalid date format rejected");

  // Test 9.3.2: Excessive future date (>30 days) rejected
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);
  const futureDateRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: futureDate.toISOString(),
    reason: "Far future elective admission",
  }, tokenStaff1);
  assert.strictEqual(futureDateRes.status, 400);
  assert(futureDateRes.body.message.includes("more than 30 days"));
  console.log("✓ Far future date rejected with 400");

  // Test 9.3.3: Reason too short (<5 chars) rejected
  const shortReasonRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Sick", // only 4 chars
  }, tokenStaff1);
  assert.strictEqual(shortReasonRes.status, 400);
  assert(shortReasonRes.body.message.includes("at least 5 characters"));
  console.log("✓ Reason too short rejected with 400");

  // ============================================================================
  // Lesson 9.4: Admission Status and Admission History
  // ============================================================================
  console.log("\n--- Testing Lesson 9.4: Status Transitions and Audit History ---");

  // Test 9.4.1: Initial status history exists
  const initialHistRes = await get(`/admissions/${admission1Id}/history`, tokenStaff1);
  assert.strictEqual(initialHistRes.status, 200);
  assert.strictEqual(initialHistRes.body.data.length, 1);
  assert.strictEqual(initialHistRes.body.data[0].new_status, "admitted");
  console.log("✓ Initial status history record confirmed");

  // Test 9.4.2: Invalid status transition rejected (admitted -> pending or cancelled)
  const invalidTransRes = await patch(`/admissions/${admission1Id}/status`, {
    status: "pending",
  }, tokenStaff1);
  assert.strictEqual(invalidTransRes.status, 400);
  assert(invalidTransRes.body.message.includes("Cannot transition"));
  console.log("✓ Invalid transition (admitted -> pending) rejected");

  // Test 9.4.3: Valid status transition (admitted -> discharged)
  const dischargeRes = await patch(`/admissions/${admission1Id}/status`, {
    status: "discharged",
    reason: "Patient stabilized, vital signs normal, prescribed follow-up medications.",
  }, tokenStaff1);
  assert.strictEqual(dischargeRes.status, 200);
  assert.strictEqual(dischargeRes.body.data.status, "discharged");
  assert(dischargeRes.body.data.discharged_at !== null);
  console.log("✓ Patient successfully discharged and discharged_at timestamp recorded");

  // Test 9.4.4: Verify status history now has 2 entries
  const secondHistRes = await get(`/admissions/${admission1Id}/history`, tokenStaff1);
  assert.strictEqual(secondHistRes.status, 200);
  assert.strictEqual(secondHistRes.body.data.length, 2);
  assert.strictEqual(secondHistRes.body.data[1].previous_status, "admitted");
  assert.strictEqual(secondHistRes.body.data[1].new_status, "discharged");
  console.log("✓ Full lifecycle status history preserved with timestamps and changers");

  // Test 9.4.5: Terminal status protection (discharged cannot transition back)
  const reopenRes = await patch(`/admissions/${admission1Id}/status`, {
    status: "admitted",
  }, tokenStaff1);
  assert.strictEqual(reopenRes.status, 400);
  console.log("✓ Terminal state protection: discharged admission cannot be reopened");

  // ============================================================================
  // Lesson 9.5: Preventing Invalid or Duplicate Active Admissions
  // ============================================================================
  console.log("\n--- Testing Lesson 9.5: Duplicate Active Admission Prevention ---");

  // Create an active admission for Patient 2
  const p2AdmRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Acute asthma attack requiring continuous oxygenation",
    initial_status: "admitted",
  }, tokenStaff1);
  assert.strictEqual(p2AdmRes.status, 201);
  const admission2Id = p2AdmRes.body.data.id;
  console.log(`✓ Active admission created for Patient 2 (ID ${admission2Id})`);

  // Attempt duplicate active admission for Patient 2 -> Must be rejected with 409 Conflict
  const dupAdmRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Duplicate admission attempt while already admitted",
  }, tokenStaff1);
  assert.strictEqual(dupAdmRes.status, 409);
  assert.strictEqual(dupAdmRes.body.success, false);
  assert(dupAdmRes.body.message.includes("already has an active admission"));
  console.log("✓ Duplicate active admission rejected with 409 Conflict");

  // Readmission after discharge: Patient 1 was discharged above; admitting Patient 1 again should succeed!
  const reAdmitPatient1Res = await post("/admissions", {
    patient_id: patient1Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "New subsequent admission for elective valve surgery",
    initial_status: "admitted",
  }, tokenStaff1);
  assert.strictEqual(reAdmitPatient1Res.status, 201);
  console.log("✓ Discharged patient can be admitted again in a distinct new admission");

  // ============================================================================
  // Lesson 9.6: Coordinating Admission with Appointment Status
  // ============================================================================
  console.log("\n--- Testing Lesson 9.6: Coordinating Admission with Appointment ---");

  // Create an appointment for Patient 2
  const todayStr = new Date().toISOString().split("T")[0];
  const [aptRes] = await pool.execute(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, appointment_type, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '11:00 AM', 'consultation', 'in_progress', 'Pre-admission consultation')`,
    [`APT-M9-${stamp}`, patient2Id, hospital1Id, dept1Id, doctor1Id, todayStr]
  );
  const appointmentId = aptRes.insertId;

  // Discharge patient 2's previous active admission first so we can admit linked to appointment
  await patch(`/admissions/${admission2Id}/status`, {
    status: "discharged",
    reason: "Stabilized before transfer",
  }, tokenStaff1);

  // Now admit Patient 2 linking the in_progress appointment
  const linkedAdmRes = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    appointment_id: appointmentId,
    admission_date: new Date().toISOString(),
    reason: "Admitted directly from outpatient consultation",
    initial_status: "admitted",
  }, tokenStaff1);
  assert.strictEqual(linkedAdmRes.status, 201);

  // Check appointment status in database: It must have transitioned to 'admitted'!
  const [aptCheck] = await pool.execute(
    "SELECT status FROM appointments WHERE id = ?",
    [appointmentId]
  );
  assert.strictEqual(aptCheck[0].status, "admitted");
  console.log("✓ Linked appointment atomically coordinated to 'admitted' status in database");

  // Test active-check endpoint (Lesson 9.5 helper)
  const activeCheckRes = await get(`/admissions/active-check/${patient2Id}`, tokenStaff1);
  assert.strictEqual(activeCheckRes.status, 200);
  assert.strictEqual(activeCheckRes.body.hasActiveAdmission, true);
  console.log("✓ Active admission check endpoint reports active status correctly");

  console.log("\n========================================================");
  console.log("🎉 ALL MODULE 9 (LESSONS 9.1 - 9.6) TESTS PASSED SUCCESSFULLY!");
  console.log("========================================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
