const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { getProviderInfo, CLINICAL_DISCLAIMER } = require("../services/aiProviderService");
const { processAssistantQuery } = require("../services/aiAssistantService");
const {
  getAppointmentAnalytics,
  getQueueAnalytics,
  getDoctorWorkloadAnalytics,
  getBedAndAdmissionAnalytics,
  getInventoryForecastAnalytics,
  getLaboratoryAnalytics,
  getFinancialAnalytics,
  getOperationalInsightsOverview,
} = require("../services/aiAnalyticsService");
const {
  generateReport,
  listReports,
  getReportById,
} = require("../services/aiReportingService");
const {
  getActiveWorkflowNotifications,
  getAutomationOpportunitiesMatrix,
  getNotificationPreferences,
  updateNotificationPreferences,
} = require("../services/aiWorkflowNotificationService");

/**
 * GET /api/ai/status
 * Returns safe operational metadata about the active AI infrastructure.
 * Enforces authentication so external unauthenticated clients cannot probe configuration.
 */
router.get("/status", requireAuth, (req, res) => {
  try {
    const info = getProviderInfo();
    return res.json({
      success: true,
      data: {
        ...info,
        disclaimer: CLINICAL_DISCLAIMER,
        userRole: req.user.role,
        hospitalId: req.user.hospitalId,
      },
    });
  } catch (error) {
    console.error("Error fetching AI status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve AI provider status",
    });
  }
});

/**
 * GET /api/ai/audit-logs
 * Retrieves security and execution audit logs for AI queries.
 * Scoped by hospital isolation: Hospital Admin sees only their hospital; Super Admin sees all.
 */
router.get(
  "/audit-logs",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const isSuperAdmin = req.user.role === "super_admin";
      const hospitalId = req.user.hospitalId;

      let query = `
        SELECT
          l.id,
          l.hospital_id,
          h.name AS hospital_name,
          l.user_id,
          u.full_name AS user_name,
          l.action,
          l.feature,
          l.query_text,
          l.model_used,
          l.execution_time_ms,
          l.status,
          l.error_message,
          l.created_at
        FROM ai_audit_logs l
        LEFT JOIN hospitals h ON h.id = l.hospital_id
        LEFT JOIN users u ON u.id = l.user_id
      `;

      const params = [];
      if (!isSuperAdmin) {
        query += " WHERE l.hospital_id = ?";
        params.push(hospitalId);
      }

      query += " ORDER BY l.created_at DESC LIMIT 100";

      const [logs] = await pool.query(query, params);
      return res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      console.error("Error fetching AI audit logs:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve AI audit logs",
      });
    }
  }
);

/**
 * GET /api/ai/rules
 * Fetch automated alert threshold rules for the authenticated hospital.
 */
router.get(
  "/rules",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "staff"),
  async (req, res) => {
    try {
      const targetHospitalId =
        req.user.role === "super_admin" && req.query.hospitalId
          ? Number(req.query.hospitalId)
          : req.user.hospitalId;

      if (!targetHospitalId) {
        return res.status(400).json({
          success: false,
          message: "Hospital ID is required",
        });
      }

      const [rules] = await pool.query(
        "SELECT * FROM ai_automation_rules WHERE hospital_id = ? ORDER BY rule_type",
        [targetHospitalId]
      );

      // Default rule types to ensure clean UI state if table is empty
      const DEFAULT_RULES = [
        { rule_type: "low_stock_alert", name: "Formulary Low Stock Warning", threshold_value: 15 },
        { rule_type: "expiry_warning", name: "Batch Expiry Warning Window (Days)", threshold_value: 60 },
        { rule_type: "bed_capacity_surge", name: "Ward Occupancy High Alert (%)", threshold_value: 85 },
        { rule_type: "long_wait_queue", name: "Queue Wait Time Alert (Minutes)", threshold_value: 45 },
        { rule_type: "pending_lab_delay", name: "Pending Lab Turnaround Delay (Hours)", threshold_value: 24 },
        { rule_type: "unpaid_bill_aging", name: "Unpaid Invoice Aging Alert (Days)", threshold_value: 7 },
      ];

      const mergedRules = DEFAULT_RULES.map((def) => {
        const found = rules.find((r) => r.rule_type === def.rule_type);
        return (
          found || {
            hospital_id: targetHospitalId,
            rule_type: def.rule_type,
            name: def.name,
            is_enabled: 1,
            threshold_value: def.threshold_value,
            config: null,
            last_triggered_at: null,
          }
        );
      });

      return res.json({
        success: true,
        data: mergedRules,
      });
    } catch (error) {
      console.error("Error fetching AI rules:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve AI automation rules",
      });
    }
  }
);

/**
 * PUT /api/ai/rules
 * Update or insert an automation threshold rule.
 */
router.put(
  "/rules",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const { rule_type, name, is_enabled, threshold_value, config } = req.body;
      const targetHospitalId =
        req.user.role === "super_admin" && req.body.hospital_id
          ? Number(req.body.hospital_id)
          : req.user.hospitalId;

      if (!targetHospitalId || !rule_type) {
        return res.status(400).json({
          success: false,
          message: "hospital_id and rule_type are required",
        });
      }

      await pool.query(
        `INSERT INTO ai_automation_rules
          (hospital_id, rule_type, name, is_enabled, threshold_value, config)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          is_enabled = VALUES(is_enabled),
          threshold_value = VALUES(threshold_value),
          config = VALUES(config),
          updated_at = CURRENT_TIMESTAMP`,
        [
          targetHospitalId,
          rule_type,
          name || rule_type,
          is_enabled ? 1 : 0,
          Number(threshold_value || 0),
          config ? JSON.stringify(config) : null,
        ]
      );

      return res.json({
        success: true,
        message: "Automation rule updated successfully",
      });
    } catch (error) {
      console.error("Error updating AI rule:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update AI automation rule",
      });
    }
  }
);

/**
 * POST /api/ai/assistant/query
 * Execute a natural language question against live database records.
 * Accessible to all authenticated roles (Super Admin, Hospital Admin, Doctor, Staff, Patient).
 */
router.post("/assistant/query", requireAuth, async (req, res) => {
  try {
    const { question, conversationId } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Question parameter is required",
      });
    }

    const result = await processAssistantQuery({
      user: req.user,
      question: question.trim(),
      conversationId: conversationId ? Number(conversationId) : null,
    });

    return res.json(result);
  } catch (error) {
    console.error("Error in AI assistant query:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process AI assistant inquiry",
    });
  }
});

/**
 * GET /api/ai/assistant/conversations
 * Fetch recent chat conversations for the authenticated user.
 */
router.get("/assistant/conversations", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         hospital_id,
         user_id,
         title,
         role,
         created_at,
         updated_at
       FROM ai_chat_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 30`,
      [req.user.id]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve conversation history",
    });
  }
});

/**
 * GET /api/ai/assistant/conversations/:id/messages
 * Retrieve message history for a specific conversation.
 * Enforces ownership or Super Admin authorization.
 */
router.get("/assistant/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const convId = Number(req.params.id);
    if (!convId) {
      return res.status(400).json({
        success: false,
        message: "Valid conversation ID is required",
      });
    }

    // Verify ownership
    const [convs] = await pool.query(
      "SELECT * FROM ai_chat_conversations WHERE id = ? LIMIT 1",
      [convId]
    );

    if (convs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const conv = convs[0];
    if (req.user.role !== "super_admin" && conv.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this conversation",
      });
    }

    const [messages] = await pool.query(
      `SELECT
         id,
         conversation_id,
         sender,
         message,
         metadata,
         created_at
       FROM ai_chat_messages
       WHERE conversation_id = ?
       ORDER BY id ASC`,
      [convId]
    );

    const formattedMessages = messages.map(m => {
      let meta = {};
      try {
        meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : (m.metadata || {});
      } catch (e) {
        meta = {};
      }
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        role: m.sender,
        sender: m.sender,
        content: m.message,
        message: m.message,
        intent: meta.intent,
        sources_used: meta.sources,
        confidence_score: meta.confidence || 1.0,
        metadata: meta,
        created_at: m.created_at,
      };
    });

    return res.json({
      success: true,
      data: formattedMessages,
      messages: formattedMessages,
      conversation: conv,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve messages",
    });
  }
});

/**
 * DELETE /api/ai/assistant/conversations
 * Bulk delete / clear all conversations for the authenticated user/hospital.
 */
router.delete("/assistant/conversations", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const hospitalId = resolveHospitalScope(req);

    if (req.user.role === "super_admin") {
      await pool.query("DELETE FROM ai_chat_conversations");
    } else {
      await pool.query(
        "DELETE FROM ai_chat_conversations WHERE user_id = ? OR (hospital_id = ? AND hospital_id IS NOT NULL)",
        [userId, hospitalId]
      );
    }

    return res.json({
      success: true,
      message: "All conversations cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing conversations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to clear conversations",
    });
  }
});

/**
 * DELETE /api/ai/assistant/conversations/:id
 * Delete a chat conversation and its messages.
 */
router.delete("/assistant/conversations/:id", requireAuth, async (req, res) => {
  try {
    const convId = Number(req.params.id);
    if (!convId) {
      return res.status(400).json({
        success: false,
        message: "Valid conversation ID is required",
      });
    }

    const [convs] = await pool.query(
      "SELECT user_id FROM ai_chat_conversations WHERE id = ? LIMIT 1",
      [convId]
    );

    if (convs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    if (req.user.role !== "super_admin" && convs[0].user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this conversation",
      });
    }

    await pool.query("DELETE FROM ai_chat_conversations WHERE id = ?", [convId]);

    return res.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete conversation",
    });
  }
});

// ============================================================================
// AI OPERATIONAL INTELLIGENCE & ANALYTICS ROUTES (PHASE 4)
// ============================================================================

/**
 * Helper to resolve authoritative target hospital ID with RBAC guard
 */
function resolveHospitalScope(req) {
  if (req.user.role === "super_admin") {
    return req.query.hospitalId ? Number(req.query.hospitalId) : null;
  }
  return req.user.hospitalId || null;
}

/**
 * GET /api/ai/analytics/overview
 * Executive Operational Overview combining all modules
 */
router.get(
  "/analytics/overview",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getOperationalInsightsOverview(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in overview analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve operational overview" });
    }
  }
);

/**
 * GET /api/ai/analytics/appointments
 * Appointment analytics, scheduling suggestions, conflicts & follow-up recommendations
 */
router.get(
  "/analytics/appointments",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getAppointmentAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in appointment analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve appointment analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/queue & /api/ai/analytics/patient-queue
 * Patient queue tracking, doctor-wise wait estimates & bottleneck detection
 */
router.get(
  ["/analytics/queue", "/analytics/patient-queue"],
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getQueueAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in queue analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve queue analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/doctors & /api/ai/analytics/doctor-workload
 * Doctor workload, utilization percentage & consultation duration analytics
 */
router.get(
  ["/analytics/doctors", "/analytics/doctor-workload"],
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getDoctorWorkloadAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in doctor workload analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve doctor workload analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/beds & /api/ai/analytics/bed-prediction
 * Bed occupancy, ward capacity warnings & admission demand projection
 */
router.get(
  ["/analytics/beds", "/analytics/bed-prediction"],
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getBedAndAdmissionAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in bed analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve bed analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/inventory & /api/ai/analytics/medicine-forecasting
 * Pharmacy inventory burn rates, low stock reorders & batch expiry warnings
 */
router.get(
  ["/analytics/inventory", "/analytics/medicine-forecasting"],
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getInventoryForecastAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in inventory analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve inventory analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/laboratory
 * Lab workload, delayed test warnings & duplicate test order alerts
 */
router.get(
  "/analytics/laboratory",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getLaboratoryAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in laboratory analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve laboratory analytics" });
    }
  }
);

/**
 * GET /api/ai/analytics/financial & /api/ai/analytics/billing-insights
 * Financial insights, consultation vs pharmacy billing, receivables & refunds
 */
router.get(
  ["/analytics/financial", "/analytics/billing-insights"],
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const data = await getFinancialAnalytics(hospitalId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error in financial analytics:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve financial analytics" });
    }
  }
);

// ============================================================================
// AI AUTOMATED REPORTS & WORKFLOW NOTIFICATIONS (PHASE 5)
// ============================================================================

/**
 * POST /api/ai/reports/generate
 * Generate and save an automated operational report (supports standard types or NL prompts)
 */
router.post(
  "/reports/generate",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const { report_type, title, period_start, period_end, nl_prompt } = req.body;
      const hospitalId = resolveHospitalScope(req);

      const report = await generateReport({
        hospitalId,
        reportType: report_type || "daily_operational",
        title,
        user: req.user,
        periodStart: period_start,
        periodEnd: period_end,
        nlPrompt: nl_prompt,
      });

      return res.json({
        success: true,
        message: "Operational report generated successfully",
        data: report,
      });
    } catch (error) {
      console.error("Error generating AI report:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to generate operational report",
      });
    }
  }
);

/**
 * GET /api/ai/reports
 * List generated reports for authenticated hospital
 */
router.get(
  "/reports",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const limit = Number(req.query.limit || 20);
      const reports = await listReports(hospitalId, limit);
      return res.json({ success: true, data: reports });
    } catch (error) {
      console.error("Error listing reports:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve reports list" });
    }
  }
);

/**
 * GET /api/ai/reports/:id
 * Retrieve a single report with its metric snapshot and recommendations
 */
router.get(
  "/reports/:id",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const hospitalId = req.user.hospitalId;
      const isSuperAdmin = req.user.role === "super_admin";

      const report = await getReportById(reportId, hospitalId, isSuperAdmin);
      if (!report) {
        return res.status(404).json({ success: false, message: "Report not found" });
      }

      return res.json({ success: true, data: report });
    } catch (error) {
      console.error("Error fetching report:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to fetch report" });
    }
  }
);

/**
 * GET /api/ai/notifications/active
 * Retrieve active automated threshold alerts and workflow suggestions
 */
router.get(
  "/notifications/active",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await getActiveWorkflowNotifications(hospitalId);
      return res.json({ success: true, data: { ...result, notifications: result.alerts } });
    } catch (error) {
      console.error("Error fetching workflow notifications:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve active workflow notifications" });
    }
  }
);

/**
 * GET /api/ai/notifications/preferences
 * Retrieve notification threshold preferences for hospital
 */
router.get(
  "/notifications/preferences",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const result = await getNotificationPreferences(hospitalId);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve notification preferences" });
    }
  }
);

/**
 * PUT /api/ai/notifications/preferences
 * Update notification threshold preferences for hospital
 */
router.put(
  "/notifications/preferences",
  requireAuth,
  allowRoles("super_admin", "hospital_admin"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const preferences = req.body.preferences || {};
      const result = await updateNotificationPreferences(hospitalId, preferences);
      return res.json({ success: true, data: result, message: "Notification preferences updated successfully" });
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      return res.status(500).json({ success: false, message: "Failed to update notification preferences" });
    }
  }
);

/**
 * GET /api/ai/automation-opportunities
 * AI Automation Opportunities evaluation report (Section 6)
 */
router.get(
  "/automation-opportunities",
  requireAuth,
  allowRoles("super_admin", "hospital_admin", "doctor", "staff"),
  async (req, res) => {
    try {
      const hospitalId = resolveHospitalScope(req);
      const opportunities = await getAutomationOpportunitiesMatrix(hospitalId);
      return res.json({ success: true, data: opportunities });
    } catch (error) {
      console.error("Error fetching automation opportunities:", error);
      return res.status(500).json({ success: false, message: "Failed to retrieve automation opportunities" });
    }
  }
);

module.exports = router;
