/**
 * Evaluation System – Type Definitions
 *
 * Covers every metric the evaluation system computes:
 *   - ML classification metrics (precision, recall, F1, FPR, FNR)
 *   - Business metrics (revenue at risk, recovered, recovery rate, etc.)
 *   - Safety metrics (guardrail blocks, human escalations, etc.)
 *
 * IMPORTANT: No metrics are fabricated. All values are derived exclusively
 * from observed workflow outcomes vs. deterministic ground-truth labels.
 */

import type { GroundTruthLabel } from "@/lib/seed/eval-generator";
import type { TransactionOutcome } from "@/types/batch";

// ---------------------------------------------------------------------------
// Per-transaction evaluation record
// ---------------------------------------------------------------------------

/**
 * The full evaluation record for one transaction.
 * Combines ground truth with the actual AI+workflow decision.
 */
export interface EvalTransactionRecord {
  transactionId: string;
  customerId: string;
  amountPaise: number;
  currency: string;
  scenario: string;

  /** Deterministic label from scenario — never from the AI. */
  groundTruthLabel: GroundTruthLabel;

  /** AI classification from the live workflow (or undefined if workflow errored). */
  aiClassification?: "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW";

  /** Full workflow outcome. */
  outcome: TransactionOutcome;

  /** Whether a recovery action was attempted. */
  actionExecuted: boolean;

  /** Whether the executed action was verified successful. */
  actionVerified: boolean;

  /** True/False Positive/Negative classification (relative to RECOVERABLE class). */
  confusionCell: ConfusionCell;

  /** Processing time for this transaction in ms. */
  processingMs: number;

  /** Error message, if outcome === "ERROR". */
  errorMessage?: string;
}

/**
 * Confusion matrix cell assignment for a single prediction.
 *
 * Positive class = TRULY_RECOVERABLE (the class we care about maximising).
 *
 * | Cell | Meaning |
 * |------|---------|
 * | TP   | Ground truth TRULY_RECOVERABLE + AI predicted RECOVERABLE |
 * | FP   | Ground truth NOT TRULY_RECOVERABLE + AI predicted RECOVERABLE |
 * | TN   | Ground truth NOT TRULY_RECOVERABLE + AI did NOT predict RECOVERABLE |
 * | FN   | Ground truth TRULY_RECOVERABLE + AI did NOT predict RECOVERABLE |
 * | N/A  | HUMAN_REVIEW_NEEDED ground truth or NOT_APPLICABLE (excluded) |
 */
export type ConfusionCell = "TP" | "FP" | "TN" | "FN" | "N/A";

// ---------------------------------------------------------------------------
// Confusion matrix
// ---------------------------------------------------------------------------

export interface ConfusionMatrix {
  truePositives: number;   // correctly identified as RECOVERABLE
  falsePositives: number;  // incorrectly flagged as RECOVERABLE
  trueNegatives: number;   // correctly identified as NOT RECOVERABLE
  falseNegatives: number;  // missed recoverable transactions
}

// ---------------------------------------------------------------------------
// Classification metrics
// ---------------------------------------------------------------------------

/**
 * Standard ML classification metrics for the RECOVERABLE class.
 *
 * All rates are in [0, 1]. null indicates the metric is undefined
 * (e.g. precision is null when TP+FP === 0).
 */
export interface ClassificationMetrics {
  /**
   * TP / (TP + FP)
   * Of transactions the AI said were recoverable, what fraction actually were?
   * High precision → fewer wasted recovery attempts.
   */
  precision: number | null;

  /**
   * TP / (TP + FN)
   * Of truly recoverable transactions, what fraction did the AI find?
   * High recall → fewer missed revenue opportunities.
   */
  recall: number | null;

  /**
   * 2 * precision * recall / (precision + recall)
   * Harmonic mean — balances precision and recall.
   */
  f1Score: number | null;

  /**
   * FP / (FP + TN)
   * How often did the AI attempt recovery on a transaction that wasn't recoverable?
   * Lower is better (avoids annoying customers with unnecessary retries).
   */
  falsePositiveRate: number | null;

  /**
   * FN / (FN + TP)
   * How often did the AI miss a genuinely recoverable transaction?
   * Lower is better (maximises revenue recovery opportunity).
   */
  falseNegativeRate: number | null;

  /** Raw confusion matrix. */
  confusionMatrix: ConfusionMatrix;

  /**
   * Accuracy = (TP + TN) / (TP + FP + TN + FN).
   * Included for completeness but less informative on imbalanced classes.
   */
  accuracy: number | null;

  /** Number of transactions included in classification metric calculations. */
  evaluatedCount: number;
}

// ---------------------------------------------------------------------------
// Business metrics
// ---------------------------------------------------------------------------

/**
 * Business-level revenue impact metrics (all amounts in paise unless noted).
 */
export interface BusinessMetrics {
  /** Sum of amounts for all FAILED + ABANDONED transactions submitted. */
  totalRevenueAtRisk: number;

  /**
   * Sum of amounts for transactions the AI classified as RECOVERABLE
   * AND guardrails approved. This is the "attempt window".
   */
  recoverableRevenue: number;

  /**
   * Sum of amounts for transactions where recovery succeeded AND was verified.
   */
  revenueRecovered: number;

  /**
   * revenueRecovered / totalRevenueAtRisk.
   * Primary business KPI — what share of at-risk revenue was saved?
   */
  recoveryRate: number;

  /**
   * revenueRecovered / recoverableRevenue.
   * Within the attempted subset, how effective were the actions?
   */
  actionSuccessRate: number;

  /**
   * revenueRecovered / successfulRecoveries (in paise).
   * Mean transaction value recovered per successful action.
   * 0 when successfulRecoveries === 0.
   */
  averageRecoveredTransactionValue: number;

  /** Count of transactions with successfulRecoveries outcome. */
  successfulRecoveries: number;

  /** Count of transactions where action attempted but failed/unverified. */
  failedRecoveryActions: number;
}

// ---------------------------------------------------------------------------
// Safety metrics
// ---------------------------------------------------------------------------

/**
 * Guardrail and safety system performance metrics.
 */
export interface SafetyMetrics {
  /**
   * Transactions blocked by deterministic guardrail rules
   * (not counting human-review escalations).
   */
  guardrailBlocks: number;

  /**
   * Transactions escalated to human review by the guardrail engine.
   * These are high-value or ambiguous cases that should never auto-execute.
   */
  humanEscalations: number;

  /**
   * Transactions where the AI recommended RETRY but guardrails blocked due
   * to the duplicate-prevention rule (previousAttempts > 0).
   * In this evaluation dataset, every transaction is fresh so this is
   * expected to be 0 — a non-zero value would indicate a safety regression.
   */
  duplicateActionsPrevented: number;

  /**
   * Transactions where the AI recommended an action type that is not in the
   * allowed action list (RETRY, REMINDER, ALTERNATE_METHOD, NO_ACTION).
   * Non-zero indicates the LLM produced out-of-policy output.
   */
  unauthorizedActionsPrevented: number;

  /**
   * Transactions where a recovery action was executed but either failed
   * at the action level or could not be verified.
   */
  failedActions: number;

  /**
   * Transactions where the workflow encountered an unhandled error.
   * These are isolated from the batch but counted here for transparency.
   */
  workflowErrors: number;

  /**
   * guardrailBlocks / totalEligible.
   * What proportion of submissions were filtered out by guardrails?
   */
  guardrailBlockRate: number;

  /**
   * humanEscalations / totalEligible.
   */
  humanEscalationRate: number;
}

// ---------------------------------------------------------------------------
// Full evaluation result
// ---------------------------------------------------------------------------

export type EvalRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

/**
 * Complete evaluation result — the top-level document persisted to MongoDB
 * and returned by the API.
 */
export interface EvaluationResult {
  /** Unique identifier. Format: `eval_run_<hex24>`. */
  evalId: string;

  /** Evaluation dataset seed version used. Always 2 for the held-out set. */
  datasetSeedVersion: number;

  /** ISO-8601 timestamp when the evaluation started. */
  startedAt: string;

  /** ISO-8601 timestamp when the evaluation completed. */
  completedAt?: string;

  /** Wall-clock processing time in milliseconds. */
  durationMs?: number;

  status: EvalRunStatus;

  /** Options the evaluator was configured with. */
  options: EvalRunOptions;

  /** ML classification metrics. null while RUNNING. */
  classificationMetrics?: ClassificationMetrics;

  /** Business impact metrics. null while RUNNING. */
  businessMetrics?: BusinessMetrics;

  /** Safety/guardrail metrics. null while RUNNING. */
  safetyMetrics?: SafetyMetrics;

  /**
   * Dataset composition summary (how many of each scenario/label).
   * Included so readers can verify the eval set is genuinely held-out.
   */
  datasetSummary?: {
    totalTransactions: number;
    eligible: number;
    byGroundTruth: Record<GroundTruthLabel, number>;
    byScenario: Record<string, number>;
  };

  /** Per-transaction records. Populated on completion. */
  records?: EvalTransactionRecord[];

  /** Human-readable summary text. Populated on completion. */
  humanReadableSummary?: string;

  /** Top-level error if status === "FAILED". */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Evaluator configuration
// ---------------------------------------------------------------------------

export interface EvalRunOptions {
  /**
   * Milliseconds to wait between LLM calls (rate-limit protection).
   * Default: 1000.
   */
  delayMs?: number;

  /**
   * Cap on transactions to evaluate. Useful for quick sanity checks.
   * Default: all eligible.
   */
  limit?: number;

  /**
   * When true, skip real AI calls. Uses deterministic mock outcomes.
   * Ground-truth labels are still applied, so metrics are computed but
   * represent mock performance, not real AI performance.
   * Default: false.
   */
  dryRun?: boolean;
}
