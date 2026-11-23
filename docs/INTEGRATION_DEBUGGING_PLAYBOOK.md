# 🛠️ Integration Debugging Playbook: Full-Stack E-Commerce Architecture

> **Audience**: SRE, On-Call Engineers, Backend Developers, and Frontend Engineers  
> **System Scope**: React SPA (Vite) ⇄ Nginx (Edge/Reverse Proxy) ⇄ Express API Cluster ⇄ MySQL 8.0 (InnoDB) ⇄ Redis / Async Queue ⇄ Stripe Payment Gateway

---

## 🎯 Incident Spotlight Scenario: "Checkout Succeeds in React UI, but Order is Missing in MySQL"

### Incident Symptom
A customer clicks "Complete Checkout", the Stripe payment modal resolves, the React UI transitions to an "Order Placed Successfully" screen, but:
1. No new row appears in the MySQL `orders` or `order_items` tables.
2. The user's order history in their profile remains empty.
3. No confirmation email is received from the background queue worker.

---

## 🧭 Step-by-Step Triage Flowchart

```
[ Customer clicks Checkout in React UI ]
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  STEP 1: Frontend Network & State Triage     │
│  - Inspect Browser DevTools Network tab      │
│  - Check POST /api/orders/checkout HTTP Code │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ HTTP 200 Received ]       [ Network Error / 5xx / 4xx ]
         │                           │
         │                           ▼
         │                 Root Cause: Optimistic UI False Positive
         │                 Fix: Revert premature state flip; await API confirmation.
         ▼
┌──────────────────────────────────────────────┐
│  STEP 2: Edge & Reverse Proxy (Nginx) Layer  │
│  - Check access.log & error.log for timeouts │
│  - Verify upstream proxy buffering           │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ Nginx forwarded request ]   [ 502 Bad Gateway / 504 Timeout ]
         │                           │
         │                           ▼
         │                 Root Cause: Upstream drop or keepalive timeout.
         ▼
┌──────────────────────────────────────────────┐
│  STEP 3: Express Controller & Tracing Layer  │
│  - Correlate APM X-Trace-Id across logs      │
│  - Inspect Idempotency Key cache hit/miss    │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ Fresh Idempotency Key ]     [ Stale Idempotency Key Replay ]
         │                           │
         │                           ▼
         │                 Root Cause: Frontend reused old Idempotency-Key;
         │                 Backend replayed cached 200 without DB write.
         ▼
┌──────────────────────────────────────────────┐
│  STEP 4: Stripe Payment & Webhook Lifecycle  │
│  - Is Order created on HTTP POST or Webhook? │
│  - Check Stripe Dashboard event deliveries   │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ PaymentIntent Succeeded ]   [ Webhook Signature Failed / 400 ]
         │                           │
         │                           ▼
         │                 Root Cause: rawBody missing for HMAC SHA256 check.
         ▼
┌──────────────────────────────────────────────┐
│  STEP 5: MySQL InnoDB Transaction Triage     │
│  - Check ROLLBACK vs uncommitted COMMIT      │
│  - Check Deadlock & foreign key constraints  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
       [ Is connection.commit() reached? ]
         ├── NO  --> Root Cause: Unhandled rejection during order_items loop triggered rollback.
         └── YES --> Root Cause: Dirty read / Read replica lag or mismatched database schema.
```

---

## 🔍 Diagnostic Matrix: 6 Core Architecture Layers

| Layer | Common Failure Modes | Diagnostic Probe Command / Tool | Remediation Action |
|---|---|---|---|
| **1. Frontend (React / Vite)** | • Optimistic UI false positive<br>• Cached stale `Idempotency-Key`<br>• CORS preflight failure (`OPTIONS`) | Browser DevTools Network Tab<br>`console.log(window.__APM_TRACES__)` | Ensure UI only resolves upon `res.ok === true` and generates fresh `crypto.randomUUID()` per checkout attempt. |
| **2. Edge Proxy (Nginx)** | • `504 Gateway Timeout`<br>• `proxy_buffer` overflow on large payload<br>• Dropped `X-Trace-Id` header | `docker logs nginx-proxy -f`<br>`grep "504" /var/log/nginx/access.log` | Increase `proxy_read_timeout 60s;`, pass through custom headers (`X-Trace-Id`, `Idempotency-Key`). |
| **3. API Cluster (Express)** | • Uncaught exception inside async promise<br>• Stripe SDK timeout<br>• Broken middleware sequence | `npm run dev` logs<br>`GET /api/telemetry/traces?status=500` | Wrap controller logic in structured try/catch; record trace spans in APM middleware. |
| **4. Database (MySQL 8.0)** | • Transaction rollback on item insert<br>• Uncommitted `START TRANSACTION`<br>• Deadlock / Row-level lock timeout | `SELECT * FROM orders ORDER BY id DESC LIMIT 5;`<br>`SHOW ENGINE INNODB STATUS;` | Ensure `await connection.commit()` is always called, and all item queries execute on the **same connection instance**. |
| **5. Cache & Queue (Redis / Bull)** | • Redis OOM (`maxmemory` eviction)<br>• Stalled background job<br>• Worker process crashed | `redis-cli ping`<br>`redis-cli INFO memory`<br>`GET /api/diagnostics/system-health` | Configure Redis with `maxmemory-policy allkeys-lru`, restart Bull queue worker with dead-letter queue (DLQ). |
| **6. Payment Gateway (Stripe)** | • Webhook HMAC signature mismatch<br>• Body parser stripped `req.rawBody`<br>• Webhook endpoint timeout | `stripe listen --forward-to localhost:5000/api/orders/webhook`<br>`stripe events list` | Use `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })` to preserve exact buffer for signature validation. |

---

## 💻 Diagnostic Query & Command Runbook

### 1. MySQL InnoDB Inspection
```sql
-- Check if the order was written under a different status
SELECT id, user_id, total_amount, status, payment_method, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;

-- Check for orphaned order_items or constraint violations
SELECT oi.* 
FROM order_items oi
LEFT JOIN orders o ON oi.order_id = o.id
WHERE o.id IS NULL;

-- Check active database locks and recent deadlock traces
SHOW ENGINE INNODB STATUS\G;

-- Check connected threads and pool saturation
SHOW STATUS LIKE 'Threads_connected';
SHOW VARIABLES LIKE 'max_connections';
```

### 2. Idempotency Key Verification
```sql
-- Inspect recent idempotency records to see if a cached 200 was replayed
SELECT idempotency_key, user_id, status_code, endpoint, created_at, expires_at 
FROM idempotency_keys 
ORDER BY created_at DESC 
LIMIT 10;
```

### 3. Redis & Worker Queue Inspection
```bash
# Verify Redis responsiveness
redis-cli ping

# Check memory pressure and connected clients
redis-cli INFO memory
redis-cli INFO clients

# Check Bull queue keys
redis-cli KEYS "bull:email-queue:*"

# Monitor live Redis operations in real-time
redis-cli MONITOR
```

### 4. Synthetic cURL Probes with Trace Headers
```bash
# 1. Probe API Health
curl -i -X GET http://localhost:5000/api/health

# 2. Probe System Diagnostics
curl -i -X GET http://localhost:5000/api/diagnostics/system-health

# 3. Execute End-to-End Traced Checkout Probe
curl -i -X POST http://localhost:5000/api/orders/checkout \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-sre-debug-001" \
  -H "Idempotency-Key: idemp-sre-debug-001" \
  -d '{
    "items": [{"id": 1, "quantity": 1, "price": 45000}],
    "shippingAddress": "123 SRE Runbook Ave, Cloud City",
    "paymentMethod": "stripe_test_card"
  }'
```

### 5. Stripe CLI Webhook Debugging
```bash
# Listen and forward Stripe webhooks locally
stripe listen --forward-to localhost:5000/api/orders/webhook

# Trigger synthetic payment success event
stripe trigger payment_intent.succeeded
```

---

## 🛡️ Best Practice Checklist for Preventing Integration Failures

1. **Transactional Atomicity**:
   Always execute multi-table writes (`orders` + `order_items` + `inventory_deduction`) on the **same MySQL pooled connection** inside `START TRANSACTION ... COMMIT / ROLLBACK`.
2. **Deterministic Idempotency**:
   Never rely on client timestamp for idempotency; generate unique UUIDv4 tokens tied to specific cart state hashes.
3. **Preserve Webhook Raw Body**:
   Always ensure Express preserves `req.rawBody` buffer before JSON body parsing for cryptographic HMAC signature verification.
4. **Decouple Email / Notification Delivery**:
   Never block synchronous HTTP checkout responses on SMTP network calls; enqueue jobs to an asynchronous Bull/Redis queue.
5. **Full-Stack Trace Propagation**:
   Pass `X-Trace-Id` from React through Nginx reverse proxy into Express middleware, attaching the same Trace ID to database query spans and queue payloads.
