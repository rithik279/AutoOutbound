import { useState } from 'react'
import { FileText, Upload, ArrowRight, RotateCcw, X } from 'lucide-react'

export default function EntryPage({
  entryLevel, setEntryLevel,
  scheduleStatus,
  isFriend,
  handleLogout,
  loadSavedContacts,
  loadSentHistory,
  setPhase,
  discoverPrompt,
  setDiscoverPrompt,
  hasSavedCampaign,
  onResumeCampaign,
  onDiscardCampaign,
}) {
  const sentCount = scheduleStatus?.sent || 0
  const [localPrompt, setLocalPrompt] = useState(discoverPrompt || '')

  function handlePromptGo() {
    if (!localPrompt.trim()) return
    setDiscoverPrompt(localPrompt)
    setEntryLevel('scratch')
    setPhase('discover')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handlePromptGo()
    }
  }

  return (
    <div>
      {/* Resume banner */}
      {hasSavedCampaign && (
        <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 mb-6">
          <RotateCcw size={15} className="text-brand-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-brand-700">You have an unfinished campaign</span>
            <span className="text-xs text-brand-500 ml-2">Pick up where you left off</span>
          </div>
          <button
            onClick={onResumeCampaign}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
          >
            Continue <ArrowRight size={12} />
          </button>
          <button
            onClick={onDiscardCampaign}
            className="text-brand-300 hover:text-brand-500 transition-colors flex-shrink-0"
            title="Discard draft"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">New Campaign</h1>
        <p className="text-sm text-gray-400 mt-1">Who do you want to reach?</p>
      </div>

      {/* Primary: prompt textarea */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 hover:border-brand-200 focus-within:border-brand-400 transition-colors duration-150 mb-4 shadow-sm">
        <textarea
          className="w-full px-5 pt-5 pb-3 text-sm text-gray-800 placeholder-gray-300 bg-transparent resize-none outline-none leading-relaxed"
          rows={4}
          placeholder={`Describe who you want to reach, e.g.\n"VP of Engineering at Series A AI startups in NYC"\n"Head of Data at US asset managers with 500–5000 employees"`}
          value={localPrompt}
          onChange={e => setLocalPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-between px-4 pb-4">
          <span className="text-xs text-gray-300">⌘ + Enter to search</span>
          <button
            onClick={handlePromptGo}
            disabled={!localPrompt.trim()}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            Find contacts <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Secondary: alternative modes */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-300 flex-shrink-0">or start from</span>
        <button
          onClick={() => { setEntryLevel('companies'); setPhase('settings') }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 bg-white hover:border-violet-200 hover:bg-violet-50 text-xs font-medium text-gray-500 hover:text-violet-600 transition-all duration-150"
        >
          <FileText size={13} className="text-violet-400" />
          Company list
        </button>
        <button
          onClick={() => { setEntryLevel('bulk_import'); setPhase('settings') }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 bg-white hover:border-amber-200 hover:bg-amber-50 text-xs font-medium text-gray-500 hover:text-amber-600 transition-all duration-150"
        >
          <Upload size={13} className="text-amber-400" />
          Bulk CSV
        </button>
      </div>
    </div>
  )
}
