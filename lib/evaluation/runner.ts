/**
 * Evaluation Runner
 *
 * Orchestrates a full evaluation run against the held-out evaluation dataset:
 *
 *   For each eligible (FAILED / ABANDONED) transaction in eval dataset:
 *     1. Run the complete recovery workflow (AI → Guardrails → Action → Verify → Audit)
 *     2. Compare the AI decision against the ground-truth label
 *     3. Assign a confusion-matrix cell (TP / FP / TN / FN / N/A)
 *     4. Collect per-transaction metrics
 *
 *   Then aggregate:
 *     - Classification metrics (precision, recall, F1, FPR, FNR)
 *     - Business metrics (revenue at risk, recovered, recovery rate, …)
 *     - Safety metrics (guardrail blocks, escalations, …)
 *
 *   Finally generate both report formats and persist the result to MongoDB.
 *
 * DESIGN:
 *   - Serial (one LLM call at a time) to avoid rate-limit bursting
 *   - Per-transaction try/catch so one error never stops the evaluation
 *   - Dry-run mode for CI / cost-free testing
 *   - Reproducible: eval dataset is always generated from fixed seeds
 *
 * SECURITY: No API keys, tokens, or credentials are stored or logged.
 */

import crypto from "crypto";

import {
  generateEvalDataset,
  labelFromScenario,
  type EvalTransaction,
} from "@/lib/seed/eval-generator";
import { getTransactionsCollection } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";
import { getEvalRunCollection, ensureEvalRunIndexes } from "@/lib/models/evaluation-run";
import { createGuardrailEngine } from "@/lib/workflow/guardrails";
import { createActionExecutor } from "@/lib/workflow/actions";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { createRecoveryWorkflow } from "@/lib/workflow/recovery-workflow";
import type { WorkflowContext } from "@/lib/workflow/types";
import {
  assignConfusionCell,
  computeClassificationMetrics,
  computeBusinessMetrics,
  computeSafetyMetrics,
} from "./metrics";
import { generateHumanReadableSummary } from "./report";
import type {
  EvaluationResult,
  EvalRunOptions,
  EvalTransactionRecord,
} from "@/types/evaluation";
import type { TransactionOutcome } from "@/types/batch";

// ---------------------------------------------------------------------------
// Dry-run: deterministic mock outcomes (cycles, same as BatchProcessor)
// ---------------------------------------------------------------------------

const DRY_RUN_CYCLE: Array<{
  aiClassification: EvalTransactionRecord["aiClassification"];
  outcome: TransactionOutcome;
  actionExecuted: boolean;
  actionVerified: boolean;
}> = [
  { aiClassification: "RECOVERABLE",     outcome: "RECOVERED",         actionExecuted: true,  actionVerified: true  },
  { aiClassification: "RECOVERABLE",     outcome: "RECOVERED",         actionExecuted: true,  actionVerified: true  },
  { aiClassification: "RECOVERABLE",     outcome: "GUARDRAIL_BLOCKED", actionExecuted: false, actionVerified: false },
  { aiClassification: "HUMAN_REVIEW",    outcome: "HUMAN_REVIEW",      actionExecuted: false, actionVerified: false },
  { aiClassification: "NOT_RECOVERABLE", outcome: "NOT_RECOVERABLE",   actionExecuted: false, actionVerified: false },
  { aiClassification: "RECOVERABLE",     outcome: "ACTION_FAILED",     actionExecuted: true,  actionVerified: false },
  { aiClassification: "RECOVERABLE",     outcome: "RECOVERED",         actionExecuted: true,  actionVerified: true  },
];

// ---------------------------------------------------------------------------
// Outcome classifier (mirrors BatchProcessor)
// ---------------------------------------------------------------------------

function classifyOutcome(ctx: WorkflowContext): TransactionOutcome {
  if (ctx.status === "FAILED") return "ERROR";

  if (
    ctx.guardrailResult?.approved === false &&
    (ctx.guardrailResult.policy === "HUMAN_REVIEW_REQUIRED" ||
      ctx.aiRecommendation?.classification === "HUMAN_REVIEW")
  ) {
    return "HUMAN_REVIEW";
  }

  if (ctx.guardrailResult?.approved === false) {
    if (ctx.aiRecommendation?.classification === "NOT_RECOVERABLE") {
      return "NOT_RECOVERABLE";
    }
    return "GUARDRAIL_BLOCKED";
  }

  if (ctx.actionExecution) {
    return ctx.actionVerified ? "RECOVERED" : "ACTION_FAILED";
  }

  if (ctx.aiRecommendation?.classification === "NOT_RECOVERABLE") {
    return "NOT_RECOVERABLE";
  }

  return "ACTION_FAILED";
}

// ---------------------------------------------------------------------------
// EvaluationRunner
// ---------------------------------------------------------------------------

export class EvaluationRunner {
  private readonly delayMs: number;
  private readonly limit: number | undefined;
  private readonly dryRun: boolean;

  constructor(options: EvalRunOptions = {}) {
    this.delayMs = options.delayMs ?? 1000;
    this.limit = options.limit;
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Run the full evaluation and return the persisted EvaluationResult.
   */
  async run(): Promise<EvaluationResult> {
    await ensureEvalRunIndexes();

    const evalId = `eval_run_${crypto.randomBytes(12).toString("hex")}`;
    const startedAt = new Date().toISOString();

    const evalCollection = await getEvalRunCollection();

    // Persist initial RUNNING document
    const runningDoc: EvaluationResult = {
      evalId,
      datasetSeedVersion: 2,
      startedAt,
      status: "RUNNING",
      options: {
        delayMs: this.delayMs,
        limit: this.limit,
        dryRun: this.dryRun,
      },
    };
    await evalCollection.insertOne(
      runningDoc as Parameters<typeof evalCollection.insertOne>[0]
    );

    try {
      const result = await this.evaluate(evalId, startedAt);

      await evalCollection.updateOne(
        { evalId },
        {
          $set: {
            status: "COMPLETED",
            completedAt: result.completedAt,
            durationMs: result.durationMs,
            classificationMetrics: result.classificationMetrics,
            businessMetrics: result.businessMetrics,
            safetyMetrics: result.safetyMetrics,
            datasetSummary: result.datasetSummary,
            humanReadableSummary: result.humanReadableSummary,
            // Omit records from main doc to keep it queryable; stored separately
          },
        }
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const completedAt = new Date().toISOString();

      await evalCollection.updateOne(
        { evalId },
        { $set: { status: "FAILED", completedAt, errorMessage } }
      );

      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Core evaluation loop
  // -------------------------------------------------------------------------

  private async evaluate(
    evalId: string,
    startedAt: string
  ): Promise<EvaluationResult> {
    // ── 1. Generate held-out dataset ──────────────────────────────────────
    const dataset = generateEvalDataset();

    const eligible = dataset.transactions
      .filter((t) => t.status === "FAILED" || t.status === "ABANDONED")
      .sort((a, b) => a.transactionId.localeCompare(b.transactionId));

    const toProcess =
      this.limit !== undefined ? eligible.slice(0, this.limit) : eligible;

    // ── 2. Build workflow dependencies ────────────────────────────────────
    const auditService = this.dryRun ? null : await getAuditTrailService();

    const workflow =
      this.dryRun || !auditService
        ? null
        : createRecoveryWorkflow(
            createGuardrailEngine(),
            createActionExecutor(),
            auditService
          );

    // ── 3. Upsert eval data into DB (skip in dry-run) ─────────────────────
    if (!this.dryRun) {
      await this.upsertEvalData(
        dataset.transactions,
        dataset.customers as any[]
      );
    }

    // ── 4. Process each transaction serially ──────────────────────────────
    const records: EvalTransactionRecord[] = [];
    let index = 0;

    for (const transaction of toProcess) {
      const txStart = Date.now();
      let record: EvalTransactionRecord;

      if (this.dryRun) {
        record = this.buildDryRunRecord(transaction, index, txStart);
      } else {
        record = await this.evaluateOne(transaction, workflow!, txStart);
      }

      records.push(record);
      index += 1;

      console.log(
        `[eval:${evalId}] ${index}/${toProcess.length} ` +
          `txn=${transaction.transactionId} ` +
          `gt=${transaction.groundTruthLabel} ` +
          `ai=${record.aiClassification ?? "N/A"} ` +
          `cell=${record.confusionCell} ` +
          `outcome=${record.outcome}`
      );

      if (!this.dryRun && index < toProcess.length) {
        await this.delay(this.delayMs);
      }
    }

    // ── 5. Aggregate metrics ───────────────────────────────────────────────
    const classificationMetrics = computeClassificationMetrics(records);
    const businessMetrics = computeBusinessMetrics(records);
    const safetyMetrics = computeSafetyMetrics(records);

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();

    const result: EvaluationResult = {
      evalId,
      datasetSeedVersion: 2,
      startedAt,
      completedAt,
      durationMs,
      status: "COMPLETED",
      options: {
        delayMs: this.delayMs,
        limit: this.limit,
        dryRun: this.dryRun,
      },
      classificationMetrics,
      businessMetrics,
      safetyMetrics,
      datasetSummary: {
        totalTransactions: dataset.summary.totalTransactions,
        eligible: dataset.summary.eligible,
        byGroundTruth: dataset.summary.byGroundTruth,
        byScenario: dataset.summary.byScenario,
      },
      records,
    };

    // ── 6. Generate human-readable summary ────────────────────────────────
    result.humanReadableSummary = generateHumanReadableSummary(result);

    return result;
  }

  // -------------------------------------------------------------------------
  // Evaluate a single transaction
  // -------------------------------------------------------------------------

  private async evaluateOne(
    transaction: EvalTransaction,
    workflow: ReturnType<typeof createRecoveryWorkflow>,
    txStart: number
  ): Promise<EvalTransactionRecord> {
    let ctx: WorkflowContext | undefined;

    try {
      ctx = await workflow.executeWorkflow(transaction.transactionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const record: EvalTransactionRecord = {
        transactionId: transaction.transactionId,
        customerId: transaction.customerId,
        amountPaise: transaction.amount,
        currency: transaction.currency,
        scenario: transaction.scenario,
        groundTruthLabel: transaction.groundTruthLabel,
        aiClassification: undefined,
        outcome: "ERROR",
        actionExecuted: false,
        actionVerified: false,
        confusionCell: "N/A",
        processingMs: Date.now() - txStart,
        errorMessage,
      };

      return record;
    }

    const outcome = classifyOutcome(ctx);
    const aiClassification = ctx.aiRecommendation?.classification;

    const draft = {
      groundTruthLabel: transaction.groundTruthLabel,
      aiClassification,
      outcome,
    };

    const confusionCell = assignConfusionCell(draft);

    return {
      transactionId: transaction.transactionId,
      customerId: transaction.customerId,
      amountPaise: transaction.amount,
      currency: transaction.currency,
      scenario: transaction.scenario,
      groundTruthLabel: transaction.groundTruthLabel,
      aiClassification,
      outcome,
      actionExecuted: !!ctx.actionExecution,
      actionVerified: ctx.actionVerified ?? false,
      confusionCell,
      processingMs: Date.now() - txStart,
    };
  }

  // -------------------------------------------------------------------------
  // Dry-run: deterministic mock
  // -------------------------------------------------------------------------

  private buildDryRunRecord(
    transaction: EvalTransaction,
    index: number,
    txStart: number
  ): EvalTransactionRecord {
    const mock = DRY_RUN_CYCLE[index % DRY_RUN_CYCLE.length]!;

    const confusionCell = assignConfusionCell({
      groundTruthLabel: transaction.groundTruthLabel,
      aiClassification: mock.aiClassification,
      outcome: mock.outcome,
    });

    return {
      transactionId: transaction.transactionId,
      customerId: transaction.customerId,
      amountPaise: transaction.amount,
      currency: transaction.currency,
      scenario: transaction.scenario,
      groundTruthLabel: transaction.groundTruthLabel,
      aiClassification: mock.aiClassification,
      outcome: mock.outcome,
      actionExecuted: mock.actionExecuted,
      actionVerified: mock.actionVerified,
      confusionCell,
      processingMs: Date.now() - txStart,
    };
  }

  // -------------------------------------------------------------------------
  // DB helpers
  // -------------------------------------------------------------------------

  private async upsertEvalData(
    transactions: EvalTransaction[],
    customers: any[]
  ): Promise<void> {
    const txCollection = await getTransactionsCollection();
    const custCollection = await getCustomersCollection();

    await Promise.all(
      transactions.map((t) =>
        txCollection.replaceOne(
          { transactionId: t.transactionId },
          t as any,
          { upsert: true }
        )
      )
    );

    await Promise.all(
      customers.map((c) =>
        custCollection.replaceOne(
          { customerId: c.customerId },
          c,
          { upsert: true }
        )
      )
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
