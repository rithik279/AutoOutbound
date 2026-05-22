import c from '../../styles.js'

/**
 * Confirmation screen shown after emails are successfully scheduled.
 */
export default function SentPage({ sentCount, selectedProvider, sendDate, sendTime, gap, setPhase, statusBar }) {
  return (
    <div>
      {statusBar()}
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 style={{ ...c.h1, marginBottom: 8 }}>{sentCount} email{sentCount !== 1 ? 's' : ''} scheduled</h1>
        <p style={{ ...c.muted, marginBottom: 32 }}>
          Sending via {selectedProvider === 'gmail' ? 'Gmail' : 'Outlook'} starting {sendDate} at {sendTime}, every {gap} min.
          The server handles delivery — you can close this tab.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 400, margin: '0 auto 32px' }}>
          {[{ n: sentCount, l: 'scheduled' }, { n: sendTime, l: 'first send' }, { n: `${gap}m`, l: 'gap' }].map(s => (
            <div key={s.l} style={c.statBox}>
              <span style={c.statNum}>{s.n}</span>
              <span style={c.statLbl}>{s.l}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setPhase('entry')} style={c.primaryBtn}>New campaign</button>
      </div>
    </div>
  )
}
