import { getBatchRunCollection } from "@/lib/models/batch-run";
import { getDashboardChartData } from "@/lib/dashboard/data";
import { BatchRecoveryClient } from "./BatchRecoveryClient";
import type { BatchRun } from "@/types/batch";

export const dynamic = "force-dynamic";

export default async function BatchRecoveryPage() {
  let initialRuns: BatchRun[] = [];
  const chartData = await getDashboardChartData();

  try {
    const collection = await getBatchRunCollection();
    const runs = await collection
      .find({})
      .sort({ startedAt: -1 })
      .limit(10)
      .toArray();

    // Map to clean plain JSON objects for Client Component
    initialRuns = JSON.parse(JSON.stringify(runs));
  } catch (error) {
    console.warn("Could not load initial batch runs:", error);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Batch Recovery Operations</h1>
      </div>

      <div className="page-body">
        <BatchRecoveryClient initialRuns={initialRuns} initialChartData={chartData} />
      </div>
    </div>
  );
}
