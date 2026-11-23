const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");

// Optional auth helper: extracts user if token exists, but doesn't block if missing
const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return protect(req, res, next);
  }
  next();
};

// Create Stripe PaymentIntent with server-verified total & idempotency
router.post("/create-payment-intent", optionalProtect, orderController.createPaymentIntent);

// Checkout endpoint with ACID Transaction & Idempotency Key protection
router.post("/checkout", optionalProtect, orderController.checkout);

// Razorpay Order Creation & Verified Checkout
router.post("/razorpay/create-order", optionalProtect, orderController.createRazorpayOrder);
router.post("/razorpay/verify-and-checkout", optionalProtect, orderController.verifyRazorpayAndCheckout);

// Stripe Webhook Endpoint (Receives payment_intent.succeeded / failed)
router.post("/webhook", orderController.handleStripeWebhook);
router.post("/simulate-webhook", orderController.simulateStripeWebhook);

// Idempotency Records Inspection
router.get("/idempotency-keys", orderController.getIdempotencyKeys);

// Get user orders
router.get("/my-orders", optionalProtect, orderController.getMyOrders);

// Get all orders (admin/feed)
router.get("/all", optionalProtect, orderController.getAllOrders);

// Background Email Queue Stats, History, Retry, and Fault Injection
router.get("/email-queue/stats", orderController.getEmailQueueStats);
router.get("/email-queue/logs", orderController.getEmailQueueLogs);
router.get("/email-queue/dlq", orderController.getDeadLetterQueue);
router.post("/email-queue/dlq/retry-all", orderController.retryAllDeadLetterJobs);
router.delete("/email-queue/dlq", orderController.clearDeadLetterQueue);
router.post("/email-queue/jobs/:id/retry", orderController.retryEmailJob);
router.post("/email-queue/fault-injection", orderController.configureFaultInjection);
router.post("/email-queue/simulate", orderController.triggerSimulatedEmailJob);
router.post("/email-queue/flush", orderController.flushEmailQueue);

// Database Consistency and Health Inspection
router.get("/consistency/check", optionalProtect, orderController.checkDatabaseConsistency);

// Clear all old test data & reset catalog inventory
router.delete("/clear-all-data", optionalProtect, orderController.clearAllOrdersAndData);
router.post("/clear-all-data", optionalProtect, orderController.clearAllOrdersAndData);

// Task 5 Automated End-to-End Integration Tests
router.post("/integration-tests/run", optionalProtect, orderController.runIntegrationTests);

// Admin Requests Queue Inspection
router.get("/requests/returns", optionalProtect, orderController.getOrderReturnRequests);
router.get("/requests/cancellations", optionalProtect, orderController.getOrderCancellationRequests);

// Real-Time Status Simulation Flow
router.post("/:id/simulate", orderController.simulateOrderStatusFlow);

// Order Eligibility for Cancellation and Return
router.get("/:id/eligibility", optionalProtect, orderController.checkOrderEligibility);

// Cancel and Refund Order (Direct / Instant)
router.post("/:id/cancel", optionalProtect, orderController.cancelOrder);

// Cancellation Workflow with Review
router.post("/:id/cancel-request", optionalProtect, orderController.requestOrderCancellation);
router.post("/:id/cancel-request/review", optionalProtect, orderController.reviewCancellationRequest);

// Return Request Workflow with Review
router.post("/:id/return-request", optionalProtect, orderController.requestOrderReturn);
router.post("/:id/return-request/review", optionalProtect, orderController.reviewReturnRequest);
router.get("/:id/returns", optionalProtect, (req, res, next) => {
  req.query.orderId = req.params.id;
  return orderController.getOrderReturnRequests(req, res, next);
});

// Stripe Refund Management & Synchronization
router.post("/:id/refund", optionalProtect, orderController.issueOrderRefund);
router.get("/:id/refunds", optionalProtect, orderController.getOrderRefunds);

// Update Status (Manual / Admin)
router.patch("/:id/status", orderController.updateOrderStatus);

// Shipment Processing & Partial Fulfillment
router.post("/:id/shipments", optionalProtect, orderController.createShipment);
router.get("/:id/shipments", optionalProtect, orderController.getOrderShipments);
router.post("/:id/shipments/:shipmentId/tracking", optionalProtect, orderController.addShipmentTrackingEvent);

// Customer Live Tracking Information
router.get("/:id/tracking", optionalProtect, orderController.getOrderTracking);

// Get specific order by ID
router.get("/:id", optionalProtect, orderController.getOrderById);

module.exports = router;


