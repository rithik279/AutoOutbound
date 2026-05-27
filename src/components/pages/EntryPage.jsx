import { Mail, FileText, Upload, Search } from 'lucide-react'

const ENTRY_OPTIONS = [
  {
    id: 'scratch',
    icon: <Search size={22} />,
    label: 'Discover from prompt',
    desc: 'Describe what you\'re looking for. AI finds the companies and people.',
    color: 'text-brand-500',
    activeBorder: 'border-brand-500',
    activeBg: 'bg-brand-50',
    iconBg: 'bg-brand-100',
  },
  {
    id: 'companies',
    icon: <FileText size={22} />,
    label: 'Start from company list',
    desc: 'Paste a list of companies. AI finds decision-makers at each one.',
    color: 'text-violet-500',
    activeBorder: 'border-violet-500',
    activeBg: 'bg-violet-50',
    iconBg: 'bg-violet-100',
  },
  {
    id: 'bulk_import',
    icon: <Upload size={22} />,
    label: 'Bulk import (CSV)',
    desc: 'Upload a CSV of companies — auto-discovery, draft, review, send.',
    color: 'text-amber-500',
    activeBorder: 'border-amber-500',
    activeBg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
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

  function handleSelect(id) {
    setEntryLevel(id)
    // Immediately advance — no extra Continue click needed
    setPhase('settings')
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">New Campaign</h1>
        <p className="text-sm text-gray-400 mt-1">Where are you starting from?</p>
      </div>

      {/* Entry options grid — click to advance immediately */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {ENTRY_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            className={`text-left p-6 rounded-2xl border-2 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]
              border-gray-100 bg-white hover:border-gray-200 hover:shadow-md hover:bg-gray-50`}
          >
            <div className={`w-11 h-11 rounded-xl ${opt.iconBg} ${opt.color} flex items-center justify-center mb-4`}>
              {opt.icon}
            </div>
            <div className="font-bold text-sm mb-1.5 text-gray-800">{opt.label}</div>
            <div className="text-xs text-gray-400 leading-relaxed">{opt.desc}</div>
          </button>
        ))}
      </div>

      {/* Subtle sent-emails link — no Continue button needed */}
      {sentCount > 0 && (
        <button
          onClick={() => { loadSentHistory(); setPhase('sent_history') }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Mail size={14} />
          {sentCount} sent email{sentCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
