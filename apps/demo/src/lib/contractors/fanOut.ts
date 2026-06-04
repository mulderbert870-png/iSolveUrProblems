import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { send } from "../notifications";
import type {
  NotificationChannel,
  DeliveryResult,
} from "../notifications";
import { generateLoseFeedback } from "./loseFeedback";
import type { ContractorRow } from "./types";

/**
 * Win/Lose notification fan-out (M2.6 — Vision ¶19).
 *
 * Given a winning contractor id and the candidate set, fires:
 *   - one contractor.win.v1 to the winner
 *   - one contractor.lose.v1 to each non-winner (with LLM-generated
 *     reason + 2 tips per Q2.6a "friendly, warm manner")
 *
 * All deliveries flow through the M1.7 fabric → notifications_sent
 * audit rows. Vendor failures (no email, Twilio not configured) are
 * recorded as status='failed' but never throw.
 *
 * When M2.5 ships, the contract-create route will call runPickFanOut
 * directly with the picked contractor + candidate ids; the M2.6
 * simulation endpoint wraps the same function so the trigger path
 * is the same in both worlds.
 */

export type FanOutInput = {
  /** Picked contractor's id. */
  winnerId: string;
  /** All contractors who were under consideration (winner included is fine). */
  candidateIds: string[];
  /** Category slug the homeowner asked for. */
  category: string;
  /** Optional homeowner-side info — used only in template copy. */
  homeownerLocation?: string | null;
  /** Optional iSolve-side preferences (for LLM lose-feedback grounding). */
  userPreferences?: string[];
  /** Optional URL the win recipient can follow to view the project. */
  projectUrl?: string | null;
  /** Pass-through context echoed into notifications_sent.context. */
  context?: Record<string, unknown>;
};

export type FanOutOutput = {
  winner: {
    contractor_id: string;
    name: string;
    channel: NotificationChannel | null;
    delivered: boolean;
    error?: string;
  } | null;
  losers: Array<{
    contractor_id: string;
    name: string;
    channel: NotificationChannel | null;
    delivered: boolean;
    error?: string;
  }>;
  total_sent: number;
  total_failed: number;
};

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchContractors(
  ids: string[],
): Promise<ContractorRow[]> {
  if (ids.length === 0) return [];
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const inList = ids.map((id) => `"${id}"`).join(",");
  const res = await fetch(
    `${url}/rest/v1/contractors?id=in.(${inList})&select=*`,
    { headers: adminHeaders(serviceRoleKey), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`contractors read failed: ${res.status}`);
  }
  return (await res.json()) as ContractorRow[];
}

type ContractorChannel = {
  channel: NotificationChannel | null;
  recipient: string | null;
};

/**
 * Pick a notification channel for a contractor row.
 * Contractors don't (yet) have a per-row consent profile; v1 logic is
 * email if present, else SMS. When SG Dietz ships contractor onboarding
 * we'll route through a proper consent resolver.
 */
function pickContractorChannel(c: ContractorRow): ContractorChannel {
  if (c.email && c.email.includes("@")) {
    return { channel: "email", recipient: c.email };
  }
  if (c.phone && /\d/.test(c.phone)) {
    return { channel: "sms", recipient: c.phone };
  }
  return { channel: null, recipient: null };
}

function summarizeDistanceForFeedback(
  c: ContractorRow,
  homeowner: { lat?: number | null; lng?: number | null } | null,
): number {
  // We don't have geo math imported here and it's only used to give the
  // LLM relative signal; use a coarse fallback when lat/lng missing.
  if (
    !homeowner ||
    homeowner.lat == null ||
    homeowner.lng == null ||
    c.lat == null ||
    c.lng == null
  ) {
    return 0;
  }
  const dLat = c.lat - homeowner.lat;
  const dLng = c.lng - homeowner.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111; // crude km
}

async function dispatchOne(args: {
  contractor: ContractorRow;
  templateId: "contractor.win.v1" | "contractor.lose.v1";
  data: unknown;
  context: Record<string, unknown>;
}): Promise<DeliveryResult> {
  const pick = pickContractorChannel(args.contractor);
  if (pick.channel === null || pick.recipient === null) {
    return {
      ok: false,
      channel: "email",
      error: "contractor has no email or phone on file",
      row_id: null,
    };
  }
  return send({
    channel: pick.channel,
    recipient: pick.recipient,
    templateId: args.templateId,
    data: args.data,
    context: {
      ...args.context,
      contractor_id: args.contractor.id,
    },
  });
}

export async function runPickFanOut(
  input: FanOutInput,
): Promise<FanOutOutput> {
  const allIds = Array.from(new Set([input.winnerId, ...input.candidateIds]));
  const contractors = await fetchContractors(allIds);
  const byId = new Map(contractors.map((c) => [c.id, c]));

  const winner = byId.get(input.winnerId) ?? null;
  if (!winner) {
    return {
      winner: null,
      losers: [],
      total_sent: 0,
      total_failed: 0,
    };
  }
  const losers = contractors.filter((c) => c.id !== input.winnerId);

  const result: FanOutOutput = {
    winner: null,
    losers: [],
    total_sent: 0,
    total_failed: 0,
  };

  // Win
  const winData = {
    contractorName: winner.name,
    category: input.category,
    homeownerLocation: input.homeownerLocation ?? null,
    projectUrl: input.projectUrl ?? null,
  };
  const winDelivery = await dispatchOne({
    contractor: winner,
    templateId: "contractor.win.v1",
    data: winData,
    context: { ...input.context, role: "winner" },
  });
  if (winDelivery.ok) result.total_sent += 1;
  else result.total_failed += 1;
  result.winner = {
    contractor_id: winner.id,
    name: winner.name,
    channel: winDelivery.channel ?? null,
    delivered: winDelivery.ok,
    error: winDelivery.ok ? undefined : winDelivery.error,
  };

  // Losers — generate feedback in parallel, then dispatch in parallel.
  const winnerSignal = {
    rating_avg: winner.rating_avg,
    price_tier: winner.price_tier,
    locally_owned: winner.locally_owned,
    same_day_flag: winner.same_day_flag,
    distance_km: 0,
  };

  const loserPromises = losers.map(async (loser) => {
    const feedback = await generateLoseFeedback({
      loser: {
        name: loser.name,
        rating_avg: loser.rating_avg,
        rating_count: loser.rating_count,
        price_tier: loser.price_tier,
        locally_owned: loser.locally_owned,
        same_day_flag: loser.same_day_flag,
        licensed_flag: loser.licensed_flag,
        distance_km: summarizeDistanceForFeedback(loser, {
          lat: winner.lat,
          lng: winner.lng,
        }),
      },
      winnerSignal,
      userPreferences: input.userPreferences ?? [],
    });
    const delivery = await dispatchOne({
      contractor: loser,
      templateId: "contractor.lose.v1",
      data: {
        contractorName: loser.name,
        category: input.category,
        reason: feedback.reason,
        tips: feedback.tips,
      },
      context: { ...input.context, role: "loser" },
    });
    return {
      contractor_id: loser.id,
      name: loser.name,
      channel: delivery.channel ?? null,
      delivered: delivery.ok,
      error: delivery.ok ? undefined : delivery.error,
    };
  });

  const loserResults = await Promise.all(loserPromises);
  for (const r of loserResults) {
    if (r.delivered) result.total_sent += 1;
    else result.total_failed += 1;
  }
  result.losers = loserResults;

  return result;
}
