// Backups: automatic snapshot, safety copy before reset, restore, complete
// export, and the off-device reminder.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

function withHistory(){
  const d = householdData();
  d.pa_budget_history = { "2026-09": { expectedIncome: 6000, categories: { Housing: 2000 } } };
  d.pa_buckets = [{ id: "needs", name: "Needs", pct: 55 }, { id: "wants", name: "Wants", pct: 20 }, { id: "savedebt", name: "Savings & Debt", pct: 25 }];
  return d;
}

async function addOne(page){
  await openTab(page, "transactions");
  if(!(await page.locator("#addTxnBody").isVisible())) await page.click("#addTxnToggle");
  await page.fill("#txnDesc", "One more"); await page.fill("#txnAmount", "3");
  await page.locator("#txnForm button[type=submit]").click();
}

test("daily snapshot, reset, then undo the reset by restoring", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, withHistory());
  await page.goto(APP);
  await openTab(page, "settings");
  await expect(page.locator("#backupList tr[data-snap]")).toHaveCount(1, { timeout: 15000 });   // automatic snapshot
  await expect(page.locator("#backupList")).toContainText("Daily");
  await expect(page.locator("#backupList")).toContainText("18 transactions");
  // reset everything (warning must say it affects the household)
  page.once("dialog", d => { expect(d.message()).toContain("for everyone in your household"); d.accept(); });
  await page.click("#resetDataBtn");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")).length)).toBe(0);
  await openTab(page, "settings");
  await expect(page.locator("#backupList")).toContainText("Before reset");
  // restore the safety copy
  page.once("dialog", d => d.accept());
  await page.locator("#backupList tr[data-snap]").filter({ hasText: "Before reset" }).locator('[data-bk="restore"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")).length)).toBe(18);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments")).length)).toBe(2);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("pa_budget_history"))))).toEqual(["2026-09"]);
  // restoring over real data saves a safety copy first (restoring onto an empty app has nothing to protect)
  await addOne(page);
  await openTab(page, "settings");
  page.once("dialog", d => d.accept());
  await page.locator("#backupList tr[data-snap]").filter({ hasText: "Daily" }).locator('[data-bk="restore"]').click();
  await expect(page.locator("#backupList")).toContainText("Before restore");
  await expect(page.locator("#backupList tr[data-snap]").filter({ hasText: "Before restore" })).toContainText("19 transactions");
  expect(errors).toEqual([]);
});

test("the full export now includes budget history and buckets, never the market key", async ({ page }) => {
  await offline(page);
  await seed(page, Object.assign(withHistory(), { pa_market: { apiKey: "SECRET123" } }));
  await page.goto(APP);
  await openTab(page, "settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportJsonBtn")]);
  const text = require("fs").readFileSync(await download.path(), "utf8");
  const data = JSON.parse(text);
  expect(Object.keys(data.pa_budget_history)).toEqual(["2026-09"]);
  expect(data.pa_buckets[0].pct).toBe(55);
  expect(text).not.toContain("SECRET123");
  await expect(page.locator("#backupFileStatus")).toContainText("today");
});

test("importing a backup over current data restores it and keeps a safety copy", async ({ page }) => {
  await offline(page);
  await seed(page, withHistory());
  await page.goto(APP);
  await openTab(page, "settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportJsonBtn")]);
  const file = await download.path();
  await addOne(page);   // current data now differs from the file
  await openTab(page, "settings");
  page.once("dialog", d => d.accept());
  await page.setInputFiles("#jsonInput", file);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")).length)).toBe(18);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa_buckets"))[0].pct)).toBe(55);
  await openTab(page, "settings");
  await expect(page.locator("#backupList tr[data-snap]").filter({ hasText: "Before import" })).toContainText("19 transactions");
});

test("dashboard reminds you to keep an off-device copy; downloading clears it", async ({ page }) => {
  await offline(page);
  const d = withHistory();
  for(let i = 0; i < 5; i++) d.pa_transactions.push({ id: "x" + i, date: "2026-10-1" + i, description: "Extra " + i, amount: 5, category: "Groceries", type: "expense", account: "", notes: "" });
  await seed(page, d);
  await page.goto(APP);
  await expect(page.locator("#backupNudge")).toBeVisible();
  await Promise.all([page.waitForEvent("download"), page.click('#backupNudge [data-nudge="download"]')]);
  await expect(page.locator("#backupNudge")).toBeHidden();
});
