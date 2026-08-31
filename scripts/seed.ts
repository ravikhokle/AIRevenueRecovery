import { connectToDatabase } from "@/lib/db";
import { ensureCustomerIndexes, getCustomersCollection } from "@/lib/models/customer";
import {
  ensureTransactionIndexes,
  getTransactionsCollection,
} from "@/lib/models/transaction";
import { generateSyntheticDataset } from "@/lib/seed/generator";

async function seedSyntheticData(): Promise<void> {
  const dataset = generateSyntheticDataset();

  await connectToDatabase();
  await ensureTransactionIndexes();
  await ensureCustomerIndexes();

  const transactions = await getTransactionsCollection();
  const customers = await getCustomersCollection();

  const deletedTransactions = await transactions.deleteMany({
    transactionId: { $regex: "^syn_" },
  });
  const deletedCustomers = await customers.deleteMany({
    customerId: { $regex: "^syn_" },
  });

  await transactions.insertMany(dataset.transactions);
  await customers.insertMany(dataset.customers);

  console.log("Synthetic seed completed.");
  console.log(`Seed version: ${dataset.seedVersion}`);
  console.log(
    `Removed existing synthetic records: ${deletedTransactions.deletedCount} transactions, ${deletedCustomers.deletedCount} customers`,
  );
  console.log(
    `Inserted: ${dataset.summary.totalTransactions} transactions across ${dataset.summary.totalCustomers} customers`,
  );
  console.log("Status breakdown:", dataset.summary.byStatus);
  console.log("Scenario breakdown:", dataset.summary.byScenario);
  console.log(
    "Sample IDs: transaction syn_txn_0001, customer syn_cust_0001, email synthetic.user0001@example.test",
  );
}

seedSyntheticData()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown seed failure";
    console.error("Seed failed:", message);
    process.exit(1);
  });
