/**
 * Batch Recovery Processor
 *
 * Processes the synthetic transaction dataset one transaction at a time
 * through the complete recovery workflow:
 *
 *   Transaction → AI analysis → Guardrails → Action → Verification → Audit log
 *
 * Design principles:
 *  - SERIAL execution: one LLM call at a time prevents API rate-limit bursting.
 *  - PER-TRANSACTION isolation: a single error never stops the batch.
 *  - REPRODUCIBLE: always reads from the deterministic synthetic dataset,
 *    sorted by transactionId (zero-padded sequence = stable lexicographic order).
 *  - DRY-RUN mode: skips real AI + DB writes for safe evaluation.
 *  - CONFIGURABLE delay: `delayMs` controls pacing between LLM calls.
 *
 * SECURITY: No API keys, tokens, or credentials are stored or logged.
 */

import crypto from "crypto";

import { generateSyntheticDataset } from "@/lib/seed/generator";
import { getTransactionsCollection } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";
import {
  getBatchRunCollection,
  ensureBatchRunIndexes,
} from "@/lib/models/batch-run";
import { getAuditLogCollection } from "@/lib/models/audit-log";
import { createGuardrailEngine } from "@/lib/workflow/guardrails";
import { createActionExecutor } from "@/lib/workflow/actions";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { createRecoveryWorkflow } from "@/lib/workflow/recovery-workflow";
import type { WorkflowContext } from "@/lib/workflow/types";
import type { Transaction } from "@/types/transaction";
import type {
  BatchProcessorOptions,
  BatchRun,
  BatchSummary,
  BatchTransactionOutcome,
  TransactionOutcome,
} from "@/types/batch";

// ---------------------------------------------------------------------------
// Dry-run deterministic mock
// ---------------------------------------------------------------------------

/**
 * Deterministic mock outcome used in dry-run mode.
 * Cycles through a fixed set of outcomes based on transaction index so that
 * the same dataset always produces the same summary for evaluation.
 */
const DRY_RUN_OUTCOMES: TransactionOutcome[] = [
  "RECOVERED",
  "RECOVERED",
  "GUARDRAIL_BLOCKED",
  "HUMAN_REVIEW",
  "NOT_RECOVERABLE",
  "ACTION_FAILED",
  "RECOVERED",
];

function dryRunOutcome(index: number): TransactionOutcome {
  return DRY_RUN_OUTCOMES[index % DRY_RUN_OUTCOMES.length]!;
}

// ---------------------------------------------------------------------------
// Outcome classifier
// ---------------------------------------------------------------------------

/**
 * Maps a completed WorkflowContext to one of the canonical outcome values.
 */
function classifyOutcome(ctx: WorkflowContext): TransactionOutcome {
  if (ctx.status === "FAILED") return "ERROR";

  // Guardrail blocked with human review escalation
  if (
    ctx.guardrailResult?.approved === false &&
    (ctx.guardrailResult.policy === "HUMAN_REVIEW_REQUIRED" ||
      ctx.aiRecommendation?.classification === "HUMAN_REVIEW")
  ) {
    return "HUMAN_REVIEW";
  }

  // Guardrail blocked (non-human-review)
  if (ctx.guardrailResult?.approved === false) {
    // If AI said NOT_RECOVERABLE, label it accordingly
    if (ctx.aiRecommendation?.classification === "NOT_RECOVERABLE") {
      return "NOT_RECOVERABLE";
    }
    return "GUARDRAIL_BLOCKED";
  }

  // Action was executed
  if (ctx.actionExecution) {
    if (ctx.actionVerified) return "RECOVERED";
    return "ACTION_FAILED";
  }

  // No action executed — no guardrail rejection either
  // (e.g. NO_ACTION recommendation)
  if (ctx.aiRecommendation?.classification === "NOT_RECOVERABLE") {
    return "NOT_RECOVERABLE";
  }

  // Catch-all for unusual paths
  return "ACTION_FAILED";
}

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

export class BatchProcessor {
  private readonly delayMs: number;
  private readonly limit: number | undefined;
  private readonly dryRun: boolean;
  private readonly customTransactions: Transaction[] | undefined;

  constructor(options: BatchProcessorOptions = {}) {
    this.delayMs = options.delayMs ?? 1000;
    this.limit = options.limit;
    this.dryRun = options.dryRun ?? false;
    this.customTransactions = options.transactions;
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  /**
   * Run the batch and return the full summary.
   *
   * The batch is also persisted to MongoDB as a `BatchRun` document so it
   * can be retrieved later via the API.
   */
  async run(): Promise<BatchRun> {
    await ensureBatchRunIndexes();

    const batchId = `batch_${crypto.randomBytes(12).toString("hex")}`;
    const startedAt = new Date().toISOString();

    // Persist initial "RUNNING" record
    const batchCollection = await getBatchRunCollection();
    const runDoc: BatchRun = {
      batchId,
      status: "RUNNING",
      startedAt,
      options: {
        delayMs: this.delayMs,
        limit: this.limit,
        dryRun: this.dryRun,
      },
    };
    await batchCollection.insertOne(
      runDoc as Parameters<typeof batchCollection.insertOne>[0]
    );

    try {
      const summary = await this.processBatch(batchId, startedAt);

      const completedAt = new Date().toISOString();
      const completedRun: Partial<BatchRun> = {
        status: "COMPLETED",
        completedAt,
        summary,
      };

      await batchCollection.updateOne(
        { batchId },
        { $set: completedRun }
      );

      return { ...runDoc, ...completedRun, summary } as BatchRun;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const completedAt = new Date().toISOString();
      await batchCollection.updateOne(
        { batchId },
        { $set: { status: "FAILED", completedAt, errorMessage } }
      );

      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Core processing loop
  // -------------------------------------------------------------------------

  private async processBatch(
    batchId: string,
    startedAt: string
  ): Promise<BatchSummary> {
    // ── 1. Source the reproducible synthetic dataset or custom input ─────
    const dataset = generateSyntheticDataset();
    const sourceTransactions = this.customTransactions ?? dataset.transactions;

    // Filter to eligible transactions only: FAILED or ABANDONED
    // Sort by transactionId for stable, reproducible baseline ordering
    const eligibleTransactions = sourceTransactions
      .filter((t) => t.status === "FAILED" || t.status === "ABANDONED")
      .sort((a, b) => a.transactionId.localeCompare(b.transactionId));

    // ── Intelligently skip already-processed transactions ─────────────────
    // When a batch is executed, transactions that were attempted, recovered,
    // blocked by guardrails, marked not recoverable, or escalated are recorded.
    // Subsequent batches skip those and move forward to the NEXT unprocessed transactions.
    let prioritizedTransactions = eligibleTransactions;
    try {
      const processedTransactionIds = new Set<string>();

      // 1. Check previous batch runs to skip transactions already evaluated in past batches
      const batchCollection = await getBatchRunCollection();
      const previousRuns = await batchCollection
        .find({ batchId: { $ne: batchId } })
        .project({ "summary.outcomes.transactionId": 1 })
        .toArray();

      for (const run of previousRuns) {
        if (run.summary?.outcomes) {
          for (const outcome of run.summary.outcomes) {
            if (outcome.transactionId) {
              processedTransactionIds.add(outcome.transactionId);
            }
          }
        }
      }

      // 2. Check audit logs for any attempted, blocked, or verified transactions
      const auditCollection = await getAuditLogCollection();
      const auditLogs = await auditCollection
        .find({})
        .project({ transactionId: 1 })
        .toArray();

      for (const log of auditLogs) {
        if (log.transactionId) {
          processedTransactionIds.add(log.transactionId);
        }
      }

      // 3. Filter out all already-processed transactions
      const nextPendingTransactions = eligibleTransactions.filter(
        (t) => !processedTransactionIds.has(t.transactionId)
      );

      // If there are unprocessed transactions remaining, pick from them.
      // If all transactions across the dataset have been evaluated, cycle from the beginning.
      if (nextPendingTransactions.length > 0) {
        prioritizedTransactions = nextPendingTransactions;
      } else {
        prioritizedTransactions = eligibleTransactions;
      }
    } catch (err) {
      console.warn(
        "Could not query previous runs/audit logs for transaction progression, using default order:",
        err
      );
      prioritizedTransactions = eligibleTransactions;
    }

    // Apply optional limit
    const toProcess =
      this.limit !== undefined
        ? prioritizedTransactions.slice(0, this.limit)
        : prioritizedTransactions;

    // ── 2. Build workflow dependencies (once per batch) ───────────────────
    // In dry-run mode these are never actually called, but we still
    // construct them so the code path is identical.
    const auditService = this.dryRun
      ? null
      : await getAuditTrailService();

    const workflow =
      this.dryRun || !auditService
        ? null
        : createRecoveryWorkflow(
            createGuardrailEngine(),
            createActionExecutor(),
            auditService
          );

    // ── 3. Seed DB with the synthetic data (skip in dry-run) ─────────────
    if (!this.dryRun) {
      await this.upsertSyntheticData(sourceTransactions, dataset.customers as any[]);
    }

    // ── 4. Process each transaction serially ─────────────────────────────
    const outcomes: BatchTransactionOutcome[] = [];
    let index = 0;

    for (const transaction of toProcess) {
      const txStart = Date.now();
      let outcome: BatchTransactionOutcome;

      if (this.dryRun) {
        // Dry-run: deterministic mock, no real I/O
        outcome = this.buildDryRunOutcome(transaction, index, txStart);
      } else {
        // Real run: full workflow, isolated per-transaction
        outcome = await this.processOneTransaction(
          transaction,
          workflow!,
          txStart
        );
      }

      outcomes.push(outcome);
      index += 1;

      // Inter-request delay (skip after last item, and skip in dry-run)
      if (!this.dryRun && index < toProcess.length) {
        await this.delay(this.delayMs);
      }

      // Progress log (safe — no secrets)
      console.log(
        `[batch:${batchId}] ${index}/${toProcess.length} ` +
          `txn=${transaction.transactionId} outcome=${outcome.outcome} ` +
          `(${outcome.processingMs}ms)`
      );
    }

    // ── 5. Aggregate metrics scoped strictly to this batch ──────────────
    return this.buildSummary(
      outcomes,
      toProcess,
      startedAt,
      dataset.seedVersion
    );
  }

  // -------------------------------------------------------------------------
  // Process a single transaction through the full workflow
  // -------------------------------------------------------------------------

  private async processOneTransaction(
    transaction: Transaction,
    workflow: ReturnType<typeof createRecoveryWorkflow>,
    txStart: number
  ): Promise<BatchTransactionOutcome> {
    let ctx: WorkflowContext | undefined;

    try {
      ctx = await workflow.executeWorkflow(transaction.transactionId);
    } catch (error) {
      // Isolated: error is captured, batch continues
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // PHASE 1: Detailed error logging for debugging
      const errorStack =
        error instanceof Error
          ? error.stack?.split("\n").slice(0, 3).join("\n")
          : "No stack available";

      console.error(
        `[RECOVERY][${transaction.transactionId}][ERROR]`,
        JSON.stringify({
          stage: "WORKFLOW_EXECUTION",
          transactionId: transaction.transactionId,
          customerId: transaction.customerId,
          errorMessage,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          stackTrace: errorStack,
          timestamp: new Date().toISOString(),
        })
      );

      return {
        transactionId: transaction.transactionId,
        customerId: transaction.customerId,
        amountPaise: transaction.amount,
        currency: transaction.currency,
        outcome: "ERROR",
        actionExecuted: false,
        actionVerified: false,
        errorMessage,
        processingMs: Date.now() - txStart,
      };
    }

    const outcome = classifyOutcome(ctx);
    const errorMessage =
      outcome === "ACTION_FAILED"
        ? ctx.actionExecution?.error?.message ||
          (ctx.actionExecution?.result &&
          ctx.actionExecution.result.status !== "SUCCESS"
            ? ctx.actionExecution.result.message
            : "Action could not be verified on payment gateway")
        : undefined;

    return {
      transactionId: transaction.transactionId,
      customerId: transaction.customerId,
      amountPaise: transaction.amount,
      currency: transaction.currency,
      outcome,
      aiClassification: ctx.aiRecommendation?.classification,
      recommendedAction: ctx.aiRecommendation?.recommendedAction,
      actionExecuted: !!ctx.actionExecution,
      actionVerified: ctx.actionVerified ?? false,
      auditLogId: ctx.auditEvent?.auditId,
      errorMessage,
      processingMs: Date.now() - txStart,
    };
  }

  // -------------------------------------------------------------------------
  // Dry-run: deterministic mock outcome (no DB, no AI)
  // -------------------------------------------------------------------------

  private buildDryRunOutcome(
    transaction: Transaction,
    index: number,
    txStart: number
  ): BatchTransactionOutcome {
    const outcome = dryRunOutcome(index);

    const aiClassification: BatchTransactionOutcome["aiClassification"] =
      outcome === "NOT_RECOVERABLE"
        ? "NOT_RECOVERABLE"
        : outcome === "HUMAN_REVIEW"
          ? "HUMAN_REVIEW"
          : "RECOVERABLE";

    const actionExecuted =
      outcome === "RECOVERED" || outcome === "ACTION_FAILED";
    const actionVerified = outcome === "RECOVERED";

    return {
      transactionId: transaction.transactionId,
      customerId: transaction.customerId,
      amountPaise: transaction.amount,
      currency: transaction.currency,
      outcome,
      aiClassification,
      recommendedAction:
        outcome === "RECOVERED" || outcome === "ACTION_FAILED"
          ? "RETRY"
          : undefined,
      actionExecuted,
      actionVerified,
      processingMs: Date.now() - txStart,
    };
  }

  // -------------------------------------------------------------------------
  // Metrics aggregation (Scoped strictly to this batch run)
  // -------------------------------------------------------------------------

  /**
   * Build the BatchSummary object.
   *
   * METRIC RULES:
   * 1. revenueAtRisk: sum amount of ONLY unique transactions actually processed
   *    by this batch where status is FAILED or ABANDONED.
   * 2. revenueRecovered: sum amount of ONLY successfully verified recoveries.
   * 3. revenueRecoveryRate: (revenueRecovered / revenueAtRisk). If revenueAtRisk === 0, rate is 0.
   * 4. Double counting is strictly prevented using Set deduplication on transactionId.
   */
  buildSummary(
    outcomes: BatchTransactionOutcome[],
    processedTransactions: Transaction[],
    startedAt: string,
    seedVersion: number
  ): BatchSummary {
    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();

    // 1. Scope revenueAtRisk ONLY to the unique transactions processed in this batch
    const atRiskTxnMap = new Map<string, number>();
    for (const t of processedTransactions) {
      if (t.status === "FAILED" || t.status === "ABANDONED") {
        atRiskTxnMap.set(t.transactionId, t.amount);
      }
    }
    // Also include any at-risk transactions from outcomes not already in processedTransactions
    for (const o of outcomes) {
      if (!atRiskTxnMap.has(o.transactionId)) {
        atRiskTxnMap.set(o.transactionId, o.amountPaise);
      }
    }

    let revenueAtRisk = 0;
    for (const amount of atRiskTxnMap.values()) {
      revenueAtRisk += amount;
    }

    // 2. Metrics counters with strict deduplication per transactionId
    const processedTxnIds = new Set<string>();
    const recoverableTxnIds = new Set<string>();
    const recoveredTxnIds = new Set<string>();
    const failedActionTxnIds = new Set<string>();
    const humanReviewTxnIds = new Set<string>();
    const guardrailBlockTxnIds = new Set<string>();
    const errorTxnIds = new Set<string>();

    let revenueRecovered = 0;

    for (const o of outcomes) {
      processedTxnIds.add(o.transactionId);

      // AI classification: count unique transactions classified as RECOVERABLE
      if (o.aiClassification === "RECOVERABLE") {
        recoverableTxnIds.add(o.transactionId);
      }

      switch (o.outcome) {
        case "RECOVERED":
          // Count only successfully verified recoveries
          if (o.actionVerified === true) {
            if (!recoveredTxnIds.has(o.transactionId)) {
              recoveredTxnIds.add(o.transactionId);
              revenueRecovered += o.amountPaise;
            }
          }
          break;

        case "ACTION_FAILED":
          failedActionTxnIds.add(o.transactionId);
          break;

        case "HUMAN_REVIEW":
          humanReviewTxnIds.add(o.transactionId);
          break;

        case "GUARDRAIL_BLOCKED":
          guardrailBlockTxnIds.add(o.transactionId);
          break;

        case "ERROR":
          errorTxnIds.add(o.transactionId);
          break;

        default:
          break;
      }
    }

    const totalTransactions = processedTxnIds.size;
    const successfulRecoveries = recoveredTxnIds.size;
    const recoverableCases = recoverableTxnIds.size;
    const failedRecoveryActions = failedActionTxnIds.size;
    const humanReviews = humanReviewTxnIds.size;
    const guardrailBlocks = guardrailBlockTxnIds.size;
    const errorCount = errorTxnIds.size;

    const recoveryRate =
      totalTransactions > 0 ? successfulRecoveries / totalTransactions : 0;
    const revenueRecoveryRate =
      revenueAtRisk > 0 ? revenueRecovered / revenueAtRisk : 0;

    return {
      totalTransactions,
      revenueAtRisk,
      recoverableCases,
      successfulRecoveries,
      failedRecoveryActions,
      humanReviews,
      guardrailBlocks,
      revenueRecovered,
      recoveryRate,
      revenueRecoveryRate,
      startedAt,
      completedAt,
      durationMs,
      seedVersion,
      errorCount,
      outcomes,
    };
  }

  // -------------------------------------------------------------------------
  // DB upsert helpers (skip in dry-run)
  // -------------------------------------------------------------------------

  /**
   * Upsert the synthetic transactions and customers into MongoDB so the
   * workflow can load them. Uses replaceOne+upsert to be idempotent —
   * re-running the batch doesn't break the DB state.
   */
  private async upsertSyntheticData(
    transactions: Transaction[],
    customers: any[]
  ): Promise<void> {
    const txCollection = await getTransactionsCollection();
    const custCollection = await getCustomersCollection();

    if (transactions.length > 0) {
      await txCollection.bulkWrite(
        transactions.map((t) => ({
          replaceOne: {
            filter: { transactionId: t.transactionId },
            replacement: t as any,
            upsert: true,
          },
        }))
      );
    }

    if (customers.length > 0) {
      await custCollection.bulkWrite(
        customers.map((c) => ({
          replaceOne: {
            filter: { customerId: c.customerId },
            replacement: c,
            upsert: true,
          },
        }))
      );
    }
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
