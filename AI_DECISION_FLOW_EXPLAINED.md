# AI Decision Flow - Complete Explanation

## 🔄 How the AI Decision Flow Works

### High-Level Flow

```
User/System
    ↓
Requests analysis of failed transaction
    ↓
API Endpoint: POST /api/analysis/analyze-recovery
    ↓
Input Validation (Zod)
    ↓ (Invalid)
Return 400 error
    ↓ (Valid)
Fetch from MongoDB:
    - Transaction details
    - Customer history  
    - Retry history
    ↓
Build Analysis Prompt
    ↓
Call OpenAI GPT-4o (with system prompt)
    ↓
Receive JSON response
    ↓
Parse JSON (handle markdown code blocks)
    ↓
Validate against schema (Zod)
    ↓ (Invalid)
Throw ValidationError
    ↓ (Valid)
Return structured decision
    ↓
Log result (safe, no secrets)
    ↓
User/System receives decision
```

---

## 📊 Detailed Step-by-Step

### Step 1: Request Received

**User sends:**
```bash
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "syn_txn_0002"}'
```

**Code location:** `app/api/analysis/analyze-recovery/route.ts`

### Step 2: Input Validation

**Code:**
```typescript
const validation = AnalyzeTransactionRequestSchema.safeParse(body);
if (!validation.success) {
  return NextResponse.json(
    { error: "Validation failed", details: ... },
    { status: 400 }
  );
}
```

**Possible outcomes:**
- ✅ Valid → Continue
- ❌ Invalid → Return 400, stop

### Step 3: Fetch Data from MongoDB

**Parallel fetches:**
```typescript
const transactionsCollection = await getTransactionsCollection();
const transaction = await transactionsCollection.findOne({ transactionId });

const customersCollection = await getCustomersCollection();
const customer = await customersCollection.findOne({ customerId: transaction.customerId });

const retries = await transactionsCollection.find({ transactionId }).toArray();
```

**Possible outcomes:**
- ✅ All found → Continue
- ❌ Transaction not found → Return 404, stop
- ❌ Customer not found → Return 404, stop

**Data fetched:**
- `transaction` - Amount, status, failure reason, retry count, timestamp
- `customer` - Success rate, total spent, payment history
- `retries` - All attempts for this transaction, failure patterns

### Step 4: Calculate Retry History

**Code:**
```typescript
const failureReasons = transactionRetries
  .filter(t => t.status === "FAILED")
  .map(t => t.failureReason || "unknown");

let retryPattern: "CONSISTENT" | "INTERMITTENT" | "SINGLE" = "SINGLE";
if (transactionRetries.length > 1) {
  const failureReasonSet = new Set(failureReasons);
  retryPattern = failureReasonSet.size === 1 ? "CONSISTENT" : "INTERMITTENT";
}
```

**Example 1: First attempt**
```
Retries: [Transaction(status=FAILED, reason=network_timeout)]
Result: retryPattern = "SINGLE", totalRetries = 0
```

**Example 2: Consistent failure**
```
Retries: [
  Transaction(status=FAILED, reason=payment_declined),
  Transaction(status=FAILED, reason=payment_declined),
  Transaction(status=FAILED, reason=payment_declined)
]
Result: retryPattern = "CONSISTENT", totalRetries = 2
```

**Example 3: Intermittent issues**
```
Retries: [
  Transaction(status=FAILED, reason=network_timeout),
  Transaction(status=FAILED, reason=insufficient_funds),
  Transaction(status=FAILED, reason=processing_error)
]
Result: retryPattern = "INTERMITTENT", totalRetries = 2
```

### Step 5: Build Analysis Input

**Code:**
```typescript
const analysisInput = {
  transaction: {
    transactionId,
    amount,
    currency,
    status,
    paymentMethod,
    failureReason,
    retryCount,
    createdAt
  },
  customerHistory: {
    totalTransactions,
    successfulPaymentCount,
    failedPaymentCount,
    abandonedPaymentCount,
    totalSpent,
    averageOrderValue,
    lastSuccessfulPaymentAt,
    lastFailedPaymentAt,
    preferredPaymentMethod
  },
  retryHistory: {
    totalRetries,
    failureReasons,
    lastRetryAt,
    retryPattern
  }
};
```

**Example values:**
```json
{
  "transaction": {
    "transactionId": "syn_txn_0002",
    "amount": 299500,
    "currency": "INR",
    "status": "FAILED",
    "paymentMethod": "card",
    "failureReason": "insufficient_funds",
    "retryCount": 0,
    "createdAt": "2026-01-15T09:00:00Z"
  },
  "customerHistory": {
    "totalTransactions": 3,
    "successfulPaymentCount": 2,
    "failedPaymentCount": 1,
    "abandonedPaymentCount": 0,
    "totalSpent": 687000,
    "averageOrderValue": 343500,
    "lastSuccessfulPaymentAt": "2026-01-15T08:00:00Z",
    "lastFailedPaymentAt": "2026-01-15T09:00:00Z",
    "preferredPaymentMethod": "card"
  },
  "retryHistory": {
    "totalRetries": 0,
    "failureReasons": ["insufficient_funds"],
    "lastRetryAt": "2026-01-15T09:00:00Z",
    "retryPattern": "SINGLE"
  }
}
```

### Step 6: Format Prompt for LLM

**Code:**
```typescript
function formatAnalysisPrompt(input: RecoveryAnalysisInput): string {
  return `Analyze this failed transaction for recovery potential:

## Transaction Details
- ID: ${transaction.transactionId}
- Amount: ₹${(transaction.amount / 100).toFixed(2)}
- Payment Method: ${transaction.paymentMethod}
- Failure Reason: ${transaction.failureReason}
- Retry Count: ${transaction.retryCount}
...
[Full customer history, retry pattern, etc.]
...
Based on this data, provide your recovery analysis in JSON format.`;
}
```

**Human-readable prompt example:**
```
## Transaction Details
- ID: syn_txn_0002
- Amount: ₹2,995.00 (INR)
- Payment Method: card
- Failure Reason: insufficient_funds
- Retry Count: 0
- Status: FAILED
- Created: 2026-01-15T09:00:00Z

## Customer Payment History
- Total Transactions: 3
- Successful Payments: 2
- Failed Payments: 1
- Abandoned Payments: 0
- Total Spent: ₹6,870.00
- Average Order Value: ₹3,435.00
- Success Rate: 66.7%
- Last Successful Payment: 2026-01-15T08:00:00Z
- Last Failed Payment: 2026-01-15T09:00:00Z
- Preferred Payment Method: card

## Retry History
- Total Retries: 0
- Failure Reasons: insufficient_funds
- Retry Pattern: SINGLE
- Last Retry: 2026-01-15T09:00:00Z

Based on this data, provide your recovery analysis in JSON format.
```

### Step 7: Call OpenAI API

**Code:**
```typescript
const client = getOpenAIClient(); // Reads OPENAI_API_KEY from env

const response = await client.chat.completions.create({
  model: "gpt-4o",
  max_tokens: 1024,
  temperature: 0.3, // Low temp for deterministic analysis
  messages: [
    {
      role: "system",
      content: getRecoveryAnalysisSystemPrompt() // Clear constraints
    },
    {
      role: "user",
      content: userPrompt // Analysis context
    }
  ]
});
```

**What system prompt tells LLM:**
- Your role: Analysis ONLY
- Cannot execute payments
- Cannot modify accounts
- Must output strict JSON
- Decision factors to consider
- Confidence scoring rules
- Evidence requirements
- 3 examples of each classification

### Step 8: Parse Response

**Code:**
```typescript
const responseText = response.choices[0].message.content;

// Handle markdown code blocks
let jsonText = responseText;
const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
if (jsonMatch) {
  jsonText = jsonMatch[1];
}

let analysisData = JSON.parse(jsonText);
```

**Example LLM response:**
```
The analysis shows this transaction is recoverable because:
- Customer had 2 successful payments previously
- Insufficient funds is temporary
- This is the first retry attempt
- Amount is within customer average

```json
{
  "classification": "RECOVERABLE",
  "reason": "Customer has 2 successful payments. Insufficient funds is typically temporary.",
  "recommendedAction": "RETRY",
  "confidence": 0.87,
  "evidence": [
    "2 successful previous payments",
    "Failure: insufficient_funds (temporary)",
    "First retry attempt",
    "Amount within customer average"
  ]
}
```
```

**After parsing:**
```json
{
  "classification": "RECOVERABLE",
  "reason": "Customer has 2 successful payments. Insufficient funds is typically temporary.",
  "recommendedAction": "RETRY",
  "confidence": 0.87,
  "evidence": [
    "2 successful previous payments",
    "Failure: insufficient_funds (temporary)",
    "First retry attempt",
    "Amount within customer average"
  ]
}
```

### Step 9: Validate Schema

**Code:**
```typescript
const responseValidation = RecoveryAnalysisResponseSchema.safeParse(analysisData);
if (!responseValidation.success) {
  const errors = responseValidation.error.flatten().fieldErrors;
  throw new ValidationError(
    "LLM response does not match expected schema",
    errors
  );
}

return responseValidation.data;
```

**Zod validation checks:**
- ✅ `classification` is one of: RECOVERABLE, NOT_RECOVERABLE, HUMAN_REVIEW
- ✅ `reason` is string between 10-500 chars
- ✅ `recommendedAction` is one of: RETRY, REMINDER, ALTERNATE_METHOD, HUMAN_REVIEW, NO_ACTION
- ✅ `confidence` is number between 0.0 and 1.0
- ✅ `evidence` is array with 1-5 strings

**If any fail:** Throw ValidationError (400 to user)
**If all pass:** Return validated data

### Step 10: Return Response

**Code:**
```typescript
return NextResponse.json({
  data: analysis,
  metadata: {
    transactionId,
    analyzedAt: new Date().toISOString()
  }
});
```

**Response sent to user:**
```json
{
  "data": {
    "classification": "RECOVERABLE",
    "reason": "Customer has 2 successful payments. Insufficient funds is typically temporary.",
    "recommendedAction": "RETRY",
    "confidence": 0.87,
    "evidence": [
      "2 successful previous payments",
      "Failure: insufficient_funds (temporary)",
      "First retry attempt",
      "Amount within customer average"
    ]
  },
  "metadata": {
    "transactionId": "syn_txn_0002",
    "analyzedAt": "2026-08-31T10:30:45.123Z"
  }
}
```

### Step 11: Log Result

**Code:**
```typescript
logAnalysisResult(transactionId, analysis);
```

**Logged (safe, no secrets):**
```
Recovery analysis completed {
  transactionId: "syn_txn_0002",
  classification: "RECOVERABLE",
  recommendedAction: "RETRY",
  confidence: 0.87
}
```

---

## 🚨 Error Handling Scenarios

### Scenario A: API Key Not Set

```
getOpenAIClient()
    ↓
process.env.OPENAI_API_KEY is missing
    ↓
throw LLMApiError("OpenAI API key not configured")
    ↓
Caught in try/catch
    ↓
logAnalysisError() - logs safely, no key exposed
    ↓
Return 503 to user: "OpenAI API authentication failed"
```

### Scenario B: Invalid JSON from LLM

```
LLM returns: "The transaction { invalid json } should be retried"
    ↓
JSON.parse() throws SyntaxError
    ↓
throw MalformedResponseError("Failed to parse JSON")
    ↓
Caught in try/catch
    ↓
logAnalysisError()
    ↓
Return 500 to user: "Invalid LLM response"
```

### Scenario C: Valid JSON but Wrong Schema

```
LLM returns: {"classification": "MAYBE", "reason": "..."}
    ↓
JSON.parse() succeeds
    ↓
RecoveryAnalysisResponseSchema.safeParse() fails
    ↓
throw ValidationError("LLM response doesn't match schema")
    ↓
Caught in try/catch
    ↓
logAnalysisError()
    ↓
Return 400 to user with field errors
```

### Scenario D: Rate Limited

```
client.chat.completions.create() throws error
    ↓
Error message includes "429"
    ↓
throw LLMApiError("Rate limit exceeded", { status: 429 })
    ↓
Caught in try/catch
    ↓
logAnalysisError()
    ↓
Return 429 to user: "Please retry later"
```

### Scenario E: Transaction Not Found

```
collection.findOne() returns null
    ↓
if (!transaction)
    ↓
Return 404: "Transaction not found"
```

---

## 🧠 LLM Decision Process

When LLM receives prompt, it analyzes:

### 1. Failure Reason Classification
```
Is it temporary?
  ├─ Yes: "network_timeout", "insufficient_funds", ...
  │   → Likely RECOVERABLE
  │
└─ No: "fraud_suspected", "card_permanently_blocked", ...
      → Likely NOT_RECOVERABLE
```

### 2. Customer History Evaluation
```
Success rate?
  ├─ High (80%+): Strong recovery signal
  ├─ Medium (40-80%): Mixed signals
  └─ Low (<40%): Weak recovery signal

Recent success?
  ├─ Yes: Very positive signal
  └─ No: Negative signal
```

### 3. Retry Pattern Analysis
```
Pattern type?
  ├─ SINGLE: First attempt, good candidate
  ├─ INTERMITTENT: Mixed failures, ambiguous
  └─ CONSISTENT: Same error repeating, likely permanent
```

### 4. Transaction Value Assessment
```
Amount vs customer average?
  ├─ Within average: Routine recovery
  ├─ 2-5x average: Elevated, needs consideration
  └─ >5x average: High value, HUMAN_REVIEW recommended
```

### 5. Confidence Assignment
```
Decision clarity?
  ├─ All factors align: 0.92+
  ├─ Most factors align: 0.75-0.92
  ├─ Mixed signals: 0.60-0.75
  └─ Ambiguous: <0.60 → HUMAN_REVIEW
```

### 6. Evidence Collection
```
Find 1-5 specific facts supporting the decision:
- Customer has X successful payments
- Failure reason is Y (temporary/permanent)
- This is retry attempt Z
- Amount is ₹X (within/above average)
- Pattern is Y (consistent/intermittent)
```

---

## 📈 Example Analysis: Complete Walkthrough

### Input Transaction
```
Transaction: syn_txn_0002
Amount: ₹2,995.00
Status: FAILED
Failure Reason: insufficient_funds
Retry Count: 0
Payment Method: card
Created: 2026-01-15T09:00:00Z
```

### Customer Context
```
Total Payments: 3
Successful: 2 (66.7%)
Failed: 1 (33.3%)
Total Spent: ₹6,870.00
Average Order: ₹3,435.00
Last Success: 2026-01-15T08:00:00Z (1 hour ago)
Last Failure: This transaction
```

### Retry History
```
Total Retries: 0 (this is first attempt)
Pattern: SINGLE
Failure Reasons: [insufficient_funds]
```

### LLM Analysis

**Factor 1: Failure Reason**
```
insufficient_funds = TEMPORARY
→ Positive for recovery
```

**Factor 2: Customer History**
```
66.7% success rate = MODERATE
Recent success (1h ago) = POSITIVE
```

**Factor 3: Retry Count**
```
0 retries = GOOD CANDIDATE
```

**Factor 4: Transaction Value**
```
₹2,995 vs average ₹3,435 = WITHIN AVERAGE
```

**Factor 5: Pattern**
```
SINGLE = FIRST ATTEMPT
```

### Decision Process
```
All factors point to recovery:
  ✅ Temporary failure reason
  ✅ Proven customer
  ✅ First attempt
  ✅ Reasonable amount
  ✅ No pattern issues

Confidence: 0.87 (high, but not highest due to moderate success rate)
Classification: RECOVERABLE
Action: RETRY
```

### Final Response
```json
{
  "classification": "RECOVERABLE",
  "reason": "Customer has proven payment history with 2 successful transactions. Insufficient funds is typically a temporary issue that resolves when customer recharges. First retry attempt is warranted.",
  "recommendedAction": "RETRY",
  "confidence": 0.87,
  "evidence": [
    "Customer has 2 successful previous payments (66.7% success rate)",
    "Failure reason 'insufficient_funds' is typically temporary",
    "This is the first retry attempt (0 previous retries)",
    "Transaction amount ₹2,995 is within customer average order value ₹3,435",
    "Last successful payment was recent (1 hour ago)"
  ]
}
```

---

## 🔒 Safety Guarantees

✅ **LLM Cannot Execute Payments**
- System prompt forbids it
- No payment API credentials in prompt
- LLM has no execution capability

✅ **Output Always Validated**
- Schema validation before use
- Invalid responses rejected
- Type-safe with Zod

✅ **Secrets Never Exposed**
- API key only accessed at initialization
- Never logged
- Never included in responses
- Error messages sanitized

✅ **Separation of Concerns**
- AI: Analysis only
- Another service: Executes decisions
- No direct AI→Payment flow

✅ **Human Reviewable**
- Confidence scores show uncertainty
- Evidence provided for transparency
- HUMAN_REVIEW classification for ambiguous cases

---

## 🎯 Quick Test

```bash
# 1. Seed synthetic data
npm run seed

# 2. Start dev server
npm run dev

# 3. Analyze a synthetic transaction
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "syn_txn_0002"}'

# 4. See the classification, reason, action, and confidence
# (Response shows complete decision with evidence)
```

That's the complete flow from request to structured decision!
