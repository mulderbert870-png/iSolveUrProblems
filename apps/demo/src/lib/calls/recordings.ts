import {
  CALL_RECORDINGS_BUCKET,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
} from "../../../app/api/secrets";
import { getSupabaseAdminConfig } from "../supabaseAdmin";

/**
 * M3.3 — Call recording capture.
 *
 * Twilio stores recordings on their end and POSTs the URL to our
 * recording webhook. We mirror the audio into Supabase Storage so:
 *   - we control retention (Twilio storage isn't free forever)
 *   - we can serve signed URLs to the call detail page
 *   - the recording survives even if the Twilio account is later
 *     migrated
 */

function basicAuthHeader(): string {
  const token = TWILIO_AUTH_TOKEN.includes(":")
    ? TWILIO_AUTH_TOKEN.split(":").slice(1).join(":")
    : TWILIO_AUTH_TOKEN;
  return (
    "Basic " +
    Buffer.from(`${TWILIO_ACCOUNT_SID}:${token}`).toString("base64")
  );
}

/**
 * Fetch a Twilio recording (private — needs basic auth) and upload it
 * to the `call-recordings` Supabase Storage bucket.
 *
 * Returns the storage object path on success, or null on failure.
 */
export async function mirrorTwilioRecordingToStorage(args: {
  call_id: string;
  twilio_recording_url: string;
  /** Recording file extension (mp3 / wav / ogg). Default mp3. */
  ext?: string;
}): Promise<string | null> {
  // Twilio returns mp3 by default when the URL has no suffix. Append .mp3
  // explicitly so the Content-Type roundtrip is unambiguous.
  const ext = (args.ext ?? "mp3").replace(/^\./, "");
  const sourceUrl = args.twilio_recording_url.endsWith(`.${ext}`)
    ? args.twilio_recording_url
    : `${args.twilio_recording_url}.${ext}`;

  // 1. Download the recording from Twilio.
  let audio: Buffer;
  try {
    const res = await fetch(sourceUrl, {
      headers: { Authorization: basicAuthHeader() },
    });
    if (!res.ok) {
      console.error(
        "twilio recording fetch failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    audio = Buffer.from(arrayBuffer);
  } catch (e) {
    console.error("twilio recording fetch threw:", e);
    return null;
  }

  // 2. Upload to Supabase Storage.
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const objectPath = `${args.call_id}/recording.${ext}`;
  const contentType =
    ext === "mp3"
      ? "audio/mpeg"
      : ext === "wav"
        ? "audio/wav"
        : ext === "ogg"
          ? "audio/ogg"
          : "application/octet-stream";
  try {
    const res = await fetch(
      `${url}/storage/v1/object/${CALL_RECORDINGS_BUCKET}/${encodeURI(objectPath)}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: audio as unknown as BodyInit,
      },
    );
    if (!res.ok) {
      console.error(
        "supabase storage upload failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    return objectPath;
  } catch (e) {
    console.error("supabase storage upload threw:", e);
    return null;
  }
}

const SIGNED_URL_TTL = 60 * 60 * 24; // 24h

/** Generate a time-limited signed URL for a stored recording. */
export async function signCallRecordingUrl(
  objectPath: string,
  ttlSeconds: number = SIGNED_URL_TTL,
): Promise<string | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  try {
    const res = await fetch(
      `${url}/storage/v1/object/sign/${CALL_RECORDINGS_BUCKET}/${encodeURI(objectPath)}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: ttlSeconds }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) return null;
    return `${url}/storage/v1${data.signedURL}`;
  } catch {
    return null;
  }
}
