const fs = require('fs');
const html = fs.readFileSync('/workspace/personal-budget/index.html','utf8');
const m = html.match(/\/\* ===STATEMENT-PARSER-START===[\s\S]*?===STATEMENT-PARSER-END=== \*\//);
if(!m){ console.error('parser block not found'); process.exit(1); }
const shims = `function round2(n){ return Math.round((Number(n)||0)*100)/100; }`;
const api = new Function(shims + m[0] + `;return { parseStatementText };`)();
const { parseStatementText } = api;

let pass=0, fail=0;
function ok(c,msg){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', msg); } }

const capitalOne = `JONATHAN J WOODHALL #7473: Payments, Credits and Adjustments
Trans Date Post Date Description Amount
Jun 23 Jun 24 CAPITAL ONE MOBILE PYMT - $685.00
Jul 3 Jul 3 CAPITAL ONE MOBILE PYMT - $1,671.73
JONATHAN J WOODHALL #7473: Transactions
Trans Date Post Date Description Amount
Jun 14 Jun 15 SP DYNESSPOWER DYNESSPOWER.C CA $269.98
Jun 14 Jun 15 SPEEDWAY 44464 BERRIEN SPRIN MI $25.01
Jul 1 Jul 2 GOOGLE *Workspace_prop cc@google.com CA $8.40
Jul 8 Jul 8 BRAVE.COM BRAVE.COM CA $9.99
Jul 13 Jul 14 MIDWEST ENERGY & COMMUNI MARK.BRITTON@ MI $137.93
JONATHAN J WOODHALL #7473: Total Transactions $1,970.69
Page 3 of 4
Jun 14, 2026 - Jul 14, 2026 | 31 days in Billing Cycle`;

const chase = `EXXON 4778 PEYTONSVILL FRANKLIN TN 34.94
06/07 AMAZON MKTPL*VK39F4RL3 Amzn.com/bill WA Order Number 114-7315586-8198621
5.01
06/05 BP#1644600VANN BP JACKSON TN 24.91
06/22 Spotify P43CB2315C New York NY 18.99
07/01 AT&T MOBILITY EPAY KH4589@ATT.CO TX 58.91
07/03 Amazon.com*J18W870J3 Amzn.com/bill WA Order Number 111-9652054-9814608
26.49`;

// ---- Capital One ----
const co = parseStatementText(capitalOne, { year: 2026 });
const coTx = co.filter(r => !r.payment && !r.orphan);
ok(co.length >= 7, 'CapOne: parsed rows (got '+co.length+')');
const dyn = co.find(r => r.description.startsWith('SP DYNESSPOWER'));
ok(dyn && dyn.date==='2026-06-14' && dyn.amount===269.98 && dyn.type==='expense', 'CapOne: DYNESSPOWER 2026-06-14 $269.98 expense');
const goog = co.find(r => r.description.includes('Workspace'));
ok(goog && goog.date==='2026-07-01' && goog.amount===8.40, 'CapOne: Google 2026-07-01 $8.40 (post-date stripped)');
const pymt = co.find(r => r.description.includes('MOBILE PYMT') && r.amount===685.00);
ok(pymt && pymt.payment===true, 'CapOne: "- $685.00" flagged as payment');
ok(pymt && pymt.date==='2026-06-23', 'CapOne: payment trans-date 2026-06-23');
ok(!co.some(r => /total transactions/i.test(r.description)), 'CapOne: subtotal line skipped');
ok(!co.some(r => r.amount===1970.69), 'CapOne: $1,970.69 total NOT imported');

// ---- Chase (wrapped amounts, MM/DD, no year, no $) ----
const ch = parseStatementText(chase, { year: 2026 });
const amazon1 = ch.find(r => r.description.includes('VK39F4RL3'));
ok(amazon1 && amazon1.amount===5.01 && amazon1.date==='2026-06-07', 'Chase: wrapped Amazon amount 5.01 on 2026-06-07');
ok(amazon1 && amazon1.description.includes('Order Number 114-7315586-8198621'), 'Chase: wrapped description kept intact');
const spotify = ch.find(r => r.description.includes('Spotify'));
ok(spotify && spotify.amount===18.99 && spotify.date==='2026-06-22', 'Chase: Spotify 18.99 2026-06-22');
const att = ch.find(r => r.description.includes('AT&T'));
ok(att && att.amount===58.91 && att.date==='2026-07-01', 'Chase: AT&T 58.91 2026-07-01');
const amazon2 = ch.find(r => r.description.includes('J18W870J3'));
ok(amazon2 && amazon2.amount===26.49, 'Chase: second wrapped Amazon 26.49');
const orphan = ch.find(r => r.description.includes('EXXON 4778'));
ok(orphan && orphan.orphan===true, 'Chase: dateless first line flagged orphan');
ok(ch.filter(r=>!r.orphan).every(r=>r.date && r.date.startsWith('2026-')), 'Chase: all dated rows got the 2026 year');

// ---- month split: only July from a June+July statement ----
const july = co.filter(r => r.date && r.date.slice(0,7)==='2026-07' && !r.orphan);
const june = co.filter(r => r.date && r.date.slice(0,7)==='2026-06' && !r.orphan);
ok(july.length>0 && june.length>0, 'CapOne spans June AND July (so month filter is meaningful)');

console.log(`\nPARSER TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:2);
