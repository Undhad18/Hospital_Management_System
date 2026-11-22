import { useState, useEffect } from "react";
import {
  getDigitalTwinDashboard,
  getDigitalTwinHistorical,
  syncDigitalTwin,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function HospitalDigitalTwinDashboard({ session }) {
  const token = session.token;
  const [data, setData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [viewMode, setViewMode] = useState("realtime"); // 'realtime' | 'historical'
  const [historyDays, setHistoryDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [socketConnected, setSocketConnected] = useState(true);
  const [error, setError] = useState(null);

  // Load dashboard telemetry
  useEffect(() => {
    loadDashboard();
  }, [token]);

  // Real-time Socket.IO listener for live digital twin telemetry updates
  useEffect(() => {
    const unsubscribe = subscribeToEvent(
      "digital_twin:update",
      (payload) => {
        setLastSyncTime(new Date().toLocaleTimeString());
        loadDashboard(false); // silent refresh
      },
      token
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [token]);

  async function loadDashboard(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinDashboard(token);
      if (res.success && res.data) {
        setData(res.data);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      setError("Failed to load Digital Twin dashboard: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function loadHistorical(days) {
    setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinHistorical(token, days);
      if (res.success && res.data) {
        setHistoricalData(res.data);
      }
    } catch (err) {
      setError("Failed to load historical telemetry: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForceSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await syncDigitalTwin(token);
      if (res.success) {
        setLastSyncTime(new Date().toLocaleTimeString());
        await loadDashboard(false);
      }
    } catch (err) {
      setError("Force synchronization failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ================= COMMAND CENTER TOP BAR ================= */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <h2 className="text-lg font-bold tracking-tight">
              Hospital Digital Twin — Operational Command Center
            </h2>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
              Telemetry Synchronized
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Real-time digital representation of hospital capacity, active inpatient beds, patient flow velocity, physician utilization, and laboratory throughput.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-400 block font-mono">Last Synchronized</span>
            <span className="text-xs text-slate-200 font-mono font-medium">{lastSyncTime || "Real-Time"}</span>
          </div>

          <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              onClick={() => {
                setViewMode("realtime");
                loadDashboard();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                viewMode === "realtime" ? "bg-sky-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Live Telemetry
            </button>
            <button
              onClick={() => {
                setViewMode("historical");
                loadHistorical(historyDays);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                viewMode === "historical" ? "bg-sky-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Historical Trends
            </button>
          </div>

          <button
            onClick={handleForceSync}
            disabled={syncing}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
            title="Force synchronization with MySQL database"
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{syncing ? "Syncing..." : "Force Sync"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {loading && !data && (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
          <div className="inline-block w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mb-2"></div>
          <p>Polling live digital twin telemetry signals...</p>
        </div>
      )}

      {/* ================= VIEW 1: REAL-TIME TELEMETRY ================= */}
      {viewMode === "realtime" && data && (
        <div className="space-y-6">
          {/* Top Telemetry KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {/* Total Inpatient Beds */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Bed Occupancy</span>
                <span className={`w-2 h-2 rounded-full ${
                  data.bed_telemetry?.occupancy_pct >= 85 ? "bg-rose-500" : "bg-emerald-500"
                }`}></span>
              </div>
              <div className="flex items-baseline space-x-1 mt-1">
                <span className="text-2xl font-bold text-slate-900">{data.bed_telemetry?.occupied_beds || 0}</span>
                <span className="text-xs text-slate-500 font-mono">/ {data.bed_telemetry?.total_beds || 0}</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data.bed_telemetry?.occupancy_pct || 0}% Occupied ({data.bed_telemetry?.available_beds || 0} free)
              </span>
            </div>

            {/* Outpatient Queue */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Active Queue</span>
              <span className="text-2xl font-bold text-amber-600 mt-1 block">
                {data.patient_flow?.stages?.waiting || 0}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                In Waiting Area (~{data.patient_flow?.avg_wait_mins || 15}m wait)
              </span>
            </div>

            {/* Active Doctors */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Physician Roster</span>
              <span className="text-2xl font-bold text-sky-600 mt-1 block">
                {data.doctor_telemetry?.active_doctors || 0}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data.doctor_telemetry?.scheduled_appointments || 0} Scheduled Consults
              </span>
            </div>

            {/* Laboratory Pipeline */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Lab Velocity</span>
              <span className="text-2xl font-bold text-indigo-600 mt-1 block">
                {data.laboratory_telemetry?.pending_orders || 0}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Pending Tests (~{data.laboratory_telemetry?.avg_tat_hours || "1.5"}h TAT)
              </span>
            </div>

            {/* Pharmacy Stock Alert */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Formulary Risk</span>
              <span className="text-2xl font-bold text-rose-600 mt-1 block">
                {data.pharmacy_telemetry?.low_stock_items || 0}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Items Below Minimum Stock
              </span>
            </div>
          </div>

          {/* Subsystem Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subsystem 1: Ward & Bed Status Overview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Inpatient Wards &amp; Spatial Bed Telemetry</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {data.bed_telemetry?.total_wards || 0} Wards Active
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {data.bed_telemetry?.wards && data.bed_telemetry.wards.map((w, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{w.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        w.occupancy_pct >= 85
                          ? "bg-rose-100 text-rose-800"
                          : w.occupancy_pct >= 60
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {w.occupancy_pct}%
                      </span>
                    </div>

                    <div className="mt-2 bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          w.occupancy_pct >= 85 ? "bg-rose-500" : w.occupancy_pct >= 60 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(w.occupancy_pct, 100)}%` }}
                      ></div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>Total: {w.total} beds</span>
                      <span className="text-amber-700">Occupied: {w.occupied}</span>
                      <span className="text-emerald-700 font-bold">Available: {w.available}</span>
                      <span className="text-slate-400">Maint: {w.maintenance || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subsystem 2: 10-Stage Patient Operational Journey */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  <span>10-Stage Patient Operational Journey</span>
                </h3>
                <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Live Flow
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {[
                  { stage: "1. Appointment", count: data.patient_flow?.stages?.appointment || 0, color: "bg-slate-100 text-slate-700" },
                  { stage: "2. Check-In", count: data.patient_flow?.stages?.checked_in || 0, color: "bg-sky-50 text-sky-800" },
                  { stage: "3. Waiting Area", count: data.patient_flow?.stages?.waiting || 0, color: "bg-amber-50 text-amber-800" },
                  { stage: "4. Consultation", count: data.patient_flow?.stages?.in_consultation || 0, color: "bg-indigo-50 text-indigo-800" },
                  { stage: "5. Laboratory", count: data.patient_flow?.stages?.laboratory || 0, color: "bg-purple-50 text-purple-800" },
                  { stage: "6. Prescription", count: data.patient_flow?.stages?.prescription || 0, color: "bg-teal-50 text-teal-800" },
                  { stage: "7. Billing", count: data.patient_flow?.stages?.billing || 0, color: "bg-blue-50 text-blue-800" },
                  { stage: "8. Pharmacy Queue", count: data.patient_flow?.stages?.pharmacy || 0, color: "bg-emerald-50 text-emerald-800" },
                  { stage: "9. Dispensing", count: data.patient_flow?.stages?.dispensing || 0, color: "bg-cyan-50 text-cyan-800" },
                  { stage: "10. Discharged", count: data.patient_flow?.stages?.completed || 0, color: "bg-slate-100 text-slate-900 font-bold" },
                ].map((s, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border border-slate-200/80 flex items-center justify-between ${s.color}`}>
                    <span className="font-semibold">{s.stage}</span>
                    <span className="font-mono font-bold text-sm">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 2: HISTORICAL DIGITAL TWIN PLAYBACK ================= */}
      {viewMode === "historical" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Historical Operational Telemetry &amp; Progression Playback
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-day operational state comparison: bed utilization velocity, appointment throughput, and dispensary trends.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setHistoryDays(d);
                    loadHistorical(d);
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded border transition ${
                    historyDays === d
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          {historicalData && historicalData.daily_snapshots ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Date Snapshot</th>
                    <th className="p-3 text-center">Total Appointments</th>
                    <th className="p-3 text-center">Completed Consults</th>
                    <th className="p-3 text-center">Bed Occupancy %</th>
                    <th className="p-3 text-center">Prescriptions Dispensed</th>
                    <th className="p-3 text-center">Lab Tests Processed</th>
                    <th className="p-3 text-right">Daily Collections</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historicalData.daily_snapshots.map((snap, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold text-slate-900 font-mono">{snap.date}</td>
                      <td className="p-3 text-center text-slate-700">{snap.total_appointments}</td>
                      <td className="p-3 text-center text-emerald-600 font-semibold">{snap.completed_consultations}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{snap.bed_occupancy_pct}%</td>
                      <td className="p-3 text-center text-sky-600">{snap.prescriptions_dispensed}</td>
                      <td className="p-3 text-center text-indigo-600">{snap.lab_tests_processed}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        ${Number(snap.total_revenue || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-8">
              No historical snapshots available for this period.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
