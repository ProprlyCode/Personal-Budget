// Linking transactions to goals, investment accounts and debts.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const L = new Function(shims + pick('LINK-ENGINE') + `
  ;return { parseLink, txnKind, flowTotals, desiredLinks, reconcileLinks, manualTwin, linkNeedsAsk, suggestLink, findLinkTarget };
`)();

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
const clone = o => JSON.parse(JSON.stringify(o));
const noUndef = o => JSON.stringify(o) === JSON.stringify(clone(o)) && !/undefined/.test(JSON.stringify(o, (k, v) => v === undefined ? 'undefined' : v));

function world(){
  return {
    txns: [
      { id: 'a', date: '2026-10-06', description: 'ALLY TRANSFER 1234', amount: 500, category: 'Savings/Investments', type: 'expense', link: 'inv:roth' },
      { id: 'b', date: '2026-10-07', description: 'To savings', amount: 200, category: 'Savings/Investments', type: 'expense', link: 'goal:ef' },
      { id: 'c', date: '2026-10-08', description: 'VISA PAYMENT', amount: 300, category: 'Debt Payments', type: 'expense', link: 'debt:visa' },
      { id: 'd', date: '2026-10-09', description: 'NAVIENT', amount: 250, category: 'Debt Payments', type: 'expense', link: 'debt:sl:g1' },
      { id: 'e', date: '2026-10-10', description: 'Groceries', amount: 90, category: 'Groceries', type: 'expense', link: 'goal:ef' }  // wrong category: ignored
    ],
    goals: [{ id: 'ef', name: 'Emergency fund', targetAmount: 10000, currentAmount: 1000, since: '2026-10-01' }],
    invs: [{ id: 'roth', name: 'Roth IRA', history: [{ id: 'h1', date: '2026-10-01', balance: 1000, contributed: 0 }] }],
    debts: [
      { id: 'visa', name: 'Visa', balance: 1000, apr: 20, minPayment: 40, payments: [], since: '2026-10-01' },
      { id: 'sl', name: 'Student loans', balance: 0, apr: 5, minPayment: 0, since: '2026-10-01',
        subLoans: [{ id: 'g1', name: 'Group A', balance: 5000, apr: 5, minPayment: 50 }, { id: 'g2', name: 'Group B', balance: 3000, apr: 6, minPayment: 40 }] }
    ]
  };
}

// --- parse / kind / totals ---
ok(L.parseLink('debt:sl:g1').sub === 'g1' && L.parseLink('inv:x').kind === 'inv' && L.parseLink('bogus') === null, 'parseLink');
{
  const ct = n => n === 'Credit Card Payment' ? 'transfer' : 'expense';
  const T = [
    { amount: 6000, type: 'income' },
    { amount: 100, type: 'expense', category: 'Groceries' },
    { amount: 600, type: 'expense', category: 'Savings/Investments' },
    { amount: 500, type: 'expense', category: 'Savings/Investments', link: 'inv:roth' },
    { amount: 300, type: 'expense', category: 'Debt Payments' },
    { amount: 2000, type: 'expense', category: 'Credit Card Payment' }
  ];
  const f = L.flowTotals(T, ct);
  ok(f.income === 6000 && f.spent === 100 && f.saved === 600 && f.invested === 500 && f.toDebt === 300 && f.moved === 2000, 'flowTotals splits income/spent/saved/invested/debt/moved');
  ok(f.net === 5600, 'net = income - spent - debt (saving is not spending)');
  ok(L.txnKind({ type: 'expense', category: 'Credit Card Payment' }, ct) === 'transfer', 'card payment is a transfer');
}

// --- reconcile: first pass applies every valid link ---
{
  const w = world();
  const ch = L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(ch.goals && ch.debts && ch.investments, 'reports every changed section');
  ok(w.goals[0].currentAmount === 1200, 'goal saved amount +200');
  ok(w.goals[0].contribs.length === 1 && w.goals[0].contribs[0].txnId === 'b', 'goal gets one entry (wrong-category link ignored)');
  ok(w.invs[0].contribs.length === 1 && w.invs[0].contribs[0].amount === 500, 'account gets a contribution entry');
  ok(w.debts[0].balance === 700 && w.debts[0].payments[0].applied === 300, 'debt balance -300 and payment logged');
  ok(w.debts[1].subLoans[0].balance === 4750 && w.debts[1].subLoans[1].balance === 3000, 'grouped debt: only the linked group goes down');
  ok(w.debts[1].payments[0].subLoanId === 'g1', 'group payment remembers its group');
  ok(noUndef(w), 'no undefined values (Firebase-safe)');

  // idempotent
  const snap = JSON.stringify(w);
  const ch2 = L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(!ch2.goals && !ch2.debts && !ch2.investments && JSON.stringify(w) === snap, 'second run changes nothing');

  // unlink reverses
  w.txns.find(t => t.id === 'c').link = '';
  w.txns.find(t => t.id === 'b').link = '';
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].balance === 1000 && w.debts[0].payments.length === 0, 'unlinking the debt payment restores the balance');
  ok(w.goals[0].currentAmount === 1000 && w.goals[0].contribs.length === 0, 'unlinking the goal deposit takes it back out');

  // deleting the transaction reverses too
  w.txns = w.txns.filter(t => t.id !== 'a');
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.invs[0].contribs.length === 0, 'deleted transaction drops its contribution');

  // moving a link from one target to another
  w.txns.find(t => t.id === 'd').link = 'debt:sl:g2';
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[1].subLoans[0].balance === 5000 && w.debts[1].subLoans[1].balance === 2750, 'relinking moves the payment between groups');
}

// --- amount edits and overpayment floor ---
{
  const w = world();
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  w.txns.find(t => t.id === 'c').amount = 1500;   // pays off more than the balance
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].balance === 0 && w.debts[0].payments[0].applied === 1000 && w.debts[0].payments[0].amount === 1500, 'balance stops at 0; applied remembers the real drop');
  w.txns.find(t => t.id === 'c').link = '';
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].balance === 1000, 'undoing an overpayment restores exactly what was applied');
  w.txns.find(t => t.id === 'b').amount = 250;
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.goals[0].currentAmount === 1250, 'edited deposit amount adjusts the goal');
}

// --- counted-once: manual twins and placeholders ---
{
  const w = world();
  w.debts[0].payments = [{ id: 'm1', date: '2026-10-07', amount: 300 }];   // logged by hand already (balance already 1000 after it)
  const tgt = L.findLinkTarget('debt:visa', w.goals, w.debts, w.invs);
  const twin = L.manualTwin(w.txns[2], tgt);
  ok(twin && twin.id === 'm1', 'finds the hand-logged twin');
  twin.txnId = 'c'; twin.manual = true;          // user: count once
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].balance === 1000 && w.debts[0].payments.length === 1, 'claimed twin: no second payment, balance unchanged');
  w.txns[2].link = '';
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].payments.length === 1 && !w.debts[0].payments[0].txnId && w.debts[0].balance === 1000, 'unlinking keeps the hand-logged payment');

  // placeholder ("already included") is dropped on unlink with no balance change
  const w2 = world();
  w2.goals[0].contribs = [{ id: 't-b', txnId: 'b', date: '2026-10-07', amount: 200, manual: true, ph: true }];
  L.reconcileLinks(w2.txns, w2.goals, w2.debts, w2.invs);
  ok(w2.goals[0].currentAmount === 1000, 'placeholder: already included, not added again');
  w2.txns[1].link = '';
  L.reconcileLinks(w2.txns, w2.goals, w2.debts, w2.invs);
  ok(w2.goals[0].contribs.length === 0 && w2.goals[0].currentAmount === 1000, 'placeholder dropped on unlink, amount untouched');
}

// --- two devices / duplicate entries converge ---
{
  const w = world();
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  const dup = clone(w.debts[0].payments[0]);
  w.debts[0].payments.push(dup); w.debts[0].balance = round2(w.debts[0].balance - 300);  // a merge left it applied twice
  L.reconcileLinks(w.txns, w.goals, w.debts, w.invs);
  ok(w.debts[0].payments.length === 1 && w.debts[0].balance === 700, 'duplicate entry for one transaction is undone');
  function round2(n){ return Math.round(n * 100) / 100; }
}

// --- broken links are ignored, not applied ---
{
  const w = world();
  w.txns.push({ id: 'x', date: '2026-10-11', amount: 50, category: 'Debt Payments', type: 'expense', link: 'debt:sl' });  // grouped needs a group
  w.txns.push({ id: 'y', date: '2026-10-11', amount: 50, category: 'Savings/Investments', type: 'expense', link: 'inv:gone' });
  const want = L.desiredLinks(w.txns, w.goals, w.debts, w.invs);
  ok(!want.x && !want.y && !want.e, 'grouped debt without a group, missing target and wrong category are not applied');
}

// --- ask before counting old money ---
{
  const w = world();
  const g = L.findLinkTarget('goal:ef', w.goals, w.debts, w.invs);
  ok(L.linkNeedsAsk({ date: '2026-09-20' }, g) && !L.linkNeedsAsk({ date: '2026-10-02' }, g), 'goal: asks only for money from before it was set up');
  const a = L.findLinkTarget('inv:roth', w.goals, w.debts, w.invs);
  ok(!L.linkNeedsAsk({ date: '2026-10-05' }, a), 'account: no later update listed contributions -> no question');
  w.invs[0].history.push({ id: 'h2', date: '2026-10-20', balance: 1600, contributed: 500 });
  ok(L.linkNeedsAsk({ date: '2026-10-05' }, a), 'account: a later update already listed contributions -> ask');
  ok(!L.linkNeedsAsk({ date: '2026-09-01' }, a), 'account: before the first balance -> never counted, no question');
}

// --- suggestions ---
{
  const w = world();
  const s = L.suggestLink({ id: 'n', description: 'ALLY TRANSFER 9876', category: 'Savings/Investments' }, w.txns, w.goals, w.debts, w.invs);
  ok(s === 'inv:roth', 'suggests the last link for the same description (digits ignored)');
  ok(L.suggestLink({ id: 'n', description: 'ALLY TRANSFER 9876', category: 'Groceries' }, w.txns, w.goals, w.debts, w.invs) === '', 'no suggestion for a non-linkable category');
}

console.log(`\nLINK TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
