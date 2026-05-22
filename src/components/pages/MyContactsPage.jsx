import c from '../../styles.js'

/**
 * Saved contacts list — all contacts persisted in the DB.
 */
export default function MyContactsPage({ savedContacts, loadingContacts, loadSavedContacts, setPhase, statusBar }) {
  return (
    <div>
      {statusBar()}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={c.h1}>My Contacts</h1>
          <p style={{ ...c.muted, marginTop: 4 }}>{savedContacts.length} contact{savedContacts.length !== 1 ? 's' : ''} saved</p>
        </div>
        <div>
          <button onClick={loadSavedContacts} style={{ ...c.ghostBtn, marginRight: 10 }} disabled={loadingContacts}>
            {loadingContacts ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={() => setPhase('entry')} style={c.ghostBtn}>← Back</button>
        </div>
      </div>

      {loadingContacts ? (
        <div style={{ ...c.card, textAlign: 'center', padding: '40px' }}>Loading contacts…</div>
      ) : savedContacts.length === 0 ? (
        <div style={{ ...c.card, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h2 style={c.h2}>No contacts yet</h2>
          <p style={c.muted}>Contacts are saved automatically when you send emails.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {savedContacts.map(contact => (
            <div key={contact.id} style={{ ...c.card, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{contact.name}</div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>{contact.email}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {contact.title && `${contact.title} • `}
                  {contact.company}
                </div>
              </div>
              <span style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 4,
                backgroundColor: contact.state === 'replied' ? '#d1fae5' : contact.state === 'emailed' ? '#e0e7ff' : '#f3f4f6',
                color:           contact.state === 'replied' ? '#065f46' : contact.state === 'emailed' ? '#3730a3' : '#4b5563',
              }}>
                {contact.state}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
