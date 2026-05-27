# FirstShot

> AI-powered outbound email campaigns — find prospects, generate personalised emails, review, schedule, and track replies. Built for students and young professionals leveraging their .edu credibility.

[![Deploy](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://auto-outbound.rithiksingh.com)
[![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render)](https://render.com)
[![Database](https://img.shields.io/badge/DB-PostgreSQL-336791?logo=postgresql)](https://render.com)
[![Auth](https://img.shields.io/badge/Auth-Clerk-6C47FF)](https://clerk.com)

**Live app:** https://auto-outbound.rithiksingh.com

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Campaign Flow](#campaign-flow)
- [Email Tracking](#email-tracking)
- [Reply Detection](#reply-detection)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Key Design Decisions](#key-design-decisions)

---

## Overview

FirstShot automates the entire outbound email workflow in four steps:

1. **Discover** — describe your target audience in plain English; AI translates to Apollo search parameters and finds matching contacts
2. **Draft** — AI generates personalised cold emails using live company website content as hooks
3. **Review** — one-at-a-time card UI to approve, flag, edit, or AI-regenerate each draft
4. **Schedule & Send** — pick date/time/gap; emails fire from your own Gmail or Outlook account

Contacts are stored in PostgreSQL, emails are queued via pg-boss for reliable delivery, and opens/clicks/replies are tracked end-to-end.

---

## Features

### Campaign Entry Modes

| Mode | Description |
|---|---|
| **Natural language prompt** | "VP of Engineering at Series A AI startups in NYC" → Apollo people search |
| **Company list** | Paste company names/domains → Apollo finds the right decision maker at each |
| **Bulk CSV import** | Upload a contact CSV with existing emails → skip prospecting |

### AI Drafting

- Fetches live company website content before drafting to generate personalised hooks
- Anti-fluff constraints: max 130 words, no buzzwords, no hollow openers
- Inline **✨ Regenerate** button in review phase — rewrites a single draft in place without leaving the page
- Campaign mode support: `startup` / `recruiting` writing styles
- Model selection: GPT-4o or GPT-4o-mini per user preference

### Review UX

- One-at-a-time card navigation with ← → arrows
- Progress dots: current (brand blue) / approved (green) / flagged (red) / pending (gray)
- Approve → auto-advances to next contact
- Bulk "Approve all" then schedule

### Email Providers

Both send from your own account — not a shared domain:

| Provider | Recommended for |
|---|---|
| **Outlook / Microsoft 365** | ⭐ University `.edu` emails — highest open rates, instant credibility |
| **Gmail** | Google Workspace or personal Gmail |

> **Why `.edu` wins:** A university email address signals legitimacy instantly. Prospects open emails from students at a significantly higher rate than from generic domains. Connect your university Outlook account for best results.

### Open / Click Tracking

- **Open tracking** — 1×1 transparent GIF pixel injected into every outbound HTML email
- **Click tracking** — all links rewritten through a redirect endpoint that logs the click then forwards to the original URL
- Per-email badges in Sent Emails: opened count, click count

### Reply Detection

- On Gmail send: stores `threadId` from Gmail API response
- On Outlook send: uses create-then-send flow to capture `conversationId` from Graph API
- "Check replies" button polls both providers for inbound messages from recipients
- Sets `Contact.state = 'replied'` and shows green **Replied** badge in Sent Emails UI

### Campaign Draft Resume

In-progress campaigns (contacts + drafts + approvals) auto-saved to `localStorage`. Resume banner appears on the entry page if an unfinished campaign exists. Cleared on successful send. Expires after 7 days.

### Onboarding Wizard

Three-step first-time setup:
1. Name + sender email
2. Connect email provider (Outlook recommended with `.edu` callout)
3. Done — launch first campaign

### Daily Auto-Discovery

Configurable scheduled job that runs Apollo searches on a cron, drafts emails for new contacts, and queues them for batch review. Configure run time and daily quota in Settings → Discovery.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite)                              │
│  Vercel CDN → auto-outbound.rithiksingh.com             │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS + Authorization: Bearer <Clerk JWT>
┌──────────────────────────▼──────────────────────────────┐
│  Express API Server (Node 18, ESM)                      │
│  Render — render.com                                    │
│                                                         │
│  /api/ai/*          → OpenAI / Anthropic proxy          │
│  /api/apollo/*      → Apollo.io proxy (CORS bypass)     │
│  /api/gmail/*       → Gmail OAuth + send                │
│  /api/auth-*        → Outlook OAuth (MSAL)              │
│  /api/schedule-*    → campaign scheduling               │
│  /api/track/*       → open / click / reply tracking     │
│  /api/contacts      → contact CRUD                      │
│  /api/discovery/*   → scheduled discovery config        │
│  /api/user/*        → profile management                │
└──────────────┬───────────────────────┬──────────────────┘
               │                       │
┌──────────────▼──────┐  ┌─────────────▼──────────────────┐
│  PostgreSQL (Render) │  │  pg-boss (job queue)           │
│  Prisma ORM v5       │  │  send-email worker             │
│                      │  │  run-discovery worker          │
└──────────────────────┘  └────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│  External APIs                                          │
│  Apollo.io       — contact search + enrichment          │
│  OpenAI          — email drafting (gpt-4o / gpt-4o-mini)│
│  Anthropic       — alternative AI provider              │
│  Gmail API       — OAuth send + thread polling          │
│  Microsoft Graph — OAuth send + conversation polling    │
│  Clerk           — authentication + JWT verification    │
└─────────────────────────────────────────────────────────┘
```

### Auth Flow

1. User signs in via Clerk (Google SSO or email/password)
2. Clerk issues a signed JWT
3. `AppShell.jsx` fetch interceptor injects `Authorization: Bearer <token>` on all `/api/*` calls automatically — zero changes needed across 30+ fetch calls in `App.jsx`
4. `server/lib/middleware.js` → `requireAuth` verifies token via `@clerk/backend` `verifyToken`
5. `req.userId` set to the internal DB user ID for all downstream handlers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 7 |
| Auth | Clerk v5 (React SDK + Backend SDK) |
| Backend | Express 4, Node.js 18 (ESM) |
| Database | PostgreSQL via Prisma ORM 5 |
| Job Queue | pg-boss 12 (PostgreSQL-backed reliable delivery) |
| Email — Outlook | Microsoft Graph API via MSAL (`@azure/msal-node`) |
| Email — Gmail | Gmail REST API, OAuth 2.0 |
| AI | OpenAI GPT-4o / GPT-4o-mini, Anthropic Claude |
| Contact Data | Apollo.io People Search + Enrichment API |
| Frontend Deploy | Vercel (auto-deploy on `main`) |
| Backend Deploy | Render (auto-deploy on `main`) |
| Icons | Lucide React |

---

## Database Schema

```prisma
model Contact {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  title     String?
  company   String
  domain    String?
  linkedin  String?
  state     String   @default("new")   // new | emailed | replied
  source    String?                    // csv | apollo | manual
  emails    Email[]
}

model Email {
  id                    Int       @id @default(autoincrement())
  to                    String
  subject               String
  body                  String
  sentAt                DateTime?
  failedAt              DateTime?
  error                 String?
  userId                String
  provider              String    @default("outlook")  // gmail | outlook
  scheduledAt           DateTime
  // Open / click tracking
  trackingId            String    @unique @default(uuid())
  openCount             Int       @default(0)
  clickCount            Int       @default(0)
  firstOpenedAt         DateTime?
  // Reply tracking
  gmailMessageId        String?
  gmailThreadId         String?
  outlookMessageId      String?
  outlookConversationId String?
  repliedAt             DateTime?
  events                EmailEvent[]
}

model EmailEvent {
  id         Int      @id @default(autoincrement())
  emailId    Int
  type       String   // open | click
  linkUrl    String?
  ip         String?
  userAgent  String?
  occurredAt DateTime @default(now())
}

model User {
  id            String   @id
  clerkId       String?  @unique
  email         String   @unique
  senderName    String?
  senderEmail   String?
  modelId       String   @default("gpt-4o-mini")
  campaignMode  String   @default("startup")
  emailProvider String   @default("gmail")
  resumeText    String?
  prompt        String?
  gmailTokens   Json?    // { accessToken, refreshToken, expiresAt, ... }
  outlookTokens Json?
}

model ImportedCompany {
  id      Int    @id @default(autoincrement())
  name    String
  domain  String @unique
  status  String @default("pending")  // pending | validating | discovered | drafting | approved | sent
  userId  String
}

model ScheduledDiscovery {
  id         Int      @id @default(autoincrement())
  userId     String   @unique
  runTime    String   // "09:00" HH:MM
  dailyQuota Int
  enabled    Boolean  @default(true)
  lastRunAt  DateTime?
}
```

---

## API Reference

All authenticated routes require `Authorization: Bearer <clerk_jwt>`.  
Public tracking routes (called by email clients) require no auth.

### User

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/user/profile` | ✅ | Get current user profile |
| `PUT` | `/api/user/profile` | ✅ | Update name, email, prompt, resume, model, campaignMode |

### Contacts

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/contacts` | ✅ | List all contacts for user |
| `POST` | `/api/contacts` | ✅ | Create or update contact |
| `PUT` | `/api/contacts/:id` | ✅ | Update contact fields |
| `GET` | `/api/contacts/:id/emails` | ✅ | Email history for contact |

### Email / Campaign

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/schedule-campaign` | ✅ | Schedule a batch of emails |
| `GET` | `/api/schedule-status` | ✅ | Sent / pending / failed counts |
| `GET` | `/api/sent-emails` | ✅ | Full sent history with tracking data |
| `POST` | `/api/schedule-retry` | ✅ | Re-queue all failed emails |
| `POST` | `/api/check-replies` | ✅ | Poll Gmail + Outlook for replies |

### Tracking (public)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/track/open/:trackingId` | ❌ | Record open, return 1×1 GIF |
| `GET` | `/api/track/click/:trackingId/:linkId` | ❌ | Record click, redirect to URL |
| `GET` | `/api/track/stats` | ✅ | Aggregate open/click rates |

### AI

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ai/chat` | ✅ | OpenAI / Anthropic chat proxy |

### Apollo

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/apollo/people-search` | ✅ | Search people by title/company |
| `POST` | `/api/apollo/enrich` | ✅ | Enrich contact with email |
| `POST` | `/api/apollo/org-search` | ✅ | Search organisations |

### Gmail OAuth

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/gmail/auth-start` | ❌ | Redirect to Google OAuth consent |
| `GET` | `/api/gmail/auth-callback` | ❌ | Handle callback, store tokens |
| `GET` | `/api/gmail/token-health` | ✅ | Check token expiry status |

### Outlook OAuth

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth-start` | ❌ | Redirect to Microsoft OAuth consent |
| `GET` | `/api/auth-callback` | ❌ | Handle callback, store tokens |
| `GET` | `/api/token-health` | ✅ | Check token expiry status |

### Discovery

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/discovery/run` | ✅ | Trigger manual discovery run |
| `GET` | `/api/discovery/status` | ✅ | Last run time, quota, enabled flag |
| `POST` | `/api/discovery/config` | ✅ | Update schedule time and daily quota |

---

## Campaign Flow

```
Entry Page
    │
    ├── Natural language prompt ──────────────┐
    ├── Company list (names / domains)         │
    └── CSV upload                             │
                                               ▼
                                        Discover Phase
                                        promptToApolloParams (AI)
                                        Apollo people search
                                        Email enrichment
                                               │
                                               ▼
                                        Drafting Phase
                                        fetchSiteContent (company website)
                                        draftEmail (AI, parallelised)
                                        Progress bar per contact
                                               │
                                               ▼
                                        Review Phase
                                        One-at-a-time card
                                        Approve / Flag / Edit / ✨ Regenerate
                                               │
                                               ▼
                                        Schedule Phase
                                        Date + time + gap between emails
                                        Select provider (Gmail / Outlook)
                                               │
                                               ▼
                                        POST /api/schedule-campaign
                                        pg-boss enqueues send-email jobs
                                               │
                                        Worker fires at scheduled time
                                        Stores gmailThreadId / outlookConversationId
                                               │
                                               ▼
                                        Sent Emails page
                                        Open / Click / Reply badges
                                        POST /api/check-replies → polls providers
```

---

## Email Tracking

### Open Tracking

Every outbound email is converted to HTML. A 1×1 transparent GIF pixel is appended:

```html
<img src="https://auto-outbound.rithiksingh.com/api/track/open/{trackingId}"
     width="1" height="1" style="display:none" alt="" />
```

When an email client loads the pixel:
- `Email.openCount` incremented
- `Email.firstOpenedAt` set on first open only
- `EmailEvent` row created with IP and user-agent

### Click Tracking

All `http://` and `https://` links in the email body are rewritten before sending:

```
Original:  https://example.com/page
Tracked:   /api/track/click/{trackingId}/{base64url("https://example.com/page")}
```

On click: `Email.clickCount` incremented, `EmailEvent` logged, user immediately redirected to original URL (302).

---

## Reply Detection

### Gmail

**On send:** Gmail API returns `{ id, threadId }`. Both stored on the `Email` record.

**On check:**
```http
GET https://gmail.googleapis.com/gmail/v1/users/me/threads/{threadId}
    ?format=metadata&metadataHeaders=From
```
Reply detected when: thread message count > 1 **and** at least one message `From` header matches the recipient's email address (excluding the sender's own address).

### Outlook

**On send:** Two-step flow instead of `/me/sendMail`:
1. `POST /me/messages` → creates draft, returns `{ id, conversationId }`
2. `POST /me/messages/{id}/send` → sends the draft

`conversationId` stored on the `Email` record.

**On check:**
```http
GET https://graph.microsoft.com/v1.0/me/messages
    ?$filter=conversationId eq '{conversationId}'
    &$select=from,sender&$top=25
```
Reply detected when: message count > 1 **and** one message's `from.emailAddress.address` matches the recipient.

**When reply detected (both providers):**
- `Email.repliedAt` → `now()`
- `Contact.state` → `'replied'`
- Green **Replied** badge appears in Sent Emails UI

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL (local instance or Render/Supabase connection string)
- npm

### Setup

```bash
# 1. Clone
git clone https://github.com/rithik279/AutoOutbound.git
cd AutoOutbound

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in .env with your API keys (see Environment Variables section)

# 4. Run migrations
npx prisma migrate deploy

# 5. Generate Prisma client
npx prisma generate

# 6. Start dev server (Vite + Express run concurrently)
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001

### OAuth Redirect URIs for Local Dev

**Gmail** — add to your Google Cloud OAuth app's authorised redirect URIs:
```
http://localhost:3001/api/gmail/auth-callback
```

**Outlook** — add to your Azure app registration's redirect URIs:
```
http://localhost:3001/api/auth-callback
```

---

## Environment Variables

Copy `.env.example` → `.env` and fill in all required values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | Same key — Vite prefix required for client bundle |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key (server-side JWT verification) |
| `VITE_OPENAI_KEY` | ✅ | OpenAI API key |
| `VITE_APOLLO_KEY` | ✅ | Apollo.io master API key |
| `VITE_ANTHROPIC_KEY` | ☑️ | Anthropic API key (optional fallback) |
| `OUTLOOK_CLIENT_ID` | ✅ | Azure app registration client ID |
| `OUTLOOK_CLIENT_SECRET` | ✅ | Azure app registration secret |
| `OUTLOOK_USER` | ✅ | Microsoft account email used to send |
| `GMAIL_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | ✅ | OAuth callback URL (must match Google Cloud console) |
| `VITE_API_URL` | ☑️ | Backend base URL for production builds (blank for local) |
| `PORT` | ☑️ | API server port (default: `3001`) |

---

## Deployment

CI/CD is fully automated — push to `main` and both services deploy automatically.

### Frontend — Vercel

- Build command: `npm run build`
- Output directory: `dist/`
- All `VITE_*` environment variables set in Vercel dashboard
- Custom domain: `auto-outbound.rithiksingh.com`

### Backend — Render

- Start command: `node server.js`
- All non-`VITE_*` environment variables set in Render dashboard
- pg-boss workers start automatically on server startup
- Run `npx prisma migrate deploy && npx prisma generate` as a pre-deploy command

### Database — Render PostgreSQL

- Render managed PostgreSQL
- Migrations applied via `npx prisma migrate deploy` (safe, non-interactive)
- Schema file: `prisma/schema.prisma`
- Migration history: `prisma/migrations/`

---

## Project Structure

```
campaign-v2/
├── prisma/
│   ├── schema.prisma              # Database schema (source of truth)
│   └── migrations/                # Ordered migration history
│       ├── 20260512003835_init/
│       ├── 20260512013214_add_provider_field/
│       ├── 20260512091752_add_company_import_and_discovery/
│       ├── 20260522195652_add_scheduled_at_indexes/
│       ├── 20260522200906_migrate_users_and_tokens_to_db/
│       ├── 20260523000001_add_clerk_id/
│       ├── 20260527000001_add_reply_tracking/
│       └── 20260527000002_add_outlook_reply_tracking/
│
├── server/
│   ├── server.js                  # Express app entry — mounts all routers
│   ├── lib/
│   │   ├── middleware.js          # requireAuth (Clerk JWT), rate limiters
│   │   ├── prisma.js              # Prisma client singleton
│   │   ├── queue.js               # pg-boss init + send-email / discovery workers
│   │   ├── gmail.js               # Gmail token management + sendViaGmail
│   │   ├── email-sender.js        # sendViaGraph (Outlook) + re-export sendViaGmail
│   │   ├── tokens.js              # Outlook MSAL token management
│   │   ├── email-tracking.js      # buildTrackedHtml — injects pixel, rewrites links
│   │   └── config.js              # Shared constants (RESUME_PATH, etc.)
│   └── routes/
│       ├── ai.js                  # POST /api/ai/chat
│       ├── apollo.js              # POST /api/apollo/*
│       ├── auth.js                # Outlook OAuth flow
│       ├── contacts.js            # Contact CRUD
│       ├── discovery.js           # Scheduled discovery config + manual trigger
│       ├── email.js               # Campaign scheduling, status, retry, reply check
│       ├── tracking.js            # Open pixel, click redirect, aggregate stats
│       └── user.js                # User profile read/write
│
├── src/
│   ├── main.jsx                   # React entry — ClerkProvider, BrowserRouter
│   ├── App.jsx                    # Core app — all phase state and rendering (~2200 lines)
│   ├── styles.js                  # Shared inline style constants
│   ├── constants.js               # MODELS, CAMPAIGN_MODES
│   ├── lib/
│   │   ├── ai.js                  # draftEmail, promptToApolloParams, fetchSiteContent
│   │   └── cn.js                  # Tailwind clsx/merge utility
│   ├── pages/
│   │   ├── AppShell.jsx           # Sidebar layout, Clerk auth guard, fetch interceptor
│   │   ├── Landing.jsx            # Public marketing page
│   │   └── SignInPage.jsx         # Clerk SignIn component
│   └── components/
│       ├── OnboardingWizard.jsx   # First-time 3-step setup wizard
│       ├── FlowStepper.jsx        # Describe → Contacts → Approve → Schedule bar
│       ├── SharedSettings.jsx     # Settings tabs: Profile, Email, AI, Discovery
│       ├── Avatar.jsx             # Initials avatar
│       ├── SetupWizard.jsx        # Legacy friend-user setup (kept for compat)
│       └── pages/
│           ├── EntryPage.jsx      # Campaign entry — prompt textarea + mode pills
│           ├── MyContactsPage.jsx # Saved contacts list with state badges
│           ├── SentHistoryPage.jsx # Sent emails, tracking stats, check replies
│           └── SentPage.jsx       # Post-send confirmation screen
│
├── .env.example                   # Environment variable template
├── CLAUDE.md                      # AI assistant project instructions
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Key Design Decisions

**Why pg-boss instead of setTimeout / cron?**  
Emails scheduled in the future need to survive server restarts. pg-boss stores jobs in PostgreSQL with at-least-once delivery guarantees, configurable retry logic, and concurrency control. Far more reliable than in-memory scheduling.

**Why store OAuth tokens in the database instead of the filesystem?**  
Render restarts ephemeral filesystems on every deploy. Database storage means tokens survive deploys without requiring a persistent disk mount or external secrets manager.

**Why Clerk instead of custom JWT auth?**  
Clerk handles email verification, Google SSO, session management, and key rotation out of the box. The fetch interceptor in `AppShell.jsx` injects the Bearer token globally, meaning none of the 30+ fetch calls in `App.jsx` needed modification — zero migration cost.

**Why Outlook create-then-send instead of `/me/sendMail`?**  
`/me/sendMail` returns 202 No Content with no message ID. Reply detection requires a `conversationId`, which is only returned when creating a draft first via `POST /me/messages`. The two-step flow adds ~100ms latency but enables full reply tracking.

**Why is `App.jsx` 2200+ lines?**  
All campaign phase state (contacts, drafts, approvals, schedule) is intentionally co-located. These phases share state that would be painful to synchronise across a file-based router. The `phase` string acts as an internal router. Per-route decomposition is a future refactor once the data model stabilises.

---

## License

Private — all rights reserved.
