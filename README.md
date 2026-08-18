# 🧠 Enterprise Contract Risk Assistant

> **AI-powered contract intelligence, risk analysis, human review, and governance — built as an end-to-end enterprise AI workflow.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript\&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react\&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js\&logoColor=white)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?logo=vite\&logoColor=white)](https://vitejs.dev/)
[![OpenRouter](https://img.shields.io/badge/LLM-OpenRouter-7C3AED)](https://openrouter.ai/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#license)

**Enterprise Contract Risk Assistant** is an AI-driven contract analysis platform designed to transform unstructured contracts into structured legal intelligence, risk insights, executive summaries, and governance evidence.

The system accepts **pasted contract text or PDF/DOCX/TXT files**, processes them through a **5-node AI pipeline**, evaluates commercial/legal/operational/compliance risks, and produces a **schema-validated recommendation**.

It also introduces a **human-in-the-loop review layer**, **hash-chained audit trail**, **governance dashboard**, and **continuous learning engine** to make the workflow more suitable for enterprise AI environments.

---

## ✨ Why This Project?

Traditional contract review can be:

* ⏳ Time-consuming
* 📄 Highly document-intensive
* 👥 Dependent on manual review
* ⚠️ Difficult to standardize
* 🔍 Difficult to audit consistently

This project explores how an AI-assisted workflow can support contract teams by combining:

**Document Processing → AI Extraction → Risk Evaluation → Decision Support → Human Review → Governance**

The goal is not to replace legal judgment, but to provide a structured AI workflow that helps reviewers identify important information faster and make decisions with traceable evidence.

---

# 🚀 Key Capabilities

| Capability                    | Description                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| 📄 **Multi-format ingestion** | Analyze pasted text and PDF/DOCX/TXT contracts                                     |
| 🧠 **AI extraction**          | Extract metadata, clauses, obligations, and absence flags                          |
| ⚠️ **Risk intelligence**      | Evaluate commercial, legal, operational, and compliance risks                      |
| 📊 **Risk matrix**            | Generate named findings and risk assessments                                       |
| 📝 **Executive summary**      | Convert detailed contract analysis into decision-ready insights                    |
| 🛡️ **JSON guardrails**       | Validate and normalize AI-generated structured output                              |
| 👤 **Human review**           | Edit extracted fields, review risks, comment, approve, reject, or request revision |
| 🔐 **Audit trail**            | Record governance and review events in a hash-chained trail                        |
| 📈 **Governance dashboard**   | Monitor KPIs, policy decisions, breaches, compliance, and pipeline performance     |
| 🔄 **Continuous learning**    | Track quality targets, feedback, drift, experiments, and promotion gates           |
| ♻️ **Duplicate detection**    | SHA-256 based duplicate contract detection                                         |
| 🔁 **LLM reliability**        | Automatic JSON retry and self-correction mechanism                                 |

---

# 🏗️ System Architecture

The platform is built around a **5-node AI workflow**:

```text
                     ┌──────────────────────┐
                     │   Contract Input     │
                     │ PDF / DOCX / TXT     │
                     │   or Pasted Text     │
                     └──────────┬───────────┘
                                │
                                ▼
                  ┌──────────────────────────┐
                  │  1. Webhook Trigger      │
                  │  Validate raw payload    │
                  └────────────┬─────────────┘
                               │
                               ▼
                  ┌──────────────────────────┐
                  │  2. Text Formatter       │
                  │ Sanitize • Normalize     │
                  │ 60,000 character cap     │
                  └────────────┬─────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  3. Extractor & Absence Agent   │
              │ Metadata • Clauses • Obligations│
              │        • Absence Flags          │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  4. Risk Matrix Evaluator       │
              │ Commercial • Legal • Operational│
              │        • Compliance Risk        │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  5. JSON Guardrail Formatter    │
              │ Executive Summary • Validation │
              │      • Recommendation          │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │       Human Review Layer        │
              │ Edit • Comment • Accept • Reject│
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │      Governance & Audit         │
              │ KPIs • Policies • Compliance   │
              │ Audit Trail • SLO Monitoring    │
              └─────────────────────────────────┘
```

---

# 🤖 AI Pipeline

### Node 1 — Webhook Trigger

Validates the incoming contract payload before it enters the AI workflow.

### Node 2 — Text Formatter

Prepares the document for downstream processing by:

* Sanitizing input
* Normalizing text
* Applying a 60,000-character limit

### Node 3 — Extractor & Absence Agent

Uses an LLM to extract:

* Contract metadata
* 15 clause categories
* Obligations
* Missing/absent clauses
* Relevant contractual facts

### Node 4 — Risk Matrix Evaluator

Evaluates multiple risk dimensions:

* 💼 Commercial
* ⚖️ Legal
* ⚙️ Operational
* 🛡️ Compliance

The evaluator also produces named risk findings.

### Node 5 — JSON Guardrail Formatter

Transforms the analysis into a structured final result containing:

* Executive summary
* Risk information
* Recommendation
* Validated JSON output

---

# 🛡️ AI Reliability & Guardrails

Every LLM interaction is routed through a shared `callJsonLLM()` helper.

The helper provides:

```text
LLM Request
     │
     ▼
Generate JSON
     │
     ▼
Validate Output
     │
 ┌───┴────┐
 │ Valid? │
 └───┬────┘
     │
   Yes ─────────► Continue
     │
    No
     │
     ▼
Self-correction message
     │
     ▼
Retry
     │
     ▼
Maximum 3 attempts
```

This reduces the impact of malformed structured LLM responses and provides a consistent interface for the pipeline nodes.

---

# 👤 Human-in-the-Loop Review

AI-generated contract analysis should not automatically become a final business decision.

The application therefore includes a review workflow where reviewers can:

* ✏️ Edit extracted metadata
* ⚠️ Accept or reject individual risk findings
* 💬 Add review comments
* ✅ Approve an analysis
* ❌ Reject an analysis
* 🔄 Request revisions

Every review action is recorded under the `reviewer` agent in the governance audit trail.

---

# 🔐 Governance & Auditability

The project includes a governance layer designed to make AI activity observable and traceable.

### Governance Dashboard

The `/governance` interface provides visibility into:

* Pipeline KPIs
* Policy decisions
* Breach alerts
* Pipeline funnel
* Agent fleet/trust status
* Compliance evidence
* SLO performance

### Hash-Chained Audit Trail

Pipeline and review events are recorded in a deterministic, hash-chained audit trail.

This provides a traceable record of:

```text
Contract
   ↓
Pipeline Execution
   ↓
AI Decisions
   ↓
Policy Checks
   ↓
Human Review
   ↓
Final Decision
```

Governance metrics are derived from actual execution and review data rather than static dashboard fixtures.

---

# 🔄 Continuous Learning

The platform includes a Continuous Learning engine available through:

```text
/continuous-learning
```

It tracks four quality targets:

```text
┌──────────────────────────────────┐
│ Extraction Completeness          │
│ Risk Score Calibration           │
│ JSON Validity Rate               │
│ Recommendation Consistency       │
└──────────────────────────────────┘
```

The system can:

* Capture human feedback
* Track agent traces
* Detect quality drift
* Propose experiments
* Gate model/pipeline promotions

---

# 🧰 Tech Stack

### Frontend

* React
* TypeScript
* Vite

### Backend

* Node.js
* Express
* TypeScript

### AI / LLM

* OpenRouter
* OpenAI-compatible API
* Structured JSON generation
* Retry/self-correction guardrails

### Document Processing

* PDF
* DOCX
* TXT
* SHA-256 hashing for duplicate detection

### Testing

* Backend test suite
* Frontend test suite
* Pipeline testing
* API testing
* Governance logic testing
* Continuous Learning testing

---

# 📂 Project Structure

```text
enterprise-contract-risk-assistant/
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── pipeline/
│       │   │   └── 5-node contract pipeline
│       │   │
│       │   ├── openai.ts
│       │   │   └── OpenRouter + callJsonLLM()
│       │   │
│       │   ├── review-store.ts
│       │   │   └── Human review state
│       │   │
│       │   ├── text-extraction.ts
│       │   │   └── PDF/DOCX/TXT extraction
│       │   │
│       │   ├── governance.service.ts
│       │   │   └── Governance & KPI derivation
│       │   │
│       │   └── cl-engine/
│       │       └── Continuous Learning
│       │
│       └── controllers/
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── workflow/
│       │   │   └── Visual 5-node workflow
│       │   │
│       │   └── contract/
│       │       └── Input / Review / Results
│       │
│       └── pages/
│
├── docs/
│   ├── Architecture documentation
│   ├── AI design decisions
│   ├── Demo script
│   └── Limitations & future enhancements
│
├── sample-contracts/
│   └── Fictitious contracts for demonstrations
│
├── build.config.json
├── package.json
└── backend/.env.example
```

---

# ⚡ Getting Started

## Prerequisites

Make sure you have:

* Node.js 18+
* npm
* An OpenRouter API key

---

## 1. Clone the repository

```bash
git clone https://github.com/codewithharshvardhan/enterprise-contract-risk-assistant.git

cd enterprise-contract-risk-assistant
```

## 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Add your OpenRouter API key:

```env
OPENROUTER_API_KEY=sk-or-...
```

> **Never commit your real API key.**

## 3. Install dependencies

```bash
npm install
```

## 4. Start the application

```bash
npm run dev
```

This starts:

```text
Frontend  → http://localhost:5173
Backend   → http://localhost:4000
Health    → http://localhost:4000/health
```

---

# 🔌 API Overview

### Analyze pasted contract

```http
POST /api/v1/contracts/analyze
Content-Type: application/json
```

```json
{
  "contract_text": "<full contract text>"
}
```

### Analyze uploaded contract

```http
POST /api/v1/contracts/analyze-file
Content-Type: multipart/form-data
```

```text
file=<contract.pdf | contract.docx | contract.txt>
```

### Webhook

```http
POST /webhook
Content-Type: application/json
```

```json
{
  "raw_text": "<full contract text>"
}
```

### Execution History

```http
GET /api/v1/contracts/executions
GET /api/v1/contracts/executions/:id
```

---

# 👁️ Human Review API

```http
GET   /api/v1/contracts/:id/review

PATCH /api/v1/contracts/:id/review/metadata

POST  /api/v1/contracts/:id/review/risk-decision

POST  /api/v1/contracts/:id/review/comment

POST  /api/v1/contracts/:id/review/decision
```

Supported final decisions:

```text
approved
rejected
needs_revision
```

---

# 📊 Governance API

```http
GET /api/v1/governance/overview
GET /api/v1/governance/audit
GET /api/v1/governance/fleet
GET /api/v1/governance/policies
GET /api/v1/governance/compliance
GET /api/v1/governance/slo
```

These endpoints expose governance metrics, policy information, audit events, compliance evidence, agent status, and SLO measurements.

---

# 🧪 Testing

Run the complete test suite:

```bash
npm test
```

The project includes coverage for:

* Pipeline nodes
* Contract analysis
* File analysis
* Duplicate detection
* Human review workflow
* Text extraction
* LLM retry logic
* Execution storage
* Governance calculations
* Continuous Learning
* Frontend functionality

---

# 📄 Sample Contracts

The repository contains five fictitious contracts designed for demonstration:

| Contract         | Purpose                           |
| ---------------- | --------------------------------- |
| NDA              | Confidentiality analysis          |
| MSA              | Master service agreement analysis |
| Vendor Agreement | Vendor-related risk               |
| Consulting SOW   | Services and obligations          |
| Software License | Licensing-related risk            |

These samples provide different risk profiles for demonstrating the complete workflow.

---

# 📚 Documentation

Additional project documentation is available under `docs/`:

* `architecture-overview.md`
* `ai-workflow-and-design-decisions.md`
* `demo-video-script.md`
* `assumptions-limitations-future-enhancements.md`

These documents cover architecture, AI workflow decisions, demonstration flow, limitations, and future improvements.

---

# ⚠️ Current Limitations

This project is designed as an engineering demonstration and prototype rather than a production legal system.

Current limitations include:

* In-memory persistence
* Dependence on OpenRouter availability
* Free-tier model rate limits where applicable
* Single-model reliance
* AI-generated results still require human validation

For real enterprise deployment, the system would require additional work around persistent databases, authentication/authorization, model governance, security hardening, scalability, observability, and legal/compliance validation.

---

# 🗺️ Future Enhancements

Potential next steps include:

* [ ] Persistent database integration
* [ ] Enterprise authentication and RBAC
* [ ] Multi-model LLM routing
* [ ] Model evaluation framework
* [ ] Advanced contract clause comparison
* [ ] Contract version tracking
* [ ] Retrieval-Augmented Generation (RAG)
* [ ] Organization-specific policy configuration
* [ ] Production-grade observability
* [ ] Scalable job/queue architecture
* [ ] Cloud deployment
* [ ] Advanced security controls
* [ ] Automated regression evaluation for AI changes

---

# 🎯 Project Focus

This project brings together several areas of modern AI engineering:

```text
                 ┌─────────────────────┐
                 │   Generative AI     │
                 └──────────┬──────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
       LLMs              AI Agents       Structured
                                          Outputs
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                    Enterprise Workflow
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
     Human Review       Governance          Audit
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                    Decision Intelligence
```

The emphasis is on building an AI system that is not only capable of generating answers, but also provides **structured outputs, validation, human oversight, traceability, governance, and measurable quality signals**.

---

# 👨‍💻 Author

**Harsh Vardhan**

AI / Full-Stack Engineer focused on:

* Generative AI
* LLM applications
* AI workflows
* RAG systems
* Backend engineering
* Full-stack development
* Enterprise AI systems

---

# ⭐ Support

If you find this project useful or interesting, consider giving the repository a ⭐ on GitHub.

Your feedback, suggestions, and contributions are welcome.

---

## 📜 License

This project is licensed under the **MIT License**.
