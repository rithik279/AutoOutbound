// Campaign modes, AI models, and entry-level options used throughout the app.

export const MODELS = [
  { id: 'gpt-4o-mini',              label: 'GPT-4o Mini',     provider: 'openai',     color: '#d97706', cost: '~$0.01', note: 'Cheapest'     },
  { id: 'gpt-4o',                   label: 'GPT-4o',          provider: 'openai',     color: '#16a34a', cost: '~$0.10', note: 'Best OpenAI'  },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic',  color: '#0066cc', cost: '~$0.13', note: 'Best quality' },
]

export const ENTRY_LEVELS = [
  { id: 'scratch',     emoji: '🔍', label: 'From a prompt',            desc: 'Describe who you want to reach — AI finds companies + decision makers via Apollo',             badge: '#7c3aed' },
  { id: 'companies',  emoji: '🏢', label: 'Company list',              desc: 'Paste company names or domains — we find the right people via Apollo + enrich emails',         badge: '#0891b2' },
  { id: 'bulk_import', emoji: '📊', label: 'Bulk import (500+ companies)', desc: 'Upload CSV of companies → daily auto-discovery → auto-draft → review → auto-send',         badge: '#ec4899' },
]

// Avatar background/text color pairs, cycled by first char code of name.
export const AVATAR_COLORS = [
  ['#dbeafe', '#1d4ed8'],
  ['#dcfce7', '#166534'],
  ['#fef3c7', '#92400e'],
  ['#fce7f3', '#9d174d'],
  ['#ede9fe', '#5b21b6'],
]

// Recruiter-mode title list — exact/partial title matches to include.
export const RECRUITER_MODE_TITLES = [
  'Data Engineering Recruiter', 'Data Recruiter', 'Data & AI Recruiter',
  'Analytics Recruiter', 'Data Platform Recruiter', 'Data Scientist Recruiter',
  'Technical Recruiter', 'IT Recruiter', 'Recruiter', 'Staffing Recruiter',
  'Account Manager', 'Client Partner', 'Delivery Partner', 'Client Solutions Manager',
  'Delivery Manager', 'Resource Manager', 'Talent Delivery Lead',
  'Head of Data & Analytics', 'Practice Lead, Data Engineering',
  'Director of Data Recruiting', 'Director of Technology Recruiting',
  'Staffing Consultant', 'Principal Consultant', 'Engagement Manager', 'Principal Recruiter',
  'Business Development Manager', 'Practice Director', 'Delivery Director',
]

// Recruiter-mode title blocklist — substrings that disqualify a title.
export const RECRUITER_MODE_BLOCKLIST = [
  'hr ', 'human resources', 'people ops', 'coordinator', 'executive assistant',
  'legal', 'counsel', 'design', 'designer', 'brand', 'content', 'creative',
  'marketing', 'sales rep', 'sales associate', 'sales executive',
  'community', 'social media', 'public relations', ' pr ', 'info@', 'careers@',
]

// Generic title blocklist for non-recruiting modes.
export const TITLE_BLOCKLIST = [
  'growth', 'marketing', 'sales', 'hr ', 'human resources', 'talent', 'recruit',
  'legal', 'counsel', 'design', 'designer', 'brand', 'content', 'creative',
  'customer success', 'customer experience', 'partnerships', 'partner ',
  'revenue', 'business development', 'biz dev', 'account manager',
  'community', 'social media', 'public relations', ' pr ',
]

export const CAMPAIGN_MODES = {
  finance: {
    id: 'finance',
    label: 'Financial institutions',
    desc: 'Banks, asset managers, insurers — VP/Director of Data Engineering, Head of Data Platforms, Risk Technology',
    color: '#1d4ed8',
    titles: [
      'Director of Data Engineering', 'VP of Data Engineering', 'VP Data Engineering',
      'Head of Data Engineering', 'Head of Data Platforms', 'Director of Data Platforms',
      'Head of Risk Technology', 'Head of Enterprise Data', 'Director of Enterprise Data',
      'Head of Data Infrastructure', 'Director of Data Infrastructure',
    ],
    seniorities: ['director', 'vp', 'head', 'c_suite'],
    promptHint: 'Target financial institutions: banks, asset managers, insurers, credit bureaus. Decision makers are VP/Director of Data Engineering, Head of Data Platforms, Head of Risk Technology.',
  },
  startup: {
    id: 'startup',
    label: 'AI startups',
    desc: "Series A/B AI companies — VP of Engineering or CTO (most haven't hired a Head of Data yet)",
    color: '#7c3aed',
    titles: [
      'VP of Engineering', 'VP Engineering', 'Head of Engineering',
      'CTO', 'Chief Technology Officer', 'Co-Founder & CTO',
      'Director of Engineering', 'Head of Infrastructure', 'Head of Platform Engineering',
    ],
    seniorities: ['vp', 'head', 'c_suite'],
    promptHint: "Target Series A/B AI startups. Decision makers are VP of Engineering or CTO — most haven't hired a dedicated Head of Data yet.",
  },
  recruiting: {
    id: 'recruiting',
    label: 'Recruiting firms',
    desc: 'Data/tech recruiters, account managers, delivery leads — help place you at their clients',
    color: '#059669',
    titles: RECRUITER_MODE_TITLES,
    seniorities: ['senior', 'manager', 'director', 'vp', 'head', 'c_suite'],
    promptHint: 'Target US-based recruiting/staffing firms that place data, analytics, or technical contractors. Reach Data Recruiters, Account Managers, Client Partners, Delivery Managers, and Practice Leads. NOT generic HR, coordinators, or info@ emails.',
    blocklist: RECRUITER_MODE_BLOCKLIST,
  },
}
