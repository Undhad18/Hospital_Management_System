const pool = require("../db");
const {
  getBedAndAdmissionAnalytics,
  getInventoryForecastAnalytics,
  getLaboratoryAnalytics,
  getQueueAnalytics,
  getFinancialAnalytics,
  getAppointmentAnalytics,
} = require("./aiAnalyticsService");

/**
 * AI Workflow & Intelligent Notification Service (Feature 10 & Section 6)
 * 
 * Provides:
 * 1. Active automated threshold alert monitoring with anti-spam cooldowns.
 * 2. Human-in-the-loop workflow suggestion cards.
 * 3. AI Automation Opportunities assessment matrix enriched with live operational data.
 */

// Default threshold rules
const DEFAULT_RULES = {
  low_stock_alert: { name: "Formulary Low Stock Threshold", threshold: 15, cooldownHours: 6 },
  expiry_warning: { name: "Batch Expiry Warning Window (Days)", threshold: 60, cooldownHours: 12 },
  bed_capacity_surge: { name: "Ward Occupancy Warning Level (%)", threshold: 85, cooldownHours: 4 },
  long_wait_queue: { name: "Queue Wait Time Alert (Minutes)", threshold: 45, cooldownHours: 2 },
  pending_lab_delay: { name: "Pending Lab Turnaround Delay (Hours)", threshold: 24, cooldownHours: 4 },
  unpaid_bill_aging: { name: "Unpaid Invoice Aging Alert (Days)", threshold: 7, cooldownHours: 24 },
};

/**
 * Scan Hospital Data and Return Active Threshold Alerts & Workflow Suggestions
 */
async function getActiveWorkflowNotifications(hospitalId) {
  // Fetch configured rules for hospital
  const [ruleRows] = await pool.query(
    "SELECT * FROM ai_automation_rules WHERE (? IS NULL OR hospital_id = ?)",
    [hospitalId, hospitalId]
  );

  const ruleMap = {};
  ruleRows.forEach(r => {
    ruleMap[r.rule_type] = {
      isEnabled: Boolean(r.is_enabled),
      threshold: Number(r.threshold_value || DEFAULT_RULES[r.rule_type]?.threshold || 0),
      lastTriggered: r.last_triggered_at,
    };
  });

  const getRuleConfig = (type) => {
    return ruleMap[type] ?? {
      isEnabled: true,
      threshold: DEFAULT_RULES[type]?.threshold || 0,
      lastTriggered: null,
    };
  };

  const activeAlerts = [];

  // 1. Bed Capacity Check
  const bedConfig = getRuleConfig("bed_capacity_surge");
  if (bedConfig.isEnabled) {
    const bedStats = await getBedAndAdmissionAnalytics(hospitalId);
    const criticalWards = bedStats.wards.filter(w => w.occupancyRate >= bedConfig.threshold);

    if (criticalWards.length > 0) {
      activeAlerts.push({
        id: "alert_bed_capacity",
        type: "bed_capacity_surge",
        department: "Inpatient / Admission",
        severity: "critical",
        title: "High Ward Capacity Surge Alert",
        description: `${criticalWards.map(w => `${w.wardName} (${w.occupancyRate}%)`).join(", ")} exceed the ${bedConfig.threshold}% capacity threshold.`,
        suggestedAction: "Initiate inpatient discharge rounds or divert incoming elective admissions to alternative units.",
        humanApprovalRequired: "Admission Officer / Charge Nurse verification required to assign or discharge beds.",
        affectedEntitiesCount: criticalWards.length,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 2. Pharmacy Low Stock Check
  const stockConfig = getRuleConfig("low_stock_alert");
  if (stockConfig.isEnabled) {
    const invStats = await getInventoryForecastAnalytics(hospitalId);
    if (invStats.lowStockCount > 0) {
      activeAlerts.push({
        id: "alert_pharmacy_low_stock",
        type: "low_stock_alert",
        department: "Pharmacy",
        severity: invStats.lowStockCount >= 5 ? "critical" : "warning",
        title: "Formulary Critical Stock Alert",
        description: `${invStats.lowStockCount} medicines are at or below minimum reorder alert levels (Threshold $\\le$ ${stockConfig.threshold}).`,
        suggestedAction: `Review recommended purchase order requisitions totaling ~₹${Number(invStats.reorderSummary?.estimatedReorderCost || 0).toLocaleString("en-IN")}.`,
        humanApprovalRequired: "Chief Pharmacist must verify and sign purchase order. AI cannot auto-order.",
        affectedEntitiesCount: invStats.lowStockCount,
        sampleItems: invStats.lowStockItems.slice(0, 3).map(i => `${i.medicineName} (${i.currentStock} remaining)`),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. Pharmacy Expiry Warning Check
  const expiryConfig = getRuleConfig("expiry_warning");
  if (expiryConfig.isEnabled) {
    const invStats = await getInventoryForecastAnalytics(hospitalId);
    if (invStats.criticalExpiringCount > 0 || invStats.expiringBatchesCount > 0) {
      activeAlerts.push({
        id: "alert_pharmacy_expiry",
        type: "expiry_warning",
        department: "Pharmacy",
        severity: invStats.criticalExpiringCount > 0 ? "critical" : "warning",
        title: "Approaching Medicine Expiry Warning",
        description: `${invStats.expiringBatchesCount} batches are approaching shelf-life expiration within ${expiryConfig.threshold} days (${invStats.criticalExpiringCount} within 30 days).`,
        suggestedAction: "Quarantine expiring batches for vendor credit return or utilize FEFO (First-Expired, First-Out) priority.",
        humanApprovalRequired: "Physical batch inspection by pharmacist required prior to quarantine.",
        affectedEntitiesCount: invStats.expiringBatchesCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 4. Patient Queue Bottleneck Check
  const queueConfig = getRuleConfig("long_wait_queue");
  if (queueConfig.isEnabled) {
    const queueStats = await getQueueAnalytics(hospitalId);
    if (queueStats.unusuallyLongWaitCount > 0) {
      activeAlerts.push({
        id: "alert_queue_delay",
        type: "long_wait_queue",
        department: "Outpatient / Reception",
        severity: "warning",
        title: "Patient Queue Excessive Wait Warning",
        description: `${queueStats.unusuallyLongWaitCount} patients in the outpatient lobby have been waiting longer than ${queueConfig.threshold} minutes.`,
        suggestedAction: "Redistribute routine walk-in consults to available peer physicians or inform patients of doctor clinical delay.",
        humanApprovalRequired: "Receptionist / OPD Nurse manages clinical queue calling.",
        affectedEntitiesCount: queueStats.unusuallyLongWaitCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 5. Laboratory Delayed Turnaround Check
  const labConfig = getRuleConfig("pending_lab_delay");
  if (labConfig.isEnabled) {
    const labStats = await getLaboratoryAnalytics(hospitalId);
    if (labStats.delayedOrdersCount > 0) {
      activeAlerts.push({
        id: "alert_lab_turnaround",
        type: "pending_lab_delay",
        department: "Diagnostic Laboratory",
        severity: labStats.statPriorityPending > 0 ? "critical" : "warning",
        title: "Delayed Laboratory Turnaround Warning",
        description: `${labStats.delayedOrdersCount} diagnostic investigations are pending past the expected turnaround window.`,
        suggestedAction: "Expedite sample processing for STAT/Urgent orders and follow up with duty pathologist.",
        humanApprovalRequired: "Lab Technician / Pathologist validates and uploads final report.",
        affectedEntitiesCount: labStats.delayedOrdersCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 6. Unpaid Billing Receivables Check
  const billConfig = getRuleConfig("unpaid_bill_aging");
  if (billConfig.isEnabled) {
    const finStats = await getFinancialAnalytics(hospitalId);
    if (finStats.combinedReceivables > 0) {
      activeAlerts.push({
        id: "alert_billing_receivables",
        type: "unpaid_bill_aging",
        department: "Billing & Accounts",
        severity: "info",
        title: "Uncollected Billing Aging Notice",
        description: `₹${Number(finStats.combinedReceivables).toLocaleString("en-IN")} remains uncollected across consultation and pharmacy billing transactions.`,
        suggestedAction: "Review pending patient invoices and settle uncollected accounts before discharge.",
        humanApprovalRequired: "Cashier / Finance Officer must collect payment via cash/UPI receipt.",
        affectedEntitiesCount: 1,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    hospitalId,
    totalActiveAlerts: activeAlerts.length,
    criticalAlertsCount: activeAlerts.filter(a => a.severity === "critical").length,
    alerts: activeAlerts,
    disclaimer: "AI automated suggestions are advisory notifications based on database thresholds. All clinical and administrative actions require human authorization.",
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Full Section 6 AI Automation Opportunities Evaluation Matrix
 */
async function getAutomationOpportunitiesMatrix(hospitalId) {
  // Enriched with live hospital operational counts
  const [apptStats, queueStats, bedStats, invStats, labStats, finStats] = await Promise.all([
    getAppointmentAnalytics(hospitalId),
    getQueueAnalytics(hospitalId),
    getBedAndAdmissionAnalytics(hospitalId),
    getInventoryForecastAnalytics(hospitalId),
    getLaboratoryAnalytics(hospitalId),
    getFinancialAnalytics(hospitalId),
  ]);

  return [
    {
      id: "opp_1",
      department: "Reception",
      manualTask: "Appointment lookup & calendar checking",
      proposedAutomation: "AI-assisted natural language slot search and doctor roster matching",
      liveDataMetrics: `${apptStats.totalAppointments} appointments recorded (${apptStats.statusBreakdown.confirmed} confirmed)`,
      requiredApis: "GET /api/appointments, GET /api/doctors/schedules",
      operationalBenefit: "Reduces front desk booking time; eliminates manual calendar cross-checking",
      safetyRisks: "Double-booking slots during unscheduled doctor leave",
      humanApprovalRequirement: "Mandatory: Receptionist or patient must explicitly select and confirm slot.",
    },
    {
      id: "opp_2",
      department: "Reception",
      manualTask: "Manual phone call / SMS appointment reminders",
      proposedAutomation: "Automated cron reminder dispatcher with idempotency protection",
      liveDataMetrics: `${apptStats.reminderSuggestions.length} upcoming appointments needing reminder dispatch`,
      requiredApis: "POST /api/notifications/reminders",
      operationalBenefit: "Decreases clinic no-show rates; saves front desk manual phone call time",
      safetyRisks: "Duplicate SMS/email spam without idempotency guard",
      humanApprovalRequirement: "Pre-approved automated scheduler with manual opt-out control.",
    },
    {
      id: "opp_3",
      department: "Reception",
      manualTask: "Verbal wait time estimation and queue tracking",
      proposedAutomation: "Real-time queue dashboard with consultation-pacing wait time estimates",
      liveDataMetrics: `${queueStats.waitingCount} patients waiting in lobby (Est. avg: ~${queueStats.waitingCount * 12} mins)`,
      requiredApis: "GET /api/ai/analytics/queue",
      operationalBenefit: "Reduces patient waiting anxiety; prevents lobby overcrowding",
      safetyRisks: "Patient misinterpreting analytical estimate as a clinical guarantee",
      humanApprovalRequirement: "Estimates explicitly labelled as estimates subject to clinical case complexity.",
    },
    {
      id: "opp_4",
      department: "Hospital Admin",
      manualTask: "Compiling manual end-of-day operational spreadsheets",
      proposedAutomation: "Automated daily operational report generator with export capability",
      liveDataMetrics: "24-hour census synthesizing appointments, beds, pharmacy, and billing",
      requiredApis: "POST /api/ai/reports/generate, GET /api/ai/reports",
      operationalBenefit: "Saves administrative staff 45–60 minutes per shift; produces verifiable audit trail",
      safetyRisks: "Unverified figures if prompts are ungrounded",
      humanApprovalRequirement: "Reports generated strictly from parameterized SQL queries.",
    },
    {
      id: "opp_5",
      department: "Doctor",
      manualTask: "Reviewing fragmented past visit notes and lab records",
      proposedAutomation: "Pre-consultation patient timeline summary (allergies, past visits, recent labs)",
      liveDataMetrics: `${apptStats.followUpSuggestions.length} completed consultations linked to follow-up history`,
      requiredApis: "GET /api/consultations/patient/:id",
      operationalBenefit: "Gives physicians immediate clinical history context in under 15 seconds",
      safetyRisks: "Doctor accepting AI summary without checking primary EHR notes",
      humanApprovalRequirement: "Mandatory: Labeled 'Operational Summary — Review primary medical chart'.",
    },
    {
      id: "opp_6",
      department: "Pharmacy",
      manualTask: "Manual bin checks for low medicine stock",
      proposedAutomation: "Inventory consumption burn-rate forecasting and reorder calculations",
      liveDataMetrics: `${invStats.lowStockCount} items below threshold (Reorder needed: ~₹${Number(invStats.reorderSummary?.estimatedReorderCost || 0).toLocaleString("en-IN")})`,
      requiredApis: "GET /api/ai/analytics/inventory",
      operationalBenefit: "Prevents critical drug stockouts; reduces overstock capital lockup",
      safetyRisks: "Inappropriate bulk orders during temporary demand fluctuations",
      humanApprovalRequirement: "Mandatory: Pharmacist reviews and signs purchase orders. AI cannot auto-purchase.",
    },
    {
      id: "opp_7",
      department: "Pharmacy",
      manualTask: "Browsing paper batch cards for expiring medicines",
      proposedAutomation: "Automated expiry watchdog and FEFO quarantine alerts (<30/60/90 days)",
      liveDataMetrics: `${invStats.expiringBatchesCount} batches expiring within 90 days (${invStats.criticalExpiringCount} in 30 days)`,
      requiredApis: "GET /api/ai/analytics/inventory",
      operationalBenefit: "Prevents dispensing expired drugs; allows timely vendor returns for credit",
      safetyRisks: "Premature disposal of active stock without physical inspection",
      humanApprovalRequirement: "Pharmacist inspects batch physically before updating status.",
    },
    {
      id: "opp_8",
      department: "Laboratory",
      manualTask: "Manually monitoring pending TAT and hunting duplicate orders",
      proposedAutomation: "Lab workload kanban, STAT priority tracking and 48-hour duplicate alert",
      liveDataMetrics: `${labStats.totalActivePending} pending tests (${labStats.delayedOrdersCount} delayed past TAT window)`,
      requiredApis: "GET /api/ai/analytics/laboratory",
      operationalBenefit: "Accelerates critical diagnostic turnaround; eliminates accidental duplicate draws",
      safetyRisks: "AI overriding doctor's intentional repeat serial diagnostic orders",
      humanApprovalRequirement: "Informational alert only. Pathologist and ordering doctor decide whether to proceed.",
    },
    {
      id: "opp_9",
      department: "Admission",
      manualTask: "Calling floor wards or walking floors to find clean vacant beds",
      proposedAutomation: "Ward & Bed Digital Twin grid with capacity surge alerts (>85% full)",
      liveDataMetrics: `${bedStats.occupiedBeds}/${bedStats.totalBeds} beds occupied (${bedStats.overallOccupancyRate}% occupancy)`,
      requiredApis: "GET /api/ai/analytics/beds",
      operationalBenefit: "Instant spatial visibility of vacant vs occupied beds; cuts ER admission delays",
      safetyRisks: "Assigning bed before housekeeping completes sanitary turnaround",
      humanApprovalRequirement: "Mandatory: Nurse or admission officer physically assigns bed in existing workflow.",
    },
    {
      id: "opp_10",
      department: "Billing",
      manualTask: "Cross-checking cash registers against separate pharmacy and OPD receipts",
      proposedAutomation: "Financial insights engine with uncollected receivables aging tracking",
      liveDataMetrics: `₹${Number(finStats.combinedRevenue).toLocaleString("en-IN")} collected, ₹${Number(finStats.combinedReceivables).toLocaleString("en-IN")} pending collection`,
      requiredApis: "GET /api/ai/analytics/financial",
      operationalBenefit: "Daily revenue reconciliation; ensures uncollected bills are paid before discharge",
      safetyRisks: "Modifying ledger entries or balance amounts erroneously",
      humanApprovalRequirement: "Strictly Forbidden: AI cannot alter bills, approve refunds, or waive balances.",
    },
    {
      id: "opp_11",
      department: "Management",
      manualTask: "Compiling executive metrics across multiple standalone systems",
      proposedAutomation: "AI Hospital Intelligence Command Center with multi-department operational KPIs",
      liveDataMetrics: "Live unified data across all 6 clinical and ancillary service modules",
      requiredApis: "GET /api/ai/analytics/overview, POST /api/ai/assistant/query",
      operationalBenefit: "Executive leadership gains real-time visibility into operational health",
      safetyRisks: "Misinterpretation of operational projections as clinical outcomes",
      humanApprovalRequirement: "All metrics carry data source attribution and query timestamps.",
    },
  ];
}

async function getNotificationPreferences(hospitalId) {
  const [ruleRows] = await pool.query(
    "SELECT rule_type, is_enabled FROM ai_automation_rules WHERE (? IS NULL OR hospital_id = ?)",
    [hospitalId, hospitalId]
  );
  const prefs = {
    low_stock_alerts: true,
    high_occupancy_alerts: true,
    long_wait_alerts: true,
    delayed_lab_alerts: true,
  };
  ruleRows.forEach((r) => {
    if (r.rule_type === "low_stock_alert") prefs.low_stock_alerts = Boolean(r.is_enabled);
    if (r.rule_type === "bed_capacity_surge") prefs.high_occupancy_alerts = Boolean(r.is_enabled);
    if (r.rule_type === "long_wait_queue") prefs.long_wait_alerts = Boolean(r.is_enabled);
    if (r.rule_type === "pending_lab_delay") prefs.delayed_lab_alerts = Boolean(r.is_enabled);
  });
  return { preferences: prefs };
}

async function updateNotificationPreferences(hospitalId, newPrefs = {}) {
  const targetHospitalId = hospitalId || 1;
  const mapping = [
    { type: "low_stock_alert", val: newPrefs.low_stock_alerts },
    { type: "bed_capacity_surge", val: newPrefs.high_occupancy_alerts },
    { type: "long_wait_queue", val: newPrefs.long_wait_alerts },
    { type: "pending_lab_delay", val: newPrefs.delayed_lab_alerts },
  ];
  for (const item of mapping) {
    if (item.val !== undefined) {
      await pool.query(
        `INSERT INTO ai_automation_rules (hospital_id, rule_type, name, is_enabled, threshold_value)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_at = CURRENT_TIMESTAMP`,
        [
          targetHospitalId,
          item.type,
          DEFAULT_RULES[item.type]?.name || item.type,
          item.val ? 1 : 0,
          DEFAULT_RULES[item.type]?.threshold || 0,
        ]
      );
    }
  }
  return getNotificationPreferences(hospitalId);
}

module.exports = {
  getActiveWorkflowNotifications,
  getAutomationOpportunitiesMatrix,
  getNotificationPreferences,
  updateNotificationPreferences,
};
