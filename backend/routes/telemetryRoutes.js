const express = require("express");
const router = express.Router();
const telemetryController = require("../controllers/telemetryController");

// Traces list and detailed view
router.get("/traces", telemetryController.getTraces);
router.get("/traces/:traceId", telemetryController.getTraceById);

// Metrics & Errors
router.get("/metrics", telemetryController.getMetrics);
router.get("/errors", telemetryController.getErrors);

// Client telemetry ingestion
router.post("/client-errors", telemetryController.ingestClientError);
router.post("/client-metrics", telemetryController.ingestClientMetric);

// Interactive End-to-End Traced Checkout simulation
router.post("/simulate-traced-checkout", telemetryController.simulateTracedCheckout);

module.exports = router;
