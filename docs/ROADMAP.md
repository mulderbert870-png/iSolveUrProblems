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

**Goal:** Ship the free-solutions layer as a real product, not a demo. A user can talk to 6 in any language, show their problem, and get a complete, deliverable fix-it report.

| # | Feature | Notes |
|---|---|---|
| M1.1 | User accounts & auth (Supabase Auth — magic-link + Google OAuth) | Shipped — anonymous → signed-in upgrade path; ownership for M1.4 + M1.5 |
| M1.2 | Per-user persistent memory (pgvector) | Shipped — 6 recalls durable facts across sessions; GDPR view/forget panel |
| M1.3 | Real-time "Go Live" camera streaming → Gemini/GPT-4o vision | Vision ¶6 — "turn the camera on for a real-time look" |
| M1.4 | Multi-channel fix-it report delivery (Email + SMS + WhatsApp) | Vision ¶7 — "by email, text, or messaging app" |
| M1.5 | PDF/HTML structured report generator | Vision ¶7 — "a written report explaining all the fixes" |
| M1.6 | Multi-language support (UI + STT + TTS + LLM) | Vision ¶26 — "6 speaks as many languages as ai speaks". Initial set: EN, ES, FR, PT, DE, ZH |
| M1.7 | Notifications fabric (Email + SMS + WhatsApp channel abstraction) | Shipped — backbone for M1.4; Resend + Twilio + webhook audit |
| M1.8 | Observability baseline (Supabase-native `error_logs`) | Shipped — crash visibility for client/server/edge; no external vendor |

---

## 💰 Milestone 2 — "Contractor Marketplace v1 (Revenue On)"

**Goal:** The first money flows in. User says "I need help" → 6 returns curated, ranked, vetted contractors → first paid lead/contract.

| # | Feature | Notes |
|---|---|---|
| M2.1 | Contractor scraping engine | Vision ¶9 — "the iSolve backend agents begin scraping the internet" |
| M2.2 | Preference-tuned search (price, locality, same-day, ≥4.5⭐) | Vision ¶10 — "Price? Same day service? Locally owned business? 4.5 rated or higher?" |
| M2.3 | Review summarizer + strengths/weaknesses synthesizer | Vision ¶11 — "summarize their reviews, strengths and weaknesses" |
| M2.4 | 6's contractor recommendation engine | Vision ¶11 — "make recommendations on which contractors he prefers" |
| M2.5 | Payments + platform cut + payouts | Vision ¶21 — "iSolve makes a cut of every contract" |
| M2.6 | Win / lose contractor notifications + feedback loop | Vision ¶19 — "6 can deliver the news to the contractors that win the projects, and those that do not... give them feedback" |

---

## 📞 Milestone 3 — "Voice-First 6 + 3-Way Calls + Contracts"

**Goal:** 6 actively joins phone calls, schedules meetings, drafts estimates and contracts. The whole site becomes voice + avatar first — homeowner talks to 6, 6 does the work, results pop up on screen. The product becomes irreplaceable.

**Voice-first pivot (SG Dietz, 2026-06-04):** the entire UX moves to voice + avatar first. M2's form-driven `/contractors` page becomes a dev-only debug surface; the live experience is 6 driving everything by voice. **M3.2 video is deferred** — phone is the only call surface for M3; video can be added later if user demand warrants. **M3.1 is treated as a spike-first item** — prove feasibility quickly, then ship the rest of M3 in parallel so a stuck calling track doesn't block the milestone.

| # | Feature | Notes |
|---|---|---|
| M3.0 | Voice-first foundation (overlay UI + transcript wiring + intent classifier + context-injection orchestrator) | *Enabling infrastructure — implied by vision ¶8 + ¶26 voice-first model. Ships before any M3.x. Stays in FULL avatar mode; voice-driven tool calls work via the context-injection pattern proven in the existing image-analysis flow.* |
| M3.1 | 3-way phone calls (user + contractor + 6) | Vision ¶12 — "real-time three-way conversations between users and contractors — he can literally be on the phone or videophone". **Built spike-first.** |
| ~~M3.2~~ | ~~3-way video calls~~ | **Deferred per SG Dietz 2026-06-04.** Phone is the priority; video can be added later if it matters. Vision ¶12 anchor preserved for the future. |
| M3.3 | Full call recording + searchable transcript index | Vision ¶12 — "it will all be on record". Ships only if M3.1 spike succeeds. |
| M3.4 | Appointment & reminder agent | Vision ¶14 — "before meetings or when work is to occur, 6 will message both parties to make sure they'll be on time and ready" |
| M3.5 | Auto-reschedule flow | Vision ¶14 — "If not, he'll coordinate rescheduling" |
| M3.6 | Voice-driven estimate generator (contractor talks → line-item estimate) | Vision ¶17 — "help estimate projects... simply by talking to the contractor, which can be done as the contractor drives down the road" |
| M3.7 | Contract drafter + e-signature delivery | Vision ¶17 — "write up contracts... deliver the contract in writing in their email box" |
| M3.8 | Decision-support chat ("which contractor should I pick?") | Vision ¶18 — "help the user work through uncertainties and come to decisions" |
| M3.9 | Dispute mediator agent | Vision ¶16 — "6 will be the front line for disputes, to help work out problems in the moment" |

**M3 first deliverable for SG Dietz to test-drive personally:** voice-driven contractor search → recommend → pick → simulated payment, end-to-end on mock data. Ships immediately after M3.0 lands, before the heavier M3.1 / M3.6 / M3.7 work.

---

## 🛠️ Milestone 4 — "Contractor SaaS + Job Execution Autopilot"

**Goal:** Contractors pay monthly subscriptions because 6 changes their life. Recurring homeowner jobs run unattended.

| # | Feature | Notes |
|---|---|---|
| M4.1 | Tiered contractor subscriptions | Vision ¶24-25 — "they will pay a subscription... higher subscription fees for higher tiers of service" |
| M4.2 | Crew & laborer marketplace inside contractor's 6 chat | Vision ¶24 — "can find them new laborers and subcontractors when they need help" |
| M4.3 | Tool & material checklist agent (per-job, pre-departure) | Vision ¶24 — "rarely forget a tool or the right materials" |
| M4.4 | Backup/replacement dispatcher (no-show recovery) | Vision ¶33 — "If contractors don't show, 6 will get contractors that do" |
| M4.5 | Daily photo/video job logging | Vision ¶31 — "every task in a job will be documented multiple times per day" |
| M4.6 | Worker-in-the-loop computer vision (weed/flower, visual diff between visits) | Vision ¶27 — "6 identifies which plants are weeds and which are flowers... over time, the Ai will learn and improve its accuracy" |
| M4.7 | Recurring / autopilot job scheduler | Vision ¶33 — "autopilot, such as their grass mowed, weeds pulled, gutters cleaned, A.C. fixed, driveway snow plowed — anything and everything" |
| M4.8 | Positive-coaching nudges for workers & contractors | Vision ¶28 — "6 will always be positive and encouraging, helping people be better business owners and employees" |
| M4.9 | In-person "go-between" mode | Vision ¶15 — "6 will also manage the in-person meetings as the go-between, live on one or both phones" |

---

## 🏠 Milestone 5 — "Home History + Quality Guarantee + Data Moat"

**Goal:** Lock in homeowner-for-life stickiness, the industry-first quality guarantee, and the "real magic" — the data flywheel that becomes a premium product for AI/robotics buyers.

| # | Feature | Notes |
|---|---|---|
| M5.1 | Quality-of-Work Guarantee engine | Vision ¶30-31 — "Quality of Work Guarantee... users can feel good knowing the job was performed to specifications. No other contracting service on earth can give homeowners this guarantee." |
| M5.2 | Per-property timeline (every job, photo, video, contract, warranty) | Vision ¶35 — "all in one database, all done automatically, with pics and videos to prove it" |
| M5.3 | Component inventory (heater, roof, septic, etc., structured) | Vision ¶35 — "when the heater was replaced, the roof, the quality of the shingles, the septic system" |
| M5.4 | Sell-the-home export | Vision ¶35 — "all work can be a part of the history of their house, and will be there when they go to sell" |
| M5.5 | Structured fix-it / build-it data pipeline | Vision ¶38 — "a continuous supply of new data, ESPECIALLY of how to fix and build things in the real world" |
| M5.6 | Data buyer portal — OpenAI / xAI / Anthropic / Nvidia / Google / Meta / Apple | Vision ¶39-41 — "every ai builder will greatly desire this new data... We choose who may purchase our data, and the price will be at a premium." |

---

## ⚠️ Risk-Adjusted Notes

1. **M2's scraping pipeline is the single biggest schedule risk** — Google Maps / Yelp ToS, IP rotation, captcha. Budget extra time or buy data via SerpAPI / Outscraper to de-risk.
2. **M3's 3-way calling is technically the hardest item** — real-time STT → LLM → TTS with sub-second barge-in latency is non-trivial. **Per SG Dietz 2026-06-04: time-box a small spike early in M3, then build everything else (M3.4–M3.9) in parallel so a stuck calling track doesn't block the milestone.** Video (M3.2) is deferred indefinitely; phone only.
3. **M5.6 data buyer portal** depends on having data volume — won't be sellable until M3–M4 produce meaningful job records. Start sales conversations during M3.
4. **Parallelization wins:** scraping (M2.1) and review summarization (M2.3) can run in parallel tracks. For M3 the explicit rule is: spike M3.1 first to get a yes/no, then run M3.4/M3.5/M3.6/M3.7/M3.8/M3.9 in parallel regardless of M3.1's outcome.
5. **External approvals to kick off ASAP** (start early so they don't block later milestones):
   - WhatsApp Business sender registration (Twilio) — needed for M1.4
   - Payments platform account (e.g. Stripe Connect) — needed by M2.5
   - Google Calendar OAuth verification application — needed by M3.4
   - E-sign provider sandbox (e.g. DocuSign) — needed by M3.7

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial 5-milestone plan derived from vision doc | SG Dietz / Claude |
| 2 | Removed all timeline / duration / calendar content — roadmap is now scope-only | Bert / Claude |
| 3 | M3 pivoted to voice + avatar first; M3.2 video deferred; M3.1 calling becomes spike-first; explicit "voice test drive" deliverable for SG Dietz before heavy build | SG Dietz / Bert / Claude (2026-06-04) |
| 4 | M3 architecture refined: stay in FULL avatar mode; phone-call pipeline absorbs M3.6 (voice estimates) + M3.9 (dispute); M3.8 (decision support) ships as drawer text v1; CUSTOM-mode fix deferred to optional Phase 4 behind explicit SG Dietz greenlight | Bert / Claude (2026-06-05) |
| 5 | Bert spotted context-injection pattern already in production in image-analysis flow ([LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978)): backend computes a result, wraps it as a "context message" prompt, and sends via `session.message()` so HeyGen's FULL-mode brain narrates the actual data. M3.0e refactored from "detect-and-populate-drawer-only" to "detect-and-inject-into-brain"; M3.8 voice-on-avatar surface promoted from "Phase 4 only" to "v1 viable"; CUSTOM-mode spike further demoted to truly-optional | Bert / Claude (2026-06-05) |
| 6 | CUSTOM-mode fix spike **removed from M3 scope entirely.** On honest review, every M3 conversational feature is satisfied by either (a) the context-injection pattern on the avatar UI, or (b) the phone-call pipeline (M3.6, M3.9). No concrete M3 deliverable depends on CUSTOM mode. The 1–2 week spike is moved to a Future Considerations note — revisited only if a future-milestone feature genuinely requires it | Bert / Claude (2026-06-05) |
