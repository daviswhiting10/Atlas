# Review of the four design docs, and a two-week v1

Status: a review, written 2026-11-13. It covers [goals-layer.md](goals-layer.md),
[archive-and-chapters.md](archive-and-chapters.md), [mcp-roadmap.md](mcp-roadmap.md)
and [generator-v2.md](generator-v2.md). Nothing here is built, and none of the four
docs were changed by this review.

**The short version**

- The four docs agree on the big idea (sessions are the record, everything else is
  a lens over them) and mostly agree on the details. There are **9 real
  contradictions** and **14 gaps**, listed in section 1. None of them breaks the
  design. Three of them block 75 Hard specifically and must be settled first.
- The riskiest thing in the whole design is **automatic, permanent writes that
  happen on a read** (closing a goal, sealing a chapter). Section 2.
- The docs describe roughly three months of work. A two-week v1 for one user is
  about a fifth of it: **75 Hard running on you, a heatmap that shows it, and your
  own AI able to log and check in.** The generator is almost entirely cut. Section 3.
- **Build first: the goal evaluator for 75 Hard,** as a pure function with tests.
  Section 4.

## 1. Contradictions and gaps

### 1a. Contradictions (two places say different things)

| # | Where | What conflicts | Suggested fix |
|---|---|---|---|
| C1 | goals-layer vs mcp-roadmap | Goals close and chapters seal "on the first read". mcp-roadmap says chapters are read-only in MCP and "sealing is an app-only action", and `get_goals` is a read tool under the `read` scope. So either an MCP read writes to the database, or a goal read only through MCP never closes or seals. | Say that MCP reads never close or seal. They return what the evaluator computes (`suggestion: "complete"`, chapter `draft`) and leave the write to the app. |
| C2 | mcp-roadmap vs itself | The fix for `log_workout`'s date says the zone is "the `timezone` argument first, then `ClientProfile.timeZone`, then the cookie". The "Units and weeks" paragraph says "the goal's zone, otherwise `ClientProfile.timeZone`, otherwise the `timezone` argument". The order is reversed. STDIO also has no cookie at all. | One order everywhere: explicit argument, then profile zone, then (HTTP only) cookie. Goal days always use the goal's own zone. |
| C3 | mcp-roadmap vs generator-v2 | mcp-roadmap says `generate_program` is "unchanged". generator-v2 retires it at its step 9. generator-v2 also adds a `plan_training` tool that mcp-roadmap never lists, and has `get_today` return the outlook, where mcp-roadmap has it return "the next recommendation per key lift". | mcp-roadmap is the earlier doc. Add a "after the engine exists" row: `get_today` gains the outlook, `plan_training` is added, `generate_program` is retired. |
| C4 | goals-layer vs generator-v2 | The 75 Hard template's outdoor rule is `sessions` min 1 with mark `outdoors` and **no** `minMinutes`. The generator plans "one `outdoor` ≥ 45 min". As written, a five-minute walk marked outdoors satisfies the goal but not the engine. | Put `minMinutes: 45` on the outdoor rule. Also state that the outdoor session counts as one of the two daily sessions. |
| C5 | archive vs itself | The 75 Hard chapter is drawn as "a 75-dot grid, 15 across, five down, with a tick where an attempt reset", and the heatmap band is "11 tinted rows with 75 dots". The same page shows attempts of 9, 31 and 75 days, which is 115 days. A 75-cell grid can't hold a goal that reset. | The strip is the whole range (every day from start to end). The cover's 75-dot grid shows the final attempt only, with earlier attempts as the segments beneath. |
| C6 | generator-v2 vs itself | Equipment is "the union of declared and observed" and also "observed wins over declared when they disagree". A union can't disagree. | Pick one. Suggested: declared is the ceiling of what's available; observed in the last 28 days only adds (bands) and orders preference. |
| C7 | generator-v2 vs itself and goals-layer | The review setting is `auto` / `review` in the inputs table and `auto` / `first` in section 4. The goal's type is called `kind` in the generator and `category` in goals-layer, where `kind` already means the rule type. | Use `auto` / `first` and `category`. |
| C8 | archive vs generator-v2 vs mcp-roadmap | archive defines one PR rule: a **record** is the heaviest weight ever, a **best** is a new top e1RM. The generator and MCP (`analyze_progress`, `recentRecords`, `log_session`'s "new PRs") still use `personalRecords()`, which mixes both. Inside archive, the heatmap rings a record on *any* exercise while the timeline only shows records on key lifts. | Adopt the archive rule in all three docs. Ring the heatmap only for key lifts, or a new lifter gets gold almost every day. |
| C9 | mcp-roadmap vs goals-layer | mcp-roadmap says `manage_goal` can't set the minor flag "including when it starts a group goal". No MCP tool creates a group goal, and creating one requires the "Is this a youth team?" answer, which is app-only. Also `manage_goal` starts goals "from a template" only, while goals-layer allows a goal built from scratch. | MCP can never create a group goal. Say whether MCP can start a from-scratch goal (suggested: no). |

### 1b. Gaps (something the docs rely on but never define)

**Three that block 75 Hard:**

- **G1. An outdoor walk can't be logged today.** Verified in `../Atlas`: quick log
  (`lib/sessions/quick-log.ts`) requires at least one exercise, and drops exercises
  with no sets. The live logger needs a plan workout. There is no way to save
  "45-minute walk, outdoors" as a finished session. Every doc assumes it exists.
- **G2. Duration is not captured by the live logger.** `durationMin` is written by
  quick log, the coach's session route and MCP, but not by the two logger action
  files. Under 75 Hard that means a "how long was it?" prompt after every live
  session, twice a day, for 75 days. The docs should derive a default from the
  session's start and finish times and ask only to confirm.
- **G3. What the day counter shows while yesterday is still open.** The grace window
  keeps a day open until the end of the next day. If yesterday is unmet but still
  open, is today "Day 24" or "Day 1"? The docs don't say. Suggested: show Day 24 with
  a quiet line "yesterday still needs: water" until it closes.

**The rest:**

- **G4. No way to start a goal in the past.** Goals are lenses, so sessions before
  `startDay` already exist, but check-ins for closed days can't be added. A
  backdated 75 Hard would reset at once. Either forbid past start days or allow a
  one-time backfill when starting.
- **G5. Weekly periods have no shape in `GoalResult`.** `periods` is keyed by `day`,
  `today` means "what's left today", and `streak` doesn't say days or weeks. A
  weekly-consistency goal can't be expressed in the type as written.
- **G6. `partial` is undefined for a one-rule goal.** The strip says `partial` means
  "some rules met". A week with 2 of 3 sessions has one rule, not met, so it is
  stored as `rest` and drawn hollow. It should be `partial` when progress is above
  zero.
- **G7. A paused goal can't end.** The status diagram only has ACTIVE → ENDED, and
  the lazy close is `WHERE status = 'ACTIVE'`. Also, a pause moves a fixed-length
  goal's end date out, which is wrong for a season that ends on a calendar date.
- **G8. How a reset goal completes or runs out.** "The length ran out without meeting
  the target" has no meaning for a goal that resets to day 1. State that a reset
  goal completes when an attempt reaches its length, and otherwise ends only by hand.
- **G9. Block and season goals need data the rules don't hold.** The generator reads
  "the template's days", "key lifts on their block days", "a block goal schedules a
  lighter week", and "sport days come from the group". The archive marks "game
  days". `GoalRules` and `GoalGroup` have none of these fields.
- **G10. `plan_adherence` is circular under the adaptive engine.** The block goal
  measures adherence to a plan, and the engine rewrites the plan around what the
  athlete actually did. Adherence to a plan that follows you is always high.
- **G11. Rolling outlook vs. an approved week.** The outlook is "recomputed after
  every session" and also approved by a coach "each week" and saved as plan rows.
  The docs don't say what happens to an accepted week when Tuesday's session changes
  what Thursday should be.
- **G12. Starting a session from an outlook that isn't saved.** At generator step 5
  the outlook is computed on read and nothing is persisted. The doc doesn't say how
  the athlete starts that workout in the logger, which `source` it gets, or where a
  "lighter" flag lives for a session with no plan week (the schema has no such
  field on a session).
- **G13. Who owns "hard sets" and the fixtures.** The heatmap's "work" needs hard
  sets, which are defined in the generator's `lib/engine/state.ts`. The history
  code's tests use "the fixtures generator-v2 builds". But history is meant to ship
  first. Also "warm-ups don't count": a logged set has no warm-up marker. Only plan
  exercises have a `section`.
- **G14. Two sources for the timeline.** It is derived from sessions *and* reads
  stored `Milestone` rows. The stored rows have the wrong date (archive's own gap 5),
  the doc has no plan for fixing old rows, and the count thresholds (1, 10, 25, 50,
  100) aren't checked against what `milestones.ts` already awards.

Smaller ones, each a one-line fix: the banned-word lists differ between archive and
generator (share one list); 75 Hard's "photo" rule should say it is a tick, not an
upload; `ClientProfile.timeZone` stays empty forever for a client who never signs
in, so the coach's cookie decides their days; a session can fall on different days
in a goal's zone and the profile zone, so a chapter strip and the heatmap can
disagree by a day; a chapter's `lifts` doesn't say which lifts are included when
only one has a target.

## 2. The riskiest assumptions

Ordered by how much damage each could do, worst first.

1. **"It's safe to write permanently during a read."** Goals close and chapters seal
   the first time someone loads them, and both are described as permanent. If the
   evaluator or a day boundary is wrong once, a page view ends your 75 Hard or
   freezes a wrong chapter, with no person having decided it. Next.js also
   discourages writes while rendering a page, and two docs disagree about whether an
   MCP read counts (C1). *What to do:* in v1 nothing closes or seals on its own.
   Later, auto-close only on completion, never on failure, and allow "reopen" until
   the chapter is sealed.
2. **"A day is unambiguous."** There are now four sources of a day boundary: the
   goal's zone, the profile zone, the cookie and an MCP argument. A reset challenge
   is the one feature where a session landing on the wrong side of midnight costs
   the user weeks. Travel, daylight saving, and a session started at 11:50 pm all
   hit this. *What to do:* in v1 use one zone (the goal's), store MCP dates at noon
   in that zone, and test the evaluator at UTC+13, UTC−10 and across a clock change.
3. **"The session-first work is finished."** All four docs sit on changes that are
   still uncommitted in another folder. If the schema moves when it lands, the docs
   move with it. *What to do:* nothing starts before it is on `main` and applied to
   the database you will use.
4. **"The athlete can log everything the goal needs, quickly."** Today they can't
   (G1, G2). 75 Hard is 150 sessions and about 300 check-ins. If each takes more
   than a few seconds, the first user quits the app, not the challenge. *What to
   do:* treat the one-tap outdoor session and the duration default as part of the
   goal feature, not as polish.
5. **"Moving the session writes into one place is a pure refactor."** mcp-roadmap
   step 2 rewrites the three copies of the write logic behind the logger, the most
   used screen, right after the session-first change. A regression there loses
   workout data. *What to do:* skip it in v1 and build the MCP logging tool on the
   quick-log save that already exists.
6. **"A frozen chapter will be right."** A bug at sealing time is stored forever,
   and the first real chapter is at least 75 days away, so the code would sit
   untested by real use for months. *What to do:* don't build freezing in v1.
   Compute an ended goal's result live until there is a real one to look at.
7. **"Exercise muscle data is good enough to plan from."** `primaryMuscles` are free
   strings from two sources. Hard sets per muscle, neglected muscles, freshness and
   the set ceilings all sit on them. If a third of sets land in "unspecified", the
   engine plans confidently from a partial picture. *What to do:* measure how many
   of your own sets map cleanly before writing any planner code.
8. **"We can test the engine on real histories and replay it against coaches."**
   The plan needs six anonymized histories and coach-written plans to compare with.
   There is one user. The fixtures would be invented, and the "replay agreement ≥
   80%" gate can't be measured. The engine's opinions (set ranges, the fatigue
   score, the 1.5 load ratio, "unloaded sets are hard") would ship unvalidated.
   *What to do:* don't build the planner until there are a few months of your own
   data and at least one coached client.
9. **"OAuth is one step."** Being an OAuth 2.1 authorization server (client
   registration, PKCE, discovery, refresh, revoke, consent) is weeks of work that
   gets one line in the build order. Until it exists, the only way to use your own
   AI is STDIO, which trusts the machine and uses whatever database `.env.local`
   names. *What to do:* accept STDIO for one user, on your own machine, and make
   "which database" an explicit decision (section 3).
10. **"Everything can be computed on every read."** The evaluator re-reads all
    sessions since the start, the history loader reads every set ever logged, and
    the outlook is recomputed after each session. That is fine for one user and
    unmeasured for forty. *What to do:* nothing now; measure before a second coach.
11. **"Relative colour and a quiet tone will feel like appreciation."** The history
    view is designed for a long record. With three weeks of data the percentile
    colours are noise and the lifetime numbers are small. *What to do:* ship the
    heatmap with plain "trained / trained twice" colouring first.
12. **"One migration can carry it all."** The goals migration now holds five tables,
    an enum, two hand-written indexes and two new columns on a core table. *What to
    do:* v1's migration is two tables.

## 3. A two-week v1

**The product in one sentence:** you start 75 Hard, the app tells you each day what
is left, logging the two sessions and the check-ins takes seconds, a calendar shows
every day you have trained with the challenge laid over it, and your own AI can log
and check in for you.

You are the only user, so everything for coaches managing others, teams and minors
is out.

### In

**Goals (about 5 days).** This is the centre of v1.

- `rules.ts` and `evaluateGoal` for two rule kinds only: `sessions` and `check_in`,
  per day, with `onMiss: "reset"` and `"count"`. Grace window, needs-duration,
  attempts.
- Two built-in templates in code: **75 Hard** and **weekly consistency** (the second
  proves the evaluator isn't 75-Hard-shaped, and forces G5 to be answered).
- One small migration: `Goal` and `GoalCheckIn`, the two partial indexes, and the
  `GoalStatus` enum. Include the nullable `chapter` and `chapterNote` columns now so
  chapters need no second migration. **Needs your approval and the HANDOFF.md steps.**
- Screens: "Start a goal" (two choices), the Today checklist with one-tap check-ins,
  the Goal chip ("75 Hard · Day 23"), and "End goal" by hand.
- **The two logging fixes that 75 Hard depends on** (G1, G2): a one-tap "outdoor
  session" (title, minutes, outdoors mark, no sets) and a duration filled in from
  start and finish times.
- Settle G3 and C4 before writing the evaluator.

**History (about 3 days).**

- `lib/history/days.ts`: one record per day from finished sessions. This also fixes
  the existing Progress count, which today ignores sessions with no sets.
- The heatmap page: Monday-first rows, newest on top, hollow rest days, filled
  training days, a second dot for two sessions, the day sheet, and the 75 Hard band.
  "Work" is minutes or plain completed sets, not hard sets, which removes the
  dependency on the engine (G13).
- Four lifetime numbers above it: sessions, sets, active weeks, longest run of weeks.

**MCP (about 2 days), over STDIO only.**

- Fix the date bug (roadmap step 1).
- `log_session`: off-plan logging, built on the existing quick-log save plus the new
  set-less outdoor session. No refactor of the shared write code.
- `get_today`: today's plan workout if any, plus the goal checklist.
- `get_goals` and `goal_check_in`.
- New server instructions.

**Generator (at most 1 day, and the first thing to drop).**

- No planner. One honest line on Today, from a small `state.ts`: days since each
  muscle group was last trained, over your last four weeks ("Nothing for hamstrings
  in 9 days."), next to the per-lift targets the app already computes.
- Before writing it, run the muscle-name check from risk 7. If the data is poor,
  ship nothing here and say so.

### Out, and why

| Cut | Why it can wait |
|---|---|
| Group goals, team view, team chapter, `GoalGroup` | One user. |
| Minor flag, youth question, photo audit, chapter photo | One user, an adult. No photo code exists to guard yet. |
| Coach templates (`GoalTemplate`), excuses, coach-side goal screens | You are both coach and athlete. |
| Pauses, `plan_adherence`, `lift_target`, block and season goals | Not needed for 75 Hard, and they carry gaps G7, G9 and G10. |
| Lazy close, draft and seal, `freezeChapter`, the chapter page and shelf | The first chapter is 75 days away. Build it against a real finished goal. Removes risks 1 and 6. |
| Timeline, milestone fixes and rewritten copy, "best so far" staircases, records in gold, percentile colours, breadth stats, the coach's heatmap | The heatmap alone carries the "look back" feeling for now. Gold rings are the first thing to add back. |
| `ClientProfile.timeZone` | The goal stores its own zone. One user, one zone. |
| OAuth, scopes, connected apps, write rate limit, `update_session`, `get_sessions` filters, `get_chapter`, coach tools, the shared-write refactor | STDIO is enough for one user. The refactor is risk 5. |
| The planner (stages 1 to 6), proposals, locks, review, explanations, `readNotes`, fixtures, replay, retiring `generate_program` | Risks 7 and 8. It needs months of your own data and a second person to be testable. |

### Order within the two weeks

| Days | Work |
|---|---|
| Before day 1 | Session-first work committed on `main`, merged here, migrations applied. Confirm your account has a client profile. |
| 1–2 | Evaluator and rules, pure, with tests. No database. |
| 3 | Migration (with your approval), start/end/check-in actions. |
| 4–5 | Today checklist, chip, start sheet, outdoor one-tap, duration default. **Start 75 Hard here.** |
| 6–8 | `days.ts`, lifetime numbers, heatmap page with the goal band. |
| 9–10 | MCP: date fix, `log_session`, `get_today`, `get_goals`, `goal_check_in`. |
| Spare | The one-line generator nudge, or gold rings on the heatmap. |

Starting the challenge on day 5 matters. The second week is then built while you
use the first week's work twice a day, which is the only real test this design can
get right now.

### Two decisions v1 needs from you

1. **Which database your own AI talks to.** STDIO uses whatever `.env.local` names.
   To use your AI for your real 75 Hard it has to be production, on your machine
   only. mcp-roadmap says to ask before that, so this is the ask.
2. **Whether v1's migration may include the unused `chapter` columns**, to avoid a
   second migration later.

## 4. The single most valuable thing to build first

**The goal evaluator: `rules.ts` and `evaluateGoal`, for 75 Hard, as a pure function
with tests.** About two days, no database, no migration, no screen.

Why this one:

- **Everything else reads it.** The Today checklist, the chip, `get_goals`, the
  heatmap band, the generator's "what today needs" and, later, every chapter are
  views of its output. Nothing else in the four docs has that many dependents.
- **It holds the hardest logic.** Day boundaries, the grace window, resets,
  needs-duration and attempts are where a bug costs you weeks of a challenge (risks
  1 and 2). As a pure function they can be tested at awkward time zones and around
  midnight before any real day depends on them.
- **It forces the open questions.** You can't write it without deciding G3, G5, G8
  and C4, and it is far cheaper to decide them in a test file than in a screen.
- **It needs nothing risky.** It can start the hour the session-first work is
  merged, and it can't damage data.
- **It starts the clock.** It is the shortest path to you running 75 Hard in the
  app. From that day the app is producing the history that the heatmap, the
  chapter and the generator all need, and none of those can be judged without it.
