import { useState, useEffect, useCallback } from "react";
import { getDoctorPrescriptions, getPrescriptionDetails } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination from "../components/Pagination";

export default function DoctorPrescriptions({ session }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });

  // Modal State
  const [selectedRx, setSelectedRx] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Debounce search input and reset page to 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPrescriptions = useCallback(async () => {
    if (!session?.token) return;
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (session?.user?.id) params.doctor_id = session.user.id;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      params.page = pagination.page;
      params.limit = pagination.limit;

      const res = await getDoctorPrescriptions(session.token, params);
      setPrescriptions(res.data || []);
      if (res.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: res.pagination.total || 0,
          totalPages: res.pagination.totalPages || res.pagination.total_pages || 1,
        }));
      }
    } catch (err) {
      console.error("Failed to load doctor prescriptions:", err);
      setError(err.message || "Failed to load prescriptions list.");
    } finally {
      setLoading(false);
    }
  }, [session, debouncedSearch, statusFilter, fromDate, toDate, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  const handleOpenDetails = async (rxId) => {
    try {
      setLoadingDetails(true);
      const details = await getPrescriptionDetails(session.token, rxId);
      setSelectedRx(details);
    } catch (err) {
      alert(err.message || "Could not retrieve prescription details.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "draft":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">● Draft</span>;
      case "active":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">✓ Active</span>;
      case "partially_dispensed":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 inline-flex items-center gap-1">◐ Partial</span>;
      case "dispensed":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 inline-flex items-center gap-1">✔ Dispensed</span>;
      case "cancelled":
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200 inline-flex items-center gap-1">✕ Cancelled</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="w-full space-y-4 font-sans pb-12">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900">Physician Prescriptions Hub</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            View, search, and monitor dispensing status of outpatient prescriptions authored by you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPrescriptions}
            className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Filters Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Rx #, patient, drug name..."
              className="ent-input text-xs"
            />
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700">Prescription Status</label>
            <CustomDropdown
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "partially_dispensed", label: "Partially Dispensed" },
                { value: "dispensed", label: "Fully Dispensed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>

          {/* From Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ent-input text-xs"
            />
          </div>

          {/* To Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="ent-input text-xs"
            />
          </div>
        </div>

        {(search || statusFilter !== "all" || fromDate || toDate) && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500">
              Showing filtered results ({pagination.total} total)
            </span>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
              }}
              className="text-sky-600 hover:text-sky-800 font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Prescriptions Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ent-table">
            <thead>
              <tr>
                <th>Prescription #</th>
                <th>Patient Details</th>
                <th>Prescription Date</th>
                <th>Medication Items</th>
                <th>Status</th>
                <th>Dispensing Progress</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                    <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading prescriptions...
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                    No prescriptions found matching your current filters.
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => {
                  const prescribedUnits = Number(rx.total_prescribed_units || 0);
                  const dispensedUnits = Number(rx.total_dispensed_units || 0);
                  const percent = prescribedUnits > 0 ? Math.min(100, Math.round((dispensedUnits / prescribedUnits) * 100)) : 0;

                  return (
                    <tr key={rx.id}>
                      <td className="font-mono text-xs font-bold text-slate-900">
                        {rx.prescription_number}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          Consultation #{rx.consultation_id}
                        </span>
                      </td>
                      <td>
                        <span className="font-semibold text-xs text-slate-900 block truncate max-w-xs">
                          {rx.patient_name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {rx.patient_email || rx.patient_phone || "--"}
                        </span>
                      </td>
                      <td className="text-xs text-slate-600">
                        {rx.created_at ? new Date(rx.created_at).toLocaleDateString() : "--"}
                        <span className="block text-[10px] text-slate-400">
                          {rx.created_at ? new Date(rx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-slate-800">
                          {rx.total_items} Item{rx.total_items !== 1 ? "s" : ""}
                        </span>
                        {rx.items && rx.items.length > 0 && (
                          <span className="block text-[10px] text-slate-500 truncate max-w-xs">
                            {rx.items.map((i) => i.medicine_name).join(", ")}
                          </span>
                        )}
                      </td>
                      <td>{getStatusBadge(rx.status)}</td>
                      <td>
                        <div className="w-32">
                          <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                            <span className="font-mono font-semibold">{dispensedUnits}/{prescribedUnits} units</span>
                            <span className="font-bold">{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                percent === 100 ? "bg-emerald-500" : percent > 0 ? "bg-indigo-500" : "bg-slate-300"
                              }`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(rx.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Pagination Controls */}
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalRecords={pagination.total}
          pageSize={pagination.limit}
          onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
          onPageSizeChange={(newSize) => setPagination((prev) => ({ ...prev, limit: newSize, page: 1 }))}
        />
      </div>

      {/* Prescription Details Modal */}
      {selectedRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-scrollbar">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col font-sans overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 tracking-wider font-mono">
                  Rx
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold font-mono text-slate-900 tracking-tight">
                      Prescription #{selectedRx.prescription_number}
                    </h3>
                    {getStatusBadge(selectedRx.status)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>Issued by <strong className="text-slate-700 font-semibold">{selectedRx.doctor_name}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span>{selectedRx.hospital_name}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  title="Print Prescription"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRx(null)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1.5 rounded transition cursor-pointer"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs no-scrollbar">
              {/* Patient & Consultation Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Patient Info */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Patient Info
                    </span>
                    <span className="text-[10px] font-mono text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 font-semibold">
                      #{selectedRx.patient_id}
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm leading-tight">{selectedRx.patient_name}</div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5 flex items-center gap-1.5">
                      <span>{selectedRx.patient_phone || selectedRx.patient_email || "No contact info recorded"}</span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Clinical Diagnosis */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Clinical Diagnosis
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs leading-snug">
                      {selectedRx.diagnosis || "General Outpatient Consultation"}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5 leading-relaxed line-clamp-2" title={selectedRx.chief_complaint || "Routine evaluation"}>
                      {selectedRx.chief_complaint || "Routine clinical evaluation"}
                    </div>
                  </div>
                </div>

                {/* Card 3: Consultation & Date */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Issue Date &amp; Ref
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(selectedRx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div>
                    <div className="font-mono font-bold text-slate-900 text-xs">
                      {new Date(selectedRx.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                    <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                      Consultation #{selectedRx.consultation_id || selectedRx.id}
                    </div>
                  </div>
                </div>
              </div>

              {/* Prescribed Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Prescribed Medications
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                      {selectedRx.items?.length || 0} items
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Prescription line items ready for pharmacy dispensing
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <table className="ent-table">
                    <thead>
                      <tr>
                        <th className="w-8 text-center">#</th>
                        <th>Medication &amp; Form</th>
                        <th>Dosage &amp; Frequency</th>
                        <th>Timing &amp; Duration</th>
                        <th className="text-center">Prescribed</th>
                        <th className="text-center">Dispensed</th>
                        <th>Instructions / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRx.items && selectedRx.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="text-center font-mono text-slate-400 font-semibold text-[11px]">
                            {idx + 1}
                          </td>
                          <td>
                            <div className="font-bold text-slate-900 text-xs leading-snug">
                              {it.medicine_name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {it.form && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                  {it.form}
                                </span>
                              )}
                              {it.medicine_sku && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  {it.medicine_sku}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {it.dosage && (
                              <div className="text-slate-800 font-medium text-xs mb-0.5">
                                {it.dosage}
                              </div>
                            )}
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                              {it.frequency}
                            </span>
                          </td>
                          <td>
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 inline-block whitespace-nowrap">
                              {it.timing ? it.timing.replace(/_/g, " ") : "As Directed"}
                            </span>
                            <span className="block text-slate-500 text-[11px] font-medium mt-1">
                              {it.duration || "--"}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {it.quantity ? `${it.quantity}` : "--"}
                            </span>
                          </td>
                          <td className="text-center">
                            {it.dispensed_quantity > 0 ? (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200 inline-block whitespace-nowrap">
                                {it.dispensed_quantity} / {it.quantity || "--"}
                              </span>
                            ) : (
                              <span className="font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded text-[11px] border border-slate-200 inline-block whitespace-nowrap">
                                0 / {it.quantity || "--"}
                              </span>
                            )}
                          </td>
                          <td className="text-slate-600 text-[11px] leading-relaxed">
                            {it.instructions ? (
                              <span className="italic">{it.instructions}</span>
                            ) : (
                              <span className="text-slate-400 italic">None specified</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Doctor Advice & Instructions */}
              {selectedRx.general_instructions && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 shadow-xs">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Doctor Advice &amp; Patient Instructions
                    </span>
                  </div>
                  <p className="text-slate-700 text-xs leading-relaxed pl-6 font-normal">
                    {selectedRx.general_instructions}
                  </p>
                </div>
              )}

              {/* Linked Pharmacy Dispensations */}
              {selectedRx.dispensations && selectedRx.dispensations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Linked Pharmacy Dispensation Receipts
                    </h4>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {selectedRx.dispensations.length} records
                    </span>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
                    <table className="ent-table">
                      <thead>
                        <tr>
                          <th>Receipt #</th>
                          <th>Dispensed By</th>
                          <th>Status</th>
                          <th className="text-right">Total Amount</th>
                          <th className="text-right">Date &amp; Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRx.dispensations.map((disp) => (
                          <tr key={disp.id}>
                            <td className="font-mono font-bold text-sky-700">
                              {disp.dispensation_number}
                            </td>
                            <td className="text-slate-700 font-medium">
                              {disp.dispensed_by_name}
                            </td>
                            <td>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 uppercase font-mono">
                                {disp.payment_status || "Paid"}
                              </span>
                            </td>
                            <td className="text-right font-mono font-bold text-emerald-700">
                              ₹{parseFloat(disp.total_amount).toFixed(2)}
                            </td>
                            <td className="text-right font-mono text-slate-500 text-[11px]">
                              {new Date(disp.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status Audit History */}
              {selectedRx.status_history && selectedRx.status_history.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Prescription Lifecycle Audit Trail
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white divide-y divide-slate-100 max-h-36 overflow-y-auto no-scrollbar">
                    {selectedRx.status_history.map((h, i) => (
                      <div key={i} className="p-2.5 px-3.5 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-semibold text-slate-800">
                            {h.from_status ? (
                              <>
                                <span className="uppercase text-slate-500 font-mono text-[10px]">{h.from_status}</span>
                                <span className="mx-1 text-slate-400">→</span>
                              </>
                            ) : (
                              <span className="text-slate-500 mr-1">Initialized as</span>
                            )}
                            <span className="uppercase text-sky-700 font-mono font-bold text-[10px]">{h.to_status}</span>
                          </span>
                          {h.reason && <span className="text-slate-500 block text-[11px] italic mt-0.5">{h.reason}</span>}
                        </div>
                        <div className="text-right text-slate-400 font-mono text-[10px]">
                          <span className="font-semibold text-slate-700 block">{h.changed_by_name} ({h.changed_by_role})</span>
                          <span>{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Official Digitally Signed Clinical Prescription</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Prescription</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRx(null)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
