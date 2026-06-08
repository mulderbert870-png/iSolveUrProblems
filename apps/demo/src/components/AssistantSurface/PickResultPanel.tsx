"use client";

import { useTranslations } from "next-intl";
import type { PickResultPayload } from "../../lib/assistantSurface";

export function PickResultPanel({
  payload,
}: {
  payload: PickResultPayload;
}) {
  const t = useTranslations("assistant.surface.pickResult");
  return (
    <div className="flex flex-col gap-3 text-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-emerald-300">{t("title")}</h3>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {t("summary", {
            sent: payload.total_sent,
            failed: payload.total_failed,
          })}
        </span>
      </header>

      {payload.winner && (
        <div className="rounded-md bg-zinc-950/50 border border-zinc-800 p-3 flex flex-col gap-1">
          <div className="text-[11px] uppercase tracking-wide text-emerald-300">
            {t("winnerLabel")}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{payload.winner.name}</span>
            <span className="text-xs text-zinc-400 font-mono">
              {payload.winner.channel ?? "—"} ·{" "}
              {payload.winner.delivered
                ? t("delivered")
                : t("failed")}
            </span>
          </div>
          {payload.winner.error && (
            <div className="text-[11px] text-rose-300">
              {payload.winner.error}
            </div>
          )}
        </div>
      )}

      {payload.losers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] uppercase tracking-wide text-amber-300">
            {t("losersLabel", { count: payload.losers.length })}
          </div>
          <ul className="flex flex-col gap-1">
            {payload.losers.map((l) => (
              <li
                key={l.contractor_id}
                className="rounded-md bg-zinc-950/40 border border-zinc-800/60 px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{l.name}</span>
                <span className="text-zinc-400 font-mono shrink-0">
                  {l.channel ?? "—"} ·{" "}
                  {l.delivered ? t("delivered") : t("failed")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
