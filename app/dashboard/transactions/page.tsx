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
  const currentSearch = (resolvedSearchParams.search as string) || "";
  const page = parseInt((resolvedSearchParams.page as string) || "1", 10);
  const limit = 25;
  const skip = (page - 1) * limit;

  const { transactions, total } = await getEnrichedTransactions({
    status: currentStatus,
    search: currentSearch,
    limit,
    skip,
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Payment Transactions</h1>
          <p className="page-subtitle">
            Search and review payment records with AI recovery classifications,
            confidence scores, guardrail decisions, and verified execution results.
          </p>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2 flex-wrap items-center">
              {STATUS_FILTERS.map((filter) => {
                const isActive = currentStatus === filter.value;
                const searchParam = currentSearch
                  ? `&search=${encodeURIComponent(currentSearch)}`
                  : "";

                return (
                  <Link
                    key={filter.value}
                    href={`/dashboard/transactions?status=${filter.value}${searchParam}`}
                    className={`btn btn-sm ${isActive ? "btn-primary" : "btn-secondary"}`}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </div>

            <form
              method="GET"
              action="/dashboard/transactions"
              className="flex items-center gap-2 flex-wrap"
            >
              <input type="hidden" name="status" value={currentStatus} />
              <input
                type="text"
                name="search"
                defaultValue={currentSearch}
                placeholder="Search transaction, customer, or order"
                className="input-text text-xs w-64"
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                Filter
              </button>
              {currentSearch && (
                <Link
                  href={`/dashboard/transactions?status=${currentStatus}`}
                  className="text-xs text-rose-400 hover:underline ml-1"
                >
                  Clear
                </Link>
              )}
            </form>
          </div>

          <TransactionsTable
            transactions={transactions}
            emptyMessage={`No transactions found matching status '${currentStatus}' ${
              currentSearch ? `and query '${currentSearch}'` : ""
            }.`}
          />

          {totalPages > 1 && (
            <div className="card-header flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-slate-400 font-mono">
                Showing {skip + 1}-{Math.min(skip + limit, total)} of {total} records
                (Page {page} of {totalPages})
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard/transactions?status=${currentStatus}&page=${
                      page - 1
                    }${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ""}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/dashboard/transactions?status=${currentStatus}&page=${
                      page + 1
                    }${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ""}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Next
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
