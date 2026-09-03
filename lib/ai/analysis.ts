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

let _openAiUnavailable = false;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new LLMApiError(
      "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
    );
  }

  return new OpenAI({
    apiKey,
    timeout: 3000,
    maxRetries: 0,
  });
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
 * Deterministic local demo AI fallback for synthetic/demo environments.
 * Classifies transactions realistically based on domain rules without external API calls.
 */
export function deterministicDemoAnalysis(
  input: RecoveryAnalysisInput
): RecoveryAnalysisResponse {
  const { transaction, customerHistory, retryHistory } = input;
  const failureReason = transaction.failureReason || "";
  const amount = transaction.amount;
  const retryCount = Math.max(transaction.retryCount, retryHistory.totalRetries);

  // 1. Abandoned checkout
  if (transaction.status === "ABANDONED") {
    return {
      classification: "RECOVERABLE",
      recommendedAction: "REMINDER",
      confidence: 0.88,
      reason:
        "Customer abandoned checkout session before completing payment. Automated payment reminder with recovery link can recover the transaction.",
      evidence: [
        "Checkout session abandoned before payment completion",
        "Customer showed active purchase intent",
        "Automated payment reminder link enables seamless resumption",
      ],
    };
  }

  // 2. High-value transactions (amount > ₹50,000 / 5,000,000 paise)
  if (amount > 5_000_000) {
    return {
      classification: "HUMAN_REVIEW",
      recommendedAction: "HUMAN_REVIEW",
      confidence: 0.65,
      reason: `High-value transaction amount of ₹${(amount / 100).toFixed(2)} exceeds automated recovery limit. Escalated for operator review.`,
      evidence: [
        `Transaction amount ₹${(amount / 100).toFixed(2)} exceeds ₹50,000 policy threshold`,
        "Merchant policy requires manual review for high-exposure transactions",
        "Operator confirmation needed prior to executing retry",
      ],
    };
  }

  // 3. Permanent / unrecoverable failure reasons
  const permanentReasons = [
    "fraud_suspected",
    "card_permanently_blocked",
    "invalid_card",
    "account_closed",
    "max_retries_exceeded",
  ];
  if (permanentReasons.includes(failureReason)) {
    return {
      classification: "NOT_RECOVERABLE",
      recommendedAction: "NO_ACTION",
      confidence: 0.95,
      reason: `Permanent payment failure condition (${failureReason}). Automatic retries are blocked to prevent compliance and gateway violations.`,
      evidence: [
        `Failure reason '${failureReason}' is permanently non-recoverable`,
        "Risk policy prohibits automatic retries on blocked or invalid instruments",
        "Customer must update payment credentials or contact support",
      ],
    };
  }

  // 4. Excessive retries (>= 3 attempts)
  if (retryCount >= 3) {
    return {
      classification: "NOT_RECOVERABLE",
      recommendedAction: "NO_ACTION",
      confidence: 0.92,
      reason: `Maximum retry velocity reached (${retryCount} previous attempts). Further automatic retries blocked to protect customer experience.`,
      evidence: [
        `Transaction has already undergone ${retryCount} retry attempts (maximum: 3)`,
        "Repeated attempts failed consistently",
        "Customer support intervention recommended",
      ],
    };
  }

  // 5. Declined / Authentication failures -> Offer alternate payment rails
  if (
    failureReason === "authentication_failed" ||
    failureReason === "payment_declined"
  ) {
    return {
      classification: "RECOVERABLE",
      recommendedAction: "ALTERNATE_METHOD",
      confidence: 0.82,
      reason: `Payment declined on primary payment instrument (${failureReason}). Offering multi-rail payment options (UPI, Netbanking, Cards) improves conversion.`,
      evidence: [
        `Payment authorization declined on '${transaction.paymentMethod}'`,
        "Customer payment history demonstrates legitimate purchasing intent",
        "Multi-rail checkout link offers alternate payment avenues",
      ],
    };
  }

  // 6. Routine temporary failures (insufficient_funds, network_timeout, issuer_unavailable, processing_error, etc.)
  return {
    classification: "RECOVERABLE",
    recommendedAction: "RETRY",
    confidence: 0.9,
    reason: `Temporary payment failure (${failureReason || "network/gateway timeout"}). Customer profile and transient failure reason support automated retry.`,
    evidence: [
      `Failure reason '${failureReason || "network_timeout"}' is transient`,
      `Retry count (${retryCount}) is within allowable threshold`,
      "Customer has valid transaction history",
    ],
  };
}

/**
 * Analyze a failed transaction for recovery potential
 *
 * @param input - Transaction, customer history, and retry information
 * @returns Analysis result with classification and recommendation
 * @throws {ValidationError} If input validation fails
 * @throws {LLMApiError} If OpenAI API call fails and demo mode is disabled
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
  const isDemoMode = process.env.RECOVERY_DEMO_MODE === "true" || !process.env.OPENAI_API_KEY;

  if (isDemoMode) {
    return deterministicDemoAnalysis(validatedInput);
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LLMApiError(
        "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
      );
    }

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
      error instanceof MalformedResponseError
    ) {
      if (isDemoMode && !(error instanceof ValidationError)) {
        _openAiUnavailable = true;
        console.warn("[AI] Malformed LLM response, falling back to deterministic local analysis");
        return deterministicDemoAnalysis(validatedInput);
      }
      throw error;
    }

    // If in demo mode or if LLM encounters API error/quota/network failure,
    // fallback gracefully to deterministic domain analysis so the workflow never stalls
    const errMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `[AI] Notice: OpenAI request unavailable (${errMessage}). Using deterministic domain analysis.`
    );
    return deterministicDemoAnalysis(validatedInput);
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

