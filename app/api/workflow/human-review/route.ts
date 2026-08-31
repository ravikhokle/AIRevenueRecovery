import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGuardrailEngine } from "@/lib/workflow/guardrails";
import { createActionExecutor } from "@/lib/workflow/actions";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { createRecoveryWorkflow } from "@/lib/workflow/recovery-workflow";

/**
 * Human-in-the-Loop (HITL) Review Endpoint
 *
 * POST /api/workflow/human-review
 *
 * Allows merchant finance/operations teams to explicitly approve or reject
 * recovery recommendations for transactions escalated to human review.
 */
const HumanReviewSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  decision: z.enum(["APPROVE", "REJECT"]),
  operatorId: z.string().default("merchant_ops"),
  notes: z.string().optional(),
  overrideAction: z
    .enum(["RETRY", "REMINDER", "ALTERNATE_METHOD", "NO_ACTION"])
    .optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = HumanReviewSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { transactionId, decision, operatorId, notes, overrideAction } =
      validation.data;

    const auditService = await getAuditTrailService();
    const guardrailEngine = createGuardrailEngine();
    const actionExecutor = createActionExecutor();
    const workflow = createRecoveryWorkflow(
      guardrailEngine,
      actionExecutor,
      auditService
    );

    const context = await workflow.executeManualApproval({
      transactionId,
      decision,
      operatorId,
      notes,
      overrideAction,
    });

    return NextResponse.json(
      {
        transactionId: context.transactionId,
        decision,
        status: context.status,
        actionExecuted: !!context.actionExecution,
        actionVerified: context.actionVerified ?? false,
        completedAt: context.completedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Human review error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process human review";
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
