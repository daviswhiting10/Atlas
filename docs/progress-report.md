# Progress report

A one-page report for each finished four-week block of a plan, for coach-built and personal plans alike.
It is worked out when opened. Nothing is stored: no new field, no cron, no schema change.

## What it shows
- One report per finished block: weeks 1-4, 5-8, 9-12 of a plan, counted from the plan's start day.
  Blocks are compared within themselves: week 1's best set against the block's best set (not week 4, which is lighter).
- No block number, client name, coach name, quote or note on the page. A label, the block's dates, a headline, three stats, charts.
- Newspaper style: black ink on #F7F3EA, Playfair Display headlines, Libre Baskerville body, double and single rules.
  Fits one Letter page. Save as PDF is the print dialog (print stylesheet, no PDF library).

## When a block has a report
- The block has ended: its last day (start + 28 days x block - 1) is before today, in the viewer's time zone.
- It has sessions in at least two of its four weeks. Until then there is no row, card or page.
- A canceled plan has none.

## The numbers (`lib/report/build.ts`)
Reuses `datedFinished` and `isLoggedSet` (lib/history), `sessionPoint` (lib/plan/overload) and `prsOverTime` (lib/history/records).
New: the week-1-vs-best comparison and the line that only rises.
- **Improved**, per exercise, with sessions in at least two weeks (under that it is skipped):
  - a heavier top set at the same or more reps (`+30 lb`, `185 to 215`);
  - more reps at the same weight (`+3 reps`, `8 to 11 reps at 135 lb`; bodyweight lifts the same);
  - less assistance on an assisted lift, recognised by name ("assist"): `20 lb less assistance`, `60 to 40 lb assist`.
- **Chart**: each week's best so far, week 1 to week 4, a thin black line with a dot on the last week. It never dips
  (a lighter week keeps the best so far), so an improved lift always rises, assisted lifts included (flipped).
- Charts: only improved lifts, ranked by gain relative to where the block started, at most 8.
- **Stats**: sessions completed (of those planned, skipped ones excluded); lifts improved (of lifts with two weeks of data);
  total volume change (the best working week against week 1; a lighter last week never counts).
  Never a negative: if volume is not up, the third stat becomes PRs set; with no PRs it is left out.
- Nothing improved: consistency only (sessions completed), no charts, headline "Four weeks in, and you showed up."

## Where it shows up
- Coach: a row on the client page under "Log session" (Roster, client, row: 3 taps).
- Athlete: a small card on Today for 7 days after a block ends (1 tap), and a row per report on Plan (Plan, row: 2 taps).
- `/report/<plan>/<block>`, with no app chrome. An athlete opens only their own plan's; a coach only plans in their workspace.
  Anything else is a 404.

## Not built
- No notification when a block ends. No stored copy: editing an old session changes its report.
