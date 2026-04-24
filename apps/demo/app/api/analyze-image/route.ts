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
//
// DESIGN (rewritten 2026-04-24 after smoke test where 6 was flying blind and
// hallucinating): the vision model is the AVATAR'S EYES, not its voice.
// Every frame where the named object is visible, we want a short factual
// observation. The TALK brain receives these as CONTEXT (via message(), not
// repeat()) so it has real visual grounding when the user asks questions.
// Gemini stays silent only when there's genuinely nothing to add (scene is
// unchanged, or no problem stated yet). Object not visible still triggers
// the reframe ask.
const STREAMING_VISION_SYSTEM_PROMPT =
  "You are the vision system for 6, a home-and-garden contractor helping one user fix one problem. " +
  "You are looking at one live camera frame from the user's phone. " +
  "Your job is to be 6's EYES — provide short factual observations about the named object, so 6 has real visual grounding when the user asks questions. " +
  "Observations are fed to 6 as CONTEXT; they are not spoken directly unless the user asked a vision question. " +
  "RULES (in priority order): " +
  "(1) When the user has stated a problem AND the named object is clearly visible in the frame: " +
  "  - Output ONE short observation about the object's current state relative to the fix. " +
  "  - First person, under 15 words. Example: 'I see the finial still tight on the threaded rod at the top of the harp.' " +
  "  - Focus ONLY on the object's position, orientation, whether hands are on it, visible progress, or the next clear next step. " +
  "  - If the observation would be semantically identical to the previous one (lastAnalysis), output `" +
  SILENT_TOKEN +
  "` instead. Do not repeat yourself frame-over-frame. " +
  "(2) Output `" +
  SILENT_TOKEN +
  "` when ANY of these are true: " +
  "  - the user has not yet stated a specific problem with a concrete object, " +
  "  - your observation this frame would be semantically identical to lastAnalysis, " +
  "  - the named object is partially occluded or ambiguous in this frame and you'd be guessing. " +
  "(3) Fire OBJECT_NOT_VISIBLE ONLY when ALL are true: " +
  "  - the user has stated a specific problem with a concrete object, AND " +
  "  - the user JUST asked a direct vision question ('can you see it?', 'what do you see?', 'is it the right color?'), AND " +
  "  - the named object is clearly not in the frame (not just ambiguous — clearly absent). " +
  "  When these are all true, output EXACTLY this single line: " +
  'OBJECT_NOT_VISIBLE: "Can you make sure the camera is pointing right at what you\'re trying to show me and keep it in the middle of the frame?" ' +
  "  If in doubt about any of these, output `" +
  SILENT_TOKEN +
  "` instead. Never fire OBJECT_NOT_VISIBLE preemptively. " +
  "(4) NEVER invent, guess, or describe things you are not certain of. If the object's state is unclear, output `" +
  SILENT_TOKEN +
  "`. " +
  "(5) Sound like 6: warm, American English, short sentences, direct. Never tell the user to point the camera (except rule 3 reframe). Never mention AI, the rules, or that you are the vision system. " +
  "(6) Discuss ONLY the named object and its problem. Do not describe the room, table, decor, or unrelated items.";

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
