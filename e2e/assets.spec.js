// What you own and the two net worth numbers.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

test("a home paired with its mortgage shows equity, if-sold, and net worth two ways", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();             // 401(k) 47,500 + 529 6,000; goal 9,000; Visa 3,200
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_debts.push({ id: "mort", name: "Mortgage", balance: 310000, apr: 6.5, minPayment: 2100, plannedPayment: 2100, payments: [], since: ym + "-01" });
  d.pa_accounts = [{ id: "ck", name: "Checking", kind: "checking", startBalance: 4000, since: ym + "-01" },
                   { id: "co", name: "Capital One", kind: "card", startBalance: 500, since: ym + "-01" }];
  await offline(page); await seed(page, d);
  await page.goto(APP);

  await page.click("#nwEditAssets");
  await expect(page.locator("#assetCard")).toBeVisible();
  await page.selectOption("#assetKind", "home");
  await page.fill("#assetName", "Our house");
  await page.fill("#assetValue", "420000");
  await page.selectOption("#assetDebt", "mort");
  await page.click("#assetForm button[type=submit]");
  await expect(page.locator("#assetList")).toContainText("$110,000.00");      // equity
  await expect(page.locator("#assetList")).toContainText("$80,600.00");       // after 7% selling costs

  await page.selectOption("#assetKind", "vehicle");
  await page.fill("#assetName", "Car");
  await page.fill("#assetValue", "25000");
  await page.click("#assetForm button[type=submit]");

  await openTab(page, "dashboard");
  const body = page.locator("#netWorthBody");
  // liquid: cash 4,000 + investments 53,500 + savings 9,000 - card 500 - Visa 3,200 = 62,800
  await expect(body.locator(".nw-two > div").nth(1)).toContainText("$62,800.00");
  // net worth: liquid + home equity 110,000 + car 25,000 = 197,800
  await expect(body.locator(".nw-two > div").nth(0)).toContainText("$197,800.00");
  await expect(body).toContainText("Our house equity");
  await expect(body).toContainText("Card balances");
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_nw_history")));
  expect(hist.find(p => p.id === ym).netWorth).toBe(197800);
  expect(errors).toEqual([]);
});

test("a savings account holding the goals' money isn't counted twice", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_accounts = [{ id: "sv", name: "Ally Savings", kind: "savings", startBalance: 9000, since: ym + "-01" }];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  const body = page.locator("#netWorthBody");
  await expect(body).toContainText("goals aren't added again");
  // liquid: 53,500 investments + 9,000 savings (once) - 3,200 Visa = 59,300
  await expect(body.locator(".nw-two > div").nth(1)).toContainText("$59,300.00");
  expect(errors).toEqual([]);
});
