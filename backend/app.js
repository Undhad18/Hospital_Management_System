require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookie = require("cookie");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./docs/openapi.json");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const telemetryRoutes = require("./routes/telemetryRoutes");
const featureFlagRoutes = require("./routes/featureFlagRoutes");
const diagnosticRoutes = require("./routes/diagnosticRoutes");
const tracingMiddleware = require("./middleware/tracingMiddleware");
const telemetryService = require("./services/telemetryService");

const app = express();

// Trust reverse proxy (Nginx / Cloudflare / Load Balancers) for accurate client IPs and protocols
app.set("trust proxy", 1);

// 1. Configure CORS & Credentials for React client access
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost",
  "https://shopsphere.io",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || true);
    } else {
      callback(null, origin);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Idempotency-Key",
    "idempotency-key",
    "stripe-signature",
    "X-Trace-Id",
    "x-trace-id",
    "traceparent",
    "X-Parent-Span-Id",
  ],
  exposedHeaders: ["X-Trace-Id", "Server-Timing"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Explicit header fallback for preflight OPTIONS & credentials
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, idempotency-key, stripe-signature, X-Trace-Id, x-trace-id, traceparent, X-Parent-Span-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Trace-Id, Server-Timing");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// 2. Request body & cookie parsing middleware (with rawBody capture for Stripe Webhook verification)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// Cookie parsing helper middleware
app.use((req, res, next) => {
  if (req.headers.cookie) {
    try {
      req.cookies = cookie.parse(req.headers.cookie);
    } catch (err) {
      req.cookies = {};
    }
  } else {
    req.cookies = {};
  }
  next();
});

// 3. APM Distributed Tracing Middleware (Must be before routes)
app.use(tracingMiddleware);

// 4. Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 5. API Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication and Products API is online and operational.",
    timestamp: new Date().toISOString(),
  });
});

// Production Topology & Reverse Proxy Status route
app.get("/api/topology/status", (req, res) => {
  res.status(200).json({
    success: true,
    topology: {
      architecture: "React SPA (Vite/CDN) -> Nginx (Reverse Proxy & Same-Origin) -> Express (Cluster) -> MySQL 8.0 & Redis 7.0",
      sameOrigin: true,
      edgeReverseProxy: "Nginx 1.25 Alpine",
      cdnPolicies: {
        bundledAssets: "public, max-age=31536000, immutable (1 Year)",
        mediaUploads: "public, max-age=604800, stale-while-revalidate=86400 (7 Days)",
        spaEntryHtml: "no-store, no-cache, max-age=0 (Dynamic)",
        apiEndpoints: "no-store, no-cache, max-age=0 (Dynamic Bypass)",
      },
      process: {
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        environment: process.env.NODE_ENV || "development",
      },
      network: {
        clientIp: req.ip || req.connection?.remoteAddress || "127.0.0.1",
        protocol: req.protocol,
        secure: req.secure || req.headers["x-forwarded-proto"] === "https",
        trustProxyActive: true,
      },
      services: {
        database: "MySQL 8.0 InnoDB Connection Pool (Active)",
        cache: "Redis 7.0 In-Memory Store (Available)",
        realtime: "Socket.IO WebSockets (Active)",
        emailWorker: "Asynchronous Background Queue (Active)",
      },
      timestamp: new Date().toISOString(),
    },
  });
});

// 6. Mount Swagger Documentation & OpenAPI Spec
app.get("/api/docs/openapi.json", (req, res) => {
  res.status(200).json(openApiSpec);
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// 7. Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/feature-flags", featureFlagRoutes);
app.use("/api/diagnostics", diagnosticRoutes);

// 8. 404 Not Found Handler (Must be after all routes)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found.`,
    traceId: req.traceId || null,
  });
});

// 9. Global Error Handler (Handles multer and unexpected server errors with APM logging)
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  
  // Record error in APM telemetry buffer
  telemetryService.recordError({
    traceId: req.traceId || null,
    source: "backend",
    path: req.originalUrl || req.path,
    method: req.method,
    statusCode: err.status || (err.name === "MulterError" ? 400 : 500),
    message: err.message,
    stack: err.stack,
    userId: req.user?.id || null,
  });

  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      field: err.field,
      traceId: req.traceId || null,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    traceId: req.traceId || null,
  });
});

module.exports = app;
