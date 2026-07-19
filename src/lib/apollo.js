// All Apollo calls go through our Express proxy at /api/apollo/*
// which adds the API key server-side

async function apolloPost(path, body, apiKey) {
  const res = await fetch(`/api/apollo/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-apollo-key': apiKey
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || err?.message || `Apollo ${res.status}`)
  }
  return res.json()
}

// Search people in Apollo database (returns IDs, no emails yet)
export async function searchPeople(params, apiKey) {
  return apolloPost('mixed_people/api_search', {
    per_page: params.per_page || 3,
    ...params
  }, apiKey)
}

// Enrich up to 10 people at once to get emails
export async function bulkEnrich(people, apiKey) {
  return apolloPost('people/bulk_match', {
    details: people,
    reveal_personal_emails: false
  }, apiKey)
}

// Discover decision makers via server-side web search — replacement for the
// Apollo people-search API, which (like ALL Apollo API endpoints) is blocked
// on free plans. Returns [{ first_name, last_name, title, company, domain,
// linkedin_url }] with no emails; feed each result to findEmailViaWeb.
export async function findPeopleViaWeb(params) {
  const res = await fetch('/api/find-people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || err?.message || `find-people ${res.status}`)
  }
  const data = await res.json()
  return data.people || []
}

// Find a person's work email from public web sources (published addresses or
// the company's email pattern). Returns { email, method, confidence, evidence }
// with email '' when nothing was found.
export async function findEmailViaWeb(person) {
  const res = await fetch('/api/find-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: person.first_name,
      last_name: person.last_name,
      company: person.company || '',
      domain: person.domain || ''
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || err?.message || `find-email ${res.status}`)
  }
  return res.json()
}

// Search organisations
export async function searchOrgs(params, apiKey) {
  return apolloPost('mixed_companies/search', {
    per_page: params.per_page || 10,
    ...params
  }, apiKey)
}

// Find top decision maker at a single domain
export async function findDecisionMaker(domain, titles, apiKey) {
  const data = await searchPeople({
    q_organization_domains_list: [domain],
    person_titles: titles,
    person_seniorities: ['director', 'vp', 'head', 'c_suite'],
    per_page: 3
  }, apiKey)
  return data.people || []
}

// Enrich a list of Apollo person IDs — batches of 10
export async function enrichBatch(ids, apiKey, onProgress) {
  const results = []
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10).map(id => ({ id }))
    const data = await bulkEnrich(batch, apiKey)
    results.push(...(data.matches || []))
    if (onProgress) onProgress(Math.min(i + 10, ids.length), ids.length)
    if (ids.length > 10) await sleep(400) // rate limit courtesy
  }
  return results
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
