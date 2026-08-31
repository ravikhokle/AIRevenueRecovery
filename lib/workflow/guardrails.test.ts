/**
 * Guardrail Engine Unit Tests
 * 
 * Tests for deterministic, rule-based guardrails that PREVENT LLM from
 * directly executing recovery actions.
 * 
 * Each rule is independent and deterministic.
 */

import { GuardrailEngine } from "./guardrails";
import { RecoveryRecommendation, GuardrailRejectionError } from "./types";
import { Transaction } from "@/types/transaction";
import { Customer } from "@/types/customer";

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => Promise<void> | void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const expect: (actual: any) => {
  toBe: (expected: any) => void;
  toEqual: (expected: any) => void;
  toBeGreaterThan: (expected: any) => void;
  toBeLessThan: (expected: any) => void;
  toBeDefined: () => void;
  rejects: {
    toThrow: (expected?: any) => Promise<void>;
  };
  toThrow: (expected?: any) => void;
};

describe("GuardrailEngine - Deterministic Rules", () => {
  let guardrails: GuardrailEngine;

  // Test fixtures
  const createMockTransaction = (overrides?: Partial<Transaction>): Transaction => ({
    transactionId: "txn_test_001",
    customerId: "cust_001",
    orderId: "ord_001",
    amount: 100_000, // ₹1,000
    currency: "INR",
    status: "FAILED",
    paymentMethod: "card",
    failureReason: "insufficient_funds",
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockCustomer = (overrides?: Partial<Customer>): Customer => ({
    customerId: "cust_001",
    totalTransactions: 10,
    successfulPaymentCount: 8,
    failedPaymentCount: 2,
    abandonedPaymentCount: 0,
    totalSpent: 1_000_000,
    averageOrderValue: 100_000,
    lastSuccessfulPaymentAt: new Date(Date.now() - 86400000), // Yesterday
    lastFailedPaymentAt: new Date(),
    preferredPaymentMethod: "card",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createMockRecommendation = (overrides?: Partial<RecoveryRecommendation>): RecoveryRecommendation => ({
    transactionId: "txn_test_001",
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.85,
    evidence: ["Customer has good payment history"],
    reason: "Temporary failure, customer reliable",
    aiGeneratedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    guardrails = new GuardrailEngine();
  });

  describe("RULE 1: Maximum retry attempts = 3", () => {
    test("should BLOCK if retryCount >= 3", async () => {
      const transaction = createMockTransaction({ retryCount: 3 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 3, 1)
      ).rejects.toThrow(GuardrailRejectionError);
    });

    test("should ALLOW if retryCount < 3", async () => {
      const transaction = createMockTransaction({ retryCount: 1 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        1,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should BLOCK 4th retry attempt", async () => {
      const transaction = createMockTransaction({ retryCount: 4 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 4, 1)
      ).rejects.toThrow("RULE 8 ENFORCED");
    });
  });

  describe("RULE 2: Automatic recovery amount limit = ₹10,000", () => {
    test("should BLOCK if amount > ₹10,000", async () => {
      const transaction = createMockTransaction({ amount: 1_000_001 }); // ₹10,000.01
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 2 ENFORCED");
    });

    test("should ALLOW if amount == ₹10,000", async () => {
      const transaction = createMockTransaction({ amount: 1_000_000 }); // Exactly ₹10,000
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should BLOCK for ₹50,000 transaction", async () => {
      const transaction = createMockTransaction({ amount: 5_000_000 }); // ₹50,000
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");
    });

    test("should ALLOW for ₹5,000 transaction", async () => {
      const transaction = createMockTransaction({ amount: 500_000 }); // ₹5,000
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("RULE 3: Confidence below 0.70 requires HUMAN_REVIEW", () => {
    test("should BLOCK RETRY if confidence < 0.70", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 0.69 });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 3 ENFORCED");
    });

    test("should ALLOW RETRY if confidence == 0.70", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 0.70 });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW RETRY if confidence > 0.70", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 0.95 });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should BLOCK REMINDER if confidence < 0.60", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "REMINDER",
        confidence: 0.55,
      });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 3 ENFORCED");
    });

    test("should ALLOW REMINDER if confidence == 0.60", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "REMINDER",
        confidence: 0.60,
      });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("RULE 4: Only explicitly allowed actions can execute", () => {
    test("should ALLOW RETRY action", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ recommendedAction: "RETRY" });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW REMINDER action", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "REMINDER",
        confidence: 0.65,
      });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW ALTERNATE_METHOD action", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "ALTERNATE_METHOD",
        confidence: 0.75,
      });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should BLOCK NO_ACTION", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ recommendedAction: "NO_ACTION" });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow(GuardrailRejectionError);
    });

    test("should BLOCK HUMAN_REVIEW recommendation action", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "HUMAN_REVIEW",
      });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow(GuardrailRejectionError);
    });

    test("should BLOCK invalid action types", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "INVALID_ACTION" as any,
      });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 4 ENFORCED");
    });
  });

  describe("RULE 5: Duplicate transactions/actions must be prevented", () => {
    test("should BLOCK duplicate RETRY attempts", async () => {
      const transaction = createMockTransaction({ retryCount: 1 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ recommendedAction: "RETRY" });

      await expect(
        guardrails.validateRecommendation(
          recommendation,
          transaction,
          customer,
          1,
          1,
          1 // previousAttempts = 1
        )
      ).rejects.toThrow("RULE 5 ENFORCED");
    });

    test("should ALLOW first RETRY attempt", async () => {
      const transaction = createMockTransaction({ retryCount: 0 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ recommendedAction: "RETRY" });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1,
        0 // previousAttempts = 0
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW duplicate REMINDER attempts", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        recommendedAction: "REMINDER",
        confidence: 0.65,
      });

      // Duplicate reminders are allowed
      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1,
        2 // previousAttempts = 2
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("RULE 6: High-value transactions require HUMAN_REVIEW", () => {
    test("should BLOCK transactions > ₹50,000", async () => {
      const transaction = createMockTransaction({ amount: 5_000_001 }); // ₹50,000.01
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");
    });

    test("should BLOCK transactions == ₹50,000 for RETRY", async () => {
      const transaction = createMockTransaction({ amount: 5_000_000 }); // Exactly ₹50,000
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ recommendedAction: "RETRY" });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");
    });

    test("should ALLOW transactions < ₹50,000", async () => {
      const transaction = createMockTransaction({ amount: 4_999_999 }); // ₹49,999.99
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("RULE 7: Invalid AI recommendations must be BLOCKED", () => {
    test("should BLOCK NOT_RECOVERABLE classification", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        classification: "NOT_RECOVERABLE",
      });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 1 ENFORCED");
    });

    test("should BLOCK missing classification", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();
      (recommendation as any).classification = undefined;

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("INVALID_RECOMMENDATION");
    });

    test("should BLOCK invalid confidence (< 0)", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: -0.1 });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("INVALID_RECOMMENDATION");
    });

    test("should BLOCK invalid confidence (> 1)", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 1.1 });

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("INVALID_RECOMMENDATION");
    });

    test("should ACCEPT confidence == 0", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        confidence: 0,
        recommendedAction: "REMINDER",
      });

      // Even 0 confidence is valid, but will be rejected for RETRY
      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 3 ENFORCED");
    });

    test("should ACCEPT confidence == 1", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 1.0 });

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("RULE 8: Transaction must not receive unlimited recovery attempts", () => {
    test("should BLOCK 3rd retry attempt", async () => {
      const transaction = createMockTransaction({ retryCount: 3 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 3, 1)
      ).rejects.toThrow("RULE 8 ENFORCED");
    });

    test("should ALLOW 1st retry attempt", async () => {
      const transaction = createMockTransaction({ retryCount: 0 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW 2nd retry attempt", async () => {
      const transaction = createMockTransaction({ retryCount: 1 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        1,
        1
      );

      expect(result.approved).toBe(true);
    });

    test("should ALLOW 3rd retry attempt (boundary)", async () => {
      const transaction = createMockTransaction({ retryCount: 2 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        2,
        1
      );

      expect(result.approved).toBe(true);
    });
  });

  describe("Deterministic nature of guardrails", () => {
    test("should produce consistent results for same input", async () => {
      const transaction = createMockTransaction();
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation();

      const result1 = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      const result2 = await guardrails.validateRecommendation(
        recommendation,
        transaction,
        customer,
        0,
        1
      );

      expect(result1.approved).toBe(result2.approved);
      expect(result1.policy).toBe(result2.policy);
    });

    test("should NOT be affected by LLM confidence variations", async () => {
      const transaction = createMockTransaction({ amount: 1_000_000 }); // ₹10,000
      const customer = createMockCustomer();

      // Same transaction, same amount, different confidence
      const rec1 = createMockRecommendation({ confidence: 0.95 });
      const rec2 = createMockRecommendation({ confidence: 0.99 });

      const result1 = await guardrails.validateRecommendation(
        rec1,
        transaction,
        customer,
        0,
        1
      );

      const result2 = await guardrails.validateRecommendation(
        rec2,
        transaction,
        customer,
        0,
        1
      );

      // Both should approve (both >= 0.70)
      expect(result1.approved).toBe(true);
      expect(result2.approved).toBe(true);
    });

    test("should apply same rules regardless of customer history", async () => {
      const transaction = createMockTransaction({ amount: 5_000_000 }); // ₹50,000
      const customer1 = createMockCustomer({
        successfulPaymentCount: 100,
        totalTransactions: 100,
      });
      const customer2 = createMockCustomer({
        successfulPaymentCount: 1,
        totalTransactions: 10,
      });
      const recommendation = createMockRecommendation();

      // Both customers should get same result: HIGH_VALUE blocked
      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer1, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");

      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer2, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");
    });
  });

  describe("LLM cannot bypass guardrails", () => {
    test("should BLOCK even if LLM returns perfect recommendation for high-value txn", async () => {
      const transaction = createMockTransaction({ amount: 5_000_000 }); // ₹50,000
      const customer = createMockCustomer({
        successfulPaymentCount: 100,
        totalTransactions: 100,
      });
      const recommendation = createMockRecommendation({
        classification: "RECOVERABLE",
        confidence: 0.99, // Highest possible
        reason: "Customer is perfect, amount is routine",
      });

      // Should still BLOCK due to amount limit
      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 6 ENFORCED");
    });

    test("should BLOCK even with high confidence if already retried 3 times", async () => {
      const transaction = createMockTransaction({ retryCount: 3 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({ confidence: 0.99 });

      // Should still BLOCK due to retry limit
      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 3, 1)
      ).rejects.toThrow("RULE 8 ENFORCED");
    });

    test("should BLOCK if LLM says NOT_RECOVERABLE", async () => {
      const transaction = createMockTransaction({ amount: 100_000 });
      const customer = createMockCustomer();
      const recommendation = createMockRecommendation({
        classification: "NOT_RECOVERABLE",
      });

      // Should BLOCK - no override possible
      await expect(
        guardrails.validateRecommendation(recommendation, transaction, customer, 0, 1)
      ).rejects.toThrow("RULE 1 ENFORCED");
    });
  });
});
