# Milestone 3 — Build Order

> Companion to [ROADMAP.md](ROADMAP.md). Scope-only. No timelines.
> Goal of M3: **6 stops being a button and starts being a participant.** The whole site becomes voice + avatar first. 6 joins phone calls between homeowners and contractors, records and transcribes them, runs the calendar, drafts estimates from a contractor's voice, sends contracts for e-signature, and mediates disputes. After M3, removing 6 from a job would feel like firing the project manager.
> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`
> Companion architectural note: [M2-DELIVERY.md](M2-DELIVERY.md) — explains how M2's engine remains the backend M3's voice surface drives.

> **SG Dietz directive (2026-06-04):**
> - **No M3.2 video.** Phone only. Video can come later if there's demand.
> - **M3.1 phone calling is spike-first.** Prove feasibility quickly with a small test, then build everything else in parallel so a stuck calling track doesn't block M3.
> - **First deliverable is SG Dietz's voice test drive** — 6 talking him through finding a contractor, start to finish, on mock data. Ships immediately after M3.0 lands, before heavier work.

This doc has two audiences:
- **The dev team** — uses the per-feature sub-task lists, dependency graph, and the M3.0 architecture-pivot section to plan the build.
- **SG Dietz** — uses the "Decisions Required" and "What SG Dietz Must Provide" sections to unblock the build.

Every M3.1–M3.9 entry is grounded in a paragraph of the source vision doc. **M3.0 is foundation work** — it isn't in the vision doc directly, but every M3 feature depends on it.

---

## The M3 Pivot — Voice & Avatar First

**SG Dietz direction (2026-06-04):** *"The whole site is going to be voice + avatar first. People talk to 6, and that's it — 6 does the searches, 6 makes the picks, and the results pop up on screen. No hunting through forms and buttons."*

What stays: every M2 backend route (search, summarizer, recommender, pick, hire, fan-out). They're already designed as APIs the brain can call.

What changes: the **face** on top. The `/contractors` form page (dropdowns, sliders, lat/lng boxes) drops out of the user-facing flow. Cards, picks, and contracts surface as overlays the avatar drives.

**Why this matters for M3 architecture:** every feature in M3 is conversational. 3-way calls, voice-driven estimate creation, decision-support chat, dispute mediation — none of them work as form-driven pages. The M3.0 foundation makes the brain-and-overlay model real before M3.1 ships.

---

## What M3 Delivers

The 9 vision-anchored features below + a foundation pre-step. Each vision-anchored entry has a paragraph reference; M3.0 is enabling infrastructure (no vision anchor — it makes the rest possible).

| # | Feature | Vision anchor |
|---|---|---|
| M3.0 | Voice-first foundation (brain pivot + overlay UI + transcript wiring) | *Enabling infrastructure — no vision anchor; ¶8 + ¶26 imply the voice-first model* |
| **M3.0d** | **🎯 SG Dietz voice test drive on mock data** | *First deliverable he sees — proves M3.0 works end-to-end through M2's engine* |
| M3.1 | 3-way phone calls (homeowner + contractor + 6) | ¶12 — *"real-time three-way conversations between users and contractors — he can literally be on the phone or videophone"*. **Spike-first.** |
| ~~M3.2~~ | ~~3-way video calls~~ | **Deferred per SG Dietz 2026-06-04.** Anchor preserved: ¶12 — *"videophone… 3-way conversation"*. May ship in a later milestone if user demand warrants. |
| M3.3 | Full call recording + searchable transcript index | ¶12 — *"it will all be on record"*. Ships only if the M3.1 spike succeeds. |
| M3.4 | Appointment & reminder agent | ¶14 — *"before meetings or when work is to occur, 6 will message both parties to make sure they'll be on time and ready"* |
| M3.5 | Auto-reschedule flow | ¶14 — *"If not, he'll coordinate rescheduling"* |
| M3.6 | Voice-driven estimate generator (contractor talks → line-item estimate) | ¶17 — *"help estimate projects… simply by talking to the contractor, which can be done as the contractor drives down the road"* |
| M3.7 | Contract drafter + e-signature delivery | ¶17 — *"write up contracts… deliver the contract in writing in their email box"* |
| M3.8 | Decision-support chat ("which contractor should I pick?") | ¶18 — *"help the user work through uncertainties and come to decisions"* |
| M3.9 | Dispute mediator agent | ¶16 — *"6 will be the front line for disputes, to help work out problems in the moment"* |

**M3 Exit criteria:** A homeowner can ask 6 *"call the plumber"* → a 3-way phone call connects with 6 as an active third participant → the call is recorded + transcribed → during the call the contractor verbally walks through an estimate that 6 turns into a line-item PDF → 6 emails the homeowner a generated contract → both parties e-sign → a calendar reminder fires the day before the scheduled work — all voice-driven, no forms touched.

**Acceptable partial-M3 outcome:** if the M3.1 spike reveals 3-way live-call quality isn't viable, M3 still ships the parallel-track features (M3.0, M3.4, M3.5, M3.6, M3.7, M3.8, M3.9) and the calling piece carries to a later milestone. M2's payment + win/lose engine continues to drive the contractor flow voice-first regardless.

---

## Build Order at a Glance

Three sequential phases; tracks within Phase 3 run in parallel.

### Phase 1 — Day-1 vendor kickoffs (no code yet)

| Step | Item | Why this position |
|---|---|---|
| **0a** | Google Calendar OAuth verification submission | Longest lead time in M3 (1–4 weeks Google verification). Submit before any code starts. |
| **0b** | E-sign provider sandbox (Dropbox Sign or chosen alt) | Sandbox immediate; production access 3–5 business days. |
| **0c** | Twilio Voice enablement + phone number purchase | Reuses existing Twilio account from M1.7. Needed for M3.1 spike. |
| **0d** | Deepgram (or chosen STT) account + API key | Needed for M3.1 spike streaming STT. |

### Phase 2 — Voice-first foundation (the SG Dietz test drive)

| Step | Feature | Why this position |
|---|---|---|
| **1**  | M3.0a — Brain switchover FULL → CUSTOM mode | Prerequisite for every voice-driven tool call below. Already partially scaffolded — see M3.0 details. |
| **2**  | M3.0b — Voice-first overlay UI + chat-driven state store | The "results pop up on screen" surface that the chat brain mutates. |
| **3**  | M3.0c — Transcript event wiring (`USER_TRANSCRIPTION` / `AVATAR_TRANSCRIPTION`) | Persists conversation for later features (M3.3 / M3.8 / M3.9). |
| **🎯 4** | **M3.0d — SG Dietz voice test drive on mock data** | **First user-facing checkpoint.** SG Dietz can voice-drive M2 (search → recommend → pick → simulated payment) end-to-end on mock contractors. Ugly cards are fine; design layer comes later. |

### Phase 3 — Parallel build (after Phase 2 ships)

After the test drive lands, M3.1 runs as a time-boxed spike, while the rest of M3 builds on independent tracks. If M3.1 fails or proves out of scope, the other tracks ship anyway.

| Track | Feature | Why this position |
|---|---|---|
| **A.1** | **M3.1 spike** — minimal proof-of-concept 3-way call (2 humans + 6) | **Time-box: ~1 working day.** Goal: prove sub-2 s loop is reachable end-to-end. Decision gate at end. |
| **A.2** | M3.1 full implementation | Only if the spike clears. Otherwise carries to a later milestone. |
| **A.3** | M3.3 — Recording + transcript index | Depends on M3.1 audio stream being real. Only if A.2 ships. |
| **B.1** | M3.6 — Voice-driven estimate generator | Independent of calling; contractor talks → line items. Runs entirely on M3.0 transcripts + LLM. |
| **B.2** | M3.7 — Contract drafter + e-signature delivery | Builds on M3.6 estimates. Independent of A track. |
| **C.1** | M3.4 — Appointment & reminder agent | Needs Google Calendar OAuth verified (Phase-1 kickoff). |
| **C.2** | M3.5 — Auto-reschedule flow | Small layer on top of M3.4. |
| **D.1** | M3.8 — Decision-support chat | Independent. Extends M2.4 recommender as a conversational loop. |
| **D.2** | M3.9 — Dispute mediator agent | Needs M3.3 transcripts + M3.7 contracts as context corpus. Ships last; degrades gracefully if M3.3 deferred. |

---

## Dependency Graph

```
Phase 1: Vendor kickoffs (parallel, day 1)
   ├─ Google Calendar OAuth submission
   ├─ Dropbox Sign sandbox
   ├─ Twilio Voice + phone number
   └─ Deepgram API key

Phase 2: Voice foundation (sequential)
   M3.0a Brain pivot ──→ M3.0b Overlay UI ──→ M3.0c Transcript wiring ──→ 🎯 M3.0d SG Dietz test drive

Phase 3: Parallel tracks (after Phase 2)

   Track A (Calling — spike-first)
      M3.1 spike ──→ [decision gate] ──→ M3.1 full ──→ M3.3 Recording + transcript

   Track B (Contracts — independent)
      M3.6 Voice estimate ──→ M3.7 Contract drafter + e-sign delivery

   Track C (Calendar — needs Google OAuth verified)
      M3.4 Reminders ──→ M3.5 Reschedule

   Track D (Decision + dispute — independent)
      M3.8 Decision-support chat
      M3.9 Dispute mediator (uses M3.3 + M3.7 context if available)
```

---

## M3.0 — Voice-First Foundation (Pre-feature)

This is the SG Dietz pivot in code form. Three sub-tasks; all three block M3.1+.

### M3.0a — Brain switchover (FULL → CUSTOM mode)

**Why:** HeyGen FULL mode runs the conversational brain on HeyGen's servers using their hosted GPT-4o-mini. Their SDK (`@heygen/liveavatar-web-sdk` v0.0.9) has **no function-call event** — so M2's `search_contractors` / `recommend_contractors` chat tools sit unused in production. To make voice-driven tool calls work, we move the brain into our backend (CUSTOM/LITE mode) where tool calling already works (verified during M2.2).

### Sub-tasks
1. Flip [LiveAvatarDemo.tsx](../apps/demo/src/components/LiveAvatarDemo.tsx) `mode="FULL"` → `mode="CUSTOM"`
2. Confirm `/api/start-custom-session/route.ts` returns a working session token (already wired, currently unused)
3. Verify [useTextChat.ts](../apps/demo/src/liveavatar/useTextChat.ts) CUSTOM branch routes user speech through `/api/openai-chat-complete` → ElevenLabs TTS → `session.repeatAudio()`
4. Tune the system prompt in [openai-chat-complete/route.ts](../apps/demo/app/api/openai-chat-complete/route.ts) to carry 6's voice and persona (was being handled by HeyGen brain)
5. Profile end-to-end latency: speech → STT → tool-call → TTS → speech. Target <2 s for "easy" answers, <4 s for tool-calling ones
6. Side-by-side compare with FULL mode and flag any regressions

### Files touched
- **Modified:** `LiveAvatarDemo.tsx`, `openai-chat-complete/route.ts` (system prompt tuning), possibly `useTextChat.ts`

---

### M3.0b — Voice-first overlay UI + chat-driven state store

**Why:** SG Dietz: *"results pop up on screen."* The avatar is the centerpiece; cards, picks, contracts, etc., appear as overlays the brain drives. Today the `/contractors` page renders cards in its own local React state with no path for the brain to push.

### Sub-tasks
1. Decide overlay shape (Q3.0a) — side drawer vs floating card stack vs bottom sheet
2. Pick state-management approach (Q3.0b) — Zustand store vs React context
3. Add a global `AssistantSurface` component mounted at `[locale]/layout.tsx` — sits above the avatar route, persists across page navigation
4. Define the surface event model:
   - `showContractors(hits)` — populates a card list
   - `showRecommendations(picks)` — populates the gold "6's picks" panel
   - `showContract(contract)` — preview pane for an e-sign-ready contract
   - `showCallReminder(meeting)` — banner
   - `dismiss()` — close
5. Update `/api/openai-chat-complete` response to include UI directives the chat brain can emit (e.g. `{ surface: "contractors", payload: ... }`)
6. Wire client to consume the directive and call the store
7. Keep the existing `/contractors` page accessible behind `?dev=1` (or move to `/admin/contractors`) so dev work doesn't depend on voice every time

### Files touched
- **New:** `src/lib/assistantSurface/{store,types,events}.ts`, `src/components/AssistantSurface.tsx`
- **Modified:** `[locale]/layout.tsx`, `openai-chat-complete/route.ts` (emit surface directives), the contractors-related chat tool returns

---

### M3.0c — Transcript event wiring

**Why:** M3.3 needs both sides' transcripts. M3.8 needs the recent conversation context. M3.9 needs full-call transcripts. All three rely on capturing `USER_TRANSCRIPTION` + `AVATAR_TRANSCRIPTION` events the SDK already emits in CUSTOM mode.

### Sub-tasks
1. Subscribe to `AgentEventsEnum.USER_TRANSCRIPTION` + `AVATAR_TRANSCRIPTION` in [LiveAvatarSession.tsx](../apps/demo/src/components/LiveAvatarSession.tsx)
2. Buffer turn-aligned transcripts in `liveavatar/context.tsx`
3. Add a `transcripts` Supabase table (session_id, speaker, text, timestamp)
4. Persist every transcript event to Supabase via a `/api/transcripts/append` route
5. Expose a `getRecentTranscriptForSession(sessionId)` helper for M3.8 + M3.9

### Files touched
- **New:** migration `transcripts.sql`, `app/api/transcripts/append/route.ts`, `src/lib/transcripts/{store,types}.ts`
- **Modified:** `LiveAvatarSession.tsx`, `liveavatar/context.tsx`

---

## 🎯 M3.0d — SG Dietz Voice Test Drive (Checkpoint)

**Why:** SG Dietz: *"build toward me experiencing that early."* This is not a feature in the traditional sense — it's the proof that M3.0 actually unblocks the voice-first vision. After M3.0a/b/c land, SG Dietz personally voice-drives the M2 engine end-to-end on mock data. If this works, M3.1+ is worth building. If 6 is awkward or the cards land wrong, we tune before adding more surface area.

### What it looks like

1. SG Dietz opens the home page → avatar session starts in CUSTOM mode
2. He says *"6, find me a plumber near Austin"*
3. 6 calls the existing `search_contractors` chat tool (M2.2)
4. The right-side drawer (M3.0b) opens with ranked contractor cards
5. 6 narrates: *"I found 5 plumbers. The top one is Acme Plumbing — 4.8 stars, 2 km from you. Want me to tell you more?"*
6. SG Dietz says *"what are people saying about them?"*
7. 6 calls the M2.3 summarizer → strengths + watch-outs panel opens in the drawer; 6 reads the gist aloud
8. SG Dietz says *"which one should I go with?"*
9. 6 calls `recommend_contractors` (M2.4) → top-3 picks with reasons appear; 6 reads the #1 pick's reason aloud
10. SG Dietz says *"book that one"*
11. 6 confirms verbally and triggers the simulated **Pick this one** path (M2.6) — the win/lose notification fan-out fires through the M1.7 fabric

### Sub-tasks
1. Define and document the conversational flow above as the working "happy path" SG Dietz signs off against
2. Tune the chat brain's system prompt so each tool-call narration is natural ("I found 5 plumbers" not "I have invoked the search_contractors tool")
3. Confirm the M2 chat tools (`search_contractors`, `recommend_contractors`) fire reliably under CUSTOM mode
4. Add a stub `book_contractor({ contractor_id })` tool that wraps the M2.6 `/api/contractors/pick` simulation
5. Hide `/contractors` from the home-page navigation; keep accessible at `/contractors?dev=1` for our own testing
6. End-to-end dry run on mock data — record a screen capture for SG Dietz before he tries it
7. Iterate based on his feedback before any M3.1 spike work begins

### Files touched
- **New:** `src/lib/contractors/chatToolBook.ts` (small wrapper around `/api/contractors/pick`)
- **Modified:** `openai-chat-complete/route.ts` (system prompt for narration style + register `book_contractor` tool), navigation links

### Exit criteria
SG Dietz uses the home page by voice only, completes the search → recommend → book flow, and signs off on the experience as the foundation worth building M3.1+ on top of.

---

## M3.1 — 3-Way Phone Calls (Spike-First)

**Spike-first per SG Dietz:** the first step is a small, time-boxed proof that a 3-way call (you, a friend, our backend bot) can sustain a sub-2-second conversation loop. If the spike clears, build the full feature. If it doesn't, the rest of M3 still ships and calling carries forward.

### Phase A — Spike (~1 working day, time-boxed)

1. Confirm telephony provider (Q3.1a — recommended Twilio Voice)
2. Confirm real-time STT (Q3.1b — recommended Deepgram)
3. Twilio test conference room: 2 human legs (Bert's phone + a friend's) + 1 bot leg (our backend audio channel)
4. Bot leg pipeline: Twilio `<Stream>` raw audio → Deepgram streaming STT → existing OpenAI chat brain → ElevenLabs TTS → audio back into the conference
5. End-to-end latency measurement: human stops speaking → 6 starts speaking. Target <2 s for stock responses.
6. Quality measurements: barge-in (human can interrupt 6), echo cancellation, audio clipping, dropped words
7. **Decision gate:** spike clears (Bert + a friend judge the call sounds usable) → green-light Phase B. Spike fails → write up findings, defer M3.1 full, ship the rest of M3.

### Phase B — Full implementation (only if Phase A clears)

1. Migration: `calls` table (id, user_id, contractor_id, started_at, ended_at, status, recording_url, transcript_id)
2. Provider webhook endpoint registration
3. `POST /api/calls/start` — initiates a 3-way bridge between the homeowner phone, the contractor phone, and 6's audio channel
4. Conversation-state machine — when does 6 speak vs stay silent? (Q3.1c)
5. UI: incoming-call modal, in-call avatar overlay, call-end summary card
6. Voice tool extension: `start_three_way_call({ contractor_id })` chat tool

### Files touched
- **Spike-only:** `app/api/calls/spike/route.ts` (throwaway), `src/lib/calls/spike/*.ts` (throwaway), conference TwiML
- **Full:** migration; `src/lib/calls/{provider,bridge,turnstate}.ts`; `app/api/calls/{start,join,end,webhook}/route.ts`; `src/components/CallOverlay.tsx`
- **Modified (full only):** chat tool registry

---

### Sub-tasks
1. Confirm telephony provider (Q3.1a)
2. Migration: `calls` table (id, user_id, contractor_id, started_at, ended_at, status, recording_url, transcript_id)
3. Provider account + webhook endpoint registration
4. `POST /api/calls/start` — initiates a 3-way bridge between the homeowner phone, the contractor phone, and 6's audio channel
5. 6's audio channel: real-time bidirectional STT (Q3.1b) + LLM (CUSTOM brain) + TTS (ElevenLabs) loop running server-side
6. Conversation-state machine — when does 6 speak vs stay silent? (Q3.1c)
7. UI: incoming-call modal, in-call avatar overlay, call-end summary card
8. Voice tool extensions: `start_three_way_call({ contractor_id })` chat tool

### Files touched
- **New:** migration; `src/lib/calls/{provider,bridge,turnstate}.ts`; `app/api/calls/{start,join,end,webhook}/route.ts`; `src/components/CallOverlay.tsx`
- **Modified:** chat tool registry (`src/lib/contractors/chatTool.ts` or a new `src/lib/calls/chatTool.ts`)

---

## ~~M3.2~~ — 3-Way Video Calls (Deferred)

**Deferred per SG Dietz 2026-06-04.** Phone is the priority for M3. Video may ship in a later milestone if homeowner demand warrants it. The vision-doc anchor (¶12) remains valid; nothing about M3's other features depends on M3.2.

---

## M3.3 — Recording + Searchable Transcript Index

**Only if the M3.1 spike clears.** If M3.1 carries to a later milestone, M3.3 carries with it.

### Sub-tasks
1. Decide recording storage (Q3.3a) — Supabase Storage vs S3
2. Enable recording on every M3.1 call (provider feature)
3. Pipe finalized audio file to storage, save signed URL on `calls.recording_url`
4. Backend job: run Whisper (or chosen STT — Q3.1b) batch transcription over the full recording → structured transcript with speaker labels + timestamps
5. Index transcript text with pgvector embeddings (Q3.3b)
6. UI: per-call page with audio player + searchable transcript + jump-to-timestamp
7. Voice tool: `find_in_call({ query })` so 6 can answer *"what price did he quote?"*
8. Two-party-consent guard: require both legs to verbally accept the recording preamble before the recorder starts

### Files touched
- **New:** `src/lib/calls/recording.ts`, `src/lib/calls/transcribe.ts`, migration `call_transcripts`; `app/[locale]/calls/[id]/page.tsx`
- **Modified:** call routes

---

## M3.4 — Appointment & Reminder Agent

### Sub-tasks
1. Confirm Google Calendar OAuth verified (Day-1 kickoff)
2. Decide other calendar providers (Q3.4a) — Microsoft 365? Apple?
3. Per-user OAuth flow → store refresh token in `users.calendar_tokens`
4. Voice tool: `schedule_appointment({ contractor_id, datetime, duration, agenda })`
5. Background job: 24 h + 2 h before each appointment, send a reminder via the M1.7 notifications fabric (channel per Q3.4b)
6. Reminder ack capture — if recipient replies "confirmed" or "running late", 6 reacts
7. UI: upcoming-appointments banner in the avatar overlay

### Files touched
- **New:** `src/lib/calendar/{google,store,reminders}.ts`; migration `appointments` + `users.calendar_tokens`; cron route `app/api/cron/reminders/route.ts`
- **Modified:** chat tool registry; notification templates

---

## M3.5 — Auto-Reschedule Flow

### Sub-tasks
1. Voice tool: `reschedule_appointment({ appointment_id, new_window })`
2. Conversational sub-flow — 6 proposes 3 candidate times based on both sides' calendar free/busy
3. Confirmation via the M1.7 notifications fabric to both parties
4. Update calendar events on both sides

### Files touched
- **New:** `src/lib/calendar/reschedule.ts`
- **Modified:** appointments handlers

---

## M3.6 — Voice-Driven Estimate Generator

### Sub-tasks
1. Decide estimate template (Q3.6a) — fixed JSON-schema vs free-form
2. Decide whether contractor speaks unit prices or whether we have a unit-rate library (Q3.6b)
3. New `estimates` table (id, contract_id, line_items jsonb, total_cents, status, created_at)
4. Voice tool: `start_estimate({ contractor_id, homeowner_id, project_brief })`
5. Streaming LLM that listens to the contractor's voice (via M3.0c transcripts), proposes structured line items, asks clarifying questions
6. Render estimate as a PDF (reuse M1.5 PDF renderer)
7. Deliver estimate to homeowner via the M1.7 fabric
8. UI: estimate preview card in the assistant overlay

### Files touched
- **New:** `src/lib/estimates/{generate,pdf,store}.ts`; migration `estimates`; `app/[locale]/estimates/[id]/page.tsx`
- **Modified:** chat tool registry; PDF renderer

---

## M3.7 — Contract Drafter + E-Signature Delivery

### Sub-tasks
1. Pick e-sign provider (Q3.7a) — DocuSign / Adobe Sign / HelloSign / Dropbox Sign
2. Provider sandbox + production keys
3. Decide contract template (Q3.7b) — generic vs trade-specific
4. New `contracts` table extension — `contract_doc_id`, `signed_at_user`, `signed_at_contractor`
5. Voice tool: `draft_contract({ estimate_id })` — turns estimate into signable document
6. Provider integration: create envelope, send to both parties, capture status webhook
7. Webhook handler: `/api/webhooks/esign/{provider}` — updates contract status, fires win/lose fan-out (reuses M2.6 trigger path)
8. UI: contract preview + signing-status card in the overlay

### Files touched
- **New:** `src/lib/esign/{provider,store,webhookSig}.ts`; `app/api/contracts/draft/route.ts`; `app/api/webhooks/esign/[provider]/route.ts`
- **Modified:** `contracts` table; chat tool registry

---

## M3.8 — Decision-Support Chat

### Sub-tasks
1. New voice tool: `weigh_options({ option_ids, criteria? })` — wraps M2.4 recommender but with conversational follow-up loops
2. Brain prompt extension: when user expresses uncertainty ("I can't decide", "what do you think?"), 6 actively asks clarifying questions before re-ranking
3. Memory tie-in (M1.2) — surface previously stored preferences in the deliberation
4. Re-rank conversation: user says "not that one, too far" → 6 re-runs the recommender with the added constraint

### Files touched
- **New:** `src/lib/contractors/deliberate.ts`
- **Modified:** chat tool registry; recommender to accept ad-hoc constraint additions

---

## M3.9 — Dispute Mediator Agent

### Sub-tasks
1. Voice tool: `start_dispute({ contract_id, party, complaint })`
2. Mediator brain prompt — reads M3.3 transcripts + M3.7 contract + M2.6 notification history as context
3. Multi-turn structured intake: claim, evidence pointers, sought outcome
4. Resolution paths: propose remedy, broker reduced refund, escalate to human
5. Escalation criteria (Q3.9a) — define when 6 hands off to a human reviewer
6. UI: dispute thread page

### Files touched
- **New:** `src/lib/disputes/{intake,resolve,store}.ts`; migration `disputes`; `app/[locale]/disputes/[id]/page.tsx`
- **Modified:** chat tool registry

---

## 🔧 Design Questions to Answer Before Coding

### M3.0 — Foundation

- **Q3.0a — Overlay shape:**
  - Options: (a) **right-side drawer**, (b) **floating card stack over the video**, (c) **bottom sheet**
  - **Recommendation:** **(a) right-side drawer** — easiest on mobile + desktop, doesn't crowd the avatar's face, can be collapsed.
- **Q3.0b — State management:**
  - Options: Zustand, React context, Jotai, Redux
  - **Recommendation:** **Zustand** — tiny, hook-friendly, plays well with Next.js App Router, no provider wrappers needed.

### M3.1 — Phone calls

- **Q3.1a — Telephony provider:**
  - Options: **Twilio Programmable Voice** (already have an account for SMS), **Vonage**, **Telnyx**, **LiveKit Telephony**, **SignalWire**
  - **Recommendation:** **Twilio Voice** — reuses the existing Twilio account, well-documented 3-way conference rooms, mature `<Stream>` for piping audio to our STT.
- **Q3.1b — Real-time STT for the conversation:**
  - Options: **Whisper streaming**, **Deepgram Nova-3**, **AssemblyAI Universal**, **Google Speech-to-Text streaming**
  - **Recommendation:** **Deepgram** for v1 — lowest latency (~300 ms), per-speaker diarization, generous free tier.
- **Q3.1c — When 6 speaks during a 3-way call:**
  - Options: (a) **only when addressed by name** ("hey 6, …"), (b) **proactive — interrupts when it has something useful**, (c) **toggled — push-to-talk for 6**.
  - **Recommendation:** **(a) only when addressed by name** for v1. Proactive interruption needs careful tuning; ship the conservative one first.

### ~~M3.2 — Video calls~~

Deferred. Q3.2a removed from this build order; revisit when video is greenlit.

### M3.3 — Recording + transcript

- **Q3.3a — Recording storage:**
  - Options: Supabase Storage, AWS S3
  - **Recommendation:** **Supabase Storage** — same stack as M1.5 reports, signed URLs for free.
- **Q3.3b — Transcript search:**
  - Options: pgvector embeddings vs Postgres full-text vs Algolia
  - **Recommendation:** **pgvector** — same infrastructure as M1.2 memory; embeddings already pulled in.

### M3.4 — Reminders

- **Q3.4a — Calendar providers:**
  - Options: Google only / Google + Microsoft / All three (Google, Microsoft, Apple)
  - **Recommendation:** **Google only for v1.** Add Microsoft in v1.1 if homeowner usage warrants it.
- **Q3.4b — Default reminder channel:**
  - Reuse M1.7 fabric — user's preferred channel from M1.4.
  - **Recommendation:** **Inherit user.preferred_channel**, fall back to email.

### M3.6 — Estimates

- **Q3.6a — Estimate format:**
  - Options: (a) Fixed JSON schema (line items, qty, unit, unit_price, total), (b) Free-form LLM-rendered Markdown
  - **Recommendation:** **(a) Fixed JSON schema** — needed for M3.7 contract drafting and M5 historical data, even if rendered as a freeform PDF for the user.
- **Q3.6b — Unit-price source:**
  - Options: contractor speaks every unit price, OR we maintain a per-trade unit-rate library
  - **Recommendation:** **Contractor speaks prices for v1** — building a unit-rate library is its own product. Add as v1.1.

### M3.7 — E-sign

- **Q3.7a — E-sign provider:**
  - Options: **DocuSign**, **Adobe Sign**, **HelloSign / Dropbox Sign**, **Documenso** (open source)
  - **Recommendation:** **Dropbox Sign (formerly HelloSign)** — simplest API, generous test mode, lower per-envelope cost. Switch to DocuSign later if enterprise legitimacy needed.
- **Q3.7b — Contract template:**
  - Options: single generic home-services contract vs per-trade variants
  - **Recommendation:** **Single generic template for v1** — fill in scope/price/dates per job. Layer trade variants when there's user demand.

### M3.9 — Dispute mediator

- **Q3.9a — When does 6 escalate to a human?**
  - Recommendation: **3-strike rule** — if 6 can't broker resolution after 3 turns, or the disputed amount exceeds $500, or either party says "I want a person", escalate via Slack/email to a designated admin queue.

---

## 📋 What SG Dietz Must Provide — In Order of Need

Per SG Dietz's request *("What do you need first, second, third so I can take care of them in your order")*. Order reflects **when the build is blocked without it**, weighted by procurement lead time.

### 1️⃣ FIRST — Google Cloud OAuth verification (start today)

- **Why first:** longest lead time of anything in M3 (1–4 weeks of Google approval). The actual code that uses it doesn't run until Phase-3 Track C, but the approval has to be in flight from day 1 or M3.4 sits idle when its turn comes.
- **How:** Google Cloud Console → **APIs & Services → OAuth consent screen** → Submit for verification with the requested scope `https://www.googleapis.com/auth/calendar.events`
- **Cost:** Free
- **Hand off:** verified OAuth client ID + client secret, sent to me whenever they clear

### 2️⃣ SECOND — Twilio Voice enablement + phone number (this week)

- **Why second:** powers the M3.1 phone-call spike. The spike happens at the start of Phase 3, so I need this by then.
- **Reuses:** the existing Twilio account already powering M1.7 SMS — no new vendor, just one enablement step.
- **How:** Twilio Console → **Voice → Programmable Voice** → confirm enabled (often already is). Then **Phone Numbers → Buy a number** (~$1/mo, US local).
- **Cost:** ~$1/mo line rental + $0.013–0.022/minute of call usage (you pay both legs)
- **Hand off:** existing `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` already in `.env`; new `TWILIO_VOICE_FROM_NUMBER` (the number you bought, E.164 format like `+15551234567`)

### 3️⃣ THIRD — Deepgram (or chosen STT) API key (this week)

- **Why third:** also needed for the M3.1 spike. Streaming STT on the call audio. Without it, the spike can't measure end-to-end latency.
- **How:** [deepgram.com](https://deepgram.com) → sign up → **API Keys → Create**
- **Cost:** free $200 credit on signup, then $0.0043–0.0073/minute streaming
- **Hand off:** `DEEPGRAM_API_KEY`

### 4️⃣ FOURTH — Dropbox Sign (or chosen e-sign) sandbox (next week)

- **Why fourth:** needed for M3.7 contract drafter. Phase 3 Track B builds toward this, but M3.6 estimates land first, so e-sign isn't day-1 critical.
- **How:** [sign.dropbox.com](https://sign.dropbox.com) → create account → **Settings → API → Create API key**. Sandbox immediate; production access requires a separate application (3–5 business days).
- **Cost:** sandbox free; production starts at $20–25/mo per sender + $0.50/envelope above the included tier
- **Hand off:** `SIGN_PROVIDER_API_KEY`, `SIGN_PROVIDER_WEBHOOK_SECRET`, sender identity (email + name + business)

### 5️⃣ FIFTH — SerpAPI (when ready to swap from mock contractors, no rush)

- **Why fifth:** entirely optional for M3. Mock contractors are still serving every demo and test. SerpAPI only matters when SG Dietz wants real contractor data on the live site. Can wait until just before public launch.
- **How:** [serpapi.com](https://serpapi.com) → sign up → **Dashboard → API key**
- **Cost:** plans from $50/mo (5k searches) to $250/mo (50k searches)
- **Hand off:** `SERPAPI_API_KEY`

### Summary table for SG Dietz

| Priority | Item | Lead time | Cost order of magnitude | When I need it |
|---|---|---|---|---|
| 1️⃣ | Google Calendar OAuth verification | 1–4 weeks | Free | Submit Day 1 |
| 2️⃣ | Twilio Voice enablement + phone number | Same day | ~$1/mo + per-min | Start of Phase 3 |
| 3️⃣ | Deepgram API key | Same day | Free trial then per-min | Start of Phase 3 |
| 4️⃣ | Dropbox Sign sandbox | Same day; prod 3–5 days | $20–25/mo + per-envelope | Phase 3 Track B (after M3.6) |
| 5️⃣ | SerpAPI subscription | Same day | $50–250/mo | Only when going from mock → real contractor data |

### Decisions needed before each feature starts

| Decision | When needed | Recommendation |
|---|---|---|
| Q3.0a — Overlay shape | Before M3.0b codes | Right-side drawer |
| Q3.0b — State management | Before M3.0b codes | Zustand |
| Q3.1a — Telephony provider | Before M3.1 spike | Twilio Voice |
| Q3.1b — Real-time STT | Before M3.1 spike | Deepgram |
| Q3.1c — When 6 speaks | Before M3.1 full implementation | Only when addressed by name |
| Q3.3a — Recording storage | Before M3.3 codes | Supabase Storage |
| Q3.4a — Calendar providers | Before M3.4 codes | Google only for v1 |
| Q3.6a — Estimate format | Before M3.6 codes | Fixed JSON schema |
| Q3.7a — E-sign provider | Before M3.7 codes | Dropbox Sign |

### Vendor / contract items

1. **Voice persona finalization** — after the brain pivot, 6's personality is no longer governed by HeyGen's prompt. Confirm tone-of-voice guidelines: warm, encouraging, technical when needed, never sarcastic. SG Dietz should provide 5–10 example phrases to anchor the system prompt.
2. **Recording consent language** — every call needs a "this call is being recorded by 6" preamble. SG Dietz approves wording.
3. **Contract template — legal review** — the v1 generic contract template needs a lawyer review before any e-sign goes out for real money work.
4. **Dispute escalation contact** — when 6 hands off (Q3.9a), where does the escalation go? (Slack channel? Email alias? Person on call?)

### Budget heads-up (monthly approximate, low-volume v1)

| Item | Est. cost |
|---|---|
| Twilio Voice phone number | ~$1/mo |
| Twilio Voice usage | $0.013–0.022 / minute per leg of call |
| Deepgram STT | $0.0043–0.0073 / minute streaming |
| Dropbox Sign | $20–25 / month per sender + $0.50 per envelope above tier |
| Google Calendar API | Free |
| OpenAI (M3 increased usage) | $50–200 / mo depending on call volume |
| Supabase Storage (recordings) | $0.021/GB/mo; ~$5–20 / mo at v1 volume |
| **New M3 cost floor** | **~$80 – $300/mo** before usage-based growth |

---

## ✅ Definition of Done for M3

Roadmap exit criteria: **6 is in the middle of every interaction, not just at the gates.** Concretely, M3 ships when each box below is true. (Boxes marked **conditional** are skipped if the M3.1 spike fails — see "Acceptable partial-M3 outcome" above.)

- [ ] 🎯 **M3.0d test drive accepted by SG Dietz** — voice-only search → recommend → book on mock data, no forms touched
- [ ] **(conditional)** A homeowner can say *"call my plumber"* → a 3-way phone call is bridged with 6 as an active participant
- [ ] **(conditional)** The call is recorded; the recording is searchable by transcript; two-party consent captured at preamble
- [ ] During a voice estimate flow the contractor verbally walks through a scope; 6 turns it into a structured line-item PDF the homeowner sees
- [ ] 6 emails the homeowner a generated contract; both parties e-sign through the chosen provider within the same business day
- [ ] A calendar reminder fires the day before the scheduled work, on the user's preferred channel
- [ ] When work-day-of, 6 confirms both parties are showing up — and if one isn't, reschedules
- [ ] If the homeowner says *"I can't decide between these two"*, 6 asks clarifying questions and re-ranks live
- [ ] If a dispute arises, 6 takes the intake, references whatever context exists (M3.3 transcripts if shipped, plus M3.7 contracts), proposes a remedy or escalates per Q3.9a
- [ ] All of the above is voice-driven on the home screen — no form-driven page in the critical path

---

## ⚠️ Risk Notes

1. **M3.1 phone calling is the single biggest technical risk in M3** — *and the one SG Dietz is least sure is doable well.* Real-time STT → LLM → TTS with sub-second barge-in latency is non-trivial. **Time-boxed spike is mandatory** — the spike's result is the explicit decision gate for whether M3.1 ships in this milestone or carries forward.

2. **M3.0a brain pivot may change 6's voice personality.** HeyGen's hosted brain has its own prompt; our `/api/openai-chat-complete` has a much thinner system prompt. SG Dietz must approve the new prompt's persona before M3.0a ships to production. Keep FULL mode wired during transition for A/B comparison.

3. **M3.4 Google Calendar verification is a long-lead item** (1–4 weeks). Only one of the procurement items with calendar-weeks of lead time. Submit Day 1.

4. **M3.7 contract template requires lawyer review** before real money flows through it. Don't ship a self-drafted template to real users.

5. **Recording consent is a regional regulatory landmine.** Two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA, etc.) require explicit consent at the start of every recorded call. The system MUST gate the recorder on a verbal "yes" from both participants. Build that into M3.3 from day one — not a follow-up polish item.

6. **M3.2 video deferral is reversible.** All M3.1 code (Twilio Voice + Deepgram) is audio-only by choice, not by limitation. If video gets greenlit later, LiveKit (or chosen provider) can be added without unwinding M3.1.

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial M3 build order, voice-first per SG Dietz direction | Bert / Claude |
| 2 | SG Dietz green-light 2026-06-04: drop M3.2 video, M3.1 becomes time-boxed spike, add M3.0d voice test-drive checkpoint as first deliverable, reorder procurement section by need-priority | SG Dietz / Bert / Claude |
