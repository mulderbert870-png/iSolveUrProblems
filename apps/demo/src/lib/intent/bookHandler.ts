import type { PickResultPayload } from "../assistantSurface";

/**
 * M3.0d — Book handler.
 *
 * Externalized from the orchestrator so the mock-vs-real cutover is a
 * single function-level swap. v1 returns a synthetic PickResultPayload
 * so the M3.0d test drive feels complete without firing real M2.6
 * notifications. Once the test drive ships to signed-in users, swap
 * the `executeMockBook` body for a `runPickFanOut()` call against the
 * existing M2.6 fabric — that's the only change needed.
 *
 * Decision boundary:
 *   - user_id == null  → always mock (test drive runs anonymously)
 *   - user_id != null  → still mock for now; will become real in a
 *                        follow-up commit once SG Dietz signs off
 *                        on the M3.0d test drive
 */

export type BookHandlerInput = {
  winner_id: string;
  winner_name: string;
  candidate_ids: string[];   // ordered as the user saw them
  user_id: string | null;
  category?: string;
};

export type BookHandlerOutput = {
  payload: PickResultPayload;
  used_mock: boolean;
};

export async function executeBook(
  input: BookHandlerInput,
): Promise<BookHandlerOutput> {
  // v1 — always mock. See block comment for the cutover plan.
  return { payload: buildMockPayload(input), used_mock: true };
}

function buildMockPayload(input: BookHandlerInput): PickResultPayload {
  const losers = input.candidate_ids.filter((id) => id !== input.winner_id);
  return {
    winner: {
      contractor_id: input.winner_id,
      name: input.winner_name,
      channel: "sms",
      delivered: true,
    },
    losers: losers.map((id) => ({
      contractor_id: id,
      name: "(other candidate)",
      channel: "email",
      delivered: false,
      error: "mock — would dispatch in production",
    })),
    total_sent: 1,
    total_failed: losers.length,
  };
}
