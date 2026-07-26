/* WebTerm — scrollback search bar (attaches window.initSearchBar). */
(function () {
  'use strict';

  window.initSearchBar = function initSearchBar(el, getActiveTerm) {
    var debounceTimer = null;

    function makeBtn(label, title, onClick) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'searchbar-btn';
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      // Keep focus in the search input while clicking prev/next.
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', onClick);
      return btn;
    }

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'searchbar-input';
    input.placeholder = 'Search…';
    input.setAttribute('aria-label', 'Search terminal scrollback');

    var prevBtn = makeBtn('▲', 'Previous match (Shift+Enter)', function () { find(false); });
    var nextBtn = makeBtn('▼', 'Next match (Enter)', function () { find(true); });
    var closeBtn = makeBtn('✕', 'Close (Esc)', function () { close(); });

    el.appendChild(input);
    el.appendChild(prevBtn);
    el.appendChild(nextBtn);
    el.appendChild(closeBtn);

    function find(forward) {
      var term = getActiveTerm();
      var q = input.value;
      if (!term || !q) return false;
      try {
        if (forward && typeof term.findNext === 'function') return term.findNext(q);
        if (!forward && typeof term.findPrevious === 'function') return term.findPrevious(q);
      } catch (e) {
        // Search addon unavailable or errored — treat as no match.
      }
      return false;
    }

    function isOpen() {
      return !el.classList.contains('hidden');
    }

    function open() {
      el.classList.remove('hidden');
      input.focus();
      input.select();
    }

    function close() {
      if (!isOpen()) return;
      el.classList.add('hidden');
      clearTimeout(debounceTimer);
      var term = getActiveTerm();
      if (term) {
        if (typeof term.clearSearch === 'function') {
          try { term.clearSearch(); } catch (e) {}
        }
        if (typeof term.focus === 'function') term.focus();
      }
    }

    function toggle() {
      if (isOpen()) {
        close();
      } else {
        open();
      }
    }

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { find(true); }, 150);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        find(!e.shiftKey);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        toggle();
      }
    });

    return { toggle: toggle };
  };
})();
