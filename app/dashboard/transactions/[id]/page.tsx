import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransactionDetail } from "@/lib/dashboard/data";
import {
  formatRupeesLong,
  formatDateTime,
  txnStatusBadge,
  classificationBadge,
  auditEventColor,
} from "@/app/components/utils";
import { RunWorkflowButton } from "./RunWorkflowButton";

export const dynamic = "force-dynamic";

interface TransactionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({
  params,
}: TransactionDetailPageProps) {
  const { id } = await params;
  const detail = await getTransactionDetail(id);

  if (!detail.transaction) {
    notFound();
  }

  const tx = detail.transaction;
  const cust = detail.customer;
  const aiRec = detail.latestRecommendation;
  const guard = detail.latestGuardrailDecision;
  const action = detail.latestAction;
  const trail = detail.auditTrail;

  const statusB = txnStatusBadge(tx.status);
  const classB = classificationBadge(aiRec?.classification);

  return (
    <div>
      <div className="page-header flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/transactions"
              className="text-xs text-muted hover:underline"
            >
              ← Back to Transactions
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="page-title font-mono">{tx.transactionId}</h1>
            <span className={`badge ${statusB.cls}`}>{statusB.label}</span>
          </div>
          <p className="page-subtitle">
            Order: <span className="font-mono">{tx.orderId}</span> | Customer:{" "}
            <span className="font-mono">{tx.customerId}</span>
          </p>
        </div>

        <RunWorkflowButton
          transactionId={tx.transactionId}
          status={tx.status}
        />
      </div>

      <div className="page-body flex flex-col gap-6">
        {/* Top Split: Transaction Info & Customer History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Transaction Information */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Transaction Information</span>
              <span className="font-mono font-bold text-primary">
                {formatRupeesLong(tx.amount)}
              </span>
            </div>
            <div className="card-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <span className="detail-label">Amount</span>
                  <span className="detail-value font-mono">
                    {formatRupeesLong(tx.amount)} ({tx.currency})
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Payment Method</span>
                  <span className="detail-value uppercase font-mono text-xs">
                    {tx.paymentMethod}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Failure Reason</span>
                  <span className="detail-value text-red font-mono text-xs">
                    {tx.failureReason || "None reported"}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Retry Count</span>
                  <span className="detail-value font-mono">{tx.retryCount}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Created At</span>
                  <span className="detail-value text-xs">
                    {formatDateTime(tx.createdAt)}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Last Updated</span>
                  <span className="detail-value text-xs">
                    {formatDateTime(tx.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Customer Payment History */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Customer Payment History</span>
              {cust && (
                <span className="text-xs text-muted font-mono">{cust.customerId}</span>
              )}
            </div>
            <div className="card-body">
              {cust ? (
                <div className="detail-grid">
                  <div className="detail-field">
                    <span className="detail-label">Name / Email</span>
                    <span className="detail-value text-xs">
                      {cust.name || "Unknown"} ({cust.email || "N/A"})
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Total Transactions</span>
                    <span className="detail-value font-mono font-semibold">
                      {cust.totalTransactions}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Success Rate</span>
                    <span className="detail-value font-mono text-green">
                      {cust.totalTransactions > 0
                        ? `${(
                            (cust.successfulPaymentCount / cust.totalTransactions) *
                            100
                          ).toFixed(0)}%`
                        : "0%"}{" "}
                      <span className="text-muted text-xs">
                        ({cust.successfulPaymentCount} paid / {cust.failedPaymentCount}{" "}
                        failed)
                      </span>
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Total Spent</span>
                    <span className="detail-value font-mono">
                      {formatRupeesLong(cust.totalSpent)}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Avg Order Value</span>
                    <span className="detail-value font-mono">
                      {formatRupeesLong(cust.averageOrderValue)}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Preferred Method</span>
                    <span className="detail-value uppercase font-mono text-xs">
                      {cust.preferredPaymentMethod || "None"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-text">No customer history profile on record.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middle Split: AI Analysis & Guardrail / Action Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 3. AI Analysis */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span className="card-title">AI Recovery Analysis</span>
              {aiRec && (
                <span className={`badge ${classB.badgeCls}`}>{classB.label}</span>
              )}
            </div>
            <div className="card-body">
              {aiRec ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="detail-label block mb-1">Recommended Action</span>
                      <span className="font-mono text-sm font-bold text-primary px-2 py-0.5 rounded bg-raised border border-subtle">
                        {aiRec.recommendedAction}
                      </span>
                    </div>

                    <div className="w-48">
                      <span className="detail-label block mb-1">Confidence Score</span>
                      <div className="confidence-bar-wrap">
                        <div className="confidence-bar-bg">
                          <div
                            className={`confidence-bar-fill ${
                              aiRec.confidence < 0.5
                                ? "red"
                                : aiRec.confidence < 0.75
                                ? "amber"
                                : ""
                            }`}
                            style={{ width: `${aiRec.confidence * 100}%` }}
                          />
                        </div>
                        <span className="confidence-pct">
                          {(aiRec.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="detail-label block mb-1">AI Reasoning</span>
                    <p className="text-sm text-secondary bg-raised p-3 rounded border border-subtle">
                      {aiRec.reason}
                    </p>
                  </div>

                  {aiRec.evidence && aiRec.evidence.length > 0 && (
                    <div>
                      <span className="detail-label block mb-1">Evidence</span>
                      <ul className="evidence-list">
                        {aiRec.evidence.map((item, idx) => (
                          <li key={idx} className="evidence-item">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-text">
                    This transaction has not yet been processed by the AI agent.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Guardrail Decision & Recovery Result */}
          <div className="card flex flex-col justify-between">
            <div>
              <div className="card-header flex items-center justify-between">
                <span className="card-title">Guardrail Policy & Execution</span>
                {guard && (
                  <span
                    className={`badge ${
                      guard.decision === "ALLOW"
                        ? "badge-green"
                        : guard.decision === "BLOCK"
                        ? "badge-red"
                        : "badge-purple"
                    }`}
                  >
                    {guard.decision}
                  </span>
                )}
              </div>
              <div className="card-body">
                {guard ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="detail-field">
                        <span className="detail-label">Decision</span>
                        <span className="detail-value font-semibold">
                          {guard.decision}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-label">Human Review Required</span>
                        <span className="detail-value">
                          {guard.requiresHumanApproval ? "Yes (Escalated)" : "No"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="detail-label block mb-1">Guardrail Rule Details</span>
                      <p className="text-sm text-secondary bg-raised p-3 rounded border border-subtle">
                        {guard.reason}
                      </p>
                    </div>

                    {guard.rulesViolated && guard.rulesViolated.length > 0 && (
                      <div>
                        <span className="detail-label block mb-1">Policy Violations</span>
                        <div className="flex gap-2 flex-wrap">
                          {guard.rulesViolated.map((rule, idx) => (
                            <span key={idx} className="badge badge-red font-mono text-xs">
                              {rule}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-text">
                      Guardrails have not evaluated this transaction yet.
                    </div>
                  </div>
                )}

                <div className="divider" />

                {/* 5. Recovery Result */}
                <div>
                  <span className="detail-label block mb-2">Action Execution & Verification</span>
                  {action ? (
                    <div className="bg-raised p-3 rounded border border-subtle flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold">
                          Action: {action.actionType}
                        </span>
                        <span
                          className={`badge ${
                            action.status === "COMPLETED"
                              ? "badge-green"
                              : action.status === "FAILED"
                              ? "badge-red"
                              : "badge-amber"
                          }`}
                        >
                          {action.status}
                        </span>
                      </div>
                      {action.result && (
                        <div className="text-xs text-secondary">
                          Result: {action.result.message || JSON.stringify(action.result)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">
                      {detail.finalResult
                        ? `Outcome: ${detail.finalResult}`
                        : "No execution action taken yet."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Complete Audit Trail */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Complete Immutable Audit Trail ({trail.length} events)
            </span>
            <span className="text-xs text-muted">Append-only compliance log</span>
          </div>
          <div className="card-body">
            {trail.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🛡️</div>
                <div className="empty-state-text">
                  No audit log entries recorded for this transaction.
                </div>
              </div>
            ) : (
              <ul className="timeline">
                {trail.map((entry, idx) => {
                  const color = auditEventColor(entry.eventType);
                  return (
                    <li key={entry.logId || idx} className="timeline-item">
                      <div className={`timeline-dot ${color}`} />
                      <div className="timeline-body">
                        <div className="flex items-center justify-between gap-4">
                          <span className="timeline-event font-mono">
                            {entry.eventType}
                          </span>
                          <span className="timeline-meta font-mono">
                            {formatDateTime(entry.timestamp)}
                          </span>
                        </div>
                        <div className="timeline-meta">
                          Actor: <span className="text-primary font-mono">{entry.actor}</span>{" "}
                          | Result:{" "}
                          <span className="text-primary font-semibold">
                            {entry.result}
                          </span>
                        </div>
                        {entry.reason && (
                          <div className="timeline-reason">{entry.reason}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
