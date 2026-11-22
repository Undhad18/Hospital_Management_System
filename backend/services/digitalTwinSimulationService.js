const pool = require("../db");

/**
 * Digital Twin Simulation Service — Isolated In-Memory What-If Engine
 * 
 * Safety & Isolation Guarantees:
 * 1. 100% read-only queries against production clinical tables.
 * 2. Pure in-memory mathematical projection models. Zero mutations on live records.
 * 3. All outputs are explicitly stamped with `is_simulated: true` and simulation disclaimers.
 * 4. Human-in-the-loop: Simulation outputs are advisory; zero automated execution.
 */

const SIMULATION_DISCLAIMER =
  "HYPOTHETICAL SIMULATION ONLY: This projection was calculated using an isolated mathematical simulation layer. No production hospital records, appointments, beds, or inventory quantities were modified.";

function generateSimulationCode(prefix = "SIM") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
}

// ============================================================================
// SCENARIO 1: PATIENT SURGE SIMULATION
// What happens if N additional patients arrive today?
// ============================================================================
async function simulatePatientSurge({ hospitalId, additionalPatients = 20 }) {
  const surge = Math.max(1, Math.min(500, Number(additionalPatients) || 20));

  // 1. Fetch current baseline queue & active doctors
  const [queueRows] = await pool.query(
    `SELECT
       COUNT(*) as current_queue,
       SUM(CASE WHEN status = 'in_waiting' THEN 1 ELSE 0 END) as waiting_count,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count
     FROM appointments
     WHERE (? IS NULL OR hospital_id = ?)
       AND status IN ('in_waiting', 'in_progress', 'confirmed')`,
    [hospitalId, hospitalId]
  );

  const [docRows] = await pool.query(
    `SELECT COUNT(DISTINCT u.id) as active_doctors
     FROM users u
     JOIN doctor_profiles dp ON dp.user_id = u.id
     WHERE (? IS NULL OR u.hospital_id = ?)
       AND u.status = 'active'`,
    [hospitalId, hospitalId]
  );

  const currentWaiting = Number(queueRows[0]?.waiting_count || 0);
  const activeDoctors = Math.max(1, Number(docRows[0]?.active_doctors || 1));
  const AVG_CONSULTATION_MINUTES = 12;

  // Baseline metrics
  const baselineWaitMinutes = Math.round((currentWaiting / activeDoctors) * AVG_CONSULTATION_MINUTES);
  const baselineBacklogHours = Number(((currentWaiting * AVG_CONSULTATION_MINUTES) / 60).toFixed(1));

  // Simulated metrics
  const simulatedWaiting = currentWaiting + surge;
  const simulatedWaitMinutes = Math.round((simulatedWaiting / activeDoctors) * AVG_CONSULTATION_MINUTES);
  const additionalOvertimeHours = Number(((surge * AVG_CONSULTATION_MINUTES) / (activeDoctors * 60)).toFixed(1));
  const overflowProbability = simulatedWaitMinutes >= 60 ? "HIGH (>60m wait)" : simulatedWaitMinutes >= 35 ? "MODERATE" : "LOW";

  // Downstream impact estimates
  const estimatedLabOrders = Math.round(surge * 0.35); // ~35% of consults require lab
  const estimatedPrescriptions = Math.round(surge * 0.85); // ~85% require pharmacy
  const estimatedAdmissionReferrals = Math.round(surge * 0.08); // ~8% require admission

  const baselineMetrics = {
    currentWaitingQueue: currentWaiting,
    activeDoctorsOnDuty: activeDoctors,
    currentAverageWaitMinutes: baselineWaitMinutes,
    currentBacklogHours: baselineBacklogHours,
  };

  const simulatedMetrics = {
    additionalPatientsSimulated: surge,
    projectedTotalWaitingQueue: simulatedWaiting,
    projectedAverageWaitMinutes: simulatedWaitMinutes,
    estimatedWaitIncreaseMinutes: simulatedWaitMinutes - baselineWaitMinutes,
    requiredDoctorOvertimeHours: additionalOvertimeHours,
    queueOverflowRisk: overflowProbability,
    downstreamImpact: {
      projectedLabInvestigations: estimatedLabOrders,
      projectedPrescriptions: estimatedPrescriptions,
      projectedInpatientAdmissions: estimatedAdmissionReferrals,
    },
  };

  const impactSummary = `Simulating arrival of +${surge} walk-in patients: Queue increases from ${currentWaiting} to ${simulatedWaiting}. Average wait time expands by +${simulatedWaitMinutes - baselineWaitMinutes} mins to ${simulatedWaitMinutes} mins per patient. Downstream load: ~${estimatedPrescriptions} prescriptions and ~${estimatedLabOrders} laboratory orders.`;

  return {
    scenarioType: "patient_surge",
    scenarioName: `Patient Arrival Surge (+${surge} Patients)`,
    is_simulated: true,
    parameters: { additionalPatients: surge },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      activeDoctors < 3 ? "Call in on-call backup physicians to prevent lobby queue saturation." : "Doctor staffing can absorb surge with staggered consults.",
      simulatedWaitMinutes >= 45 ? "Open temporary triage desk to prioritize urgent clinical cases." : "Standard OPD check-in workflow is adequate.",
      `Alert hospital pharmacy to prepare for ~${estimatedPrescriptions} additional electronic prescriptions.`,
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SCENARIO 2: WARD CAPACITY LOSS SIMULATION
// What happens if one ward reaches 100% capacity or closes for maintenance?
// ============================================================================
async function simulateWardCapacityLoss({ hospitalId, wardId }) {
  const targetWardId = Number(wardId);

  // Fetch all wards and beds
  const [wards] = await pool.query(
    `SELECT
       w.id as ward_id,
       w.name as ward_name,
       w.ward_type,
       COUNT(b.id) as total_beds,
       SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) as occupied_beds,
       SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) as available_beds
     FROM wards w
     LEFT JOIN beds b ON b.ward_id = w.id
     WHERE (? IS NULL OR w.hospital_id = ?)
       AND w.status = 'active'
     GROUP BY w.id, w.name, w.ward_type`,
    [hospitalId, hospitalId]
  );

  let baselineTotalBeds = 0;
  let baselineOccupiedBeds = 0;
  let baselineAvailableBeds = 0;
  let affectedWard = null;

  wards.forEach(w => {
    baselineTotalBeds += Number(w.total_beds || 0);
    baselineOccupiedBeds += Number(w.occupied_beds || 0);
    baselineAvailableBeds += Number(w.available_beds || 0);
    if (w.ward_id === targetWardId) affectedWard = w;
  });

  if (!affectedWard && wards.length > 0) {
    affectedWard = wards[0];
  }

  const lostBeds = Number(affectedWard?.total_beds || 0);
  const displacedOccupants = Number(affectedWard?.occupied_beds || 0);

  // Simulated metrics
  const simulatedTotalBeds = Math.max(1, baselineTotalBeds - lostBeds);
  const simulatedOccupancyRate = Math.round((baselineOccupiedBeds / simulatedTotalBeds) * 100);
  const remainingAvailableBeds = Math.max(0, baselineAvailableBeds - Number(affectedWard?.available_beds || 0) - displacedOccupants);

  const alternativeWards = wards
    .filter(w => w.ward_id !== affectedWard?.ward_id && Number(w.available_beds) > 0)
    .map(w => ({ wardName: w.ward_name, availableBeds: Number(w.available_beds) }));

  const baselineMetrics = {
    totalHospitalBeds: baselineTotalBeds,
    occupiedBeds: baselineOccupiedBeds,
    availableBeds: baselineAvailableBeds,
    baselineOccupancyRate: baselineTotalBeds > 0 ? Math.round((baselineOccupiedBeds / baselineTotalBeds) * 100) : 0,
    selectedWard: affectedWard?.ward_name || "Unknown Ward",
  };

  const simulatedMetrics = {
    offlineWardName: affectedWard?.ward_name,
    bedsTakenOffline: lostBeds,
    displacedInpatients: displacedOccupants,
    simulatedTotalHospitalBeds: simulatedTotalBeds,
    simulatedRemainingAvailableBeds: remainingAvailableBeds,
    simulatedHospitalOccupancyRate: simulatedOccupancyRate,
    shortageRiskLevel: simulatedOccupancyRate >= 90 ? "CRITICAL" : simulatedOccupancyRate >= 75 ? "ELEVATED" : "MODERATE",
    alternativeWardsAvailable: alternativeWards,
  };

  const impactSummary = `Simulating closure/saturation of [${affectedWard?.ward_name}]: ${lostBeds} beds removed from capacity. Overall hospital occupancy surges from ${baselineMetrics.baselineOccupancyRate}% to ${simulatedOccupancyRate}%. ${displacedOccupants} active inpatients require transfer to alternative units.`;

  return {
    scenarioType: "bed_capacity_loss",
    scenarioName: `Ward Closure / Saturation (${affectedWard?.ward_name})`,
    is_simulated: true,
    parameters: { wardId: affectedWard?.ward_id, wardName: affectedWard?.ward_name },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      displacedOccupants > 0 ? `Coordinate inter-ward transfer of ${displacedOccupants} patients to: ${alternativeWards.map(w => `${w.wardName} (${w.availableBeds} beds)`).join(", ") || "None available (Emergency bed overflow required)"}.` : "Zero active inpatients currently displaced.",
      simulatedOccupancyRate >= 85 ? "Halt non-emergency elective surgical admissions immediately." : "Hospital retains sufficient buffer capacity.",
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SCENARIO 3: BED DEMAND PROJECTION (NEXT WEEK)
// How many beds will be required next week?
// ============================================================================
async function simulateBedDemandNextWeek({ hospitalId, projectedGrowthPercent = 15 }) {
  const growthFactor = 1 + (Number(projectedGrowthPercent || 15) / 100);

  // 1. Current Bed State
  const [bedRows] = await pool.query(
    `SELECT
       COUNT(*) as total_beds,
       SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) as occupied_beds,
       SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) as available_beds
     FROM beds b
     JOIN wards w ON w.id = b.ward_id
     WHERE (? IS NULL OR w.hospital_id = ?)`,
    [hospitalId, hospitalId]
  );

  // 2. 30-Day Historical Admission Velocity
  const [history] = await pool.query(
    `SELECT COUNT(*) as recent_admissions
     FROM admissions
     WHERE (? IS NULL OR hospital_id = ?)
       AND admission_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [hospitalId, hospitalId]
  );

  const totalBeds = Number(bedRows[0]?.total_beds || 0);
  const occupiedBeds = Number(bedRows[0]?.occupiedBeds || 0);
  const availableBeds = Number(bedRows[0]?.available_beds || 0);

  const historicalAdmissions30d = Number(history[0]?.recent_admissions || 0);
  const avgDailyAdmissions = historicalAdmissions30d > 0 ? (historicalAdmissions30d / 30) : 2.0;

  // Projections over 7 days
  const baselineProjectedAdmissions7d = Math.round(avgDailyAdmissions * 7);
  const simulatedProjectedAdmissions7d = Math.round(baselineProjectedAdmissions7d * growthFactor);

  // Inpatient turnover model: average length of stay (ALOS) = ~3.5 days
  const ALOS_DAYS = 3.5;
  const projectedDischarges7d = Math.round(simulatedProjectedAdmissions7d * (7 / (7 + ALOS_DAYS)));
  const netInpatientGrowth = simulatedProjectedAdmissions7d - projectedDischarges7d;
  const projectedPeakOccupancy = Math.min(totalBeds, occupiedBeds + netInpatientGrowth);
  const projectedDeficit = Math.max(0, (occupiedBeds + netInpatientGrowth) - totalBeds);

  const baselineMetrics = {
    totalBeds,
    currentlyOccupied: occupiedBeds,
    currentlyAvailable: availableBeds,
    avgDailyAdmissionsHistorical: Number(avgDailyAdmissions.toFixed(1)),
    historicalAdmissionsPast30Days: historicalAdmissions30d,
  };

  const simulatedMetrics = {
    projectedGrowthRatePercent: Number(projectedGrowthPercent),
    projectedNewAdmissionsNext7Days: simulatedProjectedAdmissions7d,
    projectedDischargesNext7Days: projectedDischarges7d,
    netInpatientGrowth7Days: netInpatientGrowth,
    projectedPeakOccupiedBeds: projectedPeakOccupancy,
    projectedPeakOccupancyPercent: totalBeds > 0 ? Math.round((projectedPeakOccupancy / totalBeds) * 100) : 0,
    projectedBedDeficit: projectedDeficit,
    contingencyCapacityNeeded: projectedDeficit > 0 ? projectedDeficit : 0,
  };

  const impactSummary = `7-Day Inpatient Projection (+${projectedGrowthPercent}% growth): Expecting ${simulatedProjectedAdmissions7d} admissions against ${projectedDischarges7d} anticipated discharges (Net change: +${netInpatientGrowth} beds). Peak occupancy projected at ${simulatedMetrics.projectedPeakOccupancyPercent}%. Projected deficit: ${projectedDeficit} beds.`;

  return {
    scenarioType: "bed_demand_projection",
    scenarioName: "7-Day Inpatient Bed Demand Projection",
    is_simulated: true,
    parameters: { projectedGrowthPercent, horizonDays: 7 },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      projectedDeficit > 0 ? `CRITICAL DEFICIT: Prepare ${projectedDeficit} surge overflow beds or arrange early discharge protocol.` : "Inpatient capacity is sufficient to accommodate projected 7-day volume.",
      "Conduct proactive daily multi-disciplinary discharge planning rounds.",
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SCENARIO 4: DOCTOR UNAVAILABILITY SIMULATION
// What happens if a doctor becomes unavailable?
// ============================================================================
async function simulateDoctorUnavailability({ hospitalId, doctorId }) {
  let docId = Number(doctorId);

  // Fetch target doctor details and active appointments
  let targetDoc = [];
  if (docId && !isNaN(docId)) {
    const [docs] = await pool.query(
      `SELECT u.id, u.full_name, u.department_id, dp.specialization, d.name as department_name
       FROM users u
       JOIN doctor_profiles dp ON dp.user_id = u.id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ? LIMIT 1`,
      [docId]
    );
    targetDoc = docs;
  }

  // Fallback: pick first active doctor in the hospital if target not found
  if (targetDoc.length === 0) {
    const [fallbackDocs] = await pool.query(
      `SELECT u.id, u.full_name, u.department_id, dp.specialization, d.name as department_name
       FROM users u
       JOIN doctor_profiles dp ON dp.user_id = u.id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE (? IS NULL OR u.hospital_id = ?)
         AND u.status = 'active'
       LIMIT 1`,
      [hospitalId, hospitalId]
    );
    targetDoc = fallbackDocs;
  }

  const doctor = targetDoc[0];
  if (!doctor) {
    throw new Error("No active physicians found to simulate coverage.");
  }
  docId = doctor.id;

  // Count scheduled & pending appointments for this doctor today
  const [appts] = await pool.query(
    `SELECT
       COUNT(*) as affected_appointments,
       SUM(CASE WHEN status = 'in_waiting' THEN 1 ELSE 0 END) as waiting_count,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count
     FROM appointments
     WHERE doctor_id = ?
       AND (? IS NULL OR hospital_id = ?)
       AND status IN ('confirmed', 'in_waiting')`,
    [docId, hospitalId, hospitalId]
  );

  // Find peer doctors in the same department
  const [peers] = await pool.query(
    `SELECT u.id, u.full_name, dp.specialization
     FROM users u
     JOIN doctor_profiles dp ON dp.user_id = u.id
     WHERE u.department_id = ?
       AND u.id != ?
       AND u.status = 'active'
       AND (? IS NULL OR u.hospital_id = ?)`,
    [doctor.department_id, docId, hospitalId, hospitalId]
  );

  const affectedTotal = Number(appts[0]?.affected_appointments || 0);
  const waitingPatients = Number(appts[0]?.waiting_count || 0);
  const confirmedPatients = Number(appts[0]?.confirmed_count || 0);
  const peerCount = peers.length;

  const reallocatedPerPeer = peerCount > 0 ? Math.ceil(affectedTotal / peerCount) : affectedTotal;
  const additionalWaitMinutesPerPeer = reallocatedPerPeer * 12;

  const baselineMetrics = {
    targetDoctorName: doctor.full_name,
    specialization: doctor.specialization,
    departmentName: doctor.department_name,
    scheduledAppointments: affectedTotal,
    waitingInLobby: waitingPatients,
  };

  const simulatedMetrics = {
    displacedAppointmentsCount: affectedTotal,
    availablePeerDoctorsCount: peerCount,
    peerDoctors: peers.map(p => p.full_name),
    simulatedAdditionalPatientsPerPeer: reallocatedPerPeer,
    projectedExtraWaitMinutesPerDoctor: additionalWaitMinutesPerPeer,
    reallocationFeasibility: peerCount > 0 ? (reallocatedPerPeer <= 6 ? "FEASIBLE" : "HEAVY OVERLOAD") : "NO PEERS AVAILABLE",
  };

  const impactSummary = `Simulating absence of [${doctor.full_name}]: ${affectedTotal} scheduled patients affected (${waitingPatients} currently waiting in lobby). ${peerCount > 0 ? `Can reallocate ~${reallocatedPerPeer} patients per peer to ${peerCount} department colleagues (+${additionalWaitMinutesPerPeer} mins delay).` : "No peer doctors available in same department — rescheduling required."}`;

  return {
    scenarioType: "doctor_shortage",
    scenarioName: `Doctor Absence Simulation (${doctor.full_name})`,
    is_simulated: true,
    parameters: { doctorId: docId, doctorName: doctor.full_name },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      peerCount > 0 ? `Notify reception desk to redistribute intake across: ${peers.map(p => p.full_name).join(", ")}.` : "Contact patients to reschedule consultations to next available dates.",
      "Send automated cancellation/rescheduling notifications with patient consent.",
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SCENARIO 5: MEDICINE DEMAND SPIKE SIMULATION
// How will increased medicine demand affect stock?
// ============================================================================
async function simulateMedicineDemandSpike({ hospitalId, demandIncreasePercent = 50 }) {
  const spikeFactor = 1 + (Number(demandIncreasePercent || 50) / 100);

  // Fetch active formulary medicines and batch quantities
  const [medicines] = await pool.query(
    `SELECT
       hm.id as hospital_medicine_id,
       mm.name as medicine_name,
       mm.strength,
       hm.min_stock_alert_level,
       COALESCE(b.total_qty, 0) as current_stock,
       hm.sale_price
     FROM hospital_medicines hm
     JOIN master_medicines mm ON mm.id = hm.master_medicine_id
     LEFT JOIN (
       SELECT medicine_id, hospital_id, SUM(current_quantity) as total_qty
       FROM medicine_batches
       WHERE status = 'active'
       GROUP BY medicine_id, hospital_id
     ) b ON b.medicine_id = hm.id AND b.hospital_id = hm.hospital_id
     WHERE (? IS NULL OR hm.hospital_id = ?)
       AND hm.status = 'active'
     LIMIT 50`,
    [hospitalId, hospitalId]
  );

  const baselineDailyBurnRate = 3; // baseline average daily units
  const acceleratedDailyBurnRate = baselineDailyBurnRate * spikeFactor;

  let baselineCriticalCount = 0;
  let simulatedCriticalCount = 0;
  const affectedList = [];

  medicines.forEach(m => {
    const stock = Number(m.current_stock || 0);
    const baselineDays = Math.round(stock / baselineDailyBurnRate);
    const simulatedDays = Math.round(stock / acceleratedDailyBurnRate);

    if (baselineDays <= 7) baselineCriticalCount++;
    if (simulatedDays <= 7) simulatedCriticalCount++;

    if (simulatedDays <= 14) {
      affectedList.push({
        medicineName: m.medicine_name,
        currentStock: stock,
        baselineDaysRemaining: baselineDays,
        simulatedDaysRemaining: simulatedDays,
        suggestedEmergencyReorder: Math.max(0, (Number(m.min_stock_alert_level || 15) * 4) - stock),
      });
    }
  });

  const baselineMetrics = {
    totalMedicinesMonitored: medicines.length,
    baselineCriticalStockCount: baselineCriticalCount,
    normalBurnRateDailyUnits: baselineDailyBurnRate,
  };

  const simulatedMetrics = {
    demandIncreasePercent: Number(demandIncreasePercent),
    acceleratedBurnRateDailyUnits: Number(acceleratedDailyBurnRate.toFixed(1)),
    simulatedCriticalStockCount: simulatedCriticalCount,
    newMedicinesAtRiskCount: Math.max(0, simulatedCriticalCount - baselineCriticalCount),
    vulnerableMedicinesList: affectedList.slice(0, 8),
  };

  const impactSummary = `Simulating +${demandIncreasePercent}% medication demand surge: Accelerated consumption causes ${simulatedCriticalCount} medicines to face stockout risk within 7 days (vs ${baselineCriticalCount} baseline). Top vulnerable items: ${affectedList.slice(0, 3).map(a => `${a.medicineName} (${a.simulatedDaysRemaining}d remaining)`).join(", ")}.`;

  return {
    scenarioType: "medicine_demand_spike",
    scenarioName: `Medicine Demand Surge (+${demandIncreasePercent}%)`,
    is_simulated: true,
    parameters: { demandIncreasePercent },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      `Issue expedited supplier orders for ${simulatedCriticalCount} items facing 7-day stockout risk.`,
      "Enforce unit-dose pharmacy dispensing controls to prevent premature depletion.",
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SCENARIO 6: LABORATORY WORKLOAD SURGE SIMULATION
// What happens if laboratory workload increases by X%?
// ============================================================================
async function simulateLaboratorySurge({ hospitalId, workloadIncreasePercent = 30 }) {
  const surgeFactor = 1 + (Number(workloadIncreasePercent || 30) / 100);

  // Fetch current pending lab workload
  const [labCounts] = await pool.query(
    `SELECT
       COUNT(*) as total_pending,
       SUM(CASE WHEN priority = 'stat' THEN 1 ELSE 0 END) as stat_count,
       SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_count,
       SUM(CASE WHEN priority = 'routine' THEN 1 ELSE 0 END) as routine_count
     FROM investigation_requests
     WHERE (? IS NULL OR hospital_id = ?)
       AND status IN ('requested', 'sample_collected', 'in_progress')`,
    [hospitalId, hospitalId]
  );

  const baselinePending = Number(labCounts[0]?.total_pending || 0);
  const baselineStat = Number(labCounts[0]?.stat_count || 0);
  const baselineUrgent = Number(labCounts[0]?.urgent_count || 0);

  // Baseline TAT hours
  const BASELINE_STAT_TAT_HOURS = 1.5;
  const BASELINE_ROUTINE_TAT_HOURS = 12.0;

  // Simulated metrics
  const simulatedPending = Math.round(baselinePending * surgeFactor) + 5;
  const simulatedStatTatHours = Number((BASELINE_STAT_TAT_HOURS * (1 + (surgeFactor - 1) * 0.5)).toFixed(1));
  const simulatedRoutineTatHours = Number((BASELINE_ROUTINE_TAT_HOURS * surgeFactor).toFixed(1));
  const technicianOvertimeHours = Number(((simulatedPending - baselinePending) * 0.4).toFixed(1));
  const capacitySaturationRate = Math.min(100, Math.round(55 * surgeFactor));

  const baselineMetrics = {
    currentPendingOrders: baselinePending,
    currentStatOrders: baselineStat,
    currentUrgentOrders: baselineUrgent,
    standardStatTatHours: BASELINE_STAT_TAT_HOURS,
    standardRoutineTatHours: BASELINE_ROUTINE_TAT_HOURS,
  };

  const simulatedMetrics = {
    workloadIncreasePercent: Number(workloadIncreasePercent),
    projectedPendingOrders: simulatedPending,
    projectedStatTatHours: simulatedStatTatHours,
    projectedRoutineTatHours: simulatedRoutineTatHours,
    estimatedTechnicianOvertimeHours: technicianOvertimeHours,
    labCapacitySaturationPercent: capacitySaturationRate,
    turnaroundDelayRisk: capacitySaturationRate >= 80 ? "HIGH DELAY RISK" : "MODERATE",
  };

  const impactSummary = `Simulating +${workloadIncreasePercent}% laboratory order surge: Active pending diagnostic tests increase from ${baselinePending} to ${simulatedPending}. STAT turnaround time expands to ${simulatedStatTatHours}h; Routine turnaround expands to ${simulatedRoutineTatHours}h. Technician overtime required: ~${technicianOvertimeHours} hours.`;

  return {
    scenarioType: "lab_surge",
    scenarioName: `Laboratory Workload Surge (+${workloadIncreasePercent}%)`,
    is_simulated: true,
    parameters: { workloadIncreasePercent },
    baselineMetrics,
    simulatedMetrics,
    impactSummary,
    recommendations: [
      capacitySaturationRate >= 80 ? "Authorize laboratory staff overtime shift to maintain STAT diagnostic turnaround times." : "Current laboratory analyzer throughput can absorb volume.",
      "Triage incoming specimens: prioritize STAT blood gases, cardiac markers, and stroke panels.",
    ],
    disclaimer: SIMULATION_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// SIMULATION RUN & AUDIT PERSISTENCE
// ============================================================================
async function runAndPersistSimulation({
  hospitalId,
  userId,
  scenarioType,
  parameters = {},
}) {
  let result = null;
  const normalizedType = String(scenarioType || "").toLowerCase().trim();

  switch (normalizedType) {
    case "patient_surge":
    case "outpatient_surge":
      result = await simulatePatientSurge({
        hospitalId,
        additionalPatients: parameters.additionalPatients ?? parameters.additional_patients ?? parameters.paramValue ?? 20,
      });
      break;

    case "ward_capacity_loss":
    case "bed_capacity_loss":
    case "ward_closure":
      result = await simulateWardCapacityLoss({
        hospitalId,
        wardId: parameters.wardId ?? parameters.ward_id ?? parameters.targetWardId,
      });
      break;

    case "bed_demand_projection":
    case "bed_demand":
    case "inpatient_demand":
      result = await simulateBedDemandNextWeek({
        hospitalId,
        projectedGrowthPercent: parameters.projectedGrowthPercent ?? parameters.projected_growth_percent ?? (parameters.forecast_days ? parameters.forecast_days * 2 : 15),
      });
      break;

    case "doctor_absence":
    case "doctor_shortage":
    case "physician_absence":
      result = await simulateDoctorUnavailability({
        hospitalId,
        doctorId: parameters.doctorId ?? parameters.doctor_id ?? parameters.targetDoctorId,
      });
      break;

    case "medicine_demand_surge":
    case "medicine_demand_spike":
    case "pharmacy_surge":
      result = await simulateMedicineDemandSpike({
        hospitalId,
        demandIncreasePercent: parameters.demandIncreasePercent ?? parameters.demand_increase_percent ?? parameters.surge_percentage ?? parameters.surgePercent ?? 50,
      });
      break;

    case "laboratory_workload_surge":
    case "lab_surge":
    case "lab_workload_surge":
      result = await simulateLaboratorySurge({
        hospitalId,
        workloadIncreasePercent: parameters.workloadIncreasePercent ?? parameters.workload_increase_percent ?? parameters.workload_surge_percentage ?? parameters.surgePercent ?? 30,
      });
      break;

    default:
      throw new Error(`Unsupported scenario type: ${scenarioType}`);
  }

  const simulationCode = generateSimulationCode();

  // Save in digital_twin_simulations table for audit review
  const [insertRes] = await pool.query(
    `INSERT INTO digital_twin_simulations
      (simulation_code, hospital_id, user_id, scenario_type, scenario_name, parameters, baseline_metrics, simulated_metrics, impact_summary, is_simulated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      simulationCode,
      hospitalId,
      userId,
      result.scenarioType || normalizedType,
      result.scenarioName,
      JSON.stringify(result.parameters),
      JSON.stringify(result.baselineMetrics),
      JSON.stringify({ ...result.simulatedMetrics, recommendations: result.recommendations }),
      result.impactSummary,
    ]
  );

  return {
    id: insertRes.insertId,
    simulationCode,
    simulation_code: simulationCode,
    scenario_type: result.scenarioType || normalizedType,
    scenario_name: result.scenarioName,
    baseline_metrics: result.baselineMetrics,
    simulated_metrics: result.simulatedMetrics,
    impact_summary: result.impactSummary,
    ...result,
  };
}

/**
 * List saved simulation runs for a hospital
 */
async function listSimulationRuns(hospitalId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT
       s.id,
       s.simulation_code,
       s.hospital_id,
       s.scenario_type,
       s.scenario_name,
       s.parameters,
       s.impact_summary,
       s.is_simulated,
       s.created_at,
       u.full_name as author_name
     FROM digital_twin_simulations s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE (? IS NULL OR s.hospital_id = ?)
     ORDER BY s.id DESC
     LIMIT ?`,
    [hospitalId, hospitalId, limit]
  );

  return rows.map(r => ({
    ...r,
    parameters: typeof r.parameters === "string" ? JSON.parse(r.parameters) : r.parameters,
  }));
}

module.exports = {
  simulatePatientSurge,
  simulateWardCapacityLoss,
  simulateBedDemandNextWeek,
  simulateDoctorUnavailability,
  simulateMedicineDemandSpike,
  simulateLaboratorySurge,
  runAndPersistSimulation,
  listSimulationRuns,
  SIMULATION_DISCLAIMER,
};
