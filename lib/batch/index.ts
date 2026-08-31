/**
 * Batch module public API
 *
 * Usage:
 *   import { createBatchProcessor } from "@/lib/batch";
 *   const processor = createBatchProcessor({ delayMs: 500, dryRun: true });
 *   const run = await processor.run();
 */

export { BatchProcessor } from "./processor";
export type { BatchProcessorOptions } from "@/types/batch";

import { BatchProcessor } from "./processor";
import type { BatchProcessorOptions } from "@/types/batch";

/**
 * Factory: create a configured BatchProcessor.
 *
 * @param options  Processing configuration (all optional, sane defaults apply)
 */
export function createBatchProcessor(
  options: BatchProcessorOptions = {}
): BatchProcessor {
  return new BatchProcessor(options);
}
