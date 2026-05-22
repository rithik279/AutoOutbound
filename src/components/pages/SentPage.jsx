import { CheckCircle, ArrowLeft, Mail, Clock, Timer } from 'lucide-react'

export default function SentPage({ sentCount, selectedProvider, sendDate, sendTime, gap, setPhase, statusBar }) {
  return (
    <div>
      {statusBar()}
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">
          {sentCount} email{sentCount !== 1 ? 's' : ''} scheduled
        </h1>
        <p className="text-sm text-gray-400 mb-10 leading-relaxed">
          Sending via {selectedProvider === 'gmail' ? 'Gmail' : 'Outlook'} starting{' '}
          <span className="text-gray-600 font-medium">{sendDate} at {sendTime}</span>,
          every {gap} min. The server handles delivery — you can close this tab.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { icon: <Mail size={16} />, n: sentCount, l: 'Scheduled' },
            { icon: <Clock size={16} />, n: sendTime, l: 'First send' },
            { icon: <Timer size={16} />, n: `${gap}m`, l: 'Gap' },
          ].map(s => (
            <div key={s.l} className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
              <div className="text-gray-400 flex justify-center mb-2">{s.icon}</div>
              <div className="text-xl font-black text-gray-900">{s.n}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">{s.l}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPhase('entry')}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-all mx-auto"
        >
          New campaign →
        </button>
      </div>
    </div>
  )
}
