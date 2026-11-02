// Investing: accounts, rules-based decisions, monthly split, fund picker.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, openAdvanced, householdData } = require("./helpers");

test("add an account and record a balance update", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await page.goto(APP);
  await openTab(page, "investments");
  await page.click("#addInvToggle");
  await page.fill("#invName", "Roth IRA");
  await page.fill("#invOwner", "Me");
  await page.selectOption("#invType", "Roth IRA");
  await page.fill("#invBalance", "10000");
  await page.fill("#invDate", "2026-01-01");
  await page.locator("#invForm button[type=submit]").click();
  const card = page.locator(".inv-card").first();
  await card.locator('[data-f="bal"]').fill("11000");
  await card.locator('[data-f="contrib"]').fill("600");
  await card.locator('[data-act="update"]').click();
  await expect(page.locator(".inv-card").first()).toContainText("Growth +$400.00"); // 11000 − 10000 − 600
  expect(errors).toEqual([]);
});

test("decisions follow the rules: emergency fund and high-APR debt come first", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "investments");
  const titles = await page.locator(".dec-item .dec-title").allInnerTexts();
  expect(titles[0]).toMatch(/Emergency fund covers 2\.0 months/);
  expect(titles[1]).toMatch(/Pay down Visa \(22\.9% APR\)/);
  expect(titles.some(t => /chance of \$80,000/.test(t))).toBe(true);
  expect(titles.some(t => /Rebalance Me · Work 401\(k\): 96\/4\/0 vs target 85\/15\/0/.test(t))).toBe(true);
  // the split sends this month's money to the emergency fund, not the 529
  await expect(page.locator("#splitBody")).toContainText("Emergency fund");
  await expect(page.locator("#splitApply")).toBeHidden();
  expect(errors).toEqual([]);
});

test("monthly split applies to goal accounts when the foundation is done", async ({ page }) => {
  await offline(page);
  const d = householdData();
  d.pa_savings_goals[0].currentAmount = 16000;  // > 3 months of spending
  d.pa_debts[0].apr = 4.5;                       // below the 7% rule
  await seed(page, d);
  await page.goto(APP);
  await openTab(page, "investments");
  await expect(page.locator("#splitApply")).toBeVisible();
  await page.click("#splitApply");
  const monthly = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments")).find(a => a.id === "d1").monthlyContribution);
  expect(monthly).toBeGreaterThan(150);
});

test("rules are editable and change the recommendations", async ({ page }) => {
  await offline(page);
  await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "investments");
  await openAdvanced(page);
  await page.click("#rulesToggle");
  await page.fill('[data-p="confidence"]', "90");
  await page.press('[data-p="confidence"]', "Tab");
  await expect(page.locator("#splitSub")).toContainText("90% odds");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa_invest_policy")).confidence)).toBe(90);
});

const LINEUP = [
  "Investment Option   1 Yr   3 Yr   5 Yr   10 Yr   Since Inception   Gross Exp Ratio   Net Exp Ratio",
  "LARGE CAP",
  "Sample S&P 500 Index Fund  24.10 9.80 14.20 12.90 10.10 0.05 0.04",
  "Benchmark: S&P 500 Index 24.20 9.90 14.30 13.00 N/A N/A N/A",
  "Sample Blue Chip Growth Fund R3",
  "29.40 7.20 14.90 13.10 9.80 0.98 0.95",
  "Russell 1000 Growth 30.10 10.20 16.90 15.10 -- -- --",
  "Sample Mid Cap Index 13.20 4.90 9.80 9.40 8.00 0.06 0.05",
  "Benchmark: S&P MidCap 400 13.40 5.00 9.90 9.50 N/A N/A N/A",
  "Sample International Index Fund 6.10 3.20 6.40 5.30 4.10 0.09 0.07",
  "Benchmark: MSCI EAFE 6.30 3.40 6.50 5.50 N/A N/A N/A",
  "Sample Total Bond Index Fund 1.40 (2.30) 0.20 1.30 3.10 0.06 0.05",
  "Benchmark: Bloomberg US Aggregate 1.30 (2.40) 0.30 1.40 N/A N/A N/A",
  "Sample Stable Value Fund 2.90 2.40 2.10 1.90 2.80 0.45 0.45"
].join("\n");

test("fund picker: paste a lineup, score it, apply suggested elections", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "investments");
  await openAdvanced(page);
  await page.selectOption("#fundAcct", "k");
  await page.click("#fundPasteBtn");
  await page.fill("#fundPasteInput", LINEUP);
  await page.click("#fundParseBtn");
  await expect(page.locator("#fundPasteStep1")).toBeHidden();
  await expect(page.locator("#fundPasteSummary")).toContainText("Found 6 funds and 5 benchmark rows");
  await page.click("#fundPasteImport");
  await expect(page.locator(".fund-table tr[data-fid]")).toHaveCount(6);
  // the pricey active fund is rated avoid; index funds are suggested
  const blue = page.locator(".fund-table tr[data-fid]").filter({ has: page.locator(".fname b", { hasText: "Blue Chip" }) });
  await expect(blue.locator(".verdict")).toHaveText(/avoid/i);
  const chips = await page.locator(".fund-sugg .chip").allInnerTexts();
  expect(chips.join(" ")).toContain("Sample S&P 500 Index Fund");
  expect(chips.join(" ")).not.toContain("Blue Chip");
  expect(chips.reduce((s, c) => s + parseInt(c, 10), 0)).toBe(100);
  await page.click("#fundApplyBtn");
  const elect = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments")).find(a => a.id === "k").funds.reduce((s, f) => s + f.elect, 0));
  expect(elect).toBe(100);
  expect(errors).toEqual([]);
});

test("phone width: no horizontal page scroll on the investments tab", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await offline(page);
  await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "investments");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

function lineupAccount(id, name, provider){
  const today = new Date().toISOString().slice(0, 10);
  const f = (fid, n, cls, er, extra) => Object.assign({ id: id + fid, name: n, cls, er, elect: 0, balance: 0, shares: 0 }, extra);
  return { id, name, owner: "Me", type: "401(k)", payroll: true, provider, monthlyContribution: 800, allocMode: "fixed", targetAlloc: { stocks: 85, bonds: 15, cash: 0 },
    history: [{ id: id + "h", date: today, balance: 40000, contributed: 0 }],
    funds: [ f("a", "Sample 500 Index Fund", "us-large", 0.04, {}),
             f("b", "Sample Pricey Growth Fund", "us-large", 1.10, { elect: 100, balance: 40000 }),
             f("c", "Sample International Index", "intl", 0.06, {}),
             f("d", "Sample Bond Index", "bond", 0.05, {}) ] };
}

test("Lincoln accounts get Lincoln's button names; other plans get generic wording", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, { pa_investments: [lineupAccount("L", "Work 401(k)", "Lincoln Financial"), lineupAccount("O", "Old employer 401(k)", "")] });
  await page.goto(APP);
  await openTab(page, "investments");
  const item = title => page.locator(".dec-item").filter({ has: page.locator(".dec-title", { hasText: title }) });
  // Lincoln: exact buttons to press
  await expect(item("Change Work 401(k) contribution elections")).toContainText('In Lincoln, open "Future allocations" and set:');
  await expect(item("Change Work 401(k) contribution elections")).toContainText('use "Rebalance" once with the same percentages');
  await expect(item("Move away from Sample Pricey Growth Fund").first()).toContainText('In Lincoln, use "Exchange" to move your $40,000 in Sample Pricey Growth Fund into Sample 500 Index Fund, and set it to 0% in "Future allocations".');
  await expect(item("Rebalance Work 401(k)")).toContainText('In Lincoln, first change "Future allocations"');
  await expect(item("Cut Work 401(k) fund costs")).toContainText('Act on it in Lincoln with "Future allocations"');
  // other plans: no Lincoln wording
  await expect(item("Change Old employer 401(k) contribution elections")).toContainText("On your plan's website, change \"future contributions\"");
  await expect(item("Change Old employer 401(k) contribution elections")).not.toContainText("Lincoln");
  // the fund picker's confirm button uses Lincoln's name for Lincoln accounts
  await openAdvanced(page);
  await page.selectOption("#fundAcct", "L");
  await expect(page.locator("#fundApplyBtn")).toHaveText("I updated Future allocations in Lincoln");
  await page.selectOption("#fundAcct", "O");
  await expect(page.locator("#fundApplyBtn")).toHaveText("I made this change in my plan");
  expect(errors).toEqual([]);
});

test("a statement import remembers the account's provider", async ({ page }) => {
  await offline(page);
  await page.goto(APP);
  await openTab(page, "investments");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#stmtNewBtn")]);
  await chooser.setFiles(require("path").join(__dirname, "fixtures", "sample-account-summary.pdf"));
  await expect(page.locator("#stmtOverlay")).toBeVisible({ timeout: 30000 });
  await page.fill('#stmtBody [data-new="name"]', "Work plan");      // name without "Lincoln": provider must come from the statement
  await page.click("#stmtApply");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments"))[0].provider)).toBe("Lincoln Financial");
});

// ---- simplified view ----
function tdfAccount(over){
  const today = new Date().toISOString().slice(0, 10);
  return Object.assign({ id: "k", name: "Lincoln 401(k)", owner: "Me", type: "401(k)", payroll: true, provider: "Lincoln Financial", monthlyContribution: 817, allocMode: "fixed", targetAlloc: { stocks: 85, bonds: 15, cash: 0 },
    history: [{ id: "h", date: today, balance: 40000, contributed: 0 }],
    funds: [ { id: "t", name: "Sample Target Date 2060 Fund", cls: "target", er: 0.39, elect: 100, balance: 0, shares: 0 },
             { id: "x", name: "Sample Pricey Growth Fund", cls: "us-large", er: 1.10, elect: 0, balance: 40000, shares: 0 },
             { id: "i", name: "Sample 500 Index Fund", cls: "us-large", er: 0.02, elect: 0, balance: 0, shares: 0 },
             { id: "b", name: "Sample Bond Index", cls: "bond", er: 0.04, elect: 0, balance: 0, shares: 0 } ] }, over || {});
}

test("all in one target-date fund: no switch or rebalance advice, just confirmation", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await seed(page, { pa_investments: [tdfAccount()] });
  await page.goto(APP);
  await openTab(page, "investments");
  const titles = await page.locator("#decList .dec-title").allInnerTexts();
  expect(titles.some(t => /Change .* contribution elections|Rebalance|Move away|Cut .* fund costs/.test(t))).toBe(false);
  // nothing about this account needs doing (the general "log your spending" reminder is unrelated)
  const accountItems = page.locator("#decList > .dec-item").filter({ hasNotText: "spending history" });
  await expect(accountItems).toHaveCount(0);
  // the confirmation is folded under "looks good"
  await page.locator(".dec-fine > summary").click();
  await expect(page.locator(".dec-fine")).toContainText("all in Sample Target Date 2060 Fund");
  await expect(page.locator(".inv-card").first()).toContainText("All in Sample Target Date 2060 Fund");
  // the fund picker says suggestions are reference only
  await openAdvanced(page);
  await expect(page.locator("#fundBody")).toContainText("set up as one target-date fund");
  expect(errors).toEqual([]);
});

test("target-date setups are recognized from holdings, and an expensive one is flagged", async ({ page }) => {
  await offline(page);
  const a = tdfAccount();
  a.funds.forEach(f => { f.elect = 0; f.balance = 0; });
  a.funds[0].balance = 40000; a.funds[0].er = 0.85;         // holdings all in the target-date fund, high cost
  await seed(page, { pa_investments: [a] });
  await page.goto(APP);
  await openTab(page, "investments");
  const accountItems = page.locator("#decList > .dec-item").filter({ hasNotText: "spending history" });
  await expect(accountItems).toHaveCount(1);
  await expect(accountItems).toContainText("Sample Target Date 2060 Fund costs 0.85% a year");
});

test("advanced tools start collapsed and stay open once opened", async ({ page }) => {
  await offline(page);
  await seed(page, { pa_investments: [tdfAccount()] });
  await page.goto(APP);
  await openTab(page, "investments");
  for(const id of ["#fundCard", "#marketCard", "#outlookCard", "#rulesToggle"]) await expect(page.locator(id)).toBeHidden();
  await page.click("#advToggle");
  await expect(page.locator("#fundCard")).toBeVisible();
  await page.reload();
  await openTab(page, "investments");
  await expect(page.locator("#fundCard")).toBeVisible();   // remembered on this device
});

test("yearly checklist: ticks are saved and reset in a new year", async ({ page }) => {
  await offline(page);
  await seed(page, { pa_investments: [tdfAccount()], pa_invest_policy: { checklistYear: 2001, checklistDone: "raise,backup" } });
  await page.goto(APP);
  await openTab(page, "investments");
  await expect(page.locator("#checkList")).toContainText('In Lincoln, check "Future allocations": still 100% in Sample Target Date 2060 Fund');
  await expect(page.locator('#checkList [data-check="raise"]')).not.toBeChecked();   // last year's ticks don't count
  await page.check('#checkList [data-check="raise"]');
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_invest_policy")));
  expect([p.checklistYear, p.checklistDone]).toEqual([new Date().getFullYear(), "raise"]);
  await expect(page.locator("#checkSub")).toContainText("1 of");
});
