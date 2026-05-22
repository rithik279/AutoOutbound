import { AVATAR_COLORS } from '../constants.js'

export default function Avatar({ name = '?', size = 32 }) {
  const [bg, tc] = AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length]
  const ini = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: tc,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 800, flexShrink: 0,
    }}>
      {ini}
    </div>
  )
}
