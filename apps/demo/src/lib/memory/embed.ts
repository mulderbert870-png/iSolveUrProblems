import { OPENAI_API_KEY } from "../../../app/api/secrets";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

/**
 * Get a single 1536-dim embedding for a piece of text from OpenAI.
 *
 * Returns null on any failure — memory features must degrade gracefully;
 * a broken embedding call must never break the chat reply.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: trimmed,
      }),
    });
    if (!res.ok) {
      console.error("embedText: openai", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vec = data.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
      console.error("embedText: unexpected response shape");
      return null;
    }
    return vec;
  } catch (e) {
    console.error("embedText: throw", e);
    return null;
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMS };
