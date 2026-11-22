import { useState, useEffect, useRef } from "react";
import {
  getDigitalTwinEmergency,
  triggerDigitalTwinEmergency,
  toggleDigitalTwinChecklistItem,
  resolveDigitalTwinEmergency,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function EmergencyIncidentCommandDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("incident"); // "incident" | "decanting" | "history"
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [triggerForm, setTriggerForm] = useState({
    incident_type: "code_blue",
    location_zone: "CCU (Critical Care Unit) - Bay 3",
    severity: "tier_3_critical_disaster",
    patient_name: "Inpatient Bedside Emergency",
    notes: "",
    is_drill: false,
  });

  // Elapsed timer tick
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    loadEmergencyTwin();
  }, [token]);

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadEmergencyTwin(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  // Live timer for active incident
  useEffect(() => {
    if (data?.active_incident?.created_at && (data.system_status === "emergency_code_active" || data.system_status === "drill")) {
      const startTime = new Date(data.active_incident.created_at).getTime();
      const updateTimer = () => {
        const secs = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        setElapsed(secs);
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [data]);

  async function loadEmergencyTwin(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const result = await getDigitalTwinEmergency(token);
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError("Failed to load Emergency Command Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleToggleChecklist(checklistId, currentStatus) {
    if (!data?.active_incident?.id) return;
    try {
      await toggleDigitalTwinChecklistItem(token, {
        incidentId: data.active_incident.id,
        checklistId,
        completed: !currentStatus,
        completedBy: session?.user?.name || "Code Responder",
      });
      await loadEmergencyTwin(false);
    } catch (err) {
      alert("Failed to update checklist: " + err.message);
    }
  }

  async function handleTriggerIncident(e) {
    e.preventDefault();
    setActionLoading(true);
    try {
      await triggerDigitalTwinEmergency(token, triggerForm);
      setShowTriggerModal(false);
      await loadEmergencyTwin(false);
    } catch (err) {
      alert("Trigger failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolveIncident(e) {
    e.preventDefault();
    if (!data?.active_incident?.id) return;
    setActionLoading(true);
    try {
      await resolveDigitalTwinEmergency(token, {
        incidentId: data.active_incident.id,
        outcomeNotes: resolveNotes || "Patient stabilized. ROSC achieved.",
      });
      setShowResolveModal(false);
      setResolveNotes("");
      await loadEmergencyTwin(false);
    } catch (err) {
      alert("Resolve failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  const activeIncident = data?.active_incident;
  const telemetry = data?.emergency_telemetry || {};
  const isEmergency = data?.system_status === "emergency_code_active";
  const isDrill = data?.system_status === "drill";

  return (
    <div className="space-y-6">
      {/* 1. Header Card */}
      <div
        className={`p-6 rounded-xl shadow-lg border transition-all duration-300 ${
          isEmergency
            ? "bg-slate-900 border-rose-500 shadow-rose-900/30"
            : isDrill
            ? "bg-slate-900 border-amber-500 shadow-amber-900/30"
            : "bg-slate-900 border-slate-800 text-white"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="relative flex h-3.5 w-3.5">
                {isEmergency ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  </>
                ) : isDrill ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                )}
              </span>
              <span className="text-xs font-semibold tracking-wider text-rose-400 uppercase">
                EMERGENCY INCIDENT COMMAND TWIN
              </span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                Code Blue & Disaster Protocol
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              Hospital Emergency Response & Disaster Command
              {isEmergency && (
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-rose-600 text-white animate-pulse tracking-wide uppercase">
                  ACTIVE CODE BLUE STROBE
                </span>
              )}
              {isDrill && (
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-amber-600 text-white animate-pulse tracking-wide uppercase">
                  ACTIVE READINESS DRILL
                </span>
              )}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Automated Rapid Response Team (RRT) dispatch, ACLS clinical resuscitation checklist, and predictive bed decanting cascade.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!activeIncident ? (
              <>
                <button
                  onClick={() => {
                    setTriggerForm({
                      incident_type: "code_blue",
                      location_zone: "CCU (Critical Care Unit) - Bay 3",
                      severity: "tier_3_critical_disaster",
                      patient_name: "Inpatient Bedside Emergency",
                      notes: "Sudden respiratory and cardiac arrest detected.",
                      is_drill: false,
                    });
                    setShowTriggerModal(true);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-rose-900/40"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>1-Click Code Blue</span>
                </button>

                <button
                  onClick={() => {
                    setTriggerForm({
                      incident_type: "mass_casualty",
                      location_zone: "Emergency Department & Trauma Bay",
                      severity: "tier_3_critical_disaster",
                      patient_name: "Multi-Casualty Influx (Transit Incident)",
                      notes: "Mass transit collision; 10+ trauma arrivals inbound via ambulance dispatch.",
                      is_drill: false,
                    });
                    setShowTriggerModal(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Mass Casualty (MCI)</span>
                </button>

                <button
                  onClick={() => {
                    setTriggerForm({
                      incident_type: "code_blue",
                      location_zone: "Ward 3B - Semi-Private",
                      severity: "tier_2_high_consequence",
                      patient_name: "Simulated Patient (Drill Dummy)",
                      notes: "Quarterly Hospital Accreditation ACLS Resuscitation Drill.",
                      is_drill: true,
                    });
                    setShowTriggerModal(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  Resuscitation Drill
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowResolveModal(true)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-emerald-900/40"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Resolve Code (ROSC Achieved)</span>
              </button>
            )}

            <button
              onClick={() => loadEmergencyTwin(true)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
              title="Refresh Telemetry"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Active Incident Alert Banner (if any) */}
      {activeIncident ? (
        <div
          className={`p-5 rounded-xl border ${
            isEmergency
              ? "bg-rose-950/60 border-rose-500/60 text-rose-100"
              : "bg-amber-950/60 border-amber-500/60 text-amber-100"
          } shadow-md`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-lg ${
                  isEmergency ? "bg-rose-600 text-white" : "bg-amber-600 text-white"
                } flex-shrink-0`}
              >
                <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold bg-white/10 px-2 py-0.5 rounded">
                    {activeIncident.incident_code}
                  </span>
                  <span className="text-xs uppercase tracking-wide font-semibold">
                    {activeIncident.incident_type?.replace("_", " ")}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-black/30 font-medium">
                    {activeIncident.location_zone}
                  </span>
                </div>
                <div className="text-base font-semibold mt-1">
                  Target: {activeIncident.patient_name} — {activeIncident.notes}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-black/40 px-4 py-2.5 rounded-lg border border-white/10">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Elapsed Code Time</div>
                <div className="font-mono text-2xl font-bold text-white tracking-widest">
                  {formatTime(elapsed)}
                </div>
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">RRT Team Status</div>
                <div className="text-xs font-bold text-emerald-400">4 / 4 Deployed</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-medium">
              Hospital Emergency Readiness: <strong>NORMAL / ALL CLEAR</strong>. Telemetry sensors optimal, zero active cardiac arrest or disaster codes.
            </span>
          </div>
          <span className="text-xs text-emerald-400 font-mono">Sync: {lastUpdated || "Live"}</span>
        </div>
      )}

      {/* 3. Life Support Telemetry Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Central Medical O₂</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {telemetry.central_oxygen_pressure_bar || 4.2} <span className="text-xs text-slate-500 font-normal">Bar</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Optimal Continuous Line</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Defibrillators Ready</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {telemetry.defibrillators_ready || 6} / 6
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Biphasic Zoll Tested</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Crash Carts Checked</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {telemetry.crash_carts_calibrated || 8} / 8
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Seals & Drugs Verified</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Ventilators Open</span>
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {telemetry.ventilators_available || 3} / {telemetry.ventilators_total || 8}
          </div>
          <div className="text-[11px] text-blue-600 font-medium mt-0.5">Hamilton-C6 Standby</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>CCU / ICU Open Beds</span>
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="text-xl font-bold text-slate-800">
            {telemetry.ccu_available_beds ?? 2} <span className="text-xs text-slate-500 font-normal">/ {telemetry.ccu_total_beds ?? 6} Beds</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Critical Reserve Buffer</div>
        </div>
      </div>

      {/* 4. Tab Navigation Bar */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("incident")}
          className={`pb-3 border-b-2 transition ${
            activeTab === "incident"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          ACLS Code Checklist & RRT Roster
        </button>
        <button
          onClick={() => setActiveTab("decanting")}
          className={`pb-3 border-b-2 transition ${
            activeTab === "decanting"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Automated Bed Decanting Cascade ({data?.decanting_candidates?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 border-b-2 transition ${
            activeTab === "history"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Incident History & Debrief ({data?.recent_incidents?.length || 0})
        </button>
      </div>

      {/* 5. TAB CONTENT */}

      {/* TAB 1: INCIDENT COMMAND & ACLS CHECKLIST */}
      {activeTab === "incident" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: ACLS Resuscitation Protocol Checklist */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  ACLS Clinical Resuscitation Protocol Checklist
                </h3>
                <p className="text-xs text-slate-500">
                  Interactive American Heart Association (AHA) compliant emergency intervention timeline.
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">
                {activeIncident?.action_checklist?.filter((c) => c.completed).length || 0} /{" "}
                {activeIncident?.action_checklist?.length || 0} Completed
              </span>
            </div>

            {activeIncident?.action_checklist?.length > 0 ? (
              <div className="space-y-2.5">
                {activeIncident.action_checklist.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggleChecklist(item.id, item.completed)}
                    className={`flex items-start space-x-3 p-3.5 rounded-lg border cursor-pointer transition select-none ${
                      item.completed
                        ? "bg-emerald-50/60 border-emerald-200 text-slate-700"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => {}}
                      className="mt-0.5 h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1 text-xs">
                      <div className={`font-semibold ${item.completed ? "line-through text-slate-500" : "text-slate-900"}`}>
                        {item.action}
                      </div>
                      {item.completed && item.timestamp && (
                        <div className="text-[11px] text-emerald-700 mt-0.5">
                          Verified at {item.timestamp} by {item.by || "Resuscitation Team"}
                        </div>
                      )}
                    </div>
                    {item.completed && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Done
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm font-semibold text-slate-600">No Active Emergency Code Checklist</div>
                <div className="text-xs text-slate-400 mt-1">
                  Trigger a Code Blue or Mass-Casualty incident above to instantiate the real-time clinical protocol.
                </div>
              </div>
            )}
          </div>

          {/* Right 1 Col: Rapid Response Team (RRT) Roster */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Rapid Response Team (RRT)</h3>
              <p className="text-xs text-slate-500">Automated digital pager dispatch roster.</p>
            </div>

            {activeIncident?.rapid_response_team?.length > 0 ? (
              <div className="space-y-3">
                {activeIncident.rapid_response_team.map((member, i) => (
                  <div key={i} className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{member.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{member.role}</div>
                      <div className="text-[10px] text-slate-400">{member.specialty}</div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          member.status === "On Scene"
                            ? "bg-emerald-100 text-emerald-800"
                            : member.status === "En Route"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {member.status}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">{member.eta}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-xs">
                Zero active team members dispatched.
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
              <div className="font-semibold text-slate-700 mb-1">Emergency Communications</div>
              <div className="text-[11px] space-y-1">
                <div>• Code Blue PA Broadcast: <strong>Zone 3 Speaker Enabled</strong></div>
                <div>• Cath Lab Notification: <strong>Standby Alert Sent</strong></div>
                <div>• Blood Bank Hotline: <strong>Ext #4400 Active</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATED BED DECANTING CASCADE */}
      {activeTab === "decanting" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Automated Bed Decanting Cascade & Surge Liberation Plan
              </h3>
              <p className="text-xs text-slate-500">
                Digital Twin algorithm evaluates inpatient lengths of stay and clinical acuity to identify safe step-down and fast-track discharge beds.
              </p>
            </div>
            <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded font-semibold">
              Surge Bed Liberation Priority
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Bed</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Current Ward</th>
                  <th className="py-2.5 px-3">Length of Stay</th>
                  <th className="py-2.5 px-3">Decanting Action</th>
                  <th className="py-2.5 px-3">Target Destination</th>
                  <th className="py-2.5 px-3">Discharge Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.decanting_candidates?.length > 0 ? (
                  data.decanting_candidates.map((cand, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{cand.bed_number}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{cand.patient_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {cand.current_ward} <span className="text-[10px] uppercase text-slate-400">({cand.ward_type})</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{cand.stay_days} day(s)</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            cand.priority.includes("Step-Down")
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {cand.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{cand.target_destination}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-20 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${cand.readiness_score}%` }}
                            ></div>
                          </div>
                          <span className="font-mono text-[11px] text-slate-600">{cand.readiness_score}%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                      No decanting candidates found. Inpatient wards operating at normal bed capacity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INCIDENT HISTORY */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Emergency Incident History & Debrief Records</h3>
            <p className="text-xs text-slate-500">Comprehensive audit log of hospital emergency activations.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Incident Code</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Location Zone</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Triggered At</th>
                  <th className="py-2.5 px-3">Resolved At</th>
                  <th className="py-2.5 px-3">Clinical Outcome / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_incidents?.length > 0 ? (
                  data.recent_incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{inc.incident_code}</td>
                      <td className="py-2.5 px-3 uppercase text-slate-700">{inc.incident_type?.replace("_", " ")}</td>
                      <td className="py-2.5 px-3 text-slate-600">{inc.location_zone}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            inc.status === "active"
                              ? "bg-rose-100 text-rose-800 animate-pulse"
                              : inc.status === "drill_simulation"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {inc.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {new Date(inc.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {inc.resolved_at
                          ? new Date(inc.resolved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">{inc.notes || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                      Zero historical emergency incidents recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TRIGGER INCIDENT MODAL */}
      {showTriggerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Trigger Emergency Incident Command</h3>
                <p className="text-xs text-slate-300">Broadcasts instant audible & visual telemetry alarm to hospital staff.</p>
              </div>
              <button
                onClick={() => setShowTriggerModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTriggerIncident} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Incident Type</label>
                <select
                  value={triggerForm.incident_type}
                  onChange={(e) => setTriggerForm({ ...triggerForm, incident_type: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-rose-500 focus:border-rose-500"
                >
                  <option value="code_blue">Code Blue (Cardiac / Respiratory Arrest)</option>
                  <option value="mass_casualty">Mass-Casualty Disaster (MCI)</option>
                  <option value="code_red">Code Red (Facility Fire / Evacuation)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hospital Location Zone</label>
                <input
                  type="text"
                  value={triggerForm.location_zone}
                  onChange={(e) => setTriggerForm({ ...triggerForm, location_zone: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-rose-500 focus:border-rose-500"
                  placeholder="e.g. CCU Bay 3, Floor 2 Ward"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Affected Inpatient / Context</label>
                <input
                  type="text"
                  value={triggerForm.patient_name}
                  onChange={(e) => setTriggerForm({ ...triggerForm, patient_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                  placeholder="e.g. John Doe (Bed CCU-01)"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Notes & Dispatch Details</label>
                <textarea
                  rows="3"
                  value={triggerForm.notes}
                  onChange={(e) => setTriggerForm({ ...triggerForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                  placeholder="Provide rapid context for RRT members..."
                ></textarea>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="is_drill"
                  checked={triggerForm.is_drill}
                  onChange={(e) => setTriggerForm({ ...triggerForm, is_drill: e.target.checked })}
                  className="h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <label htmlFor="is_drill" className="text-slate-700 font-medium cursor-pointer">
                  Simulation / Training Drill Only (Do not summon external emergency services)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-lg shadow-rose-900/30"
                >
                  {actionLoading ? "Activating..." : "Broadcast Emergency Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. RESOLVE INCIDENT MODAL */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Resolve Emergency Incident</h3>
                <p className="text-xs text-slate-300">Close code command and document resuscitation outcome.</p>
              </div>
              <button
                onClick={() => setShowResolveModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveIncident} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clinical Outcome Notes</label>
                <textarea
                  rows="4"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                  placeholder="e.g. Return of Spontaneous Circulation (ROSC) achieved after 2 cycles of CPR and 1 shock. Patient stabilized and transferred to Cath Lab."
                  required
                ></textarea>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/30"
                >
                  {actionLoading ? "Resolving..." : "Confirm Code Resolution"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
