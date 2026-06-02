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
import { resolveLocaleForRequest } from "../../../src/lib/i18n/resolveLocale";
import { localeLanguageName } from "../../../src/lib/i18n/avatarLanguage";
import {
  SEARCH_CONTRACTORS_TOOL,
  RECOMMEND_CONTRACTORS_TOOL,
  runSearchContractorsTool,
  runRecommendContractorsTool,
  type ContractorChatResult,
  type ContractorChatRecommendResult,
  type SearchContractorsArgs,
} from "../../../src/lib/contractors/chatTool";

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

    // M1.6b — resolve the user's locale and tell the model to reply in
    // their language. Per vision ¶26 ("6 speaks as many languages as
    // ai speaks"). Anonymous users fall back to Accept-Language.
    const locale = await resolveLocaleForRequest({
      userId,
      acceptLanguage: request.headers.get("accept-language"),
    });
    const languageName = localeLanguageName(locale);

    // Assemble system prompt: base + language directive + (optional
    // image context) + (optional memory).
    const systemSections: string[] = [
      SYSTEM_PROMPT,
      `Respond to the user in ${languageName}. Match their tone and any technical level they use.`,
    ];
    if (image_analysis) {
      systemSections.push(
        `IMPORTANT CONTEXT: The user has shared an image with you. You can see this image clearly, and here's what you observe: ${image_analysis}\n\nWhen the user asks questions about what they're seeing or asks questions about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility of the image. Never say you can't see the image or that you're relying on someone else's analysis. You are directly viewing this image.`,
      );
    }
    if (memoryBlock) {
      systemSections.push(memoryBlock);
    }

    // Chat-completions messages are a tagged union; using `any` here so
    // tool-result messages with the `tool_call_id` field also fit.
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemSections.join("\n\n") },
      { role: "user", content: message },
    ];

    const tools = [SEARCH_CONTRACTORS_TOOL, RECOMMEND_CONTRACTORS_TOOL];

    async function callOpenAI(
      withTools: boolean,
    ): Promise<Response | { data: any }> {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages,
          ...(withTools ? { tools, tool_choice: "auto" } : {}),
        }),
      });
      if (!r.ok) {
        const errorData = await r.text();
        console.error("OpenAI API error:", errorData);
        return new Response(
          JSON.stringify({ error: "Failed to generate response" }),
          {
            status: r.status <= 599 ? r.status : 502,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return { data: await r.json() };
    }

    // First pass — model may decide to call the contractor search tool.
    let firstPass = await callOpenAI(true);
    if (firstPass instanceof Response) return firstPass;

    let assistantMsg = firstPass.data.choices[0].message;
    let contractorPayload: ContractorChatResult | null = null;
    let recommendPayload: ContractorChatRecommendResult | null = null;

    // Tool-use loop — handle at most one round of contractor tools.
    if (
      Array.isArray(assistantMsg.tool_calls) &&
      assistantMsg.tool_calls.length > 0
    ) {
      // Append the assistant turn that contains the tool_calls (required
      // by OpenAI before tool messages).
      messages.push(assistantMsg);

      for (const call of assistantMsg.tool_calls) {
        const toolName = call.function?.name;
        if (
          toolName !== "search_contractors" &&
          toolName !== "recommend_contractors"
        ) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: "unknown tool" }),
          });
          continue;
        }
        let parsed: SearchContractorsArgs;
        try {
          parsed = JSON.parse(call.function.arguments ?? "{}");
        } catch {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              ok: false,
              error: "invalid tool arguments",
            }),
          });
          continue;
        }

        if (toolName === "search_contractors") {
          const result = await runSearchContractorsTool(parsed, locale);
          if (result.ok && !contractorPayload) contractorPayload = result;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        } else {
          const result = await runRecommendContractorsTool({
            toolArgs: parsed,
            userId,
            locale,
          });
          if (result.ok && !recommendPayload) recommendPayload = result;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Second pass — let the model summarize the tool results in prose.
      const secondPass = await callOpenAI(false);
      if (secondPass instanceof Response) return secondPass;
      assistantMsg = secondPass.data.choices[0].message;
    }

    const response: string = assistantMsg.content ?? "";

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

    return new Response(
      JSON.stringify({
        response,
        ...(contractorPayload ? { contractors: contractorPayload } : {}),
        ...(recommendPayload ? { recommend: recommendPayload } : {}),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
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
