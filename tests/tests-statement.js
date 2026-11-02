// Statement import: a synthetic "Your Account Summary" laid out the way PDF.js
// reads Lincoln Financial's PDF (made-up member, plan and numbers).
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const m = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!m){ console.error(n + ' not found'); process.exit(1); } return m[0]; };
const E = new Function('function round2(n){ return Math.round((Number(n)||0)*100)/100; }' + pick('FUND-ENGINE') + pick('STATEMENT-ENGINE') +
  ';return { abbrevScore, bestAbbrevMatch, pdfItemsToLines, parseAccountSummary, parseMoney, deriveElections, payFrequency, statementFundClass, matchStatementFunds, fundMix, isIndexFund };')();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }

// --- line grouping from positioned PDF text items ---
{
  const items = [
    { page: 1, x: 300, y: 700, s: 'Your Account Summary' },
    { page: 1, x: 40, y: 600, s: 'Hartfrd Dvdnd And Grwth' }, { page: 1, x: 200, y: 601, s: '.' }, { page: 1, x: 210, y: 601, s: '..' }, { page: 1, x: 400, y: 599, s: '12.06%' },
    { page: 1, x: 40, y: 580, s: 'Beginning Balance' }, { page: 1, x: 250, y: 580, s: '$1,000.00' },
    { page: 2, x: 40, y: 700, s: 'Second page' }, { page: 1, x: 40, y: 560, s: '  ' }
  ];
  const lines = E.pdfItemsToLines(items);
  ok(lines.length === 4, 'rows grouped by vertical position, blanks dropped (got ' + lines.length + ')');
  ok(lines[1].cells.join('|') === 'Hartfrd Dvdnd And Grwth|12.06%', 'dot leaders dropped, cells in reading order');
  ok(lines[0].cells[0] === 'Your Account Summary' && lines[3].page === 2, 'top to bottom, page by page');
}

// --- money parsing ---
ok(E.parseMoney('$4,891.88') === 4891.88 && E.parseMoney('-$444.48') === -444.48 && E.parseMoney('($12.50)') === -12.5, 'money: commas, minus, parentheses');
ok(E.parseMoney('Employee') === null && E.parseMoney('116.863') === 116.863 && E.parseMoney('2050') === null, 'labels and bare integers are not money');

// --- a synthetic statement in the layout PDF.js produces ---
const H = p => [['TAYLOR SAMPLE'], ['1 MAIN ST'], ['Your Account Summary'], ['ANYTOWN, STATE'], ['01/05/2026 - 02/04/2026', '00000-0000'], ['Plan: EXAMPLE CO EMPLOYEES'], ['Page', String(p), 'of', '3', 'SAVINGS PLAN'], ['Plan ID: EXMP-001']];
const rows = [
  ...H(1),
  ['Activity', 'Asset Allocation By Investment'],
  ['Beginning Balance', '$10,000.00'], ['Contributions', '$600.00'], ['Sample Index Fund', '50.00%'], ['Employee', '$400.00'],
  ['Employer', '$200.00'], ['Distributions', '$0.00'], ['Fees & Expenses*', '-$5.00'], ['Other', '$10.00'], ['Other', '12.00%'],
  ['Gain/Loss', '-$105.00'], ['Ending Balance', '$10,500.00'], ['Net Change', '$500.00'], ['Personal Rate of Return', '-1.00%'],
  ['Holdings By Contribution Type'], ['Contribution Type', 'Source', 'Contributions', 'Balance'],
  ['Employee Salary Deferral', 'Employee', '$200.00', '$4,000.00'], ['Employer Match', 'Employer', '$200.00', '$3,500.00'], ['Roth', 'Employee', '$200.00', '$3,000.00'],
  ['Total Employee', '$400.00', '$7,000.00'], ['Total', '$600.00', '$10,500.00'],
  ...H(2),
  ['Holdings By Asset Class'], ['U.S. Equity', '60.00%'],
  ['Holdings By Investment'], ['Investment', 'Asset Class', 'Units', 'Price', 'Trade Date', 'Balance'],
  ['Smpl 500 Indx', 'U.S. Equity', '20.000', '300.000', '01/30/2026', '$6,000.00'],
  ['Smpl Midcp Grwth', 'U.S. Equity', '100.000', '15.000', '01/30/2026', '$1,500.00'],
  ['Smpl Intl Value', 'International Equity', '50.000', '40.000', '01/30/2026', '$2,000.00'],
  ['Smpl Bond Srs', 'Taxable Bond', '100.000', '10.000', '01/30/2026', '$1,000.00'],
  ['Total', '$10,500.00'],
  ['Activity By Investment'], ['Beginning', 'Fees &', 'Ending'], ['Contribution', 'Distributions', 'Exchanges', 'Other', 'Gain / Loss', 'Net Change', 'PRR**'], ['Balance', 'Expenses*', 'Balance'],
  ['Smpl 500 Indx'], ['$5,700.00', '$300.00', '$0.00', '$0.00', '$0.00', '$0.00', '$0.00', '$6,000.00', '$300.00', '0.00%'],
  ...H(3),
  ['Activity By Investment'], ['Beginning', 'Fees &', 'Ending'], ['Contribution', 'Distributions', 'Exchanges', 'Other', 'Gain / Loss', 'Net Change', 'PRR**'], ['Balance', 'Expenses*', 'Balance'],
  ['Smpl Midcp Grwth'], ['$1,500.00', '$120.00', '$0.00', '$0.00', '$0.00', '$0.00', '-$120.00', '$1,500.00', '$0.00', '-7.50%'],
  ['Smpl Intl Value'], ['$1,900.00', '$120.00', '$0.00', '$0.00', '-$5.00', '$0.00', '-$15.00', '$2,000.00', '$100.00', '-0.70%'],
  ['Smpl Bond Srs'], ['$900.00', '$60.00', '$0.00', '$0.00', '$0.00', '$10.00', '$30.00', '$1,000.00', '$100.00', '4.00%'],
  ['Total'], ['$10,000.00', '$600.00', '$0.00', '$0.00', '-$5.00', '$10.00', '-$105.00', '$10,500.00', '$500.00'],
  ['Transactions'], ['Description', 'Type', 'Trade Date', 'Processed Date', 'Amount'],
  ['Increase Ordinary Dividend Reinvest', 'Adjustment', '01/27/2026', '01/27/2026', '$10.00'],
  ['Ach Contribution', 'Contribution', '01/23/2026', '01/23/2026', '$100.00'], ['Ach Contribution', 'Contribution', '01/23/2026', '01/23/2026', '$100.00'], ['Ach Contribution', 'Contribution', '01/23/2026', '01/23/2026', '$100.00'],
  ['Ach Contribution', 'Contribution', '01/09/2026', '01/09/2026', '$100.00'], ['Ach Contribution', 'Contribution', '01/09/2026', '01/09/2026', '$100.00'], ['Ach Contribution', 'Contribution', '01/09/2026', '01/09/2026', '$100.00'],
  ['Lincoln Financial is the marketing name for Lincoln National Corporation and its affiliates.']
];
// pages as PDF.js reports them: each page starts with its repeated header
let pg = 0;
const lines = rows.map(cells => { if(cells[0] === 'TAYLOR SAMPLE') pg++; return { page: pg, cells }; });
const r = E.parseAccountSummary(lines);
ok(r.kind === 'account-summary' && r.provider === 'Lincoln Financial', 'recognized as a Lincoln account summary');
ok(r.periodStart === '2026-01-05' && r.periodEnd === '2026-02-04', 'period read');
ok(r.activity.beginning === 10000 && r.activity.contributions === 600 && r.activity.employee === 400 && r.activity.employer === 200, 'activity: balances and contributions');
ok(r.activity.fees === -5 && r.activity.other === 10 && r.activity.gainLoss === -105 && r.activity.ending === 10500, 'activity: negatives, and the legend "Other 12%" line is ignored');
ok(r.sources.length === 3 && r.sources[1].type === 'Employer Match' && r.sources[1].balance === 3500, 'contribution sources (totals rows skipped)');
ok(r.holdings.length === 4 && r.holdings[0].units === 20 && r.holdings[0].price === 300 && r.holdings[0].tradeDate === '2026-01-30', 'holdings with units, price, date');
ok(r.fundActivity.length === 4 && r.fundActivity[2].fees === -5 && r.fundActivity[3].other === 10, 'per-fund activity across a page break; Total row excluded');
ok(r.transactions.length === 7, 'transactions');
ok(r.warnings.length === 0, 'cross-checks pass (' + r.warnings.join('; ') + ')');

const el = E.deriveElections(r.fundActivity);
ok(JSON.stringify(el) === JSON.stringify({ 'Smpl 500 Indx': 50, 'Smpl Midcp Grwth': 20, 'Smpl Intl Value': 20, 'Smpl Bond Srs': 10 }), 'elections from the contribution split (' + JSON.stringify(el) + ')');
const pf = E.payFrequency(r.transactions.filter(t => /contribution/i.test(t.type)).map(t => t.tradeDate));
ok(pf.perYear === 26 && pf.paychecks === 2, 'two paydays 14 days apart → every two weeks');
ok(E.payFrequency(['2026-01-01', '2026-01-15', '2026-02-01']).perYear === 24, 'semi-monthly detected');
ok(E.payFrequency(['2026-01-02']).perYear === null, 'one payday: unknown frequency');

// --- long names that wrap onto a second line are rejoined ---
{
  const wrapped = [];
  lines.forEach(l => {
    if(l.cells.join() === 'Smpl Midcp Grwth'){ wrapped.push({ page: l.page, cells: ['Smpl Midcp'] }, { page: l.page, cells: ['Grwth'] }); return; }
    if(l.cells[0] === 'Smpl Intl Value' && l.cells.length === 6){ wrapped.push({ page: l.page, cells: ['Smpl Intl', ...l.cells.slice(1)] }, { page: l.page, cells: ['Value'] }); return; }
    wrapped.push(l);
  });
  const w = E.parseAccountSummary(wrapped);
  ok(w.fundActivity.map(f => f.name).join('|') === 'Smpl 500 Indx|Smpl Midcp Grwth|Smpl Intl Value|Smpl Bond Srs', 'wrapped activity name rejoined (' + w.fundActivity.map(f => f.name).join('|') + ')');
  ok(w.holdings[2].name === 'Smpl Intl Value' && w.holdings[3].name === 'Smpl Bond Srs' && !('sealed' in w.holdings[0]), 'wrapped holding name rejoined, next row untouched');
  ok(w.warnings.length === 0, 'still adds up');
  // the last holding on a page must not swallow the next page's header lines
  const split = [];
  wrapped.forEach(l => { split.push(l); if(l.cells[0] === 'Smpl Bond Srs' && l.cells.length === 6){ split.push(...H(9).map(cells => ({ page: 9, cells }))); } });
  const s9 = E.parseAccountSummary(split);
  ok(s9.holdings[3].name === 'Smpl Bond Srs', 'page header after the last holding is not glued onto its name (' + s9.holdings[3].name + ')');
}

// --- cross-checks catch a misread statement ---
{
  const broken = lines.map(l => l.cells[0] === 'Smpl Bond Srs' && l.cells.length === 6 ? { page: l.page, cells: ['Smpl Bond Srs', 'Taxable Bond', '100.000', '10.000', '01/30/2026', '$9,999.00'] } : l);
  ok(E.parseAccountSummary(broken).warnings.some(w => /add up/.test(w)), 'holdings that don\'t add up to the ending balance are flagged');
  ok(E.parseAccountSummary([{ page: 1, cells: ['Quarterly Statement'] }]).kind === null, 'other documents are rejected');
}

// --- classifying abbreviated fund names ---
const cls = { 'Fdlty 500 Indx': 'us-large', 'Fdlty Smcp Indx': 'us-small', 'Mfs Midcp Grwth': 'us-mid', 'Am Fds 2050 Trgt Date Rtrmt': 'target',
  'Mfs Agg Grwth Alloc': 'balanced', 'Mng Npr High Yld Bond Srs': 'bond', 'Csw Intl Value': 'intl' };
Object.keys(cls).forEach(n => ok(E.statementFundClass(n, 'U.S. Equity') === cls[n], n + ' → ' + cls[n] + ' (got ' + E.statementFundClass(n, 'U.S. Equity') + ')'));
ok(E.statementFundClass('Hartfrd Dvdnd And Grwth', 'U.S. Equity') === 'us-large', 'unknown abbreviation falls back to the statement\'s asset class');
ok(E.statementFundClass('Chn Strs Instnl', 'Sector Equity') === 'sector' && E.statementFundClass('Am Fds New Wrld', 'International Equity') === 'intl', 'sector and international fallbacks');
ok(E.isIndexFund('Fdlty Smcp Indx'), '"Indx" counts as an index fund');
ok(E.fundMix({ cls: 'balanced', name: 'Mfs Agg Grwth Alloc' }, 2026).stocks === 90 && E.fundMix({ cls: 'balanced', name: 'Mfs Grwth Alloc' }, 2026).stocks === 80, 'allocation funds: aggressive 90/10, growth 80/20');

// --- matching statement funds to the lineup ---
{
  const m = E.matchStatementFunds(r.holdings, [{ id: 'f1', name: 'Something Else', stmtName: 'Smpl 500 Indx' }, { id: 'f2', name: 'smpl midcp grwth' }]);
  ok(m[0].fundId === 'f1' && m[1].fundId === 'f2' && m[2].fundId === '', 'matched by remembered statement name, then by name; others new');
}

// --- shortened recordkeeper names vs full fund names (illustrative public funds) ---
{
  const pairs = [
    ['Vngrd Ttl Bd Mkt Indx', 'Vanguard Total Bond Market Index Admiral'],
    ['Fdlty Contrafund', 'Fidelity Contrafund K6'],
    ['T Rwe Prc Blue Chip Grwth', 'T. Rowe Price Blue Chip Growth I'],
    ['Amrcn Fds Grwth Fd Of Amrc', 'American Funds Growth Fund of America R6'],
    ['Dfa Us Smcp Value', 'DFA US Small Cap Value I'],
    ['Jpm Midcp Value', 'JPMorgan Mid-Cap Value R6'],
    ['Pimco Ttl Rtn Instl', 'PIMCO Total Return Institutional'],
    ['Vngrd Trgt Rtrmt 2045', 'Vanguard Target Retirement 2045 Trust'],
    ['Cohen Strs Rlty Shrs', 'Cohen & Steers Realty Shares'],
    ['Smpl Midcp Grwth', 'Sample Mid-Cap Growth R6']
  ];
  pairs.forEach(([s, f]) => ok(E.abbrevScore(s, f) > 0, `"${s}" matches "${f}"`));
  ok(E.abbrevScore('Vngrd Trgt Rtrmt 2045', 'Vanguard Target Retirement 2050 Trust') === 0, 'different target year never matches');
  ok(E.abbrevScore('Fdlty 500 Indx', 'Fidelity Mid Cap Index') === 0, 'missing number never matches');
  ok(E.abbrevScore('Dfa Us Smcp Value', 'DFA International Small Cap Value') === 0, 'different words don\'t match');
  // the tighter of two plausible names wins; a true tie picks nobody
  const pick = E.bestAbbrevMatch('Mfs Grwth Alloc', [{ id: 'agg', names: ['MFS Aggressive Growth Allocation R6'] }, { id: 'grw', names: ['MFS Growth Allocation R6'] }]);
  ok(pick === 'grw', 'Growth Allocation preferred over Aggressive Growth Allocation (got ' + pick + ')');
  ok(E.bestAbbrevMatch('Vngrd Indx', [{ id: 'a', names: ['Vanguard Index Admiral'] }, { id: 'b', names: ['Vanguard Index Investor'] }]) === '', 'two share classes of one fund → ambiguous, no match (you pick in the preview)');
  // statement import matches an existing full-name lineup
  const m = E.matchStatementFunds([{ name: 'Smpl Midcp Grwth' }, { name: 'Smpl Bond Srs' }], [{ id: 'f1', name: 'Sample Mid-Cap Growth R6' }, { id: 'f2', name: 'Sample Bond Series I' }]);
  ok(m[0].fundId === 'f1' && m[1].fundId === 'f2', 'statement funds matched to pasted full names');
}

console.log(`statement import: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
