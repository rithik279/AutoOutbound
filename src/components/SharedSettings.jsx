import { useState, useEffect } from 'react'
import c from '../styles.js'
import { MODELS, CAMPAIGN_MODES } from '../constants.js'

const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * Settings panel shown inside the main app (not the first-run wizard).
 *
 * Props:
 *   profile            — full profile object from server
 *   localSenderName    — controlled input state (lifted to App)
 *   setLocalSenderName
 *   localSenderEmail
 *   setLocalSenderEmail
 *   onUpdateProfile    — async fn({ field: value }) → saves and reloads profile
 *   setCampaignModeFn  — saves campaign mode to server + updates local state
 *   setModelIdFn       — saves model id to server + updates local state
 *   campaignMode       — current mode string
 *   modelId            — current model id string
 *   currentUser        — { userId, name, email }
 *   emailProvider      — 'gmail' | 'outlook'
 *   setEmailProvider   — updates provider in App state
 *   setProfile         — allows this component to push a refreshed profile up
 */
export default function SharedSettings({
  profile, localSenderName, setLocalSenderName, localSenderEmail, setLocalSenderEmail,
  onUpdateProfile, setCampaignModeFn, setModelIdFn, campaignMode, modelId,
  currentUser, emailProvider, setEmailProvider, setProfile,
}) {
  const [tab, setTab] = useState('profile') // profile | resume | prompt | email | discovery

  // Resume tab
  const [resumeStatus, setResumeStatus] = useState('')

  // Prompt tab
  const [promptTab, setPromptTab]         = useState('chat') // chat | edit
  const [promptChat, setPromptChat]       = useState([])
  const [promptInput, setPromptInput]     = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [editPrompt, setEditPrompt]       = useState('')
  const [pendingPrompt, setPendingPrompt] = useState(null)
  const [templates, setTemplates]         = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  // Email tab
  const [gmailStatus, setGmailStatus]   = useState(null)
  const [gmailLoading, setGmailLoading] = useState(false)

  // Discovery tab
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
    { id: 'profile',   label: 'Profile',         icon: '👤' },
    { id: 'resume',    label: 'Resume',           icon: '📄' },
    { id: 'prompt',    label: 'AI Prompt',        icon: '✏️' },
    { id: 'email',     label: 'Email Account',    icon: '📧' },
    { id: 'discovery', label: 'Daily Discovery',  icon: '🔄' },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
            cursor: 'pointer',
            background: tab === t.id ? '#111' : '#fff',
            color:      tab === t.id ? '#fff' : '#555',
            border:     tab === t.id ? 'none' : '1px solid #ddd',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Profile ── */}
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
                    background: sel ? mode.color + '0a' : '#fafaf8',
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
                    background: sel ? m.color + '0a' : '#fafaf8',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{m.label}</div>
                    <div style={{ ...c.pill(m.color), marginBottom: 8 }}>{m.note}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>Est. 26 emails: {m.cost}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Resume ── */}
      {tab === 'resume' && (
        <div style={c.card}>
          <h2 style={c.h2}>Upload your resume</h2>
          <p style={c.muted}>The resume text is used by AI to personalize cold emails. Upload a .docx or .txt file.</p>
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <input type="file" accept=".docx,.txt,.pdf" onChange={handleResumeUpload} />
          </div>
          {resumeStatus && (
            <p style={{ fontSize: 13, color: resumeStatus.includes('Failed') ? '#dc2626' : '#16a34a', marginBottom: 12 }}>
              {resumeStatus}
            </p>
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

      {/* ── AI Prompt ── */}
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
                <div style={{ marginBottom: 14 }}>
                  <label style={c.label}>Load template</label>
                  <select
                    value={selectedTemplate?.name || ''}
                    onChange={handleTemplateSelect}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}
                  >
                    <option value="">— Select Template —</option>
                    {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>

                {selectedTemplate && (
                  <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 14, maxHeight: 200, overflowY: 'auto', background: '#f9f9f7', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    {selectedTemplate.content}
                  </div>
                )}

                <textarea
                  style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                />
                <button onClick={() => onUpdateProfile({ prompt: editPrompt })} style={{ ...c.primaryBtn, marginTop: 10 }}>
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

      {/* ── Email Account ── */}
      {tab === 'email' && (
        <div style={c.card}>
          <h2 style={c.h2}>Email Account</h2>
          <p style={c.muted}>Choose your email provider and connect your account.</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { id: 'gmail',   label: 'Gmail',   icon: '📧' },
              { id: 'outlook', label: 'Outlook', icon: '📬' },
            ].map(opt => {
              const isActive    = emailProvider === opt.id
              const isConnected = opt.id === 'gmail' ? profile?.hasGmailToken : profile?.hasOutlookToken
              return (
                <div key={opt.id} onClick={() => setEmailProvider(opt.id)} style={{
                  flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: isActive ? '#11111110' : '#f7f7f5',
                  border:     isActive ? '2px solid #111' : '2px solid #e5e5e0',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  {isConnected && <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>Connected</div>}
                </div>
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
            style={{ ...c.primaryBtn, marginTop: 4 }}
          >
            {gmailLoading ? 'Opening sign-in…' : `Connect ${emailProvider === 'gmail' ? 'Gmail' : 'Outlook'}`}
          </button>

          {(profile?.hasGmailToken || profile?.hasOutlookToken) && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {profile?.hasGmailToken   && <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>✓ Gmail connected · {gmailStatus?.minutesLeft || '?'}m left</p>}
              {profile?.hasOutlookToken && <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>✓ Outlook connected</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Daily Discovery ── */}
      {tab === 'discovery' && (
        <div>
          <div style={{ ...c.card, marginBottom: 14 }}>
            <h2 style={c.h2}>Automated daily discovery</h2>
            <p style={{ ...c.muted, marginBottom: 16 }}>After you upload companies, the system will automatically find decision-makers each day.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={c.label}>Run discovery at (HH:MM)</label>
                <input type="time" value={discoveryTime} onChange={e => setDiscoveryTime(e.target.value)} style={{ width: '100%' }} />
                <p style={{ ...c.small, marginTop: 6 }}>Time when discovery task runs daily (your local timezone)</p>
              </div>

              <div>
                <label style={c.label}>Find up to N people per day</label>
                <input
                  type="number" min="1" max="500"
                  value={discoveryQuota}
                  onChange={e => setDiscoveryQuota(Math.max(1, Number(e.target.value)))}
                  style={{ width: '100%' }}
                />
                <p style={{ ...c.small, marginTop: 6 }}>Recommended: 30–100. Higher = more API costs.</p>
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
                style={c.primaryBtn}
              >
                {discoverySaving ? 'Saving…' : '✓ Save discovery schedule'}
              </button>

              {discoveryStatus && (
                <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, textAlign: 'center', background: discoveryStatus.success ? '#d1fae5' : '#fee2e2', color: discoveryStatus.success ? '#065f46' : '#991b1b' }}>
                  {discoveryStatus.message}
                </div>
              )}
            </div>
          </div>

          <div style={c.card}>
            <h2 style={c.h2}>How it works</h2>
            <ul style={{ margin: '0 0 0 20px', fontSize: 13, color: '#666', lineHeight: 1.8 }}>
              <li>You upload a CSV of 500 companies with domains</li>
              <li>Daily at your scheduled time, the system searches Apollo for decision-makers (Directors, VPs, CTOs, etc.)</li>
              <li>New people are added to your Contact list</li>
              <li>Emails are auto-drafted using your AI prompt + company data</li>
              <li>You review &amp; approve the batch before sending</li>
              <li>System sends ~50 emails/day on your schedule</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
