const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
// normalizeInvestments validates ids with the ingest helpers (which use the sync fingerprint)
const api = new Function(shims + pick('INGEST-ENGINE') + pick('SYNC-ENGINE') + pick('INVEST-ENGINE') + `
  ;return { normalizeInvestments, invStats, invBalanceOn, invOwnerSeries };
`)();
const { normalizeInvestments, invStats, invBalanceOn, invOwnerSeries } = api;

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }

// --- normalize: Firebase drops empty arrays / undefined fields ---
{
  const n = normalizeInvestments([{ id:'a', name:'529' }, null, { name:'no id' }]);
  ok(n.length === 1, 'drops null and id-less accounts');
  ok(Array.isArray(n[0].history) && n[0].history.length === 0, 'missing history becomes []');
  ok(n[0].owner === 'Me' && n[0].targetDate === '' && n[0].monthlyContribution === 0, 'fills defaults with no undefined values');
}

// --- stats: growth = change minus contributions; history order doesn't matter ---
const acct = { id:'x', owner:'Me', history:[
  { id:'2', date:'2026-02-01', balance:1150, contributed:100 },
  { id:'1', date:'2026-01-01', balance:1000, contributed:0 },
  { id:'3', date:'2026-03-01', balance:1300, contributed:100 }
]};
{
  const st = invStats(acct);
  ok(st.balance === 1300, 'balance is the latest entry (got '+st.balance+')');
  ok(st.contributed === 200, 'contributions exclude the starting entry (got '+st.contributed+')');
  ok(st.growth === 100, 'growth = 1300 - 1000 - 200 = 100 (got '+st.growth+')');
  ok(st.change === 150 && st.prevDate === '2026-02-01', 'change vs previous entry');
  ok(invStats({ history:[] }).balance === 0, 'empty account is zero');
}

// --- balance on a date carries the last value forward ---
ok(invBalanceOn(acct, '2025-12-31') === 0, 'zero before first entry');
ok(invBalanceOn(acct, '2026-02-15') === 1150, 'carries forward between entries');

// --- per-owner series ---
{
  const accts = [
    { owner:'Me', history:[{date:'2026-01-01',balance:100},{date:'2026-03-01',balance:300}] },
    { owner:'Daughter 1', history:[{date:'2026-02-01',balance:50}] },
    { owner:'Me', history:[{date:'2026-02-01',balance:10}] }
  ];
  const s = invOwnerSeries(accts);
  ok(s.dates.join() === '2026-01-01,2026-02-01,2026-03-01', 'dates are the sorted union');
  ok(s.series[0].owner === 'Me' && s.series[0].data.join() === '100,110,310', 'Me series sums accounts with carry-forward');
  ok(s.series[1].data.join() === '0,50,50', 'Daughter 1 series starts at 0');
  ok(s.total.join() === '100,160,360', 'total line sums owners');
}

console.log(`investments engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
