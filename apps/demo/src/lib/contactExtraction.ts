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

function extractFullName(text: string): string | null {
  const patterns = [
    /(?:my name is|i am|i'm|this is)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})/i,
    /name[:\s]+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1].trim();
    if (value.length < 2) continue;
    return value;
  }
  return null;
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
