import { OPENAI_API_KEY } from "../../../app/api/secrets";
import type { EstimateLineItem } from "./types";

/**
 * M3.6 — Estimate line-item extractor.
 *
 * Vision ¶17: contractor speaks scope on a call; 6 transcribes it into a
 * structured line-item estimate (Q3.6a fixed JSON schema). Q3.6b: v1
 * relies on the contractor to *speak* unit prices — we don't maintain a
 * unit-rate library yet.
 *
 * Input: ordered transcript chunks from a call.
 * Output: scope summary + line items.
 *
 * v1: LLM-based extraction. Returns deterministic structured JSON via
 * response_format=json_object. When OPENAI_API_KEY is missing we return
 * an empty draft so the route still completes — the user can hand-edit
 * via the UI.
 */

export type TranscriptChunk = {
  speaker: "user" | "avatar" | "contractor" | "six" | string;
  text: string;
};

export type ExtractEstimateResult =
  | {
      ok: true;
      scope_summary: string;
      line_items: EstimateLineItem[];
    }
  | {
      ok: false;
      reason:
        | "openai_not_configured"
        | "empty_transcript"
        | "llm_http_error"
        | "llm_parse_failed"
        | "llm_fetch_threw";
      debug?: string;
    };

const EXTRACTOR_MODEL = process.env.ESTIMATE_EXTRACTOR_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = [
  `You are an estimator's assistant. The transcript below is a conversation between a homeowner and a contractor about work to be done.`,
  ``,
  `Extract a STRUCTURED ESTIMATE the contractor would put on paper. Output JSON only.`,
  ``,
  `Rules:`,
  ` - Line items must be concrete work items the contractor described.`,
  ` - Use the contractor's spoken unit prices. If they said a total without breaking it down, create ONE line item with quantity=1.`,
  ` - "quantity" is a positive number (decimal OK — e.g. 2.5 hours).`,
  ` - "unit" is one of: "hour", "day", "sq ft", "linear ft", "each", "trip", "lot", or another short noun.`,
  ` - "unit_price_cents" and "total_cents" are integers in CENTS. total_cents = round(quantity * unit_price_cents).`,
  ` - If the contractor did not state a price for an item, skip it. Don't invent numbers.`,
  ` - "scope_summary" is a 1–2 sentence plain-English overview of what's being done.`,
  ` - If the transcript has no estimating signal at all, output empty line_items with a brief scope_summary explaining what was discussed.`,
  ``,
  `Output exactly:`,
  `{`,
  `  "scope_summary": "<string>",`,
  `  "line_items": [`,
  `    {`,
  `      "description": "<short description>",`,
  `      "quantity": <number>,`,
  `      "unit": "<unit string>",`,
  `      "unit_price_cents": <integer>,`,
  `      "total_cents": <integer>`,
  `    }`,
  `  ]`,
  `}`,
].join("\n");

function formatTranscript(chunks: TranscriptChunk[]): string {
  return chunks
    .map((c) => `${c.speaker.toUpperCase()}: ${c.text.trim()}`)
    .filter((l) => l.length > 0)
    .join("\n");
}

function clampPositiveInt(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function clampPositiveNumber(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function sanitizeLineItem(raw: unknown): EstimateLineItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as {
    description?: unknown;
    quantity?: unknown;
    unit?: unknown;
    unit_price_cents?: unknown;
    total_cents?: unknown;
  };
  if (typeof r.description !== "string" || r.description.trim() === "")
    return null;
  if (typeof r.unit !== "string" || r.unit.trim() === "") return null;
  const quantity = clampPositiveNumber(r.quantity);
  const unit_price_cents = clampPositiveInt(r.unit_price_cents);
  if (unit_price_cents === 0) return null;
  const claimedTotal = clampPositiveInt(r.total_cents);
  const computedTotal = Math.round(quantity * unit_price_cents);
  // Use computed if claimed is missing or wildly off (>5% drift).
  const total_cents =
    claimedTotal > 0 && Math.abs(claimedTotal - computedTotal) <= computedTotal * 0.05
      ? claimedTotal
      : computedTotal;
  return {
    description: r.description.trim().slice(0, 240),
    quantity,
    unit: r.unit.trim().slice(0, 32),
    unit_price_cents,
    total_cents,
  };
}

export async function extractLineItems(args: {
  chunks: TranscriptChunk[];
}): Promise<ExtractEstimateResult> {
  if (!OPENAI_API_KEY) {
    return { ok: false, reason: "openai_not_configured" };
  }
  if (args.chunks.length === 0) {
    return { ok: false, reason: "empty_transcript" };
  }

  const userContent = formatTranscript(args.chunks);
  if (userContent.trim() === "") {
    return { ok: false, reason: "empty_transcript" };
  }

  let raw: string;
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
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Transcript:\n${userContent}\n\nReturn the structured estimate JSON.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: "llm_http_error",
        debug: `openai ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    return {
      ok: false,
      reason: "llm_fetch_threw",
      debug: e instanceof Error ? e.message : "unknown",
    };
  }

  let parsed: {
    scope_summary?: unknown;
    line_items?: unknown;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: "llm_parse_failed",
      debug: `couldn't JSON.parse: ${raw.slice(0, 200)}`,
    };
  }

  const scope_summary =
    typeof parsed.scope_summary === "string"
      ? parsed.scope_summary.trim().slice(0, 600)
      : "";
  const line_items = Array.isArray(parsed.line_items)
    ? parsed.line_items
        .map(sanitizeLineItem)
        .filter((li): li is EstimateLineItem => li !== null)
    : [];

  return { ok: true, scope_summary, line_items };
}
