'use strict';

const os = require('os');
const crypto = require('crypto');
const pty = require('node-pty');

class PtyManager {
  constructor(config) {
    this.config = config;
    // id -> { id, proc, title, created, buffer, listeners:Set<{onData,onExit}> }
    this.sessions = new Map();
  }

  create(cols, rows) {
    const id = crypto.randomBytes(4).toString('hex');
    const proc = pty.spawn(this.config.shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const session = {
      id,
      proc,
      title: 'Terminal ' + id,
      created: Date.now(),
      buffer: '',
      listeners: new Set(),
    };
    this.sessions.set(id, session);

    proc.onData((data) => {
      session.buffer += data;
      // Trim scrollback to the configured byte budget (approximate: JS string length)
      const max = this.config.scrollbackBytes;
      if (session.buffer.length > max) {
        session.buffer = session.buffer.slice(session.buffer.length - max);
      }
      for (const l of session.listeners) {
        try {
          l.onData(data);
        } catch (_) {
          // listener errors must not break output fan-out
        }
      }
    });

    proc.onExit(() => {
      this.sessions.delete(id);
      for (const l of session.listeners) {
        try {
          l.onExit();
        } catch (_) {
          // ignore listener errors during teardown
        }
      }
      session.listeners.clear();
    });

    return { id };
  }

  attach(id, { onData, onExit }) {
    const session = this.sessions.get(id);
    if (!session) return null;
    const handle = { onData, onExit };
    session.listeners.add(handle);
    return { buffer: session.buffer, handle };
  }

  detach(id, handle) {
    const session = this.sessions.get(id);
    if (session && handle) session.listeners.delete(handle);
  }

  write(id, data) {
    const session = this.sessions.get(id);
    if (session) session.proc.write(data);
  }

  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      session.proc.resize(cols, rows);
    } catch (_) {
      // resize can throw if the pty is mid-exit; safe to ignore
    }
  }

  kill(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      session.proc.kill();
    } catch (_) {
      // already dead
    }
  }

  setTitle(id, title) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.title = String(title);
    return true;
  }

  list() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      created: s.created,
    }));
  }
}

module.exports = { PtyManager };
