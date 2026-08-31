import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { DatabaseConnectionError } from "@/lib/db";
import { createEvaluationRunner } from "@/lib/evaluation";
import { generateJsonReport } from "@/lib/evaluation/report";

/**
 * POST /api/evaluation
 *
 * Trigger an evaluation run against the held-out evaluation dataset
 * (seedVersion 2 — separate from the development dataset).
 *
 * Request body (all optional):
 * {
 *   "delayMs": 1000,   // ms between LLM calls (default: 1000, max: 30000)
 *   "limit":   50,     // max transactions to evaluate (default: all eligible)
 *   "dryRun":  false   // skip real AI calls (default: false)
 * }
 *
 * Response 200:
 * {
 *   "evalId":               "eval_run_<hex>",
 *   "status":               "COMPLETED",
 *   "datasetSeedVersion":   2,
 *   "durationMs":           number,
 *   "classificationMetrics": { ... },
 *   "businessMetrics":      { ... },
 *   "safetyMetrics":        { ... },
 *   "datasetSummary":       { ... },
 *   "humanReadableSummary": "string",
 *   "jsonReport":           { ... }   // machine-readable, records excluded
 * }
 */

const RequestSchema = z.object({
  delayMs: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
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
    const runner = createEvaluationRunner({ delayMs, limit, dryRun });
    const result = await runner.run();

    return NextResponse.json(
      {
        evalId: result.evalId,
        status: result.status,
        datasetSeedVersion: result.datasetSeedVersion,
        durationMs: result.durationMs,
        classificationMetrics: result.classificationMetrics,
        businessMetrics: result.businessMetrics,
        safetyMetrics: result.safetyMetrics,
        datasetSummary: result.datasetSummary,
        humanReadableSummary: result.humanReadableSummary,
        jsonReport: JSON.parse(generateJsonReport(result)),
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
      error instanceof Error ? error.message : "Evaluation failed";

    console.error("POST /api/evaluation error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluation
 *
 * List recent evaluation runs, newest first.
 *
 * Query parameters:
 *   limit  – max records (default: 20, max: 100)
 *   skip   – pagination offset (default: 0)
 *   status – "RUNNING" | "COMPLETED" | "FAILED" (optional filter)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { getEvalRunCollection, ensureEvalRunIndexes } = await import(
      "@/lib/models/evaluation-run"
    );

    await ensureEvalRunIndexes();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "20", 10), 1),
      100
    );
    const skip = Math.max(parseInt(searchParams.get("skip") || "0", 10), 0);
    const statusParam = searchParams.get("status");

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
    const collection = await getEvalRunCollection();

    // Omit per-transaction records and human summary from list view
    const runs = await collection
      .find(filter as any)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({ records: 0, humanReadableSummary: 0 })
      .toArray();

    return NextResponse.json({ data: runs, pagination: { limit, skip } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list evaluations";
    console.error("GET /api/evaluation error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
