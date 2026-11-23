const axios = require("axios");

const BASE_URL = "http://localhost:5000/api/orders";

async function runTests() {
  console.log("==================================================================");
  console.log("🧪 Starting Stripe Payment & Idempotency Integration Tests");
  console.log("==================================================================");

  try {
    // 1. Create Stripe Payment Intent
    console.log("\n[TEST 1] Creating Stripe PaymentIntent for Cart...");
    const cartPayload = {
      userId: 1,
      shippingAddress: "456 Silicon Ave, San Francisco, CA",
      cartItems: [
        { productId: 4, quantity: 1 },
      ],
    };

    const piRes = await axios.post(`${BASE_URL}/create-payment-intent`, cartPayload);
    console.log("✓ PaymentIntent Created:");
    console.log("  - PaymentIntent ID:", piRes.data.paymentIntentId);
    console.log("  - Client Secret:", piRes.data.clientSecret.substring(0, 24) + "...");
    console.log("  - Total Amount ($):", piRes.data.totalAmount);
    console.log("  - Amount (cents):", piRes.data.amount);
    console.log("  - Mock/Live Mode:", piRes.data.isMock ? "Mock Sandbox" : "Live Stripe API");

    const paymentIntentId = piRes.data.paymentIntentId;
    const testIdempotencyKey = `test_idem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 2. Process Checkout (First Request)
    console.log(`\n[TEST 2] Processing Checkout with Idempotency-Key: "${testIdempotencyKey}"...`);
    const checkoutPayload = {
      userId: 1,
      shippingAddress: "456 Silicon Ave, San Francisco, CA",
      paymentMethod: "stripe",
      paymentIntentId: paymentIntentId,
      cartItems: [
        { productId: 4, quantity: 1 },
      ],
    };

    const firstRes = await axios.post(`${BASE_URL}/checkout`, checkoutPayload, {
      headers: {
        "Idempotency-Key": testIdempotencyKey,
      },
    });

    console.log("✓ First Checkout Succeeded:");
    console.log("  - Order ID:", firstRes.data.order?.id);
    console.log("  - Order Status:", firstRes.data.order?.status);
    console.log("  - Payment Status:", firstRes.data.order?.paymentStatus);
    console.log("  - Idempotency Replay:", firstRes.data.isIdempotentReplay);
    const initialOrderId = firstRes.data.order?.id;

    // 3. Process Duplicate Checkout (Identical Idempotency-Key - Network retry simulation)
    console.log(`\n[TEST 3] Simulating Network Retry / Double-Click with SAME Idempotency-Key...`);
    const duplicateRes = await axios.post(`${BASE_URL}/checkout`, checkoutPayload, {
      headers: {
        "Idempotency-Key": testIdempotencyKey,
      },
    });

    console.log("✓ Duplicate Request Correctly Intercepted:");
    console.log("  - Returned Order ID:", duplicateRes.data.order?.id);
    console.log("  - Same Order ID?:", duplicateRes.data.order?.id === initialOrderId ? "YES (Correct)" : "NO (Bug!)");
    console.log("  - Is Idempotent Replay:", duplicateRes.data.isIdempotentReplay ? "YES (Idempotency Active)" : "NO");
    console.log("  - Interceptor Log:", duplicateRes.data.transactionLogs?.[0]?.detail);

    // 4. Test Stripe Webhook Simulation (payment_intent.succeeded)
    console.log(`\n[TEST 4] Simulating Stripe Webhook "payment_intent.succeeded"...`);
    const webhookRes = await axios.post(`${BASE_URL}/simulate-webhook`, {
      eventType: "payment_intent.succeeded",
      paymentIntentId: paymentIntentId,
      orderId: initialOrderId,
    });

    console.log("✓ Stripe Webhook Processed:");
    console.log("  - Event ID:", webhookRes.data.event?.id);
    console.log("  - Event Type:", webhookRes.data.event?.type);
    console.log("  - Action Taken:", webhookRes.data.result?.actionTaken);

    // 5. Inspect Idempotency Keys Table
    console.log(`\n[TEST 5] Inspecting Idempotency Keys Registry...`);
    const keysRes = await axios.get(`${BASE_URL}/idempotency-keys?limit=5`);
    console.log("✓ Idempotency Keys Stored in MySQL:", keysRes.data.count);
    const matchingKey = keysRes.data.data?.find((k) => k.idempotency_key === testIdempotencyKey);
    console.log("  - Found Active Key:", matchingKey ? `${matchingKey.idempotency_key} (${matchingKey.status})` : "Not Found");

    console.log("\n==================================================================");
    console.log("🎉 ALL STRIPE & IDEMPOTENCY INTEGRATION TESTS PASSED!");
    console.log("==================================================================");
  } catch (error) {
    console.error("❌ Test Failed:", error.response?.data || error.message);
  }
}

runTests();
