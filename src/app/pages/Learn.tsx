import { AnimatePresence, motion } from 'motion/react'
import { Check, CornerDownLeft, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { Combo, Hearts } from '../components/GameHud'
import { StudyFrame } from '../components/Shell'
import { Summary, shuffle } from '../components/Summary'
import { Button, Spinner } from '../components/ui'
import { useDeck } from '../lib/api'
import { checkTyping, isTypable } from '../lib/typing'
import { cx } from '../lib/cx'
import type { Card, SessionResult } from '../../shared/types'

const ROUND = 10
const HEARTS = 5

/** Choice questions give four definitions; typing questions recall the term. */
type Question =
  | { card: Card; mode: 'choice'; options: string[]; answer: number }
  | { card: Card; mode: 'type' }

function buildRound(cards: Card[]): Question[] {
  // Weak and due cards first, then the rest, so each round targets what you
  // are most likely to forget.
  const now = Date.now()
  const prioritised = [...cards].sort((a, b) => {
    const dueA = a.progress.nextDue === null || a.progress.nextDue <= now ? 0 : 1
    const dueB = b.progress.nextDue === null || b.progress.nextDue <= now ? 0 : 1
    return dueA - dueB || a.progress.mastery - b.progress.mastery || Math.random() - 0.5
  })
  const chosen = shuffle(prioritised.slice(0, Math.min(ROUND, cards.length)))
  return chosen.map((card) => {
    // Duolingo-style typing: roughly one question in three is recall typed out.
    if (Math.random() < 0.35 && isTypable(card.term)) return { card, mode: 'type' as const }
    const distractors = shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3)
    const options = shuffle([card, ...distractors].map((c) => c.definition))
    return { card, mode: 'choice' as const, options, answer: options.indexOf(card.definition) }
  })
}

export function Learn() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useDeck(id)
  const [round, setRound] = useState(0)
  const questions = useMemo(() => (data ? buildRound(data.cards) : []), [data, round])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  // The just-answered question, kept while the feedback strip is on screen.
  const [outcome, setOutcome] = useState<{ correct: boolean; model: string } | null>(null)
  const [results, setResults] = useState<SessionResult[]>([])
  const [startedAt, setStartedAt] = useState(Date.now())

  // Lives and combo, Duolingo-style: a miss costs a heart, streaks blaze, and
  // the round ends early once the hearts run out.
  const [hearts, setHearts] = useState(HEARTS)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)

  const question = questions[index]
  const done = Boolean(data) && (index >= questions.length || hearts <= 0)

  function grade(correct: boolean, cardId: string, model: string) {
    setOutcome({ correct, model })
    setResults((r) => [...r, { cardId, correct }])
    if (correct) {
      setCombo((c) => {
        const next = c + 1
        setMaxCombo((m) => Math.max(m, next))
        return next
      })
    } else {
      setCombo(0)
      setHearts((h) => h - 1)
    }
    window.setTimeout(
      () => {
        setPicked(null)
        setTyped('')
        setOutcome(null)
        setIndex((i) => i + 1)
      },
      correct ? 800 : 1700,
    )
  }

  function pick(option: number) {
    if (picked !== null || !question || question.mode !== 'choice') return
    setPicked(option)
    grade(option === question.answer, question.card.id, question.options[question.answer])
  }

  function submitTyping() {
    if (outcome !== null || !question || question.mode !== 'type') return
    const correct = checkTyping(question.card.term, typed)
    grade(correct, question.card.id, question.card.term)
  }

  function restart() {
    setRound((r) => r + 1)
    setIndex(0)
    setPicked(null)
    setTyped('')
    setOutcome(null)
    setResults([])
    setStartedAt(Date.now())
    setHearts(HEARTS)
    setCombo(0)
    setMaxCombo(0)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return
      if (question?.mode === 'choice') {
        const n = Number(e.key)
        if (n >= 1 && n <= 4) pick(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (isLoading || !data) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    )
  }

  const score = results.filter((r) => r.correct).length

  return (
    <StudyFrame
      title={data.deck.title}
      progress={questions.length ? index / questions.length : 0}
      onExit={() => navigate(`/decks/${id}`)}
      right={!done && <span className="text-[13px] tabular-nums text-muted">{score} correct</span>}
    >
      {done ? (
        <Summary deckId={data.deck.id} mode="learn" results={results} startedAt={startedAt} onAgain={restart} outOfHearts={hearts <= 0} extra={maxCombo >= 3 ? <p className="mt-2 text-[13.5px] text-muted">Best combo: {maxCombo} in a row</p> : undefined} />
      ) : (
        <AnimatePresence mode="wait">
          {question && (
            <motion.div key={question.card.id + index} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex flex-1 flex-col">
              <div className="flex items-center justify-between text-[13px] font-medium">
                <span className="text-[12.5px] font-medium text-faint">
                  {index + 1} of {questions.length}
                </span>
                <Combo n={combo} />
                <Hearts left={hearts} />
              </div>

              <div className="mt-3 flex min-h-[200px] flex-col items-center justify-center rounded-[28px] bg-surface p-8 shadow-float sm:min-h-[240px]">
                {question.card.hasImage && <img src={`/api/decks/${data.deck.id}/cards/${question.card.id}/image`} alt="" className="max-h-[130px] rounded-[16px] object-cover" />}
                {question.mode === 'type' ? (
                  <>
                    <p className="text-balance text-center text-[24px] font-semibold leading-snug sm:text-[28px]">{question.card.definition}</p>
                    <p className="mt-3 text-[14px] text-muted">Type the term</p>
                  </>
                ) : (
                  <>
                    <p className="text-balance text-center text-[30px] font-bold tracking-tight sm:text-[38px]">{question.card.term}</p>
                    <p className="mt-3 text-[14px] text-muted">Choose the definition</p>
                  </>
                )}
              </div>

              {question.mode === 'type' ? (
                <form
                  className="mt-4 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitTyping()
                  }}
                >
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={outcome !== null}
                    className={cx(
                      'h-14 w-full rounded-[18px] border-2 bg-surface px-5 text-[18px] font-medium shadow-card outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-[3px] focus:ring-accent/15',
                      outcome?.correct === true && 'border-success bg-success-soft',
                      outcome?.correct === false && 'border-danger bg-danger-soft',
                      !outcome && 'border-transparent',
                    )}
                    aria-label="Type the term"
                  />
                  {outcome === null && (
                    <Button variant="primary" type="submit" className="h-12 text-[15px]" disabled={!typed.trim()}>
                      Check
                      <CornerDownLeft />
                    </Button>
                  )}
                </form>
              ) : (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {question.options.map((option, i) => {
                    const isAnswer = i === question.answer
                    const isPicked = picked === i
                    const state = picked === null ? 'idle' : isAnswer ? 'correct' : isPicked ? 'wrong' : 'dim'
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pick(i)}
                        disabled={picked !== null}
                        className={cx(
                          'flex min-h-[72px] items-center gap-3 rounded-[18px] border-2 bg-surface px-4 py-3 text-left text-[15px] leading-snug shadow-card transition-[border-color,background-color,transform,opacity] duration-200',
                          state === 'idle' && 'border-transparent hover:border-accent/50 hover:bg-accent-soft/40 active:scale-[0.99]',
                          state === 'correct' && 'border-success bg-success-soft',
                          state === 'wrong' && 'border-danger bg-danger-soft',
                          state === 'dim' && 'border-transparent opacity-50',
                        )}
                      >
                        <span className={cx('grid size-7 shrink-0 place-items-center rounded-[9px] text-[12.5px] font-semibold', state === 'correct' ? 'bg-success text-white' : state === 'wrong' ? 'bg-danger text-white' : 'bg-surface-2 text-muted')}>
                          {state === 'correct' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : i + 1}
                        </span>
                        <span className="flex-1">{option}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Feedback strip, Duolingo-style: green when right, the model
                  answer in red when wrong. */}
              {outcome && (
                <div className={cx('mt-4 flex items-center gap-2.5 rounded-[18px] px-4 py-3.5 text-[14.5px] font-medium', outcome.correct ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                  {outcome.correct ? (
                    <>
                      <Check className="size-5 shrink-0" />
                      <span>Nice!</span>
                    </>
                  ) : (
                    <>
                      <X className="size-5 shrink-0" />
                      <span>
                        Try again — the answer is <strong className="font-semibold">{outcome.model}</strong>
                      </span>
                    </>
                  )}
                </div>
              )}
              {!outcome && <p className="mt-4 text-center text-[12.5px] text-faint">{question.mode === 'type' ? 'Press Enter to check' : 'Press 1 to 4 to answer'}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </StudyFrame>
  )
}
