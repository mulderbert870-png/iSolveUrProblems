import type {
  NotificationTemplate,
  EmailRendered,
  SmsRendered,
  WhatsappRendered,
} from "../types";

/**
 * contractor.lose.v1 — sent to candidates who were NOT picked.
 *
 * Vision ¶19: "…and those that do not… give them feedback…
 * always in a friendly, warm manner."
 *
 * The `reason` and `tips` fields come from the M2.6 loseFeedback LLM
 * generator (or its templated fallback when OpenAI is unreachable).
 * The template never names the winning contractor.
 */

export type ContractorLoseData = {
  contractorName: string;
  category: string;          // e.g. "plumber"
  /** One friendly sentence — already locale-neutral, generated upstream. */
  reason: string;
  /** Up to 2 actionable improvement tips. */
  tips: string[];
};

function firstName(full: string): string {
  return full.split(/\s+/)[0] || "there";
}

function humanCategory(slug: string): string {
  return slug.replace(/_/g, " ");
}

function bulletsHtml(tips: string[]): string {
  if (tips.length === 0) return "";
  const items = tips.map((t) => `<li style="margin:6px 0">${t}</li>`).join("");
  return `<ul style="padding-left:18px;margin:8px 0">${items}</ul>`;
}

function bulletsText(tips: string[]): string {
  if (tips.length === 0) return "";
  return tips.map((t) => `  • ${t}`).join("\n");
}

const contractorLoseTemplate: NotificationTemplate<ContractorLoseData> = {
  id: "contractor.lose.v1",
  contentType: "transactional",

  renderEmail: (data): EmailRendered => {
    const name = firstName(data.contractorName);
    const cat = humanCategory(data.category);
    const subject = `${cat} project update — from 6 at iSolveUrProblems`;
    const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:24px auto;line-height:1.5;color:#18181b">
  <div style="border-top:4px solid #facc15;padding-top:16px">
    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a16207">iSolveUrProblems · Project Update</p>
    <h2 style="margin:6px 0 0;font-size:22px">Hey ${name},</h2>
  </div>
  <p>${data.reason}</p>
  <p>I want to keep sending you good leads, so here are 2 quick wins for your profile that 6 noticed:</p>
  ${bulletsHtml(data.tips)}
  <p style="font-size:13px;color:#52525b">You're still in my rotation — I'll text or email next time a ${cat} job comes through that fits you well. — 6</p>
</body></html>`;
    const text = `Hey ${name},

${data.reason}

I want to keep sending you good leads, so here are 2 quick wins 6 noticed:
${bulletsText(data.tips)}

You're still in my rotation — I'll be back next time a ${cat} job comes through that fits you well.

— 6`;
    return { subject, html, text };
  },

  renderSms: (data): SmsRendered => {
    const name = firstName(data.contractorName);
    const tip = data.tips[0] ?? "";
    // Squeeze into 1 segment when we can — ~160 chars.
    const body = tip
      ? `Hi ${name}, ${data.reason} Quick tip from 6: ${tip} — STOP to opt out.`
      : `Hi ${name}, ${data.reason} I'll be back with more jobs soon. — 6 (STOP to opt out)`;
    return { body };
  },

  renderWhatsapp: (data): WhatsappRendered => {
    return {
      template_name: "contractor_lose_v1",
      parameters: [
        firstName(data.contractorName),
        data.reason,
        data.tips[0] ?? "",
      ],
    };
  },
};

export default contractorLoseTemplate;
