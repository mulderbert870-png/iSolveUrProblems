import { NextResponse, type NextRequest } from "next/server";
import { verifyTwilioRequest } from "../../../../../src/lib/twilioSig";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/webhooks/twilio/announce (M3.1)
 *
 * TwiML endpoint fetched by Twilio's Conference Announce API. The query
 * string carries the text to speak; we wrap it in a `<Say>` and return
 * it. Twilio plays the resulting audio into the conference for ALL
 * participants, then resumes the conference.
 *
 * Trust model: this endpoint just returns TwiML XML. The audio only
 * gets played if Twilio actively calls it from inside a conference
 * announce, which requires our Account SID + Auth Token to initiate.
 * Hitting this URL directly returns harmless XML.
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

function buildTwiml(text: string): string {
  if (!text.trim()) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  }
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `<Say voice="Polly.Joanna-Neural">${escapeXml(text)}</Say>`,
    `</Response>`,
  ].join("");
}

async function handle(request: NextRequest) {
  // For POST Twilio sends form params; for GET there are none. The
  // verifier handles both — empty params → HMAC over fullUrl only.
  let formParams = new URLSearchParams();
  if (request.method === "POST") {
    try {
      formParams = new URLSearchParams(await request.clone().text());
    } catch {
      /* fall through with empty params */
    }
  }
  const verified = await verifyTwilioRequest({ request, formParams });
  if (!verified.ok) {
    return new NextResponse("", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const text = (searchParams.get("text") ?? "").slice(0, 1200);
  return new NextResponse(buildTwiml(text), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const GET = handle;
export const POST = handle;
