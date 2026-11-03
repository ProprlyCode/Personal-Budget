// What you own and net worth two ways.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const A = new Function(shims + pick('INGEST-ENGINE') + pick('SYNC-ENGINE') + pick('ASSET-ENGINE') + `
  ;return { cleanAsset, assetValueNow, assetEquity, netWorthTwoWays, cleanNwPoint };
`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }

// defaults by kind
{
  const home = A.cleanAsset({ id: 'h', kind: 'home', value: 420000, valueDate: '2026-11-01' });
  const car = A.cleanAsset({ id: 'c', kind: 'vehicle', value: 30000, valueDate: '2026-11-01' });
  ok(home.sellCostPct === 7 && home.depreciation === 0 && home.name === 'Home', 'home: 7% selling costs, no depreciation');
  ok(car.depreciation === 15 && car.sellCostPct === 0, 'vehicle: loses 15%/yr by default');
  ok(!('debtId' in car) && JSON.stringify(car) === JSON.stringify(JSON.parse(JSON.stringify(car))), 'no undefined values (Firebase-safe)');
  const odd = A.cleanAsset({ id: 'x', kind: 'yacht', value: -5, depreciation: 500, sellCostPct: 99 });
  ok(odd.kind === 'other' && odd.value === 0 && odd.depreciation === 60 && odd.sellCostPct === 20, 'bad input is clamped');
}
// depreciation
{
  const car = A.cleanAsset({ id: 'c', kind: 'vehicle', value: 30000, valueDate: '2026-01-01' });
  ok(A.assetValueNow(car, '2026-01-01') === 30000, 'no time passed: typed value');
  const oneYear = A.assetValueNow(car, '2027-01-01');
  ok(Math.abs(oneYear - 25500) < 30, 'one year at 15%: about $25,500 (got ' + oneYear + ')');
  ok(A.assetValueNow(car, '2025-01-01') === 30000, 'a date before the value date never adds value');
  const home = A.cleanAsset({ id: 'h', kind: 'home', value: 420000, valueDate: '2020-01-01' });
  ok(A.assetValueNow(home, '2026-11-01') === 420000, 'a home keeps its typed value until you update it');
}
// equity and if-sold
{
  const home = A.cleanAsset({ id: 'h', kind: 'home', value: 420000, valueDate: '2026-11-01', debtId: 'm' });
  const e = A.assetEquity(home, '2026-11-01', 310000);
  ok(e.equity === 110000, 'equity = 420k - 310k mortgage');
  ok(e.sellCost === 29400 && e.ifSold === 80600, 'if sold: 7% selling costs (29,400) come off: 80,600');
  const under = A.assetEquity(home, '2026-11-01', 450000);
  ok(under.equity === -30000, 'underwater: negative equity');
}
// net worth two ways
{
  const nw = A.netWorthTwoWays({ cash: 4000, investments: 60000, savings: 9000, cards: 1800, otherDebts: 3000,
    assets: [{ value: 420000, owed: 310000 }, { value: 25000, owed: 0 }] });
  ok(nw.netWorth === 4000 + 60000 + 9000 + 420000 + 25000 - 310000 - 1800 - 3000, 'net worth counts everything');
  ok(nw.liquid === 4000 + 60000 + 9000 - 1800 - 3000, 'liquid leaves out the home, car and mortgage');
  ok(nw.assetEquity === 135000, 'asset equity total');
  const empty = A.netWorthTwoWays({});
  ok(empty.netWorth === 0 && empty.liquid === 0, 'nothing entered: zero, not NaN');
}
ok(A.cleanNwPoint({ id: '2026-11', netWorth: '5', liquid: null }).netWorth === 5, 'history points are cleaned');
console.log(`\nASSET TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
