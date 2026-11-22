const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";

// Helper for local API calls
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
  console.log(" RUNNING TESTS: Lesson 5.1");
  console.log(" (Patient Registration, Password Security, RBAC & Login)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const testPatientEmail = `test.patient_${timestamp}@example.com`;
    const testPassword = "PatientPass1234#Secure";

    // -------------------------------------------------------------------------
    // TEST 1: Valid Patient Self-Registration
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Patient self-registers with valid details");
    const regRes = await post("/auth/register-patient", {
      full_name: "Undhad Harshil",
      email: testPatientEmail,
      password: testPassword,
      phone: "+91-9876543210",
    });

    assert.strictEqual(regRes.status, 201, `Expected 201 Created, got ${regRes.status}: ${JSON.stringify(regRes.body)}`);
    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.data.email, testPatientEmail);
    assert.strictEqual(regRes.body.data.requiresVerification, true);
    assert(!regRes.body.data.password, "Password must not be returned in API response");
    assert(!regRes.body.data.password_hash, "Password hash must not be returned in API response");

    // Inspect database record
    const [dbUsers] = await connection.execute(
      `SELECT u.id, u.email, u.password_hash, u.status, r.name AS role, pp.is_profile_completed
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.email = ? LIMIT 1`,
      [testPatientEmail]
    );

    assert.strictEqual(dbUsers.length, 1, "Patient record must exist in MySQL users table");
    const patientUser = dbUsers[0];
    assert.strictEqual(patientUser.role, "patient", "Role must be strictly 'patient'");
    assert.strictEqual(patientUser.status, "pending", "Status must initially be 'pending'");
    assert(patientUser.password_hash.startsWith("$2"), "Password must be hashed with bcrypt");
    const hashMatches = await bcrypt.compare(testPassword, patientUser.password_hash);
    assert(hashMatches, "Stored bcrypt hash must verify with the plain password");
    assert.strictEqual(patientUser.is_profile_completed, 0, "Initial profile completion must be false");

    console.log("  ✓ Patient account successfully created with role=patient, status=pending, and bcrypt hash.");
    console.log("  ✓ Initialized patient_profiles record with is_profile_completed=false.");

    // -------------------------------------------------------------------------
    // TEST 2: Patient cannot self-assign privileged roles
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Attempt to inject privileged role ('super_admin') during registration");
    const exploitEmail = `exploit.patient_${timestamp}@example.com`;
    const exploitRes = await post("/auth/register-patient", {
      full_name: "Malicious Actor",
      email: exploitEmail,
      password: testPassword,
      role: "super_admin",
      status: "active",
      hospital_id: 1,
    });

    assert.strictEqual(exploitRes.status, 201);
    const [exploitUsers] = await connection.execute(
      `SELECT u.id, r.name AS role, u.status, u.hospital_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? LIMIT 1`,
      [exploitEmail]
    );
    assert.strictEqual(exploitUsers[0].role, "patient", "Injected role must be ignored; role must remain 'patient'");
    assert.strictEqual(exploitUsers[0].status, "pending", "Injected status must be ignored; status must remain 'pending'");
    assert.strictEqual(exploitUsers[0].hospital_id, null, "Injected hospital_id must be ignored");
    console.log("  ✓ Role escalation strictly blocked: self-registration always assigns role 'patient' with 'pending' status.");

    // -------------------------------------------------------------------------
    // TEST 3: Validation checks (password length, email format, empty name)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Input validation constraints");

    const shortPassRes = await post("/auth/register-patient", {
      full_name: "John Doe",
      email: `shortpass_${timestamp}@example.com`,
      password: "short", // < 12 characters
    });
    assert.strictEqual(shortPassRes.status, 400, "Password < 12 characters must be rejected with 400");
    console.log("  ✓ Short password (< 12 characters) rejected with 400 Bad Request");

    const invalidEmailRes = await post("/auth/register-patient", {
      full_name: "John Doe",
      email: "invalid-email-format",
      password: testPassword,
    });
    assert.strictEqual(invalidEmailRes.status, 400, "Invalid email format must be rejected with 400");
    console.log("  ✓ Invalid email format rejected with 400 Bad Request");

    const emptyNameRes = await post("/auth/register-patient", {
      full_name: "   ",
      email: `emptyname_${timestamp}@example.com`,
      password: testPassword,
    });
    assert.strictEqual(emptyNameRes.status, 400, "Empty full name must be rejected with 400");
    console.log("  ✓ Empty full name rejected with 400 Bad Request");

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate email handling & OTP Rate Limiting
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Duplicate email handling & rate-limiting");

    // Immediate repeat attempt should trigger rate limiting with 429
    const rateLimitedRes = await post("/auth/register-patient", {
      full_name: "Undhad Harshil",
      email: testPatientEmail,
      password: testPassword,
    });
    assert.strictEqual(rateLimitedRes.status, 429, "Immediate re-registration attempt must be rate-limited with 429");
    console.log("  ✓ Immediate re-registration rate-limited with 429 Too Many Requests");

    // Simulate elapsed cooldown by aging previous OTP in database
    await connection.execute(
      "UPDATE otp_verifications SET created_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE email = ?",
      [testPatientEmail]
    );

    // After cooldown, pending duplicate should successfully resend OTP with 200 OK
    const pendingDupRes = await post("/auth/register-patient", {
      full_name: "Undhad Harshil",
      email: testPatientEmail,
      password: testPassword,
    });
    assert.strictEqual(pendingDupRes.status, 200, "Pending duplicate email should resend verification OTP with 200 OK");
    console.log("  ✓ Pending duplicate email safely resends OTP after cooldown without creating duplicate record");

    // Active duplicate should be rejected with 409 Conflict
    const activeEmail = `active.patient_${timestamp}@example.com`;
    const [roles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const activePassHash = await bcrypt.hash(testPassword, 12);
    await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status) VALUES (?, ?, ?, ?, 'active')`,
      [roles[0].id, "Active Patient", activeEmail, activePassHash]
    );

    const activeDupRes = await post("/auth/register-patient", {
      full_name: "Active Patient 2",
      email: activeEmail,
      password: testPassword,
    });
    assert.strictEqual(activeDupRes.status, 409, "Active duplicate email must return 409 Conflict");
    console.log("  ✓ Active duplicate email rejected with 409 Conflict");

    // -------------------------------------------------------------------------
    // TEST 5: Login enforcement (pending account, wrong password, active account)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Login status enforcement");

    // 1. Pending patient cannot log in
    const pendingLoginRes = await post("/auth/login", {
      email: testPatientEmail,
      password: testPassword,
    });
    assert.strictEqual(pendingLoginRes.status, 403, "Pending account login must be blocked with 403");
    assert.strictEqual(pendingLoginRes.body.status, "pending");
    console.log("  ✓ Pending patient account login correctly blocked with 403 Forbidden");

    // 2. Wrong password returns 401
    const wrongPassRes = await post("/auth/login", {
      email: activeEmail,
      password: "WrongPassword123#",
    });
    assert.strictEqual(wrongPassRes.status, 401, "Invalid password must return 401 Unauthorized");
    console.log("  ✓ Invalid password rejected with 401 Unauthorized");

    // 3. Active patient logs in successfully
    const activeLoginRes = await post("/auth/login", {
      email: activeEmail,
      password: testPassword,
    });
    assert.strictEqual(activeLoginRes.status, 200, "Active patient login must succeed with 200 OK");
    assert(activeLoginRes.body.token, "Login response must include JWT token");
    assert.strictEqual(activeLoginRes.body.user.role, "patient");
    assert.strictEqual(activeLoginRes.body.user.email, activeEmail);
    assert(!activeLoginRes.body.user.password_hash, "Password hash must never be in response");

    // Verify JWT payload
    const decoded = jwt.verify(activeLoginRes.body.token, JWT_SECRET);
    assert.strictEqual(decoded.role, "patient");
    assert(decoded.sub, "JWT must contain sub (user ID)");
    console.log("  ✓ Active patient logs in successfully with valid JWT token & sanitised profile");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 5.1 PASSED! ✅");
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
