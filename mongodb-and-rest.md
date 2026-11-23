# Database Modeling, REST Principles & Enterprise E-Commerce Architecture

This guide covers relational (MySQL 8.0) and document (MongoDB) database architectures, REST API contracts, transaction guarantees, and the **6 Core Enterprise Order Tasks**.

---

## 🏛️ Relational (MySQL) vs Document (MongoDB) in Order Lifecycle Management

| Feature | MySQL (InnoDB) - *Chosen for ShopSphere Orders* | MongoDB (Document Store) |
| :--- | :--- | :--- |
| **Partial Fulfillment & Parcels** | Normalized `shipments`, `shipment_items`, `shipment_tracking_events` with foreign keys preventing dangling parcels or unlinked items. | Nested sub-documents inside the Order document (`order.shipments[]`). Simplifies read queries but risks race conditions on concurrent updates to array items. |
| **RMA Returns & Restocking** | Normalized `order_returns` and `order_return_items`. Strict row locks ensure return approval restocks warehouse inventory atomically. | Multi-document transactions required for updating return status and decrementing product catalog stock simultaneously. |
| **Refund Balance Invariants** | Relational `SUM(order_refunds.amount)` aggregation with pessimistic read locks prevents over-refunding beyond the order total. | Aggregation pipeline required; prone to concurrency race conditions without strict serializable isolation. |
| **State Machine Integrity** | Enum/VARCHAR status columns validated by service-layer FSM before executing ACID `UPDATE orders SET status = ?`. | Schema validation rules (`$jsonSchema`) can enforce state values, but transitional logic still requires application-tier FSM. |
| **Idempotency Keys Store** | Unique index on `idempotency_key` guarantees database-level deduplication across concurrent worker threads. | Unique index on `idempotency_key` supported with identical deduplication semantics. |

---

## 🎯 REST API Design Principles Across the 6 Enterprise Tasks

### 1. Task 1: Shipment Processing & Partial Fulfillment
* **`POST /api/orders/:id/shipments`**
  - **Status Code**: `201 Created`
  - **Payload**:
    ```json
    {
      "carrier": "FedEx",
      "trackingNumber": "FDX-998811",
      "notes": "First partial shipment",
      "items": [{ "orderItemId": 1, "quantity": 1 }]
    }
    ```
  - **Response**: `{ success: true, shipment: { id, trackingNumber }, orderStatus: "partially_fulfilled" }`
* **`GET /api/orders/:id/tracking`**
  - **Status Code**: `200 OK`
  - **Response**: Hierarchical tracking history including carriers, status, checkpoints, and estimated delivery.

### 2. Task 2: Return-Request (RMA) & Cancellation Workflows
* **`GET /api/orders/:id/eligibility`**
  - **Status Code**: `200 OK`
  - **Response**: `{ canCancel: true, canReturn: false, reason: "Order not yet delivered" }`
* **`POST /api/orders/:id/cancel-request`**
  - **Status Code**: `200 OK`
  - **Payload**: `{ "userId": 1, "reason": "Customer changed mind" }`
* **`POST /api/orders/:id/cancel-request/review`**
  - **Status Code**: `200 OK`
  - **Payload**: `{ "requestId": 1, "action": "approve", "autoRefund": true }`
* **`POST /api/orders/:id/return-request`**
  - **Status Code**: `201 Created`
  - **Payload**: `{ "userId": 1, "reason": "Damaged goods", "items": [{ "orderItemId": 1, "quantity": 1 }] }`
* **`POST /api/orders/:id/return-request/review`**
  - **Status Code**: `200 OK`
  - **Payload**: `{ "returnId": 1, "action": "approve", "restock": true }`

### 3. Task 3: Stripe Refund Integration & DB Balance Synchronization
* **`POST /api/orders/:id/refund`**
  - **Status Code**: `200 OK`
  - **Payload**: `{ "amount": 199.99, "reason": "Damaged unit return", "paymentIntentId": "pi_123" }`
  - **Response**: `{ success: true, refund: { id, stripeRefundId, amount }, order: { payment_status } }`
* **`GET /api/orders/:id/refunds`**
  - **Status Code**: `200 OK`
  - **Response**: `{ success: true, refunds: [...] }`

### 4. Task 4: Background Notification Queue & DLQ Operations
* **`GET /api/orders/email-queue/stats`** $\rightarrow$ `{ queueLength, activeCount, completedCount, dlqCount }`
* **`GET /api/orders/email-queue/dlq`** $\rightarrow$ Array of dead-letter jobs with failure traces.
* **`POST /api/orders/email-queue/jobs/:id/retry`** $\rightarrow$ Re-enqueues failed job for immediate processing.

### 5. Task 5: Integration Testing Endpoint
* **`POST /api/orders/integration-tests/run`**
  - **Status Code**: `200 OK`
  - **Response**: Complete test report object with 45 passed assertions across all 6 phases.

### 6. Task 6: Database Maintenance Endpoint
* **`POST /api/orders/clear-all-data`**
  - **Status Code**: `200 OK`
  - **Response**: Truncates transactional tables, resets product inventory stock, and purges idempotency keys.