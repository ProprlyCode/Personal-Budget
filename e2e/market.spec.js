// Live prices with a mocked Alpha Vantage: no real key or network needed.
const { test, expect } = require("@playwright/test");
const { APP, watchErrors, offline, seed, openTab, openAdvanced } = require("./helpers");

// Deterministic monthly series from 2014-01 through last complete month.
function monthEnds(){
  const out = [], now = new Date();
  for(let d = new Date(Date.UTC(2014, 0, 1)); d < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); d.setUTCMonth(d.getUTCMonth() + 1)){
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push(last.toISOString().slice(0, 10));
  }
  return out;
}
const M = monthEnds();
let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
const spyR = M.map((d, i) => i >= M.length - 3 ? -0.055 : 0.009 + rnd() * 0.07);   // ends in a ~16% correction
const noise = M.map(() => rnd() * 0.04);
const RET = { SPY: i => spyR[i], SPIDX: i => (1 + spyR[i]) * (1 - 0.00003) - 1, BLUEX: i => spyR[i] + 0.0025 + noise[i], AGG: () => 0.002, BONDX: () => 0.00195, BIL: () => 0.002 };
const START = { SPY: 200, SPIDX: 50, BLUEX: 30, AGG: 100, BONDX: 10, BIL: 91 };
function series(sym){
  let px = START[sym]; const ser = {};
  M.forEach((d, i) => { if(i) px *= 1 + RET[sym](i); ser[d] = { "4. close": px.toFixed(4), "5. adjusted close": px.toFixed(4) }; });
  return { ser, last: px };
}
async function mockAlphaVantage(page, opts = {}){
  const calls = [];
  await page.route(/alphavantage\.co/, route => {
    const u = new URL(route.request().url()), sym = u.searchParams.get("symbol");
    calls.push(sym);
    let body;
    if(u.searchParams.get("apikey") !== "GOODKEY") body = { Information: "The **demo** API key is for demo purposes only. Please claim your free API key." };
    else if(opts.limitAfter && calls.length > opts.limitAfter) body = { Information: "Our standard API rate limit is 25 requests per day." };
    else if(!RET[sym]) body = { "Error Message": "Invalid API call. Please retry or visit the documentation." };
    else body = { "Meta Data": { "2. Symbol": sym }, "Monthly Adjusted Time Series": series(sym).ser };
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  return calls;
}
function lineupAccount(){
  const today = new Date().toISOString().slice(0, 10);
  const live = 300 * series("SPIDX").last + 400 * series("BLUEX").last + 900 * series("BONDX").last + 6000;
  const f = (id, name, ticker, cls, er, extra) => Object.assign({ id, name, ticker, cls, er, elect: 0, balance: 0, shares: 0, proxy: "" }, extra);
  return { pa_investments: [{ id: "k", name: "Work 401(k)", owner: "Me", type: "401(k)", monthlyContribution: 700, allocMode: "fixed", targetAlloc: { stocks: 85, bonds: 15, cash: 0 },
    history: [{ id: "h", date: today, balance: Math.round(live), contributed: 0 }],
    funds: [ f("a", "Sample S&P 500 Index", "SPIDX", "us-large", 0.03, { shares: 300, elect: 40 }),
             f("b", "Sample Blue Chip Growth", "BLUEX", "us-large", 0.55, { shares: 400, elect: 40 }),
             f("d", "Sample Bond Index", "BONDX", "bond", 0.04, { shares: 900, elect: 20 }),
             f("e", "Sample Stable Value", "", "cash", 0.40, { balance: 6000 }),
             f("x", "Sample Typo Fund", "TYPOX", "us-large", 0.70, {}) ] }] };
}

test("key setup, live values, measured stats, correction alert", async ({ page }) => {
  const errors = watchErrors(page);
  await offline(page);
  const calls = await mockAlphaVantage(page);
  await seed(page, lineupAccount());
  await page.goto(APP);
  await openTab(page, "investments");
  await openAdvanced(page);   // live prices live under Advanced
  // a rejected key is reported and stops fetching
  await page.fill("#marketKeyInput", "WRONG");
  await page.click("#marketKeySave");
  await expect(page.locator("#marketBody")).toContainText("rejected the key");
  expect(calls.length).toBe(1);
  // a good key fetches everything
  await page.click("#marketKeyBtn");
  await page.fill("#marketKeyInput", "GOODKEY");
  await page.click("#marketKeySave");
  await expect(page.locator("#marketSub")).toContainText("Prices as of", { timeout: 30000 });
  await expect(page.locator("#marketBody")).not.toContainText("Fetching", { timeout: 30000 });
  await expect(page.locator("#marketBody")).toContainText("Not found: TYPOX");
  // live account value is used and trusted
  await expect(page.locator(".inv-card").first()).toContainText("Live ≈");
  // measured statistics replace plan data
  const blue = page.locator(".fund-table tr[data-fid]").filter({ has: page.locator(".fname b", { hasText: "Blue Chip" }) });
  await expect(blue).toContainText("vs SPY");
  await expect(blue).toContainText("measured");
  // a measurably strong active fund is capped at half its class next to the index fund
  const chips = (await page.locator(".fund-sugg .chip").allInnerTexts()).join(" ");
  expect(chips).toMatch(/Blue Chip/);
  expect(chips).toMatch(/S&P 500 Index/);
  // the market-drop rule fires from SPY
  await expect(page.locator("#decList")).toContainText("Correction: S&P 500 is");
  // the cache prevents refetching on the next visit
  const n = calls.length;
  await openTab(page, "budget"); await openTab(page, "investments");
  await page.waitForTimeout(500);
  expect(calls.length).toBe(n);
  expect(errors).toEqual([]);
});

test("stops cleanly at the daily request limit and keeps what it got", async ({ page }) => {
  await offline(page);
  const calls = await mockAlphaVantage(page, { limitAfter: 2 });
  await seed(page, Object.assign(lineupAccount(), { pa_market: { apiKey: "GOODKEY" } }));
  await page.goto(APP);
  await openTab(page, "investments");
  await expect(page.locator("#marketBody")).toContainText("request limit was reached", { timeout: 30000 });
  expect(calls.length).toBe(3);
  await expect(page.locator("#marketSub")).toContainText("2 of");
  await expect(page.locator("#marketBody")).toContainText("Waiting for:");
});
