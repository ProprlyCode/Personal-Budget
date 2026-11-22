// A statement import matches entries typed in by hand (rounded, vague, no card).
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData } = require("./helpers");
const iso = ms => new Date(ms).toISOString().slice(0, 10);

test("rounded typed-in entries are updated from the statement; one it doesn't show is flagged", async ({ page, browser }) => {
  const errors = watchErrors(page);
  const day = n => new Date(Date.now() - n * 86400000);
  const end = day(1), start = day(31);
  const md = dt => dt.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
  const mmm = dt => dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + " " + dt.getUTCDate();
  const maker = await browser.newPage();
  await maker.setContent(`<pre style="font:12px Arial">${md(start)} - ${md(end)} | 31 days in Billing Cycle
ALEX Q SAMPLE #4321: Transactions
${mmm(day(5))} ${mmm(day(4))} SAMPLE GROCER #402 ANYTOWN MI $49.87
${mmm(day(3))} ${mmm(day(3))} SAMPLE FUEL #77 ANYTOWN MI $40.21
${mmm(day(2))} ${mmm(day(2))} EXAMPLESHOP ONLINE CA $64.10
Page 1 of 1</pre>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();

  const d = householdData();
  d.pa_accounts = [{ id: "b", name: "Sample Bank", kind: "card", startBalance: 0, since: iso(day(90).getTime()), last4: "4321", isDefault: true }];
  d.pa_transactions.push(
    { id: "h1", date: iso(day(6).getTime()), description: "Groceries", amount: 50, category: "Groceries", type: "expense", notes: "for the party" },
    { id: "h2", date: iso(day(3).getTime()), description: "gas", amount: 40, category: "Transportation", type: "expense" },
    { id: "h3", date: iso(day(10).getTime()), description: "Target", amount: 25, category: "Shopping", type: "expense" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pasteOverlay")).toBeVisible({ timeout: 15000 });

  const row = t => page.locator("#pasteTableBody tr", { hasText: t });
  await expect(row("SAMPLE GROCER")).toContainText('looks like');
  await expect(row("SAMPLE GROCER")).toContainText("Groceries · $50.00");
  await expect(row("SAMPLE GROCER").locator(".prow-action")).toHaveValue("update");
  await expect(row("SAMPLE FUEL")).toContainText("gas · $40.00");
  await expect(row("EXAMPLESHOP").locator(".prow-match")).toHaveCount(0);
  // keep the fuel line as a separate purchase
  await row("SAMPLE FUEL").locator(".prow-action").selectOption("add");
  await page.click("#pasteImportBtn");
  if(await page.locator("#reviewOverlay").isVisible()) await page.click("#closeReviewModal");

  const tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const h1 = tx.find(t => t.id === "h1");
  expect(h1.amount).toBe(49.87);
  expect(h1.description).toContain("SAMPLE GROCER");
  expect(h1.notes).toBe("for the party");          // her details kept
  expect(h1.category).toBe("Groceries");
  expect(h1.acctId).toBe("b");
  expect(tx.filter(t => /SAMPLE GROCER/.test(t.description)).length).toBe(1);   // no duplicate
  expect(tx.find(t => t.id === "h2").amount).toBe(40);                          // "add as new" left hers alone
  expect(tx.some(t => /SAMPLE FUEL/.test(t.description))).toBe(true);

  // Target $25 isn't on the statement -> flagged; gas $40 also (added as new instead)
  await expect(page.locator("#reconList")).toContainText("Target");
  await page.locator("#reconList .recon-row", { hasText: "Target" }).locator('[data-recon="keep"]').click();
  await expect(page.locator("#reconList")).not.toContainText("Target");
  expect(errors).toEqual([]);
});

test("statement payments clear the card from checking; a recurring bill at a new price is updated, and the rule on request", async ({ page, browser }) => {
  const errors = watchErrors(page);
  const day = n => new Date(Date.now() - n * 86400000);
  const md = dt => dt.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
  const mmm = dt => dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + " " + dt.getUTCDate();
  const maker = await browser.newPage();
  await maker.setContent(`<pre style="font:12px Arial">${md(day(31))} - ${md(day(1))} | 31 days in Billing Cycle
ALEX Q SAMPLE #4321: Payments, Credits and Adjustments
${mmm(day(8))} ${mmm(day(8))} SAMPLE BANK MOBILE PYMT - $500.00
ALEX Q SAMPLE #4321: Transactions
${mmm(day(6))} ${mmm(day(6))} STREAMFLIX.COM 866-579 $17.99
${mmm(day(5))} ${mmm(day(5))} SAMPLE GROCER ANYTOWN MI $60.00
Page 1 of 1</pre>`);
  const pdf = await maker.pdf({ format: "Letter" });
  await maker.close();
  const d = householdData();
  d.pa_accounts = [{ id: "b", name: "Sample Bank", kind: "card", startBalance: 500, since: iso(day(60).getTime()), last4: "4321", isDefault: true },
                   { id: "ck", name: "Checking", kind: "checking", startBalance: 3000, since: iso(day(60).getTime()) }];
  d.pa_recurring = [{ id: "sf", description: "Streamflix", amount: 15.49, type: "expense", category: "Subscriptions", acctId: "b", freq: "monthly", day: day(6).getUTCDate(), start: iso(day(6).getTime()) }];
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await page.setInputFiles("#scanFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pasteOverlay")).toBeVisible({ timeout: 15000 });
  const row = t => page.locator("#pasteTableBody tr", { hasText: t });
  await expect(row("MOBILE PYMT")).toContainText('recorded as "Paid a card"');
  await expect(row("MOBILE PYMT").locator(".prow-check")).toBeChecked();
  await expect(row("STREAMFLIX")).toContainText("your recurring");
  await row("STREAMFLIX").locator(".prow-newprice").check();
  await page.click("#pasteImportBtn");
  if(await page.locator("#reviewOverlay").isVisible()) await page.click("#closeReviewModal");

  const tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const pay = tx.find(t => t.category === "Credit Card Payment");
  expect(pay.link).toBe("card:b");
  expect(pay.acctId).toBe("ck");
  const sf = tx.filter(t => t.recurId === "sf");
  expect(sf.length).toBe(1);                                   // no duplicate
  expect(sf[0].amount).toBe(17.99);
  const rules = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_recurring")));
  expect(rules[0].changes.some(c => c.amount === 17.99)).toBe(true);

  // card: 500 owed + 17.99 + 60 - 500 paid = 77.99; checking: 3000 - 500 = 2500
  await openTab(page, "dashboard");
  await expect(page.locator("#cardsBody")).toContainText("$77.99");
  await openTab(page, "settings");
  await expect(page.locator("#acctList")).toContainText("$2,500.00");
  expect(errors).toEqual([]);
});
