/* WebTerm — boot + tab manager */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var settings = window.loadSettings();

    var tabbarEl = document.getElementById('tabbar');
    var termsEl = document.getElementById('terms');
    var settingsPanel = document.getElementById('settings-panel');

    var allTabs = [];
    var activeTab = null;

    window.initSettingsPanel(settingsPanel, function (s) {
      settings = s;
      allTabs.forEach(function (t) {
        t.term.applySettings(s);
      });
    });

    function activateTab(tab) {
      activeTab = tab;
      allTabs.forEach(function (t) {
        t.tabEl.classList.toggle('active', t === tab);
        t.holderEl.classList.toggle('hidden', t !== tab);
      });
      if (tab) {
        // Fit after the holder becomes visible so measurements are correct.
        requestAnimationFrame(function () {
          tab.term.fit();
          tab.term.focus();
        });
      }
    }

    function removeTab(tab) {
      var idx = allTabs.indexOf(tab);
      if (idx === -1) return;
      allTabs.splice(idx, 1);
      tab.term.dispose();
      if (tab.tabEl.parentNode) tab.tabEl.parentNode.removeChild(tab.tabEl);
      if (tab.holderEl.parentNode) tab.holderEl.parentNode.removeChild(tab.holderEl);
      if (activeTab === tab) {
        activeTab = null;
        if (allTabs.length) {
          activateTab(allTabs[Math.max(0, idx - 1)]);
        }
      }
    }

    function newTab(sessionId) {
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

      var tab = { id: sessionId || null, term: null, tabEl: tabEl, holderEl: holderEl };

      tab.term = new window.TermSession(holderEl, {
        sessionId: sessionId || null,
        settings: settings,
        onTitle: function (title) {
          tab.id = tab.term.id;
          titleEl.textContent = title;
        },
        onExit: function () {
          // Shell exited server-side: just tear down the tab, nothing to kill.
          removeTab(tab);
        },
        onConnChange: function (state) {
          tabEl.classList.toggle('connected', state === 'connected');
          tabEl.classList.toggle('reconnecting', state === 'reconnecting');
          tabEl.classList.toggle('closed', state === 'closed');
        }
      });

      tabEl.addEventListener('click', function (e) {
        if (e.target === closeEl) return;
        activateTab(tab);
      });

      closeEl.addEventListener('click', function (e) {
        e.stopPropagation();
        tab.term.kill();
        removeTab(tab);
      });

      allTabs.push(tab);
      tab.term.connect();
      activateTab(tab);
      return tab;
    }

    document.getElementById('new-tab-btn').addEventListener('click', function () {
      newTab(null);
    });

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

    // --- File transfer ---
    var toastEl = document.getElementById('toast');
    var toastTimer = null;
    function toast(msg, isError) {
      toastEl.textContent = msg;
      toastEl.classList.toggle('error', !!isError);
      toastEl.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.add('hidden');
      }, 4000);
    }

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

    window.initMobileBar(document.getElementById('mobile-bar'), function () {
      return activeTab && activeTab.term;
    });

    var fitTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(function () {
        if (activeTab) activeTab.term.fit();
      }, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && activeTab) {
        activeTab.term.fit();
      }
    });

    // Boot: reattach to any live sessions, else open a fresh one.
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
        if (sessions.length) {
          sessions.forEach(function (s) {
            newTab(s.id);
          });
          activateTab(allTabs[0]);
        } else {
          newTab(null);
        }
      })
      .catch(function () {
        location.href = '/login';
      });
  });
})();
