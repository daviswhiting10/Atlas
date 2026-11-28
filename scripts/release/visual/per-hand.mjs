// Screenshots of the dumbbell "per hand" toggle in both loggers: ×2 (the default), then ×1 after a tap. Mobile and desktop.
// Setup: a local production build on BASE against the local Postgres (sample data).
//   BASE=http://localhost:3962 OUT=<dir> USER_ID=<local coach> WORKSPACE_ID=<ws> \
//   ATHLETE_WORKOUT=<the coach's own workout with a dumbbell exercise> ATHLETE_EXERCISE="Dumbbell Curl" \
//   CLIENT_ID=<client profile> CLIENT_WORKOUT=<assigned workout> CLIENT_EXERCISE="Incline Dumbbell Press" \
//   node scripts/release/visual/per-hand.mjs
// Opening a logger starts a live session in the local database; nothing is logged.
import path from "node:path";
import { SIZES, chromium, logger, signedIn } from "./session.mjs";

const { BASE, OUT, USER_ID, WORKSPACE_ID, ATHLETE_WORKOUT, ATHLETE_EXERCISE, CLIENT_ID, CLIENT_WORKOUT, CLIENT_EXERCISE } = process.env;
const { log, save } = logger(OUT);
const browser = await chromium.launch();
const ends = (name) => new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

for (const [size, opts] of Object.entries(SIZES)) {
  const ctx = await signedIn(browser, BASE, opts, { userId: USER_ID, workspaceId: WORKSPACE_ID });
  const page = await ctx.newPage();
  const toggles = () => page.getByRole("button", { name: /per hand, two bells|one bell \(tap for per hand\)/ }).filter({ visible: true });
  const shot = async (name) => {
    await toggles().first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${size}-${name}.png`) });
    log(`  ${size}-${name}.png`);
  };
  const openCard = async (name) => {
    const card = page.getByText(ends(name)).filter({ visible: true }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click().catch(() => {}); // cards can open folded
    await page.waitForTimeout(600);
  };
  const pair = async (prefix) => {
    log(`    toggles visible: ${await toggles().count()}`);
    await shot(`${prefix}-1-per-hand`);
    await toggles().first().click();
    await page.waitForTimeout(300);
    log(`    after tap: ${await toggles().first().getAttribute("aria-label")}`);
    await shot(`${prefix}-2-one-bell`);
    await toggles().first().click(); // back to per hand
  };

  log(`${size}: athlete logger`);
  await page.goto(`${BASE}/workouts/${ATHLETE_WORKOUT}`, { waitUntil: "networkidle" });
  await openCard(ATHLETE_EXERCISE ?? "Dumbbell Curl");
  await pair("athlete");

  log(`${size}: coach logger`);
  await page.goto(`${BASE}/clients/${CLIENT_ID}/log?workoutId=${CLIENT_WORKOUT}`, { waitUntil: "networkidle" });
  await openCard(CLIENT_EXERCISE ?? "Incline Dumbbell Press");
  await pair("coach");
  await ctx.close();
}
await browser.close();
save();
