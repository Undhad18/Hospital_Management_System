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

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 5.7");
  console.log(" (Patient Medical Records, Privacy & IDOR Protection)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const passHash = await bcrypt.hash("SecureTest1234#", 12);

    // Fetch Roles
    const [roles] = await connection.execute("SELECT id, name FROM roles");
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    // 1. Create Patient A
    const patientAEmail = `patient_a_${timestamp}@example.com`;
    const [patARes] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Patient Alice', ?, ?, 'active')`,
      [roleMap.patient, patientAEmail, passHash]
    );
    const patientAId = patARes.insertId;
    const tokenPatientA = jwt.sign(
      { sub: String(patientAId), email: patientAEmail, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Create Patient B
    const patientBEmail = `patient_b_${timestamp}@example.com`;
    const [patBRes] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Patient Bob', ?, ?, 'active')`,
      [roleMap.patient, patientBEmail, passHash]
    );
    const patientBId = patBRes.insertId;
    const tokenPatientB = jwt.sign(
      { sub: String(patientBId), email: patientBEmail, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Create Doctor in Hospital 1
    const doctorH1Email = `doctor_h1_${timestamp}@hospital1.com`;
    const [docH1Res] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
       VALUES (?, 1, 'Dr. Smith (H1)', ?, ?, 'active')`,
      [roleMap.doctor, doctorH1Email, passHash]
    );
    const doctorH1Id = docH1Res.insertId;
    const tokenDoctorH1 = jwt.sign(
      { sub: String(doctorH1Id), email: doctorH1Email, role: "doctor", hospitalId: 1, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 4. Create Doctor in Hospital 2
    const doctorH2Email = `doctor_h2_${timestamp}@hospital2.com`;
    const [docH2Res] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
       VALUES (?, 2, 'Dr. Jones (H2)', ?, ?, 'active')`,
      [roleMap.doctor, doctorH2Email, passHash]
    );
    const doctorH2Id = docH2Res.insertId;
    const tokenDoctorH2 = jwt.sign(
      { sub: String(doctorH2Id), email: doctorH2Email, role: "doctor", hospitalId: 2, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // -------------------------------------------------------------
    // TEST 1: Patient cannot self-create clinical medical records
    // -------------------------------------------------------------
    console.log("Test 1: Patient self-creation prevention (403 Forbidden)...");
    const selfCreateRes = await post(
      "/patients/medical-records",
      {
        patient_id: patientAId,
        record_type: "consultation",
        title: "Self Diagnosis",
        diagnosis: "Self-prescribed medication",
      },
      tokenPatientA
    );
    assert.strictEqual(
      selfCreateRes.status,
      403,
      `Expected 403 Forbidden for patient attempting to create medical record, got ${selfCreateRes.status}`
    );
    console.log("  PASS: Patient cannot self-create clinical medical records.\n");

    // -------------------------------------------------------------
    // TEST 2: Validation check - missing fields or invalid record_type
    // -------------------------------------------------------------
    console.log("Test 2: Validation check on record creation (400 Bad Request)...");
    const invalidTypeRes = await post(
      "/patients/medical-records",
      {
        patient_id: patientAId,
        record_type: "invalid_type",
        title: "Annual Checkup",
      },
      tokenDoctorH1
    );
    assert.strictEqual(
      invalidTypeRes.status,
      400,
      `Expected 400 for invalid record_type, got ${invalidTypeRes.status}`
    );

    const missingTitleRes = await post(
      "/patients/medical-records",
      {
        patient_id: patientAId,
        record_type: "consultation",
        title: "",
      },
      tokenDoctorH1
    );
    assert.strictEqual(
      missingTitleRes.status,
      400,
      `Expected 400 for missing title, got ${missingTitleRes.status}`
    );
    console.log("  PASS: Request validation blocks invalid record types and missing titles.\n");

    // -------------------------------------------------------------
    // TEST 3: Doctor in Hospital 1 creates medical record for Patient A
    // -------------------------------------------------------------
    console.log("Test 3: Authorized Doctor in Hospital 1 creates medical record (201 Created)...");
    const createRes = await post(
      "/patients/medical-records",
      {
        patient_id: patientAId,
        record_type: "consultation",
        title: "Routine Health Screening",
        diagnosis: "Mild Seasonal Rhinitis",
        doctor_notes: "Advised hydration, prescribed antihistamines for 5 days.",
      },
      tokenDoctorH1
    );
    assert.strictEqual(
      createRes.status,
      201,
      `Expected 201 Created, got ${createRes.status}: ${JSON.stringify(createRes.body)}`
    );
    assert.strictEqual(createRes.body.success, true);
    const createdRecordId = createRes.body.data.id;
    assert.ok(createdRecordId, "Expected record ID in response");
    console.log(`  PASS: Record #${createdRecordId} created successfully.\n`);

    // -------------------------------------------------------------
    // TEST 4: Patient A views own medical records list & single record
    // -------------------------------------------------------------
    console.log("Test 4: Patient A accesses own medical records...");
    const listRes = await get("/patients/medical-records", tokenPatientA);
    assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}`);
    assert.strictEqual(listRes.body.success, true);
    assert.ok(Array.isArray(listRes.body.data), "Expected data array");
    const found = listRes.body.data.find((r) => r.id === createdRecordId);
    assert.ok(found, "Patient A should see their newly created medical record");
    assert.strictEqual(found.title, "Routine Health Screening");

    const singleRes = await get(`/patients/medical-records/${createdRecordId}`, tokenPatientA);
    assert.strictEqual(singleRes.status, 200, `Expected 200, got ${singleRes.status}`);
    assert.strictEqual(singleRes.body.data.diagnosis, "Mild Seasonal Rhinitis");
    console.log("  PASS: Patient A correctly accesses their own record.\n");

    // -------------------------------------------------------------
    // TEST 5: IDOR Prevention - Patient B tries to access Patient A's record
    // -------------------------------------------------------------
    console.log("Test 5: IDOR Prevention - Patient B attempts access to Patient A's record (403 Forbidden)...");
    const idorRes = await get(`/patients/medical-records/${createdRecordId}`, tokenPatientB);
    assert.strictEqual(
      idorRes.status,
      403,
      `Expected 403 Forbidden for IDOR violation, got ${idorRes.status}`
    );
    assert.strictEqual(idorRes.body.success, false);
    assert.ok(
      idorRes.body.message.includes("Access Denied"),
      `Expected Access Denied message, got: ${idorRes.body.message}`
    );
    console.log("  PASS: IDOR attempt by foreign patient blocked with 403 Forbidden.\n");

    // -------------------------------------------------------------
    // TEST 6: Multi-tenant Isolation - Doctor in Hospital 2 tries to access Hospital 1's record
    // -------------------------------------------------------------
    console.log("Test 6: Cross-Hospital Isolation - Doctor in Hospital 2 accesses Hospital 1's record (403 Forbidden)...");
    const crossHospitalRes = await get(`/patients/medical-records/${createdRecordId}`, tokenDoctorH2);
    assert.strictEqual(
      crossHospitalRes.status,
      403,
      `Expected 403 Forbidden for cross-hospital violation, got ${crossHospitalRes.status}`
    );
    assert.strictEqual(crossHospitalRes.body.success, false);
    assert.ok(
      crossHospitalRes.body.message.includes("Cross-hospital"),
      `Expected Cross-hospital error message, got: ${crossHospitalRes.body.message}`
    );
    console.log("  PASS: Cross-hospital record access blocked with 403 Forbidden.\n");

    console.log("=================================================");
    console.log(" ALL 6 TESTS IN LESSON 5.7 PASSED SUCCESSFULLY! ");
    console.log("=================================================");
  } finally {
    connection.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
