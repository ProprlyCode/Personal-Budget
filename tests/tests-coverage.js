// How up to date each card is; when a month is final.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const C = new Function(pick('COVER-ENGINE') + `;return { statementPeriod, nextCloseDate, coverageStatus, monthFinalDate, recordCoverage };`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- billing cycle on the statement ---
ok(eq(C.statementPeriod('Due Date Dec 08, 2026 ... Oct 14, 2026 - Nov 13, 2026 | 31 days in Billing Cycle'), { start: '2026-10-14', end: '2026-11-13' }), 'Capital One cycle (a lone due date is ignored)');
ok(eq(C.statementPeriod('Opening/Closing Date 10/06/26 - 11/05/26'), { start: '2026-10-06', end: '2026-11-05' }), 'Chase cycle');
ok(eq(C.statementPeriod('Dec 14, 2026 - Jan 13, 2027'), { start: '2026-12-14', end: '2027-01-13' }), 'cycle across the new year');
ok(C.statementPeriod('Year to date Jan 01, 2026 - Nov 13, 2026') === null, 'a long range is not a billing cycle');
ok(C.statementPeriod('nothing here') === null, 'no cycle: null');

// --- next closing date ---
ok(C.nextCloseDate(14, '2026-11-13') === '2026-11-14', 'closes on the 14th');
ok(C.nextCloseDate(14, '2026-11-14') === '2026-12-14', 'strictly after');
ok(C.nextCloseDate(31, '2026-11-01') === '2026-11-30', 'day 31 in a 30-day month');
ok(C.nextCloseDate(0, '2026-11-01') === '', 'unknown closing day');

// --- status ---
{
  const co = { coveredThrough: '2026-11-13', lastImport: '2026-11-14', closeDay: 13 };
  const s = C.coverageStatus(co, '2026-11-22');
  ok(s.behind === 9 && s.sinceImport === 8 && s.screenshotDue === true, '9 days not covered; 8 days since import -> screenshot due');
  ok(s.nextClose === '2026-12-13' && s.statementReady === false, 'next statement Dec 13, not ready yet');
  ok(C.coverageStatus(co, '2026-12-14').statementReady === true, 'statement ready the day after it closes');
  ok(C.coverageStatus(Object.assign({}, co, { lastImport: '2026-11-20' }), '2026-11-22').screenshotDue === false, 'imported 2 days ago: not due');
  ok(C.coverageStatus({}, '2026-11-22').screenshotDue === true && C.coverageStatus({}, '2026-11-22').behind === null, 'never imported: due, coverage unknown');
}
// --- month final ---
{
  const cards = [{ coveredThrough: '2026-11-13', closeDay: 13 }, { coveredThrough: '2026-11-05', closeDay: 5 }];
  ok(C.monthFinalDate('2026-10', cards) === '', 'October: both cards past Oct 31 -> final');
  ok(C.monthFinalDate('2026-11', cards) === '2026-12-14', 'November: final after the later statement (Dec 13 close -> Dec 14)');
  ok(C.monthFinalDate('2026-11', [{ coveredThrough: '2026-11-13', closeDay: 0 }]) === null, 'unknown closing day: null');
  ok(C.monthFinalDate('2026-11', [{ closeDay: 13 }]) === '', 'a card never imported doesn\'t hold a month open');
}
// --- recording an import ---
{
  const a = { closeDay: 0 };
  C.recordCoverage(a, { period: { start: '2026-10-14', end: '2026-11-13' }, rowDates: ['2026-11-10'] }, '2026-11-15');
  ok(a.coveredThrough === '2026-11-13' && a.closeDay === 13 && a.lastImport === '2026-11-15', 'statement: covered to its closing date, closing day learned');
  C.recordCoverage(a, { screenshot: true, rowDates: ['2026-11-19'] }, '2026-11-22');
  ok(a.coveredThrough === '2026-11-22', 'screenshot: covered to today');
  C.recordCoverage(a, { period: { start: '2026-09-14', end: '2026-10-13' } }, '2026-11-23');
  ok(a.coveredThrough === '2026-11-22' && a.lastImport === '2026-11-23', 'an older statement never moves coverage back');
  const b = {};
  C.recordCoverage(b, { rowDates: ['2026-11-02', '2026-11-09'] }, '2026-11-22');
  ok(b.coveredThrough === '2026-11-09', 'pasted rows without a cycle: covered to the latest row');
}
console.log(`\nCOVERAGE TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
