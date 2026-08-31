import { Transaction, TransactionStatus } from "@/types/transaction";
import { Customer } from "@/types/customer";

/**
 * Structured recommendation from AI analysis
 * Combines LLM output with metadata and guardrail validation
 */
export interface RecoveryRecommendation {
  transactionId: string;
  classification: "RECOVERABLE" | "NOT_RECOVERABLE" | "HUMAN_REVIEW";
  recommendedAction: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "HUMAN_REVIEW" | "NO_ACTION";
  confidence: number; // 0.0-1.0
  evidence: string[];
  reason: string;
  aiGeneratedAt: string; // ISO timestamp
}

/**
 * Guardrail validation result
 * Determines if recommendation can proceed to action execution
 */
export interface GuardrailResult {
  approved: boolean;
  reason: string;
  rejectionReason?: string; // Why was it rejected?
  policy: GuardrailPolicy; // Which policy was applied
}

/**
 * Structured guardrail decision
 * DETERMINISTIC: Based solely on business rules, independent of LLM
 * AI recommendation must NEVER directly execute an action
 * 
 * Response format:
 * {
 *   allowed: boolean,
 *   decision: "ALLOW" | "BLOCK" | "HUMAN_REVIEW",
 *   reason: string,
 *   requiresHumanApproval: boolean
 * }
 */
export interface GuardrailDecision {
  allowed: boolean;
  decision: "ALLOW" | "BLOCK" | "HUMAN_REVIEW";
  reason: string;
  requiresHumanApproval: boolean;
  ruleViolations?: string[]; // Which rules were violated
  appliedRules?: string[]; // Which rules were checked
}

/**
 * Policy applied by guardrails
 */
export type GuardrailPolicy =
  | "AMOUNT_LIMIT"
  | "HIGH_VALUE_LIMIT"
  | "RETRY_LIMIT"
  | "CONFIDENCE_THRESHOLD"
  | "CLASSIFICATION_MISMATCH"
  | "NOT_RECOVERABLE_BLOCKED"
  | "HUMAN_REVIEW_REQUIRED"
  | "CUSTOMER_POLICY"
  | "CUSTOMER_RATE_LIMIT"
  | "DUPLICATE_PREVENTION"
  | "INVALID_RECOMMENDATION"
  | "INVALID_ACTION"
  | "PASSED_ALL_CHECKS";

/**
 * Action execution step
 * Simulated/test action (not real payment)
 */
export interface ActionExecution {
  actionType: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "NO_ACTION";
  transactionId: string;
  customerId: string;
  amount: number;
  currency: string;
  timestamp: string; // ISO
  status: "INITIATED" | "COMPLETED" | "FAILED";
  result?: ActionResult;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Result of action execution
 * Simulated response (not actual payment gateway)
 */
export interface ActionResult {
  actionId: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  message: string;
  details: {
    retriedTransactionId?: string; // For RETRY action
    reminderSent?: boolean; // For REMINDER action
    alternateMethodOffered?: string; // For ALTERNATE_METHOD action
    simulatedGateway?: "SIMULATED"; // Marker that this is simulated
    razorpayOrderId?: string;
    razorpayPaymentLinkId?: string;
    razorpayPaymentLinkUrl?: string;
    razorpayReceipt?: string;
    razorpayStatus?: string;
    gatewayMode?: "RAZORPAY_TEST_MODE" | "SIMULATED";
  };
}

/**
 * Audit event
 * Immutable record of workflow execution
 * Set by workflow, never modified by LLM
 */
export interface AuditEvent {
  auditId: string;
  transactionId: string;
  customerId: string;
  workflowStage: 
    | "LOADED"
    | "ANALYZED"
    | "GUARDRAILS_CHECKED"
    | "ACTION_EXECUTED"
    | "COMPLETED"
    | "FAILED";
  
  // AI Analysis (from LLM)
  aiAnalysis?: {
    classification: string;
    recommendation: string;
    confidence: number;
    generatedAt: string;
  };

  // Guardrail Decision (from policy engine, not LLM)
  guardrailDecision?: {
    approved: boolean;
    policy: string;
    reason: string;
    rejectedAt?: string;
  };

  // Action Execution (from action executor, not LLM)
  actionExecution?: {
    actionType: string;
    status: string;
    executedAt: string;
  };

  // Workflow Result
  finalStatus: "SUCCESS" | "REJECTED" | "FAILED" | "PENDING";
  finalReason: string;

  // Timestamps
  createdAt: string; // ISO
  updatedAt: string; // ISO

  // Metadata
  workflowVersion: string;
  executionTimeMs: number;
}

/**
 * Complete workflow execution context
 * Flows through all steps, never modified by LLM
 */
export interface WorkflowContext {
  // Input
  transactionId: string;
  customerId?: string;

  // Step 1: Load Transaction
  transaction?: Transaction;
  transactionLoadError?: string;

  // Step 2: Load Customer History
  customer?: Customer;
  customerLoadError?: string;
  retryHistory?: {
    totalRetries: number;
    failureReasons: string[];
    retryPattern: "SINGLE" | "INTERMITTENT" | "CONSISTENT";
  };

  // Step 3: Analyze with AI
  aiRecommendation?: RecoveryRecommendation;
  aiAnalysisError?: string;

  // Step 4-5: Guardrails Check
  guardrailResult?: GuardrailResult;
  guardrailError?: string;

  // Step 6: Action Execution
  actionExecution?: ActionExecution;
  actionError?: string;

  // Step 7: Result Verification
  actionVerified?: boolean;
  verificationError?: string;

  // Step 8: Audit Event
  auditEvent?: AuditEvent;
  auditError?: string;

  // Workflow Metadata
  startedAt: string; // ISO
  completedAt?: string; // ISO
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
}

/**
 * Recovery workflow error
 */
export class RecoveryWorkflowError extends Error {
  constructor(
    message: string,
    public stage: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "RecoveryWorkflowError";
  }
}

/**
 * Guardrail rejection error
 * Indicates recommendation failed guardrail checks
 */
export class GuardrailRejectionError extends Error {
  constructor(
    message: string,
    public policy: GuardrailPolicy,
    public rejectionReason: string
  ) {
    super(message);
    this.name = "GuardrailRejectionError";
  }
}
