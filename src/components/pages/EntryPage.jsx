import { Mail, FileText, Upload, Search } from 'lucide-react'

const ENTRY_OPTIONS = [
  {
    id: 'scratch',
    icon: <Search size={20} />,
    label: 'Discover from prompt',
    desc: 'Describe what you\'re looking for. AI finds the companies and people.',
    color: 'text-brand-500',
    activeBorder: 'border-brand-500',
    activeBg: 'bg-brand-50',
    dot: 'bg-brand-500',
  },
  {
    id: 'companies',
    icon: <FileText size={20} />,
    label: 'Start from company list',
    desc: 'Paste a list of companies. AI finds decision-makers at each one.',
    color: 'text-violet-500',
    activeBorder: 'border-violet-500',
    activeBg: 'bg-violet-50',
    dot: 'bg-violet-500',
  },
  {
    id: 'bulk_import',
    icon: <Upload size={20} />,
    label: 'Bulk import (CSV)',
    desc: 'Upload a CSV of companies — auto-discovery, draft, review, send.',
    color: 'text-amber-500',
    activeBorder: 'border-amber-500',
    activeBg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
]

export default function EntryPage({
  entryLevel, setEntryLevel,
  scheduleStatus,
  isFriend,
  handleLogout,
  loadSavedContacts,
  loadSentHistory,
  setPhase,
}) {
  const sentCount = scheduleStatus?.sent || 0

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">New Campaign</h1>
        <p className="text-sm text-gray-400 mt-1">Where are you starting from?</p>
      </div>

      {/* Entry options grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {ENTRY_OPTIONS.map(opt => {
          const sel = entryLevel === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setEntryLevel(opt.id)}
              className={`text-left p-5 rounded-xl border-2 transition-all duration-150 ${
                sel
                  ? `${opt.activeBorder} ${opt.activeBg}`
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl ${sel ? opt.bg : 'bg-gray-100'} ${sel ? opt.color : 'text-gray-400'} flex items-center justify-center mb-4 transition-all`}>
                {opt.icon}
              </div>
              <div className={`font-bold text-sm mb-1 ${sel ? 'text-gray-900' : 'text-gray-700'}`}>{opt.label}</div>
              <div className="text-xs text-gray-400 leading-relaxed">{opt.desc}</div>
              {sel && (
                <div className={`mt-3 w-1.5 h-1.5 rounded-full ${opt.color.replace('text-', 'bg-')}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => { loadSentHistory(); setPhase('sent_history') }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Mail size={14} />
          Sent emails
          {sentCount > 0 && (
            <span className="bg-brand-100 text-brand-600 text-xs font-semibold px-2 py-0.5 rounded-full">{sentCount}</span>
          )}
        </button>
        <button
          onClick={() => { if (entryLevel) setPhase('settings') }}
          disabled={!entryLevel}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all duration-150"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
