// Statement import: read a (synthetic) Lincoln "Your Account Summary" PDF in
// the browser with PDF.js from the CDN (integrity-pinned), preview, apply.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab } = require("./helpers");
const SAMPLE = path.join(__dirname, "fixtures", "sample-account-summary.pdf");

// Start an import from a button the way a person would: it opens the file picker.
async function importVia(page, button, file){
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(button)]);
  await chooser.setFiles(file);
}

test("add a new 401(k) by starting from a statement PDF", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  await page.goto(APP);
  await openTab(page, "investments");
  await expect(page.locator("#stmtNewBtn")).toBeVisible();          // offered without opening the manual form
  await importVia(page, "#stmtNewBtn", SAMPLE);
  await expect(page.locator("#stmtOverlay")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#stmtBody")).toContainText("$10,500.00");
  await expect(page.locator("#stmtBody")).toContainText("you $400.00 · employer $200.00");
  await expect(page.locator("#stmtBody tbody tr")).toHaveCount(4);
  await expect(page.locator("#stmtBody")).toContainText("Smpl 500 Indx 50%");
  await expect(page.locator("#stmtBody")).toContainText("$650.00");          // $300 per paycheck × 26 ÷ 12
  await expect(page.locator("#stmtBody")).toContainText("every two weeks");
  await expect(page.locator("#stmtBody")).toContainText("read on this device");
  // the new account's details are part of the preview
  await expect(page.locator('#stmtBody [data-new="name"]')).toHaveValue("Lincoln 401(k)");
  await page.fill('#stmtBody [data-new="name"]', "Work 401(k)");
  await page.fill('#stmtBody [data-new="owner"]', "Alex");
  await page.click("#stmtApply");
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments"))[0]);
  expect([a.name, a.owner]).toEqual(["Work 401(k)", "Alex"]);
  expect(a.type).toBe("401(k)");
  expect(a.payroll).toBe(true);
  expect(a.monthlyContribution).toBe(650);
  expect(a.history.map(h => [h.date, h.balance, h.contributed])).toEqual([["2026-01-05", 9995, 0], ["2026-02-04", 10500, 600]]);
  const funds = Object.fromEntries(a.funds.map(f => [f.name, f]));
  expect(funds["Smpl 500 Indx"].shares).toBe(20);
  expect(funds["Smpl 500 Indx"].balance).toBe(6000);
  expect(funds["Smpl 500 Indx"].elect).toBe(50);
  expect(funds["Smpl Midcp Grwth"].cls).toBe("us-mid");
  expect(funds["Smpl Bond Srs"].cls).toBe("bond");
  expect(funds["Smpl Bond Srs"].stmtName).toBe("Smpl Bond Srs");
  // contributions (incl. the match) are not counted as growth: 10,500 − 9,995 − 600 = −95
  await expect(page.locator(".inv-card").first()).toContainText("Growth −$95.00");
  expect(errors).toEqual([]);
});

test("re-importing the next statement updates the same funds instead of duplicating", async ({ page }) => {
  await offline(page);
  await seed(page, { pa_investments: [{ id: "k", name: "Work 401(k)", owner: "Me", type: "401(k)", payroll: true, monthlyContribution: 0,
    history: [{ id: "h0", date: "2026-01-05", balance: 9995, contributed: 0 }],
    funds: [{ id: "f1", name: "Sample S&P 500 Index Fund", stmtName: "Smpl 500 Indx", cls: "us-large", er: 0.02, elect: 100, balance: 1, shares: 1 },
            { id: "old", name: "Fund I sold", cls: "us-large", elect: 0, balance: 500, shares: 5 }] }] });
  await page.goto(APP);
  await openTab(page, "investments");
  await importVia(page, '.inv-card[data-id="k"] [data-act="import-stmt"]', SAMPLE);   // from the account's own card
  await expect(page.locator("#stmtOverlay")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#stmtBody")).toContainText("Importing into Work 401(k)");
  await expect(page.locator('#stmtBody [data-new="name"]')).toHaveCount(0);
  // the existing fund is matched by its remembered statement name
  await expect(page.locator("#stmtBody tbody tr").first().locator('[data-stmt="match"]')).toHaveValue("f1");
  await expect(page.locator("#stmtBody")).not.toContainText("on 2026-01-05, then");   // start balance already recorded
  await page.click("#stmtApply");
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_investments"))[0]);
  expect(a.funds.length).toBe(5);                                   // 1 matched + 3 new + the sold one kept in the lineup
  const f1 = a.funds.find(f => f.id === "f1");
  expect([f1.name, f1.shares, f1.balance, f1.er]).toEqual(["Sample S&P 500 Index Fund", 20, 6000, 0.02]);   // keeps your name and cost data
  expect(a.funds.find(f => f.id === "old").balance).toBe(0);         // no longer held
  expect(a.history.length).toBe(2);
});

test("a PDF that isn't an account summary is rejected with a clear message", async ({ page }) => {
  await offline(page);
  await page.goto(APP);
  await openTab(page, "investments");
  const other = path.join(__dirname, "..", "test-results", "not-a-statement.pdf");
  require("fs").mkdirSync(path.dirname(other), { recursive: true });
  const b = await page.context().browser().newPage();
  await b.setContent("<h1>Quarterly newsletter</h1><p>Nothing to see.</p>");
  await b.pdf({ path: other }); await b.close();
  await importVia(page, "#stmtNewBtn", other);
  await expect(page.locator(".toast").last()).toContainText("doesn't look like an account summary", { timeout: 30000 });
  await expect(page.locator("#stmtOverlay")).toBeHidden();
});
