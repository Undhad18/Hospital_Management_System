import { useState, useEffect } from "react";
import {
  getDigitalTwinInfectionControl,
  triggerDigitalTwinInfectionCase,
  recordDigitalTwinContactSwab,
  updateDigitalTwinIsolationStatus,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function InfectionControlDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState("cases"); // "cases" | "contacts" | "aiir"
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagForm, setFlagForm] = useState({
    patient_name: "",
    current_ward_name: "General Medical Inpatient Ward",
    current_bed_number: "",
    pathogen: "Methicillin-Resistant Staphylococcus aureus (MRSA)",
    isolation_type: "contact",
    severity: "isolated",
    negative_pressure_pa: -2.8,
    containment_notes: "",
  });

  const [swabModal, setSwabModal] = useState(null); // contact object
  const [swabResult, setSwabResult] = useState("negative");

  useEffect(() => {
    loadInfectionTwin();
  }, [token]);

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadInfectionTwin(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadInfectionTwin(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const result = await getDigitalTwinInfectionControl(token);
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError("Failed to load Infection Control Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleFlagCase(e) {
    e.preventDefault();
    if (!flagForm.patient_name || !flagForm.current_bed_number) {
      alert("Please provide patient name and bed number");
      return;
    }
    setActionLoading(true);
    try {
      await triggerDigitalTwinInfectionCase(token, {
        ...flagForm,
        negative_pressure_pa:
          flagForm.isolation_type === "airborne_negative_pressure"
            ? Number(flagForm.negative_pressure_pa) || -2.8
            : null,
      });
      setFlagModalOpen(false);
      setFlagForm({
        patient_name: "",
        current_ward_name: "General Medical Inpatient Ward",
        current_bed_number: "",
        pathogen: "Methicillin-Resistant Staphylococcus aureus (MRSA)",
        isolation_type: "contact",
        severity: "isolated",
        negative_pressure_pa: -2.8,
        containment_notes: "",
      });
      await loadInfectionTwin(false);
    } catch (err) {
      alert("Failed to flag infection case: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecordSwab() {
    if (!swabModal) return;
    setActionLoading(true);
    try {
      await recordDigitalTwinContactSwab(token, {
        contactId: swabModal.id,
        result: swabResult,
        status: swabResult === "negative" ? "screened_negative" : "quarantined",
      });
      setSwabModal(null);
      await loadInfectionTwin(false);
    } catch (err) {
      alert("Failed to record swab result: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIncrementNegativeSwab(caseItem) {
    const nextCount = (caseItem.swab_results_count || 0) + 1;
    setActionLoading(true);
    try {
      const isCleared = nextCount >= (caseItem.required_negative_swabs || 3);
      await updateDigitalTwinIsolationStatus(token, {
        caseId: caseItem.id,
        swab_count: nextCount,
        status: isCleared ? "cleared_resolved" : "active_isolation",
        containment_notes: isCleared
          ? `${caseItem.containment_notes || ""}\n[CLEARED]: Completed ${nextCount}/${caseItem.required_negative_swabs} negative swabs. Precautions de-escalated.`
          : `${caseItem.containment_notes || ""}\n[SWAB #${nextCount}]: Negative swab logged at ${new Date().toLocaleTimeString()}.`,
      });
      await loadInfectionTwin(false);
    } catch (err) {
      alert("Failed to update swab count: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeescalateCase(caseItem) {
    if (!window.confirm(`De-escalate and clear isolation for ${caseItem.patient_name} (${caseItem.case_code})?`)) {
      return;
    }
    setActionLoading(true);
    try {
      await updateDigitalTwinIsolationStatus(token, {
        caseId: caseItem.id,
        status: "cleared_resolved",
        containment_notes: `${caseItem.containment_notes || ""}\n[RESOLVED]: Infection precautions de-escalated by clinical team at ${new Date().toLocaleTimeString()}.`,
      });
      await loadInfectionTwin(false);
    } catch (err) {
      alert("Failed to de-escalate case: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const overview = data?.overview || {
    active_isolations: 0,
    surveillance_contacts_traced: 0,
    high_risk_exposures: 0,
    pending_swab_tests: 0,
    aiir_rooms_monitored: 0,
    live_aiir_pressure_pa: -2.8,
    isolation_breakdown: {},
  };

  const cases = data?.cases || [];
  const contacts = data?.recent_contacts || [];

  const filteredCases = cases.filter((c) => {
    if (typeFilter !== "all" && c.isolation_type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.patient_name?.toLowerCase().includes(q) ||
        c.case_code?.toLowerCase().includes(q) ||
        c.pathogen?.toLowerCase().includes(q) ||
        c.current_ward_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredContacts = contacts.filter((ct) => {
    if (riskFilter !== "all" && ct.risk_level !== riskFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        ct.contact_name?.toLowerCase().includes(q) ||
        ct.contact_role?.toLowerCase().includes(q) ||
        ct.location_zone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white rounded-xl p-6 shadow-xl border border-rose-800/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-1 text-xs font-semibold bg-rose-500/20 text-rose-300 rounded-full border border-rose-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                SURVEILLANCE DIGITAL TWIN ACTIVE
              </span>
              <span className="text-xs text-rose-200/70 font-mono">
                Differential AIIR: {overview.live_aiir_pressure_pa} Pa (Inward Seal)
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Infection Control, Outbreak Surveillance & Contact Tracing Twin
            </h1>
            <p className="text-sm text-rose-100/70 mt-1">
              Real-time pathogen containment, negative pressure AIIR isolation telemetry, automated spatial contact tracing & outbreak suppression.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => loadInfectionTwin(true)}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-rose-200 rounded-lg text-xs font-medium border border-rose-700/30 transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={() => setFlagModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-rose-900/50 transition flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Flag Contagion Case
            </button>
          </div>
        </div>

        {lastUpdated && (
          <div className="mt-4 pt-3 border-t border-rose-800/30 flex items-center justify-between text-xs text-rose-200/60 font-mono">
            <span>Hospital Isolation Command • Multi-Tenant RBAC Active</span>
            <span>Last Telemetry Sync: {lastUpdated}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Top 5 Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Isolations</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{overview.active_isolations}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 rounded-full">
              Containment
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">In dedicated ward beds</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Traced Contacts</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-indigo-600">{overview.surveillance_contacts_traced}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 rounded-full">
              Surveillance
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Co-patients & clinicians</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">High-Risk Exposures</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-600">{overview.high_risk_exposures}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
              Immediate Swab
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Adjacent bed occupants</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Swab Tests</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-cyan-600">{overview.pending_swab_tests}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-cyan-100 text-cyan-800 rounded-full">
              Lab Awaiting
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">PCR / Culture clearance</div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-xl shadow-sm border border-slate-700 text-white">
          <div className="text-xs font-medium text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>AIIR Pressure</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {overview.live_aiir_pressure_pa} Pa
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-900/60 text-emerald-300 rounded border border-emerald-500/30">
              Optimal Seal
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">12 Air Changes/Hr (ACH)</div>
        </div>
      </div>

      {/* Main View Navigation & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("cases")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "cases"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Active Infection Cases ({cases.length})
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "contacts"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Spatial Contact Cohort ({contacts.length})
          </button>
          <button
            onClick={() => setActiveTab("aiir")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "aiir"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            AIIR Negative Pressure Telemetry
          </button>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === "cases" && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-rose-500 focus:border-rose-500"
            >
              <option value="all">All Isolation Types</option>
              <option value="contact">Contact Precautions</option>
              <option value="airborne_negative_pressure">Airborne (AIIR Negative Pressure)</option>
              <option value="droplet">Droplet Precautions</option>
              <option value="enteric_contact">Enteric Contact</option>
            </select>
          )}

          {activeTab === "contacts" && (
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-rose-500 focus:border-rose-500"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk (Adjacent Beds)</option>
              <option value="moderate">Moderate Risk</option>
              <option value="low">Low Risk</option>
            </select>
          )}

          <div className="relative">
            <input
              type="text"
              placeholder="Search patient, bed, pathogen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 w-52"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mb-3"></div>
          <div className="text-sm text-slate-600 font-medium">Synchronizing Infection Surveillance Twin...</div>
        </div>
      ) : (
        <>
          {/* TAB 1: ACTIVE INFECTION CASES */}
          {activeTab === "cases" && (
            <div className="space-y-4">
              {filteredCases.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border border-slate-200 text-slate-500 text-sm">
                  No active infection cases matching the selected filter.
                </div>
              ) : (
                filteredCases.map((caseItem) => {
                  const required = caseItem.required_negative_swabs || 3;
                  const currentSwabs = caseItem.swab_results_count || 0;
                  const pct = Math.min(100, Math.round((currentSwabs / required) * 100));
                  const isAirborne = caseItem.isolation_type === "airborne_negative_pressure";

                  return (
                    <div
                      key={caseItem.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:border-rose-300 transition"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-lg ${isAirborne ? "bg-purple-100 text-purple-700" : "bg-rose-100 text-rose-700"}`}>
                            {isAirborne ? (
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                              </svg>
                            ) : (
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded">
                                {caseItem.case_code}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                caseItem.status === "active_isolation"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}>
                                {caseItem.status === "active_isolation" ? "Active Isolation" : "Cleared / Resolved"}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                caseItem.severity === "active_outbreak"
                                  ? "bg-red-600 text-white"
                                  : caseItem.severity === "cluster_watch"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}>
                                {caseItem.severity === "active_outbreak" ? "Outbreak Warning" : caseItem.severity === "cluster_watch" ? "Cluster Watch" : "Single Case Isolated"}
                              </span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mt-1">
                              {caseItem.patient_name}{" "}
                              <span className="text-sm font-normal text-slate-500">
                                (Bed: <strong className="text-slate-800 font-semibold">{caseItem.current_bed_number}</strong> • {caseItem.current_ward_name})
                              </span>
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleIncrementNegativeSwab(caseItem)}
                            disabled={actionLoading || caseItem.status === "cleared_resolved"}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Log Negative Swab (+1)
                          </button>
                          {caseItem.status === "active_isolation" && (
                            <button
                              onClick={() => handleDeescalateCase(caseItem)}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                            >
                              De-escalate
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Middle Details */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500 uppercase font-medium">Pathogen Isolated</span>
                          <div className="mt-1 font-bold text-slate-900">{caseItem.pathogen}</div>
                          <div className="mt-2 text-slate-600">
                            Protocol: <strong className="text-rose-700 capitalize">{caseItem.isolation_type.replace(/_/g, " ")}</strong>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 uppercase font-medium">Swab Clearance Tracker</span>
                            <span className="font-bold text-slate-800 font-mono">
                              {currentSwabs} / {required} Negatives
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                pct >= 100 ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="mt-2 text-slate-500">
                            {pct >= 100
                              ? "Cleared for isolation lift."
                              : `${required - currentSwabs} more negative swab(s) required to de-escalate.`}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500 uppercase font-medium">
                            {isAirborne ? "AIIR Negative Pressure Seal" : "PPE & Containment Enacted"}
                          </span>
                          <div className="mt-1 font-bold text-slate-900 flex items-center gap-1.5">
                            {isAirborne ? (
                              <>
                                <span className="font-mono text-purple-700">{caseItem.negative_pressure_pa} Pa</span>
                                <span className="text-emerald-600 text-[11px]">(Inward Airflow Verified)</span>
                              </>
                            ) : (
                              <span className="text-slate-800">Contact PPE: Yellow Gown + Gloves</span>
                            )}
                          </div>
                          <div className="mt-2 text-slate-500">
                            Spatial Co-Patients Traced: <strong className="text-slate-800">{caseItem.contacts?.length || 0} contacts</strong>
                          </div>
                        </div>
                      </div>

                      {/* Containment Notes */}
                      {caseItem.containment_notes && (
                        <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg text-xs text-amber-900 whitespace-pre-line font-mono">
                          {caseItem.containment_notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: SPATIAL CONTACT COHORT */}
          {activeTab === "contacts" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hospital Spatial Contact Tracing Matrix</h3>
                  <p className="text-xs text-slate-500">
                    Automated 48-72 hour co-location mapping across inpatient rooms, nurses stations, and shared clinical zones.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 bg-white px-2.5 py-1 rounded border border-slate-200">
                  {filteredContacts.length} Contacts Tracked
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">Contact Individual</th>
                      <th className="px-4 py-3">Type & Role</th>
                      <th className="px-4 py-3">Exposure Zone & Window</th>
                      <th className="px-4 py-3">Risk Level</th>
                      <th className="px-4 py-3">Containment Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredContacts.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                          No contacts match the selected risk criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredContacts.map((ct) => (
                        <tr key={ct.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {ct.contact_name}
                            <div className="text-[11px] text-slate-400 font-normal">
                              Case ID #{ct.case_id}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize font-medium text-slate-800">
                              {ct.contact_type.replace(/_/g, " ")}
                            </span>
                            <div className="text-[11px] text-slate-500">{ct.contact_role}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{ct.location_zone}</div>
                            <div className="text-[11px] text-slate-500">{ct.exposure_window}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                ct.risk_level === "high"
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : ct.risk_level === "moderate"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {ct.risk_level.toUpperCase()} RISK
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                                ct.containment_status === "screened_negative"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : ct.containment_status === "quarantined"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-cyan-100 text-cyan-800 animate-pulse"
                              }`}
                            >
                              {ct.containment_status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                setSwabModal(ct);
                                setSwabResult("negative");
                              }}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-medium transition"
                            >
                              Log Swab Result
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: AIIR NEGATIVE PRESSURE TELEMETRY */}
          {activeTab === "aiir" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Airborne Infection Isolation Room (AIIR) Chamber 1
                  </h3>
                  <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                    CCU-102 AIIR
                  </span>
                </div>

                <div className="mt-4 p-4 bg-slate-900 rounded-xl text-white">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Continuous Manometer Differential</div>
                  <div className="text-4xl font-extrabold font-mono text-emerald-400 mt-2">
                    -2.8 Pa
                  </div>
                  <div className="mt-2 text-xs text-emerald-300 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Optimal Inward Airflow (Standard: &le; -2.5 Pa)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500">HEPA Exhaust Ventilation</span>
                    <div className="font-bold text-slate-900 mt-1">12 Air Changes / Hr (ACH)</div>
                    <span className="text-emerald-600 text-[11px]">CDC Guideline Compliant</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500">Anteroom Air Balance</span>
                    <div className="font-bold text-slate-900 mt-1">-1.2 Pa Cascade</div>
                    <span className="text-emerald-600 text-[11px]">Air-lock verified</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
                  CDC / WHO Airborne Precautions Checklist
                </h3>
                <ul className="mt-4 space-y-3 text-xs text-slate-700">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Door remains closed at all times with self-closing hydraulic arm engaged.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Fit-tested NIOSH N95 / FFP2 respirators donned before entering anteroom.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Direct exterior HEPA filtered exhaust without recirculation into central hospital HVAC.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Digital twin IoT differential pressure sensor streaming telemetry every 60 seconds.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: FLAG CONTAGION CASE */}
      {flagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Flag Inpatient Contagion Case
              </h3>
              <button
                onClick={() => setFlagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFlagCase} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Patient Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Chandra"
                  value={flagForm.patient_name}
                  onChange={(e) => setFlagForm({ ...flagForm, patient_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Current Ward *</label>
                  <select
                    value={flagForm.current_ward_name}
                    onChange={(e) => setFlagForm({ ...flagForm, current_ward_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                  >
                    <option value="General Medical Inpatient Ward">General Medical Ward</option>
                    <option value="Coronary Critical Care Unit (CCU)">Coronary CCU</option>
                    <option value="Surgical High-Dependency Ward">Surgical HDU</option>
                    <option value="Emergency Trauma Bay">Emergency Trauma Bay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Bed Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GEN-205 or CCU-104"
                    value={flagForm.current_bed_number}
                    onChange={(e) => setFlagForm({ ...flagForm, current_bed_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Pathogen / Organism *</label>
                <input
                  type="text"
                  required
                  value={flagForm.pathogen}
                  onChange={(e) => setFlagForm({ ...flagForm, pathogen: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Isolation Precaution</label>
                  <select
                    value={flagForm.isolation_type}
                    onChange={(e) => setFlagForm({ ...flagForm, isolation_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                  >
                    <option value="contact">Contact Precautions</option>
                    <option value="airborne_negative_pressure">Airborne (AIIR Negative Pressure)</option>
                    <option value="droplet">Droplet Precautions</option>
                    <option value="enteric_contact">Enteric Contact</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Severity / Surveillance Tier</label>
                  <select
                    value={flagForm.severity}
                    onChange={(e) => setFlagForm({ ...flagForm, severity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                  >
                    <option value="isolated">Single Case Isolated</option>
                    <option value="cluster_watch">Cluster Watch (Multiple beds)</option>
                    <option value="active_outbreak">Active Outbreak Alert</option>
                  </select>
                </div>
              </div>

              {flagForm.isolation_type === "airborne_negative_pressure" && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Target Negative Pressure (Pa)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={flagForm.negative_pressure_pa}
                    onChange={(e) => setFlagForm({ ...flagForm, negative_pressure_pa: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 font-mono"
                  />
                  <span className="text-[11px] text-slate-500">Standard AIIR differential is &le; -2.5 Pa</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Containment Notes</label>
                <textarea
                  rows="2"
                  placeholder="PPE instructions, swab regimen, or clinical context..."
                  value={flagForm.containment_notes}
                  onChange={(e) => setFlagForm({ ...flagForm, containment_notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFlagModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold shadow-md transition disabled:opacity-50"
                >
                  {actionLoading ? "Activating..." : "Enact Isolation & Auto-Trace Cohort"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD CONTACT SWAB RESULT */}
      {swabModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Log Surveillance Swab Test
              </h3>
              <button
                onClick={() => setSwabModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <div>
                Contact: <strong className="text-slate-900">{swabModal.contact_name}</strong>
              </div>
              <div>
                Role: <span className="text-slate-700">{swabModal.contact_role}</span>
              </div>
              <div>
                Zone: <span className="text-slate-700">{swabModal.location_zone}</span>
              </div>
              <div>
                Risk Level:{" "}
                <strong className={swabModal.risk_level === "high" ? "text-rose-600 uppercase" : "text-slate-800 uppercase"}>
                  {swabModal.risk_level}
                </strong>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <label className="block text-slate-700 font-semibold">PCR / Culture Laboratory Result</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSwabResult("negative")}
                  className={`p-3 rounded-lg border text-center font-bold transition ${
                    swabResult === "negative"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-base">NEGATIVE</div>
                  <div className="text-[11px] font-normal text-emerald-700">Clear from isolation</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSwabResult("positive")}
                  className={`p-3 rounded-lg border text-center font-bold transition ${
                    swabResult === "positive"
                      ? "bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-base">POSITIVE</div>
                  <div className="text-[11px] font-normal text-rose-700">Quarantine & Isolate</div>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSwabModal(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordSwab}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold shadow transition disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Submit Laboratory Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
