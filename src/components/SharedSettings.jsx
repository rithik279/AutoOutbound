import { useState, useEffect } from 'react'
import c from '../styles.js'
import { MODELS, CAMPAIGN_MODES } from '../constants.js'
import { User, FileText, Zap, Mail, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function SharedSettings({
  profile, localSenderName, setLocalSenderName, localSenderEmail, setLocalSenderEmail,
  onUpdateProfile, setCampaignModeFn, setModelIdFn, campaignMode, modelId,
  currentUser, emailProvider, setEmailProvider, setProfile,
}) {
  const [tab, setTab] = useState('profile')

  const [resumeStatus, setResumeStatus] = useState('')

  const [promptTab, setPromptTab]         = useState('chat')
  const [promptChat, setPromptChat]       = useState([])
  const [promptInput, setPromptInput]     = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [editPrompt, setEditPrompt]       = useState('')
  const [pendingPrompt, setPendingPrompt] = useState(null)
  const [templates, setTemplates]         = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const [gmailStatus, setGmailStatus]   = useState(null)
  const [gmailLoading, setGmailLoading] = useState(false)

  const [discoveryTime, setDiscoveryTime]     = useState('09:00')
  const [discoveryQuota, setDiscoveryQuota]   = useState(50)
  const [discoverySaving, setDiscoverySaving] = useState(false)
  const [discoveryStatus, setDiscoveryStatus] = useState(null)

  useEffect(() => {
    if (profile?.prompt) setEditPrompt(profile.prompt)
  }, [profile])

  useEffect(() => {
    fetch(`${API_URL}/api/prompts/templates`)
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {})
  }, [])

  async function handleResumeUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeStatus('Extracting text…')
    try {
      const text = await file.text()
      let resumeText = text
      if (file.name.endsWith('.docx')) {
        const res = await fetch(`${API_URL}/api/resume-text-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name },
          body: text,
        })
        if (res.ok) resumeText = (await res.json()).text
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
    setPromptChat(ch => [...ch, { role: 'user', content: promptInput }])
    setPromptInput('')
    setPromptLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          system: `You are an email prompt expert. The user wants to modify their cold email prompt.\nCurrent prompt:\n${current}\n\nRespond ONLY with the full modified prompt (no commentary, no markdown, just the raw text).`,
          messages: [{ role: 'user', content: promptInput }],
        }),
      })
      const data = await res.json()
      const modified = data.choices?.[0]?.message?.content || ''
      setPendingPrompt(modified)
      setPromptChat(ch => [...ch, { role: 'assistant', content: 'Preview updated! Review the changes below.' }])
    } catch {
      setPromptChat(ch => [...ch, { role: 'assistant', content: 'Failed to update prompt. Try again.' }])
    }
    setPromptLoading(false)
  }

  async function acceptPrompt() {
    if (!pendingPrompt) return
    await onUpdateProfile({ prompt: pendingPrompt })
    setEditPrompt(pendingPrompt)
    setPendingPrompt(null)
  }

  function handleTemplateSelect(e) {
    const found = templates.find(t => t.name === e.target.value)
    setSelectedTemplate(found || null)
    setEditPrompt(found?.content || '')
  }

  async function handleConnectGmail() {
    setGmailLoading(true)
    window.open(`/api/gmail/auth-start?userId=${currentUser.userId}`, '_blank')
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const res  = await fetch(`${API_URL}/api/gmail/token-health`, { headers: { 'x-user-id': currentUser.userId } })
        const data = await res.json()
        if (data.ok) { setGmailStatus(data); break }
      } catch {}
    }
    setGmailLoading(false)
  }

  const tabs = [
    { id: 'profile',   label: 'Profile',        icon: <User size={14} /> },
    { id: 'resume',    label: 'Resume',          icon: <FileText size={14} /> },
    { id: 'prompt',    label: 'AI Prompt',       icon: <Zap size={14} /> },
    { id: 'email',     label: 'Email Account',   icon: <Mail size={14} /> },
    { id: 'discovery', label: 'Daily Discovery', icon: <RefreshCw size={14} /> },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
              tab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Profile ── */}
      {tab === 'profile' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Your details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your name (for email sign-off)</label>
                <input
                  value={localSenderName}
                  onChange={e => setLocalSenderName(e.target.value)}
                  placeholder="e.g. James O'Brien"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your email (Gmail sends from this)</label>
                <input
                  type="email"
                  value={localSenderEmail}
                  onChange={e => setLocalSenderEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => onUpdateProfile({ senderName: localSenderName, senderEmail: localSenderEmail })}
                className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all"
              >
                Save profile
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Campaign type</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.values(CAMPAIGN_MODES).map(mode => {
                const sel = campaignMode === mode.id
                return (
                  <button
                    key={mode.id}
                    onClick={() => setCampaignModeFn(mode.id)}
                    className={`text-left p-3.5 rounded-xl border-2 transition-all ${sel ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className={`font-bold text-xs mb-1 ${sel ? 'text-brand-600' : 'text-gray-700'}`}>{mode.label}</div>
                    <div className="text-xs text-gray-400 leading-relaxed">{mode.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI model selector removed — GPT-4o Mini always used */}
        </div>
      )}

      {/* ── Resume ── */}
      {tab === 'resume' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Upload your resume</h2>
          <p className="text-xs text-gray-400 mb-4">AI uses your resume to personalize cold emails. Upload .docx or .txt.</p>
          <input
            type="file"
            accept=".docx,.txt,.pdf"
            onChange={handleResumeUpload}
            className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-600 hover:file:bg-brand-100 mb-3"
          />
          {resumeStatus && (
            <p className={`text-xs font-medium mb-3 ${resumeStatus.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
              {resumeStatus}
            </p>
          )}
          {profile?.resumeText && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Current resume text:</p>
              <pre className="text-xs bg-gray-50 border border-gray-100 p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap text-gray-600 font-mono">
                {profile.resumeText.slice(0, 800)}{profile.resumeText.length > 800 ? '…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── AI Prompt ── */}
      {tab === 'prompt' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Edit your email prompt</h2>
            <div className="flex gap-2 mb-4">
              {[{ id: 'chat', label: '💬 AI Chat' }, { id: 'edit', label: '✏️ Manual Edit' }].map(pt => (
                <button
                  key={pt.id}
                  onClick={() => setPromptTab(pt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    promptTab === pt.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            {promptTab === 'chat' && (
              <div>
                <div className="max-h-64 overflow-y-auto mb-3 space-y-2">
                  {promptChat.map((msg, i) => (
                    <div key={i} className={`text-xs p-2.5 rounded-lg ${msg.role === 'user' ? 'bg-brand-50 text-brand-700' : 'bg-gray-50 text-gray-600'}`}>
                      <span className="font-semibold">{msg.role === 'user' ? 'You' : 'AI'}: </span>
                      {msg.content}
                    </div>
                  ))}
                  {promptLoading && <p className="text-xs text-gray-400 italic">Thinking…</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="e.g. make it shorter, use more formal tone, focus on fintech"
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePromptChat()}
                  />
                  <button
                    onClick={handlePromptChat}
                    disabled={promptLoading || !promptInput.trim()}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {promptTab === 'edit' && (
              <div>
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Load template</label>
                  <select
                    value={selectedTemplate?.name || ''}
                    onChange={handleTemplateSelect}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— Select Template —</option>
                    {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                {selectedTemplate && (
                  <pre className="text-xs bg-gray-50 border border-gray-100 p-3 rounded-lg mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-gray-600">
                    {selectedTemplate.content}
                  </pre>
                )}
                <textarea
                  className="w-full min-h-[160px] px-3 py-2.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                />
                <button
                  onClick={() => onUpdateProfile({ prompt: editPrompt })}
                  className="mt-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                >
                  Save prompt
                </button>
              </div>
            )}
          </div>

          {pendingPrompt && (
            <div className="bg-white border-2 border-amber-400 rounded-xl p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Preview — review before saving</h2>
              <pre className="text-xs bg-amber-50 p-3 rounded-lg max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-gray-700 mb-3">
                {pendingPrompt}
              </pre>
              <div className="flex gap-2">
                <button onClick={acceptPrompt} className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all">
                  ✓ Accept changes
                </button>
                <button onClick={() => setPendingPrompt(null)} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition-all">
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Email Account ── */}
      {tab === 'email' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Email Account</h2>
          <p className="text-xs text-gray-400 mb-4">Choose your email provider and connect your account.</p>

          {/* .edu insight */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 mb-4">
            <p className="text-xs font-semibold text-blue-700 mb-0.5">🎓 Have a university .edu email? Use Outlook.</p>
            <p className="text-xs text-blue-500 leading-relaxed">A .edu address gives you instant credibility — prospects open emails from students at a significantly higher rate. Connect your university Outlook below.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { id: 'outlook', label: 'Outlook', desc: 'University .edu · Microsoft 365', icon: '📬', recommended: true },
              { id: 'gmail',   label: 'Gmail',   desc: 'Google Workspace · Gmail',        icon: '📧', recommended: false },
            ].map(opt => {
              const isActive    = emailProvider === opt.id
              const isConnected = opt.id === 'gmail' ? profile?.hasGmailToken : profile?.hasOutlookToken
              return (
                <button
                  key={opt.id}
                  onClick={() => setEmailProvider(opt.id)}
                  className={`p-4 rounded-xl border-2 text-center transition-all relative ${
                    isActive ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {opt.recommended && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">Recommended</span>
                  )}
                  <div className="text-2xl mb-2 mt-1">{opt.icon}</div>
                  <div className="font-bold text-sm text-gray-900">{opt.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  {isConnected && (
                    <div className="flex items-center justify-center gap-1 mt-1.5 text-[10px] text-green-600 font-semibold">
                      <CheckCircle size={10} /> Connected
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={async () => {
              if (emailProvider === 'gmail') {
                await handleConnectGmail()
              } else {
                setGmailLoading(true)
                window.open(`/api/auth-start?userId=${currentUser.userId}`, '_blank')
                for (let i = 0; i < 30; i++) {
                  await new Promise(r => setTimeout(r, 2000))
                  try {
                    const data = await fetch(`${API_URL}/api/token-health`).then(r => r.json())
                    if (data.ok) { setGmailStatus(data); break }
                  } catch {}
                }
                try {
                  const r = await fetch(`${API_URL}/api/user/profile`, { headers: { 'x-user-id': currentUser.userId } })
                  if (r.ok) setProfile(await r.json())
                } catch {}
                setGmailLoading(false)
              }
            }}
            disabled={gmailLoading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
          >
            {gmailLoading ? 'Opening sign-in…' : `Connect ${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'}`}
          </button>

          {(profile?.hasGmailToken || profile?.hasOutlookToken) && (
            <div className="mt-3 space-y-1">
              {profile?.hasGmailToken   && (
                <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle size={12} /> Gmail connected · {gmailStatus?.minutesLeft || '?'}m left
                </p>
              )}
              {profile?.hasOutlookToken && (
                <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle size={12} /> Outlook connected
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Daily Discovery ── */}
      {tab === 'discovery' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-1">Automated daily discovery</h2>
            <p className="text-xs text-gray-400 mb-4">After you upload companies, the system will automatically find decision-makers each day.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Run discovery at (HH:MM)</label>
                <input
                  type="time"
                  value={discoveryTime}
                  onChange={e => setDiscoveryTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">Time when discovery task runs daily (your local timezone)</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Find up to N people per day</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={discoveryQuota}
                  onChange={e => setDiscoveryQuota(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">Recommended: 30–100. Higher = more API costs.</p>
              </div>

              <button
                onClick={async () => {
                  setDiscoverySaving(true)
                  try {
                    const res = await fetch(`${API_URL}/api/discovery/config`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
                      body: JSON.stringify({ runTime: discoveryTime, dailyQuota: discoveryQuota, enabled: true }),
                    })
                    setDiscoveryStatus({ success: res.ok, message: res.ok ? 'Discovery configured! Will run daily.' : 'Failed to save configuration.' })
                    if (res.ok) setTimeout(() => setDiscoveryStatus(null), 4000)
                  } catch (e) {
                    setDiscoveryStatus({ success: false, message: `Error: ${e.message}` })
                  }
                  setDiscoverySaving(false)
                }}
                disabled={discoverySaving}
                className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
              >
                {discoverySaving ? 'Saving…' : '✓ Save discovery schedule'}
              </button>

              {discoveryStatus && (
                <div className={`px-4 py-3 rounded-xl text-xs text-center font-medium ${
                  discoveryStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {discoveryStatus.message}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">How it works</h2>
            <ul className="space-y-2 text-xs text-gray-500">
              {[
                'Upload a CSV of 500 companies with domains',
                'Daily at your scheduled time, AI searches for decision-makers (Directors, VPs, CTOs, etc.)',
                'New people are added to your Contact list',
                'Emails are auto-drafted using your AI prompt + company data',
                'You review & approve the batch before sending',
                'System sends ~50 emails/day on your schedule',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
