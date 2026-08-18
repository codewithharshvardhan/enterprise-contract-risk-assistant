# Demo Video Script

A walkthrough script for recording a demo of the Enterprise Contract Risk Assistant. Each section names the exact screen/action to show and what to say. Total target runtime: ~6-8 minutes.

## Setup (before recording)

- Backend running (`cd backend && npm run dev`, default port 4000) with a valid `OPENROUTER_API_KEY` in `backend/.env`.
- Frontend running (`cd frontend && npm run dev`, default port 5173).
- Have 2-3 files from `sample-contracts/` ready in a Downloads/desktop folder for the upload demo.
- Confirm the OpenRouter free-tier daily quota hasn't been exhausted by a prior test run (see `assumptions-limitations-future-enhancements.md`) — if Node 3 is currently rate-limited, either wait for reset or switch `OPENROUTER_MODEL` to a different model before recording, so the golden path completes on camera.

## 1. Introduction (30s)

> "This is the Enterprise Contract Risk Assistant — a 5-node AI pipeline that takes a contract, extracts structured legal facts, scores risk across four dimensions, and produces a reviewable, auditable verdict. Everything you'll see — including the governance numbers — is computed live from what the app actually does, not pre-scripted demo data."

Show the landing page at `/`, then click "Analyze" in the header nav to reach `/analyze`.

## 2. Paste-text golden path (90s)

- Open `sample-contracts/msa-vendor-agreement.txt` (or similar), copy its contents.
- Paste into the "Contract Text" textarea on the Analyze page and submit.
- Narrate while the 5-node workflow canvas animates through each stage:
  > "Node 1 validates the input. Node 2 sanitizes and formats it — long contracts get truncated at 60,000 characters with an explicit flag if that happens. Nodes 3 through 5 are the AI stages: extraction, risk scoring, and the executive summary and final recommendation."
- When it completes, show the result panel: extracted metadata table, the 15-category clause grid (present/absent + excerpt), the obligations table, the risk list with severities and explanations, the risk matrix, the executive summary, the confidence scores, and the final recommendation banner.
  > "Notice every risk has a concrete explanation — the system won't surface a risk it can't ground in the actual contract text. And the recommendation itself is computed deterministically from the risk data, not just asked of the model — so it can't drift with prompt wording."

## 3. File upload + duplicate detection (60s)

- On the Analyze page, use the "Or upload a file" control below the textarea, select a `.txt`/`.pdf`/`.docx` sample contract.
  > "Analysis starts immediately on file selection — PDF, DOCX, or plain text are all supported."
- Let it complete, then immediately re-upload the *same* file.
  > "Uploading identical content twice doesn't waste a second LLM call — it's detected via a SHA-256 content hash and flagged as a duplicate of the original analysis."
- Point out the `duplicateOfId` in the result / the duplicate indicator in the UI.

## 4. Human review workflow (90s)

On a completed analysis's result panel:
- Edit one extracted metadata field inline (e.g. correct a jurisdiction) and save.
- Accept one risk finding and reject another.
- Add a reviewer comment.
- Record a final decision — Approved, Rejected, or Needs Revision.

> "None of this is cosmetic — every one of these actions is written to the same audit trail the AI's own actions are written to. A reviewer's edits, risk decisions, comments, and final call are first-class audit events, not a separate silent state."

## 5. Executions history (30s)

Click "Executions" in the header nav (`/executions`).
> "Every run — successful or failed — is listed here with its status. A failed run, for example one that hit an OpenRouter rate limit, shows up honestly as an error, not as a silently missing result."

## 6. Governance dashboard (2 min)

Navigate to `/governance` (Overview tab by default).
> "This is the governance dashboard — and unlike a lot of AI-project demos, every number on this page is computed live from the audit trail of what actually ran in this session, not hardcoded."

- **Overview**: point out the KPIs — Policies, HITL queue, and others. Note the HITL queue count and mention it will drop by one after the review just completed records a final decision (if not already shown).
- **Policy Engine** (`/governance/policies`): show the policy rule table with real `fires` counts.
  > "Each of these 11 policy rules — like the minimum-input-length gate or the temperature lock on the risk evaluator — has a fire count that only goes up when that exact check actually runs during a pipeline execution."
- **Compliance** (`/governance/compliance`): show the OWASP ASI control grid.
  > "Each control is graded honestly: 'none' if no rule maps to it yet, 'weak' if a rule exists but hasn't fired, and 'strong' only once there's real enforcement evidence. This dashboard would show you a regression — for example if a whole node stopped firing its policy checks — instead of hiding it behind a static green checkmark."
- **Audit Trail** (`/governance/audit`): scroll the raw event log, point out the hash-chained structure.
  > "Every event is chained to the previous one by hash — tampering with or deleting a past entry would break every hash after it."
- **Agent Fleet** (`/governance/agents`) and **SLO Monitor** (`/governance/slo`): brief pass — real per-stage P95 latency against SLO targets.

## 7. Continuous learning (30s, optional)

Navigate directly to `/continuous-learning` (not in the main nav — mention this).
> "There's also a continuous-learning loop running independently of the analysis pipeline, tracking quality targets like extraction completeness and recommendation consistency over time, and gating any configuration promotion behind a minimum sample size and effect size."

## 8. Wrap-up (20s)

> "To summarize: a 5-node AI pipeline for contract extraction, risk scoring, and summarization; a real human-in-the-loop review workflow; and a governance dashboard that's honest about what has and hasn't actually been verified — all built on an OpenRouter-hosted model with no vendor lock-in on the LLM provider itself."

Close on the Overview dashboard or the completed result panel.
