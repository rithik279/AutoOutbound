/**
 * server/routes/contacts.js
 *
 * Contact management CRUD endpoints.
 *
 * Contacts are stored in the PostgreSQL database via Prisma.
 * They are created automatically when emails are scheduled, and can also
 * be read/updated directly via these endpoints.
 *
 * Routes:
 *   GET  /api/contacts          — List all contacts (with their emails)
 *   POST /api/contacts          — Create a new contact
 *   PUT  /api/contacts/:id      — Update state, title, or company
 *   GET  /api/contacts/:id/emails — List emails sent to a contact
 */

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

/**
 * GET /api/contacts
 *
 * Returns all contacts, each with their associated sent emails included.
 * Ordered by most recently updated first.
 */
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      include:  { emails: true },
      orderBy:  { updatedAt: 'desc' },
    })
    res.json({ contacts })
  } catch (err) {
    console.error('[contacts] GET /contacts error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/contacts
 *
 * Creates a new contact. Returns 409 if the email already exists
 * (email is the unique identifier for contacts).
 *
 * Body: { email, name, title?, company?, domain?, linkedin?, source? }
 */
router.post('/contacts', async (req, res) => {
  const { email, name, title, company, domain, linkedin, source } = req.body

  if (!email || !name) {
    return res.status(400).json({ error: 'email and name are required' })
  }

  try {
    const existing = await prisma.contact.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'Contact already exists', contact: existing })
    }

    const contact = await prisma.contact.create({
      data: {
        email,
        name,
        title:    title    || null,
        company:  company  || 'Unknown',
        domain:   domain   || null,
        linkedin: linkedin || null,
        state:    'new',
        source:   source   || 'manual',
      },
    })
    res.status(201).json({ contact })
  } catch (err) {
    console.error('[contacts] POST /contacts error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/contacts/:id
 *
 * Partial update — only updates fields that are explicitly provided.
 * Supports: state, title, company.
 *
 * Common state values: 'new', 'emailed', 'replied', 'unsubscribed'
 */
router.put('/contacts/:id', async (req, res) => {
  const { id }                  = req.params
  const { state, title, company } = req.body

  try {
    const contact = await prisma.contact.update({
      where: { id: parseInt(id, 10) },
      data:  {
        ...(state   !== undefined && { state }),
        ...(title   !== undefined && { title }),
        ...(company !== undefined && { company }),
      },
    })
    res.json({ contact })
  } catch (err) {
    console.error(`[contacts] PUT /contacts/${id} error:`, err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/contacts/:id/emails
 *
 * Returns all email records sent to a specific contact, newest first.
 */
router.get('/contacts/:id/emails', async (req, res) => {
  const { id } = req.params
  try {
    const emails = await prisma.email.findMany({
      where:   { contactId: parseInt(id, 10) },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ emails })
  } catch (err) {
    console.error(`[contacts] GET /contacts/${id}/emails error:`, err)
    res.status(500).json({ error: err.message })
  }
})

export default router
