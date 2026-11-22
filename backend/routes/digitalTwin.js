const express = require("express");
const router = express.Router();
const { requireAuth, allowRoles } = require("../middleware/auth");
const {
  getHospitalDigitalTwinDashboard,
  getWardAndBedTwin,
  getPatientFlowTwin,
  getDoctorDepartmentTwin,
  getPharmacyTwin,
  getLaboratoryTwin,
  getHistoricalTwin,
  getHospitalFloorplanTwin,
  getHospitalOtTwin,
  transitionSurgicalCase,
  getHospitalEmergencyTwin,
  triggerEmergencyIncident,
  toggleIncidentChecklistItem,
  resolveEmergencyIncident,
  getDischargeReadinessTwin,
  advanceDischargeStage,
  preAllocateBedCandidate,
  getBiomedicalAssetsTwin,
  relocateBiomedicalAsset,
  updateBiomedicalAssetMaintenance,
  getInfectionControlTwin,
  triggerInfectionCase,
  recordContactSwabResult,
  updateIsolationStatus,
} = require("../services/digitalTwinService");
const {
  runAndPersistSimulation,
  listSimulationRuns,
} = require("../services/digitalTwinSimulationService");
const pool = require("../db");

/**
 * Helper to resolve hospital scoping with multi-tenant RBAC
 */
function resolveHospitalScope(req) {
  if (req.user.role === "super_admin") {
    return req.query.hospitalId ? Number(req.query.hospitalId) : null;
  }
  return req.user.hospitalId || null;
}

/**
 * GET /api/digital-twin/dashboard
 * Central virtual hospital dashboard representation (Feature 1)
 */
router.get(
  "/dashboard",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getHospitalDigitalTwinDashboard(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Digital Twin dashboard:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Digital Twin dashboard" });
    }
  }
);

/**
 * GET /api/digital-twin/wards
 * Spatial Ward & Bed Grid with occupancy indicators (Feature 2)
 */
router.get(
  "/wards",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getWardAndBedTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Ward & Bed Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Ward & Bed Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/patient-flow
 * 10-Stage Patient Operational Journey Pipeline (Feature 3)
 */
router.get(
  "/patient-flow",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getPatientFlowTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Patient Flow Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Patient Flow Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/doctors
 * Doctor and Department Digital Twin (Feature 4)
 */
router.get(
  "/doctors",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getDoctorDepartmentTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Doctor Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Doctor Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/pharmacy
 * Pharmacy Formulary & Dispensation Digital Twin (Feature 5)
 */
router.get(
  "/pharmacy",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getPharmacyTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Pharmacy Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Pharmacy Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/laboratory
 * Diagnostic Laboratory Workload & TAT Digital Twin (Feature 6)
 */
router.get(
  "/laboratory",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getLaboratoryTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Laboratory Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Laboratory Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/historical
 * Historical telemetry comparison (Feature 8)
 */
router.get(
  "/historical",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const days = Number(req.query.days || 30);
      const data = await getHistoricalTwin(hospitalId, days);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Historical Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Historical Digital Twin" });
    }
  }
);

/**
 * GET /api/digital-twin/floorplan
 * Multi-floor spatial 2D blueprint layout & real-time congestion heatmap twin
 */
router.get(
  "/floorplan",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getHospitalFloorplanTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Floorplan Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Floorplan Digital Twin: " + error.message });
    }
  }
);

/**
 * GET /api/digital-twin/ot
 * Operation Theater (OT) & PACU Surgical Suite Digital Twin telemetry
 */
router.get(
  "/ot",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getHospitalOtTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in OT Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve OT Digital Twin: " + error.message });
    }
  }
);

/**
 * POST /api/digital-twin/ot/cases/:id/transition
 * Transition surgical case stage (pre_op_holding -> intra_op -> post_op_pacu -> completed)
 */
router.post(
  "/ot/cases/:id/transition",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const caseId = Number(req.params.id);
      const { next_stage, pacu_bed } = req.body;

      if (!next_stage) {
        return res.status(400).json({ success: false, message: "next_stage is required" });
      }

      const result = await transitionSurgicalCase(caseId, next_stage, pacu_bed);

      // Broadcast real-time update
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "ot_suite", "stage_transition", { caseId, next_stage });
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error in surgical case transition:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to transition surgical case" });
    }
  }
);

/**
 * GET /api/digital-twin/emergency
 * Emergency Code Blue & Mass-Casualty Disaster Incident Command Twin
 */
router.get(
  "/emergency",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getHospitalEmergencyTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Emergency Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Emergency Digital Twin: " + error.message });
    }
  }
);

/**
 * POST /api/digital-twin/emergency/trigger
 * Trigger Code Blue, Disaster Incident, or Simulation Drill
 */
router.post(
  "/emergency/trigger",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await triggerEmergencyIncident(hospitalId, req.body || {});
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "emergency", "incident_triggered", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error triggering emergency incident:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to trigger emergency incident" });
    }
  }
);

/**
 * POST /api/digital-twin/emergency/checklist/toggle
 * Toggle clinical checklist item during active code
 */
router.post(
  "/emergency/checklist/toggle",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { incidentId, checklistId, completed, completedBy } = req.body;
      const result = await toggleIncidentChecklistItem(incidentId, checklistId, completed, completedBy);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error toggling checklist item:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to toggle checklist item" });
    }
  }
);

/**
 * POST /api/digital-twin/emergency/resolve
 * Resolve active incident command (ROSC achieved, drill concluded)
 */
router.post(
  "/emergency/resolve",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { incidentId, outcomeNotes } = req.body;
      const result = await resolveEmergencyIncident(incidentId, outcomeNotes);
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        const hospitalId = resolveHospitalScope(req);
        emitDigitalTwinEvent(hospitalId, "emergency", "incident_resolved", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error resolving incident:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to resolve incident" });
    }
  }
);

/**
 * GET /api/digital-twin/discharge-readiness
 * AI Discharge Readiness & Predictive Bed Liberation Twin telemetry
 */
router.get(
  "/discharge-readiness",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getDischargeReadinessTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Discharge Readiness Digital Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Discharge Readiness Twin: " + error.message });
    }
  }
);

/**
 * POST /api/digital-twin/discharge-readiness/advance
 * Advance discharge stage (clinical_clearance -> pharmacy -> billing -> transit -> evs -> liberated)
 */
router.post(
  "/discharge-readiness/advance",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { assessmentId, next_stage, barrier_notes } = req.body;
      if (!assessmentId || !next_stage) {
        return res.status(400).json({ success: false, message: "assessmentId and next_stage are required" });
      }
      const result = await advanceDischargeStage(Number(assessmentId), { next_stage, barrier_notes });
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        const hospitalId = resolveHospitalScope(req);
        emitDigitalTwinEvent(hospitalId, "discharge_twin", "stage_advanced", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error advancing discharge stage:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to advance discharge stage" });
    }
  }
);

/**
 * POST /api/digital-twin/discharge-readiness/pre-allocate
 * Pre-allocate an inbound patient candidate to an upcoming liberated bed
 */
router.post(
  "/discharge-readiness/pre-allocate",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { assessmentId, candidate } = req.body;
      if (!assessmentId) {
        return res.status(400).json({ success: false, message: "assessmentId is required" });
      }
      const result = await preAllocateBedCandidate(Number(assessmentId), candidate);
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        const hospitalId = resolveHospitalScope(req);
        emitDigitalTwinEvent(hospitalId, "discharge_twin", "pre_allocated", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error pre-allocating bed candidate:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to pre-allocate bed" });
    }
  }
);

/**
 * GET /api/digital-twin/biomedical-assets
 * Biomedical Equipment & IoT Asset Tracking Twin telemetry (Feature 5)
 */
router.get(
  "/biomedical-assets",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getBiomedicalAssetsTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Biomedical Assets Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Biomedical Assets: " + error.message });
    }
  }
);

/**
 * POST /api/digital-twin/biomedical-assets/relocate
 * Relocate biomedical equipment asset to new ward / bed
 */
router.post(
  "/biomedical-assets/relocate",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await relocateBiomedicalAsset(hospitalId, req.body || {});
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "biomedical_assets", "asset_relocated", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error relocating asset:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to relocate asset" });
    }
  }
);

/**
 * POST /api/digital-twin/biomedical-assets/maintenance
 * Update biomedical asset maintenance status (sanitized, calibration completed)
 */
router.post(
  "/biomedical-assets/maintenance",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await updateBiomedicalAssetMaintenance(hospitalId, req.body || {});
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "biomedical_assets", "maintenance_updated", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error updating asset maintenance:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to update asset maintenance" });
    }
  }
);

/**
 * GET /api/digital-twin/infection-control
 * Infection Control, Outbreak Surveillance & Contact Tracing Twin telemetry (Feature 6)
 */
router.get(
  "/infection-control",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getInfectionControlTwin(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in Infection Control Twin:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve Infection Control Twin: " + error.message });
    }
  }
);

/**
 * POST /api/digital-twin/infection-control/trigger
 * Flag new infection contagion case & auto-generate spatial contact tracing cohort
 */
router.post(
  "/infection-control/trigger",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await triggerInfectionCase(hospitalId, req.body || {});
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "infection_control", "case_flagged", result);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error flagging infection case:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to flag infection case" });
    }
  }
);

/**
 * POST /api/digital-twin/infection-control/contacts/swab
 * Record swab PCR / culture test result for a contact
 */
router.post(
  "/infection-control/contacts/swab",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const { contactId, result, status } = req.body || {};
      if (!contactId) {
        return res.status(400).json({ success: false, message: "contactId is required" });
      }
      const data = await recordContactSwabResult(Number(contactId), { result, status });
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "infection_control", "contact_swab_recorded", data);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error recording contact swab result:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to record swab result" });
    }
  }
);

/**
 * POST /api/digital-twin/infection-control/cases/status
 * Update isolation case status or swab clearance count
 */
router.post(
  "/infection-control/cases/status",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const { caseId, status, swab_count, containment_notes } = req.body || {};
      if (!caseId) {
        return res.status(400).json({ success: false, message: "caseId is required" });
      }
      const data = await updateIsolationStatus(Number(caseId), { status, swab_count, containment_notes });
      try {
        const { emitDigitalTwinEvent } = require("../services/socketService");
        emitDigitalTwinEvent(hospitalId, "infection_control", "isolation_updated", data);
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error updating isolation status:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to update isolation status" });
    }
  }
);

/**
 * POST /api/digital-twin/sync
 * Broadcast an immediate real-time synchronization pulse to all connected hospital clients
 */
router.post(
  "/sync",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const { subsystem = "all" } = req.body || {};
      const { emitDigitalTwinEvent } = require("../services/socketService");

      emitDigitalTwinEvent(hospitalId, subsystem, "force_sync", { triggeredBy: req.user.id });

      return res.json({
        success: true,
        message: "Digital Twin real-time synchronization broadcast dispatched",
        hospitalId,
        subsystem,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error triggering sync:", error);
      return res.status(500).json({ success: false, message: "Failed to broadcast sync event" });
    }
  }
);

// ============================================================================
// DIGITAL TWIN SIMULATION ROUTES (PHASE 8)
// ============================================================================

/**
 * POST /api/digital-twin/simulations/run
 * Run an isolated what-if operational simulation (Zero production DB writes)
 */
router.post(
  "/simulations/run",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const { scenario_type, parameters } = req.body;

      if (!scenario_type) {
        return res.status(400).json({
          success: false,
          message: "scenario_type is required (e.g. patient_surge, bed_capacity_loss, bed_demand_projection, doctor_shortage, medicine_demand_spike, lab_surge)",
        });
      }

      if (!hospitalId) {
        return res.status(400).json({
          success: false,
          message: "hospitalId is required for running operational simulations",
        });
      }

      const simulationResult = await runAndPersistSimulation({
        hospitalId,
        userId: req.user.id,
        scenarioType: scenario_type,
        parameters: parameters || {},
      });

      return res.json({
        success: true,
        message: "What-if operational simulation completed successfully",
        data: simulationResult,
      });
    } catch (error) {
      console.error("Error running simulation:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to execute simulation model",
      });
    }
  }
);

/**
 * GET /api/digital-twin/simulations
 * List saved simulation runs for the authenticated hospital
 */
router.get(
  "/simulations",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const limit = Number(req.query.limit || 20);
      const simulations = await listSimulationRuns(hospitalId, limit);
      return res.json({ success: true, data: simulations });
    } catch (error) {
      console.error("Error listing simulations:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve simulation runs" });
    }
  }
);

/**
 * GET /api/digital-twin/simulations/:id
 * Retrieve full details of a saved simulation run
 */
router.get(
  "/simulations/:id",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const simId = Number(req.params.id);
      const hospitalId = req.user.hospitalId;
      const isSuperAdmin = req.user.role === "super_admin";

      const [rows] = await pool.query(
        `SELECT s.*, h.name as hospital_name, u.full_name as author_name
         FROM digital_twin_simulations s
         LEFT JOIN hospitals h ON h.id = s.hospital_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`,
        [simId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Simulation record not found" });
      }

      const sim = rows[0];
      if (!isSuperAdmin && hospitalId && sim.hospital_id !== hospitalId) {
        return res.status(403).json({ success: false, message: "Unauthorized to access simulations from another hospital" });
      }

      const parameters = typeof sim.parameters === "string" ? JSON.parse(sim.parameters) : sim.parameters;
      const baseline_metrics = typeof sim.baseline_metrics === "string" ? JSON.parse(sim.baseline_metrics) : sim.baseline_metrics;
      const simulated_metrics = typeof sim.simulated_metrics === "string" ? JSON.parse(sim.simulated_metrics) : sim.simulated_metrics;

      let recommendations = simulated_metrics?.recommendations;
      if (!recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
        const scenario = String(sim.scenario_type || "").toLowerCase();
        if (scenario.includes("patient") || scenario.includes("outpatient")) {
          recommendations = [
            "Call in on-call backup physicians to prevent lobby queue saturation.",
            "Open temporary triage desk to prioritize urgent clinical cases.",
            "Alert hospital pharmacy and diagnostic lab to prepare for downstream surge volume."
          ];
        } else if (scenario.includes("ward") || scenario.includes("closure")) {
          recommendations = [
            "Coordinate inter-ward transfer of affected inpatients to adjacent active wards.",
            "Halt non-emergency elective surgical admissions immediately until ward status normalizes.",
            "Notify emergency triage of reduced bed capacity for inbound ambulance diversion."
          ];
        } else if (scenario.includes("bed") || scenario.includes("demand")) {
          recommendations = [
            "Prepare surge overflow beds or arrange early discharge protocol.",
            "Conduct proactive daily multi-disciplinary discharge planning rounds.",
            "Review step-down and convalescent transfer opportunities to liberate acute care beds."
          ];
        } else if (scenario.includes("doctor") || scenario.includes("absence")) {
          recommendations = [
            "Notify reception desk to redistribute intake across available peer doctors.",
            "Send automated cancellation/rescheduling notifications with patient consent.",
            "Prioritize chronic and post-operative follow-up consultations to avoid clinical gaps."
          ];
        } else if (scenario.includes("medicine") || scenario.includes("pharmacy")) {
          recommendations = [
            "Issue expedited supplier orders for items facing stockout risk.",
            "Enforce unit-dose pharmacy dispensing controls to prevent premature depletion.",
            "Review alternative therapeutic substitutes with attending clinical pharmacologist."
          ];
        } else if (scenario.includes("lab")) {
          recommendations = [
            "Authorize laboratory staff overtime shift to maintain STAT diagnostic turnaround times.",
            "Triage incoming specimens: prioritize STAT blood gases, cardiac markers, and stroke panels.",
            "Pre-calibrate auxiliary diagnostic equipment to handle anticipated sample load."
          ];
        } else {
          recommendations = [
            "Monitor key telemetry indicators hourly during operational surge.",
            "Coordinate across departments to maintain patient throughput."
          ];
        }
      }

      return res.json({
        success: true,
        data: {
          ...sim,
          parameters,
          baseline_metrics,
          simulated_metrics,
          baselineMetrics: baseline_metrics,
          simulatedMetrics: simulated_metrics,
          impactSummary: sim.impact_summary,
          recommendations,
        },
      });
    } catch (error) {
      console.error("Error fetching simulation record:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch simulation record" });
    }
  }
);

module.exports = router;
