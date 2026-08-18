import { service1Client } from "../api";
import {
  overview,
  auditRows,
  auditDetails,
  pipelines,
  allTenantTools,
  policyRules,
  blockedPatterns,
  confidenceGates,
  compliance,
  slo,
} from "./fixtures";

// Governance API surface. In dev, service1Client proxies /proxy/service1/* to
// the backend (see vite.config + src/lib/api.ts). Each fetch falls back to the
// bundled fixtures so the dashboard renders out of the box with no backend.
const BASE = "/api/v1/governance";

async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    const { data } = await service1Client.get<T>(`${BASE}${path}`);
    return data;
  } catch (err) {
    console.warn(`[governance] backend unavailable for ${path}; using bundled fixtures.`, err);
    return fallback;
  }
}

export const fetchOverview   = () => load("/overview", overview);
export const fetchAudit      = () => load("/audit", { rows: auditRows, details: auditDetails });
export const fetchFleet      = () => load("/fleet", { pipelines, allTenantTools });
export const fetchPolicies   = () => load("/policies", { rules: policyRules, blockedPatterns, confidenceGates });
export const fetchCompliance = () => load("/compliance", compliance);
export const fetchSlo        = () => load("/slo", slo);
