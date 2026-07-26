'use strict';

const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { getSessionSecret } = require('./config');

const BCRYPT_ROUNDS = 12;
const RATE_LIMIT_MAX_FAILURES = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function createSessionMiddleware(config) {
  return session({
    secret: getSessionSecret(config),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
    },
  });
}

function isPasswordSet(config) {
  try {
    const stat = fs.statSync(config.passwordHashFile);
    return stat.isFile() && stat.size > 0;
  } catch (err) {
    return false;
  }
}

async function setPassword(config, plain) {
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  fs.writeFileSync(config.passwordHashFile, hash, { mode: 0o600 });
}

async function verifyPassword(config, plain) {
  let hash;
  try {
    hash = fs.readFileSync(config.passwordHashFile, 'utf8').trim();
  } catch (err) {
    return false;
  }
  if (!hash || typeof plain !== 'string') return false;
  return bcrypt.compare(plain, hash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.path.startsWith('/api')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login');
}

// In-memory per-IP failure tracker: max 5 failures per 15 minutes.
const failures = new Map(); // ip -> [failure timestamps]

function prune(ip) {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (list.length === 0) {
    failures.delete(ip);
  } else {
    failures.set(ip, list);
  }
  return list;
}

const rateLimit = {
  check(ip) {
    return prune(ip).length < RATE_LIMIT_MAX_FAILURES;
  },
  recordFailure(ip) {
    const list = prune(ip);
    list.push(Date.now());
    failures.set(ip, list);
  },
  recordSuccess(ip) {
    failures.delete(ip);
  },
};

module.exports = {
  createSessionMiddleware,
  isPasswordSet,
  setPassword,
  verifyPassword,
  requireAuth,
  rateLimit,
};
