import { useState, useMemo, useEffect } from "react";
import { patientStore } from "../services/patientData";
import {
  getPatientPharmacyBills,
  getPatientPharmacyInvoice,
  emailPatientPharmacyInvoice,
  getPatientConsultationBills,
  emailPatientConsultationReceipt,
  downloadConsultationReceiptPdf,
} from "../services/api";
import Pagination, { usePagination } from "../components/Pagination";

export default function BillsAndPayments({ session }) {
  const [activeTab, setActiveTab] = useState("consultation"); // 'consultation' | 'pharmacy'
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedPharmacyBill, setSelectedPharmacyBill] = useState(null);
  const [livePharmacyBills, setLivePharmacyBills] = useState([]);
  const [isLoadingPharmacy, setIsLoadingPharmacy] = useState(false);
  const [liveConsultationBills, setLiveConsultationBills] = useState([]);
  const [isLoadingConsultation, setIsLoadingConsultation] = useState(false);
  const [emailStatus, setEmailStatus] = useState({ sending: false, success: null, error: null });
  const [consultationEmailStatus, setConsultationEmailStatus] = useState({ sending: false, success: null, error: null });

  const token = session?.token || (() => {
    try {
      const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
      return raw ? JSON.parse(raw)?.token : null;
    } catch {
      return null;
    }
  })();

  const mockConsultationBills = useMemo(() => patientStore.getConsultationBills(), []);
  const mockPharmacyBills = useMemo(() => patientStore.getPharmacyBills(), []);

  // Fetch live consultation bills from backend
  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setIsLoadingConsultation(true);
    getPatientConsultationBills(token)
      .then((res) => {
        if (isMounted && res?.data) {
          setLiveConsultationBills(res.data);
        }
      })
      .catch((err) => {
        console.warn("Could not load backend consultation bills, fallback to local store:", err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingConsultation(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Combined list of consultation bills
  const displayConsultationBills = useMemo(() => {
    if (liveConsultationBills.length > 0) return liveConsultationBills;
    return mockConsultationBills;
  }, [liveConsultationBills, mockConsultationBills]);

  // Fetch live pharmacy bills from backend if token exists
  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setIsLoadingPharmacy(true);
    getPatientPharmacyBills(token)
      .then((res) => {
        if (isMounted && res?.data) {
          setLivePharmacyBills(res.data);
        }
      })
      .catch((err) => {
        console.warn("Could not load backend pharmacy bills, fallback to local store:", err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPharmacy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Combined list of pharmacy bills (live first, or mock fallback)
  const displayPharmacyBills = useMemo(() => {
    if (livePharmacyBills.length > 0) return livePharmacyBills;
    return mockPharmacyBills;
  }, [livePharmacyBills, mockPharmacyBills]);

  const {
    currentPage: consultPage,
    setCurrentPage: setConsultPage,
    pageSize: consultPageSize,
    setPageSize: setConsultPageSize,
    totalPages: consultTotalPages,
    totalRecords: consultTotalRecords,
    paginatedItems: paginatedConsultationBills,
    resetPage: resetConsultPage,
  } = usePagination(displayConsultationBills, 25);

  const {
    currentPage: pharmPage,
    setCurrentPage: setPharmPage,
    pageSize: pharmPageSize,
    setPageSize: setPharmPageSize,
    totalPages: pharmTotalPages,
    totalRecords: pharmTotalRecords,
    paginatedItems: paginatedPharmacyBills,
    resetPage: resetPharmPage,
  } = usePagination(displayPharmacyBills, 25);

  useEffect(() => {
    resetConsultPage();
    resetPharmPage();
  }, [activeTab, resetConsultPage, resetPharmPage]);

  const handleOpenPharmacyInvoice = async (bill) => {
    if (token && bill.id && typeof bill.id === "number") {
      try {
        const fullInvoice = await getPatientPharmacyInvoice(token, bill.id);
        setSelectedPharmacyBill(fullInvoice);
        return;
      } catch (err) {
        console.warn("Could not load full invoice, using bill snapshot:", err.message);
      }
    }
    setSelectedPharmacyBill(bill);
  };

  const handleSendEmail = async (billId) => {
    if (!token) return;
    setEmailStatus({ sending: true, success: null, error: null });
    try {
      await emailPatientPharmacyInvoice(token, billId);
      setEmailStatus({ sending: false, success: "Tax Invoice emailed successfully!", error: null });
      setTimeout(() => setEmailStatus({ sending: false, success: null, error: null }), 4000);
    } catch (err) {
      setEmailStatus({ sending: false, success: null, error: err.message || "Failed to send email." });
    }
  };

  const handleSendConsultationEmail = async (billId) => {
    if (!token) return;
    setConsultationEmailStatus({ sending: true, success: null, error: null });
    try {
      await emailPatientConsultationReceipt(token, billId);
      setConsultationEmailStatus({ sending: false, success: "Consultation receipt emailed successfully!", error: null });
      setTimeout(() => setConsultationEmailStatus({ sending: false, success: null, error: null }), 4000);
    } catch (err) {
      setConsultationEmailStatus({ sending: false, success: null, error: err.message || "Failed to send receipt email." });
    }
  };

  const handlePrint = async () => {
    if (selectedReceipt && selectedReceipt.id && token) {
      try {
        await downloadConsultationReceiptPdf(token, selectedReceipt.id, selectedReceipt.bill_number);
        return;
      } catch (e) {
        console.warn("PDF download fallback to window.print:", e);
      }
    }
    window.print();
  };

  return (
    <div className="w-full space-y-5 font-sans">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-slate-900">
          Billing, Receipts &amp; Pharmacy Invoices
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Review verified consultation settlement receipts and itemized pharmacy medication invoices with statutory GST breakdowns
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("consultation")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${activeTab === "consultation"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          <span>Consultation Bills &amp; Receipts</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {displayConsultationBills.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pharmacy")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${activeTab === "pharmacy"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          <span>Hospital Pharmacy Invoices (12% GST)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {displayPharmacyBills.length}
          </span>
        </button>
      </div>

      {/* ======================= TAB 1: CONSULTATION BILLS ======================= */}
      {activeTab === "consultation" && (
        <div className="ent-card overflow-hidden">
          <div className="ent-card-header flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Physician Consultation Invoices &amp; Receipts
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Statutory 0% GST healthcare consultation services. Settle at front desk or review clearance receipts.
              </p>
            </div>
            <span className="ent-chip-active text-[10px]">
              {displayConsultationBills.length} Invoices
            </span>
          </div>

          {isLoadingConsultation ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-700 mx-auto mb-2"></div>
              Loading consultation billing records...
            </div>
          ) : displayConsultationBills.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No consultation bills found for your profile.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>Bill Number</th>
                    <th>Appointment Ref</th>
                    <th>Consulting Physician</th>
                    <th>Hospital &amp; Department</th>
                    <th>Status</th>
                    <th>Fee &amp; Balance</th>
                    <th>Bill Date</th>
                    <th className="text-right">Action / Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedConsultationBills.map((bill) => {
                    const billNumber = bill.bill_number;
                    const feeVal = Number(bill.fee_amount || bill.total_amount || bill.fee || 0);
                    const paidVal = Number(bill.paid_amount || (bill.status === "paid" || bill.status === "COMPLETED" ? feeVal : 0));
                    const balanceVal = Number(bill.balance_due !== undefined ? bill.balance_due : (feeVal - paidVal));
                    const statusStr = (bill.status || "pending").toLowerCase();
                    const isPaid = statusStr === "paid" || statusStr === "completed";
                    const billDate = bill.created_at ? new Date(bill.created_at).toLocaleDateString() : (bill.bill_date || "--");
                    const appointmentRef = bill.appointment_number || bill.appointment_id || "--";

                    return (
                      <tr key={bill.id}>
                        <td>
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {billNumber}
                          </span>
                          {bill.payment_method && (
                            <span className="block text-[10px] text-slate-400 font-mono uppercase">
                              Mode: {bill.payment_method}
                            </span>
                          )}
                        </td>

                        <td>
                          <span className="font-mono text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                            {appointmentRef}
                          </span>
                        </td>

                        <td className="text-xs font-semibold text-slate-900">
                          {bill.doctor_name || "Physician"}
                          {bill.doctor_specialization && (
                            <span className="block text-[10px] text-slate-400 font-normal">{bill.doctor_specialization}</span>
                          )}
                        </td>

                        <td className="text-xs text-slate-600">
                          {bill.hospital_name || "Hospital"}
                          <span className="block text-[10px] text-slate-400">{bill.department_name || bill.department || "OPD"}</span>
                        </td>

                        <td>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isPaid
                                ? "bg-emerald-100 text-emerald-800"
                                : statusStr === "partially_paid"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-orange-100 text-orange-800"
                              }`}
                          >
                            {statusStr.replace("_", " ")}
                          </span>
                        </td>

                        <td>
                          <span className="text-xs font-bold text-slate-900 block">
                            ₹{feeVal.toFixed(2)}
                          </span>
                          {balanceVal > 0 ? (
                            <span className="text-[10px] text-red-600 font-mono font-semibold">
                              Due: ₹{balanceVal.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-mono">
                              Cleared
                            </span>
                          )}
                        </td>

                        <td className="font-mono text-xs text-slate-600">
                          {billDate}
                        </td>

                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(bill)}
                            className="ent-btn-secondary text-xs"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{isPaid ? "Receipt" : "View Bill"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              <Pagination
                currentPage={consultPage}
                totalPages={consultTotalPages}
                totalRecords={consultTotalRecords}
                pageSize={consultPageSize}
                onPageChange={setConsultPage}
                onPageSizeChange={setConsultPageSize}
              />
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: PHARMACY BILLS ======================= */}
      {activeTab === "pharmacy" && (
        <div className="space-y-4">
          {isLoadingPharmacy ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-700 mx-auto mb-2"></div>
              Loading verified pharmacy bills &amp; tax invoices...
            </div>
          ) : displayPharmacyBills.length === 0 ? (
            <div className="ent-card p-8 text-center text-xs text-slate-500">
              No pharmacy bills or tax invoices recorded yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4">
                {paginatedPharmacyBills.map((pb) => {
                  const invoiceNum = pb.invoice_number || pb.bill_number;
                  const billDate = pb.bill_date || (pb.created_at ? new Date(pb.created_at).toLocaleDateString() : "--");
                  const subtotalVal = Number(pb.subtotal || 0);
                  const gstVal = Number(pb.gst_amount || 0);
                  const totalVal = Number(pb.grand_total || pb.total_payable || 0);
                  const statusStr = pb.status || "paid";
                  const isPaid = statusStr === "paid";

                  return (
                    <div key={pb.id} className="ent-card p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-xs text-slate-900 font-mono">{invoiceNum}</h3>
                            <span className="ent-chip-active text-[10px]">Statutory 12% GST Applied</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : statusStr === "partially_paid"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                            >
                              {statusStr.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Hospital: <strong>{pb.hospital_name || "Hospital Pharmacy"}</strong>
                            {pb.prescription_number && (
                              <span className="ml-2 font-mono text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                Rx: {pb.prescription_number}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="font-mono text-xs text-slate-700 block">{billDate}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {pb.payment_mode ? `Paid via ${pb.payment_mode}` : `Balance Due: ₹${Number(pb.balance_due || 0).toFixed(2)}`}
                          </span>
                        </div>
                      </div>

                      {/* Itemized Medicine Table */}
                      {pb.items && pb.items.length > 0 && (
                        <div className="w-full overflow-x-auto">
                          <table className="ent-table">
                            <thead>
                              <tr>
                                <th>Prescribed Medicine Item</th>
                                <th>Dosage / Spec</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th className="text-right">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pb.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="font-semibold text-slate-800">{item.name || item.medicine_name}</td>
                                  <td className="text-slate-600 font-mono text-[11px]">{item.dosage || item.form || "--"}</td>
                                  <td className="text-slate-800 font-mono">{item.qty || item.quantity}</td>
                                  <td className="text-slate-800 font-mono">₹{Number(item.unit_price || 0).toFixed(2)}</td>
                                  <td className="text-right font-mono font-semibold text-slate-900">
                                    ₹{Number(item.line_total || item.total_amount || 0).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Statutory 12% GST Calculation Breakdown Box */}
                      <div className="p-3.5 bg-slate-50 rounded-md border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-3">
                        <div className="space-y-0.5 text-slate-500">
                          <p className="font-medium text-slate-700">Statutory Central &amp; State GST compliant tax invoice.</p>
                          <p className="text-[10px]">HSN Chapter 30 medicaments calculated with authoritative 12% GST rate.</p>
                        </div>

                        <div className="w-full sm:w-64 space-y-1 font-mono text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Medicine Subtotal:</span>
                            <span>₹{subtotalVal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sky-800 font-medium">
                            <span>Statutory GST (12%):</span>
                            <span>+ ₹{gstVal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 text-sm font-sans">
                            <span>Total Amount:</span>
                            <span className="font-mono">₹{totalVal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPharmacyInvoice(pb)}
                          className="ent-btn-secondary text-xs"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>View Tax Invoice</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={pharmPage}
                totalPages={pharmTotalPages}
                totalRecords={pharmTotalRecords}
                pageSize={pharmPageSize}
                onPageChange={setPharmPage}
                onPageSizeChange={setPharmPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* ================= RECEIPT PREVIEW MODAL ================= */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">Physician Consultation Invoice &amp; Receipt</h3>
                  <span className="text-[10px] text-slate-500 font-mono">{selectedReceipt.bill_number}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {consultationEmailStatus.success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center space-x-1.5">
                <span>✓</span>
                <span>{consultationEmailStatus.success}</span>
              </div>
            )}
            {consultationEmailStatus.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
                {consultationEmailStatus.error}
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Institution:</span>
                <span className="font-sans font-semibold text-slate-900">{selectedReceipt.hospital_name || "HealthMesh Hospital"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Department:</span>
                <span className="font-sans text-slate-900">{selectedReceipt.department_name || selectedReceipt.department || "OPD"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Physician:</span>
                <span className="font-sans text-slate-900">Dr. {selectedReceipt.doctor_name || "Physician"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Appointment ID:</span>
                <span className="text-sky-700 font-semibold">{selectedReceipt.appointment_number || selectedReceipt.appointment_id || "--"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="text-emerald-700 font-bold uppercase">{selectedReceipt.payment_method || selectedReceipt.payment_mode || "CASH"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Status:</span>
                <span className="font-sans font-bold uppercase text-slate-900">{selectedReceipt.status || "COMPLETED"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Total Consultation Fee:</span>
                <span className="font-bold text-slate-900">₹{Number(selectedReceipt.fee_amount || selectedReceipt.total_amount || selectedReceipt.fee || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500">Amount Cleared:</span>
                <span className="text-emerald-700 font-bold">₹{Number(selectedReceipt.paid_amount || (selectedReceipt.status === 'paid' ? (selectedReceipt.total_amount || selectedReceipt.fee) : 0)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-bold font-sans">
                <span>Remaining Balance Due:</span>
                <span className="font-mono text-slate-900">₹{Number(selectedReceipt.balance_due || 0).toFixed(2)}</span>
              </div>
            </div>

            {Number(selectedReceipt.balance_due) > 0 && (
              <div className="p-3 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-800 space-y-1 font-sans">
                <div className="font-semibold flex items-center space-x-1">
                  <span>ℹ</span>
                  <span>Payment Settlement Instructions</span>
                </div>
                <p>
                  Please present this invoice at the Hospital Reception Desk to settle the outstanding balance of ₹{Number(selectedReceipt.balance_due).toFixed(2)} via Cash, UPI, or GPay.
                </p>
                {selectedReceipt.upi_id && (
                  <p className="font-mono text-[10px] text-amber-900">Hospital UPI: {selectedReceipt.upi_id}</p>
                )}
              </div>
            )}

            <p className="text-[10px] text-slate-400 text-center font-mono">
              Statutory 0% GST healthcare clinical consultation service
            </p>

            <div className="pt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="ent-btn-secondary text-xs"
              >
                Close
              </button>
              {token && selectedReceipt.id && (
                <button
                  type="button"
                  disabled={consultationEmailStatus.sending}
                  onClick={() => handleSendConsultationEmail(selectedReceipt.id)}
                  className="ent-btn-secondary text-xs flex items-center space-x-1"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{consultationEmailStatus.sending ? "Sending..." : "Email Receipt"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handlePrint}
                className="ent-btn-primary text-xs flex items-center space-x-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PHARMACY BILL / INVOICE PREVIEW MODAL ================= */}
      {selectedPharmacyBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm text-slate-900">Hospital Pharmacy Tax Invoice</h3>
                  <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    12% GST Statutory
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  Invoice #: {selectedPharmacyBill.invoice_number || selectedPharmacyBill.bill_number}
                </span>
              </div>
              <button
                onClick={() => setSelectedPharmacyBill(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {emailStatus.success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">
                ✓ {emailStatus.success}
              </div>
            )}
            {emailStatus.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                ✕ {emailStatus.error}
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Hospital & Patient metadata */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded border border-slate-200">
                <div>
                  <p className="font-bold text-slate-900">{selectedPharmacyBill.hospital_name || "Hospital Pharmacy"}</p>
                  <p className="text-[11px] text-slate-500">{selectedPharmacyBill.hospital_address || "Healthcare Facility"}</p>
                  <p className="text-[11px] text-slate-500">Phone: {selectedPharmacyBill.hospital_phone || "+91-11-2000-0000"}</p>
                  {selectedPharmacyBill.gst_number && (
                    <p className="text-[10px] font-mono text-slate-600 mt-1">GSTIN: {selectedPharmacyBill.gst_number}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-slate-500">Patient: <strong className="text-slate-900">{selectedPharmacyBill.patient_name || "Self"}</strong></p>
                  {selectedPharmacyBill.patient_phone && (
                    <p className="text-[11px] text-slate-500 font-mono">Phone: {selectedPharmacyBill.patient_phone}</p>
                  )}
                  {selectedPharmacyBill.prescription_number && (
                    <p className="text-[11px] text-sky-800 font-mono font-medium">Rx: {selectedPharmacyBill.prescription_number}</p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    Date: {selectedPharmacyBill.bill_date || (selectedPharmacyBill.created_at ? new Date(selectedPharmacyBill.created_at).toLocaleDateString() : "--")}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Medicine Item</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Taxable</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">12% GST</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(selectedPharmacyBill.items || []).map((it, i) => {
                      const qty = Number(it.qty || it.quantity || 1);
                      const unitPrice = Number(it.unit_price || 0);
                      const lineTaxable = Number(it.taxable_amount || unitPrice * qty);
                      const lineGst = Number(it.gst_amount || (lineTaxable * 0.12));
                      const lineTot = Number(it.line_total || it.total_amount || (lineTaxable + lineGst));

                      return (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-slate-800">{it.medicine_name || it.name}</span>
                            {(it.form || it.dosage || it.strength) && (
                              <span className="block text-[10px] text-slate-400">
                                {[it.form, it.dosage, it.strength].filter(Boolean).join(" • ")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">{qty}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{lineTaxable.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-sky-700">₹{lineGst.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">₹{lineTot.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals Breakdown */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1 font-mono text-xs max-w-sm ml-auto">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Subtotal:</span>
                  <span>₹{Number(selectedPharmacyBill.subtotal || 0).toFixed(2)}</span>
                </div>
                {Number(selectedPharmacyBill.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span>- ₹{Number(selectedPharmacyBill.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700 font-semibold">
                  <span>Taxable Base:</span>
                  <span>₹{Number(selectedPharmacyBill.taxable_amount || selectedPharmacyBill.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sky-800 font-semibold">
                  <span>Statutory 12% GST:</span>
                  <span>+ ₹{Number(selectedPharmacyBill.gst_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900 text-sm font-sans">
                  <span>Grand Total:</span>
                  <span className="font-mono">
                    ₹{Number(selectedPharmacyBill.grand_total || selectedPharmacyBill.total_payable || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Amount Paid:</span>
                  <span>₹{Number(selectedPharmacyBill.amount_paid || selectedPharmacyBill.total_payable || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Outstanding Balance:</span>
                  <span>₹{Number(selectedPharmacyBill.balance_due || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <div>
                {selectedPharmacyBill.id && typeof selectedPharmacyBill.id === "number" && (
                  <button
                    type="button"
                    disabled={emailStatus.sending}
                    onClick={() => handleSendEmail(selectedPharmacyBill.id)}
                    className="ent-btn-secondary text-xs flex items-center space-x-1"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>{emailStatus.sending ? "Sending Email..." : "Email Invoice"}</span>
                  </button>
                )}
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedPharmacyBill(null)}
                  className="ent-btn-secondary text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="ent-btn-primary text-xs flex items-center space-x-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Tax Invoice</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
