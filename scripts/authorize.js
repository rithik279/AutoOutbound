// Run once to authorize via Microsoft Graph device code flow:
//   node scripts/authorize.js <YOUR_CLIENT_ID>

import { writeFileSync } from 'fs'

const CLIENT_ID = process.argv[2]
if (!CLIENT_ID) {
  console.error('Usage: node scripts/authorize.js <YOUR_CLIENT_ID>')
  process.exit(1)
}

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE     = 'https://graph.microsoft.com/Mail.Send offline_access'

// Step 1 — request device code
const dcRes = await fetch(`${AUTHORITY}/devicecode`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE })
})
const dc = await dcRes.json()

if (dc.error) {
  console.error('Error getting device code:', dc.error_description || dc.error)
  process.exit(1)
}

// Step 2 — show instructions to user
console.log('\n' + dc.message + '\n')

// Step 3 — poll until user signs in
const interval = (dc.interval || 5) * 1000
let token = null

while (!token) {
  await new Promise(r => setTimeout(r, interval))
  const pollRes = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:   CLIENT_ID,
      grant_type:  'urn:ietf:params:oauth2:grant-type:device_code',
      device_code: dc.device_code
    })
  })
  const poll = await pollRes.json()

  if (poll.access_token) {
    token = poll
  } else if (poll.error === 'authorization_pending') {
    process.stdout.write('.')  // waiting
  } else if (poll.error === 'slow_down') {
    // back off
  } else {
    console.error('\nAuth failed:', poll.error_description || poll.error)
    process.exit(1)
  }
}

console.log('\n')

// Step 4 — save tokens + client ID
writeFileSync('.tokens.json', JSON.stringify({
  clientId:     CLIENT_ID,
  accessToken:  token.access_token,
  refreshToken: token.refresh_token,
  expiresAt:    Date.now() + token.expires_in * 1000
}, null, 2))

console.log('✓ Authorized — tokens saved to .tokens.json')
console.log('✓ Server is ready to send emails via Microsoft Graph\n')
