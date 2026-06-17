import { NextResponse, type NextRequest } from "next/server";
import {
  getCallById,
  patchCall,
  setCallStatus,
} from "../../../../../src/lib/calls";
import { verifyTwilioRequest } from "../../../../../src/lib/twilioSig";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/status (M3.1)
 *
 * Twilio call + conference status callbacks. Form fields vary by event:
 *
 *   Call-level (set via StatusCallback on Calls.create):
 *     CallSid, CallStatus, CallDuration, From, To
 *
 *   Conference-level (set via statusCallback on the <Conference> verb):
 *     ConferenceSid, StatusCallbackEvent ("conference-start" / "conference-end"
 *     / "participant-join" / "participant-leave"), FriendlyName (our call_id)
 *
 * We use these to:
 *   - Capture the ConferenceSid on conference-start (needed to end the
 *     conference later if 6 wants to hang up)
 *   - Update calls.status based on the consolidated call state
 *
 * Twilio expects 2xx + (optionally) TwiML. We return empty 200.
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
  // call_id may be passed via query (we put it on the StatusCallback URL
  // for conference events) — for per-leg events, we look up by Call SID.
  const callIdFromQuery = searchParams.get("call_id") ?? "";

  // Conference-level events.
  const conferenceSid = form.get("ConferenceSid");
  const conferenceEvent = form.get("StatusCallbackEvent");
  const friendlyName = form.get("FriendlyName");

  if (conferenceSid && conferenceEvent && friendlyName) {
    const callId = friendlyName; // we set FriendlyName = call.id
    const call = await getCallById(callId).catch(() => null);
    if (call) {
      if (
        conferenceEvent === "conference-start" ||
        conferenceEvent === "participant-join"
      ) {
        await patchCall(callId, {
          twilio_conference_sid: conferenceSid,
          status: call.status === "in_progress" ? call.status : "in_progress",
          started_at: call.started_at ?? new Date().toISOString(),
        });
      } else if (conferenceEvent === "conference-end") {
        await setCallStatus(callId, "completed");
      }
    }
    return new NextResponse("", { status: 200 });
  }

  // Per-leg call status events.
  const callStatus = (form.get("CallStatus") ?? "").toLowerCase();
  const callSid = form.get("CallSid");
  if (!callSid) return new NextResponse("", { status: 200 });

  // Use call_id from query if present, otherwise look up by SID.
  let callId = callIdFromQuery;
  if (!callId) {
    // Try each SID column.
    const { getCallByTwilioSid } = await import("../../../../../src/lib/calls");
    const fromUser = await getCallByTwilioSid({
      participant: "user",
      sid: callSid,
    }).catch(() => null);
    const fromContractor =
      fromUser ??
      (await getCallByTwilioSid({
        participant: "contractor",
        sid: callSid,
      }).catch(() => null));
    const fromSix =
      fromContractor ??
      (await getCallByTwilioSid({
        participant: "six",
        sid: callSid,
      }).catch(() => null));
    if (fromSix) callId = fromSix.id;
  }
  if (!callId) return new NextResponse("", { status: 200 });

  const call = await getCallById(callId).catch(() => null);
  if (!call) return new NextResponse("", { status: 200 });

  // Only progress the row status — don't downgrade from in_progress
  // back to ringing because one leg is still dialing.
  if (callStatus === "in-progress" && call.status === "dialing") {
    await patchCall(callId, {
      status: "in_progress",
      started_at: call.started_at ?? new Date().toISOString(),
    });
  } else if (callStatus === "completed") {
    // Don't immediately complete — wait for conference-end. The "user"
    // leg ending could mean they hung up, in which case Twilio's
    // endConferenceOnExit=true tears down the conference anyway.
    if (
      callSid === call.twilio_call_sid_user ||
      callSid === call.twilio_call_sid_contractor
    ) {
      await setCallStatus(callId, "completed");
    }
  } else if (callStatus === "failed") {
    await setCallStatus(callId, "failed");
  } else if (callStatus === "no-answer") {
    await setCallStatus(callId, "no_answer");
  } else if (callStatus === "busy") {
    await setCallStatus(callId, "busy");
  } else if (callStatus === "canceled") {
    await setCallStatus(callId, "cancelled");
  }

  return new NextResponse("", { status: 200 });
}
