# Open Questions & Critical Thinking: Enterprise Order Lifecycle Architecture

Use this document to evaluate architectural trade-offs, scalability bottlenecks, and distributed systems patterns for senior engineering design reviews and architectural interviews based on the **6 Core Integration Tasks**.

---

## ⚡ 1. Task 1: Partial Fulfillment & Split-Shipment Inventory Allocation
> **Scenario**: A customer orders 3 items. Item A is in warehouse Seattle; Item B is in warehouse Dallas; Item C is temporarily on backorder.

- **Split-Shipment Modeling**:
  - Should the core order status be split into sub-orders (child orders), or managed via parent order line-item allocation?
  - **Selected Approach**: Parent order with child `shipments` and `shipment_items` records. Order status transitions dynamically:
    - Initial: `placed` or `confirmed`
    - When 1st package leaves: `partially_fulfilled`
    - When all quantities accounted for: `shipped` or `fulfilled`
    - When all parcels signed for: `delivered`
- **Customer Notification & Tracking Fatigue**:
  - Emitting an individual notification per package shipment avoids customer confusion over missing items.
  - Tracking numbers must link directly to the carrier's API or unified webhook updates (`shipment_tracking_events`).

---

## 🔄 2. Task 2: Return Authorization (RMA), Cancellation Windows & Reverse Logistics
> **Scenario**: A customer requests to cancel an order after the warehouse printed the shipping label, or requests to return a non-returnable electronic item 45 days after delivery.

- **Pre-Shipment Cancellation vs Post-Shipment Returns**:
  - **Cancellation Window**: An order is cancellable only while in pre-dispatch stages (`placed`, `confirmed`, `pending`). Once in `partially_fulfilled` or `shipped`, cancellations are rejected by the FSM, directing the user to the RMA return flow instead.
  - **Return Windows (RMA)**: Eligibility rules enforce strict time limits (e.g. 30 days from delivery) and category return policies.
- **Admin Review Gate**:
  - Why require human admin approval (`/review`)? Automated returns without verification expose merchants to refund fraud. Admin triage allows inspection of package condition, deduction of restocking fees, and controlled restocking into inventory.

---

## 💳 3. Task 3: Stripe Refund Integration, Idempotency & Over-Refund Prevention
> **Scenario**: A malicious or faulty admin script issues three consecutive refund requests for ₹500 on an order with a total value of ₹1,000.

- **The Over-Refund Invariant**:
  - Gateways like Stripe will reject refunds that exceed the original charge amount, but relying solely on Stripe creates race conditions across parallel admin requests.
  - **Database Level Guard**:
    ```sql
    SELECT total_amount FROM orders WHERE id = ?;
    SELECT COALESCE(SUM(amount), 0) AS totalRefunded FROM order_refunds WHERE order_id = ? AND status = 'succeeded';
    ```
    If `totalRefunded + requestedAmount > total_amount`, the server immediately throws HTTP 400 `Refund amount exceeds remaining refundable balance`.
- **Payment Status Transitions**:
  - If `newRefundTotal < total_amount`, update order `payment_status` to `partially_refunded`.
  - If `newRefundTotal == total_amount`, update order `payment_status` to `refunded`.

---

## 🔔 4. Task 4: Resilient Notification Queues, Exponential Backoff & DLQ
> **Scenario**: The corporate email service provider suffers a 15-minute outage during Black Friday peak traffic.

- **Synchronous vs Asynchronous Handling**:
  - Never send transactional emails or SMS synchronously inside HTTP mutation handlers. If the provider hangs for 30s, the customer checkout request times out.
  - Asynchronous background queues (`emailQueue.js`) decouple event submission from delivery.
- **Exponential Backoff Formula**:
  - $T_{\text{delay}} = \text{baseDelay} \times 2^{(\text{attempt} - 1)}$
  - Attempt 1: immediate; Attempt 2: 2s; Attempt 3: 4s; Attempt 4: 8s.
- **Dead Letter Queue (DLQ) Operational Protocol**:
  - Once maximum attempts are exhausted, the job moves to the DLQ.
  - SREs inspect failed jobs (`GET /api/orders/email-queue/dlq`), fix provider credentials or connection strings, and trigger bulk retry (`POST /api/orders/email-queue/dlq/retry-all`) with zero lost messages.

---

## 🧪 5. Task 5: Testing Distributed State Machines & Webhook Replays
> **Scenario**: Stripe sends duplicate `payment_intent.succeeded` webhooks due to external network packet retries. Meanwhile, an admin concurrently tries to cancel the order.

- **State Machine Guard (`VALID_TRANSITIONS`)**:
  - Valid transitions: `placed` $\rightarrow$ `confirmed` $\rightarrow$ `partially_fulfilled` $\rightarrow$ `shipped` $\rightarrow$ `delivered`.
  - Illegal transitions (e.g. `placed` $\rightarrow$ `delivered`, or transitioning any order that is already `cancelled`) throw descriptive errors.
- **Webhook Idempotency**:
  - If the database order is already `paid`, duplicate webhook events must return HTTP 200 with `{ received: true, alreadyProcessed: true }` without triggering duplicate inventory deductions or double confirmation notifications.

---

## 📊 6. Task 6: Observability, Audit Ledgers & End-to-End Lifecycle Reporting
> **Scenario**: A compliance auditor asks: *"Prove the complete lifecycle audit trail of order #1042 from payment capture to final refund."*

- **Audit Ledger Completeness**:
  - An enterprise system must correlate:
    1. Order creation timestamp and items (`orders`, `order_items`)
    2. Payment authorization ID (`payment_intent_id`)
    3. Fulfillment parcels and checkpoint timestamps (`shipments`, `shipment_tracking_events`)
    4. Return authorization record and reasoning (`order_returns`, `order_return_items`)
    5. Gateway refund ID and ledger entry (`order_refunds`, `stripe_refund_id`)
- **Automated Lifecycle Scripting**:
  - `generateOrderLifecycleReport.js` synthesizes these distributed tables into a markdown report, providing immediate compliance transparency and operational health metrics.
