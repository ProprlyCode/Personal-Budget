const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ===SYNC-ENGINE-START===[\s\S]*?===SYNC-ENGINE-END=== \*\//);
if(!m){ console.error('engine block not found'); process.exit(1); }
const E = new Function(m[0] + `;return { canonicalize, fingerprint, fromCloudList, toCloudList, baseOf, mergeById };`)();

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
const ids = list => list.map(x => x.id).join(',');
const t = (id, amount, extra) => Object.assign({ id, amount, description: 'x' + id }, extra || {});

// --- fingerprints survive a Firebase round-trip ---
{
  const local = { id: 'a', b: 2, a: 1, notes: '', tags: [], meta: {}, gone: null, nested: { z: 1, y: [] } };
  const fromFirebase = { a: 1, b: 2, id: 'a', nested: { z: 1 }, notes: '' };   // empty array/object/null dropped, keys reordered
  ok(E.fingerprint(local) === E.fingerprint(fromFirebase), 'canonical form ignores key order and what Firebase drops');
  ok(E.fingerprint(t('a', 1)) !== E.fingerprint(t('a', 2)), 'real edits change the fingerprint');
}

// --- cloud list encoding ---
ok(E.fromCloudList(false).length === 0 && E.fromCloudList(null).length === 0, 'false/null → empty list');
ok(ids(E.fromCloudList({ 1: t('b'), 0: t('a') })) === 'a,b', 'object-shaped arrays come back in index order');
ok(E.toCloudList([]) === false && E.toCloudList([t('a')]).length === 1, 'empty list is stored as false');

// --- merging ---
const base0 = [t('a', 1), t('b', 2), t('c', 3)];
const base = E.baseOf(base0);
{
  // Device A adds d; meanwhile device B added e in the cloud
  const r = E.mergeById(base, base0.concat([t('d', 4)]), base0.concat([t('e', 5)]));
  ok(ids(r) === 'a,b,c,e,d', 'both devices\' new transactions are kept (got ' + ids(r) + ')');
}
{
  // A deletes b; B edited c in the cloud
  const r = E.mergeById(base, [t('a', 1), t('c', 3)], [t('a', 1), t('b', 2), t('c', 33)]);
  ok(ids(r) === 'a,c' && r[1].amount === 33, 'local delete applied, remote edit kept');
}
{
  // A edits a; B deleted c
  const r = E.mergeById(base, [t('a', 11), t('b', 2), t('c', 3)], [t('a', 1), t('b', 2)]);
  ok(ids(r) === 'a,b' && r[0].amount === 11, 'local edit applied, remote delete kept (c not resurrected)');
}
{
  // both edit the same item: this device wins (it's the later write)
  const r = E.mergeById(base, [t('a', 100), t('b', 2), t('c', 3)], [t('a', 50), t('b', 2), t('c', 3)]);
  ok(r[0].amount === 100, 'same item edited on both: the later write wins');
}
{
  // edited here, deleted there → keep the edit
  const r = E.mergeById(base, [t('a', 1), t('b', 22), t('c', 3)], [t('a', 1), t('c', 3)]);
  ok(ids(r).split(',').sort().join() === 'a,b,c', 'edited here but deleted elsewhere: the edit survives');
}
{
  // no base (first sync after upgrading): union, nothing deleted
  const r = E.mergeById({}, [t('a', 1), t('x', 9)], [t('a', 1), t('y', 8)]);
  ok(ids(r) === 'a,y,x', 'without a base nothing is deleted (got ' + ids(r) + ')');
}
{
  // unchanged local data never overwrites the cloud's newer version
  const r = E.mergeById(base, base0, [t('a', 7), t('b', 2), t('c', 3)]);
  ok(r[0].amount === 7, 'a stale but unedited local copy does not clobber the cloud');
}
{
  // emptying the list is a set of deletions, not "no data"
  const r = E.mergeById(base, [], base0);
  ok(r.length === 0, 'deleting everything here empties the list');
}
{
  const dup = E.mergeById({}, [], [t('a', 1), t('a', 2)]);
  ok(dup.length === 1, 'duplicate ids in the cloud are collapsed');
}

console.log(`sync engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
