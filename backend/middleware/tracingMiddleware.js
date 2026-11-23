/**
 * End-to-End Tracing Middleware for Express
 * Injects W3C TraceContext, records Request/Response latency, and attaches Server-Timing headers.
 */

const telemetryService = require("../services/telemetryService");

const tracingMiddleware = (req, res, next) => {
  // Ignore static assets and favicon to keep trace buffer focused on API traffic
  if (
    req.path.startsWith("/uploads/") ||
    req.path.endsWith(".ico") ||
    req.path.endsWith(".png") ||
    req.path.endsWith(".jpg")
  ) {
    return next();
  }

  // Extract client Trace ID or generate new distributed ID
  const incomingTraceId =
    req.headers["x-trace-id"] ||
    req.headers["x-correlation-id"] ||
    req.headers["x-request-id"] ||
    (req.headers["traceparent"] ? req.headers["traceparent"].split("-")[1] : null);

  const traceId = incomingTraceId || telemetryService.generateTraceId("trc");
  const parentSpanId = req.headers["x-parent-span-id"] || null;

  // Initialize trace context
  const traceContext = telemetryService.startTrace({
    traceId,
    parentSpanId,
    name: `${req.method} ${req.path}`,
    path: req.path,
    method: req.method,
    clientIp: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
    userAgent: req.headers["user-agent"] || "Unknown Client",
    userId: req.user?.id || null,
  });

  // Attach to request object for downstream controllers and services
  req.traceId = traceId;
  req.traceContext = traceContext;
  req.startSpan = (options) => telemetryService.startSpan(traceId, options);
  req.finishSpan = (spanId, options) => telemetryService.finishSpan(traceId, spanId, options);
  req.withSpan = (options, fn) => telemetryService.withSpan(traceId, options, fn);

  // Set response header so client gets back the matching trace ID immediately
  res.setHeader("X-Trace-Id", traceId);

  // Capture response finish event to close root span and write telemetry
  const originalEnd = res.end;
  let isFinished = false;

  res.on("finish", () => {
    if (isFinished) return;
    isFinished = true;

    // Attach user ID if authenticated downstream
    if (req.user?.id && !traceContext.userId) {
      traceContext.userId = req.user.id;
    }

    const completedTrace = telemetryService.finishTrace(traceId, {
      statusCode: res.statusCode,
      metadata: {
        query: req.query,
        contentLength: res.getHeader("content-length") || 0,
        idempotencyKey: req.headers["idempotency-key"] || null,
      },
    });

    if (completedTrace?.serverTimingHeader && !res.headersSent) {
      try {
        res.setHeader("Server-Timing", completedTrace.serverTimingHeader);
      } catch (e) {
        // Headers may have already flushed for streaming/piped responses
      }
    }
  });

  next();
};

module.exports = tracingMiddleware;
