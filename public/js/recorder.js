/* WebTerm — session recording controls + in-browser .cast (asciinema v2) playback. */
(function () {
  'use strict';

  var MAX_GAP_SECONDS = 2; // idle compression: never wait longer than this between events
  var SPEEDS = [1, 2, 4];
  var POLL_MS = 2000;

  function toast(msg, isError) {
    if (typeof window.toast === 'function') window.toast(msg, isError);
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function humanSize(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var v = bytes;
    var u = -1;
    do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
    return v.toFixed(v >= 10 ? 0 : 1) + ' ' + units[u];
  }

  function formatDate(mtime) {
    var d = new Date(mtime);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function fmtSecs(s) {
    if (!isFinite(s) || s < 0) s = 0;
    return s.toFixed(1) + 's';
  }

  function darkTheme() {
    var theme = { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff' };
    try {
      if (typeof window.getTheme === 'function') {
        theme = window.getTheme({ theme: 'dark' }) || theme;
      }
    } catch (e) { /* fall back to hardcoded theme */ }
    return theme;
  }

  // Parse a .cast file: header (first line) + [time, type, data] event lines.
  // Returns {header, events:[string], adjTimes:[seconds], total} with idle-compressed times.
  function parseCast(text) {
    var lines = text.split('\n');
    var header = null;
    try { header = JSON.parse(lines[0]); } catch (e) { /* tolerate bad header */ }
    if (!header || typeof header !== 'object') header = {};

    var events = [];
    var rawTimes = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var ev = null;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (!ev || !ev.length || ev.length < 3 || ev[1] !== 'o') continue;
      rawTimes.push(Number(ev[0]) || 0);
      events.push(String(ev[2]));
    }

    var adjTimes = [];
    var prevRaw = 0;
    var prevAdj = 0;
    for (i = 0; i < rawTimes.length; i++) {
      var gap = Math.max(0, rawTimes[i] - prevRaw);
      prevAdj += Math.min(gap, MAX_GAP_SECONDS);
      adjTimes.push(prevAdj);
      prevRaw = rawTimes[i];
    }

    return {
      header: header,
      events: events,
      adjTimes: adjTimes,
      total: adjTimes.length ? adjTimes[adjTimes.length - 1] : 0
    };
  }

  window.initRecorder = function initRecorder(el, opts) {
    opts = opts || {};
    var getActiveSessionId = opts.getActiveSessionId || function () { return null; };
    var recorderBtn = document.getElementById('recorder-btn');

    var isOpen = false;
    var pollTimer = null;
    var recordingIds = {}; // sessionId -> true
    var player = null;     // { close: fn } while a playback pane is open

    // ---------- DOM ----------

    el.classList.add('recorder-modal');

    var content = mk('div', 'recorder-content');

    var titlebar = mk('div', 'recorder-titlebar');
    titlebar.appendChild(mk('h2', null, 'Session recording'));
    var closeBtn = mk('button', 'recorder-close', '✕');
    closeBtn.type = 'button';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    titlebar.appendChild(closeBtn);
    content.appendChild(titlebar);

    var secLive = mk('section', 'recorder-section');
    secLive.appendChild(mk('h3', null, 'This terminal'));
    var liveRow = mk('div', 'recorder-live');
    var liveIdEl = mk('span', 'recorder-live-id', '—');
    var recBtn = mk('button', 'recorder-rec-btn', '● Record');
    recBtn.type = 'button';
    liveRow.appendChild(liveIdEl);
    liveRow.appendChild(recBtn);
    secLive.appendChild(liveRow);
    content.appendChild(secLive);

    var secList = mk('section', 'recorder-section');
    secList.appendChild(mk('h3', null, 'Recordings'));
    var listEl = mk('div', 'recorder-list');
    secList.appendChild(listEl);
    content.appendChild(secList);

    var playerHost = mk('div', 'recorder-player-host');
    content.appendChild(playerHost);

    el.appendChild(content);

    // ---------- Recording state ----------

    function isRecordingActive() {
      var id = getActiveSessionId();
      return !!(id && recordingIds[id]);
    }

    function updateBtnClass() {
      if (recorderBtn) recorderBtn.classList.toggle('recording', isRecordingActive());
    }

    function updateLive() {
      var id = getActiveSessionId();
      liveIdEl.textContent = id ? 'Session ' + id : 'No active session';
      var rec = !!(id && recordingIds[id]);
      recBtn.textContent = rec ? '■ Stop recording' : '● Record';
      recBtn.classList.toggle('recording', rec);
      recBtn.disabled = !id;
      updateBtnClass();
    }

    function refreshSessions() {
      return fetch('/api/sessions')
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then(function (data) {
          recordingIds = {};
          var sessions = (data && data.sessions) || [];
          sessions.forEach(function (s) {
            if (s && s.recording) recordingIds[s.id] = true;
          });
          updateLive();
        })
        .catch(function () { /* transient — keep last known state */ });
    }

    recBtn.addEventListener('click', function () {
      var id = getActiveSessionId();
      if (!id) {
        toast('No active session', true);
        return;
      }
      var stopping = !!recordingIds[id];
      recBtn.disabled = true;
      fetch('/api/sessions/' + encodeURIComponent(id) + '/record/' + (stopping ? 'stop' : 'start'), { method: 'POST' })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; });
        })
        .then(function (r) {
          if (r.res.ok && r.d.ok) {
            toast(stopping ? 'Recording saved: ' + (r.d.file || '') : 'Recording started');
          } else {
            toast((stopping ? 'Stop' : 'Record') + ' failed: ' + (r.d.error || r.res.status), true);
          }
        })
        .catch(function () { toast('Recording request failed: network error', true); })
        .then(function () {
          recBtn.disabled = false;
          refreshSessions();
          refreshRecordings();
        });
    });

    // ---------- Recordings list ----------

    function refreshRecordings() {
      fetch('/api/recordings')
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then(function (data) {
          renderList((data && data.recordings) || []);
        })
        .catch(function () {
          listEl.innerHTML = '';
          listEl.appendChild(mk('div', 'recorder-empty', 'Could not load recordings.'));
        });
    }

    function renderList(recordings) {
      listEl.innerHTML = '';
      if (!recordings.length) {
        listEl.appendChild(mk('div', 'recorder-empty', 'No recordings yet.'));
        return;
      }
      recordings.forEach(function (rec) {
        if (!rec || !rec.name) return;
        var row = mk('div', 'rec-row');

        var info = mk('div', 'rec-info');
        info.appendChild(mk('div', 'rec-name', rec.name));
        var metaParts = [];
        var sz = humanSize(rec.size);
        var dt = formatDate(rec.mtime);
        if (sz) metaParts.push(sz);
        if (dt) metaParts.push(dt);
        info.appendChild(mk('div', 'rec-meta', metaParts.join(' · ')));
        row.appendChild(info);

        var actions = mk('div', 'rec-actions');

        var playBtn = mk('button', 'rec-act', '▶');
        playBtn.type = 'button';
        playBtn.title = 'Play';
        playBtn.setAttribute('aria-label', 'Play ' + rec.name);
        playBtn.addEventListener('click', function () { openPlayer(rec.name); });
        actions.appendChild(playBtn);

        var dlLink = mk('a', 'rec-act', '⇩');
        dlLink.href = '/api/recordings/' + encodeURIComponent(rec.name);
        dlLink.setAttribute('download', rec.name);
        dlLink.title = 'Download';
        dlLink.setAttribute('aria-label', 'Download ' + rec.name);
        actions.appendChild(dlLink);

        var delBtn = mk('button', 'rec-act rec-act-danger', '🗑');
        delBtn.type = 'button';
        delBtn.title = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete ' + rec.name);
        delBtn.addEventListener('click', function () {
          if (!confirm('Delete recording ' + rec.name + '?')) return;
          fetch('/api/recordings/' + encodeURIComponent(rec.name), { method: 'DELETE' })
            .then(function (res) {
              return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; });
            })
            .then(function (r) {
              if (r.res.ok && r.d.ok) {
                toast('Deleted ' + rec.name);
              } else {
                toast('Delete failed: ' + (r.d.error || r.res.status), true);
              }
            })
            .catch(function () { toast('Delete failed: network error', true); })
            .then(refreshRecordings);
        });
        actions.appendChild(delBtn);

        row.appendChild(actions);
        listEl.appendChild(row);
      });
    }

    // ---------- Playback ----------

    function closePlayer() {
      if (player) player.close();
    }

    function openPlayer(name) {
      closePlayer();
      if (!window.Terminal) {
        toast('Terminal library not loaded', true);
        return;
      }
      fetch('/api/recordings/' + encodeURIComponent(name))
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          return res.text();
        })
        .then(function (text) { startPlayer(name, text); })
        .catch(function () { toast('Could not load recording ' + name, true); });
    }

    function startPlayer(name, text) {
      var cast = parseCast(text);
      var events = cast.events;
      var adjTimes = cast.adjTimes;
      var total = cast.total;

      var pane = mk('div', 'recorder-player');

      var bar = mk('div', 'recorder-player-bar');
      bar.appendChild(mk('span', 'recorder-player-name', name));

      var playBtn = mk('button', 'rec-act', '❚❚');
      playBtn.type = 'button';
      playBtn.title = 'Play/Pause';
      bar.appendChild(playBtn);

      var speedBtn = mk('button', 'rec-act', '1x');
      speedBtn.type = 'button';
      speedBtn.title = 'Playback speed';
      bar.appendChild(speedBtn);

      var progressEl = mk('span', 'recorder-progress', '');
      bar.appendChild(progressEl);

      var playerCloseBtn = mk('button', 'rec-act', '✕');
      playerCloseBtn.type = 'button';
      playerCloseBtn.title = 'Close player';
      bar.appendChild(playerCloseBtn);

      pane.appendChild(bar);

      var termHost = mk('div', 'recorder-term');
      pane.appendChild(termHost);
      playerHost.appendChild(pane);

      var term;
      try {
        term = new window.Terminal({
          cols: (cast.header.width | 0) || 80,
          rows: (cast.header.height | 0) || 24,
          fontSize: 13,
          scrollback: 5000,
          cursorBlink: false,
          disableStdin: true,
          theme: darkTheme()
        });
        term.open(termHost);
      } catch (e) {
        if (pane.parentNode) pane.parentNode.removeChild(pane);
        toast('Could not start player', true);
        return;
      }

      var idx = 0;        // next event to write
      var pos = 0;        // current position on the compressed timeline (seconds)
      var speed = 1;
      var playing = false;
      var timer = null;
      var waitStart = 0;  // wall clock when the pending timeout was armed

      function updateProgress() {
        progressEl.textContent = fmtSecs(Math.min(pos, total)) + ' / ' + fmtSecs(total);
      }

      function scheduleNext() {
        if (idx >= events.length) {
          playing = false;
          pos = total;
          playBtn.textContent = '↺';
          playBtn.title = 'Replay';
          updateProgress();
          return;
        }
        waitStart = Date.now();
        timer = setTimeout(fire, Math.max(0, (adjTimes[idx] - pos) * 1000 / speed));
      }

      function fire() {
        timer = null;
        pos = adjTimes[idx];
        try { term.write(events[idx]); } catch (e) { /* ignore write on disposed term */ }
        idx++;
        updateProgress();
        scheduleNext();
      }

      function play() {
        if (playing) return;
        if (idx >= events.length) {
          idx = 0;
          pos = 0;
          try { term.reset(); } catch (e) { /* ignore */ }
        }
        playing = true;
        playBtn.textContent = '❚❚';
        playBtn.title = 'Pause';
        scheduleNext();
      }

      function pause() {
        if (!playing) return;
        if (timer) {
          clearTimeout(timer);
          timer = null;
          pos += (Date.now() - waitStart) / 1000 * speed;
        }
        playing = false;
        playBtn.textContent = '▶';
        playBtn.title = 'Play';
        updateProgress();
      }

      playBtn.addEventListener('click', function () {
        if (playing) pause(); else play();
      });

      speedBtn.addEventListener('click', function () {
        var old = speed;
        speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
        speedBtn.textContent = speed + 'x';
        if (playing && timer) {
          clearTimeout(timer);
          timer = null;
          pos += (Date.now() - waitStart) / 1000 * old;
          scheduleNext();
        }
        updateProgress();
      });

      function close() {
        if (timer) clearTimeout(timer);
        timer = null;
        playing = false;
        try { term.dispose(); } catch (e) { /* ignore */ }
        if (pane.parentNode) pane.parentNode.removeChild(pane);
        if (player && player.pane === pane) player = null;
      }

      playerCloseBtn.addEventListener('click', close);

      player = { close: close, pane: pane };

      if (!events.length) {
        toast('Recording has no output events');
        updateProgress();
        return;
      }
      play();
    }

    // ---------- Modal open/close ----------

    function onKeydown(e) {
      if (e.key === 'Escape') closeModal();
    }

    function openModal() {
      if (isOpen) return;
      isOpen = true;
      el.classList.remove('hidden');
      refreshSessions();
      refreshRecordings();
      pollTimer = setInterval(refreshSessions, POLL_MS);
      document.addEventListener('keydown', onKeydown);
    }

    function closeModal() {
      if (!isOpen) return;
      isOpen = false;
      el.classList.add('hidden');
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      document.removeEventListener('keydown', onKeydown);
      closePlayer();
    }

    function toggle() {
      if (isOpen) closeModal(); else openModal();
    }

    closeBtn.addEventListener('click', closeModal);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeModal();
    });

    // One initial fetch so the topbar button reflects a recording already in
    // progress (e.g. after a page reload); regular polling only runs while open.
    refreshSessions();

    return { toggle: toggle, isRecordingActive: isRecordingActive };
  };
})();
