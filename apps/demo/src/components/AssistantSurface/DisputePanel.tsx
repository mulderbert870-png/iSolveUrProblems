"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAssistantSurface,
  type DisputePayload,
  type DisputeThreadMessage,
} from "../../lib/assistantSurface";

/**
 * M3.9 — Dispute thread panel.
 *
 * Renders the running async-text thread between the user and 6 (mediator).
 * The most recent mediator turn carries either:
 *   - a remedy_proposal (renders Accept + Get a human buttons)
 *   - an escalation_notice (renders the admin handoff banner)
 *   - a plain message (renders a free-form reply input)
 *
 * The panel POSTs to /api/disputes/[id]/messages on send and to
 * /api/disputes/[id]/resolve on Accept / Get a human. After each round
 * we refresh by mutating the store payload locally — no whole-page
 * reload.
 */

export function DisputePanel({ payload }: { payload: DisputePayload }) {
  const t = useTranslations("assistant.surface.dispute");
  const showDispute = useAssistantSurface((s) => s.showDispute);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isClosed =
    payload.status === "resolved" ||
    payload.status === "escalated" ||
    payload.status === "closed";
  const latestMediator = [...payload.messages]
    .reverse()
    .find((m) => m.sender === "mediator");
  const remedyProposal = latestMediator?.proposed_resolution;

  async function sendReply() {
    if (busy) return;
    const text = replyText.trim();
    if (text === "") return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/disputes/${payload.dispute_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const err = await res.text();
        setErrorMsg(err.slice(0, 200));
        return;
      }
      const data = (await res.json()) as {
        user_message: { id: string; body: string };
        mediator_message: {
          id: string;
          body: string;
          kind: DisputeThreadMessage["kind"];
        } | null;
        status: DisputePayload["status"];
        escalated: boolean;
      };
      const nowIso = new Date().toISOString();
      const newMessages: DisputeThreadMessage[] = [
        ...payload.messages,
        {
          id: data.user_message.id,
          sender: "user",
          body: data.user_message.body,
          kind: "message",
          created_at: nowIso,
        },
      ];
      if (data.mediator_message) {
        newMessages.push({
          id: data.mediator_message.id,
          sender: "mediator",
          body: data.mediator_message.body,
          kind: data.mediator_message.kind,
          created_at: nowIso,
        });
      }
      showDispute({
        ...payload,
        status: data.status,
        messages: newMessages,
      });
      setReplyText("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "send failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolveDispute(
    action: "accept" | "escalate",
    body?: { kind?: string; summary?: string; reason?: string },
  ) {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/disputes/${payload.dispute_id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        const err = await res.text();
        setErrorMsg(err.slice(0, 200));
        return;
      }
      const data = (await res.json()) as {
        status: DisputePayload["status"];
      };
      showDispute({ ...payload, status: data.status });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-rose-300">{t("title")}</h3>
        <span
          className={
            "text-[10px] uppercase tracking-wide font-mono " +
            (payload.status === "escalated"
              ? "text-rose-300"
              : payload.status === "resolved"
                ? "text-emerald-300"
                : "text-amber-300")
          }
        >
          {t(`status.${payload.status}`)}
        </span>
      </header>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-1.5">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
          {t("complaintLabel")}
        </div>
        <p className="text-zinc-100 leading-snug">{payload.complaint}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {payload.contractor_name && (
            <span className="text-[11px] rounded bg-zinc-900 px-2 py-0.5 text-zinc-300">
              {t("contractorPrefix")} {payload.contractor_name}
            </span>
          )}
          {payload.disputed_amount_cents != null && (
            <span className="text-[11px] rounded bg-zinc-900 px-2 py-0.5 font-mono text-zinc-300">
              ${(payload.disputed_amount_cents / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {payload.messages.map((m) => (
          <li
            key={m.id}
            className={
              "rounded-lg border p-2.5 flex flex-col gap-1 " +
              (m.sender === "mediator"
                ? "bg-zinc-900/60 border-zinc-800"
                : m.sender === "user"
                  ? "bg-emerald-900/20 border-emerald-900/40 self-end max-w-[85%]"
                  : "bg-zinc-950/60 border-zinc-800/60")
            }
          >
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t(`sender.${m.sender}`)}
              {m.kind !== "message" && (
                <span className="ml-1 text-amber-300">
                  · {t(`kind.${m.kind}`)}
                </span>
              )}
            </div>
            <p className="text-zinc-100 leading-snug whitespace-pre-wrap">
              {m.body}
            </p>
          </li>
        ))}
      </ul>

      {!isClosed && remedyProposal && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wide text-amber-300">
            {t("proposalLabel")}
          </div>
          <p className="text-zinc-100 text-sm">{remedyProposal.summary}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                resolveDispute("accept", {
                  kind: remedyProposal.resolution_kind,
                  summary: remedyProposal.summary,
                })
              }
              className="flex-1 rounded-md bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 text-sm font-semibold px-3 py-2"
            >
              {t("acceptCta")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                resolveDispute("escalate", {
                  reason: "user_declined_proposal",
                })
              }
              className="flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm px-3 py-2"
            >
              {t("escalateCta")}
            </button>
          </div>
        </div>
      )}

      {!isClosed && (
        <div className="flex flex-col gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("replyPlaceholder")}
            rows={2}
            className="rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendReply}
              disabled={busy || replyText.trim() === ""}
              className="flex-1 rounded-md bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 text-sm font-semibold px-3 py-2"
            >
              {busy ? t("sending") : t("sendCta")}
            </button>
            <button
              type="button"
              onClick={() =>
                resolveDispute("escalate", { reason: "user_requested_human" })
              }
              disabled={busy}
              className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm px-3 py-2"
              title={t("escalateTooltip")}
            >
              {t("escalateShort")}
            </button>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs text-zinc-300">
          {t(`closedNote.${payload.status}`)}
        </div>
      )}

      {errorMsg && (
        <p className="text-xs text-rose-300 font-mono">{errorMsg}</p>
      )}
    </div>
  );
}
