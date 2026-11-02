const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\* ===FUND-ENGINE-START===[\s\S]*?===FUND-ENGINE-END=== \*\//);
if(!m){ console.error('engine block not found'); process.exit(1); }
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const E = new Function(shims + m[0] + `
  ;return { guessFundClass, isIndexFund, targetDateMix, costGrade, fundExcess, evaluateFund, bestByClass, roundTo100,
            suggestElections, portfolioStats, feeDrag, parseFundTable, rowsToFunds };
`)();

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }

// --- classification ---
const cls = {
  'LVIP SSGA S&P 500 Index Fund': 'us-large', 'American Funds Growth Fund of America R6': 'us-large',
  'T. Rowe Price Equity Income': 'us-large', 'Vanguard Mid-Cap Index Admiral': 'us-mid',
  'DFA US Small Cap Value': 'us-small', 'Fidelity International Index': 'intl',
  'American Funds EuroPacific Growth R6': 'intl', 'Vanguard Emerging Markets Stock Index': 'em',
  'PIMCO Total Return Instl': 'bond', 'Metropolitan West Total Return Bond': 'bond',
  'Lincoln Stable Value Account': 'cash', 'Vanguard Target Retirement 2050': 'target',
  'LVIP Global Moderate Allocation': 'balanced', 'Cohen & Steers Real Estate': 'reit',
  'Fidelity Select Technology': 'sector'
};
Object.keys(cls).forEach(n => ok(E.guessFundClass(n) === cls[n], `${n} → ${cls[n]} (got ${E.guessFundClass(n)})`));
ok(E.isIndexFund('LVIP SSGA S&P 500 Index Fund') && !E.isIndexFund('American Funds Growth Fund of America'), 'index detection');

// --- target-date mix ---
ok(E.targetDateMix('Target 2060', 2026).stocks === 90, '34 years out → 90% stocks');
ok(E.targetDateMix('Target 2030', 2026).stocks === 56, '4 years out → ~56% stocks');

// --- evaluation and shrinkage ---
{
  const active = { name: 'Active Large Growth', cls: 'us-large', er: 0.85, ret5: 12.0, b5: 10.0 };
  const e = E.evaluateFund(active);
  // w = 1/(1 + 16/5) = 0.238; expected = -0.85 + 0.238*(2.0+0.85) = -0.171
  ok(Math.abs(e.weight - 0.24) < 0.01, 'active fund, 5 yrs: past excess counts ~24% (got ' + e.weight + ')');
  ok(Math.abs(e.expected - (-0.17)) < 0.02, 'shrunk expected excess ≈ -0.17%/yr (got ' + e.expected + ')');
  ok(Math.abs(e.t - 1.12) < 0.02 && /within normal luck/.test(e.reasons.join()), '+2%/yr over 5 yrs is t≈1.1, not significant');
  ok(e.grade === 'very high' && e.verdict === 'avoid', '0.85% on a large-cap fund is very high cost');
  const idx = E.evaluateFund({ name: 'S&P 500 Index', cls: 'us-large', er: 0.02, ret10: 12.95, b10: 12.98 });
  ok(idx.weight >= 0.9 && Math.abs(idx.expected - (-0.03)) < 0.01, 'index fund keeps most of its (tiny) track record');
  ok(idx.expected > e.expected, 'cheap index beats a pricier fund that "won" the last 5 years');
  const loser = E.evaluateFund({ name: 'Bad Bond', cls: 'bond', er: 0.45, ret10: 0.5, b10: 2.0 });
  ok(loser.t <= -2 && loser.verdict === 'avoid', 'trailing by 1.5%/yr for 10 yrs with TE 2% is significant → avoid');
  ok(E.evaluateFund({ name: 'X', cls: 'us-large', er: null }).reasons[0].indexOf('not entered') !== -1, 'missing cost is called out');
}

// --- rounding ---
{
  const r = E.roundTo100({ a: 1, b: 1, c: 1 });
  ok(r.a + r.b + r.c === 100, 'thirds round to 100 (got ' + JSON.stringify(r) + ')');
}

// --- suggested elections ---
const lineup = [
  { id:'sp', name:'S&P 500 Index', cls:'us-large', er:0.02, ret10:12.9, b10:12.98 },
  { id:'gr', name:'Growth Fund of America', cls:'us-large', er:0.30, ret10:13.5, b10:13.0 },
  { id:'mid', name:'Mid Cap Index', cls:'us-mid', er:0.04 },
  { id:'sm', name:'Small Cap Value Active', cls:'us-small', er:0.95 },
  { id:'intl', name:'International Index', cls:'intl', er:0.06 },
  { id:'bd', name:'Total Bond Index', cls:'bond', er:0.04 },
  { id:'sv', name:'Stable Value', cls:'cash', er:0.40 },
  { id:'td', name:'Target 2055', cls:'target', er:0.12 },
  { id:'tech', name:'Select Technology', cls:'sector', er:0.70 }
];
{
  const s = E.suggestElections(lineup, { stocks: 90, bonds: 10, cash: 0 });
  const total = Object.values(s).reduce((a,b) => a + b, 0);
  ok(total === 100, 'elections sum to 100% (got ' + total + ')');
  ok(s.sp > 0 && !s.gr, 'picks the cheap S&P fund over an active fund whose edge is within luck');
  const star = lineup.map(f => f.id === 'gr' ? Object.assign({}, f, { er: 0.30, ret10: 16.0, b10: 13.0 }) : f);
  ok(E.suggestElections(star, { stocks: 90, bonds: 10, cash: 0 }).gr > 0, 'an active fund with a large, long record (+3%/yr, 10 yrs) can still win');
  ok(s.intl === 27 && s.bd === 10, '30% of stocks abroad (27%), 10% bonds');
  ok(!s.td && !s.tech, 'never mixes in target-date or sector funds');
  ok(s.mid > 0 && !s.sm, 'small/mid share goes to the mid-cap index, not the 0.95% small-cap fund rated "avoid"');
  const st = E.portfolioStats(lineup, s, 2026);
  ok(Math.abs(st.mix.stocks - 90) < 0.6 && Math.abs(st.mix.bonds - 10) < 0.6, 'suggested portfolio hits the target mix');
  const noBond = E.suggestElections(lineup.filter(f => f.cls !== 'bond'), { stocks: 80, bonds: 20, cash: 0 });
  ok(noBond.sv === 20, 'no bond fund → bond share goes to stable value');
}

// --- portfolio stats and flags ---
{
  const cur = { gr: 50, tech: 20, td: 30 };
  const st = E.portfolioStats(lineup, cur, 2026);
  ok(Math.abs(st.er - (0.5*0.30 + 0.2*0.70 + 0.3*0.12)) < 0.006, 'weighted expense ratio');
  ok(st.flags.length === 2, 'flags sector concentration and a mixed target-date fund (got ' + st.flags.length + ')');
}

// --- fee drag ---
{
  const d = E.feeDrag(50000, 700, 20, 7, 0.75, 0.05);
  ok(d > 30000 && d < 60000, '0.70%/yr extra cost on $50k + $700/mo over 20 yrs costs tens of thousands (got ' + d + ')');
  ok(E.feeDrag(1000, 0, 10, 7, 0.5, 0.5) === 0, 'equal costs → no drag');
}

// --- paste parser ---
{
  const text = [
    'Investment Name  Ticker  1 Yr  3 Yr  5 Yr  10 Yr  Since Inception  Gross Expense Ratio  Net Expense Ratio',
    'Large Cap',
    'Sample 500 Index Fund SMPLX 24.10 9.80 14.20 12.90 10.10 0.05 0.04',
    'Benchmark: S&P 500 Index 24.20 9.90 14.30 13.00 N/A N/A N/A',
    'Sample Growth Fund R6',
    '28.50 8.10 15.00 13.40 11.00 0.33 0.30',
    'Russell 1000 Growth 30.10 10.20 16.90 15.10 -- -- --',
    'Sample Total Bond Index 1.60 (2.40) 0.30 1.40 3.20 0.05 0.05',
    'Sample Target 2055 Fund 18.20 6.10 9.90 8.70 7.00 0.15 0.12'
  ].join('\n');
  const p = E.parseFundTable(text);
  ok(p.headerFound, 'finds the header line');
  ok(p.mapping.join() === 'ret1,ret3,ret5,ret10,skip,skip,er', 'maps columns, net expense wins over gross (got ' + p.mapping.join() + ')');
  ok(p.rows.length === 6, 'six data rows incl. benchmarks, category heading skipped (got ' + p.rows.length + ')');
  const funds = E.rowsToFunds(p.rows, p.mapping, (() => { let i = 0; return () => 'f' + (++i); })());
  ok(funds.length === 4, 'four funds (benchmarks attach to the fund above)');
  ok(funds[0].ticker === 'SMPLX' && funds[0].name === 'Sample 500 Index Fund', 'ticker extracted from the name');
  ok(funds[0].er === 0.04 && funds[0].ret10 === 12.9 && funds[0].b10 === 13 && funds[0].b5 === 14.3, 'fund + benchmark values');
  ok(funds[1].name === 'Sample Growth Fund R6' && funds[1].ret5 === 15 && funds[1].b5 === 16.9, 'name/numbers split across two lines');
  ok(funds[2].ret3 === -2.4 && funds[2].cls === 'bond', '(2.40) is negative; bond class guessed');
  ok(funds[3].name === 'Sample Target 2055 Fund' && funds[3].cls === 'target', '"2055" stays in the name');
  const mid = E.parseFundTable('Benchmark: S&P MidCap 400 13.40 5.00 9.90 9.50\nRussell 2000 Value 10.90 2.70 9.30 7.60');
  ok(mid.rows[0].nums.length === 4 && /400$/.test(mid.rows[0].name) && /2000 Value$/.test(mid.rows[1].name), 'index numbers (400, 2000) stay in the name');
  const bare = E.parseFundTable('Fund A 10.0 8.0 9.0 7.5 0.45\nFund B 5 4 3 2 0.9');
  ok(bare.mapping.join() === 'ret1,ret3,ret5,ret10,er', 'no header: guesses returns then trailing expense ratio');
}

console.log(`fund engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
