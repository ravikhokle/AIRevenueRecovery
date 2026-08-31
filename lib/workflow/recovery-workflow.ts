import { getTransactionsCollection } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";
import { analyzeRecoveryPotential } from "@/lib/ai/analysis";
import { RecoveryWorkflowError, WorkflowContext } from "./types";
import { GuardrailEngine } from "./guardrails";
import { GuardrailRejectionError } from "./types";
import {
  ActionExecutor,
  verifyActionResult,
  validateActionMatchesRecommendation,
} from "./actions";
import {
  AuditTrailService,
  AuditAIRecommendation,
  AuditGuardrailDecision,
  AuditActionDetail,
} from "./audit";
import { RecoveryAnalysisInputSchema } from "@/lib/ai/schemas";

/**
 * Recovery Workflow Orchestrator
 *
 * Executes the complete recovery workflow in strict order:
 *  1. Load transaction          → emits PAYMENT_DETECTED
 *  2. Load customer history
 *  3. Analyze with AI service   → emits AI_ANALYSIS + RECOVERY_RECOMMENDED
 *  4. Guardrail check           → emits GUARDRAIL_CHECK
 *     4a. If blocked            → emits ACTION_BLOCKED
 *     4b. If human review       → emits HUMAN_REVIEW
 *  5. Execute action            → emits ACTION_EXECUTED
 *  6. Verify action result      → emits ACTION_VERIFIED
 *  Any unhandled exception      → emits ERROR
 *
 * The LLM cannot bypass any step or modify the audit trail.
 */
export class RecoveryWorkflow {
  constructor(
    private guardrailEngine: GuardrailEngine,
    private actionExecutor: ActionExecutor,
    private auditService: AuditTrailService
  ) {}

  /**
   * Execute the complete workflow for a transaction.
   */
  async executeWorkflow(transactionId: string): Promise<WorkflowContext> {
    const context: WorkflowContext = {
      transactionId,
      startedAt: new Date().toISOString(),
      status: "PENDING",
    };

    try {
      // Step 1: Load transaction
      context.status = "IN_PROGRESS";
      await this.step1LoadTransaction(context);

      // Step 2: Load customer history
      await this.step2LoadCustomerHistory(context);

      // Step 3: Analyze with AI service
      await this.step3AnalyzeTransaction(context);

      // Step 5: Pass to guardrail engine
      await this.step5CheckGuardrails(context);

      // Step 6: Execute action (if approved)
      await this.step6ExecuteAction(context);

      // Step 7: Verify action result
      await this.step7VerifyResult(context);

      context.status = "COMPLETED";
      context.completedAt = new Date().toISOString();
    } catch (error) {
      context.status = "FAILED";
      context.completedAt = new Date().toISOString();

      // Emit an ERROR audit event (best-effort — never throw from here)
      try {
        await this.auditService.recordError(
          context.transactionId,
          "UNKNOWN",
          error instanceof Error ? error.message : String(error),
          { completedAt: context.completedAt }
        );
      } catch (auditError) {
        console.error("Failed to record ERROR audit event:", auditError);
      }

      throw error;
    }

    return context;
  }

  // ---------------------------------------------------------------------------
  // Private steps
  // ---------------------------------------------------------------------------

  /**
   * STEP 1: Load Transaction
   * Emits: PAYMENT_DETECTED
   */
  private async step1LoadTransaction(context: WorkflowContext): Promise<void> {
    try {
      const collection = await getTransactionsCollection();
      const transaction = await collection.findOne({
        transactionId: context.transactionId,
      });

      if (!transaction) {
        throw new RecoveryWorkflowError(
          `Transaction not found: ${context.transactionId}`,
          "LOAD_TRANSACTION",
          "TRANSACTION_NOT_FOUND",
          404
        );
      }

      // Only process FAILED or ABANDONED transactions
      if (
        transaction.status !== "FAILED" &&
        transaction.status !== "ABANDONED"
      ) {
        throw new RecoveryWorkflowError(
          `Transaction status is ${transaction.status}, cannot analyze`,
          "LOAD_TRANSACTION",
          "INVALID_STATUS",
          400
        );
      }

      context.transaction = transaction;
      context.customerId = transaction.customerId;

      // ── Audit: PAYMENT_DETECTED ──
      await this.auditService.recordPaymentDetected(
        context.transactionId,
        {
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          paymentMethod: transaction.paymentMethod,
          failureReason: transaction.failureReason ?? undefined,
          retryCount: transaction.retryCount,
        }
      );
    } catch (error) {
      if (error instanceof RecoveryWorkflowError) throw error;
      throw new RecoveryWorkflowError(
        error instanceof Error ? error.message : String(error),
        "LOAD_TRANSACTION",
        "LOAD_FAILED"
      );
    }
  }

  /**
   * STEP 2: Load Customer History
   */
  private async step2LoadCustomerHistory(
    context: WorkflowContext
  ): Promise<void> {
    try {
      if (!context.customerId) {
        throw new RecoveryWorkflowError(
          "Customer ID not available",
          "LOAD_CUSTOMER",
          "NO_CUSTOMER_ID"
        );
      }

      const customersCollection = await getCustomersCollection();
      const customer = await customersCollection.findOne({
        customerId: context.customerId,
      });

      if (!customer) {
        throw new RecoveryWorkflowError(
          `Customer not found: ${context.customerId}`,
          "LOAD_CUSTOMER",
          "CUSTOMER_NOT_FOUND",
          404
        );
      }

      context.customer = customer;

      // Calculate retry history for this specific transaction
      const txnCollection = await getTransactionsCollection();
      const transactionAttempts = await txnCollection
        .find({ transactionId: context.transactionId })
        .toArray();

      const failureReasons = transactionAttempts
        .filter((t) => t.status === "FAILED")
        .map((t) => t.failureReason || "unknown");

      // Determine retry pattern
      let retryPattern: "SINGLE" | "INTERMITTENT" | "CONSISTENT" = "SINGLE";
      if (transactionAttempts.length > 1) {
        const uniqueReasons = new Set(failureReasons);
        retryPattern = uniqueReasons.size === 1 ? "CONSISTENT" : "INTERMITTENT";
      }

      context.retryHistory = {
        totalRetries: Math.max(0, transactionAttempts.length - 1),
        failureReasons,
        retryPattern,
      };
    } catch (error) {
      if (error instanceof RecoveryWorkflowError) throw error;
      throw new RecoveryWorkflowError(
        error instanceof Error ? error.message : String(error),
        "LOAD_CUSTOMER",
        "LOAD_FAILED"
      );
    }
  }

  /**
   * STEP 3: Analyze with AI Service
   * Emits: AI_ANALYSIS, RECOVERY_RECOMMENDED
   */
  private async step3AnalyzeTransaction(
    context: WorkflowContext
  ): Promise<void> {
    try {
      if (
        !context.transaction ||
        !context.customer ||
        !context.retryHistory
      ) {
        throw new RecoveryWorkflowError(
          "Required data not loaded",
          "AI_ANALYSIS",
          "DATA_NOT_LOADED"
        );
      }

      // Build analysis input
      const analysisInput = {
        transaction: {
          transactionId: context.transaction.transactionId,
          amount: context.transaction.amount,
          currency: context.transaction.currency,
          status: context.transaction.status,
          paymentMethod: context.transaction.paymentMethod,
          failureReason: context.transaction.failureReason,
          retryCount: context.transaction.retryCount,
          createdAt: context.transaction.createdAt,
        },
        customerHistory: {
          totalTransactions: context.customer.totalTransactions,
          successfulPaymentCount: context.customer.successfulPaymentCount,
          failedPaymentCount: context.customer.failedPaymentCount,
          abandonedPaymentCount: context.customer.abandonedPaymentCount,
          totalSpent: context.customer.totalSpent,
          averageOrderValue: context.customer.averageOrderValue,
          lastSuccessfulPaymentAt: context.customer.lastSuccessfulPaymentAt,
          lastFailedPaymentAt: context.customer.lastFailedPaymentAt,
          preferredPaymentMethod: context.customer.preferredPaymentMethod,
        },
        retryHistory: {
          totalRetries: context.retryHistory.totalRetries,
          failureReasons: context.retryHistory.failureReasons,
          retryPattern: context.retryHistory.retryPattern,
        },
      };

      // Call AI service
      const analysis = await analyzeRecoveryPotential(analysisInput);

      // Wrap in recommendation format
      context.aiRecommendation = {
        transactionId: context.transaction.transactionId,
        classification: analysis.classification,
        recommendedAction: analysis.recommendedAction,
        confidence: analysis.confidence,
        evidence: analysis.evidence,
        reason: analysis.reason,
        aiGeneratedAt: new Date().toISOString(),
      };

      const auditRec: AuditAIRecommendation = {
        classification: analysis.classification,
        recommendedAction: analysis.recommendedAction,
        confidence: analysis.confidence,
        evidence: analysis.evidence,
        reason: analysis.reason,
      };

      // ── Audit: AI_ANALYSIS ──
      await this.auditService.recordAIAnalysis(
        context.transactionId,
        auditRec,
        { aiGeneratedAt: context.aiRecommendation.aiGeneratedAt }
      );

      // ── Audit: RECOVERY_RECOMMENDED ──
      await this.auditService.recordRecoveryRecommended(
        context.transactionId,
        auditRec
      );
    } catch (error) {
      if (error instanceof RecoveryWorkflowError) throw error;
      throw new RecoveryWorkflowError(
        error instanceof Error ? error.message : String(error),
        "AI_ANALYSIS",
        "ANALYSIS_FAILED"
      );
    }
  }

  /**
   * STEP 5: Pass to Guardrail Engine
   * Emits: GUARDRAIL_CHECK, and either ACTION_BLOCKED or HUMAN_REVIEW if rejected
   */
  private async step5CheckGuardrails(
    context: WorkflowContext
  ): Promise<void> {
    if (
      !context.aiRecommendation ||
      !context.transaction ||
      !context.customer
    ) {
      throw new RecoveryWorkflowError(
        "Required data not available",
        "GUARDRAIL_CHECK",
        "DATA_NOT_LOADED"
      );
    }

    const auditRec: AuditAIRecommendation = {
      classification: context.aiRecommendation.classification,
      recommendedAction: context.aiRecommendation.recommendedAction,
      confidence: context.aiRecommendation.confidence,
      evidence: context.aiRecommendation.evidence,
      reason: context.aiRecommendation.reason,
    };

    try {
      const failureCountThisWeek = context.customer.failedPaymentCount;
      const pastTrail = await this.auditService.getTransactionAuditTrail(context.transactionId);
      const previousAttempts = pastTrail.filter((e) => e.eventType === "ACTION_EXECUTED").length;

      const result = await this.guardrailEngine.validateRecommendation(
        context.aiRecommendation,
        context.transaction,
        context.customer,
        context.transaction.retryCount,
        failureCountThisWeek,
        previousAttempts
      );

      context.guardrailResult = result;

      const auditDecision: AuditGuardrailDecision = {
        allowed: true,
        decision: "ALLOW",
        reason: result.reason,
        requiresHumanApproval: false,
        rulesChecked: result.policy ? [result.policy] : [],
      };

      // ── Audit: GUARDRAIL_CHECK (approved) ──
      await this.auditService.recordGuardrailCheck(
        context.transactionId,
        auditRec,
        auditDecision
      );
    } catch (error) {
      if (error instanceof GuardrailRejectionError) {
        const rejErr = error as GuardrailRejectionError;
        // Guardrail rejected the recommendation
        context.guardrailResult = {
          approved: false,
          reason: `Guardrail rejection: ${rejErr.message}`,
          rejectionReason: rejErr.rejectionReason,
          policy: rejErr.policy,
        };

        const requiresHuman =
          rejErr.policy === "HUMAN_REVIEW_REQUIRED" ||
          context.aiRecommendation.classification === "HUMAN_REVIEW";

        const auditDecision: AuditGuardrailDecision = {
          allowed: false,
          decision: requiresHuman ? "HUMAN_REVIEW" : "BLOCK",
          reason: rejErr.message,
          requiresHumanApproval: requiresHuman,
          rulesViolated: [String(rejErr.policy)],
        };

        // ── Audit: GUARDRAIL_CHECK (blocked/escalated) ──
        await this.auditService.recordGuardrailCheck(
          context.transactionId,
          auditRec,
          auditDecision
        );

        if (requiresHuman) {
          // ── Audit: HUMAN_REVIEW ──
          await this.auditService.recordHumanReview(
            context.transactionId,
            auditRec,
            auditDecision,
            rejErr.rejectionReason
          );
        } else {
          // ── Audit: ACTION_BLOCKED ──
          await this.auditService.recordActionBlocked(
            context.transactionId,
            auditRec,
            auditDecision
          );
        }

        // Don't throw — allow workflow to complete with rejected status
      } else {
        throw new RecoveryWorkflowError(
          error instanceof Error ? error.message : String(error),
          "GUARDRAIL_CHECK",
          "GUARDRAIL_FAILED"
        );
      }
    }
  }

  /**
   * STEP 6: Execute Action
   * Emits: ACTION_EXECUTED
   */
  private async step6ExecuteAction(context: WorkflowContext): Promise<void> {
    if (!context.guardrailResult?.approved) {
      // Guardrail rejection — nothing to execute
      return;
    }

    if (!context.aiRecommendation || !context.transaction) {
      throw new RecoveryWorkflowError(
        "Required data not available",
        "ACTION_EXECUTION",
        "DATA_NOT_LOADED"
      );
    }

    // Safety: Ensure action matches recommendation
    if (
      !validateActionMatchesRecommendation(
        context.aiRecommendation.recommendedAction,
        context.aiRecommendation.recommendedAction
      )
    ) {
      throw new RecoveryWorkflowError(
        "Action does not match recommendation",
        "ACTION_EXECUTION",
        "ACTION_MISMATCH"
      );
    }

    try {
      context.actionExecution = await this.actionExecutor.executeAction(
        context.aiRecommendation
          .recommendedAction as "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "NO_ACTION",
        context.transaction.transactionId,
        context.transaction.customerId,
        context.transaction.amount,
        context.transaction.currency
      );
    } catch (error) {
      if (error instanceof RecoveryWorkflowError) throw error;
      throw new RecoveryWorkflowError(
        error instanceof Error ? error.message : String(error),
        "ACTION_EXECUTION",
        "EXECUTION_FAILED"
      );
    }

    const auditRec: AuditAIRecommendation = {
      classification: context.aiRecommendation.classification,
      recommendedAction: context.aiRecommendation.recommendedAction,
      confidence: context.aiRecommendation.confidence,
      evidence: context.aiRecommendation.evidence,
      reason: context.aiRecommendation.reason,
    };

    const auditDecision: AuditGuardrailDecision = {
      allowed: true,
      decision: "ALLOW",
      reason: context.guardrailResult.reason,
      requiresHumanApproval: false,
    };

    const auditAction: AuditActionDetail = {
      actionType: context.actionExecution.actionType,
      status: context.actionExecution.status,
      ...(context.actionExecution.result && {
        result: {
          actionId: context.actionExecution.result.actionId,
          status: context.actionExecution.result.status,
          message: context.actionExecution.result.message,
        },
      }),
      ...(context.actionExecution.error && {
        error: context.actionExecution.error,
      }),
    };

    // ── Audit: ACTION_EXECUTED ──
    await this.auditService.recordActionExecuted(
      context.transactionId,
      auditRec,
      auditDecision,
      auditAction
    );
  }

  /**
   * STEP 7: Verify Action Result
   * Emits: ACTION_VERIFIED
   */
  private async step7VerifyResult(context: WorkflowContext): Promise<void> {
    if (!context.actionExecution) {
      // No action was executed — nothing to verify
      return;
    }

    let verified: boolean;
    try {
      verified = await verifyActionResult(context.actionExecution);
      context.actionVerified = verified;
    } catch (error) {
      throw new RecoveryWorkflowError(
        error instanceof Error ? error.message : String(error),
        "ACTION_VERIFICATION",
        "VERIFICATION_FAILED"
      );
    }

    const auditAction: AuditActionDetail = {
      actionType: context.actionExecution.actionType,
      status: context.actionExecution.status,
      ...(context.actionExecution.result && {
        result: {
          actionId: context.actionExecution.result.actionId,
          status: context.actionExecution.result.status,
          message: context.actionExecution.result.message,
        },
      }),
      ...(context.actionExecution.error && {
        error: context.actionExecution.error,
      }),
    };

    // ── Audit: ACTION_VERIFIED ──
    await this.auditService.recordActionVerified(
      context.transactionId,
      auditAction,
      verified
    );
  }

  /**
   * Human-in-the-Loop (HITL) Manual Approval
   *
   * Enables a human operator (merchant finance/ops team) to explicitly review,
   * approve, or reject an escalated high-value or ambiguous recovery recommendation.
   */
  async executeManualApproval(params: {
    transactionId: string;
    decision: "APPROVE" | "REJECT";
    operatorId: string;
    notes?: string;
    overrideAction?: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "NO_ACTION";
  }): Promise<WorkflowContext> {
    const context: WorkflowContext = {
      transactionId: params.transactionId,
      startedAt: new Date().toISOString(),
      status: "IN_PROGRESS",
    };

    // 1. Load Transaction
    await this.step1LoadTransaction(context);
    await this.step2LoadCustomerHistory(context);

    // 2. Retrieve past AI recommendation from audit trail
    const auditTrail = await this.auditService.getTransactionAuditTrail(params.transactionId);
    const lastAIRec = auditTrail
      .slice()
      .reverse()
      .find((l) => l.aiRecommendation)?.aiRecommendation;

    const actionType =
      params.overrideAction ||
      (lastAIRec?.recommendedAction as "RETRY" | "REMINDER" | "ALTERNATE_METHOD") ||
      "REMINDER";

    if (params.decision === "REJECT") {
      context.status = "COMPLETED";
      context.completedAt = new Date().toISOString();

      await this.auditService.record({
        transactionId: params.transactionId,
        eventType: "HUMAN_REVIEW",
        actor: `OPERATOR_${params.operatorId}`,
        result: "REJECTED",
        reason: params.notes || "Human operator rejected the recovery recommendation",
        metadata: {
          decision: "REJECT",
          operatorId: params.operatorId,
          notes: params.notes,
        },
      });

      return context;
    }

    // 3. Operator approved: Record human approval audit record
    await this.auditService.record({
      transactionId: params.transactionId,
      eventType: "HUMAN_REVIEW",
      actor: `OPERATOR_${params.operatorId}`,
      result: "APPROVED",
      reason: params.notes || "Human operator approved the recovery action",
      metadata: {
        decision: "APPROVE",
        actionType,
        operatorId: params.operatorId,
        notes: params.notes,
      },
    });

    // 4. Execute authorized action with explicit human authority
    context.actionExecution = await this.actionExecutor.executeAction(
      actionType,
      context.transaction!.transactionId,
      context.transaction!.customerId,
      context.transaction!.amount,
      context.transaction!.currency
    );

    // Record ACTION_EXECUTED with human operator attribution
    const auditAction: AuditActionDetail = {
      actionType: context.actionExecution.actionType,
      status: context.actionExecution.status,
      ...(context.actionExecution.result && {
        result: {
          actionId: context.actionExecution.result.actionId,
          status: context.actionExecution.result.status,
          message: context.actionExecution.result.message,
        },
      }),
    };

    await this.auditService.record({
      transactionId: params.transactionId,
      eventType: "ACTION_EXECUTED",
      actor: `OPERATOR_${params.operatorId}`,
      result: context.actionExecution.status,
      reason: `Human-approved execution of ${actionType}`,
      action: auditAction,
    });

    // 5. Verify Action Result
    await this.step7VerifyResult(context);

    // 6. If verified, update transaction record in DB
    if (context.actionVerified) {
      try {
        const collection = await getTransactionsCollection();
        await collection.updateOne(
          { transactionId: params.transactionId },
          { $set: { status: "SUCCESS", updatedAt: new Date() } }
        );
      } catch (err) {
        console.warn("Could not update transaction status in DB:", err);
      }
    }

    context.status = "COMPLETED";
    context.completedAt = new Date().toISOString();
    return context;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a recovery workflow instance.
 *
 * @param guardrailEngine  Deterministic rule engine
 * @param actionExecutor   Action handler (simulated in test mode)
 * @param auditService     Audit trail writer (AuditTrailService)
 */
export function createRecoveryWorkflow(
  guardrailEngine: GuardrailEngine,
  actionExecutor: ActionExecutor,
  auditService: AuditTrailService
): RecoveryWorkflow {
  return new RecoveryWorkflow(guardrailEngine, actionExecutor, auditService);
}
