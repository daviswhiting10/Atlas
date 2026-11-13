# Archive and chapters: looking back

Status: design, not built. This sits on top of the session-first work (sessions
are the record of what was done), [goals-layer.md](goals-layer.md) (a finished
goal becomes a chapter) and [generator-v2.md](generator-v2.md) (shares its
fixtures). Nothing gets built until the session-first work is committed on
`main` and merged into this branch.

## The idea

Atlas has plenty of ways to look *forward* (the plan, today's targets, the
recommendations). This is the part that looks *back*, and it has one job: when
someone scrolls through their history they feel **appreciation**, not
accounting.

Four decisions shape everything below:

1. **It's a book, not a feed.** A user's history is private by default, read
   slowly, organised into years and chapters. There are no posts, no kudos, no
   comparison with other people.
2. **Everything is computed from sessions, except chapters.** The heatmap,
   lifetime numbers and timeline are pure functions of finished sessions, so
   they can never disagree with the record. The only thing stored is a chapter's
   frozen result (section 2).
3. **Every session counts, whatever it was.** A plan workout, a typed-in lift, a
   screenshot import and a 45-minute outdoor walk all appear, and none is
   marked as a deviation.
4. **Gaps are space, not failure.** A quiet month is shown as quiet. Nothing
   turns red and the words "missed", "lost" and "broke" never appear.

Where it lives: a **History** page for the athlete at `/history`, reached from a
"Your history" link in the Progress header and from You (no fifth tab). For
the coach, the heatmap goes at the top of a client's Sessions tab and Chapters
sit in the Progress tab, as goals-layer.md already says.

## 1. The three views

### 1a. Calendar heatmap

A year of training days at a glance, laid out **vertically on a phone**: one row
per week, seven dots per row, newest week at the top, scrolling down into the
past. **Weeks are calendar weeks, Monday first** (`mondayOf` in `lib/mcp/derive.ts`),
here and in every lifetime stat below. A goal's own weeks (counted from its
`startDay`) are used only inside that goal's rules and its chapter strip. (The familiar GitHub-style grid runs sideways and is unreadable on a
390px screen; rows suit the scroll.)

- **A dot per day.** Rest day: a hollow hairline circle. Training day: filled
  with the signal green in four steps. Gold is used for **one thing**: a thin
  ring on a day that set a personal record (the existing `record` rule,
  heaviest weight ever, so it stays rare). Two sessions in a day: a small second
  dot beside it rather than a darker one.
- **Intensity is relative to the athlete.** The four steps are the 25th, 50th
  and 75th percentile of *their own* training days by "work" (below), so someone
  who trains 20 minutes at a time still sees full colour on their big days. A
  session with no sets and no duration is step 1: present, no more.
- **Work for a day** = the largest of `minutes ÷ 60`, `hard sets ÷ 12`, and
  `1` for a session with nothing logged. It isn't tonnage, because tonnage is zero
  for bodyweight, bands and walking, and those days would look empty.
- **Chapters show as bands.** The span of a chapter is a soft tint behind its
  rows, with its name in the left margin in serif. The tint covers the goal's
  days only, so a goal that starts on a Wednesday tints from Wednesday in that
  row; the goal's weeks and the heatmap's calendar weeks need not line up. A 75 Hard chapter is 11
  tinted rows with 75 dots in them, and a reader sees at once what that stretch
  was.
- **Months** are labelled in serif at the left, at the first row of each month,
  with the year in a large pale numeral where it changes.
- **Tapping a day** opens a bottom sheet (the existing `sheet.tsx`) listing that
  day's sessions by title with sets and minutes, each linking to the session.
- **Range:** from the athlete's first session to today, never a blank year. A
  brand-new athlete sees one row, not 52 empty ones (section 3, "New and thin
  histories").
- **Accessibility:** colour is never the only signal. Each dot has an
  `aria-label` ("March 3: 2 sessions, 14 sets, personal record on bench"), and a
  text summary sits above the grid ("41 of the last 52 weeks active").

### 1b. Lifetime stats

A hairline stat row in the style of the existing `StatRow` (deliberately not
cards), under a large serif count of sessions.

| Stat | Definition |
|---|---|
| **Sessions** | Finished sessions (`completedAt` set), any source. The big number. |
| **Sets** | Completed sets with reps. |
| **Moved** | Tonnage in lb for loaded sets. The hint line adds "plus 9,400 bodyweight reps" so unloaded work is visible. |
| **Time** | Sum of `durationMin`, hint "from 118 of 214 sessions". Shown only when at least half of sessions have a duration, so the number never looks smaller than the truth. |
| **Records** | Count of `record` flags (heaviest weight ever, in gold). Beside it, "bests": new best estimated 1-rep max or rep progress, a quieter number. |
| **Active weeks** | Weeks with at least one session ÷ weeks since the first session. |
| **Longest run of weeks** | The longest run of consecutive weeks with a session, ever (today only the *current* run is computed). |
| **Best stretch** | The most sessions in any 28 days, with its dates. |

There is **no lifetime day streak** on purpose. For someone who lifts three or
four days a week it's always 1 to 3, which is demoralising and meaningless.
Day-runs appear only where a goal defines them (75 Hard shows its attempts on
its chapter).

Below the numbers: **Best so far**, a small panel per key lift showing the
highest estimated 1-rep max ever and when, the existing
`personalRecords()` data. Then the chapters shelf (1d), then the timeline.

### 1c. The long-scroll timeline

A single vertical scroll from today back to the first session. A thin
hairline runs down the left as a spine. Events hang off it.

**What appears, in priority order:**

1. **Chapters.** Full-width dark panels that interrupt the scroll: name, dates,
   one-line result, "Open chapter".
2. **Records on key lifts** (gold dot, the number, the date).
3. **Count milestones:** sessions 1, 10, 25, 50, 100, then every 100.
4. **Firsts:** first session, first time doing a lift you then did ten times,
   first plate on a main lift (today's `plate_*` thresholds).
5. **Comebacks:** a first session after a gap of 21 days or more (the same
   threshold the plateau detector uses). Rendered as "Back on March 3. First
   session in four weeks."
6. **Best week** or best month, when it beats every earlier one.

Rules that stop it becoming noise:

- **At most five events a month**, by that ranking. The rest collapse into one
  "More from March" row.
- **First PRs only for lifts that matter:** key lifts, or lifts with 10 or more
  sessions. Today `first_pr` fires for every exercise ever touched.
- **Gaps render as space.** A gap of 21 days or more gets the spine drawn as a dashed
  line and one quiet inset line ("Three quiet weeks."), followed by the comeback
  entry. Nothing is coloured or counted.
- **Typography:** the date is a small mono eyebrow, the title is serif at 22px, one
  line of ink-soft text beneath. Years appear as large pale serif numerals
  (about 120px, ink at 6% opacity) behind the first event of each year.
- **Loading:** server-rendered newest first in month chunks with a cursor, so a
  four-year history opens at the present and loads further back as you scroll.

### 1d. Chapters shelf

On the History page and the Progress tab: a horizontal row of chapter covers
(small versions of the dark cover in section 2), newest first, then a "Running
now" card for any active goal at the front. Tapping opens the chapter page.

## 2. How a finished goal becomes a chapter

A **chapter** is a goal that ended, with its result frozen at that moment. This
section fills in what goals-layer.md calls "the frozen `chapter`".

### When it's written, and a change to the goals design

goals-layer.md says the chapter is written once when the goal ends. Late
logging breaks that: a coach or athlete often adds a session three days after the
fact (`MANUAL` and `SCREENSHOT` sources exist for this), and it would land in a
chapter that was already frozen. The change:

- **Ending a goal** (completed, or stopped early) sets its status immediately and
  starts the chapter as a **draft**, computed live from the goal and sessions
  exactly as the frozen version will be.
- **The chapter is sealed 48 hours after the end** (lazily, on the first read
  after that, so no scheduled job is needed), or at once if the user taps **Seal
  now**. Sealing writes the result to `Goal.chapter` with `sealedAt` set.
- **A sealed chapter never changes.** The one exception is a coach-only
  "Rebuild" if a bug is found, which writes a new version with `rebuiltAt` and is
  recorded in the audit log.

### The one frozen result

`Goal.chapter` is a single versioned JSON document, written once at sealing.
It's what the chapter page draws from.

```ts
type Chapter = {
  v: 1;
  sealedAt: string;
  name: string;                       // "75 Hard"
  category: "challenge" | "consistency" | "block" | "season";
  outcome: "completed" | "ended";
  line: string;                       // the one-line headline, written at sealing
  range: { startDay: string; endDay: string; days: number };  // yyyy-mm-dd, goal.timeZone
  numbers: {
    sessions: number; sets: number; minutes: number | null;   // null if under half have a duration
    tonnageLb: number; unloadedReps: number; activeDays: number;
    bestRun: { days: number; from: string; to: string };
    records: number;
  };
  attempts?: { from: string; to: string | null; days: number }[];   // reset goals
  strip: { unit: "day" | "week"; cells: ("met" | "partial" | "rest" | "excused" | "paused")[] }; // goal days or goal weeks
  rules: { key: string; label: string; met: number; of: number }[]; // "Outdoor session": 75 of 75
  lifts?: {
    exerciseId: string; name: string;
    unit: "lb" | "reps";                  // lb everywhere; reps for bodyweight lifts
    measure?: "e1rm" | "weight";          // present when unit is "lb": says what the numbers are
    start: number; end: number; best: number; target?: number;
  }[];
  records: { exercise: string; value: number; unit: "lb" | "reps"; day: string }[];   // up to 10
};
```

What's *not* in it, and why:

- **The sessions themselves.** They stay live in the history and are never copied.
- **The note and cover photo.** Those are editable, so they're separate fields on
  the goal (`chapterNote`, `chapterPhotoId`); the frozen result stays frozen.
- **Anything about other people.** A chapter is one athlete's.

**How the strip is built.** `freezeChapter()` evaluates the goal as of sealing time,
when every day has closed, so `needs_duration` and `open` have already become met
or missed under goals-layer.md's rules. The five stored cell states are display
states: `met` (all rules met), `partial` (some met), `rest` (nothing met, a hollow
cell, never coloured), `excused` and `paused`. The data state "missed" lives only in
`rules`, `attempts` and the numbers, and the word never reaches athlete-facing copy.
A `lift_target` entry has `measure: "e1rm"`; a lift shown from the athlete's
own heaviest weight has `measure: "weight"`, and the chapter labels which ("est. 1-rep max" or
"weight") so two lifts are never compared on different measures.

The `strip` is what makes the chapter's picture stable: the 75-dot grid on the
cover is drawn from the frozen `cells`, not recomputed from sessions, so editing
a session next year can't quietly change how a finished chapter looks.

### What the chapter page shows

A single scroll, top to bottom:

1. **Cover.** The dark feature surface (`--night`), the name in large serif, the
   dates in mono, and the `line` ("Completed. 75 days, third attempt." or "Ended
   on day 31."). **An ended goal gets the same cover, same type, same dignity.**
   Only the line differs. A person who got to day 31 of 75 did 31 days of 75 Hard.
2. **The strip.** The shape of the chapter: the 75-dot grid for a day goal
   (15 across, five down, a thin tick where an attempt reset), twelve week
   columns for a block, the season's weeks with game days marked for a team.
3. **Numbers.** A hairline stat row from `numbers`: sessions, time, sets, records.
4. **What it took.** The `rules` as plain lines with a thin bar: "Outdoor
   session, 75 of 75" and "Water, 71 of 75".
5. **By goal type:**
   - *Challenge with resets (75 Hard):* **attempts** as horizontal segments
     scaled by length, "9 days, 31 days, 75 days", the last one filled.
   - *Strength block:* **lifts** as a dot plot, start to end on one line per
     lift ("Squat 185 → 215, +16%"), a tick for the target if there was one,
     worded neutrally ("target 225, reached 215"). A lift that went down is shown
     plainly with its best.
   - *Season:* the athlete's own weeks, and "You trained 31 times across 14
     weeks, 11 of them active."
6. **Records** from the chapter, in gold.
7. **A line from you.** `chapterNote`, written by the athlete (or the coach, for a
   coached client), with one optional before and after photo pair from
   `ProgressPhoto`. Photos are the athlete's own choice; a coach can't attach them.
   **While `ClientProfile.isMinor` is set, photos and chapter photos are never
   available** (none can be added or attached, and any already attached stop being
   shown).
8. **The sessions.** A collapsed "The 150 sessions" list, **live** from history
   with a one-line note "as they are now". It can differ from the frozen
   numbers if something was edited later, and that's the right behaviour.

### Team seasons

A season produces one chapter **per member** (their own, same layout) and a
**team chapter** on `GoalGroup.chapter`, sealed after all member chapters are
sealed. The team chapter is aggregate only: members, total sessions, the
distribution of active weeks as a histogram, game days. **No names and no
ranking**, consistent with the decision that leaderboards are off and opt-in per
team. The coach sees it by default, and members see it only when the coach taps
"Share with the team" (`GoalGroup.chapterSharedAt`). **A team needs at least 5
participants** for the histogram, where a participant is a member with at least one
finished session in their goal window (members who left early count if they
participated). With fewer, the team chapter is one combined total (sessions and
weeks), with no histogram and no count of people, so a small group can't be read
person by person. These fields are in the `GoalGroup` model in
goals-layer.md.

## 3. Non-linear training that still looks like progress

The history must look like progress for someone who does a different thing every
week, skips plans and logs a walk and a deadlift in the same month. Strava-style
"pace over time" curves can't do that. Seven rules:

1. **Everything counts toward totals.** Source, plan or no plan, doesn't matter.
   Off-plan sessions look identical to plan sessions; the provenance tag exists
   in the data but is never shown on these views.
2. **"Work" replaces tonnage as the common currency** for heatmap intensity and
   best week: minutes, hard sets, or presence, whichever is largest. A person who
   only walks and does bodyweight work gets a full, colourful history.
3. **Strength is shown only where there's something to say,** and as a **best-so-far
   staircase**, not a trend line. For a lift with 3 or more non-lighter sessions
   in 3 or more different weeks, the chart is the running maximum of the
   session's best estimated 1-rep max, faint dots for the raw points beneath
   it. A trend line punishes irregular training (an odd rep range or a lighter
   week reads as a dip); the staircase says "the strongest you've shown", and is
   honest because it's labelled that way. Inside a *chapter* the trend
   (start to end) is used, because there the athlete chose the window.
4. **Breadth is progress too:** "63 different exercises", "9 of 11 movement
   patterns", and a "first time" entry when a new lift appears. For someone who
   never repeats a lift, variety is what's real.
5. **Consistency means weeks active, not a day streak.** "41 of 52 weeks", the
   longest run of weeks, and the best 28 days. A person who trains every ten days
   still scores well on weeks active, while a day streak would read zero.
6. **Compare people to their own past, in equal windows:** "This quarter 31
   sessions, last quarter 24", or the same month a year ago. Never to a target
   they didn't set.
7. **Comebacks are events.** A gap of 21 days or more followed by a session produces
   "Back on March 3" in the timeline. The gap is shown as quiet space and the
   return is the marked moment, so a break reads as part of the story.

### New and thin histories

- **Under 3 sessions:** no heatmap grid; the History page shows "Day one" with
  the first session and one line ("Your history starts here"). Lifetime numbers
  appear as plain figures with no zeros and no "0 records".
- **No loaded lifts:** the Best so far panel is hidden, not empty.
- **Under a month:** the heatmap shows only the weeks since the first session.

### Copy rules

No exclamation marks. Past tense and plain numbers ("You trained 31 times."). Never
"missed", "lost", "broke", "behind", "failed", or "only". The existing milestone
copy ("First session logged!") gets rewritten to match.

## 4. Visual direction

**What makes it feel like Atlas and not Strava.** Strava is a feed of
activities: maps, orange, kudos, segments, leaderboards, a trophy for every
effort, each workout a card to compare. This is the opposite on purpose:

- **Paper and ink, not a dashboard.** The app already has the right tokens: warm
  bone background (`--bone`), white paper surfaces, near-black ink, the green
  signal (`--signal`), and `--night` for dark feature surfaces. The History pages
  use them with more air and fewer boxes.
- **Serif numerals.** Counts and titles in Instrument Serif (`--font-display`),
  everything else in Geist, dates and labels in Geist Mono eyebrows. Numbers get to
  be large and quiet, like a printed year-in-review.
- **Hairlines instead of cards**, as `StatRow` already does. Structure comes from
  1px rules and spacing.
- **One accent and one reward colour.** Green means "you trained"; gold appears
  *only* on personal records. No other bright colour exists on these screens, so
  a gold ring means something.
- **No social layer.** No feed, no likes, no people. Sharing, if it's added later, is a
  saved image the athlete makes of their own chapter.
- **Slow motion.** Rows of the heatmap fade in a few at a time (about a second
  in total), the timeline reveals with the existing `FadeIn`, chapter covers
  don't animate. Reduced-motion is already honoured globally in `globals.css`.
- **Dark mode** works from the existing `.dark` tokens; heatmap steps use the
  lighter `--blue` ramp so they hold up on `#0C0E14`.

### Four screens

**History (phone, 390px).** Top: a mono eyebrow "SINCE MARCH 2026", then **214**
in 72px serif with "sessions" beside it. A hairline stat row: 3,918 sets · 612,400
lb moved · 37 records. Then "41 of the last 52 weeks active" and the heatmap:
the current week's seven dots at the top, rows scrolling down, month names in
serif at the left, a faint tinted band behind a chapter's rows with "75 Hard" in
the margin, a gold ring on two or three days. Below: "Best so far" with three
lifts as small staircases, then the chapters shelf.

**Timeline.** A single hairline at the left edge. A large pale "2026" behind the
first entries. An entry: `MARCH 3` in mono, **Back on March 3** in serif, "First
session in four weeks." beneath, and above it the dashed spine and "Three quiet
weeks." Further down a gold dot: **Bench press 225 lb.** A black full-width panel
interrupts the scroll: *75 Hard*, "Completed. 75 days, third attempt." and a small
75-dot grid, with an "Open chapter" link.

**Chapter, 75 Hard.** A night-coloured cover, "75 Hard" at 64px serif, `JAN 4 – MAR 19`
in mono, the result line. Below on paper: the 75-dot grid in green with two thin
ticks where attempts reset, the three attempts as segments (9, 31, 75), a stat row
(150 sessions · 112 hours · 75 outdoor), rules with bars, and a note from the athlete
in serif italic. "The 150 sessions" collapsed at the bottom.

**Chapter, strength block.** The same cover, "12-week block". Twelve slim week
columns, each filled by sessions that week. Then three lifts as horizontal dot
plots: `Squat 185 ○────────● 215  +16%`, `Bench 155 → 170`, `Deadlift 225 → 245`, with a
small tick at the target if there was one. A season chapter swaps the plots for
the athlete's own weeks with game days marked as small flags.

## 5. Data each view needs, and what's missing today

All views need the same base: finished sessions for one client with their local
day, sets, duration and goal membership. A single loader,
`loadHistory(client, tz)`, returns per-day records
(`{ day, sessions, minutes, sets, hardSets, tonnageLb, unloadedSets, records, chapters }`),
and every view is a pure function of that plus milestones and sealed chapters.

| View | Needs | Source today |
|---|---|---|
| Heatmap | per-day sessions, minutes, hard sets, record flag, chapter membership | `WorkoutLog.date`, `durationMin`, `SetLog`; chapters from `Goal` (new) |
| Lifetime | totals, active weeks, longest run, best stretch, records | `loadProgress` totals (partly) |
| Best so far | per-lift running max e1RM | `buildSeries` / `personalRecords` |
| Timeline | all events above, with the date they happened | `Milestone` rows plus derived events |
| Chapter | sealed `Goal.chapter`, notes, live session list | goals layer (new) |

**What's missing or wrong today** (all verified in `../Atlas`):

| # | Gap | Effect | Fix |
|---|---|---|---|
| 1 | `loadProgress` counts a session only if it has a completed set (`sessionDates` is filled inside the set loop). | Finished sessions with no sets are invisible: the empty finished sessions the session-first migration creates, typed-in sessions, and 75 Hard's outdoor session. | `loadHistory` reads `WorkoutLog` where `completedAt` is set, with sets joined in. Replace `totals` in `loadProgress` with it. |
| 2 | Only the **current** week streak exists (`weekStreak`). | Nothing for "longest run" or "best stretch". | Two pure functions in `lib/history/lifetime.ts`. |
| 3 | Volume is `weight × reps`; bodyweight, bands and timed work add 0. | Lifetime "moved" and the heatmap would look flat for non-barbell training. | The "work" measure, `unloadedReps`, and minutes. |
| 4 | `durationMin` is often null. | Minutes under-count; goals with a minimum-minutes rule need it too. | Show Time only when over half of sessions have it; the "needs duration" prompt from the goals design fills it going forward. |
| 5 | `Milestone.achievedAt` is `new Date()` at award time. | A session logged late or typed in later puts its milestone on the wrong day in a timeline. | Pass the session's `date` into `award()`. The timeline derives events from sessions and uses stored rows only for their copy and `seenByClient`. |
| 6 | `checkSessionMilestones` counts every `WorkoutLog`, finished or not. | "First session" and the session count fire on an in-progress session; MCP never calls it at all (see mcp-roadmap.md). | Count `completedAt != null`; call it from the shared session-finish code. |
| 7 | Two PR definitions: `buildSeries` `record` (heaviest weight) vs `personalRecords()` (max weight and max e1RM). | The Records number could disagree with Best so far. | One rule: **record** = heaviest weight ever (gold), **best** = new best e1RM or rep progress (quiet). Both from `buildSeries`. |
| 8 | `loadProgress` reads **every set the client has ever logged** with no limit. | Fine at 12 weeks, slow at 4 years. | Measure first; add a per-day rollup only if `loadHistory` exceeds about 300 ms. |
| 9 | Timezone is a per-request cookie. | A coach viewing an athlete's heatmap in a different zone sees some sessions on neighbouring days. | Use the goal's stored `timeZone` inside chapters (already planned). For the heatmap, store the athlete's zone on `ClientProfile.timeZone` (additive column, allowed by goals-layer principle 3). Filled once from the athlete's browser on first load, never overwritten, editable in settings; the request cookie is the fallback while it is null. |
| 10 | No "kind" of session. | The heatmap can't tell a walk from a lift. | Deliberately none in v1: presence, minutes and title are enough. Revisit if people ask. |
| 11 | No chapter, no goals. | Chapters, bands. | Comes from goals-layer.md. |
| 12 | Muscle names in `Exercise.primaryMuscles` are free strings. | A "muscles trained" body view would be unreliable. | Not in this design. Revisit when generator-v2's normalization exists. |

## 6. Build order and risks

Each step ships alone with tests. Steps 1 to 5 need no schema change.

0. **Prerequisite:** the session-first work merged here.
1. **`lib/history/days.ts`**: pure, sessions and sets in, day records out (work,
   hard sets, records, minutes). Tests on the fixtures generator-v2 builds.
2. **`lib/history/lifetime.ts`**: totals, active weeks, longest week run, best
   28-day stretch; fix gap 1 and replace `totals` in `loadProgress`. This alone
   makes the existing Progress screen's session count honest.
3. **Milestone fixes**: gaps 5 and 6 and the PR rule in gap 7; derive the
   timeline in `lib/history/timeline.ts` with the five-a-month cap and the gap
   and comeback rules. Rewrite the copy to the copy rules.
4. **Heatmap component** and the History page for the athlete, with the day
   sheet. Mobile first; dark mode; accessibility labels.
5. **Lifetime and Best so far panels**, then the timeline UI, then the coach's
   Sessions-tab heatmap.
6. **`freezeChapter()`**: pure, goal and sessions in, `Chapter` out, with tests per
   goal type and a snapshot per fixture. Needs the goals evaluator, so it follows
   goals-layer step 1.
7. **Chapter storage and sealing**, with the draft and 48-hour rule, `chapterNote`
   and photo. **Migration needed: ask the user first and follow the backup steps in
   HANDOFF.md.** It lands with the goals migration, not before. **Do the photo
   audit first** (goals-layer.md, "Build checklist: the minor flag and photos"): every
   path that adds, shows or exports a progress photo must enforce `isMinor`.
8. **Chapter page** and shelf, one layout per category.
9. **Team chapter** (`GoalGroup.chapter`, aggregate only, coach shares).
10. **Later:** save a chapter as an image; a yearly review page (a chapter made
    from a calendar year, same machinery).

**Risks:**

- **Late logs vs. frozen chapters.** The draft and 48-hour seal handle most cases,
  but a session added after sealing is correctly absent from the chapter and
  present in the live list. Say so on the page, in one line.
- **A frozen bug is permanent.** Hence `v`, `rebuiltAt` and a coach-only rebuild;
  and `freezeChapter` has more tests than any other function here.
- **Empty and thin states set the tone.** A blank grid feels like a scoreboard
  of failures; the "Day one" state and no zeros are requirements, not polish.
- **Relative intensity can mislead** a person who changes training style: a
  month of walking dims a lifter's old big days. Percentiles are computed over
  the whole history, so old colours don't shift when new data arrives.
- **Gold inflation.** If anything else gets gold, records lose meaning. The rule
  is one line in the style notes and a test that fails on a second use of the
  token.
- **Performance** on long histories (gap 8). Measure on the six generator-v2
  fixtures scaled to four years before adding any table.
- **Privacy of youth members:** no names in team chapters, a 5-member minimum for
  anything beyond one combined total (counting participants), no coach-attached
  photos, no photos at all while `isMinor` is set, no sharing features by default.
  The flag has no birthdate behind it. It is set for everyone on a roster when the
  coach answers "Is this a youth team?" at group creation, so it doesn't depend on
  flagging members one by one, but a minor on a non-youth group is still only
  covered if the coach sets the flag.
  Needs the same review as the group-goal visibility rule before step 9 ships.
- **Timezone off-by-one** in day assignment: the same test fixtures as the
  goals evaluator (UTC+13 and UTC-10) apply here.

## Changes this asks of goals-layer.md

All four are now in goals-layer.md:

1. The chapter is a **draft at end, sealed on the first read 48 hours later** (or on
   "Seal now"), instead of written once at the moment of ending.
2. `Goal` gains `chapterNote` and `chapterPhotoId` (editable), kept outside the
   frozen result.
3. `GoalGroup` gains an aggregate-only `chapter` and `chapterSharedAt`, sealed after
   its members'.
4. The chapter JSON gets the shape in section 2, including the `strip` the
   cover is drawn from.

## Decisions, second round (2026-11-13)

Mirrored in goals-layer.md: lb everywhere with `measure` (`e1rm` or `weight`) stored
per lift; `Goal.category`; five display states in the strip, with the data state
"missed" kept out of copy; Monday calendar weeks for the heatmap and lifetime
stats, goal weeks for a chapter's strip; `ClientProfile.timeZone` and
`ClientProfile.isMinor` allowed as additive columns; no photos while the flag is
set; a 5-member minimum for a team chapter's histogram; no daily job, since goals
close and chapters seal lazily on read.

Third round: the strip keeps five states with `rest` for a day with nothing met (no
sixth state); the 5-member minimum counts **participants** (members with at least
one finished session in their goal window, including members who left early);
`isMinor` is set for the whole roster by the "Is this a youth team?" question at
group creation; and `ClientProfile.timeZone` is filled once from the browser and
never overwritten.
