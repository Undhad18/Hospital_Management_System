const express = require("express");
const router = express.Router();
const diagnosticController = require("../controllers/diagnosticController");

// Diagnostic probes for Integration Playbook
router.get("/system-health", diagnosticController.getSystemHealthProbes);
router.post("/simulate-incident", diagnosticController.simulateIncidentTriage);

module.exports = router;
