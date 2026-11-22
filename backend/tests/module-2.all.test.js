require("dotenv").config();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const { getDevSentEmails } = require("../services/emailService");

async function runAllModule2Tests() {
  console.log("\n=======================================================");
  console.log("       MODULE 2 COMPREHENSIVE AUTOMATED TEST SUITE     ");
  console.log("=======================================================\n");

  const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;

  async function post(endpoint, body, headers = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function patch(endpoint, body, headers = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function get(endpoint, headers = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Ensure test hospitals exist
  const [hosp1] = await pool.query("SELECT id FROM hospitals WHERE id = 1");
  if (!hosp1.length) {
    await pool.query(
      "INSERT INTO hospitals (id, name, code, status) VALUES (1, 'General Hospital 1', 'GH1', 'active')"
    );
  }
  const [hosp2] = await pool.query("SELECT id FROM hospitals WHERE id = 2");
  if (!hosp2.length) {
    await pool.query(
      "INSERT INTO hospitals (id, name, code, status) VALUES (2, 'St Jude Hospital 2', 'SJH2', 'active')"
    );
  }

  // Ensure roles exist
  const [roles] = await pool.query("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  // Clean up any test users
  await pool.query(
    "DELETE FROM users WHERE email LIKE '%@testdomain.com' OR email LIKE '%@mod2test.com'"
  );

  const testPass = "@Secret_Pass1234";
  const testHash = await bcrypt.hash(testPass, 10);

  // Setup Super Admin, Hospital Admin 1, Hospital Admin 2
  await pool.query(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin Test', 'sa@mod2test.com', ?, 'active')`,
    [roleMap.super_admin, testHash]
  );

  await pool.query(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, 1, 'Hospital 1 Admin Test', 'ha1@mod2test.com', ?, 'active')`,
    [roleMap.hospital_admin, testHash]
  );

  await pool.query(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, 2, 'Hospital 2 Admin Test', 'ha2@mod2test.com', ?, 'active')`,
    [roleMap.hospital_admin, testHash]
  );

  // ---------------------------------------------------------------
  // LESSON 2.1: User Login & Account Authentication
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.1: Login & Account Authentication ---");
  const saLogin = await post("/auth/login", { email: "sa@mod2test.com", password: testPass });
  assert(saLogin.status === 200 && saLogin.data.token, "Super Admin login succeeds with JWT");
  const saToken = saLogin.data.token;

  const ha1Login = await post("/auth/login", { email: "ha1@mod2test.com", password: testPass });
  assert(ha1Login.status === 200 && ha1Login.data.token, "Hospital Admin login succeeds with JWT");
  const ha1Token = ha1Login.data.token;

  const badLogin = await post("/auth/login", { email: "sa@mod2test.com", password: "wrongpassword" });
  assert(badLogin.status === 401, "Invalid password returns 401");

  // ---------------------------------------------------------------
  // LESSON 2.2: Registration, Email Verification and OTP
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.2: Registration & OTP Verification ---");
  const regEmail = "patient1@mod2test.com";
  const regRes = await post("/auth/register-patient", {
    full_name: "John Doe",
    email: regEmail,
    password: "@Patient_Pass1234",
    phone: "1234567890",
  });
  assert(regRes.status === 201 && regRes.data.data?.requiresVerification, "Patient registration creates pending user requiring verification");

  // Verify patient cannot log in before verification
  const preVerifyLogin = await post("/auth/login", { email: regEmail, password: "@Patient_Pass1234" });
  assert(preVerifyLogin.status === 403 && preVerifyLogin.data.status === "pending", "Unverified patient login rejected with 403 pending");

  // Check dev email adapter for OTP via dev endpoint
  const devEmailRes = await get(`/auth/dev-last-otp?email=${encodeURIComponent(regEmail)}`);
  assert(devEmailRes.status === 200 && devEmailRes.data.lastEmail, "OTP email dispatched to dev email adapter");

  // Extract 6-digit OTP code from email text
  const lastEmail = devEmailRes.data.lastEmail;
  const otpMatch = lastEmail?.text ? lastEmail.text.match(/\b\d{6}\b/) : null;
  const otpCode = otpMatch ? otpMatch[0] : "";
  assert(otpCode.length === 6, `Retrieved 6-digit OTP code (${otpCode})`);

  // Verify incorrect OTP returns error with attempt count
  const badOtpRes = await post("/auth/verify-otp", {
    email: regEmail,
    otp: "000000",
    purpose: "registration",
  });
  assert(badOtpRes.status === 400 && badOtpRes.data.message.includes("attempt"), "Invalid OTP returns 400 and decrements attempts");

  // Verify correct OTP activates account
  const goodOtpRes = await post("/auth/verify-otp", {
    email: regEmail,
    otp: otpCode,
    purpose: "registration",
  });
  assert(goodOtpRes.status === 200 && goodOtpRes.data.success, "Correct OTP verification activates patient account");

  // Now patient can log in
  const postVerifyLogin = await post("/auth/login", { email: regEmail, password: "@Patient_Pass1234" });
  assert(postVerifyLogin.status === 200 && postVerifyLogin.data.user.role === "patient", "Verified patient logs in successfully");
  const patientToken = postVerifyLogin.data.token;

  // ---------------------------------------------------------------
  // LESSON 2.3: Forgot Password and Password Reset
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.3: Forgot Password & Password Reset ---");
  // Non-existent email does not reveal account absence
  const forgotNonExistent = await post("/auth/forgot-password", { email: "nobody@mod2test.com" });
  assert(forgotNonExistent.status === 200, "Forgot password on nonexistent email returns 200 generic message");

  // Existing email triggers reset OTP
  const forgotRes = await post("/auth/forgot-password", { email: regEmail });
  assert(forgotRes.status === 200, "Forgot password on existing account dispatches reset code");

  const devResetEmailRes = await get(`/auth/dev-last-otp?email=${encodeURIComponent(regEmail)}`);
  const lastResetEmail = devResetEmailRes.data.lastEmail;
  const resetOtp = lastResetEmail?.text ? lastResetEmail.text.match(/\b\d{6}\b/)[0] : "";

  // Reset password
  const newPass = "@NewPatient_Pass1234";
  const resetRes = await post("/auth/reset-password", {
    email: regEmail,
    otp: resetOtp,
    new_password: newPass,
    confirm_password: newPass,
  });
  assert(resetRes.status === 200, "Password reset with valid OTP succeeds");

  // Attempting to reuse the same OTP must fail
  const reuseOtp = await post("/auth/reset-password", {
    email: regEmail,
    otp: resetOtp,
    new_password: newPass,
    confirm_password: newPass,
  });
  assert(reuseOtp.status === 400, "Reusing consumed OTP code is rejected");

  // Prior JWT token for patient must now be invalid due to token_version bump
  const staleSession = await get("/auth/me", { Authorization: `Bearer ${patientToken}` });
  assert(staleSession.status === 401, "Prior JWT session is revoked after password reset");

  // Login with new password works
  const newLogin = await post("/auth/login", { email: regEmail, password: newPass });
  assert(newLogin.status === 200, "Login with new password succeeds");

  // ---------------------------------------------------------------
  // LESSON 2.4: Temporary Password & First-Login Password Change
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.4: Temporary Password & First-Login Change ---");
  const tempDoctorEmail = "temp.doc@mod2test.com";
  const tempPass = "@TempPass_Doc123";

  // Hospital Admin creates doctor account with temporary_password: true
  const createTempDoc = await post(
    "/users",
    {
      full_name: "Dr. Temporay",
      email: tempDoctorEmail,
      password: tempPass,
      role: "doctor",
      temporary_password: true,
    },
    { Authorization: `Bearer ${ha1Token}` }
  );
  assert(createTempDoc.status === 201 && createTempDoc.data.data.must_change_password, "Admin creates user flagged with must_change_password=true");

  const docId = createTempDoc.data.data.id;

  // Approve the doctor so they can log in
  await patch(`/users/${docId}/approve`, {}, { Authorization: `Bearer ${ha1Token}` });

  // Doctor logs in
  const docLogin = await post("/auth/login", { email: tempDoctorEmail, password: tempPass });
  assert(docLogin.status === 200 && docLogin.data.user.mustChangePassword === true, "Doctor login payload indicates mustChangePassword=true");
  const docToken = docLogin.data.token;

  // Doctor changes password
  const permPass = "@PermDoc_Pass1234";
  const changePassRes = await post(
    "/auth/change-password",
    {
      current_password: tempPass,
      new_password: permPass,
      confirm_password: permPass,
    },
    { Authorization: `Bearer ${docToken}` }
  );
  assert(changePassRes.status === 200 && changePassRes.data.user.mustChangePassword === false, "First-login password change succeeds and clears requirement");

  // ---------------------------------------------------------------
  // LESSON 2.5 & 2.6: RBAC & Protected Routes
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.5 & 2.6: RBAC & Hospital Isolation ---");

  // Hospital Admin 1 tries to access Hospital 2's departments
  const crossHospDepts = await get("/departments?hospital_id=2", { Authorization: `Bearer ${ha1Token}` });
  assert(crossHospDepts.status === 403, "Cross-hospital data access by Hospital Admin returns 403 Forbidden");

  // Super Admin can access Hospital 2
  const saHospDepts = await get("/departments?hospital_id=2", { Authorization: `Bearer ${saToken}` });
  assert(saHospDepts.status === 200, "Super Admin can access any hospital's departments");

  // Patient tries to create a hospital (Admin only)
  const patientCreateHosp = await post("/hospitals", { name: "Fake Hospital", code: "FH1" }, { Authorization: `Bearer ${newLogin.data.token}` });
  assert(patientCreateHosp.status === 403, "Patient access to admin endpoint returns 403 Forbidden");

  // Tampered/invalid JWT
  const fakeTokenRes = await get("/auth/me", { Authorization: "Bearer invalid.jwt.signature" });
  assert(fakeTokenRes.status === 401, "Tampered/invalid JWT returns 401 Unauthorized");

  // ---------------------------------------------------------------
  // LESSON 2.7: Account Activation and Deactivation
  // ---------------------------------------------------------------
  console.log("\n--- Testing Lesson 2.7: Account Lifecycle & Deactivation ---");

  // Hospital Admin deactivates Doctor
  const deactRes = await patch(
    `/users/${docId}/status`,
    { status: "inactive" },
    { Authorization: `Bearer ${ha1Token}` }
  );
  assert(deactRes.status === 200 && deactRes.data.data.status === "inactive", "Hospital Admin can deactivate doctor in their hospital");

  // Deactivated doctor tries to make authenticated request
  const deactAccess = await get("/auth/me", { Authorization: `Bearer ${changePassRes.data.token}` });
  assert(deactAccess.status === 401 || deactAccess.status === 403, "Deactivated account blocked from protected routes");

  // Deactivated doctor tries to log in
  const deactLogin = await post("/auth/login", { email: tempDoctorEmail, password: permPass });
  assert(deactLogin.status === 403, "Deactivated account login is rejected");

  // Hospital Admin attempts self-deactivation
  const [ha1Record] = await pool.query("SELECT id FROM users WHERE email = 'ha1@mod2test.com'");
  const ha1SelfDeact = await patch(
    `/users/${ha1Record[0].id}/status`,
    { status: "inactive" },
    { Authorization: `Bearer ${ha1Token}` }
  );
  assert(ha1SelfDeact.status === 403, "Self-deactivation is strictly forbidden");

  // Audit logs verification
  const [auditRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM audit_logs WHERE action IN ('ACCOUNT_STATUS_INACTIVE', 'PASSWORD_RESET_SUCCESS', 'PASSWORD_CHANGED')"
  );
  assert(auditRows[0].cnt > 0, "Audit logs successfully recorded administrative & security actions");

  // Cleanup test users
  await pool.query(
    "DELETE FROM users WHERE email LIKE '%@mod2test.com'"
  );

  console.log(`\n=======================================================`);
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log(`=======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllModule2Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
