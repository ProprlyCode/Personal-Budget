// Runs every tests/tests-*.js file; exits non-zero if any fails.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /^tests-.*\.js$/.test(f)).sort();
let failed = 0;
for(const f of files){
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if(r.status !== 0){ failed++; console.error(`✗ ${f} failed`); }
}
console.log(failed ? `\n${failed} test file(s) failed` : `\nall ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
