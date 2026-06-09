/**
 * M3.0e — Context injection wrappers.
 *
 * Each function takes a backend result and produces the "context message"
 * we send to HeyGen's brain via `session.message()`. The wrappers are
 * modeled exactly on the proven image-analysis pattern at
 * [LiveAvatarSession.tsx:975-978]: a leading tag tells the brain not to
 * read the wrapper aloud, the body provides the data, and the tail
 * instructs the brain how to narrate it.
 *
 * Keep wrappers SHORT and SPECIFIC. The shorter the wrapper, the less
 * latency between user finishing speaking and the brain producing the
 * spoken result.
 */

import type {
  ContractorCard,
  PickResultPayload,
  RecommendationCard,
  SummaryPayload,
} from "../assistantSurface";

function ratingPart(c: { rating_avg: number | null }): string {
  return c.rating_avg != null ? `★${c.rating_avg.toFixed(1)}` : "";
}

export function wrapContractorsResult(args: {
  category: string;
  location_text?: string;
  hits: ContractorCard[];
}): string {
  const locPart = args.location_text
    ? ` near ${args.location_text}`
    : " near them";
  if (args.hits.length === 0) {
    return `[CONTRACTOR SEARCH — not spoken by user] The user asked for ${args.category}${locPart}, but I found no matches. Respond in first person as 6, apologize briefly, and offer to broaden the search (e.g. nearby cities or relaxed filters). One short sentence.`;
  }

  const topList = args.hits
    .slice(0, 5)
    .map(
      (c, i) =>
        `  ${i + 1}. ${c.name} — ${ratingPart(c)} · ${c.distance_km.toFixed(
          1,
        )} km${c.locally_owned ? " · locally owned" : ""}${
          c.same_day_flag ? " · same-day" : ""
        }`,
    )
    .join("\n");

  return [
    `[CONTRACTOR SEARCH — not spoken by user]`,
    `The user asked for a ${args.category}${locPart}. I found ${args.hits.length} candidates ranked by your existing rules. Top 5:`,
    topList,
    `Respond in first person as 6. Lead with the top pick — its name, rating, and how far. Offer to tell them more about it or to look at the rest. Two sentences max. Don't list all 5; the cards are already on screen for the user to see.`,
  ].join("\n");
}

export function wrapSummaryResult(args: {
  contractor_name: string;
  payload: SummaryPayload;
}): string {
  return [
    `[REVIEW SUMMARY — not spoken by user]`,
    `Vision: synthesized reviews for ${args.contractor_name}.`,
    `Overview: ${args.payload.summary}`,
    args.payload.strengths_md.trim() &&
      `Strengths:\n${args.payload.strengths_md.trim()}`,
    args.payload.weaknesses_md.trim() &&
      `Watch-outs:\n${args.payload.weaknesses_md.trim()}`,
    `Respond in first person as 6. Give a 2-sentence read on this contractor — the overall vibe, then one strength and one watch-out. The full panel is already on the user's screen.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function wrapRecommendationsResult(args: {
  picks: RecommendationCard[];
  preference_facts: string[];
}): string {
  if (args.picks.length === 0) {
    return `[6'S PICKS — not spoken by user] I couldn't find strong matches. Respond in first person as 6 with a one-sentence apology and offer to widen the search.`;
  }
  const top = args.picks[0];
  const prefsLine =
    args.preference_facts.length > 0
      ? `User's tracked preferences: ${args.preference_facts.slice(0, 3).join(", ")}.`
      : "";
  const picksList = args.picks
    .map(
      (p, i) =>
        `  ${i + 1}. ${p.name} — ${ratingPart(p)} · ${p.distance_km.toFixed(
          1,
        )} km — ${p.reason}`,
    )
    .join("\n");
  return [
    `[6'S PICKS — not spoken by user]`,
    prefsLine,
    `Top picks ranked by rating, sentiment, distance, and the user's preferences:`,
    picksList,
    `Respond in first person as 6. Name the #1 pick and the one-line reason why. Offer to tell them more or book it. Two sentences max. The cards are already on screen.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function wrapPickResult(args: {
  winner_name: string;
  loser_count: number;
  delivered_count: number;
  failed_count: number;
}): string {
  const tail =
    args.failed_count > 0
      ? `(Some notifications failed delivery on vendor side — the trigger fired correctly; this is M1.7 vendor config, not an action failure.)`
      : "";
  return [
    `[BOOKING CONFIRMED — not spoken by user]`,
    `User picked ${args.winner_name}. 6 has just fired the win/lose fan-out: ${args.delivered_count} notifications dispatched, ${args.failed_count} failed.`,
    `${args.loser_count} other candidates were notified with friendly "here's how to win next time" feedback per ¶19.`,
    tail,
    `Respond in first person as 6. Confirm the booking — name the contractor, say they'll be in touch shortly, and acknowledge you also let the other candidates know. Two sentences max. Warm tone.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build a "we couldn't act on this" wrapper for when intent matched but
 * required slots were missing or backend returned nothing.
 */
export function wrapFallback(reason: string): string {
  return [
    `[INTENT NOT ACTIONABLE — not spoken by user]`,
    `User intent matched but no action could be taken. Reason: ${reason}.`,
    `Respond in first person as 6 by either asking the user to clarify or restating what you understood. One short sentence.`,
  ].join("\n");
}

/** Diagnostic helper — used by /api/intent/classify's debug response. */
export function wrapForDebug(intent: string, slotsJson: string): string {
  return `[DEBUG — intent: ${intent}; slots: ${slotsJson}]`;
}

// Convenience re-export of the pick-result type so the orchestrator
// doesn't need a separate import.
export type { PickResultPayload };
