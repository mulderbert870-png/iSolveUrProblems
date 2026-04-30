import {
  assertAllowedOrigin,
  isAllowedImageMime,
  truncateUtf8String,
} from "../../../../src/lib/apiRouteSecurity";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";

const BUCKET = "isolve-media";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB (matches bucket file_size_limit)
const MAX_TEXT_FIELD = 1000;

const VALID_SOURCES = new Set([
  "camera_snapshot",
  "video_recording",
  "gallery_image",
  "gallery_video",
  "go_live_frame",
]);

const VIDEO_MIMES = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "video/ogg",
]);

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const originErr = assertAllowedOrigin(request);
  if (originErr) return originErr;
  const rateLimitErr = await checkRateLimit(request);
  if (rateLimitErr) return rateLimitErr;

  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = getSupabaseAdminConfig());
  } catch {
    return jsonError("Supabase not configured", 500);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const fileOrBlob = form.get("file");
  const source = (form.get("source") as string | null)?.trim() ?? "";
  const sessionId = (form.get("session_id") as string | null)?.trim() ?? "";
  const geminiAnalysisRaw = (form.get("gemini_analysis") as string | null) ?? "";
  const problemRaw = (form.get("problem") as string | null) ?? "";
  const errorRaw = (form.get("error") as string | null) ?? "";

  if (!fileOrBlob) return jsonError("file is required", 400);
  if (!VALID_SOURCES.has(source)) return jsonError("invalid source", 400);
  // session_id is optional — Go Live polling frames may fire before
  // sessionRef.current.sessionId is known. We still store the row.

  const value = fileOrBlob as unknown;
  const file: File | null =
    fileOrBlob instanceof File
      ? fileOrBlob
      : value instanceof Blob
        ? new File([value], "media.bin", { type: value.type })
        : null;
  if (!file) return jsonError("file is required", 400);

  if (file.size === 0) return jsonError("file is empty", 400);
  if (file.size > MAX_MEDIA_BYTES) return jsonError("file too large", 400);

  const mime = (file.type || "application/octet-stream").split(";")[0].trim();
  const isImage = isAllowedImageMime(mime);
  const isVideo = VIDEO_MIMES.has(mime);
  if (!isImage && !isVideo) return jsonError("unsupported mime", 400);

  // Extra guard: image sources only allow image mimes; video sources only allow video mimes.
  const imageSource =
    source === "camera_snapshot" ||
    source === "gallery_image" ||
    source === "go_live_frame";
  const videoSource = source === "video_recording" || source === "gallery_video";
  if (imageSource && !isImage) return jsonError("source/mime mismatch", 400);
  if (videoSource && !isVideo) return jsonError("source/mime mismatch", 400);

  // Build storage path: <sessionIdOrNone>/<yyyy-mm>/<source>-<isoTimestamp>-<rand>.<ext>
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 10);
  const ext = extForMime(mime);
  const sidPart = sessionId || "no-session";
  const storagePath = `${sidPart}/${yyyy}-${mm}/${source}-${iso}-${rand}.${ext}`;

  // Upload to the isolve-media bucket using the Supabase Storage REST API.
  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadRes = await fetch(
    `${url}/storage/v1/object/${BUCKET}/${encodeURI(storagePath)}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": mime,
        "x-upsert": "false",
      },
      body: bytes,
    },
  );
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    console.error("media/capture upload failed", uploadRes.status, body);
    return jsonError("upload failed", 502);
  }

  // Insert a row in media_events.
  const geminiAnalysis = truncateUtf8String(
    geminiAnalysisRaw.trim(),
    MAX_TEXT_FIELD,
  );
  const problem = truncateUtf8String(problemRaw.trim(), MAX_TEXT_FIELD);
  const errText = truncateUtf8String(errorRaw.trim(), MAX_TEXT_FIELD);

  const insertRes = await fetch(`${url}/rest/v1/media_events`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      session_id: sessionId || null,
      source,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: file.size,
      gemini_analysis: geminiAnalysis || null,
      problem_at_time: problem || null,
      error: errText || null,
    }),
  });
  if (!insertRes.ok) {
    const body = await insertRes.text().catch(() => "");
    console.error("media/capture insert failed", insertRes.status, body);
    // File is already uploaded; this is a soft failure.
    return new Response(
      JSON.stringify({
        ok: false,
        storage_path: storagePath,
        warning: "insert failed but file stored",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, storage_path: storagePath }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
