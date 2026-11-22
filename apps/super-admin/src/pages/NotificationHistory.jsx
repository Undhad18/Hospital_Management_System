import { useCallback, useEffect, useState, useMemo } from "react";
import { getNotifications, retryNotification, runReminders } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

const TYPE_LABELS = {
  account_pending_review: "Account Pending Review",
  account_approved: "Account Approved",
  account_credentials: "Login Credentials",
  booking_received: "Booking Received",
  booking_confirmed: "Booking Confirmed",
  appointment_cancelled: "Appointment Cancelled",
  appointment_rescheduled: "Appointment Rescheduled",
  appointment_reminder: "Upcoming 24h Reminder",
  appointment_completed: "Consultation Summary",
  follow_up_scheduled: "Follow-up Scheduled",
  password_reset_otp: "Password Reset OTP",
  registration_otp: "Registration OTP",
};

export default function NotificationHistory({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingId, setRetryingId] = useState(null);
  const [runningReminders, setRunningReminders] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await getNotifications(token, {
        status: statusFilter,
        type: typeFilter,
        search: searchQuery,
        page,
        limit: 25,
      });

      setNotifications(res.data || []);
      setTotalPages(res.totalPages || 1);
      setTotalRecords(res.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load notification history.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, typeFilter, searchQuery, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  async function handleRetry(notification) {
    if (retryingId !== null) return;
    setRetryingId(notification.id);
    setMessage("");
    setError("");

    try {
      const res = await retryNotification(token, notification.id);
      setMessage(`Notification #${notification.id} re-sent successfully.`);
      fetchHistory();
    } catch (err) {
      setError(err.message || "Failed to re-send notification.");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRunReminders() {
    if (runningReminders) return;
    if (!window.confirm("Scan database and dispatch reminders for confirmed appointments scheduled in the next 48 hours?")) {
      return;
    }

    setRunningReminders(true);
    setMessage("");
    setError("");

    try {
      const res = await runReminders(token, 2);
      setMessage(res.message || "Reminders successfully processed.");
      fetchHistory();
    } catch (err) {
      setError(err.message || "Failed to run reminder batch.");
    } finally {
      setRunningReminders(false);
    }
  }

  const metrics = useMemo(() => {
    const sent = notifications.filter((n) => n.status === "sent").length;
    const failed = notifications.filter((n) => n.status === "failed").length;
    const pending = notifications.filter((n) => n.status === "pending" || n.status === "processing").length;
    return { sent, failed, pending };
  }, [notifications]);

  return (
    <div className="w-full space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            System Notification Outbox &amp; Email Delivery History
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Global healthcare communication ledger, delivery monitoring, and automated reminder triggers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunReminders}
            disabled={runningReminders}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer disabled:opacity-60"
          >
            <svg className={`w-3.5 h-3.5 text-sky-600 ${runningReminders ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{runningReminders ? "Scanning..." : "Trigger 24h Reminders"}</span>
          </button>

          <button
            type="button"
            onClick={fetchHistory}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="font-bold text-emerald-700 hover:text-emerald-900">✕</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-md flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="font-bold text-rose-700 hover:text-rose-900">✕</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 w-full">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Notifications</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalRecords}</p>
          <span className="text-xs text-slate-400">Recorded in outbox log</span>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Delivered (Sent)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.sent}</p>
          <span className="text-xs text-slate-400">On current page</span>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">Failed Deliveries</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{metrics.failed}</p>
          <span className="text-xs text-slate-400">Actionable for retry</span>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Queued / Retrying</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.pending}</p>
          <span className="text-xs text-slate-400">Outbox processing queue</span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between relative z-20">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search email, subject, or reference..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-500 text-[11px] font-medium">Status:</span>
            <div className="w-36">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "sent", label: "Sent" },
                  { value: "failed", label: "Failed" },
                  { value: "pending", label: "Pending" },
                  { value: "processing", label: "Processing" },
                ]}
                placeholder="All Statuses"
              />
            </div>
          </div>

          {/* Type Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-500 text-[11px] font-medium">Event:</span>
            <div className="w-56">
              <CustomDropdown
                value={typeFilter}
                onChange={(val) => {
                  setTypeFilter(val);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Notification Events" },
                  ...Object.entries(TYPE_LABELS).map(([k, label]) => ({
                    value: k,
                    label: label,
                  })),
                ]}
                placeholder="All Notification Events"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Delivery Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-sky-600 border-t-transparent mb-2"></div>
            <p>Loading notification outbox logs...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-slate-700">No notification logs found</p>
            <p className="text-slate-400 mt-1">No outbound emails match your selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4">Event Type</th>
                  <th className="py-2.5 px-4">Subject &amp; Reference</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Dispatched At</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {notifications.map((n) => {
                  const isSent = n.status === "sent";
                  const isFailed = n.status === "failed";
                  const isPending = n.status === "pending" || n.status === "processing";

                  return (
                    <tr key={n.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{n.recipient_email}</div>
                        {n.recipient_name && (
                          <div className="text-[11px] text-slate-500">{n.recipient_name}</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                          {TYPE_LABELS[n.notification_type] || n.notification_type}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-slate-800 truncate" title={n.subject}>
                          {n.subject}
                        </div>
                        {n.appointment_number && (
                          <div className="text-[11px] font-mono text-sky-600 font-semibold mt-0.5">
                            #{n.appointment_number}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isSent
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : isFailed
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              isSent ? "bg-emerald-500" : isFailed ? "bg-rose-500" : "bg-amber-500 animate-pulse"
                            }`}
                          ></span>
                          {n.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[11px] font-mono text-slate-600">
                        {n.attempts} / {n.max_attempts}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                        {n.sent_at
                          ? new Date(n.sent_at).toLocaleString()
                          : n.created_at
                          ? new Date(n.created_at).toLocaleString()
                          : "—"}
                      </td>

                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedNotification(n)}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md text-[11px] font-medium transition cursor-pointer"
                        >
                          View Log
                        </button>

                        {isFailed && (
                          <button
                            type="button"
                            disabled={retryingId === n.id}
                            onClick={() => handleRetry(n)}
                            className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                          >
                            {retryingId === n.id ? "Retrying..." : "Retry"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>Page {page} of {totalPages} ({totalRecords} total items)</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail / Log Inspection Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                Delivery Log Details #{selectedNotification.id}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Recipient:</span>
                <span className="col-span-2 font-mono text-slate-900">{selectedNotification.recipient_email}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Event:</span>
                <span className="col-span-2 text-slate-900">
                  {TYPE_LABELS[selectedNotification.notification_type] || selectedNotification.notification_type}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Subject:</span>
                <span className="col-span-2 font-semibold text-slate-900">{selectedNotification.subject}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Status:</span>
                <span className="col-span-2 font-semibold capitalize text-slate-900">{selectedNotification.status}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500 font-medium">Attempts:</span>
                <span className="col-span-2 font-mono">{selectedNotification.attempts} / {selectedNotification.max_attempts}</span>
              </div>

              {selectedNotification.provider_message_id && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500 font-medium">Provider ID:</span>
                  <span className="col-span-2 font-mono text-[11px] text-slate-600 truncate">{selectedNotification.provider_message_id}</span>
                </div>
              )}

              {selectedNotification.error_message && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-sm text-rose-800 text-[11px] font-mono">
                  <strong>Delivery Failure:</strong> {selectedNotification.error_message}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
