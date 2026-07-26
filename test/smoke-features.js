#!/usr/bin/env node
'use strict';

// WebTerm v2 feature smoke test: boots the real server and exercises session
// rename, the sessions API v2 fields, /api/browse, uploads with &dir=,
// session recording (.cast), and auth gating of the new endpoints.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 20000 + Math.floor(Math.random() * 20000);
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

function request(method, reqPath, { body, rawBody, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    let payload = null;
    if (rawBody !== undefined) {
      payload = rawBody;
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Length'] = Buffer.byteLength(payload);
    } else if (body !== undefined) {
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

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
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
    env: {
      ...process.env,
      PORT: String(PORT),
      WEBTERM_PASSWORD: PASSWORD,
      WEBTERM_UPLOAD_DIR: '', // falsy -> defaults to the home directory
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rand = crypto.randomBytes(4).toString('hex');
  const home = os.homedir();
  const markerName = `webterm-smoke-marker-${rand}.txt`;
  const uploadDirName = `webterm-smoke-dir-${rand}`;
  let ws = null;

  try {
    await waitForListen(child, 15000);
    console.log(`server started on port ${PORT}`);

    // 1) New endpoints require auth
    {
      const rename = await request('POST', '/api/sessions/abc/rename', { body: { title: 'x' } });
      const browse = await request('GET', '/api/browse');
      const recs = await request('GET', '/api/recordings');
      const ok = rename.status === 401 && browse.status === 401 && recs.status === 401;
      report('1) rename/browse/recordings without cookie -> 401', ok,
        `got ${rename.status}/${browse.status}/${recs.status}`);
    }

    // 2) Login
    let cookie = null;
    {
      const res = await request('POST', '/login', { body: { password: PASSWORD } });
      const setCookie = res.headers['set-cookie'];
      const ok = res.status === 200 && Array.isArray(setCookie) && setCookie.length > 0;
      if (ok) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      report('2) POST /login -> 200 + set-cookie', ok, `got ${res.status}`);
      if (!ok) throw new Error('cannot continue without a session cookie');
    }

    // 3) Create a session over WS; keep the socket open
    let sessionId = null;
    {
      let detail = '';
      try {
        ws = await openWs(cookie);
        ws.send(JSON.stringify({ type: 'create', cols: 80, rows: 24 }));
        const created = await waitForMessage(ws, 'created');
        sessionId = created.id;
        detail = `id=${sessionId}`;
      } catch (err) {
        detail = err.message;
      }
      report('3) WS create session', Boolean(sessionId), detail);
      if (!sessionId) throw new Error('cannot continue without a session');
    }

    // 4) /api/sessions entries carry title + recording fields
    {
      const res = await request('GET', '/api/sessions', { cookie });
      const json = parseJson(res.body);
      const entry = json && Array.isArray(json.sessions)
        ? json.sessions.find((s) => s.id === sessionId)
        : null;
      const ok = Boolean(entry) &&
        entry.title === `Terminal ${sessionId}` &&
        entry.recording === false &&
        typeof entry.created === 'number';
      report('4) /api/sessions has title + recording fields', ok, res.body.slice(0, 200));
    }

    // 5) Rename the session
    {
      const res = await request('POST', `/api/sessions/${sessionId}/rename`, {
        cookie, body: { title: '  My Session  ' },
      });
      const json = parseJson(res.body);
      let ok = res.status === 200 && json && json.ok === true && json.title === 'My Session';
      let detail = `got ${res.status} ${res.body}`;
      if (ok) {
        const listRes = await request('GET', '/api/sessions', { cookie });
        const listJson = parseJson(listRes.body);
        const entry = listJson && listJson.sessions.find((s) => s.id === sessionId);
        ok = Boolean(entry) && entry.title === 'My Session';
        detail = ok ? 'title persisted' : `list shows ${entry && entry.title}`;
      }
      report('5) rename trims + persists in /api/sessions', ok, detail);
    }

    // 6) Rename error cases
    {
      const notFound = await request('POST', '/api/sessions/nope/rename', {
        cookie, body: { title: 'x' },
      });
      const empty = await request('POST', `/api/sessions/${sessionId}/rename`, {
        cookie, body: { title: '   ' },
      });
      const long = await request('POST', `/api/sessions/${sessionId}/rename`, {
        cookie, body: { title: 'x'.repeat(65) },
      });
      const ok = notFound.status === 404 && empty.status === 400 && long.status === 400;
      report('6) rename unknown id -> 404, empty/long title -> 400', ok,
        `got ${notFound.status}/${empty.status}/${long.status}`);
    }

    // 7) Browse home shows an uploaded marker file; parent null at '/'
    {
      let ok = false;
      let detail = '';
      try {
        const up = await request('POST', `/api/upload?name=${encodeURIComponent(markerName)}`, {
          cookie, rawBody: Buffer.from('marker contents\n'),
        });
        if (up.status !== 200) throw new Error(`upload got ${up.status} ${up.body}`);
        const res = await request('GET', '/api/browse', { cookie });
        const json = parseJson(res.body);
        if (!(res.status === 200 && json && json.path === home && Array.isArray(json.entries))) {
          throw new Error(`browse home got ${res.status} ${res.body.slice(0, 200)}`);
        }
        const entry = json.entries.find((e) => e.name === markerName);
        if (!(entry && entry.type === 'file' && entry.size > 0)) {
          throw new Error('marker entry missing from home listing');
        }
        const rootRes = await request('GET', '/api/browse?path=%2F', { cookie });
        const rootJson = parseJson(rootRes.body);
        if (!(rootRes.status === 200 && rootJson && rootJson.parent === null)) {
          throw new Error(`browse / parent not null: ${rootRes.body.slice(0, 120)}`);
        }
        ok = true;
        detail = 'marker listed, / has null parent';
      } catch (err) {
        detail = err.message;
      }
      report('7) browse home lists uploaded marker; parent null at /', ok, detail);
    }

    // 8) Browse a file path -> 400
    {
      const res = await request(
        'GET',
        `/api/browse?path=${encodeURIComponent('~/' + markerName)}`,
        { cookie }
      );
      report('8) browse non-directory -> 400', res.status === 400, `got ${res.status}`);
    }

    // 9) Upload with &dir= into a fresh subdir of home
    {
      let ok = false;
      let detail = '';
      try {
        const res = await request(
          'POST',
          `/api/upload?name=inner.txt&dir=${encodeURIComponent('~/' + uploadDirName)}`,
          { cookie, rawBody: Buffer.from('dir upload\n') }
        );
        const json = parseJson(res.body);
        const dest = path.join(home, uploadDirName, 'inner.txt');
        ok = res.status === 200 && json && json.ok === true && fs.existsSync(dest);
        detail = ok ? `wrote ${dest}` : `got ${res.status} ${res.body}`;
      } catch (err) {
        detail = err.message;
      }
      report('9) upload with &dir= lands in the target subdir', ok, detail);
    }

    // 10) Recording lifecycle
    const recMarker = `RECMARKER_${rand}`;
    let castName = null;
    {
      let ok = false;
      let detail = '';
      try {
        const badStart = await request('POST', '/api/sessions/nope/record/start', { cookie });
        if (badStart.status !== 404) throw new Error(`start unknown id got ${badStart.status}`);
        const badStop = await request('POST', `/api/sessions/${sessionId}/record/stop`, { cookie });
        if (badStop.status !== 409) throw new Error(`stop while idle got ${badStop.status}`);

        const start = await request('POST', `/api/sessions/${sessionId}/record/start`, { cookie });
        const startJson = parseJson(start.body);
        if (!(start.status === 200 && startJson && startJson.ok === true &&
              typeof startJson.file === 'string' && startJson.file.endsWith('.cast'))) {
          throw new Error(`start got ${start.status} ${start.body}`);
        }
        castName = startJson.file;

        const dupStart = await request('POST', `/api/sessions/${sessionId}/record/start`, { cookie });
        if (dupStart.status !== 409) throw new Error(`double start got ${dupStart.status}`);

        const list = await request('GET', '/api/sessions', { cookie });
        const listJson = parseJson(list.body);
        const entry = listJson && listJson.sessions.find((s) => s.id === sessionId);
        if (!(entry && entry.recording === true)) throw new Error('recording flag not true');

        ws.send(JSON.stringify({ type: 'input', data: `echo ${recMarker}\n` }));
        await sleep(1500);

        const stop = await request('POST', `/api/sessions/${sessionId}/record/stop`, { cookie });
        const stopJson = parseJson(stop.body);
        if (!(stop.status === 200 && stopJson && stopJson.ok === true && stopJson.file === castName)) {
          throw new Error(`stop got ${stop.status} ${stop.body}`);
        }
        ok = true;
        detail = `file=${castName}`;
      } catch (err) {
        detail = err.message;
      }
      report('10) record start/stop lifecycle (409/404 cases)', ok, detail);
    }

    // 11) Recording file is listed, downloadable, valid asciinema v2, deletable
    {
      let ok = false;
      let detail = '';
      try {
        if (!castName) throw new Error('no recording from previous step');
        const list = await request('GET', '/api/recordings', { cookie });
        const listJson = parseJson(list.body);
        const entry = listJson && Array.isArray(listJson.recordings)
          ? listJson.recordings.find((r) => r.name === castName)
          : null;
        if (!(entry && entry.size > 0 && typeof entry.mtime === 'number')) {
          throw new Error('recording not in /api/recordings');
        }

        const badName = await request('GET', '/api/recordings/evil.txt', { cookie });
        if (badName.status !== 400) throw new Error(`non-.cast name got ${badName.status}`);
        const missing = await request('GET', '/api/recordings/nope.cast', { cookie });
        if (missing.status !== 404) throw new Error(`missing recording got ${missing.status}`);

        const cast = await request('GET', `/api/recordings/${encodeURIComponent(castName)}`, { cookie });
        if (cast.status !== 200) throw new Error(`download got ${cast.status}`);
        const lines = cast.body.split('\n').filter(Boolean);
        const header = parseJson(lines[0]);
        if (!(header && header.version === 2 && header.width === 80 && header.height === 24 &&
              typeof header.timestamp === 'number')) {
          throw new Error(`bad header line: ${lines[0]}`);
        }
        if (!cast.body.includes(recMarker)) throw new Error('marker missing from cast output');
        const event = parseJson(lines[1]);
        if (!(Array.isArray(event) && typeof event[0] === 'number' && event[1] === 'o' &&
              typeof event[2] === 'string')) {
          throw new Error(`bad event line: ${lines[1]}`);
        }

        const del = await request('DELETE', `/api/recordings/${encodeURIComponent(castName)}`, { cookie });
        const delJson = parseJson(del.body);
        if (!(del.status === 200 && delJson && delJson.ok === true)) {
          throw new Error(`delete got ${del.status}`);
        }
        const delAgain = await request('DELETE', `/api/recordings/${encodeURIComponent(castName)}`, { cookie });
        if (delAgain.status !== 404) throw new Error(`second delete got ${delAgain.status}`);
        ok = true;
        detail = 'header valid, marker captured, delete works';
      } catch (err) {
        detail = err.message;
      }
      report('11) recording listed, valid .cast content, delete', ok, detail);
    }

    // 12) Kill the session
    {
      let ok = false;
      let detail = '';
      try {
        ws.send(JSON.stringify({ type: 'kill' }));
        await waitForMessage(ws, 'exit');
        ok = true;
      } catch (err) {
        detail = err.message;
      }
      report('12) kill session -> exit', ok, detail);
    }
  } catch (err) {
    report('fatal', false, err.message);
  } finally {
    if (ws) ws.terminate();
    // Clean up test artifacts written to the real home directory.
    try { fs.unlinkSync(path.join(home, markerName)); } catch (_) {}
    try { fs.rmSync(path.join(home, uploadDirName), { recursive: true, force: true }); } catch (_) {}
    child.kill('SIGTERM');
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
