import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  const user = session?.user;

  // Active view tab: "timeline" | "purchases" | "dispensations" | "refunds" | "stock"
  const [activeView, setActiveView] = useState("timeline");

  // Summary KPI states
  const [summary, setSummary] = useState(null);
  const [paymentBreakdown, setPaymentBreakdown] = useState(null);
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
        setPaymentBreakdown(res.data.payment_breakdown);
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
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Pharmacy Transaction History &amp; Audit Reporting</h1>
              <p className="text-xs text-slate-500">
                Centralized audit trail for bills, cash/UPI receipts, medicine dispensing, batch purchases, refunds, and inventory ledger.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => {
              loadSummary();
              loadData();
            }}
            disabled={loading || summaryLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer transition disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading || summaryLoading ? "animate-spin text-teal-600" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Dashboard Summary Metric Cards (Lesson 17.6) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Net Revenue */}
        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/40">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Net Revenue</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {summaryLoading ? "..." : fmt(summary?.net_revenue)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Collected - Refunds
          </p>
        </div>

        {/* Collected Payments */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gross Collected</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {summaryLoading ? "..." : fmt(summary?.completed_payments_amount)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Completed cash/UPI/card
          </p>
        </div>

        {/* Outstanding Dues */}
        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs bg-gradient-to-br from-white to-amber-50/40">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Outstanding Dues</p>
          <p className="text-xl font-bold text-amber-700 mt-1">
            {summaryLoading ? "..." : fmt(summary?.pending_dues_amount)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Unpaid pharmacy balances
          </p>
        </div>

        {/* Total Pharmacy Bills */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bills Invoiced</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {summaryLoading ? "..." : fmt(summary?.total_bills_amount)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {summary?.total_bills_count || 0} bills generated
          </p>
        </div>

        {/* Supplier Procurement (Strictly separated from customer sales!) */}
        <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs bg-gradient-to-br from-white to-indigo-50/30">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Procurement Cost</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">
            {summaryLoading ? "..." : fmt(summary?.purchase_expenditure)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Supplier batch expenditure
          </p>
        </div>

        {/* Refunds & Adjustments */}
        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs bg-gradient-to-br from-white to-rose-50/30">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Refunds Processed</p>
          <p className="text-xl font-bold text-rose-700 mt-1">
            {summaryLoading ? "..." : fmt(summary?.refund_amount)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {summary?.partially_dispensed_prescriptions || 0} partial dispensations
          </p>
        </div>
      </div>

      {/* 3. Navigation Sub-Tabs */}
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
                  ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 4. Filter Toolbar (Lessons 17.4 & 17.5) */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-3 items-center">
          {/* Search box (Lesson 17.4) */}
          <div className="lg:col-span-4 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by Bill #, Rx #, Patient, SKU, Receipt #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-slate-900 bg-white"
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

          {/* Date range picker (Lesson 17.5) */}
          <div className="lg:col-span-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 text-slate-700 bg-white"
              title="Start Date (Inclusive)"
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
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 text-slate-700 bg-white"
              title="End Date (Inclusive)"
            />
          </div>

          {/* Timeline-specific dropdown filters */}
          {activeView === "timeline" && (
            <>
              <div className="lg:col-span-2">
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-700 bg-white"
                >
                  <option value="all">All Types</option>
                  <option value="bill">Bills</option>
                  <option value="payment">Payments</option>
                  <option value="dispensation">Dispensations</option>
                  <option value="purchase">Procurement</option>
                  <option value="stock_adjustment">Stock Adjustments</option>
                  <option value="refund">Refunds</option>
                </select>
              </div>

              <div className="lg:col-span-1">
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => {
                    setPaymentMethodFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-700 bg-white"
                >
                  <option value="all">Method</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div className="lg:col-span-1">
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => {
                    setPaymentStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-700 bg-white"
                >
                  <option value="all">Status</option>
                  <option value="completed">Completed</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </>
          )}

          {activeView !== "timeline" && (
            <div className="lg:col-span-4 flex justify-end">
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Quick Date Presets */}
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
          {(searchTerm || startDate || endDate || typeFilter !== "all" || paymentMethodFilter !== "all" || paymentStatusFilter !== "all") && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="ml-auto text-teal-700 hover:underline cursor-pointer font-medium"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* 5. Main Content Area */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => loadData()} className="font-semibold underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* TABLE VIEW */}
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
                    <td colSpan="9" className="py-12 text-center text-slate-400">
                      <div className="inline-block animate-spin w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full mb-2"></div>
                      <p>Loading pharmacy transaction history...</p>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">
                      <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="font-medium text-slate-600">No pharmacy transactions found.</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">Try adjusting search keywords or date range.</p>
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr
                      key={tx.transaction_id}
                      onClick={() => handleOpenDetail(tx.transaction_type, tx.underlying_id)}
                      className="hover:bg-teal-50/40 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                        {tx.transaction_date ? new Date(tx.transaction_date).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getTypeBadge(tx.transaction_type)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold text-slate-900">
                        {tx.transaction_reference}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        <div>{tx.bill_number ? <span className="text-purple-700 font-medium">{tx.bill_number}</span> : "—"}</div>
                        {tx.prescription_reference && (
                          <div className="text-sky-700 text-[10px]">{tx.prescription_reference}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        <div className="font-medium">{tx.patient_name || tx.medicine_summary || "—"}</div>
                        {tx.patient_email && <div className="text-[10px] text-slate-400">{tx.patient_email}</div>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <span className="font-semibold text-slate-900">{fmt(tx.amount)}</span>
                        {tx.quantity > 1 && (
                          <div className="text-[10px] text-slate-500">Qty: {tx.quantity}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(tx.current_status || tx.payment_status || tx.dispensing_status)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 text-[11px]">
                        {tx.staff_name || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(tx.transaction_type, tx.underlying_id);
                          }}
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

          {/* PURCHASES TABLE (Lesson 17.7A) */}
          {activeView === "purchases" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Purchase Date</th>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4">Medicine &amp; SKU</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Qty Received</th>
                  <th className="py-3 px-4 text-right">Total Expenditure</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Received By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-slate-400">Loading purchase records...</td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-slate-400">No procurement purchases recorded.</td>
                  </tr>
                ) : (
                  purchases.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => handleOpenDetail("purchase", b.id)}
                      className="hover:bg-indigo-50/30 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {b.purchase_date ? new Date(b.purchase_date).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-800">{b.batch_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{b.medicine_name}</div>
                        <div className="text-[10px] text-slate-500">SKU: {b.sku || "N/A"} • {b.dosage_form}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{b.supplier_name || "Direct Procurement"}</div>
                        {b.supplier_contact && <div className="text-[10px] text-slate-400">{b.supplier_contact}</div>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-800 font-mono">{fmt(b.purchase_price)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">{b.initial_quantity}</td>
                      <td className="py-3 px-4 text-right font-bold text-indigo-700 font-mono">{fmt(b.total_purchase_cost)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(b.status)}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px]">{b.received_by_name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* DISPENSATIONS TABLE (Lesson 17.7B) */}
          {activeView === "dispensations" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Dispensation #</th>
                  <th className="py-3 px-4">Prescription #</th>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4 text-right">Units Dispensed</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4">Rx Status</th>
                  <th className="py-3 px-4">Dispensed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">Loading dispensation audit records...</td>
                  </tr>
                ) : dispensations.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">No dispensation records found.</td>
                  </tr>
                ) : (
                  dispensations.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => handleOpenDetail("dispensation", d.id)}
                      className="hover:bg-sky-50/30 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {d.created_at ? new Date(d.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sky-800">{d.dispensation_number}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{d.prescription_number || "—"}</td>
                      <td className="py-3 px-4 font-mono text-purple-700">{d.bill_number || "—"}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{d.patient_name}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800">{d.total_units_dispensed}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">{fmt(d.total_amount)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(d.prescription_status || d.payment_status)}</td>
                      <td className="py-3 px-4 text-slate-600">{d.dispensed_by_name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* REFUNDS TABLE (Lesson 17.7C) */}
          {activeView === "refunds" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Refund Date</th>
                  <th className="py-3 px-4">Refund #</th>
                  <th className="py-3 px-4">Original Receipt #</th>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Audit Reason</th>
                  <th className="py-3 px-4 text-right">Refund Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Refunded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">Loading refund audit history...</td>
                  </tr>
                ) : refunds.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-400">No refunds recorded.</td>
                  </tr>
                ) : (
                  refunds.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => handleOpenDetail("refund", r.id)}
                      className="hover:bg-rose-50/30 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-rose-800">{r.refund_number}</td>
                      <td className="py-3 px-4 font-mono text-emerald-800">{r.receipt_number}</td>
                      <td className="py-3 px-4 font-mono text-purple-700">{r.bill_number}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{r.patient_name}</td>
                      <td className="py-3 px-4 text-slate-600 italic">{r.reason}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-700 font-mono">{fmt(r.refund_amount)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(r.status)}</td>
                      <td className="py-3 px-4 text-slate-600">{r.refunded_by_name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* STOCK MOVEMENTS TABLE (Lesson 17.7D) */}
          {activeView === "stock" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Movement Type</th>
                  <th className="py-3 px-4">Medicine &amp; SKU</th>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4 text-right">Qty Change</th>
                  <th className="py-3 px-4 text-right">Remaining Stock</th>
                  <th className="py-3 px-4">Reason / Reference</th>
                  <th className="py-3 px-4">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-400">Loading stock movement ledger...</td>
                  </tr>
                ) : stockMovements.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-400">No stock movements recorded.</td>
                  </tr>
                ) : (
                  stockMovements.map((sm) => (
                    <tr
                      key={sm.id}
                      onClick={() => handleOpenDetail("stock_adjustment", sm.id)}
                      className="hover:bg-amber-50/30 transition cursor-pointer"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {sm.created_at ? new Date(sm.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {sm.movement_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{sm.medicine_name}</div>
                        <div className="text-[10px] text-slate-500">SKU: {sm.sku || "N/A"}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{sm.batch_number}</td>
                      <td className={`py-3 px-4 text-right font-bold ${sm.quantity_change > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {sm.quantity_change > 0 ? `+${sm.quantity_change}` : sm.quantity_change}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">{sm.remaining_batch_quantity}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px]">{sm.reason || sm.reference_id || "—"}</td>
                      <td className="py-3 px-4 text-slate-600 text-[11px]">{sm.performed_by_name || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* 6. Pagination Bar */}
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

      {/* 7. Deep Detail Drawer / Modal (Lessons 17.2 & 17.3) */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl min-h-screen shadow-2xl border-l border-slate-200 flex flex-col animate-slide-in">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-teal-400">Transaction Reference</span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-300 capitalize">{selectedTx.type}</span>
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5 font-mono">
                  ID #{selectedTx.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6 text-xs text-slate-700">
              {detailLoading && (
                <div className="py-20 text-center text-slate-400">
                  <div className="inline-block animate-spin w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full mb-3"></div>
                  <p className="font-semibold text-slate-700">Resolving cross-entity relationship graph...</p>
                </div>
              )}

              {detailError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                  {detailError}
                </div>
              )}

              {detailData && (
                <>
                  {/* BILL DETAILS */}
                  {detailData.transaction_type === "bill" && detailData.bill && (
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Bill Number</p>
                          <p className="text-sm font-bold font-mono text-purple-800">{detailData.bill.bill_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Bill Status</p>
                          <div className="mt-0.5">{getStatusBadge(detailData.bill.status)}</div>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Patient</p>
                          <p className="font-semibold text-slate-900">{detailData.bill.patient_name}</p>
                          <p className="text-[11px] text-slate-500">{detailData.bill.patient_email}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Linked Prescription</p>
                          <p className="font-mono text-sky-700 font-semibold">{detailData.bill.prescription_number || "Direct OTC Bill"}</p>
                          {detailData.bill.doctor_name && <p className="text-[11px] text-slate-500">Dr. {detailData.bill.doctor_name}</p>}
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2">Prescribed Bill Items</h3>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                              <tr>
                                <th className="p-2">Medicine</th>
                                <th className="p-2 text-right">Unit Price</th>
                                <th className="p-2 text-right">Qty</th>
                                <th className="p-2 text-right">GST (12%)</th>
                                <th className="p-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData.items || []).map((it) => (
                                <tr key={it.id}>
                                  <td className="p-2">
                                    <div className="font-semibold text-slate-900">{it.medicine_name}</div>
                                    <div className="text-[10px] text-slate-500">SKU: {it.sku || "—"}</div>
                                  </td>
                                  <td className="p-2 text-right font-mono">{fmt(it.unit_price)}</td>
                                  <td className="p-2 text-right font-semibold">{it.quantity}</td>
                                  <td className="p-2 text-right text-slate-500">{fmt(it.gst_amount)}</td>
                                  <td className="p-2 text-right font-bold text-slate-900 font-mono">{fmt(it.line_total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Financial Balance Summary */}
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-semibold text-purple-900 uppercase">Paid: {fmt(detailData.bill.paid_amount)}</p>
                          <p className="text-[10px] text-purple-700">Balance Due: {fmt(detailData.bill.balance_due)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-purple-600 uppercase font-semibold">Grand Total</p>
                          <p className="text-base font-bold text-purple-900 font-mono">{fmt(detailData.bill.grand_total)}</p>
                        </div>
                      </div>

                      {/* Associated Payments */}
                      {detailData.payments && detailData.payments.length > 0 && (
                        <div>
                          <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2">Payment Receipts</h3>
                          <div className="space-y-1.5">
                            {detailData.payments.map((p) => (
                              <div key={p.id} className="p-2.5 rounded-lg border border-slate-200 bg-emerald-50/30 flex justify-between items-center">
                                <div>
                                  <span className="font-mono font-bold text-emerald-800">{p.receipt_number}</span>
                                  <span className="ml-2 text-[10px] text-slate-500 capitalize">({p.payment_method})</span>
                                  <div className="text-[10px] text-slate-500">Txn Ref: {p.transaction_reference || "N/A"}</div>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-slate-900 font-mono">{fmt(p.amount)}</span>
                                  <div>{getStatusBadge(p.payment_status)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAYMENT DETAILS */}
                  {detailData.transaction_type === "payment" && detailData.payment && (
                    <div className="space-y-4">
                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-emerald-700 uppercase font-semibold">Receipt Number</p>
                          <p className="text-base font-bold font-mono text-emerald-900">{detailData.payment.receipt_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-700 uppercase font-semibold">Amount Paid</p>
                          <p className="text-base font-bold font-mono text-emerald-900">{fmt(detailData.payment.amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-700 uppercase font-semibold">Method &amp; Status</p>
                          <p className="font-medium text-slate-800 capitalize">{detailData.payment.payment_method} • {detailData.payment.payment_status}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-700 uppercase font-semibold">Transaction Reference</p>
                          <p className="font-mono text-slate-700">{detailData.payment.transaction_reference || "Cash Desk"}</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h4 className="font-bold text-slate-900 uppercase text-[10px] tracking-wider mb-1.5">Linked Bill</h4>
                        <p className="font-mono font-semibold text-purple-800 text-sm">{detailData.payment.bill_number}</p>
                        <p className="text-slate-600 mt-1">Patient: {detailData.payment.patient_name} ({detailData.payment.patient_email})</p>
                        <p className="text-slate-600 mt-0.5">Bill Grand Total: {fmt(detailData.payment.bill_grand_total)}</p>
                      </div>
                    </div>
                  )}

                  {/* DISPENSATION DETAILS */}
                  {detailData.transaction_type === "dispensation" && detailData.dispensation && (
                    <div className="space-y-4">
                      <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-sky-700 uppercase font-semibold">Dispensation #</p>
                          <p className="text-base font-bold font-mono text-sky-900">{detailData.dispensation.dispensation_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-sky-700 uppercase font-semibold">Dispensed By</p>
                          <p className="font-semibold text-slate-900">{detailData.dispensation.dispensed_by_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-sky-700 uppercase font-semibold">Linked Prescription</p>
                          <p className="font-mono text-slate-800">{detailData.dispensation.prescription_number || "OTC"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-sky-700 uppercase font-semibold">Linked Bill</p>
                          <p className="font-mono text-purple-800">{detailData.dispensation.bill_number || "Unbilled"}</p>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2">Dispensed Medicine Batches</h3>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                              <tr>
                                <th className="p-2">Medicine</th>
                                <th className="p-2">Batch #</th>
                                <th className="p-2">Expiry</th>
                                <th className="p-2 text-right">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData.items || []).map((it) => (
                                <tr key={it.id}>
                                  <td className="p-2 font-semibold text-slate-900">{it.medicine_name}</td>
                                  <td className="p-2 font-mono text-indigo-700 font-bold">{it.batch_number}</td>
                                  <td className="p-2 text-slate-500">{it.expiry_date ? new Date(it.expiry_date).toLocaleDateString("en-IN") : "—"}</td>
                                  <td className="p-2 text-right font-bold text-slate-900">{it.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PROCUREMENT PURCHASE DETAILS */}
                  {detailData.transaction_type === "purchase" && detailData.batch && (
                    <div className="space-y-4">
                      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-indigo-700 uppercase font-semibold">Batch Number</p>
                          <p className="text-base font-bold font-mono text-indigo-900">{detailData.batch.batch_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-indigo-700 uppercase font-semibold">Supplier</p>
                          <p className="font-semibold text-slate-900">{detailData.batch.supplier_name || "Direct Wholesale"}</p>
                          <p className="text-[11px] text-slate-500">{detailData.batch.supplier_phone}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-indigo-700 uppercase font-semibold">Medicine</p>
                          <p className="font-semibold text-slate-900">{detailData.batch.medicine_name}</p>
                          <p className="text-[11px] text-slate-500">SKU: {detailData.batch.sku} • {detailData.batch.dosage_form}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-indigo-700 uppercase font-semibold">Unit Cost / Price</p>
                          <p className="font-mono text-slate-900 font-medium">Cost: {fmt(detailData.batch.purchase_price)} • Sale: {fmt(detailData.batch.sale_price)}</p>
                        </div>
                      </div>

                      {/* Stock ledger */}
                      <div>
                        <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2">Batch Stock Movements</h3>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                              <tr>
                                <th className="p-2">Type</th>
                                <th className="p-2 text-right">Change</th>
                                <th className="p-2 text-right">Remaining</th>
                                <th className="p-2">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData.movements || []).map((m) => (
                                <tr key={m.id}>
                                  <td className="p-2 font-mono">{m.movement_type}</td>
                                  <td className={`p-2 text-right font-bold ${m.quantity_change > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                                  </td>
                                  <td className="p-2 text-right font-semibold">{m.remaining_batch_quantity}</td>
                                  <td className="p-2 text-slate-500">{m.reason || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* REFUND DETAILS */}
                  {detailData.transaction_type === "refund" && detailData.refund && (
                    <div className="space-y-4">
                      <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-rose-700 uppercase font-semibold">Refund Number</p>
                          <p className="text-base font-bold font-mono text-rose-900">{detailData.refund.refund_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-rose-700 uppercase font-semibold">Refund Amount</p>
                          <p className="text-base font-bold font-mono text-rose-900">{fmt(detailData.refund.refund_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-rose-700 uppercase font-semibold">Original Receipt</p>
                          <p className="font-mono text-emerald-800 font-semibold">{detailData.refund.receipt_number}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-rose-700 uppercase font-semibold">Original Bill</p>
                          <p className="font-mono text-purple-800 font-semibold">{detailData.refund.bill_number}</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Audit Reason</p>
                        <p className="text-slate-800 italic mt-0.5">{detailData.refund.reason}</p>
                        <p className="text-[11px] text-slate-500 mt-2">Authorized Staff: {detailData.refund.refunded_by_name}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

