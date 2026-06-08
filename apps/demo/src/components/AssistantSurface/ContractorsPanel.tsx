"use client";

import { useTranslations } from "next-intl";
import type { ContractorCard } from "../../lib/assistantSurface";

function priceTierGlyph(tier: number | null): string {
  if (!tier || tier < 1) return "—";
  return "$".repeat(Math.min(4, Math.max(1, tier)));
}

export function ContractorsPanel({
  hits,
  totalConsidered,
}: {
  hits: ContractorCard[];
  totalConsidered: number;
}) {
  const t = useTranslations("assistant.surface.contractors");

  if (hits.length === 0) {
    return (
      <p className="text-sm text-zinc-400">{t("empty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-400">
        {t("count", { shown: hits.length, considered: totalConsidered })}
      </p>
      <ul className="flex flex-col gap-2">
        {hits.map((hit) => (
          <li
            key={hit.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm">{hit.name}</h3>
              <span className="text-[11px] text-zinc-400 font-mono shrink-0">
                {hit.rating_avg != null
                  ? `★ ${hit.rating_avg.toFixed(1)}`
                  : "★ —"}
                {hit.rating_count != null ? ` (${hit.rating_count})` : ""}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              {hit.distance_km.toFixed(1)} km · {priceTierGlyph(hit.price_tier)}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {hit.licensed_flag && (
                <span className="rounded bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5">
                  {t("badge.licensed")}
                </span>
              )}
              {hit.same_day_flag && (
                <span className="rounded bg-sky-500/15 text-sky-300 px-1.5 py-0.5">
                  {t("badge.sameDay")}
                </span>
              )}
              {hit.locally_owned && (
                <span className="rounded bg-amber-500/15 text-amber-300 px-1.5 py-0.5">
                  {t("badge.locallyOwned")}
                </span>
              )}
            </div>
            {(hit.phone || hit.website) && (
              <div className="flex flex-wrap gap-2 text-[11px] text-zinc-300">
                {hit.phone && (
                  <a
                    href={`tel:${hit.phone}`}
                    className="underline hover:text-amber-300"
                  >
                    {hit.phone}
                  </a>
                )}
                {hit.website && (
                  <a
                    href={hit.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline hover:text-amber-300"
                  >
                    {t("website")}
                  </a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
