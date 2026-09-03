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

  const stage1Detected = true;
  const stage2Analyzed = !!aiRec;
  const stage3Guardrailed = !!guard;
  const stage4Executed =
    !!action || guard?.decision === "BLOCK" || guard?.decision === "HUMAN_REVIEW";
  const stage5Verified =
    detail.finalResult === "SUCCESS" ||
    detail.finalResult === "VERIFIED" ||
    detail.finalResult === "RECOVERED";

  return (
    <div>
      <div className="page-header flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard/transactions"
              className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold"
            >
              Back to Transactions
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title font-mono">{tx.transactionId}</h1>
            <span className={`badge ${statusB.cls}`}>{statusB.label}</span>
          </div>
          <p className="page-subtitle">
            Order: <span className="font-mono text-slate-300">{tx.orderId}</span>{" "}
            / Customer:{" "}
            <span className="font-mono text-slate-300">{tx.customerId}</span>
          </p>
        </div>

        <RunWorkflowButton transactionId={tx.transactionId} status={tx.status} />
      </div>

      <div className="page-body flex flex-col gap-6">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Autonomous Recovery Pipeline Lifecycle</span>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className={`pipeline-step ${stage1Detected ? "is-green" : ""}`}>
                <div className="font-bold">1. Failure Ingest</div>
                <div className="text-[10px] opacity-80">Detected & Staged</div>
              </div>
              <div className={`pipeline-step ${stage2Analyzed ? "is-blue" : ""}`}>
                <div className="font-bold">2. AI Diagnosis</div>
                <div className="text-[10px] opacity-80">
                  {aiRec ? aiRec.recommendedAction : "Pending"}
                </div>
              </div>
              <div className={`pipeline-step ${stage3Guardrailed ? "is-purple" : ""}`}>
                <div className="font-bold">3. Guardrails</div>
                <div className="text-[10px] opacity-80">
                  {guard ? guard.decision : "Pending"}
                </div>
              </div>
              <div className={`pipeline-step ${stage4Executed ? "is-indigo" : ""}`}>
                <div className="font-bold">4. Action Executed</div>
                <div className="text-[10px] opacity-80">
                  {action ? action.status : "Gated / Pending"}
                </div>
              </div>
              <div className={`pipeline-step ${stage5Verified ? "is-green" : ""}`}>
                <div className="font-bold">5. Verification</div>
                <div className="text-[10px] opacity-80">
                  {stage5Verified ? "Verified Recovered" : "Audit Closed"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Transaction Information</span>
              <span className="font-mono font-bold text-sky-400 text-base">
                {formatRupeesLong(tx.amount)}
              </span>
            </div>
            <div className="card-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <span className="detail-label">Amount</span>
                  <span className="detail-value font-mono font-semibold">
                    {formatRupeesLong(tx.amount)} ({tx.currency})
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Payment Method</span>
                  <span className="detail-value uppercase font-mono text-xs text-slate-200">
                    {tx.paymentMethod}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Failure Reason</span>
                  <span className="detail-value text-rose-400 font-mono text-xs font-semibold">
                    {tx.failureReason || "None reported"}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Retry Attempts</span>
                  <span className="detail-value font-mono">{tx.retryCount} of 3</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Created At</span>
                  <span className="detail-value text-xs font-mono text-slate-400">
                    {formatDateTime(tx.createdAt)}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Last Updated</span>
                  <span className="detail-value text-xs font-mono text-slate-400">
                    {formatDateTime(tx.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Customer Profile & History</span>
              {cust && (
                <span className="text-xs text-slate-400 font-mono">
                  {cust.customerId}
                </span>
              )}
            </div>
            <div className="card-body">
              {cust ? (
                <div className="detail-grid">
                  <div className="detail-field">
                    <span className="detail-label">Name / Email</span>
                    <span className="detail-value text-xs text-slate-200">
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
                    <span className="detail-label">Payment Success Rate</span>
                    <span className="detail-value font-mono text-emerald-400 font-semibold">
                      {cust.totalTransactions > 0
                        ? `${(
                            (cust.successfulPaymentCount / cust.totalTransactions) *
                            100
                          ).toFixed(0)}%`
                        : "0%"}{" "}
                      <span className="text-slate-400 text-xs font-normal">
                        ({cust.successfulPaymentCount} paid / {cust.failedPaymentCount} failed)
                      </span>
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Lifetime Value</span>
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
                    <span className="detail-value uppercase font-mono text-xs text-slate-200">
                      {cust.preferredPaymentMethod || "None"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="empty-state py-6">
                  <div className="empty-state-text">
                    No prior customer record on file.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <span className="detail-label block mb-1">
                        Recommended Action
                      </span>
                      <span className="text-xs font-mono font-bold text-sky-400 px-2.5 py-1 rounded bg-slate-800 border border-slate-700">
                        {aiRec.recommendedAction}
                      </span>
                    </div>

                    <div className="w-48">
                      <span className="detail-label block mb-1">
                        Confidence Score
                      </span>
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
                    <p className="panel-soft text-xs text-slate-300 p-3 leading-relaxed">
                      {aiRec.reason}
                    </p>
                  </div>

                  {aiRec.evidence && aiRec.evidence.length > 0 && (
                    <div>
                      <span className="detail-label block mb-1">
                        Key Evidence Points
                      </span>
                      <ul className="evidence-list">
                        {aiRec.evidence.map((item, idx) => (
                          <li key={idx} className="evidence-item text-xs">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state py-8">
                  <div className="empty-state-text">
                    This transaction has not yet been processed by the AI recovery agent.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card flex flex-col justify-between">
            <div>
              <div className="card-header flex items-center justify-between">
                <span className="card-title">Deterministic Guardrails & Policy</span>
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
                        <span className="detail-label">Guardrail Decision</span>
                        <span className="detail-value font-semibold">
                          {guard.decision}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-label">Human Review Escalation</span>
                        <span className="detail-value text-xs">
                          {guard.requiresHumanApproval
                            ? "Yes (Required by policy)"
                            : "No (Autonomous)"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="detail-label block mb-1">
                        Policy Validation Note
                      </span>
                      <p className="panel-soft text-xs text-slate-300 p-3 leading-relaxed">
                        {guard.reason}
                      </p>
                    </div>

                    {guard.rulesViolated && guard.rulesViolated.length > 0 && (
                      <div>
                        <span className="detail-label block mb-1">
                          Policy Violations
                        </span>
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
                  <div className="empty-state py-8">
                    <div className="empty-state-text">
                      Guardrails have not evaluated this transaction yet.
                    </div>
                  </div>
                )}

                <div className="divider" />

                <div>
                  <span className="detail-label block mb-2">
                    Action Execution & Verification
                  </span>
                  {action ? (
                    <div className="panel-soft p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs font-semibold text-slate-200">
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
                        <div className="text-xs text-slate-400">
                          Result: {action.result.message || JSON.stringify(action.result)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-mono">
                      {detail.finalResult
                        ? `Outcome: ${detail.finalResult}`
                        : "No recovery action executed yet."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Complete Immutable Audit Trail ({trail.length} events)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Append-only compliance log
            </span>
          </div>
          <div className="card-body">
            {trail.length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-state-icon">--</div>
                <div className="empty-state-text">
                  No audit log entries recorded for this transaction yet.
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
                          <span className="timeline-event font-mono text-slate-200">
                            {entry.eventType}
                          </span>
                          <span className="timeline-meta font-mono">
                            {formatDateTime(entry.timestamp)}
                          </span>
                        </div>
                        <div className="timeline-meta">
                          Actor:{" "}
                          <span className="text-slate-300 font-mono">
                            {entry.actor}
                          </span>{" "}
                          / Result:{" "}
                          <span className="text-slate-200 font-semibold font-mono">
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
