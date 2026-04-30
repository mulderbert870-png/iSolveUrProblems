import {
  MAX_TRANSCRIPTION_TEXT_CHARS,
  truncateUtf8String,
} from "./apiRouteSecurity";
import {
  detectFollowUpIntent,
  extractContactDetails,
  isGarbageNameCandidate,
} from "./contactExtraction";
import { notifyNewLead, shouldFireLeadAlert } from "./leadAlert";
import { getSupabaseAdminConfig } from "./supabaseAdmin";

export type LeadSessionRow = {
  session_id: string;
  consent_status: "unknown" | "accepted" | "declined";
  full_name: string | null;
  email: string | null;
  phone: string | null;
  last_prompted_field: string | null;
  last_prompted_at: string | null;
};

export type LeadCaptureResult = {
  extracted: {
    email: string | null;
    phone: string | null;
    full_name: string | null;
    consent_status: LeadSessionRow["consent_status"];
  };
  assistantPrompt: string | null;
  shouldSkipVision: boolean;
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

type ContactEntityRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source_text: string | null;
  created_at?: string;
};

function appendSourceText(prev: string | null, next: string): string {
  const n = next.trim();
  if (!n) return prev?.trim() ?? "";
  if (!prev?.trim()) return n;
  if (prev.includes(n)) return prev.trim();
  return `${prev.trim()}\n---\n${n}`;
}

function pickScalar(prev: string | null, next: string | null): string | null {
  const t = next?.trim();
  if (t) return t;
  return prev?.trim() ?? null;
}

function pickBetterFullName(prev: string | null, next: string | null): string | null {
  const n = next?.trim() ?? "";
  if (!n || isGarbageNameCandidate(n)) return prev?.trim() ?? null;
  const p = prev?.trim() ?? "";
  if (!p || isGarbageNameCandidate(p)) return n;
  if (n.length > p.length && n.split(/\s+/).length >= p.split(/\s+/).length) {
    return n;
  }
  return p;
}

/**
 * One consolidated row per session: merge new extraction with any existing row(s).
 */
async function upsertMergedContactEntity(
  url: string,
  serviceRoleKey: string,
  sessionId: string,
  partial: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    source_text: string;
  },
) {
  const listRes = await fetch(
    `${url}/rest/v1/contact_entities?session_id=eq.${encodeURIComponent(sessionId)}&select=id,full_name,email,phone,source_text,created_at&order=created_at.asc`,
    {
      method: "GET",
      headers: supabaseHeaders(serviceRoleKey),
    },
  );
  if (!listRes.ok) {
    throw new Error(`contact_entities list failed (${listRes.status})`);
  }
  const rows = (await listRes.json()) as ContactEntityRow[];

  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let sourceText: string | null = null;

  for (const r of rows) {
    fullName = pickBetterFullName(fullName, r.full_name);
    email = pickScalar(email, r.email);
    phone = pickScalar(phone, r.phone);
    sourceText = appendSourceText(sourceText, r.source_text ?? "");
  }

  fullName = pickBetterFullName(fullName, partial.full_name);
  if (partial.email?.trim()) email = partial.email.trim();
  if (partial.phone?.trim()) phone = partial.phone.trim();
  sourceText = appendSourceText(sourceText, partial.source_text);

  const headersPatch = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  if (rows.length === 0) {
    const res = await fetch(`${url}/rest/v1/contact_entities`, {
      method: "POST",
      headers: supabaseHeaders(serviceRoleKey),
      body: JSON.stringify({
        session_id: sessionId,
        full_name: fullName,
        email,
        phone,
        source_text: sourceText || null,
      }),
    });
    if (!res.ok) {
      throw new Error(`contact_entities insert failed (${res.status})`);
    }
    return;
  }

  const keepId = rows[0].id;
  const patchRes = await fetch(
    `${url}/rest/v1/contact_entities?id=eq.${encodeURIComponent(keepId)}`,
    {
      method: "PATCH",
      headers: headersPatch,
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone,
        source_text: sourceText || null,
      }),
    },
  );
  if (!patchRes.ok) {
    throw new Error(`contact_entities patch failed (${patchRes.status})`);
  }

  for (let i = 1; i < rows.length; i++) {
    const delRes = await fetch(
      `${url}/rest/v1/contact_entities?id=eq.${encodeURIComponent(rows[i].id)}`,
      {
        method: "DELETE",
        headers: headersPatch,
      },
    );
    if (!delRes.ok) {
      throw new Error(`contact_entities delete failed (${delRes.status})`);
    }
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

function chooseNextPrompt(
  lead: LeadSessionRow,
  latest: { email: string | null; phone: string | null; fullName: string | null },
  userUtteranceCount: number,
): {
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

  // CLIENT-SIDE NAME-ASK ENFORCEMENT (added 2026-04-25 after smoke test where
  // 6 went 60+ turns without ever asking a name despite CW v13 saying to ask
  // by turn 3). When the user has racked up >=3 utterances and we still have
  // no name AND we haven't asked yet, fire a one-time friendly ask. Won't
  // re-fire because last_prompted_at gates it via the cooldown above.
  const hasName = Boolean(lead.full_name && lead.full_name.trim().length >= 2);
  if (
    !hasName &&
    !lead.last_prompted_field &&
    userUtteranceCount >= 3
  ) {
    return {
      prompt:
        "Before we go too far — what should I call you? Just your first name is fine.",
      promptField: "full_name",
      shouldSkipVision: true,
    };
  }

  // Deterministic acknowledgement when user just shared contact details.
  // This avoids model replies like "I can't store personal information."
  if (latest.phone || latest.email) {
    const hasName = Boolean(lead.full_name && lead.full_name.trim().length >= 2);
    if (latest.phone && latest.email) {
      return {
        prompt: hasName
          ? "Perfect, I saved your phone number and email."
          : "Perfect, I saved your phone number and email. Could you also share your full name?",
        promptField: hasName ? null : "full_name",
        shouldSkipVision: true,
      };
    }
    if (latest.phone) {
      return {
        prompt: hasName
          ? "Perfect, I saved your phone number."
          : "Perfect, I saved your phone number. Could you also share your full name?",
        promptField: hasName ? null : "full_name",
        shouldSkipVision: true,
      };
    }
    return {
      prompt: hasName
        ? "Perfect, I saved your email."
        : "Perfect, I saved your email. Could you also share your full name?",
      promptField: hasName ? null : "full_name",
      shouldSkipVision: true,
    };
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

/**
 * Persist lead extraction for one user utterance (used by /api/transcription/capture
 * and LiveAvatar official transcript sync for `user` lines).
 */
export async function persistUserUtteranceLeadCapture(
  sessionId: string,
  rawText: string,
): Promise<LeadCaptureResult> {
  const text = truncateUtf8String(rawText.trim(), MAX_TRANSCRIPTION_TEXT_CHARS);
  const { email, phone, fullName } = extractContactDetails(text);
  const intent = detectFollowUpIntent(text);
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  let existingLead: LeadSessionRow | null = null;
  existingLead = await getLeadSession(url, serviceRoleKey, sessionId);

  // Count of prior user utterances on this session (used to gate the
  // turn-3 name-ask enforcement). Counts transcript_events that already
  // exist BEFORE we insert the current one.
  let userUtteranceCount = 1;
  try {
    const headRes = await fetch(
      `${url}/rest/v1/transcript_events?session_id=eq.${encodeURIComponent(sessionId)}&select=id`,
      {
        method: "GET",
        headers: {
          ...supabaseHeaders(serviceRoleKey),
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: "0-0",
        },
      },
    );
    if (headRes.ok) {
      const range = headRes.headers.get("content-range");
      const total = range?.split("/")[1];
      const n = total ? parseInt(total, 10) : NaN;
      if (Number.isFinite(n) && n >= 0) {
        userUtteranceCount = n + 1;
      }
    }
  } catch {
    // Best-effort count; if the lookup fails we just default to 1 and
    // skip the name-ask enforcement until next utterance.
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
  if (email || phone || fullName) consentStatus = "accepted";

  const mergedLead: LeadSessionRow = {
    ...currentLead,
    consent_status: consentStatus,
    full_name: pickBetterFullName(currentLead.full_name, fullName),
    email: pickScalar(currentLead.email, email),
    phone: pickScalar(currentLead.phone, phone),
    last_prompted_field: currentLead.last_prompted_field,
    last_prompted_at: currentLead.last_prompted_at,
  };

  const next = chooseNextPrompt(
    mergedLead,
    {
      email,
      phone,
      fullName,
    },
    userUtteranceCount,
  );
  const nowIso = new Date().toISOString();
  if (next.promptField) {
    mergedLead.last_prompted_field = next.promptField;
    mergedLead.last_prompted_at = nowIso;
  }

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

  if (email || phone || fullName) {
    await upsertMergedContactEntity(url, serviceRoleKey, sessionId, {
      email,
      phone,
      full_name: fullName,
      source_text: text,
    });
  }

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

  // Fire lead alert (Telegram + email) when this utterance crossed the
  // threshold from "no usable lead" to "we have name + at least one of
  // phone/email." Fire-and-forget — never block the response on alerting.
  if (
    shouldFireLeadAlert(
      {
        full_name: currentLead.full_name,
        phone: currentLead.phone,
        email: currentLead.email,
      },
      {
        full_name: mergedLead.full_name,
        phone: mergedLead.phone,
        email: mergedLead.email,
      },
    )
  ) {
    void notifyNewLead(
      {
        sessionId,
        fullName: mergedLead.full_name,
        phone: mergedLead.phone,
        email: mergedLead.email,
      },
      url,
      serviceRoleKey,
    );
  }

  return {
    extracted: {
      email: mergedLead.email,
      phone: mergedLead.phone,
      full_name: mergedLead.full_name,
      consent_status: mergedLead.consent_status,
    },
    assistantPrompt: next.prompt,
    shouldSkipVision: next.shouldSkipVision,
  };
}
