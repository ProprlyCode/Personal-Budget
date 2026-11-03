// A tiny in-memory stand-in for the Firebase compat SDK (auth + Realtime
// Database), shared by several browser contexts ("devices") through Node.
// Mimics what matters for sync: per-path reads/writes, multi-path update(),
// compare-and-set transactions with retries, value listeners on every
// device, and Firebase dropping null/empty arrays/objects.

function fbNormalize(v){
  if(v === null || v === undefined) return undefined;
  if(Array.isArray(v)){ const a = v.map(fbNormalize).filter(x => x !== undefined); return a.length ? a : undefined; }
  if(typeof v === "object"){
    const o = {};
    Object.keys(v).sort().forEach(k => { const c = fbNormalize(v[k]); if(c !== undefined) o[k] = c; });
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}

class FakeCloud {
  constructor(initial){ this.root = fbNormalize(initial) || {}; this.pages = []; this.failWrites = false; this.writes = 0; }
  get(path){ let v = this.root; for(const k of path.split("/").filter(Boolean)){ if(v == null) return null; v = v[k]; } return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  set(path, val){
    const keys = path.split("/").filter(Boolean); let o = this.root;
    keys.slice(0, -1).forEach(k => { if(typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; });
    const n = fbNormalize(val);
    if(n === undefined) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = n;
  }
  async notify(){ for(const p of this.pages){ await p.evaluate(v => window.__fbFire && window.__fbFire(v), this.get("budget")).catch(() => {}); } }
  async attach(context){
    const page = await context.newPage();
    await page.route(/^https:\/\/([a-z0-9-]+\.)*(gstatic|firebaseio|googleapis)\.com\//, r => r.abort());
    await page.exposeFunction("__fbGet", path => this.get(path));
    await page.exposeFunction("__fbUpdate", async (path, obj) => {
      if(this.failWrites) throw new Error("network down");
      Object.keys(obj).forEach(k => this.set(path + "/" + k, obj[k])); this.writes++;
      setTimeout(() => this.notify(), 30);
      return true;
    });
    await page.exposeFunction("__fbCas", async (path, expectJSON, val) => {
      if(this.failWrites) throw new Error("network down");
      if(JSON.stringify(this.get(path)) !== expectJSON) return { ok: false };
      this.set(path, val); this.writes++;
      setTimeout(() => this.notify(), 30);
      return { ok: true, value: this.get(path) };
    });
    await page.addInitScript(BROWSER_SIDE);
    this.pages.push(page);
    return page;
  }
}

// Runs in each page before the app: defines window.firebase.
const BROWSER_SIDE = `(() => {
  const listeners = [];
  window.__fbFire = v => listeners.forEach(cb => cb({ val: () => v === undefined ? null : JSON.parse(JSON.stringify(v)) }));
  const user = { uid: "household-uid", email: "home@example.com" };
  const snap = v => ({ val: () => v });
  // Real Firebase throws (synchronously) on any undefined value in a write.
  function findUndef(v, p){
    if(v === undefined) return p;
    if(v && typeof v === "object"){ for(const k of Object.keys(v)){ const r = findUndef(v[k], p ? p + "." + k : k); if(r) return r; } }
    return "";
  }
  function check(kind, path, v){
    const bad = findUndef(v, path.split("/").filter(Boolean).join("."));
    if(bad) throw new Error(kind + " failed: values argument contains undefined in property '" + bad + "'");
  }
  function ref(path){
    return {
      child: k => ref(path + "/" + k),
      on(evt, cb){ if(path === ".info/connected"){ setTimeout(() => cb(snap(true)), 0); return; } listeners.push(cb); window.__fbGet(path).then(v => cb(snap(v))); },
      off(){ if(path !== ".info/connected") listeners.length = 0; },
      once(){ return window.__fbGet(path).then(snap); },
      update(obj){ check("update", path, obj); return window.__fbUpdate(path, obj); },
      set(v){ const keys = path.split("/"); const last = keys.pop(); return window.__fbUpdate(keys.join("/"), { [last]: v }); },
      async transaction(fn){
        for(let i = 0; i < 25; i++){
          const cur = await window.__fbGet(path);
          const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
          if(next === undefined) return { committed: false, snapshot: snap(cur) };
          check("transaction", path, next);
          const r = await window.__fbCas(path, JSON.stringify(cur), next);
          if(r.ok) return { committed: true, snapshot: snap(r.value) };
        }
        throw new Error("transaction gave up");
      }
    };
  }
  const auth = { currentUser: user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 0); }, signInWithEmailAndPassword: () => Promise.resolve(), signOut(){ this.currentUser = null; return Promise.resolve(); } };
  window.firebase = { initializeApp(){}, auth: () => auth, database: () => ({ ref }) };
})();`;

module.exports = { FakeCloud, fbNormalize };
