'use strict';

// Session recorder: taps a PTY session's output stream via PtyManager.attach
// and writes an asciinema v2 (.cast) file. One recording per session at a
// time; a recording auto-stops when its session exits or is killed.

const fs = require('fs');
const path = require('path');

function timestampName(date) {
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return (
    p(date.getFullYear(), 4) +
    p(date.getMonth() + 1) +
    p(date.getDate()) +
    '-' +
    p(date.getHours()) +
    p(date.getMinutes()) +
    p(date.getSeconds())
  );
}

class Recorder {
  constructor(config) {
    this.config = config;
    this.recordingsDir = path.join(config.dataDir, 'recordings');
    // session id -> { name, file, stream, handle, ptyManager }
    this.active = new Map();
  }

  // Returns {file:<basename>} on success, null if the session does not exist
  // (or the recordings dir cannot be created). Caller checks isRecording()
  // first for the already-recording case.
  start(id, ptyManager) {
    if (this.active.has(id)) return null;
    try {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    } catch (_) {
      return null;
    }

    const startTime = Date.now();
    const name = timestampName(new Date(startTime)) + '-' + id + '.cast';
    const file = path.join(this.recordingsDir, name);
    const rec = { name, file, stream: null, handle: null, ptyManager };

    // Attach before touching the disk so an unknown session creates no file.
    // start() is synchronous, so rec.stream is set before any pty data event
    // can fire the onData callback.
    const attached = ptyManager.attach(id, {
      onData: (data) => {
        if (!rec.stream) return;
        // Manual array construction keeps the 3-decimal timestamp intact.
        const t = ((Date.now() - startTime) / 1000).toFixed(3);
        rec.stream.write('[' + t + ',"o",' + JSON.stringify(data) + ']\n');
      },
      onExit: () => {
        this.stop(id);
      },
    });
    if (!attached) return null;
    rec.handle = attached.handle;

    rec.stream = fs.createWriteStream(file);
    rec.stream.on('error', () => {
      // Disk errors must not crash the server; the recording is just lost.
    });
    rec.stream.write(
      JSON.stringify({
        version: 2,
        width: 80,
        height: 24,
        timestamp: Math.floor(startTime / 1000),
      }) + '\n'
    );

    this.active.set(id, rec);
    return { file: name };
  }

  // Returns {file:<basename>} or null if the session was not recording.
  stop(id) {
    const rec = this.active.get(id);
    if (!rec) return null;
    this.active.delete(id);
    rec.ptyManager.detach(id, rec.handle);
    try {
      rec.stream.end();
    } catch (_) {
      // stream may already be destroyed
    }
    return { file: rec.name };
  }

  isRecording(id) {
    return this.active.has(id);
  }

  // Newest first.
  list() {
    let names;
    try {
      names = fs.readdirSync(this.recordingsDir);
    } catch (_) {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.cast')) continue;
      try {
        const st = fs.statSync(path.join(this.recordingsDir, name));
        out.push({ name, size: st.size, mtime: st.mtimeMs });
      } catch (_) {
        // raced with a delete; skip
      }
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  }

  stopAll() {
    for (const id of Array.from(this.active.keys())) {
      this.stop(id);
    }
  }
}

module.exports = { Recorder };
