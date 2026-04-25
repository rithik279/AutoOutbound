// One-time Microsoft Graph authorization.
// Opens a browser for sign-in, captures the token automatically.
//
//   node scripts/authorize.js <YOUR_CLIENT_ID>

import { createServer } from 'http'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import crypto from 'crypto'

const CLIENT_ID   = process.argv[2]
const PORT        = 3333
const REDIRECT    = `http://localhost:${PORT}/callback`
const AUTHORITY   = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE       = 'https://graph.microsoft.com/Mail.Send offline_access openid profile'

if (!CLIENT_ID) {
  console.error('Usage: node scripts/authorize.js <YOUR_CLIENT_ID>')
  process.exit(1)
}

// PKCE
const verifier  = crypto.randomBytes(32).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')

const authUrl = new URL(`${AUTHORITY}/authorize`)
authUrl.searchParams.set('client_id',             CLIENT_ID)
authUrl.searchParams.set('response_type',         'code')
authUrl.searchParams.set('redirect_uri',          REDIRECT)
authUrl.searchParams.set('scope',                 SCOPE)
authUrl.searchParams.set('code_challenge',        challenge)
authUrl.searchParams.set('code_challenge_method', 'S256')
authUrl.searchParams.set('response_mode',         'query')

console.log('\nOpening browser for Microsoft sign-in...')
console.log('(If it does not open, paste this URL manually:)')
console.log(authUrl.toString() + '\n')

try { execSync(`start "" "${authUrl.toString()}"`) } catch {}

// Local server catches the redirect
const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url    = new URL(req.url, `http://localhost:${PORT}`)
    const code   = url.searchParams.get('code')
    const error  = url.searchParams.get('error')
    const errDesc = url.searchParams.get('error_description')

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorization complete.</h2><p>You can close this tab.</p></body></html>')
    server.close()

    if (error) reject(new Error(errDesc || error))
    else if (!code) reject(new Error('No code in callback'))
    else resolve(code)
  })
  server.listen(PORT, () => console.log(`Waiting for sign-in on http://localhost:${PORT}/callback ...`))
  server.on('error', reject)
})

console.log('Sign-in complete — exchanging code for tokens...')

// Exchange code for tokens
const tokenRes = await fetch(`${AUTHORITY}/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id:     CLIENT_ID,
    code,
    redirect_uri:  REDIRECT,
    grant_type:    'authorization_code',
    code_verifier: verifier
  })
})
const tokens = await tokenRes.json()

if (!tokens.access_token) {
  console.error('Token exchange failed:', tokens.error_description || tokens.error || JSON.stringify(tokens))
  process.exit(1)
}

writeFileSync('.tokens.json', JSON.stringify({
  clientId:     CLIENT_ID,
  accessToken:  tokens.access_token,
  refreshToken: tokens.refresh_token,
  expiresAt:    Date.now() + tokens.expires_in * 1000
}, null, 2))

console.log('\n✓ Authorized — tokens saved to .tokens.json')
console.log('✓ Server is ready to send emails via Microsoft Graph\n')
