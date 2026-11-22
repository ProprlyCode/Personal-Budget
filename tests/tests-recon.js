// Matching statement lines to entries typed in by hand (rounded, vague, no card).
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const R = new Function(pick('RECON-ENGINE') + `;return { matchManualEntries, unmatchedManualEntries, isManualEntry, matchRecurringEntries, paymentTwin };`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }

const typed = [
  { id: 'g', date: '2026-11-03', description: 'Groceries', amount: 50, category: 'Groceries', type: 'expense' },
  { id: 'gas', date: '2026-11-06', description: 'gas', amount: 40, category: 'Transportation', type: 'expense' },
  { id: 't', date: '2026-11-02', description: 'Target', amount: 25, category: 'Shopping', type: 'expense' },
  { id: 'imp', date: '2026-11-04', description: 'KROGER #9', amount: 50, category: 'Groceries', type: 'expense', src: 'import' },
  { id: 'rec', date: '2026-11-05', description: 'Netflix', amount: 15.49, category: 'Subscriptions', type: 'expense', recurId: 'r1' },
  { id: 'other', date: '2026-11-03', description: 'Lunch', amount: 50, category: 'Dining Out', type: 'expense', acctId: 'chase' }
];
const rows = [
  { date: '2026-11-04', description: 'KROGER #402 STEVENSVILLE MI', amount: 49.87, type: 'expense', category: 'Groceries' },
  { date: '2026-11-06', description: 'AMOCO#3208900 SAINT JOSEPH MI', amount: 40.21, type: 'expense', category: 'Transportation' },
  { date: '2026-11-10', description: 'COSTCO WHSE', amount: 132.10, type: 'expense', category: 'Groceries' },
  { date: '2026-11-08', description: 'PAYMENT THANK YOU', amount: 40, type: 'income', payment: true },
  { date: '2026-11-05', description: 'NETFLIX.COM', amount: 15.49, type: 'expense', dup: true }
];
const m = R.matchManualEntries(rows, typed, 'co');
ok(m[0] && m[0].id === 'g' && m[0].clear, '$49.87 Kroger on the 4th matches "Groceries $50" on the 3rd');
ok(m[1] && m[1].id === 'gas', '$40.21 Amoco matches "gas $40"');
ok(m[2] === null, 'nothing typed near $132: no match');
ok(m[3] === null && m[4] === null, 'payments and lines already marked duplicate are left alone');
ok(!m.some(x => x && (x.id === 'imp' || x.id === 'rec')), 'imported and recurring entries are never matched');
ok(!m.some(x => x && x.id === 'other'), 'an entry on a different card is not matched');

// two similar lines, one entry: closest wins, and it's not "clear"
{
  const r2 = [
    { date: '2026-11-03', description: 'SHELL', amount: 40.50, type: 'expense', category: 'Transportation' },
    { date: '2026-11-07', description: 'AMOCO', amount: 39.90, type: 'expense', category: 'Transportation' }
  ];
  const e = [{ id: 'gas', date: '2026-11-06', description: 'gas', amount: 40, category: 'Transportation', type: 'expense' }];
  const mm = R.matchManualEntries(r2, e, '');
  ok(mm[1] && mm[1].id === 'gas' && mm[0] === null, 'the closer line (a day away) gets the entry; each entry used once');
  ok(mm[1].clear === false, 'a close rival makes it a "possible" match');
}
// category and description break ties
{
  const r3 = [{ date: '2026-11-05', description: 'TARGET T-1445', amount: 30, type: 'expense', category: 'Shopping' }];
  const e = [{ id: 'food', date: '2026-11-05', description: 'stuff', amount: 30, category: 'Groceries', type: 'expense' },
             { id: 'tgt', date: '2026-11-05', description: 'Target run', amount: 30, category: 'Shopping', type: 'expense' }];
  ok(R.matchManualEntries(r3, e, '')[0].id === 'tgt', 'same category and a shared word win');
}
ok(R.matchManualEntries([{ date: '2026-11-04', description: 'X', amount: 51.5, type: 'expense' }], typed, '')[0] === null, 'more than $1 off: no match');
ok(R.matchManualEntries([{ date: '2026-11-08', description: 'X', amount: 50, type: 'expense' }], [typed[0]], '')[0] === null, 'more than 3 days apart: no match');

// --- entries the statements don't show ---
{
  const cards = [{ id: 'co', coveredFrom: '2026-10-14', coveredThrough: '2026-11-13' }, { id: 'chase', coveredFrom: '2026-10-06', coveredThrough: '2026-11-05' }];
  const list = R.unmatchedManualEntries([
    { id: 'a', date: '2026-11-02', description: 'Target', amount: 25, type: 'expense' },                     // no card, covered by both
    { id: 'b', date: '2026-11-09', description: 'gas', amount: 40, type: 'expense' },                        // Chase not covered yet -> wait
    { id: 'c', date: '2026-11-09', description: 'gas', amount: 40, type: 'expense', acctId: 'co' },          // on Capital One, covered
    { id: 'd', date: '2026-11-02', description: 'x', amount: 5, type: 'expense', kept: true },               // kept
    { id: 'e', date: '2026-11-02', description: 'x', amount: 5, type: 'expense', src: 'import' },            // imported
    { id: 'f', date: '2026-10-01', description: 'old', amount: 5, type: 'expense' }                          // before imports
  ], cards);
  ok(list.map(t => t.id).join() === 'a,c', 'flags only entries every relevant statement covers and nothing matched');
  ok(R.unmatchedManualEntries([{ id: 'a', date: '2026-11-02', amount: 1, type: 'expense' }], [{ id: 'co', coveredThrough: '2026-11-13' }]).length === 0, 'no coverage start yet: flags nothing');
}
// --- recurring entries at a different amount ---
{
  const rules = [{ id: 'nf', description: 'Netflix' }, { id: 'el', description: 'Electric bill' }];
  const tx = [
    { id: 'r-nf', recurId: 'nf', date: '2026-11-03', description: 'Netflix', amount: 15.49, type: 'expense' },
    { id: 'r-el', recurId: 'el', date: '2026-11-20', description: 'Electric bill', amount: 120, type: 'expense' }
  ];
  const lines = [
    { date: '2026-11-03', description: 'NETFLIX.COM 866-579', amount: 17.99, type: 'expense' },
    { date: '2026-11-21', description: 'CONSUMERS ENERGY ELECTRIC PMT', amount: 127.40, type: 'expense' },
    { date: '2026-11-04', description: 'HULU 877-8244858', amount: 17.99, type: 'expense' },
    { date: '2026-11-20', description: 'ELECTRIC CO', amount: 300, type: 'expense' }
  ];
  const m = R.matchRecurringEntries(lines, tx, rules);
  ok(m[0] && m[0].id === 'r-nf' && m[0].recurring, 'Netflix at the new price matches its recurring entry');
  ok(m[1] && m[1].id === 'r-el', 'the electric bill at $127.40 matches the $120 estimate');
  ok(m[2] === null, 'a different merchant at the same price does not match');
  ok(m[3] === null, 'way off the estimate (more than 30%): no match');
}
// --- statement payment already added by hand ---
{
  const tx = [{ id: 'p', date: '2026-11-08', description: 'Card payment', amount: 923.6, type: 'expense', category: 'Credit Card Payment', link: 'card:co' }];
  ok(R.paymentTwin({ payment: true, date: '2026-11-09', amount: 923.60 }, tx, 'co'), 'payment added by hand is found');
  ok(!R.paymentTwin({ payment: true, date: '2026-11-09', amount: 923.60 }, tx, 'chase'), 'a payment to another card is not it');
  ok(!R.paymentTwin({ payment: true, date: '2026-11-20', amount: 923.60 }, tx, 'co'), 'too far apart: not it');
}
console.log(`\nRECON TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
