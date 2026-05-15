import type { Locale } from "../../i18n/routing";
import { composeReport } from "./compose";
import { renderReportHtml } from "./renderHtml";
import { renderReportPdf } from "./renderPdf";
import {
  insertReportRow,
  updateReportRow,
  uploadReportAsset,
  signMediaUrls,
  type GenerateReportOutcome,
} from "./store";

/**
 * End-to-end report generation orchestrator.
 *
 * Pipeline:
 *   1. Insert reports row with status='queued'
 *   2. Patch → 'generating'
 *   3. Compose Report payload (LLM)
 *   4. Sign media URLs referenced inside the report
 *   5. Render HTML + PDF
 *   6. Upload both to the `reports` bucket
 *   7. Patch row → 'ready' (with title/summary/payload/paths)
 *
 * Per Q1.5c — on-request only. Caller (M1.4 delivery flow, or a manual
 * "generate report" button) triggers this. We don't auto-generate on
 * conversation tail.
 *
 * Never throws — failures land as status='failed' with `error`.
 */
export async function generateReport(args: {
  userId: string;
  sessionId: string | null;
  locale: Locale;
  userFirstName?: string | null;
}): Promise<GenerateReportOutcome> {
  const rowId = await insertReportRow({
    userId: args.userId,
    sessionId: args.sessionId,
    locale: args.locale,
  });
  if (!rowId) {
    return {
      ok: false,
      rowId: null,
      status: "failed",
      error: "could not insert report row",
    };
  }

  await updateReportRow(rowId, { status: "generating" });

  try {
    // 1. Compose
    if (!args.sessionId) {
      await updateReportRow(rowId, {
        status: "failed",
        error: "session_id is required for v1 report generation",
      });
      return {
        ok: false,
        rowId,
        status: "failed",
        error: "session_id required",
      };
    }
    const report = await composeReport({
      sessionId: args.sessionId,
      locale: args.locale,
      userFirstName: args.userFirstName,
    });

    // 2. Sign media URLs for embedded photos
    const photoPaths = report.photos.map((p) => p.storage_path);
    const photoUrls = await signMediaUrls(photoPaths);

    // 3. Render HTML + PDF in parallel
    const [html, pdfBuf] = await Promise.all([
      renderReportHtml({ report, photoUrls }),
      renderReportPdf({ report, photoUrls }),
    ]);

    // 4. Upload both
    const [htmlPath, pdfPath] = await Promise.all([
      uploadReportAsset({
        rowId,
        filename: "report.html",
        contentType: "text/html; charset=utf-8",
        body: html,
      }),
      uploadReportAsset({
        rowId,
        filename: "report.pdf",
        contentType: "application/pdf",
        body: pdfBuf,
      }),
    ]);

    if (!htmlPath || !pdfPath) {
      await updateReportRow(rowId, {
        status: "failed",
        error: "asset upload failed",
      });
      return {
        ok: false,
        rowId,
        status: "failed",
        error: "asset upload failed",
      };
    }

    // 5. Finalize row
    await updateReportRow(rowId, {
      status: "ready",
      title: report.title,
      summary: report.summary,
      payload: report,
      html_path: htmlPath,
      pdf_path: pdfPath,
    });

    return { ok: true, rowId, status: "ready" };
  } catch (e) {
    const error = e instanceof Error ? e.message : "generate threw";
    console.error("generateReport failed", error);
    await updateReportRow(rowId, { status: "failed", error });
    return { ok: false, rowId, status: "failed", error };
  }
}
