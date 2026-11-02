// Static checks for index.html that lint can't do:
//  1. every getElementById("x") / querySelector("#x") literal has an element with id="x"
//     (catches dead references left behind when markup is removed);
//  2. every external <script> is pinned with Subresource Integrity, so a
//     compromised CDN can't run code inside the budget;
//  3. no element id is defined twice.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const problems = [];

const ids = new Map();
for(const m of html.matchAll(/\sid="([^"$]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
for(const [id, n] of ids) if(n > 1) problems.push(`duplicate id="${id}" (${n}×)`);

const refs = new Set();
for(const m of html.matchAll(/getElementById\(\s*["']([^"'$]+)["']\s*\)/g)) refs.add(m[1]);
for(const m of html.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z][\w-]*)["']/g)) refs.add(m[1]);
for(const id of refs) if(!ids.has(id)) problems.push(`script references #${id} but no element has id="${id}"`);

for(const m of html.matchAll(/<script\b[^>]*\bsrc="(https?:[^"]+)"[^>]*>/g)){
  const tag = m[0];
  if(!/\bintegrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(tag)) problems.push(`external script without integrity hash: ${m[1]}`);
  if(!/\bcrossorigin="anonymous"/.test(tag)) problems.push(`external script without crossorigin="anonymous": ${m[1]}`);
}

if(problems.length){ console.error('Static checks failed:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`static checks passed (${refs.size} element references, ${ids.size} ids, external scripts pinned)`);
