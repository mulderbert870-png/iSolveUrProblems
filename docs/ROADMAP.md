# iSolveUrProblems — Product Roadmap

> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`
> Owner: SG Dietz

This roadmap turns the vision doc into a concrete 5-milestone delivery plan. It is the canonical "what we are building, and in what order" document. Update it whenever scope or sequencing changes — do not let it drift.

---

## Vision in One Paragraph

iSolveUrProblems is an ai-powered solution center fronted by **6**, a digital-twin avatar of SG Dietz. Users speak to 6 in natural language, show problems via camera/photos/video, and get free expert solutions plus a written report. When a contractor is needed, 6 sources, ranks, calls, schedules, mediates, contracts, and verifies the work end-to-end. Contractors pay subscriptions because 6 removes their pain. Every solved problem becomes structured "how to fix and build things in the real world" data — sold at premium to AI and robotics buyers. Walmart-margin pricing fuels global scale.

---

## What Already Exists (Foundation)

The `apps/demo` Next.js app delivers the very first layer of the vision:

- **Avatar "6"** — LiveAvatar (HeyGen) session via [LiveAvatarDemo.tsx](../apps/demo/src/components/LiveAvatarDemo.tsx) + [LiveAvatarSession.tsx](../apps/demo/src/components/LiveAvatarSession.tsx)
- **Conversation brains** — OpenAI + Grok chat routes ([openai-chat-complete](../apps/demo/app/api/openai-chat-complete/route.ts), [grokai-chat-complete](../apps/demo/app/api/grokai-chat-complete))
- **Voice** — ElevenLabs TTS + transcription capture ([elevenlabs-text-to-speech](../apps/demo/app/api/elevenlabs-text-to-speech/route.ts), [transcription/capture](../apps/demo/app/api/transcription/capture/route.ts))
- **Camera / media** — image & video analysis routes ([analyze-image](../apps/demo/app/api/analyze-image/route.ts), [analyze-video](../apps/demo/app/api/analyze-video/route.ts)), `media_events` table ([migration](../apps/demo/supabase/migrations/20260424_media_events.sql))
- **Lead capture** — basic contact extraction from spoken/typed text ([contactExtraction.ts](../apps/demo/src/lib/contactExtraction.ts), [leadCaptureFromUserText.ts](../apps/demo/src/lib/leadCaptureFromUserText.ts), [leadAlert.ts](../apps/demo/src/lib/leadAlert.ts))
- **Legal pages** — disclaimer / privacy / terms

Roughly paragraphs 3–7 of the vision doc are partially live. Everything from paragraph 8 onward is unbuilt.

---

## 5-Milestone Plan

### Planning Assumptions

- **Build mode:** Solo developer (Bert Mulders) + **Claude Opus 4.7 (1M-context)** doing the heavy code lift. Designer / product help engaged ad-hoc.
- **Reused foundation:** Existing LiveAvatar Next.js app stays as the base; we evolve `apps/demo` in place.
- **Vendor stack:** Supabase, Stripe, Twilio, LiveKit, Resend, OpenAI, Gemini, HeyGen, ElevenLabs.

---

## 🎯 Milestone 1 — "6 Solves Problems for Free, Polished End-to-End"

**Goal:** Ship the free-solutions layer as a real product, not a demo. A user can talk to 6 in any language, show their problem, and get a complete, deliverable fix-it report. They come back next week and 6 remembers them.

| # | Feature | Notes |
|---|---|---|
| M1.1 | User accounts & auth (Supabase Auth) | Anonymous → logged-in upgrade path |
| M1.2 | Per-user persistent memory (pgvector / Supabase Vector) | 6 actually "remembers" you |
| M1.3 | Real-time "Go Live" camera streaming → Gemini/GPT-4o vision | `go_live_frame` already scaffolded in `media_events` |
| M1.4 | Multi-channel fix-it report delivery (Email + SMS + WhatsApp) | Resend + Twilio + WhatsApp Business |
| M1.5 | PDF/HTML structured report generator | Photos + step-by-step + materials list |
| M1.6 | Multi-language support (UI + STT + TTS + LLM) | Initial set: EN, ES, FR, PT, DE, ZH |
| M1.7 | Notifications fabric (single service abstraction) | Reused by every later milestone |
| M1.8 | Observability baseline (Supabase-native `error_logs` + `llm_calls`) | Required before scaling — kept in-Supabase, no external vendor |

**Exit criteria:** A non-technical Spanish-speaking user can solve a real home problem with 6, get a PDF report by WhatsApp, and come back next week and have 6 remember them.

---

## 💰 Milestone 2 — "Contractor Marketplace v1 (Revenue On)"

**Goal:** The first money flows in. User says "I need help" → 6 returns curated, ranked, vetted contractors → first paid lead/contract.

| # | Feature | Notes |
|---|---|---|
| M2.1 | Contractor scraping engine (Google Maps, Yelp, BBB, Angi, Thumbtack) | Background workers + dedupe + refresh |
| M2.2 | Contractors data model + service-area / category taxonomy | Foundation table for everything after |
| M2.3 | Preference-tuned search (price, locality, same-day, ≥4.5⭐, licensed) | Conversational filter through 6 |
| M2.4 | LLM review summarizer + strengths/weaknesses synthesizer | Per-contractor cached digest |
| M2.5 | 6's contractor recommendation engine (ranking) | Blends preferences + sentiment + price + history |
| M2.6 | Contractor self-onboarding portal + profile dashboard | Separate auth scope |
| M2.7 | Stripe Connect — payments, platform cut, payouts | Walmart-margin pricing model |
| M2.8 | Win / lose contractor notifications + feedback loop | Friendly tone, coaching tips |
| M2.9 | Admin/ops console v1 | View conversations, override, refund |

**Exit criteria:** First 10 real homeowners hire a contractor through the system; first revenue cut paid out via Stripe.

---

## 📞 Milestone 3 — "3-Way Communication + Contracts"

**Goal:** 6 actively joins phone & video calls, schedules meetings, drafts estimates and contracts. The product becomes irreplaceable.

| # | Feature | Notes |
|---|---|---|
| M3.1 | 3-way phone (Twilio Voice conference + STT + LLM + TTS bridging) | 6 as a real call participant |
| M3.2 | 3-way video (LiveKit/Daily with avatar in the room) | Reuses HeyGen pipeline |
| M3.3 | Full call recording + searchable transcript index | Per-job evidence record |
| M3.4 | Appointment & reminder agent + calendar integration | Google/Outlook/Apple |
| M3.5 | Auto-reschedule flow (both parties notified, time renegotiated) | Outbound proactive messaging |
| M3.6 | Voice-driven estimate generator (contractor talks → line-item estimate) | Hands-free for driving contractors |
| M3.7 | Contract drafter + e-signature (DocuSign or built-in) | Delivered to user's inbox |
| M3.8 | Decision-support chat ("which contractor should I pick?") | Long-form reasoning UI |
| M3.9 | Dispute mediator agent (v1) | Logged, escalatable to human |

**Exit criteria:** A homeowner can complete a project — first call → site visit → estimate → signed contract → scheduled start — with 6 on every call, no human staff involved.

---

## 🛠️ Milestone 4 — "Contractor SaaS + Job Execution Autopilot"

**Goal:** Contractors pay monthly subscriptions because 6 changes their life. Recurring homeowner jobs run unattended.

| # | Feature | Notes |
|---|---|---|
| M4.1 | Tiered contractor subscriptions (Free / Pro / Elite) | Stripe Billing; gated features per tier |
| M4.2 | Crew & laborer marketplace inside contractor's 6 chat | On-demand sub/labor sourcing |
| M4.3 | Tool & material checklist agent (per-job, pre-departure) | Reduces forgotten-tool job failures |
| M4.4 | Backup/replacement dispatcher (no-show recovery) | Auto-finds and dispatches alternate |
| M4.5 | Mobile shell (PWA → React Native / Expo) | Required for worker/contractor in-field use |
| M4.6 | Daily photo/video job logging (tagged to job + task) | Storage tier + retention policy |
| M4.7 | Worker-in-the-loop computer vision (weed/flower, visual diff between visits) | Active-learning data loop |
| M4.8 | Recurring / autopilot job scheduler (mowing, plowing, gutters, HVAC) | Per-cadence dispatch + verification |
| M4.9 | Positive-coaching nudges for workers & contractors | Behavioral retention layer |
| M4.10 | In-person "go-between" mode (audio bridge during on-site meetings) | Safety / efficiency commentary |

**Exit criteria:** A meaningful cohort of contractors are paying subscriptions; some homeowners have ≥3 services running on autopilot.

---

## 🏠 Milestone 5 — "Home History + Quality Guarantee + Data Moat"

**Goal:** Lock in homeowner-for-life stickiness, the industry-first quality guarantee, and the "real magic" — the data flywheel that becomes a premium product for AI/robotics buyers.

| # | Feature | Notes |
|---|---|---|
| M5.1 | Quality-of-Work Guarantee engine (AI audits visual evidence vs. scope) | Signed completion report |
| M5.2 | Per-property timeline (every job, photo, video, contract, warranty) | Single source of truth per address |
| M5.3 | Component inventory (heater, roof, septic, etc., structured) | Sellable-home data set |
| M5.4 | Sell-the-home export (one-click PDF + shareable portal link) | Realtor / buyer hook |
| M5.5 | Ownership transfer flow (history follows the house) | Viral loop on every sale |
| M5.6 | Structured fix-it / build-it data pipeline (problem→action→outcome→visual) | Powers M5.7 |
| M5.7 | Data buyer portal (gated, premium) — OpenAI / xAI / Anthropic / Nvidia / Google / Meta / Apple / Tesla Optimus | The moonshot revenue |
| M5.8 | Consent & licensing layer (user + contractor opt-in, per-country compliance) | Required gate for M5.7 |
| M5.9 | Dispute mediator v2 + admin ops console v2 | Operational maturity |

**Exit criteria:** A homeowner has a verified history portfolio for their house; first paid data licensing deal signed with an AI/robotics buyer.

---

## ⚠️ Risk-Adjusted Notes

1. **M2's scraping pipeline is the single biggest schedule risk** — Google Maps / Yelp ToS, IP rotation, captcha. Budget extra time or buy data via SerpAPI / Outscraper to de-risk.
2. **M3's 3-way calling is technically the hardest item** — real-time STT → LLM → TTS with sub-second barge-in latency is non-trivial. Build a thin spike at the end of M2 to prove feasibility before committing to M3 scope.
3. **M4 mobile shell** could slide to M5 if a high-quality PWA carries the worker use case. Keep an option to defer.
4. **M5.7 data buyer portal** depends on having data volume — won't be sellable until M3–M4 produce meaningful job records. Start sales conversations during M3.
5. **Parallelization wins:** scraping (M2.1) and contractor onboarding (M2.6) can run in parallel tracks. Same for M3.1/M3.2 (calling) vs M3.6/M3.7 (contracts). Engage legal counsel for M5.8 during M4.
6. **External approvals to kick off ASAP** (start during M1 so they don't block later milestones):
   - WhatsApp Business sender registration (Twilio) — needed by M1.4
   - Stripe Connect platform account — needed by M2.7
   - Google Calendar OAuth verification application — needed by M3.4
   - DocuSign or e-sign provider sandbox — needed by M3.7

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial 5-milestone plan derived from vision doc | SG Dietz / Claude |
| 2 | Removed all timeline / duration / calendar content — roadmap is now scope-only | Bert / Claude |
