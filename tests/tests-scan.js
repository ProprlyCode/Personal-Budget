// Reading screenshots, statement PDFs and receipts with Claude: request + reply handling.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pick = n => { const r = html.match(new RegExp('\\/\\* ===' + n + '-START===[\\s\\S]*?===' + n + '-END=== \\*\\/')); if(!r){ console.error(n + ' block not found'); process.exit(1); } return r[0]; };
const S = new Function(pick('SCAN-ENGINE') + `
  ;return { scanModel, scanSchema, buildScanRequest, parseScanResponse, scanCost, looseTwin };
`)();
let pass = 0, fail = 0;
function ok(c, m){ if(c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } }

// --- request ---
{
  const req = S.buildScanRequest([{ media_type: 'image/png', data: 'AAA' }, { media_type: 'application/pdf', data: 'BBB' }], '2026-11-21', ['Groceries', 'Dining Out']);
  ok(req.model === 'claude-opus-5-5', 'uses Claude Opus 5.5');
  ok(!('thinking' in req) && !('temperature' in req), 'no thinking config or sampling params (not allowed on this model)');
  const c = req.messages[0].content;
  ok(c[0].type === 'image' && c[0].source.media_type === 'image/png' && c[1].type === 'document' && c[2].type === 'text', 'images and PDFs go first, then the instruction');
  ok(req.output_config.format.type === 'json_schema', 'structured output (JSON schema)');
  const sch = req.output_config.format.schema;
  ok(sch.additionalProperties === false && sch.properties.transactions.items.additionalProperties === false, 'every object closes additionalProperties');
  ok(JSON.stringify(sch.properties.transactions.items.properties.category.enum) === JSON.stringify(['', 'Groceries', 'Dining Out']), 'category limited to your categories (or "")');
  ok(/2026-11-21/.test(req.system), 'tells Claude today\'s date (for screenshots without a year)');
  const items = sch.properties.transactions.items;
  ok(items.required.length === Object.keys(items.properties).length, 'all fields required');
}
// --- reply ---
const reply = (obj, extra) => Object.assign({ stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 500 },
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }] }, extra || {});
{
  const r = S.parseScanResponse(reply({ kind: 'transactions', note: '', transactions: [
    { date: '2026-11-18', description: 'KROGER #402', amount: 86.4, direction: 'charge', category: 'Groceries', unsure: false },
    { date: '2026-11-17', description: 'AMAZON REFUND', amount: -12.5, direction: 'refund', category: '', unsure: false },
    { date: '2026-11-15', description: 'AUTOPAY PAYMENT THANK YOU', amount: 1500, direction: 'payment', category: '', unsure: false },
    { date: 'Nov 3', description: 'SHELL', amount: 41.2, direction: 'charge', category: 'Transportation', unsure: true }
  ] }));
  ok(r.ok && r.rows.length === 4, 'reads every row (thinking block ignored)');
  ok(r.rows[0].type === 'expense' && r.rows[0].amount === 86.4 && r.rows[0].category === 'Groceries', 'charge -> expense with its category');
  ok(r.rows[1].type === 'income' && r.rows[1].amount === 12.5, 'refund -> money back, amount made positive');
  ok(r.rows[2].payment === true, 'card payment flagged (skipped by default, like paste)');
  ok(r.rows[3].orphan === true && r.rows[3].date === '' && r.rows[3].unsure === true, 'a bad date becomes "check", not a guess');
  ok(r.cost === 0.018, 'cost: 2,000 in x $4/M + 500 out x $20/M = $0.018');
}
{
  ok(S.parseScanResponse(reply({}, { stop_reason: 'refusal' })).error.length > 0, 'refusal -> clear message');
  ok(/fewer/.test(S.parseScanResponse(reply({}, { stop_reason: 'max_tokens' })).error), 'too long -> try fewer at a time');
  const bad = S.parseScanResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
  ok(!bad.ok && bad.error, 'unparseable reply -> error, no rows');
  const other = S.parseScanResponse(reply({ kind: 'other', note: 'A photo of a dog', transactions: [] }));
  ok(other.ok && other.rows.length === 0 && other.note === 'A photo of a dog', 'nothing financial -> says what it saw');
  const receipt = S.parseScanResponse(reply({ kind: 'receipt', note: '', transactions: [{ date: '2026-11-20', description: 'Trader Joe\'s', amount: 54.12, direction: 'charge', category: 'Groceries', unsure: false }] }));
  ok(receipt.kind === 'receipt' && receipt.rows.length === 1, 'receipt -> one transaction');
}
// --- cost with caching fields ---
ok(S.scanCost({ input_tokens: 1000, cache_read_input_tokens: 1000, output_tokens: 0 }) === 0.008, 'cost counts all input tokens');
// --- receipt vs statement twin ---
{
  const have = [{ date: '2026-11-18', description: 'KROGER 402 ANYTOWN MI', amount: 86.4, type: 'expense' }];
  ok(S.looseTwin({ date: '2026-11-17', description: 'Kroger #402', amount: 86.4, type: 'expense' }, have), 'receipt and statement line are the same purchase');
  ok(!S.looseTwin({ date: '2026-11-17', description: 'Kroger', amount: 86.41, type: 'expense' }, have), 'a cent off: different');
  ok(!S.looseTwin({ date: '2026-11-25', description: 'Kroger', amount: 86.4, type: 'expense' }, have), 'a week later: different');
  ok(!S.looseTwin({ date: '2026-11-18', description: 'Target', amount: 86.4, type: 'expense' }, have), 'different store: different');
}
console.log(`\nSCAN TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 2);
