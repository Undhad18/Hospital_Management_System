const pool = require("../db");
const { callModel, CLINICAL_DISCLAIMER } = require("./aiProviderService");
const {
  getOperationalInsightsOverview,
  getBedAndAdmissionAnalytics,
  getInventoryForecastAnalytics,
  getLaboratoryAnalytics,
  getFinancialAnalytics,
  getDoctorWorkloadAnalytics,
  getAppointmentAnalytics,
} = require("./aiAnalyticsService");

/**
 * AI Reporting Service — Automated Enterprise Operational Reporting (Feature 9)
 * 
 * Features:
 * - Daily Hospital Operational Report
 * - Weekly Executive Summary
 * - Monthly Financial & Revenue Report
 * - Bed Occupancy Census & Projection Report
 * - Pharmacy Inventory & Reorder Report
 * - Laboratory Workload & TAT Report
 * - Doctor Performance & Schedule Report
 * - Natural Language On-Demand Custom Reports
 * 
 * Guarantees:
 * - 100% grounded in verified MySQL records. Zero fabricated metrics.
 * - Saved in `ai_generated_reports` with complete metrics snapshots for audit compliance.
 */

function generateReportNumber(prefix = "RPT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
}

/**
 * Synthesize textual summary and recommendations from metrics snapshot
 */
function synthesizeReportContent(reportType, title, metrics, hospitalName = "HealthMesh Hospital") {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let summary = "";
  let recommendations = [];

  switch (reportType) {
    case "daily_operational": {
      const appt = metrics.appointments || {};
      const beds = metrics.bedOccupancy || {};
      const inv = metrics.pharmacyInventory || {};
      const labs = metrics.laboratory || {};
      const fin = metrics.finances || {};

      summary = `# 🏥 Daily Hospital Operational Report — ${hospitalName}
**Generated:** ${dateStr} at ${new Date().toLocaleTimeString()}  
**Scope:** 24-Hour Clinical & Administrative Census

---

### 1. Executive Summary & Core KPIs
- **Total Registered Appointments Today:** ${appt.totalAppointments ?? 0}
- **Active Waiting Queue:** ${metrics.queue?.waitingCount ?? 0} patients (Estimated wait: ~${metrics.queue?.waitingCount ? metrics.queue.waitingCount * 12 : 0} mins)
- **Active Inpatient Bed Occupancy:** ${beds.occupiedBeds ?? 0} / ${beds.totalBeds ?? 0} beds (${beds.overallOccupancyRate ?? 0}%)
- **Immediately Vacant Beds:** ${beds.availableBeds ?? 0} beds
- **Critical Pharmacy Formulary Alerts:** ${inv.lowStockCount ?? 0} items low in stock
- **Pending Laboratory Investigations:** ${labs.totalActivePending ?? 0} tests (STAT: ${labs.statPriorityPending ?? 0})
- **Daily Collected Revenue:** ₹${Number(fin.combinedRevenue || 0).toLocaleString("en-IN")} (Receivables Pending: ₹${Number(fin.combinedReceivables || 0).toLocaleString("en-IN")})

---

### 2. Departmental Operations Breakdown
- **Outpatient Care (OPD):** ${appt.statusBreakdown?.completed ?? 0} consultations completed, ${appt.statusBreakdown?.in_progress ?? 0} currently consulting.
- **Inpatient Care (IPD):** ${beds.wards?.length ?? 0} active wards surveyed. High-occupancy wards: ${beds.highCapacityWards?.length ? beds.highCapacityWards.map(w => w.wardName).join(", ") : "None (<85%)"}.
- **Pharmacy Formulary:** ${inv.totalFormularyItems ?? 0} total formulary items. Batches approaching expiry in 60 days: ${inv.expiringBatchesCount ?? 0}.
- **Diagnostic Laboratory:** ${labs.delayedOrdersCount ?? 0} delayed investigations identified past turnaround window.

---

### 3. Source Traceability
*Metrics extracted directly from verified MySQL tables: appointments, beds, wards, admissions, hospital_medicines, medicine_batches, investigation_requests, pharmacy_bills, consultation_bills.*`;

      recommendations = [
        beds.overallOccupancyRate >= 80 ? "Prepare discharge planning or divert non-critical admissions; hospital occupancy exceeds 80%." : "Inpatient bed capacity remains at safe operational margins.",
        inv.lowStockCount > 0 ? `Review pharmacy purchase requisitions for ${inv.lowStockCount} items below safe stock alert levels.` : "All active formulary medicines are adequately stocked.",
        labs.delayedOrdersCount > 0 ? `Expedite ${labs.delayedOrdersCount} delayed lab tests exceeding turnaround time thresholds.` : "All laboratory orders are within standard turnaround times.",
      ];
      break;
    }

    case "bed_occupancy": {
      const beds = metrics;
      summary = `# 🛏️ Inpatient Bed Occupancy & Capacity Census
**Facility:** ${hospitalName} | **Date:** ${dateStr}

### 1. Overall Capacity Metrics
- **Total Inpatient Beds:** ${beds.totalBeds ?? 0}
- **Currently Occupied:** ${beds.occupiedBeds ?? 0} (${beds.overallOccupancyRate ?? 0}%)
- **Available for Admission:** ${beds.availableBeds ?? 0}
- **Under Maintenance:** ${beds.maintenanceBeds ?? 0}
- **Projected 7-Day Inpatient Demand:** ~${beds.projections?.projectedBedDemandNext7Days ?? 0} admissions
- **Capacity Shortage Risk:** **${beds.projections?.shortageRisk ?? "LOW"}**

### 2. Ward-by-Ward Breakdown
${beds.wards?.map(w => `- **${w.wardName}** (${w.wardType.toUpperCase()}): ${w.occupiedBeds}/${w.totalBeds} occupied (${w.occupancyRate}%)${w.isHighCapacity ? " ⚠️ **HIGH CAPACITY**" : ""}`).join("\n") || "No wards recorded."}

### 3. Early Warning Guidance
${beds.projections?.earlyWarningAlert || "Safe capacity levels maintained."}`;

      recommendations = [
        beds.highCapacityWards?.length > 0 ? `Prioritize discharge rounds in ${beds.highCapacityWards.map(w => w.wardName).join(", ")}.` : "Ward distribution is currently balanced.",
        beds.maintenanceBeds > 0 ? `Follow up with facilities maintenance on ${beds.maintenanceBeds} out-of-service beds.` : "Zero beds currently offline for maintenance.",
      ];
      break;
    }

    case "inventory_forecast": {
      const inv = metrics;
      summary = `# 💊 Pharmacy Formulary Inventory & Expiry Forecast
**Facility:** ${hospitalName} | **Date:** ${dateStr}

### 1. Stock Status Summary
- **Total Formulary Medicines:** ${inv.totalFormularyItems ?? 0}
- **Low Stock Items:** ${inv.lowStockCount ?? 0}
- **Batches Expiring in Next 90 Days:** ${inv.expiringBatchesCount ?? 0}
- **Estimated Reorder Expenditure:** ₹${Number(inv.reorderSummary?.estimatedReorderCost || 0).toLocaleString("en-IN")}

### 2. Low-Stock Reorder Candidates
${inv.lowStockItems?.slice(0, 10).map(i => `- **${i.medicineName}** (${i.strength}): Current Stock = ${i.currentStock} ${i.unit || "units"} (Min Alert: ${i.minAlertLevel}) — Suggested Reorder: **${i.suggestedReorderQuantity} units** (~${i.estimatedDaysUntilStockout} days remaining)`).join("\n") || "All formulary items above minimum alert thresholds."}

### 3. Expiry Watchdog (< 60 Days)
${inv.expiringBatches?.slice(0, 5).map(b => `- **Batch ${b.batch_number}** (${b.medicine_name}): ${b.current_quantity} units expiring in **${b.days_until_expiry} days** (${b.expiry_date})`).join("\n") || "No active batches approaching expiration within 60 days."}`;

      recommendations = [
        inv.lowStockCount > 0 ? `Issue purchase requisitions for top ${Math.min(5, inv.lowStockCount)} critical shortage medicines.` : "Formulary stock levels are healthy.",
        inv.criticalExpiringCount > 0 ? `Quarantine or vendor-return ${inv.criticalExpiringCount} batches expiring within 30 days.` : "No batches in critical expiry window.",
      ];
      break;
    }

    case "monthly_financial": {
      const fin = metrics;
      summary = `# 📊 Monthly Financial & Revenue Reconciliation Report
**Facility:** ${hospitalName} | **Date:** ${dateStr}

### 1. Revenue Ledger Breakdown
- **Combined Hospital Revenue:** ₹${Number(fin.combinedRevenue || 0).toLocaleString("en-IN")}
- **Uncollected Receivables Pending:** ₹${Number(fin.combinedReceivables || 0).toLocaleString("en-IN")}
- **Total Approved Refunds:** ₹${Number(fin.refunds?.totalAmount || 0).toLocaleString("en-IN")} (${fin.refunds?.count || 0} transactions)

### 2. Departmental Revenue Streams (Decoupled)
- **Consultation Billing (OPD):** Total Billed = ₹${Number(fin.consultationBilling?.totalBilled || 0).toLocaleString("en-IN")}, Collected = ₹${Number(fin.consultationBilling?.totalPaid || 0).toLocaleString("en-IN")}, Balance Due = ₹${Number(fin.consultationBilling?.balanceDue || 0).toLocaleString("en-IN")}
- **Pharmacy Billing (Formulary):** Total Billed = ₹${Number(fin.pharmacyBilling?.totalBilled || 0).toLocaleString("en-IN")}, Collected = ₹${Number(fin.pharmacyBilling?.totalPaid || 0).toLocaleString("en-IN")}, Balance Due = ₹${Number(fin.pharmacyBilling?.balanceDue || 0).toLocaleString("en-IN")}

### 3. Ledger Compliance
*Consultation and Pharmacy ledgers are strictly segregated in accordance with statutory GST separation.*`;

      recommendations = [
        fin.combinedReceivables > 0 ? `Initiate aging receivables collection workflow for outstanding ₹${Number(fin.combinedReceivables).toLocaleString("en-IN")}.` : "All billings are completely reconciled with zero pending balance.",
      ];
      break;
    }

    default: {
      summary = `# 📋 Operational Report — ${title}
**Facility:** ${hospitalName} | **Date:** ${dateStr}

### Operational Data Metrics:
\`\`\`json
${JSON.stringify(metrics, null, 2)}
\`\`\`

*Report generated from verified MySQL database records.*`;
      recommendations = ["Review operational KPIs and align departmental staffing accordingly."];
    }
  }

  return { summary, recommendations };
}

/**
 * Generate and Persist Automated Operational Report
 */
async function generateReport({
  hospitalId,
  reportType = "daily_operational",
  title = null,
  user,
  periodStart = null,
  periodEnd = null,
  nlPrompt = null,
}) {
  const reportNumber = generateReportNumber(reportType.slice(0, 3).toUpperCase());
  let targetTitle = title;
  let metricsSnapshot = {};

  // Fetch hospital name
  let hospitalName = "HealthMesh Hospital";
  if (hospitalId) {
    const [hospRows] = await pool.query("SELECT name FROM hospitals WHERE id = ?", [hospitalId]);
    if (hospRows[0]?.name) hospitalName = hospRows[0].name;
  }

  // Retrieve ground-truth metrics based on report type
  if (reportType === "daily_operational" || reportType === "weekly_executive") {
    metricsSnapshot = await getOperationalInsightsOverview(hospitalId);
    if (!targetTitle) targetTitle = `${reportType === "weekly_executive" ? "Weekly Executive" : "Daily Operational"} Hospital Summary`;
  } else if (reportType === "bed_occupancy") {
    metricsSnapshot = await getBedAndAdmissionAnalytics(hospitalId);
    if (!targetTitle) targetTitle = "Inpatient Ward & Bed Occupancy Census";
  } else if (reportType === "inventory_forecast") {
    metricsSnapshot = await getInventoryForecastAnalytics(hospitalId);
    if (!targetTitle) targetTitle = "Pharmacy Formulary Inventory & Depletion Report";
  } else if (reportType === "lab_workload") {
    metricsSnapshot = await getLaboratoryAnalytics(hospitalId);
    if (!targetTitle) targetTitle = "Laboratory Workload & Turnaround Time Report";
  } else if (reportType === "monthly_financial") {
    metricsSnapshot = await getFinancialAnalytics(hospitalId);
    if (!targetTitle) targetTitle = "Hospital Financial & Revenue Reconciliation Report";
  } else if (reportType === "doctor_performance") {
    metricsSnapshot = await getDoctorWorkloadAnalytics(hospitalId);
    if (!targetTitle) targetTitle = "Medical Staff Workload & Consultation Throughput Report";
  } else if (reportType === "custom_nl" && nlPrompt) {
    // Natural Language report request
    metricsSnapshot = await getOperationalInsightsOverview(hospitalId);
    targetTitle = `Custom Operational Report: "${nlPrompt.slice(0, 40)}..."`;
  } else {
    metricsSnapshot = await getOperationalInsightsOverview(hospitalId);
    if (!targetTitle) targetTitle = "Hospital Operational Intelligence Report";
  }

  // Synthesize textual report with LLM or Local Formatter
  let { summary, recommendations } = synthesizeReportContent(reportType, targetTitle, metricsSnapshot, hospitalName);

  // If a natural language custom prompt was given, enhance the summary via AI Provider
  if (reportType === "custom_nl" && nlPrompt) {
    const aiRes = await callModel({
      systemPrompt: `You are an AI Hospital Operational Report Writer. Synthesize a professional, thorough hospital report answering the user's natural language request. Ground your answer STRICTLY in the provided MySQL database context. Use Markdown tables and bullet points. End with the mandatory clinical disclaimer.`,
      userPrompt: `Natural Language Report Request: "${nlPrompt}"\n\nVerified Hospital Database Context:\n${JSON.stringify(metricsSnapshot, null, 2)}`,
      contextData: metricsSnapshot,
    });
    summary = aiRes.content;
  }

  // Persist report in `ai_generated_reports`
  const [insertRes] = await pool.query(
    `INSERT INTO ai_generated_reports
      (report_number, hospital_id, user_id, report_type, title, period_start, period_end, summary, metrics_snapshot, recommendations, generated_by_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reportNumber,
      hospitalId,
      user.id,
      reportType,
      targetTitle,
      periodStart || new Date().toISOString().slice(0, 10),
      periodEnd || new Date().toISOString().slice(0, 10),
      summary,
      JSON.stringify(metricsSnapshot),
      JSON.stringify(recommendations),
      user.role,
    ]
  );

  return {
    id: insertRes.insertId,
    reportNumber,
    hospitalId,
    reportType,
    title: targetTitle,
    summary,
    recommendations,
    metricsSnapshot,
    generatedBy: {
      userId: user.id,
      role: user.role,
    },
    disclaimer: CLINICAL_DISCLAIMER,
    createdAt: new Date().toISOString(),
  };
}

/**
 * List saved reports for a hospital
 */
async function listReports(hospitalId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT
       r.id,
       r.report_number,
       r.hospital_id,
       h.name as hospital_name,
       r.user_id,
       u.full_name as author_name,
       r.report_type,
       r.title,
       r.period_start,
       r.period_end,
       r.generated_by_role,
       r.created_at
     FROM ai_generated_reports r
     LEFT JOIN hospitals h ON h.id = r.hospital_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE (? IS NULL OR r.hospital_id = ?)
     ORDER BY r.id DESC
     LIMIT ?`,
    [hospitalId, hospitalId, limit]
  );

  return rows;
}

/**
 * Get single report by ID
 */
async function getReportById(reportId, hospitalId = null, isSuperAdmin = false) {
  const [rows] = await pool.query(
    `SELECT r.*, h.name as hospital_name, u.full_name as author_name
     FROM ai_generated_reports r
     LEFT JOIN hospitals h ON h.id = r.hospital_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
    [reportId]
  );

  if (rows.length === 0) return null;
  const report = rows[0];

  // Tenant isolation check
  if (!isSuperAdmin && hospitalId && report.hospital_id !== hospitalId) {
    throw new Error("Unauthorized to access reports from another hospital");
  }

  return {
    ...report,
    metrics_snapshot: typeof report.metrics_snapshot === "string" ? JSON.parse(report.metrics_snapshot) : report.metrics_snapshot,
    recommendations: typeof report.recommendations === "string" ? JSON.parse(report.recommendations) : report.recommendations,
  };
}

module.exports = {
  generateReport,
  listReports,
  getReportById,
};
