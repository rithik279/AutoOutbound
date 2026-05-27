import { Users, RefreshCw, ArrowLeft, ArrowRight, Zap } from 'lucide-react'

const STATE_STYLES = {
  replied:  { bg: 'bg-green-100',  text: 'text-green-700' },
  emailed:  { bg: 'bg-brand-100',  text: 'text-brand-700' },
  default:  { bg: 'bg-gray-100',   text: 'text-gray-500' },
}

export default function MyContactsPage({ savedContacts, loadingContacts, loadSavedContacts, setPhase, statusBar }) {
  return (
    <div>
      {statusBar()}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">My Contacts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {savedContacts.length} contact{savedContacts.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSavedContacts}
            disabled={loadingContacts}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loadingContacts ? 'animate-spin' : ''} />
            {loadingContacts ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => setPhase('entry')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft size={13} /> Back
          </button>
        </div>
      </div>

      {loadingContacts ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-sm text-gray-400">
          Loading contacts…
        </div>
      ) : savedContacts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Users size={28} className="text-brand-400" />
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-2">No contacts yet</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">Run your first campaign and contacts will appear here automatically.</p>
          <button
            onClick={() => setPhase('entry')}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            <Zap size={14} /> Start your first campaign
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {savedContacts.map((contact, i) => {
            const s = STATE_STYLES[contact.state] || STATE_STYLES.default
            return (
              <div
                key={contact.id}
                className={`flex items-center justify-between px-5 py-4 ${i < savedContacts.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {(contact.name || contact.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{contact.name}</div>
                    <div className="text-xs text-gray-400">{contact.email}</div>
                    {(contact.title || contact.company) && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {contact.title && `${contact.title}`}{contact.title && contact.company && ' · '}{contact.company}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
                  {contact.state}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
