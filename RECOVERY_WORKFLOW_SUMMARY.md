# Recovery Workflow - Quick Summary

## 🎯 What Was Implemented

A complete, modular recovery workflow with 8 distinct steps and **strict guardrails** preventing LLM bypass.

## 🔄 The 8-Step Workflow

```
1. Load Transaction      → Fetch from MongoDB, validate FAILED/ABANDONED
2. Load Customer         → Get payment history, calculate retry pattern
3. Analyze with AI       → Call LLM, return structured recommendation
4. Produce Recommendation→ Wrap AI output with metadata
5. Guardrail Check       → Validate against business policies (BLOCKS bad recommendations)
6. Execute Action        → Simulated/safe action execution (NOT real payments)
7. Verify Result         → Confirm action succeeded
8. Store Audit Event     → Immutable record (workflow-controlled, never LLM)
```

## 🔐 LLM Isolation

✅ **LLM Can:**
- Analyze transactions
- Return recommendations
- Provide evidence

❌ **LLM CANNOT:**
- Execute payments
- Modify guardrails
- Write audit logs
- Bypass any step
- Change actions after approval

## 🛡️ Guardrails (8 Policy Checks)

Each recommendation validated against business rules BEFORE action:

1. **NOT_RECOVERABLE Blocked** - If LLM says "not recoverable", reject immediately
2. **HUMAN_REVIEW Blocked** - If ambiguous, require manual approval
3. **Valid Actions Only** - Only RETRY/REMINDER/ALTERNATE_METHOD auto-execute
4. **Confidence Threshold** - RETRY requires 0.75+, REMINDER requires 0.60+
5. **Retry Limit** - Max 3 retries per transaction
6. **Daily Limit** - Max 5 failures per week per customer
7. **Amount Limits** - Max ₹5,000 auto-retry, >₹25,000 requires review
8. **Customer Policy** - Min 30% success rate for retries

**If any guard fails → Recommendation REJECTED → No action executed → Audit logged**

## 🎬 Actions (Simulated/Safe)

- **NO_ACTION** - Skip recovery
- **RETRY** - Simulate payment retry (80% success rate)
- **REMINDER** - Simulate reminder sent (100% success)
- **ALTERNATE_METHOD** - Simulate offering UPI/Netbanking/Wallet

All simulated (NOT real payments).

## 📝 Audit Trail (Immutable)

Every workflow execution creates:
- auditId (unique)
- transactionId + customerId (for lookup)
- aiAnalysis (what LLM recommended)
- guardrailDecision (policy decision, NOT LLM)
- actionExecution (what happened)
- finalStatus (SUCCESS/REJECTED/FAILED)
- executionTimeMs (performance tracking)

TTL: 90 days retention

## 📂 Files Created

| File | Purpose |
|------|---------|
| `lib/workflow/types.ts` | Type definitions flowing through workflow |
| `lib/workflow/guardrails.ts` | GuardrailEngine - validates recommendations |
| `lib/workflow/actions.ts` | ActionExecutor - simulated action execution |
| `lib/workflow/audit.ts` | AuditLogger - immutable event logging |
| `lib/workflow/recovery-workflow.ts` | RecoveryWorkflow - main orchestrator |
| `app/api/workflow/recovery/route.ts` | REST endpoint: POST /api/workflow/recovery |

## 🚀 Usage

```bash
# Seed synthetic data
npm run seed

# Start server
npm run dev

# Execute workflow
curl -X POST "http://localhost:3000/api/workflow/recovery" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "syn_txn_0002"}'
```

## 📊 Response Example

```json
{
  "workflowId": "audit_...",
  "transactionId": "syn_txn_0002",
  "status": "COMPLETED",
  "result": {
    "classification": "RECOVERABLE",
    "recommendedAction": "RETRY",
    "confidence": 0.87,
    "guardrailApproved": true,
    "guardrailPolicy": "PASSED_ALL_CHECKS",
    "actionExecuted": true,
    "actionType": "RETRY",
    "actionStatus": "COMPLETED",
    "actionVerified": true
  },
  "metadata": {
    "startedAt": "2026-08-31T10:30:00Z",
    "completedAt": "2026-08-31T10:30:01Z",
    "executionTimeMs": 1247
  }
}
```

## 🔍 Key Properties

**Each step is:**
- ✅ Modular - Independent function
- ✅ Type-safe - Using TypeScript interfaces
- ✅ Isolated - LLM cannot call or modify
- ✅ Logged - Every step creates audit record
- ✅ Validated - Input/output validation with Zod

**The workflow:**
- ✅ Cannot be bypassed by LLM
- ✅ Enforces guardrails before action
- ✅ Uses only simulated/safe actions
- ✅ Creates immutable audit trail
- ✅ Separates AI, policy, and execution concerns

## 📖 For More Details

See **RECOVERY_WORKFLOW_GUIDE.md** for:
- Complete step-by-step explanation with code examples
- Each guardrail rule in detail
- Action execution behavior
- Audit event structure
- Example workflow execution
- Error handling scenarios
- Testing procedures

## ✅ Status

All code compiles with **zero errors**.
Ready for production with simulated actions.
