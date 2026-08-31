import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { DatabaseConnectionError } from "@/lib/db";
import { createBatchProcessor } from "@/lib/batch";

/**
 * POST /api/batch/recovery
 *
 * Trigger a batch revenue recovery run over the synthetic transaction dataset.
 * Processing is serial — one transaction at a time — so the LLM API is never
 * overwhelmed. A single failed transaction does not stop the batch.
 *
 * Request body (all fields optional):
 * {
 *   "delayMs": 1000,    // ms to wait between LLM calls (default: 1000)
 *   "limit":  100,      // max transactions to process (default: all eligible)
 *   "dryRun": false     // skip real AI + DB writes (default: false)
 * }
 *
 * Response 200:
 * {
 *   "batchId":     "batch_<hex>",
 *   "status":      "COMPLETED",
 *   "summary":     BatchSummary,
 *   "durationMs":  number,
 *   "seedVersion": number
 * }
 *
 * Response 400: validation error
 * Response 503: database unavailable
 * Response 500: unexpected error
 */

const RequestSchema = z.object({
  delayMs: z
    .number()
    .int()
    .min(0, "delayMs must be >= 0")
    .max(30_000, "delayMs must be <= 30000")
    .optional(),
  limit: z
    .number()
    .int()
    .min(1, "limit must be >= 1")
    .max(10_000, "limit must be <= 10000")
    .optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse request body (allow empty body = all defaults)
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const validation = RequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: validation.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { delayMs, limit, dryRun } = validation.data;

  try {
    const processor = createBatchProcessor({ delayMs, limit, dryRun });
    const run = await processor.run();

    return NextResponse.json(
      {
        batchId: run.batchId,
        status: run.status,
        summary: run.summary,
        durationMs: run.summary?.durationMs ?? 0,
        seedVersion: run.summary?.seedVersion ?? 1,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      return NextResponse.json(
        { error: "Database unavailable", message: error.message },
        { status: 503 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Batch processing failed";

    console.error("POST /api/batch/recovery error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
