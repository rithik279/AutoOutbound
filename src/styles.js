// Shared inline-style tokens used throughout the app.
// All values are plain JS objects compatible with React's `style` prop.

const c = {
  card:       { background: '#fff', borderRadius: 12, border: '1px solid #e5e5e0', padding: '20px 24px' },
  h1:         { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' },
  h2:         { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  h3:         { fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
  label:      { fontSize: 12, color: '#666', marginBottom: 5, display: 'block', fontWeight: 500 },
  muted:      { fontSize: 13, color: '#666' },
  small:      { fontSize: 11, color: '#999' },
  row:        { display: 'flex', gap: 12 },
  primaryBtn: { background: '#111', color: '#fff', padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8 },
  ghostBtn:   { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8 },
  successBtn: { background: '#dcfce7', color: '#166534', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8 },
  dangerBtn:  { background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8 },
  statBox:    { background: '#f7f7f5', borderRadius: 10, padding: '12px 16px', textAlign: 'center', border: '1px solid #eee' },
  statNum:    { fontSize: 22, fontWeight: 800, display: 'block' },
  statLbl:    { fontSize: 10, color: '#888', display: 'block', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' },
  progress:   { height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', margin: '8px 0' },
  sidebar:    { width: 270, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #e5e5e0', overflow: 'hidden', maxHeight: 540, overflowY: 'auto' },

  // Functions that return style objects based on arguments:
  bar:     pct => ({ height: '100%', background: '#111', borderRadius: 3, width: `${pct}%`, transition: 'width 0.3s ease' }),
  tag:     s   => ({
    fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, display: 'inline-block',
    background: s === 'edited' ? '#dbeafe' : s === 'fallback' ? '#fef3c7' : s === 'csv' ? '#ede9fe' : s === 'apollo' ? '#dcfce7' : '#f0fdf4',
    color:      s === 'edited' ? '#1d4ed8' : s === 'fallback' ? '#92400e' : s === 'csv' ? '#5b21b6' : s === 'apollo' ? '#166534' : '#166534',
  }),
  pill:    (bg) => ({ background: bg + '18', color: bg, fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, display: 'inline-block' }),
  sideItem: active => ({ padding: '9px 13px', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center', background: active ? '#f5f5f3' : 'transparent', borderLeft: active ? '2px solid #111' : '2px solid transparent' }),
}

export default c
