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
  if (digits.length < 10 || digits.length > 15) return null;
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
]);

function trimNameValue(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[.,!?;:]+$/g, "").trim();
}

/** Up to five name tokens (avoids swallowing "I'm looking for ..."). */
const NAME_CHUNK =
  "([\\p{L}]+(?:['\\-.][\\p{L}]+)*(?:\\s+[\\p{L}]+(?:['\\-.][\\p{L}]+)*){0,4})";

function extractFullNameFromPatterns(text: string): string | null {
  const patterns: RegExp[] = [
    new RegExp(
      String.raw`(?:my name is|my name'?s)\s+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
    new RegExp(String.raw`(?:i am|i'?m|im)\s+${NAME_CHUNK}(?:[.,!?…]|$)`, "iu"),
    new RegExp(
      String.raw`(?:this is|it'?s|it is|here'?s|here is)\s+${NAME_CHUNK}(?:[.,!?…]|$)`,
      "iu",
    ),
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
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = trimNameValue(match[1]);
    if (value.length < 2) continue;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 5) continue;
    if (!words.every((w) => NAME_TOKEN.test(w) || NAME_INITIAL.test(w))) {
      continue;
    }
    if (words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) {
      continue;
    }
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

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return null;

  if (!words.every((w) => NAME_TOKEN.test(w) || NAME_INITIAL.test(w))) {
    return null;
  }

  const lower = t.toLowerCase();
  if (FULL_UTTERANCE_NOT_A_NAME.has(lower)) return null;
  if (words.some((w) => NAME_STOP_WORDS.has(w.toLowerCase()))) {
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
  if (FULL_UTTERANCE_NOT_A_NAME.has(lower) || NAME_STOP_WORDS.has(lower)) {
    return null;
  }
  return t;
}

function extractFullName(text: string): string | null {
  return (
    extractFullNameFromPatterns(text) ??
    extractFullNamePlainUtterance(text) ??
    extractFullNameSingleWord(text)
  );
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

  const fullName = extractFullName(text);

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
