import c from '../../styles.js'

/**
 * Full sent email history — sorted newest first, shows failures inline.
 */
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>Sent emails</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>{sentHistory.length} email{sentHistory.length !== 1 ? 's' : ''} sent</p>
        </div>
        <button onClick={() => setPhase('entry')} style={c.ghostBtn}>← Back</button>
      </div>

      {sentHistory.length === 0 ? (
        <div style={{ ...c.card, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h2 style={c.h2}>No emails sent yet</h2>
          <p style={c.muted}>Schedule a campaign to see your sent emails here.</p>
        </div>
      ) : (
        <div style={c.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sortedEmails.map((email, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: i < sentHistory.length - 1 ? '1px solid #f0f0ec' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: email.failed ? '#dc2626' : '#16a34a', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{email.to}</span>
                    {email.company && <span style={{ ...c.muted, fontSize: 12 }}>· {email.company}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
                  {email.sentAt && <div style={{ fontSize: 11, color: '#999' }}>{new Date(email.sentAt).toLocaleString()}</div>}
                  {email.failed && email.error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Failed: {email.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
