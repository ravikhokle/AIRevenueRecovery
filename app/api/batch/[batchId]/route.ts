import { NextRequest, NextResponse } from "next/server";

import { DatabaseConnectionError } from "@/lib/db";
import {
  getBatchRunCollection,
  ensureBatchRunIndexes,
} from "@/lib/models/batch-run";

/**
 * GET /api/batch/[batchId]
 *
 * Retrieve a single batch run by its batchId, including the full
 * per-transaction outcomes array.
 *
 * Path parameters:
 *   batchId – the batch run identifier (format: batch_<hex24>)
 *
 * Response 200: BatchRun (full document including summary.outcomes)
 * Response 400: missing or empty batchId
 * Response 404: no batch run found for this ID
 * Response 500: unexpected error
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
): Promise<NextResponse> {
  try {
    const { batchId } = await params;

    if (!batchId || typeof batchId !== "string" || batchId.trim() === "") {
      return NextResponse.json(
        {
          error: "Bad request",
          message: "batchId is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    await ensureBatchRunIndexes();
    const collection = await getBatchRunCollection();

    const run = await collection.findOne({ batchId });

    if (!run) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `No batch run found with ID '${batchId}'`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: run });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch batch run";

    console.error("GET /api/batch/[batchId] error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
