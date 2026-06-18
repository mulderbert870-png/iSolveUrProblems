/**
 * M3.7 — E-signature provider abstraction.
 *
 * Modeled so a real provider (Dropbox Sign, DocuSign, etc.) can be
 * dropped in by implementing this single interface. The orchestrator
 * + draft route never see provider-specific details.
 *
 * Status vocabulary mirrors Dropbox Sign's enum but is generic enough
 * to cover the major providers.
 */

export type EsignEnvelopeStatus =
  | "draft"
  | "sent"
  | "awaiting_signature"
  | "signed"
  | "declined"
  | "cancelled"
  | "expired";

export type EsignSigner = {
  /** "user" or "contractor" — used for our internal accounting. */
  role: "user" | "contractor";
  name: string;
  email: string | null;
};

export type CreateEnvelopeInput = {
  /** Contract identifier on our side — used for webhook reconciliation. */
  contract_id: string;
  title: string;
  /** Plain-text body for the document. v1 mock uses this verbatim; real
   *  providers render it through their template engine. */
  body: string;
  signers: EsignSigner[];
  /** Where the user should land after signing. */
  return_url: string;
};

export type CreateEnvelopeResult =
  | {
      ok: true;
      envelope_id: string;
      status: EsignEnvelopeStatus;
      /** Pre-signed URL per signer. Empty string if signer has no email. */
      signing_url_by_role: Record<"user" | "contractor", string | null>;
    }
  | { ok: false; error: string };

export type ProviderName = "mock" | "dropbox_sign";

export interface EsignProvider {
  readonly name: ProviderName;
  readonly isConfigured: boolean;
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
}
