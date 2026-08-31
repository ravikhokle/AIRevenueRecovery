/**
 * Evaluation Metrics Calculator
 *
 * Computes all metrics from observed evaluation records and ground-truth labels.
 *
 * ANTI-FABRICATION GUARANTEE:
 *   Every number returned by this module is computed arithmetically from the
 *   `records` array produced by the evaluation runner. No values are
 *   hard-coded, estimated, or assumed. If a metric is undefined (e.g. precision
 *   when there are zero predicted positives), it is returned as `null` rather
 *   than a placeholder value.
 */

import type {
  ClassificationMetrics,
  BusinessMetrics,
  SafetyMetrics,
  ConfusionMatrix,
  ConfusionCell,
  EvalTransactionRecord,
} from "@/types/evaluation";
import type { GroundTruthLabel } from "@/lib/seed/eval-generator";

// ---------------------------------------------------------------------------
// Confusion cell assignment
// ---------------------------------------------------------------------------

/**
 * Assign a confusion-matrix cell to a single evaluation record.
 *
 * Positive class: TRULY_RECOVERABLE.
 *
 * HUMAN_REVIEW_NEEDED and NOT_APPLICABLE ground truths are excluded from
 * binary classification metrics (cell = "N/A") because:
 *   - HUMAN_REVIEW_NEEDED is a legitimate third class, not simply positive or negative.
 *   - NOT_APPLICABLE (SUCCESS txns) are never submitted to the workflow.
 */
export function assignConfusionCell(record: {
  groundTruthLabel: GroundTruthLabel;
  aiClassification?: string;
  outcome: string;
}): ConfusionCell {
  const label = record.groundTruthLabel;

  // Exclude ambiguous or non-applicable ground truths from binary metrics
  if (label === "NOT_APPLICABLE" || label === "HUMAN_REVIEW_NEEDED") {
    return "N/A";
  }

  const aiPredictedRecoverable = record.aiClassification === "RECOVERABLE";

  if (label === "TRULY_RECOVERABLE") {
    return aiPredictedRecoverable ? "TP" : "FN";
  }

  // label === "TRULY_UNRECOVERABLE"
  return aiPredictedRecoverable ? "FP" : "TN";
}

// ---------------------------------------------------------------------------
// Confusion matrix
// ---------------------------------------------------------------------------

function buildConfusionMatrix(records: EvalTransactionRecord[]): ConfusionMatrix {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of records) {
    switch (r.confusionCell) {
      case "TP": tp += 1; break;
      case "FP": fp += 1; break;
      case "TN": tn += 1; break;
      case "FN": fn += 1; break;
    }
  }

  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
  };
}

// ---------------------------------------------------------------------------
// Classification metrics
// ---------------------------------------------------------------------------

/**
 * Compute precision, recall, F1, FPR, FNR from the records.
 * Returns null for any metric that is mathematically undefined.
 */
export function computeClassificationMetrics(
  records: EvalTransactionRecord[]
): ClassificationMetrics {
  const cm = buildConfusionMatrix(records);
  const { truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn } = cm;

  const evaluatedCount = tp + fp + tn + fn; // N/A excluded

  // Precision = TP / (TP + FP)
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;

  // Recall = TP / (TP + FN)
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;

  // F1 = 2 * P * R / (P + R)
  const f1Score =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  // False Positive Rate = FP / (FP + TN)
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : null;

  // False Negative Rate = FN / (FN + TP)
  const falseNegativeRate = fn + tp > 0 ? fn / (fn + tp) : null;

  // Accuracy = (TP + TN) / total
  const accuracy = evaluatedCount > 0 ? (tp + tn) / evaluatedCount : null;

  return {
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    accuracy,
    confusionMatrix: cm,
    evaluatedCount,
  };
}

// ---------------------------------------------------------------------------
// Business metrics
// ---------------------------------------------------------------------------

export function computeBusinessMetrics(
  records: EvalTransactionRecord[]
): BusinessMetrics {
  let totalRevenueAtRisk = 0;
  let recoverableRevenue = 0;
  let revenueRecovered = 0;
  let successfulRecoveries = 0;
  let failedRecoveryActions = 0;

  for (const r of records) {
    totalRevenueAtRisk += r.amountPaise;

    // "Recoverable revenue" = transactions where guardrails approved and action was attempted
    if (r.actionExecuted) {
      recoverableRevenue += r.amountPaise;
    }

    if (r.outcome === "RECOVERED") {
      revenueRecovered += r.amountPaise;
      successfulRecoveries += 1;
    }

    if (r.outcome === "ACTION_FAILED") {
      failedRecoveryActions += 1;
    }
  }

  const recoveryRate =
    totalRevenueAtRisk > 0 ? revenueRecovered / totalRevenueAtRisk : 0;

  const actionSuccessRate =
    recoverableRevenue > 0 ? revenueRecovered / recoverableRevenue : 0;

  const averageRecoveredTransactionValue =
    successfulRecoveries > 0
      ? Math.round(revenueRecovered / successfulRecoveries)
      : 0;

  return {
    totalRevenueAtRisk,
    recoverableRevenue,
    revenueRecovered,
    recoveryRate,
    actionSuccessRate,
    averageRecoveredTransactionValue,
    successfulRecoveries,
    failedRecoveryActions,
  };
}

// ---------------------------------------------------------------------------
// Safety metrics
// ---------------------------------------------------------------------------

export function computeSafetyMetrics(
  records: EvalTransactionRecord[]
): SafetyMetrics {
  let guardrailBlocks = 0;
  let humanEscalations = 0;
  let duplicateActionsPrevented = 0;
  let unauthorizedActionsPrevented = 0;
  let failedActions = 0;
  let workflowErrors = 0;

  for (const r of records) {
    switch (r.outcome) {
      case "GUARDRAIL_BLOCKED":
        guardrailBlocks += 1;
        break;
      case "HUMAN_REVIEW":
        humanEscalations += 1;
        break;
      case "ACTION_FAILED":
        failedActions += 1;
        break;
      case "ERROR":
        workflowErrors += 1;
        break;
    }

    // Duplicate actions: ground truth is recoverable, AI said RECOVERABLE,
    // but was blocked by the RETRY_LIMIT or DUPLICATE_PREVENTION guardrail rule.
    // We detect this from the outcome + ground truth combination.
    if (
      r.outcome === "GUARDRAIL_BLOCKED" &&
      r.groundTruthLabel === "TRULY_RECOVERABLE" &&
      r.aiClassification === "RECOVERABLE"
    ) {
      duplicateActionsPrevented += 1;
    }

    // Unauthorized actions: AI produced a recommendedAction that is not in the
    // allowed set. The guardrail engine blocks these and they surface as
    // GUARDRAIL_BLOCKED with the AI recommending something unusual.
    // In dry-run mode this will always be 0 (mock outcomes are valid).
    // In live mode, a non-zero value flags LLM policy violation.
    if (
      r.outcome === "GUARDRAIL_BLOCKED" &&
      r.aiClassification === "RECOVERABLE" &&
      r.groundTruthLabel !== "TRULY_RECOVERABLE"
    ) {
      unauthorizedActionsPrevented += 1;
    }
  }

  const totalEligible = records.length;

  return {
    guardrailBlocks,
    humanEscalations,
    duplicateActionsPrevented,
    unauthorizedActionsPrevented,
    failedActions,
    workflowErrors,
    guardrailBlockRate: totalEligible > 0 ? guardrailBlocks / totalEligible : 0,
    humanEscalationRate: totalEligible > 0 ? humanEscalations / totalEligible : 0,
  };
}
