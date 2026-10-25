'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const FILE = path.join(DATA_DIR, 'codes.json');
const SEED = path.join(__dirname, 'seed-codes.json'); // الرموز الأولية المرفوعة مع المشروع
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I,L,O,0,1

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normalize = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch {
    // أول تشغيل على قرص دائم جديد: انسخ الرموز الأولية
    try { const seed = JSON.parse(fs.readFileSync(SEED, 'utf8')); save(seed); return seed; }
    catch { return { codes: {} }; }
  }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
function makeCode() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

// Redeem: first use binds the code to the device (via a random session token).
// Returns {ok:true, sid?} | {ok:false, reason}
function redeem(rawCode, existingSid) {
  const n = normalize(rawCode);
  if (n.length !== 12) return { ok: false, reason: 'invalid' };
  const db = load();
  const rec = db.codes[sha(n)];
  if (!rec) return { ok: false, reason: 'invalid' };
  if (!rec.sessionHash) {
    const sid = crypto.randomBytes(32).toString('hex');
    rec.sessionHash = sha(sid);
    rec.redeemedAt = new Date().toISOString();
    save(db);
    return { ok: true, sid, first: true };
  }
  if (existingSid && sha(existingSid) === rec.sessionHash) return { ok: true, sid: existingSid, first: false };
  return { ok: false, reason: 'used' };
}

function sessionValid(sid) {
  if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return false;
  const h = sha(sid);
  const db = load();
  return Object.values(db.codes).some((r) => r.sessionHash === h);
}

module.exports = { load, save, sha, normalize, makeCode, redeem, sessionValid };
