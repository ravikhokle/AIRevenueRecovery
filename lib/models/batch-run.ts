import type { Collection, IndexDescription } from "mongodb";

import { getDb } from "@/lib/db";
import type { BatchRun } from "@/types/batch";

export const BATCH_RUN_COLLECTION = "batch_runs";

export async function getBatchRunCollection(): Promise<Collection<BatchRun>> {
  const db = await getDb();
  return db.collection<BatchRun>(BATCH_RUN_COLLECTION);
}

/**
 * Create indexes for the batch_runs collection.
 * Called once before first read/write.
 */
export async function ensureBatchRunIndexes(): Promise<void> {
  const collection = await getBatchRunCollection();

  const indexes: IndexDescription[] = [
    // Primary key
    { key: { batchId: 1 }, unique: true },

    // List runs by recency
    { key: { startedAt: -1 } },

    // Filter by status
    { key: { status: 1, startedAt: -1 } },
  ];

  await collection.createIndexes(indexes);
}
