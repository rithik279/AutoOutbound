import { Mail, ArrowLeft, AlertCircle } from 'lucide-react'

export default function SentHistoryPage({ sentHistory, setPhase, statusBar }) {
  const sortedEmails = [...sentHistory].sort((a, b) => {
    if (a.sentAt && b.sentAt) return new Date(b.sentAt) - new Date(a.sentAt)
    if (a.sentAt) return -1
    if (b.sentAt) return 1
    return 0
  })

  return (
    <div>
      {statusBar()}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Sent Emails</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {sentHistory.length} email{sentHistory.length !== 1 ? 's' : ''} sent
          </p>
        </div>
        <button
          onClick={() => setPhase('entry')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
        >
          <ArrowLeft size={13} /> Back
        </button>
      </div>

      {sentHistory.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail size={24} className="text-gray-400" />
          </div>
          <h2 className="font-bold text-gray-900 mb-2">No emails sent yet</h2>
          <p className="text-sm text-gray-400">Schedule a campaign to see your sent emails here.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {sortedEmails.map((email, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 px-5 py-4 ${i < sortedEmails.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${email.failed ? 'bg-red-400' : 'bg-green-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900 truncate">{email.to}</span>
                  {email.company && <span className="text-xs text-gray-400 flex-shrink-0">· {email.company}</span>}
                </div>
                <div className="text-xs text-gray-400 truncate mb-0.5">{email.subject}</div>
                {email.sentAt && (
                  <div className="text-[11px] text-gray-300">{new Date(email.sentAt).toLocaleString()}</div>
                )}
                {email.failed && email.error && (
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-red-500">
                    <AlertCircle size={10} />
                    {email.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
