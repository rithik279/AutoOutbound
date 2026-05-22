/**
 * server/routes/ai.js
 *
 * AI proxy routes — forwards requests to OpenAI or Anthropic.
 *
 * Why proxy instead of calling from the browser?
 *   API keys must never be in the browser bundle. All AI calls go through
 *   this server-side proxy which injects the key from the environment.
 *
 * Routing logic:
 *   - model starts with 'claude' → forward to Anthropic Messages API
 *   - everything else            → forward to OpenAI Chat Completions API
 *
 * Route:
 *   POST /api/ai/chat
 *     Body: { model, messages, max_tokens?, temperature?, system? }
 *     Response: upstream API response (proxied as-is)
 */

import { Router } from 'express'
import fetch from 'node-fetch'
import { OPENAI_KEY, ANTHROPIC_KEY } from '../lib/config.js'

const router = Router()

router.post('/ai/chat', async (req, res) => {
  const { model, messages, max_tokens, temperature, system } = req.body
  const isAnthropic = model?.startsWith('claude')

  try {
    if (isAnthropic) {
      // Anthropic Messages API — uses x-api-key header and a different request shape
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: max_tokens || 1000,
          system,
          messages,
        }),
      })
      const data = await r.json()
      res.status(r.status).json(data)
    } else {
      // OpenAI Chat Completions API
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens:  max_tokens  || 1000,
          temperature: temperature ?? 0.85,
          messages,
        }),
      })
      const data = await r.json()
      res.status(r.status).json(data)
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
