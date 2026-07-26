'use strict';

/* Extra smoke tests: file upload/download + HTTPS (self-signed). */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'smoketest123';
let failures = 0;

function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' - ' + detail : ''));
  if (!ok) failures++;
}

function startServer(extraEnv) {
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, WEBTERM_PASSWORD: PASSWORD, ...extraEnv }
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 15000);
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('listening on')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('server exited early with code ' + code + '\n' + out));
    });
  });
}

function request(lib, opts, body) {
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(lib, port, agentOpts) {
  const res = await request(lib, {
    host: '127.0.0.1', port, path: '/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }, ...agentOpts
  }, JSON.stringify({ password: PASSWORD }));
  const cookie = (res.headers['set-cookie'] || [])[0];
  return cookie ? cookie.split(';')[0] : null;
}

async function main() {
  // --- HTTP server: upload/download round trip ---
  const PORT = 34568;
  let server = await startServer({ PORT: String(PORT) });
  try {
    const cookie = await login(http, PORT);
    check('login for file tests', !!cookie);

    const name = 'webterm-smoke-' + process.pid + '.txt';
    const content = 'upload-roundtrip-' + Date.now();

    let res = await request(http, {
      host: '127.0.0.1', port: PORT, method: 'POST',
      path: '/api/upload?name=' + encodeURIComponent(name),
      headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' }
    }, content);
    let data = JSON.parse(res.body.toString());
    check('upload file', res.status === 200 && data.ok, JSON.stringify(data));
    const uploaded = path.join(os.homedir(), name);
    check('uploaded file on disk with content', fs.existsSync(uploaded) && fs.readFileSync(uploaded, 'utf8') === content);

    res = await request(http, {
      host: '127.0.0.1', port: PORT, method: 'GET',
      path: '/api/download?path=' + encodeURIComponent('~/' + name),
      headers: { Cookie: cookie }
    });
    check('download returns same content', res.status === 200 && res.body.toString() === content);

    res = await request(http, {
      host: '127.0.0.1', port: PORT, method: 'GET',
      path: '/api/download?path=' + encodeURIComponent('~/does-not-exist-' + process.pid),
      headers: { Cookie: cookie }
    });
    check('download of missing file -> 404', res.status === 404);

    res = await request(http, {
      host: '127.0.0.1', port: PORT, method: 'POST',
      path: '/api/upload?name=x.txt'
    }, 'nope');
    check('upload without auth rejected', res.status === 401);

    // Path traversal in name must be flattened to a basename.
    res = await request(http, {
      host: '127.0.0.1', port: PORT, method: 'POST',
      path: '/api/upload?name=' + encodeURIComponent('../../evil-' + process.pid + '.txt'),
      headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' }
    }, 'x');
    data = JSON.parse(res.body.toString());
    const evilName = 'evil-' + process.pid + '.txt';
    const flattened = res.status === 200 && data.path === path.join(os.homedir(), evilName);
    check('upload name traversal flattened to basename', flattened, data.path || String(res.status));
    fs.rmSync(uploaded, { force: true });
    fs.rmSync(path.join(os.homedir(), evilName), { force: true });
  } finally {
    server.kill('SIGTERM');
  }

  // --- HTTPS server with self-signed cert ---
  const SPORT = 34569;
  server = await startServer({ PORT: String(SPORT), WEBTERM_TLS: 'selfsigned' });
  try {
    const agentOpts = { rejectUnauthorized: false };
    const res = await request(https, {
      host: '127.0.0.1', port: SPORT, path: '/login', method: 'GET', ...agentOpts
    });
    check('HTTPS serves login page', res.status === 200 && res.body.toString().includes('WebTerm'));
    const cookie = await login(https, SPORT, agentOpts);
    check('HTTPS login works', !!cookie);
  } finally {
    server.kill('SIGTERM');
  }

  console.log(failures === 0 ? 'ALL EXTRA TESTS PASSED' : failures + ' EXTRA TESTS FAILED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FAIL exception:', err.message);
  process.exit(1);
});
