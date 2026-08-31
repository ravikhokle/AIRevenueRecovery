import crypto from "crypto";
import { ActionExecution, ActionResult } from "./types";
import {
  getRazorpayRecoveryService,
  RazorpayRecoveryService,
} from "@/lib/razorpay/service";

/**
 * Action Executor
 *
 * Executes verified recovery actions using Razorpay Test Mode APIs
 * (or deterministic test-mode fallback when credentials are unconfigured).
 *
 * SAFETY GUARANTEES:
 * 1. Strictly restricted to Razorpay Test Mode (never real money).
 * 2. Idempotent receipts ensure duplicate protection.
 * 3. Server-side only execution with full audit logging.
 */
export class ActionExecutor {
  private razorpayService: RazorpayRecoveryService;

  constructor(razorpayService?: RazorpayRecoveryService) {
    this.razorpayService = razorpayService || getRazorpayRecoveryService();
  }

  /**
   * Execute an action within safe test-mode constraints
   */
  async executeAction(
    actionType: "RETRY" | "REMINDER" | "ALTERNATE_METHOD" | "NO_ACTION",
    transactionId: string,
    customerId: string,
    amount: number,
    currency: string
  ): Promise<ActionExecution> {
    const execution: ActionExecution = {
      actionType,
      transactionId,
      customerId,
      amount,
      currency,
      timestamp: new Date().toISOString(),
      status: "INITIATED",
    };

    const actionId = this.generateActionId();

    try {
      switch (actionType) {
        case "NO_ACTION":
          execution.result = await this.executeNoAction(actionId, transactionId);
          break;

        case "RETRY":
          execution.result = await this.executeRetry(
            actionId,
            transactionId,
            customerId,
            amount,
            currency
          );
          break;

        case "REMINDER":
          execution.result = await this.executeReminder(
            actionId,
            transactionId,
            customerId,
            amount,
            currency
          );
          break;

        case "ALTERNATE_METHOD":
          execution.result = await this.executeAlternateMethod(
            actionId,
            transactionId,
            customerId,
            amount,
            currency
          );
          break;

        default:
          throw new Error(`Unknown action type: ${actionType}`);
      }

      execution.status = "COMPLETED";
      return execution;
    } catch (error) {
      execution.status = "FAILED";
      execution.error = {
        code: "ACTION_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      return execution;
    }
  }

  /**
   * No Action execution
   */
  private async executeNoAction(
    actionId: string,
    transactionId: string
  ): Promise<ActionResult> {
    return {
      actionId,
      status: "SUCCESS",
      message: `No recovery action needed for transaction ${transactionId}`,
      details: {
        simulatedGateway: "SIMULATED",
        gatewayMode: "SIMULATED",
      },
    };
  }

  /**
   * Execute Payment Retry via Razorpay Test Mode Order Creation
   */
  private async executeRetry(
    actionId: string,
    transactionId: string,
    customerId: string,
    amount: number,
    currency: string
  ): Promise<ActionResult> {
    try {
      const order = await this.razorpayService.createRecoveryOrder({
        amount,
        currency,
        transactionId,
        customerId,
        actionId,
      });

      const retriedTxnId = `${transactionId}-retry-${order.orderId.slice(-8)}`;

      return {
        actionId,
        status: "SUCCESS",
        message: `Razorpay Test Mode Order ${order.orderId} created for payment retry`,
        details: {
          retriedTransactionId: retriedTxnId,
          razorpayOrderId: order.orderId,
          razorpayReceipt: order.receipt,
          razorpayStatus: order.status,
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    } catch (error) {
      return {
        actionId,
        status: "FAILED",
        message: `Razorpay payment retry failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    }
  }

  /**
   * Execute Payment Reminder via Razorpay Test Mode Payment Link Creation
   */
  private async executeReminder(
    actionId: string,
    transactionId: string,
    customerId: string,
    amount: number,
    currency: string
  ): Promise<ActionResult> {
    try {
      const link = await this.razorpayService.createRecoveryPaymentLink({
        amount,
        currency,
        transactionId,
        customerId,
        actionId,
        description: `Payment recovery reminder for Order linked to ${transactionId}`,
        recoveryType: "REMINDER",
      });

      return {
        actionId,
        status: "SUCCESS",
        message: `Razorpay Test Mode Payment Link ${link.paymentLinkId} generated with reminder enabled`,
        details: {
          reminderSent: true,
          razorpayPaymentLinkId: link.paymentLinkId,
          razorpayPaymentLinkUrl: link.shortUrl,
          razorpayStatus: link.status,
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    } catch (error) {
      return {
        actionId,
        status: "FAILED",
        message: `Razorpay payment link creation failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    }
  }

  /**
   * Execute Alternate Payment Method Offer via Multi-Rail Razorpay Payment Link
   */
  private async executeAlternateMethod(
    actionId: string,
    transactionId: string,
    customerId: string,
    amount: number,
    currency: string
  ): Promise<ActionResult> {
    try {
      const link = await this.razorpayService.createRecoveryPaymentLink({
        amount,
        currency,
        transactionId,
        customerId,
        actionId,
        description: `Alternate payment options (UPI, Netbanking, Cards, Wallets) for ${transactionId}`,
        recoveryType: "ALTERNATE_METHOD",
      });

      return {
        actionId,
        status: "SUCCESS",
        message: `Razorpay Test Mode Alternate Payment Link ${link.paymentLinkId} offered to customer`,
        details: {
          alternateMethodOffered: "UPI, Netbanking, Cards, Wallets",
          razorpayPaymentLinkId: link.paymentLinkId,
          razorpayPaymentLinkUrl: link.shortUrl,
          razorpayStatus: link.status,
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    } catch (error) {
      return {
        actionId,
        status: "FAILED",
        message: `Razorpay alternate method link creation failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          gatewayMode: "RAZORPAY_TEST_MODE",
        },
      };
    }
  }

  private generateActionId(): string {
    return `act_${crypto.randomBytes(12).toString("hex")}`;
  }
}

/**
 * Create action executor instance
 */
export function createActionExecutor(
  razorpayService?: RazorpayRecoveryService
): ActionExecutor {
  return new ActionExecutor(razorpayService);
}

/**
 * Verify action result
 * Checks if action was successfully executed on Razorpay or test gateway
 */
export async function verifyActionResult(
  execution: ActionExecution
): Promise<boolean> {
  if (execution.status !== "COMPLETED") {
    return false;
  }

  if (!execution.result || execution.result.status !== "SUCCESS") {
    return false;
  }

  const razorpayService = getRazorpayRecoveryService();
  const settlement = await razorpayService.verifyRecoverySettlement({
    actionType: execution.actionType,
    razorpayOrderId: execution.result.details.razorpayOrderId,
    razorpayPaymentLinkId: execution.result.details.razorpayPaymentLinkId,
    amount: execution.amount,
  });

  return settlement.settled;
}

/**
 * Safety check: Ensure action matches recommendation
 */
export function validateActionMatchesRecommendation(
  recommendedAction: string,
  executedAction: string
): boolean {
  return recommendedAction === executedAction;
}
