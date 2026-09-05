# Recovery AI

> **AI-powered payment recovery that helps businesses recover lost revenue — safely.**

Recovery AI is an intelligent payment-recovery agent that finds failed or abandoned payments, diagnoses **why they failed**, and chooses the safest recovery action.

Instead of blindly retrying every payment, Recovery AI combines **AI diagnosis with deterministic safety rules** to decide whether to:

* 🔄 **Retry payment** — for temporary bank or network failures
* 💳 **Suggest another payment method** — for soft declines or insufficient funds
* 🔔 **Send a payment reminder** — for abandoned checkouts
* 🧑‍💼 **Escalate to human review** — for high-value or uncertain cases
* 🛑 **Stop recovery** — for fraud, hard declines, or exhausted retries

**Track:** 03 — AI Revenue Recovery (Razorpay AI Buildathon)
**Repository:** [GitHub Repository](https://github.com/ravikhokle/AIRevenueRecovery)

---

## 💡 The Problem

A failed payment does not always mean a lost customer. Payments can fail because of:

* Temporary network or gateway failures
* Soft declines such as insufficient funds
* Expired or stolen cards
* Checkout abandonment
* Retry limits being reached

A naive system simply retries failed payments. This can cause:

* ❌ Duplicate charges and customer frustration
* ❌ Unnecessary retries on hard declines
* ❌ Revenue that is never recovered

Businesses need a safer closed loop:

**Detect → Diagnose → Enforce Safety → Recover → Audit**

---

## 🚀 The Solution

> **"AI recommends. Deterministic rules decide."**

```text
Failed / Abandoned Payment
          │
          ▼
 Context Retrieval
 (History + Error Code)
          │
          ▼
    AI Diagnosis
          │
          ▼
 ┌───────────────────────────────────────┐
 │       Deterministic Guardrails        │
 │                                       │
 │  • Maximum 3 retries                  │
 │  • ₹10,000 auto-recovery limit        │
 │  • Hard-decline / fraud stop         │
 │  • Idempotency & duplicate protection │
 │  • Minimum confidence ≥ 70%           │
 └──────────────────┬────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    APPROVED              ESCALATE / BLOCK
        │                       │
        ▼                       ▼
 Razorpay Test Action      Human Review /
 Retry / Link / Reminder   Stop Recovery
        │                       │
        └───────────┬───────────┘
                    ▼
         Settlement Verification
                    │
                    ▼
            Immutable Audit Trail
```

---

## 🎯 Diagnosis & Decision Matrix

| Failure Situation          | Root Cause        | Recovery Decision                 | Safety Rule        |
| -------------------------- | ----------------- | --------------------------------- | ------------------ |
| **Network Timeout**        | Transient         | Smart Retry with Backoff          | Maximum 3 attempts |
| **Insufficient Funds**     | Soft Decline      | Alternate Payment Link / Reminder | Max 1 reminder/day |
| **Checkout Abandoned**     | Customer Drop-off | Payment Reminder Link             | Idempotency check  |
| **Expired / Stolen Card**  | Hard Decline      | **STOP**                          | Never retry        |
| **Max Retries Reached**    | Exhausted         | **STOP**                          | Lifetime cap = 3   |
| **High Value (> ₹10,000)** | Risk Tier         | **Human Review**                  | Manual approval    |

---

## 🛡️ Safety Guardrails

1. **3-Retry Cap:** A transaction can never be retried more than three times.
2. **₹10,000 Auto Limit:** Transactions above ₹10,000 cannot be recovered automatically.
3. **Hard Decline Protection:** Fraud, stolen, or expired cards are never retried.
4. **Idempotency & Replay Protection:** Prevents duplicate charges during retries.
5. **Human-in-the-Loop:** Low-confidence (< 70%) and edge cases go to merchant review.
6. **Zero Real-Money Risk:** All Razorpay operations use Test Mode.

---

## 📊 Evaluation

Recovery AI measures actual recovery results across batches:

* **Revenue at Risk vs. Recovered Revenue (₹)**
* **Recovery Conversion Rate (%)**
* **Guardrail Blocks & Policy Enforcement**
* **Processing Latency & Verification Rate**

### Held-Out Evaluation Dataset

Dedicated test suite: **Seed Version 2 — 152 transactions, 89 eligible failures**

```bash
# Deterministic benchmark
npm run eval -- --dry-run

# Live evaluation: AI + Guardrails + Database
npm run eval
```

---

## 🖥️ Merchant Dashboard

* **Overview (****`/dashboard`****):** Revenue at Risk, Recovered Revenue, Recovery Rate, and Policy Blocks.
* **Transactions (****`/dashboard/transactions`****):** Browse and filter payment outcomes.
* **Transaction Dossier (****`/dashboard/transactions/[id]`****):** Failure details, AI diagnosis, guardrail checks, and audit trail.
* **Batch Operations (****`/dashboard/batch`****):** Run recovery pipelines for 10, 25, 50, 100+ transactions.
* **Audit Trail (****`/dashboard/audit`****):** Complete log of agent actions and human decisions.

---

## 🛠️ Tech Stack

| Layer         | Technology                        |
| ------------- | --------------------------------- |
| **Fullstack** | Next.js 16, React 19, TypeScript  |
| **Database**  | MongoDB                           |
| **AI Engine** | OpenAI API (`gpt-4o-mini`)        |
| **Payments**  | Razorpay Node.js SDK (Test Mode)  |
| **Safety**    | Zod + Deterministic Policy Engine |
| **Styling**   | Tailwind CSS                      |

---

## 🚀 Quick Start

### Prerequisites

* Node.js 20+
* MongoDB / MongoDB Atlas
* OpenAI API key
* Razorpay Test Key ID & Secret

### 1. Clone & Install

```bash
git clone https://github.com/ravikhokle/AIRevenueRecovery.git
cd AIRevenueRecovery
npm install
```

### 2. Configure Environment

Create `.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### 3. Seed Demo Data

```bash
npm run seed
```

### 4. Start the Application

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## 🎥 Pitch Video & Demo

* **Repository:** [GitHub Repository](https://github.com/ravikhokle/AIRevenueRecovery)
* **Pitch Video:***https://github.com/ravikhokle/AIRevenueRecovery*

---

## 🏆 Summary

| What it Solves                                                | How it Stays Safe                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Recovers eligible revenue from failed and abandoned payments. | AI only diagnoses; deterministic guardrails control every recovery action.                                |
| Automates recovery across individual and batch transactions.  | Retry caps, amount limits, idempotency, hard-decline protection, and human review prevent unsafe actions. |
| Makes every decision explainable and auditable.               | Every action is recorded with its diagnosis, guardrail checks, and outcome.                               |
