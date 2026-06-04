import type { RawContractor } from "./sources/types";

/**
 * Normalize a phone number for matching — strip everything but digits,
 * drop the leading country code if it's a 10-or-11-digit US number.
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return null;
  // US numbers: drop leading 1 if 11 digits, leave 10-digit alone.
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Normalize an address-ish string for matching — lowercase, collapse
 * whitespace, strip punctuation.
 */
function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  return addr
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * In-batch dedupe: when the same contractor appears more than once in
 * a single `fetchByCategory()` result (e.g. listed under two related
 * categories), keep one. Match on phone OR (name + address).
 *
 * Cross-source dedupe (Google + Yelp records for the same business) is
 * a separate concern handled at upsert time — when we ship a second
 * data source we'll add a matchers table keyed by phone hash.
 */
export function dedupeInBatch(items: RawContractor[]): RawContractor[] {
  const seen = new Map<string, RawContractor>();
  for (const item of items) {
    const phoneKey = normalizePhone(item.phone);
    const addrKey = `${item.name.toLowerCase().trim()}|${normalizeAddress(item.address) ?? ""}`;
    const key = phoneKey ?? addrKey;
    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      // Prefer the entry with more reviews / higher rating count
      const existing = seen.get(key)!;
      if ((item.rating_count ?? 0) > (existing.rating_count ?? 0)) {
        seen.set(key, item);
      }
    }
  }
  return Array.from(seen.values());
}
