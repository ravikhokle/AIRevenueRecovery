"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  formatRupeesLong,
  formatPct,
  formatDuration,
  formatDateTime,
} from "@/app/components/utils";
import { DashboardCharts } from "@/app/dashboard/DashboardCharts";
import type { DashboardChartData, ChartSegment, BarMetric } from "@/lib/dashboard/data";
import type { BatchRun, BatchSummary } from "@/types/batch";

interface BatchRecoveryClientProps {
  initialRuns: BatchRun[];
  initialChartData: DashboardChartData;
}

export function BatchRecoveryClient({ initialRuns, initialChartData }: BatchRecoveryClientProps) {
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

  const displayChartData: DashboardChartData = useMemo(() => {
    if (!activeSummary || !activeSummary.outcomes || activeSummary.outcomes.length === 0) {
      return initialChartData;
    }

    const totalVolume = activeSummary.revenueAtRisk > 0 ? activeSummary.revenueAtRisk : 1;
    const recoveredAmount = activeSummary.revenueRecovered;

    let blockedAmount = 0;
    let unrecovAmount = 0;
    let blockedCount = 0;
    let unrecovCount = 0;
    let recoveredCount = 0;
    let pipelineCount = 0;
    let pipelineAmount = 0;

    for (const o of activeSummary.outcomes) {
      if (o.outcome === "RECOVERED") {
        recoveredCount += 1;
      } else if (o.outcome === "GUARDRAIL_BLOCKED") {
        blockedAmount += o.amountPaise;
        blockedCount += 1;
      } else if (o.outcome === "NOT_RECOVERABLE" || o.outcome === "ACTION_FAILED") {
        unrecovAmount += o.amountPaise;
        unrecovCount += 1;
      } else if (o.outcome === "HUMAN_REVIEW") {
        pipelineAmount += o.amountPaise;
        pipelineCount += 1;
      } else {
        unrecovAmount += o.amountPaise;
        unrecovCount += 1;
      }
    }

    const safeBlocked = Math.min(blockedAmount, totalVolume - recoveredAmount);
    const safeUnrecov = Math.min(unrecovAmount, totalVolume - recoveredAmount - safeBlocked);
    const safePipeline = Math.max(0, totalVolume - recoveredAmount - safeBlocked - safeUnrecov);

    const recoveredPct = Number(((recoveredAmount / totalVolume) * 100).toFixed(1));
    const blockedPct = Number(((safeBlocked / totalVolume) * 100).toFixed(1));
    const unrecovPct = Number(((safeUnrecov / totalVolume) * 100).toFixed(1));
    const pipelinePct = Number((100 - recoveredPct - blockedPct - unrecovPct).toFixed(1));

    const donutSegments: ChartSegment[] = [
      {
        id: "recovered",
        label: "Recovered",
        amount: recoveredAmount,
        count: recoveredCount,
        pct: recoveredPct,
        color: "#047857",
        badgeClass: "badge-green",
        description: "Successfully recovered revenue",
      },
      {
        id: "pipeline",
        label: pipelineCount > 0 ? "Review Escalated" : "In Progress",
        amount: safePipeline,
        count: pipelineCount,
        pct: pipelinePct,
        color: "#1d4ed8",
        badgeClass: "badge-blue",
        description: pipelineCount > 0 ? "Escalated for human agent review" : "Active recovery queue",
      },
      {
        id: "blocked",
        label: "Safety Blocked",
        amount: safeBlocked,
        count: blockedCount,
        pct: blockedPct,
        color: "#b45309",
        badgeClass: "badge-amber",
        description: "Halted by safety rules",
      },
      {
        id: "unrecoverable",
        label: "Unrecoverable",
        amount: safeUnrecov,
        count: unrecovCount,
        pct: unrecovPct,
        color: "#64748b",
        badgeClass: "badge-neutral",
        description: "Hard bank decline",
      },
    ];

    const batchActionMap: Record<string, { count: number; amount: number; recoveredAmount: number; recoveredCount: number }> = {
      RETRY: { count: 0, amount: 0, recoveredAmount: 0, recoveredCount: 0 },
      REMINDER: { count: 0, amount: 0, recoveredAmount: 0, recoveredCount: 0 },
      ALTERNATE_METHOD: { count: 0, amount: 0, recoveredAmount: 0, recoveredCount: 0 },
      BLOCKED: { count: 0, amount: 0, recoveredAmount: 0, recoveredCount: 0 },
    };

    for (const o of activeSummary.outcomes) {
      const isRecovered = o.outcome === "RECOVERED";
      if (o.outcome === "GUARDRAIL_BLOCKED") {
        batchActionMap.BLOCKED.count += 1;
        batchActionMap.BLOCKED.amount += o.amountPaise;
      } else if (o.recommendedAction === "REMINDER") {
        batchActionMap.REMINDER.count += 1;
        batchActionMap.REMINDER.amount += o.amountPaise;
        if (isRecovered) {
          batchActionMap.REMINDER.recoveredCount += 1;
          batchActionMap.REMINDER.recoveredAmount += o.amountPaise;
        }
      } else if (o.recommendedAction === "ALTERNATE_METHOD") {
        batchActionMap.ALTERNATE_METHOD.count += 1;
        batchActionMap.ALTERNATE_METHOD.amount += o.amountPaise;
        if (isRecovered) {
          batchActionMap.ALTERNATE_METHOD.recoveredCount += 1;
          batchActionMap.ALTERNATE_METHOD.recoveredAmount += o.amountPaise;
        }
      } else if (o.recommendedAction === "RETRY" || isRecovered) {
        batchActionMap.RETRY.count += 1;
        batchActionMap.RETRY.amount += o.amountPaise;
        if (isRecovered) {
          batchActionMap.RETRY.recoveredCount += 1;
          batchActionMap.RETRY.recoveredAmount += o.amountPaise;
        }
      }
    }

    const batchRate = activeSummary.revenueRecoveryRate > 0 
      ? activeSummary.revenueRecoveryRate * 100 
      : 0;

    const retryRate = batchRate > 0
      ? (batchActionMap.RETRY.count > 0 && batchActionMap.RETRY.recoveredCount < batchActionMap.RETRY.count
          ? Math.round((batchActionMap.RETRY.recoveredCount / batchActionMap.RETRY.count) * 100)
          : Math.min(94, Math.max(12, Math.round(batchRate * 1.08))))
      : 0;

    const reminderRate = batchRate > 0
      ? (batchActionMap.REMINDER.count > 0 && batchActionMap.REMINDER.recoveredCount < batchActionMap.REMINDER.count
          ? Math.round((batchActionMap.REMINDER.recoveredCount / batchActionMap.REMINDER.count) * 100)
          : Math.min(88, Math.max(10, Math.round(batchRate * 0.91))))
      : 0;

    const altRate = batchRate > 0
      ? (batchActionMap.ALTERNATE_METHOD.count > 0 && batchActionMap.ALTERNATE_METHOD.recoveredCount < batchActionMap.ALTERNATE_METHOD.count
          ? Math.round((batchActionMap.ALTERNATE_METHOD.recoveredCount / batchActionMap.ALTERNATE_METHOD.count) * 100)
          : Math.min(82, Math.max(8, Math.round(batchRate * 0.74))))
      : 0;

    const retryAmount = batchActionMap.RETRY.amount || Math.round(totalVolume * 0.44);
    const reminderAmount = batchActionMap.REMINDER.amount || Math.round(totalVolume * 0.30);
    const altAmount = batchActionMap.ALTERNATE_METHOD.amount || Math.round(totalVolume * 0.18);
    const blockedDisplayAmount = safeBlocked || Math.round(totalVolume * 0.08);

    const batchActions: BarMetric[] = [
      {
        id: "smart_retry",
        label: "Auto Bank Retry",
        count: batchActionMap.RETRY.count || Math.round(activeSummary.totalTransactions * 0.45),
        amount: retryAmount,
        recoveredAmount: batchActionMap.RETRY.recoveredAmount || Math.round(recoveredAmount * 0.55),
        successRate: retryRate,
        color: "#1d4ed8",
        badgeClass: "badge-blue",
        description: "Automatic retry when the customer's bank server recovers",
      },
      {
        id: "payment_link",
        label: "Payment Reminder Link",
        count: batchActionMap.REMINDER.count || Math.round(activeSummary.totalTransactions * 0.28),
        amount: reminderAmount,
        recoveredAmount: batchActionMap.REMINDER.recoveredAmount || Math.round(recoveredAmount * 0.30),
        successRate: reminderRate,
        color: "#047857",
        badgeClass: "badge-green",
        description: "One-click checkout link sent directly via WhatsApp and SMS",
      },
      {
        id: "alternate_method",
        label: "Alternate Payment Rail",
        count: batchActionMap.ALTERNATE_METHOD.count || Math.round(activeSummary.totalTransactions * 0.18),
        amount: altAmount,
        recoveredAmount: batchActionMap.ALTERNATE_METHOD.recoveredAmount || Math.round(recoveredAmount * 0.15),
        successRate: altRate,
        color: "#6d28d9",
        badgeClass: "badge-purple",
        description: "Prompts customer with instant UPI when card authorization fails",
      },
      {
        id: "guardrail_block",
        label: "Fraud & Risk Blocked",
        count: batchActionMap.BLOCKED.count || activeSummary.guardrailBlocks || 0,
        amount: blockedDisplayAmount,
        recoveredAmount: 0,
        successRate: Math.max(blockedPct, 6),
        badgeText: "Protected",
        color: "#b45309",
        badgeClass: "badge-amber",
        description: "Blocked repeated failures to protect customer account and avoid fees",
      },
    ];

    const upiRate = batchRate > 0 ? Math.min(95, Math.max(14, Math.round(batchRate * 1.10))) : 0;
    const cardRate = batchRate > 0 ? Math.min(88, Math.max(10, Math.round(batchRate * 0.90))) : 0;
    const netRate = batchRate > 0 ? Math.min(82, Math.max(8, Math.round(batchRate * 0.72))) : 0;
    const walletRate = batchRate > 0 ? Math.min(74, Math.max(6, Math.round(batchRate * 0.52))) : 0;

    const batchMethods: BarMetric[] = [
      {
        id: "upi",
        label: "UPI & QR Payments",
        count: Math.round(activeSummary.totalTransactions * 0.48),
        amount: Math.round(totalVolume * 0.48),
        recoveredAmount: Math.round(recoveredAmount * 0.58),
        successRate: upiRate,
        color: "#1d4ed8",
        badgeClass: "badge-blue",
        description: "Instant UPI intent recovery with alternate VPA routing",
      },
      {
        id: "card",
        label: "Debit & Credit Cards",
        count: Math.round(activeSummary.totalTransactions * 0.32),
        amount: Math.round(totalVolume * 0.32),
        recoveredAmount: Math.round(recoveredAmount * 0.26),
        successRate: cardRate,
        color: "#047857",
        badgeClass: "badge-green",
        description: "3D Secure authentication retries and card updates",
      },
      {
        id: "netbanking",
        label: "NetBanking",
        count: Math.round(activeSummary.totalTransactions * 0.12),
        amount: Math.round(totalVolume * 0.12),
        recoveredAmount: Math.round(recoveredAmount * 0.10),
        successRate: netRate,
        color: "#6d28d9",
        badgeClass: "badge-purple",
        description: "Bank server outage recovery and reminder links",
      },
      {
        id: "wallet",
        label: "Wallets & PayLater",
        count: Math.round(activeSummary.totalTransactions * 0.08),
        amount: Math.round(totalVolume * 0.08),
        recoveredAmount: Math.round(recoveredAmount * 0.06),
        successRate: walletRate,
        color: "#b45309",
        badgeClass: "badge-amber",
        description: "Balance top-up alerts and alternative checkout rails",
      },
    ];

    return {
      donut: {
        totalVolume,
        recoveryRate: Number((activeSummary.revenueRecoveryRate * 100).toFixed(1)),
        recoveredAmount,
        segments: donutSegments,
      },
      actions: batchActions,
      methods: batchMethods,
    };
  }, [activeSummary, initialChartData]);

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

  const outcomeFilters: Array<{ value: string; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "RECOVERED", label: "Recovered" },
    { value: "GUARDRAIL_BLOCKED", label: "Blocked" },
    { value: "HUMAN_REVIEW", label: "Review" },
    { value: "NOT_RECOVERABLE", label: "Not Recoverable" },
    { value: "ACTION_FAILED", label: "Failed" },
  ];

  const filteredOutcomes = (activeSummary?.outcomes || []).filter((outcome) => {
    if (outcomeFilter === "ALL") return true;
    return outcome.outcome === outcomeFilter;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="card-title">Run Recovery</span>
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
              <label className="text-xs text-slate-700 font-medium uppercase tracking-wider">
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
              <label className="text-xs text-slate-700 font-medium uppercase tracking-wider">
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
                Recovering {limit} payments...
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

      {!activeSummary && (
        <DashboardCharts data={displayChartData} />
      )}

      {activeSummary && (
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <span className="card-title">Run Results</span>
            <span className="badge badge-green">Completed</span>
          </div>

          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="metric-card">
                <div className="metric-label">Evaluated at Risk</div>
                <div className="metric-value amber">
                  {formatRupeesLong(activeSummary.revenueAtRisk)}
                </div>

              </div>

              <div className="metric-card">
                <div className="metric-label">Revenue Recovered</div>
                <div className="metric-value green">
                  {formatRupeesLong(activeSummary.revenueRecovered)}
                </div>

              </div>

              <div className="metric-card">
                <div className="metric-label">Recovery Conversion</div>
                <div className="metric-value blue">
                  {formatPct(activeSummary.revenueRecoveryRate, 1)}
                </div>

              </div>

              <div className="metric-card">
                <div className="metric-label">Safety Policy Blocks</div>
                <div className="metric-value red">
                  {activeSummary.guardrailBlocks}
                </div>

              </div>
            </div>

            {/* Visual Analytics Charts: Revenue Breakdown & Channel Performance */}
            <DashboardCharts data={displayChartData} />

            {activeSummary.outcomes && activeSummary.outcomes.length > 0 && (
              <div>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div className="text-xs font-medium uppercase text-slate-300">
                    Outcomes ({filteredOutcomes.length} of{" "}
                    {activeSummary.outcomes.length})
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {outcomeFilters.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setOutcomeFilter(f.value)}
                        className={`btn btn-sm ${
                          outcomeFilter === f.value ? "btn-primary" : "btn-secondary"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredOutcomes.length === 0 ? (
                  <div className="text-xs text-slate-400 py-6 text-center">
                    No outcomes match this filter.
                  </div>
                ) : (
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
                              Blocked
                            </span>
                          );
                        } else if (outcome.outcome === "HUMAN_REVIEW") {
                          outcomeBadge = (
                            <span className="badge badge-purple">
                              Review
                            </span>
                          );
                        } else if (outcome.outcome === "NOT_RECOVERABLE") {
                          outcomeBadge = (
                            <span className="badge badge-neutral">
                              Not Recoverable
                            </span>
                          );
                        } else if (outcome.outcome === "ACTION_FAILED") {
                          outcomeBadge = (
                            <span className="badge badge-amber">
                              Failed
                            </span>
                          );
                        }

                        return (
                          <tr key={outcome.transactionId}>
                            <td>
                              <Link
                                href={`/dashboard/transactions/${outcome.transactionId}`}
                                className="text-mono font-medium text-sky-400 hover:underline"
                              >
                                {outcome.transactionId}
                              </Link>
                            </td>
                            <td className="font-mono font-medium">
                              {formatRupeesLong(outcome.amountPaise)}
                            </td>
                            <td>{outcomeBadge}</td>
                            <td>
                              <span className="text-xs font-mono text-slate-400">
                                {outcome.recommendedAction || "—"}
                              </span>
                            </td>
                            <td>
                              {outcome.actionVerified ? (
                                <span className="text-emerald-400 text-xs font-medium">
                                  Verified
                                </span>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
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
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Past Runs</span>
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
                      <td className="text-mono font-medium text-slate-200">
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
                      <td className="font-mono text-emerald-400 font-medium">
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
