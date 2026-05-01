// TEMPORARY diagnostic endpoint — env-presence + live chain probe.
// `?run=chain` runs the full openai -> elevenlabs path with a test
// message so we can see exactly which step breaks at runtime.
// DELETE this file once silent-context + gpt-4o-mini chain is
// verified working.

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const run = url.searchParams.get("run");

  const ctx =
    process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE ||
    process.env.LIVEAVATAR_CONTEXT_ID ||
    "";

  const env = {
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openAIPrefix: (process.env.OPENAI_API_KEY || "").slice(0, 8),
    openAILen: (process.env.OPENAI_API_KEY || "").length,
    hasElevenLabs: !!process.env.ELEVENLABS_API_KEY,
    elevenLabsLen: (process.env.ELEVENLABS_API_KEY || "").length,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || null,
    hasOverride: !!process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE,
    overridePrefix: (process.env.LIVEAVATAR_CONTEXT_ID_OVERRIDE || "").slice(0, 8),
    contextInUsePrefix: ctx.slice(0, 8),
    hasLiveAvatarKey: !!process.env.LIVEAVATAR_API_KEY,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (run !== "chain") {
    return jsonResponse({ env });
  }

  const trace: Record<string, unknown> = { env };

  // Step 1: OpenAI gpt-4o-mini call directly
  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) {
    trace.openaiStep = { ok: false, reason: "missing OPENAI_API_KEY" };
    return jsonResponse(trace);
  }
  let chatText = "";
  try {
    const t0 = Date.now();
    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 30,
        messages: [
          { role: "system", content: "You are a brevity tester. Reply 5 words max." },
          { role: "user", content: "Say hi briefly." },
        ],
      }),
    });
    const oaJsonText = await oaRes.text();
    const oaJson = (() => {
      try {
        return JSON.parse(oaJsonText);
      } catch {
        return null;
      }
    })();
    chatText = oaJson?.choices?.[0]?.message?.content || "";
    trace.openaiStep = {
      ok: oaRes.ok && !!chatText,
      status: oaRes.status,
      ms: Date.now() - t0,
      bodyPreview: oaJsonText.slice(0, 400),
      chatTextLen: chatText.length,
    };
    if (!chatText) return jsonResponse(trace);
  } catch (err) {
    trace.openaiStep = { ok: false, error: String(err) };
    return jsonResponse(trace);
  }

  // Step 2: ElevenLabs TTS
  const elKey = process.env.ELEVENLABS_API_KEY || "";
  const elVoice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  try {
    const t0 = Date.now();
    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elVoice}/with-timestamps?output_format=pcm_24000`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elKey,
        },
        body: JSON.stringify({ text: chatText }),
      },
    );
    const elBodyText = await elRes.text();
    const elJson = (() => {
      try {
        return JSON.parse(elBodyText);
      } catch {
        return null;
      }
    })();
    const audioLen = (elJson?.audio_base64 || "").length;
    trace.elevenLabsStep = {
      ok: elRes.ok && audioLen > 0,
      status: elRes.status,
      ms: Date.now() - t0,
      bodyPreview: elBodyText.slice(0, 400),
      audioBase64Len: audioLen,
    };
  } catch (err) {
    trace.elevenLabsStep = { ok: false, error: String(err) };
  }

  return jsonResponse(trace);
}

function jsonResponse(obj: unknown) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
