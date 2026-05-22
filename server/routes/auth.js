/**
 * server/routes/auth.js
 *
 * OAuth 2.0 authorization flows for Outlook (Microsoft Graph) and Gmail (Google).
 * Both flows use PKCE (Proof Key for Code Exchange) for added security.
 *
 * PKCE flow overview:
 *   1. Server generates a random `verifier` and its SHA-256 `challenge`.
 *   2. Browser redirects to provider with the `challenge` (never the verifier).
 *   3. Provider redirects back with an authorization `code`.
 *   4. Server exchanges code + verifier for access/refresh tokens.
 *   5. verifier is deleted from memory after use (prevents replay).
 *
 * Dev vs Production:
 *   In development (NODE_ENV !== 'production'), auth-start spawns a mini
 *   HTTP server on localhost:3333 (Outlook) or localhost:3334 (Gmail) to
 *   receive the OAuth callback without needing a public URL.
 *   In production, the provider calls back to /api/auth-callback directly.
 *
 * Routes:
 *   GET  /api/auth-start           — Start Outlook OAuth
 *   GET  /api/auth-callback        — Outlook OAuth callback (production)
 *   GET  /api/token-health         — Outlook token status
 *   GET  /api/gmail/auth-start     — Start Gmail OAuth
 *   GET  /api/gmail/auth-callback  — Gmail OAuth callback (production)
 *   GET  /api/gmail/token-health   — Gmail token status
 */

import { Router }                                       from 'express'
import crypto                                           from 'crypto'
import { writeFileSync }                                from 'fs'
import fetch                                            from 'node-fetch'
import { oauthVerifiers }                               from '../lib/oauth-state.js'
import { getTokenHealth }                               from '../lib/tokens.js'
import { getGmailTokenHealth, getGmailTokensPath }      from '../lib/gmail.js'
import { loadUsers, saveUsers }                         from '../lib/users.js'
import { TOKENS_PATH, OUTLOOK, GMAIL }                  from '../lib/config.js'

const router = Router()

// ── Outlook / Microsoft Graph ─────────────────────────────────────────────────

/**
 * GET /api/auth-start
 *
 * Initiates the Outlook PKCE OAuth flow. In production, redirects the browser
 * to Microsoft's authorization page. In development, spawns a local callback
 * server on port 3333 to handle the redirect without a public URL.
 *
 * Query: ?userId=<string>
 */
router.get('/auth-start', async (req, res) => {
  const userId       = req.query.userId
  const clientId     = OUTLOOK.clientId
  const clientSecret = OUTLOOK.clientSecret
  const port         = 3333
  const isProd       = process.env.NODE_ENV === 'production'
  const callbackHost = isProd
    ? (process.env.OAUTH_REDIRECT_HOST || `https://${req.get('host')}`)
    : `http://localhost:${port}`
  const redirect = `${callbackHost}/api/auth-callback`

  // PKCE: generate verifier (random) and challenge (SHA-256 of verifier)
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state     = crypto.randomBytes(8).toString('hex')

  oauthVerifiers.set(state, { verifier, clientId, clientSecret, redirect, userId })

  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          redirect,
    scope:                 'https://graph.microsoft.com/Mail.Send offline_access openid profile',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    response_mode:         'query',
    state,
  })}`

  if (isProd) {
    // Production: Microsoft calls /api/auth-callback directly
    res.redirect(authUrl)
  } else {
    // Development: spin up a local HTTP server to catch the callback
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
          .then(data => {
            if (data.access_token) {
              writeFileSync(TOKENS_PATH, JSON.stringify({
                clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
                expiresAt: Date.now() + data.expires_in * 1000,
              }, null, 2))
              console.log('[auth] Outlook authorized successfully (dev)')
            }
          })
          .catch(e => console.error('[auth] Dev token exchange failed:', e.message))
      }
    })
    server.on('error', e => console.error(`[auth] Dev callback server error: ${e.message}`))
    server.listen(port, () => console.log(`[auth] Dev callback server listening on :${port}`))
    res.send(`<html><body><script>window.location="${authUrl}"</script><p>Opening Microsoft sign-in…</p></body></html>`)
  }
})

/**
 * GET /api/auth-callback
 *
 * Production OAuth callback — Microsoft redirects here after the user
 * authorizes. Exchanges the authorization code for tokens and writes them
 * to .tokens.json. Also marks the user's outlookTokens flag in users.json.
 *
 * Query: ?code=<string>&state=<string>
 */
router.get('/auth-callback', async (req, res) => {
  const { code, state } = req.query
  res.writeHead(200, { 'Content-Type': 'text/html' })

  if (!code || !state) {
    res.end('<html><body><h2>Auth failed: missing code or state.</h2><p>Close and try again.</p></body></html>')
    return
  }

  const stored = oauthVerifiers.get(state)
  if (!stored) {
    res.end('<html><body><h2>Auth failed: expired or invalid state.</h2><p>Close and try again.</p></body></html>')
    return
  }

  oauthVerifiers.delete(state)
  const { verifier, clientId, clientSecret, redirect, userId } = stored

  res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Authorized!</h2><p>You can close this tab and return to the app.</p></body></html>')

  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    })
    const data = await tokenRes.json()
    if (data.access_token) {
      writeFileSync(TOKENS_PATH, JSON.stringify({
        clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }, null, 2))

      // Mark user as having Outlook tokens (used by the frontend to show "Connected")
      if (userId) {
        const users = loadUsers()
        if (users[userId]) {
          users[userId].outlookTokens = true
          saveUsers(users)
        }
      }
      console.log('[auth] Outlook authorized successfully (production)')
    } else {
      console.error('[auth] Outlook token exchange failed:', data)
    }
  } catch (e) {
    console.error('[auth] Outlook callback error:', e.message)
  }
})

/**
 * GET /api/token-health
 *
 * Returns the current status of the stored Outlook access token.
 * Used by the frontend status bar to show connection health.
 *
 * Response: { ok: boolean, status: string, minutesLeft: number }
 */
router.get('/token-health', (req, res) => {
  const h = getTokenHealth()
  const ok = h.status === 'ok' || h.status === 'warning'
  res.json({ ok, ...h })
})

// ── Gmail / Google OAuth ──────────────────────────────────────────────────────

/**
 * GET /api/gmail/auth-start
 *
 * Initiates the Gmail PKCE OAuth flow. Same pattern as Outlook above.
 * State encodes userId so the callback knows which user to update.
 *
 * Query: ?userId=<string>
 */
router.get('/gmail/auth-start', async (req, res) => {
  const clientId = GMAIL.clientId
  const redirect = GMAIL.redirectUri

  if (!clientId) {
    return res.status(503).json({ error: 'Gmail OAuth not configured — set GMAIL_CLIENT_ID in .env' })
  }

  const userId    = req.query.userId || 'friend'
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  // Encode userId in state so the callback can identify the user
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
    prompt:                'consent', // Force refresh_token issuance
    state,
  })}`

  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    res.redirect(authUrl)
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
          .then(data => {
            if (data.access_token) {
              writeFileSync(getGmailTokensPath(userId), JSON.stringify({
                clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
                expiresAt: Date.now() + data.expires_in * 1000,
              }, null, 2))
              const users = loadUsers()
              users[userId] = users[userId] || {}
              users[userId].gmailTokens = true
              saveUsers(users)
              console.log(`[auth] Gmail authorized for ${userId} (dev)`)
            }
          })
          .catch(e => console.error('[auth] Gmail dev token exchange failed:', e.message))
      }
    })
    server.on('error', e => console.error(`[auth] Gmail dev callback server error: ${e.message}`))
    server.listen(port, () => console.log(`[auth] Gmail dev callback server listening on :${port}`))
    res.send(`<html><body><script>window.location="${authUrl}"</script><p>Opening Google sign-in…</p></body></html>`)
  }
})

/**
 * GET /api/gmail/auth-callback
 *
 * Production Gmail OAuth callback. Exchanges code for tokens and writes them
 * to gmail_tokens_<userId>.json. Marks user's gmailTokens flag in users.json.
 */
router.get('/gmail/auth-callback', async (req, res) => {
  const { code, state } = req.query
  res.writeHead(200, { 'Content-Type': 'text/html' })

  if (!code || !state) {
    res.end('<html><body><h2>Gmail auth failed: missing code or state.</h2><p>Close and try again.</p></body></html>')
    return
  }

  const stored = oauthVerifiers.get(state)
  if (!stored) {
    res.end('<html><body><h2>Gmail auth failed: expired or invalid state.</h2><p>Close and try again.</p></body></html>')
    return
  }

  oauthVerifiers.delete(state)
  const { verifier, clientId, userId, redirect } = stored

  res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Gmail Authorized!</h2><p>You can close this tab and return to the app.</p></body></html>')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: GMAIL.clientSecret, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
    })
    const data = await tokenRes.json()
    if (data.access_token) {
      writeFileSync(getGmailTokensPath(userId), JSON.stringify({
        clientId, accessToken: data.access_token, refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }, null, 2))
      const users = loadUsers()
      users[userId] = users[userId] || {}
      users[userId].gmailTokens = true
      saveUsers(users)
      console.log(`[auth] Gmail authorized for ${userId} (production)`)
    } else {
      console.error('[auth] Gmail token exchange failed:', data)
    }
  } catch (e) {
    console.error('[auth] Gmail callback error:', e.message)
  }
})

/**
 * GET /api/gmail/token-health
 *
 * Returns the Gmail token status for a user.
 * Query / header: x-user-id or defaults to 'friend'.
 */
router.get('/gmail/token-health', (req, res) => {
  const userId = req.headers['x-user-id'] || 'friend'
  const h      = getGmailTokenHealth(userId)
  const ok     = h.status === 'ok' || h.status === 'warning'
  res.json({ ok, ...h })
})

export default router
