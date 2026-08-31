import Link from "next/link";
import {
  getDashboardOverviewMetrics,
  getEnrichedTransactions,
} from "@/lib/dashboard/data";
import { formatRupeesLong, formatPct } from "@/app/components/utils";
import { TransactionsTable } from "@/app/components/TransactionsTable";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const [metrics, { transactions, total }] = await Promise.all([
    getDashboardOverviewMetrics(),
    getEnrichedTransactions({ limit: 10 }),
  ]);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Merchant Revenue Recovery Dashboard</h1>
          <p className="page-subtitle">
            Autonomous AI agent monitoring failed payments, evaluating recovery strategies, and executing verified actions within guardrails.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/batch" className="btn btn-primary">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Batch Recovery
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Core KPI metrics grid */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Revenue at Risk</div>
            <div className="metric-value amber">
              {formatRupeesLong(metrics.revenueAtRisk)}
            </div>
            <div className="metric-sub">Total failed & abandoned volume</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Revenue Recovered</div>
            <div className="metric-value green">
              {formatRupeesLong(metrics.revenueRecovered)}
            </div>
            <div className="metric-sub">Successfully processed & verified</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Recovery Rate</div>
            <div className="metric-value blue">
              {formatPct(metrics.recoveryRate, 1)}
            </div>
            <div className="metric-sub">Recovered / at-risk volume</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Transactions Analyzed</div>
            <div className="metric-value">
              {metrics.transactionsAnalyzed}
            </div>
            <div className="metric-sub">Processed through AI pipeline</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Recoverable Cases</div>
            <div className="metric-value green">
              {metrics.recoverableCases}
            </div>
            <div className="metric-sub">AI classified recoverable</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Human Reviews</div>
            <div className="metric-value purple">
              {metrics.humanReviews}
            </div>
            <div className="metric-sub">Escalated by policy rules</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Guardrail Blocks</div>
            <div className="metric-value red">
              {metrics.guardrailBlocks}
            </div>
            <div className="metric-sub">Prevented unauthorized actions</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Failed Actions</div>
            <div className="metric-value text-muted">
              {metrics.failedActions}
            </div>
            <div className="metric-sub">Unsuccessful retry attempts</div>
          </div>
        </div>

        {/* Transactions Table Section */}
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">Recent Transactions</span>
              <span className="text-muted text-xs ml-2">
                (Showing latest {transactions.length} of {total})
              </span>
            </div>
            <Link
              href="/dashboard/transactions"
              className="btn btn-secondary btn-sm"
            >
              View All Transactions →
            </Link>
          </div>

          <TransactionsTable
            transactions={transactions}
            emptyMessage="No transaction records available. Run a batch recovery to analyze payments."
          />
        </div>
      </div>
    </div>
  );
}
