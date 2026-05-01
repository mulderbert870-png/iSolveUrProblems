// TEMPORARY diagnostic endpoint — env-presence reporter for the
// CUSTOM-mode dual-brain debugging. Reveals only booleans + 4-char
// prefixes (no key bodies). DELETE this file once silent-context
// + gpt-4o-mini chain is verified working.

export const runtime = "edge";

export async function GET() {
  const ctx =
    process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE ||
    process.env.LIVEAVATAR_CONTEXT_ID ||
    "";
  return new Response(
    JSON.stringify(
      {
        vercelEnv: process.env.VERCEL_ENV,
        nodeEnv: process.env.NODE_ENV,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        openAIPrefix: (process.env.OPENAI_API_KEY || "").slice(0, 8),
        openAILen: (process.env.OPENAI_API_KEY || "").length,
        hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
        elevenLabsLen: (process.env.ELEVENLABS_API_KEY || "").length,
        hasOverride: !!process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE,
        overridePrefix: (process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE || "").slice(0, 8),
        contextInUsePrefix: ctx.slice(0, 8),
        hasLiveAvatarKey: !!process.env.LIVEAVATAR_API_KEY,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}
