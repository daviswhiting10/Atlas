# Atlas Design Principles (the Musk lens)

## Priority order
1. Functionality. It must work, every time.
2. User experience. Insanely good: fast, obvious, no friction.
3. Elegant design. Dusk stays clean and consistent.
Brutally simple, with all excess wiped.

## The algorithm (in order, never skip ahead)
1. Question every requirement. Each feature needs a reason. "The app has it" is not a reason.
2. Delete. Cut screens, settings, taps, steps. If we never add back ~10% of what we cut, we didn't cut enough.
3. Simplify and optimize, only after deleting.
4. Speed up the cycle: tap to logged, idea to deployed.
5. Automate last. Never automate a step that should be deleted.

## Rules of thumb
- The best part is no part. Every screen, setting, tap and component is a cost.
- First principles: Atlas = log a set fast, see progress, get coached. Everything else earns its place.
- Idiot index: taps per set logged ÷ 1. Drive it toward 1.
- The build process gets the same simplicity treatment.
- Measure in seconds and taps, on a real phone.

## Targets
- Open app to first set logged: under 5 s.
- 1 tap to log a set.
- No spinner flashes, ever.

## Cutting safely
- Finish in-flight work first.
- Deletion audit is read-only; Davis marks Keep / Cut / Merge; cut in one pass behind a rollback commit.
- UI cuts only. Data/schema cuts need backup, rehearsal, and Davis's approval.
