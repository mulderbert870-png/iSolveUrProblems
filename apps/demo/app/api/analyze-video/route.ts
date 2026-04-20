import {
  MAX_VIDEO_FRAMES,
  assertAllowedOrigin,
  isReasonableBase64Frame,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { GROKAI_API_KEY } from "../secrets";

const HUMOR_STYLE_GUIDE =
  "You are 6, a witty home-and-garden troubleshooter. Be genuinely funny with light, punchy humor and playful one-liners. Keep answers practical and accurate. Never be mean, offensive, or unsafe. Avoid mentioning policies or that you are an AI.";

type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

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

    if (!GROKAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GrokAI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Prepare content array for GrokAI
    const content: VisionContentPart[] = [
      {
        type: "text",
        text: "Describe what is happening across these video frames in 2-3 short sentences. Make it funny and vivid with one punchy joke, but include at least one practical observation that could help solve a real problem.",
      },
    ];

    for (const frame of frameStrings) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${frame}`,
        },
      });
    }

    // Call GrokAI (xAI) Vision API
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROKAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4-fast-reasoning",
        messages: [
          {
            role: "system",
            content: HUMOR_STYLE_GUIDE,
          },
          {
            role: "user",
            content: content,
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("GrokAI Vision API error:", errorData);
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
    const analysis = data.choices[0].message.content;

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
