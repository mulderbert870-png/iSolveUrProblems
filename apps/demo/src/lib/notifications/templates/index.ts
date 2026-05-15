import type { NotificationTemplate } from "../types";
import welcomeTemplate from "./welcome";
import reportDeliveryTemplate from "./report-delivery";

/**
 * Local-in-code template registry (Q1.7a).
 *
 * Each template owns its own renderEmail / renderSms / renderWhatsapp
 * variants for all supported locales. New templates land in this file
 * — e.g. report-delivery in M1.4, three-way-call-reminder in M3.4.
 *
 * WhatsApp template_name values MUST match a Meta-pre-approved Content
 * SID. While Meta BSP approval is pending, FEATURE_WHATSAPP=0 keeps
 * those code paths inert.
 */
const REGISTRY: Record<string, NotificationTemplate<never>> = {
  "welcome.v1": welcomeTemplate as NotificationTemplate<never>,
  "report.delivery.v1": reportDeliveryTemplate as NotificationTemplate<never>,
};

export function getTemplate(id: string): NotificationTemplate<never> | null {
  return REGISTRY[id] ?? null;
}

export function listTemplateIds(): string[] {
  return Object.keys(REGISTRY);
}
