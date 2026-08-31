# Scenario Selection Guide for Testing

Use this guide to select which synthetic data scenarios are best for your testing scenario.

## Quick Reference Matrix

| What to Test | Best Scenarios | Why |
|---|---|---|
| **Basic Recovery Logic** | Successful Payments + Temporary Failures | Clear signal with minimal confounds |
| **Deterministic Failure Detection** | Repeated Failures + Unrecoverable | Pattern analysis, guardrails |
| **High-Value Recovery Priority** | High-Value Transactions | Revenue impact test |
| **Cart Recovery/Retry Logic** | Abandoned Checkout | Specific use case |
| **False Positive Filtering** | Customer Previous Success | Avoid wrongly flagging good customers |
| **Exhaustion Detection** | Multiple Failed Attempts | When to stop retrying |
| **Full Pipeline** | All scenarios | End-to-end testing |
| **Fraud Detection** | Unrecoverable Cases | Flag anomalies correctly |
| **Customer LTV Prediction** | Successful Payments + Previous Success | Revenue forecasting |
| **Guardrail Validation** | High-Value + Unrecoverable | Boundaries and exclusions |

## Testing Scenarios Explained

### Scenario 1: Successful Payments ✓

**Customers**: 10  
**Transactions**: 25  

**For Testing**:
- ✓ Baseline metrics (how many we recover when starting with 100% success rate)
- ✓ Customer profile aggregation
- ✓ Payment method preferences
- ✓ Reporting accuracy

**Example Test**:
```typescript
// Should NOT be flagged for recovery
const successfulCustomers = dataset.customers
  .filter(c => c.successfulPaymentCount >= 2 && c.failedPaymentCount === 0);
expect(successfulCustomers.length).toBe(10);
expect(successfulCustomers.some(c => c.averageOrderValue > 150000)).toBe(false);
```

### Scenario 2: Customer Previous Success ✓✓

**Customers**: 8  
**Transactions**: 16 (2 successes + 1 failure each)  

**For Testing**:
- ✓ Identify recovery-worthy customers (proven payers)
- ✓ Avoid false positives (don't flag all failures equally)
- ✓ LTV-based recovery prioritization
- ✓ Retry strategy effectiveness

**Example Test**:
```typescript
// High-priority recovery: proven payment history
const recoveryPriority = dataset.customers
  .filter(c => c.successfulPaymentCount >= 2 && c.failedPaymentCount > 0)
  .sort((a, b) => b.totalSpent - a.totalSpent);

expect(recoveryPriority[0].customerId).toBe("syn_cust_0011");
expect(recoveryPriority[0].lastSuccessfulPaymentAt).toBeDefined();
```

### Scenario 3: Repeated Failures 🔄

**Customers**: 5  
**Transactions**: 20 (4 failures per customer, retry counts 0-3)  

**For Testing**:
- ✓ Deterministic failure detection (not temporary)
- ✓ Retry exhaustion (when to stop automatic retries)
- ✓ Pattern recognition (same error repeated)
- ✓ Manual intervention triggers

**Example Test**:
```typescript
// Detect patterns: same error multiple times
const repeatedFailures = dataset.transactions.filter(
  t => t.status === "FAILED" && t.retryCount > 2
);
expect(repeatedFailures.length).toBe(10); // 5 customers × 2 final attempts

// Should trigger manual contact
const customersForManualContact = dataset.customers
  .filter(c => c.failedPaymentCount >= 3 && c.successfulPaymentCount === 0);
expect(customersForManualContact.length).toBe(5);
```

### Scenario 4: Abandoned Checkout 🛒

**Customers**: 5  
**Transactions**: 10 (2 per customer)  

**For Testing**:
- ✓ Cart recovery campaigns
- ✓ Re-engagement email effectiveness
- ✓ Time-to-recovery (how long after abandonment)
- ✓ Abandoned vs. failed distinction

**Example Test**:
```typescript
const abandonedCustomers = dataset.customers
  .filter(c => c.abandonedPaymentCount > 0);
expect(abandonedCustomers.length).toBe(5);
expect(abandonedCustomers.every(c => c.abandonedPaymentCount === 2)).toBe(true);

// Abandoned should have zero failures (different issue)
const abandonmentOnly = dataset.transactions
  .filter(t => t.status === "ABANDONED");
expect(abandonmentOnly.length).toBe(10);
expect(abandonmentOnly.every(t => !t.failureReason)).toBe(true);
```

### Scenario 5: High-Value Transactions 💰

**Customers**: 8  
**Transactions**: 16 (1 success + 1 failure per customer)  
**Amount**: ₹50,000-₹150,000 (50x+ routine amount)  

**For Testing**:
- ✓ Revenue-based prioritization (high-value customers first)
- ✓ Guardrails (special handling for large amounts)
- ✓ ROI calculation (cost to recover vs. amount at risk)
- ✓ Risk scoring adjustments

**Example Test**:
```typescript
const highValueTransactions = dataset.transactions
  .filter(t => t.amount >= 5_000_000); // ₹50,000

expect(highValueTransactions.length).toBeGreaterThanOrEqual(15);

// High-value customers should be highest priority
const highValueCustomers = dataset.customers
  .filter(c => c.averageOrderValue >= 5_000_000)
  .sort((a, b) => b.lastFailedPaymentAt!.getTime() - a.lastFailedPaymentAt!.getTime());

expect(highValueCustomers.length).toBeGreaterThanOrEqual(4);
```

### Scenario 6: Multiple Failed Attempts 🔁

**Customers**: 6  
**Transactions**: 18 (3 per customer, retry counts 1-3)  

**For Testing**:
- ✓ Escalation logic (automatic → manual → abandoned)
- ✓ Contact strategy (call vs. email vs. SMS)
- ✓ Retry backoff (increasing delays between attempts)
- ✓ Resource allocation (when to give up)

**Example Test**:
```typescript
// Identify customers needing manual intervention
const needsManualIntervention = dataset.customers
  .filter(c => c.failedPaymentCount >= 2 && c.successfulPaymentCount === 0);

expect(needsManualIntervention.length).toBe(6);

// Check retry progression
const txns = dataset.transactions
  .filter(t => t.customerId === "syn_cust_0037")
  .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

expect(txns.length).toBe(3);
expect(txns[0].retryCount).toBe(1);
expect(txns[1].retryCount).toBe(2);
expect(txns[2].retryCount).toBe(3);
```

### Scenario 7: Unrecoverable Cases ⛔

**Customers**: 8  
**Transactions**: 12 (1-2 per customer)  
**Failure Reasons**: Fraud, blocked, invalid, max retries, account closed  

**For Testing**:
- ✓ Guardrail detection (don't attempt recovery)
- ✓ Fraud flagging
- ✓ Account status validation
- ✓ Exclusion lists

**Example Test**:
```typescript
const unrecoverableReasons = [
  "fraud_suspected",
  "card_permanently_blocked",
  "invalid_card",
  "max_retries_exceeded",
  "account_closed"
];

const unrecoverable = dataset.transactions
  .filter(t => t.status === "FAILED" && unrecoverableReasons.includes(t.failureReason ?? ""));

expect(unrecoverable.length).toBeGreaterThanOrEqual(8);

// These should be EXCLUDED from recovery
const shouldExclude = dataset.customers
  .filter(c => {
    const lastFailure = dataset.transactions
      .filter(t => t.customerId === c.customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return lastFailure?.failureReason && unrecoverableReasons.includes(lastFailure.failureReason);
  });

expect(shouldExclude.length).toBeGreaterThanOrEqual(4);
```

## Filtering Strategies

### By Recovery Priority

```typescript
import { generateSyntheticDataset } from "@/lib/seed/generator";

const dataset = generateSyntheticDataset();

// High priority: proven payers with recent failure
const highPriority = dataset.customers
  .filter(c => 
    c.successfulPaymentCount >= 1 &&  // Has paid before
    c.failedPaymentCount >= 1 &&      // Has failed recently
    c.totalSpent > 100000              // Worthwhile customer
  )
  .sort((a, b) => b.totalSpent - a.totalSpent);

// Medium priority: new customers with potential
const mediumPriority = dataset.customers
  .filter(c => 
    c.totalTransactions === 1 &&
    c.failedPaymentCount === 1
  );

// Low priority: exhausted attempts or abandoned
const lowPriority = dataset.customers
  .filter(c => 
    (c.failedPaymentCount >= 3 && c.successfulPaymentCount === 0) ||
    c.abandonedPaymentCount > 0
  );

// Do not recover: unrecoverable flags
const doNotRecover = dataset.customers
  .filter(c => {
    const lastTxn = dataset.transactions
      .filter(t => t.customerId === c.customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    
    return lastTxn?.failureReason && 
      ["fraud_suspected", "card_permanently_blocked", "invalid_card"].includes(lastTxn.failureReason);
  });
```

### By Use Case

```typescript
// Cart recovery
const cartRecovery = dataset.customers
  .filter(c => c.abandonedPaymentCount > 0);

// Retry campaign
const retryTargets = dataset.customers
  .filter(c => 
    c.failedPaymentCount >= 1 &&
    c.failedPaymentCount <= 2 &&
    c.successfulPaymentCount > 0
  );

// Fraud investigation
const fraudInvestigation = dataset.transactions
  .filter(t => t.failureReason === "fraud_suspected");

// Payment method mismatch
const pmMethodIssues = dataset.customers
  .filter(c => 
    c.failedPaymentCount > 0 &&
    c.preferredPaymentMethod
  );
```

## Evaluation Workflows

### Workflow 1: Baseline Recovery Rate

```bash
npm run seed
```

**Test**: Measure what % of failed transactions are recovered with your algorithm  
**Scenarios**: All (100+ transactions)  
**Expected Result**: Should recover ~60-70% of recoverable cases  

### Workflow 2: False Positive Filtering

```bash
# Keep only successful + temporary failure scenarios
```

**Test**: Algorithm should NOT flag successful or temporarily-failed customers  
**Scenarios**: Scenario 1 + 2  
**Expected Result**: 0% false positives on proven payers  

### Workflow 3: Deterministic Pattern Detection

```bash
# Use repeated failures + multiple attempts
```

**Test**: Algorithm detects deterministic failures (not worth retrying)  
**Scenarios**: Scenario 3 + 6  
**Expected Result**: Correctly identifies ~90% of non-recoverable patterns  

### Workflow 4: High-Value Prioritization

```bash
# Filter to high-value customers
```

**Test**: Recovery efforts prioritize high-revenue impact  
**Scenarios**: Scenario 5  
**Expected Result**: Top 3 customers by amount are targeted first  

### Workflow 5: Guardrail Effectiveness

```bash
# Check fraud/blocked cases are excluded
```

**Test**: Algorithm respects hard stops (fraud, blocked, invalid)  
**Scenarios**: Scenario 7  
**Expected Result**: 100% exclusion rate on unrecoverable cases  

## Running Focused Tests

### Test Only Scenario 2 (Previous Success)

Create a filtered dataset:

```typescript
const dataset = generateSyntheticDataset();
const customers = dataset.customers.filter(c => c.customerId <= "syn_cust_0018");
const transactions = dataset.transactions.filter(t => 
  customers.map(c => c.customerId).includes(t.customerId)
);

// Run your recovery algorithm on this filtered dataset
const results = runRecoveryAlgorithm(customers, transactions);
```

### Compare Scenario 1 vs. Scenario 2

```typescript
const dataset = generateSyntheticDataset();

const scenario1 = dataset.customers.filter(c => c.customerId <= "syn_cust_0010");
const scenario2 = dataset.customers.filter(c => 
  c.customerId >= "syn_cust_0011" && c.customerId <= "syn_cust_0018"
);

const results1 = evaluateRecovery(scenario1);
const results2 = evaluateRecovery(scenario2);

console.log("Scenario 1 Recovery Rate:", results1.recoveryRate);
console.log("Scenario 2 Recovery Rate:", results2.recoveryRate);
// Scenario 2 should be higher (more recoverable cases)
```

## Metrics to Track

For each scenario or filtered dataset:

- **Recovery Rate** = Recovered / Recoverable
- **False Positive Rate** = Flagged for recovery / Should not recover
- **Average Time to Recovery** = Time from first failure to recovery contact
- **ROI** = Revenue recovered / Cost of recovery efforts
- **Precision** = Correctly identified recoverable / All identified as recoverable
- **Recall** = Correctly identified recoverable / All actually recoverable

## Next Steps

1. Pick your primary testing scenario from the matrix above
2. Generate the seed data: `npm run seed`
3. Filter to the scenarios you need
4. Run your algorithm
5. Track metrics from "Metrics to Track" section
6. Repeat with different seed data (modify `lib/seed/constants.ts` seed values)
