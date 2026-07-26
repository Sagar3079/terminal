#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../lib/config');
const { setPassword } = require('../lib/auth');

const MIN_LENGTH = 8;

// Prompt with hidden (masked) input using raw mode; no extra deps.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      // Non-interactive stdin: read a single line without masking.
      const readline = require('readline');
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\x03') {
          // Ctrl+C
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\x7f' || ch === '\b') {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        // Ignore other control characters (arrows, etc.)
        if (ch < ' ') continue;
        value += ch;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

function parseArgs(argv) {
  const idx = argv.indexOf('--password');
  if (idx !== -1) {
    const value = argv[idx + 1];
    if (value === undefined) {
      console.error('Error: --password requires a value.');
      process.exit(1);
    }
    return { password: value };
  }
  return {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  let password;
  if (args.password !== undefined) {
    password = args.password;
    if (password.length < MIN_LENGTH) {
      console.error(`Error: password must be at least ${MIN_LENGTH} characters.`);
      process.exit(1);
    }
  } else {
    password = await promptHidden('New password: ');
    if (password.length < MIN_LENGTH) {
      console.error(`Error: password must be at least ${MIN_LENGTH} characters.`);
      process.exit(1);
    }
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('Error: passwords do not match.');
      process.exit(1);
    }
  }

  await setPassword(config, password);
  console.log(`Password set. Hash written to ${config.passwordHashFile}`);
}

main().catch((err) => {
  if (err && err.message === 'Cancelled') {
    console.error('Aborted.');
  } else {
    console.error('Error:', err && err.message ? err.message : err);
  }
  process.exit(1);
});
