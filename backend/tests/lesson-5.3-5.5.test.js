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

async function get(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lessons 5.3, 5.4 & 5.5");
  console.log(" (Profile Completion, Personal Details, Emergency Contacts,");
  console.log("  Medical History, Allergies & Strict Data Isolation)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const [roles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const [docRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'doctor' LIMIT 1");
    const passHash = await bcrypt.hash("TestPass1234#Secure", 12);

    // Setup Patient 1 (Alice)
    const emailA = `alice.patient_${timestamp}@example.com`;
    const [resA] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
       VALUES (?, 'Alice Sharma', ?, '+91-9876543211', ?, 'active')`,
      [roles[0].id, emailA, passHash]
    );
    const patientAId = resA.insertId;
    await connection.execute(
      `INSERT INTO patient_profiles (user_id, is_profile_completed) VALUES (?, FALSE)`,
      [patientAId]
    );
    const tokenA = jwt.sign(
      { sub: String(patientAId), role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Setup Patient 2 (Bob)
    const emailB = `bob.patient_${timestamp}@example.com`;
    const [resB] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
       VALUES (?, 'Bob Patel', ?, '+91-9876543222', ?, 'active')`,
      [roles[0].id, emailB, passHash]
    );
    const patientBId = resB.insertId;
    await connection.execute(
      `INSERT INTO patient_profiles (user_id, is_profile_completed) VALUES (?, FALSE)`,
      [patientBId]
    );
    const tokenB = jwt.sign(
      { sub: String(patientBId), role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Setup Doctor (Non-patient role)
    const doctorEmail = `dr.test_${timestamp}@h1.com`;
    const [resDoc] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
       VALUES (?, 1, 'Dr. Tester', ?, ?, 'active')`,
      [docRoles[0].id, doctorEmail, passHash]
    );
    const doctorToken = jwt.sign(
      { sub: String(resDoc.insertId), role: "doctor", hospitalId: 1, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Authentication & RBAC Guard
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Profile endpoint RBAC & authentication protection");
    const noAuthRes = await get("/patients/profile");
    assert.strictEqual(noAuthRes.status, 401, "Unauthenticated access must return 401");

    const doctorAccessRes = await get("/patients/profile", doctorToken);
    assert.strictEqual(doctorAccessRes.status, 403, "Non-patient role access to patient self-profile must return 403");
    console.log("  ✓ Unauthenticated access returns 401; non-patient role returns 403 Forbidden");

    // -------------------------------------------------------------------------
    // TEST 2: Initial Profile state & completion tracking
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Fetch initial profile and verify baseline completion status");
    const getResA = await get("/patients/profile", tokenA);
    assert.strictEqual(getResA.status, 200);
    assert.strictEqual(getResA.body.data.id, patientAId);
    assert.strictEqual(getResA.body.data.full_name, "Alice Sharma");
    assert.strictEqual(getResA.body.data.is_profile_completed, false, "Initial profile completion must be false");
    console.log("  ✓ Initial profile retrieved with is_profile_completed = false");

    // -------------------------------------------------------------------------
    // TEST 3: Validation constraints (Future DOB, Invalid blood group, Invalid gender)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Validation rules: Future DOB & Invalid Enums");
    const futureDobRes = await put(
      "/patients/profile",
      { dob: "2099-01-01" }, // Future date
      tokenA
    );
    assert.strictEqual(futureDobRes.status, 400, "Future DOB must be rejected with 400");
    console.log("  ✓ Future date of birth rejected with 400 Bad Request");

    const invalidBgRes = await put(
      "/patients/profile",
      { blood_group: "C+" }, // Invalid blood group
      tokenA
    );
    assert.strictEqual(invalidBgRes.status, 400, "Invalid blood group must be rejected with 400");
    console.log("  ✓ Invalid blood group ('C+') rejected with 400 Bad Request");

    const invalidGenderRes = await put(
      "/patients/profile",
      { gender: "InvalidGender" },
      tokenA
    );
    assert.strictEqual(invalidGenderRes.status, 400, "Invalid gender must be rejected with 400");
    console.log("  ✓ Invalid gender rejected with 400 Bad Request");

    // -------------------------------------------------------------------------
    // TEST 4: Partial Update preserves is_profile_completed = FALSE
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Partial update saves draft without prematurely completing profile");
    const partialRes = await put(
      "/patients/profile",
      {
        dob: "1998-05-12",
        gender: "Female",
        blood_group: "O+",
        // Missing address and emergency contact!
      },
      tokenA
    );
    assert.strictEqual(partialRes.status, 200);
    assert.strictEqual(partialRes.body.data.is_profile_completed, false, "Profile must remain incomplete");
    assert(partialRes.body.data.missing_fields.includes("address_line1"));
    assert(partialRes.body.data.missing_fields.includes("emergency_contact_name"));
    console.log("  ✓ Partial draft saved in MySQL; server strictly kept is_profile_completed = false");

    // -------------------------------------------------------------------------
    // TEST 5: Full profile completion (Personal Details, Emergency Contact & Medical History)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Complete profile submission with all mandatory clinical metrics");
    const fullProfileRes = await put(
      "/patients/profile",
      {
        full_name: "Alice Sharma",
        phone: "+91-9876543211",
        dob: "1998-05-12",
        gender: "Female",
        blood_group: "O+",
        address_line1: "Flat 502, Green Meadows",
        address_line2: "Linking Road, Bandra West",
        city: "Mumbai",
        pincode: "400050",
        emergency_contact_name: "Vikram Sharma",
        emergency_contact_relationship: "Spouse",
        emergency_contact_phone: "+91-9876500001",
        allergies: "Penicillin, Aspirin",
        chronic_conditions: "Mild Asthma",
        past_medical_history: "Appendectomy (2019)",
        current_medicines: "Albuterol inhaler as needed",
        medical_notes: "Prefers morning appointments",
      },
      tokenA
    );

    assert.strictEqual(fullProfileRes.status, 200);
    assert.strictEqual(fullProfileRes.body.data.is_profile_completed, true, "Profile must be marked completed");
    assert.strictEqual(fullProfileRes.body.data.missing_fields.length, 0);

    // Verify database record
    const [dbProfiles] = await connection.execute(
      `SELECT pp.*, u.full_name, u.phone
       FROM patient_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = ? LIMIT 1`,
      [patientAId]
    );

    const profile = dbProfiles[0];
    assert.strictEqual(profile.is_profile_completed, 1);
    assert.strictEqual(profile.blood_group, "O+");
    assert.strictEqual(profile.emergency_contact_name, "Vikram Sharma");
    assert.strictEqual(profile.emergency_contact_phone, "+91-9876500001");
    assert.strictEqual(profile.allergies, "Penicillin, Aspirin");
    assert.strictEqual(profile.chronic_conditions, "Mild Asthma");
    assert.strictEqual(profile.past_medical_history, "Appendectomy (2019)");
    assert.strictEqual(profile.current_medications, "Albuterol inhaler as needed");
    console.log("  ✓ Profile verified: is_profile_completed = true in database");
    console.log("  ✓ Personal details, emergency contact, and medical baseline persisted securely in MySQL");

    // -------------------------------------------------------------------------
    // TEST 6: Strict Data Isolation (Cross-Patient Access Prohibited)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Strict Patient-level Data Isolation");

    // Alice attempts to alter Bob's profile by supplying user_id in payload
    const exploitUpdateRes = await put(
      "/patients/profile",
      {
        user_id: patientBId, // Malicious target ID
        full_name: "Hacked Bob",
        allergies: "Hacked Allergy",
      },
      tokenA // Signed as Alice!
    );
    assert.strictEqual(exploitUpdateRes.status, 200);

    // Verify Bob's profile was NOT modified
    const [bobCheck] = await connection.execute(
      `SELECT u.full_name, pp.allergies
       FROM users u
       JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [patientBId]
    );
    assert.strictEqual(bobCheck[0].full_name, "Bob Patel", "Bob's name must NOT be changed by Alice");
    assert.strictEqual(bobCheck[0].allergies, null, "Bob's allergies must NOT be changed by Alice");

    // Verify Alice's request updated only her own record
    const [aliceCheck] = await connection.execute(
      `SELECT u.full_name FROM users u WHERE u.id = ? LIMIT 1`,
      [patientAId]
    );
    assert.strictEqual(aliceCheck[0].full_name, "Hacked Bob");
    console.log("  ✓ Cross-patient tamper attempt isolated: user identity derived exclusively from authenticated JWT");

    // -------------------------------------------------------------------------
    // TEST 7: Quick Status Guard endpoint
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Quick Profile Status Guard");
    const statusResA = await get("/patients/profile/status", tokenA);
    assert.strictEqual(statusResA.body.isProfileCompleted, true);

    const statusResB = await get("/patients/profile/status", tokenB);
    assert.strictEqual(statusResB.body.isProfileCompleted, false);
    console.log("  ✓ /patients/profile/status accurately reports completion status for each patient");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSONS 5.3, 5.4 & 5.5 PASSED! ✅");
    console.log("=================================================");
  } finally {
    connection.release();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
