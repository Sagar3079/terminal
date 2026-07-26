# WebTerm

A self-hosted web terminal you can open from any browser — your PC, your phone, your tablet. Think ttyd or Wetty, but nicer: tabs, themes, sessions that survive disconnects, and a mobile key bar that makes shell work on a phone actually pleasant.

No build step, no frontend framework. Plain Node.js + Express + WebSockets + xterm.js.

## Features

- **Mobile-friendly** — responsive layout, touch-sized controls, and an on-screen key bar with Esc, Tab, arrows, sticky Ctrl/Alt combos, Paste, and more
- **Tabs** — run multiple shells side by side, just like a desktop terminal
- **Reconnectable sessions** — PTY sessions live on the server and survive dropped connections; close your laptop, reopen the page, and pick up right where you left off (scrollback included)
- **Themes** — dark, light, Dracula, Solarized Dark, and Monokai, plus adjustable font size
- **Password login** — bcrypt-hashed password, rate-limited login, session cookies
- **Auto-reconnect** — flaky wifi? The client re-attaches with exponential backoff

## Quick start

```bash
npm install
node bin/set-password.js   # choose your login password (min 8 chars)
npm start
```

Then open [http://localhost:3000](http://localhost:3000) and log in.

Alternatively, set the password non-interactively on first run:

```bash
WEBTERM_PASSWORD='your-secret-password' npm start
```

## Access from your phone

1. Make sure your phone and PC are on the same wifi network.
2. Find your PC's LAN IP (e.g. `ip addr` on Linux, `ipconfig` on Windows).
3. On your phone, open `http://<pc-ip>:3000` (for example `http://192.168.1.42:3000`).
4. Log in — the mobile key bar appears automatically on touch devices.

Tip: "Add to Home Screen" in your mobile browser gives you an app-like fullscreen terminal.

## Security

WebTerm gives whoever logs in **a full shell on your machine**. Treat it accordingly:

- **Never expose plain HTTP to the internet.** The login password and everything you type would travel unencrypted. Do not port-forward raw HTTP from your router.
- If you want remote access, use one of:
  - **[Tailscale](https://tailscale.com/)** (easiest): both devices join your tailnet, and you connect over the private WireGuard network — no ports exposed at all.
  - **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)**: outbound-only tunnel with TLS and optional access policies.
  - **A reverse proxy with TLS** (Caddy, nginx + Let's Encrypt) in front of WebTerm.
- Pick a strong password. Login is rate-limited (5 failures per 15 minutes per IP), but a strong password is still your main defense.
- On a LAN you trust, plain HTTP is a reasonable trade-off; anywhere else, HTTPS is a must.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | Listen address (`127.0.0.1` to restrict to localhost) |
| `WEBTERM_SHELL` | `$SHELL` or `/bin/bash` | Shell to spawn for each terminal session |
| `WEBTERM_PASSWORD` | – | If no password is set yet, sets it on startup (handy for containers) |

State lives in `data/` (password hash and session secret), created automatically with restrictive permissions.

## Testing

```bash
npm test
```

Runs the smoke test (`test/smoke.js`): boots the server on a scratch port, then checks login, auth gating, the sessions API, WebSocket auth, terminal I/O, and session re-attach.

## Run as a service (systemd)

```ini
# /etc/systemd/system/webterm.service
[Unit]
Description=WebTerm web terminal
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/terminal
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=3000
Environment=HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now webterm
```

(The example binds to `127.0.0.1`, assuming a TLS reverse proxy or Tailscale in front.)

## Project structure

```
terminal/
├── package.json
├── server.js              # HTTP + WebSocket server, wiring
├── bin/
│   └── set-password.js    # interactive password setup CLI
├── lib/
│   ├── config.js          # config + session secret management
│   ├── auth.js            # sessions, bcrypt password, rate limiting
│   ├── pty-manager.js     # PTY lifecycle + scrollback buffers
│   └── ws-handler.js      # WebSocket protocol handler
├── public/
│   ├── login.html         # login page
│   ├── index.html         # terminal app shell
│   ├── css/
│   │   ├── login.css
│   │   └── terminal.css
│   └── js/
│       ├── themes.js      # themes + settings panel
│       ├── term.js        # TermSession: xterm + WebSocket + reconnect
│       ├── mobilebar.js   # on-screen key bar for touch devices
│       └── app.js         # boot + tab manager
├── test/
│   └── smoke.js           # end-to-end smoke test
└── data/                  # created at runtime: password hash, session secret
```

## License

MIT — do whatever you like, at your own risk.
