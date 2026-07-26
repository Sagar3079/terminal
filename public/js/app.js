/* WebTerm — boot, tab + split-pane manager, v2 module wiring */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var settings = window.loadSettings
      ? window.loadSettings()
      : { theme: 'dark', fontSize: 14, fontFamily: 'system' };

    var tabbarEl = document.getElementById('tabbar');
    var termsEl = document.getElementById('terms');
    var settingsPanel = document.getElementById('settings-panel');
    var splitHBtn = document.getElementById('split-h-btn');
    var splitVBtn = document.getElementById('split-v-btn');

    var MAX_PANES = 4;
    var LAYOUT_KEY = 'webterm-layout';
    var allTabs = [];
    var activeTab = null;

    // ---------- Toast (exposed globally so other modules can reuse it) ----------
    var toastEl = document.getElementById('toast');
    var toastTimer = null;
    function toast(msg, isError) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.toggle('error', !!isError);
      toastEl.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.add('hidden');
      }, 4000);
    }
    window.toast = toast;

    // ---------- Pane tree helpers ----------
    // Leaf: {term, el, parent}. Split: {dir:'h'|'v', a, b, el, parent}.
    function isLeaf(node) { return !!node && !!node.term; }

    function forEachLeaf(node, fn) {
      if (!node) return;
      if (isLeaf(node)) { fn(node); return; }
      forEachLeaf(node.a, fn);
      forEachLeaf(node.b, fn);
    }

    function countLeaves(node) {
      var n = 0;
      forEachLeaf(node, function () { n++; });
      return n;
    }

    function firstLeaf(node) {
      while (node && !isLeaf(node)) node = node.a;
      return node || null;
    }

    function getActiveTerm() {
      return activeTab && activeTab.activePane ? activeTab.activePane.term : null;
    }

    function getActiveSessionId() {
      var t = getActiveTerm();
      return t ? t.id : null;
    }

    // ---------- Layout persistence ----------
    function serializeNode(node) {
      if (!node) return null;
      if (isLeaf(node)) return node.term.id || null;
      return { dir: node.dir, a: serializeNode(node.a), b: serializeNode(node.b) };
    }

    function saveLayout() {
      try {
        var data = { tabs: allTabs.map(function (t) { return serializeNode(t.root); }) };
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
      } catch (e) { /* storage full/unavailable: layout just won't persist */ }
    }

    // Keep only leaves whose session is still alive; collapse one-child splits.
    function pruneNode(node, liveIds, used) {
      if (node == null) return null;
      if (typeof node === 'string') {
        if (liveIds[node] && !used[node]) {
          used[node] = true;
          return node;
        }
        return null;
      }
      if (typeof node === 'object' && (node.dir === 'h' || node.dir === 'v')) {
        var a = pruneNode(node.a, liveIds, used);
        var b = pruneNode(node.b, liveIds, used);
        if (a != null && b != null) return { dir: node.dir, a: a, b: b };
        return a != null ? a : b;
      }
      return null;
    }

    // ---------- Panes ----------
    function makePane(tab, sessionId) {
      var el = document.createElement('div');
      el.className = 'pane';
      var pane = { term: null, el: el, parent: null };

      pane.term = new window.TermSession(el, {
        sessionId: sessionId || null,
        settings: settings,
        onTitle: function (title) {
          if (tab.closed) return;
          if (firstLeaf(tab.root) === pane && !tab.customTitle) {
            tab.titleEl.textContent = title;
          }
          // A session id may have just been assigned ('created'); persist it.
          saveLayout();
        },
        onExit: function () {
          removePane(tab, pane);
        },
        onConnChange: function (state) {
          if (tab.closed) return;
          if (firstLeaf(tab.root) !== pane) return;
          tab.tabEl.classList.toggle('connected', state === 'connected');
          tab.tabEl.classList.toggle('reconnecting', state === 'reconnecting');
          tab.tabEl.classList.toggle('closed', state === 'closed');
        },
        onBell: function () {
          if (tab.closed) return;
          if (tab !== activeTab || document.hidden) {
            tab.tabEl.classList.add('bell');
          }
          if (tab !== activeTab) {
            toast('🔔 ' + tab.titleEl.textContent);
          }
        },
        onActivity: function () {
          if (tab.closed) return;
          if (tab !== activeTab || document.hidden) {
            tab.tabEl.classList.add('activity');
          }
        }
      });

      el.addEventListener('mousedown', function () { setActivePane(tab, pane); });
      el.addEventListener('touchstart', function () { setActivePane(tab, pane); }, { passive: true });
      return pane;
    }

    function setActivePane(tab, pane) {
      if (!pane || tab.closed) return;
      tab.activePane = pane;
      forEachLeaf(tab.root, function (p) {
        p.el.classList.toggle('active', p === pane);
      });
      if (tab === activeTab) pane.term.focus();
    }

    function fitAllPanes(tab) {
      if (!tab || tab.closed) return;
      requestAnimationFrame(function () {
        forEachLeaf(tab.root, function (p) { p.term.fit(); });
      });
    }

    function updateMulti(tab) {
      tab.holderEl.classList.toggle('multi', countLeaves(tab.root) > 1);
    }

    function updateSplitButtons() {
      var full = !activeTab || countLeaves(activeTab.root) >= MAX_PANES;
      if (splitHBtn) splitHBtn.disabled = full;
      if (splitVBtn) splitVBtn.disabled = full;
    }

    function splitActive(dir) {
      if (!activeTab || !activeTab.activePane) return;
      var tab = activeTab;
      if (countLeaves(tab.root) >= MAX_PANES) {
        toast('Max ' + MAX_PANES + ' panes per tab', true);
        return;
      }
      var target = tab.activePane;
      var parent = target.parent;

      var splitEl = document.createElement('div');
      splitEl.className = 'pane-split ' + dir;
      var container = parent ? parent.el : tab.holderEl;
      container.replaceChild(splitEl, target.el);

      var newPane = makePane(tab, null);
      var split = { dir: dir, a: target, b: newPane, el: splitEl, parent: parent };
      if (parent) {
        if (parent.a === target) parent.a = split; else parent.b = split;
      } else {
        tab.root = split;
      }
      target.parent = split;
      newPane.parent = split;
      splitEl.appendChild(target.el);
      splitEl.appendChild(newPane.el);

      newPane.term.connect();
      setActivePane(tab, newPane);
      updateMulti(tab);
      updateSplitButtons();
      fitAllPanes(tab);
      saveLayout();
    }

    // Pane's session ended (or was killed): collapse the tree around it.
    function removePane(tab, pane) {
      if (tab.closed) return;
      var parent = pane.parent;
      if (!parent) {
        // Last pane in the tab: the whole tab goes.
        removeTab(tab);
        return;
      }
      pane.term.dispose();
      if (pane.el.parentNode) pane.el.parentNode.removeChild(pane.el);

      var sibling = parent.a === pane ? parent.b : parent.a;
      var grand = parent.parent;
      if (parent.el.parentNode) parent.el.parentNode.replaceChild(sibling.el, parent.el);
      sibling.parent = grand;
      if (grand) {
        if (grand.a === parent) grand.a = sibling; else grand.b = sibling;
      } else {
        tab.root = sibling;
      }

      if (tab.activePane === pane) {
        setActivePane(tab, firstLeaf(sibling));
      }
      updateMulti(tab);
      updateSplitButtons();
      fitAllPanes(tab);
      saveLayout();
    }

    // ---------- Tabs ----------
    function activateTab(tab) {
      activeTab = tab;
      allTabs.forEach(function (t) {
        t.tabEl.classList.toggle('active', t === tab);
        t.holderEl.classList.toggle('hidden', t !== tab);
      });
      if (tab) {
        tab.tabEl.classList.remove('activity');
        tab.tabEl.classList.remove('bell');
        // Fit after the holder becomes visible so measurements are correct.
        requestAnimationFrame(function () {
          forEachLeaf(tab.root, function (p) { p.term.fit(); });
          if (tab.activePane) tab.activePane.term.focus();
        });
      }
      updateSplitButtons();
    }

    function removeTab(tab) {
      if (tab.closed) return;
      tab.closed = true;
      var idx = allTabs.indexOf(tab);
      if (idx !== -1) allTabs.splice(idx, 1);
      forEachLeaf(tab.root, function (p) { p.term.dispose(); });
      if (tab.tabEl.parentNode) tab.tabEl.parentNode.removeChild(tab.tabEl);
      if (tab.holderEl.parentNode) tab.holderEl.parentNode.removeChild(tab.holderEl);
      if (activeTab === tab) {
        activeTab = null;
        if (allTabs.length) {
          activateTab(allTabs[Math.max(0, idx - 1)]);
        }
      }
      updateSplitButtons();
      saveLayout();
    }

    // Build a pane tree from a stored layout node (string id | {dir,a,b} | null).
    function buildNode(tab, layout, parentEl) {
      if (layout && typeof layout === 'object' &&
          (layout.dir === 'h' || layout.dir === 'v') &&
          layout.a != null && layout.b != null) {
        var el = document.createElement('div');
        el.className = 'pane-split ' + layout.dir;
        parentEl.appendChild(el);
        var node = { dir: layout.dir, a: null, b: null, el: el, parent: null };
        node.a = buildNode(tab, layout.a, el);
        node.a.parent = node;
        node.b = buildNode(tab, layout.b, el);
        node.b.parent = node;
        return node;
      }
      var pane = makePane(tab, typeof layout === 'string' ? layout : null);
      parentEl.appendChild(pane.el);
      return pane;
    }

    function newTab(layout) {
      var holderEl = document.createElement('div');
      holderEl.className = 'term-holder hidden';
      termsEl.appendChild(holderEl);

      var tabEl = document.createElement('div');
      tabEl.className = 'tab';
      var titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      titleEl.textContent = 'Terminal';
      var closeEl = document.createElement('button');
      closeEl.className = 'tab-close';
      closeEl.textContent = '×';
      tabEl.appendChild(titleEl);
      tabEl.appendChild(closeEl);
      tabbarEl.appendChild(tabEl);

      var tab = {
        root: null,
        activePane: null,
        tabEl: tabEl,
        titleEl: titleEl,
        holderEl: holderEl,
        customTitle: null,
        closed: false
      };

      tab.root = buildNode(tab, layout || null, holderEl);
      tab.activePane = firstLeaf(tab.root);
      if (tab.activePane) tab.activePane.el.classList.add('active');
      updateMulti(tab);

      tabEl.addEventListener('click', function (e) {
        if (e.target === closeEl) return;
        activateTab(tab);
      });

      closeEl.addEventListener('click', function (e) {
        e.stopPropagation();
        forEachLeaf(tab.root, function (p) { p.term.kill(); });
        removeTab(tab);
      });

      // Rename: dblclick, or long-press (>=600ms) on touch.
      titleEl.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        startRename(tab);
      });
      var pressTimer = null;
      titleEl.addEventListener('touchstart', function () {
        clearTimeout(pressTimer);
        pressTimer = setTimeout(function () { startRename(tab); }, 600);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
        titleEl.addEventListener(ev, function () { clearTimeout(pressTimer); }, { passive: true });
      });

      allTabs.push(tab);
      forEachLeaf(tab.root, function (p) { p.term.connect(); });
      activateTab(tab);
      saveLayout();
      return tab;
    }

    // ---------- Tab rename ----------
    function startRename(tab) {
      if (tab.closed) return;
      var fp = firstLeaf(tab.root);
      var sid = fp && fp.term ? fp.term.id : null;
      if (!sid) {
        toast('Session not ready yet', true);
        return;
      }
      if (tab.titleEl.querySelector('input')) return;

      var current = tab.titleEl.textContent;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'tab-rename-input';
      input.value = current;
      input.maxLength = 64;
      tab.titleEl.textContent = '';
      tab.titleEl.appendChild(input);
      input.focus();
      input.select();

      var done = false;
      function finish(commit) {
        if (done) return;
        done = true;
        var val = input.value.trim();
        if (input.parentNode) input.parentNode.removeChild(input);
        tab.titleEl.textContent = current;
        if (!commit || !val || val === current) return;
        fetch('/api/sessions/' + encodeURIComponent(sid) + '/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: val })
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (d) {
              return { res: res, d: d };
            });
          })
          .then(function (r) {
            if (r.res.ok && r.d.ok) {
              tab.customTitle = r.d.title;
              tab.titleEl.textContent = r.d.title;
            } else {
              toast('Rename failed: ' + (r.d.error || r.res.status), true);
            }
          })
          .catch(function () { toast('Rename failed: network error', true); });
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
        e.stopPropagation();
      });
      input.addEventListener('blur', function () { finish(true); });
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      input.addEventListener('dblclick', function (e) { e.stopPropagation(); });
    }

    // ---------- Settings ----------
    if (window.initSettingsPanel) {
      window.initSettingsPanel(settingsPanel, function (s) {
        settings = s;
        allTabs.forEach(function (t) {
          forEachLeaf(t.root, function (p) { p.term.applySettings(s); });
        });
      });
    }

    // ---------- Top bar buttons ----------
    document.getElementById('new-tab-btn').addEventListener('click', function () {
      newTab(null);
    });

    if (splitHBtn) splitHBtn.addEventListener('click', function () { splitActive('h'); });
    if (splitVBtn) splitVBtn.addEventListener('click', function () { splitActive('v'); });

    document.getElementById('logout-btn').addEventListener('click', function () {
      fetch('/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () {
          location.href = '/login';
        });
    });

    document.getElementById('settings-btn').addEventListener('click', function () {
      settingsPanel.classList.toggle('hidden');
    });

    // ---------- File transfer ----------
    var uploadInput = document.getElementById('upload-input');
    document.getElementById('upload-btn').addEventListener('click', function () {
      uploadInput.click();
    });
    uploadInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(uploadInput.files);
      uploadInput.value = '';
      files.forEach(function (file) {
        toast('Uploading ' + file.name + '…');
        fetch('/api/upload?name=' + encodeURIComponent(file.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file
        })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
          .then(function (r) {
            if (r.res.ok && r.d.ok) {
              toast('Uploaded to ' + r.d.path);
            } else {
              toast('Upload failed: ' + (r.d.error || r.res.status), true);
            }
          })
          .catch(function () { toast('Upload failed: network error', true); });
      });
    });

    document.getElementById('download-btn').addEventListener('click', function () {
      var p = prompt('File path to download (absolute, or relative to home):', '~/');
      if (!p) return;
      fetch('/api/download?path=' + encodeURIComponent(p), { method: 'HEAD' })
        .catch(function () { return null; })
        .then(function (res) {
          if (res && !res.ok) {
            toast('Download failed: file not found', true);
            return;
          }
          var a = document.createElement('a');
          a.href = '/api/download?path=' + encodeURIComponent(p);
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
    });

    // ---------- v2 module wiring (each guarded: a missing module must not break boot) ----------
    var searchBar = null;
    if (window.initSearchBar) {
      try {
        searchBar = window.initSearchBar(document.getElementById('searchbar'), getActiveTerm);
      } catch (e) { searchBar = null; }
    }
    var searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        if (searchBar && searchBar.toggle) searchBar.toggle();
      });
    }
    // NOTE: searchbar.js owns the Ctrl/Cmd+F binding; app.js deliberately does not bind it.

    var fileBrowser = null;
    if (window.initFileBrowser) {
      try {
        fileBrowser = window.initFileBrowser(document.getElementById('filebrowser-panel'));
      } catch (e) { fileBrowser = null; }
    }
    var fileBrowserBtn = document.getElementById('filebrowser-btn');
    if (fileBrowserBtn) {
      fileBrowserBtn.addEventListener('click', function () {
        if (fileBrowser && fileBrowser.toggle) fileBrowser.toggle();
      });
    }

    var snippets = null;
    if (window.initSnippets) {
      try {
        snippets = window.initSnippets(document.getElementById('snippets-modal'), getActiveTerm);
      } catch (e) { snippets = null; }
    }
    var snippetsBtn = document.getElementById('snippets-btn');
    if (snippetsBtn) {
      snippetsBtn.addEventListener('click', function () {
        if (snippets && snippets.toggle) snippets.toggle();
      });
    }

    var recorder = null;
    if (window.initRecorder) {
      try {
        recorder = window.initRecorder(document.getElementById('recorder-modal'), { getActiveSessionId: getActiveSessionId });
      } catch (e) { recorder = null; }
    }
    var recorderBtn = document.getElementById('recorder-btn');
    if (recorderBtn) {
      recorderBtn.addEventListener('click', function () {
        if (recorder && recorder.toggle) recorder.toggle();
      });
    }

    if (window.initClipboard) {
      try {
        window.initClipboard(document.getElementById('copy-btn'), getActiveTerm);
      } catch (e) { /* clipboard module missing/broken; button just does nothing */ }
    }
    // pwa.js self-registers its service worker; nothing to wire here.

    if (window.initMobileBar) {
      window.initMobileBar(document.getElementById('mobile-bar'), getActiveTerm);
    }

    // ---------- Fit on resize / visibility ----------
    var fitTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(function () {
        if (activeTab) fitAllPanes(activeTab);
      }, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && activeTab) {
        fitAllPanes(activeTab);
      }
    });

    // ---------- Boot: rebuild stored layout from live sessions, else fresh tab ----------
    fetch('/api/sessions')
      .then(function (res) {
        if (res.status === 401 || res.redirected) {
          location.href = '/login';
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        var sessions = (data && data.sessions) || [];
        var liveIds = {};
        var titleById = {};
        sessions.forEach(function (s) {
          if (!s || !s.id) return;
          liveIds[s.id] = true;
          if (s.title) titleById[s.id] = s.title;
        });

        var stored = null;
        try {
          var raw = localStorage.getItem(LAYOUT_KEY);
          if (raw) stored = JSON.parse(raw);
        } catch (e) { stored = null; }

        var used = {};
        var trees = [];
        if (stored && Array.isArray(stored.tabs)) {
          stored.tabs.forEach(function (t) {
            var pruned = pruneNode(t, liveIds, used);
            if (pruned != null) trees.push(pruned);
          });
        }
        // Live sessions not present in the stored layout each get their own tab.
        sessions.forEach(function (s) {
          if (s && s.id && !used[s.id]) trees.push(s.id);
        });

        if (!trees.length) {
          newTab(null);
          return;
        }
        trees.forEach(function (t) { newTab(t); });
        // Server-persisted titles win over the client default.
        allTabs.forEach(function (tab) {
          var fp = firstLeaf(tab.root);
          var sid = fp && fp.term ? fp.term.id : null;
          if (sid && titleById[sid]) {
            tab.customTitle = titleById[sid];
            tab.titleEl.textContent = titleById[sid];
          }
        });
        activateTab(allTabs[0]);
      })
      .catch(function () {
        location.href = '/login';
      });
  });
})();
