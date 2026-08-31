"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupeesLong, formatPct, formatDuration, formatDateTime } from "@/app/components/utils";
import type { BatchRun, BatchSummary } from "@/types/batch";

interface BatchRecoveryClientProps {
  initialRuns: BatchRun[];
}

export function BatchRecoveryClient({ initialRuns }: BatchRecoveryClientProps) {
  const [runs, setRuns] = useState<BatchRun[]>(initialRuns);
  const [running, setRunning] = useState(false);
  const [activeSummary, setActiveSummary] = useState<BatchSummary | null>(
    initialRuns.length > 0 && initialRuns[0].summary ? initialRuns[0].summary : null
  );
  const [error, setError] = useState<string | null>(null);

  // Form options
  const [dryRun, setDryRun] = useState(false);
  const [limit, setLimit] = useState<number>(30);
  const [delayMs, setDelayMs] = useState<number>(200);

  const handleRunRecovery = async () => {
    setRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/batch/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          limit: limit > 0 ? limit : undefined,
          delayMs,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Batch processing failed");
      }

      if (data.summary) {
        setActiveSummary(data.summary);
      }

      // Refresh recent runs
      const listRes = await fetch("/api/batch?limit=10");
      if (listRes.ok) {
        const listData = await listRes.json();
        setRuns(listData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch recovery failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Control Card: Run Recovery */}
      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">Autonomous Batch Recovery Engine</span>
            <p className="text-xs text-muted mt-0.5">
              Processes synthetic failed & abandoned transactions one-by-one through AI analysis, guardrails, actions, and verification.
            </p>
          </div>
          <button
            onClick={handleRunRecovery}
            disabled={running}
            className="btn btn-primary"
          >
            {running ? (
              <>
                <span className="spinner" />
                Processing Transactions...
              </>
            ) : (
              <>
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
                Run Recovery
              </>
            )}
          </button>
        </div>

        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dryRunCheckbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-border bg-raised"
              />
              <label htmlFor="dryRunCheckbox" className="text-xs text-secondary cursor-pointer">
                <strong className="text-primary">Dry Run Mode</strong> (Mock outcomes, safe testing)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-secondary">Transaction Limit:</label>
              <input
                type="number"
                min="1"
                max="200"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
                className="w-24 px-2 py-1 text-xs bg-raised border border-border rounded text-primary font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-secondary">Pacing Delay:</label>
              <select
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value))}
                className="px-2 py-1 text-xs bg-raised border border-border rounded text-primary"
              >
                <option value="0">0ms (Immediate)</option>
                <option value="200">200ms (Fast)</option>
                <option value="1000">1000ms (1s Standard)</option>
                <option value="2000">2000ms (2s Safe)</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-dim border border-red-dim text-red text-xs rounded">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Summary Metrics of Latest / Current Run */}
      {activeSummary && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <span className="card-title">Batch Recovery Results</span>
              <span className="text-xs text-muted ml-2">
                (Completed in {formatDuration(activeSummary.durationMs)} · Seed Version {activeSummary.seedVersion})
              </span>
            </div>
            <span className="badge badge-green">COMPLETED</span>
          </div>

          <div className="card-body">
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Revenue at Risk</div>
                <div className="metric-value amber">
                  {formatRupeesLong(activeSummary.revenueAtRisk)}
                </div>
                <div className="metric-sub">Total batch volume</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Revenue Recovered</div>
                <div className="metric-value green">
                  {formatRupeesLong(activeSummary.revenueRecovered)}
                </div>
                <div className="metric-sub">Verified recovered amount</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Recovery Rate</div>
                <div className="metric-value blue">
                  {formatPct(activeSummary.revenueRecoveryRate, 1)}
                </div>
                <div className="metric-sub">Saved revenue percentage</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Total Transactions</div>
                <div className="metric-value">{activeSummary.totalTransactions}</div>
                <div className="metric-sub">Processed in sequence</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Recoverable Cases</div>
                <div className="metric-value green">{activeSummary.recoverableCases}</div>
                <div className="metric-sub">AI classified recoverable</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Successful Recoveries</div>
                <div className="metric-value green">{activeSummary.successfulRecoveries}</div>
                <div className="metric-sub">Action executed & verified</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Human Reviews</div>
                <div className="metric-value purple">{activeSummary.humanReviews}</div>
                <div className="metric-sub">Escalated by policy</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Guardrail Blocks</div>
                <div className="metric-value red">{activeSummary.guardrailBlocks}</div>
                <div className="metric-sub">Prevented violations</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Failed Actions</div>
                <div className="metric-value text-muted">{activeSummary.failedRecoveryActions}</div>
                <div className="metric-sub">Unsuccessful retries</div>
              </div>
            </div>

            {/* Outcomes Table for this Run */}
            {activeSummary.outcomes && activeSummary.outcomes.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase text-secondary tracking-wider mb-3">
                  Transaction Outcomes ({activeSummary.outcomes.length})
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Transaction ID</th>
                        <th>Amount</th>
                        <th>Outcome</th>
                        <th>AI Classification</th>
                        <th>Action Taken</th>
                        <th>Verified</th>
                        <th>Processing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSummary.outcomes.map((o) => {
                        let outcomeBadge = <span className="badge badge-neutral">{o.outcome}</span>;
                        if (o.outcome === "RECOVERED") {
                          outcomeBadge = <span className="badge badge-green">Recovered</span>;
                        } else if (o.outcome === "GUARDRAIL_BLOCKED") {
                          outcomeBadge = <span className="badge badge-red">Guardrail Blocked</span>;
                        } else if (o.outcome === "HUMAN_REVIEW") {
                          outcomeBadge = <span className="badge badge-purple">Human Review</span>;
                        } else if (o.outcome === "ACTION_FAILED") {
                          outcomeBadge = <span className="badge badge-red">Action Failed</span>;
                        } else if (o.outcome === "NOT_RECOVERABLE") {
                          outcomeBadge = <span className="badge badge-neutral">Not Recoverable</span>;
                        }

                        return (
                          <tr key={o.transactionId}>
                            <td>
                              <Link
                                href={`/dashboard/transactions/${o.transactionId}`}
                                className="text-mono font-medium hover:underline"
                                style={{ color: "var(--blue)" }}
                              >
                                {o.transactionId}
                              </Link>
                            </td>
                            <td className="font-mono">{formatRupeesLong(o.amountPaise)}</td>
                            <td>{outcomeBadge}</td>
                            <td>
                              {o.aiClassification ? (
                                <span className="text-xs font-mono">{o.aiClassification}</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {o.actionExecuted ? (
                                <span className="text-xs font-mono">{o.recommendedAction || "Executed"}</span>
                              ) : (
                                <span className="text-muted text-xs">None</span>
                              )}
                            </td>
                            <td>
                              {o.actionVerified ? (
                                <span className="text-green text-xs font-bold">✓ Yes</span>
                              ) : o.actionExecuted ? (
                                <span className="text-red text-xs">✗ No</span>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                            <td className="text-xs text-muted font-mono">{o.processingMs}ms</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historical Batch Runs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Past Batch Recovery Runs</span>
          <span className="text-xs text-muted">{runs.length} recorded runs</span>
        </div>
        <div className="card-body">
          {runs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏱️</div>
              <div className="empty-state-text">No batch runs executed yet. Click &quot;Run Recovery&quot; above to start.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Transactions</th>
                    <th>Recovered</th>
                    <th>Recovery Rate</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.batchId}>
                      <td className="text-mono font-medium">{r.batchId}</td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === "COMPLETED"
                              ? "badge-green"
                              : r.status === "RUNNING"
                              ? "badge-amber"
                              : "badge-red"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="text-xs">{formatDateTime(r.startedAt)}</td>
                      <td className="font-mono">{r.summary?.totalTransactions ?? "—"}</td>
                      <td className="font-mono text-green font-semibold">
                        {r.summary ? formatRupeesLong(r.summary.revenueRecovered) : "—"}
                      </td>
                      <td className="font-mono">
                        {r.summary ? formatPct(r.summary.revenueRecoveryRate, 1) : "—"}
                      </td>
                      <td className="text-xs text-muted font-mono">
                        {r.summary ? formatDuration(r.summary.durationMs) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
