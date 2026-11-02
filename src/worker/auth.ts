import { createFreebuffAuth, isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import type { Context, MiddlewareHandler } from 'hono'

import type { AppContext, Env } from './env'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export const SESSION_COOKIE = 'recall_session'
export const SESSION_SECONDS = 30 * 24 * 60 * 60

// Password auth is the fallback whenever Sign in with Freebuff is not
// configured, so a fresh clone still has real accounts instead of a pretend
// user. With FREEBUFF_CLIENT_ID set, Freebuff owns identity instead.
export function authMode(env: Env): 'freebuff' | 'password' | 'off' {
  if (env.FREEBUFF_CLIENT_ID) return 'freebuff'
  return env.DB ? 'password' : 'off'
}

let cached: { key: string; auth: FreebuffAuth } | undefined

/** One auth instance per isolate; recreated only if the config changes. */
export function getAuth(env: Env, request: Request): FreebuffAuth | null {
  if (!env.FREEBUFF_CLIENT_ID) return null
  const baseUrl = env.APP_ORIGIN ?? new URL(request.url).origin
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER ?? ''}|${baseUrl}`
  if (cached?.key !== key) {
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER || undefined,
        baseUrl,
        allowInsecureLocalhost: new URL(baseUrl).protocol === 'http:' && LOOPBACK.has(new URL(baseUrl).hostname),
      }),
    }
  }
  return cached.auth
}

const encoder = new TextEncoder()

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0))

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

const ITERATIONS = 120_000

/** PBKDF2-SHA256 with a per-account salt: `pbkdf2$iterations$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$')
  if (scheme !== 'pbkdf2' || !saltRaw || !hashRaw) return false
  const expected = fromBase64(hashRaw)
  const actual = await derive(password, fromBase64(saltRaw), Number(iterationsRaw) || ITERATIONS)
  if (actual.length !== expected.length) return false
  // Constant-time comparison: a length-independent XOR fold.
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i]
  return difference === 0
}

/** Compared against when an email is unknown, so timing does not reveal it. */
export const DUMMY_HASH = `pbkdf2$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

export function isSecureOrigin(env: Env, request: Request): boolean {
  return new URL(env.APP_ORIGIN ?? request.url).protocol === 'https:'
}

export function sessionCookie(token: string | null, maxAgeSeconds: number, secure: boolean): string {
  const attributes = [`${SESSION_COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, maxAgeSeconds)}`]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

/** Stores a fresh opaque session and returns the token to put in the cookie. */
export async function startSession(db: D1Database, accountId: string): Promise<string> {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const now = Date.now()
  await db
    .prepare(`INSERT INTO auth_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256Hex(token), accountId, now, now + SESSION_SECONDS * 1000)
    .run()
  return token
}

async function passwordUser(env: Env, request: Request): Promise<FreebuffUser | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!env.DB || !token) return null
  const row = await env.DB
    .prepare(
      `SELECT a.id, a.email, a.name, a.picture FROM auth_sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), Date.now())
    .first<{ id: string; email: string; name: string; picture: string | null }>()
  if (!row) return null
  return { sub: row.id, email: row.email, name: row.name, picture: row.picture ?? undefined, email_verified: true }
}

export async function currentUser(env: Env, request: Request): Promise<FreebuffUser | null> {
  const auth = getAuth(env, request)
  if (auth) return auth.getUser(request)
  return passwordUser(env, request)
}

export function appOrigin(env: Env, request: Request): string {
  return env.APP_ORIGIN ?? new URL(request.url).origin
}

/** Requires a signed-in user and, for mutations, a same-origin request. */
export const requireUser: MiddlewareHandler<AppContext> = async (c, next) => {
  const request = c.req.raw
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  const user = await currentUser(c.env, request)
  if (!user) return c.json({ error: 'Sign in required.' }, 401)
  c.set('user', user)
  await next()
}

export function privateJson<T>(c: Context<AppContext>, body: T, status = 200) {
  c.header('Cache-Control', 'private, no-store')
  return c.json(body as never, status as never)
}
