import { OPENAI_API_KEY } from "../../../app/api/secrets";
import { MEMORY_FACT_KINDS, type ExtractedFact, type MemoryFactKind } from "./types";

const EXTRACTOR_MODEL = "gpt-4o-mini";
const MAX_FACTS_PER_TURN = 6;
const MAX_FACT_LEN = 300;

/**
 * Extract durable facts about the user from a conversation turn.
 *
 * Conservative on purpose: returns [] if the turn contains no useful
 * facts. Never invents facts; the prompt explicitly forbids that.
 *
 * Returns [] on any failure — extraction is a fire-and-forget side
 * effect; chat replies must never block or fail on this path.
 */
export async function extractFactsFromTurn(args: {
  userMessage: string;
  assistantReply: string;
}): Promise<ExtractedFact[]> {
  if (!OPENAI_API_KEY) return [];

  const system = `You extract durable facts about the USER (not about the assistant) from a single conversation turn. A "durable fact" is information that would still be useful weeks from now if the user came back — their name, where they live, what kind of property they have (house/apt/condo, age, square footage), their preferences (price-sensitive, prefers same-day service, locally-owned only, ≥4.5⭐ contractors), prior issues they've reported, or contact details they shared.

Rules:
- Output STRICT JSON only — no prose, no markdown fences, no commentary.
- Schema: {"facts": [{"kind": "<kind>", "content": "<short fact>"}, ...]}
- Allowed kinds: ${MEMORY_FACT_KINDS.join(", ")}.
- If no durable facts are present, return {"facts": []}.
- Do NOT invent or guess. If unsure, omit.
- Do NOT include facts about the assistant or the conversation itself.
- Keep each "content" terse and self-contained — it must make sense weeks later without the surrounding turn.
- Max ${MAX_FACTS_PER_TURN} facts.`;

  const user = `USER MESSAGE:
${args.userMessage}

ASSISTANT REPLY:
${args.assistantReply}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EXTRACTOR_MODEL,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.error("extractFacts: openai", res.status);
      return [];
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("extractFacts: bad json", raw.slice(0, 200));
      return [];
    }
    const facts = (parsed as { facts?: unknown })?.facts;
    if (!Array.isArray(facts)) return [];

    const allowed = new Set<MemoryFactKind>(MEMORY_FACT_KINDS);
    const out: ExtractedFact[] = [];
    for (const f of facts) {
      if (out.length >= MAX_FACTS_PER_TURN) break;
      if (typeof f !== "object" || f === null) continue;
      const kind = (f as { kind?: unknown }).kind;
      const content = (f as { content?: unknown }).content;
      if (typeof kind !== "string" || typeof content !== "string") continue;
      if (!allowed.has(kind as MemoryFactKind)) continue;
      const trimmed = content.trim().slice(0, MAX_FACT_LEN);
      if (!trimmed) continue;
      out.push({ kind: kind as MemoryFactKind, content: trimmed });
    }
    return out;
  } catch (e) {
    console.error("extractFacts: throw", e);
    return [];
  }
}
