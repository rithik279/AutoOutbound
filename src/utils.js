import { CAMPAIGN_MODES, TITLE_BLOCKLIST } from './constants.js'

// Strip protocol, www, trailing paths, and ports from a URL/domain string.
export function normalizeDomain(value = '') {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
}

// Pull the first resolvable domain out of an Apollo org-search response.
export function extractDomainFromOrgResponse(data) {
  const candidates = [
    ...(data?.organizations || []),
    ...(data?.accounts      || []),
    ...(data?.companies     || []),
    ...(data?.results       || []),
  ]
  for (const org of candidates) {
    const domain = normalizeDomain(org?.primary_domain || org?.domain || org?.website_url || '')
    if (domain) return domain
  }
  return ''
}

// Return the best available email field from an Apollo person object.
export function extractEmail(person = {}) {
  return (
    person.email              ||
    person.work_email         ||
    person.primary_email      ||
    person.organization_email ||
    ''
  ).trim()
}

// Flatten the various array shapes that Apollo returns across endpoints.
export function extractEnrichedMatches(data = {}) {
  return [
    ...(data.matches  || []),
    ...(data.people   || []),
    ...(data.contacts || []),
    ...(data.results  || []),
  ]
}

// Deduplicate an array by a key function, preserving insertion order.
export function uniqueBy(items, keyFn) {
  const out  = []
  const seen = new Set()
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

// Download contacts as a CSV file in the browser.
export function exportCSV(contacts, filename = 'contacts') {
  const headers = ['name', 'title', 'company', 'email', 'domain', 'linkedin']
  const rows    = contacts.map(c =>
    headers.map(h => `"${(c[h] || c[h === 'company' ? 'co' : h] || '').toString().replace(/"/g, '""')}"`).join(',')
  )
  const csv  = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Decide whether a contact's title is relevant for the active campaign mode.
 *
 * Recruiting mode uses keyword matching (not exact titles) because recruiter
 * titles are highly variable. All other modes use a blocklist + keyword allow.
 */
export function isTitleRelevant(title, mode) {
  if (!title) return false
  const t = title.toLowerCase()

  if (mode === 'recruiting') {
    const blocklist = CAMPAIGN_MODES.recruiting.blocklist
    if (blocklist.some(bad => t.includes(bad))) return false
    const hasRecruiterKeyword = /\b(recruiter|recruiting|staffing|staff firm|consultant|consulting|delivery|engagement|business development manager)\b/i.test(t)
    if (!hasRecruiterKeyword) return false
    const hasDataKeyword   = /\b(data|analytics|ai|technology|tech|software|engineering|information)\b/i.test(t)
    const hasSeniorKeyword = /\b(senior|lead|director|vp|head|principal|manager|chief|executive|founder|partner)\b/i.test(t)
    return hasDataKeyword || hasSeniorKeyword
  }

  if (TITLE_BLOCKLIST.some(bad => t.includes(bad))) return false
  if (mode === 'startup') {
    return /engineer|cto|chief tech|technology|infrastructure|platform|technical|founder/i.test(t)
  }
  return /data|engineer|risk|technology|technical|infrastructure|platform|analytics|architect/i.test(t)
}
