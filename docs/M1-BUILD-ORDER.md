# Milestone 1 — Build Order

> Companion to [ROADMAP.md](ROADMAP.md). Scope-only. No timelines.
> Goal of M1: ship the free-solutions layer as a real product. User talks to 6, shows their problem, gets a deliverable fix-it report; comes back next week and 6 remembers them.

This document is the **ordered build plan** for Milestone 1. It expands each M1.x feature into concrete sub-tasks, lists dependencies, names the files touched, and surfaces the **design questions** that must be answered before coding starts.

---

## Build Order at a Glance

The order below respects dependencies (each step can land only after its prerequisites). Numbered steps are sequential; letters within a number are parallelizable.

| Step | Feature | Why this position |
|---|---|---|
| **1** | M1.1 Auth (Supabase Auth) | Foundation. Every later feature needs `user_id`. |
| **2a** | M1.8a Observability — Supabase-native error logs | Cheap to install; want crash visibility before we build the rest. Data stays in Supabase (no external vendor). |
| **2b** | M1.6a i18n framework scaffold | Land early so we don't accumulate hard-coded English in M1.2–M1.5. |
| **3** | M1.2 Per-user persistent memory | Needs M1.1 (`user_id`). Touches the LLM chat route — best to do before adding more callers. |
| **4** | M1.7 Notifications fabric | Channel abstraction. Must exist before M1.4 uses it. |
| **5** | M1.3 Real-time "Go Live" camera streaming | Parallel-friendly. New API route, doesn't touch chat surface. |
| **6** | M1.5 PDF/HTML report generator | Pre-req for M1.4. Pure server work, no UI churn. |
| **7** | M1.4 Multi-channel report delivery | Needs M1.5 + M1.7. WhatsApp scaffolded but disabled by feature flag. |
| **8** | M1.6b Translation sweep (UI strings, prompts, TTS voices) | Last — sweeps across all surfaces built in steps 1–7 in one pass. |
| **9** | M1.8b LLM call logging | Wraps every LLM call site built in steps 1–8. Lands last to avoid retro-wrapping during churn. |

---

## Dependency Graph (text-only)

```
M1.1 Auth ───────────────┬─→ M1.2 Memory
                         ├─→ M1.6a i18n scaffold (locale on user profile)
                         ├─→ M1.7 Notifications (preferred_channels on user)
                         ├─→ M1.3 Go Live (user_id tagging)
                         └─→ M1.8a logger user context

M1.8a Supabase logger ──→ (passive — wraps every call site)

M1.6a i18n scaffold ────→ M1.5 Report locale
                          M1.6b Translation sweep

M1.5 Report gen ──┐
M1.7 Notifications ├──→ M1.4 Multi-channel delivery
                  ┘

(all of M1.1–M1.7) ─────→ M1.6b Translation sweep ─→ M1.8b LLM call logging
```

---

## M1.1 — Supabase Auth

### Sub-tasks
1. Migration: `users` profile table (`id`, `email`, `phone`, `full_name`, `preferred_locale`, `preferred_channels jsonb`, `created_at`)
2. Configure Supabase Auth providers — magic-link email is mandatory; phone OTP, Google OAuth, Apple OAuth are toggles (see **Q1.1a**)
3. Install `@supabase/ssr` + `@supabase/auth-helpers-nextjs`; wire `<AuthProvider>` into [apps/demo/app/layout.tsx](../apps/demo/app/layout.tsx)
4. Sign-in / sign-up UI — `/auth/sign-in`, `/auth/callback`
5. Anonymous session bootstrap — 6 can start talking before login, then 6 asks for email when it's time to deliver a report
6. **Anonymous → authenticated upgrade flow** — link existing anonymous `session_id`, `transcript_events`, `media_events` to the new `user_id`
7. Server-side helper `getUser(request)` for API routes
8. RLS policies on `transcript_events`, `media_events`, `users`, new `notifications_sent`, new `llm_calls` tables; service role bypasses for backend
9. Wire `user_id` into [start-session](../apps/demo/app/api/start-session/route.ts), [conversation/log](../apps/demo/app/api/conversation/log/route.ts), [media/capture](../apps/demo/app/api/media/capture/route.ts), [transcription/capture](../apps/demo/app/api/transcription/capture/route.ts)
10. Sign-out + session revocation

### Files touched
- **New:** `supabase/migrations/<new>_users_and_rls.sql`, `apps/demo/app/auth/sign-in/page.tsx`, `apps/demo/app/auth/callback/route.ts`, `apps/demo/src/lib/auth/getUser.ts`, `apps/demo/src/lib/auth/AuthProvider.tsx`
- **Modified:** [layout.tsx](../apps/demo/app/layout.tsx), every API route under [apps/demo/app/api/](../apps/demo/app/api/), [supabaseAdmin.ts](../apps/demo/src/lib/supabaseAdmin.ts)

---

## M1.8a — Supabase-native error logs

### Sub-tasks
1. Migration: `public.error_logs` (level / runtime / user_id / session_id / message / stack / route / context jsonb) + RLS locked to service role
2. `src/lib/observability/serverLogger.ts` — direct service-role REST insert; never throws
3. `src/lib/observability/clientLogger.ts` — installs window error handlers + posts to `/api/observability/log`
4. `app/api/observability/log/route.ts` — validates payload, attaches `user_id` from cookies, rate-limited
5. Custom error boundaries in `app/error.tsx`, `app/global-error.tsx` — call `captureClientError`
6. AuthProvider calls `setClientLoggerUser(id)` on sign-in / sign-out so all subsequent logs carry the user id

### Files touched
- **New:** migration, `src/lib/observability/{types,serverLogger,clientLogger}.ts`, `app/api/observability/log/route.ts`, `apps/demo/app/error.tsx`, `apps/demo/app/global-error.tsx`
- **Modified:** [AuthProvider.tsx](../apps/demo/src/lib/auth/AuthProvider.tsx), [package.json](../apps/demo/package.json)

---

## M1.6a — i18n Framework Scaffold

### Sub-tasks
1. Install `next-intl`
2. Locale routing — `app/[locale]/*` segment OR middleware-driven cookie (see **Q1.6a1**)
3. Create `messages/en.json` populated; `es/fr/pt/de/zh.json` as empty stubs (filled in step 8)
4. `<NextIntlClientProvider>` in root layout
5. Locale picker in header
6. Persist user choice to `users.preferred_locale`
7. Auto-detect from `Accept-Language` for anonymous users
8. Replace every hardcoded English string in [LiveAvatarDemo.tsx](../apps/demo/src/components/LiveAvatarDemo.tsx), [LiveAvatarSession.tsx](../apps/demo/src/components/LiveAvatarSession.tsx), [BackToPreviousButton.tsx](../apps/demo/src/components/BackToPreviousButton.tsx), and legal pages with `t('key')`

### Files touched
- **New:** `apps/demo/messages/{en,es,fr,pt,de,zh}.json`, `apps/demo/src/i18n/config.ts`, `apps/demo/middleware.ts`
- **Modified:** root layout, page components, legal pages

---

## M1.2 — Per-User Persistent Memory

### Sub-tasks
1. Enable `pgvector` extension in Supabase
2. Migration: `user_memory_facts` (`id`, `user_id`, `session_id`, `kind` enum, `content text`, `embedding vector(1536)`, `source_event_id`, `created_at`)
3. **Memory writer** — after each user turn, an LLM-driven fact-extraction pass produces durable facts (name, address, property type, prior issues, channel preferences) and stores with embedding
4. **Memory reader** — at start of each turn, top-K similarity-search relevant facts → injected into the LLM system prompt
5. Wire writer + reader into [openai-chat-complete/route.ts](../apps/demo/app/api/openai-chat-complete/route.ts) (and [grokai-chat-complete](../apps/demo/app/api/grokai-chat-complete) if still active)
6. UI: "What 6 remembers about you" panel — user-visible, GDPR right-to-view
7. UI: "Forget this" per-fact delete — GDPR right-to-delete

### Files touched
- **New:** `supabase/migrations/<new>_pgvector_memory.sql`, `apps/demo/src/lib/memory/{extractFacts,recallFacts,types}.ts`, `apps/demo/app/account/memory/page.tsx`
- **Modified:** chat-complete route(s)

---

## M1.7 — Notifications Fabric

### Sub-tasks
1. New module `apps/demo/src/lib/notifications/`
2. Channel interface — `send(channel, recipient, templateId, data) → Promise<DeliveryResult>`
3. Implementations:
   - `email.ts` — Resend
   - `sms.ts` — Twilio Programmable Messaging
   - `whatsapp.ts` — Twilio WhatsApp Business, **disabled by `FEATURE_WHATSAPP=false`**
4. Template registry — versioned `templateId → { en, es, fr, pt, de, zh }`
5. Migration: `notifications_sent` (`id`, `user_id`, `channel`, `recipient`, `template_id`, `provider_id`, `status`, `error`, `created_at`)
6. Retry + dead-letter queue for transient failures (lightweight — pg-boss or just a `retry_after` column for v1)
7. Webhook handlers — `app/api/webhooks/resend/route.ts`, `app/api/webhooks/twilio/route.ts` — update `status`
8. Preference resolver — reads `users.preferred_channels` to pick best channel for a given content type

### Files touched
- **New:** `apps/demo/src/lib/notifications/{index,email,sms,whatsapp,templates,resolver}.ts`, webhook routes, migration
- **Modified:** [secrets.ts](../apps/demo/app/api/secrets.ts) (env additions: `RESEND_API_KEY`, `TWILIO_*`, `FEATURE_WHATSAPP`)

---

## M1.3 — Real-time "Go Live" Camera Streaming

### Sub-tasks
1. Replace one-shot snapshot UX with a continuous frame loop
2. Client: `MediaStream` → canvas → JPEG → upload (1 fps initial; adaptive later)
3. **Perceptual-hash dedup** — skip LLM call when scene hasn't changed (see **Q1.3c** — client vs. server)
4. New API route `app/api/analyze/go-live/route.ts` — Gemini/GPT-4o vision call, persists in `media_events` as `source = 'go_live_frame'`
5. Stream the vision model's commentary back into 6's conversation so 6 can react in real time
6. Stop / pause controls + battery saver (lower fps when tab backgrounded)
7. Persistent visible "🔴 LIVE" privacy banner

### Files touched
- **New:** `apps/demo/src/components/GoLiveCamera.tsx`, `apps/demo/app/api/analyze/go-live/route.ts`, `apps/demo/src/lib/vision/perceptualHash.ts`
- **Modified:** [LiveAvatarSession.tsx](../apps/demo/src/components/LiveAvatarSession.tsx) (UI integration)

---

## M1.5 — PDF/HTML Report Generator

### Sub-tasks
1. New module `apps/demo/src/lib/reports/`
2. `Report` schema — title, summary, sections[], photos[], materials[], recommended steps[], optional contractor-recommendation block (placeholder slot for M2), legal disclaimer
3. **Report composer** — LLM call: full session transcript + media events → structured `Report` JSON
4. HTML renderer — server-rendered React component → HTML string
5. PDF renderer — `@react-pdf/renderer` (see **Q1.5a**)
6. Storage — store both HTML + PDF in Supabase Storage `reports/` bucket; signed URL on read
7. Report viewer page `app/[locale]/reports/[id]/page.tsx`
8. Trigger hook in conversation flow — when 6 says "I'll send you a report", queue generation

### Files touched
- **New:** `apps/demo/src/lib/reports/{compose,renderHtml,renderPdf,types,store}.ts`, `apps/demo/app/[locale]/reports/[id]/page.tsx`, `apps/demo/app/api/reports/generate/route.ts`
- **Modified:** chat-complete route (trigger hook)

---

## M1.4 — Multi-Channel Report Delivery

### Sub-tasks
1. Use M1.7 fabric to deliver
2. Email template — HTML email + signed PDF link (recommend **link, not attachment** — see **Q1.4a**)
3. SMS template — short copy + signed PDF link
4. WhatsApp template — pre-approved Meta template body (scaffolded but `FEATURE_WHATSAPP=false`)
5. UI: in conversation, 6 asks "How would you like the report?" — answer captured to `users.preferred_channels`
6. Confirm delivery via webhooks (already from M1.7) → update `notifications_sent.status`
7. "Resend report" action in user account page

### Files touched
- **New:** `apps/demo/src/lib/notifications/templates/report-delivery.{en,es,...}.ts`, `apps/demo/app/api/reports/[id]/send/route.ts`
- **Modified:** chat-complete route (capture channel preference), user account page

---

## M1.6b — Translation Sweep + Multilingual STT/TTS

### Sub-tasks
1. Fill `messages/{es,fr,pt,de,zh}.json` — translate via Claude with translation prompt; spot-check with native speakers
2. Translate the **prompt corpus** — 6's system prompt, fallback responses, error messages — same flow
3. STT — confirm Whisper / Gemini multilingual auto-detect works in [transcription/capture](../apps/demo/app/api/transcription/capture/route.ts); no per-locale config likely needed
4. TTS — ElevenLabs voice strategy (see **Q1.6b1**): either one multilingual voice or per-locale clones of SG Dietz
5. **Avatar-locale bridge** — read `users.preferred_locale` (or URL locale for anonymous) inside [start-session](../apps/demo/app/api/start-session/route.ts) and [start-custom-session](../apps/demo/app/api/start-custom-session/route.ts); map to HeyGen language code; pass to `avatar_persona.language` instead of the hard-coded `LIVEAVATAR_LANGUAGE` env. **This is what actually delivers vision ¶26** ("6 speaks as many languages as ai speaks") — M1.6a only localized the UI shell, not the avatar's voice.
6. Report generator produces output in user's locale (already plumbed; verify)
7. End-to-end smoke test per locale

### Files touched
- **New:** filled `messages/*.json`, possibly `apps/demo/src/lib/i18n/promptTranslations.ts`, `apps/demo/src/lib/i18n/avatarLanguage.ts` (locale → HeyGen mapping)
- **Modified:** [elevenlabs-text-to-speech](../apps/demo/app/api/elevenlabs-text-to-speech/route.ts) (voice routing), [start-session](../apps/demo/app/api/start-session/route.ts), [start-custom-session](../apps/demo/app/api/start-custom-session/route.ts), chat-complete prompts

### Known gap until M1.6b lands (today's state)
- UI: localized ✓
- Avatar speech: still hard-coded `LIVEAVATAR_LANGUAGE` ✗ — switching the UI to Spanish gives you a Spanish page with an English-speaking 6
- This is a partial delivery against vision ¶26. M1.6b closes it.

---

## M1.8b — LLM Call Logging

### Sub-tasks
1. Helper `withLlmCallLog(model, params, fn)` wraps any LLM call
2. Migration: `llm_calls` (`id`, `request_id`, `user_id`, `session_id`, `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `cost_estimate_usd`, `error`, `created_at`)
3. Apply to every LLM call site:
   - [openai-chat-complete](../apps/demo/app/api/openai-chat-complete/route.ts)
   - [grokai-chat-complete](../apps/demo/app/api/grokai-chat-complete) (if active)
   - [analyze-image](../apps/demo/app/api/analyze-image/route.ts)
   - [analyze-video](../apps/demo/app/api/analyze-video/route.ts)
   - Go-Live frame route (M1.3)
   - Memory fact extractor (M1.2)
   - Report composer (M1.5)

### Files touched
- **New:** `apps/demo/src/lib/llm/withLlmCallLog.ts`, migration
- **Modified:** every LLM-calling API route

---

## 🔧 Design Questions to Answer Before Coding

These are the choices that ripple if I guess wrong. Answer them in one batch and I'll start.

### M1.1 — Auth
- **Q1.1a — Sign-in methods to enable on day 1?**
  Options: magic-link email *(minimum)*, phone OTP, Google OAuth, Apple OAuth. Recommend: **magic-link email + Google OAuth** — covers 90% of users with the least friction. Phone OTP adds cost (Twilio per-OTP) and Apple OAuth adds App Store policy headaches. Add them later if needed.
- **Q1.1b — Anonymous scope.** Can a user fully use 6 (talk, get a PDF report) without signing up, or do we **gate report delivery on auth**?
  Recommend: **gate report delivery on auth.** It's the natural moment to ask for email anyway ("Where should I send your fix-it report?"), and we need an email to deliver to.
- **Q1.1c — Sign-up nudge timing.** When does 6 first ask for an email?
  Recommend: **only when the user is ready for a report or contractor help.** Never at session start — kills the magic.

### M1.6a — i18n framework
- **Q1.6a1 — Locale in URL or cookie?**
  Options: (a) URL-based `/es/...` (SEO-friendly, share-friendly), (b) cookie-only (URL unchanged).
  Recommend: **URL-based.** Better for SEO and sharing fix-it reports across languages.
- **Q1.6a2 — Default locale for new visitors?**
  Options: (a) always EN, (b) browser `Accept-Language`, (c) IP geolocation.
  Recommend: **browser Accept-Language with EN fallback.** Geolocation adds a vendor dependency (Vercel or MaxMind) for marginal benefit.

### M1.2 — Memory
- **Q1.2a — Vector store.** Supabase pgvector or external (Pinecone, Turbopuffer)?
  Recommend: **Supabase pgvector.** We're already on Supabase; no extra integration; plenty fast for M1's scale.
- **Q1.2b — Memory granularity.** Fact-extraction (LLM extracts named facts) vs. raw-turn embedding (embed every user/assistant turn).
  Recommend: **fact extraction.** Cleaner recall, smaller storage, easier to expose in "What 6 remembers" UI.
- **Q1.2c — Embedding model.** `text-embedding-3-small` (cheap, fast) or `-large`?
  Recommend: **`text-embedding-3-small`.** Fine for M1.

### M1.3 — Go Live
- **Q1.3a — Vision model.** Gemini 2.0 Flash, GPT-4o, or both (Flash for fast comments, 4o for tough images)?
  Recommend: **Gemini 2.0 Flash as default, escalate to GPT-4o on user demand** ("hey 6, take a closer look").
- **Q1.3b — Frame rate.** 1 fps, 0.5 fps, adaptive?
  Recommend: **adaptive — 1 fps baseline, throttle to 0.2 fps when scene hash is stable, burst to 2 fps on motion.**
- **Q1.3c — Dedup location.** Client perceptual-hash (less upload) vs. server-side (more reliable)?
  Recommend: **client first pass, server confirms.** Saves bandwidth, can't be bypassed by a buggy client.

### M1.7 — Notifications
- **Q1.7a — Templates.** Generate message body locally, or use Resend/Twilio template UI?
  Recommend: **local templates in code.** Versioned with the rest of the codebase. WhatsApp is the exception — Meta forces pre-approved templates, so those live in Meta + a local mirror.
- **Q1.7b — Consent posture.** If a user never gave SMS consent, fail-open (silently fall back to email) or fail-closed (error)?
  Recommend: **fail-open with explicit fallback log.** Users care about getting the report; we record the fallback for audit.

### M1.5 — Reports
- **Q1.5a — PDF engine.** `@react-pdf/renderer` (JS, fast, lower CSS fidelity) vs. Puppeteer/Playwright (perfect HTML/CSS, heavy on Vercel).
  Recommend: **`@react-pdf/renderer`.** Puppeteer + Vercel serverless is a known pain (chromium binary size). We can swap later if branding requires it.
- **Q1.5b — Branding.** Use the current gold theme (recent commits show theme work) for reports, or design something separate?
  Recommend: **reuse the gold theme** so reports feel like the product.
- **Q1.5c — Report versioning.** If the user keeps talking after the report is sent, auto-generate v2 or only on request?
  Recommend: **on request only.** Auto-regeneration spams users.

### M1.4 — Delivery
- **Q1.4a — Attachment vs link.** PDF as email attachment or signed-link?
  Recommend: **signed link.** Smaller emails, trackable opens, revocable.
- **Q1.4b — WhatsApp template wording.** Required exact body for Meta pre-approval. Draft proposal:
  > "Hi {{1}}, this is 6 from iSolveUrProblems with your fix-it report. View it here: {{2}}. Reply STOP to opt out."
  Confirm wording (or edit) so we can submit to Meta during M1.

### M1.6b — Translation & voice
- **Q1.6b1 — Voice strategy.** One ElevenLabs multilingual voice for 6, OR per-locale voice clones of SG Dietz?
  Recommend: **multilingual single voice for M1, per-locale clones in a later milestone.** Cloning 6 voices is a real recording project.
- **Q1.6b2 — Translation review.** Native-speaker review per locale before launch, or ship machine-translated and patch on user feedback?
  Recommend: **ship machine-translated for EN-adjacent (ES/PT/FR/DE) with a known-good prompt; native review required for ZH** before launch since errors there are more user-visible and harder to catch via spot-checks.

---

## ✅ Definition of Done for M1

Per the roadmap exit criteria: **A non-technical Spanish-speaking user can solve a real home problem with 6, get a PDF report by WhatsApp** *(or by email if WhatsApp paperwork is still pending)***, and come back next week and have 6 remember them.**

Concretely:
- [ ] Spanish user lands on app → UI in Spanish, 6 speaks Spanish
- [ ] User describes a problem and uses camera → 6 gives a real diagnosis with photos
- [ ] 6 asks how to deliver report → user picks email/SMS → report arrives in Spanish, branded, with photos
- [ ] User signs up (magic link) mid-flow → previous anonymous session links to their account
- [ ] User returns days later → 6 references prior facts ("how did that toilet repair turn out?")
- [ ] All LLM calls are logged with cost; all errors land in `error_logs`; admin can see the trail (M2.9)

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial M1 build order with sub-tasks, dependencies, and design questions | Bert / Claude |
