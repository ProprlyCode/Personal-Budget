const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ===DECIDE-ENGINE-START===[\s\S]*?===DECIDE-ENGINE-END=== \*\//);
if(!m){ console.error('engine block not found'); process.exit(1); }
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const api = new Function(shims + m[0] + `
  ;return { realPolicy, retirementMix, normalizePolicy, glideAllocation, quantile, simulateGoal, probReach, requiredMonthly,
            wealthPercentiles, allocateContributions, rebalanceCheck, monthlyCashflow, meanSd, hashSeed };
`)();
const E = api;

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
function near(a, b, rel){ return Math.abs(a - b) <= Math.abs(b) * rel; }

// --- policy normalization ---
{
  const p = E.normalizePolicy({ confidence: 120, corr: 5, monthlyInvest: -3, stockReturn: '8', bogus: 1 });
  ok(p.confidence === 99 && p.corr === 0.95 && p.monthlyInvest === 0, 'policy clamps out-of-range values');
  ok(p.stockReturn === 8 && p.bogus === undefined, 'policy coerces numbers and ignores unknown keys');
  ok(E.normalizePolicy(null).confidence === 80, 'default confidence is 80%');
}

// --- glide path ---
ok(JSON.stringify(E.glideAllocation(20)) === '{"stocks":90,"bonds":10,"cash":0}', '15+ years → 90/10/0');
ok(JSON.stringify(E.glideAllocation(0)) === '{"stocks":10,"bonds":40,"cash":50}', 'goal date reached → 10/40/50');
{
  const g = E.glideAllocation(7.5);
  ok(g.stocks === 70 && g.stocks + g.bonds + g.cash === 100, '7.5 years interpolates to 70% stocks and sums to 100');
}

// --- quantile ---
ok(E.quantile([1,2,3,4,5], 0.5) === 3 && E.quantile([0,10], 0.25) === 2.5, 'quantile interpolates');

// --- zero-volatility simulation matches closed-form compounding ---
{
  const policy = { stockReturn: 12, stockVol: 0, bondVol: 0, cashVol: 0 };
  const sim = E.simulateGoal({ balance: 1000, months: 24, allocAt: () => ({ stocks:100, bonds:0, cash:0 }), policy, sims: 50, seed: 1 });
  ok(near(sim.A[0], 1000 * 1.12 * 1.12, 1e-9), 'no-vol balance grows exactly 12%/yr (got ' + sim.A[0] + ')');
  const r = Math.pow(1.12, 1/12) - 1, annuity = (Math.pow(1 + r, 24) - 1) / r;
  ok(near(sim.S[0], annuity, 1e-9), 'no-vol S equals the annuity factor');
  ok(E.probReach(sim, 0, 1254) === 1 && E.probReach(sim, 0, 1255) === 0, 'deterministic odds are 0 or 1 at the exact threshold');
  const need = E.requiredMonthly(sim, 1254.4 + 100 * annuity, 80);
  ok(need === 100, 'required monthly recovers the contribution (got ' + need + ')');
  ok(sim.checkpoints.join() === '12,24', 'yearly checkpoints');
  ok(E.wealthPercentiles(sim, 0, 0, [0.5])[0] === 1120, 'checkpoint after year 1 = $1120');
}

// --- stochastic simulation: sensible and reproducible ---
{
  const opts = { balance: 10000, months: 120, allocAt: () => ({ stocks:100, bonds:0, cash:0 }), policy: {}, seed: 42 };
  const a = E.simulateGoal(opts), b = E.simulateGoal(opts);
  ok(a.A[17] === b.A[17], 'same seed → identical paths');
  const med = E.quantile(a.A, 0.5);
  ok(near(med, 10000 * Math.pow(1.07, 10), 0.04), 'median 10-yr stock outcome ≈ 7%/yr compounding (got ' + Math.round(med) + ')');
  const p10 = E.quantile(a.A, 0.1), p90 = E.quantile(a.A, 0.9);
  ok(p10 < med * 0.75 && p90 > med * 1.3, 'outcomes have a realistic spread (p10 ' + Math.round(p10) + ', p90 ' + Math.round(p90) + ')');
  const target = 40000;
  ok(E.probReach(a, 0, target) < E.probReach(a, 100, target) && E.probReach(a, 100, target) < E.probReach(a, 300, target), 'odds rise with contributions');
  const need = E.requiredMonthly(a, target, 80);
  ok(E.probReach(a, need, target) >= 0.8 && E.probReach(a, need - 2, target) < 0.8, 'required monthly is the smallest amount giving 80% odds (' + need + ')');
  const bond = E.simulateGoal(Object.assign({}, opts, { allocAt: () => ({ stocks:0, bonds:100, cash:0 }) }));
  ok(E.quantile(bond.A, 0.9) - E.quantile(bond.A, 0.1) < p90 - p10, 'bonds have a narrower range than stocks');
}

// --- allocator funds the worst-odds goal first, respects caps ---
{
  const mk = (bal, seed) => E.simulateGoal({ balance: bal, months: 120, allocAt: () => ({ stocks:80, bonds:20, cash:0 }), policy: {}, seed, sims: 800 });
  const behind = { id: 'behind', sim: mk(1000, 1), target: 60000 };
  const ahead = { id: 'ahead', sim: mk(30000, 2), target: 60000 };
  behind.cap = E.requiredMonthly(behind.sim, behind.target, 80);
  ahead.cap = E.requiredMonthly(ahead.sim, ahead.target, 80);
  const small = E.allocateContributions([ahead, behind], 100, 10);
  ok(small.alloc.behind === 100 && small.alloc.ahead === 0, 'a small budget all goes to the goal that is furthest behind');
  const big = E.allocateContributions([ahead, behind], 5000, 10);
  ok(big.alloc.behind >= behind.cap && big.alloc.behind < behind.cap + 10, 'never funds past what a goal needs (cap ' + behind.cap + ', got ' + big.alloc.behind + ')');
  ok(big.leftover > 0 && Math.abs(big.alloc.behind + big.alloc.ahead + big.leftover - 5000) < 0.01, 'surplus is returned as leftover and totals add up');
  const odd = E.allocateContributions([ahead, behind], 105, 10);
  ok(odd.leftover === 0 && Math.abs(odd.alloc.behind + odd.alloc.ahead - 105) < 0.01, 'a remainder under one step goes to a goal that still needs money, not "extra"');
}

// --- rebalancing ---
{
  const r = E.rebalanceCheck({ stocks: 95, bonds: 5, cash: 0 }, { stocks: 85, bonds: 15, cash: 0 }, 5, 10000, 500);
  ok(r.needs && r.maxDrift === 10, '10-point drift exceeds a 5-point band');
  ok(r.trades.stocks === -1000 && r.trades.bonds === 1000, 'trade amounts restore the target');
  ok(near(r.newMoneyNeeded, 10000 * (0.95/0.85 - 1), 1e-3), 'new money needed to fix it without selling');
  ok(!E.rebalanceCheck({ stocks: 88, bonds: 12, cash: 0 }, { stocks: 85, bonds: 15, cash: 0 }, 5, 10000, 500).needs, 'small drift is left alone');
  ok(E.rebalanceCheck({ stocks: 0, bonds: 0, cash: 0 }, { stocks: 85, bonds: 15, cash: 0 }, 5, 1, 1) === null, 'unknown allocation → null');
}

// --- cashflow statistics ---
{
  const tx = [
    { date: '2026-08-03', type: 'income', amount: 5000 }, { date: '2026-08-10', type: 'expense', amount: 3000, category: 'Housing' },
    { date: '2026-08-11', type: 'expense', amount: 500, category: 'Savings/Investments' },
    { date: '2026-09-03', type: 'income', amount: 5000 }, { date: '2026-09-10', type: 'expense', amount: 4000, category: 'Housing' },
    { date: '2026-10-03', type: 'income', amount: 5000 }, { date: '2026-10-10', type: 'expense', amount: 3500, category: 'Groceries' },
    { date: '2026-11-01', type: 'expense', amount: 9999, category: 'Housing' }
  ];
  const rows = E.monthlyCashflow(tx, '2026-11-02', 6, ['Savings/Investments']);
  ok(rows.map(r => r.month).join() === '2026-08,2026-09,2026-10', 'only complete months with data');
  ok(rows[0].expense === 3000, 'investing transfers are not counted as spending');
  const st = E.meanSd(rows.map(r => r.net));
  ok(st.mean === 1500 && st.sd === 500 && st.n === 3, 'mean/sample sd of monthly surplus (1500 ± 500)');
}

// --- today's dollars and the retirement path ---
{
  const r = E.realPolicy({ stockReturn: 7, bondReturn: 4, cashReturn: 3, stockVol: 16 }, 2.5);
  ok(Math.abs(r.stockReturn - 4.39) < 0.01 && Math.abs(r.bondReturn - 1.46) < 0.01 && Math.abs(r.cashReturn - 0.49) < 0.01, 'after 2.5% inflation: stocks 4.39%, bonds 1.46%, cash 0.49%');
  ok(r.stockVol === 16, 'volatility is unchanged');
  ok(E.realPolicy({ stockReturn: 7, bondReturn: 4, cashReturn: 3 }, 0).stockReturn === 7, 'no inflation → unchanged');
  ok(E.retirementMix(32).stocks === 90 && E.retirementMix(10).stocks === 66 && E.retirementMix(0).stocks === 50, 'retirement path 90% → 66% → 50% stocks');
  const m = E.retirementMix(-3); ok(m.stocks === 45 && m.stocks + m.bonds + m.cash === 100, 'after retirement it keeps easing and sums to 100');
  const p = E.normalizePolicy({ retireYear: 1800, retireMultiple: 99, inflation: -1 });
  ok(p.retireYear === 0 && p.retireMultiple === 50 && p.inflation === 0 && p.iraLimit === 7500 && p.collegeInflation === 5, 'new rules have safe defaults and bounds');
}

console.log(`decision engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
