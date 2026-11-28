# Release scripts

The ship infrastructure, kept in the repo so it can't be lost with a temp folder. Logs go to
`~/Documents/atlas-release-logs` (outside the repo, chmod 700); set `ATLAS_RELEASE_LOGS` to change it.

## Shipping
| Script | What it does |
|---|---|
| `queue.sh <name> <ref> "<message>" [...]` | Ships one or more releases in order through `release.sh`, resetting the staging worktree to `origin/main` before each. Stops at the first failure; the rest don't ship. Prints the queue log. |
| `release.sh <ref> "<message>"` | One release in the staging worktree (`~/Documents/atlas-wave2`, set `ATLAS_STAGING`): merge, `prisma generate`, tsc, lint, vitest (one retry), `next build`, the Monday loop on :3950, push to `main`, wait for the Vercel deploy, `health.sh`, pull `~/Documents/Atlas`. Nothing is pushed unless every check before the push passed. |
| `health.sh [base]` | Production after a deploy. Expected: `/` and `/login` 200; signed-out `/today`, `/clients`, `/log` 307 to `/login`; erase GET and invite POST 401. |
| `loop-rerun.sh` | The Monday loop alone on staging's current build (:3950). Use it when a release stopped at "monday loop" with a step that looks flaky. |

Ship a combined change (several branches that must go together) as one merge ref: merge them onto `origin/main` in a scratch worktree and pass that commit as one release, so neither reaches `main` unless both pass.

The rollback for each release is the `main` it was merged onto (printed as "rollback").

## Production data and schema (the routine in CLAUDE.md)
| Script | What it does |
|---|---|
| `table-counts.sh <url>` | Every table's exact count, read-only. Run it on production and on the fresh rehearsal branch before and after; an additive migration differs only in `_prisma_migrations` (+1). |
| `worktree-db-check.sh <dirs...>` | After a dev-sessions password rotation: a read-only query with each worktree's `.env.local` `DATABASE_URL`. |

Code never deploys ahead of the migration it reads: apply the migration (backup, rehearse, compare), then ship the code.

## Previews and visual review
| Script | What it does |
|---|---|
| `preview-pdf-test.sh <deployment host> [pdf]` | PDF import on a Vercel preview with the preview's test athlete. |
| `visual/db-drop-proxy.mjs` | A TCP proxy in front of the local Postgres that can drop or delay every connection on demand. |
| `visual/error-screens.mjs` | The app-wide and Plan error screens with the connection dropped: error, reloading, recovered. |
| `visual/per-hand.mjs` | The dumbbell ×2 / ×1 toggle in both loggers. |
| `visual/session.mjs` | Shared: Playwright and a signed-in context for a local build (mints the session from `.env.local`; refuses anything but localhost). |

The visual scripts use Playwright from `~/Documents/atlas-tools/node_modules/playwright` (set `PLAYWRIGHT_DIR` to change it); its browsers are cached in `~/Library/Caches/ms-playwright`. Run them against a local production build (`npx next build`, then `next start` on a free port, not 3900 or 3950) on the local Postgres, never production. Save screenshots under `~/Documents/atlas-screenshots/<topic>/<timestamp>/` with a README.
