import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { TranscriptRow, TranscriptSpeaker } from "./types";

/**
 * M3.0c — Transcript persistence helpers.
 *
 * Service-role only. The `transcripts` table has RLS locked; reads and
 * writes go through these helpers and the API routes that wrap them.
 */

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export async function appendTranscript(args: {
  user_id: string | null;
  session_id: string;
  speaker: TranscriptSpeaker;
  text: string;
  context?: Record<string, unknown>;
}): Promise<{ id: string } | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const row = {
    user_id: args.user_id,
    session_id: args.session_id,
    speaker: args.speaker,
    text: args.text,
    context: args.context ?? {},
  };
  const res = await fetch(`${url}/rest/v1/transcripts`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    console.error(
      "transcripts insert failed:",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0] ?? null;
}

/**
 * Most recent N transcripts for a session, oldest-first. Used by the
 * M3.0e intent classifier to ground a current utterance in recent
 * conversation context, and by the M3.9 dispute mediator to reconstruct
 * what was said.
 */
export async function getRecentTranscriptForSession(args: {
  session_id: string;
  limit?: number;
}): Promise<TranscriptRow[]> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 200);
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const qs = new URLSearchParams();
  qs.set("session_id", `eq.${args.session_id}`);
  qs.set("select", "*");
  qs.set("order", "created_at.desc");
  qs.set("limit", String(limit));
  const res = await fetch(`${url}/rest/v1/transcripts?${qs.toString()}`, {
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as TranscriptRow[];
  // Caller wants oldest-first chronological; the index sorts desc, so reverse.
  return rows.reverse();
}
