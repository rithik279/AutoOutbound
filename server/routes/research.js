/**
 * server/routes/research.js
 *
 * Deep prospect research for cold-email personalization.
 *
 * Two sources, combined into one response:
 *   1. YC directory (yc-oss static JSON, cached in memory for 24h) — batch,
 *      one-liner, and description for Y Combinator companies, matched by
 *      domain or exact company name.
 *   2. An OpenAI web-search research pass over the person and company —
 *      what the recipient has built/launched/spoken about (public LinkedIn
 *      info surfaced via search, GitHub, talks, YC launch posts) and one or
 *      two specific company features worth referencing in an email.
 *
 * The web-search pass runs only when OPENAI_KEY is configured; the route
 * degrades gracefully to YC-directory-only (or empty) results otherwise.
 *
 * Route:
 *   POST /api/prospect-research
 *     Body: { name?, title?, company?, domain?, linkedin?, campaignMode? }
 *     Response: { yc, personSignals, companySignals, bestHook }
 */

import { Router } from 'express'
import { httpFetch } from '../lib/http.js'
import { OPENAI_KEY } from '../lib/config.js'
import { aiLimiter } from '../lib/middleware.js'

const router = Router()

// Cheapest OpenAI model that supports the web_search tool; overridable
const RESEARCH_MODEL = process.env.RESEARCH_MODEL || 'gpt-4o-mini'

// ── YC directory (yc-oss.github.io static JSON, MIT-licensed, updated daily) ──

const YC_DIRECTORY_URL = 'https://yc-oss.github.io/api/companies/all.json'
const YC_CACHE_TTL_MS = 24 * 60 * 60 * 1000

let ycCache = { byDomain: null, byName: null, loadedAt: 0, loading: null }

function normalizeDomain(raw = '') {
  return String(raw)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim()
}

async function loadYcDirectory() {
  if (ycCache.byDomain && Date.now() - ycCache.loadedAt < YC_CACHE_TTL_MS) return ycCache
  if (ycCache.loading) return ycCache.loading

  ycCache.loading = (async () => {
    try {
      const r = await httpFetch(YC_DIRECTORY_URL, {}, { timeoutMs: 30_000, retries: 1, label: 'yc-directory' })
      if (!r.ok) throw new Error(`YC directory returned ${r.status}`)
      const companies = await r.json()

      // Keep only the fields the prompt needs — the full dump is ~10MB parsed
      const byDomain = new Map()
      const byName = new Map()
      for (const c of companies) {
        const slim = {
          name: c.name || '',
          batch: c.batch || '',
          oneLiner: c.one_liner || '',
          description: (c.long_description || '').slice(0, 700),
          website: c.website || '',
          ycUrl: c.url || '',
          tags: (c.tags || []).slice(0, 6),
          status: c.status || '',
          teamSize: c.team_size ?? null,
        }
        const domain = normalizeDomain(c.website)
        if (domain) byDomain.set(domain, slim)
        if (slim.name) byName.set(slim.name.toLowerCase(), slim)
      }

      ycCache = { byDomain, byName, loadedAt: Date.now(), loading: null }
      console.log(`[research] YC directory loaded: ${byDomain.size} companies`)
      return ycCache
    } catch (e) {
      ycCache.loading = null
      throw e
    }
  })()
  return ycCache.loading
}

async function findYcCompany(domain, companyName) {
  try {
    const { byDomain, byName } = await loadYcDirectory()
    return (
      (domain && byDomain.get(normalizeDomain(domain))) ||
      (companyName && byName.get(String(companyName).toLowerCase().trim())) ||
      null
    )
  } catch (e) {
    console.warn('[research] YC lookup skipped:', e.message)
    return null
  }
}

// ── OpenAI web-search research pass ───────────────────────────────────────────

const RESEARCH_SYSTEM = `You research one prospect before a cold email so the email can open with something specific and true.

Use web search to find:
1. The person: things they have built, founded, written, launched, or spoken about. Public LinkedIn details that appear in search results, GitHub projects, personal sites, conference talks, YC launch posts, podcast or interview appearances.
2. The company: one or two specific product features, recent launches, named customers, or technical details worth referencing in an email.

Rules:
- Only report facts that appear in search results. Never guess, never embellish.
- Specific beats generic: "shipped structured-output fine-tuning in March" beats "works on AI".
- Prefer recent information.
- 2 to 4 signals per section, each one plain-text sentence with enough concrete detail to cite in an email.
- If the search results are thin for a section, return fewer signals or an empty array. Do not pad.

Return ONLY valid JSON, no markdown fences:
{"person_signals":["..."],"company_signals":["..."],"best_hook":"one sentence naming the single most compelling specific thing to mention in the email opener"}`

async function runResearchAgent({ name, title, company, domain, linkedin, yc, campaignMode }) {
  let user = `Research ${name || 'the contact'}${title ? `, ${title},` : ''} at ${company || domain}${domain ? ` (${domain})` : ''}.`
  if (linkedin) user += `\nLinkedIn profile: ${linkedin}`
  if (yc) {
    user += `\nThis is a Y Combinator company (${yc.batch}): ${yc.oneLiner}`
    if (yc.ycUrl) user += `\nYC profile: ${yc.ycUrl}`
    user += `\nLook for their YC launch post, Hacker News discussion, and what the founders or this person have shipped.`
  }
  if (campaignMode) user += `\nOutreach context: ${campaignMode} campaign for a senior data-engineering contractor.`

  // OpenAI Responses API with the built-in web_search tool. Some accounts
  // expose the tool as web_search_preview — fall back to that on a tool error.
  for (const toolType of ['web_search', 'web_search_preview']) {
    const r = await httpFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        instructions: RESEARCH_SYSTEM,
        input: user,
        tools: [{ type: toolType }],
        max_output_tokens: 4000,
      }),
    }, { timeoutMs: 180_000, retries: 1, label: 'research' })

    const data = await r.json()
    if (!r.ok) {
      if (toolType === 'web_search' && /web_search/i.test(data?.error?.message || '')) continue
      throw new Error(data?.error?.message || `OpenAI ${r.status}`)
    }

    const text = (data.output || [])
      .filter(item => item.type === 'message')
      .flatMap(item => item.content || [])
      .filter(c => c.type === 'output_text')
      .map(c => c.text)
      .join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  }
  return null
}

// Web search results arrive with inline markdown citations like
// "([ycombinator.com](https://...utm_source=openai))" — strip them so they
// never leak into a drafted email.
function stripCitations(s = '') {
  return String(s)
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/prospect-research', aiLimiter, async (req, res) => {
  const {
    name = '', title = '', company = '', domain = '',
    linkedin = '', campaignMode = '',
  } = req.body || {}

  if (!company && !domain) {
    return res.status(400).json({ error: 'company or domain required' })
  }

  const yc = await findYcCompany(domain, company)

  let signals = null
  if (OPENAI_KEY) {
    try {
      signals = await runResearchAgent({ name, title, company, domain, linkedin, yc, campaignMode })
    } catch (e) {
      console.warn('[research] web-search pass failed:', e.message)
    }
  }

  res.json({
    yc,
    personSignals: (Array.isArray(signals?.person_signals) ? signals.person_signals : []).map(stripCitations),
    companySignals: (Array.isArray(signals?.company_signals) ? signals.company_signals : []).map(stripCitations),
    bestHook: stripCitations(typeof signals?.best_hook === 'string' ? signals.best_hook : ''),
  })
})

export default router
