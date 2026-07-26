'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function loadConfig() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    dataDir,
    passwordHashFile: path.join(dataDir, 'password.hash'),
    sessionSecretFile: path.join(dataDir, 'session.secret'),
    shell: process.env.WEBTERM_SHELL || process.env.SHELL || '/bin/bash',
    scrollbackBytes: 200 * 1024,
    uploadDir: process.env.WEBTERM_UPLOAD_DIR || os.homedir(),
    maxUploadBytes: (parseInt(process.env.WEBTERM_MAX_UPLOAD_MB) || 1024) * 1024 * 1024,
    tlsCertFile: process.env.WEBTERM_TLS_CERT || '',
    tlsKeyFile: process.env.WEBTERM_TLS_KEY || '',
    tlsSelfSigned: process.env.WEBTERM_TLS === 'selfsigned'
  };
}

function getSessionSecret(config) {
  if (fs.existsSync(config.sessionSecretFile)) {
    const secret = fs.readFileSync(config.sessionSecretFile, 'utf8').trim();
    if (secret) return secret;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(config.sessionSecretFile, secret, { mode: 0o600 });
  return secret;
}

module.exports = { loadConfig, getSessionSecret };
