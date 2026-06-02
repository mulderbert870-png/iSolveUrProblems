import { STRIPE_SECRET_KEY } from "../../../app/api/secrets";

/**
 * Minimal fetch-based Stripe API client (M2.5).
 *
 * Why fetch + raw API rather than the `stripe` npm package:
 *   - Same pattern as Resend / Twilio / Supabase elsewhere in the repo
 *   - Edge-runtime safe, no node-only deps
 *   - Tiny surface — we only need 5 endpoints for v1
 *
 * Stripe API form-encodes its request bodies; this module wraps that
 * and the Bearer auth header. Every call returns `{ ok, data }` or
 * `{ ok: false, error }` — never throws.
 *
 * When STRIPE_SECRET_KEY is unset (dev, or pre-handoff), `isConfigured()`
 * returns false and callers MUST 503 the request before touching this
 * module. All exported async functions here will return ok:false with
 * a clear error if invoked anyway.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-06-20";

export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

export type StripeResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * Flatten a JS object into Stripe's `key[subkey]=value` form-encoding.
 * Handles nested objects + arrays — same shape as the official SDK.
 */
function flattenForStripe(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      pairs.push([key, String(v)]);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") {
          pairs.push(
            ...flattenForStripe(
              item as Record<string, unknown>,
              `${key}[${i}]`,
            ),
          );
        } else if (item !== undefined && item !== null) {
          pairs.push([`${key}[${i}]`, String(item)]);
        }
      });
    } else if (typeof v === "object") {
      pairs.push(
        ...flattenForStripe(v as Record<string, unknown>, key),
      );
    }
  }
  return pairs;
}

async function stripeCall<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<StripeResult<T>> {
  if (!isStripeConfigured()) {
    return { ok: false, status: 0, error: "stripe not configured" };
  }

  const method = init.method ?? "POST";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  let body: string | undefined;
  if (method === "POST" && init.body) {
    const params = new URLSearchParams();
    for (const [k, v] of flattenForStripe(init.body)) {
      params.append(k, v);
    }
    body = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  let res: Response;
  try {
    res = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "stripe fetch threw",
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, status: res.status, error: "stripe non-json response" };
  }
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      `stripe ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, data: data as T };
}

// ─── Endpoints we use ───────────────────────────────────────────────

export type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

export async function createConnectExpressAccount(args: {
  email?: string | null;
  metadata?: Record<string, string>;
}): Promise<StripeResult<StripeAccount>> {
  return stripeCall<StripeAccount>("/accounts", {
    body: {
      type: "express",
      ...(args.email ? { email: args.email } : {}),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: args.metadata,
    },
  });
}

export async function retrieveAccount(
  accountId: string,
): Promise<StripeResult<StripeAccount>> {
  return stripeCall<StripeAccount>(`/accounts/${accountId}`, { method: "GET" });
}

export type StripeAccountLink = {
  url: string;
  expires_at: number;
};

export async function createAccountLink(args: {
  account: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<StripeResult<StripeAccountLink>> {
  return stripeCall<StripeAccountLink>("/account_links", {
    body: {
      account: args.account,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
    },
  });
}

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent: string | null;
};

export async function createCheckoutSession(args: {
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  destinationAccountId: string;
  productName: string;
  metadata: Record<string, string>;
  customerEmail?: string | null;
}): Promise<StripeResult<StripeCheckoutSession>> {
  return stripeCall<StripeCheckoutSession>("/checkout/sessions", {
    body: {
      mode: "payment",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      ...(args.customerEmail ? { customer_email: args.customerEmail } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.currency,
            unit_amount: args.amountCents,
            product_data: {
              name: args.productName,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: args.applicationFeeCents,
        transfer_data: {
          destination: args.destinationAccountId,
        },
      },
      metadata: args.metadata,
    },
  });
}
