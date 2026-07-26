'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Generate a self-signed certificate into data/tls/ if one doesn't exist yet.
function ensureSelfSigned(config) {
  const tlsDir = path.join(config.dataDir, 'tls');
  const keyFile = path.join(tlsDir, 'selfsigned.key');
  const certFile = path.join(tlsDir, 'selfsigned.crt');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { keyFile, certFile };
  }

  fs.mkdirSync(tlsDir, { recursive: true });
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyFile, '-out', certFile,
      '-days', '3650',
      '-subj', '/CN=webterm.local',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(
      'Failed to generate a self-signed certificate (is openssl installed?): ' +
      (err.stderr ? err.stderr.toString() : err.message)
    );
  }
  fs.chmodSync(keyFile, 0o600);
  return { keyFile, certFile };
}

// Returns {key, cert} buffers for https.createServer, or null for plain HTTP.
function loadTlsOptions(config) {
  let keyFile = config.tlsKeyFile;
  let certFile = config.tlsCertFile;

  if (!keyFile && !certFile) {
    if (!config.tlsSelfSigned) return null;
    ({ keyFile, certFile } = ensureSelfSigned(config));
  } else if (!keyFile || !certFile) {
    throw new Error('Set both WEBTERM_TLS_CERT and WEBTERM_TLS_KEY, or neither.');
  }

  return {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile)
  };
}

module.exports = { loadTlsOptions, ensureSelfSigned };
