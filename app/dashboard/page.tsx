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
    getEnrichedTransactions({ limit: 8 }),
  ]);

  return (
    <div>
      <div className="page-header flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Revenue Recovery Dashboard</h1>
          <p className="page-subtitle">
            Monitor failed payments, AI recovery decisions, guardrail outcomes,
            and verified revenue gains in one clean operating view.
          </p>
        </div>

        <Link href="/dashboard/batch" className="btn btn-primary">
          Run Recovery Pipeline
        </Link>
      </div>

      <div className="page-body">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="metric-card">
            <div className="metric-label">
              <span>Total Revenue at Risk</span>
              <span className="badge badge-amber">Risk</span>
            </div>
            <div className="metric-value amber">
              {formatRupeesLong(metrics.revenueAtRisk)}
            </div>
            <div className="metric-sub">
              Remaining:{" "}
              <span className="font-mono font-semibold text-slate-300">
                {formatRupeesLong(
                  Math.max(0, metrics.revenueAtRisk - metrics.revenueRecovered),
                )}
              </span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Revenue Recovered</span>
              <span className="badge badge-green">Paid</span>
            </div>
            <div className="metric-value green">
              {formatRupeesLong(metrics.revenueRecovered)}
            </div>
            <div className="metric-sub">Verified through payment gateway</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Recovery Rate</span>
              <span className="badge badge-blue">Rate</span>
            </div>
            <div className="metric-value blue">
              {formatPct(metrics.recoveryRate, 1)}
            </div>
            <div className="metric-sub">Overall revenue recaptured</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Transactions Resolved</span>
              <span className="badge badge-purple">Ops</span>
            </div>
            <div className="metric-value">{metrics.transactionsAnalyzed}</div>
            <div className="metric-sub">
              {metrics.guardrailBlocks} guardrail blocks / {metrics.humanReviews} review
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="card-title">Recent Transactions</span>
              <span className="text-xs text-slate-400 font-mono">
                ({total} total in store)
              </span>
            </div>
            <Link href="/dashboard/transactions" className="btn btn-secondary btn-sm">
              View All Transactions
            </Link>
          </div>

          <TransactionsTable
            transactions={transactions}
            emptyMessage="No transaction records found. Run the recovery pipeline to process payment failures."
          />
        </div>
      </div>
    </div>
  );
}
