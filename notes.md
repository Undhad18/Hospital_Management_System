# In-Depth Notes: Enterprise Distributed Order Lifecycle Architecture

This reference document contains in-depth architectural notes, SQL patterns, and code implementations for the **6 Core Enterprise Order Tasks**.

---

## 1. Task 1: Partial Fulfillment & Multi-Shipment Tracking Architecture

### Finite State Machine (FSM) Transitions
```javascript
// backend/services/orderService.js
const VALID_TRANSITIONS = {
  placed: ["confirmed", "cancelled", "cancellation_requested"],
  confirmed: ["partially_fulfilled", "shipped", "cancelled", "cancellation_requested"],
  cancellation_requested: ["cancelled", "confirmed", "placed"],
  partially_fulfilled: ["shipped", "fulfilled", "cancelled"],
  shipped: ["delivered", "returned", "return_requested"],
  fulfilled: ["delivered", "returned", "return_requested"],
  delivered: ["return_requested", "returned"],
  return_requested: ["return_approved", "rejected", "delivered"],
  return_approved: ["returned"],
  returned: ["refunded"],
  cancelled: [] // Terminal state
};
```

### Partial Fulfillment Line-Item Math
When an admin creates a shipment for an order:
```javascript
// Calculate total ordered quantity vs total shipped quantity
const [[{ totalOrdered }]] = await db.query(
  "SELECT COALESCE(SUM(quantity), 0) AS totalOrdered FROM order_items WHERE order_id = ?",
  [orderId]
);

const [[{ totalShipped }]] = await db.query(
  `SELECT COALESCE(SUM(si.quantity), 0) AS totalShipped 
   FROM shipment_items si 
   JOIN shipments s ON si.shipment_id = s.id 
   WHERE s.order_id = ?`,
  [orderId]
);

// If all ordered items are accounted for in shipments:
const newStatus = totalShipped >= totalOrdered ? "fulfilled" : "partially_fulfilled";
await db.query("UPDATE orders SET status = ? WHERE id = ?", [newStatus, orderId]);
```

---

## 2. Task 2: Return Authorization (RMA) & Cancellation Workflows

### Return Merchandise Authorization (RMA) Generation
```javascript
// backend/services/orderService.js
const rmaNumber = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

const [returnResult] = await db.query(
  `INSERT INTO order_returns (order_id, user_id, rma_number, reason, status) 
   VALUES (?, ?, ?, ?, 'requested')`,
  [orderId, userId, rmaNumber, reason]
);
```

### Condition-Based Restocking on Return Approval
```javascript
if (action === "approve" && restock) {
  const [returnItems] = await db.query(
    `SELECT oi.product_id, ri.quantity 
     FROM order_return_items ri 
     JOIN order_items oi ON ri.order_item_id = oi.id 
     WHERE ri.return_id = ?`,
    [returnId]
  );

  for (const item of returnItems) {
    await db.query(
      "UPDATE products SET stock = stock + ? WHERE id = ?",
      [item.quantity, item.product_id]
    );
  }
}
```

---

## 3. Task 3: Stripe Refund Integration & DB Balance Synchronization

### Over-Refund Invariant Guard
```javascript
// backend/services/orderService.js
const [[{ totalRefunded }]] = await db.query(
  `SELECT COALESCE(SUM(amount), 0) AS totalRefunded 
   FROM order_refunds 
   WHERE order_id = ? AND status = 'succeeded'`,
  [orderId]
);

const remainingRefundable = Number(order.total_amount) - Number(totalRefunded);

if (Number(amount) > remainingRefundable) {
  throw new Error(`Refund amount exceeds remaining refundable balance of ₹${remainingRefundable.toFixed(2)}`);
}

// Execute Stripe Refund via SDK
const stripeRefund = await stripeService.processRefund({
  paymentIntentId: order.payment_intent_id,
  amount: Number(amount),
  reason: reason
});

// Insert Immutable Refund Ledger Record
await db.query(
  `INSERT INTO order_refunds (order_id, amount, reason, stripe_refund_id, status) 
   VALUES (?, ?, ?, ?, 'succeeded')`,
  [orderId, amount, reason, stripeRefund.id]
);

// Synchronize Payment Status
const newPaymentStatus = (Number(totalRefunded) + Number(amount) >= Number(order.total_amount))
  ? "refunded"
  : "partially_refunded";

await db.query("UPDATE orders SET payment_status = ? WHERE id = ?", [newPaymentStatus, orderId]);
```

---

## 4. Task 4: Resilient Notification Queue & Exponential Backoff

### Backoff Delay Formula & Dead Letter Queue (DLQ)
```javascript
// backend/services/emailQueue.js
async processJob(job) {
  try {
    if (this.faultInjectionEnabled) {
      throw new Error("Simulated transient network failure");
    }
    await this.dispatchNotification(job);
    job.status = "completed";
  } catch (error) {
    job.attempts += 1;
    if (job.attempts < this.maxRetries) {
      // Exponential backoff: 2s, 4s, 8s
      const delayMs = this.baseDelayMs * Math.pow(2, job.attempts - 1);
      setTimeout(() => this.processJob(job), delayMs);
    } else {
      job.status = "failed";
      job.failedAt = new Date().toISOString();
      job.error = error.message;
      this.dlq.push(job);
      socketService.emitToAdmin("dlq:job_added", job);
    }
  }
}
```

---

## 5. Task 5: 45-Assertion Automated Integration Test Suite

### Test Architecture (`testTask5IntegrationSuite.js`)
The test script runs 6 sequential phases without requiring third-party testing frameworks:
1. **Phase 1**: Creates order, creates partial shipment, adds tracking checkpoint, verifies `partially_fulfilled` status.
2. **Phase 2**: Tests cancellation request, rejects cancellation on in-transit order, validates eligibility API.
3. **Phase 3**: Completes fulfillment to `delivered`, submits RMA return request, approves return, verifies inventory stock increment.
4. **Phase 4**: Issues partial refund, verifies DB balance sync, tests over-refund rejection guard.
5. **Phase 5**: Tests duplicate Stripe webhook events, confirming idempotent HTTP 200 response.
6. **Phase 6**: Tests FSM invalid state transitions, ensuring forbidden transitions are blocked.

---

## 6. Task 6: Order Lifecycle Analytics & Database Maintenance

### Comprehensive Lifecycle Aggregation Query
```sql
SELECT 
  o.id, o.status, o.payment_status, o.total_amount,
  COUNT(DISTINCT s.id) AS total_shipments,
  COUNT(DISTINCT r.id) AS total_returns,
  COALESCE(SUM(rf.amount), 0) AS total_refunded
FROM orders o
LEFT JOIN shipments s ON o.id = s.order_id
LEFT JOIN order_returns r ON o.id = r.order_id
LEFT JOIN order_refunds rf ON o.id = rf.order_id AND rf.status = 'succeeded'
GROUP BY o.id;
```
