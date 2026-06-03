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

/**
 * Whitelist of currencies the platform will accept. Stripe supports
 * many more — we limit at this layer so a bad env value or a future
 * caller can't push an unsupported / suspicious currency to Stripe.
 * Expand explicitly when a new currency is approved by the business.
 */
const ALLOWED_CURRENCIES: ReadonlySet<string> = new Set(["usd"]);

/**
 * Belt-and-suspenders input guards for createCheckoutSession. The
 * /api/contracts/create route already validates each field before it
 * gets here, but enforcing them inside the helper means any future
 * caller is held to the same money-safety contract:
 *   - amount must be strictly positive
 *   - application fee must be non-negative and strictly less than the
 *     amount (an equal/larger fee would zero out or invert the
 *     contractor payout)
 *   - currency must be in our explicit allowlist
 *   - destination account id must look like a real Connect account
 *
 * Returns ok:false with a clear error rather than throwing — keeps the
 * StripeResult shape consistent with the rest of this module.
 */
function validateCheckoutInputs(args: {
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  destinationAccountId: string;
}): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isInteger(args.amountCents) ||
    args.amountCents <= 0
  ) {
    return { ok: false, error: "amountCents must be a positive integer" };
  }
  if (
    !Number.isInteger(args.applicationFeeCents) ||
    args.applicationFeeCents < 0
  ) {
    return {
      ok: false,
      error: "applicationFeeCents must be a non-negative integer",
    };
  }
  if (args.applicationFeeCents >= args.amountCents) {
    return {
      ok: false,
      error: "applicationFeeCents must be strictly less than amountCents",
    };
  }
  if (!ALLOWED_CURRENCIES.has(args.currency.toLowerCase())) {
    return { ok: false, error: `currency '${args.currency}' is not allowed` };
  }
  if (!/^acct_[A-Za-z0-9]+$/.test(args.destinationAccountId)) {
    return {
      ok: false,
      error: "destinationAccountId must look like 'acct_...'",
    };
  }
  return { ok: true };
}

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
  const guard = validateCheckoutInputs(args);
  if (!guard.ok) return { ok: false, status: 400, error: guard.error };
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
            currency: args.currency.toLowerCase(),
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
