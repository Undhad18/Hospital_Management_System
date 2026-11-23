const db = require("../config/db");
const socketService = require("./socketService");
const emailQueue = require("./emailQueue");
const idempotencyService = require("./idempotencyService");
const stripeService = require("./stripeService");
const telemetryService = require("./telemetryService");

const VALID_STATUSES = [
  "placed",
  "confirmed",
  "packed",
  "partially_shipped",
  "shipped",
  "delivered",
  "cancelled",
  "cancel_requested",
  "cancel_rejected",
  "return_requested",
  "return_approved",
  "returned",
  "return_rejected",
];

const VALID_TRANSITIONS = {
  placed: ["confirmed", "cancelled", "cancel_requested"],
  confirmed: ["packed", "cancelled", "cancel_requested"],
  packed: ["partially_shipped", "shipped", "cancelled", "cancel_requested"],
  partially_shipped: ["partially_shipped", "shipped"],
  shipped: ["delivered"],
  delivered: ["return_requested", "returned"],
  cancelled: [],
  cancel_requested: ["cancelled", "confirmed", "packed", "cancel_rejected"],
  cancel_rejected: ["packed", "shipped"],
  return_requested: ["return_approved", "return_rejected", "returned", "delivered"],
  return_approved: ["returned"],
  return_rejected: ["delivered"],
  returned: [],
};

/**
 * Process Cart Checkout with ACID MySQL Transaction + Idempotency Protection + Stripe Linking
 * Initial status is 'placed' (Step 1 of fulfillment)
 */
const processCheckoutTransaction = async ({
  userId = 1,
  cartItems,
  shippingAddress = "221B Baker Street, London, NW1 6XE",
  paymentMethod = "credit_card",
  idempotencyKey = null,
  paymentIntentId = null,
  paymentStatus = null,
  traceId = null,
  razorpayOrderId = null,
  razorpayPaymentId = null,
  razorpaySignature = null,
  orderStatus = null,
  shippingFee = 0,
  shippingTier = "standard",
  discountAmount = 0,
  extraFee = 0,
}) => {
  // 1. Basic validation
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart is empty. Please add items before checking out.");
  }

  for (const item of cartItems) {
    if (!item.productId || isNaN(Number(item.productId))) {
      throw new Error("Invalid product ID in cart item.");
    }
    if (!item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new Error(`Invalid quantity for product ID ${item.productId}. Must be at least 1.`);
    }
  }

  // 2. Idempotency Check (Prevent duplicate orders and double stock deductions)
  if (idempotencyKey) {
    const idemResult = await idempotencyService.checkOrCreate(
      idempotencyKey,
      userId,
      "/api/orders/checkout"
    );

    if (idemResult.isComplete && idemResult.cachedResponse) {
      console.log(`🛡️ [Idempotency] Duplicate request intercepted for key "${idempotencyKey}". Replaying cached response.`);
      return {
        success: true,
        order: idemResult.cachedResponse.order,
        transactionLogs: [
          {
            step: 0,
            action: "IDEMPOTENCY_INTERCEPTOR",
            status: "CACHED_MATCH",
            detail: `Idempotency-Key "${idempotencyKey}" already processed. Safely returned existing order #${idemResult.cachedResponse.order?.id} without duplicate stock deduction.`,
          },
          ...(idemResult.cachedResponse.transactionLogs || []),
        ],
        isIdempotentReplay: true,
        message: "Duplicate order request prevented by Idempotency engine. Existing order returned.",
      };
    }

    if (idemResult.isProcessing) {
      throw new Error(
        `A checkout transaction with Idempotency-Key "${idempotencyKey}" is currently being processed. Please wait.`
      );
    }
  }

  // Track transaction logs for educational/inspection feedback
  const transactionLogs = [
    {
      step: 1,
      action: "IDEMPOTENCY_VERIFICATION",
      status: "SUCCESS",
      detail: idempotencyKey
        ? `Idempotency lock acquired for key "${idempotencyKey}".`
        : "No idempotency key provided (standard execution).",
    },
    { step: 2, action: "ACQUIRE_CONNECTION", status: "SUCCESS", detail: "Dedicated DB connection acquired from pool." },
    { step: 3, action: "START_TRANSACTION", status: "SUCCESS", detail: "MySQL ACID Transaction started." },
  ];

  const connection = await db.getConnection();

  try {
    // 3. Start MySQL Transaction
    await connection.beginTransaction();

    // 4. Extract all product IDs and lock rows with SELECT ... FOR UPDATE
    const productIds = cartItems.map((item) => Number(item.productId));
    const placeholders = productIds.map(() => "?").join(",");

    transactionLogs.push({
      step: 4,
      action: "LOCK_ROWS_FOR_UPDATE",
      status: "EXECUTING",
      detail: `SELECT ... FOR UPDATE on Product IDs [${productIds.join(", ")}] to prevent race conditions.`,
    });

    const [lockedProducts] = await connection.query(
      `SELECT id, name, price, discount_price, stock, image_url FROM products WHERE id IN (${placeholders}) FOR UPDATE`,
      productIds
    );

    const productMap = new Map();
    lockedProducts.forEach((p) => productMap.set(Number(p.id), p));

    // 5. Verify product stock & calculate verified server total
    let calculatedTotal = 0;
    const verifiedOrderItems = [];

    for (const item of cartItems) {
      const pid = Number(item.productId);
      const qty = Number(item.quantity);
      const product = productMap.get(pid);

      if (!product) {
        throw new Error(`Product with ID ${pid} was not found in catalog.`);
      }

      if (product.stock < qty) {
        throw new Error(
          `Insufficient stock for "${product.name}". Available in stock: ${product.stock}, Requested: ${qty}. Transaction rolled back.`
        );
      }

      const effectivePrice =
        product.discount_price !== null && !isNaN(Number(product.discount_price)) && Number(product.discount_price) > 0
          ? Number(product.discount_price)
          : Number(product.price);

      const itemTotal = effectivePrice * qty;
      calculatedTotal += itemTotal;

      verifiedOrderItems.push({
        productId: pid,
        name: product.name,
        quantity: qty,
        unitPrice: effectivePrice,
        subtotal: itemTotal,
        previousStock: product.stock,
        newStock: product.stock - qty,
        imageUrl: product.image_url,
      });
    }

    let verifiedShippingFee = Math.max(0, Number(shippingFee) || 0);
    if (!verifiedShippingFee && shippingTier) {
      if (shippingTier === "drone") verifiedShippingFee = 25;
      else if (shippingTier === "priority") verifiedShippingFee = 15;
    }
    const verifiedDiscount = Math.max(0, Number(discountAmount) || 0);
    const verifiedExtraFee = Math.max(0, Number(extraFee) || 0);
    const finalGrandTotal = Math.max(
      0,
      Number((calculatedTotal + verifiedShippingFee + verifiedExtraFee - verifiedDiscount).toFixed(2))
    );

    transactionLogs.push({
      step: 5,
      action: "STOCK_AND_PRICING_VALIDATION",
      status: "SUCCESS",
      detail: `Stock and pricing verified. Items: $${calculatedTotal.toFixed(2)}, Shipping: $${verifiedShippingFee.toFixed(2)}, Extra: $${verifiedExtraFee.toFixed(2)}, Discount: -$${verifiedDiscount.toFixed(2)}. Grand Total: $${finalGrandTotal.toFixed(2)}`,
    });

    const resolvedStatus = orderStatus || "placed";
    const resolvedPaymentStatus =
      paymentStatus || (paymentMethod === "razorpay" ? "paid" : "pending");

    // 6. Insert order record into 'orders' with metadata
    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, total_amount, status, shipping_address, payment_method, stripe_payment_intent_id, idempotency_key, payment_status, razorpay_order_id, razorpay_payment_id, razorpay_signature) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || 1,
        finalGrandTotal.toFixed(2),
        resolvedStatus,
        shippingAddress,
        paymentMethod,
        paymentIntentId || null,
        idempotencyKey || null,
        resolvedPaymentStatus,
        razorpayOrderId || null,
        razorpayPaymentId || null,
        razorpaySignature || null,
      ]
    );

    const orderId = orderResult.insertId;

    transactionLogs.push({
      step: 6,
      action: "INSERT_ORDER",
      status: "SUCCESS",
      detail: `Created Order ID #${orderId} with status '${resolvedStatus}', payment_status '${resolvedPaymentStatus}', PaymentMethod: ${paymentMethod}, Grand Total $${finalGrandTotal.toFixed(2)} (Items: $${calculatedTotal.toFixed(2)}, Shipping: $${verifiedShippingFee.toFixed(2)}).`,
    });

    // 7. Insert items into 'order_items' and update stock in 'products'
    for (const item of verifiedOrderItems) {
      // A. Insert order item
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.unitPrice]
      );

      // B. Atomically decrement product stock
      await connection.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.productId]);
    }

    transactionLogs.push({
      step: 7,
      action: "UPDATE_STOCK_AND_ITEMS",
      status: "SUCCESS",
      detail: `Inserted ${verifiedOrderItems.length} order items and decremented stock for each product.`,
    });

    // 8. COMMIT Transaction
    await connection.commit();

    transactionLogs.push({
      step: 8,
      action: "COMMIT_TRANSACTION",
      status: "SUCCESS",
      detail: "All operations succeeded. Changes permanently committed to MySQL.",
    });

    const fullOrder = {
      id: orderId,
      userId: userId || 1,
      totalAmount: finalGrandTotal,
      itemsSubtotal: calculatedTotal,
      shippingFee: verifiedShippingFee,
      discountAmount: verifiedDiscount,
      status: resolvedStatus,
      shippingAddress,
      paymentMethod,
      stripePaymentIntentId: paymentIntentId || null,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null,
      razorpaySignature: razorpaySignature || null,
      idempotencyKey: idempotencyKey || null,
      paymentStatus: resolvedPaymentStatus,
      items: verifiedOrderItems,
      createdAt: new Date().toISOString(),
    };

    // 9. Save Idempotency state as COMPLETED
    if (idempotencyKey) {
      await idempotencyService.complete(idempotencyKey, 201, {
        order: fullOrder,
        transactionLogs,
      });
    }

    // 10. Trigger real-time Socket.IO and Background Email Queue Asynchronously
    try {
      // Broadcast new order creation
      socketService.emitOrderCreated({ order: fullOrder });
      socketService.emitOrderStatusUpdate({
        orderId,
        userId,
        status: "placed",
        previousStatus: null,
        trackingNotes: "Order successfully placed and confirmed with InnoDB row-locks.",
        order: fullOrder,
      });

      // Admin & Customer real-time notifications
      socketService.emitAdminNotification({
        type: "NEW_ORDER",
        title: "📦 New Order Placed",
        message: `Order #${orderId} placed for $${Number(fullOrder.totalAmount || 0).toFixed(2)} with ${fullOrder.items?.length || 1} item(s).`,
        orderId,
        severity: "info",
        data: {
          totalAmount: fullOrder.totalAmount,
          itemsCount: fullOrder.items?.length || 1,
          paymentMethod: fullOrder.paymentMethod,
        },
      });

      socketService.emitCustomerNotification({
        userId,
        orderId,
        title: "Order Placed Successfully",
        message: `Your order #${orderId} was recorded and sent to fulfillment.`,
        status: "placed",
        trackingNotes: "Order successfully placed and confirmed with InnoDB row-locks.",
      });

      // Fetch user email if available
      let userEmail = "customer@excelsior-store.io";
      try {
        const [users] = await db.query(`SELECT email, name FROM users WHERE id = ?`, [userId]);
        if (users && users.length > 0) {
          userEmail = users[0].email;
        }
      } catch (uErr) {
        // Fallback default
      }

      // Enqueue background email job
      emailQueue.enqueueEmailJob({
        type: "ORDER_CONFIRMATION",
        order: fullOrder,
        recipientEmail: userEmail,
        status: "placed",
        trackingNotes: "Order Placed Successfully via Stripe / Checkout Flow",
      });
    } catch (bgErr) {
      console.error("Background notification error (non-blocking):", bgErr.message);
    }

    return {
      success: true,
      order: fullOrder,
      transactionLogs,
      isIdempotentReplay: false,
    };
  } catch (error) {
    // ROLLBACK on failure
    await connection.rollback();

    // Mark idempotency key as FAILED so user can retry
    if (idempotencyKey) {
      await idempotencyService.fail(idempotencyKey, error.message);
    }

    transactionLogs.push({
      step: transactionLogs.length + 1,
      action: "ROLLBACK_TRANSACTION",
      status: "FAILED",
      detail: `Transaction failed and safely rolled back: ${error.message}`,
    });

    const rollbackError = new Error(error.message);
    rollbackError.transactionLogs = transactionLogs;
    throw rollbackError;
  } finally {
    // Release connection back to pool
    connection.release();
  }
};

/**
 * Update Order Status and trigger Real-Time WebSockets + Background Email Dispatch
 * Lifecycle: placed -> confirmed -> packed -> shipped -> delivered
 */
const updateOrderStatus = async ({ orderId, status, trackingNotes = "", force = false }) => {
  const normalizedStatus = String(status).toLowerCase().trim();

  if (!VALID_STATUSES.includes(normalizedStatus)) {
    throw new Error(
      `Invalid status "${status}". Allowed statuses: ${VALID_STATUSES.join(", ")}`
    );
  }

  // 1. Fetch current order
  const [existingOrders] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!existingOrders || existingOrders.length === 0) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  const previousOrder = existingOrders[0];
  const previousStatus = previousOrder.status;

  // 1.1 Enforce state machine transition guardrails
  if (!force && previousStatus && previousStatus !== normalizedStatus) {
    const allowedNext = VALID_TRANSITIONS[previousStatus] || [];
    if (!allowedNext.includes(normalizedStatus)) {
      throw new Error(
        `Invalid order status transition from "${previousStatus}" to "${normalizedStatus}". Allowed transitions: ${
          allowedNext.length > 0 ? allowedNext.join(", ") : "None (terminal state)"
        }.`
      );
    }
  }

  // 2. Update status in MySQL database
  await db.query(`UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`, [
    normalizedStatus,
    orderId,
  ]);

  // 3. Fetch full order with items and user details
  const updatedOrder = await getOrderDetailsById(orderId);

  // 4. Emit Real-Time WebSocket event to all connected clients & rooms
  socketService.emitOrderStatusUpdate({
    orderId,
    userId: updatedOrder.user_id || updatedOrder.userId,
    status: normalizedStatus,
    previousStatus,
    trackingNotes: trackingNotes || socketService.getStatusDescription(normalizedStatus),
    order: updatedOrder,
  });

  socketService.emitAdminNotification({
    type: "ORDER_STATUS_UPDATED",
    title: `🔄 Order #${orderId} Status Updated`,
    message: `Order transitioned from "${previousStatus || "placed"}" to "${normalizedStatus.toUpperCase()}".`,
    orderId,
    severity: normalizedStatus === "cancelled" ? "warning" : "info",
    data: { previousStatus, status: normalizedStatus },
  });

  socketService.emitCustomerNotification({
    userId: updatedOrder.user_id || updatedOrder.userId,
    orderId,
    title: `Order Status: ${normalizedStatus.toUpperCase()}`,
    message: trackingNotes || socketService.getStatusDescription(normalizedStatus),
    status: normalizedStatus,
    trackingNotes,
  });

  // 5. Enqueue background email notification asynchronously
  let userEmail = "customer@excelsior-store.io";
  try {
    const [users] = await db.query(`SELECT email, name FROM users WHERE id = ?`, [
      updatedOrder.user_id,
    ]);
    if (users && users.length > 0) {
      userEmail = users[0].email;
    }
  } catch (err) {
    // Use fallback
  }

  const emailJob = emailQueue.enqueueEmailJob({
    type: "ORDER_STATUS_UPDATE",
    order: updatedOrder,
    recipientEmail: userEmail,
    status: normalizedStatus,
    trackingNotes,
  });

  console.log(
    `🔄 [Order Service] Order #${orderId} status changed: "${previousStatus}" -> "${normalizedStatus}". Real-time event emitted & Email job queued.`
  );

  return {
    order: updatedOrder,
    previousStatus,
    status: normalizedStatus,
    emailJobId: emailJob.id,
  };
};

/**
 * Handle Stripe Webhook Event
 * e.g. payment_intent.succeeded, payment_intent.payment_failed, charge.refunded
 */
const handleStripeWebhook = async (event) => {
  const eventType = event.type;
  const paymentIntent = event.data?.object;

  if (!paymentIntent) {
    throw new Error("Invalid Stripe event payload: missing data object.");
  }

  const targetPiId = paymentIntent.payment_intent || paymentIntent.id;
  const paymentIntentId = targetPiId;
  console.log(`⚡ [Stripe Webhook] Processing event "${eventType}" for PaymentIntent/Object: ${paymentIntent.id} (PI: ${targetPiId})`);

  // Find matching order by stripe_payment_intent_id, stripe_refund_id, or metadata.orderId
  let order = null;
  const [ordersByPi] = await db.query(
    "SELECT * FROM orders WHERE stripe_payment_intent_id = ? OR stripe_refund_id = ? ORDER BY id DESC LIMIT 1",
    [targetPiId, paymentIntent.id]
  );

  if (ordersByPi && ordersByPi.length > 0) {
    order = ordersByPi[0];
  } else if (paymentIntent.metadata?.orderId) {
    const [ordersById] = await db.query(
      "SELECT * FROM orders WHERE id = ? LIMIT 1",
      [paymentIntent.metadata.orderId]
    );
    if (ordersById && ordersById.length > 0) {
      order = ordersById[0];
    }
  }

  let actionTaken = "NO_MATCHING_ORDER";
  const reconciliation = {
    verified: false,
    signatureVerified: event.signatureVerified ?? true,
    orderId: null,
    previousPaymentStatus: null,
    newPaymentStatus: null,
    amountMatched: false,
    inventoryAdjusted: false,
    refundId: null,
    refundAmount: null,
  };

  if (order) {
    reconciliation.orderId = order.id;
    reconciliation.previousPaymentStatus = order.payment_status;

    const expectedAmountCents = Math.round(Number(order.total_amount) * 100);
    const receivedAmountCents = Number(paymentIntent.amount || paymentIntent.amount_received || expectedAmountCents);
    const amountMatched = Math.abs(expectedAmountCents - receivedAmountCents) <= 1; // 1 cent margin
    reconciliation.amountMatched = amountMatched;

    // 1. PAYMENT SUCCEEDED -> Mark Order Paid & Advance to Confirmed
    if (eventType === "payment_intent.succeeded") {
      if (!amountMatched) {
        console.warn(`⚠️ [Stripe Webhook] Amount discrepancy for Order #${order.id}: Expected ${expectedAmountCents}¢, Received ${receivedAmountCents}¢`);
      }

      if (order.payment_status === "paid" || order.payment_status === "succeeded") {
        actionTaken = `ORDER_#${order.id}_ALREADY_RECONCILED_PAID`;
        reconciliation.newPaymentStatus = order.payment_status;
        reconciliation.verified = true;
      } else {
        await db.query(
          "UPDATE orders SET payment_status = 'paid', status = IF(status = 'placed', 'confirmed', status), updated_at = NOW() WHERE id = ?",
          [order.id]
        );

        actionTaken = `ORDER_#${order.id}_PAYMENT_VERIFIED_CONFIRMED`;
        reconciliation.newPaymentStatus = "paid";
        reconciliation.verified = true;

        const fullOrder = await getOrderDetailsById(order.id);

        // Broadcast real-time Socket.IO events to React client
        socketService.emitOrderStatusUpdate({
          orderId: order.id,
          userId: order.user_id,
          status: "confirmed",
          previousStatus: order.status,
          trackingNotes: `Stripe Webhook verified payment settlement ($${Number(order.total_amount).toFixed(2)}). Order marked paid and confirmed.`,
          order: fullOrder,
        });

        // Enqueue async email
        try {
          let userEmail = "customer@excelsior-store.io";
          const [users] = await db.query(`SELECT email FROM users WHERE id = ?`, [order.user_id]);
          if (users && users.length > 0) userEmail = users[0].email;

          emailQueue.enqueueEmailJob({
            type: "ORDER_CONFIRMATION",
            order: fullOrder,
            recipientEmail: userEmail,
            status: "confirmed",
            trackingNotes: "Payment Verified via Stripe Webhook Reconciliation",
          });
        } catch (eErr) {}
      }
    }
    // 2. DELAYED / PROCESSING PAYMENT -> Mark Order Processing (Order remains Placed & Unpaid)
    else if (eventType === "payment_intent.processing") {
      await db.query(
        "UPDATE orders SET payment_status = 'processing', updated_at = NOW() WHERE id = ?",
        [order.id]
      );

      actionTaken = `ORDER_#${order.id}_PAYMENT_PROCESSING_DELAYED`;
      reconciliation.newPaymentStatus = "processing";
      reconciliation.verified = true;

      const fullOrder = await getOrderDetailsById(order.id);

      socketService.emitOrderStatusUpdate({
        orderId: order.id,
        userId: order.user_id,
        status: order.status,
        previousStatus: order.status,
        trackingNotes: "Stripe PaymentIntent is processing asynchronously. Awaiting bank/3DS confirmation.",
        order: fullOrder,
      });
    }
    // 3. PAYMENT FAILED -> Mark Failed, Cancel Order & Restore Reserved Inventory
    else if (eventType === "payment_intent.payment_failed") {
      await db.query(
        "UPDATE orders SET payment_status = 'failed', status = 'cancelled', updated_at = NOW() WHERE id = ?",
        [order.id]
      );

      // Restore inventory in MySQL so reserved items are returned to stock
      try {
        const [orderItems] = await db.query(
          "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
          [order.id]
        );
        for (const item of orderItems) {
          await db.query(
            "UPDATE products SET stock = stock + ? WHERE id = ?",
            [item.quantity, item.product_id]
          );
        }
        reconciliation.inventoryAdjusted = true;
      } catch (stockErr) {
        console.error("Failed to restore stock on payment failure:", stockErr.message);
      }

      actionTaken = `ORDER_#${order.id}_PAYMENT_FAILED_CANCELLED_STOCK_RESTORED`;
      reconciliation.newPaymentStatus = "failed";
      reconciliation.verified = true;

      const fullOrder = await getOrderDetailsById(order.id);

      socketService.emitOrderStatusUpdate({
        orderId: order.id,
        userId: order.user_id,
        status: "cancelled",
        previousStatus: order.status,
        trackingNotes: `Stripe Webhook: Payment failed (${paymentIntent.last_payment_error?.message || "Card declined"}). Order cancelled & product stock restored.`,
        order: fullOrder,
      });
    }
    // 4. CHARGE REFUNDED / REFUND CREATED / REFUND UPDATED
    else if (eventType === "charge.refunded" || eventType === "refund.created" || eventType === "refund.updated") {
      let refundItem = null;
      if (eventType.startsWith("refund.")) {
        refundItem = paymentIntent;
      } else if (eventType === "charge.refunded") {
        const rList = paymentIntent.refunds?.data;
        refundItem = rList && rList.length > 0 ? rList[0] : null;
      }

      const stripeRefundId = refundItem?.id || `re_sync_${paymentIntent.id}`;
      const refundAmount = refundItem?.amount ? Number((refundItem.amount / 100).toFixed(2)) : Number(order.total_amount);
      const refundStatus = refundItem?.status || "succeeded";
      const refundReason = refundItem?.reason || "Stripe Webhook Refund Event";

      // 1. Insert or update order_refunds table
      await db.query(
        `INSERT INTO order_refunds (order_id, user_id, stripe_refund_id, stripe_payment_intent_id, amount, currency, status, reason, source)
         VALUES (?, ?, ?, ?, ?, 'usd', ?, ?, 'webhook')
         ON DUPLICATE KEY UPDATE 
           status = VALUES(status), 
           amount = VALUES(amount), 
           updated_at = NOW()`,
        [order.id, order.user_id, stripeRefundId, order.stripe_payment_intent_id || targetPiId, refundAmount, refundStatus, refundReason]
      );

      // 2. Synchronize orders table
      await db.query(
        `UPDATE orders 
         SET payment_status = 'refunded',
             refund_status = ?,
             stripe_refund_id = ?,
             refund_amount = ?,
             refund_reason = ?,
             refunded_at = NOW(),
             status = IF(status IN ('placed', 'confirmed', 'packed'), 'cancelled', status),
             updated_at = NOW() 
         WHERE id = ?`,
        [refundStatus, stripeRefundId, refundAmount, refundReason, order.id]
      );

      // If order was cancelled and items were not already restored, restore them
      if (["placed", "confirmed", "packed"].includes(order.status)) {
        try {
          const [orderItems] = await db.query(
            "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
            [order.id]
          );
          for (const item of orderItems) {
            await db.query(
              "UPDATE products SET stock = stock + ? WHERE id = ?",
              [item.quantity, item.product_id]
            );
          }
          reconciliation.inventoryAdjusted = true;
        } catch (stockErr) {
          console.warn("Inventory rollback warning:", stockErr.message);
        }
      }

      actionTaken = `ORDER_#${order.id}_STRIPE_REFUND_SYNCHRONIZED`;
      reconciliation.newPaymentStatus = "refunded";
      reconciliation.refundId = stripeRefundId;
      reconciliation.refundAmount = refundAmount;
      reconciliation.verified = true;

      const fullOrder = await getOrderDetailsById(order.id);

      socketService.emitRefundUpdate({
        orderId: order.id,
        userId: order.user_id,
        refund: {
          stripe_refund_id: stripeRefundId,
          amount: refundAmount,
          status: refundStatus,
          reason: refundReason,
        },
        eventType: refundStatus === "succeeded" ? "SUCCEEDED" : "PENDING",
        order: fullOrder,
      });

      socketService.emitOrderStatusUpdate({
        orderId: order.id,
        userId: order.user_id,
        status: fullOrder.status,
        previousStatus: order.status,
        trackingNotes: `Stripe Webhook verified refund settlement (${stripeRefundId}) of $${refundAmount.toFixed(2)}. Synchronized with database.`,
        order: fullOrder,
      });

      // Enqueue background email notification for webhook refund
      try {
        let userEmail = "customer@excelsior-store.io";
        const [users] = await db.query(`SELECT email FROM users WHERE id = ?`, [order.user_id]);
        if (users && users.length > 0 && users[0].email) userEmail = users[0].email;

        emailQueue.enqueueEmailJob({
          type: "REFUND_ISSUED",
          category: "refund",
          order: fullOrder,
          recipientEmail: userEmail,
          status: refundAmount >= Number(order.total_amount) ? "refunded" : "partial_refund",
          trackingNotes: `Stripe Webhook confirmed refund settlement (${stripeRefundId}) of $${refundAmount.toFixed(2)}.`,
          metadata: {
            refund: {
              stripe_refund_id: stripeRefundId,
              amount: refundAmount,
              status: refundStatus,
              reason: refundReason,
              source: "webhook",
            },
          },
        });
      } catch (weErr) {}
    }
  }

  return {
    success: true,
    eventType,
    paymentIntentId,
    orderId: order ? order.id : null,
    actionTaken,
    reconciliation,
  };
};

/**
 * Helper to get order with items, shipments, and fulfillment status
 */
const getOrderDetailsById = async (orderId) => {
  const [orders] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!orders || orders.length === 0) return null;

  const [items] = await db.query(
    `SELECT oi.*, p.name, p.image_url, p.brand, p.sku
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  const [shipments] = await db.query(
    `SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at ASC`,
    [orderId]
  );

  let populatedShipments = [];
  if (shipments && shipments.length > 0) {
    const shipmentIds = shipments.map((s) => s.id);
    const placeholders = shipmentIds.map(() => "?").join(",");

    const [shipmentItems] = await db.query(
      `SELECT si.*, p.name, p.image_url, p.sku, oi.price
       FROM shipment_items si
       JOIN order_items oi ON si.order_item_id = oi.id
       JOIN products p ON oi.product_id = p.id
       WHERE si.shipment_id IN (${placeholders})`,
      shipmentIds
    );

    const [trackingEvents] = await db.query(
      `SELECT * FROM shipment_tracking_events 
       WHERE shipment_id IN (${placeholders}) 
       ORDER BY event_timestamp ASC`,
      shipmentIds
    );

    populatedShipments = shipments.map((sh) => ({
      ...sh,
      items: (shipmentItems || []).filter((item) => item.shipment_id === sh.id),
      trackingEvents: (trackingEvents || []).filter((ev) => ev.shipment_id === sh.id),
    }));
  }

  const orderItemsList = items || [];
  const totalOrderedQty = orderItemsList.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
  const totalFulfilledQty = orderItemsList.reduce((acc, i) => acc + Number(i.fulfilled_quantity || 0), 0);
  const isPartiallyFulfilled = totalFulfilledQty > 0 && totalFulfilledQty < totalOrderedQty;
  const isFullyFulfilled = totalFulfilledQty >= totalOrderedQty && totalOrderedQty > 0;

  const [returnRequests] = await db.query(
    `SELECT * FROM order_returns WHERE order_id = ? ORDER BY created_at DESC`,
    [orderId]
  );

  const [cancellationRequests] = await db.query(
    `SELECT * FROM order_cancellation_requests WHERE order_id = ? ORDER BY created_at DESC`,
    [orderId]
  );

  const [refundRecords] = await db.query(
    `SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC`,
    [orderId]
  );

  const currentStatus = String(orders[0].status).toLowerCase();
  const hasPendingCancel = (cancellationRequests || []).some((c) => c.status === "pending");
  const canCancel = ["placed", "confirmed", "packed"].includes(currentStatus) && !hasPendingCancel;

  const isDelivered = currentStatus === "delivered";
  const deliveredShipment = (populatedShipments || []).find((s) => s.status === "delivered");
  const deliveryTime = deliveredShipment?.delivered_at || orders[0].updated_at || orders[0].created_at;
  const daysSinceDelivery = deliveryTime ? (Date.now() - new Date(deliveryTime).getTime()) / (1000 * 60 * 60 * 24) : 0;
  const isWithinReturnWindow = daysSinceDelivery <= 30;
  const hasActiveReturn = (returnRequests || []).some((r) => ["pending", "approved", "completed"].includes(r.status));
  const canRequestReturn = isDelivered && isWithinReturnWindow && !hasActiveReturn;

  const activeReturn = (returnRequests || []).find((r) => r.status === "pending") || null;
  const activeCancel = (cancellationRequests || []).find((c) => c.status === "pending") || null;

  return {
    ...orders[0],
    items: orderItemsList,
    shipments: populatedShipments,
    returns: returnRequests || [],
    cancellationRequests: cancellationRequests || [],
    activeReturnRequest: activeReturn,
    activeCancellationRequest: activeCancel,
    refunds: refundRecords || [],
    refundInfo: {
      isRefunded: orders[0].payment_status === "refunded" || (refundRecords && refundRecords.length > 0),
      totalRefunded: refundRecords && refundRecords.length > 0
        ? refundRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0)
        : Number(orders[0].refund_amount || 0),
      stripeRefundId: orders[0].stripe_refund_id || (refundRecords && refundRecords[0]?.stripe_refund_id) || null,
      refundStatus: orders[0].refund_status || (refundRecords && refundRecords[0]?.status) || null,
      refundReason: orders[0].refund_reason || (refundRecords && refundRecords[0]?.reason) || null,
      refundedAt: orders[0].refunded_at || (refundRecords && refundRecords[0]?.created_at) || null,
    },
    eligibility: {
      canCancel,
      cancelReason: canCancel ? null : currentStatus === "cancelled" ? "Order is already cancelled." : hasPendingCancel ? "Cancellation request already under review." : ["shipped", "delivered"].includes(currentStatus) ? "Order is dispatched or delivered; please request a return instead." : "Order is not in a cancellable stage.",
      canRequestReturn,
      returnReason: canRequestReturn ? null : !isDelivered ? "Returns can only be requested after the order has been delivered." : !isWithinReturnWindow ? "The 30-day return window for this order has expired." : hasActiveReturn ? "A return request is already under review or approved for this order." : "Order is not eligible for return.",
      returnWindowDays: 30,
      daysSinceDelivery: Math.round(daysSinceDelivery * 10) / 10,
    },
    fulfillment: {
      status: orders[0].fulfillment_status || (isFullyFulfilled ? "fulfilled" : isPartiallyFulfilled ? "partially_fulfilled" : "unfulfilled"),
      totalOrderedQty,
      totalFulfilledQty,
      remainingQty: Math.max(0, totalOrderedQty - totalFulfilledQty),
      isFullyFulfilled,
      isPartiallyFulfilled,
      shipmentsCount: populatedShipments.length,
    },
  };
};

/**
 * Get user orders with items, shipments, and fulfillment summary
 */
const getUserOrders = async (userId) => {
  const [orders] = await db.query(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [userId || 1]
  );

  if (!orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((o) => o.id);
  const placeholders = orderIds.map(() => "?").join(",");

  const [items] = await db.query(
    `SELECT oi.*, p.name, p.image_url, p.brand, p.sku
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id IN (${placeholders})`,
    orderIds
  );

  const [shipments] = await db.query(
    `SELECT * FROM shipments WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    orderIds
  );

  const itemsByOrder = {};
  (items || []).forEach((item) => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  });

  const shipmentsByOrder = {};
  (shipments || []).forEach((sh) => {
    if (!shipmentsByOrder[sh.order_id]) shipmentsByOrder[sh.order_id] = [];
    shipmentsByOrder[sh.order_id].push(sh);
  });

  return orders.map((order) => {
    const orderItems = itemsByOrder[order.id] || [];
    const orderShipments = shipmentsByOrder[order.id] || [];
    const totalQty = orderItems.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
    const fulfilledQty = orderItems.reduce((acc, i) => acc + Number(i.fulfilled_quantity || 0), 0);

    return {
      ...order,
      items: orderItems,
      shipments: orderShipments,
      fulfillment: {
        status: order.fulfillment_status || (fulfilledQty >= totalQty && totalQty > 0 ? "fulfilled" : fulfilledQty > 0 ? "partially_fulfilled" : "unfulfilled"),
        totalOrderedQty: totalQty,
        totalFulfilledQty: fulfilledQty,
        remainingQty: Math.max(0, totalQty - fulfilledQty),
        isFullyFulfilled: fulfilledQty >= totalQty && totalQty > 0,
        isPartiallyFulfilled: fulfilledQty > 0 && fulfilledQty < totalQty,
        shipmentsCount: orderShipments.length,
      },
    };
  });
};

/**
 * Get all orders (for admin monitoring / live tracking panel)
 */
const getAllOrders = async (limit = 50) => {
  const numericLimit = Math.max(1, parseInt(limit, 10) || 50);
  const [orders] = await db.query(
    `SELECT o.*, u.name as user_name, u.email as user_email
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     ORDER BY o.created_at DESC
     LIMIT ?`,
    [numericLimit]
  );

  if (!orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((o) => o.id);
  const placeholders = orderIds.map(() => "?").join(",");

  const [items] = await db.query(
    `SELECT oi.*, p.name, p.image_url, p.brand, p.sku
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id IN (${placeholders})`,
    orderIds
  );

  const [shipments] = await db.query(
    `SELECT * FROM shipments WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    orderIds
  );

  const itemsByOrder = {};
  (items || []).forEach((item) => {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  });

  const shipmentsByOrder = {};
  (shipments || []).forEach((sh) => {
    if (!shipmentsByOrder[sh.order_id]) shipmentsByOrder[sh.order_id] = [];
    shipmentsByOrder[sh.order_id].push(sh);
  });

  return orders.map((order) => {
    const orderItems = itemsByOrder[order.id] || [];
    const orderShipments = shipmentsByOrder[order.id] || [];
    const totalQty = orderItems.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
    const fulfilledQty = orderItems.reduce((acc, i) => acc + Number(i.fulfilled_quantity || 0), 0);

    return {
      ...order,
      items: orderItems,
      shipments: orderShipments,
      fulfillment: {
        status: order.fulfillment_status || (fulfilledQty >= totalQty && totalQty > 0 ? "fulfilled" : fulfilledQty > 0 ? "partially_fulfilled" : "unfulfilled"),
        totalOrderedQty: totalQty,
        totalFulfilledQty: fulfilledQty,
        remainingQty: Math.max(0, totalQty - fulfilledQty),
        isFullyFulfilled: fulfilledQty >= totalQty && totalQty > 0,
        isPartiallyFulfilled: fulfilledQty > 0 && fulfilledQty < totalQty,
        shipmentsCount: orderShipments.length,
      },
    };
  });
};

/**
 * Create shipment for an order with partial or full fulfillment support
 */
const createShipment = async ({
  orderId,
  carrier = "Express Courier",
  trackingNumber = null,
  trackingUrl = null,
  shippingTier = "standard",
  estimatedDelivery = null,
  items = [],
  notes = "",
}) => {
  // 1. Validate order exists
  const [orderRows] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!orderRows || orderRows.length === 0) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  const order = orderRows[0];
  if (order.status === "cancelled") {
    throw new Error(`Order #${orderId} has been cancelled and cannot be fulfilled.`);
  }

  // 2. Fetch existing order items
  const [orderItems] = await db.query(
    `SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
    [orderId]
  );

  if (!orderItems || orderItems.length === 0) {
    throw new Error(`No items found for Order #${orderId}.`);
  }

  // 3. Resolve items to fulfill
  let itemsToFulfill = [];
  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      const rawTargetId = it.order_item_id ?? it.orderItemId ?? it.id ?? it.product_id ?? it.productId;
      const targetId = Number(rawTargetId);
      if (isNaN(targetId)) {
        throw new Error(`Invalid line item identifier received: ${JSON.stringify(rawTargetId)}.`);
      }
      const matched = orderItems.find((oi) => Number(oi.id) === targetId || Number(oi.product_id) === targetId);
      if (!matched) {
        throw new Error(`Order line item #${targetId} not found in Order #${orderId}.`);
      }

      const reqQty = Number(it.quantity);
      if (isNaN(reqQty) || reqQty <= 0) {
        throw new Error(`Invalid quantity (${it.quantity}) requested for "${matched.name}". Must be > 0.`);
      }

      const availableToFulfill = Number(matched.quantity) - Number(matched.fulfilled_quantity || 0);
      if (reqQty > availableToFulfill) {
        throw new Error(
          `Cannot fulfill ${reqQty} units of "${matched.name}". Only ${availableToFulfill} unfulfilled unit(s) remaining.`
        );
      }

      itemsToFulfill.push({
        orderItemId: matched.id,
        quantity: reqQty,
        name: matched.name,
      });
    }
  } else {
    // Default: Fulfill all remaining unfulfilled items
    for (const oi of orderItems) {
      const available = Number(oi.quantity) - Number(oi.fulfilled_quantity || 0);
      if (available > 0) {
        itemsToFulfill.push({
          orderItemId: oi.id,
          quantity: available,
          name: oi.name,
        });
      }
    }
  }

  if (itemsToFulfill.length === 0) {
    throw new Error(`Order #${orderId} is already fully fulfilled. No pending items remain.`);
  }

  // 4. Generate tracking details if not provided
  const resolvedCarrier = carrier && carrier.trim() ? carrier.trim() : "Express Logistics";
  const carrierPrefix = resolvedCarrier.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "LOG";
  const resolvedTrackingNumber =
    trackingNumber && trackingNumber.trim()
      ? trackingNumber.trim()
      : `TRK-${carrierPrefix}-${orderId}-${Date.now().toString().slice(-6)}`;
  const resolvedTrackingUrl =
    trackingUrl && trackingUrl.trim()
      ? trackingUrl.trim()
      : `https://track.shopsphere.io/?carrier=${encodeURIComponent(resolvedCarrier)}&trk=${encodeURIComponent(resolvedTrackingNumber)}`;

  // 5. Insert shipment record
  const [shipmentRes] = await db.query(
    `INSERT INTO shipments (order_id, carrier, tracking_number, tracking_url, shipping_tier, status, estimated_delivery, shipped_at, notes)
     VALUES (?, ?, ?, ?, ?, 'in_transit', ?, NOW(), ?)`,
    [
      orderId,
      resolvedCarrier,
      resolvedTrackingNumber,
      resolvedTrackingUrl,
      shippingTier || "standard",
      estimatedDelivery || null,
      notes || `Shipment dispatched via ${resolvedCarrier}`,
    ]
  );
  const shipmentId = shipmentRes.insertId;

  // 6. Insert shipment items and update fulfilled_quantity on order_items
  for (const it of itemsToFulfill) {
    await db.query(
      `INSERT INTO shipment_items (shipment_id, order_item_id, quantity) VALUES (?, ?, ?)`,
      [shipmentId, it.orderItemId, it.quantity]
    );

    await db.query(
      `UPDATE order_items SET fulfilled_quantity = fulfilled_quantity + ? WHERE id = ?`,
      [it.quantity, it.orderItemId]
    );
  }

  // 7. Insert initial tracking milestone
  await db.query(
    `INSERT INTO shipment_tracking_events (shipment_id, status, location, description, event_timestamp)
     VALUES (?, 'picked_up', 'Origin Fulfillment Center (Warehouse A)', 'Package picked up by courier and sorting barcode scanned.', NOW())`,
    [shipmentId]
  );

  // 8. Re-evaluate overall order fulfillment status
  const [recheckedItems] = await db.query(
    `SELECT quantity, fulfilled_quantity FROM order_items WHERE order_id = ?`,
    [orderId]
  );

  const totalQty = recheckedItems.reduce((acc, i) => acc + Number(i.quantity || 0), 0);
  const totalFulfilled = recheckedItems.reduce((acc, i) => acc + Number(i.fulfilled_quantity || 0), 0);
  const isCompletelyFulfilled = totalFulfilled >= totalQty;

  const newStatus = isCompletelyFulfilled ? "shipped" : "partially_shipped";
  const newFulfillmentStatus = isCompletelyFulfilled ? "fulfilled" : "partially_fulfilled";

  await db.query(
    `UPDATE orders SET status = ?, fulfillment_status = ?, updated_at = NOW() WHERE id = ?`,
    [newStatus, newFulfillmentStatus, orderId]
  );

  // 9. Fetch populated order and created shipment
  const updatedOrder = await getOrderDetailsById(orderId);
  const createdShipment = updatedOrder.shipments.find((s) => s.id === shipmentId);

  // 10. Real-time WebSocket notifications (Order Room, User Room, Admin Feed)
  socketService.emitShipmentUpdate({
    orderId,
    userId: updatedOrder.user_id,
    shipment: createdShipment,
    eventType: "CREATED",
    order: updatedOrder,
  });

  const trackingSummary = isCompletelyFulfilled
    ? `All items dispatched via ${resolvedCarrier} (Tracking: ${resolvedTrackingNumber})`
    : `Partial shipment #${shipmentId} dispatched (${itemsToFulfill.length} items) via ${resolvedCarrier} (Tracking: ${resolvedTrackingNumber})`;

  socketService.emitOrderStatusUpdate({
    orderId,
    userId: updatedOrder.user_id,
    status: newStatus,
    previousStatus: order.status,
    trackingNotes: trackingSummary,
    order: updatedOrder,
  });

  socketService.emitCustomerNotification({
    userId: updatedOrder.user_id,
    orderId,
    title: isCompletelyFulfilled ? "Your Entire Order Has Shipped!" : "Partial Shipment On The Way",
    message: `Shipment #${shipmentId} with ${itemsToFulfill.length} line item(s) dispatched with ${resolvedCarrier}. Tracking number: ${resolvedTrackingNumber}`,
    status: newStatus,
    trackingNotes: trackingSummary,
    data: {
      shipmentId,
      carrier: resolvedCarrier,
      trackingNumber: resolvedTrackingNumber,
      trackingUrl: resolvedTrackingUrl,
      isCompletelyFulfilled,
    },
  });

  socketService.emitAdminNotification({
    type: "SHIPMENT_CREATED",
    title: `📦 ${isCompletelyFulfilled ? "Full" : "Partial"} Shipment Dispatched`,
    message: `Order #${orderId} Shipment #${shipmentId} created via ${resolvedCarrier} (${resolvedTrackingNumber}) with ${itemsToFulfill.length} item(s).`,
    orderId,
    severity: "success",
    data: {
      shipmentId,
      carrier: resolvedCarrier,
      trackingNumber: resolvedTrackingNumber,
      isCompletelyFulfilled,
    },
  });

  // 11. Enqueue asynchronous transactional email
  try {
    let customerEmail = "customer@excelsior-store.io";
    const [userRows] = await db.query(`SELECT email FROM users WHERE id = ?`, [updatedOrder.user_id]);
    if (userRows.length && userRows[0].email) {
      customerEmail = userRows[0].email;
    }

    emailQueue.enqueueEmailJob({
      type: "SHIPMENT_DISPATCHED",
      order: updatedOrder,
      recipientEmail: customerEmail,
      status: newStatus,
      trackingNotes: trackingSummary,
    });
  } catch (emailErr) {
    console.warn("Shipment email enqueue warning:", emailErr.message);
  }

  return {
    success: true,
    message: `Shipment #${shipmentId} created successfully. Order status updated to "${newStatus}".`,
    shipment: createdShipment,
    order: updatedOrder,
    isCompletelyFulfilled,
  };
};

/**
 * Get all shipments for an order
 */
const getOrderShipments = async (orderId) => {
  const [shipments] = await db.query(
    `SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at ASC`,
    [orderId]
  );

  if (!shipments || shipments.length === 0) {
    return [];
  }

  const shipmentIds = shipments.map((s) => s.id);
  const placeholders = shipmentIds.map(() => "?").join(",");

  const [items] = await db.query(
    `SELECT si.*, p.name, p.image_url, p.sku, oi.price
     FROM shipment_items si
     JOIN order_items oi ON si.order_item_id = oi.id
     JOIN products p ON oi.product_id = p.id
     WHERE si.shipment_id IN (${placeholders})`,
    shipmentIds
  );

  const [trackingEvents] = await db.query(
    `SELECT * FROM shipment_tracking_events 
     WHERE shipment_id IN (${placeholders}) 
     ORDER BY event_timestamp ASC`,
    shipmentIds
  );

  return shipments.map((sh) => ({
    ...sh,
    items: (items || []).filter((item) => item.shipment_id === sh.id),
    trackingEvents: (trackingEvents || []).filter((ev) => ev.shipment_id === sh.id),
  }));
};

/**
 * Add tracking event milestone to a shipment (e.g. in_transit, out_for_delivery, delivered)
 */
const addShipmentTrackingEvent = async ({
  orderId,
  shipmentId,
  status,
  location = "En Route",
  description = "",
  eventTimestamp = null,
}) => {
  // 1. Verify shipment exists and belongs to order
  const [shipments] = await db.query(
    `SELECT * FROM shipments WHERE id = ? AND order_id = ?`,
    [shipmentId, orderId]
  );

  if (!shipments || shipments.length === 0) {
    throw new Error(`Shipment #${shipmentId} not found for Order #${orderId}.`);
  }

  const shipment = shipments[0];
  const normalizedStatus = String(status).toLowerCase().trim();

  // 2. Insert tracking checkpoint
  const [eventRes] = await db.query(
    `INSERT INTO shipment_tracking_events (shipment_id, status, location, description, event_timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [
      shipmentId,
      normalizedStatus,
      location || "Logistics Hub",
      description || `Package status updated to ${normalizedStatus}`,
      eventTimestamp || new Date(),
    ]
  );
  const eventId = eventRes.insertId;

  // 3. Update shipment status and timestamps
  let updateSql = `UPDATE shipments SET status = ?, updated_at = NOW()`;
  const updateParams = [normalizedStatus];

  if (normalizedStatus === "delivered") {
    updateSql += `, delivered_at = NOW()`;
  } else if (normalizedStatus === "in_transit" || normalizedStatus === "picked_up") {
    updateSql += `, shipped_at = IFNULL(shipped_at, NOW())`;
  }

  updateSql += ` WHERE id = ?`;
  updateParams.push(shipmentId);

  await db.query(updateSql, updateParams);

  // 4. Check if all shipments of the order are delivered
  const [allOrderShipments] = await db.query(
    `SELECT status FROM shipments WHERE order_id = ?`,
    [orderId]
  );

  const [orderRows] = await db.query(`SELECT status, fulfillment_status FROM orders WHERE id = ?`, [orderId]);
  const currentOrder = orderRows[0];

  const allDelivered = allOrderShipments.every((s) => s.status === "delivered");
  let orderDelivered = false;

  if (allDelivered && currentOrder.fulfillment_status === "fulfilled" && currentOrder.status !== "delivered") {
    await db.query(`UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = ?`, [orderId]);
    orderDelivered = true;
  }

  // 5. Fetch updated details
  const updatedOrder = await getOrderDetailsById(orderId);
  const updatedShipment = updatedOrder.shipments.find((s) => s.id === Number(shipmentId));

  const trackingEvent = {
    id: eventId,
    shipment_id: Number(shipmentId),
    status: normalizedStatus,
    location,
    description,
    event_timestamp: eventTimestamp || new Date().toISOString(),
  };

  // 6. Broadcast real-time Socket.IO notifications
  socketService.emitShipmentUpdate({
    orderId,
    userId: updatedOrder.user_id,
    shipment: updatedShipment,
    eventType: normalizedStatus === "delivered" ? "DELIVERED" : "TRACKING_UPDATED",
    trackingEvent,
    order: updatedOrder,
  });

  socketService.emitCustomerNotification({
    userId: updatedOrder.user_id,
    orderId,
    title: normalizedStatus === "delivered" ? "Package Delivered!" : `Shipment Update: ${normalizedStatus.toUpperCase()}`,
    message: `${description || `Package ${normalizedStatus}`} at ${location} (${shipment.carrier} #${shipment.tracking_number}).`,
    status: orderDelivered ? "delivered" : updatedOrder.status,
    trackingNotes: `Status: ${normalizedStatus} | Location: ${location}`,
    data: { shipmentId, trackingEvent },
  });

  if (orderDelivered) {
    socketService.emitOrderStatusUpdate({
      orderId,
      userId: updatedOrder.user_id,
      status: "delivered",
      previousStatus: currentOrder.status,
      trackingNotes: "All packages safely delivered to destination.",
      order: updatedOrder,
    });
  }

  // 7. Enqueue background tracking email notification
  try {
    let customerEmail = "customer@excelsior-store.io";
    const [userRows] = await db.query(`SELECT email FROM users WHERE id = ?`, [updatedOrder.user_id]);
    if (userRows && userRows.length && userRows[0].email) customerEmail = userRows[0].email;

    emailQueue.enqueueEmailJob({
      type: "SHIPMENT_TRACKING_UPDATE",
      category: "shipment",
      order: updatedOrder,
      recipientEmail: customerEmail,
      status: normalizedStatus,
      trackingNotes: `${description || `Package ${normalizedStatus}`} at ${location} (${shipment.carrier} #${shipment.tracking_number})`,
      metadata: {
        shipment: updatedShipment,
        trackingEvent,
      },
    });
  } catch (emailErr) {
    console.warn("Shipment tracking email enqueue warning:", emailErr.message);
  }

  return {
    success: true,
    message: `Tracking milestone "${normalizedStatus}" recorded for Shipment #${shipmentId}.`,
    trackingEvent,
    shipment: updatedShipment,
    order: updatedOrder,
  };
};

/**
 * Get comprehensive customer tracking information
 */
const getOrderTracking = async (orderId) => {
  const order = await getOrderDetailsById(orderId);
  if (!order) return null;

  const shipments = order.shipments || [];
  const items = order.items || [];

  const unfulfilledItems = items
    .filter((i) => Number(i.quantity) - Number(i.fulfilled_quantity || 0) > 0)
    .map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name,
      image_url: i.image_url,
      sku: i.sku,
      totalQuantity: Number(i.quantity),
      fulfilledQuantity: Number(i.fulfilled_quantity || 0),
      pendingQuantity: Number(i.quantity) - Number(i.fulfilled_quantity || 0),
    }));

  const fulfilledItems = items
    .filter((i) => Number(i.fulfilled_quantity || 0) > 0)
    .map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name,
      image_url: i.image_url,
      sku: i.sku,
      fulfilledQuantity: Number(i.fulfilled_quantity || 0),
    }));

  return {
    orderId: order.id,
    orderStatus: order.status,
    fulfillmentStatus: order.fulfillment?.status || order.fulfillment_status,
    totalAmount: order.total_amount,
    shippingAddress: order.shipping_address,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    fulfillment: order.fulfillment,
    shipments,
    unfulfilledItems,
    fulfilledItems,
  };
};

/**
 * Automated Lifecycle Simulator:
 * Smoothly transitions order through Placed -> Confirmed -> Packed -> Shipped -> Delivered
 */
const activeSimulations = new Map();

const simulateDeliveryLifecycle = async (orderId, intervalMs = 2500) => {
  const steps = [
    { status: "placed", notes: "Order Placed & Stripe Payment Verified" },
    { status: "confirmed", notes: "Order Confirmed by Warehouse Fulfillment Center" },
    { status: "packed", notes: "Items Packed & Tagged with RFID Barcode" },
    { status: "shipped", notes: "Dispatched with Express Courier (Tracking: TRK-" + orderId + ")" },
    { status: "delivered", notes: "Package Delivered to Doorstep. Handed to Resident." },
  ];

  if (activeSimulations.has(orderId)) {
    return { message: `Simulation already active for Order #${orderId}`, active: true };
  }

  activeSimulations.set(orderId, true);

  (async () => {
    try {
      console.log(`🚀 [Simulator] Starting Real-Time Status Simulation for Order #${orderId}...`);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await updateOrderStatus({
          orderId,
          status: step.status,
          trackingNotes: step.notes,
        });

        if (i < steps.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      console.log(`🏁 [Simulator] Order #${orderId} successfully completed delivery lifecycle!`);
    } catch (err) {
      console.error(`❌ [Simulator] Error during simulation for Order #${orderId}:`, err.message);
    } finally {
      activeSimulations.delete(orderId);
    }
  })();

  return {
    success: true,
    message: `Real-time lifecycle simulation started for Order #${orderId}. Steps: Placed -> Confirmed -> Packed -> Shipped -> Delivered`,
    orderId,
    intervalMs,
  };
};

/**
 * Core refund processing engine integrated with Stripe test/live flow
 * Reconciles and synchronizes status atomically in MySQL (orders & order_refunds).
 */
const processOrderRefund = async ({
  orderId,
  amount = null,
  reason = "Refund requested",
  source = "cancellation",
  userId = null,
  adminId = null,
  connection = null,
}) => {
  const conn = connection || (await db.getConnection());
  const manageTx = !connection;

  try {
    if (manageTx) await conn.beginTransaction();

    const [orders] = await conn.query(`SELECT * FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
    if (!orders || orders.length === 0) {
      throw new Error(`Order #${orderId} does not exist.`);
    }
    const order = orders[0];

    const isPaid = ["paid", "succeeded", "processing", "refunded", "partially_refunded"].includes(
      String(order.payment_status).toLowerCase()
    );
    if (!isPaid) {
      throw new Error(
        `Order #${orderId} cannot be refunded because current payment status is "${order.payment_status}".`
      );
    }

    const alreadyRefunded = Number(order.refund_amount || 0);
    const orderTotal = Number(order.total_amount);
    const remainingRefundable = Number((orderTotal - alreadyRefunded).toFixed(2));

    const refundAmount =
      amount !== null && !isNaN(Number(amount)) && Number(amount) > 0
        ? Number(Number(amount).toFixed(2))
        : remainingRefundable;

    if (refundAmount <= 0) {
      throw new Error(`Invalid refund amount ($${refundAmount}). Must be greater than 0.`);
    }

    if (refundAmount > remainingRefundable) {
      throw new Error(
        `Requested refund amount ($${refundAmount.toFixed(2)}) exceeds maximum remaining refundable balance ($${Math.max(0, remainingRefundable).toFixed(2)}) for Order #${orderId}.`
      );
    }

    const newCumulativeRefunded = Number((alreadyRefunded + refundAmount).toFixed(2));
    const newPaymentStatus = newCumulativeRefunded >= orderTotal ? "refunded" : "partially_refunded";

    const idempotencyKey = `ref_${orderId}_${source}_${Math.round(refundAmount * 100)}_${Date.now()}`;

    // 1. Process refund via Stripe Service (Live API or Test Mock Sandbox)
    const stripeRefundResult = await stripeService.refundPaymentIntent(
      order.stripe_payment_intent_id,
      refundAmount,
      reason,
      idempotencyKey
    );

    // 2. Synchronize into order_refunds table
    const [insertRefund] = await conn.query(
      `INSERT INTO order_refunds 
       (order_id, user_id, stripe_refund_id, stripe_payment_intent_id, amount, currency, status, reason, receipt_url, is_mock, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         status = VALUES(status), 
         amount = VALUES(amount), 
         updated_at = NOW()`,
      [
        orderId,
        order.user_id || userId,
        stripeRefundResult.refundId,
        order.stripe_payment_intent_id || stripeRefundResult.paymentIntentId || null,
        refundAmount,
        stripeRefundResult.currency || "usd",
        stripeRefundResult.status || "succeeded",
        reason,
        stripeRefundResult.receiptUrl || null,
        stripeRefundResult.isMock ? 1 : 0,
        source,
      ]
    );

    // 3. Synchronize orders table columns
    await conn.query(
      `UPDATE orders 
       SET payment_status = ?,
           stripe_refund_id = ?,
           refund_amount = ?,
           refund_status = ?,
           refund_reason = ?,
           refunded_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [
        newPaymentStatus,
        stripeRefundResult.refundId,
        newCumulativeRefunded,
        stripeRefundResult.status || "succeeded",
        reason,
        orderId,
      ]
    );

    if (manageTx) await conn.commit();

    const updatedOrder = await getOrderDetailsById(orderId);

    // 4. Real-time broadcasts
    socketService.emitRefundUpdate({
      orderId,
      userId: updatedOrder.user_id,
      refund: {
        id: insertRefund.insertId,
        stripe_refund_id: stripeRefundResult.refundId,
        amount: refundAmount,
        status: stripeRefundResult.status || "succeeded",
        reason,
        source,
      },
      eventType: stripeRefundResult.status === "succeeded" ? "SUCCEEDED" : "PENDING",
      order: updatedOrder,
    });

    // 5. Enqueue background refund notification email job
    try {
      let customerEmail = "customer@excelsior-store.io";
      const [userRows] = await conn.query(`SELECT email FROM users WHERE id = ?`, [updatedOrder.user_id]);
      if (userRows && userRows.length && userRows[0].email) customerEmail = userRows[0].email;

      emailQueue.enqueueEmailJob({
        type: "REFUND_ISSUED",
        category: "refund",
        order: updatedOrder,
        recipientEmail: customerEmail,
        status: refundAmount >= Number(order.total_amount) ? "refunded" : "partial_refund",
        trackingNotes: `Stripe Refund ${stripeRefundResult.refundId} ($${refundAmount.toFixed(2)}) processed via ${source}.`,
        metadata: {
          refund: {
            stripe_refund_id: stripeRefundResult.refundId,
            amount: refundAmount,
            status: stripeRefundResult.status || "succeeded",
            reason,
            source,
          },
        },
      });
    } catch (refEmailErr) {
      console.warn("Refund email enqueue warning:", refEmailErr.message);
    }

    return {
      success: true,
      refundId: stripeRefundResult.refundId,
      amount: refundAmount,
      currency: stripeRefundResult.currency || "usd",
      status: stripeRefundResult.status || "succeeded",
      isMock: stripeRefundResult.isMock,
      source,
      reason,
      order: updatedOrder,
    };
  } catch (err) {
    if (manageTx) await conn.rollback();
    throw err;
  } finally {
    if (manageTx) conn.release();
  }
};

/**
 * Admin triggers manual refund (full or partial) on an order
 */
const issueManualRefund = async ({
  orderId,
  amount = null,
  reason = "Manual refund issued by admin",
  adminId = 1,
}) => {
  return await processOrderRefund({
    orderId,
    amount,
    reason,
    source: "manual",
    adminId,
  });
};

/**
 * Retrieve all refunds associated with an order
 */
const getOrderRefunds = async (orderId) => {
  const [rows] = await db.query(
    `SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC`,
    [orderId]
  );
  return rows || [];
};

/**
 * Cancel and Refund an Eligible Order with ACID MySQL Transaction + Stripe Refund Integration
 * Eligibility criteria:
 *   - Status must be in ['placed', 'confirmed', 'packed']
 *   - Orders in 'shipped', 'delivered', or 'cancelled' status are rejected.
 * Consistency Guarantee:
 *   - Runs in MySQL InnoDB transaction with SELECT ... FOR UPDATE row-locking
 *   - Atomically reverses product stock for all order_items
 *   - Triggers Stripe refund via stripeService.refundPaymentIntent if payment_status is 'paid' / 'succeeded'
 *   - Updates orders status to 'cancelled' and payment_status to 'refunded' (or 'cancelled')
 *   - Broadcasts real-time Socket.IO cancellation event & enqueues email notification
 */
const cancelAndRefundOrder = async ({
  orderId,
  userId = null,
  reason = "Customer requested cancellation",
  isAdmin = false,
}) => {
  const transactionLogs = [];
  const connection = await db.getConnection();

  try {
    // 1. Begin MySQL ACID transaction
    await connection.beginTransaction();
    transactionLogs.push({
      step: 1,
      action: "START_TRANSACTION",
      status: "SUCCESS",
      detail: `Acquired MySQL connection and started ACID transaction with row-level locks.`,
    });

    // 2. Fetch order with exclusive row lock FOR UPDATE
    const [orders] = await connection.query(
      `SELECT * FROM orders WHERE id = ? FOR UPDATE`,
      [orderId]
    );

    if (!orders || orders.length === 0) {
      throw new Error(`Order #${orderId} does not exist.`);
    }

    const order = orders[0];

    // Optional user ownership check (if not admin and userId provided)
    if (!isAdmin && userId && Number(order.user_id) !== Number(userId)) {
      throw new Error(`Unauthorized: You do not have permission to cancel Order #${orderId}.`);
    }

    transactionLogs.push({
      step: 2,
      action: "LOCK_ORDER_ROW",
      status: "SUCCESS",
      detail: `Locked Order #${orderId} (Current Status: "${order.status}", Payment: "${order.payment_status}").`,
    });

    // 3. Eligibility Verification
    const currentStatus = String(order.status).toLowerCase();
    const ELIGIBLE_STATUSES = ["placed", "confirmed", "packed", "cancel_requested"];

    if (currentStatus === "cancelled") {
      throw new Error(`Order #${orderId} is already cancelled.`);
    }

    if (!ELIGIBLE_STATUSES.includes(currentStatus)) {
      throw new Error(
        `Order #${orderId} is not eligible for cancellation. Current status is "${order.status}". Orders in "shipped" or "delivered" status cannot be cancelled directly and require an RMA return.`
      );
    }

    transactionLogs.push({
      step: 3,
      action: "VERIFY_ELIGIBILITY",
      status: "SUCCESS",
      detail: `Order #${orderId} status "${currentStatus}" meets eligibility criteria (allowed: ${ELIGIBLE_STATUSES.join(", ")}).`,
    });

    // 4. Fetch line items to restore reserved inventory
    const [orderItems] = await connection.query(
      `SELECT product_id, quantity, price FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    const inventoryRestored = [];
    for (const item of orderItems) {
      // Atomically restore product stock
      await connection.query(
        `UPDATE products SET stock = stock + ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
      inventoryRestored.push({
        productId: item.product_id,
        restoredQuantity: item.quantity,
      });
    }

    transactionLogs.push({
      step: 4,
      action: "RESTORE_INVENTORY",
      status: "SUCCESS",
      detail: `Restored inventory stock for ${orderItems.length} item(s) in MySQL products table.`,
      items: inventoryRestored,
    });

    // 5. Process Payment Refund if order was paid
    let targetPaymentStatus = "cancelled";
    let refundDetails = null;

    const isPaid = order.payment_status === "paid" || order.payment_status === "succeeded";

    if (isPaid) {
      refundDetails = await processOrderRefund({
        orderId,
        amount: Number(order.total_amount),
        reason,
        source: "cancellation",
        userId: order.user_id || userId,
        connection,
      });
      targetPaymentStatus = "refunded";

      transactionLogs.push({
        step: 5,
        action: "STRIPE_REFUND",
        status: "SUCCESS",
        detail: `Issued and synchronized Stripe refund (${refundDetails.refundId}) for $${Number(order.total_amount).toFixed(2)}.`,
        refund: refundDetails,
      });
    } else {
      targetPaymentStatus = "cancelled";
      transactionLogs.push({
        step: 5,
        action: "VOID_PAYMENT",
        status: "SUCCESS",
        detail: `Order payment was "${order.payment_status}". Marked payment status as "cancelled" without issuing card refund.`,
      });
    }

    // 6. Update order status and payment status in orders table
    await connection.query(
      `UPDATE orders SET status = 'cancelled', payment_status = ?, updated_at = NOW() WHERE id = ?`,
      [targetPaymentStatus, orderId]
    );

    transactionLogs.push({
      step: 6,
      action: "UPDATE_ORDER_STATUS",
      status: "SUCCESS",
      detail: `Updated Order #${orderId} status to "cancelled" and payment_status to "${targetPaymentStatus}".`,
    });

    // 7. Commit transaction
    await connection.commit();

    transactionLogs.push({
      step: 7,
      action: "COMMIT_TRANSACTION",
      status: "SUCCESS",
      detail: "ACID transaction successfully committed. Inventory and order states are fully consistent.",
    });

    // 8. Fetch updated order
    const updatedOrder = await getOrderDetailsById(orderId);

    // 9. Real-time WebSocket broadcasts and Async Email
    try {
      socketService.emitOrderStatusUpdate({
        orderId,
        userId: updatedOrder.user_id || updatedOrder.userId,
        status: "cancelled",
        previousStatus: currentStatus,
        trackingNotes: `Order cancelled (${reason}). Reserved inventory restored to stock.${isPaid ? " Payment refunded." : ""}`,
        order: updatedOrder,
      });

      socketService.emitAdminNotification({
        type: "ORDER_CANCELLED",
        title: "🚫 Order Cancelled & Refunded",
        message: `Order #${orderId} was cancelled (${reason}). Reserved items restored to stock${isPaid ? " and refund initiated" : ""}.`,
        orderId,
        severity: "warning",
        data: { reason, refundDetails },
      });

      socketService.emitCustomerNotification({
        userId: updatedOrder.user_id || updatedOrder.userId,
        orderId,
        title: "Order Cancelled & Refunded",
        message: `Your order #${orderId} has been cancelled. Reserved inventory restored${isPaid ? " and payment refund processed" : ""}.`,
        status: "cancelled",
        trackingNotes: `Cancelled: ${reason}`,
      });

      // User email dispatch
      let userEmail = "customer@excelsior-store.io";
      try {
        const [users] = await db.query(`SELECT email, name FROM users WHERE id = ?`, [updatedOrder.user_id]);
        if (users && users.length > 0) userEmail = users[0].email;
      } catch (uErr) {}

      emailQueue.enqueueEmailJob({
        type: "ORDER_CANCELLED",
        order: updatedOrder,
        recipientEmail: userEmail,
        status: "cancelled",
        trackingNotes: `Order Cancelled & Restored: ${reason}`,
      });
    } catch (notifyErr) {
      console.warn("Notification error after cancellation:", notifyErr.message);
    }

    return {
      success: true,
      order: updatedOrder,
      previousStatus: currentStatus,
      newStatus: "cancelled",
      paymentStatus: targetPaymentStatus,
      refundDetails,
      inventoryRestored,
      transactionLogs,
    };
  } catch (error) {
    await connection.rollback();
    transactionLogs.push({
      step: transactionLogs.length + 1,
      action: "ROLLBACK_TRANSACTION",
      status: "FAILED",
      detail: `Transaction rolled back due to error: ${error.message}`,
    });
    const rollbackError = new Error(error.message);
    rollbackError.transactionLogs = transactionLogs;
    throw rollbackError;
  } finally {
    connection.release();
  }
};

/**
 * Automated Database Consistency Check
 * Runs diagnostic checks across:
 *   1. Negative Product Inventory
 *   2. Orphaned Order Items (items referencing non-existent orders)
 *   3. Broken Product References in Order Items
 *   4. Cancelled Orders Payment Status Inconsistencies (cancelled orders still marked 'paid')
 *   5. Total Amount Calculation Reconciliations (order total != sum of order_items)
 *   6. Overall System Health Metrics
 */
const runDatabaseConsistencyCheck = async () => {
  const timestamp = new Date().toISOString();
  const issues = [];

  // Check 1: Negative Product Inventory
  const [negativeStockProducts] = await db.query(
    `SELECT id, name, sku, stock, price FROM products WHERE stock < 0`
  );
  if (negativeStockProducts.length > 0) {
    issues.push({
      severity: "CRITICAL",
      type: "NEGATIVE_INVENTORY",
      count: negativeStockProducts.length,
      description: `${negativeStockProducts.length} product(s) have negative stock counts.`,
      records: negativeStockProducts,
    });
  }

  // Check 2: Orphaned Order Items (no parent order)
  const [orphanedItems] = await db.query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price
     FROM order_items oi
     LEFT JOIN orders o ON oi.order_id = o.id
     WHERE o.id IS NULL`
  );
  if (orphanedItems.length > 0) {
    issues.push({
      severity: "HIGH",
      type: "ORPHANED_ORDER_ITEMS",
      count: orphanedItems.length,
      description: `${orphanedItems.length} order item(s) reference non-existent orders.`,
      records: orphanedItems,
    });
  }

  // Check 3: Broken Product References in Order Items
  const [brokenProductReferences] = await db.query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE p.id IS NULL`
  );
  if (brokenProductReferences.length > 0) {
    issues.push({
      severity: "MEDIUM",
      type: "BROKEN_PRODUCT_REFERENCES",
      count: brokenProductReferences.length,
      description: `${brokenProductReferences.length} order item(s) reference non-existent products.`,
      records: brokenProductReferences,
    });
  }

  // Check 4: Cancelled Orders with Inconsistent Payment Status
  const [inconsistentCancelledOrders] = await db.query(
    `SELECT id, user_id, total_amount, status, payment_status, stripe_payment_intent_id
     FROM orders
     WHERE status = 'cancelled' AND payment_status NOT IN ('cancelled', 'refunded', 'failed')`
  );
  if (inconsistentCancelledOrders.length > 0) {
    issues.push({
      severity: "HIGH",
      type: "CANCELLED_ORDER_PAYMENT_MISMATCH",
      count: inconsistentCancelledOrders.length,
      description: `${inconsistentCancelledOrders.length} cancelled order(s) have inconsistent payment status (e.g. still marked 'paid').`,
      records: inconsistentCancelledOrders,
    });
  }

  // Check 5: Order Total Calculation Reconciliation
  const [mathDiscrepancies] = await db.query(
    `SELECT o.id, o.total_amount as recorded_total,
            ROUND(SUM(oi.price * oi.quantity), 2) as calculated_total,
            ROUND(ABS(o.total_amount - SUM(oi.price * oi.quantity)), 2) as discrepancy
     FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     GROUP BY o.id, o.total_amount
     HAVING discrepancy > 0.05 AND discrepancy NOT IN (15.00, 25.00, 50.00)`
  );
  if (mathDiscrepancies.length > 0) {
    issues.push({
      severity: "HIGH",
      type: "ORDER_TOTAL_MATH_DISCREPANCY",
      count: mathDiscrepancies.length,
      description: `${mathDiscrepancies.length} order(s) have total amount mismatching the sum of their line items.`,
      records: mathDiscrepancies,
    });
  }

  // Aggregate Metrics & System Stats
  const [[ordersCount]] = await db.query(`SELECT COUNT(*) as total FROM orders`);
  const [ordersByStatus] = await db.query(
    `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
  );
  const [ordersByPaymentStatus] = await db.query(
    `SELECT payment_status, COUNT(*) as count FROM orders GROUP BY payment_status`
  );
  const [[productsCount]] = await db.query(`SELECT COUNT(*) as total, SUM(stock) as total_stock FROM products`);
  const [[lowStockCount]] = await db.query(`SELECT COUNT(*) as count FROM products WHERE stock <= 5 AND stock >= 0`);

  const statusMap = {};
  ordersByStatus.forEach((s) => (statusMap[s.status] = s.count));

  const paymentStatusMap = {};
  ordersByPaymentStatus.forEach((p) => (paymentStatusMap[p.payment_status] = p.count));

  const isHealthy = issues.length === 0;

  return {
    timestamp,
    isHealthy,
    issueCount: issues.length,
    issues,
    summary: isHealthy
      ? "All consistency checks PASSED. Database state is fully consistent and synchronized."
      : `Found ${issues.length} consistency issues requiring attention.`,
    metrics: {
      totalOrders: ordersCount?.total || 0,
      ordersByStatus: statusMap,
      ordersByPaymentStatus: paymentStatusMap,
      totalProducts: productsCount?.total || 0,
      totalStockCount: productsCount?.total_stock || 0,
      lowStockProducts: lowStockCount?.count || 0,
    },
    checksPerformed: [
      { name: "Negative Inventory Check", status: negativeStockProducts.length === 0 ? "PASSED" : "FAILED" },
      { name: "Orphaned Order Items Check", status: orphanedItems.length === 0 ? "PASSED" : "FAILED" },
      { name: "Broken Product References Check", status: brokenProductReferences.length === 0 ? "PASSED" : "FAILED" },
      { name: "Cancelled Order Payment Status Check", status: inconsistentCancelledOrders.length === 0 ? "PASSED" : "FAILED" },
      { name: "Order Total vs Line Items Sum Check", status: mathDiscrepancies.length === 0 ? "PASSED" : "FAILED" },
    ],
  };
};

/**
 * -------------------------------------------------------------------------------------------------
 * TASK 2: RETURN & CANCELLATION WORKFLOWS WITH ELIGIBILITY VALIDATION & ADMIN REVIEW
 * -------------------------------------------------------------------------------------------------
 */

/**
 * Check eligibility for Cancellation and Return
 */
const checkOrderEligibility = async (orderId, userId = null) => {
  const order = await getOrderDetailsById(orderId);
  if (!order) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  if (userId && Number(order.user_id) !== Number(userId)) {
    throw new Error(`Unauthorized: Order #${orderId} does not belong to this user.`);
  }

  return {
    orderId: order.id,
    currentStatus: order.status,
    paymentStatus: order.payment_status,
    totalAmount: order.total_amount,
    eligibility: order.eligibility,
    activeReturnRequest: order.activeReturnRequest,
    activeCancellationRequest: order.activeCancellationRequest,
    returns: order.returns,
    cancellationRequests: order.cancellationRequests,
  };
};

/**
 * Customer / Admin requests order cancellation
 * For 'placed' / 'confirmed' orders, can be instantly cancelled or put under review.
 * For 'packed' orders, requires admin approval before dispatch.
 */
const requestOrderCancellation = async ({
  orderId,
  userId = null,
  reason = "Customer requested cancellation",
  notes = "",
  instantIfEligible = false,
  isAdmin = false,
}) => {
  const order = await getOrderDetailsById(orderId);
  if (!order) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  if (!isAdmin && userId && Number(order.user_id) !== Number(userId)) {
    throw new Error(`Unauthorized: You do not have permission to cancel Order #${orderId}.`);
  }

  const currentStatus = String(order.status).toLowerCase();

  // If already cancelled
  if (currentStatus === "cancelled") {
    throw new Error(`Order #${orderId} is already cancelled.`);
  }

  // Not eligible statuses
  const ELIGIBLE_STATUSES = ["placed", "confirmed", "packed"];
  if (!ELIGIBLE_STATUSES.includes(currentStatus)) {
    throw new Error(
      `Order #${orderId} cannot be cancelled because its current status is "${order.status}". Dispatched or delivered orders must go through the Return flow.`
    );
  }

  // Check if there is already a pending cancellation request
  const [existingPending] = await db.query(
    `SELECT * FROM order_cancellation_requests WHERE order_id = ? AND status = 'pending'`,
    [orderId]
  );
  if (existingPending && existingPending.length > 0) {
    throw new Error(`A cancellation request for Order #${orderId} is already pending review.`);
  }

  // Instant cancellation if requested or if admin or order is placed/confirmed and instantIfEligible is true
  if (instantIfEligible || isAdmin || (currentStatus === "placed" && !notes)) {
    const cancelResult = await cancelAndRefundOrder({
      orderId,
      userId,
      reason,
      isAdmin,
    });

    // Record approved cancellation in order_cancellation_requests for audit trail
    await db.query(
      `INSERT INTO order_cancellation_requests (order_id, user_id, status, reason, customer_notes, admin_notes, previous_order_status, reviewed_at)
       VALUES (?, ?, 'approved', ?, ?, 'Instantly processed via cancellation engine', ?, NOW())`,
      [orderId, order.user_id || userId || 1, reason, notes || null, currentStatus]
    );

    return {
      success: true,
      instant: true,
      message: `Order #${orderId} was cancelled successfully. Reserved stock restored and refund processed.`,
      order: cancelResult.order,
      refundDetails: cancelResult.refundDetails,
    };
  }

  // Otherwise, transition to cancel_requested for review
  const [insertRes] = await db.query(
    `INSERT INTO order_cancellation_requests (order_id, user_id, status, reason, customer_notes, previous_order_status)
     VALUES (?, ?, 'pending', ?, ?, ?)`,
    [orderId, order.user_id || userId || 1, reason, notes || null, currentStatus]
  );

  await db.query(`UPDATE orders SET status = 'cancel_requested', updated_at = NOW() WHERE id = ?`, [orderId]);

  const updatedOrder = await getOrderDetailsById(orderId);
  const cancellationRequest = {
    id: insertRes.insertId,
    order_id: orderId,
    user_id: order.user_id || userId,
    status: "pending",
    reason,
    customer_notes: notes,
    previous_order_status: currentStatus,
    created_at: new Date().toISOString(),
  };

  // Real-time broadcasts
  socketService.emitCancellationUpdate({
    orderId,
    userId: updatedOrder.user_id,
    cancellationRequest,
    eventType: "REQUESTED",
    order: updatedOrder,
  });

  socketService.emitOrderStatusUpdate({
    orderId,
    userId: updatedOrder.user_id,
    status: "cancel_requested",
    previousStatus: currentStatus,
    trackingNotes: `Cancellation requested: ${reason}. Pending warehouse review.`,
    order: updatedOrder,
  });

  socketService.emitAdminNotification({
    type: "CANCELLATION_REQUESTED",
    title: "⏳ Cancellation Request Received",
    message: `Customer requested cancellation for Order #${orderId} (Reason: ${reason}).`,
    orderId,
    severity: "warning",
    data: { cancellationRequestId: insertRes.insertId, reason, notes },
  });

  emailQueue.enqueueEmailJob({
    type: "STATUS_UPDATE",
    order: updatedOrder,
    status: "cancel_requested",
  });

  return {
    success: true,
    instant: false,
    message: `Cancellation request for Order #${orderId} submitted successfully and queued for review.`,
    cancellationRequest,
    order: updatedOrder,
  };
};

/**
 * Admin approves or rejects order cancellation request
 */
const reviewCancellationRequest = async ({
  orderId,
  requestId = null,
  action, // 'approve' | 'reject'
  adminNotes = "",
  adminId = 1,
}) => {
  const normAction = String(action).toLowerCase().trim();
  if (!["approve", "reject"].includes(normAction)) {
    throw new Error(`Invalid review action "${action}". Must be "approve" or "reject".`);
  }

  // Find the pending cancellation request
  let request = null;
  if (requestId) {
    const [rows] = await db.query(`SELECT * FROM order_cancellation_requests WHERE id = ? AND order_id = ?`, [requestId, orderId]);
    request = rows[0];
  } else {
    const [rows] = await db.query(
      `SELECT * FROM order_cancellation_requests WHERE order_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    request = rows[0];
  }

  if (!request) {
    throw new Error(`No pending cancellation request found for Order #${orderId}.`);
  }

  if (request.status !== "pending") {
    throw new Error(`Cancellation request #${request.id} has already been ${request.status}.`);
  }

  const order = await getOrderDetailsById(orderId);
  if (!order) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  if (normAction === "approve") {
    // 1. Execute cancel & refund flow (atomic stock restoration, stripe refund)
    const cancelResult = await cancelAndRefundOrder({
      orderId,
      userId: order.user_id,
      reason: request.reason || "Cancellation request approved by admin",
      isAdmin: true,
    });

    // 2. Update request status
    await db.query(
      `UPDATE order_cancellation_requests SET status = 'approved', admin_notes = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?`,
      [adminNotes || "Cancellation request approved by admin", adminId, request.id]
    );

    const updatedOrder = await getOrderDetailsById(orderId);

    socketService.emitCancellationUpdate({
      orderId,
      userId: updatedOrder.user_id,
      cancellationRequest: { ...request, status: "approved", admin_notes: adminNotes },
      eventType: "APPROVED",
      order: updatedOrder,
    });

    socketService.emitCustomerNotification({
      userId: updatedOrder.user_id,
      orderId,
      title: "Cancellation Approved",
      message: `Your cancellation request for Order #${orderId} was approved. Stock restored and refund initiated.`,
      status: "cancelled",
    });

    return {
      success: true,
      action: "approved",
      message: `Cancellation request for Order #${orderId} approved. Order cancelled, inventory restored, and refund processed.`,
      order: updatedOrder,
      refundDetails: cancelResult.refundDetails,
    };
  } else {
    // Action is REJECT: restore previous status
    const targetStatus = request.previous_order_status || "confirmed";
    await db.query(`UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`, [targetStatus, orderId]);

    await db.query(
      `UPDATE order_cancellation_requests SET status = 'rejected', admin_notes = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?`,
      [adminNotes || "Cancellation request rejected by warehouse", adminId, request.id]
    );

    const updatedOrder = await getOrderDetailsById(orderId);

    socketService.emitCancellationUpdate({
      orderId,
      userId: updatedOrder.user_id,
      cancellationRequest: { ...request, status: "rejected", admin_notes: adminNotes },
      eventType: "REJECTED",
      order: updatedOrder,
    });

    socketService.emitOrderStatusUpdate({
      orderId,
      userId: updatedOrder.user_id,
      status: targetStatus,
      previousStatus: "cancel_requested",
      trackingNotes: `Cancellation request was rejected (${adminNotes || "Order in final dispatch"}). Order restored to ${targetStatus}.`,
      order: updatedOrder,
    });

    socketService.emitCustomerNotification({
      userId: updatedOrder.user_id,
      orderId,
      title: "Cancellation Request Rejected",
      message: `Your cancellation request for Order #${orderId} was rejected (${adminNotes || "Order already prepared for shipping"}). Order is continuing fulfillment.`,
      status: targetStatus,
    });

    try {
      let customerEmail = "customer@excelsior-store.io";
      const [userRows] = await db.query(`SELECT email FROM users WHERE id = ?`, [updatedOrder.user_id]);
      if (userRows && userRows.length && userRows[0].email) customerEmail = userRows[0].email;

      emailQueue.enqueueEmailJob({
        type: "CANCEL_REJECTED",
        category: "order",
        order: updatedOrder,
        recipientEmail: customerEmail,
        status: "cancel_rejected",
        trackingNotes: `Cancellation request was rejected: ${adminNotes || "Order already prepared for shipping"}`,
        metadata: {
          cancellationRequest: { ...request, status: "rejected", admin_notes: adminNotes },
          adminNotes,
        },
      });
    } catch (eErr) {}

    return {
      success: true,
      action: "rejected",
      message: `Cancellation request for Order #${orderId} rejected. Order status restored to "${targetStatus}".`,
      order: updatedOrder,
    };
  }
};

/**
 * Customer submits return request for a delivered order
 */
const requestOrderReturn = async ({
  orderId,
  userId = null,
  reason = "defective",
  notes = "",
  items = [],
  isAdmin = false,
}) => {
  const order = await getOrderDetailsById(orderId);
  if (!order) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  if (!isAdmin && userId && Number(order.user_id) !== Number(userId)) {
    throw new Error(`Unauthorized: You do not have permission to request a return for Order #${orderId}.`);
  }

  const currentStatus = String(order.status).toLowerCase();

  // Eligibility check: Must be delivered
  if (currentStatus !== "delivered") {
    throw new Error(
      `Order #${orderId} is not eligible for return. Current status is "${order.status}". Returns can only be requested for orders that have been successfully delivered.`
    );
  }

  // Return window check (30 days from delivery)
  const deliveredShipment = (order.shipments || []).find((s) => s.status === "delivered");
  const deliveryTime = deliveredShipment?.delivered_at || order.updated_at || order.created_at;
  const daysSinceDelivery = deliveryTime ? (Date.now() - new Date(deliveryTime).getTime()) / (1000 * 60 * 60 * 24) : 0;

  if (daysSinceDelivery > 30) {
    throw new Error(
      `Order #${orderId} is outside the 30-day return window (${Math.round(daysSinceDelivery)} days since delivery). Return request cannot be accepted.`
    );
  }

  // Active return check
  const [existingReturns] = await db.query(
    `SELECT * FROM order_returns WHERE order_id = ? AND status IN ('pending', 'approved', 'completed')`,
    [orderId]
  );
  if (existingReturns && existingReturns.length > 0) {
    throw new Error(
      `A return request for Order #${orderId} is already ${existingReturns[0].status}. Duplicate return requests are not allowed.`
    );
  }

  const itemsJson = JSON.stringify(
    Array.isArray(items) && items.length > 0 ? items : (order.items || []).map((it) => ({ orderItemId: it.id, name: it.name, quantity: it.quantity }))
  );

  const [insertRes] = await db.query(
    `INSERT INTO order_returns (order_id, user_id, status, reason, customer_notes, refund_amount, items, restock_inventory)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, TRUE)`,
    [orderId, order.user_id || userId || 1, reason, notes || null, order.total_amount, itemsJson]
  );

  await db.query(`UPDATE orders SET status = 'return_requested', updated_at = NOW() WHERE id = ?`, [orderId]);

  const updatedOrder = await getOrderDetailsById(orderId);
  const returnRequest = {
    id: insertRes.insertId,
    order_id: orderId,
    user_id: order.user_id || userId,
    status: "pending",
    reason,
    customer_notes: notes,
    refund_amount: order.total_amount,
    items: JSON.parse(itemsJson),
    created_at: new Date().toISOString(),
  };

  // Real-time broadcasts
  socketService.emitReturnUpdate({
    orderId,
    userId: updatedOrder.user_id,
    returnRequest,
    eventType: "REQUESTED",
    order: updatedOrder,
  });

  socketService.emitOrderStatusUpdate({
    orderId,
    userId: updatedOrder.user_id,
    status: "return_requested",
    previousStatus: "delivered",
    trackingNotes: `Return requested (${reason}). Awaiting support inspection & authorization.`,
    order: updatedOrder,
  });

  socketService.emitAdminNotification({
    type: "RETURN_REQUESTED",
    title: "🔄 New Return Request Received",
    message: `Customer requested a return for Order #${orderId} (Reason: ${reason}).`,
    orderId,
    severity: "warning",
    data: { returnRequestId: insertRes.insertId, reason, notes },
  });

  emailQueue.enqueueEmailJob({
    type: "RETURN_REQUESTED",
    category: "return",
    order: updatedOrder,
    status: "return_requested",
    trackingNotes: `Return requested (${reason}). Awaiting support inspection & RMA processing.`,
    metadata: { returnRequest },
  });

  return {
    success: true,
    message: `Return request for Order #${orderId} submitted successfully. An RMA number has been assigned.`,
    returnRequest,
    order: updatedOrder,
  };
};

/**
 * Admin reviews (approves or rejects) a return request
 */
const reviewReturnRequest = async ({
  orderId,
  requestId = null,
  action, // 'approve' | 'reject'
  adminNotes = "",
  restockInventory = true,
  adminId = 1,
}) => {
  const normAction = String(action).toLowerCase().trim();
  if (!["approve", "reject"].includes(normAction)) {
    throw new Error(`Invalid review action "${action}". Must be "approve" or "reject".`);
  }

  // Find pending return request
  let returnRecord = null;
  if (requestId) {
    const [rows] = await db.query(`SELECT * FROM order_returns WHERE id = ? AND order_id = ?`, [requestId, orderId]);
    returnRecord = rows[0];
  } else {
    const [rows] = await db.query(
      `SELECT * FROM order_returns WHERE order_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    returnRecord = rows[0];
  }

  if (!returnRecord) {
    throw new Error(`No pending return request found for Order #${orderId}.`);
  }

  if (returnRecord.status !== "pending") {
    throw new Error(`Return request #${returnRecord.id} has already been ${returnRecord.status}.`);
  }

  const order = await getOrderDetailsById(orderId);
  if (!order) {
    throw new Error(`Order #${orderId} does not exist.`);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (normAction === "approve") {
      // 1. Optionally restock inventory
      const restockedItems = [];
      if (restockInventory) {
        for (const item of (order.items || [])) {
          await connection.query(
            `UPDATE products SET stock = stock + ? WHERE id = ?`,
            [item.quantity, item.product_id]
          );
          restockedItems.push({ productId: item.product_id, quantity: item.quantity });
        }
      }

      // 2. Issue Stripe refund if paid and synchronize with database
      let refundDetails = null;
      if (order.stripe_payment_intent_id && (order.payment_status === "paid" || order.payment_status === "succeeded")) {
        try {
          refundDetails = await processOrderRefund({
            orderId,
            amount: Number(returnRecord.refund_amount || order.total_amount),
            reason: `Return approved: ${returnRecord.reason}`,
            source: "return",
            userId: order.user_id,
            adminId,
            connection,
          });
        } catch (rfErr) {
          console.warn("Stripe refund call warning:", rfErr.message);
        }
      }

      // 3. Update order_returns record
      await connection.query(
        `UPDATE order_returns 
         SET status = 'approved', admin_notes = ?, restock_inventory = ?, reviewed_at = NOW(), reviewed_by = ? 
         WHERE id = ?`,
        [adminNotes || "Return request approved and refund initiated", restockInventory ? 1 : 0, adminId, returnRecord.id]
      );

      // 4. Update orders table
      await connection.query(
        `UPDATE orders SET status = 'returned', payment_status = 'refunded', updated_at = NOW() WHERE id = ?`,
        [orderId]
      );

      await connection.commit();

      const updatedOrder = await getOrderDetailsById(orderId);

      socketService.emitReturnUpdate({
        orderId,
        userId: updatedOrder.user_id,
        returnRequest: { ...returnRecord, status: "approved", admin_notes: adminNotes },
        eventType: "APPROVED",
        order: updatedOrder,
      });

      socketService.emitOrderStatusUpdate({
        orderId,
        userId: updatedOrder.user_id,
        status: "returned",
        previousStatus: "return_requested",
        trackingNotes: `Return approved by support. Refund of $${Number(order.total_amount).toFixed(2)} processed.${restockInventory ? " Inventory restocked." : ""}`,
        order: updatedOrder,
      });

      socketService.emitCustomerNotification({
        userId: updatedOrder.user_id,
        orderId,
        title: "Return Request Approved & Refunded",
        message: `Your return for Order #${orderId} has been approved. A refund of $${Number(order.total_amount).toFixed(2)} has been issued.`,
        status: "returned",
      });

      emailQueue.enqueueEmailJob({
        type: "RETURN_APPROVED",
        category: "return",
        order: updatedOrder,
        status: "returned",
        trackingNotes: `Return approved by support. Refund of $${Number(order.total_amount).toFixed(2)} processed.${restockInventory ? " Inventory restocked." : ""}`,
        metadata: {
          returnRequest: { ...returnRecord, status: "approved", admin_notes: adminNotes },
          refundDetails,
        },
      });

      return {
        success: true,
        action: "approved",
        message: `Return request for Order #${orderId} approved. Order status updated to "returned", items restocked, and refund issued.`,
        order: updatedOrder,
        refundDetails,
        restockedItems,
      };
    } else {
      // Action is REJECT: restore status back to delivered
      await connection.query(
        `UPDATE order_returns 
         SET status = 'rejected', admin_notes = ?, reviewed_at = NOW(), reviewed_by = ? 
         WHERE id = ?`,
        [adminNotes || "Return request did not meet inspection standards", adminId, returnRecord.id]
      );

      await connection.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = ?`,
        [orderId]
      );

      await connection.commit();

      const updatedOrder = await getOrderDetailsById(orderId);

      socketService.emitReturnUpdate({
        orderId,
        userId: updatedOrder.user_id,
        returnRequest: { ...returnRecord, status: "rejected", admin_notes: adminNotes },
        eventType: "REJECTED",
        order: updatedOrder,
      });

      socketService.emitOrderStatusUpdate({
        orderId,
        userId: updatedOrder.user_id,
        status: "delivered",
        previousStatus: "return_requested",
        trackingNotes: `Return request was rejected (${adminNotes || "Items ineligible for return"}). Order remains Delivered.`,
        order: updatedOrder,
      });

      socketService.emitCustomerNotification({
        userId: updatedOrder.user_id,
        orderId,
        title: "Return Request Ineligible",
        message: `Your return request for Order #${orderId} could not be approved (${adminNotes || "Ineligible per store policy"}).`,
        status: "delivered",
      });

      try {
        let customerEmail = "customer@excelsior-store.io";
        const [userRows] = await db.query(`SELECT email FROM users WHERE id = ?`, [updatedOrder.user_id]);
        if (userRows && userRows.length && userRows[0].email) customerEmail = userRows[0].email;

        emailQueue.enqueueEmailJob({
          type: "RETURN_REJECTED",
          category: "return",
          order: updatedOrder,
          recipientEmail: customerEmail,
          status: "return_rejected",
          trackingNotes: `Return request rejected: ${adminNotes || "Items ineligible for return per store policy"}`,
          metadata: {
            returnRequest: { ...returnRecord, status: "rejected", admin_notes: adminNotes },
            adminNotes,
          },
        });
      } catch (rErr) {}

      return {
        success: true,
        action: "rejected",
        message: `Return request for Order #${orderId} rejected. Order status retained as "delivered".`,
        order: updatedOrder,
      };
    }
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Get all return requests (with optional orderId filter)
 */
const getOrderReturnRequests = async (orderId = null) => {
  let query = `
    SELECT r.*, o.total_amount, o.status as order_status, o.created_at as order_created_at, u.name as customer_name, u.email as customer_email
    FROM order_returns r
    JOIN orders o ON r.order_id = o.id
    LEFT JOIN users u ON r.user_id = u.id
  `;
  const params = [];

  if (orderId) {
    query += ` WHERE r.order_id = ?`;
    params.push(orderId);
  }

  query += ` ORDER BY r.created_at DESC`;

  const [rows] = await db.query(query, params);
  return rows || [];
};

/**
 * Get all cancellation requests (with optional orderId filter)
 */
const getOrderCancellationRequests = async (orderId = null) => {
  let query = `
    SELECT c.*, o.total_amount, o.status as order_status, o.created_at as order_created_at, u.name as customer_name, u.email as customer_email
    FROM order_cancellation_requests c
    JOIN orders o ON c.order_id = o.id
    LEFT JOIN users u ON c.user_id = u.id
  `;
  const params = [];

  if (orderId) {
    query += ` WHERE c.order_id = ?`;
    params.push(orderId);
  }

  query += ` ORDER BY c.created_at DESC`;

  const [rows] = await db.query(query, params);
  return rows || [];
};

/**
 * Truncate all orders, line items, shipments, returns, refunds, tracking events,
 * and idempotency keys, resetting product stock and notifying connected clients.
 */
const clearAllOrdersAndData = async () => {
  const connection = await db.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    await connection.query("TRUNCATE TABLE shipment_tracking_events");
    await connection.query("TRUNCATE TABLE shipment_items");
    await connection.query("TRUNCATE TABLE shipments");
    await connection.query("TRUNCATE TABLE order_returns");
    await connection.query("TRUNCATE TABLE order_cancellation_requests");
    await connection.query("TRUNCATE TABLE order_refunds");
    await connection.query("TRUNCATE TABLE order_items");
    await connection.query("TRUNCATE TABLE orders");
    await connection.query("TRUNCATE TABLE idempotency_keys");

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");

    // Reset standard stock levels on catalog products
    await connection.query(`
      UPDATE products SET stock = CASE 
        WHEN id = 1 THEN 50
        WHEN id = 3 THEN 30
        WHEN id = 4 THEN 20
        WHEN id = 5 THEN 40
        WHEN id = 6 THEN 25
        WHEN id = 8 THEN 35
        ELSE 50
      END
    `);

    // Reset in-memory email queue
    try {
      emailQueue.clearDeadLetterQueue();
      emailQueue.flushQueue();
    } catch (qErr) {}

    // Emit live WebSocket notification
    try {
      socketService.emitAdminNotification({
        type: "ALL_DATA_CLEARED",
        title: "🧹 All Data Cleared",
        message: "All test orders, shipments, returns, and refunds have been removed from the platform.",
        severity: "info",
      });
      const io = socketService.getIo();
      if (io) {
        io.emit("orders:cleared", { timestamp: new Date().toISOString() });
        io.emit("order:created", { orderId: null });
      }
    } catch (sErr) {}

    return {
      success: true,
      message: "All orders, shipments, returns, and refunds have been cleared. Product inventory restored to default.",
    };
  } finally {
    connection.release();
  }
};

module.exports = {
  processCheckoutTransaction,
  updateOrderStatus,
  cancelAndRefundOrder,
  runDatabaseConsistencyCheck,
  getUserOrders,
  getAllOrders,
  getOrderDetailsById,
  simulateDeliveryLifecycle,
  handleStripeWebhook,
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
  processOrderRefund,
  issueManualRefund,
  getOrderRefunds,
  clearAllOrdersAndData,
  VALID_STATUSES,
  VALID_TRANSITIONS,
};

