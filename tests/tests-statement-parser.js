const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ===STATEMENT-PARSER-START===[\s\S]*?===STATEMENT-PARSER-END=== \*\//);
if(!m){ console.error('parser block not found'); process.exit(1); }
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const api = new Function(shims + m[0] + `;return { parseStatementText };`)();
const { parseStatementText } = api;

let pass=0, fail=0;
function ok(c,msg){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }

// Made-up statements in the real layouts of each bank (no real names, cards,
// merchants or order numbers): what matters to the parser is the line shape.
const capitalOne = `ALEX Q SAMPLE #0000: Payments, Credits and Adjustments
Trans Date Post Date Description Amount
Jun 23 Jun 24 CAPITAL ONE MOBILE PYMT - $685.00
Jul 3 Jul 3 CAPITAL ONE MOBILE PYMT - $1,671.73
ALEX Q SAMPLE #0000: Transactions
Trans Date Post Date Description Amount
Jun 14 Jun 15 SP EXAMPLESHOP EXAMPLESHOP.C CA $269.98
Jun 14 Jun 15 FUELMART 10001 ANYTOWN MI $25.01
Jul 1 Jul 2 GOOGLE *Workspace_example cc@google.com CA $8.40
Jul 8 Jul 8 STREAMCO.COM STREAMCO.COM CA $9.99
Jul 13 Jul 14 EXAMPLE ELECTRIC COOP BILLING@ MI $137.93
ALEX Q SAMPLE #0000: Total Transactions $1,970.69
Page 3 of 4
Jun 14, 2026 - Jul 14, 2026 | 31 days in Billing Cycle`;

const chase = `FUELMART 0001 SAMPLEVILLE ANYCITY TN 34.94
06/07 AMAZON MKTPL*AB12CD34E Amzn.com/bill WA Order Number 000-0000001-0000001
5.01
06/05 FUEL#0000002 SAMPLE ANYCITY TN 24.91
06/22 Spotify P00EXAMPLE New York NY 18.99
07/01 PHONECO MOBILITY EPAY PAY@PHONECO.EX TX 58.91
07/03 Amazon.com*XY98ZW76V Amzn.com/bill WA Order Number 000-0000002-0000002
26.49`;

// ---- Capital One ----
const co = parseStatementText(capitalOne, { year: 2026 });
ok(co.length >= 7, 'CapOne: parsed rows (got '+co.length+')');
const dyn = co.find(r => r.description.startsWith('SP EXAMPLESHOP'));
ok(dyn && dyn.date==='2026-06-14' && dyn.amount===269.98 && dyn.type==='expense', 'CapOne: EXAMPLESHOP 2026-06-14 $269.98 expense');
const goog = co.find(r => r.description.includes('Workspace'));
ok(goog && goog.date==='2026-07-01' && goog.amount===8.40, 'CapOne: Google 2026-07-01 $8.40 (post-date stripped)');
const pymt = co.find(r => r.description.includes('MOBILE PYMT') && r.amount===685.00);
ok(pymt && pymt.payment===true, 'CapOne: "- $685.00" flagged as payment');
ok(pymt && pymt.date==='2026-06-23', 'CapOne: payment trans-date 2026-06-23');
ok(!co.some(r => /total transactions/i.test(r.description)), 'CapOne: subtotal line skipped');
ok(!co.some(r => r.amount===1970.69), 'CapOne: $1,970.69 total NOT imported');

// ---- Chase (wrapped amounts, MM/DD, no year, no $) ----
const ch = parseStatementText(chase, { year: 2026 });
const amazon1 = ch.find(r => r.description.includes('AB12CD34E'));
ok(amazon1 && amazon1.amount===5.01 && amazon1.date==='2026-06-07', 'Chase: wrapped Amazon amount 5.01 on 2026-06-07');
ok(amazon1 && amazon1.description.includes('Order Number 000-0000001-0000001'), 'Chase: wrapped description kept intact');
const spotify = ch.find(r => r.description.includes('Spotify'));
ok(spotify && spotify.amount===18.99 && spotify.date==='2026-06-22', 'Chase: Spotify 18.99 2026-06-22');
const att = ch.find(r => r.description.includes('PHONECO'));
ok(att && att.amount===58.91 && att.date==='2026-07-01', 'Chase: phone bill 58.91 2026-07-01');
const amazon2 = ch.find(r => r.description.includes('XY98ZW76V'));
ok(amazon2 && amazon2.amount===26.49, 'Chase: second wrapped Amazon 26.49');
const orphan = ch.find(r => r.description.includes('FUELMART 0001'));
ok(orphan && orphan.orphan===true, 'Chase: dateless first line flagged orphan');
ok(ch.filter(r=>!r.orphan).every(r=>r.date && r.date.startsWith('2026-')), 'Chase: all dated rows got the 2026 year');

// ---- Capital One: summary box, credits that aren't payments, two cardholders ----
const capOne2 = `Payment Information Account Summary
Previous Balance $900.00
Dec 08, 2026 on the statement closing date when Payments - $1,200.00
Other Credits - $310.00
ALEX Q SAMPLE #1111: Payments, Credits and Adjustments
Trans Date Post Date Description Amount
Oct 19 Oct 26 PURCHASE ADJUSTMENT - $200.00
Oct 28 Oct 29 EXAMPLESTAY * ABC123 5550001111 CA - $60.00
Nov 3 Nov 3 CREDIT-CASH BACK REWARD - $50.00
Nov 8 Nov 8 CAPITAL ONE MOBILE PYMT - $1,200.00
ALEX Q SAMPLE #1111: Transactions
Oct 19 Oct 19 EXAMPLESTAY * ABC123 EXAMPLESTAY.COM CA $200.00
Oct 20 Oct 21 SAMPLE GROCER ANYTOWN MI $45.10
SAM R SAMPLE #2222: Transactions
Nov 2 Nov 3 SAMPLE COFFEE ANYTOWN MI $4.25`;
const c2 = parseStatementText(capOne2, { year: 2026 });
ok(!c2.some(r => /closing date/i.test(r.description)), 'CapOne: due date in the summary box is not a transaction');
ok(c2.find(r => /MOBILE PYMT/.test(r.description)).payment === true, 'CapOne: mobile payment is a card payment');
const adj = c2.find(r => /PURCHASE ADJUSTMENT/.test(r.description));
ok(adj && adj.payment === false && adj.refund === true && adj.type === 'income' && adj.amount === 200, 'CapOne: purchase adjustment is money back, not a payment');
ok(c2.find(r => /CASH BACK/.test(r.description)).refund === true, 'CapOne: cash back reward is money back');
ok(c2.find(r => /EXAMPLESTAY \* ABC123 5550001111/.test(r.description)).refund === true, 'CapOne: merchant credit is money back');
ok(c2.find(r => /SAMPLE COFFEE/.test(r.description)).date === '2026-11-02', "CapOne: second cardholder's purchases read too");
ok(c2.filter(r => r.date && !r.payment && !r.refund).length === 3, 'CapOne: three dated purchases (summary lines have no date)');

// ---- Chase: rewards points table is not transactions ----
const chase2 = `Payment, Credits -$500.00
Purchases +$71.24
Opening/Closing Date 10/06/26 - 11/05/26
ACCOUNT ACTIVITY
10/23 Payment Thank You-Mobile -500.00
10/05 SAMPLE GAS 0001 ANYTOWN MI 57.64
10/11 EXAMPLE MARKETPLACE*AB12 Example.com/bill WA 13.60
PURCHASES AND REDEMPTIONS
10/10 EXAMPLE MARKETPLACE EXAMPLE.COM/BILLWA 4.20 420`;
const ch2 = parseStatementText(chase2, { year: 2026 });
ok(ch2.find(r => /Payment Thank You/.test(r.description)).payment === true, 'Chase: payment thank you is a card payment');
ok(ch2.filter(r => !r.payment && r.date && r.amount != null).length === 2, 'Chase: two purchases; the points line (amount then points) is not one');

// ---- month split: only July from a June+July statement ----
const july = co.filter(r => r.date && r.date.slice(0,7)==='2026-07' && !r.orphan);
const june = co.filter(r => r.date && r.date.slice(0,7)==='2026-06' && !r.orphan);
ok(july.length>0 && june.length>0, 'CapOne spans June AND July (so month filter is meaningful)');

console.log(`\nPARSER TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:2);
