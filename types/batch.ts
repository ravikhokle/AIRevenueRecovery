/**
 * Batch Revenue Recovery – Type Definitions
 *
 * These types describe a single batch processing run: what it tracks per
 * transaction, the aggregated summary metrics, and the MongoDB document
 * persisted for later retrieval.
 *
 * SECURITY: No API keys, secrets, or credentials are stored here.
 */

// ---------------------------------------------------------------------------
// Per-transaction outcome
// ---------------------------------------------------------------------------

/**
 * How a single transaction was resolved during a batch run.
 *
 * | outcome            | meaning                                             |
 * |--------------------|-----------------------------------------------------|
 * | RECOVERED          | Action executed + verified successfully             |
 * | ACTION_FAILED      | Action executed but failed or unverified            |
 * | GUARDRAIL_BLOCKED  | Deterministic guardrails blocked the action         |
 * | HUMAN_REVIEW       | Case escalated — requires manual review             |
 * | NOT_RECOVERABLE    | AI classified as unrecoverable                      |
 * | SKIPPED            | Transaction not eligible (SUCCESS/PENDING status)   |
 * | ERROR              | Unhandled error — transaction did not stop batch    |
 */
export type TransactionOutcome =
  | "RECOVERED"
  | "ACTION_FAILED"
  | "GUARDRAIL_BLOCKED"
  | "HUMAN_REVIEW"
  | "NOT_RECOVERABLE"
  | "SKIPPED"
  | "ERROR";

/**
 * Result record for one transaction in a batch run.
 */
export interface BatchTransactionOutcome {
  /** Business transaction identifier. */
  transactionId: string;

  /** Customer identifier. */
  customerId: string;

  /** Transaction amount in smallest currency unit (paise for INR). */
  amountPaise: number;

  /** ISO 4217 currency code. */
  currency: string;

  /** How this transaction was resolved. */
  outcome: TransactionOutcome;

  /**
   * AI recommendation classification, if analysis ran.
   * Undefined when the transaction errored before or during AI analysis.
   */
  aiClassification?: "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW";

  /**
   * Recovery action that was recommended (and potentially executed).
   */
  recommendedAction?: string;

  /**
   * Whether the recovery action was executed.
   */
  actionExecuted: boolean;

  /**
   * Whether the executed action was successfully verified.
   */
  actionVerified: boolean;

  /**
   * Audit log ID of the final event for this transaction, for traceability.
   */
  auditLogId?: string;

  /**
   * Error message if outcome === "ERROR".
   * Never contains secrets or stack traces.
   */
  errorMessage?: string;

  /** Processing duration for this transaction in milliseconds. */
  processingMs: number;
}

// ---------------------------------------------------------------------------
// Batch summary (the 8 required metrics + metadata)
// ---------------------------------------------------------------------------

/**
 * Aggregated metrics for a complete batch run.
 */
export interface BatchSummary {
  // ── Core metrics ──────────────────────────────────────────────────────────

  /** Total FAILED + ABANDONED transactions submitted to the batch. */
  totalTransactions: number;

  /**
   * Sum of amounts for all submitted transactions (paise).
   * Represents total revenue at risk of being lost.
   */
  revenueAtRisk: number;

  /**
   * Transactions where AI classified as RECOVERABLE.
   * (Subset of totalTransactions.)
   */
  recoverableCases: number;

  /**
   * Transactions where recovery action was executed AND verified successfully.
   */
  successfulRecoveries: number;

  /**
   * Transactions where a recovery action was attempted but failed or could
   * not be verified.
   */
  failedRecoveryActions: number;

  /**
   * Transactions escalated for human review by the guardrail engine.
   */
  humanReviews: number;

  /**
   * Transactions where the guardrail engine blocked automatic execution.
   * (Excludes human-review escalations.)
   */
  guardrailBlocks: number;

  /**
   * Sum of amounts for successfully recovered transactions (paise).
   * revenueRecovered / revenueAtRisk = recovery rate.
   */
  revenueRecovered: number;

  // ── Derived rates (for convenience) ──────────────────────────────────────

  /** successfulRecoveries / totalTransactions, 0.0–1.0. */
  recoveryRate: number;

  /** revenueRecovered / revenueAtRisk, 0.0–1.0. */
  revenueRecoveryRate: number;

  // ── Run metadata ──────────────────────────────────────────────────────────

  /** ISO-8601 timestamp when the batch started. */
  startedAt: string;

  /** ISO-8601 timestamp when the batch completed. */
  completedAt: string;

  /** Total wall-clock time for the batch in milliseconds. */
  durationMs: number;

  /** Seed version of the synthetic dataset used (for reproducibility). */
  seedVersion: number;

  /** Number of transactions that errored and were skipped (not counted in metrics above). */
  errorCount: number;

  /** Detailed per-transaction outcomes. */
  outcomes: BatchTransactionOutcome[];
}

// ---------------------------------------------------------------------------
// Batch run document (persisted to MongoDB)
// ---------------------------------------------------------------------------

export type BatchRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

/**
 * MongoDB document persisted for each batch execution.
 * Allows past runs to be retrieved and compared.
 */
export interface BatchRun {
  /** Unique batch run identifier. Format: `batch_<hex24>`. */
  batchId: string;

  /** Current status of the run. */
  status: BatchRunStatus;

  /** ISO-8601 timestamp when the batch was initiated. */
  startedAt: string;

  /** ISO-8601 timestamp when the batch finished (or failed). */
  completedAt?: string;

  /**
   * Full summary, populated when status === "COMPLETED".
   * null when status === "RUNNING" or "FAILED" before completion.
   */
  summary?: BatchSummary;

  /**
   * Top-level error message if status === "FAILED".
   * Never contains secrets or raw stack traces.
   */
  errorMessage?: string;

  /** Processing options used for this run (for reproducibility). */
  options: BatchProcessorOptions;
}

// ---------------------------------------------------------------------------
// Processor configuration
// ---------------------------------------------------------------------------

/**
 * Options passed to `BatchProcessor.run()`.
 * All options are optional — defaults are applied inside the processor.
 */
export interface BatchProcessorOptions {
  /**
   * Milliseconds to wait between consecutive LLM API calls.
   * Prevents rate-limit bursting. Default: 1000 ms.
   */
  delayMs?: number;

  /**
   * Maximum number of transactions to process in this run.
   * Useful for staged evaluation. Default: process all eligible.
   */
  limit?: number;

  /**
   * When true, skip real AI calls and DB writes.
   * Uses deterministic mock outcomes for every transaction.
   * Ideal for evaluation harness / CI testing.
   * Default: false.
   */
  dryRun?: boolean;

  /**
   * Optional custom transactions array to process.
   * If omitted, the standard synthetic dataset is used.
   */
  transactions?: import("./transaction").Transaction[];
}
