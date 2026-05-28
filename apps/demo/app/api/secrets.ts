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
