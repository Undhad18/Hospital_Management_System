import { useState, useEffect, useCallback } from "react";
import {
  getEligibleConsultationAppointments,
  getConsultationFeePreview,
  generateConsultationBill,
  getConsultationBills,
  getConsultationBillDetails,
  recordConsultationPayment,
  emailConsultationReceipt,
  downloadConsultationReceiptPdf,
} from "../services/api";
import Pagination, { usePagination } from "../components/Pagination";

export default function ConsultationBillingDesk({ session }) {
  const token = session?.token;

  const [activeTab, setActiveTab] = useState("queue"); // 'queue' | 'bills'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Queue Tab State
  const [eligibleAppointments, setEligibleAppointments] = useState([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("all"); // 'all' | 'unbilled' | 'pending_payment' | 'paid'

  // Bill Generation Modal State
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [feePreview, setFeePreview] = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [genForm, setGenForm] = useState({ discount: 0, payment_method: "cash", notes: "" });
  const [genLoading, setGenLoading] = useState(false);

  // Bills List Tab State
  const [billsList, setBillsList] = useState([]);
  const [billSearch, setBillSearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("all"); // 'all' | 'pending' | 'paid' | 'partially_paid'

  // Payment Collection Modal State
  const [paymentBill, setPaymentBill] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "cash", transaction_reference: "", notes: "" });
  const [payLoading, setPayLoading] = useState(false);

  // Receipt Preview Modal State
  const [viewReceipt, setViewReceipt] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const {
    currentPage: aptPage,
    setCurrentPage: setAptPage,
    pageSize: aptPageSize,
    setPageSize: setAptPageSize,
    totalPages: aptTotalPages,
    totalRecords: aptTotalRecords,
    paginatedItems: paginatedAppointments,
    resetPage: resetAptPage,
  } = usePagination(eligibleAppointments, 25);

  const {
    currentPage: billPage,
    setCurrentPage: setBillPage,
    pageSize: billPageSize,
    setPageSize: setBillPageSize,
    totalPages: billTotalPages,
    totalRecords: billTotalRecords,
    paginatedItems: paginatedBills,
    resetPage: resetBillPage,
  } = usePagination(billsList, 25);

  useEffect(() => {
    resetAptPage();
  }, [queueSearch, queueFilter, resetAptPage]);

  useEffect(() => {
    resetBillPage();
  }, [billSearch, billStatusFilter, resetBillPage]);

  // 1. Fetch Eligible Appointments Queue
  const fetchQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const params = {};
      if (queueSearch.trim()) params.search = queueSearch.trim();
      if (queueFilter !== "all") params.status = queueFilter;
      const data = await getEligibleConsultationAppointments(token, params);
      setEligibleAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMsg(err.message || "Failed to load eligible appointments.");
    } finally {
      setLoading(false);
    }
  }, [token, queueSearch, queueFilter]);

  // 2. Fetch Consultation Bills
  const fetchBills = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const params = {};
      if (billSearch.trim()) params.search = billSearch.trim();
      if (billStatusFilter !== "all") params.status = billStatusFilter;
      const res = await getConsultationBills(token, params);
      setBillsList(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setErrorMsg(err.message || "Failed to load consultation bills.");
    } finally {
      setLoading(false);
    }
  }, [token, billSearch, billStatusFilter]);

  useEffect(() => {
    if (activeTab === "queue") {
      fetchQueue();
    } else {
      fetchBills();
    }
  }, [activeTab, fetchQueue, fetchBills]);

  // Handle Open Bill Generation Modal
  const handleOpenGenerateModal = async (apt) => {
    setSelectedAppointment(apt);
    setFeeLoading(true);
    setFeePreview(null);
    setGenForm({ discount: 0, payment_method: apt.payment_method || "cash", notes: "" });
    try {
      const preview = await getConsultationFeePreview(token, apt.appointment_id);
      setFeePreview(preview);
    } catch (err) {
      setErrorMsg(err.message || "Failed to retrieve authoritative fee snapshot.");
    } finally {
      setFeeLoading(false);
    }
  };

  // Submit Bill Generation
  const handleGenerateBillSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAppointment) return;
    setGenLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const payload = {
        appointment_id: selectedAppointment.appointment_id,
        discount: Number(genForm.discount) || 0,
        payment_method: genForm.payment_method,
        notes: genForm.notes,
        idempotency_key: `CBILL-GEN-${selectedAppointment.appointment_id}-${Date.now()}`,
      };
      const res = await generateConsultationBill(token, payload);
      setSuccessMsg(res.message || "Consultation bill generated successfully.");
      setSelectedAppointment(null);
      fetchQueue();
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate bill.");
    } finally {
      setGenLoading(false);
    }
  };

  // Handle Open Payment Collection Modal
  const handleOpenPaymentModal = (bill) => {
    setPaymentBill(bill);
    setPayForm({
      amount: Number(bill.balance_due || bill.total_amount).toFixed(2),
      payment_method: bill.payment_method || "cash",
      transaction_reference: "",
      notes: "",
    });
  };

  // Submit Payment Collection
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentBill) return;
    setPayLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const payload = {
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        transaction_reference: payForm.transaction_reference,
        notes: payForm.notes,
      };
      const billId = paymentBill.id;
      const res = await recordConsultationPayment(token, billId, payload);
      setSuccessMsg(res.message || "Payment collected successfully.");
      setPaymentBill(null);
      fetchBills();
      // Requirement 2.1: Open the official receipt modal after successful payment
      await handleOpenReceiptModal({ id: billId });
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to record payment.");
    } finally {
      setPayLoading(false);
    }
  };

  // Handle View Receipt Modal
  const handleOpenReceiptModal = async (bill) => {
    try {
      const details = await getConsultationBillDetails(token, bill.id);
      setViewReceipt(details);
      setEmailInput(details.patient_email || "");
    } catch (err) {
      setErrorMsg(err.message || "Failed to load receipt details.");
    }
  };

  // Requirement 2.3: Print Receipt – PDF Download
  const handlePrintReceipt = async () => {
    if (!viewReceipt || printLoading) return;
    setPrintLoading(true);
    try {
      const activeReceipt = viewReceipt.payments && viewReceipt.payments.length > 0
        ? viewReceipt.payments[0].receipt_number
        : viewReceipt.bill_number;
      await downloadConsultationReceiptPdf(token, viewReceipt.id, activeReceipt);
    } catch (err) {
      alert(err.message || "Failed to download receipt PDF.");
    } finally {
      setPrintLoading(false);
    }
  };

  // Requirement 3: Dispatch Receipt Email with Attached PDF
  const handleEmailReceiptSubmit = async () => {
    if (!viewReceipt || emailLoading) return;
    const targetEmail = (emailInput || "").trim();
    if (!targetEmail || !targetEmail.includes("@") || !targetEmail.includes(".")) {
      alert("Please enter a valid recipient email address.");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await emailConsultationReceipt(token, viewReceipt.id, targetEmail);
      alert(res.message || `Receipt email dispatched successfully to ${targetEmail}.`);
    } catch (err) {
      alert(err.message || "Failed to dispatch receipt email.");
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="w-full space-y-5 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-slate-900">Consultation Billing &amp; Cash Counter</h1>
            <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
              Statutory 0% GST Exemption
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage physician consultation fees, invoice generation, cash collection, UPI reference verification, and receipt clearance.
          </p>
        </div>

        <button
          onClick={() => (activeTab === "queue" ? fetchQueue() : fetchBills())}
          className="ent-btn-secondary text-xs flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Flash Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="font-bold">✕</button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
          <span>⚠ {errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="font-bold">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${activeTab === "queue"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          <span>Appointment Queue &amp; Fee Generation</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {eligibleAppointments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bills")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${activeTab === "bills"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
        >
          <span>Consultation Invoices &amp; Cash Counter</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {billsList.length}
          </span>
        </button>
      </div>

      {/* ======================= TAB 1: QUEUE & GENERATION ======================= */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search patient name, phone, appointment #, doctor..."
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={queueFilter}
                onChange={(e) => setQueueFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none"
              >
                <option value="all">All Appointments</option>
                <option value="unbilled">Unbilled Only</option>
                <option value="pending_payment">Pending Payment</option>
                <option value="paid">Fully Settled</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="ent-card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-700 mx-auto mb-2"></div>
                Loading appointment billing queue...
              </div>
            ) : eligibleAppointments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No eligible appointments found.
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="ent-table">
                  <thead>
                    <tr>
                      <th>Appointment Ref</th>
                      <th>Patient Name &amp; Contact</th>
                      <th>Consulting Doctor &amp; Dept</th>
                      <th>Date &amp; Time</th>
                      <th>Authoritative Fee</th>
                      <th>Bill Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAppointments.map((apt) => {
                      const hasBill = Boolean(apt.existing_bill_id);
                      const isPaid = apt.existing_bill_status === "paid";
                      return (
                        <tr key={apt.appointment_id}>
                          <td>
                            <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                              {apt.appointment_number}
                            </span>
                            <span className="block text-[10px] text-slate-400 capitalize">
                              {apt.appointment_type?.replace("_", " ")}
                            </span>
                          </td>

                          <td>
                            <span className="font-semibold text-slate-900 block text-xs">
                              {apt.patient_name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {apt.patient_phone || apt.patient_email || "--"}
                            </span>
                          </td>

                          <td>
                            <span className="font-semibold text-slate-800 block text-xs">
                              Dr. {apt.doctor_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {apt.department_name || apt.doctor_specialization || "Clinical OPD"}
                            </span>
                          </td>

                          <td className="font-mono text-xs text-slate-600">
                            {apt.appointment_date}
                            <span className="block text-[10px] text-slate-400">{apt.appointment_time}</span>
                          </td>

                          <td>
                            <span className="font-bold text-slate-900 font-mono text-xs block">
                              ₹{Number(apt.authoritative_fee).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">0% GST</span>
                          </td>

                          <td>
                            {hasBill ? (
                              <div className="space-y-0.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${isPaid
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-orange-100 text-orange-800"
                                    }`}
                                >
                                  {apt.existing_bill_status}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 block">
                                  {apt.existing_bill_number}
                                </span>
                              </div>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                Unbilled
                              </span>
                            )}
                          </td>

                          <td className="text-right">
                            {hasBill ? (
                              <button
                                type="button"
                                onClick={() => handleOpenReceiptModal({ id: apt.existing_bill_id })}
                                className="ent-btn-secondary text-xs"
                              >
                                View Bill
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenGenerateModal(apt)}
                                className="ent-btn-primary text-xs"
                              >
                                Generate Bill
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <Pagination
                  currentPage={aptPage}
                  totalPages={aptTotalPages}
                  totalRecords={aptTotalRecords}
                  pageSize={aptPageSize}
                  onPageChange={setAptPage}
                  onPageSizeChange={setAptPageSize}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= TAB 2: INVOICES & CASH COUNTER ======================= */}
      {activeTab === "bills" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search invoice #, appointment #, patient name, doctor..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={billStatusFilter}
                onChange={(e) => setBillStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none"
              >
                <option value="all">All Invoices</option>
                <option value="pending">Pending Payment</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid &amp; Cleared</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="ent-card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-700 mx-auto mb-2"></div>
                Loading consultation invoices...
              </div>
            ) : billsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No consultation bills found.
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="ent-table">
                  <thead>
                    <tr>
                      <th>Bill Number</th>
                      <th>Appointment</th>
                      <th>Patient Name</th>
                      <th>Consulting Doctor</th>
                      <th>Fee Breakdown</th>
                      <th>Settlement Status</th>
                      <th className="text-right">Action / Counter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedBills.map((bill) => {
                      const totalVal = Number(bill.total_amount || bill.fee_amount || 0);
                      const paidVal = Number(bill.paid_amount || 0);
                      const balanceVal = Number(bill.balance_due || 0);
                      const isPaid = bill.status === "paid";
                      return (
                        <tr key={bill.id}>
                          <td>
                            <span className="font-mono text-xs font-bold text-slate-900 block">
                              {bill.bill_number}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 uppercase">
                              Mode: {bill.payment_method || "CASH"}
                            </span>
                          </td>

                          <td>
                            <span className="font-mono text-xs text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                              {bill.appointment_number}
                            </span>
                          </td>

                          <td>
                            <span className="font-semibold text-slate-900 block text-xs">
                              {bill.patient_name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {bill.patient_phone || bill.patient_email || "--"}
                            </span>
                          </td>

                          <td>
                            <span className="font-semibold text-slate-800 block text-xs">
                              Dr. {bill.doctor_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {bill.department_name || "OPD"}
                            </span>
                          </td>

                          <td>
                            <div className="font-mono text-xs space-y-0.5">
                              <span className="font-bold text-slate-900 block">
                                Total: ₹{totalVal.toFixed(2)}
                              </span>
                              <span className="text-emerald-700 text-[10px] block">
                                Paid: ₹{paidVal.toFixed(2)}
                              </span>
                              {balanceVal > 0 && (
                                <span className="text-red-600 font-semibold text-[10px] block">
                                  Due: ₹{balanceVal.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>

                          <td>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : bill.status === "partially_paid"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-orange-100 text-orange-800"
                                }`}
                            >
                              {bill.status}
                            </span>
                          </td>

                          <td className="text-right space-x-1.5">
                            {!isPaid && balanceVal > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenPaymentModal(bill)}
                                className="ent-btn-primary text-xs"
                              >
                                Collect Cash / Pay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenReceiptModal(bill)}
                              className="ent-btn-secondary text-xs"
                            >
                              Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <Pagination
                  currentPage={billPage}
                  totalPages={billTotalPages}
                  totalRecords={billTotalRecords}
                  pageSize={billPageSize}
                  onPageChange={setBillPage}
                  onPageSizeChange={setBillPageSize}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= BILL GENERATION MODAL ================= */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Generate Consultation Bill</h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  Apt #{selectedAppointment.appointment_number}
                </span>
              </div>
              <button onClick={() => setSelectedAppointment(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {feeLoading ? (
              <div className="p-6 text-center text-xs text-slate-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-700 mx-auto mb-2"></div>
                Checking authoritative doctor fee...
              </div>
            ) : feePreview ? (
              <form onSubmit={handleGenerateBillSubmit} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between font-sans"><span className="text-slate-500">Patient:</span> <span className="font-semibold text-slate-900">{feePreview.patient_name}</span></div>
                  <div className="flex justify-between font-sans"><span className="text-slate-500">Doctor:</span> <span className="font-semibold text-slate-900">Dr. {feePreview.doctor_name}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-700">
                    <span>Base Consultation Fee:</span>
                    <span className="font-bold text-slate-900">₹{feePreview.authoritative_fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Statutory GST:</span>
                    <span>₹0.00 (0% Exemption)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max={feePreview.authoritative_fee}
                    value={genForm.discount}
                    onChange={(e) => setGenForm({ ...genForm, discount: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={genForm.payment_method}
                    onChange={(e) => setGenForm({ ...genForm, payment_method: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none"
                  >
                    <option value="cash">Cash (Counter Collection)</option>
                    <option value="upi">UPI / GPay / QR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Instructions</label>
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={genForm.notes}
                    onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none"
                  />
                </div>

                <div className="p-2 bg-sky-50 rounded border border-sky-100 flex justify-between items-center text-xs">
                  <span className="font-semibold text-sky-900">Total Payable Snapshot:</span>
                  <span className="font-bold font-mono text-sky-900 text-sm">
                    ₹{Math.max(0, feePreview.authoritative_fee - (Number(genForm.discount) || 0)).toFixed(2)}
                  </span>
                </div>

                <div className="pt-2 flex justify-end space-x-2">
                  <button type="button" onClick={() => setSelectedAppointment(null)} className="ent-btn-secondary text-xs">Cancel</button>
                  <button type="submit" disabled={genLoading} className="ent-btn-primary text-xs">
                    {genLoading ? "Generating..." : "Confirm & Generate Bill"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* ================= PAYMENT COLLECTION MODAL ================= */}
      {paymentBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Record Consultation Payment</h3>
                <span className="text-[11px] text-slate-500 font-mono">Invoice #{paymentBill.bill_number}</span>
              </div>
              <button onClick={() => setPaymentBill(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between font-sans"><span className="text-slate-500">Patient:</span> <span className="font-semibold text-slate-900">{paymentBill.patient_name}</span></div>
                <div className="flex justify-between font-sans"><span className="text-slate-500">Doctor:</span> <span className="font-semibold text-slate-900">Dr. {paymentBill.doctor_name}</span></div>
                <div className="flex justify-between text-slate-700 border-t border-slate-200 pt-1">
                  <span>Total Amount:</span>
                  <span className="font-bold text-slate-900">₹{Number(paymentBill.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Balance Due:</span>
                  <span>₹{Number(paymentBill.balance_due).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none"
                >
                  <option value="cash">Cash (Manual Collection at Desk)</option>
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="gpay">Google Pay (Direct Transfer)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount to Record (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentBill.balance_due}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                  required
                />
              </div>

              {payForm.payment_method !== "cash" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UPI / Gateway Transaction Reference ID *</label>
                  <input
                    type="text"
                    placeholder="e.g. UPI/20261102/10928374 or Bank UTR"
                    value={payForm.transaction_reference}
                    onChange={(e) => setPayForm({ ...payForm, transaction_reference: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reception Notes</label>
                <input
                  type="text"
                  placeholder="Optional desk notes"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button type="button" onClick={() => setPaymentBill(null)} className="ent-btn-secondary text-xs">Cancel</button>
                <button type="submit" disabled={payLoading} className="ent-btn-primary text-xs">
                  {payLoading ? "Processing..." : "Confirm & Issue Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= RECEIPT VIEW & PRINT MODAL ================= */}
      {viewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">✓</div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Physician Consultation Invoice &amp; Receipt</h3>
                  <span className="text-[11px] text-slate-500 font-mono">Invoice #{viewReceipt.bill_number}</span>
                </div>
              </div>
              <button onClick={() => setViewReceipt(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Institution:</span> <span className="font-sans font-semibold text-slate-900">{viewReceipt.hospital_name}</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Patient Name:</span> <span className="font-sans font-semibold text-slate-900">{viewReceipt.patient_name}</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Doctor / Dept:</span> <span className="font-sans text-slate-900">Dr. {viewReceipt.doctor_name} ({viewReceipt.department_name || "OPD"})</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Appointment Reference:</span> <span className="text-sky-800 font-bold">{viewReceipt.appointment_number}</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Consultation Fee Snapshot:</span> <span className="font-bold text-slate-900">₹{Number(viewReceipt.fee_amount).toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Statutory GST (0%):</span> <span className="text-slate-500">₹0.00</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Total Amount:</span> <span className="font-bold text-sky-800">₹{Number(viewReceipt.total_amount).toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5"><span className="text-slate-500">Paid Amount:</span> <span className="font-bold text-emerald-700">₹{Number(viewReceipt.paid_amount).toFixed(2)}</span></div>
              <div className="flex justify-between pt-1 text-sm font-bold font-sans">
                <span>Balance Due:</span>
                <span className="font-mono text-slate-900">₹{Number(viewReceipt.balance_due).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Receipts History */}
            {viewReceipt.payments && viewReceipt.payments.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider block">Official Receipt History</span>
                <div className="space-y-1">
                  {viewReceipt.payments.map((p) => (
                    <div key={p.id} className="p-2 bg-slate-50 rounded border border-slate-200 flex justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-slate-900 block">{p.receipt_number}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{p.payment_method} {p.transaction_reference ? `| ${p.transaction_reference}` : ""}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 block">₹{Number(p.amount).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email Dispatch Action */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
              <span className="text-[11px] font-semibold text-slate-700 block">Dispatch Receipt Email</span>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Patient email address"
                  className="flex-1 px-3 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={emailLoading}
                  onClick={handleEmailReceiptSubmit}
                  className="ent-btn-secondary text-xs"
                >
                  {emailLoading ? "Sending..." : "Send Receipt Email"}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setViewReceipt(null)}
                className="ent-btn-secondary text-xs"
              >
                Close
              </button>
              <button
                type="button"
                disabled={printLoading}
                onClick={handlePrintReceipt}
                className="ent-btn-primary text-xs"
              >
                {printLoading ? "Downloading..." : "Print Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

