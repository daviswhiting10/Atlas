// Screenshots of the two error screens with the database connection dropped: the app-wide one (a full reload while
// the connection is cut) and the Plan tab's own (on Plan, tap "All N weeks" while cut). Each: error, Try again greyed
// while reloading, recovered. Mobile and desktop.
// Setup: a local production build served on BASE with its DB through db-drop-proxy.mjs (control on 54331).
//   BASE=http://localhost:3961 OUT=<dir> USER_ID=<local user> WORKSPACE_ID=<ws> node scripts/release/visual/error-screens.mjs
// Tapping the Plan TAB during a short drop shows the last good copy (tabs are fully prefetched, kept 5 min), so the
// Plan screen is reached from a request made on the Plan tab itself.
import path from "node:path";
import { SIZES, chromium, logger, signedIn } from "./session.mjs";

const { BASE, OUT, USER_ID, WORKSPACE_ID } = process.env;
const mode = (m, ms = 0) => fetch(`http://127.0.0.1:${process.env.CONTROL_PORT ?? 54331}/mode?m=${m}&ms=${ms}`).then((r) => r.text());
const { log, save } = logger(OUT);
const browser = await chromium.launch();

for (const [size, opts] of Object.entries(SIZES)) {
  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(OUT, `${size}-${name}.png`) });
    log(`  ${size}-${name}.png`);
  };
  const fresh = async (start) => {
    const ctx = await signedIn(browser, BASE, opts, { userId: USER_ID, workspaceId: WORKSPACE_ID });
    const page = await ctx.newPage();
    await mode("pass");
    await page.goto(BASE + start, { waitUntil: "networkidle" });
    if (page.url().includes("/login")) throw new Error("not signed in");
    return { ctx, page };
  };
  const tryAgain = (page) => page.getByRole("button", { name: "Try again" });
  const retryAndRecover = async (page, gone, prefix) => {
    await mode("delay", 3000);
    await tryAgain(page).click();
    await page.waitForTimeout(500);
    log(`    Try again disabled while reloading: ${await tryAgain(page).isDisabled()}`);
    await shot(page, `${prefix}-2-reloading`);
    await page.getByText(gone).waitFor({ state: "detached", timeout: 20000 });
    await page.waitForLoadState("networkidle");
    await mode("pass");
    await page.waitForTimeout(600);
    log(`    recovered on ${new URL(page.url()).pathname}`);
    await shot(page, `${prefix}-3-recovered`);
  };

  {
    log(`${size}: app-wide error screen (reload /today with the DB connection reset)`);
    const { ctx, page } = await fresh("/today");
    await mode("reset");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("That didn't load").waitFor({ timeout: 15000 });
    await shot(page, "app-1-error");
    await retryAndRecover(page, "That didn't load", "app");
    await ctx.close();
  }
  {
    log(`${size}: Plan tab error screen (on Plan, tap All N weeks with the DB connection reset)`);
    const { ctx, page } = await fresh("/plan");
    await mode("reset");
    await page.getByRole("link", { name: /^All \d+ weeks$/ }).filter({ visible: true }).first().click();
    await page.getByText("Couldn't load your plan").waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot(page, "plan-1-error");
    await retryAndRecover(page, "Couldn't load your plan", "plan");
    await ctx.close();
  }
}
await browser.close();
await mode("pass");
save();
