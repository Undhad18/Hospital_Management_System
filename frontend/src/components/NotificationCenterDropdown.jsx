import React, { useState, useRef, useEffect } from "react";
import {
  Bell,
  Volume2,
  VolumeX,
  CheckCheck,
  Trash2,
  Package,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
  Mail,
  ShieldAlert,
  Info,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";

export default function NotificationCenterDropdown({ onOpenOrderModal, onOpenEmailQueue }) {
  const { user } = useAuth();
  const {
    adminNotifications,
    customerNotifications,
    unreadAdminCount,
    unreadCustomerCount,
    isSoundEnabled,
    setIsSoundEnabled,
    playChime,
    markAdminNotificationsAsRead,
    clearAdminNotifications,
    markCustomerNotificationsAsRead,
    clearCustomerNotifications,
    isConnected,
  } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all' | 'admin' | 'customer' | 'alerts'
  const dropdownRef = useRef(null);

  const isAdmin = user?.role === "admin";
  const unreadCount = isAdmin ? unreadAdminCount : unreadCustomerCount;

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  // Combine notifications with deduplication
  const rawNotifications = isAdmin
    ? [...adminNotifications]
    : [...customerNotifications];

  const allNotifications = Array.from(
    new Map(
      rawNotifications.map((n) => [
        n.id || `${n.type || 'notif'}_${n.orderId || 'none'}_${n.timestamp || ''}`,
        n,
      ])
    ).values()
  );

  const isAlertNotification = (n) =>
    Boolean(
      n.severity === "error" ||
        n.severity === "warning" ||
        n.type === "NOTIFICATION_FAILURE" ||
        n.type === "ORDER_CANCELLED" ||
        n.status === "cancelled"
    );

  // Non-alert order events are classified as Orders
  const isOrderNotification = (n) => !isAlertNotification(n);

  const alertsCount = allNotifications.filter(isAlertNotification).length;
  const ordersCount = allNotifications.filter(isOrderNotification).length;

  const filteredNotifications = allNotifications.filter((n) => {
    if (filter === "alerts") return isAlertNotification(n);
    if (filter === "orders") return isOrderNotification(n);
    return true;
  });

  const handleToggleOpen = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      if (isAdmin) {
        markAdminNotificationsAsRead();
      } else {
        markCustomerNotificationsAsRead();
      }
    }
  };

  const handleClear = () => {
    if (isAdmin) {
      clearAdminNotifications();
    } else {
      clearCustomerNotifications();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`relative flex items-center justify-center w-10 h-10 rounded-xl border transition cursor-pointer shadow-lg ${
          isOpen
            ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30"
            : "bg-slate-900/90 hover:bg-slate-800 border-white/10 text-slate-200 hover:border-indigo-500/40"
        }`}
        title="Real-Time Notification Feed"
      >
        <Bell className="w-4 h-4 transition group-hover:scale-110" />

        {/* Unread Counter Pill */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg border border-slate-900 animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

        {/* Live WebSocket Beacon */}
        <span
          className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${
            isConnected ? "bg-emerald-400" : "bg-rose-400"
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-slate-900/98 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl shadow-black/90 overflow-hidden z-[999] animate-fadeIn">
          {/* Header */}
          <div className="p-4 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                  {isAdmin ? "Admin Order Dispatch Feed" : "Customer Order Updates"}
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    LIVE
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  {allNotifications.length} Real-Time Event{allNotifications.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {/* Top Action Buttons: Sound toggle & Clear */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsSoundEnabled((prev) => !prev);
                  if (!isSoundEnabled) playChime("order");
                }}
                className={`p-1.5 rounded-lg border transition text-xs cursor-pointer ${
                  isSoundEnabled
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-slate-800 border-white/10 text-slate-400 hover:text-white"
                }`}
                title={isSoundEnabled ? "Sound Effects ON" : "Sound Effects MUTED"}
              >
                {isSoundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {allNotifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition text-xs cursor-pointer"
                  title="Clear All Notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-3 py-2 bg-slate-950/40 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                filter === "all"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              All ({allNotifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("orders")}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                filter === "orders"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Orders ({ordersCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("alerts")}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                filter === "alerts"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Alerts ({alertsCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-white/5 p-2 space-y-1.5">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Sparkles className="w-8 h-8 mx-auto text-indigo-400 mb-2 opacity-60 animate-pulse" />
                <p className="text-xs font-semibold text-slate-300">No New Notifications</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Real-time events will pop up instantly as orders transition and emails dispatch.
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isError = notif.severity === "error" || notif.type === "NOTIFICATION_FAILURE";
                const isWarning = notif.severity === "warning" || notif.status === "cancelled";
                const isOrder = notif.type === "NEW_ORDER";

                return (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-2xl border transition flex flex-col gap-1.5 ${
                      isError
                        ? "bg-rose-500/10 border-rose-500/20"
                        : isWarning
                        ? "bg-amber-500/10 border-amber-500/20"
                        : "bg-slate-900/80 border-white/5 hover:border-indigo-500/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isError ? (
                          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : isOrder ? (
                          <Package className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-white leading-tight">
                          {notif.title || "Order Notification"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {notif.timestamp ? new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Just now"}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed pl-6">
                      {notif.message}
                    </p>

                    {/* Quick action buttons */}
                    <div className="pl-6 flex items-center gap-2 pt-1">
                      {notif.orderId && onOpenOrderModal && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenOrderModal(notif.orderId);
                          }}
                          className="px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-bold border border-indigo-500/30 transition flex items-center gap-1 cursor-pointer"
                        >
                          View Order #{notif.orderId}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {isError && onOpenEmailQueue && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onOpenEmailQueue();
                          }}
                          className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/30 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Mail className="w-2.5 h-2.5" />
                          Inspect Queue & Retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Quick Links */}
          <div className="p-3 bg-slate-950/80 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
            {onOpenEmailQueue && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenEmailQueue();
                }}
                className="text-violet-400 hover:text-violet-300 transition flex items-center gap-1 font-bold cursor-pointer"
              >
                <Mail className="w-3 h-3" />
                Background Worker Queue
              </button>
            )}

            {onOpenOrderModal && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenOrderModal();
                }}
                className="text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 font-bold cursor-pointer"
              >
                <Package className="w-3 h-3" />
                Order Stepper Tracker
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
