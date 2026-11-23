const API_BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";

/**
 * Generate a client-side W3C / distributed correlation Trace ID
 */
export const generateClientTraceId = (prefix = "cli_trc") => {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${ts}_${rnd}`;
};

/**
 * Fetch list of recent APM traces from backend
 */
export const fetchTelemetryTraces = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/api/telemetry/traces?${query}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": generateClientTraceId(),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch traces: HTTP ${res.status}`);
  }
  return await res.json();
};

/**
 * Fetch single trace waterfall details
 */
export const fetchTraceById = async (traceId) => {
  const res = await fetch(`${API_BASE_URL}/api/telemetry/traces/${traceId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": generateClientTraceId(),
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch trace details: HTTP ${res.status}`);
  }
  return await res.json();
};

/**
 * Fetch Aggregated APM Metrics
 */
export const fetchTelemetryMetrics = async () => {
  const res = await fetch(`${API_BASE_URL}/api/telemetry/metrics`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch APM metrics: HTTP ${res.status}`);
  }
  return await res.json();
};

/**
 * Fetch Error Logs
 */
export const fetchTelemetryErrors = async (limit = 50) => {
  const res = await fetch(`${API_BASE_URL}/api/telemetry/errors?limit=${limit}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch error logs: HTTP ${res.status}`);
  }
  return await res.json();
};

/**
 * Run Live End-to-End Traced Checkout Simulation
 */
export const runTracedCheckoutSimulation = async () => {
  const clientTraceId = generateClientTraceId("e2e_chk");
  const startTime = performance.now();

  const res = await fetch(`${API_BASE_URL}/api/telemetry/simulate-traced-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": clientTraceId,
    },
  });

  const durationMs = Math.round(performance.now() - startTime);
  const data = await res.json();

  return {
    ...data,
    clientDurationMs: durationMs,
    clientTraceId,
    serverTiming: res.headers.get("Server-Timing") || null,
    responseTraceId: res.headers.get("X-Trace-Id") || clientTraceId,
  };
};

/**
 * Report Unhandled Client Error / React Exception to APM Ingestion
 */
export const reportClientErrorToAPM = async ({ message, stack, componentStack, traceId, metadata }) => {
  try {
    await fetch(`${API_BASE_URL}/api/telemetry/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        stack,
        componentStack,
        url: window.location.href,
        traceId: traceId || generateClientTraceId("cli_err"),
        metadata: {
          ...metadata,
          userAgent: navigator.userAgent,
          screenResolution: `${window.innerWidth}x${window.innerHeight}`,
        },
      }),
    });
  } catch (e) {
    console.warn("Failed to report client error to APM telemetry:", e);
  }
};
