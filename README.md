# Razorpay AI Revenue Recovery Agent

> **Razorpay AI Buildathon Submission**  
> **Track 03:** AI Revenue Recovery  
> *Find revenue that’s slipping away and win it back.*

---

## 📌 Executive Summary & Submission Overview

| Form Question | Response / Detail |
|---|---|
| **Track** | **03 — AI Revenue Recovery** |
| **Project Name** | **Razorpay AI Revenue Recovery Agent (RevGuard AI)** |
| **What it Solves** | Bridges the critical gap between payment failure detection and intelligent, compliant recovery. Instead of naive auto-retries that trigger duplicate charges or manual triage that fails at scale, RevGuard diagnoses root causes, classifies recoverable vs. unrecoverable drop-offs, enforces deterministic safety guardrails, executes bounded recovery actions via Razorpay APIs, and records an immutable audit trail with measured batch recovery metrics. |
| **Public GitHub Repo** | `https://github.com/<your-username>/ai-revenue-recovery` *(Update with your repository URL)* |
| **5-Min Pitch Video** | *(Insert your unlisted YouTube / Loom video link)* |
| **What broke, and how you got out** | **LLM Non-Determinism vs. Financial Safety & Idempotency Collisions:** During early testing, standard LLM prompts occasionally recommended retrying hard-declined cards (stolen card codes) or generated varying retry actions for the same failure event. If executed blindly, this causes merchant penalties, customer friction, and duplicate charges. We solved this with a strict **Two-Tier Architecture**: (1) The LLM is confined purely to diagnosis and structured hypothesis generation via strict Zod JSON schemas, and (2) A zero-trust **Deterministic Guardrail Engine** hard-gates all execution (enforcing ₹10k auto caps, 3-attempt lifetime limits, hard-decline blacklists, and idempotency locks). When an action fails or triggers a boundary, it automatically escalates to a Human Review queue with full audit context. |

---

## 🎯 Track 03: Meeting "The Bar"

| Requirement | Implementation in RevGuard AI |
|---|---|
| **1. Measured Money Recovered across a Batch** | Full batch pipeline (`/dashboard/batch`) processing 10 to 1,000+ synthetic failure records concurrently. Generates real-time before/after metrics: Total Revenue at Risk, Recovered Revenue, Conversion Rate (%), and processing latency. |
| **2. Explainable, Bounded & Gated Money Actions** | The LLM provides structured reasoning and confidence scores. All money actions (`RETRY`, `REMINDER`, `ALTERNATE_PAYMENT_METHOD`) pass through 8 deterministic business rules before execution. |
| **3. Stopping Rules & Safety Policies** | Strict hard-stops: max 3 retries per transaction, ₹10,000 auto-recovery cap (₹50,000 requires human signoff), 60%–70% minimum confidence floor, hard decline instant disqualification, customer weekly failure limit. |
| **4. Compliant Escalation (Human-in-the-Loop)** | High-value, ambiguous, or low-confidence failures route automatically to the Merchant Human Review Queue (`/api/workflow/human-review`) with full contextual dossier. |
| **5. Immutable Audit Trail** | Step-by-step chronological audit records (`/dashboard/audit`) storing timestamp, actor, input event, AI diagnosis, guardrail evaluation, Razorpay API payload, and settlement verification. |
| **6. Failure Handled Gracefully** | Handled payment link expiration, card decline codes (insufficient funds vs. stolen/expired), customer failure rate-limits, duplicate idempotency deduplication, and network timeout recovery. |

---

## 🏗️ System Architecture & Workflow

```text
                                 [ Merchant Payment Events ]
                           (Failed / Abandoned / Timed-out Webhook)
                                            │
                                            ▼
                               [ Context Retrieval Engine ]
                      (Customer History, Failure Code, Lifetime Value)
                                            │
                                            ▼
                                 [ AI Diagnosis Engine ]
                         (OpenAI gpt-4o-mini + Structured Outputs)
                                            │
                                            ▼
                     ┌───────────────────────────────────────────────┐
                     │         Deterministic Guardrail Engine        │
                     │  - ₹10,000 Auto-Recovery Hard Cap             │
                     │  - Max 3 Retries per Transaction              │
                     │  - Hard Decline / Stolen Card Blacklist       │
                     │  - Idempotency & Deduplication Lock           │
                     │  - Confidence Floor (>= 0.70 Auto-Retry)      │
                     └──────────────────────┬────────────────────────┘
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      │                                           │
             [ BLOCKED / ESCALATED ]                         [ APPROVED ]
                      │                                           │
                      ▼                                           ▼
          [ Human Review Queue ]                      [ Razorpay Action Executor ]
          - High-value approval                       - Smart Retry Orchestrator
          - Ambiguous triage                          - Alternate Payment Link API
          - Merchant override                         - Customer Reminder Dispatch
                      │                                           │
                      └─────────────────────┬─────────────────────┘
                                            │
                                            ▼
                             [ Settlement & Verification ]
                                            │
                                            ▼
                             [ Immutable Audit Trail Log ]
                                            │
                                            ▼
                          [ Real-time Merchant Dashboard ]
```

---

## 📊 Held-Out Test Set & Evaluation Benchmark

RevGuard includes a dedicated held-out evaluation generator (Seed Version 2) to measure precision, recall, F1, and financial recovery metrics across diverse real-world payment scenarios:

| Scenario Class | Description | Expected Agent Behavior |
|---|---|---|
| `TRANSIENT_NETWORK_TIMEOUT` | Bank gateway timeout / network drop | Auto-retry with backoff |
| `INSUFFICIENT_FUNDS` | Soft decline due to balance | Alternate payment method / reminder |
| `EXPIRED_OR_STOLEN_CARD` | Hard bank decline / fraud flag | Immediate STOP (NOT_RECOVERABLE) |
| `CHECKOUT_ABANDONMENT` | Dropped off after initiation | Smart payment link reminder |
| `HIGH_VALUE_TRANSACTION` | Amount > ₹50,000 | Human review escalation |
| `RETRY_EXHAUSTED` | Already attempted 3 times | Stop rule enforced |

### Run Benchmark via CLI
```bash
# Dry-run mode (deterministic mock validation)
npm run eval -- --dry-run

# Live evaluation mode (Full AI + Guardrails + DB)
npm run eval
```

---

## 💻 Tech Stack

- **Fullstack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Vanilla Tailwind CSS with custom Dark/Light Glassmorphism tokens
- **Database:** MongoDB (Native driver, transactions, indexed collections)
- **AI / LLM:** OpenAI API (Structured JSON Schema generation with Zod)
- **Payments:** Razorpay Node.js SDK (Test Mode)
- **Safety & Validation:** Zod schema validation & Deterministic Policy Engine

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js 20+
- MongoDB instance (Local MongoDB or MongoDB Atlas)
- Razorpay Test Key ID & Secret ([Razorpay Dashboard](https://dashboard.razorpay.com/))
- OpenAI API Key

### 2. Installation
```bash
git clone <your-repo-url>
cd ai-revenue-recovery
npm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:
```env
MONGODB_URI=mongodb://localhost:27017/ai-revenue-recovery
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

### 4. Seed Synthetic Dataset
Populate test merchant transactions and customer profiles:
```bash
npm run seed
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the Merchant Dashboard.

---

## 🖥️ Dashboard Navigation

- **Overview (`/dashboard`):** Real-time KPI cards (Revenue at Risk, Recovered Revenue, Conversion %, Policy Blocks).
- **Transactions (`/dashboard/transactions`):** Search, filter, and inspect failed vs. recovered payments.
- **Transaction Dossier (`/dashboard/transactions/[id]`):** In-depth view of failure reason, AI diagnosis, guardrail decision log, and executed Razorpay action.
- **Batch Operations (`/dashboard/batch`):** Trigger batch recovery runs on 10, 25, 50, 100, or custom batch sizes with instant visual outcomes.
- **Audit Trail (`/dashboard/audit`):** Complete chronological log of every autonomous agent operation and human escalation.

---

## 🛡️ Safety & Financial Governance

1. **AI Proposes, Code Disposes:** The AI engine never holds financial authority or executes payments directly; all actions pass through the Deterministic Guardrail Engine.
2. **Zero Real-Money Risk:** Built strictly with Razorpay Test Mode APIs and synthetic merchant datasets.
3. **Idempotency & Replay Prevention:** Guaranteed single-execution semantics to prevent duplicate customer charges.