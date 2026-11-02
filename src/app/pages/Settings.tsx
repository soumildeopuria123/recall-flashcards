import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import { Avatar, Badge, Button, ConfirmDialog, useToast } from '../components/ui'
import { api, useApiMutation, useMe } from '../lib/api'
import { SignOutButton } from './SignIn'

export function Settings() {
  const { data: me } = useMe()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null)
  // Draft values survive across renders while the mutation is in flight;
  // null means "not touched yet, show the saved value".
  const [draft, setDraft] = useState<number | null>(null)
  const [goalDraft, setGoalDraft] = useState<number | null>(null)
  const keys = ['me', 'deck', 'decks', 'forecast']
  const retention = draft ?? me?.prefs.retention ?? 90
  const goal = goalDraft ?? me?.prefs.goal ?? 40
  const savePrefs = useApiMutation((value: { retention?: number; goal?: number }) => api('/account/prefs', { method: 'PUT', json: value }), keys, {
    onSuccess: () => toast('Scheduler updated'),
  })
  const reset = useApiMutation(() => api('/account/reset', { method: 'POST' }), ['me', 'decks', 'deck', 'stats'], {
    onSuccess: () => {
      setConfirm(null)
      toast('Sample decks restored')
    },
  })
  const clear = useApiMutation(() => api('/account/data', { method: 'DELETE' }), keys, {
    onSuccess: () => {
      setConfirm(null)
      toast('Library cleared')
    },
  })
  // The slider paths stay inside the FSRS engine's sane 80–97% band.
  function commit(value: number) {
    setDraft(value)
    savePrefs.mutate({ retention: value })
  }
  function commitGoal(value: number) {
    const next = Math.min(500, Math.max(10, value))
    setGoalDraft(next)
    savePrefs.mutate({ goal: next })
  }
  if (!me) return null

  return (
    <div className="mx-auto max-w-[640px]">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">Settings</h1>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Scheduler</h2>
        <div className="mt-3 rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-medium">Target retention</p>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-muted">
                Predicted recall for each card when it next comes up. Higher means harder, tighter reviews; lower stretches the intervals. 90% is the recommended default.
              </p>
            </div>
            <span className={`text-[20px] font-semibold tabular-nums ${draft !== null && draft !== me.prefs.retention ? 'text-accent' : ''}`}>{retention}%</span>
          </div>
          <input
            type="range"
            min={80}
            max={97}
            step={1}
            value={retention}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
            onBlur={(e) => Number(e.target.value) !== me.prefs.retention && commit(Number(e.target.value))}
            className="mt-3 w-full accent-accent"
            aria-label="Target retention"
          />
          <div className="flex justify-between text-[11.5px] text-faint tabular-nums">
            <span>80% · relaxed</span>
            <span>90% · default</span>
            <span>97% · relentless</span>
          </div>
        </div>
        <div className="mt-3 rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-medium">Daily XP goal</p>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-muted">One small round is roughly 40–60 XP. Hit it every day to keep the streak burning.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="icon-sm" aria-label="Lower the goal" disabled={goal <= 10 || savePrefs.isPending} onClick={() => commitGoal(goal - 10)}>
                <Minus />
              </Button>
              <span className={`w-14 text-center text-[14.5px] font-semibold tabular-nums ${goalDraft !== null && goalDraft !== me.prefs.goal ? 'text-accent' : ''}`}>{goal}</span>
              <Button size="icon-sm" aria-label="Raise the goal" disabled={goal >= 500 || savePrefs.isPending} onClick={() => commitGoal(goal + 10)}>
                <Plus />
              </Button>
            </div>
          </div>
        </div>
        {savePrefs.error && <p className="mt-2 text-[13px] text-danger">{savePrefs.error.message}</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Account</h2>
        <div className="mt-3 flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
          <Avatar name={me.user.name ?? me.user.email ?? 'You'} hue={250} src={me.user.picture} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{me.user.name ?? 'Signed in'}</p>
            {me.user.email && <p className="truncate text-[13px] text-muted">{me.user.email}</p>}
          </div>
          {me.capabilities.auth === 'freebuff' ? (
            <form method="post" action="/auth/freebuff/signout">
              <input type="hidden" name="returnTo" value="/" />
              <Button type="submit">Sign out</Button>
            </form>
          ) : (
            <SignOutButton />
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Connections</h2>
        <ul className="mt-3 divide-y divide-line rounded-card bg-surface shadow-card">
          {[
            ['Database', me.capabilities.database, 'D1 via the DB binding'],
            ['Card images', me.capabilities.files, 'R2 via the FILES binding'],
            ['Sign in with Freebuff', me.capabilities.auth === 'freebuff', 'FREEBUFF_CLIENT_ID'],
          ].map(([label, ok, detail]) => (
            <li key={label as string} className="flex h-13 items-center gap-3 px-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{label}</span>
                <span className="block truncate text-[12px] text-faint">{detail}</span>
              </span>
              <Badge tone={ok ? 'success' : 'neutral'} dot>
                {ok ? 'Connected' : 'Not connected'}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Data</h2>
        <div className="mt-3 divide-y divide-line rounded-card bg-surface shadow-card">
          <div className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Restore sample decks</span>
              <span className="block text-[12.5px] text-muted">Replaces your library with the starter decks.</span>
            </span>
            <Button onClick={() => setConfirm('reset')}>Restore</Button>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Clear library</span>
              <span className="block text-[12.5px] text-muted">Deletes every deck, card and session. This cannot be undone.</span>
            </span>
            <Button variant="danger" onClick={() => setConfirm('clear')}>
              Clear
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} onConfirm={() => reset.mutate(undefined)} loading={reset.isPending} title="Restore sample decks?" description="Your current decks and progress are replaced." confirmLabel="Restore" />
      <ConfirmDialog open={confirm === 'clear'} onClose={() => setConfirm(null)} onConfirm={() => clear.mutate(undefined)} loading={clear.isPending} title="Clear your library?" description="Every deck, card, image and session is deleted." confirmLabel="Clear everything" />
    </div>
  )
}
