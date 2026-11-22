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

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 5.6");
  console.log(" (Patient Registration by Hospital Staff & RBAC Scoping)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const passHash = await bcrypt.hash("StaffSecure1234#", 12);

    // Fetch Roles
    const [roles] = await connection.execute("SELECT id, name FROM roles");
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    // Fetch Receptionist Designation
    const [receptionistDes] = await connection.execute(
      "SELECT id FROM designations WHERE name = 'Receptionist' LIMIT 1"
    );
    const receptionDesId = receptionistDes.length ? receptionistDes[0].id : null;

    // Fetch Accountant Designation
    const [accountantDes] = await connection.execute(
      "SELECT id FROM designations WHERE name = 'Accountant' LIMIT 1"
    );
    const accountantDesId = accountantDes.length ? accountantDes[0].id : null;

    // 1. Create Authorized Receptionist in Hospital 1
    const receptionistEmail = `receptionist_${timestamp}@h1.com`;
    const [recUserRes] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, designation_id, full_name, email, password_hash, status)
       VALUES (?, 1, ?, 'Maya Receptionist', ?, ?, 'active')`,
      [roleMap.staff, receptionDesId, receptionistEmail, passHash]
    );
    const receptionistId = recUserRes.insertId;
    await connection.execute(
      `INSERT INTO staff_profiles (user_id, permissions) VALUES (?, ?)`,
      [receptionistId, JSON.stringify(["patient_registration", "appointment_booking"])]
    );
    const receptionistToken = jwt.sign(
      { sub: String(receptionistId), role: "staff", hospitalId: 1, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Create Unauthorized Staff (Accountant without patient_registration)
    const accountantEmail = `accountant_${timestamp}@h1.com`;
    const [accUserRes] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, designation_id, full_name, email, password_hash, status)
       VALUES (?, 1, ?, 'Amit Accountant', ?, ?, 'active')`,
      [roleMap.staff, accountantDesId, accountantEmail, passHash]
    );
    const accountantId = accUserRes.insertId;
    await connection.execute(
      `INSERT INTO staff_profiles (user_id, permissions) VALUES (?, ?)`,
      [accountantId, JSON.stringify(["invoice_generation", "payment_collection"])]
    );
    const accountantToken = jwt.sign(
      { sub: String(accountantId), role: "staff", hospitalId: 1, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Create Hospital Admin in Hospital 1
    const hAdminEmail = `hadmin_${timestamp}@h1.com`;
    const [hAdminRes] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
       VALUES (?, 1, 'Facility Director', ?, ?, 'active')`,
      [roleMap.hospital_admin, hAdminEmail, passHash]
    );
    const hAdminToken = jwt.sign(
      { sub: String(hAdminRes.insertId), role: "hospital_admin", hospitalId: 1, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Authorized Receptionist registers a walk-in patient
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Authorized Receptionist registers a walk-in patient at Hospital 1");
    const walkinEmail = `walkin.patient_${timestamp}@example.com`;
    const regRes = await post(
      "/staff/patients",
      {
        full_name: "Karan Singh",
        email: walkinEmail,
        phone: "+91-9876500099",
        dob: "1994-06-20",
        gender: "Male",
        blood_group: "B+",
        address_line1: "Sector 14, Vashi",
        emergency_contact_name: "Sunita Singh",
        emergency_contact_phone: "+91-9876500098",
      },
      receptionistToken
    );

    assert.strictEqual(regRes.status, 201, `Expected 201, got ${regRes.status}: ${JSON.stringify(regRes.body)}`);
    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.data.role, "patient");
    assert.strictEqual(regRes.body.data.status, "active", "In-person registration must activate account");
    assert.strictEqual(regRes.body.data.registered_by_staff_id, receptionistId);
    assert.strictEqual(regRes.body.data.hospital_id, 1);
    assert(regRes.body.data.temporary_password, "Temporary password must be generated");

    const newPatientId = regRes.body.data.id;
    const tempPassword = regRes.body.data.temporary_password;

    // Verify DB entry & profile
    const [dbPatients] = await connection.execute(
      `SELECT u.id, u.status, u.must_change_password, pp.registered_by_staff_id, pp.blood_group
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [newPatientId]
    );
    assert.strictEqual(dbPatients[0].status, "active");
    assert.strictEqual(dbPatients[0].must_change_password, 1);
    assert.strictEqual(dbPatients[0].registered_by_staff_id, receptionistId);
    assert.strictEqual(dbPatients[0].blood_group, "B+");

    console.log("  ✓ Patient successfully registered by receptionist with registered_by_staff_id recorded.");
    console.log("  ✓ Generated temporary password & enforced must_change_password = true.");

    // -------------------------------------------------------------------------
    // TEST 2: Patient logs in with the staff-generated temporary password
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Walk-in patient logs in with generated temporary password");
    const loginRes = await post("/auth/login", {
      email: walkinEmail,
      password: tempPassword,
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.role, "patient");
    assert.strictEqual(loginRes.body.user.mustChangePassword, true);
    console.log("  ✓ Walk-in patient successfully logs in to Patient Portal with generated credentials");

    // -------------------------------------------------------------------------
    // TEST 3: Hospital Admin also has authority to register patients
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Hospital Admin registers patient");
    const adminRegRes = await post(
      "/staff/patients",
      {
        full_name: "Pooja Hegde",
        email: `pooja_${timestamp}@example.com`,
        phone: "+91-9876500077",
      },
      hAdminToken
    );
    assert.strictEqual(adminRegRes.status, 201);
    assert.strictEqual(adminRegRes.body.data.registered_by_staff_id, hAdminRes.insertId);
    console.log("  ✓ Hospital Admin successfully authorized to register patients");

    // -------------------------------------------------------------------------
    // TEST 4: Staff without 'patient_registration' permission is blocked
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Staff without 'patient_registration' permission is strictly blocked");
    const unauthStaffRes = await post(
      "/staff/patients",
      {
        full_name: "Illegal Patient",
        email: `illegal_${timestamp}@example.com`,
      },
      accountantToken // Accountant does NOT have patient_registration
    );
    assert.strictEqual(unauthStaffRes.status, 403, "Staff without permission must be rejected with 403");
    console.log("  ✓ Unauthorized staff registration attempt blocked with 403 Forbidden");

    // -------------------------------------------------------------------------
    // TEST 5: Hospital derivation is tamper-proof (ignores client hospital_id)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Hospital derivation tamper protection");
    const tamperRes = await post(
      "/staff/patients",
      {
        full_name: "Tamper Test Patient",
        email: `tamper_${timestamp}@example.com`,
        hospital_id: 9999, // Attempt to forge hospital assignment
      },
      receptionistToken // Token is Hospital 1
    );
    assert.strictEqual(tamperRes.status, 201);
    assert.strictEqual(tamperRes.body.data.hospital_id, 1, "Hospital assignment must come strictly from token (Hospital 1)");
    console.log("  ✓ Client-supplied hospital_id was ignored; facility strictly derived from trusted session token");

    // -------------------------------------------------------------------------
    // TEST 6: Duplicate patient email handled safely
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Duplicate patient email rejected safely");
    const dupRes = await post(
      "/staff/patients",
      {
        full_name: "Duplicate Karan",
        email: walkinEmail, // Already registered in TEST 1
      },
      receptionistToken
    );
    assert.strictEqual(dupRes.status, 409, "Duplicate registration must return 409 Conflict");
    assert.strictEqual(dupRes.body.data.existingUserId, newPatientId);
    console.log("  ✓ Duplicate patient registration rejected with 409 Conflict without creating redundant records");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 5.6 PASSED! ✅");
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
