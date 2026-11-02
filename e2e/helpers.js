const path = require("path");
const APP = "file://" + (process.env.APP_FILE || path.join(__dirname, "..", "index.html"));

// Collect page errors and console errors (ignoring the blocked-network noise).
function watchErrors(page){
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if(m.type() === "error" && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errors.push("console: " + m.text()); });
  return errors;
}
// Local-only mode: no Firebase (no login gate, nothing leaves the browser).
async function offline(page){ await page.route(/gstatic\.com|firebaseio\.com|googleapis\.com/, r => r.abort()); }
// Seed localStorage once, before the app boots.
async function seed(page, data){
  await page.addInitScript(d => {
    if(sessionStorage.getItem("__seeded")) return;
    Object.keys(d).forEach(k => localStorage.setItem(k, JSON.stringify(d[k])));
    sessionStorage.setItem("__seeded", "1");
  }, data);
}
async function openTab(page, view){ await page.click(`.tab[data-view="${view}"]`); }

// Six months of household data around a fixed "today" (the app uses the real clock,
// so build dates relative to now).
function monthsBack(n){ const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); }
function householdData(){
  const tx = [];
  [6,5,4,3,2,1].forEach((k, i) => {
    const m = monthsBack(k);
    tx.push({ id: "i" + i, date: m + "-01", description: "Payroll", amount: 6200, category: "Salary/Wages", type: "income", account: "", notes: "" });
    tx.push({ id: "e" + i, date: m + "-05", description: "Rent", amount: [4100,4600,3900,4400,5200,4300][i], category: "Housing", type: "expense", account: "", notes: "" });
    tx.push({ id: "s" + i, date: m + "-06", description: "Transfer to savings", amount: 600, category: "Savings/Investments", type: "expense", account: "", notes: "" });
  });
  const today = new Date().toISOString().slice(0, 10), y = new Date().getUTCFullYear();
  return {
    pa_transactions: tx,
    pa_savings_goals: [{ id: "ef", name: "Emergency fund", targetAmount: 20000, currentAmount: 9000, targetDate: "" }],
    pa_debts: [{ id: "d1", name: "Visa", balance: 3200, apr: 22.9, minPayment: 90, plannedPayment: 150, payments: [] }],
    pa_budget: { month: today.slice(0, 7), categories: { "Savings/Investments": 600 } },
    pa_investments: [
      { id: "k", name: "Work 401(k)", owner: "Me", type: "401(k)", monthlyContribution: 700, alloc: { stocks: 96, bonds: 4, cash: 0 }, allocMode: "fixed", targetAlloc: { stocks: 85, bonds: 15, cash: 0 },
        history: [{ id: "a", date: today, balance: 47500, contributed: 0 }] },
      { id: "d1", name: "529 plan", owner: "Daughter 1", type: "529 plan", monthlyContribution: 150, targetAmount: 80000, targetDate: (y + 14) + "-08-15", alloc: { stocks: 88, bonds: 12, cash: 0 }, allocMode: "glide",
        history: [{ id: "c", date: today, balance: 6000, contributed: 0 }] }
    ]
  };
}
module.exports = { APP, watchErrors, offline, seed, openTab, householdData, monthsBack };
