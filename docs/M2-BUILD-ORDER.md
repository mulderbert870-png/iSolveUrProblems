# Milestone 2 — Build Order

> Companion to [ROADMAP.md](ROADMAP.md). Scope-only. No timelines.
> Goal of M2: **revenue on.** A homeowner asks 6 to find a contractor, 6 returns ranked vetted candidates, the homeowner picks one, and iSolveUrProblems takes a cut on the contract.
> Source vision: `20260326-iSolveUrProblems-LASTB4MOVE2DROPBOX.docx`

This doc has two audiences:
- **The dev team** — uses the per-feature sub-task lists and dependency graph to build M2.
- **SG Dietz** — uses the "Decisions Required" and "What SG Dietz Must Provide" sections to unblock the build.

Every entry below is grounded in the source vision doc.

---

## What M2 Delivers

The 6 features below are everything M2 ships. Each is anchored to a paragraph in the vision doc.

| # | Feature | Vision anchor |
|---|---|---|
| M2.1 | Contractor scraping engine | ¶9 — *"the iSolve backend agents begin scraping the internet"* |
| M2.2 | Preference-tuned search (price / locality / same-day / ≥4.5⭐) | ¶10 — *"Price? Same day service? Locally owned business? 4.5 rated or higher?"* |
| M2.3 | Review summarizer + strengths/weaknesses synthesizer | ¶11 — *"summarize their reviews, strengths and weaknesses"* |
| M2.4 | 6's contractor recommendation engine | ¶11 — *"make recommendations on which contractors he prefers"* |
| M2.5 | Payments + platform cut + payouts | ¶21 — *"iSolve makes a cut of every contract"* |
| M2.6 | Win / lose contractor notifications + feedback loop | ¶19 — *"6 can deliver the news to the contractors that win the projects, and those that do not… give them feedback"* |

**M2 Exit criteria:** First 10 real homeowners hire a contractor through the system; first revenue cut paid out.

---

## Build Order at a Glance

Numbered steps are sequential; lettered items within a number can run in parallel.

| Step | Feature | Why this position |
|---|---|---|
| **0a** | Stripe Connect platform account kick-off | KYC takes 3–5 business days. Start day 1 so M2.5 isn't blocked later. |
| **0b** | Contractor data source decision (SerpAPI subscription vs self-host) | Decision unlocks M2.1 implementation choice |
| **1** | M2.1 Contractor scraping engine | Foundation — everything else needs the data |
| **2** | M2.2 Preference-tuned search | Lets the conversation surface candidates |
| **3** | M2.3 Review summarizer | Per-contractor enrichment; runs as background job after scrape |
| **4** | M2.4 Recommendation engine | Thin ranking layer on top of M2.2 + M2.3 |
| **5** | M2.5 Payments + platform cut + payouts | Needs Stripe Connect onboarded by now |
| **6** | M2.6 Win/lose contractor notifications | Reuses M1.7 notifications fabric — small, lands last |

---

## Dependency Graph

```
M2.1 Scraping ─────────────┬─→ M2.2 Search ─┐
                           │                ├─→ M2.4 Recommendation
                           └─→ M2.3 Summarizer ─┘

M2.4 Recommendation ─→ user picks contractor ─→ M2.5 Payments + cut
                                                       │
                                                       └─→ M2.6 Win/lose notification
```

---

## M2.1 — Contractor Scraping Engine

### Sub-tasks
1. Confirm data source decision (Q2.1a)
2. Migration: `contractors` table (id, source, source_id, name, address, city, state, zip, lat, lng, phone, website, categories[], rating_avg, rating_count, price_tier, licensed_flag, last_seen_at, scraped_payload jsonb)
3. Migration: `contractor_reviews` table (id, contractor_id, source, source_review_id, rating, body, reviewer_name, reviewed_at, scraped_payload jsonb)
4. Migration: `contractor_categories` lookup table (handyman, plumber, electrician, hvac, landscaping, etc.)
5. Source adapter for the chosen provider (e.g. `src/lib/contractors/sources/serpapi.ts`)
6. Scheduled background job to refresh contractors per metro per category (Supabase Edge Function on cron, or pg-cron, or Vercel Cron)
7. Dedupe logic — same contractor across sources (match on phone + address)

### Files touched
- **New:** migration files; `src/lib/contractors/{types,sources,dedupe,refresh}.ts`; an admin/cron endpoint
- **Modified:** none in app surface yet

---

## M2.2 — Preference-Tuned Search

### Sub-tasks
1. Decide UI surface (Q2.2b — inline-in-chat vs dedicated page)
2. PostGIS extension on Supabase for geo distance (or Haversine in SQL — Q2.2a)
3. API route: `POST /api/contractors/search` accepting `{ category, near_zip_or_latlng, max_distance_km, price_tier?, min_rating?, locally_owned?, same_day? }`
4. Search query: SQL ORDER BY composite score (distance + rating + matched filters); return top 20
5. Conversational integration — when user asks "find me a plumber", 6 fills in defaults (category from user text, location from user profile / memory facts) and calls the search route
6. Results UI — card list with name, distance, rating, summary (from M2.3 when ready), "tell me more" / "pick this one" actions

### Files touched
- **New:** `src/lib/contractors/search.ts`; `app/api/contractors/search/route.ts`; possibly `app/[locale]/contractors/page.tsx`
- **Modified:** `openai-chat-complete/route.ts` — function-calling tool for contractor search

---

## M2.3 — Review Summarizer + Strengths/Weaknesses

### Sub-tasks
1. Migration: `contractor_summaries` (contractor_id PK, summary, strengths_md, weaknesses_md, sample_quotes jsonb, model, updated_at)
2. Background worker — for each contractor with ≥5 unsummarized reviews, run `gpt-4o-mini` (JSON mode) over the review corpus → structured summary
3. Cache invalidation — refresh when ≥5 new reviews come in OR every 30 days
4. Expose via `GET /api/contractors/[id]` along with the contractor base record

### Files touched
- **New:** `src/lib/contractors/summarize.ts`; migration; worker invocation in the same cron as M2.1 refresh

---

## M2.4 — 6's Recommendation Engine

### Sub-tasks
1. Ranking function — takes the user's preferences (Q2.4a weights) + the top-N candidates from M2.2 → returns ranked top-3 with a 1-line reason per pick
2. Personalization layer — read M1.2 memory facts for the user (e.g. "user is price-sensitive", "user prefers locally-owned") and adjust weights
3. Conversational integration — when user says "which one should I pick?", 6 calls the recommender and explains its top pick in natural language
4. Decision-support follow-up loop — user objects ("not that one, too far"), 6 re-ranks with the new constraint

### Files touched
- **New:** `src/lib/contractors/recommend.ts`
- **Modified:** `openai-chat-complete/route.ts` — function-calling tool for recommendation

---

## M2.5 — Payments + Platform Cut + Payouts

### Sub-tasks
1. Decide Stripe Connect flavor (Q2.5a)
2. Contractor onboarding flow — `/contractor/onboarding/[id]` redirects to Stripe-hosted onboarding; webhook receives `account.updated` and flips `contractors.payouts_enabled`
3. Migration: `contracts` table (id, user_id, contractor_id, session_id, amount_cents, currency, platform_fee_cents, status enum, stripe_payment_intent_id, stripe_transfer_id, created_at)
4. API route: `POST /api/contracts/create` — creates a Stripe PaymentIntent with `application_fee_amount` (the platform cut)
5. Webhook: `/api/webhooks/stripe` — handles `payment_intent.succeeded` (mark contract paid + trigger transfer), `account.updated` (sync contractor onboarding status), `payout.paid`
6. UI: contract acceptance flow inside the report viewer — homeowner sees the estimate, clicks "Accept & Pay", Stripe Checkout opens, contract is created
7. Admin override route (refund / cancel) — manual for v1

### Files touched
- **New:** migration; `src/lib/payments/{stripe,types}.ts`; `app/api/contracts/create/route.ts`; `app/api/webhooks/stripe/route.ts`; contractor onboarding pages
- **Modified:** `secrets.ts` (add Stripe envs)

---

## M2.6 — Win / Lose Contractor Notifications + Feedback

### Sub-tasks
1. New templates: `contractor.win.v1` (email + SMS) and `contractor.lose.v1` (email + SMS, with feedback)
2. Trigger: when a contract row is created (M2.5), the chosen contractor gets the win notification AND every other contractor in the candidate set gets the lose notification
3. LLM-generated lose-feedback — "Here's why you weren't picked, and how to win more next time" — short, friendly, actionable
4. All deliveries flow through the existing M1.7 notifications fabric — no new infrastructure

### Files touched
- **New:** `src/lib/notifications/templates/contractor-win.ts`, `contractor-lose.ts`
- **Modified:** template registry `index.ts`; trigger hook in the contract-create route

---

## 🔧 Design Questions to Answer Before Coding

These are the choices that ripple if we guess wrong. They map 1:1 to the "What SG Dietz Must Provide" section that follows.

### M2.1 — Scraping
- **Q2.1a — Build or buy contractor data?**
  - Options: (a) Subscribe to **SerpAPI** ($50–500/mo depending on volume — ToS-clean, immediate), (b) Subscribe to **Outscraper** or **Apify** (similar pricing, more flexibility), (c) Build our own scrapers (free upfront, legally fragile, ongoing maintenance — Google + Yelp explicitly prohibit scraping).
  - **Recommendation:** **(a) SerpAPI** for v1. De-risks the single biggest schedule item. Can swap to self-host later if economics demand.
- **Q2.1b — Launch source set:**
  - Options: just **Google Maps**, OR Google Maps + Yelp, OR all five (Google + Yelp + BBB + Angi + Thumbtack).
  - **Recommendation:** **Google Maps only for v1.** Largest single source, lowest cost. Add Yelp in v1.1.
- **Q2.1c — Geographic launch scope:**
  - Options: US-wide, single metro (which one?), multiple metros.
  - **Recommendation:** **Single metro** (whichever city you'd run your first 10 homeowner pilots in). Lets us tune ranking before going wide.
- **Q2.1d — Refresh cadence:**
  - Options: hourly, daily, weekly.
  - **Recommendation:** **Weekly** background job. Contractor records change slowly.

### M2.2 — Search
- **Q2.2a — Geo distance:**
  - Options: PostGIS extension on Supabase OR plain SQL Haversine.
  - **Recommendation:** **Plain Haversine SQL** for v1. PostGIS adds complexity; Haversine is fine up to ~100k contractors.
- **Q2.2b — UI surface:**
  - Options: (a) conversational-only ("hey 6, find me a plumber" → 6 lists results inline), (b) dedicated search page, (c) both.
  - **Recommendation:** **(a) conversational only** for v1. Matches vision ¶8 ("ask if they'd like some help… he's capable of sourcing contractors"). A dedicated page can come later.

### M2.3 — Review summarizer
- **Q2.3a — Model + caching:**
  - Options: `gpt-4o-mini` (cheap) or `gpt-4o` (better quality, ~10× cost).
  - **Recommendation:** **`gpt-4o-mini`** + refresh every 30 days or when 5+ new reviews arrive. ~$0.005 per summary, ~$50 to summarize 10k contractors.

### M2.4 — Recommendation
- **Q2.4a — Ranking signal weights:**
  - Options to weight: rating, review sentiment (from M2.3), distance, price tier, licensed-status, same-day availability, response time.
  - **Recommendation:** **rating × 0.35, review sentiment × 0.25, distance × 0.20, price match × 0.10, licensed × 0.10.** Tune from user feedback.
- **Q2.4b — Personalization:**
  - Use M1.2 memory facts (e.g. user previously said "I prefer locally-owned")?
  - **Recommendation:** **Yes.** It's the payoff for the memory infrastructure we built in M1.

### M2.5 — Payments
- **Q2.5a — Stripe Connect flavor:**
  - Options:
    - **Standard** — contractors create their own Stripe account, log into Stripe dashboard themselves
    - **Express** — minimal onboarding form hosted by Stripe; contractors get a stripped-down Express dashboard
    - **Custom** — we host everything; most work for us, most control
  - **Recommendation:** **Express.** Best balance — contractors do 5 minutes of onboarding, we don't have to build a Stripe dashboard, payouts work out of the box.
- **Q2.5b — When is the cut taken:**
  - Options: at job acceptance (homeowner pays upfront), at completion (escrow), or per-milestone.
  - **Recommendation:** **At job acceptance with manual release** for v1. Simplest. Escrow / milestones come later when volume justifies the complexity.
- **Q2.5c — Platform fee percentage:**
  - Vision ¶22 says "Walmart model — razor-thin margins."
  - Common reference points: Angi takes 20–30%, Thumbtack ~$5–60 per lead, Stripe Connect platform fees typically 1.5–15%.
  - **Recommendation:** **5% platform fee** as v1 floor. Lower than competitors, signals the "Walmart model" position, leaves room to test 3% / 7% / 10% later.
- **Q2.5d — Currency / region:**
  - Options: USD only, USD + CAD, USD + EUR, etc.
  - **Recommendation:** **USD only** for v1. Stripe Connect supports more later with minimal code.

### M2.6 — Win/lose notifications
- **Q2.6a — Lose-message tone:**
  - Vision ¶19 says "always in a friendly, warm manner."
  - **Recommendation:** Pre-approve a template body: *"Hey {name}, this one went to another contractor — here's why: {reason}. We'd love to help you win more next time — here are 2 quick wins for your profile: {tips}."*

---

## 📋 What SG Dietz Must Provide

This is the operational checklist — items only SG Dietz (or someone with his authority) can do. **Order is roughly day-1 priority first.**

### Day 1 — Kick off these immediately (lead time blocks later work)

1. **Stripe account → enable Connect**
   - Sign in to (or create) the Stripe account
   - Apply for **Connect** under "Settings → Connect"
   - Submit business verification documents (legal entity, EIN, business address, owner info)
   - **Lead time:** 3–5 business days for KYC
   - **Hand off:** the resulting `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET` (we'll register the webhook URL after first deploy)

2. **Decision: Q2.1a — data source for contractors**
   - SerpAPI is the recommended path. Sign up at [serpapi.com](https://serpapi.com)
   - Pick a plan — starts at $50/mo for 5k searches; ~$250/mo gets us 50k searches which is ~50 metros monthly refresh
   - **Hand off:** `SERPAPI_API_KEY`

3. **Decision: Q2.5c — platform fee percentage**
   - Recommended starting point: **5%**
   - Tell us a number; we hard-code it in the contract-create route. Trivial to change later.

### Decisions needed before each feature starts

| Decision | When needed | Recommendation |
|---|---|---|
| Q2.1b — launch source set | Before M2.1 codes | Google Maps only for v1 |
| Q2.1c — geographic scope | Before M2.1 codes | One metro you'll pilot in (which one?) |
| Q2.5a — Stripe Connect flavor | Before M2.5 codes | Express |
| Q2.6a — lose-message tone | Before M2.6 codes | Friendly, with 2 actionable tips |

### Vendor / contract items

1. **Confirm legal entity is set up to accept payments** — if iSolveUrProblems isn't yet incorporated, that needs to happen before Stripe KYC clears.
2. **Tax IDs / W-9 / 1099 handling** — when you start paying contractors >$600/year, you must issue 1099s. Stripe Express handles the 1099 forms automatically if you use their tax-form feature ($2.50 per form). Confirm we should enable it.
3. **Terms of Service for contractors** — when contractors onboard via Stripe Express, they accept Stripe's terms. But we also need our own platform ToS (commission %, payout schedule, refund policy, dispute process). Bert can draft a stub but you'll want a lawyer review before launch.
4. **Sales pilot list** — who are the first 10 homeowner pilots? (Friends and family count.) Required to satisfy the M2 exit criteria.

### Budget heads-up (monthly approximate, low-volume v1)

| Item | Est. cost |
|---|---|
| SerpAPI subscription | $50 – $250 |
| Stripe processing fees | 2.9% + $0.30 per successful charge (deducted from each transaction, not a flat cost) |
| Stripe Express 1099 forms | $2.50 per contractor per year |
| OpenAI for review summaries | ~$50 one-time for 10k contractors + ~$5/mo ongoing |
| Twilio (already running from M1) | unchanged |
| Resend (already running from M1) | unchanged |
| Vercel / Supabase (already running) | unchanged |
| **New M2 cost floor** | **~$100 – $300/mo** |

Plus per-transaction Stripe fees (2.9% + $0.30) on every contract — those come out of the gross, not a budget line.

---

## ✅ Definition of Done for M2

Roadmap exit criteria: **First 10 real homeowners hire a contractor through the system; first revenue cut paid out.**

Concretely:
- [ ] A homeowner can ask 6 *"find me a plumber"* → 6 returns 3 ranked candidates with summaries
- [ ] Each candidate card shows name, distance, rating, strengths, sample review quotes
- [ ] Homeowner picks one → contract is created → Stripe Checkout completes → contractor receives payout minus platform fee
- [ ] The chosen contractor gets a friendly win notification (email + SMS via M1.7 fabric)
- [ ] The other candidates get a friendly lose notification with feedback tips
- [ ] In Supabase: `contracts` row shows `status=paid`, `platform_fee_cents > 0`, `stripe_transfer_id` populated
- [ ] At least 10 such end-to-end flows complete with real (or pilot-real) homeowners and contractors

---

## Change Log

| Entry | Change | By |
|---|---|---|
| 1 | Initial M2 build order | Bert / Claude |
