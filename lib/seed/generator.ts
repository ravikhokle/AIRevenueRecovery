import {
  HIGH_VALUE_AMOUNT_MAX_PAISE,
  HIGH_VALUE_AMOUNT_MIN_PAISE,
  PAYMENT_METHODS,
  REPEATED_FAILURE_REASONS,
  ROUTINE_AMOUNT_MAX_PAISE,
  ROUTINE_AMOUNT_MIN_PAISE,
  SYNTHETIC_EMAIL_DOMAIN,
  SYNTHETIC_EPOCH_MS,
  TEMPORARY_FAILURE_REASONS,
  UNRECOVERABLE_FAILURE_REASONS,
  RAZORPAY_ERROR_TAXONOMY,
} from "@/lib/seed/constants";
import {
  amountInRange,
  createSeededRandom,
  pickFrom,
} from "@/lib/seed/prng";
import type { Customer } from "@/types/customer";
import type { Transaction, TransactionStatus } from "@/types/transaction";

export interface SyntheticDataset {
  seedVersion: number;
  transactions: Transaction[];
  customers: Customer[];
  summary: SyntheticDatasetSummary;
}

export interface SyntheticDatasetSummary {
  totalTransactions: number;
  totalCustomers: number;
  byStatus: Record<TransactionStatus, number>;
  byScenario: Record<string, number>;
}

interface CustomerProfile {
  customerId: string;
  email: string;
  phone: string;
  name: string;
}

interface TransactionDraft {
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

let transactionSequence = 0;

function resetTransactionSequence(): void {
  transactionSequence = 0;
}

function nextTransactionId(): string {
  transactionSequence += 1;
  return `syn_txn_${String(transactionSequence).padStart(4, "0")}`;
}

function nextOrderId(): string {
  return `syn_ord_${String(transactionSequence).padStart(4, "0")}`;
}

function syntheticTimestamp(dayOffset: number, hour: number): Date {
  return new Date(SYNTHETIC_EPOCH_MS + dayOffset * 86_400_000 + hour * 3_600_000);
}

function customerProfile(index: number): CustomerProfile {
  const suffix = String(index).padStart(4, "0");

  return {
    customerId: `syn_cust_${suffix}`,
    email: `synthetic.user${suffix}@${SYNTHETIC_EMAIL_DOMAIN}`,
    phone: `+9199999${String(10_000 + index).slice(-5)}`,
    name: `Synthetic User ${suffix}`,
  };
}

function draftToTransaction(draft: TransactionDraft): Transaction {
  const createdAt = syntheticTimestamp(draft.dayOffset, draft.hour);
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
    transactionId: nextTransactionId(),
    customerId: draft.customerId,
    orderId: nextOrderId(),
    amount: draft.amount,
    currency: "INR",
    status: draft.status,
    paymentMethod: draft.paymentMethod,
    failureReason: draft.failureReason ?? null,
    gatewayError,
    retryCount: draft.retryCount,
    createdAt,
    updatedAt: createdAt,
  };
}

function buildSuccessfulRoutineDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(101);

  for (let customerIndex = 1; customerIndex <= 10; customerIndex += 1) {
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const attempts = customerIndex <= 5 ? 3 : 2;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      drafts.push({
        customerId: customerProfile(customerIndex).customerId,
        amount: amountInRange(
          random,
          ROUTINE_AMOUNT_MIN_PAISE,
          ROUTINE_AMOUNT_MAX_PAISE,
        ),
        status: "SUCCESS",
        paymentMethod,
        retryCount: 0,
        dayOffset: customerIndex,
        hour: attempt + 9,
        scenario: "successful_payment",
      });
    }
  }

  return drafts;
}

function buildTemporaryFailureDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(202);

  for (let customerIndex = 11; customerIndex <= 18; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);

    for (let successIndex = 0; successIndex < 2; successIndex += 1) {
      drafts.push({
        customerId: profile.customerId,
        amount: amountInRange(
          random,
          ROUTINE_AMOUNT_MIN_PAISE,
          ROUTINE_AMOUNT_MAX_PAISE,
        ),
        status: "SUCCESS",
        paymentMethod,
        retryCount: 0,
        dayOffset: customerIndex - 10,
        hour: successIndex + 8,
        scenario: "customer_with_previous_success",
      });
    }

    drafts.push({
      customerId: profile.customerId,
      amount: amountInRange(
        random,
        ROUTINE_AMOUNT_MIN_PAISE,
        ROUTINE_AMOUNT_MAX_PAISE,
      ),
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(TEMPORARY_FAILURE_REASONS, random),
      retryCount: 0,
      dayOffset: customerIndex,
      hour: 18,
      scenario: "temporary_looking_failure",
    });
  }

  return drafts;
}

function buildRepeatedFailureDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(303);

  for (let customerIndex = 19; customerIndex <= 23; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      drafts.push({
        customerId: profile.customerId,
        amount: amountInRange(
          random,
          ROUTINE_AMOUNT_MIN_PAISE,
          ROUTINE_AMOUNT_MAX_PAISE,
        ),
        status: "FAILED",
        paymentMethod,
        failureReason: pickFrom(REPEATED_FAILURE_REASONS, random),
        retryCount: attempt,
        dayOffset: customerIndex - 5,
        hour: 10 + attempt,
        scenario: "repeated_failure",
      });
    }
  }

  return drafts;
}

function buildAbandonedCheckoutDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(404);

  for (let customerIndex = 24; customerIndex <= 28; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      drafts.push({
        customerId: profile.customerId,
        amount: amountInRange(
          random,
          ROUTINE_AMOUNT_MIN_PAISE,
          ROUTINE_AMOUNT_MAX_PAISE,
        ),
        status: "ABANDONED",
        paymentMethod,
        failureReason: null,
        retryCount: 0,
        dayOffset: customerIndex - 10,
        hour: 14 + attempt,
        scenario: "abandoned_checkout",
      });
    }
  }

  return drafts;
}

function buildHighValueDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(505);

  for (let customerIndex = 29; customerIndex <= 36; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const amount = amountInRange(
      random,
      HIGH_VALUE_AMOUNT_MIN_PAISE,
      HIGH_VALUE_AMOUNT_MAX_PAISE,
    );

    drafts.push({
      customerId: profile.customerId,
      amount,
      status: "SUCCESS",
      paymentMethod,
      retryCount: 0,
      dayOffset: customerIndex - 20,
      hour: 11,
      scenario: "high_value_transaction",
    });

    drafts.push({
      customerId: profile.customerId,
      amount,
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(TEMPORARY_FAILURE_REASONS, random),
      retryCount: 0,
      dayOffset: customerIndex - 20,
      hour: 16,
      scenario: "high_value_transaction",
    });
  }

  return drafts;
}

function buildMultiFailCustomerDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(606);

  for (let customerIndex = 37; customerIndex <= 42; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      drafts.push({
        customerId: profile.customerId,
        amount: amountInRange(
          random,
          ROUTINE_AMOUNT_MIN_PAISE,
          ROUTINE_AMOUNT_MAX_PAISE,
        ),
        status: "FAILED",
        paymentMethod,
        failureReason: pickFrom(REPEATED_FAILURE_REASONS, random),
        retryCount: attempt + 1,
        dayOffset: customerIndex - 15,
        hour: 9 + attempt * 2,
        scenario: "multiple_failed_attempts",
      });
    }
  }

  return drafts;
}

function buildUnrecoverableDrafts(): TransactionDraft[] {
  const drafts: TransactionDraft[] = [];
  const random = createSeededRandom(707);

  for (let customerIndex = 43; customerIndex <= 50; customerIndex += 1) {
    const profile = customerProfile(customerIndex);
    const paymentMethod = pickFrom(PAYMENT_METHODS, random);
    const amount = amountInRange(
      random,
      ROUTINE_AMOUNT_MIN_PAISE,
      ROUTINE_AMOUNT_MAX_PAISE,
    );

    drafts.push({
      customerId: profile.customerId,
      amount,
      status: "FAILED",
      paymentMethod,
      failureReason: pickFrom(UNRECOVERABLE_FAILURE_REASONS, random),
      retryCount: 3,
      dayOffset: customerIndex - 20,
      hour: 12,
      scenario: "unrecoverable_case",
    });

    if (customerIndex <= 47) {
      drafts.push({
        customerId: profile.customerId,
        amount,
        status: "PENDING",
        paymentMethod,
        failureReason: pickFrom(UNRECOVERABLE_FAILURE_REASONS, random),
        retryCount: 3,
        dayOffset: customerIndex - 20,
        hour: 15,
        scenario: "unrecoverable_case",
      });
    }
  }

  return drafts;
}

function buildCustomersFromTransactions(
  transactions: Transaction[],
): Customer[] {
  const profiles = new Map<string, CustomerProfile>();

  for (let index = 1; index <= 50; index += 1) {
    const profile = customerProfile(index);
    profiles.set(profile.customerId, profile);
  }

  const grouped = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const existing = grouped.get(transaction.customerId) ?? [];
    existing.push(transaction);
    grouped.set(transaction.customerId, existing);
  }

  return [...grouped.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([customerId, customerTransactions]) => {
      const profile = profiles.get(customerId)!;
      const sortedTransactions = [...customerTransactions].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );

      const successfulPayments = sortedTransactions.filter(
        (transaction) => transaction.status === "SUCCESS",
      );
      const failedPayments = sortedTransactions.filter(
        (transaction) => transaction.status === "FAILED",
      );
      const abandonedPayments = sortedTransactions.filter(
        (transaction) => transaction.status === "ABANDONED",
      );

      const totalSpent = successfulPayments.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      );

      const methodCounts = new Map<string, number>();

      for (const transaction of successfulPayments) {
        methodCounts.set(
          transaction.paymentMethod,
          (methodCounts.get(transaction.paymentMethod) ?? 0) + 1,
        );
      }

      const preferredPaymentMethod =
        [...methodCounts.entries()].sort((left, right) => right[1] - left[1])[0]
          ?.[0] ?? sortedTransactions.at(-1)?.paymentMethod ?? null;

      const lastPayment = sortedTransactions.at(-1);
      const lastSuccessful = successfulPayments.at(-1);
      const lastFailed = failedPayments.at(-1);
      const createdAt = sortedTransactions[0]!.createdAt;
      const updatedAt = lastPayment!.updatedAt;

      return {
        customerId: profile.customerId,
        email: profile.email,
        phone: profile.phone,
        name: profile.name,
        totalTransactions: sortedTransactions.length,
        successfulPaymentCount: successfulPayments.length,
        failedPaymentCount: failedPayments.length,
        abandonedPaymentCount: abandonedPayments.length,
        totalSpent,
        averageOrderValue:
          successfulPayments.length > 0
            ? Math.round(totalSpent / successfulPayments.length)
            : 0,
        lastPaymentAt: lastPayment?.createdAt ?? null,
        lastSuccessfulPaymentAt: lastSuccessful?.createdAt ?? null,
        lastFailedPaymentAt: lastFailed?.createdAt ?? null,
        preferredPaymentMethod,
        createdAt,
        updatedAt,
      };
    });
}

function summarizeDataset(
  transactions: Transaction[],
  customers: Customer[],
  scenarioCounts: Record<string, number>,
): SyntheticDatasetSummary {
  const byStatus: Record<TransactionStatus, number> = {
    SUCCESS: 0,
    FAILED: 0,
    PENDING: 0,
    ABANDONED: 0,
  };

  for (const transaction of transactions) {
    byStatus[transaction.status] += 1;
  }

  return {
    totalTransactions: transactions.length,
    totalCustomers: customers.length,
    byStatus,
    byScenario: scenarioCounts,
  };
}

export function generateSyntheticDataset(): SyntheticDataset {
  resetTransactionSequence();

  const draftGroups = [
    buildSuccessfulRoutineDrafts(),
    buildTemporaryFailureDrafts(),
    buildRepeatedFailureDrafts(),
    buildAbandonedCheckoutDrafts(),
    buildHighValueDrafts(),
    buildMultiFailCustomerDrafts(),
    buildUnrecoverableDrafts(),
  ];

  const scenarioCounts: Record<string, number> = {};
  const drafts = draftGroups.flat();

  for (const draft of drafts) {
    scenarioCounts[draft.scenario] = (scenarioCounts[draft.scenario] ?? 0) + 1;
  }

  const transactions = drafts.map(draftToTransaction);
  const customers = buildCustomersFromTransactions(transactions);

  return {
    seedVersion: 1,
    transactions,
    customers,
    summary: summarizeDataset(transactions, customers, scenarioCounts),
  };
}
