const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getDevSentEmails } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.1");
  console.log(" (Hospital, Doctor, Staff Account Emails & Outbox)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Super Admin & Hospital Admin
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
      "SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY id ASC LIMIT 1"
    );
    assert(hospitals.length > 0, "At least one active hospital needed");
    const hospital = hospitals[0];

    const [depts] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital.id]
    );
    const departmentId = depts[0]?.id || null;

    // -------------------------------------------------------------
    // TEST 1: Doctor Account Creation Triggers Pending Email
    // -------------------------------------------------------------
    console.log("[TEST 1] Create Doctor -> Triggers Registration Received Email");
    const docEmail = `dr.m7_${Date.now()}@example.com`;
    const docRes = await fetch(`${BASE_URL}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        full_name: "Dr. Alexander Fleming",
        email: docEmail,
        phone: "+91 98765 43210",
        password: "StrongPassword!1234",
        hospital_id: hospital.id,
        department_id: departmentId,
        specialization: "Microbiology & Pathology",
        consultation_fee: 650.0,
      }),
    });

    const docData = await docRes.json();
    assert.strictEqual(docRes.status, 201, `Doctor creation failed: ${JSON.stringify(docData)}`);
    assert.strictEqual(docData.data.status, "pending", "Doctor must start in pending status");
    const createdDoctorId = docData.data.id;

    // Wait briefly for async notification worker
    await new Promise((r) => setTimeout(r, 400));

    // Check sent emails in mock adapter
    const sentDoctorEmails = getDevSentEmails(docEmail);
    assert(sentDoctorEmails.length > 0, "Email must be dispatched to newly registered doctor");
    assert(
      sentDoctorEmails[0].subject.includes("Application Received") || sentDoctorEmails[0].subject.includes("Registration"),
      `Unexpected email subject: ${sentDoctorEmails[0].subject}`
    );
    assert(!sentDoctorEmails[0].text.includes("StrongPassword!1234"), "Plaintext password must NOT be emailed");

    // Check notifications database table
    const [docNotifRows] = await connection.execute(
      "SELECT * FROM notifications WHERE recipient_email = ? AND notification_type = 'account_pending_review'",
      [docEmail]
    );
    assert.strictEqual(docNotifRows.length, 1, "Must have 1 notification outbox record");
    assert.strictEqual(docNotifRows[0].status, "sent", "Notification status must be 'sent'");
    console.log("  ✓ Doctor registration email sent & persisted in outbox table");

    // -------------------------------------------------------------
    // TEST 2: Staff Account Creation Triggers Pending Email
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Create Staff -> Triggers Registration Received Email");
    const staffEmail = `staff.m7_${Date.now()}@example.com`;
    const staffRes = await fetch(`${BASE_URL}/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        full_name: "Nurse Florence Nightingale",
        email: staffEmail,
        phone: "+91 98765 11223",
        password: "StrongPassword!1234",
        hospital_id: hospital.id,
        department_id: departmentId,
        employee_id: `EMP-${Date.now().toString().slice(-4)}`,
      }),
    });

    const staffData = await staffRes.json();
    assert.strictEqual(staffRes.status, 201, `Staff creation failed: ${JSON.stringify(staffData)}`);
    const createdStaffId = staffData.data.id;

    await new Promise((r) => setTimeout(r, 400));
    const sentStaffEmails = getDevSentEmails(staffEmail);
    assert(sentStaffEmails.length > 0, "Email must be dispatched to newly registered staff");

    const [staffNotifRows] = await connection.execute(
      "SELECT * FROM notifications WHERE recipient_email = ? AND notification_type = 'account_pending_review'",
      [staffEmail]
    );
    assert.strictEqual(staffNotifRows.length, 1, "Must have staff notification record");
    console.log("  ✓ Staff registration email sent & recorded in outbox");

    // -------------------------------------------------------------
    // TEST 3: Account Approval Triggers Approval Notice
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Approve Doctor Account -> Dispatches Account Approved Email");
    const approveRes = await fetch(`${BASE_URL}/users/${createdDoctorId}/approve`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });

    const approveData = await approveRes.json();
    assert.strictEqual(approveRes.status, 200, `Approval failed: ${JSON.stringify(approveData)}`);
    assert.strictEqual(approveData.data.status, "active", "Doctor account status must now be active");

    await new Promise((r) => setTimeout(r, 400));
    const doctorEmailsAfterApproval = getDevSentEmails(docEmail);
    assert(doctorEmailsAfterApproval.length >= 2, "Doctor should have received approval email");
    const approvalEmail = doctorEmailsAfterApproval.find((e) => e.subject.includes("Approved"));
    assert(approvalEmail, "Approval email must exist with 'Approved' in subject");

    const [approvedNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE recipient_user_id = ? AND notification_type = 'account_approved'",
      [createdDoctorId]
    );
    assert.strictEqual(approvedNotif.length, 1, "Must have account_approved notification in outbox");
    console.log("  ✓ Account approved email successfully sent and recorded");

    // -------------------------------------------------------------
    // TEST 4: Dispatch Credentials -> Temporary Password Notice
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Dispatch Credentials -> Dispatches Credentials & Mandatory Password Change");
    const credRes = await fetch(`${BASE_URL}/users/${createdDoctorId}/send-credentials`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });

    const credData = await credRes.json();
    assert.strictEqual(credRes.status, 200, `Send credentials failed: ${JSON.stringify(credData)}`);
    assert.strictEqual(credData.data.credential_delivery_status, "sent");
    assert.strictEqual(credData.data.must_change_password, true);

    await new Promise((r) => setTimeout(r, 400));
    const doctorEmailsAfterCreds = getDevSentEmails(docEmail);
    const credEmail = doctorEmailsAfterCreds.find((e) => e.subject.includes("Access Credentials"));
    assert(credEmail, "Credential email must be dispatched");
    assert(credEmail.text.includes("Temporary Password:"), "Must indicate temporary password");
    assert(credEmail.text.includes("IMPORTANT SECURITY NOTICE"), "Must include first-login security requirement");

    const [credNotif] = await connection.execute(
      "SELECT * FROM notifications WHERE recipient_user_id = ? AND notification_type = 'account_credentials'",
      [createdDoctorId]
    );
    assert.strictEqual(credNotif.length, 1, "Must have account_credentials outbox record");
    console.log("  ✓ Credential dispatch email sent and tracked");

    // Cleanup created test records
    await connection.execute("DELETE FROM notifications WHERE recipient_user_id IN (?, ?)", [
      createdDoctorId,
      createdStaffId,
    ]);
    await connection.execute("DELETE FROM doctor_profiles WHERE user_id = ?", [createdDoctorId]);
    await connection.execute("DELETE FROM staff_profiles WHERE user_id = ?", [createdStaffId]);
    await connection.execute("DELETE FROM users WHERE id IN (?, ?)", [createdDoctorId, createdStaffId]);

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSON 7.1 PASSED (100%)");
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
