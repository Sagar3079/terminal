'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { loadConfig } = require('./lib/config');
const {
  createSessionMiddleware,
  isPasswordSet,
  setPassword,
  verifyPassword,
  requireAuth,
  rateLimit
} = require('./lib/auth');
const { PtyManager } = require('./lib/pty-manager');
const { handleConnection } = require('./lib/ws-handler');
const { handleUpload, handleDownload, resolveUserPath } = require('./lib/files');
const { handleBrowse } = require('./lib/browse');
const { Recorder } = require('./lib/recorder');
const { loadTlsOptions } = require('./lib/tls');

// Recording names come from URLs: basename-flatten and require the .cast
// extension so requests can never reach outside the recordings directory.
function safeCastName(raw) {
  const name = path.basename(String(raw || ''));
  if (name.length <= 5 || !name.endsWith('.cast')) return null;
  return name;
}

async function main() {
  const config = loadConfig();

  if (!isPasswordSet(config)) {
    if (process.env.WEBTERM_PASSWORD) {
      await setPassword(config, process.env.WEBTERM_PASSWORD);
      console.log('Password set from WEBTERM_PASSWORD environment variable.');
    } else {
      console.error('No password is set for WebTerm.');
      console.error('Set one before starting the server, either:');
      console.error('  1) Run: node bin/set-password.js');
      console.error('  2) Or start with the WEBTERM_PASSWORD environment variable set.');
      process.exit(1);
    }
  }

  const app = express();
  const sessionMiddleware = createSessionMiddleware(config);
  const ptyManager = new PtyManager(config);
  const recorder = new Recorder(config);

  app.use(express.json());
  app.use(sessionMiddleware);

  // Static and vendor mounts (no auth required)
  const root = __dirname;
  app.use('/static', express.static(path.join(root, 'public')));
  app.use('/vendor/xterm', express.static(path.join(root, 'node_modules', '@xterm', 'xterm')));
  app.use('/vendor/addon-fit', express.static(path.join(root, 'node_modules', '@xterm', 'addon-fit')));
  app.use('/vendor/addon-web-links', express.static(path.join(root, 'node_modules', '@xterm', 'addon-web-links')));
  app.use('/vendor/addon-search', express.static(path.join(root, 'node_modules', '@xterm', 'addon-search')));
  app.use('/vendor/addon-webgl', express.static(path.join(root, 'node_modules', '@xterm', 'addon-webgl')));
  app.use('/vendor/fonts-jetbrains-mono', express.static(path.join(root, 'node_modules', '@fontsource', 'jetbrains-mono')));
  app.use('/vendor/fonts-fira-code', express.static(path.join(root, 'node_modules', '@fontsource', 'fira-code')));

  // PWA assets must live at root scope and be reachable before login.
  const sendPublicFile = (res, file, headers) => {
    res.sendFile(file, headers ? { headers } : undefined, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  };
  app.get('/sw.js', (req, res) => {
    sendPublicFile(res, path.join(root, 'public', 'sw.js'));
  });
  app.get('/manifest.webmanifest', (req, res) => {
    sendPublicFile(res, path.join(root, 'public', 'manifest.webmanifest'), {
      'Content-Type': 'application/manifest+json',
    });
  });
  app.get('/icons/icon.svg', (req, res) => {
    sendPublicFile(res, path.join(root, 'public', 'icons', 'icon.svg'));
  });

  app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect('/');
    }
    res.sendFile(path.join(root, 'public', 'login.html'));
  });

  app.post('/login', async (req, res) => {
    const ip = req.ip;
    if (!rateLimit.check(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    let ok = false;
    try {
      ok = await verifyPassword(config, password);
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      rateLimit.recordFailure(ip);
      return res.status(401).json({ error: 'Invalid password' });
    }
    rateLimit.recordSuccess(ip);
    req.session.authenticated = true;
    res.json({ ok: true });
  });

  app.post('/logout', (req, res) => {
    if (req.session) {
      req.session.destroy(() => res.json({ ok: true }));
    } else {
      res.json({ ok: true });
    }
  });

  app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(root, 'public', 'index.html'));
  });

  app.get('/api/sessions', requireAuth, (req, res) => {
    const sessions = ptyManager.list().map((s) => ({
      ...s,
      recording: recorder.isRecording(s.id),
    }));
    res.json({ sessions });
  });

  app.post('/api/sessions/:id/rename', requireAuth, (req, res) => {
    const title = req.body && typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 64) {
      return res.status(400).json({ error: 'Title must be 1-64 characters' });
    }
    if (!ptyManager.setTitle(req.params.id, title)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ ok: true, title });
  });

  app.get('/api/browse', requireAuth, (req, res) => handleBrowse(req, res));

  app.post('/api/upload', requireAuth, (req, res) => {
    // Optional &dir= overrides the destination directory (file browser uploads).
    const dir = typeof req.query.dir === 'string' ? req.query.dir.trim() : '';
    const dest = dir ? resolveUserPath(dir) : null;
    handleUpload(req, res, dest ? { ...config, uploadDir: dest } : config);
  });
  app.get('/api/download', requireAuth, (req, res) => handleDownload(req, res));

  app.post('/api/sessions/:id/record/start', requireAuth, (req, res) => {
    const id = req.params.id;
    if (recorder.isRecording(id)) {
      return res.status(409).json({ error: 'Already recording' });
    }
    const started = recorder.start(id, ptyManager);
    if (!started) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ ok: true, file: started.file });
  });

  app.post('/api/sessions/:id/record/stop', requireAuth, (req, res) => {
    const stopped = recorder.stop(req.params.id);
    if (!stopped) {
      return res.status(409).json({ error: 'Not recording' });
    }
    res.json({ ok: true, file: stopped.file });
  });

  app.get('/api/recordings', requireAuth, (req, res) => {
    res.json({ recordings: recorder.list() });
  });

  app.get('/api/recordings/:name', requireAuth, (req, res) => {
    const name = safeCastName(req.params.name);
    if (!name) return res.status(400).json({ error: 'Invalid recording name' });
    const file = path.join(recorder.recordingsDir, name);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      res.sendFile(file, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }, (sendErr) => {
        if (sendErr && !res.headersSent) res.status(404).end();
      });
    });
  });

  app.delete('/api/recordings/:name', requireAuth, (req, res) => {
    const name = safeCastName(req.params.name);
    if (!name) return res.status(400).json({ error: 'Invalid recording name' });
    fs.unlink(path.join(recorder.recordingsDir, name), (err) => {
      if (err) return res.status(404).json({ error: 'Recording not found' });
      res.json({ ok: true });
    });
  });

  const tlsOptions = loadTlsOptions(config);
  const server = tlsOptions ? https.createServer(tlsOptions, app) : http.createServer(app);
  const scheme = tlsOptions ? 'https' : 'http';
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url ? req.url.split('?')[0] : '';
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    // Run the session middleware manually to populate req.session
    sessionMiddleware(req, {}, () => {
      if (!(req.session && req.session.authenticated)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleConnection(ws, ptyManager);
      });
    });
  });

  const shutdown = () => {
    recorder.stopAll();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(config.port, config.host, () => {
    console.log(`WebTerm listening on ${scheme}://${config.host}:${config.port}`);
    if (config.tlsSelfSigned) {
      console.log('Using a self-signed certificate — browsers will show a warning on first visit.');
    }
  });
}

main().catch((err) => {
  console.error('Failed to start WebTerm:', err);
  process.exit(1);
});
