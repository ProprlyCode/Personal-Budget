// Cards and bank accounts: balances, payments, defaults, merchant memory.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const A = new Function(shims + pick('INGEST-ENGINE') + pick('SYNC-ENGINE') + pick('ACCOUNT-ENGINE') + `
  ;return { cleanAccount, cardStatus, cashStatus, defaultAccountId, merchantMemory, learnedCategory };
`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }

const card = A.cleanAccount({ id: 'co', name: 'Capital One', kind: 'card', startBalance: 300, since: '2026-10-01' });
const chk = A.cleanAccount({ id: 'ck', name: 'Checking', kind: 'checking', startBalance: 5000, since: '2026-10-01' });
const T = [
  { id: 'old', date: '2026-09-28', amount: 999, type: 'expense', category: 'Groceries', acctId: 'co' },   // before tracking: ignored
  { id: 'a', date: '2026-10-03', amount: 120, type: 'expense', category: 'Groceries', acctId: 'co', description: 'Kroger #12' },
  { id: 'b', date: '2026-10-10', amount: 80, type: 'expense', category: 'Dining Out', acctId: 'co', description: 'Chipotle' },
  { id: 'r', date: '2026-10-12', amount: 20, type: 'income', category: 'Other Income', acctId: 'co', description: 'Refund' },
  { id: 'p', date: '2026-10-25', amount: 480, type: 'expense', category: 'Credit Card Payment', acctId: 'ck', link: 'card:co', description: 'CAPITAL ONE PYMT' },
  { id: 'c', date: '2026-10-27', amount: 60, type: 'expense', category: 'Groceries', acctId: 'co', description: 'KROGER #40' },
  { id: 'pay', date: '2026-10-15', amount: 3000, type: 'income', category: 'Salary/Wages', acctId: 'ck', description: 'Payroll' }
];

// --- card ---
{
  const st = A.cardStatus(card, T);
  ok(st.charges === 260 && st.refunds === 20 && st.paid === 480, 'charges, refunds and payments since tracking started');
  ok(st.balance === 60, 'balance = 300 owed + 260 charges - 20 refund - 480 paid = 60');
  ok(st.lastPayment && st.lastPayment.date === '2026-10-25' && st.lastPayment.amount === 480, 'last payment found');
  ok(st.sinceLast === 60, 'charged since the last payment');
  const none = A.cardStatus(A.cleanAccount({ id: 'x', kind: 'card', startBalance: 0, since: '2026-10-01' }), T);
  ok(none.balance === 0 && none.lastPayment === null, 'an unused card owes nothing');
}
// --- checking ---
{
  const st = A.cashStatus(chk, T);
  ok(st.inflow === 3000 && st.outflow === 480 && st.balance === 7520, 'checking = typed 5000 + 3000 in - 480 card payment');
  const sameDay = A.cashStatus(A.cleanAccount({ id: 'ck', kind: 'checking', startBalance: 100, since: '2026-10-15' }), T);
  ok(sameDay.inflow === 3000 && sameDay.balance === 2620, 'the typed balance is as of the start of its day: that day counts');
}
// --- clean / defaults ---
{
  const c = A.cleanAccount({ id: 'z', kind: 'bogus', startBalance: 'x' });
  ok(c.kind === 'card' && c.startBalance === 0 && c.name === 'Account' && !('archived' in c), 'cleanAccount fills safe defaults, no undefined keys');
  ok(JSON.stringify(c) === JSON.stringify(JSON.parse(JSON.stringify(c))), 'no undefined values');
  const accts = [card, chk, A.cleanAccount({ id: 'ch', name: 'Chase', kind: 'card' })];
  ok(A.defaultAccountId(accts, T, '2026-11-01') === 'co', 'default = the card used most lately');
  ok(A.defaultAccountId(accts.concat([A.cleanAccount({ id: 'd', kind: 'card', isDefault: true })]), T, '2026-11-01') === 'd', 'a chosen default wins');
  ok(A.defaultAccountId([], T, '2026-11-01') === '', 'no accounts, no default');
}
// --- merchant memory ---
{
  const m = A.merchantMemory(T);
  const kroger = m.find(x => x.key === 'kroger');
  ok(kroger && kroger.n === 2 && kroger.category === 'Groceries' && kroger.acctId === 'co', 'store numbers ignored: two Kroger visits remembered once');
  ok(m[0].key === 'kroger', 'most used first');
  ok(A.learnedCategory('kroger 99', T) === 'Groceries' && A.learnedCategory('nowhere', T) === '', 'category learned from your own history');
}
console.log(`\nACCOUNT TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
