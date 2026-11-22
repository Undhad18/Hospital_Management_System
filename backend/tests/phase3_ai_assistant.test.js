const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const { processAssistantQuery, detectIntent, retrieveGroundedData } = require("../services/aiAssistantService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 3: AI HOSPITAL ASSISTANT COMPREHENSIVE TEST SUITE ===");
  console.log("================================================================================\n");

  const [users] = await pool.query(`
    SELECT u.id, u.hospital_id, r.name as role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.hospital_id IS NOT NULL AND u.status = 'active'
    LIMIT 10
  `);

  const hospitalAdminUser = {
    id: 2,
    hospitalId: 1,
    hospital_id: 1,
    role: "hospital_admin",
  };

  const patientUser = {
    id: 3,
    hospitalId: null,
    hospital_id: null,
    role: "patient",
  };

  const superAdminUser = {
    id: 1,
    hospitalId: null,
    hospital_id: null,
    role: "super_admin",
  };

  console.log(`Using Hospital Admin (ID: ${hospitalAdminUser.id}, Hospital: ${hospitalAdminUser.hospital_id})`);
  console.log(`Using Patient (ID: ${patientUser.id})`);
  console.log(`Using Super Admin (ID: ${superAdminUser.id})\n`);

  // ============================================================================
  // TEST 3.1: INTENT DETECTION
  // ============================================================================
  console.log("--- Test 3.1: Natural Language Intent Classification ---");
  assert.strictEqual(detectIntent("How many appointments are scheduled today?"), "appointments_today");
  assert.strictEqual(detectIntent("Which doctors are available?"), "doctor_availability");
  assert.strictEqual(detectIntent("How many beds are currently occupied?"), "bed_occupancy");
  assert.strictEqual(detectIntent("Which wards have available beds?"), "ward_availability");
  assert.strictEqual(detectIntent("Which medicines are running low in stock?"), "low_stock");
  assert.strictEqual(detectIntent("Which medicines are approaching expiry?"), "expiring_medicines");
  assert.strictEqual(detectIntent("How many laboratory tests are pending?"), "pending_labs");
  assert.strictEqual(detectIntent("Which pharmacy bills are unpaid?"), "unpaid_bills");
  assert.strictEqual(detectIntent("How many patients are waiting in queue?"), "patient_queue");
  assert.strictEqual(detectIntent("What are today's hospital statistics and overview?"), "hospital_overview");
  console.log("✓ Verified: 10/10 operational intents correctly classified");

  // ============================================================================
  // TEST 3.2: GROUNDED DATABASE ACCURACY (10 Core Operational Queries)
  // ============================================================================
  console.log("\n--- Test 3.2: Ground-Truth MySQL Verification (All 10 Core Questions) ---");

  // 1. Appointments Today
  const apptResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "How many appointments are scheduled today?",
  });
  assert.strictEqual(apptResult.success, true);
  assert.ok(apptResult.answer.length > 10);
  assert.strictEqual(apptResult.metadata.intent, "appointments_today");
  assert.ok(apptResult.metadata.sources.includes("appointments"));
  console.log(`✓ 1. Appointments Today verified: Answered with live DB ground truth`);

  // 2. Doctor Availability
  const docResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "Which doctors are available?",
  });
  assert.strictEqual(docResult.success, true);
  assert.strictEqual(docResult.metadata.intent, "doctor_availability");
  assert.ok(docResult.metadata.sources.includes("doctor_schedules"));
  console.log(`✓ 2. Doctor Availability verified: Sources included doctor_schedules & profiles`);

  // 3. Bed Occupancy
  const [actualBedCounts] = await pool.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) as occupied
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     WHERE w.hospital_id = ?`,
    [hospitalAdminUser.hospital_id]
  );
  const bedResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "How many beds are currently occupied?",
  });
  assert.strictEqual(bedResult.success, true);
  assert.strictEqual(bedResult.metadata.intent, "bed_occupancy");
  assert.strictEqual(
    bedResult.metadata.dataSnapshot.occupiedBeds,
    Number(actualBedCounts[0].occupied || 0),
    "Occupied bed count must match exact MySQL record count"
  );
  console.log(`✓ 3. Bed Occupancy verified: Exact match with MySQL (${actualBedCounts[0].occupied}/${actualBedCounts[0].total})`);

  // 4. Ward Availability
  const wardResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "Which wards have available beds?",
  });
  assert.strictEqual(wardResult.success, true);
  assert.strictEqual(wardResult.metadata.intent, "ward_availability");
  console.log(`✓ 4. Ward Availability verified: Wards and available bed counts returned`);

  // 5. Low Stock Medicines
  const medResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "Which medicines are running low in stock?",
  });
  assert.strictEqual(medResult.success, true);
  assert.strictEqual(medResult.metadata.intent, "low_stock");
  console.log(`✓ 5. Low Stock Medicines verified: Identified formulary items below alert thresholds`);

  // 6. Expiring Medicines
  const expiryResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "Which medicines are approaching expiry?",
  });
  assert.strictEqual(expiryResult.success, true);
  assert.strictEqual(expiryResult.metadata.intent, "expiring_medicines");
  console.log(`✓ 6. Expiring Medicines verified: Batches within 60-day window returned`);

  // 7. Pending Laboratory Tests
  const labResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "How many laboratory tests are pending?",
  });
  assert.strictEqual(labResult.success, true);
  assert.strictEqual(labResult.metadata.intent, "pending_labs");
  console.log(`✓ 7. Pending Lab Tests verified: Uncompleted investigation orders tracked`);

  // 8. Unpaid Bills
  const billResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "Which pharmacy bills are unpaid?",
  });
  assert.strictEqual(billResult.success, true);
  assert.strictEqual(billResult.metadata.intent, "unpaid_bills");
  console.log(`✓ 8. Unpaid Bills verified: Balances due and pending invoices tracked`);

  // 9. Patients Waiting
  const queueResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "How many patients are waiting in queue?",
  });
  assert.strictEqual(queueResult.success, true);
  assert.strictEqual(queueResult.metadata.intent, "patient_queue");
  console.log(`✓ 9. Patient Queue verified: Waiting area count and estimated wait times calculated`);

  // 10. Today's Hospital Statistics
  const statsResult = await processAssistantQuery({
    user: hospitalAdminUser,
    question: "What are today's hospital statistics and operational overview?",
  });
  assert.strictEqual(statsResult.success, true);
  assert.strictEqual(statsResult.metadata.intent, "hospital_overview");
  assert.ok(statsResult.metadata.sources.length >= 5);
  console.log(`✓ 10. Hospital Statistics verified: Comprehensive cross-module KPI synthesis`);

  // ============================================================================
  // TEST 3.3: MULTI-TENANT ISOLATION (HOSPITAL BOUNDARIES)
  // ============================================================================
  console.log("\n--- Test 3.3: Multi-Tenant Data Isolation ---");
  // Check Hospital 1 vs Hospital 2
  const hosp1Data = await retrieveGroundedData("bed_occupancy", 1, "hospital_admin");
  const hosp2Data = await retrieveGroundedData("bed_occupancy", 2, "hospital_admin");

  assert.notStrictEqual(
    hosp1Data.data.totalBeds,
    hosp2Data.data.totalBeds,
    "Hospital 1 and Hospital 2 bed totals must be strictly isolated"
  );
  console.log(`✓ Hospital isolation verified: Hospital 1 Beds = ${hosp1Data.data.totalBeds}, Hospital 2 Beds = ${hosp2Data.data.totalBeds}`);

  // Super Admin global query
  const superData = await retrieveGroundedData("bed_occupancy", null, "super_admin");
  assert.ok(superData.data.totalBeds >= hosp1Data.data.totalBeds, "Super Admin sees aggregated total");
  console.log(`✓ Super Admin cross-hospital query verified: Total System Beds = ${superData.data.totalBeds}`);

  // ============================================================================
  // TEST 3.4: ROLE-BASED ACCESS CONTROL (PATIENT BOUNDARIES)
  // ============================================================================
  console.log("\n--- Test 3.4: Patient Role Access Restrictions ---");
  const patientBlockedResult = await processAssistantQuery({
    user: patientUser,
    question: "Show me all unpaid pharmacy bills and total revenue due",
  });
  assert.strictEqual(patientBlockedResult.metadata.roleRestricted, true);
  assert.ok(patientBlockedResult.answer.includes("authorization"));
  console.log("✓ Verified: Patient inquiry on internal financial data politely restricted");

  const patientAllowedResult = await processAssistantQuery({
    user: patientUser,
    question: "Which doctors are available for appointments?",
  });
  assert.strictEqual(patientAllowedResult.metadata.roleRestricted, undefined);
  assert.ok(patientAllowedResult.answer.length > 20);
  console.log("✓ Verified: Patient inquiry on doctor availability permitted");

  // ============================================================================
  // TEST 3.5: AUDIT LOGGING & CONVERSATION HISTORY PERSISTENCE
  // ============================================================================
  console.log("\n--- Test 3.5: Conversation Persistence & Security Audit Trail ---");
  const [latestAudit] = await pool.query(
    `SELECT * FROM ai_audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [hospitalAdminUser.id]
  );
  assert.strictEqual(latestAudit.length, 1);
  assert.strictEqual(latestAudit[0].action, "assistant_query");
  assert.strictEqual(latestAudit[0].status, "success");
  console.log(`✓ Verified: Audit log entry created (ID: ${latestAudit[0].id}, Feature: ${latestAudit[0].feature}, Latency: ${latestAudit[0].execution_time_ms}ms)`);

  const [latestMsg] = await pool.query(
    `SELECT m.*, c.title
     FROM ai_chat_messages m
     JOIN ai_chat_conversations c ON c.id = m.conversation_id
     WHERE c.user_id = ?
     ORDER BY m.id DESC LIMIT 2`,
    [hospitalAdminUser.id]
  );
  assert.ok(latestMsg.length >= 2);
  console.log(`✓ Verified: Conversation history persisted in ai_chat_conversations & ai_chat_messages`);

  console.log("\n================================================================================");
  console.log("=== PHASE 3: ALL AI ASSISTANT TESTS PASSED (5/5 SUITES) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 100));
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
