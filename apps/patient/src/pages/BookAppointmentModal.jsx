import { useState, useMemo, useEffect } from "react";
import {
  HOSPITALS,
  DEPARTMENTS,
  DOCTORS,
  AVAILABLE_TIME_SLOTS,
  validateBookingDate,
  patientStore,
} from "../services/patientData";

import {
  bookPatientAppointment,
  getAppointmentHospitals,
  getAppointmentDepartments,
  getAppointmentDoctors,
  validateAppointmentSelection,
  getDoctorAvailableSlots,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

function getAuthToken() {
  try {
    const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
    return raw ? JSON.parse(raw)?.token : null;
  } catch {
    return null;
  }
}

function formatWorkingHours(wh) {
  if (!wh) return "Regular Clinical Hours";
  if (typeof wh === "string") {
    try {
      const parsed = JSON.parse(wh);
      if (parsed && typeof parsed === "object") {
        if (parsed.is_24_7) return "Open 24/7 (Emergency & IPD)";
        if (parsed.regular_hours) return String(parsed.regular_hours);
      }
      return wh;
    } catch {
      return wh;
    }
  }
  if (typeof wh === "object") {
    if (wh.is_24_7) return "Open 24/7 (Emergency & IPD)";
    if (wh.regular_hours) return String(wh.regular_hours);
    return "Regular Clinical Hours";
  }
  return String(wh);
}

export default function BookAppointmentModal({ isOpen, onClose, onBookingSuccess }) {
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("Visit Hospital");
  const [appointmentReason, setAppointmentReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI"); // 'UPI' | 'CASH'

  // Live Backend Data
  const [liveHospitals, setLiveHospitals] = useState(null);
  const [liveDepartments, setLiveDepartments] = useState(null);
  const [liveDoctors, setLiveDoctors] = useState(null);
  const [liveSlots, setLiveSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState("");
  const [selectionError, setSelectionError] = useState("");

  // Search & Filter States
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [dateError, setDateError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [upiProcessing, setUpiProcessing] = useState(false);

  // Fetch Hospitals on open
  useEffect(() => {
    if (!isOpen) return;
    const token = getAuthToken();
    if (!token) return;

    getAppointmentHospitals(token)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLiveHospitals(data);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Fetch Departments when hospital is selected
  useEffect(() => {
    if (!selectedHospital) {
      setLiveDepartments(null);
      return;
    }
    const token = getAuthToken();
    if (!token) return;

    getAppointmentDepartments(token, selectedHospital.id)
      .then((data) => {
        if (Array.isArray(data)) {
          setLiveDepartments(data);
        }
      })
      .catch(() => {});
  }, [selectedHospital]);

  // Fetch Doctors when department is selected
  useEffect(() => {
    if (!selectedHospital || !selectedDepartment) {
      setLiveDoctors(null);
      return;
    }
    const token = getAuthToken();
    if (!token) return;

    getAppointmentDoctors(token, selectedHospital.id, selectedDepartment.id)
      .then((data) => {
        if (Array.isArray(data)) {
          setLiveDoctors(data);
        }
      })
      .catch(() => {});
  }, [selectedHospital, selectedDepartment]);

  // Fetch dynamic slots from backend for selected doctor and date (Lesson 6.2)
  useEffect(() => {
    if (!selectedDoctor?.id || !selectedDate || dateError) {
      setLiveSlots(null);
      setSlotsMessage("");
      return;
    }
    const token = getAuthToken();
    const isNumericDoctorId = Number.isInteger(Number(selectedDoctor.id));

    // If no token or mock string doctor ID, use fallback slots directly
    if (!token || !isNumericDoctorId) {
      setLiveSlots(null);
      setSlotsMessage("");
      return;
    }

    setSlotsLoading(true);
    setSlotsMessage("");
    getDoctorAvailableSlots(token, Number(selectedDoctor.id), selectedDate)
      .then((res) => {
        // If expired token / auth error, fall back to default slots so user is not blocked
        if (
          !res ||
          (!res.success &&
            (res.message?.toLowerCase().includes("token") ||
             res.message?.toLowerCase().includes("unauthorized") ||
             res.message?.toLowerCase().includes("jwt")))
        ) {
          setLiveSlots(null);
          setSlotsMessage("");
          return;
        }

        if (res && res.success && res.data) {
          setLiveSlots(res.data.available_slots || []);
          setSlotsMessage(res.message || "");
        } else if (res && !res.success) {
          setLiveSlots([]);
          setSlotsMessage(res.message || "No slots available on this date.");
        }
      })
      .catch(() => {
        setLiveSlots(null);
        setSlotsMessage("");
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctor, selectedDate, dateError]);

  // Computed Date Bounds: Min = Today, Max = 90 days in future
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0];
  }, []);

  // Filtered Hospitals (Live first, fallback to mock)
  const availableHospitals = liveHospitals || HOSPITALS;

  // Dynamic city options from actual hospital data
  const cityOptions = useMemo(() => {
    const rawCities = availableHospitals
      .map((h) => h.city || h.city_name)
      .filter((c) => Boolean(c) && typeof c === "string" && c.trim().length > 0);
    const uniqueCities = Array.from(new Set(rawCities.map((c) => c.trim()))).sort();
    return [
      { value: "all", label: "All Cities" },
      ...uniqueCities.map((c) => ({ value: c, label: c })),
    ];
  }, [availableHospitals]);

  const filteredHospitals = useMemo(() => {
    return availableHospitals.filter((h) => {
      const hCity = (h.city || h.city_name || "").trim().toLowerCase();
      const targetCity = cityFilter.trim().toLowerCase();
      const matchesSearch =
        h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
        hCity.includes(hospitalSearch.toLowerCase()) ||
        (h.address && h.address.toLowerCase().includes(hospitalSearch.toLowerCase()));
      const matchesCity = cityFilter === "all" || hCity === targetCity;
      return matchesSearch && matchesCity;
    });
  }, [availableHospitals, hospitalSearch, cityFilter]);

  // Dynamic Departments for Selected Hospital
  const hospitalDepartments = useMemo(() => {
    if (!selectedHospital) return [];
    if (liveDepartments !== null) return liveDepartments;
    return DEPARTMENTS.filter((d) => d.hospital_id === selectedHospital.id);
  }, [selectedHospital, liveDepartments]);

  // Doctors for Selected Department
  const departmentDoctors = useMemo(() => {
    if (!selectedHospital || !selectedDepartment) return [];
    if (liveDoctors !== null) return liveDoctors;
    return DOCTORS.filter(
      (doc) =>
        doc.hospital_id === selectedHospital.id &&
        doc.department_id === selectedDepartment.id
    );
  }, [selectedHospital, selectedDepartment, liveDoctors]);

  // Booked slots for the selected doctor on the selected date to detect collisions
  const occupiedSlots = useMemo(() => {
    if (!selectedDoctor || !selectedDate) return [];
    const appointments = patientStore.getAppointments();
    return appointments
      .filter(
        (a) =>
          a.doctor_id === selectedDoctor.id &&
          a.appointment_date === selectedDate &&
          a.status !== "CANCELLED"
      )
      .map((a) => a.appointment_time);
  }, [selectedDoctor, selectedDate]);

  function handleDateChange(e) {
    const val = e.target.value;
    setSelectedDate(val);
    setSelectedTime("");
    const validation = validateBookingDate(val);
    if (!validation.valid) {
      setDateError(validation.message);
    } else {
      setDateError("");
    }
  }

  async function handleNextStep() {
    if (currentStep === 1 && !selectedHospital) return;
    if (currentStep === 2 && !selectedDepartment) return;
    if (currentStep === 3) {
      if (!selectedDoctor) return;
      const token = getAuthToken();
      const isNumeric =
        Number.isInteger(Number(selectedHospital?.id)) &&
        Number.isInteger(Number(selectedDepartment?.id)) &&
        Number.isInteger(Number(selectedDoctor?.id));

      if (token && isNumeric) {
        try {
          await validateAppointmentSelection(token, {
            hospital_id: Number(selectedHospital.id),
            department_id: Number(selectedDepartment.id),
            doctor_id: Number(selectedDoctor.id),
          });
          setSelectionError("");
        } catch (err) {
          const isAuthError =
            err.status === 401 ||
            err.message?.toLowerCase().includes("token") ||
            err.message?.toLowerCase().includes("unauthorized") ||
            err.message?.toLowerCase().includes("jwt");

          if (!isAuthError) {
            setSelectionError(err.message || "Selected doctor does not belong to this hospital and department.");
            return;
          }
          // If token is invalid or expired, clear selection error and allow moving forward
          setSelectionError("");
        }
      }
    }
    if (currentStep === 4) {
      if (!selectedDate || dateError || !selectedTime) return;
    }
    if (currentStep === 6 && !appointmentReason.trim()) return;

    setCurrentStep((prev) => prev + 1);
  }

  function handlePrevStep() {
    setSelectionError("");
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }

  async function handleFinalSubmit() {
    setSubmitting(true);

    if (paymentMethod === "UPI") {
      setUpiProcessing(true);
      await new Promise((r) => setTimeout(r, 1200));
      setUpiProcessing(false);
    }

    const appointmentPayload = {
      hospital_id: selectedHospital.id,
      hospital_name: selectedHospital.name,
      department_id: selectedDepartment.id,
      department_name: selectedDepartment.name,
      doctor_id: selectedDoctor.id,
      doctor_name: selectedDoctor.name,
      doctor_designation: selectedDoctor.designation,
      doctor_room: selectedDoctor.room,
      doctor_avatar: selectedDoctor.avatar,
      appointment_date: selectedDate,
      appointment_time: selectedTime,
      appointment_type: appointmentType,
      reason: appointmentReason.trim(),
      payment_method: paymentMethod,
      consultation_fee: selectedDoctor.consultation_fee,
    };

    const token = (() => {
      try {
        const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
        return raw ? JSON.parse(raw)?.token : null;
      } catch {
        return null;
      }
    })();

    if (token) {
      try {
        const res = await bookPatientAppointment(token, {
          hospital_id: selectedHospital.id,
          department_id: selectedDepartment.id,
          doctor_id: selectedDoctor.id,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
          appointment_type: "consultation",
          appointment_mode: appointmentType === "Online Consultation" ? "video_consultation" : "in_person",
          reason: appointmentReason.trim(),
          payment_method: paymentMethod.toLowerCase(),
          consultation_fee: selectedDoctor.consultation_fee,
        });
        if (res?.data) {
          appointmentPayload.id = res.data.id;
          appointmentPayload.appointment_number = res.data.appointment_number;
        }
      } catch (err) {
        console.warn("Backend booking API notice:", err.message);
      }
    }

    const created = patientStore.createAppointment(appointmentPayload);
    setSubmitting(false);
    onBookingSuccess(created);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-sky-600"></span>
              <h2 className="text-sm font-bold text-slate-900">
                Book Clinical Appointment
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Step {currentStep} of 7 &bull; {
                currentStep === 1 ? "Select Hospital" :
                currentStep === 2 ? "Select Clinical Department" :
                currentStep === 3 ? "Select Attending Physician" :
                currentStep === 4 ? "Select Date & Time Slot" :
                currentStep === 5 ? "Appointment Consultation Mode" :
                currentStep === 6 ? "Symptoms & Medical Reason" :
                "Payment Method & Confirmation"
              }
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded hover:bg-slate-200/60 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Step Progression Bar */}
        <div className="w-full bg-slate-100 h-1 flex shrink-0">
          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
            <div
              key={step}
              className={`flex-1 transition-all duration-200 ${
                step <= currentStep ? "bg-sky-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Modal Content Area */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* ================= STEP 1: HOSPITAL SELECTION ================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    placeholder="Search hospitals by name, city, or address..."
                    className="ent-input pl-8 text-xs"
                  />
                  <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <div className="w-40 shrink-0">
                  <CustomDropdown
                    value={cityFilter}
                    onChange={(val) => setCityFilter(val)}
                    options={cityOptions}
                    placeholder="All Cities"
                  />
                </div>
              </div>

              {filteredHospitals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800">No Hospitals Found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {cityFilter && cityFilter !== "all"
                      ? `No hospital facilities currently available in "${cityFilter}". Try selecting "All Cities" or clearing the search keyword.`
                      : "No active healthcare facilities match your current search query."}
                  </p>
                  {(hospitalSearch || (cityFilter && cityFilter !== "all")) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHospitalSearch("");
                        setCityFilter("all");
                      }}
                      className="mt-3 text-xs font-semibold text-sky-600 hover:text-sky-700 underline cursor-pointer"
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredHospitals.map((hosp) => {
                    const isSelected = selectedHospital?.id === hosp.id;
                    return (
                      <div
                        key={hosp.id}
                        onClick={() => {
                          setSelectedHospital(hosp);
                          setSelectedDepartment(null);
                          setSelectedDoctor(null);
                          setSelectionError("");
                        }}
                        className={`p-4 rounded-md border cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isSelected
                            ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-xs text-slate-900">
                              {hosp.name}
                            </h4>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {hosp.code}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-snug">
                            {hosp.address}
                          </p>
                          <div className="flex items-center space-x-3 text-[11px] text-slate-500 pt-1">
                            <span>{hosp.city || hosp.city_name || "General Facility"}, {hosp.state || hosp.state_name || ""}</span>
                            <span>&bull;</span>
                            <span className="text-emerald-700 font-medium">{formatWorkingHours(hosp.working_hours)}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <button
                            type="button"
                            className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                              isSelected
                                ? "bg-sky-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {isSelected ? "Selected ✓" : "Select Hospital"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 2: DEPARTMENT SELECTION ================= */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>Facility: <strong>{selectedHospital?.name}</strong></span>
                <span className="text-sky-700 font-medium">({hospitalDepartments.length} Departments Available)</span>
              </div>

              {hospitalDepartments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-xs text-slate-500">No clinical departments currently available for this facility.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hospitalDepartments.map((dept) => {
                    const isSelected = selectedDepartment?.id === dept.id;
                    return (
                      <div
                        key={dept.id}
                        onClick={() => {
                          setSelectedDepartment(dept);
                          setSelectedDoctor(null);
                          setSelectionError("");
                        }}
                        className={`p-4 rounded-md border cursor-pointer transition ${
                          isSelected
                            ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-xs text-slate-900">
                            {dept.name}
                          </h4>
                          {isSelected && <span className="text-xs text-sky-700 font-bold">✓</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {dept.description || "General clinical outpatient department"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 3: DOCTOR SELECTION ================= */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>Department: <strong>{selectedDepartment?.name}</strong></span>
                <span>Facility: <strong>{selectedHospital?.name}</strong></span>
              </div>

              {selectionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">
                  {selectionError}
                </div>
              )}

              {departmentDoctors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-xs text-slate-500">No physicians found for the selected department.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                {departmentDoctors.map((doc) => {
                  const isSelected = selectedDoctor?.id === doc.id;
                  const docName = doc.name || doc.full_name;
                  const docSpecialization = doc.specialization || doc.designation || "Specialist";
                  const docQualification = doc.qualification || doc.qualifications || doc.education || "MBBS";
                  const docExp = doc.experience_years ? `${doc.experience_years} Years Experience` : (doc.experience || "Experienced");
                  const docSchedule = doc.available_days_hours || "Mon - Fri: 09:00 - 17:00";

                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoctor(doc);
                        setSelectionError("");
                      }}
                      className={`p-4 rounded-md border cursor-pointer transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                        isSelected
                          ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-start space-x-3.5">
                        <img
                          src={doc.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(docName)}`}
                          alt={docName}
                          className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-xs text-slate-900">
                            {docName}
                          </h4>
                          <p className="text-xs text-sky-700 font-medium">
                            {docSpecialization}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {docQualification} &bull; {docExp}
                          </p>
                          <div className="text-[11px] text-slate-600 font-medium pt-0.5">
                            <span className="text-slate-500 font-normal">Available:</span> {docSchedule}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col sm:items-end justify-between self-end sm:self-center">
                        <div className="text-xs font-bold text-slate-900">
                          ₹{doc.consultation_fee || 0}
                          <span className="text-[10px] text-slate-500 font-normal block">Consultation Fee</span>
                        </div>
                        <button
                          type="button"
                          className={`mt-2 text-xs px-3 py-1 rounded font-medium transition ${
                            isSelected
                              ? "bg-sky-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {isSelected ? "Selected ✓" : "Choose Doctor"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}

          {/* ================= STEP 4: DATE & TIME SELECTION ================= */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>Doctor: <strong>{selectedDoctor?.name}</strong></span>
                <span className="text-slate-600 font-mono text-[11px]">{selectedDoctor?.room}</span>
              </div>

              {/* Strict Rule: Date Range Restriction (No Past Dates & Strict 3-Month Window) */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Select Appointment Date *
                </label>
                <input
                  type="date"
                  min={todayStr}
                  max={maxDateStr}
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="ent-input text-xs max-w-xs"
                />
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <p>&bull; <strong>Strict Policy:</strong> Dates beyond 90 days (3-month window) and past dates are automatically restricted.</p>
                </div>
                {dateError && (
                  <p className="text-xs text-rose-700 font-medium mt-1">
                    {dateError}
                  </p>
                )}
              </div>

              {/* Slot Selection with Collision Detection */}
              {selectedDate && !dateError && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-800">
                      Available Time Slots on {selectedDate} *
                    </label>
                    <span className="text-[11px] text-slate-500">
                      30-minute consultation slots
                    </span>
                  </div>

                  {slotsLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Computing dynamic doctor availability...
                    </div>
                  ) : liveSlots !== null ? (
                    liveSlots.length === 0 ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs text-center font-medium">
                        {slotsMessage || "Doctor is unavailable on this date. Please select another date."}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {liveSlots.map((slotObj) => {
                          const slotTime = slotObj.display_time || slotObj.start_time;
                          const isSelected = selectedTime === slotTime;

                          return (
                            <button
                              key={slotTime}
                              type="button"
                              onClick={() => setSelectedTime(slotTime)}
                              className={`py-2 px-3 text-xs rounded-md border font-mono transition flex flex-col items-center justify-center ${
                                isSelected
                                  ? "bg-sky-600 text-white border-sky-600 font-bold shadow-xs"
                                  : "bg-white text-slate-800 border-slate-200 hover:border-sky-300 hover:bg-sky-50"
                              }`}
                            >
                              <span>{slotTime}</span>
                              <span className="text-[9px] mt-0.5 font-sans">
                                {isSelected ? "Selected ✓" : "Available"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AVAILABLE_TIME_SLOTS.map((slot) => {
                        const isOccupied = occupiedSlots.includes(slot);
                        const isSelected = selectedTime === slot;

                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isOccupied}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2 px-3 text-xs rounded-md border font-mono transition flex flex-col items-center justify-center ${
                              isOccupied
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60 line-through"
                                : isSelected
                                ? "bg-sky-600 text-white border-sky-600 font-bold shadow-xs"
                                : "bg-white text-slate-800 border-slate-200 hover:border-sky-300 hover:bg-sky-50"
                            }`}
                          >
                            <span>{slot}</span>
                            <span className="text-[9px] mt-0.5 font-sans">
                              {isOccupied ? "Unavailable" : isSelected ? "Selected" : "Open"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 5: APPOINTMENT TYPE ================= */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-800">
                Choose Consultation Modality
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setAppointmentType("Visit Hospital")}
                  className={`p-5 rounded-lg border cursor-pointer transition ${
                    appointmentType === "Visit Hospital"
                      ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 mb-2">
                    <div className="w-8 h-8 rounded bg-sky-100 text-sky-700 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">In-Person Hospital Visit</h4>
                      <span className="text-[10px] text-slate-500 font-mono">OPD Consultation</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Consult physician physically in the clinic cabin. Please arrive 30 minutes before your slot for vital check-in at reception.
                  </p>
                </div>

                <div
                  onClick={() => setAppointmentType("Online Consultation")}
                  className={`p-5 rounded-lg border cursor-pointer transition ${
                    appointmentType === "Online Consultation"
                      ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 mb-2">
                    <div className="w-8 h-8 rounded bg-teal-100 text-teal-700 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">Online Telehealth Video</h4>
                      <span className="text-[10px] text-slate-500 font-mono">Encrypted WebRTC</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Connect with physician remotely via secure video audio consultation. Digital prescription generated immediately after call.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 6: APPOINTMENT REASON ================= */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Reason for Consultation &amp; Primary Symptoms *
                </label>
                <textarea
                  rows="4"
                  value={appointmentReason}
                  onChange={(e) => setAppointmentReason(e.target.value)}
                  required
                  placeholder="Describe your current symptoms, how long you have experienced them, or if this is a routine prescription renewal..."
                  className="ent-input text-xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Mandatory field: Clinical triage uses this summary to prepare diagnostic test orders.
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 7: PAYMENT & CONFIRMATION ================= */}
          {currentStep === 7 && (
            <div className="space-y-5">
              {/* Summary Card */}
              <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Facility &amp; Unit:</span>
                  <span className="font-semibold text-slate-900">{selectedHospital?.name} ({selectedDepartment?.name})</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Attending Doctor:</span>
                  <span className="font-semibold text-slate-900">{selectedDoctor?.name}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Scheduled Date &amp; Time:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedDate} at {selectedTime}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-600 font-medium">Consultation Fee Payable:</span>
                  <span className="text-base font-bold text-slate-900">₹{selectedDoctor?.consultation_fee}</span>
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Select Payment Method *
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setPaymentMethod("UPI")}
                    className={`p-3.5 rounded-md border cursor-pointer transition ${
                      paymentMethod === "UPI"
                        ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">UPI / QR Code (Instant)</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">
                        COMPLETED Bill
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Pay via Google Pay, PhonePe, Paytm or BHIM. Generates receipt immediately.
                    </p>
                  </div>

                  <div
                    onClick={() => setPaymentMethod("CASH")}
                    className={`p-3.5 rounded-md border cursor-pointer transition ${
                      paymentMethod === "CASH"
                        ? "bg-sky-50/80 border-sky-400 ring-1 ring-sky-300"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Pay Cash at Reception</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">
                        PENDING Bill
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Pay at hospital reception upon arrival. (Bill visible once receptionist confirms payment).
                    </p>
                  </div>
                </div>
              </div>

              {paymentMethod === "UPI" && (
                <div className="p-4 bg-slate-50 rounded-md border border-slate-200 flex flex-col sm:flex-row items-center gap-4 text-xs">
                  <div className="w-24 h-24 bg-white p-1 rounded border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=${selectedHospital?.upi_id}&pn=${encodeURIComponent(selectedHospital?.payee_name || "Hospital")}&am=${selectedDoctor?.consultation_fee}&cu=INR`}
                      alt="UPI QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 block">Hospital UPI Virtual Terminal</span>
                    <span className="text-sky-700 font-mono text-[11px] block">{selectedHospital?.upi_id}</span>
                    <p className="text-slate-500 text-[11px] mt-1">
                      Amount: <strong>₹{selectedDoctor?.consultation_fee}</strong>. Scan with any UPI app to complete booking.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Controls */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            disabled={currentStep === 1 || submitting}
            onClick={handlePrevStep}
            className="ent-btn-secondary text-xs disabled:opacity-40"
          >
            &larr; Back
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="ent-btn-ghost text-xs"
            >
              Cancel
            </button>

            {currentStep < 7 ? (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={
                  (currentStep === 1 && !selectedHospital) ||
                  (currentStep === 2 && !selectedDepartment) ||
                  (currentStep === 3 && !selectedDoctor) ||
                  (currentStep === 4 && (!selectedDate || dateError || !selectedTime)) ||
                  (currentStep === 6 && !appointmentReason.trim())
                }
                className="ent-btn-primary text-xs disabled:opacity-50"
              >
                Continue &rarr;
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="ent-btn-primary text-xs"
              >
                {submitting
                  ? (upiProcessing ? "Processing UPI Settlement..." : "Confirming Slot...")
                  : (paymentMethod === "UPI" ? "Pay & Confirm Booking" : "Confirm Slot (Pay at Desk)")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
