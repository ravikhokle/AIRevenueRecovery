# Synthetic Transaction Data Generator

Complete guide to generating, running, and testing with synthetic transaction data for the AI Revenue Recovery Agent.

## 🎯 Quick Start (2 minutes)

```bash
# 1. Set up environment
cp .env.example .env.local
# Edit .env.local - ensure MONGODB_URI points to your MongoDB instance

# 2. Install dependencies (if not already done)
npm install

# 3. Run the seed script
npm run seed

# 4. Verify the data was inserted
tsx scripts/verify-seed.ts
```

**Output** should show:
- 125 synthetic transactions inserted
- 50 synthetic customers created
- Status breakdown: ~62 SUCCESS, ~53 FAILED, 10 ABANDONED, 0 PENDING

## 📊 What Gets Generated

| Item | Count | Details |
|------|-------|---------|
| Total Transactions | 125 | Deterministic, reproducible |
| Total Customers | 50 | Aggregated from transactions |
| Payment Methods | 4 | card, upi, netbanking, wallet |
| Scenarios | 8 | Successful, failures, abandonment, fraud |
| Time Range | 50 days | Fixed epoch: 2026-01-15 |
| Amount Range | ₹499-₹150,000 | Routine + high-value |

### 8 Realistic Scenarios

1. **Successful Payments** (25 txns) - Baseline successful customers
2. **Previous Success + Failure** (16 txns) - Proven payers worth recovering
3. **Repeated Failures** (20 txns) - Deterministic issues needing analysis
4. **Abandoned Checkout** (10 txns) - Cart recovery opportunities
5. **High-Value Transactions** (16 txns) - Revenue-priority targets
6. **Multiple Failed Attempts** (18 txns) - Escalation needed
7. **Unrecoverable Cases** (12 txns) - Fraud, blocked, invalid
8. **Mix Transactions** - Real-world distribution

## 📁 File Structure

```
├── SEED_DATA_GUIDE.md              ← Start here for operations
├── SYNTHETIC_GENERATOR_ARCHITECTURE.md ← Deep dive into design
├── SCENARIO_SELECTION_GUIDE.md     ← Which data for which tests
│
├── lib/seed/
│   ├── constants.ts                ← Configuration (amounts, reasons, etc.)
│   ├── prng.ts                     ← Deterministic random generator
│   └── generator.ts                ← Main generator (7 scenarios)
│
├── scripts/
│   ├── seed.ts                     ← Entry point: npm run seed
│   └── verify-seed.ts              ← Verification: tsx scripts/verify-seed.ts
│
└── types/
    ├── customer.ts                 ← Customer data type
    └── transaction.ts              ← Transaction data type
```

## 🚀 Core Commands

### Generate & Insert Data

```bash
npm run seed
```

**What it does**:
1. Connects to MongoDB
2. Drops all previous synthetic records (matching `syn_*` pattern)
3. Creates required database indexes
4. Generates 125 transactions, 50 customers
5. Inserts both into MongoDB
6. Prints summary statistics

**Expected output**:
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
Sample IDs: transaction syn_txn_0001, customer syn_cust_0001
```

### Verify Data Was Inserted

```bash
# Option 1: Quick stats via script
tsx scripts/verify-seed.ts

# Option 2: MongoDB CLI
mongosh "mongodb://localhost:27017/ai-revenue-recovery"
> db.transactions.countDocuments({ transactionId: { $regex: "^syn_" } })
125  # Expected
> db.customers.countDocuments({ customerId: { $regex: "^syn_" } })
50   # Expected
```

### Clean Up Synthetic Data

```bash
npm run seed  # Auto-cleans before inserting
# Or manually:
mongosh
> use ai-revenue-recovery
> db.transactions.deleteMany({ transactionId: { $regex: "^syn_" } })
> db.customers.deleteMany({ customerId: { $regex: "^syn_" } })
```

## 🔑 Key Features

### ✓ Deterministic & Reproducible

Same seed produces identical results:
```bash
npm run seed  # Run 1: Creates identical data
# ... do stuff ...
npm run seed  # Run 2: Deletes and re-creates identical data
```

**Benefits**:
- Evaluate algorithm, modify code, re-run - compare exact metrics
- Collaborative testing - everyone uses same baseline
- Regression testing - verify changes don't break existing functionality

### ✓ Clearly Synthetic

All data clearly marked as synthetic:
- IDs: `syn_txn_0001`, `syn_cust_0001`, `syn_ord_0001`
- Emails: `synthetic.user0001@example.test`
- Phone: `+919999910001` (fake pattern)
- No real customer information

### ✓ Realistic Scenarios

Coverage across real recovery situations:
- ✓ Successful customers (baseline comparison)
- ✓ Proven payers with temporary failures (worth recovery)
- ✓ Repeated failures (deterministic issues)
- ✓ Abandoned carts (re-engagement)
- ✓ High-value orders (priority targets)
- ✓ Multiple retries (escalation needed)
- ✓ Fraud/blocked/invalid (guardrails)

### ✓ Customizable

Modify ranges, add scenarios, adjust distributions:
- Edit `lib/seed/constants.ts` for amounts, reasons, payment methods
- Add new scenario builder in `lib/seed/generator.ts`
- Change seed values for different random distributions

## 📋 Data Schema

### Transaction Record

```json
{
  "transactionId": "syn_txn_0001",
  "customerId": "syn_cust_0001",
  "orderId": "syn_ord_0001",
  "amount": 299500,
  "currency": "INR",
  "status": "SUCCESS",
  "paymentMethod": "card",
  "failureReason": null,
  "retryCount": 0,
  "createdAt": "2026-01-15T09:00:00.000Z",
  "updatedAt": "2026-01-15T09:00:00.000Z"
}
```

### Customer Record

```json
{
  "customerId": "syn_cust_0001",
  "email": "synthetic.user0001@example.test",
  "phone": "+919999910001",
  "name": "Synthetic User 0001",
  "totalTransactions": 3,
  "successfulPaymentCount": 3,
  "failedPaymentCount": 0,
  "abandonedPaymentCount": 0,
  "totalSpent": 987500,
  "averageOrderValue": 329166,
  "lastPaymentAt": "2026-01-15T11:00:00.000Z",
  "lastSuccessfulPaymentAt": "2026-01-15T11:00:00.000Z",
  "lastFailedPaymentAt": null,
  "preferredPaymentMethod": "card",
  "createdAt": "2026-01-15T09:00:00.000Z",
  "updatedAt": "2026-01-15T11:00:00.000Z"
}
```

## 🧪 Testing & Evaluation

### Using the Data

```typescript
import { generateSyntheticDataset } from "@/lib/seed/generator";

// Generate in-memory (doesn't insert to DB)
const dataset = generateSyntheticDataset();

// Access transactions and customers
console.log(dataset.transactions.length); // 125
console.log(dataset.customers.length);   // 50
console.log(dataset.summary);            // Statistics

// Filter by scenario (customers 1-10 are "successful")
const successfulCustomers = dataset.customers
  .filter(c => parseInt(c.customerId.split('_')[2]) <= 10);

// Run your algorithm
const recovered = myRecoveryAlgorithm(dataset.customers, dataset.transactions);
```

### Test Selection

Choose test data based on what you're testing:

| What to Test | Use Scenarios | Why |
|---|---|---|
| Basic recovery | 1 + 2 | Clear signal, no confounds |
| Pattern detection | 3 + 6 | Repeated failures, escalation |
| Fraud detection | 7 | Permanent blocks, fraud flags |
| High-value priority | 5 | Revenue impact testing |
| Full pipeline | All | End-to-end integration |

See [SCENARIO_SELECTION_GUIDE.md](./SCENARIO_SELECTION_GUIDE.md) for detailed scenarios and filtering strategies.

## 🐛 Troubleshooting

### Problem: "Missing MONGODB_URI environment variable"

**Solution**: 
1. Check `.env.local` exists (copy from `.env.example`)
2. Verify `MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery` is set
3. Confirm MongoDB is running: `mongosh --eval "db.version()"`

### Problem: "Failed to connect to MongoDB"

**Solution**:
1. Ensure MongoDB is running: `mongosh`
2. Verify connection string in `.env.local`
3. Check port 27017 is accessible (firewall, network)
4. Try connecting manually: `mongosh "mongodb://localhost:27017/ai-revenue-recovery"`

### Problem: Script runs but data doesn't appear

**Solution**:
1. Check script completed without errors (look for "Synthetic seed completed")
2. Verify script used correct `.env.local` (use `npm run seed`, not `tsx scripts/seed.ts`)
3. Check MongoDB Compass or `mongosh` to confirm insertion
4. May be inserting to different database - verify `MONGODB_DB_NAME` not overriding

### Problem: "Collection already exists" error

**Solution**: 
1. This is expected - seed script auto-drops synthetic records
2. If you see this during manual drops, it's OK
3. Just re-run `npm run seed` to get fresh data

### Problem: Amounts all the same / Different than expected

This is NOT a bug - it depends on seeded random sequences per scenario. Different seeds generate different distributions. This is intentional and reproducible.

## 📚 Documentation

- **[SEED_DATA_GUIDE.md](./SEED_DATA_GUIDE.md)** - Operations guide (running, verifying, cleanup)
- **[SYNTHETIC_GENERATOR_ARCHITECTURE.md](./SYNTHETIC_GENERATOR_ARCHITECTURE.md)** - Deep technical dive (design, extensibility, testing)
- **[SCENARIO_SELECTION_GUIDE.md](./SCENARIO_SELECTION_GUIDE.md)** - Which scenarios to use for different tests

## 🔍 Design Decisions

### Why Seeded PRNG?

- **Reproducible**: Same data every run, enabling precise comparisons
- **Deterministic**: No external randomness, predictable for testing
- **Fast**: No external calls or dependencies
- **Lightweight**: Fits in a single utility file

### Why 125 Transactions?

- Exceeds 100 requirement for statistical relevance
- 50 customers provides variety (2.5 txns per customer on average)
- Covers 8 distinct scenarios with room for analysis
- Stays manageable for manual inspection

### Why Fixed Epoch?

- Same timestamps every run (2026-01-15 base)
- Reproducible evaluation across time zones
- Easy to calculate expected values
- Makes it obvious data is synthetic

### Why ₹ Amounts?

- INR is target market (Indian payment recovery)
- Paise (₹ × 100) as smallest unit matches real systems
- ₹499-₹4,999 for routine, ₹50k-₹150k for high-value

## 🚀 Next Steps

1. **Get started**: `npm run seed && tsx scripts/verify-seed.ts`
2. **Learn scenarios**: Read [SCENARIO_SELECTION_GUIDE.md](./SCENARIO_SELECTION_GUIDE.md)
3. **Integrate**: Use `generateSyntheticDataset()` in your tests
4. **Evaluate**: Track metrics on your recovery algorithm
5. **Extend**: Add custom scenarios in `lib/seed/generator.ts`

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify `.env.local` is correctly configured
3. Review the relevant detailed guide (see Documentation section)
4. Check MongoDB connection with `mongosh`
