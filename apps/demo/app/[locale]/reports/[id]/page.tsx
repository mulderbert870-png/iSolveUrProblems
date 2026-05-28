import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { getReportRow, signReportAssetUrl } from "../../../../src/lib/reports";
import { Link } from "../../../../src/i18n/routing";
import { FEATURE_WHATSAPP } from "../../../api/secrets";
import DeliveryPanel from "./DeliveryPanel";

export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export default async function ReportViewerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reports");

  if (!isUuid(id)) notFound();

  const userId = await getUserId();
  if (!userId) {
    redirect(`/${locale}/auth/sign-in?next=/${locale}/reports/${id}`);
  }

  const row = await getReportRow(id);
  if (!row || row.user_id !== userId) notFound();

  const pdfUrl = row.pdf_path ? await signReportAssetUrl(row.pdf_path) : null;

  return (
    <main className="w-full max-w-3xl flex flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {t("kicker")}
        </p>
        <h1 className="text-2xl font-semibold">
          {row.title ?? t("untitled")}
        </h1>
        {row.summary && (
          <p className="text-sm text-zinc-400">{row.summary}</p>
        )}
        <p className="text-xs text-zinc-500">
          {t("statusLabel")}: <span className="font-mono">{row.status}</span>
        </p>
      </header>

      {row.status === "generating" || row.status === "queued" ? (
        <p className="text-sm text-amber-300">{t("generating")}</p>
      ) : null}

      {row.status === "failed" ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {t("failed")}
          {row.error ? `: ${row.error}` : ""}
        </div>
      ) : null}

      {row.status === "ready" && (
        <ReportBody report={row.payload} />
      )}

      {row.status === "ready" && (
        <DeliveryPanel
          reportId={row.id}
          whatsappEnabled={FEATURE_WHATSAPP}
        />
      )}

      <div className="flex gap-3 mt-6">
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md bg-amber-400 text-zinc-900 px-4 py-2 text-sm font-medium"
          >
            {t("downloadPdf")}
          </a>
        )}
        <Link
          href="/"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          {t("backTo6")}
        </Link>
      </div>
    </main>
  );
}

function ReportBody({ report }: { report: import("../../../../src/lib/reports").Report }) {
  return (
    <div className="flex flex-col gap-6">
      {report.problem_statement && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-1">
            The problem
          </h2>
          <p className="text-sm">{report.problem_statement}</p>
        </section>
      )}
      {report.diagnosis && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-1">
            Diagnosis
          </h2>
          <p className="text-sm">{report.diagnosis}</p>
        </section>
      )}
      {report.sections.map((s, i) => (
        <section key={i}>
          <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-1">
            {s.heading}
          </h2>
          <p className="text-sm">{s.body}</p>
        </section>
      ))}
      {report.steps.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-2">
            Steps
          </h2>
          <ol className="flex flex-col gap-3 text-sm">
            {report.steps.map((step) => (
              <li key={step.number} className="flex gap-3">
                <span className="text-amber-300 font-mono">
                  {String(step.number).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                  {step.cautions && (
                    <span className="rounded bg-amber-400/10 border-l-2 border-amber-400 px-2 py-1 text-xs text-amber-200">
                      <strong>Caution:</strong> {step.cautions}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {report.materials.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-2">
            Materials
          </h2>
          <ul className="text-sm space-y-1">
            {report.materials.map((m, i) => (
              <li key={i}>
                <strong>{m.name}</strong>
                {m.qty ? ` — ${m.qty}` : ""}
                {m.notes ? (
                  <span className="text-zinc-400"> ({m.notes})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-3 mt-4">
        {report.legal_disclaimer}
      </p>
    </div>
  );
}
