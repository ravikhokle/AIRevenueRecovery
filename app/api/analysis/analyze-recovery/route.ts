import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  analyzeRecoveryPotential,
  logAnalysisError,
  logAnalysisResult,
} from "@/lib/ai/analysis";
import {
  LLMApiError,
  MalformedResponseError,
  ValidationError,
  sanitizeErrorForLogging,
} from "@/lib/ai/errors";
import { getCustomersCollection } from "@/lib/models/customer";
import { getTransactionsCollection } from "@/lib/models/transaction";
import type { RecoveryAnalysisResponse } from "@/lib/ai/schemas";

/**
 * Request validation schema
 */
const AnalyzeTransactionRequestSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
});

type AnalyzeTransactionRequest = z.infer<
  typeof AnalyzeTransactionRequestSchema
>;

/**
 * POST /api/analysis/analyze-recovery
 *
 * Analyze a failed transaction to determine recovery potential
 *
 * Request body:
 * {
 *   "transactionId": "string"
 * }
 *
 * Response:
 * {
 *   "data": {
 *     "classification": "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW",
 *     "reason": "string",
 *     "recommendedAction": "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "HUMAN_REVIEW" | "NO_ACTION",
 *     "confidence": 0.0-1.0,
 *     "evidence": ["string", ...]
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validation = AnalyzeTransactionRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { transactionId } = validation.data as AnalyzeTransactionRequest;

    // Fetch transaction from database
    const transactionsCollection = await getTransactionsCollection();
    const transaction = await transactionsCollection.findOne({
      transactionId,
    });

    if (!transaction) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `Transaction with ID '${transactionId}' not found`,
        },
        { status: 404 },
      );
    }

    // Only analyze failed or abandoned transactions
    if (transaction.status !== "FAILED" && transaction.status !== "ABANDONED") {
      return NextResponse.json(
        {
          error: "Invalid transaction status",
          message: `Can only analyze FAILED or ABANDONED transactions, got ${transaction.status}`,
        },
        { status: 400 },
      );
    }

    // Fetch customer history
    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({
      customerId: transaction.customerId,
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Not found",
          message: `Customer with ID '${transaction.customerId}' not found`,
        },
        { status: 404 },
      );
    }

    // Calculate retry history for this transaction
    const transactionRetries = await transactionsCollection
      .find({
        transactionId,
      })
      .toArray();

    const failureReasons = transactionRetries
      .filter((t) => t.status === "FAILED")
      .map((t) => t.failureReason || "unknown")
      .filter((reason, index, self) => self.indexOf(reason) === index);

    // Determine retry pattern
    let retryPattern: "CONSISTENT" | "INTERMITTENT" | "SINGLE" = "SINGLE";
    if (transactionRetries.length > 1) {
      const failureReasonSet = new Set(failureReasons);
      retryPattern =
        failureReasonSet.size === 1 ? "CONSISTENT" : "INTERMITTENT";
    }

    // Prepare analysis input
    const analysisInput = {
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        failureReason: transaction.failureReason,
        retryCount: transaction.retryCount,
        createdAt: transaction.createdAt,
      },
      customerHistory: {
        totalTransactions: customer.totalTransactions,
        successfulPaymentCount: customer.successfulPaymentCount,
        failedPaymentCount: customer.failedPaymentCount,
        abandonedPaymentCount: customer.abandonedPaymentCount,
        totalSpent: customer.totalSpent,
        averageOrderValue: customer.averageOrderValue,
        lastSuccessfulPaymentAt: customer.lastSuccessfulPaymentAt,
        lastFailedPaymentAt: customer.lastFailedPaymentAt,
        preferredPaymentMethod: customer.preferredPaymentMethod,
      },
      retryHistory: {
        totalRetries: transactionRetries.length - 1,
        failureReasons,
        lastRetryAt:
          transactionRetries.length > 0
            ? transactionRetries[transactionRetries.length - 1].createdAt
            : null,
        retryPattern,
      },
    };

    // Run AI analysis
    const analysis: RecoveryAnalysisResponse =
      await analyzeRecoveryPotential(analysisInput);

    // Log success
    logAnalysisResult(transactionId, analysis);

    return NextResponse.json({
      data: analysis,
      metadata: {
        transactionId,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const transactionId =
      typeof (error as any)?.transactionId === "string"
        ? (error as any).transactionId
        : "unknown";

    if (error instanceof ValidationError) {
      logAnalysisError(transactionId, error);
      return NextResponse.json(
        {
          error: "Validation failed",
          message: error.message,
          details: error.fieldErrors,
        },
        { status: 400 },
      );
    }

    if (error instanceof MalformedResponseError) {
      logAnalysisError(transactionId, error);
      return NextResponse.json(
        {
          error: "Invalid LLM response",
          message: error.message,
        },
        { status: 500 },
      );
    }

    if (error instanceof LLMApiError) {
      logAnalysisError(transactionId, error);

      if (error.status === 401) {
        return NextResponse.json(
          {
            error: "Authentication failed",
            message: "OpenAI API authentication failed",
          },
          { status: 503 },
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          {
            error: "Rate limited",
            message: "OpenAI API rate limit exceeded. Please retry later.",
          },
          { status: 429 },
        );
      }

      if (error.status === 404) {
        return NextResponse.json(
          {
            error: "Model not found",
            message: "OpenAI model not found",
          },
          { status: 503 },
        );
      }

      return NextResponse.json(
        {
          error: "LLM error",
          message: error.message,
        },
        { status: 503 },
      );
    }

    const sanitized = sanitizeErrorForLogging(error);
    logAnalysisError(transactionId, error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: sanitized.message,
      },
      { status: 500 },
    );
  }
}
