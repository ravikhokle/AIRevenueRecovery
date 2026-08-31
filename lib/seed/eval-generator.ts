/**
 * Evaluation Dataset Generator
 *
 * Produces a HELD-OUT synthetic dataset that is structurally identical to the
 * development dataset but is completely separate in every dimension:
 *
 *   Dimension          | Development dataset        | Evaluation dataset
 *   -------------------|----------------------------|------------------------------------
 *   Customer IDs       | syn_cust_0001 – 0050       | eval_cust_0001 – 0060
 *   Transaction IDs    | syn_txn_0001 – …           | eval_txn_0001 – …
 *   PRNG seeds         | 101, 202, 303, 404, 505,   | 911, 922, 933, 944, 955, 966, 977
 *                      | 606, 707                   | (all in 900-series, never overlap)
 *   Timestamp epoch    | 2026-01-15T00:00:00Z       | 2026-07-01T00:00:00Z (+167 days)
 *   Customer count     | 50                         | 60 (+20% more customers)
 *   Scenario mix       | Same 7 scenario types but  | Same 7 scenario types with
 *                      | different amounts/methods  | independently drawn amounts/methods
 *   seedVersion        | 1                          | 2 (eval)
 *
 * WHY THIS CONSTITUTES GENUINE HOLD-OUT:
 *   - No transaction, customer, or amount from the dev set appears in the eval set.
 *   - The PRNG sequences are entirely disjoint (different seed integers).
 *   - The AI model has never seen these specific inputs during any development run.
 *   - Timestamps are shifted to a future window, preventing date-based leakage.
 *   - Customer count is slightly larger to test generalisation to unseen customers.
 *
 * GROUND TRUTH:
 *   Each transaction carries a `groundTruthLabel` derived from its scenario:
 *   - TRULY_RECOVERABLE    → scenario in { temporary_looking_failure, abandoned_checkout }
 *   - TRULY_UNRECOVERABLE  → scenario in { unrecoverable_case }
 *   - HUMAN_REVIEW_NEEDED  → scenario in { high_value_transaction, repeated_failure,
 *                                           multiple_failed_attempts }
 *   - NOT_APPLICABLE       → scenario in { successful_payment, customer_with_previous_success }
 *                            (SUCCESS transactions; excluded from evaluation)
 *
 * Ground truth is assigned deterministically from the scenario label — it does NOT
 * depend on any model prediction and is therefore free of contamination.
 */

import {
  PAYMENT_METHODS,
  TEMPORARY_FAILURE_REASONS,
  REPEATED_FAILURE_REASONS,
  UNRECOVERABLE_FAILURE_REASONS,
  ROUTINE_AMOUNT_MIN_PAISE,
  ROUTINE_AMOUNT_MAX_PAISE,
  HIGH_VALUE_AMOUNT_MIN_PAISE,
  HIGH_VALUE_AMOUNT_MAX_PAISE,
  RAZORPAY_ERROR_TAXONOMY,
} from "@/lib/seed/constants";
import { amountInRange, createSeededRandom, pickFrom } from "@/lib/seed/prng";
import type { Transaction, TransactionStatus } from "@/types/transaction";
import type { Customer } from "@/types/customer";

// ---------------------------------------------------------------------------
// Constants unique to the evaluation dataset
// ---------------------------------------------------------------------------

/** Shifted epoch: 167 days after the dev epoch (2026-07-01). */
const EVAL_EPOCH_MS = Date.parse("2026-07-01T00:00:00.000Z");

const EVAL_ID_PREFIX = "eval_";
const EVAL_CUSTOMER_COUNT = 60; // dev uses 50
const EVAL_SEED_VERSION = 2;

/** 900-series seeds — entirely disjoint from dev seeds (101–707). */
const SEEDS = {
  successfulRoutine: 911,
  temporaryFailure: 922,
  repeatedFailure: 933,
  abandonedCheckout: 944,
  highValue: 955,
  multiFailCustomer: 966,
  unrecoverable: 977,
} as const;

// ---------------------------------------------------------------------------
// Ground-truth label type
// ---------------------------------------------------------------------------

/**
 * The "true" recoverability of a transaction, inferred from scenario context.
 * This is the label against which AI predictions are evaluated.
 */
export type GroundTruthLabel =
  | "TRULY_RECOVERABLE"    // AI should classify RECOVERABLE
  | "TRULY_UNRECOVERABLE"  // AI should classify NOT_RECOVERABLE
  | "HUMAN_REVIEW_NEEDED"  // AI should escalate to HUMAN_REVIEW
  | "NOT_APPLICABLE";      // SUCCESS txn — excluded from metrics

/**
 * Assign a ground-truth label to a scenario.
 * This mapping is the single source of truth for evaluation correctness.
 */
export function labelFromScenario(scenario: string): GroundTruthLabel {
  switch (scenario) {
    case "temporary_looking_failure":
    case "abandoned_checkout":
      return "TRULY_RECOVERABLE";

    case "unrecoverable_case":
      return "TRULY_UNRECOVERABLE";

    case "high_value_transaction":
    case "repeated_failure":
    case "multiple_failed_attempts":
      return "HUMAN_REVIEW_NEEDED";

    case "successful_payment":
    case "customer_with_previous_success":
      return "NOT_APPLICABLE";

    default:
      return "NOT_APPLICABLE";
  }
}

// ---------------------------------------------------------------------------
// Annotated transaction type
// ---------------------------------------------------------------------------

export interface EvalTransaction extends Transaction {
  scenario: string;
  groundTruthLabel: GroundTruthLabel;
}

export interface EvalDataset {
  /** Always 2 — distinguishes from dev seedVersion 1. */
  seedVersion: typeof EVAL_SEED_VERSION;
  transactions: EvalTransaction[];
  customers: Customer[];
  summary: EvalDatasetSummary;
}

export interface EvalDatasetSummary {
  totalTransactions: number;
  totalCustomers: number;
  eligible: number; // FAILED + ABANDONED only
  byGroundTruth: Record<GroundTruthLabel, number>;
  byStatus: Record<TransactionStatus, number>;
  byScenario: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let evalSequence = 0;

function resetSequence(): void {
  evalSequence = 0;
}

function nextTxnId(): string {
  evalSequence += 1;
  return `${EVAL_ID_PREFIX}txn_${String(evalSequence).padStart(4, "0")}`;
}

function nextOrdId(): string {
  return `${EVAL_ID_PREFIX}ord_${String(evalSequence).padStart(4, "0")}`;
}

function evalTimestamp(dayOffset: number, hour: number): Date {
  return new Date(
    EVAL_EPOCH_MS + dayOffset * 86_400_000 + hour * 3_600_000
  );
}

function evalCustomerProfile(index: number) {
  const suffix = String(index).padStart(4, "0");
  return {
    customerId: `${EVAL_ID_PREFIX}cust_${suffix}`,
    email: `eval.user${suffix}@eval.test`,
    phone: `+9188888${String(10_000 + index).slice(-5)}`,
    name: `Eval User ${suffix}`,
  };
}

interface EvalDraft {
  customerId: string;
  amount: number;
  status: TransactionStatus;
  paymentMethod: string;
  failureReason?: string | null;
  retryCount: number;
  dayOffset: number;
  hour: number;
  scenario: string;
}

function draftToEvalTxn(draft: EvalDraft): EvalTransaction {
  const createdAt = evalTimestamp(draft.dayOffset, draft.hour);
  const label = labelFromScenario(draft.scenario);
  const taxonomy = draft.failureReason ? RAZORPAY_ERROR_TAXONOMY[draft.failureReason] : null;
  const gatewayError = taxonomy
    ? {
        code: taxonomy.code,
        source: taxonomy.source,
        step: taxonomy.step,
        description: taxonomy.description,
        reason: draft.failureReason!,
      }
    : null;

  return {
    transactionId: nextTxnId(),
    customerId: draft.customerId,
    orderId: nextOrdId(),
    amount: draft.amount,
    currency: "INR",
    status: draft.status,
    paymentMethod: draft.paymentMethod,
    failureReason: draft.failureReason ?? null,
    gatewayError,
    retryCount: draft.retryCount,
    createdAt,
    updatedAt: createdAt,
    scenario: draft.scenario,
    groundTruthLabel: label,
  };
}

// ---------------------------------------------------------------------------
// Scenario group builders (eval equivalents)
// ---------------------------------------------------------------------------

function buildEvalSuccessfulRoutine(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.successfulRoutine);

  for (let i = 1; i <= 12; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const attempts = i <= 6 ? 3 : 2;
    for (let a = 0; a < attempts; a += 1) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
        status: "SUCCESS",
        paymentMethod,
        retryCount: 0,
        dayOffset: i,
        hour: a + 9,
        scenario: "successful_payment",
      });
    }
  }
  return drafts;
}

function buildEvalTemporaryFailure(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.temporaryFailure);

  for (let i = 13; i <= 22; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    for (let s = 0; s < 2; s += 1) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
        status: "SUCCESS",
        paymentMethod,
        retryCount: 0,
        dayOffset: i - 10,
        hour: s + 8,
        scenario: "customer_with_previous_success",
      });
    }
    drafts.push({
      customerId: evalCustomerProfile(i).customerId,
      amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(TEMPORARY_FAILURE_REASONS, random),
      retryCount: 0,
      dayOffset: i,
      hour: 18,
      scenario: "temporary_looking_failure",
    });
  }
  return drafts;
}

function buildEvalRepeatedFailure(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.repeatedFailure);

  for (let i = 23; i <= 28; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    for (let a = 0; a < 4; a += 1) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
        status: "FAILED",
        paymentMethod,
        failureReason: pickFrom(REPEATED_FAILURE_REASONS, random),
        retryCount: a,
        dayOffset: i - 5,
        hour: 10 + a,
        scenario: "repeated_failure",
      });
    }
  }
  return drafts;
}

function buildEvalAbandonedCheckout(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.abandonedCheckout);

  for (let i = 29; i <= 35; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    for (let a = 0; a < 2; a += 1) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
        status: "ABANDONED",
        paymentMethod,
        failureReason: null,
        retryCount: 0,
        dayOffset: i - 10,
        hour: 14 + a,
        scenario: "abandoned_checkout",
      });
    }
  }
  return drafts;
}

function buildEvalHighValue(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.highValue);

  for (let i = 36; i <= 44; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const amount = amountInRange(random, HIGH_VALUE_AMOUNT_MIN_PAISE, HIGH_VALUE_AMOUNT_MAX_PAISE);
    drafts.push({
      customerId: evalCustomerProfile(i).customerId,
      amount,
      status: "SUCCESS",
      paymentMethod,
      retryCount: 0,
      dayOffset: i - 20,
      hour: 11,
      scenario: "high_value_transaction",
    });
    drafts.push({
      customerId: evalCustomerProfile(i).customerId,
      amount,
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(TEMPORARY_FAILURE_REASONS, random),
      retryCount: 0,
      dayOffset: i - 20,
      hour: 16,
      scenario: "high_value_transaction",
    });
  }
  return drafts;
}

function buildEvalMultiFailCustomer(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.multiFailCustomer);

  for (let i = 45; i <= 52; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    for (let a = 0; a < 3; a += 1) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount: amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE),
        status: "FAILED",
        paymentMethod,
        failureReason: pickFrom(REPEATED_FAILURE_REASONS, random),
        retryCount: a + 1,
        dayOffset: i - 15,
        hour: 9 + a * 2,
        scenario: "multiple_failed_attempts",
      });
    }
  }
  return drafts;
}

function buildEvalUnrecoverable(): EvalDraft[] {
  const drafts: EvalDraft[] = [];
  const random = createSeededRandom(SEEDS.unrecoverable);

  for (let i = 53; i <= EVAL_CUSTOMER_COUNT; i += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const amount = amountInRange(random, ROUTINE_AMOUNT_MIN_PAISE, ROUTINE_AMOUNT_MAX_PAISE);
    drafts.push({
      customerId: evalCustomerProfile(i).customerId,
      amount,
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(UNRECOVERABLE_FAILURE_REASONS, random),
      retryCount: 3,
      dayOffset: i - 20,
      hour: 12,
      scenario: "unrecoverable_case",
    });
    if (i <= 56) {
      drafts.push({
        customerId: evalCustomerProfile(i).customerId,
        amount,
        status: "PENDING",
        paymentMethod,
        failureReason: pickFrom(UNRECOVERABLE_FAILURE_REASONS, random),
        retryCount: 3,
        dayOffset: i - 20,
        hour: 15,
        scenario: "unrecoverable_case",
      });
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Customer builder
// ---------------------------------------------------------------------------

function buildEvalCustomers(transactions: EvalTransaction[]): Customer[] {
  const profiles = new Map<string, ReturnType<typeof evalCustomerProfile>>();
  for (let i = 1; i <= EVAL_CUSTOMER_COUNT; i += 1) {
    const p = evalCustomerProfile(i);
    profiles.set(p.customerId, p);
  }

  const grouped = new Map<string, EvalTransaction[]>();
  for (const t of transactions) {
    const list = grouped.get(t.customerId) ?? [];
    list.push(t);
    grouped.set(t.customerId, list);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([customerId, txns]) => {
      const profile = profiles.get(customerId)!;
      const sorted = [...txns].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      const successful = sorted.filter((t) => t.status === "SUCCESS");
      const failed = sorted.filter((t) => t.status === "FAILED");
      const abandoned = sorted.filter((t) => t.status === "ABANDONED");

      const totalSpent = successful.reduce((s, t) => s + t.amount, 0);

      const methodCounts = new Map<string, number>();
      for (const t of successful) {
        methodCounts.set(t.paymentMethod, (methodCounts.get(t.paymentMethod) ?? 0) + 1);
      }
      const preferredPaymentMethod =
        [...methodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        sorted.at(-1)?.paymentMethod ??
        null;

      const lastSuccessful = successful.at(-1);
      const lastFailed = failed.at(-1);

      return {
        customerId: profile.customerId,
        email: profile.email,
        phone: profile.phone,
        name: profile.name,
        totalTransactions: sorted.length,
        successfulPaymentCount: successful.length,
        failedPaymentCount: failed.length,
        abandonedPaymentCount: abandoned.length,
        totalSpent,
        averageOrderValue:
          successful.length > 0 ? Math.round(totalSpent / successful.length) : 0,
        lastPaymentAt: sorted.at(-1)?.createdAt ?? null,
        lastSuccessfulPaymentAt: lastSuccessful?.createdAt ?? null,
        lastFailedPaymentAt: lastFailed?.createdAt ?? null,
        preferredPaymentMethod,
        createdAt: sorted[0]!.createdAt,
        updatedAt: sorted.at(-1)!.updatedAt,
      };
    });
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Generate the held-out evaluation dataset (seedVersion: 2).
 *
 * Call this instead of `generateSyntheticDataset()` when running evaluation.
 * The two datasets share no customers, no transactions, and no PRNG sequences.
 */
export function generateEvalDataset(): EvalDataset {
  resetSequence();

  const groups = [
    buildEvalSuccessfulRoutine(),
    buildEvalTemporaryFailure(),
    buildEvalRepeatedFailure(),
    buildEvalAbandonedCheckout(),
    buildEvalHighValue(),
    buildEvalMultiFailCustomer(),
    buildEvalUnrecoverable(),
  ];

  const drafts = groups.flat();
  const transactions = drafts.map(draftToEvalTxn);
  const customers = buildEvalCustomers(transactions);

  // Summarise
  const byGroundTruth: Record<GroundTruthLabel, number> = {
    TRULY_RECOVERABLE: 0,
    TRULY_UNRECOVERABLE: 0,
    HUMAN_REVIEW_NEEDED: 0,
    NOT_APPLICABLE: 0,
  };
  const byStatus: Record<TransactionStatus, number> = {
    SUCCESS: 0,
    FAILED: 0,
    PENDING: 0,
    ABANDONED: 0,
  };
  const byScenario: Record<string, number> = {};

  for (const t of transactions) {
    byGroundTruth[t.groundTruthLabel] += 1;
    byStatus[t.status] += 1;
    byScenario[t.scenario] = (byScenario[t.scenario] ?? 0) + 1;
  }

  const eligible = transactions.filter(
    (t) => t.status === "FAILED" || t.status === "ABANDONED"
  ).length;

  return {
    seedVersion: EVAL_SEED_VERSION,
    transactions,
    customers,
    summary: {
      totalTransactions: transactions.length,
      totalCustomers: customers.length,
      eligible,
      byGroundTruth,
      byStatus,
      byScenario,
    },
  };
}
