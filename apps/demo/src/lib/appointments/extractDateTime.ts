/**
 * M3.4 — Natural-language datetime extraction (rules-based, v1).
 *
 * Handles the phrasings real homeowners use when scheduling work with
 * 6. Returns a UTC ISO string and the matched phrase for diagnostics.
 *
 * NOT exhaustive — known-good patterns:
 *   - "tomorrow at 10am"           → relative day + clock time
 *   - "next Tuesday at 2pm"        → next weekday + clock time
 *   - "this Friday at 9"           → upcoming weekday + clock time
 *   - "in 2 hours"                 → relative duration
 *   - "Tuesday morning"            → weekday + part-of-day (defaults to 9am)
 *   - "June 15 at 10am"            → month-day + clock time
 *
 * For everything else we return undefined and let the caller fall back
 * to a clarifying follow-up question. v2 layers a small LLM disambiguator
 * on top if rules-coverage isn't sufficient in production.
 */

export type ExtractedDateTime = {
  iso_utc: string;
  matched_phrase: string;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const PART_OF_DAY: Record<string, { hour: number; minute: number }> = {
  morning: { hour: 9, minute: 0 },
  noon: { hour: 12, minute: 0 },
  afternoon: { hour: 14, minute: 0 },
  evening: { hour: 18, minute: 0 },
  night: { hour: 20, minute: 0 },
};

function parseClock(text: string): { hour: number; minute: number } | null {
  // 10am, 2pm, 2:30pm, 14:00, 9
  const m = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i,
  );
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, "");
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  // Bare number (no am/pm) — assume daytime hours: 8-19 → as-is; else +12
  if (!ampm && hour >= 1 && hour <= 7) hour += 12; // "at 3" → 3pm
  return { hour, minute };
}

function setLocalTime(
  base: Date,
  time: { hour: number; minute: number },
): Date {
  const d = new Date(base);
  d.setHours(time.hour, time.minute, 0, 0);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function findWeekday(text: string): number | null {
  const m = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i,
  );
  if (!m) return null;
  return WEEKDAYS.indexOf(m[1].toLowerCase().replace(/s$/, ""));
}

function findMonth(text: string): number | null {
  const m = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
  );
  if (!m) return null;
  const word = m[1].toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].startsWith(word)) return i;
  }
  return null;
}

function findPartOfDay(text: string): { hour: number; minute: number } | null {
  const m = text.match(/\b(morning|noon|afternoon|evening|night)\b/i);
  if (!m) return null;
  return PART_OF_DAY[m[1].toLowerCase()];
}

export function extractDateTime(
  text: string,
  now: Date = new Date(),
): ExtractedDateTime | undefined {
  const t = text.toLowerCase();

  // ── Pattern: "in N hours/minutes/days"
  const inMatch = t.match(/\bin\s+(\d+)\s+(hour|minute|day|week)s?\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit === "minute") d.setMinutes(d.getMinutes() + n);
    else if (unit === "hour") d.setHours(d.getHours() + n);
    else if (unit === "day") d.setDate(d.getDate() + n);
    else if (unit === "week") d.setDate(d.getDate() + n * 7);
    return { iso_utc: d.toISOString(), matched_phrase: inMatch[0] };
  }

  // ── Pattern: "tomorrow at X" / "tomorrow morning"
  if (/\btomorrow\b/.test(t)) {
    const day = addDays(now, 1);
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 10, minute: 0 };
    const result = setLocalTime(day, clock);
    return { iso_utc: result.toISOString(), matched_phrase: "tomorrow" };
  }

  // ── Pattern: "today at X" / "tonight" / "this afternoon"
  if (/\btoday\b/.test(t)) {
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 17, minute: 0 };
    const result = setLocalTime(now, clock);
    if (result.getTime() < now.getTime()) {
      // Promote to tomorrow if "today at 9am" is already past.
      const promoted = setLocalTime(addDays(now, 1), clock);
      return {
        iso_utc: promoted.toISOString(),
        matched_phrase: "today (rolled to tomorrow)",
      };
    }
    return { iso_utc: result.toISOString(), matched_phrase: "today" };
  }
  if (/\btonight\b/.test(t)) {
    const result = setLocalTime(now, { hour: 19, minute: 0 });
    if (result.getTime() < now.getTime()) {
      const promoted = setLocalTime(addDays(now, 1), { hour: 19, minute: 0 });
      return {
        iso_utc: promoted.toISOString(),
        matched_phrase: "tonight (rolled to tomorrow)",
      };
    }
    return { iso_utc: result.toISOString(), matched_phrase: "tonight" };
  }

  // ── Pattern: "(next|this) Weekday at X"
  const weekday = findWeekday(t);
  if (weekday != null) {
    const currentDow = now.getDay();
    let daysAhead = (weekday - currentDow + 7) % 7;
    if (daysAhead === 0) daysAhead = 7; // bare "Tuesday" on Tuesday = next week
    if (/\bnext\b/.test(t) && daysAhead < 7) daysAhead += 7;
    const day = addDays(now, daysAhead);
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 9, minute: 0 };
    const result = setLocalTime(day, clock);
    return {
      iso_utc: result.toISOString(),
      matched_phrase: WEEKDAYS[weekday],
    };
  }

  // ── Pattern: "Month Day at X" (e.g. "June 15 at 10am")
  const month = findMonth(t);
  if (month != null) {
    const dayMatch = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (dayMatch) {
      const day = parseInt(dayMatch[1], 10);
      if (day >= 1 && day <= 31) {
        const year = now.getFullYear();
        const candidate = new Date(year, month, day);
        // If the date already passed, roll to next year.
        if (candidate.getTime() < now.getTime() - 86400000) {
          candidate.setFullYear(year + 1);
        }
        const clock =
          parseClock(t) ?? findPartOfDay(t) ?? { hour: 9, minute: 0 };
        const result = setLocalTime(candidate, clock);
        return {
          iso_utc: result.toISOString(),
          matched_phrase: `${MONTHS[month]} ${day}`,
        };
      }
    }
  }

  // ── Pattern: ISO-ish "2026-06-15 10:00" / "2026-06-15T10:00"
  const isoMatch = text.match(
    /\b(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?\b/,
  );
  if (isoMatch) {
    const [, ymd, hh, mm] = isoMatch;
    const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
    const date = new Date(y, mo - 1, d);
    if (hh != null && mm != null) {
      date.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    if (!isNaN(date.getTime())) {
      return { iso_utc: date.toISOString(), matched_phrase: isoMatch[0] };
    }
  }

  return undefined;
}
