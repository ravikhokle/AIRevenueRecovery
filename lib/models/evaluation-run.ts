import type { Collection, IndexDescription } from "mongodb";

import { getDb } from "@/lib/db";
import type { EvaluationResult } from "@/types/evaluation";

export const EVAL_RUN_COLLECTION = "evaluation_runs";

export async function getEvalRunCollection(): Promise<
  Collection<EvaluationResult>
> {
  const db = await getDb();
  return db.collection<EvaluationResult>(EVAL_RUN_COLLECTION);
}

/**
 * Create indexes for the evaluation_runs collection.
 */
export async function ensureEvalRunIndexes(): Promise<void> {
  const collection = await getEvalRunCollection();

  const indexes: IndexDescription[] = [
    { key: { evalId: 1 }, unique: true },
    { key: { startedAt: -1 } },
    { key: { status: 1, startedAt: -1 } },
    { key: { datasetSeedVersion: 1 } },
  ];

  await collection.createIndexes(indexes);
}
