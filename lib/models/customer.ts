import type { Collection } from "mongodb";

import { getDb } from "@/lib/db";
import type { Customer } from "@/types/customer";

export const CUSTOMERS_COLLECTION = "customers";

export async function getCustomersCollection(): Promise<Collection<Customer>> {
  const db = await getDb();
  return db.collection<Customer>(CUSTOMERS_COLLECTION);
}

export async function ensureCustomerIndexes(): Promise<void> {
  const collection = await getCustomersCollection();

  await collection.createIndexes([
    { key: { customerId: 1 }, unique: true },
    { key: { email: 1 }, sparse: true },
    { key: { lastSuccessfulPaymentAt: -1 } },
    { key: { failedPaymentCount: -1 } },
  ]);
}
