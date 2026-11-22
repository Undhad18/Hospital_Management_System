const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5000/api";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.8");
  console.log(" (Outbox History, Reliability & Admin Retries)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Super Admin & Hospital Admin & Patient
    const [superAdmins] = await connection.execute(
      `SELECT u.id, u.email, u.token_version, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'super_admin' AND u.status = 'active'
       LIMIT 1`
    );
    assert(superAdmins.length > 0, "Super admin must exist");
    const superAdmin = superAdmins[0];

    const [hospitals] = await connection.execute(
      "SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY id ASC LIMIT 2"
    );
    assert(hospitals.length >= 1, "At least one hospital must exist");
    const hospital1 = hospitals[0];
    const hospital2 = hospitals[1] || null;

    const [hAdmins] = await connection.execute(
      `SELECT u.id, u.email, u.token_version, u.hospital_id, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hospital_admin' AND u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital1.id]
    );
    assert(hAdmins.length > 0, "Hospital admin for hospital 1 must exist");
    const hospitalAdmin1 = hAdmins[0];

    const [patients] = await connection.execute(
      `SELECT u.id, u.email, u.token_version, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'patient' AND u.status = 'active'
       LIMIT 1`
    );
    assert(patients.length > 0, "Patient must exist");
    const patient = patients[0];

    const superAdminToken = createToken({
      sub: String(superAdmin.id),
      role: superAdmin.role_name,
      hospitalId: null,
      tokenVersion: superAdmin.token_version,
    });

    const hospitalAdmin1Token = createToken({
      sub: String(hospitalAdmin1.id),
      role: hospitalAdmin1.role_name,
      hospitalId: hospitalAdmin1.hospital_id,
      tokenVersion: hospitalAdmin1.token_version,
    });

    const patientToken = createToken({
      sub: String(patient.id),
      role: patient.role_name,
      hospitalId: null,
      tokenVersion: patient.token_version,
    });

    // -------------------------------------------------------------
    // TEST 1: Authentication & Authorization for GET /notifications
    // -------------------------------------------------------------
    console.log("[TEST 1] RBAC for GET /api/notifications");

    // 1.1 Unauthenticated -> 401
    const unauthRes = await fetch(`${BASE_URL}/notifications`);
    assert.strictEqual(unauthRes.status, 401, "Unauthenticated request should return 401");

    // 1.2 Patient -> 403
    const patRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.strictEqual(patRes.status, 403, "Patient access to notifications outbox should return 403");

    // 1.3 Hospital Admin -> 200
    const haRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    assert.strictEqual(haRes.status, 200, "Hospital admin should have access (200)");
    const haJson = await haRes.json();
    assert.strictEqual(haJson.success, true);
    assert(Array.isArray(haJson.data));

    // 1.4 Super Admin -> 200
    const saRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.strictEqual(saRes.status, 200, "Super admin should have access (200)");
    const saJson = await saRes.json();
    assert.strictEqual(saJson.success, true);
    assert(Array.isArray(saJson.data));
    console.log("  ✓ Correctly restricted to super_admin and hospital_admin.");

    // -------------------------------------------------------------
    // TEST 2: Filter and Pagination Query Parameters
    // -------------------------------------------------------------
    console.log("[TEST 2] Outbox Filtering & Pagination");

    // Query with limit=2
    const paginatedRes = await fetch(`${BASE_URL}/notifications?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    const paginatedJson = await paginatedRes.json();
    assert.strictEqual(paginatedJson.success, true);
    assert.strictEqual(paginatedJson.page, 1);
    assert.strictEqual(paginatedJson.limit, 2);
    assert(paginatedJson.data.length <= 2);

    // Query with status filter
    const statusRes = await fetch(`${BASE_URL}/notifications?status=sent`, {
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    const statusJson = await statusRes.json();
    assert.strictEqual(statusJson.success, true);
    assert(statusJson.data.every((n) => n.status === "sent"), "All returned notifications should have status 'sent'");

    console.log("  ✓ Outbox pagination, status filtering, and count verified.");

    // -------------------------------------------------------------
    // TEST 3: Retry Failed Notification via POST /api/notifications/:id/retry
    // -------------------------------------------------------------
    console.log("[TEST 3] Admin Retry of Failed Notification");

    // Seed a synthetic failed notification for Hospital 1
    const testKey = `test_retry_fail_${Date.now()}`;
    const [failNotifResult] = await connection.execute(
      `INSERT INTO notifications (
        idempotency_key, hospital_id, recipient_user_id, notification_type,
        recipient_email, subject, body_text,
        status, attempts, max_attempts, error_message
      ) VALUES (
        ?, ?, ?, 'appointment_reminder',
        'failed.recipient@example.com', 'Test Retry Subject', 'Test outbox body text',
        'failed', 1, 3, 'ETIMEDOUT: Connection dropped during dispatch'
      )`,
      [testKey, hospital1.id, patient.id]
    );
    const failedNotifId = failNotifResult.insertId;

    // Retry as Hospital Admin 1
    const retryRes = await fetch(`${BASE_URL}/notifications/${failedNotifId}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    assert.strictEqual(retryRes.status, 200, `Retry should succeed with 200, got ${retryRes.status}`);
    const retryJson = await retryRes.json();
    assert.strictEqual(retryJson.success, true);
    assert.strictEqual(retryJson.status, "sent", "Status should transition to 'sent'");

    // Verify in database
    const [updatedRows] = await connection.execute(
      "SELECT status, attempts, provider_message_id, error_message FROM notifications WHERE id = ?",
      [failedNotifId]
    );
    assert.strictEqual(updatedRows[0].status, "sent");
    assert.strictEqual(updatedRows[0].attempts, 2);
    assert(updatedRows[0].provider_message_id);
    assert.strictEqual(updatedRows[0].error_message, null);
    console.log("  ✓ Notification retry successfully dispatched, status set to sent, attempts incremented.");

    // -------------------------------------------------------------
    // TEST 4: Multi-Tenant Isolation
    // -------------------------------------------------------------
    console.log("[TEST 4] Multi-Tenant Isolation on Outbox & Retries");

    if (hospital2) {
      // Seed a failed notification for Hospital 2
      const [h2FailResult] = await connection.execute(
        `INSERT INTO notifications (
          idempotency_key, hospital_id, recipient_user_id, notification_type,
          recipient_email, subject, body_text,
          status, attempts, max_attempts, error_message
        ) VALUES (
          ?, ?, ?, 'booking_confirmed',
          'h2.patient@example.com', 'H2 Confirmation', 'H2 text',
          'failed', 1, 3, 'Simulated failure'
        )`,
        [`test_h2_${Date.now()}`, hospital2.id, patient.id]
      );
      const h2NotifId = h2FailResult.insertId;

      // Hospital Admin 1 tries to retry Hospital 2's notification -> Should return 403 or 404
      const crossRetryRes = await fetch(`${BASE_URL}/notifications/${h2NotifId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
      });
      assert(
        crossRetryRes.status === 403 || crossRetryRes.status === 404,
        `Hospital admin 1 should receive 403 or 404, got ${crossRetryRes.status}`
      );

      // Hospital Admin 1 querying notifications outbox should not see Hospital 2 notification
      const h1ListRes = await fetch(`${BASE_URL}/notifications?search=h2.patient@example.com`, {
        headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
      });
      const h1ListJson = await h1ListRes.json();
      assert.strictEqual(h1ListJson.data.length, 0, "Hospital 1 admin must not see Hospital 2 notifications");

      // Super Admin CAN view and retry Hospital 2 notification
      const saH2Retry = await fetch(`${BASE_URL}/notifications/${h2NotifId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.strictEqual(saH2Retry.status, 200, "Super admin can retry notifications across all hospitals");
      console.log("  ✓ Multi-tenant boundaries strictly enforced between hospital scopes.");
    } else {
      console.log("  (Skipping second hospital cross-tenant check: single hospital in DB)");
    }

    // -------------------------------------------------------------
    // TEST 5: Manual Reminder Execution via POST /run-reminders
    // -------------------------------------------------------------
    console.log("[TEST 5] Manual Reminder Processing Endpoint");

    const reminderRunRes = await fetch(`${BASE_URL}/notifications/run-reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({ days_ahead: 2 }),
    });
    assert.strictEqual(reminderRunRes.status, 200, "Admin can trigger manual reminder run");
    const reminderRunJson = await reminderRunRes.json();
    assert.strictEqual(reminderRunJson.success, true);
    assert(typeof reminderRunJson.processedCount === "number");
    console.log(`  ✓ Reminder batch executed: ${reminderRunJson.processedCount} reminders processed.`);

    console.log("\n=================================================");
    console.log(" ALL LESSON 7.8 TESTS COMPLETED SUCCESSFULLY!");
    console.log("=================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
    process.exit(1);
  } finally {
    connection.release();
  }
}

runTests();
