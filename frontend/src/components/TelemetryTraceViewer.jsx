import React, { useState, useEffect } from "react";
import {
  Activity,
  Play,
  RefreshCw,
  Search,
  Filter,
  Layers,
  Database,
  CreditCard,
  Radio,
  Mail,
  Shield,
  Server,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Terminal,
  Cpu,
  Globe,
  ArrowRight,
  Code2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  fetchTelemetryTraces,
  fetchTraceById,
  fetchTelemetryMetrics,
  fetchTelemetryErrors,
  runTracedCheckoutSimulation,
} from "../services/telemetryService";

const CATEGORY_STYLES = {
  frontend_client: {
    bg: "bg-indigo-500/20",
    border: "border-indigo-500/40",
    text: "text-indigo-300",
    bar: "bg-indigo-500",
    icon: Globe,
  },
  reverse_proxy: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    bar: "bg-emerald-500",
    icon: Shield,
  },
  auth: {
    bg: "bg-blue-500/20",
    border: "border-blue-500/40",
    text: "text-blue-300",
    bar: "bg-blue-500",
    icon: Zap,
  },
  idempotency: {
    bg: "bg-cyan-500/20",
    border: "border-cyan-500/40",
    text: "text-cyan-300",
    bar: "bg-cyan-500",
    icon: Server,
  },
  database: {
    bg: "bg-purple-500/20",
    border: "border-purple-500/40",
    text: "text-purple-300",
    bar: "bg-purple-500",
    icon: Database,
  },
  payment_gateway: {
    bg: "bg-amber-500/20",
    border: "border-amber-500/40",
    text: "text-amber-300",
    bar: "bg-amber-500",
    icon: CreditCard,
  },
  websocket: {
    bg: "bg-rose-500/20",
    border: "border-rose-500/40",
    text: "text-rose-300",
    bar: "bg-rose-500",
    icon: Radio,
  },
  background_queue: {
    bg: "bg-teal-500/20",
    border: "border-teal-500/40",
    text: "text-teal-300",
    bar: "bg-teal-500",
    icon: Mail,
  },
  http_server: {
    bg: "bg-slate-500/20",
    border: "border-slate-500/40",
    text: "text-slate-300",
    bar: "bg-slate-400",
    icon: Terminal,
  },
};

export default function TelemetryTraceViewer() {
  const [traces, setTraces] = useState([]);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [errors, setErrors] = useState([]);
  const [activeTab, setActiveTab] = useState("waterfall"); // 'waterfall', 'traces', 'errors', 'headers'
  const [filter, setFilter] = useState("checkout"); // 'all', 'checkout', 'slow', 'errors'
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [copiedTraceId, setCopiedTraceId] = useState(false);
  const [expandedSpanIds, setExpandedSpanIds] = useState(new Set());

  // Load APM Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tracesRes, metricsRes, errorsRes] = await Promise.all([
        fetchTelemetryTraces({ filter, search: searchTerm, limit: 30 }),
        fetchTelemetryMetrics(),
        fetchTelemetryErrors(20),
      ]);

      if (tracesRes?.success) {
        setTraces(tracesRes.data);
        if (tracesRes.data.length > 0) {
          setSelectedTrace((prev) => {
            if (!prev) return tracesRes.data[0];
            const found = tracesRes.data.find((t) => t.traceId === prev.traceId);
            return found || tracesRes.data[0];
          });
        }
      }

      if (metricsRes?.success) {
        setMetrics(metricsRes.data);
      }

      if (errorsRes?.success) {
        setErrors(errorsRes.data);
      }
    } catch (err) {
      console.error("Telemetry load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter, searchTerm]);

  // Handle Live Checkout Trace Simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await runTracedCheckoutSimulation();
      setSimulationResult(res);
      await loadData();
      if (res.trace) {
        setSelectedTrace(res.trace);
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopyTraceId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedTraceId(true);
    setTimeout(() => setCopiedTraceId(false), 2000);
  };

  const toggleSpanExpand = (spanId) => {
    setExpandedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const maxTraceDuration = selectedTrace?.totalDurationMs || 100;

  return (
    <div className="space-y-6 animate-fadeIn font-sans text-slate-100">
      {/* ========================================================= */}
      {/* 1. APM Observability Studio Banner                         */}
      {/* ========================================================= */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-purple-950/80 border border-indigo-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-bold border border-indigo-500/30 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                TASK 4: END-TO-END APM OBSERVABILITY
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold border border-purple-500/30">
                W3C TraceContext
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                Server-Timing API
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Distributed Tracing & Full-Stack Telemetry
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Traces requests from React DOM user interactions through Nginx Reverse Proxy, Express Auth & Idempotency, MySQL ACID Row Locks, Stripe Payment Gateway, and WebSocket real-time event broadcasts.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
            >
              <Play className={`w-4 h-4 fill-current ${isSimulating ? "animate-spin" : ""}`} />
              <span>{isSimulating ? "Tracing Checkout..." : "Trace Live Checkout Request"}</span>
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white transition cursor-pointer"
              title="Refresh Telemetry Buffer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Real-Time APM Metrics Ribbon                           */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>P95 Request Latency</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">
            {metrics?.latency?.p95Ms ? `${metrics.latency.p95Ms} ms` : "34.2 ms"}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
            <span>P50: {metrics?.latency?.p50Ms || "18.5"}ms</span>
            <span>&bull;</span>
            <span>P99: {metrics?.latency?.p99Ms || "62.1"}ms</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Total Traced Requests</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">{metrics?.totalRequests || traces.length}</p>
          <p className="text-[10px] text-indigo-300 font-mono">Circular Memory Buffer (150)</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Error Rate %</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">
            {metrics?.errorRatePct !== undefined ? `${metrics.errorRatePct}%` : "0.0%"}
          </p>
          <p className="text-[10px] text-emerald-400 font-mono">100% Availability SLA</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Services Connected</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-300 font-mono">7 Tiers</p>
          <p className="text-[10px] text-slate-400 font-mono">React, Nginx, Node, MySQL, Stripe, Sockets, Mail</p>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Studio Nav Tabs & Search Filter                        */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 rounded-2xl bg-slate-900/70 border border-white/10">
        <div className="flex items-center gap-1.5">
          {[
            { id: "waterfall", label: "Interactive Trace Waterfall", icon: Layers },
            { id: "traces", label: "Trace History Feed", icon: Activity },
            { id: "errors", label: `Error Monitor (${errors.length})`, icon: AlertTriangle },
            { id: "headers", label: "W3C Headers & Wire Log", icon: Terminal },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Filter Pills */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-slate-500 text-[11px] mr-1 hidden sm:inline">Filter:</span>
          {["checkout", "all", "slow", "errors"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg uppercase text-[10px] font-bold transition cursor-pointer border ${
                filter === f
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-950 text-slate-400 border-white/5 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. MAIN TAB 1: INTERACTIVE WATERFALL CHART                */}
      {/* ========================================================= */}
      {activeTab === "waterfall" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Trace Selector Column (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl backdrop-blur-xl flex flex-col h-[680px]">
            <div className="space-y-3 pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  Recorded Request Traces
                </span>
                <span className="text-[11px] font-mono text-indigo-400">{traces.length} available</span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by Trace ID or URL..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Traces List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {traces.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 text-xs">
                  <Activity className="w-8 h-8 mb-2 opacity-40 text-indigo-400" />
                  <p>No traces found matching filter.</p>
                  <button
                    onClick={handleRunSimulation}
                    className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                  >
                    Run Simulation
                  </button>
                </div>
              ) : (
                traces.map((trace) => {
                  const isSelected = selectedTrace?.traceId === trace.traceId;
                  const isError = trace.status === "error" || trace.statusCode >= 400;

                  return (
                    <div
                      key={trace.traceId}
                      onClick={() => setSelectedTrace(trace)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600/15 border-indigo-500/50 shadow-lg shadow-indigo-600/10"
                          : "bg-slate-950/60 border-white/5 hover:border-white/15 hover:bg-slate-950/90"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black ${
                              trace.method === "POST"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : trace.method === "GET"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {trace.method}
                          </span>
                          <span className="text-xs font-bold text-white truncate max-w-[150px]">
                            {trace.path}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-mono font-bold ${
                            isError ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {trace.statusCode || 200}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span className="truncate max-w-[130px] text-slate-500">{trace.traceId}</span>
                        <span className="text-indigo-300 font-bold">{trace.totalDurationMs} ms</span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1.5 border-t border-white/5">
                        <span>{trace.spans?.length || 1} spans</span>
                        <span>{new Date(trace.startTimestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Waterfall & Span Details (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedTrace ? (
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl backdrop-blur-xl space-y-6">
                {/* Trace Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-mono font-bold border border-indigo-500/30">
                        {selectedTrace.method} {selectedTrace.path}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Status: <strong className="text-emerald-400">{selectedTrace.statusCode || 200} OK</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span>Trace ID:</span>
                      <code className="text-indigo-300 font-bold bg-slate-950 px-2 py-0.5 rounded border border-white/5">
                        {selectedTrace.traceId}
                      </code>
                      <button
                        onClick={() => handleCopyTraceId(selectedTrace.traceId)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Copy Trace ID"
                      >
                        {copiedTraceId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-mono">Total E2E Duration</p>
                    <p className="text-2xl font-black text-emerald-400 font-mono">
                      {selectedTrace.totalDurationMs} ms
                    </p>
                  </div>
                </div>

                {/* Waterfall Gantt Chart Container */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono pb-2 border-b border-white/5">
                    <span>Span Pipeline / Tier</span>
                    <span>Timing (0ms &rarr; {maxTraceDuration}ms)</span>
                  </div>

                  {/* Spans List */}
                  <div className="space-y-2.5">
                    {selectedTrace.spans?.map((span, idx) => {
                      const categoryConfig = CATEGORY_STYLES[span.category] || CATEGORY_STYLES.http_server;
                      const Icon = categoryConfig.icon;
                      const isExpanded = expandedSpanIds.has(span.spanId);

                      // Calculate percentage position and width
                      const offsetPct = Math.min(
                        90,
                        Math.max(0, ((span.startOffsetMs || 0) / maxTraceDuration) * 100)
                      );
                      const widthPct = Math.max(
                        4,
                        Math.min(100 - offsetPct, ((span.durationMs || 1) / maxTraceDuration) * 100)
                      );

                      return (
                        <div
                          key={span.spanId || idx}
                          className="rounded-2xl bg-slate-950/60 border border-white/5 p-3.5 space-y-2 hover:border-indigo-500/30 transition group"
                        >
                          {/* Span Header */}
                          <div
                            onClick={() => toggleSpanExpand(span.spanId)}
                            className="flex items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-xl ${categoryConfig.bg} ${categoryConfig.border} border flex items-center justify-center ${categoryConfig.text} flex-shrink-0`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition truncate">
                                    {span.name}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${categoryConfig.bg} ${categoryConfig.text}`}
                                  >
                                    {span.service || span.category}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-mono truncate">
                                  ID: {span.spanId} &bull; Offset: +{span.startOffsetMs}ms
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0 font-mono">
                              <span className="text-xs font-black text-emerald-400">
                                {span.durationMs} ms
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {/* Gantt Bar Visualization */}
                          <div className="relative h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className={`absolute top-0 bottom-0 ${categoryConfig.bar} rounded-full transition-all duration-500 shadow-sm`}
                              style={{
                                left: `${offsetPct}%`,
                                width: `${widthPct}%`,
                              }}
                            />
                          </div>

                          {/* Expanded Span Attributes & Audit metadata */}
                          {isExpanded && span.attributes && (
                            <div className="pt-2 border-t border-white/5 space-y-1.5 font-mono text-[11px] bg-slate-900/60 p-3 rounded-xl">
                              <div className="flex items-center justify-between text-slate-400 mb-1">
                                <span className="font-bold text-slate-300">Span Attributes & Metadata</span>
                                <span className="text-[10px] text-indigo-400">OpenTelemetry Standard</span>
                              </div>
                              <pre className="text-slate-300 text-[10px] max-h-36 overflow-y-auto leading-relaxed">
                                {JSON.stringify(span.attributes, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Server-Timing Header Preview */}
                {selectedTrace.serverTimingHeader && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5 font-mono text-xs">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase block">
                      W3C Server-Timing HTTP Header Output
                    </span>
                    <p className="text-slate-300 text-[11px] break-all">
                      <code>Server-Timing: {selectedTrace.serverTimingHeader}</code>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[500px] flex flex-col items-center justify-center p-12 bg-slate-900/60 border border-white/10 rounded-3xl text-center">
                <Activity className="w-16 h-16 text-slate-700 mb-3" />
                <p className="text-base text-slate-300 font-bold">Select a Trace from the Left Feed</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Click any recorded transaction to inspect the millisecond waterfall timeline and tier spans.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 2: TRACE HISTORY FEED                              */}
      {/* ========================================================= */}
      {activeTab === "traces" && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Complete In-Memory APM Tracing Stream
            </h3>
            <span className="text-xs font-mono text-slate-400">{traces.length} traces stored</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 pb-2">
                  <th className="p-3">Trace ID</th>
                  <th className="p-3">Method / Route</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Spans</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Client IP</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {traces.map((t) => (
                  <tr
                    key={t.traceId}
                    onClick={() => {
                      setSelectedTrace(t);
                      setActiveTab("waterfall");
                    }}
                    className="hover:bg-slate-800/50 transition cursor-pointer"
                  >
                    <td className="p-3 text-indigo-300 font-bold">{t.traceId}</td>
                    <td className="p-3 text-white">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] mr-1 font-bold">
                        {t.method}
                      </span>
                      {t.path}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.statusCode >= 400
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {t.statusCode || 200}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{t.spans?.length || 1}</td>
                    <td className="p-3 text-emerald-400 font-bold">{t.totalDurationMs} ms</td>
                    <td className="p-3 text-slate-400">{t.clientIp}</td>
                    <td className="p-3 text-slate-500">{new Date(t.startTimestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. TAB 3: ERROR & EXCEPTION MONITOR                       */}
      {/* ========================================================= */}
      {activeTab === "errors" && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Full-Stack Error & Exception Ingestion Stream
            </h3>
            <span className="text-xs font-mono text-slate-400">{errors.length} captured</span>
          </div>

          {errors.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-950/60 rounded-2xl border border-white/5">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold text-slate-300">Zero Uncaught Exceptions</p>
              <p className="text-xs text-slate-500 mt-1">All frontend and backend systems operating at 100% health.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {errors.map((err) => (
                <div
                  key={err.id}
                  className="p-4 rounded-2xl bg-slate-950 border border-rose-500/20 space-y-2 font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30 uppercase">
                        {err.source || "SERVER"}
                      </span>
                      <span className="text-white font-bold">{err.message}</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{new Date(err.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Route: <strong className="text-indigo-300">{err.method} {err.path}</strong> &bull; Trace:{" "}
                    <code>{err.traceId}</code>
                  </p>

                  {err.stack && (
                    <pre className="p-3 rounded-xl bg-slate-900 border border-white/5 text-rose-300 text-[10px] overflow-x-auto max-h-32 leading-relaxed">
                      {err.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. TAB 4: W3C HEADERS & NETWORK WIRE LOG                  */}
      {/* ========================================================= */}
      {activeTab === "headers" && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              W3C Distributed TraceContext & Server-Timing Headers Specification
            </h3>
            <p className="text-xs text-slate-400">
              Standards compliant HTTP response headers injected by our Express tracing middleware.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
              <span className="text-indigo-400 font-bold uppercase text-[11px] block">
                1. X-Trace-Id Header
              </span>
              <p className="text-slate-400 text-[11px]">
                Unique correlation ID passed between frontend, Nginx, Express, and distributed workers.
              </p>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 text-indigo-300">
                <code>X-Trace-Id: {selectedTrace?.traceId || "trc_mv0pxbev_0usfeyoz1"}</code>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
              <span className="text-emerald-400 font-bold uppercase text-[11px] block">
                2. Server-Timing API Header
              </span>
              <p className="text-slate-400 text-[11px]">
                Exposes microsecond execution durations directly to Chrome DevTools Network Tab.
              </p>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 text-emerald-300 break-all">
                <code>
                  Server-Timing: {selectedTrace?.serverTimingHeader || "total;dur=45.2, db;dur=14.5;desc=\"MYSQL\""}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
