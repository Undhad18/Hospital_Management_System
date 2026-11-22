import { useState, useEffect } from "react";
import { getDigitalTwinOt, transitionDigitalTwinOtCase } from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function OtSurgicalSuiteDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState("theaters"); // "theaters" | "pipeline" | "pacu"
  const [error, setError] = useState(null);

  useEffect(() => {
    loadOtTwin();
  }, [token]);

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadOtTwin(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadOtTwin(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinOt(token);
      if (res.success && res.data) {
        setData(res.data);
        setLastUpdated(new Date().toLocaleTimeString());
        if (selectedCase) {
          const updated = res.data.all_cases?.find((c) => c.id === selectedCase.id);
          if (updated) setSelectedCase(updated);
        }
      }
    } catch (err) {
      setError("Failed to load Operation Theater Digital Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleStageTransition(caseId, nextStage, pacuBed = null) {
    setTransitioning(true);
    try {
      await transitionDigitalTwinOtCase(token, caseId, {
        next_stage: nextStage,
        pacu_bed: pacuBed,
      });
      await loadOtTwin(false);
    } catch (err) {
      alert("Transition failed: " + err.message);
    } finally {
      setTransitioning(false);
    }
  }

  const overview = data?.overview || {};
  const theaters = data?.theaters || [];
  const pacuBeds = data?.pacu_beds || [];
  const pipeline = data?.surgical_pipeline || {};

  function getStatusBadge(status) {
    switch (status) {
      case "in_surgery":
        return { label: "IN SURGERY", bg: "bg-rose-500 text-white", pulse: true };
      case "turnaround_sanitization":
        return { label: "TURNAROUND / UV", bg: "bg-amber-500 text-white", pulse: true };
      case "available":
        return { label: "READY / AVAILABLE", bg: "bg-emerald-500 text-white", pulse: false };
      case "emergency_standby":
        return { label: "EMERGENCY STANDBY", bg: "bg-sky-500 text-white", pulse: false };
      default:
        return { label: status?.toUpperCase() || "MAINTENANCE", bg: "bg-slate-400 text-white", pulse: false };
    }
  }

  function getAldreteBadge(score) {
    if (score >= 9) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (score >= 7) return "bg-amber-100 text-amber-800 border-amber-300";
    return "bg-rose-100 text-rose-800 border-rose-300";
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-xs font-mono tracking-widest text-cyan-400 uppercase font-semibold">
                Surgical Suite &amp; PACU Twin
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Operation Theater (OT) &amp; PACU Surgical Digital Twin
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
              Real-time surgical theater monitoring, multi-stage perioperative patient tracking,
              HEPA laminar environmental telemetry, and post-anesthesia recovery (PACU) bed utilization.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            {lastUpdated && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded-md border border-slate-700">
                Synced: {lastUpdated}
              </span>
            )}
            <button
              onClick={() => loadOtTwin(true)}
              disabled={loading}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-md transition shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{loading ? "Syncing..." : "Force Sync"}</span>
            </button>
          </div>
        </div>

        {/* Global Perioperative KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Active In-Surgery Suites
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-rose-400">
                {overview.active_surgeries || 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                / {overview.total_theaters || 4} Suites
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Pre-Op &amp; Scheduled Today
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-sky-400">
                {overview.total_scheduled_today || 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">cases booked</span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              PACU Recovery Load
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-amber-400">
                {overview.pacu_active_count || 0} / {overview.pacu_beds_total || 6}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({overview.pacu_utilization_pct || 0}% Occupied)
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Turnaround Sanitization
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-emerald-400">
                {overview.turnaround_count || 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                theaters active cycle
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold text-rose-700 hover:text-rose-900">✕</button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-2">
        <button
          onClick={() => setActiveTab("theaters")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${activeTab === "theaters"
            ? "bg-sky-600 text-white shadow-xs"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>Live Operation Theaters ({theaters.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${activeTab === "pipeline"
            ? "bg-sky-600 text-white shadow-xs"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span>Perioperative Flow Pipeline (4 Stages)</span>
        </button>

        <button
          onClick={() => setActiveTab("pacu")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${activeTab === "pacu"
            ? "bg-sky-600 text-white shadow-xs"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>PACU Recovery Telemetry ({pacuBeds.length} Beds)</span>
        </button>
      </div>

      {/* VIEW 1: LIVE THEATERS GRID */}
      {activeTab === "theaters" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {theaters.map((ot) => {
            const badge = getStatusBadge(ot.status);
            const curr = ot.current_surgery;
            const next = ot.next_surgery;

            return (
              <div
                key={ot.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition space-y-4"
              >
                {/* Theater Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {ot.theater_code}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                        {ot.suite_type} SUITE
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-1 leading-tight">
                      {ot.name}
                    </h2>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center space-x-1 shrink-0 ${badge.bg}`}>
                    {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                    <span>{badge.label}</span>
                  </span>
                </div>

                {/* Environmental Microclimate Telemetry */}
                <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">TEMP</span>
                    <span className="font-bold text-slate-800">{ot.temperature_celsius}°C</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">HUMIDITY</span>
                    <span className="font-bold text-slate-800">{ot.humidity_pct}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">AIR EXCH</span>
                    <span className="font-bold text-slate-800">{ot.air_turnover_rate} ACH</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">LAMINAR</span>
                    <span className="font-bold text-emerald-600 font-mono">
                      {ot.laminar_flow_active ? "ACTIVE" : "STANDBY"}
                    </span>
                  </div>
                </div>

                {/* Current Active Surgery or Sanitization State */}
                {curr ? (
                  <div className="p-3.5 rounded-lg bg-rose-50/70 border border-rose-200 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-rose-900 font-bold truncate">{curr.procedure_name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 shrink-0">
                        {curr.elapsed_minutes} min elapsed
                      </span>
                    </div>

                    <p className="text-[11px] text-rose-700 leading-snug">
                      👤 Patient: <span className="font-semibold text-rose-900">{curr.patient_name}</span> • Lead: <span className="font-semibold text-rose-900">{curr.surgeon_name}</span>
                    </p>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-rose-700 mb-1">
                        <span>Procedure Progress (Est. {curr.estimated_duration_minutes}m)</span>
                        <span className="font-bold">{curr.progress_percentage}%</span>
                      </div>
                      <div className="h-1.5 bg-rose-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-600 transition-all duration-500 rounded-full"
                          style={{ width: `${Math.min(curr.progress_percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-rose-200/80 flex items-center justify-between">
                      <span className="text-[10px] text-rose-600 font-mono">
                        Anesthesia: {curr.anesthesia_type}
                      </span>
                      <button
                        onClick={() => handleStageTransition(curr.id, "post_op_pacu")}
                        disabled={transitioning}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold rounded transition cursor-pointer"
                      >
                        Conclude → Transfer PACU
                      </button>
                    </div>
                  </div>
                ) : ot.status === "turnaround_sanitization" ? (
                  <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 space-y-2 text-xs">
                    <div className="flex items-center space-x-2 text-amber-900 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <span>Turnaround UV-C Disinfection in Progress</span>
                    </div>
                    <p className="text-[11px] text-amber-700">
                      Surfaces sanitized, HEPA purge cycling. Estimated turnaround completion in ~15 mins.
                    </p>
                    <button
                      onClick={() => handleStageTransition(next?.id, "intra_op")}
                      disabled={transitioning || !next}
                      className="mt-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold rounded transition cursor-pointer disabled:opacity-50"
                    >
                      Clear Turnaround &amp; Begin Next
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-800 space-y-1">
                    <div className="flex items-center space-x-2 font-bold text-emerald-900">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Theater Sterile &amp; Available for Intake</span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      All surgical trays and anesthesia monitors calibrated.
                    </p>
                  </div>
                )}

                {/* Next Scheduled Case */}
                {next && (
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <div className="truncate mr-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Next Case</span>
                      <span className="font-semibold text-slate-800 truncate block">{next.procedure_name}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                      {new Date(next.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: PERIOPERATIVE PIPELINE (4-STAGE KANBAN) */}
      {activeTab === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Stage 1: Pre-Op Holding */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Pre-Op Holding
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                {(pipeline.pre_op_holding || []).length}
              </span>
            </div>

            <div className="space-y-2.5">
              {(pipeline.pre_op_holding || []).map((c) => (
                <div key={c.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2 text-xs">
                  <div className="font-bold text-slate-900 leading-snug">{c.procedure_name}</div>
                  <p className="text-[11px] text-slate-500">
                    Patient: <span className="font-semibold text-slate-700">{c.patient_name}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Surgeon: <span className="font-semibold text-slate-700">{c.surgeon_name}</span>
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">{c.theater_code}</span>
                    <button
                      onClick={() => handleStageTransition(c.id, "intra_op")}
                      disabled={transitioning}
                      className="px-2 py-0.5 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-semibold rounded cursor-pointer"
                    >
                      Enter OT →
                    </button>
                  </div>
                </div>
              ))}
              {(pipeline.pre_op_holding || []).length === 0 && (
                <p className="text-xs text-slate-400 italic text-center p-3">No cases currently in holding.</p>
              )}
            </div>
          </div>

          {/* Stage 2: In-Theater (Intra-Op) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                2. Intra-Op Surgery
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                {(pipeline.intra_op || []).length}
              </span>
            </div>

            <div className="space-y-2.5">
              {(pipeline.intra_op || []).map((c) => (
                <div key={c.id} className="p-3 bg-white rounded-lg border border-rose-300 shadow-2xs space-y-2 text-xs">
                  <div className="font-bold text-rose-900 leading-snug">{c.procedure_name}</div>
                  <p className="text-[11px] text-slate-500">
                    Patient: <span className="font-semibold text-slate-700">{c.patient_name}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Surgeon: <span className="font-semibold text-slate-700">{c.surgeon_name}</span>
                  </p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-rose-600 font-bold">{c.theater_code}</span>
                    <button
                      onClick={() => handleStageTransition(c.id, "post_op_pacu")}
                      disabled={transitioning}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold rounded cursor-pointer"
                    >
                      To PACU →
                    </button>
                  </div>
                </div>
              ))}
              {(pipeline.intra_op || []).length === 0 && (
                <p className="text-xs text-slate-400 italic text-center p-3">No active procedures in theaters.</p>
              )}
            </div>
          </div>

          {/* Stage 3: PACU Recovery */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">
                3. PACU Recovery
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {(pipeline.post_op_pacu || []).length}
              </span>
            </div>

            <div className="space-y-2.5">
              {(pipeline.post_op_pacu || []).map((c) => (
                <div key={c.id} className="p-3 bg-white rounded-lg border border-amber-300 shadow-2xs space-y-2 text-xs">
                  <div className="font-bold text-slate-900 leading-snug">{c.procedure_name}</div>
                  <p className="text-[11px] text-slate-500">
                    Patient: <span className="font-semibold text-slate-700">{c.patient_name}</span>
                  </p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 inline-block">
                    Bed: {c.pacu_bed_number || "PACU-B01"}
                  </span>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Vital Stabilized</span>
                    <button
                      onClick={() => handleStageTransition(c.id, "completed")}
                      disabled={transitioning}
                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded cursor-pointer"
                    >
                      Discharge →
                    </button>
                  </div>
                </div>
              ))}
              {(pipeline.post_op_pacu || []).length === 0 && (
                <p className="text-xs text-slate-400 italic text-center p-3">PACU recovery beds free.</p>
              )}
            </div>
          </div>

          {/* Stage 4: Completed & Ward Step-Down */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                4. Settled / Ward Transfer
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {(pipeline.completed || []).length}
              </span>
            </div>

            <div className="space-y-2.5">
              {(pipeline.completed || []).map((c) => (
                <div key={c.id} className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs space-y-1 text-xs">
                  <div className="font-bold text-slate-800 leading-snug">{c.procedure_name}</div>
                  <p className="text-[11px] text-slate-500">{c.patient_name}</p>
                  <span className="text-[10px] font-mono text-emerald-600 font-semibold">✓ Successfully Discharged</span>
                </div>
              ))}
              {(pipeline.completed || []).length === 0 && (
                <p className="text-xs text-slate-400 italic text-center p-3">No cases settled yet today.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: PACU RECOVERY TELEMETRY */}
      {activeTab === "pacu" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pacuBeds.map((bed) => {
              const isOccupied = bed.status === "occupied";
              const isCleaning = bed.status === "cleaning";

              return (
                <div
                  key={bed.id}
                  className={`p-4 rounded-xl border transition shadow-xs space-y-3 ${isOccupied
                    ? "bg-white border-amber-300"
                    : isCleaning
                      ? "bg-slate-50 border-slate-300"
                      : "bg-emerald-50/40 border-emerald-300"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 font-mono">
                      {bed.bed_number}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isOccupied
                      ? "bg-amber-100 text-amber-800"
                      : isCleaning
                        ? "bg-slate-200 text-slate-700"
                        : "bg-emerald-100 text-emerald-800"
                      }`}>
                      {bed.status}
                    </span>
                  </div>

                  {isOccupied ? (
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">Patient / Procedure</span>
                        <span className="font-bold text-slate-800 block truncate">{bed.patient_name}</span>
                        <span className="text-[11px] text-slate-500 truncate block">{bed.procedure_name}</span>
                      </div>

                      {/* Vital Signs Grid */}
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-200 text-center font-mono">
                        <div className="bg-slate-50 p-1.5 rounded">
                          <span className="text-[9px] text-slate-400 block">SpO2</span>
                          <span className="font-bold text-emerald-600">{bed.oxygen_saturation_pct}%</span>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded">
                          <span className="text-[9px] text-slate-400 block">HEART</span>
                          <span className="font-bold text-slate-800">{bed.heart_rate_bpm} bpm</span>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded">
                          <span className="text-[9px] text-slate-400 block">BP</span>
                          <span className="font-bold text-slate-800">{bed.blood_pressure}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500">Aldrete Score:</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${getAldreteBadge(bed.aldrete_recovery_score)}`}>
                          {bed.aldrete_recovery_score} / 10
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      {isCleaning ? "Bed in sanitization cycle" : "Ready for post-op admission"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
