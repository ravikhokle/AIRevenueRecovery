import type { Collection } from "mongodb";

import { getDb } from "@/lib/db";
import type { Transaction } from "@/types/transaction";

export const TRANSACTIONS_COLLECTION = "transactions";

export async function getTransactionsCollection(): Promise<
  Collection<Transaction>
> {
  const db = await getDb();
  return db.collection<Transaction>(TRANSACTIONS_COLLECTION);
}

let _txnIndexesEnsured = false;

export async function ensureTransactionIndexes(): Promise<void> {
  if (_txnIndexesEnsured) return;
  _txnIndexesEnsured = true;

  try {
    const collection = await getTransactionsCollection();

    await collection.createIndexes([
      { key: { transactionId: 1 }, unique: true },
      { key: { customerId: 1 } },
      { key: { orderId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
    ]);
  } catch (err) {
    console.warn("Could not ensure transaction indexes:", err);
  }
}
