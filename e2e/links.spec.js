// Transactions drive goals, debts, accounts and the Dashboard.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

function withThisMonth(){
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7), today = new Date().toISOString().slice(0, 10);
  d.pa_transactions.push(
    { id: "p1", date: ym + "-01", description: "Payroll", amount: 6000, category: "Salary/Wages", type: "income", account: "", notes: "" },
    { id: "g1", date: ym + "-01", description: "Grocer", amount: 200, category: "Groceries", type: "expense", account: "", notes: "" },
    { id: "c1", date: ym + "-01", description: "CAPITAL ONE MOBILE PYMT", amount: 1500, category: "Credit Card Payment", type: "expense", account: "", notes: "" },
    { id: "v1", date: ym + "-01", description: "VISA PAYMENT", amount: 300, category: "Debt Payments", type: "expense", account: "", notes: "" },
    { id: "r1", date: ym + "-01", description: "BROKERAGE TRANSFER 1", amount: 500, category: "Savings/Investments", type: "expense", account: "", notes: "" }
  );
  d.pa_investments.push({ id: "roth", name: "Roth IRA", owner: "Me", type: "Roth IRA", monthlyContribution: 625, alloc: { stocks: 100, bonds: 0, cash: 0 },
    history: [{ id: "rh", date: ym + "-01", balance: 1000, contributed: 0 }] });
  d.pa_debts[0].since = ym + "-01";
  d.pa_savings_goals[0].since = ym + "-01";
  return { d, ym, today };
}
const row = (page, desc) => page.locator("#txnTableBody tr", { hasText: desc });

test("linking a debt payment lowers the balance, unlinking restores it", async ({ page }) => {
  const errors = watchErrors(page);
  const { d } = withThisMonth();
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await row(page, "VISA PAYMENT").locator(".link-select").selectOption("debt:d1");
  let debts = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_debts")));
  expect(debts[0].balance).toBe(2900);
  expect(debts[0].payments.some(p => p.txnId === "v1")).toBe(true);

  await openTab(page, "debt");
  await expect(page.locator(".link-chip").first()).toBeVisible();

  await openTab(page, "transactions");
  await row(page, "VISA PAYMENT").locator(".link-select").selectOption("");
  debts = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_debts")));
  expect(debts[0].balance).toBe(3200);
  expect(debts[0].payments.length).toBe(0);
  expect(errors).toEqual([]);
});

test("a transfer linked to an account counts toward this month's investing and is suggested next time", async ({ page }) => {
  const errors = watchErrors(page);
  const { d } = withThisMonth();
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await row(page, "BROKERAGE TRANSFER 1").locator(".link-select").selectOption("inv:roth");
  const inv = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments")));
  expect(inv.find(a => a.id === "roth").contribs[0].amount).toBe(500);

  await openTab(page, "dashboard");
  await expect(page.locator("#planProgressBody")).toContainText("$500 of $625");
  await expect(page.locator("#statTiles")).toContainText("$500.00 into investment accounts");

  // next import of the same transfer is linked automatically
  await openTab(page, "transactions");
  await page.click("#openPasteImport");
  const ym = new Date().toISOString().slice(0, 7);
  const m = ym.split("-")[1];
  await page.fill("#pasteInput", `${m}/02 BROKERAGE TRANSFER 2 125.00`);
  await page.click("#parsePasteBtn");
  await page.locator("#pasteImportBtn").click();
  const tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const imported = tx.find(t => /BROKERAGE TRANSFER 2/.test(t.description));
  expect(imported.category).toBe("Savings/Investments");
  expect(imported.link).toBe("inv:roth");
  expect(errors).toEqual([]);
});

test("dashboard: saving, debt and card payments are not spending", async ({ page }) => {
  const errors = watchErrors(page);
  const { d } = withThisMonth();
  await offline(page); await seed(page, d);
  await page.goto(APP);
  const tiles = page.locator("#statTiles .cell");
  await expect(tiles.nth(1)).toContainText("$200.00");          // only the groceries
  await expect(tiles.nth(2)).toContainText("$500.00");          // saved & invested
  await expect(tiles.nth(3)).toContainText("$5,000.00");        // 6000 - 200 - 300 debt - 500 saved
  await expect(page.locator("#flowBody")).toContainText("card payments isn't counted");
  await expect(page.locator("#netWorthBody")).toContainText("Investments");
  expect(errors).toEqual([]);
});

test("goal: money from before the goal was set up asks first and isn't double counted", async ({ page }) => {
  const errors = watchErrors(page);
  const { d } = withThisMonth();
  await offline(page); await seed(page, d);
  page.on("dialog", dlg => dlg.accept());   // "already included"
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.locator("#txnTableBody tr", { hasText: "Transfer to savings" }).first().locator(".link-select").selectOption("goal:ef");
  const goals = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_savings_goals")));
  expect(goals[0].currentAmount).toBe(9000);
  expect(goals[0].contribs[0].ph).toBe(true);
  expect(errors).toEqual([]);
});
