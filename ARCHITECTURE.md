# Architecture — Campaign Pipeline v2

AI-powered outbound sales tool. Finds data engineering decision-makers via Apollo.io,
drafts cold emails with GPT-4o / Claude, schedules and sends via Gmail or Outlook.

Live: **https://auto-outbound.rithiksingh.com**

---

## Deployment

| Layer    | Host   | Trigger           |
|----------|--------|-------------------|
| Frontend | Vercel | push to `main`    |
| Backend  | Render | push to `main`    |

- Vercel serves the pre-built `/dist` (Vite output).
- All `/api/*` requests are proxied to `https://autooutbound.onrender.com` (`vercel.json`).
- Render runs `node server.js` (ES modules, Node 20+).
- **Push to `main` = auto-deploy both.** No manual step needed.

---

## Repository layout

```
campaign-v2/
├── server.js               # Entry point — mounts routes, runs startup tasks
├── server/
│   ├── lib/                # Shared server utilities
│   │   ├── config.js       # All env vars (single source of truth)
│   │   ├── prisma.js       # Singleton PrismaClient
│   │   ├── users.js        # bcrypt auth, load/save users.json
│   │   ├── tokens.js       # Outlook OAuth token read/refresh/health
│   │   ├── gmail.js        # Gmail OAuth token + sendViaGmail()
│   │   ├── email-sender.js # sendViaGraph() (Outlook) + sendViaGmail()
│   │   ├── scheduler.js    # setTimeout email scheduler + rehydrateQueue()
│   │   └── oauth-state.js  # Ephemeral PKCE verifier Map
│   └── routes/             # Express Router modules (mounted at /api)
│       ├── ai.js           # POST /api/ai/chat  (OpenAI + Anthropic proxy)
│       ├── apollo.js       # Apollo proxy, company validation, site fetch, resume
│       ├── auth.js         # Outlook + Gmail OAuth flows (PKCE)
│       ├── email.js        # Schedule, status, retry, sent history
│       ├── contacts.js     # Contact CRUD
│       ├── user.js         # Login, signup, profile, prompt templates
│       └── discovery.js    # Automated prospect discovery (bulk import flow)
├── src/                    # React frontend (Vite)
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Main app component (~2200 lines — phases/pages)
│   ├── constants.js        # MODELS, CAMPAIGN_MODES, ENTRY_LEVELS, etc.
│   ├── utils.js            # normalizeDomain, extractEmail, exportCSV, etc.
│   ├── styles.js           # Shared inline-style token object `c`
│   ├── components/
│   │   ├── Avatar.jsx      # Initials avatar (color from name charcode)
│   │   ├── SharedSettings.jsx  # Settings panel (profile/resume/prompt/email/discovery tabs)
│   │   └── SetupWizard.jsx     # First-run 4-step onboarding wizard
│   └── lib/                # Frontend API wrappers
│       ├── ai.js           # draftEmail(), promptToApolloParams(), fetchSiteContent()
│       ├── apollo.js       # searchPeople(), bulkEnrich(), searchOrgs()
│       └── csv.js          # parseCSV(), parseCompanyList(), parseResearchCSV()
├── prisma/
│   └── schema.prisma       # DB schema: Contact, Email, ImportedCompany, ScheduledDiscovery
├── .env                    # Secrets — gitignored, never commit
├── .env.example            # Template showing all required env vars
├── users.json              # User accounts (bcrypt passwords) — gitignored
├── .tokens.json            # Outlook OAuth tokens — gitignored
├── render.yaml             # Render deploy config
├── vercel.json             # Vercel route config (proxies /api/* to Render)
├── vite.config.js          # Vite build config
└── package.json            # Scripts: dev, build, start
```

---

## Environment variables

See `.env.example` for the full list. Required at minimum:

| Variable               | Purpose                              |
|------------------------|--------------------------------------|
| `VITE_OPENAI_KEY`      | OpenAI API key                       |
| `VITE_ANTHROPIC_KEY`   | Anthropic API key                    |
| `VITE_APOLLO_KEY`      | Apollo.io master API key             |
| `OUTLOOK_CLIENT_ID`    | Azure app registration client ID     |
| `OUTLOOK_CLIENT_SECRET`| Azure app registration client secret |
| `OUTLOOK_USER`         | Sender Microsoft account email       |
| `GMAIL_CLIENT_ID`      | Google OAuth client ID               |
| `GMAIL_CLIENT_SECRET`  | Google OAuth client secret           |
| `GMAIL_REDIRECT_URI`   | Google OAuth redirect URI            |
| `DATABASE_URL`         | PostgreSQL connection string (Render)|
| `PORT`                 | Server port (default 3001)           |

---

## Database (Prisma / PostgreSQL)

Schema: `prisma/schema.prisma`

| Model               | Purpose                                              |
|---------------------|------------------------------------------------------|
| `Contact`           | Person record (email, name, title, company, source)  |
| `Email`             | Scheduled/sent email (linked to Contact)             |
| `ImportedCompany`   | Company from bulk CSV import (for auto-discovery)    |
| `ScheduledDiscovery`| Per-user discovery schedule config                   |

Run migrations: `npx prisma migrate deploy`

---

## Auth model

- **User accounts**: `users.json` (bcrypt passwords, gitignored)
- **Sessions**: client stores `userId` in `localStorage`, sends as `x-user-id` header
- **Outlook OAuth**: PKCE flow → tokens stored in `.tokens.json`
- **Gmail OAuth**: PKCE flow → tokens stored in `gmail-tokens-<userId>.json`
- No JWT. Acceptable for single-user/low-threat deployment. For multi-tenant, add JWT.

---

## Email sending flow

```
POST /api/schedule-campaign
  → verify provider auth (getGmailToken / getGraphToken)
  → find-or-create Contact
  → create Email record in DB (createdAt = sendAt)
  → scheduleEmail() → setTimeout → sendViaGraph() or sendViaGmail()
```

On server restart: `rehydrateQueue()` re-schedules all DB-pending emails.

---

## Frontend phases (App.jsx)

The main `App` component is a single-page app driven by a `phase` state string:

| Phase              | What user sees                                      |
|--------------------|-----------------------------------------------------|
| `entry`            | Choose discovery method (prompt / company list / bulk import) + settings |
| `discover`         | AI prompt → Apollo people search → contact list     |
| `companies`        | Paste company names → Apollo lookup → contacts      |
| `import_companies` | Bulk CSV upload → validate → daily auto-discovery   |
| `csv`              | Paste raw CSV contacts                              |
| `drafting`         | AI drafts emails for each contact                   |
| `review`           | Review/edit each draft, approve/flag                |
| `schedule`         | Pick send date/time/gap, schedule approved emails   |
| `sent`             | Schedule confirmed screen                           |
| `sent_history`     | Full sent email log                                 |
| `my_contacts`      | Saved contacts DB view                              |
| `settings`         | SharedSettings panel                                |

---

## Key design decisions

- **No JWT** — `x-user-id` header trust model. Simple, intentional, single-user.
- **In-process scheduler** — `setTimeout` backed by Prisma DB. Survives restarts via `rehydrateQueue()`. For high scale, replace with a proper queue (BullMQ, etc.).
- **Inline styles** — No CSS framework. All styles via the `c` token object in `src/styles.js`.
- **VITE_ prefix on AI keys** — Keys are server-side only but named with `VITE_` prefix for historical reasons. They are never exposed to the browser bundle; the server reads them via `process.env`.
- **Split deployment** — Vercel (frontend) + Render (backend) because Render's free tier cold-starts are slow for SSR but fine for an API server.
