# MCP roadmap

Status: an audit plus a plan. Nothing here is built. The code examined is the
working tree in `../Atlas`, including the uncommitted session-first changes to
`lib/mcp/data.ts` and `lib/mcp/tools/workouts.ts`. Goals tools depend on
[goals-layer.md](goals-layer.md).

## How it's put together today

- **One pipeline for every call** (`lib/mcp/tool.ts`): role gate → zod input →
  client scoping → handler → audit row. Handlers never read the caller's
  identity from arguments; it's bound by closure in `createMcpServer`.
- **Scoping** (`lib/mcp/auth.ts`, pure and tested): a `CLIENT` caller always
  acts on their own profile, and naming anyone else returns 404. `TRAINER` and
  `ADMIN` must pass `clientId`, which has to be in their workspace, or they get
  404. A tool their role can't use returns 403, which says nothing about any
  record.
- **Audit** (`lib/mcp/audit.ts`): one `AuditLog` row per call, including
  refusals, with the arguments stored only as a sha256 hash.
- **Transports:**
  - HTTP at `app/api/mcp/route.ts` uses the **Auth.js cookie session** and
    rejects cross-origin calls.
  - STDIO (`npm run mcp`, `lib/mcp/stdio.ts`) trusts the local machine and takes
    the identity from `ATLAS_MCP_AS=demo` or `ATLAS_MCP_USER_EMAIL`. It loads
    `.env.local`, so it talks to whichever database that file points at.
- **Rate limit:** only `generate_program` has one, at 10 per workspace per hour.

## 1. Current tools

The server registers 10 tools and 4 resources. The 8 plan-edit tools in
`tools/plan.ts` are reachable only through `edit_plan`.

| Tool | Roles | Kind | What it does |
|---|---|---|---|
| `get_user_fitness_profile` | all | read | Goal, status, key lifts, latest intake summary **with health red flags**, latest assessment, last 5 milestones. |
| `get_active_program` | all | read | Active plan: current week, next workout, one week's workouts with exercises and targets, and the ids `edit_plan` needs. Status of each workout is read from its session. |
| `get_workout_history` | all | read | Recent sessions, newest first, with every set, volume, `source` and `finished`. Includes off-plan and unfinished sessions. Filters: `limit` and `before` only. |
| `get_exercise_history` | all | read | Per-session sets, top weight, e1RM and volume for one exercise. |
| `analyze_progress` | all | read | Key-lift e1RM trends with a composite change, weekly volume, body-weight trend, all-time PRs (top 25). |
| `get_training_recommendations` | all | read | Deterministic next-session advice per key lift: progression engine, plateau detector, muscle-volume trend. |
| `search_exercises` | all | read | Global library plus the workspace's own exercises. |
| `log_workout` | all | write | Writes sets into **one plan workout's** session, upserting by exercise and set number. `complete` finishes the session. |
| `edit_plan` | all | write | One tool with 8 actions: add or remove a workout, add, remove or swap an exercise, set targets, set a note, set lighter weeks. History is never deleted. |
| `generate_program` | coach | generate | AI-drafted program proposal using the coach's methodology. Saves nothing. Rate-limited. |

Each resource runs the matching tool through the same pipeline, so it's scoped
and audited the same way. They are `client-summary`, `client-active-program`,
`client-exercise-history` and `client-progress`. Only athletes get a
`list` of their own resources; a coach finds clients through the tools.

## 2. What breaks or changes now that sessions don't need a plan

The uncommitted changes already fix the reads. `finished` now comes from
`completedAt`, history shows `source` and `title`, a plan workout's status is
read from its session, and `log_workout` takes `date` and never uses the
scheduled day. These are the gaps that remain:

**Hard blockers for an athlete's own AI:**

1. **`log_workout` can't log off-plan.** It requires `assignedWorkoutId`, so an
   athlete with no plan, or doing something extra, can't log through MCP at
   all.
2. **It also can't change a workout on the spot.** Every set must be for an
   exercise already in the plan workout ("Exercise … is not part of this
   workout"). The app's logger supports swapping and adding exercises (see
   HANDOFF.md), but MCP doesn't.
3. **There's no way to fix a session afterwards.** MCP has no tool to re-date,
   rename, add a duration or note to, unfinish, or attach or detach a session
   from a plan workout. The REST route `app/api/sessions/[workoutLogId]` does
   this for coaches, so the logic exists but isn't shared.
4. **Sets are missing fields:** `bandColor` and per-set `note` can't be logged
   (`LoggedSetInput`), even though history returns `band`.

**Wrong or inconsistent behaviour:**

5. **`date` lands on the wrong day in some timezones.**
   ``new Date(`${date}T12:00:00`)`` is noon in the *server's* zone (UTC on
   Vercel). For an athlete in UTC+13 that is 01:00 the next day, so the session
   falls on the wrong day. The tool also has no `timezone` argument, unlike the
   read tools. The fix uses the `timezone` argument first, then
   `ClientProfile.timeZone` (filled from the athlete's browser on first load, see
   goals-layer.md), then the cookie. Goals judge days by timezone, so this needs fixing before goals
   ship.
6. **MCP sessions don't trigger milestone checks.** The app calls
   `checkSessionMilestones` and `checkStrengthMilestones` after writes; MCP's
   `log_workout` doesn't. A PR logged through an AI never becomes a milestone.
7. **MCP has its own copy of the write logic.** `log_workout` reimplements set
   upserts that also live in `lib/actions/athlete.ts` and
   `lib/actions/workout-logger.ts`. The two have already drifted (no
   milestones, no band or notes), and they will keep drifting.
8. **Server instructions** still describe a plan-first app ("record a session
   with log_workout", "Start with get_active_program"). An athlete with no plan
   gets `program: null` as the first thing they see.

**Fine as is, but worth knowing:**

- `get_workout_history` includes unfinished sessions without saying so, apart
  from `finished: false`. It needs `from`, `to`, `source` and `finished`
  filters.
- `analyze_progress` and the records count completed **sets**, whether or not
  their session is finished. That's the right call for PRs, but it should be
  written down.
- "Lighter week" (`deload`) can only apply to plan sessions, which is correct,
  since off-plan sessions have no plan week.
- Naming clash: `app/api/sessions` is the **SessionNote** API, not workout
  sessions. Avoid "session" in new MCP names, or say "workout session"
  explicitly.

## 3. Tools a user's own AI needs

The server keeps its current approach: a few tools that each do a whole job,
over one shared pipeline. MCP tools are thin wrappers over `lib/sessions/*` and
`lib/goals/*`, so the app and the AI go through the same code.

### Log workouts

| Tool | Roles | What it does |
|---|---|---|
| `log_session` (replaces `log_workout`) | all | Start, add to or finish a session. `assignedWorkoutId` is **optional**: with it, the session fulfils that plan workout (source PLAN or GENERATED); without it, it's off-plan with a `title`. Each set names an exercise by `exerciseId` or `slug`, so any exercise works, not only the plan's. Also takes `bandColor` and `note`, plus `workoutLogId` to continue a session, `date` and `timezone` (fixes item 5), `durationMin`, `complete`, and `from: "live" \| "after" \| "screenshot"`, which maps to the source enum (after → MANUAL, screenshot → SCREENSHOT). It runs the milestone checks and returns the session along with any new PRs or milestones. |
| `update_session` | all | Re-date, rename, set duration or notes, finish or unfinish, attach to or detach from a plan workout. Uses the rules from the REST route, moved into `lib/sessions/`. **No delete in v1.** |

### Goals and chapters (after the goals layer is built)

| Tool | Roles | What it does |
|---|---|---|
| `get_goals` | all | Active goals with today's checklist (`today`, `needsDuration`), the day or week number, streak and attempts; the list of chapters. |
| `get_chapter` | all | One chapter's frozen summary plus the session dates it covers. History itself comes from `get_sessions`. |
| `goal_check_in` | all | Check in on a daily or weekly rule, mark a session (`outdoors`), or undo a check-in while its grace window is open. A duration is added with `update_session`. |
| `manage_goal` | all | Actions: `start` from a template, `pause`, `resume`, `end`. An athlete can act only on their own goals. |
| `excuse_day` | coach | Forgive a rule on a day. Stored as a check-in marked as an excuse. |
| `get_group_progress` | coach | Team view for a group goal: one row per member. |

### History and PRs

| Tool | Roles | What it does |
|---|---|---|
| `get_sessions` (extends `get_workout_history`) | all | Adds `from` and `to`, `source`, `finished`, `includeSets` (off by default so long ranges stay small) and plain-text title search. |
| `get_exercise_history` | all | Unchanged. |
| `analyze_progress` | all | Adds `recentRecords` (PRs set in the window, with session and date). All-time PRs stay. |

### Plan training

| Tool | Roles | What it does |
|---|---|---|
| `get_today` | all | **The new starting point.** Today's plan workout (if any), an in-progress session (if any), the goal checklist, the last session, and the next recommendation per key lift. It works the same whether or not the athlete has a plan. |
| `get_active_program`, `edit_plan`, `get_training_recommendations`, `search_exercises` | all | Unchanged. |
| `generate_program` | coach | Unchanged. Opening a self-serve version to athletes (as `rebuildPlan` is in the app) can wait. |

The new server instructions lead with `get_today`, tell the AI that sessions
don't need a plan, and say that weights are in pounds.

**Units and weeks (applies to every tool).** All loads, e1RMs and targets are in
**pounds (lb)**, including goal `lift_target` values. There are no kilogram fields. A
"week" means a **calendar week, Monday first** (`mondayOf`) in everything that is
not a goal: `analyze_progress` weekly volume, `get_sessions` filters, the
generator's displayed totals. A goal's own day and week numbers (`get_goals`) count
from its `startDay` and are labelled as goal days or goal weeks. Days are
`yyyy-mm-dd` in the athlete's zone: the goal's zone inside a goal, otherwise
`ClientProfile.timeZone`, otherwise the `timezone` argument.

## 4. Auth and safety

### Getting a user's own AI connected

Today, HTTP works only with an Atlas browser cookie, so Claude, ChatGPT or any
other remote MCP client can't connect as the user. STDIO works for local
agents, but it trusts whoever runs it and uses whatever database `.env.local`
points at. **That's fine for development and wrong for real athletes.**

- **Remote clients need OAuth 2.1 (the MCP authorization spec).** Atlas acts as
  the authorization server and reuses the magic-link sign-in. It issues
  per-user tokens that can be revoked, are short-lived and refresh, and are
  stored hashed. They are tied to `userId`, and the caller is resolved from the
  token exactly as `resolveSessionCaller` does today, so `McpCaller` and
  everything after it stay unchanged.
- **Scopes:** `read` (history, plan, progress, goals); `log` (`log_session`,
  `update_session`, `goal_check_in`); `plan` (`edit_plan`, `manage_goal`);
  `coach` (coach-only tools, and only for TRAINER or ADMIN). The consent screen
  says what each scope means. The pipeline checks scope next to the role gate,
  so one place decides.
- **Revoking:** a "Connected apps" list in settings, with a revoke button per
  connection. The audit already records `actorUserId`; it should also record
  the token or connection id.

### What each AI can see and change

| | Athlete's AI (`CLIENT`) | Coach's AI (`TRAINER` / `ADMIN`) |
|---|---|---|
| Whose data | Only their own profile. Naming anyone else returns 404. | Any client in the coach's workspace; `clientId` is required. |
| History, PRs, progress | Their own. | Any client's. |
| Profile and health | Their own intake, red flags and assessment. | Same, for any client. |
| Coach-private notes | **Never.** No tool returns coach observations or other private coach fields. A new field defaults to coach-only until someone decides otherwise. | Yes. |
| Log or fix sessions | Their own. | Any client's. |
| Edit the plan | Their own active plan. | Any client's. |
| Goals | Start, pause or end their own; check in; no excuses. | All of that for clients, plus excuses. |
| Group goals | Their own progress only. **Never other members**, which matters because rosters can be youth teams. | Team view. |
| Photos (progress and chapter photos) | **Never read, listed, attached or detached.** No tool returns a photo URL, id or field to a CLIENT caller. | No photo tools in v1 either. |
| The minor flag (`isMinor`, `isYouth`) | Not returned. | Can read it where useful. **Cannot change it through MCP.** Only the app's own screens set it. |
| Generate a program | No (for now). | Yes, rate-limited. |
| Delete | Nothing. | Nothing through MCP in v1. |

### Write safety

- **No deletes through MCP.** Sessions, sets and chapters can't be deleted by an
  AI. Mistakes are fixed with `update_session`, and a wrongly logged set is
  overwritten by upsert or marked as not completed.
- **Retries don't create duplicates:** `log_session` takes an optional
  `requestId`, and a repeat with the same id returns the first result.
- **Chapters are read-only** everywhere in MCP. That includes `chapterNote` and
  `chapterPhotoId`. `get_chapter` returns neither a photo id nor a URL, and sealing,
  rebuilding and sharing a team chapter are app-only actions.
- **The minor flag and photos are out of reach of every AI.** No MCP write tool
  accepts `isMinor` or `isYouth`, and none can create, change or clear them.
  `manage_goal` (including when it starts a group goal) can't set them either. The
  flag is set by the coach's "Is this a youth team?" answer in the app, and can be
  cleared only there. An athlete's AI can never read or attach a photo, and no tool
  output for a CLIENT caller contains a photo field. This is enforced twice: tool
  schemas never list these fields, and a test in the pipeline fails if any write
  schema mentions them or any CLIENT output contains a photo field (add it to the
  step 5 test).
- **Rate limits on writes** per user, for example 300 writes an hour. That's
  generous for logging and stops a looping agent. Reads stay unlimited.
- **Text written by athletes is data, not instructions.** Titles, notes and
  check-in notes go back to a coach's AI, and tool descriptions should say they
  are user-entered text.
- **Annotations:** keep `destructiveHint: false` honest by never adding a
  destructive tool without changing it, and mark `update_session` as not
  idempotent when it finishes a session.
- **Ask the user before** every one of these: turning on remote access,
  issuing the first tokens, or pointing STDIO at the production database.

## 5. Build order

Each step is small, can ship on its own and comes with tests. Steps 1–4 need no
schema change.

0. **Prerequisite:** commit the session-first work on `main` and merge it here.
1. **Fix `log_workout`'s date:** take `timezone` and place `date` at noon in that
   zone. Test it in UTC+13 and UTC−10.
2. **Move the session writes into `lib/sessions/`:** start, upsert a set, finish,
   update, and attach or detach. Move the rules from the REST route and the two
   action files into it, and have the app call the shared code. The milestone
   checks run inside it. App behaviour doesn't change; this is a pure refactor
   with tests.
3. **`log_session`** on top of step 2, covering off-plan sessions, any exercise,
   band, notes and `requestId`. Keep `log_workout` as a thin alias for one
   release, then remove it.
4. **`update_session`, the `get_sessions` filters, `recentRecords` and
   `get_today`;** then rewrite the server instructions.
5. **Write rate limit** in the pipeline, plus a test that no tool returns
   coach-private fields to a `CLIENT` caller, a test that no write tool schema
   contains `isMinor` or `isYouth`, and a test that no tool output for a `CLIENT`
   caller contains a photo field.
6. **OAuth 2.1 and scopes:** a token table (needs a migration, so ask first),
   consent screen, scope check in the pipeline, "Connected apps" settings, and
   the connection id in the audit. Until this is done, the user's own AI uses
   STDIO, pointed at a non-production database branch.
7. **Goals tools:** after the goals layer's evaluator and tables exist, add
   `get_goals`, `goal_check_in` and `manage_goal`, then `get_chapter`, then the
   coach-only `excuse_day` and `get_group_progress`.
8. **Later:** an athlete version of `generate_program`, and a "describe a
   screenshot" flow that feeds `log_session` with `from: "screenshot"`.
