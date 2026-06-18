import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedOrigin } from "../../../../src/lib/apiRouteSecurity";
import { getUserId } from "../../../../src/lib/auth/getUser";
import {
  getCallById,
  signCallRecordingUrl,
} from "../../../../src/lib/calls";
import { getRecentTranscriptForSession } from "../../../../src/lib/transcripts/store";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";
import type {
  CallPayload,
  CallTranscriptLine,
} from "../../../../src/lib/assistantSurface";

export const dynamic = "force-dynamic";

/**
 * GET /api/calls/[id]  (M3.1)
 *
 * Returns the full CallPayload for the drawer to render. Used by the
 * CallPanel polling loop while a call is dialing or in-progress.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchContractorName(
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/contractors?id=eq.${encodeURIComponent(id)}&select=name&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ name: string }>;
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function findEstimateForCall(call_id: string): Promise<string | null> {
  try {
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const res = await fetch(
      `${url}/rest/v1/estimates?call_id=eq.${encodeURIComponent(call_id)}&select=id&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "sign-in required" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const call = await getCallById(id);
  if (!call) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (call.user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [contractorName, transcripts, estimateId] = await Promise.all([
    fetchContractorName(call.contractor_id),
    getRecentTranscriptForSession({ session_id: call.id, limit: 200 }),
    findEstimateForCall(call.id),
  ]);

  const recording_signed_url = call.storage_recording_path
    ? await signCallRecordingUrl(call.storage_recording_path).catch(() => null)
    : null;

  const transcript: CallTranscriptLine[] = transcripts.map((t) => ({
    id: t.id,
    speaker:
      t.speaker === "user" ||
      t.speaker === "contractor" ||
      t.speaker === "six" ||
      t.speaker === "system"
        ? t.speaker
        : "system",
    text: t.text,
    created_at: t.created_at,
  }));

  const payload: CallPayload = {
    call_id: call.id,
    status: call.status,
    contractor_name: contractorName,
    contractor_phone: call.to_contractor_phone,
    user_phone: call.to_user_phone,
    transcript,
    recording_signed_url,
    estimate_id: estimateId,
    started_at: call.started_at,
    ended_at: call.ended_at,
  };

  return NextResponse.json(payload);
}
