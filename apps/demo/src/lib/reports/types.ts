import type { Locale } from "../../i18n/routing";

export type ReportStatus = "queued" | "generating" | "ready" | "failed";

export type ReportPhoto = {
  /** Storage path inside the `isolve-media` bucket. */
  storage_path: string;
  /** Optional caption — what 6 saw / why it matters. */
  caption?: string;
};

export type ReportMaterial = {
  name: string;
  qty?: string;
  notes?: string;
};

export type ReportStep = {
  number: number;
  title: string;
  detail: string;
  cautions?: string;
};

export type ReportSection = {
  heading: string;
  body: string;
};

/** Structured fix-it report. Stored as JSON in reports.payload. */
export type Report = {
  title: string;
  summary: string;
  problem_statement: string;
  diagnosis: string;
  sections: ReportSection[];
  materials: ReportMaterial[];
  steps: ReportStep[];
  photos: ReportPhoto[];
  /** Locale used for the body language of this report. */
  locale: Locale;
  /** Plain-English legal disclaimer (translation applied per locale). */
  legal_disclaimer: string;
  /** Placeholder for M2 contractor recommendation block. */
  contractor_recommendation?: { _placeholder: true };
};

export type ReportRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  locale: Locale;
  title: string | null;
  summary: string | null;
  payload: Report;
  html_path: string | null;
  pdf_path: string | null;
  status: ReportStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};
