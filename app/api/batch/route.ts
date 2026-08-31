import { NextRequest, NextResponse } from "next/server";

import { DatabaseConnectionError } from "@/lib/db";
import {
  getBatchRunCollection,
  ensureBatchRunIndexes,
} from "@/lib/models/batch-run";

/**
 * GET /api/batch
 *
 * List recent batch runs, newest first.
 *
 * Query parameters:
 *   limit   – max records (default: 20, max: 100)
 *   skip    – pagination offset (default: 0)
 *   status  – filter by status: "RUNNING" | "COMPLETED" | "FAILED" (optional)
 *
 * Response 200:
 * {
 *   "data": BatchRun[],   // summary.outcomes is omitted for brevity
 *   "pagination": { "limit": number, "skip": number }
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await ensureBatchRunIndexes();

    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const skipParam = searchParams.get("skip");
    const statusParam = searchParams.get("status");

    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10), 1), 100);
    const skip = Math.max(parseInt(skipParam || "0", 10), 0);

    const VALID_STATUSES = ["RUNNING", "COMPLETED", "FAILED"];
    if (statusParam && !VALID_STATUSES.includes(statusParam)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const filter = statusParam ? { status: statusParam } : {};

    const collection = await getBatchRunCollection();

    // Exclude per-transaction outcomes array from list view to keep payloads small.
    // Callers can fetch the full detail via GET /api/batch/:batchId.
    const runs = await collection
      .find(filter as any)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({ "summary.outcomes": 0 })
      .toArray();

    return NextResponse.json({
      data: runs,
      pagination: { limit, skip },
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to list batch runs";

    console.error("GET /api/batch error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
