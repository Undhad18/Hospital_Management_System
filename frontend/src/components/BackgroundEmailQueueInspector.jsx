import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Mail,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  RefreshCw,
  Cpu,
  Server,
  X,
  Layers,
  RotateCcw,
  AlertTriangle,
  Play,
  Trash2,
  Sliders,
  Bug,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import {
  getEmailQueueLogs,
  getEmailQueueStats,
  getDeadLetterQueue,
  retryEmailJob,
  retryAllDeadLetterJobs,
  clearDeadLetterQueue,
  configureFaultInjection,
  triggerSimulatedEmailJob,
  flushEmailQueue,
} from "../services/orderService";

export default function BackgroundEmailQueueInspector({ isOpen, onClose, targetOrderId = null }) {
  const { latestEmailEvent, isConnected } = useSocket();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'dlq'
  const [simCategory, setSimCategory] = useState("order"); // 'order' | 'shipment' | 'return' | 'refund'
  const [selectedEmailHtml, setSelectedEmailHtml] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetryingJobId, setIsRetryingJobId] = useState(null);
  const [faultInjectionEnabled, setFaultInjectionEnabled] = useState(false);
  const [expandedRetryHistoryId, setExpandedRetryHistoryId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const dedupeJobs = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter((item) => {
      const id = item?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const fetchQueueData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, logsRes, dlqRes] = await Promise.all([
        getEmailQueueStats(),
        getEmailQueueLogs(30),
        getDeadLetterQueue(20),
      ]);
      if (statsRes?.success) {
        setStats(statsRes.data);
        if (statsRes.data?.faultInjection) {
          setFaultInjectionEnabled(statsRes.data.faultInjection.enabled);
        }
      }
      if (logsRes?.success) setLogs(dedupeJobs(logsRes.data || []));
      if (dlqRes?.success) setDlq(dedupeJobs(dlqRes.data || []));
    } catch (err) {
      console.error("Queue fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQueueData();
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        if (selectedEmailHtml) {
          setSelectedEmailHtml(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedEmailHtml, onClose]);

  // Real-time update when a new email event comes over Socket.IO
  useEffect(() => {
    if (latestEmailEvent) {
      if (latestEmailEvent.metrics) {
        setStats(latestEmailEvent.metrics);
        if (latestEmailEvent.metrics.faultInjection) {
          setFaultInjectionEnabled(latestEmailEvent.metrics.faultInjection.enabled);
        }
      }

      setLogs((prev) => {
        const jobId = latestEmailEvent.jobId;
        if (!jobId) return prev;

        const existingJob = prev.find((j) => j && j.id === jobId) || {};
        const updatedJob = {
          ...existingJob,
          id: jobId,
          orderId: latestEmailEvent.orderId ?? existingJob.orderId,
          status: latestEmailEvent.status ?? existingJob.status,
          recipientEmail: latestEmailEvent.recipientEmail ?? existingJob.recipientEmail,
          subject: latestEmailEvent.subject ?? existingJob.subject,
          state: latestEmailEvent.state ?? existingJob.state,
          retries: latestEmailEvent.retries ?? existingJob.retries ?? 0,
          maxRetries: latestEmailEvent.maxRetries ?? existingJob.maxRetries ?? 3,
          backoffDelayMs: latestEmailEvent.backoffDelayMs ?? existingJob.backoffDelayMs,
          nextRetryAt: latestEmailEvent.nextRetryAt ?? existingJob.nextRetryAt,
          error: latestEmailEvent.error ?? existingJob.error,
          durationMs: latestEmailEvent.durationMs ?? existingJob.durationMs,
          enqueuedAt: latestEmailEvent.timestamp ?? existingJob.enqueuedAt ?? new Date().toISOString(),
          completedAt: latestEmailEvent.completedAt ?? existingJob.completedAt,
          renderedHtml: latestEmailEvent.renderedHtml ?? existingJob.renderedHtml,
        };

        const remaining = prev.filter((j) => j && j.id !== jobId);
        return [updatedJob, ...remaining].slice(0, 50);
      });

      if (latestEmailEvent.type === "JOB_FAILED") {
        fetchQueueData();
      }
    }
  }, [latestEmailEvent]);

  const handleRetryJob = async (jobId) => {
    setIsRetryingJobId(jobId);
    setActionFeedback(null);
    try {
      const res = await retryEmailJob(jobId);
      if (res.success) {
        setActionFeedback({
          type: "success",
          message: `Job ${jobId} re-enqueued for immediate background processing!`,
        });
        await fetchQueueData();
      } else {
        setActionFeedback({
          type: "error",
          message: res.message || "Failed to retry job",
        });
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    } finally {
      setIsRetryingJobId(null);
    }
  };

  const handleToggleFaultInjection = async () => {
    try {
      const nextState = !faultInjectionEnabled;
      const res = await configureFaultInjection({ enabled: nextState });
      if (res.success) {
        setFaultInjectionEnabled(res.data.enabled);
        setActionFeedback({
          type: "info",
          message: res.data.enabled
            ? "Fault Injection ACTIVE: Outgoing emails will simulate SMTP timeouts and trigger automatic exponential retries!"
            : "Fault Injection DEACTIVATED: Emails will process normally.",
        });
        await fetchQueueData();
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  };

  const handleTriggerSimulation = async (shouldFail, categoryToUse = simCategory) => {
    try {
      const targetCategory = categoryToUse || simCategory;
      const res = await triggerSimulatedEmailJob({
        orderId: Math.floor(100 + Math.random() * 900),
        status:
          targetCategory === "shipment"
            ? "shipped"
            : targetCategory === "return"
            ? "return_requested"
            : targetCategory === "refund"
            ? "refund_issued"
            : "placed",
        category: targetCategory,
        recipientEmail: `test-${Date.now().toString().slice(-4)}@excelsior-store.io`,
        shouldFail,
      });
      if (res.success) {
        setActionFeedback({
          type: shouldFail ? "warning" : "success",
          message: shouldFail
            ? `Fault-injected [${targetCategory.toUpperCase()}] job enqueued! Watch exponential backoff retry loop.`
            : `Simulated [${targetCategory.toUpperCase()}] notification job enqueued successfully.`,
        });
        await fetchQueueData();
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  };

  const handleRetryAllDlq = async () => {
    try {
      const res = await retryAllDeadLetterJobs();
      if (res.success) {
        setActionFeedback({
          type: "success",
          message: res.message || `Re-enqueued ${res.count} jobs from Dead-Letter Queue!`,
        });
        await fetchQueueData();
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  };

  const handleClearDlq = async () => {
    try {
      const res = await clearDeadLetterQueue();
      if (res.success) {
        setActionFeedback({
          type: "info",
          message: res.message || `Cleared ${res.count} dead-letter jobs.`,
        });
        await fetchQueueData();
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  };

  const handleFlushQueue = async () => {
    try {
      const res = await flushEmailQueue();
      if (res.success) {
        setActionFeedback({
          type: "info",
          message: res.message,
        });
        await fetchQueueData();
      }
    } catch (err) {
      setActionFeedback({ type: "error", message: err.message });
    }
  };

  if (!isOpen) return null;

  const rawLogs = activeTab === "dlq" ? dlq : logs;
  const currentDisplayLogs = dedupeJobs(rawLogs);

  const modalElement = (
    <div className="fixed inset-0 z-[10000] overflow-hidden animate-fadeIn flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md transition-opacity z-0"
      />

      {/* Main Modal */}
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Background Email Queue & Retry Engine
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 text-[10px] font-mono font-bold border border-violet-500/30">
                  EXPONENTIAL BACKOFF
                </span>
                {faultInjectionEnabled && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30 flex items-center gap-1 animate-pulse">
                    <Bug className="w-3 h-3 text-rose-400" />
                    FAULT INJECTION ON
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                  }`}
                />
                {isConnected ? "Live WebSocket Queue Stream Active" : "Disconnected"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchQueueData}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              title="Refresh Queue Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 border border-white/10 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`p-3 px-5 border-b text-xs font-mono flex items-center justify-between transition ${
              actionFeedback.type === "error"
                ? "bg-rose-950/60 border-rose-500/30 text-rose-300"
                : actionFeedback.type === "warning"
                ? "bg-amber-950/60 border-amber-500/30 text-amber-300"
                : "bg-indigo-950/60 border-indigo-500/30 text-indigo-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-current shrink-0" />
              <span>{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-3"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Queue Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-950/50 border-b border-white/5">
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5">
            <p className="text-[11px] text-slate-400 font-mono">Enqueued Jobs</p>
            <p className="text-lg font-bold text-white font-mono mt-1">
              {stats?.totalEnqueued || logs.length || 0}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5">
            <p className="text-[11px] text-slate-400 font-mono">Dispatched Succeeded</p>
            <p className="text-lg font-bold text-emerald-400 font-mono mt-1">
              {stats?.totalSucceeded || logs.filter((l) => l.state === "completed").length || 0}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5">
            <p className="text-[11px] text-slate-400 font-mono">Retried Attempts</p>
            <p className="text-lg font-bold text-amber-300 font-mono mt-1">
              {stats?.totalRetried || 0}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5">
            <p className="text-[11px] text-slate-400 font-mono">Dead-Letter Queue</p>
            <p className="text-lg font-bold text-rose-400 font-mono mt-1">
              {stats?.deadLetterJobs || dlq.length || 0}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5">
            <p className="text-[11px] text-slate-400 font-mono">Avg Worker Latency</p>
            <p className="text-lg font-bold text-indigo-300 font-mono mt-1">
              {stats?.averageProcessingTimeMs || 500}ms
            </p>
          </div>
        </div>

        {/* Simulation & Retry Control Toolbar */}
        <div className="p-3 px-5 bg-slate-950/80 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === "all"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              All Jobs ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab("dlq")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "dlq"
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Dead-Letter Queue ({stats?.deadLetterJobs || dlq.length})
              {stats?.deadLetterJobs > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* If on DLQ tab: show Bulk Actions */}
            {activeTab === "dlq" && (
              <>
                <button
                  onClick={handleRetryAllDlq}
                  disabled={dlq.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Retry all failed jobs in Dead-Letter Queue"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  Retry All DLQ
                </button>
                <button
                  onClick={handleClearDlq}
                  disabled={dlq.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Purge all jobs from Dead-Letter Queue"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Clear DLQ
                </button>
              </>
            )}

            {/* Category Selector for Simulation */}
            <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-xl px-2 py-1 text-xs">
              <span className="text-[10px] text-slate-400 font-mono">Type:</span>
              <select
                value={simCategory}
                onChange={(e) => setSimCategory(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              >
                <option value="order" className="bg-slate-900 text-white">Order</option>
                <option value="shipment" className="bg-slate-900 text-white">Shipment</option>
                <option value="return" className="bg-slate-900 text-white">Return</option>
                <option value="refund" className="bg-slate-900 text-white">Refund</option>
              </select>
            </div>

            {/* Fault Injection Switch */}
            <button
              onClick={handleToggleFaultInjection}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                faultInjectionEnabled
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30 shadow-lg shadow-rose-500/10"
                  : "bg-slate-800 border-white/10 text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
              title="Inject artificial network/SMTP outages to test exponential retries"
            >
              <Bug className="w-3.5 h-3.5" />
              {faultInjectionEnabled ? "Fault Outage: ON" : "Fault Outage: OFF"}
            </button>

            {/* Test Simulation Trigger */}
            <button
              onClick={() => handleTriggerSimulation(false)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
              title={`Enqueue a simulated ${simCategory.toUpperCase()} notification`}
            >
              <Play className="w-3.5 h-3.5" />
              Simulate {simCategory.charAt(0).toUpperCase() + simCategory.slice(1)}
            </button>

            {/* Test Failing Job (Forces Retry Loop) */}
            <button
              onClick={() => handleTriggerSimulation(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Trigger a job that will intentionally fail and execute 3x exponential backoff retries"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              Test Retry Loop
            </button>

            {/* Flush Queue */}
            <button
              onClick={handleFlushQueue}
              className="p-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-mono transition flex items-center gap-1 cursor-pointer"
              title="Flush pending queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body: Job History List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              {activeTab === "dlq" ? "Dead-Letter Queue (Failed Jobs)" : "Recent Background Jobs"} ({currentDisplayLogs.length})
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {activeTab === "dlq"
                ? "Jobs where all 3 retries were exhausted. You can manually retry them anytime."
                : "Decoupled async worker dispatches notifications without blocking customer requests"}
            </span>
          </div>

          {currentDisplayLogs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
              <Mail className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {activeTab === "dlq"
                  ? "No failed jobs in the Dead-Letter Queue! All notification dispatches succeeded."
                  : "No background email jobs recorded yet."}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Click "Test Retry Loop" above or place an order to witness the real-time background worker.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 font-mono text-xs">
              {currentDisplayLogs.map((job, idx) => {
                const isMatching = targetOrderId && Number(job.orderId) === Number(targetOrderId);
                const isCompleted = job.state === "completed";
                const isProcessing = job.state === "processing";
                const isRetrying = job.state === "retrying";
                const isFailed = job.state === "failed";
                const isExpanded = expandedRetryHistoryId === job.id;

                return (
                  <div
                    key={`${job.id || "job"}-${idx}`}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                      isFailed
                        ? "bg-rose-950/30 border-rose-500/30 shadow-md shadow-rose-500/5"
                        : isRetrying
                        ? "bg-amber-950/30 border-amber-500/30 shadow-md shadow-amber-500/5"
                        : isMatching
                        ? "bg-violet-950/40 border-violet-500/50 shadow-md shadow-violet-500/10"
                        : "bg-slate-950/60 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Job metadata */}
                      <div className="flex items-start sm:items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isCompleted
                              ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                              : isProcessing
                              ? "bg-blue-500/20 border border-blue-500/30 text-blue-300 animate-spin"
                              : isRetrying
                              ? "bg-amber-500/20 border border-amber-500/30 text-amber-300 animate-pulse"
                              : isFailed
                              ? "bg-rose-500/20 border border-rose-500/30 text-rose-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : isProcessing ? (
                            <RefreshCw className="w-4 h-4" />
                          ) : isRetrying ? (
                            <RotateCcw className="w-4 h-4 animate-spin" />
                          ) : isFailed ? (
                            <AlertCircle className="w-4 h-4" />
                          ) : (
                            <Clock className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">Order #{job.orderId}</span>

                            {/* Category Badge */}
                            {job.category && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                                  job.category === "shipment"
                                    ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                                    : job.category === "return"
                                    ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                                    : job.category === "refund"
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                    : "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                                }`}
                              >
                                {job.category}
                              </span>
                            )}

                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px] uppercase font-bold border border-white/10">
                              {job.status || "placed"}
                            </span>

                            {/* State Pill */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${
                                isCompleted
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : isRetrying
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse"
                                  : isProcessing
                                  ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                                  : isFailed
                                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                  : "bg-slate-800 border-white/10 text-slate-400"
                              }`}
                            >
                              {isRetrying
                                ? `Retrying (${job.retries}/${job.maxRetries || 3})`
                                : job.state}
                            </span>

                            {job.backoffDelayMs && isRetrying && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-mono">
                                Next: +{job.backoffDelayMs / 1000}s backoff
                              </span>
                            )}

                            <span className="text-[10px] text-slate-400 hidden sm:inline">
                              &rarr; {job.recipientEmail || "customer@example.com"}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 truncate max-w-lg mt-0.5">
                            {job.subject || "Order status notification"}
                          </p>

                          {job.error && (
                            <p className="text-[10px] text-rose-400 mt-0.5 max-w-lg truncate flex items-center gap-1 font-mono">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {job.error}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions & Timers */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {/* Retry History Pill */}
                        {job.retryHistory && job.retryHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRetryHistoryId((prev) =>
                                prev === job.id ? null : job.id
                              )
                            }
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition cursor-pointer font-sans"
                            title="View Retry Attempt History"
                          >
                            <span>{job.retryHistory.length} attempts</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}

                        {/* Manual Retry Button for Failed/DLQ jobs */}
                        {(isFailed || isRetrying) && (
                          <button
                            type="button"
                            onClick={() => handleRetryJob(job.id)}
                            disabled={isRetryingJobId === job.id}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-sans flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
                            title="Re-enqueue for immediate background execution"
                          >
                            <RotateCcw
                              className={`w-3.5 h-3.5 ${
                                isRetryingJobId === job.id ? "animate-spin" : ""
                              }`}
                            />
                            <span>Retry Now</span>
                          </button>
                        )}

                        {/* HTML Preview */}
                        {job.renderedHtml && (
                          <button
                            onClick={() => setSelectedEmailHtml(job.renderedHtml)}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-1 transition cursor-pointer font-sans"
                            title="Preview Dispatched HTML Email"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Retry History Details */}
                    {isExpanded && job.retryHistory && job.retryHistory.length > 0 && (
                      <div className="mt-2 p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1.5 text-[11px] font-mono animate-fadeIn">
                        <div className="text-slate-400 font-bold flex items-center gap-1 mb-1">
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          Exponential Backoff Retry Audit Trail:
                        </div>
                        {job.retryHistory.map((att, i) => (
                          <div
                            key={`att-${job.id}-${att.attempt || i}-${i}`}
                            className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-white/5"
                          >
                            <span className="text-amber-300 font-bold">
                              Attempt #{att.attempt}:
                            </span>
                            <span className="text-rose-300 truncate max-w-sm ml-2">
                              {att.error}
                            </span>
                            <span className="text-slate-500 shrink-0 ml-2">
                              {new Date(att.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="p-3.5 bg-slate-950 border-t border-white/5 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between px-5 font-mono gap-2">
          <span>Decoupled Queue Pattern &bull; Exponential backoff (1s, 2s, 4s...) &bull; DLQ Fail-Safe</span>
          <span>SMTP / Ethereal Integration Ready</span>
        </div>
      </div>

      {/* HTML Email Preview Modal */}
      {selectedEmailHtml && (
        <div className="fixed inset-0 z-[10010] overflow-hidden flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-white/20 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                Rendered HTML Email Dispatch Preview
              </h3>
              <button
                onClick={() => setSelectedEmailHtml(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
              <div
                className="bg-transparent rounded-xl overflow-hidden"
                dangerouslySetInnerHTML={{ __html: selectedEmailHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalElement, document.body);
}
