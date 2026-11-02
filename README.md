# Recall (study app)

A flashcard study app in the spirit of Duolingo and Quizlet: a library of
decks, three study modes (flashcards, multiple-choice learn and a timed match
game), per-card mastery scheduled by FSRS, and the gamulation that keeps you
coming back — XP, levels, a daily goal, hearts and combos. The progress page
adds an activity heatmap, accuracy history and a 30-day review forecast. Cards
can carry an image, are pronounced by the browser's text-to-speech voices, and
decks move in and out through CSV. It runs on Freebuff Sites with Sign in with
Freebuff, D1 for data and R2 for images, and everything is scoped to the
signed-in user.

## Spaced repetition (FSRS)

Scheduling uses FSRS-4.5, the open algorithm behind Anki's FSRS support
(`src/shared/fsrs.ts`, shared by the Worker and the app). Every card carries a
memory model — difficulty (1..10, mean-reverting) and stability (days, the
half-life of recall) — and each rating updates both from the forgetting curve.
Intervals are then chosen so predicted recall at review time hits the target
retention (90% by default), rather than a fixed doubling rule.

- Flashcards grades each card **Again / Hard / Good / Easy** (keys 1–4), each
  button previewing the interval it would set. A missed card is re-queued so it
  returns before the round ends, and Backspace undoes a grade.
- Study order is risk-weighted: most-overdue and least-likely-to-recall first.
- Learn and Match record right/wrong, mapped to Again and Good.
- **Target retention** is a real setting (Settings → Scheduler, 80–97%): it
  drives every interval the engine computes, on the server and in the grade
  previews. Lower 80% spreads cards apart; 97% is relentless squeezing.
- `GET /api/forecast` projects the review workload 30 days ahead and reports
  predicted recall and how many cards are slipping below target.

`node --experimental-strip-types scripts/fsrs-check.ts` runs numeric sanity
checks over the scheduler (20 assertions).

## Gamification

Studying earns **XP** — 10 per correct card, +5 for a perfect round — recorded
on each session and summed into lifetime and daily totals
(`users.xp`, sessions.xp). Levels go up every 100 XP and show in the header.

- The home page tracks a **daily XP goal** (Settings, 10–500, default 40) with
  a progress bar and an "Earn XP" shortcut.
- Flashcards and Learn play with **hearts**: five lives per round, one lost per
  miss, and the round ends early when they run out (the summary says so).
- Correct answers in a row build a **combo** blaze in the round HUD; the best
  combo of the round is displayed in the summary.
- Learn mixes in **type-the-answer** questions: recall the term from the
  definition. Answers are normalised (case, accents, punctuation) and one typo
  in a word of four letters or more is forgiven (`src/app/lib/typing.ts`).
  Duolingo-style feedback strips show green/red with the model answer.

## Pronunciation

Flashcards can speak the term or definition with the Web Speech API — no
network, no key (`src/app/lib/speech.ts`): a Listen button plus an Auto toggle
(and the L key), which pronounces each card as it arrives. Auto is stored per
browser.

## CSV import/export

Decks move in and out as proper CSV (`routes/decks.ts`). Library imports a
`.csv` file (header optional, quoted cells with commas, quotes and newlines all
handled), and each deck's menu has Export CSV with a browsable friendly
filename. Small one-liner spreadsheets are fine.

Parsing in `parseCsv`/`toCsv` lives next to the routes so import and export
stay strictly inverse of each other.

The product name is `BRAND` in `src/shared/types.ts`; change it once.

## Run it

```sh
bun install
bun run dev        # http://localhost:5173 with local D1 and R2 (Miniflare)
bun run build      # dist/client (assets) + dist/study/index.js (Worker)
```

With no `FREEBUFF_CLIENT_ID`, the app runs its own email and password accounts:
sign up at `/signin`, and sessions are opaque tokens stored hashed in D1 with
an httpOnly cookie. Passwords are PBKDF2-SHA256, never stored in plain text.
New accounts are seeded with the starter decks only — no fabricated progress:
a fresh account starts at 0% mastery, streak 0 and XP 0 across the deck list.
Settings can rest

## Where things are

- `src/worker/` is the Hono API. `db.ts` owns the schema (created on first
  request) and the streak maths, `seed.ts` the starter decks, `auth.ts` the
  password sessions and Freebuff integration, `routes/auth.ts` sign-up and
  sign-in,
  `routes/decks.ts` decks, cards, images, CSV import/export and session
  recording (where FSRS reschedules each card and XP is awarded),
  `routes/account.ts` the profile, stats, preferences and the review forecast.
- `src/app/` is the React app. `pages/Flashcards.tsx`, `Learn.tsx` and
  `Match.tsx` are the study modes; each ends in `components/Summary.tsx`,
  which records the session once. `components/GameHud.tsx` holds the hearts
  and combo HUD, `components/ui.tsx` the primitives.
- `src/styles.css` holds the design tokens. Everything rounded is a squircle
  via `corner-shape`; true circles use the `round` class.

## Security notes

Every `/api/*` route requires a signed-in user and scopes queries by
`owner_sub`. Mutations must be same-origin. Images are addressed by card row,
never by R2 key. Personalised responses are `Cache-Control: private, no-store`.
