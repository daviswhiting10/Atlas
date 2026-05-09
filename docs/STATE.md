# Atlas — Project State

## Current phase: Phase 3 — Operations (in progress)

## What's live
- **Prod**: https://atlas-red-eight.vercel.app
- **DB**: Neon PostgreSQL (ep-nameless-field-apekq1z7, us-east-1)
- Deployed: 2026-05-08

## What's been built
- Full Prisma schema: Postgres, multi-tenant, all Phase 1–4 models
- Auth.js v5 with email magic links + Resend
- `withWorkspace` HOF — all API routes structurally scoped
- UsageLog wired on every `callAI` call (fire-and-forget)
- Methodology loader reads from DB (`MethodologyDocument` table)
- Exercise library: 80 hand-curated exercises
- Seed: Workspace + User (davis@atlasapp.co) + TrainerProfile + exercises
- `npm run seed:methodology` — parses /methodology/*.md → MethodologyDocument rows
- Edge-safe middleware: `lib/auth.config.ts` has zero Node.js imports
- JWT callback explicitly fetches `workspaceId` + `role` from DB on sign-in
- All client-side fetches guarded against non-array API responses

## Known bugs (fix next session — see docs/prompts/session-start.md)
1. `/inbox` redirects to login (server component auth pattern differs)
2. Page crashes: `e.filter is not a function` — programs page and possibly others
3. Dropdowns non-functional throughout app
4. Resend magic links going out but not delivering to Gmail (from domain issue)
5. Voice input in session notes not working (low priority)

## Debug logging to remove after bugs are fixed
- `console.log("[layout] session: ...")` in `app/(dashboard)/layout.tsx`
- `authorized()` returns `true` (no protection) in `lib/auth.config.ts`

## Phase 2 shipped
- Leads kanban
- Outreach persistence (OutreachMessage + lastContactAt)
- Retention heuristic: ACTIVE → AT_RISK after 21 days no contact
- PDF intake route
- Programs save as markdownBlob
- Session notes with SOAP structure

## Phase 3 — Operations (remaining)
- [ ] Outreach history view (/outreach/history)
- [ ] Session list per client (currently write-only)
- [ ] Fill in /methodology/*.md files (run seed:methodology after)

## Required env vars (Vercel)
```
DATABASE_URL=postgresql://...        # Neon connection string
AUTH_SECRET=...                      # same value as NEXTAUTH_SECRET
AUTH_URL=https://atlas-red-eight.vercel.app
NEXTAUTH_SECRET=...                  # Auth.js v5 fallback
NEXTAUTH_URL=https://atlas-red-eight.vercel.app
RESEND_API_KEY=...
ANTHROPIC_API_KEY=...
SEED_TRAINER_EMAIL=davis@atlasapp.co
SEED_TRAINER_NAME=Davis Whiting
SEED_WORKSPACE_ID=ws_atlas_primary
```
