# Deploying Recall

Recall is a Cloudflare Workers application: a Vite/React SPA served as static
assets with a Hono API running in the Worker, over D1 (SQLite) and R2
(object storage) bindings.

## Prerequisites

- Node.js or Bun
- A Cloudflare account (for `wrangler` deploys) **or** a Freebuff account
  (for Freebuff Sites deploys)

## Configuration files

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `wrangler.jsonc`| Worker entry (`src/worker/index.ts`), assets binding, D1 + R2   |
| `deploy.json`   | Freebuff Sites deployment manifest                             |
| `.dev.vars.example` | Template for local `.dev.vars` (auth dev variables)       |

## Local development

```bash
bun install
cp .dev.vars.example .dev.vars   # fill in the dev auth variables
bun run dev                      # Vite dev server + local Worker bindings
```

Local D1 and R2 bindings come from `wrangler.jsonc`. The local D1 database is
named `study`; manage it with:

```bash
npx wrangler d1 execute study --local --file path/to.sql
```

## Typecheck

```bash
bun run typecheck   # tsc --noEmit
```

## Deploying to Cloudflare directly

1. Create a D1 database and R2 bucket in your Cloudflare account.
2. Set the real `database_id` in `wrangler.jsonc` and, if renamed, update the
   binding names (`DB`, `FILES`) to match `src/worker/env.ts`.
3. Build and deploy:

```bash
bun run build
npx wrangler deploy
```

The FSRS algorithm runs entirely in the Worker — no external services or API
keys are required at runtime.

## Deploying with Freebuff Sites

1. Provision storage for the site (`D1` as `DB`, `R2` as `FILES`) so the
   deployment attaches the bindings the Worker expects.
2. Enable Sign in with Freebuff for the environment — the deploy injects the
   `FREEBUFF_*` variables; no client secret is used.
3. Use the site's publish flow to deploy `deploy.json`.
