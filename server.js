'use strict';

const http = require('http');
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

  app.use(express.json());
  app.use(sessionMiddleware);

  // Static and vendor mounts (no auth required)
  const root = __dirname;
  app.use('/static', express.static(path.join(root, 'public')));
  app.use('/vendor/xterm', express.static(path.join(root, 'node_modules', '@xterm', 'xterm')));
  app.use('/vendor/addon-fit', express.static(path.join(root, 'node_modules', '@xterm', 'addon-fit')));
  app.use('/vendor/addon-web-links', express.static(path.join(root, 'node_modules', '@xterm', 'addon-web-links')));

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
    res.json({ sessions: ptyManager.list() });
  });

  const server = http.createServer(app);
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

  server.listen(config.port, config.host, () => {
    console.log(`WebTerm listening on http://${config.host}:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start WebTerm:', err);
  process.exit(1);
});
