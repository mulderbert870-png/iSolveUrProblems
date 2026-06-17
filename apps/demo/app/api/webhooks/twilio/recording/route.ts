import { NextResponse, type NextRequest } from "next/server";
import {
  getCallById,
  mirrorTwilioRecordingToStorage,
  patchCall,
} from "../../../../../src/lib/calls";
import { verifyTwilioRequest } from "../../../../../src/lib/twilioSig";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/webhooks/twilio/recording (M3.3)
 *
 * Twilio fires this after the conference recording is finalized. Form
 * fields:
 *
 *   RecordingSid
 *   RecordingUrl       — base URL; needs .mp3 / .wav suffix
 *   RecordingDuration  — seconds
 *   RecordingStatus    — "completed" / "failed"
 *
 * We mirror the audio into Supabase Storage so we own the artifact.
 */

export async function POST(request: NextRequest) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return new NextResponse("", { status: 200 });
  }

  const verified = await verifyTwilioRequest({ request, formParams: form });
  if (!verified.ok) {
    return new NextResponse("", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("call_id") ?? "";
  if (!callId) return new NextResponse("", { status: 200 });

  const recordingSid = form.get("RecordingSid") ?? "";
  const recordingUrl = form.get("RecordingUrl") ?? "";
  const durationStr = form.get("RecordingDuration") ?? "";
  const status = (form.get("RecordingStatus") ?? "").toLowerCase();
  if (status !== "completed" || !recordingUrl) {
    // Not ready yet; nothing to mirror.
    return new NextResponse("", { status: 200 });
  }

  const call = await getCallById(callId).catch(() => null);
  if (!call) return new NextResponse("", { status: 200 });

  // Mirror into Supabase Storage (best-effort — failures are logged).
  const objectPath = await mirrorTwilioRecordingToStorage({
    call_id: callId,
    twilio_recording_url: recordingUrl,
    ext: "mp3",
  });

  await patchCall(callId, {
    twilio_recording_sid: recordingSid || null,
    twilio_recording_url: recordingUrl,
    storage_recording_path: objectPath,
    recording_duration_s: durationStr ? parseInt(durationStr, 10) || null : null,
  });

  return new NextResponse("", { status: 200 });
}
