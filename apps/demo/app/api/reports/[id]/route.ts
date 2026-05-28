import { NextResponse } from "next/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { getReportRow, signReportAssetUrl } from "../../../../src/lib/reports";

function isUuid(s: string | null): s is string {
  return (
    s !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

/**
 * GET /api/reports/[id]
 *
 * Returns report metadata + freshly-signed URLs for the HTML and PDF
 * artifacts. Owner-only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const row = await getReportRow(id);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.user_id !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [htmlUrl, pdfUrl] = await Promise.all([
    row.html_path ? signReportAssetUrl(row.html_path) : Promise.resolve(null),
    row.pdf_path ? signReportAssetUrl(row.pdf_path) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    id: row.id,
    status: row.status,
    title: row.title,
    summary: row.summary,
    locale: row.locale,
    error: row.error,
    created_at: row.created_at,
    html_url: htmlUrl,
    pdf_url: pdfUrl,
  });
}
