# Developer Skill & CLI Verification Playbook

This playbook provides practical CLI commands, PowerShell scripts, Node.js execution snippets, and API verification commands for testing the **6 Enterprise Order Management & Integration Tasks**:
1. **Shipment Processing & Partial Fulfillment**
2. **Return-Request & Cancellation Workflows**
3. **Stripe Refund Processing & DB Synchronization**
4. **Background Notification Queue & DLQ Retries**
5. **Automated Integration Test Suite**
6. **End-to-End Order Lifecycle Report & Database Maintenance**

---

## 📦 Task 1: Shipment Processing, Partial Fulfillment & Tracking

### 1. Place a Multi-Item Order (Preparation)
```powershell
$orderPayload = @{
  userId = 1
  shippingAddress = "221B Baker Street, London, NW1 6XE"
  paymentMethod = "stripe"
  paymentIntentId = "pi_test_shipment_flow_01"
  cartItems = @(
    @{ productId = 1; name = "Sony WH-1000XM5"; price = 399.99; quantity = 2 }
    @{ productId = 2; name = "Apple Watch Series 9"; price = 429.00; quantity = 1 }
  )
} | ConvertTo-Json -Depth 4

$orderRes = Invoke-RestMethod -Uri "http://localhost:5000/api/orders/checkout" -Method Post -Body $orderPayload -ContentType "application/json"
$orderId = $orderRes.order.id
Write-Host "Created Order ID:" $orderId "Status:" $orderRes.order.status
```

### 2. Create a Partial Shipment (Fulfill 1 of 2 Headphone units)
```powershell
$partialShipment = @{
  carrier = "FedEx"
  trackingNumber = "FDX-PARTIAL-88219"
  notes = "Warehouse Bay 3: Partial dispatch of available headphones."
  items = @(
    @{ orderItemId = $orderRes.order.items[0].id; quantity = 1 }
  )
} | ConvertTo-Json -Depth 4

$shipRes = Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/shipments" -Method Post -Body $partialShipment -ContentType "application/json"
Write-Host "Shipment ID:" $shipRes.shipment.id "Order Status:" $shipRes.orderStatus "(Expected: partially_fulfilled)"
```

### 3. Add Tracking Checkpoints to the Shipment
```powershell
$shipmentId = $shipRes.shipment.id
$checkpoint = @{
  status = "in_transit"
  location = "Heathrow Logistics Hub, UK"
  notes = "Package scanned at departure sorting facility."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/shipments/$shipmentId/tracking" -Method Post -Body $checkpoint -ContentType "application/json" | ConvertTo-Json -Depth 4
```

### 4. Complete Fulfillment (Remaining Items) & Fetch Live Tracking Info
```powershell
# Fulfill remaining items: 1 Sony headphone + 1 Apple Watch
$fullShipment = @{
  carrier = "DHL Express"
  trackingNumber = "DHL-FINAL-99120"
  notes = "Final shipment dispatching remaining order balance."
  items = @(
    @{ orderItemId = $orderRes.order.items[0].id; quantity = 1 }
    @{ orderItemId = $orderRes.order.items[1].id; quantity = 1 }
  )
} | ConvertTo-Json -Depth 4

$finalShipRes = Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/shipments" -Method Post -Body $fullShipment -ContentType "application/json"
Write-Host "Final Order Status:" $finalShipRes.orderStatus "(Expected: fulfilled or shipped)"

# Inspect Customer Live Tracking View
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/tracking" -Method Get | ConvertTo-Json -Depth 5
```

---

## 🔄 Task 2: Return-Request (RMA) & Cancellation Workflows

### 1. Check Order Eligibility for Cancellation and Return
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/eligibility" -Method Get | ConvertTo-Json -Depth 4
```

### 2. Submit a Customer Cancellation Request
```powershell
$cancelReq = @{
  userId = 1
  reason = "Accidental order; customer purchased duplicate items."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/cancel-request" -Method Post -Body $cancelReq -ContentType "application/json" | ConvertTo-Json -Depth 4
```

### 3. Admin Review & Approval/Rejection of Cancellation
```powershell
$cancellationReview = @{
  requestId = 1
  action = "approve" # or "reject"
  adminNotes = "Approved by Operations Team. Order stopped before carrier pickup."
  autoRefund = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/cancel-request/review" -Method Post -Body $cancellationReview -ContentType "application/json" | ConvertTo-Json -Depth 4
```

### 4. Submit an RMA Return Request (Delivered Order)
```powershell
$returnReq = @{
  userId = 1
  reason = "Item packaging arrived damaged."
  items = @(
    @{ orderItemId = $orderRes.order.items[0].id; quantity = 1 }
  )
} | ConvertTo-Json -Depth 4

$retRes = Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/return-request" -Method Post -Body $returnReq -ContentType "application/json"
Write-Host "Created RMA Number:" $retRes.returnRequest.rmaNumber
```

### 5. Admin Review & Approval of Return Request
```powershell
$returnReview = @{
  returnId = $retRes.returnRequest.id
  action = "approve"
  adminNotes = "Return authorized. Return shipping label emailed to customer."
  restock = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/return-request/review" -Method Post -Body $returnReview -ContentType "application/json" | ConvertTo-Json -Depth 4
```

---

## 💳 Task 3: Stripe Refund Integration & DB Synchronization

### 1. Issue Partial Refund via Stripe Gateway
```powershell
$refundPayload = @{
  amount = 150.00
  reason = "Customer compensation for partial return"
  paymentIntentId = "pi_test_shipment_flow_01"
} | ConvertTo-Json

$refundRes = Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/refund" -Method Post -Body $refundPayload -ContentType "application/json"
Write-Host "Stripe Refund ID:" $refundRes.refund.stripeRefundId "Order Payment Status:" $refundRes.order.payment_status
```

### 2. Verify Over-Refund Guard (Attempting to Refund More Than Balance)
```powershell
$excessRefund = @{
  amount = 999999.00
  reason = "Attempting illegal excess refund"
} | ConvertTo-Json

try {
  Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/refund" -Method Post -Body $excessRefund -ContentType "application/json"
} catch {
  Write-Host "Expected Guard Rejection:" $_.Exception.Message
}
```

### 3. Fetch Full Refund Ledger for Order
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/$orderId/refunds" -Method Get | ConvertTo-Json -Depth 4
```

---

## 🔔 Task 4: Background Notification Queue, Retries & DLQ

### 1. View Live Notification Queue Statistics
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/stats" -Method Get | ConvertTo-Json -Depth 4
```

### 2. View Queue Execution Logs
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/logs?limit=10" -Method Get | ConvertTo-Json -Depth 4
```

### 3. Test Fault Injection & Dead Letter Queue (DLQ)
```powershell
# 1. Enable fault injection (simulating 100% SMTP/notification failure)
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/fault-injection" -Method Post -Body (@{ enabled = $true } | ConvertTo-Json) -ContentType "application/json"

# 2. Dispatch simulated notification
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/simulate" -Method Post -Body (@{
  orderId = $orderId
  email = "customer@example.com"
} | ConvertTo-Json) -ContentType "application/json"

# 3. Wait for retries with exponential backoff and verify DLQ entry
Start-Sleep -Seconds 4
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/dlq" -Method Get | ConvertTo-Json -Depth 4

# 4. Disable fault injection and retry failed job
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/fault-injection" -Method Post -Body (@{ enabled = $false } | ConvertTo-Json) -ContentType "application/json"
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/email-queue/dlq/retry-all" -Method Post | ConvertTo-Json -Depth 4
```

---

## 🧪 Task 5: Automated Integration Test Execution (45 Assertions)

Execute the complete end-to-end integration test suite covering partial shipments, returns, refunds, webhooks, and invalid state transitions:

```powershell
# Run via CLI
node backend/scripts/testTask5IntegrationSuite.js

# Or trigger via REST endpoint
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/integration-tests/run" -Method Post | ConvertTo-Json -Depth 3
```

### What Task 5 Tests:
1. **Partial Shipment & Tracking**: Line item quantities, `partially_fulfilled` $\rightarrow$ `shipped` transitions, checkpoint events.
2. **Cancellation Workflow & Eligibility**: Pre-shipment eligibility validation, customer cancellation request, admin review.
3. **Return-Request (RMA) Workflow**: Post-delivery eligibility, item-level RMA creation, admin approval, stock restocking.
4. **Stripe Refund Integration**: Partial refund, full refund, DB synchronization, balance guard preventing over-refunds.
5. **Duplicate Webhook & Idempotency**: Duplicate Stripe `payment_intent.succeeded` events ignored idempotently.
6. **Invalid State Transitions**: Rejection of forbidden state skips (e.g. `placed` directly to `delivered` or modifying `cancelled` orders).

---

## 📊 Task 6: End-to-End Order Lifecycle Report & Database Maintenance

### 1. Generate Comprehensive Lifecycle Report
```powershell
# Generates markdown lifecycle report with database aggregations
node backend/scripts/generateOrderLifecycleReport.js
```
The report is saved to [docs/END_TO_END_ORDER_LIFECYCLE_REPORT.md](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/MERN_Stack_Roadmap/docs/END_TO_END_ORDER_LIFECYCLE_REPORT.md).

### 2. Database Consistency Verification
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/consistency/check" -Method Get | ConvertTo-Json -Depth 4
```

### 3. Clear All Old Test Orders & Reset Catalog Stock
```powershell
# CLI Execution:
node backend/scripts/clearAllOrdersAndData.js

# REST API Execution:
Invoke-RestMethod -Uri "http://localhost:5000/api/orders/clear-all-data" -Method Post | ConvertTo-Json -Depth 4
```
