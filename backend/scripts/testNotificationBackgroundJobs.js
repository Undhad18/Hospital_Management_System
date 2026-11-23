/**
 * ============================================================================
 * Task 4 Automated Verification Suite
 * Background Jobs for Order, Shipment, Return, and Refund Notifications
 * with Retry and Failed-Job Handling
 * ============================================================================
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const assert = require("assert");
const db = require("../config/db");
const emailQueue = require("../services/emailQueue");
const orderService = require("../services/orderService");
const socketService = require("../services/socketService");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTask4Verification() {
  console.log("=".repeat(80));
  console.log("🧪 TESTING TASK 4: NOTIFICATION BACKGROUND JOBS & RETRY/DLQ HANDLING");
  console.log("=".repeat(80));

  // Initialize Socket dummy instance so events don't throw
  const mockIo = {
    to: () => ({ emit: () => {} }),
    emit: () => {},
  };
  socketService.initSocket({ on: () => {} });

  // Clean queue before starting test
  emailQueue.flushQueue();
  emailQueue.clearDeadLetterQueue();
  emailQueue.toggleFaultInjection({ enabled: false });

  // --------------------------------------------------------------------------
  // TEST 1: Order Notification Background Job
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 1: ORDER NOTIFICATION BACKGROUND JOB] ---");
  const testOrderId = `test_ord_${Date.now()}`;
  const orderJob = emailQueue.enqueueEmailJob({
    type: "ORDER_CONFIRMATION",
    category: "order",
    orderId: 101,
    status: "placed",
    recipientEmail: "shopper@excelsior-store.io",
    recipientName: "Alice Shopper",
    trackingNotes: "Order placed via checkout",
    order: {
      id: 101,
      status: "placed",
      total_amount: 149.99,
      shipping_address: "742 Evergreen Terrace, Springfield",
      payment_method: "credit_card",
      items: [{ name: "Mechanical Gaming Keyboard", quantity: 1, price: 149.99 }],
    },
  });

  assert.strictEqual(orderJob.category, "order");
  assert.strictEqual(orderJob.status, "placed");
  assert.ok(["pending", "processing"].includes(orderJob.state), "Job should be pending or actively processing");
  assert.ok(orderJob.id.startsWith("job_"));

  // Wait for worker loop to process
  await delay(800);

  const completedOrderJob = emailQueue.getJobHistory(10).find((j) => j.id === orderJob.id);
  assert.ok(completedOrderJob, "Order job should be recorded in job history");
  assert.strictEqual(completedOrderJob.state, "completed");
  assert.ok(completedOrderJob.renderedHtml.includes("ORDER PLACED &amp; CONFIRMED") || completedOrderJob.renderedHtml.includes("ORDER PLACED"));
  assert.ok(completedOrderJob.renderedHtml.includes("Mechanical Gaming Keyboard"));
  console.log(`✅ Test 1 Passed: Order notification job ${orderJob.id} dispatched and rendered.`);

  // --------------------------------------------------------------------------
  // TEST 2: Shipment Notification Background Job (with carrier & tracking)
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 2: SHIPMENT NOTIFICATION BACKGROUND JOB] ---");
  const shipmentTrackingNumber = `TRK-EXP-${Date.now().toString().slice(-6)}`;
  const shipmentJob = emailQueue.enqueueEmailJob({
    type: "SHIPMENT_DISPATCHED",
    category: "shipment",
    orderId: 102,
    status: "shipped",
    recipientEmail: "recipient@excelsior-store.io",
    trackingNotes: "Dispatched from Logistics Hub Alpha",
    metadata: {
      shipment: {
        carrier: "FedEx Priority",
        tracking_number: shipmentTrackingNumber,
        tracking_url: `https://fedex.com/track/${shipmentTrackingNumber}`,
        estimated_delivery: new Date(Date.now() + 86400000 * 2).toISOString(),
      },
    },
    order: {
      id: 102,
      status: "shipped",
      total_amount: 299.99,
      items: [{ name: "Curved Gaming Monitor 32-inch", quantity: 1, price: 299.99 }],
    },
  });

  assert.strictEqual(shipmentJob.category, "shipment");
  await delay(800);

  const completedShipmentJob = emailQueue.getJobHistory(10).find((j) => j.id === shipmentJob.id);
  assert.ok(completedShipmentJob, "Shipment job should be recorded in history");
  assert.strictEqual(completedShipmentJob.state, "completed");
  assert.ok(completedShipmentJob.renderedHtml.includes("FedEx Priority"));
  assert.ok(completedShipmentJob.renderedHtml.includes(shipmentTrackingNumber));
  console.log(`✅ Test 2 Passed: Shipment notification job ${shipmentJob.id} generated carrier tracking template.`);

  // --------------------------------------------------------------------------
  // TEST 3: Return RMA Notification Background Job (Request & Approval)
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 3: RETURN NOTIFICATION BACKGROUND JOB] ---");
  const returnJob = emailQueue.enqueueEmailJob({
    type: "RETURN_REQUESTED",
    category: "return",
    orderId: 103,
    status: "return_requested",
    recipientEmail: "returns@excelsior-store.io",
    metadata: {
      returnRequest: {
        id: 42,
        reason: "Item arrived with cosmetic scratch",
        customer_notes: "Requesting replacement or refund",
      },
    },
    order: {
      id: 103,
      status: "return_requested",
      total_amount: 89.50,
      items: [{ name: "Wireless Earbuds", quantity: 1, price: 89.50 }],
    },
  });

  assert.strictEqual(returnJob.category, "return");
  await delay(800);

  const completedReturnJob = emailQueue.getJobHistory(10).find((j) => j.id === returnJob.id);
  assert.ok(completedReturnJob);
  assert.strictEqual(completedReturnJob.state, "completed");
  assert.ok(completedReturnJob.renderedHtml.includes("RMA Return Authorization") || completedReturnJob.renderedHtml.includes("RMA-103-42"));
  console.log(`✅ Test 3 Passed: Return RMA notification job ${returnJob.id} completed with RMA details.`);

  // --------------------------------------------------------------------------
  // TEST 4: Refund Notification Background Job (with Stripe ID & Amount)
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 4: REFUND NOTIFICATION BACKGROUND JOB] ---");
  const stripeRefundId = `re_test_suite_${Date.now().toString().slice(-6)}`;
  const refundJob = emailQueue.enqueueEmailJob({
    type: "REFUND_ISSUED",
    category: "refund",
    orderId: 104,
    status: "refund_issued",
    recipientEmail: "refundee@excelsior-store.io",
    metadata: {
      refund: {
        stripe_refund_id: stripeRefundId,
        amount: 149.99,
        source: "cancellation",
        reason: "Customer cancellation refund",
      },
    },
    order: {
      id: 104,
      status: "cancelled",
      total_amount: 149.99,
      refund_amount: 149.99,
      stripe_refund_id: stripeRefundId,
    },
  });

  assert.strictEqual(refundJob.category, "refund");
  await delay(800);

  const completedRefundJob = emailQueue.getJobHistory(10).find((j) => j.id === refundJob.id);
  assert.ok(completedRefundJob);
  assert.strictEqual(completedRefundJob.state, "completed");
  assert.ok(completedRefundJob.renderedHtml.includes("Stripe Payment Refund Settlement"));
  assert.ok(completedRefundJob.renderedHtml.includes(stripeRefundId));
  assert.ok(completedRefundJob.renderedHtml.includes("149.99"));
  console.log(`✅ Test 4 Passed: Refund notification job ${refundJob.id} rendered Stripe refund ID and amount.`);

  // --------------------------------------------------------------------------
  // TEST 5: Retry Mechanism with Exponential Backoff
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 5: RETRY MECHANISM & EXPONENTIAL BACKOFF] ---");
  const failingJob = emailQueue.enqueueEmailJob({
    type: "RETRY_TEST_JOB",
    category: "order",
    orderId: 105,
    status: "placed",
    recipientEmail: "retry-tester@excelsior-store.io",
    simulateFailure: true, // Will fail on every attempt
    maxRetries: 2, // 2 retries (total 3 attempts) for fast test completion
  });

  // Let Attempt 1 fail -> Should transition to retrying with attempt 1
  await delay(700);

  let activeRetryingJob = emailQueue.getJobHistory(10).find((j) => j.id === failingJob.id);
  assert.ok(activeRetryingJob, "Job should be in history");
  assert.strictEqual(activeRetryingJob.state, "retrying", "Job state should be 'retrying' on first failure");
  assert.strictEqual(activeRetryingJob.retries, 1, "Retries counter should be incremented to 1");
  assert.ok(activeRetryingJob.retryHistory && activeRetryingJob.retryHistory.length === 1);
  assert.ok(activeRetryingJob.backoffDelayMs > 0, "Exponential backoff delay should be computed");
  console.log(
    `✅ Test 5A Passed: Attempt 1 failed, scheduled retry 1 with ${activeRetryingJob.backoffDelayMs}ms backoff. Retry history recorded.`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Dead-Letter Queue (DLQ) Handling & Manual Recovery
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 6: RETRY EXHAUSTION & DEAD-LETTER QUEUE (DLQ)] ---");
  // Fast-forward: Enqueue a job with maxRetries = 0 to trigger immediate DLQ migration
  const dlqJob = emailQueue.enqueueEmailJob({
    type: "DLQ_DIRECT_TEST",
    category: "refund",
    orderId: 106,
    status: "refund_issued",
    recipientEmail: "dlq-target@excelsior-store.io",
    simulateFailure: true,
    maxRetries: 0, // Exhausts on first attempt
  });

  await delay(700);

  const failedDlqJob = emailQueue.getJobHistory(10).find((j) => j.id === dlqJob.id);
  assert.strictEqual(failedDlqJob.state, "failed", "Job should transition to 'failed'");
  assert.ok(failedDlqJob.error.includes("Retries exhausted"), "Error should report retries exhausted");

  const dlqItems = emailQueue.getDeadLetterQueue(10);
  const foundInDlq = dlqItems.find((j) => j.id === dlqJob.id);
  assert.ok(foundInDlq, "Job must be stored in Dead-Letter Queue (DLQ)");
  console.log(`✅ Test 6A Passed: Job ${dlqJob.id} moved to Dead-Letter Queue after retry exhaustion.`);

  // Test Manual Retry from DLQ
  console.log("Testing single job manual retry from DLQ...");
  const retryResult = emailQueue.retryJob(dlqJob.id);
  assert.strictEqual(retryResult.success, true);
  assert.ok(["pending", "processing"].includes(retryResult.job.state), "Job should be pending or re-processing");
  assert.strictEqual(retryResult.job.simulateFailure, false, "simulateFailure should be reset on manual retry");

  // Let worker process the manual retry
  await delay(800);
  const reExecutedJob = emailQueue.getJobHistory(10).find((j) => j.id === dlqJob.id);
  assert.strictEqual(reExecutedJob.state, "completed", "Manual retry should successfully complete");
  console.log(`✅ Test 6B Passed: Job ${dlqJob.id} recovered from DLQ and completed successfully.`);

  // Test Batch Retry All DLQ
  console.log("Testing batch retry of Dead-Letter Queue...");
  emailQueue.flushQueue();

  // Inject another DLQ item
  emailQueue.enqueueEmailJob({
    type: "BATCH_DLQ_TEST",
    category: "shipment",
    orderId: 107,
    status: "shipped",
    simulateFailure: true,
    maxRetries: 0,
  });
  await delay(800);

  assert.ok(emailQueue.getDeadLetterQueue().length >= 1, "DLQ should contain failed job");
  const batchRes = emailQueue.retryAllDeadLetterJobs();
  assert.strictEqual(batchRes.success, true);
  assert.ok(batchRes.count >= 1);
  console.log(`✅ Test 6C Passed: Batch DLQ recovery successfully re-enqueued ${batchRes.count} failed jobs.`);

  // --------------------------------------------------------------------------
  // TEST 7: Multi-Category Simulation Endpoint
  // --------------------------------------------------------------------------
  console.log("\n--- [TEST 7: MULTI-CATEGORY SIMULATION CAPABILITY] ---");
  const simOrder = emailQueue.triggerSimulatedJob({ category: "order", orderId: 201 });
  assert.strictEqual(simOrder.category, "order");

  const simShipment = emailQueue.triggerSimulatedJob({ category: "shipment", orderId: 202 });
  assert.strictEqual(simShipment.category, "shipment");
  assert.strictEqual(simShipment.status, "shipped");

  const simReturn = emailQueue.triggerSimulatedJob({ category: "return", orderId: 203 });
  assert.strictEqual(simReturn.category, "return");
  assert.strictEqual(simReturn.status, "return_requested");

  const simRefund = emailQueue.triggerSimulatedJob({ category: "refund", orderId: 204 });
  assert.strictEqual(simRefund.category, "refund");
  assert.strictEqual(simRefund.status, "refund_issued");

  await delay(1200);
  console.log("✅ Test 7 Passed: Multi-category simulated jobs for Order, Shipment, Return, and Refund executed.");

  // Check final metrics
  const metrics = emailQueue.getQueueMetrics();
  console.log("\n📊 Final Queue Telemetry Metrics:", {
    totalEnqueued: metrics.totalEnqueued,
    totalProcessed: metrics.totalProcessed,
    totalSucceeded: metrics.totalSucceeded,
    totalFailed: metrics.totalFailed,
    totalRetried: metrics.totalRetried,
    averageProcessingTimeMs: `${metrics.averageProcessingTimeMs}ms`,
  });

  console.log("\n" + "=".repeat(80));
  console.log("🎉 ALL TASK 4 NOTIFICATION BACKGROUND JOBS & RETRY/DLQ ASSERTIONS PASSED!");
  console.log("=".repeat(80));

  emailQueue.flushQueue();
  process.exit(0);
}

runTask4Verification().catch((err) => {
  console.error("❌ Task 4 Verification Failed:", err);
  process.exit(1);
});
