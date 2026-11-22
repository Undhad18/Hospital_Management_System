import { useState, useEffect } from "react";
import {
  getDigitalTwinDischargeReadiness,
  advanceDigitalTwinDischargeStage,
  preAllocateDigitalTwinBed,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function DischargeReadinessDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [selectedWard, setSelectedWard] = useState("all");
  const [selectedStage, setSelectedStage] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [advanceModal, setAdvanceModal] = useState(null); // patient object
  const [advanceStageTarget, setAdvanceStageTarget] = useState("");
  const [barrierNotes, setBarrierNotes] = useState("");

  const [preAllocModal, setPreAllocModal] = useState(null); // patient object
  const [allocForm, setAllocForm] = useState({
    name: "",
    req_bed_type: "standard",
    condition: "",
  });

  useEffect(() => {
    loadDischargeTwin();
  }, [token]);

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadDischargeTwin(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadDischargeTwin(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const result = await getDigitalTwinDischargeReadiness(token);
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError("Failed to load Discharge Readiness Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleAdvanceStage(e) {
    e.preventDefault();
    if (!advanceModal?.assessment_id || !advanceStageTarget) return;
    setActionLoading(true);
    try {
      await advanceDigitalTwinDischargeStage(token, {
        assessmentId: advanceModal.assessment_id,
        next_stage: advanceStageTarget,
        barrier_notes: barrierNotes,
      });
      setAdvanceModal(null);
      setAdvanceStageTarget("");
      setBarrierNotes("");
      await loadDischargeTwin(false);
    } catch (err) {
      alert("Failed to advance stage: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePreAllocate(e) {
    e.preventDefault();
    if (!preAllocModal?.assessment_id) return;
    setActionLoading(true);
    try {
      await preAllocateDigitalTwinBed(token, {
        assessmentId: preAllocModal.assessment_id,
        candidate: allocForm.name ? allocForm : null,
      });
      setPreAllocModal(null);
      setAllocForm({ name: "", req_bed_type: "standard", condition: "" });
      await loadDischargeTwin(false);
    } catch (err) {
      alert("Pre-allocation failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const overview = data?.overview || {};
  const patients = data?.patients || [];

  // Filter patients
  const filteredPatients = patients.filter((p) => {
    if (selectedWard !== "all" && String(p.ward_id) !== String(selectedWard)) return false;
    if (selectedStage !== "all" && p.current_stage !== selectedStage) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.patient_name?.toLowerCase().includes(q);
      const matchBed = p.bed_number?.toLowerCase().includes(q);
      const matchDoctor = p.attending_doctor_name?.toLowerCase().includes(q);
      if (!matchName && !matchBed && !matchDoctor) return false;
    }
    return true;
  });

  const STAGES = [
    { key: "clinical_clearance", label: "1. Clinical Clearance", desc: "Physician rounds & vitals" },
    { key: "pharmacy_reconciliation", label: "2. Pharmacy Med-Rec", desc: "Take-home prescriptions" },
    { key: "billing_settlement", label: "3. Billing & TPA", desc: "Cashless insurance & invoices" },
    { key: "transit_ready", label: "4. Transit Ready", desc: "Patient dressing & transport" },
    { key: "evs_turnaround", label: "5. EVS UV Turnaround", desc: "Housekeeping & sanitization" },
    { key: "liberated", label: "6. Bed Liberated", desc: "Open for next admission" },
  ];

  function getScoreBadge(score) {
    if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (score >= 60) return "bg-amber-100 text-amber-800 border-amber-300";
    return "bg-slate-100 text-slate-700 border-slate-300";
  }

  function getNextStage(current) {
    const idx = STAGES.findIndex((s) => s.key === current);
    if (idx >= 0 && idx < STAGES.length - 1) {
      return STAGES[idx + 1].key;
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Card */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="relative flex h-3.5 w-3.5">
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-sky-500"></span>
              </span>
              <span className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
                PREDICTIVE BED LIBERATION TWIN
              </span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                AI Smart Discharge &amp; Turnover
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Inpatient Discharge Readiness &amp; Bed Turnover Twin
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Real-time multi-stage turnover pipeline, clinical barrier tracking, and zero-wait admission pre-allocation.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => loadDischargeTwin(true)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex items-center space-x-1.5"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Forecast</span>
            </button>
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              Sync: {lastUpdated || "Live"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Inpatients Under Surveillance</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {overview.total_inpatients || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Across All Active Wards</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">High-Probability Liberations (&ge;75%)</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {overview.high_probability_liberations || 0}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Discharge Probable Today</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Liberating in Next 4 Hours</div>
          <div className="text-2xl font-bold text-sky-600 mt-1">
            {overview.liberating_next_4h || 0} <span className="text-xs text-slate-500 font-normal">Beds</span>
          </div>
          <div className="text-[11px] text-sky-600 font-medium mt-0.5">In Final Discharge / EVS Stage</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Queue Pre-Allocated Beds</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">
            {overview.pre_allocated_beds || 0}
          </div>
          <div className="text-[11px] text-purple-600 font-medium mt-0.5">Incoming Patients Pre-Matched</div>
        </div>
      </div>

      {/* 3. Operational Friction & Bottlenecks Warning Strip */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-bold">Bed Turnover Friction Points Detected:</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-white/80 px-2.5 py-1 rounded border border-amber-200">
              Clinical Clearance Pending: <strong>{overview.bottlenecks?.clinical_rounds || 0}</strong>
            </span>
            <span className="bg-white/80 px-2.5 py-1 rounded border border-amber-200">
              Pharmacy Med-Rec Packaging: <strong>{overview.bottlenecks?.pharmacy_med_rec || 0}</strong>
            </span>
            <span className="bg-white/80 px-2.5 py-1 rounded border border-amber-200">
              TPA Cashless Settlement: <strong>{overview.bottlenecks?.tpa_insurance_clearance || 0}</strong>
            </span>
            <span className="bg-white/80 px-2.5 py-1 rounded border border-amber-200">
              Housekeeping / UV Turnaround: <strong>{overview.bottlenecks?.evs_sanitization || 0}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Multi-Stage Turnover Pipeline Strip */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          6-Stage Bed Liberation Pipeline
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 min-w-[700px]">
          {STAGES.map((s, idx) => {
            const count = overview.stage_distribution?.[s.key] || 0;
            const isFilter = selectedStage === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSelectedStage(isFilter ? "all" : s.key)}
                className={`p-3 rounded-lg text-left border transition ${
                  isFilter
                    ? "bg-sky-50 border-sky-400 ring-2 ring-sky-300"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                }`}
              >
                <div className="text-[10px] uppercase font-bold text-slate-400">Step {idx + 1}</div>
                <div className="text-xs font-bold text-slate-800 truncate">{s.label.split(". ")[1]}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{count}</span>
                  <span className="text-[10px] text-slate-400">beds</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Filter & Search Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-600">Filters:</span>
          <select
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-sky-500 focus:border-sky-500"
          >
            <option value="all">All Hospital Wards</option>
            <option value="1">CCU (Coronary Critical Care)</option>
            <option value="2">General Medical Inpatient</option>
            <option value="3">Surgical &amp; Orthopedic</option>
          </select>

          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-sky-500 focus:border-sky-500"
          >
            <option value="all">All Turnover Stages</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          {(selectedWard !== "all" || selectedStage !== "all" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedWard("all");
                setSelectedStage("all");
                setSearchQuery("");
              }}
              className="text-sky-600 hover:text-sky-800 font-semibold px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search patient, bed, or doctor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-full md:w-64 focus:ring-sky-500 focus:border-sky-500"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 6. Inpatient Discharge Assessment Grid / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Active Inpatient Discharge Readiness Roster ({filteredPatients.length})
          </h3>
          <span className="text-xs text-slate-500">Sorted by Highest Liberation Probability</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Bed &amp; Ward</th>
                <th className="py-3 px-4">Inpatient Details</th>
                <th className="py-3 px-4">Attending Doctor</th>
                <th className="py-3 px-4">Readiness Score</th>
                <th className="py-3 px-4">Turnover Stage</th>
                <th className="py-3 px-4">Estimated Liberation</th>
                <th className="py-3 px-4">Queue Pre-Allocation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.length > 0 ? (
                filteredPatients.map((p) => {
                  const nextStage = getNextStage(p.current_stage);
                  const isLiberated = p.current_stage === "liberated";
                  return (
                    <tr key={p.assessment_id} className="hover:bg-slate-50/80 transition">
                      {/* Bed & Ward */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 text-sm">{p.bed_number}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{p.ward_name}</div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          {p.bed_type}
                        </span>
                      </td>

                      {/* Inpatient Details */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{p.patient_name}</div>
                        <div className="text-slate-500 text-[11px]">
                          LOS: <strong>{p.stay_days} day(s)</strong> • Adm: {p.admission_number}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{p.admission_reason}</div>
                      </td>

                      {/* Attending Doctor */}
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{p.attending_doctor_name || "Staff Physician"}</div>
                        <div className="text-[10px] text-slate-400">On Duty</div>
                      </td>

                      {/* Readiness Score */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded border text-xs font-bold font-mono ${getScoreBadge(p.readiness_score)}`}>
                            {p.readiness_score}%
                          </span>
                        </div>
                        <div className="w-24 bg-slate-200 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              p.readiness_score >= 80 ? "bg-emerald-500" : p.readiness_score >= 60 ? "bg-amber-500" : "bg-slate-400"
                            }`}
                            style={{ width: `${p.readiness_score}%` }}
                          ></div>
                        </div>
                      </td>

                      {/* Turnover Stage */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 text-sky-800 block w-fit">
                          {p.current_stage?.replace(/_/g, " ")}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1 max-w-[160px] truncate" title={p.barrier_notes}>
                          {p.barrier_notes || "No barriers reported."}
                        </div>
                      </td>

                      {/* Estimated Liberation */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 text-[11px]">
                          {p.estimated_liberation_window}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Assessed: {new Date(p.last_assessed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      {/* Queue Pre-Allocation */}
                      <td className="py-3 px-4">
                        {p.pre_allocated_candidate ? (
                          <div className="p-2 rounded bg-purple-50 border border-purple-200 max-w-[180px]">
                            <div className="text-[10px] uppercase font-bold text-purple-700">Pre-Matched Inbound</div>
                            <div className="font-semibold text-purple-900 truncate">{p.pre_allocated_candidate.name}</div>
                            <div className="text-[10px] text-purple-600 truncate">{p.pre_allocated_candidate.condition}</div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setPreAllocModal(p);
                              setAllocForm({ name: "", req_bed_type: p.bed_type, condition: "" });
                            }}
                            className="text-[11px] text-slate-500 hover:text-purple-600 font-medium flex items-center space-x-1"
                          >
                            <span>+ Pre-Match Candidate</span>
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {!isLiberated ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            {nextStage && (
                              <button
                                onClick={() => {
                                  setAdvanceModal(p);
                                  setAdvanceStageTarget(nextStage);
                                  setBarrierNotes(p.barrier_notes || "");
                                }}
                                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium text-[11px] transition"
                              >
                                Advance Stage &rarr;
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setPreAllocModal(p);
                                setAllocForm(
                                  p.pre_allocated_candidate || { name: "", req_bed_type: p.bed_type, condition: "" }
                                );
                              }}
                              title="Pre-Allocate Admission"
                              className="p-1 rounded text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-100"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Liberated
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    No inpatient discharge records found matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. MODAL: ADVANCE DISCHARGE STAGE */}
      {advanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Advance Bed Turnover Stage</h3>
                <p className="text-xs text-slate-300">
                  Bed {advanceModal.bed_number} — {advanceModal.patient_name}
                </p>
              </div>
              <button onClick={() => setAdvanceModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdvanceStage} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Turnover Stage</label>
                <select
                  value={advanceStageTarget}
                  onChange={(e) => setAdvanceStageTarget(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-sky-500 focus:border-sky-500 font-medium"
                  required
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label} ({s.desc})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Clinical / Operational Milestone Notes
                </label>
                <textarea
                  rows="3"
                  value={barrierNotes}
                  onChange={(e) => setBarrierNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                  placeholder="e.g. Pulmonologist signed off; takeaway inhaler dispensed from formulary."
                ></textarea>
              </div>

              {advanceStageTarget === "evs_turnaround" && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                  <strong>Notice:</strong> Advancing to EVS Turnaround marks the bed as <em>Under Maintenance (UV Sanitization)</em> and notifies environmental services.
                </div>
              )}

              {advanceStageTarget === "liberated" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
                  <strong>Bed Liberation:</strong> This marks the bed as <em>Available</em> in the spatial grid and finalizes the patient discharge record.
                </div>
              )}

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdvanceModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md shadow-sky-900/30"
                >
                  {actionLoading ? "Updating..." : "Confirm Stage Transition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: PRE-ALLOCATE INBOUND CANDIDATE */}
      {preAllocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Pre-Allocate Inbound Admission</h3>
                <p className="text-xs text-slate-300">
                  Target: Bed {preAllocModal.bed_number} ({preAllocModal.ward_name})
                </p>
              </div>
              <button onClick={() => setPreAllocModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handlePreAllocate} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inbound Patient Name</label>
                <input
                  type="text"
                  value={allocForm.name}
                  onChange={(e) => setAllocForm({ ...allocForm, name: e.target.value })}
                  placeholder="e.g. Lucas Sterling"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-sky-500 focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Context / Urgency</label>
                <input
                  type="text"
                  value={allocForm.condition}
                  onChange={(e) => setAllocForm({ ...allocForm, condition: e.target.value })}
                  placeholder="e.g. Scheduled Post-Op Recovery / Waiting in Triage"
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                  required
                />
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                {preAllocModal.pre_allocated_candidate && (
                  <button
                    type="button"
                    onClick={() => {
                      setAllocForm({ name: "", req_bed_type: "standard", condition: "" });
                      handlePreAllocate({ preventDefault: () => {} });
                    }}
                    className="text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Clear Match
                  </button>
                )}
                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setPreAllocModal(null)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-900/30"
                  >
                    {actionLoading ? "Saving..." : "Save Match"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
