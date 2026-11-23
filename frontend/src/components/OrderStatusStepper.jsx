import React, { useEffect, useState, useRef } from "react";
import {
  CheckCircle2,
  Package,
  Truck,
  Home,
  Clock,
  Play,
  RotateCw,
  Sparkles,
  Zap,
  Mail,
  ShieldCheck,
  Radio,
  ExternalLink,
  Shield,
  XCircle,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  Ban,
  MapPin,
  Navigation,
  Send,
  Check,
  Copy,
  Plus,
  Split,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import {
  updateOrderStatus,
  simulateOrderFlow,
  cancelOrder,
  createShipment,
  addShipmentTrackingEvent,
  getOrderTracking,
  requestOrderReturn,
  reviewReturnRequest,
  requestOrderCancellation,
  reviewCancellationRequest,
  checkOrderEligibility,
} from "../services/orderService";
import { getImageUrl, handleImageError } from "../utils/imageUrl";

const STAGES = [
  {
    key: "placed",
    label: "Placed",
    description: "Order placed & payment verified",
    icon: Package,
    color: "from-blue-500 to-indigo-600",
    badgeBg: "bg-blue-500/20 border-blue-500/30 text-blue-300",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    description: "Inventory allocated by warehouse",
    icon: ShieldCheck,
    color: "from-indigo-500 to-violet-600",
    badgeBg: "bg-indigo-500/20 border-indigo-500/30 text-indigo-300",
  },
  {
    key: "packed",
    label: "Packed",
    description: "Quality-checked & boxed",
    icon: Package,
    color: "from-violet-500 to-purple-600",
    badgeBg: "bg-violet-500/20 border-violet-500/30 text-violet-300",
  },
  {
    key: "shipped",
    label: "Shipped",
    description: "In transit with express courier",
    icon: Truck,
    color: "from-amber-500 to-orange-600",
    badgeBg: "bg-amber-500/20 border-amber-500/30 text-amber-300",
  },
  {
    key: "delivered",
    label: "Delivered",
    description: "Delivered safely to destination",
    icon: Home,
    color: "from-emerald-500 to-teal-600",
    badgeBg: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300",
  },
];

export default function OrderStatusStepper({
  order,
  currentStatus: propStatus,
  initialStatus,
  orderId: propOrderId,
  onOrderUpdated,
  onViewEmailLogs,
  compact = false,
  readOnly,
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isReadOnly = readOnly !== undefined ? readOnly : !isAdmin;

  const {
    latestStatusUpdate,
    latestShipmentUpdate,
    latestReturnUpdate,
    latestCancellationUpdate,
    latestRefundUpdate,
    joinOrderRoom,
    leaveOrderRoom,
    isConnected,
  } = useSocket();
  const [currentStatus, setCurrentStatus] = useState(
    order?.status || propStatus || initialStatus || "placed"
  );
  const [shipments, setShipments] = useState(order?.shipments || []);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchCarrier, setDispatchCarrier] = useState("BlueDart Express");
  const [dispatchTrackingNumber, setDispatchTrackingNumber] = useState("");
  const [dispatchShippingTier, setDispatchShippingTier] = useState("priority");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [selectedItemsToFulfill, setSelectedItemsToFulfill] = useState({});
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState(null);

  // Return workflow state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("defective");
  const [returnNotes, setReturnNotes] = useState("");
  const [selectedReturnItems, setSelectedReturnItems] = useState({});
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnFeedback, setReturnFeedback] = useState(null);

  // Admin review modals state
  const [showReviewReturnModal, setShowReviewReturnModal] = useState(false);
  const [reviewReturnAction, setReviewReturnAction] = useState("approve");
  const [adminReturnNotes, setAdminReturnNotes] = useState("");
  const [restockInventory, setRestockInventory] = useState(true);
  const [isReviewingReturn, setIsReviewingReturn] = useState(false);

  const [showReviewCancelModal, setShowReviewCancelModal] = useState(false);
  const [reviewCancelAction, setReviewCancelAction] = useState("approve");
  const [adminCancelNotes, setAdminCancelNotes] = useState("");
  const [isReviewingCancel, setIsReviewingCancel] = useState(false);
  const [cancelAsRequest, setCancelAsRequest] = useState(false);

  // Quick milestone adding
  const [addingCheckpointShipmentId, setAddingCheckpointShipmentId] = useState(null);
  const [newCheckpointStatus, setNewCheckpointStatus] = useState("in_transit");
  const [newCheckpointLocation, setNewCheckpointLocation] = useState("");
  const [newCheckpointDesc, setNewCheckpointDesc] = useState("");
  const [isSubmittingCheckpoint, setIsSubmittingCheckpoint] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(null);

  const [statusHistory, setStatusHistory] = useState([
    {
      status: order?.status || propStatus || initialStatus || "placed",
      timestamp: order?.created_at || new Date().toISOString(),
      notes: "Order placed & recorded in MySQL",
    },
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("Customer requested cancellation");
  const [cancelFeedback, setCancelFeedback] = useState(null);
  const [recentFlash, setRecentFlash] = useState(false);

  const orderId = order?.id || order?.order_id || propOrderId;
  const isCancelled = String(currentStatus).toLowerCase() === "cancelled";
  const isPartiallyShipped = String(currentStatus).toLowerCase() === "partially_shipped";
  const isDelivered = String(currentStatus).toLowerCase() === "delivered";
  const isReturnRequested = String(currentStatus).toLowerCase() === "return_requested";
  const isReturned = ["returned", "return_approved"].includes(String(currentStatus).toLowerCase());
  const isReturnRejected = String(currentStatus).toLowerCase() === "return_rejected";
  const isCancelRequested = String(currentStatus).toLowerCase() === "cancel_requested";
  const isCancelRejected = String(currentStatus).toLowerCase() === "cancel_rejected";

  const isEligibleForCancel = ["placed", "confirmed", "packed"].includes(String(currentStatus).toLowerCase()) && !isCancelRequested;
  const isEligibleForReturn = isDelivered && !isReturnRequested && !isReturned;

  const onOrderUpdatedRef = useRef(onOrderUpdated);
  useEffect(() => {
    onOrderUpdatedRef.current = onOrderUpdated;
  });

  const lastProcessedSocketRef = useRef(null);

  // Subscribe to order-specific socket room
  useEffect(() => {
    if (orderId) {
      joinOrderRoom(orderId);
      return () => leaveOrderRoom(orderId);
    }
  }, [orderId, joinOrderRoom, leaveOrderRoom]);

  // Handle incoming real-time socket events
  useEffect(() => {
    if (
      latestStatusUpdate &&
      Number(latestStatusUpdate.orderId) === Number(orderId) &&
      lastProcessedSocketRef.current !== latestStatusUpdate
    ) {
      lastProcessedSocketRef.current = latestStatusUpdate;

      setCurrentStatus((prev) =>
        prev === latestStatusUpdate.status ? prev : latestStatusUpdate.status
      );

      setStatusHistory((prev) => [
        {
          status: latestStatusUpdate.status,
          timestamp: latestStatusUpdate.timestamp || new Date().toISOString(),
          notes: latestStatusUpdate.trackingNotes || `Status advanced to ${latestStatusUpdate.status}`,
        },
        ...prev,
      ]);

      // Flash animation on change
      setRecentFlash(true);
      const timer = setTimeout(() => setRecentFlash(false), 2000);

      if (onOrderUpdatedRef.current) {
        onOrderUpdatedRef.current(latestStatusUpdate);
      }
      return () => clearTimeout(timer);
    }
  }, [latestStatusUpdate, orderId]);

  // Sync shipments with order prop
  useEffect(() => {
    if (order?.shipments) {
      setShipments(order.shipments);
    }
  }, [order?.shipments]);

  // Handle incoming shipment updates from WebSockets
  useEffect(() => {
    if (
      latestShipmentUpdate &&
      Number(latestShipmentUpdate.orderId) === Number(orderId)
    ) {
      if (latestShipmentUpdate.shipment) {
        setShipments((prev) => {
          const exists = prev.some((s) => s.id === latestShipmentUpdate.shipment.id);
          if (exists) {
            return prev.map((s) =>
              s.id === latestShipmentUpdate.shipment.id ? latestShipmentUpdate.shipment : s
            );
          }
          return [...prev, latestShipmentUpdate.shipment];
        });
      }
      if (latestShipmentUpdate.order?.status) {
        setCurrentStatus(latestShipmentUpdate.order.status);
      }
      if (onOrderUpdatedRef.current && latestShipmentUpdate.order) {
        onOrderUpdatedRef.current(latestShipmentUpdate.order);
      }
    }
  }, [latestShipmentUpdate, orderId]);

  // Handle incoming return update from WebSockets
  useEffect(() => {
    if (
      latestReturnUpdate &&
      Number(latestReturnUpdate.orderId) === Number(orderId)
    ) {
      if (latestReturnUpdate.order?.status) {
        setCurrentStatus(latestReturnUpdate.order.status);
      } else if (latestReturnUpdate.status) {
        if (latestReturnUpdate.status === "approved") setCurrentStatus("returned");
        else if (latestReturnUpdate.status === "rejected") setCurrentStatus("return_rejected");
        else if (latestReturnUpdate.status === "pending") setCurrentStatus("return_requested");
      }
      setRecentFlash(true);
      const timer = setTimeout(() => setRecentFlash(false), 2000);
      if (onOrderUpdatedRef.current) {
        onOrderUpdatedRef.current(latestReturnUpdate.order || { id: orderId, status: currentStatus });
      }
      return () => clearTimeout(timer);
    }
  }, [latestReturnUpdate, orderId, currentStatus]);

  // Handle incoming cancellation update from WebSockets
  useEffect(() => {
    if (
      latestCancellationUpdate &&
      Number(latestCancellationUpdate.orderId) === Number(orderId)
    ) {
      if (latestCancellationUpdate.order?.status) {
        setCurrentStatus(latestCancellationUpdate.order.status);
      } else if (latestCancellationUpdate.status) {
        if (latestCancellationUpdate.status === "approved") setCurrentStatus("cancelled");
        else if (latestCancellationUpdate.status === "pending") setCurrentStatus("cancel_requested");
      }
      setRecentFlash(true);
      const timer = setTimeout(() => setRecentFlash(false), 2000);
      if (onOrderUpdatedRef.current) {
        onOrderUpdatedRef.current(latestCancellationUpdate.order || { id: orderId, status: currentStatus });
      }
      return () => clearTimeout(timer);
    }
  }, [latestCancellationUpdate, orderId, currentStatus]);

  // Handle incoming refund update from WebSockets
  useEffect(() => {
    if (
      latestRefundUpdate &&
      Number(latestRefundUpdate.orderId) === Number(orderId)
    ) {
      setRecentFlash(true);
      const timer = setTimeout(() => setRecentFlash(false), 2000);
      if (onOrderUpdatedRef.current) {
        onOrderUpdatedRef.current(latestRefundUpdate.order || { id: orderId, payment_status: "refunded" });
      }
      return () => clearTimeout(timer);
    }
  }, [latestRefundUpdate, orderId]);


  // Sync with prop if changed
  useEffect(() => {
    const nextStatus = order?.status || propStatus;
    if (nextStatus) {
      setCurrentStatus((prev) => (prev !== nextStatus ? nextStatus : prev));
    }
  }, [order?.status, propStatus]);

  const currentIndex = STAGES.findIndex(
    (s) => s.key.toLowerCase() === (currentStatus || "placed").toLowerCase()
  );
  const activeIndex = isPartiallyShipped ? 3 : currentIndex >= 0 ? currentIndex : 0;
  const progressPercentage = isCancelled
    ? 0
    : isPartiallyShipped
    ? 65
    : Math.round((activeIndex / (STAGES.length - 1)) * 100);

  const totalOrderedQty = order?.fulfillment?.totalOrderedQty ?? (order?.items?.reduce((acc, it) => acc + Number(it.quantity || 0), 0) || 0);
  const totalFulfilledQty = order?.fulfillment?.totalFulfilledQty ?? (order?.items?.reduce((acc, it) => acc + Number(it.fulfilled_quantity || it.fulfilledQuantity || 0), 0) || 0);
  const remainingQty = order?.fulfillment?.remainingQty ?? Math.max(0, totalOrderedQty - totalFulfilledQty);
  const fulfillmentPct = totalOrderedQty > 0 ? Math.round((totalFulfilledQty / totalOrderedQty) * 100) : 0;

  const handleOpenDispatchModal = () => {
    const initialQty = {};
    if (order?.items) {
      order.items.forEach((item) => {
        const itemId = item.id || item.order_item_id || item.product_id;
        const fulfilled = Number(item.fulfilled_quantity || item.fulfilledQuantity || 0);
        const remaining = Math.max(0, Number(item.quantity || 0) - fulfilled);
        if (itemId) {
          initialQty[itemId] = remaining;
        }
      });
    }
    setSelectedItemsToFulfill(initialQty);
    setDispatchTrackingNumber(`TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setDispatchFeedback(null);
    setShowDispatchModal(true);
  };

  const handleCreateShipmentSubmit = async (e) => {
    e.preventDefault();
    if (!orderId || isDispatching) return;

    const itemsPayload = Object.entries(selectedItemsToFulfill)
      .filter(([id, qty]) => id && id !== "undefined" && id !== "null" && Number(qty) > 0)
      .map(([orderItemId, qty]) => ({
        order_item_id: Number(orderItemId),
        orderItemId: Number(orderItemId),
        id: Number(orderItemId),
        quantity: Number(qty),
      }));

    if (itemsPayload.length === 0) {
      setDispatchFeedback({
        success: false,
        message: "Please specify at least 1 item with quantity > 0 to fulfill.",
      });
      return;
    }

    setIsDispatching(true);
    setDispatchFeedback(null);
    try {
      const res = await createShipment(orderId, {
        carrier: dispatchCarrier,
        trackingNumber: dispatchTrackingNumber,
        shippingTier: dispatchShippingTier,
        notes: dispatchNotes,
        items: itemsPayload,
      });

      if (res?.success) {
        setDispatchFeedback({
          success: true,
          message: res.message || "Shipment dispatched successfully!",
        });
        if (res.data?.shipment) {
          setShipments((prev) => {
            const exists = prev.some((s) => s.id === res.data.shipment.id);
            return exists
              ? prev.map((s) => (s.id === res.data.shipment.id ? res.data.shipment : s))
              : [...prev, res.data.shipment];
          });
        }
        if (res.data?.order?.status) {
          setCurrentStatus(res.data.order.status);
        }
        if (onOrderUpdatedRef.current && res.data?.order) {
          onOrderUpdatedRef.current(res.data.order);
        }
        setTimeout(() => {
          setShowDispatchModal(false);
          setDispatchFeedback(null);
        }, 1200);
      } else {
        setDispatchFeedback({
          success: false,
          message: res?.message || "Failed to create shipment.",
        });
      }
    } catch (err) {
      setDispatchFeedback({
        success: false,
        message: err?.response?.data?.message || err.message || "Error creating shipment.",
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleAddCheckpoint = async (shipmentId) => {
    if (!orderId || !shipmentId || isSubmittingCheckpoint) return;
    setIsSubmittingCheckpoint(true);
    try {
      const res = await addShipmentTrackingEvent(orderId, shipmentId, {
        status: newCheckpointStatus,
        location: newCheckpointLocation || "Logistics Hub",
        description:
          newCheckpointDesc || `Shipment checkpoint advanced to ${newCheckpointStatus}`,
      });

      if (res?.success) {
        if (res.data?.event) {
          setShipments((prev) =>
            prev.map((s) => {
              if (s.id === shipmentId) {
                const currentEvents = s.trackingEvents || [];
                return {
                  ...s,
                  status: res.data.event.status,
                  trackingEvents: [...currentEvents, res.data.event],
                };
              }
              return s;
            })
          );
        }
        if (res.data?.order?.status) {
          setCurrentStatus(res.data.order.status);
        }
        if (onOrderUpdatedRef.current && res.data?.order) {
          onOrderUpdatedRef.current(res.data.order);
        }
        setAddingCheckpointShipmentId(null);
        setNewCheckpointLocation("");
        setNewCheckpointDesc("");
      }
    } catch (err) {
      console.error("Error adding tracking checkpoint:", err);
    } finally {
      setIsSubmittingCheckpoint(false);
    }
  };

  const handleCopyTracking = (trk) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(trk);
      setCopiedTracking(trk);
      setTimeout(() => setCopiedTracking(null), 2000);
    }
  };

  const handleManualStatusChange = async (targetStatus) => {
    if (isReadOnly || !orderId || isUpdating || isCancelled) return;
    setIsUpdating(true);
    try {
      const res = await updateOrderStatus(orderId, targetStatus, `Manual stage trigger: ${targetStatus.toUpperCase()}`);
      if (res?.success) {
        setCurrentStatus(targetStatus);
        if (onOrderUpdated) {
          onOrderUpdated({ orderId, status: targetStatus, timestamp: new Date().toISOString() });
        }
      }
    } catch (err) {
      console.error("Status update error:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartSimulation = async () => {
    if (isReadOnly || !orderId || isSimulating || isCancelled) return;
    setIsSimulating(true);
    try {
      await simulateOrderFlow(orderId, 2500);
      setTimeout(() => {
        setIsSimulating(false);
      }, 13000);
    } catch (err) {
      console.error("Simulation trigger error:", err);
      setIsSimulating(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderId || isCancelling) return;
    setIsCancelling(true);
    setCancelFeedback(null);
    try {
      if (cancelAsRequest && !isAdmin) {
        const res = await requestOrderCancellation(orderId, cancelReason, "Cancellation requested via customer portal");
        if (res?.success) {
          setCurrentStatus("cancel_requested");
          setCancelFeedback({
            success: true,
            message: res.message || "Cancellation request submitted for admin review.",
          });
          setShowCancelDialog(false);
          if (onOrderUpdatedRef.current) {
            onOrderUpdatedRef.current({ orderId, status: "cancel_requested" });
          }
        } else {
          setCancelFeedback({
            success: false,
            message: res?.message || "Failed to request cancellation.",
          });
        }
      } else {
        const res = await cancelOrder(orderId, cancelReason, isAdmin);
        if (res?.success) {
          setCurrentStatus("cancelled");
          setCancelFeedback({
            success: true,
            message: res.message || "Order cancelled successfully.",
            refundDetails: res.refundDetails,
            inventoryRestored: res.inventoryRestored,
          });
          setShowCancelDialog(false);
          if (onOrderUpdatedRef.current) {
            onOrderUpdatedRef.current({
              orderId,
              status: "cancelled",
              payment_status: res.data?.payment_status || "refunded",
              refundDetails: res.refundDetails,
              inventoryRestored: res.inventoryRestored,
              order: res.data,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          setCancelFeedback({
            success: false,
            message: res.message || "Failed to cancel order.",
          });
        }
      }
    } catch (err) {
      setCancelFeedback({
        success: false,
        message: err?.response?.data?.message || err.message || "Error processing cancellation.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenReturnModal = () => {
    const initialQty = {};
    if (order?.items) {
      order.items.forEach((item) => {
        const itemId = item.id || item.order_item_id || item.product_id;
        if (itemId) {
          initialQty[itemId] = Number(item.quantity) || 1;
        }
      });
    }
    setSelectedReturnItems(initialQty);
    setReturnReason("defective");
    setReturnNotes("");
    setReturnFeedback(null);
    setShowReturnModal(true);
  };

  const handleSubmitReturnRequest = async (e) => {
    e.preventDefault();
    if (!orderId || isSubmittingReturn) return;

    const itemsPayload = Object.entries(selectedReturnItems)
      .filter(([id, qty]) => id && Number(qty) > 0)
      .map(([itemId, qty]) => ({
        order_item_id: Number(itemId),
        quantity: Number(qty),
      }));

    if (itemsPayload.length === 0) {
      setReturnFeedback({
        success: false,
        message: "Please select at least 1 item to return with quantity > 0.",
      });
      return;
    }

    setIsSubmittingReturn(true);
    setReturnFeedback(null);
    try {
      const res = await requestOrderReturn(orderId, {
        reason: returnReason,
        customerNotes: returnNotes,
        items: itemsPayload,
      });

      if (res?.success) {
        setCurrentStatus("return_requested");
        setReturnFeedback({
          success: true,
          message: res.message || "Return request submitted successfully. Awaiting admin review.",
        });
        if (onOrderUpdatedRef.current) {
          onOrderUpdatedRef.current(res.data?.order || { id: orderId, status: "return_requested" });
        }
        setTimeout(() => {
          setShowReturnModal(false);
          setReturnFeedback(null);
        }, 1500);
      } else {
        setReturnFeedback({
          success: false,
          message: res?.message || "Failed to submit return request.",
        });
      }
    } catch (err) {
      setReturnFeedback({
        success: false,
        message: err?.response?.data?.message || err.message || "Error submitting return request.",
      });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleReviewReturn = async (overrideAction = null) => {
    if (!orderId || isReviewingReturn) return;
    const action = overrideAction || reviewReturnAction;
    setIsReviewingReturn(true);
    try {
      const res = await reviewReturnRequest(orderId, {
        action,
        adminNotes: adminReturnNotes,
        restockInventory,
      });

      if (res?.success) {
        const nextStatus = action === "approve" ? "returned" : "return_rejected";
        setCurrentStatus(nextStatus);
        setShowReviewReturnModal(false);
        if (onOrderUpdatedRef.current) {
          onOrderUpdatedRef.current(res.data?.order || { id: orderId, status: nextStatus });
        }
      } else {
        alert(res?.message || "Failed to review return request.");
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Error reviewing return request.");
    } finally {
      setIsReviewingReturn(false);
    }
  };

  const handleReviewCancellation = async (overrideAction = null) => {
    if (!orderId || isReviewingCancel) return;
    const action = overrideAction || reviewCancelAction;
    setIsReviewingCancel(true);
    try {
      const res = await reviewCancellationRequest(orderId, {
        action,
        adminNotes: adminCancelNotes,
      });

      if (res?.success) {
        const nextStatus = action === "approve" ? "cancelled" : (res.data?.order?.status || "confirmed");
        setCurrentStatus(nextStatus);
        setShowReviewCancelModal(false);
        if (onOrderUpdatedRef.current) {
          onOrderUpdatedRef.current(res.data?.order || { id: orderId, status: nextStatus });
        }
      } else {
        alert(res?.message || "Failed to review cancellation request.");
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Error reviewing cancellation request.");
    } finally {
      setIsReviewingCancel(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-500 overflow-hidden relative ${
        isCancelled
          ? "border-rose-500/40 bg-slate-900/95 shadow-xl shadow-rose-500/10"
          : recentFlash
          ? "border-emerald-500/60 bg-slate-900/95 shadow-xl shadow-emerald-500/20"
          : "border-white/10 bg-slate-900/90 shadow-2xl shadow-black/40"
      }`}
    >
      {/* Background Subtle Gradient Glow */}
      <div className={`absolute top-0 right-1/4 w-80 h-32 rounded-full blur-3xl pointer-events-none ${
        isCancelled ? "bg-rose-500/10" : "bg-indigo-500/10"
      }`} />

      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${
            isCancelled
              ? "bg-gradient-to-tr from-rose-600 to-red-600 shadow-rose-500/30"
              : "bg-gradient-to-tr from-indigo-600 to-violet-600 shadow-indigo-500/30"
          }`}>
            {isCancelled ? (
              <Ban className="w-5 h-5 text-rose-200" />
            ) : (
              <Radio className="w-5 h-5 text-indigo-200 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Order <span className="font-mono text-indigo-400">#{orderId}</span> Status
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  isCancelled
                    ? "bg-rose-500/20 border border-rose-500/30 text-rose-300"
                    : isCancelRequested
                    ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                    : isReturnRequested
                    ? "bg-purple-500/20 border border-purple-500/40 text-purple-300"
                    : isReturned
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                    : isReturnRejected
                    ? "bg-rose-500/20 border border-rose-500/30 text-rose-300"
                    : isPartiallyShipped
                    ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                    : STAGES[activeIndex]?.badgeBg || "bg-indigo-500/20 text-indigo-300"
                }`}
              >
                {!isCancelled && !isReturned && <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />}
                {isCancelRequested
                  ? "Cancel Requested"
                  : isReturnRequested
                  ? "Return Requested"
                  : isReturned
                  ? "Returned & Refunded"
                  : isReturnRejected
                  ? "Return Rejected"
                  : isPartiallyShipped
                  ? "Partially Shipped"
                  : currentStatus}
              </span>

              {/* Payment Verification Status Badge */}
              <span
                className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  isCancelled || isReturned || (order?.payment_status || order?.paymentStatus) === "refunded"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                    : (order?.payment_status || order?.paymentStatus) === "paid" ||
                      (order?.payment_status || order?.paymentStatus) === "succeeded"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : (order?.payment_status || order?.paymentStatus) === "processing"
                    ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}
              >
                Payment: {isCancelled || isReturned ? "refunded" : (order?.payment_status || order?.paymentStatus || "pending")}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 shadow-sm shadow-emerald-400" : "bg-rose-400"
                }`}
              />
              {isConnected ? "WebSocket Live Sync Active" : "Reconnecting to Live Stream..."}
            </p>
          </div>
        </div>

        {/* Action Controls & Cancellation / Return Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Admin Review Pending Cancellation Button */}
          {isCancelRequested && isAdmin && (
            <button
              onClick={() => setShowReviewCancelModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 active:scale-95 border border-amber-400/40"
              title="Review pending cancellation request from customer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review Cancel Request</span>
            </button>
          )}

          {/* Admin Review Pending Return Button */}
          {isReturnRequested && isAdmin && (
            <button
              onClick={() => setShowReviewReturnModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 active:scale-95 border border-purple-400/40"
              title="Review pending return & refund request from customer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Review Return Request</span>
            </button>
          )}

          {/* Customer Return Request Button (Eligible: Delivered & within 30 days) */}
          {isEligibleForReturn && (
            <button
              onClick={handleOpenReturnModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-white border border-purple-500/40 active:scale-95 shadow-purple-500/10"
              title="Submit a return & refund request for this delivered order"
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
              <span>Request Return</span>
            </button>
          )}

          {/* Cancel & Refund Button (Visible for all eligible orders: placed, confirmed, packed) */}
          {isEligibleForCancel && (
            <button
              onClick={() => setShowCancelDialog(true)}
              disabled={isCancelling}
              className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white border border-rose-500/40 active:scale-95 shadow-rose-500/10"
              title="Cancel this order, reverse inventory stock, and issue refund"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>Cancel Order</span>
            </button>
          )}

          {!isReadOnly ? (
            <>
              {currentStatus === "placed" && (
                <button
                  onClick={() => handleManualStatusChange("confirmed")}
                  disabled={isUpdating}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/25 active:scale-95 border border-emerald-400/30"
                  title="Confirm customer order & allocate inventory in MySQL"
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
                  <span>{isUpdating ? "Confirming..." : "Confirm Order"}</span>
                </button>
              )}

              {/* Dispatch Shipment Button (Supports Partial and Full Fulfillment) */}
              {!isCancelled && remainingQty > 0 && (
                <button
                  onClick={handleOpenDispatchModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-95 border border-blue-400/30"
                  title="Dispatch shipment (full or partial fulfillment) with carrier & tracking"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>
                    Dispatch Shipment
                    {totalOrderedQty > 0 && remainingQty < totalOrderedQty ? ` (${remainingQty} left)` : ""}
                  </span>
                </button>
              )}

              {!isCancelled && (
                <button
                  onClick={handleStartSimulation}
                  disabled={isSimulating || activeIndex === STAGES.length - 1}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg ${
                    isSimulating
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                      : activeIndex === STAGES.length - 1
                      ? "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
                      : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/25 active:scale-95"
                  }`}
                  title="Automatically run Placed -> Confirmed -> Packed -> Shipped -> Delivered with real-time websocket broadcasts and background emails"
                >
                  {isSimulating ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      Simulating Live Stream...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Simulate Delivery Flow
                    </>
                  )}
                </button>
              )}

              {onViewEmailLogs && (
                <button
                  onClick={onViewEmailLogs}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  title="Inspect Background Email Worker Queue"
                >
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Email Queue</span>
                </button>
              )}
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Customer Tracking
            </span>
          )}
        </div>
      </div>

      {/* Cancel Feedback Alert if present */}
      {cancelFeedback && (
        <div
          className={`p-3.5 mx-5 mt-4 rounded-xl border text-xs flex items-center justify-between ${
            cancelFeedback.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{cancelFeedback.message}</span>
          </div>
          <button
            onClick={() => setCancelFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stepper Visualizer or Cancelled View */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* Banner for Pending Cancellation Request */}
        {isCancelRequested && (
          <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-3 shadow-lg shadow-amber-500/5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Cancellation Request Under Review
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      PENDING ADMIN
                    </span>
                  </h4>
                  <p className="text-xs text-amber-200/80">
                    A request to cancel Order #{orderId} has been submitted. Fulfillment is temporarily on hold pending review.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewCancellation("approve")}
                    disabled={isReviewingCancel}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Approve & Refund</span>
                  </button>
                  <button
                    onClick={() => handleReviewCancellation("reject")}
                    disabled={isReviewingCancel}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Banner for Pending Return Request (RMA) */}
        {isReturnRequested && (
          <div className="p-5 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-3 shadow-lg shadow-purple-500/5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <RotateCcw className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Return Request (RMA) Under Review
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      INSPECTION QUEUE
                    </span>
                  </h4>
                  <p className="text-xs text-purple-200/80">
                    Customer has submitted a return request for delivered items. RMA validation and inspection in progress.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReviewReturnModal(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Review Return</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Banner for Return Request Rejected */}
        {isReturnRejected && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>
                Return request was reviewed and <strong>declined</strong> by customer support. Order remains delivered.
              </span>
            </div>
          </div>
        )}

        {isCancelled ? (
          /* Cancelled & Refunded Banner View */
          <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-500/30 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Ban className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="text-base font-bold text-white">
                    Order Cancelled & Payment Refunded
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    REFUND COMPLETED
                  </span>
                </div>
                <p className="text-xs text-rose-200/80 leading-relaxed">
                  This order was cancelled. Reserved quantities for all items have been atomically restored to the MySQL <code className="bg-slate-950 px-1 py-0.5 rounded text-rose-300 font-mono">products</code> inventory table, and any charged amount has been refunded.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Stripe Refund Settlement</span>
                <p className="text-xs font-bold text-emerald-400 font-mono">
                  ₹{Number(order?.refund_amount || order?.refundInfo?.totalRefunded || order?.total_amount || 0).toFixed(2)} Refunded
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono truncate">
                  <span className="truncate text-indigo-300">
                    {order?.stripe_refund_id || order?.refundInfo?.stripeRefundId || "re_test_synced"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyTracking(order?.stripe_refund_id || order?.refundInfo?.stripeRefundId || "re_test_synced")}
                    className="text-slate-400 hover:text-white flex-shrink-0"
                    title="Copy Stripe Refund ID"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Inventory Stock</span>
                <p className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Restored to Database
                </p>
                <p className="text-[10px] text-slate-500 font-mono">ACID Rollback Applied</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Cancellation Reason</span>
                <p className="text-xs font-medium text-slate-300 truncate">
                  {order?.refund_reason || cancelReason || "Customer requested cancellation"}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">Audit Log Recorded</p>
              </div>
            </div>
          </div>
        ) : isReturned ? (
          /* Returned & Refunded Banner View */
          <div className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="text-base font-bold text-white">
                    Order Returned & Refund Completed
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    RETURN ACCEPTED
                  </span>
                </div>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Items have been returned, verified by warehouse inspection, and restocked into the MySQL database. Refund has been credited.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Stripe Refund Settlement</span>
                <p className="text-xs font-bold text-emerald-400 font-mono">
                  ₹{Number(order?.refund_amount || order?.refundInfo?.totalRefunded || order?.total_amount || 0).toFixed(2)} Refunded
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono truncate">
                  <span className="truncate text-indigo-300">
                    {order?.stripe_refund_id || order?.refundInfo?.stripeRefundId || "re_test_synced"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyTracking(order?.stripe_refund_id || order?.refundInfo?.stripeRefundId || "re_test_synced")}
                    className="text-slate-400 hover:text-white flex-shrink-0"
                    title="Copy Stripe Refund ID"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Inventory Restock</span>
                <p className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Restocked to Catalog
                </p>
                <p className="text-[10px] text-slate-500 font-mono">Products Table Updated</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Resolution</span>
                <p className="text-xs font-medium text-slate-300 truncate">
                  Approved & Closed
                </p>
                <p className="text-[10px] text-slate-500 font-mono">RMA Closed</p>
              </div>
            </div>
          </div>
        ) : (
          /* Normal 5-Stage Stepper */
          <>
            <div className="relative">
              {/* Background Track Line */}
              <div className="absolute top-5 left-6 right-6 h-1.5 bg-slate-800 rounded-full z-0" />

              {/* Active Animated Track Line */}
              <div
                className="absolute top-5 left-6 h-1.5 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-400 rounded-full transition-all duration-700 z-0"
                style={{ width: `calc((100% - 3rem) * ${progressPercentage / 100})` }}
              />

              {/* Stepper Nodes */}
              <div className="grid grid-cols-5 relative z-10">
                {STAGES.map((stage, idx) => {
                  const isCompleted = idx < activeIndex;
                  const isCurrent = idx === activeIndex;
                  const Icon = stage.icon;

                  return (
                    <div
                      key={stage.key}
                      className={`flex flex-col items-center text-center select-none ${
                        !isReadOnly ? "cursor-pointer group" : "cursor-default"
                      }`}
                      onClick={() => {
                        if (!isReadOnly) handleManualStatusChange(stage.key);
                      }}
                      title={
                        !isReadOnly
                          ? `Click to transition status to: ${stage.label}`
                          : `Status: ${stage.label} (${stage.description})`
                      }
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-md ${
                          isCompleted
                            ? "bg-emerald-500 text-slate-950 font-bold shadow-emerald-500/25 scale-100 ring-2 ring-emerald-400/30"
                            : isCurrent
                            ? `bg-gradient-to-tr ${stage.color} text-white ring-4 ring-indigo-500/30 shadow-indigo-500/40 scale-110 animate-pulse`
                            : "bg-slate-800/90 text-slate-500 border border-white/10 group-hover:border-indigo-500/40 group-hover:text-slate-300"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>

                      <div className="mt-3 space-y-0.5 max-w-[90px] sm:max-w-none">
                        <p
                          className={`text-xs font-bold transition ${
                            isCompleted
                              ? "text-emerald-400"
                              : isCurrent
                              ? "text-white"
                              : "text-slate-500 group-hover:text-slate-400"
                          }`}
                        >
                          {stage.label}
                        </p>
                        {!compact && (
                          <p className="text-[10px] text-slate-400 hidden sm:block line-clamp-1">
                            {stage.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current Active Step Highlight Card */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">Active Stage:</span>
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide">
                      {STAGES[activeIndex]?.label}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      (Step {activeIndex + 1} of 5)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {STAGES[activeIndex]?.description}
                  </p>
                </div>
              </div>

              {/* Quick Manual Advance Buttons */}
              {!isReadOnly ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-mono mr-1">Quick Jump:</span>
                  {STAGES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => handleManualStatusChange(s.key)}
                      disabled={isUpdating || isSimulating || currentStatus === s.key}
                      className={`px-2 py-1 rounded-lg text-[10px] font-mono font-medium transition cursor-pointer border ${
                        currentStatus === s.key
                          ? "bg-indigo-500/30 border-indigo-500/50 text-indigo-200 font-bold"
                          : "bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Real-Time Updates via WebSockets</span>
                </div>
              )}
            </div>

            {/* Fulfillment Status & Progress Bar */}
            {totalOrderedQty > 0 && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Split className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      Fulfillment Status:
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                        remainingQty === 0
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : totalFulfilledQty > 0
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-slate-800 text-slate-400 border-white/10"
                      }`}
                    >
                      {remainingQty === 0
                        ? "Fully Fulfilled"
                        : totalFulfilledQty > 0
                        ? "Partially Fulfilled"
                        : "Unfulfilled"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-400">
                      Fulfilled: <strong className="text-emerald-400">{totalFulfilledQty}</strong> / {totalOrderedQty}
                    </span>
                    {remainingQty > 0 && (
                      <span className="text-amber-400 font-semibold">
                        ({remainingQty} remaining)
                      </span>
                    )}
                    <span className="text-indigo-400 font-bold">{fulfillmentPct}%</span>
                  </div>
                </div>

                {/* Fulfillment Progress Bar */}
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${fulfillmentPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Active Packages & Live Carrier Checkpoint Timeline */}
            {shipments && shipments.length > 0 && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Shipments & Tracking Milestones ({shipments.length})
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Live carrier updates synced
                  </span>
                </div>

                <div className="space-y-3">
                  {shipments.map((shipment, sIdx) => {
                    const trackingEvents = shipment.trackingEvents || shipment.tracking_events || [];
                    const isDelivered = shipment.status === "delivered";

                    return (
                      <div
                        key={shipment.id || sIdx}
                        className="rounded-xl border border-white/10 bg-slate-950/70 p-4 space-y-3 transition hover:border-indigo-500/30"
                      >
                        {/* Package Header Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
                              #{sIdx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">
                                  {shipment.carrier || "Courier Express"}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                                    isDelivered
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                      : shipment.status === "out_for_delivery"
                                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                      : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                  }`}
                                >
                                  {shipment.status?.replace(/_/g, " ") || "In Transit"}
                                </span>
                                {shipment.shipping_tier && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-white/5 uppercase">
                                    {shipment.shipping_tier}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                Tracking:{" "}
                                <span className="text-indigo-300 font-bold">
                                  {shipment.tracking_number}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyTracking(shipment.tracking_number)}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                              title="Copy Tracking Number"
                            >
                              {copiedTracking === shipment.tracking_number ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            {/* Add Milestone trigger for Admin */}
                            {!isReadOnly && !isDelivered && (
                              <button
                                onClick={() =>
                                  setAddingCheckpointShipmentId(
                                    addingCheckpointShipmentId === shipment.id ? null : shipment.id
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-[11px] font-medium text-indigo-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                                title="Add Tracking Milestone"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Milestone</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Shipment Items In This Package */}
                        {shipment.items && shipment.items.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap text-[11px] bg-slate-900/60 p-2 rounded-lg border border-white/5">
                            <span className="text-slate-400 font-medium">In this package:</span>
                            {shipment.items.map((it, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/20 text-indigo-200 font-mono"
                              >
                                <strong>{it.name || `Item #${it.order_item_id || it.product_id}`}</strong>
                                <span className="text-indigo-400 font-bold">×{it.quantity}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Admin Add Milestone Inline Form */}
                        {addingCheckpointShipmentId === shipment.id && (
                          <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-2.5 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                                Record Checkpoint for Package #{sIdx + 1}
                              </span>
                              <button
                                onClick={() => setAddingCheckpointShipmentId(null)}
                                className="text-slate-400 hover:text-white text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select
                                value={newCheckpointStatus}
                                onChange={(e) => setNewCheckpointStatus(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              >
                                <option value="picked_up">Picked Up</option>
                                <option value="in_transit">In Transit</option>
                                <option value="out_for_delivery">Out For Delivery</option>
                                <option value="delivered">Delivered</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Location (e.g. Mumbai Hub)"
                                value={newCheckpointLocation}
                                onChange={(e) => setNewCheckpointLocation(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                placeholder="Description / Notes"
                                value={newCheckpointDesc}
                                onChange={(e) => setNewCheckpointDesc(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                onClick={() => setAddingCheckpointShipmentId(null)}
                                className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleAddCheckpoint(shipment.id)}
                                disabled={isSubmittingCheckpoint}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow"
                              >
                                {isSubmittingCheckpoint ? (
                                  <RotateCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>Save Checkpoint</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Milestone Timeline */}
                        {trackingEvents.length > 0 ? (
                          <div className="pt-2 pl-2 border-l-2 border-indigo-500/20 space-y-3 ml-2">
                            {trackingEvents.map((ev, eIdx) => {
                              const isEvDelivered = ev.status === "delivered";
                              return (
                                <div key={ev.id || eIdx} className="relative pl-4 space-y-0.5">
                                  {/* Dot */}
                                  <span
                                    className={`absolute -left-[17px] top-1 w-3 h-3 rounded-full border-2 ${
                                      isEvDelivered
                                        ? "bg-emerald-500 border-slate-950 ring-2 ring-emerald-500/30"
                                        : "bg-indigo-500 border-slate-950"
                                    }`}
                                  />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-[11px] font-bold uppercase tracking-wider ${
                                        isEvDelivered ? "text-emerald-400" : "text-indigo-300"
                                      }`}
                                    >
                                      {ev.status?.replace(/_/g, " ")}
                                    </span>
                                    {ev.location && (
                                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-slate-500" />
                                        {ev.location}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {ev.event_timestamp
                                        ? new Date(ev.event_timestamp).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            month: "short",
                                            day: "numeric",
                                          })
                                        : ""}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-300">{ev.description}</p>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 font-mono italic pl-1">
                            No tracking milestones logged yet. Package in preparation.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Cancellation Confirmation Modal */}
        {showCancelDialog && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Cancel Order #{orderId}?</span>
                </div>
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Cancelling this order will atomically reverse reserved product stock in the database and issue a refund of{" "}
                <strong className="text-emerald-400 font-mono">
                  ₹{Number(order?.total_amount || order?.totalAmount || 0).toFixed(2)}
                </strong>{" "}
                via Stripe test mode.
              </p>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">
                  Reason for Cancellation:
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="Customer requested cancellation">Customer requested cancellation</option>
                  <option value="Accidental duplicate order">Accidental duplicate order</option>
                  <option value="Delivery timeframe too late">Delivery timeframe too late</option>
                  <option value="Found alternative item">Found alternative item</option>
                  <option value="Change of delivery address">Change of delivery address</option>
                </select>
              </div>

              {!isAdmin && (
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cancelAsRequest}
                    onChange={(e) => setCancelAsRequest(e.target.checked)}
                    className="rounded text-rose-500 focus:ring-0 bg-slate-900 border-white/20"
                  />
                  <span className="text-xs text-slate-300">
                    Submit as request for administrator review
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 flex items-center gap-2 transition cursor-pointer"
                >
                  {isCancelling ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isCancelling
                      ? "Processing..."
                      : cancelAsRequest && !isAdmin
                      ? "Submit Cancel Request"
                      : "Confirm Cancellation & Refund"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dispatch Shipment (Partial or Full Fulfillment) Modal */}
        {showDispatchModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Truck className="w-5 h-5" />
                  <span>Dispatch Shipment for Order #{orderId}</span>
                </div>
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {dispatchFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    dispatchFeedback.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{dispatchFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleCreateShipmentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">
                      Carrier:
                    </label>
                    <select
                      value={dispatchCarrier}
                      onChange={(e) => setDispatchCarrier(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="BlueDart Express">BlueDart Express</option>
                      <option value="Delhivery Logistics">Delhivery Logistics</option>
                      <option value="FedEx India">FedEx India</option>
                      <option value="DHL Express">DHL Express</option>
                      <option value="India Post Speed Post">India Post Speed Post</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">
                      Shipping Tier:
                    </label>
                    <select
                      value={dispatchShippingTier}
                      onChange={(e) => setDispatchShippingTier(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="priority">Priority Express</option>
                      <option value="standard">Standard Ground</option>
                      <option value="overnight">Overnight Delivery</option>
                      <option value="same_day">Same Day Delivery</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-slate-400 font-medium">
                      Tracking Number:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDispatchTrackingNumber(
                          `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
                        )
                      }
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono"
                    >
                      Generate New
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={dispatchTrackingNumber}
                    onChange={(e) => setDispatchTrackingNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. TRK-ABC123XYZ"
                  />
                </div>

                {/* Items selection for Partial / Full Fulfillment */}
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1.5">
                    Select Items to Fulfill in This Package:
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {order?.items?.map((item, idx) => {
                      const itemId = item.id || item.order_item_id || item.product_id || idx;
                      const fulfilled = Number(item.fulfilled_quantity || item.fulfilledQuantity || 0);
                      const maxAvailable = Math.max(0, Number(item.quantity) - fulfilled);
                      const currentSelected = selectedItemsToFulfill[itemId] || 0;

                      return (
                        <div
                          key={itemId}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs"
                        >
                          <div className="space-y-0.5 truncate mr-2">
                            <p className="font-semibold text-slate-200 truncate">
                              {item.name || `Item #${item.product_id || itemId}`}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              Ordered: {item.quantity} | Fulfilled: {fulfilled} | Remaining:{" "}
                              <strong className="text-amber-400">{maxAvailable}</strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-slate-400 font-mono">Pack:</span>
                            <input
                              type="number"
                              min="0"
                              max={maxAvailable}
                              value={currentSelected}
                              disabled={maxAvailable === 0}
                              onChange={(e) => {
                                const val = Math.min(
                                  maxAvailable,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                );
                                setSelectedItemsToFulfill((prev) => ({
                                  ...prev,
                                  [itemId]: val,
                                }));
                              }}
                              className="w-16 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Fulfillment Notes (Optional):
                  </label>
                  <input
                    type="text"
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                    placeholder="e.g. Package 1 of 2 sent via Express air courier"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
                    disabled={isDispatching}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDispatching}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition cursor-pointer"
                  >
                    {isDispatching ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isDispatching ? "Dispatching..." : "Confirm & Dispatch Package"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Customer Return Request Modal (RMA) */}
        {showReturnModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-purple-500/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <RotateCcw className="w-5 h-5" />
                  <span>Request Return (RMA) for Order #{orderId}</span>
                </div>
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {returnFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    returnFeedback.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {returnFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{returnFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleSubmitReturnRequest} className="space-y-4">
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Return Reason:
                  </label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="defective">Defective or Damaged Item</option>
                    <option value="wrong_item">Received Wrong Item</option>
                    <option value="size_fit">Size or Fit Issue</option>
                    <option value="not_as_described">Not as Described / Different from Pictures</option>
                    <option value="changed_mind">Changed Mind</option>
                    <option value="other">Other Reason</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1.5">
                    Select Items to Return:
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {order?.items?.map((item, idx) => {
                      const itemId = item.id || item.order_item_id || item.product_id || idx;
                      const maxQty = Number(item.quantity) || 1;
                      const currentSelected = selectedReturnItems[itemId] !== undefined ? selectedReturnItems[itemId] : maxQty;

                      return (
                        <div
                          key={itemId}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs"
                        >
                          <div className="space-y-0.5 truncate mr-2">
                            <p className="font-semibold text-slate-200 truncate">
                              {item.name || `Item #${item.product_id || itemId}`}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              Purchased: {item.quantity} | Unit Price: ₹{Number(item.price).toFixed(2)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-slate-400 font-mono">Return Qty:</span>
                            <input
                              type="number"
                              min="0"
                              max={maxQty}
                              value={currentSelected}
                              onChange={(e) => {
                                const val = Math.min(
                                  maxQty,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                );
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [itemId]: val,
                                }));
                              }}
                              className="w-16 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Details / Comments (Optional):
                  </label>
                  <textarea
                    rows="2"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Provide additional details regarding the condition or reason..."
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-[11px] text-purple-300">
                  <p className="font-semibold mb-0.5">Eligibility Policy:</p>
                  Returns are accepted within 30 days of delivery. Upon approval, replacement or refund will be initiated to your original payment method.
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowReturnModal(false)}
                    disabled={isSubmittingReturn}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReturn}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 flex items-center gap-2 transition cursor-pointer"
                  >
                    {isSubmittingReturn ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmittingReturn ? "Submitting..." : "Submit Return Request"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Admin Review Return Request Modal */}
        {showReviewReturnModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  <span>Admin Review: Return Request for Order #{orderId}</span>
                </div>
                <button
                  onClick={() => setShowReviewReturnModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Customer:</span>
                  <span className="font-semibold text-white">{order?.user_name || order?.customer_name || `User #${order?.user_id || "Customer"}`}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Order Total:</span>
                  <span className="font-mono font-bold text-emerald-400">₹{Number(order?.total_amount || order?.totalAmount || 0).toFixed(2)}</span>
                </div>
                {order?.activeReturnRequest && (
                  <div className="text-[11px] text-purple-300 bg-purple-950/40 p-2 rounded-lg border border-purple-500/20">
                    <span className="font-bold">Reason:</span> {order.activeReturnRequest.reason} <br />
                    {order.activeReturnRequest.customer_notes && (
                      <span><span className="font-bold">Notes:</span> {order.activeReturnRequest.customer_notes}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-[11px] text-slate-400 font-medium block">
                  Action Decision:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewReturnAction("approve")}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      reviewReturnAction === "approve"
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10"
                        : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Approve & Refund</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewReturnAction("reject")}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      reviewReturnAction === "reject"
                        ? "bg-rose-600/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10"
                        : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Reject Return</span>
                  </button>
                </div>

                {reviewReturnAction === "approve" && (
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restockInventory}
                      onChange={(e) => setRestockInventory(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-0 bg-slate-900 border-white/20"
                    />
                    <span className="text-xs text-slate-300">
                      Restock returned items back to MySQL <code className="text-emerald-400 font-mono">products</code> inventory
                    </span>
                  </label>
                )}

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Admin Review Notes / Explanation:
                  </label>
                  <textarea
                    rows="2"
                    value={adminReturnNotes}
                    onChange={(e) => setAdminReturnNotes(e.target.value)}
                    placeholder={
                      reviewReturnAction === "approve"
                        ? "e.g. Returned items inspected in good condition. Refund granted."
                        : "e.g. Return rejected: Item was damaged by misuse outside return policy."
                    }
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowReviewReturnModal(false)}
                  disabled={isReviewingReturn}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewReturn()}
                  disabled={isReviewingReturn}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2 transition cursor-pointer ${
                    reviewReturnAction === "approve"
                      ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                      : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                  }`}
                >
                  {isReviewingReturn ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : reviewReturnAction === "approve" ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{isReviewingReturn ? "Processing..." : `Confirm ${reviewReturnAction === "approve" ? "Approval" : "Rejection"}`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Review Cancellation Request Modal */}
        {showReviewCancelModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span>Admin Review: Cancellation Request for Order #{orderId}</span>
                </div>
                <button
                  onClick={() => setShowReviewCancelModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Customer:</span>
                  <span className="font-semibold text-white">{order?.user_name || order?.customer_name || `User #${order?.user_id || "Customer"}`}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Refund Amount:</span>
                  <span className="font-mono font-bold text-emerald-400">₹{Number(order?.total_amount || order?.totalAmount || 0).toFixed(2)}</span>
                </div>
                {order?.activeCancellationRequest && (
                  <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20">
                    <span className="font-bold">Reason:</span> {order.activeCancellationRequest.reason}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-[11px] text-slate-400 font-medium block">
                  Action Decision:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewCancelAction("approve")}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      reviewCancelAction === "approve"
                        ? "bg-rose-600/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10"
                        : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-rose-400" />
                    <span>Approve & Refund</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewCancelAction("reject")}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      reviewCancelAction === "reject"
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10"
                        : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-emerald-400" />
                    <span>Reject (Resume Order)</span>
                  </button>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">
                    Admin Review Notes:
                  </label>
                  <textarea
                    rows="2"
                    value={adminCancelNotes}
                    onChange={(e) => setAdminCancelNotes(e.target.value)}
                    placeholder={
                      reviewCancelAction === "approve"
                        ? "e.g. Cancellation approved. Stock released and refund initiated."
                        : "e.g. Package already dispatched; customer notified to request return upon delivery."
                    }
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowReviewCancelModal(false)}
                  disabled={isReviewingCancel}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewCancellation()}
                  disabled={isReviewingCancel}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2 transition cursor-pointer ${
                    reviewCancelAction === "approve"
                      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                  }`}
                >
                  {isReviewingCancel ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : reviewCancelAction === "approve" ? (
                    <Ban className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isReviewingCancel ? "Processing..." : `Confirm ${reviewCancelAction === "approve" ? "Cancellation" : "Rejection"}`}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {order?.items && order.items.length > 0 && !compact && (
          <div className="border-t border-white/5 pt-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Package Contents ({order.items.length} items)</span>
              <span className="font-mono text-emerald-400 font-bold">
                Total: ₹{Number(order.total_amount || order.totalAmount || 0).toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {order.items.map((item, i) => {
                const rawImg = item.image_url || item.imageUrl || item.image || item.product_image;
                const imgSrc = rawImg ? getImageUrl(rawImg) : null;

                return (
                  <div
                    key={item.id || i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/5 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={item.name || "Product item"}
                          onError={handleImageError}
                          className="w-8 h-8 rounded-lg object-cover bg-slate-900 border border-white/10 flex-shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">
                          #{item.product_id}
                        </div>
                      )}
                      <span className="truncate font-medium">{item.name || `Product #${item.product_id}`}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 font-mono">
                      <span className="text-slate-400">x{item.quantity}</span>
                      <span className="text-indigo-300 font-bold">₹{Number(item.price).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
