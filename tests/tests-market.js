const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = name => { const m = html.match(new RegExp('\\/\\* ===' + name + '-START===[\\s\\S]*?===' + name + '-END=== \\*\\/')); if(!m){ console.error(name + ' block not found'); process.exit(1); } return m[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const E = new Function(shims + pick('FUND-ENGINE') + pick('MARKET-ENGINE') + `
  ;return { parseAlphaMonthly, monthlyReturns, measureVsBenchmark, drawdownFromPeak, adjOn, fundLiveValue, planFetch, evaluateFund, CLASS_BENCH };
`)();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-alphavantage-monthly.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// --- parsing a real Alpha Vantage response ---
{
  const p = E.parseAlphaMonthly(fixture);
  ok(!p.error && p.rows.length === 30, 'parses the real monthly-adjusted response (30 rows)');
  ok(p.rows[0].date < p.rows[29].date, 'rows sorted oldest → newest');
  ok(p.latest.date === '2026-10-30' && p.latest.close > 0 && p.latest.adj > 0, 'latest row has close and adjusted close');
}
ok(E.parseAlphaMonthly({ 'Error Message': 'Invalid API call. Please retry or visit the documentation' }).error === 'notfound', 'bad ticker → notfound');
ok(E.parseAlphaMonthly({ 'Error Message': 'the parameter apikey is invalid or missing' }).error === 'key', 'bad key → key');
ok(E.parseAlphaMonthly({ Information: 'The **demo** API key is for demo purposes only. Please claim your free API key' }).error === 'key', 'demo-key notice → key');
ok(E.parseAlphaMonthly({ Information: 'We have detected your API key as X and our standard API rate limit is 25 requests per day.' }).error === 'limit', 'daily cap → limit');
ok(E.parseAlphaMonthly({ foo: 1 }).error === 'bad' && E.parseAlphaMonthly(null).error === 'bad', 'unexpected payloads are errors, not crashes');

// --- synthetic monthly series ---
function series(startYm, n, monthlyR, startPx){
  const rows = []; let px = startPx || 100; let [y, m] = startYm.split('-').map(Number);
  for(let i = 0; i < n; i++){
    if(i > 0) px *= 1 + (typeof monthlyR === 'function' ? monthlyR(i) : monthlyR);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    rows.push({ date: `${y}-${String(m).padStart(2,'0')}-${last}`, close: px, adj: px });
    m++; if(m > 12){ m = 1; y++; }
  }
  return rows;
}
// deterministic pseudo-noise
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const benchR = Array.from({ length: 200 }, () => 0.008 + rnd() * 0.08);
const bench = series('2014-01', 155, i => benchR[i]);           // Jan 2014 … Oct 2026 + a partial Nov 2026
{
  const r = E.monthlyReturns(bench, '2026-11-02');
  ok(r.length === 153, '154 complete months → 153 returns (got ' + r.length + ')');
  ok(r[r.length-1].m === '2026-10', 'the current (partial) month is excluded');
}
{
  // fund = bench minus 0.05%/mo exactly → TE 0, excess ≈ −0.6%/yr
  const fund = series('2014-01', 155, i => (1 + benchR[i]) * (1 - 0.0005) - 1);
  const m = E.measureVsBenchmark(fund, bench, '2026-11-02', 120);
  ok(m.months === 120 && m.years === 10, 'uses the last 120 complete months');
  ok(near(m.excess, -0.6 * (1 + m.annBench / 100), 0.05), 'excess ≈ −0.6%/yr (got ' + m.excess + ')');
  ok(m.te < 0.05 && near(m.beta, 1, 0.01), 'index-like fund: TE ≈ 0, beta ≈ 1');
}
{
  // active fund: bench + 0.2%/mo + 1.2%/mo noise → TE ≈ 1.2·√12·(1/√12 of uniform sd)…
  const noise = Array.from({ length: 200 }, () => rnd() * 0.04);  // uniform ±2% → sd ≈ 1.155%
  const fund = series('2014-01', 155, i => benchR[i] + 0.002 + noise[i]);
  const m = E.measureVsBenchmark(fund, bench, '2026-11-02', 120);
  ok(near(m.te, 1.155 * Math.sqrt(12), 0.6), 'tracking error ≈ 4%/yr from ±2%/mo noise (got ' + m.te + ')');
  ok(m.t > 1 && m.excess > 1, 'positive excess detected (t=' + m.t + ', excess ' + m.excess + ')');
  const e = E.evaluateFund({ name: 'Active', cls: 'us-large', er: 0.5, measured: Object.assign({ vs: 'SPY' }, m) });
  ok(e.excess.measured && e.te === Math.max(0.3, m.te), 'evaluateFund uses measured excess and tracking error');
  ok(/measured from prices/.test(e.reasons.join()), 'reasons say the numbers are measured');
  ok(E.evaluateFund({ name: 'X', cls: 'us-large', er: 0.5, measured: { years: 2, te: 1, excess: 5, vs: 'SPY' } }).excess === null, 'under 3 years of prices: measured stats ignored');
}
ok(E.measureVsBenchmark(series('2026-01', 6, 0.01), bench, '2026-11-02') === null, 'too little overlap → null');

// --- drawdown ---
{
  const rows = series('2026-01', 10, i => (i <= 6 ? 0.02 : -0.06));
  const d = E.drawdownFromPeak(rows, 60);
  ok(d.peakDate === '2026-07-31' && near(d.pct, (Math.pow(0.94, 3) - 1) * 100, 0.01), 'drawdown from the month-end peak (got ' + d.pct + ')');
}

// --- valuation ---
{
  const priced = { ABCDX: { rows: series('2026-01', 10, 0.01, 50), latest: null } };
  priced.ABCDX.latest = priced.ABCDX.rows[9];
  const spy = { rows: series('2026-01', 10, 0.02, 400) }; spy.latest = spy.rows[9];
  const priceOf = t => t === 'SPY' ? spy : priced[t] || null;
  const live = E.fundLiveValue({ ticker: 'ABCDX', shares: 10, balance: 0, cls: 'us-large' }, priceOf, '2026-05-31');
  ok(live.source === 'live' && near(live.value, 10 * priced.ABCDX.latest.close, 0.01), 'shares × latest price');
  const est = E.fundLiveValue({ ticker: '', shares: 0, balance: 1000, cls: 'us-large' }, priceOf, '2026-05-31');
  ok(est.source === 'est' && est.via === 'SPY' && near(est.value, 1000 * Math.pow(1.02, 5), 0.5), 'no ticker: balance grown by the stand-in since the balance date (got ' + est.value + ')');
  const rec = E.fundLiveValue({ ticker: 'NOPEX', shares: 5, balance: 700, cls: 'other' }, priceOf, '2026-05-31');
  ok(rec.source === 'recorded' && rec.value === 700, 'no price and no stand-in → recorded balance');
}

// --- fetch planning ---
{
  const now = Date.UTC(2026, 10, 2, 18);
  const H = 3600000;
  const cache = { SPY: { fetchedAt: now - 2 * H }, AGG: { fetchedAt: now - 20 * H }, BADX: { fetchedAt: now - 2 * 86400000, error: 'notfound' }, LIMX: { fetchedAt: now - H, error: 'limit' } };
  const needs = [{ ticker: 'spy', priority: 0 }, { ticker: 'AGG', priority: 2 }, { ticker: 'FUNDX', priority: 1 }, { ticker: 'BADX', priority: 1 }, { ticker: 'LIMX', priority: 3 }, { ticker: 'AGG', priority: 1 }];
  const plan = E.planFetch(needs, cache, now, 25, 12 * H);
  ok(plan.join() === 'AGG,FUNDX,LIMX', 'fresh skipped, not-found waits a week, stale/missing/limited fetched by priority (got ' + plan.join() + ')');
  ok(E.planFetch(needs, cache, now, 1, 12 * H).join() === 'AGG', 'respects the remaining daily budget');
  ok(E.planFetch(needs, cache, now, 25, 0).indexOf('SPY') !== -1, 'force refresh refetches fresh tickers');
}

console.log(`market engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
