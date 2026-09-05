import { NextResponse } from "next/server";
import { connectToDatabase, DatabaseConnectionError } from "@/lib/db";
import {
  ensureCustomerIndexes,
  getCustomersCollection,
} from "@/lib/models/customer";
import {
  ensureTransactionIndexes,
  getTransactionsCollection,
} from "@/lib/models/transaction";
import { getAuditLogCollection } from "@/lib/models/audit-log";
import { getBatchRunCollection } from "@/lib/models/batch-run";
import { generateSyntheticDataset } from "@/lib/seed/generator";

export async function POST() {
  try {
    const dataset = generateSyntheticDataset();

    await connectToDatabase();
    await ensureTransactionIndexes();
    await ensureCustomerIndexes();

    const transactions = await getTransactionsCollection();
    const customers = await getCustomersCollection();
    const auditLogs = await getAuditLogCollection();
    const batchRuns = await getBatchRunCollection();

    // Delete existing synthetic data and previous runs
    await transactions.deleteMany({
      transactionId: { $regex: "^syn_" },
    });
    await customers.deleteMany({
      customerId: { $regex: "^syn_" },
    });
    await auditLogs.deleteMany({
      transactionId: { $regex: "^syn_" },
    });
    await batchRuns.deleteMany({});

    // Re-insert fresh baseline
    await transactions.insertMany(dataset.transactions as any[]);
    await customers.insertMany(dataset.customers as any[]);

    return NextResponse.json({
      status: "ok",
      message: "Dataset reset and re-seeded successfully",
      summary: dataset.summary,
    });
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      return NextResponse.json(
        { error: "Database unavailable", message: error.message },
        { status: 503 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to reset dataset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
