import type {
  NotificationTemplate,
  EmailRendered,
  SmsRendered,
  WhatsappRendered,
} from "../types";

/**
 * Starter "welcome" template — proves the wiring works end-to-end.
 * Real templates (report-delivery, etc.) land alongside the features
 * that need them (M1.4 onward).
 */
export type WelcomeData = {
  firstName?: string;
};

function greet(name?: string): string {
  return name?.trim() ? name.trim() : "friend";
}

const welcomeTemplate: NotificationTemplate<WelcomeData> = {
  id: "welcome.v1",
  contentType: "transactional",

  renderEmail: (data): EmailRendered => {
    const name = greet(data.firstName);
    return {
      subject: `Welcome to iSolveUrProblems, ${name}`,
      html: `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;line-height:1.5">
  <h2>Hi ${name},</h2>
  <p>I'm 6 — your ai-powered solution buddy. Whenever you've got a problem you need help with, just open the app and tell me.</p>
  <p>If you ever want me to forget what I know about you, you can wipe it from your account page.</p>
  <p>— 6</p>
</body></html>`,
      text: `Hi ${name},\n\nI'm 6 — your ai-powered solution buddy. Whenever you've got a problem you need help with, just open the app and tell me.\n\nIf you ever want me to forget what I know about you, you can wipe it from your account page.\n\n— 6`,
    };
  },

  renderSms: (data): SmsRendered => {
    const name = greet(data.firstName);
    return {
      body: `Hi ${name}, this is 6 from iSolveUrProblems. Open the app any time you've got a problem you'd like help with. Reply STOP to opt out.`,
    };
  },

  renderWhatsapp: (data): WhatsappRendered => {
    // For WhatsApp, the template_name must be a Meta-pre-approved
    // Content SID (HX...). 'welcome_v1' is a placeholder — replace
    // with the real Content SID once Meta approves your template.
    return {
      template_name: "welcome_v1",
      parameters: [greet(data.firstName)],
    };
  },
};

export default welcomeTemplate;
