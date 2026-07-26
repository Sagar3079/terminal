'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveUserPath } = require('./files');

const MAX_ENTRIES = 2000;

// GET /api/browse?path=<p> — directory listing for the file browser panel.
// Empty/missing path resolves to the home directory.
async function handleBrowse(req, res) {
  const raw = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  const resolved = resolveUserPath(raw) || os.homedir();

  let dirents;
  try {
    const st = await fs.promises.stat(resolved);
    if (!st.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
    dirents = await fs.promises.readdir(resolved, { withFileTypes: true });
  } catch (err) {
    return res.status(400).json({ error: 'Cannot read directory' });
  }

  const entries = await Promise.all(
    dirents.map(async (d) => {
      const entry = { name: d.name, type: 'other', size: 0, mtime: 0 };
      try {
        // stat follows symlinks; broken links land in the catch below.
        const st = await fs.promises.stat(path.join(resolved, d.name));
        entry.type = st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
        entry.size = st.size;
        entry.mtime = st.mtimeMs;
      } catch (_) {
        // Broken symlink or unreadable entry: keep type 'other', size 0.
      }
      return entry;
    })
  );

  entries.sort((a, b) => {
    const aDir = a.type === 'dir' ? 0 : 1;
    const bDir = b.type === 'dir' ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });

  const truncated = entries.length > MAX_ENTRIES;
  const parentDir = path.dirname(resolved);
  const body = {
    path: resolved,
    parent: parentDir === resolved ? null : parentDir,
    entries: truncated ? entries.slice(0, MAX_ENTRIES) : entries,
  };
  if (truncated) body.truncated = true;
  res.json(body);
}

module.exports = { handleBrowse };
