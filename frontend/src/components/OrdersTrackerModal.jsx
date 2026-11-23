import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Package,
  Clock,
  CheckCircle2,
  RefreshCw,
  X,
  Radio,
  Mail,
  ChevronRight,
  Sparkles,
  ShoppingBag,
  Truck,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { getMyOrders, getAllOrders, getOrderById } from "../services/orderService";
import OrderStatusStepper from "./OrderStatusStepper";
import BackgroundEmailQueueInspector from "./BackgroundEmailQueueInspector";
import DatabaseConsistencyInspector from "./DatabaseConsistencyInspector";

export default function OrdersTrackerModal({ isOpen, onClose, initialOrderId = null }) {
  const { user } = useAuth();
  const { latestStatusUpdate, latestNewOrder, isConnected } = useSocket();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailQueueOpen, setIsEmailQueueOpen] = useState(false);
  const [isConsistencyOpen, setIsConsistencyOpen] = useState(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = user?.role === "admin" ? await getAllOrders(30) : await getMyOrders();
      if (res?.success && Array.isArray(res.data)) {
        setOrders(res.data);
        if (res.data.length > 0) {
          const targetId =
            initialOrderId !== null && initialOrderId !== undefined
              ? Number(initialOrderId)
              : selectedOrder?.id;

          const match = targetId
            ? res.data.find((o) => Number(o.id) === Number(targetId))
            : null;

          setSelectedOrder(match || res.data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrders();
    }
  }, [isOpen, user]);

  // Real-time auto-refresh when new order is placed
  useEffect(() => {
    if (latestNewOrder && isOpen) {
      fetchOrders();
    }
  }, [latestNewOrder, isOpen]);

  const handleOrderUpdated = useCallback((updated) => {
    if (updated?.status) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setOrders((prev) =>
        prev.map((o) =>
          Number(o.id) === Number(updated.orderId)
            ? { ...o, status: updated.status, updated_at: updated.timestamp }
            : o
        )
      );
    }
  }, []);

  // Synchronize with initialOrderId whenever modal opens or initialOrderId changes
  useEffect(() => {
    if (isOpen && initialOrderId !== null && initialOrderId !== undefined) {
      const numId = Number(initialOrderId);
      if (orders.length > 0) {
        const found = orders.find((o) => Number(o.id) === numId);
        if (found) {
          setSelectedOrder(found);
          return;
        }
      }

      // If not present in the current list, fetch this order directly
      getOrderById(numId)
        .then((res) => {
          if (res?.success && res.data) {
            setSelectedOrder(res.data);
            setOrders((prev) => {
              const exists = prev.some((o) => Number(o.id) === Number(res.data.id));
              return exists ? prev : [res.data, ...prev];
            });
          }
        })
        .catch((err) => console.error("Failed to fetch initial order:", err));
    }
  }, [initialOrderId, isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Real-time update when an order status changes via Socket.IO
  useEffect(() => {
    if (latestStatusUpdate) {
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          Number(o.id) === Number(latestStatusUpdate.orderId)
            ? { ...o, status: latestStatusUpdate.status, updated_at: latestStatusUpdate.timestamp }
            : o
        )
      );

      if (selectedOrder && Number(selectedOrder.id) === Number(latestStatusUpdate.orderId)) {
        setSelectedOrder((prev) => ({
          ...prev,
          status: latestStatusUpdate.status,
          updated_at: latestStatusUpdate.timestamp,
        }));
      }
    }
  }, [latestStatusUpdate]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-hidden animate-fadeIn flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md transition-opacity z-0"
      />

      {/* Main Container */}
      <div className="relative w-full max-w-5xl h-[88vh] bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Real-Time Orders & Delivery Tracker
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  SOCKET.IO LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Instant WebSocket progression: Placed &rarr; Confirmed &rarr; Packed &rarr; Shipped &rarr; Delivered
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user?.role === "admin" && (
              <>
                <button
                  onClick={() => setIsConsistencyOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Run Database Integrity & Consistency Check"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>DB Consistency</span>
                </button>
                <button
                  onClick={() => setIsEmailQueueOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Queue</span>
                </button>
              </>
            )}

            <button
              onClick={fetchOrders}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 border border-white/10 transition cursor-pointer"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Orders List (4 Cols) */}
          <div className="md:col-span-4 border-r border-white/10 bg-slate-950/50 flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-white/5 flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Orders ({orders.length})</span>
              <span className="text-[11px] font-mono text-indigo-400">
                {user?.role === "admin" ? "All Platform Orders" : "My Orders"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No orders placed yet.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Add products to cart and checkout!</p>
                </div>
              ) : (
                orders.map((order) => {
                  const isSelected =
                    selectedOrder && Number(selectedOrder.id) === Number(order.id);
                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className={`p-3 rounded-2xl border transition cursor-pointer relative overflow-hidden ${isSelected
                          ? "bg-indigo-950/50 border-indigo-500/60 shadow-lg shadow-indigo-500/15"
                          : "bg-slate-900/60 border-white/5 hover:border-white/20 hover:bg-slate-900"
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-white">#{order.id}</span>
                          <span className="text-[10px] text-slate-400">
                            {order.items?.length || 1} {order.items?.length === 1 ? "item" : "items"}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold ${order.status === "cancelled"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : order.status === "delivered"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : order.status === "shipped"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : order.status === "packed"
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    : order.status === "confirmed"
                                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                      : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            }`}
                        >
                          {order.status || "placed"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-2">
                        <span className="flex items-center gap-1.5">
                          <span>{new Date(order.created_at || Date.now()).toLocaleDateString()}</span>
                          <span
                            className={`text-[9px] uppercase font-bold ${order.payment_status === "paid" || order.payment_status === "succeeded"
                                ? "text-emerald-400"
                                : order.payment_status === "refunded"
                                  ? "text-rose-400"
                                  : order.payment_status === "processing"
                                    ? "text-blue-400"
                                    : order.payment_status === "failed"
                                      ? "text-rose-400"
                                      : "text-amber-400"
                              }`}
                          >
                            • {order.payment_status || "pending"}
                          </span>
                        </span>
                        <span className="font-bold text-emerald-400">
                          ₹{Number(order.total_amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Order Stepper & Real-Time Tracking Panel (8 Cols) */}
          <div className="md:col-span-8 flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/60">
            {selectedOrder ? (
              <div className="space-y-5">
                <OrderStatusStepper
                  order={selectedOrder}
                  readOnly={user?.role !== "admin"}
                  onOrderUpdated={handleOrderUpdated}
                  onViewEmailLogs={
                    user?.role === "admin" ? () => setIsEmailQueueOpen(true) : undefined
                  }
                />

                {/* Additional Order Meta Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2 text-xs">
                    <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-indigo-400" />
                      Shipping & Delivery Info
                    </h4>
                    <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                      {selectedOrder.shipping_address || "221B Baker Street, London, NW1 6XE"}
                    </p>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>Method: Standard Express</span>
                      <span className="text-indigo-400">Carrier: Air Logistics</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2 text-xs">
                    <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      Payment & InnoDB Row-Locks
                    </h4>
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                      <span>Payment Method:</span>
                      <span className="text-white capitalize">{selectedOrder.payment_method || "Credit Card"}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                      <span>Total Paid:</span>
                      <span className="text-emerald-400 font-bold">₹{Number(selectedOrder.total_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-white/5 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Protected by MySQL ACID Row Locks
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <Package className="w-12 h-12 text-slate-700 mb-3" />
                <h3 className="text-sm font-bold text-slate-300">Select an Order</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Click any order on the left to inspect its live real-time status progression and trigger simulated delivery steps.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Background Email Queue Inspector Modal */}
      <BackgroundEmailQueueInspector
        isOpen={isEmailQueueOpen}
        onClose={() => setIsEmailQueueOpen(false)}
        targetOrderId={selectedOrder?.id}
      />

      {/* Database Consistency Inspector Modal */}
      <DatabaseConsistencyInspector
        isOpen={isConsistencyOpen}
        onClose={() => setIsConsistencyOpen(false)}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
}
