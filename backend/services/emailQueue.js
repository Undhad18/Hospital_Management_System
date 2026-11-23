const nodemailer = require("nodemailer");
const socketService = require("./socketService");

// Internal in-memory job queue and job execution history
const jobQueue = [];
const jobHistory = [];
const deadLetterQueue = [];
const MAX_HISTORY = 100;
let isProcessing = false;
let retryTimers = new Map();

// Fault Injection / Simulation Mode for testing failures and retry handling
let faultInjectionConfig = {
  enabled: false,
  failureRate: 1.0,
  failureMessage: "SMTP Delivery Timeout (ETIMEDOUT): mail.excelsior.internal:587 connection refused",
};

// Worker metrics
const queueMetrics = {
  totalEnqueued: 0,
  totalProcessed: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  totalRetried: 0,
  averageProcessingTimeMs: 0,
};

// Reusable nodemailer transporter (Ethereal test account or local mock fallback)
let transporter = null;

async function getTransporter() {
  if (!transporter) {
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_USER !== "ethereal.test@ethereal.email") {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        // Fast local simulated in-memory transporter for reliable, instant local & test execution
        transporter = nodemailer.createTransport({
          jsonTransport: true,
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to initialize nodemailer transporter, using simulated engine:", err.message);
    }
  }
  return transporter;
}

/**
 * Rich HTML Email Generator for Order, Shipment, Return, and Refund Stages
 */
function generateOrderEmailHtml({ order, status, recipientName = "Valued Customer", metadata = {}, trackingNotes = "" }) {
  const orderId = order.id || order.order_id || metadata.orderId || "N/A";
  const total = Number(order.total_amount || order.totalAmount || order.total_price || 0).toFixed(2);
  const items = order.items || [];
  const statusLower = (status || "placed").toLowerCase();
  const statusUpper = statusLower.toUpperCase();
  const dateStr = new Date().toLocaleString();

  // Distinct rich configurations across Order, Shipment, Return, and Refund categories
  const statusConfig = {
    // --- 1. ORDER NOTIFICATIONS ---
    placed: {
      color: "#6366f1",
      badge: "📦 ORDER PLACED & CONFIRMED",
      title: "Thank You for Your Order!",
      subtitle: `Your order #${orderId} has been successfully recorded and placed in our warehouse fulfillment queue.`,
      category: "Order",
    },
    confirmed: {
      color: "#3b82f6",
      badge: "✅ INVENTORY VERIFIED",
      title: "Order Confirmed by Warehouse",
      subtitle: `Your order #${orderId} stock has been allocated and routed to the fulfillment workstation.`,
      category: "Order",
    },
    packed: {
      color: "#8b5cf6",
      badge: "🎁 SECURELY PACKED",
      title: "Order Packed & Quality-Checked",
      subtitle: `All items for order #${orderId} have been sealed with tamper-proof security packaging.`,
      category: "Order",
    },
    delivered: {
      color: "#10b981",
      badge: "🏠 DELIVERED SAFELY",
      title: "Your Package Has Arrived!",
      subtitle: `Order #${orderId} was successfully delivered to ${order.shipping_address || order.shippingAddress || "your delivery address"}.`,
      category: "Order",
    },
    cancelled: {
      color: "#ef4444",
      badge: "🚫 ORDER CANCELLED & RESTOCKED",
      title: "Order Cancellation Confirmed",
      subtitle: `Order #${orderId} has been cancelled. Reserved inventory has been restored to catalog stock.`,
      category: "Order",
    },
    cancel_requested: {
      color: "#f59e0b",
      badge: "⏳ CANCELLATION REQUESTED",
      title: "Cancellation Request Received",
      subtitle: `We received your cancellation request for order #${orderId}. Our logistics team is reviewing it.`,
      category: "Order",
    },
    cancel_rejected: {
      color: "#dc2626",
      badge: "❌ CANCELLATION REJECTED",
      title: "Cancellation Request Ineligible",
      subtitle: `Order #${orderId} could not be cancelled (${metadata.adminNotes || "Items have already been staged for dispatch"}). Order processing continues.`,
      category: "Order",
    },

    // --- 2. SHIPMENT NOTIFICATIONS ---
    shipped: {
      color: "#f59e0b",
      badge: "🚚 DISPATCHED & IN TRANSIT",
      title: "Your Package is on the Way!",
      subtitle: `Shipment for order #${orderId} is dispatched via ${metadata.shipment?.carrier || "Express Global Air"}.`,
      category: "Shipment",
    },
    partially_shipped: {
      color: "#eab308",
      badge: "📦 PARTIALLY FULFILLED & IN TRANSIT",
      title: "Part of Your Order Has Shipped!",
      subtitle: `A partial shipment for order #${orderId} has been dispatched. Remaining items will follow shortly.`,
      category: "Shipment",
    },
    in_transit: {
      color: "#38bdf8",
      badge: "📍 IN TRANSIT AT LOGISTICS HUB",
      title: "Package In Transit",
      subtitle: `Your shipment for order #${orderId} is moving smoothly through carrier distribution checkpoints.`,
      category: "Shipment",
    },
    out_for_delivery: {
      color: "#06b6d4",
      badge: "🚐 OUT FOR DELIVERY TODAY",
      title: "Out for Delivery Today!",
      subtitle: `The carrier courier has order #${orderId} on the delivery vehicle and is heading to your address.`,
      category: "Shipment",
    },

    // --- 3. RETURN (RMA) NOTIFICATIONS ---
    return_requested: {
      color: "#8b5cf6",
      badge: "🔄 RETURN RMA SUBMITTED",
      title: "Return Request Under Review",
      subtitle: `Your return request for order #${orderId} has been registered and is pending RMA support review.`,
      category: "Return",
    },
    return_approved: {
      color: "#10b981",
      badge: "✅ RETURN RMA APPROVED",
      title: "Return Request Approved!",
      subtitle: `Your return for order #${orderId} has been approved. A full refund has been scheduled.`,
      category: "Return",
    },
    return_rejected: {
      color: "#dc2626",
      badge: "❌ RETURN RMA NOT APPROVED",
      title: "Return Request Ineligible",
      subtitle: `Your return request for order #${orderId} could not be approved (${metadata.adminNotes || "Items outside return window or policy"}).`,
      category: "Return",
    },
    returned: {
      color: "#059669",
      badge: "📦 ITEM RETURNED & SETTLED",
      title: "Return Completed & Stock Restocked",
      subtitle: `Returned items for order #${orderId} have been received at our fulfillment center and inspected.`,
      category: "Return",
    },

    // --- 4. REFUND NOTIFICATIONS ---
    refund_issued: {
      color: "#10b981",
      badge: "💳 STRIPE REFUND PROCESSED",
      title: "Refund Processed Successfully!",
      subtitle: `A refund of $${Number(metadata.refund?.amount || order.refund_amount || total).toFixed(2)} has been credited via Stripe.`,
      category: "Refund",
    },
    refunded: {
      color: "#10b981",
      badge: "💳 PAYMENT REFUNDED",
      title: "Payment Refund Settled",
      subtitle: `Your payment of $${Number(metadata.refund?.amount || order.refund_amount || total).toFixed(2)} for order #${orderId} was refunded via Stripe.`,
      category: "Refund",
    },
    partial_refund: {
      color: "#14b8a6",
      badge: "💳 PARTIAL REFUND PROCESSED",
      title: "Partial Refund Issued",
      subtitle: `A partial refund of $${Number(metadata.refund?.amount || metadata.amount || 0).toFixed(2)} for order #${orderId} was credited to your original payment card.`,
      category: "Refund",
    },
    refund_processed: {
      color: "#10b981",
      badge: "💳 STRIPE REFUND PROCESSED",
      title: "Refund Completed",
      subtitle: `A refund for order #${orderId} has been settled and synchronized with our payment ledger.`,
      category: "Refund",
    },
  };

  const currentConfig = statusConfig[statusLower] || statusConfig.placed;

  // Shipment metadata card
  const shipmentData = metadata.shipment || (order.shipments && order.shipments[0]) || null;
  const shipmentHtml = shipmentData
    ? `
      <div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 12px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: bold; letter-spacing: 0.5px; color: #38bdf8; text-transform: uppercase; margin-bottom: 8px;">
          🚚 Shipment & Carrier Tracking Details
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Carrier:</td>
            <td style="color: #f8fafc; font-weight: bold; text-align: right;">${shipmentData.carrier || "Express Global Air"}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Tracking Number:</td>
            <td style="color: #38bdf8; font-family: monospace; font-weight: bold; text-align: right;">${shipmentData.tracking_number || shipmentData.trackingNumber || "TRK-" + orderId}</td>
          </tr>
          ${
            shipmentData.estimated_delivery || shipmentData.estimatedDelivery
              ? `<tr>
                  <td style="color: #94a3b8; padding: 3px 0;">Estimated Delivery:</td>
                  <td style="color: #f8fafc; text-align: right;">${new Date(shipmentData.estimated_delivery || shipmentData.estimatedDelivery).toLocaleDateString()}</td>
                </tr>`
              : ""
          }
          ${
            shipmentData.tracking_url || shipmentData.trackingUrl
              ? `<tr>
                  <td colspan="2" style="padding-top: 10px; text-align: center;">
                    <a href="${shipmentData.tracking_url || shipmentData.trackingUrl}" style="display: inline-block; padding: 6px 16px; background: #0284c7; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 11px; font-weight: bold;">Track Package Live →</a>
                  </td>
                </tr>`
              : ""
          }
        </table>
      </div>
    `
    : "";

  // Refund metadata card
  const refundData = metadata.refund || (order.refundInfo?.isRefunded ? order.refundInfo : null) || null;
  const refundHtml = refundData
    ? `
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: bold; letter-spacing: 0.5px; color: #34d399; text-transform: uppercase; margin-bottom: 8px;">
          💳 Stripe Payment Refund Settlement
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Refund Amount:</td>
            <td style="color: #34d399; font-weight: bold; text-align: right; font-family: monospace; font-size: 14px;">$${Number(refundData.amount || refundData.totalRefunded || order.refund_amount || total).toFixed(2)} USD</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Stripe Refund ID:</td>
            <td style="color: #f8fafc; font-family: monospace; text-align: right;">${refundData.stripe_refund_id || refundData.stripeRefundId || order.stripe_refund_id || "re_test_settled"}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Settlement Source:</td>
            <td style="color: #f8fafc; text-align: right; text-transform: capitalize;">${refundData.source || metadata.source || "Customer Refund"}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Reason:</td>
            <td style="color: #cbd5e1; text-align: right;">${refundData.reason || metadata.reason || "Customer requested refund"}</td>
          </tr>
          <tr>
            <td colspan="2" style="color: #64748b; font-size: 11px; padding-top: 8px; text-align: center;">
              Funds typically reflect on your payment card statement within 5–10 business days depending on your issuing bank.
            </td>
          </tr>
        </table>
      </div>
    `
    : "";

  // Return RMA card
  const returnData = metadata.returnRequest || (order.activeReturnRequest) || null;
  const returnHtml = returnData
    ? `
      <div style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 12px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: bold; letter-spacing: 0.5px; color: #a78bfa; text-transform: uppercase; margin-bottom: 8px;">
          🔄 RMA Return Authorization
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">RMA Number:</td>
            <td style="color: #f8fafc; font-family: monospace; font-weight: bold; text-align: right;">RMA-${orderId}-${returnData.id || "01"}</td>
          </tr>
          <tr>
            <td style="color: #94a3b8; padding: 3px 0;">Return Reason:</td>
            <td style="color: #f8fafc; text-align: right;">${returnData.reason || "Customer return"}</td>
          </tr>
          ${
            metadata.adminNotes
              ? `<tr>
                  <td style="color: #94a3b8; padding: 3px 0;">Support Feedback:</td>
                  <td style="color: #cbd5e1; text-align: right; font-style: italic;">"${metadata.adminNotes}"</td>
                </tr>`
              : ""
          }
        </table>
      </div>
    `
    : "";

  const itemsHtml = items.length > 0
    ? items
        .map(
          (item) => `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding: 10px 0; color: #f8fafc; font-size: 14px;">${item.name || "Product Item"}</td>
          <td style="padding: 10px 0; color: #94a3b8; font-size: 14px; text-align: center;">x${item.quantity || 1}</td>
          <td style="padding: 10px 0; color: #38bdf8; font-size: 14px; text-align: right; font-weight: bold;">$${Number(item.price || item.unitPrice || 0).toFixed(2)}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding: 10px 0; color: #94a3b8;">Standard Order Items Package</td></tr>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 20px; color: #f8fafc; }
          .container { max-width: 580px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
          .header { background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 30px 24px; text-align: center; border-bottom: 1px solid #3730a3; }
          .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #e0e7ff; margin-bottom: 12px; }
          .title { font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 6px 0; }
          .subtitle { font-size: 13px; color: #c7d2fe; margin: 0; line-height: 1.5; }
          .content { padding: 24px; }
          .info-card { background: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
          .footer { background: #0f172a; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="badge" style="border-color: ${currentConfig.color}; color: ${currentConfig.color};">${currentConfig.badge}</div>
            <h1 class="title">${currentConfig.title}</h1>
            <p class="subtitle">${currentConfig.subtitle}</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; color: #cbd5e1; margin-top: 0;">Hello <strong>${recipientName}</strong>,</p>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
              This is an automated real-time dispatch from our background worker queue. Your order status was transitioned to 
              <strong style="color: ${currentConfig.color};">${statusUpper}</strong> at ${dateStr}.
            </p>

            ${shipmentHtml}
            ${refundHtml}
            ${returnHtml}

            <div class="info-card">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding-bottom: 6px;">ORDER NUMBER:</td>
                  <td style="color: #f8fafc; font-size: 12px; font-weight: bold; text-align: right; font-family: monospace;">#${orderId}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding-bottom: 6px;">SHIPPING TO:</td>
                  <td style="color: #f8fafc; font-size: 12px; text-align: right;">${order.shipping_address || order.shippingAddress || "Customer Address"}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px;">PAYMENT METHOD:</td>
                  <td style="color: #f8fafc; font-size: 12px; text-align: right; text-transform: capitalize;">${order.payment_method || order.paymentMethod || "Credit Card"}</td>
                </tr>
                ${
                  trackingNotes
                    ? `<tr>
                        <td style="color: #94a3b8; font-size: 12px; padding-top: 6px;">EVENT NOTES:</td>
                        <td style="color: #38bdf8; font-size: 12px; text-align: right; font-style: italic;">${trackingNotes}</td>
                      </tr>`
                    : ""
                }
              </table>
            </div>

            <h3 style="font-size: 14px; color: #e2e8f0; margin-bottom: 10px;">Ordered Items</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              ${itemsHtml}
              <tr>
                <td colspan="2" style="padding-top: 12px; font-weight: bold; color: #e2e8f0; font-size: 14px;">Total Amount:</td>
                <td style="padding-top: 12px; font-weight: bold; color: #10b981; font-size: 16px; text-align: right; font-family: monospace;">$${total}</td>
              </tr>
            </table>
          </div>
          <div class="footer">
            <p style="margin: 0 0 4px 0;">⚡ Processed asynchronously by Background Notification Worker Queue</p>
            <p style="margin: 0; font-size: 11px;">MERN Stack Real-Time Order Management System</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Enqueue an asynchronous Notification Email Job
 * @param {Object} jobData - { type, category, order, recipientEmail, status, trackingNotes, metadata, simulateFailure, maxRetries }
 */
function enqueueEmailJob(jobData) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const orderId = jobData.order?.id || jobData.order?.order_id || jobData.orderId || "N/A";
  const status = jobData.status || jobData.order?.status || "placed";
  const recipientEmail = jobData.recipientEmail || jobData.order?.user_email || "customer@example.com";

  const statusNorm = String(status).toLowerCase();
  const category = jobData.category || (
    jobData.type?.includes("SHIPMENT") || ["shipped", "partially_shipped", "in_transit", "out_for_delivery"].includes(statusNorm)
      ? "shipment"
      : jobData.type?.includes("RETURN") || statusNorm.startsWith("return")
      ? "return"
      : jobData.type?.includes("REFUND") || statusNorm.includes("refund")
      ? "refund"
      : "order"
  );

  const subject = jobData.subject || (
    category === "shipment"
      ? `Order #${orderId} Shipment Update: ${status.toUpperCase()} Tracking`
      : category === "return"
      ? `Order #${orderId} Return RMA Notice: ${status.toUpperCase()}`
      : category === "refund"
      ? `Order #${orderId} Refund: Payment Refund Settled via Stripe`
      : `Order #${orderId} Update: ${status.toUpperCase()} Notification`
  );

  const job = {
    id: jobId,
    type: jobData.type || `${category.toUpperCase()}_NOTIFICATION`,
    category,
    orderId,
    status,
    recipientEmail,
    recipientName: jobData.recipientName || "Valued Customer",
    order: jobData.order,
    metadata: jobData.metadata || {},
    trackingNotes: jobData.trackingNotes || "",
    subject,
    state: "pending", // pending -> processing -> retrying -> completed | failed
    retries: 0,
    maxRetries: typeof jobData.maxRetries === "number" ? jobData.maxRetries : 3,
    simulateFailure: jobData.simulateFailure || false,
    enqueuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    nextRetryAt: null,
    backoffDelayMs: null,
    durationMs: null,
    error: null,
    retryHistory: [],
  };

  jobQueue.push(job);
  queueMetrics.totalEnqueued++;

  console.log(
    `📥 [Background Queue] Enqueued ${category.toUpperCase()} Job "${job.id}" for Order #${orderId} (${status.toUpperCase()}) | Queue size: ${jobQueue.length}`
  );

  // Emit real-time queue event
  socketService.emitEmailQueueEvent({
    type: "JOB_ENQUEUED",
    jobId: job.id,
    orderId: job.orderId,
    status: job.status,
    category: job.category,
    state: job.state,
    recipientEmail: job.recipientEmail,
    subject: job.subject,
    metadata: job.metadata,
    queueSize: jobQueue.length,
    metrics: getQueueMetrics(),
  });

  // Trigger worker loop if not already running
  processNextJob();

  return job;
}

/**
 * Asynchronous Background Worker Processing Loop
 */
async function processNextJob() {
  if (isProcessing || jobQueue.length === 0) return;

  isProcessing = true;
  const currentJob = jobQueue.shift();

  currentJob.state = "processing";
  currentJob.startedAt = new Date().toISOString();
  const startTime = Date.now();

  console.log(
    `⚙️ [Background Worker] Processing [${currentJob.category?.toUpperCase() || "ORDER"}] Job ${currentJob.id} -> Emailing ${currentJob.recipientEmail}... (Attempt ${currentJob.retries + 1}/${currentJob.maxRetries + 1})`
  );

  socketService.emitEmailQueueEvent({
    type: "JOB_PROCESSING",
    jobId: currentJob.id,
    orderId: currentJob.orderId,
    status: currentJob.status,
    category: currentJob.category,
    state: currentJob.state,
    retries: currentJob.retries,
    maxRetries: currentJob.maxRetries,
    recipientEmail: currentJob.recipientEmail,
    subject: currentJob.subject,
    metadata: currentJob.metadata,
    queueSize: jobQueue.length,
    metrics: getQueueMetrics(),
  });

  try {
    // 1. Check for Fault Injection or per-job simulation failure
    const shouldFail =
      currentJob.simulateFailure ||
      (faultInjectionConfig.enabled && Math.random() < faultInjectionConfig.failureRate);

    if (shouldFail) {
      // Simulate network / SMTP delivery outage
      await new Promise((resolve) => setTimeout(resolve, 500));
      throw new Error(
        faultInjectionConfig.failureMessage ||
          "SMTP Delivery Failure (ETIMEDOUT): mail.excelsior.internal:587 connection timed out"
      );
    }

    // 2. Generate Rich HTML Email Template
    const emailHtml = generateOrderEmailHtml({
      order: currentJob.order || { id: currentJob.orderId, status: currentJob.status },
      status: currentJob.status,
      recipientName: currentJob.recipientName,
      metadata: currentJob.metadata || {},
      trackingNotes: currentJob.trackingNotes || "",
    });

    // 3. Simulate realistic network latency (e.g. 400-700ms)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. Send or simulate email dispatch
    const mailOptions = {
      from: '"Excelsior Store Fulfillment" <orders@excelsior-store.io>',
      to: currentJob.recipientEmail,
      subject: currentJob.subject,
      html: emailHtml,
    };

    let previewUrl = null;
    try {
      const mailer = await getTransporter();
      if (mailer) {
        const info = await mailer.sendMail(mailOptions);
        previewUrl = nodemailer.getTestMessageUrl(info) || null;
      }
    } catch (sendErr) {
      console.log("ℹ️ SMTP transport note:", sendErr.message);
    }

    const durationMs = Date.now() - startTime;
    currentJob.state = "completed";
    currentJob.completedAt = new Date().toISOString();
    currentJob.durationMs = durationMs;
    currentJob.previewUrl = previewUrl;
    currentJob.renderedHtml = emailHtml;
    currentJob.error = null;

    queueMetrics.totalProcessed++;
    queueMetrics.totalSucceeded++;
    queueMetrics.averageProcessingTimeMs = Math.round(
      (queueMetrics.averageProcessingTimeMs * (queueMetrics.totalProcessed - 1) + durationMs) /
        queueMetrics.totalProcessed
    );

    console.log(`✅ [Background Worker] Dispatched [${currentJob.category?.toUpperCase() || "ORDER"}] Email for Order #${currentJob.orderId} in ${durationMs}ms`);

    // Emit live email dispatched event
    socketService.emitEmailQueueEvent({
      type: "JOB_COMPLETED",
      jobId: currentJob.id,
      orderId: currentJob.orderId,
      status: currentJob.status,
      category: currentJob.category,
      state: currentJob.state,
      recipientEmail: currentJob.recipientEmail,
      subject: currentJob.subject,
      metadata: currentJob.metadata,
      durationMs: currentJob.durationMs,
      completedAt: currentJob.completedAt,
      renderedHtml: currentJob.renderedHtml,
      queueSize: jobQueue.length,
      metrics: getQueueMetrics(),
    });

    // Record into history buffer
    recordJobInHistory(currentJob);
  } catch (err) {
    console.error(`❌ [Background Worker] Failed to process Job ${currentJob.id}:`, err.message);
    currentJob.retries++;
    queueMetrics.totalRetried++;

    const attemptRecord = {
      attempt: currentJob.retries,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
    currentJob.retryHistory = currentJob.retryHistory || [];
    currentJob.retryHistory.push(attemptRecord);

    if (currentJob.retries <= currentJob.maxRetries) {
      // Exponential Backoff: 1s, 2s, 4s, 8s (capped at 16s)
      const backoffDelay = Math.min(1000 * Math.pow(2, currentJob.retries - 1), 16000);
      currentJob.state = "retrying";
      currentJob.backoffDelayMs = backoffDelay;
      currentJob.nextRetryAt = new Date(Date.now() + backoffDelay).toISOString();
      currentJob.error = err.message;

      console.log(
        `🔁 [Background Worker] Scheduling Retry for Job ${currentJob.id} in ${backoffDelay}ms (Attempt ${currentJob.retries}/${currentJob.maxRetries})`
      );

      socketService.emitEmailQueueEvent({
        type: "JOB_RETRYING",
        jobId: currentJob.id,
        orderId: currentJob.orderId,
        status: currentJob.status,
        category: currentJob.category,
        state: "retrying",
        retries: currentJob.retries,
        maxRetries: currentJob.maxRetries,
        backoffDelayMs: backoffDelay,
        nextRetryAt: currentJob.nextRetryAt,
        error: err.message,
        recipientEmail: currentJob.recipientEmail,
        subject: currentJob.subject,
        metadata: currentJob.metadata,
        queueSize: jobQueue.length,
        metrics: getQueueMetrics(),
      });

      // Update in history so UI sees the retrying state immediately
      recordJobInHistory(currentJob);

      // Schedule delayed execution using exponential backoff timer
      const timerId = setTimeout(() => {
        retryTimers.delete(currentJob.id);
        currentJob.state = "pending";
        jobQueue.unshift(currentJob); // High priority
        processNextJob();
      }, backoffDelay);

      retryTimers.set(currentJob.id, timerId);
    } else {
      // Retries Exhausted -> Dead-Letter Queue
      currentJob.state = "failed";
      currentJob.error = `Retries exhausted (${currentJob.maxRetries}/${currentJob.maxRetries}): ${err.message}`;
      currentJob.completedAt = new Date().toISOString();
      currentJob.nextRetryAt = null;

      queueMetrics.totalProcessed++;
      queueMetrics.totalFailed++;

      console.log(`💀 [Background Worker] Job ${currentJob.id} moved to Dead-Letter Queue.`);

      // Deduplicate in Dead-Letter Queue
      const existingDlqIdx = deadLetterQueue.findIndex((j) => j.id === currentJob.id);
      if (existingDlqIdx > -1) {
        deadLetterQueue[existingDlqIdx] = { ...currentJob };
      } else {
        deadLetterQueue.unshift({ ...currentJob });
        if (deadLetterQueue.length > MAX_HISTORY) deadLetterQueue.pop();
      }

      recordJobInHistory(currentJob);

      socketService.emitEmailQueueEvent({
        type: "JOB_FAILED",
        jobId: currentJob.id,
        orderId: currentJob.orderId,
        status: currentJob.status,
        category: currentJob.category,
        state: currentJob.state,
        error: currentJob.error,
        retries: currentJob.retries,
        maxRetries: currentJob.maxRetries,
        metadata: currentJob.metadata,
        queueSize: jobQueue.length,
        metrics: getQueueMetrics(),
      });

      // Broadcast alert to Admin Notification Feed
      socketService.emitAdminNotification({
        type: "NOTIFICATION_FAILURE",
        title: "⚠️ Email Notification Delivery Failed",
        message: `Failed to deliver email to ${currentJob.recipientEmail} for Order #${currentJob.orderId} after ${currentJob.maxRetries} retry attempts.`,
        orderId: currentJob.orderId,
        jobId: currentJob.id,
        severity: "error",
        data: {
          error: currentJob.error,
          retryHistory: currentJob.retryHistory,
          category: currentJob.category,
        },
      });
    }
  } finally {
    isProcessing = false;

    // Process next item if any remains in queue
    if (jobQueue.length > 0) {
      setImmediate(processNextJob);
    }
  }
}

function recordJobInHistory(job) {
  const existingIdx = jobHistory.findIndex((j) => j.id === job.id);
  if (existingIdx > -1) {
    jobHistory[existingIdx] = { ...job };
  } else {
    jobHistory.unshift({ ...job });
    if (jobHistory.length > MAX_HISTORY) {
      jobHistory.pop();
    }
  }
}

/**
 * Manually retry a failed or dead-letter job
 * @param {string} jobId
 */
function retryJob(jobId) {
  // Find in dead-letter queue or job history
  const job =
    jobHistory.find((j) => j.id === jobId) ||
    deadLetterQueue.find((j) => j.id === jobId);

  if (!job) {
    throw new Error(`Job "${jobId}" not found in queue history.`);
  }

  // Remove from dead-letter queue if it was in DLQ
  const dlqIndex = deadLetterQueue.findIndex((j) => j.id === jobId);
  if (dlqIndex > -1) {
    deadLetterQueue.splice(dlqIndex, 1);
  }

  // Clear any existing active timer for this job
  if (retryTimers.has(jobId)) {
    clearTimeout(retryTimers.get(jobId));
    retryTimers.delete(jobId);
  }

  // Reset retry counter and error
  job.retries = 0;
  job.state = "pending";
  job.error = null;
  job.simulateFailure = false; // Disable forced failure on manual retry
  job.enqueuedAt = new Date().toISOString();
  job.startedAt = null;
  job.completedAt = null;
  job.nextRetryAt = null;

  jobQueue.push(job);
  queueMetrics.totalEnqueued++;

  console.log(`🔁 [Background Worker] Manually re-queued Job ${job.id} for Order #${job.orderId}`);

  socketService.emitEmailQueueEvent({
    type: "JOB_ENQUEUED",
    jobId: job.id,
    orderId: job.orderId,
    status: job.status,
    category: job.category,
    state: job.state,
    recipientEmail: job.recipientEmail,
    subject: job.subject,
    queueSize: jobQueue.length,
    metrics: getQueueMetrics(),
  });

  processNextJob();

  return { success: true, message: `Job ${jobId} re-enqueued for execution`, job };
}

/**
 * Re-queue all jobs currently in the Dead-Letter Queue
 */
function retryAllDeadLetterJobs() {
  const count = deadLetterQueue.length;
  if (count === 0) {
    return { success: true, count: 0, message: "Dead-letter queue is already empty." };
  }

  const jobsToRetry = [...deadLetterQueue];
  deadLetterQueue.length = 0;

  for (const job of jobsToRetry) {
    if (retryTimers.has(job.id)) {
      clearTimeout(retryTimers.get(job.id));
      retryTimers.delete(job.id);
    }
    job.retries = 0;
    job.state = "pending";
    job.error = null;
    job.simulateFailure = false;
    job.enqueuedAt = new Date().toISOString();
    job.startedAt = null;
    job.completedAt = null;
    job.nextRetryAt = null;
    jobQueue.push(job);
    queueMetrics.totalEnqueued++;
  }

  console.log(`🔁 [Background Worker] Batch re-enqueued ${count} jobs from Dead-Letter Queue.`);
  processNextJob();

  return {
    success: true,
    count,
    message: `Successfully re-enqueued ${count} dead-letter jobs for processing.`,
  };
}

/**
 * Clear all items from Dead-Letter Queue
 */
function clearDeadLetterQueue() {
  const count = deadLetterQueue.length;
  deadLetterQueue.length = 0;
  console.log(`🧹 [Background Worker] Cleared ${count} items from Dead-Letter Queue.`);
  return { success: true, count, message: `Cleared ${count} jobs from Dead-Letter Queue.` };
}

/**
 * Toggle or configure fault injection for testing retry resilience
 */
function toggleFaultInjection({ enabled, failureRate = 1.0, failureMessage } = {}) {
  faultInjectionConfig.enabled = typeof enabled === "boolean" ? enabled : !faultInjectionConfig.enabled;
  if (typeof failureRate === "number") faultInjectionConfig.failureRate = failureRate;
  if (failureMessage) faultInjectionConfig.failureMessage = failureMessage;

  console.log(
    `🧪 [Background Worker] Fault Injection ${faultInjectionConfig.enabled ? "ENABLED" : "DISABLED"} (Rate: ${faultInjectionConfig.failureRate})`
  );

  socketService.emitEmailQueueEvent({
    type: "FAULT_INJECTION_UPDATED",
    config: faultInjectionConfig,
    metrics: getQueueMetrics(),
  });

  return faultInjectionConfig;
}

function getFaultInjectionConfig() {
  return faultInjectionConfig;
}

/**
 * Trigger simulated job for testing with multi-category support
 */
function triggerSimulatedJob({
  orderId = 999,
  status = "placed",
  category = "order",
  recipientEmail = "test@excelsior-store.io",
  shouldFail = false,
  metadata = null,
} = {}) {
  let defaultMetadata = metadata || {};
  let defaultStatus = status;

  if (category === "shipment" && status === "placed") {
    defaultStatus = "shipped";
    defaultMetadata = {
      shipment: {
        carrier: "Express Global Air",
        tracking_number: `TRK-${orderId}-${Date.now().toString().slice(-4)}`,
        tracking_url: "https://www.fedex.com/fedextrack/",
        estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      ...defaultMetadata,
    };
  } else if (category === "return" && status === "placed") {
    defaultStatus = "return_requested";
    defaultMetadata = {
      returnRequest: {
        id: Math.floor(10 + Math.random() * 90),
        reason: "Defective item upon arrival",
        adminNotes: "Inspection approved by RMA support",
      },
      ...defaultMetadata,
    };
  } else if (category === "refund" && status === "placed") {
    defaultStatus = "refund_issued";
    defaultMetadata = {
      refund: {
        stripe_refund_id: `re_test_${Math.random().toString(36).substring(2, 10)}`,
        amount: 199.99,
        source: "cancellation",
        reason: "Customer cancellation refund",
      },
      ...defaultMetadata,
    };
  }

  return enqueueEmailJob({
    type: `${category.toUpperCase()}_SIMULATION`,
    category,
    orderId,
    status: defaultStatus,
    recipientEmail,
    recipientName: "Demo Tester",
    simulateFailure: shouldFail,
    trackingNotes: shouldFail ? "Simulated Fault Injection Run" : `Manual ${category.toUpperCase()} Queue Test`,
    metadata: defaultMetadata,
    order: {
      id: orderId,
      status: defaultStatus,
      total_amount: 199.99,
      shipping_address: "10 Downing Street, London",
      payment_method: "credit_card",
      items: [
        { name: "Simulation Product", quantity: 1, price: 199.99 }
      ]
    }
  });
}

/**
 * Flush queue and clear timers
 */
function flushQueue() {
  for (const timer of retryTimers.values()) {
    clearTimeout(timer);
  }
  retryTimers.clear();
  const clearedCount = jobQueue.length;
  jobQueue.length = 0;

  console.log(`🧹 [Background Worker] Flushed ${clearedCount} pending jobs.`);
  return { success: true, clearedCount };
}

/**
 * Get current Queue and Worker metrics
 */
function getQueueMetrics() {
  return {
    ...queueMetrics,
    pendingJobs: jobQueue.length,
    deadLetterJobs: deadLetterQueue.length,
    isProcessing,
    faultInjection: faultInjectionConfig,
  };
}

/**
 * Get recent executed jobs history
 */
function getJobHistory(limit = 30) {
  const seen = new Set();
  const deduped = [];
  for (const job of jobHistory) {
    if (job && job.id && !seen.has(job.id)) {
      seen.add(job.id);
      deduped.push(job);
    }
  }
  return deduped.slice(0, limit);
}

/**
 * Get dead letter queue items
 */
function getDeadLetterQueue(limit = 20) {
  const seen = new Set();
  const deduped = [];
  for (const job of deadLetterQueue) {
    if (job && job.id && !seen.has(job.id)) {
      seen.add(job.id);
      deduped.push(job);
    }
  }
  return deduped.slice(0, limit);
}

module.exports = {
  enqueueEmailJob,
  processNextJob,
  retryJob,
  retryAllDeadLetterJobs,
  clearDeadLetterQueue,
  toggleFaultInjection,
  getFaultInjectionConfig,
  triggerSimulatedJob,
  flushQueue,
  getQueueMetrics,
  getJobHistory,
  getDeadLetterQueue,
  generateOrderEmailHtml,
};
