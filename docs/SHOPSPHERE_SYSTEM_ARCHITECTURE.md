# 🏛️ ShopSphere Enterprise System Architecture & Integration Blueprint

> **System Version**: 2.0.0 (Production Blueprint)  
> **Topology**: React SPA (Vite/Tailwind) ⇄ Nginx (Edge Proxy / Same-Origin) ⇄ Express.js API ⇄ MySQL 8.0 (InnoDB) ⇄ Redis / Bull Queue ⇄ Stripe Payment Gateway

---

## 1. System Topology Overview

```
                        ┌──────────────────────────────────────────────┐
                        │              Client Tier                     │
                        │   React 19 SPA (Vite + TailwindCSS)          │
                        └──────────────────────┬───────────────────────┘
                                               │ HTTP / HTTPS (Port 80/443)
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │         Edge Ingress & Reverse Proxy         │
                        │           Nginx 1.25 Alpine Linux            │
                        │  - SSL Termination & Security Headers        │
                        │  - Same-Origin `/api` & `/uploads` Proxying  │
                        │  - Static Asset Caching (1 Year Immutable)   │
                        └───────┬──────────────────────────────┬───────┘
                                │                              │
                   Static / Uploads Requests               API Requests
                                │                              │
                                ▼                              ▼
    ┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
    │     CDN / Static File System         │     │     Application Service Cluster      │
    │  - `/uploads/products/*`             │     │     Express 4.x / Node.js Engine     │
    │  - `dist/assets/*.js`, `*.css`       │     │  - APM Distributed Tracing          │
    └──────────────────────────────────────┘     │  - Feature Flag Progressive Engine   │
                                                 │  - Stripe Idempotency Middleware     │
                                                 └───────┬──────────────────────┬───────┘
                                                         │                      │
                                 Transactional Queries   │                      │ Job Enqueue
                                                         ▼                      ▼
    ┌────────────────────────────────────────────────────────┐     ┌────────────────────────────────────┐
    │              Relational Database Tier                  │     │        Cache & Queue Tier          │
    │               MySQL 8.0 InnoDB Engine                  │     │      Redis 7.0 / In-Memory Bull    │
    │  - ACID Row-Level Locking (`FOR UPDATE`)               │     │  - Asynchronous Email Notifications│
    │  - Foreign Key Constraints & Cascades                  │     │  - Sub/Pub WebSocket Event Broker  │
    └────────────────────────────────────────────────────────┘     └────────────────────────────────────┘
```

---

## 2. MySQL Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "places"
    USERS ||--o{ IDEMPOTENCY_KEYS : "initiates"
    ORDERS ||--|{ ORDER_ITEMS : "contains"
    PRODUCTS ||--o{ ORDER_ITEMS : "referenced_in"

    USERS {
        int id PK "AUTO_INCREMENT"
        varchar name "100 NOT NULL"
        varchar email UK "150 NOT NULL UNIQUE"
        varchar password "255 NOT NULL (bcrypt hash)"
        enum role "'user', 'admin' DEFAULT 'user'"
        tinyint status "1=Active, 0=Disabled"
        timestamp created_at "CURRENT_TIMESTAMP"
        timestamp updated_at "CURRENT_TIMESTAMP"
    }

    PRODUCTS {
        int id PK "AUTO_INCREMENT"
        varchar name "255 NOT NULL"
        int category_id "NULLABLE"
        decimal price "10,2 NOT NULL"
        decimal discount_price "10,2 NULLABLE"
        int stock "DEFAULT 0"
        varchar sku "100 NULLABLE"
        varchar brand "100 NULLABLE"
        varchar image_url "500 NULLABLE"
        tinyint status "1=Active, 0=Draft"
        timestamp created_at "CURRENT_TIMESTAMP"
        timestamp updated_at "CURRENT_TIMESTAMP"
    }

    ORDERS {
        int id PK "AUTO_INCREMENT"
        int user_id FK "REFERENCES users(id) ON DELETE CASCADE"
        decimal total_amount "10,2 NOT NULL"
        varchar status "50 DEFAULT 'placed'"
        text shipping_address "NOT NULL"
        varchar payment_method "50 DEFAULT 'credit_card'"
        timestamp created_at "CURRENT_TIMESTAMP"
        timestamp updated_at "CURRENT_TIMESTAMP"
    }

    ORDER_ITEMS {
        int id PK "AUTO_INCREMENT"
        int order_id FK "REFERENCES orders(id) ON DELETE CASCADE"
        int product_id FK "REFERENCES products(id) ON DELETE RESTRICT"
        int quantity "NOT NULL"
        decimal price "10,2 NOT NULL"
        timestamp created_at "CURRENT_TIMESTAMP"
    }

    IDEMPOTENCY_KEYS {
        int id PK "AUTO_INCREMENT"
        varchar idempotency_key UK "255 NOT NULL UNIQUE"
        int user_id "NULLABLE"
        varchar request_path "255 NOT NULL"
        enum status "'IN_PROGRESS', 'COMPLETED', 'FAILED'"
        int response_code "DEFAULT 200"
        json response_body "Cached API Response"
        timestamp created_at "CURRENT_TIMESTAMP"
        timestamp updated_at "CURRENT_TIMESTAMP"
    }

    FEATURE_FLAGS {
        varchar flag_key PK "64 NOT NULL PRIMARY KEY"
        varchar name "100 NOT NULL"
        text description "NULLABLE"
        boolean is_active "DEFAULT TRUE"
        int rollout_percentage "0-100 DEFAULT 0"
        varchar target_roles "50 DEFAULT 'all'"
        text whitelist_user_ids "Comma-separated IDs"
        timestamp created_at "CURRENT_TIMESTAMP"
        timestamp updated_at "CURRENT_TIMESTAMP"
    }
```

---

## 3. End-to-End Sequence Diagrams

### Sequence 1: ACID Checkout with Stripe, Idempotency & Async Email Queue

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer (Browser)
    participant React as React SPA (Vite)
    participant Nginx as Nginx Reverse Proxy
    participant Express as Express API
    participant Idemp as Idempotency Engine
    participant DB as MySQL 8.0 (InnoDB)
    participant Stripe as Stripe Gateway
    participant Queue as Bull / Email Queue
    participant Socket as Socket.IO Hub

    User->>React: Click "Pay & Place Order"
    React->>React: Generate X-Trace-Id & Idempotency-Key (UUIDv4)
    React->>Nginx: POST /api/orders/checkout [Headers: Idempotency-Key, Trace-Id]
    Nginx->>Express: Proxy pass with X-Forwarded-For & Trace headers
    
    Express->>Idemp: Check Idempotency-Key
    alt Key exists & status == COMPLETED
        Idemp-->>Express: Return cached 200 payload
        Express-->>React: 200 OK (Idempotent Replay)
    else Key is New
        Express->>Idemp: Lock Key (status = 'IN_PROGRESS')
        Express->>DB: START TRANSACTION
        Express->>DB: INSERT INTO orders (user_id, total_amount, status='placed')
        Express->>DB: INSERT INTO order_items (order_id, product_id, qty, price)
        Express->>DB: COMMIT TRANSACTION
        
        Express->>Stripe: Confirm PaymentIntent (test mode)
        Stripe-->>Express: PaymentIntent Succeeded
        
        Express->>Idemp: Mark Key COMPLETED + cache payload
        Express->>Queue: Enqueue Async Email Job (order_id, email, template)
        Express->>Socket: Broadcast 'order:created' / 'order:status_updated'
        
        Express-->>Nginx: 201 Created { success: true, orderId: 13 }
        Nginx-->>React: 201 Created JSON
        React-->>User: Transition to Success Confirmation View
        
        par Async Background Notification
            Queue->>Queue: Worker picks up job
            Queue-->>User: Dispatch HTML Email Confirmation
        and Real-Time WebSocket Push
            Socket-->>React: Push Live Stepper Update (STAGE: CONFIRMED)
        end
    end
```

---

### Sequence 2: Feature Flag Progressive Rollout & Deterministic User Bucketing

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Session)
    participant React as React SPA
    participant Engine as Feature Flag Engine
    participant DB as MySQL feature_flags

    User->>React: Open Application / Dashboard
    React->>Engine: GET /api/feature-flags/evaluate?userId=4&role=customer
    Engine->>DB: SELECT * FROM feature_flags WHERE is_active = TRUE
    DB-->>Engine: Returns active flags: [new_checkout_v2 (50%)]
    
    rect rgb(30, 27, 75)
        note over Engine: Deterministic Polynomial Hashing<br/>Hash("4:new_checkout_v2") = 23<br/>Bucket = 23 < 50% => TRUE
    end
    
    Engine-->>React: { new_checkout_v2: true, express_shipping: false }
    React->>React: FeatureFlagContext sets state
    
    alt Flag is TRUE
        React-->>User: Render Variant B (Next-Gen Checkout v2 with Multi-Payment)
    else Flag is FALSE
        React-->>User: Render Variant A (Stable Legacy Checkout v1)
    end
```

---

### Sequence 3: End-to-End Distributed APM Tracing & Telemetry Propagation

```mermaid
sequenceDiagram
    autonumber
    participant Client as React Client Tracing
    participant Middleware as Express Tracing Middleware
    participant SpanRecorder as APM Span Recorder
    participant DB as MySQL Query Driver
    participant Dashboard as SRE Telemetry Dashboard

    Client->>Client: Start Root Trace: `trace_checkout_1791520`
    Client->>Middleware: POST /api/orders/checkout [traceparent: 00-traceid-spanid-01]
    Middleware->>SpanRecorder: Open Request Span
    
    SpanRecorder->>DB: Execute Query: `START TRANSACTION`
    DB-->>SpanRecorder: Query resolved (2.4ms)
    SpanRecorder->>SpanRecorder: Record Span `MySQL: START TRANSACTION`
    
    Middleware->>Middleware: Complete Response (Status: 201, Total: 18.2ms)
    Middleware->>SpanRecorder: Close Trace Waterfall & Compute Server-Timing
    Middleware-->>Client: Response + Headers [Server-Timing: app;dur=18.2, db;dur=2.4]
    
    Dashboard->>SpanRecorder: GET /api/telemetry/traces
    SpanRecorder-->>Dashboard: Waterfall JSON with Category Breakdown
    Dashboard-->>Dashboard: Render Interactive APM Waterfall Graph
```

---

## 4. Key Architectural Patterns & Guarantees

1. **ACID Transactional Guarantees**:
   Every multi-table state transition in MySQL executes on a single leased connection inside `START TRANSACTION ... COMMIT / ROLLBACK` to eliminate partial writes or orphaned records.
2. **Deterministic Replay-Safe Idempotency**:
   Protects against double-billing and duplicate order generation during network retries using database-backed unique idempotency keys with payload caching.
3. **Decoupled Asynchronous Background Workers**:
   Critical user-facing HTTP request-response cycles are never blocked on external SMTP handshakes; emails and heavy tasks are offloaded to an asynchronous background worker queue.
4. **Zero-Downtime Feature Flags & Blast-Radius Mitigation**:
   Progressive delivery is governed by deterministic user bucketing, role targeting, and instant database-backed kill-switches.
5. **Observability & Distributed Tracing**:
   Every request carries a correlated `X-Trace-Id` propagating across React, Nginx, Express, MySQL queries, and background worker queues.
