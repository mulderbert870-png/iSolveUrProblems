import type {
  NotificationTemplate,
  EmailRendered,
  SmsRendered,
  WhatsappRendered,
} from "../types";

/**
 * contractor.win.v1 — sent to the contractor selected for a project.
 *
 * Vision ¶19: "6 can deliver the news to the contractors that win the
 * projects… always in a friendly, warm manner."
 *
 * Used both by the real M2.5 contract-create route and by the M2.6
 * simulation endpoint (admin pick-handler).
 */

export type ContractorWinData = {
  contractorName: string;
  category: string;          // e.g. "plumber"
  homeownerLocation?: string | null; // e.g. "Austin, TX" — optional
  // Deep link the contractor can follow to accept / view the project.
  projectUrl?: string | null;
};

function firstName(full: string): string {
  return full.split(/\s+/)[0] || "there";
}

function humanCategory(slug: string): string {
  return slug.replace(/_/g, " ");
}

const contractorWinTemplate: NotificationTemplate<ContractorWinData> = {
  id: "contractor.win.v1",
  contentType: "transactional",

  renderEmail: (data): EmailRendered => {
    const name = firstName(data.contractorName);
    const cat = humanCategory(data.category);
    const locLine = data.homeownerLocation
      ? `<p>It's a ${cat} job ${data.homeownerLocation ? `near <strong>${data.homeownerLocation}</strong>` : ""}.</p>`
      : `<p>It's a ${cat} job.</p>`;
    const cta = data.projectUrl
      ? `<p style="margin:24px 0">
           <a href="${data.projectUrl}"
              style="background:#facc15;color:#18181b;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
             View the project
           </a>
         </p>`
      : "";
    const subject = `You won a ${cat} project — from 6 at iSolveUrProblems`;
    const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:24px auto;line-height:1.5;color:#18181b">
  <div style="border-top:4px solid #22c55e;padding-top:16px">
    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#16a34a">iSolveUrProblems · Project Win</p>
    <h2 style="margin:6px 0 0;font-size:22px">Good news, ${name} 🎉</h2>
  </div>
  <p>The homeowner picked you. ${locLine.replace(/^<p>|<\/p>$/g, "")}</p>
  <p>I'll connect the two of you and send over the details so you can confirm timing. Standard iSolveUrProblems platform terms apply.</p>
  ${cta}
  <p style="font-size:13px;color:#52525b">Reply to this email if you have questions, or text me back at any time. — 6</p>
</body></html>`;
    const text = `Good news, ${name} — the homeowner picked you. It's a ${cat} job${data.homeownerLocation ? ` near ${data.homeownerLocation}` : ""}.

I'll connect you both and send over the details. Standard iSolveUrProblems platform terms apply.

${data.projectUrl ? `View the project: ${data.projectUrl}\n\n` : ""}— 6`;
    return { subject, html, text };
  },

  renderSms: (data): SmsRendered => {
    const name = firstName(data.contractorName);
    const cat = humanCategory(data.category);
    const body = data.projectUrl
      ? `Hi ${name}, this is 6 — you won a ${cat} project on iSolveUrProblems. Details: ${data.projectUrl}. Reply STOP to opt out.`
      : `Hi ${name}, this is 6 — you won a ${cat} project on iSolveUrProblems. I'll text you the details shortly. Reply STOP to opt out.`;
    return { body };
  },

  renderWhatsapp: (data): WhatsappRendered => {
    // Meta Content SID placeholder — replaced once BSP approval lands.
    return {
      template_name: "contractor_win_v1",
      parameters: [
        firstName(data.contractorName),
        humanCategory(data.category),
        data.projectUrl ?? "",
      ],
    };
  },
};

export default contractorWinTemplate;
