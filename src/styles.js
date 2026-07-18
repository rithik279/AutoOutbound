// Shared inline-style tokens — FirstShot monochrome (black & white) system.
// Updating these cascades to all inline-styled phases automatically.

const c = {
  card:       { background: '#ffffff', borderRadius: 14, border: '1px solid #e5e5e5', padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)' },
  h1:         { fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.4px', color: '#0a0a0a' },
  h2:         { fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#0a0a0a' },
  h3:         { fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: '#404040' },
  label:      { fontSize: 11, color: '#737373', marginBottom: 5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  muted:      { fontSize: 13, color: '#737373' },
  small:      { fontSize: 11, color: '#a3a3a3' },
  row:        { display: 'flex', gap: 12 },
  primaryBtn: { background: '#0a0a0a', color: '#fff', padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 9, border: '1px solid #0a0a0a', cursor: 'pointer', transition: 'opacity 0.15s, background 0.15s' },
  ghostBtn:   { background: '#fff', color: '#171717', border: '1px solid #d4d4d4', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 9, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' },
  successBtn: { background: '#0a0a0a', color: '#fff', border: '1px solid #0a0a0a', padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 9, cursor: 'pointer' },
  dangerBtn:  { background: '#fff', color: '#b91c1c', border: '1px solid #e5e5e5', padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 9, cursor: 'pointer' },
  statBox:    { background: '#fafafa', borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: '1px solid #ededed' },
  statNum:    { fontSize: 22, fontWeight: 800, display: 'block', color: '#0a0a0a', letterSpacing: '-0.5px' },
  statLbl:    { fontSize: 10, color: '#a3a3a3', display: 'block', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' },
  progress:   { height: 5, background: '#e5e5e5', borderRadius: 99, overflow: 'hidden', margin: '8px 0' },
  sidebar:    { width: 270, flexShrink: 0, background: '#fff', borderRadius: 14, border: '1px solid #e5e5e5', overflow: 'hidden', maxHeight: 540, overflowY: 'auto' },

  bar:      pct => ({ height: '100%', background: '#0a0a0a', borderRadius: 99, width: `${pct}%`, transition: 'width 0.3s ease' }),
  tag:      s   => ({
    fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600, display: 'inline-block',
    background: s === 'edited' ? '#0a0a0a' : s === 'fallback' ? '#fef3c7' : s === 'csv' ? '#f5f5f5' : s === 'apollo' ? '#171717' : '#f0fdf4',
    color:      s === 'edited' ? '#ffffff' : s === 'fallback' ? '#92400e' : s === 'csv' ? '#404040' : s === 'apollo' ? '#ffffff' : '#166534',
  }),
  pill:     (bg) => ({ background: bg + '18', color: bg, fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, display: 'inline-block' }),
  sideItem: active => ({ padding: '9px 13px', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center', background: active ? '#f5f5f5' : 'transparent', borderLeft: active ? '2px solid #0a0a0a' : '2px solid transparent', color: active ? '#0a0a0a' : '#404040', fontWeight: active ? 600 : 500 }),
}

export default c
