import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { DatabaseConnectionError, getDb } from "@/lib/db";
import {
  ensureTransactionIndexes,
  getTransactionsCollection,
} from "@/lib/models/transaction";
import {
  TRANSACTION_STATUSES,
  type Transaction,
  type TransactionStatus,
} from "@/types/transaction";

/**
 * Validation schemas
 */
const CreateTransactionSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  orderId: z.string().min(1, "Order ID is required"),
  amount: z.number().int().positive("Amount must be a positive integer"),
  currency: z.string().length(3, "Currency must be a 3-letter code"),
  status: z.enum(["SUCCESS", "FAILED", "PENDING", "ABANDONED"] as const),
  paymentMethod: z.string().min(1, "Payment method is required"),
  failureReason: z.string().nullable().optional(),
  retryCount: z.number().int().min(0, "Retry count cannot be negative"),
});

type CreateTransactionRequest = z.infer<typeof CreateTransactionSchema>;

/**
 * GET /api/transactions
 * 
 * Fetch transactions with optional filtering
 * 
 * Query parameters:
 * - status: Filter by transaction status (SUCCESS, FAILED, PENDING, ABANDONED)
 * - limit: Maximum number of transactions to return (default: 50, max: 1000)
 * - skip: Number of transactions to skip for pagination (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    await ensureTransactionIndexes();
    const collection = await getTransactionsCollection();

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get("status");
    const limitParam = searchParams.get("limit");
    const skipParam = searchParams.get("skip");

    // Validate query parameters
    let filter: Record<string, unknown> = {};

    if (statusParam) {
      if (!TRANSACTION_STATUSES.includes(statusParam as TransactionStatus)) {
        return NextResponse.json(
          {
            error: "Invalid status",
            message: `Status must be one of: ${TRANSACTION_STATUSES.join(", ")}`,
          },
          { status: 400 },
        );
      }
      filter.status = statusParam;
    }

    const limit = Math.min(
      Math.max(parseInt(limitParam || "50"), 1),
      1000,
    );
    const skip = Math.max(parseInt(skipParam || "0"), 0);

    // Query transactions
    const [transactions, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return NextResponse.json({
      data: transactions,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch transactions";

    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/transactions
 * 
 * Create a new transaction
 * 
 * Request body:
 * {
 *   "transactionId": string,
 *   "customerId": string,
 *   "orderId": string,
 *   "amount": number (integer, positive),
 *   "currency": string (3-letter code, e.g., "INR"),
 *   "status": "SUCCESS" | "FAILED" | "PENDING" | "ABANDONED",
 *   "paymentMethod": string,
 *   "failureReason": string | null (optional),
 *   "retryCount": number (integer, non-negative)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validationResult = CreateTransactionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = validationResult.data as CreateTransactionRequest;

    await ensureTransactionIndexes();
    const collection = await getTransactionsCollection();

    // Check if transaction ID already exists
    const existing = await collection.findOne({
      transactionId: data.transactionId,
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "Conflict",
          message: `Transaction with ID '${data.transactionId}' already exists`,
        },
        { status: 409 },
      );
    }

    // Create transaction document
    const now = new Date();
    const transaction: Transaction = {
      ...data,
      failureReason: data.failureReason ?? null,
      createdAt: now,
      updatedAt: now,
    };

    // Insert transaction
    const result = await collection.insertOne(transaction);

    return NextResponse.json(
      {
        data: {
          ...transaction,
          _id: result.insertedId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON", message: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to create transaction";

    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 },
    );
  }
}
