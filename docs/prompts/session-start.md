# Atlas — Session Start Prompt

Read docs/STATE.md and docs/prompts/ before doing anything.

Here's where we are and what needs fixing, in priority order:

## 1. Inbox page redirects to login (auth issue)
`/inbox` bounces unauthenticated. Debug why — every other page loads but inbox doesn't. Check if the inbox route has a different auth pattern or if it's making an API call that fails and triggers a redirect.

## 2. Page-level crashes — filter/map on non-arrays
Programs, and potentially sessions/leads/outreach, crash with `e.filter is not a function`. Same root cause as the clients fix from last session. Audit every dashboard page that calls an API and immediately chains `.filter()`, `.map()`, or `.find()` on the response. Fix the shape mismatch in one pass across all pages.

## 3. Dropdowns not working
UI dropdowns throughout the app are non-functional. Identify the component being used and fix it.

## 4. Resend email delivery
`RESEND_API_KEY` is set in Vercel. Magic links are going but not delivering to Gmail. Check `lib/auth.ts` `sendVerificationRequest` — confirm it's calling Resend correctly and the `from` address is using the verified Resend domain. Log any Resend API errors explicitly.

## 5. Voice feature in session notes
Not working. Lower priority — don't touch until 1–4 are green.

---

After fixing 1–4, do a full smoke test: every nav item loads, no console errors, API calls return correct data shapes.

Then move to Phase 3 feature completion per docs/STATE.md.
