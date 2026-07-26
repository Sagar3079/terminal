'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Expand ~ and resolve relative paths against the home directory.
function resolveUserPath(p) {
  if (!p) return null;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (path.isAbsolute(p)) return path.normalize(p);
  return path.join(os.homedir(), p);
}

// POST /api/upload?name=<filename> — raw request body streamed to disk.
function handleUpload(req, res, config) {
  const rawName = typeof req.query.name === 'string' ? req.query.name : '';
  const name = path.basename(rawName).trim();
  if (!name || name === '.' || name === '..') {
    return res.status(400).json({ error: 'Missing or invalid ?name= filename' });
  }

  const declared = parseInt(req.headers['content-length'], 10);
  if (Number.isFinite(declared) && declared > config.maxUploadBytes) {
    return res.status(413).json({ error: 'File too large' });
  }

  const destDir = config.uploadDir;
  let dest;
  try {
    fs.mkdirSync(destDir, { recursive: true });
    dest = path.join(destDir, name);
  } catch (err) {
    return res.status(500).json({ error: 'Cannot create upload directory' });
  }

  const tmp = dest + '.uploading-' + process.pid;
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  let received = 0;
  let failed = false;

  const abort = (status, message) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.unlink(tmp, () => {});
    if (!res.headersSent) res.status(status).json({ error: message });
    req.destroy();
  };

  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > config.maxUploadBytes) abort(413, 'File too large');
  });
  req.on('error', () => abort(500, 'Upload interrupted'));
  out.on('error', () => abort(500, 'Failed to write file'));

  out.on('finish', () => {
    if (failed) return;
    try {
      fs.renameSync(tmp, dest);
    } catch (err) {
      return abort(500, 'Failed to save file');
    }
    res.json({ ok: true, path: dest, bytes: received });
  });

  req.pipe(out);
}

// GET /api/download?path=<file> — send a file from disk.
function handleDownload(req, res) {
  const resolved = resolveUserPath(typeof req.query.path === 'string' ? req.query.path.trim() : '');
  if (!resolved) {
    return res.status(400).json({ error: 'Missing ?path=' });
  }
  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(resolved, path.basename(resolved), (dlErr) => {
      if (dlErr && !res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' });
      }
    });
  });
}

module.exports = { handleUpload, handleDownload, resolveUserPath };
