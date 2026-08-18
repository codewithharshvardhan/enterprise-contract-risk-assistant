# AI Workflow & Design Decisions

This document explains *why* the pipeline is shaped the way it is: prompt design for extraction, the risk-scoring methodology, how confidence scores are computed, and the model/provider tradeoffs made for this deliverable.

## Model & provider choice

The pipeline calls an OpenRouter-hosted model (OpenAI-compatible Chat Completions API) rather than a vendor-specific SDK. `OPENROUTER_MODEL` defaults to `google/gemma-4-26b-a4b-it:free` — a free-tier model chosen so the app is runnable end-to-end with a zero-cost API key during evaluation, at the cost of two real caveats worth naming explicitly:

- **Free-tier daily rate limits.** OpenRouter enforces a `free-models-per-day` cap on its free-tier lineup. During development this surfaced as a genuine `429 Rate limit exceeded: free-models-per-day` error from Node 3 after repeated test runs — not a bug in the pipeline, an actual quota exhaustion. The pipeline treats this exactly like any other LLM failure: it's caught, logged to the audit trail, and turned into a graceful `status: 'error'` execution record rather than a crash. See `assumptions-limitations-future-enhancements.md` for how this should be handled in a production deployment (paid tier or a non-free default model).
- **Free-tier model capability ceiling.** Free-tier models are smaller and less consistent at strict JSON-schema-following than top-tier paid models. This is exactly why `callJsonLLM()` (below) treats "the model didn't return valid JSON" as an expected, retryable failure mode rather than an edge case — with a stronger model this retry path would rarely trigger, but the system is designed to degrade gracefully regardless of which model sits behind `OPENROUTER_MODEL`.

Because the provider is swapped behind one OpenAI-compatible client (`services/openai.ts`), pointing this at a different OpenRouter model — or a different OpenAI-compatible endpoint entirely — is a one-line env var change, not a code change.

## The `callJsonLLM` contract

Nodes 3, 4, and 5 all need the same thing from the LLM: a single JSON object matching a fixed shape, nothing else. Rather than duplicate retry/parsing logic three times, all three go through one shared helper, `callJsonLLM<T>({ systemPrompt, userPrompt, temperature, maxTokens })`:

1. Send `[system, user]` messages to the configured model.
2. Strip markdown code fences from the response (models frequently wrap JSON in ```` ```json ... ``` ```` even when told not to).
3. `JSON.parse` the result. On success, return it typed as `T`.
4. On parse failure, append the failed assistant reply plus a corrective user message (*"Your last response was not valid JSON. Respond again with ONLY a single valid JSON object — no markdown fences, no commentary, no trailing text."*) to the conversation and retry.
5. After 3 total attempts, throw with the last raw response included in the error message (so a failure is debuggable from the audit/error text alone, without needing to reproduce it).

This keeps every node's own code focused purely on *what* to ask for and how to validate/coerce the answer, not on retry mechanics.

## Extraction prompt design (Node 3)

The extraction prompt asks for one JSON object with four top-level keys — `metadata`, `clauses`, `obligations`, `absence_flags` — in a single call, rather than one call per field group. This is a deliberate cost/consistency tradeoff: one call means one coherent read of the contract (the model doesn't extract obligations from a different "mental pass" than it extracted metadata from), and it keeps token spend and free-tier rate-limit exposure to one request per contract for this stage instead of four.

Key prompt-design choices, each addressing a specific extraction failure mode:

- **Explicit "not found" sentinel.** Every one of the 20 `ContractMetadata` fields must be filled with the literal string `Not specified in contract` when absent, rather than being omitted or set to `null`/`""`. This means the UI can always render a fixed 20-row metadata table, and "the model didn't extract effective_date" is visually indistinguishable from "the contract has no effective_date" (both are honest — a missing field is itself a risk signal, feeding `absence_flags` and the recommendation logic below) — but it is always distinguishable from a parsing failure, since a coercion layer (`coerceMetadata`) rejects anything that isn't a non-empty string and falls back to the sentinel.
- **Exhaustive, ordered clause enumeration.** The system prompt lists all 15 `CLAUSE_CATEGORIES` by name in the required order and instructs the model to return exactly one entry per category. `coerceClauses` then defensively re-fills any category the model dropped as `present: false` — a clause the model failed to report is treated as functionally absent for downstream risk scoring rather than silently disappearing from the result.
- **Grounding instructions against hallucination.** The prompt explicitly forbids inventing parties, dates, or amounts not present in the source text, and instructs `absence_flags` to name concrete missing standard clauses (e.g. "No governing law specified") rather than vague risk commentary — that's Node 4's job, not Node 3's.
- **Low temperature (0.1 default, tunable).** Extraction is a reading-comprehension task, not a creative one; a low temperature favors literal fidelity to the source text over stylistic variation. The exact value is read from `agentConfigService.getValue('extractor', 'temperature', 0.1)` rather than hardcoded, so the continuous-learning loop can tune it without a code deploy.
- **Minimum input length gate (`POL-EXT-001`).** Contracts under 50 characters are rejected before spending an LLM call — there's no reasonable extraction to perform on a near-empty input, and this protects the free-tier rate limit budget from wasted calls on malformed requests.

## Risk-scoring methodology (Node 4)

Node 4 receives Node 3's full structured output (not the raw contract text) and is asked to do exactly one thing: reason about risk over already-extracted, already-validated facts. This split matters — it means risk scoring is reproducible against a fixed extraction, and a risk-scoring prompt change never needs to re-read or re-parse the source contract.

- **Named risk taxonomy.** The prompt enumerates concrete risk patterns to consider (unlimited/uncapped liability, missing or one-sided indemnification, missing confidentiality, missing/unfavorable termination terms, missing dispute resolution or governing law, missing/vague notice period, automatic/silent renewal traps, ambiguous service levels, one-sided obligations, missing data protection clauses, high/unbounded financial commitments, missing insurance requirements) while explicitly allowing "any other risk supported by the provided data" — this anchors the model on the risk categories the assignment specifically calls out without limiting it to only those.
- **Mandatory grounded explanations.** Every risk finding must include a concrete `explanation` tied to a specific field, clause, or absence flag from the input. `coerceRisks` enforces this at the code level: any risk finding with an empty explanation string is dropped entirely rather than surfaced with a placeholder. This directly satisfies the requirement that every identified risk carry a clear, defensible rationale — a risk with no evidence is treated as noise, not signal.
- **Four-dimension scoring, explicitly not-an-average overall score.** `risk_matrix` scores commercial, legal, operational, and compliance risk independently on a 0–10 scale, and the prompt explicitly instructs the model that `overall_score` should reflect the holistic risk level rather than a simple average — a single severe legal risk (e.g. uncapped liability) should be able to drive `overall_score` up even if the other three dimensions are low, matching how a human reviewer would actually weigh a contract.
- **Server-side clamping and validation, never trust-the-model.** `coerceRiskMatrix`/`coerceRisks` clamp every numeric score into `[0, 10]`, default an out-of-vocabulary severity to `medium`, and validate severities against the fixed `low | medium | high` set — a malformed or out-of-range LLM response degrades to safe defaults rather than corrupting downstream scoring or crashing the pipeline. `POL-RISK-001` and `POL-RISK-002` audit whether the returned scores/severities were in range as-received (before clamping), so a policy "Blocked" event is real evidence that the model produced an out-of-spec answer, not evidence that the system failed.
- **Low, policy-audited temperature (`POL-RISK-004`).** Risk scoring, like extraction, runs at a low default temperature (0.1) so repeated runs of the same contract don't produce wildly different scores; `POL-RISK-004` records whether the configured temperature stayed at or below the 0.3 governance threshold on every run.

## Deterministic recommendation logic (Node 5)

The executive-summary *narrative* fields are LLM-generated (Node 5's prompt), but the final `recommendation` value is **not** — it's computed by a plain deterministic function, `determineRecommendation()`, over the validated risk matrix and metadata, immune to prompt drift or model swaps:

```
overall_score >= 8 OR 2+ high-severity risks       -> HIGH_RISK_IMMEDIATE_REVIEW
2+ of {no parties, no effective_date, no value}    -> REQUEST_MISSING_INFORMATION
missing governing-law/dispute/liability/indemnity
  clause, OR legal score >= 6                      -> LEGAL_REVIEW_REQUIRED
commercial score >= 6                              -> PROCUREMENT_REVIEW_REQUIRED
any absence flag, OR 1 high-severity risk, OR
  overall_score >= 4                               -> MINOR_REVISIONS_RECOMMENDED
otherwise                                          -> READY_FOR_REVIEW
```

The rationale for keeping this out of the LLM entirely: a recommendation is an operational routing decision (who should look at this contract next, and how urgently), and routing decisions need to be auditable and stable — the same risk data should always route the same way, and a change in routing policy should be a one-function code review, not a prompt-engineering exercise with non-deterministic side effects on unrelated contracts. The prompt explicitly tells the model *not* to restate a formal recommendation code in `recommended_next_steps`, to avoid the narrative implying a different verdict than the one actually assigned. `contract_status` (`low_risk`/`moderate_risk`/`high_risk`) is derived the same way, from `overall_score` against two tunable thresholds (`low_risk_max_score` default 3.0, `moderate_risk_max_score` default 6.5).

`POL-FMT-003` audits that Node 5's own LLM call runs at temperature 0 (summary writing should be as literal/stable as possible), `POL-FMT-001` audits that the LLM call returned parseable JSON, and `POL-FMT-004` audits that the computed recommendation is one of the 6 valid enum values — a final defense-in-depth check even though the value can only ever come from the fixed function above.

## Confidence scoring methodology

`ConfidenceScores` reports five 0–1 values, each computed differently depending on whether a trustworthy signal exists:

- **`extraction`** — the fraction of the 20 metadata fields that were *not* the `NOT_FOUND` sentinel (parties counts as found only if the array is non-empty). This is a completeness proxy: a contract where the model found 18 of 20 fields is more reliably extracted than one where it found 6.
- **`clause_identification`** — the fraction of the 15 clauses that are either present-with-a-supporting-excerpt or cleanly marked absent; a clause marked "present" with no excerpt to back it up doesn't count as evidenced, since that's the pattern most likely to indicate a hallucinated "present: true".
- **`risk_detection`** — taken directly from the model's own self-reported confidence in Node 4's response (`risk_detection_confidence`), clamped to `[0, 1]`. This is the one score that's model-reported rather than code-derived, because risk completeness ("did I find all the risks?") isn't something the orchestrating code can independently verify the way it can verify field-fill ratios.
- **`summary`** — the fraction of the 10 executive-summary fields that came back as real content (not the `Not available.` fallback), weighted by the average of the extraction and clause-identification confidences — a summary built on shaky extraction inherits that shakiness even if every summary field itself was filled in.
- **`overall`** — the mean of all four component scores above. It is intentionally a simple, transparent average rather than a weighted or learned blend, so a reviewer can sanity-check it by eye against the four inputs shown alongside it in the UI.

All five scores are recomputed fresh on every pipeline run from that run's actual extraction/risk output — there's no cross-run smoothing or historical calibration in the base pipeline. The continuous-learning engine's `risk_score_calibration` quality target exists specifically to track how these self-reported confidences compare to real-world outcomes (accepted vs. rejected risk decisions from the human review workflow) over time, which is the intended mechanism for tightening this if a systematic bias emerges.

## Why governance had to be computed, not decorative

An earlier iteration of this project's governance dashboard used static fixture numbers (a hardcoded `Policies: 11`, a hardcoded `HITL queue: 0`, hardcoded `fires: 0` on every rule). That's actively misleading for a project whose whole premise is "audit and explain what the AI did" — a dashboard that always shows the same numbers regardless of what actually ran teaches an operator nothing and can hide a real outage (e.g. every extraction silently failing would still show a clean dashboard). Every number in the current dashboard is derived from the same hash-chained audit log that every pipeline node and review action writes to, specifically so a broken pipeline, an exhausted rate limit, or a stuck review queue is *visible* rather than papered over. See `governance.service.ts` and `architecture-overview.md`'s "Governance and audit" section for the derivation details.
