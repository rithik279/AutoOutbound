// All AI calls go through our Express proxy at /api/ai/chat
// which adds the API keys server-side — keys never touch the browser
export async function callAI({ model, systemPrompt, userMessage }) {
  const isAnthropic = model.startsWith('claude')

  const body = isAnthropic
    ? { model, max_tokens: 1000, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }
    : { model, max_tokens: 1000, temperature: 0.85, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.error?.message || e?.error || `AI ${res.status}`)
  }
  const data = await res.json()

  if (isAnthropic) {
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    return { text, tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) }
  } else {
    return {
      text: data.choices?.[0]?.message?.content || '',
      tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0)
    }
  }
}

export function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found in response')
  return JSON.parse(match[0])
}

// ── Prompt → Apollo search params ──────────────────────────────────────────
export async function promptToApolloParams(userPrompt, aiConfig, campaignMode) {
  const modeHint = campaignMode?.promptHint || ''
  const exampleTitles = (campaignMode?.titles || ['VP of Data Engineering', 'Director of Data Engineering']).slice(0, 4).join('", "')
  const validSeniorities = JSON.stringify(campaignMode?.seniorities || ['director', 'vp', 'head', 'c_suite'])

  const system = `You translate a natural language prospecting description into Apollo.io API search parameters.
Campaign context: ${modeHint}
Return ONLY valid JSON with these keys (all optional):
{
  "person_titles": ["${exampleTitles}", ...],
  "person_seniorities": ${validSeniorities},
  "organization_num_employees_ranges": ["1000,5000"],
  "organization_locations": ["United States"],
  "q_organization_domains_list": ["only if specific domains are mentioned"],
  "q_keywords": "broad keyword if no other filter applies",
  "per_page": 5,
  "reasoning": "one sentence explanation"
}
Valid person_seniorities values: owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern`

  const { text } = await callAI({ ...aiConfig, systemPrompt: system, userMessage: userPrompt })
  return parseJSON(text)
}

// ── Prompt → Apollo org search params ──────────────────────────────────────
export async function promptToApolloOrgParams(userPrompt, aiConfig) {
  const system = `You translate a natural language company description into Apollo.io organization search parameters.
Return ONLY valid JSON with these keys (all optional):
{
  "organization_locations": ["United States"],
  "organization_num_employees_ranges": ["50,500"],
  "q_keywords": "industry keywords like 'artificial intelligence fintech'",
  "per_page": 15,
  "reasoning": "one sentence explanation"
}
Size range format: "min,max" — e.g. "50,500" means 50–500 employees.
For large enterprises use "1000,50000". For startups use "10,500".
Keep q_keywords focused: 2–4 words describing the industry or product type.`

  const { text } = await callAI({ ...aiConfig, systemPrompt: system, userMessage: userPrompt })
  return parseJSON(text)
}

// ── Fetch Manmit's resume text from the server (extracted from .docx) ──────
let _cachedResume = null
async function getResume() {
  if (_cachedResume) return _cachedResume
  try {
    const res = await fetch('/api/resume-text')
    if (!res.ok) throw new Error('failed')
    const data = await res.json()
    _cachedResume = data.text || ''
  } catch {
    // fallback summary if endpoint unavailable
    _cachedResume = `Manmit Singh — Senior Data Engineering Contractor, Toronto (remote, USD contracts).
24 years IT, 18+ years ETL/data pipelines. Tools: Informatica IICS/PowerCenter, Talend, ADF, GCP, Python, SQL.
Key clients: Parkland/Sunoco, Scotiabank, TD, Rogers, Finastra, Co-operators.
Available for remote USD senior contract roles. Not a job seeker.`
  }
  return _cachedResume
}

// ── Human writing rules (condensed for system prompt) ──────────────────────
const WRITING_RULES = `
WRITING RULES — follow without exception:
- Say the specific thing. Not the inflated version. Not the hedged version.
- Use "is" and "has" directly. Never "serves as", "stands as", "represents", "boasts", "features".
- No em dashes.
- Contractions are fine: "I've", "don't", "it's".
- Vary sentence length. Mix short sentences with longer ones. Not every sentence the same length.
- Sentence fragments work for emphasis.
- No rule-of-three lists. Two items or four — whatever the content actually needs.
- No present-participle danglers: never "highlighting X", "emphasizing Y", "ensuring Z" as trailing clauses.
- No "not only X but Y" constructions.
- BANNED WORDS — using any of these will fail the review: additionally, crucial, delve, emphasize, foster, garner, highlight (verb), landscape, multifaceted, nuanced, pivotal, showcase, testament, underscore, robust, comprehensive, notably, significant, vibrant, ensure, enhance, commitment to, groundbreaking, renowned, profound, evolving, innovative.
- No promotional language. Write like a journalist. Don't sell.
- No weasel attributions: "industry reports suggest", "experts say".
- No inflation sentences: sentences that state something matters without saying what it is.
- The Stranger Test: every sentence must contain information specific to this company. If it could appear in any other email with the nouns swapped, rewrite it.
`

// ── Build email drafting system prompt ─────────────────────────────────────
function buildEmailSystem(campaignMode, resumeText) {
  const isStartup = campaignMode === 'startup'

  const modeContext = isStartup
    ? `CAMPAIGN TYPE: AI/tech startup.
The recipient's company has built fast and now has a production data problem. They moved from prototype to real customers and the data stack didn't keep up. Manmit's 24 years of enterprise ETL discipline is exactly what they're missing — they probably don't have a Head of Data yet.
Angle: fragile pipelines under load, ad hoc scripts that don't scale, compliance/data quality catching up with them. Position Manmit as someone who has seen this exact transition before and knows what breaks.`
    : `CAMPAIGN TYPE: Financial institution.
The recipient is at a bank, asset manager, insurer, or financial infrastructure company. These organisations run complex, regulation-heavy data pipelines under constant pressure — regulatory deadlines, cloud migrations, data quality problems.
Angle: reliability, regulatory delivery, Informatica expertise, financial services track record. Manmit's Scotiabank/TD/Finastra background is directly relevant.`

  return `You draft cold outreach emails for Manmit Singh, a senior data engineering contractor.

MANMIT'S RESUME (use this as context — pick the most relevant experience for this specific company):
${resumeText}

${modeContext}

STRUCTURE — follow exactly, no labels:
1. Subject: max 7 words. Specific to their actual product or infrastructure. Not a question. Not generic.
2. Greeting: "Hi [first name]," on its own line. Always "Hi Name," — never just "Name,".
3. Hook paragraph: ONE specific, non-obvious detail from the company website about what they're building or how their system works. Not their funding round. Not their headcount. Something about the actual product or technical approach. 1-2 sentences max.
4. Problem paragraph: What data engineering problem does that create? Say what actually breaks or slows down. 1-2 sentences. Blank line before this paragraph.
5. Credential paragraph: Pick ONE engagement from the resume that is most relevant to this company's situation. Name the client and what was built. Then offer: "I can step in as senior contract capacity if timing works. Worth a quick call?" Blank line before this paragraph.
6. Sign-off: blank line, then "Best,\\nManmit"

CONSTRAINTS:
- Body is max 130 words (not counting subject or sign-off).
- Every paragraph is separated by a blank line. No wall of text.
- No job posting references. No "I saw you're hiring". No applying language whatsoever.
- Manmit is not a candidate. He's a senior operator offering to solve a problem faster than a hire would.
- Never list more than one client credential — pick the most relevant one from the resume.
- The hook must be specific enough that it cannot appear in any other company's email.

${WRITING_RULES}

Return ONLY valid JSON, no markdown: {"subject":"...","body":"..."}`
}

// ── Fetch company website via server proxy ─────────────────────────────────
export async function fetchSiteContent(domain) {
  if (!domain) return ''
  try {
    const res = await fetch('/api/fetch-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: domain })
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.text || ''
  } catch {
    return ''
  }
}

// ── Draft one email ────────────────────────────────────────────────────────
export async function draftEmail(contact, aiConfig, campaignMode, siteContent) {
  const resumeText = await getResume()
  const system = buildEmailSystem(campaignMode, resumeText)

  const firstName = contact.first || contact.name?.split(' ')[0] || contact.name
  const title = contact.title ? `, ${contact.title}` : ''
  const siteSection = siteContent
    ? `\n\nCOMPANY WEBSITE CONTENT (use this for the hook — find one specific technical or product detail):\n${siteContent.slice(0, 3500)}`
    : '\n\n(No website content available — use the company name and domain to infer a plausible specific hook, but keep it conservative.)'

  const user = `Draft a cold email to ${firstName}${title} at ${contact.co || contact.company} (${contact.domain || 'unknown domain'}).${siteSection}`

  const { text, tokens } = await callAI({ ...aiConfig, systemPrompt: system, userMessage: user })
  const parsed = parseJSON(text)
  return { ...parsed, tokens }
}
