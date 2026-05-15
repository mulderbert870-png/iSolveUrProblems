import { getSupabaseAdminConfig } from "../supabaseAdmin";
import { embedText } from "./embed";
import type { ExtractedFact } from "./types";

/**
 * Embed each fact and insert into user_memory_facts. Best-effort —
 * any failure is logged and swallowed.
 *
 * Currently we always insert. A future optimization could de-dupe
 * against existing similar facts (cosine > 0.95) so 6 doesn't store
 * "user lives in Austin" five times.
 */
export async function storeFacts(args: {
  userId: string;
  sessionId?: string | null;
  facts: ExtractedFact[];
}): Promise<{ inserted: number }> {
  if (!args.userId || args.facts.length === 0) {
    return { inserted: 0 };
  }

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return { inserted: 0 };
  }

  // Embed each fact in parallel. Skip facts that fail to embed.
  const withEmbeddings = await Promise.all(
    args.facts.map(async (f) => {
      const embedding = await embedText(`${f.kind}: ${f.content}`);
      if (!embedding) return null;
      return {
        user_id: args.userId,
        session_id: args.sessionId ?? null,
        kind: f.kind,
        content: f.content,
        embedding,
      };
    }),
  );
  const rows = withEmbeddings.filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return { inserted: 0 };

  try {
    const res = await fetch(`${url}/rest/v1/user_memory_facts`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      console.error(
        "storeFacts: insert failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return { inserted: 0 };
    }
    return { inserted: rows.length };
  } catch (e) {
    console.error("storeFacts: throw", e);
    return { inserted: 0 };
  }
}
