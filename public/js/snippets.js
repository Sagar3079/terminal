/* WebTerm — command snippets palette (attaches window.initSnippets). */
(function () {
  'use strict';

  var STORAGE_KEY = 'webterm-snippets';
  var DEFAULT_SNIPPETS = [
    { name: 'List files', command: 'ls -la', run: true },
    { name: 'Disk usage', command: 'df -h', run: true },
    { name: 'Processes', command: 'htop', run: true }
  ];

  function sanitizeSnippet(s) {
    return {
      name: typeof s.name === 'string' ? s.name : '',
      command: typeof s.command === 'string' ? s.command : '',
      run: s.run === true
    };
  }

  function saveSnippets(snippets) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    } catch (e) {
      // localStorage unavailable/full — snippets stay in-memory for this page.
    }
  }

  function loadSnippets() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    if (raw === null) {
      // First use: seed defaults.
      var seeded = DEFAULT_SNIPPETS.map(sanitizeSnippet);
      saveSnippets(seeded);
      return seeded;
    }
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (s) { return s && typeof s === 'object'; })
        .map(sanitizeSnippet);
    } catch (e) {
      return [];
    }
  }

  window.initSnippets = function initSnippets(el, getActiveTerm) {
    var snippets = loadSnippets();
    var editIndex = -1; // -1 = adding, >=0 = editing that snippet

    // --- Build modal DOM ---
    var content = document.createElement('div');
    content.className = 'snippets-content';
    el.appendChild(content);

    var header = document.createElement('div');
    header.className = 'snippets-header';
    var titleEl = document.createElement('h2');
    titleEl.textContent = 'Snippets';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'snippets-add-btn';
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add snippet';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'snippets-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close snippets');
    header.appendChild(titleEl);
    header.appendChild(addBtn);
    header.appendChild(closeBtn);
    content.appendChild(header);

    var filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'snippets-filter';
    filterInput.placeholder = 'Filter snippets…';
    filterInput.setAttribute('aria-label', 'Filter snippets');
    content.appendChild(filterInput);

    // Inline add/edit form
    var form = document.createElement('div');
    form.className = 'snippets-form hidden';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'snippets-form-name';
    nameInput.placeholder = 'Name';
    var commandInput = document.createElement('textarea');
    commandInput.className = 'snippets-form-command';
    commandInput.placeholder = 'Command';
    commandInput.rows = 3;
    var runLabel = document.createElement('label');
    runLabel.className = 'snippets-form-run';
    var runCheckbox = document.createElement('input');
    runCheckbox.type = 'checkbox';
    runLabel.appendChild(runCheckbox);
    runLabel.appendChild(document.createTextNode(' press Enter after'));
    var formActions = document.createElement('div');
    formActions.className = 'snippets-form-actions';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'snippets-save-btn';
    saveBtn.textContent = 'Save';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);
    form.appendChild(nameInput);
    form.appendChild(commandInput);
    form.appendChild(runLabel);
    form.appendChild(formActions);
    content.appendChild(form);

    var listEl = document.createElement('div');
    listEl.className = 'snippets-list';
    content.appendChild(listEl);

    // --- Behavior ---
    function isOpen() {
      return !el.classList.contains('hidden');
    }

    function hideForm() {
      form.classList.add('hidden');
      editIndex = -1;
      nameInput.value = '';
      commandInput.value = '';
      runCheckbox.checked = false;
    }

    function showForm(index) {
      editIndex = typeof index === 'number' ? index : -1;
      if (editIndex >= 0 && snippets[editIndex]) {
        nameInput.value = snippets[editIndex].name;
        commandInput.value = snippets[editIndex].command;
        runCheckbox.checked = snippets[editIndex].run === true;
      } else {
        nameInput.value = '';
        commandInput.value = '';
        runCheckbox.checked = true;
      }
      form.classList.remove('hidden');
      nameInput.focus();
    }

    function runSnippet(snippet) {
      var term = getActiveTerm();
      if (!term || typeof term.write !== 'function') {
        if (window.toast) window.toast('No active terminal', true);
        return;
      }
      term.write(snippet.command + (snippet.run === true ? '\n' : ''));
      close();
      if (typeof term.focus === 'function') term.focus();
    }

    function makeRowBtn(label, title, className, onClick) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = className;
      btn.textContent = label;
      btn.title = title;
      btn.addEventListener('click', onClick);
      return btn;
    }

    function render() {
      listEl.innerHTML = '';
      var q = filterInput.value.trim().toLowerCase();
      var shown = 0;
      snippets.forEach(function (snippet, index) {
        if (q &&
            snippet.name.toLowerCase().indexOf(q) === -1 &&
            snippet.command.toLowerCase().indexOf(q) === -1) {
          return;
        }
        shown++;

        var row = document.createElement('div');
        row.className = 'snippet-row';

        var info = document.createElement('div');
        info.className = 'snippet-info';
        var nameEl = document.createElement('div');
        nameEl.className = 'snippet-name';
        nameEl.textContent = snippet.name || '(unnamed)';
        var cmdEl = document.createElement('div');
        cmdEl.className = 'snippet-command';
        cmdEl.textContent = snippet.command;
        cmdEl.title = snippet.command;
        info.appendChild(nameEl);
        info.appendChild(cmdEl);
        row.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'snippet-actions';
        actions.appendChild(makeRowBtn('Run', 'Run in active terminal', 'snippet-run-btn', function () {
          runSnippet(snippet);
        }));
        actions.appendChild(makeRowBtn('Edit', 'Edit snippet', 'snippet-edit-btn', function () {
          showForm(index);
        }));
        actions.appendChild(makeRowBtn('Delete', 'Delete snippet', 'snippet-delete-btn', function () {
          snippets.splice(index, 1);
          saveSnippets(snippets);
          if (editIndex === index) hideForm();
          render();
        }));
        row.appendChild(actions);

        listEl.appendChild(row);
      });

      if (!shown) {
        var empty = document.createElement('div');
        empty.className = 'snippets-empty';
        empty.textContent = snippets.length ? 'No snippets match the filter.' : 'No snippets yet — add one.';
        listEl.appendChild(empty);
      }
    }

    function open() {
      snippets = loadSnippets();
      el.classList.remove('hidden');
      render();
      filterInput.focus();
      filterInput.select();
    }

    function close() {
      if (!isOpen()) return;
      el.classList.add('hidden');
      hideForm();
    }

    function toggle() {
      if (isOpen()) {
        close();
      } else {
        open();
      }
    }

    addBtn.addEventListener('click', function () { showForm(-1); });
    closeBtn.addEventListener('click', function () { close(); });
    cancelBtn.addEventListener('click', function () { hideForm(); });

    saveBtn.addEventListener('click', function () {
      var name = nameInput.value.trim();
      var command = commandInput.value;
      if (!name) {
        nameInput.focus();
        return;
      }
      if (!command.trim()) {
        commandInput.focus();
        return;
      }
      var snippet = { name: name, command: command, run: runCheckbox.checked === true };
      if (editIndex >= 0 && editIndex < snippets.length) {
        snippets[editIndex] = snippet;
      } else {
        snippets.push(snippet);
      }
      saveSnippets(snippets);
      hideForm();
      render();
    });

    filterInput.addEventListener('input', function () { render(); });

    // Click on the backdrop (outside the content box) closes the modal.
    el.addEventListener('mousedown', function (e) {
      if (e.target === el) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        e.preventDefault();
        close();
      }
    });

    return { toggle: toggle };
  };
})();
