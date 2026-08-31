export const SEED_VERSION = 1;

/** Fixed epoch so timestamps are reproducible across runs. */
export const SYNTHETIC_EPOCH_MS = Date.parse("2026-01-15T00:00:00.000Z");

export const SYNTHETIC_ID_PREFIX = "syn_";
export const SYNTHETIC_EMAIL_DOMAIN = "example.test";

export const PAYMENT_METHODS = [
  "card",
  "upi",
  "netbanking",
  "wallet",
] as const;

export const TEMPORARY_FAILURE_REASONS = [
  "insufficient_funds",
  "network_timeout",
  "issuer_unavailable",
  "authentication_timeout",
] as const;

export const REPEATED_FAILURE_REASONS = [
  "payment_declined",
  "authentication_failed",
  "processing_error",
] as const;

export const UNRECOVERABLE_FAILURE_REASONS = [
  "fraud_suspected",
  "card_permanently_blocked",
  "invalid_card",
  "max_retries_exceeded",
  "account_closed",
] as const;

/** Routine order amounts in paise (INR smallest unit). */
export const ROUTINE_AMOUNT_MIN_PAISE = 49_900; // ₹499
export const ROUTINE_AMOUNT_MAX_PAISE = 499_900; // ₹4,999

/** High-value threshold used by recovery guardrails in the product spec. */
export const HIGH_VALUE_AMOUNT_MIN_PAISE = 5_000_000; // ₹50,000
export const HIGH_VALUE_AMOUNT_MAX_PAISE = 15_000_000; // ₹150,000

/**
 * Realistic Razorpay Error Taxonomy mapping
 */
export const RAZORPAY_ERROR_TAXONOMY: Record<
  string,
  {
    code: "BAD_REQUEST_ERROR" | "GATEWAY_ERROR" | "SERVER_ERROR";
    source: "bank" | "gateway" | "customer" | "business";
    step: "payment_authorization" | "payment_authentication" | "payment_initiation";
    description: string;
  }
> = {
  insufficient_funds: {
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authorization",
    description: "Account has insufficient funds to complete the payment.",
  },
  network_timeout: {
    code: "GATEWAY_ERROR",
    source: "bank",
    step: "payment_authentication",
    description: "Network timeout communicating with issuing bank ACS.",
  },
  issuer_unavailable: {
    code: "GATEWAY_ERROR",
    source: "bank",
    step: "payment_authorization",
    description: "Customer issuing bank is currently down or degraded.",
  },
  authentication_timeout: {
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authentication",
    description: "Customer failed to submit 3D-Secure OTP within timeout window.",
  },
  payment_declined: {
    code: "BAD_REQUEST_ERROR",
    source: "bank",
    step: "payment_authorization",
    description: "Transaction declined by card issuing bank policy.",
  },
  authentication_failed: {
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_authentication",
    description: "Incorrect OTP or invalid 3D-Secure password entered.",
  },
  processing_error: {
    code: "GATEWAY_ERROR",
    source: "gateway",
    step: "payment_authorization",
    description: "Temporary processing error at upstream payment aggregator.",
  },
  fraud_suspected: {
    code: "BAD_REQUEST_ERROR",
    source: "business",
    step: "payment_authorization",
    description: "Blocked by risk engine: transaction flagged for potential fraud.",
  },
  card_permanently_blocked: {
    code: "BAD_REQUEST_ERROR",
    source: "bank",
    step: "payment_authorization",
    description: "Card has been permanently blocked or reported lost/stolen.",
  },
  invalid_card: {
    code: "BAD_REQUEST_ERROR",
    source: "customer",
    step: "payment_initiation",
    description: "Invalid card number or expiry date provided.",
  },
  max_retries_exceeded: {
    code: "BAD_REQUEST_ERROR",
    source: "business",
    step: "payment_initiation",
    description: "Maximum transaction retry velocity exceeded.",
  },
  account_closed: {
    code: "BAD_REQUEST_ERROR",
    source: "bank",
    step: "payment_authorization",
    description: "The customer bank account linked to this method has been closed.",
  },
};
