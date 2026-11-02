// Quick numeric sanity check for the FSRS engine. Run: node --experimental-strip-types scripts/fsrs-check.ts
import { DAY, formatInterval, initialState, intervalFor, nextState, retrievability, stateOf } from '../src/shared/fsrs.ts'

const fmt = (n: number) => n.toFixed(3)
let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

// 1. Forgetting curve is monotonically decreasing and starts near 1.
const s0 = 10
const r0 = retrievability(0, s0)
const r5 = retrievability(5, s0)
const r20 = retrievability(20, s0)
check('R(0) ≈ 1', Math.abs(r0 - 1) < 0.001, fmt(r0))
check('R decays with time', r0 > r5 && r5 > r20, `${fmt(r0)} > ${fmt(r5)} > ${fmt(r20)}`)

// 2. Retention target: at t = S, recall should equal the 90% target.
const rAtS = retrievability(s0, s0)
check('R(S) = 90% target', Math.abs(rAtS - 0.9) < 0.005, fmt(rAtS))

// 3. intervalFor is the inverse of the curve: reviewing at that interval
//    should land recall back on the target.
const iv = intervalFor(s0)
check('intervalFor(S) ≈ S', Math.abs(iv - s0) / s0 < 0.05, fmt(iv))

// 4. A new card graded Good should get a longer interval than graded Hard.
const good0 = initialState(3)
const hard0 = initialState(2)
check('Good stability > Hard stability', good0.stability > hard0.stability, `${fmt(good0.stability)} vs ${fmt(hard0.stability)}`)
check('Easy stability > Good stability', initialState(4).stability > good0.stability)

// 5. Success grows stability, a lapse shrinks it.
const grown = nextState(good0, 3, 5)
const lapsed = nextState(good0, 1, 5)
check('success grows stability', grown.stability > good0.stability, `${fmt(good0.stability)} -> ${fmt(grown.stability)}`)
check('lapse shrinks stability', lapsed.stability < good0.stability, `${fmt(good0.stability)} -> ${fmt(lapsed.stability)}`)
check('lapse stability floor 0.5d', lapsed.stability >= 0.5, fmt(lapsed.stability))

// 6. Difficulty stays clamped to 1..10 across many harsh ratings.
let hard = initialState(1)
for (let i = 0; i < 30; i++) hard = nextState(hard, 1, 1)
check('difficulty clamped ≤ 10 after many lapses', hard.difficulty <= 10 + 1e-9, fmt(hard.difficulty))
let easy = initialState(4)
for (let i = 0; i < 30; i++) easy = nextState(easy, 4, 30)
check('difficulty clamped ≥ 1 after many easy passes', easy.difficulty >= 1 - 1e-9, fmt(easy.difficulty))

// 7. A mature card schedules far out; intervals never run away.
const mature = nextState(nextState(good0, 3, 3), 3, 10)
check('mature card schedules > 1 week', intervalFor(mature.stability) > 7, fmt(intervalFor(mature.stability)))
check('interval capped at 36500d', intervalFor(50_000) <= 36_500, fmt(intervalFor(50_000)))

// 8. stateOf treats missing data as a new card.
check('stateOf(null) is null', stateOf({ stability: null, difficulty: null }) === null)
check('stateOf uses default difficulty', stateOf({ stability: 4, difficulty: null })?.difficulty === 5)

// 9. Human interval labels.
check('formatInterval(0) is minutes', formatInterval(0) === '10 min')
check('formatInterval(3) is days', formatInterval(3) === '3 d')
check('formatInterval(90) is months', formatInterval(90) === '3 mo')
check('formatInterval(500) is years', formatInterval(500) === '1.4 y')

// 10. Simulation: a card reviewed "Good" every interval should keep recall
//     hovering near the 90% target rather than decaying to zero.
let sim = initialState(3)
let day = 0
for (let i = 0; i < 5; i++) {
  const step = intervalFor(sim.stability)
  const recall = retrievability(step, sim.stability)
  if (i === 4) check('sustained review keeps recall near target', Math.abs(recall - 0.9) < 0.02, fmt(recall))
  sim = nextState(sim, 3, step)
  day += step
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
