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
