import React, { useState, useEffect } from "react";
import {
  getIdempotencyKeys,
  simulateStripeWebhook,
  getAllOrders,
  getMyOrders,
} from "../../services/orderService";
import { useAuth } from "../../context/AuthContext";
import {
  Key,
  ShieldCheck,
  Send,
  RefreshCw,
  CreditCard,
  Shield,
  Clock,
  Check,
} from "lucide-react";

export default function StripeIdempotencyStudio() {
  const { user } = useAuth();
  const [idempotencyKeys, setIdempotencyKeys] = useState([]);
  const [idempotencyLoading, setIdempotencyLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [webhookSimOrderId, setWebhookSimOrderId] = useState("");
  const [webhookSimType, setWebhookSimType] = useState("payment_intent.succeeded");
  const [webhookSimLoading, setWebhookSimLoading] = useState(false);
  const [webhookSimResult, setWebhookSimResult] = useState(null);

  const loadIdempotencyKeys = async () => {
    setIdempotencyLoading(true);
    try {
      const res = await getIdempotencyKeys(50);
      if (res.success) {
        setIdempotencyKeys(res.data || []);
      }
    } catch (err) {
      console.error("Failed to load idempotency keys:", err);
    } finally {
      setIdempotencyLoading(false);
    }
  };

  const loadOrdersForDropdown = async () => {
    try {
      const res = user?.role === "admin" ? await getAllOrders() : await getMyOrders();
      if (res.success) {
        setOrders(res.data || res.orders || []);
      }
    } catch (err) {
      console.error("Failed to load orders for webhook simulator:", err);
    }
  };

  useEffect(() => {
    loadIdempotencyKeys();
    loadOrdersForDropdown();
  }, []);

  const handleSimulateWebhook = async (e) => {
    e.preventDefault();
    if (!webhookSimOrderId) return;
    setWebhookSimLoading(true);
    setWebhookSimResult(null);
    try {
      const res = await simulateStripeWebhook({
        eventType: webhookSimType,
        orderId: Number(webhookSimOrderId),
        amount: 249900,
      });
      setWebhookSimResult(res);
      loadIdempotencyKeys();
    } catch (err) {
      setWebhookSimResult({ success: false, message: err.message });
    } finally {
      setWebhookSimLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-slate-900/80 to-indigo-950/70 border border-emerald-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
                TASK 2: STRIPE & IDEMPOTENCY ENGINE
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-500/30">
                HMAC SHA-256
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Stripe Test Payments & Idempotent Checkout
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Prevents duplicate order creation and double charges during network retries or double-clicks using client Idempotency-Keys, server-side PaymentIntents, and asynchronous Stripe webhook handlers.
            </p>
          </div>

          <button
            onClick={loadIdempotencyKeys}
            disabled={idempotencyLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${idempotencyLoading ? "animate-spin text-emerald-400" : ""}`} />
            <span>Sync Idempotency Logs</span>
          </button>
        </div>
      </div>

      {/* Three Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Recorded Keys</span>
            <Key className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">{idempotencyKeys.length}</p>
          <p className="text-[11px] text-slate-500">Stored in MySQL <code className="text-indigo-300">idempotency_keys</code></p>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Double-Click Protection</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">ACTIVE</p>
          <p className="text-[11px] text-slate-500">Duplicate requests replay cached response</p>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">Stripe Webhooks</span>
            <Send className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-2xl font-black text-violet-400 font-mono">Real-Time</p>
          <p className="text-[11px] text-slate-500">HMAC-signed signature verification</p>
        </div>
      </div>

      {/* Two-Column Grid: Webhook Dispatcher & Idempotency Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Stripe Webhook Simulator Console (5 Cols) */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Stripe Webhook Simulator</h3>
              <p className="text-[11px] text-slate-400">Dispatch simulated Stripe events to test webhook handlers</p>
            </div>
          </div>

          <form onSubmit={handleSimulateWebhook} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold block">Target Order for Reconciliation</label>
              <select
                value={webhookSimOrderId}
                onChange={(e) => setWebhookSimOrderId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                required
              >
                <option value="">Select an order to target...</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    Order #{o.id} - ₹${Number(o.total_amount).toFixed(2)} [Order: {o.status} | Payment: {o.payment_status || "pending"}]
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold block">Webhook Event Type</label>
              <select
                value={webhookSimType}
                onChange={(e) => setWebhookSimType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="payment_intent.succeeded">payment_intent.succeeded (Payment Succeeded - Mark Paid & Confirmed)</option>
                <option value="payment_intent.processing">payment_intent.processing (Delayed Payment - Bank/3DS Processing)</option>
                <option value="payment_intent.payment_failed">payment_intent.payment_failed (Card Declined - Cancel & Restore Stock)</option>
                <option value="charge.refunded">charge.refunded (Customer Refunded - Restore Stock)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={webhookSimLoading || !webhookSimOrderId}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-violet-600/30"
            >
              {webhookSimLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching Webhook...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Stripe Webhook Event</span>
                </>
              )}
            </button>
          </form>

          {/* Webhook Result Output */}
          {webhookSimResult && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-2 animate-fadeIn text-xs">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">Webhook Response:</span>
                <span className={webhookSimResult.success ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                  {webhookSimResult.success ? "200 OK" : "FAILED"}
                </span>
              </div>
              <pre className="p-2.5 rounded-xl bg-slate-900 text-[10px] font-mono text-indigo-300 overflow-x-auto max-h-40">
                {JSON.stringify(webhookSimResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right: Idempotency Keys Registry (7 Cols) */}
        <div className="lg:col-span-7 p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Idempotency Keys Registry</h3>
                  <p className="text-[11px] text-slate-400">Live records from MySQL InnoDB table</p>
                </div>
              </div>

              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                {idempotencyKeys.length} Total Keys
              </span>
            </div>
          </div>

          {/* Idempotency Records List */}
          <div className="flex-1 overflow-y-auto max-h-[360px] space-y-2 pr-1 custom-scrollbar">
            {idempotencyLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Querying idempotency table...</span>
              </div>
            ) : idempotencyKeys.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Key className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <span>No idempotency keys recorded yet. Complete a checkout in the cart to create one.</span>
              </div>
            ) : (
              idempotencyKeys.map((k) => (
                <div
                  key={k.id}
                  className="p-3 rounded-2xl bg-slate-950/80 border border-white/5 hover:border-emerald-500/30 flex items-center justify-between gap-3 text-xs transition"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white font-bold text-[11px] truncate max-w-[200px]">
                        {k.idempotency_key}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${
                          k.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : k.status === "PROCESSING"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Path: {k.request_path} • Status Code: {k.response_code || 200}
                    </p>
                  </div>

                  <div className="text-right text-[10px] font-mono text-slate-500 shrink-0">
                    {new Date(k.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Idempotency Architecture Note */}
          <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>How Idempotency Works:</strong> When a client sends a request with an <code className="text-white">Idempotency-Key</code> header, the server atomically records it in <code className="text-white">idempotency_keys</code>. Retried requests bypass ACID inventory deductions and return the cached order safely.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
