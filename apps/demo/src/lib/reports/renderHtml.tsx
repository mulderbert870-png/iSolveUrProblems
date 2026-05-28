import "server-only";
import * as React from "react";
import type { Report } from "./types";

/**
 * Server-render the report into a self-contained HTML string.
 * Inline styles so the result works as a saved-page or email body
 * without any external CSS.
 *
 * Photos are referenced by signed URLs the caller resolves and passes in
 * via the `photoUrls` map: storage_path → signed URL.
 */

const GOLD = "#facc15"; // tailwind amber-400 — matches the in-app theme
const INK = "#18181b"; // zinc-900
const MUTED = "#52525b"; // zinc-600

function ReportDoc({
  report,
  photoUrls,
}: {
  report: Report;
  photoUrls: Record<string, string>;
}) {
  return (
    <html lang={report.locale}>
      <head>
        <meta charSet="utf-8" />
        <title>{report.title}</title>
      </head>
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: INK,
          maxWidth: 720,
          margin: "32px auto",
          padding: "0 20px",
          lineHeight: 1.5,
        }}
      >
        <header
          style={{
            borderTop: `4px solid ${GOLD}`,
            paddingTop: 16,
            marginBottom: 24,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            iSolveUrProblems · Fix-it Report
          </p>
          <h1
            style={{
              margin: "6px 0 0",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {report.title}
          </h1>
          {report.summary && (
            <p style={{ marginTop: 12, fontSize: 16, color: MUTED }}>
              {report.summary}
            </p>
          )}
        </header>

        {report.problem_statement && (
          <Section heading="The problem">{report.problem_statement}</Section>
        )}
        {report.diagnosis && (
          <Section heading="Diagnosis">{report.diagnosis}</Section>
        )}

        {report.sections.map((s, i) => (
          <Section key={i} heading={s.heading}>
            {s.body}
          </Section>
        ))}

        {report.steps.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={h2Style()}>Steps</h2>
            <ol style={{ paddingLeft: 20 }}>
              {report.steps.map((step) => (
                <li key={step.number} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600 }}>{step.title}</div>
                  <div style={{ marginTop: 4 }}>{step.detail}</div>
                  {step.cautions && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "8px 10px",
                        background: "#fef3c7",
                        borderLeft: `3px solid ${GOLD}`,
                        fontSize: 14,
                      }}
                    >
                      <strong>Caution:</strong> {step.cautions}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {report.materials.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={h2Style()}>Materials</h2>
            <ul style={{ paddingLeft: 20 }}>
              {report.materials.map((m, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <strong>{m.name}</strong>
                  {m.qty ? ` — ${m.qty}` : ""}
                  {m.notes ? (
                    <span style={{ color: MUTED }}>{` (${m.notes})`}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.photos.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={h2Style()}>Photos</h2>
            <div style={{ display: "block" }}>
              {report.photos.map((p, i) => {
                const url = photoUrls[p.storage_path];
                if (!url) return null;
                return (
                  <figure
                    key={i}
                    style={{
                      margin: "0 0 16px",
                      pageBreakInside: "avoid",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={p.caption ?? `photo ${i + 1}`}
                      style={{
                        maxWidth: "100%",
                        borderRadius: 8,
                        border: "1px solid #e4e4e7",
                      }}
                    />
                    {p.caption && (
                      <figcaption
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: MUTED,
                        }}
                      >
                        {p.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        <footer
          style={{
            marginTop: 40,
            paddingTop: 16,
            borderTop: "1px solid #e4e4e7",
            fontSize: 12,
            color: MUTED,
          }}
        >
          {report.legal_disclaimer}
        </footer>
      </body>
    </html>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={h2Style()}>{heading}</h2>
      <p style={{ marginTop: 8 }}>{children}</p>
    </section>
  );
}

function h2Style(): React.CSSProperties {
  return {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    borderBottom: `2px solid ${GOLD}`,
    paddingBottom: 4,
    display: "inline-block",
  };
}

/**
 * Returns a complete, self-contained HTML document for the report.
 *
 * Dynamically imports react-dom/server so Next.js's build-time check
 * (which forbids direct react-dom/server imports in modules that could
 * end up in a client bundle) is satisfied. This module is also marked
 * `server-only` for belt-and-braces.
 */
export async function renderReportHtml(args: {
  report: Report;
  photoUrls: Record<string, string>;
}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const inner = renderToStaticMarkup(
    <ReportDoc report={args.report} photoUrls={args.photoUrls} />,
  );
  return `<!doctype html>${inner}`;
}
