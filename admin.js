#!/usr/bin/env node
'use strict';
// Usage:
//   node admin.js generate 100     -> creates 100 new codes, writes codes-to-sell.txt
//   node admin.js status           -> how many used / unused
//   node admin.js reset XXXX-XXXX-XXXX -> frees a code (e.g. customer changed phone)
const fs = require('fs');
const path = require('path');
const { load, save, sha, normalize, makeCode } = require('./store');

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'generate') {
  const n = parseInt(arg || '100', 10);
  if (!(n > 0 && n <= 5000)) { console.error('Number must be 1-5000'); process.exit(1); }
  const db = load();
  const fresh = [];
  while (fresh.length < n) {
    const c = makeCode();
    const h = sha(normalize(c));
    if (db.codes[h] || fresh.includes(c)) continue;
    fresh.push(c);
    db.codes[h] = { createdAt: new Date().toISOString(), sessionHash: null, redeemedAt: null };
  }
  save(db);
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, `codes-to-sell-${stamp}.txt`);
  fs.writeFileSync(out, fresh.map((c, i) => `${String(i + 1).padStart(3, '0')}  ${c}`).join('\n') + '\n', { mode: 0o600 });
  console.log(`Created ${n} codes -> ${out}`);
} else if (cmd === 'status') {
  const db = load();
  const all = Object.values(db.codes);
  const used = all.filter((r) => r.sessionHash).length;
  console.log(`Total: ${all.length}  Used: ${used}  Available: ${all.length - used}`);
} else if (cmd === 'reset') {
  const db = load();
  const rec = db.codes[sha(normalize(arg))];
  if (!rec) { console.error('Code not found'); process.exit(1); }
  rec.sessionHash = null; rec.redeemedAt = null;
  save(db);
  console.log('Code reset: it can be redeemed once more.');
} else {
  console.log('Usage: node admin.js generate [N] | status | reset CODE');
}
