// FSRS-4.5, the open spaced-repetition scheduler behind Anki's FSRS support.
//
// Every card carries a memory model — difficulty D (1..10, slowly mean-
// reverting) and stability S (days, the half-life of recall) — and every
// rating updates both from the forgetting curve R(t, S) = (1 + FACTOR*t/S)^DECAY.
// Intervals are then chosen so recall probability at review time lands on a
// target retention (90%), which is what makes scheduling "optimal" rather
// than exponential guessing.
//
// Shared by the Worker (scheduling on save) and the app (interval previews),
// so both must stay pure and side-effect free.

export type Grade = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

export interface MemoryState {
  difficulty: number
  stability: number
}

// Default parameters (FSRS-4.5, 17 weights), fitted on millions of reviews.
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246,
  1.587, 0.2272, 2.8755,
]

export const REQUEST_RETENTION = 0.9
/** Tightest and loosest targets the scheduler accepts, in percent. */
export const RETENTION_MIN = 80
export const RETENTION_MAX = 97
const DECAY = -0.5
// FACTOR is fixed by the desire that R(S) = REQUEST_RETENTION at t = S.
const FACTOR = Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1 // 19/81 ≈ 0.2346

export const DAY = 86_400_000

const clampDifficulty = (d: number) => Math.min(10, Math.max(1, d))
const clampStability = (s: number) => Math.min(36_500, Math.max(0.1, s))

/** Probability of recalling a card `elapsedDays` after its last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY)
}

/** Recall probability for a stored card, given its last review time. */
export function recallToday(progress: { stability: number | null; lastSeen: number | null }, now = Date.now()): number | null {
  if (progress.stability === null) return null
  const elapsed = progress.lastSeen ? (now - progress.lastSeen) / DAY : 0
  return retrievability(elapsed, progress.stability)
}

/** Days until recall probability drops to the target retention. */
export function intervalFor(stability: number, retention = REQUEST_RETENTION): number {
  return Math.min(36_500, Math.max(1, (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)))
}

/** Memory state after a card's first rating. */
export function initialState(grade: Grade): MemoryState {
  return { stability: clampStability(W[grade - 1]), difficulty: clampDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1) }
}

/** Memory state after a later rating, given days elapsed since the last review. */
export function nextState(state: MemoryState, grade: Grade, elapsedDays: number): MemoryState {
  const r = retrievability(elapsedDays, state.stability)
  // Difficulty moves toward the initial difficulty of the rating, damped by w7.
  const difficulty = clampDifficulty(W[7] * initialState(4).difficulty + (1 - W[7]) * (state.difficulty - W[6] * (grade - 3)))
  let stability: number
  if (grade === 1) {
    // Forgetting: stability collapses, bounded by today's retrievability and floor 0.5d.
    const forget = W[11] * Math.pow(state.difficulty, -W[12]) * (Math.pow(state.stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))
    stability = Math.max(0.5, Math.min(forget, state.stability))
  } else {
    const hardPenalty = grade === 2 ? W[15] : 1
    const easyBonus = grade === 4 ? W[16] : 1
    stability =
      state.stability *
      (1 +
        Math.exp(W[8]) *
          (11 - state.difficulty) *
          Math.pow(state.stability, -W[9]) *
          (Math.exp(W[10] * (1 - r)) - 1) *
          hardPenalty *
          easyBonus)
  }
  return { difficulty, stability: clampStability(stability) }
}

/** The state a stored card currently behaves like, treating missing data as new. */
export function stateOf(progress: { stability: number | null; difficulty: number | null }): MemoryState | null {
  if (progress.stability === null || progress.stability === undefined) return null
  return { stability: progress.stability, difficulty: progress.difficulty ?? 5 }
}

/** Days each grade would postpone the card. Grade 1 returns 0 (= same session). */
export function previewIntervals(
  progress: { stability: number | null; difficulty: number | null; lastSeen: number | null },
  now = Date.now(),
  retention = REQUEST_RETENTION,
): Record<Grade, number> {
  const state = stateOf(progress)
  const elapsed = progress.lastSeen ? (now - progress.lastSeen) / DAY : 0
  const next: Record<Grade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const grade of [1, 2, 3, 4] as const) {
    const updated = state ? nextState(state, grade, elapsed) : initialState(grade)
    next[grade] = grade === 1 ? 0 : intervalFor(updated.stability, retention)
  }
  return next
}

/** "10 min", "3 d", "2 mo", "1 y" — interval labels for the grade buttons. */
export function formatInterval(days: number): string {
  if (days <= 0) return '10 min'
  const hours = days * 24
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`
  if (days < 30) return `${Math.round(days)} d`
  if (days < 365) return `${Math.round(days / 30.4)} mo`
  const years = days / 365
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)} y`
}

export interface Schedulable {
  progress: {
    stability: number | null
    difficulty: number | null
    nextDue: number | null
    lastSeen: number | null
  }
}

/**
 * Anki-style study order: cards due now first, most-at-risk (lowest
 * retrievability) to the front; then unseen cards; then upcoming reviews in
 * due-date order.
 */
export function buildStudyQueue<T extends Schedulable>(cards: T[], now = Date.now()): T[] {
  const risk = (card: T): number => {
    const state = stateOf(card.progress)
    return state ? retrievability((now - (card.progress.lastSeen ?? now)) / DAY, state.stability) : 1
  }
  const due = cards.filter((c) => c.progress.nextDue !== null && c.progress.nextDue <= now).sort((a, b) => risk(a) - risk(b))
  const fresh = cards.filter((c) => c.progress.nextDue === null)
  const upcoming = cards.filter((c) => c.progress.nextDue !== null && c.progress.nextDue > now).sort((a, b) => (a.progress.nextDue ?? 0) - (b.progress.nextDue ?? 0))
  return [...due, ...fresh, ...upcoming]
}
