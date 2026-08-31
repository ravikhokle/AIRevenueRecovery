#!/usr/bin/env node
/**
 * Batch Recovery Diagnostic Script
 *
 * PHASE 1: Environment check
 * PHASE 2: Database connection test
 * PHASE 3: AI analysis test (with 1 synthetic transaction)
 * PHASE 4: Single transaction workflow test
 * PHASE 5: 10-transaction batch test
 */

import { generateSyntheticDataset } from "@/lib/seed/generator";
import { getDb, pingDatabase } from "@/lib/db";
import { getTransactionsCollection } from "@/lib/models/transaction";
import { getCustomersCollection } from "@/lib/models/customer";
import { analyzeRecoveryPotential } from "@/lib/ai/analysis";
import {
  RecoveryAnalysisInputSchema,
  RecoveryAnalysisResponseSchema,
} from "@/lib/ai/schemas";
import { createRecoveryWorkflow } from "@/lib/workflow/recovery-workflow";
import { createGuardrailEngine } from "@/lib/workflow/guardrails";
import { createActionExecutor } from "@/lib/workflow/actions";
import { getAuditTrailService } from "@/lib/workflow/audit";
import type { Transaction } from "@/types/transaction";

// ============================================================================
// PHASE 0: Environment Check
// ============================================================================

function phaseEnvironmentCheck(): void {
  console.log("\n========== PHASE 0: ENVIRONMENT CHECK ==========\n");

  const required = [
    "OPENAI_API_KEY",
    "MONGODB_URI",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
  ];

  for (const key of required) {
    const value = process.env[key];
    const status = value ? "PRESENT" : "MISSING";
    console.log(`${key}: ${status}`);

    if (!value && key === "OPENAI_API_KEY") {
      console.error("❌ CRITICAL: OPENAI_API_KEY is missing. AI analysis will fail.");
    }
  }

  console.log();
}

// ============================================================================
// PHASE 1: Database Connection Test
// ============================================================================

async function phaseDatabaseCheck(): Promise<void> {
  console.log("\n========== PHASE 1: DATABASE CONNECTION TEST ==========\n");

  try {
    const result = await pingDatabase();
    console.log("✅ Database connected:", result);
    return;
  } catch (error) {
    console.error(
      "❌ Database connection failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

// ============================================================================
// PHASE 2: Seed Data and Upsert
// ============================================================================

async function phaseSeedData(): Promise<Transaction[]> {
  console.log("\n========== PHASE 2: SEED DATA GENERATION ==========\n");

  const dataset = generateSyntheticDataset();
  console.log(`Generated ${dataset.transactions.length} synthetic transactions`);
  console.log(`Generated ${dataset.customers.length} synthetic customers`);

  // Upsert to database
  console.log("\nUpserting to database...");
  const db = await getDb();

  const txnCollection = await getTransactionsCollection();
  const custCollection = await getCustomersCollection();

  await txnCollection.insertMany(dataset.transactions as any[], {
    ordered: false,
  });
  console.log("✅ Transactions upserted");

  await custCollection.insertMany(dataset.customers as any[], {
    ordered: false,
  });
  console.log("✅ Customers upserted");

  // Return eligible transactions
  const eligible = dataset.transactions.filter(
    (t) => t.status === "FAILED" || t.status === "ABANDONED"
  );
  console.log(`\nEligible for recovery: ${eligible.length} transactions`);

  return eligible.slice(0, 10); // Return first 10 for testing
}

// ============================================================================
// PHASE 3: AI Analysis Test (1 transaction)
// ============================================================================

async function phaseAIAnalysisTest(
  transaction: Transaction
): Promise<boolean> {
  console.log(
    `\n========== PHASE 3: AI ANALYSIS TEST (txn=${transaction.transactionId}) ==========\n`
  );

  try {
    // Load customer
    const custCollection = await getCustomersCollection();
    const customer = await custCollection.findOne({
      customerId: transaction.customerId,
    });

    if (!customer) {
      throw new Error(
        `Customer not found: ${transaction.customerId}`
      );
    }

    // Build analysis input
    const analysisInput = {
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        failureReason: transaction.failureReason,
        gatewayError: transaction.gatewayError ?? undefined,
        retryCount: transaction.retryCount,
        createdAt: transaction.createdAt,
      },
      customerHistory: {
        totalTransactions: customer.totalTransactions,
        successfulPaymentCount: customer.successfulPaymentCount,
        failedPaymentCount: customer.failedPaymentCount,
        abandonedPaymentCount: customer.abandonedPaymentCount,
        totalSpent: customer.totalSpent,
        averageOrderValue: customer.averageOrderValue,
        lastSuccessfulPaymentAt: customer.lastSuccessfulPaymentAt,
        lastFailedPaymentAt: customer.lastFailedPaymentAt,
        preferredPaymentMethod: customer.preferredPaymentMethod,
      },
      retryHistory: {
        totalRetries: 0,
        failureReasons: [transaction.failureReason || "unknown"],
        retryPattern: "SINGLE",
      },
    };

    // Validate input schema
    const inputValidation = RecoveryAnalysisInputSchema.safeParse(
      analysisInput
    );
    if (!inputValidation.success) {
      console.error("❌ Input validation failed:");
      console.error(JSON.stringify(inputValidation.error.flatten().fieldErrors, null, 2));
      return false;
    }
    console.log("✅ Input validation passed");

    // Call AI analysis
    console.log("Calling OpenAI API...");
    const result = await analyzeRecoveryPotential(analysisInput);

    // Validate output schema
    const outputValidation = RecoveryAnalysisResponseSchema.safeParse(result);
    if (!outputValidation.success) {
      console.error("❌ Output validation failed:");
      console.error(JSON.stringify(outputValidation.error.flatten().fieldErrors, null, 2));
      return false;
    }

    console.log("✅ AI analysis successful");
    console.log(`  Classification: ${result.classification}`);
    console.log(`  Recommended Action: ${result.recommendedAction}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Reason: ${result.reason}`);

    return true;
  } catch (error) {
    console.error(
      "❌ AI analysis failed:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack.split("\n").slice(0, 5).join("\n"));
    }
    return false;
  }
}

// ============================================================================
// PHASE 4: Single Transaction Workflow Test
// ============================================================================

async function phaseSingleTransactionWorkflow(
  transaction: Transaction
): Promise<boolean> {
  console.log(
    `\n========== PHASE 4: SINGLE TRANSACTION WORKFLOW (txn=${transaction.transactionId}) ==========\n`
  );

  try {
    const auditService = await getAuditTrailService();
    const workflow = createRecoveryWorkflow(
      createGuardrailEngine(),
      createActionExecutor(),
      auditService
    );

    console.log("Executing workflow...");
    const context = await workflow.executeWorkflow(transaction.transactionId);

    console.log("✅ Workflow completed");
    console.log(`  Status: ${context.status}`);
    console.log(`  AI Classification: ${context.aiRecommendation?.classification}`);
    console.log(`  Guardrail Approved: ${context.guardrailResult?.approved}`);
    console.log(`  Action Executed: ${!!context.actionExecution}`);
    console.log(`  Action Verified: ${context.actionVerified}`);

    return context.status === "COMPLETED";
  } catch (error) {
    console.error(
      "❌ Workflow execution failed:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack.split("\n").slice(0, 10).join("\n"));
    }
    return false;
  }
}

// ============================================================================
// PHASE 5: 10-Transaction Batch Test
// ============================================================================

async function phaseBatchTest(
  transactions: Transaction[]
): Promise<void> {
  console.log(
    `\n========== PHASE 5: BATCH TEST (${transactions.length} transactions) ==========\n`
  );

  const auditService = await getAuditTrailService();
  const workflow = createRecoveryWorkflow(
    createGuardrailEngine(),
    createActionExecutor(),
    auditService
  );

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ txn: string; error: string }> = [];

  for (const txn of transactions.slice(0, 10)) {
    try {
      await workflow.executeWorkflow(txn.transactionId);
      successCount++;
      console.log(`✅ ${txn.transactionId}`);
    } catch (error) {
      errorCount++;
      const msg = error instanceof Error ? error.message : String(error);
      errors.push({ txn: txn.transactionId, error: msg });
      console.log(`❌ ${txn.transactionId}: ${msg}`);
    }
  }

  console.log(`\nBatch Results:`);
  console.log(`  Total: ${successCount + errorCount}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log(`\nError Summary:`);
    for (const e of errors) {
      console.log(`  ${e.txn}: ${e.error}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  try {
    // Phase 0
    phaseEnvironmentCheck();

    // Phase 1
    await phaseDatabaseCheck();

    // Phase 2
    const transactions = await phaseSeedData();

    if (transactions.length === 0) {
      console.error("No eligible transactions found");
      process.exit(1);
    }

    // Phase 3: Test AI analysis with first transaction
    const aiTestPassed = await phaseAIAnalysisTest(transactions[0]);

    if (!aiTestPassed) {
      console.error("\n❌ AI ANALYSIS FAILED — aborting remaining phases");
      process.exit(1);
    }

    // Phase 4: Test single transaction workflow
    const workflowTestPassed = await phaseSingleTransactionWorkflow(
      transactions[0]
    );

    if (!workflowTestPassed) {
      console.error("\n❌ WORKFLOW TEST FAILED — see errors above");
      process.exit(1);
    }

    // Phase 5: Test batch
    await phaseBatchTest(transactions);

    console.log("\n✅ ALL DIAGNOSTICS COMPLETE\n");
  } catch (error) {
    console.error(
      "\n❌ DIAGNOSTIC FAILED:",
      error instanceof Error ? error.message : error
    );
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

main();
