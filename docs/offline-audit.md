# Offline resilience audit

2026-11-24, on a production build of `main` plus this branch, against `dev-sessions`. Real Chromium at 390×844 with touch; "offline" is the browser's own network switch (every request fails at once), so it is a clean drop, not a slow or flaky link. Not tried: a real phone, airplane mode on iOS, a connection that half-works.

## What was tried, and what happened

| # | Connection drops… | Before this branch | After |
|---|---|---|---|
| S1 | mid-set (two sets ticked offline) | Worked already: ticks stay on screen, are kept on the phone, and reach the server on reconnect (2 of 2 saved) | same |
| S2 | tick offline, back online, page reloaded before the retry | Worked already: the tick is on the screen after the reload and on the server (1 of 1) | same |
| S3 | mid-finish (Finish tapped offline) | Worked already: "Offline. Finishes when you're back." then the workout completed after reconnect | same |
| S4 | coach taps Finish offline | Went back to the logger with a generic "Failed to complete session" | "No connection. Your sets are saved on this phone. Tap Finish when you're back." (the sets themselves were already kept and resent) |
| S5 | mid-invite | No `try/catch` around the request: a thrown error, nothing said, and the "Yes, make the link" sheet never closed (read from the code, not run before the fix) | "No connection. Nothing was changed. Try again when you're back."; sheet closes; no uncaught error |
| S6 | mid-add-client, and a lost reply | Offline: no message at all (observed). Lost reply: a second tap on Add posts again and makes a second client (read from the code: the endpoint has no way to tell) | Offline: message, and the form keeps what was typed. Lost reply: the server got one request, the retry found that client and used it: **one** client on the roster |
| S7 | mid-save-plan (editing an exercise's target) | An unhandled rejection: nothing said, and unclear what the editor shows (read from the code) | The message, the editor stays open with the typed values, and the retry online saves and closes it |
| S8 | a second phone logged the same set while this one was offline | Last writer wins, silently: the late save overwrites the other phone's (read from the code; I did not run it on the old build) | The other phone's set stands; the offline phone shows it and says "Set 4 was changed on another device. Showing that version." |

## The finding that mattered most

**The app reloaded the whole page the moment the connection came back** (`reloadOnOnline: true` in the PWA config, set when the service worker was added). Anything half-typed was lost on reconnect: the Add client form, a plan note, an open sheet. It is also why S2 "worked": the reload re-read the kept ticks. It is now off. The logger resends its own ticks (it has its own `online` handler), and a save that fails says so and re-reads the page when the connection returns. If you would rather keep the reload, it is one line in `next.config.mjs`; the loss of typed text on reconnect comes with it.

## What changed

- `lib/net/guard.ts`: one place that turns a failed save into a sentence (`NO_CONNECTION`), re-reads the page once when the connection returns, and finds a client "added a moment ago" so Add never makes a second copy. Used by the plan editor (athlete's Plan and the coach's plan editor are the same view), assign and discard of a draft plan, Add client and Invite.
- `lib/sessions/replay.ts` and both save actions: a tick replayed after being offline says what the phone last knew the server had; if another device changed it, the server keeps theirs and answers with it. Only ticked or not is compared.
- The page no longer reloads itself on reconnect.

## What it can't do (decide, don't assume)

- **Whose tap came first.** A set has no "changed at" on the server. When two devices disagree, the one that reached the server first stands and the late one is told. Fixing that properly means a `updatedAt` on `SetLog`, which is a migration (backup, rehearsal on a branch, counts): I did not do it.
- **Weights typed on two devices into a set both ticked** are still last-writer-wins; only ticked / not ticked is compared.
- **The coach's Finish is not queued offline** (the athlete's is). It asks for a second tap online. The sets are safe either way. Queueing it means keeping the session notes (SOAP) on the phone as well.
- **Invite after a lost reply** can send a second email (a new link each time); nothing is duplicated in the data.
- Not tried: a half-working connection (slow, dropping every few seconds), and Safari's own offline behaviour.

## Tests

- In the suite (run with `npx vitest run`): `lib/net/guard.test.ts` (the guard, the duplicate-client match), `lib/sessions/replay.test.ts` (the conflict rule), `lib/net/wiring.test.ts` (every surface above uses the guard; both loggers mark replays and show the server's version), `lib/net/reload.test.ts` (reload off).
- In a browser, `scripts/offline-audit/offline-e2e.mjs` (S1 to S8; the header says how to run it).
