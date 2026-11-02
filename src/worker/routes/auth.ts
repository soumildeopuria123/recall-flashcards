import { Hono } from 'hono'
import { isSameOriginRequest } from '@freebuff/auth'

import {
  appOrigin,
  DUMMY_HASH,
  hashPassword,
  isSecureOrigin,
  privateJson,
  readCookie,
  SESSION_COOKIE,
  SESSION_SECONDS,
  sessionCookie,
  sha256Hex,
  startSession,
  verifyPassword,
} from '../auth'
import type { AppContext } from '../env'
import { ensureSchema } from '../db'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_PASSWORD = 8

type Credentials = { name?: unknown; email?: unknown; password?: unknown }

export const authRoutes = new Hono<AppContext>()

// These endpoints are the only unauthenticated mutations in the app, so they
// carry their own cross-origin guard instead of the requireUser middleware.
authRoutes.use('*', async (c, next) => {
  const request = c.req.raw
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  // These run before requireDb, so the account tables must exist first.
  if (c.env.DB) await ensureSchema(c.env.DB)
  await next()
})

async function credentials(c: { req: { json: () => Promise<unknown> } }): Promise<Credentials> {
  const body = await c.req.json().catch(() => null)
  return body && typeof body === 'object' ? (body as Credentials) : {}
}

authRoutes.post('/signup', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Accounts need the database binding.' }, 500)

  const body = await credentials(c)
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const name = String(body.name ?? '').trim().slice(0, 60) || email.split('@')[0]

  if (!EMAIL.test(email) || email.length > 200) return c.json({ error: 'Enter a valid email address.' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `Use at least ${MIN_PASSWORD} characters for your password.` }, 400)
  if (password.length > 200) return c.json({ error: 'That password is too long.' }, 400)

  const existing = await db.prepare(`SELECT id FROM accounts WHERE email = ?`).bind(email).first()
  if (existing) return c.json({ error: 'An account with that email already exists. Sign in instead.' }, 409)

  const accountId = `acct_${crypto.randomUUID()}`
  const passwordHash = await hashPassword(password)
  try {
    await db
      .prepare(`INSERT INTO accounts (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(accountId, email, name, passwordHash, Date.now())
      .run()
  } catch {
    // The unique index is the real guard against a race between two sign-ups.
    return c.json({ error: 'An account with that email already exists. Sign in instead.' }, 409)
  }

  const token = await startSession(db, accountId)
  c.header('Set-Cookie', sessionCookie(token, SESSION_SECONDS, isSecureOrigin(c.env, c.req.raw)))
  return privateJson(c, { user: { sub: accountId, name, email } }, 201)
})

authRoutes.post('/signin', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Accounts need the database binding.' }, 500)

  const body = await credentials(c)
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) return c.json({ error: 'Enter your email and password.' }, 400)

  const row = await db.prepare(`SELECT id, email, name, password_hash FROM accounts WHERE email = ?`).bind(email).first<{
    id: string
    email: string
    name: string
    password_hash: string
  }>()

  // Hash either way so a wrong email and a wrong password cost the same time.
  const valid = await verifyPassword(row?.password_hash ?? DUMMY_HASH, password)
  if (!row || !valid) return c.json({ error: 'Email or password is incorrect.' }, 401)

  const token = await startSession(db, row.id)
  c.header('Set-Cookie', sessionCookie(token, SESSION_SECONDS, isSecureOrigin(c.env, c.req.raw)))
  return privateJson(c, { user: { sub: row.id, name: row.name, email: row.email } })
})

authRoutes.post('/signout', async (c) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE)
  if (c.env.DB && token) await c.env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(await sha256Hex(token)).run()
  c.header('Set-Cookie', sessionCookie(null, 0, isSecureOrigin(c.env, c.req.raw)))
  return privateJson(c, { ok: true })
})
