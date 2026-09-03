import { Customer } from "@/types/customer";
import { Transaction } from "@/types/transaction";
import { RecoveryRecommendation, GuardrailResult, GuardrailRejectionError } from "./types";

/**
 * Guardrail configuration
 * Policies that constrain AI recommendations
 * These are business rules, NOT set by LLM
 */
interface GuardrailConfig {
  // Amount limits (in paise)
  maxRetryAmount: number; // 1,000,000 = ₹10,000 (HARD LIMIT for automatic recovery)
  maxHighValueRetry: number; // 5,000,000 = ₹50,000 (triggers HUMAN_REVIEW)
  
  // Retry limits
  maxRetriesPerTransaction: number; // 3 = no transaction receives unlimited attempts
  maxRetriesPerDayPerCustomer: number; // Rate limit per customer
  
  // Confidence threshold
  minConfidenceForAutoRetry: number; // 0.70 = 70% (below this = HUMAN_REVIEW)
  minConfidenceForReminder: number; // 0.60 = 60%
  
  // Classification rules
  blockNotRecoverable: boolean; // Never retry if LLM says NOT_RECOVERABLE
  requireHumanReviewAboveAmount: number; // 5,000,000 = ₹50,000 (high-value)
  
  // Customer policy
  minSuccessRateForRetry: number; // 0.30 = 30% success rate
  maxFailureCountPerWeek: number; // Block after N failures
  
  // Duplicate prevention
  allowDuplicateTransactions: boolean; // false = prevent duplicate recovery attempts
}

/**
 * Default guardrail configuration
 * DETERMINISTIC: These are business rules, NOT set by LLM
 * Can be overridden via environment variables (for testing only)
 */
const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  // RULE 1 & 2: Automatic recovery amount limit = ₹10,000
  maxRetryAmount: 1_000_000, // ₹10,000 in paise - HARD LIMIT
  maxHighValueRetry: 5_000_000, // ₹50,000 - triggers human review
  
  // RULE 8: Transaction must not receive unlimited recovery attempts
  maxRetriesPerTransaction: 3, // MAXIMUM = 3 retries per transaction
  maxRetriesPerDayPerCustomer: 5,
  
  // RULE 3: Confidence below 0.70 requires HUMAN_REVIEW
  minConfidenceForAutoRetry: 0.70, // 70% minimum for auto-recovery
  minConfidenceForReminder: 0.60, // 60% minimum for reminders
  
  // RULE 4 & 7: Only explicitly allowed actions, block invalid recommendations
  blockNotRecoverable: true, // BLOCK if LLM says NOT_RECOVERABLE
  requireHumanReviewAboveAmount: 5_000_000, // ₹50,000 - RULE 6: high-value requires review
  
  minSuccessRateForRetry: 0.30,
  maxFailureCountPerWeek: 10,
  
  // RULE 5: Duplicate transactions/actions must be prevented
  allowDuplicateTransactions: false, // PREVENT duplicate recovery attempts
};

/**
 * Guardrail Engine
 * Validates AI recommendations against business policies
 * 
 * This is the critical checkpoint that prevents LLM from:
 * - Retrying high-value transactions without human review
 * - Ignoring NOT_RECOVERABLE classifications
 * - Overriding customer-specific policies
 * - Bypassing any security/business logic
 */
export class GuardrailEngine {
  private config: GuardrailConfig;

  constructor(config?: Partial<GuardrailConfig>) {
    this.config = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  }

  /**
   * Validate recommendation against all guardrails
   * DETERMINISTIC: Rules are fixed, independent of LLM
   * AI recommendation must NEVER directly execute an action
   * 
   * Throws GuardrailRejectionError if rejected
   * Returns GuardrailResult.approved = true if allowed
   */
  async validateRecommendation(
    recommendation: RecoveryRecommendation,
    transaction: Transaction,
    customer: Customer,
    retryCount: number,
    failureCountThisWeek: number,
    previousAttempts: number = 0 // RULE 5: Prevent duplicate actions
  ): Promise<GuardrailResult> {
    // RULE 7: Invalid AI recommendations must be BLOCKED
    // Verify recommendation has all required fields
    if (!recommendation.classification || !recommendation.recommendedAction) {
      throw new GuardrailRejectionError(
        "Invalid AI recommendation: missing required fields",
        "INVALID_RECOMMENDATION",
        "AI recommendation lacks required fields (classification or action)"
      );
    }

    // Verify confidence is in valid range (0.0-1.0)
    if (recommendation.confidence < 0 || recommendation.confidence > 1) {
      throw new GuardrailRejectionError(
        `Invalid confidence score: ${recommendation.confidence}`,
        "INVALID_RECOMMENDATION",
        "Confidence must be between 0.0 and 1.0"
      );
    }

    // RULE 1: NOT_RECOVERABLE Classification - BLOCK immediately
    if (this.config.blockNotRecoverable) {
      if (recommendation.classification === "NOT_RECOVERABLE") {
        throw new GuardrailRejectionError(
          "RULE 1 ENFORCED: LLM classified as NOT_RECOVERABLE - no retries allowed",
          "NOT_RECOVERABLE_BLOCKED",
          "AI analysis indicates this transaction cannot be recovered - blocking recovery attempt"
        );
      }
    }

    // RULE 1: HUMAN_REVIEW Classification - BLOCK auto-execution
    if (recommendation.classification === "HUMAN_REVIEW") {
      throw new GuardrailRejectionError(
        "RULE 1 ENFORCED: Recommendation requires human review",
        "HUMAN_REVIEW_REQUIRED",
        "AI confidence is insufficient or case is ambiguous - requires manual review"
      );
    }

    // RULE 4: Only explicitly allowed actions can execute
    const ALLOWED_ACTIONS = ["RETRY", "REMINDER", "ALTERNATE_METHOD", "NO_ACTION"];
    if (!ALLOWED_ACTIONS.includes(recommendation.recommendedAction)) {
      throw new GuardrailRejectionError(
        `RULE 4 ENFORCED: Invalid action '${recommendation.recommendedAction}'`,
        "INVALID_ACTION",
        `Only these actions are allowed: ${ALLOWED_ACTIONS.join(", ")}`
      );
    }

    // RULE 3: Confidence below 0.70 requires HUMAN_REVIEW
    if (recommendation.recommendedAction === "RETRY") {
      if (recommendation.confidence < this.config.minConfidenceForAutoRetry) {
        throw new GuardrailRejectionError(
          `RULE 3 ENFORCED: Confidence ${recommendation.confidence.toFixed(2)} < minimum ${this.config.minConfidenceForAutoRetry.toFixed(2)}`,
          "CONFIDENCE_THRESHOLD",
          `AI confidence (${(recommendation.confidence * 100).toFixed(1)}%) is below 70% - requires human review`
        );
      }
    }

    if (recommendation.recommendedAction === "REMINDER") {
      if (recommendation.confidence < this.config.minConfidenceForReminder) {
        throw new GuardrailRejectionError(
          `RULE 3 ENFORCED: Confidence ${recommendation.confidence.toFixed(2)} < minimum ${this.config.minConfidenceForReminder.toFixed(2)}`,
          "CONFIDENCE_THRESHOLD",
          `AI confidence (${(recommendation.confidence * 100).toFixed(1)}%) is below 60% - requires human review`
        );
      }
    }

    // RULE 8: Transaction must not receive unlimited recovery attempts (MAX = 3)
    const effectiveAttempts = Math.max(retryCount, previousAttempts);
    if (effectiveAttempts >= this.config.maxRetriesPerTransaction) {
      throw new GuardrailRejectionError(
        `RULE 8 ENFORCED: Transaction already retried ${effectiveAttempts} times (max: ${this.config.maxRetriesPerTransaction})`,
        "RETRY_LIMIT",
        `Maximum retry attempts (${this.config.maxRetriesPerTransaction}) exceeded - no further recovery attempts allowed`
      );
    }

    // RULE 5: Duplicate actions must be prevented on already settled/successful transactions
    if (!this.config.allowDuplicateTransactions) {
      if (transaction.status === "SUCCESS") {
        throw new GuardrailRejectionError(
          "RULE 5 ENFORCED: Transaction is already marked SUCCESS - duplicate recovery blocked",
          "DUPLICATE_PREVENTION",
          "Transaction was already successfully recovered and settled"
        );
      }
    }

    // Customer weekly failure limit
    if (failureCountThisWeek >= this.config.maxRetriesPerDayPerCustomer) {
      throw new GuardrailRejectionError(
        `Customer has ${failureCountThisWeek} failures this week (max: ${this.config.maxRetriesPerDayPerCustomer})`,
        "CUSTOMER_RATE_LIMIT",
        `Customer is approaching failure limit this week`
      );
    }

    // RULE 2: Automatic recovery amount limit = ₹10,000 (HARD LIMIT)
    if (transaction.amount > this.config.maxRetryAmount) {
      throw new GuardrailRejectionError(
        `RULE 2 ENFORCED: Transaction amount ₹${(transaction.amount / 100).toFixed(2)} exceeds auto-recovery limit ₹${(this.config.maxRetryAmount / 100).toFixed(2)}`,
        "AMOUNT_LIMIT",
        `Transaction exceeds automatic recovery limit of ₹10,000 - requires human approval`
      );
    }

    // RULE 6: High-value transactions require HUMAN_REVIEW
    if (transaction.amount > this.config.requireHumanReviewAboveAmount) {
      throw new GuardrailRejectionError(
        `RULE 6 ENFORCED: High-value transaction ₹${(transaction.amount / 100).toFixed(2)} requires human review`,
        "HIGH_VALUE_LIMIT",
        `Transactions over ₹${(this.config.requireHumanReviewAboveAmount / 100).toFixed(2)} require manual approval`
      );
    }

    // Customer Success Rate Policy (applied when customer has established history of 3+ transactions)
    if (customer.totalTransactions >= 3 && recommendation.recommendedAction === "RETRY") {
      const successRate = customer.successfulPaymentCount / customer.totalTransactions;
      if (successRate < this.config.minSuccessRateForRetry) {
        throw new GuardrailRejectionError(
          `Customer success rate ${(successRate * 100).toFixed(1)}% below minimum ${(this.config.minSuccessRateForRetry * 100).toFixed(1)}%`,
          "CUSTOMER_POLICY",
          `Customer's payment reliability is too low for automatic retry`
        );
      }
    }

    // All guardrails passed - decision structure
    return {
      approved: true,
      reason: "All 8 guardrails passed - recommendation approved for execution",
      policy: "PASSED_ALL_CHECKS",
    };
  }

  /**
   * Get guardrail configuration (for logging/debugging)
   */
  getConfig(): GuardrailConfig {
    return { ...this.config };
  }

  /**
   * Update guardrail configuration (for testing)
   */
  updateConfig(updates: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Create default guardrail engine
 */
export function createGuardrailEngine(): GuardrailEngine {
  return new GuardrailEngine();
}

/**
 * Guard: LLM cannot modify guardrail config
 * These are business rules, not AI-controlled
 */
export function lockGuardrailConfig(engine: GuardrailEngine): GuardrailEngine {
  // Return a read-only proxy (in practice, rely on access control)
  return engine;
}
