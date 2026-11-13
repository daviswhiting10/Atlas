# Goals layer

Status: design, not built. This doc builds on the session-first work
(`WorkoutLog.source` / `title` / `completedAt`, `lib/sessions/status.ts`, and
migrations `20261113120000_sessions_core` and `20261113120100_session_is_completion`).
**No code gets written until that work is committed on `main` and merged into
this branch.**

**Names in the UI:** a running goal is a **Goal** and a finished one is a
**Chapter**. **Challenges** is a template category (75 Hard and others like it),
not the name of the feature.

## The idea in one paragraph

A goal is a **lens** over a client's session history. A coach or athlete turns one
on (75 Hard, a 12-week strength block, a team season, "3 sessions a week"), and it
judges the sessions that already exist. **A goal never writes to a session, and a
session has no link to a goal.** When a goal ends it becomes a chapter: a named
date range with a frozen result. The sessions underneath are unchanged and can
sit under several goals at once (a 75 Hard attempt inside a strength block inside
a season).

Principles:

1. **Sessions stay the single source of truth.** Goals read only finished sessions
   (`completedAt` set), using the `date` the session was done.
2. **Results are worked out, not stored**, while a goal is running. One pure function
   (`lib/goals/evaluate.ts`, written in the style of `lib/sessions/status.ts`) turns
   the goal, its sessions, its check-ins and the current time into a result. The
   only facts we store are ones sessions can't give us: check-ins, pauses, excuses
   and the frozen chapter.
3. **Additive only.** The goals layer adds new tables, plus new columns on existing
   tables (`ClientProfile.isMinor` and `ClientProfile.timeZone`). It never changes
   or removes an existing column, and existing rows keep working untouched.

## Data model

### Templates and instances

This follows the existing `Program` → `ProgramAssignment` pattern: a template is
the recipe, and an instance is a copy owned by one client.

- **Built-in templates live in code** (`lib/goals/templates.ts`): 75 Hard, Weekly
  consistency, 12-week block. They are versioned in git and need no database rows.
- **Coach templates** are rows in `GoalTemplate`, for a coach's own recipes.
- **Every template has a `category`:** `challenge` (75 Hard and others like it),
  `consistency`, `block` or `season`. The "Start a goal" sheet groups templates by
  category, so "Challenges" is a heading there and nowhere else.
- **A goal has its own `category`** (the same four values). It is copied from the
  template when one is used. A goal built from scratch asks the person to choose
  one when they start it, so every chapter has a category.
- **Anyone can start a goal:** an athlete can start one alone from a template, or
  a coach can start one for a client. `startedBy` records which. The first
  real use will be the user running 75 Hard on themselves.
- **An instance (`Goal`) copies the rules when it starts.** If someone edits the
  template later, a goal that is already running doesn't change underneath the
  athlete. `templateKey` records where it came from: `builtin:75hard` or
  `tpl_<id>`.

```prisma
model GoalTemplate {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  name        String
  category    String    // "challenge" | "consistency" | "block" | "season"
  rules       Json      // GoalRules (zod-validated, see below)
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([workspaceId, deletedAt])
}

enum GoalStatus {
  ACTIVE
  PAUSED
  COMPLETED // ran its course and the rules were met
  ENDED     // stopped early, or ran out without meeting the target
}

model Goal {
  id          String        @id @default(cuid())
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id])
  clientId    String
  client      ClientProfile @relation(fields: [clientId], references: [id])
  templateKey String?       // "builtin:75hard" | "tpl_<id>" | null (built from scratch)
  groupId     String?       // set when the goal is one member's copy of a group goal
  group       GoalGroup?    @relation(fields: [groupId], references: [id])
  name        String
  category    String        // "challenge" | "consistency" | "block" | "season": copied from the template, or chosen by the user
  rules       Json          // GoalRules, copied from the template when the goal starts
  timeZone    String        // IANA zone, fixed when the goal starts; decides where a day ends
  startDay    String        // "yyyy-mm-dd" in timeZone, day 1 of the goal
  status      GoalStatus    @default(ACTIVE)
  startedBy   LoggedBy      // TRAINER | CLIENT (reuses the existing enum)
  endedAt     DateTime?
  chapter     Json?         // the sealed result. Null while the goal runs and during the draft window (see Archive)
  chapterNote    String?    // editable, kept outside the frozen result
  chapterPhotoId String?    // a ProgressPhoto id. Plain string, no foreign key, like workoutLogId.
                            // Never settable when ClientProfile.isMinor is true
  checkIns    GoalCheckIn[]
  pauses      GoalPause[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([clientId, status])
  @@index([groupId])
}
```

### Group goals (a team season)

A group goal is one goal launched to a roster. Each member gets their own `Goal`
row, with the rules copied and the member's own check-ins, attempts and chapter,
and every member's row points at the same `GoalGroup`:

```prisma
model GoalGroup {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  name        String    // "Spring season 2027"
  templateKey String?
  rules       Json      // the rules each member's goal is created with
  startDay    String
  leaderboard Boolean   @default(false) // reserved; nothing reads it yet
  isYouth     Boolean   @default(false) // the coach's answer to "Is this a youth team?"; sets ClientProfile.isMinor for members
  goals       Goal[]
  createdAt   DateTime  @default(now())
  endedAt     DateTime?
  chapter        Json?      // the team chapter: aggregate only, sealed after every member's chapter is sealed
  chapterSharedAt DateTime? // set when the coach taps "Share with the team"; null = coach only
}
```

- **Members see only their own progress.** No member can see another member's
  goal, check-ins or sessions. This matters because rosters can be youth teams.
  The one exception is the **team chapter**, which holds only totals with no
  names, and which members see only after the coach shares it (`chapterSharedAt`).
- **The coach sees a team view:** one row per member showing day or week, the
  current period's status, and misses. It's built by running the evaluator once
  per member.
- **A member who joins late** starts from their own `startDay`. A member who
  leaves has their goal ended, which becomes their own chapter.
- **No leaderboard yet.** If one is added, it is off by default and turned on per
  group by the coach (`leaderboard`). The field exists now so that turning it
  on later needs no migration and can't happen by accident.
- **Ending the group** ends every member's goal that is still running. Each one
  starts its own draft chapter, and the team chapter is sealed once every member's
  chapter has been sealed.

**Minors.** `ClientProfile.isMinor` is a plain yes/no on the client. **No birthdate
is stored for it, and the existing `ClientProfile.dob` column is never used to set
or guess the flag.**

- **Who can change it:** only a coach (TRAINER or ADMIN in the workspace), in the
  app. Never the client. **It is unreachable from every MCP write tool**, and the
  client's own AI can't see it (see mcp-roadmap.md).
- **It is set for a whole group at once, never member by member.** When a coach
  creates a group goal, the sheet asks **"Is this a youth team?"**, a required
  yes/no with no pre-selected answer. The answer is saved as `GoalGroup.isYouth`.
  If yes, `isMinor` is set on **every member of the roster**, and on every member
  added to that group later. The coach is never expected to flag each person.
- **Clearing it** for one member inside a youth group needs a confirmation that
  names what changes (photos become available). Clearing is the only manual step.
- **While it is set:** no progress photo can be added, no chapter photo can be
  attached, and any photo already attached stops being shown. A leaderboard (if one
  is ever built) is never available to a group that has a flagged member. The
  generator defaults to coach review first for the client (generator-v2.md).

**Why store `timeZone` on the goal:** today the timezone comes from a cookie on
each request (`TZ_COOKIE` / `safeTimeZone` in `lib/athlete/data.ts`). For 75 Hard,
"did you do it today" has to give the same answer to the coach in one zone and
the athlete in another, so the goal records the zone once, when it starts.

**`ClientProfile.timeZone` is the athlete's own zone,** used by everything that isn't
inside a goal (heatmap, history, the generator, MCP date handling). The order is: the
goal's `timeZone` inside a goal, then `ClientProfile.timeZone`, then the request cookie.

- **Filled once, from the browser.** The first time the athlete opens the app
  signed in, a server action writes the browser's zone with a conditional update
  (`WHERE timeZone IS NULL`). **It never overwrites a value that is set.** Only the
  athlete's own session can fill it; a coach opening the athlete's page in
  another city can't.
- **Editable in settings,** by the athlete (and by the coach for the client). The
  value is checked as an IANA zone (`safeTimeZone`) before it is saved.
- A change affects new days only. Running goals keep their own `timeZone`.

**Days are stored as `yyyy-mm-dd` strings,** the same as `localDay` in
`lib/mcp/derive.ts`. This avoids midnight-UTC bugs.

### Rules

`rules` is a JSON field checked by a zod schema (`lib/goals/rules.ts`). Each goal
has a length, a list of rules and a miss policy:

```ts
type GoalRules = {
  length: { days: number } | { weeks: number } | { until: string } | null; // null = open-ended
  rules: Rule[];
  onMiss: "reset" | "count";   // reset: start again at day 1; count: tally misses
  allowedMisses?: number;      // with "count": more than this many misses ends the goal
};

type Rule =
  | { key: string; kind: "sessions"; per: "day" | "week"; min: number;
      where?: { minMinutes?: number; sources?: SessionSource[]; mark?: string } }
  | { key: string; kind: "check_in"; per: "day" | "week"; label: string;
      value: "done" | { min: number; unit: string } }
  | { key: string; kind: "plan_adherence"; per: "week"; minPct: number }
  | { key: string; kind: "lift_target"; exerciseId: string; e1rmLb: number }; // checked at the end; pounds, an estimated 1-rep max
```

How the examples map:

| Goal | Length | Rules | On miss |
|---|---|---|---|
| 75 Hard | 75 days | `sessions` per day min 2 (≥45 min); `sessions` per day min 1 with mark `outdoors`; `check_in` per day for water, reading, diet and photo | reset |
| Weekly consistency | open | `sessions` per week min 3 | count |
| 12-week strength block | 12 weeks | `plan_adherence` per week ≥80%; `lift_target` (squat e1RM 315 lb) | count |
| Team season | until a date | `sessions` per week min N, launched to the roster as a `GoalGroup` | count |

**A `mark` is a fact about a single session that a goal needs, such as "outdoors."**
Marks are stored as check-ins linked to a session (see below), not as a column
on `WorkoutLog`. That keeps sessions free of goal-specific fields.

### Check-ins, pauses and excuses

```prisma
model GoalCheckIn {
  id           String      @id @default(cuid())
  goalId       String
  goal         Goal        @relation(fields: [goalId], references: [id], onDelete: Cascade)
  ruleKey      String      // which rule, or which mark ("outdoors")
  day          String      // "yyyy-mm-dd" in goal.timeZone
  workoutLogId String?     // set for a session mark; the session row itself is never touched
  value        Float?      // numeric check-ins (litres of water); null = "done"
  excuse       Boolean     @default(false) // coach forgives this rule on this day
  by           LoggedBy
  note         String?
  createdAt    DateTime    @default(now())

  @@index([goalId, day])
}

model GoalPause {
  id       String @id @default(cuid())
  goalId   String
  goal     Goal   @relation(fields: [goalId], references: [id], onDelete: Cascade)
  fromDay  String
  toDay    String? // null = still paused
}
```

We need two partial unique indexes, added by hand in the SQL migration. Prisma
can't express them, and nulls defeat a plain unique, which is the same problem
`lib/progress/milestones.ts` notes:

- `(goalId, ruleKey, day) WHERE workoutLogId IS NULL`: one daily check-in per rule.
- `(goalId, ruleKey, workoutLogId) WHERE workoutLogId IS NOT NULL`: one mark per session.

`workoutLogId` is a plain string with no foreign key. If a session is deleted, its
mark is simply ignored, because the evaluator only counts marks whose session
still exists and is finished.

## Evaluation

`evaluateGoal(goal, sessions, checkIns, pauses, now) → GoalResult` is pure,
needs no database access and is covered by tests. Server code loads finished
sessions for the client from `startDay` onward (this uses the existing
`WorkoutLog(clientId, date)` index), plus the goal's check-ins and pauses.

### Periods

- **Day:** a calendar day in `goal.timeZone`. A session counts on
  `localDay(session.date, goal.timeZone)`.
- **Week:** seven days counted from `startDay`, so week 1 is days 1–7. Weeks
  that start on the goal's first day mean there's never a partial first week. The
  `mondayOf` weeks in `derive.ts` are for charts, not goals.
- **Paused days** fall outside every period. They don't count as met or missed,
  and a fixed-length goal's end date moves out by the length of the pause.

### What a period can be

Each rule in each period is one of these:

- **met:** the rule's own test passes (enough sessions, a check-in present, plan
  adherence at or above `minPct`), or a coach excuse exists for that day and rule.
- **needs duration:** the period is still open, and the rule would be met if one
  or more finished sessions that have no `durationMin` turned out to be long
  enough (see below).
- **open:** the period hasn't closed yet. This covers today, and the grace window
  described below.
- **missed:** the period has closed and the rule wasn't met.

### Sessions without a duration

For a rule with `minMinutes`, a finished session with no `durationMin` is neither
passed nor failed without the athlete knowing:

- **While the period is open,** the session counts as *unknown*. If the unknown
  sessions could make the difference between met and not met, the rule reads
  **needs duration**. The athlete gets a one-tap prompt on Today and in the
  logger ("How long was it?") that writes `durationMin` on the session, and the
  coach's view shows the same flag.
- **When the period closes,** an unknown session doesn't count. The rule is then
  met or missed using only sessions that have a duration.
- Adding the duration during the grace window repairs the day the same way a
  late log does.
- The logger asks for the duration when a session finishes if an active goal
  has a `minMinutes` rule. This keeps the prompt from coming up in most cases.

A period is met when every rule in it is met. For 75 Hard, a day is the daily
rules taken together. A goal with both daily and weekly rules judges each
period type on its own.

**Grace window:** a day or week closes at the end of the **following** day.
Coaches log sessions after the fact (`MANUAL` and `SCREENSHOT` sources), and a
session added during the grace window still counts on the day it was done. That
way, logging late never triggers a reset.

### Resets and attempts

With `onMiss: "reset"`, the first missed day ends the current **attempt** and the
next day becomes day 1 again. Attempts aren't stored. The evaluator works them
out from the day results, so:

- A late log or a coach excuse that turns a missed day into a met one repairs
  the attempt on its own. Nothing has to be undone.
- The result includes every attempt (for example "Attempt 3, day 23 of 75;
  earlier attempts reached day 9 and day 31"), so earlier runs show up in the
  history and are never erased.

With `onMiss: "count"`, misses are tallied. When they go over `allowedMisses`,
the result is `shouldEnd`.

### Result shape

```ts
type GoalResult = {
  periods: { day: string; rules: Record<string, "met" | "needs_duration" | "open" | "missed">; excused: string[] }[];
  needsDuration: string[];     // workoutLogIds the athlete should add a duration to
  attempts: { fromDay: string; toDay: string | null; days: number }[]; // last one is current
  dayOfGoal: number;           // within the current attempt
  streak: { current: number; best: number };
  misses: number;
  today: { ruleKey: string; need: number; have: number }[]; // what's left today
  suggestion: "keep_going" | "complete" | "should_end";
};
```

**The evaluator only suggests a status. It never changes one.** A small server
action does the actual change (`completeGoal` / `endGoal`). It runs in two ways:

- **By hand:** the coach or athlete ends or completes a goal. `endedAt` is now.
- **Lazily, on read.** Whenever a goal is loaded, the server checks whether the
  suggestion is unambiguous: a fixed-length goal whose last day's grace window has
  closed (`complete` if the rules were met, otherwise `ended`), or a `count` goal
  over its `allowedMisses`. If so, it applies the same action with a conditional
  update (`WHERE status = 'ACTIVE'`), so concurrent readers change it once.
  `endedAt` is set to the **end of the goal's last day**, not the time of the read,
  so a goal nobody opened for a week still seals on schedule. Open-ended goals
  never close on their own.

**There is no daily job.** Closing on read covers everything a job would do for
status, and sealing is lazy as well. A job could only be justified by something
that must happen when nobody opens the app, such as a push or email "your goal has
ended". Atlas has no such feature planned here, so the job is dropped. If
notifications are added later, add the job then, for that reason alone.

### Manual check-ins for non-workout rules

- **Daily rules** such as water or reading appear as one-tap rows on the
  athlete's Today view and on the coach's client page. A check-in can be removed
  until its grace window closes; after that, only the coach can change it.
- **Session marks** appear as a toggle in the logger, at the end of the session.
  It only shows when the client has an active goal that uses that mark. Missing
  durations are handled as described in "Sessions without a duration."
- **Excuses** are coach-only and stored as a check-in with `excuse: true`, so the
  history shows that a day was forgiven rather than met.

## Status and the archive (chapters)

```
ACTIVE ⇄ PAUSED
ACTIVE → COMPLETED   (rules met when the length runs out; lift_target checked here)
ACTIVE → ENDED       (stopped, too many misses, or the length ran out without meeting the target)
```

A reset on its own is not a change of status. A 75 Hard goal stays `ACTIVE` across
its attempts. Closing a goal on read, and what `endedAt` is then, is described under
"Result shape".

**A chapter is a draft first and is sealed later.** (Changed from "written once at
the moment of ending"; see archive-and-chapters.md section 2 for why.)

1. **Ending a goal** sets `status` and `endedAt` straight away. `chapter` stays
   null. While it's null the chapter is a **draft**, computed live by the same
   `freezeChapter()` function that will do the sealing, so the page looks the same
   before and after. A draft needs no extra status or column: *draft* means the
   goal has ended and `chapter` is null.
2. **Sealing** writes the result to `Goal.chapter` once, with `sealedAt` inside it.
   It happens on the **first read of the goal at least 48 hours after `endedAt`**,
   or at once when the athlete or coach taps **Seal now**. No scheduled job is
   needed. The write is a conditional update (`WHERE chapter IS NULL`), so two
   readers arriving together write it once and the second does nothing.
3. **Why 48 hours:** the last day's grace window closes at the end of the following
   day, which is at most 48 hours after the goal ends. So by the time a chapter is
   sealed, every day in it has closed, and a late log or a duration added within
   the grace window is still included.
4. **A sealed chapter never changes.** The only exception is a coach-only
   "Rebuild" for a bug fix, which writes a new version with `rebuiltAt` and is
   audit-logged. Editing a session afterwards changes the session history but not
   the chapter. This is the one place the design stores a computed result, so that
   archived stories don't change after the fact.

**What's frozen is the `Chapter` shape defined in archive-and-chapters.md.** It is
built from the `GoalResult` but is not the `GoalResult` itself: it holds the
day-or-week `strip`, `numbers`, `attempts`, per-rule totals, `lifts` (start, end and
best for a `lift_target`) and up to ten `records`. The note and the cover photo
are not in it. They are the editable `chapterNote` and `chapterPhotoId` on the goal.

**At sealing, every state is settled.** `freezeChapter()` evaluates the goal as of
the sealing time, when every day has closed, so `needs_duration` and `open` have
already resolved into `met` or `missed` by the normal rules (a session still
without a duration doesn't count). Then:

- **The data keeps `missed`.** `GoalResult` and the per-rule totals count it
  exactly. **The frozen `strip` stores five display states**: `met` (all rules
  met), `partial` (some met), `rest` (none met, drawn as a hollow cell), `excused`
  and `paused`. A closed day with nothing met is stored as `rest`.
- **Wording stays separate from data.** The word "missed" is a data state and
  never appears in athlete-facing copy. Screens say "Day 31", "9 of 12 weeks" or
  "Ended on day 31".
- **Attempt resets** are not cells. They come from `attempts` and are drawn as ticks.

- **The chapter view** shows the frozen summary on top and the client's ordinary
  session list for those dates underneath, as a link to existing history. The
  list is live, so it can differ from the frozen numbers, and the page says so.
- **Team chapter:** a `GoalGroup` has its own aggregate-only chapter, sealed after
  all members' chapters are sealed. It has **no names and no ranking**. The coach
  sees it by default, and members see it only once the coach shares it.
  - **The 5 counts participants, not the roster.** A participant is a member with
    at least one finished session dated inside their own goal window (any source).
    A member who left early counts if they participated. A member who never
    trained doesn't count, however large the roster is.
  - **With 5 or more participants** it shows totals, a histogram of active weeks
    and game days.
  - **With fewer than 5** it shows **one combined total** (sessions and weeks), with
    **no histogram and no count of people**, because a histogram on three or four
    people points at individuals.
- **Ending a goal is permanent.** Running the same challenge again creates a new
  `Goal` from the same template, and the old chapter stays.
- **Milestones:** completing a goal can award a `goal_completed` milestone through
  `lib/progress/milestones.ts`. It's awarded when the goal ends, not when the
  chapter is sealed, and its `achievedAt` is the goal's last day.

## How it fits what's there

- **Naming:** `ClientProfile.primaryGoal` and `ProgramAssignment.goalText` are
  free-text goal descriptions, and they stay as they are. The client header
  already shows `primaryGoal`. The Goal chip ("75 Hard · Day 23") sits beside it,
  and the Progress tab has a Goals section with Chapters underneath. The two
  shouldn't both appear under a "Goal" label in the same place.
- **Plans:** the `plan_adherence` rule reuses `DONE` and `withDerivedStatus` from
  `lib/sessions/status.ts`. It counts plan workouts that are done, out of all of
  them, in the period. Skipped workouts count against it unless the coach
  excuses them.
- **MCP:** one read tool, `get_goals(clientId)`, returns the active goals with
  their `GoalResult` and lists past chapters, marking each as `draft` or `sealed`.
  Write tools come later.
- **UI** (keeping the wording short): a chip in the client header such as
  "75 Hard · Day 23"; a Goals section on the Progress tab with Chapters
  underneath; a "Start a goal" sheet with templates grouped by category
  (Challenges first); and a team view for each group goal on the coach side.

## Rollout

0. **First, before any code:** commit the session-first work on `main` and merge
   it into this branch.
1. `lib/goals/rules.ts` (zod) and `lib/goals/evaluate.ts` with tests. These are
   pure code and need no database. The tests cover the 75 Hard reset, repairs
   from late logs and excuses, needs-duration up to and after the day closes,
   pauses, and weekly periods.
2. One additive migration: `GoalTemplate`, `GoalGroup` (with `isYouth`, `chapter` and
   `chapterSharedAt`), `Goal` (with `category`, `chapter`, `chapterNote` and
   `chapterPhotoId`), `GoalCheckIn`, `GoalPause`, `GoalStatus`, the two partial
   unique indexes, and two new columns on `ClientProfile`: `isMinor` (boolean,
   default false) and `timeZone` (nullable text). **Apply it to
   production only after the user agrees, following the backup and
   `migrate status` steps in HANDOFF.md.** It depends on the sessions migrations
   being applied first.
3. **Athlete side first, starting with 75 Hard,** because the user is its first
   real user: start a goal on your own, Today check-ins, the logger's
   outdoors and duration prompts, the needs-duration prompt and the Goal chip.
   Check first that the user's own account has a client profile to run the goal
   against.
4. Coach side: start a goal for a client, excuses, Chapters on the Progress tab.
5. Group goals: create one for a roster, the coach team view, and member-only
   visibility.
6. Closing on read (see "Result shape"). There is **no daily job**: closing and
   sealing both happen lazily. Add a job only if a notification feature needs one.

`freezeChapter()`, the draft and sealing, and the chapter page are specified in
archive-and-chapters.md (its steps 6 to 9). They slot in after steps 1 and 2 here,
and the chapter page replaces the plain "Chapters on the Progress tab" in step 4.

## Build checklist: the minor flag and photos

Do this before any chapter-photo code ships, and again before the youth-team sheet:

1. **Audit every existing path that adds or shows a progress photo, and enforce
   `isMinor` in each:** upload, display, and export (data export, any "save as
   image" or share feature, and any URL that is generated for a stored file).
   What the audit of `../Atlas` found today:
   - `ProgressPhoto` exists in the schema, but no app code reads or writes it yet.
     The checklist item is to put the guard in the first code that does, and to
     make the guard a shared function (`photosAllowed(client)`) that every future
     path must call.
   - `NutritionEntry.photoUrl` (meal photos) is a different kind of photo (of food,
     though it can include the athlete). **Open: decide before the audit whether
     the flag covers it.** The safe default is to cover it.
   - Coach exercise photos and clips (`ExerciseMedia`) and plan import from photos
     are pictures of exercises or paper, not of the athlete, and are out of scope.
2. **A test per path** that a flagged client gets a refusal on upload and nothing
   on display or export. A stored file is not deleted when the flag is set, but is
   never returned. Decide before building whether to delete it instead.
3. **MCP:** a test that no tool schema mentions `isMinor` on a write, and that no
   tool output from a CLIENT caller contains any photo field.
4. **Youth-team sheet:** a test that creating a group with "yes" sets `isMinor` on
   every member, and on a member added later.

## Decisions (2026-11-13)

1. **Athletes can start a goal alone,** with no coach approval. The user is the
   first real user and will run 75 Hard on themselves.
2. **A session with no duration under a `minMinutes` rule** is never passed or
   failed silently. The day reads "needs duration" and the athlete gets a one-tap
   prompt. If the duration is still missing when the day closes, the session
   doesn't count.
3. **Team season = a shared group goal.** Each member sees only their own
   progress and the coach sees a team view. There's no leaderboard; if one is
   added later, it's opt-in per team, because rosters can be youth teams.
4. **Names:** running ones are **Goals**, finished ones are **Chapters**, and
   **Challenges** is a template category, not the feature name.

## Changes from archive-and-chapters.md (2026-11-13)

1. **Draft, then sealed.** A chapter is a draft when the goal ends and is sealed on
   the first read 48 hours later, or on "Seal now". Replaces "written once when the
   goal ends".
2. **Note and photo live outside the frozen result:** `Goal.chapterNote` and
   `Goal.chapterPhotoId`.
3. **Team chapter:** `GoalGroup.chapter` (aggregate only) and
   `GoalGroup.chapterSharedAt` (members see it only when the coach shares it).
4. **The frozen shape** is the `Chapter` type in archive-and-chapters.md, not the
   raw `GoalResult`.

## Decisions, second round (2026-11-13)

1. **Units are lb everywhere.** `lift_target` uses `e1rmLb`. The chapter stores,
   for each lift, whether its numbers are an estimated 1-rep max or plain weight.
2. **`Goal.category`** is copied from the template, or chosen by the user when the
   goal is built from scratch.
3. **Strip states and wording** are separate: five display states in the frozen
   strip, `needs_duration` and `open` resolved into met or missed at sealing, and
   "missed" never in athlete-facing copy.
4. **Weeks:** calendar weeks (Monday first, `mondayOf`) for the heatmap and lifetime
   stats. A goal's rules and a chapter's own strip use goal weeks counted from
   `startDay`.
5. **Principle 3 relaxed** to "additive columns are fine", so `ClientProfile.timeZone`
   and `ClientProfile.isMinor` are allowed.
6. **Minor flag:** a coach-set yes/no on the client, no birthdates. Photos and
   chapter photos are never available while it is set.
7. **Team chapters need 5 members.** Below that it is one combined total, no histogram.
8. **No daily job.** Goals close lazily on read, with `endedAt` set to the end of the
   goal's last day, and chapters seal lazily on read.

## Decisions, third round (2026-11-13)

1. **Five strip states, no sixth.** A day with nothing met is stored as `rest`, and
   exact counts live in `rules` and `attempts`. Athlete-facing views stay
   non-judgmental.
2. **Photo audit** is a build checklist item (above).
3. **The minor flag is unreachable from MCP writes,** and an athlete's AI can never
   read or attach photos. mcp-roadmap.md says so.
4. **Youth is asked at group creation** ("Is this a youth team?") and sets the flag
   for every member, now and later. It is never left to per-member flagging.
5. **Team chapter minimum of 5 counts participants,** members with at least one
   finished session in their goal window, including members who left early.
6. **`ClientProfile.timeZone` is filled from the browser once,** never overwritten,
   and editable in settings.
7. **Week boundaries and units** in generator-v2.md and mcp-roadmap.md were
   checked and updated: Monday-first calendar weeks for display, lb everywhere.
