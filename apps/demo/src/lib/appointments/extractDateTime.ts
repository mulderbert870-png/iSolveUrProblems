/**
 * M3.4 — Natural-language datetime extraction (rules-based, v1).
 *
 * Handles the phrasings real homeowners use when scheduling work with
 * 6. Returns a UTC ISO string and the matched phrase for diagnostics.
 *
 * **Timezone-aware:** when the caller passes a tz (IANA name such as
 * "America/New_York"), wall-clock phrases like "tomorrow at 10am" are
 * parsed in that zone and converted to UTC. Without a tz the function
 * falls back to UTC, which is what Vercel runs in by default — so
 * unzoned input from a server context still works, just without the
 * timezone correction.
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

// ─── Timezone helpers ───────────────────────────────────────────────

type ZonedParts = {
  year: number;
  month: number; // 0-indexed
  day: number;
  hour: number;
  minute: number;
  /** 0=Sun..6=Sat */
  dayOfWeek: number;
};

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** What does `now` look like in the user's wall clock? */
function getZonedNow(now: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  return {
    year: parseInt(lookup.year, 10),
    month: parseInt(lookup.month, 10) - 1,
    day: parseInt(lookup.day, 10),
    hour: lookup.hour === "24" ? 0 : parseInt(lookup.hour, 10),
    minute: parseInt(lookup.minute, 10),
    dayOfWeek:
      WEEKDAY_SHORT[(lookup.weekday ?? "").slice(0, 3).toLowerCase()] ?? 0,
  };
}

/**
 * Given wall-clock parts in `tz`, return the UTC Date instant they
 * correspond to. Handles DST cross-overs because we ask Intl what wall
 * clock our UTC guess looks like in tz, then correct by the difference.
 */
function zonedPartsToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tz: string;
}): Date {
  const utcGuess = new Date(
    Date.UTC(args.year, args.month, args.day, args.hour, args.minute, 0),
  );
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: args.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcGuess);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const displayedAsUtc = Date.UTC(
    parseInt(lookup.year, 10),
    parseInt(lookup.month, 10) - 1,
    parseInt(lookup.day, 10),
    lookup.hour === "24" ? 0 : parseInt(lookup.hour, 10),
    parseInt(lookup.minute, 10),
    0,
  );
  const offset = displayedAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset);
}

/** Increment year/month/day parts by n days, respecting calendar math. */
function shiftDay(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  n: number,
): Pick<ZonedParts, "year" | "month" | "day"> {
  const ms = Date.UTC(parts.year, parts.month, parts.day) + n * 86_400_000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
  };
}

// ─── Main extractor ─────────────────────────────────────────────────

export function extractDateTime(
  text: string,
  now: Date = new Date(),
  tz: string = "UTC",
): ExtractedDateTime | undefined {
  const t = text.toLowerCase();
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const zonedNow = getZonedNow(now, zone);

  // ── Pattern: "in N hours/minutes/days" — duration is tz-independent
  const inMatch = t.match(/\bin\s+(\d+)\s+(hour|minute|day|week)s?\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    let ms = now.getTime();
    if (unit === "minute") ms += n * 60_000;
    else if (unit === "hour") ms += n * 3_600_000;
    else if (unit === "day") ms += n * 86_400_000;
    else if (unit === "week") ms += n * 7 * 86_400_000;
    return {
      iso_utc: new Date(ms).toISOString(),
      matched_phrase: inMatch[0],
    };
  }

  // ── Pattern: "tomorrow at X" / "tomorrow morning"
  if (/\btomorrow\b/.test(t)) {
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 10, minute: 0 };
    const target = shiftDay(zonedNow, 1);
    const result = zonedPartsToUtc({
      ...target,
      hour: clock.hour,
      minute: clock.minute,
      tz: zone,
    });
    return { iso_utc: result.toISOString(), matched_phrase: "tomorrow" };
  }

  // ── Pattern: "today at X" / "tonight"
  if (/\btoday\b/.test(t)) {
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 17, minute: 0 };
    let result = zonedPartsToUtc({
      year: zonedNow.year,
      month: zonedNow.month,
      day: zonedNow.day,
      hour: clock.hour,
      minute: clock.minute,
      tz: zone,
    });
    let phrase = "today";
    if (result.getTime() < now.getTime()) {
      // Promote to tomorrow if "today at 9am" is already past.
      const tomorrow = shiftDay(zonedNow, 1);
      result = zonedPartsToUtc({
        ...tomorrow,
        hour: clock.hour,
        minute: clock.minute,
        tz: zone,
      });
      phrase = "today (rolled to tomorrow)";
    }
    return { iso_utc: result.toISOString(), matched_phrase: phrase };
  }
  if (/\btonight\b/.test(t)) {
    let result = zonedPartsToUtc({
      year: zonedNow.year,
      month: zonedNow.month,
      day: zonedNow.day,
      hour: 19,
      minute: 0,
      tz: zone,
    });
    let phrase = "tonight";
    if (result.getTime() < now.getTime()) {
      const tomorrow = shiftDay(zonedNow, 1);
      result = zonedPartsToUtc({
        ...tomorrow,
        hour: 19,
        minute: 0,
        tz: zone,
      });
      phrase = "tonight (rolled to tomorrow)";
    }
    return { iso_utc: result.toISOString(), matched_phrase: phrase };
  }

  // ── Pattern: "(next|this) Weekday at X"
  const weekday = findWeekday(t);
  if (weekday != null) {
    let daysAhead = (weekday - zonedNow.dayOfWeek + 7) % 7;
    if (daysAhead === 0) daysAhead = 7; // bare "Tuesday" on Tuesday = next week
    if (/\bnext\b/.test(t) && daysAhead < 7) daysAhead += 7;
    const target = shiftDay(zonedNow, daysAhead);
    const clock = parseClock(t) ?? findPartOfDay(t) ?? { hour: 9, minute: 0 };
    const result = zonedPartsToUtc({
      ...target,
      hour: clock.hour,
      minute: clock.minute,
      tz: zone,
    });
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
        let year = zonedNow.year;
        // Roll to next year if the date has already passed this year.
        const probe = zonedPartsToUtc({
          year,
          month,
          day,
          hour: 12,
          minute: 0,
          tz: zone,
        });
        if (probe.getTime() < now.getTime() - 86_400_000) year += 1;
        const clock =
          parseClock(t) ?? findPartOfDay(t) ?? { hour: 9, minute: 0 };
        const result = zonedPartsToUtc({
          year,
          month,
          day,
          hour: clock.hour,
          minute: clock.minute,
          tz: zone,
        });
        return {
          iso_utc: result.toISOString(),
          matched_phrase: `${MONTHS[month]} ${day}`,
        };
      }
    }
  }

  // ── Pattern: ISO-ish "2026-06-15 10:00" / "2026-06-15T10:00"
  // Interpreted as wall-clock in user tz unless the string carries Z/+hh:mm.
  const isoMatch = text.match(
    /\b(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?(Z|[+-]\d{2}:?\d{2})?\b/,
  );
  if (isoMatch) {
    const [, ymd, hh, mm, offset] = isoMatch;
    const [y, mo, d] = ymd.split("-").map((x) => parseInt(x, 10));
    if (offset) {
      // Has explicit offset/Z — JS parses it directly.
      const direct = new Date(isoMatch[0]);
      if (!isNaN(direct.getTime())) {
        return {
          iso_utc: direct.toISOString(),
          matched_phrase: isoMatch[0],
        };
      }
    }
    const hour = hh != null ? parseInt(hh, 10) : 9;
    const minute = mm != null ? parseInt(mm, 10) : 0;
    const result = zonedPartsToUtc({
      year: y,
      month: mo - 1,
      day: d,
      hour,
      minute,
      tz: zone,
    });
    if (!isNaN(result.getTime())) {
      return { iso_utc: result.toISOString(), matched_phrase: isoMatch[0] };
    }
  }

  return undefined;
}
