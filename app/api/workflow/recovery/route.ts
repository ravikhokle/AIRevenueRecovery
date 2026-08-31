import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGuardrailEngine } from "@/lib/workflow/guardrails";
import { createActionExecutor } from "@/lib/workflow/actions";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { createRecoveryWorkflow } from "@/lib/workflow/recovery-workflow";
import { RecoveryWorkflowError } from "@/lib/workflow/types";

/**
 * Recovery Workflow API
 * 
 * Endpoint: POST /api/workflow/recovery
 * 
 * Request body:
 * {
 *   "transactionId": "string"
 * }
 * 
 * Response:
 * {
 *   "workflowId": "string",
 *   "transactionId": "string",
 *   "status": "COMPLETED" | "FAILED" | "PENDING",
 *   "result": {
 *     "classification": "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW",
 *     "recommendedAction": "RETRY" | "REMINDER" | "...",
 *     "guardrailApproved": boolean,
 *     "actionExecuted": boolean,
 *     "actionVerified": boolean
 *   },
 *   "metadata": {
 *     "startedAt": "ISO timestamp",
 *     "completedAt": "ISO timestamp",
 *     "executionTimeMs": number
 *   }
 * }
 */

const RecoverWorkflowRequestSchema = z.object({
  transactionId: z
    .string()
    .min(1, "Transaction ID is required")
    .max(100, "Transaction ID too long"),
});

type RecoveryWorkflowRequest = z.infer<typeof RecoverWorkflowRequestSchema>;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request
    const body = await request.json();
    const validation = RecoverWorkflowRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { transactionId } = validation.data;

    // Initialize workflow components
    let auditService;
    try {
      auditService = await getAuditTrailService();
    } catch (error) {
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }

    const guardrailEngine = createGuardrailEngine();
    const actionExecutor = createActionExecutor();
    const workflow = createRecoveryWorkflow(
      guardrailEngine,
      actionExecutor,
      auditService
    );

    // Execute workflow
    let context;
    try {
      context = await workflow.executeWorkflow(transactionId);
    } catch (error) {
      if (error instanceof RecoveryWorkflowError) {
        const statusCode = error.statusCode || 500;
        return NextResponse.json(
          {
            error: error.message,
            stage: error.stage,
            code: error.code,
          },
          { status: statusCode }
        );
      }

      throw error;
    }

    // Build response
    const executionTimeMs = context.completedAt
      ? new Date(context.completedAt).getTime() -
        new Date(context.startedAt).getTime()
      : 0;

    // Determine final status
    let finalStatus = "PENDING";
    if (context.guardrailResult?.approved === false) {
      finalStatus = "REJECTED";
    } else if (context.actionExecution && !context.actionVerified) {
      finalStatus = "FAILED";
    } else if (context.actionExecution && context.actionVerified) {
      finalStatus = "COMPLETED";
    } else if (context.status === "FAILED") {
      finalStatus = "FAILED";
    } else {
      finalStatus = context.status === "COMPLETED" ? "COMPLETED" : "PENDING";
    }

    return NextResponse.json(
      {
        workflowId: context.auditEvent?.auditId || "unknown",
        transactionId: context.transactionId,
        status: finalStatus,
        result: {
          classification: context.aiRecommendation?.classification || "UNKNOWN",
          recommendedAction: context.aiRecommendation?.recommendedAction || "UNKNOWN",
          reason: context.aiRecommendation?.reason || "",
          confidence: context.aiRecommendation?.confidence || 0,
          evidence: context.aiRecommendation?.evidence || [],
          guardrailApproved: context.guardrailResult?.approved || false,
          guardrailRejectionReason: context.guardrailResult?.rejectionReason,
          guardrailPolicy: context.guardrailResult?.policy,
          actionExecuted: !!context.actionExecution,
          actionType: context.actionExecution?.actionType,
          actionStatus: context.actionExecution?.status,
          actionVerified: context.actionVerified || false,
        },
        metadata: {
          startedAt: context.startedAt,
          completedAt: context.completedAt,
          executionTimeMs,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
