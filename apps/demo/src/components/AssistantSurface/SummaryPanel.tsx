"use client";

import { useTranslations } from "next-intl";
import type { SummaryPayload } from "../../lib/assistantSurface";

export function SummaryPanel({
  payload,
  cached,
}: {
  payload: SummaryPayload;
  cached: boolean;
}) {
  const t = useTranslations("assistant.surface.summary");
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-zinc-100">
          {payload.contractor_name}
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 shrink-0">
          {cached ? t("cached") : t("fresh")}
        </span>
      </div>

      <p className="text-zinc-200">{payload.summary}</p>

      {payload.strengths_md.trim() !== "" && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-emerald-300 mb-1">
            {t("strengths")}
          </h4>
          <pre className="whitespace-pre-wrap text-xs text-zinc-300 font-sans">
            {payload.strengths_md}
          </pre>
        </div>
      )}

      {payload.weaknesses_md.trim() !== "" && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-rose-300 mb-1">
            {t("weaknesses")}
          </h4>
          <pre className="whitespace-pre-wrap text-xs text-zinc-300 font-sans">
            {payload.weaknesses_md}
          </pre>
        </div>
      )}

      {payload.sample_quotes.length > 0 && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">
            {t("sampleQuotes")}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {payload.sample_quotes.map((q, i) => (
              <li
                key={i}
                className="text-xs text-zinc-300 border-l-2 border-zinc-700 pl-2"
              >
                <span className="text-zinc-500 mr-1">
                  {q.rating != null ? `★${q.rating}` : "—"}
                </span>
                &quot;{q.quote}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
