import { Hono } from 'hono'

import { authMode, privateJson } from '../auth'
import { mapSession, now, streakFrom } from '../db'
import type { AppContext } from '../env'
import { DAY, intervalFor, nextState, retrievability, stateOf } from '../../shared/fsrs'
import { clearUser, SEED_VERSION, seedUser, topUpUser } from '../seed'
import type { Forecast, Me, Stats, XpStatus } from '../../shared/types'

export const account = new Hono<AppContext>()

/** The scheduler's target recall, clamped to the sane 80–97% band. */
function retentionTarget(stored: unknown): number {
  return Math.min(0.97, Math.max(0.8, Math.round(Number(stored ?? 90)) / 100))
}

/** Start of the UTC day: the boundary for "today's XP". */
function dayStart(at = new Date()): number {
  const start = new Date(at)
  start.setUTCHours(0, 0, 0, 0)
  return start.getTime()
}

/** Lifetime XP, today's XP, and the 100-XP-per-level breakdown. */
function xpStatus(raw: { xp?: number | null; goal?: number | null }, today: number): XpStatus {
  const total = Math.max(0, Math.round(Number(raw.xp ?? 0)))
  const goal = Math.min(500, Math.max(10, Math.round(Number(raw.goal ?? 40))))
  return { total, today, goal, level: Math.floor(total / 100) + 1, levelProgress: total % 100 }
}

async function sessionDays(db: D1Database, owner: string): Promise<Set<string>> {
  const rows = await db.prepare(`SELECT DISTINCT date(created_at / 1000, 'unixepoch') AS day FROM sessions WHERE owner_sub = ?`).bind(owner).all<{ day: string }>()
  return new Set(rows.results.map((r) => r.day))
}

account.get('/me', async (c) => {
  const user = c.get('user')
  const db = c.get('db')
  let row = await db.prepare(`SELECT seeded_at, seed_version, retention, xp, goal FROM users WHERE owner_sub = ?`).bind(user.sub).first<{ seeded_at: number | null; seed_version: number | null; retention: number | null; xp: number | null; goal: number | null }>()
  if (!row) {
    await db.prepare(`INSERT INTO users (owner_sub, created_at) VALUES (?, ?)`).bind(user.sub, now()).run()
    // First visit: furnish the library with the starter decks only — no
    // fabricated progress, so a new account starts at 0% everywhere.
    await seedUser(db, user.sub)
    row = { seeded_at: now(), seed_version: SEED_VERSION, retention: 90, xp: 0, goal: 40 }
  } else if (row.seeded_at && Number(row.seed_version ?? 0) < SEED_VERSION) {
    // The starter library grew since this account was seeded: add the decks
    // it is missing (matched by title) without touching existing progress.
    await topUpUser(db, user.sub)
  }
  const todayRow = await db
    .prepare(`SELECT COALESCE(SUM(xp), 0) AS today FROM sessions WHERE owner_sub = ? AND created_at >= ?`)
    .bind(user.sub, dayStart())
    .first<{ today: number | null }>()
  const body: Me = {
    user: { sub: user.sub, name: user.name, email: user.email, picture: user.picture },
    streak: streakFrom(await sessionDays(db, user.sub)).current,
    seeded: Boolean(row.seeded_at),
    capabilities: { database: true, files: Boolean(c.env.FILES), auth: authMode(c.env) === 'freebuff' ? 'freebuff' : 'password' },
    prefs: { retention: Math.round(retentionTarget(row.retention) * 100), goal: Math.round(row.goal ?? 40) },
    xp: xpStatus(row, Math.round(Number(todayRow?.today ?? 0))),
  }
  return privateJson(c, body)
})

account.put('/account/prefs', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ retention?: number; goal?: number }>()
  // Missing keys keep their stored values, so each control saves independently.
  const stored = await db.prepare(`SELECT retention, goal FROM users WHERE owner_sub = ?`).bind(owner).first<{ retention: number | null; goal: number | null }>()
  const retention = input.retention === undefined ? Math.round(Number(stored?.retention ?? 90)) : Math.round(retentionTarget(input.retention) * 100)
  const goal = input.goal === undefined ? Math.round(Number(stored?.goal ?? 40)) : Math.min(500, Math.max(10, Math.round(Number(input.goal))))
  await db.prepare(`UPDATE users SET retention = ?, goal = ? WHERE owner_sub = ?`).bind(retention, goal, owner).run()
  return privateJson(c, { ok: true, prefs: { retention, goal } })
})

account.get('/stats', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const since = now() - 84 * 86_400_000
  const [totals, mastered, cards, days, recent, decks] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(duration_ms), 0) AS ms FROM sessions WHERE owner_sub = ?`).bind(owner),
    db.prepare(`SELECT COUNT(*) AS n FROM card_progress WHERE owner_sub = ? AND mastery >= 80`).bind(owner),
    db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE owner_sub = ?`).bind(owner),
    db
      .prepare(
        `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n, SUM(score) AS s, SUM(total) AS t FROM sessions WHERE owner_sub = ? AND created_at >= ? GROUP BY day ORDER BY day`,
      )
      .bind(owner, since),
    db.prepare(`SELECT s.*, d.title AS deck_title FROM sessions s LEFT JOIN decks d ON d.id = s.deck_id WHERE s.owner_sub = ? ORDER BY s.created_at DESC LIMIT 12`).bind(owner),
    db
      .prepare(
        `SELECT d.id, d.title, d.hue,
          (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
          (SELECT COALESCE(AVG(COALESCE(p.mastery, 0)), 0) FROM cards c LEFT JOIN card_progress p ON p.card_id = c.id WHERE c.deck_id = d.id) AS mastery
         FROM decks d WHERE d.owner_sub = ? ORDER BY mastery DESC`,
      )
      .bind(owner),
  ])

  const byDay = new Map((days.results as { day: string; n: number; s: number; t: number }[]).map((r) => [r.day, r]))
  const series: Stats['days'] = []
  const cursor = new Date()
  cursor.setUTCHours(0, 0, 0, 0)
  cursor.setUTCDate(cursor.getUTCDate() - 83)
  for (let i = 0; i < 84; i++) {
    const key = cursor.toISOString().slice(0, 10)
    const row = byDay.get(key)
    series.push({ date: key, sessions: Number(row?.n ?? 0), accuracy: row && Number(row.t) ? Math.round((Number(row.s) / Number(row.t)) * 100) : null })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  const streak = streakFrom(new Set((days.results as { day: string }[]).map((r) => r.day).concat([...(await sessionDays(db, owner))])))
  const body: Stats = {
    streak: streak.current,
    longestStreak: streak.longest,
    sessions: Number((totals.results[0] as { n: number }).n),
    cardsMastered: Number((mastered.results[0] as { n: number }).n),
    cardsTotal: Number((cards.results[0] as { n: number }).n),
    minutes: Math.round(Number((totals.results[0] as { ms: number }).ms) / 60_000),
    days: series,
    recent: (recent.results as Record<string, unknown>[]).map(mapSession),
    decks: (decks.results as { id: string; title: string; hue: number; card_count: number; mastery: number }[]).map((d) => ({
      id: d.id,
      title: d.title,
      hue: Number(d.hue),
      cardCount: Number(d.card_count),
      mastery: Math.round(Number(d.mastery)),
    })),
  }
  return privateJson(c, body)
})

// The projected review workload. Each card is scheduled forward from its
// current memory state at the interval where recall would next hit the
// retention target, and counted into the day that review lands on — which is
// what the user will see as "due" if they keep answering Good. Memory health
// is the predicted recall today across every scheduled card.
account.get('/forecast', async (c) => {
  const t = now()
  const HORIZON = 30
  const owner = c.get('user').sub
  const [prefs, progress] = await c
    .get('db')
    .batch([
      c.get('db').prepare(`SELECT retention FROM users WHERE owner_sub = ?`).bind(owner),
      c
        .get('db')
        .prepare(`SELECT p.stability, p.difficulty, p.next_due, p.last_seen FROM card_progress p WHERE p.owner_sub = ?`)
        .bind(owner),
    ])
  const target = retentionTarget((prefs.results[0] as { retention?: number } | undefined)?.retention)
  const rows = progress.results as { stability: number | null; difficulty: number | null; next_due: number | null; last_seen: number | null }[]

  const days: Forecast['days'] = []
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  for (let i = 0; i < HORIZON; i++) {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + i)
    days.push({ date: day.toISOString().slice(0, 10), due: 0 })
  }

  const todayEnd = start.getTime() + DAY
  let atRisk = 0
  let retentionSum = 0
  let scheduled = 0
  for (const row of rows) {
    const state = stateOf({ stability: row.stability, difficulty: row.difficulty })
    if (!state) continue
    scheduled++
    const elapsedDays = row.last_seen ? (t - Number(row.last_seen)) / DAY : 0
    const recall = retrievability(elapsedDays, state.stability)
    retentionSum += recall
    if (recall < target) atRisk++

    let due = row.next_due ?? t
    let memory = state
    let steps = 0
    while (due < start.getTime() + HORIZON * DAY && steps < 64) {
      const index = due < todayEnd ? 0 : Math.min(Math.floor((due - start.getTime()) / DAY), HORIZON - 1)
      if (index >= 0 && index < HORIZON) days[index].due++
      memory = nextState(memory, 3, Math.max(0, (due - (row.last_seen ?? due)) / DAY))
      due += Math.round(intervalFor(memory.stability, target) * DAY)
      steps++
    }
  }

  const retention = scheduled ? Math.round((retentionSum / scheduled) * 100) : 100
  return privateJson(c, { days, retention, atRisk, scheduled } satisfies Forecast)
})

account.post('/account/reset', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  await clearUser(db, owner)
  await seedUser(db, owner)
  return privateJson(c, { ok: true })
})

account.delete('/account/data', async (c) => {
  await clearUser(c.get('db'), c.get('user').sub)
  return privateJson(c, { ok: true })
})
