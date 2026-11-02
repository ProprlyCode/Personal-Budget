// Proves the Realtime Database rules against the Firebase emulator:
// only listed household members can touch the budget; nobody can add members.
// Run: npm run test:rules   (needs Java; downloads the emulator on first run)
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { ref, get, set, update } = require("firebase/database");

let pass = 0, fail = 0;
async function check(label, promise){
  try{ await promise; pass++; console.log("  ✓ " + label); }
  catch(e){ fail++; console.log("  ✗ " + label + " — " + e.message); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-personal-budget",
    database: { rules: fs.readFileSync(process.env.RULES_FILE || path.join(__dirname, "..", "database.rules.json"), "utf8"), host: "127.0.0.1", port: 9000 }
  });
  await env.clearDatabase(); // start clean: earlier runs may have left data behind
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.database();
    await set(ref(db, "members/household-uid"), true);
    await set(ref(db, "budget"), { transactions: [{ id: "t1", amount: 12 }], updatedAt: 1 });
  });
  const member = env.authenticatedContext("household-uid").database();
  const stranger = env.authenticatedContext("stranger-uid").database();   // valid account, not a member
  const anon = env.unauthenticatedContext().database();

  await check("member can read the budget", assertSucceeds(get(ref(member, "budget"))));
  await check("member can replace the whole budget (how the app syncs)", assertSucceeds(set(ref(member, "budget"), { transactions: [], updatedAt: 2 })));
  await check("member can update part of the budget", assertSucceeds(update(ref(member, "budget"), { updatedAt: 3 })));
  await check("signed-in stranger cannot read the budget", assertFails(get(ref(stranger, "budget"))));
  await check("signed-in stranger cannot write the budget", assertFails(set(ref(stranger, "budget"), { pwned: true })));
  await check("signed-out visitor cannot read the budget", assertFails(get(ref(anon, "budget"))));
  await check("stranger cannot add themselves as a member", assertFails(set(ref(stranger, "members/stranger-uid"), true)));
  await check("member cannot add other members (console only)", assertFails(set(ref(member, "members/stranger-uid"), true)));
  await check("nobody can read the member list", assertFails(get(ref(stranger, "members"))));
  await check("nothing else in the database is readable", assertFails(get(ref(member, "/"))));
  await check("nothing else in the database is writable", assertFails(set(ref(member, "other"), 1)));

  await env.cleanup();
  console.log(`database rules: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
