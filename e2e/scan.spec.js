// Importing screenshots, statement PDFs and receipts. Claude is faked here: no real API calls.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const today = new Date().toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
function claudeReply(obj){
  return { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn",
    usage: { input_tokens: 1800, output_tokens: 400 },
    content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: JSON.stringify(obj) }] };
}
async function fakeClaude(page, obj){
  const calls = [];
  await page.route("https://api.anthropic.com/v1/messages", async route => {
    const req = route.request();
    calls.push({ headers: req.headers(), body: JSON.parse(req.postData() || "{}") });
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(claudeReply(obj)) });
  });
  return calls;
}
async function withKey(page){ await page.addInitScript(() => localStorage.setItem("pa_claude_key", "sk-ant-test-0123456789abcdef")); }
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));

test("without a key, a screenshot asks for one and nothing is sent", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  const calls = await fakeClaude(page, { kind: "other", note: "", transactions: [] });
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#scanStatus")).toContainText("add your key in Settings");
  expect(calls.length).toBe(0);
  expect(errors).toEqual([]);
});

test("a card screenshot is read by Claude, reviewed, and imported to the chosen card", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  d.pa_accounts = [{ id: "co", name: "Capital One", kind: "card", startBalance: 0, since: daysAgo(30), isDefault: true }];
  d.pa_transactions.push({ id: "have", date: daysAgo(1), description: "SHELL OIL 1234", amount: 41.2, category: "Transportation", type: "expense", acctId: "co", account: "Capital One" });
  await offline(page); await seed(page, d); await withKey(page);
  const calls = await fakeClaude(page, { kind: "transactions", note: "", transactions: [
    { date: daysAgo(2), description: "KROGER #402", amount: 86.4, direction: "charge", category: "Groceries", unsure: false },
    { date: daysAgo(1), description: "Shell", amount: 41.2, direction: "charge", category: "Transportation", unsure: false },   // already entered
    { date: daysAgo(3), description: "PAYMENT THANK YOU", amount: 900, direction: "payment", category: "", unsure: false },
    { date: daysAgo(4), description: "CHIPOTLE 2231", amount: 23.75, direction: "charge", category: "Dining Out", unsure: true }
  ] });
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#pasteOverlay")).toBeVisible();

  // request: the key, the browser header, Opus 5.5, the image, a JSON schema
  expect(calls.length).toBe(1);
  expect(calls[0].headers["x-api-key"]).toBe("sk-ant-test-0123456789abcdef");
  expect(calls[0].headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  expect(calls[0].body.model).toBe("claude-opus-5-5");
  expect(calls[0].body.messages[0].content[0].type).toBe("image");
  expect(calls[0].body.output_config.format.type).toBe("json_schema");

  const rows = page.locator("#pasteTableBody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "Shell" })).toContainText("dup");
  await expect(rows.filter({ hasText: "THANK YOU" })).toContainText("payment");
  await expect(rows.filter({ hasText: "CHIPOTLE" })).toContainText("check");
  await expect(page.locator("#pasteYear")).toBeHidden();        // dates come complete from Claude
  await page.selectOption("#pasteMonth", "all");
  await page.click("#pasteImportBtn");

  const tx = await stored(page);
  const kroger = tx.find(t => t.description === "KROGER #402");
  expect(kroger.amount).toBe(86.4);
  expect(kroger.acctId).toBe("co");
  expect(kroger.category).toBe("Groceries");
  expect(tx.filter(t => /shell/i.test(t.description)).length).toBe(1);   // duplicate not imported
  const pay = tx.find(t => /PAYMENT THANK YOU/.test(t.description));      // recorded as paying the card, not spending
  expect(pay.category).toBe("Credit Card Payment");
  expect(pay.link).toBe("card:co");
  await expect(page.locator("#scanStatus")).toContainText("$0.02");
  expect(errors).toEqual([]);
});

test("a text statement PDF is read on this device for free (no Claude call)", async ({ page, browser }) => {
  const errors = watchErrors(page);
  // make a statement PDF in the Capital One layout
  const maker = await browser.newPage();
  const y = new Date().getUTCFullYear(), mon = new Date().toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  await maker.setContent(`<pre style="font:12px Arial">ALEX Q SAMPLE #0000: Transactions
Trans Date Post Date Description Amount
${mon} 1 ${mon} 2 FUELMART 10001 ANYTOWN MI $25.01
${mon} 2 ${mon} 3 EXAMPLESHOP ONLINE CA $64.10
ALEX Q SAMPLE #0000: Total Transactions $89.11
Page 1 of 1   ${y}</pre>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();
  await offline(page); await seed(page, householdData()); await withKey(page);
  const calls = await fakeClaude(page, { kind: "other", note: "", transactions: [] });
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pasteOverlay")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#pasteTableBody")).toContainText("FUELMART");
  await expect(page.locator("#pasteTableBody")).toContainText("EXAMPLESHOP");
  await expect(page.locator("#pasteTableBody")).not.toContainText("Total Transactions");
  expect(calls.length).toBe(0);
  expect(errors).toEqual([]);
});

test("a receipt becomes one transaction; the same purchase later on a statement is flagged as a duplicate", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData()); await withKey(page);
  let reply = { kind: "receipt", note: "", transactions: [{ date: daysAgo(1), description: "Trader Joe's #552", amount: 54.12, direction: "charge", category: "Groceries", unsure: false }] };
  await page.route("https://api.anthropic.com/v1/messages", route => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(claudeReply(reply)) }));
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "receipt.jpg", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#pasteTableBody tr")).toHaveCount(1);
  await page.click("#pasteImportBtn");
  expect((await stored(page)).filter(t => /Trader Joe/i.test(t.description)).length).toBe(1);

  reply = { kind: "transactions", note: "", transactions: [{ date: today, description: "TRADER JOE S #552 ANYTOWN", amount: 54.12, direction: "charge", category: "Groceries", unsure: false }] };
  await page.setInputFiles("#scanFile", { name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#pasteTableBody tr")).toContainText("dup");
  expect(errors).toEqual([]);
});

test("a rejected key gives a clear message", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData()); await withKey(page);
  await page.route("https://api.anthropic.com/v1/messages", route => route.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) }));
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#scanStatus")).toContainText("didn't accept the key");
  // the browser logs the 401 response itself; that's expected here
  expect(errors.filter(e => !/401/.test(e))).toEqual([]);
});

test("the key is saved only on this device: not in backups", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  await openTab(page, "settings");
  await page.fill("#claudeKey", "sk-ant-test-0123456789abcdef");
  await page.click("#claudeKeySave");
  await expect(page.locator("#claudeStatus")).toContainText("…cdef");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#exportJsonBtn")]);
  const text = require("fs").readFileSync(await download.path(), "utf8");
  expect(text).not.toContain("sk-ant-");
  expect(errors).toEqual([]);
});

test("a statement picks its card by last 4 digits and keeps last month's purchases checked", async ({ page, browser }) => {
  const errors = watchErrors(page);
  const maker = await browser.newPage();
  const now = new Date(), prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 20));
  const mon = d => d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  await maker.setContent(`<pre style="font:12px Arial">ALEX Q SAMPLE #4321: Payments, Credits and Adjustments
${mon(now)} 1 ${mon(now)} 1 PURCHASE ADJUSTMENT - $20.00
${mon(now)} 2 ${mon(now)} 2 SAMPLE BANK MOBILE PYMT - $300.00
ALEX Q SAMPLE #4321: Transactions
${mon(prev)} 20 ${mon(prev)} 21 SAMPLE GROCER ANYTOWN MI $45.10
${mon(now)} 1 ${mon(now)} 2 EXAMPLESHOP ONLINE CA $64.10
Page 1 of 1   ${now.getUTCFullYear()}</pre>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();
  const d = householdData();
  d.pa_accounts = [{ id: "a", name: "Other Card", kind: "card", startBalance: 0, since: "2026-01-01", isDefault: true },
                   { id: "b", name: "Sample Bank", kind: "card", startBalance: 0, since: "2026-01-01", last4: "4321" }];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pasteOverlay")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#pasteAcct")).toHaveValue("b");                    // picked by #4321, not the default card
  await expect(page.locator("#pasteMonth")).toHaveValue("all");
  const row = t => page.locator("#pasteTableBody tr", { hasText: t });
  await expect(row("SAMPLE GROCER").locator(".prow-check")).toBeChecked();       // last month's purchase included
  await expect(row("PURCHASE ADJUSTMENT").locator(".prow-check")).toBeChecked();  // money back, not a payment
  await expect(row("MOBILE PYMT").locator(".prow-check")).toBeChecked();          // recorded as "Paid a card"
  await expect(row("MOBILE PYMT")).toContainText('Paid a card');
  expect(errors).toEqual([]);
});

test("a refund lowers spending instead of counting as income", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_transactions.push(
    { id: "p", date: ym + "-01", description: "Payroll", amount: 3000, category: "Salary/Wages", type: "income" },
    { id: "s", date: ym + "-02", description: "Shoe store", amount: 120, category: "Shopping", type: "expense" },
    { id: "r", date: ym + "-03", description: "Shoe store refund", amount: 120, category: "Shopping", type: "income" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  const tiles = page.locator("#statTiles .cell");
  await expect(tiles.nth(0)).toContainText("$3,000.00");     // income: the paycheck only
  await expect(tiles.nth(1)).toContainText("$0.00");         // the shoes were refunded
  expect(errors).toEqual([]);
});
