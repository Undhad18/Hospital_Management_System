const { Server } = require("socket.io");

let ioInstance = null;

/**
 * Initialize Socket.IO with HTTP Server and configure CORS
 */
function initSocket(httpServer) {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  ioInstance = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.includes("localhost") || origin.includes("127.0.0.1")) {
          callback(null, true);
        } else {
          callback(null, true); // Allow during development
        }
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  ioInstance.on("connection", (socket) => {
    console.log(`🔌 [Socket.IO] Client connected: ${socket.id} (Total: ${ioInstance.engine.clientsCount})`);

    // Client can join order-specific room for private order updates
    socket.on("join:order", (orderId) => {
      const room = `order_${orderId}`;
      socket.join(room);
      console.log(`📦 [Socket.IO] Socket ${socket.id} joined room: ${room}`);
      socket.emit("joined:room", { room, orderId, timestamp: new Date().toISOString() });
    });

    // Client can leave order room
    socket.on("leave:order", (orderId) => {
      const room = `order_${orderId}`;
      socket.leave(room);
      console.log(`👋 [Socket.IO] Socket ${socket.id} left room: ${room}`);
    });

    // Client can join user room for all orders of that user
    socket.on("join:user", (userId) => {
      const room = `user_${userId}`;
      socket.join(room);
      console.log(`👤 [Socket.IO] Socket ${socket.id} joined user room: ${room}`);
    });

    // Admin dashboard room
    socket.on("join:admin", () => {
      socket.join("admin_feed");
      console.log(`🛡️ [Socket.IO] Socket ${socket.id} joined admin room: admin_feed`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`❌ [Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return ioInstance;
}

/**
 * Get active io instance
 */
function getIo() {
  if (!ioInstance) {
    console.warn("⚠️ [Socket.IO] getIo called before initialization!");
  }
  return ioInstance;
}

/**
 * Emit order status update event to relevant rooms and globally
 */
function emitOrderStatusUpdate({ orderId, userId, status, previousStatus, trackingNotes, order, timestamp }) {
  if (!ioInstance) return;

  const eventPayload = {
    orderId: Number(orderId),
    userId: userId ? Number(userId) : undefined,
    status,
    previousStatus,
    trackingNotes: trackingNotes || getStatusDescription(status),
    order,
    timestamp: timestamp || new Date().toISOString(),
  };

  // 1. Emit to order-specific room
  ioInstance.to(`order_${orderId}`).emit("order:status_updated", eventPayload);

  // 2. Emit to user room if available
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("order:status_updated", eventPayload);
  }

  // 3. Emit to admin room
  ioInstance.to("admin_feed").emit("order:status_updated", eventPayload);

  // 4. Global broadcast for connected order trackers
  ioInstance.emit("order:status_updated", eventPayload);

  console.log(`⚡ [Socket.IO Broadcast] Order #${orderId} status -> "${status.toUpperCase()}" emitted to clients.`);
}

/**
 * Emit new order created event
 */
function emitOrderCreated({ order }) {
  if (!ioInstance || !order) return;

  const eventPayload = {
    orderId: order.id,
    userId: order.userId || order.user_id,
    order,
    status: order.status || "placed",
    timestamp: new Date().toISOString(),
  };

  ioInstance.to("admin_feed").emit("order:created", eventPayload);
  ioInstance.emit("order:created", eventPayload);

  if (order.userId || order.user_id) {
    ioInstance.to(`user_${order.userId || order.user_id}`).emit("order:created", eventPayload);
  }

  console.log(`⚡ [Socket.IO Broadcast] New Order #${order.id} placed.`);
}

/**
 * Emit dedicated Admin Notification with severity and metadata
 */
function emitAdminNotification({ type, title, message, orderId, jobId, severity = "info", data = {} }) {
  if (!ioInstance) return null;

  const payload = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: type || "INFO",
    title,
    message,
    orderId: orderId ? Number(orderId) : null,
    jobId: jobId || null,
    severity, // 'info' | 'success' | 'warning' | 'error'
    data,
    read: false,
    timestamp: new Date().toISOString(),
  };

  // Deliver once to admin_feed room
  ioInstance.to("admin_feed").emit("admin:notification", payload);

  console.log(`🔔 [Socket.IO Admin Notification] [${severity.toUpperCase()}] ${title}: ${message}`);
  return payload;
}

/**
 * Emit dedicated Customer Status Update Notification
 */
function emitCustomerNotification({ userId, orderId, title, message, status, trackingNotes, data = {} }) {
  if (!ioInstance) return null;

  const payload = {
    id: `cnotif_${orderId}_${status}_${Date.now()}`,
    type: "ORDER_STATUS_NOTIFICATION",
    userId: userId ? Number(userId) : null,
    orderId: Number(orderId),
    title,
    message,
    status,
    trackingNotes,
    data,
    read: false,
    timestamp: new Date().toISOString(),
  };

  // Deliver once: to targeted user room if logged in, or order room, or global fallback
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("customer:notification", payload);
  } else if (orderId) {
    ioInstance.to(`order_${orderId}`).emit("customer:notification", payload);
  } else {
    ioInstance.emit("customer:notification", payload);
  }

  console.log(`📦 [Socket.IO Customer Notification] Order #${orderId} -> "${status?.toUpperCase()}": ${message}`);
  return payload;
}

/**
 * Emit background email queue progress event
 */
function emitEmailQueueEvent(eventData) {
  if (!ioInstance) return;

  ioInstance.emit("queue:email_dispatched", {
    ...eventData,
    timestamp: new Date().toISOString(),
  });
}

function getStatusDescription(status) {
  const map = {
    placed: "Order received and payment recorded.",
    confirmed: "Order confirmed by warehouse team. Inventory reserved.",
    packed: "Items quality-checked and securely packaged.",
    partially_shipped: "Part of your order has been dispatched. Remaining items in preparation.",
    shipped: "Dispatched with express courier. In transit.",
    delivered: "Package successfully delivered to recipient.",
    cancelled: "Order was cancelled and refund initiated.",
    cancel_requested: "Cancellation requested by customer. Pending warehouse review.",
    cancel_rejected: "Cancellation request was reviewed and rejected. Delivery continuing.",
    return_requested: "Return request submitted. Under review by support team.",
    return_approved: "Return request approved. Refund scheduled and return authorized.",
    returned: "Item returned safely to warehouse. Refund completed.",
    return_rejected: "Return request was reviewed and rejected based on eligibility criteria.",
  };
  return map[status?.toLowerCase()] || `Status updated to ${status}`;
}

/**
 * Emit shipment creation or tracking update event
 */
function emitShipmentUpdate({ orderId, userId, shipment, eventType = "CREATED", trackingEvent = null, order = null }) {
  if (!ioInstance) return null;

  const payload = {
    orderId: Number(orderId),
    userId: userId ? Number(userId) : undefined,
    shipment,
    eventType, // "CREATED" | "TRACKING_UPDATED" | "DELIVERED"
    trackingEvent,
    order,
    timestamp: new Date().toISOString(),
  };

  if (orderId) {
    ioInstance.to(`order_${orderId}`).emit("order:shipment_updated", payload);
  }
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("order:shipment_updated", payload);
  }
  ioInstance.to("admin_feed").emit("order:shipment_updated", payload);
  ioInstance.emit("order:shipment_updated", payload);

  console.log(`📦 [Socket.IO Shipment] Order #${orderId} Shipment #${shipment?.id || "N/A"} [${eventType}] emitted.`);
  return payload;
}

/**
 * Emit return request creation or admin review event
 */
function emitReturnUpdate({ orderId, userId, returnRequest, eventType = "REQUESTED", order = null }) {
  if (!ioInstance) return null;

  const payload = {
    orderId: Number(orderId),
    userId: userId ? Number(userId) : undefined,
    returnRequest,
    eventType, // "REQUESTED" | "APPROVED" | "REJECTED"
    order,
    timestamp: new Date().toISOString(),
  };

  if (orderId) {
    ioInstance.to(`order_${orderId}`).emit("order:return_updated", payload);
  }
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("order:return_updated", payload);
  }
  ioInstance.to("admin_feed").emit("order:return_updated", payload);
  ioInstance.emit("order:return_updated", payload);

  console.log(`🔄 [Socket.IO Return] Order #${orderId} Return #${returnRequest?.id || "N/A"} [${eventType}] emitted.`);
  return payload;
}

/**
 * Emit cancellation request creation or admin review event
 */
function emitCancellationUpdate({ orderId, userId, cancellationRequest, eventType = "REQUESTED", order = null }) {
  if (!ioInstance) return null;

  const payload = {
    orderId: Number(orderId),
    userId: userId ? Number(userId) : undefined,
    cancellationRequest,
    eventType, // "REQUESTED" | "APPROVED" | "REJECTED"
    order,
    timestamp: new Date().toISOString(),
  };

  if (orderId) {
    ioInstance.to(`order_${orderId}`).emit("order:cancellation_updated", payload);
  }
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("order:cancellation_updated", payload);
  }
  ioInstance.to("admin_feed").emit("order:cancellation_updated", payload);
  ioInstance.emit("order:cancellation_updated", payload);

  console.log(`🚫 [Socket.IO Cancellation] Order #${orderId} Cancellation #${cancellationRequest?.id || "N/A"} [${eventType}] emitted.`);
  return payload;
}

/**
 * Emit refund event (full, partial, or webhook synchronized)
 */
function emitRefundUpdate({ orderId, userId, refund, eventType = "SUCCEEDED", order = null }) {
  if (!ioInstance) return null;

  const payload = {
    orderId: Number(orderId),
    userId: userId ? Number(userId) : undefined,
    refund,
    eventType, // "SUCCEEDED" | "FAILED" | "PENDING"
    order,
    timestamp: new Date().toISOString(),
  };

  if (orderId) {
    ioInstance.to(`order_${orderId}`).emit("order:refund_updated", payload);
  }
  if (userId) {
    ioInstance.to(`user_${userId}`).emit("order:refund_updated", payload);
  }
  ioInstance.to("admin_feed").emit("order:refund_updated", payload);
  ioInstance.emit("order:refund_updated", payload);

  console.log(`💳 [Socket.IO Refund] Order #${orderId} Refund #${refund?.stripe_refund_id || refund?.refundId || "N/A"} [${eventType}] emitted.`);
  return payload;
}

module.exports = {
  initSocket,
  getIo,
  emitOrderStatusUpdate,
  emitOrderCreated,
  emitEmailQueueEvent,
  emitAdminNotification,
  emitCustomerNotification,
  emitShipmentUpdate,
  emitReturnUpdate,
  emitCancellationUpdate,
  emitRefundUpdate,
  getStatusDescription,
};

