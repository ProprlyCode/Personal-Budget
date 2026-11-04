// The transactions list: compact rows, tap to edit, undo, recently added.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData, txnRow, openTxn } = require("./helpers");
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));

test("rows are grouped by day; tapping one edits it; deleting can be undone", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "transactions");
  await expect(page.locator("#txnList .day-head").first()).toBeVisible();
  await expect(page.locator("#txnList select")).toHaveCount(0);            // no dropdowns on rows

  await openTxn(page, "Rent");
  await expect(page.locator("#qaTitle")).toHaveText("Edit transaction");
  const before = (await stored(page)).length;
  await page.click("#qaDelete");
  expect((await stored(page)).length).toBe(before - 1);
  await page.locator(".toast.undo .undo-btn").click();
  expect((await stored(page)).length).toBe(before);
  expect(errors).toEqual([]);
});

test("an edit can be undone, including what it changed on a linked goal", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_savings_goals[0].since = ym + "-01";
  d.pa_transactions.push({ id: "g", date: ym + "-02", description: "Goal deposit", amount: 100, category: "Savings/Investments", type: "expense", link: "goal:ef" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await openTxn(page, "Goal deposit");
  await page.fill("#qaAmount", "1000");
  await page.click("#qaSave");
  let goals = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_savings_goals")));
  expect(goals[0].currentAmount).toBe(10000);
  await page.locator(".toast.undo .undo-btn").click();
  goals = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_savings_goals")));
  expect(goals[0].currentAmount).toBe(9100);
  expect((await stored(page)).find(t => t.id === "g").amount).toBe(100);
  expect(errors).toEqual([]);
});

test("Recently added finds a mistyped date; duplicate copies a transaction; double entries ask first", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  // typo: last year's date
  await page.click("#fabAdd");
  await page.fill("#qaAmount", "23.40");
  await page.fill("#qaDesc", "Bookstore");
  await page.selectOption("#qaCategory", "Shopping");
  const y = new Date().getUTCFullYear() - 1;
  await page.fill("#qaDate", `${y}-11-02`);
  await page.click("#qaSave");
  await openTab(page, "transactions");
  await page.locator('#txnChips .vchip[data-view="recent"]').click();
  await expect(page.locator("#txnList .txn-row").first()).toContainText("Bookstore");
  await expect(page.locator("#txnList .txn-row").first()).toContainText("added");

  // fix it
  await openTxn(page, "Bookstore");
  await page.fill("#qaDate", new Date().toISOString().slice(0, 10));
  await page.click("#qaSave");
  expect((await stored(page)).find(t => t.description === "Bookstore").date).toBe(new Date().toISOString().slice(0, 10));

  // duplicate: same details, then a double-entry warning that we decline
  await openTxn(page, "Bookstore");
  await page.click("#qaDuplicate");
  await expect(page.locator("#qaTitle")).toHaveText("Add a transaction");
  await expect(page.locator("#qaAmount")).toHaveValue("23.4");
  let asked = "";
  page.once("dialog", dlg => { asked = dlg.message(); dlg.dismiss(); });
  await page.click("#qaSave");
  expect(asked).toContain("Add it again?");
  expect((await stored(page)).filter(t => t.description === "Bookstore").length).toBe(1);
  expect(errors).toEqual([]);
});

test("select mode recategorizes several at once, and that can be undone", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.click("#txnSelectBtn");
  await txnRow(page, "Rent").nth(0).click();
  await txnRow(page, "Rent").nth(1).click();
  await expect(page.locator("#selectionHint")).toHaveText("2 selected");
  await page.selectOption("#bulkCategorySelect", "Miscellaneous");
  await page.click("#bulkApplyBtn");
  expect((await stored(page)).filter(t => t.category === "Miscellaneous").length).toBe(2);
  await page.locator(".toast.undo .undo-btn").click();
  expect((await stored(page)).filter(t => t.category === "Miscellaneous").length).toBe(0);
  expect(errors).toEqual([]);
});

test("long lists show 50 at a time; search matches amounts too", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  for(let i = 0; i < 70; i++) d.pa_transactions.push({ id: "x" + i, date: "2026-01-" + String(1 + (i % 28)).padStart(2, "0"), description: "Coffee " + i, amount: 3 + i / 100, category: "Dining Out", type: "expense" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await expect(page.locator("#txnList .txn-row")).toHaveCount(50);
  await page.click("#txnMore");
  await expect(page.locator("#txnList .txn-row")).toHaveCount(d.pa_transactions.length);
  await page.fill("#txnSearch", "4400");
  await expect(page.locator("#txnList .txn-row")).toHaveCount(1);       // the $4,400 rent
  expect(errors).toEqual([]);
});
