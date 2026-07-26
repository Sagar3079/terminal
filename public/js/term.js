/* global Terminal, FitAddon, WebLinksAddon, SearchAddon, WebglAddon, THEMES */
/* TermSession: one xterm.js terminal bound to one server PTY session over a WebSocket. */
(function () {
  'use strict';

  var MIN_BACKOFF = 500;
  var MAX_BACKOFF = 8000;
  var ACTIVITY_THROTTLE_MS = 300;
  var FALLBACK_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function resolveFontStack(fontFamily) {
    var fonts = window.FONTS;
    if (fonts) {
      if (fontFamily && typeof fonts[fontFamily] === 'string') return fonts[fontFamily];
      if (typeof fonts.system === 'string') return fonts.system;
    }
    return FALLBACK_FONT_STACK;
  }

  function resolveTheme(settings) {
    if (typeof window.getTheme === 'function') {
      try {
        var t = window.getTheme(settings);
        if (t) return t;
      } catch (e) { /* fall through to THEMES */ }
    }
    return (window.THEMES && (THEMES[settings.theme] || THEMES.dark)) || undefined;
  }

  window.TermSession = class TermSession {
    constructor(holderEl, opts) {
      opts = opts || {};
      this._sessionId = opts.sessionId || null;
      this._onTitle = opts.onTitle || function () {};
      this._onExit = opts.onExit || function () {};
      this._onConnChange = opts.onConnChange || function () {};
      this._onBell = opts.onBell || null;
      this._onActivity = opts.onActivity || null;
      this._lastActivityAt = 0;

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
        theme: resolveTheme(opts.settings),
        scrollback: 5000,
        fontFamily: resolveFontStack(opts.settings.fontFamily)
      });
      this.fitAddon = new FitAddon.FitAddon();
      this.term.loadAddon(this.fitAddon);
      this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

      this.searchAddon = null;
      if (window.SearchAddon && SearchAddon.SearchAddon) {
        try {
          this.searchAddon = new SearchAddon.SearchAddon();
          this.term.loadAddon(this.searchAddon);
        } catch (e) {
          this.searchAddon = null;
        }
      }

      this.term.open(holderEl);
      this._loadWebgl();

      var self = this;
      this.term.onData(function (data) {
        self._send({ type: 'input', data: data });
      });
      this.term.onResize(function (size) {
        self._sendResize(size.cols, size.rows);
      });
      this.term.onBell(function () {
        if (self._onBell) {
          try { self._onBell(); } catch (e) { /* callback errors must not break IO */ }
        }
      });
    }

    // WebGL renderer with silent fallback to the DOM renderer.
    _loadWebgl() {
      if (!window.WebglAddon || !WebglAddon.WebglAddon) return;
      var self = this;
      var addon;
      try {
        addon = new WebglAddon.WebglAddon();
        if (typeof addon.onContextLoss === 'function') {
          addon.onContextLoss(function () {
            self._disposeWebgl();
          });
        }
        this.term.loadAddon(addon);
        this._webglAddon = addon;
      } catch (e) {
        this._webglAddon = addon || null;
        this._disposeWebgl();
      }
    }

    _disposeWebgl() {
      var addon = this._webglAddon;
      this._webglAddon = null;
      if (!addon) return;
      try { addon.dispose(); } catch (e) { /* already gone */ }
    }

    _notifyActivity() {
      if (!this._onActivity) return;
      var now = Date.now();
      if (now - this._lastActivityAt < ACTIVITY_THROTTLE_MS) return;
      this._lastActivityAt = now;
      try { this._onActivity(); } catch (e) { /* callback errors must not break IO */ }
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
          this._notifyActivity();
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

    _search(query, backwards) {
      if (!this.searchAddon || !query) return false;
      var method = backwards ? 'findPrevious' : 'findNext';
      var opts = {
        decorations: {
          matchOverviewRuler: '#f2cc60',
          activeMatchColorOverviewRuler: '#f2cc60'
        }
      };
      try {
        return !!this.searchAddon[method](query, opts);
      } catch (e) {
        // Older addon builds may reject decoration options; retry bare.
        try {
          return !!this.searchAddon[method](query);
        } catch (e2) {
          return false;
        }
      }
    }

    findNext(query) {
      return this._search(query, false);
    }

    findPrevious(query) {
      return this._search(query, true);
    }

    clearSearch() {
      if (this.searchAddon && typeof this.searchAddon.clearDecorations === 'function') {
        try { this.searchAddon.clearDecorations(); } catch (e) { /* ignore */ }
      }
    }

    getSelection() {
      return this.term.getSelection();
    }

    hasSelection() {
      return this.term.hasSelection();
    }

    applySettings(settings) {
      this.term.options.theme = resolveTheme(settings);
      this.term.options.fontSize = settings.fontSize;
      this.term.options.fontFamily = resolveFontStack(settings.fontFamily);
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
