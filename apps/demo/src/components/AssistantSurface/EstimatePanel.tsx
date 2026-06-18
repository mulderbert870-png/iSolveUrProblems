"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAssistantSurface,
  type EstimatePayload,
} from "../../lib/assistantSurface";

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/**
 * M3.6 — Voice-generated estimate panel.
 *
 * Shows the line-item breakdown the M3.6 extractor pulled from a call.
 * "Send to contractor" button triggers M3.7 contract drafting using the
 * estimate's total + scope summary.
 */
export function EstimatePanel({ payload }: { payload: EstimatePayload }) {
  const t = useTranslations("assistant.surface.estimate");
  const showContract = useAssistantSurface((s) => s.showContract);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnIntoContract() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${payload.estimate_id}/to-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setError((await res.text()).slice(0, 200));
        return;
      }
      const data = (await res.json()) as {
        contract: {
          contract_id: string;
          contractor_name: string;
          scope: string;
          amount_cents: number;
          platform_fee_cents: number;
          currency: string;
          envelope: {
            provider: "mock" | "dropbox_sign";
            envelope_id: string;
            status:
              | "draft"
              | "sent"
              | "awaiting_signature"
              | "signed"
              | "declined"
              | "cancelled"
              | "expired";
            signing_url_user: string | null;
            signing_url_contractor: string | null;
          };
        };
      };
      showContract(data.contract);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-emerald-300">{t("title")}</h3>
        <span className="text-[10px] uppercase tracking-wide font-mono text-amber-300">
          {t(`status.${payload.status}`)}
        </span>
      </header>

      {payload.contractor_name && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            {t("contractorLabel")}
          </span>
          <span className="font-semibold text-zinc-100">
            {payload.contractor_name}
          </span>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("scopeLabel")}
        </span>
        <p className="text-zinc-200 leading-snug">
          {payload.scope_summary || t("scopeEmpty")}
        </p>
      </div>

      {payload.line_items.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">{t("noLineItems")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="text-left pb-1">{t("colDescription")}</th>
              <th className="text-right pb-1">{t("colQty")}</th>
              <th className="text-right pb-1">{t("colUnitPrice")}</th>
              <th className="text-right pb-1">{t("colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {payload.line_items.map((li, i) => (
              <tr
                key={i}
                className="border-t border-zinc-800/60 text-zinc-200"
              >
                <td className="py-1 pr-1">{li.description}</td>
                <td className="py-1 text-right font-mono">
                  {li.quantity} {li.unit}
                </td>
                <td className="py-1 text-right font-mono">
                  {formatCents(li.unit_price_cents, payload.currency)}
                </td>
                <td className="py-1 text-right font-mono">
                  {formatCents(li.total_cents, payload.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500">{t("subtotalLabel")}</span>
          <span className="font-mono text-zinc-100">
            {formatCents(payload.subtotal_cents, payload.currency)}
          </span>
        </div>
        {payload.tax_cents > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-500">{t("taxLabel")}</span>
            <span className="font-mono text-zinc-100">
              {formatCents(payload.tax_cents, payload.currency)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1">
          <span className="font-semibold text-zinc-100">
            {t("totalLabel")}
          </span>
          <span className="font-mono font-semibold text-emerald-300">
            {formatCents(payload.total_cents, payload.currency)}
          </span>
        </div>
      </div>

      {payload.line_items.length > 0 && payload.status === "draft" && (
        <button
          type="button"
          onClick={turnIntoContract}
          disabled={busy}
          className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 text-sm font-semibold px-3 py-2"
        >
          {busy ? t("draftingContract") : t("turnIntoContractCta")}
        </button>
      )}

      {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
    </div>
  );
}
