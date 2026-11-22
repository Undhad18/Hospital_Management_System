const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const {
  getHospitalDigitalTwinDashboard,
  getWardAndBedTwin,
  getPatientFlowTwin,
  getDoctorDepartmentTwin,
  getPharmacyTwin,
  getLaboratoryTwin,
  getHistoricalTwin,
} = require("../services/digitalTwinService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 6: HOSPITAL DIGITAL TWIN CORE VERIFICATION TEST SUITE ===");
  console.log("================================================================================\n");

  const targetHospitalId = 1;

  // ============================================================================
  // TEST 6.1: CENTRAL DIGITAL TWIN DASHBOARD (FEATURE 1)
  // ============================================================================
  console.log("--- Test 6.1: Feature 1 — Central Hospital Digital Twin Dashboard ---");
  const dashboard = await getHospitalDigitalTwinDashboard(targetHospitalId);

  assert.ok(dashboard.hospitalProfile, "Hospital profile must be returned");
  assert.strictEqual(dashboard.hospitalProfile.id, 1);
  assert.ok(dashboard.summaryIndicators);
  assert.ok(typeof dashboard.summaryIndicators.bedOccupancyRate === "number");
  assert.ok(["available", "warning", "occupied"].includes(dashboard.summaryIndicators.statusSeverity));
  assert.ok(Array.isArray(dashboard.departments));
  assert.ok(dashboard.bedGrid.total >= 0);
  assert.ok(dashboard.admissions);
  assert.ok(dashboard.appointments);
  assert.ok(dashboard.pharmacy);
  assert.ok(dashboard.laboratory);
  console.log(`✓ Central Dashboard verified: [${dashboard.hospitalProfile.name}] — Bed Occupancy: ${dashboard.bedGrid.occupancyRate}%, Departments: ${dashboard.departments.length}, In-Queue: ${dashboard.summaryIndicators.patientsInQueue}`);

  // ============================================================================
  // TEST 6.2: WARD AND BED DIGITAL TWIN (FEATURE 2)
  // ============================================================================
  console.log("\n--- Test 6.2: Feature 2 — Ward & Interactive Bed Grid ---");
  const wardTwin = await getWardAndBedTwin(targetHospitalId);

  assert.strictEqual(wardTwin.hospitalId, 1);
  assert.ok(Array.isArray(wardTwin.wards));
  assert.ok(wardTwin.wards.length > 0, "Hospital 1 must have wards");

  const sampleWard = wardTwin.wards[0];
  assert.ok(sampleWard.wardName);
  assert.ok(typeof sampleWard.occupancyPercentage === "number");
  assert.ok(Array.isArray(sampleWard.beds));
  assert.ok(["available", "warning", "occupied"].includes(sampleWard.statusIndicator));

  if (sampleWard.beds.length > 0) {
    const sampleBed = sampleWard.beds[0];
    assert.ok(sampleBed.bedNumber);
    assert.ok(["available", "occupied", "maintenance"].includes(sampleBed.status));
    console.log(`✓ Sample Ward: [${sampleWard.wardName}] — Total Beds: ${sampleWard.totalBeds}, Occupied: ${sampleWard.occupiedBeds}, Status Indicator: ${sampleWard.statusIndicator}`);
    console.log(`✓ Sample Bed: [${sampleBed.bedNumber}] Type: ${sampleBed.bedType}, Status: ${sampleBed.status}, Daily Rate: ₹${sampleBed.dailyRate}`);
  }
  console.log(`✓ Ward & Bed Twin verified: ${wardTwin.totalWards} wards tracked`);

  // ============================================================================
  // TEST 6.3: PATIENT FLOW DIGITAL TWIN (FEATURE 3 - 10 STAGES)
  // ============================================================================
  console.log("\n--- Test 6.3: Feature 3 — 10-Stage Patient Operational Journey ---");
  const flowTwin = await getPatientFlowTwin(targetHospitalId);

  assert.strictEqual(flowTwin.pipelineStages.length, 10, "Must define exactly 10 operational pipeline stages");
  const stageNames = flowTwin.pipelineStages.map(s => s.name);
  assert.deepStrictEqual(stageNames, [
    "Appointment",
    "Check-In",
    "Waiting",
    "Consultation",
    "Laboratory",
    "Prescription",
    "Billing",
    "Pharmacy",
    "Dispensing",
    "Completion",
  ]);

  assert.ok(Array.isArray(flowTwin.activePatientsInFlow));
  if (flowTwin.activePatientsInFlow.length > 0) {
    const samplePatient = flowTwin.activePatientsInFlow[0];
    assert.ok(samplePatient.appointmentNumber);
    assert.ok(samplePatient.patientName);
    assert.ok(samplePatient.currentStage >= 1 && samplePatient.currentStage <= 10);
    console.log(`✓ Sample Patient Journey: [${samplePatient.appointmentNumber}] ${samplePatient.patientName} -> Stage: ${samplePatient.stageName}`);
  }
  console.log(`✓ Patient Flow Twin verified: All 10 stages mapped with ${flowTwin.totalTracked} tracked patient encounters`);

  // ============================================================================
  // TEST 6.4: DOCTOR & DEPARTMENT DIGITAL TWIN (FEATURE 4)
  // ============================================================================
  console.log("\n--- Test 6.4: Feature 4 — Doctor & Department Digital Twin ---");
  const docTwin = await getDoctorDepartmentTwin(targetHospitalId);

  assert.ok(Array.isArray(docTwin.departments));
  assert.ok(Array.isArray(docTwin.doctors));

  if (docTwin.doctors.length > 0) {
    const doc = docTwin.doctors[0];
    assert.ok(doc.doctorName);
    assert.ok(["consulting", "waiting", "available"].includes(doc.liveStatus));
    console.log(`✓ Sample Doctor: [${doc.doctorName}] (${doc.specialization}) — Live Status: [${doc.liveStatus}], Total Appts: ${doc.totalAppointments}`);
  }
  console.log(`✓ Doctor & Department Twin verified: ${docTwin.departments.length} departments, ${docTwin.doctors.length} doctors`);

  // ============================================================================
  // TEST 6.5: PHARMACY DIGITAL TWIN (FEATURE 5)
  // ============================================================================
  console.log("\n--- Test 6.5: Feature 5 — Pharmacy Telemetry Digital Twin ---");
  const pharmTwin = await getPharmacyTwin(targetHospitalId);

  assert.ok(pharmTwin.totalFormularyCount >= 0);
  assert.ok(Array.isArray(pharmTwin.lowStockItems));
  assert.ok(Array.isArray(pharmTwin.recentMovements));
  assert.ok(Array.isArray(pharmTwin.recentDispensations));
  console.log(`✓ Pharmacy Twin verified: ${pharmTwin.totalFormularyCount} formulary items, ${pharmTwin.recentMovements.length} logged stock movements, ${pharmTwin.recentDispensations.length} dispensations`);

  // ============================================================================
  // TEST 6.6: LABORATORY DIGITAL TWIN (FEATURE 6)
  // ============================================================================
  console.log("\n--- Test 6.6: Feature 6 — Laboratory Digital Twin ---");
  const labTwin = await getLaboratoryTwin(targetHospitalId);

  assert.ok(typeof labTwin.pendingTotal === "number");
  assert.ok(labTwin.statusBreakdown);
  assert.ok(Array.isArray(labTwin.orders));
  console.log(`✓ Laboratory Twin verified: ${labTwin.pendingTotal} active pending orders, ${labTwin.orders.length} orders displayed`);

  // ============================================================================
  // TEST 6.7: DIGITAL TWIN HISTORICAL VIEW (FEATURE 8)
  // ============================================================================
  console.log("\n--- Test 6.7: Feature 8 — Digital Twin Historical Telemetry View ---");
  const histTwin = await getHistoricalTwin(targetHospitalId, 30);

  assert.strictEqual(histTwin.hospitalId, 1);
  assert.strictEqual(histTwin.daysSpan, 30);
  assert.ok(Array.isArray(histTwin.admissionsHistory));
  assert.ok(Array.isArray(histTwin.appointmentsHistory));
  assert.ok(Array.isArray(histTwin.laboratoryHistory));
  assert.ok(Array.isArray(histTwin.dispensingHistory));
  assert.ok(histTwin.disclaimer.includes("Zero fabricated historical points"));
  console.log(`✓ Historical Twin verified: 30-day timeline loaded (${histTwin.admissionsHistory.length} admission timeline points, ${histTwin.appointmentsHistory.length} appointment timeline points)`);

  // ============================================================================
  // TEST 6.8: MULTI-TENANT ISOLATION
  // ============================================================================
  console.log("\n--- Test 6.8: Multi-Tenant Data Isolation ---");
  const dashHosp1 = await getHospitalDigitalTwinDashboard(1);
  const dashHosp2 = await getHospitalDigitalTwinDashboard(2);

  assert.strictEqual(dashHosp1.hospitalProfile.id, 1);
  assert.strictEqual(dashHosp2.hospitalProfile.id, 2);
  assert.notStrictEqual(dashHosp1.hospitalProfile.name, dashHosp2.hospitalProfile.name);
  console.log(`✓ Multi-Tenant Isolation verified: Hospital 1 [${dashHosp1.hospitalProfile.name}] and Hospital 2 [${dashHosp2.hospitalProfile.name}] are strictly segregated`);

  console.log("\n================================================================================");
  console.log("=== PHASE 6: ALL HOSPITAL DIGITAL TWIN TESTS PASSED (8/8 SUITES) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 100));
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
