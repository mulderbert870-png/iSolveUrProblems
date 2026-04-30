import {
  MAX_VIDEO_FRAMES,
  assertAllowedOrigin,
  isReasonableBase64Frame,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import {
  fetchGeminiWithRetry,
  isGeminiOverloaded,
} from "../../../src/lib/geminiFetch";
import { GEMINI_API_KEY } from "../secrets";

// Edge runtime — ~0ms cold start, no Node deps used here.
export const runtime = "edge";
export const preferredRegion = "iad1";

const HUMOR_STYLE_GUIDE =
  "You are the vision system for 6, a home-and-garden troubleshooter. Describe what literally happens across these video frames in 1-2 short sentences. " +
  "STRICT RULES (added 2026-04-25 after a hallucination — model claimed user 'successfully removed the finial' when frames only showed the user touching it): " +
  "(1) NEVER claim the user 'successfully' completed an action unless you SEE the result clearly in the final frames. If the finial is still attached in the last frame, say 'I see your hand on the finial, twisting it' — NOT 'you removed it.' " +
  "(2) If the action's outcome isn't clearly visible (object out of frame, hands obscuring view, motion blur), say 'I can see you trying X, but I can't tell if it came off — show me the lamp again to confirm.' " +
  "(3) Compare the FIRST frame to the LAST frame. State only differences you actually see. If the lamp looks identical at start and end, say 'I don't see a clear change yet.' " +
  "(4) Keep answers practical and accurate. Light dry humor is fine but never at the expense of accuracy. Avoid mentioning policies or that you are an AI. " +
  "(5) Never tell the user to point a camera or that you will 'take a look' later — you already have the footage. " +
  "(6) Never invent state changes the frames don't show.";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  try {
    const body = await request.json();
    const { frames } = body;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: "Video frames are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (frames.length > MAX_VIDEO_FRAMES) {
      return new Response(
        JSON.stringify({
          error: `At most ${MAX_VIDEO_FRAMES} frames are allowed`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const frameStrings: string[] = [];
    for (const frame of frames) {
      if (!isReasonableBase64Frame(frame)) {
        return new Response(
          JSON.stringify({ error: "Invalid frame data" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      frameStrings.push(frame);
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Build Gemini content parts — one text prompt + N frames as inline_data.
    const parts: GeminiPart[] = [
      {
        text:
          "These frames are in time order — first frame to last. Compare the FIRST frame to the LAST frame and describe what CHANGED between them (that's the action the user is showing you). " +
          "Focus on the outcome: did an object come off, come apart, move, break, get attached, get cleaned, get fixed? " +
          "If the user was trying to remove or detach something, confirm whether the last frame shows it REMOVED. " +
          "If the user was trying to attach or fix something, confirm whether the last frame shows it DONE. " +
          "Do NOT describe the starting state in detail. Focus on what changed and what the user accomplished (or didn't) by the end. " +
          "Respond in 1-2 short sentences, first person, warm and direct. No stand-up comedy or extended jokes. " +
          "Do not tell the user to point a camera or offer to look — you already see these frames.",
      },
    ];

    for (const frame of frameStrings) {
      parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: frame,
        },
      });
    }

    // Gemini 2.5 Flash Lite — picked 2026-04-24 for max speed. Same family
    // as Flash, slightly lighter, supports thinkingBudget:0.
    // Retry wrapper added 2026-04-30 to match analyze-image — same Gemini
    // endpoint, same 503/429 transient risk.
    const res = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: HUMOR_STYLE_GUIDE }],
          },
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            maxOutputTokens: 200,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Gemini Vision API error:", errorData);
      return new Response(
        JSON.stringify({
          error: isGeminiOverloaded(res.status)
            ? "Vision is busy right now — give it a moment and try again."
            : "Failed to analyze video",
        }),
        {
          status: res.status <= 599 ? res.status : 502,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = await res.json();
    const analysis =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error analyzing video:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze video" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
