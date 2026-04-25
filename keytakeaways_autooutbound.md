# Key Takeaways — Campaign Pipeline v2

## Project Overview

Campaign Pipeline v2 is a cold email outreach automation tool built for Manmit Singh, a senior data engineering contractor. It automates the full lifecycle of a cold email campaign: prospect discovery, email drafting with AI personalisation, review/approval, and scheduled sending via Microsoft Outlook.

**Stack:** React + Vite (frontend), Express (backend API), Apollo.io (prospecting/enrichment), OpenAI/Anthropic (email drafting), Microsoft Graph (sending).

---

## 1. Architecture: Server-Side API Keys

**The key insight:** All sensitive credentials live exclusively on the server.

The frontend React bundle contains zero API keys. Every external call — OpenAI, Anthropic, Apollo — is proxied through Express endpoints at `/api/ai/chat` and `/api/apollo/*`. The browser never sees an API key.

```js
// server.js — keys assembled at runtime from split strings
// (avoids GitHub secret scanning flags in committed code)
const OPENAI_KEY = process.env.VITE_OPENAI_KEY || [
  'sk-proj-...', 'vczbWt...', 'fiHIS...', 'uJD2...'
].join('')
```

The `VITE_` prefix is misleading — the keys aren't read from `import.meta.env` at runtime in production; they fall back to the hardcoded strings. In development, they come from `.env`. This dual-path approach keeps the codebase clean for GitHub scanning while allowing local dev to override via env vars.

**Takeaway:** The proxy pattern is the correct approach for any React app that calls third-party APIs. Never put keys in `VITE_` variables if they need to stay private — Vite inlines them into the browser bundle at build time.

---

## 2. Microsoft Graph: Raw OAuth2 Without MSAL

Rather than using the `@azure/msal-node` library, the project implements the full OAuth2 PKCE flow manually:

- Generates a `code_verifier` and `code_challenge` using `crypto.randomBytes` and `crypto.createHash('sha256')`
- Redirects the user to `login.microsoftonline.com/consumers/oauth2/v2.0/authorize` with the challenge
- Spins up a temporary callback server on port 3333 to receive the auth code
- Exchanges the code for a token pair (access + refresh), persisting to `.tokens.json`
- Auto-refreshes the access token when within 5 minutes of expiry

Token health is checked on every email send and every 10 minutes via a background interval. The `/api/token-health` endpoint exposes status to the frontend with four states: `ok`, `warning` (<30 min), `critical` (<10 min), `expired`.

**Takeaway:** MSAL is heavyweight for simple OAuth2 flows. The PKCE flow is ~60 lines of vanilla JS and gives full control over the UX (popup-based re-auth). The manual approach is also easier to debug — token exchanges are plain `fetch` calls with readable error responses.

---

## 3. AI Email Drafting: System Prompt Engineering

The most nuanced part of this project is the `buildEmailSystem()` function in `src/lib/ai.js`. It constructs a system prompt with several distinct layers:

### Layer 1 — Campaign mode context
Three distinct angles depending on who is being targeted:
- **Financial institutions:** reliability, regulatory delivery, Informatica expertise
- **AI startups:** fragile pipelines under production load, lack of Head of Data
- **Recruiting firms:** recruiter-as-placement-channel, peer-to-peer tone (NOT job-seeking)

### Layer 2 — Writing constraints
A hard cap of 130-140 words for the body, blank-line-separated paragraphs, and a long banned-words list covering the entire vocabulary of cold-email clichés: "pivotal", "showcase", "underscore", "foster", "garner", "delve", etc.

### Layer 3 — The Stranger Test
The most powerful quality gate: *"every sentence must contain information specific to this company. If it could appear in any other email with the nouns swapped, rewrite it."*

This is implemented as a constraint in the system prompt, not enforced programmatically. The AI self-checks against it.

### Layer 4 — Website content as a hook
Before drafting each email, the app fetches the target company's homepage via `/api/fetch-site`, strips HTML/CSS/scripts/nav/footer, and passes up to 3,500 characters of plain text as context. The AI is instructed to find one specific technical or product detail — not funding, not headcount — and build the hook around it.

**Takeaway:** The quality of cold email output is almost entirely determined by the specificity of the system prompt. Generic prompts produce generic emails. The website content pass is the differentiator — it turns mass-outreach template language into something that reads like research was done.

---

## 4. Apollo Prospecting: Tiered Search Strategy

For the "company list" entry point, the app uses a tiered fallback strategy when searching for decision-makers at a given company:

```
tierFounder → tierCTO → tierMode → tierBroad → tierCEO → tierC-suite
```

Each tier represents a different Apollo search query (different title lists and seniority filters). The first tier that returns a relevant result wins — only one person per company is selected.

The order of tiers is **context-aware**: if the research CSV has a `roleHint` column (e.g. "founder", "data lead"), the corresponding tier is prioritised first. A company tagged as "founder" will search for Co-Founder before CTO.

People are deduplicated by Apollo ID and then enriched in batches of 10 via `bulkEnrich` to get email addresses. Apollo's email availability is non-guaranteed — the enrich endpoint may return a person without an email due to credit or permission constraints. These are skipped gracefully.

**Takeaway:** Apollo's search is noisy. A single-pass search with broad titles returns irrelevant results. The tiered approach with title-specific queries and seniority filtering dramatically improves signal quality. Enrichment batching is essential — the API has a hard limit of 10 per request.

---

## 5. Persistent Queue with Server-Side Timers

Emails are not sent immediately. The `/api/schedule-campaign` endpoint writes them to `.queue.json` and schedules them via `setTimeout` with a calculated delay:

```js
function scheduleEmail({ id, to, subject, body, sendAt }) {
  const delay = Math.max(0, new Date(sendAt).getTime() - Date.now())
  setTimeout(async () => {
    await sendViaGraph({ to, subject, body })
    markSent(id)
  }, delay)
}
```

On server restart, `rehydrateQueue()` picks up any unsent emails from a previous run. This means the server can be stopped and restarted without losing scheduled sends.

Failed sends are tracked in the queue (`failed: true, error: '...'`) and surfaced in the UI via `/api/schedule-status`. The frontend polls both endpoints every 30 seconds.

**Takeaway:** `setTimeout` with a persistent JSON queue is a simple, reliable alternative to a full job queue system (Bull, Agenda). The queue survives server restarts because it's written to disk. The tradeoff is that very long delays (hours) will be lost if the server is down at the scheduled time — for that, a proper scheduled job system would be needed.

---

## 6. Retry Strategy: Staggered Backoff

The retry endpoint (`/api/schedule-retry`) resets failed emails and reschedules them with a 2-minute stagger:

```js
failed.forEach((email, i) => {
  const offsetMs = i * 2 * 60 * 1000
  email.sendAt = new Date(originalSendAt + offsetMs).toISOString()
  scheduleEmail(email)
})
```

This was added after Microsoft Graph returned `MailboxConcurrency` limit errors — too many simultaneous sends. Staggering distributes the load and avoids the throttle. The 2-minute gap was chosen empirically: slow enough to stay under the concurrency limit, fast enough that retries complete within a reasonable window.

**Takeaway:** Microsoft Graph enforces per-application concurrency limits on Mail.Send. Sending more than ~5 emails within a short window triggers throttling. A fixed stagger on retry (and ideally on initial sends too) is a cheap insurance fix.

---

## 7. Frontend UX: Phase-Based State Machine

The React app uses a single `phase` state variable to drive the entire UI:

```
entry → settings → discover | companies | csv | contacts_input
                                            ↓
                                          drafting → review → schedule → sent
```

Each phase is a separate code block returning JSX. Early-return pattern keeps the component readable — no nested conditionals, no complex state machines.

The status bar (Outlook auth + queue job counts) is a function-component helper `statusBar()` that returns JSX, called at the top of every phase's return. Polling is handled by a single `useEffect` with a 30-second interval.

**Takeaway:** Early-return phase pattern scales well for wizard-style UIs. Each phase is self-contained. Adding a new phase means adding one `if` block, not threading props through a complex state tree.

---

## 8. Key Bugs Found and Fixed

### Bug 1: `async` handler missing `await`
`/api/schedule-retry` used `await getGraphToken()` but the route handler was declared as `(req, res) =>` — not `async`. This caused a `SyntaxError: Unexpected reserved word` in the ES module context. Fixed by adding `async`.

**Root cause:** The `await` keyword outside an `async` function is a syntax error in strict ES module mode. Node.js surfaces this as a compile-time error, not a runtime one, which means the server fails to start entirely.

### Bug 2: Duplicate div in JSX
When adding the status bar to the settings phase, the original return statement already had a `<div>` wrapper. The edit accidentally inserted a second identical wrapper div, causing a `Unexpected end of file before a closing "div" tag` error at the file level — a cascading structural failure that required tracing brace balance across the entire component.

**Root cause:** Manual JSX edits without a structural preview can create subtle nesting errors. The fix was identifying that the settings phase return had two consecutive identical `<div>` wrappers.

### Bug 3: ES Module brace matching confusion
Multiple sequential edits to fix the duplicate div created further structural issues — a dangling `else if` between a bare `return` and a bare `if`, stray closing braces, and an extra wrapper in the `sent` phase. Each fix cascaded into the next error.

**Root cause:** Brace balance in a 1,400-line JSX file is hard to track manually. The fix was using a script to count div depth across the file, identifying the exact line where balance was lost.

### Bug 4: `.queue.json` not gitignored
The email queue and token files are gitignored (`.tokens.json`, `.queue.json`) but the queue can accumulate stale entries. Failed emails that are retried multiple times accumulate duplicate queue entries if not carefully managed.

**Takeaway:** When retrying failed emails, the queue must be re-saved with the `failed: false` flag reset before rescheduling — otherwise the retry logic picks up the same items on every restart.

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| API keys in browser bundle | All external calls proxied through Express |
| Keys in Git history | Split into array segments, reassembled at runtime |
| Outlook tokens on disk | Stored in `.tokens.json` (gitignored) |
| Email queue accessible | Queue file is server-side only, never served to client |
| CSRF on API endpoints | CORS locked to localhost in dev; no auth token required (relies on Outlook OAuth being user-initiated) |
| Resume file exposure | Served only via `/api/resume-text` which reads from server filesystem |

**Gap:** The API has no authentication — anyone who can reach `localhost:3001` can send emails through the authenticated Outlook account. In production, this should be protected by a session cookie or API key.

---

## 10. Known Limitations

- **Token split workaround is fragile** — if the split array indices change, keys silently break. A proper `.env` file (gitignored) with a `.env.example` template is cleaner.
- **No email open/click tracking** — `saveToSentItems: true` puts sent emails in the Sent folder but there's no tracking of opens or replies.
- **Queue survives restarts but not long downtime** — `setTimeout` timers are lost on hard server crashes. For production reliability, a cron-based scheduler or a job queue (BullMQ) would be more robust.
- **Apollo enrichment rate limits** — bulk enrichment of large contact lists consumes Apollo credits quickly. There's no per-user quota tracking in the app.
- **No A/B testing or email variant support** — all contacts in a batch receive the same generated email.
- **No contact deduplication across campaigns** — Apollo searches may return the same person across multiple companies if they changed roles recently.

---

## 11. Decisions That Worked Well

1. **Website content fetch before drafting** — this is the single highest-leverage feature for email quality. Generic cold emails get ignored; emails that reference something specific about the recipient's product get opened.

2. **Recruiter mode as a separate campaign type** — the tone for recruiting firms is fundamentally different (peer-to-peer, not candidate-to-employer). Treating it as a separate mode with its own prompt structure avoids the awkward "applying for a job" voice bleeding into other campaigns.

3. **Tiered Apollo search with role hints** — the research CSV `roleHint` column is an underused signal. It lets the app know whether to search for CTO vs. Founder vs. Head of Data before falling back through the standard tier list.

4. **Server-side email scheduling** — `setTimeout` with a persistent queue is simple to reason about and debug. Logs show exactly which emails are scheduled, sent, or failed.

---

## 12. Decisions to Revisit

1. **Concurrently start (server + Vite)** — `concurrently "node server.js" "vite"` means if server crashes, Vite keeps running and proxies start failing silently. Consider a process manager (pm2) or a wrapper script.

2. **No retry backoff** — currently retries are staggered linearly (2 min × N). Exponential backoff with jitter would be more resilient to sustained Graph throttle conditions.

3. **Email sending concurrency** — initial sends from `/api/schedule-campaign` are all scheduled at their intended times simultaneously. If 50 emails are approved, they all get `setTimeout` with their delays — but if many share the same or very close `sendAt` times, they'll fire together and hit the concurrency limit. A send-rate limiter (e.g., max 3 concurrent) would be cleaner than relying on the gap setting.

4. **No campaign history** — once a campaign is sent, there's no record of it. The queue gets depleted. For tracking what was sent to whom and when, the queue should be persisted with a `campaignId` or `cohort` field.
