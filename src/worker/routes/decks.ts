import { Hono } from 'hono'

import { privateJson } from '../auth'
import { CARD_SELECT, DECK_SELECT, hueFor, id, mapCard, mapDeck, mapSession, now } from '../db'
import type { AppContext } from '../env'
import { DAY, initialState, intervalFor, nextState, retrievability, stateOf } from '../../shared/fsrs'
import type { SessionResult, StudyMode, XpStatus } from '../../shared/types'

export const decks = new Hono<AppContext>()

const MODES = new Set<StudyMode>(['flashcards', 'learn', 'match'])

decks.get('/', async (c) => {
  const rows = await c.get('db').prepare(`${DECK_SELECT} WHERE d.owner_sub = ? ORDER BY COALESCE(d.last_studied_at, d.updated_at) DESC`).bind(now(), c.get('user').sub).all()
  return privateJson(c, { items: (rows.results as Record<string, unknown>[]).map(mapDeck) })
})

decks.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ title?: string; description?: string; cards?: { term: string; definition: string }[] }>()
  const title = input.title?.trim().slice(0, 80)
  if (!title) return c.json({ error: 'Give the deck a title.' }, 400)
  const deckId = id()
  const t = now()
  const statements = [
    db
      .prepare(`INSERT INTO decks (id, owner_sub, title, description, hue, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(deckId, owner, title, input.description?.trim().slice(0, 300) || null, hueFor(title), t, t),
  ]
  cleanCards(input.cards).forEach((card, i) => {
    statements.push(
      db.prepare(`INSERT INTO cards (id, owner_sub, deck_id, term, definition, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id(), owner, deckId, card.term, card.definition, i, t + i),
    )
  })
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
  const row = await db.prepare(`${DECK_SELECT} WHERE d.owner_sub = ? AND d.id = ?`).bind(t, owner, deckId).first()
  return privateJson(c, { deck: mapDeck(row as Record<string, unknown>) }, 201)
})

decks.get('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const [deck, cards, sessions] = await db.batch([
    db.prepare(`${DECK_SELECT} WHERE d.owner_sub = ? AND d.id = ?`).bind(now(), owner, deckId),
    db.prepare(`${CARD_SELECT} WHERE c.owner_sub = ? AND c.deck_id = ? ORDER BY c.position ASC, c.created_at ASC`).bind(owner, deckId),
    db.prepare(`SELECT * FROM sessions WHERE owner_sub = ? AND deck_id = ? ORDER BY created_at DESC LIMIT 10`).bind(owner, deckId),
  ])
  if (!deck.results[0]) return c.json({ error: 'Not found.' }, 404)
  return privateJson(c, {
    deck: mapDeck(deck.results[0] as Record<string, unknown>),
    cards: (cards.results as Record<string, unknown>[]).map(mapCard),
    sessions: (sessions.results as Record<string, unknown>[]).map(mapSession),
  })
})

decks.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const input = await c.req.json<{ title?: string; description?: string | null }>()
  const existing = await db.prepare(`SELECT * FROM decks WHERE owner_sub = ? AND id = ?`).bind(owner, deckId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const title = (input.title ?? (existing.title as string)).trim().slice(0, 80)
  if (!title) return c.json({ error: 'Give the deck a title.' }, 400)
  const description = input.description === undefined ? (existing.description as string | null) : input.description?.trim().slice(0, 300) || null
  await db.prepare(`UPDATE decks SET title = ?, description = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(title, description, now(), owner, deckId).run()
  return privateJson(c, { ok: true })
})

decks.delete('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const keys = await db.prepare(`SELECT image_key FROM cards WHERE owner_sub = ? AND deck_id = ? AND image_key IS NOT NULL`).bind(owner, deckId).all<{ image_key: string }>()
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE owner_sub = ? AND deck_id = ?`).bind(owner, deckId),
    db.prepare(`DELETE FROM card_progress WHERE owner_sub = ? AND deck_id = ?`).bind(owner, deckId),
    db.prepare(`DELETE FROM cards WHERE owner_sub = ? AND deck_id = ?`).bind(owner, deckId),
    db.prepare(`DELETE FROM decks WHERE owner_sub = ? AND id = ?`).bind(owner, deckId),
  ])
  if (c.env.FILES && keys.results.length) await c.env.FILES.delete(keys.results.map((r) => r.image_key))
  return privateJson(c, { ok: true })
})

// CSV import/export. Proper CSV: quoted cells, doubled quotes, commas and
// newlines inside values, header row tolerated and skipped. Import creates a
// new deck in one request; export regenerates exactly that shape.

function parseCsv(text: string): { term: string; definition: string }[] {
  const text2 = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip a BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text2.length; i++) {
    const ch = text2[i]
    if (quoted) {
      if (ch === '"') {
        if (text2[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const cards: { term: string; definition: string }[] = []
  for (const cells of rows) {
    if (!cells.some((cell) => cell.trim())) continue
    const head = cells[0]?.trim().toLowerCase()
    const isHeader =
      (head === 'term' || head === 'front' || head === 'question') &&
      (cells[1]?.trim().toLowerCase() ? ['definition', 'back', 'answer'].includes(cells[1].trim().toLowerCase()) : true)
    if (isHeader) continue
    const term = (cells[0] ?? '').trim().slice(0, 300)
    const definition = (cells[1] ?? '').trim().slice(0, 600)
    if (term && definition) cards.push({ term, definition })
  }
  return cards
}

function toCsv(rows: string[][]): string {
  const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return `term,definition\n${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`
}

decks.post('/import', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ title?: string; csv?: string }>()
  const cards = cleanCards(parseCsv(input.csv ?? ''))
  if (cards.length === 0) return c.json({ error: 'No cards found in that file. Expect a header or one row per card.' }, 400)
  const title = (input.title?.trim() || 'Imported deck').slice(0, 80)
  const deckId = id()
  const t = now()
  const statements = [
    db
      .prepare(`INSERT INTO decks (id, owner_sub, title, description, hue, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(deckId, owner, title, null, hueFor(title), t, t),
  ]
  cards.forEach((card, i) => {
    statements.push(
      db.prepare(`INSERT INTO cards (id, owner_sub, deck_id, term, definition, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id(), owner, deckId, card.term, card.definition, i, t + i),
    )
  })
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
  const row = await db.prepare(`${DECK_SELECT} WHERE d.owner_sub = ? AND d.id = ?`).bind(t, owner, deckId).first()
  return privateJson(c, { deck: mapDeck(row as Record<string, unknown>), cards: cards.length }, 201)
})

decks.get('/:id/export', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const deck = await db.prepare(`SELECT title FROM decks WHERE owner_sub = ? AND id = ?`).bind(owner, deckId).first<{ title: string }>()
  if (!deck) return c.json({ error: 'Not found.' }, 404)
  const cards = await db
    .prepare(`SELECT term, definition FROM cards WHERE owner_sub = ? AND deck_id = ? ORDER BY position ASC, created_at ASC`)
    .bind(owner, deckId)
    .all<{ term: string; definition: string }>()
  const csv = toCsv(cards.results.map((row) => [row.term, row.definition]))
  const filename = deck.title.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'deck'
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  })
})

// Cards

function cleanCards(input: { term?: string; definition?: string }[] | undefined) {
  return (input ?? [])
    .map((card) => ({ term: card.term?.trim().slice(0, 300) ?? '', definition: card.definition?.trim().slice(0, 600) ?? '' }))
    .filter((card) => card.term && card.definition)
    .slice(0, 500)
}

decks.post('/:id/cards', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const deck = await db.prepare(`SELECT id FROM decks WHERE owner_sub = ? AND id = ?`).bind(owner, deckId).first()
  if (!deck) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ cards?: { term: string; definition: string }[] }>()
  const cards = cleanCards(input.cards)
  if (cards.length === 0) return c.json({ error: 'Each card needs a term and a definition.' }, 400)
  const top = await db.prepare(`SELECT COALESCE(MAX(position), -1) AS p FROM cards WHERE owner_sub = ? AND deck_id = ?`).bind(owner, deckId).first<{ p: number }>()
  const t = now()
  const statements = cards.map((card, i) =>
    db
      .prepare(`INSERT INTO cards (id, owner_sub, deck_id, term, definition, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id(), owner, deckId, card.term, card.definition, (top?.p ?? -1) + 1 + i, t + i),
  )
  statements.push(db.prepare(`UPDATE decks SET updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(t, owner, deckId))
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
  return privateJson(c, { added: cards.length }, 201)
})

decks.patch('/:id/cards/:cardId', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ term?: string; definition?: string }>()
  const [card] = cleanCards([{ term: input.term, definition: input.definition }])
  if (!card) return c.json({ error: 'Each card needs a term and a definition.' }, 400)
  const result = await db
    .prepare(`UPDATE cards SET term = ?, definition = ? WHERE owner_sub = ? AND id = ? AND deck_id = ?`)
    .bind(card.term, card.definition, owner, c.req.param('cardId'), c.req.param('id'))
    .run()
  if (!result.meta.changes) return c.json({ error: 'Not found.' }, 404)
  return privateJson(c, { ok: true })
})

decks.delete('/:id/cards/:cardId', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const cardId = c.req.param('cardId')
  const existing = await db.prepare(`SELECT image_key FROM cards WHERE owner_sub = ? AND id = ?`).bind(owner, cardId).first<{ image_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  await db.batch([
    db.prepare(`DELETE FROM card_progress WHERE owner_sub = ? AND card_id = ?`).bind(owner, cardId),
    db.prepare(`DELETE FROM cards WHERE owner_sub = ? AND id = ?`).bind(owner, cardId),
  ])
  if (existing.image_key && c.env.FILES) await c.env.FILES.delete(existing.image_key)
  return privateJson(c, { ok: true })
})

// Card images (R2). One image per card, replaced on upload.

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

decks.put('/:id/cards/:cardId/image', async (c) => {
  const bucket = c.env.FILES
  if (!bucket) return c.json({ error: 'storage_missing', message: 'No file storage is attached yet. Add R2 storage named FILES and redeploy.' }, 503)
  const db = c.get('db')
  const owner = c.get('user').sub
  const cardId = c.req.param('cardId')
  const existing = await db.prepare(`SELECT image_key FROM cards WHERE owner_sub = ? AND id = ?`).bind(owner, cardId).first<{ image_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) return c.json({ error: 'Choose a PNG, JPEG, WebP or GIF image.' }, 400)
  if (file.size > 4 * 1024 * 1024) return c.json({ error: 'Images are limited to 4 MB.' }, 400)
  const key = `${owner}/cards/${cardId}/${crypto.randomUUID()}`
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } })
  await db.prepare(`UPDATE cards SET image_key = ? WHERE owner_sub = ? AND id = ?`).bind(key, owner, cardId).run()
  if (existing.image_key) await bucket.delete(existing.image_key)
  return privateJson(c, { ok: true })
})

decks.delete('/:id/cards/:cardId/image', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const cardId = c.req.param('cardId')
  const existing = await db.prepare(`SELECT image_key FROM cards WHERE owner_sub = ? AND id = ?`).bind(owner, cardId).first<{ image_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  await db.prepare(`UPDATE cards SET image_key = NULL WHERE owner_sub = ? AND id = ?`).bind(owner, cardId).run()
  if (existing.image_key && c.env.FILES) await c.env.FILES.delete(existing.image_key)
  return privateJson(c, { ok: true })
})

decks.get('/:id/cards/:cardId/image', async (c) => {
  const bucket = c.env.FILES
  if (!bucket) return c.json({ error: 'Not found.' }, 404)
  const owner = c.get('user').sub
  const card = await c.get('db').prepare(`SELECT image_key FROM cards WHERE owner_sub = ? AND id = ?`).bind(owner, c.req.param('cardId')).first<{ image_key: string | null }>()
  if (!card?.image_key) return c.json({ error: 'Not found.' }, 404)
  const object = await bucket.get(card.image_key)
  if (!object) return c.json({ error: 'Not found.' }, 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// Sessions: the client plays the round, the server records it and reschedules
// each card with FSRS — difficulty and stability update from the grade, and
// the next due date is the interval where predicted recall hits the user's
// retention target. XP is awarded with the session: 10 per correct card, +5
// for a perfect round.

decks.post('/:id/sessions', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const deckId = c.req.param('id')
  const input = await c.req.json<{ mode?: StudyMode; results?: SessionResult[]; durationMs?: number }>()
  if (!input.mode || !MODES.has(input.mode)) return c.json({ error: 'Unknown study mode.' }, 400)
  const results = (input.results ?? []).filter((r) => typeof r.cardId === 'string' && typeof r.correct === 'boolean').slice(0, 500)
  if (results.length === 0) return c.json({ error: 'Nothing to record.' }, 400)
  const deck = await db.prepare(`SELECT id FROM decks WHERE owner_sub = ? AND id = ?`).bind(owner, deckId).first()
  if (!deck) return c.json({ error: 'Not found.' }, 404)

  // Collapse repeat appearances of one card within a session into its worst
  // grade — meeting the card twice and failing the second time means it is
  // not learned yet.
  const worst = new Map<string, SessionResult>()
  for (const r of results) {
    const rating = gradeOf(r)
    const previous = worst.get(r.cardId)
    if (!previous || gradeOf(previous) > rating) worst.set(r.cardId, { ...r, rating })
  }

  const ids = [...worst.keys()]
  const [prefs, owned] = await db.batch([
    db.prepare(`SELECT retention FROM users WHERE owner_sub = ?`).bind(owner),
    db
      .prepare(`SELECT c.id, p.correct, p.incorrect, p.streak, p.mastery, p.difficulty, p.stability, p.last_seen FROM cards c LEFT JOIN card_progress p ON p.card_id = c.id WHERE c.owner_sub = ? AND c.deck_id = ? AND c.id IN (${ids.map(() => '?').join(',')})`)
      .bind(owner, deckId, ...ids),
  ])
  const target = Math.min(0.97, Math.max(0.8, Math.round(Number((prefs.results[0] as { retention?: number } | undefined)?.retention ?? 90)) / 100))
  const byId = new Map((owned.results as Record<string, unknown>[]).map((r) => [r.id as string, r]))

  const t = now()
  const statements: D1PreparedStatement[] = []
  let score = 0
  for (const r of worst.values()) {
    const row = byId.get(r.cardId)
    if (!row) continue
    const rating = gradeOf(r)
    const correct = rating >= 3
    if (correct) score++
    const state = stateOf({ stability: row.stability as number | null, difficulty: row.difficulty as number | null })
    const elapsed = row.last_seen ? (t - Number(row.last_seen)) / DAY : 0
    const memory = state ? nextState(state, rating, elapsed) : initialState(rating)
    const intervalDays = intervalFor(memory.stability, target)
    const streak = correct ? Number(row.streak ?? 0) + 1 : 0
    const attempts = Number(row.correct ?? 0) + Number(row.incorrect ?? 0) + 1
    const accuracy = (Number(row.correct ?? 0) + (correct ? 1 : 0)) / attempts
    // Mastery blends lifetime accuracy, stability in days and recall-today, so
    // it reads as "how well do I hold this right now".
    const retention = retrievability((t - (row.last_seen ? Number(row.last_seen) : t)) / DAY, memory.stability)
    const mastery = Math.round(100 * (0.5 * accuracy + 0.3 * Math.min(1, memory.stability / 30) + 0.2 * retention))
    statements.push(
      db
        .prepare(
          `INSERT INTO card_progress (card_id, owner_sub, deck_id, correct, incorrect, streak, mastery, next_due, last_seen, difficulty, stability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(card_id) DO UPDATE SET correct = excluded.correct, incorrect = excluded.incorrect, streak = excluded.streak, mastery = excluded.mastery, next_due = excluded.next_due, last_seen = excluded.last_seen, difficulty = excluded.difficulty, stability = excluded.stability`,
        )
        .bind(r.cardId, owner, deckId, correct ? Number(row.correct ?? 0) + 1 : Number(row.correct ?? 0), correct ? Number(row.incorrect ?? 0) : Number(row.incorrect ?? 0) + 1, streak, mastery, t + Math.round(intervalDays * DAY), t, memory.difficulty, memory.stability),
    )
  }
  const total = worst.size
  const xp = score * 10 + (total > 0 && score === total ? 5 : 0)
  const sessionId = id()
  statements.push(
    db
      .prepare(`INSERT INTO sessions (id, owner_sub, deck_id, mode, score, total, xp, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(sessionId, owner, deckId, input.mode, score, total, xp, Math.max(0, Math.round(Number(input.durationMs) || 0)), t),
  )
  statements.push(db.prepare(`UPDATE decks SET last_studied_at = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(t, t, owner, deckId))
  statements.push(db.prepare(`UPDATE users SET xp = xp + ? WHERE owner_sub = ?`).bind(xp, owner))
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))

  // XP status as of now: lifetime total, today's sum and the daily goal.
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const [user, todayRows] = await db.batch([
    db.prepare(`SELECT xp, goal FROM users WHERE owner_sub = ?`).bind(owner),
    db.prepare(`SELECT COALESCE(SUM(xp), 0) AS today FROM sessions WHERE owner_sub = ? AND created_at >= ?`).bind(owner, dayStart.getTime()),
  ])
  const userRow = user.results[0] as { xp?: number; goal?: number } | undefined
  const xpTotal = Math.max(0, Math.round(Number(userRow?.xp ?? 0)))
  const goal = Math.min(500, Math.max(10, Math.round(Number(userRow?.goal ?? 40))))
  const body = {
    session: { id: sessionId, score, total, accuracy: total ? Math.round((score / total) * 100) : 0 },
    xp: {
      earned: xp,
      total: xpTotal,
      today: Math.round(Number((todayRows.results[0] as { today?: number } | undefined)?.today ?? 0)),
      goal,
      level: Math.floor(xpTotal / 100) + 1,
      levelProgress: xpTotal % 100,
    } satisfies XpStatus & { earned: number },
  }
  return privateJson(c, body, 201)
})

/** Learn and Match only know right/wrong: Again for a miss, Good for a hit. */
function gradeOf(result: SessionResult): 1 | 2 | 3 | 4 {
  const rating = result.rating
  if (rating === 1 || rating === 2 || rating === 3 || rating === 4) return rating
  return result.correct ? 3 : 1
}
