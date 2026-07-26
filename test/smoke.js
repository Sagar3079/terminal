#!/usr/bin/env node
'use strict';

// WebTerm smoke test: boots the real server as a child process and exercises
// login, auth gating, the sessions API, and the WebSocket terminal protocol.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const PORT = 34567;
const HOST = '127.0.0.1';
const PASSWORD = 'smoketest123';
const ROOT = path.join(__dirname, '..');

let passCount = 0;
let failCount = 0;

function report(step, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passCount++; else failCount++;
  console.log(`${status} ${step}${detail ? ' - ' + detail : ''}`);
}

function request(method, reqPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    let payload = null;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers['Cookie'] = cookie;
    const req = http.request(
      { host: HOST, port: PORT, path: reqPath, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        }));
      }
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForListen(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      reject(new Error(`server did not start within ${timeoutMs}ms. Output so far:\n${buf}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buf += chunk.toString();
      if (/listening on/i.test(buf)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { buf += chunk.toString(); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}. Output:\n${buf}`));
    });
  });
}

// Opens a WebSocket and resolves once open; rejects on error/close before open.
function openWs(cookie) {
  return new Promise((resolve, reject) => {
    const headers = cookie ? { Cookie: cookie } : {};
    const ws = new WebSocket(`ws://${HOST}:${PORT}/ws`, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WebSocket open timeout'));
    }, 5000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    ws.on('close', () => { clearTimeout(timer); reject(new Error('closed before open')); });
  });
}

// Waits for the next message of the given type, buffering others is not
// needed for this test; unrelated messages are skipped.
function waitForMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`timed out waiting for {type:'${type}'}`));
    }, timeoutMs);
    const onMessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg && msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
  });
}

async function main() {
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WEBTERM_PASSWORD: PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForListen(child, 15000);
    console.log('server started');

    // 1) Wrong password -> 401
    {
      const res = await request('POST', '/login', { body: { password: 'wrong-password' } });
      report('1) POST /login wrong password -> 401', res.status === 401, `got ${res.status}`);
    }

    // 2) Correct password -> 200 + set-cookie
    let cookie = null;
    {
      const res = await request('POST', '/login', { body: { password: PASSWORD } });
      const setCookie = res.headers['set-cookie'];
      const ok = res.status === 200 && Array.isArray(setCookie) && setCookie.length > 0;
      if (ok) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      report('2) POST /login correct password -> 200 + set-cookie', ok, `got ${res.status}`);
      if (!ok) throw new Error('cannot continue without a session cookie');
    }

    // 3) GET / auth gating
    {
      const noAuth = await request('GET', '/');
      const authed = await request('GET', '/', { cookie });
      const ok = noAuth.status === 302 &&
        authed.status === 200 &&
        authed.body.includes('WebTerm');
      report('3) GET / redirects without cookie, serves app with cookie', ok,
        `no-cookie ${noAuth.status}, cookie ${authed.status}`);
    }

    // 4) /api/sessions -> {sessions:[]}
    {
      const res = await request('GET', '/api/sessions', { cookie });
      let ok = false;
      let detail = `got ${res.status}`;
      if (res.status === 200) {
        try {
          const json = JSON.parse(res.body);
          ok = Array.isArray(json.sessions) && json.sessions.length === 0;
          detail = `body ${res.body}`;
        } catch {
          detail = 'invalid JSON';
        }
      }
      report('4) GET /api/sessions -> {sessions:[]}', ok, detail);
    }

    // 5) WebSocket without cookie must be rejected
    {
      let ok = false;
      try {
        const ws = await openWs(null);
        ws.terminate();
      } catch {
        ok = true;
      }
      report('5) WebSocket without cookie rejected', ok);
    }

    // 6) Create a session, run a command, expect its output
    let sessionId = null;
    {
      let ok = false;
      let detail = '';
      try {
        const ws = await openWs(cookie);
        let output = '';
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'output') output += msg.data;
          } catch { /* ignore */ }
        });
        ws.send(JSON.stringify({ type: 'create', cols: 80, rows: 24 }));
        const created = await waitForMessage(ws, 'created');
        sessionId = created.id;
        ws.send(JSON.stringify({ type: 'input', data: 'echo SMOKE_OK\n' }));
        await sleep(2000);
        ok = Boolean(sessionId) && /SMOKE_OK/.test(output);
        detail = `id=${sessionId}, output ${ok ? 'contains' : 'missing'} SMOKE_OK`;
        ws.close();
        await sleep(200); // let the server detach before re-attaching
      } catch (err) {
        detail = err.message;
      }
      report('6) create session + echo SMOKE_OK', ok, detail);
    }

    // 7) Re-attach on a fresh socket; scrollback must contain SMOKE_OK
    let ws2 = null;
    {
      let ok = false;
      let detail = '';
      try {
        ws2 = await openWs(cookie);
        ws2.send(JSON.stringify({ type: 'attach', id: sessionId, cols: 80, rows: 24 }));
        const attached = await waitForMessage(ws2, 'attached');
        ok = attached.id === sessionId &&
          typeof attached.buffer === 'string' &&
          attached.buffer.includes('SMOKE_OK');
        detail = ok ? 'buffer replayed' : 'buffer missing SMOKE_OK';
      } catch (err) {
        detail = err.message;
      }
      report('7) re-attach replays scrollback with SMOKE_OK', ok, detail);
    }

    // 8) Kill the session
    {
      let ok = false;
      let detail = '';
      try {
        if (!ws2 || ws2.readyState !== WebSocket.OPEN) throw new Error('no open socket');
        ws2.send(JSON.stringify({ type: 'kill' }));
        await waitForMessage(ws2, 'exit');
        ok = true;
      } catch (err) {
        detail = err.message;
      }
      if (ws2) ws2.terminate();
      report('8) kill session -> exit', ok, detail);
    }
  } catch (err) {
    report('fatal', false, err.message);
  } finally {
    child.kill('SIGTERM');
    // Give it a moment, then force-kill if still alive.
    await sleep(500);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FAIL unexpected error -', err);
  process.exit(1);
});
