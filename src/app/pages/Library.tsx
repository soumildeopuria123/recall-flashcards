import { ArrowRight, FileUp, Plus, Upload, Zap } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { DeckCard } from '../components/DeckCard'
import { Mascot } from '../components/Mascot'
import { Button, Dialog, Field, Input, Skeleton, Textarea, useFieldId, useToast } from '../components/ui'
import { api, useApiMutation, useDecks, useMe } from '../lib/api'
import type { Deck } from '../../shared/types'

export function Library() {
  const { data: me } = useMe()
  const { data, isLoading } = useDecks()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const decks = data?.items ?? []
  const due = decks.reduce((n, d) => n + d.dueCount, 0)
  const next = decks.find((d) => d.dueCount > 0) ?? decks[0]
  const first = me?.user.name?.split(' ')[0]
  const hour = new Date().getHours()
  const xp = me?.xp
  const goalPct = xp ? Math.min(100, Math.round((xp.today / xp.goal) * 100)) : 0
  const isBrandNew = me?.streak === 0 && (xp?.total ?? 0) === 0

  const headerLine =
    due > 0
      ? isBrandNew
        ? `${due} cards ready to start`
        : `${due} ${due === 1 ? 'card is' : 'cards are'} due for review`
      : 'Nothing due. A good day to learn something new.'

  const nextDue = next?.dueCount > 0
  const nextDueCount = next?.dueCount ?? 0
  const nextCardCount = next?.cardCount ?? 0

  const heroLabel =
    nextDue
      ? isBrandNew
        ? 'Start here'
        : 'Continue where you left off'
      : 'Keep it fresh'

  const heroCountLine =
    nextDue
      ? isBrandNew
        ? `${nextCardCount} cards`
        : `${nextDueCount} cards due`
      : `${nextCardCount} cards`

  const heroMinutes = Math.max(2, Math.ceil((nextDueCount || nextCardCount) / 5))
  const heroTime = `, about ${heroMinutes} minutes`

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            {hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}
            {first ? `, ${first}` : ''}
          </h1>
          <p className="mt-1 text-[14.5px] text-muted">{headerLine}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setImporting(true)}>
            <Upload />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New deck
          </Button>
        </div>
      </div>

      {/* Daily goal, Duolingo-style: XP today against the level and the goal. */}
      {xp && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-card bg-surface p-4 shadow-card">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent">
            <Zap className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">
              Level {xp.level} · {xp.total} XP
              <span className="ml-2 text-[12.5px] font-normal text-muted tabular-nums">{xp.levelProgress}/100 to next level</span>
            </p>
            <div className="mt-2 h-2 max-w-[320px] overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">{xp.today >= xp.goal ? `Daily goal complete — ${xp.today} XP today. Nicely done!` : `${xp.today}/${xp.goal} XP toward today's goal`}</p>
          </div>
          {next && xp.today < xp.goal && (
            <Link to={`/decks/${next.id}/learn`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-accent px-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-deep">
              <Zap className="size-4" />
              Earn XP
            </Link>
          )}
        </div>
      )}

      {next && (
        <Link
          to={`/decks/${next.id}/learn`}
          className="group mt-6 flex items-center gap-5 rounded-card bg-fg p-5 text-white shadow-float transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-[18px] text-[20px] font-bold" style={{ background: `linear-gradient(135deg, hsl(${next.hue} 70% 60%), hsl(${next.hue + 30} 70% 48%)` }}>
            {next.title[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-white/60">{heroLabel}</span>
            <span className="mt-0.5 block truncate text-[18px] font-semibold">{next.title}</span>
            <span className="mt-0.5 block text-[13px] text-white/60">{heroCountLine}{heroTime}</span>
          </span>
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-white text-fg transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-4" />
          </span>
        </Link>
      )}

      <h2 className="mt-10 text-[14px] font-semibold text-muted">Your decks</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[168px] rounded-card" />)}
        {decks.map((d, i) => (
          <DeckCard key={d.id} deck={d} index={i} />
        ))}
        {!isLoading && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-[168px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="size-5" />
            <span className="text-[14px] font-medium">New deck</span>
          </button>
        )}
      </div>
      {data && decks.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-card bg-surface px-6 py-12 text-center shadow-card">
          <Mascot mood="sad" size={116} />
          <p className="mt-4 text-[15px] font-medium">Your library is empty</p>
          <p className="mt-1 max-w-sm text-[13.5px] text-muted">Pip has nothing to quiz you on yet. Create a deck and add a few cards to get started.</p>
        </div>
      )}

      <NewDeckDialog open={creating} onClose={() => setCreating(false)} />
      <ImportCsvDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}

function FieldInput(props: React.ComponentPropsWithoutRef<typeof Input>) {
  const id = useFieldId()
  return <Input id={id} {...props} />
}
function FieldTextarea(props: React.ComponentPropsWithoutRef<typeof Textarea>) {
  const id = useFieldId()
  return <Textarea id={id} {...props} />
}

export function parseCards(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term, ...rest] = line.split(/\s+[-–—:]\s+|\t/)
      return { term: term.trim(), definition: rest.join(' ').trim() }
    })
    .filter((c) => c.term && c.definition)
}

export function NewDeckDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cardsText, setCardsText] = useState('')
  const create = useApiMutation(
    () => api<{ deck: Deck }>('/decks', { method: 'POST', json: { title, description, cards: parseCards(cardsText) } }),
    ['decks', 'me'],
    {
      onSuccess: (result) => {
        toast('Deck created')
        onClose()
        setTitle('')
        setDescription('')
        setCardsText('')
        navigate(`/decks/${result.deck.id}`)
      },
    },
  )
  const parsed = parseCards(cardsText)

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate(undefined)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New deck"
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-deck" loading={create.isPending} disabled={!title.trim()}>
            Create{parsed.length > 0 ? ` with ${parsed.length} cards` : ''}
          </Button>
        </>
      }
    >
      <form id="new-deck" onSubmit={submit} className="grid gap-4">
        <Field label="Title">
          <FieldInput required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spanish essentials" />
        </Field>
        <Field label="Description">
          <FieldInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Cards" hint="One per line, term and definition separated by a dash, colon or tab. You can also add them later.">
          <FieldTextarea value={cardsText} onChange={(e) => setCardsText(e.target.value)} placeholder={'hola - hello\ngracias - thank you'} className="min-h-[120px] font-mono text-[13px]" />
        </Field>
        {create.error && <p className="text-[13px] text-danger">{create.error.message}</p>}
      </form>
    </Dialog>
  )
}

function ImportCsvDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const importDeck = useApiMutation(
    () => api<{ deck: Deck; cards: number }>('/decks/import', { method: 'POST', json: { title, csv } }),
    ['decks', 'me'],
    {
      onSuccess: (result) => {
        toast(`Imported ${result.cards} ${result.cards === 1 ? 'card' : 'cards'}`)
        onClose()
        setTitle('')
        setCsv('')
        setFileName('')
        navigate(`/decks/${result.deck.id}`)
      },
    },
  )

  async function pickFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    if (text.length > 2_000_000) {
      toast('That file is too large (2 MB max)', 'danger')
      return
    }
    setCsv(text)
    setFileName(file.name)
    // Default the deck title from the file name until the user types one.
    if (!title) setTitle(file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').slice(0, 80))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import CSV"
      description="Bring a deck in from Anki, Quizlet or a spreadsheet: a header or one row per card, term first."
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="import-csv" loading={importDeck.isPending} disabled={!csv}>
            Create deck
          </Button>
        </>
      }
    >
      <form id="import-csv" onSubmit={(e) => (e.preventDefault(), importDeck.mutate(undefined))} className="grid gap-4">
        <div className="rounded-card border-2 border-dashed border-line-strong p-6 text-center">
          <FileUp className="mx-auto size-5 text-faint" />
          <p className="mt-2 truncate text-[13.5px] font-medium">{fileName || 'Choose a .csv file'}</p>
          <p className="mt-0.5 text-[12px] text-faint">{csv ? 'Loaded — quote any cell that contains a comma or newline' : 'term,definition · quoted cells with commas are handled'}</p>
          <Button type="button" className="mt-3" onClick={() => fileInput.current?.click()}>
            {csv ? 'Choose another file' : 'Choose file'}
          </Button>
        </div>
        <Field label="Deck title">
          <FieldInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="From the file name" />
        </Field>
        {importDeck.error && <p className="text-[13px] text-danger">{importDeck.error.message}</p>}
      </form>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </Dialog>
  )
}
