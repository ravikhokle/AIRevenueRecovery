# Recovery AI

> **AI-powered payment recovery that helps businesses recover lost revenue — safely.**

Recovery AI is an intelligent payment-recovery agent that identifies failed or abandoned payments, diagnoses **why the payment failed**, and executes the safest recovery action.

Instead of blindly retrying payments, Recovery AI pairs **AI decision-making with deterministic safety rules** to decide whether to:

* 🔄 **Retry the payment** (for transient bank/network drops)
* 💳 **Suggest alternate payment method** (for soft declines/insufficient funds)
* 🔔 **Send payment reminder** (for abandoned checkouts)
* 🧑‍💼 **Escalate to human review** (for high-value or ambiguous transactions)
* 🛑 **Stop recovery** (for fraud, hard declines, or max retries reached)

**Track:** 03 — AI Revenue Recovery (Razorpay AI Buildathon)  
**Repository:** https://github.com/ravikhokle/AIRevenueRecovery

---

## 💡 The Problem

Payment failures don't always mean lost customers. A payment can fail due to:

* Temporary network/gateway timeouts
* Soft declines (insufficient funds)
* Expired or stolen cards (hard declines)
* Checkout drop-offs / abandonments
* Retry limit exhaustion

Naive recovery systems blindly retry every failure, leading to:
* ❌ Duplicate charges & customer friction
* ❌ Gateway penalties on hard declines
* ❌ Silent, unrecoverable revenue loss

Businesses need a closed-loop system: **detect → diagnose → enforce safety → recover → audit**.

---

## 🚀 The Solution: Two-Tier Architecture

> **"AI recommends. Deterministic rules decide."**

```text
Failed / Abandoned Payment
          │
          ▼
 Context Retrieval (History, Error Code)
          │
          ▼
   AI Diagnosis & Hypothesis
          │
          ▼
 ┌───────────────────────────────────────┐
 │     Deterministic Guardrail Engine    │
 │  - Max 3 Retries per Transaction      │
 │  - ₹10,000 Auto-Recovery Cap          │
 │  - Hard Decline / Stolen Card Stop    │
 │  - Idempotency & Deduplication Lock   │
 │  - Minimum Confidence Floor (≥ 70%)   │
 └──────────────────┬────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  [ APPROVED ]            [ ESCALATE / BLOCK ]
        │                       │
        ▼                       ▼
 Razorpay Test Action      Human Review Queue /
 (Retry / Link / Reminder) Stop Recovery
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
         Settlement Verification
                    │
                    ▼
          Immutable Audit Trail
```

---

## 🎯 Intelligent Diagnosis & Decision Matrix

| Failure Situation | Root Cause Class | Recovery Decision | Safety Rule Enforced |
|---|---|---|---|
| **Network Timeout** | Transient | Smart Retry with Backoff | Limit ≤ 3 attempts |
| **Insufficient Funds** | Soft Decline | Alternate Payment Link / Reminder | Max 1 reminder/day |
| **Checkout Abandoned** | Customer Drop-off | Payment Reminder Link | Idempotency check |
| **Expired / Stolen Card** | Hard Decline | **STOP (Not Recoverable)** | Instant disqualification |
| **Max Retries Reached** | Exhausted | **STOP (Exhausted)** | Lifetime cap = 3 |
| **High Value (> ₹50,000)**| Risk Tier | **Human Review Escalation** | Mandatory manual approval |

---

## 🛡️ Deterministic Guardrails & Financial Safety

1. **Strict 3-Retry Cap:** No transaction can ever receive unlimited retries.
2. **₹10,000 Auto Limit:** Actions above ₹10,000 are blocked from auto-execution; > ₹50,000 requires human signoff.
3. **Hard Decline Blacklist:** Fraud, stolen, or expired cards are never retried.
4. **Idempotency & Replay Protection:** Prevents duplicate charges during network retries.
5. **Human-in-the-Loop:** Low-confidence (< 70%) and edge cases automatically escalate to merchant review.
6. **Zero Real-Money Risk:** Exclusively utilizes Razorpay Test Mode APIs.

---

## 📊 Measuring Recovery & Evaluation Benchmark

RevGuard measures real recovery across batches rather than hypothetical decisions:

* **Revenue at Risk vs. Recovered Revenue (₹)**
* **Recovery Conversion Rate (%)**
* **Guardrail Blocks & Policy Enforcement Count**
* **Processing Latency & Verification Rate**

### Held-Out Evaluation Dataset

Includes a dedicated held-out test suite (Seed Version 2, 152 transactions, 89 eligible failures):

```bash
# Deterministic benchmark dry-run (instant)
npm run eval -- --dry-run

# Live evaluation run (AI + Guardrails + DB)
npm run eval
```

---

## 🖥️ Merchant Dashboard

* **Overview (`/dashboard`):** High-level KPIs (Revenue at Risk, Recovered Revenue, Recovery Rate, Policy Blocks).
* **Transactions (`/dashboard/transactions`):** Filter and inspect failed vs. recovered payments.
* **Transaction Dossier (`/dashboard/transactions/[id]`):** Step-by-step failure context, AI reasoning, guardrail checks, and audit trail.
* **Batch Operations (`/dashboard/batch`):** Run high-volume recovery pipelines (10, 25, 50, 100+ txns) with live before/after metrics.
* **Audit Trail (`/dashboard/audit`):** Complete immutable log of every agent action and human decision.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Fullstack Framework** | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| **Database** | MongoDB (Native driver, indexed collections) |
| **AI Engine** | OpenAI API (`gpt-4o-mini` with structured JSON schema outputs) |
| **Payment Workflows** | Razorpay Node.js SDK (Test Mode) |
| **Safety & Validation** | Zod Schema Validation & Deterministic Policy Engine |
| **Styling** | Vanilla Tailwind CSS (Modern Dark/Light UI) |

---

## 🚀 Quick Start Guide

### Prerequisites
* Node.js 20+
* MongoDB instance (local or MongoDB Atlas)
* OpenAI API key
* Razorpay Test Key ID & Secret

### 1. Clone & Install
```bash
git clone https://github.com/ravikhokle/AIRevenueRecovery.git
cd AIRevenueRecovery
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` or `.env` file in the root:
```env
MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### 3. Seed Demo Dataset
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎥 Pitch Video & Demo

* **Public Repository:** https://github.com/ravikhokle/AIRevenueRecovery
* **Pitch Video:** *(Add unlisted YouTube / Loom video link)*

---

## 🏆 Summary

| What it Solves | Bounded & Gated | What Broke & Fix |
|---|---|---|
| Closes the loop from payment failure detection to intelligent, compliant recovery across batches. | AI proposes diagnoses; deterministic guardrails enforce amount limits, retry caps, and safety stops before Razorpay execution. | Fixed LLM hallucination / hard-decline retry risks by demoting LLM to pure diagnosis and gating all execution behind a zero-trust policy engine. |
