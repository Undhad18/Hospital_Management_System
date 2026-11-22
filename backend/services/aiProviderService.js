/**
 * AI Provider Service — Multi-LLM Strategy Pattern with Local Heuristic Fallback
 * 
 * Supported Providers:
 * 1. Google Gemini (REST API via fetch)
 * 2. OpenAI (REST API via fetch)
 * 3. Anthropic Claude (REST API via fetch)
 * 4. Local Heuristic Provider (Deterministic, grounded local fallback)
 * 
 * Safety & Privacy:
 * - API keys are NEVER logged or transmitted to frontend clients.
 * - All responses carry healthcare operational disclaimers.
 * - Graceful fallback ensures zero system downtime if external AI APIs fail or lack quota.
 */

const CLINICAL_DISCLAIMER =
  "AI Operational Intelligence: Generated strictly for administrative and operational coordination based on authorized database records. Not a medical diagnosis, clinical evaluation, or prescription.";

/**
 * Returns safe metadata about current AI configuration (without exposing secrets)
 */
function getProviderInfo() {
  const provider = (process.env.AI_PROVIDER || "local").toLowerCase();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

  let activeProvider = provider;
  let activeModel = "local-heuristic-v1";

  if (provider === "gemini") {
    activeModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    if (!hasGeminiKey) activeProvider = "local";
  } else if (provider === "openai") {
    activeModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (!hasOpenAIKey) activeProvider = "local";
  } else if (provider === "anthropic") {
    activeModel = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
    if (!hasAnthropicKey) activeProvider = "local";
  } else {
    activeProvider = "local";
    activeModel = "local-heuristic-v1";
  }

  return {
    provider: activeProvider,
    configuredProvider: provider,
    model: activeModel,
    isLocalFallback: activeProvider === "local",
    hasExternalKey: hasGeminiKey || hasOpenAIKey || hasAnthropicKey,
    maxTokens: Number(process.env.AI_MAX_TOKENS || 2048),
    temperature: Number(process.env.AI_TEMPERATURE || 0.2),
  };
}

/**
 * Call Google Gemini REST API
 */
async function callGemini({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\nUser Question / Task:\n${userPrompt}` }
        ]
      }
    ],
    generationConfig: {
      temperature: temperature ?? 0.2,
      maxOutputTokens: maxTokens ?? 2048,
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response received from Gemini API");
  }

  return {
    content: text.trim(),
    model: `gemini/${model}`,
    provider: "gemini",
  };
}

/**
 * Call OpenAI Chat Completions REST API
 */
async function callOpenAI({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: temperature ?? 0.2,
    max_tokens: maxTokens ?? 2048,
    ...(jsonMode && { response_format: { type: "json_object" } }),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response received from OpenAI API");
  }

  return {
    content: text.trim(),
    model: `openai/${model}`,
    provider: "openai",
  };
}

/**
 * Call Anthropic Claude Messages REST API
 */
async function callAnthropic({ systemPrompt, userPrompt, temperature, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
  const url = "https://api.anthropic.com/v1/messages";

  const payload = {
    model,
    max_tokens: maxTokens ?? 2048,
    temperature: temperature ?? 0.2,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error("Empty response received from Anthropic API");
  }

  return {
    content: text.trim(),
    model: `anthropic/${model}`,
    provider: "anthropic",
  };
}

/**
 * Local Deterministic Heuristic Provider
 * High-performance, offline-capable fallback that synthesizes verified SQL ground truth.
 */
function callLocalHeuristic({ systemPrompt, userPrompt, contextData, jsonMode }) {
  // If JSON mode is requested
  if (jsonMode) {
    return {
      content: JSON.stringify({
        summary: "Heuristic operational data synthesis completed successfully.",
        contextSnapshot: contextData || null,
        status: "success",
        disclaimer: CLINICAL_DISCLAIMER,
      }),
      model: "local-heuristic-v1",
      provider: "local",
    };
  }

  // Synthesize textual response based on prompt and context
  let responseText = "";

  if (contextData) {
    // 1. Hospital Overview
    if (contextData.totalAppointmentsToday !== undefined || contextData.overview) {
      const o = contextData.overview || contextData;
      responseText = `### 🏥 Hospital Operational Overview
- **Active Appointments Today:** ${o.totalAppointmentsToday ?? 0}
- **Patients in Queue / Waiting:** ${o.patientsWaiting ?? 0}
- **Active Inpatient Admissions:** ${o.activeAdmissions ?? 0}
- **Ward Bed Occupancy:** ${o.occupiedBeds ?? 0} / ${o.totalBeds ?? 0} (${o.occupancyRate ?? 0}%)
- **Available Beds:** ${o.availableBeds ?? 0}
- **Low Stock Medicines:** ${o.lowStockCount ?? 0} items
- **Pending Laboratory Investigations:** ${o.pendingLabTests ?? 0} tests
- **Unpaid Bills Pending Collection:** ${o.pendingBillsCount ?? 0} bills (Totaling ₹${Number(o.pendingBillsAmount || 0).toLocaleString("en-IN")})

*Data queried live from database records at ${new Date().toLocaleTimeString()}.*`;

    // 2. Low Stock Medicines
    } else if (contextData.lowStockCount !== undefined || (Array.isArray(contextData.items) && (userPrompt || "").toLowerCase().includes("stock"))) {
      const count = contextData.lowStockCount ?? (contextData.items?.length || 0);
      if (count === 0) {
        responseText = `### 💊 Pharmacy Stock Alert
✅ **All formulary medicines are adequately stocked above their minimum alert levels.**

No immediate reorders are required at this time.
- Total Critical Items: **0**
- Monitored Formulary Status: **Optimal**`;
      } else {
        const itemList = (contextData.items || []).slice(0, 10).map((item, idx) => {
          const medName = item.medicine_name || `Medicine #${item.hospital_medicine_id || idx + 1}`;
          const generic = item.generic_name ? ` (${item.generic_name}${item.strength ? " - " + item.strength : ""})` : "";
          const price = item.sale_price ? ` • Price: ₹${Number(item.sale_price).toFixed(2)}` : "";
          return `${idx + 1}. **${medName}**${generic}\n   - Current Stock: **${item.current_stock || 0} units** (Min Alert Level: ${item.min_stock_alert_level || 0})${price}`;
        }).join("\n");

        responseText = `### 💊 Low Stock Medicine Alert
⚠️ **Found ${count} medicine${count > 1 ? "s" : ""} running low or at zero stock in the pharmacy repository:**

${itemList}

${count > 10 ? `\n*...and ${count - 10} more items below minimum stock threshold.*` : ""}

> **Recommendation:** Initiate pharmacy purchase requisitions for items with zero or critically low inventory to prevent prescription dispensing interruptions.`;
      }

    // 3. Expiring Medicines
    } else if (contextData.expiringBatchesCount !== undefined || contextData.batches) {
      const count = contextData.expiringBatchesCount ?? (contextData.batches?.length || 0);
      if (count === 0) {
        responseText = `### ⏳ Expiring Medicines Report (< 60 Days)
✅ **Zero medicine batches are approaching expiry within the next 60 days.**

All active pharmacy stock batches have safe validity periods.`;
      } else {
        const batchList = (contextData.batches || []).slice(0, 10).map((b, idx) => {
          const med = b.medicine_name || "Unknown Medicine";
          const str = b.strength ? ` (${b.strength})` : "";
          const expiryStr = b.expiry_date ? String(b.expiry_date).slice(0, 10) : "N/A";
          return `${idx + 1}. **${med}**${str} — Batch **#${b.batch_number || "N/A"}**\n   - Remaining Stock: **${b.current_quantity || 0} units**\n   - Expiry Date: **${expiryStr}** (${b.days_until_expiry ?? 0} days remaining)`;
        }).join("\n");

        responseText = `### ⏳ Expiring Medicines Alert (< 60 Days)
⚠️ **${count} medicine batch${count > 1 ? "es are" : " is"} scheduled to expire within the next 60 days:**

${batchList}

${count > 10 ? `\n*...and ${count - 10} additional batches approaching expiration.*` : ""}

> **Recommendation:** Prioritize dispensing first-expiry batches (FEFO protocol) or coordinate returns/replacements with suppliers before the expiration window.`;
      }

    // 4. Appointments Today
    } else if (contextData.totalToday !== undefined && contextData.completed !== undefined) {
      const t = contextData;
      let appList = "";
      if (Array.isArray(t.appointments) && t.appointments.length > 0) {
        appList = "\n\n**Upcoming / Active Consultations:**\n" + t.appointments.slice(0, 8).map((a, i) => {
          const time = a.appointment_time ? String(a.appointment_time).slice(0, 5) : "Scheduled";
          return `${i + 1}. **${time}** — Patient **${a.patient_name || "N/A"}** with **Dr. ${a.doctor_name || "Assigned Physician"}** (${a.department_name || "Outpatient"} | Status: *${a.status}*)`;
        }).join("\n");
      }
      responseText = `### 📅 Today's Appointments Summary
- **Total Scheduled Today:** **${t.totalToday ?? 0}**
- **Completed Consultations:** **${t.completed ?? 0}**
- **In-Waiting / In-Progress:** **${t.inWaiting ?? 0}**
- **Scheduled / Confirmed:** **${t.scheduled ?? 0}**
- **Cancelled / No-Show:** **${t.cancelled ?? 0}**${appList}`;

    // 5. Patient Outpatient Queue
    } else if (contextData.waitingCount !== undefined || contextData.queue) {
      const count = contextData.waitingCount ?? (contextData.queue?.length || 0);
      let qList = "";
      if (Array.isArray(contextData.queue) && contextData.queue.length > 0) {
        qList = "\n\n**Queue Breakdown:**\n" + contextData.queue.slice(0, 8).map((q, i) => {
          return `${i + 1}. Token **#${q.token_number || i + 1}**: **${q.patient_name || "Patient"}** → Dr. ${q.doctor_name || "Physician"} (${q.department_name || "OPD"}) • Est. Wait: ~${q.wait_time_minutes || 15}m`;
        }).join("\n");
      }
      responseText = `### 🚶 Patient Outpatient Queue Status
- **Patients Currently Waiting in Queue:** **${count}**
- **Average Estimated Wait Time:** **${count > 0 ? (count * 12) + " mins" : "0 mins"}**
- **Queue Status:** ${count > 10 ? "⚠️ High Volume" : "✅ Normal Flow"}${qList}`;

    // 6. Doctor Availability
    } else if (contextData.totalDoctors !== undefined || contextData.availableDoctors) {
      const total = contextData.totalDoctors ?? 0;
      const onDuty = contextData.onDutyCount ?? (contextData.availableDoctors?.length || 0);
      const docs = contextData.availableDoctors || contextData.allDoctors || [];
      let docList = "";
      if (docs.length > 0) {
        docList = "\n\n**Doctor Roster & Availability:**\n" + docs.slice(0, 10).map((d, i) => {
          const dept = d.department_name ? ` (${d.department_name})` : "";
          const spec = d.specialization ? ` • *${d.specialization}*` : "";
          const status = d.is_available ? "🟢 Available" : "🟡 In Consultation / Scheduled";
          const consults = d.consultation_count !== undefined ? ` [${d.consultation_count} consultations today]` : "";
          return `${i + 1}. **Dr. ${d.doctor_name || d.name}**${dept}${spec} — ${status}${consults}`;
        }).join("\n");
      }
      responseText = `### 👨‍⚕️ Doctor Availability & On-Duty Status
- **Total Doctors on Roster:** **${total}**
- **Doctors Currently Available / On Duty:** **${onDuty}**${docList}`;

    // 7. Ward Bed Availability
    } else if (contextData.wardsWithAvailableBeds !== undefined || contextData.allWards) {
      const wards = contextData.wardsWithAvailableBeds || contextData.allWards || [];
      const totalWards = contextData.totalWards ?? wards.length;
      let wardList = "";
      if (wards.length > 0) {
        wardList = "\n\n**Ward Availability Details:**\n" + wards.map((w, i) => {
          const type = w.ward_type ? ` [${w.ward_type.toUpperCase()}]` : "";
          return `${i + 1}. **${w.name || w.ward_name}**${type}: **${w.available_beds ?? 0} available beds** (Total Capacity: ${w.capacity || w.total_beds || "N/A"} | Occupied: ${w.occupied_beds ?? 0})`;
        }).join("\n");
      }
      responseText = `### 🏥 Ward & Bed Availability
- **Total Monitored Wards:** **${totalWards}**
- **Wards with Immediate Openings:** **${contextData.wardsWithAvailableBeds?.length ?? wards.length}**${wardList}`;

    // 8. Bed Occupancy & Capacity
    } else if (contextData.occupancyRate !== undefined && contextData.totalBeds !== undefined) {
      const b = contextData;
      let wardSummary = "";
      if (Array.isArray(b.wards) && b.wards.length > 0) {
        wardSummary = "\n\n**Ward Breakdown:**\n" + b.wards.map((w, i) => {
          return `${i + 1}. **${w.ward_name}** (${w.ward_type}): ${w.available_beds} free / ${w.total_beds} total (${w.occupancy_rate}% occupied)`;
        }).join("\n");
      }
      responseText = `### 🛏️ Hospital Bed Occupancy & Capacity
- **Total Inpatient Beds:** **${b.totalBeds ?? 0}**
- **Currently Occupied:** **${b.occupiedBeds ?? 0}** (**${b.occupancyRate ?? 0}%** occupancy rate)
- **Immediately Available:** **${b.availableBeds ?? 0}** beds
- **Maintenance / Sanitization:** **${b.maintenanceBeds ?? 0}** beds${wardSummary}`;

    // 9. Pending Lab Tests
    } else if (contextData.pendingCount !== undefined && contextData.tests) {
      const p = contextData;
      let testList = "";
      if (Array.isArray(p.tests) && p.tests.length > 0) {
        testList = "\n\n**Pending Test Orders:**\n" + p.tests.slice(0, 8).map((t, i) => {
          const patient = t.patient_name ? ` for **${t.patient_name}**` : "";
          const doc = t.doctor_name ? ` (Dr. ${t.doctor_name})` : "";
          const prio = t.priority ? ` • Priority: *${t.priority.toUpperCase()}*` : "";
          return `${i + 1}. Order **#${t.order_number || t.id || i + 1}**: **${t.test_name}**${patient}${doc}${prio}`;
        }).join("\n");
      }
      responseText = `### 🔬 Pending Laboratory Investigations
- **Active Pending Test Requests:** **${p.pendingCount ?? 0}**
- **Lab Status:** ${p.pendingCount > 10 ? "⚠️ High Workload" : "✅ Operating Normal"}${testList}`;

    // 10. Outstanding Bills
    } else if (contextData.totalPendingAmount !== undefined || contextData.bills) {
      const b = contextData;
      const count = b.pendingCount ?? (b.bills?.length || 0);
      const totalAmount = Number(b.totalPendingAmount || 0);
      let billList = "";
      if (Array.isArray(b.bills) && b.bills.length > 0) {
        billList = "\n\n**Pending Bills Snapshot:**\n" + b.bills.slice(0, 8).map((bill, i) => {
          const inv = bill.invoice_number || bill.bill_number || `Bill #${bill.id || i + 1}`;
          const pat = bill.patient_name ? ` (${bill.patient_name})` : "";
          const due = Number(bill.balance_amount || bill.total_amount || 0).toLocaleString("en-IN");
          return `${i + 1}. **${inv}**${pat} — **₹${due}** pending [${bill.billing_type || "Outpatient"}]`;
        }).join("\n");
      }
      responseText = `### 💳 Outstanding / Unpaid Invoices
- **Unpaid / Pending Bills:** **${count}**
- **Total Outstanding Balance:** **₹${totalAmount.toLocaleString("en-IN")}**${billList}`;

    // 11. Custom Insight / Analytics Objects
    } else if (contextData.appointmentInsights) {
      const a = contextData.appointmentInsights;
      responseText = `### 📅 Appointment & Doctor Schedule Summary
- **Total Scheduled Today:** ${a.totalToday ?? 0} appointments
- **Completed Consultations:** ${a.completedToday ?? 0}
- **In-Waiting / Checked-In:** ${a.inWaitingToday ?? 0}
- **Cancelled / No-Show:** ${a.cancelledToday ?? 0}
- **Estimated Average Wait Time:** ${a.estimatedWaitMinutes ?? 15} minutes
- **Active Doctors on Roster:** ${a.activeDoctorsCount ?? 0}`;
    } else if (contextData.bedInsights) {
      const b = contextData.bedInsights;
      responseText = `### 🛏️ Bed & Ward Capacity Summary
- **Total Inpatient Beds:** ${b.totalBeds ?? 0} across ${b.totalWards ?? 0} wards
- **Currently Occupied:** ${b.occupiedBeds ?? 0} (${b.occupancyRate ?? 0}%)
- **Immediately Available:** ${b.availableBeds ?? 0} beds
- **Under Maintenance:** ${b.maintenanceBeds ?? 0} beds
- **High Occupancy Alert:** ${b.highOccupancyWards?.length ? b.highOccupancyWards.map(w => w.name).join(", ") : "All wards within safe operational capacity (<85%)"}`;
    } else if (contextData.inventoryInsights) {
      const inv = contextData.inventoryInsights;
      responseText = `### 💊 Pharmacy Formulary & Stock Summary
- **Total Formulary Medicines:** ${inv.totalMedicines ?? 0}
- **Low Stock Alert Items:** ${inv.lowStockItems?.length ?? 0}
- **Batches Approaching Expiry (<60 Days):** ${inv.expiringBatchesCount ?? 0}
- **Immediate Recommended Reorders:** ${inv.recommendedReordersCount ?? 0}`;
    } else if (Array.isArray(contextData)) {
      responseText = `### 📋 Hospital Records (${contextData.length} entries)\n` +
        contextData.slice(0, 10).map((row, i) => {
          if (typeof row === "object" && row !== null) {
            const keys = Object.keys(row).slice(0, 4);
            return `${i + 1}. ` + keys.map(k => `**${k}**: ${row[k]}`).join(" | ");
          }
          return `${i + 1}. ${row}`;
        }).join("\n");
    } else if (typeof contextData === "object" && contextData !== null) {
      const entries = Object.entries(contextData);
      responseText = `### 📋 Operational Metrics\n` +
        entries.map(([k, v]) => {
          const label = String(k || "")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .trim()
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
          if (typeof v === "object" && v !== null) {
            return `- **${label}**: ${Array.isArray(v) ? v.length + " items" : JSON.stringify(v)}`;
          }
          return `- **${label}**: ${v}`;
        }).join("\n");
    } else {
      responseText = `### 📋 System Information\n${String(contextData)}`;
    }
  } else {
    responseText = `I have received your inquiry: "${userPrompt}". 
Please specify a department (appointments, beds, pharmacy, laboratory, or billing) or ask a specific operational question (e.g. "How many beds are available?" or "Which medicines are low in stock?").`;
  }

  return {
    content: responseText,
    model: "local-heuristic-v1",
    provider: "local",
  };
}

/**
 * Main Central Model Execution Gateway
 * Handles provider selection, API calls, error catching, and automatic fallback.
 */
async function callModel({
  systemPrompt = "You are an AI Hospital Operational Assistant. Provide helpful, accurate operational summaries from data.",
  userPrompt,
  contextData = null,
  temperature = 0.2,
  maxTokens = 2048,
  jsonMode = false,
}) {
  const startTime = Date.now();
  const provider = (process.env.AI_PROVIDER || "local").toLowerCase();
  let result = null;
  let fallbackOccurred = false;
  let primaryError = null;

  try {
    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      result = await callGemini({ systemPrompt, userPrompt, temperature, maxTokens });
    } else if (provider === "openai" && process.env.OPENAI_API_KEY) {
      result = await callOpenAI({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode });
    } else if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      result = await callAnthropic({ systemPrompt, userPrompt, temperature, maxTokens });
    } else {
      // Local Heuristic Provider
      result = callLocalHeuristic({ systemPrompt, userPrompt, contextData, jsonMode });
    }
  } catch (err) {
    primaryError = err.message;
    console.warn(`[AI Provider Warning] ${provider} call failed: "${err.message}". Executing Local Heuristic Fallback.`);
    result = callLocalHeuristic({ systemPrompt, userPrompt, contextData, jsonMode });
    fallbackOccurred = true;
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    success: true,
    content: result.content,
    model: result.model,
    provider: result.provider,
    fallbackOccurred,
    primaryError: fallbackOccurred ? primaryError : null,
    executionTimeMs,
    disclaimer: CLINICAL_DISCLAIMER,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getProviderInfo,
  callModel,
  CLINICAL_DISCLAIMER,
};
