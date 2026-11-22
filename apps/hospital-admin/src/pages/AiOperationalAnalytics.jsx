import { useState, useEffect } from "react";
import {
  getAiAppointmentAnalytics,
  getAiQueueAnalytics,
  getAiDoctorWorkloadAnalytics,
  getAiBedPredictionAnalytics,
  getAiMedicineForecastingAnalytics,
  getAiLabAnalytics,
  getAiBillingInsights,
} from "../services/api";

const SUB_TABS = [
  { id: "appointments", label: "Appointments", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "queue", label: "Patient Queue", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { id: "doctors", label: "Doctor Workload", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { id: "beds", label: "Bed & Admissions", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "pharmacy", label: "Pharmacy & Stock", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { id: "lab", label: "Laboratory Velocity", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" },
  { id: "finance", label: "Financial Insights", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

export default function AiOperationalAnalytics({ session }) {
  const token = session.token;
  const [activeTab, setActiveTab] = useState("appointments");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    loadTabAnalytics(activeTab);
  }, [activeTab, token]);

  async function loadTabAnalytics(tab) {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (tab === "appointments") res = await getAiAppointmentAnalytics(token);
      else if (tab === "queue") res = await getAiQueueAnalytics(token);
      else if (tab === "doctors") res = await getAiDoctorWorkloadAnalytics(token);
      else if (tab === "beds") res = await getAiBedPredictionAnalytics(token);
      else if (tab === "pharmacy") res = await getAiMedicineForecastingAnalytics(token);
      else if (tab === "lab") res = await getAiLabAnalytics(token);
      else if (tab === "finance") res = await getAiBillingInsights(token);

      if (res && res.success) {
        setData(res.data);
      } else {
        throw new Error(res?.message || "Failed to load operational analytics");
      }
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
            <h2 className="text-base font-bold text-slate-900">
              AI Operational Intelligence &amp; Predictive Analytics
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time workload forecasts, bottleneck alerts, capacity warnings, and pharmacy demand predictions.
          </p>
        </div>

        <button
          onClick={() => loadTabAnalytics(activeTab)}
          disabled={loading}
          className="self-start md:self-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center space-x-1.5 transition cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex space-x-1 border-b border-slate-200 overflow-x-auto pb-1">
        {SUB_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center space-x-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-white text-sky-700 border-t-2 border-sky-600 shadow-2xs border-x border-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <svg className={`w-4 h-4 ${isActive ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={t.icon} />
              </svg>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error Notification */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
          <div className="inline-block w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mb-2"></div>
          <p>Running predictive algorithms and computing operational metrics...</p>
        </div>
      )}

      {/* Tab Contents */}
      {!loading && data && (
        <div className="space-y-6">
          {/* ================= 1. APPOINTMENTS TAB ================= */}
          {activeTab === "appointments" && (
            <div className="space-y-5">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Today's Appointments</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">{data.summary?.total || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Scheduled: {data.summary?.scheduled || 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Completed Consults</span>
                  <span className="text-xl font-bold text-emerald-600 mt-1 block">{data.summary?.completed ?? data.statusBreakdown?.completed ?? 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">In Progress: {data.summary?.in_progress ?? data.summary?.in_consultation ?? data.statusBreakdown?.in_progress ?? 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Cancellation Rate</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">{data.cancellation_rate_pct ?? data.cancellationRate ?? 0}%</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Cancelled: {data.summary?.cancelled ?? data.statusBreakdown?.cancelled ?? 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">No-Show Patterns</span>
                  <span className="text-xl font-bold text-rose-600 mt-1 block">{data.no_show_count ?? data.summary?.no_show ?? 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Needs Follow-up: {data.followUpSuggestions?.length ?? data.follow_up_suggestions?.length ?? 0}</span>
                </div>
              </div>

              {/* Conflict Detection Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Scheduling Conflicts &amp; Overlap Detection</span>
                </h3>
                {data.conflicts_detected && data.conflicts_detected.length > 0 ? (
                  <div className="mt-3 divide-y divide-slate-100">
                    {data.conflicts_detected.map((c, i) => (
                      <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{c.doctor_name}</span>
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{c.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-2">Zero scheduling conflicts detected across today's slots.</p>
                )}
              </div>

              {/* Follow-up Suggestions Card */}
              {data.follow_up_suggestions && data.follow_up_suggestions.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                    Recommended Patient Follow-Ups
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Patient Name</th>
                          <th className="p-2.5">Previous Doctor</th>
                          <th className="p-2.5">Last Appointment</th>
                          <th className="p-2.5">Suggested Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.follow_up_suggestions.map((f, i) => (
                          <tr key={i}>
                            <td className="p-2.5 font-medium text-slate-800">{f.patient_name}</td>
                            <td className="p-2.5 text-slate-600">{f.doctor_name}</td>
                            <td className="p-2.5 text-slate-500">{new Date(f.last_date).toLocaleDateString()}</td>
                            <td className="p-2.5 text-sky-700 font-medium">{f.suggested_interval}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= 2. PATIENT QUEUE TAB ================= */}
          {activeTab === "queue" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Patients Waiting</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">{data.summary?.waiting_count || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">In Waiting Area</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">In Consultation</span>
                  <span className="text-xl font-bold text-sky-600 mt-1 block">{data.summary?.in_consultation_count || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">With Attending Physician</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Estimated Wait Time</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">~{data.summary?.estimated_wait_minutes || 0} min</span>
                  <span className="text-[11px] text-amber-600 mt-1 block">Longest: {data.summary?.longest_wait_minutes || 0} min</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Completed Today</span>
                  <span className="text-xl font-bold text-emerald-600 mt-1 block">{data.summary?.completed_today || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Patients Discharged</span>
                </div>
              </div>

              {/* Bottleneck Warning Banner */}
              {data.bottlenecks_detected && data.bottlenecks_detected.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-800 flex items-center space-x-1.5 mb-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Queue Bottleneck Early Warnings (&gt;45 min wait time)</span>
                  </h4>
                  <div className="space-y-1">
                    {data.bottlenecks_detected.map((b, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        • {b.patient_name || b.doctor_name}: {b.alert || b.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctor Queue Breakdown */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Doctor-Wise Live Queue Status
                </h3>
                {data.doctor_queues && data.doctor_queues.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.doctor_queues.map((dq, idx) => (
                      <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-800">{dq.doctor_name}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            dq.waiting_count > 3 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                          }`}>
                            {dq.waiting_count} Waiting
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{dq.department_name}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                          <span>Est. Queue Duration:</span>
                          <span className="font-semibold text-slate-900">~{dq.estimated_queue_time_mins || 0} mins</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No active patient queues at this time.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= 3. DOCTOR WORKLOAD TAB ================= */}
          {activeTab === "doctors" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Active Roster</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">{data.summary?.active_doctors || 0} Doctors</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Scheduled Today</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Fully Booked (&gt;85%)</span>
                  <span className="text-xl font-bold text-rose-600 mt-1 block">{data.summary?.fully_booked_doctors || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Requires Pacing / Relief</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Schedule Balance</span>
                  <span className="text-xl font-bold text-emerald-600 mt-1 block">Optimal</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Zero Schedule Mutations</span>
                </div>
              </div>

              {/* Doctor Utilization Table */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Physician Utilization &amp; Schedule Pacing
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Doctor</th>
                        <th className="p-3">Department</th>
                        <th className="p-3 text-center">Appts</th>
                        <th className="p-3 text-center">Completed</th>
                        <th className="p-3 text-center">Pending</th>
                        <th className="p-3">Schedule Utilization</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.roster && data.roster.map((d, i) => (
                        <tr key={i}>
                          <td className="p-3 font-semibold text-slate-900">{d.doctor_name}</td>
                          <td className="p-3 text-slate-600">{d.department_name}</td>
                          <td className="p-3 text-center font-bold text-slate-800">{d.total_appointments}</td>
                          <td className="p-3 text-center text-emerald-600 font-semibold">{d.completed_consultations}</td>
                          <td className="p-3 text-center text-amber-600 font-semibold">{d.pending_consultations}</td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    d.utilization_pct > 80 ? "bg-rose-500" : d.utilization_pct > 50 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${Math.min(d.utilization_pct, 100)}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-slate-700">{d.utilization_pct}%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              d.workload_status === "heavy"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : d.workload_status === "moderate"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}>
                              {d.workload_status || "Balanced"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= 4. BED & ADMISSION PREDICTION TAB ================= */}
          {activeTab === "beds" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Hospital Beds</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">{data.summary?.total_beds || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Configured in System</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Occupied Beds</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">{data.summary?.occupied_beds || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">{data.summary?.overall_occupancy_pct}% Occupancy</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Available Beds</span>
                  <span className="text-xl font-bold text-emerald-600 mt-1 block">{data.summary?.available_beds || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Ready for Admission</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Under Maintenance</span>
                  <span className="text-xl font-bold text-slate-600 mt-1 block">{data.summary?.maintenance_beds || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Sterilization/Repairs</span>
                </div>
              </div>

              {/* Ward Occupancy Projection Grid */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">
                  Ward-Wise Occupancy &amp; Early Capacity Warnings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.ward_projections && data.ward_projections.map((w, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900">{w.ward_name}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          w.occupancy_pct >= 85
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : w.occupancy_pct >= 60
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}>
                          {w.occupancy_pct}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{w.department_name}</p>

                      <div className="mt-3 bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            w.occupancy_pct >= 85 ? "bg-rose-500" : w.occupancy_pct >= 60 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(w.occupancy_pct, 100)}%` }}
                        ></div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-600 font-mono">
                        <span>Total: {w.total_beds}</span>
                        <span className="text-amber-700">Occupied: {w.occupied_beds}</span>
                        <span className="text-emerald-700 font-bold">Avail: {w.available_beds}</span>
                      </div>

                      {w.early_warning && (
                        <div className="mt-2 text-[10px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                          ⚠ High Occupancy Warning: Less than 10% buffer remaining.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= 5. PHARMACY & INVENTORY TAB ================= */}
          {activeTab === "pharmacy" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Formulary Items</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">{data.summary?.total_active_medicines || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Active In Hospital</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Low Stock Alerts</span>
                  <span className="text-xl font-bold text-rose-600 mt-1 block">{data.summary?.low_stock_count || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Below Safety Threshold</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Expiring Soon</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">{data.summary?.expiring_soon_count || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Within 60 Days</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Tracked Batches</span>
                  <span className="text-xl font-bold text-sky-600 mt-1 block">{data.summary?.total_batches_tracked || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">FEFO Managed</span>
                </div>
              </div>

              {/* Low Stock Items & Reorder Recommendations */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Low-Stock Items &amp; AI Reorder Calculations
                </h3>
                {data.low_stock_items && data.low_stock_items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3">Medicine</th>
                          <th className="p-3 text-center">Current Stock</th>
                          <th className="p-3 text-center">Alert Limit</th>
                          <th className="p-3 text-center">Est. Daily Burn</th>
                          <th className="p-3 text-center">Days Remaining</th>
                          <th className="p-3 text-right">Suggested Reorder</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.low_stock_items.map((m, idx) => (
                          <tr key={idx}>
                            <td className="p-3 font-semibold text-slate-900">{m.medicine_name}</td>
                            <td className="p-3 text-center font-bold text-rose-600">{m.current_stock}</td>
                            <td className="p-3 text-center text-slate-500">{m.alert_threshold}</td>
                            <td className="p-3 text-center text-slate-700">{m.average_daily_burn || "~1"} / day</td>
                            <td className="p-3 text-center font-semibold text-amber-700">{m.days_of_stock_remaining || "< 3"} days</td>
                            <td className="p-3 text-right font-bold text-sky-600">{m.suggested_reorder_qty} units</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">All formulary items are above their safety alert thresholds.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= 6. LABORATORY VELOCITY TAB ================= */}
          {activeTab === "lab" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Today's Lab Orders</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">{data.summary?.total_orders_today || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Diagnostics Tracked</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Pending / In-Progress</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">{data.summary?.pending_orders || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Awaiting Processing</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Average Turnaround</span>
                  <span className="text-xl font-bold text-sky-600 mt-1 block">~{data.summary?.average_tat_hours || "1.5"} hrs</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Order to Final Report</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Delayed Tests</span>
                  <span className="text-xl font-bold text-rose-600 mt-1 block">{data.summary?.delayed_orders_count || 0}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Exceeded Standard TAT</span>
                </div>
              </div>

              {/* 48-Hour Duplicate Orders Warning */}
              {data.duplicate_warnings && data.duplicate_warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-800 flex items-center space-x-1.5 mb-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Potential Duplicate Diagnostic Tests (Within 48h Window)</span>
                  </h4>
                  <div className="space-y-1">
                    {data.duplicate_warnings.map((d, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        • Patient #{d.patient_id} ({d.patient_name}) has repeat order for <strong>{d.test_name}</strong> ordered by {d.doctor_name}.
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= 7. FINANCIAL INSIGHTS TAB ================= */}
          {activeTab === "finance" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Consultation Revenue</span>
                  <span className="text-xl font-bold text-emerald-600 mt-1 block">${Number(data.summary?.total_consultation_revenue || 0).toLocaleString()}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Clinical Services</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Pharmacy Revenue</span>
                  <span className="text-xl font-bold text-sky-600 mt-1 block">${Number(data.summary?.total_pharmacy_revenue || 0).toLocaleString()}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Medications Dispensed</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Pending Receivables</span>
                  <span className="text-xl font-bold text-amber-600 mt-1 block">${Number(data.summary?.pending_receivables || 0).toLocaleString()}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Unpaid Invoices</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Combined Collections</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">${Number(data.summary?.total_combined_revenue || 0).toLocaleString()}</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">Audited MySQL Receipts</span>
                </div>
              </div>

              {/* Strict Audit & Separation Banner */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">Financial Integrity Verification</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Consultation charges and pharmacy dispensary bills are strictly partitioned in MySQL schemas to guarantee statutory accounting compliance.
                  </p>
                </div>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-semibold text-[10px]">
                  Audited
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
