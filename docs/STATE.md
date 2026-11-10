# Atlas — project state

## What's live

- Production: https://atlas-red-eight.vercel.app (Vercel, deploys from `main`)
- Database: Postgres on Neon
- Two sides, one codebase and one database:
  - **Athlete app** (`/`, `/start`, `/today`, `/plan`, `/progress`, `/you`, `/workouts/[id]`) — self-serve, guest
    accounts, generated plans, progress charts.
  - **Coach dashboard** (`/inbox`, `/clients`, `/programs`, …) — client management, program builder, session logging,
    AI-assisted intake and programming. Email-link sign-in.

## How access is decided

- `middleware.ts` routes by role: `CLIENT` to the athlete app, `TRAINER`/`ADMIN` to the dashboard.
- Role is checked again behind the middleware: `withWorkspace` (API routes), the dashboard layout, and the coach
  server actions all refuse `CLIENT`.
- Email sign-in only works for an address that already has an account (the coach, or a client the coach invited).
- Guest accounts are created through the `guest` credentials provider and each get their own workspace.

## Required environment variables

See `.env.example`. Values live in Vercel; none are committed.

## Known gaps

- Guest accounts are never cleaned up. A scheduled job to delete idle ones is the next piece of housekeeping.
- The per-visitor sign-up limit is held in memory per server instance. A platform rate limit should replace it.
- Coach-written programs show in the athlete app with their first set's rep range only; per-set weights and RPE are
  not surfaced there yet.
- Accessibility: charts have no text alternative, and the tab-style pickers don't support arrow keys.
