/**
 * Evaluation module public API
 *
 * Usage:
 *   import { createEvaluationRunner } from "@/lib/evaluation";
 *   const runner = createEvaluationRunner({ delayMs: 500, dryRun: true });
 *   const result = await runner.run();
 */

export { EvaluationRunner } from "./runner";
export { generateJsonReport, generateHumanReadableSummary } from "./report";
export {
  computeClassificationMetrics,
  computeBusinessMetrics,
  computeSafetyMetrics,
  assignConfusionCell,
} from "./metrics";

import { EvaluationRunner } from "./runner";
import type { EvalRunOptions } from "@/types/evaluation";

/**
 * Factory: create a configured EvaluationRunner.
 */
export function createEvaluationRunner(
  options: EvalRunOptions = {}
): EvaluationRunner {
  return new EvaluationRunner(options);
}
