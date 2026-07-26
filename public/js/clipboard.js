/* WebTerm — copy the active terminal's selection to the clipboard. */
(function () {
  'use strict';

  function toast(msg, isError) {
    if (typeof window.toast === 'function') window.toast(msg, isError);
  }

  // Legacy path for contexts without navigator.clipboard (e.g. plain-HTTP LAN).
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    var ok = false;
    try {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  window.initClipboard = function initClipboard(btnEl, getActiveTerm) {
    if (!btnEl) return;

    btnEl.addEventListener('click', function () {
      var t = typeof getActiveTerm === 'function' ? getActiveTerm() : null;
      var text = t && t.hasSelection && t.hasSelection() && t.getSelection
        ? t.getSelection()
        : null;

      function refocus() {
        if (t && typeof t.focus === 'function') t.focus();
      }

      if (!text) {
        toast('Select text in the terminal first', true);
        refocus();
        return;
      }

      function finish(ok) {
        if (ok) {
          toast('Copied ' + text.length + ' chars');
        } else {
          toast('Copy failed', true);
        }
        refocus();
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { finish(true); })
          .catch(function () { finish(fallbackCopy(text)); });
      } else {
        finish(fallbackCopy(text));
      }
    });
  };
})();
