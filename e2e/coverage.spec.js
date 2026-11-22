// How up to date each card is: reminders and not-final months.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const daysAgo = n => iso(Date.now() - n * 86400000);

test("a card behind shows the catch-up banner; a screenshot import brings it up to date", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  d.pa_accounts = [{ id: "co", name: "Sample Card", kind: "card", startBalance: 0, since: daysAgo(60), isDefault: true, closeDay: 13, coveredThrough: daysAgo(10), lastImport: daysAgo(9) }];
  await offline(page); await seed(page, d);
  await page.addInitScript(() => localStorage.setItem("pa_claude_key", "sk-ant-test-0123456789abcdef"));
  await page.route("https://api.anthropic.com/v1/messages", route => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify({ kind: "transactions", note: "", card: "", transactions: [
      { date: daysAgo(2), description: "SAMPLE GROCER", amount: 42.5, direction: "charge", category: "Groceries", unsure: false }] }) }] }) }));
  await page.goto(APP);
  await expect(page.locator("#catchUp")).toBeVisible();
  await expect(page.locator("#catchUpText")).toContainText("Sample Card");
  await page.click("#catchUpBtn");
  await expect(page.locator("#coverageList")).toContainText("10 days not imported");

  await page.setInputFiles("#scanFile", { name: "shot.png", mimeType: "image/png", buffer: PNG });
  await page.click("#pasteImportBtn");
  const acct = (await page.evaluate(() => JSON.parse(localStorage.getItem("pa_accounts"))))[0];
  expect(acct.coveredThrough).toBe(daysAgo(0));
  expect(acct.lastImport).toBe(daysAgo(0));
  await expect(page.locator("#coverageList")).not.toContainText("not imported");
  await openTab(page, "dashboard");
  await expect(page.locator("#catchUp")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a statement teaches the closing day; the month waits for the next statement to be final", async ({ page, browser }) => {
  const errors = watchErrors(page);
  // statement: cycle from 31 days ago to 2 days ago
  const end = new Date(Date.now() - 2 * 86400000), start = new Date(end.getTime() - 30 * 86400000);
  const md = dt => dt.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
  const mon = dt => dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const maker = await browser.newPage();
  await maker.setContent(`<pre style="font:12px Arial">${md(start)} - ${md(end)} | 31 days in Billing Cycle
ALEX Q SAMPLE #4321: Transactions
${mon(end)} ${end.getUTCDate()} ${mon(end)} ${end.getUTCDate()} EXAMPLESHOP ONLINE CA $64.10
Page 1 of 1</pre>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();
  const d = householdData();
  d.pa_accounts = [{ id: "b", name: "Sample Bank", kind: "card", startBalance: 0, since: daysAgo(90), last4: "4321" }];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pasteOverlay")).toBeVisible({ timeout: 15000 });
  await page.click("#pasteImportBtn");
  const acct = (await page.evaluate(() => JSON.parse(localStorage.getItem("pa_accounts"))))[0];
  expect(acct.coveredThrough).toBe(iso(end.getTime()));
  expect(acct.closeDay).toBe(end.getUTCDate());
  if(await page.locator("#reviewOverlay").isVisible()) await page.click("#closeReviewModal");   // the 'categorize these' prompt
  await expect(page.locator("#coverageList")).toContainText("next statement");
  await openTab(page, "trends");
  await expect(page.locator("#trendsFinal")).toContainText("not final until");
  expect(errors).toEqual([]);
});
