/**
 * server/lib/oauth-state.js
 *
 * Ephemeral in-memory store for PKCE (Proof Key for Code Exchange) verifiers
 * used during OAuth 2.0 authorization flows for both Outlook and Gmail.
 *
 * How it works:
 *   1. /api/auth-start (or /api/gmail/auth-start) generates a random verifier
 *      and a SHA-256 challenge, stores the verifier here keyed by `state`.
 *   2. The browser redirects to Microsoft/Google with the challenge.
 *   3. The provider redirects back to /api/auth-callback with `code` + `state`.
 *   4. The callback retrieves the verifier, exchanges code for tokens, then
 *      deletes the entry to prevent replay attacks.
 *
 * Limitation: in-memory storage means verifiers are lost on server restart.
 * This is acceptable because OAuth flows complete within seconds. For multi-
 * instance deployments, replace this Map with Redis.
 *
 * Shape: Map<state: string, { verifier, clientId, clientSecret?, redirect, userId }>
 */

export const oauthVerifiers = new Map()
