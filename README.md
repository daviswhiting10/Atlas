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
  session volume. The leading metric depends on the goal — volume for muscle, estimated max for strength, reps for fat
  loss. Records are marked, and the next target is projected as a dashed point.
- **Workout logger.** One exercise at a time, steppers for weight and reps, a rest timer, live record detection, and
  a chart that updates as each set is logged. Any workout in the week can be done in any order.
- **Coach dashboard.** The original half of the app: client management, a program builder, session logging and
  AI-assisted intake and programming for a personal trainer. Sign in by email link at `/login`.

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
npm run lint
npm run build
```
