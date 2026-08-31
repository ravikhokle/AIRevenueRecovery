# Synthetic Transaction Generator - Implementation Guide

## Overview

The synthetic transaction generator (`lib/seed/generator.ts`) creates a deterministic, reproducible dataset of 100+ realistic transactions across 50 synthetic customers. This guide explains the architecture and how to use it.

## Quick Start

```bash
# Prerequisites
npm install
cp .env.example .env.local
# Edit .env.local with your MongoDB URI

# Run the seed
npm run seed

# Verify the data was inserted
tsx scripts/verify-seed.ts
```

## Architecture

### File Structure

```
lib/seed/
├── constants.ts          # Configuration constants
├── prng.ts              # Deterministic random number generator
└── generator.ts         # Main generator implementation

scripts/
├── seed.ts              # Entry point for npm run seed
└── verify-seed.ts       # Verification utility

types/
├── customer.ts          # Customer data type
└── transaction.ts       # Transaction data type

models/
├── customer.ts          # MongoDB customer operations
└── transaction.ts       # MongoDB transaction operations
```

### Key Components

#### 1. Constants (`lib/seed/constants.ts`)

Defines:
- **Seed Version**: Version tracking for schema evolution
- **Synthetic Epoch**: Fixed reference date (2026-01-15) for reproducible timestamps
- **ID Prefixes**: All synthetic IDs use `syn_` prefix
- **Email Domain**: Synthetic domain is `example.test`
- **Payment Methods**: `card`, `upi`, `netbanking`, `wallet`
- **Failure Reasons**: Three categories
  - Temporary: `insufficient_funds`, `network_timeout`, `issuer_unavailable`, `authentication_timeout`
  - Repeated: `payment_declined`, `authentication_failed`, `processing_error`
  - Unrecoverable: `fraud_suspected`, `card_permanently_blocked`, `invalid_card`, `max_retries_exceeded`, `account_closed`
- **Amount Ranges**:
  - Routine: ₹499 - ₹4,999 (49,900 - 499,900 paise)
  - High-Value: ₹50,000 - ₹150,000 (5,000,000 - 15,000,000 paise)

#### 2. Pseudo-Random Number Generator (`lib/seed/prng.ts`)

Implements a **Linear Congruential Generator (LCG)** for deterministic randomness:

```typescript
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
```

**Why LCG?**
- Deterministic: Same seed always produces same sequence
- Fast: No external dependencies
- Reproducible: Evaluation can be repeated identically

**Benefits:**
- Different seeds for each scenario ensure variety within determinism
- Running seed script twice produces identical results
- Easy to extend: Modify seed values to generate alternative datasets

#### 3. Generator (`lib/seed/generator.ts`)

Implements 7 scenario builders that generate realistic transaction patterns.

### Generator Workflow

```
1. Reset transaction counter (for consistent IDs)
2. Build scenario drafts:
   ├── Successful payments (10 customers, 2-3 transactions each)
   ├── Temporary failures (8 customers, success + failure pattern)
   ├── Repeated failures (5 customers, 4 failed attempts each)
   ├── Abandoned checkout (5 customers, 2 abandoned each)
   ├── High-value mix (8 customers, success + failure)
   ├── Multiple failed (6 customers, 3 failures each)
   └── Unrecoverable (8 customers, with PENDING edge cases)
3. Convert drafts to transactions (add timestamps, generate IDs)
4. Build customer aggregates from transactions
5. Summarize dataset
6. Return complete dataset
```

## Detailed Scenario Descriptions

### Scenario 1: Successful Payments

**Customers**: 10 (`syn_cust_0001` - `syn_cust_0010`)  
**Transactions**: 25 total

**Pattern**:
- Early customers (001-005): 3 successful transactions each
- Later customers (006-010): 2 successful transactions each
- No failures or retries
- All routine amounts (₹499-₹4,999)

**Use Case**: Baseline successful payment behavior for comparison and control group.

**Generated Data**:
```
syn_cust_0001: 3 SUCCESS transactions
syn_cust_0002: 3 SUCCESS transactions
...
syn_cust_0006: 2 SUCCESS transactions
...
```

### Scenario 2: Customer with Previous Success

**Customers**: 8 (`syn_cust_0011` - `syn_cust_0018`)  
**Transactions**: 16 total

**Pattern**:
- 2 prior successful transactions
- 1 failure with temporary reason
- Demonstrates proven payment capability
- Likely recovery candidates

**Failure Reasons** (randomly selected):
- `insufficient_funds` (may be temporary)
- `network_timeout` (infrastructure issue)
- `issuer_unavailable` (bank outage)
- `authentication_timeout` (network glitch)

**Use Case**: Customers worth recovery efforts - they've proven they can pay.

**Generated Data**:
```
syn_cust_0011:
  - SUCCESS (day 1)
  - SUCCESS (day 1)
  - FAILED: insufficient_funds (day 11)
...
```

### Scenario 3: Repeated Failures

**Customers**: 5 (`syn_cust_0019` - `syn_cust_0023`)  
**Transactions**: 20 total

**Pattern**:
- 4 consecutive failed attempts per customer
- Retry counts: 0, 1, 2, 3
- Same-day attempts (different hours)
- Failure reason varies by customer

**Failure Reasons**:
- `payment_declined` (card/account issue)
- `authentication_failed` (password/OTP)
- `processing_error` (system error)

**Use Case**: Identify deterministic failures requiring different strategies (e.g., payment method change, manual intervention).

**Generated Data**:
```
syn_cust_0019:
  - FAILED: payment_declined (retry 0)
  - FAILED: payment_declined (retry 1, 1 hour later)
  - FAILED: payment_declined (retry 2, 2 hours later)
  - FAILED: payment_declined (retry 3, 3 hours later)
...
```

### Scenario 4: Abandoned Checkout

**Customers**: 5 (`syn_cust_0024` - `syn_cust_0028`)  
**Transactions**: 10 total

**Pattern**:
- 2 abandoned transactions per customer
- Status: `ABANDONED` (customer didn't complete payment)
- No failure reason (customer action, not system failure)
- No retry attempts

**Use Case**: Cart/checkout recovery, email follow-ups, recovery incentives.

**Generated Data**:
```
syn_cust_0024:
  - ABANDONED (day 14)
  - ABANDONED (day 14, different hour)
...
```

### Scenario 5: High-Value Transactions

**Customers**: 8 (`syn_cust_0029` - `syn_cust_0036`)  
**Transactions**: 16 total

**Pattern**:
- Amount range: ₹50,000-₹150,000 (5,000,000-15,000,000 paise)
- 1 successful + 1 failed per customer
- Mixed failure reasons (temporary)
- High revenue impact targets for recovery

**Use Case**: Priority recovery - revenue per transaction is 10-30x higher than routine.

**Generated Data**:
```
syn_cust_0029:
  - SUCCESS (₹75,000, day 9)
  - FAILED: network_timeout (₹75,000, day 9)
...
```

### Scenario 6: Multiple Failed Attempts

**Customers**: 6 (`syn_cust_0037` - `syn_cust_0042`)  
**Transactions**: 18 total

**Pattern**:
- 3 failed attempts per customer
- Retry counts: 1, 2, 3
- Spread over multiple hours (not same second)
- Demonstrates retry pattern

**Use Case**: Customers worth contacting with alternative payment options or invoicing.

**Generated Data**:
```
syn_cust_0037:
  - FAILED: authentication_failed (retry 1)
  - FAILED: authentication_failed (retry 2, 2 hours later)
  - FAILED: authentication_failed (retry 3, 4 hours later)
...
```

### Scenario 7: Unrecoverable Cases

**Customers**: 8 (`syn_cust_0043` - `syn_cust_0050`)  
**Transactions**: 12 total

**Pattern**:
- Failure reasons indicate permanent issues
- Retry count: 3 (exhausted retries)
- Some include `PENDING` status (edge case)
- Not worth recovery effort

**Failure Reasons**:
- `fraud_suspected` (customer flagged as fraud)
- `card_permanently_blocked` (bank action)
- `invalid_card` (bad card data)
- `max_retries_exceeded` (gave up)
- `account_closed` (account terminated)

**Use Case**: Define guardrails - these cases should be flagged as unrecoverable, routed to fraud team, or archived.

**Generated Data**:
```
syn_cust_0043:
  - FAILED: fraud_suspected (retry 3, day 23)
syn_cust_0044:
  - FAILED: card_permanently_blocked (retry 3, day 24)
  - PENDING: card_permanently_blocked (retry 3, day 24) [edge case]
...
```

## Data Statistics

### Transaction Breakdown

| Status | Count | Percentage |
|--------|-------|-----------|
| SUCCESS | ~62 | 49.6% |
| FAILED | ~53 | 42.4% |
| ABANDONED | 10 | 8.0% |
| PENDING | 0 | 0% |
| **TOTAL** | **125** | **100%** |

### Amount Distribution

| Category | Count | Percentage | Avg Amount |
|----------|-------|-----------|-----------|
| Routine (₹499-₹4,999) | ~110 | 88% | ₹2,500 |
| High-Value (₹50k-₹150k) | ~15 | 12% | ₹100,000 |

### Payment Methods

Randomly distributed across:
- Card: ~40%
- UPI: ~25%
- Netbanking: ~20%
- Wallet: ~15%

### Timeline

- **Start Date**: 2026-01-15 (Fixed epoch)
- **Duration**: 50 days
- **Time Distribution**: 8 AM - 6 PM (business hours)
- **Granularity**: Hourly separation for visible transaction flow

## Reproducibility & Determinism

### How It Works

1. **Seeded PRNG**: Each scenario uses a different fixed seed
   ```
   Scenario 1: seed = 101
   Scenario 2: seed = 202
   Scenario 3: seed = 303
   ...
   ```

2. **Sequential ID Generation**: Transaction sequence counter never resets
   ```
   First transaction: syn_txn_0001
   Second transaction: syn_txn_0002
   ... always in order
   ```

3. **Fixed Epoch**: All timestamps derived from fixed base date
   ```
   Base: 2026-01-15T00:00:00.000Z
   Day offset * 86,400,000 ms + hour offset * 3,600,000 ms
   ```

### Running the Generator Multiple Times

```bash
# First run
npm run seed

# Second run
npm run seed  # Clears previous synthetic data, inserts identical data
```

Both runs produce:
- Same transaction IDs
- Same amounts
- Same timestamps
- Same customer aggregates
- Same failure reasons

### Evaluation Benefits

- **Reproducibility**: Evaluate on seed date 1, compare with seed date 2
- **Baseline**: Fix algorithm, run on seed, establish baseline metrics
- **Regression Testing**: After code changes, run same seed, verify metrics unchanged
- **Collaborative Testing**: Developers and QA use same seed data

## Extensibility

### Adding a New Scenario

1. Create a builder function in `lib/seed/generator.ts`:
   ```typescript
   function buildMyScenarioDrafts(): TransactionDraft[] {
     const drafts: TransactionDraft[] = [];
     const random = createSeededRandom(808); // Unique seed
     
     for (let customerIndex = 51; customerIndex <= 60; customerIndex += 1) {
       // Generate transactions
     }
     return drafts;
   }
   ```

2. Update `generateSyntheticDataset()` to include it:
   ```typescript
   const draftGroups = [
     // ... existing scenarios
     buildMyScenarioDrafts(),
   ];
   ```

3. Seed counter automatically continues from previous scenarios.

### Modifying Amounts or Patterns

Edit `lib/seed/constants.ts`:
```typescript
// Change routine amount range
export const ROUTINE_AMOUNT_MIN_PAISE = 29_900;  // ₹299
export const ROUTINE_AMOUNT_MAX_PAISE = 999_900; // ₹9,999
```

Next seed run will use new amounts (but reproduce identically per seed value).

## Testing & Validation

### Unit Testing Data

```typescript
// example.test.ts
import { generateSyntheticDataset } from "@/lib/seed/generator";

test("generateSyntheticDataset has required structure", () => {
  const dataset = generateSyntheticDataset();
  
  expect(dataset.seedVersion).toBe(1);
  expect(dataset.transactions.length).toBeGreaterThanOrEqual(100);
  expect(dataset.customers.length).toBeGreaterThanOrEqual(40);
  expect(dataset.summary.totalTransactions).toBe(dataset.transactions.length);
  expect(dataset.summary.totalCustomers).toBe(dataset.customers.length);
});

test("synthetic data is deterministic", () => {
  const run1 = generateSyntheticDataset();
  const run2 = generateSyntheticDataset();
  
  expect(run1.transactions).toEqual(run2.transactions);
  expect(run1.customers).toEqual(run2.customers);
});
```

### Verification Steps

```bash
# Verify generation
npm run seed 2>&1 | grep "Inserted"  # Should show 125 transactions

# Verify database insertion
mongosh --eval "db.transactions.countDocuments()"

# Verify reproducibility
npm run seed
# Wait a few seconds
npm run seed
# Compare outputs - should be identical
```

## Troubleshooting

### Issue: "Seed version: X not matching expected Y"

The schema has evolved. Update code to handle multiple versions:

```typescript
export interface SyntheticDataset {
  seedVersion: number;  // Track for migrations
  // ...
}
```

### Issue: Transactions don't appear after seeding

1. Check seed output for errors
2. Verify MongoDB connection: `mongosh`
3. Check database name matches: `use ai-revenue-recovery`
4. Check that seed auto-cleanup didn't fail

### Issue: Amounts are all the same

This is NOT a bug - it depends on the seeded random sequence. Different scenarios produce different distributions. Run multiple scenarios to see variety.

## Related Files

- [SEED_DATA_GUIDE.md](./SEED_DATA_GUIDE.md) - User guide for running and verifying
- [lib/seed/generator.ts](./lib/seed/generator.ts) - Implementation
- [scripts/seed.ts](./scripts/seed.ts) - CLI entry point
- [scripts/verify-seed.ts](./scripts/verify-seed.ts) - Verification utility
