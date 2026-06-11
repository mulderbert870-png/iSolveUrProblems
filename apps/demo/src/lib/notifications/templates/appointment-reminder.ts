import type {
  NotificationTemplate,
  EmailRendered,
  SmsRendered,
  WhatsappRendered,
} from "../types";

/**
 * M3.4 — Appointment reminders.
 *
 * Vision ¶14: "before meetings or when work is to occur, 6 will message
 * both parties to make sure they'll be on time and ready."
 *
 * Two variants — 24h-before and 2h-before — both render through email
 * + SMS + WhatsApp. Sent to BOTH the homeowner and the contractor on
 * the cron pass.
 */

export type AppointmentReminderData = {
  recipientName?: string | null;
  /** Counterparty name (the OTHER person on the appointment). */
  otherPartyName?: string | null;
  /** Human-readable local time, e.g. "tomorrow at 10:00 AM". */
  whenText: string;
  /** Short description of what the meeting is for. */
  agenda?: string | null;
  /** Optional link the recipient can follow to reschedule. */
  rescheduleUrl?: string | null;
};

function firstName(full?: string | null): string {
  if (!full) return "there";
  return full.split(/\s+/)[0] || "there";
}

function buildAppointmentReminderTemplate(
  kind: "24h" | "2h",
): NotificationTemplate<AppointmentReminderData> {
  const id = `appointment.reminder.${kind}.v1`;
  const headline =
    kind === "24h"
      ? "Reminder — your appointment is tomorrow"
      : "Heads up — your appointment is in 2 hours";

  return {
    id,
    contentType: "transactional",

    renderEmail: (data): EmailRendered => {
      const name = firstName(data.recipientName);
      const other = data.otherPartyName
        ? ` with ${data.otherPartyName}`
        : "";
      const agendaLine = data.agenda?.trim()
        ? `<p>What we're covering: <strong>${data.agenda}</strong></p>`
        : "";
      const rescheduleLine = data.rescheduleUrl
        ? `<p style="margin-top:16px"><a href="${data.rescheduleUrl}" style="color:#facc15">Need to reschedule? Tap here.</a></p>`
        : "";
      const subject = `${headline} (${data.whenText})`;
      const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:24px auto;line-height:1.5;color:#18181b">
  <div style="border-top:4px solid #facc15;padding-top:16px">
    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#52525b">iSolveUrProblems · Appointment Reminder</p>
    <h2 style="margin:6px 0 0;font-size:22px">${headline}</h2>
  </div>
  <p>Hey ${name},</p>
  <p>Just a heads-up — your appointment${other} is <strong>${data.whenText}</strong>.</p>
  ${agendaLine}
  <p>6 will be here to help if anything changes. Reply STOP to opt out of these reminders.</p>
  ${rescheduleLine}
  <p style="margin-top:24px">— 6</p>
</body></html>`;
      const text = `Hey ${name},

${headline}.

Your appointment${other} is ${data.whenText}.
${data.agenda ? `What we're covering: ${data.agenda}\n` : ""}
${data.rescheduleUrl ? `Need to reschedule? ${data.rescheduleUrl}\n` : ""}
— 6 (reply STOP to opt out)`;
      return { subject, html, text };
    },

    renderSms: (data): SmsRendered => {
      const name = firstName(data.recipientName);
      const other = data.otherPartyName ? ` with ${data.otherPartyName}` : "";
      const body =
        kind === "24h"
          ? `Hi ${name}, reminder: your appointment${other} is ${data.whenText}. — 6 (STOP to opt out)`
          : `Hi ${name}, heads-up: your appointment${other} starts in 2 hours (${data.whenText}). — 6 (STOP to opt out)`;
      return { body };
    },

    renderWhatsapp: (data): WhatsappRendered => {
      return {
        template_name: `appointment_reminder_${kind}_v1`,
        parameters: [
          firstName(data.recipientName),
          data.otherPartyName ?? "",
          data.whenText,
        ],
      };
    },
  };
}

export const appointmentReminder24hTemplate =
  buildAppointmentReminderTemplate("24h");
export const appointmentReminder2hTemplate =
  buildAppointmentReminderTemplate("2h");
