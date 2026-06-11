import { randomUUID } from "node:crypto";
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  EsignProvider,
} from "../types";

/**
 * M3.7 — Mock e-sign provider.
 *
 * For the M3.0d test drive: returns an envelope marked `signed`
 * immediately, so 6 can verbally confirm the contract is "signed and
 * delivered" without waiting on a real e-sign flow. Once SG Dietz hands
 * over Dropbox Sign sandbox keys, replace this with the real provider
 * in `providers/dropbox-sign.ts` and update `index.ts`'s registry.
 *
 * The mock signing URL is a placeholder string — the test drive's
 * surface panel renders it as a "(simulated)" link.
 */
class MockEsignProvider implements EsignProvider {
  readonly name = "mock" as const;
  readonly isConfigured = true;

  async createEnvelope(
    input: CreateEnvelopeInput,
  ): Promise<CreateEnvelopeResult> {
    const envelopeId = `mock_env_${randomUUID()}`;
    const signing_url_by_role: Record<"user" | "contractor", string | null> = {
      user: null,
      contractor: null,
    };
    for (const signer of input.signers) {
      signing_url_by_role[signer.role] = signer.email
        ? `https://example.com/mock-sign/${envelopeId}?role=${signer.role}`
        : null;
    }
    return {
      ok: true,
      envelope_id: envelopeId,
      // v1 mock auto-signs so the M3.0d voice flow can demonstrate the
      // full loop without waiting on a real provider.
      status: "signed",
      signing_url_by_role,
    };
  }
}

export const mockEsignProvider = new MockEsignProvider();
