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

function trimPromptBlock(text = '', maxChars = 1800) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars)
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

const MODE_DRAFT_GUIDANCE = {
  finance: `CAMPAIGN TYPE: Financial institutions
- Recipient is a data or technology buyer inside a bank, insurer, asset manager, payments company, or similar regulated institution.
- Personalization should anchor to one concrete signal from the website, product, hiring, or operating model.
- Tie that signal to regulatory reporting, reconciliation, data quality, production reliability, migration risk, or enterprise ETL modernization.
- Position the consultant as someone who has already worked in banking-grade environments and can step into complex delivery quickly.
- Ask for a short conversation with the internal data/platform/risk technology team. Do not sound like a generic services pitch.`,

  startup: `CAMPAIGN TYPE: AI startups
- Recipient is usually a VP of Engineering, CTO, or infrastructure/platform leader at a scaling AI company.
- Personalization should anchor to product architecture, integrations, data flows, evaluation pipelines, customer scale, or hiring signals.
- Tie that signal to fragile pipelines, warehouse maturity, orchestration, production reliability, or moving from prototype systems into durable internal data infrastructure.
- Position the consultant as senior contract capacity who can help mature the stack without long ramp-up.
- Do not write like a recruiter outreach or a generic consulting brochure.`,

  recruiting: `CAMPAIGN TYPE: Recruiting firms
- Recipient works at a recruiting or staffing firm. They are not the end client for data engineering services.
- Write to them as a placement channel for their clients, not as a company that needs its own ETL modernization.
- Do NOT pitch data engineering work for the recruiting firm's internal systems.
- Do NOT write as though you are applying for a job or asking for employment.
- Make the fit scannable: senior ETL / data engineering contractor, enterprise ETL, Informatica / IICS, SQL, Python, Airflow, dbt, Snowflake, migration, production support.
- It is fine to mention contract searches, placements, or the kinds of roles you usually fit.
- Close with a simple ask: whether a quick 15-minute conversation makes sense, or whether someone else on their team handles these searches.
- If website research is thin, fall back to what the firm places, their vertical focus, or their delivery model.`
}

const CATEGORY_GUIDANCE = {
  financial_services: `CATEGORY ANGLE
- Emphasize regulated data, reconciliation, reporting, controls, and reliability.
- Mention banking or financial services experience when relevant.`,

  insurance: `CATEGORY ANGLE
- Emphasize regulated operational data, claims or policy workflows, validation, and reconciliation.`,

  healthcare: `CATEGORY ANGLE
- Emphasize reliable, compliant pipelines and validation in high-regulation environments.`,

  saas: `CATEGORY ANGLE
- Emphasize scaling data infrastructure, maturing warehouse design, orchestration, and production support.`,

  logistics: `CATEGORY ANGLE
- Emphasize high-volume operational data, integration complexity, and reliable reporting across systems.`,

  recruiter: `CATEGORY ANGLE
- This is recruiter-mode writing. Keep the firm description brief and make the candidate fit immediately legible.
- Do not overdo internal technical diagnosis of the recruiter's own company.`,

  direct_buyer: `CATEGORY ANGLE
- Assume a direct buyer. Tie one business or product signal to an ETL, migration, reporting, data quality, or production reliability need.`
}

// ── Detect company category from industry or company type ──────────────────
function detectCompanyCategory(company = {}, recipientTitle = '', campaignMode = '') {
  if (campaignMode === 'recruiting') return 'recruiter'

  const industry = (company.industry || '').toLowerCase()
  const name = (company.name || company.company || '').toLowerCase()
  const title = (recipientTitle || '').toLowerCase()
  const website = (company.siteContent || '').toLowerCase()
  const recruiterSignals = `${name} ${industry} ${title} ${website}`

  // Recruiter detection
  if (/\b(recruiter|recruiting|staffing|talent acquisition|talent partner|client partner|account manager|delivery manager|delivery lead|practice lead|practice director|search consultant)\b/i.test(recruiterSignals)) {
    return 'recruiter'
  }

  // Financial Services
  if (industry.includes('bank') || industry.includes('fintech') || industry.includes('payment') ||
      industry.includes('finance') || industry.includes('credit') || industry.includes('lending') ||
      industry.includes('wealth') || industry.includes('capital markets') || industry.includes('asset manager')) {
    return 'financial_services'
  }

  // Insurance
  if (industry.includes('insurance') || industry.includes('insurtech') || industry.includes('claims') ||
      industry.includes('benefits') || industry.includes('health insurance')) {
    return 'insurance'
  }

  // Healthcare / Pharma
  if (industry.includes('healthcare') || industry.includes('pharma') || industry.includes('biotech') ||
      industry.includes('clinical') || industry.includes('healthtech') || industry.includes('diagnostic')) {
    return 'healthcare'
  }

  // SaaS / Enterprise Software
  if (industry.includes('saas') || industry.includes('software') || industry.includes('enterprise') ||
      industry.includes('cybersecurity') || industry.includes('subscription') || industry.includes('platform')) {
    return 'saas'
  }

  // Logistics / Operations
  if (industry.includes('logistics') || industry.includes('supply chain') || industry.includes('retail') ||
      industry.includes('manufacturing') || industry.includes('operations') || industry.includes('fulfillment')) {
    return 'logistics'
  }

  // Default: assume direct buyer
  return 'direct_buyer'
}

// ── Get resume snapshot based on company category ────────────────────────────
function getResumeSnapshot(category) {
  const snapshots = {
    financial_services: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Strong banking and financial services data pipeline experience
* Informatica PowerCenter / IICS, SQL, data warehousing, validation, and reconciliation
* Production support experience for critical reporting and operational workflows
* Currently focused on Python, Airflow, dbt, Snowflake, and cloud data modernization`,

    insurance: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Deep experience with regulated, high-volume operational data
* Informatica PowerCenter / IICS, SQL, data warehousing, validation, and reconciliation
* Claims and transaction data pipeline expertise
* Strong data quality, governance, and production support background`,

    healthcare: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Experience building reliable, compliant data pipelines in high-regulation environments
* Informatica PowerCenter / IICS, SQL, data warehousing, and validation expertise
* Strong focus on data quality, reconciliation, and production support
* Currently focused on Python, Airflow, dbt, Snowflake, and cloud data stacks`,

    saas: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Experience helping scaling teams mature data infrastructure and warehouse design
* Informatica PowerCenter / IICS, SQL, data warehousing, production support, and performance tuning
* Data migration, validation, reconciliation expertise
* Current focus on Python, Airflow, dbt, Snowflake, and cloud data platforms`,

    logistics: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Deep experience with operational data across inventory, transactions, and fulfillment systems
* Informatica PowerCenter / IICS, SQL, data warehousing, validation, and reconciliation
* Strong focus on data reliability and integration across complex systems
* Currently focused on Python, Airflow, dbt, Snowflake, and cloud data stacks`,

    recruiter: `Best-fit roles:
* Senior ETL Developer
* Informatica / IICS Consultant
* Data Engineering Contractor
* Snowflake Data Engineer
* Airflow / dbt Data Engineer
* ETL Modernization Consultant
* Data Warehouse / Migration Consultant

Core background: 20+ years enterprise ETL, Informatica PowerCenter / IICS, SQL, data warehousing, production support, performance tuning, validation, reconciliation, Python, Airflow, dbt, Snowflake, cloud data stacks.`,

    direct_buyer: `Relevant background:
* 20+ years in enterprise ETL and data engineering
* Deep experience with Informatica PowerCenter / IICS, SQL, and data warehousing
* Built and supported mission-critical pipelines for banks and large financial institutions
* Currently focused on Python, Airflow, dbt, Snowflake, Databricks, and cloud data stacks
* Strong fit for ETL modernization, migration, validation, reconciliation, and production support`
  }

  return snapshots[category] || snapshots.direct_buyer
}

// ── Score email quality based on rubric ────────────────────────────────────
export function scoreEmail(subject, body, category = 'direct_buyer') {
  const emailText = `${subject}\n${body}`
  const wordCount = emailText.split(/\s+/).length
  const bodyWordCount = body.split(/\s+/).length

  let score = 0

  // Personalization (5 max)
  if (emailText.includes('{') || emailText.includes('undefined')) {
    score += 0 // Template not filled
  } else if (emailText.match(/specific|signal|notice|noticed|saw|found/i)) {
    score += 5 // High personalization
  } else if (emailText.match(/company|team|industry/i)) {
    score += 3 // Generic but has company ref
  } else {
    score += 1 // Low personalization
  }

  // Commercial Relevance (5 max)
  if (emailText.match(/ETL|modernization|migration|pipeline|data|warehouse|transformation/i)) {
    score += 5 // Clear business case
  } else if (emailText.match(/technical|engineering/i)) {
    score += 3 // Somewhat relevant
  } else {
    score += 1 // Low relevance
  }

  // Positioning (5 max)
  if (emailText.match(/senior|contractor|specialist|operator/i) && !emailText.match(/job|candidate|seek|looking for|apply/i)) {
    score += 5 // Senior operator tone
  } else if (emailText.match(/experience|background/i)) {
    score += 3 // Qualified but generic
  } else {
    score += 1 // Job-seeker tone
  }

  // Resume Snapshot (5 max)
  const hasResumeSnapshot = /background|experience|expertise/i.test(body) && wordCount > 50
  score += hasResumeSnapshot ? 5 : (wordCount > 40 ? 3 : 1)

  // CTA (5 max)
  if (emailText.match(/conversation|call|chat|discuss|connect/i) && !emailText.match(/available|rate|contract|hire|employ/i)) {
    score += 5 // Low-friction CTA
  } else if (emailText.match(/reach out|contact/i)) {
    score += 3 // Mild CTA
  } else {
    score += 1 // No clear CTA
  }

  // Constraint checks
  const maxWords = category === 'recruiter' ? 220 : 180
  if (bodyWordCount > maxWords) score -= 2
  if (emailText.includes('---') || emailText.includes('—')) score -= 1 // em dashes
  if (emailText.match(/buzzword|innovative|cutting-edge|industry-leading/i)) score -= 1

  return Math.max(0, Math.min(25, score))
}

// ── Build email system prompt using guidelines ────────────────────────────────
function buildEmailSystem({ campaignMode, category, resumeSnapshot, customPrompt, resumeText }) {
  const modeGuidance = MODE_DRAFT_GUIDANCE[campaignMode] || MODE_DRAFT_GUIDANCE.startup
  const categoryGuidance = CATEGORY_GUIDANCE[category] || CATEGORY_GUIDANCE.direct_buyer
  const customPromptBlock = trimPromptBlock(customPrompt)
  const resumeSourceBlock = trimPromptBlock(resumeText, 2500)

  return `You are writing a cold outreach email for a senior ETL / data engineering contractor.

Goal:
Generate a concise, professional, personalized cold email to a potential buyer, recruiter, hiring manager, data leader, or technology leader.

Candidate positioning:
The consultant is a senior ETL / data engineering contractor with 20+ years of experience across banks, large financial institutions, and enterprise data environments. They have deep experience with Informatica PowerCenter / IICS, SQL, data warehousing, production support, performance tuning, validation, reconciliation, data migration, and enterprise ETL workflows. They are now focused on Python, Airflow, dbt, Snowflake, Databricks, and modern cloud data stacks.

Core offer:
The consultant helps companies modernize legacy ETL and data warehouse workflows into reliable Python, Airflow, dbt, Snowflake, Databricks, and cloud data pipelines while preserving business logic, data quality, reconciliation, validation, and production reliability.

Conversation preference:
The consultant should not lead with availability, rate, or remote USD contract wording. The email should simply ask whether a quick 15-minute conversation would make sense, or whether someone else is the better person to speak with.

${modeGuidance}

${categoryGuidance}

Instructions:
1. Start with a specific reference to the company's website, business, hiring, product, industry, or data signal.
2. Connect that signal to a likely data engineering, ETL, migration, data quality, reconciliation, reporting, or modernization need.
3. Position the consultant as a senior ETL / data engineering contractor, not as a generic job seeker.
4. Include the relevant resume snapshot inside the email body.
5. Emphasize the bridge between legacy ETL experience and modern data stack execution.
6. Keep the body between 120 and 180 words unless the contact category is Recruiter, where up to 220 words is acceptable.
7. Use short paragraphs.
8. Use a professional, direct, senior tone.
9. Avoid hype, exaggeration, and generic compliments.
10. Avoid saying "I was impressed by your company."
11. Avoid sounding automated or mass-generated.
12. Do not mention that an automation tool or AI system was used.
13. Do not include large consulting firms, offshore IT firms, or subcontracting language unless the target is explicitly a recruiter.
14. End with one clear CTA asking whether a quick 15-minute conversation would make sense, or whether someone else is the better person to speak with.
15. Do not use em dashes.
16. Always write in first person as the consultant using "I". Never refer to the consultant in third person.
17. If the campaign type is Recruiting firms, the recruiter is not buying internal data engineering from us. They are evaluating whether to place me with their clients.
18. If website content is weak, use a true observable company fact. Do not invent technical stack details.
19. Keep the opening sentence concrete. No "I was impressed", "I noticed you're innovative", or generic admiration.

${WRITING_RULES}

Resume snapshot:
${resumeSnapshot}

${resumeSourceBlock ? `Uploaded resume source material:
${resumeSourceBlock}
` : ''}

${customPromptBlock ? `User-saved prompt guidance:
${customPromptBlock}

Treat the saved prompt guidance as additive only. Campaign-type rules above take precedence if there is a conflict.
` : ''}

Output format — return ONLY valid JSON, no markdown:
{"subjects":["Subject 1","Subject 2","Subject 3"],"body":"Email body here"}`
}

// ── Fetch company website via server proxy ─────────────────────────────────
export async function fetchSiteContent(domain, campaignMode = '') {
  if (!domain) return ''
  try {
    const res = await fetch('/api/fetch-company-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: domain, campaignMode })
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.text || ''
  } catch {
    return ''
  }
}

// ── Draft one email with category detection and scoring ────────────────────
export async function draftEmail(contact, aiConfig, options = {}) {
  const {
    campaignMode = 'startup',
    companyData = {},
    siteContent = '',
    customPrompt = '',
    resumeText = '',
  } = options

  const normalizedCompanyData = {
    ...companyData,
    name: companyData.name || companyData.company || contact.co || contact.company || '',
    siteContent: companyData.siteContent || siteContent || '',
  }

  const category = detectCompanyCategory(normalizedCompanyData, contact.title, campaignMode)
  const resumeSnapshot = getResumeSnapshot(category)
  const system = buildEmailSystem({ campaignMode, category, resumeSnapshot, customPrompt, resumeText })

  const firstName = contact.first || contact.name?.split(' ')[0] || contact.name
  const title = contact.title ? `, ${contact.title}` : ''
  const company = contact.co || contact.company || 'their company'
  const domain = contact.domain || 'unknown domain'

  let userMessage = `Draft a cold email to ${firstName}${title} at ${company} (${domain}).`

  // Add company context if available
  if (normalizedCompanyData.industry) {
    userMessage += ` Industry: ${normalizedCompanyData.industry}.`
  }
  if (normalizedCompanyData.description) {
    userMessage += ` Company description: ${normalizedCompanyData.description}.`
  }

  // Add website signal if available
  if (normalizedCompanyData.siteContent) {
    userMessage += `\n\nCOMPANY RESEARCH SUMMARY (use one specific, true signal for personalization and do not invent stack details):\n${normalizedCompanyData.siteContent.slice(0, 3500)}`
  }

  userMessage += `\n\nCAMPAIGN MODE: ${campaignMode}\nEMAIL CATEGORY: ${category}`

  const { text, tokens } = await callAI({ ...aiConfig, systemPrompt: system, userMessage })

  try {
    const parsed = parseJSON(text)
    const body = parsed.body || ''
    const subjects = parsed.subjects || [parsed.subject] || ['Senior ETL Contractor']

    // Score the draft
    const mainSubject = subjects[0] || ''
    const score = scoreEmail(mainSubject, body, category)

    return {
      subjects,
      body,
      tokens,
      score,
      category,
      passed: score >= 18
    }
  } catch (e) {
    console.error('Failed to parse email draft:', e)
    return {
      subjects: ['Draft failed'],
      body: text || 'Failed to generate email',
      tokens,
      score: 0,
      category,
      passed: false,
      error: e.message
    }
  }
}
