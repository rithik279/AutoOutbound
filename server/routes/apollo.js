/**
 * server/routes/apollo.js
 *
 * Apollo.io proxy and related utility routes.
 *
 * Routes:
 *   POST /api/apollo/:path(*)          — Generic Apollo API proxy
 *   POST /api/companies/validate-batch — Validate company domains against Apollo
 *   POST /api/fetch-site               — Fetch + extract text from a company website
 *   GET  /api/resume-text              — Extract plain text from the sender's .docx resume
 *
 * Apollo proxy notes:
 *   The Apollo people search endpoint moved to a different base URL
 *   (/api/v1/ instead of /v1/) — the proxy detects this and routes accordingly.
 *   The API key can be supplied per-request via x-apollo-key header (for
 *   per-user keys) or falls back to the server-wide APOLLO_KEY from .env.
 */

import express, { Router } from 'express'
import fetch        from 'node-fetch'
import { httpFetch } from '../lib/http.js'
import mammoth      from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { APOLLO_KEY, RESUME_PATH } from '../lib/config.js'
import { prisma }   from '../lib/prisma.js'
import { validateOutboundUrl, apolloLimiter } from '../lib/middleware.js'

const router = Router()

const GENERAL_SIGNAL_KEYWORDS = [
  'data', 'analytics', 'engineering', 'platform', 'pipeline', 'warehouse',
  'etl', 'ai', 'machine learning', 'api', 'integration', 'cloud',
  'governance', 'reporting', 'compliance', 'risk', 'payments', 'claims',
  'hiring', 'career', 'job', 'staffing', 'recruiting', 'talent', 'search',
  'contract', 'consulting', 'enterprise', 'customer', 'product'
]

const MODE_SIGNAL_KEYWORDS = {
  finance: [
    'data', 'reporting', 'reconciliation', 'risk', 'regulatory', 'compliance',
    'payments', 'credit', 'banking', 'insurance', 'warehouse', 'migration'
  ],
  startup: [
    'ai', 'platform', 'api', 'integration', 'infrastructure', 'engineering',
    'data', 'pipeline', 'cloud', 'product', 'scale', 'hiring'
  ],
  recruiting: [
    'recruiting', 'staffing', 'talent', 'search', 'placement', 'clients',
    'contract', 'consulting', 'delivery', 'account manager', 'data', 'technology'
  ],
}

function normalizeBaseDomain(url = '') {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
}

function decodeHtml(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
}

function cleanHtmlToText(html = '') {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<form[\s\S]*?<\/form>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractTag(html = '', tagName = '') {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return decodeHtml(match?.[1] || '').replace(/\s+/g, ' ').trim()
}

function extractMetaDescription(html = '') {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  return decodeHtml(match?.[1] || '').replace(/\s+/g, ' ').trim()
}

function extractInterestingLinks(html = '', baseUrl = '', campaignMode = '') {
  const priorities = campaignMode === 'recruiting'
    ? ['about', 'company', 'team', 'specialties', 'practice', 'services', 'industries', 'jobs', 'careers']
    : ['about', 'company', 'platform', 'product', 'solutions', 'services', 'careers', 'jobs', 'engineering']

  const links = new Map()
  const hrefRegex = /href=["']([^"'#]+)["']/gi
  let match

  while ((match = hrefRegex.exec(html))) {
    const href = match[1]
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue
    try {
      const absolute = new URL(href, baseUrl)
      const path = absolute.pathname.toLowerCase()
      if (!path || path === '/') continue
      if (absolute.host !== new URL(baseUrl).host) continue
      if (!priorities.some(p => path.includes(p))) continue
      if (!links.has(absolute.toString())) {
        links.set(absolute.toString(), {
          url: absolute.toString(),
          score: priorities.findIndex(p => path.includes(p)),
          label: path.replace(/\//g, ' ').trim() || 'page'
        })
      }
    } catch {}
  }

  return [...links.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
}

function splitSentences(text = '') {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 60 && s.length <= 260)
}

function scoreSentence(sentence = '', keywords = []) {
  const s = sentence.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (s.includes(keyword)) score += keyword.includes(' ') ? 2 : 1
  }
  if (/\b(we help|we provide|leading|trusted|innovative|world-class)\b/i.test(sentence)) score -= 1
  if (/\b(data|engineering|platform|pipeline|analytics|api|recruiting|staffing|talent|payments|risk|claims|cloud|integration)\b/i.test(sentence)) score += 2
  return score
}

function dedupeStrings(items = []) {
  const seen = new Set()
  return items.filter(item => {
    const key = item.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildResearchSummary(pages = [], campaignMode = '') {
  const keywords = dedupeStrings([...(MODE_SIGNAL_KEYWORDS[campaignMode] || []), ...GENERAL_SIGNAL_KEYWORDS])
  const pageLines = []
  const snippets = []

  for (const page of pages) {
    const introBits = [page.title, page.description].filter(Boolean)
    if (introBits.length > 0) {
      pageLines.push(`${page.label}: ${introBits.join('. ')}`)
    }

    const ranked = splitSentences(page.text)
      .map(sentence => ({ sentence, score: scoreSentence(sentence, keywords) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    for (const item of ranked) snippets.push(item.sentence)
  }

  const bestSnippets = dedupeStrings(snippets).slice(0, 4)
  const summaryParts = []

  if (pageLines.length > 0) {
    summaryParts.push(`PAGE SNAPSHOT\n${pageLines.slice(0, 3).join('\n')}`)
  }
  if (bestSnippets.length > 0) {
    summaryParts.push(`RESEARCH SIGNALS\n- ${bestSnippets.join('\n- ')}`)
  }

  const summary = summaryParts.join('\n\n').slice(0, 1800)
  return summary || pages.map(p => p.text.slice(0, 400)).join('\n').slice(0, 1200)
}

// ── Apollo generic proxy ──────────────────────────────────────────────────────

// Allowlist of Apollo API paths this proxy is permitted to forward.
// Prevents callers from hitting arbitrary Apollo endpoints (e.g. billing, API key management).
const APOLLO_PATH_ALLOWLIST = [
  'mixed_people/api_search',
  'organizations/enrich',
  'organizations/bulk_enrich',
  'people/match',
  'people/bulk_match',
  'contacts/search',
  'mixed_companies/search',
  'emailer_campaigns/search',
]

router.post('/apollo/:path(*)', apolloLimiter, async (req, res) => {
  const reqPath = req.params.path
  const allowed = APOLLO_PATH_ALLOWLIST.some(p => reqPath.startsWith(p))
  if (!allowed) {
    return res.status(403).json({ error: `Apollo path not allowed: ${reqPath}` })
  }
  // Per-request key override allows users to supply their own Apollo key
  const apolloKey = req.headers['x-apollo-key'] || APOLLO_KEY
  if (!apolloKey) {
    return res.status(400).json({ error: 'Missing Apollo key — set VITE_APOLLO_KEY in .env' })
  }

  // The mixed_people search endpoint lives on a different base URL than the rest
  const base = req.params.path.startsWith('mixed_people/api_search')
    ? 'https://api.apollo.io/api/v1/'
    : 'https://api.apollo.io/v1/'

  const apolloUrl = `${base}${req.params.path}`

  try {
    const upstream = await httpFetch(apolloUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     apolloKey,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(req.body),
    }, { timeoutMs: 25_000, retries: 1, label: 'apollo-proxy' })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Company batch validation ──────────────────────────────────────────────────

/**
 * POST /api/companies/validate-batch
 *
 * Takes a list of companies (with domains) and validates each against Apollo's
 * organization search. Companies found in Apollo are saved to ImportedCompany
 * in the database for later use by the discovery scheduler.
 *
 * Body: { companies: [{ name, domain, industry?, size?, location? }], userId }
 * Response: { validatedCount, notFoundCount, validated, notFound }
 */
router.post('/companies/validate-batch', async (req, res) => {
  const { companies, userId } = req.body
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'Missing or empty companies array' })
  }
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' })
  }

  const validated = []
  const notFound  = []

  try {
    // Apollo recommends batches of 10 or fewer for organization searches
    for (let i = 0; i < companies.length; i += 10) {
      const batch = companies.slice(i, i + 10)

      for (const co of batch) {
        if (!co.domain) {
          notFound.push({ ...co, reason: 'No domain provided' })
          continue
        }

        const apolloRes = await httpFetch('https://api.apollo.io/v1/mixed_companies/api_search', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'x-api-key':     APOLLO_KEY,
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({
            q_organization_domains_list: [co.domain],
            per_page: 1,
          }),
        }, { timeoutMs: 20_000, retries: 1, label: 'apollo-validate' })

        const apolloData = await apolloRes.json()
        const orgs = apolloData.organizations || []

        if (orgs.length > 0) {
          const org = orgs[0]
          const record = {
            name:        co.name || org.name,
            domain:      co.domain,
            apolloOrgId: org.id,
            industry:    co.industry || org.industry || '',
            size:        co.size     || (org.num_employees_range?.join('-') || ''),
            location:    co.location || org.hq_location || '',
            userId,
            status: 'pending',
          }
          validated.push(record)

          // Upsert into DB so the discovery scheduler can use it
          await prisma.importedCompany.upsert({
            where:  { domain: co.domain },
            update: record,
            create: record,
          })
        } else {
          notFound.push({ ...co, reason: 'Domain not found in Apollo' })
        }
      }
    }

    res.json({ validatedCount: validated.length, notFoundCount: notFound.length, validated, notFound })
  } catch (e) {
    console.error('[apollo] validate-batch error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ── Company website scraper ───────────────────────────────────────────────────

/**
 * POST /api/fetch-site
 *
 * Fetches a company's public website and returns stripped plain text (≤4000 chars).
 * The AI uses this content to personalise cold emails with company-specific hooks.
 *
 * Falls back from https://<domain> to https://www.<domain> if the first attempt fails.
 * An 8-second AbortController timeout prevents hanging on slow sites.
 *
 * Body:    { url: string }
 * Response: { text: string, url: string }
 */
router.post('/fetch-site', async (req, res) => {
  const { url } = req.body

  // SSRF protection — block private/loopback IPs and invalid URLs
  const check = validateOutboundUrl(url)
  if (!check.safe) {
    return res.status(400).json({ error: `Invalid URL: ${check.reason}` })
  }

  /** Fetch with an 8-second timeout. */
  const tryFetch = async (target) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const r = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
        signal:  controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timer)
      return await r.text()
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  try {
    // Strip protocol and path, try both bare domain and www. prefix
    const base = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    let html
    try   { html = await tryFetch(`https://${base}`) }
    catch { html = await tryFetch(`https://www.${base}`) }

    // Strip scripts, styles, nav, footer — keep only readable content
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 4000) // Cap at 4000 chars to stay within AI context limits

    res.json({ text, url: base })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Resume text extraction ────────────────────────────────────────────────────

/**
 * GET /api/resume-text
 *
 * Extracts and returns plain text from the sender's .docx resume file.
 * Used by the AI to personalize emails with relevant experience snippets.
 *
 * Response: { text: string }
 */
router.post('/fetch-company-research', async (req, res) => {
  const { url, campaignMode = '' } = req.body

  const check = validateOutboundUrl(url)
  if (!check.safe) {
    return res.status(400).json({ error: `Invalid URL: ${check.reason}` })
  }

  const tryFetch = async (target) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const r = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timer)
      return await r.text()
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  try {
    const base = normalizeBaseDomain(url)
    let homepageUrl = `https://${base}`
    let homepageHtml = ''
    try {
      homepageHtml = await tryFetch(homepageUrl)
    } catch {
      homepageUrl = `https://www.${base}`
      homepageHtml = await tryFetch(homepageUrl)
    }

    const pages = [{
      label: 'homepage',
      url: homepageUrl,
      title: extractTag(homepageHtml, 'title'),
      description: extractMetaDescription(homepageHtml),
      text: cleanHtmlToText(homepageHtml).slice(0, 2500),
    }]

    const extraLinks = extractInterestingLinks(homepageHtml, homepageUrl, campaignMode)
    const extraPages = await Promise.all(extraLinks.map(async link => {
      try {
        const html = await tryFetch(link.url)
        return {
          label: link.label,
          url: link.url,
          title: extractTag(html, 'title'),
          description: extractMetaDescription(html),
          text: cleanHtmlToText(html).slice(0, 1800),
        }
      } catch {
        return null
      }
    }))

    pages.push(...extraPages.filter(Boolean))
    const text = buildResearchSummary(pages, campaignMode)

    res.json({
      text,
      url: base,
      pages: pages.map(p => ({ label: p.label, url: p.url, title: p.title })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/resume-text', async (req, res) => {
  try {
    const result = await mammoth.extractRawText({ path: RESUME_PATH })
    res.json({ text: result.value })
  } catch (e) {
    res.status(500).json({ error: `Resume not found: ${e.message}` })
  }
})

/**
 * POST /api/resume-text-upload
 *
 * Extracts plain text from an uploaded .docx sent as a raw binary body.
 * The client posts the file's ArrayBuffer with Content-Type
 * application/octet-stream — mammoth parses the buffer directly.
 *
 * Response: { text: string }
 */
router.post('/resume-text-upload', express.raw({ type: 'application/octet-stream', limit: '15mb' }), async (req, res) => {
  try {
    const buffer = req.body
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: 'Empty or invalid upload body' })
    }
    // Detect type by magic bytes — avoids a custom header (which would need a
    // CORS preflight allowlist entry) and is more reliable than the filename.
    // PDF starts with "%PDF"; .docx is a ZIP starting with "PK".
    const isPdf = buffer.length >= 4 &&
      buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    let text
    if (isPdf) {
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        // pdf-parse v2 injects "-- N of M --" page separators — strip them
        text = result.text.replace(/^\s*-- \d+ of \d+ --\s*$/gm, '').trim()
      } finally {
        await parser.destroy()
      }
    } else {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    }
    if (!text || !text.trim()) {
      return res.status(422).json({ error: 'No readable text found in the document' })
    }
    res.json({ text })
  } catch (e) {
    res.status(500).json({ error: `Failed to parse resume: ${e.message}` })
  }
})

export default router
