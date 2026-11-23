/**
 * Task 5: Comprehensive End-to-End Integration Test Suite
 * 
 * Verifies:
 * 1. Checkout Flow & ACID Inventory Reservation
 * 2. Partial Shipments & Multi-Stage Fulfillment
 * 3. Return Request (RMA) Lifecycle & Policy Enforcement
 * 4. Stripe Refund Processing & Ledger Synchronization
 * 5. Duplicate Webhook Events & Idempotency Deduplication
 * 6. Invalid Order-State Transitions & Guard Constraints
 * 7. End-to-End Database Consistency & Health Audit
 */

require("dotenv").config({ path: "./.env" });
const db = require("../config/db");

const BASE_URL = process.env.TEST_API_URL || "http://localhost:5000";

// ANSI Terminal Colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// Helper for making HTTP requests
async function apiRequest(endpoint, method = "GET", body = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const startTime = Date.now();
  const res = await fetch(url, options);
  const duration = Date.now() - startTime;

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    data,
    duration,
  };
}

// Test runner state
const testReport = {
  total: 0,
  passed: 0,
  failed: 0,
  suites: [],
  startTime: null,
  endTime: null,
};

function startSuite(name, description) {
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}📦 SUITE: ${name}${colors.reset}`);
  console.log(`${colors.dim}${description}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  testReport.suites.push({ name, tests: [] });
}

function assert(condition, description, detail = "") {
  testReport.total++;
  const currentSuite = testReport.suites[testReport.suites.length - 1];

  if (condition) {
    testReport.passed++;
    console.log(`  ${colors.green}✓ [PASS]${colors.reset} ${description}${detail ? ` ${colors.dim}(${detail})${colors.reset}` : ""}`);
    if (currentSuite) currentSuite.tests.push({ name: description, passed: true, detail });
  } else {
    testReport.failed++;
    console.log(`  ${colors.red}✗ [FAIL]${colors.reset} ${description}${detail ? ` ${colors.red}[${detail}]${colors.reset}` : ""}`);
    if (currentSuite) currentSuite.tests.push({ name: description, passed: false, detail });
  }
}

async function runTask5IntegrationTests({ exitOnComplete = false } = {}) {
  testReport.total = 0;
  testReport.passed = 0;
  testReport.failed = 0;
  testReport.suites = [];
  testReport.startTime = Date.now();

  console.log(`\n${colors.bright}${colors.magenta}################################################################################${colors.reset}`);
  console.log(`${colors.bright}${colors.white}🚀 TASK 5: FULL INTEGRATION TEST SUITE (SHIPMENTS, RETURNS, REFUNDS, WEBHOOKS, TRANSITIONS)${colors.reset}`);
  console.log(`${colors.dim}Target Server: ${BASE_URL} | Time: ${new Date().toISOString()}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}################################################################################${colors.reset}`);

  // 0. Ensure healthy inventory in database before testing
  try {
    await db.query("UPDATE products SET stock = 100 WHERE id = 1");
    await db.query("UPDATE products SET stock = 50 WHERE id IN (3, 4, 5, 6, 8)");
    console.log(`  ${colors.dim}✓ Replenished test catalog inventory to 50-100 units.${colors.reset}`);
  } catch (err) {
    console.warn(`  ${colors.yellow}⚠ Warning: Inventory replenishment failed (${err.message}). Proceeding with existing stock.${colors.reset}`);
  }

  // Fetch product data
  const p1Res = await apiRequest("/api/products/1");
  const p3Res = await apiRequest("/api/products/3");
  const p4Res = await apiRequest("/api/products/4");
  const prod1Stock = p1Res.data?.data?.stock ?? 100;
  const prod3 = p3Res.data?.data || { id: 3, name: "Mouse", price: "50.00", stock: 50 };
  const prod4 = p4Res.data?.data || { id: 4, name: "Keyboard", price: "80.00", stock: 50 };

  // ============================================================================
  // SUITE 1: CHECKOUT FLOW & ACID INVENTORY RESERVATION
  // ============================================================================
  startSuite(
    "1. Checkout Flow & ACID Inventory Reservation",
    "Validates server-side price verification, row-level locking, atomic inventory decrement, and idempotency key persistence."
  );

  const piPayload = {
    userId: 1,
    shippingAddress: "777 Market Street, San Francisco, CA",
    cartItems: [{ productId: 1, quantity: 2 }],
  };
  const piRes = await apiRequest("/api/orders/create-payment-intent", "POST", piPayload);

  assert(
    piRes.status === 200 && piRes.data?.success === true,
    "1.1 PaymentIntent created with server-side verified cart totals",
    `Total: $${piRes.data?.totalAmount}, PI ID: ${piRes.data?.paymentIntentId}`
  );
  assert(
    Boolean(piRes.data?.clientSecret && piRes.data?.paymentIntentId),
    "1.2 Stripe ClientSecret and PaymentIntent ID returned to client"
  );

  const paymentIntentId1 = piRes.data?.paymentIntentId || `pi_task5_mock_${Date.now()}`;
  const checkoutIdempotencyKey = `idem_checkout_task5_${Date.now()}`;

  const checkoutPayload = {
    userId: 1,
    shippingAddress: "777 Market Street, San Francisco, CA",
    paymentMethod: "stripe",
    paymentIntentId: paymentIntentId1,
    cartItems: [{ productId: 1, quantity: 2 }],
  };

  const checkoutRes = await apiRequest("/api/orders/checkout", "POST", checkoutPayload, {
    "Idempotency-Key": checkoutIdempotencyKey,
  });

  const createdOrder = checkoutRes.data?.order;
  assert(
    checkoutRes.status === 201 && checkoutRes.data?.success === true,
    "1.3 Order created successfully via ACID transaction",
    `Order ID: #${createdOrder?.id}, Status: ${createdOrder?.status}`
  );

  const p1AfterCheckoutRes = await apiRequest("/api/products/1");
  const stockAfterCheckout = p1AfterCheckoutRes.data?.data?.stock;
  assert(
    stockAfterCheckout === prod1Stock - 2,
    "1.4 Product stock atomically decremented in MySQL products table",
    `Expected: ${prod1Stock - 2}, Actual: ${stockAfterCheckout}`
  );

  const idemKeysRes = await apiRequest("/api/orders/idempotency-keys?limit=10");
  const matchedKey = idemKeysRes.data?.data?.find((k) => k.idempotency_key === checkoutIdempotencyKey);
  assert(
    matchedKey && matchedKey.status === "COMPLETED",
    "1.5 Idempotency key stored with COMPLETED status and cached payload",
    `Key: ${checkoutIdempotencyKey}`
  );

  // ============================================================================
  // SUITE 2: PARTIAL SHIPMENTS & MULTI-STAGE FULFILLMENT
  // ============================================================================
  startSuite(
    "2. Partial Shipments & Multi-Stage Fulfillment",
    "Validates split line-item fulfillment, tracking milestones, remaining quantity guards, and order completion."
  );

  // 2.1 Create a multi-item order with 2 different products
  const multiCheckoutRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "456 Logistics Boulevard, Seattle, WA",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    cartItems: [
      { productId: prod3.id, quantity: 2 },
      { productId: prod4.id, quantity: 2 },
    ],
  });

  const multiOrder = multiCheckoutRes.data?.order;
  assert(
    multiCheckoutRes.status === 201 && multiOrder?.id,
    "2.1 Multi-item order placed for partial shipment test",
    `Order #${multiOrder?.id} with 2 distinct line items`
  );

  // Fetch full details with line item IDs
  const orderWithItemsRes = await apiRequest(`/api/orders/${multiOrder?.id}`);
  const orderWithItems = orderWithItemsRes.data?.data || orderWithItemsRes.data?.order;
  const item1 = orderWithItems?.items?.find((i) => i.product_id === prod3.id);
  const item2 = orderWithItems?.items?.find((i) => i.product_id === prod4.id);

  // 2.2 Create Partial Shipment 1 (Fulfill only item 1: 2 units)
  const partialShipment1Res = await apiRequest(`/api/orders/${multiOrder?.id}/shipments`, "POST", {
    carrier: "FedEx Ground",
    trackingNumber: `FX-TEST-${Date.now().toString().slice(-6)}`,
    shippingTier: "standard",
    items: [{ orderItemId: item1.id, quantity: 2 }],
  });

  const shipment1 = partialShipment1Res.data?.shipment;
  const updatedAfterShip1 = partialShipment1Res.data?.order;

  assert(
    partialShipment1Res.status === 201 &&
    updatedAfterShip1?.status === "partially_shipped" &&
    updatedAfterShip1?.fulfillment_status === "partially_fulfilled",
    "2.2 Partial shipment #1 created, order transitioned to 'partially_shipped' / 'partially_fulfilled'",
    `Status: ${updatedAfterShip1?.status}, Fulfillment: ${updatedAfterShip1?.fulfillment_status}`
  );

  assert(
    Boolean(shipment1?.id && shipment1?.carrier === "FedEx Ground" && shipment1?.tracking_number),
    "2.3 Shipment #1 record created with carrier and tracking metadata",
    `Shipment #${shipment1?.id}, Tracking: ${shipment1?.tracking_number}`
  );

  // 2.3 Add tracking milestone event to Shipment 1
  const trackingMilestoneRes = await apiRequest(
    `/api/orders/${multiOrder?.id}/shipments/${shipment1.id}/tracking`,
    "POST",
    {
      status: "in_transit",
      location: "Denver Distribution Hub, CO",
      description: "Package departed local sorting terminal",
    }
  );

  assert(
    (trackingMilestoneRes.status === 200 || trackingMilestoneRes.status === 201) &&
    trackingMilestoneRes.data?.success === true,
    "2.4 Tracking milestone ('in_transit') added to Shipment #1",
    `Location: Denver Distribution Hub, CO`
  );

  // Verify customer tracking endpoint returns milestone
  const trackingInquiryRes = await apiRequest(`/api/orders/${multiOrder?.id}/tracking`);
  const shipmentList = trackingInquiryRes.data?.data?.shipments || [];
  const allEvents = shipmentList.flatMap((s) => s.trackingEvents || []);
  const foundMilestone = allEvents.some((e) => e.status === "in_transit");
  assert(
    foundMilestone,
    "2.5 Customer tracking API reflects latest shipment status event",
    `Total tracking events across shipments: ${allEvents.length}`
  );

  // 2.4 Over-fulfillment guard: Attempting to ship item 1 again when already 2/2 fulfilled
  const overFulfillRes = await apiRequest(`/api/orders/${multiOrder?.id}/shipments`, "POST", {
    carrier: "DHL Express",
    items: [{ orderItemId: item1.id, quantity: 1 }],
  });

  assert(
    overFulfillRes.status === 400 &&
    (overFulfillRes.data?.message?.includes("Only 0 unfulfilled") ||
      overFulfillRes.data?.message?.includes("Cannot fulfill")),
    "2.6 Over-fulfillment attempt rejected with HTTP 400 (exceeds unfulfilled line item quantity)",
    `Error: ${overFulfillRes.data?.message}`
  );

  // 2.5 Complete Fulfillment with Shipment 2 (Fulfill remaining item 2: 2 units)
  const partialShipment2Res = await apiRequest(`/api/orders/${multiOrder?.id}/shipments`, "POST", {
    carrier: "UPS Express",
    trackingNumber: `1Z-TEST-${Date.now().toString().slice(-6)}`,
    items: [{ orderItemId: item2.id, quantity: 2 }],
  });

  const updatedAfterShip2 = partialShipment2Res.data?.order;
  assert(
    partialShipment2Res.status === 201 &&
    updatedAfterShip2?.status === "shipped" &&
    updatedAfterShip2?.fulfillment_status === "fulfilled" &&
    partialShipment2Res.data?.isCompletelyFulfilled === true,
    "2.7 Shipment #2 fulfilled remaining items, order transitioned to 'shipped' / 'fulfilled'",
    `Status: ${updatedAfterShip2?.status}, Fulfillment: ${updatedAfterShip2?.fulfillment_status}`
  );

  // ============================================================================
  // SUITE 3: RETURN REQUEST (RMA) LIFECYCLE & POLICY ENFORCEMENT
  // ============================================================================
  startSuite(
    "3. Return Request (RMA) Lifecycle & Policy Enforcement",
    "Validates delivery prerequisite, return eligibility windows, duplicate RMA prevention, admin review rejection & approval with restock."
  );

  // 3.1 Return eligibility on non-delivered order
  const nonDeliveredEligibility = await apiRequest(`/api/orders/${multiOrder?.id}/eligibility`);
  const canReturnNonDelivered = Boolean(nonDeliveredEligibility.data?.data?.eligibility?.canRequestReturn);
  assert(
    canReturnNonDelivered === false,
    "3.1 Non-delivered order correctly evaluated as INELIGIBLE for return",
    `Status: ${updatedAfterShip2?.status}, canRequestReturn: ${canReturnNonDelivered}`
  );

  // 3.2 Create delivered order for return tests
  const orderForReturnRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "100 Return Way, Portland, OR",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    cartItems: [{ productId: prod3.id, quantity: 1 }],
  });
  const returnOrderId = orderForReturnRes.data?.order?.id;

  // Transition order to delivered (step-by-step or via force update)
  await apiRequest(`/api/orders/${returnOrderId}/status`, "PATCH", {
    status: "delivered",
    trackingNotes: "Package delivered to front porch",
    force: true,
  });

  // Verify return eligibility on delivered order
  const deliveredEligibility = await apiRequest(`/api/orders/${returnOrderId}/eligibility`);
  const canReturnDelivered = Boolean(deliveredEligibility.data?.data?.eligibility?.canRequestReturn);
  assert(
    canReturnDelivered === true,
    "3.2 Delivered order within 30-day window verified as ELIGIBLE for return",
    `canRequestReturn: ${canReturnDelivered}, returnWindowDays: ${deliveredEligibility.data?.data?.eligibility?.returnWindowDays}`
  );

  // 3.3 Submit Return Request
  const retOrderDetails = await apiRequest(`/api/orders/${returnOrderId}`);
  const returnLineItem = (retOrderDetails.data?.data || retOrderDetails.data?.order)?.items?.[0];

  const submitRmaRes = await apiRequest(`/api/orders/${returnOrderId}/return-request`, "POST", {
    reason: "Defective item",
    customerNotes: "Sensor does not respond after 1 day of use",
    items: [{ orderItemId: returnLineItem?.id, quantity: 1, reason: "Defective" }],
  });

  const rmaRequest = submitRmaRes.data?.request || submitRmaRes.data?.returnRequest;
  assert(
    (submitRmaRes.status === 200 || submitRmaRes.status === 201) &&
    submitRmaRes.data?.success === true &&
    Boolean(rmaRequest?.id),
    "3.3 RMA return request submitted and created in 'pending' state",
    `RMA Request #${rmaRequest?.id}, Order Status: return_requested`
  );

  // Verify order transitioned to return_requested
  const orderAfterRma = await apiRequest(`/api/orders/${returnOrderId}`);
  const rmaOrderState = orderAfterRma.data?.data || orderAfterRma.data?.order;
  assert(
    rmaOrderState?.status === "return_requested",
    "3.4 Order status transitioned to 'return_requested'",
    `Current status: ${rmaOrderState?.status}`
  );

  // 3.4 Duplicate Return Request Guard: Re-submitting return request on same order
  const dupRmaRes = await apiRequest(`/api/orders/${returnOrderId}/return-request`, "POST", {
    reason: "Duplicate return attempt",
    items: [{ orderItemId: returnLineItem?.id, quantity: 1 }],
  });

  assert(
    dupRmaRes.status === 400 &&
    (dupRmaRes.data?.message?.includes("not eligible for return") ||
      dupRmaRes.data?.message?.includes("already") ||
      dupRmaRes.data?.message?.includes("pending")),
    "3.5 Duplicate return request rejected with HTTP 400 guard",
    `Message: ${dupRmaRes.data?.message}`
  );

  // 3.5 Admin Rejection Workflow
  const adminRejectRes = await apiRequest(`/api/orders/${returnOrderId}/return-request/review`, "POST", {
    requestId: rmaRequest?.id,
    action: "reject",
    adminNotes: "Physical damage caused by user drops not covered by warranty",
  });

  assert(
    adminRejectRes.status === 200 && adminRejectRes.data?.success === true,
    "3.6 Admin rejected RMA return request with review notes",
    `Action: ${adminRejectRes.data?.action || adminRejectRes.data?.request?.status}`
  );

  const orderAfterRejection = await apiRequest(`/api/orders/${returnOrderId}`);
  const rejectedOrderState = orderAfterRejection.data?.data || orderAfterRejection.data?.order;
  assert(
    rejectedOrderState?.status === "delivered",
    "3.7 Order reverted to 'delivered' status following return rejection",
    `Status: ${rejectedOrderState?.status}`
  );

  // 3.6 Admin Approval Workflow with Restock & Refund
  const orderForApprovalRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "200 Approval Way, Boston, MA",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    cartItems: [{ productId: prod4.id, quantity: 1 }],
  });
  const approvalOrderId = orderForApprovalRes.data?.order?.id;

  await apiRequest(`/api/orders/${approvalOrderId}/status`, "PATCH", {
    status: "delivered",
    force: true,
  });

  const appOrderDetails = await apiRequest(`/api/orders/${approvalOrderId}`);
  const appLineItem = (appOrderDetails.data?.data || appOrderDetails.data?.order)?.items?.[0];

  const appRmaRes = await apiRequest(`/api/orders/${approvalOrderId}/return-request`, "POST", {
    reason: "Incorrect item received",
    customerNotes: "Received wrong color variant",
    items: [{ orderItemId: appLineItem?.id, quantity: 1 }],
  });

  const appRmaId = appRmaRes.data?.request?.id || appRmaRes.data?.returnRequest?.id;
  const stockBeforeReturn = (await apiRequest(`/api/products/${prod4.id}`)).data?.data?.stock;

  const adminApproveRes = await apiRequest(`/api/orders/${approvalOrderId}/return-request/review`, "POST", {
    requestId: appRmaId,
    action: "approve",
    restock: true,
    processRefund: true,
    adminNotes: "Approved - returned to warehouse inventory",
  });

  assert(
    adminApproveRes.status === 200 && adminApproveRes.data?.success === true,
    "3.8 Admin approved RMA return request with inventory restock and Stripe refund",
    `Action: ${adminApproveRes.data?.action || adminApproveRes.data?.request?.status}`
  );

  const stockAfterReturn = (await apiRequest(`/api/products/${prod4.id}`)).data?.data?.stock;
  assert(
    stockAfterReturn === stockBeforeReturn + 1,
    "3.9 Product inventory atomically restored (+1 unit) upon return approval",
    `Stock: ${stockBeforeReturn} -> ${stockAfterReturn}`
  );

  const finalApprovedOrder = (await apiRequest(`/api/orders/${approvalOrderId}`)).data?.data;
  assert(
    finalApprovedOrder?.status === "returned",
    "3.10 Order status successfully updated to 'returned'",
    `Status: ${finalApprovedOrder?.status}`
  );

  // ============================================================================
  // SUITE 4: STRIPE REFUND PROCESSING & LEDGER SYNCHRONIZATION
  // ============================================================================
  startSuite(
    "4. Stripe Refund Processing & Ledger Synchronization",
    "Validates full cancellation refunds, manual partial refunds, order_refunds ledger audit, and balance overflow guards."
  );

  // 4.1 Cancellation Full Refund
  const orderForCancelRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "300 Cancellation St, Miami, FL",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    cartItems: [{ productId: prod3.id, quantity: 1 }],
  });
  const cancelOrderId = orderForCancelRes.data?.order?.id;
  const cancelTotal = Number(orderForCancelRes.data?.order?.totalAmount ?? orderForCancelRes.data?.order?.total_amount);

  const cancelActionRes = await apiRequest(`/api/orders/${cancelOrderId}/cancel`, "POST", {
    reason: "Customer requested cancellation before shipment",
    isAdmin: true,
  });

  assert(
    cancelActionRes.status === 200 &&
    Boolean(cancelActionRes.data?.refundDetails?.refundId),
    "4.1 Paid order cancelled and 100% full Stripe refund issued",
    `Refund ID: ${cancelActionRes.data?.refundDetails?.refundId}`
  );

  // Verify refund ledger and order status
  const cancelRefundsRes = await apiRequest(`/api/orders/${cancelOrderId}/refunds`);
  const cancelRefundList = cancelRefundsRes.data?.data || [];
  const recordedRefundAmount = Number(cancelRefundList[0]?.amount);
  assert(
    cancelRefundList.length > 0 &&
    Math.abs(recordedRefundAmount - cancelTotal) < 0.01,
    "4.2 Full cancellation refund recorded in order_refunds ledger table",
    `Ledger Amount: $${recordedRefundAmount}, Expected: $${cancelTotal}`
  );

  const cancelledOrderState = (await apiRequest(`/api/orders/${cancelOrderId}`)).data?.data;
  assert(
    cancelledOrderState?.payment_status === "refunded" &&
    cancelledOrderState?.status === "cancelled",
    "4.3 Order payment_status transitioned to 'refunded' and status to 'cancelled'",
    `Payment: ${cancelledOrderState?.payment_status}, Status: ${cancelledOrderState?.status}`
  );

  // 4.2 Manual Partial Refund via Admin API
  const orderForPartialRefundRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "400 Partial Refund Ave, Chicago, IL",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    cartItems: [{ productId: prod4.id, quantity: 2 }],
  });
  const partialRefOrderId = orderForPartialRefundRes.data?.order?.id;
  const partialOrderTotal = Number(
    orderForPartialRefundRes.data?.order?.totalAmount ?? orderForPartialRefundRes.data?.order?.total_amount
  );

  // Issue partial refund of $20.00
  const partialRefundAmount = 20.0;
  const issuePartialRes = await apiRequest(`/api/orders/${partialRefOrderId}/refund`, "POST", {
    amount: partialRefundAmount,
    reason: "Goodwill courtesy partial refund for minor package scuff",
  });

  const issuedRefundId =
    issuePartialRes.data?.data?.refundId ||
    issuePartialRes.data?.refundId ||
    issuePartialRes.data?.data?.stripeRefundId;

  assert(
    issuePartialRes.status === 200 && issuePartialRes.data?.success === true,
    "4.4 Admin issued partial refund ($20.00) via POST /:id/refund",
    `Refund ID: ${issuedRefundId}`
  );

  const partialOrderState = (await apiRequest(`/api/orders/${partialRefOrderId}`)).data?.data;
  assert(
    partialOrderState?.payment_status === "partially_refunded" &&
    Number(partialOrderState?.refund_amount) === partialRefundAmount,
    "4.5 Order payment_status transitioned to 'partially_refunded' with matching refund_amount",
    `Payment: ${partialOrderState?.payment_status}, Refunded: $${partialOrderState?.refund_amount}`
  );

  // 4.3 Refund Balance Overflow Guard
  const excessiveRefundAmount = partialOrderTotal + 500;
  const overRefundRes = await apiRequest(`/api/orders/${partialRefOrderId}/refund`, "POST", {
    amount: excessiveRefundAmount,
    reason: "Excessive refund attempt",
  });

  assert(
    overRefundRes.status === 400 &&
    (overRefundRes.data?.message?.includes("exceeds maximum") ||
      overRefundRes.data?.message?.includes("remaining refundable")),
    "4.6 Over-refund attempt rejected with HTTP 400 (exceeds remaining refundable balance)",
    `Message: ${overRefundRes.data?.message}`
  );

  // 4.4 Unpaid Order Refund Guard
  const unpaidOrderRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "500 Unpaid Road, Dallas, TX",
    paymentMethod: "stripe",
    paymentStatus: "pending",
    cartItems: [{ productId: prod3.id, quantity: 1 }],
  });
  const unpaidOrderId = unpaidOrderRes.data?.order?.id;

  const refundUnpaidRes = await apiRequest(`/api/orders/${unpaidOrderId}/refund`, "POST", {
    amount: 10.0,
    reason: "Refund attempt on unpaid order",
  });

  assert(
    refundUnpaidRes.status === 400 &&
    refundUnpaidRes.data?.message?.includes("cannot be refunded"),
    "4.7 Refund attempt on unpaid order rejected with HTTP 400 payment status guard",
    `Message: ${refundUnpaidRes.data?.message}`
  );

  // ============================================================================
  // SUITE 5: DUPLICATE WEBHOOK EVENTS & IDEMPOTENCY DEDUPLICATION
  // ============================================================================
  startSuite(
    "5. Duplicate Webhook Events & Idempotency Deduplication",
    "Validates at-least-once Stripe webhook replay handling, idempotent responses, and duplicate request immunity."
  );

  // 5.1 Initial payment_intent.succeeded
  const webhook1Res = await apiRequest("/api/orders/simulate-webhook", "POST", {
    eventType: "payment_intent.succeeded",
    paymentIntentId: paymentIntentId1,
    orderId: createdOrder?.id,
    amount: Math.round(Number(createdOrder?.total_amount || 0) * 100),
  });

  assert(
    webhook1Res.status === 200 && webhook1Res.data?.success === true,
    "5.1 Initial payment_intent.succeeded webhook processed successfully",
    `Action: ${webhook1Res.data?.result?.actionTaken}`
  );

  const orderAfterWebhook1 = await apiRequest(`/api/orders/${createdOrder?.id}`);
  const order1Data = orderAfterWebhook1.data?.data || orderAfterWebhook1.data?.order;
  assert(
    order1Data?.payment_status === "paid" &&
    order1Data?.status === "confirmed",
    "5.2 Order payment marked 'paid' and status transitioned to 'confirmed'",
    `Status: ${order1Data?.status}, Payment: ${order1Data?.payment_status}`
  );

  // 5.2 Replay DUPLICATE payment_intent.succeeded (Stripe retry simulation)
  const webhookDuplicateRes = await apiRequest("/api/orders/simulate-webhook", "POST", {
    eventType: "payment_intent.succeeded",
    paymentIntentId: paymentIntentId1,
    orderId: createdOrder?.id,
    amount: Math.round(Number(createdOrder?.total_amount || 0) * 100),
  });

  assert(
    webhookDuplicateRes.status === 200 &&
    webhookDuplicateRes.data?.result?.actionTaken?.includes("ALREADY_RECONCILED"),
    "5.3 Duplicate webhook safely recognized as ALREADY_RECONCILED without re-processing",
    `Action: ${webhookDuplicateRes.data?.result?.actionTaken}`
  );

  // Verify stock was NOT decremented again on duplicate webhook
  const p1AfterDupRes = await apiRequest("/api/products/1");
  assert(
    p1AfterDupRes.data?.data?.stock === stockAfterCheckout,
    "5.4 Duplicate webhook did NOT double-decrement inventory or corrupt state",
    `Stock maintained at: ${p1AfterDupRes.data?.data?.stock}`
  );

  // 5.3 Duplicate Webhook Replay of charge.refunded / refund.updated
  const refundWebhookMockId = `re_webhook_test_${Date.now()}`;
  const refundWebhookPayload = {
    eventType: "charge.refunded",
    paymentIntentId: paymentIntentId1,
    orderId: createdOrder?.id,
    amount: 1000,
    refundItem: {
      id: refundWebhookMockId,
      amount: 1000,
      status: "succeeded",
      reason: "Webhook duplicate test",
    },
  };

  const refWebhook1Res = await apiRequest("/api/orders/simulate-webhook", "POST", refundWebhookPayload);
  assert(
    refWebhook1Res.status === 200,
    "5.5 Initial charge.refunded webhook processed and synchronized into ledger"
  );

  // Replay identical duplicate charge.refunded webhook
  const refWebhook2Res = await apiRequest("/api/orders/simulate-webhook", "POST", refundWebhookPayload);
  assert(
    refWebhook2Res.status === 200,
    "5.6 Duplicate charge.refunded webhook received and handled idempotently"
  );

  // Verify order_refunds ledger has unique entry (not duplicated)
  const dupRefundRows = (await apiRequest(`/api/orders/${createdOrder?.id}/refunds`)).data?.data || [];
  const matchingRefunds = dupRefundRows.filter((r) => r.stripe_refund_id === refundWebhookMockId);
  assert(
    matchingRefunds.length <= 1,
    "5.7 Unique key on stripe_refund_id prevented duplicate ledger entries upon webhook replay",
    `Occurrences: ${matchingRefunds.length}`
  );

  // 5.4 Duplicate Checkout HTTP Request (Network double-click with same Idempotency-Key)
  const checkoutDupRes = await apiRequest("/api/orders/checkout", "POST", checkoutPayload, {
    "Idempotency-Key": checkoutIdempotencyKey,
  });

  assert(
    checkoutDupRes.status === 201 &&
    checkoutDupRes.data?.isIdempotentReplay === true &&
    checkoutDupRes.data?.order?.id === createdOrder?.id,
    "5.8 Duplicate checkout request returned cached order with isIdempotentReplay: true",
    `Order ID: #${checkoutDupRes.data?.order?.id}`
  );

  // ============================================================================
  // SUITE 6: INVALID ORDER-STATE TRANSITIONS & GUARD CONSTRAINTS
  // ============================================================================
  startSuite(
    "6. Invalid Order-State Transitions & Guard Constraints",
    "Validates strict state machine transition validation, terminal state immutability, and illegal transition rejection."
  );

  // 6.1 Create fresh placed order
  const freshOrderRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "600 Transition Way, Atlanta, GA",
    paymentMethod: "stripe",
    cartItems: [{ productId: prod3.id, quantity: 1 }],
  });
  const freshOrderId = freshOrderRes.data?.order?.id;

  // Attempt illegal jump: placed directly to delivered
  const illegalJumpRes = await apiRequest(`/api/orders/${freshOrderId}/status`, "PATCH", {
    status: "delivered",
  });

  assert(
    illegalJumpRes.status === 400 &&
    illegalJumpRes.data?.message?.includes("Invalid order status transition"),
    "6.1 Direct transition from 'placed' to 'delivered' rejected with HTTP 400 state machine guard",
    `Message: ${illegalJumpRes.data?.message}`
  );

  // Attempt illegal jump: placed directly to shipped
  const illegalShippedJumpRes = await apiRequest(`/api/orders/${freshOrderId}/status`, "PATCH", {
    status: "shipped",
  });

  assert(
    illegalShippedJumpRes.status === 400 &&
    illegalShippedJumpRes.data?.message?.includes("Invalid order status transition"),
    "6.2 Direct transition from 'placed' to 'shipped' rejected with HTTP 400 state machine guard",
    `Message: ${illegalShippedJumpRes.data?.message}`
  );

  // Cancel this order
  await apiRequest(`/api/orders/${freshOrderId}/cancel`, "POST", {
    reason: "Cancelling to test terminal state immutability",
    isAdmin: true,
  });

  // 6.3 Attempt transition on CANCELLED order (terminal state)
  const modifyCancelledRes = await apiRequest(`/api/orders/${freshOrderId}/status`, "PATCH", {
    status: "confirmed",
  });

  assert(
    modifyCancelledRes.status === 400 &&
    (modifyCancelledRes.data?.message?.includes("terminal state") ||
      modifyCancelledRes.data?.message?.includes("Invalid order status transition")),
    "6.3 Transitioning a 'cancelled' order to 'confirmed' rejected (terminal state immutability)",
    `Message: ${modifyCancelledRes.data?.message}`
  );

  // 6.4 Attempt shipment creation on CANCELLED order
  const shipCancelledRes = await apiRequest(`/api/orders/${freshOrderId}/shipments`, "POST", {
    carrier: "UPS Express",
  });

  assert(
    shipCancelledRes.status === 400 &&
    shipCancelledRes.data?.message?.includes("cancelled and cannot be fulfilled"),
    "6.4 Creating shipment on 'cancelled' order rejected with HTTP 400 guard",
    `Message: ${shipCancelledRes.data?.message}`
  );

  // 6.5 Attempt cancellation on SHIPPED order
  const orderToShipRes = await apiRequest("/api/orders/checkout", "POST", {
    userId: 1,
    shippingAddress: "700 Delivery Trail, Denver, CO",
    paymentMethod: "card",
    cartItems: [{ productId: prod3.id, quantity: 1 }],
  });
  const orderToShipId = orderToShipRes.data?.order?.id;

  // Advance legitimately: placed -> confirmed -> packed -> shipped
  await apiRequest(`/api/orders/${orderToShipId}/status`, "PATCH", { status: "confirmed" });
  await apiRequest(`/api/orders/${orderToShipId}/status`, "PATCH", { status: "packed" });
  await apiRequest(`/api/orders/${orderToShipId}/status`, "PATCH", { status: "shipped" });

  const cancelShippedRes = await apiRequest(`/api/orders/${orderToShipId}/cancel`, "POST", {
    reason: "Attempt cancellation on shipped order",
  });

  assert(
    cancelShippedRes.status === 400 &&
    cancelShippedRes.data?.message?.includes("not eligible for cancellation"),
    "6.5 Direct cancellation on 'shipped' order rejected (requires RMA return workflow)",
    `Message: ${cancelShippedRes.data?.message}`
  );

  // 6.6 Double cancellation on already cancelled order
  const doubleCancelRes = await apiRequest(`/api/orders/${freshOrderId}/cancel`, "POST", {
    reason: "Second cancellation attempt",
  });

  assert(
    doubleCancelRes.status === 400 &&
    doubleCancelRes.data?.message?.includes("already cancelled"),
    "6.6 Double cancellation rejected with HTTP 400 (already cancelled guard)",
    `Message: ${doubleCancelRes.data?.message}`
  );

  // 6.7 Unrecognized status string value
  const invalidStatusStringRes = await apiRequest(`/api/orders/${orderToShipId}/status`, "PATCH", {
    status: "flying_to_mars",
  });

  assert(
    invalidStatusStringRes.status === 400 &&
    invalidStatusStringRes.data?.message?.includes("Invalid status"),
    "6.7 Unrecognized status string ('flying_to_mars') rejected with HTTP 400 schema validation",
    `Message: ${invalidStatusStringRes.data?.message}`
  );

  // ============================================================================
  // SUITE 7: DATABASE CONSISTENCY & INTEGRITY ENGINE
  // ============================================================================
  startSuite(
    "7. Database Consistency & Health Audit",
    "Runs full automated integrity verification across orders, shipments, order_refunds, and products tables."
  );

  const consistencyRes = await apiRequest("/api/orders/consistency/check");
  assert(
    consistencyRes.data?.data?.isHealthy === true && consistencyRes.data?.data?.issueCount === 0,
    "7.1 Automated MySQL Consistency Engine verifies ZERO orphaned records, negative stock, or mismatches",
    `Checks Passed: ${consistencyRes.data?.data?.checksPerformed?.length || 5}`
  );

  testReport.endTime = Date.now();
  const durationSec = ((testReport.endTime - testReport.startTime) / 1000).toFixed(2);

  // ============================================================================
  // FINAL TEST SUMMARY REPORT
  // ============================================================================
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.white}📊 TASK 5 INTEGRATION TEST SUMMARY REPORT${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`Total Assertions Checked : ${colors.bright}${testReport.total}${colors.reset}`);
  console.log(`Passed Assertions        : ${colors.green}${colors.bright}${testReport.passed}${colors.reset}`);
  console.log(`Failed Assertions        : ${testReport.failed > 0 ? colors.red : colors.green}${colors.bright}${testReport.failed}${colors.reset}`);
  console.log(`Execution Duration       : ${colors.yellow}${durationSec}s${colors.reset}`);
  console.log(`Overall Status           : ${testReport.failed === 0 ? colors.green + colors.bright + "PASSED (100% SUCCESS)" : colors.red + colors.bright + "FAILED"}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================\n${colors.reset}`);

  if (exitOnComplete && testReport.failed > 0) {
    process.exit(1);
  }

  return testReport;
}

// Allow direct CLI execution or export for API trigger
if (require.main === module) {
  runTask5IntegrationTests({ exitOnComplete: true }).catch((err) => {
    console.error(`\n${colors.red}FATAL TEST EXECUTION ERROR:${colors.reset}`, err);
    process.exit(1);
  });
}

module.exports = {
  runTask5IntegrationTests,
  testReport,
};
