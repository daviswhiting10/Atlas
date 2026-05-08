# Atlas — Project State

## Current phase: Phase 1 — Foundation (IN PROGRESS)

## What's live
- Nothing in prod yet. Phase 1 build in progress.

## What's been built (this session)
- Full Prisma schema: Postgres, multi-tenant, all Phase 1–4 models
- Auth.js v5 with email magic links + Resend
- `withWorkspace` HOF — all 12 API routes structurally scoped
- UsageLog wired on every `callAI` call (fire-and-forget)
- Methodology loader reads from DB (`MethodologyDocument` table)
- Exercise library: 79 hand-curated exercises (squat/hinge/push/pull/carry/rotation/core/isolation/conditioning)
- Seed: Workspace + User (SEED_TRAINER_EMAIL) + TrainerProfile + exercises
- `npm run seed:methodology` — parses /methodology/*.md → MethodologyDocument rows

## What's next to run (in order)
```bash
npm install
npx prisma migrate dev --name phase1-init
npx prisma db seed
npm run seed:methodology
npm run build   # must pass zero TS errors
```

## Phase 1 acceptance criteria
- [ ] Magic link → login → / works for seeded trainer
- [ ] Every client/lead/intake/program API route returns only rows for authed workspace
- [ ] Every callAI invocation produces a UsageLog row (feature, model, tokens, latencyMs, workspaceId)
- [ ] `npm run seed:methodology` parses /methodology/*.md into MethodologyDocument rows
- [ ] `next build` passes with zero TS errors
- [ ] Deployed to Vercel + Neon, prod URL captured below

## Prod URL
_Not yet deployed._

## Required env vars
```
DATABASE_URL=postgresql://...        # Neon connection string
NEXTAUTH_SECRET=...                  # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000   # or prod URL
RESEND_API_KEY=...                   # optional in dev (magic link logs to console)
SEED_TRAINER_EMAIL=davis@example.com
SEED_TRAINER_NAME=Davis Whiting
SEED_WORKSPACE_ID=ws_atlas_primary   # optional, defaults to ws_atlas_primary
```
