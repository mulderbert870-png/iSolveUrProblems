import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { embedText } from "./embed";
import type { StoredMemoryFact, MemoryFactKind } from "./types";

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MIN_SIMILARITY = 0.2;
const MIN_QUERY_LEN = 4;

/**
 * Top-K similarity search over user_memory_facts. Returns [] on any
 * failure — recall is best-effort and must never break the chat reply.
 */
export async function recallFacts(args: {
  userId: string;
  query: string;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<StoredMemoryFact[]> {
  if (!args.userId) return [];
  if (!args.query || args.query.trim().length < MIN_QUERY_LEN) return [];

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return [];
  }

  const queryEmbedding = await embedText(args.query);
  if (!queryEmbedding) return [];

  try {
    const res = await fetch(`${url}/rest/v1/rpc/match_user_memory_facts`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: args.userId,
        query_embedding: queryEmbedding,
        match_count: args.matchCount ?? DEFAULT_MATCH_COUNT,
        min_similarity: args.minSimilarity ?? DEFAULT_MIN_SIMILARITY,
      }),
    });
    if (!res.ok) {
      console.error(
        "recallFacts: rpc failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return [];
    }
    const rows = (await res.json()) as Array<{
      id: string;
      kind: MemoryFactKind;
      content: string;
      similarity: number;
      created_at: string;
    }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      content: r.content,
      similarity: r.similarity,
      created_at: r.created_at,
    }));
  } catch (e) {
    console.error("recallFacts: throw", e);
    return [];
  }
}

/**
 * Format recalled facts into a system-prompt-friendly text block.
 * Returns an empty string when there's nothing useful — so callers
 * can safely template it in without conditional logic.
 */
export function formatRecalledFactsForPrompt(
  facts: StoredMemoryFact[],
): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- [${f.kind}] ${f.content}`);
  return `What you remember about this user from prior conversations (highest-relevance first):\n${lines.join("\n")}\n\nUse these naturally — don't read them out verbatim or announce that you remember them. Only mention what's relevant to the current message.`;
}
