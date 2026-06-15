import { NextResponse, type NextRequest } from "next/server";
import { OPENAI_API_KEY } from "../../../../api/secrets";
import { appendTranscript } from "../../../../../src/lib/transcripts/store";
import {
  getCallById,
  makeSixSpeak,
  patchCall,
} from "../../../../../src/lib/calls";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/webhooks/twilio/transcription (M3.1)
 *
 * Twilio's built-in real-time transcription POSTs here whenever a
 * speaker on the conference finalizes an utterance. Body is x-www-form-
 * urlencoded with at minimum:
 *
 *   TranscriptionEvent       — "transcription-started" | "transcription-content" | "transcription-stopped"
 *   TranscriptionText        — the final text (only present on "transcription-content")
 *   Track                    — "inbound" (homeowner) | "outbound" (contractor)
 *   CallSid                  — the leg whose audio was transcribed
 *   ConferenceSid?           — when transcription is attached to a conference
 *
 * Plus the query-string `call_id` we passed in the TranscriptionUrl.
 *
 * What we do:
 *   1. Map Track to speaker (homeowner=user, contractor=contractor)
 *   2. Persist to transcripts table with session_id = call_id
 *   3. Q3.1c wake-word check on the user's transcript — if it starts
 *      with "hey 6" / "ok 6" etc., run the orchestrator and inject
 *      6's spoken reply into the conference via Twilio REST.
 *
 * Twilio expects a 2xx response with empty body. Any TwiML returned is
 * ignored for transcription webhooks.
 */

const WAKE_WORD_RE =
  /^\s*(?:hey|hi|hello|ok(?:ay)?|yo)\s+(?:6|six|sixty)\b[,.!?\s-]*/i;

function stripWakeWord(text: string): string {
  return text.replace(WAKE_WORD_RE, "").trim();
}

export async function POST(request: NextRequest) {
  let form: URLSearchParams;
  try {
    const raw = await request.text();
    form = new URLSearchParams(raw);
  } catch {
    return new NextResponse("", { status: 200 });
  }

  const event = form.get("TranscriptionEvent") ?? "";
  if (event !== "transcription-content") {
    // Setup / teardown events — nothing to do.
    return new NextResponse("", { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("call_id") ?? "";
  const text = (form.get("TranscriptionText") ?? "").trim();
  const trackRaw = (form.get("Track") ?? "").toLowerCase();
  // Twilio's Track values vary by configuration. Map both standard and
  // our custom labels (set in voice/route.ts: inboundTrackLabel="homeowner",
  // outboundTrackLabel="conference").
  const speaker: "user" | "contractor" =
    trackRaw === "inbound" ||
    trackRaw === "inbound_track" ||
    trackRaw === "homeowner"
      ? "user"
      : "contractor";

  if (!callId || text === "") {
    return new NextResponse("", { status: 200 });
  }

  const call = await getCallById(callId).catch(() => null);
  if (!call) return new NextResponse("", { status: 200 });

  // 1. Persist to transcripts table.
  await appendTranscript({
    user_id: call.user_id,
    session_id: callId,
    speaker,
    text,
    context: { source: "twilio_transcription", track: trackRaw },
  }).catch(() => null);

  // 2. Mark call as in_progress on first transcript.
  if (call.status === "dialing" || call.status === "queued") {
    await patchCall(callId, {
      status: "in_progress",
      started_at: new Date().toISOString(),
    }).catch(() => null);
  }

  // 3. Q3.1c wake-word — only the homeowner triggers 6. We deliberately
  //    do NOT classify contractor speech (contractors aren't expected to
  //    address 6 in v1; the homeowner orchestrates).
  if (speaker === "user" && WAKE_WORD_RE.test(text)) {
    const askedOf6 = stripWakeWord(text);
    if (askedOf6.length > 0 && !call.six_speaking && call.twilio_call_sid_six) {
      // Fire 6's reply asynchronously — we don't block the webhook on
      // the orchestrator + Twilio update. The orchestrator runs through
      // the existing /api/transcripts/append flow? No — that's the
      // browser/avatar path. Here we go directly to the orchestrator.
      handleSixWakeWord({
        call,
        userMessage: askedOf6,
      }).catch((e) => {
        console.warn("[twilio/transcription] six wake-word failed:", e);
      });
    }
  }

  return new NextResponse("", { status: 200 });
}

/**
 * Run the M3.0e orchestrator on a wake-word triggered question, then
 * inject 6's spoken reply into the conference. We treat the call as a
 * standalone session — surface snapshot is empty since the phone has
 * no drawer.
 *
 * For v1 we keep 6's reply intentionally simple: take the orchestrator's
 * contextMessage (intended for HeyGen's brain) and run a quick LLM pass
 * to extract just the "what to say out loud" portion. Or — simpler —
 * just have a separate prompt path for "on a phone call, what should 6
 * say in one sentence?".
 *
 * For now we ship a minimal pass-through: if the orchestrator returns
 * a structured variant (e.g. contractor list), we render a short
 * spoken summary; otherwise we ack neutrally.
 */
async function handleSixWakeWord(args: {
  call: { id: string; user_id: string; twilio_call_sid_six: string | null };
  userMessage: string;
}): Promise<void> {
  if (!args.call.twilio_call_sid_six) return;

  // Mark speaking so a rapid-fire second wake-word doesn't double-fire.
  await patchCall(args.call.id, { six_speaking: true }).catch(() => null);

  const reply = await composeSixReplyForPhone(args.userMessage).catch(
    () => "Sorry, I didn't catch that. Could you say it again?",
  );

  await appendTranscript({
    user_id: args.call.user_id,
    session_id: args.call.id,
    speaker: "six",
    text: reply,
    context: { source: "six_spoken_reply" },
  }).catch(() => null);

  await makeSixSpeak({
    callSid: args.call.twilio_call_sid_six,
    callId: args.call.id,
    text: reply,
  }).catch((e) => {
    console.warn("[twilio/transcription] makeSixSpeak failed:", e);
  });

  // Clear the speaking flag a few seconds later — the actual Twilio
  // <Say> takes 1-3s depending on text length, and we don't get a
  // "finished speaking" callback. Give it a conservative 5s buffer.
  setTimeout(() => {
    patchCall(args.call.id, { six_speaking: false }).catch(() => null);
  }, 5000);
}

const SIX_PHONE_PROMPT = [
  `You are "6", an assistant on a 3-way phone call between a homeowner and a contractor.`,
  `The homeowner just addressed you directly. Respond CONCISELY — 1 or 2 sentences max — as if speaking out loud on the phone.`,
  `Be helpful, neutral, and warm. Don't be chatty. Don't read URLs aloud. Don't quote dollar amounts unless the user just asked about them.`,
  `If the homeowner is asking about scope, pricing, or the work itself, prompt the contractor to answer.`,
  `If unsure, ask one short clarifying question.`,
].join("\n");

async function composeSixReplyForPhone(userMessage: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "I'm here. Could you tell me a bit more about what you need?";
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 90,
        messages: [
          { role: "system", content: SIX_PHONE_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      return "Hold on a sec, I'm catching up.";
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = data.choices?.[0]?.message?.content?.trim();
    return out && out.length > 0
      ? out.slice(0, 320)
      : "I'm here — what can I help with?";
  } catch {
    return "Hold on a sec, I'm catching up.";
  }
}
