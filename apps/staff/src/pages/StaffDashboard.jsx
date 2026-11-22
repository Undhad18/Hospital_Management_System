import { useState, useEffect, useCallback } from "react";
import {
  registerPatientByStaff,
  getStaffLiveQueue,
  checkInAppointment,
  getStaffAppointments,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";
import CustomDropdown from "../components/CustomDropdown";

export default function StaffDashboard({ session }) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    dob: "",
    gender: "Male",
    blood_group: "O+",
    address_line1: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(null);
  const [regError, setRegError] = useState("");

  // Live Queue & Today's Appointments (Lesson 6.12)
  const [liveQueue, setLiveQueue] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [checkInSearch, setCheckInSearch] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(null);
  const [checkInError, setCheckInError] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  const fetchLiveQueueData = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [queueData, aptsData] = await Promise.all([
        getStaffLiveQueue(session.token, { date: todayStr }).catch(() => null),
        getStaffAppointments(session.token, { date: todayStr }).catch(() => null),
      ]);

      if (queueData) {
        const queueList = Array.isArray(queueData.queue)
          ? queueData.queue
          : Array.isArray(queueData.data?.queue)
          ? queueData.data.queue
          : Array.isArray(queueData)
          ? queueData
          : [];
        setLiveQueue(queueList);
      }
      if (Array.isArray(aptsData)) {
        setTodayAppointments(aptsData);
      }
    } catch (err) {
      console.warn("Could not fetch live queue:", err.message);
    } finally {
      setQueueLoading(false);
    }
  }, [session, todayStr]);

  useEffect(() => {
    fetchLiveQueueData();
    const interval = setInterval(fetchLiveQueueData, 30000); // Backstop polling
    return () => clearInterval(interval);
  }, [fetchLiveQueueData]);

  // Real-time synchronization for live queue & appointments
  useEffect(() => {
    if (!session?.token) return;

    const unsub = subscribeToEvent("appointments:updated", () => {
      fetchLiveQueueData();
    }, session.token);

    return () => {
      unsub();
    };
  }, [session?.token, fetchLiveQueueData]);

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setRegLoading(true);
    setRegError("");
    setRegSuccess(null);

    try {
      const result = await registerPatientByStaff(session.token, regForm);
      setRegSuccess(result);
    } catch (err) {
      setRegError(err.message || "Failed to register patient");
    } finally {
      setRegLoading(false);
    }
  }

  async function handleConfirmCheckIn(appointmentId) {
    const idToUse = appointmentId || selectedAppointmentId;
    if (!idToUse) {
      setCheckInError("Please select or enter an appointment to check in.");
      return;
    }

    setCheckInLoading(true);
    setCheckInError("");
    setCheckInSuccess(null);

    try {
      const result = await checkInAppointment(session.token, idToUse);
      setCheckInSuccess(result);
      await fetchLiveQueueData();
    } catch (err) {
      setCheckInError(err.message || "Failed to check in appointment.");
    } finally {
      setCheckInLoading(false);
    }
  }

  // Display queue items directly loaded from MySQL database
  const displayedQueue = liveQueue;

  // Real confirmed appointments scheduled for today awaiting check-in
  const eligibleForCheckIn = todayAppointments.filter(
    (a) => a.status === "confirmed" || a.status === "pending"
  );

  const filteredEligible = eligibleForCheckIn.filter((a) => {
    if (!checkInSearch) return true;
    const q = checkInSearch.toLowerCase();
    return (
      (a.patient_name || "").toLowerCase().includes(q) ||
      (a.appointment_number || "").toLowerCase().includes(q) ||
      String(a.id).includes(q)
    );
  });

  return (
    <div className="w-full space-y-5 font-sans">
      {/* ======================= COMPACT KPI TILES ======================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <div className="ent-kpi">
          <p className="ent-kpi-title">Today's Check-ins (Lesson 6.12)</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">{displayedQueue.length}</span>
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              {displayedQueue.filter((q) => q.status === "in_waiting").length} in Hall
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Front desk outpatient intake</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Pending Arrivals</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-sky-700">{eligibleForCheckIn.length}</span>
            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              Today's OPD
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Confirmed appointments awaiting check-in</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">In Consultation</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-emerald-700">
              {displayedQueue.filter((q) => q.status === "in_progress").length}
            </span>
            <span className="ent-chip-active text-[10px]">With Doctor</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Active doctor rooms</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Operational Desk</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold text-slate-900 truncate">Desk #02</span>
            <span className="ent-chip-active text-[10px]">Online</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Operator: {session?.user?.fullName || "Staff Member"}</p>
        </div>
      </div>

      {/* ======================= RECEPTION PATIENT TOKEN QUEUE ======================= */}
      <div className="ent-card overflow-hidden">
        <div className="ent-card-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Front Desk Reception &amp; Token Dispatch Queue (Lesson 6.12)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live tracking of patient arrivals, sequential token numbers (Q-001...), and clinical queues
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shadow-xs transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Register Walk-in Patient</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCheckInModal(true);
                setCheckInSuccess(null);
                setCheckInError("");
                setSelectedAppointmentId("");
              }}
              className="ent-btn-primary cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Check In Patient (Token)</span>
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="ent-table">
            <thead>
              <tr>
                <th>Token #</th>
                <th>Patient Details</th>
                <th>Department</th>
                <th>Consulting Physician</th>
                <th>Check-in Time</th>
                <th>Queue Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedQueue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500 text-xs">
                    No patients currently checked in for today's queue.
                  </td>
                </tr>
              ) : (
                displayedQueue.map((item) => (
                <tr key={item.id} className={item.status === "in_progress" ? "bg-sky-50/40" : ""}>
                  <td>
                    <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {item.queue_number || item.tokenNumber || "Q-001"}
                    </span>
                  </td>

                  <td>
                    <div className="font-semibold text-slate-900">
                      {item.patient_name || item.patient}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {item.appointment_number || item.id}
                    </div>
                  </td>

                  <td className="font-medium text-slate-800">
                    {item.department_name || item.department || "General"}
                  </td>

                  <td>
                    <span className="text-xs font-medium text-teal-800">
                      {item.doctor_name || item.doctor}
                    </span>
                  </td>

                  <td className="font-mono text-xs text-slate-600">
                    {item.check_in_time || item.checkInTime || "--"}
                  </td>

                  <td>
                    {item.status === "in_progress" && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse"></span>
                        With Doctor
                      </span>
                    )}
                    {(item.status === "in_waiting" || item.status === "Waiting") && (
                      <span className="ent-chip-pending">
                        Waiting in Hall
                      </span>
                    )}
                    {item.status === "completed" && (
                      <span className="ent-chip-active">
                        Completed
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* ======================= CHECK IN PATIENT MODAL (LESSON 6.12) ======================= */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Patient Arrival Check-in &amp; Token Dispatch (Lesson 6.12)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm arrival for today's appointment. System generates sequential queue number (Q-001...).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCheckInModal(false);
                  setCheckInSuccess(null);
                  setCheckInError("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {checkInSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">✓</span>
                    <span className="font-bold text-sm">Patient Checked In Successfully!</span>
                  </div>
                  <div className="p-3 bg-white rounded border border-emerald-300 font-mono text-center">
                    <span className="text-xs text-slate-500 block">Assigned Queue Token:</span>
                    <span className="text-2xl font-black text-emerald-700">
                      {checkInSuccess.data?.queue_number || "Q-001"}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Check-in Time: {checkInSuccess.data?.check_in_time}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowCheckInModal(false);
                      setCheckInSuccess(null);
                    }}
                    className="w-full mt-2 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium"
                  >
                    Done
                  </button>
                </div>
              )}

              {checkInError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
                  {checkInError}
                </div>
              )}

              {!checkInSuccess && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Search Today's Confirmed Appointments
                    </label>
                    <input
                      type="text"
                      placeholder="Search by patient name or APT-20261026-XXXX..."
                      value={checkInSearch}
                      onChange={(e) => setCheckInSearch(e.target.value)}
                      className="ent-input text-xs"
                    />
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {filteredEligible.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200">
                        No pending/confirmed appointments found for today matching query.
                      </div>
                    ) : (
                      filteredEligible.map((apt) => (
                        <div
                          key={apt.id}
                          onClick={() => setSelectedAppointmentId(apt.id)}
                          className={`p-3 rounded border text-xs cursor-pointer transition flex items-center justify-between ${
                            selectedAppointmentId === apt.id
                              ? "bg-sky-50 border-sky-400 ring-1 ring-sky-300"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {apt.patient_name || "Patient"}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {apt.appointment_number} &bull; {apt.appointment_time || apt.start_time}
                            </div>
                            <div className="text-[11px] text-teal-700 mt-0.5">
                              Dr. {apt.doctor_name} ({apt.department_name})
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={checkInLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirmCheckIn(apt.id);
                            }}
                            className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-medium transition cursor-pointer"
                          >
                            Check In
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================= REGISTER WALK-IN PATIENT MODAL ======================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Register Walk-in Patient (Front Desk)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Facility-scoped patient creation with immediate in-person verification
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRegisterModal(false);
                  setRegSuccess(null);
                  setRegError("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {regError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
                  {regError}
                </div>
              )}

              {regSuccess ? (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs">
                    <p className="font-semibold text-sm">Patient Account Created!</p>
                    <p className="mt-1">{regSuccess.message}</p>
                    {regSuccess.data?.temporary_password && (
                      <div className="mt-2 p-2 bg-white rounded border border-emerald-300 font-mono text-xs">
                        <span>Temporary Access Password: </span>
                        <strong>{regSuccess.data.temporary_password}</strong>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegisterModal(false);
                      setRegSuccess(null);
                      setRegForm({
                        full_name: "",
                        email: "",
                        phone: "",
                        dob: "",
                        gender: "Male",
                        blood_group: "O+",
                        address_line1: "",
                        emergency_contact_name: "",
                        emergency_contact_phone: "",
                      });
                    }}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-medium"
                  >
                    Close &amp; Return to Queue
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={regForm.full_name}
                        onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                        className="ent-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={regForm.email}
                        onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                        className="ent-input text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone *
                      </label>
                      <input
                        type="tel"
                        required
                        value={regForm.phone}
                        onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                        className="ent-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date of Birth *
                      </label>
                      <input
                        type="date"
                        required
                        value={regForm.dob}
                        onChange={(e) => setRegForm({ ...regForm, dob: e.target.value })}
                        className="ent-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Gender
                      </label>
                      <CustomDropdown
                        value={regForm.gender}
                        onChange={(val) => setRegForm({ ...regForm, gender: val })}
                        options={[
                          { value: "Male", label: "Male" },
                          { value: "Female", label: "Female" },
                          { value: "Other", label: "Other" },
                        ]}
                        placeholder="Select Gender"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRegisterModal(false)}
                      className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={regLoading}
                      className="ent-btn-primary"
                    >
                      {regLoading ? "Registering..." : "Complete Registration"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
