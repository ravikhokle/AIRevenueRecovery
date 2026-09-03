import Link from "next/link";
import { getAuditLogCollection } from "@/lib/models/audit-log";
import { formatDateTime, auditEventColor } from "@/app/components/utils";
import type { AuditLog } from "@/types/audit-log";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const EVENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All Events" },
  { value: "PAYMENT_DETECTED", label: "Payment Detected" },
  { value: "AI_ANALYSIS", label: "AI Analysis" },
  { value: "RECOVERY_RECOMMENDED", label: "Recovery Recommended" },
  { value: "GUARDRAIL_CHECK", label: "Guardrail Check" },
  { value: "ACTION_EXECUTED", label: "Action Executed" },
  { value: "ACTION_BLOCKED", label: "Action Blocked" },
  { value: "HUMAN_REVIEW", label: "Human Review" },
  { value: "ACTION_VERIFIED", label: "Action Verified" },
  { value: "ERROR", label: "Errors" },
];

function badgeClassForColor(color: string) {
  if (color === "green") return "badge-green";
  if (color === "red") return "badge-red";
  if (color === "amber") return "badge-amber";
  if (color === "purple") return "badge-purple";
  return "badge-blue";
}

export default async function AuditLogsPage({ searchParams }: AuditPageProps) {
  const resolvedParams = await searchParams;
  const currentEvent = (resolvedParams.eventType as string) || "ALL";
  const currentSearch = (resolvedParams.search as string) || "";

  let logs: AuditLog[] = [];
  try {
    const collection = await getAuditLogCollection();
    const query: Record<string, unknown> = {};

    if (currentEvent !== "ALL") {
      query.eventType = currentEvent;
    }

    if (currentSearch) {
      query.$or = [
        { transactionId: { $regex: currentSearch, $options: "i" } },
        { actor: { $regex: currentSearch, $options: "i" } },
        { reason: { $regex: currentSearch, $options: "i" } },
      ];
    }

    logs = await collection
      .find(query as any)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
  } catch (error) {
    console.warn("Could not fetch audit logs:", error);
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Compliance Audit Trail</h1>
          <p className="page-subtitle">
            Review every AI recommendation, policy verification, and recovery
            action with a searchable, append-only operating record.
          </p>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-1.5 flex-wrap items-center">
              {EVENT_TYPES.map((eventType) => {
                const isActive = currentEvent === eventType.value;
                const searchParam = currentSearch
                  ? `&search=${encodeURIComponent(currentSearch)}`
                  : "";

                return (
                  <Link
                    key={eventType.value}
                    href={`/dashboard/audit?eventType=${eventType.value}${searchParam}`}
                    className={`btn btn-sm ${isActive ? "btn-primary" : "btn-secondary"}`}
                  >
                    {eventType.label}
                  </Link>
                );
              })}
            </div>

            <form
              method="GET"
              action="/dashboard/audit"
              className="flex items-center gap-2 flex-wrap"
            >
              <input type="hidden" name="eventType" value={currentEvent} />
              <input
                type="text"
                name="search"
                defaultValue={currentSearch}
                placeholder="Search transaction, actor, or reason"
                className="input-text text-xs w-64"
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                Filter
              </button>
              {currentSearch && (
                <Link
                  href={`/dashboard/audit?eventType=${currentEvent}`}
                  className="text-xs text-rose-400 hover:underline ml-1"
                >
                  Clear
                </Link>
              )}
            </form>
          </div>

          <div className="card-body p-0">
            {logs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">--</div>
                <div className="empty-state-text">
                  No audit logs found matching filter &apos;{currentEvent}&apos;
                  {currentSearch ? ` and search '${currentSearch}'` : ""}.
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                      <th>Transaction ID</th>
                      <th>Actor</th>
                      <th>Result</th>
                      <th>Reason / Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => {
                      const color = auditEventColor(log.eventType);
                      return (
                        <tr key={log.logId || idx}>
                          <td className="text-xs font-mono text-slate-400">
                            {formatDateTime(log.timestamp)}
                          </td>
                          <td>
                            <span className={`badge ${badgeClassForColor(color)}`}>
                              {log.eventType}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/dashboard/transactions/${log.transactionId}`}
                              className="text-mono font-semibold text-sky-400 hover:underline"
                            >
                              {log.transactionId}
                            </Link>
                          </td>
                          <td className="text-xs font-mono text-slate-300">
                            {log.actor}
                          </td>
                          <td>
                            <span className="text-xs font-semibold font-mono text-slate-100">
                              {log.result}
                            </span>
                          </td>
                          <td className="text-xs text-slate-300 max-w-md truncate">
                            {log.reason || "None"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
