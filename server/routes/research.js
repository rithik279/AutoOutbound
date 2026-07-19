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

// ── Web-search people discovery ───────────────────────────────────────────────
//
// Free-plan replacement for Apollo's people-search API (paywalled): find
// decision makers from public web sources, then let the client enrich the
// names via Apollo people/bulk_match (which free plans CAN use).

const FIND_PEOPLE_SYSTEM = `You find decision makers at companies for B2B outreach, using web search.

You are given either a specific company or a description of target companies, plus the job titles to look for. Use web search (company team/about pages, press releases, conference bios, podcast appearances, public LinkedIn results) to identify real, currently-employed people in those roles.

Rules:
- Only include people whose name AND role at that company are confirmed by search results. Never guess or invent names.
- Prefer exact title matches; otherwise the closest senior equivalent (e.g. CTO when no VP of Engineering exists).
- Skip people the search results suggest have left the company.
- For each person, include the company's primary website domain, bare, like "acme.com".
- If you cannot confirm anyone at a company, return fewer people or none. Do not pad.

Return ONLY valid JSON, no markdown fences:
{"people":[{"first_name":"","last_name":"","title":"","company":"","domain":"","linkedin_url":""}]}`

router.post('/find-people', aiLimiter, async (req, res) => {
  const {
    query = '', company = '', domain = '',
    titles = [], count = 3, maxCompanies = 5,
  } = req.body || {}

  if (!query && !company && !domain) {
    return res.status(400).json({ error: 'query, company, or domain required' })
  }
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_KEY not configured' })
  }

  let user
  if (company || domain) {
    user = `Find up to ${Math.min(count, 5)} decision makers at ${company || domain}${domain ? ` (${domain})` : ''}.`
  } else {
    user = `Find companies matching this description, then their decision makers: "${query}".\nUp to ${Math.min(maxCompanies, 8)} companies, 1-2 decision makers each.`
  }
  if (titles.length > 0) user += `\nTarget titles: ${titles.join(', ')}.`

  try {
    let parsed = null
    for (const toolType of ['web_search', 'web_search_preview']) {
      const r = await httpFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: RESEARCH_MODEL,
          instructions: FIND_PEOPLE_SYSTEM,
          input: user,
          tools: [{ type: toolType }],
          max_output_tokens: 4000,
        }),
      }, { timeoutMs: 180_000, retries: 1, label: 'find-people' })

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
      if (match) parsed = JSON.parse(match[0])
      break
    }

    const people = (Array.isArray(parsed?.people) ? parsed.people : [])
      .map(p => ({
        first_name:   stripCitations(p.first_name),
        last_name:    stripCitations(p.last_name),
        title:        stripCitations(p.title),
        company:      stripCitations(p.company) || company,
        domain:       normalizeDomain(stripCitations(p.domain) || domain),
        linkedin_url: /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(p.linkedin_url || '') ? p.linkedin_url : '',
      }))
      .filter(p => p.first_name && p.last_name)
      .slice(0, 16)

    res.json({ people })
  } catch (e) {
    console.warn('[research] find-people failed:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Web-search email discovery ────────────────────────────────────────────────
//
// Apollo's free plan blocks ALL API endpoints (search and enrichment), so
// emails are found from public web sources instead: directly published
// addresses first, then the company's email pattern.

const FIND_EMAIL_SYSTEM = `You find a person's work email address using web search, for B2B outreach.

Strategy, in order:
1. Search for the person's directly published work email — conference speaker pages, press releases, GitHub profiles and commits, personal sites, company contact or team pages, published papers.
2. If not found, determine the company's email address format from public evidence (published addresses of coworkers at the same domain, "email format" listings), then construct the person's address from that pattern.

Rules:
- Only report a directly published email if it appears verbatim in search results.
- A constructed email must be based on evidence of the company's actual pattern. Only if no evidence exists, fall back to the most common convention (first.last@domain) and mark confidence "low".
- Return the address lowercase, at the company's primary domain.

Return ONLY valid JSON, no markdown fences:
{"email":"","method":"published|pattern|convention|none","confidence":"high|medium|low","evidence":"one short sentence citing what you found"}
If nothing can be determined, return method "none" with an empty email.`

router.post('/find-email', aiLimiter, async (req, res) => {
  const { first_name = '', last_name = '', company = '', domain = '' } = req.body || {}

  if (!first_name || !last_name || !domain) {
    return res.status(400).json({ error: 'first_name, last_name, and domain required' })
  }
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_KEY not configured' })
  }

  const user = `Find the work email address of ${first_name} ${last_name}, ${company || domain} (${domain}).`

  try {
    let parsed = null
    for (const toolType of ['web_search', 'web_search_preview']) {
      const r = await httpFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: RESEARCH_MODEL,
          instructions: FIND_EMAIL_SYSTEM,
          input: user,
          tools: [{ type: toolType }],
          max_output_tokens: 2000,
        }),
      }, { timeoutMs: 120_000, retries: 1, label: 'find-email' })

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
      if (match) parsed = JSON.parse(match[0])
      break
    }

    const email = stripCitations(parsed?.email || '').toLowerCase()
    if (!/^[a-z0-9][a-z0-9._+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      return res.json({ email: '', method: 'none', confidence: 'low', evidence: '' })
    }
    res.json({
      email,
      method:     ['published', 'pattern', 'convention'].includes(parsed?.method) ? parsed.method : 'pattern',
      confidence: ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : 'low',
      evidence:   stripCitations(parsed?.evidence || ''),
    })
  } catch (e) {
    console.warn('[research] find-email failed:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router
