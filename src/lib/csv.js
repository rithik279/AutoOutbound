// Parse pasted CSV or file content into contact array
// Handles: name, email, company/organization, title/job_title, domain, linkedin_url
export function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV needs at least a header row and one data row')

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, '_').replace(/__+/g, '_'))

  // Map common header variations
  const map = h => {
    if (/^(first_name|firstname)$/.test(h)) return 'first_name'
    if (/^(last_name|lastname|surname)$/.test(h)) return 'last_name'
    if (/^(full_name|name|contact_name|person)$/.test(h)) return 'name'
    if (/^(email|email_address|work_email)$/.test(h)) return 'email'
    if (/^(company|organization|org|employer|account)$/.test(h)) return 'company'
    if (/^(title|job_title|position|role)$/.test(h)) return 'title'
    if (/^(domain|website|web)$/.test(h)) return 'domain'
    if (/^(linkedin|linkedin_url|li_url|profile)$/.test(h)) return 'linkedin'
    return h
  }

  const mapped = headers.map(map)

  const contacts = []
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i])
    const row = {}
    mapped.forEach((key, idx) => { row[key] = (vals[idx] || '').trim().replace(/^"|"$/g, '') })

    // Resolve name
    let name = row.name || ''
    if (!name && (row.first_name || row.last_name)) {
      name = [row.first_name, row.last_name].filter(Boolean).join(' ')
    }
    if (!name) continue

    const first = row.first_name || name.split(' ')[0]
    const company = row.company || ''
    const email = row.email || ''

    // Derive domain from email if not supplied
    let domain = row.domain || ''
    if (!domain && email.includes('@')) domain = email.split('@')[1]

    contacts.push({
      id: i,
      name,
      first,
      title: row.title || '',
      co: company,
      company,
      email,
      domain,
      linkedin: row.linkedin || '',
      source: 'csv'
    })
  }

  if (contacts.length === 0) throw new Error('No valid contacts found — check your CSV headers')
  return contacts
}

function splitCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}

// Parse the research CSV format:
// Columns: Company Name, Website, Location, Stage, What they do, Why..., Key signal, Role link, Best contact type, LinkedIn
export function parseResearchCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV needs at least a header row and one data row')

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/\s+/g, ' '))

  // Find column indices by keyword matching
  const idx = name => headers.findIndex(h => h.includes(name))
  const nameCol     = idx('company name') !== -1 ? idx('company name') : idx('company')
  const websiteCol  = idx('website')
  const roleCol     = idx('best contact') !== -1 ? idx('best contact') : idx('contact type')
  const stageCol    = idx('stage')
  const summaryCol  = idx('what they do') !== -1 ? idx('what they do') : idx('description')

  if (nameCol === -1) throw new Error('Could not find "Company Name" column')
  if (websiteCol === -1) throw new Error('Could not find "Website" column')

  const companies = []
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i])
    const get = col => col !== -1 ? (vals[col] || '').trim().replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/^"|"$/g, '') : ''

    const name = get(nameCol)
    if (!name) continue

    // Website: strip trailing citation numbers like "chalk.ai 8" → "chalk.ai"
    const rawSite = get(websiteCol).replace(/\s+\d+(\s+\d+)*$/, '').trim()
    const domain = normalizeDomain(rawSite)

    // Stage: strip trailing numbers
    const stage = get(stageCol).replace(/\s+\d+(\s+\d+)*$/, '').trim()

    // Contact type: strip trailing numbers and clean up
    const roleHint = get(roleCol).replace(/\s+\d+(\s+\d+)*$/, '').trim()

    const summary = get(summaryCol).replace(/\s+\d+(\s+\d+)*\s*/g, ' ').trim().slice(0, 200)

    companies.push({
      id: i,
      co: name,
      company: name,
      domain,
      linkedin: '',
      source: 'research_csv',
      roleHint,   // e.g. "Head of Engineering", "Founder", "Data Lead"
      stage,
      summary
    })
  }

  if (companies.length === 0) throw new Error('No valid company rows found — check your CSV headers')
  return companies
}

// Parse a list of "Company Name | domain.com" or just company names
export function parseCompanyList(text) {
  return text.trim().split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map((line, i) => {
      const parts = line.split(/[|,\t]/).map(p => p.trim())
      const name = parts[0]
      const domain = normalizeDomain(parts[1] || (looksLikeDomain(name) ? name : ''))
      const linkedin = parts.find(p => p.includes('linkedin.com')) || ''
      return { id: i + 1, co: name, company: name, domain, linkedin, source: 'company_list' }
    })
}

function looksLikeDomain(value) {
  return /[a-z0-9-]+\.[a-z]{2,}/i.test((value || '').trim())
}

function normalizeDomain(value) {
  const raw = (value || '').trim().toLowerCase()
  if (!raw) return ''
  const stripped = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
  return looksLikeDomain(stripped) ? stripped : ''
}
