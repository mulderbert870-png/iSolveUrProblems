import type {
  NotificationTemplate,
  EmailRendered,
  SmsRendered,
  WhatsappRendered,
} from "../types";

/**
 * report.delivery.v1 — sends a signed link to a generated fix-it report
 * across email / SMS / WhatsApp.
 *
 * Vision ¶7: "by email, text, or messaging app — however they prefer."
 *
 * Q1.4a — link, not attachment. Signed URLs are short-lived and we want
 * open / click telemetry via webhook events.
 *
 * Q1.4b — WhatsApp body locked as:
 *   "Hi {{1}}, this is 6 from iSolveUrProblems with your fix-it report.
 *    View it here: {{2}}. Reply STOP to opt out."
 *
 * WhatsApp template_name MUST match a Meta-pre-approved Content SID
 * (HX…). The placeholder string below is what gets submitted to Meta
 * during BSP onboarding; FEATURE_WHATSAPP=0 keeps this code path inert
 * until the Content SID lands.
 */

export type ReportDeliveryData = {
  recipientName?: string | null;
  reportTitle?: string | null;
  reportUrl: string;
};

function greet(name?: string | null): string {
  return name?.trim() ? name.trim() : "there";
}

function safeTitle(title?: string | null): string {
  return title?.trim() ? title.trim() : "your fix-it report";
}

const reportDeliveryTemplate: NotificationTemplate<ReportDeliveryData> = {
  id: "report.delivery.v1",
  contentType: "report",

  renderEmail: (data): EmailRendered => {
    const name = greet(data.recipientName);
    const title = safeTitle(data.reportTitle);
    const subject = `${title} — from 6`;
    const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:24px auto;line-height:1.5;color:#18181b">
  <div style="border-top:4px solid #facc15;padding-top:16px">
    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#52525b">iSolveUrProblems · Fix-it Report</p>
    <h2 style="margin:6px 0 0;font-size:22px">${title}</h2>
  </div>
  <p>Hi ${name},</p>
  <p>I put together your fix-it report — it covers what we talked through, the steps to take, and any materials you'll need. Photos from our conversation are in there too.</p>
  <p style="margin:24px 0">
    <a href="${data.reportUrl}"
       style="background:#facc15;color:#18181b;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      View your report
    </a>
  </p>
  <p style="font-size:13px;color:#52525b">Link expires in 7 days. Hit reply if you want me to take another look or send help.</p>
  <p style="margin-top:24px">— 6</p>
</body></html>`;
    const text = `Hi ${name},

I put together your fix-it report — ${title}.

View it: ${data.reportUrl}

(Link expires in 7 days. Reply to this email if you want me to take another look or send help.)

— 6`;
    return { subject, html, text };
  },

  renderSms: (data): SmsRendered => {
    const name = greet(data.recipientName);
    // Keep under 160 chars where possible so we stay in 1 segment.
    const body = `Hi ${name}, your fix-it report from 6 is ready: ${data.reportUrl} — reply STOP to opt out.`;
    return { body };
  },

  renderWhatsapp: (data): WhatsappRendered => {
    // template_name → Meta Content SID (HX…). When BSP approval lands,
    // replace this constant with the real SID (e.g. "HX1234abcd…").
    // Until then FEATURE_WHATSAPP=0 prevents this from being sent.
    return {
      template_name: "report_delivery_v1",
      parameters: [greet(data.recipientName), data.reportUrl],
    };
  },
};

export default reportDeliveryTemplate;
