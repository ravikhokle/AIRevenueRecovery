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
      <div className="page-header flex items-center justify-between flex-wrap gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard/transactions"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold transition-colors"
            >
              <span>←</span>
              <span>Transactions</span>
            </Link>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold font-mono text-slate-900">{tx.transactionId}</h1>
            <span className={`badge ${statusB.cls}`}>{statusB.label}</span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-500 font-mono">Order: {tx.orderId}</span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-500 font-mono">Cust: {tx.customerId}</span>
          </div>
        </div>

        <RunWorkflowButton transactionId={tx.transactionId} status={tx.status} />
      </div>

      <div className="page-body flex flex-col gap-4">
        {/* Compact Professional Recovery Pipeline */}
        <div className="card">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Recovery Pipeline</span>
            <span className="text-[11px] text-slate-400 font-mono">Autonomous Execution Flow</span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {/* Step 1 */}
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-emerald-50/70 border border-emerald-200/80">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-none">1. Ingest</div>
                  <div className="text-[10px] text-emerald-700 font-medium truncate mt-0.5">Detected</div>
                </div>
              </div>

              {/* Step 2 */}
              <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${
                stage2Analyzed ? "bg-blue-50/70 border-blue-200/80" : "bg-slate-50 border-slate-200"
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  stage2Analyzed ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {stage2Analyzed ? "✓" : "2"}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-none">2. Diagnosis</div>
                  <div className={`text-[10px] font-medium truncate mt-0.5 ${stage2Analyzed ? "text-blue-700" : "text-slate-400"}`}>
                    {aiRec ? aiRec.recommendedAction.replaceAll("_", " ") : "Pending"}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${
                guard?.decision === "ALLOW"
                  ? "bg-emerald-50/70 border-emerald-200/80"
                  : guard?.decision === "BLOCK"
                    ? "bg-amber-50/70 border-amber-200/80"
                    : "bg-slate-50 border-slate-200"
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  guard?.decision === "ALLOW"
                    ? "bg-emerald-600 text-white"
                    : guard?.decision === "BLOCK"
                      ? "bg-amber-600 text-white"
                      : "bg-slate-200 text-slate-600"
                }`}>
                  {stage3Guardrailed ? (guard?.decision === "BLOCK" ? "!" : "✓") : "3"}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-none">3. Guardrails</div>
                  <div className={`text-[10px] font-medium truncate mt-0.5 ${
                    guard?.decision === "ALLOW" ? "text-emerald-700" : guard?.decision === "BLOCK" ? "text-amber-700" : "text-slate-400"
                  }`}>
                    {guard ? guard.decision : "Pending"}
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${
                stage4Executed ? "bg-purple-50/70 border-purple-200/80" : "bg-slate-50 border-slate-200"
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  stage4Executed ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {stage4Executed ? "✓" : "4"}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-none">4. Action</div>
                  <div className={`text-[10px] font-medium truncate mt-0.5 ${stage4Executed ? "text-purple-700" : "text-slate-400"}`}>
                    {action ? action.status : (guard?.decision === "BLOCK" ? "Blocked" : "Pending")}
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${
                stage5Verified ? "bg-emerald-50/70 border-emerald-200/80" : "bg-slate-50 border-slate-200"
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  stage5Verified ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {stage5Verified ? "✓" : "5"}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 leading-none">5. Verification</div>
                  <div className={`text-[10px] font-medium truncate mt-0.5 ${stage5Verified ? "text-emerald-700" : "text-slate-400"}`}>
                    {stage5Verified ? "Verified" : (detail.finalResult || "Closed")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid: Transaction Info & Customer Profile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Transaction Information</span>
              <span className="font-mono font-bold text-blue-600 text-sm">
                {formatRupeesLong(tx.amount)}
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4">
                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Amount</div>
                  <div className="text-sm font-semibold text-slate-900 font-mono mt-0.5">
                    {formatRupeesLong(tx.amount)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Payment Method</div>
                  <div className="text-sm font-semibold text-slate-900 font-mono uppercase mt-0.5">
                    {tx.paymentMethod}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Retry Attempts</div>
                  <div className="text-sm font-semibold text-slate-900 font-mono mt-0.5">
                    {tx.retryCount} <span className="text-xs text-slate-400 font-normal">/ 3</span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Failure Reason</div>
                  <div className="mt-0.5">
                    {tx.failureReason ? (
                      <span className="badge badge-red font-mono text-xs">{tx.failureReason}</span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono">None</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Created</div>
                  <div className="text-xs text-slate-700 font-mono mt-0.5">
                    {formatDateTime(tx.createdAt)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Updated</div>
                  <div className="text-xs text-slate-700 font-mono mt-0.5">
                    {formatDateTime(tx.updatedAt)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Customer Profile</span>
              {cust && (
                <span className="text-xs text-slate-400 font-mono">
                  {cust.customerId}
                </span>
              )}
            </div>
            <div className="p-4">
              {cust ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4">
                  <div className="col-span-2 sm:col-span-3">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Customer</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{cust.name || "Customer"}</span>
                      <span className="text-xs text-slate-500 font-normal font-mono">
                        {cust.email || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Orders</div>
                    <div className="text-sm font-semibold text-slate-900 font-mono mt-0.5">
                      {cust.totalTransactions}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Success Rate</div>
                    <div className="text-sm font-semibold text-emerald-600 font-mono mt-0.5">
                      {cust.totalTransactions > 0
                        ? `${((cust.successfulPaymentCount / cust.totalTransactions) * 100).toFixed(0)}%`
                        : "0%"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Lifetime Value</div>
                    <div className="text-sm font-semibold text-slate-900 font-mono mt-0.5">
                      {formatRupeesLong(cust.totalSpent)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">
                  No customer record found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Analysis & Policy Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">AI Recovery Decision</span>
              {aiRec && (
                <span className={`badge ${classB.badgeCls}`}>{classB.label}</span>
              )}
            </div>
            <div className="p-4">
              {aiRec ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Action Recommended
                      </div>
                      <span className="badge badge-blue text-xs font-semibold">
                        {aiRec.recommendedAction.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-medium text-slate-400 uppercase tracking-wider">Confidence</span>
                        <span className="font-mono font-bold text-slate-900">
                          {(aiRec.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${aiRec.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {aiRec.reason && (
                    <div className="text-xs text-slate-600 px-3 py-2 bg-slate-50 rounded border border-slate-100 leading-normal">
                      <span className="font-semibold text-slate-700">Diagnosis: </span>
                      {aiRec.reason}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  No AI diagnosis recorded.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Guardrails & Execution</span>
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
            <div className="p-4 flex flex-col gap-3">
              {guard ? (
                <>
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Guardrail Status</div>
                      <div className="text-xs font-bold text-slate-900 mt-0.5">
                        {guard.decision === "ALLOW" ? "8/8 Rules Passed" : guard.decision}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Execution Mode</div>
                      <div className="text-xs font-medium text-slate-700 mt-0.5">
                        {guard.requiresHumanApproval ? "Manual Review" : "Autonomous (Zero-Touch)"}
                      </div>
                    </div>
                  </div>

                  {action && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 font-mono truncate">
                          {action.actionType}
                        </div>
                        {action.result && (
                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            {action.result.message || action.actionType}
                          </div>
                        )}
                      </div>
                      <span
                        className={`badge shrink-0 text-[11px] ${
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
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  No guardrails evaluated.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Professional Audit Trail Table */}
        <div className="card">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Audit Trail ({trail.length} events)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">Immutable Log</span>
          </div>
          <div className="overflow-x-auto">
            {trail.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No audit log entries recorded for this transaction.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5">Event</th>
                    <th className="px-4 py-2.5">Actor</th>
                    <th className="px-4 py-2.5">Result</th>
                    <th className="px-4 py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {trail.map((entry, idx) => (
                    <tr key={entry.logId || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">
                          {entry.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {entry.actor}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`badge text-[10px] font-semibold ${
                          entry.result === "DETECTED" || entry.result === "ANALYSIS_COMPLETE" || entry.result === "APPROVED" || entry.result === "SUCCESS" || entry.result === "COMPLETED"
                            ? "badge-green"
                            : entry.result === "ERROR" || entry.result === "FAILED"
                              ? "badge-red"
                              : "badge-blue"
                        }`}>
                          {entry.result}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-sans text-xs max-w-md truncate" title={entry.reason || ""}>
                        {entry.reason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
