/**
 * OnboardingWizard — shown once to new users before they reach the app.
 * Collects name + email, connects Gmail/Outlook, then launches.
 *
 * Shown when: profile exists but senderEmail is blank (brand-new Clerk user).
 * Skipped when: localStorage has 'onboardingDone' = '1'.
 */
import { useState } from 'react'
import { Zap, Mail, CheckCircle, ArrowRight } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

const STEPS = ['Account', 'Email', 'Done']

export default function OnboardingWizard({ currentUser, onComplete, onUpdateProfile }) {
  const [step,   setStep]   = useState(0)
  const [name,   setName]   = useState(currentUser?.name || '')
  const [email,  setEmail]  = useState(currentUser?.email || '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleAccountNext() {
    if (!name.trim() || !email.trim()) { setError('Both fields required'); return }
    setSaving(true)
    setError('')
    await onUpdateProfile({ senderName: name.trim(), senderEmail: email.trim() })
    setSaving(false)
    setStep(1)
  }

  function handleConnectGmail() {
    window.open(`${API_URL}/api/gmail/auth-start?userId=${currentUser?.userId}`, '_blank')
    // Give it a moment then advance — they can always re-connect in Settings
    setTimeout(() => setStep(2), 1500)
  }

  function handleConnectOutlook() {
    window.open(`${API_URL}/api/auth-start`, '_blank')
    setTimeout(() => setStep(2), 1500)
  }

  function handleSkipEmail() {
    setStep(2)
  }

  function handleDone() {
    localStorage.setItem('onboardingDone', '1')
    onComplete()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-md">
            <Zap size={17} className="text-white" />
          </div>
          <span className="text-xl font-black text-gray-900 tracking-tight">FirstShot</span>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`transition-all duration-300 rounded-full
              ${i === step ? 'w-6 h-2 bg-brand-500' : i < step ? 'w-2 h-2 bg-brand-300' : 'w-2 h-2 bg-gray-200'}
            `} />
          ))}
        </div>

        {/* ── Step 0: Account ── */}
        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h2 className="text-xl font-black text-gray-900 mb-1">Welcome to FirstShot</h2>
            <p className="text-sm text-gray-400 mb-6">What should we put in your email sign-off?</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAccountNext()}
                  placeholder="Rithik Singh"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm font-medium transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Your email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAccountNext()}
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm font-medium transition-all"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

            <button
              onClick={handleAccountNext}
              disabled={saving || !name.trim() || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold py-3.5 rounded-xl text-sm transition-all"
            >
              {saving ? 'Saving…' : <>Continue <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {/* ── Step 1: Email provider ── */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <h2 className="text-xl font-black text-gray-900 mb-1">Connect your email</h2>
            <p className="text-sm text-gray-400 mb-6">FirstShot sends from your own account — not a shared domain.</p>

            <div className="space-y-3 mb-6">
              <button
                onClick={handleConnectGmail}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Mail size={18} className="text-red-500" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-gray-800">Connect Gmail</div>
                  <div className="text-xs text-gray-400">Google Workspace or personal Gmail</div>
                </div>
                <ArrowRight size={14} className="ml-auto text-gray-300 group-hover:text-brand-400 transition-colors" />
              </button>

              <button
                onClick={handleConnectOutlook}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail size={18} className="text-blue-500" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-gray-800">Connect Outlook</div>
                  <div className="text-xs text-gray-400">Microsoft 365 or Outlook.com</div>
                </div>
                <ArrowRight size={14} className="ml-auto text-gray-300 group-hover:text-blue-400 transition-colors" />
              </button>
            </div>

            <button onClick={handleSkipEmail} className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
              Skip for now — I'll connect later
            </button>
          </div>
        )}

        {/* ── Step 2: Done ── */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-brand-500" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">You're all set{name ? `, ${name.split(' ')[0]}` : ''}!</h2>
            <p className="text-sm text-gray-400 mb-8">Time to find your first prospects and send your first campaign.</p>
            <button
              onClick={handleDone}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3.5 rounded-xl text-sm transition-all"
            >
              Start my first campaign <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
