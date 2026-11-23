/**
 * testStripeRefundSync.js
 * Comprehensive Integration Test Suite for Task 3:
 * - Stripe Test Flow Refund Processing Integration
 * - Database Synchronization (orders table refund columns & order_refunds table)
 * - Cancellation Refund Flow
 * - Return RMA Partial / Full Refund Flow
 * - Stripe Webhook Reconciliation (charge.refunded & refund.updated)
 * - Manual Admin Refund & Order Refunds Retrieval
 */

const assert = require("assert");
const db = require("../config/db");
const initDatabase = require("../config/initTables");
const stripeService = require("../services/stripeService");
const orderService = require("../services/orderService");

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING TASK 3: STRIPE TEST FLOW REFUND PROCESSING & DB SYNCHRONIZATION");
  console.log("================================================================================");

  await initDatabase();

  // Clean / prepare test products
  const [testProducts] = await db.query(
    "SELECT id, name, price, stock FROM products WHERE stock >= 10 LIMIT 2"
  );
  if (!testProducts || testProducts.length < 2) {
    throw new Error("Requires at least 2 catalog products with stock >= 10");
  }
  const prodA = testProducts[0];
  const prodB = testProducts[1];
  console.log(`📦 Catalog Products: #${prodA.id} "${prodA.name}" (Stock: ${prodA.stock}), #${prodB.id} "${prodB.name}" (Stock: ${prodB.stock})`);

  // ---------------------------------------------------------------------------
  // TEST 1: Full Refund on Order Cancellation & Database Synchronization
  // ---------------------------------------------------------------------------
  console.log("\n--- [TEST 1: CANCELLATION REFUND SYNCHRONIZATION] ---");
  const initialStockA = prodA.stock;

  // 1. Create a paid order via direct DB insertion with Stripe PaymentIntent
  const testPiA = `pi_test_${Date.now()}_ord1`;
  const orderATotal = 149.99;
  const [orderAInsert] = await db.query(
    `INSERT INTO orders 
     (user_id, total_amount, status, payment_status, stripe_payment_intent_id, payment_method, shipping_address)
     VALUES (1, ?, 'confirmed', 'paid', ?, 'stripe', '123 Test St, Silicon Valley, CA')`,
    [orderATotal, testPiA]
  );
  const orderAId = orderAInsert.insertId;

  // Add line item
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 2, ?)`,
    [orderAId, prodA.id, 74.995]
  );
  // Decrement stock to simulate reserve
  await db.query(`UPDATE products SET stock = stock - 2 WHERE id = ?`, [prodA.id]);

  console.log(`Created Paid Order #${orderAId} ($${orderATotal}) with Stripe PaymentIntent: ${testPiA}`);

  // 2. Execute cancel and refund
  const cancelRes = await orderService.cancelAndRefundOrder({
    orderId: orderAId,
    userId: 1,
    reason: "Customer changed mind before shipping",
    isAdmin: true,
  });

  assert.strictEqual(cancelRes.order.status, "cancelled", "Order status must be 'cancelled'");
  assert.strictEqual(cancelRes.order.payment_status, "refunded", "Order payment_status must be 'refunded'");

  // 3. Verify orders table synchronized columns
  const [orderARows] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderAId]);
  const orderARecord = orderARows[0];
  assert.strictEqual(orderARecord.payment_status, "refunded", "orders.payment_status must be 'refunded'");
  assert.strictEqual(orderARecord.refund_status, "succeeded", "orders.refund_status must be 'succeeded'");
  assert.ok(orderARecord.stripe_refund_id, "orders.stripe_refund_id must be populated");
  assert.ok(orderARecord.stripe_refund_id.startsWith("re_"), "Stripe refund ID must start with 're_'");
  assert.strictEqual(Number(orderARecord.refund_amount), orderATotal, `Refund amount must equal total ($${orderATotal})`);
  assert.ok(orderARecord.refunded_at, "orders.refunded_at must be populated");

  // 4. Verify order_refunds table audit record
  const [refundRowsA] = await db.query(`SELECT * FROM order_refunds WHERE order_id = ?`, [orderAId]);
  assert.strictEqual(refundRowsA.length, 1, "Exactly 1 order_refunds row must exist");
  assert.strictEqual(refundRowsA[0].stripe_refund_id, orderARecord.stripe_refund_id);
  assert.strictEqual(Number(refundRowsA[0].amount), orderATotal);
  assert.strictEqual(refundRowsA[0].status, "succeeded");
  assert.strictEqual(refundRowsA[0].source, "cancellation");

  // 5. Verify product stock restored
  const [stockARows] = await db.query(`SELECT stock FROM products WHERE id = ?`, [prodA.id]);
  assert.strictEqual(stockARows[0].stock, initialStockA, "Stock must be restored to initial level");
  console.log(`✅ Test 1 Passed: Order #${orderAId} cancelled, Stripe refund (${orderARecord.stripe_refund_id}) synchronized to orders & order_refunds, stock restored.`);

  // ---------------------------------------------------------------------------
  // TEST 2: Partial Refund on Return (RMA) Approval & Database Synchronization
  // ---------------------------------------------------------------------------
  console.log("\n--- [TEST 2: RETURN (RMA) REFUND SYNCHRONIZATION] ---");
  const testPiB = `pi_test_${Date.now()}_ord2`;
  const orderBTotal = 299.98;
  const [orderBInsert] = await db.query(
    `INSERT INTO orders 
     (user_id, total_amount, status, payment_status, stripe_payment_intent_id, payment_method, shipping_address)
     VALUES (1, ?, 'delivered', 'paid', ?, 'stripe', '456 Express Blvd, Austin, TX')`,
    [orderBTotal, testPiB]
  );
  const orderBId = orderBInsert.insertId;

  // Add 2 items: 1 of prodA ($99.99), 1 of prodB ($199.99)
  const [itemAInsert] = await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, 99.99)`,
    [orderBId, prodA.id]
  );
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, 199.99)`,
    [orderBId, prodB.id]
  );

  console.log(`Created Delivered Order #${orderBId} ($${orderBTotal}) with Stripe PaymentIntent: ${testPiB}`);

  // Customer submits return request for item A ($99.99)
  const returnReq = await orderService.requestOrderReturn({
    orderId: orderBId,
    userId: 1,
    reason: "defective",
    notes: "Item A has a cracked casing",
    items: [{ orderItemId: itemAInsert.insertId, quantity: 1 }],
  });
  console.log(`Return request #${returnReq.returnRequest.id} submitted for Order #${orderBId}`);

  // Admin approves return request
  const reviewRes = await orderService.reviewReturnRequest({
    orderId: orderBId,
    requestId: returnReq.returnRequest.id,
    action: "approve",
    adminNotes: "Damaged item inspected; refund approved.",
    restockInventory: false,
    adminId: 1,
  });

  assert.strictEqual(reviewRes.order.status, "returned", "Order status must be 'returned'");
  assert.strictEqual(reviewRes.order.payment_status, "refunded", "Order payment_status must be 'refunded'");

  // Check order_refunds table has entry with source 'return'
  const [refundRowsB] = await db.query(`SELECT * FROM order_refunds WHERE order_id = ?`, [orderBId]);
  assert.ok(refundRowsB.length >= 1, "order_refunds must contain refund for Order B");
  assert.strictEqual(refundRowsB[0].source, "return");
  assert.strictEqual(refundRowsB[0].status, "succeeded");
  assert.ok(refundRowsB[0].stripe_refund_id.startsWith("re_"));

  // Check order details include refundInfo
  const fullOrderB = await orderService.getOrderDetailsById(orderBId);
  assert.ok(fullOrderB.refundInfo.isRefunded, "refundInfo.isRefunded must be true");
  assert.strictEqual(fullOrderB.refundInfo.stripeRefundId, refundRowsB[0].stripe_refund_id);
  console.log(`✅ Test 2 Passed: Return approved, Stripe refund (${refundRowsB[0].stripe_refund_id}) synchronized with source 'return'.`);

  // ---------------------------------------------------------------------------
  // TEST 3: Stripe Webhook Synchronization (charge.refunded & refund.updated)
  // ---------------------------------------------------------------------------
  console.log("\n--- [TEST 3: STRIPE WEBHOOK EVENT RECONCILIATION] ---");
  const testPiC = `pi_test_${Date.now()}_ord3`;
  const orderCTotal = 89.50;
  const [orderCInsert] = await db.query(
    `INSERT INTO orders 
     (user_id, total_amount, status, payment_status, stripe_payment_intent_id, payment_method, shipping_address)
     VALUES (1, ?, 'placed', 'paid', ?, 'stripe', '789 Webhook Lane, New York, NY')`,
    [orderCTotal, testPiC]
  );
  const orderCId = orderCInsert.insertId;

  // Add line item
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, 1, ?)`,
    [orderCId, prodA.id, orderCTotal]
  );

  console.log(`Created Order #${orderCId} awaiting webhook refund settlement for PaymentIntent: ${testPiC}`);

  // 3A. Simulate charge.refunded event
  const webhookEventA = stripeService.simulateWebhookEvent("charge.refunded", testPiC, {
    orderId: orderCId,
    amount: orderCTotal,
    amountInCents: Math.round(orderCTotal * 100),
    refundId: `re_hook_${Date.now()}`,
    reason: "fraudulent",
  });

  const webhookResultA = await orderService.handleStripeWebhook(webhookEventA);
  assert.strictEqual(webhookResultA.reconciliation.newPaymentStatus, "refunded", "Payment status must be 'refunded'");
  assert.ok(webhookResultA.reconciliation.refundId.startsWith("re_hook_"), "Refund ID must match webhook payload");

  // Check database orders row updated
  const [orderCRows] = await db.query(`SELECT * FROM orders WHERE id = ?`, [orderCId]);
  assert.strictEqual(orderCRows[0].payment_status, "refunded");
  assert.strictEqual(orderCRows[0].refund_status, "succeeded");
  assert.strictEqual(orderCRows[0].stripe_refund_id, webhookResultA.reconciliation.refundId);

  // Check order_refunds table has source 'webhook'
  const [refundRowsC] = await db.query(`SELECT * FROM order_refunds WHERE order_id = ?`, [orderCId]);
  assert.ok(refundRowsC.length >= 1, "order_refunds must contain row for webhook event");
  assert.strictEqual(refundRowsC[0].source, "webhook");
  assert.strictEqual(refundRowsC[0].stripe_refund_id, webhookResultA.reconciliation.refundId);
  console.log(`✅ Test 3A Passed: charge.refunded webhook reconciled & synchronized Order #${orderCId} to 'refunded'.`);

  // 3B. Simulate refund.updated event (idempotent status check)
  const webhookEventB = stripeService.simulateWebhookEvent("refund.updated", testPiC, {
    orderId: orderCId,
    refundId: webhookResultA.reconciliation.refundId,
    status: "succeeded",
    amountInCents: Math.round(orderCTotal * 100),
  });

  const webhookResultB = await orderService.handleStripeWebhook(webhookEventB);
  assert.strictEqual(webhookResultB.reconciliation.newPaymentStatus, "refunded");
  console.log(`✅ Test 3B Passed: refund.updated webhook reconciled idempotently.`);

  // ---------------------------------------------------------------------------
  // TEST 4: Manual Admin Refund API & getOrderRefunds Retrieval
  // ---------------------------------------------------------------------------
  console.log("\n--- [TEST 4: MANUAL ADMIN REFUND & REFUNDS QUERY] ---");
  const testPiD = `pi_test_${Date.now()}_ord4`;
  const orderDTotal = 50.00;
  const [orderDInsert] = await db.query(
    `INSERT INTO orders 
     (user_id, total_amount, status, payment_status, stripe_payment_intent_id, payment_method, shipping_address)
     VALUES (1, ?, 'confirmed', 'paid', ?, 'stripe', '321 Manual Ave, Seattle, WA')`,
    [orderDTotal, testPiD]
  );
  const orderDId = orderDInsert.insertId;

  // Manual refund of $20.00 (partial goodwill refund)
  const manualRefundRes = await orderService.issueManualRefund({
    orderId: orderDId,
    amount: 20.00,
    reason: "Goodwill customer service credit",
    adminId: 1,
  });

  assert.strictEqual(manualRefundRes.success, true);
  assert.strictEqual(manualRefundRes.amount, 20.00);
  assert.strictEqual(manualRefundRes.status, "succeeded");

  // Query refunds via getOrderRefunds
  const refundsD = await orderService.getOrderRefunds(orderDId);
  assert.strictEqual(refundsD.length, 1);
  assert.strictEqual(Number(refundsD[0].amount), 20.00);
  assert.strictEqual(refundsD[0].source, "manual");
  assert.strictEqual(refundsD[0].reason, "Goodwill customer service credit");
  console.log(`✅ Test 4 Passed: Manual partial refund ($20.00) issued, recorded in order_refunds, and retrieved.`);

  console.log("================================================================================");
  console.log("🎉 ALL TASK 3 STRIPE REFUND & DATABASE SYNCHRONIZATION ASSERTIONS PASSED!");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
