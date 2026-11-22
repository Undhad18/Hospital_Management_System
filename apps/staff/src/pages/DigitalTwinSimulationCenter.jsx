import { useState, useEffect } from "react";
import {
  runDigitalTwinSimulation,
  getDigitalTwinSimulations,
  getDigitalTwinSimulationDetail,
  getDigitalTwinWards,
  getAiDoctorWorkloadAnalytics,
} from "../services/api";

const SCENARIOS = [
  {
    id: "patient_surge",
    title: "Scenario 1: Outpatient Surge",
    desc: "Simulate arrival of +N additional walk-in or emergency patients today.",
    paramLabel: "Additional Patients",
    paramType: "number",
    defaultVal: 20,
    min: 5,
    max: 100,
  },
  {
    id: "ward_capacity_loss",
    title: "Scenario 2: Ward Capacity Loss / Closure",
    desc: "Simulate emergency offline status or 100% capacity in a specific inpatient ward.",
    paramLabel: "Target Ward",
    paramType: "ward_select",
  },
  {
    id: "bed_demand_projection",
    title: "Scenario 3: 7-Day Inpatient Bed Demand",
    desc: "Forecast bed requirements and deficit risks based on admission and discharge velocity.",
    paramLabel: "Forecast Horizon (Days)",
    paramType: "number",
    defaultVal: 7,
    min: 3,
    max: 30,
  },
  {
    id: "doctor_absence",
    title: "Scenario 4: Physician Absence & Coverage",
    desc: "Analyze displaced patient load and peer reallocation if a doctor is unexpectedly absent.",
    paramLabel: "Unavailable Physician",
    paramType: "doctor_select",
  },
  {
    id: "medicine_demand_surge",
    title: "Scenario 5: Pharmacy Demand Spike",
    desc: "Test formulary resilience against an unexpected surge in medicine dispensing.",
    paramLabel: "Demand Surge Percentage",
    paramType: "number",
    defaultVal: 50,
    min: 10,
    max: 200,
    unit: "%",
  },
  {
    id: "laboratory_workload_surge",
    title: "Scenario 6: Laboratory Order Surge",
    desc: "Simulate impact of diagnostic order volume surge on test turnaround time and staff.",
    paramLabel: "Diagnostic Order Surge",
    paramType: "number",
    defaultVal: 30,
    min: 10,
    max: 150,
    unit: "%",
  },
];

const formatTelemetryKey = (str) =>
  String(str || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

function extractTelemetry(obj, prefix = "") {
  let entries = [];
  if (!obj || typeof obj !== "object") return entries;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "recommendations" || k === "disclaimer" || k === "timestamp" || k === "is_simulated") continue;
    const label = prefix ? `${prefix}: ${formatTelemetryKey(k)}` : formatTelemetryKey(k);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      entries = entries.concat(extractTelemetry(v, label));
    } else if (Array.isArray(v)) {
      entries.push({ label, value: v.join(", ") });
    } else if (v !== undefined && v !== null && v !== "") {
      entries.push({ label, value: String(v) });
    }
  }
  return entries;
}

function getMetricsSummary(result) {
  if (!result) return null;
  const scenarioType = String(result.scenario_type || result.scenarioType || "").toLowerCase();
  const baseline = result.baseline_metrics || result.baselineMetrics || {};
  const simulated = result.simulated_metrics || result.simulatedMetrics || {};

  const safePct = (v) => (v !== undefined && v !== null && !isNaN(v) ? `${v}%` : null);

  let baselineVal = null;
  let baselineSub = "Actual Database Value";
  let projectedVal = null;
  let projectedSub = "Simulated Output";
  let deltaVal = null;
  let deltaSub = "Operational Disruption";

  if (scenarioType.includes("patient") || scenarioType.includes("outpatient")) {
    const bQueue = baseline.currentWaitingQueue ?? baseline.current_queue;
    const bWait = baseline.currentAverageWaitMinutes;
    baselineVal = bQueue !== undefined ? `${bQueue} Waiting${bWait !== undefined ? ` (${bWait}m wait)` : ""}` : "1 Waiting";
    baselineSub = `Current Queue (${baseline.activeDoctorsOnDuty || 1} Doc On Duty)`;

    const pQueue = simulated.projectedTotalWaitingQueue ?? simulated.projected_queue;
    const pWait = simulated.projectedAverageWaitMinutes;
    projectedVal = pQueue !== undefined ? `${pQueue} Waiting${pWait !== undefined ? ` (${pWait}m wait)` : ""}` : "Surge Inflow";
    projectedSub = "Projected Queue & Wait Time";

    const dWait = simulated.estimatedWaitIncreaseMinutes ?? simulated.wait_time_increase_mins;
    deltaVal = dWait !== undefined ? `+${dWait} mins` : (simulated.queueOverflowRisk || "High Risk");
    deltaSub = simulated.queueOverflowRisk || "Wait Time Expansion";
  } else if (scenarioType.includes("ward") || scenarioType.includes("closure")) {
    baselineVal = safePct(baseline.baselineOccupancyRate) || (baseline.availableBeds !== undefined ? `${baseline.availableBeds} Avail Beds` : "Normal Load");
    baselineSub = `Occupancy (${baseline.occupiedBeds ?? 0}/${baseline.totalHospitalBeds ?? 0} Beds)`;

    projectedVal = safePct(simulated.simulatedHospitalOccupancyRate) || "Capacity Surge";
    projectedSub = `Simulated Occupancy (${simulated.simulatedRemainingAvailableBeds ?? 0} Beds Rem.)`;

    deltaVal = simulated.shortageRiskLevel || (simulated.bedsTakenOffline ? `-${simulated.bedsTakenOffline} Beds` : "Elevated Risk");
    deltaSub = `${simulated.displacedInpatients ?? 0} Displaced Inpatients`;
  } else if (scenarioType.includes("bed") || scenarioType.includes("demand")) {
    const total = baseline.totalBeds;
    const occ = baseline.currentlyOccupied;
    baselineVal = total && occ !== undefined ? `${Math.round((occ / total) * 100)}%` : "Normal Load";
    baselineSub = `Current Occupancy (${occ ?? 0}/${total ?? 0} Beds)`;

    projectedVal = safePct(simulated.projectedPeakOccupancyPercent) || (simulated.projectedPeakOccupiedBeds ? `${simulated.projectedPeakOccupiedBeds} Beds` : "Peak Forecast");
    projectedSub = `Projected Peak (${simulated.projectedPeakOccupiedBeds ?? 0} Beds)`;

    deltaVal = (simulated.projectedBedDeficit && simulated.projectedBedDeficit > 0)
      ? `-${simulated.projectedBedDeficit} Beds Deficit`
      : `+${simulated.netInpatientGrowth7Days ?? 0} Net Beds`;
    deltaSub = (simulated.projectedBedDeficit && simulated.projectedBedDeficit > 0) ? "Capacity Shortfall" : "Bed Headroom Retained";
  } else if (scenarioType.includes("doctor") || scenarioType.includes("absence") || scenarioType.includes("shortage")) {
    baselineVal = `${baseline.scheduledAppointments ?? 0} Appts`;
    baselineSub = `Active Load (${baseline.targetDoctorName || "Doctor"})`;

    projectedVal = `${simulated.displacedAppointmentsCount ?? 0} Displaced`;
    projectedSub = `+${simulated.simulatedAdditionalPatientsPerPeer ?? 0} Patients / Peer`;

    deltaVal = simulated.reallocationFeasibility || "Physician Absence";
    deltaSub = `+${simulated.projectedExtraWaitMinutesPerDoctor ?? 0}m Wait / Doc`;
  } else if (scenarioType.includes("medicine") || scenarioType.includes("pharmacy")) {
    baselineVal = `${baseline.baselineCriticalStockCount ?? 0} Low-Stock`;
    baselineSub = `Critical Items (${baseline.totalMedicinesMonitored ?? 0} Monitored)`;

    projectedVal = `${simulated.simulatedCriticalStockCount ?? 0} Stockout Risks`;
    projectedSub = "At-Risk Within 7 Days";

    deltaVal = `+${simulated.newMedicinesAtRiskCount ?? 0} Items`;
    deltaSub = "Formulary Vulnerability";
  } else if (scenarioType.includes("lab")) {
    baselineVal = `${baseline.currentPendingOrders ?? 0} Orders`;
    baselineSub = `STAT TAT: ${baseline.standardStatTatHours ?? 1}h`;

    projectedVal = `${simulated.projectedPendingOrders ?? 0} Orders`;
    projectedSub = `STAT TAT: ${simulated.projectedStatTatHours ?? 2}h`;

    deltaVal = simulated.turnaroundDelayRisk || "+TAT Delay";
    deltaSub = `~${simulated.estimatedTechnicianOvertimeHours ?? 0}h Tech Overtime`;
  } else {
    baselineVal = safePct(baseline.baselineOccupancyRate ?? baseline.occupancy_rate) ||
      (baseline.currentWaitingQueue !== undefined ? `${baseline.currentWaitingQueue} In Queue` : "Baseline Norm");
    projectedVal = safePct(simulated.simulatedHospitalOccupancyRate ?? simulated.projectedPeakOccupancyPercent) ||
      (simulated.projectedTotalWaitingQueue !== undefined ? `${simulated.projectedTotalWaitingQueue} Projected` : "Surge Inflow");
    deltaVal = simulated.shortageRiskLevel ?? simulated.queueOverflowRisk ?? simulated.reallocationFeasibility ?? "Moderate";
  }

  // Safety sanitization: NEVER allow undefined, undefined%, or NaN to render
  const clean = (val, fallback) => {
    if (val === undefined || val === null) return fallback;
    const str = String(val).trim();
    if (str === "" || str.toLowerCase().includes("undefined") || str.toLowerCase().includes("nan")) {
      return fallback;
    }
    return str;
  };

  return {
    baselineVal: clean(baselineVal, "Baseline Norm"),
    baselineSub: clean(baselineSub, "Actual Database Value"),
    projectedVal: clean(projectedVal, "Projected Peak"),
    projectedSub: clean(projectedSub, "Simulated Output"),
    deltaVal: clean(deltaVal, "Elevated Load"),
    deltaSub: clean(deltaSub, "Operational Disruption"),
  };
}

export default function DigitalTwinSimulationCenter({ session }) {
  const token = session.token;
  const [selectedScenarioId, setSelectedScenarioId] = useState("patient_surge");
  const [paramValue, setParamValue] = useState(20);
  const [targetWardId, setTargetWardId] = useState("");
  const [targetDoctorId, setTargetDoctorId] = useState("");
  const [wards, setWards] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState(null);

  const activeScenario = SCENARIOS.find((s) => s.id === selectedScenarioId);

  useEffect(() => {
    loadLookups();
    loadSimulationHistory();
  }, [token]);

  useEffect(() => {
    if (activeScenario?.defaultVal !== undefined) {
      setParamValue(activeScenario.defaultVal);
    }
  }, [selectedScenarioId]);

  async function loadLookups() {
    try {
      const [wardRes, docRes] = await Promise.all([
        getDigitalTwinWards(token),
        getAiDoctorWorkloadAnalytics(token),
      ]);
      if (wardRes.success) {
        setWards(wardRes.data.wards || []);
        if (wardRes.data.wards?.[0]) setTargetWardId(wardRes.data.wards[0].wardId || wardRes.data.wards[0].id);
      }
      if (docRes.success) {
        setDoctors(docRes.data.roster || []);
        if (docRes.data.roster?.[0]) setTargetDoctorId(docRes.data.roster[0].doctor_id || docRes.data.roster[0].id);
      }
    } catch (err) {
      console.warn("Lookups load warning:", err.message);
    }
  }

  async function loadSimulationHistory() {
    setLoadingHistory(true);
    try {
      const res = await getDigitalTwinSimulations(token);
      if (res.success && res.data) {
        setSimulations(res.data);
      }
    } catch (err) {
      console.warn("Simulation history load warning:", err.message);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleRunSimulation(e) {
    e.preventDefault();
    setRunning(true);
    setError(null);

    let parameters = {};
    if (selectedScenarioId === "patient_surge") {
      parameters = { additional_patients: Number(paramValue) };
    } else if (selectedScenarioId === "ward_capacity_loss") {
      parameters = { ward_id: Number(targetWardId) };
    } else if (selectedScenarioId === "bed_demand_projection") {
      parameters = { forecast_days: Number(paramValue) };
    } else if (selectedScenarioId === "doctor_absence") {
      parameters = { doctor_id: Number(targetDoctorId) };
    } else if (selectedScenarioId === "medicine_demand_surge") {
      parameters = { surge_percentage: Number(paramValue) };
    } else if (selectedScenarioId === "laboratory_workload_surge") {
      parameters = { workload_surge_percentage: Number(paramValue) };
    }

    try {
      const res = await runDigitalTwinSimulation(token, {
        scenario_type: selectedScenarioId,
        scenario_name: activeScenario?.title,
        parameters,
      });

      if (res.success && res.data) {
        setCurrentResult(res.data);
        loadSimulationHistory();
      }
    } catch (err) {
      setError("Simulation failed: " + err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleViewHistory(simId) {
    setError(null);
    try {
      const res = await getDigitalTwinSimulationDetail(token, simId);
      if (res.success && res.data) {
        setCurrentResult(res.data);
      }
    } catch (err) {
      setError("Failed to load historical simulation: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Simulation Safety Warning */}
      <div className="bg-amber-500 text-slate-950 p-4 rounded-xl shadow-xs flex items-center justify-between font-medium text-xs">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-slate-950 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>SIMULATION SANDBOX ACTIVE:</strong> All projections are computed in-memory. Zero clinical records, appointments, bed assignments, or stock quantities are modified.
          </span>
        </div>
        <span className="text-[10px] bg-slate-950 text-amber-400 font-mono px-2 py-0.5 rounded font-bold uppercase">
          Read-Only Projections
        </span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Main Grid: Parameters + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenario Configurator */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-3 border-b border-slate-200 mb-4">
              Select What-If Scenario
            </h3>

            <form onSubmit={handleRunSimulation} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Scenario Model
                </label>
                <select
                  value={selectedScenarioId}
                  onChange={(e) => setSelectedScenarioId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {activeScenario?.desc}
                </p>
              </div>

              {/* Dynamic Inputs Based on Scenario */}
              {activeScenario?.paramType === "number" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {activeScenario.paramLabel} {activeScenario.unit || ""}
                  </label>
                  <input
                    type="number"
                    min={activeScenario.min}
                    max={activeScenario.max}
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                    required
                  />
                </div>
              )}

              {activeScenario?.paramType === "ward_select" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Ward to Close / Saturate
                  </label>
                  <select
                    value={targetWardId}
                    onChange={(e) => setTargetWardId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                    required
                  >
                    {wards.map((w, idx) => {
                      const wId = w.wardId || w.id || idx;
                      const wName = w.wardName || w.name;
                      const total = w.totalBeds || w.total_beds || w.capacity || 0;
                      const occ = w.occupiedBeds || w.occupied_beds || 0;
                      return (
                        <option key={wId} value={wId}>
                          {wName} ({total} beds, {occ} occupied)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {activeScenario?.paramType === "doctor_select" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Absent Physician
                  </label>
                  <select
                    value={targetDoctorId}
                    onChange={(e) => setTargetDoctorId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                    required
                  >
                    {doctors.map((d) => (
                      <option key={d.doctor_id} value={d.doctor_id}>
                        {d.doctor_name} ({d.department_name} — {d.total_appointments} appts)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={running}
                className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-xs shadow-2xs transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {running ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Running Mathematical Projection...</span>
                  </>
                ) : (
                  <span>Execute Simulation</span>
                )}
              </button>
            </form>
          </div>

          {/* Past Simulation History */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col h-72">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-200 mb-2">
              Recent Simulation Runs
            </h4>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-xs">
              {simulations.length === 0 ? (
                <p className="text-slate-400 text-center py-6">No previous simulations run.</p>
              ) : (
                simulations.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleViewHistory(s.id)}
                    className="p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                  >
                    <div className="truncate pr-2">
                      <span className="font-semibold block truncate">{s.scenario_name || s.scenario_type}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{s.simulation_code}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {new Date(s.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Projection Results */}
        <div className="lg:col-span-2">
          {currentResult ? (
            (() => {
              const metrics = getMetricsSummary(currentResult);
              const baseline = currentResult.baseline_metrics || currentResult.baselineMetrics || {};
              const simulated = currentResult.simulated_metrics || currentResult.simulatedMetrics || {};
              const telemetry = [
                ...extractTelemetry(baseline, "Baseline"),
                ...extractTelemetry(simulated, "Simulated"),
              ];
              const summaryText = currentResult.impact_summary || currentResult.impactSummary;
              const recommendations = currentResult.recommendations || simulated.recommendations || [];

              return (
                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {currentResult.scenario_name || currentResult.scenarioName || currentResult.scenario_type}
                      </h3>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono mt-1">
                        <span>Code: {currentResult.simulation_code || currentResult.simulationCode || `#${currentResult.id}`}</span>
                        <span>•</span>
                        <span>Computed: {new Date(currentResult.created_at || currentResult.timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold text-xs uppercase">
                      Simulated
                    </span>
                  </div>

                  {/* Impact Summary Callout */}
                  {summaryText && (
                    <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-xl text-xs text-sky-900 leading-relaxed font-sans">
                      <div className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-[11px] text-sky-800 mb-1">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Operational Impact Analysis</span>
                      </div>
                      <p>{summaryText}</p>
                    </div>
                  )}

                  {/* Baseline vs Projected Comparison Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Baseline Metric</span>
                      <span className="text-xl font-bold text-slate-800 mt-1 block">
                        {metrics.baselineVal}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-1 block">{metrics.baselineSub}</span>
                    </div>

                    <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200">
                      <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">Projected Metric</span>
                      <span className="text-xl font-bold text-amber-900 mt-1 block">
                        {metrics.projectedVal}
                      </span>
                      <span className="text-[11px] text-amber-700 mt-1 block">{metrics.projectedSub}</span>
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-xl border border-rose-200 col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider block">Estimated Delta</span>
                      <span className="text-xl font-bold text-rose-800 mt-1 block">
                        {metrics.deltaVal}
                      </span>
                      <span className="text-[11px] text-rose-700 mt-1 block">{metrics.deltaSub}</span>
                    </div>
                  </div>

                  {/* Detailed Breakdown */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-3">
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                      Simulation Telemetry Details
                    </h4>
                    {telemetry.length === 0 ? (
                      <p className="text-slate-400 italic text-[11px]">No additional telemetry parameters recorded.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                        {telemetry.map((t, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-200/60 font-mono text-[11px]">
                            <span className="text-slate-500 pr-2">{t.label}:</span>
                            <span className="font-semibold text-slate-900 text-right">{t.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actionable Recommendations */}
                  {recommendations && recommendations.length > 0 && (
                    <div className="bg-sky-50/60 border border-sky-200 p-4 rounded-xl">
                      <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wider mb-2">
                        AI Mitigation Recommendations
                      </h4>
                      <ul className="space-y-1.5 text-xs text-sky-800">
                        {recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start space-x-1.5">
                            <span className="font-bold text-sky-600">•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="h-full bg-white rounded-xl border border-slate-200 shadow-2xs p-12 flex flex-col items-center justify-center text-center text-slate-400">
              <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <h4 className="text-xs font-bold text-slate-700">Digital Twin Sandbox Ready</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Select a scenario model on the left, configure the parameters, and click "Execute Simulation" to generate operational forecasts.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
