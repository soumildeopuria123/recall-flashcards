// Types shared by the Worker (src/worker) and the app (src/app).

export const BRAND = 'Recall'

export type StudyMode = 'flashcards' | 'learn' | 'match'

export interface Deck {
  id: string
  title: string
  description: string | null
  hue: number
  cardCount: number
  mastered: number
  mastery: number
  dueCount: number
  lastStudiedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Card {
  id: string
  deckId: string
  term: string
  definition: string
  hasImage: boolean
  position: number
  progress: {
    correct: number
    incorrect: number
    streak: number
    mastery: number
    nextDue: number | null
    lastSeen: number | null
    /** FSRS memory state; null until the card has been rated at least once. */
    stability: number | null
    difficulty: number | null
  }
}

export interface Session {
  id: string
  deckId: string
  deckTitle?: string
  mode: StudyMode
  score: number
  total: number
  accuracy: number
  durationMs: number
  createdAt: number
}

export interface XpStatus {
  /** Lifetime XP. 100 XP per level. */
  total: number
  /** XP earned since UTC midnight. */
  today: number
  /** Daily goal in XP. */
  goal: number
  /** Current level, 1-based: 100 XP per level. */
  level: number
  /** XP earned inside the current level, 0..99. */
  levelProgress: number
}

export interface Me {
  user: { sub: string; name?: string; email?: string; picture?: string }
  streak: number
  seeded: boolean
  capabilities: { database: boolean; files: boolean; auth: 'freebuff' | 'password' }
  prefs: {
    /** FSRS target retention in percent, 80–97. */
    retention: number
    /** Daily XP goal. */
    goal: number
  }
  xp: XpStatus
}

export interface Stats {
  streak: number
  longestStreak: number
  sessions: number
  cardsMastered: number
  cardsTotal: number
  minutes: number
  days: { date: string; sessions: number; accuracy: number | null }[]
  recent: Session[]
  decks: { id: string; title: string; hue: number; mastery: number; cardCount: number }[]
}

export interface SessionResult {
  cardId: string
  correct: boolean
  /** FSRS grade (1 Again … 4 Easy). Learn/Match omit it; the server infers 1/3. */
  rating?: 1 | 2 | 3 | 4
}

/** Projected review workload and memory health across every deck. */
export interface Forecast {
  /** Due counts for the next 30 days; day 0 is today. */
  days: { date: string; due: number }[]
  /** Average predicted recall at each card's next review, 0..100. */
  retention: number
  /** Cards whose recall has already dropped below the retention target. */
  atRisk: number
  /** Cards seen at least once. */
  scheduled: number
}
