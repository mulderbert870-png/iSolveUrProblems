export const API_KEY = process.env.LIVEAVATAR_API_KEY || "";
export const API_URL = process.env.LIVEAVATAR_API_URL || "";
export const AVATAR_ID = process.env.LIVEAVATAR_AVATAR_ID || "";

// FULL MODE Customizations
// Wayne's avatar voice and context
export const VOICE_ID = process.env.LIVEAVATAR_VOICE_ID || "";
export const CONTEXT_ID = process.env.LIVEAVATAR_CONTEXT_ID || "";
export const LANGUAGE = process.env.LIVEAVATAR_LANGUAGE || "";

// CUSTOM MODE Customizations
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Supabase Auth (M1.1)
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are read directly in supabaseAdmin.ts
// for server-side service-role use. The anon key + a NEXT_PUBLIC_ variant are
// required by @supabase/ssr for cookie-based user auth.
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
// Public-readable copies (Next.js inlines NEXT_PUBLIC_* into the client bundle).
export const NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
export const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

// Notifications fabric (M1.7)
// Email — Resend (already used in leadAlert.ts; reusing the same key).
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "6 from iSolveUrProblems <onboarding@resend.dev>";
export const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || "";

// SMS + WhatsApp — Twilio.
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
export const TWILIO_FROM_PHONE = process.env.TWILIO_FROM_PHONE || "";
export const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";

// Feature flag — WhatsApp stays scaffolded but disabled until Meta BSP
// approval lands. Set FEATURE_WHATSAPP=1 to enable.
export const FEATURE_WHATSAPP = process.env.FEATURE_WHATSAPP === "1";

// Contractor data source (M2.1)
// 'mock' (default — built-in fake data for development) or 'serpapi'
// (when SG Dietz provides the SERPAPI_API_KEY and we add that adapter).
export const CONTRACTOR_DATA_SOURCE = process.env.CONTRACTOR_DATA_SOURCE || "mock";
export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";

// Admin operations (M2.1+) — seed contractors, override flows, etc.
// Required to call privileged /api/admin/* routes. Set via Vercel env.
export const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

// Cron auth (M3.4+) — guards /api/cron/* routes against public traffic.
// On Vercel: set as a project env var and reference in vercel.json's
// crons block. Locally: pass via Authorization: Bearer header when
// triggering manually.
export const CRON_SECRET = process.env.CRON_SECRET || "";

// Payments — Stripe Connect Express (M2.5).
// Q2.5a: Connect flavor = Express.
// Q2.5b: charge at acceptance.
// Q2.5c: platform fee = 5% (PLATFORM_FEE_PERCENT overrides).
// Q2.5d: USD only (PLATFORM_CURRENCY overrides).
// All Stripe routes return 503 'payments not configured' until
// STRIPE_SECRET_KEY is present.
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
export const NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Connect Express onboarding return URLs — Stripe redirects the
// contractor here after their onboarding flow. Set to {app}/contractor/
// onboarding/return and /refresh once contractor-side pages exist.
export const STRIPE_CONNECT_RETURN_URL =
  process.env.STRIPE_CONNECT_RETURN_URL || "";
export const STRIPE_CONNECT_REFRESH_URL =
  process.env.STRIPE_CONNECT_REFRESH_URL || "";

// Platform fee as a percentage of the gross contract amount.
// Default 5% per Q2.5c "Walmart-model" floor.
const _PLATFORM_FEE_PERCENT_RAW = process.env.PLATFORM_FEE_PERCENT;
export const PLATFORM_FEE_PERCENT =
  _PLATFORM_FEE_PERCENT_RAW && !Number.isNaN(parseFloat(_PLATFORM_FEE_PERCENT_RAW))
    ? Math.max(0, Math.min(100, parseFloat(_PLATFORM_FEE_PERCENT_RAW)))
    : 5;

export const PLATFORM_CURRENCY = (
  process.env.PLATFORM_CURRENCY || "usd"
).toLowerCase();

// Where Stripe Checkout returns the homeowner after pay-success / cancel.
// Falls back to a relative path — Stripe will treat that as same-origin
// when the route is called server-side.
export const STRIPE_CHECKOUT_RETURN_PATH =
  process.env.STRIPE_CHECKOUT_RETURN_PATH || "/checkout";
