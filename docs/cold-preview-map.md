# Cold visitor map

Every screen, button, link, sheet and transition a visitor reaches from the link, signed out and in the demo (a coach with their own training and five clients). Built from the click crawl (phone 390×844 and desktop 1440×900) on the cold-preview branch.

Entry: the link → landing (`/`) → **Explore a live demo** (one tap, ~5 s) → Today (Me). **Coach | Me** in the top right switches sides. **Build my plan** → `/start` (4 questions) → **Try it without an account** → a fresh plan on Today.

## Signed out (the link)

### `/`

| Control | Where it goes |
|---|---|
| Sign in | → /login |
| Get started | → /start |
| Watch an AI assistant use Atlas | → /agents |
| For AI assistants → | → /agents |

### `/start`

| Control | Where it goes |
|---|---|
| Atlas home | → / |
| Sign in | → /login |
| Build muscle | already here / selected |
| Get stronger | changed the page |
| Lose fat | changed the page |
| Stay fit | changed the page |
| Continue | changed the page |

### `/login`

| Control | Where it goes |
|---|---|
| Atlas home | → / |
| Sign in | already here / selected |
| Forgot password? | → /forgot-password |
| Coach or invited client? Get a sign-in link instead | changed the page |

### `/agents`

| Control | Where it goes |
|---|---|
| Atlas home | → /, → /log |
| Get started | → /log, → /start |
| Watch the demo | changed the page |
| See the 10 tools | already here / selected, changed the page |
| Play | changed the page |
| Claude Code | already here / selected, changed the page |
| Cursor | changed the page |
| As yourself | changed the page |
| HTTP | changed the page |
| Copy | changed the page |
| For AI assistants | changed the page |

### `/forgot-password`

| Control | Where it goes |
|---|---|
| Atlas home | → / |
| Email me a link | already here / selected |
| Back to sign in | → /login |

## Athlete side (Me)

### `/today`

| Control | Where it goes |
|---|---|
| Atlas home | already here / selected |
| Coach | → /log |
| Me | already here / selected |
| Today | already here / selected |
| Plan | → /plan |
| Progress | → /progress |
| You | → /you |
| Start | → /workouts/:id |
| Log another workout | → /workouts/new |

### `/plan`

| Control | Where it goes |
|---|---|
| Atlas home | → /today |
| Coach | → /log |
| Me | → /today |
| Today | → /today |
| Plan | already here / selected |
| Progress | → /progress |
| You | → /you |
| Change goals | → /you?goals=1 |
| FoundationWeeks 1–4 | changed the page |
| BuildWeeks 5–8 | changed the page |
| PeakWeeks 9–12 | already here / selected |
| Wk1 | changed the page |
| Wk2 | changed the page |
| Wk3 | changed the page |
| Wk4 | changed the page |
| Wk5 | changed the page |
| Wk6 | changed the page |
| Wk7 | changed the page |
| Wk8 | changed the page |
| Wk9 | changed the page |
| Wk10 | changed the page |
| Wk11 | changed the page |
| Wk12 | already here / selected |
| Upper AUp next6 exercises ~65 min | changed the page |
| See Bench Press | opened a sheet/menu |
| Edit target for Bench Press | changed the page |
| See Barbell Row | opened a sheet/menu |
| Edit target for Barbell Row | changed the page |
| See Overhead Press | opened a sheet/menu |
| Edit target for Overhead Press | changed the page |
| See Lat Pulldown | opened a sheet/menu |
| Edit target for Lat Pulldown | changed the page |
| See Dumbbell Curl | opened a sheet/menu |
| Edit target for Dumbbell Curl | changed the page |
| See Triceps Pushdown | opened a sheet/menu |
| Edit target for Triceps Pushdown | changed the page |
| Add an exercise | opened a sheet/menu |
| Start this workout | → /workouts/:id |
| Skip | changed the page |
| Lower A6 exercises ~55 min | gone |
| Upper B6 exercises ~55 min | changed the page |
| Lower B6 exercises ~55 min | changed the page |
| Add a workout to week 12 | changed the page |
| BUTTON | changed the page |
| Remove Bench Press | destructive: → /plan |
| Remove Barbell Row | destructive: → /plan |
| Remove Overhead Press | destructive: → /plan |
| Remove Lat Pulldown | destructive: → /plan |
| Remove Dumbbell Curl | destructive: → /plan |
| Remove Triceps Pushdown | destructive: → /plan |
| Remove Upper A from the plan | destructive: → /plan |
| Swap | opened a sheet/menu |

### `/progress`

| Control | Where it goes |
|---|---|
| Atlas home | → /today |
| Coach | → /log |
| Me | → /today |
| Today | → /today |
| Plan | → /plan |
| Progress | already here / selected |
| You | → /you |
| All lifts | opened a sheet/menu |
| A day on the history calendar | opened a sheet/menu |
| 30-day resetAug 15 – Sep 13, 2026 | destructive: gone |
| 30-day resetAug 15 – Sep 14, 2026 | destructive: gone |

### `/you`

| Control | Where it goes |
|---|---|
| Atlas home | → /today |
| Coach | → /log |
| Me | → /today |
| Today | → /today |
| Plan | → /plan |
| Progress | → /progress |
| You | already here / selected |
| How it works | opened a sheet/menu |
| Watch an AI assistant use this dataHow Claude reads Alex's p | → /agents |
| Change goals | changed the page |
| Sign out | destructive: → /you |

### `/workouts/:id`

| Control | Where it goes |
|---|---|
| Back to today | → /today |
| Lower AWeek 12 · 0/20 sets · 0:01 | gone, opened a sheet/menu |
| 1Back Squat0/4 sets | already here / selected |
| 2Romanian Deadlift0/4 sets | changed the page |
| 3Dumbbell Lunge0/3 sets | changed the page |
| 4Leg Curl0/3 sets | changed the page |
| 5Standing Calf Raise0/3 sets | changed the page |
| 6Plank0/3 sets | changed the page |
| Add an exercise | opened a sheet/menu |
| See Back Squat larger | opened a sheet/menu |
| Swap | opened a sheet/menu |
| Change target | changed the page |
| Decrease Set N weight | already here / selected |
| Increase Set N weight | already here / selected |
| Decrease Set N reps | already here / selected |
| Increase Set N reps | already here / selected |
| Mark set N done | changed the page |
| Add a set | changed the page |
| Remove | destructive: gone |
| Atlas home | → /today |
| Today | → /today |
| Plan | → /plan |
| Progress | → /progress |
| You | → /you |
| Coach | → /log |
| Me | → /today |

### `/workouts/new`

| Control | Where it goes |
|---|---|
| Today | already here / selected, → /today |
| Back Squat | changed the page |
| Deadlift | changed the page |
| Hip Thrust | changed the page |
| Leg Press | changed the page |
| Leg Extension | changed the page |
| Standing Calf Raise | changed the page |
| Hanging Knee Raise | changed the page |
| Incline Dumbbell Press | changed the page |
| Just a name and a time (walk, run, class) | gone |
| Atlas home | → /today |
| Plan | → /plan |
| Progress | → /progress |
| You | → /you |
| Coach | → /log |
| Me | → /today |

### `/goals/:id`

| Control | Where it goes |
|---|---|
| Atlas home | → /today |
| Coach | → /log |
| Me | → /today |
| Today | → /today |
| Plan | → /plan |
| Progress | → /progress |
| You | → /you |
| The 17 workouts | changed the page |

## Coach side

### `/log`

| Control | Where it goes |
|---|---|
| Atlas home | already here / selected |
| Coach | already here / selected |
| Me | → /today |
| Log session | already here / selected |
| Roster | → /clients |
| More | opened a sheet/menu |
| CChris OkaforNext: Upper A · week 6 · last Nov 16Log | → /clients/:id/log |
| JJordan LeeNext: Upper A · week 8 · last Nov 16Log | → /clients/:id/log |
| MMaya ChenNext: Full Body A · week 4 · last Nov 16Log | → /clients/:id/log |
| SSam PatelNext: Full Body A · week 11 · last Nov 16Log | → /clients/:id/log |
| RRiley MorganNo plan yetSet up plan | → /clients/:id?tab=build |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/clients`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | already here / selected |
| More | opened a sheet/menu |
| Import | → /clients/import |
| Add Client | opened a sheet/menu |
| RRiley MorganHypertrophy0 workouts logged | → /clients/:id |
| CChris OkaforWeight Loss16 workouts logged | → /clients/:id |
| MMaya ChenGeneral Fitness9 workouts logged | → /clients/:id |
| SSam PatelPerformance29 workouts logged | → /clients/:id |
| JJordan LeeHypertrophy26 workouts logged | → /clients/:id |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/programs`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| Import from photos | → /programs/import |
| Programs | already here / selected |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/exercises`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| In your plans · 28 | already here / selected |
| All · 177 | changed the page |
| See Back Squat | opened a sheet/menu |
| See Barbell Row | opened a sheet/menu |
| See Bench Press | opened a sheet/menu |
| See Deadlift | opened a sheet/menu |
| See Dumbbell Bench Press | opened a sheet/menu |
| See Dumbbell Curl | opened a sheet/menu |
| See Dumbbell Lunge | opened a sheet/menu |
| See Dumbbell Romanian Deadlift | opened a sheet/menu |
| See Dumbbell Shoulder Press | opened a sheet/menu |
| See Face Pull | opened a sheet/menu |
| See Farmer's Carry | opened a sheet/menu |
| See Goblet Squat | opened a sheet/menu |
| See Hanging Knee Raise | opened a sheet/menu |
| See Hip Thrust | opened a sheet/menu |
| See Incline Dumbbell Press | opened a sheet/menu |
| See Lat Pulldown | opened a sheet/menu |
| See Lateral Raise | opened a sheet/menu |
| See Leg Curl | opened a sheet/menu |
| See Leg Extension | opened a sheet/menu |
| See Leg Press | opened a sheet/menu |
| See Overhead Press | opened a sheet/menu |
| See Pallof Press | opened a sheet/menu |
| See Plank | opened a sheet/menu |
| See Pull-Up | opened a sheet/menu |
| See Romanian Deadlift | opened a sheet/menu |
| See Seated Cable Row | opened a sheet/menu |
| See Standing Calf Raise | opened a sheet/menu |
| See Triceps Pushdown | opened a sheet/menu |
| Programs | → /programs |
| Exercises | already here / selected |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/settings`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| How it works | opened a sheet/menu |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | already here / selected |
| Sign out | destructive: → /login |

### `/intake`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| Choose a clientChris OkaforJordan LeeMaya ChenRiley MorganSa | already here / selected |
| Weight loss | already here / selected |
| Muscle gain | already here / selected |
| Strength | already here / selected |
| Pain management | already here / selected |
| Athletic performance | already here / selected |
| Endurance | already here / selected |
| General fitness | already here / selected |
| No program yet | already here / selected |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | already here / selected |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/clients/:id/log`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| Chris Okafor | → /clients/:id |
| Wed, Nov 18 · Week 6 · Upper A | opened a sheet/menu |
| See Bench Press | opened a sheet/menu |
| Collapse Bench Press | changed the page |
| Set N: load type, RPE and note | changed the page, gone |
| Log set N | changed the page, gone |
| Add set | changed the page, gone |
| Note | changed the page, gone |
| Change | changed the page, gone |
| See Barbell Row | opened a sheet/menu |
| Collapse Barbell Row | changed the page |
| See Overhead Press | gone, opened a sheet/menu |
| Collapse Overhead Press | changed the page, gone |
| See Lat Pulldown | opened a sheet/menu |
| Collapse Lat Pulldown | changed the page |
| See Farmer's Carry | gone, opened a sheet/menu |
| Collapse Farmer's Carry | changed the page, gone |
| Add exercise | changed the page |
| Session Notes (SOAP) | changed the page |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Wed, Nov 18 | already here / selected |
| Week 1Week 2 ✓Week 3 ✓Week 4Week 5Week 6Week 7Week 8Week 9We | → /clients/:id/log?workoutId=c9765ad8d98b4a7f9d44e756a5f5a922 |
| Lower ALower BUpper AUpper B | → /clients/:id/log?workoutId=afa3cb1dacc34a17b461e105a59e4f87 |
| N/A | changed the page, gone |
| × | already here / selected, gone |
| BUTTON | changed the page, gone |
| s | already here / selected |
| Sign out | destructive: gone |
| Remove set N | destructive: gone |

### `/clients/:id?tab=build`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /clients/:id/log, → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| More for Riley Morgan | opened a sheet/menu |
| Sessions | already here / selected |
| Plan | changed the page |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/clients/import`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| Choose a CSV file, or drop it hereOne client per row, with a | already here / selected |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

### `/programs/import`

| Control | Where it goes |
|---|---|
| Atlas home | → /log |
| Coach | → /log |
| Me | → /today |
| Log session | → /log |
| Roster | → /clients |
| More | opened a sheet/menu |
| Programs | → /programs |
| Exercises | → /exercises |
| Intake | → /intake |
| Settings | → /settings |
| Sign out | destructive: → /login |

## Sheets and menus

How it works (You, Settings) · All lifts (Progress) · a day on the history calendar (Progress, client Sessions) · More (coach tab bar) · the logger's date sheet (coach Log) · Invite (client ⋯) · exercise picture (workouts). Each closes with its X / Skip, a tap outside, and Escape.
