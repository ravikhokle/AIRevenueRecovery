import type { Collection, IndexDescription } from "mongodb";

import { getDb } from "@/lib/db";
import type { AuditLog } from "@/types/audit-log";

export const AUDIT_LOG_COLLECTION = "audit_logs";

export async function getAuditLogCollection(): Promise<Collection<AuditLog>> {
  const db = await getDb();
  return db.collection<AuditLog>(AUDIT_LOG_COLLECTION);
}

/**
 * Ensure indexes exist for efficient querying of audit logs.
 * Called once at startup or on first access.
 *
 * NOTE: Audit logs are IMMUTABLE. No update or delete indexes are created.
 */
export async function ensureAuditLogIndexes(): Promise<void> {
  const collection = await getAuditLogCollection();

  const indexes: IndexDescription[] = [
    // Primary lookup: all events for a transaction, ordered by time
    { key: { transactionId: 1, timestamp: 1 } },

    // Unique constraint on the generated log ID
    { key: { logId: 1 }, unique: true },

    // Query by event type across all transactions
    { key: { eventType: 1, timestamp: -1 } },

    // Query by actor (human reviewer, system, etc.)
    { key: { actor: 1, timestamp: -1 } },

    // TTL: auto-delete logs older than 365 days (compliance retention)
    {
      key: { timestamp: 1 },
      expireAfterSeconds: 365 * 24 * 60 * 60,
    },
  ];

  await collection.createIndexes(indexes);
}
