/**
 * Shared UI utility functions used across dashboard pages.
 * Pure functions: no side effects, no browser APIs.
 */

const rupeeCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const rupeeLongFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10_00_000) {
    return `${rupeeLongFormatter.format(rupees / 10_00_000)}L`;
  }
  if (rupees >= 1000) {
    return rupeeCompactFormatter.format(rupees);
  }
  return rupeeLongFormatter.format(rupees);
}

export function formatRupeesLong(paise: number): string {
  return rupeeLongFormatter.format(paise / 100);
}

export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function txnStatusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "SUCCESS":
      return { cls: "badge-green", label: "Success" };
    case "FAILED":
      return { cls: "badge-red", label: "Failed" };
    case "ABANDONED":
      return { cls: "badge-amber", label: "Abandoned" };
    case "PENDING":
      return { cls: "badge-neutral", label: "Pending" };
    default:
      return { cls: "badge-neutral", label: status };
  }
}

export function classificationBadge(
  cls?: string,
): { badgeCls: string; label: string } {
  switch (cls) {
    case "RECOVERABLE":
      return { badgeCls: "badge-green", label: "Recoverable" };
    case "NOT_RECOVERABLE":
      return { badgeCls: "badge-red", label: "Not Recoverable" };
    case "HUMAN_REVIEW":
      return { badgeCls: "badge-purple", label: "Human Review" };
    default:
      return { badgeCls: "badge-neutral", label: cls ?? "None" };
  }
}

export function outcomeColor(outcome: string): string {
  switch (outcome) {
    case "RECOVERED":
      return "green";
    case "GUARDRAIL_BLOCKED":
      return "amber";
    case "HUMAN_REVIEW":
      return "purple";
    case "ACTION_FAILED":
      return "red";
    case "NOT_RECOVERABLE":
      return "neutral";
    case "ERROR":
      return "red";
    default:
      return "neutral";
  }
}

export function auditEventColor(eventType: string): string {
  switch (eventType) {
    case "PAYMENT_DETECTED":
    case "AI_ANALYSIS":
    case "RECOVERY_RECOMMENDED":
      return "";
    case "GUARDRAIL_CHECK":
      return "amber";
    case "ACTION_EXECUTED":
    case "ACTION_VERIFIED":
      return "green";
    case "ACTION_BLOCKED":
    case "ERROR":
      return "red";
    case "HUMAN_REVIEW":
      return "purple";
    default:
      return "";
  }
}
