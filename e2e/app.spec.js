// Core app: every tab renders without errors; the original budget flows work.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

const TABS = ["dashboard", "transactions", "budget", "goals", "debt", "investments", "trends", "settings"];

test("every tab renders with no errors (empty app)", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await page.goto(APP);
  for(const v of TABS){ await openTab(page, v); await expect(page.locator("#view-" + v)).toBeVisible(); }
  expect(errors).toEqual([]);
});

test("every tab renders with no errors (household data)", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, householdData());
  await page.goto(APP);
  for(const v of TABS){ await openTab(page, v); await expect(page.locator("#view-" + v)).toBeVisible(); }
  expect(errors).toEqual([]);
});

test("CDN scripts load and pass their integrity hashes", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if(/integrity/i.test(m.text())) errors.push(m.text()); });
  await page.route(/^https:\/\/([a-z0-9-]+\.)*firebaseio\.com\//, r => r.abort()); // load the SDK, don't talk to the database
  await page.goto(APP);
  await expect.poll(() => page.evaluate(() => typeof Chart !== "undefined" && typeof firebase !== "undefined")).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.locator("#loginGate")).toBeVisible(); // Firebase loaded → sign-in required
});

test("add a transaction manually", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await page.goto(APP);
  await openTab(page, "transactions");
  if(!(await page.locator("#addTxnBody").isVisible())) await page.click("#addTxnToggle");
  await page.fill("#txnDesc", "Groceries run");
  await page.fill("#txnAmount", "54.20");
  await page.locator("#txnForm button[type=submit]").click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  expect(stored.length).toBe(1);
  expect(stored[0].amount).toBe(54.2);
  expect(errors).toEqual([]);
});

test("JSON export includes investments and rules, never the market-data key", async ({ page }) => {
  await offline(page);
  await seed(page, Object.assign(householdData(), { pa_invest_policy: { confidence: 90 } }));
  await page.goto(APP);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const data = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
  expect(data.pa_investments.length).toBe(2);
  expect(data.pa_invest_policy.confidence).toBe(90);
  expect(JSON.stringify(data)).not.toContain("apiKey"); // the market-data key never goes into files
});
