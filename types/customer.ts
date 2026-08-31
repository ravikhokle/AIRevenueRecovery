import type { ObjectId } from "mongodb";

export interface Customer {
  /** Unique business identifier for the customer */
  customerId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;

  /** Aggregate payment history used during recovery investigation */
  totalTransactions: number;
  successfulPaymentCount: number;
  failedPaymentCount: number;
  abandonedPaymentCount: number;
  /** Sum of successful payment amounts (smallest currency unit) */
  totalSpent: number;
  /** Average successful order value (smallest currency unit) */
  averageOrderValue: number;

  lastPaymentAt?: Date | null;
  lastSuccessfulPaymentAt?: Date | null;
  lastFailedPaymentAt?: Date | null;
  preferredPaymentMethod?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export type CustomerDocument = Customer & { _id: ObjectId };
