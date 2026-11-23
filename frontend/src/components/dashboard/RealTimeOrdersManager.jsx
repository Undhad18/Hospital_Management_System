import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import {
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  simulateOrderFlow,
  clearAllOrderData,
} from "../../services/orderService";
import OrderStatusStepper from "../OrderStatusStepper";
import DatabaseConsistencyInspector from "../DatabaseConsistencyInspector";
import {
  Package,
  Truck,
  CheckCircle,
  DollarSign,
  Radio,
  Search,
  ShoppingBag,
  Sparkles,
  Layers,
  Play,
  Clock,
  RefreshCw,
  ShieldCheck,
  Ban,
  Trash2,
} from "lucide-react";

export default function RealTimeOrdersManager({ onOrdersLoaded }) {
  const { user } = useAuth();
  const { latestStatusUpdate, latestNewOrder } = useSocket();

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [simulatingOrderId, setSimulatingOrderId] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [isConsistencyOpen, setIsConsistencyOpen] = useState(false);

  const onOrdersLoadedRef = useRef(onOrdersLoaded);
  useEffect(() => {
    onOrdersLoadedRef.current = onOrdersLoaded;
  });

  const handleOrderUpdated = useCallback((update) => {
    if (update?.status) {
      const newStatus = update.status;
      const targetOrderId = Number(update.orderId);
      const paymentStatus =
        update.payment_status || (newStatus === "cancelled" ? "refunded" : undefined);

      setSelectedOrder((prev) => {
        if (!prev) return prev;
        if (targetOrderId && prev.id !== targetOrderId) return prev;
        return {
          ...prev,
          status: newStatus,
          ...(paymentStatus ? { payment_status: paymentStatus } : {}),
          ...(update.refundDetails ? { refund_details: update.refundDetails } : {}),
        };
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === targetOrderId || (!targetOrderId && o.id === update.id)
            ? {
                ...o,
                status: newStatus,
                ...(paymentStatus ? { payment_status: paymentStatus } : {}),
                ...(update.refundDetails ? { refund_details: update.refundDetails } : {}),
              }
            : o
        )
      );
    }
  }, []);

  // Load orders from API
  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = user?.role === "admin" ? await getAllOrders() : await getMyOrders();
      if (res.success) {
        const orderList = Array.isArray(res.data) ? res.data : Array.isArray(res.orders) ? res.orders : [];
        setOrders(orderList);
        if (onOrdersLoadedRef.current) onOrdersLoadedRef.current(orderList);
        // Auto-select first order if none selected
        if (!selectedOrder && orderList.length > 0) {
          setSelectedOrder(orderList[0]);
        } else if (selectedOrder) {
          // Keep selected order updated with latest data
          const updated = orderList.find((o) => o.id === selectedOrder.id);
          if (updated) setSelectedOrder(updated);
        }
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  // Sync real-time newly created orders
  useEffect(() => {
    if (latestNewOrder) {
      loadOrders();
    }
  }, [latestNewOrder]);

  // Sync real-time socket updates
  useEffect(() => {
    if (latestStatusUpdate) {
      const newStatus = latestStatusUpdate.status;
      const paymentStatus =
        latestStatusUpdate.order?.payment_status ||
        latestStatusUpdate.payment_status ||
        (newStatus === "cancelled" ? "refunded" : undefined);

      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === Number(latestStatusUpdate.orderId)
            ? {
                ...o,
                status: newStatus,
                ...(paymentStatus ? { payment_status: paymentStatus } : {}),
                updated_at: latestStatusUpdate.timestamp,
              }
            : o
        )
      );

      if (selectedOrder && selectedOrder.id === Number(latestStatusUpdate.orderId)) {
        setSelectedOrder((prev) => ({
          ...prev,
          status: newStatus,
          ...(paymentStatus ? { payment_status: paymentStatus } : {}),
          updated_at: latestStatusUpdate.timestamp,
        }));
      }
    }
  }, [latestStatusUpdate]);

  // Handle direct status change
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedOrder) return;
    setStatusUpdating(true);
    try {
      const res = await updateOrderStatus(selectedOrder.id, newStatus);
      if (res.success) {
        setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
        setOrders((prev) =>
          prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o))
        );
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Automated delivery simulation
  const handleSimulateDelivery = async () => {
    if (!selectedOrder || simulatingOrderId) return;
    setSimulatingOrderId(selectedOrder.id);
    try {
      await simulateOrderFlow(selectedOrder.id, 2500);
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setSimulatingOrderId(null);
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm("Are you sure you want to remove all old orders, shipments, returns, and refunds? Product inventory will be reset to default.")) {
      return;
    }
    setOrdersLoading(true);
    try {
      const res = await clearAllOrderData();
      if (res.success) {
        setOrders([]);
        setSelectedOrder(null);
        if (onOrdersLoadedRef.current) onOrdersLoadedRef.current([]);
      }
    } catch (err) {
      console.error("Failed to clear data:", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Filtered orders list
  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      searchTerm === "" ||
      String(order.id).includes(searchTerm) ||
      (order.user_name && order.user_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (order.user_email && order.user_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (order.shipping_address && order.shipping_address.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" || String(order.status).toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Only active (non-cancelled) orders contribute to Gross Revenue
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");
  const cancelledRevenue = cancelledOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const inProgressCount = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Metrics Quick Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Total Orders</span>
            <Package className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono mt-1.5">{orders.length}</p>
          <p className="text-[11px] text-emerald-400 font-mono mt-0.5">ACID Recorded</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>In Fulfillment</span>
            <Truck className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-300 font-mono mt-1.5">{inProgressCount}</p>
          <p className="text-[11px] text-amber-400/80 font-mono mt-0.5">Active Stream</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Delivered</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-1.5">{deliveredCount}</p>
          <p className="text-[11px] text-emerald-400/80 font-mono mt-0.5">100% Verified</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-extrabold text-cyan-300 font-mono mt-1.5">
            ₹{totalRevenue.toFixed(2)}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
            <span className="text-cyan-400/80">MySQL InnoDB Lock</span>
            {cancelledOrders.length > 0 && (
              <span className="text-rose-400 font-medium" title={`${cancelledOrders.length} order(s) cancelled`}>
                -₹{cancelledRevenue.toFixed(2)} refunded
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Orders Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Orders Explorer Left Panel (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl backdrop-blur-xl flex flex-col h-[640px]">
          {/* Search & Filter Header */}
          <div className="space-y-3 pb-3 border-b border-white/10 mb-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                Platform Orders Feed
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsConsistencyOpen(true)}
                  className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Run automated database consistency check across orders, stock, and refunds"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Audit DB</span>
                </button>
                <button
                  onClick={handleClearAllData}
                  className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Remove all old test orders, shipments, returns, and refunds"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Clear Data</span>
                </button>
                <span className="text-[11px] font-mono text-indigo-400 font-bold">
                  {filteredOrders.length} found
                </span>
              </div>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by order #, user, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Status Pill Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono">
              {["all", "placed", "confirmed", "packed", "shipped", "delivered", "cancelled"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg uppercase font-bold transition cursor-pointer border ${statusFilter === st
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-950 text-slate-400 border-white/5 hover:text-white"
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Scrollable List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">No orders found.</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {searchTerm || statusFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Place an order to start the real-time stream!"}
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer relative overflow-hidden ${isSelected
                        ? "bg-indigo-950/60 border-indigo-500/70 shadow-lg shadow-indigo-500/20"
                        : "bg-slate-950/50 border-white/5 hover:border-white/20 hover:bg-slate-950/80"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">#{order.id}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          User #{order.user_id}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold ${
                          order.status === "cancelled"
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

                    <p className="text-xs font-medium text-slate-300 truncate">
                      {order.user_name || order.user_email || "Customer"}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-2">
                      <span>
                        {order.items?.length || 1} {order.items?.length === 1 ? "item" : "items"}
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

        {/* Real-Time Stepper & Order Control Room (8 cols) */}
        <div className="lg:col-span-8">
          {selectedOrder ? (
            <div className="space-y-6">
              {/* Stepper Card */}
              <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-bold border border-indigo-500/30">
                        ORDER #{selectedOrder.id}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(selectedOrder.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mt-1">
                      Real-Time Lifecycle Tracker
                    </h3>
                  </div>

                  {/* Admin Order Confirmation & Action Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedOrder.status === "placed" && (
                      <button
                        onClick={() => handleUpdateStatus("confirmed")}
                        disabled={statusUpdating}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95 border border-emerald-400/30"
                        title="Confirm this customer order and allocate warehouse inventory"
                      >
                        <CheckCircle className={`w-4 h-4 ${statusUpdating ? "animate-spin" : ""}`} />
                        <span>{statusUpdating ? "Confirming..." : "Confirm Order"}</span>
                      </button>
                    )}

                    {selectedOrder.status === "confirmed" && (
                      <button
                        onClick={() => handleUpdateStatus("packed")}
                        disabled={statusUpdating}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-violet-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95 border border-violet-400/30"
                        title="Mark order as packed and boxed in warehouse"
                      >
                        <Package className={`w-4 h-4 ${statusUpdating ? "animate-spin" : ""}`} />
                        <span>{statusUpdating ? "Updating..." : "Mark as Packed"}</span>
                      </button>
                    )}

                    {selectedOrder.status === "packed" && (
                      <button
                        onClick={() => handleUpdateStatus("shipped")}
                        disabled={statusUpdating}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95 border border-amber-400/30"
                        title="Mark order as shipped with express courier"
                      >
                        <Truck className={`w-4 h-4 ${statusUpdating ? "animate-spin" : ""}`} />
                        <span>{statusUpdating ? "Dispatching..." : "Dispatch Shipment"}</span>
                      </button>
                    )}

                    {selectedOrder.status === "shipped" && (
                      <button
                        onClick={() => handleUpdateStatus("delivered")}
                        disabled={statusUpdating}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95 border border-emerald-400/30"
                        title="Mark order as delivered to customer destination"
                      >
                        <CheckCircle className={`w-4 h-4 ${statusUpdating ? "animate-spin" : ""}`} />
                        <span>{statusUpdating ? "Finalizing..." : "Mark Delivered"}</span>
                      </button>
                    )}

                    {/* Automated Simulation Button */}
                    <button
                      onClick={handleSimulateDelivery}
                      disabled={simulatingOrderId === selectedOrder.id || selectedOrder.status === "delivered"}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Run automated real-time progression through all 5 stages"
                    >
                      <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${simulatingOrderId ? "animate-spin" : ""}`} />
                      <span>{simulatingOrderId === selectedOrder.id ? "Simulating..." : "Auto-Simulate"}</span>
                    </button>
                  </div>
                </div>

                {/* The Visual Stage Stepper with Interactive Controls */}
                <OrderStatusStepper
                  order={selectedOrder}
                  readOnly={false}
                  onOrderUpdated={handleOrderUpdated}
                />
              </div>

              {/* Order Metadata Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono">
                    Shipping Details
                  </span>
                  <p className="text-sm text-white font-medium">
                    {selectedOrder.shipping_address || "Standard Ground Shipping"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Payment Method: <span className="text-indigo-300 font-mono capitalize">{selectedOrder.payment_method || "Credit Card"}</span>
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono">
                    Order Financials
                  </span>
                  <p className="text-2xl font-black text-emerald-400 font-mono">
                    ₹{Number(selectedOrder.total_amount || 0).toFixed(2)}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Protected with MySQL ACID Row-Level Locks</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[500px] flex flex-col items-center justify-center p-12 bg-slate-900/60 border border-white/10 rounded-3xl text-center">
              <Package className="w-16 h-16 text-slate-700 mb-3" />
              <p className="text-base text-slate-300 font-bold">Select an Order from the Feed</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Click any order on the left to track its real-time stage progression or trigger automated delivery simulations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Database Consistency & Integrity Inspector Modal */}
      <DatabaseConsistencyInspector
        isOpen={isConsistencyOpen}
        onClose={() => setIsConsistencyOpen(false)}
      />
    </div>
  );
}

