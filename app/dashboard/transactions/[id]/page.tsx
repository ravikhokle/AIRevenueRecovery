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
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/transactions"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold transition-colors"
            >
              <span>←</span>
              <span>All Transactions</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{tx.transactionId}</h1>
            <span className={`badge text-xs px-2.5 py-1 ${statusB.cls}`}>{statusB.label}</span>
            <span className="text-sm text-slate-400">·</span>
            <span className="text-sm text-slate-500 font-medium">
              {formatDateTime(tx.createdAt)}
            </span>
          </div>
        </div>

        <RunWorkflowButton transactionId={tx.transactionId} status={tx.status} />
      </div>

      <div className="page-body flex flex-col gap-6">
        {/* Recovery Pipeline Stepper */}
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Recovery Pipeline
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {/* Step 1 */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Ingest</div>
                <div className="text-xs text-emerald-700 font-medium">Detected</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              stage2Analyzed ? "bg-blue-50/80 border-blue-200" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                stage2Analyzed ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {stage2Analyzed ? "✓" : "2"}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Diagnosis</div>
                <div className={`text-xs font-medium ${stage2Analyzed ? "text-blue-700" : "text-slate-400"}`}>
                  {aiRec ? aiRec.recommendedAction.replaceAll("_", " ") : "Pending"}
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              guard?.decision === "ALLOW"
                ? "bg-emerald-50/80 border-emerald-200"
                : guard?.decision === "BLOCK"
                  ? "bg-amber-50/80 border-amber-200"
                  : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                guard?.decision === "ALLOW"
                  ? "bg-emerald-600 text-white"
                  : guard?.decision === "BLOCK"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}>
                {stage3Guardrailed ? (guard?.decision === "BLOCK" ? "!" : "✓") : "3"}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Guardrails</div>
                <div className={`text-xs font-medium ${
                  guard?.decision === "ALLOW" ? "text-emerald-700" : guard?.decision === "BLOCK" ? "text-amber-700" : "text-slate-400"
                }`}>
                  {guard ? guard.decision : "Pending"}
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              stage4Executed ? "bg-purple-50/80 border-purple-200" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                stage4Executed ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {stage4Executed ? "✓" : "4"}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Action</div>
                <div className={`text-xs font-medium ${stage4Executed ? "text-purple-700" : "text-slate-400"}`}>
                  {action ? action.status : (guard?.decision === "BLOCK" ? "Blocked" : "Pending")}
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              stage5Verified ? "bg-emerald-50/80 border-emerald-200" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                stage5Verified ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {stage5Verified ? "✓" : "5"}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Verification</div>
                <div className={`text-xs font-medium ${stage5Verified ? "text-emerald-700" : "text-slate-400"}`}>
                  {stage5Verified ? "Recovered" : "Closed"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Essential Summary Card */}
        <div className="card p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Amount
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatRupeesLong(tx.amount)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">
                {tx.currency} · Method: <span className="uppercase">{tx.paymentMethod}</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Customer
              </div>
              <div className="text-base font-semibold text-slate-900">
                {cust?.name || "Customer"}
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate">
                {cust?.email || "No email available"}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Failure Cause
              </div>
              <div className="text-base font-semibold text-slate-900">
                {tx.failureReason ? (
                  <span className="badge badge-red text-xs">{tx.failureReason}</span>
                ) : (
                  "Checkout Abandoned"
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Order Reference: <span className="font-mono text-slate-700">{tx.orderId}</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Recovery Action
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-blue text-xs font-semibold">
                  {aiRec ? aiRec.recommendedAction.replaceAll("_", " ") : "Analysis Pending"}
                </span>
                {aiRec && (
                  <span className="text-xs font-bold text-slate-700">
                    {(aiRec.confidence * 100).toFixed(0)}% Match
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Policy: <span className="font-semibold text-emerald-700">{guard?.decision || "Pending"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Recovery & Execution (2 Clean Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-900">AI Recovery Decision</span>
                {aiRec && <span className={`badge ${classB.badgeCls}`}>{classB.label}</span>}
              </div>

              {aiRec ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Recommended Action</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {aiRec.recommendedAction.replaceAll("_", " ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 font-medium">AI Confidence</div>
                      <div className="text-sm font-bold text-blue-600 mt-0.5">
                        {(aiRec.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-slate-600 bg-slate-50/70 p-3.5 rounded-lg border border-slate-100 leading-relaxed">
                    <span className="font-semibold text-slate-800">Diagnosis: </span>
                    {aiRec.reason}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  No AI diagnosis recorded.
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-900">Policy & Execution</span>
                {guard && (
                  <span className={`badge ${guard.decision === "ALLOW" ? "badge-green" : "badge-red"}`}>
                    {guard.decision}
                  </span>
                )}
              </div>

              {guard ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Guardrail Safety</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {guard.decision === "ALLOW" ? "8/8 Policies Passed" : guard.decision}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Execution Mode</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {guard.requiresHumanApproval ? "Review Required" : "Autonomous (Zero-Touch)"}
                      </div>
                    </div>
                  </div>

                  {action ? (
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {action.actionType.replaceAll("_", " ")}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Status: <span className="font-medium text-emerald-700">{action.status}</span>
                        </div>
                      </div>
                      <span className="badge badge-green text-xs font-semibold">
                        {action.status}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
                      Action status: {detail.finalResult || "Execution pending"}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  No guardrail decision recorded.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Activity Log (3 Minimal Columns, Clear & Spacious) */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Activity Log</span>
            <span className="text-xs font-medium text-slate-400">{trail.length} events</span>
          </div>

          <div className="overflow-x-auto">
            {trail.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No activity recorded.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-400 font-semibold uppercase text-xs tracking-wider">
                    <th className="py-3 px-6">Time</th>
                    <th className="py-3 px-6">Event</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {trail.map((entry, idx) => (
                    <tr key={entry.logId || idx} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap text-xs font-medium">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-slate-900 whitespace-nowrap">
                        {entry.eventType.replaceAll("_", " ")}
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <span className={`badge text-xs font-semibold ${
                          entry.result === "DETECTED" || entry.result === "ANALYSIS_COMPLETE" || entry.result === "APPROVED" || entry.result === "SUCCESS" || entry.result === "COMPLETED"
                            ? "badge-green"
                            : entry.result === "ERROR" || entry.result === "FAILED"
                              ? "badge-red"
                              : "badge-blue"
                        }`}>
                          {entry.result}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 text-xs">
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
