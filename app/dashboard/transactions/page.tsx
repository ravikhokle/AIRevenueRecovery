import Link from "next/link";
import { getEnrichedTransactions } from "@/lib/dashboard/data";
import { TransactionsTable } from "@/app/components/TransactionsTable";

export const dynamic = "force-dynamic";

interface TransactionsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All Statuses" },
  { value: "FAILED", label: "Failed" },
  { value: "ABANDONED", label: "Abandoned" },
  { value: "SUCCESS", label: "Success" },
  { value: "PENDING", label: "Pending" },
];

export default async function TransactionsListPage({
  searchParams,
}: TransactionsPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentStatus = (resolvedSearchParams.status as string) || "ALL";
  const page = parseInt((resolvedSearchParams.page as string) || "1", 10);
  const limit = 25;
  const skip = (page - 1) * limit;

  const { transactions, total } = await getEnrichedTransactions({
    status: currentStatus,
    limit,
    skip,
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">
            Complete log of payment transactions, AI recovery classifications, guardrail evaluations, and execution results.
          </p>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            {/* Status Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((filter) => {
                const isActive = currentStatus === filter.value;
                return (
                  <Link
                    key={filter.value}
                    href={`/dashboard/transactions?status=${filter.value}`}
                    className={`btn btn-sm ${
                      isActive ? "btn-primary" : "btn-secondary"
                    }`}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </div>

            <div className="text-xs text-muted">
              Showing {skip + 1}–{Math.min(skip + limit, total)} of {total} records
            </div>
          </div>

          <TransactionsTable
            transactions={transactions}
            emptyMessage={`No transactions found matching status '${currentStatus}'.`}
          />

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="card-header flex items-center justify-between">
              <div className="text-xs text-muted">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard/transactions?status=${currentStatus}&page=${
                      page - 1
                    }`}
                    className="btn btn-secondary btn-sm"
                  >
                    ← Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/dashboard/transactions?status=${currentStatus}&page=${
                      page + 1
                    }`}
                    className="btn btn-secondary btn-sm"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
