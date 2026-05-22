import { useState } from 'react'
import c from '../styles.js'
import { MODELS, CAMPAIGN_MODES } from '../constants.js'

const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * First-run setup wizard — shown once to new users to configure their name,
 * email provider, and OAuth authorization before they can use the app.
 *
 * Props:
 *   currentUser — { userId, name, email }
 *   onComplete  — called after the user clicks "Start drafting emails"
 */
export default function SetupWizard({ currentUser, onComplete }) {
  const [step, setStep]             = useState(1) // 1=profile, 2=provider, 3=auth, 4=done
  const [localName, setLocalName]   = useState(currentUser?.name  || '')
  const [localEmail, setLocalEmail] = useState(currentUser?.email || '')
  const [provider, setProvider]     = useState('gmail')
  const [authLoading, setAuthLoading] = useState(false)
  const [authDone, setAuthDone]       = useState(false)
  const [campaignMode, setCampaignMode] = useState('startup')
  const [modelId, setModelId]           = useState('gpt-4o-mini')

  const STEPS = ['Account', 'Email Provider', 'Authorize', 'Done']

  async function saveProfileAndProvider() {
    await fetch(`${API_URL}/api/user/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.userId },
      body: JSON.stringify({ senderName: localName, senderEmail: localEmail, emailProvider: provider, campaignMode, modelId }),
    })
  }

  async function handleConnect() {
    setAuthLoading(true)
    const authUrl    = provider === 'gmail' ? `/api/gmail/auth-start?userId=${currentUser.userId}` : '/api/auth-start'
    const healthUrl  = provider === 'gmail' ? '/api/gmail/token-health' : '/api/token-health'
    const headers    = provider === 'gmail' ? { 'x-user-id': currentUser.userId } : {}
    window.open(authUrl, '_blank')
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const data = await fetch(healthUrl, { headers }).then(r => r.json())
        if (data.ok || data.status === 'ok') { setAuthDone(true); break }
      } catch {}
    }
    setAuthLoading(false)
  }

  async function handleFinish() {
    localStorage.setItem('friendSetupCompleted', 'true')
    await saveProfileAndProvider()
    localStorage.setItem('session', JSON.stringify({ userId: currentUser.userId, name: localName, email: localEmail }))
    onComplete()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 36px', width: 480, maxWidth: '95vw' }}>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i + 1 <= step ? '#111' : '#ddd', transition: 'background 0.2s' }} />
          ))}
        </div>

        <h2 style={{ ...c.h1, marginBottom: 4 }}>Welcome{currentUser?.name ? `, ${currentUser.name}` : ''}!</h2>
        <p style={{ ...c.muted, marginBottom: 24 }}>Let's get your account set up — this only takes a minute.</p>

        {/* Step 1 — Profile */}
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
                      color:      campaignMode === id ? mode.color : '#555',
                      border:     campaignMode === id ? `1.5px solid ${mode.color}` : '1.5px solid #ddd',
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
                      color:      modelId === m.id ? m.color : '#555',
                      border:     modelId === m.id ? `1.5px solid ${m.color}` : '1.5px solid #ddd',
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

        {/* Step 2 — Email provider */}
        {step === 2 && (
          <div>
            <p style={{ ...c.muted, marginBottom: 16 }}>Which email provider will you use to send emails?</p>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { id: 'gmail',   label: 'Gmail',   desc: 'Use your Google account',    icon: '📧' },
                { id: 'outlook', label: 'Outlook', desc: 'Use your Microsoft account', icon: '📬' },
              ].map(opt => (
                <div key={opt.id} onClick={() => setProvider(opt.id)} style={{
                  flex: 1, padding: '16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  background: provider === opt.id ? '#11111110' : '#f7f7f5',
                  border:     provider === opt.id ? '2px solid #111' : '2px solid #e5e5e0',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={c.ghostBtn}>← Back</button>
              <button onClick={async () => { await saveProfileAndProvider(); setStep(3) }} style={c.primaryBtn}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Authorize */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{provider === 'gmail' ? '📧' : '📬'}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Connect your {provider === 'gmail' ? 'Gmail' : 'Outlook'} account</h3>
            <p style={{ ...c.muted, marginBottom: 24 }}>We'll open a secure sign-in page. After authorizing, come back here and we'll confirm.</p>
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
                <button onClick={() => setStep(4)} style={c.primaryBtn}>Continue →</button>
              </div>
            )}
            <br />
            <button onClick={() => setStep(2)} style={{ ...c.ghostBtn, marginTop: 12, fontSize: 12 }}>← Choose different provider</button>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>You're all set!</h3>
            <p style={{ ...c.muted, marginBottom: 24 }}>Your account is configured and ready to go.</p>
            <button onClick={handleFinish} style={c.primaryBtn}>Start drafting emails →</button>
          </div>
        )}

        {step < 4 && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>Step {step} of 3</span>
          </div>
        )}
      </div>
    </div>
  )
}
