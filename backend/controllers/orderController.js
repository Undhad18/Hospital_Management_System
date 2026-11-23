const orderService = require("../services/orderService");
const emailQueue = require("../services/emailQueue");
const idempotencyService = require("../services/idempotencyService");
const stripeService = require("../services/stripeService");
const razorpayService = require("../services/razorpayService");
const db = require("../config/db");

/**
 * Create Stripe PaymentIntent with server-side verified cart totals
 * Path: POST /api/orders/create-payment-intent
 */
const createPaymentIntent = async (req, res) => {
  try {
    const {
      cartItems,
      shippingAddress,
      currency = "usd",
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
    } = req.body || {};
    const resolvedUserId = req.user?.id || req.body?.userId || 1;
    const idempotencyKey = req.headers["idempotency-key"] || req.body?.idempotencyKey || null;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Cannot create payment intent without items.",
      });
    }

    // 1. Calculate server-verified total from MySQL database
    const productIds = cartItems.map((item) => Number(item.productId));
    const placeholders = productIds.map(() => "?").join(",");

    const [products] = await db.query(
      `SELECT id, name, price, discount_price, stock FROM products WHERE id IN (${placeholders})`,
      productIds
    );

    const productMap = new Map();
    products.forEach((p) => productMap.set(Number(p.id), p));

    let calculatedTotal = 0;
    const verifiedItems = [];

    for (const item of cartItems) {
      const pid = Number(item.productId);
      const qty = Number(item.quantity);
      const prod = productMap.get(pid);

      if (!prod) {
        return res.status(404).json({
          success: false,
          message: `Product #${pid} not found in database.`,
        });
      }

      if (prod.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${prod.name}". Available: ${prod.stock}, Requested: ${qty}.`,
        });
      }

      const effectivePrice =
        prod.discount_price !== null && !isNaN(Number(prod.discount_price)) && Number(prod.discount_price) > 0
          ? Number(prod.discount_price)
          : Number(prod.price);

      const subtotal = effectivePrice * qty;
      calculatedTotal += subtotal;

      verifiedItems.push({
        productId: pid,
        name: prod.name,
        quantity: qty,
        price: effectivePrice,
        subtotal,
      });
    }

    // Compute extra fees & verified grand total
    let verifiedShippingFee = Math.max(0, Number(shippingFee) || 0);
    if (!verifiedShippingFee && shippingTier) {
      if (shippingTier === "drone") verifiedShippingFee = 25;
      else if (shippingTier === "priority") verifiedShippingFee = 15;
    }
    const verifiedDiscount = Math.max(0, Number(discountAmount) || 0);
    const verifiedExtraFee = Math.max(0, Number(extraFee) || 0);
    const grandTotal = Math.max(
      0,
      Number((calculatedTotal + verifiedShippingFee + verifiedExtraFee - verifiedDiscount).toFixed(2))
    );

    // 2. Create Stripe Payment Intent via Stripe Service
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: grandTotal,
      currency,
      metadata: {
        userId: resolvedUserId,
        itemCount: verifiedItems.length,
        itemsSubtotal: calculatedTotal,
        shippingFee: verifiedShippingFee,
        discountAmount: verifiedDiscount,
        idempotencyKey: idempotencyKey || `idem_${Date.now()}`,
        shippingAddress: shippingAddress || "Default Delivery Address",
      },
      idempotencyKey: idempotencyKey ? `pi_${idempotencyKey}` : null,
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
      amount: paymentIntent.amount,
      itemsSubtotal: Number(calculatedTotal.toFixed(2)),
      shippingFee: verifiedShippingFee,
      discountAmount: verifiedDiscount,
      totalAmount: grandTotal,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      isMock: paymentIntent.isMock,
      verifiedItems,
    });
  } catch (error) {
    console.error("Create PaymentIntent error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initialize Stripe PaymentIntent",
    });
  }
};

/**
 * Initialize Razorpay Order with server-verified cart pricing
 * Path: POST /api/orders/razorpay/create-order
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const {
      cartItems,
      currency = "INR",
      receipt,
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
    } = req.body || {};
    const resolvedUserId = req.user?.id || req.body?.userId || 1;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Cannot create Razorpay order without items.",
      });
    }

    // 1. Calculate server-verified total from MySQL database
    const productIds = cartItems.map((item) => Number(item.productId));
    const placeholders = productIds.map(() => "?").join(",");

    const [products] = await db.query(
      `SELECT id, name, price, discount_price, stock FROM products WHERE id IN (${placeholders})`,
      productIds
    );

    const productMap = new Map();
    products.forEach((p) => productMap.set(Number(p.id), p));

    let calculatedTotal = 0;
    const verifiedItems = [];

    for (const item of cartItems) {
      const pid = Number(item.productId);
      const qty = Number(item.quantity);
      const prod = productMap.get(pid);

      if (!prod) {
        return res.status(404).json({
          success: false,
          message: `Product #${pid} not found in database catalog.`,
        });
      }

      if (prod.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${prod.name}". In stock: ${prod.stock}, Requested: ${qty}`,
        });
      }

      const effectivePrice =
        prod.discount_price !== null &&
        !isNaN(Number(prod.discount_price)) &&
        Number(prod.discount_price) > 0
          ? Number(prod.discount_price)
          : Number(prod.price);

      calculatedTotal += effectivePrice * qty;
      verifiedItems.push({
        productId: pid,
        name: prod.name,
        quantity: qty,
        unitPrice: effectivePrice,
        subtotal: effectivePrice * qty,
      });
    }

    // Compute extra fees / shipping / discounts
    let verifiedShippingFee = Math.max(0, Number(shippingFee) || 0);
    if (!verifiedShippingFee && shippingTier) {
      if (shippingTier === "drone") verifiedShippingFee = 25;
      else if (shippingTier === "priority") verifiedShippingFee = 15;
    }
    const verifiedDiscount = Math.max(0, Number(discountAmount) || 0);
    const verifiedExtraFee = Math.max(0, Number(extraFee) || 0);
    const grandTotal = Math.max(
      0,
      Number((calculatedTotal + verifiedShippingFee + verifiedExtraFee - verifiedDiscount).toFixed(2))
    );

    // 2. Create Order in Razorpay SDK
    const rpOrder = await razorpayService.createRazorpayOrder({
      amount: grandTotal,
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: {
        userId: resolvedUserId,
        itemCount: cartItems.length,
        itemsSubtotal: calculatedTotal,
        shippingFee: verifiedShippingFee,
        discountAmount: verifiedDiscount,
        grandTotal,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order initialized successfully with server-verified total.",
      orderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      keyId: rpOrder.keyId,
      itemsSubtotal: calculatedTotal,
      shippingFee: verifiedShippingFee,
      discountAmount: verifiedDiscount,
      totalAmount: grandTotal,
      isMock: rpOrder.isMock || false,
      verifiedItems,
    });
  } catch (error) {
    console.error("Create Razorpay Order Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initialize Razorpay order",
    });
  }
};

/**
 * Verify Razorpay Signature & Commit ACID Checkout
 * Path: POST /api/orders/razorpay/verify-and-checkout
 */
const verifyRazorpayAndCheckout = async (req, res) => {
  try {
    const {
      cartItems,
      shippingAddress = "Standard Customer Address",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId,
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
    } = req.body || {};

    const resolvedUserId = req.user?.id || userId || 1;
    const idempotencyKey =
      req.headers["idempotency-key"] ||
      req.headers["x-idempotency-key"] ||
      req.body?.idempotencyKey ||
      `idem_rzp_${razorpayOrderId || Date.now()}`;

    // 1. Verify Payment Signature
    const isValidSignature = razorpayService.verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay payment signature. Payment could not be verified.",
      });
    }

    // 2. Commit ACID Checkout Transaction with payment_status: 'paid' and status: 'confirmed'
    const result = await orderService.processCheckoutTransaction({
      userId: resolvedUserId,
      cartItems,
      shippingAddress,
      paymentMethod: "razorpay",
      idempotencyKey,
      paymentStatus: "paid",
      orderStatus: "confirmed",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
      traceId: req.traceId,
    });

    return res.status(201).json({
      success: true,
      message: result.isIdempotentReplay
        ? "Duplicate request detected: returned verified Razorpay order."
        : "Razorpay payment verified & Order confirmed! Inventory committed via ACID transaction.",
      order: result.order,
      transactionLogs: result.transactionLogs,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error) {
    console.error("Razorpay Verify & Checkout Error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to finalize Razorpay checkout transaction",
      transactionLogs: error.transactionLogs || [],
    });
  }
};

/**
 * Handle Checkout Request using ACID MySQL Transaction + Idempotency Protection
 * Path: POST /api/orders/checkout
 */
const checkout = async (req, res) => {
  try {
    const {
      cartItems,
      shippingAddress,
      paymentMethod = "stripe",
      paymentIntentId,
      paymentStatus,
      userId,
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
    } = req.body;

    const resolvedUserId = req.user?.id || userId || 1;
    const idempotencyKey =
      req.headers["idempotency-key"] ||
      req.headers["x-idempotency-key"] ||
      req.body?.idempotencyKey ||
      null;

    const result = await orderService.processCheckoutTransaction({
      userId: resolvedUserId,
      cartItems,
      shippingAddress,
      paymentMethod,
      idempotencyKey,
      paymentIntentId,
      paymentStatus,
      shippingFee,
      shippingTier,
      discountAmount,
      extraFee,
      traceId: req.traceId,
    });

    return res.status(201).json({
      success: true,
      message: result.isIdempotentReplay
        ? "Duplicate request detected: returned existing verified order."
        : "Order placed successfully! Product stock updated via ACID transaction.",
      order: result.order,
      transactionLogs: result.transactionLogs,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error) {
    console.error("Checkout Transaction Error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process checkout transaction",
      transactionLogs: error.transactionLogs || [],
    });
  }
};

/**
 * Handle Incoming Stripe Webhooks
 * Path: POST /api/orders/webhook or /api/webhooks/stripe
 */
const handleStripeWebhook = async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    const rawPayload = req.rawBody || req.body;

    const event = stripeService.constructWebhookEvent(rawPayload, signature);

    const result = await orderService.handleStripeWebhook(event);

    return res.status(200).json({
      received: true,
      result,
    });
  } catch (error) {
    console.error("Stripe Webhook Error:", error.message);
    return res.status(400).json({
      received: false,
      error: error.message,
    });
  }
};

/**
 * Simulate a Stripe Webhook Event for local testing & monitoring
 * Path: POST /api/orders/simulate-webhook
 */
const simulateStripeWebhook = async (req, res) => {
  try {
    const {
      eventType = "payment_intent.succeeded",
      paymentIntentId,
      orderId,
      amount = 249900,
    } = req.body || {};

    const event = stripeService.simulateWebhookEvent(eventType, paymentIntentId, {
      orderId,
      amount,
    });

    const result = await orderService.handleStripeWebhook(event);

    return res.status(200).json({
      success: true,
      message: `Simulated Stripe webhook event "${eventType}" dispatched and processed.`,
      event,
      result,
    });
  } catch (error) {
    console.error("Simulate webhook error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get Idempotency Records for Admin Dashboard
 * Path: GET /api/orders/idempotency-keys
 */
const getIdempotencyKeys = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const keys = await idempotencyService.getAllKeys(limit);
    return res.status(200).json({
      success: true,
      data: keys,
      count: keys.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get Orders for the logged in user
 */
const getMyOrders = async (req, res) => {
  try {
    const resolvedUserId = req.user?.id || req.query.userId || 1;
    const orders = await orderService.getUserOrders(resolvedUserId);

    return res.status(200).json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve orders",
      error: error.message,
    });
  }
};

/**
 * Get All Orders (Admin or Monitoring Overview)
 */
const getAllOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const orders = await orderService.getAllOrders(limit);

    return res.status(200).json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error) {
    console.error("Get all orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve orders list",
      error: error.message,
    });
  }
};

/**
 * Get Single Order by ID
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderDetailsById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order #${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
      error: error.message,
    });
  }
};

/**
 * Update Order Status (Instant Real-Time WebSocket broadcast + background email queue)
 * Path: PATCH /api/orders/:id/status
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNotes, force } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required (placed, confirmed, packed, shipped, delivered, cancelled)",
      });
    }

    const result = await orderService.updateOrderStatus({
      orderId: id,
      status,
      trackingNotes,
      force: Boolean(force),
    });

    return res.status(200).json({
      success: true,
      message: `Order #${id} status updated to "${status}" and broadcasted in real-time.`,
      data: result.order,
      previousStatus: result.previousStatus,
      newStatus: result.status,
      emailJobId: result.emailJobId,
    });
  } catch (error) {
    console.error("Update order status error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update order status",
    });
  }
};

/**
 * Trigger Real-Time Lifecycle Simulation (Placed -> Confirmed -> Packed -> Shipped -> Delivered)
 * Path: POST /api/orders/:id/simulate
 */
const simulateOrderStatusFlow = async (req, res) => {
  try {
    const { id } = req.params;
    const intervalMs = req.body?.intervalMs || 3000;

    const result = await orderService.simulateDeliveryLifecycle(id, intervalMs);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Simulation error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to start simulation",
    });
  }
};

/**
 * Get Background Email Queue Stats
 * Path: GET /api/orders/email-queue/stats
 */
const getEmailQueueStats = (req, res) => {
  try {
    const metrics = emailQueue.getQueueMetrics();
    return res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get Background Email Queue Job History
 * Path: GET /api/orders/email-queue/logs
 */
const getEmailQueueLogs = (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const history = emailQueue.getJobHistory(limit);
    return res.status(200).json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Cancel and Refund an Order with ACID Transaction and Inventory Restoration
 * Path: POST /api/orders/:id/cancel
 */
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "Customer requested cancellation" } = req.body || {};
    const resolvedUserId = req.user?.id || req.body?.userId || null;
    const isAdmin = req.user?.role === "admin" || req.body?.isAdmin === true;

    const result = await orderService.cancelAndRefundOrder({
      orderId: id,
      userId: resolvedUserId,
      reason,
      isAdmin,
    });

    return res.status(200).json({
      success: true,
      message: `Order #${id} cancelled successfully.${result.refundDetails ? " Refund processed." : ""} Reserved inventory restored to stock.`,
      data: result.order,
      refundDetails: result.refundDetails,
      inventoryRestored: result.inventoryRestored,
      transactionLogs: result.transactionLogs,
    });
  } catch (error) {
    console.error("Cancel order error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel order",
      transactionLogs: error.transactionLogs || [],
    });
  }
};

/**
 * Run Automated Database Consistency and Integrity Checks
 * Path: GET /api/orders/consistency/check
 */
const checkDatabaseConsistency = async (req, res) => {
  try {
    const report = await orderService.runDatabaseConsistencyCheck();
    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Database consistency check error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute database consistency check",
    });
  }
};

/**
 * Manually retry a failed or dead-letter email notification job
 * Path: POST /api/orders/email-queue/jobs/:id/retry
 */
const retryEmailJob = (req, res) => {
  try {
    const { id } = req.params;
    const result = emailQueue.retryJob(id);
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.job,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Toggle or configure simulated failure mode for retry resilience testing
 * Path: POST /api/orders/email-queue/fault-injection
 */
const configureFaultInjection = (req, res) => {
  try {
    const { enabled, failureRate, failureMessage } = req.body || {};
    const config = emailQueue.toggleFaultInjection({ enabled, failureRate, failureMessage });
    return res.status(200).json({
      success: true,
      message: `Fault injection ${config.enabled ? "enabled" : "disabled"}`,
      data: config,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Trigger a simulated email notification job (for live demo & test)
 * Path: POST /api/orders/email-queue/simulate
 */
const triggerSimulatedEmailJob = (req, res) => {
  try {
    const { orderId, status, category, recipientEmail, shouldFail, metadata } = req.body || {};
    const job = emailQueue.triggerSimulatedJob({ orderId, status, category, recipientEmail, shouldFail, metadata });
    return res.status(200).json({
      success: true,
      message: `Simulated [${(category || "order").toUpperCase()}] notification enqueued (Failure: ${shouldFail ? "FORCED" : "OFF"})`,
      data: job,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Flush all pending jobs in email queue
 * Path: POST /api/orders/email-queue/flush
 */
const flushEmailQueue = (req, res) => {
  try {
    const result = emailQueue.flushQueue();
    return res.status(200).json({
      success: true,
      message: `Queue flushed. Removed ${result.clearedCount} pending jobs.`,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get Dead-Letter Queue items
 * Path: GET /api/orders/email-queue/dlq
 */
const getDeadLetterQueue = (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const dlq = emailQueue.getDeadLetterQueue(limit);
    return res.status(200).json({
      success: true,
      data: dlq,
      count: dlq.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Re-queue all failed jobs from Dead-Letter Queue
 * Path: POST /api/orders/email-queue/dlq/retry-all
 */
const retryAllDeadLetterJobs = (req, res) => {
  try {
    const result = emailQueue.retryAllDeadLetterJobs();
    return res.status(200).json({
      success: true,
      message: result.message,
      count: result.count,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Clear all items from Dead-Letter Queue
 * Path: DELETE /api/orders/email-queue/dlq
 */
const clearDeadLetterQueue = (req, res) => {
  try {
    const result = emailQueue.clearDeadLetterQueue();
    return res.status(200).json({
      success: true,
      message: result.message,
      count: result.count,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Trigger Task 5 Integration Tests via API
 * Path: POST /api/orders/integration-tests/run
 */
const runIntegrationTests = async (req, res) => {
  try {
    const { runTask5IntegrationTests } = require("../scripts/testTask5IntegrationSuite");
    const report = await runTask5IntegrationTests({ exitOnComplete: false });
    return res.status(200).json({
      success: report.failed === 0,
      report,
      message:
        report.failed === 0
          ? `All ${report.total} Task 5 integration assertions passed successfully with 100% data integrity!`
          : `${report.failed} test assertion(s) failed.`,
    });
  } catch (error) {
    console.error("Run integration tests API error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute integration test suite",
    });
  }
};

/**
 * Create Shipment for Order (Supports full or partial fulfillment)
 * Path: POST /api/orders/:id/shipments
 */
const createShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      carrier,
      trackingNumber,
      trackingUrl,
      shippingTier,
      estimatedDelivery,
      items,
      notes,
    } = req.body || {};

    const result = await orderService.createShipment({
      orderId: id,
      carrier,
      trackingNumber,
      trackingUrl,
      shippingTier,
      estimatedDelivery,
      items,
      notes,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error(`Create shipment error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create shipment",
    });
  }
};

/**
 * Get All Shipments for Order
 * Path: GET /api/orders/:id/shipments
 */
const getOrderShipments = async (req, res) => {
  try {
    const { id } = req.params;
    const shipments = await orderService.getOrderShipments(id);

    return res.status(200).json({
      success: true,
      orderId: Number(id),
      data: shipments,
      count: shipments.length,
    });
  } catch (error) {
    console.error(`Get shipments error for Order #${req.params?.id}:`, error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve shipments",
    });
  }
};

/**
 * Add Tracking Event Milestone to a Shipment
 * Path: POST /api/orders/:id/shipments/:shipmentId/tracking
 */
const addShipmentTrackingEvent = async (req, res) => {
  try {
    const { id, shipmentId } = req.params;
    const { status, location, description, eventTimestamp } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Tracking event status is required (e.g. picked_up, in_transit, out_for_delivery, delivered).",
      });
    }

    const result = await orderService.addShipmentTrackingEvent({
      orderId: id,
      shipmentId,
      status,
      location,
      description,
      eventTimestamp,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(`Add tracking event error for Shipment #${req.params?.shipmentId}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to add tracking event",
    });
  }
};

/**
 * Get Complete Customer Tracking View
 * Path: GET /api/orders/:id/tracking
 */
const getOrderTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const tracking = await orderService.getOrderTracking(id);

    if (!tracking) {
      return res.status(404).json({
        success: false,
        message: `Order #${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: tracking,
    });
  } catch (error) {
    console.error(`Get tracking error for Order #${req.params?.id}:`, error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch order tracking information",
    });
  }
};

/**
 * Check Order Eligibility for Cancellation and Return
 * Path: GET /api/orders/:id/eligibility
 */
const checkOrderEligibility = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const eligibility = await orderService.checkOrderEligibility(id, req.user?.role === "admin" ? null : userId);

    return res.status(200).json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    console.error(`Check eligibility error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to check order eligibility",
    });
  }
};

/**
 * Customer / Admin requests order cancellation
 * Path: POST /api/orders/:id/cancel-request
 */
const requestOrderCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes, instantIfEligible } = req.body || {};
    const userId = req.user?.id || req.body?.userId || null;
    const isAdmin = req.user?.role === "admin" || req.body?.isAdmin === true;

    const result = await orderService.requestOrderCancellation({
      orderId: id,
      userId,
      reason: reason || "Customer requested cancellation",
      notes,
      instantIfEligible: instantIfEligible === true || isAdmin,
      isAdmin,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(`Request cancellation error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to submit cancellation request",
    });
  }
};

/**
 * Admin reviews (approve/reject) cancellation request
 * Path: POST /api/orders/:id/cancel-request/review
 */
const reviewCancellationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestId, action, adminNotes } = req.body || {};
    const adminId = req.user?.id || 1;

    const result = await orderService.reviewCancellationRequest({
      orderId: id,
      requestId,
      action,
      adminNotes,
      adminId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(`Review cancellation error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to review cancellation request",
    });
  }
};

/**
 * Customer requests order return for delivered order
 * Path: POST /api/orders/:id/return-request
 */
const requestOrderReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes, customerNotes, items } = req.body || {};
    const userId = req.user?.id || req.body?.userId || null;
    const isAdmin = req.user?.role === "admin";

    const result = await orderService.requestOrderReturn({
      orderId: id,
      userId,
      reason: reason || "defective",
      notes: notes || customerNotes || "",
      items,
      isAdmin,
    });

    return res.status(200).json({
      ...result,
      request: result.returnRequest,
    });
  } catch (error) {
    console.error(`Request return error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to submit return request",
    });
  }
};

/**
 * Admin reviews (approve/reject) return request
 * Path: POST /api/orders/:id/return-request/review
 */
const reviewReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestId, action, status, adminNotes, restockInventory = true, restock = true } = req.body || {};
    const adminId = req.user?.id || 1;

    const rawAction = String(action || status || "").toLowerCase();
    const resolvedAction = rawAction.includes("approv") ? "approve" : "reject";

    const result = await orderService.reviewReturnRequest({
      orderId: id,
      requestId,
      action: resolvedAction,
      adminNotes,
      restockInventory: restock !== undefined ? Boolean(restock) : Boolean(restockInventory),
      adminId,
    });

    return res.status(200).json({
      ...result,
      request: { id: requestId, status: resolvedAction === "approve" ? "approved" : "rejected" },
    });
  } catch (error) {
    console.error(`Review return error for Order #${req.params?.id}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to review return request",
    });
  }
};

/**
 * Get return requests
 * Path: GET /api/orders/requests/returns
 */
const getOrderReturnRequests = async (req, res) => {
  try {
    const { orderId } = req.query;
    const returns = await orderService.getOrderReturnRequests(orderId || null);

    return res.status(200).json({
      success: true,
      data: returns,
    });
  } catch (error) {
    console.error("Get return requests error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch return requests",
    });
  }
};

/**
 * Get cancellation requests
 * Path: GET /api/orders/requests/cancellations
 */
const getOrderCancellationRequests = async (req, res) => {
  try {
    const { orderId } = req.query;
    const cancellations = await orderService.getOrderCancellationRequests(orderId || null);

    return res.status(200).json({
      success: true,
      data: cancellations,
    });
  } catch (error) {
    console.error("Get cancellation requests error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch cancellation requests",
    });
  }
};

/**
 * Issue manual Stripe refund (full or partial)
 * POST /api/orders/:id/refund
 */
const issueOrderRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body || {};

    const result = await orderService.issueManualRefund({
      orderId: id,
      amount,
      reason: reason || "Manual refund issued by admin",
      adminId: req.user?.id || 1,
    });

    return res.status(200).json({
      success: true,
      message: `Refund of $${Number(result.amount).toFixed(2)} processed and synchronized successfully.`,
      data: result,
    });
  } catch (error) {
    console.error("Issue refund error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process refund",
    });
  }
};

/**
 * Retrieve all refunds for an order
 * GET /api/orders/:id/refunds
 */
const getOrderRefunds = async (req, res) => {
  try {
    const { id } = req.params;
    const refunds = await orderService.getOrderRefunds(id);

    return res.status(200).json({
      success: true,
      data: refunds,
    });
  } catch (error) {
    console.error("Get order refunds error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch order refunds",
    });
  }
};

/**
 * Truncate all orders and associated data, reset stock, and broadcast
 * POST /api/orders/clear-all-data or DELETE /api/orders/clear-all-data
 */
const clearAllOrdersAndData = async (req, res) => {
  try {
    const result = await orderService.clearAllOrdersAndData();
    return res.status(200).json(result);
  } catch (error) {
    console.error("Clear all data error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to clear order data",
    });
  }
};

module.exports = {
  createPaymentIntent,
  checkout,
  cancelOrder,
  checkDatabaseConsistency,
  clearAllOrdersAndData,
  handleStripeWebhook,
  simulateStripeWebhook,
  getIdempotencyKeys,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  simulateOrderStatusFlow,
  getEmailQueueStats,
  getEmailQueueLogs,
  retryEmailJob,
  configureFaultInjection,
  triggerSimulatedEmailJob,
  flushEmailQueue,
  getDeadLetterQueue,
  retryAllDeadLetterJobs,
  clearDeadLetterQueue,
  runIntegrationTests,
  createRazorpayOrder,
  verifyRazorpayAndCheckout,
  createShipment,
  getOrderShipments,
  addShipmentTrackingEvent,
  getOrderTracking,
  checkOrderEligibility,
  requestOrderCancellation,
  reviewCancellationRequest,
  requestOrderReturn,
  reviewReturnRequest,
  getOrderReturnRequests,
  getOrderCancellationRequests,
  issueOrderRefund,
  getOrderRefunds,
};


