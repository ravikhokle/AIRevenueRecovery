#!/usr/bin/env node
/**
 * Simple Database Check Script
 * Checks if MongoDB is accessible and has data
 */

import { pingDatabase, getDb } from "@/lib/db";
import { generateSyntheticDataset } from "@/lib/seed/generator";
import { getTransactionsCollection, ensureTransactionIndexes } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";

async function main() {
  console.log("=== Database Check ===\n");

  try {
    // 1. Test connection
    console.log("1. Testing database connection...");
    const pingResult = await pingDatabase();
    console.log("✅ Connected to:", pingResult.database);

    // 2. Generate synthetic data
    console.log("\n2. Generating synthetic data...");
    const dataset = generateSyntheticDataset();
    console.log(`✅ Generated ${dataset.transactions.length} transactions`);
    console.log(`✅ Generated ${dataset.customers.length} customers`);

    // 3. Create indexes
    console.log("\n3. Creating indexes...");
    await ensureTransactionIndexes();
    console.log("✅ Indexes created");

    // 4. Upsert data
    console.log("\n4. Upserting data to database...");
    const txnCollection = await getTransactionsCollection();
    const custCollection = await getCustomersCollection();

    await Promise.all([
      txnCollection.deleteMany({}),
      custCollection.deleteMany({}),
    ]);

    const txnResult = await txnCollection.insertMany(dataset.transactions as any[]);
    const custResult = await custCollection.insertMany(dataset.customers as any[]);

    console.log(`✅ Inserted ${txnResult.insertedCount} transactions`);
    console.log(`✅ Inserted ${custResult.insertedCount} customers`);

    // 5. Query back
    console.log("\n5. Querying data back...");
    const sampleTxn = await txnCollection.findOne({});
    if (sampleTxn) {
      console.log(`✅ Found transaction: ${sampleTxn.transactionId}`);
      console.log(`   - Status: ${sampleTxn.status}`);
      console.log(`   - Amount: ${sampleTxn.amount}`);
      console.log(`   - CustomerId: ${sampleTxn.customerId}`);
    } else {
      console.log("❌ No transactions found in database!");
    }

    const sampleCust = await custCollection.findOne({});
    if (sampleCust) {
      console.log(`✅ Found customer: ${sampleCust.customerId}`);
    } else {
      console.log("❌ No customers found in database!");
    }

    // 6. Count eligible transactions
    console.log("\n6. Counting eligible transactions...");
    const eligibleCount = await txnCollection.countDocuments({
      $or: [{ status: "FAILED" }, { status: "ABANDONED" }],
    });
    console.log(`✅ ${eligibleCount} transactions are eligible for recovery`);

    if (eligibleCount === 0) {
      console.log("⚠️  WARNING: No eligible transactions found!");
    }

    console.log("\n✅ Database check complete!");
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

main();
