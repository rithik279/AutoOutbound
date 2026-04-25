# Campaign Pipeline - Current Work Context

## Project
Cold email outreach automation app for Manmit Singh (Senior ETL Consultant). Sends personalized emails via Outlook/Microsoft Graph.

**Repo:** https://github.com/rithik279/AutoOutbound.git
**Stack:** React + Vite frontend, Express backend, Apollo API for contact enrichment

---

## What's Being Worked On

### 1. Status Bar Feature (IN PROGRESS)

**Goal:** Add a status bar to the UI showing:
- Outlook auth status (connected/expired/critical)
- Re-authorize button when token is expired
- Scheduled job counts (pending/sent/failed)
- Retry failed button

**Files to modify:**
- `server.js` — Add endpoints
- `src/App.jsx` — Add status bar UI

**Completed in server.js:**
- `/api/token-health` — Returns `{ok, status, minutesLeft}` (status: ok/warning/critical/expired/missing)
- `/api/schedule-status` — Returns `{total, sent, pending, failed}`
- `/api/schedule-retry` — POST, resets failed emails and reschedules them
- `markFailed()` helper — marks emails as failed in queue
- `scheduleEmail()` — calls `markFailed()` on error

**Completed in App.jsx:**
- Added `useEffect` that polls `/api/token-health` and `/api/schedule-status` every 30s
- Added `authStatus`, `scheduleStatus`, `reAuthLoading`, `retryLoading` state
- Added `runReAuth()` and `runRetryFailed()` functions
- Created `statusBar` helper component with all 3 elements
- Added `{statusBar()}` to all phases: settings, discover, companies, csv, contacts_input, drafting, review, schedule, sent

**Status bar appearance:**
```
[● Outlook connected] | Jobs: 0 pending · 0 sent   [Retry 7 failed]  (red button when failed > 0)
```

### 2. Email Drafting Prompt (DONE)

**File:** `src/lib/ai.js` — `buildEmailSystem()` function

**Changes made:** Recruiter emails now use first-person voice matching the founder email style:
- Observe paragraph: "Open Systems Technologies places talent in fintech..."
- Problem paragraph: "As firms scale their data infrastructure, pipeline reliability becomes a real problem..."
- Background paragraph: specific companies, specific work, varied sentence structure
- CTA: "I can step in as senior contract capacity if timing works. Worth a quick call?"

**Banned phrases:**
- "Manmit Singh is...", "His experience..."
- "I see that...", "This aligns well with..."
- "reduce your search time", "strong candidate"

---

## Key Files

- `server.js` — Backend API (port 3001)
- `src/App.jsx` — Main React app
- `src/lib/ai.js` — Email drafting logic
- `src/lib/apollo.js` — Apollo API calls
- `scripts/authorize.js` — Outlook OAuth script
- `.tokens.json` — Outlook tokens (gitignored)
- `.queue.json` — Scheduled email queue (gitignored)

---

## Commands

```bash
npm run dev          # Start dev server (runs server.js + vite)
npm run build        # Build for production
git push origin main # Push changes
```
