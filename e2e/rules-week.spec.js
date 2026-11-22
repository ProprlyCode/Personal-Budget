// Category rules and the "This week" checklist.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData, openTxn } = require("./helpers");
const iso = ms => new Date(ms).toISOString().slice(0, 10);

test("changing one merchant's category offers to apply it to the others and to new ones", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  ["01", "05", "09"].forEach((dd, i) => d.pa_transactions.push({ id: "k" + i, date: `${ym}-${dd}`, description: `SAMPLEMART #${400 + i} ANYTOWN MI`, amount: 20 + i, category: "Shopping", type: "expense" }));
  await offline(page); await seed(page, d);
  let asked = "";
  page.on("dialog", dlg => { asked = dlg.message(); dlg.accept(); });
  await page.goto(APP);
  await openTab(page, "transactions");
  await openTxn(page, "SAMPLEMART #400");
  await page.selectOption("#qaCategory", "Groceries");
  await page.click("#qaSave");
  expect(asked).toContain('Use Groceries for all "SAMPLEMART…"');
  expect(asked).toContain("2 other transactions");
  const tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  expect(tx.filter(t => /SAMPLEMART/.test(t.description)).every(t => t.category === "Groceries")).toBe(true);
  const rules = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_cat_rules")));
  expect(rules[0].key).toBe("samplemart");

  // new one gets the rule
  await page.click("#fabAdd");
  await page.fill("#qaAmount", "9");
  await page.fill("#qaDesc", "SAMPLEMART 77");
  await page.locator("#qaDesc").dispatchEvent("input");
  await expect(page.locator("#qaCategory")).toHaveValue("Groceries");
  await page.keyboard.press("Escape");

  // rule shows in Settings and can be deleted
  await page.click("#qaClose");
  await openTab(page, "settings");
  await expect(page.locator("#catRuleList")).toContainText("SAMPLEMART… → Groceries");
  await page.locator('#catRuleList [data-rule]').click();
  await expect(page.locator("#catRuleList")).toContainText("None yet");
  expect(errors).toEqual([]);
});

test("This week lists what to do and clears as things get done", async ({ page }) => {
  const errors = watchErrors(page);
  const day = n => iso(Date.now() - n * 86400000);
  const d = householdData();
  d.pa_accounts = [{ id: "co", name: "Sample Card", kind: "card", startBalance: 0, since: day(60), closeDay: 13, coveredThrough: day(9), coveredFrom: day(40), lastImport: day(9) }];
  d.pa_transactions.push({ id: "u1", date: day(2), description: "Mystery shop", amount: 12, category: "", type: "expense", src: "import" },
                         { id: "est1", date: day(1), description: "Electric", amount: 120, category: "Utilities", type: "expense", estimate: true, recurId: "x" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await expect(page.locator("#catchUp")).toContainText("This week");
  await page.click("#catchUpBtn");
  const week = page.locator("#weekList");
  await expect(week).toContainText("Sample Card");
  await expect(week).toContainText("screenshot recent activity");
  await expect(week).toContainText("1 estimated bill");
  await expect(week).toContainText("1 transaction needs a category");

  // confirm the estimate
  await week.locator('[data-week="estimates"]').click();
  await page.locator("#txnList .txn-row", { hasText: "Electric" }).click();
  await page.fill("#qaAmount", "131.20");
  await page.click("#qaSave");
  await expect(week).not.toContainText("estimated bill");
  expect(errors).toEqual([]);
});
