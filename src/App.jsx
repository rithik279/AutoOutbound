import { useState, useRef, useCallback, useEffect } from 'react'
import { searchPeople, bulkEnrich, searchOrgs } from './lib/apollo.js'
import { draftEmail, fetchSiteContent, promptToApolloParams, promptToApolloOrgParams } from './lib/ai.js'
import { parseCSV, parseCompanyList, parseResearchCSV } from './lib/csv.js'

// ── STYLES ─────────────────────────────────────────────────────────────────
const c = {
  card: { background: '#fff', borderRadius: 12, border: '1px solid #e5e5e0', padding: '20px 24px' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  h3: { fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
  label: { fontSize: 12, color: '#666', marginBottom: 5, display: 'block', fontWeight: 500 },
  muted: { fontSize: 13, color: '#666' },
  small: { fontSize: 11, color: '#999' },
  row: { display: 'flex', gap: 12 },
  primaryBtn: { background: '#111', color: '#fff', padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8 },
  ghostBtn: { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8 },
  successBtn: { background: '#dcfce7', color: '#166534', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8 },
  dangerBtn: { background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8 },
  statBox: { background: '#f7f7f5', borderRadius: 10, padding: '12px 16px', textAlign: 'center', border: '1px solid #eee' },
  statNum: { fontSize: 22, fontWeight: 800, display: 'block' },
  statLbl: { fontSize: 10, color: '#888', display: 'block', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' },
  progress: { height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', margin: '8px 0' },
  bar: pct => ({ height: '100%', background: '#111', borderRadius: 3, width: `${pct}%`, transition: 'width 0.3s ease' }),
  tag: s => ({
    fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, display: 'inline-block',
    background: s === 'edited' ? '#dbeafe' : s === 'fallback' ? '#fef3c7' : s === 'csv' ? '#ede9fe' : s === 'apollo' ? '#dcfce7' : '#f0fdf4',
    color: s === 'edited' ? '#1d4ed8' : s === 'fallback' ? '#92400e' : s === 'csv' ? '#5b21b6' : s === 'apollo' ? '#166534' : '#166534'
  }),
  pill: (bg, text) => ({ background: bg + '18', color: bg, fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, display: 'inline-block' }),
  sidebar: { width: 270, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #e5e5e0', overflow: 'hidden', maxHeight: 540, overflowY: 'auto' },
  sideItem: active => ({ padding: '9px 13px', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center', background: active ? '#f5f5f3' : 'transparent', borderLeft: active ? '2px solid #111' : '2px solid transparent' }),
}

const AVATAR_COLORS = [['#dbeafe', '#1d4ed8'], ['#dcfce7', '#166534'], ['#fef3c7', '#92400e'], ['#fce7f3', '#9d174d'], ['#ede9fe', '#5b21b6']]
function Avatar({ name = '?', size = 32 }) {
  const [bg, tc] = AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length]
  const ini = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 800, flexShrink: 0 }}>{ini}</div>
}

const MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', color: '#d97706', cost: '~$0.01', note: 'Cheapest' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', color: '#16a34a', cost: '~$0.10', note: 'Best OpenAI' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic', color: '#0066cc', cost: '~$0.13', note: 'Best quality' },
]

const ENTRY_LEVELS = [
  { id: 'scratch', emoji: '🔍', label: 'From a prompt', desc: 'Describe who you want to reach — AI finds companies + decision makers via Apollo', badge: '#7c3aed' },
  { id: 'companies', emoji: '🏢', label: 'Company list', desc: 'Paste company names or domains — we find the right people via Apollo + enrich emails', badge: '#0891b2' },
]

const RECRUITER_MODE_TITLES = [
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

const RECRUITER_MODE_BLOCKLIST = [
  'hr ', 'human resources', 'people ops', 'coordinator', 'executive assistant',
  'legal', 'counsel', 'design', 'designer', 'brand', 'content', 'creative',
  'marketing', 'sales rep', 'sales associate', 'sales executive',
  'community', 'social media', 'public relations', ' pr ', 'info@', 'careers@'
]

const CAMPAIGN_MODES = {
  finance: {
    id: 'finance',
    label: 'Financial institutions',
    desc: 'Banks, asset managers, insurers — VP/Director of Data Engineering, Head of Data Platforms, Risk Technology',
    color: '#1d4ed8',
    titles: [
      'Director of Data Engineering', 'VP of Data Engineering', 'VP Data Engineering',
      'Head of Data Engineering', 'Head of Data Platforms', 'Director of Data Platforms',
      'Head of Risk Technology', 'Head of Enterprise Data', 'Director of Enterprise Data',
      'Head of Data Infrastructure', 'Director of Data Infrastructure'
    ],
    seniorities: ['director', 'vp', 'head', 'c_suite'],
    promptHint: 'Target financial institutions: banks, asset managers, insurers, credit bureaus. Decision makers are VP/Director of Data Engineering, Head of Data Platforms, Head of Risk Technology.'
  },
  startup: {
    id: 'startup',
    label: 'AI startups',
    desc: 'Series A/B AI companies — VP of Engineering or CTO (most haven\'t hired a Head of Data yet)',
    color: '#7c3aed',
    titles: [
      'VP of Engineering', 'VP Engineering', 'Head of Engineering',
      'CTO', 'Chief Technology Officer', 'Co-Founder & CTO',
      'Director of Engineering', 'Head of Infrastructure', 'Head of Platform Engineering'
    ],
    seniorities: ['vp', 'head', 'c_suite'],
    promptHint: 'Target Series A/B AI startups. Decision makers are VP of Engineering or CTO — most haven\'t hired a dedicated Head of Data yet.'
  },
  recruiting: {
    id: 'recruiting',
    label: 'Recruiting firms',
    desc: 'Data/tech recruiters, account managers, delivery leads — help place you at their clients',
    color: '#059669',
    titles: RECRUITER_MODE_TITLES,
    seniorities: ['senior', 'manager', 'director', 'vp', 'head', 'c_suite'],
    promptHint: 'Target US-based recruiting/staffing firms that place data, analytics, or technical contractors. Reach Data Recruiters, Account Managers, Client Partners, Delivery Managers, and Practice Leads. NOT generic HR, coordinators, or info@ emails.',
    blocklist: RECRUITER_MODE_BLOCKLIST
  }
}

const TITLE_BLOCKLIST = [
  'growth', 'marketing', 'sales', 'hr ', 'human resources', 'talent', 'recruit',
  'legal', 'counsel', 'design', 'designer', 'brand', 'content', 'creative',
  'customer success', 'customer experience', 'partnerships', 'partner ',
  'revenue', 'business development', 'biz dev', 'account manager',
  'community', 'social media', 'public relations', ' pr '
]

function isTitleRelevant(title, mode) {
  if (!title) return false
  const t = title.toLowerCase()

  // Recruiting mode — keyword-based matching (not exact title match)
  if (mode === 'recruiting') {
    const blocklist = CAMPAIGN_MODES.recruiting.blocklist
    if (blocklist.some(bad => t.includes(bad))) return false
    // Must have a recruiter/consulting/delivery keyword
    const hasRecruiterKeyword = /\b(recruiter|recruiting|staffing|staff firm|consultant|consulting|delivery|engagement|business development manager)\b/i.test(t)
    if (!hasRecruiterKeyword) return false
    // Must have a data/tech/seniority keyword to confirm it's not generic admin
    const hasDataKeyword = /\b(data|analytics|ai|technology|tech|software|engineering|information)\b/i.test(t)
    const hasSeniorKeyword = /\b(senior|lead|director|vp|head|principal|manager|chief|executive|founder|partner)\b/i.test(t)
    return hasDataKeyword || hasSeniorKeyword
  }

  if (TITLE_BLOCKLIST.some(bad => t.includes(bad))) return false
  if (mode === 'startup') {
    return /engineer|cto|chief tech|technology|infrastructure|platform|technical|founder/i.test(t)
  }
  return /data|engineer|risk|technology|technical|infrastructure|platform|analytics|architect/i.test(t)
}

function normalizeDomain(value = '') {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
}

function extractDomainFromOrgResponse(data) {
  const candidates = [
    ...(data?.organizations || []),
    ...(data?.accounts || []),
    ...(data?.companies || []),
    ...(data?.results || [])
  ]
  for (const org of candidates) {
    const domain = normalizeDomain(org?.primary_domain || org?.domain || org?.website_url || '')
    if (domain) return domain
  }
  return ''
}

function extractEmail(person = {}) {
  return (
    person.email ||
    person.work_email ||
    person.primary_email ||
    person.organization_email ||
    ''
  ).trim()
}

function extractEnrichedMatches(data = {}) {
  return [
    ...(data.matches || []),
    ...(data.people || []),
    ...(data.contacts || []),
    ...(data.results || [])
  ]
}

function uniqueBy(items, keyFn) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function exportCSV(contacts, filename = 'contacts') {
  const headers = ['name', 'title', 'company', 'email', 'domain', 'linkedin']
  const rows = contacts.map(c =>
    headers.map(h => `"${(c[h] || c[h === 'company' ? 'co' : h] || '').toString().replace(/"/g, '""')}"`).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Friend Settings Component ─────────────────────────────────────────────
function FriendSettings({ profile, localSenderName, setLocalSenderName, localSenderEmail, setLocalSenderEmail, onUpdateProfile, setCampaignModeFn, setModelIdFn, campaignMode, modelId, currentUser, emailProvider, setEmailProvider }) {
  const [tab, setTab] = useState('profile') // profile | resume | prompt | email
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeStatus, setResumeStatus] = useState('')
  const [promptTab, setPromptTab] = useState('chat') // chat | edit
  const [promptChat, setPromptChat] = useState([])
  const [promptInput, setPromptInput] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [pendingPrompt, setPendingPrompt] = useState(null)
  const [gmailStatus, setGmailStatus] = useState(null)
  const [gmailLoading, setGmailLoading] = useState(false)

  // Sync edit prompt when profile loads
  useEffect(() => {
    if (profile?.prompt) setEditPrompt(profile.prompt)
  }, [profile])

  async function handleResumeUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeFile(file)
    setResumeStatus('Extracting text…')
    try {
      const text = await file.text()
      // For .docx files, use mammoth; for text just use content
      let resumeText = text
      if (file.name.endsWith('.docx')) {
        const res = await fetch('/api/resume-text-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name },
          body: text
        })
        if (res.ok) {
          const data = await res.json()
          resumeText = data.text
        }
      }
      await onUpdateProfile({ resumeText })
      setResumeStatus(`Uploaded! ${resumeText.length} chars`)
    } catch {
      setResumeStatus('Failed to upload')
    }
  }

  async function handlePromptChat() {
    if (!promptInput.trim() || promptLoading) return
    const current = profile?.prompt || ''
    const userMsg = { role: 'user', content: promptInput }
    setPromptChat(c => [...c, userMsg])
    setPromptInput('')
    setPromptLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          system: `You are an email prompt expert. The user wants to modify their cold email prompt.
Current prompt:\n${current}\n\nRespond ONLY with the full modified prompt (no commentary, no markdown, just the raw text).`,
          messages: [{ role: 'user', content: promptInput }]
        })
      })
      const data = await res.json()
      const modified = data.choices?.[0]?.message?.content || ''
      setPendingPrompt(modified)
      setPromptChat(c => [...c, { role: 'assistant', content: 'Preview updated! Review the changes below.' }])
    } catch {
      setPromptChat(c => [...c, { role: 'assistant', content: 'Failed to update prompt. Try again.' }])
    }
    setPromptLoading(false)
  }

  async function acceptPrompt() {
    if (pendingPrompt) {
      await onUpdateProfile({ prompt: pendingPrompt })
      setEditPrompt(pendingPrompt)
      setPendingPrompt(null)
    }
  }

  async function handleSaveManualPrompt() {
    await onUpdateProfile({ prompt: editPrompt })
  }

  async function handleConnectGmail() {
    setGmailLoading(true)
    window.open(`http://localhost:3001/api/gmail/auth-start?userId=${currentUser.userId}`, '_blank')
    // Poll for token
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch('/api/gmail/token-health', { headers: { 'x-user-id': currentUser.userId } })
        const data = await res.json()
        if (data.ok) { setGmailStatus(data); break }
      } catch {}
    }
    setGmailLoading(false)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'resume', label: 'Resume', icon: '📄' },
    { id: 'prompt', label: 'AI Prompt', icon: '✏️' },
    { id: 'email', label: 'Email Account', icon: '📧' },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: 'none', cursor: 'pointer',
            background: tab === t.id ? '#111' : '#fff',
            color: tab === t.id ? '#fff' : '#555',
            border: tab === t.id ? 'none' : '1px solid #ddd'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <div>
          <div style={{ ...c.card, marginBottom: 14 }}>
            <h2 style={c.h2}>Your details</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={c.label}>Your name (for email sign-off)</label>
                <input value={localSenderName} onChange={e => setLocalSenderName(e.target.value)} placeholder="e.g. James O'Brien" />
              </div>
              <div>
                <label style={c.label}>Your email (Gmail sends from this)</label>
                <input type="email" value={localSenderEmail} onChange={e => setLocalSenderEmail(e.target.value)} placeholder="you@gmail.com" />
              </div>
              <button onClick={() => onUpdateProfile({ senderName: localSenderName, senderEmail: localSenderEmail })} style={c.primaryBtn}>
                Save profile
              </button>
            </div>
          </div>

          <div style={{ ...c.card, marginBottom: 14 }}>
            <h2 style={c.h2}>Campaign type</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {Object.values(CAMPAIGN_MODES).map(mode => {
                const sel = campaignMode === mode.id
                return (
                  <div key={mode.id} onClick={() => setCampaignModeFn(mode.id)} style={{
                    border: sel ? `2px solid ${mode.color}` : '1px solid #e5e5e0',
                    borderRadius: 10, padding: 14, cursor: 'pointer',
                    background: sel ? mode.color + '0a' : '#fafaf8'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: sel ? mode.color : '#111' }}>{mode.label}</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{mode.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...c.card, marginBottom: 14 }}>
            <h2 style={c.h2}>AI model</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {MODELS.map(m => {
                const sel = modelId === m.id
                return (
                  <div key={m.id} onClick={() => setModelIdFn(m.id)} style={{
                    border: sel ? `2px solid ${m.color}` : '1px solid #e5e5e0',
                    borderRadius: 10, padding: 14, cursor: 'pointer',
                    background: sel ? m.color + '0a' : '#fafaf8'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{m.label}</div>
                    <div style={{ ...c.pill(m.color, m.note), marginBottom: 8 }}>{m.note}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>Est. 26 emails: {m.cost}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Resume tab */}
      {tab === 'resume' && (
        <div style={{ ...c.card }}>
          <h2 style={c.h2}>Upload your resume</h2>
          <p style={c.muted}>The resume text is used by AI to personalize cold emails. Upload a .docx or .txt file.</p>
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <input type="file" accept=".docx,.txt,.pdf" onChange={handleResumeUpload} />
          </div>
          {resumeStatus && (
            <p style={{ fontSize: 13, color: resumeStatus.includes('Failed') ? '#dc2626' : '#16a34a', marginBottom: 12 }}>{resumeStatus}</p>
          )}
          {profile?.resumeText && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Current resume text:</p>
              <pre style={{ fontSize: 12, background: '#f7f7f5', padding: 14, borderRadius: 8, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {profile.resumeText.slice(0, 800)}{profile.resumeText.length > 800 ? '…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Prompt tab */}
      {tab === 'prompt' && (
        <div>
          <div style={{ ...c.card, marginBottom: 14 }}>
            <h2 style={c.h2}>Edit your email prompt</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setPromptTab('chat')} style={{ ...c.ghostBtn, background: promptTab === 'chat' ? '#111' : undefined, color: promptTab === 'chat' ? '#fff' : undefined }}>
                💬 AI Chat
              </button>
              <button onClick={() => setPromptTab('edit')} style={{ ...c.ghostBtn, background: promptTab === 'edit' ? '#111' : undefined, color: promptTab === 'edit' ? '#fff' : undefined }}>
                ✏️ Manual Edit
              </button>
            </div>

            {promptTab === 'chat' && (
              <div>
                <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 14 }}>
                  {promptChat.map((msg, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0ec' }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: msg.role === 'user' ? '#0066cc' : '#16a34a' }}>
                        {msg.role === 'user' ? 'You: ' : 'AI: '}
                      </span>
                      <span style={{ fontSize: 13 }}>{msg.content}</span>
                    </div>
                  ))}
                  {promptLoading && <p style={{ fontSize: 13, color: '#888' }}>Thinking…</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ flex: 1 }}
                    placeholder="e.g. make it shorter, use more formal tone, focus on fintech"
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePromptChat()}
                  />
                  <button onClick={handlePromptChat} disabled={promptLoading || !promptInput.trim()} style={c.primaryBtn}>Send</button>
                </div>
              </div>
            )}

            {promptTab === 'edit' && (
              <div>
                <textarea
                  style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                />
                <button onClick={handleSaveManualPrompt} style={{ ...c.primaryBtn, marginTop: 10 }}>
                  Save prompt
                </button>
              </div>
            )}
          </div>

          {pendingPrompt && (
            <div style={{ ...c.card, marginBottom: 14, border: '2px solid #d97706' }}>
              <h2 style={c.h2}>Preview — review before saving</h2>
              <pre style={{ fontSize: 12, background: '#fef3c7', padding: 14, borderRadius: 8, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {pendingPrompt}
              </pre>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={acceptPrompt} style={c.successBtn}>✓ Accept changes</button>
                <button onClick={() => setPendingPrompt(null)} style={c.ghostBtn}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email tab */}
      {tab === 'email' && (
        <div style={{ ...c.card }}>
          <h2 style={c.h2}>Email Account</h2>
          <p style={c.muted}>Choose your email provider and connect your account.</p>

          {/* Provider selector */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { id: 'gmail', label: 'Gmail', icon: '📧' },
              { id: 'outlook', label: 'Outlook', icon: '📬' }
            ].map(opt => {
              const isActive = emailProvider === opt.id
              const isConnected = opt.id === 'gmail' ? profile?.hasGmailToken : profile?.hasOutlookToken
              return (
                <div key={opt.id} onClick={() => setEmailProvider(opt.id)} style={{
                  flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: isActive ? '#111' + '10' : '#f7f7f5',
                  border: isActive ? '2px solid #111' : '2px solid #e5e5e0',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  {isConnected && <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>Connected</div>}
                </div>
              )
            })}
          </div>

          <button onClick={async () => {
            if (emailProvider === 'gmail') {
              await handleConnectGmail()
            } else {
              setGmailLoading(true)
              window.open('http://localhost:3001/api/auth-start', '_blank')
              for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000))
                try {
                  const res = await fetch('/api/token-health')
                  const data = await res.json()
                  if (data.ok) { setGmailStatus(data); break }
                } catch {}
              }
              setGmailLoading(false)
            }
          }} disabled={gmailLoading} style={{ ...c.primaryBtn, marginTop: 4 }}>
            {gmailLoading ? 'Opening sign-in…' : `Connect ${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'}`}
          </button>
          {(profile?.hasGmailToken || profile?.hasOutlookToken) && (
            <p style={{ fontSize: 13, color: '#16a34a', marginTop: 10 }}>✓ {emailProvider === 'gmail' ? 'Gmail' : 'Outlook'} connected</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── SETUP WIZARD (friend first-run) ───────────────────────────────────────
function SetupWizard({ currentUser, onComplete }) {
  const [step, setStep] = useState(1) // 1=profile, 2=provider, 3=auth, 4=done
  const [localName, setLocalName] = useState(currentUser?.name || '')
  const [localEmail, setLocalEmail] = useState(currentUser?.email || '')
  const [provider, setProvider] = useState('gmail')
  const [authLoading, setAuthLoading] = useState(false)
  const [authDone, setAuthDone] = useState(false)
  const [campaignMode, setCampaignMode] = useState('startup')
  const [modelId, setModelId] = useState('gpt-4o-mini')

  const STEPS = ['Account', 'Email Provider', 'Authorize', 'Done']

  async function saveProfileAndProvider() {
    await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
      body: JSON.stringify({
        senderName: localName,
        senderEmail: localEmail,
        emailProvider: provider,
        campaignMode,
        modelId
      })
    })
  }

  async function handleConnect() {
    setAuthLoading(true)
    const authUrl = provider === 'gmail'
      ? `http://localhost:3001/api/gmail/auth-start?userId=${currentUser.userId}`
      : 'http://localhost:3001/api/auth-start'
    window.open(authUrl, '_blank')
    // Poll until token is ready
    const checkHealth = provider === 'gmail'
      ? `/api/gmail/token-health`
      : '/api/token-health'
    const headers = provider === 'gmail' ? { 'x-user-id': currentUser.userId } : {}
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch(checkHealth, { headers })
        const data = await res.json()
        if (data.ok || data.status === 'ok') { setAuthDone(true); break }
      } catch {}
    }
    setAuthLoading(false)
  }

  async function handleFinish() {
    localStorage.setItem('friendSetupCompleted', 'true')
    await saveProfileAndProvider()
    localStorage.setItem('session', JSON.stringify({
      userId: currentUser.userId,
      name: localName,
      email: localEmail
    }))
    onComplete()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 36px', width: 480, maxWidth: '95vw' }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i + 1 <= step ? '#111' : '#ddd',
              transition: 'background 0.2s'
            }} />
          ))}
        </div>

        <h2 style={{ ...c.h1, marginBottom: 4 }}>Welcome{currentUser?.name ? `, ${currentUser.name}` : ''}!</h2>
        <p style={{ ...c.muted, marginBottom: 24 }}>Let's get your account set up — this only takes a minute.</p>

        {/* Step 1: Profile */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={c.label}>Your name</label>
                <input value={localName} onChange={e => setLocalName(e.target.value)} placeholder="e.g. James O'Brien" />
              </div>
              <div>
                <label style={c.label}>Your email address</label>
                <input type="email" value={localEmail} onChange={e => setLocalEmail(e.target.value)} placeholder="e.g. james@company.com" />
              </div>
              <div>
                <label style={c.label}>Campaign type</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(CAMPAIGN_MODES).map(([id, mode]) => (
                    <div key={id} onClick={() => setCampaignMode(id)} style={{
                      padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: campaignMode === id ? mode.color + '18' : '#f5f5f3',
                      color: campaignMode === id ? mode.color : '#555',
                      border: campaignMode === id ? `1.5px solid ${mode.color}` : '1.5px solid #ddd'
                    }}>
                      {mode.label}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label style={c.label}>AI model</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {MODELS.map(m => (
                    <div key={m.id} onClick={() => setModelId(m.id)} style={{
                      padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: modelId === m.id ? m.color + '18' : '#f5f5f3',
                      color: modelId === m.id ? m.color : '#555',
                      border: modelId === m.id ? `1.5px solid ${m.color}` : '1.5px solid #ddd'
                    }}>
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(2)} disabled={!localName.trim() || !localEmail.trim()} style={{ ...c.primaryBtn, opacity: (!localName.trim() || !localEmail.trim()) ? 0.5 : 1 }}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Email provider */}
        {step === 2 && (
          <div>
            <p style={{ ...c.muted, marginBottom: 16 }}>Which email provider will you use to send emails?</p>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { id: 'gmail', label: 'Gmail', desc: 'Use your Google account', icon: '📧' },
                { id: 'outlook', label: 'Outlook', desc: 'Use your Microsoft account', icon: '📬' }
              ].map(opt => (
                <div key={opt.id} onClick={() => setProvider(opt.id)} style={{
                  flex: 1, padding: '16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  background: provider === opt.id ? '#111' + '10' : '#f7f7f5',
                  border: provider === opt.id ? '2px solid #111' : '2px solid #e5e5e0',
                  transition: 'all 0.15s'
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={c.ghostBtn}>← Back</button>
              <button onClick={async () => { await saveProfileAndProvider(); setStep(3) }} style={c.primaryBtn}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Authorize */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{provider === 'gmail' ? '📧' : '📬'}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              Connect your {provider === 'gmail' ? 'Gmail' : 'Outlook'} account
            </h3>
            <p style={{ ...c.muted, marginBottom: 24 }}>
              We'll open a secure sign-in page. After authorizing, come back here and we'll confirm.
            </p>
            {!authDone && (
              <button onClick={handleConnect} disabled={authLoading} style={{ ...c.primaryBtn, minWidth: 200 }}>
                {authLoading ? 'Waiting for authorization…' : `Connect ${provider === 'gmail' ? 'Gmail' : 'Outlook'}`}
              </button>
            )}
            {authLoading && !authDone && (
              <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>Waiting… check the popup window</p>
            )}
            {authDone && (
              <div>
                <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>✓ Authorized!</div>
                <button onClick={() => setStep(4)} style={c.primaryBtn}>
                  Continue →
                </button>
              </div>
            )}
            <br />
            <button onClick={() => setStep(2)} style={{ ...c.ghostBtn, marginTop: 12, fontSize: 12 }}>← Choose different provider</button>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>You're all set!</h3>
            <p style={{ ...c.muted, marginBottom: 24 }}>
              Your account is configured and ready to go.
            </p>
            <button onClick={handleFinish} style={c.primaryBtn}>
              Start drafting emails →
            </button>
          </div>
        )}

        {/* Step nav hint */}
        {step < 4 && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>Step {step} of 3</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
// API keys live in server.js and .env — never in the browser bundle
// The server proxy handles all OpenAI, Anthropic, and Apollo calls
const ENV_KEYS = { openai: true, anthropic: true, apollo: true }

export default function App() {
  // User session
  const [currentUser, setCurrentUser] = useState(null) // { userId, name, email } or null
  const [profile, setProfile] = useState(null) // full profile from server
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Load session from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem('session')
    if (raw) {
      try {
        const session = JSON.parse(raw)
        if (session?.userId) {
          setCurrentUser({ userId: session.userId, name: session.name, email: session.email })
        }
      } catch {}
    }
  }, [])

  // Fetch profile when user changes
  useEffect(() => {
    async function loadProfile() {
      if (!currentUser) return
      try {
        const res = await fetch('/api/user/profile', { headers: { 'x-user-id': currentUser.userId } })
        if (res.ok) setProfile(await res.json())
      } catch {}
    }
    loadProfile()
  }, [currentUser])

  async function handleLogin(email, password) {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) { setLoginError(data.error || 'Login failed'); return }
      setCurrentUser({ userId: data.userId, name: data.name, email: data.email })
      localStorage.setItem('session', JSON.stringify({ userId: data.userId, name: data.name, email: data.email }))
      // Trigger setup wizard for friend on first login
      if (data.userId === 'friend' && localStorage.getItem('friendSetupCompleted') !== 'true') {
        setShowSetupWizard(true)
      }
    } catch {
      setLoginError('Connection error')
    }
    setLoginLoading(false)
  }

  function handleLogout() {
    setCurrentUser(null)
    setProfile(null)
    localStorage.removeItem('session')
    setPhase('entry')
    setSettingsOpen(false)
    setShowSetupWizard(false)
  }

  // Apply user profile to app state
  const senderName = profile?.senderName || currentUser?.name || 'Manmit Singh'
  const senderEmail = profile?.senderEmail || currentUser?.email || ''
  const modelId = profile?.modelId || 'gpt-4o-mini'
  const campaignMode = profile?.campaignMode || 'startup'
  const userResumeText = profile?.resumeText || null
  const userPrompt = profile?.prompt || null

  // Profile update helpers (for settings page)
  async function updateProfile(updates) {
    if (!currentUser) return
    try {
      await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
        body: JSON.stringify(updates)
      })
      const res = await fetch('/api/user/profile', { headers: { 'x-user-id': currentUser.userId } })
      if (res.ok) setProfile(await res.json())
    } catch {}
  }
  const setCampaignModeFn = useCallback(v => {
    setProfile(p => p ? { ...p, campaignMode: v } : p)
    updateProfile({ campaignMode: v })
  }, [currentUser])
  const setModelIdFn = useCallback(v => {
    setProfile(p => p ? { ...p, modelId: v } : p)
    updateProfile({ modelId: v })
  }, [currentUser])

  // Login local state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  // Settings local state (for editable fields)
  const [localSenderName, setLocalSenderName] = useState('')
  const [localSenderEmail, setLocalSenderEmail] = useState('')
  // Sync when profile loads
  useEffect(() => {
    if (profile) {
      setLocalSenderName(profile.senderName || currentUser?.name || '')
      setLocalSenderEmail(profile.senderEmail || currentUser?.email || '')
      if (profile.emailProvider) setEmailProvider(profile.emailProvider)
      // Trigger setup wizard on first login (friend only, one-time)
      if (isFriend && !setupCompleted && !showSetupWizard) {
        setShowSetupWizard(true)
      }
    }
  }, [profile, currentUser])

  // Config
  const [phase, setPhase] = useState('entry') // entry | settings | discover | companies | csv | contacts | drafting | review | schedule | sent | sent_history
  const [entryLevel, setEntryLevel] = useState(null)

  // Discovery state
  const [discoverPrompt, setDiscoverPrompt] = useState('')
  const [discoverResults, setDiscoverResults] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverLog, setDiscoverLog] = useState([])

  // Company list state
  const [companyText, setCompanyText] = useState('')
  const [companyList, setCompanyList] = useState([]) // parsed company objects (from CSV or text)
  const [companyContacts, setCompanyContacts] = useState([])
  const [companySearching, setCompanySearching] = useState(false)
  const [companyProgress, setCompanyProgress] = useState(0)
  const [companyLog, setCompanyLog] = useState([])
  const [companyCSVError, setCompanyCSVError] = useState('')

  // AI company discovery state
  const [companyOrgPrompt, setCompanyOrgPrompt] = useState('')
  const [companyOrgResults, setCompanyOrgResults] = useState([])
  const [companyOrgSearching, setCompanyOrgSearching] = useState(false)
  const [companyOrgLog, setCompanyOrgLog] = useState([])

  // CSV state
  const [csvText, setCsvText] = useState('')
  const [csvContacts, setCsvContacts] = useState([])
  const [csvError, setCsvError] = useState('')

  // Manual contacts state (just draft & send)
  const [manualText, setManualText] = useState('')
  const [manualContacts, setManualContacts] = useState([])
  const [manualErr, setManualErr] = useState('')

  // Contacts / draft state
  const [contacts, setContacts] = useState([])
  const [drafts, setDrafts] = useState({})
  const [draftProgress, setDraftProgress] = useState(0)
  const [draftCurrent, setDraftCurrent] = useState(null)
  const [totalTokens, setTotalTokens] = useState(0)
  const tokRef = useRef(0)
  const draftsRef = useRef({})
  const abortRef = useRef(false)

  // Review state
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editSubj, setEditSubj] = useState('')
  const [editBody, setEditBody] = useState('')
  const [flagged, setFlagged] = useState(new Set())
  const [approved, setApproved] = useState(new Set())

  // Schedule state
  const [sendDate, setSendDate] = useState('')
  const [sendTime, setSendTime] = useState('09:00')
  const [gap, setGap] = useState(5)
  const [scheduleSending, setScheduleSending] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [sentCount, setSentCount] = useState(0)

  // Friend setup wizard
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const isFriend = currentUser?.userId === 'friend'
  const setupCompleted = isFriend ? (localStorage.getItem('friendSetupCompleted') === 'true') : true

  // Email provider
  const [emailProvider, setEmailProvider] = useState(profile?.emailProvider || 'gmail')

  // Draft confirmation (friend: "use existing or edit" before drafting)
  const [draftConfirmContacts, setDraftConfirmContacts] = useState(null)
  const [draftConfirmLoading, setDraftConfirmLoading] = useState(false)
  const [draftConfirmError, setDraftConfirmError] = useState('')

  // Auth & job status
  const [authStatus, setAuthStatus] = useState(null)
  const [gmailAuthStatus, setGmailAuthStatus] = useState(null)
  const [scheduleStatus, setScheduleStatus] = useState(null)
  const [reAuthLoading, setReAuthLoading] = useState(false)
  const [retryLoading, setRetryLoading] = useState(false)
  const [sentHistory, setSentHistory] = useState([])

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [authRes, schedRes] = await Promise.all([
          fetch('/api/token-health'),
          fetch('/api/schedule-status')
        ])
        const auth = await authRes.json()
        const sched = await schedRes.json()
        setAuthStatus(auth)
        setScheduleStatus(sched)
        // Also poll Gmail status for friend
        if (isFriend) {
          try {
            const gmailRes = await fetch('/api/gmail/token-health', { headers: { 'x-user-id': currentUser.userId } })
            const gmail = await gmailRes.json()
            setGmailAuthStatus(gmail)
          } catch {}
        }
      } catch {}
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 30000)
    return () => clearInterval(id)
  }, [isFriend, currentUser])

  async function runReAuth() {
    setReAuthLoading(true)
    window.open('http://localhost:3001/api/auth-start', '_blank')
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch('/api/token-health')
        const data = await res.json()
        if (data.ok) { setAuthStatus(data); break }
      } catch {}
    }
    setReAuthLoading(false)
  }

  async function runRetryFailed() {
    setRetryLoading(true)
    try {
      const res = await fetch('/api/schedule-retry', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const schedRes = await fetch('/api/schedule-status')
        setScheduleStatus(await schedRes.json())
      }
    } catch {}
    setRetryLoading(false)
  }

  async function loadSentHistory() {
    try {
      const res = await fetch('/api/sent-emails', { headers: { 'x-user-id': currentUser?.userId || 'friend' } })
      const data = await res.json()
      setSentHistory(data.emails || [])
      setPhase('sent_history')
    } catch {}
  }

  const model = MODELS.find(m => m.id === modelId) || MODELS[0]
  const aiConfig = { model: modelId }

  // Status bar — dynamic for friend (gmail/outlook) vs dad (outlook only)
  const activeAuthStatus = isFriend
    ? (emailProvider === 'outlook' ? authStatus : gmailAuthStatus)
    : authStatus
  const activeAuthColor = activeAuthStatus?.status === 'ok' ? '#16a34a' : activeAuthStatus?.status === 'warning' ? '#d97706' : activeAuthStatus?.status === 'expired' ? '#dc2626' : '#888'
  const activeAuthLabel = activeAuthStatus?.status === 'ok'
    ? `${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'} connected`
    : activeAuthStatus?.status === 'warning'
    ? `${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'} expires in ${activeAuthStatus?.minutesLeft}m`
    : activeAuthStatus?.status === 'critical'
    ? `${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'} critical — ${activeAuthStatus?.minutesLeft}m left`
    : activeAuthStatus?.status === 'expired'
    ? `${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'} expired`
    : 'Not connected'
  const activeAuthExpiry = activeAuthStatus?.minutesLeft != null ? ` · ${activeAuthStatus.minutesLeft}m left` : ''
  const activeProvider = isFriend ? emailProvider : 'outlook'
  const schedLabel = scheduleStatus ? `${scheduleStatus.pending} pending · ${scheduleStatus.sent} sent${scheduleStatus.failed ? ` · ${scheduleStatus.failed} failed` : ''}` : 'checking…'
  const hasFailed = scheduleStatus?.failed > 0
  const statusBar = (wide = false) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 14px', background: '#f7f7f5', borderRadius: 10, marginBottom: 18, border: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeAuthColor }} />
        <span style={{ fontSize: 12, color: '#666' }}>{activeAuthLabel}{activeAuthExpiry}</span>
        <button onClick={() => {
          if (isFriend && emailProvider === 'gmail') {
            window.open(`http://localhost:3001/api/gmail/auth-start?userId=${currentUser.userId}`, '_blank')
          } else {
            runReAuth()
          }
        }} disabled={reAuthLoading} style={{ fontSize: 11, padding: '2px 8px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {reAuthLoading ? 'Opening…' : 'Re-authorize'}
        </button>
      </div>
      <div style={{ width: 1, height: 16, background: '#ddd' }} />
      <span style={{ fontSize: 12, color: '#666' }}>Jobs: {schedLabel}</span>
      {hasFailed && (
        <button onClick={runRetryFailed} disabled={retryLoading} style={{ fontSize: 11, padding: '2px 8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {retryLoading ? 'Retrying…' : `Retry ${scheduleStatus.failed} failed`}
        </button>
      )}
    </div>
  )

  const canDraft = senderName.trim() && senderEmail.trim()

  const log = msg => setDiscoverLog(l => [...l, { t: new Date().toLocaleTimeString(), msg }])

  // ── AI DISCOVERY (from prompt) ───────────────────────────────────────────
  async function runDiscover() {
    if (!discoverPrompt.trim()) return
    setDiscoverLoading(true)
    setDiscoverResults([])
    setDiscoverLog([])

    try {
      const mode = CAMPAIGN_MODES[campaignMode]
      log(`Parsing your prompt into search parameters… [${mode.label}]`)
      const params = await promptToApolloParams(discoverPrompt, aiConfig, mode)
      log(`Searching Apollo: "${params.reasoning || 'finding matches'}"`)

      // Merge in mode's title/seniority defaults if the AI didn't specify them
      const searchParams = {
        person_titles: mode.titles,
        person_seniorities: mode.seniorities,
        ...params,
        per_page: params.per_page || 5
      }
      const data = await searchPeople(searchParams, '')
      const people = data.people || []
      log(`Found ${people.length} candidates — enriching to get emails…`)

      if (people.length === 0) { log('No results — try broadening your prompt'); setDiscoverLoading(false); return }

      const ids = people.map(p => p.id).filter(Boolean)
      const batches = []
      for (let i = 0; i < ids.length; i += 10) batches.push(ids.slice(i, i + 10))

      const enriched = []
      for (const batch of batches) {
        const res = await bulkEnrich(batch.map(id => ({ id })), '')
        enriched.push(...extractEnrichedMatches(res).filter(Boolean))
      }

      log(`Enriched ${enriched.length} contacts with emails`)

      const results = enriched
        .filter(p => extractEmail(p) && p.email_status !== 'unavailable' && isTitleRelevant(p.title, campaignMode))
        .map((p, i) => ({
          id: i + 1,
          name: p.name || `${p.first_name} ${p.last_name}`,
          first: p.first_name || p.name?.split(' ')[0] || '',
          title: p.title || '',
          co: p.organization?.name || '',
          company: p.organization?.name || '',
          email: extractEmail(p),
          domain: p.organization?.primary_domain || '',
          source: 'apollo',
          emailStatus: p.email_status
        }))

      setDiscoverResults(results)
      log(`✓ Ready — ${results.length} contacts with verified emails`)
    } catch (e) {
      log(`Error: ${e.message}`)
    }
    setDiscoverLoading(false)
  }

  // ── COMPANY LIST → APOLLO ───────────────────────────────────────────────
  async function searchCompanies() {
    const companies = companyList.length > 0 ? companyList : parseCompanyList(companyText)
    if (!companies.length) return
    setCompanySearching(true)
    setCompanyContacts([])
    setCompanyProgress(0)
    setCompanyLog([])

    const logCompany = msg => setCompanyLog(l => [...l, { t: new Date().toLocaleTimeString(), msg }])
    logCompany(`Starting company search for ${companies.length} entr${companies.length === 1 ? 'y' : 'ies'}...`)

    const found = []
    for (let i = 0; i < companies.length; i++) {
      const co = companies[i]
      setCompanyProgress(i + 1)
      try {
        logCompany(`[${co.co}] resolving domain...`)
        let resolvedDomain = normalizeDomain(co.domain)
        let resolvedOrgId = null
        if (!resolvedDomain) {
          try {
            const orgs = await searchOrgs({ q_organization_name: co.co, per_page: 3 }, '')
            const candidates = [
              ...(orgs?.organizations || []),
              ...(orgs?.accounts || []),
              ...(orgs?.companies || []),
              ...(orgs?.results || [])
            ]
            if (candidates.length > 0) {
              resolvedOrgId = candidates[0]?.id || null
              resolvedDomain = extractDomainFromOrgResponse(orgs)
            }
            if (resolvedDomain) logCompany(`[${co.co}] resolved domain: ${resolvedDomain}`)
            else if (resolvedOrgId) logCompany(`[${co.co}] resolved org ID: ${resolvedOrgId}`)
          } catch {
            // Continue with fallback people search by name if org search fails.
          }
        }
        if (!resolvedDomain && !resolvedOrgId) {
          logCompany(`[${co.co}] skipped — could not resolve domain or org ID`)
          continue
        }

        const mode = CAMPAIGN_MODES[campaignMode]
        const orgFilter = resolvedDomain
          ? { q_organization_domains_list: [resolvedDomain] }
          : { organization_ids: [resolvedOrgId] }

        // Build tiers based on roleHint from research CSV, falling back to standard mode titles.
        const roleHint = (co.roleHint || '').toLowerCase()
        const isFounderHint = roleHint.includes('founder')
        const isDataHint    = roleHint.includes('data')
        const isEngHint     = roleHint.includes('engineer') || roleHint.includes('head of eng') || roleHint.includes('cto')

        const tierFounder = { label: 'Founder', params: { person_titles: ['Co-Founder', 'Founder', 'Founding Partner'], person_seniorities: ['c_suite', 'founder', 'owner', 'partner'], per_page: 3, ...orgFilter }, useFilter: false }
        const tierCTO     = { label: 'CTO / VP Eng', params: { person_titles: ['CTO', 'Chief Technology Officer', 'VP of Engineering', 'VP Engineering', 'Head of Engineering'], person_seniorities: ['c_suite', 'vp', 'head'], per_page: 3, ...orgFilter }, useFilter: false }
        const tierCEO     = { label: 'CEO', params: { person_titles: ['CEO', 'Chief Executive Officer'], person_seniorities: ['c_suite'], per_page: 3, ...orgFilter }, useFilter: false }
        const tierMode    = { label: 'mode titles', params: { person_titles: mode.titles, person_seniorities: mode.seniorities, per_page: 5, ...orgFilter }, useFilter: true }
        const tierBroad   = { label: 'broad seniority', params: { person_seniorities: mode.seniorities, per_page: 5, ...orgFilter }, useFilter: true }

        // Recruiter mode: add a relaxed fallback that skips title filter entirely (company context is enough)
        const isRecruiting = campaignMode === 'recruiting'
        const tierRelaxed  = isRecruiting
          ? { label: 'recruiter relaxed', params: { person_titles: ['Recruiter', 'Consultant', 'Account Manager', 'Director', 'VP', 'Manager', 'Senior Associate', 'Lead', 'Partner'], person_seniorities: ['senior', 'manager', 'director', 'vp', 'head', 'c_suite', 'founder', 'partner'], per_page: 8, ...orgFilter }, useFilter: false }
          : null

        // C-suite catch-all — separate from other tiers, always searched last
        const tierCSuite  = { label: 'any C-suite', params: { person_seniorities: ['c_suite', 'owner', 'founder', 'partner'], per_page: 3, ...orgFilter }, useFilter: false }

        // Order: hint-specific first, then standard tiers, then recruiter relaxed, then C-suite
        let tiers
        if (isFounderHint)      tiers = [tierFounder, tierCTO, tierMode, tierBroad, tierRelaxed, tierCEO, tierCSuite].filter(Boolean)
        else if (isEngHint)     tiers = [tierCTO, tierMode, tierBroad, tierRelaxed, tierFounder, tierCEO, tierCSuite].filter(Boolean)
        else if (isDataHint)    tiers = [tierMode, tierBroad, tierRelaxed, tierCTO, tierCEO, tierFounder, tierCSuite].filter(Boolean)
        else                    tiers = [tierMode, tierBroad, tierRelaxed, tierCTO, tierCEO, tierFounder, tierCSuite].filter(Boolean)

        let topPeople = []
        for (const tier of tiers) {
          const res = await searchPeople(tier.params, '')
          let people = uniqueBy(res.people || [], p => p.id || `${p.first_name}|${p.last_name}`)
          if (tier.useFilter) people = people.filter(p => isTitleRelevant(p.title, campaignMode))
          logCompany(`[${co.co}] ${tier.label}: ${people.length} relevant`)
          if (people.length > 0) { topPeople = people.slice(0, 1); break }
        }

        if (topPeople.length > 0) {
          const directContacts = topPeople
            .map(p => ({
              name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
              first: p.first_name || p.name?.split(' ')[0] || '',
              title: p.title || '',
              co: p.organization?.name || co.co,
              company: p.organization?.name || co.co,
              email: extractEmail(p),
              domain: normalizeDomain(p.organization?.primary_domain || resolvedDomain || co.domain),
              linkedin: p.linkedin_url || ''
            }))
            .filter(p => p.email)

          logCompany(`[${co.co}] direct emails from search: ${directContacts.length}`)

          const toEnrich = topPeople.filter(p => !extractEmail(p) && p.id)
          let enrichedContacts = []
          if (toEnrich.length > 0) {
            const enriched = await bulkEnrich(toEnrich.map(p => ({ id: p.id })), '')
            const matches = extractEnrichedMatches(enriched)
            enrichedContacts = matches
              .map(p => ({
                name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                first: p.first_name || p.name?.split(' ')[0] || '',
                title: p.title || '',
                co: p.organization?.name || co.co,
                company: p.organization?.name || co.co,
                email: extractEmail(p),
                domain: normalizeDomain(p.organization?.primary_domain || resolvedDomain || co.domain),
                linkedin: p.linkedin_url || ''
              }))
              .filter(p => p.email)
            logCompany(`[${co.co}] enriched emails: ${enrichedContacts.length}`)
          }

          const merged = uniqueBy(directContacts.concat(enrichedContacts), p => p.email.toLowerCase())
            .map((p, idx) => ({ id: found.length + idx + 1, ...p, source: 'apollo' }))

          if (merged.length === 0) {
            logCompany(`[${co.co}] no email returned for matched people (possible credit/permission constraint)`)
          } else {
            logCompany(`[${co.co}] added ${merged.length} contact${merged.length === 1 ? '' : 's'}`)
            found.push(...merged)
            setCompanyContacts([...found])
          }
        } else {
          logCompany(`[${co.co}] no people found`)
        }
      } catch (e) {
        logCompany(`[${co.co}] error: ${e.message}`)
        console.warn(`${co.co}: ${e.message}`)
      }
      if (i < companies.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    logCompany(`Done. Total contacts found: ${found.length}`)
    setCompanySearching(false)
  }

  // ── CSV PARSE ───────────────────────────────────────────────────────────
  function parseCsvInput() {
    setCsvError('')
    try {
      const parsed = parseCSV(csvText)
      setCsvContacts(parsed)
    } catch (e) {
      setCsvError(e.message)
    }
  }

  // ── MANUAL CONTACTS PARSE ────────────────────────────────────────────────
  function parseManual() {
    setManualErr('')
    try {
      const parsed = parseCSV(manualText)
      setManualContacts(parsed)
    } catch (e) { setManualErr(e.message) }
  }

  // ── AI COMPANY ORG SEARCH ────────────────────────────────────────────────
  async function searchCompanyOrgs() {
    if (!companyOrgPrompt.trim()) return
    setCompanyOrgSearching(true)
    setCompanyOrgResults([])
    setCompanyOrgLog([])

    const logOrg = msg => setCompanyOrgLog(l => [...l, { t: new Date().toLocaleTimeString(), msg }])

    try {
      logOrg('Translating description to search parameters…')
      const params = await promptToApolloOrgParams(companyOrgPrompt, aiConfig)
      logOrg(`Searching Apollo: "${params.reasoning || 'finding companies'}"`)
      delete params.reasoning

      const data = await searchOrgs(params, '')
      const orgs = [
        ...(data.organizations || []),
        ...(data.accounts || []),
        ...(data.companies || []),
        ...(data.results || [])
      ]
      logOrg(`Found ${orgs.length} companies`)

      const results = orgs
        .filter(org => org.name)
        .map((org, i) => ({
          id: i + 1,
          co: org.name,
          company: org.name,
          domain: normalizeDomain(org.primary_domain || org.domain || org.website_url || ''),
          industry: org.industry || '',
          employees: org.num_employees || org.employee_count || '',
          source: 'apollo_org'
        }))

      setCompanyOrgResults(results)
      logOrg(`✓ ${results.length} companies ready — export CSV or load directly`)
    } catch (e) {
      logOrg(`Error: ${e.message}`)
    }
    setCompanyOrgSearching(false)
  }

  function exportCompaniesCSV(companies) {
    const headers = ['Company Name', 'Website', 'Industry', 'Employees']
    const rows = companies.map(co => [
      co.co || '', co.domain || '', co.industry || '', String(co.employees || '')
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── START DRAFTING ──────────────────────────────────────────────────────
  function beginDrafting(contactList) {
    if (!canDraft) return
    // Friend: prompt to use existing config or edit before drafting
    if (isFriend) {
      setDraftConfirmContacts(contactList)
      setDraftConfirmError('')
      return
    }
    setContacts(contactList)
    setDrafts({})
    draftsRef.current = {}
    tokRef.current = 0
    setTotalTokens(0)
    setDraftProgress(0)
    abortRef.current = false
    setFlagged(new Set())
    setApproved(new Set())
    setPhase('drafting')
    runDrafts(contactList)
  }

  async function runDrafts(contactList) {
    for (let i = 0; i < contactList.length; i++) {
      if (abortRef.current) break
      const contact = contactList[i]
      setDraftCurrent(contact)
      setDraftProgress(i)
      try {
        // Fetch company website before drafting so the AI has real content to hook from
        const siteContent = await fetchSiteContent(contact.domain || contact.co)
        const { subject, body, tokens } = await draftEmail(contact, aiConfig, campaignMode, siteContent)
        tokRef.current += tokens || 0
        setTotalTokens(tokRef.current)
        draftsRef.current[contact.id] = { subject, body, status: 'ready' }
      } catch (e) {
        draftsRef.current[contact.id] = {
          subject: campaignMode === 'recruiting'
            ? `Senior ETL contractor — available for placements`
            : `Data engineering — ${contact.co || contact.company}`,
          body: campaignMode === 'recruiting'
            ? `Hi ${contact.first || contact.name?.split(' ')[0]},\n\nI'm a senior data engineering contractor — 24+ years in ETL, Python, and enterprise data systems. I'm actively working through recruiting partners for client placements and wanted to explore alignment.\n\nExperience includes Informatica pipelines at Scotiabank, TD, and Rogers. Comfortable in financial services, regulatory, and high-volume data environments.\n\nOpen to a quick 15-minute call if you have relevant roles.\n\nBest,\nManmit`
            : `Hi ${contact.first || contact.name?.split(' ')[0]},\n\nI'm a senior data engineering contractor with 24 years of experience in Informatica ETL and Python pipelines across financial services and tech. I'm available for remote USD contracts.\n\nWorth a quick call?\n\nBest,\nManmit`,
          status: 'fallback', error: e.message
        }
      }
      setDrafts({ ...draftsRef.current })
    }
    setDraftProgress(contactList.length)
    setDraftCurrent(null)
    setSelected(contactList[0])
    setPhase('review')
  }

  // ── REVIEW HELPERS ──────────────────────────────────────────────────────
  const toggleFlag = id => setFlagged(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleApprove = id => setApproved(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const approveAll = () => setApproved(new Set(contacts.map(c => c.id)))

  function startEdit(id) {
    const d = drafts[id]; if (!d) return
    setEditSubj(d.subject); setEditBody(d.body); setEditing(id)
  }
  function saveEdit() {
    if (!editing) return
    setDrafts(d => ({ ...d, [editing]: { ...d[editing], subject: editSubj, body: editBody, status: 'edited' } }))
    setEditing(null)
  }

  // ── SCHEDULE SEND ───────────────────────────────────────────────────────
  async function scheduleSend() {
    const approvedContacts = contacts.filter(c => approved.has(c.id))
    if (!approvedContacts.length || !sendDate || !sendTime) return
    setScheduleSending(true)
    setScheduleError('')
    const baseMs = new Date(`${sendDate}T${sendTime}`).getTime()
    const emails = approvedContacts.map((ct, i) => {
      const d = drafts[ct.id] || {}
      return {
        to: ct.email,
        subject: d.subject || '',
        body: d.body || '',
        sendAt: new Date(baseMs + i * gap * 60 * 1000).toISOString(),
        company: ct.company || ct.co || ''
      }
    })
    try {
      const res = await fetch('/api/schedule-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails })
      })
      const data = await res.json()
      if (data.ok) {
        setSentCount(emails.length)
        setPhase('sent')
      } else {
        setScheduleError(data.error || 'Server error — check Outlook credentials in server.js')
      }
    } catch (e) {
      setScheduleError(e.message)
    }
    setScheduleSending(false)
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ── LOGIN SCREEN ─────────────────────────────────────────────────────────
  if (!currentUser) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '40px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #e5e5e0' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
          <h1 style={{ ...c.h1, marginBottom: 6, fontSize: 24 }}>Campaign Pipeline</h1>
          <p style={{ ...c.muted, fontSize: 13 }}>Sign in to access your campaigns</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={c.label}>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={loginEmail || ''}
              onChange={e => setLoginEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin(loginEmail, loginPass)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={c.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={loginPass || ''}
              onChange={e => setLoginPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin(loginEmail, loginPass)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          {loginError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>{loginError}</div>
          )}
          <button
            onClick={() => handleLogin(loginEmail, loginPass)}
            disabled={loginLoading}
            style={{ ...c.primaryBtn, width: '100%', padding: '12px', fontSize: 14 }}
          >
            {loginLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── ENTRY LEVEL SELECTION ───────────────────────────────────────────────
  if (phase === 'entry') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={c.h1}>Campaign pipeline</h1>
          <p style={{ ...c.muted, marginTop: 6 }}>Where are you starting from?</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPhase('settings')} style={c.ghostBtn}>⚙️ Settings</button>
          <button onClick={handleLogout} style={{ ...c.ghostBtn, color: '#dc2626' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {ENTRY_LEVELS.map(lvl => {
          const sel = entryLevel === lvl.id
          return (
            <div key={lvl.id} onClick={() => setEntryLevel(lvl.id)} style={{
              ...c.card, cursor: 'pointer', position: 'relative',
              border: sel ? `2px solid ${lvl.badge}` : '1px solid #e5e5e0',
              background: sel ? lvl.badge + '08' : '#fff'
            }}>
              {sel && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: lvl.badge }} />}
              <div style={{ fontSize: 24, marginBottom: 8 }}>{lvl.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{lvl.label}</div>
              <div style={c.muted}>{lvl.desc}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadSentHistory} style={{ ...c.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>📧</span>
            View sent emails {scheduleStatus?.sent ? `(${scheduleStatus.sent})` : ''}
          </button>
          {isFriend && (
            <button onClick={() => setPhase('settings')} style={c.ghostBtn}>
              ✏️ Edit Account
            </button>
          )}
        </div>
        <button onClick={() => { if (entryLevel) setPhase('settings') }} disabled={!entryLevel} style={c.primaryBtn}>
          Continue →
        </button>
      </div>
    </div>
  )

  // ── SETTINGS ────────────────────────────────────────────────────────────
  if (phase === 'settings') return (
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={c.h1}>Settings</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>Configure your account</p>
        </div>
        <button onClick={() => setPhase('entry')} style={c.ghostBtn}>← Back</button>
      </div>

      {/* Friend gets tabbed UI, dad gets inline */}
      {(() => {
        const isFriend = currentUser?.userId === 'friend'
        if (isFriend) return (
          <FriendSettings
            profile={profile}
            localSenderName={localSenderName}
            setLocalSenderName={setLocalSenderName}
            localSenderEmail={localSenderEmail}
            setLocalSenderEmail={setLocalSenderEmail}
            onUpdateProfile={updateProfile}
            setCampaignModeFn={setCampaignModeFn}
            setModelIdFn={setModelIdFn}
            campaignMode={campaignMode}
            modelId={modelId}
            currentUser={currentUser}
            emailProvider={emailProvider}
            setEmailProvider={setEmailProvider}
          />
        )

        return (
          <>
            {/* Campaign mode */}
            <div style={{ ...c.card, marginBottom: 14 }}>
              <h2 style={c.h2}>Campaign type</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {Object.values(CAMPAIGN_MODES).map(mode => {
                  const sel = campaignMode === mode.id
                  return (
                    <div key={mode.id} onClick={() => setCampaignModeFn(mode.id)} style={{
                      border: sel ? `2px solid ${mode.color}` : '1px solid #e5e5e0',
                      borderRadius: 10, padding: 14, cursor: 'pointer',
                      background: sel ? mode.color + '0a' : '#fafaf8'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: sel ? mode.color : '#111' }}>{mode.label}</div>
                      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{mode.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sender */}
            <div style={{ ...c.card, marginBottom: 14 }}>
              <h2 style={c.h2}>Your details</h2>
              <div style={{ ...c.row, gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={c.label}>Your name (sign-off)</label>
                  <input placeholder="e.g. James O'Brien" value={localSenderName} onChange={e => setLocalSenderName(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={c.label}>Your email (Outlook sends from this)</label>
                  <input type="email" placeholder="you@company.com" value={localSenderEmail} onChange={e => setLocalSenderEmail(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Model */}
            <div style={{ ...c.card, marginBottom: 14 }}>
              <h2 style={c.h2}>AI model for email drafting</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {MODELS.map(m => {
                  const sel = modelId === m.id
                  return (
                    <div key={m.id} onClick={() => setModelIdFn(m.id)} style={{
                      border: sel ? `2px solid ${m.color}` : '1px solid #e5e5e0',
                      borderRadius: 10, padding: 14, cursor: 'pointer',
                      background: sel ? m.color + '0a' : '#fafaf8'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{m.label}</div>
                      <div style={{ ...c.pill(m.color, m.note), marginBottom: 8 }}>{m.note}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>Est. 26 emails: {m.cost}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* API Keys */}
            <div style={{ ...c.card, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 8, fontWeight: 700, flexShrink: 0 }}>API keys pre-configured</span>
              <p style={{ ...c.small, margin: 0 }}>OpenAI, Anthropic, and Apollo keys are set in <code>.env</code> and handled server-side — they never appear in the browser.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => {
                updateProfile({ senderName: localSenderName, senderEmail: localSenderEmail })
                const next = { scratch: 'discover', companies: 'companies' }
                if (entryLevel) setPhase(next[entryLevel] || 'discover')
              }} style={c.primaryBtn}>
                Continue →
              </button>
            </div>
          </>
        )
      })()}
    </div>
  )// ── LEVEL 0: PROMPT DISCOVERY ───────────────────────────────────────────
  if (phase === 'discover') return (
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>Find contacts from a prompt</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>AI translates your description into Apollo search parameters</p>
        </div>
        <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Settings</button>
      </div>

      <div style={{ ...c.card, marginBottom: 14 }}>
        <label style={c.label}>Describe who you want to reach</label>
        <textarea
          style={{ minHeight: 90, marginBottom: 10 }}
          placeholder={`Examples:\n"VP or Director of Data Engineering at US asset managers or hedge funds with 500-5000 employees"\n"Head of Risk Technology at tier 1 banks using Informatica"\n"Data platform leaders at financial services companies in New York"`}
          value={discoverPrompt}
          onChange={e => setDiscoverPrompt(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={c.small}>Apollo searches its database of 275M+ people · enriches top matches to get emails</p>
          <button onClick={runDiscover} disabled={discoverLoading || !discoverPrompt.trim()} style={c.primaryBtn}>
            {discoverLoading ? 'Searching…' : 'Find contacts →'}
          </button>
        </div>
      </div>

      {discoverLog.length > 0 && (
        <div style={{ ...c.card, marginBottom: 14, background: '#1a1a1a', color: '#e5e5e5' }}>
          {discoverLog.map((l, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
              <span style={{ color: '#666', marginRight: 10 }}>{l.t}</span>{l.msg}
            </div>
          ))}
        </div>
      )}

      {discoverResults.length > 0 && (
        <>
          <div style={{ ...c.card, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ ...c.h2, margin: 0 }}>{discoverResults.length} contacts found</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={runDiscover} style={c.ghostBtn}>Search again</button>
                <button onClick={() => exportCSV(discoverResults, 'apollo-contacts')} style={c.ghostBtn}>Export CSV</button>
                <button onClick={() => beginDrafting(discoverResults)} disabled={!canDraft} style={c.primaryBtn}>
                  Draft emails →
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
              {discoverResults.map(ct => (
                <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f0ec' }}>
                  <Avatar name={ct.name} size={28} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{ct.name}</span>
                    <span style={{ ...c.muted, marginLeft: 8, fontSize: 12 }}>{ct.co}</span>
                  </div>
                  <span style={{ ...c.muted, fontSize: 11 }}>{ct.title}</span>
                  <span style={c.tag(ct.emailStatus === 'verified' ? 'ready' : 'fallback')}>{ct.emailStatus}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  // ── LEVEL 1: COMPANY LIST → APOLLO ──────────────────────────────────────
  if (phase === 'companies') return (
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>Find decision makers by company</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>
            One company per line — Apollo finds the right person + email at each
            <span style={{ ...c.pill(CAMPAIGN_MODES[campaignMode].color, ''), marginLeft: 10 }}>{CAMPAIGN_MODES[campaignMode].label}</span>
          </p>
        </div>
        <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Settings</button>
      </div>

      {/* AI company discovery */}
      <div style={{ ...c.card, marginBottom: 14 }}>
        <h2 style={c.h2}>AI: Find companies</h2>
        <p style={{ ...c.small, marginBottom: 10 }}>Describe the type of companies you want — AI searches Apollo and returns a company list you can use below</p>
        <textarea
          style={{ minHeight: 80, marginBottom: 10 }}
          placeholder={`Examples:\n"Series A/B AI startups in the US with 50–500 employees"\n"Canadian banks and asset managers with over 1,000 employees"\n"Fintech companies in New York focused on data infrastructure"`}
          value={companyOrgPrompt}
          onChange={e => setCompanyOrgPrompt(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={c.small}>Searches Apollo's 275M+ company database · exports a CSV you can upload below</p>
          <button onClick={searchCompanyOrgs} disabled={companyOrgSearching || !companyOrgPrompt.trim()} style={c.primaryBtn}>
            {companyOrgSearching ? 'Searching…' : 'Find companies →'}
          </button>
        </div>

        {companyOrgLog.length > 0 && (
          <div style={{ marginTop: 12, background: '#1a1a1a', borderRadius: 8, padding: '10px 14px' }}>
            {companyOrgLog.map((l, i) => (
              <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8, color: '#e5e5e5' }}>
                <span style={{ color: '#666', marginRight: 10 }}>{l.t}</span>{l.msg}
              </div>
            ))}
          </div>
        )}

        {companyOrgResults.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>✓ {companyOrgResults.length} companies found</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => exportCompaniesCSV(companyOrgResults)} style={c.ghostBtn}>Export CSV</button>
                <button onClick={() => {
                  setCompanyList(companyOrgResults)
                  setCompanyText('')
                }} style={c.primaryBtn}>
                  Load into company list →
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 240, overflowY: 'auto' }}>
              {companyOrgResults.map(co => (
                <div key={co.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #f0f0ec' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{co.co}</span>
                  <span style={{ ...c.muted, fontSize: 11 }}>{co.domain}</span>
                  {co.industry && <span style={{ ...c.muted, fontSize: 11 }}>{co.industry}</span>}
                  {co.employees && <span style={{ fontSize: 11, color: '#888' }}>{co.employees.toLocaleString()} emp</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...c.card, marginBottom: 14 }}>
        {/* Research CSV upload */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={c.label}>Upload research CSV</div>
            <p style={c.small}>Columns: Company Name, Website, Stage, Best contact type — website used as domain truth</p>
          </div>
          <label style={{ ...c.ghostBtn, cursor: 'pointer', flexShrink: 0 }}>
            Upload CSV
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files[0]; if (!f) return
              setCompanyCSVError('')
              const reader = new FileReader()
              reader.onload = ev => {
                try {
                  const parsed = parseResearchCSV(ev.target.result)
                  setCompanyList(parsed)
                  setCompanyText('')
                } catch (err) {
                  setCompanyCSVError(err.message)
                }
              }
              reader.readAsText(f)
            }} />
          </label>
        </div>

        {companyList.length > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✓ {companyList.length} companies loaded from CSV</span>
              <button onClick={() => { setCompanyList([]); setCompanyCSVError('') }} style={{ ...c.ghostBtn, padding: '3px 10px', fontSize: 11 }}>Clear</button>
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {companyList.map(co => (
                <span key={co.id} style={{ fontSize: 11, background: '#fff', border: '1px solid #d1fae5', borderRadius: 5, padding: '2px 7px', color: '#065f46' }}>
                  {co.co}{co.domain ? ` · ${co.domain}` : ''}{co.roleHint ? ` · ${co.roleHint}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {companyCSVError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {companyCSVError}</p>}

        {/* Manual text fallback */}
        {companyList.length === 0 && (
          <>
            <div style={c.label}>Or paste company names manually</div>
            <textarea
              style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
              placeholder={`BNY Mellon\nBlackRock | blackrock.com\nVanguard`}
              value={companyText}
              onChange={e => setCompanyText(e.target.value)}
            />
          </>
        )}

        {companySearching && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>Searching {companyProgress} / {(companyList.length || parseCompanyList(companyText).length)}…</span>
              <span style={c.muted}>{companyContacts.length} found so far</span>
            </div>
            <div style={c.progress}><div style={c.bar(companyProgress / Math.max(1, companyList.length || parseCompanyList(companyText).length) * 100)} /></div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={c.small}>Tiered Apollo search per company · max 2 contacts · CTO/CEO/Founder fallback</p>
          <button onClick={searchCompanies} disabled={companySearching || (!companyList.length && !companyText.trim())} style={c.primaryBtn}>
            {companySearching ? 'Searching…' : 'Find contacts →'}
          </button>
        </div>
      </div>

      {companyLog.length > 0 && (
        <div style={{ ...c.card, marginBottom: 14, background: '#1a1a1a', color: '#e5e5e5' }}>
          {companyLog.map((l, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
              <span style={{ color: '#666', marginRight: 10 }}>{l.t}</span>{l.msg}
            </div>
          ))}
        </div>
      )}

      {companyContacts.length > 0 && (
        <div style={{ ...c.card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ ...c.h2, margin: 0 }}>{companyContacts.length} contacts found</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => exportCSV(companyContacts, 'apollo-contacts')} style={c.ghostBtn}>Export CSV</button>
              <button onClick={() => beginDrafting(companyContacts)} disabled={!canDraft} style={c.primaryBtn}>Draft emails →</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {companyContacts.map(ct => (
              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f0f0ec' }}>
                <Avatar name={ct.name} size={26} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{ct.name}</span>
                <span style={{ ...c.muted, fontSize: 12 }}>{ct.co}</span>
                <span style={{ ...c.muted, fontSize: 11, maxWidth: 180, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ct.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── LEVEL 2: CSV ────────────────────────────────────────────────────────
  else if (phase === 'csv') return (
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>Import from CSV</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>Paste or upload your contact list</p>
        </div>
        <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Settings</button>
      </div>

      <div style={{ ...c.card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <label style={c.label}>Paste CSV content</label>
            <p style={c.small}>Required columns: name or first_name+last_name, email · Optional: title, company, domain</p>
          </div>
          <label style={{ ...c.ghostBtn, cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>
            Upload file
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files[0]; if (!f) return
              const reader = new FileReader()
              reader.onload = ev => setCsvText(ev.target.result)
              reader.readAsText(f)
            }} />
          </label>
        </div>
        <textarea
          style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
          placeholder={`name,email,company,title\n"John Smith",john.smith@example.com,"Acme Corp","VP Data Engineering"\n"Jane Doe",jane@widgets.com,"Widgets Inc","Director Data Platform"`}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
        />
        {csvError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {csvError}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {csvContacts.length > 0
            ? <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✓ {csvContacts.length} contacts parsed</span>
            : <span />
          }
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={parseCsvInput} disabled={!csvText.trim()} style={c.ghostBtn}>Parse CSV</button>
            {csvContacts.length > 0 && (
              <button onClick={() => beginDrafting(csvContacts)} disabled={!canDraft} style={c.primaryBtn}>Draft {csvContacts.length} emails →</button>
            )}
          </div>
        </div>
      </div>

      {csvContacts.length > 0 && (
        <div style={{ ...c.card }}>
          <h2 style={c.h2}>{csvContacts.length} contacts ready</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            {csvContacts.map(ct => (
              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f0f0ec' }}>
                <Avatar name={ct.name} size={26} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{ct.name}</span>
                <span style={{ ...c.muted, fontSize: 12 }}>{ct.company}</span>
                <span style={{ fontSize: 11, color: ct.email ? '#16a34a' : '#dc2626' }}>{ct.email || 'no email'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── LEVEL 3: MANUAL CONTACTS INPUT ──────────────────────────────────────
  if (phase === 'contacts_input')
    return (
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={c.h1}>Your contacts</h1>
            <p style={{ ...c.muted, marginTop: 4 }}>Paste a CSV or type contacts manually — then draft emails</p>
          </div>
          <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Settings</button>
        </div>
        <div style={{ ...c.card, marginBottom: 14 }}>
          <label style={c.label}>Contact list (CSV format)</label>
          <textarea style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
            placeholder={`name,email,company,title\n"Rick Zakharov",rick@freddiemac.com,"Freddie Mac","Director Data Engineering"`}
            value={manualText} onChange={e => setManualText(e.target.value)} />
          {manualErr && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {manualErr}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={parseManual} disabled={!manualText.trim()} style={c.ghostBtn}>Parse</button>
            {manualContacts.length > 0 && (
              <button onClick={() => beginDrafting(manualContacts)} disabled={!canDraft} style={c.primaryBtn}>Draft {manualContacts.length} emails →</button>
            )}
          </div>
        </div>
        {manualContacts.length > 0 && (
          <div style={c.card}>
            <h2 style={c.h2}>{manualContacts.length} contacts</h2>
            {manualContacts.map(ct => (
              <div key={ct.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0ec' }}>
                <Avatar name={ct.name} size={26} /><span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{ct.name}</span>
                <span style={c.muted}>{ct.company}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )

  // ── DRAFTING ─────────────────────────────────────────────────────────────
  if (phase === 'drafting') {
    const N = contacts.length
    return (
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={c.h1}>Drafting {N} emails…</h1>
            <p style={{ ...c.muted, marginTop: 4 }}>{model.label} · {draftProgress} / {N} · {totalTokens.toLocaleString()} tokens</p>
          </div>
          <button onClick={() => { abortRef.current = true }} style={c.ghostBtn}>Pause</button>
        </div>
        <div style={{ ...c.card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{draftProgress} / {N}</span>
            <span style={c.muted}>{Math.round(draftProgress / N * 100)}%</span>
          </div>
          <div style={c.progress}><div style={c.bar(draftProgress / N * 100)} /></div>
          {draftCurrent && <p style={{ ...c.muted, fontSize: 12, marginTop: 4 }}>Writing for <strong style={{ color: '#111' }}>{draftCurrent.name}</strong> at {draftCurrent.co || draftCurrent.company}…</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {contacts.slice(0, draftProgress + 1).reverse().map(ct => {
            const d = drafts[ct.id]
            return (
              <div key={ct.id} style={{ ...c.card, padding: '9px 14px', display: 'flex', gap: 10, alignItems: 'center', opacity: d ? 1 : 0.5 }}>
                <Avatar name={ct.name} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{ct.name}</span>
                    <span style={c.muted}>· {ct.co || ct.company}</span>
                    {d && <span style={c.tag(d.status)}>{d.status}</span>}
                    {!d && ct.id === draftCurrent?.id && <span style={{ ...c.muted, fontSize: 11 }}>writing…</span>}
                  </div>
                  {d && <p style={{ ...c.muted, fontSize: 11, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{d.subject}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── REVIEW ────────────────────────────────────────────────────────────────
  if (phase === 'review') {
    const sel = selected || contacts[0]
    const selDraft = sel ? drafts[sel.id] : null
    const isEditing = sel && editing === sel.id
    const N = contacts.length
    const readyCount = Object.values(drafts).filter(d => d).length
    const editedCount = Object.values(drafts).filter(d => d?.status === 'edited').length
    const fallbackCount = Object.values(drafts).filter(d => d?.status === 'fallback').length

    return (
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={c.h1}>Review & approve</h1>
            <p style={{ ...c.muted, marginTop: 4 }}>{model.label} · {totalTokens.toLocaleString()} tokens{fallbackCount > 0 ? ` · ${fallbackCount} fallbacks` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              const msg = encodeURIComponent('Your outbound emails are ready to review at http://localhost:3000')
              window.open(`https://wa.me/?text=${msg}`, '_blank')
            }} style={c.ghostBtn}>WhatsApp share</button>
            <button onClick={approveAll} style={c.ghostBtn}>Approve all</button>
            <button onClick={() => setPhase('schedule')} disabled={approved.size === 0} style={c.primaryBtn}>
              Schedule ({approved.size}) →
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { n: readyCount, l: 'drafted', col: '#0066cc' },
            { n: editedCount, l: 'edited', col: '#d97706' },
            { n: flagged.size, l: 'flagged', col: '#dc2626' },
            { n: approved.size, l: 'approved', col: '#16a34a' },
          ].map(s => (
            <div key={s.l} style={c.statBox}>
              <span style={{ ...c.statNum, color: s.col }}>{s.n}</span>
              <span style={c.statLbl}>{s.l}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={c.sidebar}>
            {contacts.map(ct => {
              const d = drafts[ct.id]
              const isSel = sel?.id === ct.id
              return (
                <div key={ct.id} onClick={() => { setSelected(ct); setEditing(null) }} style={c.sideItem(isSel)}>
                  <Avatar name={ct.name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ct.name}</div>
                    <div style={{ ...c.muted, fontSize: 11 }}>{ct.co || ct.company}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {flagged.has(ct.id) && <span style={{ color: '#dc2626', fontSize: 11 }}>⚑</span>}
                    {approved.has(ct.id) && <span style={{ color: '#16a34a', fontSize: 12 }}>✓</span>}
                    {d?.status === 'fallback' && <span style={{ color: '#d97706', fontSize: 11 }}>~</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Email view */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sel && (
              <div style={{ ...c.card, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={sel.name} size={40} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{sel.name}</p>
                  <p style={{ ...c.muted, margin: '2px 0 0', fontSize: 12 }}>{sel.title} · {sel.co || sel.company}</p>
                  <p style={{ ...c.muted, margin: '1px 0 0', fontSize: 11 }}>{sel.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!isEditing && <>
                    <button onClick={() => toggleFlag(sel.id)} style={{ ...c.ghostBtn, color: flagged.has(sel.id) ? '#dc2626' : undefined }}>{flagged.has(sel.id) ? 'Unflag' : 'Flag'}</button>
                    <button onClick={() => startEdit(sel.id)} style={c.ghostBtn}>Edit</button>
                    <button onClick={() => toggleApprove(sel.id)} style={approved.has(sel.id) ? c.successBtn : c.ghostBtn}>{approved.has(sel.id) ? 'Approved ✓' : 'Approve'}</button>
                  </>}
                  {isEditing && <>
                    <button onClick={() => setEditing(null)} style={c.ghostBtn}>Cancel</button>
                    <button onClick={saveEdit} style={c.primaryBtn}>Save</button>
                  </>}
                </div>
              </div>
            )}

            {selDraft && (
              <div style={c.card}>
                <label style={c.label}>Subject</label>
                <div style={{ marginBottom: 12 }}>
                  {isEditing
                    ? <input value={editSubj} onChange={e => setEditSubj(e.target.value)} />
                    : <p style={{ margin: 0, fontSize: 14, fontWeight: 700, padding: '8px 12px', background: '#f7f7f5', borderRadius: 8 }}>{selDraft.subject}</p>}
                </div>
                <label style={c.label}>Body</label>
                {isEditing
                  ? <textarea style={{ minHeight: 180 }} value={editBody} onChange={e => setEditBody(e.target.value)} />
                  : <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', padding: 12, background: '#f7f7f5', borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>{selDraft.body}</pre>}
                {selDraft.status === 'fallback' && (
                  <p style={{ fontSize: 11, marginTop: 10, padding: '7px 12px', background: '#fef3c7', borderRadius: 8, color: '#92400e' }}>
                    Fallback template ({selDraft.error}) — edit before sending.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── SCHEDULE ──────────────────────────────────────────────────────────────
  if (phase === 'schedule') {
    const approvedList = contacts.filter(c => approved.has(c.id))
    const N = approvedList.length
    const [sh, sm] = sendTime.split(':').map(Number)
    const total = (N - 1) * gap
    const endH = Math.floor((sh * 60 + sm + total) / 60) % 24
    const endM = (sh * 60 + sm + total) % 60
    const canSend = N > 0 && sendDate && sendTime && !scheduleSending

    return (
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div><h1 style={c.h1}>Schedule campaign</h1><p style={{ ...c.muted, marginTop: 4 }}>{N} approved · set your send window</p></div>
          <button onClick={() => setPhase('review')} style={c.ghostBtn}>← Review</button>
        </div>
        <div style={{ ...c.card, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div><label style={c.label}>Date</label><input type="date" value={sendDate} onChange={e => setSendDate(e.target.value)} min={new Date().toISOString().split('T')[0]} /></div>
            <div><label style={c.label}>Start time</label><input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} /></div>
            <div><label style={c.label}>Gap between emails</label>
              <select value={gap} onChange={e => setGap(Number(e.target.value))}>
                {[2, 3, 5, 7, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v} minutes</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[{ n: N, l: 'emails' }, { n: `${gap}m`, l: 'gap' }, { n: sendTime || '—', l: 'start' }, { n: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`, l: 'last send' }].map(s => (
            <div key={s.l} style={c.statBox}><span style={c.statNum}>{s.n}</span><span style={c.statLbl}>{s.l}</span></div>
          ))}
        </div>
        <div style={{ ...c.card, marginBottom: 16 }}>
          <h2 style={c.h2}>Send timeline</h2>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {approvedList.map((ct, i) => {
              const tm = sh * 60 + sm + i * gap
              const hh = Math.floor(tm / 60) % 24, mm = tm % 60
              const d = drafts[ct.id]
              return (
                <div key={ct.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f0f0ec' }}>
                  <span style={{ ...c.muted, minWidth: 40, fontFamily: 'monospace', fontSize: 11 }}>{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span>
                  <Avatar name={ct.name} size={20} />
                  <span style={{ flex: 1, fontWeight: 500 }}>{ct.name}</span>
                  <span style={c.muted}>{ct.co || ct.company}</span>
                  <span style={{ fontSize: 11, color: '#888', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d?.subject}</span>
                </div>
              )
            })}
          </div>
        </div>
        {scheduleError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#991b1b', fontSize: 13 }}>
            {scheduleError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={c.small}>Total spread: {Math.floor(total / 60)}h {total % 60}m · Sent via Outlook SMTP</p>
          <button onClick={scheduleSend} disabled={!canSend} style={c.primaryBtn}>
            {scheduleSending ? 'Scheduling…' : `Schedule ${N} email${N !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    )
  }

  // ── SENT ──────────────────────────────────────────────────────────────────
  if (phase === 'sent') return (
    <div>
      {statusBar()}
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 style={{ ...c.h1, marginBottom: 8 }}>{sentCount} email{sentCount !== 1 ? 's' : ''} scheduled</h1>
        <p style={{ ...c.muted, marginBottom: 32 }}>
          Sending via Outlook SMTP starting {sendDate} at {sendTime}, every {gap} min.
          The server handles delivery — you can close this tab.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 400, margin: '0 auto 32px' }}>
          {[{ n: sentCount, l: 'scheduled' }, { n: sendTime, l: 'first send' }, { n: `${gap}m`, l: 'gap' }].map(s => (
            <div key={s.l} style={c.statBox}><span style={c.statNum}>{s.n}</span><span style={c.statLbl}>{s.l}</span></div>
          ))}
        </div>
        <button onClick={() => setPhase('entry')} style={c.primaryBtn}>New campaign</button>
      </div>
    </div>
  )

  // ── SENT HISTORY ──────────────────────────────────────────────────────────
  if (phase === 'sent_history') {
    const sortedEmails = [...sentHistory].sort((a, b) => {
      if (a.sentAt && b.sentAt) return new Date(b.sentAt) - new Date(a.sentAt)
      if (a.sentAt) return -1
      if (b.sentAt) return 1
      return 0
    })
    return (
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={c.h1}>Sent emails</h1>
            <p style={{ ...c.muted, marginTop: 4 }}>{sentHistory.length} email{sentHistory.length !== 1 ? 's' : ''} sent</p>
          </div>
          <button onClick={() => setPhase('entry')} style={c.ghostBtn}>← Back</button>
        </div>

        {sentHistory.length === 0 ? (
          <div style={{ ...c.card, textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <h2 style={c.h2}>No emails sent yet</h2>
            <p style={c.muted}>Schedule a campaign to see your sent emails here.</p>
          </div>
        ) : (
          <div style={{ ...c.card }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {sortedEmails.map((email, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: i < sentHistory.length - 1 ? '1px solid #f0f0ec' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: email.failed ? '#dc2626' : '#16a34a', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{email.to}</span>
                      {email.company && <span style={{ ...c.muted, fontSize: 12 }}>· {email.company}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
                    {email.sentAt && <div style={{ fontSize: 11, color: '#999' }}>{new Date(email.sentAt).toLocaleString()}</div>}
                    {email.failed && email.error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Failed: {email.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── DRAFT CONFIRMATION (friend: use existing or edit before drafting) ──
  if (draftConfirmContacts) {
    const contacts = draftConfirmContacts
    return (
      <div>
        {statusBar()}
        <div style={{ ...c.card, maxWidth: 560, margin: '40px auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <h2 style={{ ...c.h1, marginBottom: 8 }}>Ready to draft {contacts.length} emails?</h2>
            <p style={{ ...c.muted }}>Use your saved account settings, or update them first.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={async () => {
              // Verify OAuth token exists before drafting
              setDraftConfirmLoading(true)
              setDraftConfirmError('')
              try {
                const healthUrl = emailProvider === 'gmail'
                  ? '/api/gmail/token-health'
                  : '/api/token-health'
                const headers = emailProvider === 'gmail' ? { 'x-user-id': currentUser.userId } : {}
                const res = await fetch(healthUrl, { headers })
                const data = await res.json()
                if (!data.ok && data.status !== 'ok') {
                  setDraftConfirmError('Your email account is not connected. Please go to Settings → Email Account and authorize first.')
                  setDraftConfirmLoading(false)
                  return
                }
              } catch {
                setDraftConfirmError('Could not verify email account. Check your connection.')
                setDraftConfirmLoading(false)
                return
              }
              setDraftConfirmContacts(null)
              setDraftConfirmLoading(false)
              beginDrafting(contacts)
            }} disabled={draftConfirmLoading} style={{ ...c.primaryBtn, width: '100%', padding: '14px' }}>
              {draftConfirmLoading ? 'Verifying account…' : `✓ Use existing config & draft ${contacts.length} emails →`}
            </button>
            <button onClick={() => { setDraftConfirmContacts(null); setPhase('settings') }} style={{ ...c.ghostBtn, width: '100%', padding: '12px' }}>
              ✏️ Edit account settings first
            </button>
            <button onClick={() => setDraftConfirmContacts(null)} style={{ ...c.ghostBtn, width: '100%', fontSize: 12, color: '#888' }}>
              Cancel
            </button>
          </div>
          {draftConfirmError && (
            <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>
              {draftConfirmError}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Wizard overlay renders on top of current phase */}
      {isFriend && showSetupWizard && (
        <SetupWizard currentUser={currentUser} onComplete={() => setShowSetupWizard(false)} />
      )}
    </>
  )
}
