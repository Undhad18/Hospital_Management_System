require("dotenv").config({ path: "./.env" });
const db = require("../config/db");
const initTables = require("../config/initTables");
const orderService = require("../services/orderService");
const socketService = require("../services/socketService");

async function runShipmentAndFulfillmentTest() {
  console.log("================================================================================");
  console.log("🧪 TESTING TASK 1: SHIPMENT PROCESSING, PARTIAL FULFILLMENT & TRACKING FLOW");
  console.log("================================================================================");

  // 1. Ensure tables exist
  await initTables();

  // 2. Fetch available products with stock
  const [products] = await db.query("SELECT id, name, price, stock FROM products WHERE stock >= 5 LIMIT 2");
  if (products.length < 2) {
    throw new Error("Need at least 2 products with stock >= 5 for partial fulfillment test.");
  }

  const prodA = products[0];
  const prodB = products[1];
  console.log(`📦 Selected Products for Test:`);
  console.log(`   - Product A: #${prodA.id} "${prodA.name}" (Stock: ${prodA.stock}, Price: $${prodA.price})`);
  console.log(`   - Product B: #${prodB.id} "${prodB.name}" (Stock: ${prodB.stock}, Price: $${prodB.price})`);

  // 3. Place new multi-item order
  const checkoutPayload = {
    userId: 1,
    cartItems: [
      { productId: prodA.id, quantity: 2, price: prodA.price },
      { productId: prodB.id, quantity: 1, price: prodB.price },
    ],
    shippingAddress: "742 Evergreen Terrace, Sector 4, Bangalore, 560034",
    paymentMethod: "credit_card",
    idempotencyKey: `idem_test_shipment_${Date.now()}`,
    paymentStatus: "paid",
  };

  const checkoutRes = await orderService.processCheckoutTransaction(checkoutPayload);
  const orderId = checkoutRes.order.id;
  console.log(`\n✅ Step 1: Created Test Order #${orderId} (Status: "${checkoutRes.order.status}")`);
  console.log(`   Total Amount: $${checkoutRes.order.totalAmount}, Items: ${checkoutRes.order.items.length}`);

  // Fetch full order items with IDs
  const initialOrder = await orderService.getOrderDetailsById(orderId);
  const orderItemA = initialOrder.items.find((i) => i.product_id === prodA.id);
  const orderItemB = initialOrder.items.find((i) => i.product_id === prodB.id);

  console.log(`   - Line Item 1: #${orderItemA.id} (${orderItemA.name}) - Qty: ${orderItemA.quantity}, Fulfilled: ${orderItemA.fulfilled_quantity}`);
  console.log(`   - Line Item 2: #${orderItemB.id} (${orderItemB.name}) - Qty: ${orderItemB.quantity}, Fulfilled: ${orderItemB.fulfilled_quantity}`);

  // 4. Test Partial Fulfillment: Ship only 1 unit of Product A
  console.log(`\n🚚 Step 2: Processing Partial Shipment #1 (Fulfilling 1 unit of Product A)...`);
  const shipment1Res = await orderService.createShipment({
    orderId,
    carrier: "BlueDart Express",
    trackingNumber: `BD-TEST-${Date.now().toString().slice(-6)}`,
    shippingTier: "priority",
    estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    items: [
      { orderItemId: orderItemA.id, quantity: 1 },
    ],
    notes: "Priority dispatch for urgent item from Bangalore Hub",
  });

  console.log(`   Shipment 1 Created: ID #${shipment1Res.shipment.id}`);
  console.log(`   Carrier: ${shipment1Res.shipment.carrier}, Tracking: ${shipment1Res.shipment.tracking_number}`);
  console.log(`   Order Status: "${shipment1Res.order.status}"`);
  console.log(`   Fulfillment Status: "${shipment1Res.order.fulfillment.status}"`);
  console.log(`   Fulfilled Qty: ${shipment1Res.order.fulfillment.totalFulfilledQty} / ${shipment1Res.order.fulfillment.totalOrderedQty}`);

  if (shipment1Res.order.status !== "partially_shipped") {
    throw new Error(`Expected order status "partially_shipped", got "${shipment1Res.order.status}"`);
  }
  if (shipment1Res.order.fulfillment.status !== "partially_fulfilled") {
    throw new Error(`Expected fulfillment status "partially_fulfilled", got "${shipment1Res.order.fulfillment.status}"`);
  }
  console.log("   ✅ Partial fulfillment assertion passed!");

  // 5. Add tracking events to Shipment 1
  console.log(`\n📍 Step 3: Adding Tracking Checkpoint Milestones to Shipment #1...`);
  const trackEv1 = await orderService.addShipmentTrackingEvent({
    orderId,
    shipmentId: shipment1Res.shipment.id,
    status: "in_transit",
    location: "Hub 04 (Outer Ring Road Sorting Center)",
    description: "Package departed origin facility and in transit to local distribution center.",
  });
  console.log(`   - Milestone 1: "${trackEv1.trackingEvent.status}" at ${trackEv1.trackingEvent.location}`);

  const trackEv2 = await orderService.addShipmentTrackingEvent({
    orderId,
    shipmentId: shipment1Res.shipment.id,
    status: "out_for_delivery",
    location: "Koramangala Delivery Station",
    description: "Out for delivery with courier associate Ramesh Kumar.",
  });
  console.log(`   - Milestone 2: "${trackEv2.trackingEvent.status}" at ${trackEv2.trackingEvent.location}`);

  // 6. Test Shipment 2: Complete the remaining items (1 unit of Product A + 1 unit of Product B)
  console.log(`\n🚚 Step 4: Processing Shipment #2 for Remaining Items (1x Prod A + 1x Prod B)...`);
  const shipment2Res = await orderService.createShipment({
    orderId,
    carrier: "Delhivery Air",
    trackingNumber: `DLV-TEST-${Date.now().toString().slice(-6)}`,
    shippingTier: "standard",
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    items: [
      { orderItemId: orderItemA.id, quantity: 1 },
      { orderItemId: orderItemB.id, quantity: 1 },
    ],
    notes: "Secondary package containing remaining line items",
  });

  console.log(`   Shipment 2 Created: ID #${shipment2Res.shipment.id}`);
  console.log(`   Carrier: ${shipment2Res.shipment.carrier}, Tracking: ${shipment2Res.shipment.tracking_number}`);
  console.log(`   Order Status: "${shipment2Res.order.status}"`);
  console.log(`   Fulfillment Status: "${shipment2Res.order.fulfillment.status}"`);
  console.log(`   Fulfilled Qty: ${shipment2Res.order.fulfillment.totalFulfilledQty} / ${shipment2Res.order.fulfillment.totalOrderedQty}`);

  if (shipment2Res.order.status !== "shipped") {
    throw new Error(`Expected order status "shipped", got "${shipment2Res.order.status}"`);
  }
  if (shipment2Res.order.fulfillment.status !== "fulfilled") {
    throw new Error(`Expected fulfillment status "fulfilled", got "${shipment2Res.order.fulfillment.status}"`);
  }
  console.log("   ✅ Full fulfillment assertion passed!");

  // 7. Verify Customer Tracking View (GET /api/orders/:id/tracking)
  console.log(`\n🔍 Step 5: Querying Customer Live Tracking Information...`);
  const trackingView = await orderService.getOrderTracking(orderId);
  console.log(`   Order #${trackingView.orderId} Tracking Summary:`);
  console.log(`   - Overall Status: ${trackingView.orderStatus.toUpperCase()}`);
  console.log(`   - Fulfillment: ${trackingView.fulfillmentStatus.toUpperCase()}`);
  console.log(`   - Total Shipments: ${trackingView.shipments.length}`);
  trackingView.shipments.forEach((s, idx) => {
    console.log(`     Package ${idx + 1}: [${s.carrier}] #${s.tracking_number} (Status: ${s.status}) - ${s.items.length} item(s), ${s.trackingEvents.length} event(s)`);
  });
  console.log(`   - Fulfilled Items: ${trackingView.fulfilledItems.length}`);
  console.log(`   - Unfulfilled Items: ${trackingView.unfulfilledItems.length}`);

  if (trackingView.unfulfilledItems.length !== 0) {
    throw new Error(`Expected 0 unfulfilled items, got ${trackingView.unfulfilledItems.length}`);
  }
  if (trackingView.shipments.length !== 2) {
    throw new Error(`Expected 2 shipments, got ${trackingView.shipments.length}`);
  }

  // 8. Deliver all shipments and verify automated order delivery
  console.log(`\n🏁 Step 6: Delivering All Shipments and Verifying Order Delivery Completion...`);
  await orderService.addShipmentTrackingEvent({
    orderId,
    shipmentId: shipment1Res.shipment.id,
    status: "delivered",
    location: "Recipient Front Porch",
    description: "Package 1 handed directly to resident.",
  });

  const finalDelivery = await orderService.addShipmentTrackingEvent({
    orderId,
    shipmentId: shipment2Res.shipment.id,
    status: "delivered",
    location: "Recipient Front Porch",
    description: "Package 2 handed directly to resident. Fulfillment 100% complete.",
  });

  console.log(`   Final Order Status after all shipments delivered: "${finalDelivery.order.status}"`);
  if (finalDelivery.order.status !== "delivered") {
    throw new Error(`Expected order status to be "delivered", got "${finalDelivery.order.status}"`);
  }
  console.log("   ✅ Order delivery transition assertion passed!");

  console.log("\n================================================================================");
  console.log("🎉 ALL TASK 1 SHIPMENT & PARTIAL FULFILLMENT TEST ASSERTIONS PASSED!");
  console.log("================================================================================\n");
}

runShipmentAndFulfillmentTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
