/**
 * Service worker mínimo: sólo cachea los archivos estáticos de la app
 * para que abra más rápido y funcione parcialmente sin conexión.
 * (Sólo se activa si la app se sirve por http/https, no por file://).
 */
var CACHE = 'kiosco-v1';
var ARCHIVOS = [
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/db.js',
  './js/printer.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ARCHIVOS); }));
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (resp) {
      return resp || fetch(event.request);
    })
  );
});
