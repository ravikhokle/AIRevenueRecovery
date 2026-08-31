import { NextRequest, NextResponse } from "next/server";

import { DatabaseConnectionError } from "@/lib/db";
import { getAuditTrailService } from "@/lib/workflow/audit";
import { ensureAuditLogIndexes } from "@/lib/models/audit-log";
import type { AuditEventType } from "@/types/audit-log";

const VALID_EVENT_TYPES: AuditEventType[] = [
  "PAYMENT_DETECTED",
  "AI_ANALYSIS",
  "RECOVERY_RECOMMENDED",
  "GUARDRAIL_CHECK",
  "ACTION_EXECUTED",
  "ACTION_BLOCKED",
  "HUMAN_REVIEW",
  "ACTION_VERIFIED",
  "ERROR",
];

/**
 * GET /api/audit
 *
 * List audit log entries, optionally filtered by eventType.
 *
 * Query parameters:
 *   eventType  – filter to a specific AuditEventType (optional)
 *   limit      – max records to return (default: 50, max: 500)
 *   skip       – number of records to skip for pagination (default: 0)
 *
 * Response:
 * {
 *   "data": AuditLog[],
 *   "pagination": { "limit": number, "skip": number }
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureAuditLogIndexes();

    const searchParams = request.nextUrl.searchParams;
    const eventTypeParam = searchParams.get("eventType");
    const limitParam = searchParams.get("limit");
    const skipParam = searchParams.get("skip");

    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10), 1), 500);
    const skip = Math.max(parseInt(skipParam || "0", 10), 0);

    const service = await getAuditTrailService();

    // If an eventType filter is provided, validate and query by type
    if (eventTypeParam) {
      if (!VALID_EVENT_TYPES.includes(eventTypeParam as AuditEventType)) {
        return NextResponse.json(
          {
            error: "Invalid eventType",
            message: `eventType must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const logs = await service.getLogsByEventType(
        eventTypeParam as AuditEventType,
        limit,
        skip
      );

      return NextResponse.json({
        data: logs,
        pagination: { limit, skip },
      });
    }

    // Otherwise return latest logs across all event types
    const { getAuditLogCollection } = await import("@/lib/models/audit-log");
    const collection = await getAuditLogCollection();
    const logs = await collection
      .find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      data: logs,
      pagination: { limit, skip },
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch audit logs";

    console.error("GET /api/audit error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
