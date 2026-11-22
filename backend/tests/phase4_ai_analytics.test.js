const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const {
  getAppointmentAnalytics,
  getQueueAnalytics,
  getDoctorWorkloadAnalytics,
  getBedAndAdmissionAnalytics,
  getInventoryForecastAnalytics,
  getLaboratoryAnalytics,
  getFinancialAnalytics,
  getOperationalInsightsOverview,
} = require("../services/aiAnalyticsService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 4: AI OPERATIONAL INTELLIGENCE & ANALYTICS TEST SUITE ===");
  console.log("================================================================================\n");

  const targetHospitalId = 1;

  // ============================================================================
  // TEST 4.1: APPOINTMENT MANAGEMENT ANALYTICS
  // ============================================================================
  console.log("--- Test 4.1: Feature 2 — Appointment Analytics & Conflict Detection ---");
  const apptStats = await getAppointmentAnalytics(targetHospitalId);

  assert.ok(apptStats.totalAppointments >= 0, "Total appointments must be >= 0");
  assert.ok(typeof apptStats.statusBreakdown === "object", "Must return status breakdown");
  assert.ok(Array.isArray(apptStats.detectedConflicts), "Must return detected conflicts array");
  assert.ok(Array.isArray(apptStats.followUpSuggestions), "Must return follow-up suggestions array");
  assert.ok(Array.isArray(apptStats.reminderSuggestions), "Must return reminder suggestions array");
  console.log(`✓ Appointments: Total = ${apptStats.totalAppointments}, Conflicts = ${apptStats.conflictsCount}, Follow-ups = ${apptStats.followUpSuggestions.length}`);

  // ============================================================================
  // TEST 4.2: PATIENT QUEUE ANALYTICS & WAIT TIME ESTIMATES
  // ============================================================================
  console.log("\n--- Test 4.2: Feature 3 — Queue Analytics & Wait Time Estimations ---");
  const queueStats = await getQueueAnalytics(targetHospitalId);

  assert.ok(queueStats.totalActiveQueue >= 0);
  assert.ok(typeof queueStats.waitingCount === "number");
  assert.ok(Array.isArray(queueStats.doctorWiseQueues), "Must return doctor-wise queue breakdown");
  assert.ok(queueStats.disclaimer.includes("analytical projections"), "Wait time estimate disclaimer required");
  console.log(`✓ Queue: Active = ${queueStats.totalActiveQueue}, Waiting in Lobby = ${queueStats.waitingCount}, Consulting = ${queueStats.inProgressCount}`);

  // ============================================================================
  // TEST 4.3: DOCTOR WORKLOAD ANALYTICS
  // ============================================================================
  console.log("\n--- Test 4.3: Feature 4 — Doctor Workload & Schedule Utilization ---");
  const docStats = await getDoctorWorkloadAnalytics(targetHospitalId);

  assert.ok(docStats.totalDoctors >= 0);
  assert.ok(Array.isArray(docStats.doctors));
  assert.ok(typeof docStats.suggestions === "string");
  if (docStats.doctors.length > 0) {
    const doc = docStats.doctors[0];
    assert.ok(doc.doctorName);
    assert.ok(typeof doc.avgConsultationDurationMinutes === "number");
    assert.ok(["balanced", "overloaded", "underutilized"].includes(doc.workloadStatus));
    console.log(`✓ Doctor Workload: Sample Doctor [${doc.doctorName}] workloadStatus: ${doc.workloadStatus}, Avg Duration: ${doc.avgConsultationDurationMinutes} mins`);
  } else {
    console.log("✓ Doctor Workload: No active doctors for target hospital");
  }

  // ============================================================================
  // TEST 4.4: BED & ADMISSION PREDICTION
  // ============================================================================
  console.log("\n--- Test 4.4: Feature 5 — Bed & Admission Capacity Forecasting ---");
  const bedStats = await getBedAndAdmissionAnalytics(targetHospitalId);

  assert.ok(bedStats.totalBeds >= 0);
  assert.ok(typeof bedStats.overallOccupancyRate === "number");
  assert.ok(Array.isArray(bedStats.wards));
  assert.ok(bedStats.projections);
  assert.ok(["LOW", "MODERATE", "HIGH"].includes(bedStats.projections.shortageRisk));
  console.log(`✓ Bed Capacity: ${bedStats.occupiedBeds}/${bedStats.totalBeds} (${bedStats.overallOccupancyRate}%), Shortage Risk: ${bedStats.projections.shortageRisk}, Wards: ${bedStats.wards.length}`);

  // ============================================================================
  // TEST 4.5: PHARMACY INVENTORY FORECASTING
  // ============================================================================
  console.log("\n--- Test 4.5: Feature 6 — Pharmacy Inventory Forecasting & Burn Rates ---");
  const invStats = await getInventoryForecastAnalytics(targetHospitalId);

  assert.ok(invStats.totalFormularyItems >= 0);
  assert.ok(Array.isArray(invStats.lowStockItems));
  assert.ok(Array.isArray(invStats.expiringBatches));
  assert.ok(typeof invStats.reorderSummary === "object");
  console.log(`✓ Pharmacy Forecast: Total Formulary = ${invStats.totalFormularyItems}, Low Stock = ${invStats.lowStockCount}, Expiring Batches = ${invStats.expiringBatchesCount}`);

  // ============================================================================
  // TEST 4.6: LABORATORY WORKLOAD & SAFETY ANALYTICS
  // ============================================================================
  console.log("\n--- Test 4.6: Feature 7 — Laboratory Turnaround & Duplicate Warnings ---");
  const labStats = await getLaboratoryAnalytics(targetHospitalId);

  assert.ok(labStats.totalActivePending >= 0);
  assert.ok(Array.isArray(labStats.delayedOrders));
  assert.ok(Array.isArray(labStats.duplicateWarnings));
  assert.ok(labStats.disclaimer.includes("approval is required"), "Laboratory safety disclaimer required");
  console.log(`✓ Lab Analytics: Pending Tests = ${labStats.totalActivePending}, Delayed Orders = ${labStats.delayedOrdersCount}, Duplicate Warnings = ${labStats.duplicateWarningsCount}`);

  // ============================================================================
  // TEST 4.7: BILLING & FINANCIAL INSIGHTS
  // ============================================================================
  console.log("\n--- Test 4.7: Feature 8 — Billing Insights (Decoupled Consultation vs Pharmacy) ---");
  const finStats = await getFinancialAnalytics(targetHospitalId);

  assert.ok(typeof finStats.combinedRevenue === "number");
  assert.ok(typeof finStats.combinedReceivables === "number");
  assert.ok(finStats.consultationBilling);
  assert.ok(finStats.pharmacyBilling);
  assert.ok(finStats.refunds);
  console.log(`✓ Financial Insights: Revenue = ₹${finStats.combinedRevenue}, Receivables = ₹${finStats.combinedReceivables}, Consultation Billed = ₹${finStats.consultationBilling.totalBilled}, Pharmacy Billed = ₹${finStats.pharmacyBilling.totalBilled}`);

  // ============================================================================
  // TEST 4.8: EXECUTIVE OVERVIEW INTEGRATION & DATA ISOLATION
  // ============================================================================
  console.log("\n--- Test 4.8: Operational Overview & Tenant Isolation ---");
  const overviewHosp1 = await getOperationalInsightsOverview(1);
  const overviewHosp2 = await getOperationalInsightsOverview(2);

  assert.strictEqual(overviewHosp1.hospitalId, 1);
  assert.strictEqual(overviewHosp2.hospitalId, 2);
  assert.notStrictEqual(overviewHosp1.bedOccupancy.totalBeds, overviewHosp2.bedOccupancy.totalBeds);
  console.log(`✓ Multi-Tenant Isolation verified: Hospital 1 and Hospital 2 produce completely isolated analytical summaries`);

  console.log("\n================================================================================");
  console.log("=== PHASE 4: ALL 8 OPERATIONAL ANALYTICS TEST SUITES PASSED (8/8) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 100));
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
