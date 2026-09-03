import { getTransactionsCollection } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";
import { getAuditLogCollection } from "@/lib/models/audit-log";
import { getBatchRunCollection } from "@/lib/models/batch-run";
import { generateSyntheticDataset } from "@/lib/seed/generator";
import type { Transaction } from "@/types/transaction";
import type { Customer } from "@/types/customer";
import type { AuditLog } from "@/types/audit-log";

export interface EnrichedTransaction {
  transactionId: string;
  customerId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  aiClassification?: string;
  recommendedAction?: string;
  confidence?: number;
  guardrailDecision?: string;
  recoveryResult?: string;
}

export interface DashboardMetrics {
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRate: number;
  transactionsAnalyzed: number;
  recoverableCases: number;
  humanReviews: number;
  guardrailBlocks: number;
  failedActions: number;
}

export async function getDashboardOverviewMetrics(): Promise<DashboardMetrics> {
  try {
    const txCollection = await getTransactionsCollection();
    const allTxns = await txCollection.find({}).toArray();

    if (allTxns.length > 0) {
      // 1. Total at-risk failed/abandoned volume across all transactions
      const atRiskTxns = allTxns.filter(
        (t) => t.status === "FAILED" || t.status === "ABANDONED"
      );
      const revenueAtRisk = atRiskTxns.reduce((sum, t) => sum + t.amount, 0);

      // 2. Verified recoveries from audit logs
      const auditCollection = await getAuditLogCollection();
      const allAudit = await auditCollection.find({}).toArray();

      let recoverableCases = 0;
      let humanReviews = 0;
      let guardrailBlocks = 0;
      let failedActions = 0;
      let revenueRecovered = 0;
      const analyzedTxnIds = new Set<string>();
      const recoveredTxnIds = new Set<string>();

      const txnMap = new Map<string, Transaction>();
      for (const t of allTxns) {
        txnMap.set(t.transactionId, t);
      }

      for (const log of allAudit) {
        if (log.eventType === "AI_ANALYSIS") {
          analyzedTxnIds.add(log.transactionId);
          if (log.aiRecommendation?.classification === "RECOVERABLE") {
            recoverableCases += 1;
          }
        }
        if (log.eventType === "HUMAN_REVIEW") {
          humanReviews += 1;
        }
        if (log.eventType === "ACTION_BLOCKED") {
          guardrailBlocks += 1;
        }
        if (log.eventType === "ACTION_VERIFIED") {
          if (log.result === "SUCCESS" || log.result === "VERIFIED") {
            if (!recoveredTxnIds.has(log.transactionId)) {
              recoveredTxnIds.add(log.transactionId);
              const txn = txnMap.get(log.transactionId);
              if (txn) {
                revenueRecovered += txn.amount;
              }
            }
          } else {
            failedActions += 1;
          }
        }
      }

      // Also count transactions that were updated to SUCCESS after recovery
      for (const t of allTxns) {
        if (t.status === "SUCCESS" && !recoveredTxnIds.has(t.transactionId)) {
          const hasRecoveryLog = allAudit.some(
            (l) => l.transactionId === t.transactionId && (l.eventType === "ACTION_VERIFIED" || l.eventType === "ACTION_EXECUTED")
          );
          if (hasRecoveryLog) {
            recoveredTxnIds.add(t.transactionId);
            revenueRecovered += t.amount;
          }
        }
      }

      const totalBaseRisk = revenueAtRisk + revenueRecovered;

      return {
        revenueAtRisk: totalBaseRisk > 0 ? totalBaseRisk : revenueAtRisk,
        revenueRecovered,
        recoveryRate: totalBaseRisk > 0 ? revenueRecovered / totalBaseRisk : 0,
        transactionsAnalyzed: analyzedTxnIds.size,
        recoverableCases,
        humanReviews,
        guardrailBlocks,
        failedActions,
      };
    }
  } catch (error) {
    console.warn("Could not query DB for store metrics, falling back to synthetic dataset:", error);
  }

  // Fallback to static synthetic dataset baseline
  const dataset = generateSyntheticDataset();
  const atRisk = dataset.transactions.filter(
    (t) => t.status === "FAILED" || t.status === "ABANDONED"
  );
  const revenueAtRisk = atRisk.reduce((sum, t) => sum + t.amount, 0);

  return {
    revenueAtRisk,
    revenueRecovered: 0,
    recoveryRate: 0,
    transactionsAnalyzed: 0,
    recoverableCases: 0,
    humanReviews: 0,
    guardrailBlocks: 0,
    failedActions: 0,
  };
}

export async function getEnrichedTransactions(options: {
  status?: string;
  search?: string;
  limit?: number;
  skip?: number;
} = {}): Promise<{ transactions: EnrichedTransaction[]; total: number }> {
  const limit = options.limit ?? 50;
  const skip = options.skip ?? 0;
  const search = options.search?.trim().toLowerCase();

  try {
    const txCollection = await getTransactionsCollection();
    const query: Record<string, unknown> = {};
    if (options.status && options.status !== "ALL") {
      query.status = options.status;
    }
    if (search) {
      query.$or = [
        { transactionId: { $regex: search, $options: "i" } },
        { customerId: { $regex: search, $options: "i" } },
        { orderId: { $regex: search, $options: "i" } },
      ];
    }

    const [txns, total] = await Promise.all([
      txCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      txCollection.countDocuments(query),
    ]);

    if (txns.length > 0) {
      const txnIds = txns.map((t) => t.transactionId);
      const auditCollection = await getAuditLogCollection();
      const logs = await auditCollection
        .find({ transactionId: { $in: txnIds } })
        .sort({ timestamp: 1 })
        .toArray();

      // Group logs by transactionId
      const logsByTxn = new Map<string, AuditLog[]>();
      for (const log of logs) {
        const list = logsByTxn.get(log.transactionId) ?? [];
        list.push(log);
        logsByTxn.set(log.transactionId, list);
      }

      const enriched: EnrichedTransaction[] = txns.map((t) => {
        const tLogs = logsByTxn.get(t.transactionId) ?? [];
        const aiLog = tLogs.find(
          (l) => l.eventType === "AI_ANALYSIS" || l.eventType === "RECOVERY_RECOMMENDED"
        );
        const guardrailLog = tLogs.find(
          (l) =>
            l.eventType === "GUARDRAIL_CHECK" ||
            l.eventType === "ACTION_BLOCKED" ||
            l.eventType === "HUMAN_REVIEW"
        );
        const actionLog = tLogs.find(
          (l) => l.eventType === "ACTION_VERIFIED" || l.eventType === "ACTION_EXECUTED"
        );

        let guardrailDecision: string | undefined;
        if (guardrailLog) {
          if (guardrailLog.eventType === "HUMAN_REVIEW") {
            guardrailDecision = "HUMAN_REVIEW";
          } else if (guardrailLog.eventType === "ACTION_BLOCKED") {
            guardrailDecision = "BLOCK";
          } else if (guardrailLog.guardrailDecision) {
            guardrailDecision = guardrailLog.guardrailDecision.decision;
          } else {
            guardrailDecision = "ALLOW";
          }
        }

        let recoveryResult: string | undefined;
        if (actionLog) {
          recoveryResult = actionLog.result;
        } else if (guardrailDecision === "BLOCK") {
          recoveryResult = "BLOCKED";
        } else if (guardrailDecision === "HUMAN_REVIEW") {
          recoveryResult = "ESCALATED";
        } else if (aiLog?.aiRecommendation?.classification === "NOT_RECOVERABLE") {
          recoveryResult = "NOT_RECOVERABLE";
        }

        return {
          transactionId: t.transactionId,
          customerId: t.customerId,
          orderId: t.orderId,
          amount: t.amount,
          currency: t.currency,
          status: t.status,
          paymentMethod: t.paymentMethod,
          failureReason: t.failureReason ?? null,
          retryCount: t.retryCount,
          createdAt: typeof t.createdAt === "string" ? t.createdAt : t.createdAt.toISOString(),
          updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : t.updatedAt.toISOString(),
          aiClassification: aiLog?.aiRecommendation?.classification,
          recommendedAction: aiLog?.aiRecommendation?.recommendedAction,
          confidence: aiLog?.aiRecommendation?.confidence,
          guardrailDecision,
          recoveryResult,
        };
      });

      return { transactions: enriched, total };
    }
  } catch (error) {
    console.warn("Could not query DB for transactions, falling back to synthetic dataset:", error);
  }

  // Fallback to synthetic dataset
  const dataset = generateSyntheticDataset();
  let filtered = dataset.transactions;
  if (options.status && options.status !== "ALL") {
    filtered = filtered.filter((t) => t.status === options.status);
  }
  if (search) {
    filtered = filtered.filter(
      (t) =>
        t.transactionId.toLowerCase().includes(search) ||
        t.customerId.toLowerCase().includes(search) ||
        t.orderId.toLowerCase().includes(search)
    );
  }
  const total = filtered.length;
  const page = filtered.slice(skip, skip + limit);

  const transactions: EnrichedTransaction[] = page.map((t) => ({
    transactionId: t.transactionId,
    customerId: t.customerId,
    orderId: t.orderId,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    paymentMethod: t.paymentMethod,
    failureReason: t.failureReason ?? null,
    retryCount: t.retryCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return { transactions, total };
}

export async function getTransactionDetail(transactionId: string): Promise<{
  transaction: Transaction | null;
  customer: Customer | null;
  auditTrail: AuditLog[];
  latestRecommendation?: AuditLog["aiRecommendation"];
  latestGuardrailDecision?: AuditLog["guardrailDecision"];
  latestAction?: AuditLog["action"];
  finalResult?: string;
}> {
  let transaction: Transaction | null = null;
  let customer: Customer | null = null;
  let auditTrail: AuditLog[] = [];

  try {
    const [txCollection, auditCollection] = await Promise.all([
      getTransactionsCollection(),
      getAuditLogCollection(),
    ]);

    const [foundTx, foundAudit] = await Promise.all([
      txCollection.findOne({ transactionId }),
      auditCollection.find({ transactionId }).sort({ timestamp: 1 }).toArray(),
    ]);

    transaction = foundTx;
    auditTrail = foundAudit;

    if (transaction) {
      const custCollection = await getCustomersCollection();
      customer = await custCollection.findOne({ customerId: transaction.customerId });
    }
  } catch (error) {
    console.warn(`Could not load details for ${transactionId} from DB:`, error);
  }

  // Fallback if not found in DB
  if (!transaction) {
    const dataset = generateSyntheticDataset();
    const foundTx = dataset.transactions.find((t) => t.transactionId === transactionId);
    if (foundTx) {
      transaction = foundTx;
      const foundCust = dataset.customers.find((c) => c.customerId === foundTx.customerId);
      if (foundCust) customer = foundCust;
    }
  }

  let latestRecommendation: AuditLog["aiRecommendation"] | undefined;
  let latestGuardrailDecision: AuditLog["guardrailDecision"] | undefined;
  let latestAction: AuditLog["action"] | undefined;
  let finalResult: string | undefined;

  for (const log of auditTrail) {
    if (log.aiRecommendation) latestRecommendation = log.aiRecommendation;
    if (log.guardrailDecision) latestGuardrailDecision = log.guardrailDecision;
    if (log.action) latestAction = log.action;
    finalResult = log.result;
  }

  return {
    transaction,
    customer,
    auditTrail,
    latestRecommendation,
    latestGuardrailDecision,
    latestAction,
    finalResult,
  };
}
