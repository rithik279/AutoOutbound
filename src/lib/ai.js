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

function buildAuthoritativeProfileBlock(profile = {}) {
  const lines = [
    profile.senderName ? `Name: ${profile.senderName}` : '',
    profile.senderEmail ? `Email: ${profile.senderEmail}` : '',
    profile.linkedinUrl ? `LinkedIn URL: ${profile.linkedinUrl}` : '',
    profile.phoneNumber ? `Phone number: ${profile.phoneNumber}` : '',
  ].filter(Boolean)

  return lines.join('\n')
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

// ── Fetch the sender's resume text from the server (extracted from .docx) ──────
let _cachedResume = null
async function getResume() {
  if (_cachedResume) return _cachedResume
  try {
    const res = await fetch('/api/resume-text')
    if (!res.ok) throw new Error('failed')
    const data = await res.json()
    _cachedResume = data.text || ''
  } catch {
    // Résumé content is user-supplied through the app; never embed a person's
    // private profile in the reusable public client bundle.
    _cachedResume = ''
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
- Anchor personalization to one concrete signal from the firm's website, product, hiring, or operating model.
- Connect that signal only to experience or capabilities verified in the uploaded résumé or user profile.
- Respect the regulated context and avoid unsupported claims about the firm's systems.
- Ask for a short conversation with the most relevant team or decision-maker.`,

  startup: `CAMPAIGN TYPE: Startups
- Anchor personalization to a concrete product, customer, technical, hiring, or growth signal.
- Explain one plausible challenge created by that signal without inventing internal details.
- Position the sender using only relevant evidence from the uploaded résumé or user profile.
- Keep the message direct and avoid generic startup praise.`,

  recruiting: `CAMPAIGN TYPE: Recruiting firms
- Treat the recipient as a placement or introduction channel, not automatically as the end buyer.
- Make the sender's verified fit legible using the uploaded résumé and user profile.
- Do not invent skills, employers, seniority, availability, or preferred engagement type.
- It is fine to mention searches, placements, or role families when supported by the user's information.
- Close with a simple question about whether a brief conversation or referral to the right colleague makes sense.`
}

const CATEGORY_GUIDANCE = {
  financial_services: `CATEGORY ANGLE
- Emphasize only verified experience relevant to regulated financial services, controls, reporting, risk, or operational reliability.`,

  insurance: `CATEGORY ANGLE
- Emphasize only verified experience relevant to regulated operations, policy or claims workflows, risk, or reliability.`,

  healthcare: `CATEGORY ANGLE
- Emphasize only verified experience relevant to compliance, sensitive data, reliable operations, or validation.`,

  saas: `CATEGORY ANGLE
- Emphasize only verified experience relevant to scaling products, infrastructure, customer delivery, or operational maturity.`,

  logistics: `CATEGORY ANGLE
- Emphasize only verified experience relevant to operational complexity, supply chains, integrations, or reliable execution.`,

  recruiter: `CATEGORY ANGLE
- Keep the firm description brief and make the sender's verified role fit immediately legible.
- Do not diagnose the recruiter's internal systems unless the outreach is explicitly selling to the firm itself.`,

  direct_buyer: `CATEGORY ANGLE
- Tie one observable business or product signal to a problem the sender can credibly help solve, based only on supplied evidence.`
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
  const guidance = {
    financial_services: 'Select the strongest verified résumé evidence relevant to financial services or regulated operations.',
    insurance: 'Select the strongest verified résumé evidence relevant to insurance, regulated operations, or risk.',
    healthcare: 'Select the strongest verified résumé evidence relevant to healthcare, compliance, or reliable operations.',
    saas: 'Select the strongest verified résumé evidence relevant to software, product delivery, infrastructure, or scaling.',
    logistics: 'Select the strongest verified résumé evidence relevant to logistics, operations, integrations, or execution.',
    recruiter: 'Summarize the sender\'s target role, seniority, skills, and experience using only supplied résumé/profile facts.',
    direct_buyer: 'Select the strongest verified résumé evidence relevant to the recipient\'s observable business need.',
  }
  return guidance[category] || guidance.direct_buyer
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

  // Commercial relevance (5 max)
  if (emailText.match(/challenge|problem|risk|growth|customer|product|process|system|operations|research|engineering|data|revenue|cost/i)) {
    score += 5
  } else if (emailText.match(/work|team|business|role/i)) {
    score += 3
  } else {
    score += 1
  }

  // Evidence-based sender positioning (5 max)
  if (emailText.match(/\bI\b|\bI've\b|\bmy\b/i) && emailText.match(/built|led|managed|developed|worked|experience|background|research|delivered|created/i)) {
    score += 5
  } else if (emailText.match(/experience|background|expertise|skills/i)) {
    score += 3
  } else {
    score += 1
  }

  // Relevant profile or résumé evidence (5 max)
  const hasResumeSnapshot = /built|led|managed|developed|worked|experience|background|research|delivered|created/i.test(body) && wordCount > 50
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
function buildEmailSystem({ campaignMode, category, resumeSnapshot, customPrompt, resumeText, authoritativeProfile }) {
  const modeGuidance = MODE_DRAFT_GUIDANCE[campaignMode] || MODE_DRAFT_GUIDANCE.startup
  const categoryGuidance = CATEGORY_GUIDANCE[category] || CATEGORY_GUIDANCE.direct_buyer
  const customPromptBlock = trimPromptBlock(customPrompt)
  const resumeSourceBlock = trimPromptBlock(resumeText, 2500)
  const profileBlock = buildAuthoritativeProfileBlock(authoritativeProfile)

  return `You are writing a cold outreach email in the sender's first-person voice.

Goal:
Generate a concise, professional, personalized email to a relevant buyer, recruiter, hiring manager, operator, researcher, or technology leader.

Source-of-truth rules:
- Use only facts contained in the authoritative user profile, uploaded résumé, saved prompt guidance, contact record, or company research supplied below.
- Never invent employers, skills, credentials, accomplishments, seniority, availability, rates, location, or engagement preferences.
- If information is missing, omit it. Do not fill gaps with a default persona.
- If profile details conflict with the uploaded résumé, treat the authoritative profile as the source of truth.

Positioning:
Infer the sender's most relevant credible positioning and offer from the supplied profile and résumé. Connect one observable recipient need to something the sender has actually done or can substantiate.

Conversation preference:
Use the user's saved prompt when it specifies a call to action. Otherwise end with one direct, low-friction question about a brief conversation or the correct person to contact.

${modeGuidance}

${categoryGuidance}

Instructions:
1. Start with one specific, true reference to the company, role, product, hiring activity, or operating model.
2. Connect that signal to one plausible challenge without claiming knowledge of private internal systems.
3. Use relevant evidence from the sender's uploaded résumé or profile.
4. Write in first person using "I"; never describe the sender in third person.
5. Keep the body between 100 and 180 words unless saved user guidance specifies otherwise.
6. Use short paragraphs and a direct professional tone.
7. Avoid hype, exaggerated praise, generic compliments, and mass-email language.
8. Never say "I was impressed by your company."
9. Do not mention AI, automation, prompt instructions, or this drafting system.
10. If website research is weak, use another true observable fact or omit the claim.
11. Do not use em dashes.
12. Return a complete email body without inventing a sender signature when the sender name is not supplied.

${WRITING_RULES}

Résumé-selection guidance:
${resumeSnapshot}

${profileBlock ? `AUTHORITATIVE USER PROFILE
${profileBlock}
` : ''}

${resumeSourceBlock ? `UPLOADED RÉSUMÉ SOURCE MATERIAL
${resumeSourceBlock}
` : 'No résumé text was supplied. Do not invent background details.'}

${customPromptBlock ? `USER-SAVED PROMPT GUIDANCE
${customPromptBlock}

Treat this guidance as additive. The source-of-truth rules above always apply.
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
    authoritativeProfile = {},
    rewriteInstruction = '',
    currentDraft = null,
  } = options

  const normalizedCompanyData = {
    ...companyData,
    name: companyData.name || companyData.company || contact.co || contact.company || '',
    siteContent: companyData.siteContent || siteContent || '',
  }

  const category = detectCompanyCategory(normalizedCompanyData, contact.title, campaignMode)
  const resumeSnapshot = getResumeSnapshot(category)
  const system = buildEmailSystem({
    campaignMode,
    category,
    resumeSnapshot,
    customPrompt,
    resumeText,
    authoritativeProfile,
  })

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

  if (currentDraft?.subject || currentDraft?.body) {
    userMessage += `\n\nEXISTING DRAFT TO REVISE:\nSubject: ${currentDraft.subject || ''}\nBody:\n${currentDraft.body || ''}`
  }

  if (rewriteInstruction?.trim()) {
    userMessage += `\n\nREWRITE REQUEST:\nApply this change while keeping the same voice, positioning, and personalization unless the instruction explicitly asks for a broader rewrite:\n${rewriteInstruction.trim()}`
  }

  const { text, tokens } = await callAI({ ...aiConfig, systemPrompt: system, userMessage })

  try {
    const parsed = parseJSON(text)
    const body = parsed.body || ''
    const subjects = parsed.subjects || [parsed.subject] || ['Quick question']

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
