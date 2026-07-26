/* WebTerm mobile key bar (plain script, attaches window.initMobileBar). */
(function () {
  'use strict';

  window.initMobileBar = function initMobileBar(barEl, getActiveTerm) {
    if (!matchMedia('(pointer: coarse)').matches) {
      barEl.classList.add('hidden');
      return;
    }

    var ctrlActive = false;
    var altActive = false;

    var mainRow = document.createElement('div');
    mainRow.className = 'mkey-row';
    var comboRow = document.createElement('div');
    comboRow.className = 'mkey-row hidden';
    barEl.appendChild(comboRow);
    barEl.appendChild(mainRow);

    function withTerm(fn) {
      var term = getActiveTerm();
      if (!term) return;
      fn(term);
      term.focus();
    }

    function sendSeq(seq) {
      withTerm(function (term) { term.write(seq); });
    }

    function makeKey(label, onPress) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mkey';
      btn.textContent = label;
      // Prevent the button press from stealing focus / dismissing the keyboard
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', onPress);
      return btn;
    }

    function clearSticky() {
      ctrlActive = false;
      altActive = false;
      ctrlBtn.classList.remove('active');
      altBtn.classList.remove('active');
      comboRow.classList.add('hidden');
      comboRow.innerHTML = '';
    }

    function showComboRow(keys, makeSeq) {
      comboRow.innerHTML = '';
      keys.forEach(function (letter) {
        comboRow.appendChild(makeKey(letter, function () {
          sendSeq(makeSeq(letter));
          clearSticky();
        }));
      });
      comboRow.classList.remove('hidden');
    }

    var ctrlBtn = makeKey('Ctrl', function () {
      var wasActive = ctrlActive;
      clearSticky();
      if (!wasActive) {
        ctrlActive = true;
        ctrlBtn.classList.add('active');
        showComboRow(['C', 'D', 'Z', 'L', 'A', 'E', 'R', 'W', 'U', 'K'], function (letter) {
          return String.fromCharCode(letter.charCodeAt(0) & 0x1f);
        });
      }
      withTerm(function () {});
    });

    var altBtn = makeKey('Alt', function () {
      var wasActive = altActive;
      clearSticky();
      if (!wasActive) {
        altActive = true;
        altBtn.classList.add('active');
        showComboRow(['b', 'f', 'd', '.'], function (letter) {
          return '\x1b' + letter;
        });
      }
      withTerm(function () {});
    });

    var pasteBtn = makeKey('Paste', function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(function (text) {
        if (text) {
          withTerm(function (term) { term.write(text); });
        }
      }).catch(function () {
        // Clipboard permission denied — ignore
      });
    });

    var simpleKeys = [
      ['Esc', '\x1b'],
      ['Tab', '\t'],
      null, // Ctrl
      null, // Alt
      ['←', '\x1b[D'],
      ['↓', '\x1b[B'],
      ['↑', '\x1b[A'],
      ['→', '\x1b[C'],
      ['Home', '\x1b[H'],
      ['End', '\x1b[F'],
      ['PgUp', '\x1b[5~'],
      ['PgDn', '\x1b[6~'],
      ['|', '|'],
      ['~', '~'],
      ['/', '/'],
      ['-', '-']
    ];

    var stickyBtns = [ctrlBtn, altBtn];
    var stickyIdx = 0;
    simpleKeys.forEach(function (entry) {
      if (entry === null) {
        mainRow.appendChild(stickyBtns[stickyIdx++]);
        return;
      }
      mainRow.appendChild(makeKey(entry[0], function () {
        sendSeq(entry[1]);
      }));
    });
    mainRow.appendChild(pasteBtn);
  };
})();
