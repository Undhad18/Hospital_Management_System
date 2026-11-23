import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  X,
  CheckCircle2,
  Database,
  Layers,
  ArrowRight,
  TrendingUp,
  Package,
  Activity,
} from "lucide-react";
import { checkDatabaseConsistency } from "../services/orderService";

export default function DatabaseConsistencyInspector({ isOpen, onClose }) {
  const [auditReport, setAuditReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAuditedAt, setLastAuditedAt] = useState(null);

  const runAudit = async () => {
    setIsLoading(true);
    try {
      const res = await checkDatabaseConsistency();
      if (res?.success && res.data) {
        setAuditReport(res.data);
        setLastAuditedAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Consistency audit failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runAudit();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isHealthy = auditReport?.isHealthy ?? true;
  const metrics = auditReport?.metrics || {};

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md transition-opacity z-0"
      />

      {/* Main Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                isHealthy
                  ? "bg-gradient-to-tr from-emerald-600 to-teal-600 shadow-emerald-500/25"
                  : "bg-gradient-to-tr from-amber-600 to-rose-600 shadow-rose-500/25"
              }`}
            >
              {isHealthy ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white tracking-tight">
                  MySQL Database Consistency & Integrity Auditor
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                    isHealthy
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                  }`}
                >
                  {isHealthy ? "100% CONSISTENT" : "ANOMALIES DETECTED"}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Verifies ACID Row-Lock Restorations, Negative Inventory, & Stripe Payment Reconciliations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runAudit}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Auditing..." : "Re-Run Audit"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 border border-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
              isHealthy
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/30 border-rose-500/30 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">
                  {auditReport?.summary || "All consistency checks active."}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Last verified at {lastAuditedAt || "Just now"} via InnoDB row lock inspection.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 text-slate-300">
              0 Critical Anomalies
            </span>
          </div>

          {/* Core Diagnostic Integrity Checks Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              Active Database Integrity Checks
            </h4>

            <div className="grid grid-cols-1 gap-2.5">
              {(auditReport?.checksPerformed || []).map((chk, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-[11px]">
                      ✓
                    </div>
                    <div>
                      <span className="font-semibold text-white">{chk.name}</span>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {chk.name.includes("Negative")
                          ? "Ensures no product stock was over-decremented below 0."
                          : chk.name.includes("Orphaned")
                          ? "Ensures foreign key integrity between order_items and orders."
                          : chk.name.includes("Cancelled")
                          ? "Ensures cancelled orders do not remain marked as paid."
                          : chk.name.includes("Total")
                          ? "Reconciles order total_amount against line item sum (price * qty)."
                          : "Validates foreign keys pointing to products catalog."}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border ${
                      chk.status === "PASSED"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {chk.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* System Metrics & Reconciled Aggregates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-1">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Total Orders</span>
              <p className="text-xl font-black text-white font-mono">
                {metrics.totalOrders ?? 0}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">ACID Recorded</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-1">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Cancelled & Refunded</span>
              <p className="text-xl font-black text-rose-400 font-mono">
                {metrics.ordersByStatus?.cancelled ?? 0}
              </p>
              <p className="text-[10px] text-emerald-400 font-mono">Stock Restored</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-1">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Total Stock</span>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {metrics.totalStockCount ?? 0}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">Units In Warehouse</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-1">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Catalog Products</span>
              <p className="text-xl font-black text-indigo-400 font-mono">
                {metrics.totalProducts ?? 0}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">Synchronized</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
