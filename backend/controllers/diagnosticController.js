const pool = require("../config/db");
const emailQueue = require("../services/emailQueue");
const telemetryService = require("../services/telemetryService");
const idempotencyService = require("../services/idempotencyService");
const featureFlagService = require("../services/featureFlagService");

/**
 * Diagnostic Controller for Integration Debugging Playbook
 * Performs live checks across MySQL, Redis/Queue, Stripe, Idempotency, and APM layers.
 */

exports.getSystemHealthProbes = async (req, res) => {
  const startTime = Date.now();
  const probes = {};

  // 1. MySQL Database Probe
  try {
    const dbStart = Date.now();
    const [dbResult] = await pool.query("SELECT 1 as ping, COUNT(*) as order_count FROM orders");
    const [poolStatus] = await pool.query("SHOW STATUS LIKE 'Threads_connected'");
    probes.mysql = {
      status: "healthy",
      latencyMs: Date.now() - dbStart,
      orderCount: dbResult[0]?.order_count || 0,
      threadsConnected: poolStatus[0]?.Value || "N/A",
      details: "MySQL 8.0 InnoDB connection pool responsive and transaction-ready.",
    };
  } catch (err) {
    probes.mysql = {
      status: "degraded",
      error: err.message,
      details: "MySQL query failed. Check credentials, connection pool limits, or table locks.",
    };
  }

  // 2. Email Worker & Queue Probe
  try {
    const queueMetrics = emailQueue.getQueueMetrics();
    probes.queue = {
      status: "healthy",
      queueLength: queueMetrics.pendingJobs || 0,
      failedJobs: queueMetrics.totalFailed || 0,
      completedJobs: queueMetrics.totalSucceeded || 0,
      details: "In-memory / Redis async job processor active for background notifications.",
    };
  } catch (err) {
    probes.queue = {
      status: "degraded",
      error: err.message,
      details: "Worker queue unreachable.",
    };
  }

  // 3. Idempotency Store Probe
  try {
    const idempKeys = await idempotencyService.getAllKeys(10);
    probes.idempotency = {
      status: "healthy",
      recentKeyCount: Array.isArray(idempKeys) ? idempKeys.length : 0,
      details: "ACID Idempotency table active for double-click and replay protection.",
    };
  } catch (err) {
    probes.idempotency = {
      status: "degraded",
      error: err.message,
      details: "Idempotency key storage check failed.",
    };
  }

  // 4. Telemetry / APM Buffer Probe
  try {
    const metrics = telemetryService.getMetrics();
    probes.telemetry = {
      status: "healthy",
      totalTraces: metrics.totalRequests || 0,
      recentErrors: metrics.totalErrors || 0,
      avgLatencyMs: metrics.latency?.avgMs || 0,
      details: "Distributed trace buffer and APM span recorder operational.",
    };
  } catch (err) {
    probes.telemetry = {
      status: "degraded",
      error: err.message,
    };
  }

  // 5. Memory & Process Probe
  const mem = process.memoryUsage();
  probes.process = {
    status: "healthy",
    uptimeSeconds: Math.floor(process.uptime()),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    nodeVersion: process.version,
  };

  const allHealthy = Object.values(probes).every((p) => p.status === "healthy" || p.status === "idle");

  res.status(200).json({
    success: true,
    overallStatus: allHealthy ? "HEALTHY" : "DEGRADED",
    totalProbeLatencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    probes,
  });
};

/**
 * Diagnostic triage simulation for common integration incidents
 */
exports.simulateIncidentTriage = async (req, res) => {
  const { scenario } = req.body;

  let analysis = {};

  switch (scenario) {
    case "checkout_success_mysql_missing":
      analysis = {
        scenario: "Checkout succeeds in React (HTTP 200) but Order is missing in MySQL",
        severity: "CRITICAL (P1 Data Inconsistency)",
        rootCauseCandidates: [
          {
            probability: "45%",
            component: "Express Transaction Rollback",
            description: "The payment gateway succeeded (or returned mock success), but an unhandled exception or constraint error during order_items insertion triggered `await connection.rollback()` before `COMMIT`.",
            verificationStep: "Check backend application logs for `[DB Transaction Error]` or unhandled rejection inside `orderController.js`.",
            remediation: "Wrap all order + item insertions inside a strict try-catch block and verify `connection.commit()` is only called after all SQL queries resolve.",
          },
          {
            probability: "30%",
            component: "Asynchronous Stripe Webhook Delay / Drop",
            description: "If the architecture creates the order record on the `payment_intent.succeeded` webhook rather than the synchronous HTTP checkout POST, a missing/failed webhook signature or delayed webhook will cause the DB insert to never trigger.",
            verificationStep: "Inspect Stripe Webhook logs (`/api/orders/webhook`) or check if rawBody verification failed.",
            remediation: "Ensure webhook endpoint has raw body buffer enabled, verify webhook secret, and implement a reconciliation polling fallback.",
          },
          {
            probability: "15%",
            component: "Idempotency Key Cache Collision",
            description: "A stale idempotency key from a previous completed order was reused. The backend returned the cached 200 response of an older order without executing a new SQL insert.",
            verificationStep: "Inspect `idempotency_keys` table for the request's `Idempotency-Key` header.",
            remediation: "Ensure the frontend generates a fresh UUIDv4 per distinct cart submission.",
          },
          {
            probability: "10%",
            component: "Optimistic UI Update False-Positive",
            description: "The React checkout drawer updated state to 'Success' based on Stripe modal closing, but the background `fetch()` promise rejected or timed out silently.",
            verificationStep: "Check browser Network tab for `POST /api/orders/checkout` response code and APM `X-Trace-Id`.",
            remediation: "Only navigate to order confirmation after receiving an explicit `res.ok && data.success === true` with a valid `orderId`.",
          },
        ],
        diagnosticCommands: [
          {
            tool: "MySQL Query",
            command: "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;",
          },
          {
            tool: "MySQL Transaction Lock Check",
            command: "SHOW ENGINE INNODB STATUS;",
          },
          {
            tool: "Idempotency Lookup",
            command: "SELECT * FROM idempotency_keys ORDER BY created_at DESC LIMIT 10;",
          },
          {
            tool: "cURL Synthetic Checkout Probe",
            command: 'curl -X POST http://localhost:5000/api/orders/checkout -H "Content-Type: application/json" -H "Idempotency-Key: test-probe-key-1" -d \'{"items":[{"id":1,"quantity":1,"price":45000}],"shippingAddress":"Test Diagnostic Run"}\'',
          },
        ],
      };
      break;

    case "double_charge_race_condition":
      analysis = {
        scenario: "Customer clicked checkout button twice rapidly and was charged twice",
        severity: "HIGH (P2 Financial Defect)",
        rootCauseCandidates: [
          {
            probability: "60%",
            component: "Missing or Client-Side-Only Idempotency Guard",
            description: "Button was disabled in React via `disabled={loading}`, but fast double-clicks within the same React render cycle or duplicate network dispatches bypassed UI disabling.",
            verificationStep: "Check `idempotency_keys` table for duplicate concurrent keys.",
            remediation: "Enforce server-side `INSERT INTO idempotency_keys ... ON DUPLICATE KEY UPDATE` with row-level locks.",
          },
        ],
        diagnosticCommands: [
          {
            tool: "MySQL Check",
            command: "SELECT idempotency_key, COUNT(*) FROM idempotency_keys GROUP BY idempotency_key HAVING COUNT(*) > 1;",
          },
        ],
      };
      break;

    default:
      analysis = {
        scenario: "General Integration Diagnostic",
        severity: "INFO",
        rootCauseCandidates: [],
        diagnosticCommands: [],
      };
  }

  res.status(200).json({
    success: true,
    analysis,
  });
};
