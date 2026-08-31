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
  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
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
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const statusB = txnStatusBadge(tx.status);
            const classB = classificationBadge(tx.aiClassification);

            let guardrailBadge = <span className="badge badge-neutral">—</span>;
            if (tx.guardrailDecision === "ALLOW" || tx.guardrailDecision === "APPROVED") {
              guardrailBadge = <span className="badge badge-green">Allowed</span>;
            } else if (tx.guardrailDecision === "BLOCK" || tx.guardrailDecision === "BLOCKED") {
              guardrailBadge = <span className="badge badge-red">Blocked</span>;
            } else if (tx.guardrailDecision === "HUMAN_REVIEW") {
              guardrailBadge = <span className="badge badge-purple">Human Review</span>;
            }

            let resultBadge = <span className="badge badge-neutral">—</span>;
            if (tx.recoveryResult === "SUCCESS" || tx.recoveryResult === "VERIFIED" || tx.recoveryResult === "RECOVERED") {
              resultBadge = <span className="badge badge-green">Recovered</span>;
            } else if (tx.recoveryResult === "FAILED" || tx.recoveryResult === "ACTION_FAILED") {
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
              <tr key={tx.transactionId}>
                <td>
                  <Link
                    href={`/dashboard/transactions/${tx.transactionId}`}
                    className="text-mono font-medium hover:underline"
                    style={{ color: "var(--blue)" }}
                  >
                    {tx.transactionId}
                  </Link>
                </td>
                <td>
                  <span className="font-semibold text-primary">
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
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
                <td>
                  {tx.recommendedAction ? (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-raised border border-subtle">
                      {tx.recommendedAction}
                    </span>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
                <td>
                  {tx.confidence !== undefined ? (
                    <span className="text-xs font-mono font-semibold">
                      {(tx.confidence * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
                <td>{guardrailBadge}</td>
                <td>{resultBadge}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
