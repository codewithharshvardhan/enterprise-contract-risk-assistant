// Centralised mock fixtures for the Governance UI. Replace these with real
// API responses when wiring a backend — keep the shapes the same and the
// pages will render unchanged.

export const overview = {
  // Headline KPIs at the top of the Overview page (5 cards).
  kpis: [
    { label: "Cases (24h)",   value: 142,        sub: "+8 vs. yesterday",       accent: true },
    { label: "Policies",      value: 12,         sub: "6 prompt-injection rules" },
    { label: "HITL queue",    value: 3,          sub: "awaiting human approval" },
    { label: "Kills (24h)",   value: 5,          sub: "AGT KillSwitch" },
    { label: "OWASP ASI",     value: "8 / 10",   sub: "covered", accent: true },
  ],

  // Donut chart breakdown of every policy decision in the past 24h.
  policy_decisions: [
    { label: "Allow", value: 1142, color: "#10b981" },
    { label: "Audit", value: 312,  color: "#f59e0b" },
    { label: "Block", value: 87,   color: "#f97316" },
    { label: "Deny",  value: 49,   color: "#ef4444" },
  ],

  // Active alerts that need someone's attention.
  breach_alerts: [
    { severity: "HIGH",   kind: "policy_block_spike",  message: "Deny rate at Decide → Execute up 38% in last hour" },
    { severity: "MEDIUM", kind: "slo_breach",          message: "Decide stage P95 latency above target for 12 minutes" },
    { severity: "LOW",    kind: "trust_score_drop",    message: "Agent 'email-composer-dispatcher' trust score fell to 0.62" },
  ],

  // Pipeline funnel — counts of pipelines that passed each stage in last 24h.
  pipeline_funnel: [
    { stage: "Intake",      count: 1582, deny: 47 },
    { stage: "Extract",     count: 1535, deny: 0  },
    { stage: "Reconcile",   count: 1535, deny: 23 },
    { stage: "Decide",      count: 1512, deny: 312 },
    { stage: "Execute",     count: 1200, deny: 0 },
    { stage: "Communicate", count: 1200, deny: 0 },
  ],

  // Quick activity strip at the bottom.
  recent: [
    { time: "14:23", text: "Pipeline 'Alert Forwarding' completed — 4 steps in 38s" },
    { time: "14:19", text: "Prompt injection blocked — direct_override category" },
    { time: "14:11", text: "Agent 'recipient-resolver' trust score rose to 0.82" },
    { time: "13:58", text: "Subagent halted — bash blocked pattern (env dump)" },
    { time: "13:42", text: "Pipeline run started by user anuragk@leewayhertz.com" },
  ],
};

export const auditRows = [
  { idx: 1, time: "14:23:11", agent: "pipeline", event: "Pipeline Event", outcome: "Success", chain: "verified" },
  { idx: 2, time: "14:23:09", agent: "Alert Ingestion & Parser", event: "Step Completed", outcome: "Success", chain: "verified" },
  { idx: 3, time: "14:23:01", agent: "Orchestrator", event: "Prompt Injection Check", outcome: "Denied", chain: "verified" },
  { idx: 4, time: "14:22:58", agent: "orchestrator", event: "Tool Result", outcome: "Success", chain: "verified" },
  { idx: 5, time: "14:22:42", agent: "alert-ingestion-parser", event: "Sub Agent Stop", outcome: "Success", chain: "verified" },
  { idx: 6, time: "14:22:41", agent: "alert-ingestion-parser", event: "Tool Invocation", outcome: "Denied", chain: "verified" },
  { idx: 7, time: "14:22:38", agent: "alert-ingestion-parser", event: "Tool Result", outcome: "Success", chain: "verified" },
  { idx: 8, time: "14:22:35", agent: "alert-ingestion-parser", event: "Tool Invocation", outcome: "Success", chain: "verified" },
];

export const pipelines = [
  {
    pipelineId: "83a2388b-d51e-4fa1",
    pipelineName: "Indian Government Emergency Alert Forwarding",
    root: { label: "ZBrain Orchestrator", did: "did:pipeline:83a2388b" },
    agents: [
      { id: "a1", name: "Alert Ingestion & Parser",     ring: 1, trustTier: "Trusted",     trustScore: 0.78, allowed: 3, denied: 7, tools: ["read_json", "read_text_file", "parse_email"] },
      { id: "a2", name: "Alert Classifier & Validator", ring: 1, trustTier: "Trusted",     trustScore: 0.81, allowed: 2, denied: 8, tools: ["compare_values", "format_output"] },
      { id: "a3", name: "Email Composer & Dispatcher",  ring: 2, trustTier: "Provisional", trustScore: 0.62, allowed: 1, denied: 9, tools: ["format_output"] },
      { id: "a4", name: "Recipient Resolver",           ring: 1, trustTier: "Trusted",     trustScore: 0.85, allowed: 4, denied: 6, tools: ["query_spreadsheet", "read_spreadsheet", "read_json", "read_text_file"] },
    ],
  },
];

// AGT's 4-tier trust classification model — Verified at the top. Trust score
// (0–1000) maps into one of these tiers; the Trust Tier Distribution row
// on Agent Fleet shows count + agent names per tier.
export const trustTiers = [
  { label: "Verified",    bar: "bg-emerald-500", text: "text-emerald-700", min: 900, max: 1000 },
  { label: "Trusted",     bar: "bg-blue-500",    text: "text-blue-700",    min: 600, max: 899  },
  { label: "Provisional", bar: "bg-amber-500",   text: "text-amber-700",   min: 300, max: 599  },
  { label: "Untrusted",   bar: "bg-rose-500",    text: "text-rose-700",    min: 0,   max: 299  },
];

export const blockedPatterns = {
  kpis: { total_patterns: 42, total_blocks: 49, most_active_category: "Direct Override", most_active_count: 12, categories_count: 6 },
  categories: [
    { id: "direct_override",      label: "Direct Override",       patterns: 7,  fires: 12 },
    { id: "delimiter",            label: "Delimiter Attack",      patterns: 12, fires: 4 },
    { id: "role_play",            label: "Role Play / Jailbreak", patterns: 7,  fires: 6 },
    { id: "context_manipulation", label: "Context Manipulation",  patterns: 6,  fires: 2 },
    { id: "multi_turn",           label: "Multi-turn Escalation", patterns: 5,  fires: 0 },
    { id: "encoding",             label: "Encoding Tricks",       patterns: 5,  fires: 1 },
  ],
};

export const policyRules = [
  { id: "prompt_injection.direct_override",      label: "Direct Override",       scope: "Global", action: "deny", priority: 90, stages: ["intake", "execute"], fires: 12, owasp: "ASI-01" },
  { id: "prompt_injection.delimiter",            label: "Delimiter Attack",      scope: "Global", action: "deny", priority: 90, stages: ["intake", "execute"], fires: 4,  owasp: "ASI-06" },
  { id: "prompt_injection.role_play",            label: "Role Play / Jailbreak", scope: "Global", action: "deny", priority: 90, stages: ["intake", "execute"], fires: 6,  owasp: "ASI-01" },
  { id: "prompt_injection.context_manipulation", label: "Context Manipulation",  scope: "Global", action: "deny", priority: 90, stages: ["intake", "execute"], fires: 2,  owasp: "ASI-01" },
  { id: "prompt_injection.multi_turn",           label: "Multi-turn Escalation", scope: "Global", action: "deny", priority: 50, stages: ["intake", "execute"], fires: 0,  owasp: "ASI-01" },
  { id: "prompt_injection.encoding",             label: "Encoding Tricks",       scope: "Global", action: "deny", priority: 50, stages: ["intake", "execute"], fires: 1,  owasp: "ASI-01" },
];

// Pipeline-stage enforcement gates (top of Policy Engine page).
export const confidenceGates = [
  { stage: "Intake",   gate: "Spam / phishing / prompt-injection deny", action: "deny" },
  { stage: "Extract",  gate: "—",                                       action: "none" },
  { stage: "Reconcile", gate: "—",                                       action: "none" },
  { stage: "Decide",   gate: "Confidence ≥95% allow · 80-94% audit · <80% block", action: "allow" },
  { stage: "Execute",  gate: "PostToolUse prompt-injection + capability guard",   action: "deny" },
  { stage: "Communicate", gate: "—",                                    action: "none" },
];

export const compliance = {
  coverage_pct: 78,
  controls: [
    { id: "ASI-01", name: "Goal Hijacking",                 grade: "strong",   severity: "HIGH",   evidence: 142, rules: 6 },
    { id: "ASI-02", name: "Tool Misuse",                    grade: "moderate", severity: "HIGH",   evidence: 87,  rules: 3 },
    { id: "ASI-03", name: "Identity & Privilege Abuse",     grade: "strong",   severity: "HIGH",   evidence: 64,  rules: 4 },
    { id: "ASI-04", name: "Supply Chain",                   grade: "weak",     severity: "MEDIUM", evidence: 8,   rules: 1 },
    { id: "ASI-05", name: "Unexpected Code Execution",      grade: "moderate", severity: "HIGH",   evidence: 31,  rules: 2 },
    { id: "ASI-06", name: "Memory & Context Poisoning",     grade: "strong",   severity: "MEDIUM", evidence: 24,  rules: 2 },
    { id: "ASI-07", name: "Insecure Inter-Agent Comm",      grade: "none",     severity: "MEDIUM", evidence: 0,   rules: 0 },
    { id: "ASI-08", name: "Cascading Failures",             grade: "weak",     severity: "MEDIUM", evidence: 6,   rules: 1 },
  ],
  needs_attention: [
    { id: "ASI-04", name: "Supply Chain",              grade: "weak", severity: "MEDIUM" },
    { id: "ASI-07", name: "Insecure Inter-Agent Comm", grade: "none", severity: "MEDIUM" },
    { id: "ASI-08", name: "Cascading Failures",        grade: "weak", severity: "MEDIUM" },
  ],
};

export const slo = {
  stages: [
    { stage: "Intake",  target_p95_ms: 250,  observed_p95_ms: 184, status: "ok"     },
    { stage: "Extract", target_p95_ms: 1500, observed_p95_ms: 1120, status: "ok"    },
    { stage: "Decide",  target_p95_ms: 600,  observed_p95_ms: 712, status: "breach" },
    { stage: "Execute", target_p95_ms: 1000, observed_p95_ms: 940, status: "ok"     },
  ],
  error_budget: { remaining_pct: 73, burn_rate: "1.2x", window: "30d" },
  trend_24h: [180, 195, 210, 188, 244, 312, 298, 240, 220, 184, 192, 175],
};

export const ringColor: Record<number, string> = {
  0: "bg-emerald-50 text-emerald-700 border-emerald-200",
  1: "bg-blue-50 text-blue-700 border-blue-200",
  2: "bg-amber-50 text-amber-700 border-amber-200",
  3: "bg-rose-50 text-rose-700 border-rose-200",
};

export const stageBadge: Record<string, string> = {
  intake:  "bg-gray-100 text-gray-700 border-gray-200",
  decide:  "bg-blue-50 text-blue-700 border-blue-200",
  execute: "bg-purple-50 text-purple-700 border-purple-200",
};

export const outcomeColor: Record<string, string> = {
  Success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Denied:  "bg-purple-50 text-purple-700 border-purple-200",
  Failure: "bg-red-50 text-red-700 border-red-200",
};

export const gradeColor: Record<string, string> = {
  strong:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  moderate: "text-blue-700 bg-blue-50 border-blue-200",
  weak:     "text-amber-700 bg-amber-50 border-amber-200",
  none:     "text-rose-700 bg-rose-50 border-rose-200",
};

export const severityColor: Record<string, string> = {
  HIGH:   "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW:    "bg-gray-100 text-gray-700 border-gray-200",
  INFO:   "bg-blue-100 text-blue-700 border-blue-200",
};

// Per-category palette used by the Blocked Patterns section in Policy Engine.
// `bar` drives the inline fire-count bar; `bg/border/text` style the card; `badge`
// styles the "{n} patterns" chip in the corner.
export const categoryPalette: Record<string, { bar: string; badge: string; bg: string; border: string; text: string }> = {
  direct_override:      { bar: "bg-red-500",     badge: "bg-red-100 text-red-700 border-red-200",       bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700" },
  delimiter:            { bar: "bg-orange-500",  badge: "bg-orange-100 text-orange-700 border-orange-200", bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700" },
  role_play:            { bar: "bg-amber-500",   badge: "bg-amber-100 text-amber-700 border-amber-200", bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700" },
  context_manipulation: { bar: "bg-rose-500",    badge: "bg-rose-100 text-rose-700 border-rose-200",    bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700" },
  multi_turn:           { bar: "bg-purple-500",  badge: "bg-purple-100 text-purple-700 border-purple-200", bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-700" },
  encoding:             { bar: "bg-blue-500",    badge: "bg-blue-100 text-blue-700 border-blue-200",    bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700" },
};


// Pool of every tool any agent on the tenant could call. Used to compute the
// "denied" tool list per agent on the Stage Agent Identities card.
export const allTenantTools = [
  "read_json",
  "read_text_file",
  "parse_email",
  "compare_values",
  "format_output",
  "query_spreadsheet",
  "read_spreadsheet",
  "write_file",
  "send_email",
  "execute_sql",
];

// Extra detail surfaced when an Audit Trail row is clicked — opens the
// forensic bottom panel. Indexed by row idx.
export const auditDetails: Record<number, {
  agentDid: string;
  runId: string;
  policyDecision: "allow" | "deny" | "audit";
  prevHash: string;
  entryHash: string;
  rawAction: string;
  contextSnapshot: Record<string, unknown>;
}> = {
  1: { agentDid: "did:pipeline:83a2388b", runId: "242f4052",      policyDecision: "allow", prevHash: "8e3a…b29c", entryHash: "f5d2…91a4", rawAction: "pipeline_completed:run:242f4052",                 contextSnapshot: { totalSteps: 4, completedSteps: 4 } },
  2: { agentDid: "did:agent:80c13590",   runId: "242f4052",      policyDecision: "allow", prevHash: "f5d2…91a4", entryHash: "a8b7…cc31", rawAction: "step_completed:80c13590-…:Alert Ingestion & Parser:run:242f4052", contextSnapshot: { stage: "Intake", durationMs: 12340 } },
  3: { agentDid: "did:pipeline:83a2388b", runId: "242f4052",      policyDecision: "deny",  prevHash: "a8b7…cc31", entryHash: "6c1e…0042", rawAction: "prompt_injection_check:user_prompt:run:242f4052:category:direct_override", contextSnapshot: { category: "direct_override", source: "user_prompt", textPreview: "Ignore all previous instructions and …" } },
  4: { agentDid: "did:pipeline:83a2388b", runId: "242f4052",      policyDecision: "allow", prevHash: "6c1e…0042", entryHash: "ddf3…22a9", rawAction: "tool_result:Agent:run:242f4052:1820ms",            contextSnapshot: { tool: "Agent", durationMs: 1820 } },
  5: { agentDid: "did:agent:80c13590",   runId: "242f4052",      policyDecision: "allow", prevHash: "ddf3…22a9", entryHash: "8901…0fef", rawAction: "subagent_stop:alert-ingestion-parser:run:242f4052", contextSnapshot: { agentType: "alert-ingestion-parser" } },
  6: { agentDid: "did:agent:80c13590",   runId: "242f4052",      policyDecision: "deny",  prevHash: "8901…0fef", entryHash: "ab10…ff21", rawAction: "tool_use:Bash:run:242f4052:reason:Sandbox policy: bash command matched a blocked pattern", contextSnapshot: { tool: "Bash", reason: "blocked_bash_pattern", commandPreview: "env | grep AWS_SECRET" } },
  7: { agentDid: "did:agent:80c13590",   runId: "242f4052",      policyDecision: "allow", prevHash: "ab10…ff21", entryHash: "2240…7b3e", rawAction: "tool_result:Write:run:242f4052:80ms",               contextSnapshot: { tool: "Write", filePath: "/workspace/parsed.json" } },
  8: { agentDid: "did:agent:80c13590",   runId: "242f4052",      policyDecision: "allow", prevHash: "2240…7b3e", entryHash: "5a91…d8c2", rawAction: "tool_use:Write:run:242f4052",                      contextSnapshot: { tool: "Write", filePath: "/workspace/parsed.json" } },
};
