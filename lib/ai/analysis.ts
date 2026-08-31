import OpenAI from "openai";

import {
  LLMApiError,
  MalformedResponseError,
  ValidationError,
  sanitizeErrorForLogging,
} from "@/lib/ai/errors";
import {
  type RecoveryAnalysisInput,
  type RecoveryAnalysisResponse,
  RecoveryAnalysisInputSchema,
  RecoveryAnalysisResponseSchema,
} from "@/lib/ai/schemas";
import { getRecoveryAnalysisSystemPrompt } from "@/lib/ai/system-prompt";

/**
 * AI Revenue Recovery Analysis Service
 *
 * Analyzes failed transactions using an LLM to determine recovery strategy.
 * Handles validation, error handling, and safe logging.
 */

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new LLMApiError(
      "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
    );
  }

  return new OpenAI({ apiKey });
}

/**
 * Format analysis input into a human-readable prompt for the LLM
 */
function formatAnalysisPrompt(input: RecoveryAnalysisInput): string {
  const { transaction, customerHistory, retryHistory } = input;

  const gatewayErrorSection = transaction.gatewayError
    ? `- Gateway Error Code: ${transaction.gatewayError.code}
- Error Source: ${transaction.gatewayError.source} (Step: ${transaction.gatewayError.step})
- Error Description: ${transaction.gatewayError.description}`
    : `- Failure Reason: ${transaction.failureReason || "Unknown"}`;

  return `Analyze this failed transaction for recovery potential:

## Transaction Details
- ID: ${transaction.transactionId}
- Amount: ₹${(transaction.amount / 100).toFixed(2)} (${transaction.currency})
- Payment Method: ${transaction.paymentMethod}
${gatewayErrorSection}
- Retry Count: ${transaction.retryCount}
- Status: ${transaction.status}
- Created: ${transaction.createdAt.toISOString()}

## Customer Payment History
- Total Transactions: ${customerHistory.totalTransactions}
- Successful Payments: ${customerHistory.successfulPaymentCount}
- Failed Payments: ${customerHistory.failedPaymentCount}
- Abandoned Payments: ${customerHistory.abandonedPaymentCount}
- Total Spent: ₹${(customerHistory.totalSpent / 100).toFixed(2)}
- Average Order Value: ₹${(customerHistory.averageOrderValue / 100).toFixed(2)}
- Success Rate: ${((customerHistory.successfulPaymentCount / Math.max(customerHistory.totalTransactions, 1)) * 100).toFixed(1)}%
- Last Successful Payment: ${customerHistory.lastSuccessfulPaymentAt?.toISOString() || "None"}
- Last Failed Payment: ${customerHistory.lastFailedPaymentAt?.toISOString() || "None"}
- Preferred Payment Method: ${customerHistory.preferredPaymentMethod || "Not determined"}

## Retry History
- Total Retries: ${retryHistory.totalRetries}
- Failure Reasons: ${retryHistory.failureReasons.length === 0 ? "None" : retryHistory.failureReasons.join(", ")}
- Retry Pattern: ${retryHistory.retryPattern}
- Last Retry: ${retryHistory.lastRetryAt?.toISOString() || "Never"}

Based on this data, provide your recovery analysis in JSON format.`;
}

/**
 * Analyze a failed transaction for recovery potential
 *
 * @param input - Transaction, customer history, and retry information
 * @returns Analysis result with classification and recommendation
 * @throws {ValidationError} If input validation fails
 * @throws {LLMApiError} If OpenAI API call fails
 * @throws {MalformedResponseError} If LLM returns invalid JSON
 */
export async function analyzeRecoveryPotential(
  input: unknown,
): Promise<RecoveryAnalysisResponse> {
  // Validate input
  const inputValidation = RecoveryAnalysisInputSchema.safeParse(input);
  if (!inputValidation.success) {
    const errors = inputValidation.error.flatten().fieldErrors;
    throw new ValidationError("Invalid recovery analysis input", errors);
  }

  const validatedInput = inputValidation.data;

  try {
    const client = getOpenAIClient();
    const systemPrompt = getRecoveryAnalysisSystemPrompt();
    const userPrompt = formatAnalysisPrompt(validatedInput);

    // Call OpenAI API
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      temperature: 0.3, // Lower temperature for deterministic analysis
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract text content from response
    const content = response.choices[0];
    if (!content || !content.message || content.message.content === null) {
      throw new MalformedResponseError(
        "LLM returned empty response",
        JSON.stringify(response),
      );
    }

    const responseText = content.message.content;

    // Parse JSON from response
    // Handle case where LLM wraps JSON in markdown code blocks
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    let analysisData: unknown;
    try {
      analysisData = JSON.parse(jsonText);
    } catch {
      throw new MalformedResponseError(
        "Failed to parse LLM response as JSON",
        responseText,
      );
    }

    // Validate response schema
    const responseValidation =
      RecoveryAnalysisResponseSchema.safeParse(analysisData);
    if (!responseValidation.success) {
      const errors = responseValidation.error.flatten().fieldErrors;
      throw new ValidationError(
        "LLM response does not match expected schema",
        errors,
      );
    }

    return responseValidation.data;
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof MalformedResponseError ||
      error instanceof LLMApiError
    ) {
      throw error;
    }

    // Handle OpenAI API errors
    if (error instanceof Error) {
      const message = error.message;

      // Check for authentication errors
      if (message.includes("401") || message.includes("Unauthorized")) {
        throw new LLMApiError("OpenAI API authentication failed", {
          status: 401,
        });
      }

      // Check for rate limiting
      if (message.includes("429") || message.includes("Too Many Requests")) {
        throw new LLMApiError("OpenAI API rate limit exceeded", {
          status: 429,
        });
      }

      // Check for model not found
      if (message.includes("404")) {
        throw new LLMApiError("OpenAI model not found", {
          status: 404,
        });
      }

      // Generic API error
      throw new LLMApiError(`OpenAI API error: ${message}`);
    }

    throw new LLMApiError(
      "Unknown error occurred during recovery analysis",
    );
  }
}

/**
 * Safely log analysis results without exposing secrets
 */
export function logAnalysisResult(
  transactionId: string,
  result: RecoveryAnalysisResponse,
): void {
  console.log("Recovery analysis completed", {
    transactionId,
    classification: result.classification,
    recommendedAction: result.recommendedAction,
    confidence: result.confidence,
  });
}

/**
 * Safely log analysis errors without exposing secrets
 */
export function logAnalysisError(
  transactionId: string,
  error: unknown,
): void {
  const sanitized = sanitizeErrorForLogging(error);
  console.error("Recovery analysis failed", {
    transactionId,
    errorName: sanitized.name,
    errorMessage: sanitized.message,
    errorCode: sanitized.code,
    errorStatus: sanitized.status,
  });
}
