const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getProviderInfo, callModel, CLINICAL_DISCLAIMER } = require("../services/aiProviderService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 2: AI INFRASTRUCTURE & DATABASE VERIFICATION TEST SUITE ===");
  console.log("================================================================================\n");

  // 1. Verify Database Schema Additions
  console.log("--- Test 2.1: Additive Database Tables & Primary Keys ---");
  const expectedTables = [
    "ai_chat_conversations",
    "ai_chat_messages",
    "ai_generated_reports",
    "ai_automation_rules",
    "digital_twin_simulations",
    "ai_audit_logs",
  ];

  for (const table of expectedTables) {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
      [table]
    );
    assert.strictEqual(rows.length, 1, `Table ${table} must exist in MySQL database`);

    const [pk] = await pool.query(`
      SELECT COLUMN_NAME
      FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = 'PRIMARY'
    `, [table]);
    assert.strictEqual(pk.length, 1, `Table ${table} must have an explicit PRIMARY KEY`);
    assert.strictEqual(pk[0].COLUMN_NAME, "id", `Table ${table} primary key must be 'id'`);
    console.log(`✓ Verified table '${table}' exists with PRIMARY KEY (id)`);
  }

  // 2. Verify Foreign Key Referential Integrity
  console.log("\n--- Test 2.2: Foreign Key Constraint Enforcement ---");
  let invalidFkBlocked = false;
  try {
    // Attempt insert with non-existent hospital_id (99999999)
    await pool.query(
      `INSERT INTO ai_automation_rules (hospital_id, rule_type, name, threshold_value)
       VALUES (99999999, 'low_stock_alert', 'Invalid Test Rule', 10.00)`
    );
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
      invalidFkBlocked = true;
    }
  }
  assert.strictEqual(invalidFkBlocked, true, "Inserting non-existent hospital_id must be rejected by foreign key constraints");
  console.log("✓ Verified: Foreign key rejects invalid hospital reference");

  // 3. Test AI Provider Abstraction Service & Secrets Protection
  console.log("\n--- Test 2.3: AI Provider Service & Secrets Protection ---");
  const providerInfo = getProviderInfo();
  assert.ok(providerInfo.provider, "Provider info must specify active provider");
  assert.ok(providerInfo.model, "Provider info must specify active model");
  assert.strictEqual(providerInfo.apiKey, undefined, "API keys must NEVER be exposed in getProviderInfo()");
  console.log(`✓ Verified provider info: [${providerInfo.provider}] running model [${providerInfo.model}] (Secrets isolated)`);

  // 4. Test Local Heuristic Execution
  console.log("\n--- Test 2.4: Deterministic Local Heuristic Execution ---");
  const dummyContext = {
    overview: {
      totalAppointmentsToday: 42,
      patientsWaiting: 7,
      activeAdmissions: 12,
      occupiedBeds: 25,
      totalBeds: 30,
      occupancyRate: 83,
      availableBeds: 5,
      lowStockCount: 4,
      pendingLabTests: 8,
      pendingBillsCount: 3,
      pendingBillsAmount: 4500,
    },
  };

  const response = await callModel({
    systemPrompt: "You are a hospital assistant.",
    userPrompt: "What is today's hospital overview?",
    contextData: dummyContext,
  });

  assert.strictEqual(response.success, true, "callModel must return success = true");
  assert.ok(response.content.includes("42"), "Response must reflect ground-truth context data (42 appointments)");
  assert.ok(response.content.includes("25 / 30"), "Response must reflect bed occupancy (25 / 30)");
  assert.strictEqual(response.disclaimer, CLINICAL_DISCLAIMER, "Clinical disclaimer must be attached");
  console.log("✓ Verified local heuristic provider synthesizes verified operational metrics accurately");

  // 5. Test AI API Fallback Resilience
  console.log("\n--- Test 2.5: AI Provider Graceful Fallback on External Outage ---");
  // Temporarily set provider to invalid external API to simulate outage
  const origProvider = process.env.AI_PROVIDER;
  const origKey = process.env.GEMINI_API_KEY;
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "invalid_dummy_key_for_outage_test";

  const fallbackResult = await callModel({
    userPrompt: "Give me appointment stats",
    contextData: { appointmentInsights: { totalToday: 15, completedToday: 10, inWaitingToday: 5 } },
  });

  assert.strictEqual(fallbackResult.success, true, "Fallback must succeed even when external API fails");
  assert.strictEqual(fallbackResult.fallbackOccurred, true, "fallbackOccurred must be true");
  assert.strictEqual(fallbackResult.provider, "local", "Must fall back to local provider");
  assert.ok(fallbackResult.content.includes("15"), "Fallback response must maintain data accuracy");

  // Restore env
  process.env.AI_PROVIDER = origProvider;
  process.env.GEMINI_API_KEY = origKey;
  console.log("✓ Verified automatic graceful fallback guarantees zero downtime");

  // 6. Test AI Audit Log Persistence
  console.log("\n--- Test 2.6: AI Audit Logging ---");
  const [testUser] = await pool.query("SELECT id, hospital_id FROM users WHERE role_id = 2 LIMIT 1");
  const userId = testUser[0]?.id || 1;
  const hospitalId = testUser[0]?.hospital_id || 1;

  await pool.query(
    `INSERT INTO ai_audit_logs (hospital_id, user_id, action, feature, query_text, model_used, execution_time_ms, status)
     VALUES (?, ?, 'test_query', 'hospital_overview', 'How many beds are available?', 'local-heuristic-v1', 12, 'success')`,
    [hospitalId, userId]
  );

  const [auditCheck] = await pool.query(
    "SELECT * FROM ai_audit_logs WHERE action = 'test_query' AND user_id = ? ORDER BY id DESC LIMIT 1",
    [userId]
  );
  assert.strictEqual(auditCheck.length, 1, "Audit record must be successfully inserted");
  assert.strictEqual(auditCheck[0].feature, "hospital_overview");
  console.log("✓ Verified AI audit log persistence and auditability");

  console.log("\n================================================================================");
  console.log("=== PHASE 2: ALL AI INFRASTRUCTURE TESTS PASSED (6/6 SUITES) ===");
  console.log("================================================================================\n");

  await pool.end();
  // Allow undici / fetch handles to close gracefully on Windows
  await new Promise((resolve) => setTimeout(resolve, 100));
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
