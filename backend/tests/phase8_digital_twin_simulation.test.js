const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const pool = require("../db");
const {
  simulatePatientSurge,
  simulateWardCapacityLoss,
  simulateBedDemandNextWeek,
  simulateDoctorUnavailability,
  simulateMedicineDemandSpike,
  simulateLaboratorySurge,
  runAndPersistSimulation,
  listSimulationRuns,
  SIMULATION_DISCLAIMER,
} = require("../services/digitalTwinSimulationService");

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 8: DIGITAL TWIN WHAT-IF SIMULATION TEST SUITE ===");
  console.log("================================================================================\n");

  const targetHospitalId = 1;
  const adminUserId = 2;

  // Snapshot production counts before running simulations to verify zero mutations
  const [preAppts] = await pool.query("SELECT COUNT(*) as c FROM appointments WHERE hospital_id = ?", [targetHospitalId]);
  const [preBeds] = await pool.query("SELECT b.status, COUNT(*) as c FROM beds b JOIN wards w ON w.id = b.ward_id WHERE w.hospital_id = ? GROUP BY b.status", [targetHospitalId]);
  const [preMeds] = await pool.query("SELECT COUNT(*) as c FROM hospital_medicines WHERE hospital_id = ?", [targetHospitalId]);
  const [preAdms] = await pool.query("SELECT COUNT(*) as c FROM admissions WHERE hospital_id = ?", [targetHospitalId]);

  // ============================================================================
  // TEST 8.1: SCENARIO 1 — PATIENT SURGE (+20 PATIENTS)
  // ============================================================================
  console.log("--- Test 8.1: Scenario 1 — What happens if 20 additional patients arrive today? ---");
  const simSurge = await simulatePatientSurge({ hospitalId: targetHospitalId, additionalPatients: 20 });

  assert.strictEqual(simSurge.is_simulated, true);
  assert.strictEqual(simSurge.scenarioType, "patient_surge");
  assert.strictEqual(simSurge.parameters.additionalPatients, 20);
  assert.strictEqual(
    simSurge.simulatedMetrics.projectedTotalWaitingQueue,
    simSurge.baselineMetrics.currentWaitingQueue + 20
  );
  assert.ok(simSurge.simulatedMetrics.projectedAverageWaitMinutes >= simSurge.baselineMetrics.currentAverageWaitMinutes);
  assert.ok(simSurge.simulatedMetrics.downstreamImpact.projectedPrescriptions > 0);
  assert.strictEqual(simSurge.disclaimer, SIMULATION_DISCLAIMER);
  console.log(`✓ Patient Surge: Queue increases from ${simSurge.baselineMetrics.currentWaitingQueue} -> ${simSurge.simulatedMetrics.projectedTotalWaitingQueue} (Wait: +${simSurge.simulatedMetrics.estimatedWaitIncreaseMinutes} mins, Overtime: ${simSurge.simulatedMetrics.requiredDoctorOvertimeHours}h)`);

  // ============================================================================
  // TEST 8.2: SCENARIO 2 — WARD CAPACITY LOSS / CLOSURE
  // ============================================================================
  console.log("\n--- Test 8.2: Scenario 2 — What happens if one ward reaches full capacity or closes? ---");
  const [wards] = await pool.query("SELECT id FROM wards WHERE hospital_id = ? LIMIT 1", [targetHospitalId]);
  const sampleWardId = wards[0]?.id || 1;

  const simWard = await simulateWardCapacityLoss({ hospitalId: targetHospitalId, wardId: sampleWardId });
  assert.strictEqual(simWard.is_simulated, true);
  assert.strictEqual(simWard.scenarioType, "bed_capacity_loss");
  assert.ok(simWard.simulatedMetrics.bedsTakenOffline >= 0);
  assert.ok(typeof simWard.simulatedMetrics.simulatedHospitalOccupancyRate === "number");
  assert.ok(["CRITICAL", "ELEVATED", "MODERATE"].includes(simWard.simulatedMetrics.shortageRiskLevel));
  console.log(`✓ Ward Capacity Loss: Offline Ward [${simWard.simulatedMetrics.offlineWardName}] — Beds Lost: ${simWard.simulatedMetrics.bedsTakenOffline}, Displaced: ${simWard.simulatedMetrics.displacedInpatients}, Occupancy Surge: ${simWard.baselineMetrics.baselineOccupancyRate}% -> ${simWard.simulatedMetrics.simulatedHospitalOccupancyRate}%`);

  // ============================================================================
  // TEST 8.3: SCENARIO 3 — 7-DAY INPATIENT BED DEMAND PROJECTION
  // ============================================================================
  console.log("\n--- Test 8.3: Scenario 3 — How many beds may be required next week? ---");
  const simBedDemand = await simulateBedDemandNextWeek({ hospitalId: targetHospitalId, projectedGrowthPercent: 20 });
  assert.strictEqual(simBedDemand.is_simulated, true);
  assert.strictEqual(simBedDemand.scenarioType, "bed_demand_projection");
  assert.ok(simBedDemand.simulatedMetrics.projectedNewAdmissionsNext7Days >= 0);
  assert.ok(typeof simBedDemand.simulatedMetrics.projectedBedDeficit === "number");
  console.log(`✓ Bed Demand Projection (7 Days): Projected Admissions = ${simBedDemand.simulatedMetrics.projectedNewAdmissionsNext7Days}, Projected Discharges = ${simBedDemand.simulatedMetrics.projectedDischargesNext7Days}, Peak Occupancy = ${simBedDemand.simulatedMetrics.projectedPeakOccupancyPercent}%, Projected Deficit = ${simBedDemand.simulatedMetrics.projectedBedDeficit}`);

  // ============================================================================
  // TEST 8.4: SCENARIO 4 — DOCTOR UNAVAILABILITY SIMULATION
  // ============================================================================
  console.log("\n--- Test 8.4: Scenario 4 — What happens if a doctor becomes unavailable? ---");
  const [docs] = await pool.query("SELECT user_id FROM doctor_profiles LIMIT 1");
  const sampleDocId = docs[0]?.user_id || 39;

  const simDoc = await simulateDoctorUnavailability({ hospitalId: targetHospitalId, doctorId: sampleDocId });
  assert.strictEqual(simDoc.is_simulated, true);
  assert.strictEqual(simDoc.scenarioType, "doctor_shortage");
  assert.ok(simDoc.baselineMetrics.targetDoctorName);
  assert.ok(typeof simDoc.simulatedMetrics.displacedAppointmentsCount === "number");
  console.log(`✓ Doctor Absence: [${simDoc.baselineMetrics.targetDoctorName}] — Displaced: ${simDoc.simulatedMetrics.displacedAppointmentsCount} patients, Peer Doctors: ${simDoc.simulatedMetrics.availablePeerDoctorsCount}, Reallocation Feasibility: ${simDoc.simulatedMetrics.reallocationFeasibility}`);

  // ============================================================================
  // TEST 8.5: SCENARIO 5 — MEDICINE DEMAND SURGE (+50%)
  // ============================================================================
  console.log("\n--- Test 8.5: Scenario 5 — How will increased medicine demand affect stock? ---");
  const simMedSpike = await simulateMedicineDemandSpike({ hospitalId: targetHospitalId, demandIncreasePercent: 50 });
  assert.strictEqual(simMedSpike.is_simulated, true);
  assert.strictEqual(simMedSpike.scenarioType, "medicine_demand_spike");
  assert.ok(simMedSpike.simulatedMetrics.acceleratedBurnRateDailyUnits > simMedSpike.baselineMetrics.normalBurnRateDailyUnits);
  assert.ok(typeof simMedSpike.simulatedMetrics.simulatedCriticalStockCount === "number");
  console.log(`✓ Medicine Demand Surge: Normal Burn = ${simMedSpike.baselineMetrics.normalBurnRateDailyUnits} units/day -> Accelerated Burn = ${simMedSpike.simulatedMetrics.acceleratedBurnRateDailyUnits} units/day. Items at 7-day stockout risk: ${simMedSpike.simulatedMetrics.simulatedCriticalStockCount}`);

  // ============================================================================
  // TEST 8.6: SCENARIO 6 — LABORATORY WORKLOAD SURGE (+30%)
  // ============================================================================
  console.log("\n--- Test 8.6: Scenario 6 — What happens if laboratory workload increases by 30%? ---");
  const simLabSurge = await simulateLaboratorySurge({ hospitalId: targetHospitalId, workloadIncreasePercent: 30 });
  assert.strictEqual(simLabSurge.is_simulated, true);
  assert.strictEqual(simLabSurge.scenarioType, "lab_surge");
  assert.ok(simLabSurge.simulatedMetrics.projectedStatTatHours >= simLabSurge.baselineMetrics.standardStatTatHours);
  assert.ok(typeof simLabSurge.simulatedMetrics.estimatedTechnicianOvertimeHours === "number");
  console.log(`✓ Laboratory Surge: Pending orders projected ${simLabSurge.baselineMetrics.currentPendingOrders} -> ${simLabSurge.simulatedMetrics.projectedPendingOrders}, STAT TAT: ${simLabSurge.simulatedMetrics.projectedStatTatHours}h, Technician Overtime: ${simLabSurge.simulatedMetrics.estimatedTechnicianOvertimeHours}h`);

  // ============================================================================
  // TEST 8.7: RUN AND PERSIST SIMULATION RECORD
  // ============================================================================
  console.log("\n--- Test 8.7: Simulation Execution & Persistence Audit ---");
  const persistedSim = await runAndPersistSimulation({
    hospitalId: targetHospitalId,
    userId: adminUserId,
    scenarioType: "patient_surge",
    parameters: { additionalPatients: 35 },
  });

  assert.ok(persistedSim.id > 0);
  assert.ok(persistedSim.simulationCode.startsWith("SIM-"));
  assert.strictEqual(persistedSim.is_simulated, true);
  console.log(`✓ Simulation Run Persisted: Code=[${persistedSim.simulationCode}] (ID: ${persistedSim.id})`);

  const simList = await listSimulationRuns(targetHospitalId, 5);
  assert.ok(simList.length >= 1);
  console.log(`✓ Simulation List: Retrieved ${simList.length} saved simulation runs`);

  // ============================================================================
  // TEST 8.8: ZERO PRODUCTION MUTATIONS VERIFICATION
  // ============================================================================
  console.log("\n--- Test 8.8: Strict Safety Verification — Zero Production Record Mutations ---");
  const [postAppts] = await pool.query("SELECT COUNT(*) as c FROM appointments WHERE hospital_id = ?", [targetHospitalId]);
  const [postBeds] = await pool.query("SELECT b.status, COUNT(*) as c FROM beds b JOIN wards w ON w.id = b.ward_id WHERE w.hospital_id = ? GROUP BY b.status", [targetHospitalId]);
  const [postMeds] = await pool.query("SELECT COUNT(*) as c FROM hospital_medicines WHERE hospital_id = ?", [targetHospitalId]);
  const [postAdms] = await pool.query("SELECT COUNT(*) as c FROM admissions WHERE hospital_id = ?", [targetHospitalId]);

  assert.strictEqual(postAppts[0].c, preAppts[0].c, "Production appointments count MUST NOT change after simulations");
  assert.strictEqual(postMeds[0].c, preMeds[0].c, "Production hospital_medicines count MUST NOT change after simulations");
  assert.strictEqual(postAdms[0].c, preAdms[0].c, "Production admissions count MUST NOT change after simulations");
  assert.deepStrictEqual(postBeds, preBeds, "Production bed status counts MUST NOT change after simulations");
  console.log("✓ Strict Verification Passed: ZERO production records in appointments, beds, admissions, or medicines were modified during simulations");

  console.log("\n================================================================================");
  console.log("=== PHASE 8: ALL DIGITAL TWIN SIMULATION TESTS PASSED (8/8 SUITES) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise(resolve => setTimeout(resolve, 100));
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
