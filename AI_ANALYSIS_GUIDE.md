# AI Revenue Recovery Analysis Service

Complete documentation for the AI-powered transaction recovery analysis system.

## 🎯 Overview

The AI Revenue Recovery Analysis Service uses an LLM to analyze failed transactions and recommend recovery actions. The service:

- Analyzes transaction details, customer history, and retry patterns
- Returns structured decisions (RECOVERABLE, NOT_RECOVERABLE, HUMAN_REVIEW)
- Validates all LLM output before using it
- Prevents the LLM from making payment decisions
- Keeps analysis separate from action execution

## 🔄 Decision Flow

```
User Request
    ↓
[API Endpoint: POST /api/analysis/analyze-recovery]
    ↓
Validate Input
    ↓
Fetch Transaction from MongoDB
    ↓
Fetch Customer History from MongoDB
    ↓
Calculate Retry History
    ↓
Build Analysis Input with all Context
    ↓
[Format Human-Readable Prompt]
    ↓
[Call LLM with System Prompt + User Prompt]
    ↓
LLM Returns JSON Analysis
    ↓
[Parse JSON Response]
    ↓
[Validate Against Strict Schema]
    ↓
Return Validated Result to User
    ↓
Log Result (Safe, No Secrets Exposed)
```

## 🏗 Architecture

### 1. **Schemas** (`lib/ai/schemas.ts`)
Zod schemas for strict validation:
- `RecoveryAnalysisResponse` - LLM output structure
- `RecoveryAnalysisInput` - Analysis input structure  
- `TransactionDetails` - Transaction data
- `CustomerHistory` - Customer payment history
- `RetryHistory` - Retry patterns and timing

**Why Zod?** Validates data at runtime BEFORE using it. Never trust LLM output.

### 2. **Error Handling** (`lib/ai/errors.ts`)
Custom error types with safe logging:
- `AIAnalysisError` - Base error class
- `LLMApiError` - OpenAI API failures
- `ValidationError` - Schema validation failures
- `MalformedResponseError` - Invalid JSON from LLM
- `sanitizeErrorForLogging()` - Strips secrets from error logs

**Key principle:** Errors are logged safely without exposing API keys or sensitive data.

### 3. **System Prompt** (`lib/ai/system-prompt.ts`)
Clear instructions defining:
- LLM's role: ANALYSIS ONLY (no payment execution)
- Constraints: Cannot charge customers, cannot modify accounts
- Output format: Strict JSON schema
- Decision factors: Failure reason, history, amount, retries
- Confidence scoring: 0.9+ high, <0.5 human review
- Evidence requirements: 1-5 specific evidence points
- Examples: 3 realistic scenarios showing expected output

**Key constraint:** System prompt explicitly forbids payment actions.

### 4. **Analysis Service** (`lib/ai/analysis.ts`)
Main service orchestrating the analysis:
- `analyzeRecoveryPotential()` - Takes input, returns analysis
- Calls OpenAI with gpt-4o model
- Parses and validates JSON response
- Extracts analysis from markdown code blocks if needed
- Throws specific errors for different failure modes
- Logging functions for safe error reporting

**Error handling:**
```
LLM Error
    ↓
Specific Error Type (LLMApiError, MalformedResponseError, ValidationError)
    ↓
Safe Logging (no secrets)
    ↓
User-Friendly Error Message
```

### 5. **API Endpoint** (`app/api/analysis/analyze-recovery/route.ts`)
REST endpoint that:
- Validates incoming request
- Fetches transaction and customer from MongoDB
- Calculates retry history
- Calls analysis service
- Returns structured response or error

## 📊 Classification Types

### RECOVERABLE
**When:** Transaction likely to succeed on retry

**Characteristics:**
- Temporary failure reason (network timeout, insufficient funds)
- Customer has proven payment history
- Few retry attempts (0-1)
- Amount is reasonable for customer

**Recommended Actions:** RETRY, REMINDER, ALTERNATE_METHOD

**Example:**
```json
{
  "classification": "RECOVERABLE",
  "reason": "Customer has 8 successful payments. Network timeout is temporary.",
  "recommendedAction": "RETRY",
  "confidence": 0.92,
  "evidence": [
    "8 successful previous payments",
    "Failure: network_timeout (temporary)",
    "First retry attempt",
    "Amount within customer average"
  ]
}
```

### NOT_RECOVERABLE
**When:** Transaction should not be retried

**Characteristics:**
- Permanent failure (fraud, blocked card, invalid card)
- No payment history
- Exhausted retry attempts (3+)
- Account closure or abuse flags

**Recommended Actions:** NO_ACTION

**Example:**
```json
{
  "classification": "NOT_RECOVERABLE",
  "reason": "Fraud flagged with 3 retries exhausted. No recovery recommended.",
  "recommendedAction": "NO_ACTION",
  "confidence": 0.95,
  "evidence": [
    "Fraud suspected",
    "3 retry attempts exhausted",
    "Low customer history",
    "Fraud flags not auto-retried"
  ]
}
```

### HUMAN_REVIEW
**When:** Decision requires human judgment

**Characteristics:**
- Ambiguous failure reason (processing_error)
- High-value transaction (>₹50k)
- Unusual customer pattern
- Low confidence in automatic decision

**Recommended Actions:** HUMAN_REVIEW

**Example:**
```json
{
  "classification": "HUMAN_REVIEW",
  "reason": "High-value transaction with ambiguous error. Manual review needed.",
  "recommendedAction": "HUMAN_REVIEW",
  "confidence": 0.65,
  "evidence": [
    "High-value: ₹75,000",
    "Ambiguous failure: processing_error",
    "First retry attempt",
    "Amount 6x customer average"
  ]
}
```

## 🔐 Security & Safety

### 1. **LLM Cannot Execute Payments**
System prompt explicitly states:
- "YOU CANNOT execute any payment actions"
- "YOU CANNOT modify customer accounts"
- "YOU CANNOT authorize retries or charge customers"
- "You are ANALYSIS ONLY"

### 2. **Output Validation**
Every LLM response validated against Zod schema:
```typescript
{
  classification: enum (RECOVERABLE | NOT_RECOVERABLE | HUMAN_REVIEW)
  reason: string (10-500 chars)
  recommendedAction: enum (RETRY | REMINDER | ALTERNATE_METHOD | HUMAN_REVIEW | NO_ACTION)
  confidence: number (0.0-1.0)
  evidence: array of strings (1-5 items)
}
```

**Invalid responses rejected BEFORE use.**

### 3. **Safe Error Logging**
Errors logged without secrets:
```typescript
// ✅ GOOD: Sanitized error logging
{
  errorName: "LLMApiError",
  errorMessage: "OpenAI API error",
  errorStatus: 429
}

// ❌ BAD: Would expose API key
{
  fullError: "Error calling https://api.openai.com with key sk-xxx..."
}
```

### 4. **Environment Variable Handling**
API key only accessed once at service initialization:
```typescript
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LLMApiError("API key not configured");
  return new OpenAI({ apiKey });
}
```

Never logged, never exposed in responses.

## 📝 API Usage

### Endpoint

```
POST /api/analysis/analyze-recovery
Content-Type: application/json
```

### Request

```json
{
  "transactionId": "txn_001"
}
```

### Response (Success)

```json
{
  "data": {
    "classification": "RECOVERABLE",
    "reason": "Customer has proven payment history. Network timeout is typically temporary.",
    "recommendedAction": "RETRY",
    "confidence": 0.92,
    "evidence": [
      "8 successful previous payments",
      "Failure reason 'network_timeout' is transient",
      "First retry attempt",
      "Amount ₹2,500 within customer average ₹2,000"
    ]
  },
  "metadata": {
    "transactionId": "txn_001",
    "analyzedAt": "2026-08-31T10:30:00Z"
  }
}
```

### Response (Validation Error)

```json
{
  "error": "Validation failed",
  "details": {
    "transactionId": ["Transaction ID is required"]
  }
}
```

### Response (Transaction Not Found)

```json
{
  "error": "Not found",
  "message": "Transaction with ID 'txn_nonexistent' not found"
}
```

### Response (LLM API Error)

```json
{
  "error": "Rate limited",
  "message": "OpenAI API rate limit exceeded. Please retry later."
}
```

## 🧪 Testing

### Test 1: Analyze a Recoverable Transaction

```bash
# Create a test transaction
curl -X POST "http://localhost:3000/api/transactions" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "test_recover_001",
    "customerId": "syn_cust_0001",
    "orderId": "ord_test_001",
    "amount": 99900,
    "currency": "INR",
    "status": "FAILED",
    "paymentMethod": "card",
    "failureReason": "network_timeout",
    "retryCount": 0
  }'

# Analyze it
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "test_recover_001"}'
```

**Expected result:** RECOVERABLE or HUMAN_REVIEW (depending on customer history)

### Test 2: Analyze with Synthetic Data

```bash
# Seed synthetic data first
npm run seed

# Analyze a synthetic failed transaction
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "syn_txn_0002"}'
```

### Test 3: Invalid Request

```bash
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{}'

# Returns: 400 with validation error
```

### Test 4: Transaction Not Found

```bash
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "nonexistent"}'

# Returns: 404 Not found
```

## 🧠 How the LLM Analyzes

### Input Data Provided to LLM

```
## Transaction Details
- ID, amount, payment method
- Failure reason, retry count
- Creation timestamp

## Customer Payment History
- Total/successful/failed/abandoned transactions
- Total spent, average order value
- Success rate
- Last successful/failed payment
- Preferred payment method

## Retry History
- Total retries
- Failure reasons (detect patterns)
- Retry pattern (CONSISTENT/INTERMITTENT/SINGLE)
- Last retry timestamp
```

### LLM's Analysis Process

1. **Assess Failure Reason**
   - Temporary? (network, timeout, insufficient funds)
   - Permanent? (fraud, blocked, invalid)
   - Ambiguous? (processing error)

2. **Evaluate Customer History**
   - Success rate high? (80%+ = likely recoverable)
   - Recent successful payment? (strong signal)
   - Consistent payment behavior?

3. **Analyze Retry Pattern**
   - First attempt? (good candidate)
   - Same error repeated? (deterministic failure)
   - Mixed errors? (intermittent issue)

4. **Consider Transaction Value**
   - Within customer's average? (routine recovery)
   - Much higher than average? (warrants review)
   - Very high amount? (>₹50k = human review)

5. **Assign Confidence**
   - High (0.9+) if all factors align
   - Medium (0.7-0.9) if mostly aligned
   - Low (0.5-0.7) if conflicting signals
   - Very Low (<0.5) → recommend HUMAN_REVIEW

6. **Provide Evidence**
   - 1-5 specific facts supporting the decision
   - Never generic ("customer paid before")
   - Quantified when possible ("8 successful payments")

## 🔍 Error Handling Examples

### Scenario: API Key Not Set

```
User calls analyzeRecoveryPotential()
    ↓
getOpenAIClient() checks process.env.OPENAI_API_KEY
    ↓
Missing → throw LLMApiError("API key not configured")
    ↓
Caught in try/catch
    ↓
logAnalysisError() called (no key exposed)
    ↓
Return 503 to user: "OpenAI API authentication failed"
```

### Scenario: LLM Returns Invalid JSON

```
LLM response: "The answer is { invalid json }!"
    ↓
JSON.parse() fails
    ↓
throw MalformedResponseError("Failed to parse LLM response")
    ↓
Caught in try/catch
    ↓
logAnalysisError() called
    ↓
Return 500 to user: "Invalid LLM response"
```

### Scenario: LLM Returns Valid JSON but Wrong Schema

```
LLM response: {"classification": "UNKNOWN", "reason": "..."}
    ↓
JSON.parse() succeeds
    ↓
RecoveryAnalysisResponseSchema.safeParse() fails
    ↓
throw ValidationError("LLM response doesn't match schema")
    ↓
Caught in try/catch
    ↓
Return 400 to user with field errors
```

### Scenario: API Rate Limit

```
client.chat.completions.create() throws error
    ↓
Error message includes "429"
    ↓
throw LLMApiError("Rate limit exceeded", { status: 429 })
    ↓
Caught in try/catch
    ↓
Return 429 to user: "Rate limit exceeded. Please retry later."
```

## 📊 System Prompt Structure

The system prompt (`lib/ai/system-prompt.ts`) has:

1. **Role Definition** - What the LLM does (analysis)
2. **Constraints** - What it cannot do (execute payments)
3. **Output Format** - Expected JSON structure with examples
4. **Classification Rules** - When to use each classification
5. **Decision Factors** - How to weigh evidence (failure reason > history > amount > retries)
6. **Confidence Scoring** - How to assign 0.0-1.0 confidence
7. **Evidence Requirements** - Must provide 1-5 specific facts
8. **Examples** - 3 realistic scenarios showing output format

## 🚀 Running the Service

### Prerequisites

1. **MongoDB running** with transactions seeded
2. **OpenAI API key** in `.env.local`
3. **Dev server running**
   ```bash
   npm run dev
   ```

### Usage

```bash
# 1. Seed synthetic data (has various failure scenarios)
npm run seed

# 2. Start dev server
npm run dev

# 3. Analyze a transaction
curl -X POST "http://localhost:3000/api/analysis/analyze-recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "syn_txn_0002"}'
```

## 📈 Decision Confidence Examples

| Scenario | Confidence | Why |
|----------|-----------|-----|
| High success rate, temporary failure, first retry | 0.92+ | Strong evidence for recovery |
| Fraud suspected, 3 retries exhausted | 0.95+ | Strong evidence for no recovery |
| High-value amount with processing error, 1 retry | 0.65 | Ambiguous failure, high value |
| New customer, single failure | 0.55 | Limited history, unclear signals |
| Customer with mixed history, payment method issue | 0.70 | Suggest retry but manual review ok |

## 🔗 Separation of Concerns

```
AI Analysis Service
    ├── Validates Input
    ├── Fetches Data
    ├── Calls LLM
    ├── Validates Output
    └── Returns Decision

              ↓
        (Human or next service)

Payment Execution Service
    ├── Accepts decision
    ├── Implements guardrails
    ├── Executes payment
    └── Logs transaction

      AI NEVER executes payments
      Payments NEVER bypass AI analysis
      Decisions are human-reviewable
```

## 📚 Files Overview

| File | Purpose |
|------|---------|
| `lib/ai/schemas.ts` | Zod schemas for validation |
| `lib/ai/errors.ts` | Error types and safe logging |
| `lib/ai/system-prompt.ts` | LLM system prompt |
| `lib/ai/analysis.ts` | Core analysis service |
| `app/api/analysis/analyze-recovery/route.ts` | API endpoint |

All compiles with zero errors and is production-ready!
