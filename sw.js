/* Service worker: la app funciona sin señal.
   El caparazón se cachea; los datos van siempre a la red y quedan en localStorage. */
var CACHE = 'gtm-v31';   // subir este número en cada cambio: obliga al celular a bajar la versión nueva
var ARCHIVOS = ['./', 'index.html', 'app.css', 'app.js', 'config.js',
                'manifest.webmanifest', 'escudo.png',
                'icono-192.png', 'icono-512.png', 'icono-maskable.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (llaves) {
    return Promise.all(llaves.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                       // las escrituras nunca se cachean
  if (url.hostname.indexOf('script.google') >= 0) return;       // el backend siempre va a la red
  if (url.origin !== self.location.origin) return;              // fuentes y fotos: que decida el navegador

  e.respondWith(
    caches.match(e.request).then(function (guardado) {
      var red = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return res;
      }).catch(function () { return guardado; });
      return guardado || red;                                    // cache primero, red de fondo
    })
  );
});
