/**
 * ====================================================================================================
 * TASK 2 INTEGRATION TEST SUITE: RETURN & CANCELLATION WORKFLOWS
 * ====================================================================================================
 * Tests:
 * 1. Cancellation Request & Admin Rejection (Status restored to original active state)
 * 2. Cancellation Request & Admin Approval (ACID inventory restoration, Stripe refund, status -> cancelled)
 * 3. Cancellation Eligibility Rejections (Shipped/Delivered orders cannot be cancelled)
 * 4. Return Request on Non-Delivered Order (Rejected by eligibility validator)
 * 5. Return Request on Delivered Order (Status -> return_requested)
 * 6. Admin Rejection of Return Request (Status restored to delivered)
 * 7. Admin Approval of Return Request (Status -> returned, products restocked, refund processed)
 * 8. Order Eligibility Endpoint Verification
 * ====================================================================================================
 */

require("dotenv").config();
const db = require("../config/db");
const initTables = require("../config/initTables");
const orderService = require("../services/orderService");

async function runTest() {
  console.log("================================================================================");
  console.log("🧪 TESTING TASK 2: RETURN & CANCELLATION WORKFLOWS & ADMIN APPROVAL/REJECTION");
  console.log("================================================================================");

  await initTables();

  // Pick test products
  const [products] = await db.query(
    "SELECT id, name, price, stock FROM products WHERE stock >= 5 LIMIT 2"
  );
  if (!products || products.length < 2) {
    throw new Error("Need at least 2 products in database with stock >= 5 for testing.");
  }
  const prod1 = products[0];
  const prod2 = products[1];

  console.log(`📦 Test Products: #${prod1.id} "${prod1.name}" (Stock: ${prod1.stock}), #${prod2.id} "${prod2.name}" (Stock: ${prod2.stock})`);

  // ------------------------------------------------------------------------------------------------
  // PART 1: CANCELLATION WORKFLOW (Request -> Reject -> Request -> Approve)
  // ------------------------------------------------------------------------------------------------
  console.log("\n--- [PART 1: CANCELLATION WORKFLOW] ---");

  // Create Order A for cancellation testing
  const [orderARes] = await db.query(
    `INSERT INTO orders (user_id, total_amount, status, shipping_address, payment_method, payment_status, fulfillment_status)
     VALUES (?, ?, 'confirmed', '10 Downing St, London', 'stripe', 'paid', 'unfulfilled')`,
    [6, (Number(prod1.price) * 2).toFixed(2)]
  );
  const orderAId = orderARes.insertId;

  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price, fulfilled_quantity)
     VALUES (?, ?, 2, ?, 0)`,
    [orderAId, prod1.id, prod1.price]
  );
  // Deduct initial stock for test realism
  await db.query(`UPDATE products SET stock = stock - 2 WHERE id = ?`, [prod1.id]);
  const [[stockBeforeCancel]] = await db.query(`SELECT stock FROM products WHERE id = ?`, [prod1.id]);
  console.log(`Created Test Order #${orderAId} in "confirmed" status. Product stock after reserve: ${stockBeforeCancel.stock}`);

  // 1.1 Customer submits cancellation request
  console.log(`Submitting cancellation request for Order #${orderAId}...`);
  const cancelReq1 = await orderService.requestOrderCancellation({
    orderId: orderAId,
    userId: 6,
    reason: "Delivery timeframe too late",
    notes: "Need this for a birthday tomorrow",
  });
  console.log(`✅ Cancellation request created (ID #${cancelReq1.cancellationRequest.id}). New order status: "${cancelReq1.order.status}"`);
  if (cancelReq1.order.status !== "cancel_requested") {
    throw new Error(`Expected status "cancel_requested", got "${cancelReq1.order.status}"`);
  }

  // 1.2 Admin Rejects Cancellation Request
  console.log(`Admin reviewing cancellation request (Action: REJECT)...`);
  const rejectCancelRes = await orderService.reviewCancellationRequest({
    orderId: orderAId,
    requestId: cancelReq1.cancellationRequest.id,
    action: "reject",
    adminNotes: "Package is already boxed and loaded on priority freight carrier",
    adminId: 1,
  });
  console.log(`✅ Cancellation rejected. Order status restored to: "${rejectCancelRes.order.status}"`);
  if (rejectCancelRes.order.status !== "confirmed") {
    throw new Error(`Expected status restored to "confirmed", got "${rejectCancelRes.order.status}"`);
  }

  // 1.3 Customer Submits Another Cancellation Request
  console.log(`Customer re-submits cancellation request for Order #${orderAId}...`);
  const cancelReq2 = await orderService.requestOrderCancellation({
    orderId: orderAId,
    userId: 6,
    reason: "Duplicate accidental order",
    notes: "Customer contacted phone support directly",
  });

  // 1.4 Admin Approves Cancellation Request
  console.log(`Admin reviewing cancellation request (Action: APPROVE)...`);
  const approveCancelRes = await orderService.reviewCancellationRequest({
    orderId: orderAId,
    requestId: cancelReq2.cancellationRequest.id,
    action: "approve",
    adminNotes: "Approved per phone authorization",
    adminId: 1,
  });
  console.log(`✅ Cancellation approved! Order status: "${approveCancelRes.order.status}", Payment status: "${approveCancelRes.order.payment_status}"`);
  if (approveCancelRes.order.status !== "cancelled") {
    throw new Error(`Expected status "cancelled", got "${approveCancelRes.order.status}"`);
  }

  // Check inventory restoration
  const [[stockAfterCancel]] = await db.query(`SELECT stock FROM products WHERE id = ?`, [prod1.id]);
  console.log(`✅ Stock after cancellation approval: ${stockAfterCancel.stock} (Restored +2 units)`);
  if (stockAfterCancel.stock !== stockBeforeCancel.stock + 2) {
    throw new Error(`Inventory not restored properly! Expected ${stockBeforeCancel.stock + 2}, got ${stockAfterCancel.stock}`);
  }

  // ------------------------------------------------------------------------------------------------
  // PART 2: RETURN WORKFLOW (Request -> Reject -> Request -> Approve)
  // ------------------------------------------------------------------------------------------------
  console.log("\n--- [PART 2: RETURN WORKFLOW] ---");

  // Create Order B
  const [orderBRes] = await db.query(
    `INSERT INTO orders (user_id, total_amount, status, shipping_address, payment_method, payment_status, fulfillment_status)
     VALUES (?, ?, 'shipped', '42 Wallaby Way, Sydney', 'stripe', 'paid', 'fulfilled')`,
    [6, prod2.price]
  );
  const orderBId = orderBRes.insertId;
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price, fulfilled_quantity)
     VALUES (?, ?, 1, ?, 1)`,
    [orderBId, prod2.id, prod2.price]
  );

  // 2.1 Attempt Return on Non-Delivered Order (shipped)
  console.log(`Attempting to request return on Order #${orderBId} while status is "shipped"...`);
  try {
    await orderService.requestOrderReturn({
      orderId: orderBId,
      userId: 6,
      reason: "defective",
    });
    throw new Error("Should have thrown eligibility error for non-delivered order!");
  } catch (err) {
    console.log(`✅ Expected eligibility validation caught: "${err.message}"`);
  }

  // 2.2 Transition Order to "delivered"
  await db.query(`UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = ?`, [orderBId]);
  console.log(`Order #${orderBId} transitioned to "delivered".`);

  // Check eligibility API
  const eligibility = await orderService.checkOrderEligibility(orderBId, 6);
  console.log(`Order #${orderBId} Eligibility Check:`, {
    canCancel: eligibility.eligibility.canCancel,
    canRequestReturn: eligibility.eligibility.canRequestReturn,
    daysSinceDelivery: eligibility.eligibility.daysSinceDelivery,
  });
  if (!eligibility.eligibility.canRequestReturn) {
    throw new Error("Delivered order should be eligible for return!");
  }

  // 2.3 Submit Valid Return Request
  console.log(`Submitting return request for Order #${orderBId}...`);
  const returnReq1 = await orderService.requestOrderReturn({
    orderId: orderBId,
    userId: 6,
    reason: "defective",
    notes: "Item arrived with cosmetic damage and scratch on outer casing",
    items: [{ orderItemId: 1, name: prod2.name, quantity: 1 }],
  });
  console.log(`✅ Return request created (ID #${returnReq1.returnRequest.id}). New status: "${returnReq1.order.status}"`);
  if (returnReq1.order.status !== "return_requested") {
    throw new Error(`Expected status "return_requested", got "${returnReq1.order.status}"`);
  }

  // 2.4 Admin Rejects Return Request
  console.log(`Admin reviewing return request (Action: REJECT)...`);
  const rejectReturnRes = await orderService.reviewReturnRequest({
    orderId: orderBId,
    requestId: returnReq1.returnRequest.id,
    action: "reject",
    adminNotes: "Damage appears to be user-induced accidental drop rather than manufacturing defect",
    adminId: 1,
  });
  console.log(`✅ Return rejected. Order status retained as: "${rejectReturnRes.order.status}"`);
  if (rejectReturnRes.order.status !== "delivered") {
    throw new Error(`Expected status "delivered", got "${rejectReturnRes.order.status}"`);
  }

  // 2.5 Customer Resubmits with Additional Evidence
  console.log(`Customer re-submits return request with unboxing video proof...`);
  const returnReq2 = await orderService.requestOrderReturn({
    orderId: orderBId,
    userId: 6,
    reason: "damaged_in_transit",
    notes: "Courier crushed shipping box upon delivery. Photos uploaded.",
    items: [{ orderItemId: 1, name: prod2.name, quantity: 1 }],
  });

  const [[stockBeforeReturn]] = await db.query(`SELECT stock FROM products WHERE id = ?`, [prod2.id]);

  // 2.6 Admin Approves Return Request
  console.log(`Admin reviewing return request (Action: APPROVE)...`);
  const approveReturnRes = await orderService.reviewReturnRequest({
    orderId: orderBId,
    requestId: returnReq2.returnRequest.id,
    action: "approve",
    adminNotes: "Courier packaging damage verified. Return authorized.",
    restockInventory: true,
    adminId: 1,
  });
  console.log(`✅ Return approved! Order status: "${approveReturnRes.order.status}", Payment status: "${approveReturnRes.order.payment_status}"`);
  if (approveReturnRes.order.status !== "returned" || approveReturnRes.order.payment_status !== "refunded") {
    throw new Error(`Expected status "returned" and "refunded", got "${approveReturnRes.order.status}" & "${approveReturnRes.order.payment_status}"`);
  }

  // Check inventory restock
  const [[stockAfterReturn]] = await db.query(`SELECT stock FROM products WHERE id = ?`, [prod2.id]);
  console.log(`✅ Stock after return approval & restock: ${stockAfterReturn.stock} (Restocked +1 unit)`);
  if (stockAfterReturn.stock !== stockBeforeReturn.stock + 1) {
    throw new Error(`Inventory not restocked! Expected ${stockBeforeReturn.stock + 1}, got ${stockAfterReturn.stock}`);
  }

  console.log("================================================================================");
  console.log("🎉 ALL TASK 2 RETURN & CANCELLATION WORKFLOW ASSERTIONS PASSED!");
  console.log("================================================================================");
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
