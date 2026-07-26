/* WebTerm service worker: cache-first for immutable static assets only.
 * Never intercepts /, /login, /api, /ws, /sw.js or /manifest.webmanifest. */
'use strict';

var CACHE_NAME = 'webterm-v1';
var CACHEABLE_PREFIXES = ['/static/', '/vendor/', '/icons/'];

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) return caches.delete(name);
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isCacheable(request) {
  if (request.method !== 'GET') return false;
  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  for (var i = 0; i < CACHEABLE_PREFIXES.length; i++) {
    if (url.pathname.indexOf(CACHEABLE_PREFIXES[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('fetch', function (event) {
  if (!isCacheable(event.request)) return; // let the browser handle it

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response && response.ok && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      });
    })
  );
});
