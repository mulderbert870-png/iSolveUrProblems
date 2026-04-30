type ContactExtraction = {
  email: string | null;
  phone: string | null;
  fullName: string | null;
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_REGEX =
  /(?:\+?\d{1,3}[\s\-().]*)?(?:\d[\s\-().]*){9,15}\d/g;

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[^\d+]/g, "");
  const plusPrefixed = cleaned.startsWith("+");
  const digits = cleaned.replace(/[^\d]/g, "");
  // Relaxed on purpose: keep any phone-like spoken value, even short/local numbers.
  if (digits.length === 0) return null;
  return plusPrefixed ? `+${digits}` : digits;
}

function decodeSpokenEmailVariants(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+underscore\s+/g, "_")
    .replace(/\s+dash\s+/g, "-")
    .replace(/\s+/g, "");
}

/** Word: letters (any script) with optional inner hyphen or apostrophe, e.g. O'Brien, Mary-Jane */
const NAME_TOKEN =
  /^[\p{L}]+(?:['\-.][\p{L}]+)*$/u;
/** Optional single-letter middle initial */
const NAME_INITIAL = /^[\p{L}]\.?$/u;

const FULL_UTTERANCE_NOT_A_NAME = new Set(
  [
    "yes",
    "no",
    "yeah",
    "yep",
    "nope",
    "ok",
    "okay",
    "sure",
    "thanks",
    "thank you",
    "hello",
    "hi",
    "hey",
    "bye",
    "goodbye",
    "please",
    "help",
    "not interested",
    "no thanks",
    "no thank you",
    // Problem-solved / conversation-winddown phrases (added 2026-04-24)
    "all set",
    "all good",
    "all done",
    "all fine",
    "all ready",
    "good to go",
    "gotta go",
    "gotta run",
    "heading out",
    "on my way",
    "got it",
    "i got it",
    "that's it",
    "thats it",
    "got you",
    "gotcha",
  ].map((s) => s.toLowerCase()),
);

const NAME_STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "but",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "my",
  "our",
  "can",
  "you",
  "how",
  "what",
  "when",
  "where",
  "why",
  "yes",
  "no",
  "not",
  "dont",
  "don't",
  "cant",
  "can't",
  "need",
  "want",
  "like",
  "just",
  "only",
  "very",
  "really",
  "actually",
  "also",
  "uh",
  "um",
  "well",
  "so",
  "its",
  "it's",
  "basically",
  "literally",
  "some",
  "these",
  "those",
  "there",
  "here",
  "missing",
  "have",
  "has",
  "had",
  "were",
  "was",
  "been",
  "being",
  "give",
  "him",
  "her",
  "them",
  "they",
  "thank",
  "thanks",
  "please",
  "is",
  "around",
  "near",
  "window",
  "door",
  "inside",
  "outside",
  // Added 2026-04-23 after misfires captured in Supabase contact_entities:
  // "gonna hit go live again" and "totally open" were both getting saved as
  // names from "I'm gonna hit go live again" and "I'm totally open."
  "gonna",
  "wanna",
  "gotta",
  "tryna",
  "going",
  "hit",
  "open",
  "close",
  "closed",
  "click",
  "clicked",
  "tap",
  "tapped",
  "press",
  "pressed",
  "go",
  "come",
  "came",
  "live",
  "back",
  "again",
  "still",
  "totally",
  "okay",
  "alright",
  "ready",
  "interested",
  "show",
  "see",
  "saw",
  "look",
  "looking",
  "watch",
  "watching",
  "doing",
  "trying",
  "thinking",
  "maybe",
  "probably",
  "definitely",
]);

/** Single word after "I'm" / "I am" that is status, not a name */
const IM_STATUS_WORDS = new Set([
  "fine",
  "good",
  "ok",
  "okay",
  "sure",
  "well",
  "here",
  "done",
  "back",
  "glad",
  "happy",
  "sorry",
  "sick",
  "tired",
  "busy",
  "free",
  "ready",
  "late",
  "early",
  "great",
  "bad",
  "okay.",
  "fine.",
]);

/**
 * Multi-word status phrases after "I'm" / "I am" that terminate or acknowledge
 * but are not names. "I'm all set" must NOT be captured as the name "all set".
 * (Added 2026-04-24 after Supabase captured "all set" as a name.)
 */
const IM_STATUS_PHRASES = new Set([
  "all set",
  "all good",
  "all done",
  "all fine",
  "all ready",
  "good to go",
  "done here",
  "pretty good",
  "pretty tired",
  "just fine",
  "not sure",
  "not okay",
  "going to go",
  "gonna go",
  "gotta go",
  "heading out",
  "on my way",
  "out of here",
]);

/** Never treat as a person's name (whole value or word). */
const INVALID_NAME_TOKENS = new Set([
  "email",
  "e-mail",
  "phone",
  "telephone",
  "mobile",
  "cell",
  "mail",
  "gmail",
  "yahoo",
  "hotmail",
  "outlook",
  "icloud",
  "contact",
  "address",
  "website",
  "www",
  "fine",
  "good",
]);

function trimNameValue(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[.,!?;:]+$/g, "").trim();
}

function stripLeadingNameNoise(s: string): string {
  let value = s.trim();
  // Handles stutters/fillers like: "um, is Greg", "uh Greg", "is Greg"
  value = value.replace(/^(?:(?:uh|um|ah|er)\b[\s,.-]*)+/i, "");
  value = value.replace(/^(?:is|it's|its)\b[\s,.-]*/i, "");
  return value.trim();
}

function stripTrailingNonNameTail(s: string): string {
  let value = s.trim();
  // Cut off known follow-up clauses often appended by STT in same utterance.
  const cutters = [
    /\b(?:and|but)\b/i,
    /\b(?:from|i'm from|i am from)\b/i,
    /\b(?:my phone|phone number|email|e-mail)\b/i,
  ];
  for (const cutter of cutters) {
    const m = value.match(cutter);
    if (m && m.index != null && m.index > 0) {
      value = value.slice(0, m.index).trim();
    }
  }
  return value.trim();
}

/**
 * Avatar / product intro lines (often mis-tagged or echoed in transcript) — never treat as user contact name.
 */
function looksLikeAssistantOrDemoPersona(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /\b(your ai buddy|your home and garden|home and garden buddy|garden buddy|guards buddy)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bwhy they call me\b/.test(t)) return true;
  if (/\bhey there,?\s+i'?m\s+\w+,\s+your\b/.test(t)) return true;
  if (/\bi'?m\s+six\b.*\b(buddy|garden|ai)\b/.test(t)) return true;
  // Generic HeyGen-style intro: "I'm …, your … buddy"
  if (
    /\bi'?m\s+[^,\n]{1,40},\s*your\s+(ai buddy|home and garden buddy|garden buddy|buddy)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

/** "it's around a window" — location / scene, not a person */
function isLocationOrSpatialPhrase(value: string): boolean {
  return /\b(around|near|behind|beside|next to|through|over|under|inside|outside|toward|towards)\b/i.test(
    value,
  ) || /\b(window|door|wall|ceiling|floor|room|kitchen|garden|outside)\b/i.test(value);
}

/**
 * "My name is the letter G" / spelled letter (STT often says "the letter G")
 */
function extractLetterSpelledName(text: string): string | null {
  const m1 = text.match(/\bmy name is\s+the\s+letter\s+([\p{L}])\b/iu);
  if (m1?.[1]) {
    return m1[1].toUpperCase();
  }
  const m2 = text.match(/\bmy name is\s+letter\s+([\p{L}])\b/iu);
  if (m2?.[1]) {
    return m2[1].toUpperCase();
  }
  return null;
}

export function isGarbageNameCandidate(s: string | null | undefined): boolean {
  if (!s?.trim()) return true;
  const t = s.trim();
  const lower = t.toLowerCase();
  if (INVALID_NAME_TOKENS.has(lower)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.some((w) => INVALID_NAME_TOKENS.has(w.toLowerCase()))) {
    return true;
  }
  // Filler + real name in same string: "actually Scott also"
  if (words.length > 1 && words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) {
    return true;
  }
  // Common sentence openers, not names
  if (/^(some|these|those)\s+of\s+/i.test(t)) return true;
  if (/\b(to have|want to|going to|trying to)\b/i.test(lower)) return true;
  // Spanish / other — "que se vea" etc. (not a person's name line)
  if (/\b(que|qué)\s+se\s+/i.test(t)) return true;
  if (/\b(muy|bonita|bonito|gracias|por favor)\b/i.test(lower) && words.length >= 2) {
    return true;
  }
  if (/\b(around|near)\s+(a|the)\s+\w+/i.test(lower)) return true;
  return false;
}

/** Up to five name tokens (avoids swallowing "I'm looking for ..."). */
const NAME_CHUNK =
  "([\\p{L}]+(?:['\\-.][\\p{L}]+)*(?:\\s+[\\p{L}]+(?:['\\-.][\\p{L}]+)*){0,4})";

function stripTrailingClauseAfterName(s: string): string {
  return s.split(/,/)[0].trim();
}

/**
 * Strong signal: "my name is Gregory" anywhere in the utterance (even after "---").
 * Picks the longest plausible chunk when multiple matches exist.
 */
function extractMyNameIsExplicit(text: string): string | null {
  const re = new RegExp(
    String.raw`\bmy name is\s+${NAME_CHUNK}`,
    "giu",
  );
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let value = trimNameValue(m[1]);
    value = stripTrailingClauseAfterName(value);
    value = stripLeadingNameNoise(value);
    value = stripTrailingNonNameTail(value);
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 5) continue;
    if (!words.every((w) => NAME_TOKEN.test(w) || NAME_INITIAL.test(w))) {
      continue;
    }
    if (words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) continue;
    if (words.some((w) => INVALID_NAME_TOKENS.has(w.toLowerCase()))) continue;
    if (isGarbageNameCandidate(value)) continue;
    if (!best || value.length > best.length) best = value;
  }
  return best;
}

function isImOrItsStatusOnly(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[.,!?]+$/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return IM_STATUS_WORDS.has(words[0]);
  }
  // Multi-word status phrases: "all set", "gonna go", etc.
  if (IM_STATUS_PHRASES.has(normalized)) return true;
  // "all X" where X is a status word
  if (words.length === 2 && words[0] === "all" && IM_STATUS_WORDS.has(words[1])) {
    return true;
  }
  return false;
}

function extractFullNameFromPatterns(text: string): string | null {
  const patterns: RegExp[] = [
    new RegExp(
      String.raw`(?:my name is|my name'?s)\s+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
    new RegExp(String.raw`(?:i am|i'?m|im)\s+${NAME_CHUNK}(?:[.,!?…]|$)`, "iu"),
    new RegExp(
      String.raw`(?:you can )?call me\s+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
    new RegExp(
      String.raw`(?:they call me|people call me)\s+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
    new RegExp(String.raw`full name[:\s]+${NAME_CHUNK}(?:[.,!?…]|$)`, "iu"),
    new RegExp(
      String.raw`(?:^|\s)name[:\s]+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
  ];
  for (let pi = 0; pi < patterns.length; pi++) {
    const pattern = patterns[pi];
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    let value = trimNameValue(match[1]);
    value = stripTrailingClauseAfterName(value);
    value = stripLeadingNameNoise(value);
    value = stripTrailingNonNameTail(value);
    if (value.length < 2) continue;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 5) continue;
    if (!words.every((w) => NAME_TOKEN.test(w) || NAME_INITIAL.test(w))) {
      continue;
    }
    if (words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) {
      continue;
    }
    if (INVALID_NAME_TOKENS.has(value.toLowerCase())) continue;
    if (words.some((w) => INVALID_NAME_TOKENS.has(w.toLowerCase()))) continue;
    // Index 1 = "i am|i'm|im" — reject "I'm fine"
    if (pi === 1 && isImOrItsStatusOnly(value)) continue;
    return value;
  }
  return null;
}

/**
 * When the user answers with only a name (e.g. "John Smith" after "share your full name"),
 * there is no "my name is" prefix — treat short, letter-only multi-word lines as names.
 */
function extractFullNamePlainUtterance(text: string): string | null {
  const t = trimNameValue(text);
  if (t.length < 4 || t.length > 70) return null;
  if (/[?]/.test(t)) return null;
  if (/\d/.test(t)) return null;
  if (!/^[\p{L}\s'\-.]+$/u.test(t)) return null;
  // Long all-lowercase lines are usually sentences, not "First Last"
  if (t.length > 40 && t === t.toLowerCase()) return null;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;

  if (!words.every((w) => NAME_TOKEN.test(w) || NAME_INITIAL.test(w))) {
    return null;
  }

  const lower = t.toLowerCase();
  if (FULL_UTTERANCE_NOT_A_NAME.has(lower)) return null;
  if (words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) {
    return null;
  }
  if (words.some((w) => INVALID_NAME_TOKENS.has(w.toLowerCase()))) {
    return null;
  }

  return t;
}

/** Single given name only, e.g. "Jennifer" (avoid "yes", "help"). */
function extractFullNameSingleWord(text: string): string | null {
  const t = trimNameValue(text);
  if (t.length < 3 || t.length > 40) return null;
  if (/[?]/.test(t) || /\d/.test(t) || /\s/.test(t)) return null;
  if (!NAME_TOKEN.test(t)) return null;
  const lower = t.toLowerCase();
  if (
    FULL_UTTERANCE_NOT_A_NAME.has(lower) ||
    NAME_STOP_WORDS.has(lower) ||
    INVALID_NAME_TOKENS.has(lower) ||
    IM_STATUS_WORDS.has(lower.replace(/[.,!?]+$/, ""))
  ) {
    return null;
  }
  return t;
}

function extractFullName(text: string): string | null {
  if (looksLikeAssistantOrDemoPersona(text)) return null;
  const raw =
    extractLetterSpelledName(text) ??
    extractMyNameIsExplicit(text) ??
    extractFullNameFromPatterns(text);
  if (!raw) return null;
  if (isGarbageNameCandidate(raw)) return null;
  return raw;
}

export function extractContactDetails(text: string): ContactExtraction {
  const spokenEmailText = decodeSpokenEmailVariants(text);

  const emailMatch = text.match(EMAIL_REGEX) || spokenEmailText.match(EMAIL_REGEX);
  const email = emailMatch?.[0] ? normalizeEmail(emailMatch[0]) : null;

  let phone: string | null = null;
  const phoneMatches = text.match(PHONE_REGEX) || [];
  for (const candidate of phoneMatches) {
    const normalized = normalizePhone(candidate);
    if (normalized) {
      phone = normalized;
      break;
    }
  }

  // Still extract phone/email from persona lines; skip names only
  const fullName = looksLikeAssistantOrDemoPersona(text)
    ? null
    : extractFullName(text);

  return { email, phone, fullName };
}

export function detectFollowUpIntent(text: string): {
  interested: boolean;
  declined: boolean;
} {
  const t = text.toLowerCase();
  const interestedKeywords = [
    "yes",
    "follow up",
    "reach me",
    "contact me",
    "call me",
    "email me",
    "book",
    "schedule",
    "demo",
    "quote",
    "pricing",
    "send me",
  ];
  const declinedKeywords = [
    "no thanks",
    "do not contact",
    "don't contact",
    "no follow up",
    "not interested",
    "stop",
  ];

  return {
    interested: interestedKeywords.some((kw) => t.includes(kw)),
    declined: declinedKeywords.some((kw) => t.includes(kw)),
  };
}
