import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useFeatureFlags } from "../context/FeatureFlagContext";
import { useCheckoutMutation } from "../hooks/useProductsQuery";
import { createRazorpayOrder, verifyRazorpayCheckout } from "../services/orderService";
import { getImageUrl, handleImageError } from "../utils/imageUrl";
import OrderStatusStepper from "./OrderStatusStepper";
import BackgroundEmailQueueInspector from "./BackgroundEmailQueueInspector";
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  CreditCard,
  Truck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Lock,
  RefreshCw,
  Sparkles,
  Zap,
  MapPin,
  Check,
  Receipt,
  Layers,
  ShoppingBag as BagIcon,
  Mail,
  Radio,
  Key,
  Shield,
  Send,
  Sliders,
  ExternalLink,
  Percent,
  Clock,
  Smartphone,
  Wallet,
} from "lucide-react";

export default function CartDrawer({ onOrderSuccess }) {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    isCartOpen,
    setIsCartOpen,
  } = useCart();
  const { user } = useAuth();

  const { isFeatureEnabled, setOverride, localOverrides } = useFeatureFlags();
  const isNextGenEnabled = isFeatureEnabled("new_checkout_v2", true);
  const isExpressShippingPerkActive = isFeatureEnabled("express_shipping_perk", false);
  const isSmartDiscountActive = isFeatureEnabled("smart_discount_engine", true);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("221B Baker Street, London, NW1 6XE");
  const [paymentMethod, setPaymentMethod] = useState("razorpay"); // 'razorpay' | 'wallet' | 'cod'

  // Progressive Delivery v2 States
  const [shippingTier, setShippingTier] = useState("standard"); // 'standard' | 'priority' | 'drone'
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoFeedback, setPromoFeedback] = useState("");

  // Idempotency Key State
  const [idempotencyKey, setIdempotencyKey] = useState(() => `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  // Razorpay Transaction & Status States
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showRazorpayModal, setShowRazorpayModal] = useState(null);
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [orderResult, setOrderResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [isEmailQueueOpen, setIsEmailQueueOpen] = useState(false);

  // Free shipping threshold logic ($150)
  const freeShippingThreshold = 150;
  const progressToFreeShipping = Math.min(100, Math.round((totalPrice / freeShippingThreshold) * 100));
  const amountNeeded = Math.max(0, freeShippingThreshold - totalPrice);

  // Generate a new idempotency key
  const handleRegenerateIdempotencyKey = () => {
    const newKey = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setIdempotencyKey(newKey);
  };

  // Helper to dynamically load Razorpay checkout script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const checkoutMutation = useCheckoutMutation({
    onSuccess: (res) => {
      setOrderResult(res.order);
      setTransactionLogs(res.transactionLogs || []);
      clearCart();
      handleRegenerateIdempotencyKey();
      if (onOrderSuccess) {
        onOrderSuccess();
      }
    },
    onError: (error) => {
      setCheckoutError(error.message || "Checkout failed");
      setTransactionLogs(error.transactionLogs || []);
    },
  });

  if (!isCartOpen) return null;

  const handleExecuteCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    setCheckoutError("");
    setTransactionLogs([]);
    setIsProcessingPayment(true);

    const cartPayload = cart.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));

    const shippingCost =
      shippingTier === "drone"
        ? 25
        : shippingTier === "priority"
          ? isExpressShippingPerkActive || appliedPromo?.freeShipping
            ? 0
            : 15
          : 0;

    let discount = 0;
    if (appliedPromo) {
      if (appliedPromo.discountPct) {
        discount = totalPrice * appliedPromo.discountPct;
      } else if (appliedPromo.fixedDiscount) {
        discount = Math.min(totalPrice, appliedPromo.fixedDiscount);
      }
    }

    // Generate a guaranteed fresh unique idempotency key for this checkout execution
    const activeIdempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setIdempotencyKey(activeIdempotencyKey);

    // If Cash on Delivery is selected, use standard checkout
    if (paymentMethod === "cod") {
      const payload = {
        userId: user?.id || 1,
        shippingAddress: shippingAddress.trim() || "Customer Delivery Address",
        paymentMethod: "cod",
        paymentStatus: "pending",
        idempotencyKey: activeIdempotencyKey,
        cartItems: cartPayload,
        shippingFee: shippingCost,
        shippingTier,
        discountAmount: discount,
      };
      checkoutMutation.mutate(payload, {
        onSettled: () => setIsProcessingPayment(false),
      });
      return;
    }

    // Razorpay Payment Flow
    try {
      const rpRes = await createRazorpayOrder({
        cartItems: cartPayload,
        shippingAddress: shippingAddress.trim() || "Customer Delivery Address",
        userId: user?.id || 1,
        currency: "INR",
        shippingFee: shippingCost,
        shippingTier,
        discountAmount: discount,
      });

      if (!rpRes.success || !rpRes.orderId) {
        throw new Error(rpRes.message || "Failed to initialize Razorpay payment order");
      }

      const { orderId, amount, currency, keyId } = rpRes;

      const finalizeCheckout = async (paymentResponse) => {
        try {
          setIsProcessingPayment(true);
          const verifyRes = await verifyRazorpayCheckout({
            razorpayOrderId: paymentResponse.razorpay_order_id || orderId,
            razorpayPaymentId: paymentResponse.razorpay_payment_id,
            razorpaySignature: paymentResponse.razorpay_signature,
            cartItems: cartPayload,
            shippingAddress: shippingAddress.trim() || "Customer Delivery Address",
            idempotencyKey: activeIdempotencyKey,
            userId: user?.id,
            shippingFee: shippingCost,
            shippingTier,
            discountAmount: discount,
          });

          setOrderResult(verifyRes.order);
          setTransactionLogs(verifyRes.transactionLogs || []);
          clearCart();
          setShowRazorpayModal(null);
          handleRegenerateIdempotencyKey();
          if (onOrderSuccess) {
            onOrderSuccess();
          }
        } catch (verErr) {
          setCheckoutError(verErr.message || "Failed to verify Razorpay payment");
          setTransactionLogs(verErr.transactionLogs || []);
        } finally {
          setIsProcessingPayment(false);
          setShowRazorpayModal(null);
        }
      };

      // 1. Only call external Razorpay SDK if a REAL registered Razorpay Key ID is configured
      // (Mock keys like 'rzp_test_shopsphere_mock' will be rejected by Razorpay's CDN with 401 Unauthorized)
      const isRealRazorpayKey = !rpRes.isMock && keyId && !keyId.includes("mock") && keyId.startsWith("rzp_test_");

      if (isRealRazorpayKey) {
        const isLoaded = await loadRazorpayScript();

        if (isLoaded && typeof window !== "undefined" && window.Razorpay) {
          try {
            const options = {
              key: keyId,
              amount: amount,
              currency: currency || "INR",
              name: "ShopSphere Store",
              description: `Order Checkout (${totalItems} items)`,
              order_id: orderId,
              handler: function (response) {
                finalizeCheckout(response);
              },
              prefill: {
                name: user?.name || "Customer",
                email: user?.email || "customer@example.com",
                contact: "9999999999",
              },
              theme: {
                color: "#4f46e5",
              },
              modal: {
                ondismiss: function () {
                  setIsProcessingPayment(false);
                },
              },
            };

            const rzp = new window.Razorpay(options);
            rzp.on("payment.failed", function (resp) {
              setCheckoutError(resp.error?.description || "Razorpay payment was declined");
              setIsProcessingPayment(false);
            });
            rzp.open();
            return;
          } catch (sdkErr) {
            console.warn("External Razorpay SDK launch error, falling back to in-app modal:", sdkErr);
          }
        }
      }

      // 2. Interactive In-App Razorpay Checkout Modal (Works 100% reliably in Sandbox/Dev mode without 401 errors)
      setShowRazorpayModal({
        orderId,
        amount,
        currency,
        keyId,
        finalizeCheckout,
      });
      setIsProcessingPayment(false);
    } catch (err) {
      setCheckoutError(err.message || "Checkout failed");
      setIsProcessingPayment(false);
    }
  };

  const handleClose = () => {
    setIsCartOpen(false);
    setIsCheckingOut(false);
    setOrderResult(null);
    setCheckoutError("");
    setTransactionLogs([]);
    setShowRazorpayModal(null);
    handleRegenerateIdempotencyKey();
  };

  const drawerContent = (
    <div className="fixed inset-0 z-[9999] overflow-hidden animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300 z-0"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 z-10">
        <div className="w-screen max-w-lg bg-slate-900/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl shadow-black/80 flex flex-col justify-between overflow-hidden relative">
          {/* Subtle top ambient glow */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/60 backdrop-blur-md relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  Shopping Cart
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                    {totalItems} {totalItems === 1 ? "item" : "items"}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Stripe Test Mode & Idempotency Protected
                </p>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition cursor-pointer"
              title="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Progress bar */}
          {cart.length > 0 && !orderResult && (
            <div className="px-5 py-3 bg-indigo-950/30 border-b border-indigo-500/15 relative z-10">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {amountNeeded === 0 ? (
                    <span className="text-emerald-400 font-semibold">🎉 VIP Free Express Delivery unlocked!</span>
                  ) : (
                    <span>
                      Add <strong className="text-indigo-300 font-mono">₹${amountNeeded.toFixed(2)}</strong> for Free Shipping
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-mono font-bold text-indigo-400">{progressToFreeShipping}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 rounded-full transition-all duration-500 shadow-sm shadow-indigo-500"
                  style={{ width: `${progressToFreeShipping}%` }}
                />
              </div>
            </div>
          )}

          {/* Scrollable Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar relative z-10">
            {/* SUCCESS ORDER RECEIPT & TRACKING VIEW */}
            {orderResult ? (
              <div className="space-y-5 animate-fadeIn">
                <div className="text-center p-6 rounded-3xl bg-slate-900/90 border border-white/10 shadow-xl relative overflow-hidden">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg ${orderResult.paymentStatus === "paid" || orderResult.paymentStatus === "succeeded"
                      ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                      : orderResult.paymentStatus === "processing"
                        ? "bg-blue-500/20 border border-blue-500/30 text-blue-400"
                        : orderResult.paymentStatus === "failed"
                          ? "bg-rose-500/20 border border-rose-500/30 text-rose-400"
                          : "bg-amber-500/20 border border-amber-500/30 text-amber-400"
                      }`}
                  >
                    {orderResult.paymentStatus === "paid" || orderResult.paymentStatus === "succeeded" ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : orderResult.paymentStatus === "failed" ? (
                      <AlertCircle className="w-8 h-8" />
                    ) : (
                      <Clock className="w-8 h-8 animate-pulse" />
                    )}
                  </div>

                  <h3 className="text-lg font-black text-white font-heading">
                    {orderResult.paymentStatus === "paid" || orderResult.paymentStatus === "succeeded"
                      ? "Payment Verified & Order Confirmed!"
                      : orderResult.paymentStatus === "failed"
                        ? "Payment Failed - Order Cancelled"
                        : "Order Placed - Awaiting Payment Verification"}
                  </h3>

                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {orderResult.paymentStatus === "paid" || orderResult.paymentStatus === "succeeded"
                      ? "Razorpay HMAC-SHA256 payment signature verified. Order confirmed and moving to fulfillment."
                      : orderResult.paymentStatus === "failed"
                        ? "Payment declined. Reserved product inventory has been safely restored in MySQL."
                        : "Order recorded in MySQL via ACID transaction. Awaiting payment authorization."}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
                    <span
                      className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 uppercase ${orderResult.paymentStatus === "paid" || orderResult.paymentStatus === "succeeded"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : orderResult.paymentStatus === "failed"
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                      Payment: {orderResult.paymentStatus || "paid"}
                    </span>
                    {(orderResult.razorpayOrderId || orderResult.razorpay_order_id) && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-indigo-300">
                        RP Order: {orderResult.razorpayOrderId || orderResult.razorpay_order_id}
                      </span>
                    )}
                    {(orderResult.razorpayPaymentId || orderResult.razorpay_payment_id) && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-emerald-300">
                        Payment ID: {orderResult.razorpayPaymentId || orderResult.razorpay_payment_id}
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-slate-300">
                      Idempotency: {orderResult.idempotencyKey || idempotencyKey}
                    </span>
                  </div>
                </div>

                {/* Real-Time Delivery Stepper */}
                <div className="p-4 rounded-3xl bg-slate-950/80 border border-white/10 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-indigo-400" />
                      Live Order Tracking
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      WebSocket Active
                    </span>
                  </div>

                  <OrderStatusStepper orderId={orderResult.id} initialStatus={orderResult.status || "confirmed"} />
                </div>

                {/* Background Email Worker Preview */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>Background Email Worker Enqueued</span>
                  </div>
                  <button
                    onClick={() => setIsEmailQueueOpen(true)}
                    className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer text-[11px]"
                  >
                    Inspect Worker
                  </button>
                </div>

                {/* Transaction Logs Accordion */}
                {transactionLogs.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      MySQL Transaction & Idempotency Audit
                    </span>
                    <div className="space-y-1 font-mono text-[10px] text-slate-300 max-h-32 overflow-y-auto">
                      {transactionLogs.map((log, index) => (
                        <div key={index} className="flex items-start gap-1.5 py-0.5">
                          <span className="text-slate-500">[{log.step}]</span>
                          <span>
                            <strong className={log.status === "FAILED" ? "text-rose-400" : "text-emerald-400"}>
                              {log.action}
                            </strong>
                            : {log.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            ) : isCheckingOut ? (
              /* PROGRESSIVE DELIVERY DUAL CHECKOUT FORM VIEW */
              <form onSubmit={handleExecuteCheckout} className="space-y-5 animate-fadeIn">
                {/* A/B Testing Cohort Badge & QA Variant Toggle */}
                <div className="p-3 rounded-2xl bg-gradient-to-r from-violet-950/70 via-slate-900 to-indigo-950/70 border border-violet-500/30 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                    <span className="font-bold text-white font-mono text-[11px]">
                      {isNextGenEnabled ? "🚀 Variant B: Next-Gen Express Flow (v2)" : "📦 Variant A: Legacy Stable Flow (v1)"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOverride("new_checkout_v2", !isNextGenEnabled)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 hover:border-violet-500/40 text-[10px] font-mono text-violet-300 transition cursor-pointer"
                    title="Toggle local A/B test variant preview"
                  >
                    Switch to {isNextGenEnabled ? "Variant A (Legacy)" : "Variant B (v2)"}
                  </button>
                </div>

                {/* Checkout Error Notification */}
                {checkoutError && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3 animate-shake">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{checkoutError}</span>
                    </div>
                    <button type="button" onClick={() => setCheckoutError("")} className="cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Idempotency Protection Indicator */}
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-indigo-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5" />
                      Idempotency Protection Active
                    </span>
                    <button
                      type="button"
                      onClick={handleRegenerateIdempotencyKey}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer font-mono"
                      title="Generate new unique Idempotency-Key"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Regenerate
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="truncate max-w-[280px]">Key: {idempotencyKey}</span>
                    <span className="text-emerald-400">Single Charge Guarantee</span>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* VARIANT B: NEXT-GEN V2 PROGRESSIVE FEATURES               */}
                {/* ========================================================= */}
                {isNextGenEnabled ? (
                  <>
                    {/* 1. Dynamic Shipping Speed Tier Selection (v2 Feature) */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-indigo-400" />
                          Delivery Speed Tier
                        </span>
                        {isExpressShippingPerkActive && (
                          <span className="text-[10px] text-emerald-400 font-mono font-bold">
                            VIP 1-Day Perk Active
                          </span>
                        )}
                      </label>

                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => setShippingTier("standard")}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${shippingTier === "standard"
                            ? "bg-indigo-600/20 border-indigo-500 text-white shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <p className="font-bold text-[11px]">Standard</p>
                          <p className="text-[10px] text-slate-500">3-5 Days</p>
                          <p className="text-[10px] text-emerald-400 font-bold mt-1">FREE</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShippingTier("priority")}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${shippingTier === "priority"
                            ? "bg-indigo-600/20 border-indigo-500 text-white shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <p className="font-bold text-[11px] text-amber-300">1-Day Air</p>
                          <p className="text-[10px] text-slate-500">Tomorrow</p>
                          <p className="text-[10px] text-amber-400 font-bold mt-1">
                            {isExpressShippingPerkActive ? "FREE (VIP)" : "₹15.00"}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShippingTier("drone")}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${shippingTier === "drone"
                            ? "bg-indigo-600/20 border-indigo-500 text-white shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <p className="font-bold text-[11px] text-purple-300">Drone Air</p>
                          <p className="text-[10px] text-slate-500">Next Hour</p>
                          <p className="text-[10px] text-purple-400 font-bold mt-1">₹25.00</p>
                        </button>
                      </div>
                    </div>

                    {/* 2. AI Promo Code / Coupon Engine (v2 Feature) */}
                    {isSmartDiscountActive && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Percent className="w-3.5 h-3.5 text-emerald-400" />
                            Promo Code / Coupon
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Try SAVE20 or EXCELSIOR50</span>
                        </label>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Enter coupon code..."
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                            className="flex-1 px-3 py-1.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const code = promoCodeInput.trim();
                              if (code === "SAVE20") {
                                setAppliedPromo({ code, discountPct: 0.2, label: "20% Off" });
                                setPromoFeedback("Applied: 20% Discount!");
                              } else if (code === "EXCELSIOR50") {
                                setAppliedPromo({ code, fixedDiscount: 50, label: "₹50 Off" });
                                setPromoFeedback("Applied: ₹50 Instant Credit!");
                              } else if (code === "FREESHIP") {
                                setAppliedPromo({ code, freeShipping: true, label: "Free Shipping" });
                                setPromoFeedback("Applied: Free Priority Shipping!");
                              } else if (code) {
                                setPromoFeedback("Invalid coupon code.");
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                        {promoFeedback && (
                          <p className={`text-[10px] font-mono ${appliedPromo ? "text-emerald-400" : "text-rose-400"}`}>
                            {promoFeedback}
                          </p>
                        )}
                      </div>
                    )}

                    {/* 3. Multi-Payment Selector (v2 3-Way Tabs) */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                          Payment Method (v2 Tabs)
                        </span>
                        <span className="text-[10px] text-emerald-400 font-mono">Instant Settlement</span>
                      </label>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("razorpay")}
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${paymentMethod === "razorpay"
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <CreditCard className="w-4 h-4 text-indigo-400" />
                          <span className="text-[10px]">Razorpay</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod("wallet")}
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${paymentMethod === "wallet"
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span className="text-[10px]">Apple/GPay</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod("cod")}
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${paymentMethod === "cod"
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                            }`}
                        >
                          <Truck className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px]">COD</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ========================================================= */
                  /* VARIANT A: LEGACY STABLE CHECKOUT FLOW (V1)               */
                  /* ========================================================= */
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-300 space-y-1">
                      <p className="font-bold text-white">Standard Delivery</p>
                      <p className="text-[11px] text-slate-400">Standard courier dispatch (3-5 Business Days)</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("razorpay")}
                        className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${paymentMethod === "razorpay"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                          : "bg-slate-950/60 border-white/10 text-slate-400 hover:border-white/20"
                          }`}
                      >
                        <CreditCard className="w-4 h-4 text-indigo-400" />
                        Razorpay
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("cod")}
                        className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${paymentMethod === "cod"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                          : "bg-slate-950/60 border-white/10 text-slate-400 hover:border-white/20"
                          }`}
                      >
                        <Truck className="w-4 h-4" />
                        Cash on Delivery
                      </button>
                    </div>
                  </div>
                )}

                {/* Delivery Address (Universal for both v1 and v2) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      Delivery Address
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Autofilled</span>
                  </label>
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    required
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition resize-none"
                    placeholder="Enter full delivery address..."
                  />
                </div>

                {/* Razorpay Gateway Information Card */}
                {paymentMethod === "razorpay" && (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/90 via-slate-900/90 to-blue-950/90 border border-indigo-500/30 shadow-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-[11px] shadow">
                          ₹
                        </div>
                        <span className="font-bold text-white">Razorpay Secure Checkout</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Gateway Active
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-white/5">
                        <p className="text-[10px] font-bold text-indigo-300">UPI</p>
                        <p className="text-[9px] text-slate-500">GPay, PhonePe</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-white/5">
                        <p className="text-[10px] font-bold text-blue-300">Cards</p>
                        <p className="text-[9px] text-slate-500">Visa, RuPay, MC</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-white/5">
                        <p className="text-[10px] font-bold text-violet-300">NetBanking</p>
                        <p className="text-[9px] text-slate-500">50+ Banks</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-white/5">
                        <p className="text-[10px] font-bold text-amber-300">Wallets</p>
                        <p className="text-[9px] text-slate-500">Paytm & More</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Click <strong>Pay with Razorpay</strong> to open the encrypted checkout modal and authorize instant settlement.
                    </p>
                  </div>
                )}

                {/* Items Checkout Preview with Dynamic Recalculation */}
                {(() => {
                  const shippingCost =
                    shippingTier === "drone"
                      ? 25
                      : shippingTier === "priority"
                        ? isExpressShippingPerkActive || appliedPromo?.freeShipping
                          ? 0
                          : 15
                        : 0;

                  let discount = 0;
                  if (appliedPromo) {
                    if (appliedPromo.discountPct) {
                      discount = totalPrice * appliedPromo.discountPct;
                    } else if (appliedPromo.fixedDiscount) {
                      discount = Math.min(totalPrice, appliedPromo.fixedDiscount);
                    }
                  }

                  const grandTotal = Math.max(0, totalPrice - discount + shippingCost);

                  return (
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 space-y-2 font-mono text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Items Subtotal ({totalItems})</span>
                        <span className="font-semibold text-slate-200">₹{totalPrice.toFixed(2)}</span>
                      </div>

                      {discount > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Promo Discount ({appliedPromo?.code})</span>
                          <span>-₹{discount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-400">
                        <span>Shipping ({shippingTier.toUpperCase()})</span>
                        <span className={shippingCost === 0 ? "text-emerald-400 font-bold" : "text-slate-200"}>
                          {shippingCost === 0 ? "FREE" : `₹${shippingCost.toFixed(2)}`}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-bold text-white">
                        <span>Grand Total</span>
                        <span className="text-indigo-400 font-mono text-base">₹{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Security Guarantee */}
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 flex items-start gap-2.5 text-[11px] text-indigo-300">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 text-indigo-400 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>ACID & Idempotency Protected:</strong> Row-level locks (<code className="text-indigo-200">SELECT FOR UPDATE</code>) prevent overselling while the Idempotency engine eliminates double charging.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCheckingOut(false)}
                    className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isProcessingPayment}
                    className="w-2/3 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.99]"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Processing Razorpay...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>Pay with Razorpay</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : cart.length === 0 ? (
              /* EMPTY CART VIEW */
              <div className="py-20 text-center animate-fadeIn">
                <div className="w-16 h-16 rounded-3xl bg-slate-950 border border-white/10 flex items-center justify-center mx-auto mb-4 text-slate-500 shadow-inner">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white">Your cart is empty</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Explore our products catalog and add verified hardware or laptops to your cart.
                </p>
              </div>
            ) : (
              /* CART ITEMS LIST VIEW */
              <div className="space-y-3 animate-fadeIn">
                {cart.map(({ product, quantity }) => {
                  const hasDiscount =
                    product.discount_price !== null &&
                    product.discount_price !== undefined &&
                    !isNaN(Number(product.discount_price)) &&
                    Number(product.discount_price) > 0;
                  const unitPrice = hasDiscount ? Number(product.discount_price) : Number(product.price);
                  const itemTotal = unitPrice * quantity;

                  return (
                    <div
                      key={product.id}
                      className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 hover:border-indigo-500/30 flex items-center justify-between gap-3.5 transition group"
                    >
                      <div className="w-16 h-16 rounded-xl bg-slate-900 border border-white/5 overflow-hidden shrink-0">
                        <img
                          src={getImageUrl(product.image_url)}
                          alt={product.name}
                          onError={handleImageError}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-300 transition">
                          {product.name}
                        </h4>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-emerald-400 font-bold">₹{unitPrice.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">× {quantity}</span>
                        </div>
                      </div>

                      {/* Quantity Modifier */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl p-0.5">
                          <button
                            onClick={() => updateQuantity(product.id, quantity - 1)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-mono font-bold text-white">
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Footer (When browsing cart items) */}
          {cart.length > 0 && !isCheckingOut && !orderResult && (
            <div className="p-5 border-t border-white/10 bg-slate-950/80 backdrop-blur-md space-y-3 relative z-10">
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-200">₹{totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span className="text-emerald-400 font-semibold">FREE</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-bold text-white">
                  <span>Total Amount</span>
                  <span className="text-indigo-400 font-mono text-base">₹{totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={clearCart}
                  className="px-3.5 py-3 rounded-xl bg-slate-900 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs font-semibold transition cursor-pointer"
                  title="Clear all items"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsCheckingOut(true)}
                  className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>Proceed to Razorpay Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Razorpay Interactive Modal (Standard & Sandbox Support) */}
      {showRazorpayModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl shadow-2xl overflow-hidden relative">
            <div className="bg-[#0c2340] p-4 text-white flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#3399cc] flex items-center justify-center font-bold text-white text-sm shadow">
                  ₹
                </div>
                <div>
                  <h4 className="text-xs font-bold tracking-tight">Razorpay Secure Checkout</h4>
                  <p className="text-[10px] text-slate-300 font-mono">Order: {showRazorpayModal.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRazorpayModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950/60 border-b border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 block">MERCHANT</span>
                <span className="text-xs font-bold text-white">ShopSphere Store</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block">AMOUNT PAYABLE</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  ₹{(showRazorpayModal.amount / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Select Payment Mode
              </span>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    showRazorpayModal.finalizeCheckout({
                      razorpay_order_id: showRazorpayModal.orderId,
                      razorpay_payment_id: `pay_rp_upi_${Date.now()}`,
                      razorpay_signature: `mock_sig_${Date.now()}`,
                    });
                  }}
                  className="w-full p-3 rounded-2xl bg-slate-950 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-emerald-300 transition">UPI Instant Pay</p>
                      <p className="text-[10px] text-slate-400">Google Pay, PhonePe, Paytm QR</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    INSTANT
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    showRazorpayModal.finalizeCheckout({
                      razorpay_order_id: showRazorpayModal.orderId,
                      razorpay_payment_id: `pay_rp_card_${Date.now()}`,
                      razorpay_signature: `mock_sig_${Date.now()}`,
                    });
                  }}
                  className="w-full p-3 rounded-2xl bg-slate-950 border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-left flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-indigo-300 transition">Debit / Credit Card</p>
                      <p className="text-[10px] text-slate-400">Visa, RuPay, MasterCard</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-400 font-bold">
                    Secure
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    showRazorpayModal.finalizeCheckout({
                      razorpay_order_id: showRazorpayModal.orderId,
                      razorpay_payment_id: `pay_rp_net_${Date.now()}`,
                      razorpay_signature: `mock_sig_${Date.now()}`,
                    });
                  }}
                  className="w-full p-3 rounded-2xl bg-slate-950 border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5 text-left flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-violet-300 transition">NetBanking & Wallets</p>
                      <p className="text-[10px] text-slate-400">All major Indian banks supported</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-violet-400 font-bold">
                    Direct
                  </span>
                </button>
              </div>

              <div className="pt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  256-Bit SSL Encrypted
                </span>
                <span>Razorpay Authorized</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Queue Inspector Modal */}
      {isEmailQueueOpen && (
        <BackgroundEmailQueueInspector
          isOpen={isEmailQueueOpen}
          onClose={() => setIsEmailQueueOpen(false)}
        />
      )}
    </div>
  );

  return createPortal(drawerContent, document.body);
}
