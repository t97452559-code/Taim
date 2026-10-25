'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { redeem, sessionValid } = require('./store');

const PORT = process.env.PORT || 3000;
const SECURE = process.env.COOKIE_SECURE === '1'; // set when served over HTTPS
const PUBLIC = __dirname;
const AUDIO = __dirname;
const SOUNDS = new Set(['rain', 'waves', 'wind', 'fire', 'pad', 'bowls', 'night']);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}
function json(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}

// simple per-IP rate limit for code attempts: 8 tries / 10 minutes
const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((t) => now - t < 600000);
  arr.push(now);
  attempts.set(ip, arr);
  return arr.length > 8;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (!v.some((t) => now - t < 600000)) attempts.delete(k); }, 600000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'POST' && url.pathname === '/api/redeem') {
    if (limited(ip)) return json(res, 429, { error: 'many' });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      let code = '';
      try { code = JSON.parse(body).code; } catch {}
      const r = redeem(code, cookies(req).sid);
      if (!r.ok) return json(res, r.reason === 'used' ? 403 : 400, { error: r.reason });
      const cookie = `sid=${r.sid}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${SECURE ? '; Secure' : ''}`;
      json(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    return json(res, 200, { ok: sessionValid(cookies(req).sid) });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/audio/')) {
    if (!sessionValid(cookies(req).sid)) return json(res, 401, { error: 'locked' });
    const name = url.pathname.slice(7).replace(/\.wav$/, '');
    if (!SOUNDS.has(name)) return json(res, 404, { error: 'none' });
    const file = path.join(AUDIO, name + '.wav');
    const stat = fs.statSync(file);
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': stat.size, 'Cache-Control': 'private, max-age=86400' });
    return fs.createReadStream(file).pipe(res);
  }

  if (req.method === 'GET') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    }
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(405); res.end();
});

server.listen(PORT, () => console.log(`Calm sounds running on http://localhost:${PORT}`));
