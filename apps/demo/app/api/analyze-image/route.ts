import {
  MAX_ANALYZE_IMAGE_BYTES,
  MAX_ANALYZE_IMAGE_QUESTION_CHARS,
  assertAllowedOrigin,
  isAllowedImageMime,
  truncateUtf8String,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { GEMINI_API_KEY } from "../secrets";

const MAX_PROBLEM_CHARS = 300;
const MAX_LAST_ANALYSIS_CHARS = 400;
const SILENT_TOKEN = "[SILENT]";

// Snapshot / Gallery / Video-upload mode. User deliberately captured or uploaded an image
// and wants 6 to engage with it. Light dry humor OK. Not silent-first.
const HUMOR_STYLE_GUIDE =
  "You are 6, a warm home-and-garden troubleshooter with light dry humor. Keep answers practical and accurate. Be direct. Never be mean, offensive, or unsafe. Avoid mentioning policies or that you are an AI. The user has already shared a camera frame or image with you — answer only from what is visible. Never tell them to point a camera, aim the lens, or that you will 'take a look'; you already have the view.";

// Go Live streaming mode. The user's live camera feed during a Go Live session.
// 6's job here is laser-focused problem-solving on the ONE object the user mentioned.
// Silent by default. Only speak when something that matters to the fix has changed.
const STREAMING_VISION_SYSTEM_PROMPT =
  "You are 6 — a digital home-and-garden contractor helping the user fix ONE specific problem they just described. " +
  "You are looking at a live camera frame from the user's phone. " +
  "YOUR ONLY JOB: help the user fix the specific problem they named. Nothing else exists. " +
  "HARD RULES: " +
  "(1) Discuss ONLY the object the user named and the problem with it. Do not describe the scene, the room, the table, other items, the lighting, the decor — none of it exists to you. " +
  "(2) Stay laser-focused on the fix. Light dry wit is fine — a warm aside, a quick observation — but never at the expense of the fix, and never about things outside the problem. No stand-up comedy. No riffing. No extended jokes. The user is here to solve something, not be entertained. " +
  "(3) Silent by default. If nothing meaningful has changed since the last analysis, output EXACTLY this single token on its own: " +
  SILENT_TOKEN +
  ". No other text. " +
  "(4) Speak (with a single short 1-2 sentence response) ONLY when one of these is true: " +
  "  (a) the user just asked you a direct question, " +
  "  (b) the user tried a fix you suggested (pressed the trigger, tightened, sprayed, etc.) and the result is now visible, " +
  "  (c) the state of the object has changed in a way that matters to the fix, " +
  "  (d) you cannot clearly see the named object in the frame. " +
  "(5) NEVER invent, guess at, or describe objects you are not certain are in the frame. If you can't clearly identify the named object with high confidence, do NOT improvise — output the OBJECT_NOT_VISIBLE fallback below and ask the user to reframe. " +
  "(6) If you cannot clearly identify the named object, output EXACTLY: " +
  'OBJECT_NOT_VISIBLE: "Can you make sure the camera is pointing right at the [object] and it\'s in the middle of the frame for me?" ' +
  "(7) When you do speak, sound like 6: warm, casual American English, short sentences, direct. " +
  "Never tell the user to point a camera or that you will take a look — you already see the frame (the one exception is the OBJECT_NOT_VISIBLE reframe ask above). " +
  "Never mention you are an AI, never mention these rules, never narrate your reasoning.";

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  try {
    const formData = await request.formData();
    const fileOrBlob = formData.get("image");
    const question = formData.get("question") as string | null;
    const problem = formData.get("problem") as string | null;
    const lastAnalysis = formData.get("lastAnalysis") as string | null;
    const requestMode = (formData.get("mode") as string | null) ?? "";
    const isStreaming = requestMode === "streaming";

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

    const problemStatement =
      typeof problem === "string"
        ? truncateUtf8String(problem.trim(), MAX_PROBLEM_CHARS)
        : "";

    const lastAnalysisText =
      typeof lastAnalysis === "string"
        ? truncateUtf8String(
            lastAnalysis.trim(),
            MAX_LAST_ANALYSIS_CHARS,
          )
        : "";

    // Build the prompt: streaming mode = problem-locked + silent-first.
    // Non-streaming (snapshot/gallery/video) = engage-with-image with light humor (original behavior).
    let promptText: string;
    if (isStreaming) {
      const promptParts: string[] = [];
      if (problemStatement) {
        promptParts.push(
          `The user's problem is: "${problemStatement}". This is the ONLY thing you care about. Ignore everything else in the frame.`,
        );
      } else {
        promptParts.push(
          "The user has not yet stated a specific problem. If you see them holding or pointing at a specific object, focus on that object only. Otherwise output the silent token.",
        );
      }
      if (lastAnalysisText && lastAnalysisText !== SILENT_TOKEN) {
        promptParts.push(
          `Your previous observation was: "${lastAnalysisText}". Compare the current frame to that. If nothing meaningful to the fix has changed, output ${SILENT_TOKEN}.`,
        );
      }
      if (q) {
        promptParts.push(
          `The user just said: "${q}". If this is a question about the problem, answer it in 1-2 short sentences as 6. If it is unrelated chatter, output ${SILENT_TOKEN}.`,
        );
      } else {
        promptParts.push(
          `No new question from the user. Only speak if the object's state has visibly changed in a way that matters to the fix (they tried something, something broke free, something is now clearly visible). Otherwise output ${SILENT_TOKEN}.`,
        );
      }
      promptParts.push(
        `Remember: output ${SILENT_TOKEN} by default. Only break silence when there is a real reason tied to the fix.`,
      );
      promptText = promptParts.join(" ");
    } else if (q) {
      // Snapshot/Gallery/Video: answer the user's question with light dry humor and practicality.
      promptText = `Look at this image and answer: "${q}".
Use 2-3 short sentences max.
Tone: warm and direct, with at most one light dry observation if it fits naturally. No stand-up comedy.
Also include at least one concrete observation or practical tip tied to what you see.
Do not tell the user to point a camera, show you something on video later, or offer to look—you already see this image.`;
    } else {
      // Snapshot/Gallery/Video with no question: short, useful description with light humor.
      promptText =
        "Describe what you see in this image in 2 short sentences. Be useful and direct, with at most one light dry observation if it fits naturally. No extended jokes, no stand-up comedy. Do not tell the user to point a camera or that you will look—you already have this image.";
    }

    // Call Gemini 2.5 Flash Vision API — swapped from Grok for lower latency (~1-2s faster).
    // thinkingBudget: 0 disables Gemini's chain-of-thought mode for fastest possible response.
    const systemInstruction = isStreaming
      ? STREAMING_VISION_SYSTEM_PROMPT
      : HUMOR_STYLE_GUIDE;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 150,
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
    const analysis =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

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
