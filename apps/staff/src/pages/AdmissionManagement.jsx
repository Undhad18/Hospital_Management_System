import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getAdmissions,
  getAdmissionById,
  getAdmissionHistory,
  createAdmission,
  updateAdmissionStatus,
  searchPatientsForAdmission,
  checkActiveAdmission,
  getAdmissionHospitals,
  getAdmissionDepartments,
  getAdmissionDoctors,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function AdmissionManagement({ session }) {
  const token = session?.token;
  const user = session?.user;

  // View state
  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedAdmissions,
    resetPage,
  } = usePagination(admissions, 25);

  useEffect(() => {
    resetPage();
  }, [filterStatus, searchQuery, resetPage]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Status update state
  const [targetStatus, setTargetStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Create form state
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeAdmissionAlert, setActiveAdmissionAlert] = useState(null);

  const [hospitals, setHospitals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [formData, setFormData] = useState({
    hospital_id: user?.hospitalId || "",
    department_id: "",
    doctor_id: "",
    admission_date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    reason: "",
    initial_status: "admitted",
    appointment_id: "",
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(null);
  const [reviewStep, setReviewStep] = useState(false);

  // Fetch admissions list
  const loadAdmissions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const filters = {};
      if (filterStatus && filterStatus !== "all") {
        filters.status = filterStatus;
      }
      if (searchQuery.trim()) {
        filters.search = searchQuery.trim();
      }
      const data = await getAdmissions(token, filters);
      setAdmissions(data);
    } catch (err) {
      setError(err.message || "Failed to load admissions");
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, searchQuery]);

  useEffect(() => {
    loadAdmissions();
  }, [loadAdmissions]);

  // Real-time synchronization for admissions
  useEffect(() => {
    if (!token) return;

    const unsub = subscribeToEvent("admissions:updated", () => {
      loadAdmissions();
    }, token);

    return () => {
      unsub();
    };
  }, [token, loadAdmissions]);

  // Load cascading dropdowns for creation form
  useEffect(() => {
    if (!showCreateModal || !token) return;

    getAdmissionHospitals(token)
      .then((hList) => {
        setHospitals(hList);
        if (user?.hospitalId) {
          setFormData((prev) => ({ ...prev, hospital_id: user.hospitalId }));
        } else if (hList.length > 0) {
          setFormData((prev) => ({ ...prev, hospital_id: hList[0].id }));
        }
      })
      .catch((err) => console.error("Hospitals load error:", err));
  }, [showCreateModal, token, user?.hospitalId]);

  // Load departments when hospital changes
  useEffect(() => {
    if (!formData.hospital_id || !token) {
      setDepartments([]);
      return;
    }

    getAdmissionDepartments(token, formData.hospital_id)
      .then((deptList) => {
        setDepartments(deptList);
        if (deptList.length > 0) {
          setFormData((prev) => ({ ...prev, department_id: deptList[0].id }));
        } else {
          setFormData((prev) => ({ ...prev, department_id: "" }));
        }
      })
      .catch((err) => console.error("Departments load error:", err));
  }, [formData.hospital_id, token]);

  // Load doctors when hospital and department change
  useEffect(() => {
    if (!formData.hospital_id || !formData.department_id || !token) {
      setDoctors([]);
      return;
    }

    getAdmissionDoctors(token, formData.hospital_id, formData.department_id)
      .then((docList) => {
        setDoctors(docList);
        if (docList.length > 0) {
          setFormData((prev) => ({ ...prev, doctor_id: docList[0].id }));
        } else {
          setFormData((prev) => ({ ...prev, doctor_id: "" }));
        }
      })
      .catch((err) => console.error("Doctors load error:", err));
  }, [formData.hospital_id, formData.department_id, token]);

  // Search patients with debouncing
  useEffect(() => {
    if (!patientSearchTerm || patientSearchTerm.trim().length < 2) {
      setPatientSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const results = await searchPatientsForAdmission(token, patientSearchTerm);
        setPatientSearchResults(results);
      } catch (err) {
        console.error("Patient search error:", err);
      } finally {
        setPatientSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [patientSearchTerm, token]);

  // Check active admission when patient is selected
  async function handleSelectPatient(pat) {
    setSelectedPatient(pat);
    setActiveAdmissionAlert(null);
    try {
      const checkRes = await checkActiveAdmission(token, pat.id);
      if (checkRes.hasActiveAdmission) {
        setActiveAdmissionAlert(checkRes.activeAdmission);
      }
    } catch (err) {
      console.warn("Active admission check failed:", err.message);
    }
  }

  // Handle Admission Submission
  async function handleCreateAdmissionSubmit(e) {
    e.preventDefault();
    if (!reviewStep) {
      // Validate fields before showing review
      if (!selectedPatient) {
        setFormError("Please select a patient.");
        return;
      }
      if (activeAdmissionAlert) {
        setFormError(
          `Cannot admit patient: Patient already has an active admission (${activeAdmissionAlert.admission_number}).`
        );
        return;
      }
      if (!formData.hospital_id || !formData.department_id || !formData.doctor_id) {
        setFormError("Hospital, Department, and Doctor are required.");
        return;
      }
      if (!formData.reason || formData.reason.trim().length < 5) {
        setFormError("Admission reason must be at least 5 characters.");
        return;
      }
      setFormError("");
      setReviewStep(true);
      return;
    }

    // Actual submission
    setFormSubmitting(true);
    setFormError("");
    setFormSuccess(null);

    try {
      const payload = {
        patient_id: selectedPatient.id,
        hospital_id: Number(formData.hospital_id),
        department_id: Number(formData.department_id),
        doctor_id: Number(formData.doctor_id),
        admission_date: new Date(formData.admission_date).toISOString(),
        reason: formData.reason.trim(),
        initial_status: formData.initial_status,
        appointment_id: formData.appointment_id ? Number(formData.appointment_id) : null,
      };

      const result = await createAdmission(token, payload);
      setFormSuccess(result.data);
      loadAdmissions();
    } catch (err) {
      setFormError(err.message || "Failed to create admission");
      setReviewStep(false);
    } finally {
      setFormSubmitting(false);
    }
  }

  // View Details & Status History
  async function handleViewDetails(admission) {
    setSelectedAdmission(admission);
    setShowDetailModal(true);
    setHistoryLoading(true);
    try {
      const history = await getAdmissionHistory(token, admission.id);
      setStatusHistory(history);
    } catch (err) {
      console.error("Failed to load history:", err);
      setStatusHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Open status update modal
  function handleOpenStatusModal(admission, nextStatus) {
    setSelectedAdmission(admission);
    setTargetStatus(nextStatus);
    setStatusReason("");
    setStatusError("");
    setShowStatusModal(true);
  }

  // Submit status update
  async function handleStatusUpdateSubmit(e) {
    e.preventDefault();
    if (!selectedAdmission || !targetStatus) return;

    setStatusUpdating(true);
    setStatusError("");

    try {
      await updateAdmissionStatus(token, selectedAdmission.id, targetStatus, statusReason);
      setShowStatusModal(false);
      loadAdmissions();
      // If details modal is open, refresh it
      if (showDetailModal && selectedAdmission) {
        const updated = await getAdmissionById(token, selectedAdmission.id);
        setSelectedAdmission(updated);
        const history = await getAdmissionHistory(token, selectedAdmission.id);
        setStatusHistory(history);
      }
    } catch (err) {
      setStatusError(err.message || "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = admissions.length;
    const active = admissions.filter((a) => a.status === "admitted").length;
    const pending = admissions.filter((a) => a.status === "pending").length;
    const discharged = admissions.filter((a) => a.status === "discharged").length;
    return { total, active, pending, discharged };
  }, [admissions]);

  function getStatusBadge(status) {
    switch (status) {
      case "admitted":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
            Admitted
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
            Pending
          </span>
        );
      case "discharged":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            Discharged
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Patient Admission Management (Inpatient Census)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Secure inpatient workflow linking patients, hospitals, doctors, departments, admission history, and appointment lifecycles.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedPatient(null);
            setPatientSearchTerm("");
            setActiveAdmissionAlert(null);
            setFormError("");
            setFormSuccess(null);
            setReviewStep(false);
            setFormData({
              hospital_id: user?.hospitalId || "",
              department_id: "",
              doctor_id: "",
              admission_date: new Date().toISOString().slice(0, 16),
              reason: "",
              initial_status: "admitted",
              appointment_id: "",
            });
            setShowCreateModal(true);
          }}
          className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Admit Patient
        </button>
      </div>

      {/* Metric Cards - strictly in a single horizontal row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-md border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">TOTAL RECORDS</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="bg-white p-4 rounded-md border border-emerald-300 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">CURRENTLY ADMITTED</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.active}</p>
        </div>
        <div className="bg-white p-4 rounded-md border border-amber-300 shadow-2xs">
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">PENDING ADMISSIONS</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.pending}</p>
        </div>
        <div className="bg-white p-4 rounded-md border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">DISCHARGED PATIENTS</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{metrics.discharged}</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-3.5 rounded-md border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["All", "Admitted", "Pending", "Discharged", "Cancelled"].map((st) => {
            const key = st.toLowerCase();
            const isActive = filterStatus === key;
            return (
              <button
                key={st}
                onClick={() => setFilterStatus(key)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${isActive
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                  }`}
              >
                {st}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search patient, phone, ADM#..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="button"
            onClick={loadAdmissions}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium disabled:opacity-50 transition shadow-2xs cursor-pointer shrink-0"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Admissions Table */}
      <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full mb-2"></div>
            <p>Loading patient admissions...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-xs text-rose-600 font-medium">{error}</p>
            <button
              onClick={loadAdmissions}
              className="mt-2 text-xs text-sky-600 hover:underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : admissions.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-semibold text-slate-700">No Admissions Found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              No admission records match the current filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">REF #</th>
                  <th className="py-3 px-4">PATIENT DETAILS</th>
                  <th className="py-3 px-4">HOSPITAL / DEPT</th>
                  <th className="py-3 px-4">RESPONSIBLE DOCTOR</th>
                  <th className="py-3 px-4">ADMISSION DATE/TIME</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAdmissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {adm.admission_number}
                      {adm.appointment_number && (
                        <div className="text-[10px] text-sky-600 font-sans mt-0.5">
                          Linked Apt: {adm.appointment_number}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{adm.patient_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {adm.patient_gender || "N/A"} • Blood: {adm.patient_blood_group || "N/A"}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{adm.patient_phone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-900 font-medium">{adm.hospital_name}</div>
                      <div className="text-[11px] text-slate-500">{adm.department_name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {adm.doctor_name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">{adm.admission_date_formatted}</div>
                      {adm.discharged_at_formatted && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Discharged: {adm.discharged_at_formatted}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(adm.status)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewDetails(adm)}
                          className="inline-flex items-center justify-center h-7 px-2.5 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                        >
                          Details
                        </button>

                        {/* State transition triggers */}
                        {adm.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleOpenStatusModal(adm, "admitted")}
                              className="inline-flex items-center justify-center h-7 px-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                            >
                              Admit
                            </button>
                            <button
                              onClick={() => handleOpenStatusModal(adm, "cancelled")}
                              className="inline-flex items-center justify-center h-7 px-2.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {adm.status === "admitted" && (
                          <button
                            onClick={() => handleOpenStatusModal(adm, "discharged")}
                            className="inline-flex items-center justify-center h-7 px-2.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                          >
                            Discharge
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
        )}
      </div>

      {/* =========================================================================
          MODAL: CREATE NEW PATIENT ADMISSION (Lessons 9.1, 9.2, 9.3, 9.5, 9.6)
         ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {reviewStep ? "Review & Confirm Patient Admission" : "Initiate Patient Admission"}
                </h3>
                <p className="text-xs text-slate-500">
                  {reviewStep
                    ? "Please verify all entity associations, dates, and reasons before submitting."
                    : "Fill in the required information to assign the patient to inpatient care."}
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess ? (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">Patient Successfully Admitted!</h4>
                  <p className="text-xs text-slate-600 font-mono">
                    Admission Ref: <span className="font-bold text-sky-700">{formSuccess.admission_number}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Patient {formSuccess.patient_name} has been enrolled in inpatient care under {formSuccess.doctor_name} ({formSuccess.department_name}).
                  </p>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : reviewStep ? (
                /* Review & Confirmation Step */
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-md border border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Patient</span>
                        <span className="font-semibold text-slate-900">{selectedPatient.full_name}</span>
                        <span className="text-slate-500 block text-[11px]">Phone: {selectedPatient.phone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Status</span>
                        <span className="font-semibold text-emerald-700 capitalize">{formData.initial_status}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Hospital</span>
                        <span className="font-medium text-slate-800">
                          {hospitals.find((h) => Number(h.id) === Number(formData.hospital_id))?.name || "Selected Hospital"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Department</span>
                        <span className="font-medium text-slate-800">
                          {departments.find((d) => Number(d.id) === Number(formData.department_id))?.name || "Selected Dept"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Doctor</span>
                        <span className="font-medium text-slate-800">
                          {doctors.find((d) => Number(d.id) === Number(formData.doctor_id))?.name || "Selected Doctor"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Scheduled Date/Time</span>
                        <span className="font-medium text-slate-800">{new Date(formData.admission_date).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Admission Reason</span>
                      <p className="text-slate-700 italic mt-0.5">{formData.reason}</p>
                    </div>

                    {formData.appointment_id && (
                      <div className="border-t border-slate-200 pt-2 text-[11px] text-sky-700">
                        Linked to Appointment ID: #{formData.appointment_id} (will be updated to 'admitted')
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setReviewStep(false)}
                      className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
                    >
                      ← Back to Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateAdmissionSubmit}
                      disabled={formSubmitting}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      {formSubmitting ? "Confirming & Admitting..." : "Confirm & Submit Admission"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Intake Form Step */
                <form onSubmit={handleCreateAdmissionSubmit} className="space-y-4">
                  {/* Step 1: Patient Search & Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      1. Select Patient <span className="text-rose-500">*</span>
                    </label>

                    {selectedPatient ? (
                      <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-md flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{selectedPatient.full_name}</p>
                          <p className="text-[11px] text-slate-500">
                            {selectedPatient.email} • {selectedPatient.phone}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            Blood Group: <span className="font-semibold">{selectedPatient.blood_group || "N/A"}</span> • Gender: {selectedPatient.gender || "N/A"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatient(null);
                            setActiveAdmissionAlert(null);
                          }}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                        >
                          Change Patient
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Search patient by name, email, or phone number..."
                          value={patientSearchTerm}
                          onChange={(e) => setPatientSearchTerm(e.target.value)}
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        {patientSearching && (
                          <p className="text-[11px] text-slate-400">Searching patients...</p>
                        )}
                        {patientSearchResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100 bg-white shadow-xs">
                            {patientSearchResults.map((pat) => (
                              <div
                                key={pat.id}
                                onClick={() => handleSelectPatient(pat)}
                                className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-slate-900 block">{pat.full_name}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{pat.phone} • {pat.email}</span>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100 font-medium">
                                  Select
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lesson 9.5: Warning if patient already has active admission */}
                    {activeAdmissionAlert && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900 text-xs flex items-start gap-2">
                        <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="font-bold">Active Admission Detected!</p>
                          <p className="text-[11px] mt-0.5">
                            This patient is already actively admitted under reference #{activeAdmissionAlert.admission_number} ({activeAdmissionAlert.department_name}, Status: {activeAdmissionAlert.status}).
                          </p>
                          <p className="text-[11px] font-semibold mt-1 text-amber-800">
                            In accordance with system policy, a patient cannot have multiple concurrent active admissions. Please discharge the prior admission before creating a new one.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Cascading Hospital, Department, Doctor */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Hospital <span className="text-rose-500">*</span>
                      </label>
                      <CustomDropdown
                        disabled={user?.role !== "super_admin"}
                        value={formData.hospital_id}
                        onChange={(val) => setFormData({ ...formData, hospital_id: val })}
                        options={hospitals.map((h) => ({
                          value: h.id,
                          label: h.name,
                        }))}
                        placeholder="Select Hospital"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department <span className="text-rose-500">*</span>
                      </label>
                      <CustomDropdown
                        value={formData.department_id}
                        onChange={(val) => setFormData({ ...formData, department_id: val })}
                        options={departments.map((d) => ({
                          value: d.id,
                          label: d.name,
                        }))}
                        placeholder={departments.length === 0 ? "No departments available" : "Select Department"}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Responsible Doctor <span className="text-rose-500">*</span>
                      </label>
                      <CustomDropdown
                        value={formData.doctor_id}
                        onChange={(val) => setFormData({ ...formData, doctor_id: val })}
                        options={doctors.map((d) => ({
                          value: d.id,
                          label: `${d.name} (${d.specialization || "Physician"})`,
                        }))}
                        placeholder={doctors.length === 0 ? "No doctors available" : "Select Doctor"}
                      />
                    </div>
                  </div>

                  {/* Step 3: Admission Date, Time and Reason */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Admission Date &amp; Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.admission_date}
                        onChange={(e) => setFormData({ ...formData, admission_date: e.target.value })}
                        className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Initial Status
                      </label>
                      <CustomDropdown
                        value={formData.initial_status}
                        onChange={(val) => setFormData({ ...formData, initial_status: val })}
                        options={[
                          { value: "admitted", label: "Admitted (Direct Inpatient)" },
                          { value: "pending", label: "Pending (Admission Ordered / Bed Prep)" },
                        ]}
                        placeholder="Select Initial Status"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Admission Reason / Clinical Indication <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows="3"
                      placeholder="Specify diagnosis, chief clinical symptoms, or reasons requiring inpatient care..."
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none"
                    ></textarea>
                    <span className="text-[10px] text-slate-400 block text-right">
                      {formData.reason.length}/1000 characters (min 5)
                    </span>
                  </div>

                  {/* Lesson 9.6: Optional Linked Appointment */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Linked Appointment ID (Optional)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1024 (leave blank if direct emergency or walk-in admission)"
                      value={formData.appointment_id}
                      onChange={(e) => setFormData({ ...formData, appointment_id: e.target.value })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      If linked, the appointment status will automatically transition to 'admitted'.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectedPatient || Boolean(activeAdmissionAlert)}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      Review Admission Details →
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADMISSION DETAILS & STATUS HISTORY (Lessons 9.1 & 9.4)
         ========================================================================= */}
      {showDetailModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <span className="text-[10px] font-mono font-semibold uppercase text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {selectedAdmission.admission_number}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">Admission Details &amp; Lifecycle</h3>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4 text-xs">
              {/* Primary Summary Grid */}
              <div className="bg-slate-50 p-4 rounded-md border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Patient Name</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAdmission.patient_name}</span>
                  <span className="text-slate-500 block text-[11px]">
                    {selectedAdmission.patient_gender || "N/A"} • Blood: {selectedAdmission.patient_blood_group || "N/A"}
                  </span>
                  <span className="text-slate-500 block text-[11px] font-mono">{selectedAdmission.patient_phone}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedAdmission.status)}</div>
                  {selectedAdmission.discharged_at_formatted && (
                    <span className="text-[11px] text-slate-500 block mt-1">
                      Discharged: {selectedAdmission.discharged_at_formatted}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Hospital &amp; Unit</span>
                  <span className="font-medium text-slate-800">{selectedAdmission.hospital_name}</span>
                  <span className="text-slate-500 block text-[11px]">{selectedAdmission.department_name}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Responsible Doctor</span>
                  <span className="font-medium text-slate-800">{selectedAdmission.doctor_name}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Admission Timestamp</span>
                  <span className="font-medium text-slate-800">{selectedAdmission.admission_date_formatted}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Admitted By</span>
                  <span className="font-medium text-slate-800">{selectedAdmission.admitted_by_name || "Authorized Staff"}</span>
                </div>
              </div>

              {/* Admission Reason */}
              <div>
                <span className="text-slate-500 text-[11px] font-semibold uppercase block mb-1">
                  Reason for Admission
                </span>
                <div className="p-3 bg-white border border-slate-200 rounded text-slate-700 italic">
                  {selectedAdmission.reason}
                </div>
              </div>

              {/* Discharge Notes (if applicable) */}
              {selectedAdmission.discharge_notes && (
                <div>
                  <span className="text-slate-500 text-[11px] font-semibold uppercase block mb-1">
                    Discharge Summary / Clinical Notes
                  </span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-700">
                    {selectedAdmission.discharge_notes}
                  </div>
                </div>
              )}

              {/* Chronological Status History Timeline (Lesson 9.4) */}
              <div>
                <span className="text-slate-900 text-xs font-bold block mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Admission Status History &amp; Audit Trail
                </span>

                {historyLoading ? (
                  <p className="text-slate-400 text-[11px]">Loading status history...</p>
                ) : statusHistory.length === 0 ? (
                  <p className="text-slate-400 text-[11px]">No status transition history recorded.</p>
                ) : (
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100 overflow-hidden">
                    {statusHistory.map((h, idx) => (
                      <div key={h.id || idx} className="p-2.5 bg-white flex items-center justify-between text-[11px]">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 capitalize">
                              {h.previous_status ? `${h.previous_status} → ${h.new_status}` : `Initial: ${h.new_status}`}
                            </span>
                            <span className="text-[10px] text-slate-400">• by {h.changed_by_name} ({h.changed_by_role})</span>
                          </div>
                          {h.change_reason && (
                            <p className="text-slate-500 text-[10px] mt-0.5">{h.change_reason}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {h.created_at_formatted || new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: STATUS UPDATE (Admit, Discharge, Cancel)
         ========================================================================= */}
      {showStatusModal && selectedAdmission && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                Confirm Status Transition: <span className="text-sky-600 capitalize">{targetStatus}</span>
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStatusUpdateSubmit} className="p-6 space-y-4 text-xs">
              {statusError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                  {statusError}
                </div>
              )}

              <p className="text-slate-600">
                Are you sure you want to transition admission <span className="font-mono font-bold">{selectedAdmission.admission_number}</span> for patient <span className="font-bold">{selectedAdmission.patient_name}</span> from <span className="font-semibold text-slate-900 capitalize">{selectedAdmission.status}</span> to <span className="font-bold text-sky-700 capitalize">{targetStatus}</span>?
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {targetStatus === "discharged" ? "Discharge Summary & Notes" : "Reason / Transition Notes"}
                </label>
                <textarea
                  rows="3"
                  placeholder={
                    targetStatus === "discharged"
                      ? "Condition on discharge, follow-up advice, medications prescribed..."
                      : "Reason for transition..."
                  }
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusUpdating}
                  className={`px-4 py-1.5 rounded text-white font-semibold cursor-pointer disabled:opacity-50 ${targetStatus === "cancelled" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"
                    }`}
                >
                  {statusUpdating ? "Updating..." : `Confirm ${targetStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
