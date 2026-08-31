/**
 * Audit Log Types
 *
 * Immutable, append-only records of every significant event in the
 * AI Revenue Recovery workflow.  Every recovery decision is traceable
 * from initial payment detection through to its final resolved state.
 *
 * SECURITY: API secrets and sensitive credentials are NEVER stored here.
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Every distinct event kind that can be recorded in the audit trail.
 *
 * | Event              | Fired when …                                          |
 * |--------------------|-------------------------------------------------------|
 * | PAYMENT_DETECTED   | A failed / abandoned payment is first detected        |
 * | AI_ANALYSIS        | The AI service has produced a recovery recommendation |
 * | RECOVERY_RECOMMENDED | The AI recommendation is ready for guardrail review  |
 * | GUARDRAIL_CHECK    | The deterministic guardrail engine runs its checks    |
 * | ACTION_EXECUTED    | A recovery action (retry, reminder, …) is fired      |
 * | ACTION_BLOCKED     | Guardrails blocked execution of the action            |
 * | HUMAN_REVIEW       | Case escalated to a human reviewer                    |
 * | ACTION_VERIFIED    | The executed action result has been verified          |
 * | ERROR              | An unhandled error occurred during the workflow       |
 */
export type AuditEventType =
  | "PAYMENT_DETECTED"
  | "AI_ANALYSIS"
  | "RECOVERY_RECOMMENDED"
  | "GUARDRAIL_CHECK"
  | "ACTION_EXECUTED"
  | "ACTION_BLOCKED"
  | "HUMAN_REVIEW"
  | "ACTION_VERIFIED"
  | "ERROR";

// ---------------------------------------------------------------------------
// Sub-document shapes
// ---------------------------------------------------------------------------

/** Snapshot of the AI recommendation at the time it was produced. */
export interface AuditAIRecommendation {
  classification: "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW";
  recommendedAction: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "HUMAN_REVIEW" | "NO_ACTION";
  confidence: number; // 0.0 – 1.0
  evidence: string[];
  reason: string;
}

/** Outcome of the deterministic guardrail evaluation. */
export interface AuditGuardrailDecision {
  allowed: boolean;
  decision: "ALLOW" | "BLOCK" | "HUMAN_REVIEW";
  reason: string;
  requiresHumanApproval: boolean;
  rulesChecked?: string[];
  rulesViolated?: string[];
}

/** Details of the action that was executed (or attempted). */
export interface AuditActionDetail {
  actionType: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "NO_ACTION";
  status: "INITIATED" | "COMPLETED" | "FAILED";
  result?: {
    actionId: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Root AuditLog document
// ---------------------------------------------------------------------------

/**
 * A single audit log entry.
 *
 * Rules:
 *  - One entry per significant event (not one per workflow run).
 *  - Records are IMMUTABLE after insertion.
 *  - Sensitive credentials (API keys, tokens, passwords) are NEVER stored.
 */
export interface AuditLog {
  /** Unique identifier for this log entry. Format: `log_<hex24>` */
  logId: string;

  /** The transaction this event belongs to. */
  transactionId: string;

  /** The type of event being recorded. */
  eventType: AuditEventType;

  /** ISO-8601 timestamp of when this event occurred. */
  timestamp: string;

  /**
   * Who / what triggered this event.
   * Examples: "system", "workflow-orchestrator", "guardrail-engine",
   *           "human:<userId>", "ai-analysis-service"
   */
  actor: string;

  /**
   * Snapshot of the AI recommendation at the time of this event.
   * Present only for AI_ANALYSIS, RECOVERY_RECOMMENDED, GUARDRAIL_CHECK,
   * ACTION_EXECUTED, ACTION_BLOCKED, ACTION_VERIFIED events.
   */
  aiRecommendation?: AuditAIRecommendation;

  /**
   * Guardrail engine decision.
   * Present only for GUARDRAIL_CHECK, ACTION_BLOCKED, ACTION_EXECUTED events.
   */
  guardrailDecision?: AuditGuardrailDecision;

  /**
   * The action taken (or attempted).
   * Present only for ACTION_EXECUTED and ACTION_VERIFIED events.
   */
  action?: AuditActionDetail;

  /**
   * Final outcome of this event.
   * Examples: "SUCCESS", "BLOCKED", "ESCALATED", "FAILED", "VERIFIED"
   */
  result: string;

  /**
   * Human-readable explanation of why this result occurred.
   * Never contains secrets or credentials.
   */
  reason: string;

  /**
   * Arbitrary structured metadata for this event.
   * Must NOT include API secrets, tokens, or passwords.
   */
  metadata?: Record<string, unknown>;
}
