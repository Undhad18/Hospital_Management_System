import { useEffect, useState, useCallback } from "react";
import {
  getLabOrders,
  getLabOrderDetails,
  updateLabOrderStatus,
  collectLabSample,
  startLabAnalysis,
  cancelLabOrder,
  uploadLabReport,
  downloadLabReportFile,
  viewLabReportFile,
  recordLabPayment,
  waiveLabOrderPayment,
  refundLabPayment,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination from "../components/Pagination";

export default function LaboratoryManagement({ session }) {
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,
    requested: 0,
    sample_collected: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    urgent_stat_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [activeStatusTab, setActiveStatusTab] = useState("pending");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    setPage(1);
  }, [activeStatusTab, priorityFilter, paymentFilter, searchTerm, pageSize]);

  // Modals & Selection
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Report Upload Modal
  const [uploadModalOrder, setUploadModalOrder] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("final");
  const [uploadNotes, setUploadNotes] = useState("");

  // Payment Modals (Lesson 11.9)
  const [paymentModalOrder, setPaymentModalOrder] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Waiver Modal (Lesson 11.9)
  const [waiverModalOrder, setWaiverModalOrder] = useState(null);
  const [waiverReason, setWaiverReason] = useState("");

  // Refund Modal (Lesson 11.9)
  const [refundModalPayment, setRefundModalPayment] = useState(null);
  const [refundReason, setRefundReason] = useState("");


  const fetchOrders = useCallback(async () => {
    if (!session?.token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getLabOrders(session.token, {
        status: activeStatusTab,
        priority: priorityFilter,
        payment_status: paymentFilter,
        search: searchTerm,
        page,
        limit: pageSize,
      });
      setOrders(res.data || []);
      if (res.counts) setCounts(res.counts);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      console.error("Error loading laboratory orders:", err);
      setError(err.message || "Failed to load laboratory queue.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, activeStatusTab, priorityFilter, paymentFilter, searchTerm, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Quick Sample Collection
  async function handleCollectSample(order) {
    if (!window.confirm(`Confirm sample collection for Order #${order.order_number}?`)) return;
    try {
      setActionLoading(true);
      await collectLabSample(session.token, order.id);
      setSuccessMsg(`Sample marked as collected for Order #${order.order_number}.`);
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to mark sample as collected.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Quick Start Analysis
  async function handleStartAnalysis(order) {
    try {
      setActionLoading(true);
      await startLabAnalysis(session.token, order.id);
      setSuccessMsg(`Laboratory analysis started for Order #${order.order_number}.`);
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to start analysis.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Cancel Order Submission
  async function handleConfirmCancel(e) {
    e.preventDefault();
    if (!cancelReason.trim()) {
      alert("A non-empty cancellation reason is required.");
      return;
    }
    try {
      setActionLoading(true);
      await cancelLabOrder(session.token, cancelModalOrder.id, cancelReason.trim());
      setSuccessMsg(`Order #${cancelModalOrder.order_number} was successfully cancelled.`);
      setCancelModalOrder(null);
      setCancelReason("");
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to cancel order.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Report Upload Submission
  async function handleConfirmUploadReport(e) {
    e.preventDefault();
    if (!uploadFile) {
      alert("Please select a report file to upload.");
      return;
    }
    if (uploadFile.size === 0) {
      alert("Invalid file: Selected report file is empty (0 bytes).");
      return;
    }
    if (uploadFile.size > 15 * 1024 * 1024) {
      alert("File size exceeds the allowed limit of 15MB.");
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append("report", uploadFile);
      formData.append("status", uploadStatus);
      if (uploadNotes.trim()) {
        formData.append("notes", uploadNotes.trim());
      }

      const res = await uploadLabReport(session.token, uploadModalOrder.id, formData);
      setSuccessMsg(res.message || "Laboratory report uploaded successfully.");
      setUploadModalOrder(null);
      setUploadFile(null);
      setUploadNotes("");
      setUploadStatus("final");

      // If details modal is open for this order, refresh details
      if (selectedOrder && selectedOrder.id === uploadModalOrder.id) {
        const refreshed = await getLabOrderDetails(session.token, uploadModalOrder.id);
        setSelectedOrder(refreshed);
      }
      fetchOrders();
    } catch (err) {
      setError(err.message || "Failed to upload laboratory report.");
      alert(err.message || "Failed to upload laboratory report.");
    } finally {
      setActionLoading(false);
    }
  }

  // View full order details
  async function handleViewDetails(order) {
    try {
      const details = await getLabOrderDetails(session.token, order.id);
      setSelectedOrder(details);
    } catch (err) {
      alert(err.message || "Failed to fetch order details.");
    }
  }

  // Handle Open Payment Modal
  function handleOpenPaymentModal(order) {
    setPaymentModalOrder(order);
    setPaymentAmount(order.price ? order.price.toString() : "0");
    setPaymentMethod("cash");
    setPaymentRef("");
    setPaymentNotes("");
  }

  // Handle Confirm Payment Submission
  async function handleConfirmPayment(e) {
    e.preventDefault();
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert("Please enter a valid positive payment amount.");
      return;
    }
    try {
      setActionLoading(true);
      const res = await recordLabPayment(session.token, paymentModalOrder.id, {
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        transaction_reference: paymentRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      setSuccessMsg(res.message || "Payment recorded successfully.");
      setPaymentModalOrder(null);
      if (selectedOrder && selectedOrder.id === paymentModalOrder.id) {
        const refreshed = await getLabOrderDetails(session.token, paymentModalOrder.id);
        setSelectedOrder(refreshed);
      }
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to record payment.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Open Waiver Modal
  function handleOpenWaiverModal(order) {
    setWaiverModalOrder(order);
    setWaiverReason("");
  }

  // Handle Confirm Waiver Submission
  async function handleConfirmWaive(e) {
    e.preventDefault();
    if (!waiverReason.trim()) {
      alert("A mandatory waiver reason is required.");
      return;
    }
    try {
      setActionLoading(true);
      const res = await waiveLabOrderPayment(session.token, waiverModalOrder.id, {
        waiver_reason: waiverReason.trim(),
      });
      setSuccessMsg(res.message || "Laboratory charges waived successfully.");
      setWaiverModalOrder(null);
      setWaiverReason("");
      if (selectedOrder && selectedOrder.id === waiverModalOrder.id) {
        const refreshed = await getLabOrderDetails(session.token, waiverModalOrder.id);
        setSelectedOrder(refreshed);
      }
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to waive charges.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Open Refund Modal
  function handleOpenRefundModal(payment) {
    setRefundModalPayment(payment);
    setRefundReason("");
  }

  // Handle Confirm Refund Submission
  async function handleConfirmRefund(e) {
    e.preventDefault();
    if (!refundReason.trim()) {
      alert("A mandatory refund reason is required.");
      return;
    }
    try {
      setActionLoading(true);
      const res = await refundLabPayment(session.token, refundModalPayment.id, {
        refund_reason: refundReason.trim(),
      });
      setSuccessMsg(res.message || "Payment refunded successfully.");
      setRefundModalPayment(null);
      setRefundReason("");
      if (selectedOrder) {
        const refreshed = await getLabOrderDetails(session.token, selectedOrder.id);
        setSelectedOrder(refreshed);
      }
      fetchOrders();
    } catch (err) {
      alert(err.message || "Failed to refund payment.");
    } finally {
      setActionLoading(false);
    }
  }


  return (
    <div className="space-y-6">
      {/* Top Banner / Alerts */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Header and Live Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2.5">
            <span>Laboratory Queue &amp; Sample Desk</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              Live Terminal
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage pending sample collections, laboratory analyses, test progression, and cancellation protocols.
          </p>
        </div>

        <button
          onClick={fetchOrders}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition shadow-xs cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Operational Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pending */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Total Pending Orders</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{counts.pending}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Requires lab attention</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
        </div>

        {/* Card 2: Sample Collection Pending */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Sample Needed</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{counts.requested}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting phlebotomy/specimen</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Analysis In Progress */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">In Analysis</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{counts.in_progress}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Under test evaluation</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>

        {/* Card 4: Urgent / STAT Alerts */}
        <div className="p-4 bg-white border border-rose-200 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-rose-600 font-semibold">STAT &amp; Urgent Priority</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{counts.urgent_stat_count}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">High critical turnaround</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Workspace Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Status Navigation Tabs */}
        <div className="border-b border-slate-200 px-4 pt-3 bg-slate-50 flex flex-wrap gap-2">
          {[
            { id: "pending", label: "Active Queue", count: counts.pending },
            { id: "requested", label: "Requested", count: counts.requested },
            { id: "sample_collected", label: "Sample Collected", count: counts.sample_collected },
            { id: "in_progress", label: "In Analysis", count: counts.in_progress },
            { id: "completed", label: "Completed", count: counts.completed },
            { id: "cancelled", label: "Cancelled", count: counts.cancelled },
            { id: "all", label: "All Records", count: counts.total },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveStatusTab(tab.id);
                setPage(1);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 cursor-pointer flex items-center space-x-1.5 ${activeStatusTab === tab.id
                ? "bg-white text-sky-700 border-sky-600 shadow-xs"
                : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
                }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeStatusTab === tab.id
                  ? "bg-sky-100 text-sky-800"
                  : "bg-slate-200 text-slate-600"
                  }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Controls Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-20">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Order #, Test Name, or Patient..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-36">
              <CustomDropdown
                value={priorityFilter}
                onChange={(val) => {
                  setPriorityFilter(val);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Priorities" },
                  { value: "stat", label: "STAT Only" },
                  { value: "urgent", label: "Urgent" },
                  { value: "routine", label: "Routine" },
                ]}
                placeholder="All Priorities"
              />
            </div>

            <div className="w-36">
              <CustomDropdown
                value={paymentFilter}
                onChange={(val) => {
                  setPaymentFilter(val);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Payments" },
                  { value: "unpaid", label: "Unpaid" },
                  { value: "paid", label: "Paid" },
                  { value: "waived", label: "Waived" },
                ]}
                placeholder="All Payments"
              />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="py-3 px-4">Order / Test</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Price / Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Workflow Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <div className="inline-flex items-center space-x-2">
                      <svg className="w-5 h-5 animate-spin text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Loading laboratory orders queue...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    <p className="font-medium text-slate-600 text-sm">No laboratory orders found</p>
                    <p className="text-xs text-slate-400 mt-1">There are no orders matching your current filter criteria.</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isTerminal = ["completed", "cancelled"].includes(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition">
                      {/* Order / Test */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center space-x-1.5">
                          <span>{order.test_name}</span>
                          {order.master_test?.test_code && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">
                              {order.master_test.test_code}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-sky-700 mt-0.5">
                          {order.order_number}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(order.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Patient */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{order.patient?.full_name || "Unknown Patient"}</div>
                        <div className="text-[11px] text-slate-400">{order.patient?.email}</div>
                        {order.appointment && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Apt #{order.appointment.appointment_number}
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        {order.priority === "stat" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 uppercase tracking-wide">
                            STAT
                          </span>
                        )}
                        {order.priority === "urgent" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">
                            Urgent
                          </span>
                        )}
                        {order.priority === "routine" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            Routine
                          </span>
                        )}
                      </td>

                      {/* Price / Payment */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">₹{order.price.toFixed(2)}</div>
                        <div className="mt-0.5">
                          {order.payment_status === "paid" && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Paid
                            </span>
                          )}
                          {order.payment_status === "unpaid" && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                              Unpaid
                            </span>
                          )}
                          {order.payment_status === "waived" && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              Waived
                            </span>
                          )}
                          {order.payment_status === "refunded" && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                              Refunded
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {order.status === "requested" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mr-1.5"></span>
                            Sample Needed
                          </span>
                        )}
                        {order.status === "sample_collected" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5"></span>
                            Sample Collected
                          </span>
                        )}
                        {order.status === "in_progress" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
                            Analyzing
                          </span>
                        )}
                        {order.status === "completed" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Completed
                          </span>
                        )}
                        {order.status === "cancelled" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Cancelled
                          </span>
                        )}
                      </td>

                      {/* Workflow Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          {/* Collect Payment (Lesson 11.9) */}
                          {order.payment_status === "unpaid" && order.status !== "cancelled" && (
                            <button
                              onClick={() => handleOpenPaymentModal(order)}
                              disabled={actionLoading}
                              className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition cursor-pointer"
                              title="Collect Payment"
                            >
                              Collect ₹{order.price.toFixed(2)}
                            </button>
                          )}

                          {/* Next Transition Step */}
                          {order.status === "requested" && (
                            <button
                              onClick={() => handleCollectSample(order)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[11px] font-medium bg-sky-600 text-white rounded hover:bg-sky-700 transition cursor-pointer"
                            >
                              Collect Sample
                            </button>
                          )}
                          {order.status === "sample_collected" && (
                            <button
                              onClick={() => handleStartAnalysis(order)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[11px] font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 transition cursor-pointer"
                            >
                              Start Analysis
                            </button>
                          )}

                          {/* Upload Report Trigger */}
                          {order.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                setUploadModalOrder(order);
                                setUploadFile(null);
                                setUploadNotes("");
                                setUploadStatus("final");
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium bg-teal-600 text-white rounded hover:bg-teal-700 transition cursor-pointer"
                            >
                              Upload Report
                            </button>
                          )}

                          {/* Cancellation Trigger */}
                          {!isTerminal && (
                            <button
                              onClick={() => {
                                setCancelModalOrder(order);
                                setCancelReason("");
                              }}
                              className="px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Cancel Order"
                            >
                              Cancel
                            </button>
                          )}

                          {/* Details Button */}
                          <button
                            onClick={() => handleViewDetails(order)}
                            className="px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages || 1}
          totalRecords={pagination.total || 0}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      </div>

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">
                Cancel Laboratory Order #{cancelModalOrder.order_number}
              </h3>
              <button
                onClick={() => setCancelModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Please specify a mandatory cancellation reason. This protocol will be permanently recorded in the audit trail.
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Specimen hemolyzed, patient not fasted, physician cancelled..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !cancelReason.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionLoading ? "Cancelling..." : "Confirm Order Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Laboratory Report Modal */}
      {uploadModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Upload Laboratory Report</h3>
                <p className="text-xs text-slate-500 font-mono">Order #{uploadModalOrder.order_number}</p>
              </div>
              <button
                onClick={() => setUploadModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmUploadReport} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Report Document (PDF, PNG, JPG, WebP) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer border border-slate-300 rounded-md p-1.5"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Report Status
                </label>
                <CustomDropdown
                  value={uploadStatus}
                  onChange={(val) => setUploadStatus(val)}
                  options={[
                    { value: "final", label: "Final Report (Completes Order)" },
                    { value: "preliminary", label: "Preliminary / Interim Findings" },
                    { value: "amended", label: "Amended / Addendum Report" },
                  ]}
                  placeholder="Select Report Status"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Clinical / Technician Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Normal ranges observed, verified by Chief Pathologist..."
                  className="w-full text-xs p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOrder(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !uploadFile}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading ? "Uploading Report..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Slide-over / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Laboratory Order Details</h3>
                <p className="text-xs font-mono text-sky-700">{selectedOrder.order_number}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Content (cleanly hidden scrollbar fitting inside block) */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Test Name</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedOrder.test_name}</p>
                  <p className="text-slate-500 text-[11px]">{selectedOrder.test_category}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Status &amp; Priority</p>
                  <p className="font-semibold text-slate-900 mt-0.5 uppercase">{selectedOrder.status.replace("_", " ")}</p>
                  <p className="text-slate-500 text-[11px] uppercase">Priority: {selectedOrder.priority}</p>
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Patient Information</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedOrder.patient?.full_name}</p>
                  <p className="text-slate-500 text-[11px]">{selectedOrder.patient?.email}</p>
                  {selectedOrder.patient?.phone && <p className="text-slate-500 text-[11px]">{selectedOrder.patient.phone}</p>}
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Ordering Doctor</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedOrder.doctor?.full_name || "Assigned Medical Officer"}</p>
                  <p className="text-slate-500 text-[11px]">{selectedOrder.hospital?.name}</p>
                </div>
              </div>

              {/* Payment & Billing Section (Lesson 11.9) */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-500">
                      Payment &amp; Billing
                    </p>
                    <p className="text-slate-900 font-bold text-sm mt-0.5">
                      ₹{parseFloat(selectedOrder.price || 0).toFixed(2)}
                      <span className={`ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase ${selectedOrder.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" :
                        selectedOrder.payment_status === "waived" ? "bg-purple-100 text-purple-800" :
                          selectedOrder.payment_status === "refunded" ? "bg-slate-200 text-slate-800" :
                            "bg-rose-100 text-rose-800"
                        }`}>
                        {selectedOrder.payment_status}
                      </span>
                    </p>
                  </div>
                  {selectedOrder.payment_status === "unpaid" && selectedOrder.status !== "cancelled" && (
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleOpenPaymentModal(selectedOrder)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition cursor-pointer"
                      >
                        Collect Payment
                      </button>
                      <button
                        onClick={() => handleOpenWaiverModal(selectedOrder)}
                        className="px-2 py-1 text-[11px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded transition cursor-pointer"
                      >
                        Waive Fee
                      </button>
                    </div>
                  )}
                </div>

                {/* Payment Receipts List */}
                {selectedOrder.payments && selectedOrder.payments.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Payment Receipts ({selectedOrder.payments.length})</p>
                    {selectedOrder.payments.map((p) => (
                      <div key={p.id} className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between text-[11px]">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-slate-800">{p.receipt_number}</span>
                            <span className="font-semibold text-emerald-700">₹{parseFloat(p.amount).toFixed(2)}</span>
                            <span className="uppercase text-[9px] bg-slate-100 px-1 py-0.2 rounded font-mono text-slate-600">
                              {p.payment_method}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${p.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}>
                              {p.payment_status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(p.created_at).toLocaleString()} • Collected by {p.collected_by_name || "Staff"}
                            {p.transaction_reference && <span> • Ref: <span className="font-mono">{p.transaction_reference}</span></span>}
                          </div>
                          {p.notes && <div className="text-[10px] text-slate-500 italic mt-0.5">{p.notes}</div>}
                        </div>

                        {p.payment_status === "paid" && (
                          <button
                            onClick={() => handleOpenRefundModal(p)}
                            className="px-2 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition cursor-pointer"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic py-1">No payment receipts recorded yet.</p>
                )}
              </div>

              {/* Attached Reports Section */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">
                    Attached Reports ({selectedOrder.reports?.length || 0})
                  </p>
                  {selectedOrder.status !== "cancelled" && (
                    <button
                      onClick={() => {
                        setUploadModalOrder(selectedOrder);
                        setUploadFile(null);
                        setUploadNotes("");
                        setUploadStatus("final");
                      }}
                      className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold cursor-pointer"
                    >
                      + Upload New Version
                    </button>
                  )}
                </div>

                {selectedOrder.reports && selectedOrder.reports.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {selectedOrder.reports.map((rpt) => (
                      <div key={rpt.id} className="p-2.5 bg-white rounded border border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-1.5 font-medium text-slate-900">
                            <span>{rpt.report_number}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                              v{rpt.version}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${rpt.status === 'final' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                              {rpt.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {rpt.original_filename} ({(rpt.file_size / 1024).toFixed(1)} KB) • {new Date(rpt.created_at).toLocaleDateString()}
                          </div>
                          {rpt.uploader_name && (
                            <div className="text-[10px] text-slate-400">Uploaded by: {rpt.uploader_name}</div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => viewLabReportFile(session.token, rpt.id)}
                            className="px-2 py-1 text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={() => downloadLabReportFile(session.token, rpt.id, rpt.original_filename)}
                            className="px-2 py-1 text-[11px] font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded cursor-pointer"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic py-1">No report documents attached yet.</p>
                )}
              </div>

              {/* Lifecycle Timestamps */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Lifecycle Audit Timestamps</p>
                <div className="flex justify-between text-slate-600">
                  <span>Requested At:</span>
                  <span className="font-mono">{new Date(selectedOrder.created_at).toLocaleString()}</span>
                </div>
                {selectedOrder.sample_collected_at && (
                  <div className="flex justify-between text-slate-600">
                    <span>Sample Collected:</span>
                    <span className="font-mono">{new Date(selectedOrder.sample_collected_at).toLocaleString()}</span>
                  </div>
                )}
                {selectedOrder.completed_at && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Completed At:</span>
                    <span className="font-mono">{new Date(selectedOrder.completed_at).toLocaleString()}</span>
                  </div>
                )}
                {selectedOrder.cancelled_at && (
                  <div className="flex justify-between text-rose-700 font-medium">
                    <span>Cancelled At:</span>
                    <span className="font-mono">{new Date(selectedOrder.cancelled_at).toLocaleString()}</span>
                  </div>
                )}
                {selectedOrder.cancellation_reason && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-rose-800 text-[11px]">
                    <strong>Reason:</strong> {selectedOrder.cancellation_reason}
                  </div>
                )}
              </div>

              {/* Clinical Notes */}
              {selectedOrder.clinical_notes && (
                <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200 text-xs">
                  <p className="text-[10px] font-semibold uppercase text-amber-800 mb-1">Clinical Notes</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{selectedOrder.clinical_notes}</p>
                </div>
              )}

            </div>

            {/* Modal Fixed Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-md text-xs font-semibold hover:bg-slate-900 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Collection Modal (Lesson 11.9) */}
      {paymentModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Collect Laboratory Payment</h3>
                <p className="text-xs text-slate-500 font-mono">Order #{paymentModalOrder.order_number}</p>
              </div>
              <button
                onClick={() => setPaymentModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Amount to Collect (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <CustomDropdown
                  value={paymentMethod}
                  onChange={(val) => setPaymentMethod(val)}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "upi", label: "UPI / QR Code" },
                    { value: "card", label: "Debit / Credit Card" },
                  ]}
                  placeholder="Select Payment Method"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Transaction Reference (Optional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UPI Ref / Approval Code / Receipt Ref..."
                  className="w-full text-xs p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Received at desk, billing clearance issued..."
                  className="w-full text-xs p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalOrder(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading ? "Recording..." : `Confirm Payment (₹${parseFloat(paymentAmount || 0).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fee Waiver Modal (Lesson 11.9) */}
      {waiverModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Waive Laboratory Charges</h3>
                <p className="text-xs text-slate-500 font-mono">Order #{waiverModalOrder.order_number} (₹{parseFloat(waiverModalOrder.price || 0).toFixed(2)})</p>
              </div>
              <button
                onClick={() => setWaiverModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Fee waivers exempt the patient from paying laboratory test charges. A non-empty waiver reason is mandatory and will be recorded in the audit trail.
            </p>

            <form onSubmit={handleConfirmWaive} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Waiver Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={waiverReason}
                  onChange={(e) => setWaiverReason(e.target.value)}
                  placeholder="e.g. BPL beneficiary, Government scheme, Hospital executive approval..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWaiverModalOrder(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !waiverReason.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {actionLoading ? "Waiving..." : "Confirm Fee Waiver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Refund Modal (Lesson 11.9) */}
      {refundModalPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Refund Payment Receipt</h3>
                <p className="text-xs text-slate-500 font-mono">Receipt #{refundModalPayment.receipt_number} (₹{parseFloat(refundModalPayment.amount || 0).toFixed(2)})</p>
              </div>
              <button
                onClick={() => setRefundModalPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Refunding this payment will reverse the receipt, update the order balance, and require an audit reason.
            </p>

            <form onSubmit={handleConfirmRefund} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Refund Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Duplicate charge, patient requested cancellation, billing error..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRefundModalPayment(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !refundReason.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionLoading ? "Processing Refund..." : `Confirm Refund (₹${parseFloat(refundModalPayment.amount || 0).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

