import { NextRequest, NextResponse } from "next/server";

import { DatabaseConnectionError } from "@/lib/db";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { ensureAuditLogIndexes } from "@/lib/models/audit-log";

/**
 * GET /api/audit/[transactionId]
 *
 * Retrieve the complete, ordered audit trail for a specific transaction.
 *
 * Path parameters:
 *   transactionId – the transaction whose audit history to fetch
 *
 * Response:
 * {
 *   "transactionId": string,
 *   "totalEvents": number,
 *   "trail": AuditLog[],       // ordered oldest → newest
 *   "summary": {
 *     "eventTypes": string[],  // deduplicated list of event types present
 *     "firstEvent": string,    // ISO timestamp of earliest event
 *     "lastEvent": string,     // ISO timestamp of latest event
 *     "finalResult": string    // result of the last recorded event
 *   }
 * }
 *
 * Returns 404 if no audit records exist for the transaction.
 * Returns 400 if the transactionId is missing or empty.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
): Promise<NextResponse> {
  try {
    const { transactionId } = await params;

    if (!transactionId || typeof transactionId !== "string" || transactionId.trim() === "") {
      return NextResponse.json(
        {
          error: "Bad request",
          message: "transactionId is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    await ensureAuditLogIndexes();
    const service = await getAuditTrailService();
    const trail = await service.getTransactionAuditTrail(transactionId);

    if (trail.length === 0) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `No audit records found for transaction '${transactionId}'`,
        },
        { status: 404 }
      );
    }

    // Build summary
    const eventTypes = [...new Set(trail.map((e) => e.eventType))];
    const firstEvent = trail[0].timestamp;
    const lastEvent = trail[trail.length - 1].timestamp;
    const finalResult = trail[trail.length - 1].result;

    return NextResponse.json({
      transactionId,
      totalEvents: trail.length,
      trail,
      summary: {
        eventTypes,
        firstEvent,
        lastEvent,
        finalResult,
      },
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch audit trail";

    console.error("GET /api/audit/[transactionId] error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
