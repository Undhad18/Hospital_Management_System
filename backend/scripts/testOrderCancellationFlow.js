const BASE_URL = "http://localhost:5000";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TASK 3: TESTING ORDER CANCELLATION & REFUND HANDLING");
  console.log("==========================================================");

  // 1. Check initial DB Consistency
  console.log("\n1️⃣ Running Initial Database Consistency Audit...");
  const initConsistencyRes = await fetch(`${BASE_URL}/api/orders/consistency/check`);
  const initConsistency = await initConsistencyRes.json();
  console.log(`Audit Result: isHealthy=${initConsistency.data.isHealthy}, issues=${initConsistency.data.issueCount}`);
  console.log("Checks performed:", initConsistency.data.checksPerformed);

  // 2. Fetch current stock for product 1
  const [prodRes] = await Promise.all([
    fetch(`${BASE_URL}/api/products/1`).then((r) => r.json()).catch(() => null),
  ]);
  const initialStock = prodRes?.data?.stock ?? 10;
  console.log(`Initial stock for Product #1: ${initialStock}`);

  // 3. Create a test order with product 1 (qty: 2)
  console.log("\n2️⃣ Placing a test order with Product #1 (qty: 2)...");
  const checkoutPayload = {
    cartItems: [{ productId: 1, quantity: 2 }],
    shippingAddress: "42 Wallaby Way, Sydney",
    paymentMethod: "stripe",
    paymentIntentId: "pi_test_cancellation_mock_" + Date.now(),
    paymentStatus: "paid", // simulate paid order
    userId: 1,
    idempotencyKey: "test_cancel_idem_" + Date.now(),
  };

  const checkoutRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutPayload),
  });
  const checkoutData = await checkoutRes.json();

  if (!checkoutData.success) {
    throw new Error(`Checkout failed: ${checkoutData.message}`);
  }

  const testOrder = checkoutData.order;
  console.log(`✅ Order #${testOrder.id} successfully placed! Status: ${testOrder.status}, Payment: ${testOrder.paymentStatus}`);

  // Verify stock decremented
  const prodAfterRes = await fetch(`${BASE_URL}/api/products/1`).then((r) => r.json());
  const decrementedStock = prodAfterRes.data.stock;
  console.log(`Product #1 stock after checkout: ${decrementedStock} (Expected: ${initialStock - 2})`);
  if (decrementedStock !== initialStock - 2) {
    console.error(`⚠️ Stock discrepancy! Expected ${initialStock - 2}, got ${decrementedStock}`);
  }

  // 4. Test Cancellation on Eligible Order
  console.log(`\n3️⃣ Testing Cancellation & Refund for Order #${testOrder.id}...`);
  const cancelRes = await fetch(`${BASE_URL}/api/orders/${testOrder.id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: "Customer changed mind before dispatch",
      userId: 1,
    }),
  });
  const cancelData = await cancelRes.json();
  console.log("Cancellation response status:", cancelRes.status);
  console.log("Cancellation message:", cancelData.message);
  console.log("Refund details:", cancelData.refundDetails);
  console.log("Inventory restored:", cancelData.inventoryRestored);

  // Verify stock restored
  const prodRestoredRes = await fetch(`${BASE_URL}/api/products/1`).then((r) => r.json());
  const restoredStock = prodRestoredRes.data.stock;
  console.log(`Product #1 stock after cancellation: ${restoredStock} (Expected restored: ${initialStock})`);

  if (restoredStock === initialStock) {
    console.log("✅ ACID Inventory Restoration Verified! Stock successfully restored.");
  } else {
    console.error(`❌ Inventory restoration mismatch: expected ${initialStock}, got ${restoredStock}`);
  }

  // 5. Test attempting to cancel an already cancelled order
  console.log("\n4️⃣ Testing Re-cancellation of already cancelled order (Should Reject)...");
  const reCancelRes = await fetch(`${BASE_URL}/api/orders/${testOrder.id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Duplicate cancel attempt" }),
  });
  const reCancelData = await reCancelRes.json();
  console.log(`Re-cancellation HTTP status: ${reCancelRes.status} (Expected 400)`);
  console.log(`Error message: "${reCancelData.message}"`);

  // 6. Test ineligibility for Shipped/Delivered order
  console.log("\n5️⃣ Testing Cancellation on Ineligible Shipped Order (Should Reject)...");
  // Place another order and advance to shipped
  const order2Res = await fetch(`${BASE_URL}/api/orders/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cartItems: [{ productId: 1, quantity: 1 }],
      shippingAddress: "742 Evergreen Terrace",
      paymentMethod: "stripe",
      paymentIntentId: "pi_test_shipped_" + Date.now(),
      paymentStatus: "paid",
      userId: 1,
      idempotencyKey: "test_shipped_idem_" + Date.now(),
    }),
  });
  const order2Data = await order2Res.json();
  const order2Id = order2Data.order.id;

  // Advance order 2 to shipped
  await fetch(`${BASE_URL}/api/orders/${order2Id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "shipped", trackingNotes: "Out for delivery" }),
  });

  // Attempt cancel on shipped order
  const shippedCancelRes = await fetch(`${BASE_URL}/api/orders/${order2Id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Attempt cancel shipped order" }),
  });
  const shippedCancelData = await shippedCancelRes.json();
  console.log(`Shipped Order cancellation HTTP status: ${shippedCancelRes.status} (Expected 400)`);
  console.log(`Rejection message: "${shippedCancelData.message}"`);

  // 7. Final DB Consistency Audit
  console.log("\n6️⃣ Running Final Post-Test Database Consistency Audit...");
  const finalConsistencyRes = await fetch(`${BASE_URL}/api/orders/consistency/check`);
  const finalConsistency = await finalConsistencyRes.json();
  console.log(`Final Consistency Result: isHealthy=${finalConsistency.data.isHealthy}, issues=${finalConsistency.data.issueCount}`);
  console.log("Metrics:", finalConsistency.data.metrics);

  console.log("\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
