// Recurring bills, subscriptions and paychecks.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

const isoMonthsAgo = (n, day) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 8) + String(day).padStart(2, "0"); };
const stored = (page, k) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), k);

test("a monthly bill fills in past months, a deleted one stays deleted, and a new price applies from then on", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  const start = isoMonthsAgo(2, 1);
  await page.click("#fabAdd");
  await page.fill("#qaAmount", "15.49");
  await page.fill("#qaDesc", "Netflix");
  await page.selectOption("#qaCategory", "Subscriptions");
  await page.fill("#qaDate", start);
  await page.selectOption("#qaRepeat", "monthly");
  await page.click("#qaSave");

  let tx = (await stored(page, "pa_transactions")).filter(t => t.description === "Netflix");
  expect(tx.length).toBe(3);                                    // 2 months ago, last month, this month
  expect(tx.every(t => t.recurId && t.amount === 15.49)).toBe(true);

  // delete last month's; reload: it isn't added back
  await openTab(page, "transactions");
  const lastMonth = tx.map(t => t.date).sort()[1];
  await page.locator("#txnTableBody tr", { hasText: "Netflix" }).filter({ hasText: lastMonth }).locator(".del-btn").click();
  await page.reload();
  tx = (await stored(page, "pa_transactions")).filter(t => t.description === "Netflix");
  expect(tx.length).toBe(2);
  expect(tx.some(t => t.date === lastMonth)).toBe(false);

  // price goes up from next month
  await openTab(page, "settings");
  const row = page.locator("#recurList .acct-row", { hasText: "Netflix" });
  await row.locator('[data-act="toggle"]').click();
  await row.locator('[data-e="amount"]').fill("17.99");
  await row.locator('[data-act="save"]').click();
  await expect(page.locator("#recurList")).toContainText("$17.99");
  tx = (await stored(page, "pa_transactions")).filter(t => t.description === "Netflix");
  expect(tx.every(t => t.amount === 15.49)).toBe(true);        // ones already added stay as they were
  const rules = await stored(page, "pa_recurring");
  expect(rules[0].changes[0].amount).toBe(17.99);
  expect(errors).toEqual([]);
});

test("paychecks every 2 weeks and bills still due show under Coming up", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate();
  d.pa_recurring = [
    { id: "pay", description: "Payroll", amount: 2400, type: "income", category: "Salary/Wages", freq: "biweekly", start: today },
    { id: "ph", description: "Phone bill", amount: 70, type: "expense", category: "Utilities", freq: "monthly", day: lastDay, start: today, varies: true }
  ];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  const tx = await stored(page, "pa_transactions");
  expect(tx.some(t => t.recurId === "pay" && t.date === today && t.type === "income")).toBe(true);   // today's paycheck added
  if(Number(today.slice(8)) < lastDay){
    await expect(page.locator("#upcomingBody")).toContainText("Phone bill");
    await expect(page.locator("#upcomingBody")).toContainText("estimate");
  }
  expect(errors).toEqual([]);
});

test("history suggests recurring; making one recurring doesn't duplicate what's there", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  [3, 2, 1].forEach(n => d.pa_transactions.push({ id: "sp" + n, date: isoMonthsAgo(n, 9), description: "SPOTIFY USA", amount: 11.99, category: "Subscriptions", type: "expense", account: "", notes: "" }));
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "settings");
  await expect(page.locator("#recurSuggest")).toContainText("SPOTIFY USA");
  await page.locator("#recurSuggest .sugg-row", { hasText: "SPOTIFY" }).locator("[data-sugg]").click();
  await expect(page.locator("#recurList")).toContainText("SPOTIFY USA");
  const tx = (await stored(page, "pa_transactions")).filter(t => /SPOTIFY/.test(t.description));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const expected = 3 + (Number(new Date().toISOString().slice(8, 10)) >= 9 ? 1 : 0);   // this month's only once it's due
  expect(tx.length).toBe(expected);
  expect(tx.filter(t => t.date.slice(0, 7) === thisMonth).length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("a pasted statement skips a charge a recurring rule already added", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const today = new Date().toISOString().slice(0, 10);
  d.pa_recurring = [{ id: "gym", description: "Gym", amount: 45, type: "expense", category: "Personal Care", freq: "monthly", day: Number(today.slice(8)), start: today }];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.click("#openPasteImport");
  await page.fill("#pasteInput", `${today.slice(5, 7)}/${today.slice(8, 10)} PLANET FITNESS CLUB 45.00`);
  await page.click("#parsePasteBtn");
  await expect(page.locator("#pasteTableBody")).toContainText("dup");
  expect(errors).toEqual([]);
});
