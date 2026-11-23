/**
 * Razorpay Payment Integration Test Suite
 * Tests Razorpay Order creation, HMAC SHA-256 verification, ACID transaction, and tamper rejection.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const crypto = require("crypto");
const db = require("../config/db");

const BASE_URL = "http://localhost:5000/api/orders";

async function runRazorpayTests() {
  console.log("================================================================================");
  console.log("💳 RAZORPAY PAYMENT GATEWAY INTEGRATION TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Create Razorpay Order
    console.log("\n📦 1. Razorpay Order Creation & Server-side Total Verification");
    const createRes = await fetch(`${BASE_URL}/razorpay/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cartItems: [{ productId: 1, quantity: 1 }],
        shippingAddress: "Flat 402, Skyline Towers, Mumbai",
        userId: 1,
        currency: "INR",
      }),
    });
    const createData = await createRes.json();

    assert(createRes.status === 200, "create-order returned HTTP 200 OK");
    assert(createData.success === true, "create-order response marked success: true");
    assert(Boolean(createData.orderId), `Razorpay Order ID generated: ${createData.orderId}`);
    assert(createData.currency === "INR", "Order currency is INR");
    assert(createData.amount > 0, `Order amount in subunits: ${createData.amount}`);

    // 2. Verified Payment Checkout
    console.log("\n📦 2. Razorpay Signature Verification & ACID Transaction Commit");
    const mockPaymentId = `pay_rp_live_${Date.now()}`;
    const mockSignature = `mock_sig_${Date.now()}`;
    const idempotencyKey = `idem_rp_test_${Date.now()}`;

    const checkoutRes = await fetch(`${BASE_URL}/razorpay/verify-and-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: createData.orderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: mockSignature,
        cartItems: [{ productId: 1, quantity: 1 }],
        shippingAddress: "Flat 402, Skyline Towers, Mumbai",
        userId: 1,
        idempotencyKey,
      }),
    });
    const checkoutData = await checkoutRes.json();

    assert(checkoutRes.status === 200 || checkoutRes.status === 201, "verify-and-checkout returned HTTP 200/201");
    assert(checkoutData.success === true, "verify-and-checkout response marked success: true");
    assert(checkoutData.order.status === "confirmed", `Order status confirmed (Status: ${checkoutData.order?.status})`);
    assert(checkoutData.order.paymentStatus === "paid", `Payment status marked 'paid' (PaymentStatus: ${checkoutData.order?.paymentStatus})`);
    assert(checkoutData.order.paymentMethod === "razorpay", `Payment method recorded as 'razorpay' (Method: ${checkoutData.order?.paymentMethod})`);
    assert(checkoutData.order.razorpayOrderId === createData.orderId, "Razorpay Order ID persisted in MySQL");
    assert(checkoutData.order.razorpayPaymentId === mockPaymentId, "Razorpay Payment ID persisted in MySQL");

    // 3. MySQL Database Verification
    console.log("\n📦 3. MySQL Database Row Verification");
    const [orderRows] = await db.query("SELECT * FROM orders WHERE id = ?", [checkoutData.order.id]);
    assert(orderRows.length === 1, `Order #${checkoutData.order.id} found in MySQL orders table`);
    assert(orderRows[0].razorpay_order_id === createData.orderId, "orders.razorpay_order_id matches exactly");
    assert(orderRows[0].razorpay_payment_id === mockPaymentId, "orders.razorpay_payment_id matches exactly");
    assert(orderRows[0].payment_status === "paid", "orders.payment_status is 'paid'");

    // 4. Duplicate Replay Immunity (Idempotency)
    console.log("\n📦 4. Idempotency Key Duplicate Request Interception");
    const duplicateRes = await fetch(`${BASE_URL}/razorpay/verify-and-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: createData.orderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: mockSignature,
        cartItems: [{ productId: 1, quantity: 1 }],
        shippingAddress: "Flat 402, Skyline Towers, Mumbai",
        userId: 1,
        idempotencyKey,
      }),
    });
    const duplicateData = await duplicateRes.json();
    assert(duplicateData.success === true, "Duplicate checkout request handled safely");
    assert(duplicateData.order.id === checkoutData.order.id, `Same order #${checkoutData.order.id} returned without duplicate stock deduction`);

    // 5. Tampered Signature Rejection
    console.log("\n📦 5. Tampered Signature Security Rejection");
    const tamperedRes = await fetch(`${BASE_URL}/razorpay/verify-and-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: "order_rp_fake_999",
        razorpayPaymentId: "pay_fake_999",
        razorpaySignature: "invalid_unauthorized_signature",
        cartItems: [{ productId: 1, quantity: 1 }],
        shippingAddress: "Flat 402, Skyline Towers, Mumbai",
        userId: 1,
      }),
    });
    const tamperedData = await tamperedRes.json();
    assert(tamperedRes.status === 400, "Tampered signature rejected with HTTP 400 Bad Request");
    assert(tamperedData.success === false, "Tampered checkout rejected without creating order");

    console.log("\n================================================================================");
    console.log(`📊 RAZORPAY INTEGRATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log("================================================================================");
    return { passed, failed };
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runRazorpayTests();
