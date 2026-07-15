const fs = require('fs');
const html = fs.readFileSync('/workspace/personal-budget/index.html', 'utf8');
const m = html.match(/\/\* ===DEBT-GROUP-ENGINE-START===[\s\S]*?===DEBT-GROUP-ENGINE-END=== \*\//);
if(!m){ console.error('engine block not found'); process.exit(1); }
const shims = `
  function round2(n){ return Math.round((Number(n)||0)*100)/100; }
  const DEBT_CAP_MONTHS = 600;
`;
const api = new Function(shims + m[0] + `
  ;return { isGroupedDebt, debtUnits, groupTotals, allocateByWeight, simulateDebtStrategy, computeAllStrategies };
`)();
const { debtUnits, groupTotals, simulateDebtStrategy, computeAllStrategies } = api;

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
function approx(a,b,eps){ return Math.abs(a-b) <= (eps||0.05); }

// --- helpers ---
ok(groupTotals([{balance:1000,apr:6,minPayment:20},{balance:1000,apr:10,minPayment:30}]).blendedApr === 8, 'blended APR is balance-weighted (8%)');
ok(groupTotals([{balance:1000,apr:6,minPayment:20},{balance:1000,apr:10,minPayment:30}]).minPayment === 50, 'group min total = 50');
ok(debtUnits({id:'x',name:'Loan',balance:500,apr:5,minPayment:10}).length === 1, 'non-grouped debt -> single unit');
ok(debtUnits({grouped:true,subLoans:[{id:'a',balance:1,apr:1,minPayment:1},{id:'b',balance:1,apr:1,minPayment:1}]}).length === 2, 'grouped debt -> N units');

// --- single-unit sanity vs closed amortization ($1000 @ 12%/yr = 1%/mo, pay $100) ---
{
  const r = simulateDebtStrategy([{id:'u',name:'U',balance:1000,apr:12,minPayment:100}], 0, 'avalanche');
  ok(r.feasible && r.months === 11, 'single loan $1000@12% $100/mo pays off in 11 months (got '+r.months+')');
  ok(approx(r.totalInterest, 58.98, 0.1), 'single loan total interest ~$58.98 (got '+r.totalInterest+')');
}

// --- avalanche targets highest APR first ---
{
  const units = [{id:'A',name:'A',balance:1000,apr:20,minPayment:20},{id:'B',name:'B',balance:1000,apr:5,minPayment:20}];
  const r = simulateDebtStrategy(units, 200, 'avalanche');
  ok(r.perUnit.A.paidOffMonth < r.perUnit.B.paidOffMonth, 'avalanche pays high-APR A before B');
}
// --- snowball targets smallest balance first (even if lower APR) ---
{
  const units = [{id:'A',name:'A',balance:500,apr:5,minPayment:10},{id:'B',name:'B',balance:2000,apr:20,minPayment:40}];
  const rs = simulateDebtStrategy(units, 200, 'snowball');
  ok(rs.perUnit.A.paidOffMonth < rs.perUnit.B.paidOffMonth, 'snowball pays small-balance A before B');
  const ra = simulateDebtStrategy(units, 200, 'avalanche');
  ok(ra.perUnit.B.paidOffMonth <= rs.perUnit.B.paidOffMonth, 'avalanche clears the high-APR loan no later than snowball');
  ok(ra.totalInterest <= rs.totalInterest + 0.01, 'avalanche total interest <= snowball');
}

// --- custom split: 100% to A pays A first; 70/30 favors A ---
{
  const units = [{id:'A',name:'A',balance:1000,apr:10,minPayment:20},{id:'B',name:'B',balance:1000,apr:10,minPayment:20}];
  const all = simulateDebtStrategy(units, 300, 'custom', {A:100,B:0});
  ok(all.perUnit.A.paidOffMonth < all.perUnit.B.paidOffMonth, 'custom 100%->A pays A first');
  const split = simulateDebtStrategy(units, 300, 'custom', {A:70,B:30});
  ok(split.perUnit.A.paidOffMonth <= split.perUnit.B.paidOffMonth, 'custom 70/30 pays A no later than B');
  ok(split.feasible, 'custom split is feasible');
}
// --- proportional redistribution: once A (tiny) is done, B gets the whole pool ---
{
  const units = [{id:'A',name:'A',balance:100,apr:10,minPayment:10},{id:'B',name:'B',balance:3000,apr:10,minPayment:30}];
  const custom = simulateDebtStrategy(units, 300, 'custom', {A:50,B:50});
  const bAloneShare = simulateDebtStrategy([{id:'B',name:'B',balance:3000,apr:10,minPayment:30}], 150, 'custom', {B:100});
  ok(custom.perUnit.B.paidOffMonth < bAloneShare.months, 'after A clears, B accelerates (redistribution works)');
}

// --- minimums baseline is the worst; avalanche saves the most ---
{
  const units = [{id:'A',name:'A',balance:1500,apr:22,minPayment:40},{id:'B',name:'B',balance:1200,apr:6,minPayment:35},{id:'C',name:'C',balance:800,apr:12,minPayment:25}];
  const all = computeAllStrategies(units, 285, {A:60,B:20,C:20});
  ok(all.minimums.totalInterest >= all.avalanche.totalInterest, 'minimums interest >= avalanche');
  ok(all.avalanche.totalInterest <= all.snowball.totalInterest + 0.01, 'avalanche <= snowball interest');
  ok(all.avalanche.interestSaved >= all.snowball.interestSaved - 0.01, 'avalanche saves >= snowball');
  ok(all.avalanche.interestSaved >= all.custom.interestSaved - 0.01, 'avalanche saves >= custom');
  ok(all.avalanche.months <= all.minimums.months, 'avalanche finishes no later than minimums');
  ok(all.minimums.interestSaved === 0, 'minimums saves 0 vs itself');
}

// --- infeasible: min below monthly interest, no extra ---
{
  const r = simulateDebtStrategy([{id:'x',name:'X',balance:10000,apr:24,minPayment:10}], 0, 'minimums');
  ok(!r.feasible && r.months === Infinity, 'loan whose min < interest is flagged infeasible');
  ok(r.infeasibleUnits.indexOf('x') !== -1, 'infeasible unit id reported');
}

// --- series integrity: totalSeries starts at total balance and ends at 0 when feasible ---
{
  const units = [{id:'A',name:'A',balance:1000,apr:8,minPayment:25},{id:'B',name:'B',balance:600,apr:15,minPayment:20}];
  const r = simulateDebtStrategy(units, 150, 'avalanche');
  ok(r.totalSeries[0] === 1600, 'series starts at 1600');
  ok(r.totalSeries[r.totalSeries.length-1] === 0, 'series ends at 0');
  ok(r.totalSeries.length === r.months + 1, 'series length = months + 1');
}

console.log(`\nENGINE TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
