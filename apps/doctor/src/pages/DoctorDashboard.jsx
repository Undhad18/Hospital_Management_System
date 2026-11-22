import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getDoctorAppointments,
  updateDoctorAppointmentStatus,
  startConsultationWorkflow,
} from "../services/api";
import ConsultationWorkspace from "./ConsultationWorkspace";
import Pagination, { usePagination } from "../components/Pagination";
import PatientHistoryModal from "./PatientHistoryModal";

export default function DoctorDashboard({ session }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Module 8 Workspace Active State
  const [activeConsultationAppointmentId, setActiveConsultationAppointmentId] = useState(null);

  // Patient History Inspection State
  const [historyPatient, setHistoryPatient] = useState(null);

  // Filters
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all"); // all | in_waiting | in_progress | completed | confirmed
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAppointments = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setActionError("");
    try {
      const data = await getDoctorAppointments(session.token, { date: filterDate });
      if (Array.isArray(data)) {
        setAppointments(data);
      }
    } catch (err) {
      console.warn("Could not load live appointments:", err.message);
      setActionError(err.message || "Failed to load live appointments.");
    } finally {
      setLoading(false);
    }
  }, [session, filterDate]);

  useEffect(() => {
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 20000);
    return () => clearInterval(interval);
  }, [fetchAppointments]);

  // Handle Starting or Resuming Consultation
  const handleOpenConsultation = async (patient) => {
    if (!session?.token) return;
    setUpdatingId(patient.id);
    setActionError("");
    setActionSuccess("");

    try {
      if (patient.status === "in_waiting" || patient.status === "confirmed") {
        // Trigger start consultation workflow on backend
        await startConsultationWorkflow(session.token, patient.id);
        await fetchAppointments();
      }
      // Open the workspace
      setActiveConsultationAppointmentId(patient.id);
    } catch (err) {
      setActionError(err.message || "Failed to open consultation workspace.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Status transitions
  async function handleStatusChange(appointmentId, newStatus, reason = "") {
    if (!session?.token) return;
    setUpdatingId(appointmentId);
    setActionError("");
    setActionSuccess("");

    try {
      await updateDoctorAppointmentStatus(session.token, appointmentId, newStatus, reason);
      setActionSuccess(`Appointment status successfully changed to ${newStatus.replace("_", " ")}.`);
      await fetchAppointments();
    } catch (err) {
      setActionError(err.message || "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  }

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((p) => {
      // Status filter
      if (statusFilter !== "all" && p.status !== statusFilter) return false;

      // Search query (name, appointment_number, queue_number)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pName = (p.patient_name || p.full_name || "").toLowerCase();
        const aNum = (p.appointment_number || "").toLowerCase();
        const qNum = (p.queue_number || "").toLowerCase();
        if (!pName.includes(q) && !aNum.includes(q) && !qNum.includes(q)) return false;
      }

      return true;
    });
  }, [appointments, statusFilter, searchQuery]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedAppointments,
    resetPage,
  } = usePagination(filteredAppointments, 25);

  useEffect(() => {
    resetPage();
  }, [statusFilter, searchQuery, resetPage]);

  const waitingCount = appointments.filter((p) => p.status === "in_waiting").length;
  const inProgressCount = appointments.filter((p) => p.status === "in_progress").length;
  const completedCount = appointments.filter((p) => p.status === "completed").length;

  // Render Consultation Workspace when an appointment is active
  if (activeConsultationAppointmentId) {
    return (
      <ConsultationWorkspace
        appointmentId={activeConsultationAppointmentId}
        session={session}
        onBack={() => {
          setActiveConsultationAppointmentId(null);
          fetchAppointments();
        }}
        onCompleted={() => {
          setActiveConsultationAppointmentId(null);
          fetchAppointments();
        }}
      />
    );
  }

  return (
    <div className="w-full space-y-5 font-sans">
      {/* Patient History Modal */}
      {historyPatient && (
        <PatientHistoryModal
          patientId={historyPatient.id}
          patientName={historyPatient.name}
          token={session.token}
          onClose={() => setHistoryPatient(null)}
        />
      )}

      {/* ======================= COMPACT KPI TILES ======================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <div className="ent-kpi">
          <p className="ent-kpi-title">Total Roster for Date</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">{appointments.length}</span>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {completedCount} Completed
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{waitingCount + inProgressCount} Active in OPD Queue</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Waiting Queue</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-amber-700">{waitingCount}</span>
            <span className="ent-chip-pending text-[10px]">Ready for Doctor</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Triage checked-in patients</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Active Consultations</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-sky-700">{inProgressCount}</span>
            <span className="text-xs font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
              In Chamber
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Currently in consultation</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Clinical Unit</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-base font-bold text-slate-900 truncate">
              {session?.user?.departmentName || "Outpatient OPD"}
            </span>
            <span className="ent-chip-active text-[10px]">Online</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{session?.user?.hospitalName || "Hospital Facility"}</p>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess("")} className="font-bold text-emerald-900 cursor-pointer">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="font-bold text-rose-900 cursor-pointer">✕</button>
        </div>
      )}

      {/* ======================= PATIENT APPOINTMENTS DATA GRID ======================= */}
      <div className="ent-card overflow-hidden">
        {/* Header & Controls */}
        <div className="ent-card-header flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Physician Consultation Roster &amp; Daily Queue
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Launch clinical consultation workspace, manage vital signs, order investigations, and create daily prescriptions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date filter */}
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="ent-input text-xs font-mono py-1 px-2.5 max-w-[140px]"
            />

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchAppointments}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-md shadow-xs transition cursor-pointer disabled:opacity-60"
              title="Refresh Roster"
            >
              <svg
                className={`w-3.5 h-3.5 text-white ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 border border-slate-300 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({appointments.length})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("in_waiting")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                statusFilter === "in_waiting"
                  ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Waiting ({waitingCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("in_progress")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                statusFilter === "in_progress"
                  ? "bg-sky-100 text-sky-900 border border-sky-300 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              In Chamber ({inProgressCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                statusFilter === "completed"
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Completed ({completedCount})
            </button>
          </div>

          {/* Search box */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, token, ID..."
              className="ent-input text-xs py-1"
            />
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="ent-table">
            <thead>
              <tr>
                <th>Queue Token</th>
                <th>Patient Details</th>
                <th>Slot Time</th>
                <th>Type</th>
                <th>Reason / Chief Complaint</th>
                <th>Status</th>
                <th className="text-right">Clinical Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                    {loading ? "Loading appointments..." : "No appointments found matching current filters."}
                  </td>
                </tr>
              ) : (
                paginatedAppointments.map((patient) => {
                  const isUpdating = updatingId === patient.id;

                  return (
                    <tr
                      key={patient.id}
                      className={patient.status === "in_progress" ? "bg-sky-50/40" : ""}
                    >
                      <td>
                        {patient.queue_number ? (
                          <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            {patient.queue_number}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">--</span>
                        )}
                      </td>

                      <td>
                        <div className="font-semibold text-slate-900">
                          {patient.patient_name || patient.full_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                          <span>{patient.appointment_number || patient.id}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryPatient({
                                id: patient.patient_id,
                                name: patient.patient_name || patient.full_name,
                              })
                            }
                            className="text-[10px] text-sky-600 hover:text-sky-800 underline font-sans cursor-pointer"
                            title="View EHR History"
                          >
                            [EHR History]
                          </button>
                        </div>
                      </td>

                      <td className="font-mono text-xs font-semibold text-slate-800">
                        {patient.appointment_time || patient.start_time}
                      </td>

                      <td>
                        <span className="capitalize text-xs font-medium text-slate-700">
                          {(patient.appointment_type || "routine").replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-slate-400 block capitalize">
                          {(patient.appointment_mode || "in_person").replace("_", " ")}
                        </span>
                      </td>

                      <td className="text-xs text-slate-600 max-w-xs truncate" title={patient.reason}>
                        {patient.reason || "Routine Consultation"}
                      </td>

                      <td>
                        {patient.status === "in_progress" && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse"></span>
                            In Consultation
                          </span>
                        )}
                        {patient.status === "in_waiting" && (
                          <span className="ent-chip-pending">
                            Waiting in Hall
                          </span>
                        )}
                        {patient.status === "completed" && (
                          <span className="ent-chip-active">
                            Completed
                          </span>
                        )}
                        {patient.status === "confirmed" && (
                          <span className="ent-chip-inactive">
                            Confirmed (Not Checked In)
                          </span>
                        )}
                        {patient.status === "admitted" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
                            Admitted to Ward
                          </span>
                        )}
                        {patient.status === "cancelled" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Cancelled
                          </span>
                        )}
                      </td>

                      <td className="text-right space-x-1.5">
                        {/* Start Consultation button */}
                        {(patient.status === "in_waiting" || patient.status === "confirmed") && (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleOpenConsultation(patient)}
                            className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                          >
                            {isUpdating ? "Opening..." : "Start Consultation"}
                          </button>
                        )}

                        {/* Resume Consultation button */}
                        {patient.status === "in_progress" && (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleOpenConsultation(patient)}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                          >
                            Resume Workstation →
                          </button>
                        )}

                        {/* View Consultation Summary for Completed */}
                        {patient.status === "completed" && (
                          <button
                            type="button"
                            onClick={() => setActiveConsultationAppointmentId(patient.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-medium transition cursor-pointer"
                          >
                            View Clinical Summary
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  );
}
