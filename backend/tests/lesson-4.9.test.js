const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 4.9");
  console.log(" (Sending Login Credentials to Doctors & Staff,");
  console.log("  Delivery Tracking & Mandatory Password Resets)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Super Admin, Hospital Admin, and two active Hospitals
    const [superAdmins] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'super_admin' AND u.status = 'active'
       LIMIT 1`
    );
    assert(superAdmins.length > 0, "Super admin account must exist");
    const superAdmin = superAdmins[0];
    const superAdminToken = jwt.sign(
      { sub: superAdmin.id, role: superAdmin.role, tokenVersion: superAdmin.token_version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const [hospitals] = await connection.execute(
      "SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY id ASC LIMIT 2"
    );
    assert(hospitals.length >= 2, "At least two active hospitals needed");
    const hospital1 = hospitals[0];
    const hospital2 = hospitals[1];

    // Hospital Admin for Hospital 1
    const [hAdmins1] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.hospital_id, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hospital_admin' AND u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital1.id]
    );
    assert(hAdmins1.length > 0, "Hospital admin 1 must exist");
    const hospitalAdmin1 = hAdmins1[0];
    const hospitalAdmin1Token = jwt.sign(
      {
        sub: hospitalAdmin1.id,
        role: hospitalAdmin1.role,
        hospitalId: hospitalAdmin1.hospital_id,
        tokenVersion: hospitalAdmin1.token_version,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Active department for Hospital 1
    let [deptRows1] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital1.id]
    );
    const dept1 = deptRows1[0];

    // Fetch designations
    const [desigRows] = await connection.execute(
      "SELECT id, name FROM designations WHERE status = 'active' LIMIT 2"
    );
    const designation1 = desigRows[0];

    console.log(`[SETUP] Hospital 1: #${hospital1.id} (${hospital1.name})`);
    console.log(`[SETUP] Hospital 2: #${hospital2.id} (${hospital2.name})`);

    // Create a doctor in Hospital 1 for credential testing
    const testDocEmail = `dr.creds_${Date.now()}@example.com`;
    let res = await fetch(`${BASE_URL}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Dr. Alexander Fleming",
        email: testDocEmail,
        password: "InitialPassword123!",
        department_id: dept1.id,
        designation_id: designation1.id,
        consultation_fee: 800,
        experience_years: 15,
      }),
    });
    let data = await res.json();
    assert.strictEqual(res.status, 201);
    const testDoctorId = data.data.id;
    console.log(`[SETUP] Created test doctor #${testDoctorId} (${testDocEmail})`);

    // Create a staff member in Hospital 2 for cross-hospital testing
    const testStaffHosp2Email = `staff.hosp2_${Date.now()}@example.com`;
    const [h2Roles] = await connection.execute("SELECT id FROM roles WHERE name = 'staff' LIMIT 1");
    const [h2StaffIns] = await connection.execute(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
       VALUES (?, ?, 'Foreign Staff', ?, 'hash', 'pending')`,
      [h2Roles[0].id, hospital2.id, testStaffHosp2Email]
    );
    const foreignStaffId = h2StaffIns.insertId;
    console.log(`[SETUP] Created foreign staff #${foreignStaffId} in Hospital 2`);

    // -----------------------------------------------------------------
    // TEST 1: Hospital Admin 1 dispatches credentials to Doctor in Hospital 1
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Dispatch login credentials to Doctor in Hospital 1");
    res = await fetch(`${BASE_URL}/users/${testDoctorId}/send-credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({}),
    });
    data = await res.json();
    if (res.status !== 200) console.log("ERROR DATA:", data);
    assert.strictEqual(res.status, 200, "Expected 200 OK for credential dispatch");
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.email, testDocEmail);
    assert.strictEqual(data.data.must_change_password, true);
    assert.strictEqual(data.data.credential_delivery_status, "sent");
    assert(data.data.temporary_password && data.data.temporary_password.length >= 12, "Temporary password must be generated");
    assert(data.data.portal_url.includes("5175") || data.data.portal_url.length > 0, "Doctor portal URL returned");

    const tempPassword = data.data.temporary_password;
    console.log(`  ✓ Credentials dispatched. Delivery status: ${data.data.credential_delivery_status}`);
    console.log(`  ✓ Temporary Password: ${tempPassword}`);
    console.log(`  ✓ Portal URL: ${data.data.portal_url}`);

    // Verify email record in development adapter
    const sentEmails = getDevSentEmails(testDocEmail);
    assert(sentEmails.length > 0, "Email must be dispatched to recipient");
    const lastEmail = sentEmails[sentEmails.length - 1];
    assert(lastEmail.text.includes(tempPassword), "Email content must contain temporary password");
    console.log("  ✓ Email delivery verified in mail service adapter");

    // -----------------------------------------------------------------
    // TEST 2: Sign in with Temporary Password & Verify mustChangePassword flag
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Sign in with generated temporary password");
    res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testDocEmail,
        password: tempPassword,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200, "Login with temporary password must succeed");
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.mustChangePassword, true, "User must have mustChangePassword = true flag");
    const doctorAuthToken = data.token;
    console.log("  ✓ Successfully signed in with temporary password. mustChangePassword: true");

    // -----------------------------------------------------------------
    // TEST 3: Enforce Password Reset (Lesson 4.9 First-time reset)
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Execute mandatory initial password update");
    const newPermanentPassword = "PermanentDoctorPass2026!";
    res = await fetch(`${BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorAuthToken}`,
      },
      body: JSON.stringify({
        currentPassword: tempPassword,
        newPassword: newPermanentPassword,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200, "Password change should succeed");
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.mustChangePassword, false, "mustChangePassword must clear to false");
    console.log("  ✓ Mandatory password reset completed. mustChangePassword cleared to false");

    // -----------------------------------------------------------------
    // TEST 4: Hospital Tenant Isolation - Cannot dispatch credentials to foreign hospital
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Isolation: Hospital Admin 1 cannot dispatch credentials to Hospital 2 user");
    res = await fetch(`${BASE_URL}/users/${foreignStaffId}/send-credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({}),
    });
    data = await res.json();
    assert.strictEqual(res.status, 403, "Should return 403 Forbidden for foreign hospital credential dispatch");
    assert.strictEqual(data.success, false);
    console.log("  ✓ Cross-hospital credential dispatch strictly blocked with 403 Forbidden");

    // -----------------------------------------------------------------
    // TEST 5: Super Admin can dispatch credentials across any hospital
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Super Admin dispatches credentials across hospitals");
    res = await fetch(`${BASE_URL}/users/${foreignStaffId}/send-credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({}),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, foreignStaffId);
    console.log("  ✓ Super Admin credential dispatch succeeded across facilities");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 4.9 PASSED (100%)");
    console.log("=================================================\n");
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
