import {
  MAX_TRANSCRIPTION_TEXT_CHARS,
  isSafeTranscriptionSessionId,
  truncateUtf8String,
} from "../../../../src/lib/apiRouteSecurity";
import {
  detectFollowUpIntent,
  extractContactDetails,
} from "../../../../src/lib/contactExtraction";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";

type LeadSessionRow = {
  session_id: string;
  consent_status: "unknown" | "accepted" | "declined";
  full_name: string | null;
  email: string | null;
  phone: string | null;
  last_prompted_field: string | null;
  last_prompted_at: string | null;
};

function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function getLeadSession(
  url: string,
  serviceRoleKey: string,
  sessionId: string,
): Promise<LeadSessionRow | null> {
  const endpoint = `${url}/rest/v1/lead_sessions?session_id=eq.${encodeURIComponent(
    sessionId,
  )}&select=session_id,consent_status,full_name,email,phone,last_prompted_field,last_prompted_at&limit=1`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: supabaseHeaders(serviceRoleKey),
  });
  if (!res.ok) {
    throw new Error(`lead_sessions read failed (${res.status})`);
  }
  const data = (await res.json()) as LeadSessionRow[];
  return data[0] ?? null;
}

async function insertTranscriptEvent(
  url: string,
  serviceRoleKey: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`${url}/rest/v1/transcript_events`, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`transcript_events insert failed (${res.status})`);
  }
}

async function insertContactEntity(
  url: string,
  serviceRoleKey: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`${url}/rest/v1/contact_entities`, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`contact_entities insert failed (${res.status})`);
  }
}

async function upsertLeadSession(
  url: string,
  serviceRoleKey: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(
    `${url}/rest/v1/lead_sessions?on_conflict=session_id`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(serviceRoleKey),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([payload]),
    },
  );
  if (!res.ok) {
    throw new Error(`lead_sessions upsert failed (${res.status})`);
  }
}

function chooseNextPrompt(lead: LeadSessionRow): {
  prompt: string | null;
  promptField: string | null;
  shouldSkipVision: boolean;
} {
  const now = Date.now();
  const lastPromptMs = lead.last_prompted_at
    ? new Date(lead.last_prompted_at).getTime()
    : 0;
  const promptCooldownMs = 45_000;
  const inPromptCooldown = lastPromptMs > 0 && now - lastPromptMs < promptCooldownMs;
  if (inPromptCooldown) {
    return { prompt: null, promptField: null, shouldSkipVision: false };
  }

  if (lead.consent_status === "declined") {
    return { prompt: null, promptField: null, shouldSkipVision: false };
  }

  if (lead.consent_status === "accepted" && !lead.email && !lead.phone) {
    return {
      prompt:
        "What is the best way to reach you, email or phone? You can share whichever you prefer.",
      promptField: "contact_method",
      shouldSkipVision: true,
    };
  }

  if (lead.consent_status === "accepted" && (!lead.full_name || lead.full_name.length < 2)) {
    return {
      prompt: "Thanks. Could you also share your full name?",
      promptField: "full_name",
      shouldSkipVision: true,
    };
  }

  return { prompt: null, promptField: null, shouldSkipVision: false };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId: rawSessionId, text: rawText } = body;

    if (!isSafeTranscriptionSessionId(rawSessionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid sessionId" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (typeof rawText !== "string" || !rawText.trim()) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionId = rawSessionId.trim();
    const text = truncateUtf8String(rawText.trim(), MAX_TRANSCRIPTION_TEXT_CHARS);
    const { email, phone, fullName } = extractContactDetails(text);
    const intent = detectFollowUpIntent(text);
    const { url, serviceRoleKey } = getSupabaseAdminConfig();

    let existingLead: LeadSessionRow | null = null;
    try {
      existingLead = await getLeadSession(url, serviceRoleKey, sessionId);
    } catch (err) {
      console.error("Failed reading lead_sessions:", err);
      return new Response(
        JSON.stringify({ error: "Failed to read lead session" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const currentLead: LeadSessionRow = existingLead ?? {
      session_id: sessionId,
      consent_status: "unknown",
      full_name: null,
      email: null,
      phone: null,
      last_prompted_field: null,
      last_prompted_at: null,
    };

    let consentStatus = currentLead.consent_status;
    if (intent.declined) consentStatus = "declined";
    else if (intent.interested) consentStatus = "accepted";
    if (email || phone) consentStatus = "accepted";

    const mergedLead: LeadSessionRow = {
      ...currentLead,
      consent_status: consentStatus,
      full_name: fullName ?? currentLead.full_name,
      email: email ?? currentLead.email,
      phone: phone ?? currentLead.phone,
      last_prompted_field: currentLead.last_prompted_field,
      last_prompted_at: currentLead.last_prompted_at,
    };

    const next = chooseNextPrompt(mergedLead);
    const nowIso = new Date().toISOString();
    if (next.promptField) {
      mergedLead.last_prompted_field = next.promptField;
      mergedLead.last_prompted_at = nowIso;
    }

    try {
      await insertTranscriptEvent(url, serviceRoleKey, {
        session_id: sessionId,
        transcript: text,
        extracted_email: email,
        extracted_phone: phone,
        extracted_name: fullName,
        follow_up_intent: intent.interested
          ? "interested"
          : intent.declined
            ? "declined"
            : "neutral",
      });
    } catch (err) {
      console.error("Failed inserting transcript_events:", err);
      return new Response(
        JSON.stringify({ error: "Failed to store transcript event" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (email || phone || fullName) {
      try {
        await insertContactEntity(url, serviceRoleKey, {
          session_id: sessionId,
          email,
          phone,
          full_name: fullName,
          source_text: text,
        });
      } catch (err) {
        console.error("Failed inserting contact_entities:", err);
        return new Response(
          JSON.stringify({ error: "Failed to store extracted contact data" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    try {
      await upsertLeadSession(url, serviceRoleKey, {
        session_id: mergedLead.session_id,
        consent_status: mergedLead.consent_status,
        full_name: mergedLead.full_name,
        email: mergedLead.email,
        phone: mergedLead.phone,
        last_prompted_field: mergedLead.last_prompted_field,
        last_prompted_at: mergedLead.last_prompted_at,
        updated_at: nowIso,
      });
    } catch (err) {
      console.error("Failed upserting lead_sessions:", err);
      return new Response(
        JSON.stringify({ error: "Failed to upsert lead session" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        extracted: {
          email: mergedLead.email,
          phone: mergedLead.phone,
          full_name: mergedLead.full_name,
          consent_status: mergedLead.consent_status,
        },
        assistantPrompt: next.prompt,
        shouldSkipVision: next.shouldSkipVision,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error capturing transcription:", error);
    return new Response(
      JSON.stringify({ error: "Failed to capture transcription" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
