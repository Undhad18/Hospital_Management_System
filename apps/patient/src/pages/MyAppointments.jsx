import { useState, useEffect, useMemo, useCallback } from "react";
import {
  patientStore,
  getPendingCountdown,
  canReschedule,
  canCancel,
  validateBookingDate,
  AVAILABLE_TIME_SLOTS,
} from "../services/patientData";
import {
  getPatientAppointments,
  cancelPatientAppointment,
  rescheduleAppointment,
  getAppointmentLabTests,
  downloadLabReport,
  viewLabReport,
} from "../services/api";
import Pagination, { usePagination } from "../components/Pagination";

export default function MyAppointments({ session, onOpenBooking }) {
  const [appointments, setAppointments] = useState([]);
  const [activeTab, setActiveTab] = useState("upcoming"); // 'upcoming' | 'history'
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  const token = session?.token || (() => {
    try {
      const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
      return raw ? JSON.parse(raw)?.token : null;
    } catch {
      return null;
    }
  })();

  // Reschedule Modal State
  const [reschedulingApt, setReschedulingApt] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  // Cancellation Modal State
  const [cancellingApt, setCancellingApt] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Lab Tests Modal State (Lesson 11.5)
  const [viewingLabApt, setViewingLabApt] = useState(null);
  const [appointmentLabTests, setAppointmentLabTests] = useState([]);
  const [loadingLabTests, setLoadingLabTests] = useState(false);
  const [labTestsError, setLabTestsError] = useState("");

  const loadAppointments = useCallback(async () => {
    const localApts = patientStore.getAppointments();
    if (!token) {
      setAppointments(localApts);
      return;
    }

    try {
      const live = await getPatientAppointments(token);
      if (Array.isArray(live) && live.length > 0) {
        const normalizedLive = live.map((a) => ({
          ...a,
          id: a.id,
          appointment_number: a.appointment_number,
          doctor_name: a.doctor_name || "Assigned Physician",
          department: a.department_name || "General Medicine",
          hospital: a.hospital_name || "Hospital",
          appointment_date: a.appointment_date ? new Date(a.appointment_date).toISOString().split("T")[0] : a.appointment_date,
          appointment_time: a.appointment_time,
          status: a.status ? a.status.toUpperCase() : "CONFIRMED",
          consultation_fee: a.consultation_fee,
          payment_method: a.payment_method ? a.payment_method.toUpperCase() : "CASH",
          reason: a.reason,
          created_at: a.created_at || a.created_date,
        }));
        setAppointments(normalizedLive);
      } else {
        setAppointments(localApts);
      }
    } catch (err) {
      console.warn("Could not fetch live appointments, using local store:", err.message);
      setAppointments(localApts);
    }
  }, [token]);

  // Load appointment lab tests (Lesson 11.5)
  const handleOpenLabTests = async (apt) => {
    setViewingLabApt(apt);
    setLoadingLabTests(true);
    setLabTestsError("");
    setAppointmentLabTests([]);
    try {
      const res = await getAppointmentLabTests(token, apt.id);
      setAppointmentLabTests(res.tests || []);
    } catch (err) {
      setLabTestsError(err.message || "Failed to load linked laboratory investigations.");
    } finally {
      setLoadingLabTests(false);
    }
  };

  useEffect(() => {
    loadAppointments();
    const interval = setInterval(loadAppointments, 15000);
    return () => clearInterval(interval);
  }, [loadAppointments]);

  // Filter Upcoming vs Past History
  const upcomingAppointments = useMemo(() => {
    return appointments.filter(
      (a) => a.status === "PENDING" || a.status === "CONFIRMED" || a.status === "IN_WAITING" || a.status === "IN_PROGRESS"
    );
  }, [appointments]);

  const historyAppointments = useMemo(() => {
    return appointments.filter(
      (a) => a.status === "COMPLETED" || a.status === "CANCELLED" || a.status === "REJECTED"
    );
  }, [appointments]);

  const displayedAppointments = activeTab === "upcoming" ? upcomingAppointments : historyAppointments;

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedAppointments,
    resetPage,
  } = usePagination(displayedAppointments, 25);

  useEffect(() => {
    resetPage();
  }, [activeTab, resetPage]);

  // Occupied slots for rescheduling collision prevention
  const occupiedSlots = useMemo(() => {
    if (!reschedulingApt || !rescheduleDate) return [];
    return appointments
      .filter(
        (a) =>
          a.id !== reschedulingApt.id &&
          a.doctor_id === reschedulingApt.doctor_id &&
          a.appointment_date === rescheduleDate &&
          a.status !== "CANCELLED"
      )
      .map((a) => a.appointment_time);
  }, [reschedulingApt, rescheduleDate, appointments]);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0];
  }, []);

  async function handleRescheduleSubmit(e) {
    e.preventDefault();
    setRescheduleError("");

    const check = canReschedule(reschedulingApt);
    if (!check.allowed) {
      setRescheduleError(check.reason || "Appointment cannot be rescheduled.");
      return;
    }

    const dateVal = validateBookingDate(rescheduleDate);
    if (!dateVal.valid) {
      setRescheduleError(dateVal.message);
      return;
    }
    if (!rescheduleTime) {
      setRescheduleError("Please select an available time slot.");
      return;
    }

    setRescheduleSaving(true);
    try {
      if (token && Number.isSafeInteger(Number(reschedulingApt.id))) {
        await rescheduleAppointment(token, reschedulingApt.id, {
          appointment_date: rescheduleDate,
          appointment_time: rescheduleTime,
          reason: "Rescheduled by patient via portal",
        });
      }
      patientStore.rescheduleAppointment(reschedulingApt.id, rescheduleDate, rescheduleTime);
      setActionNotice(`Appointment successfully rescheduled to ${rescheduleDate} at ${rescheduleTime}.`);
      setReschedulingApt(null);
      await loadAppointments();
    } catch (err) {
      setRescheduleError(err.message || "Failed to reschedule appointment.");
    } finally {
      setRescheduleSaving(false);
    }
  }

  async function handleCancelSubmit(e) {
    e.preventDefault();
    setCancelSaving(true);
    try {
      if (token && Number.isSafeInteger(Number(cancellingApt.id))) {
        await cancelPatientAppointment(token, cancellingApt.id, cancelReason || "Cancelled by patient via portal");
      }
      patientStore.cancelAppointment(cancellingApt.id, cancelReason || "Cancelled by patient via portal");
      setActionNotice("Appointment has been cancelled.");
      setCancellingApt(null);
      await loadAppointments();
    } catch (err) {
      setActionNotice(`Error: ${err.message}`);
    } finally {
      setCancelSaving(false);
    }
  }

  return (
    <div className="w-full space-y-5 font-sans">
      {/* Top Header & New Booking CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900">
            Appointments &amp; Clinical Visits
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your hospital consultations, live arrival telemetry, and booking lifecycle
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenBooking}
          className="ent-btn-primary text-xs self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Book New Appointment</span>
        </button>
      </div>

      {actionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
          <span>{actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* View Tabs: Upcoming vs History */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "upcoming"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Upcoming Appointments</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 font-bold">
            {upcomingAppointments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "history"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Past History</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {historyAppointments.length}
          </span>
        </button>
      </div>

      {/* Appointment Cards List */}
      <div className="grid grid-cols-1 gap-4">
        {displayedAppointments.length === 0 ? (
          <div className="ent-card p-12 text-center text-xs text-slate-500">
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-slate-700">No {activeTab} appointments found</p>
            <p className="mt-1 text-slate-400">
              {activeTab === "upcoming"
                ? "Schedule an in-person or online consultation with an accredited physician."
                : "Your completed and past consultations will appear here."}
            </p>
          </div>
        ) : (
          paginatedAppointments.map((apt) => {
            const countdown = apt.status === "PENDING" ? getPendingCountdown(apt.created_at) : null;
            const rescheduleRule = canReschedule(apt, countdown);
            const cancelRule = canCancel(apt, countdown);
            const isDropdownOpen = openDropdownId === apt.id;

            return (
              <div
                key={apt.id}
                className="ent-card p-5 transition hover:border-slate-300 relative"
              >
                {/* Status Banners for Real-Time Lifecycle */}
                {apt.status === "PENDING" && (
                  <div className={`mb-3.5 p-2.5 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
                    countdown?.expired
                      ? "bg-rose-50 border-rose-200 text-rose-900"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}>
                    <div className="flex items-center space-x-2">
                      <span className={`w-2 h-2 rounded-full ${countdown?.expired ? "bg-rose-500" : "bg-amber-500 animate-pulse"}`}></span>
                      <span>
                        {countdown?.expired ? (
                          <strong>Appointment Request Expired:</strong>
                        ) : (
                          <strong>Awaiting Doctor Confirmation:</strong>
                        )}{" "}
                        {countdown?.expired
                          ? "The 4-hour review window has passed. Rescheduling is locked; please schedule a new appointment."
                          : "Automatically cancels if not confirmed within 4 hours."}
                      </span>
                    </div>
                    <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border self-start sm:self-auto ${
                      countdown?.expired
                        ? "text-rose-800 bg-rose-100/90 border-rose-300"
                        : "text-amber-800 bg-amber-100/80 border-amber-300/60"
                    }`}>
                      {countdown?.expired ? "Expires in: Expired" : `Expires in: ${countdown?.text || "Checking..."}`}
                    </span>
                  </div>
                )}

                {apt.status === "CONFIRMED" && (
                  <div className="mb-3.5 p-2.5 rounded bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-center space-x-2">
                    <svg className="w-4 h-4 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>Important Arrival Notice:</strong> Please arrive at least <strong>30 minutes before</strong> your scheduled appointment time to complete vital check-in at reception desk.
                    </span>
                  </div>
                )}

                {apt.status === "IN_WAITING" && (
                  <div className="mb-3.5 p-2.5 rounded bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse"></span>
                    <span>
                      <strong>Checked In:</strong> Patient arrived at hospital. Waiting in reception hall for physician room call.
                    </span>
                  </div>
                )}

                {apt.status === "IN_PROGRESS" && (
                  <div className="mb-3.5 p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                    <span>
                      <strong>Consultation In Progress:</strong> Active in doctor cabin.
                    </span>
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Doctor & Facility Info */}
                  <div className="flex items-start space-x-3.5">
                    <img
                      src={apt.doctor_avatar}
                      alt={apt.doctor_name}
                      className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-xs text-slate-900">
                          {apt.doctor_name}
                        </h3>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {apt.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">
                        {apt.doctor_designation} &bull; {apt.department_name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {apt.hospital_name} &bull; <span className="text-slate-700">{apt.doctor_room}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 pt-1 line-clamp-1">
                        <strong>Reason:</strong> {apt.reason}
                      </p>
                    </div>
                  </div>

                  {/* Scheduled Slot & Action Controls */}
                  <div className="flex items-center justify-between md:justify-end space-x-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <div className="text-left md:text-right">
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {apt.appointment_date}
                      </div>
                      <div className="font-mono text-xs text-sky-700 font-semibold">
                        {apt.appointment_time}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                        {apt.appointment_type}
                      </span>
                    </div>

                    {/* Actions Menu Dropdown */}
                    <div className="relative">
                      {/* Hide Cancel & Reschedule entirely if IN_PROGRESS or COMPLETED */}
                      {apt.status === "IN_PROGRESS" || apt.status === "COMPLETED" ? (
                        <span className="ent-chip-active">
                          {apt.status === "IN_PROGRESS" ? "In Cabin" : "Completed"}
                        </span>
                      ) : apt.status === "CANCELLED" ? (
                        <span className="ent-chip-danger">Cancelled</span>
                      ) : (
                        <div>
                          <button
                            type="button"
                            onClick={() => setOpenDropdownId(isDropdownOpen ? null : apt.id)}
                            className="ent-btn-secondary text-xs flex items-center space-x-1"
                          >
                            <span>Manage</span>
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Action Menu Dropdown */}
                          {isDropdownOpen && (
                            <div className="absolute right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-slate-200 py-1.5 z-20 animate-in fade-in duration-100">
                              {/* Reschedule Action (Subject to Strict 10-hour Rule & Expiration Check) */}
                              <button
                                type="button"
                                disabled={!rescheduleRule.allowed}
                                onClick={() => {
                                  if (!rescheduleRule.allowed) return;
                                  setOpenDropdownId(null);
                                  setReschedulingApt(apt);
                                  setRescheduleDate(apt.appointment_date);
                                  setRescheduleTime("");
                                  setRescheduleError("");
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-start space-x-2 transition ${
                                  rescheduleRule.allowed
                                    ? "hover:bg-slate-50 text-slate-700 cursor-pointer"
                                    : "opacity-60 text-slate-400 cursor-not-allowed bg-slate-50/80"
                                }`}
                                title={!rescheduleRule.allowed ? rescheduleRule.reason : "Reschedule to another date/slot"}
                              >
                                <svg className={`w-4 h-4 shrink-0 mt-0.5 ${rescheduleRule.allowed ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium block">Reschedule Slot</span>
                                    {!rescheduleRule.allowed && (
                                      <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                                        Locked
                                      </span>
                                    )}
                                  </div>
                                  {!rescheduleRule.allowed && (
                                    <span className="text-[10px] text-rose-600 block mt-0.5 leading-tight font-medium">
                                      {rescheduleRule.reason}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* Cancel Action (Subject to Strict 4-hour Rule & Expiration Check) */}
                              <button
                                type="button"
                                disabled={!cancelRule.allowed}
                                onClick={() => {
                                  if (!cancelRule.allowed) return;
                                  setOpenDropdownId(null);
                                  setCancellingApt(apt);
                                  setCancelReason("");
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-start space-x-2 transition ${
                                  cancelRule.allowed
                                    ? "hover:bg-rose-50 text-rose-700 cursor-pointer"
                                    : "opacity-60 text-slate-400 cursor-not-allowed bg-slate-50/80"
                                }`}
                                title={!cancelRule.allowed ? cancelRule.reason : "Cancel this appointment"}
                              >
                                <svg className={`w-4 h-4 shrink-0 mt-0.5 ${cancelRule.allowed ? "text-rose-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium block">Cancel Appointment</span>
                                    {!cancelRule.allowed && (
                                      <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                                        Locked
                                      </span>
                                    )}
                                  </div>
                                  {!cancelRule.allowed && (
                                    <span className="text-[10px] text-rose-600 block mt-0.5 leading-tight font-medium">
                                      {cancelRule.reason}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* View Lab Tests (Lesson 11.5) */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  handleOpenLabTests(apt);
                                }}
                                className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 hover:bg-sky-50 text-sky-800 transition cursor-pointer border-t border-slate-100"
                              >
                                <svg className="w-4 h-4 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                <span className="font-medium">Laboratory Tests</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* ================= RESCHEDULE MODAL ================= */}
      {reschedulingApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Reschedule Appointment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dr. {reschedulingApt.doctor_name} &bull; {reschedulingApt.hospital_name}
                </p>
              </div>
              <button
                onClick={() => setReschedulingApt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {rescheduleError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                {rescheduleError}
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Select New Date (Strict 3-Month Window) *
                </label>
                <input
                  type="date"
                  min={todayStr}
                  max={maxDateStr}
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleTime("");
                  }}
                  required
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Available Slots on {rescheduleDate} *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_TIME_SLOTS.map((slot) => {
                    const isOccupied = occupiedSlots.includes(slot);
                    const isSelected = rescheduleTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => setRescheduleTime(slot)}
                        className={`py-1.5 px-2 text-xs rounded border font-mono ${
                          isOccupied
                            ? "bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed"
                            : isSelected
                            ? "bg-sky-600 text-white border-sky-600 font-bold"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50"
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setReschedulingApt(null)}
                  className="ent-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleSaving || !rescheduleTime}
                  className="ent-btn-primary text-xs"
                >
                  {rescheduleSaving ? "Confirming..." : "Save Rescheduled Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= CANCELLATION REASON MODAL ================= */}
      {cancellingApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                Cancel Appointment Confirmation
              </h3>
              <button
                onClick={() => setCancellingApt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you wish to cancel your scheduled appointment with <strong>{cancellingApt.doctor_name}</strong> on <strong>{cancellingApt.appointment_date} at {cancellingApt.appointment_time}</strong>?
            </p>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  rows="3"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Optional note: Schedule conflict, symptom resolution, etc."
                  className="ent-input text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCancellingApt(null)}
                  className="ent-btn-secondary text-xs"
                >
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  disabled={cancelSaving}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium shadow-xs"
                >
                  {cancelSaving ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Linked Laboratory Investigations Modal (Lesson 11.5) */}
      {viewingLabApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-xl w-full p-5 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Laboratory Investigations
                </h3>
                <p className="text-xs text-slate-500">
                  Appointment #{viewingLabApt.appointment_number} • {viewingLabApt.doctor_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingLabApt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {loadingLabTests ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Loading linked laboratory investigations...
              </div>
            ) : labTestsError ? (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                {labTestsError}
              </div>
            ) : appointmentLabTests.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No laboratory investigations have been ordered for this appointment.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Test Details</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Rate (₹)</th>
                        <th className="py-2.5 px-3">Payment</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Report Access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {appointmentLabTests.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{t.test_name}</div>
                            {t.order_number && (
                              <div className="font-mono text-[10px] text-slate-400">{t.order_number}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{t.test_category}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            ₹{parseFloat(t.price || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3">
                            {t.payment_status === "paid" && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Paid
                              </span>
                            )}
                            {t.payment_status === "waived" && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                Waived
                              </span>
                            )}
                            {t.payment_status === "unpaid" && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Unpaid
                              </span>
                            )}
                            {t.payment_status === "refunded" && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                Refunded
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="capitalize text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {t.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {t.reports && t.reports.length > 0 ? (
                              t.is_locked ? (
                                <span
                                  className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 cursor-not-allowed"
                                  title={`Locked: Please pay ₹${parseFloat(t.price || 0).toFixed(2)} at the counter to unlock your report.`}
                                >
                                  🔒 Locked (Due)
                                </span>
                              ) : (
                                <div className="inline-flex items-center space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => viewLabReport(token, t.reports[0].id)}
                                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadLabReport(token, t.reports[0].id, t.reports[0].original_filename)}
                                    className="px-2 py-0.5 text-[11px] font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded cursor-pointer"
                                  >
                                    Download
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">
                                {t.status === "completed" ? "Finalizing" : "Pending"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                  <span className="text-slate-600">Total Tests: <strong>{appointmentLabTests.length}</strong></span>
                  <span className="font-mono font-bold text-slate-900">
                    Total: ₹{appointmentLabTests.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingLabApt(null)}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded border border-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
