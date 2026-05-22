import { useState, useRef, useCallback, useEffect } from 'react'
import { searchPeople, bulkEnrich, searchOrgs } from './lib/apollo.js'
import { draftEmail, fetchSiteContent, promptToApolloParams, promptToApolloOrgParams } from './lib/ai.js'
import { parseCSV, parseCompanyList, parseResearchCSV } from './lib/csv.js'
import c from './styles.js'
import { MODELS, CAMPAIGN_MODES, ENTRY_LEVELS } from './constants.js'
import { normalizeDomain, extractDomainFromOrgResponse, extractEmail, extractEnrichedMatches, uniqueBy, exportCSV, isTitleRelevant } from './utils.js'
import Avatar from './components/Avatar.jsx'
import SharedSettings from './components/SharedSettings.jsx'
import SetupWizard from './components/SetupWizard.jsx'
import EntryPage from './components/pages/EntryPage.jsx'
import SentPage from './components/pages/SentPage.jsx'
import MyContactsPage from './components/pages/MyContactsPage.jsx'
import SentHistoryPage from './components/pages/SentHistoryPage.jsx'

const API_URL = import.meta.env.VITE_API_URL || ''

// ── MAIN APP ───────────────────────────────────────────────────────────────
// API keys live in server.js and .env — never in the browser bundle
// The server proxy handles all OpenAI, Anthropic, and Apollo calls
const ENV_KEYS = { openai: true, anthropic: true, apollo: true }

export default function App({ onPhaseChange, onPhaseControllerReady, onUserChange } = {}) {
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
          const u = { userId: session.userId, name: session.name, email: session.email }
          setCurrentUser(u)
          onUserChange?.(u)
        }
      } catch {}
    }
  }, [])

  // Fetch profile when user changes
  useEffect(() => {
    async function loadProfile() {
      if (!currentUser) return
      try {
        const res = await fetch(`${API_URL}/api/user/profile`, { headers: { 'x-user-id': currentUser.userId } })
        if (res.ok) setProfile(await res.json())
      } catch {}
    }
    loadProfile()
  }, [currentUser])

  async function handleLogin(email, password) {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`${API_URL}/api/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) { setLoginError(data.error || 'Login failed'); return }
      const u = { userId: data.userId, name: data.name, email: data.email }
      setCurrentUser(u)
      onUserChange?.(u)
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

  async function handleSignup(email, name, password, passwordConfirm) {
    setSignupError('')
    if (!email.trim() || !name.trim() || !password.trim()) {
      setSignupError('All fields required')
      return
    }
    if (password !== passwordConfirm) {
      setSignupError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setSignupError('Password must be at least 6 characters')
      return
    }
    setSignupLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password })
      })
      const data = await res.json()
      if (!res.ok) { setSignupError(data.error || 'Signup failed'); return }
      // Signup successful, show login form
      setIsSignup(false)
      setSignupEmail('')
      setSignupName('')
      setSignupPassword('')
      setSignupPasswordConfirm('')
      setLoginEmail(email) // Pre-fill email in login form
      setLoginPass('')
    } catch {
      setSignupError('Connection error')
    }
    setSignupLoading(false)
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
      await fetch(`${API_URL}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
        body: JSON.stringify(updates)
      })
      const res = await fetch(`${API_URL}/api/user/profile`, { headers: { 'x-user-id': currentUser.userId } })
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
  const [isSignup, setIsSignup] = useState(false)

  // Signup local state
  const [signupEmail, setSignupEmail] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('')
  const [signupError, setSignupError] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)

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
  const [phase, setPhaseRaw] = useState('entry') // entry | settings | discover | companies | csv | contacts | drafting | review | schedule | sent | sent_history | my_contacts
  const setPhase = useCallback((p) => {
    setPhaseRaw(p)
    onPhaseChange?.(p)
  }, [onPhaseChange])
  const [entryLevel, setEntryLevel] = useState(null)

  // Expose phase controller to AppShell sidebar
  useEffect(() => {
    onPhaseControllerReady?.({ setPhase })
  }, [setPhase, onPhaseControllerReady])

  // Saved contacts state
  const [savedContacts, setSavedContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)

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

  // Import companies state
  const [importedCompanyText, setImportedCompanyText] = useState('')
  const [importedCompanies, setImportedCompanies] = useState([])
  const [importedValidating, setImportedValidating] = useState(false)
  const [importedValidated, setImportedValidated] = useState([])
  const [importedNotFound, setImportedNotFound] = useState([])

  // Batch review state (for auto-discovery emails)
  const [batchDrafts, setBatchDrafts] = useState({})
  const [batchApproved, setBatchApproved] = useState(new Set())

  // Discovery config state
  const [discoveryTime, setDiscoveryTime] = useState('09:00')
  const [discoveryQuota, setDiscoveryQuota] = useState(50)
  const [discoveryConfiguring, setDiscoveryConfiguring] = useState(false)
  const [discoveryStatus, setDiscoveryStatus] = useState(null)

  // Batch review state (for batch-drafted emails)
  const [reviewBatch, setReviewBatch] = useState([])
  const [reviewApproved, setReviewApproved] = useState(new Set())
  const [reviewEdits, setReviewEdits] = useState({})
  const [reviewStats, setReviewStats] = useState({ total: 0, approved: 0, avgScore: 0, lowScore: 0 })
  const [reviewFilter, setReviewFilter] = useState({ category: 'all', scoreThreshold: 'all' })
  const [reviewEditModal, setReviewEditModal] = useState(null) // {id, subject, body}
  const [reviewEditSubj, setReviewEditSubj] = useState('')
  const [reviewEditBody, setReviewEditBody] = useState('')

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
  const [selectedProvider, setSelectedProvider] = useState('')
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
        const [authRes, schedRes, gmailRes] = await Promise.all([
          fetch(`${API_URL}/api/token-health`),
          fetch(`${API_URL}/api/schedule-status`),
          fetch(`${API_URL}/api/gmail/token-health`, { headers: { 'x-user-id': currentUser.userId } })
        ])
        const auth = await authRes.json()
        const sched = await schedRes.json()
        const gmail = await gmailRes.json()
        setAuthStatus(auth)
        setScheduleStatus(sched)
        setGmailAuthStatus(gmail)
      } catch {}
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 30000)
    return () => clearInterval(id)
  }, [isFriend, currentUser])

  async function runReAuth() {
    setReAuthLoading(true)
    window.open('/api/auth-start', '_blank')
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch(`/api/token-health?_=${Date.now()}`)
        const data = await res.json()
        console.log('[ReAuth] poll', i, data)
        if (data.ok) {
          setAuthStatus(data)
          setReAuthLoading(false)
          return
        }
      } catch (e) { console.error('[ReAuth] poll error', i, e) }
    }
    setReAuthLoading(false)
  }

  async function runRetryFailed() {
    setRetryLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/schedule-retry`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const schedRes = await fetch(`${API_URL}/api/schedule-status`)
        setScheduleStatus(await schedRes.json())
      }
    } catch {}
    setRetryLoading(false)
  }

  async function loadSentHistory() {
    try {
      const res = await fetch(`${API_URL}/api/sent-emails`, { headers: { 'x-user-id': currentUser?.userId || 'friend' } })
      const data = await res.json()
      setSentHistory(data.emails || [])
      setPhase('sent_history')
    } catch {}
  }

  const model = MODELS.find(m => m.id === modelId) || MODELS[0]
  const aiConfig = { model: modelId }

  // Status bar — show both Gmail and Outlook
  const getAuthLabel = (status, provider) => {
    if (!status) return `${provider} not connected`
    if (status.status === 'ok') return `${provider} connected`
    if (status.status === 'warning') return `${provider} expires in ${status.minutesLeft}m`
    if (status.status === 'critical') return `${provider} critical — ${status.minutesLeft}m left`
    if (status.status === 'expired') return `${provider} expired`
    return `${provider} not connected`
  }
  const gmailLabel = getAuthLabel(gmailAuthStatus, 'Gmail')
  const outlookLabel = getAuthLabel(authStatus, 'Outlook')
  const authLabels = [gmailLabel, outlookLabel].filter(l => !l.includes('not connected'))
  const activeAuthColor = authStatus?.status === 'ok' ? '#16a34a' : authStatus?.status === 'warning' ? '#d97706' : authStatus?.status === 'expired' ? '#dc2626' : '#888'
  const activeProvider = isFriend ? emailProvider : 'outlook'
  const schedLabel = scheduleStatus ? `${scheduleStatus.pending} pending · ${scheduleStatus.sent} sent${scheduleStatus.failed ? ` · ${scheduleStatus.failed} failed` : ''}` : 'checking…'
  const hasFailed = scheduleStatus?.failed > 0
  const statusBar = (wide = false) => (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl mb-5 shadow-sm text-xs flex-wrap">
      <div className="flex items-center gap-2">
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: activeAuthColor, flexShrink: 0 }} />
        <span className="text-gray-500 font-medium">{authLabels.join(' · ')}</span>
        <button
          onClick={() => {
            if (isFriend && emailProvider === 'gmail') {
              window.open(`/api/gmail/auth-start?userId=${currentUser.userId}`, '_blank')
            } else {
              runReAuth()
            }
          }}
          disabled={reAuthLoading}
          className="px-2 py-0.5 bg-gray-900 text-white rounded-md text-[11px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          {reAuthLoading ? 'Opening…' : 'Re-authorize'}
        </button>
      </div>
      <div className="w-px h-3.5 bg-gray-200" />
      <span className="text-gray-400">Queue: <span className="text-gray-600 font-medium">{schedLabel}</span></span>
      {hasFailed && (
        <button
          onClick={runRetryFailed}
          disabled={retryLoading}
          className="px-2 py-0.5 bg-red-500 text-white rounded-md text-[11px] font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
        >
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

  // ── BATCH DRAFT FOR BULK IMPORT ────────────────────────────────────────────
  async function runBatchDrafts(contactList, companyDataMap = {}) {
    const batch = []
    for (let i = 0; i < contactList.length; i++) {
      if (abortRef.current) break
      const contact = contactList[i]
      const companyData = companyDataMap[contact.id] || {}
      setDraftProgress(i)
      try {
        // Use new draftEmail signature with companyData for category detection
        const siteContent = await fetchSiteContent(contact.domain || contact.co)
        const { subject, body, tokens, category, score, passed } = await draftEmail(contact, aiConfig, companyData, siteContent)
        tokRef.current += tokens || 0
        batch.push({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          title: contact.title,
          company: contact.company,
          subject,
          body,
          category,
          score: score || 0,
          passed: passed !== false
        })
      } catch (e) {
        // Fallback: create low-score draft
        batch.push({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          title: contact.title,
          company: contact.company,
          subject: `Data engineering opportunity at ${contact.company}`,
          body: `Hi ${contact.name?.split(' ')[0]},\n\nI'm reaching out regarding a potential fit. Would you be open to a brief conversation?\n\nBest regards`,
          category: 'unknown',
          score: 10,
          passed: false
        })
      }
      setTotalTokens(tokRef.current)
    }
    setReviewBatch(batch)
    setReviewApproved(new Set())
    setReviewEdits({})
    setDraftProgress(contactList.length)
    setDraftCurrent(null)
    setPhase('review_batch')
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

  // ── LOAD SAVED CONTACTS ────────────────────────────────────────────────────
  async function loadSavedContacts() {
    setLoadingContacts(true)
    try {
      const res = await fetch(`${API_URL}/api/contacts`)
      const data = await res.json()
      setSavedContacts(data.contacts || [])
    } catch (e) {
      console.error('Failed to load contacts:', e)
    }
    setLoadingContacts(false)
  }

  // ── SCHEDULE SEND ───────────────────────────────────────────────────────
  async function scheduleSend() {
    const approvedContacts = contacts.filter(c => approved.has(c.id))
    if (!approvedContacts.length || !sendDate || !sendTime) return
    if (!selectedProvider) {
      setScheduleError('Please select a provider (Gmail or Outlook)')
      return
    }
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
      const res = await fetch(`${API_URL}/api/schedule-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, provider: selectedProvider })
      })
      const data = await res.json()
      if (data.ok) {
        setSentCount(emails.length)
        setPhase('sent')
      } else {
        setScheduleError(data.error || 'Server error')
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
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4">
      {/* Background orbs */}
      <div className="fixed top-[-100px] left-[-200px] w-[500px] h-[500px] rounded-full bg-brand-500/10 blur-[80px] pointer-events-none" />
      <div className="fixed bottom-[-80px] right-[-100px] w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-[80px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">FirstShot</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-gray-400">
            {isSignup ? 'Start taking shots in minutes.' : 'Sign in to your campaigns.'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-card">
          <div className="space-y-4">
            {!isSignup ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail || ''}
                    onChange={e => setLoginEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin(loginEmail, loginPass)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={loginPass || ''}
                    onChange={e => setLoginPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin(loginEmail, loginPass)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                {loginError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-red-700 text-xs font-medium">{loginError}</div>
                )}
                <button
                  onClick={() => handleLogin(loginEmail, loginPass)}
                  disabled={loginLoading}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 disabled:opacity-40"
                >
                  {loginLoading ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  No account?{' '}
                  <button onClick={() => setIsSignup(true)} className="text-brand-600 font-semibold hover:text-brand-700">
                    Sign up free
                  </button>
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Name</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={signupName || ''}
                    onChange={e => setSignupName(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={signupEmail || ''}
                    onChange={e => setSignupEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword || ''}
                    onChange={e => setSignupPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Confirm password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={signupPasswordConfirm || ''}
                    onChange={e => setSignupPasswordConfirm(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  />
                </div>
                {signupError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-red-700 text-xs font-medium">{signupError}</div>
                )}
                <button
                  onClick={() => handleSignup(signupEmail, signupName, signupPassword, signupPasswordConfirm)}
                  disabled={signupLoading}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 disabled:opacity-40"
                >
                  {signupLoading ? 'Creating account…' : 'Create account — free'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  Already have an account?{' '}
                  <button onClick={() => setIsSignup(false)} className="text-brand-600 font-semibold hover:text-brand-700">
                    Sign in
                  </button>
                </p>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-5">
          Free unlimited sends · First month · No credit card
        </p>
      </div>
    </div>
  )

  // Wrap all authenticated pages in consistent layout container
  const wrap = (children) => (
    <div className="px-6 py-6 max-w-5xl mx-auto min-h-full">
      {children}
    </div>
  )

  // ── ENTRY LEVEL SELECTION ───────────────────────────────────────────────
  if (phase === 'entry') return wrap(
    <EntryPage
      entryLevel={entryLevel}
      setEntryLevel={setEntryLevel}
      scheduleStatus={scheduleStatus}
      isFriend={isFriend}
      handleLogout={handleLogout}
      loadSavedContacts={loadSavedContacts}
      loadSentHistory={loadSentHistory}
      setPhase={setPhase}
    />
  )

  // ── SETTINGS ────────────────────────────────────────────────────────────
  if (phase === 'settings') return wrap(
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={c.h1}>Settings</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>Configure your account</p>
        </div>
        <button onClick={() => setPhase('entry')} style={c.ghostBtn}>← Back</button>
      </div>

      {/* Unified settings for all users */}
      <SharedSettings
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
        setProfile={setProfile}
      />

      {/* Continue button — branches to discover/companies/csv/import based on entryLevel */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={() => {
          const nextPhase = entryLevel === 'scratch' ? 'discover'
                          : entryLevel === 'companies' ? 'companies'
                          : entryLevel === 'bulk_import' ? 'import_companies'
                          : 'csv'
          setPhase(nextPhase)
        }} style={c.primaryBtn}>
          Continue →
        </button>
      </div>
    </div>
  )

  // ── IMPORT COMPANIES (bulk CSV upload + Apollo validation) ──────────────────
  if (phase === 'import_companies') return wrap(
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>Import & validate companies</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>CSV: name, domain, industry (opt), size (opt), location (opt)</p>
        </div>
        <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Settings</button>
      </div>

      <div style={{ ...c.card, marginBottom: 14 }}>
        <label style={c.label}>Paste company list (CSV)</label>
        <textarea
          style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
          placeholder="name,domain,industry,size,location&#10;Acme Corp,acme.com,SaaS,101-500,San Francisco&#10;BankCo,bankco.com,Finance,5001-10000,New York"
          value={importedCompanyText}
          onChange={e => setImportedCompanyText(e.target.value)}
        />
        <button onClick={async () => {
          try {
            setImportedValidating(true)
            const { parseCompanyList } = await import('./lib/csv.js')
            const parsed = parseCompanyList(importedCompanyText)
            setImportedCompanies(parsed)

            // Validate via server
            const res = await fetch(`${API_URL}/api/companies/validate-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
              body: JSON.stringify({ companies: parsed, userId: currentUser.userId })
            })
            const data = await res.json()
            setImportedValidated(data.validated || [])
            setImportedNotFound(data.notFound || [])
            setImportedValidating(false)
          } catch (e) {
            alert(`Error: ${e.message}`)
            setImportedValidating(false)
          }
        }} disabled={importedValidating || !importedCompanyText.trim()} style={c.primaryBtn}>
          {importedValidating ? 'Validating…' : 'Validate with Apollo →'}
        </button>
      </div>

      {importedValidated.length > 0 && (
        <div style={{ ...c.card, marginBottom: 14, background: '#f0f0ec' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>✓ Validated: {importedValidated.length}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
            {importedValidated.slice(0, 10).map((co, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{co.name}</strong> {co.industry && `· ${co.industry}`}</span>
                <span style={c.tag('ready')}>{co.domain}</span>
              </div>
            ))}
            {importedValidated.length > 10 && <span style={c.muted}>+{importedValidated.length - 10} more</span>}
          </div>
        </div>
      )}

      {importedNotFound.length > 0 && (
        <div style={{ ...c.card, marginBottom: 14, background: '#ffe5e5' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>✗ Not found: {importedNotFound.length}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto', fontSize: 11 }}>
            {importedNotFound.slice(0, 5).map((co, i) => (
              <div key={i}>{co.name || co.domain} — {co.reason}</div>
            ))}
            {importedNotFound.length > 5 && <span style={c.muted}>+{importedNotFound.length - 5} more</span>}
          </div>
        </div>
      )}

      {importedValidated.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPhase('settings')} style={c.ghostBtn}>Cancel</button>
          <button onClick={() => setPhase('settings')} style={c.primaryBtn}>
            Configure discovery → (in settings)
          </button>
        </div>
      )}
    </div>
  )

  // ── REVIEW BATCH (auto-drafted emails for bulk import) ──────────────────
  if (phase === 'review_batch') {
    const filtered = reviewBatch.filter(d => {
      const passCategory = reviewFilter.category === 'all' || d.category === reviewFilter.category
      const passScore = reviewFilter.scoreThreshold === 'all'
        ? true
        : reviewFilter.scoreThreshold === '>=20' ? d.score >= 20
        : reviewFilter.scoreThreshold === '>=18' ? d.score >= 18
        : d.score < 18
      return passCategory && passScore
    })
    const N = reviewBatch.length
    const appCount = reviewApproved.size
    const avgScore = N > 0 ? (reviewBatch.reduce((s, d) => s + (d.score || 0), 0) / N).toFixed(1) : 0
    const lowCount = reviewBatch.filter(d => d.score < 18).length
    const categories = [...new Set(reviewBatch.map(d => d.category))].sort()

    return wrap(
      <div>
        {statusBar()}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={c.h1}>Review drafted emails</h1>
            <p style={{ ...c.muted, marginTop: 4 }}>{N} drafted · {appCount} approved · avg score {avgScore}/25</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {lowCount > 0 && <span style={{ ...c.muted, fontSize: 12, color: '#dc2626' }}>⚠️ {lowCount} low-score drafts</span>}
            <button onClick={() => setPhase('settings')} style={c.ghostBtn}>← Back</button>
            <button
              onClick={() => {
                // Move approved drafts to regular drafts for scheduling
                const approved = reviewBatch.filter(d => reviewApproved.has(d.id))
                const newDrafts = {}
                approved.forEach(d => {
                  newDrafts[d.id] = {
                    subject: reviewEdits[d.id]?.subject || d.subject,
                    body: reviewEdits[d.id]?.body || d.body,
                    status: 'edited',
                    category: d.category,
                    score: d.score
                  }
                })
                setDrafts(newDrafts)
                const approvedContacts = approved.map(d => ({
                  id: d.id,
                  name: d.name,
                  email: d.email,
                  title: d.title,
                  company: d.company,
                  co: d.company
                }))
                setContacts(approvedContacts)
                setSelected(null)
                setPhase('schedule')
              }}
              disabled={appCount === 0}
              style={c.primaryBtn}
            >
              Schedule ({appCount}) →
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { n: N, l: 'drafted', col: '#0066cc' },
            { n: appCount, l: 'approved', col: '#16a34a' },
            { n: `${avgScore}`, l: 'avg score', col: '#d97706' },
            { n: lowCount, l: 'low-score', col: '#dc2626' },
          ].map(s => (
            <div key={s.l} style={c.statBox}>
              <span style={{ ...c.statNum, color: s.col }}>{s.n}</span>
              <span style={c.statLbl}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ ...c.card, marginBottom: 14, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={c.label}>Category</label>
            <select
              value={reviewFilter.category}
              onChange={e => setReviewFilter({ ...reviewFilter, category: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="all">All categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={c.label}>Score threshold</label>
            <select
              value={reviewFilter.scoreThreshold}
              onChange={e => setReviewFilter({ ...reviewFilter, scoreThreshold: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="all">All scores</option>
              <option value=">=20">Score ≥ 20 (high quality)</option>
              <option value=">=18">Score ≥ 18 (acceptable)</option>
              <option value="<18">Score &lt; 18 (low quality)</option>
            </select>
          </div>
        </div>

        {/* Batch table */}
        <div style={{ ...c.card, overflowX: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              No emails match the selected filters
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e5e0', background: '#f7f7f5' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: 40 }}>✓</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Title</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Subject</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 50 }}>Score</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 60 }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((draft, i) => {
                  const isApproved = reviewApproved.has(draft.id)
                  const scoreColor = draft.score >= 20 ? '#16a34a' : draft.score >= 18 ? '#d97706' : '#dc2626'
                  return wrap(
                    <tr key={draft.id} style={{ borderBottom: '1px solid #f0f0ec', background: isApproved ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isApproved}
                          onChange={e => {
                            if (e.target.checked) {
                              setReviewApproved(new Set([...reviewApproved, draft.id]))
                            } else {
                              const updated = new Set(reviewApproved)
                              updated.delete(draft.id)
                              setReviewApproved(updated)
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}><strong>{draft.company}</strong></td>
                      <td style={{ padding: '8px 12px' }}>{draft.name}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: '#666' }}>{draft.title}</td>
                      <td style={{ padding: '8px 12px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reviewEdits[draft.id]?.subject || draft.subject}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: scoreColor }}>{draft.score}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setReviewEditModal(draft.id)
                            setReviewEditSubj(reviewEdits[draft.id]?.subject || draft.subject)
                            setReviewEditBody(reviewEdits[draft.id]?.body || draft.body)
                          }}
                          style={{ ...c.ghostBtn, padding: '4px 8px', fontSize: 11 }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {lowCount > 0 && (
          <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', color: '#92400e', fontSize: 13 }}>
            ⚠️ {lowCount} email{lowCount !== 1 ? 's' : ''} have low scores (&lt;18/25). Review and edit before approving.
          </div>
        )}

        {/* Edit modal for batch review */}
        {reviewEditModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ ...c.card, maxWidth: 600, maxHeight: '80vh', overflowY: 'auto', width: '90%' }}>
              <h2 style={{ ...c.h2, marginBottom: 16 }}>Edit email</h2>
              <label style={c.label}>Subject</label>
              <input
                value={reviewEditSubj}
                onChange={e => setReviewEditSubj(e.target.value)}
                style={{ width: '100%', marginBottom: 14 }}
              />
              <label style={c.label}>Body</label>
              <textarea
                value={reviewEditBody}
                onChange={e => setReviewEditBody(e.target.value)}
                style={{ width: '100%', minHeight: 240, marginBottom: 14, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setReviewEditModal(null)} style={c.ghostBtn}>Cancel</button>
                <button
                  onClick={() => {
                    setReviewEdits({
                      ...reviewEdits,
                      [reviewEditModal]: {
                        subject: reviewEditSubj,
                        body: reviewEditBody
                      }
                    })
                    setReviewEditModal(null)
                  }}
                  style={c.primaryBtn}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── LEVEL 0: PROMPT DISCOVERY ───────────────────────────────────────────
  if (phase === 'discover') return wrap(
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
  if (phase === 'companies') return wrap(
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
  else if (phase === 'csv') return wrap(
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
    return wrap(
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
    return wrap(
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
            return wrap(
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

    return wrap(
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
              return wrap(
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

    return wrap(
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
              return wrap(
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
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>Send via:</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelectedProvider('gmail')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 8,
                border: selectedProvider === 'gmail' ? '2px solid #2563eb' : '1px solid #d1d5db',
                background: selectedProvider === 'gmail' ? '#eff6ff' : '#fff',
                color: selectedProvider === 'gmail' ? '#1e40af' : '#666',
                fontWeight: selectedProvider === 'gmail' ? 600 : 500,
                cursor: 'pointer',
                fontSize: 13,
                transition: 'all 0.2s'
              }}
            >
              📧 Gmail
            </button>
            <button
              onClick={() => setSelectedProvider('outlook')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 8,
                border: selectedProvider === 'outlook' ? '2px solid #2563eb' : '1px solid #d1d5db',
                background: selectedProvider === 'outlook' ? '#eff6ff' : '#fff',
                color: selectedProvider === 'outlook' ? '#1e40af' : '#666',
                fontWeight: selectedProvider === 'outlook' ? 600 : 500,
                cursor: 'pointer',
                fontSize: 13,
                transition: 'all 0.2s'
              }}
            >
              📬 Outlook
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={c.small}>Total spread: {Math.floor(total / 60)}h {total % 60}m {selectedProvider && `· Sending via ${selectedProvider === 'gmail' ? 'Gmail' : 'Outlook'}`}</p>
          <button onClick={scheduleSend} disabled={!canSend || !selectedProvider} style={c.primaryBtn}>
            {scheduleSending ? 'Scheduling…' : `Schedule ${N} email${N !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    )
  }

  // ── SENT ──────────────────────────────────────────────────────────────────
  if (phase === 'sent') return wrap(
    <SentPage
      sentCount={sentCount}
      selectedProvider={selectedProvider}
      sendDate={sendDate}
      sendTime={sendTime}
      gap={gap}
      setPhase={setPhase}
      statusBar={statusBar}
    />
  )

  // ── MY CONTACTS ───────────────────────────────────────────────────────────
  if (phase === 'my_contacts') return wrap(
    <MyContactsPage
      savedContacts={savedContacts}
      loadingContacts={loadingContacts}
      loadSavedContacts={loadSavedContacts}
      setPhase={setPhase}
      statusBar={statusBar}
    />
  )

  // ── SENT HISTORY ──────────────────────────────────────────────────────────
  if (phase === 'sent_history') return wrap(
    <SentHistoryPage
      sentHistory={sentHistory}
      setPhase={setPhase}
      statusBar={statusBar}
    />
  )

  // ── DRAFT CONFIRMATION (friend: use existing or edit before drafting) ──
  if (draftConfirmContacts) {
    const contacts = draftConfirmContacts
    return wrap(
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
