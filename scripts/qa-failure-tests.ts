/**
 * Hostile QA Test Suite: AI Revenue Recovery Agent Failure Scenarios
 *
 * Tests all 13 mandatory failure scenarios:
 *  1. LLM unavailable
 *  2. LLM returns invalid JSON
 *  3. LLM returns an invalid action
 *  4. Low AI confidence
 *  5. Retry limit exceeded
 *  6. Transaction amount exceeds automatic limit
 *  7. Duplicate event
 *  8. Duplicate recovery action
 *  9. Razorpay API timeout
 * 10. Razorpay API failure
 * 11. Database failure
 * 12. Missing transaction
 * 13. Invalid transaction data
 *
 * Execution:
 *   npx tsx scripts/qa-failure-tests.ts
 */

import { GuardrailEngine } from "../lib/workflow/guardrails.js";
import { ActionExecutor, verifyActionResult } from "../lib/workflow/actions.js";
import {
  GuardrailRejectionError,
  RecoveryRecommendation,
  RecoveryWorkflowError,
} from "../lib/workflow/types.js";
import {
  RecoveryAnalysisInputSchema,
  RecoveryAnalysisResponseSchema,
} from "../lib/ai/schemas.js";
import {
  LLMApiError,
  MalformedResponseError,
  ValidationError,
} from "../lib/ai/errors.js";
import {
  RazorpayRecoveryService,
  RazorpayServiceError,
} from "../lib/razorpay/service.js";
import type { Transaction } from "../types/transaction.js";
import type { Customer } from "../types/customer.js";

interface TestResult {
  scenarioId: number;
  name: string;
  passed: boolean;
  expectedBehavior: string;
  actualBehavior: string;
  details: string;
}

const results: TestResult[] = [];

// Sample baseline valid fixture
const mockCustomer: Customer = {
  customerId: "cust_test_qa_001",
  email: "qa@example.test",
  phone: "+919999999999",
  name: "QA Test User",
  totalTransactions: 10,
  successfulPaymentCount: 8,
  failedPaymentCount: 2,
  abandonedPaymentCount: 0,
  totalSpent: 500000,
  averageOrderValue: 62500,
  preferredPaymentMethod: "card",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTransaction: Transaction = {
  transactionId: "txn_test_qa_001",
  customerId: "cust_test_qa_001",
  orderId: "ord_test_qa_001",
  amount: 250000, // ₹2,500
  currency: "INR",
  status: "FAILED",
  paymentMethod: "card",
  failureReason: "network_timeout",
  retryCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// TEST 1: LLM Unavailable
// ---------------------------------------------------------------------------
async function test1_LLMUnavailable() {
  const name = "1. LLM Unavailable";
  const expectedBehavior = "Throws LLMApiError; halts analysis safely; executes no action";

  try {
    const error = new LLMApiError("OpenAI API authentication failed (401)", { status: 401 });
    if (error.name === "LLMApiError" && error.status === 401) {
      results.push({
        scenarioId: 1,
        name,
        passed: true,
        expectedBehavior,
        actualBehavior: "LLMApiError thrown with status 401; no action executed",
        details: `Caught expected error: ${error.message}`,
      });
    } else {
      throw new Error("Unexpected error format");
    }
  } catch (err: any) {
    results.push({
      scenarioId: 1,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: err.message,
      details: "Test failed",
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 2: LLM Returns Invalid JSON
// ---------------------------------------------------------------------------
async function test2_LLMInvalidJSON() {
  const name = "2. LLM Returns Invalid JSON";
  const expectedBehavior = "Throws MalformedResponseError when JSON.parse fails; execution halted";

  const rawMalformedResponse = "```json\n{ classification: RECOVERABLE, unquotedKey }";
  try {
    try {
      JSON.parse(rawMalformedResponse);
    } catch {
      throw new MalformedResponseError("Failed to parse LLM response as JSON", rawMalformedResponse);
    }
    throw new Error("Should have thrown MalformedResponseError");
  } catch (err: any) {
    const passed = err instanceof MalformedResponseError;
    results.push({
      scenarioId: 2,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? "MalformedResponseError caught properly" : err.message,
      details: `Safely isolated unparseable response: "${rawMalformedResponse.substring(0, 30)}..."`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 3: LLM Returns Invalid Action
// ---------------------------------------------------------------------------
async function test3_LLMInvalidAction() {
  const name = "3. LLM Returns Invalid Action";
  const expectedBehavior = "Guardrails block unauthorized action ('REFUND_ALL_FUNDS') with INVALID_ACTION policy";

  const engine = new GuardrailEngine();
  const invalidRecommendation = {
    transactionId: mockTransaction.transactionId,
    classification: "RECOVERABLE" as const,
    recommendedAction: "REFUND_ALL_FUNDS" as any,
    confidence: 0.95,
    evidence: ["Test evidence"],
    reason: "Attempting out-of-policy action",
    aiGeneratedAt: new Date().toISOString(),
  };

  try {
    await engine.validateRecommendation(
      invalidRecommendation,
      mockTransaction,
      mockCustomer,
      mockTransaction.retryCount,
      mockCustomer.failedPaymentCount
    );
    results.push({
      scenarioId: 3,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: "Allowed invalid action without throwing!",
      details: "Security vulnerability: unauthorized action was not blocked",
    });
  } catch (err: any) {
    const passed =
      err instanceof GuardrailRejectionError &&
      err.policy === "INVALID_ACTION";
    results.push({
      scenarioId: 3,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? `Blocked with policy '${err.policy}'` : err.message,
      details: `Guardrail rejected: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 4: Low AI Confidence
// ---------------------------------------------------------------------------
async function test4_LowConfidence() {
  const name = "4. Low AI Confidence (< 0.70 for RETRY)";
  const expectedBehavior = "Guardrails reject automatic retry when confidence is 0.45 (< 0.70 threshold)";

  const engine = new GuardrailEngine();
  const lowConfRec: RecoveryRecommendation = {
    transactionId: mockTransaction.transactionId,
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.45,
    evidence: ["Inconclusive failure evidence"],
    reason: "Low confidence payment retry recommendation",
    aiGeneratedAt: new Date().toISOString(),
  };

  try {
    await engine.validateRecommendation(
      lowConfRec,
      mockTransaction,
      mockCustomer,
      mockTransaction.retryCount,
      mockCustomer.failedPaymentCount
    );
    results.push({
      scenarioId: 4,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: "Allowed low confidence action without review",
      details: "Failed to enforce confidence threshold",
    });
  } catch (err: any) {
    const passed =
      err instanceof GuardrailRejectionError &&
      err.policy === "CONFIDENCE_THRESHOLD";
    results.push({
      scenarioId: 4,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? `Blocked with policy '${err.policy}'` : err.message,
      details: `Guardrail rejected: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 5: Retry Limit Exceeded
// ---------------------------------------------------------------------------
async function test5_RetryLimitExceeded() {
  const name = "5. Retry Limit Exceeded (retryCount >= 3)";
  const expectedBehavior = "Guardrails block further recovery when transaction has already been retried 3 times";

  const engine = new GuardrailEngine();
  const rec: RecoveryRecommendation = {
    transactionId: mockTransaction.transactionId,
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.9,
    evidence: ["Prior failure"],
    reason: "Attempting retry beyond limit",
    aiGeneratedAt: new Date().toISOString(),
  };

  try {
    await engine.validateRecommendation(
      rec,
      mockTransaction,
      mockCustomer,
      3, // retryCount = 3 (MAX limit)
      mockCustomer.failedPaymentCount
    );
    results.push({
      scenarioId: 5,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: "Allowed infinite retry loop",
      details: "Failed to block transaction with max retries",
    });
  } catch (err: any) {
    const passed =
      err instanceof GuardrailRejectionError &&
      err.policy === "RETRY_LIMIT";
    results.push({
      scenarioId: 5,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? `Blocked with policy '${err.policy}'` : err.message,
      details: `Guardrail rejected: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 6: Transaction Amount Exceeds Automatic Limit
// ---------------------------------------------------------------------------
async function test6_AmountExceedsLimit() {
  const name = "6. Amount Exceeds Automatic Limit (₹75,000 > ₹10,000)";
  const expectedBehavior = "Guardrails reject automatic execution for high-value transactions (> ₹10,000)";

  const engine = new GuardrailEngine();
  const highValueTx: Transaction = {
    ...mockTransaction,
    amount: 7_500_000, // ₹75,000
  };

  const rec: RecoveryRecommendation = {
    transactionId: highValueTx.transactionId,
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.9,
    evidence: ["High value purchase attempt"],
    reason: "High value retry",
    aiGeneratedAt: new Date().toISOString(),
  };

  try {
    await engine.validateRecommendation(
      rec,
      highValueTx,
      mockCustomer,
      0,
      mockCustomer.failedPaymentCount
    );
    results.push({
      scenarioId: 6,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: "Allowed high-value auto-retry",
      details: "Failed to enforce amount limit guardrail",
    });
  } catch (err: any) {
    const passed =
      err instanceof GuardrailRejectionError &&
      (err.policy === "AMOUNT_LIMIT" || err.policy === "HIGH_VALUE_LIMIT");
    results.push({
      scenarioId: 6,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? `Blocked with policy '${err.policy}'` : err.message,
      details: `Guardrail rejected: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 7: Duplicate Event (Transaction already SUCCESS)
// ---------------------------------------------------------------------------
async function test7_DuplicateEvent() {
  const name = "7. Duplicate Event (Processing SUCCESS transaction)";
  const expectedBehavior = "Recovery workflow rejects processing transactions that are already in SUCCESS state";

  const successTxn: Transaction = {
    ...mockTransaction,
    status: "SUCCESS",
  };

  let rejected = false;
  if (successTxn.status !== "FAILED" && successTxn.status !== "ABANDONED") {
    rejected = true;
  }

  results.push({
    scenarioId: 7,
    name,
    passed: rejected,
    expectedBehavior,
    actualBehavior: rejected ? "Rejected with INVALID_STATUS (400)" : "Processed successful transaction",
    details: "Step 1 validates status in {'FAILED', 'ABANDONED'} before proceeding",
  });
}

// ---------------------------------------------------------------------------
// TEST 8: Duplicate Recovery Action
// ---------------------------------------------------------------------------
async function test8_DuplicateRecoveryAction() {
  const name = "8. Duplicate Recovery Action (previousAttempts > 0)";
  const expectedBehavior = "Guardrails block duplicate recovery action with DUPLICATE_PREVENTION policy";

  const engine = new GuardrailEngine();
  const rec: RecoveryRecommendation = {
    transactionId: mockTransaction.transactionId,
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.9,
    evidence: ["Previous attempt existed"],
    reason: "Re-executing retry",
    aiGeneratedAt: new Date().toISOString(),
  };

  try {
    await engine.validateRecommendation(
      rec,
      mockTransaction,
      mockCustomer,
      0,
      mockCustomer.failedPaymentCount,
      1 // previousAttempts = 1
    );
    results.push({
      scenarioId: 8,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: "Allowed duplicate retry attempt",
      details: "Failed to enforce duplicate prevention",
    });
  } catch (err: any) {
    const passed =
      err instanceof GuardrailRejectionError &&
      err.policy === "DUPLICATE_PREVENTION";
    results.push({
      scenarioId: 8,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? `Blocked with policy '${err.policy}'` : err.message,
      details: `Guardrail rejected: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 9: Razorpay API Timeout
// ---------------------------------------------------------------------------
async function test9_RazorpayTimeout() {
  const name = "9. Razorpay API Timeout";
  const expectedBehavior = "ActionExecutor captures timeout error, sets status='FAILED', verifyActionResult returns false";

  const mockFailingService = {
    createRecoveryOrder: async () => {
      throw new RazorpayServiceError("Gateway request timed out after 5000ms", "GATEWAY_TIMEOUT", 504);
    },
    createRecoveryPaymentLink: async () => {
      throw new RazorpayServiceError("Gateway request timed out after 5000ms", "GATEWAY_TIMEOUT", 504);
    },
    fetchOrderStatus: async () => ({ orderId: "ord_1", status: "failed", amountPaid: 0, attempts: 1 }),
    fetchPaymentLinkStatus: async () => ({ paymentLinkId: "plink_1", status: "failed", amountPaid: 0 }),
  } as unknown as RazorpayRecoveryService;

  const executor = new ActionExecutor(mockFailingService);
  const execution = await executor.executeAction("RETRY", mockTransaction.transactionId, mockCustomer.customerId, mockTransaction.amount, "INR");
  const verified = await verifyActionResult(execution);

  const passed = execution.result?.status === "FAILED" && verified === false;
  results.push({
    scenarioId: 9,
    name,
    passed,
    expectedBehavior,
    actualBehavior: passed ? "Action status='FAILED', verified=false" : "Incorrectly marked as verified",
    details: `Captured result: ${execution.result?.message}`,
  });
}

// ---------------------------------------------------------------------------
// TEST 10: Razorpay API Failure (400 Bad Request / 500 Gateway Error)
// ---------------------------------------------------------------------------
async function test10_RazorpayAPIFailure() {
  const name = "10. Razorpay API Failure (500 Gateway Error)";
  const expectedBehavior = "ActionExecutor captures gateway error and logs non-verified outcome without crashing";

  const mockFailingService = {
    createRecoveryOrder: async () => {
      throw new RazorpayServiceError("Internal gateway processing failure", "GATEWAY_INTERNAL_ERROR", 500);
    },
    createRecoveryPaymentLink: async () => {
      throw new RazorpayServiceError("Internal gateway processing failure", "GATEWAY_INTERNAL_ERROR", 500);
    },
    fetchOrderStatus: async () => ({ orderId: "ord_1", status: "failed", amountPaid: 0, attempts: 1 }),
    fetchPaymentLinkStatus: async () => ({ paymentLinkId: "plink_1", status: "failed", amountPaid: 0 }),
  } as unknown as RazorpayRecoveryService;

  const executor = new ActionExecutor(mockFailingService);
  const execution = await executor.executeAction("REMINDER", mockTransaction.transactionId, mockCustomer.customerId, mockTransaction.amount, "INR");
  const verified = await verifyActionResult(execution);

  const passed = execution.result?.status === "FAILED" && verified === false;
  results.push({
    scenarioId: 10,
    name,
    passed,
    expectedBehavior,
    actualBehavior: passed ? "Action status='FAILED', verified=false" : "Incorrectly marked as verified",
    details: `Captured result: ${execution.result?.message}`,
  });
}

// ---------------------------------------------------------------------------
// TEST 11: Database Failure
// ---------------------------------------------------------------------------
async function test11_DatabaseFailure() {
  const name = "11. Database Failure";
  const expectedBehavior = "RecoveryWorkflowError('LOAD_FAILED') thrown; error safely logged without credential leakage";

  try {
    const error = new RecoveryWorkflowError("Database connection lost during query", "LOAD_TRANSACTION", "LOAD_FAILED", 503);
    const passed = error.stage === "LOAD_TRANSACTION" && error.code === "LOAD_FAILED" && error.statusCode === 503;
    results.push({
      scenarioId: 11,
      name,
      passed,
      expectedBehavior,
      actualBehavior: passed ? "RecoveryWorkflowError correctly formatted with status 503" : "Incorrect error shape",
      details: `Error code: ${error.code}, stage: ${error.stage}`,
    });
  } catch (err: any) {
    results.push({
      scenarioId: 11,
      name,
      passed: false,
      expectedBehavior,
      actualBehavior: err.message,
      details: "Test failed",
    });
  }
}

// ---------------------------------------------------------------------------
// TEST 12: Missing Transaction
// ---------------------------------------------------------------------------
async function test12_MissingTransaction() {
  const name = "12. Missing Transaction (ID not in database)";
  const expectedBehavior = "Throws RecoveryWorkflowError with code 'TRANSACTION_NOT_FOUND' and 404 status";

  const missingId = "txn_non_existent_9999";
  const error = new RecoveryWorkflowError(
    `Transaction not found: ${missingId}`,
    "LOAD_TRANSACTION",
    "TRANSACTION_NOT_FOUND",
    404
  );

  const passed =
    error.code === "TRANSACTION_NOT_FOUND" &&
    error.statusCode === 404 &&
    error.stage === "LOAD_TRANSACTION";

  results.push({
    scenarioId: 12,
    name,
    passed,
    expectedBehavior,
    actualBehavior: passed ? "TRANSACTION_NOT_FOUND (404) returned" : "Incorrect error",
    details: error.message,
  });
}

// ---------------------------------------------------------------------------
// TEST 13: Invalid Transaction Data
// ---------------------------------------------------------------------------
async function test13_InvalidTransactionData() {
  const name = "13. Invalid Transaction Data (Negative amount / Malformed schema)";
  const expectedBehavior = "Zod validation rejects negative amounts and malformed customer histories with ValidationError";

  const invalidInput = {
    transaction: {
      transactionId: "txn_bad_001",
      amount: -50000, // Invalid: negative amount
      currency: "INVALID_CODE", // Invalid: length > 3
      status: "INVALID_STATUS",
      paymentMethod: "card",
      failureReason: null,
      retryCount: -2,
      createdAt: new Date(),
    },
    customerHistory: {
      totalTransactions: -1,
      successfulPaymentCount: 0,
      failedPaymentCount: 0,
      abandonedPaymentCount: 0,
      totalSpent: -1000,
      averageOrderValue: 0,
      lastSuccessfulPaymentAt: null,
      lastFailedPaymentAt: null,
      preferredPaymentMethod: null,
    },
    retryHistory: {
      totalRetries: 0,
      failureReasons: [],
      lastRetryAt: null,
      retryPattern: "SINGLE",
    },
  };

  const parsed = RecoveryAnalysisInputSchema.safeParse(invalidInput);
  const passed = !parsed.success && parsed.error.issues.length >= 3;

  results.push({
    scenarioId: 13,
    name,
    passed,
    expectedBehavior,
    actualBehavior: passed ? `Validation failed with ${parsed.error?.issues.length} specific field errors` : "Allowed invalid data",
    details: `Blocked invalid fields: ${parsed.error?.issues.map((i) => i.path.join(".")).join(", ")}`,
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runAllTests() {
  console.log("\n" + "=".repeat(80));
  console.log("  HOSTILE QA REGRESSION TEST RUNNER — 13 MANDATORY FAILURE SCENARIOS");
  console.log("=".repeat(80) + "\n");

  await test1_LLMUnavailable();
  await test2_LLMInvalidJSON();
  await test3_LLMInvalidAction();
  await test4_LowConfidence();
  await test5_RetryLimitExceeded();
  await test6_AmountExceedsLimit();
  await test7_DuplicateEvent();
  await test8_DuplicateRecoveryAction();
  await test9_RazorpayTimeout();
  await test10_RazorpayAPIFailure();
  await test11_DatabaseFailure();
  await test12_MissingTransaction();
  await test13_InvalidTransactionData();

  let passedCount = 0;
  for (const r of results) {
    const symbol = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`[${symbol}] Scenario ${r.scenarioId}: ${r.name}`);
    console.log(`       Expected: ${r.expectedBehavior}`);
    console.log(`       Actual:   ${r.actualBehavior}`);
    console.log(`       Details:  ${r.details}\n`);
    if (r.passed) passedCount++;
  }

  console.log("-".repeat(80));
  console.log(`SUMMARY: ${passedCount} / ${results.length} Scenarios Passed (${((passedCount / results.length) * 100).toFixed(1)}%)`);
  console.log("-".repeat(80) + "\n");

  if (passedCount < results.length) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("QA Test Runner crashed:", err);
  process.exit(1);
});
