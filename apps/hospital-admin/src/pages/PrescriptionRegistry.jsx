import React, { useState, useEffect, useCallback } from "react";
import {
  getHospitalPrescriptions,
  getPrescriptionDetails,
  updatePrescriptionStatus,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination from "../components/Pagination";

export default function PrescriptionRegistry({ session }) {
  const token = session?.token;

  // Prescription records state
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Pagination states (default 25 items per page)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Details Modal
  const [selectedRxDetails, setSelectedRxDetails] = useState(null);
  const [showRxModal, setShowRxModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Cancellation Modal
  const [cancellingRx, setCancellingRx] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const triggerSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Fetch prescriptions list
  const loadPrescriptions = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getHospitalPrescriptions(token, {
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        limit,
      });

      setPrescriptions(res.data || []);
      if (res.pagination) {
        setPagination({
          total: res.pagination.total || 0,
          totalPages: res.pagination.totalPages || res.pagination.total_pages || 1,
        });
      }
    } catch (err) {
      console.error("Failed to load prescriptions:", err);
      setError(err.message || "Failed to load prescriptions registry.");
    } finally {
      setLoading(false);
    }
  }, [token, debouncedSearch, statusFilter, page, limit]);

  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  // Open Rx Audit & Details Modal
  async function handleViewRxDetails(id) {
    try {
      setDetailsLoading(true);
      setShowRxModal(true);
      const data = await getPrescriptionDetails(token, id);
      setSelectedRxDetails(data);
    } catch (err) {
      alert(err.message || "Failed to load prescription details");
      setShowRxModal(false);
    } finally {
      setDetailsLoading(false);
    }
  }

  // Open Cancel Modal
  function handleOpenCancelModal(rx) {
    setCancellingRx(rx);
    setCancelReason("");
    setShowCancelModal(true);
  }

  // Confirm Cancellation
  async function handleConfirmCancel(e) {
    e.preventDefault();
    if (!cancellingRx) return;
    if (!cancelReason || cancelReason.trim().length < 3) {
      return alert("A valid reason of at least 3 characters is required to cancel a prescription.");
    }

    try {
      setSubmitting(true);
      await updatePrescriptionStatus(token, cancellingRx.id, "cancelled", cancelReason.trim());
      triggerSuccess(`Prescription #${cancellingRx.prescription_number} cancelled successfully.`);
      setShowCancelModal(false);
      setCancellingRx(null);
      if (showRxModal && selectedRxDetails?.id === cancellingRx.id) {
        handleViewRxDetails(cancellingRx.id);
      }
      loadPrescriptions();
    } catch (err) {
      alert(err.message || "Failed to cancel prescription");
    } finally {
      setSubmitting(false);
    }
  }

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const statusBadges = {
    active: "bg-emerald-100 text-emerald-800 border-emerald-200",
    partially_dispensed: "bg-amber-100 text-amber-800 border-amber-200",
    dispensed: "bg-sky-100 text-sky-800 border-sky-200",
    cancelled: "bg-rose-100 text-rose-800 border-rose-200",
    draft: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-xs">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Prescription Registry &amp; History
            </h1>
            <p className="text-xs text-slate-500">
              Prescription Lifecycle Audit, Multi-Item Regimens &amp; Dispensation Governance
            </p>
          </div>
        </div>

        <button
          onClick={loadPrescriptions}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer transition disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-600" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 font-bold ml-2">✕</button>
        </div>
      )}

      {/* 2. Search, Filters & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-20">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search Rx #, patient, doctor, or drug..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs w-72 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="w-48">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active" },
                  { value: "partially_dispensed", label: "Partially Dispensed" },
                  { value: "dispensed", label: "Fully Dispensed" },
                  { value: "draft", label: "Draft" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
                placeholder="All Statuses"
              />
            </div>

            {(searchTerm || statusFilter !== "all") && (
              <button
                onClick={handleClearFilters}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Total {pagination.total} prescription(s)
          </span>
        </div>

        {/* 3. Prescriptions Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Rx Number</th>
                <th className="px-3 py-2.5">Patient</th>
                <th className="px-3 py-2.5">Prescribing Doctor</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5">Items</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                    <div className="inline-flex items-center space-x-2">
                      <svg className="w-4 h-4 animate-spin text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Loading prescription records...</span>
                    </div>
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                    No prescriptions found matching the search criteria.
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => {
                  const canCancel = rx.status === "active" || rx.status === "partially_dispensed";

                  return (
                    <tr key={rx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-sky-700 whitespace-nowrap">
                        {rx.prescription_number}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">
                        {rx.patient_name}
                        {rx.patient_email && (
                          <span className="text-[10px] text-slate-400 block font-normal font-mono">
                            {rx.patient_email}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        Dr. {rx.doctor_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {rx.department_name || "General Medicine"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                        {rx.item_count || 0} drugs
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                            statusBadges[rx.status] || "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {rx.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(rx.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleViewRxDetails(rx.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-semibold cursor-pointer transition"
                        >
                          Audit &amp; Details
                        </button>
                        {canCancel && (
                          <button
                            onClick={() => handleOpenCancelModal(rx)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-semibold cursor-pointer transition"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Unified Pagination Component */}
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          totalRecords={pagination.total}
          pageSize={limit}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={(newPage) => setPage(newPage)}
          onPageSizeChange={(newSize) => {
            setLimit(newSize);
            setPage(1);
          }}
        />
      </div>

      {/* PRESCRIPTION DETAILS & AUDIT MODAL */}
      {showRxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Prescription Details &amp; Lifecycle Audit
                </h3>
                {selectedRxDetails && (
                  <span className="text-[11px] font-mono text-sky-700">
                    Rx #{selectedRxDetails.prescription_number}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowRxModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {detailsLoading || !selectedRxDetails ? (
              <div className="py-12 text-center text-slate-400">Loading prescription audit trail...</div>
            ) : (
              <div className="space-y-4">
                {/* Prescription Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Patient</span>
                    <strong className="text-slate-900">{selectedRxDetails.patient_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Prescribing Doctor</span>
                    <strong className="text-slate-900">Dr. {selectedRxDetails.doctor_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Consultation Date</span>
                    <span className="font-mono">{new Date(selectedRxDetails.consultation_date || selectedRxDetails.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Status</span>
                    <span className="font-bold uppercase text-sky-800">{selectedRxDetails.status}</span>
                  </div>
                </div>

                {/* Medication Items */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Prescribed Medication Line Items</h4>
                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2">Dosage / Freq</th>
                          <th className="px-3 py-2">Timing</th>
                          <th className="px-3 py-2">Prescribed</th>
                          <th className="px-3 py-2">Dispensed</th>
                          <th className="px-3 py-2 text-right">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRxDetails.items?.map((it) => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {it.medicine_name}
                              {it.instructions && (
                                <span className="text-[10px] text-slate-400 block font-normal italic">{it.instructions}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {it.dosage} &bull; {it.frequency}
                            </td>
                            <td className="px-3 py-2 capitalize">{it.timing?.replace("_", " ")}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{it.quantity}</td>
                            <td className="px-3 py-2 font-mono text-emerald-700 font-bold">{it.dispensed_quantity || 0}</td>
                            <td className="px-3 py-2 font-mono text-right font-bold text-slate-700">
                              {Math.max(0, (it.quantity || 0) - (it.dispensed_quantity || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Status Audit Trail Timeline */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Status Transition History &amp; Audit Trail</h4>
                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Timestamp</th>
                          <th className="px-3 py-2">Action / Transition</th>
                          <th className="px-3 py-2">Authorized User</th>
                          <th className="px-3 py-2">Audit Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {!selectedRxDetails.status_history || selectedRxDetails.status_history.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-3 py-3 text-center text-slate-400">
                              No previous status transitions recorded.
                            </td>
                          </tr>
                        ) : (
                          selectedRxDetails.status_history.map((h) => (
                            <tr key={h.id}>
                              <td className="px-3 py-2 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                              <td className="px-3 py-2">
                                <span className="font-bold text-slate-700">{h.from_status || "origin"}</span>
                                <span className="mx-1 text-slate-400">&rarr;</span>
                                <span className="font-bold text-sky-700">{h.to_status}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-800">{h.changed_by_name} ({h.changed_by_role})</td>
                              <td className="px-3 py-2 text-slate-600 font-sans italic">{h.reason || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Linked Pharmacy Dispensations */}
                {selectedRxDetails.dispensations && selectedRxDetails.dispensations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs">Linked Pharmacy Dispensation Receipts</h4>
                    <div className="border border-slate-200 rounded-md overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2">Receipt #</th>
                            <th className="px-3 py-2">Dispensed By</th>
                            <th className="px-3 py-2">Payment</th>
                            <th className="px-3 py-2">Total Amount</th>
                            <th className="px-3 py-2 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRxDetails.dispensations.map((d) => (
                            <tr key={d.id}>
                              <td className="px-3 py-2 font-mono font-bold text-sky-700">{d.dispensation_number}</td>
                              <td className="px-3 py-2">{d.dispensed_by_name}</td>
                              <td className="px-3 py-2 uppercase font-mono text-[10px]">{d.payment_method}</td>
                              <td className="px-3 py-2 font-mono font-bold text-emerald-700">₹{parseFloat(d.total_amount).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-slate-500 font-mono text-[11px]">{new Date(d.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowRxModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer hover:bg-slate-800 transition"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL PRESCRIPTION MODAL */}
      {showCancelModal && cancellingRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-rose-800 text-sm">Cancel Prescription</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to cancel Prescription <strong>#{cancellingRx.prescription_number}</strong>?
              This action will prevent any further pharmacy dispensing and log an immutable audit event.
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Mandatory Audit Justification Reason *
                </label>
                <textarea
                  required
                  rows="3"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Incompatible medication dosage flagged during medical review; new prescription issued."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-rose-500 text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Keep Active
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded cursor-pointer disabled:opacity-50 hover:bg-rose-700 transition"
                >
                  {submitting ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

