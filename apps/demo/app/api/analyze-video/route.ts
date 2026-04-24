import {
  MAX_VIDEO_FRAMES,
  assertAllowedOrigin,
  isReasonableBase64Frame,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { GEMINI_API_KEY } from "../secrets";

const HUMOR_STYLE_GUIDE =
  "You are 6, a witty home-and-garden troubleshooter. Be genuinely funny with light, punchy humor and playful one-liners. Keep answers practical and accurate. Never be mean, offensive, or unsafe. Avoid mentioning policies or that you are an AI. The user has already shared video frames with you—describe only what is visible. Never tell them to point a camera or that you will 'take a look' later; you already have the footage.";

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

    // Call Gemini 2.5 Flash Vision API — thinkingBudget: 0 disables
    // chain-of-thought for fastest possible response.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
          error: "Failed to analyze video",
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
