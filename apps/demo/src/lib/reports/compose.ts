import { OPENAI_API_KEY } from "../../../app/api/secrets";
import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { Locale } from "../../i18n/routing";
import type { Report } from "./types";

const COMPOSER_MODEL = "gpt-4o-mini";
const MAX_TURNS = 80;
const MAX_MEDIA = 40;

type ConversationRow = {
  role: "user" | "assistant";
  message: string;
  la_absolute_timestamp: string | null;
};

type MediaEventRow = {
  storage_path: string;
  source: string;
  gemini_analysis: string | null;
  problem_at_time: string | null;
  created_at: string;
};

function languageDirective(locale: Locale): string {
  // Compact instruction the model can latch onto.
  const labels: Record<Locale, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    pt: "Portuguese",
    de: "German",
    zh: "Chinese (Simplified)",
  };
  return labels[locale] ?? "English";
}

function defaultDisclaimer(locale: Locale): string {
  // M1.6b — localized legal disclaimer per locale. Machine-translated
  // for the EN-adjacent locales (Q1.6b2); ZH needs native-speaker
  // review before being relied on for legal cover.
  const map: Record<Locale, string> = {
    en: "This report reflects 6's best understanding from your conversation and the photos / video you shared. Always exercise judgment, follow local codes, and call a licensed professional if any step feels unsafe.",
    es: "Este informe refleja el mejor entendimiento de 6 a partir de tu conversación y de las fotos / videos que compartiste. Usa siempre tu criterio, respeta las normas locales y llama a un profesional con licencia si algún paso te parece inseguro.",
    fr: "Ce rapport reflète la meilleure compréhension de 6 à partir de votre conversation et des photos / vidéos que vous avez partagées. Faites toujours preuve de jugement, respectez les normes locales et appelez un professionnel agréé si une étape vous semble dangereuse.",
    pt: "Este relatório reflete o melhor entendimento do 6 com base na sua conversa e nas fotos / vídeos que você compartilhou. Use sempre o bom senso, siga as normas locais e chame um profissional licenciado se qualquer etapa parecer insegura.",
    de: "Dieser Bericht spiegelt das beste Verständnis von 6 aus deinem Gespräch und den geteilten Fotos / Videos wider. Setze immer dein eigenes Urteilsvermögen ein, beachte örtliche Vorschriften und rufe einen lizenzierten Fachmann, wenn dir ein Schritt unsicher erscheint.",
    zh: "本报告反映了 6 根据您的对话以及您分享的照片/视频所做的最佳理解。请始终运用您自己的判断,遵守当地规范,如果任何步骤让您觉得不安全,请联系持证专业人员。",
  };
  return map[locale] ?? map.en;
}

async function fetchSessionTranscript(
  url: string,
  serviceRoleKey: string,
  sessionId: string,
): Promise<ConversationRow[]> {
  const res = await fetch(
    `${url}/rest/v1/conversation_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=role,message,la_absolute_timestamp&order=la_absolute_timestamp.asc.nullslast&limit=${MAX_TURNS}`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!res.ok) return [];
  return (await res.json()) as ConversationRow[];
}

async function fetchSessionMedia(
  url: string,
  serviceRoleKey: string,
  sessionId: string,
): Promise<MediaEventRow[]> {
  const res = await fetch(
    `${url}/rest/v1/media_events?session_id=eq.${encodeURIComponent(sessionId)}&select=storage_path,source,gemini_analysis,problem_at_time,created_at&order=created_at.asc&limit=${MAX_MEDIA}`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!res.ok) return [];
  return (await res.json()) as MediaEventRow[];
}

/**
 * Compose a structured fix-it Report by feeding the session's transcript
 * and media analyses to an LLM and asking for JSON in the Report schema.
 *
 * Robust to missing data: empty conversation → returns a minimal "we
 * didn't gather enough yet" report instead of throwing.
 */
export async function composeReport(args: {
  sessionId: string;
  locale: Locale;
  userFirstName?: string | null;
}): Promise<Report> {
  const locale = args.locale;
  if (!OPENAI_API_KEY) {
    return fallbackReport({
      locale,
      reason: "OPENAI_API_KEY not configured",
    });
  }

  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const [turns, media] = await Promise.all([
    fetchSessionTranscript(url, serviceRoleKey, args.sessionId),
    fetchSessionMedia(url, serviceRoleKey, args.sessionId),
  ]);

  if (turns.length === 0 && media.length === 0) {
    return fallbackReport({ locale, reason: "no conversation data" });
  }

  const transcriptBlock = turns
    .map((t) => `${t.role === "user" ? "USER" : "6"}: ${t.message}`)
    .join("\n");

  const mediaBlock = media
    .filter((m) => m.gemini_analysis)
    .map(
      (m, i) =>
        `[photo #${i + 1} — source=${m.source}, captured ${m.created_at}]\n${m.gemini_analysis}`,
    )
    .join("\n\n");

  const photoIndex = media
    .filter((m) => m.gemini_analysis)
    .map((m, i) => ({ idx: i + 1, storage_path: m.storage_path }));

  const language = languageDirective(locale);

  const system = `You compose a structured fix-it report for a homeowner from their conversation with "6" (an AI handyman) plus AI-generated descriptions of the photos / video they shared.

CRITICAL OUTPUT RULES
- STRICT JSON only. No markdown fences, no commentary.
- All text fields MUST be written in ${language}.
- Output schema:
  {
    "title": string,                      // short, descriptive
    "summary": string,                    // 1-2 sentence overview of the situation + recommended action
    "problem_statement": string,          // the user's problem in their own words, normalized
    "diagnosis": string,                  // 6's best read on what's actually going on
    "sections": [{"heading": string, "body": string}, ...],
    "materials": [{"name": string, "qty"?: string, "notes"?: string}, ...],
    "steps": [{"number": int, "title": string, "detail": string, "cautions"?: string}, ...],
    "photos": [{"index": int, "caption": string}, ...]    // index = the [photo #N] number from the input
  }

CONTENT RULES
- Be honest about uncertainty. If you can't diagnose from the data, say so in 'diagnosis' and recommend calling a licensed pro.
- Don't invent materials or steps that weren't supported by the conversation or photos.
- Don't include legal disclaimers or contractor recommendations in the JSON — the caller wraps those.
- "sections" is for context the homeowner needs that doesn't fit elsewhere (safety, code requirements, why this fix works). 1-4 sections max.
- "steps" should be ordered and actionable. Include 'cautions' when there's a real safety/permanent-damage risk.
- "photos[].index" must match the [photo #N] tags in the input. Only include photos the user should be reminded of in the report — skip noisy ones.

If the input is too thin to produce a useful report, return:
  { "title": "Report not ready", "summary": "We didn't gather enough information to produce a useful fix-it report yet.", "problem_statement": "", "diagnosis": "", "sections": [], "materials": [], "steps": [], "photos": [] }`;

  const user = `CONVERSATION (chronological):
${transcriptBlock || "(no messages)"}

PHOTO / VIDEO ANALYSES:
${mediaBlock || "(no photos)"}

USER FIRST NAME: ${args.userFirstName?.trim() || "(unknown)"}

Compose the report. Output JSON only.`;

  let json: unknown;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: COMPOSER_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      return fallbackReport({
        locale,
        reason: `openai ${res.status}`,
      });
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    json = JSON.parse(raw);
  } catch (e) {
    return fallbackReport({
      locale,
      reason: e instanceof Error ? e.message : "compose threw",
    });
  }

  return normalizeReport({
    parsed: json,
    locale,
    photoIndex,
  });
}

function fallbackReport(args: { locale: Locale; reason: string }): Report {
  return {
    title: "Report not ready",
    summary:
      "We didn't gather enough information to produce a useful fix-it report yet.",
    problem_statement: "",
    diagnosis: "",
    sections: [],
    materials: [],
    steps: [],
    photos: [],
    locale: args.locale,
    legal_disclaimer: defaultDisclaimer(args.locale),
  };
}

function normalizeReport(args: {
  parsed: unknown;
  locale: Locale;
  photoIndex: Array<{ idx: number; storage_path: string }>;
}): Report {
  const p = (args.parsed ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;

  type RawPhoto = { index?: unknown; caption?: unknown };
  type RawSection = { heading?: unknown; body?: unknown };
  type RawMaterial = { name?: unknown; qty?: unknown; notes?: unknown };
  type RawStep = {
    number?: unknown;
    title?: unknown;
    detail?: unknown;
    cautions?: unknown;
  };

  const sections = Array.isArray(p.sections)
    ? (p.sections as RawSection[]).map((s) => ({
        heading: str(s.heading),
        body: str(s.body),
      }))
    : [];

  const materials = Array.isArray(p.materials)
    ? (p.materials as RawMaterial[]).map((m) => ({
        name: str(m.name),
        qty: typeof m.qty === "string" ? m.qty : undefined,
        notes: typeof m.notes === "string" ? m.notes : undefined,
      }))
    : [];

  const steps = Array.isArray(p.steps)
    ? (p.steps as RawStep[]).map((s, i) => ({
        number:
          typeof s.number === "number" && s.number > 0 ? s.number : i + 1,
        title: str(s.title),
        detail: str(s.detail),
        cautions: typeof s.cautions === "string" ? s.cautions : undefined,
      }))
    : [];

  // Map LLM photo indices back to storage paths.
  const photoMap = new Map(
    args.photoIndex.map((p) => [p.idx, p.storage_path]),
  );
  const photos = Array.isArray(p.photos)
    ? (p.photos as RawPhoto[])
        .map((ph) => {
          const idx =
            typeof ph.index === "number" ? ph.index : Number(ph.index);
          const path = photoMap.get(idx);
          if (!path) return null;
          return {
            storage_path: path,
            caption: typeof ph.caption === "string" ? ph.caption : "",
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  return {
    title: str(p.title, "Fix-it report"),
    summary: str(p.summary),
    problem_statement: str(p.problem_statement),
    diagnosis: str(p.diagnosis),
    sections,
    materials,
    steps,
    photos,
    locale: args.locale,
    legal_disclaimer: defaultDisclaimer(args.locale),
  };
}
