import { getSupabaseAdminConfig } from "../supabaseAdmin";
import type { Locale } from "../../i18n/routing";
import type { Report, ReportRow, ReportStatus } from "./types";

const REPORTS_BUCKET = "reports";
const MEDIA_BUCKET = "isolve-media";
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

/** Insert a queued row. Returns the new row id, or null on failure. */
export async function insertReportRow(args: {
  userId: string;
  sessionId: string | null;
  locale: Locale;
}): Promise<string | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(`${url}/rest/v1/reports`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        user_id: args.userId,
        session_id: args.sessionId,
        locale: args.locale,
        status: "queued",
      },
    ]),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function updateReportRow(
  rowId: string,
  patch: Partial<
    Pick<
      ReportRow,
      | "status"
      | "title"
      | "summary"
      | "payload"
      | "html_path"
      | "pdf_path"
      | "error"
    >
  >,
): Promise<boolean> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/reports?id=eq.${encodeURIComponent(rowId)}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
  return res.ok;
}

export async function getReportRow(
  rowId: string,
): Promise<ReportRow | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/rest/v1/reports?id=eq.${encodeURIComponent(rowId)}&select=*&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ReportRow[];
  return rows[0] ?? null;
}

/** Upload a Buffer to the `reports` Storage bucket. */
export async function uploadReportAsset(args: {
  rowId: string;
  filename: string;
  contentType: string;
  body: Buffer | string;
}): Promise<string | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const objectPath = `${args.rowId}/${args.filename}`;
  const res = await fetch(
    `${url}/storage/v1/object/${REPORTS_BUCKET}/${encodeURI(objectPath)}`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(serviceRoleKey),
        "Content-Type": args.contentType,
        "x-upsert": "true",
      },
      body: args.body as BodyInit,
    },
  );
  if (!res.ok) {
    console.error(
      "reports.uploadAsset failed",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }
  return objectPath;
}

/** Generate a time-limited signed URL for a stored report asset. */
export async function signReportAssetUrl(
  objectPath: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  const res = await fetch(
    `${url}/storage/v1/object/sign/${REPORTS_BUCKET}/${encodeURI(objectPath)}`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(serviceRoleKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) return null;
  return `${url}/storage/v1${data.signedURL}`;
}

/**
 * Batch-sign the media paths used inside a report so the renderer can
 * embed them as <img src=…>. Maps storage_path → signed URL.
 */
export async function signMediaUrls(
  storagePaths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (storagePaths.length === 0) return out;
  const { url, serviceRoleKey } = getSupabaseAdminConfig();

  await Promise.all(
    storagePaths.map(async (path) => {
      try {
        const res = await fetch(
          `${url}/storage/v1/object/sign/${MEDIA_BUCKET}/${encodeURI(path)}`,
          {
            method: "POST",
            headers: {
              ...adminHeaders(serviceRoleKey),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { signedURL?: string };
        if (data.signedURL) {
          out[path] = `${url}/storage/v1${data.signedURL}`;
        }
      } catch {
        // best-effort
      }
    }),
  );

  return out;
}

export type GenerateReportOutcome =
  | { ok: true; rowId: string; status: "ready" }
  | { ok: false; rowId: string | null; status: ReportStatus; error: string };

export const ReportStorage = {
  REPORTS_BUCKET,
  MEDIA_BUCKET,
  SIGNED_URL_TTL_SECONDS,
};

export type { Report };
