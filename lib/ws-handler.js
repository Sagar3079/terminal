'use strict';

// WebSocket protocol handler. Each socket is bound to at most one PTY
// session (the one it created or attached). PTY sessions survive socket
// disconnects; they die only on shell exit or an explicit kill.

function toDim(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : fallback;
}

function handleConnection(ws, ptyManager) {
  let sessionId = null;
  let handle = null;

  function send(msg) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        // Socket may be tearing down; nothing useful to do.
      }
    }
  }

  function bind(id) {
    const attached = ptyManager.attach(id, {
      onData: (data) => send({ type: 'output', data }),
      onExit: () => {
        // Session is gone; nothing left to detach on close.
        sessionId = null;
        handle = null;
        send({ type: 'exit' });
      },
    });
    if (!attached) return null;
    sessionId = id;
    handle = attached.handle;
    return attached;
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return; // ignore malformed frames
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'create': {
        if (sessionId) {
          send({ type: 'error', message: 'Already bound to a session' });
          return;
        }
        const cols = toDim(msg.cols, 80);
        const rows = toDim(msg.rows, 24);
        const { id } = ptyManager.create(cols, rows);
        if (!bind(id)) {
          send({ type: 'error', message: 'Session not found' });
          return;
        }
        send({ type: 'created', id });
        break;
      }

      case 'attach': {
        if (sessionId) {
          send({ type: 'error', message: 'Already bound to a session' });
          return;
        }
        if (typeof msg.id !== 'string') {
          send({ type: 'error', message: 'Session not found' });
          return;
        }
        const attached = bind(msg.id);
        if (!attached) {
          send({ type: 'error', message: 'Session not found' });
          return;
        }
        ptyManager.resize(sessionId, toDim(msg.cols, 80), toDim(msg.rows, 24));
        send({ type: 'attached', id: sessionId, buffer: attached.buffer });
        break;
      }

      case 'input': {
        if (sessionId && typeof msg.data === 'string') {
          ptyManager.write(sessionId, msg.data);
        }
        break;
      }

      case 'resize': {
        if (sessionId) {
          ptyManager.resize(sessionId, toDim(msg.cols, 80), toDim(msg.rows, 24));
        }
        break;
      }

      case 'kill': {
        if (sessionId) {
          // PTY exit will fire onExit, which sends {type:'exit'} and unbinds.
          ptyManager.kill(sessionId);
        }
        break;
      }

      default:
        break; // ignore unknown message types
    }
  });

  ws.on('close', () => {
    // Detach listeners only — the PTY keeps running for reconnect.
    if (sessionId && handle) {
      ptyManager.detach(sessionId, handle);
    }
    sessionId = null;
    handle = null;
  });

  ws.on('error', () => {
    // 'close' follows and performs cleanup.
  });
}

module.exports = { handleConnection };
