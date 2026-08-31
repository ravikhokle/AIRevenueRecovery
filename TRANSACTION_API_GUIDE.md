# Transaction API Endpoints

Complete API reference for transaction management with examples.

## 🚀 Quick Start

All endpoints are available at `http://localhost:3000/api/transactions` (when running `npm run dev`).

## Endpoints

### 1. GET /api/transactions

**Description**: Fetch transactions with optional filtering by status and pagination.

**Query Parameters**:
- `status` (optional): Filter by status: `SUCCESS`, `FAILED`, `PENDING`, or `ABANDONED`
- `limit` (optional): Maximum results to return (default: 50, max: 1000)
- `skip` (optional): Number of records to skip for pagination (default: 0)

**Response**: 
- Status: `200 OK`
- Body: 
  ```json
  {
    "data": [Transaction, ...],
    "pagination": {
      "total": number,
      "limit": number,
      "skip": number,
      "hasMore": boolean
    }
  }
  ```

**Error Responses**:
- `400 Bad Request`: Invalid status value
- `500 Internal Server Error`: Database connection or processing error

---

### 2. GET /api/transactions/[id]

**Description**: Fetch a single transaction by its `transactionId`.

**Parameters**:
- `id` (path): The transactionId (e.g., `syn_txn_0001` or `txn_abc123`)

**Response**:
- Status: `200 OK`
- Body:
  ```json
  {
    "data": Transaction
  }
  ```

**Error Responses**:
- `400 Bad Request`: Missing or invalid transaction ID
- `404 Not Found`: Transaction not found
- `500 Internal Server Error`: Database connection or processing error

---

### 3. POST /api/transactions

**Description**: Create a new transaction.

**Request Body**:
```json
{
  "transactionId": "string (required, unique)",
  "customerId": "string (required)",
  "orderId": "string (required)",
  "amount": "number (required, positive integer, in smallest currency unit)",
  "currency": "string (required, 3-letter code, e.g., 'INR')",
  "status": "enum: SUCCESS | FAILED | PENDING | ABANDONED (required)",
  "paymentMethod": "string (required, e.g., 'card', 'upi')",
  "failureReason": "string | null (optional, for FAILED status)",
  "retryCount": "number (required, non-negative integer)"
}
```

**Response**:
- Status: `201 Created`
- Body:
  ```json
  {
    "data": Transaction
  }
  ```

**Error Responses**:
- `400 Bad Request`: Validation failed (missing fields, invalid types)
- `409 Conflict`: Transaction ID already exists
- `500 Internal Server Error`: Database connection or processing error

---

## Data Model

### Transaction Object

```typescript
{
  "transactionId": "syn_txn_0001",
  "customerId": "syn_cust_0001", 
  "orderId": "syn_ord_0001",
  "amount": 299500,                    // Amount in paise (₹ × 100)
  "currency": "INR",                   // ISO 4217 code
  "status": "SUCCESS",                 // or FAILED, PENDING, ABANDONED
  "paymentMethod": "card",             // e.g., card, upi, netbanking, wallet
  "failureReason": null,               // e.g., "insufficient_funds"
  "retryCount": 0,                     // Number of retry attempts
  "createdAt": "2026-01-15T09:00:00Z",
  "updatedAt": "2026-01-15T09:00:00Z",
  "_id": "ObjectId(...)"               // MongoDB ID (returned in response)
}
```

---

## 📝 Example Requests

### List All Transactions

```bash
curl -X GET "http://localhost:3000/api/transactions"
```

**Response** (200 OK):
```json
{
  "data": [
    {
      "transactionId": "txn_001",
      "customerId": "cust_001",
      "orderId": "ord_001",
      "amount": 499500,
      "currency": "INR",
      "status": "SUCCESS",
      "paymentMethod": "card",
      "failureReason": null,
      "retryCount": 0,
      "createdAt": "2026-01-15T09:00:00Z",
      "updatedAt": "2026-01-15T09:00:00Z",
      "_id": "..."
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 50,
    "skip": 0,
    "hasMore": true
  }
}
```

---

### List Transactions with Pagination

```bash
curl -X GET "http://localhost:3000/api/transactions?limit=10&skip=0"
```

---

### Filter by Status: SUCCESS

```bash
curl -X GET "http://localhost:3000/api/transactions?status=SUCCESS"
```

**Response** (200 OK):
```json
{
  "data": [
    // Only transactions with status: "SUCCESS"
  ],
  "pagination": {
    "total": 62,
    "limit": 50,
    "skip": 0,
    "hasMore": false
  }
}
```

---

### Filter by Status: FAILED

```bash
curl -X GET "http://localhost:3000/api/transactions?status=FAILED"
```

---

### Filter by Status: ABANDONED

```bash
curl -X GET "http://localhost:3000/api/transactions?status=ABANDONED"
```

---

### Filter with Pagination

```bash
# Get 20 failed transactions, skip first 40
curl -X GET "http://localhost:3000/api/transactions?status=FAILED&limit=20&skip=40"
```

---

### Get Single Transaction

```bash
curl -X GET "http://localhost:3000/api/transactions/syn_txn_0001"
```

**Response** (200 OK):
```json
{
  "data": {
    "transactionId": "syn_txn_0001",
    "customerId": "syn_cust_0001",
    "orderId": "syn_ord_0001",
    "amount": 299500,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "card",
    "failureReason": null,
    "retryCount": 0,
    "createdAt": "2026-01-15T09:00:00Z",
    "updatedAt": "2026-01-15T09:00:00Z",
    "_id": "..."
  }
}
```

**When Not Found** (404 Not Found):
```json
{
  "error": "Not found",
  "message": "Transaction with ID 'txn_nonexistent' not found"
}
```

---

### Create Transaction (Successful)

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_custom_001",
    "customerId": "cust_new_001",
    "orderId": "ord_new_001",
    "amount": 149999,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "upi",
    "failureReason": null,
    "retryCount": 0
  }'
```

**Response** (201 Created):
```json
{
  "data": {
    "transactionId": "txn_custom_001",
    "customerId": "cust_new_001",
    "orderId": "ord_new_001",
    "amount": 149999,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "upi",
    "failureReason": null,
    "retryCount": 0,
    "createdAt": "2026-08-31T10:30:00Z",
    "updatedAt": "2026-08-31T10:30:00Z",
    "_id": "..."
  }
}
```

---

### Create Transaction (Failed with Retry)

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_failed_001",
    "customerId": "cust_retry_001",
    "orderId": "ord_retry_001",
    "amount": 99900,
    "currency": "INR",
    "status": "FAILED",
    "paymentMethod": "card",
    "failureReason": "insufficient_funds",
    "retryCount": 2
  }'
```

**Response** (201 Created):
```json
{
  "data": {
    "transactionId": "txn_failed_001",
    "customerId": "cust_retry_001",
    "orderId": "ord_retry_001",
    "amount": 99900,
    "currency": "INR",
    "status": "FAILED",
    "paymentMethod": "card",
    "failureReason": "insufficient_funds",
    "retryCount": 2,
    "createdAt": "2026-08-31T10:30:00Z",
    "updatedAt": "2026-08-31T10:30:00Z",
    "_id": "..."
  }
}
```

---

### Create Transaction (Abandoned)

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_abandoned_001",
    "customerId": "cust_abandoned_001",
    "orderId": "ord_abandoned_001",
    "amount": 249900,
    "currency": "INR",
    "status": "ABANDONED",
    "paymentMethod": "netbanking",
    "retryCount": 0
  }'
```

**Response** (201 Created):
```json
{
  "data": {
    "transactionId": "txn_abandoned_001",
    "customerId": "cust_abandoned_001",
    "orderId": "ord_abandoned_001",
    "amount": 249900,
    "currency": "INR",
    "status": "ABANDONED",
    "paymentMethod": "netbanking",
    "failureReason": null,
    "retryCount": 0,
    "createdAt": "2026-08-31T10:30:00Z",
    "updatedAt": "2026-08-31T10:30:00Z",
    "_id": "..."
  }
}
```

---

## ❌ Error Examples

### Invalid Status Filter

```bash
curl -X GET "http://localhost:3000/api/transactions?status=INVALID"
```

**Response** (400 Bad Request):
```json
{
  "error": "Invalid status",
  "message": "Status must be one of: SUCCESS, FAILED, PENDING, ABANDONED"
}
```

---

### Invalid JSON in Request Body

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d 'not valid json'
```

**Response** (400 Bad Request):
```json
{
  "error": "Invalid JSON",
  "message": "Request body must be valid JSON"
}
```

---

### Missing Required Fields

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_001"
  }'
```

**Response** (400 Bad Request):
```json
{
  "error": "Validation failed",
  "details": {
    "customerId": ["Customer ID is required"],
    "orderId": ["Order ID is required"],
    "amount": ["Expected number"],
    "currency": ["Expected string"],
    "status": ["Invalid enum value"],
    "paymentMethod": ["Payment method is required"],
    "retryCount": ["Expected number"]
  }
}
```

---

### Invalid Data Types

```bash
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_001",
    "customerId": "cust_001",
    "orderId": "ord_001",
    "amount": -100,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "card",
    "retryCount": 0
  }'
```

**Response** (400 Bad Request):
```json
{
  "error": "Validation failed",
  "details": {
    "amount": ["Amount must be a positive integer"]
  }
}
```

---

### Duplicate Transaction ID

```bash
# Create a transaction
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_dup_001",
    "customerId": "cust_001",
    "orderId": "ord_001",
    "amount": 99900,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "card",
    "retryCount": 0
  }'

# Try to create the same transaction again
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_dup_001",
    "customerId": "cust_002",
    "orderId": "ord_002",
    "amount": 99900,
    "currency": "INR",
    "status": "SUCCESS",
    "paymentMethod": "card",
    "retryCount": 0
  }'
```

**Response** (409 Conflict):
```json
{
  "error": "Conflict",
  "message": "Transaction with ID 'txn_dup_001' already exists"
}
```

---

### Transaction Not Found

```bash
curl -X GET "http://localhost:3000/api/transactions/txn_nonexistent"
```

**Response** (404 Not Found):
```json
{
  "error": "Not found",
  "message": "Transaction with ID 'txn_nonexistent' not found"
}
```

---

## 🧪 Testing with Synthetic Data

If you've seeded synthetic data, you can test with:

```bash
# List all synthetic transactions
curl -X GET "http://localhost:3000/api/transactions?limit=5"

# Get a specific synthetic transaction
curl -X GET "http://localhost:3000/api/transactions/syn_txn_0001"

# Count successful synthetic transactions
curl -X GET "http://localhost:3000/api/transactions?status=SUCCESS&limit=1"
```

---

## 📊 Status Codes Summary

| Code | Meaning |
|------|---------|
| `200` | Success (GET) |
| `201` | Created (POST) |
| `400` | Bad request (validation error, invalid query params) |
| `404` | Not found (transaction doesn't exist) |
| `409` | Conflict (duplicate transaction ID) |
| `500` | Server error (database connection, processing error) |

---

## 🔍 Field Validation Rules

| Field | Type | Rules | Example |
|-------|------|-------|---------|
| `transactionId` | String | Required, unique, non-empty | `"txn_001"` |
| `customerId` | String | Required, non-empty | `"cust_001"` |
| `orderId` | String | Required, non-empty | `"ord_001"` |
| `amount` | Number | Required, positive integer | `99900` |
| `currency` | String | Required, exactly 3 chars | `"INR"` |
| `status` | Enum | Required, one of 4 values | `"SUCCESS"` |
| `paymentMethod` | String | Required, non-empty | `"card"` |
| `failureReason` | String \| null | Optional, can be null | `"insufficient_funds"` |
| `retryCount` | Number | Required, non-negative integer | `0`, `1`, `2` |

---

## 💡 Advanced Examples

### Get Total Transaction Count

```bash
# Get first result with total count
curl -X GET "http://localhost:3000/api/transactions?limit=1" | jq '.pagination.total'
```

---

### Create Multiple Transactions (Batch)

```bash
# Create first transaction
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"batch_001","customerId":"c1","orderId":"o1","amount":99900,"currency":"INR","status":"SUCCESS","paymentMethod":"card","retryCount":0}'

# Create second transaction
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"batch_002","customerId":"c2","orderId":"o2","amount":149900,"currency":"INR","status":"FAILED","paymentMethod":"upi","failureReason":"network_timeout","retryCount":1}'

# Create third transaction
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"batch_003","customerId":"c3","orderId":"o3","amount":249900,"currency":"INR","status":"ABANDONED","paymentMethod":"netbanking","retryCount":0}'
```

---

### Script: Fetch and Filter Transactions

```bash
#!/bin/bash
# Get all FAILED transactions and count them

TOTAL_FAILED=$(curl -s "http://localhost:3000/api/transactions?status=FAILED&limit=1" | jq '.pagination.total')
echo "Total FAILED transactions: $TOTAL_FAILED"

# Fetch all pages of FAILED transactions
for skip in 0 50 100; do
  curl -s "http://localhost:3000/api/transactions?status=FAILED&limit=50&skip=$skip" | jq '.data[] | {id: .transactionId, amount: .amount, reason: .failureReason}'
done
```

---

## Environment & Running

Make sure MongoDB is running and configured in `.env.local`:

```
MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery
```

Start the development server:

```bash
npm run dev
```

Then test the endpoints at `http://localhost:3000/api/transactions`.
