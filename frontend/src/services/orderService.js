/**
 * Order & Checkout Service
 * Powered by OpenAPI & Direct REST Endpoints for ACID Transactions, Stripe, & Idempotency.
 */
import { ordersApi } from "../api";

const BASE_URL = "http://localhost:5000/api/orders";

const getAuthHeaders = (customHeaders = {}) => {
  const token =
    localStorage.getItem("mern_auth_token") ||
    localStorage.getItem("token") ||
    null;
  const headers = { "Content-Type": "application/json", ...customHeaders };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * Create Stripe PaymentIntent with server-verified total & idempotency
 * @param {Object} paymentData - { cartItems, shippingAddress, userId }
 * @param {string} idempotencyKey - Unique transaction key
 */
export const createPaymentIntent = async (paymentData, idempotencyKey = null) => {
  try {
    const custom = {};
    if (idempotencyKey) {
      custom["Idempotency-Key"] = idempotencyKey;
    }
    const headers = getAuthHeaders(custom);
    const res = await fetch(`${BASE_URL}/create-payment-intent`, {
      method: "POST",
      headers,
      body: JSON.stringify(paymentData),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to initialize Stripe PaymentIntent",
    };
  }
};

/**
 * Execute Cart Checkout with ACID MySQL Transaction + Idempotency Protection
 * @param {Object} checkoutData - { cartItems, shippingAddress, paymentMethod, paymentIntentId, userId }
 * @param {string} idempotencyKey - Client-provided idempotency key
 */
export const checkout = async (checkoutData, idempotencyKey = null) => {
  try {
    const key = idempotencyKey || checkoutData.idempotencyKey;
    const custom = {};
    if (key) {
      custom["Idempotency-Key"] = key;
    }
    const headers = getAuthHeaders(custom);

    const res = await fetch(`${BASE_URL}/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify(checkoutData),
    });

    const data = await res.json();
    if (!res.ok && !data.success) {
      const err = new Error(data.message || "Failed to execute checkout transaction");
      err.transactionLogs = data.transactionLogs || [];
      throw err;
    }
    return data;
  } catch (error) {
    if (error.transactionLogs) throw error;
    throw new Error(error.message || "Network error during checkout transaction");
  }
};

/**
 * Simulate a Stripe Webhook Event (e.g. payment_intent.succeeded)
 */
export const simulateStripeWebhook = async ({
  eventType = "payment_intent.succeeded",
  paymentIntentId,
  orderId,
  amount,
}) => {
  try {
    const res = await fetch(`${BASE_URL}/simulate-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, paymentIntentId, orderId, amount }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to simulate Stripe webhook",
    };
  }
};

/**
 * Get Idempotency Records for Admin Dashboard Inspection
 */
export const getIdempotencyKeys = async (limit = 50) => {
  try {
    const res = await fetch(`${BASE_URL}/idempotency-keys?limit=${limit}`);
    return await res.json();
  } catch (error) {
    return {
      success: false,
      data: [],
    };
  }
};

/**
 * Get user orders history
 */
export const getMyOrders = async () => {
  try {
    return await ordersApi.getMyOrders();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch orders",
      data: [],
    };
  }
};

/**
 * Get all orders (admin / global stream)
 */
export const getAllOrders = async (limit = 50) => {
  try {
    return await ordersApi.getAllOrders(limit);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch all orders",
      data: [],
    };
  }
};

/**
 * Get single order details
 */
export const getOrderById = async (id) => {
  try {
    return await ordersApi.getOrderById(id);
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch order details",
      data: null,
    };
  }
};

/**
 * Update order status (triggers real-time WebSocket broadcast + background email queue)
 */
export const updateOrderStatus = async (id, status, trackingNotes = "") => {
  try {
    return await ordersApi.updateOrderStatus(id, { status, trackingNotes });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to update order status",
    };
  }
};

/**
 * Start automated real-time status simulation (Placed -> Confirmed -> Packed -> Shipped -> Delivered)
 */
export const simulateOrderFlow = async (id, intervalMs = 2500) => {
  try {
    return await ordersApi.simulateOrderStatusFlow(id, { intervalMs });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to trigger simulation",
    };
  }
};

/**
 * Cancel and Refund an Order with ACID inventory reversal
 * @param {number|string} id - Order ID
 * @param {string} reason - Cancellation reason
 * @param {boolean} isAdmin - Admin override flag
 */
export const cancelOrder = async (id, reason = "Customer requested cancellation", isAdmin = false) => {
  try {
    const res = await fetch(`${BASE_URL}/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, isAdmin }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to cancel order",
    };
  }
};

/**
 * Run Automated Database Consistency and Integrity Checks
 */
export const checkDatabaseConsistency = async () => {
  try {
    const res = await fetch(`${BASE_URL}/consistency/check`);
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to run database consistency check",
    };
  }
};

/**
 * Clear All Old Test Orders, Shipments, Returns, and Refunds
 */
export const clearAllOrderData = async () => {
  try {
    const res = await fetch(`${BASE_URL}/clear-all-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to clear order data",
    };
  }
};

/**
 * Get background email queue metrics & stats
 */
export const getEmailQueueStats = async () => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/stats`);
    return await res.json();
  } catch (error) {
    return {
      success: false,
      data: { pendingJobs: 0, deadLetterJobs: 0, totalProcessed: 0, totalSucceeded: 0, totalFailed: 0 },
    };
  }
};

/**
 * Get background email queue job history
 */
export const getEmailQueueLogs = async (limit = 30) => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/logs?limit=${limit}`);
    return await res.json();
  } catch (error) {
    return {
      success: false,
      data: [],
    };
  }
};

/**
 * Get Dead-Letter Queue items
 */
export const getDeadLetterQueue = async (limit = 20) => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/dlq?limit=${limit}`);
    return await res.json();
  } catch (error) {
    return {
      success: false,
      data: [],
    };
  }
};

/**
 * Re-queue all jobs from Dead-Letter Queue
 */
export const retryAllDeadLetterJobs = async () => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/dlq/retry-all`, {
      method: "POST",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to retry all DLQ jobs",
    };
  }
};

/**
 * Clear all jobs from Dead-Letter Queue
 */
export const clearDeadLetterQueue = async () => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/dlq`, {
      method: "DELETE",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to clear Dead-Letter Queue",
    };
  }
};

/**
 * Retry a failed or dead-letter email notification job
 */
export const retryEmailJob = async (jobId) => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/jobs/${jobId}/retry`, {
      method: "POST",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to retry email job",
    };
  }
};

/**
 * Configure fault injection simulation
 */
export const configureFaultInjection = async (config) => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/fault-injection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to configure fault injection",
    };
  }
};

/**
 * Trigger a simulated email notification job (for live demo & testing)
 */
export const triggerSimulatedEmailJob = async (payload) => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to trigger simulated email job",
    };
  }
};

/**
 * Flush all pending jobs in email queue
 */
export const flushEmailQueue = async () => {
  try {
    const res = await fetch(`${BASE_URL}/email-queue/flush`, {
      method: "POST",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to flush email queue",
    };
  }
};

/**
 * Create Razorpay Order with server-verified stock and total
 * @param {Object} orderData - { cartItems, shippingAddress, userId, currency }
 */
export const createRazorpayOrder = async (orderData) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/razorpay/create-order`, {
      method: "POST",
      headers,
      body: JSON.stringify(orderData),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to initialize Razorpay order",
    };
  }
};

/**
 * Verify Razorpay payment signature & execute ACID checkout transaction
 * @param {Object} paymentData - { razorpayOrderId, razorpayPaymentId, razorpaySignature, cartItems, shippingAddress, idempotencyKey, userId }
 */
export const verifyRazorpayCheckout = async (paymentData) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/razorpay/verify-and-checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify(paymentData),
    });
    const data = await res.json();
    if (!res.ok && !data.success) {
      const err = new Error(data.message || "Failed to verify Razorpay checkout");
      err.transactionLogs = data.transactionLogs || [];
      throw err;
    }
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Create Shipment (supports partial fulfillment or full fulfillment)
 * @param {number|string} orderId
 * @param {Object} shipmentData - { carrier, trackingNumber, trackingUrl, shippingTier, estimatedDelivery, items, notes }
 */
export const createShipment = async (orderId, shipmentData = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/shipments`, {
      method: "POST",
      headers,
      body: JSON.stringify(shipmentData),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to create shipment",
    };
  }
};

/**
 * Get all shipments for an order
 * @param {number|string} orderId
 */
export const getOrderShipments = async (orderId) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/shipments`, {
      method: "GET",
      headers,
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch shipments",
      data: [],
    };
  }
};

/**
 * Add tracking milestone event to shipment
 * @param {number|string} orderId
 * @param {number|string} shipmentId
 * @param {Object} eventData - { status, location, description, eventTimestamp }
 */
export const addShipmentTrackingEvent = async (orderId, shipmentId, eventData = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/shipments/${shipmentId}/tracking`, {
      method: "POST",
      headers,
      body: JSON.stringify(eventData),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to add tracking event",
    };
  }
};

/**
 * Get comprehensive customer tracking view
 * @param {number|string} orderId
 */
export const getOrderTracking = async (orderId) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/tracking`, {
      method: "GET",
      headers,
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to fetch tracking details",
      data: null,
    };
  }
};

/**
 * Check order eligibility for return or cancellation
 */
export const checkOrderEligibility = async (orderId) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/eligibility`, {
      method: "GET",
      headers,
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to check eligibility",
    };
  }
};

/**
 * Submit cancellation request for an order
 */
export const requestOrderCancellation = async (orderId, { reason, notes, instantIfEligible } = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/cancel-request`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason, notes, instantIfEligible }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to submit cancellation request",
    };
  }
};

/**
 * Admin review (approve or reject) cancellation request
 */
export const reviewCancellationRequest = async (orderId, { requestId, action, adminNotes } = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/cancel-request/review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requestId, action, adminNotes }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to review cancellation request",
    };
  }
};

/**
 * Submit return request for a delivered order
 */
export const requestOrderReturn = async (orderId, { reason, notes, items } = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/return-request`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason, notes, items }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to submit return request",
    };
  }
};

/**
 * Admin review (approve or reject) return request
 */
export const reviewReturnRequest = async (orderId, { requestId, action, adminNotes, restockInventory = true } = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/return-request/review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requestId, action, adminNotes, restockInventory }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to review return request",
    };
  }
};

/**
 * Fetch all return requests (Admin)
 */
export const getReturnRequests = async (orderId = null) => {
  try {
    const headers = getAuthHeaders();
    const url = orderId ? `${BASE_URL}/requests/returns?orderId=${orderId}` : `${BASE_URL}/requests/returns`;
    const res = await fetch(url, { method: "GET", headers });
    return await res.json();
  } catch (error) {
    return { success: false, data: [] };
  }
};

/**
 * Fetch all cancellation requests (Admin)
 */
export const getCancellationRequests = async (orderId = null) => {
  try {
    const headers = getAuthHeaders();
    const url = orderId ? `${BASE_URL}/requests/cancellations?orderId=${orderId}` : `${BASE_URL}/requests/cancellations`;
    const res = await fetch(url, { method: "GET", headers });
    return await res.json();
  } catch (error) {
    return { success: false, data: [] };
  }
};

/**
 * Issue manual Stripe refund on an order (Admin)
 */
export const issueOrderRefund = async (orderId, { amount, reason } = {}) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/refund`, {
      method: "POST",
      headers,
      body: JSON.stringify({ amount, reason }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: error.message || "Failed to process refund",
    };
  }
};

/**
 * Fetch all refund records for an order
 */
export const getOrderRefunds = async (orderId) => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${BASE_URL}/${orderId}/refunds`, {
      method: "GET",
      headers,
    });
    return await res.json();
  } catch (error) {
    return { success: false, data: [] };
  }
};



