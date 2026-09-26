/* Service worker: la app funciona sin señal.
   El caparazón se cachea; los datos van siempre a la red y quedan en localStorage. */
var CACHE = 'gtm-v45';   // subir este número en cada cambio: obliga al celular a bajar la versión nueva
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
  // Los escudos de los equipos viven afuera: se guardan la primera vez que se
  // ven y después salen del caché, así el perfil se ve igual sin señal.
  if (url.hostname === 'res.cloudinary.com') {
    e.respondWith(caches.match(e.request).then(function (guardado) {
      return guardado || fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return res;
      }).catch(function () { return guardado; });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;              // fuentes y fotos: que decida el navegador

  // El caparazón (html, js, css) va a la RED PRIMERO. Antes era al revés: se
  // servía lo guardado y lo nuevo recién se aplicaba en el arranque siguiente,
  // así que después de cada cambio había que cerrar y abrir la app dos veces.
  // Si la red no contesta en 4 segundos, o no hay señal, sale lo guardado.
  if (/\.(?:html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.slice(-1) === '/') {
    e.respondWith(redPrimero(e.request, 4000));
    return;
  }

  // El resto (íconos, escudo) cambia poco: primero lo guardado.
  e.respondWith(
    caches.match(e.request).then(function (guardado) {
      var red = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return res;
      }).catch(function () { return guardado; });
      return guardado || red;
    })
  );
});

function redPrimero(req, espera) {
  return new Promise(function (resolver) {
    var listo = false;
    function dar(r) { if (!listo && r) { listo = true; resolver(r); } }
    var reloj = setTimeout(function () { caches.match(req).then(dar); }, espera);
    fetch(req).then(function (res) {
      clearTimeout(reloj);
      if (res && res.status === 200) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      dar(res);
    }).catch(function () {
      clearTimeout(reloj);
      caches.match(req).then(function (g) { dar(g || new Response('', { status: 504 })); });
    });
  });
}
