/**
 * server/routes/auth.js
 *
 * OAuth 2.0 authorization flows for Outlook (Microsoft Graph) and Gmail (Google).
 * Uses PKCE. Tokens are stored in the User record in PostgreSQL — no file I/O.
 *
 * Routes:
 *   GET  /api/auth-start           — Start Outlook OAuth
 *   GET  /api/auth-callback        — Outlook OAuth callback (production)
 *   GET  /api/token-health         — Outlook token status for a user
 *   GET  /api/gmail/auth-start     — Start Gmail OAuth
 *   GET  /api/gmail/auth-callback  — Gmail OAuth callback (production)
 *   GET  /api/gmail/token-health   — Gmail token status for a user
 */

import { Router }        from 'express'
import crypto            from 'crypto'
import fetch             from 'node-fetch'
import { oauthVerifiers }        from '../lib/oauth-state.js'
import { getOutlookTokenHealth, saveOutlookTokens } from '../lib/tokens.js'
import { getGmailTokenHealth, saveGmailTokens }     from '../lib/gmail.js'
import { OUTLOOK, GMAIL }        from '../lib/config.js'
import { requireAuth }           from '../lib/middleware.js'

const router = Router()

function buildOAuthSuccessPage(provider, userId = '') {
  const payload = JSON.stringify({ type: 'oauth-complete', provider, userId })
  return `<!doctype html>
<html>
  <body style="font-family:sans-serif;padding:40px">
    <h2>${provider === 'gmail' ? 'Gmail' : 'Outlook'} Authorized!</h2>
    <p>You can close this tab and return to the app.</p>
    <script>
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(${payload}, window.location.origin)
          }
        } catch (e) {}
        setTimeout(function () {
          try { window.close() } catch (e) {}
        }, 250)
      })()
    </script>
  </body>
</html>`
}

// ── Outlook / Microsoft Graph ─────────────────────────────────────────────────

// Auth required: the OAuth state is bound to the *verified* user, so nobody
// can start a flow that plants mailbox tokens on someone else's account.
// Returns JSON { url } — the client opens it in a new tab.
router.get('/auth-start', requireAuth, async (req, res) => {
  const userId       = req.userId
  const clientId     = OUTLOOK.clientId
  const clientSecret = OUTLOOK.clientSecret
  const port         = 3333
  const isProd       = process.env.NODE_ENV === 'production'
  const callbackHost = isProd
    ? (process.env.OAUTH_REDIRECT_HOST || `https://${req.get('host')}`)
    : `http://localhost:${port}`
  const redirect = `${callbackHost}/api/auth-callback`

  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = crypto.randomBytes(8).toString('hex')

  oauthVerifiers.set(state, { verifier, clientId, clientSecret, redirect, userId })

  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          redirect,
    scope:                 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite offline_access openid profile',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    response_mode:         'query',
    state,
  })}`

  if (isProd) {
    res.json({ url: authUrl })
  } else {
    const { createServer } = await import('http')
    const server = createServer((req, res) => {
      const url  = new URL(req.url, `http://localhost:${port}`)
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorized.</h2><p>You can close this tab.</p></body></html>')
      server.close()
      if (code) {
        fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({ client_id: clientId, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
        })
          .then(r => r.json())
          .then(async data => {
            if (data.access_token && userId) {
              await saveOutlookTokens(userId, {
                clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
                expiresAt: Date.now() + data.expires_in * 1000,
              })
              console.log(`[auth] Outlook authorized for ${userId} (dev)`)
            }
          })
          .catch(e => console.error('[auth] Dev Outlook token exchange failed:', e.message))
      }
    })
    server.on('error', e => console.error(`[auth] Dev callback server error: ${e.message}`))
    server.listen(port, () => console.log(`[auth] Dev callback server listening on :${port}`))
    res.json({ url: authUrl })
  }
})

router.get('/auth-callback', async (req, res) => {
  const { code, state } = req.query
  res.writeHead(200, { 'Content-Type': 'text/html' })

  if (!code || !state) {
    return res.end('<html><body><h2>Auth failed: missing code or state.</h2></body></html>')
  }

  const stored = oauthVerifiers.get(state)
  if (!stored) {
    return res.end('<html><body><h2>Auth failed: expired or invalid state.</h2><p>Close and try again.</p></body></html>')
  }

  oauthVerifiers.delete(state)
  const { verifier, clientId, clientSecret, redirect, userId } = stored

  // Exchange the code BEFORE rendering the result page — showing "Authorized"
  // while the exchange silently fails leaves the user thinking they're
  // connected when no tokens were ever saved.
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    })
    const data = await tokenRes.json()
    if (data.access_token && userId) {
      await saveOutlookTokens(userId, {
        clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      })
      console.log(`[auth] Outlook authorized for ${userId} (production)`)
      return res.end(buildOAuthSuccessPage('outlook', userId))
    }
    console.error('[auth] Outlook token exchange failed:', data)
    res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorization failed.</h2><p>Microsoft did not accept the sign-in. Close this tab and try connecting again.</p></body></html>')
  } catch (e) {
    console.error('[auth] Outlook callback error:', e.message)
    res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorization failed.</h2><p>Something went wrong finishing the sign-in. Close this tab and try again.</p></body></html>')
  }
})

router.get('/token-health', requireAuth, async (req, res) => {
  const h = await getOutlookTokenHealth(req.userId)
  res.json({ ok: h.status === 'ok' || h.status === 'warning', ...h })
})

// ── Gmail / Google OAuth ──────────────────────────────────────────────────────

// Auth required — see /auth-start above. Returns JSON { url }.
router.get('/gmail/auth-start', requireAuth, async (req, res) => {
  const clientId = GMAIL.clientId
  const redirect = GMAIL.redirectUri

  if (!clientId) {
    return res.status(503).json({ error: 'Gmail OAuth not configured — set GMAIL_CLIENT_ID in .env' })
  }

  const userId    = req.userId
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = `${userId}:${crypto.randomBytes(8).toString('hex')}`

  oauthVerifiers.set(state, { verifier, clientId, userId, redirect })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          redirect,
    scope:                 'https://www.googleapis.com/auth/gmail.send',
    access_type:           'offline',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    prompt:                'consent',
    state,
  })}`

  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    res.json({ url: authUrl })
  } else {
    const port = 3334
    const { createServer } = await import('http')
    const server = createServer((req, res) => {
      const url  = new URL(req.url, `http://localhost:${port}`)
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorized!</h2><p>You can close this tab.</p></body></html>')
      server.close()
      if (code) {
        fetch('https://oauth2.googleapis.com/token', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({ client_id: clientId, client_secret: GMAIL.clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
        })
          .then(r => r.json())
          .then(async data => {
            if (data.access_token) {
              await saveGmailTokens(userId, {
                clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
                expiresAt: Date.now() + data.expires_in * 1000,
              })
              console.log(`[auth] Gmail authorized for ${userId} (dev)`)
            }
          })
          .catch(e => console.error('[auth] Gmail dev token exchange failed:', e.message))
      }
    })
    server.on('error', e => console.error(`[auth] Gmail dev callback server error: ${e.message}`))
    server.listen(port, () => console.log(`[auth] Gmail dev callback server listening on :${port}`))
    res.json({ url: authUrl })
  }
})

router.get('/gmail/auth-callback', async (req, res) => {
  const { code, state } = req.query
  res.writeHead(200, { 'Content-Type': 'text/html' })

  if (!code || !state) {
    return res.end('<html><body><h2>Gmail auth failed: missing code or state.</h2></body></html>')
  }

  const stored = oauthVerifiers.get(state)
  if (!stored) {
    return res.end('<html><body><h2>Gmail auth failed: expired or invalid state.</h2><p>Close and try again.</p></body></html>')
  }

  oauthVerifiers.delete(state)
  const { verifier, clientId, userId, redirect } = stored

  // Exchange first, then report honestly — see the Outlook callback above.
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: GMAIL.clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    })
    const data = await tokenRes.json()
    if (data.access_token) {
      await saveGmailTokens(userId, {
        clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      })
      console.log(`[auth] Gmail authorized for ${userId} (production)`)
      return res.end(buildOAuthSuccessPage('gmail', userId))
    }
    console.error('[auth] Gmail token exchange failed:', data)
    res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorization failed.</h2><p>Google did not accept the sign-in. Close this tab and try connecting again.</p></body></html>')
  } catch (e) {
    console.error('[auth] Gmail callback error:', e.message)
    res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorization failed.</h2><p>Something went wrong finishing the sign-in. Close this tab and try again.</p></body></html>')
  }
})

router.get('/gmail/token-health', requireAuth, async (req, res) => {
  const h = await getGmailTokenHealth(req.userId)
  res.json({ ok: h.status === 'ok' || h.status === 'warning', ...h })
})

export default router
