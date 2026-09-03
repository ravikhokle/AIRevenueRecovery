# Recovery AI

> **AI-powered payment recovery that helps businesses recover lost revenue — safely.**

Recovery AI is an intelligent payment-recovery agent that identifies failed or abandoned payments, understands **why the payment failed**, and chooses the safest recovery action.

Instead of blindly retrying payments, Recovery AI combines **AI decision-making with deterministic safety rules** to decide whether to:

* 🔄 Retry the payment
* 💳 Suggest an alternate payment method
* 🔔 Send a payment reminder
* 🧑‍💼 Send the case for human review
* 🛑 Stop recovery when the payment should not be retried

**Built for Track 03 — AI Revenue Recovery**

**Repository:** https://github.com/ravikhokle/AIRevenueRecovery

---

## 💡 The Problem

Payment failures don't always mean lost customers.

A payment can fail because of:

* Temporary network problems
* Insufficient funds
* Expired cards
* Fraud or hard declines
* Checkout abandonment
* Too many previous retry attempts

A simple retry system treats all failures the same.

That can lead to:

* ❌ Unnecessary retries
* ❌ Duplicate charges
* ❌ Poor customer experience
* ❌ Increased payment failures
* ❌ Revenue being permanently lost

Businesses need a smarter way to decide **which payments can be recovered and how**.

---

## 🚀 Our Solution

**Recovery AI acts as a decision-making layer between failed payments and recovery actions.**

It first understands the payment failure using AI.

Then, before any action is taken, a deterministic policy engine checks whether that action is actually allowed.

### Simple flow

```text
Failed Payment
      ↓
Understand the Failure
      ↓
AI Diagnosis
      ↓
Safety & Policy Checks
      ↓
┌───────────────┬────────────────┐
│               │                │
Approved      Blocked         Uncertain
│               │                │
↓               ↓                ↓
Recovery     Stop Action     Human Review
Action
      ↓
Verify Result
      ↓
Record Audit Trail
```

The key idea is simple:

> **AI recommends. Deterministic rules decide.**

---

## 🎯 What Recovery AI Does

### 1. Understands payment failures

Recovery AI analyzes payment context and identifies the likely reason for failure.

For example:

| Payment Situation         | Recovery Decision                   |
| ------------------------- | ----------------------------------- |
| Network timeout           | Retry with backoff                  |
| Insufficient funds        | Reminder / alternate payment method |
| Checkout abandoned        | Payment reminder                    |
| Expired card              | Stop recovery                       |
| Stolen/fraud-related card | Stop recovery                       |
| Too many retries          | Stop recovery                       |
| High-value transaction    | Human review                        |

---

### 2. Applies safety rules

AI should never have unlimited authority over financial actions.

Recovery AI therefore uses deterministic guardrails such as:

* Maximum **3 retry attempts** per transaction
* **₹10,000** automatic recovery limit
* Transactions above the configured high-value threshold can require human approval
* Hard declines are blocked
* Idempotency checks prevent duplicate execution
* Low-confidence decisions can be escalated
* Customer retry limits are enforced

This ensures that an AI mistake does not automatically become a financial mistake.

---

### 3. Takes the appropriate recovery action

If the action passes all safety checks, Recovery AI can perform the appropriate recovery workflow using Razorpay Test Mode APIs.

Possible actions include:

**Smart Retry**

> Retry a payment when the failure appears temporary.

**Payment Reminder**

> Remind a customer when a payment was abandoned or needs another attempt.

**Alternate Payment Method**

> Provide another way for the customer to complete the payment.

**Human Review**

> Escalate uncertain, high-value, or restricted cases to a merchant.

---

## 🛡️ Safety First

Financial automation requires more than just a good AI model.

Recovery AI follows a **two-layer architecture**:

### Layer 1 — AI

The AI analyzes the payment and produces a structured diagnosis.

It answers questions such as:

* Why did the payment fail?
* Is the failure potentially recoverable?
* What recovery action makes sense?
* How confident is the diagnosis?

The AI does **not** directly execute financial actions.

### Layer 2 — Deterministic Guardrails

A separate policy engine validates the AI recommendation.

```text
AI Recommendation
       ↓
Policy Engine
       ↓
Is the action allowed?
       │
   ┌───┴────┐
   │        │
  YES       NO
   │        │
   ↓        ↓
Execute   Block / Review
```

This separation makes the system more predictable, auditable, and safer.

---

## 📊 Measuring Revenue Recovery

Recovery AI is designed to measure actual recovery performance across batches of failed payments.

The dashboard tracks:

* **Revenue at Risk**
* **Recovered Revenue**
* **Recovery Conversion Rate**
* **Policy Blocks**
* **Processing Time**
* **Successful vs Failed Recovery Attempts**

Instead of simply saying:

> "The AI made a decision."

Recovery AI measures:

> **"How much revenue did the recovery process actually recover?"**

---

## 🧪 Evaluation Dataset

The project includes a synthetic held-out evaluation dataset covering different payment failure scenarios.

| Scenario                    | Expected Behavior                   |
| --------------------------- | ----------------------------------- |
| `TRANSIENT_NETWORK_TIMEOUT` | Retry with backoff                  |
| `INSUFFICIENT_FUNDS`        | Reminder / alternate payment method |
| `EXPIRED_OR_STOLEN_CARD`    | Stop recovery                       |
| `CHECKOUT_ABANDONMENT`      | Send payment reminder               |
| `HIGH_VALUE_TRANSACTION`    | Human review                        |
| `RETRY_EXHAUSTED`           | Stop recovery                       |

### Run evaluation

```bash
# Deterministic dry run
npm run eval -- --dry-run

# Full evaluation
npm run eval
```

---

## 🖥️ Dashboard

Recovery AI provides a merchant dashboard for understanding and managing recovery.

### Overview

`/dashboard`

Shows key recovery metrics such as:

* Revenue at Risk
* Recovered Revenue
* Conversion Rate
* Policy Blocks

### Transactions

`/dashboard/transactions`

Search and inspect failed and recovered transactions.

### Transaction Dossier

`/dashboard/transactions/[id]`

View the complete story of a transaction:

* Failure reason
* AI diagnosis
* Confidence
* Guardrail decisions
* Recovery action
* Final result

### Batch Recovery

`/dashboard/batch`

Run recovery on multiple failed transactions and see the overall results.

### Audit Trail

`/dashboard/audit`

View a chronological record of agent activity, decisions, actions, and human escalations.

---

## 🔍 Example

Imagine a customer tries to pay ₹2,000.

The payment fails because of a temporary network timeout.

Recovery AI sees:

```text
Failure: Network Timeout
Amount: ₹2,000
Previous Retries: 0
```

The AI recommends:

```text
Action: RETRY
Confidence: High
```

The guardrail engine then checks:

```text
✓ Amount within automatic limit
✓ Retry count below maximum
✓ Not a hard decline
✓ No duplicate execution
✓ Action allowed
```

The retry is approved.

If the payment succeeds:

```text
₹2,000 recovered
```

The result is verified and recorded in the audit trail.

---

## 🧑‍💼 Human-in-the-Loop

Not every payment should be handled automatically.

Recovery AI sends cases to human review when:

* The AI is uncertain
* The transaction is high value
* A policy limit is reached
* The situation is ambiguous
* A merchant decision is required

This creates a balance between:

**Automation ⚡ + Control 🛡️**

---

## 🧾 Auditability

Every important recovery step is recorded.

The audit trail can contain:

```text
Payment Event
     ↓
AI Diagnosis
     ↓
Guardrail Evaluation
     ↓
Approved / Blocked
     ↓
Recovery Action
     ↓
Verification
```

This makes it possible to understand **what happened, why it happened, and who/what made the decision.**

---

## 🏗️ Architecture

```text
                Merchant Payment Events
                         │
                         ▼
              Context Retrieval Engine
                         │
                         ▼
                  AI Diagnosis
                         │
                         ▼
             Deterministic Guardrails
                    /           \
                   /             \
                  ▼               ▼
          Human Review       Recovery Action
                                  │
                         ┌────────┼────────┐
                         ▼        ▼        ▼
                       Retry   Reminder  Alternate
                                             Method
                                  │
                                  ▼
                       Settlement Verification
                                  │
                                  ▼
                            Audit Trail
                                  │
                                  ▼
                         Merchant Dashboard
```

---

## 🛠️ Tech Stack

| Technology               | Purpose                      |
| ------------------------ | ---------------------------- |
| **Next.js 16**           | Full-stack web application   |
| **React 19**             | User interface               |
| **TypeScript**           | Application development      |
| **MongoDB**              | Transaction and audit data   |
| **OpenAI API**           | AI diagnosis                 |
| **Zod**                  | Structured output validation |
| **Razorpay Node.js SDK** | Payment workflows            |
| **Tailwind CSS**         | UI styling                   |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have:

* Node.js 20+
* MongoDB or MongoDB Atlas
* Razorpay Test Mode credentials
* OpenAI API key

### 1. Clone the repository

```bash
git clone https://github.com/ravikhokle/AIRevenueRecovery.git

cd AIRevenueRecovery
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file:

```env
MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery

OPENAI_API_KEY=your_openai_api_key

OPENAI_MODEL=gpt-4o-mini

RAZORPAY_KEY_ID=rzp_test_your_key

RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### 4. Seed the demo data

```bash
npm run seed
```

### 5. Start the application

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## 🔐 Financial Safety

Recovery AI is designed for safe experimentation.

### Test Mode

The project uses **Razorpay Test Mode** and synthetic transaction data.

### Idempotency

Duplicate execution is prevented using idempotency and deduplication checks.

### Hard Stops

Certain failures are never automatically retried.

### Bounded Automation

Recovery actions are limited by transaction amount, retry count, confidence, and policy rules.

### Human Approval

Sensitive or high-value cases can require human approval.

---

## 🎥 Demo

**Repository**

https://github.com/ravikhokle/AIRevenueRecovery

**Demo Video**

*Add your 5-minute demo video link here.*

---

## 🏆 Why Recovery AI?

Most payment recovery systems focus on:

> **"Try the payment again."**

Recovery AI focuses on:

> **"Understand the failure, decide whether recovery is appropriate, and recover revenue safely."**

The system combines:

**AI Diagnosis**
+
**Deterministic Safety Rules**
+
**Automated Recovery**
+
**Human Oversight**
+
**Measurable Results**

to create a safer approach to AI-powered revenue recovery.

---

## 👨‍💻 Project

**Recovery AI**

Built for the **Razorpay AI Buildathon — Track 03: AI Revenue Recovery**

**GitHub:** https://github.com/ravikhokle/AIRevenueRecovery
