import Link from "next/link";
import { getAuditLogCollection } from "@/lib/models/audit-log";
import { formatDateTime, auditEventColor } from "@/app/components/utils";
import type { AuditLog, AuditEventType } from "@/types/audit-log";

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

export default async function AuditLogsPage({ searchParams }: AuditPageProps) {
  const resolvedParams = await searchParams;
  const currentEvent = (resolvedParams.eventType as string) || "ALL";

  let logs: AuditLog[] = [];
  try {
    const collection = await getAuditLogCollection();
    const query: Record<string, unknown> = {};
    if (currentEvent !== "ALL") {
      query.eventType = currentEvent;
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
      <div className="page-header">
        <h1 className="page-title">Compliance Audit Trail</h1>
        <p className="page-subtitle">
          Append-only immutable record of every autonomous AI recommendation, guardrail decision, and executed action.
        </p>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              {EVENT_TYPES.map((et) => {
                const isActive = currentEvent === et.value;
                return (
                  <Link
                    key={et.value}
                    href={`/dashboard/audit?eventType=${et.value}`}
                    className={`btn btn-sm ${
                      isActive ? "btn-primary" : "btn-secondary"
                    }`}
                  >
                    {et.label}
                  </Link>
                );
              })}
            </div>

            <div className="text-xs text-muted font-mono">
              {logs.length} events displayed (Max 100)
            </div>
          </div>

          <div className="card-body">
            {logs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🛡️</div>
                <div className="empty-state-text">
                  No audit logs recorded for filter &apos;{currentEvent}&apos;.
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
                          <td className="text-xs font-mono">
                            {formatDateTime(log.timestamp)}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                color === "green"
                                  ? "badge-green"
                                  : color === "red"
                                  ? "badge-red"
                                  : color === "amber"
                                  ? "badge-amber"
                                  : color === "purple"
                                  ? "badge-purple"
                                  : "badge-blue"
                              }`}
                            >
                              {log.eventType}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/dashboard/transactions/${log.transactionId}`}
                              className="text-mono font-medium hover:underline"
                              style={{ color: "var(--blue)" }}
                            >
                              {log.transactionId}
                            </Link>
                          </td>
                          <td className="text-xs font-mono">{log.actor}</td>
                          <td>
                            <span className="text-xs font-semibold font-mono">
                              {log.result}
                            </span>
                          </td>
                          <td className="text-xs text-secondary max-w-md truncate">
                            {log.reason || "—"}
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
