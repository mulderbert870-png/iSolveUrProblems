import {
  MAX_ANALYZE_IMAGE_BYTES,
  MAX_ANALYZE_IMAGE_QUESTION_CHARS,
  isAllowedImageMime,
  truncateUtf8String,
} from "../../../src/lib/apiRouteSecurity";
import { GROKAI_API_KEY } from "../secrets";

export async function POST(request: Request) {
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
      // If there's a question, answer it based on what's in the image
      promptText = `Look at this image and answer: "${q}". Be direct and concise (2-3 sentences max). Be friendly but brief.`;
    } else {
      // Default analysis prompt - VERY concise
      promptText =
        "Briefly describe what you see in this image in 1-2 sentences. Be direct and concise.";
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
