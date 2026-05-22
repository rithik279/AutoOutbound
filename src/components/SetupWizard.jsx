import { useState } from 'react'
import c from '../styles.js'
import { MODELS, CAMPAIGN_MODES } from '../constants.js'
import { Zap, CheckCircle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function SetupWizard({ currentUser, onComplete }) {
  const [step, setStep]             = useState(1)
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
    const authUrl   = provider === 'gmail' ? `/api/gmail/auth-start?userId=${currentUser.userId}` : '/api/auth-start'
    const healthUrl = provider === 'gmail' ? '/api/gmail/token-health' : '/api/token-health'
    const headers   = provider === 'gmail' ? { 'x-user-id': currentUser.userId } : {}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-widest">FirstShot</span>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1.5 mb-5">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-all ${i + 1 <= step ? 'bg-brand-500' : 'bg-gray-200'}`} />
                {i < STEPS.length - 1 && <div className={`h-px w-6 transition-all ${i + 1 < step ? 'bg-brand-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
            <span className="ml-2 text-[11px] text-gray-400">Step {Math.min(step, 3)} of 3</span>
          </div>

          <h2 className="text-xl font-black text-gray-900">
            {step === 1 ? `Welcome${currentUser?.name ? `, ${currentUser.name}` : ''}!` :
             step === 2 ? 'Choose your email provider' :
             step === 3 ? 'Connect your account' :
             "You're all set!"}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {step === 1 ? "Let's get your account set up — this only takes a minute." :
             step === 2 ? 'Which email provider will you use to send emails?' :
             step === 3 ? `We'll open a secure sign-in page. Come back after authorizing.` :
             'Your account is configured and ready to go.'}
          </p>
        </div>

        <div className="px-8 py-6">
          {/* Step 1 — Profile */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your name</label>
                <input
                  value={localName}
                  onChange={e => setLocalName(e.target.value)}
                  placeholder="e.g. James O'Brien"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your email address</label>
                <input
                  type="email"
                  value={localEmail}
                  onChange={e => setLocalEmail(e.target.value)}
                  placeholder="e.g. james@company.com"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Campaign type</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CAMPAIGN_MODES).map(([id, mode]) => (
                    <button
                      key={id}
                      onClick={() => setCampaignMode(id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        campaignMode === id
                          ? 'bg-brand-50 text-brand-600 border-brand-300'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">AI model</label>
                <div className="flex flex-wrap gap-2">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setModelId(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        modelId === m.id
                          ? 'bg-brand-50 text-brand-600 border-brand-300'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={!localName.trim() || !localEmail.trim()}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Provider */}
          {step === 2 && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { id: 'gmail',   label: 'Gmail',   desc: 'Use your Google account',    icon: '📧' },
                  { id: 'outlook', label: 'Outlook', desc: 'Use your Microsoft account', icon: '📬' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setProvider(opt.id)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      provider === opt.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="text-3xl mb-2">{opt.icon}</div>
                    <div className="font-bold text-sm text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition-all">
                  ← Back
                </button>
                <button
                  onClick={async () => { await saveProfileAndProvider(); setStep(3) }}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Authorize */}
          {step === 3 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">{provider === 'gmail' ? '📧' : '📬'}</div>
              {!authDone ? (
                <>
                  <button
                    onClick={handleConnect}
                    disabled={authLoading}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all w-full mb-3"
                  >
                    {authLoading ? 'Waiting for authorization…' : `Connect ${provider === 'gmail' ? 'Gmail' : 'Outlook'}`}
                  </button>
                  {authLoading && <p className="text-xs text-gray-400">Check the popup window</p>}
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-sm mb-4">
                    <CheckCircle size={18} /> Authorized!
                  </div>
                  <button onClick={() => setStep(4)} className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all">
                    Continue →
                  </button>
                </div>
              )}
              <button onClick={() => setStep(2)} className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                ← Choose different provider
              </button>
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🎉</div>
              <button
                onClick={handleFinish}
                className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all w-full"
              >
                Start sending emails →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
