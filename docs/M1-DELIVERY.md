# iSolveUrProblems — Milestone 1 Delivery

> Date marked complete: 2026-05-19
> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`
> Companion docs: [ROADMAP.md](ROADMAP.md), [M1-BUILD-ORDER.md](M1-BUILD-ORDER.md)

This document tells you exactly what shipped in Milestone 1, where each piece is anchored in the original vision doc, and the **two configuration items you still need to handle before a public launch.**

---

## TL;DR

Everything required for **"6 solves problems for free, polished end-to-end"** is built, committed to `main`, and quality-checked (typecheck + production build green). A user can:

- Open the app in 6 languages (EN, ES, FR, PT, DE, ZH)
- Talk to 6, show their problem on camera, get a diagnosis
- Receive a structured fix-it PDF report by **email or SMS** (WhatsApp scaffolded but waiting on Meta BSP approval)
- Sign in to have 6 remember them across sessions

**Two things must be configured before launch:**
1. **Resend domain verification** — without it, email delivery only reaches the Resend account's own email
2. **Twilio phone number** — without it, the SMS delivery channel is dark

Details below.

---

## What shipped — feature by feature

Each row links back to the vision-doc paragraph that mandates it.

### M1.3 — Real-time "Go Live" camera streaming

**Vision ¶6:** *"6 will ask them to either turn the camera on for a **real-time look** and/or listen to the problem, or upload pictures or videos for him to analyze."*

What's there:
- "Go Live" button in the avatar UI
- Adaptive-fps frame loop (1 fps baseline, 2 fps burst on scene change, 0.2 fps when scene is stable)
- Client-side perceptual hash skips uploading unchanged frames (cost saving)
- Server-side `/api/analyze/go-live` calls Gemini 2.0 Flash by default (can escalate to GPT-4o)
- 6 narrates scene changes proactively (suppressed if avatar/user is currently speaking, debounced to ≥10 s between narrations)
- "🔴 Live" privacy banner pinned at the top whenever the camera is feeding 6
- Frames persisted to `media_events` with `source = 'go_live_frame'` for audit

### M1.4 — Multi-channel fix-it report delivery

**Vision ¶7:** *"6 will offer to send them a written report explaining all the fixes by **email, text, or messaging app — however they prefer**."*

What's there:
- A delivery panel under each generated report letting the user pick Email / SMS / WhatsApp
- Captures phone number + consent inline when SMS or WhatsApp is selected
- Persists the user's preferred channel to their profile
- Falls back gracefully (Q1.7b — fail-open with audit log) if a channel isn't configured or consent is missing
- Every send recorded in `notifications_sent` with delivery-status webhooks from Resend + Twilio

### M1.5 — PDF/HTML structured report generator

**Vision ¶7:** *"a **written report** explaining all the fixes"*

What's there:
- A POST to `/api/reports/generate` with `{ session_id, locale }` produces a report
- LLM composer pulls the session's transcript + photo analyses → structured `Report` JSON (title, summary, problem statement, diagnosis, sections, materials, steps with cautions, photos, legal disclaimer)
- Renders to both **HTML** (for inline viewing + email body) and **PDF** (signed download link)
- Branded with the gold theme; disclaimer localized per locale
- Stored in a private `reports` Supabase bucket; served via short-lived signed URLs
- Reachable at `/<locale>/reports/[id]`

### M1.6 — Multi-language support

**Vision ¶26:** *"with natural language, **6 speaks as many languages as ai speaks**, and can translate in real time for any situation."*

What's there:
- URL-based locale routing: `/en/`, `/es/`, `/fr/`, `/pt/`, `/de/`, `/zh/`
- Locale picker + signed-in / signed-out indicator under the page title
- Browser `Accept-Language` auto-detection for anonymous visitors
- Persists chosen locale to the user profile if signed in
- Every visible UI string is translated (page chrome, buttons, "Loading…", "Analyzing…", report viewer, delivery panel, sign-in form, memory panel, error pages)
- When a session starts, the user's locale flows through to HeyGen → **6 speaks the chosen language**
- The chat brain receives an explicit "Respond to the user in {language}" directive
- Report bodies and legal disclaimers are written in the user's language

**Known polish item:** Chinese (ZH) translations are machine-translated and flagged for native-speaker review before public ZH launch.

---

## Infrastructure built alongside the vision features

These pieces are not enumerated in the vision doc but are required infrastructure for the features above to actually function. They're all committed and live in the codebase.

| Module | What it does |
|---|---|
| **Supabase Auth** | Magic-link email + Google OAuth sign-in. Anonymous sessions can promote to signed-in without losing prior conversation history. Required so M1.4 can know **who** to email the report to and M1.5 reports can be ownership-scoped. |
| **Per-user persistent memory (pgvector)** | After each chat turn, 6 distills durable facts (name, address, property, preferences, prior issues) into a vector store. Next session, 6 recalls the relevant facts via cosine similarity and weaves them into the system prompt. User can view + forget any fact (GDPR view/delete) at `/<locale>/account/memory`. |
| **Notifications fabric** | Single `send()` function abstracts Email (Resend) / SMS (Twilio) / WhatsApp (Twilio WA Business, feature-flagged). Auditable via the `notifications_sent` table. Powers M1.4 delivery. |
| **Supabase-native error logging** | Every server / client / edge error lands in a private `error_logs` table with user_id, route, stack, and runtime context. No external vendor (Sentry was evaluated and dropped in favor of this Supabase-native approach to keep data inside your project). |

---

## ⚠️ Two configuration items pending before public launch

Both are **operational setup, not code work** — neither requires another engineering pass. Until they're configured, the corresponding channel is "dark" but doesn't crash the app (each returns a structured failure and the audit log records it).

### 1. Resend domain not yet verified

**Current state:** The `.env` for the project does not have a verified sending domain configured. The notifications fabric falls back to Resend's sandbox sender `onboarding@resend.dev`.

**What this means today:**
- Emails technically send via Resend ✓
- But Resend's sandbox sender **only delivers to the email address the Resend account was registered with**
- Emails to any other recipient (i.e. real users) are silently dropped or land in spam

**What needs to happen (≈ 30 minutes of DNS work):**
1. In the [Resend Dashboard](https://resend.com/dashboard) → **Domains** → Add `mail.isolveurproblems.ai` (or another subdomain you choose)
2. Resend will display 3 DNS records (one MX, two TXT — for SPF and DKIM)
3. Add those records at whichever provider hosts your domain's DNS (Cloudflare / Vercel DNS / Namecheap / etc.)
4. Click "Verify" in Resend — typically clears within minutes
5. Update env var `RESEND_FROM_EMAIL` to use the new sender (e.g. `"6 from iSolveUrProblems <hi@mail.isolveurproblems.ai>"`)
6. Register the webhook endpoint in Resend Dashboard: `https://<prod-domain>/api/webhooks/resend` — Resend returns a signing secret → put in `RESEND_WEBHOOK_SECRET`

**No code changes required.** The fabric already reads `RESEND_FROM_EMAIL` and `RESEND_WEBHOOK_SECRET` from env.

### 2. Twilio phone number not configured

**Current state:** The Twilio account exists (account SID / auth token may or may not be set in `.env`), but no phone number has been bought, and `TWILIO_FROM_PHONE` is empty. The SMS channel returns a clean `{ ok: false, error: "Twilio SMS not configured" }` whenever invoked. WhatsApp shares the Twilio account but has its own `TWILIO_WHATSAPP_FROM` and is feature-flagged off.

**What this means today:**
- The "SMS" option in the report delivery panel is selectable but every send fails immediately
- The audit log shows the failure and which user attempted it
- Users with SMS as their preferred channel quietly fall back to email (Q1.7b — fail-open posture)

**What needs to happen (sender + A2P 10DLC registration takes ~3–5 business days):**
1. In the [Twilio Console](https://console.twilio.com/) → **Phone Numbers** → Buy a Number (US local ≈ $1.15/mo, toll-free ≈ $2/mo)
2. Complete **A2P 10DLC registration** (US compliance — required since 2023):
   - Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC
   - Register the Brand (business info)
   - Register a Campaign (e.g. "Customer Care: deliver fix-it reports to homeowners")
   - Low-volume Sole-Proprietor tier: 3–5 business days, no fee
3. Set the number's **Status Callback URL** to `https://<prod-domain>/api/webhooks/twilio`
4. Set env vars:
   - `TWILIO_ACCOUNT_SID=ACxxxxx...`
   - `TWILIO_AUTH_TOKEN=...`
   - `TWILIO_FROM_PHONE=+15551234567` (the number you bought, E.164 format)

**No code changes required.** The fabric reads these envs and the SMS channel turns on automatically.

### Bonus item — WhatsApp Business (longer lead time, optional for M1 launch)

Vision ¶7 lists "messaging app" alongside email and text. WhatsApp is scaffolded but flag-gated behind `FEATURE_WHATSAPP=1`:

- Code path complete: template content, send mechanism, webhook handler
- Pre-approved message template body locked: *"Hi {{1}}, this is 6 from iSolveUrProblems with your fix-it report. View it here: {{2}}. Reply STOP to opt out."*
- **Waiting on Meta Business Verification + WhatsApp template approval** (typically ~3 weeks; depends on Meta)
- Once Meta approves: paste the Content SID into the template, set `TWILIO_WHATSAPP_FROM` to your approved WA number, set `FEATURE_WHATSAPP=1`, deploy — WhatsApp delivery is live

You can launch M1 without WhatsApp (Email + SMS satisfy vision ¶7's "however they prefer").

---

## Other operational items

### Supabase

The following migrations need to be applied to your Supabase project (Dashboard → SQL Editor):

```
apps/demo/supabase/migrations/20260514_auth_and_users.sql
apps/demo/supabase/migrations/20260515_error_logs.sql
apps/demo/supabase/migrations/20260515_user_memory_facts.sql
apps/demo/supabase/migrations/20260515_notifications_sent.sql
apps/demo/supabase/migrations/20260515_reports.sql
```

Plus two **Storage buckets** must exist in Supabase Dashboard → Storage:
- `isolve-media` (already exists — for camera / video uploads)
- `reports` (**create this; mark as private**)

And one extension must be enabled:
- `pgvector` (usually pre-enabled on Supabase Pro)

### Google OAuth

For the "Continue with Google" sign-in button to work, the OAuth client in Google Cloud Console must have:
- **Authorized redirect URI:** `https://<your-supabase-project>.supabase.co/auth/v1/callback`
- **Authorized JavaScript origins:** the prod domain + `http://localhost:3001` for dev

The Client ID + Secret are pasted into Supabase Dashboard → Authentication → Providers → Google.

Magic-link email sign-in works without Google config — that's the always-available fallback.

### LiveAvatar / HeyGen language config

For 6 to speak the user's chosen language correctly, the HeyGen avatar's voice must support all 6 launch languages. Easiest setup: a single multilingual voice on the avatar's persona. If the existing voice is English-only, signed-in users with `preferred_locale=es` (etc.) will see Spanish UI but hear an English-accented 6 — which is a bug to fix on the HeyGen side, not in our code.

The avatar-locale bridge passes the primary language subtag (`en`, `es`, `fr`, `pt`, `de`, `zh`) to HeyGen's session-token endpoint. This matched HeyGen's allowlist after we hit a `4000 "Language not supported"` error on full IETF tags like `en-US`.

---

## How to verify the build works (smoke test)

After applying migrations + setting env vars:

1. **Sign in as a test user** (magic link to your own inbox works without Resend domain verification)
2. **Open the home page** → 6 greets you in English
3. **Click the locale picker → pick Español** → page reloads briefly → 6 reappears speaking Spanish
4. **Talk to 6** about a problem — try uploading a photo or clicking "Go Live"
5. **Generate a report:** call `POST /api/reports/generate` with the active `session_id` and the locale → check the response says `status: "ready"`
6. **Open** `/es/reports/<id>` → see the report rendered in Spanish with photos + steps + materials
7. **Click "Send report" → Email** with your verified email address → check inbox
8. **Visit** `/es/account/memory` → see the facts 6 stored from the conversation; "Forget" any of them
9. **In Supabase SQL editor:**
   ```sql
   select created_at, channel, recipient, status from notifications_sent order by created_at desc limit 5;
   select level, runtime, route, message from error_logs order by created_at desc limit 10;
   select kind, content from user_memory_facts where user_id = '<your-id>' order by created_at desc;
   ```

---

## What's next (sneak peek of Milestone 2)

Milestone 2 — **Contractor Marketplace v1 (Revenue On)** — turns on the lead-generation engine. Anchored to vision paragraphs 9–11, 19, 21:

| Feature | Vision anchor |
|---|---|
| Scrape the internet for contractors | ¶9 |
| Filter by user preferences (price, locality, same-day, ≥4.5⭐) | ¶10 |
| LLM-summarize each contractor's reviews | ¶11 |
| Rank-recommend the best matches | ¶11 |
| Take a platform cut on each contract | ¶21 |
| Tell winning + losing contractors with friendly feedback | ¶19 |

This is when **revenue starts flowing** (¶21: *"iSolve makes a cut of every contract"*).

See [ROADMAP.md](ROADMAP.md) for the full M1–M5 plan.

---

## Reference: what's in `main` for Milestone 1

Commits that constitute M1 (most recent first):

```
59b9c70  feat: enhance localization (HeaderControls + button labels)
1e3578b  refactor: M1 goal + feature list cleanup in ROADMAP.md
fd4baae  M1.6b: locale resolution, avatar-language bridge, ES/FR/PT/DE/ZH translations, localized disclaimers
73397f5  M1.4: delivery panel for report sharing via email/SMS/WhatsApp
d5f120c  refactor: code structure (report generator + auxiliary)
1e7e2ed  M1.3: Go Live adaptive frame streaming + privacy banner
12b86e6  M1.7: notifications fabric (Resend + Twilio + webhooks)
8b21a6f  M1.2: per-user persistent memory (pgvector + GDPR panel)
d0d0e6f  M1.8a: Supabase-native error_logs (replaces evaluated-and-dropped Sentry)
9493b36  M1.6a: next-intl scaffold (EN/ES/FR/PT/DE/ZH)
b2dacb8  M1.1: Supabase Auth (magic-link + Google OAuth)
```

---

## Summary for SG Dietz

**M1 is feature-complete and shippable today** — with one practical asterisk: the email and SMS delivery channels need their respective vendor configurations before reaching real users.

| Item | Status | Blocking launch? |
|---|---|---|
| All M1 features per vision doc | ✅ Done | — |
| Google OAuth redirect URI | ⚠️ Operational task | No (magic-link works) |
| Resend domain verification | ⚠️ Operational task | Yes for email delivery |
| Twilio number + A2P 10DLC | ⚠️ Operational task | Yes for SMS delivery |

Everything in the "operational task" rows is configuration on your side — no further code work required. The "vendor config" and "Meta queue" rows can be done in parallel with M2 work.
