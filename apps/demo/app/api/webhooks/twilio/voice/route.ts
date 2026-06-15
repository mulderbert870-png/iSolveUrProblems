import { NextResponse, type NextRequest } from "next/server";
import {
  APP_PUBLIC_BASE_URL,
} from "../../../../api/secrets";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/voice (M3.1)
 *
 * Returns TwiML telling Twilio how each participant should behave once
 * their leg connects. The query string passes our internal call_id and
 * the participant role:
 *
 *   ?call_id=<uuid>&participant=user|contractor|six
 *
 * Behaviors:
 *   - user / contractor: join the Conference room named <call_id>,
 *     with start-on-enter so the conference begins the moment both
 *     join. end-on-leave makes the bridge tear down when either hangs
 *     up (the 6 leg is opted out of end-on-leave — see below).
 *   - six: also joins the same Conference but as a silent participant
 *     (muted-by-default + start-on-enter:false) so 6 hears both sides
 *     but isn't audible until our orchestrator injects a <Say> via the
 *     makeSixSpeak() REST update.
 *
 * The conference itself triggers `<Start><Transcription>` so Twilio's
 * built-in real-time STT POSTs each utterance back to
 * /api/webhooks/twilio/transcription. Recording happens automatically
 * (recordingStatusCallback hits /api/webhooks/twilio/recording).
 *
 * Q3.1c — 6 only speaks when addressed by name. Detection is done
 * server-side on incoming transcripts, not in TwiML.
 *
 * Returns Content-Type: text/xml — Twilio's required format.
 */

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === '"'
            ? "&quot;"
            : "&apos;",
  );
}

function callbackUrl(path: string): string {
  return `${APP_PUBLIC_BASE_URL.replace(/\/$/, "")}${path}`;
}

function buildTwiml(args: {
  callId: string;
  participant: "user" | "contractor";
}): string {
  const conferenceName = args.callId;
  const transcriptionUrl = callbackUrl(
    `/api/webhooks/twilio/transcription?call_id=${args.callId}`,
  );
  const recordingCallback = callbackUrl(
    `/api/webhooks/twilio/recording?call_id=${args.callId}`,
  );
  const statusCallback = callbackUrl(
    `/api/webhooks/twilio/status?call_id=${args.callId}`,
  );

  const conferenceAttrs = [
    `startConferenceOnEnter="true"`,
    `endConferenceOnExit="true"`,
    // Only attach STT + recording once — on the FIRST participant.
    // We pick the user leg because it always exists (the contractor leg
    // can fail to connect; recording attached to a failed leg never
    // starts).
    args.participant === "user" ? `record="record-from-start"` : "",
    args.participant === "user"
      ? `recordingStatusCallback="${escapeXml(recordingCallback)}"`
      : "",
    args.participant === "user" ? `recordingStatusCallbackEvent="completed"` : "",
    `statusCallback="${escapeXml(statusCallback)}"`,
    `statusCallbackEvent="start end join leave"`,
    `waitUrl=""`, // skip Twilio's default hold music
  ]
    .filter((s) => s.length > 0)
    .join(" ");

  // <Start><Transcription> attaches to the leg, not the conference, but
  // Twilio applies the transcript to whatever audio the leg hears, which
  // for a conference participant is both sides. Attach to the user leg
  // only — Twilio dedupes if we tried to attach on both.
  const transcriptionVerb =
    args.participant === "user"
      ? `<Start><Transcription statusCallbackUrl="${escapeXml(
          transcriptionUrl,
        )}" inboundTrackLabel="homeowner" outboundTrackLabel="conference" /></Start>`
      : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    transcriptionVerb,
    `<Dial>`,
    `<Conference ${conferenceAttrs}>${escapeXml(conferenceName)}</Conference>`,
    `</Dial>`,
    `</Response>`,
  ].join("");
}

function badTwiml(error: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `<Say voice="Polly.Joanna-Neural">Sorry, this call could not be connected. ${escapeXml(error)}</Say>`,
    `<Hangup />`,
    `</Response>`,
  ].join("");
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("call_id") ?? "";
  const participantRaw = searchParams.get("participant") ?? "";

  if (!callId) {
    return new NextResponse(badTwiml("missing call id"), {
      status: 200, // Twilio always wants 200 + TwiML
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
  if (participantRaw !== "user" && participantRaw !== "contractor") {
    return new NextResponse(badTwiml("unknown participant"), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const twiml = buildTwiml({ callId, participant: participantRaw });
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

// Twilio sometimes uses GET (notably during <Redirect>). Mirror the POST.
export const GET = POST;
