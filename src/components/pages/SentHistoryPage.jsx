import { Mail, ArrowLeft, AlertCircle, Eye, MousePointer, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function SentHistoryPage({ sentHistory, setPhase, statusBar, userId }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!userId) return
    fetch('/api/track/stats', { headers: { 'x-user-id': userId } })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [userId])

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

      {/* Tracking stats banner */}
      {stats && stats.totalSent > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: <Mail size={15} />, value: stats.totalSent, label: 'Sent', color: 'text-gray-600' },
            { icon: <Eye size={15} />, value: `${stats.openRate}%`, label: `${stats.totalOpened} opened`, color: 'text-blue-600' },
            { icon: <MousePointer size={15} />, value: `${stats.clickRate}%`, label: `${stats.totalClicked} clicked`, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
              <div className="text-xl font-black text-gray-900">{s.value}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {sentHistory.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Mail size={28} className="text-brand-400" />
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-2">No emails sent yet</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">Send your first campaign and track opens, clicks, and replies here.</p>
          <button
            onClick={() => setPhase('entry')}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            <Zap size={14} /> Launch a campaign
          </button>
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
              {/* Per-email open/click badges */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {email.openCount > 0 && (
                  <div className="flex items-center gap-1 bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <Eye size={10} />
                    {email.openCount}
                  </div>
                )}
                {email.clickCount > 0 && (
                  <div className="flex items-center gap-1 bg-purple-50 text-purple-600 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <MousePointer size={10} />
                    {email.clickCount}
                  </div>
                )}
                {!email.failed && email.openCount === 0 && (
                  <div className="text-[10px] text-gray-200 uppercase tracking-wide">not opened</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
