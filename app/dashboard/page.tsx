import Link from "next/link";
import {
  getDashboardOverviewMetrics,
  getEnrichedTransactions,
  getDashboardChartData,
} from "@/lib/dashboard/data";
import { formatRupeesLong, formatPct } from "@/app/components/utils";
import { TransactionsTable } from "@/app/components/TransactionsTable";
import { DashboardCharts } from "./DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const [metrics, { transactions }, chartData] = await Promise.all([
    getDashboardOverviewMetrics(),
    getEnrichedTransactions({ limit: 8 }),
    getDashboardChartData(),
  ]);

  return (
    <div>
      <div className="page-header flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Revenue Recovery Dashboard</h1>

        </div>

        <Link href="/dashboard/batch" className="btn btn-primary">
          Run Recovery Pipeline
        </Link>
      </div>

      <div className="page-body">
        {/* Unified Overview Container matching Batch Dashboard */}
        <div className="card mb-8">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <span className="card-title">Recovery Overview</span>
            <span className="badge badge-green">Live Pipeline</span>
          </div>

          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="metric-card">
                <div className="metric-label">
                  <span>Total Revenue at Risk</span>
                  <span className="badge badge-amber">Risk</span>
                </div>
                <div className="metric-value amber">
                  {formatRupeesLong(metrics.revenueAtRisk)}
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
              </div>

              <div className="metric-card">
                <div className="metric-label">
                  <span>Recovery Rate</span>
                  <span className="badge badge-blue">Rate</span>
                </div>
                <div className="metric-value blue">
                  {formatPct(metrics.recoveryRate, 1)}
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label">
                  <span>Transactions Resolved</span>
                  <span className="badge badge-purple">Ops</span>
                </div>
                <div className="metric-value">{metrics.transactionsAnalyzed}</div>
              </div>
            </div>

            {/* Visual Analytics Charts: Donut Distribution & Performance Bars */}
            <DashboardCharts data={chartData} />
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <span className="card-title">Recent Transactions</span>
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
