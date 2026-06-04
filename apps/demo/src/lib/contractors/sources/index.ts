import { mockAdapter } from "./mock";
import type { ContractorSourceAdapter } from "./types";

/**
 * Source registry. Selects which adapter to use based on env.
 *
 * Today's options:
 *   CONTRACTOR_DATA_SOURCE=mock     → mockAdapter (default — works without vendor)
 *   CONTRACTOR_DATA_SOURCE=serpapi  → serpapiAdapter (added when SG Dietz unblocks the API key)
 *
 * Adding a new source is a 2-line change: import + registry entry. The
 * orchestrator + every downstream feature (M2.2 search, M2.3 summarizer,
 * M2.4 recommendation) is source-agnostic.
 */
const REGISTRY: Record<string, ContractorSourceAdapter> = {
  mock: mockAdapter,
};

export function getContractorSource(): ContractorSourceAdapter {
  const choice = (process.env.CONTRACTOR_DATA_SOURCE ?? "mock").toLowerCase();
  const adapter = REGISTRY[choice];
  if (adapter && adapter.isConfigured) return adapter;
  // Fall back to mock so dev never breaks waiting on vendor keys.
  return mockAdapter;
}

export { mockAdapter };
export type { ContractorSourceAdapter };
