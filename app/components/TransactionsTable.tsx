"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatRupeesLong,
  txnStatusBadge,
  classificationBadge,
} from "@/app/components/utils";
import type { EnrichedTransaction } from "@/lib/dashboard/data";

interface TransactionsTableProps {
  transactions: EnrichedTransaction[];
  emptyMessage?: string;
}

export function TransactionsTable({
  transactions,
  emptyMessage = "No transactions found",
}: TransactionsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">--</div>
        <div className="empty-state-text">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Amount</th>
            <th>Status</th>
            <th>AI Classification</th>
            <th>Recommended Action</th>
            <th>Confidence</th>
            <th>Guardrail Decision</th>
            <th>Recovery Result</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const statusB = txnStatusBadge(tx.status);
            const classB = classificationBadge(tx.aiClassification);

            let guardrailBadge = <span className="badge badge-neutral">None</span>;
            if (tx.guardrailDecision === "ALLOW" || tx.guardrailDecision === "APPROVED") {
              guardrailBadge = <span className="badge badge-green">Allowed</span>;
            } else if (tx.guardrailDecision === "BLOCK" || tx.guardrailDecision === "BLOCKED") {
              guardrailBadge = <span className="badge badge-red">Blocked</span>;
            } else if (tx.guardrailDecision === "HUMAN_REVIEW") {
              guardrailBadge = <span className="badge badge-purple">Human Review</span>;
            }

            let resultBadge = <span className="badge badge-neutral">Pending</span>;
            if (
              tx.recoveryResult === "SUCCESS" ||
              tx.recoveryResult === "VERIFIED" ||
              tx.recoveryResult === "RECOVERED"
            ) {
              resultBadge = <span className="badge badge-green">Recovered</span>;
            } else if (
              tx.recoveryResult === "FAILED" ||
              tx.recoveryResult === "ACTION_FAILED"
            ) {
              resultBadge = <span className="badge badge-red">Failed</span>;
            } else if (tx.recoveryResult === "BLOCKED") {
              resultBadge = <span className="badge badge-red">Blocked</span>;
            } else if (tx.recoveryResult === "ESCALATED") {
              resultBadge = <span className="badge badge-purple">Escalated</span>;
            } else if (tx.recoveryResult === "NOT_RECOVERABLE") {
              resultBadge = <span className="badge badge-neutral">Not Recoverable</span>;
            } else if (tx.recoveryResult) {
              resultBadge = <span className="badge badge-blue">{tx.recoveryResult}</span>;
            }

            return (
              <tr key={tx.transactionId} className="group">
                <td>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/transactions/${tx.transactionId}`}
                      className="text-mono font-semibold text-sky-400 hover:underline"
                    >
                      {tx.transactionId}
                    </Link>
                    <button
                      onClick={(e) => handleCopy(tx.transactionId, e)}
                      title="Copy transaction ID"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-400 transition-opacity p-1 text-xs"
                    >
                      {copiedId === tx.transactionId ? "Copied" : "Copy"}
                    </button>
                  </div>
                </td>
                <td>
                  <span className="font-semibold text-slate-100 font-mono">
                    {formatRupeesLong(tx.amount)}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusB.cls}`}>{statusB.label}</span>
                </td>
                <td>
                  {tx.aiClassification ? (
                    <span className={`badge ${classB.badgeCls}`}>{classB.label}</span>
                  ) : (
                    <span className="text-slate-500 text-xs">None</span>
                  )}
                </td>
                <td>
                  {tx.recommendedAction ? (
                    <span className="text-xs font-mono px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                      {tx.recommendedAction}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs">None</span>
                  )}
                </td>
                <td>
                  {tx.confidence !== undefined ? (
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {(tx.confidence * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs">None</span>
                  )}
                </td>
                <td>{guardrailBadge}</td>
                <td>{resultBadge}</td>
                <td className="text-right">
                  <Link
                    href={`/dashboard/transactions/${tx.transactionId}`}
                    className="btn btn-secondary btn-sm"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
