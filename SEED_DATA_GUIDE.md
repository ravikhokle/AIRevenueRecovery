# Synthetic Seed Data Guide

This guide explains the synthetic transaction generator and how to populate your MongoDB database with realistic test data.

## Overview

The synthetic data generator creates **~125 transactions** across **50 customers** with deterministic, reproducible scenarios. All data is clearly marked as synthetic using the `syn_` prefix.

### Key Features

- **Deterministic Generation**: Uses seeded pseudo-random number generation for reproducible results
- **Synthetic Markers**: All IDs use `syn_` prefix for easy identification and cleanup
- **Test Email Domain**: All synthetic emails use `@example.test` domain
- **Realistic Amounts**: Transaction amounts follow INR currency patterns (paise)
- **Multiple Scenarios**: Covers diverse payment recovery situations

## Quick Start

### Prerequisites

1. **MongoDB Running**: Ensure MongoDB is accessible at the URI specified in `.env.local`
2. **Environment Setup**: Copy `.env.example` to `.env.local` and configure:
   ```bash
   MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery
   ```
3. **Dependencies Installed**: Run `npm install` if not already done

### Run the Seed Script

```bash
npm run seed
```

This will:
1. Connect to MongoDB
2. Drop all existing synthetic records (matching `syn_*` pattern)
3. Create required indexes
4. Insert fresh synthetic data
5. Print summary statistics

### Expected Output

```
Synthetic seed completed.
Seed version: 1
Removed existing synthetic records: 125 transactions, 50 customers
Inserted: 125 transactions across 50 customers
Status breakdown: { SUCCESS: 62, FAILED: 53, ABANDONED: 10, PENDING: 0 }
Scenario breakdown: {
  successful_payment: 25,
  customer_with_previous_success: 16,
  temporary_looking_failure: 8,
  repeated_failure: 20,
  abandoned_checkout: 10,
  high_value_transaction: 16,
  multiple_failed_attempts: 18,
  unrecoverable_case: 12
}
Sample IDs: transaction syn_txn_0001, customer syn_cust_0001, email synthetic.user0001@example.test
```

## Generated Scenarios

### 1. **Successful Payments** (25 transactions)
- Customers: `syn_cust_0001` to `syn_cust_0010`
- Status: `SUCCESS`
- Retry Count: 0
- Use Case: Baseline successful payments for comparison

### 2. **Customer with Previous Success** (16 transactions)
- Customers: `syn_cust_0011` to `syn_cust_0018`
- Mix of: 2 prior successes + 1 temporary failure
- Failure Reasons: `insufficient_funds`, `network_timeout`, `issuer_unavailable`, `authentication_timeout`
- Use Case: Customers worth recovery (proven payment history)

### 3. **Repeated Failures** (20 transactions)
- Customers: `syn_cust_0019` to `syn_cust_0023`
- Multiple failed attempts (4 per customer)
- Failure Reasons: `payment_declined`, `authentication_failed`, `processing_error`
- Use Case: Pattern analysis for deterministic vs. temporary issues

### 4. **Abandoned Checkout** (10 transactions)
- Customers: `syn_cust_0024` to `syn_cust_0028`
- Status: `ABANDONED`
- 2 abandoned transactions per customer
- Use Case: Cart recovery and cart abandonment tracking

### 5. **High-Value Transactions** (16 transactions)
- Customers: `syn_cust_0029` to `syn_cust_0036`
- Amount Range: ₹50,000 - ₹150,000
- Mix of: 1 success + 1 failure per customer
- Use Case: Priority recovery targets (revenue impact)

### 6. **Multiple Failed Attempts** (18 transactions)
- Customers: `syn_cust_0037` to `syn_cust_0042`
- 3 failed attempts per customer
- Retry counts: 1, 2, 3
- Use Case: Identify patterns requiring recovery intervention

### 7. **Unrecoverable Cases** (12 transactions)
- Customers: `syn_cust_0043` to `syn_cust_0050`
- Failure Reasons: `fraud_suspected`, `card_permanently_blocked`, `invalid_card`, `max_retries_exceeded`, `account_closed`
- Some include `PENDING` status for edge cases
- Use Case: Define guardrails for unrecoverable scenarios

## Data Structure

### Transaction Record
```typescript
{
  transactionId: "syn_txn_0001",          // Unique synthetic ID
  customerId: "syn_cust_0001",            // Associated customer
  orderId: "syn_ord_0001",                // Associated order
  amount: 299500,                         // Amount in paise (₹2,995)
  currency: "INR",                        // Fixed to INR
  status: "SUCCESS" | "FAILED" | "ABANDONED" | "PENDING",
  paymentMethod: "card" | "upi" | "netbanking" | "wallet",
  failureReason: string | null,           // Reason for failures
  retryCount: 0,                          // Number of retry attempts
  createdAt: Date,                        // ISO timestamp
  updatedAt: Date                         // Same as createdAt (initial)
}
```

### Customer Record
```typescript
{
  customerId: "syn_cust_0001",
  email: "synthetic.user0001@example.test",
  phone: "+919999910001",
  name: "Synthetic User 0001",
  totalTransactions: 3,
  successfulPaymentCount: 3,
  failedPaymentCount: 0,
  abandonedPaymentCount: 0,
  totalSpent: 987500,                     // Sum of successful payments
  averageOrderValue: 329166,              // Rounded average
  lastPaymentAt: Date,
  lastSuccessfulPaymentAt: Date,
  lastFailedPaymentAt: null,
  preferredPaymentMethod: "card",
  createdAt: Date,
  updatedAt: Date
}
```

## Verification

### Using MongoDB CLI

```bash
# Count total transactions
mongosh "mongodb://localhost:27017/ai-revenue-recovery"
db.transactions.countDocuments({ transactionId: { $regex: "^syn_" } })
# Output: 125

# Count total customers
db.customers.countDocuments({ customerId: { $regex: "^syn_" } })
# Output: 50

# View transaction statuses
db.transactions.aggregate([
  { $match: { transactionId: { $regex: "^syn_" } } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

### Using Node.js Script

Create `verify-seed.ts`:

```typescript
import { connectToDatabase } from "@/lib/db";
import { getCustomersCollection, getTransactionsCollection } from "@/lib/models/customer";

async function verifySeed() {
  await connectToDatabase();
  const transactions = await getTransactionsCollection();
  const customers = await getCustomersCollection();

  const txnCount = await transactions.countDocuments({ 
    transactionId: { $regex: "^syn_" } 
  });
  const custCount = await customers.countDocuments({ 
    customerId: { $regex: "^syn_" } 
  });

  console.log(`Transactions: ${txnCount}`);
  console.log(`Customers: ${custCount}`);

  const statuses = await transactions.aggregate([
    { $match: { transactionId: { $regex: "^syn_" } } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]).toArray();

  console.log("Status breakdown:", statuses);
}

verifySeed().catch(console.error).finally(() => process.exit(0));
```

Run with: `tsx verify-seed.ts`

### Using MongoDB Compass

1. Open MongoDB Compass
2. Connect to your MongoDB instance
3. Navigate to `ai-revenue-recovery` database
4. Check `transactions` collection → Filter: `{ "transactionId": { "$regex": "^syn_" } }`
5. Check `customers` collection → Filter: `{ "customerId": { "$regex": "^syn_" } }`

## Data Characteristics

### Amount Ranges

| Scenario | Min (₹) | Max (₹) |
|----------|---------|---------|
| Routine | 499 | 4,999 |
| High-Value | 50,000 | 150,000 |

### Payment Methods Distribution
- **card**: ~40%
- **upi**: ~25%
- **netbanking**: ~20%
- **wallet**: ~15%

### Timestamps
- **Start**: 2026-01-15 (Fixed epoch for reproducibility)
- **Spread**: 50 days of transactions
- **Time**: Distributed across business hours (8 AM - 6 PM)

## Deterministic Reproducibility

The generator uses seeded PRNG with different seeds for each scenario:

- Successful Routine: Seed `101`
- Temporary Failures: Seed `202`
- Repeated Failures: Seed `303`
- Abandoned Checkout: Seed `404`
- High-Value: Seed `505`
- Multi-Failure: Seed `606`
- Unrecoverable: Seed `707`

**Result**: Running `npm run seed` multiple times produces identical data (same transaction IDs, amounts, timestamps).

## Resetting/Cleanup

To remove all synthetic data:

```bash
# Via MongoDB CLI
db.transactions.deleteMany({ transactionId: { $regex: "^syn_" } })
db.customers.deleteMany({ customerId: { $regex: "^syn_" } })

# Or simply run the seed script again (it auto-cleans before inserting)
npm run seed
```

## Evaluation and Testing

This synthetic dataset is designed for:

1. **Algorithm Testing**: Recover attempt classification, risk scoring
2. **Reproducible Evaluation**: Same seed produces identical data each run
3. **Scenario Coverage**: Tests across 8 distinct recovery situations
4. **Privacy**: All synthetic data (no real customer information)
5. **Volume**: ~125 transactions provides statistically meaningful samples

## Troubleshooting

### "Missing MONGODB_URI environment variable"
- Ensure `.env.local` exists with `MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery`
- Verify MongoDB is running: `mongosh --version`

### "Failed to connect to MongoDB"
- Check MongoDB is running: `mongosh`
- Verify connection string in `.env.local`
- Check firewall/network access to MongoDB port (27017)

### "Collection already exists" errors
- The seed script auto-drops synthetic records before inserting
- If needed, manually drop collections and re-run

### No data appears after running seed
- Verify script completed without errors (check console output)
- Use `npm run seed` (ensures tsx uses `.env.local`)
- Check MongoDB Compass or CLI to confirm insertion
