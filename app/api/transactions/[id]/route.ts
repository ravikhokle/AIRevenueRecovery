import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { DatabaseConnectionError } from "@/lib/db";
import {
  ensureTransactionIndexes,
  getTransactionsCollection,
} from "@/lib/models/transaction";

/**
 * GET /api/transactions/[id]
 * 
 * Fetch a single transaction by its transactionId
 * 
 * Parameters:
 * - id: The transactionId (not MongoDB _id)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json(
        {
          error: "Bad request",
          message: "Transaction ID is required and must be a non-empty string",
        },
        { status: 400 },
      );
    }

    await ensureTransactionIndexes();
    const collection = await getTransactionsCollection();

    // Query by transactionId, not MongoDB _id
    const transaction = await collection.findOne({
      transactionId: id,
    });

    if (!transaction) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `Transaction with ID '${id}' not found`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: transaction,
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch transaction";

    console.error("GET /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}
