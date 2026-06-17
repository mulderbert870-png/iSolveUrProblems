# iSolveUrProblems — Milestone 3 Delivery

> Date marked code-complete: 2026-06-15
> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`
> Companion docs: [ROADMAP.md](ROADMAP.md), [M3-BUILD-ORDER.md](M3-BUILD-ORDER.md), [M2-DELIVERY.md](M2-DELIVERY.md), [M1-DELIVERY.md](M1-DELIVERY.md)

This document tells you:

1. What shipped in M3 — every vision-anchored feature, file paths, where to look.
2. **How to test the full contractor-hiring workflow end-to-end** — the playbook G uses to validate every M1/M2/M3 feature in one integrated flow.
3. **What is needed to make this production-ready** — vendor procurement, legal, security, monitoring, and deploy hardening.

---

## TL;DR

**Every M3 feature is code-complete.** Typecheck green, no unstaged work blocking, ready for QA against the integrated hire-contractor workflow. The avatar UI stays in FULL mode (HeyGen's native low-latency pipeline); voice-driven features fire via the context-injection pattern on the drawer or via the phone-call pipeline.

A homeowner can now (end-to-end):

- Ask 6 *"find me a plumber"* and get ranked candidates with reviews + sentiment-tuned summaries (M1, M2.1, M2.2, M2.3, M2.4)
- *"I can't decide between these two"* — opens a side-by-side compare panel that re-ranks live as constraints change (**M3.8**)
- *"Call the plumber"* — a 3-way phone call is bridged with 6 as an active participant who speaks back into the conference when addressed by name (**M3.1**, **Q3.1c**)
- The call is recorded; both sides' speech is transcribed and indexed (**M3.3**)
- *"Make me an estimate"* extracts line items from the call transcript (**M3.6**)
- *"Turn it into a contract"* drafts a work agreement, dispatches it via Dropbox Sign or our mock provider (**M3.7**)
- *"Schedule the work for next Tuesday"* lands an appointment; 24-hour and 2-hour reminders fire via the M1.7 notifications fabric (**M3.4 + M3.5**)
- If something goes wrong, *"I want to file a complaint"* opens a mediator-driven async-text dispute thread; 6 brokers a remedy or escalates to a human admin per the **Q3.9a** rules (**M3.9**)
- All of the above, voice-driven on the home screen — no form-driven page in the critical path.

**The hire-contractor workflow is the integrated test of M1+M2+M3 in one flow** — Section 2 below is G's step-by-step playbook.

---

## Configuration items needed before launch

| # | Item | Lead time | Blocks |
|---|---|---|---|
| 1 | Run the 4 new M3 migrations (Section 1.A) | 5 min | Everything M3 |
| 2 | Create Supabase Storage bucket `call-recordings` (**PRIVATE** — toggle "Public bucket" OFF; signed URLs are issued on demand) | 2 min | M3.3 |
| 3 | Buy Twilio Voice phone number + set `TWILIO_VOICE_FROM_NUMBER` | Same day | M3.1, M3.3, M3.6 |
| 4 | Set `APP_PUBLIC_BASE_URL` (deployed domain or ngrok tunnel) | 1 min | M3.1 phone calls |
| 5 | **Verify Resend sender domain** `isolveurproblems.ai` | 1–3 days | M1.7 email (already breaks today; see Section 4) |
| 6 | Configure Dropbox Sign sandbox + set `DROPBOX_SIGN_API_KEY` | Same day; prod 3–5 days | M3.7 prod e-sign (mock provider works without it) |
| 7 | Set `ADMIN_ESCALATION_SLACK_WEBHOOK_URL` or `ADMIN_ESCALATION_EMAIL` | 5 min | M3.9 admin handoff visibility |
| 8 | Vercel cron already configured in `vercel.json` (`*/15 * * * *` on `/api/cron/appointment-reminders`) — verify it's enabled in the Vercel dashboard after deploy | 1 min | M3.5 reminders firing |
| 9 | Google OAuth verification (calendar sync) | 1–4 weeks | M3.4 prod-grade (works without — uses our own calendar table for now) |

Once items 1–4 are done, the **full hire-contractor workflow tests end-to-end on Stripe TEST keys with mock contractors** — items 5–9 only matter for going live.

---

## Part 2 — End-to-End Hire-Contractor Workflow

This is the playbook G runs to verify every M1/M2/M3 feature is alive. Each step lists:

- **Do:** what to click / say in the app
- **Expect:** what should be visible
- **Verify:** a backend check (SQL query, log line, or DB row) confirming the side-effect

All vision-doc anchors reference the source vision document.

### Step 0 — Seed mock data

Mock contractors don't exist by default. Seed a metro:

```powershell
$secret = (Get-Content apps/demo/.env | Select-String "ADMIN_SECRET" | ForEach-Object { ($_ -split "=", 2)[1] })
Invoke-RestMethod `
  -Uri "http://localhost:3001/api/admin/contractors/seed" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $secret"; "Content-Type" = "application/json" } `
  -Body '{ "metro": "austin", "category": "plumber" }'
```

Verify in Supabase: `select count(*) from contractors where 'plumber' = any(categories);` should return ~25–50.

**Test-contractor phone numbers:** the mock seeder fills in `+15125550100`-style numbers. For M3.1 to actually dial a real human, **update one mock contractor's phone column** to a number you control (a Twilio test number or your own cell):

```sql
update contractors
set phone = '+15555551234'   -- your phone in E.164
where slug = 'austin-plumber-1';
```

### Step 1 — Sign in as homeowner

**Do:**
- Open `http://localhost:3001/en/auth/sign-in`
- Enter your email
- Check email for the magic link, click

**Expect:** redirected to home; the avatar mounts and starts greeting you.

**Verify:** in Supabase `select id, email from public.users order by created_at desc limit 1;` shows your row. M1 auth + memory facts table is live.

**Anchored to:** M1 auth (Q1.3).

### Step 2 — Search for a contractor

**Do:** Talk to 6: *"Find me a plumber in Austin."*
Or use the form fallback at `/en/contractors`.

**Expect:** The right-side drawer flips open showing **Contractors** variant — a ranked list of 5+ contractors with star rating, distance in km, locally-owned / same-day badges. 6 narrates the top pick by name + reason.

**Verify:**
- `select method, request_path from public.media_events order by created_at desc limit 5;` shows a hit on `/api/contractors/search`.
- The drawer card IDs match `select id, name from contractors order by rating_avg desc limit 5;`.

**Anchored to:** Vision ¶10, M2.1 search + M2.4 ranking, M3.0e voice intent (`find_contractor`).

### Step 3 — Read review summary

**Do:** Say *"Tell me more about the first one"* OR click a contractor card → **Details**.

**Expect:** Drawer flips to **Review summary** variant: 1-paragraph synthesis + Strengths list + Watch-outs list + 2-3 sample quotes.

**Verify:** `select contractor_id, length(summary), updated_at from contractor_summaries order by updated_at desc limit 1;` shows a fresh row. First call generates via OpenAI; subsequent calls hit the cache (the panel shows "Cached").

**Anchored to:** Vision ¶11, M2.3 review summarization, M3.0e intent (`tell_me_more`).

### Step 4 — Compare picks (deliberation)

**Do:** Say *"I can't decide between these two"*.

**Expect:** Drawer flips to **Compare** variant with 2-3 picks side-by-side, each with a differentiator headline.

**Do:** Refine — say *"Only locally-owned ones"* or *"Closer than 5 km"*.

**Expect:** The panel re-renders with the new constraint applied; 6 narrates the change.

**Verify:** `select session_id, text from transcripts where speaker='user' order by created_at desc limit 5;` shows your refinement turns. The intent classifier logged `deliberate_refine` matches.

**Anchored to:** Vision ¶18, M3.8 decision support.

### Step 5 (Optional) — Place a 3-way phone call

> **Skip this if `TWILIO_VOICE_FROM_NUMBER` and `APP_PUBLIC_BASE_URL` aren't set yet.** The endpoint returns 503 cleanly when env is missing.

**Do:** Add your phone to your user row first (E.164 format):

```sql
update public.users set phone = '+15555551234' where id = auth.uid();
```

Then say *"Call the first one"*.

**Expect:**
- The drawer flips to **Live phone call** variant showing "Dialing" status.
- Your phone rings; the mock contractor's phone rings (or, if you set one to a real number, that rings too).
- When both answer, the panel transitions to "On the call" and a live transcript starts streaming in.
- Mid-call, say *"Hey 6, what's the warranty on this work?"* — 6 should speak back into the conference (audible to both parties).

**Verify:**
- `select id, status, twilio_conference_sid, started_at from calls order by created_at desc limit 1;` shows `in_progress` with a conference SID.
- `select speaker, text from transcripts where session_id = '<call-id>' order by created_at;` shows interleaved `user` / `contractor` / `six` lines.

**Hang up the call** — click "Hang up" or end both legs. Within ~30 seconds:

- `status` flips to `completed`
- `storage_recording_path` populates (Twilio recording is mirrored to Supabase Storage)
- A signed URL is available via GET `/api/calls/<id>`

**Anchored to:** Vision ¶13 (3-way call), Vision ¶15 (recording), M3.1 phone calls (Q3.1c wake-word), M3.3 recording + transcript index.

### Step 6 — Generate a voice estimate

> Skip if you skipped Step 5 (needs a transcript with the contractor talking about prices).

**Do:** After the call ends, say *"Make me an estimate."*

**Expect:** Drawer flips to **Voice estimate** variant — line-item breakdown extracted by LLM from the transcript, with quantity, unit price, totals.

**Verify:** `select id, scope_summary, jsonb_array_length(line_items), total_cents from estimates order by created_at desc limit 1;`

**Anchored to:** Vision ¶17 (*"help estimate projects ... as the contractor drives down the road"*), M3.6 estimate generator (Q3.6a fixed JSON schema, Q3.6b contractor-spoken prices).

### Step 7 — Schedule an appointment

**Do:** Say *"Schedule the work for tomorrow at 10 AM"* OR *"Book it for Thursday at 2 PM."*

**Expect:** Drawer flips to **Appointments** variant — a single confirmation card with day + time + agenda. 6 confirms verbally.

**Verify:**
- `select id, scheduled_at, status, contractor_id from appointments order by created_at desc limit 1;` shows `status='scheduled'`.
- The natural-language parsing handles "tomorrow", "next Tuesday", "Thursday at 2pm", "in 2 hours", and ISO timestamps.

**Anchored to:** Vision ¶14, M3.4 appointments.

### Step 8 — Hire and pay (Stripe Checkout)

**Do:** Say *"Hire them"* OR *"Book them"* OR *"I'll go with them"*.
OR from the contractor card click **Hire & Pay**.

**Expect:**
- A pop-up to Stripe Checkout (test mode) opens.
- Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
- Stripe redirects back to `/checkout/<contract_id>?ok=1`.
- Within ~5 seconds the panel updates to "Notifications sent" with the winner + losers + delivery channels.

**Verify:**
- `select id, status, amount_cents, platform_fee_cents from contracts order by created_at desc limit 1;` — `status='paid'`, fee = 5% of amount (server-computed; never trusted from the client per M2 security).
- `select template_id, status, channel from notifications_sent order by created_at desc limit 10;` — see `contractor.win.v1` (1 row) + `contractor.lose.v1` (N rows for other candidates).

**Anchored to:** Vision ¶19 (win/lose notifications), Vision ¶21 (5% platform fee, "Walmart model"), M2.5 Stripe Connect + M2.6 fan-out.

### Step 9 — Draft and e-sign the work agreement

**Do:** Say *"Draft the contract for the water heater installation for $1,200"*. (Substitute scope and amount as appropriate.)

**Expect:** Drawer flips to **Work agreement** variant showing:
- Contractor name, scope, total, platform fee
- Envelope status — `Signed` if `ESIGN_PROVIDER=mock`, `Awaiting signature` if `dropbox_sign`
- "Review & sign your copy" CTA link

**Verify:**
- `select id, esign_provider, esign_envelope_status, esign_envelope_id from contracts where esign_envelope_id is not null order by updated_at desc limit 1;` — provider matches your env switch.
- For Dropbox Sign: an actual signing email lands in the homeowner + contractor email inbox; clicking + completing the signing flow fires the `signature_request_signed` webhook → `/api/webhooks/esign/dropbox_sign` → HMAC verified → `esign_envelope_status` updates to `signed`.

**Anchored to:** Vision ¶17 (*"write up contracts ... deliver in writing in their email box"*), M3.7 contract drafter (Q3.7a Dropbox Sign, Q3.7b single generic template).

### Step 10 — Wait for the reminder

**Do:** Set up a fake near-future appointment to trigger the 24-hour or 2-hour reminder window:

```sql
update appointments
set scheduled_at = now() + interval '2 hours' + interval '1 minute',
    reminder_2h_sent_at = null
where id = '<id from step 7>';
```

Then hit the cron route manually (also runs on Vercel cron every 15 min):

```powershell
$cronSecret = (Get-Content apps/demo/.env | Select-String "CRON_SECRET" | ForEach-Object { ($_ -split "=", 2)[1] })
Invoke-RestMethod `
  -Uri "http://localhost:3001/api/cron/appointment-reminders" `
  -Headers @{ "Authorization" = "Bearer $cronSecret" }
```

**Expect:** The route returns `{ "sent_24h": N, "sent_2h": M }` with counts.

**Verify:**
- Email/SMS reminder lands at your homeowner inbox/phone.
- `select reminder_2h_sent_at from appointments where id = '<id>';` is no longer null.
- Re-running the cron is idempotent — second run sends nothing for the same appointment.

**Anchored to:** Vision ¶14 (*"before meetings ... 6 will message both parties to make sure they'll be on time"*), M3.5 reminders.

### Step 11 (Optional) — File a dispute

**Do:** Say *"I want to file a complaint, the plumber charged me $700 but only did half the work."*

**Expect:** Drawer flips to **Dispute thread** variant:
- Your complaint at the top
- 6's opening mediator reply (LLM-generated, neutral, calm)
- Status: `Awaiting your reply` — **OR** `Escalated to human` if the $700 disputed amount tripped the >$500 Q3.9a rule

**Do:** Reply *"They charged $700 but did only half the work"* in the textarea.

**Expect:** 6 responds with a remedy proposal (partial refund, redo work, or escalate to a human).

If 6 proposes a remedy: click **Accept this remedy** OR **Get a human**.

**Verify:**
- `select id, status, mediator_turn_count, resolution_kind from disputes order by created_at desc limit 1;`
- If escalated AND `ADMIN_ESCALATION_SLACK_WEBHOOK_URL` is set: a Slack message lands in the admin channel with red-light emoji, complaint, dollar amount, dispute ID, and a deep-link to the thread.
- If escalated AND `ADMIN_ESCALATION_EMAIL` is set: an HTML email lands in the admin inbox with the same content.

**Anchored to:** Vision ¶16 (*"6 will be the front line for disputes"*), M3.9 dispute mediator + Q3.9a escalation rules (3-strike, > $500, or "I want a person").

---

### What the workflow proves

Completing Steps 1–11 exercises **every milestone**:

| Milestone | Features exercised |
|---|---|
| M1 | Auth (Step 1), notifications fabric (Steps 8 + 10), preference resolver, memory facts, i18n routing |
| M2 | Contractor search (Step 2), review summarization (Step 3), recommendation/ranking, Stripe Connect + Checkout (Step 8), win/lose fan-out, webhook signature verification |
| M3.0 | Drawer + intent classifier + transcript wiring + context injection (every step touches it) |
| M3.1 | Phone call (Step 5) |
| M3.3 | Recording + transcript (Step 5) |
| M3.4 | Appointments (Step 7) |
| M3.5 | Reminders cron (Step 10) |
| M3.6 | Voice estimate (Step 6) |
| M3.7 | Contract drafter + e-sign (Step 9) |
| M3.8 | Deliberation / compare (Step 4) |
| M3.9 | Dispute mediator + admin escalation (Step 11) |

The only path NOT exercised by the hire workflow is M1.5 fix-it reports (a separate user-initiated flow available at `/<locale>/reports/[id]`).



## Source-vision-to-feature anchor map

For SG Dietz's audit cross-check — every M3 feature points at a vision-doc paragraph:

| Vision paragraph | Feature | Code |
|---|---|---|
| ¶10 — search + ranking | M2.1, M2.2, M2.4 | `src/lib/contractors/{search,recommend,rank}.ts` |
| ¶11 — review summary | M2.3 | `src/lib/contractors/summarize.ts` |
| ¶13 — 3-way call | M3.1 | `app/api/calls/start/route.ts`, `app/api/webhooks/twilio/*` |
| ¶14 — appointment reminders | M3.4 + M3.5 | `src/lib/appointments/*`, `app/api/cron/appointment-reminders/route.ts` |
| ¶15 — recording & transcript | M3.3 | `app/api/webhooks/twilio/recording/route.ts`, `src/lib/calls/recordings.ts` |
| ¶16 — dispute mediation | M3.9 | `src/lib/disputes/*`, `app/api/disputes/*` |
| ¶17 — voice estimate + contract delivery | M3.6 + M3.7 | `src/lib/calls/estimateExtractor.ts`, `src/lib/esign/*`, `app/api/contracts/draft/route.ts` |
| ¶18 — decision support | M3.8 | `src/lib/contractors/deliberate.ts`, `src/components/AssistantSurface/ComparePanel.tsx` |
| ¶19 — win/lose notifications | M2.6 | `src/lib/contractors/fanOut.ts` + M1.7 templates |
| ¶21 — 5% platform fee ("Walmart model") | M2.5 | `app/api/secrets.ts` `PLATFORM_FEE_PERCENT`, `src/lib/payments/store.ts` `computePlatformFeeCents` |

---

## Sign-off

M3 is code-complete on `main`. The hire-contractor workflow is the integrated test of every M1+M2+M3 vision feature in one flow; Part 2 above is G's playbook.

**Before transacting real money:** complete Section 3.A (vendor procurement) item 5 (Stripe Connect KYC), Section 3.B (legal review of contract template + recording consent + ToS/Privacy text), and Section 3.C unfinished items (Twilio webhook signature verification, recording consent preamble).

**Before promising 100% uptime:** complete Section 3.E (monitoring) — add Sentry + cron health alerts at minimum.

Everything else is iteration on top of a green codebase.
