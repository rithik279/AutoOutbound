import c from '../../styles.js'
import { ENTRY_LEVELS } from '../../constants.js'

/**
 * Entry page — user picks which discovery method to use (prompt / company list / bulk import).
 * Also shows nav buttons: My Contacts, Settings, Logout, View Sent Emails.
 */
export default function EntryPage({
  entryLevel, setEntryLevel,
  scheduleStatus,
  isFriend,
  handleLogout,
  loadSavedContacts,
  loadSentHistory,
  setPhase,
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={c.h1}>Campaign pipeline</h1>
          <p style={{ ...c.muted, marginTop: 6 }}>Where are you starting from?</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { loadSavedContacts(); setPhase('my_contacts') }} style={c.ghostBtn}>👥 My Contacts</button>
          <button onClick={() => setPhase('settings')} style={c.ghostBtn}>⚙️ Settings</button>
          <button onClick={handleLogout} style={{ ...c.ghostBtn, color: '#dc2626' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {ENTRY_LEVELS.map(lvl => {
          const sel = entryLevel === lvl.id
          return (
            <div key={lvl.id} onClick={() => setEntryLevel(lvl.id)} style={{
              ...c.card, cursor: 'pointer', position: 'relative',
              border: sel ? `2px solid ${lvl.badge}` : '1px solid #e5e5e0',
              background: sel ? lvl.badge + '08' : '#fff',
            }}>
              {sel && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: lvl.badge }} />}
              <div style={{ fontSize: 24, marginBottom: 8 }}>{lvl.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{lvl.label}</div>
              <div style={c.muted}>{lvl.desc}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadSentHistory} style={{ ...c.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>📧</span>
            View sent emails {scheduleStatus?.sent ? `(${scheduleStatus.sent})` : ''}
          </button>
          {isFriend && (
            <button onClick={() => setPhase('settings')} style={c.ghostBtn}>✏️ Edit Account</button>
          )}
        </div>
        <button
          onClick={() => { if (entryLevel) setPhase('settings') }}
          disabled={!entryLevel}
          style={c.primaryBtn}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
