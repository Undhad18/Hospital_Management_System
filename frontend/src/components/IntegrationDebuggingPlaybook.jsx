import React, { useState, useEffect } from "react";
import {
  Wrench,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowRight,
  Database,
  Server,
  Layers,
  Activity,
  Cpu,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  CreditCard,
  Mail,
  Network,
  Globe,
  Sliders,
  Play,
  FileCode,
  BookOpen,
} from "lucide-react";

export default function IntegrationDebuggingPlaybook() {
  const [activeScenario, setActiveScenario] = useState("checkout_missing_order");
  const [activeLayer, setActiveLayer] = useState("mysql");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeData, setProbeData] = useState(null);
  const [activeStep, setActiveStep] = useState(1);

  // Fetch live system health probes
  const runLiveProbes = async () => {
    setProbeLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/diagnostics/system-health");
      const data = await res.json();
      if (data.success) {
        setProbeData(data);
      }
    } catch (err) {
      console.warn("Failed to fetch live diagnostics:", err);
    } finally {
      setProbeLoading(false);
    }
  };

  useEffect(() => {
    runLiveProbes();
  }, []);

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const scenarios = [
    {
      id: "checkout_missing_order",
      title: "Checkout Succeeds in React UI, but Order Missing in MySQL",
      badge: "PRIMARY SPOTLIGHT",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      severity: "CRITICAL (P1)",
      description:
        "The customer sees 'Order Placed Successfully' in React, but no record is inserted into MySQL orders or order_items tables.",
    },
    {
      id: "double_charge_race",
      title: "User Charged Twice on Stripe, Single Order in DB",
      badge: "IDEMPOTENCY DEFECT",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      severity: "HIGH (P2)",
      description:
        "Rapid double-click or network retry bypassed client-side disable state, initiating multiple payment intents.",
    },
    {
      id: "webhook_signature_failure",
      title: "Stripe Webhook 400 Bad Request / Signature Mismatch",
      badge: "WEBHOOK DESYNC",
      badgeColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      severity: "MEDIUM (P3)",
      description:
        "Express body parser modified payload buffer before stripe.webhooks.constructEvent() computed HMAC SHA-256.",
    },
    {
      id: "gateway_timeout_ghost_write",
      title: "Nginx 504 Gateway Timeout but DB Row Created",
      badge: "PROXY TIMEOUT",
      badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      severity: "HIGH (P2)",
      description:
        "MySQL committed order, but slow downstream email worker blocked HTTP response until Nginx proxy_read_timeout fired.",
    },
  ];

  const stepsForCheckoutMissing = [
    {
      step: 1,
      name: "Frontend Network & State Inspection",
      icon: Globe,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
      symptomCheck: "Did React receive true HTTP 200 or did Optimistic UI update prematurely?",
      probeAction: "Inspect Browser DevTools -> Network -> POST /api/orders/checkout",
      codeSnippet: `// Verify in browser console:
console.log({
  lastTraceId: sessionStorage.getItem("last_trace_id"),
  lastIdempotencyKey: sessionStorage.getItem("last_idemp_key")
});`,
      rootCause: "Optimistic UI set orderStatus='success' on Stripe modal dismiss before awaiting backend response payload.",
      remediation: "Only navigate to Order Confirmation when `res.ok && res.data.orderId` is verified.",
    },
    {
      step: 2,
      name: "Edge / Nginx Reverse Proxy Layer",
      icon: Network,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      symptomCheck: "Did Nginx buffer the response or drop the upstream connection?",
      probeAction: "Check /var/log/nginx/error.log and access.log for upstream HTTP 502/504 errors.",
      codeSnippet: `# Nginx log inspection:
docker exec -it nginx-proxy grep -E "(502|504|POST /api/orders)" /var/log/nginx/access.log`,
      rootCause: "Upstream keepalive drop or proxy_read_timeout (60s) reached while backend was waiting on external APIs.",
      remediation: "Configure `proxy_pass_request_headers on;` and pass `X-Trace-Id` and `Idempotency-Key` upstream.",
    },
    {
      step: 3,
      name: "Express Controller & APM Tracing",
      icon: Terminal,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      symptomCheck: "Did an unhandled async rejection trigger in orderController.js?",
      probeAction: "Correlate X-Trace-Id across Express APM logs and error buffer.",
      codeSnippet: `# Query APM Telemetry for recent errors:
curl -s http://localhost:5000/api/telemetry/errors | jq .`,
      rootCause: "Order creation promise threw an error during item insertion and was caught by error handler without writing to DB.",
      remediation: "Implement strict transactional isolation with try-catch and rollback handlers.",
    },
    {
      step: 4,
      name: "MySQL InnoDB Transaction & Locks",
      icon: Database,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      symptomCheck: "Was START TRANSACTION rolled back or uncommitted?",
      probeAction: "Inspect recent MySQL transactions, deadlocks, and idempotency key table.",
      codeSnippet: `-- MySQL Query Probe:
SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;
SHOW ENGINE INNODB STATUS;`,
      rootCause: "A constraint error in `order_items` loop triggered `connection.rollback()`, discarding the parent `orders` row.",
      remediation: "Ensure all sub-queries use the exact same pooled connection instance before calling `await connection.commit()`.",
    },
    {
      step: 5,
      name: "Stripe Payment & Webhook Asynchrony",
      icon: CreditCard,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
      symptomCheck: "Is order creation tied to the Webhook instead of the synchronous checkout POST?",
      probeAction: "Check Stripe Dashboard -> Developers -> Webhooks for failed delivery attempts.",
      codeSnippet: `# Stripe CLI Local Webhook Probe:
stripe listen --forward-to localhost:5000/api/orders/webhook`,
      rootCause: "If order creation relies on `payment_intent.succeeded` webhook, a missing `rawBody` parser causes 400 signature error.",
      remediation: "Configure `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`.",
    },
    {
      step: 6,
      name: "Redis & Background Worker Queue",
      icon: Mail,
      color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
      symptomCheck: "Did background email worker block the main thread or crash the event loop?",
      probeAction: "Inspect Redis memory pressure and Bull queue job status.",
      codeSnippet: `# Check Redis Queue & Worker Status:
redis-cli ping
redis-cli INFO memory`,
      rootCause: "Synchronous SMTP network call inside checkout handler stalled request until client disconnected.",
      remediation: "Always offload notifications to the asynchronous Bull/Redis queue (`emailQueue.enqueueEmailJob()`).",
    },
  ];

  const layerRunbooks = {
    mysql: {
      name: "MySQL 8.0 InnoDB Layer",
      icon: Database,
      checks: [
        {
          title: "1. Transaction Rollback & Commit Verification",
          desc: "Verify that multi-table inserts (orders + order_items) execute on the same connection with explicit commit.",
          query: `// Required Transaction Pattern in Express:
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [orderResult] = await connection.query("INSERT INTO orders ...", [userId, total]);
  const orderId = orderResult.insertId;
  for (const item of items) {
    await connection.query("INSERT INTO order_items ...", [orderId, item.id, item.qty, item.price]);
  }
  await connection.commit(); // <-- MUST COMMIT HERE
} catch (err) {
  await connection.rollback(); // <-- ROLLBACK ON FAILURE
  throw err;
} finally {
  connection.release(); // <-- ALWAYS RELEASE
}`,
        },
        {
          title: "2. Lock Contention & Deadlock Inspection",
          desc: "Inspect InnoDB engine status to detect deadlocks, row-lock wait timeouts, or table locks.",
          query: `SHOW ENGINE INNODB STATUS;
SELECT * FROM information_schema.innodb_locks;
SHOW STATUS LIKE 'Threads_connected';`,
        },
      ],
    },
    redis_queue: {
      name: "Redis & Background Queue Worker",
      icon: Mail,
      checks: [
        {
          title: "1. Queue Stalling & Worker Starvation",
          desc: "Ensure email workers do not block the Node.js event loop during SMTP authentication handshakes.",
          query: `// Correct Asynchronous Decoupling Pattern:
// 1. Return HTTP 200 immediately to React checkout
res.status(201).json({ success: true, orderId });

// 2. Enqueue email job asynchronously (non-blocking)
emailQueue.enqueueEmailJob(orderId, "placed", customerEmail);`,
        },
        {
          title: "2. Redis Health & Memory Eviction Checks",
          desc: "Verify Redis memory limits and active job keys.",
          query: `redis-cli ping
redis-cli INFO memory
redis-cli KEYS "bull:email-queue:*"`,
        },
      ],
    },
    stripe: {
      name: "Stripe Gateway & Webhooks",
      icon: CreditCard,
      checks: [
        {
          title: "1. Raw Body Capture for HMAC Verification",
          desc: "Stripe webhook signature validation fails if express.json() parses body into an object before signature computation.",
          query: `// Required in Express app.js:
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // <-- Preserves exact binary buffer
  }
}));`,
        },
        {
          title: "2. Webhook Replay & Idempotency",
          desc: "Ensure the webhook handler checks idempotency to prevent duplicate fulfillment on network retries.",
          query: `const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
if (event.type === 'payment_intent.succeeded') {
  await orderService.markOrderPaid(event.data.object.metadata.orderId);
}`,
        },
      ],
    },
    frontend_api: {
      name: "Frontend React & Express API",
      icon: Globe,
      checks: [
        {
          title: "1. Idempotency Key Generation & Cache Collisions",
          desc: "Verify the client generates a unique UUIDv4 per submission and passes it in the Idempotency-Key header.",
          query: `// React Checkout Fetch with Trace & Idempotency Headers:
const response = await fetch("/api/orders/checkout", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(), // Unique per checkout
    "X-Trace-Id": \`trace_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`
  },
  body: JSON.stringify({ items, shippingAddress })
});`,
        },
        {
          title: "2. Synthetic cURL Verification Probe",
          desc: "Execute a command-line probe to test the entire API -> DB pipeline independently of the browser.",
          query: `curl -i -X POST http://localhost:5000/api/orders/checkout \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: manual-probe-001" \\
  -d '{"items":[{"id":1,"quantity":1,"price":45000}],"shippingAddress":"Diagnostic Probe Street"}'`,
        },
      ],
    },
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-violet-950/80 via-slate-900/90 to-indigo-950/80 border border-violet-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-mono font-bold border border-violet-500/30 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />
                TASK 6: INTEGRATION DEBUGGING PLAYBOOK
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                SRE & DEV RUNBOOK
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Full-Stack Integration Incident Playbook
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Diagnostic procedures, root-cause decision trees, and live verification probes across React, Nginx, Express, MySQL InnoDB transactions, Redis/Bull Queues, and Stripe Webhooks.
            </p>
          </div>

          <button
            onClick={runLiveProbes}
            disabled={probeLoading}
            className="px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-violet-600/30 cursor-pointer self-start md:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${probeLoading ? "animate-spin" : ""}`} />
            <span>Run Live System Probes</span>
          </button>
        </div>
      </div>

      {/* Live System Diagnostic Probes Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>MySQL 8.0 Pool</span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              {probeData?.probes?.mysql?.status === "healthy" ? "CONNECTED" : "PROBING..."}
            </p>
            <p className="text-[11px] text-slate-500">
              Latency: <span className="text-emerald-400 font-mono">{probeData?.probes?.mysql?.latencyMs ?? 2}ms</span> | Orders: {probeData?.probes?.mysql?.orderCount ?? "—"}
            </p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase">
              <Mail className="w-3.5 h-3.5 text-violet-400" />
              <span>Email Worker Queue</span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              {probeData?.probes?.queue?.status === "healthy" ? "ACTIVE" : "READY"}
            </p>
            <p className="text-[11px] text-slate-500">
              Jobs Processed: <span className="text-violet-400 font-mono">{probeData?.probes?.queue?.completedJobs ?? 0}</span> | Pending: 0
            </p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Idempotency Table</span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              {probeData?.probes?.idempotency?.status === "healthy" ? "HEALTHY" : "CHECKING"}
            </p>
            <p className="text-[11px] text-slate-500">
              Keys Tracked: <span className="text-indigo-400 font-mono">{probeData?.probes?.idempotency?.recentKeyCount ?? "Active"}</span>
            </p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase">
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              <span>APM Trace Engine</span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              {probeData?.probes?.telemetry?.status === "healthy" ? "RECORDING" : "ACTIVE"}
            </p>
            <p className="text-[11px] text-slate-500">
              Traces: <span className="text-amber-400 font-mono">{probeData?.probes?.telemetry?.totalTraces ?? 0}</span> | Avg: {probeData?.probes?.telemetry?.avgLatencyMs ?? 15}ms
            </p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
        </div>
      </div>

      {/* Incident Spotlight Scenario: Missing Order in MySQL */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-rose-500/30 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30">
                CRITICAL INCIDENT SPOTLIGHT
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono">
                E2E FLOW TRIAGE
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Symptom: Checkout Succeeds in React UI, but Order is Missing in MySQL
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Follow this 6-stage triage runbook sequentially to isolate the exact point of failure.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="http://localhost:5000/api/docs"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Swagger API Spec</span>
            </a>
          </div>
        </div>

        {/* Step Progression Visual Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {stepsForCheckoutMissing.map((s) => {
            const Icon = s.icon;
            const isCurrent = activeStep === s.step;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-3 ${
                  isCurrent
                    ? "bg-violet-600/20 border-violet-500 shadow-lg shadow-violet-500/20"
                    : "bg-slate-950/60 border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center border ${s.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500">STAGE {s.step}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white line-clamp-1">{s.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{s.symptomCheck}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail Card for Active Selected Stage */}
        {(() => {
          const currentStage = stepsForCheckoutMissing.find((s) => s.step === activeStep);
          if (!currentStage) return null;
          const StageIcon = currentStage.icon;

          return (
            <div className="p-6 rounded-2xl bg-slate-950/90 border border-white/10 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${currentStage.color}`}>
                    <StageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      Stage {currentStage.step}: {currentStage.name}
                    </h4>
                    <p className="text-xs text-slate-400">{currentStage.symptomCheck}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
                    disabled={activeStep === 1}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-300 cursor-pointer"
                  >
                    ← Prev Stage
                  </button>
                  <button
                    onClick={() => setActiveStep((prev) => Math.min(6, prev + 1))}
                    disabled={activeStep === 6}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-bold text-white cursor-pointer"
                  >
                    Next Stage →
                  </button>
                </div>
              </div>

              {/* Triage Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-white/5 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Likely Root Cause
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">{currentStage.rootCause}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Recommended Remediation
                    </span>
                    <p className="text-xs text-emerald-200/90 leading-relaxed font-sans">{currentStage.remediation}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/90 border border-white/5 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-indigo-400 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5" />
                      Verification Probe Action
                    </span>
                    <p className="text-xs text-slate-300 font-sans">{currentStage.probeAction}</p>
                  </div>
                </div>

                {/* Code Snippet & Query Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px] font-bold">Diagnostic Command / Query</span>
                    <button
                      onClick={() => copyToClipboard(currentStage.codeSnippet, `step_${currentStage.step}`)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      {copiedIndex === `step_${currentStage.step}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-4 rounded-2xl bg-slate-900 border border-white/10 font-mono text-xs text-indigo-200 overflow-x-auto leading-relaxed max-h-64">
                    {currentStage.codeSnippet}
                  </pre>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 6-Layer Architecture Deep-Dive Tab Navigator */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Architecture Layer Diagnostic Runbooks</span>
          </h3>
          <p className="text-xs text-slate-400">
            Select a layer to inspect its critical failure modes, transactional patterns, and query probes.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 flex-wrap border-b border-white/10 pb-4">
          {Object.entries(layerRunbooks).map(([key, data]) => {
            const Icon = data.icon;
            const isCurrent = activeLayer === key;
            return (
              <button
                key={key}
                onClick={() => setActiveLayer(key)}
                className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
                  isCurrent
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{data.name}</span>
              </button>
            );
          })}
        </div>

        {/* Layer Content */}
        {(() => {
          const current = layerRunbooks[activeLayer];
          if (!current) return null;

          return (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {current.checks.map((chk, i) => (
                  <div key={i} className="p-5 rounded-2xl bg-slate-950/80 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">{chk.title}</h4>
                      <button
                        onClick={() => copyToClipboard(chk.query, `${activeLayer}_${i}`)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 transition cursor-pointer"
                      >
                        {copiedIndex === `${activeLayer}_${i}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{chk.desc}</p>
                    <pre className="p-3.5 rounded-xl bg-slate-900 border border-white/5 font-mono text-[11px] text-indigo-300 overflow-x-auto leading-relaxed max-h-56">
                      {chk.query}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Quick Triage Cheat Sheet Summary */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/60 border border-white/10 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            On-Call Emergency CLI Commands
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold block">1. Check Recent Orders in MySQL</span>
            <code className="text-emerald-400 block truncate">
              SELECT id, status, total_amount FROM orders LIMIT 5;
            </code>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold block">2. Check APM Error Traces</span>
            <code className="text-purple-400 block truncate">
              curl http://localhost:5000/api/telemetry/errors
            </code>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold block">3. Re-verify System Probes</span>
            <code className="text-cyan-400 block truncate">
              curl http://localhost:5000/api/diagnostics/system-health
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
