import React, { useState, useEffect, useCallback } from "react";
import {
  getPharmacyDashboardSummary,
  getPharmacyTransactions,
  getPharmacyTransactionDetail,
  getPharmacyPurchases,
  getPharmacyDispensationsReport,
  getPharmacyRefundsReport,
  getPharmacyStockMovementsReport,
} from "../services/api";
import Pagination from "../components/Pagination";

export default function PharmacyReports({ session }) {
  const token = session?.token;

  // Active view tab: "timeline" | "purchases" | "dispensations" | "refunds" | "stock"
  const [activeView, setActiveView] = useState("timeline");

  // Summary KPI states
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // List data states
  const [transactions, setTransactions] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [dispensations, setDispensations] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [dispensingStatusFilter, setDispensingStatusFilter] = useState("all");

  // Detail Modal / Drawer
  const [selectedTx, setSelectedTx] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [activeView, startDate, endDate, typeFilter, paymentMethodFilter, paymentStatusFilter, dispensingStatusFilter, limit]);

  // Load Dashboard Summary Metrics
  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      setSummaryLoading(true);
      const res = await getPharmacyDashboardSummary(token, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (res.success && res.data) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.warn("Failed to load summary KPIs:", err.message);
    } finally {
      setSummaryLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Load active table data based on active view and filters
  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        search: debouncedSearch || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      if (activeView === "timeline") {
        if (typeFilter !== "all") params.type = typeFilter;
        if (paymentMethodFilter !== "all") params.paymentMethod = paymentMethodFilter;
        if (paymentStatusFilter !== "all") params.paymentStatus = paymentStatusFilter;
        if (dispensingStatusFilter !== "all") params.dispensingStatus = dispensingStatusFilter;

        const res = await getPharmacyTransactions(token, params);
        if (res.success) {
          setTransactions(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } else if (activeView === "purchases") {
        const res = await getPharmacyPurchases(token, params);
        if (res.success) {
          setPurchases(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } else if (activeView === "dispensations") {
        if (dispensingStatusFilter !== "all") params.status = dispensingStatusFilter;
        const res = await getPharmacyDispensationsReport(token, params);
        if (res.success) {
          setDispensations(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } else if (activeView === "refunds") {
        const res = await getPharmacyRefundsReport(token, params);
        if (res.success) {
          setRefunds(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      } else if (activeView === "stock") {
        const res = await getPharmacyStockMovementsReport(token, params);
        if (res.success) {
          setStockMovements(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      }
    } catch (err) {
      console.error("Load report data error:", err);
      setError(err.message || "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, [
    token,
    activeView,
    page,
    limit,
    debouncedSearch,
    startDate,
    endDate,
    typeFilter,
    paymentMethodFilter,
    paymentStatusFilter,
    dispensingStatusFilter,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load Deep Detail
  const handleOpenDetail = async (type, id) => {
    if (!token || !type || !id) return;
    setSelectedTx({ type, id });
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const res = await getPharmacyTransactionDetail(token, type, id);
      if (res.success && res.data) {
        setDetailData(res.data);
      } else {
        setDetailError("Transaction details could not be found.");
      }
    } catch (err) {
      setDetailError(err.message || "Failed to load transaction details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTx(null);
    setDetailData(null);
    setDetailError(null);
  };

  // Quick Date Preset Handlers
  const handleDatePreset = (preset) => {
    setPage(1);
    const now = new Date();
    if (preset === "today") {
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7days") {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStartDate("");
    setEndDate("");
    setTypeFilter("all");
    setPaymentMethodFilter("all");
    setPaymentStatusFilter("all");
    setDispensingStatusFilter("all");
    setPage(1);
  };

  // Currency helper
  const fmt = (num) => {
    const val = parseFloat(num) || 0;
    return "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Badge stylings
  const getTypeBadge = (type) => {
    switch (type) {
      case "bill":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">Bill</span>;
      case "payment":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Payment</span>;
      case "dispensation":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-800">Dispensation</span>;
      case "purchase":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">Procurement</span>;
      case "stock_adjustment":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Stock Adj.</span>;
      case "refund":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">Refund</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">{type}</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
      case "paid":
      case "dispensed":
      case "active":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">● {status}</span>;
      case "partially_paid":
      case "partially_dispensed":
      case "pending":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">● {status}</span>;
      case "refunded":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800">● {status}</span>;
      case "failed":
      case "cancelled":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800">● {status}</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">{status || "—"}</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Section */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-sky-50 text-sky-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Hospital Pharmacy Transaction History &amp; Reporting</h1>
              <p className="text-xs text-slate-500">
                Authoritative pharmacy financial summaries, procurement expenses, dispensing volume, and audit logs.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            loadSummary();
            loadData();
          }}
          disabled={loading || summaryLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer transition disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading || summaryLoading ? "animate-spin text-sky-600" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* 2. Dashboard Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs bg-gradient-to-br from-white to-emerald-50/40">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Net Revenue</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{summaryLoading ? "..." : fmt(summary?.net_revenue)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Collected - Refunds</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gross Collected</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summaryLoading ? "..." : fmt(summary?.completed_payments_amount)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Completed payments</p>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs bg-gradient-to-br from-white to-amber-50/40">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Outstanding Dues</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{summaryLoading ? "..." : fmt(summary?.pending_dues_amount)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Unpaid balances</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bills Invoiced</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summaryLoading ? "..." : fmt(summary?.total_bills_amount)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{summary?.total_bills_count || 0} bills generated</p>
        </div>

        <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs bg-gradient-to-br from-white to-indigo-50/30">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Procurement Cost</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">{summaryLoading ? "..." : fmt(summary?.purchase_expenditure)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Supplier expenditures</p>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs bg-gradient-to-br from-white to-rose-50/30">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Refunds Issued</p>
          <p className="text-xl font-bold text-rose-700 mt-1">{summaryLoading ? "..." : fmt(summary?.refund_amount)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{summary?.partially_dispensed_prescriptions || 0} partial dispensations</p>
        </div>
      </div>

      {/* 3. Sub-Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2">
        <nav className="flex space-x-2 overflow-x-auto text-xs font-semibold">
          {[
            { id: "timeline", label: "Unified Transaction Timeline" },
            { id: "purchases", label: "Procurement & Purchases" },
            { id: "dispensations", label: "Dispensing Audit" },
            { id: "refunds", label: "Payment Refunds" },
            { id: "stock", label: "Inventory Stock Ledger" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveView(tab.id);
                setPage(1);
              }}
              className={`px-4 py-3 border-b-2 font-medium transition cursor-pointer whitespace-nowrap flex items-center space-x-2 ${
                activeView === tab.id
                  ? "border-sky-600 text-sky-700 bg-sky-50/50 rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 4. Filter Toolbar */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-4 relative">
            <input
              type="text"
              placeholder="Search by Bill #, Rx #, Patient, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-slate-900 bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="lg:col-span-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-700 bg-white"
            />
          </div>
          <div className="lg:col-span-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-700 bg-white"
            />
          </div>

          <div className="lg:col-span-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
          <span className="font-medium mr-1">Quick Date:</span>
          {[
            { id: "all", label: "All Time" },
            { id: "today", label: "Today" },
            { id: "7days", label: "Last 7 Days" },
            { id: "month", label: "This Month" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleDatePreset(preset.id)}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Data Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {activeView === "timeline" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Bill &amp; Rx Link</th>
                  <th className="py-3 px-4">Party / Subject</th>
                  <th className="py-3 px-4 text-right">Amount / Qty</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Staff</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">Loading timeline records...</td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">No transactions found.</td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr
                      key={tx.transaction_id}
                      onClick={() => handleOpenDetail(tx.transaction_type, tx.underlying_id)}
                      className="hover:bg-sky-50/40 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        {tx.transaction_date ? new Date(tx.transaction_date).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{getTypeBadge(tx.transaction_type)}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold text-slate-900">{tx.transaction_reference}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        <div>{tx.bill_number || "—"}</div>
                        {tx.prescription_reference && <div className="text-sky-700 text-[10px]">{tx.prescription_reference}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium">{tx.patient_name || tx.medicine_summary || "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900">{fmt(tx.amount)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(tx.current_status || tx.payment_status)}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 text-[11px]">{tx.staff_name || "—"}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 hover:bg-sky-50 rounded cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeView === "purchases" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Purchase Date</th>
                  <th className="py-3 px-4">Batch #</th>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Total Expenditure</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {purchases.map((b) => (
                  <tr key={b.id} onClick={() => handleOpenDetail("purchase", b.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">{b.purchase_date}</td>
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">{b.batch_number}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{b.medicine_name}</td>
                    <td className="py-3 px-4">{b.supplier_name || "Direct"}</td>
                    <td className="py-3 px-4 text-right font-mono">{fmt(b.purchase_price)}</td>
                    <td className="py-3 px-4 text-right font-semibold">{b.initial_quantity}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700">{fmt(b.total_purchase_cost)}</td>
                    <td className="py-3 px-4">{getStatusBadge(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeView === "dispensations" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Dispensation #</th>
                  <th className="py-3 px-4">Prescription #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4 text-right">Units</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {dispensations.map((d) => (
                  <tr key={d.id} onClick={() => handleOpenDetail("dispensation", d.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">{new Date(d.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-3 px-4 font-mono font-bold text-sky-700">{d.dispensation_number}</td>
                    <td className="py-3 px-4 font-mono">{d.prescription_number || "—"}</td>
                    <td className="py-3 px-4 font-semibold">{d.patient_name}</td>
                    <td className="py-3 px-4 text-right font-semibold">{d.total_units_dispensed}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">{fmt(d.total_amount)}</td>
                    <td className="py-3 px-4 text-slate-600">{d.dispensed_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeView === "refunds" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Refund #</th>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {refunds.map((r) => (
                  <tr key={r.id} onClick={() => handleOpenDetail("refund", r.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 px-4 font-mono font-bold text-rose-700">{r.refund_number}</td>
                    <td className="py-3 px-4 font-mono text-emerald-700">{r.receipt_number}</td>
                    <td className="py-3 px-4 font-mono text-purple-700">{r.bill_number}</td>
                    <td className="py-3 px-4 font-semibold">{r.patient_name}</td>
                    <td className="py-3 px-4 italic text-slate-600">{r.reason}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">{fmt(r.refund_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeView === "stock" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4 text-right">Change</th>
                  <th className="py-3 px-4 text-right">Remaining</th>
                  <th className="py-3 px-4">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {stockMovements.map((sm) => (
                  <tr key={sm.id} onClick={() => handleOpenDetail("stock_adjustment", sm.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">{new Date(sm.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-3 px-4 font-mono font-semibold">{sm.movement_type}</td>
                    <td className="py-3 px-4 font-semibold">{sm.medicine_name}</td>
                    <td className="py-3 px-4 font-mono">{sm.batch_number}</td>
                    <td className={`py-3 px-4 text-right font-bold ${sm.quantity_change > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {sm.quantity_change > 0 ? `+${sm.quantity_change}` : sm.quantity_change}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">{sm.remaining_batch_quantity}</td>
                    <td className="py-3 px-4 text-slate-600">{sm.performed_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages || 1}
          totalRecords={pagination.total || 0}
          pageSize={limit}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setLimit(newSize);
            setPage(1);
          }}
        />
      </div>

      {/* Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl min-h-screen shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold tracking-wider text-sky-400">Transaction Details</p>
                <h2 className="text-lg font-bold font-mono">ID #{selectedTx.id} ({selectedTx.type})</h2>
              </div>
              <button type="button" onClick={handleCloseDetail} className="p-1.5 text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4 text-xs text-slate-700">
              {detailLoading && <p className="text-center py-10 text-slate-400">Loading details...</p>}
              {detailError && <p className="text-red-600">{detailError}</p>}
              {detailData && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <pre className="text-slate-800 text-[11px] overflow-x-auto whitespace-pre-wrap font-sans">
                      {JSON.stringify(detailData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button type="button" onClick={handleCloseDetail} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

