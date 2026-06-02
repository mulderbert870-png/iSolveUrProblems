import { OPENAI_API_KEY } from "../../../app/api/secrets";

/**
 * Lose-message feedback generator (M2.6 — Vision ¶19).
 *
 * For each contractor who did NOT win a project, 6 generates:
 *   - reason: a friendly 1-sentence explanation of why this one didn't win
 *   - tips:   2 actionable bullets the contractor can act on to win more
 *
 * Per Q2.6a: "always in a friendly, warm manner."
 */

const FEEDBACK_MODEL = "gpt-4o-mini";

export type LoseFeedback = {
  reason: string;
  tips: string[];
};

export type LoseFeedbackInput = {
  loser: {
    name: string;
    rating_avg: number | null;
    rating_count: number | null;
    price_tier: number | null;
    locally_owned: boolean | null;
    same_day_flag: boolean | null;
    licensed_flag: boolean | null;
    distance_km: number;
  };
  /** Anonymous signal about who won — name redacted. */
  winnerSignal: {
    rating_avg: number | null;
    price_tier: number | null;
    locally_owned: boolean | null;
    same_day_flag: boolean | null;
    distance_km: number;
  };
  userPreferences: string[];
};

function templatedFallback(input: LoseFeedbackInput): LoseFeedback {
  const reasons: string[] = [];
  if (
    typeof input.winnerSignal.rating_avg === "number" &&
    typeof input.loser.rating_avg === "number" &&
    input.winnerSignal.rating_avg > input.loser.rating_avg + 0.2
  ) {
    reasons.push("the winning contractor had a higher rating");
  }
  if (input.winnerSignal.distance_km < input.loser.distance_km - 1) {
    reasons.push("a closer option was chosen this time");
  }
  if (
    typeof input.winnerSignal.price_tier === "number" &&
    typeof input.loser.price_tier === "number" &&
    input.winnerSignal.price_tier < input.loser.price_tier
  ) {
    reasons.push("the homeowner picked a lower-priced option");
  }
  const reason =
    reasons[0] ??
    "the homeowner went with another match this time — it was close";

  const tips: string[] = [];
  if (
    typeof input.loser.rating_count === "number" &&
    input.loser.rating_count < 30
  ) {
    tips.push(
      "Ask recent happy customers to leave you a quick Google review — review count carries weight.",
    );
  }
  if (input.loser.same_day_flag === false || input.loser.same_day_flag == null) {
    tips.push(
      "Adding a same-day availability badge to your profile bumps you up when homeowners are in a hurry.",
    );
  }
  if (input.loser.licensed_flag === false || input.loser.licensed_flag == null) {
    tips.push(
      "Make sure your license info is up-to-date and visible — it's a trust signal homeowners scan for.",
    );
  }
  if (tips.length === 0) {
    tips.push(
      "Keep your response times short — many homeowners pick whoever replies first.",
    );
    tips.push(
      "Photos of recent jobs in your listing make a real difference when 6 is comparing options.",
    );
  }

  return {
    reason: `Hey ${input.loser.name.split(" ")[0] || "there"}, ${reason}.`,
    tips: tips.slice(0, 2),
  };
}

export async function generateLoseFeedback(
  input: LoseFeedbackInput,
): Promise<LoseFeedback> {
  if (!OPENAI_API_KEY) return templatedFallback(input);

  const systemPrompt = `You are 6, an AI advocate for contractors on the iSolveUrProblems platform.
A contractor did not win a project this time. Return JSON {"reason": string, "tips": string[]}.
- reason: ONE warm, friendly sentence explaining why this contractor didn't win, grounded in the data provided. Never name the winning contractor. Never invent facts. Keep it under 160 characters.
- tips: EXACTLY 2 short, actionable improvements (each under 120 chars). Tips must be specific and useful — not generic platitudes.`;

  const userPayload = {
    loser: input.loser,
    winner_signal_only: input.winnerSignal,
    homeowner_preferences: input.userPreferences,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: FEEDBACK_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("loseFeedback LLM error:", await res.text());
      return templatedFallback(input);
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return templatedFallback(input);
    const parsed = JSON.parse(raw) as {
      reason?: unknown;
      tips?: unknown;
    };
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim() !== ""
        ? parsed.reason.slice(0, 240)
        : templatedFallback(input).reason;
    const tips = Array.isArray(parsed.tips)
      ? parsed.tips
          .filter((t): t is string => typeof t === "string" && t.trim() !== "")
          .map((t) => t.slice(0, 180))
          .slice(0, 2)
      : [];
    if (tips.length < 1) {
      return { reason, tips: templatedFallback(input).tips };
    }
    return { reason, tips };
  } catch (e) {
    console.error("loseFeedback threw:", e);
    return templatedFallback(input);
  }
}
