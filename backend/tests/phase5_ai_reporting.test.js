const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const { generateReport, listReports, getReportById } = require("../services/aiReportingService");
const { getActiveWorkflowNotifications, getAutomationOpportunitiesMatrix } = require("../services/aiWorkflowNotificationService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 5: AI AUTOMATED REPORTS & WORKFLOW NOTIFICATIONS TEST SUITE ===");
  console.log("================================================================================\n");

  const hospitalAdminUser = {
    id: 2,
    hospital_id: 1,
    hospitalId: 1,
    role: "hospital_admin",
  };

  const superAdminUser = {
    id: 1,
    hospital_id: null,
    hospitalId: null,
    role: "super_admin",
  };

  // ============================================================================
  // TEST 5.1: DAILY OPERATIONAL REPORT GENERATION
  // ============================================================================
  console.log("--- Test 5.1: Feature 9 — Daily Operational Report Generation ---");
  const dailyReport = await generateReport({
    hospitalId: 1,
    reportType: "daily_operational",
    user: hospitalAdminUser,
  });

  assert.ok(dailyReport.id > 0, "Report ID must be a positive integer");
  assert.ok(dailyReport.reportNumber.startsWith("DAI-"), "Report number must start with DAI-");
  assert.strictEqual(dailyReport.reportType, "daily_operational");
  assert.ok(dailyReport.summary.includes("Daily Hospital Operational Report"));
  assert.ok(Array.isArray(dailyReport.recommendations));
  assert.ok(dailyReport.metricsSnapshot.appointments);
  console.log(`✓ Daily Operational Report generated: [${dailyReport.reportNumber}] (ID: ${dailyReport.id})`);

  // ============================================================================
  // TEST 5.2: SPECIALIZED OPERATIONAL REPORTS (BEDS & INVENTORY)
  // ============================================================================
  console.log("\n--- Test 5.2: Specialized Reports (Bed Occupancy & Pharmacy Inventory) ---");
  const bedReport = await generateReport({
    hospitalId: 1,
    reportType: "bed_occupancy",
    user: hospitalAdminUser,
  });
  assert.ok(bedReport.reportNumber.startsWith("BED-"));
  assert.ok(bedReport.summary.includes("Bed Occupancy"));
  console.log(`✓ Bed Occupancy Report generated: [${bedReport.reportNumber}]`);

  const invReport = await generateReport({
    hospitalId: 1,
    reportType: "inventory_forecast",
    user: hospitalAdminUser,
  });
  assert.ok(invReport.reportNumber.startsWith("INV-"));
  assert.ok(invReport.summary.includes("Pharmacy Formulary"));
  console.log(`✓ Pharmacy Inventory Report generated: [${invReport.reportNumber}]`);

  // ============================================================================
  // TEST 5.3: NATURAL LANGUAGE CUSTOM REPORT GENERATION
  // ============================================================================
  console.log("\n--- Test 5.3: Natural Language On-Demand Report ---");
  const nlReport = await generateReport({
    hospitalId: 1,
    reportType: "custom_nl",
    nlPrompt: "Provide an executive summary of current bed occupancy and pending lab orders",
    user: hospitalAdminUser,
  });
  assert.ok(nlReport.id > 0);
  assert.ok(nlReport.summary.length > 50);
  console.log(`✓ Natural Language Custom Report generated: [${nlReport.reportNumber}]`);

  // ============================================================================
  // TEST 5.4: REPORT LISTING, RETRIEVAL & TENANT ISOLATION
  // ============================================================================
  console.log("\n--- Test 5.4: Report Querying & Multi-Tenant Data Isolation ---");
  const reportsList = await listReports(1, 10);
  assert.ok(reportsList.length >= 4, "Must retrieve at least the 4 generated reports");
  console.log(`✓ Reports List: Retrieved ${reportsList.length} saved reports for Hospital 1`);

  const fetchedReport = await getReportById(dailyReport.id, 1, false);
  assert.strictEqual(fetchedReport.id, dailyReport.id);
  assert.strictEqual(fetchedReport.report_number, dailyReport.reportNumber);
  console.log(`✓ Single Report Retrieval verified: [${fetchedReport.report_number}]`);

  // Cross-tenant access attempt: Hospital 2 user trying to fetch Hospital 1's report
  let crossTenantBlocked = false;
  try {
    await getReportById(dailyReport.id, 2, false);
  } catch (err) {
    if (err.message.includes("Unauthorized")) crossTenantBlocked = true;
  }
  assert.strictEqual(crossTenantBlocked, true, "Cross-hospital report access must be blocked");
  console.log("✓ Multi-tenant isolation verified: Hospital 2 blocked from viewing Hospital 1 report");

  // ============================================================================
  // TEST 5.5: ACTIVE WORKFLOW NOTIFICATIONS & THRESHOLD ALERTS (FEATURE 10)
  // ============================================================================
  console.log("\n--- Test 5.5: Feature 10 — Intelligent Workflow Notifications ---");
  const activeAlertsResult = await getActiveWorkflowNotifications(1);

  assert.ok(typeof activeAlertsResult.totalActiveAlerts === "number");
  assert.ok(Array.isArray(activeAlertsResult.alerts));
  assert.ok(activeAlertsResult.disclaimer.includes("human authorization"));

  if (activeAlertsResult.alerts.length > 0) {
    const alert = activeAlertsResult.alerts[0];
    assert.ok(alert.id);
    assert.ok(alert.department);
    assert.ok(["critical", "warning", "info"].includes(alert.severity));
    assert.ok(alert.suggestedAction);
    assert.ok(alert.humanApprovalRequired);
    console.log(`✓ Active Alert Sample: [${alert.severity.toUpperCase()}] ${alert.title} — ${alert.suggestedAction}`);
  }
  console.log(`✓ Workflow Notifications verified: ${activeAlertsResult.totalActiveAlerts} active alerts scanned`);

  // ============================================================================
  // TEST 5.6: AI AUTOMATION OPPORTUNITIES MATRIX (SECTION 6)
  // ============================================================================
  console.log("\n--- Test 5.6: Section 6 — AI Automation Opportunities Matrix ---");
  const matrix = await getAutomationOpportunitiesMatrix(1);

  assert.strictEqual(matrix.length, 11, "Must contain all 11 audited departmental opportunities");
  const depts = matrix.map(m => m.department);
  assert.ok(depts.includes("Reception"));
  assert.ok(depts.includes("Doctor"));
  assert.ok(depts.includes("Pharmacy"));
  assert.ok(depts.includes("Laboratory"));
  assert.ok(depts.includes("Admission"));
  assert.ok(depts.includes("Billing"));
  assert.ok(depts.includes("Hospital Admin"));
  assert.ok(depts.includes("Management"));

  matrix.forEach(row => {
    assert.ok(row.manualTask, "manualTask required");
    assert.ok(row.proposedAutomation, "proposedAutomation required");
    assert.ok(row.operationalBenefit, "operationalBenefit required");
    assert.ok(row.safetyRisks, "safetyRisks required");
    assert.ok(row.humanApprovalRequirement, "humanApprovalRequirement required");
    assert.ok(row.liveDataMetrics, "liveDataMetrics required");
  });
  console.log("✓ AI Automation Opportunities Matrix verified: 11/11 departmental workflows evaluated with live data");

  console.log("\n================================================================================");
  console.log("=== PHASE 5: ALL AI REPORTING & WORKFLOW TESTS PASSED (6/6 SUITES) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 100));
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
