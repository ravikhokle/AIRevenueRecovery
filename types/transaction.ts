import type { ObjectId } from "mongodb";

export const TRANSACTION_STATUSES = [
  "SUCCESS",
  "FAILED",
  "PENDING",
  "ABANDONED",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface RazorpayErrorPayload {
  code: "BAD_REQUEST_ERROR" | "GATEWAY_ERROR" | "SERVER_ERROR";
  description: string;
  source: "bank" | "gateway" | "customer" | "business";
  step: "payment_authorization" | "payment_authentication" | "payment_initiation";
  reason: string;
}

export interface Transaction {
  /** Unique business identifier for the payment attempt */
  transactionId: string;
  customerId: string;
  orderId: string;
  /** Amount in the smallest currency unit (e.g. paise for INR) */
  amount: number;
  /** ISO 4217 currency code, e.g. INR */
  currency: string;
  status: TransactionStatus;
  paymentMethod: string;
  failureReason?: string | null;
  /** Structured Razorpay error taxonomy details */
  gatewayError?: RazorpayErrorPayload | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionDocument = Transaction & { _id: ObjectId };
