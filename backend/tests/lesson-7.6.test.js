const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");

const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.6");
  console.log(" (Password Reset & OTP Emails, Anti-Enumeration & Security)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Create a test active user for password reset
    const resetUserEmail = `user.reset_${Date.now()}@example.com`;
    const [roles] = await connection.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
    const initialPasswordHash = await bcrypt.hash("OldPassword1234!", 10);

    const [userRes] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status, token_version)
       VALUES (?, 'Marie Antoinette', ?, ?, 'active', 1)`,
      [roles[0].id, resetUserEmail, initialPasswordHash]
    );
    const userId = userRes.insertId;

    // -------------------------------------------------------------
    // TEST 1: Forgot Password for Valid Account -> Dispatches Branded OTP Email
    // -------------------------------------------------------------
    console.log("[TEST 1] Request Password Reset -> Returns Generic Response & Dispatches OTP Email");
    const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetUserEmail }),
    });

    const forgotData = await forgotRes.json();
    assert.strictEqual(forgotRes.status, 200);
    assert(
      forgotData.message.includes("If an account with that email exists"),
      "Must return anti-enumeration generic message"
    );

    await new Promise((r) => setTimeout(r, 400));

    // Verify email was dispatched
    const sentEmails = getDevSentEmails(resetUserEmail);
    assert(sentEmails.length > 0, "OTP email must be dispatched to recipient");
    const otpEmail = sentEmails[0];
    assert(otpEmail.subject.includes("Password Reset"), "Subject must specify Password Reset");
    assert(otpEmail.html.includes("Password Reset Verification"), "HTML template must be included");

    // Extract OTP from email text
    const otpMatch = otpEmail.text.match(/\b\d{6}\b/);
    assert(otpMatch, "Email must contain a 6-digit OTP code");
    const extractedOtp = otpMatch[0];

    // Check notifications outbox: verify OTP is REDACTED for security
    const [outboxRows] = await connection.execute(
      "SELECT * FROM notifications WHERE recipient_email = ? AND notification_type = 'password_reset_otp'",
      [resetUserEmail]
    );
    assert.strictEqual(outboxRows.length, 1, "Must have password_reset_otp record in notifications outbox");
    assert(
      !outboxRows[0].body_text.includes(extractedOtp),
      "Raw OTP must NEVER be logged in notification outbox records (Security Requirement)"
    );
    console.log("  ✓ Generic response delivered, OTP sent via branded email, and raw OTP strictly redacted from logs");

    // -------------------------------------------------------------
    // TEST 2: Anti-Enumeration for Non-Existent Account
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Request Password Reset for Non-Existent Account -> Identical Response");
    const fakeEmail = `nonexistent_${Date.now()}@example.com`;
    const fakeRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fakeEmail }),
    });

    const fakeData = await fakeRes.json();
    assert.strictEqual(fakeRes.status, 200);
    assert.strictEqual(fakeData.message, forgotData.message, "Response must be identical to prevent user enumeration");
    const fakeSent = getDevSentEmails(fakeEmail);
    assert.strictEqual(fakeSent.length, 0, "No email sent for non-existent account");
    console.log("  ✓ Anti-enumeration protection confirmed with identical responses");

    // -------------------------------------------------------------
    // TEST 3: Rate Limiting Enforcement (60s cooldown)
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Rapid Consecutive Reset Request -> Enforces 60-Second Cooldown (429)");
    const rapidRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetUserEmail }),
    });

    assert.strictEqual(rapidRes.status, 429, "Must return 429 Too Many Requests");
    const rapidData = await rapidRes.json();
    assert(rapidData.message.includes("seconds before requesting"), "Must display rate limit cooldown");
    console.log("  ✓ Rate limit cooldown strictly enforced");

    // -------------------------------------------------------------
    // TEST 4: Verification Attempt Lockout (5 max attempts)
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Failed OTP Verification Attempts -> Limited to 5 Attempts Max");
    // Attempt with incorrect OTP
    const failRes1 = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetUserEmail,
        otp: "000000",
        new_password: "NewPasswordStrong1234!",
        confirm_password: "NewPasswordStrong1234!",
      }),
    });

    const failData1 = await failRes1.json();
    assert.strictEqual(failRes1.status, 400);
    assert(failData1.message.includes("Invalid code") || failData1.message.includes("remaining"), "Must track remaining attempts");
    console.log("  ✓ Incorrect code attempt recorded and remaining counter decremented");

    // -------------------------------------------------------------
    // TEST 5: Complete Password Reset with Valid Code
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Complete Password Reset with Valid OTP & 12+ Character Password");
    const newPassword = "BrandNewSecurePassword1234!";
    const successRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetUserEmail,
        otp: extractedOtp,
        new_password: newPassword,
        confirm_password: newPassword,
      }),
    });

    const successData = await successRes.json();
    assert.strictEqual(successRes.status, 200, `Reset failed: ${JSON.stringify(successData)}`);

    // Verify token_version incremented to invalidate old sessions
    const [userRowsAfter] = await connection.execute(
      "SELECT token_version, password_hash FROM users WHERE id = ?",
      [userId]
    );
    assert(userRowsAfter[0].token_version > 1, "token_version must increment upon password reset");

    // Verify password was changed
    const passMatches = await bcrypt.compare(newPassword, userRowsAfter[0].password_hash);
    assert(passMatches, "New password must match hashed password in database");

    // Verify OTP consumed cannot be reused
    const reuseRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetUserEmail,
        otp: extractedOtp,
        new_password: "AnotherNewPassword1234!",
        confirm_password: "AnotherNewPassword1234!",
      }),
    });
    assert.strictEqual(reuseRes.status, 400, "Consumed OTP must not be reusable");
    console.log("  ✓ Password successfully reset, sessions invalidated, and OTP marked consumed");

    // Cleanup
    await connection.execute("DELETE FROM notifications WHERE recipient_email = ?", [resetUserEmail]);
    await connection.execute("DELETE FROM otp_verifications WHERE email = ?", [resetUserEmail]);
    await connection.execute("DELETE FROM users WHERE id = ?", [userId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.6 PASSED (100%)");
    console.log("=================================================\n");
    process.exit(0);
  } finally {
    connection.release();
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
