import { connectToDatabase } from "@/lib/db";
import { createEvaluationRunner } from "@/lib/evaluation";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log("==================================================");
  console.log(" Razorpay AI Revenue Recovery - Evaluation Benchmark");
  console.log("==================================================");
  console.log(`Mode: ${isDryRun ? "Dry-Run (Mock)" : "Live (AI + Guardrails + DB)"}`);
  if (limit) console.log(`Limit: ${limit} transactions`);
  console.log("Connecting to database...");

  if (!isDryRun) {
    await connectToDatabase();
  }

  const runner = createEvaluationRunner({
    dryRun: isDryRun,
    limit,
    delayMs: isDryRun ? 0 : 500,
  });

  console.log("Executing held-out test set evaluation...");
  const result = await runner.run();

  console.log("\n" + result.humanReadableSummary);
  console.log("\nEvaluation Run ID:", result.evalId);
  console.log("Duration:", result.durationMs, "ms");
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Evaluation script failed:", err);
    process.exit(1);
  });
