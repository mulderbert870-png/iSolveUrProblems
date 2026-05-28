import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Report } from "./types";

/**
 * Render the report to a PDF Buffer via @react-pdf/renderer (Q1.5a).
 * Pure-JS so it runs fine inside a Vercel serverless function — no
 * chromium dependency.
 *
 * The styling is hard-coded (StyleSheet) so it stays consistent across
 * locales without depending on Tailwind / CSS.
 */

const GOLD = "#facc15";
const INK = "#18181b";
const MUTED = "#52525b";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
    lineHeight: 1.45,
  },
  topBar: {
    height: 4,
    backgroundColor: GOLD,
    marginBottom: 12,
  },
  brand: {
    fontSize: 9,
    letterSpacing: 1.4,
    color: MUTED,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: 700,
  },
  summary: {
    marginTop: 8,
    fontSize: 12,
    color: MUTED,
  },
  h2: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: 700,
    borderBottomWidth: 1.5,
    borderBottomColor: GOLD,
    paddingBottom: 2,
  },
  paragraph: {
    marginTop: 6,
  },
  stepRow: {
    marginTop: 10,
  },
  stepTitle: {
    fontWeight: 700,
    fontSize: 12,
  },
  stepDetail: {
    marginTop: 2,
  },
  caution: {
    marginTop: 4,
    padding: 6,
    borderLeftWidth: 2.5,
    borderLeftColor: GOLD,
    backgroundColor: "#fef3c7",
    fontSize: 10,
  },
  materialItem: {
    marginTop: 3,
  },
  photoBlock: {
    marginTop: 12,
  },
  photo: {
    maxWidth: "100%",
    borderRadius: 4,
  },
  photoCaption: {
    marginTop: 4,
    fontSize: 10,
    color: MUTED,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    fontSize: 9,
    color: MUTED,
  },
});

function ReportPdfDocument({
  report,
  photoUrls,
}: {
  report: Report;
  photoUrls: Record<string, string>;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} />
        <Text style={styles.brand}>iSolveUrProblems · Fix-it Report</Text>
        <Text style={styles.title}>{report.title}</Text>
        {report.summary ? (
          <Text style={styles.summary}>{report.summary}</Text>
        ) : null}

        {report.problem_statement ? (
          <View>
            <Text style={styles.h2}>The problem</Text>
            <Text style={styles.paragraph}>{report.problem_statement}</Text>
          </View>
        ) : null}

        {report.diagnosis ? (
          <View>
            <Text style={styles.h2}>Diagnosis</Text>
            <Text style={styles.paragraph}>{report.diagnosis}</Text>
          </View>
        ) : null}

        {report.sections.map((s, i) => (
          <View key={i}>
            <Text style={styles.h2}>{s.heading}</Text>
            <Text style={styles.paragraph}>{s.body}</Text>
          </View>
        ))}

        {report.steps.length > 0 ? (
          <View>
            <Text style={styles.h2}>Steps</Text>
            {report.steps.map((step) => (
              <View key={step.number} style={styles.stepRow}>
                <Text style={styles.stepTitle}>
                  {step.number}. {step.title}
                </Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
                {step.cautions ? (
                  <Text style={styles.caution}>Caution: {step.cautions}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {report.materials.length > 0 ? (
          <View>
            <Text style={styles.h2}>Materials</Text>
            {report.materials.map((m, i) => (
              <Text key={i} style={styles.materialItem}>
                • {m.name}
                {m.qty ? ` — ${m.qty}` : ""}
                {m.notes ? ` (${m.notes})` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        {report.photos.length > 0 ? (
          <View>
            <Text style={styles.h2}>Photos</Text>
            {report.photos.map((p, i) => {
              const src = photoUrls[p.storage_path];
              if (!src) return null;
              return (
                <View key={i} style={styles.photoBlock} wrap={false}>
                  <Image src={src} style={styles.photo} />
                  {p.caption ? (
                    <Text style={styles.photoCaption}>{p.caption}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {report.legal_disclaimer}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(args: {
  report: Report;
  photoUrls: Record<string, string>;
}): Promise<Buffer> {
  return renderToBuffer(
    <ReportPdfDocument
      report={args.report}
      photoUrls={args.photoUrls}
    />,
  );
}
