# Cold Email Automation Pipeline

AI-powered cold outreach for senior data engineering contractors. Finds decision makers at target companies, scrapes their websites for personalised hooks, drafts tailored cold emails, and generates an Outlook macro to schedule delivery.

---

## What it does

1. **Find contacts** — four entry paths:
   - Describe your target in plain English → AI searches Apollo for matching people
   - Describe company types → AI finds companies → load into contact finder
   - Paste company names/domains or upload a research CSV → Apollo finds the right decision maker at each
   - Upload or paste your own contact CSV
   - Skip prospecting entirely and go straight to drafting
2. **Draft emails** — AI writes personalised cold emails using real company website content as the hook, following strict anti-fluff writing rules (max 130 words, no banned buzzwords)
3. **Review & approve** — read, edit, flag, or approve each draft
4. **Schedule & send** — generates an Outlook VBA macro that queues all emails with deferred delivery at your chosen date/time

---

## Setup

### Prerequisites

- Node.js 18 or later
- npm

### Install & run

```bash
git clone https://github.com/Hyper-vis/ColdEmailAutomation.git
cd ColdEmailAutomation
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. The Express API server starts on port 3001 automatically alongside Vite.

### API keys

The app comes pre-configured for demo use. To use your own keys, create a `.env` file in the project root:

```
VITE_SENDER_NAME=Your Name
VITE_SENDER_EMAIL=you@youremail.com
VITE_OPENAI_KEY=sk-...
VITE_APOLLO_KEY=your-apollo-key
VITE_ANTHROPIC_KEY=sk-ant-...
```

If no `.env` is present the app falls back to the pre-configured keys in Settings — you can also enter or override keys directly in the Settings screen at runtime.

**Where to get keys:**

| Key | Link | Notes |
|---|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Required for email drafting (GPT-4o / GPT-4o Mini) |
| Apollo.io | app.apollo.io → Settings → API | Required for contact discovery. Free tier: ~50 email credits/month |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Optional — only needed if using Claude Sonnet for drafting |

---

## Entry paths

| Mode | What you bring | What the tool does |
|---|---|---|
| From a prompt | A description of who to target | AI → Apollo people search → enrich emails → draft |
| Company list | Company names / domains / research CSV | Apollo finds decision maker at each → enrich → draft |
| CSV upload | Contact list with emails already | Parse → draft |
| Just draft & send | Name, email, company, title | Skip all prospecting → draft → send |

---

## Apollo credit usage

- **Search** (finding people by title/company): minimal credits
- **Enrich** (unlocking email addresses): 1 credit per person
- Typical run of 20 contacts: ~20–60 credits

---

## Outlook macro — how to run

1. Open **Outlook desktop** (not Outlook web)
2. Press **Alt + F11** — opens VBA Editor
3. Click **Insert > Module**
4. Paste the generated macro
5. Press **F5**, select `SendCampaign`, click **Run**
6. Confirm the dialog — emails queue in Outbox with deferred delivery

Outlook fires each email at its scheduled time. Keep Outlook open (or reopen it before each scheduled send).

**If macros are blocked:** Outlook → File → Options → Trust Center → Trust Center Settings → Macro Settings → Enable all macros

---

## Architecture

```
:5173  Vite dev server (React UI)
         |
:3001  Express API server
         ├── /api/apollo/*      — proxies Apollo calls (Apollo blocks browser CORS)
         └── /api/fetch-site    — fetches + strips company websites for email hooks

OpenAI / Anthropic — called directly from browser (support CORS)
```
