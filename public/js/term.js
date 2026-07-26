/* global Terminal, FitAddon, WebLinksAddon, THEMES */
/* TermSession: one xterm.js terminal bound to one server PTY session over a WebSocket. */
(function () {
  'use strict';

  var MIN_BACKOFF = 500;
  var MAX_BACKOFF = 8000;

  window.TermSession = class TermSession {
    constructor(holderEl, opts) {
      opts = opts || {};
      this._sessionId = opts.sessionId || null;
      this._onTitle = opts.onTitle || function () {};
      this._onExit = opts.onExit || function () {};
      this._onConnChange = opts.onConnChange || function () {};

      this._ws = null;
      this._disposed = false;
      this._exited = false;
      this._everConnected = false; // true once a create/attach succeeded
      this._backoff = MIN_BACKOFF;
      this._reconnectTimer = null;
      this._lastCols = null;
      this._lastRows = null;

      this.term = new Terminal({
        cursorBlink: true,
        fontSize: opts.settings.fontSize,
        theme: THEMES[opts.settings.theme],
        scrollback: 5000,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      });
      this.fitAddon = new FitAddon.FitAddon();
      this.term.loadAddon(this.fitAddon);
      this.term.loadAddon(new WebLinksAddon.WebLinksAddon());
      this.term.open(holderEl);

      var self = this;
      this.term.onData(function (data) {
        self._send({ type: 'input', data: data });
      });
      this.term.onResize(function (size) {
        self._sendResize(size.cols, size.rows);
      });
    }

    get id() {
      return this._sessionId;
    }

    connect() {
      if (this._disposed || this._exited) return;
      var self = this;
      var proto = location.protocol === 'https:' ? 'wss' : 'ws';
      var ws;
      try {
        ws = new WebSocket(proto + '://' + location.host + '/ws');
      } catch (e) {
        this._scheduleReconnect();
        return;
      }
      this._ws = ws;

      ws.onopen = function () {
        try {
          self.fitAddon.fit();
        } catch (e) { /* holder may be hidden; use current dims */ }
        var cols = self.term.cols;
        var rows = self.term.rows;
        if (self._sessionId) {
          self._send({ type: 'attach', id: self._sessionId, cols: cols, rows: rows });
        } else {
          self._send({ type: 'create', cols: cols, rows: rows });
        }
        self._lastCols = cols;
        self._lastRows = rows;
      };

      ws.onmessage = function (ev) {
        var msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;
        self._handleMessage(msg);
      };

      ws.onclose = function () {
        if (self._ws === ws) self._ws = null;
        if (self._disposed || self._exited) return;
        self._scheduleReconnect();
      };

      ws.onerror = function () {
        // onclose follows and drives the reconnect
      };
    }

    _handleMessage(msg) {
      switch (msg.type) {
        case 'created':
          this._sessionId = msg.id;
          this._everConnected = true;
          this._backoff = MIN_BACKOFF;
          this._onConnChange('connected');
          this._onTitle('Terminal ' + msg.id);
          break;
        case 'attached':
          this._everConnected = true;
          this._backoff = MIN_BACKOFF;
          this._onConnChange('connected');
          this._onTitle('Terminal ' + (msg.id || this._sessionId));
          if (typeof msg.buffer === 'string' && msg.buffer) {
            this.term.write(msg.buffer);
          }
          break;
        case 'output':
          if (typeof msg.data === 'string') this.term.write(msg.data);
          break;
        case 'exit':
          this._handleExit();
          break;
        case 'error':
          // Session died while we were disconnected: nothing to reattach to.
          if (msg.message === 'Session not found' && this._everConnected) {
            this._handleExit();
          } else {
            this.term.write('\r\n\x1b[31m[WebTerm] ' + (msg.message || 'Unknown error') + '\x1b[0m\r\n');
          }
          break;
      }
    }

    _handleExit() {
      if (this._exited) return;
      this._exited = true;
      this._clearReconnect();
      this._onConnChange('closed');
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        try { this._ws.close(); } catch (e) { /* ignore */ }
      }
      this._onExit();
    }

    _scheduleReconnect() {
      if (this._reconnectTimer) return;
      var self = this;
      this._onConnChange('reconnecting');
      this._reconnectTimer = setTimeout(function () {
        self._reconnectTimer = null;
        self.connect();
      }, this._backoff);
      this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF);
    }

    _clearReconnect() {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
    }

    _send(msg) {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        try {
          this._ws.send(JSON.stringify(msg));
        } catch (e) { /* socket died mid-send; reconnect handles it */ }
      }
    }

    _sendResize(cols, rows) {
      if (cols === this._lastCols && rows === this._lastRows) return;
      this._lastCols = cols;
      this._lastRows = rows;
      this._send({ type: 'resize', cols: cols, rows: rows });
    }

    fit() {
      try {
        this.fitAddon.fit();
      } catch (e) {
        return; // holder not measurable (hidden tab)
      }
      this._sendResize(this.term.cols, this.term.rows);
    }

    focus() {
      this.term.focus();
    }

    write(data) {
      this._send({ type: 'input', data: data });
    }

    applySettings(settings) {
      this.term.options.theme = THEMES[settings.theme];
      this.term.options.fontSize = settings.fontSize;
      this.fit();
    }

    kill() {
      this._send({ type: 'kill' });
    }

    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      this._clearReconnect();
      this._onConnChange('closed');
      if (this._ws) {
        this._ws.onclose = null;
        this._ws.onerror = null;
        this._ws.onmessage = null;
        try { this._ws.close(); } catch (e) { /* ignore */ }
        this._ws = null;
      }
      this.term.dispose();
    }
  };
})();
