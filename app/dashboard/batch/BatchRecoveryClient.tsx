"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatRupeesLong,
  formatPct,
  formatDuration,
  formatDateTime,
} from "@/app/components/utils";
import type { BatchRun, BatchSummary } from "@/types/batch";

interface BatchRecoveryClientProps {
  initialRuns: BatchRun[];
}

export function BatchRecoveryClient({ initialRuns }: BatchRecoveryClientProps) {
  const [runs, setRuns] = useState<BatchRun[]>(initialRuns);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<BatchSummary | null>(
    initialRuns.length > 0 && initialRuns[0].summary ? initialRuns[0].summary : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("ALL");
  const [limit, setLimit] = useState<number>(10);
  const [customInput, setCustomInput] = useState<string>("10");

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setLimit(Math.min(parsed, 1000));
    }
  };

  const handleRunRecovery = async () => {
    setRunning(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch("/api/batch/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: limit > 0 ? limit : undefined,
          delayMs: 50,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Batch processing failed");
      }

      if (data.summary) {
        setActiveSummary(data.summary);
      }

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

  const handleResetDataset = async () => {
    setResetting(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch("/api/batch/reset", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset dataset");
      }
      setInfoMessage("Synthetic dataset & audit logs reset to clean baseline (0 retries).");
      setActiveSummary(null);
      const listRes = await fetch("/api/batch?limit=10");
      if (listRes.ok) {
        const listData = await listRes.json();
        setRuns(listData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const filteredOutcomes = (activeSummary?.outcomes || []).filter((outcome) => {
    if (outcomeFilter === "ALL") return true;
    return outcome.outcome === outcomeFilter;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="card-title text-base">
              Run Autonomous Revenue Recovery
            </span>
            <p className="text-xs text-slate-400 mt-1">
              Select or type any custom batch size to analyze, guardrail, and recover failed payments.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetDataset}
              disabled={running || resetting}
              className="btn btn-secondary text-xs"
              title="Reset synthetic dataset back to fresh state with 0 retry history"
            >
              {resetting ? (
                <>
                  <span className="spinner" />
                  Resetting...
                </>
              ) : (
                "🔄 Reset Dataset"
              )}
            </button>
            <button
              onClick={handleRunRecovery}
              disabled={running || resetting}
              className="btn btn-primary"
            >
              {running ? (
                <>
                  <span className="spinner" />
                  Recovering Payments...
                </>
              ) : (
                `Start Recovery (${limit} txns)`
              )}
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-slate-700 font-bold uppercase tracking-wider">
                Presets:
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {[10, 25, 50, 100].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setLimit(size);
                      setCustomInput(String(size));
                    }}
                    className={`btn btn-sm ${
                      limit === size && customInput === String(size)
                        ? "btn-primary"
                        : "btn-secondary"
                    }`}
                  >
                    {size} txns
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Batch Size Input */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-700 font-bold uppercase tracking-wider">
                Custom Size:
              </label>
              <div className="custom-size-container">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, limit - 5);
                    setLimit(next);
                    setCustomInput(String(next));
                  }}
                  className="custom-size-btn"
                  title="Decrease by 5"
                >
                  −
                </button>

                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customInput}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  placeholder="15"
                  className="custom-size-input"
                  style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
                />

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(500, limit + 5);
                    setLimit(next);
                    setCustomInput(String(next));
                  }}
                  className="custom-size-btn"
                  title="Increase by 5"
                >
                  +
                </button>
                <span className="text-xs font-semibold text-slate-600 pr-1 select-none">txns</span>
              </div>
            </div>
          </div>

          {running && (
            <div className="panel-soft mt-4 p-3 flex items-center gap-3">
              <span className="spinner" />
              <div className="text-xs text-sky-400">
                <strong>Recovery workflow running:</strong> analyzing {limit} payments,
                checking policy guardrails, and verifying outcomes.
              </div>
            </div>
          )}

          {infoMessage && (
            <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs rounded-lg flex items-center gap-2">
              <span>✓</span>
              <span>{infoMessage}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-lg">
              {error}
            </div>
          )}
        </div>
      </div>

      {activeSummary && (
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="card-title">Run Results</span>
              <span className="text-xs text-slate-400 ml-2 font-mono">
                ({activeSummary.totalTransactions} processed in{" "}
                {formatDuration(activeSummary.durationMs)})
              </span>
            </div>
            <span className="badge badge-green">Completed</span>
          </div>

          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="metric-card">
                <div className="metric-label">Evaluated at Risk</div>
                <div className="metric-value amber">
                  {formatRupeesLong(activeSummary.revenueAtRisk)}
                </div>
                <div className="metric-sub">
                  Remaining:{" "}
                  {formatRupeesLong(
                    Math.max(
                      0,
                      activeSummary.revenueAtRisk - activeSummary.revenueRecovered,
                    ),
                  )}
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Revenue Recovered</div>
                <div className="metric-value green">
                  {formatRupeesLong(activeSummary.revenueRecovered)}
                </div>
                <div className="metric-sub">
                  {activeSummary.successfulRecoveries} transactions saved
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Recovery Conversion</div>
                <div className="metric-value blue">
                  {formatPct(activeSummary.revenueRecoveryRate, 1)}
                </div>
                <div className="metric-sub">Saved volume percentage</div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Safety Policy Blocks</div>
                <div className="metric-value red">
                  {activeSummary.guardrailBlocks}
                </div>
                <div className="metric-sub">Violations safely prevented</div>
              </div>
            </div>

            {activeSummary.outcomes && activeSummary.outcomes.length > 0 && (
              <div>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div className="text-xs font-bold uppercase text-slate-300">
                    Outcomes Breakdown ({filteredOutcomes.length} of{" "}
                    {activeSummary.outcomes.length})
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      "ALL",
                      "RECOVERED",
                      "GUARDRAIL_BLOCKED",
                      "HUMAN_REVIEW",
                      "NOT_RECOVERABLE",
                    ].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setOutcomeFilter(filter)}
                        className={`btn btn-sm ${
                          outcomeFilter === filter ? "btn-primary" : "btn-secondary"
                        }`}
                      >
                        {filter.replaceAll("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Transaction ID</th>
                        <th>Amount</th>
                        <th>Outcome</th>
                        <th>Action</th>
                        <th>Verified</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOutcomes.map((outcome) => {
                        let outcomeBadge = (
                          <span className="badge badge-neutral">
                            {outcome.outcome}
                          </span>
                        );

                        if (outcome.outcome === "RECOVERED") {
                          outcomeBadge = (
                            <span className="badge badge-green">Recovered</span>
                          );
                        } else if (outcome.outcome === "GUARDRAIL_BLOCKED") {
                          outcomeBadge = (
                            <span className="badge badge-red">
                              Guardrail Blocked
                            </span>
                          );
                        } else if (outcome.outcome === "HUMAN_REVIEW") {
                          outcomeBadge = (
                            <span className="badge badge-purple">
                              Human Review
                            </span>
                          );
                        } else if (outcome.outcome === "NOT_RECOVERABLE") {
                          outcomeBadge = (
                            <span className="badge badge-neutral">
                              Not Recoverable
                            </span>
                          );
                        }

                        return (
                          <tr key={outcome.transactionId}>
                            <td>
                              <Link
                                href={`/dashboard/transactions/${outcome.transactionId}`}
                                className="text-mono font-semibold text-sky-400 hover:underline"
                              >
                                {outcome.transactionId}
                              </Link>
                            </td>
                            <td className="font-mono font-semibold">
                              {formatRupeesLong(outcome.amountPaise)}
                            </td>
                            <td>{outcomeBadge}</td>
                            <td>
                              <span className="text-xs font-mono px-2 py-1 rounded bg-slate-800 border border-slate-700">
                                {outcome.recommendedAction || "NO_ACTION"}
                              </span>
                            </td>
                            <td>
                              {outcome.actionVerified ? (
                                <span className="text-emerald-400 text-xs font-bold">
                                  Verified
                                </span>
                              ) : (
                                <span className="text-slate-500 text-xs">Pending</span>
                              )}
                            </td>
                            <td className="text-xs text-slate-400 font-mono">
                              {outcome.processingMs}ms
                            </td>
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

      <div className="card">
        <div className="card-header">
          <span className="card-title">Past Runs History</span>
          <span className="text-xs text-slate-400 font-mono">
            {runs.length} runs recorded
          </span>
        </div>
        <div className="card-body p-0">
          {runs.length === 0 ? (
            <div className="empty-state py-8">
              <div className="empty-state-text">
                No runs executed yet. Click &quot;Start Recovery&quot; above.
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Status</th>
                    <th>Date & Time</th>
                    <th>Transactions</th>
                    <th>Recovered</th>
                    <th>Recovery Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.batchId}>
                      <td className="text-mono font-semibold text-slate-200">
                        {run.batchId}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            run.status === "COMPLETED"
                              ? "badge-green"
                              : "badge-amber"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-slate-400">
                        {formatDateTime(run.startedAt)}
                      </td>
                      <td className="font-mono">
                        {run.summary?.totalTransactions ?? "None"}
                      </td>
                      <td className="font-mono text-emerald-400 font-semibold">
                        {run.summary
                          ? formatRupeesLong(run.summary.revenueRecovered)
                          : "None"}
                      </td>
                      <td className="font-mono">
                        {run.summary
                          ? formatPct(run.summary.revenueRecoveryRate, 1)
                          : "None"}
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
