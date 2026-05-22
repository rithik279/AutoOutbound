// Shared inline-style tokens — FirstShot brand palette.
// Updating these cascades to all inline-styled phases automatically.

const c = {
  card:       { background: '#ffffff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  h1:         { fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.4px', color: '#111827' },
  h2:         { fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#111827' },
  h3:         { fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: '#374151' },
  label:      { fontSize: 11, color: '#6b7280', marginBottom: 5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  muted:      { fontSize: 13, color: '#6b7280' },
  small:      { fontSize: 11, color: '#9ca3af' },
  row:        { display: 'flex', gap: 12 },
  primaryBtn: { background: '#6366f1', color: '#fff', padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background 0.15s' },
  ghostBtn:   { background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer' },
  successBtn: { background: '#d1fae5', color: '#065f46', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer' },
  dangerBtn:  { background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer' },
  statBox:    { background: '#f9fafb', borderRadius: 10, padding: '14px 16px', textAlign: 'center', border: '1px solid #e5e7eb' },
  statNum:    { fontSize: 22, fontWeight: 800, display: 'block', color: '#111827' },
  statLbl:    { fontSize: 10, color: '#9ca3af', display: 'block', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' },
  progress:   { height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', margin: '8px 0' },
  sidebar:    { width: 270, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', maxHeight: 540, overflowY: 'auto' },

  bar:      pct => ({ height: '100%', background: '#6366f1', borderRadius: 99, width: `${pct}%`, transition: 'width 0.3s ease' }),
  tag:      s   => ({
    fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600, display: 'inline-block',
    background: s === 'edited' ? '#dbeafe' : s === 'fallback' ? '#fef3c7' : s === 'csv' ? '#ede9fe' : s === 'apollo' ? '#d1fae5' : '#f0fdf4',
    color:      s === 'edited' ? '#1d4ed8' : s === 'fallback' ? '#92400e' : s === 'csv' ? '#6d28d9' : s === 'apollo' ? '#065f46' : '#065f46',
  }),
  pill:     (bg) => ({ background: bg + '18', color: bg, fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, display: 'inline-block' }),
  sideItem: active => ({ padding: '9px 13px', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center', background: active ? '#eef2ff' : 'transparent', borderLeft: active ? '2px solid #6366f1' : '2px solid transparent', color: active ? '#4f46e5' : '#374151' }),
}

export default c
