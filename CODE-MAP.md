# Code Map & Enterprise System Architecture Blueprint

This document provides the architectural code map, schema contracts, database table designs, data flows, and endpoint routing tables for the full-stack MERN & MySQL enterprise order lifecycle platform.

---

## 🏗️ 1. End-to-End Order Lifecycle Flow Map

```mermaid
sequenceDiagram
    autonumber
    actor Customer as React 19 Client (:5173)
    actor Admin as Admin Dashboard (:5173)
    participant Express as Express API Server (:5000)
    participant OrderSvc as Order Service (FSM & Business Logic)
    participant Stripe as Stripe Payment Gateway
    participant MySQL as MySQL 8.0 (InnoDB ACID Locks)
    participant Queue as Resilient Email/Notification Queue
    participant Socket as Socket.IO Hub (Real-Time Streams)

    Note over Customer,Socket: 1. Order Placement & Payment (Checkout)
    Customer->>Express: POST /api/orders/checkout (with Idempotency-Key)
    Express->>MySQL: START TRANSACTION (Row locks on products)
    MySQL-->>Express: Decrement inventory & insert orders, order_items
    Express->>MySQL: COMMIT
    Express->>Queue: Enqueue notification (order:created)
    Express->>Socket: Emit order:created to admin_feed
    Express-->>Customer: 201 Created (Order ID & Status 'placed')

    Note over Customer,Socket: 2. Task 1: Shipment Processing & Partial Fulfillment
    Admin->>Express: POST /api/orders/:id/shipments (Partial items)
    Express->>OrderSvc: Calculate fulfilled vs remaining item balances
    Express->>MySQL: INSERT INTO shipments, shipment_items
    Express->>MySQL: UPDATE orders SET status = 'partially_fulfilled'
    Express->>Queue: Enqueue shipment notification
    Express->>Socket: Emit order:shipment_created & order:status_updated
    Admin->>Express: POST /api/orders/:id/shipments/:shipmentId/tracking
    Express->>MySQL: INSERT INTO shipment_tracking_events
    Express->>Socket: Emit order:tracking_updated
    Customer->>Express: GET /api/orders/:id/tracking (View live checkpoints)

    Note over Customer,Socket: 3. Task 2: Cancellation & Return (RMA) Workflows
    Customer->>Express: POST /api/orders/:id/cancel-request
    Express->>OrderSvc: Validate pre-shipment eligibility
    Express->>MySQL: INSERT INTO order_cancellation_requests
    Express->>Socket: Emit order:cancellation_requested
    Admin->>Express: POST /api/orders/:id/cancel-request/review (action: 'approve')
    Express->>MySQL: UPDATE orders SET status = 'cancelled' & Restock Inventory
    Express->>Queue: Enqueue cancellation notification
    
    Customer->>Express: POST /api/orders/:id/return-request (RMA items)
    Express->>OrderSvc: Validate delivered status & return eligibility window
    Express->>MySQL: INSERT INTO order_returns & order_return_items (status: 'requested')
    Admin->>Express: POST /api/orders/:id/return-request/review (action: 'approve', restock: true)
    Express->>MySQL: UPDATE order_returns SET status = 'return_approved' & Restock Inventory

    Note over Customer,Socket: 4. Task 3: Stripe Refund & DB Synchronization
    Admin->>Express: POST /api/orders/:id/refund (amount, reason)
    Express->>OrderSvc: Guard against over-refund (sum(refunds) + amount <= total_amount)
    Express->>Stripe: stripe.refunds.create({ payment_intent, amount })
    Stripe-->>Express: Refund Succeeded (re_1N...)
    Express->>MySQL: INSERT INTO order_refunds (amount, stripe_refund_id, status='succeeded')
    Express->>MySQL: UPDATE orders SET payment_status = 'partially_refunded' / 'refunded'
    Express->>Queue: Enqueue refund notification
    Express->>Socket: Emit order:refund_issued & order:status_updated

    Note over Customer,Socket: 5. Task 4: Background Queue, Exponential Backoff & DLQ
    Queue->>Queue: Process Notification (Attempt 1..3 with Backoff: 2s, 4s, 8s)
    alt Failure Threshold Exceeded
        Queue->>Queue: Move to Dead Letter Queue (DLQ)
        Queue->>Socket: Emit dlq:job_added to Admin
    end
```

---

## 📁 2. File & Directory Layout

```text
MERN_Stack_Roadmap/
├── README.md                                           # Master repository guide & quickstart
├── SKILL.md                                            # Practical CLI commands, test scripts & cURL
├── CODE-MAP.md                                         # Architectural blueprint, schema contracts & routes
├── OPEN-QUESTIONS.md                                   # System design trade-offs & interview dilemmas
├── notes.md                                            # In-depth technical notes & design patterns
├── mongodb-and-rest.md                                 # MySQL vs MongoDB comparison & REST principles
├── ORDER_LIFECYCLE_MASTER_DOCUMENTATION.md             # Standard 9-section master lifecycle documentation
├── docs/
│   ├── END_TO_END_ORDER_LIFECYCLE_REPORT.md            # Generated end-to-end order lifecycle report
│   ├── INTEGRATION_REPORT.md                           # Enterprise integration report & audit logs
│   ├── INTEGRATION_DEBUGGING_PLAYBOOK.md               # SRE runbook & debugging guide
│   └── SHOPSPHERE_SYSTEM_ARCHITECTURE.md               # Topology & architectural diagrams
├── backend/
│   ├── server.js                                       # Express HTTP server & Socket.IO server initialization
│   ├── config/
│   │   └── db.js                                       # MySQL connection pool (InnoDB)
│   ├── controllers/
│   │   ├── orderController.js                          # Core order, shipment, return, refund HTTP handlers
│   │   ├── authController.js                           # User registration, login & JWT auth
│   │   └── productController.js                        # Product catalog & stock management
│   ├── services/
│   │   ├── orderService.js                             # Finite State Machine (FSM), shipments, returns & refunds
│   │   ├── stripeService.js                            # Stripe PaymentIntents, refunds & webhook processor
│   │   ├── emailQueue.js                               # Resilient notification queue with DLQ & exponential backoff
│   │   ├── socketService.js                            # Socket.IO room dispatcher & real-time streams
│   │   ├── razorpayService.js                          # Razorpay order generation & HMAC verification
│   │   └── telemetryService.js                         # Distributed tracing & APM metrics
│   ├── routes/
│   │   ├── orderRoutes.js                              # /api/orders routing table (26 endpoints)
│   │   ├── productRoutes.js                            # /api/products routing table
│   │   └── authRoutes.js                               # /api/auth routing table
│   └── scripts/
│       ├── testTask5IntegrationSuite.js                # Task 5: 45-assertion end-to-end integration test runner
│       ├── generateOrderLifecycleReport.js             # Task 6: Order lifecycle report generator
│       ├── clearAllOrdersAndData.js                    # Database maintenance & catalog reset script
│       ├── testOrderCancellationFlow.js                # Cancellation & restocking verification
│       ├── testOrderRealtimeAndQueue.js                # Real-time WebSocket & email queue verification
│       └── testRazorpayIntegration.js                  # Razorpay signature verification test
└── frontend/
    └── src/
        ├── components/
        │   ├── CartDrawer.jsx                          # Dual-tier checkout drawer
        │   ├── OrdersTrackerModal.jsx                  # Customer live tracking modal & order history
        │   ├── OrderStatusStepper.jsx                  # Interactive fulfillment stepper, checkpoints & RMA modal
        │   └── dashboard/
        │       ├── RealTimeOrdersManager.jsx           # Admin orders feed, partial shipment drawer & refund tool
        │       └── StripeIdempotencyStudio.jsx         # Idempotency & webhook simulation lab
        ├── context/
        │   ├── AuthContext.jsx                         # User session & role management
        │   ├── CartContext.jsx                         # Shopping cart & pricing state
        │   └── SocketContext.jsx                       # Real-time Socket.IO connection manager
        └── pages/
            ├── Products.jsx                            # Products catalog & price filtering
            └── Dashboard.jsx                           # Admin operations, telemetry & diagnostics
```

---

## 🛣️ 3. API Routing Table

| Method | Endpoint | Description | Task Scope |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders/checkout` | Create order with ACID row lock & idempotency check | Checkout Core |
| `POST` | `/api/orders/:id/shipments` | Create full or partial shipment with line-item allocation | **Task 1** |
| `GET` | `/api/orders/:id/shipments` | List all shipments and tracking numbers for an order | **Task 1** |
| `POST` | `/api/orders/:id/shipments/:shipmentId/tracking` | Append tracking checkpoint event (location, status, notes) | **Task 1** |
| `GET` | `/api/orders/:id/tracking` | Customer live tracking checkpoints and shipment status | **Task 1** |
| `PATCH`| `/api/orders/:id/status` | Transition order status with FSM validation | **Task 1** |
| `GET` | `/api/orders/:id/eligibility` | Check cancellation and return eligibility rules | **Task 2** |
| `POST` | `/api/orders/:id/cancel-request` | Customer requests pre-shipment order cancellation | **Task 2** |
| `POST` | `/api/orders/:id/cancel-request/review` | Admin review (approve/reject) cancellation with optional refund | **Task 2** |
| `POST` | `/api/orders/:id/return-request` | Customer requests RMA return with line items & reason | **Task 2** |
| `POST` | `/api/orders/:id/return-request/review` | Admin review (approve/reject) RMA return with optional restock | **Task 2** |
| `GET` | `/api/orders/requests/returns` | List pending return requests for admin review | **Task 2** |
| `GET` | `/api/orders/requests/cancellations` | List pending cancellation requests for admin review | **Task 2** |
| `POST` | `/api/orders/:id/refund` | Issue Stripe refund, guard against over-refund, update DB | **Task 3** |
| `GET` | `/api/orders/:id/refunds` | Retrieve complete refund audit ledger for order | **Task 3** |
| `POST` | `/api/orders/webhook` | Stripe webhook listener with cryptographic signature verification | **Task 3** |
| `POST` | `/api/orders/simulate-webhook` | Synthetic Stripe webhook test simulation endpoint | **Task 3** |
| `GET` | `/api/orders/email-queue/stats` | Background notification queue statistics (active, dlq, etc.) | **Task 4** |
| `GET` | `/api/orders/email-queue/logs` | Background worker execution logs | **Task 4** |
| `GET` | `/api/orders/email-queue/dlq` | List Dead Letter Queue (DLQ) failed jobs | **Task 4** |
| `POST` | `/api/orders/email-queue/jobs/:id/retry` | Re-queue specific DLQ job | **Task 4** |
| `POST` | `/api/orders/email-queue/dlq/retry-all` | Re-queue all DLQ jobs | **Task 4** |
| `POST` | `/api/orders/email-queue/fault-injection` | Toggle simulated delivery failure for resilience testing | **Task 4** |
| `POST` | `/api/orders/integration-tests/run` | Execute 45-assertion automated integration test suite | **Task 5** |
| `POST` | `/api/orders/clear-all-data` | Clear all test orders, shipments, returns, refunds & reset stock | **Task 6** |
| `GET` | `/api/orders/consistency/check` | Audit database inventory consistency | **Task 6** |

---

## 🗄️ 4. Relational Database Schema & Table Definitions

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : referenced_in
    ORDERS ||--o{ SHIPMENTS : fulfills
    SHIPMENTS ||--|{ SHIPMENT_ITEMS : includes
    SHIPMENTS ||--o{ SHIPMENT_TRACKING_EVENTS : tracks
    ORDERS ||--o{ ORDER_CANCELLATION_REQUESTS : requests
    ORDERS ||--o{ ORDER_RETURNS : requests
    ORDER_RETURNS ||--|{ ORDER_RETURN_ITEMS : specifies
    ORDERS ||--o{ ORDER_REFUNDS : refunds
    USERS ||--o{ IDEMPOTENCY_KEYS : initiates

    ORDERS {
        int id PK
        int user_id FK
        decimal total_amount
        string status "placed|confirmed|partially_fulfilled|shipped|delivered|cancelled"
        string payment_status "pending|paid|partially_refunded|refunded"
        string payment_method
        string payment_intent_id
        text shipping_address
        timestamp created_at
    }

    SHIPMENTS {
        int id PK
        int order_id FK
        string carrier
        string tracking_number
        string status "processing|in_transit|out_for_delivery|delivered|failed"
        timestamp created_at
    }

    SHIPMENT_ITEMS {
        int id PK
        int shipment_id FK
        int order_item_id FK
        int quantity
    }

    SHIPMENT_TRACKING_EVENTS {
        int id PK
        int shipment_id FK
        string status
        string location
        text notes
        timestamp event_time
    }

    ORDER_RETURNS {
        int id PK
        int order_id FK
        int user_id FK
        string rma_number UK
        string reason
        string status "requested|return_approved|rejected|received|refunded"
        timestamp created_at
    }

    ORDER_CANCELLATION_REQUESTS {
        int id PK
        int order_id FK
        int user_id FK
        string reason
        string status "pending|approved|rejected"
        timestamp created_at
    }

    ORDER_REFUNDS {
        int id PK
        int order_id FK
        decimal amount
        string reason
        string stripe_refund_id
        string status "pending|succeeded|failed"
        timestamp created_at
    }
```
