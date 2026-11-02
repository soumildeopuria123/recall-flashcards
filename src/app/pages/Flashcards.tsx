import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { Combo, Hearts } from '../components/GameHud'
import { StudyFrame } from '../components/Shell'
import { Summary } from '../components/Summary'
import { Spinner } from '../components/ui'
import { useDeck, useMe } from '../lib/api'
import { autoSpeak, setAutoSpeak, speak, speechSupported, stopSpeaking } from '../lib/speech'
import { cx } from '../lib/cx'
import type { Card, SessionResult } from '../../shared/types'
import { buildStudyQueue, formatInterval, GRADE_LABELS, previewIntervals, recallToday, type Grade } from '../../shared/fsrs'

const GRADE_TONE: Record<Grade, string> = {
  1: 'border-danger/30 bg-danger-soft text-danger',
  2: 'border-warning/30 bg-warning-soft text-warning',
  3: 'border-success/30 bg-success-soft text-success',
  4: 'border-accent/30 bg-accent-soft text-accent',
}

const HEARTS = 5

export function Flashcards() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useDeck(id)
  // Interval previews follow the retention target you set in Settings.
  const { data: me } = useMe()
  const target = (me?.prefs.retention ?? 90) / 100
  const [round, setRound] = useState(0)
  // Study order is risk-weighted: most-overdue and least-likely-to-recall first.
  const order = useMemo(() => (data ? buildStudyQueue(data.cards) : []), [data, round])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<SessionResult[]>([])
  const [direction, setDirection] = useState<1 | -1>(1)
  const [startedAt, setStartedAt] = useState(Date.now())
  // Grade 1 cards are re-queued so they are met again before the round ends.
  const [requeue, setRequeue] = useState<Card[]>([])
  const [auto, setAuto] = useState(autoSpeak)
  const voice = speechSupported()

  // Duolingo-style lives and combo: a lapse costs one heart, correct cards in
  // a row build the blaze. Out of hearts, the round ends early.
  const [hearts, setHearts] = useState(HEARTS)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)

  const queue = useMemo(() => [...order.slice(index), ...requeue], [order, requeue, index])
  const card: Card | undefined = queue[0]
  const remaining = queue.length
  const done = Boolean(data) && (remaining === 0 || hearts <= 0)

  const previews = useMemo(() => (card ? previewIntervals(card.progress, Date.now(), target) : null), [card, target])
  const recall = card ? recallToday(card.progress) : null

  function answer(grade: Grade) {
    if (!card) return
    const correct = grade >= 3
    setDirection(correct ? 1 : -1)
    setResults((r) => [...r, { cardId: card.id, correct, rating: grade }])
    setFlipped(false)
    if (correct) {
      setCombo((c) => {
        const next = c + 1
        setMaxCombo((m) => Math.max(m, next))
        return next
      })
    } else {
      setCombo(0)
      setHearts((h) => h - 1)
      // Anything missed comes back later in the round, once or twice at most.
      setRequeue((q) => (q.filter((c) => c.id === card.id).length < 2 ? [...q, card] : q))
    }
    setIndex((i) => i + 1)
  }

  function undo() {
    const last = results[results.length - 1]
    if (!last) return
    setResults((r) => r.slice(0, -1))
    setRequeue((q) => q.filter((c) => c.id !== last.cardId))
    if (!last.correct) setHearts((h) => Math.min(HEARTS, h + 1))
    setIndex((i) => Math.max(0, i - 1))
    setFlipped(false)
  }

  function restart() {
    setRound((r) => r + 1)
    setIndex(0)
    setResults([])
    setRequeue([])
    setFlipped(false)
    setStartedAt(Date.now())
    setHearts(HEARTS)
    setCombo(0)
    setMaxCombo(0)
  }

  // Auto-pronounce: the term is spoken as each card arrives.
  const cardId = card?.id
  useEffect(() => {
    if (!cardId || !auto) return
    if (card && cardId === card.id) speak(card.term)
    return () => stopSpeaking()
  }, [cardId, auto, card])

  // Leaving the round clears any audio left over from the previous card.
  useEffect(() => () => stopSpeaking(), [])

  function toggleAuto() {
    setAuto((v) => {
      setAutoSpeak(!v)
      return !v
    })
  }

  function listen() {
    if (card) speak(flipped ? card.definition : card.term)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return
      if (e.key === ' ' || e.key === 'Enter') (e.preventDefault(), setFlipped((f) => !f))
      const n = Number(e.key)
      if (n >= 1 && n <= 4) answer(n as Grade)
      if (e.key === 'Backspace') undo()
      if (e.key.toLowerCase() === 'l' && voice) listen()
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

  const known = results.filter((r) => r.correct).length

  return (
    <StudyFrame
      title={data.deck.title}
      progress={results.length + remaining ? results.length / (results.length + remaining) : 0}
      onExit={() => navigate(`/decks/${id}`)}
      right={!done && <span className="text-[13px] tabular-nums text-muted">{remaining} left</span>}
    >
      {done ? (
        <Summary deckId={data.deck.id} mode="flashcards" results={results} startedAt={startedAt} onAgain={restart} outOfHearts={hearts <= 0} extra={maxCombo >= 3 ? <p className="mt-2 text-[13.5px] text-muted">Best combo: {maxCombo} in a row</p> : undefined} />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span className="inline-flex h-7 items-center rounded-[9px] bg-danger-soft px-2.5 tabular-nums text-danger">{results.length - known} still learning</span>
            <div className="flex items-center gap-3">
              <Combo n={combo} />
              <Hearts left={hearts} />
            </div>
            <span className="inline-flex h-7 items-center rounded-[9px] bg-success-soft px-2.5 tabular-nums text-success">{known} known</span>
          </div>

          <div className="relative mt-5 flex-1 [perspective:1600px]" style={{ minHeight: 360 }}>
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              {card && (
                <motion.button
                  key={card.id + index}
                  type="button"
                  custom={direction}
                  onClick={() => setFlipped((f) => !f)}
                  variants={{ exit: (d: number) => ({ opacity: 0, x: d * 160, rotate: d * 4, transition: { duration: 0.3 } }) }}
                  initial={{ opacity: 0, x: 0, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit="exit"
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="preserve-3d absolute inset-0 w-full cursor-pointer text-left"
                  aria-label="Flip card"
                >
                  <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="preserve-3d relative size-full">
                    <Face label="Term" className="bg-surface">
                      {card.hasImage && <img src={`/api/decks/${data.deck.id}/cards/${card.id}/image`} alt="" className="mb-6 max-h-[180px] rounded-[16px] object-cover" />}
                      <p className="text-balance text-center text-[32px] font-bold tracking-tight sm:text-[40px]">{card.term}</p>
                      {card.progress.stability !== null && recall !== null && (
                        <span className="absolute bottom-5 text-[12px] text-faint">
                          Held for {formatInterval(card.progress.stability)} · recall {Math.round(100 * recall)}%
                        </span>
                      )}
                    </Face>
                    <Face label="Definition" className="bg-fg text-white [transform:rotateY(180deg)]">
                      <p className="text-balance text-center text-[22px] font-medium leading-snug sm:text-[28px]">{card.definition}</p>
                    </Face>
                  </motion.div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Four FSRS grades. Each button shows the interval it would set,
              so you schedule by how well you actually recall, not a guess. */}
          <div className="mt-6 grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as const).map((grade) => (
              <button
                key={grade}
                type="button"
                onClick={() => answer(grade)}
                className={cx('flex h-16 flex-col items-center justify-center gap-0.5 rounded-[16px] border-2 transition-colors', GRADE_TONE[grade])}
              >
                <span className="text-[14px] font-semibold">{GRADE_LABELS[grade]}</span>
                <span className="text-[11.5px] tabular-nums opacity-80">{previews ? formatInterval(previews[grade]) : '—'}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={undo}
              disabled={results.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40"
            >
              <Undo2 className="size-4" />
              Undo
            </button>
            {voice && (
              <>
                <button type="button" onClick={listen} className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-fg">
                  <Volume2 className="size-4" />
                  Listen
                </button>
                <button
                  type="button"
                  onClick={toggleAuto}
                  aria-pressed={auto}
                  title={auto ? 'Auto-pronounce on: terms are spoken as they arrive' : 'Auto-pronounce off'}
                  className={cx('inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium transition-colors hover:bg-surface', auto ? 'text-accent' : 'text-muted hover:text-fg')}
                >
                  {auto ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  Auto
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
            >
              <RotateCcw className="size-4" />
              Flip
            </button>
          </div>
          <p className="mt-1 text-center text-[12.5px] text-faint">Space flips · 1–4 grades · L listens · Backspace undoes</p>
        </div>
      )}
    </StudyFrame>
  )
}

function Face({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx('backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-[28px] p-8 shadow-float sm:p-12', className)}>
      <span className="absolute left-6 top-5 text-[12.5px] font-medium opacity-50">{label}</span>
      {children}
    </div>
  )
}
