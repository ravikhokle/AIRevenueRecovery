/**
 * Verification script to check synthetic seed data
 * Usage: tsx verify-seed.ts
 */

import { connectToDatabase } from "@/lib/db";
import {
  ensureCustomerIndexes,
  getCustomersCollection,
} from "@/lib/models/customer";
import {
  ensureTransactionIndexes,
  getTransactionsCollection,
} from "@/lib/models/transaction";

interface StatusCount {
  _id: string;
  count: number;
}

async function verifySeed(): Promise<void> {
  try {
    console.log("🔍 Verifying synthetic seed data...\n");

    await connectToDatabase();
    const transactions = await getTransactionsCollection();
    const customers = await getCustomersCollection();

    // Count transactions
    const txnCount = await transactions.countDocuments({
      transactionId: { $regex: "^syn_" },
    });
    console.log(`✓ Synthetic transactions: ${txnCount}`);

    // Count customers
    const custCount = await customers.countDocuments({
      customerId: { $regex: "^syn_" },
    });
    console.log(`✓ Synthetic customers: ${custCount}\n`);

    // Status breakdown
    const statusBreakdown = await transactions
      .aggregate<StatusCount>([
        { $match: { transactionId: { $regex: "^syn_" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    console.log("Status Breakdown:");
    const statuses = statusBreakdown.reduce(
      (acc, s) => {
        acc[s._id] = s.count;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log(`  SUCCESS: ${statuses.SUCCESS ?? 0}`);
    console.log(`  FAILED: ${statuses.FAILED ?? 0}`);
    console.log(`  ABANDONED: ${statuses.ABANDONED ?? 0}`);
    console.log(`  PENDING: ${statuses.PENDING ?? 0}\n`);

    // Payment method breakdown
    const methodBreakdown = await transactions
      .aggregate<{ _id: string; count: number }>([
        { $match: { transactionId: { $regex: "^syn_" } } },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    console.log("Payment Method Distribution:");
    for (const method of methodBreakdown) {
      console.log(`  ${method._id}: ${method.count} transactions`);
    }

    // Sample records
    console.log("\nSample Records:");
    const sampleTxn = await transactions.findOne({
      transactionId: "syn_txn_0001",
    });
    if (sampleTxn) {
      console.log(`  Transaction: ${JSON.stringify(sampleTxn, null, 2)}`);
    }

    const sampleCust = await customers.findOne({ customerId: "syn_cust_0001" });
    if (sampleCust) {
      console.log(`  Customer: ${JSON.stringify(sampleCust, null, 2)}`);
    }

    // Check for expected records
    console.log("\n✓ Seed verification complete!");

    if (txnCount < 100) {
      console.warn(
        "\n⚠️  Warning: Expected at least 100 transactions, found " + txnCount,
      );
    }
    if (custCount < 40) {
      console.warn(
        "\n⚠️  Warning: Expected at least 40 customers, found " + custCount,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Verification failed:", message);
    process.exit(1);
  }
}

verifySeed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
