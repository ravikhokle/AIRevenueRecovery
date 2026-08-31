# AI Revenue Recovery Agent — Failure Handling & Hostile QA Report

This document details the 13 mandatory failure scenarios inspected during hostile QA testing, documenting the **Problem → Root Cause → Fix → Regression Test** for every vulnerability.

---

## Failure Matrix Overview

| # | Scenario | Vulnerability / Failure Mode | Defense Mechanism | Guardrail Policy / Error Code | Status |
|---|---|---|---|---|---|
| **1** | LLM Unavailable | OpenAI API 401/429/503 outage | Handled in `analyzeRecoveryPotential`, emits `ERROR` audit log | `LLMApiError` | **RESOLVED** |
| **2** | LLM Invalid JSON | Malformed JSON returned by LLM | Strict regex extraction & `JSON.parse` isolation | `MalformedResponseError` | **RESOLVED** |
| **3** | LLM Invalid Action | LLM hallucinates out-of-policy action | Enum validation & Guardrail policy enforcement | `INVALID_ACTION` | **RESOLVED** |
| **4** | Low AI Confidence | AI confidence below threshold (< 0.70) | Guardrails block automatic retry, routes to human review | `CONFIDENCE_THRESHOLD` | **RESOLVED** |
| **5** | Retry Limit Exceeded | Endless retry loop on recurring failures | Hard maximum limit of 3 retries enforced | `RETRY_LIMIT` | **RESOLVED** |
| **6** | Amount Exceeds Limit | Auto-recovery attempted on high-value txn | Hard ₹10,000 auto limit; > ₹50,000 human review | `AMOUNT_LIMIT` / `HIGH_VALUE_LIMIT` | **RESOLVED** |
| **7** | Duplicate Event | Processing already-succeeded transaction | Step 1 checks status in `{'FAILED', 'ABANDONED'}` | `INVALID_STATUS` (400) | **RESOLVED** |
| **8** | Duplicate Action | Re-executing retry on already-retried txn | Guardrails track `previousAttempts > 0` | `DUPLICATE_PREVENTION` | **RESOLVED** |
| **9** | Razorpay Timeout | Gateway network timeout during order create | `ActionExecutor` captures timeout, marks `FAILED` | `GATEWAY_TIMEOUT` | **RESOLVED** |
| **10** | Razorpay Failure | Gateway 400/500 HTTP errors | Fails action execution gracefully, `actionVerified=false` | `RAZORPAY_SERVICE_ERROR` | **RESOLVED** |
| **11** | Database Failure | MongoDB connection dropped mid-workflow | `RecoveryWorkflowError` with HTTP 503 and safe logging | `LOAD_FAILED` (503) | **RESOLVED** |
| **12** | Missing Transaction | Requested `transactionId` not in database | Explicit 404 response with `TRANSACTION_NOT_FOUND` | `TRANSACTION_NOT_FOUND` (404) | **RESOLVED** |
| **13** | Invalid Transaction | Negative amounts or corrupted customer data | Zod schema validation (`.positive()`, `.nonnegative()`) | `ValidationError` | **RESOLVED** |

---

## Detailed Failure Analysis

### 1. LLM Unavailable
- **Problem**: When OpenAI API is unreachable, down, or returning authentication errors (401/429/500), the recovery agent must not crash the process or leave transactions in undefined states.
- **Root Cause**: Network or API provider downtime.
- **Fix**: [`lib/ai/analysis.ts`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/lib/ai/analysis.ts) wraps calls in try-catch, mapping API exceptions to `LLMApiError`. [`lib/workflow/recovery-workflow.ts`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/lib/workflow/recovery-workflow.ts) records an immutable `ERROR` audit log entry and aborts execution safely without triggering any financial actions.
- **Test**: `test1_LLMUnavailable()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 2. LLM Returns Invalid JSON
- **Problem**: LLMs occasionally return truncated text, conversational preambles, or unquoted keys instead of valid JSON.
- **Root Cause**: Non-deterministic text generation from LLM completion endpoints.
- **Fix**: Added markdown code-block regex extraction (`/```(?:json)?\s*([\s\S]*?)\s*```/`) followed by safe `JSON.parse` isolation. Throws `MalformedResponseError` with raw text attached for sanitised audit logging without executing any downstream actions.
- **Test**: `test2_LLMInvalidJSON()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 3. LLM Returns an Invalid Action
- **Problem**: An adversarial prompt or model hallucination recommends an unauthorized action (e.g. `REFUND_ALL_FUNDS`, `DELETE_ACCOUNT`).
- **Root Cause**: LLM is probabilistic and cannot be trusted as an execution authority.
- **Fix**: Two-layer defense:
  1. `RecommendedAction` Zod enum validation rejects unknown strings.
  2. `GuardrailEngine` checks `ALLOWED_ACTIONS = ["RETRY", "REMINDER", "ALTERNATE_METHOD", "NO_ACTION"]` and throws `GuardrailRejectionError("INVALID_ACTION")`, emitting `ACTION_BLOCKED`.
- **Test**: `test3_LLMInvalidAction()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 4. Low AI Confidence
- **Problem**: AI recommends a retry with low statistical certainty (e.g. confidence = 0.45), which would cause customer annoyance or repeated gateway declines.
- **Root Cause**: Edge cases or ambiguous customer payment histories.
- **Fix**: `GuardrailEngine` enforces strict confidence thresholds (`minConfidenceForAutoRetry = 0.70`, `minConfidenceForReminder = 0.60`). Any recommendation below threshold throws `GuardrailRejectionError("CONFIDENCE_THRESHOLD")` and routes the transaction to `HUMAN_REVIEW`.
- **Test**: `test4_LowConfidence()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 5. Retry Limit Exceeded
- **Problem**: Transactions with recurring payment issues could enter infinite retry loops, hitting gateway rate limits and incurring card network penalty fees.
- **Root Cause**: Lack of global retry budget tracking per transaction.
- **Fix**: Rule 8 in `GuardrailEngine` checks `retryCount >= maxRetriesPerTransaction (3)`. Throws `GuardrailRejectionError("RETRY_LIMIT")`, permanently blocking further automated retry attempts on that transaction.
- **Test**: `test5_RetryLimitExceeded()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 6. Transaction Amount Exceeds Automatic Limit
- **Problem**: High-value transactions (e.g. ₹75,000) could be retried automatically, exposing the merchant to high-ticket dispute risks.
- **Root Cause**: Uncapped execution threshold.
- **Fix**: Rule 2 & 6 in `GuardrailEngine` enforce a hard cap of `maxRetryAmount = 1,000,000 paise (₹10,000)`. Transactions above ₹10,000 are blocked automatically (`AMOUNT_LIMIT`), and transactions above ₹50,000 require manual human escalation (`HIGH_VALUE_LIMIT`).
- **Test**: `test6_AmountExceedsLimit()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 7. Duplicate Event
- **Problem**: Webhook replay or duplicate event submission attempts to run recovery on an already successful transaction (`status === "SUCCESS"`).
- **Root Cause**: At-least-once delivery semantics from payment gateways.
- **Fix**: `RecoveryWorkflow.step1LoadTransaction` validates `transaction.status in {'FAILED', 'ABANDONED'}`. If status is `SUCCESS` or `PENDING`, it rejects execution immediately with `RecoveryWorkflowError("INVALID_STATUS", 400)`.
- **Test**: `test7_DuplicateEvent()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 8. Duplicate Recovery Action
- **Problem**: Re-running the recovery workflow on the same transaction could trigger multiple duplicate orders or payment links.
- **Root Cause**: Lack of stateful attempt tracking in the workflow orchestrator.
- **Fix**: `RecoveryWorkflow.step5CheckGuardrails` queries the append-only audit trail for prior `ACTION_EXECUTED` events, computing `previousAttempts`. `GuardrailEngine` verifies `previousAttempts === 0` for retries, throwing `GuardrailRejectionError("DUPLICATE_PREVENTION")` if already attempted.
- **Test**: `test8_DuplicateRecoveryAction()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 9. Razorpay API Timeout
- **Problem**: Payment gateway network calls time out mid-flight during Order or Payment Link creation.
- **Root Cause**: Network latency or gateway downtime.
- **Fix**: `ActionExecutor` catches timeout errors, sets `execution.status = "FAILED"` with sanitized error details, and `verifyActionResult()` returns `false`. Prevents false positive recovery metrics.
- **Test**: `test9_RazorpayTimeout()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 10. Razorpay API Failure
- **Problem**: Razorpay returns HTTP 400 Bad Request or 500 Internal Error.
- **Root Cause**: Gateway validation failure, expired test tokens, or service disruption.
- **Fix**: `RazorpayRecoveryService` captures gateway response errors, maps them to `RazorpayServiceError`, and sets action result to `FAILED`. `verifyActionResult()` ensures the transaction is not marked recovered.
- **Test**: `test10_RazorpayAPIFailure()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 11. Database Failure
- **Problem**: MongoDB connection drops or times out during workflow execution.
- **Root Cause**: Database partition, connection pool exhaustion, or unreachable host.
- **Fix**: `RecoveryWorkflow` catches DB connection errors and wraps them in `RecoveryWorkflowError("LOAD_FAILED", 503)`. Safe error logging is isolated in a sub-try-catch so unhandled exceptions do not corrupt state.
- **Test**: `test11_DatabaseFailure()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 12. Missing Transaction
- **Problem**: An invalid or non-existent `transactionId` is requested.
- **Root Cause**: Stale links, client typo, or corrupted identifier.
- **Fix**: `RecoveryWorkflow.step1LoadTransaction` performs an explicit existence check and throws `RecoveryWorkflowError("TRANSACTION_NOT_FOUND", 404)` with standard HTTP 404 response.
- **Test**: `test12_MissingTransaction()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

### 13. Invalid Transaction Data
- **Problem**: Transaction record has negative amounts, invalid currency codes, or negative retry counts.
- **Root Cause**: Corrupted database records or schema mismatch.
- **Fix**: Fixed bug in `lib/ai/schemas.ts` where `.non_negative()` was changed to valid Zod `.nonnegative()`. `RecoveryAnalysisInputSchema` validates `amount: z.number().positive()` and `currency: z.string().length(3)` before AI processing.
- **Test**: `test13_InvalidTransactionData()` in [`scripts/run-qa-tests.mjs`](file:///c:/Users/ravik/OneDrive/Desktop/ai-revenue-recovery/scripts/run-qa-tests.mjs).

---

## How to Run Regression Tests

Execute the automated hostile QA test suite at any time:

```bash
node scripts/run-qa-tests.mjs
```

Expected output:
```
================================================================================
  HOSTILE QA TEST SUITE — 13 MANDATORY FAILURE SCENARIOS
================================================================================

[✅ PASS] Scenario 1: 1. LLM Unavailable
[✅ PASS] Scenario 2: 2. LLM Returns Invalid JSON
[✅ PASS] Scenario 3: 3. LLM Returns Invalid Action
[✅ PASS] Scenario 4: 4. Low AI Confidence (< 0.70 threshold)
[✅ PASS] Scenario 5: 5. Retry Limit Exceeded (retryCount >= 3)
[✅ PASS] Scenario 6: 6. Amount Exceeds Limit (₹75,000 > ₹10,000 auto limit)
[✅ PASS] Scenario 7: 7. Duplicate Event (Processing SUCCESS transaction)
[✅ PASS] Scenario 8: 8. Duplicate Recovery Action (previousAttempts > 0)
[✅ PASS] Scenario 9: 9. Razorpay API Timeout
[✅ PASS] Scenario 10: 10. Razorpay API Failure (500 Gateway Error)
[✅ PASS] Scenario 11: 11. Database Failure
[✅ PASS] Scenario 12: 12. Missing Transaction (ID not found in database)
[✅ PASS] Scenario 13: 13. Invalid Transaction Data (Negative amount / Malformed schema)

--------------------------------------------------------------------------------
FINAL RESULT: 13 / 13 Scenarios Passed (100%)
--------------------------------------------------------------------------------
```
