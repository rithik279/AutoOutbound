# FirstShot — Strategy, Moat & Future Plans

_Last updated: 2026-05-24_

---

## What We Are

**FirstShot** is an AI cold email tool for university students hunting internships.

**Core workflow:**
1. Student enters target (internship type, industry, location) + short bio, optional resume upload
2. System hits Apollo API → finds decision-makers (hiring managers, team leads, founders) at target companies
3. AI writes personalized emails in the student's voice, referencing specific company details
4. Emails send from student's real Gmail/Outlook (OAuth — no stored passwords, no spam flags)
5. Student wakes up with outreach already done

**Founder story:** Rithik Singh (first-year, University of Toronto) built it to land his own investment management internship. Classic founder-solves-own-problem. That story IS the marketing.

**Current status:** Free beta. Unlimited sends. No credit card. "Land the interview first — everything else can wait."

**Target users:**
- First/second year undergrads
- Finance (IB, fintech, PE), Tech (SWE, data), Consulting
- No network, no experience, want to reach people they'd never otherwise access

---

## Competitor Analysis

### 1. Sema (try-sema.com)

**What it is:** "ChatGPT for outreach." Chat interface → describe who you want → AI researches + finds + drafts emails → sends from Gmail.

**Pricing:**
| Tier | Price | Limit |
|------|-------|-------|
| Free | $0 | 3 simultaneous drafts, basic research |
| Plus | $9/mo | 10+ bulk drafts, scheduling, deeper research |
| Pro | $20/mo | 5x Plus usage, 10x email volume |

**Their strengths:**
- Frictionless: Google auth, 30s setup
- Persistent memory profile — AI "knows you" across sessions
- Ultra-low price ($9/mo)
- Gmail-native (real inbox = better deliverability)
- University partnerships (Michigan, Ottawa, Carleton, York, UC Riverside, San Jose State, UCSB)
- Open + click tracking
- Email scheduling ("peak engagement")
- 350+ users, solo founder (Khizar Malik)

**Their weaknesses:**
- Chat-based = one target at a time. Not bulk ICP sourcing
- No Apollo-style database integration — "find anyone" means web search on demand, not structured lead lists
- No resume upload / voice matching
- No campaign management (sequences, follow-ups)
- No Outlook — Gmail only
- No team features
- Zero third-party reviews or social proof
- Single founder, tiny team — slow to ship

**Overlap with FirstShot:** High. Same target user (students), same channel (cold email), same pain (manual outreach is slow). **Direct competitor.**

**Where FirstShot beats Sema:**
- Apollo integration = structured lead sourcing at scale, not one-at-a-time chat research
- Resume upload → AI writes in student's actual voice
- Outlook support (Sema = Gmail only)
- Founder story resonates with student users authentically
- Campaign-level thinking vs. session-level chat

**Where Sema beats FirstShot right now:**
- Open/click tracking (they have it, we don't yet)
- Email scheduling (they have it, we have `scheduledAt` infra but no UI)
- University partnerships (7 schools vs. our 0)
- Persistent memory profile across sessions

---

### 2. CoffeedAI (coffeed.ai)

**What it is:** Warm networking CRM for students. "Networking Shouldn't Feel This Hard." Tracks coffee chats, generates follow-up drafts, pre-meeting questions, contact timelines, gamified leaderboard.

**Target user:** Students doing informational interviews and coffee chats — job seekers cultivating warm relationships, not cold outreach.

**Overlap with FirstShot:** Near zero. Different product category. Not a competitor.

**What to steal from them:**
- "Swipe to approve/edit/skip" draft review UX — when we generate 20 personalized emails, card-swipe review is faster than list view
- Progress gamification — "Emails sent: 187 / Interviews booked: 8" could be a motivating dashboard stat for students

---

### 3. The Real Competition

Beyond these two, the actual behavior we compete with is **manual cold email** — Google + LinkedIn + copy-paste + 2 hours of work per 5 emails. That is the incumbent. Every student who does it manually is our addressable market.

Other tools in adjacent space (not student-focused):
- **Instantly.ai** / **Smartlead** — B2B sales teams, $50-200/mo, overkill for students
- **Apollo.io** — lead database + sequences, expensive, complex, not student-friendly
- **Hunter.io** — email finding only, no AI writing, no sending

None of these target students. **The student internship cold email market has no dominant player. FirstShot can own it.**

---

## Our Moat

### Current moat (what we have)
1. **Apollo integration for bulk lead sourcing** — Sema can't do this at scale. Student describes ICP → we return a list of real decision-makers. Sema requires describing one target at a time via chat.
2. **Resume-aware personalization** — AI reads the student's actual resume and writes in their voice. Sema has a "memory profile" but no resume parsing.
3. **Outlook support** — doubles TAM vs. Sema (many university students use Outlook via Microsoft 365 edu licenses)
4. **Founder authenticity** — Rithik built this for himself, landed an internship. That story converts students better than any feature list.

### Moat to build
1. **Network effects via outcomes** — "Students who used FirstShot landed at Goldman, Stripe, McKinsey." Outcome data becomes social proof becomes SEO becomes flywheel. Need to collect this aggressively.
2. **University club partnerships** — Finance clubs, CS clubs, consulting clubs at top schools. One club president endorsement = 200 users. Sema does university partnerships; we should do club partnerships (more targeted, higher trust).
3. **Proprietary outcome data** — If we track reply rates, interview rates, offer rates by industry/company/email style, we can train better personalization than any general-purpose tool. Data flywheel.
4. **Alumni network integration** — Future: "Find alumni at this company who went to your school." Deeply resonant for students, very hard to replicate.

---

## Feature Gap Analysis

### Must build (P0) — Sema has these, we don't

| Feature | Why critical | Effort |
|---------|-------------|--------|
| **Open tracking** (pixel) | Students want to know who read their email | ~1 day |
| **Link click tracking** | Know which links get clicked | ~1 day |
| **Email scheduling** ("send Tuesday 9am") | Peak engagement timing | ~0.5 day (infra exists) |

### Should build (P1) — differentiation

| Feature | Why | Effort |
|---------|-----|--------|
| **Sequence / follow-up automation** | "Send follow-up if no reply in 5 days" — doubles reply rates | ~3 days |
| **Swipe-to-approve draft review** | Faster review of bulk AI drafts (borrow from CoffeedAI UX) | ~2 days |
| **Reply detection → pause sequence** | Stop sending when someone replies | ~1 day |
| **Campaign analytics dashboard** | Open rate, reply rate, bounce rate per campaign | ~2 days |
| **Outcome tracking** | "Did you get an interview?" — builds social proof data | ~1 day |

### Nice to have (P2) — future moat

| Feature | Why |
|---------|-----|
| Alumni finder | "Find [Your School] alums at Goldman" — massive student resonance |
| University club dashboard | Bulk onboard club members, shared templates |
| LinkedIn integration | Find contacts without Apollo for students who can't afford API |
| A/B testing on subject lines | Optimize over time with data |
| Mobile app | Students live on phones |

---

## Go-To-Market Strategy

### Phase 1: University clubs (now → 3 months)
- Target finance/CS/consulting clubs at UofT, Waterloo, Western, McGill, UBC, Queen's
- Offer club presidents: "Free tool for all your members, plus outcome data for your club"
- One finance club = 100-500 potential users
- Cost: $0. Just Rithik's time + his existing network

### Phase 2: Outcome-driven content (1-3 months)
- Document every successful internship landed via FirstShot
- "How I cold emailed my way to a Goldman internship using AI" — every student clicks this
- Post on Reddit (r/FinancialCareers, r/cscareerquestions, r/IBO), TikTok, LinkedIn
- SEO: "cold email internship template," "how to cold email for internship," "internship cold email that works"

### Phase 3: Pricing (post-beta, ~3 months out)
- Free: 10 emails/month (enough to try, not enough to rely on)
- Student: $9/mo — matches Sema, justified by Apollo sourcing + sequences
- Club/group: $29/mo for 5 seats — club treasuries will pay this

### Positioning
**Against Sema:** "Sema helps you email one person. FirstShot finds your whole target list and emails all of them."
**Against manual:** "Stop spending 2 hours for 5 emails. FirstShot does 50 in 5 minutes."
**Hero statement:** "The tool that got Rithik his internship. Now it can get you yours."

---

## Immediate Next Steps (this week)

1. **Open + click tracking** — build tracking pixel + redirect routes (1 day)
2. **Email scheduling UI** — surface `scheduledAt` in frontend, suggest optimal times (0.5 day)
3. **Outcome tracking prompt** — after emails send, ask "Did you hear back?" to build data (0.5 day)
4. **University club outreach** — Rithik emails 5 club presidents this week (0 dev time)
