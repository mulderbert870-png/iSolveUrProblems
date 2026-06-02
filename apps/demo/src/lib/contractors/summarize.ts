import { OPENAI_API_KEY } from "../../../app/api/secrets";

/**
 * Review summarizer (M2.3 — Vision ¶11).
 *
 * Calls OpenAI in JSON-mode over a contractor's review corpus and
 * returns structured strengths / weaknesses / sample quotes.
 * Cheap model (gpt-4o-mini) per Q2.3a — ~$0.005 per summary.
 */

export const SUMMARIZER_MODEL = "gpt-4o-mini";

export type ReviewForSummary = {
  rating: number | null;
  body: string | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
};

export type ContractorSummary = {
  summary: string;
  strengths_md: string;
  weaknesses_md: string;
  sample_quotes: Array<{ quote: string; rating: number | null }>;
  reviews_summarized: number;
  model: string;
};

const SYSTEM_PROMPT = `You are a contractor-review synthesizer for iSolveUrProblems.
Given a list of customer reviews for one contractor, return a JSON object with these exact keys:
  - "summary": a 1–2 sentence neutral overview of what this contractor is like to hire.
  - "strengths_md": a short Markdown bullet list (3–5 bullets) of what reviewers consistently praise. No bullet if no clear pattern.
  - "weaknesses_md": a short Markdown bullet list (1–3 bullets) of recurring complaints or concerns. Empty string if no clear pattern.
  - "sample_quotes": an array of 2–3 short verbatim review snippets (≤140 chars each) representative of the corpus, each as {"quote": string, "rating": number-or-null}.
Be honest and balanced. Do not invent facts that aren't in the reviews. Do not name the contractor. Output JSON only, no preamble.`;

function buildUserContent(
  contractorName: string,
  reviews: ReviewForSummary[],
): string {
  // Trim absurdly long reviews so we don't blow the context budget on a
  // single noisy review.
  const trimmed = reviews
    .filter((r) => typeof r.body === "string" && r.body.trim().length > 0)
    .map((r) => ({
      rating: r.rating,
      body: (r.body ?? "").slice(0, 600),
      reviewed_at: r.reviewed_at,
    }))
    .slice(0, 50);
  return [
    `Contractor (name redacted for the summary): ${contractorName.replace(
      /./g,
      "•",
    )}`,
    `Reviews (n=${trimmed.length}):`,
    ...trimmed.map(
      (r, i) =>
        `${i + 1}. [${r.rating ?? "?"}/5] ${r.body}`,
    ),
  ].join("\n");
}

/**
 * Summarize a contractor's reviews. Returns null if the corpus is too
 * small to produce a meaningful summary or if the LLM call fails.
 */
export async function summarizeReviews(args: {
  contractorName: string;
  reviews: ReviewForSummary[];
}): Promise<ContractorSummary | null> {
  if (!OPENAI_API_KEY) return null;
  const withBody = args.reviews.filter(
    (r) => typeof r.body === "string" && r.body.trim().length > 0,
  );
  if (withBody.length < 3) return null; // not enough signal

  const userContent = buildUserContent(args.contractorName, args.reviews);

  let raw: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: SUMMARIZER_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      console.error("summarizer LLM error:", await res.text());
      return null;
    }
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("summarizer fetch threw:", e);
    return null;
  }

  let parsed: {
    summary?: unknown;
    strengths_md?: unknown;
    weaknesses_md?: unknown;
    sample_quotes?: unknown;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed.summary !== "string" || parsed.summary.trim() === "") {
    return null;
  }

  const sample_quotes: Array<{ quote: string; rating: number | null }> =
    Array.isArray(parsed.sample_quotes)
      ? parsed.sample_quotes
          .map((q): { quote: string; rating: number | null } | null => {
            if (
              typeof q !== "object" ||
              q === null ||
              typeof (q as { quote?: unknown }).quote !== "string"
            ) {
              return null;
            }
            const rating = (q as { rating?: unknown }).rating;
            return {
              quote: ((q as { quote: string }).quote).slice(0, 200),
              rating: typeof rating === "number" ? rating : null,
            };
          })
          .filter((x): x is { quote: string; rating: number | null } => !!x)
          .slice(0, 3)
      : [];

  return {
    summary: parsed.summary.trim(),
    strengths_md:
      typeof parsed.strengths_md === "string" ? parsed.strengths_md : "",
    weaknesses_md:
      typeof parsed.weaknesses_md === "string" ? parsed.weaknesses_md : "",
    sample_quotes,
    reviews_summarized: withBody.length,
    model: SUMMARIZER_MODEL,
  };
}
