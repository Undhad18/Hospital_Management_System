import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Truck,
  CheckCircle2,
  Package,
  AlertCircle,
  X,
  ExternalLink,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";

export default function CustomerStatusToast({ onOpenTracker }) {
  const { latestCustomerNotification, dismissCustomerNotification } = useSocket();
  const [visibleNotification, setVisibleNotification] = useState(null);

  useEffect(() => {
    if (latestCustomerNotification) {
      setVisibleNotification(latestCustomerNotification);
      // Auto-hide after 8 seconds
      const timer = setTimeout(() => {
        setVisibleNotification(null);
        dismissCustomerNotification();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [latestCustomerNotification, dismissCustomerNotification]);

  if (!visibleNotification) return null;

  const isCancelled = visibleNotification.status === "cancelled";
  const isDelivered = visibleNotification.status === "delivered";

  const toastElement = (
    <div
      className="fixed bottom-6 right-4 sm:right-6 z-[99999] max-w-sm w-[calc(100vw-2rem)] sm:w-96 pointer-events-auto animate-slideUp"
      role="alert"
    >
      <div
        className={`p-4 rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all shadow-black/80 ${
          isCancelled
            ? "bg-rose-950/95 border-rose-500/50 shadow-rose-950/60 text-rose-100"
            : isDelivered
            ? "bg-emerald-950/95 border-emerald-500/50 shadow-emerald-950/60 text-emerald-100"
            : "bg-slate-900/98 border-indigo-500/50 shadow-indigo-950/60 text-slate-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg mt-0.5 ${
                isCancelled
                  ? "bg-rose-500 text-white shadow-rose-500/30"
                  : isDelivered
                  ? "bg-emerald-500 text-white shadow-emerald-500/30"
                  : "bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-indigo-500/30"
              }`}
            >
              {isCancelled ? (
                <AlertCircle className="w-5 h-5" />
              ) : isDelivered ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Truck className="w-5 h-5 animate-pulse" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold font-heading text-white tracking-tight">
                  {visibleNotification.title || "Order Status Update"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase tracking-wider border ${
                    isCancelled
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      : isDelivered
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  }`}
                >
                  {visibleNotification.status || "LIVE"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug line-clamp-2">
                {visibleNotification.message}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setVisibleNotification(null);
              dismissCustomerNotification();
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer shrink-0"
            title="Dismiss Notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Button */}
        {visibleNotification.orderId && onOpenTracker && (
          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 font-bold">
              Order #{visibleNotification.orderId}
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenTracker(visibleNotification.orderId);
                setVisibleNotification(null);
                dismissCustomerNotification();
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/30 group"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Track Delivery Live</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(toastElement, document.body);
}
