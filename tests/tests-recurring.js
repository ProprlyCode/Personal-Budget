// Recurring bills, subscriptions and paychecks.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const R = new Function(shims + pick('INGEST-ENGINE') + pick('SYNC-ENGINE') + pick('RECUR-ENGINE') + `
  ;return { cleanRecur, recurDates, recurAmountOn, dueRecurring, skippedStillPresent, upcomingRecurring, nextRecurDate, detectRecurring, recurringTwin };
`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- schedules ---
{
  const rent = R.cleanRecur({ id: 'rent', description: 'Rent', amount: 1800, freq: 'monthly', day: 1, start: '2026-09-01' });
  ok(eq(R.recurDates(rent, '2026-09-01', '2026-11-15'), ['2026-09-01', '2026-10-01', '2026-11-01']), 'monthly on the 1st');
  const late = R.cleanRecur({ id: 'x', freq: 'monthly', day: 31, start: '2026-01-31' });
  ok(eq(R.recurDates(late, '2026-01-01', '2026-03-31'), ['2026-01-31', '2026-02-28', '2026-03-31']), 'day 31 lands on the last day of short months');
  const twice = R.cleanRecur({ id: 't', freq: 'twice', day: 1, day2: 15, start: '2026-10-01' });
  ok(eq(R.recurDates(twice, '2026-10-01', '2026-11-20'), ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15']), 'twice a month');
  const bi = R.cleanRecur({ id: 'b', freq: 'biweekly', start: '2026-10-02' });
  ok(eq(R.recurDates(bi, '2026-10-10', '2026-11-13'), ['2026-10-16', '2026-10-30', '2026-11-13']), 'every 2 weeks from the start, picking up mid-way');
  const wk = R.cleanRecur({ id: 'w', freq: 'weekly', start: '2026-11-02' });
  ok(R.recurDates(wk, '2026-11-01', '2026-11-30').length === 5, 'weekly');
  const yr = R.cleanRecur({ id: 'y', freq: 'yearly', start: '2025-03-10' });
  ok(eq(R.recurDates(yr, '2025-01-01', '2027-12-31'), ['2025-03-10', '2026-03-10', '2027-03-10']), 'yearly on the start date');
  const ended = R.cleanRecur({ id: 'e', freq: 'monthly', day: 5, start: '2026-01-05', end: '2026-03-01' });
  ok(eq(R.recurDates(ended, '2026-01-01', '2026-12-31'), ['2026-01-05', '2026-02-05']), 'stops at the end date');
  ok(R.recurDates(rent, '2026-01-01', '2026-08-31').length === 0, 'nothing before it started');
  ok(R.cleanRecur({ id: 'z', freq: 'nope', day: 99, amount: -3 }).freq === 'monthly' && R.cleanRecur({ id: 'z', day: 99 }).day === 31, 'bad input is cleaned');
  ok(!('end' in rent) && !('paused' in rent), 'no undefined/empty optional keys');
}
// --- amounts from now on ---
{
  const r = R.cleanRecur({ id: 'n', amount: 15.49, freq: 'monthly', day: 3, start: '2026-01-03', changes: [{ from: '2026-10-03', amount: 17.99 }] });
  ok(R.recurAmountOn(r, '2026-09-03') === 15.49 && R.recurAmountOn(r, '2026-10-03') === 17.99 && R.recurAmountOn(r, '2026-12-03') === 17.99, 'price change applies from its date on, not before');
}
// --- due generation ---
{
  const r = R.cleanRecur({ id: 'net', description: 'Netflix', amount: 15.49, category: 'Subscriptions', acctId: 'co', freq: 'monthly', day: 3, start: '2026-09-03', varies: false });
  const due = R.dueRecurring([r], [], '2026-11-03');
  ok(due.length === 3 && due[0].id === 'r-net-2026-09-03' && due[2].date === '2026-11-03', 'adds every occurrence up to today, with stable ids');
  ok(due.every(t => t.recurId === 'net' && t.acctId === 'co' && t.category === 'Subscriptions' && !('estimate' in t)), 'occurrence copies the rule');
  ok(R.dueRecurring([r], due, '2026-11-03').length === 0, 'already there: nothing added again (two devices end up with the same ids)');
  r.skips = ['2026-10-03'];
  ok(R.dueRecurring([r], [due[0]], '2026-11-03').length === 1, 'a deleted (skipped) date is not added back');
  ok(eq(R.skippedStillPresent([r], due), ['r-net-2026-10-03']), 'finds a skipped occurrence still present (deleted on another device)');
  const elec = R.cleanRecur({ id: 'el', description: 'Electric', amount: 120, freq: 'monthly', day: 20, start: '2026-10-20', varies: true });
  ok(R.dueRecurring([elec], [], '2026-11-03')[0].estimate === true, 'amount-varies bills are flagged as estimates');
  ok(R.dueRecurring([Object.assign({}, r, { paused: true })], [], '2026-11-03').length === 0, 'paused: nothing added');
}
// --- upcoming / next ---
{
  const rules = [R.cleanRecur({ id: 'rent', description: 'Rent', amount: 1800, freq: 'monthly', day: 1, start: '2026-01-01' }),
                 R.cleanRecur({ id: 'ph', description: 'Phone', amount: 70, freq: 'monthly', day: 18, start: '2026-01-18' }),
                 R.cleanRecur({ id: 'pay', description: 'Payroll', amount: 2400, type: 'income', freq: 'biweekly', start: '2026-10-30' })];
  const up = R.upcomingRecurring(rules, [], '2026-11-03');
  ok(up.some(u => u.description === 'Phone' && u.date === '2026-11-18') && !up.some(u => u.description === 'Rent'), 'upcoming this month: phone yes, rent (already past) no');
  ok(up.filter(u => u.type === 'income').map(u => u.date).join() === '2026-11-13,2026-11-27', 'paychecks coming this month');
  ok(R.nextRecurDate(rules[0], '2026-11-03') === '2026-12-01', 'next date');
}
// --- detection ---
{
  const T = [];
  ['2026-08', '2026-09', '2026-10'].forEach(m => T.push({ date: m + '-03', description: 'NETFLIX.COM 123', amount: 15.49, type: 'expense', category: 'Subscriptions', acctId: 'co' }));
  ['2026-08', '2026-09', '2026-10'].forEach((m, i) => T.push({ date: m + '-12', description: 'Kroger', amount: [80, 140, 55][i], type: 'expense', category: 'Groceries' }));
  ['2026-09-04', '2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30'].forEach(d => T.push({ date: d, description: 'ACME PAYROLL', amount: 2400, type: 'income', category: 'Salary/Wages' }));
  const found = R.detectRecurring(T, [], '2026-11-03');
  const net = found.find(f => /NETFLIX/.test(f.description)), pay = found.find(f => /PAYROLL/.test(f.description));
  ok(net && net.freq === 'monthly' && net.day === 3 && net.amount === 15.49, 'finds a monthly subscription');
  ok(pay && pay.freq === 'biweekly' && pay.start === '2026-10-30', 'finds a biweekly paycheck');
  ok(!found.some(f => f.description === 'Kroger'), 'groceries that vary a lot are not recurring');
  ok(R.detectRecurring(T, [{ description: 'Netflix.com' }], '2026-11-03').every(f => !/NETFLIX/.test(f.description)), 'already set up: not suggested again');
}
// --- import twin ---
{
  const have = [{ id: 'r-net-2026-11-03', recurId: 'net', date: '2026-11-03', amount: 15.49, type: 'expense' }];
  ok(R.recurringTwin({ date: '2026-11-05', amount: 15.49, type: 'expense' }, have), 'statement row 2 days later at the same amount is the same charge');
  ok(!R.recurringTwin({ date: '2026-11-12', amount: 15.49, type: 'expense' }, have), '9 days later is a different charge');
}
console.log(`\nRECURRING TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
