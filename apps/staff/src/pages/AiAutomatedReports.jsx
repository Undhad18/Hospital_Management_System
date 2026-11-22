import { useState, useEffect } from "react";
import FormattedMarkdown from "../components/FormattedMarkdown";
import {
  generateAiReport,
  getAiReports,
  getAiReportDetail,
} from "../services/api";

const REPORT_TYPES = [
  { id: "daily_operational", label: "Daily Hospital Operations", period: "daily", desc: "Comprehensive census: appointments, queue, beds, pharmacy, and daily billing." },
  { id: "bed_occupancy", label: "Inpatient Bed & Ward Census", period: "daily", desc: "Ward-by-ward occupancy rates, available capacity, and shortage risk indicators." },
  { id: "inventory_forecast", label: "Pharmacy Inventory & Reorder", period: "weekly", desc: "Stock depletion estimates, FEFO expiry risks, and recommended PO batches." },
  { id: "lab_workload", label: "Laboratory Diagnostic Workload", period: "daily", desc: "Turnaround time velocity, pending orders, and test delays." },
  { id: "doctor_performance", label: "Doctor Roster & Schedule Pacing", period: "weekly", desc: "Consultation volumes, schedule utilization, and workload balance." },
  { id: "weekly_executive", label: "Weekly Executive Briefing", period: "weekly", desc: "Macro trends across clinical departments, revenue channels, and patient throughput." },
  { id: "monthly_financial", label: "Monthly Financial Reconciliation", period: "monthly", desc: "Consultation vs pharmacy revenue, receivables aging, and refund audit." },
  { id: "custom_nl", label: "Custom Natural Language Report", period: "daily", desc: "Ask the AI engine to summarize specific operational metrics in natural language." },
];

export default function AiAutomatedReports({ session }) {
  const token = session.token;
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    report_type: "daily_operational",
    period: "daily",
    prompt: "",
  });

  useEffect(() => {
    loadReports();
  }, [token]);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await getAiReports(token);
      if (res.success && res.data) {
        setReports(res.data);
      }
    } catch (err) {
      setError("Failed to load reports: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewReport(reportId) {
    setError(null);
    try {
      const res = await getAiReportDetail(token, reportId);
      if (res.success && res.data) {
        setSelectedReport(res.data);
      }
    } catch (err) {
      setError("Failed to load report detail: " + err.message);
    }
  }

  async function handleCreateReport(e) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const res = await generateAiReport(token, {
        report_type: formData.report_type,
        period: formData.period,
        parameters: formData.prompt ? { prompt: formData.prompt } : {},
      });

      if (res.success && res.data) {
        setShowGenerateModal(false);
        setFormData({ report_type: "daily_operational", period: "daily", prompt: "" });
        loadReports();
        setSelectedReport(res.data);
      }
    } catch (err) {
      setError("Failed to generate report: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
            <h2 className="text-base font-bold text-slate-900">
              AI Operational Reports &amp; Intelligence Briefings
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Grounded automated report generation for daily operations, inpatient capacity, inventory forecasting, and financial reconciliation.
          </p>
        </div>

        <button
          onClick={() => setShowGenerateModal(true)}
          className="self-start md:self-auto px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
        >
          <span>+</span>
          <span>Generate New Report</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Main Layout: List + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports List */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col h-[650px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Generated Reports Archive
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {reports.length} Reports
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No reports generated yet. Click "Generate New Report" to create your first report.
              </div>
            ) : (
              reports.map((r) => {
                const isSelected = selectedReport?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => handleViewReport(r.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                      isSelected
                        ? "bg-sky-50/80 border-sky-300 text-sky-900 shadow-2xs"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold truncate text-xs">{r.title || r.report_type}</span>
                      <span className="text-[10px] font-mono text-slate-500 uppercase bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {r.period}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Code: {r.report_code || `#${r.id}`}</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Report Preview Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-2xs p-6 flex flex-col h-[650px] overflow-hidden">
          {selectedReport ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Report Header Bar */}
              <div className="pb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedReport.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono mt-1">
                    <span>Code: {selectedReport.report_code}</span>
                    <span>•</span>
                    <span>Type: {selectedReport.report_type}</span>
                    <span>•</span>
                    <span>Generated: {new Date(selectedReport.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded border border-slate-300 transition"
                  >
                    Print / Export
                  </button>
                </div>
              </div>

              {/* Report Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4">
                {/* Markdown Generated Content */}
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
                  <FormattedMarkdown content={selectedReport.content_markdown || selectedReport.summary} />
                </div>

                {/* Grounding & Source Badges */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono gap-2">
                  <span>Data Sources: {Array.isArray(selectedReport.sources_used) ? selectedReport.sources_used.join(", ") : (selectedReport.sources_used || "MySQL Ground Truth")}</span>
                  <span>Execution: Grounded Heuristic Engine</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
              <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs font-semibold text-slate-600">No Report Selected</p>
              <p className="text-xs text-slate-400 mt-1">Select an existing report from the archive or generate a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* ================= GENERATE REPORT MODAL ================= */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Generate Automated Hospital Report
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Report Type
                </label>
                <select
                  value={formData.report_type}
                  onChange={(e) => {
                    const sel = REPORT_TYPES.find((r) => r.id === e.target.value);
                    setFormData({
                      ...formData,
                      report_type: e.target.value,
                      period: sel ? sel.period : "daily",
                    });
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  {REPORT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.period.toUpperCase()})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {REPORT_TYPES.find((r) => r.id === formData.report_type)?.desc}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Aggregation Period
                </label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  <option value="daily">Daily Snapshot</option>
                  <option value="weekly">Weekly Aggregate</option>
                  <option value="monthly">Monthly Aggregate</option>
                </select>
              </div>

              {formData.report_type === "custom_nl" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Natural Language Brief
                  </label>
                  <textarea
                    rows={3}
                    value={formData.prompt}
                    onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                    placeholder="E.g. Summarize ICU bed occupancy and highlight medications running below 10 units..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                    required
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  disabled={generating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  {generating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Generating Report...</span>
                    </>
                  ) : (
                    <span>Generate Grounded Report</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
