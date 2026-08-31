/**
 * Audit Trail Service
 *
 * Provides the append-only audit logger used by the recovery workflow
 * orchestrator.  The LLM and AI analysis service have NO access to this
 * module — only the deterministic workflow steps can write audit records.
 *
 * Each call to `record()` inserts one immutable document into MongoDB.
 * Records are never updated or deleted (TTL index handles retention).
 *
 * SECURITY: API secrets and sensitive credentials are NEVER written here.
 */

import crypto from "crypto";

import {
  getAuditLogCollection,
  ensureAuditLogIndexes,
} from "@/lib/models/audit-log";
import type {
  AuditLog,
  AuditEventType,
  AuditAIRecommendation,
  AuditGuardrailDecision,
  AuditActionDetail,
} from "@/types/audit-log";

// Re-export types so callers import from a single location.
export type {
  AuditLog,
  AuditEventType,
  AuditAIRecommendation,
  AuditGuardrailDecision,
  AuditActionDetail,
};

// ---------------------------------------------------------------------------
// Payload type for recording an event
// ---------------------------------------------------------------------------

/** All fields required (or optional) when recording a single audit event. */
export interface AuditRecordPayload {
  transactionId: string;
  eventType: AuditEventType;
  actor: string;
  result: string;
  reason: string;
  aiRecommendation?: AuditAIRecommendation;
  guardrailDecision?: AuditGuardrailDecision;
  action?: AuditActionDetail;
  /**
   * Arbitrary metadata.
   * MUST NOT contain API secrets, tokens, passwords, or raw credentials.
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AuditTrailService
// ---------------------------------------------------------------------------

/**
 * Append-only audit logger for the AI Revenue Recovery workflow.
 *
 * Usage:
 *   const audit = await AuditTrailService.create();
 *   await audit.record({ transactionId, eventType: "PAYMENT_DETECTED", … });
 */
export class AuditTrailService {
  private indexesEnsured = false;

  private constructor() { }

  /** Factory: creates a service instance ready for use. */
  static async create(): Promise<AuditTrailService> {
    const service = new AuditTrailService();
    await service.ensureIndexes();
    return service;
  }

  // -------------------------------------------------------------------------
  // Public write API
  // -------------------------------------------------------------------------

  /**
   * Record a single audit event.
   * Inserts one immutable document into MongoDB.
   * Returns the persisted AuditLog.
   */
  async record(payload: AuditRecordPayload): Promise<AuditLog> {
    await this.ensureIndexes();
    const collection = await getAuditLogCollection();

    const log: AuditLog = {
      logId: `log_${crypto.randomBytes(12).toString("hex")}`,
      timestamp: new Date().toISOString(),
      transactionId: payload.transactionId,
      eventType: payload.eventType,
      actor: payload.actor,
      result: payload.result,
      reason: payload.reason,
      ...(payload.aiRecommendation && {
        aiRecommendation: payload.aiRecommendation,
      }),
      ...(payload.guardrailDecision && {
        guardrailDecision: payload.guardrailDecision,
      }),
      ...(payload.action && { action: payload.action }),
      ...(payload.metadata && { metadata: payload.metadata }),
    };

    await collection.insertOne(log as Parameters<typeof collection.insertOne>[0]);
    return log;
  }

  // -------------------------------------------------------------------------
  // Convenience helpers — one per workflow event type
  // -------------------------------------------------------------------------

  /** Step 1 — payment failure / abandonment first detected. */
  async recordPaymentDetected(
    transactionId: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "PAYMENT_DETECTED",
      actor: "workflow-orchestrator",
      result: "DETECTED",
      reason: "Failed or abandoned transaction loaded for recovery analysis",
      metadata,
    });
  }

  /** Step 2 — AI service produced a recommendation. */
  async recordAIAnalysis(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "AI_ANALYSIS",
      actor: "ai-analysis-service",
      result: "ANALYSIS_COMPLETE",
      reason: `AI classified transaction as ${recommendation.classification} with ${(recommendation.confidence * 100).toFixed(1)}% confidence`,
      aiRecommendation: recommendation,
      metadata,
    });
  }

  /** Step 3 — structured recommendation produced and ready for guardrail review. */
  async recordRecoveryRecommended(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "RECOVERY_RECOMMENDED",
      actor: "workflow-orchestrator",
      result: "RECOMMENDATION_READY",
      reason: `Recovery recommended: ${recommendation.recommendedAction}`,
      aiRecommendation: recommendation,
      metadata,
    });
  }

  /** Step 4 — guardrail engine evaluated the recommendation. */
  async recordGuardrailCheck(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    decision: AuditGuardrailDecision,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    const allowed = decision.allowed;
    return this.record({
      transactionId,
      eventType: "GUARDRAIL_CHECK",
      actor: "guardrail-engine",
      result: allowed ? "APPROVED" : decision.decision,
      reason: decision.reason,
      aiRecommendation: recommendation,
      guardrailDecision: decision,
      metadata,
    });
  }

  /** Step 5a — guardrails blocked the action. */
  async recordActionBlocked(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    decision: AuditGuardrailDecision,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "ACTION_BLOCKED",
      actor: "guardrail-engine",
      result: "BLOCKED",
      reason: decision.reason,
      aiRecommendation: recommendation,
      guardrailDecision: decision,
      metadata,
    });
  }

  /** Step 5b — action was escalated for human review. */
  async recordHumanReview(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    decision: AuditGuardrailDecision,
    reviewerNote?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "HUMAN_REVIEW",
      actor: "guardrail-engine",
      result: "ESCALATED",
      reason: reviewerNote || decision.reason,
      aiRecommendation: recommendation,
      guardrailDecision: decision,
      metadata,
    });
  }

  /** Step 6 — recovery action was executed (or attempted). */
  async recordActionExecuted(
    transactionId: string,
    recommendation: AuditAIRecommendation,
    guardrailDecision: AuditGuardrailDecision,
    action: AuditActionDetail,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    const succeeded = action.status === "COMPLETED" && action.result?.status === "SUCCESS";
    return this.record({
      transactionId,
      eventType: "ACTION_EXECUTED",
      actor: "action-executor",
      result: succeeded ? "SUCCESS" : "FAILED",
      reason: action.result?.message || action.error?.message || "Action executed",
      aiRecommendation: recommendation,
      guardrailDecision,
      action,
      metadata,
    });
  }

  /** Step 7 — action result has been verified. */
  async recordActionVerified(
    transactionId: string,
    action: AuditActionDetail,
    verified: boolean,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "ACTION_VERIFIED",
      actor: "workflow-orchestrator",
      result: verified ? "VERIFIED" : "VERIFICATION_FAILED",
      reason: verified
        ? "Action result confirmed successful"
        : "Action result could not be verified",
      action,
      metadata,
    });
  }

  /** Any workflow stage — unhandled error. */
  async recordError(
    transactionId: string,
    stage: string,
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.record({
      transactionId,
      eventType: "ERROR",
      actor: "workflow-orchestrator",
      result: "ERROR",
      reason: errorMessage,
      metadata: {
        stage,
        ...metadata,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Public read API
  // -------------------------------------------------------------------------

  /**
   * Retrieve the full ordered audit trail for a transaction.
   * Returns events sorted by timestamp ascending (detection → resolution).
   */
  async getTransactionAuditTrail(transactionId: string): Promise<AuditLog[]> {
    await this.ensureIndexes();
    const collection = await getAuditLogCollection();
    return collection
      .find({ transactionId })
      .sort({ timestamp: 1 })
      .toArray() as unknown as AuditLog[];
  }

  /**
   * Retrieve a single audit log entry by its logId.
   */
  async getLogById(logId: string): Promise<AuditLog | null> {
    await this.ensureIndexes();
    const collection = await getAuditLogCollection();
    return collection.findOne({ logId }) as unknown as AuditLog | null;
  }

  /**
   * Retrieve audit logs filtered by event type, with optional pagination.
   */
  async getLogsByEventType(
    eventType: AuditEventType,
    limit = 50,
    skip = 0
  ): Promise<AuditLog[]> {
    await this.ensureIndexes();
    const collection = await getAuditLogCollection();
    return collection
      .find({ eventType })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(limit, 500))
      .toArray() as unknown as AuditLog[];
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await ensureAuditLogIndexes();
    this.indexesEnsured = true;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory (module-level cache for Next.js hot-reload safety)
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var _auditTrailService: Promise<AuditTrailService> | undefined;
}

/**
 * Returns a shared AuditTrailService instance.
 * In development, the instance is cached on `global` to survive hot-reloads.
 */
export async function getAuditTrailService(): Promise<AuditTrailService> {
  if (process.env.NODE_ENV === "development") {
    if (!global._auditTrailService) {
      global._auditTrailService = AuditTrailService.create();
    }
    return global._auditTrailService;
  }
  return AuditTrailService.create();
}

// ---------------------------------------------------------------------------
// Backward-compat shim (keeps existing import in recovery/route.ts working)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `getAuditTrailService()` instead.
 * Kept for backward compatibility with the existing workflow route.
 */
export async function getAuditLogger() {
  return getAuditTrailService();
}
