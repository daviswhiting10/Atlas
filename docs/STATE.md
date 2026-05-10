# Atlas — Project State

## Current phase: Phase 3 — Operations (in progress)

## What's live
- **Prod**: https://atlas-red-eight.vercel.app
- **DB**: Neon PostgreSQL (ep-nameless-field-apekq1z7, us-east-1)
- Deployed: 2026-05-09

## What's been built
- Full Prisma schema: Postgres, multi-tenant, all Phase 1–4 models
- Auth.js v5 with email magic links + Resend (`onboarding@resend.dev`)
- `withWorkspace` HOF — all API routes structurally scoped
- UsageLog wired on every `callAI` call (fire-and-forget)
- Methodology loader reads from DB (`MethodologyDocument` table)
- Exercise library: 80 hand-curated exercises
- Seed: Workspace + User (davis@atlasapp.co) + TrainerProfile + exercises
- Edge-safe middleware: `lib/auth.config.ts` has zero Node.js imports
- JWT callback fetches `workspaceId`/`role` from DB; uses `token.sub` fallback
- All client-side fetches guarded against non-array API responses
- Dropdowns: replaced Base UI Select with Radix UI Select (standard shadcn)

## Bugs fixed this session
- ✅ Inbox redirect to login — `token.sub` fallback + inbox redirects to `/` not `/login`
- ✅ `e.filter is not a function` — all 6 pages guarded with `Array.isArray` check
- ✅ Dropdowns non-functional — replaced Base UI with Radix UI Select
- ✅ Resend not delivering — `from` changed to `onboarding@resend.dev`
- ✅ Debug console.log removed from layout
- ✅ `authorized()` restored to `!!auth`

## Phase 3 — Operations (remaining)
- [ ] Smoke test: every nav item loads, no console errors, API calls return correct shapes
- [ ] Voice input in session notes (browser SpeechRecognition — test in Chrome)
- [ ] Outreach history view (/outreach/history)
- [ ] Session list per client (currently write-only)
- [ ] Fill in /methodology/*.md files (run `npm run seed:methodology` after)

## Required env vars (Vercel)
```
DATABASE_URL=postgresql://...
AUTH_SECRET=xMg95OE+MjCAK6vTdTaV6vIp/Q1/Di4QctcWg78d99Q=
AUTH_URL=https://atlas-red-eight.vercel.app
NEXTAUTH_SECRET=xMg95OE+MjCAK6vTdTaV6vIp/Q1/Di4QctcWg78d99Q=
NEXTAUTH_URL=https://atlas-red-eight.vercel.app
RESEND_API_KEY=...
ANTHROPIC_API_KEY=...
SEED_TRAINER_EMAIL=davis@atlasapp.co
SEED_TRAINER_NAME=Davis Whiting
SEED_WORKSPACE_ID=ws_atlas_primary
```
