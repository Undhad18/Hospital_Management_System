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
  console.log("=== Running Lesson 6.1 Automated Test Suite ===");
  const stamp = Date.now();

  // 1. Setup Test Hospital, Departments, and Doctors
  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L61 Hospital ${stamp}`, `L61-${stamp}`, `hosp_${stamp}@test.com`, "+91-9876500001"]
  );
  const hospitalId = hospRes.insertId;

  // Insert Department A and Department B
  const [deptARes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Cardiology Dept', 'Heart and vascular care', 'active')`,
    [hospitalId]
  );
  const deptAId = deptARes.insertId;

  const [deptBRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Neurology Dept', 'Brain and nervous system', 'active')`,
    [hospitalId]
  );
  const deptBId = deptBRes.insertId;

  // Fetch doctor and patient roles
  const [docRoleRows] = await pool.execute("SELECT id FROM roles WHERE name = 'doctor' LIMIT 1");
  const docRoleId = docRoleRows[0].id;
  const [patRoleRows] = await pool.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
  const patRoleId = patRoleRows[0].id;

  const passwordHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Insert Doctor 1 in Dept A
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Alice Cardio', ?, ?, '+91-9876500002', 'active')`,
    [docRoleId, hospitalId, deptAId, `alice_${stamp}@test.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee, bio)
     VALUES (?, 'Cardiologist', 'MBBS, MD Cardiology', 12, 750.00, 'Experienced heart specialist')`,
    [doc1Id]
  );

  // Insert Schedule for Doctor 1 (Monday & Wednesday)
  await pool.execute(
    `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
     VALUES (?, ?, 'monday', '09:00:00', '13:00:00', 30, TRUE),
            (?, ?, 'wednesday', '14:00:00', '18:00:00', 30, TRUE)`,
    [doc1Id, hospitalId, doc1Id, hospitalId]
  );

  // Insert Doctor 2 in Dept B
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Bob Neuro', ?, ?, '+91-9876500003', 'active')`,
    [docRoleId, hospitalId, deptBId, `bob_${stamp}@test.com`, passwordHash]
  );
  const doc2Id = doc2Res.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee, bio)
     VALUES (?, 'Neurologist', 'MBBS, DM Neurology', 8, 900.00, 'Brain specialist')`,
    [doc2Id]
  );

  // Insert Patient User with completed profile
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Test Patient 6.1', ?, ?, '+91-9876500004', 'active')`,
    [patRoleId, `patient_${stamp}@test.com`, passwordHash]
  );
  const patientId = patRes.insertId;

  await pool.execute(
    `INSERT INTO patient_profiles (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
     VALUES (?, '1990-05-15', 'male', 'O+', '123 Baker Street', 'Jane Doe', '+91-9876500005', TRUE)`,
    [patientId]
  );

  const patientToken = jwt.sign(
    { sub: String(patientId), email: `patient_${stamp}@test.com`, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // TEST 1: GET /api/appointments/hospitals
    console.log("TEST 1: Listing hospitals for appointment selection...");
    const hospList = await get("/appointments/hospitals", patientToken);
    assert.strictEqual(hospList.status, 200);
    assert.ok(Array.isArray(hospList.body.data));
    const foundHosp = hospList.body.data.find((h) => h.id === hospitalId);
    assert.ok(foundHosp, "Newly created hospital should appear in the selection list");
    console.log("✓ TEST 1 Passed: Hospital selection returns active facilities.");

    // TEST 2: GET /api/appointments/departments requires hospital_id
    console.log("TEST 2: Department filtering requires hospital_id...");
    const deptNoHosp = await get("/appointments/departments", patientToken);
    assert.strictEqual(deptNoHosp.status, 400);
    assert.ok(deptNoHosp.body.message.includes("hospital_id is required"));

    const deptWithHosp = await get(`/appointments/departments?hospital_id=${hospitalId}`, patientToken);
    assert.strictEqual(deptWithHosp.status, 200);
    assert.strictEqual(deptWithHosp.body.count, 2);
    const deptNames = deptWithHosp.body.data.map((d) => d.name);
    assert.ok(deptNames.includes("Cardiology Dept"));
    assert.ok(deptNames.includes("Neurology Dept"));
    console.log("✓ TEST 2 Passed: Departments are strictly filtered by hospital.");

    // TEST 3: Doctor cannot be selected without selecting hospital and department first
    console.log("TEST 3: Doctor filtering requires both hospital_id and department_id...");
    const docNoParams = await get("/appointments/doctors", patientToken);
    assert.strictEqual(docNoParams.status, 400);

    const docNoDept = await get(`/appointments/doctors?hospital_id=${hospitalId}`, patientToken);
    assert.strictEqual(docNoDept.status, 400);
    assert.ok(docNoDept.body.message.includes("department_id is required"));

    const docWrongDept = await get(`/appointments/doctors?hospital_id=${hospitalId}&department_id=999999`, patientToken);
    assert.strictEqual(docWrongDept.status, 400);
    assert.ok(docWrongDept.body.message.includes("Department does not belong to the selected hospital or is inactive"));
    console.log("✓ TEST 3 Passed: Doctor endpoint blocks missing hospital/department.");

    // TEST 4: Doctor details must show: name, specialization, qualification, experience, fee, available days/hours
    console.log("TEST 4: Doctor details returned for Department A...");
    const docDeptA = await get(`/appointments/doctors?hospital_id=${hospitalId}&department_id=${deptAId}`, patientToken);
    assert.strictEqual(docDeptA.status, 200);
    assert.strictEqual(docDeptA.body.count, 1);
    const doctor1 = docDeptA.body.data[0];
    assert.strictEqual(doctor1.id, doc1Id);
    assert.strictEqual(doctor1.name, "Dr. Alice Cardio");
    assert.strictEqual(doctor1.specialization, "Cardiologist");
    assert.strictEqual(doctor1.qualification, "MBBS, MD Cardiology");
    assert.strictEqual(doctor1.experience, "12 years");
    assert.strictEqual(doctor1.consultation_fee, 750);
    assert.ok(doctor1.available_days_hours.includes("MON: 09:00-13:00"));
    assert.ok(doctor1.available_days_hours.includes("WED: 14:00-18:00"));
    assert.strictEqual(doctor1.schedules.length, 2);
    console.log("✓ TEST 4 Passed: Doctor details show full credentials, fees, and schedule.");

    // TEST 5: Cross-validation endpoint: doctor belonging to Dept B should fail when validated against Dept A
    console.log("TEST 5: Cross-validating doctor against department mismatch...");
    const mismatchVal = await post(
      "/appointments/validate-selection",
      { hospital_id: hospitalId, department_id: deptAId, doctor_id: doc2Id },
      patientToken
    );
    assert.strictEqual(mismatchVal.status, 400);
    assert.strictEqual(mismatchVal.body.valid, false);
    assert.ok(mismatchVal.body.message.includes("Doctor does not belong to the selected department"));

    const validVal = await post(
      "/appointments/validate-selection",
      { hospital_id: hospitalId, department_id: deptAId, doctor_id: doc1Id },
      patientToken
    );
    assert.strictEqual(validVal.status, 200);
    assert.strictEqual(validVal.body.valid, true);
    assert.strictEqual(validVal.body.doctor.id, doc1Id);
    console.log("✓ TEST 5 Passed: Selection validation correctly detects doctor/department mismatch.");

    // TEST 6: Patient booking rejects mismatch between doctor and department
    console.log("TEST 6: Booking API rejects doctor-department mismatch...");
    const mismatchBooking = await post(
      "/patients/appointments",
      {
        hospital_id: hospitalId,
        department_id: deptAId,
        doctor_id: doc2Id, // Doc 2 belongs to Dept B, not Dept A!
        appointment_date: "2026-11-10",
        appointment_time: "10:00:00",
        reason: "Cardio consultation check",
        payment_method: "cash",
      },
      patientToken
    );
    assert.strictEqual(mismatchBooking.status, 400);
    assert.ok(
      mismatchBooking.body.message.includes("Doctor does not belong to the selected hospital and department"),
      `Expected mismatch message, got: ${mismatchBooking.body.message}`
    );
    console.log("✓ TEST 6 Passed: Patient booking rejected doctor mismatch.");

    console.log("\n=======================================================");
    console.log("ALL LESSON 6.1 TESTS PASSED SUCCESSFULLY! (6 / 6)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup test fixtures
    await pool.execute("DELETE FROM doctor_schedules WHERE doctor_id IN (?, ?)", [doc1Id, doc2Id]);
    await pool.execute("DELETE FROM doctor_profiles WHERE user_id IN (?, ?)", [doc1Id, doc2Id]);
    await pool.execute("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]);
    await pool.execute("DELETE FROM users WHERE id IN (?, ?, ?)", [doc1Id, doc2Id, patientId]);
    await pool.execute("DELETE FROM departments WHERE id IN (?, ?)", [deptAId, deptBId]);
    await pool.execute("DELETE FROM hospitals WHERE id = ?", [hospitalId]);
  }
}

runTests()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Lesson 6.1 Test Suite Failed:", err);
    await pool.end();
    process.exit(1);
  });
