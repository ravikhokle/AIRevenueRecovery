import { z } from "zod";

/**
 * Classification results for transaction recovery analysis
 */
export const RecoveryClassification = z.enum([
  "RECOVERABLE",
  "NOT_RECOVERABLE",
  "HUMAN_REVIEW",
]);

export type RecoveryClassification = z.infer<typeof RecoveryClassification>;

/**
 * Recommended action for the recovery system
 */
export const RecommendedAction = z.enum([
  "RETRY",
  "REMINDER",
  "ALTERNATE_METHOD",
  "HUMAN_REVIEW",
  "NO_ACTION",
]);

export type RecommendedAction = z.infer<typeof RecommendedAction>;

/**
 * LLM Analysis Response - Strict schema to validate model output
 * 
 * IMPORTANT: This schema must be validated before using any values
 * from the LLM. Never trust unvalidated model output.
 */
export const RecoveryAnalysisResponseSchema = z.object({
  classification: RecoveryClassification,
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason must be at most 500 characters"),
  recommendedAction: RecommendedAction,
  confidence: z
    .number()
    .min(0, "Confidence must be between 0 and 1")
    .max(1, "Confidence must be between 0 and 1"),
  evidence: z
    .array(z.string())
    .min(1, "Must provide at least one piece of evidence")
    .max(5, "Evidence array must not exceed 5 items"),
});

export type RecoveryAnalysisResponse = z.infer<
  typeof RecoveryAnalysisResponseSchema
>;

/**
 * Customer payment history for context
 */
export const CustomerHistorySchema = z.object({
  totalTransactions: z.number().int().nonnegative(),
  successfulPaymentCount: z.number().int().nonnegative(),
  failedPaymentCount: z.number().int().nonnegative(),
  abandonedPaymentCount: z.number().int().nonnegative(),
  totalSpent: z.number().int().nonnegative(),
  averageOrderValue: z.number().int().nonnegative(),
  lastSuccessfulPaymentAt: z.coerce.date().nullable().optional(),
  lastFailedPaymentAt: z.coerce.date().nullable().optional(),
  preferredPaymentMethod: z.string().nullable().optional(),
});

export type CustomerHistory = z.infer<typeof CustomerHistorySchema>;

/**
 * Transaction details for analysis
 */
export const TransactionDetailsSchema = z.object({
  transactionId: z.string(),
  amount: z.number().int().positive(),
  currency: z.string().min(1).max(10),
  status: z.enum(["FAILED", "ABANDONED", "PENDING", "SUCCESS"]),
  paymentMethod: z.string(),
  failureReason: z.string().nullable().optional(),
  gatewayError: z
    .object({
      code: z.string(),
      source: z.string(),
      step: z.string(),
      description: z.string(),
      reason: z.string().optional(),
    })
    .nullable()
    .optional(),
  retryCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});

export type TransactionDetails = z.infer<typeof TransactionDetailsSchema>;

/**
 * Retry history for a transaction
 */
export const RetryHistorySchema = z.object({
  totalRetries: z.number().int().nonnegative(),
  failureReasons: z.array(z.string()),
  lastRetryAt: z.coerce.date().nullable().optional(),
  retryPattern: z.enum(["CONSISTENT", "INTERMITTENT", "SINGLE"]).optional(),
});

export type RetryHistory = z.infer<typeof RetryHistorySchema>;

/**
 * Complete input for recovery analysis
 */
export const RecoveryAnalysisInputSchema = z.object({
  transaction: TransactionDetailsSchema,
  customerHistory: CustomerHistorySchema,
  retryHistory: RetryHistorySchema,
});

export type RecoveryAnalysisInput = z.infer<
  typeof RecoveryAnalysisInputSchema
>;

