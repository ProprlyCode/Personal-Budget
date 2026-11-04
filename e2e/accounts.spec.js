// Cards, checking, quick add and editing.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, householdData, openTxn } = require("./helpers");

async function addAccount(page, name, kind, bal){
  await openTab(page, "settings");
  await page.fill("#acctName", name);
  await page.selectOption("#acctKind", kind);
  await page.fill("#acctBalance", String(bal));
  await page.click("#acctForm button[type=submit]");
}
async function quickAdd(page, { type, amount, desc, cat, acct, card }){
  await page.click("#fabAdd");
  if(type) await page.click(`.qa-t[data-qt="${type}"]`);
  await page.fill("#qaAmount", String(amount));
  await page.fill("#qaDesc", desc);
  await page.locator("#qaDesc").dispatchEvent("change");
  if(cat) await page.selectOption("#qaCategory", cat);
  if(acct) await page.selectOption("#qaAcct", { label: acct });
  if(card) await page.selectOption("#qaCardPaid", { label: card });
  await page.click("#qaSave");
  await expect(page.locator("#qaOverlay")).toBeHidden();
}

test("card purchases build a balance; paying it from checking clears it without counting as spending", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  await addAccount(page, "Capital One", "card", 0);
  await addAccount(page, "Checking", "checking", 4000);

  await quickAdd(page, { amount: 85.5, desc: "Kroger", cat: "Groceries" });       // defaults to the card
  await quickAdd(page, { amount: 40, desc: "Chipotle", cat: "Dining Out" });
  let tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const kroger = tx.find(t => t.description === "Kroger");
  const acc = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_accounts")));
  expect(kroger.acctId).toBe(acc.find(a => a.name === "Capital One").id);

  await openTab(page, "dashboard");
  await expect(page.locator("#cardsBody")).toContainText("$125.50");
  await expect(page.locator("#statTiles .cell").nth(1)).toContainText("$125.50");

  await quickAdd(page, { type: "cardpay", amount: 125.5, desc: "Card payment", acct: "Checking", card: "Capital One" });
  await openTab(page, "dashboard");
  await expect(page.locator("#cardsBody .card-line").first()).toContainText("$0.00");
  await expect(page.locator("#statTiles .cell").nth(1)).toContainText("$125.50");   // still just the purchases
  tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const pay = tx.find(t => t.category === "Credit Card Payment");
  expect(pay.link).toMatch(/^card:/);
  expect(pay.acctId).toBe(acc.find(a => a.name === "Checking").id);

  await openTab(page, "settings");
  await expect(page.locator("#acctList")).toContainText("$3,874.50");   // 4000 - 125.50 paid from checking
  expect(errors).toEqual([]);
});

test("quick add remembers merchants; tapping a transaction edits it", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page); await seed(page, householdData());
  await page.goto(APP);
  await addAccount(page, "Chase", "card", 0);
  await quickAdd(page, { amount: 12, desc: "Corner Bakery", cat: "Dining Out" });

  // second time: category fills itself from history
  await page.click("#fabAdd");
  await page.fill("#qaAmount", "9");
  await page.fill("#qaDesc", "Corner Bakery");
  await page.locator("#qaDesc").dispatchEvent("input");
  await expect(page.locator("#qaCategory")).toHaveValue("Dining Out");
  await page.click("#qaSave");

  // edit the amount
  await openTab(page, "transactions");
  await openTxn(page, "Corner Bakery");
  await expect(page.locator("#qaTitle")).toHaveText("Edit transaction");
  await page.fill("#qaAmount", "10.25");
  await page.click("#qaSave");
  const tx = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")));
  const bakery = tx.filter(t => t.description === "Corner Bakery");
  expect(bakery.length).toBe(2);
  expect(bakery.some(t => t.amount === 10.25)).toBe(true);
  expect(errors).toEqual([]);
});

test("editing a linked transfer's amount moves the linked goal with it", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_savings_goals[0].since = ym + "-01";
  d.pa_transactions.push({ id: "sv", date: ym + "-02", description: "Goal deposit", amount: 100, category: "Savings/Investments", type: "expense", account: "", notes: "", link: "goal:ef" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await openTab(page, "transactions");
  await openTxn(page, "Goal deposit");
  await page.fill("#qaAmount", "150");
  await page.click("#qaSave");
  const goals = await page.evaluate(() => JSON.parse(localStorage.getItem("pa_savings_goals")));
  expect(goals[0].currentAmount).toBe(9150);
  expect(errors).toEqual([]);
});

test("saved accounts load on startup and show on the Dashboard", async ({ page }) => {
  const errors = watchErrors(page);
  const d = householdData();
  const ym = new Date().toISOString().slice(0, 7);
  d.pa_accounts = [{ id: "co", name: "Capital One", kind: "card", startBalance: 0, since: ym + "-01", isDefault: true }];
  d.pa_transactions.push({ id: "k1", date: ym + "-01", description: "Kroger", amount: 42, category: "Groceries", type: "expense", acctId: "co", account: "Capital One", notes: "" });
  await offline(page); await seed(page, d);
  await page.goto(APP);
  await expect(page.locator("#cardsBody")).toContainText("$42.00");
  expect(errors).toEqual([]);
});
