import { useMemo, useState, useEffect } from "react";
import { patientStore } from "../services/patientData";
import { getPatientDashboard } from "../services/api";

export default function PatientDashboard({
  session,
  profile,
  onOpenBooking,
  onNavigateTab,
}) {
  const [dashboardData, setDashboardData] = useState(null);

  const token = session?.token || (() => {
    try {
      const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
      return raw ? JSON.parse(raw)?.token : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!token) return;
    getPatientDashboard(token)
      .then((data) => setDashboardData(data))
      .catch((err) => console.warn("Dashboard live metrics fallback:", err.message));
  }, [token]);

  const appointments = useMemo(() => patientStore.getAppointments(), []);
  const prescriptions = useMemo(() => patientStore.getPrescriptions(), []);
  const labReports = useMemo(() => patientStore.getLabReports(), []);
  const consultationBills = useMemo(() => patientStore.getConsultationBills(), []);

  const upcomingApt = useMemo(() => {
    if (dashboardData?.next_appointment) {
      return dashboardData.next_appointment;
    }
    return appointments.find(
      (a) => a.status === "PENDING" || a.status === "CONFIRMED" || a.status === "IN_WAITING"
    );
  }, [dashboardData, appointments]);

  const upcomingCount = dashboardData?.metrics?.upcoming_appointments_count ??
    appointments.filter((a) => a.status === "CONFIRMED" || a.status === "PENDING").length;

  const recordsCount = dashboardData?.metrics?.medical_records_count ?? labReports.length;

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Welcome Banner */}
      <div className="ent-card p-6 bg-gradient-to-r from-sky-50 via-white to-sky-50/40 border-sky-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">
              Personal Patient Dashboard
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Welcome back, {profile?.full_name || "Patient"}
          </h1>
          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Manage your doctor appointments, digital prescriptions, and diagnostic lab reports across our accredited clinical network.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            type="button"
            onClick={onOpenBooking}
            className="ent-btn-primary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* 4 Compact KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <div
          onClick={() => onNavigateTab("appointments")}
          className="ent-kpi cursor-pointer hover:border-sky-300 transition"
        >
          <p className="ent-kpi-title">Upcoming Visits</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">
              {upcomingCount}
            </span>
            <span className="ent-chip-active text-[10px]">Active</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {upcomingApt ? `Next: ${upcomingApt.appointment_date}` : "No visits scheduled"}
          </p>
        </div>

        <div
          onClick={() => onNavigateTab("records")}
          className="ent-kpi cursor-pointer hover:border-sky-300 transition"
        >
          <p className="ent-kpi-title">Active Prescriptions</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">{prescriptions.length}</span>
            <span className="text-xs font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
              Authorized
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Digital e-prescriptions</p>
        </div>

        <div
          onClick={() => onNavigateTab("records")}
          className="ent-kpi cursor-pointer hover:border-sky-300 transition"
        >
          <p className="ent-kpi-title">Diagnostic Lab Reports</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">{labReports.length}</span>
            <span className="ent-chip-active text-[10px]">Ready</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">PDF downloads available</p>
        </div>

        <div
          onClick={() => onNavigateTab("bills")}
          className="ent-kpi cursor-pointer hover:border-sky-300 transition"
        >
          <p className="ent-kpi-title">Settled Invoices</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">{consultationBills.length}</span>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              ₹ Paid
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Completed receipts</p>
        </div>
      </div>

      {/* Main Grid: Upcoming Visit Highlight & Medical Baseline Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Next Appointment Highlight */}
        <div className="lg:col-span-2 space-y-4">
          <div className="ent-card p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-xs text-slate-900">
                  Next Scheduled Consultation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab("appointments")}
                className="text-xs text-sky-700 hover:text-sky-800 font-medium hover:underline"
              >
                View all &rarr;
              </button>
            </div>

            {upcomingApt ? (
              <div className="space-y-4">
                {upcomingApt.status === "CONFIRMED" && (
                  <div className="p-3 bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded flex items-center space-x-2">
                    <svg className="w-4 h-4 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>Arrival Advisory:</strong> Please report to hospital reception <strong>30 minutes early</strong> for vitals intake.
                    </span>
                  </div>
                )}

                <div className="flex items-start space-x-3.5">
                  <img
                    src={upcomingApt.doctor_avatar}
                    alt={upcomingApt.doctor_name}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-xs text-slate-900">{upcomingApt.doctor_name}</h4>
                      <span className="ent-chip-active text-[10px]">{upcomingApt.status}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      {upcomingApt.doctor_designation} &bull; {upcomingApt.department_name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {upcomingApt.hospital_name} &bull; {upcomingApt.doctor_room}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-medium">Date &amp; Time</span>
                    <p className="font-mono font-bold text-slate-800">{upcomingApt.appointment_date} at {upcomingApt.appointment_time}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-medium">Consultation Type</span>
                    <p className="font-medium text-slate-800">{upcomingApt.appointment_type}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600">
                  <strong>Consultation Reason:</strong> {upcomingApt.reason}
                </p>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">
                <p>You have no active consultations pending.</p>
                <button
                  type="button"
                  onClick={onOpenBooking}
                  className="mt-2 text-sky-700 hover:text-sky-800 font-semibold hover:underline"
                >
                  Book a consultation slot now &rarr;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Medical Baseline Summary */}
        <div className="space-y-4">
          <div className="ent-card p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-xs text-slate-900">
                Clinical Health Baseline
              </h3>
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                Blood Group: {profile?.blood_group || "B+"}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium block">Drug Allergies:</span>
                <p className="text-rose-800 font-medium bg-rose-50/70 p-1.5 rounded border border-rose-100 text-[11px] mt-0.5">
                  {profile?.allergies || "None Reported"}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium block">Chronic Conditions:</span>
                <p className="text-slate-800 text-[11px] mt-0.5">
                  {profile?.chronic_conditions || "None Reported"}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium block">Current Medications:</span>
                <p className="text-slate-800 text-[11px] mt-0.5 font-mono">
                  {profile?.current_medicines || "None"}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-medium block">Emergency Contact:</span>
                <p className="text-slate-900 font-semibold text-[11px] mt-0.5">
                  {profile?.emergency_contact_name || "Emergency Contact"} ({profile?.emergency_contact_number || "Unlisted"})
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
