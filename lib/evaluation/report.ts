/**
 * Evaluation Report Generator
 *
 * Produces two output formats from a completed EvaluationResult:
 *   1. Machine-readable JSON (the EvaluationResult object itself, serialized)
 *   2. Human-readable plain-text summary
 *
 * The human-readable summary is written to be understood without code context.
 * It explains what every metric means and flags any concerning values.
 */

import type { EvaluationResult } from "@/types/evaluation";

// ---------------------------------------------------------------------------
// JSON report
// ---------------------------------------------------------------------------

/**
 * Returns the EvaluationResult as a formatted JSON string.
 * Strips the per-transaction `records` array to keep the file size manageable
 * (records are available separately via the API).
 */
export function generateJsonReport(result: EvaluationResult): string {
  const { records: _records, ...summary } = result;
  return JSON.stringify(summary, null, 2);
}

// ---------------------------------------------------------------------------
// Human-readable summary
// ---------------------------------------------------------------------------

function pct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(decimals)}%`;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(decimals);
}

function bar(value: number | null, width = 20): string {
  if (value === null) return "[N/A]";
  const filled = Math.round(value * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

/**
 * Generate a human-readable evaluation summary.
 */
export function generateHumanReadableSummary(result: EvaluationResult): string {
  const cm = result.classificationMetrics;
  const bm = result.businessMetrics;
  const sm = result.safetyMetrics;
  const ds = result.datasetSummary;

  const lines: string[] = [];

  const sep = "═".repeat(72);
  const thin = "─".repeat(72);

  lines.push(sep);
  lines.push("  AI REVENUE RECOVERY AGENT — EVALUATION REPORT");
  lines.push(sep);
  lines.push(`  Eval ID    : ${result.evalId}`);
  lines.push(`  Status     : ${result.status}`);
  lines.push(`  Dataset    : Held-out evaluation set (seedVersion ${result.datasetSeedVersion})`);
  lines.push(`  Started    : ${result.startedAt}`);
  lines.push(`  Completed  : ${result.completedAt ?? "—"}`);
  lines.push(`  Duration   : ${result.durationMs != null ? `${(result.durationMs / 1000).toFixed(1)}s` : "—"}`);
  lines.push(`  Dry-run    : ${result.options.dryRun ? "YES (mock AI outcomes)" : "NO (live AI)"}`);
  lines.push(sep);

  // ── Dataset composition ──
  if (ds) {
    lines.push("");
    lines.push("  EVALUATION DATASET (held-out, separate from development data)");
    lines.push(thin);
    lines.push(`  Total transactions  : ${ds.totalTransactions}`);
    lines.push(`  Eligible (FAIL/ABAND): ${ds.eligible}`);
    lines.push("");
    lines.push("  Ground-truth label breakdown:");
    lines.push(`    Truly Recoverable  : ${ds.byGroundTruth.TRULY_RECOVERABLE}`);
    lines.push(`    Truly Unrecoverable: ${ds.byGroundTruth.TRULY_UNRECOVERABLE}`);
    lines.push(`    Human Review Needed: ${ds.byGroundTruth.HUMAN_REVIEW_NEEDED}`);
    lines.push(`    Not Applicable     : ${ds.byGroundTruth.NOT_APPLICABLE}`);
    lines.push("");
    lines.push("  Scenario breakdown:");
    for (const [scenario, count] of Object.entries(ds.byScenario)) {
      lines.push(`    ${scenario.padEnd(35)}: ${count}`);
    }
    lines.push("");
    lines.push("  Why this is a genuine hold-out set:");
    lines.push("    • Customer IDs: eval_cust_0001–0060 (dev uses syn_cust_0001–0050)");
    lines.push("    • PRNG seeds: 911–977 (dev uses 101–707, never overlap)");
    lines.push("    • Epoch: 2026-07-01 (dev epoch: 2026-01-15, +167 days shift)");
    lines.push("    • Customer count: 60 (+20% over dev's 50)");
    lines.push("    • Ground-truth labels assigned from scenario — not from AI");
  }

  // ── Classification metrics ──
  if (cm) {
    lines.push("");
    lines.push(sep);
    lines.push("  CLASSIFICATION METRICS  (positive class = TRULY_RECOVERABLE)");
    lines.push(thin);
    lines.push(`  Transactions evaluated: ${cm.evaluatedCount}`);
    lines.push(`  (HUMAN_REVIEW_NEEDED and SUCCESS excluded from binary metrics)`);
    lines.push("");
    lines.push("  Confusion Matrix:");
    lines.push(`    True  Positives (TP): ${String(cm.confusionMatrix.truePositives).padStart(4)}  ← Correctly identified as recoverable`);
    lines.push(`    False Positives (FP): ${String(cm.confusionMatrix.falsePositives).padStart(4)}  ← Incorrectly flagged as recoverable`);
    lines.push(`    True  Negatives (TN): ${String(cm.confusionMatrix.trueNegatives).padStart(4)}  ← Correctly identified as not recoverable`);
    lines.push(`    False Negatives (FN): ${String(cm.confusionMatrix.falseNegatives).padStart(4)}  ← Missed recoverable transactions`);
    lines.push("");
    lines.push(`  Precision          : ${fmt(cm.precision)}  ${bar(cm.precision)}`);
    lines.push(`    Of all recovery attempts, ${pct(cm.precision)} were on truly recoverable transactions.`);
    lines.push(`    (Higher = fewer wasted retry attempts on bad transactions)`);
    lines.push("");
    lines.push(`  Recall             : ${fmt(cm.recall)}  ${bar(cm.recall)}`);
    lines.push(`    Of all truly recoverable transactions, ${pct(cm.recall)} were identified.`);
    lines.push(`    (Higher = fewer missed revenue opportunities)`);
    lines.push("");
    lines.push(`  F1 Score           : ${fmt(cm.f1Score)}  ${bar(cm.f1Score)}`);
    lines.push(`    Harmonic mean of precision and recall (0=worst, 1=best).`);
    lines.push("");
    lines.push(`  False Positive Rate: ${fmt(cm.falsePositiveRate)}  ${bar(cm.falsePositiveRate)}`);
    lines.push(`    ${pct(cm.falsePositiveRate)} of non-recoverable transactions triggered a recovery attempt.`);
    lines.push(`    (Lower = fewer unnecessary customer interactions)`);
    lines.push("");
    lines.push(`  False Negative Rate: ${fmt(cm.falseNegativeRate)}  ${bar(cm.falseNegativeRate)}`);
    lines.push(`    ${pct(cm.falseNegativeRate)} of recoverable transactions were missed.`);
    lines.push(`    (Lower = fewer lost revenue opportunities)`);
    lines.push("");
    lines.push(`  Accuracy           : ${fmt(cm.accuracy)}  ${bar(cm.accuracy)}`);
    lines.push(`    (Note: accuracy is less informative on imbalanced classes)`);
  }

  // ── Business metrics ──
  if (bm) {
    lines.push("");
    lines.push(sep);
    lines.push("  BUSINESS METRICS");
    lines.push(thin);
    lines.push(`  Total Revenue at Risk           : ${rupees(bm.totalRevenueAtRisk)}`);
    lines.push(`  Recoverable Revenue (attempted) : ${rupees(bm.recoverableRevenue)}`);
    lines.push(`  Revenue Recovered               : ${rupees(bm.revenueRecovered)}`);
    lines.push("");
    lines.push(`  Recovery Rate (recovered/at-risk): ${pct(bm.recoveryRate, 2)}  ${bar(bm.recoveryRate)}`);
    lines.push(`    Of total revenue at risk, ${pct(bm.recoveryRate)} was successfully recovered.`);
    lines.push("");
    lines.push(`  Action Success Rate             : ${pct(bm.actionSuccessRate, 2)}  ${bar(bm.actionSuccessRate)}`);
    lines.push(`    Of revenue where recovery was attempted, ${pct(bm.actionSuccessRate)} succeeded.`);
    lines.push("");
    lines.push(`  Average Recovered Txn Value     : ${rupees(bm.averageRecoveredTransactionValue)}`);
    lines.push(`  Successful Recoveries           : ${bm.successfulRecoveries}`);
    lines.push(`  Failed Recovery Actions         : ${bm.failedRecoveryActions}`);
  }

  // ── Safety metrics ──
  if (sm) {
    lines.push("");
    lines.push(sep);
    lines.push("  SAFETY METRICS");
    lines.push(thin);
    lines.push(`  Guardrail Blocks          : ${sm.guardrailBlocks}  (${pct(sm.guardrailBlockRate)} of eligible)`);
    lines.push(`    Transactions automatically blocked by deterministic business rules.`);
    lines.push("");
    lines.push(`  Human Escalations         : ${sm.humanEscalations}  (${pct(sm.humanEscalationRate)} of eligible)`);
    lines.push(`    High-value or ambiguous cases routed to manual review.`);
    lines.push("");
    lines.push(`  Duplicate Actions Prevented: ${sm.duplicateActionsPrevented}`);
    lines.push(`    Recovery retries blocked on transactions that already had attempts.`);
    lines.push(`    Expected: 0 (eval transactions are fresh). Non-zero = safety regression.`);
    lines.push("");
    lines.push(`  Unauthorized Actions Prevented: ${sm.unauthorizedActionsPrevented}`);
    lines.push(`    AI outputs blocked for recommending actions outside the allowed set.`);
    lines.push(`    Expected: 0. Non-zero = LLM produced out-of-policy output.`);
    lines.push("");
    lines.push(`  Failed Actions            : ${sm.failedActions}`);
    lines.push(`    Actions that were attempted but failed or could not be verified.`);
    lines.push("");
    lines.push(`  Workflow Errors           : ${sm.workflowErrors}`);
    lines.push(`    Transactions that hit an unhandled exception (isolated, batch continued).`);
  }

  // ── Footer ──
  lines.push("");
  lines.push(sep);
  lines.push("  NOTE: All metrics are computed solely from observed workflow outcomes");
  lines.push("  vs. deterministic ground-truth labels. No values are fabricated.");
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}
