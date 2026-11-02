const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ===BACKUP-ENGINE-START===[\s\S]*?===BACKUP-ENGINE-END=== \*\//);
if(!m){ console.error('engine block not found'); process.exit(1); }
const E = new Function(m[0] + `;return { backupRetention, backupCounts };`)();
let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }

const DAY = 86400000, now = Date.UTC(2026, 10, 2, 12);
// one automatic snapshot every day for 90 days, two on the latest day
const snaps = [];
for(let d = 0; d < 90; d++) snaps.push({ id: 'a' + d, takenAt: now - d * DAY, reason: 'auto' });
snaps.push({ id: 'a0b', takenAt: now - 3600000, reason: 'auto' });
{
  const keep = E.backupRetention(snaps, now);
  ok(keep.has('a0') && !keep.has('a0b'), 'newest snapshot of a day wins');
  ok(['a0','a1','a2','a3','a4','a5','a6'].every(id => keep.has(id)), 'last 7 days kept');
  ok(!keep.has('a40') && keep.size <= 7 + 8, 'old daily snapshots pruned; at most 15 automatic kept (got ' + keep.size + ')');
  const weekly = [...keep].map(id => +id.slice(1)).filter(d => d >= 7);
  ok(weekly.length >= 6 && Math.max(...weekly) <= 8 * 7, 'about one per week for ~8 weeks (' + weekly.sort((a,b)=>a-b).join(',') + ')');
}
{
  const safety = [];
  for(let i = 0; i < 14; i++) safety.push({ id: 's' + i, takenAt: now - i * DAY, reason: 'safety' });
  safety.push({ id: 'old', takenAt: now - 45 * DAY, reason: 'safety' });
  const keep = E.backupRetention(safety, now);
  ok(keep.size === 10 && keep.has('s0') && !keep.has('s10') && !keep.has('old'), 'newest 10 safety snapshots within 30 days');
}
ok(E.backupRetention([], now).size === 0, 'empty list is fine');
ok(JSON.stringify(E.backupCounts({ pa_transactions: [1,2,3], pa_investments: [1], pa_budget_history: { '2026-09': {}, '2026-10': {} } }))
   === JSON.stringify({ transactions: 3, goals: 0, debts: 0, accounts: 1, budgetMonths: 2 }), 'counts what a backup contains');

console.log(`backup engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
