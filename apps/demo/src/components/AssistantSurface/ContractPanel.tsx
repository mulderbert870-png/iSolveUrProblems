"use client";

import { useTranslations } from "next-intl";
import type { ContractPayload } from "../../lib/assistantSurface";

/**
 * M3.7 — Contract drafter / e-signature panel.
 *
 * Shown after 6 drafts a work agreement on the user's behalf. Renders the
 * contractor, scope, amount + platform fee breakdown, and the current
 * envelope status. When the provider returns signing URLs we expose them
 * as "open in tab" links — for the mock provider these are placeholders;
 * for Dropbox Sign they'll be live signing pages.
 */

function formatCents(cents: number, currency: string): string {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amt);
  } catch {
    return `$${amt.toFixed(2)}`;
  }
}

export function ContractPanel({ payload }: { payload: ContractPayload }) {
  const t = useTranslations("assistant.surface.contract");
  const { envelope } = payload;

  const statusKey =
    envelope.status === "signed"
      ? "status.signed"
      : envelope.status === "awaiting_signature" || envelope.status === "sent"
        ? "status.awaiting"
        : envelope.status === "declined"
          ? "status.declined"
          : envelope.status === "cancelled"
            ? "status.cancelled"
            : envelope.status === "expired"
              ? "status.expired"
              : "status.draft";

  const statusToneClass =
    envelope.status === "signed"
      ? "text-emerald-300"
      : envelope.status === "declined" ||
          envelope.status === "cancelled" ||
          envelope.status === "expired"
        ? "text-rose-300"
        : "text-amber-300";

  return (
    <div className="flex flex-col gap-3 text-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-emerald-300">{t("title")}</h3>
        <span
          className={
            "text-[10px] uppercase tracking-wide font-mono " + statusToneClass
          }
        >
          {t(statusKey)}
        </span>
      </header>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            {t("contractorLabel")}
          </span>
          <span className="font-semibold text-zinc-100">
            {payload.contractor_name}
          </span>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            {t("scopeLabel")}
          </div>
          <p className="text-zinc-200 leading-snug">{payload.scope}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-md bg-zinc-900/60 border border-zinc-800 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t("amountLabel")}
            </div>
            <div className="font-mono text-zinc-100">
              {formatCents(payload.amount_cents, payload.currency)}
            </div>
          </div>
          <div className="rounded-md bg-zinc-900/60 border border-zinc-800 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t("platformFeeLabel")}
            </div>
            <div className="font-mono text-zinc-100">
              {formatCents(payload.platform_fee_cents, payload.currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {envelope.signing_url_user && (
          <a
            href={envelope.signing_url_user}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-zinc-950 text-sm font-semibold px-3 py-2 text-center"
          >
            {t("signUserCta")}
          </a>
        )}
        {envelope.signing_url_contractor && (
          <a
            href={envelope.signing_url_contractor}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs px-3 py-2 text-center"
          >
            {t("signContractorCta")}
          </a>
        )}
      </div>

      <div className="text-[10px] text-zinc-500 font-mono">
        {t("envelopeId", { id: envelope.envelope_id })}
        {" · "}
        {t("provider", { name: envelope.provider })}
      </div>
    </div>
  );
}
