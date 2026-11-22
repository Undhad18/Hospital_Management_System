import { useState, useEffect } from "react";
import {
  getAiActiveNotifications,
  getAiNotificationPreferences,
  updateAiNotificationPreferences,
  getAiAutomationOpportunities,
} from "../services/api";

export default function AiWorkflowNotificationCenter({ session }) {
  const token = session.token;
  const [activeTab, setActiveTab] = useState("alerts"); // 'alerts' | 'matrix' | 'preferences'
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [matrix, setMatrix] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [token]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [notifRes, prefRes, oppRes] = await Promise.all([
        getAiActiveNotifications(token),
        getAiNotificationPreferences(token),
        getAiAutomationOpportunities(token),
      ]);

      if (notifRes.success && notifRes.data) {
        const notifs = notifRes.data.notifications || notifRes.data.alerts || notifRes.data;
        setNotifications(Array.isArray(notifs) ? notifs : []);
      }
      if (prefRes.success) setPreferences(prefRes.data.preferences || {});
      if (oppRes.success) setMatrix(oppRes.data.opportunities || []);
    } catch (err) {
      setError("Failed to load workflow notifications data: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePreferences(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await updateAiNotificationPreferences(token, preferences);
      if (res.success) {
        setMessage("Notification preferences saved successfully.");
      }
    } catch (err) {
      setError("Failed to save preferences: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <h2 className="text-base font-bold text-slate-900">
              AI Workflow Suggestions &amp; Automation Assessment
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Intelligent threshold alerts, workflow anti-spam deduplication, and the Section 6 Automation Feasibility Matrix.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab("alerts")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "alerts"
                ? "bg-sky-600 text-white shadow-2xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Active Alerts ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "matrix"
                ? "bg-sky-600 text-white shadow-2xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Section 6 Matrix (11 Modules)
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "preferences"
                ? "bg-sky-600 text-white shadow-2xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Preferences
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="font-bold">×</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {loading && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
          Loading workflow notification center...
        </div>
      )}

      {/* ================= TAB 1: ACTIVE ALERTS ================= */}
      {!loading && activeTab === "alerts" && (
        <div className="space-y-4">
          <div className="bg-amber-50/60 border border-amber-200/80 p-3 rounded-lg text-xs text-amber-800 flex items-center space-x-2">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>Anti-Spam &amp; Human-in-the-Loop Guardrail:</strong> AI workflow suggestions identify threshold exceptions based on live telemetry. Administrative or clinical actions always require manual user confirmation.
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-slate-700">No Active Threshold Alerts</p>
              <p className="mt-1">All hospital subsystems are operating within configured tolerances.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notifications.map((n, idx) => {
                const isCritical = n.severity === "critical";
                const isWarning = n.severity === "warning";
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border shadow-2xs bg-white flex flex-col justify-between ${
                      isCritical
                        ? "border-rose-300 bg-rose-50/20"
                        : isWarning
                        ? "border-amber-300 bg-amber-50/20"
                        : "border-sky-200 bg-sky-50/20"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          isCritical
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : isWarning
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-sky-100 text-sky-800 border border-sky-200"
                        }`}>
                          {n.severity}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {n.rule_name || n.category}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 mt-2">
                        {n.title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {n.message}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-mono">
                        Rule #{n.rule_id || idx + 1}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded border border-slate-200">
                        Human Review Required
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: SECTION 6 OPPORTUNITIES MATRIX ================= */}
      {!loading && activeTab === "matrix" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 6 — AI Automation Opportunities Feasibility Matrix
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluation of potential automations across all 11 existing hospital modules.
              </p>
            </div>
            <span className="text-xs font-mono bg-sky-50 text-sky-700 px-2.5 py-1 rounded border border-sky-200 font-semibold">
              11 Modules Assessed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-semibold">#</th>
                  <th className="p-3 font-semibold">Existing Module</th>
                  <th className="p-3 font-semibold">Automation Opportunity</th>
                  <th className="p-3 font-semibold text-center">Feasibility</th>
                  <th className="p-3 font-semibold">Potential Benefit</th>
                  <th className="p-3 font-semibold">Risk Level &amp; Mitigation</th>
                  <th className="p-3 font-semibold text-center">Human Approval</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrix.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">{row.module_name}</td>
                    <td className="p-3 text-slate-800">{row.automation_opportunity}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        row.feasibility === "HIGH"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.feasibility === "MEDIUM"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-800"
                      }`}>
                        {row.feasibility}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{row.benefit}</td>
                    <td className="p-3 text-rose-700 text-[11px]">{row.risk}</td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-semibold bg-sky-50 text-sky-700 px-2 py-0.5 rounded border border-sky-200">
                        {row.human_in_loop ? "Mandatory" : "Optional"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                        {row.status || "Integrated"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 3: NOTIFICATION PREFERENCES ================= */}
      {!loading && activeTab === "preferences" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 max-w-2xl">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-3 border-b border-slate-200 mb-4">
            AI Notification Threshold Preferences
          </h3>

          <form onSubmit={handleSavePreferences} className="space-y-4 text-xs">
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.low_stock_alerts !== false}
                  onChange={(e) => setPreferences({ ...preferences, low_stock_alerts: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">Low Medicine Stock Notifications</span>
                  <span className="text-slate-500 text-[11px]">Notify pharmacy managers when drug quantities drop below safety limit.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.high_occupancy_alerts !== false}
                  onChange={(e) => setPreferences({ ...preferences, high_occupancy_alerts: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">High Ward Occupancy Alerts (&gt;85%)</span>
                  <span className="text-slate-500 text-[11px]">Notify nursing supervisors when available inpatient beds fall under 15%.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.long_wait_alerts !== false}
                  onChange={(e) => setPreferences({ ...preferences, long_wait_alerts: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">Patient Wait-Time Bottleneck Warnings (&gt;45 min)</span>
                  <span className="text-slate-500 text-[11px]">Flag outpatient waiting room queues exceeding standard duration limits.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.delayed_lab_alerts !== false}
                  onChange={(e) => setPreferences({ ...preferences, delayed_lab_alerts: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">Delayed Laboratory Report Watchdog</span>
                  <span className="text-slate-500 text-[11px]">Alert technicians when pending diagnostic orders exceed turnaround limits.</span>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-xs shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                {saving ? "Saving Preferences..." : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
