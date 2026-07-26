/* WebTerm file browser — slide-over server file panel (attaches window.initFileBrowser). */
(function () {
  'use strict';

  function humanSize(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var v = bytes;
    var i = -1;
    do {
      v /= 1024;
      i++;
    } while (v >= 1024 && i < units.length - 1);
    return (v >= 10 ? Math.round(v) : v.toFixed(1)) + ' ' + units[i];
  }

  function joinPath(dir, name) {
    if (!dir) return name;
    return dir === '/' ? '/' + name : dir + '/' + name;
  }

  window.initFileBrowser = function initFileBrowser(el) {
    var currentPath = ''; // '' = server-resolved home
    var loading = false;
    var loadedOnce = false;

    // --- Build panel DOM ---
    el.classList.add('filebrowser');

    var header = document.createElement('div');
    header.className = 'fb-header';

    var crumbsEl = document.createElement('div');
    crumbsEl.className = 'fb-crumbs';

    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'fb-iconbtn';
    refreshBtn.title = 'Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh');
    refreshBtn.textContent = '⟳';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fb-iconbtn';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';

    header.appendChild(crumbsEl);
    header.appendChild(refreshBtn);
    header.appendChild(closeBtn);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'fb-body';

    var statusEl = document.createElement('div');
    statusEl.className = 'fb-status hidden';

    var footer = document.createElement('div');
    footer.className = 'fb-footer';

    var uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'fb-upload-btn';
    uploadBtn.textContent = '⇧ Upload here';

    var uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.multiple = true;
    uploadInput.className = 'hidden';

    footer.appendChild(uploadBtn);
    footer.appendChild(uploadInput);

    el.appendChild(header);
    el.appendChild(statusEl);
    el.appendChild(bodyEl);
    el.appendChild(footer);

    // Hidden anchor reused for downloads.
    var dlLink = document.createElement('a');
    dlLink.className = 'hidden';
    dlLink.download = '';
    el.appendChild(dlLink);

    function notify(msg, isError) {
      if (typeof window.toast === 'function') {
        window.toast(msg, isError);
      } else {
        statusEl.textContent = msg;
        statusEl.classList.toggle('error', !!isError);
        statusEl.classList.remove('hidden');
        clearTimeout(notify._t);
        notify._t = setTimeout(function () {
          statusEl.classList.add('hidden');
        }, 4000);
      }
    }

    function renderCrumbs(absPath) {
      crumbsEl.textContent = '';
      if (!absPath) return;
      // '/a/b' → segments ['/', 'a', 'b']; each navigates to its prefix.
      var parts = absPath.split('/').filter(function (s) { return s.length; });
      var targets = ['/'];
      var acc = '';
      parts.forEach(function (seg) {
        acc += '/' + seg;
        targets.push(acc);
      });
      var labels = ['/'].concat(parts);
      labels.forEach(function (label, i) {
        if (i > 0) {
          var sep = document.createElement('span');
          sep.className = 'fb-crumb-sep';
          sep.textContent = '/';
          crumbsEl.appendChild(sep);
        }
        var isLast = i === labels.length - 1;
        if (isLast) {
          var cur = document.createElement('span');
          cur.className = 'fb-crumb fb-crumb-current';
          cur.textContent = label;
          crumbsEl.appendChild(cur);
        } else {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fb-crumb';
          btn.textContent = label;
          btn.addEventListener('click', (function (target) {
            return function () { load(target); };
          })(targets[i]));
          crumbsEl.appendChild(btn);
        }
      });
      // Keep the tail of a deep path visible.
      crumbsEl.scrollLeft = crumbsEl.scrollWidth;
    }

    function makeRow(icon, name, meta, onTap) {
      var row = document.createElement('div');
      row.className = 'fb-row' + (onTap ? '' : ' fb-row-inert');
      var iconEl = document.createElement('span');
      iconEl.className = 'fb-icon';
      iconEl.textContent = icon;
      var nameEl = document.createElement('span');
      nameEl.className = 'fb-name';
      nameEl.textContent = name;
      nameEl.title = name;
      row.appendChild(iconEl);
      row.appendChild(nameEl);
      if (meta) {
        var metaEl = document.createElement('span');
        metaEl.className = 'fb-meta';
        metaEl.textContent = meta;
        row.appendChild(metaEl);
      }
      if (onTap) row.addEventListener('click', onTap);
      return row;
    }

    function renderEntries(data) {
      bodyEl.textContent = '';

      if (data.parent) {
        bodyEl.appendChild(makeRow('📁', '..', '', function () {
          load(data.parent);
        }));
      }

      var entries = data.entries || [];
      entries.forEach(function (entry) {
        var full = joinPath(data.path, entry.name);
        if (entry.type === 'dir') {
          bodyEl.appendChild(makeRow('📁', entry.name, '', function () {
            load(full);
          }));
        } else if (entry.type === 'file') {
          var row = makeRow('📄', entry.name, humanSize(entry.size), function () {
            dlLink.href = '/api/download?path=' + encodeURIComponent(full);
            dlLink.click();
          });
          if (entry.mtime) {
            try {
              row.title = entry.name + ' — ' + new Date(entry.mtime).toLocaleString();
            } catch (e) { /* mtime unparsable; tooltip is optional */ }
          }
          bodyEl.appendChild(row);
        } else {
          bodyEl.appendChild(makeRow('▪', entry.name, '', null));
        }
      });

      if (!entries.length) {
        var empty = document.createElement('div');
        empty.className = 'fb-empty';
        empty.textContent = 'Empty directory';
        bodyEl.appendChild(empty);
      }

      if (data.truncated) {
        var note = document.createElement('div');
        note.className = 'fb-empty';
        note.textContent = 'Listing truncated — too many entries';
        bodyEl.appendChild(note);
      }
    }

    function load(path) {
      if (loading) return;
      loading = true;
      el.classList.add('fb-loading');
      fetch('/api/browse?path=' + encodeURIComponent(path || ''))
        .then(function (res) {
          if (res.status === 401 || res.redirected) {
            location.href = '/login';
            return null;
          }
          return res.json()
            .catch(function () { return { error: 'HTTP ' + res.status }; })
            .then(function (d) {
              if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
              return d;
            });
        })
        .then(function (data) {
          if (!data) return;
          currentPath = data.path;
          loadedOnce = true;
          renderCrumbs(data.path);
          renderEntries(data);
        })
        .catch(function (err) {
          notify('Browse failed: ' + (err && err.message ? err.message : 'network error'), true);
        })
        .then(function () {
          loading = false;
          el.classList.remove('fb-loading');
        });
    }

    function refresh() {
      load(currentPath);
    }

    function toggle() {
      var opening = el.classList.contains('hidden');
      el.classList.toggle('hidden');
      if (opening && !loadedOnce) refresh();
    }

    // --- Upload into the current directory ---
    uploadBtn.addEventListener('click', function () {
      uploadInput.click();
    });

    function uploadOne(file) {
      var url = '/api/upload?name=' + encodeURIComponent(file.name) +
        '&dir=' + encodeURIComponent(currentPath || '~');
      notify('Uploading ' + file.name + '…');
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      })
        .then(function (res) {
          return res.json()
            .catch(function () { return {}; })
            .then(function (d) { return { res: res, d: d }; });
        })
        .then(function (r) {
          if (r.res.ok && r.d.ok) {
            notify('Uploaded ' + file.name);
          } else {
            notify('Upload failed: ' + (r.d.error || r.res.status), true);
          }
        })
        .catch(function () {
          notify('Upload failed: network error', true);
        });
    }

    uploadInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(uploadInput.files);
      uploadInput.value = '';
      if (!files.length) return;
      // Sequential so per-file toasts stay readable; refresh once at the end.
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () { return uploadOne(file); });
      });
      chain.then(refresh);
    });

    refreshBtn.addEventListener('click', refresh);
    closeBtn.addEventListener('click', function () {
      el.classList.add('hidden');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.classList.contains('hidden')) {
        el.classList.add('hidden');
      }
    });

    return { toggle: toggle, refresh: refresh };
  };
})();
