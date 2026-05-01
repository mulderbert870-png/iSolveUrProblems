import {
  MAX_OPENAI_IMAGE_ANALYSIS_CHARS,
  MAX_OPENAI_USER_MESSAGE_CHARS,
  assertAllowedOrigin,
  isAllowedImageMime,
  truncateUtf8String,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { SIX_PERSONA_PROMPT } from "../../../src/lib/sixPersonaPrompt";
import { OPENAI_API_KEY } from "../secrets";

// Edge runtime — ~0ms cold start. Pure fetch, no Node deps.
export const runtime = "edge";
export const preferredRegion = "iad1";

const OPENAI_MODEL = "gpt-4o-mini";

// Approx 4 chars per token. 28KB persona prompt = ~7K tokens.
// gpt-4o-mini context window is 128K; plenty of room.
// Reply length kept short for voice cadence.
const MAX_OUTPUT_TOKENS = 250;

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  try {
    const body = await request.json();
    const {
      message: rawMessage,
      image_analysis: rawImageAnalysis,
      image_base64: rawImageBase64,
      image_mime: rawImageMime,
    } = body;

    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const message = truncateUtf8String(
      rawMessage,
      MAX_OPENAI_USER_MESSAGE_CHARS,
    );
    const image_analysis =
      typeof rawImageAnalysis === "string"
        ? truncateUtf8String(
            rawImageAnalysis,
            MAX_OPENAI_IMAGE_ANALYSIS_CHARS,
          )
        : undefined;

    // Native vision input — image bytes go directly to gpt-4o-mini.
    // Replaces the legacy image_analysis path (Gemini middleman) for the
    // CUSTOM-mode pipeline. 2026-04-30.
    const image_mime =
      typeof rawImageMime === "string" && isAllowedImageMime(rawImageMime)
        ? rawImageMime
        : null;
    const image_base64 =
      typeof rawImageBase64 === "string" && rawImageBase64.length > 0
        ? rawImageBase64
        : null;
    const has_native_image = image_base64 != null && image_mime != null;

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // System message = the slimmed 6 persona prompt.
    // Pre-2026-04-30 this route used a tiny generic prompt; now it is the
    // primary brain for CUSTOM mode and must carry 6's full character.
    const systemContent = SIX_PERSONA_PROMPT;

    // User message — multimodal when an image is provided, plain text otherwise.
    type UserContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

    let userContent: string | UserContentPart[];
    if (has_native_image) {
      const dataUrl = `data:${image_mime};base64,${image_base64}`;
      userContent = [
        { type: "text", text: message },
        // detail: "low" = cheaper + faster. iSolve uses 768px frames, plenty for
        // home/garden problem identification. Bump to "high" only if accuracy
        // turns out insufficient.
        { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
      ];
    } else if (image_analysis) {
      // Legacy text-only path kept for backward compat with any old callers.
      userContent = `${message}\n\n[Vision context — what you can see in the user's frame: ${image_analysis}]`;
    } else {
      userContent = message;
    }

    const messages: Array<{ role: string; content: string | UserContentPart[] }> = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];

    // Call OpenAI API
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("OpenAI API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to generate response",
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
    const response = data.choices[0].message.content;

    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error generating response:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
