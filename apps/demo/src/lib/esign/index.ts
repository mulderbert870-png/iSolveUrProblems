import { mockEsignProvider } from "./providers/mock";
import type { EsignProvider, ProviderName } from "./types";

export type {
  EsignEnvelopeStatus,
  EsignSigner,
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EsignProvider,
  ProviderName,
} from "./types";

/**
 * M3.7 — Provider registry.
 *
 * Today's options:
 *   ESIGN_PROVIDER=mock          → mockEsignProvider (default, no vendor)
 *   ESIGN_PROVIDER=dropbox_sign  → dropboxSignProvider (when key handed over)
 *
 * Selection is env-driven so swapping for a real provider is a 1-line
 * change in `.env`. The orchestrator and routes never branch on
 * provider name — they call `getEsignProvider().createEnvelope(...)`.
 */
const REGISTRY: Record<string, EsignProvider> = {
  mock: mockEsignProvider,
};

export function getEsignProvider(): EsignProvider {
  const choice = (process.env.ESIGN_PROVIDER ?? "mock").toLowerCase();
  const provider = REGISTRY[choice];
  if (provider && provider.isConfigured) return provider;
  // Fall back to mock so dev never breaks waiting on vendor keys.
  return mockEsignProvider;
}

export function getProviderNameFromEnv(): ProviderName {
  const choice = (process.env.ESIGN_PROVIDER ?? "mock").toLowerCase();
  return choice === "dropbox_sign" ? "dropbox_sign" : "mock";
}
