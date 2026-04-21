import {
  MAX_ANALYZE_IMAGE_BYTES,
  MAX_ANALYZE_IMAGE_QUESTION_CHARS,
  assertAllowedOrigin,
  isAllowedImageMime,
  truncateUtf8String,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { GROKAI_API_KEY } from "../secrets";

const HUMOR_STYLE_GUIDE =
  "You are 6, a witty home-and-garden troubleshooter. Be genuinely funny with light, punchy humor and playful one-liners. Keep answers practical and accurate. Never be mean, offensive, or unsafe. Avoid mentioning policies or that you are an AI. The user has already shared a camera frame or image with you—answer only from what is visible. Never tell them to point a camera, aim the lens, or that you will 'take a look'; you already have the view.";

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  try {
    const formData = await request.formData();
    const fileOrBlob = formData.get("image");
    const question = formData.get("question") as string | null;

    if (!fileOrBlob) {
      console.error("analyze-image: missing image field");
      return new Response(
        JSON.stringify({
          error: "Image file is required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Accept both File and Blob (some runtimes return Blob from formData)
    const value = fileOrBlob as unknown;
    const file: File | null =
      fileOrBlob instanceof File
        ? fileOrBlob
        : value instanceof Blob
          ? new File([value], "image.jpg", { type: value.type || "image/jpeg" })
          : null;
    if (!file) {
      return new Response(
        JSON.stringify({
          error: "Image file is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (file.size === 0) {
      return new Response(
        JSON.stringify({ error: "Image file is empty" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (file.size > MAX_ANALYZE_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: "Image file is too large" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
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

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = (file.type || "image/jpeg").split(";")[0].trim();
    if (!isAllowedImageMime(mimeType)) {
      return new Response(
        JSON.stringify({ error: "Unsupported image type" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const q =
      typeof question === "string"
        ? truncateUtf8String(
            question.trim(),
            MAX_ANALYZE_IMAGE_QUESTION_CHARS,
          )
        : "";

    // Build the prompt based on whether there's a question
    let promptText: string;
    if (q) {
      // If there's a question, answer it based on what's in the image with practical humor.
      promptText = `Look at this image and answer: "${q}".
Use 2-3 short sentences max.
Tone: funny and lively, with one memorable joke/analogy.
Also include at least one concrete observation or practical tip tied to what you see.
Do not tell the user to point a camera, show you something on video later, or offer to look—you already see this image.`;
    } else {
      // Default analysis prompt - concise but funny.
      promptText =
        "Describe what you see in this image in 2 short sentences. Make it hilarious but useful: one vivid joke plus one practical observation. Do not tell the user to point a camera or that you will look—you already have this image.";
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
            content: [
              {
                type: "text",
                text: promptText,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 150,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("GrokAI Vision API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to analyze image",
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
    console.error("Error analyzing image:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
