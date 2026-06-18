"use client";

import { useTranslations } from "next-intl";
import type { AppointmentSurfacePayload } from "../../lib/assistantSurface";

/**
 * M3.4 + M3.5 — Appointment confirmation / list panel.
 *
 * Renders 1 or N upcoming appointments. Header copy varies by intent:
 *   - "scheduled"   → "Appointment scheduled"
 *   - "rescheduled" → "Appointment moved"
 *   - "cancelled"   → "Appointment cancelled"
 *   - "list"        → "Upcoming appointments"
 */
export function AppointmentPanel({
  payload,
}: {
  payload: AppointmentSurfacePayload;
}) {
  const t = useTranslations("assistant.surface.appointment");

  if (payload.appointments.length === 0) {
    return <p className="text-sm text-zinc-400">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">
        {t(`header.${payload.intent_kind}`)}
      </p>
      <ul className="flex flex-col gap-2">
        {payload.appointments.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm">
                {a.contractor_name ?? t("withSomeone")}
              </h3>
              <span className="text-[11px] text-zinc-400 font-mono shrink-0">
                {a.duration_minutes}m
              </span>
            </div>
            <div className="text-sm text-amber-200">{a.scheduled_when_text}</div>
            {a.agenda.trim() !== "" && (
              <p className="text-xs text-zinc-300">{a.agenda}</p>
            )}
            {a.status === "cancelled" && (
              <span className="text-[11px] text-rose-300">
                {t("status.cancelled")}
              </span>
            )}
            {a.status === "rescheduled" && (
              <span className="text-[11px] text-sky-300">
                {t("status.rescheduled")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
