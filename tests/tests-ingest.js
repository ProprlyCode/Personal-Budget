const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const m = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!m){ console.error(n + ' not found'); process.exit(1); } return m[0]; };
const E = new Function(pick('INGEST-ENGINE') + pick('SYNC-ENGINE') + `;return { safeKey, safeId, cleanTransaction, cleanCategory, cleanBudget, cleanHistory, cleanDebt, cleanGoal, cleanList };`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }
const XSS = '"><img src=x onerror=alert(1)>';

{
  const t = E.cleanTransaction({ id: XSS, date: '2026-10-05', amount: '12.5', type: 'income', category: '__proto__', description: XSS, extra: 'kept' });
  ok(/^x[a-z0-9]+$/.test(t.id), 'a crafted id is replaced (got ' + t.id + ')');
  ok(t.id === E.cleanTransaction({ id: XSS, date: '2026-10-05', amount: '12.5', type: 'income', category: '__proto__', description: XSS, extra: 'kept' }).id, 'the replacement id is the same on every device');
  ok(t.amount === 12.5 && t.type === 'income' && t.category === '___proto__', 'amount numeric, reserved category name renamed');
  ok(t.description === XSS && t.extra === 'kept', 'text stays text (escaped at render); unknown fields kept');
  ok(E.cleanTransaction({ id: 'lq3k2a9xk1', date: 'bad', amount: 'NaN', type: 'weird' }).date === '' , 'bad dates dropped');
  ok(E.cleanTransaction({ id: 'lq3k2a9xk1', amount: 1 }).id === 'lq3k2a9xk1', 'normal ids untouched');
}
ok(E.cleanCategory({ name: 'Food', color: 'red;background:url(javascript:x)' }).color === '#8a8f99', 'non-hex colors replaced');
ok(E.cleanCategory({ name: 'Food', color: '#3b6ea5' }).color === '#3b6ea5', 'hex colors kept');
{
  const b = E.cleanBudget({ month: '2026-11', expectedIncome: '5000', categories: { Housing: '1200', __proto__: 5, constructor: 9 } });
  ok(b.expectedIncome === 5000 && b.categories.Housing === 1200, 'budget amounts numeric');
  ok(Object.getPrototypeOf(b.categories) === Object.prototype && !('polluted' in {}), 'no prototype change');
  ok(b.categories._constructor === 9, 'reserved keys renamed, not dropped');
}
{
  const h = E.cleanHistory({ '2026-09': { expectedIncome: 1, categories: { A: 2 } }, '__proto__': { x: 1 }, 'not-a-month': {} });
  ok(Object.keys(h).join() === '2026-09', 'history keeps only YYYY-MM keys');
}
{
  const d = E.cleanDebt({ id: 'd1', name: 'Loans', balance: '100', subLoans: [{ id: XSS, balance: '5', apr: '4' }], strategy: { type: 'custom', customSplit: { a: '60', __proto__: 1 } } });
  ok(/^x/.test(d.subLoans[0].id) && d.subLoans[0].balance === 5, 'sub-loans cleaned');
  ok(d.strategy.customSplit.a === 60 && d.strategy.type === 'custom', 'strategy split numeric');
}
ok(E.cleanList([null, 5, { id: 'g1', targetAmount: '9' }], E.cleanGoal).length === 1, 'non-objects dropped from lists');

console.log(`ingest engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
