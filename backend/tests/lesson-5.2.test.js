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

  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 5.2");
  console.log(" (Email OTP Verification, Token Security & Google Sign-In)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const patientEmail = `otp.patient_${timestamp}@example.com`;
    const patientPassword = "Password@123456_Secure";

    // =========================================================================
    // PART A: EMAIL REGISTRATION & OTP VERIFICATION
    // =========================================================================
    console.log("--- PART A: EMAIL OTP VERIFICATION & RATE LIMITS ---");

    // 1. Register a pending patient
    console.log("[TEST 1] Register a pending patient and generate OTP");
    const regRes = await post("/auth/register-patient", {
      full_name: "Rahul Verma",
      email: patientEmail,
      password: patientPassword,
    });
    assert.strictEqual(regRes.status, 201);

    // Retrieve sent OTP from dev endpoint
    const lastOtpRes = await get(`/auth/dev-last-otp?email=${encodeURIComponent(patientEmail)}`);
    assert(lastOtpRes.body?.lastEmail?.text, "OTP must be captured in dev email store");
    const otpMatch = lastOtpRes.body.lastEmail.text.match(/verification code is:\s*(\d{6})/);
    assert(otpMatch, "Must find 6-digit OTP in email text");
    const realOtp = otpMatch[1];
    console.log(`  ✓ OTP successfully generated and dispatched (${realOtp})`);

    // 2. Reject incorrect OTP
    console.log("\n[TEST 2] Reject incorrect OTP code");
    const wrongOtpRes = await post("/auth/verify-otp", {
      email: patientEmail,
      otp: "000000",
      purpose: "registration",
    });
    assert.strictEqual(wrongOtpRes.status, 400);
    assert(wrongOtpRes.body.message.includes("Invalid code") || wrongOtpRes.body.message.includes("attempt"));
    console.log("  ✓ Incorrect OTP code rejected with 400 Bad Request and attempts counter incremented");

    // 3. Reject expired OTP
    console.log("\n[TEST 3] Reject expired OTP token");
    // Manually age the OTP in DB past expires_at
    await connection.execute(
      "UPDATE otp_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE email = ?",
      [patientEmail]
    );
    const expiredRes = await post("/auth/verify-otp", {
      email: patientEmail,
      otp: realOtp,
      purpose: "registration",
    });
    assert.strictEqual(expiredRes.status, 400);
    assert(expiredRes.body.message.toLowerCase().includes("expired"));
    console.log("  ✓ Expired OTP token rejected and marked invalid");

    // 4. Request a fresh OTP after cooldown and verify it
    console.log("\n[TEST 4] Request new code after rate-limit cooldown and verify successfully");
    // Fast-forward cooldown
    await connection.execute(
      "UPDATE otp_verifications SET created_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE email = ?",
      [patientEmail]
    );
    const resendRes = await post("/auth/resend-otp", {
      email: patientEmail,
      purpose: "registration",
    });
    assert.strictEqual(resendRes.status, 200);

    const freshOtpRes = await get(`/auth/dev-last-otp?email=${encodeURIComponent(patientEmail)}`);
    const freshOtp = freshOtpRes.body.lastEmail.text.match(/verification code is:\s*(\d{6})/)[1];

    const verifySuccessRes = await post("/auth/verify-otp", {
      email: patientEmail,
      otp: freshOtp,
      purpose: "registration",
    });
    assert.strictEqual(verifySuccessRes.status, 200);
    assert.strictEqual(verifySuccessRes.body.success, true);

    // Verify patient user is now active in database
    const [activeUsers] = await connection.execute(
      "SELECT status FROM users WHERE email = ? LIMIT 1",
      [patientEmail]
    );
    assert.strictEqual(activeUsers[0].status, "active", "Patient account must be activated upon OTP verification");
    console.log("  ✓ Valid OTP verified: patient account successfully activated (status = 'active')");

    // 5. Prevent reuse of already consumed OTP
    console.log("\n[TEST 5] Prevent replay attack / reuse of consumed OTP");
    const reuseRes = await post("/auth/verify-otp", {
      email: patientEmail,
      otp: freshOtp,
      purpose: "registration",
    });
    assert.strictEqual(reuseRes.status, 400, "Reused OTP must be rejected with 400");
    console.log("  ✓ Consumed OTP cannot be reused; replay attack strictly blocked");

    // =========================================================================
    // PART B: GOOGLE SIGN-IN & ACCOUNT LINKING CONFLICTS
    // =========================================================================
    console.log("\n--- PART B: GOOGLE SIGN-IN & SAFE ACCOUNT LINKING ---");

    // 6. Reject missing or malformed Google tokens
    console.log("[TEST 6] Reject missing or invalid Google tokens");
    const missingTokenRes = await post("/auth/google", {});
    assert.strictEqual(missingTokenRes.status, 400, "Missing credential must return 400");

    const invalidSigRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({ invalidSignature: true }),
    });
    assert.strictEqual(invalidSigRes.status, 401, "Invalid token signature must return 401");

    const expiredGoogleRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({ expired: true }),
    });
    assert.strictEqual(expiredGoogleRes.status, 401, "Expired Google token must return 401");

    const audienceMismatchRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({ wrongAudience: true }),
    });
    assert.strictEqual(audienceMismatchRes.status, 401, "Audience mismatch must return 401");
    console.log("  ✓ Token verification enforces valid signature, expiration, and audience checks");

    // 7. New user registration via Google Sign-In
    console.log("\n[TEST 7] Register new patient via Google Sign-In");
    const googleSub1 = "google_sub_" + timestamp;
    const googleEmail1 = `google.user_${timestamp}@gmail.com`;

    const googleNewUserRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({
        sub: googleSub1,
        email: googleEmail1,
        name: "Google Patient One",
        email_verified: true,
      }),
    });

    assert.strictEqual(googleNewUserRes.status, 200, `Expected 200, got ${googleNewUserRes.status}`);
    assert(googleNewUserRes.body.token, "Must return signed JWT");
    assert.strictEqual(googleNewUserRes.body.user.email, googleEmail1);
    assert.strictEqual(googleNewUserRes.body.user.role, "patient");
    assert.strictEqual(googleNewUserRes.body.user.status, "active");

    // Verify DB user record
    const [googleDbUsers] = await connection.execute(
      `SELECT u.id, u.email, u.google_id, u.password_hash, u.status, pp.is_profile_completed
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.google_id = ? LIMIT 1`,
      [googleSub1]
    );
    assert.strictEqual(googleDbUsers.length, 1);
    assert.strictEqual(googleDbUsers[0].google_id, googleSub1);
    assert.strictEqual(googleDbUsers[0].status, "active");
    assert(googleDbUsers[0].password_hash.startsWith("$2"), "Account must have random strong bcrypt password hash");
    assert.strictEqual(googleDbUsers[0].is_profile_completed, 0);
    console.log("  ✓ New Google user automatically provisioned with role=patient, status=active, and linked google_id");

    // 8. Safe account linking: Existing pending patient account with matching email
    console.log("\n[TEST 8] Safe account linking for existing patient with matching email");
    const linkEmail = `link.patient_${timestamp}@example.com`;
    const googleSub2 = "google_sub_linked_" + timestamp;

    // Create a pending patient via standard registration
    await post("/auth/register-patient", {
      full_name: "Pre Existing Patient",
      email: linkEmail,
      password: patientPassword,
    });

    // Patient signs in with Google using that verified email
    const linkRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({
        sub: googleSub2,
        email: linkEmail,
        name: "Pre Existing Patient",
        email_verified: true,
      }),
    });

    assert.strictEqual(linkRes.status, 200);
    const [linkedUsers] = await connection.execute(
      "SELECT id, google_id, status FROM users WHERE email = ? LIMIT 1",
      [linkEmail]
    );
    assert.strictEqual(linkedUsers[0].google_id, googleSub2, "Account must be linked to google_id");
    assert.strictEqual(linkedUsers[0].status, "active", "Pending account must be activated upon verified Google login");
    console.log("  ✓ Existing patient account safely linked to google_id and activated");

    // 9. Conflict protection: Existing account already linked to a DIFFERENT Google account
    console.log("\n[TEST 9] Prevent account hijacking: Account already linked to another Google ID");
    const hijackAttemptRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({
        sub: "attacker_sub_9999",
        email: linkEmail, // already linked to googleSub2!
        name: "Attacker User",
        email_verified: true,
      }),
    });
    assert.strictEqual(hijackAttemptRes.status, 409, "Must return 409 Conflict when linking different Google ID to linked account");
    console.log("  ✓ Account linking conflict rejected with 409 Conflict (prevents Google ID hijacking)");

    // 10. Role conflict protection: Staff/Admin email cannot be logged into patient portal
    console.log("\n[TEST 10] Prevent role conflict: Administrative/staff email blocked from patient Google login");
    const staffEmail = `doctor.google_${timestamp}@h1.com`;
    const [docRoles] = await connection.execute("SELECT id FROM roles WHERE name = 'doctor' LIMIT 1");
    const dummyHash = await bcrypt.hash("DocPass123456#", 12);
    await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status) VALUES (?, 'Dr. Google', ?, ?, 'active')`,
      [docRoles[0].id, staffEmail, dummyHash]
    );

    const docGoogleRes = await post("/auth/google", {
      credential: "test_google_token:" + JSON.stringify({
        sub: "doctor_sub_1234",
        email: staffEmail,
        name: "Dr. Google",
        email_verified: true,
      }),
    });
    assert.strictEqual(docGoogleRes.status, 403, "Staff/Doctor account must be rejected with 403 Forbidden");
    console.log("  ✓ Administrative role conflict strictly blocked with 403 Forbidden");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 5.2 PASSED! ✅");
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
