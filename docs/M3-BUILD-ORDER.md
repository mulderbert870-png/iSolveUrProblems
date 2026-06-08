# Milestone 3 — Build Order

> Companion to [ROADMAP.md](ROADMAP.md). Scope-only. No timelines.
> Goal of M3: **6 stops being a button and starts being a participant.** The whole site becomes voice + avatar first. 6 joins phone calls between homeowners and contractors, records and transcribes them, runs the calendar, drafts estimates from a contractor's voice, sends contracts for e-signature, and mediates disputes. After M3, removing 6 from a job would feel like firing the project manager.
> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`
> Companion architectural note: [M2-DELIVERY.md](M2-DELIVERY.md) — explains how M2's engine remains the backend M3's voice surface drives.

> **SG Dietz directive (2026-06-04):**
> - **No M3.2 video.** Phone only. Video can come later if there's demand.
> - **M3.1 phone calling is spike-first.** Prove feasibility quickly with a small test, then build everything else in parallel so a stuck calling track doesn't block M3.
> - **First deliverable is SG Dietz's voice test drive** — 6 talking him through finding a contractor, start to finish, on mock data. Ships immediately after M3.0 lands, before heavier work.
>
> **Audio-pipeline reality (added 2026-06-05 after revisiting earlier CUSTOM-mode test results):**
> - **Avatar UI stays in FULL mode.** The earlier CUSTOM-mode test had 5–10 s end-to-end latency and **silent audio on iPhone**. Both are real, observed problems — not theoretical. Fixing them properly is ~1–2 weeks of focused work (streaming OpenAI, streaming ElevenLabs, iOS audio-injection path). We do not pay that cost as a prerequisite for M3.
> - **Conversational vision-anchored features move to the phone-call pipeline** where we control latency end-to-end and iOS audio isn't in the picture (it's a phone call). That covers M3.6 voice estimates (vision ¶17 — *"as the contractor drives down the road"* literally implies phone) and M3.9 dispute mediation.
> - **M3.0d test drive** uses an intent classifier on `USER_TRANSCRIPTION` events + the **context-injection pattern** (see next major section): backend computes the result, wraps it as a "context message" prompt, sends via `session.message()` so HeyGen's brain narrates the actual data through its native low-latency pipeline. Drawer cards populate as visual reinforcement.
>
> **The Context-Injection Discovery (added 2026-06-05 after Bert identified the pattern):**
> - **The image-analysis flow already in production proves we can feed backend results into HeyGen's FULL-mode brain.** See [LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978). After our `/api/analyze-image` returns a vision LLM description, the client wraps it in a `[IMAGE CONTEXT — not spoken by user]` prompt and sends it via `session.message()`. HeyGen's brain narrates the actual image content as if it had perceived it directly. This same mechanism works for *any* backend result, not just images.
> - **M3.0e refactored from "detect-and-populate-drawer-only" to "detect-and-inject-into-brain".** The intent classifier no longer just fires backend actions in parallel to whatever HeyGen's brain happens to say — it actively hands the brain the actual data via a context message. HeyGen narrates the real result with its native low-latency pipeline; the drawer reinforces visually.
> - **M3.8 decision support runs as voice-on-avatar v1** via context injection (was originally planned as drawer text only). Voice-driven re-rank ("not that one, too far") works the same way — each refinement gets a fresh injection. Drawer compare panel stays as visual reinforcement.
>
> **CUSTOM mode removed from M3 scope entirely (2026-06-05).** On honest review, every M3 conversational feature is satisfied by either the context-injection pattern on the avatar UI or the phone-call pipeline. No concrete M3 deliverable depends on CUSTOM mode. The earlier "Optional Phase 4 fix spike" is dropped — see [Future Considerations](#future-considerations) for the conditions under which a future milestone might revisit it.

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

## The Context-Injection Pattern (architectural foundation for M3.0d–M3.0e)

This pattern is the single most important piece of architecture in M3. It explains how voice-driven tool calling works without CUSTOM mode.

### The mechanism

The existing image-analysis flow at [LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978) demonstrates the pattern. After a backend call computes a result, the client wraps that result in a prompt and sends it to the avatar as if it were a user message:

```typescript
const contextMessage = `[IMAGE CONTEXT — not spoken by user]
Vision just processed an image the user captured. You are viewing it
directly. Here is what's in it: ${analysis}.
Respond naturally in first person as 6, tie what you see to the ongoing
conversation… Respond briefly (1-2 sentences). Never say you can't see
it or that you're relying on someone else's analysis — you can see it
directly.`;
sessionRef.current.message(contextMessage);
```

HeyGen's FULL-mode brain receives this through the same channel as a real user message, reads the wrapper instructions, and generates a natural-sounding response grounded in the *actual data we computed on our backend*. Subsequent conversational turns include this in HeyGen's context window, so 6 can keep talking about the image (or contractor, or estimate) coherently.

### What this means for tool calling in FULL mode

The naive view ("FULL mode brain has no HTTP, so we need CUSTOM for tool calling") is technically true but practically wrong. In practice:

```
Voice-triggered tool call in FULL mode:

  1. User speaks: "find me a plumber"
  2. HeyGen receives audio → STT → text "find me a plumber"
  3. SDK fires USER_TRANSCRIPTION event with that text
  4. Our M3.0e intent classifier reads the transcript
  5. Our backend calls /api/contractors/search
  6. We construct a context message wrapping the results
  7. We send it via session.message() — optionally after AVATAR_INTERRUPT
     if HeyGen's brain has already started replying generically
  8. HeyGen's brain narrates the actual results in its low-latency
     native pipeline (~1–2s, iPhone-safe)
  9. In parallel, the drawer state store renders cards as visual
     reinforcement
```

The brain effectively gets "function-call results" delivered as a fake user message. It doesn't know it's a workaround — it just sees more conversational context and responds accordingly.

### Where this pattern works and where it doesn't

| Scenario | Pattern fits? |
|---|---|
| User asks for contractor list ("find a plumber") | ✅ Strong fit — we compute, inject, brain narrates the result |
| User asks 6 to recommend ("which one should I pick?") | ✅ Strong fit — same pattern, brain narrates the top pick + reason |
| User confirms an action ("book the first one") | ✅ Strong fit — backend fires the action, injection confirms ("Done — they'll be in touch shortly") |
| User asks 6 to summarize reviews on a card | ✅ Strong fit — summary text injected as context |
| Decision-support back-and-forth ("not that one, too expensive") | ✅ Strong fit — re-run with new constraint, inject new result |
| Real-time bidirectional tool chains mid-utterance (rare in our domain) | ⚠️ Theoretically a CUSTOM-mode use case, but no concrete M3 feature actually requires it — see [Future Considerations](#future-considerations) |
| Phone-call estimate generation (contractor talks, 6 builds estimate live) | ❌ Different surface — runs on M3.1 phone pipeline, not avatar UI |

The "doesn't fit" rows are narrow and not in the M3 critical path. Almost everything M3 needs to do at the avatar UI fits the context-injection pattern.

### The one real concurrency risk

When the trigger is voice (not a UI button), HeyGen's brain may already be generating a generic response (*"Sure, let me check…"*) by the time our backend search completes and we send the context message. Three ways to handle it:

| Strategy | UX feel | Implementation |
|---|---|---|
| **`AVATAR_INTERRUPT` then inject** | Avatar pivots mid-sentence to the actual result | Cleaner result, slight cut-off feel |
| **Wait for `AVATAR_SPEAK_ENDED`, then inject** | Natural "let me check… OK, found 5 plumbers" rhythm | Adds the brain's initial response time to the loop |
| **Just inject and let HeyGen handle the queue** | Untested — HeyGen may merge or queue both messages | Cheapest, needs measurement |

We pick the strategy in the M3.0e implementation. v1 default: **wait for `AVATAR_SPEAK_ENDED`** — feels closest to a real assistant looking something up.

### Why CUSTOM mode is no longer in M3 scope

Earlier I treated CUSTOM mode as the only real path to voice-driven tool calling. Pressure-testing that claim against the context-injection pattern, the supposed CUSTOM-mode-only use cases (mid-utterance tool chains, token-by-token LLM control, latency) all either:

- **Aren't real M3 features** — they were "what if" scenarios, not vision-anchored deliverables, or
- **Are actually satisfied by context injection** in a way that's at least as natural as CUSTOM would be

Combined with the real, observed CUSTOM-mode regressions from the prior attempt (5–10 s latency, silent iPhone audio — a 1–2 week fix project), the honest call is: **drop CUSTOM mode from M3 scope entirely.** Document it in [Future Considerations](#future-considerations) so a future milestone can revisit only if a concrete feature genuinely requires it.

---

## What M3 Delivers

The 9 vision-anchored features below + a foundation pre-step. Each vision-anchored entry has a paragraph reference; M3.0 is enabling infrastructure (no vision anchor — it makes the rest possible).

| # | Feature | Surface | Vision anchor |
|---|---|---|---|
| M3.0 | Voice-first foundation (overlay UI + transcript wiring + intent classifier) | Avatar (FULL) | *Enabling infrastructure — no vision anchor; ¶8 + ¶26 imply the voice-first model* |
| ~~M3.0a~~ | ~~Brain pivot FULL → CUSTOM~~ | — | **Deferred.** Last attempt had 5–10 s latency + silent audio on iPhone. Re-attempt requires a ~1–2 week fix spike, only on SG Dietz greenlight. M3 ships without it. |
| **M3.0d** | **🎯 SG Dietz voice test drive on mock data** | Avatar (FULL) + drawer | *First deliverable — intent-classifier-driven drawer population + HeyGen narration* |
| M3.1 | 3-way phone calls (homeowner + contractor + 6) | Phone (Twilio) | ¶12 — *"real-time three-way conversations between users and contractors — he can literally be on the phone or videophone"*. **Spike-first.** |
| ~~M3.2~~ | ~~3-way video calls~~ | — | **Deferred per SG Dietz 2026-06-04.** Anchor preserved: ¶12 — *"videophone… 3-way conversation"*. May ship in a later milestone if user demand warrants. |
| M3.3 | Full call recording + searchable transcript index | Phone (Twilio) | ¶12 — *"it will all be on record"*. Ships only if the M3.1 spike succeeds. |
| M3.4 | Appointment & reminder agent | Backend job | ¶14 — *"before meetings or when work is to occur, 6 will message both parties to make sure they'll be on time and ready"* |
| M3.5 | Auto-reschedule flow | Backend job | ¶14 — *"If not, he'll coordinate rescheduling"* |
| M3.6 | Voice-driven estimate generator (contractor talks → line-item estimate) | **Phone (Twilio)** | ¶17 — *"help estimate projects… simply by talking to the contractor, which can be done as the contractor drives down the road"* — the vision **explicitly implies phone**, not avatar UI. Runs as a feature of the M3.1 call. |
| M3.7 | Contract drafter + e-signature delivery | Backend (event-triggered) | ¶17 — *"write up contracts… deliver the contract in writing in their email box"* |
| M3.8 | Decision-support chat ("which contractor should I pick?") | **Voice-on-avatar (context injection)** + drawer compare panel | ¶18 — *"help the user work through uncertainties and come to decisions"*. v1 runs voice-on-avatar via the context-injection pattern (M3.0e), with the drawer's compare panel as visual reinforcement. Multi-turn re-rank works the same way — each refinement gets a fresh injection. |
| M3.9 | Dispute mediator agent | **Phone (Twilio) or async text** | ¶16 — *"6 will be the front line for disputes, to help work out problems in the moment"*. Disputes aren't usually a "stare at the avatar right now" moment — phone or asynchronous text is the natural surface. |

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

Stays in FULL avatar mode. The "voice-first" experience is achieved via the **context-injection pattern** (proven by the existing image-analysis flow): user speech triggers a backend action via intent classifier, the result is injected into HeyGen's brain as a context message, the brain narrates the actual data with its native low-latency pipeline. Drawer populates in parallel as visual reinforcement.

| Step | Feature | Why this position |
|---|---|---|
| **1**  | M3.0b — Voice-first overlay UI + state store (Zustand) | The "results pop up on screen" surface. Cards reinforce the brain's narration visually. |
| **2**  | M3.0c — Transcript event wiring (`USER_TRANSCRIPTION` + `AVATAR_SPEAK_ENDED`) | Captures every user utterance for the intent classifier; captures avatar speech-end to time the context-injection moment. |
| **3**  | M3.0e — Intent classifier + context-injection orchestrator | Side-channel backend route consumes user transcripts → fires the matching M2 backend → wraps the result in a context message → injects via `session.message()` so HeyGen's brain narrates the actual data. Reuses the proven [LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978) pattern from image analysis. |
| **🎯 4** | **M3.0d — SG Dietz voice test drive on mock data** | **First user-facing checkpoint.** SG Dietz voice-drives M2 (search → recommend → pick → simulated payment) end-to-end on mock contractors. Brain narrates the actual backend results via context injection; drawer cards reinforce. |

### Phase 3 — Parallel build (after Phase 2 ships)

After the test drive lands, M3.1 runs as a time-boxed spike, while the rest of M3 builds on independent tracks. The conversational vision-anchored features (M3.6, M3.9) move to the **phone-call audio pipeline** where we control latency and iOS isn't a factor.

| Track | Feature | Why this position |
|---|---|---|
| **A.1** | **M3.1 spike** — minimal proof-of-concept 3-way call (2 humans + 6) | **Time-box: ~1 working day.** Goal: prove sub-2 s loop is reachable end-to-end on the Twilio + Deepgram + OpenAI + ElevenLabs pipeline. Decision gate at end. |
| **A.2** | M3.1 full implementation | Only if the spike clears. Otherwise carries to a later milestone. |
| **A.3** | M3.3 — Recording + transcript index | Depends on M3.1 audio stream being real. Only if A.2 ships. |
| **A.4** | **M3.6 — Voice-driven estimate generator (in-call feature)** | Now part of the M3.1 call pipeline — when the contractor describes work on the call, 6's brain (server-side) builds the structured estimate live. |
| **A.5** | **M3.9 — Dispute mediator (phone or async text)** | Same Twilio + STT pipeline as M3.1. Could also run as async text intake via the drawer; both surfaces are fine. |
| **B.1** | M3.7 — Contract drafter + e-signature delivery | Triggered by event after M3.6 estimate confirmed. Independent of A.1–A.3 if estimates also reachable via drawer flow (fallback). |
| **C.1** | M3.4 — Appointment & reminder agent | Needs Google Calendar OAuth verified (Phase-1 kickoff). |
| **C.2** | M3.5 — Auto-reschedule flow | Small layer on top of M3.4. |
| **D.1** | M3.8 — Decision-support chat (drawer text v1) | Text-driven chat surface in the overlay drawer; user reads the picks, types or clicks follow-ups, drawer re-ranks. HeyGen narrates in parallel from FULL brain. **Voice-on-avatar version waits on CUSTOM-mode fix.** |



---

## Dependency Graph

```
Phase 1: Vendor kickoffs (parallel, day 1)
   ├─ Google Calendar OAuth submission
   ├─ Dropbox Sign sandbox
   ├─ Twilio Voice + phone number
   └─ Deepgram API key

Phase 2: Voice foundation (sequential, FULL mode stays)
   M3.0b Overlay UI ──→ M3.0c Transcript wiring ──→ M3.0e Intent classifier ──→ 🎯 M3.0d SG Dietz test drive

Phase 3: Parallel tracks (after Phase 2)

   Track A (Phone-call pipeline — spike-first; we control audio here)
      M3.1 spike ──→ [decision gate] ──→ M3.1 full ──→ M3.3 Recording + transcript
                                              │
                                              ├──→ M3.6 Voice estimate (in-call feature)
                                              └──→ M3.9 Dispute mediator (in-call OR async)

   Track B (Contracts — event-triggered)
      M3.6 estimate confirmed ──→ M3.7 Contract drafter + e-sign delivery

   Track C (Calendar — needs Google OAuth verified)
      M3.4 Reminders ──→ M3.5 Reschedule

   Track D (Decision support — voice-on-avatar via context injection)
      M3.8 Decision-support — voice + drawer compare panel reinforcement
```

---

## M3.0 — Voice-First Foundation (Pre-feature)

The SG Dietz pivot in code form. Three sub-tasks; **none of them require switching avatar brain mode**. M3 stays in FULL mode throughout, using the context-injection pattern (see [The Context-Injection Pattern](#the-context-injection-pattern-architectural-foundation-for-m30dm30e) section above) for voice-driven tool calling.

### ~~M3.0a~~ — Brain switchover (FULL → CUSTOM mode) — Out of M3 scope

**Status:** Removed from M3 scope entirely (2026-06-05). Prior CUSTOM-mode test showed two blocking problems:

1. **End-to-end latency 5–10 s** vs FULL mode's ~1–2 s. Caused by sequential blocking calls in [useTextChat.ts](../apps/demo/src/liveavatar/useTextChat.ts): `/api/openai-chat-complete` (full response) → `/api/elevenlabs-text-to-speech` (full audio) → `repeatAudio()`. No streaming anywhere in the chain.
2. **Silent audio on iPhone Safari** — `session.repeatAudio(audio)` plays through a different code path than HeyGen's native WebRTC track. iOS autoplay restrictions + `getUserMedia()` audio-output locking interfere.

Fixing both is a ~1–2 week focused engineering project. **No M3 feature requires CUSTOM mode** once context injection is on the table — see [Future Considerations](#future-considerations) for the criteria under which a later milestone might revisit this.

**Implication for M3:** every M3 conversational feature designs around FULL mode by either (a) the context-injection pattern on the avatar UI (M3.0d, M3.8) or (b) running on the phone-call pipeline where we control audio end-to-end (M3.1, M3.6, M3.9).

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

### M3.0e — Intent classifier + context-injection orchestrator

**Why:** This is the workhorse of M3.0d. User speech in FULL mode can't directly trigger our backend (HeyGen's brain has no HTTP). But we can detect intent from `USER_TRANSCRIPTION` events, run the matching M2 backend ourselves, and **inject the result back into HeyGen's brain via `session.message()` as a context message** — the exact pattern the image-analysis flow already uses in production at [LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978). HeyGen's brain narrates the real data with its native pipeline.

### Sub-tasks
1. Build `POST /api/intent/classify` — accepts `{ transcript_text, session_id, user_id?, context }` and returns `{ intent, slots, confidence, action? }`
2. Classifier implementation v1: cheap rules-based regex matching for the 5 core intents (`find_contractor`, `tell_me_more`, `recommend`, `pick`, `book`) + extracted location/category slots. **Avoid an LLM call for v1** — keep round-trip <100 ms.
3. Build `src/lib/intent/contextInjector.ts` — per-intent prompt-wrapping helpers. For each intent, define the "wrapper" template (mirrors the [IMAGE CONTEXT] one) that frames the backend result and instructs the brain how to narrate it.
4. Hook the classifier into the M3.0c transcript-append path: after persisting a `user_transcription`, fire the classifier asynchronously; on intent match, call the matching M2 route, wrap the result via `contextInjector`, send via `session.message()`.
5. Concurrency strategy (Q3.0c implementation): default to **wait for `AVATAR_SPEAK_ENDED`** before injecting — feels natural ("let me check… OK, found 5 plumbers"). Make the strategy a per-intent option for tuning.
6. Drawer reinforcement: each backend result also emits a surface-update event to M3.0b's Zustand store so cards appear visually as the brain speaks.
7. Confidence threshold tuning (Q3.0c) — what counts as a strong-enough match? Misfires should fall back to letting HeyGen's brain handle the utterance without injection.
8. Diagnostic logging: capture (a) the user transcript, (b) the matched intent + slots, (c) the backend result, (d) the wrapped context message, (e) HeyGen's spoken reply. So we can see when injection produces good vs awkward narration during M3.0d tuning.

### Files touched
- **New:** `src/lib/intent/{classify,rules,slots,contextInjector}.ts`; `app/api/intent/classify/route.ts`
- **Modified:** `app/api/transcripts/append/route.ts` (chains into classifier + injector after persist); `liveavatar/context.tsx` (exposes a `sendContextMessage()` helper that wraps `session.message()` with the avatar-speak-ended timing logic)

---

## 🎯 M3.0d — SG Dietz Voice Test Drive (Checkpoint)

**Why:** SG Dietz: *"build toward me experiencing that early."* This is not a feature in the traditional sense — it's the proof that the context-injection pattern actually unblocks the voice-first vision **without** depending on the CUSTOM-mode fix. After M3.0b/c/e land, SG Dietz personally voice-drives the M2 engine end-to-end on mock data. If brain-narration of real backend data feels natural, M3.1+ is worth building. If injection timing feels off, we tune the per-intent strategy before adding more surface area.

### What it looks like (FULL mode + context injection)

1. SG Dietz opens the home page → avatar session starts in **FULL mode** (same as today)
2. He says *"6, find me a plumber near Austin"*
3. SDK fires `USER_TRANSCRIPTION` event with the text
4. HeyGen's brain begins replying: *"Sure, let me check…"*
5. Our intent classifier (M3.0e) parses *"find me a plumber near Austin"* → matches `find_contractor`, extracts category=plumber + location=Austin → calls `/api/contractors/search`
6. Backend returns 5 ranked contractors
7. M3.0b store gets a surface-update event → drawer populates with cards (visual reinforcement)
8. Our context-injection orchestrator waits for `AVATAR_SPEAK_ENDED` (HeyGen finishes its brief "let me check…")
9. We send `session.message()` with a wrapped context message:
   ```
   [CONTRACTOR SEARCH RESULTS — not spoken by user]
   User just asked for a plumber near Austin. I found these candidates
   ranked by your existing rules:
     1. Acme Plumbing — 4.8★ · 2 km · $$ · licensed
     2. Sunrise Drainworks — 4.7★ · 3 km · $$ · same-day
     3. Heritage Pipe Co — 4.6★ · 5 km · $$$ · locally-owned
     ...
   Respond naturally in first person as 6. Mention the top 1–2 briefly
   with their ratings and distance. Offer to share more detail or to
   pick one. Be concise (2 sentences max). Don't list all 5.
   ```
10. HeyGen's brain narrates: *"I found a few good options. Acme Plumbing is the top match — 4.8 stars and just 2 km from you. Want me to tell you more, or should I go with them?"*
11. SG Dietz says *"tell me more about Acme"*
12. Intent classifier matches `tell_me_more` with target="Acme" → backend runs `/api/contractors/[id]/summary` → wraps result as context message → brain narrates strengths/watch-outs
13. SG Dietz says *"book the first one"*
14. Intent classifier matches `pick` → backend fires the M2.6 simulation → wrapped result *"Done — they've been notified and the other candidates are getting friendly feedback"* injected → brain confirms verbally → emerald drawer card shows the fan-out result

### Sub-tasks
1. Define the 5 core intents (`find_contractor`, `tell_me_more`, `recommend`, `pick`, `book`) and their slot extraction rules
2. Author the 5 corresponding context-injection wrappers in `src/lib/intent/contextInjector.ts` (each like the [IMAGE CONTEXT] one)
3. Tune the HeyGen FULL-mode Persona / Knowledge Base so 6's "while we wait" patter is brand-aligned (*"let me check"*, *"give me a second"*, etc.)
4. Wire M3.0b drawer to render the 4 surface variants (search hits, summary, picks, pick-result) as visual reinforcement
5. Add a stub `book_contractor({ contractor_id })` backend route that wraps M2.6 `/api/contractors/pick` simulation
6. Hide `/contractors` from home-page navigation; keep accessible at `/contractors?dev=1`
7. End-to-end dry run on mock data — record a screencast for SG Dietz before he tries it
8. Iterate on injection timing strategy (Q3.0c) and wrapper wording based on SG Dietz feedback

### Files touched
- **New:** `src/lib/contractors/bookContractor.ts` (wraps M2.6); test-drive checklist doc
- **Modified:** `intent/rules.ts` (the 5 intents), `intent/contextInjector.ts` (the 5 wrappers), `assistantSurface/store.ts` (4 variants), HeyGen Persona/Knowledge Base configuration (out-of-repo, in HeyGen Dashboard)

### Exit criteria
SG Dietz uses the home page by voice only, completes the **find → tell-me-more → recommend → book** flow on mock data, and signs off on the experience as the foundation worth building M3.1+ on top of. The brain's narration of real backend data feels natural — like 6 actually looked something up — not like a parallel-running prerecorded message that mismatches what's on screen.

### Honest caveat for SG Dietz
Voice-triggered context injection has one timing edge case: HeyGen's brain may start speaking a generic acknowledgment (*"let me check"*) before our backend search completes. We mitigate by either interrupting it with `AVATAR_INTERRUPT` (clean but possibly jarring) or waiting for `AVATAR_SPEAK_ENDED` before injecting (natural rhythm, slightly more latency). Default is the natural rhythm; per-intent tuning available. If it feels wrong in testing, both strategies are 1-line config changes.

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

## M3.6 — Voice-Driven Estimate Generator (in-call feature on the M3.1 phone pipeline)

**Surface change vs original plan:** vision ¶17 says *"by talking to the contractor… as the contractor drives down the road"* — that's a phone call, not someone staring at the avatar UI in a browser. M3.6 now ships as a feature of the M3.1 call infrastructure. The audio pipeline is Twilio → Deepgram → our LLM → ElevenLabs → Twilio, fully under our control (no HeyGen / iOS audio risk).

### Sub-tasks
1. Decide estimate template (Q3.6a) — fixed JSON-schema vs free-form
2. Decide whether contractor speaks unit prices or whether we have a unit-rate library (Q3.6b)
3. New `estimates` table (id, contract_id, contractor_id, homeowner_id, line_items jsonb, total_cents, status, source_call_id, created_at)
4. In-call **estimate mode**: once an M3.1 call is in progress, 6 (running on our backend) can be put into "estimate mode" via either a voice command from the homeowner (*"6, take down the estimate"*) or auto-trigger when the contractor starts describing line items
5. Streaming LLM listens to the contractor's voice (via the live Deepgram transcript stream), proposes structured line items, asks clarifying questions verbally back through the call (*"OK, two hours of labor at $150 — do you also need to charge for materials?"*)
6. Render estimate as a PDF when the call ends (reuse M1.5 PDF renderer)
7. Deliver estimate to homeowner via the M1.7 fabric on their preferred channel
8. UI: post-call estimate preview card in the assistant drawer, plus emailed PDF

### Files touched
- **New:** `src/lib/estimates/{generate,pdf,store,inCallMode}.ts`; migration `estimates`; `app/[locale]/estimates/[id]/page.tsx`
- **Modified:** call brain state machine (M3.1) to add estimate-mode; PDF renderer

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

## M3.8 — Decision-Support Chat (voice-on-avatar v1 via context injection)

**Surface upgrade vs the 2026-06-05 morning plan:** the context-injection pattern (image-analysis style) makes voice-driven decision support viable in v1 without the CUSTOM-mode fix. When the homeowner says *"I can't decide"* or *"not that one, too far"*, the intent classifier picks it up, the recommender re-ranks with the new constraint, and we inject the new ranking as a context message so 6 talks the user through the updated picks. The drawer's compare panel stays as visual reinforcement.

### Sub-tasks
1. Backend `POST /api/contractors/deliberate` — accepts `{ option_ids, current_picks, refinement_text, memory_facts }` and returns re-ranked picks with concise per-pick reasoning suited for voice narration
2. Intent classifier extension: 2 new intents — `deliberate_open` (*"I can't decide", "help me choose"*) and `deliberate_refine` (*"not that one"*, *"only locally-owned"*, *"closer than 5km"*, *"under $300"*) with slot extraction for the refinement constraint
3. Context-injection wrappers for both intents — open-the-deliberation framing vs refinement-result framing. Brain narrates the top 2–3 picks with key differentiators in <30 words.
4. Drawer compare panel: side-by-side comparison of the top picks (rating, distance, price tier, sentiment summary, key differentiators) — same data the brain narrates, displayed visually
5. Memory tie-in (M1.2): surface previously stored preferences in the panel as "6 remembers you said…" and include them in the deliberation backend prompt
6. Multi-turn loop: each user refinement injects fresh context; brain re-narrates without losing thread
7. Drawer compare panel also has a free-text input box at the bottom for users who prefer typing over speaking — same backend, different trigger

### Files touched
- **New:** `src/lib/contractors/deliberate.ts`; `app/api/contractors/deliberate/route.ts`; `src/components/AssistantSurface/ComparePanel.tsx`
- **Modified:** intent rules (add 2 deliberation intents); intent context-injector (add 2 wrappers); recommender to accept ad-hoc constraint additions

---

## M3.9 — Dispute Mediator Agent (phone OR async text)

**Surface change vs original plan:** disputes are rarely a "stare at the avatar right now" moment. v1 ships on two surfaces — a phone call (reuses M3.1 pipeline) for live intake, and an async text thread in the drawer for slower back-and-forth. Both feed the same backend resolution flow. Avatar-UI voice-driven mediation waits on the CUSTOM-mode fix.

### Sub-tasks
1. Migration: `disputes` table (id, contract_id, party, status, intake_call_id?, intake_thread_id?, created_at, resolved_at, resolution_kind)
2. Intake — phone path: voice command *"6, I want to file a complaint"* during a call triggers structured intake on the same call audio
3. Intake — async-text path: a "Start dispute" button on the contract viewer (M2.5) opens a thread in the drawer; user types the complaint
4. Mediator brain prompt reads available context — M3.3 transcripts (if exist), M3.7 contract, M2.6 notification history — and proposes a remedy or asks for more info
5. Resolution paths: propose remedy, broker reduced refund, escalate to human per Q3.9a
6. Escalation criteria (Q3.9a) — define when 6 hands off (3-strike rule, >$500 disputed, "I want a person")
7. UI: dispute thread page

### Files touched
- **New:** `src/lib/disputes/{intake,resolve,store}.ts`; migration `disputes`; `app/[locale]/disputes/[id]/page.tsx`; intake intent rule
- **Modified:** call brain state machine (M3.1) to support dispute-intake mode; intent rules

---

## 🔧 Design Questions to Answer Before Coding

### M3.0 — Foundation

- **Q3.0a — Overlay shape:**
  - Options: (a) **right-side drawer**, (b) **floating card stack over the video**, (c) **bottom sheet**
  - **Recommendation:** **(a) right-side drawer** — easiest on mobile + desktop, doesn't crowd the avatar's face, can be collapsed.
- **Q3.0b — State management:**
  - Options: Zustand, React context, Jotai, Redux
  - **Recommendation:** **Zustand** — tiny, hook-friendly, plays well with Next.js App Router, no provider wrappers needed.
- **Q3.0c — Intent classifier implementation v1:**
  - Options: (a) **regex/rules-based**, (b) **small embedding similarity match**, (c) **LLM call (gpt-4o-mini)**
  - **Recommendation:** **(a) rules-based for v1.** 5 intents with finite slot-extraction patterns — completable in a couple hundred lines, sub-50 ms latency, no per-utterance cost. Upgrade to (c) if rules drift becomes unmanageable.
<!-- Q3.0d (CUSTOM-mode fix spike greenlight) removed 2026-06-05 — no
     M3 feature requires CUSTOM mode once context injection is on the table.
     See Future Considerations section. -->


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
| Q3.0c — Intent classifier implementation | Before M3.0e codes | Rules-based v1 |
| Q3.1a — Telephony provider | Before M3.1 spike | Twilio Voice |
| Q3.1b — Real-time STT | Before M3.1 spike | Deepgram |
| Q3.1c — When 6 speaks | Before M3.1 full implementation | Only when addressed by name |
| Q3.3a — Recording storage | Before M3.3 codes | Supabase Storage |
| Q3.4a — Calendar providers | Before M3.4 codes | Google only for v1 |
| Q3.6a — Estimate format | Before M3.6 codes | Fixed JSON schema |
| Q3.7a — E-sign provider | Before M3.7 codes | Dropbox Sign |

### Vendor / contract items

1. **HeyGen Persona / Knowledge Base tuning** — M3 stays in FULL avatar mode, so 6's voice and personality remain under HeyGen's control. SG Dietz should sign off on the "while we wait" patter the brain uses when our backend is computing a result (*"let me check"*, *"give me a second"*) and on how 6 introduces backend-injected data (M3.0d sub-task 3).
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

2. **CUSTOM-mode regression already observed (and intentionally side-stepped).** Last attempt at CUSTOM avatar mode produced 5–10 s latency and silent audio on iPhone Safari. Both are real, not theoretical. M3 designs around this entirely — keeps FULL mode for the avatar UI, drives voice-anchored features through (a) the context-injection pattern (M3.0d, M3.8) or (b) the phone-call pipeline where we control audio end-to-end (M3.1, M3.6, M3.9). No CUSTOM-mode dependency anywhere in M3.

3. **M3.4 Google Calendar verification is a long-lead item** (1–4 weeks). Only one of the procurement items with calendar-weeks of lead time. Submit Day 1.

4. **M3.7 contract template requires lawyer review** before real money flows through it. Don't ship a self-drafted template to real users.

5. **Recording consent is a regional regulatory landmine.** Two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA, etc.) require explicit consent at the start of every recorded call. The system MUST gate the recorder on a verbal "yes" from both participants. Build that into M3.3 from day one — not a follow-up polish item.

6. **M3.2 video deferral is reversible.** All M3.1 code (Twilio Voice + Deepgram) is audio-only by choice, not by limitation. If video gets greenlit later, LiveKit (or chosen provider) can be added without unwinding M3.1.

7. **Voice-triggered context-injection timing.** The image-analysis pattern works cleanly because the trigger is a UI button (no concurrent brain response in flight). For voice-triggered intents, HeyGen's brain may start a generic acknowledgment (*"let me check…"*) before our backend search completes and we send the context message. The handling strategy is per-intent (Q3.0c):

   - **`AVATAR_INTERRUPT` + inject** — clean override but possibly jarring (avatar pivots mid-sentence)
   - **Wait for `AVATAR_SPEAK_ENDED` + inject** — natural rhythm (*"let me check… OK, found 5 plumbers"*), small added latency. Default for M3.0d v1.
   - **Inject without waiting** — untested; HeyGen may queue or merge; needs measurement

   None of these strategies is universally correct — what feels right depends on the intent. For *"find a plumber"* the natural-rhythm wait probably works. For *"book the first one"* an interrupt may feel more confident. M3.0d tunes per intent. The image-analysis flow has worked in production for months using essentially the same mechanism, so this is a tuning problem, not a feasibility problem. If tuning fails outright on a specific intent, we narrow that intent's surface (e.g. push it to phone or drawer text) rather than escalating to a brain switchover — the cost of CUSTOM mode is higher than the cost of moving one intent to a different surface.

---

## Future Considerations

### CUSTOM mode revisit (out of M3 scope; documented for future reference)

The CUSTOM-mode fix project is recorded here in case a future-milestone feature genuinely requires it. It is **not** part of M3.

**What the project would entail (estimated 1–2 weeks):**
- Streaming response from OpenAI (don't wait for full text)
- Streaming TTS from ElevenLabs (start audio as text arrives)
- Parallelize: start TTS on first sentence while LLM continues generating
- Fix iOS Safari audio playback path — likely drop `session.repeatAudio()` and use a different injection mechanism that respects iOS autoplay + `getUserMedia()` audio-output locking
- A/B test on real iPhone hardware

**Concrete trigger conditions** (any future feature that hits one of these is the reason to revisit):
1. A vision-anchored feature requires the LLM to invoke a tool chain entirely mid-utterance without yielding to a "let me check" pause (no current M3 feature does this)
2. A feature requires byte-level control over what 6 says — e.g. legally-mandated disclaimer text that must be read verbatim with no LLM paraphrase
3. Real-time multilingual translation mid-utterance (possible M4+ feature)
4. HeyGen leaks our context-injection wrapper text in production at a measurable rate (empirical observation, not a hypothetical — would need to surface from M3.0d testing)

**Until one of those conditions is documented, we do not budget for the CUSTOM-mode work.** The M3 build order assumes FULL mode + context injection is the architecture, and ships the M3 features against that assumption.

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial M3 build order, voice-first per SG Dietz direction | Bert / Claude |
| 2 | SG Dietz green-light 2026-06-04: drop M3.2 video, M3.1 becomes time-boxed spike, add M3.0d voice test-drive checkpoint as first deliverable, reorder procurement section by need-priority | SG Dietz / Bert / Claude |
| 3 | Bert flags 2026-06-05: prior CUSTOM-mode attempt had 5–10 s latency + silent iPhone audio. M3.0a brain pivot deferred to optional Phase 4 spike. Voice-anchored vision features re-routed: M3.6 voice estimates → phone (vision ¶17 implies phone anyway), M3.9 dispute → phone or async text, M3.8 decision-support → drawer text v1. M3.0d test drive now uses intent classifier + AVATAR_SPEAK_TEXT + drawer in FULL mode instead of requiring CUSTOM | Bert / Claude |
| 4 | Bert identified existing context-injection pattern in production at [LiveAvatarSession.tsx:975-978](../apps/demo/src/components/LiveAvatarSession.tsx#L975-L978). Image analysis flow proves that backend results can be fed to HeyGen's FULL-mode brain via wrapped `session.message()` calls. M3.0e refactored from "side-channel parallel" to "detect + inject into brain"; M3.0d test drive flow rewritten to show context-message narration; M3.8 promoted from "drawer text v1" to "voice-on-avatar v1 viable"; CUSTOM-mode Phase 4 spike narrowed to mid-utterance bidirectional tool chains only; added new "Context-Injection Pattern" architectural section above feature breakdowns | Bert / Claude (2026-06-05) |
| 5 | On pressure-test, no M3 feature actually requires CUSTOM mode — the supposed need was either covered by context injection or by the phone-call pipeline. **CUSTOM-mode fix project removed from M3 scope entirely.** Recorded in new "Future Considerations" section with explicit trigger conditions for any future revisit. Q3.0d question + decisions row removed. Risk note #2 rewritten to reflect no CUSTOM dependency anywhere in M3. Voice persona / brain-pivot vendor item replaced with HeyGen Persona / Knowledge Base tuning. Dependency graph + Build Order at a Glance no longer reference Phase 4 | Bert / Claude (2026-06-05) |
