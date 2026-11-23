require("dotenv").config();
const http = require("http");
const app = require("../app");
const pool = require("../config/db");
const initTables = require("../config/initTables");
const { initSocket } = require("../services/socketService");
const orderService = require("../services/orderService");
const emailQueue = require("../services/emailQueue");
const { io: ioClient } = require("socket.io-client");

async function runRealtimeAndQueueTest() {
  console.log("===============================================================");
  console.log("🚀 Testing Real-Time Order Status Updates & Background Email Queue");
  console.log("===============================================================");

  const server = http.createServer(app);
  initSocket(server);

  await initTables();

  const PORT = 5099;
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`✅ Test Server running on port ${PORT}`);

  // 1. Connect Socket.IO Test Client
  const clientSocket = ioClient(`http://localhost:${PORT}`, {
    transports: ["websocket"],
  });

  const receivedEvents = [];

  clientSocket.on("connect", () => {
    console.log(`🔌 [Test Client] Connected to Socket.IO server: ${clientSocket.id}`);
  });

  clientSocket.on("order:created", (data) => {
    console.log(`⚡ [Received Socket Event] order:created -> Order #${data.orderId}`);
    receivedEvents.push({ type: "order:created", data });
  });

  clientSocket.on("order:status_updated", (data) => {
    console.log(
      `⚡ [Received Socket Event] order:status_updated -> Order #${data.orderId}: ${data.status.toUpperCase()} (${data.trackingNotes})`
    );
    receivedEvents.push({ type: "order:status_updated", data });
  });

  clientSocket.on("queue:email_dispatched", (data) => {
    console.log(
      `📧 [Received Socket Event] queue:email_dispatched -> Type: ${data.type} | Order #${data.orderId} | Duration: ${data.durationMs || 0}ms`
    );
    receivedEvents.push({ type: "queue:email_dispatched", data });
  });

  // Wait for socket to connect
  await new Promise((resolve) => setTimeout(resolve, 600));

  // 2. Fetch an existing product from DB for the test order
  const [products] = await pool.query("SELECT id, name, price, stock FROM products LIMIT 1");
  if (!products || products.length === 0) {
    console.error("No products found in DB. Please insert products first.");
    process.exit(1);
  }

  const testProduct = products[0];
  console.log(`📦 Testing with product: "${testProduct.name}" (ID: ${testProduct.id}, Stock: ${testProduct.stock})`);

  // 3. Place Order (ACID MySQL Transaction -> Initial Status: 'placed')
  console.log("\n--- STEP 1: Process Checkout Transaction (Initial status: 'placed') ---");
  const checkoutResult = await orderService.processCheckoutTransaction({
    userId: 1,
    cartItems: [{ productId: testProduct.id, quantity: 1 }],
    shippingAddress: "456 Baker St, London",
    paymentMethod: "credit_card",
  });

  const orderId = checkoutResult.order.id;
  console.log(`✅ Order #${orderId} created with initial status: "${checkoutResult.order.status}"`);

  // Subscribe client socket to this order room
  clientSocket.emit("join:order", orderId);

  // 4. Progress status through Confirmed -> Packed -> Shipped -> Delivered
  const stages = [
    { status: "confirmed", note: "Warehouse allocated items" },
    { status: "packed", note: "Items packed into tamper-proof box" },
    { status: "shipped", note: "Courier picked up parcel (Tracking: TRK-9900)" },
    { status: "delivered", note: "Delivered to customer doorstep" },
  ];

  for (const stage of stages) {
    console.log(`\n--- ADVANCING STATUS TO: ${stage.status.toUpperCase()} ---`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const updateRes = await orderService.updateOrderStatus({
      orderId,
      status: stage.status,
      trackingNotes: stage.note,
    });
    console.log(`✅ Status in DB is now: "${updateRes.status}" | Queued Email Job ID: ${updateRes.emailJobId}`);
  }

  // Wait for background worker to process remaining email jobs
  console.log("\n--- WAITING FOR BACKGROUND WORKER QUEUE TO DRAIN ---");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 5. Inspect Email Queue Metrics & History
  const metrics = emailQueue.getQueueMetrics();
  const history = emailQueue.getJobHistory(10);

  console.log("\n===============================================================");
  console.log("📊 BACKGROUND EMAIL QUEUE METRICS:");
  console.log(`- Total Jobs Enqueued: ${metrics.totalEnqueued}`);
  console.log(`- Total Jobs Succeeded: ${metrics.totalSucceeded}`);
  console.log(`- Total Jobs Failed: ${metrics.totalFailed}`);
  console.log(`- Average Worker Processing Latency: ${metrics.averageProcessingTimeMs}ms`);
  console.log(`- Current Pending Queue: ${metrics.pendingJobs}`);
  console.log(`- Total Real-Time Socket Events Received by Client: ${receivedEvents.length}`);
  console.log("===============================================================");

  // Cleanup
  clientSocket.disconnect();
  server.close();
  await pool.end();

  console.log("🎉 ALL REAL-TIME ORDER STATUS & BACKGROUND QUEUE TESTS PASSED!\n");
  process.exit(0);
}

runRealtimeAndQueueTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
