const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
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

async function runTests() {
  console.log("=== Running Module 8 Daily Consultation & Follow-up Test Suite ===");
  const stamp = Date.now();

  // 1. Setup Test Fixtures: Hospital 1, Hospital 2, Doctor 1 (Hosp 1), Doctor 2 (Hosp 2), Patient 1, Patient 2
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M8 Hospital A ${stamp}`, `M8A-${stamp}`, `h1_${stamp}@test.com`, "+91-9876500111"]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M8 Hospital B ${stamp}`, `M8B-${stamp}`, `h2_${stamp}@test.com`, "+91-9876500112"]
  );
  const hospital2Id = h2Res.insertId;

  const [d1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Cardiology', 'active')`,
    [hospital1Id]
  );
  const dept1Id = d1Res.insertId;

  const [docRole] = await pool.query("SELECT id FROM roles WHERE name = 'doctor' LIMIT 1");
  const [patRole] = await pool.query("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
  const pwdHash = await bcrypt.hash("@Password_123", 10);

  // Doctor 1 (Hospital 1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status, token_version)
     VALUES (?, ?, ?, 'Dr. First Consulting', ?, ?, '+91-9876500201', 'active', 1)`,
    [docRole[0].id, hospital1Id, dept1Id, `doc1_${stamp}@test.com`, pwdHash]
  );
  const doctor1Id = doc1Res.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, consultation_fee, experience_years) VALUES (?, 500.00, 10)`,
    [doctor1Id]
  );

  // Setup schedule for doctor 1 (all days available)
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const d of days) {
    await pool.execute(
      `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
       VALUES (?, ?, ?, '09:00:00', '18:00:00', 30, true)`,
      [doctor1Id, hospital1Id, d]
    );
  }

  // Doctor 2 (Hospital 2)
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status, token_version)
     VALUES (?, ?, NULL, 'Dr. Second Hospital', ?, ?, '+91-9876500202', 'active', 1)`,
    [docRole[0].id, hospital2Id, `doc2_${stamp}@test.com`, pwdHash]
  );
  const doctor2Id = doc2Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status, token_version)
     VALUES (?, ?, 'Patient Alice Wonderland', ?, ?, '+91-9876500301', 'active', 1)`,
    [patRole[0].id, hospital1Id, `pat1_${stamp}@test.com`, pwdHash]
  );
  const patient1Id = pat1Res.insertId;
  await pool.execute(
    `INSERT INTO patient_profiles (user_id, gender, blood_group, allergies, chronic_conditions)
     VALUES (?, 'female', 'O+', 'Penicillin', 'Hypertension')`,
    [patient1Id]
  );

  // Patient 2
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status, token_version)
     VALUES (?, ?, 'Patient Bob Builder', ?, ?, '+91-9876500302', 'active', 1)`,
    [patRole[0].id, hospital2Id, `pat2_${stamp}@test.com`, pwdHash]
  );
  const patient2Id = pat2Res.insertId;

  // Tokens
  const doc1Token = jwt.sign(
    { sub: String(doctor1Id), email: `doc1_${stamp}@test.com`, role: "doctor", hospitalId: hospital1Id, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const doc2Token = jwt.sign(
    { sub: String(doctor2Id), email: `doc2_${stamp}@test.com`, role: "doctor", hospitalId: hospital2Id, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const pat1Token = jwt.sign(
    { sub: String(patient1Id), email: `pat1_${stamp}@test.com`, role: "patient", hospitalId: hospital1Id, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const pat2Token = jwt.sign(
    { sub: String(patient2Id), email: `pat2_${stamp}@test.com`, role: "patient", hospitalId: hospital2Id, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Create Appointment 1 (Doctor 1, Patient 1, in_waiting)
  const [apt1Res] = await pool.execute(
    `INSERT INTO appointments
     (appointment_number, patient_id, hospital_id, department_id, doctor_id,
      appointment_date, appointment_time, start_time, end_time, status, queue_number, check_in_time, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00 AM', '10:00:00', '10:30:00', 'in_waiting', 'Q-001', CURRENT_TIMESTAMP, 'Severe chest tightness')`,
    [`APT-M8-01-${stamp}`, patient1Id, hospital1Id, dept1Id, doctor1Id]
  );
  const appointment1Id = apt1Res.insertId;

  // Create Appointment 2 (Doctor 1, Patient 1, cancelled)
  const [apt2Res] = await pool.execute(
    `INSERT INTO appointments
     (appointment_number, patient_id, hospital_id, department_id, doctor_id,
      appointment_date, appointment_time, start_time, end_time, status, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '11:00 AM', '11:00:00', '11:30:00', 'cancelled', 'Cancelled checkup')`,
    [`APT-M8-02-${stamp}`, patient1Id, hospital1Id, dept1Id, doctor1Id]
  );
  const appointment2Id = apt2Res.insertId;

  console.log("✓ Fixtures initialized successfully.");

  // =========================================================================
  // Lesson 8.1 Tests: Starting Consultation from the Doctor Panel
  // =========================================================================
  console.log("\n--- Testing Lesson 8.1: Starting Consultation ---");

  // 1. Unauthorized Doctor 2 attempts to start consultation for Doctor 1's appointment
  const doc2StartRes = await post("/consultations/start", { appointment_id: appointment1Id }, doc2Token);
  assert.strictEqual(doc2StartRes.status, 403, "Doctor 2 must be forbidden from starting Doctor 1's appointment");
  console.log("✓ Doctor 2 forbidden from starting Doctor 1's appointment (HTTP 403)");

  // 2. Doctor attempts to start consultation on an ineligible (cancelled) appointment
  const cancelStartRes = await post("/consultations/start", { appointment_id: appointment2Id }, doc1Token);
  assert.strictEqual(cancelStartRes.status, 400, "Starting consultation on cancelled appointment must be rejected");
  console.log("✓ Starting consultation on cancelled appointment rejected (HTTP 400)");

  // 3. Authorized Doctor 1 starts consultation on eligible appointment 1
  const doc1StartRes = await post("/consultations/start", { appointment_id: appointment1Id }, doc1Token);
  assert.strictEqual(doc1StartRes.status, 200, "Doctor 1 should successfully start consultation");
  assert.strictEqual(doc1StartRes.body.success, true);
  assert.strictEqual(doc1StartRes.body.data.status, "draft");
  const consultation1Id = doc1StartRes.body.data.id;
  console.log(`✓ Consultation started successfully (ID: ${consultation1Id}, Status: draft)`);

  // Verify appointment transitioned to in_progress in database
  const [apptCheck] = await pool.query("SELECT status FROM appointments WHERE id = ?", [appointment1Id]);
  assert.strictEqual(apptCheck[0].status, "in_progress", "Appointment status must transition to in_progress");
  console.log("✓ Appointment transitioned to 'in_progress'");

  // 4. Repeated call to start on same appointment returns existing consultation without duplicates
  const repeatStartRes = await post("/consultations/start", { appointment_id: appointment1Id }, doc1Token);
  assert.strictEqual(repeatStartRes.status, 200);
  assert.strictEqual(repeatStartRes.body.data.id, consultation1Id, "Duplicate consultation prevented");
  console.log("✓ Duplicate active consultation safely prevented");

  // =========================================================================
  // Lesson 8.2 & 8.6 Tests: Mandatory Fields & Draft vs Final Documentation
  // =========================================================================
  console.log("\n--- Testing Lesson 8.2 & 8.6: Consultation Workflow & Mandatory Fields ---");

  // 1. Submit consultation immediately without mandatory fields -> Must be rejected
  const prematureSubmitRes = await post(`/consultations/${consultation1Id}/submit`, {}, doc1Token);
  assert.strictEqual(prematureSubmitRes.status, 400, "Submission without mandatory fields must be rejected");
  assert.strictEqual(prematureSubmitRes.body.errors.length >= 4, true, "Returns field-specific errors");
  console.log("✓ Submitting without mandatory fields rejected with field-specific errors (HTTP 400)");

  // 2. Save partial draft (should succeed without requiring all mandatory fields)
  const saveDraftRes = await put(`/consultations/${consultation1Id}`, {
    chief_complaint: "Acute retrosternal chest pain radiating to left arm",
    symptoms: "Shortness of breath, diaphoresis",
    patient_condition: "guarded",
  }, doc1Token);
  assert.strictEqual(saveDraftRes.status, 200, "Saving partial draft must succeed");
  console.log("✓ Partial draft saved successfully");

  // =========================================================================
  // Lesson 8.3 Tests: Recording Clinical Details & Vital Signs
  // =========================================================================
  console.log("\n--- Testing Lesson 8.3: Recording Clinical Details & Vital Signs ---");

  // 1. Invalid vital signs (e.g. SpO2 120%, pulse 300) -> Rejected
  const invalidVitalsRes = await put(`/consultations/${consultation1Id}`, {
    vitals: {
      pulse_rate: 350,
      oxygen_saturation: 110,
    },
  }, doc1Token);
  assert.strictEqual(invalidVitalsRes.status, 400, "Out-of-range vitals must be rejected");
  console.log("✓ Out-of-bounds vital signs rejected (HTTP 400)");

  // 2. Valid vital signs -> Persisted and BMI computed
  const validVitalsRes = await put(`/consultations/${consultation1Id}`, {
    vitals: {
      systolic_bp: 135,
      diastolic_bp: 88,
      pulse_rate: 82,
      temperature: 98.6,
      respiratory_rate: 18,
      oxygen_saturation: 98,
      height_cm: 175,
      weight_kg: 78,
    },
  }, doc1Token);
  assert.strictEqual(validVitalsRes.status, 200, "Valid vitals should save successfully");

  // Verify vitals & BMI calculation in DB
  const [vitalsDb] = await pool.query(
    "SELECT * FROM consultation_vitals WHERE consultation_id = ?",
    [consultation1Id]
  );
  assert.strictEqual(vitalsDb.length, 1);
  assert.strictEqual(vitalsDb[0].systolic_bp, 135);
  assert.strictEqual(Number(vitalsDb[0].bmi), 25.5, "BMI accurately calculated: 78 / (1.75^2) = 25.5");
  console.log("✓ Vital signs stored and BMI calculated accurately (BMI: 25.5)");

  // =========================================================================
  // Lesson 8.4 Tests: Managing Laboratory & Investigation Requests
  // =========================================================================
  console.log("\n--- Testing Lesson 8.4: Laboratory & Investigation Requests ---");

  // Fetch lab catalog
  const labCatRes = await get("/consultations/masters/lab-tests", doc1Token);
  assert.strictEqual(labCatRes.status, 200);
  assert.strictEqual(labCatRes.body.data.length >= 10, true);
  console.log(`✓ Master lab catalog retrieved (${labCatRes.body.data.length} tests available)`);

  // Request ECG and Troponin I for this patient
  const labReqRes = await put(`/consultations/${consultation1Id}`, {
    investigations: [
      { test_name: "ECG 12-Lead Standard", test_category: "Cardiology Diagnostics", priority: "stat", clinical_notes: "Rule out acute coronary syndrome" },
      { test_name: "Troponin I (High Sensitivity)", test_category: "Cardiology Biomarkers", priority: "urgent", clinical_notes: "Chest pain onset 2 hours ago" },
    ],
  }, doc1Token);
  assert.strictEqual(labReqRes.status, 200);

  const [invDb] = await pool.query(
    "SELECT * FROM investigation_requests WHERE consultation_id = ?",
    [consultation1Id]
  );
  assert.strictEqual(invDb.length, 2);
  assert.strictEqual(invDb[0].priority, "stat");
  assert.strictEqual(invDb[0].status, "requested");
  console.log("✓ Investigation requests saved with status 'requested' and priority 'stat'");

  // =========================================================================
  // Lesson 8.5 Tests: Creating Daily Prescriptions
  // =========================================================================
  console.log("\n--- Testing Lesson 8.5: Creating Daily Prescriptions ---");

  // Fetch medicines catalog
  const medCatRes = await get("/consultations/masters/medicines", doc1Token);
  assert.strictEqual(medCatRes.status, 200);
  assert.strictEqual(medCatRes.body.data.length >= 10, true);
  console.log(`✓ Master medicine catalog retrieved (${medCatRes.body.data.length} medicines available)`);

  // Create prescription with items
  const rxRes = await put(`/consultations/${consultation1Id}`, {
    prescription: {
      general_instructions: "Take medications with water. Avoid heavy physical exertion.",
      items: [
        {
          medicine_name: "Atorvastatin",
          dosage: "20 mg",
          form: "Tablet",
          frequency: "0-0-1",
          duration: "30 Days",
          timing: "after_food",
          quantity: 30,
          instructions: "Bedtime dose",
        },
        {
          medicine_name: "Amlodipine",
          dosage: "5 mg",
          form: "Tablet",
          frequency: "1-0-0",
          duration: "30 Days",
          timing: "after_food",
          quantity: 30,
          instructions: "Morning with breakfast",
        },
      ],
    },
  }, doc1Token);
  assert.strictEqual(rxRes.status, 200);

  const [rxDb] = await pool.query(
    "SELECT p.*, count(pi.id) as item_count FROM prescriptions p JOIN prescription_items pi ON pi.prescription_id = p.id WHERE p.consultation_id = ? GROUP BY p.id",
    [consultation1Id]
  );
  assert.strictEqual(rxDb.length, 1);
  assert.strictEqual(rxDb[0].item_count, 2);
  console.log(`✓ Prescription created with ${rxDb[0].item_count} items without inventory deduction`);

  // =========================================================================
  // Lesson 8.8 Tests: Submitting Consultation Before Completing Appointment
  // =========================================================================
  console.log("\n--- Testing Lesson 8.8: Consultation Submission Before Completion Rule ---");

  // 1. Attempting to directly complete appointment via status PATCH when consultation is still DRAFT -> Must be REJECTED!
  const directCompleteRes = await patch(`/appointments/${appointment1Id}/status`, { status: "completed" }, doc1Token);
  assert.strictEqual(directCompleteRes.status, 400, "Direct appointment completion must be blocked if consultation is draft");
  assert.strictEqual(directCompleteRes.body.message.includes("consultation must be"), true);
  console.log("✓ Direct completion rejected: 'A consultation must be successfully submitted...' (HTTP 400)");

  // 2. Submit consultation with full mandatory fields
  const fullSubmitRes = await post(`/consultations/${consultation1Id}/submit`, {
    chief_complaint: "Acute retrosternal chest pain radiating to left arm",
    examination_findings: "S1/S2 audible, no murmurs, lungs clear to auscultation, peripheral pulses intact",
    diagnosis: "Unstable Angina / Acute Coronary Syndrome (Rule Out)",
    treatment_plan: "Dual antiplatelet therapy, statin, inpatient cardiology observation recommended",
    advice: "Complete rest, immediate ECG and cardiac enzymes",
    patient_condition: "stable",
    admission_recommended: true,
    admission_notes: "Recommend CCU observation for continuous cardiac monitoring",
  }, doc1Token);
  assert.strictEqual(fullSubmitRes.status, 200, "Full consultation submission must succeed");

  const [cSubmitted] = await pool.query("SELECT status, submitted_at FROM consultations WHERE id = ?", [consultation1Id]);
  assert.strictEqual(cSubmitted[0].status, "submitted");
  assert.notStrictEqual(cSubmitted[0].submitted_at, null);
  console.log("✓ Consultation successfully submitted");

  // 3. Now that consultation is submitted, completing the appointment succeeds!
  const validCompleteRes = await patch(`/appointments/${appointment1Id}/status`, { status: "completed" }, doc1Token);
  assert.strictEqual(validCompleteRes.status, 200, "Appointment completion succeeds after consultation submitted");
  console.log("✓ Appointment successfully marked completed after consultation submission");

  // =========================================================================
  // Lesson 8.7 Tests: Creating Follow-up Appointments
  // =========================================================================
  console.log("\n--- Testing Lesson 8.7: Follow-up Appointment Integration ---");

  // Tomorrow date string
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const followUpRes = await post("/appointments/follow-up", {
    previous_appointment_id: appointment1Id,
    appointment_date: tomorrowStr,
    appointment_time: "10:00 AM",
    reason: "Post-consultation follow-up review for ECG and cardiac enzymes",
  }, doc1Token);

  assert.strictEqual(followUpRes.status, 201, "Follow-up appointment should be created successfully");
  assert.strictEqual(followUpRes.body.data.appointment_type, "follow_up");
  assert.strictEqual(followUpRes.body.data.follow_up_to_id, appointment1Id);
  console.log(`✓ Follow-up appointment scheduled (ID: ${followUpRes.body.data.id}, linked to Appointment ${appointment1Id})`);

  // =========================================================================
  // Lesson 8.9 Tests: Consultation History & Patient Treatment Records
  // =========================================================================
  console.log("\n--- Testing Lesson 8.9: Consultation History & Patient Records ---");

  // 1. Patient 1 views their own history -> Success
  const patHistoryRes = await get(`/consultations/patient/${patient1Id}/history`, pat1Token);
  assert.strictEqual(patHistoryRes.status, 200);
  assert.strictEqual(patHistoryRes.body.count >= 1, true);
  assert.strictEqual(patHistoryRes.body.data[0].diagnosis, "Unstable Angina / Acute Coronary Syndrome (Rule Out)");
  assert.strictEqual(patHistoryRes.body.data[0].vitals.systolic_bp, 135);
  assert.strictEqual(patHistoryRes.body.data[0].prescription.items.length, 2);
  console.log("✓ Patient 1 successfully accessed their clinical consultation history");

  // 2. Patient 2 attempts to view Patient 1's history -> IDOR blocked (HTTP 403)
  const idorRes = await get(`/consultations/patient/${patient1Id}/history`, pat2Token);
  assert.strictEqual(idorRes.status, 403, "Cross-patient history access must be forbidden");
  console.log("✓ Cross-patient consultation history access blocked (HTTP 403)");

  // 3. Doctor 2 (Hospital 2) attempts to view Patient 1's history in Hospital 1 -> Cross-hospital blocked
  const crossHospRes = await get(`/consultations/patient/${patient1Id}/history`, doc2Token);
  assert.strictEqual(crossHospRes.status, 200);
  assert.strictEqual(crossHospRes.body.count, 0, "Doctor 2 from Hospital 2 sees 0 records for Hospital 1 patient");
  console.log("✓ Cross-hospital consultation history isolation verified");

  // =========================================================================
  // Lesson 8.10 Tests: Separating Consultation from Admission Workflow
  // =========================================================================
  console.log("\n--- Testing Lesson 8.10: Separating Consultation from Admission Workflow ---");

  // Check appointment 1 status in database: it should be 'completed', NOT 'admitted'
  const [apt1Final] = await pool.query("SELECT status FROM appointments WHERE id = ?", [appointment1Id]);
  assert.strictEqual(apt1Final[0].status, "completed", "Outpatient appointment status must remain completed");

  // Check consultation record: admission_recommended is true, but patient is NOT admitted to an inpatient ward
  const [c1Final] = await pool.query(
    "SELECT admission_recommended, admission_notes FROM consultations WHERE id = ?",
    [consultation1Id]
  );
  assert.strictEqual(Boolean(c1Final[0].admission_recommended), true);
  assert.strictEqual(c1Final[0].admission_notes, "Recommend CCU observation for continuous cardiac monitoring");
  console.log("✓ Admission recommendation recorded without automatically altering appointment to admitted or assigning beds");

  console.log("\n=========================================================================");
  console.log("✓ ALL MODULE 8 (LESSONS 8.1 - 8.10) AUTOMATED BACKEND TESTS PASSED!");
  console.log("=========================================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
