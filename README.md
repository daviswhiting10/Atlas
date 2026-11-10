# Atlas

Strength training that adapts to you. Tell Atlas your goal and it writes a 12-week plan, tells you what to lift each
session, and charts your progress as you log.

**Live:** https://atlas-red-eight.vercel.app — choose **Explore a live demo** to open an account with nine weeks of
training already logged, or **Build my plan** to start from scratch. Neither needs an email or password.

## What it does

- **Plan generator.** Four questions (goal, experience, schedule, equipment) produce a periodised 12-week program:
  a split matched to the days available, exercises matched to the equipment, and three 4-week blocks with a lighter
  week closing each.
- **Progressive overload.** Every set shows a target worked out from the last session: add a rep until you reach the
  top of the range, then add weight and start again.
- **Charts that follow the goal.** Each exercise can be charted by top weight, best set, estimated 1-rep max or
  session volume. The leading metric depends on the goal — weight on the bar for muscle and general fitness,
  estimated max for strength, reps for fat loss. Records are marked, and the next target is projected as a dashed point.
- **Workout logger.** One exercise at a time, steppers for weight and reps, a rest timer, live record detection, and
  a chart that updates as each set is logged. Any workout in the week can be done in any order.
- **Coach dashboard.** The original half of the app: client management, a program builder, session logging and
  AI-assisted intake and programming for a personal trainer. Sign in by email link at `/login`.

## MCP server

Atlas also speaks the [Model Context Protocol](https://modelcontextprotocol.io), so an AI assistant can read a
client's training data and log workouts through the same models and rules the web app uses.

- **15 tools**: workout and exercise history, progress analysis, personal records, training volume, plateau
  detection, the active program and program details, exercise search, a fitness profile, deterministic training
  recommendations, workout logging, and (coaches only) program generation, save and update.
- **4 read-only resources** under `atlas://clients/{clientId}/…` for summary, active program, exercise history and
  progress.
- **Two transports**: STDIO for an assistant on your own machine, and Streamable HTTP at `/api/mcp`.

### Authorization

The caller is resolved once per session and bound into every handler; no tool accepts a workspace or user id.

| Caller | May act on |
|---|---|
| Coach (`TRAINER`, `ADMIN`) | Any client in their own workspace. `clientId` is required. |
| Athlete (`CLIENT`) | Their own profile only. `clientId` can be omitted. |

- A role that may not use a tool at all gets **403** (an athlete calling `save_program`).
- Reaching for a client outside your scope gets **404**, never 403, so the response does not confirm the record
  exists.
- Every call — including refused ones — writes one `AuditLog` row with the actor, tool, target client, outcome and a
  hash of the arguments. Raw arguments are never stored.

The role and scope matrix for all 15 tools is asserted in `lib/mcp/auth.test.ts`.

### Run it locally

```bash
ATLAS_MCP_AS=demo npm run mcp                    # a demo athlete with nine weeks of history
ATLAS_MCP_USER_EMAIL=coach@example.com npm run mcp   # an existing account; its role and workspace apply
```

The repo's `.mcp.json` registers the demo mode with Claude Code and other clients that read that file. The STDIO
runner is local-trust only and must not be exposed on a network.

Over HTTP, `/api/mcp` authenticates with the same signed-in session as the rest of the app, which covers same-origin
use. Remote assistants need OAuth 2.1; that is the next phase and is deliberately not faked with ad-hoc tokens.

### Layout

- `lib/mcp/tool.ts` — one pipeline for every call: role gate → validation → client scoping → handler → audit.
- `lib/mcp/auth.ts` — the authorization rules, pure and unit-tested.
- `lib/mcp/tools/` — the tool handlers. `lib/mcp/derive.ts` — records, volume and recommendations as pure functions.
- `lib/progress/plateau.ts` — plateau detection.
- `app/api/mcp/route.ts` and `lib/mcp/stdio.ts` — the two transports.

## How it's built

| | |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Data | Postgres on Neon, Prisma 7 |
| Auth | Auth.js v5 — email links for coaches, guest accounts for athletes |
| UI | Tailwind CSS, Recharts |
| Tests | Vitest |
| Hosting | Vercel |

The interesting logic is pure TypeScript with no I/O, so it runs in the browser for the live preview and on the server
when the plan is saved, and is covered by unit tests:

- `lib/plan/generator.ts` — goals in, 12-week plan out. Tested across all 720 combinations of answers.
- `lib/plan/overload.ts` — next-session targets, per-session chart points and record detection.
- `lib/plan/catalog.ts` — the curated exercise list and the movement slots that map to it.

Around that:

- `lib/plan/persist.ts` writes a plan (and the demo's history) with batched inserts.
- `lib/athlete/data.ts` holds the read models for the athlete screens; `lib/actions/athlete.ts` holds the writes.
  Both take the athlete from the session and never from the request.
- `lib/guest.ts` creates guest accounts. Each gets its own workspace, so self-serve athletes are isolated from a
  coach's clients and from each other.
- `middleware.ts` keeps `/`, `/start` and `/login` public and routes coaches and athletes to their own areas.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate
npm run dev
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session signing secret (`npx auth secret`) |
| `AUTH_URL` | Base URL of the app |
| `RESEND_API_KEY` | Sends coach sign-in emails (optional locally — the link is printed to the console) |
| `ANTHROPIC_API_KEY` | Coach-side AI features (optional) |

```bash
npm test        # unit tests
npm run mcp     # local MCP server (see above)
npm run lint
npm run build
```
