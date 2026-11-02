// Two devices, one household: per-section saving and item-level merging.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, openTab } = require("./helpers");
const { FakeCloud } = require("./fake-firebase");

const tx = (id, desc, amount) => ({ id, date: "2026-10-05", description: desc, amount, category: "Groceries", type: "expense", account: "", notes: "" });
function cloudSeed(){
  return { budget: { transactions: [tx("t1", "Seed one", 10), tx("t2", "Seed two", 20)], goals: false, updatedAt: 1000 } };
}
async function device(browser, cloud, localSeed){
  const ctx = await browser.newContext();
  const page = await cloud.attach(ctx);
  page.__errors = watchErrors(page);
  if(localSeed) await page.addInitScript(d => { if(sessionStorage.getItem("__s")) return; Object.keys(d).forEach(k => localStorage.setItem(k, typeof d[k] === "string" ? d[k] : JSON.stringify(d[k]))); sessionStorage.setItem("__s", "1"); }, localSeed);
  await page.goto(APP);
  await expect(page.locator("#loginGate")).toBeHidden();
  return page;
}
async function addTxn(page, desc, amount){
  await openTab(page, "transactions");
  if(!(await page.locator("#addTxnBody").isVisible())) await page.click("#addTxnToggle");
  await page.fill("#txnDesc", desc);
  await page.fill("#txnAmount", String(amount));
  await page.locator("#txnForm button[type=submit]").click();
}
const descs = list => (list || []).map(t => t.description).sort();
const localTx = page => page.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions") || "[]"));

test("two people adding transactions at the same moment both keep theirs", async ({ browser }) => {
  const cloud = new FakeCloud(cloudSeed());
  const a = await device(browser, cloud), b = await device(browser, cloud);
  await expect.poll(() => localTx(b).then(descs)).toEqual(["Seed one", "Seed two"]);
  // both add within the same save window
  await Promise.all([addTxn(a, "Added on A", 11), addTxn(b, "Added on B", 22)]);
  const all = ["Added on A", "Added on B", "Seed one", "Seed two"];
  await expect.poll(() => descs(cloud.get("budget/transactions")), { timeout: 10000 }).toEqual(all);
  await expect.poll(() => localTx(a).then(descs), { timeout: 10000 }).toEqual(all);
  await expect.poll(() => localTx(b).then(descs), { timeout: 10000 }).toEqual(all);
  expect(a.__errors.concat(b.__errors)).toEqual([]);
});

test("editing different sections on two devices never overwrites either", async ({ browser }) => {
  const cloud = new FakeCloud(cloudSeed());
  const a = await device(browser, cloud), b = await device(browser, cloud);
  await openTab(a, "goals");
  await a.fill("#goalName", "Vacation"); await a.fill("#goalTarget", "3000");
  await Promise.all([a.locator("#goalForm button[type=submit]").click(), addTxn(b, "Added on B", 22)]);
  await expect.poll(() => (cloud.get("budget/goals") || []).map(g => g.name), { timeout: 10000 }).toEqual(["Vacation"]);
  await expect.poll(() => descs(cloud.get("budget/transactions")), { timeout: 10000 }).toContain("Added on B");
  await expect.poll(() => a.evaluate(() => JSON.parse(localStorage.getItem("pa_transactions")).length), { timeout: 10000 }).toBe(3);
  await expect.poll(() => b.evaluate(() => (JSON.parse(localStorage.getItem("pa_savings_goals") || "[]")).length), { timeout: 10000 }).toBe(1);
});

test("a delete on one device reaches the other; deleting the last item empties the list", async ({ browser }) => {
  const cloud = new FakeCloud({ budget: { transactions: [tx("t1", "Only one", 10)], updatedAt: 1000 } });
  const a = await device(browser, cloud), b = await device(browser, cloud);
  await expect.poll(() => localTx(b).then(l => l.length)).toBe(1);
  await openTab(a, "transactions");
  a.once("dialog", d => d.accept());
  await a.locator("#txnTableBody tr").filter({ hasText: "Only one" }).locator("button").last().click();
  await expect.poll(() => cloud.get("budget/transactions"), { timeout: 10000 }).toBe(false);
  await expect.poll(() => localTx(b).then(l => l.length), { timeout: 10000 }).toBe(0);
});

test("an edit that couldn't be saved survives a reload and is merged later", async ({ browser }) => {
  const cloud = new FakeCloud(cloudSeed());
  const a = await device(browser, cloud);
  cloud.failWrites = true;
  await addTxn(a, "Saved while offline", 5);
  await expect.poll(() => a.evaluate(() => localStorage.getItem("pa_dirty_sections")), { timeout: 5000 }).toContain("transactions");
  // meanwhile another device added something
  cloud.set("budget/transactions", cloud.get("budget/transactions").concat([tx("t9", "From the other phone", 9)]));
  cloud.failWrites = false;
  await a.reload();
  await expect.poll(() => descs(cloud.get("budget/transactions")), { timeout: 10000 }).toEqual(["From the other phone", "Saved while offline", "Seed one", "Seed two"]);
  await expect.poll(() => a.evaluate(() => localStorage.getItem("pa_dirty_sections")), { timeout: 10000 }).toBe("[]");
});

test("upgrading from whole-blob sync: a newer local copy merges instead of wiping the other device's data", async ({ browser }) => {
  const cloud = new FakeCloud({ budget: { transactions: [tx("t1", "Seed one", 10), tx("t3", "Added by spouse", 30)], updatedAt: 1000 } });
  // old-version device: newer timestamp, no pa_dirty_sections record, an unsynced transaction
  const a = await device(browser, cloud, { pa_transactions: [tx("t1", "Seed one", 10), tx("t4", "Unsynced on old version", 40)], pa_updated_at: "5000" });
  await expect.poll(() => descs(cloud.get("budget/transactions")), { timeout: 10000 }).toEqual(["Added by spouse", "Seed one", "Unsynced on old version"]);
  await expect.poll(() => localTx(a).then(descs), { timeout: 10000 }).toEqual(["Added by spouse", "Seed one", "Unsynced on old version"]);
});

test("restoring a snapshot on one device rolls back the household, including later additions", async ({ browser }) => {
  const cloud = new FakeCloud(cloudSeed());
  const a = await device(browser, cloud), b = await device(browser, cloud);
  await openTab(a, "settings");
  await expect(a.locator("#backupList tr[data-snap]")).toHaveCount(1, { timeout: 15000 });   // snapshot of the seed data
  await addTxn(b, "Added after the snapshot", 7);
  await expect.poll(() => localTx(a).then(l => l.length), { timeout: 10000 }).toBe(3);
  await openTab(a, "settings");
  a.once("dialog", d => d.accept());
  await a.locator("#backupList tr[data-snap]").first().locator('[data-bk="restore"]').click();
  await expect.poll(() => descs(cloud.get("budget/transactions")), { timeout: 10000 }).toEqual(["Seed one", "Seed two"]);
  await expect.poll(() => localTx(b).then(descs), { timeout: 10000 }).toEqual(["Seed one", "Seed two"]);
});
