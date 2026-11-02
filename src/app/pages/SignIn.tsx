import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowRight, Brain, Database, Flame, Languages, Loader2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

import { Logo } from '../components/Shell'
import { Mascot } from '../components/Mascot'
import { Spinner } from '../components/ui'

type AuthMode = 'freebuff' | 'password' | 'off'
type AuthStatus = { mode: AuthMode; database: boolean; files: boolean }
type SignedInUser = { sub: string; name?: string; email?: string; picture?: string }

const features = [
  { icon: Brain, title: 'Reviews that land before you forget', body: 'FSRS scheduling tunes every card to your own memory, not a fixed calendar.' },
  { icon: Flame, title: 'Streaks, hearts and XP', body: 'Daily goals and combo bonuses make a five-minute habit easy to keep.' },
  { icon: Languages, title: '23 starter language decks', body: 'Spanish, Japanese, Arabic, Polish and twenty more, ready to study today.' },
]

function useAuthStatus() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/auth/status')
      .then((response) => (response.ok ? (response.json() as Promise<AuthStatus>) : Promise.reject(new Error(String(response.status)))))
      .then((body: AuthStatus) => alive && setStatus(body))
      .catch(() => alive && setStatus({ mode: 'off', database: false, files: false }))
    return () => {
      alive = false
    }
  }, [])
  return status
}

/** Where to land after signing in: the page that asked for it, or the library. */
function destination(): string {
  const requested = new URLSearchParams(window.location.search).get('returnTo')
  const path = requested ?? `${window.location.pathname}${window.location.search}`
  return path.startsWith('/') && !path.startsWith('/signin') ? path : '/'
}

export function SignIn({ user }: { user?: SignedInUser }) {
  const status = useAuthStatus()
  const returnTo = encodeURIComponent(destination())

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <Link to="/" className="text-[13.5px] font-medium text-muted transition-colors hover:text-fg">
          Back to library
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-10 px-5 pb-16 pt-2 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div className="flex items-end gap-3">
            <Mascot mood="happy" size={92} bob={false} />
            <span className="mb-2 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-medium text-accent">Pip is waiting</span>
          </div>
          <h1 className="mt-4 text-balance text-[38px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[48px]">Remember what you learn</h1>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
            Flashcards, quizzes and matching games that schedule themselves around what you forget. Your library follows you to every device you sign in from.
          </p>

          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface text-accent shadow-card">
                  <Icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[14.5px] font-semibold tracking-tight">{title}</p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-card border border-line bg-surface p-7 shadow-float sm:p-8"
        >
          {user ? <SignedIn user={user} status={status} /> : <SignedOut status={status} returnTo={returnTo} />}
        </motion.section>
      </main>

      <footer className="mx-auto w-full max-w-[1120px] px-5 pb-8 sm:px-8">
        <p className="flex items-center gap-1.5 text-[12.5px] text-faint">
          <ShieldCheck className="size-3.5" />
          Your decks, progress and images stay attached to your account — nothing is shared between users.
        </p>
      </footer>
    </div>
  )
}

function SignedOut({ status, returnTo }: { status: AuthStatus | null; returnTo: string }) {
  if (!status) {
    return (
      <div className="grid h-40 place-items-center">
        <Spinner />
      </div>
    )
  }

  if (status.mode === 'off') {
    return (
      <div>
        <span className="grid size-11 place-items-center rounded-[13px] bg-surface-2 text-muted">
          <Database className="size-5" />
        </span>
        <h2 className="mt-4 text-[20px] font-semibold tracking-tight">Accounts are not set up yet</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          This build has no database bound, so there is nowhere to keep an account. Add the D1 binding named DB and reload.
        </p>
      </div>
    )
  }

  if (status.mode === 'freebuff') {
    return (
      <div>
        <h2 className="text-[21px] font-semibold tracking-tight">Sign in to Recall</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">One click with your Freebuff account. No password to remember, which is the point.</p>

        <a
          href={`/auth/freebuff/signin?returnTo=${returnTo}`}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-control bg-fg px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#2a2838]"
        >
          <span className="grid size-5 place-items-center rounded-[6px] bg-white text-[11px] font-bold text-fg">F</span>
          Sign in with Freebuff
          <ArrowRight className="size-4" />
        </a>

        <p className="mt-4 text-[12.5px] leading-relaxed text-faint">We only receive your name, email and avatar from Freebuff. Returning here later picks up exactly where you left off.</p>
      </div>
    )
  }

  return <Credentials destination={returnTo} />
}

function Credentials({ destination }: { destination: string }) {
  const client = useQueryClient()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'signup' ? { name, email, password } : { email, password }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'Something went wrong. Try again.')
        setPending(false)
        return
      }
      await client.invalidateQueries({ queryKey: ['me'] })
      window.location.assign(decodeURIComponent(destination))
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setPending(false)
    }
  }

  return (
    <div>
      <div className="flex rounded-control bg-surface-2 p-1 text-[13px] font-medium">
        {(['signin', 'signup'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value)
              setError(null)
            }}
            className={`h-9 flex-1 rounded-[10px] transition-colors ${mode === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'}`}
          >
            {value === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <h2 className="mt-5 text-[21px] font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Start your library'}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        {mode === 'signin' ? 'Pick up your streak, XP and review schedule right where you left it.' : 'One account keeps your decks, progress and images in sync everywhere.'}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === 'signup' && (
          <Field label="Name" hint="optional">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Alex Morgan"
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Email">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? '8 characters or more' : undefined}>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            className={inputClass}
          />
        </Field>

        {error && <p className="rounded-control bg-danger-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-danger">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-accent text-[14.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
          {!pending && <ArrowRight className="size-4" />}
        </button>
      </form>

      <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Passwords are hashed with PBKDF2-SHA256. New accounts start with a set of sample decks you can delete.
      </p>
    </div>
  )
}

const inputClass =
  'h-11 w-full rounded-control border-2 border-transparent bg-surface-2 px-3.5 text-[14.5px] outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/15'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium text-muted">
        {label}
        {hint && <span className="text-[11.5px] font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
        window.location.assign('/signin')
      }}
      className={className ?? 'h-9 rounded-control border border-line px-3.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg'}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

function SignedIn({ user, status }: { user: SignedInUser; status: AuthStatus | null }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-[16px] font-semibold text-accent">
          {user.picture ? <img src={user.picture} alt="" className="size-full object-cover" /> : (user.name ?? 'You').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">{user.name ?? 'Signed in'}</p>
          {user.email && <p className="truncate text-[13px] text-muted">{user.email}</p>}
        </div>
      </div>

      <p className="mt-5 text-[13.5px] leading-relaxed text-muted">You are signed in, so your decks, XP and review schedule are already loaded. Pip has been keeping your streak warm.</p>

      <Link
        to="/"
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-accent px-4 text-[14.5px] font-medium text-white transition-opacity hover:opacity-90"
      >
        Open my library
        <ArrowRight className="size-4" />
      </Link>

      {status?.mode === 'freebuff' ? (
        <form method="post" action="/auth/freebuff/signout" className="mt-3">
          <input type="hidden" name="returnTo" value="/signin" />
          <button type="submit" className="h-10 w-full rounded-control border border-line text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            Sign out
          </button>
        </form>
      ) : (
        <SignOutButton className="mt-3 h-10 w-full rounded-control border border-line text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg" />
      )}
    </div>
  )
}

export function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-card bg-surface-2 text-muted">
          <Database className="size-5" />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-tight">Almost there</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{message}</p>
        <p className="mt-4 text-[13px] text-faint">In Freebuff, ask the agent to add D1 storage named DB and R2 storage named FILES, then deploy again.</p>
      </div>
    </div>
  )
}
