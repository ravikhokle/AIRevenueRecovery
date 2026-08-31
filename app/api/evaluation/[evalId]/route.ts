import { NextRequest, NextResponse } from "next/server";

import { DatabaseConnectionError } from "@/lib/db";
import {
  getEvalRunCollection,
  ensureEvalRunIndexes,
} from "@/lib/models/evaluation-run";

/**
 * GET /api/evaluation/[evalId]
 *
 * Retrieve a single evaluation run by evalId.
 * Includes the full per-transaction records array and the human-readable summary.
 *
 * Query parameters:
 *   format – "json" (default) | "text"
 *     When format=text, returns the humanReadableSummary as plain text.
 *
 * Response 200: full EvaluationResult document
 * Response 400: missing evalId
 * Response 404: no run found
 * Response 500: unexpected error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evalId: string }> }
): Promise<NextResponse> {
  try {
    const { evalId } = await params;

    if (!evalId || typeof evalId !== "string" || evalId.trim() === "") {
      return NextResponse.json(
        {
          error: "Bad request",
          message: "evalId is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    await ensureEvalRunIndexes();
    const collection = await getEvalRunCollection();
    const run = await collection.findOne({ evalId });

    if (!run) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `No evaluation run found with ID '${evalId}'`,
        },
        { status: 404 }
      );
    }

    const format = request.nextUrl.searchParams.get("format");

    // Plain-text format: return human-readable summary directly
    if (format === "text") {
      const text = run.humanReadableSummary ?? "Summary not yet available.";
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({ data: run });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch evaluation run";

    console.error("GET /api/evaluation/[evalId] error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
