const telemetryService = require("../services/telemetryService");
const orderService = require("../services/orderService");
const socketService = require("../services/socketService");
const emailQueue = require("../services/emailQueue");
const idempotencyService = require("../services/idempotencyService");
const stripeService = require("../services/stripeService");
const db = require("../config/db");

/**
 * Controller for APM Tracing & Observability Endpoints
 */

// GET /api/telemetry/traces
const getTraces = async (req, res) => {
  try {
    const { limit = 50, filter = "all", search = "", minDuration = 0 } = req.query;
    const traces = telemetryService.getTraces({
      limit: parseInt(limit, 10),
      filter,
      search,
      minDuration: parseFloat(minDuration),
    });

    res.status(200).json({
      success: true,
      count: traces.length,
      data: traces,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/telemetry/traces/:traceId
const getTraceById = async (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = telemetryService.getTraceById(traceId);

    if (!trace) {
      return res.status(404).json({
        success: false,
        message: `Trace ID "${traceId}" not found in observability buffer.`,
      });
    }

    res.status(200).json({
      success: true,
      data: trace,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/telemetry/metrics
const getMetrics = async (req, res) => {
  try {
    const metrics = telemetryService.getMetrics();
    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/telemetry/errors
const getErrors = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const errors = telemetryService.getErrorLogs(limit);
    res.status(200).json({
      success: true,
      count: errors.length,
      data: errors,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/telemetry/client-errors
const ingestClientError = async (req, res) => {
  try {
    const { message, stack, url, componentStack, traceId, metadata } = req.body;

    const recorded = telemetryService.recordError({
      traceId,
      source: "frontend",
      path: url || "React Client",
      method: "CLIENT_EXCEPTION",
      statusCode: 400,
      message: message || "Unhandled React Component Error",
      stack: stack || componentStack || null,
      userId: req.user?.id || null,
      metadata: { ...metadata, componentStack },
    });

    res.status(201).json({
      success: true,
      message: "Client error logged to APM buffer",
      errorId: recorded.id,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/telemetry/client-metrics
const ingestClientMetric = async (req, res) => {
  try {
    const metric = req.body;
    const recorded = telemetryService.recordClientMetric(metric);
    res.status(201).json({
      success: true,
      data: recorded,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/telemetry/simulate-traced-checkout
// Runs a detailed end-to-end checkout with explicit instrumented spans across all tiers
const simulateTracedCheckout = async (req, res) => {
  const traceId = req.traceId || telemetryService.generateTraceId("sim_chk");

  try {
    const userId = req.user?.id || 1;
    const idempotencyKey = `idem_e2e_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const shippingAddress = "742 Evergreen Terrace, Springfield, OR";
    const paymentMethod = "stripe_card";

    // 1. Frontend Pre-flight & Validation Span (Simulated Client Tier)
    const clientSpanId = telemetryService.startSpan(traceId, {
      name: "React: Cart State & DOM Event Validation",
      category: "frontend_client",
      service: "React SPA Client",
      attributes: {
        cartItemCount: 2,
        totalAmount: 2499.0,
        idempotencyKey,
        browser: "Chrome 128 (V8)",
      },
    });
    await new Promise((r) => setTimeout(r, 12)); // Simulating client-side payload preparation
    telemetryService.finishSpan(traceId, clientSpanId, { status: "ok" });

    // 2. Reverse Proxy & Network Ingress Span
    const proxySpanId = telemetryService.startSpan(traceId, {
      name: "Nginx: TLS Termination & Rate Limit Check",
      category: "reverse_proxy",
      service: "Nginx 1.25 Alpine",
      attributes: {
        sslProtocol: "TLSv1.3",
        cipher: "TLS_AES_256_GCM_SHA384",
        rateLimitZone: "api_limit",
        sameOrigin: true,
      },
    });
    await new Promise((r) => setTimeout(r, 4));
    telemetryService.finishSpan(traceId, proxySpanId, { status: "ok" });

    // 3. Auth Token Verification Span
    const authSpanId = telemetryService.startSpan(traceId, {
      name: "Express: JWT Auth Verification & User Claims",
      category: "auth",
      service: "Express Middleware",
      attributes: {
        userId,
        algorithm: "HS256",
        role: req.user?.role || "admin",
      },
    });
    await new Promise((r) => setTimeout(r, 3));
    telemetryService.finishSpan(traceId, authSpanId, { status: "ok" });

    // 4. Idempotency Key Lock Span
    const idemSpanId = telemetryService.startSpan(traceId, {
      name: "Idempotency: Key Deduplication Check & Lock",
      category: "idempotency",
      service: "Idempotency Engine (MySQL/Redis)",
      attributes: {
        idempotencyKey,
        ttlSeconds: 86400,
        lockState: "ACQUIRED",
      },
    });
    await new Promise((r) => setTimeout(r, 8));
    telemetryService.finishSpan(traceId, idemSpanId, { status: "ok" });

    // 5. MySQL Connection Pool & ACID Transaction Span
    const dbSpanId = telemetryService.startSpan(traceId, {
      name: "MySQL: InnoDB Transaction & Row-Level Lock",
      category: "database",
      service: "MySQL 8.0 InnoDB",
      attributes: {
        query: "SELECT stock FROM products WHERE id IN (1, 3) FOR UPDATE",
        isolationLevel: "REPEATABLE_READ",
        connectionPool: "active_leased",
      },
    });
    // Run quick DB probe
    const [products] = await db.query("SELECT id, name, price, stock FROM products LIMIT 2");
    await new Promise((r) => setTimeout(r, 14));
    telemetryService.finishSpan(traceId, dbSpanId, {
      status: "ok",
      attributes: { lockedRows: products.length, lockDurationMs: 14.2 },
    });

    // 6. Stripe Payment Gateway Intent Span
    const stripeSpanId = telemetryService.startSpan(traceId, {
      name: "Stripe: PaymentIntent Authorization & Settlement",
      category: "payment_gateway",
      service: "Stripe API v2023-10-16",
      attributes: {
        amount: 249900,
        currency: "usd",
        paymentMethodType: "card",
        gatewayLatencyMs: 24.5,
      },
    });
    await new Promise((r) => setTimeout(r, 22)); // Realistic Stripe test mode network roundtrip
    const simPiId = `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    telemetryService.finishSpan(traceId, stripeSpanId, {
      status: "ok",
      attributes: { paymentIntentId: simPiId, chargeStatus: "succeeded" },
    });

    // 7. Order Insertion & State Commit Span
    const commitSpanId = telemetryService.startSpan(traceId, {
      name: "MySQL: INSERT orders + order_items & COMMIT",
      category: "database",
      service: "MySQL 8.0 InnoDB",
      attributes: {
        table: "orders",
        action: "COMMIT",
      },
    });
    await new Promise((r) => setTimeout(r, 9));
    telemetryService.finishSpan(traceId, commitSpanId, { status: "ok" });

    // 8. WebSocket Broadcast Span
    const wsSpanId = telemetryService.startSpan(traceId, {
      name: "Socket.IO: Real-Time Status Broadcast (Room: admin & user)",
      category: "websocket",
      service: "Socket.IO Server",
      attributes: {
        event: "ORDER_STATUS_UPDATE",
        status: "placed",
        connectedSockets: 4,
      },
    });
    socketService.emitOrderStatusUpdate({
      orderId: 9999,
      userId,
      status: "placed",
      trackingNotes: "E2E Traced Checkout Simulation verified",
      order: {
        id: 9999,
        status: "placed",
        total_amount: 2499.0,
        items: products.map((p) => ({ ...p, quantity: 1 })),
      },
    });
    telemetryService.finishSpan(traceId, wsSpanId, { status: "ok" });

    // 9. Asynchronous Background Email Job Enqueue Span
    const queueSpanId = telemetryService.startSpan(traceId, {
      name: "Worker: Asynchronous Email Queue Dispatch",
      category: "background_queue",
      service: "Email Worker Daemon",
      attributes: {
        jobType: "ORDER_CONFIRMATION",
        priority: "HIGH",
        retryLimit: 3,
      },
    });
    const emailJob = emailQueue.enqueueEmailJob({
      type: "ORDER_CONFIRMATION",
      order: { id: 9999, total_amount: 2499.0 },
      recipientEmail: "customer@excelsior-store.io",
      status: "placed",
      trackingNotes: "Traced simulation confirmation",
    });
    telemetryService.finishSpan(traceId, queueSpanId, {
      status: "ok",
      attributes: { jobId: emailJob.id, queueLength: emailQueue.getQueueMetrics().pendingJobs },
    });

    // 10. HTTP Response Serialization Span
    const respSpanId = telemetryService.startSpan(traceId, {
      name: "Express: JSON Response Serialization & Server-Timing Headers",
      category: "http_server",
      service: "Express API Gateway",
      attributes: {
        responseCode: 200,
        traceId,
      },
    });
    await new Promise((r) => setTimeout(r, 2));
    telemetryService.finishSpan(traceId, respSpanId, { status: "ok" });

    // Get current completed snapshot
    const completedTrace = telemetryService.getTraceById(traceId);

    res.status(200).json({
      success: true,
      message: "End-to-End Traced Checkout executed successfully across all tiers.",
      traceId,
      trace: completedTrace,
      simulatedOrder: {
        id: 9999,
        paymentIntentId: simPiId,
        idempotencyKey,
        totalAmount: 2499.0,
        status: "placed",
      },
    });
  } catch (error) {
    telemetryService.recordError({
      traceId,
      source: "backend",
      path: "/api/telemetry/simulate-traced-checkout",
      method: "POST",
      statusCode: 500,
      message: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
      traceId,
    });
  }
};

module.exports = {
  getTraces,
  getTraceById,
  getMetrics,
  getErrors,
  ingestClientError,
  ingestClientMetric,
  simulateTracedCheckout,
};
