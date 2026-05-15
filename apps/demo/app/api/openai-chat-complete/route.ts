import {
  MAX_OPENAI_IMAGE_ANALYSIS_CHARS,
  MAX_OPENAI_USER_MESSAGE_CHARS,
  assertAllowedOrigin,
  truncateUtf8String,
} from "../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { OPENAI_API_KEY } from "../secrets";
import { getUserId } from "../../../src/lib/auth/getUser";
import {
  recallFacts,
  formatRecalledFactsForPrompt,
  extractFactsFromTurn,
  storeFacts,
} from "../../../src/lib/memory";

const SYSTEM_PROMPT =
  "You are a helpful assistant. You are being used in a demo. Please act courteously and helpfully.";

const OPENAI_MODEL = "gpt-4o-mini";

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  try {
    const body = await request.json();
    const { message: rawMessage, image_analysis: rawImageAnalysis } = body;

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

    // M1.2 — Memory recall pass. Only signed-in users have memory.
    // Failures inside recallFacts return [], so this never breaks chat.
    const userId = await getUserId();
    const recalled =
      userId !== null
        ? await recallFacts({ userId, query: message })
        : [];
    const memoryBlock = formatRecalledFactsForPrompt(recalled);

    // Assemble system prompt: base + (optional image context) + (optional memory).
    const systemSections: string[] = [SYSTEM_PROMPT];
    if (image_analysis) {
      systemSections.push(
        `IMPORTANT CONTEXT: The user has shared an image with you. You can see this image clearly, and here's what you observe: ${image_analysis}\n\nWhen the user asks questions about what they're seeing or asks questions about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility of the image. Never say you can't see the image or that you're relying on someone else's analysis. You are directly viewing this image.`,
      );
    }
    if (memoryBlock) {
      systemSections.push(memoryBlock);
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemSections.join("\n\n") },
      { role: "user", content: message },
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

    // M1.2 — Memory writer pass. Extract durable facts from this turn
    // and persist them. Fire-and-forget — never block the reply on
    // the writer. Only runs for signed-in users.
    if (userId) {
      void (async () => {
        const facts = await extractFactsFromTurn({
          userMessage: message,
          assistantReply: response,
        });
        if (facts.length > 0) {
          await storeFacts({ userId, facts });
        }
      })();
    }

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
