/* WebTerm PWA bootstrap: registers the service worker (self-executing). */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // Registration failure (e.g. insecure context) is non-fatal.
      });
    } catch (err) {
      // Ignore: PWA support is strictly optional.
    }
  });
})();
