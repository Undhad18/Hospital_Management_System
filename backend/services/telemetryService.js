/**
 * End-to-End Distributed Telemetry & APM Tracing Service
 * Implements W3C TraceContext standards, Span recording, Server-Timing calculation,
 * and In-Memory Observability Buffers for ShopSphere.
 */

const { performance } = require("perf_hooks");

const MAX_TRACES_BUFFER = 150;
const MAX_ERRORS_BUFFER = 100;

class TelemetryService {
  constructor() {
    this.traces = []; // Circular buffer of completed traces
    this.activeTraces = new Map(); // Currently running traces
    this.errorLogs = []; // Ingested server and client errors
    this.clientMetrics = []; // Frontend performance metrics
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      durations: [],
    };
  }

  /**
   * Generate a unique distributed Trace ID (W3C format or prefixed nanoid)
   */
  generateTraceId(prefix = "trc") {
    const timestamp = Date.now().toString(36);
    const randomBytes = Math.random().toString(36).substring(2, 10);
    const counter = (this.metrics.totalRequests + 1).toString(36);
    return `${prefix}_${timestamp}_${randomBytes}${counter}`;
  }

  /**
   * Generate a Span ID
   */
  generateSpanId(prefix = "span") {
    return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start a new distributed Trace Context
   */
  startTrace({
    traceId,
    parentSpanId = null,
    name = "http_request",
    path = "/",
    method = "GET",
    clientIp = "127.0.0.1",
    userAgent = "Unknown",
    userId = null,
  }) {
    const finalTraceId = traceId || this.generateTraceId();
    const rootSpanId = this.generateSpanId("root");
    const startTimeMs = performance.now();
    const startTimestamp = new Date().toISOString();

    const traceContext = {
      traceId: finalTraceId,
      rootSpanId,
      name,
      path,
      method,
      clientIp,
      userAgent,
      userId,
      startTimeMs,
      startTimestamp,
      spans: [],
      metadata: {},
      status: "in_progress",
      statusCode: null,
      error: null,
    };

    // Add root span
    traceContext.spans.push({
      spanId: rootSpanId,
      parentSpanId: parentSpanId || null,
      name: `HTTP ${method} ${path}`,
      category: "http_server",
      service: "Express API Gateway",
      startTimeMs,
      startOffsetMs: 0,
      durationMs: null,
      status: "ok",
      attributes: {
        method,
        path,
        clientIp,
      },
    });

    this.activeTraces.set(finalTraceId, traceContext);
    return traceContext;
  }

  /**
   * Record a child Span within an active trace
   */
  startSpan(traceId, { name, category = "internal", service = "Express", attributes = {} }) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      return null;
    }

    const spanId = this.generateSpanId();
    const startTimeMs = performance.now();
    const startOffsetMs = Math.max(0, Number((startTimeMs - trace.startTimeMs).toFixed(2)));

    const span = {
      spanId,
      parentSpanId: trace.rootSpanId,
      name,
      category,
      service,
      startTimeMs,
      startOffsetMs,
      durationMs: null,
      status: "ok",
      attributes: { ...attributes },
    };

    trace.spans.push(span);
    return spanId;
  }

  /**
   * Finish a specific span by spanId
   */
  finishSpan(traceId, spanId, { status = "ok", error = null, attributes = {} } = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find((s) => s.spanId === spanId);
    if (!span) return;

    const endTimeMs = performance.now();
    const durationMs = Math.max(0.01, Number((endTimeMs - span.startTimeMs).toFixed(2)));
    span.durationMs = durationMs;
    span.status = status;
    if (error) {
      span.error = typeof error === "string" ? error : error.message;
      span.status = "error";
    }
    if (attributes && Object.keys(attributes).length > 0) {
      span.attributes = { ...span.attributes, ...attributes };
    }
  }

  /**
   * Wrap an async operation inside an automatic Span
   */
  async withSpan(traceId, { name, category, service, attributes = {} }, fn) {
    if (!traceId || !this.activeTraces.has(traceId)) {
      return await fn();
    }

    const spanId = this.startSpan(traceId, { name, category, service, attributes });
    try {
      const result = await fn();
      this.finishSpan(traceId, spanId, { status: "ok" });
      return result;
    } catch (err) {
      this.finishSpan(traceId, spanId, { status: "error", error: err });
      throw err;
    }
  }

  /**
   * Complete and archive an active trace
   */
  finishTrace(traceId, { statusCode = 200, error = null, metadata = {} } = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    const endTimeMs = performance.now();
    const totalDurationMs = Math.max(0.1, Number((endTimeMs - trace.startTimeMs).toFixed(2)));

    // Close root span
    const rootSpan = trace.spans.find((s) => s.spanId === trace.rootSpanId);
    if (rootSpan) {
      rootSpan.durationMs = totalDurationMs;
      rootSpan.status = statusCode >= 400 ? "error" : "ok";
      if (error) rootSpan.error = typeof error === "string" ? error : error.message;
    }

    // Close any unclosed child spans
    trace.spans.forEach((span) => {
      if (span.durationMs === null) {
        span.durationMs = Math.max(0.01, Number((endTimeMs - span.startTimeMs).toFixed(2)));
      }
      // Remove raw startTimeMs from finalized JSON output to keep payload light
      delete span.startTimeMs;
    });

    delete trace.startTimeMs;

    trace.totalDurationMs = totalDurationMs;
    trace.status = statusCode >= 400 ? "error" : "success";
    trace.statusCode = statusCode;
    trace.metadata = { ...trace.metadata, ...metadata };
    trace.endTimestamp = new Date().toISOString();

    if (error) {
      trace.error = {
        message: typeof error === "string" ? error : error.message,
        stack: error?.stack || null,
      };
      this.recordError({
        traceId,
        source: "backend",
        path: trace.path,
        method: trace.method,
        statusCode,
        message: trace.error.message,
        stack: trace.error.stack,
        userId: trace.userId,
      });
    }

    // Calculate Server-Timing header value
    trace.serverTimingHeader = this.buildServerTimingHeader(trace);

    // Update global metrics
    this.metrics.totalRequests += 1;
    if (statusCode >= 400) {
      this.metrics.totalErrors += 1;
    }
    this.metrics.durations.push(totalDurationMs);
    if (this.metrics.durations.length > 500) {
      this.metrics.durations.shift();
    }

    // Add to circular buffer
    this.traces.unshift(trace);
    if (this.traces.length > MAX_TRACES_BUFFER) {
      this.traces.pop();
    }

    this.activeTraces.delete(traceId);
    return trace;
  }

  /**
   * Build standard W3C Server-Timing header
   * Example: Server-Timing: total;dur=45.2, db;dur=12.1;desc="MySQL Lock", stripe;dur=18.5;desc="Stripe PaymentIntent"
   */
  buildServerTimingHeader(trace) {
    const parts = [`total;dur=${trace.totalDurationMs};desc="Total Request Latency"`];

    const categoryAggregates = {};
    trace.spans.forEach((span) => {
      if (span.spanId !== trace.rootSpanId && span.durationMs) {
        const key = span.category || "app";
        categoryAggregates[key] = (categoryAggregates[key] || 0) + span.durationMs;
      }
    });

    Object.entries(categoryAggregates).forEach(([cat, dur]) => {
      const sanitizedName = cat.replace(/[^a-zA-Z0-9_-]/g, "_");
      parts.push(`${sanitizedName};dur=${dur.toFixed(2)};desc="${cat.toUpperCase()}"`);
    });

    return parts.join(", ");
  }

  /**
   * Record Server or Ingested Client Error
   */
  recordError({
    traceId = null,
    source = "backend",
    path = "unknown",
    method = "unknown",
    statusCode = 500,
    message,
    stack = null,
    userId = null,
    metadata = {},
  }) {
    const errorEntry = {
      id: `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      traceId: traceId || this.generateTraceId("err_trace"),
      source, // 'backend' | 'frontend' | 'database' | 'stripe'
      path,
      method,
      statusCode,
      message: message || "Unknown application exception",
      stack: stack || null,
      userId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.errorLogs.unshift(errorEntry);
    if (this.errorLogs.length > MAX_ERRORS_BUFFER) {
      this.errorLogs.pop();
    }

    return errorEntry;
  }

  /**
   * Record Frontend Client Metrics (Web Vitals / Client Fetch Latencies)
   */
  recordClientMetric(metric) {
    const entry = {
      id: `m_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      ...metric,
    };
    this.clientMetrics.unshift(entry);
    if (this.clientMetrics.length > 100) {
      this.clientMetrics.pop();
    }
    return entry;
  }

  /**
   * Get filtered traces
   */
  getTraces({ limit = 50, filter = "all", search = "", minDuration = 0 }) {
    let result = [...this.traces];

    if (filter === "errors") {
      result = result.filter((t) => t.status === "error" || t.statusCode >= 400);
    } else if (filter === "checkout") {
      result = result.filter((t) => t.path.includes("checkout") || t.path.includes("order") || t.path.includes("simulate-traced"));
    } else if (filter === "slow") {
      result = result.filter((t) => t.totalDurationMs >= 50);
    }

    if (minDuration > 0) {
      result = result.filter((t) => t.totalDurationMs >= Number(minDuration));
    }

    if (search && search.trim() !== "") {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.traceId.toLowerCase().includes(q) ||
          t.path.toLowerCase().includes(q) ||
          (t.error?.message && t.error.message.toLowerCase().includes(q))
      );
    }

    return result.slice(0, Math.min(result.length, limit));
  }

  /**
   * Get trace details by ID
   */
  getTraceById(traceId) {
    const found = this.traces.find((t) => t.traceId === traceId);
    if (found) return found;

    // Check if it's currently active
    const active = this.activeTraces.get(traceId);
    if (active) return active;

    return null;
  }

  /**
   * Get Aggregated APM Performance Metrics
   */
  getMetrics() {
    const durations = [...this.metrics.durations].sort((a, b) => a - b);
    const total = durations.length;

    const p50 = total > 0 ? durations[Math.floor(total * 0.5)] : 0;
    const p95 = total > 0 ? durations[Math.floor(total * 0.95)] : 0;
    const p99 = total > 0 ? durations[Math.floor(total * 0.99)] : 0;
    const avg = total > 0 ? Number((durations.reduce((s, v) => s + v, 0) / total).toFixed(2)) : 0;

    const errorRatePct =
      this.metrics.totalRequests > 0
        ? Number(((this.metrics.totalErrors / this.metrics.totalRequests) * 100).toFixed(2))
        : 0;

    // Breakdown by Category
    const categoryStats = {};
    this.traces.slice(0, 50).forEach((t) => {
      t.spans.forEach((s) => {
        if (s.durationMs && s.category) {
          if (!categoryStats[s.category]) {
            categoryStats[s.category] = { totalMs: 0, count: 0 };
          }
          categoryStats[s.category].totalMs += s.durationMs;
          categoryStats[s.category].count += 1;
        }
      });
    });

    const categories = Object.entries(categoryStats).map(([name, stat]) => ({
      name,
      avgMs: Number((stat.totalMs / (stat.count || 1)).toFixed(2)),
      sampleCount: stat.count,
    }));

    return {
      totalRequests: this.metrics.totalRequests,
      totalErrors: this.metrics.totalErrors,
      errorRatePct,
      latency: {
        avgMs: avg,
        p50Ms: Number(p50.toFixed(2)),
        p95Ms: Number(p95.toFixed(2)),
        p99Ms: Number(p99.toFixed(2)),
      },
      categories,
      activeTracesCount: this.activeTraces.size,
      recentErrorsCount: this.errorLogs.length,
      sampleBufferSize: this.traces.length,
    };
  }

  /**
   * Get recent error logs
   */
  getErrorLogs(limit = 50) {
    return this.errorLogs.slice(0, limit);
  }
}

// Export singleton instance
module.exports = new TelemetryService();
