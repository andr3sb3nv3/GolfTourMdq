/* GOLF TOUR MDQ — aplicación */
(function () {
'use strict';

var LS = { ses: 'gtm-sesion', est: 'gtm-estado', cola: 'gtm-cola', ui: 'gtm-ui' };
var API = (window.GTM_CONFIG && window.GTM_CONFIG.api) || '';

var SES = leerLS(LS.ses, null);          // { token, matricula }
var E   = leerLS(LS.est, null);          // último estado conocido del servidor
var COLA = leerLS(LS.cola, []);          // golpes pendientes de sincronizar
var UI = Object.assign({ tab: 'posiciones', cancha: null, canchaLb: 'general',
  metrica: 'stableford', hoyo: 0, vistaTc: 'bruto', editando: null, ingreso: 'entrar',
  jugador: null }, leerLS(LS.ui, {}));

var sincronizando = false, ultimoError = '', reloj = null, promptInstalar = null;

function leerLS(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function guardarUI() { guardarLS(LS.ui, UI); }

/* ============ utilidades ============ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function signo(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }
function nombreCorto(n) { n = String(n || ''); return n.length <= 14 ? n : n.split(' ')[0]; }
function hora(iso) { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

function jugador(mat) {
  if (!E) return null;
  for (var i = 0; i < E.jugadores.length; i++) if (String(E.jugadores[i].matricula) === String(mat)) return E.jugadores[i];
  return null;
}
function cancha(id) {
  if (!E) return null;
  for (var i = 0; i < E.canchas.length; i++) if (E.canchas[i].id === id) return E.canchas[i];
  return null;
}
function canchaActual() { return cancha(UI.cancha) || (E && E.canchas[0]) || null; }
function yo() { return SES ? jugador(SES.matricula) : null; }
function esAdmin() { var y = yo(); return !!y && y.rol === 'admin'; }
function puedeEditar(mat) { var y = yo(); return !!y && String(mat) === String(y.matricula); }
function nombreEquipo(k) { return (E && E.equipos && E.equipos[k] && E.equipos[k].nombre) || (k === 'azul' ? 'Azul' : 'Rojo'); }
function claseEq(j) { return j && j.equipo === 'azul' ? ' eq-azul' : (j && j.equipo === 'rojo' ? ' eq-rojo' : ''); }
function claseTxt(j) { return j && j.equipo === 'azul' ? ' txt-azul' : (j && j.equipo === 'rojo' ? ' txt-rojo' : ''); }
function avatar(j, extra) {
  var c = 'av' + claseEq(j) + (extra ? ' ' + extra : '');
  if (j && j.fotoId) return '<img class="' + c + '" src="https://drive.google.com/thumbnail?id=' + esc(j.fotoId) + '&sz=w160" alt="">';
  return '<span class="' + c + '">' + esc(inicial(j)) + '</span>';
}
function inicial(j) {
  var n = String((j && j.nombre) || '?').trim();
  return n.charAt(0).toUpperCase();
}

/* ============ tarjetas y cálculo ============ */
function hoyosDe(canchaId, mat) {
  if (!E) return [];
  for (var i = 0; i < E.tarjetas.length; i++)
    if (E.tarjetas[i].cancha === canchaId && String(E.tarjetas[i].matricula) === String(mat))
      return E.tarjetas[i].hoyos;
  return [];
}
function hcpJuego(j) { return Math.round(Number(j.handicap) || 0); }
function golpesHoyo(p, si) {
  if (p >= 0) return Math.floor(p / 18) + (si <= (p % 18) ? 1 : 0);
  var q = -p; return -(Math.floor(q / 18) + (si >= 19 - (q % 18) ? 1 : 0));
}
function calc(c, j) {
  var arr = hoyosDe(c.id, j.matricula), p = hcpJuego(j);
  var r = { thru: 0, bruto: 0, neto: 0, pts: 0, parJug: 0, birdies: 0, eagles: 0, hoyos: [] };
  for (var i = 0; i < 18; i++) {
    var par = Number(c.par[i]) || 4, si = Number(c.si[i]) || (i + 1);
    var rec = golpesHoyo(p, si), g = (arr[i] == null ? null : Number(arr[i]));
    var o = { i: i, par: par, si: si, rec: rec, g: g, neto: null, pts: 0 };
    if (g != null && !isNaN(g)) {
      r.thru++; r.bruto += g; r.parJug += par;
      o.neto = g - rec; r.neto += o.neto;
      o.pts = Math.max(0, 2 + par - o.neto); r.pts += o.pts;
      if (g <= par - 2) r.eagles++; else if (g === par - 1) r.birdies++;
    }
    r.hoyos.push(o);
  }
  r.vsPar = r.bruto - r.parJug; r.vsParNeto = r.neto - r.parJug;
  return r;
}
function acumulado(cid) {
  var cs = (cid === 'general') ? E.canchas : E.canchas.filter(function (c) { return c.id === cid; });
  return E.jugadores.map(function (j, idx) {
    var a = { jug: j, orden: idx, thru: 0, bruto: 0, neto: 0, pts: 0, vsPar: 0, vsParNeto: 0, birdies: 0, eagles: 0, vueltas: 0 };
    cs.forEach(function (c) {
      var r = calc(c, j);
      if (r.thru > 0) a.vueltas++;
      a.thru += r.thru; a.bruto += r.bruto; a.neto += r.neto; a.pts += r.pts;
      a.vsPar += r.vsPar; a.vsParNeto += r.vsParNeto; a.birdies += r.birdies; a.eagles += r.eagles;
    });
    return a;
  });
}
function ordenar(lista) {
  var m = UI.metrica, l = lista.slice();
  l.sort(function (a, b) {
    if (a.thru === 0 && b.thru === 0) return a.orden - b.orden;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    if (m === 'stableford') { if (b.pts !== a.pts) return b.pts - a.pts; return b.thru - a.thru; }
    if (m === 'neto') { if (a.vsParNeto !== b.vsParNeto) return a.vsParNeto - b.vsParNeto; return b.thru - a.thru; }
    if (a.vsPar !== b.vsPar) return a.vsPar - b.vsPar; return b.thru - a.thru;
  });
  var pos = 0, prev = null, n = 0;
  l.forEach(function (x) {
    n++;
    var clave = x.thru === 0 ? 'sin' : (m === 'stableford' ? x.pts : (m === 'neto' ? x.vsParNeto : x.vsPar));
    if (clave !== prev) { pos = n; prev = clave; x.empate = false; } else x.empate = true;
    x.pos = x.thru === 0 ? null : pos;
  });
  for (var i = 0; i < l.length; i++) if (l[i].empate && l[i - 1]) l[i - 1].empate = true;
  return l;
}
function valorMetrica(a) {
  if (UI.metrica === 'stableford') return { b: a.pts, s: 'puntos' };
  if (UI.metrica === 'neto') return { b: signo(a.vsParNeto), s: 'neto ' + a.neto };
  return { b: signo(a.vsPar), s: 'bruto ' + a.bruto };
}

/* ============ red ============ */
function pedir(cuerpo) {
  if (!API) return Promise.reject(new Error('sin_api'));
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo)
  }).then(function (r) {
    return r.text().then(function (t) {
      var limpio = String(t || '').trim();
      if (limpio.charAt(0) === '{') { try { return JSON.parse(limpio); } catch (e) {} }
      // Google devolvió una página en vez de datos: casi siempre es el login
      var err = new Error(/accounts\.google|ServiceLogin|iniciar sesión|sign in|autoriza/i.test(limpio)
        ? 'necesita_login' : 'respuesta_invalida');
      err.detalle = limpio.slice(0, 180);
      throw err;
    });
  }, function () { throw new Error('sin_conexion'); });
}
function traerEstado() {
  if (!SES) return Promise.resolve();
  return pedir({ accion: 'estado', token: SES.token }).then(function (res) {
    if (res && res.ok) { adoptar(res.estado); ultimoError = ''; }
    else if (res && res.error === 'sesion_vencida') salir();
    return res;
  });
}
function adoptar(estado) {
  if (!estado) return;
  E = estado;
  guardarLS(LS.est, E);
  if (!UI.cancha || !cancha(UI.cancha)) UI.cancha = E.canchas[0] ? E.canchas[0].id : null;
}
function sincronizar() {
  if (sincronizando || !navigator.onLine || !SES || !COLA.length) return Promise.resolve();
  sincronizando = true; pintar();
  var lote = COLA.slice(0, 40);
  var porCancha = {};
  lote.forEach(function (x) { (porCancha[x.cancha] = porCancha[x.cancha] || []).push(x); });
  var ids = Object.keys(porCancha);
  var cadena = Promise.resolve();
  ids.forEach(function (cid) {
    cadena = cadena.then(function () {
      return pedir({
        accion: 'golpes', token: SES.token, cancha: cid,
        hoyos: porCancha[cid].map(function (x) { return { hoyo: x.hoyo, golpes: x.golpes }; })
      }).then(function (res) {
        if (res && res.ok) {
          COLA = COLA.filter(function (x) { return porCancha[cid].indexOf(x) < 0; });
          guardarLS(LS.cola, COLA);
          adoptar(res.estado);
        } else if (res && res.error === 'sesion_vencida') { salir(); throw new Error('sesion'); }
        else throw new Error((res && res.error) || 'fallo');
      });
    });
  });
  return cadena.then(function () {
    sincronizando = false; ultimoError = ''; pintar();
    if (COLA.length) return sincronizar();
  }, function (err) {
    sincronizando = false;
    ultimoError = String(err && err.message || err);
    pintar();
  });
}
function accionar(cuerpo) {
  cuerpo.token = SES && SES.token;
  return pedir(cuerpo).then(function (res) {
    if (res && res.ok) { adoptar(res.estado); ultimoError = ''; }
    else ultimoError = (res && res.error) || 'fallo';
    pintar();
    return res;
  }, function (e) { ultimoError = 'sin_conexion'; pintar(); throw e; });
}
function salir() {
  SES = null; COLA = []; UI.tab = 'posiciones';
  try { localStorage.removeItem(LS.ses); localStorage.removeItem(LS.cola); } catch (e) {}
  pintar();
}

/* ============ instalación en el celular ============ */
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault(); promptInstalar = e; refrescarInstalar();
});
window.addEventListener('appinstalled', function () { promptInstalar = null; refrescarInstalar(); });
function yaInstalada() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  catch (e) { return false; }
}
function esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
function bloqueInstalar() {
  if (yaInstalada()) return '';
  if (promptInstalar) return '<div class="instalar" id="bloque-instalar">' +
    '<span>📲 Tenela como app en el celular</span>' +
    '<button class="btn pri" data-acc="instalar">Instalar</button></div>';
  if (esIOS()) return '<div class="instalar" id="bloque-instalar"><span>📲 Para tenerla como app: tocá ' +
    '<b>Compartir</b> abajo y después <b>Agregar a pantalla de inicio</b>.</span></div>';
  return '<div class="instalar" id="bloque-instalar"><span>📲 Para tenerla como app: menú del navegador ' +
    '(⋮ o ⋯) → <b>Instalar aplicación</b> o <b>Agregar a pantalla de inicio</b>.</span></div>';
}
function refrescarInstalar() {
  var n = document.getElementById('bloque-instalar');
  if (n) n.outerHTML = bloqueInstalar();   // se cambia solo ese bloque para no borrar lo que estés tipeando
}

/* ============ pantalla de ingreso ============ */
function vistaIngreso() {
  var alta = UI.ingreso === 'alta';
  var h = '<div class="pantalla">' +
    '<div class="marca"><div class="crest">GT</div><div><h1>Golf Tour Mdq</h1>' +
    '<p>Mar del Plata · 3 canchas</p></div></div>';
  if (!API) h += '<div class="error">La app todavía no está conectada a la planilla. ' +
    'Falta pegar la URL del Apps Script en <b>config.js</b>.</div>';
  h += bloqueInstalar();
  h += '<section class="card"><div class="tabsdos">' +
    '<button data-acc="modo" data-v="entrar" aria-pressed="' + (!alta) + '">Entrar</button>' +
    '<button data-acc="modo" data-v="alta" aria-pressed="' + alta + '">Primera vez</button></div>' +
    '<div class="form">' +
    (ultimoError ? '<div class="error">' + esc(textoError(ultimoError)) + '</div>' : '') +
    '<div class="campo"><label for="i-mat">Matrícula</label>' +
    '<input id="i-mat" type="text" inputmode="numeric" autocomplete="username" placeholder="tu número de matrícula"></div>' +
    '<div class="campo"><label for="i-pass">Contraseña</label>' +
    '<input id="i-pass" type="password" autocomplete="' + (alta ? 'new-password' : 'current-password') + '" placeholder="' + (alta ? 'elegí una, mínimo 4 caracteres' : '') + '"></div>';
  if (alta) {
    h += '<div class="campo"><label for="i-nom">Nombre y apellido</label>' +
      '<input id="i-nom" type="text" autocomplete="name"></div>' +
      '<div class="campo"><label for="i-hcp">Handicap</label>' +
      '<input id="i-hcp" type="number" step="0.1" placeholder="ej: 14.3"></div>' +
      '<div class="campo"><label for="i-clave">Clave del viaje</label>' +
      '<input id="i-clave" type="text" placeholder="la que pasó el organizador"></div>';
  }
  h += '<button class="btn pri" data-acc="' + (alta ? 'registrar' : 'entrar') + '">' +
    (alta ? 'Crear mi acceso' : 'Entrar') + '</button>' +
    '<span class="hint">Se guarda la sesión en este celular: entrás una vez y listo.</span>' +
    '<button class="btn fin" data-acc="probar">Probar la conexión con la planilla</button>' +
    '</div></section></div>';
  return h;
}
function textoError(e) {
  var t = {
    no_registrado: 'Esa matrícula todavía no está registrada. Entrá por "Primera vez".',
    password_incorrecta: 'La contraseña no coincide.',
    ya_registrado: 'Esa matrícula ya tiene acceso. Entrá con tu contraseña.',
    clave_viaje_invalida: 'La clave del viaje no es correcta. Pedísela al organizador.',
    password_corta: 'La contraseña necesita al menos 4 caracteres.',
    falta_matricula: 'Falta la matrícula.',
    sesion_vencida: 'Se venció la sesión. Volvé a entrar.',
    solo_admin: 'Eso lo cambia solo el organizador.',
    sin_conexion: 'No se pudo hablar con la planilla. Puede ser que no tengas señal, o que la implementación del Apps Script no esté publicada para "Cualquier usuario".',
    necesita_login: 'El Apps Script está pidiendo iniciar sesión con Google. Hay que volver a implementarlo con «Ejecutar como: Yo» y «Quién tiene acceso: Cualquier usuario».',
    respuesta_invalida: 'El backend contestó algo que no es un dato válido. Suele ser un error dentro del script: revisá Ejecuciones en el editor de Apps Script.',
    sin_api: 'La app no está conectada a la planilla todavía.'
  };
  return t[e] || ('Algo falló: ' + e);
}

/* ============ vistas ============ */
function chipsCancha(sel, acc, conGeneral) {
  var h = '<div class="seg" role="group">';
  if (conGeneral) h += '<button data-acc="' + acc + '" data-v="general" aria-pressed="' + (sel === 'general') + '">General</button>';
  E.canchas.forEach(function (c) {
    h += '<button data-acc="' + acc + '" data-v="' + c.id + '" aria-pressed="' + (sel === c.id) + '">Día ' + c.dia + '</button>';
  });
  return h + '</div>';
}

function vistaPosiciones() {
  var lista = ordenar(acumulado(UI.canchaLb));
  var c = UI.canchaLb === 'general' ? null : cancha(UI.canchaLb);
  var titulo = c ? esc(c.nombre) + ' · Día ' + c.dia : esc(E.torneo.nombre) + ' · las 3 vueltas';
  var max = 1; lista.forEach(function (a) { if (UI.metrica === 'stableford' && a.pts > max) max = a.pts; });

  var h = '<div class="pila">' + chipsCancha(UI.canchaLb, 'lb-cancha', true) + panelEquipos(UI.canchaLb) +
    '<div class="seg" role="group">' +
    '<button data-acc="metrica" data-v="stableford" aria-pressed="' + (UI.metrica === 'stableford') + '">Stableford</button>' +
    '<button data-acc="metrica" data-v="neto" aria-pressed="' + (UI.metrica === 'neto') + '">Neto</button>' +
    '<button data-acc="metrica" data-v="bruto" aria-pressed="' + (UI.metrica === 'bruto') + '">Bruto</button></div>' +
    '<section class="card lb"><div class="lb-cab"><h2>' + titulo + '</h2><span class="eyebrow">' +
    (UI.metrica === 'stableford' ? 'puntos' : (UI.metrica === 'neto' ? 'vs par neto' : 'vs par bruto')) + '</span></div>';

  if (!lista.filter(function (a) { return a.thru > 0; }).length) {
    h += '<p class="vacio">Todavía no hay golpes cargados.<br>Andá a <b>Cargar</b> y arrancá por el hoyo 1.</p>';
  } else {
    lista.forEach(function (a) {
      var v = valorMetrica(a);
      var ancho = (UI.metrica === 'stableford' && a.thru > 0) ? Math.round(Math.max(a.pts, 0) / max * 100) : 0;
      var meta = ['HCP ' + (Number(a.jug.handicap) || 0)];
      if (UI.canchaLb === 'general') meta.push(a.vueltas + (a.vueltas === 1 ? ' vuelta' : ' vueltas'));
      if (a.thru > 0 && a.thru % 18 !== 0) meta.push('<span class="thru">hoyo ' + a.thru + '</span>');
      else if (a.thru > 0) meta.push('completa');
      if (a.birdies) meta.push(a.birdies + ' birdie' + (a.birdies > 1 ? 's' : ''));
      if (a.eagles) meta.push(a.eagles + ' eagle' + (a.eagles > 1 ? 's' : ''));
      h += '<button class="lb-row" data-acc="ver-jug" data-v="' + esc(a.jug.matricula) + '">' +
        (ancho ? '<i class="barra" style="width:' + ancho + '%"></i>' : '') +
        '<span class="pos' + (a.pos === 1 ? ' p1' : '') + '">' + (a.pos ? (a.empate ? '=' : '') + a.pos : '–') + '</span>' +
        avatar(a.jug) +
        '<span><span class="lb-nom' + claseTxt(a.jug) + '">' + esc(a.jug.nombre) + '</span>' +
        '<span class="lb-meta">' + meta.join(' · ') + '</span></span>' +
        '<span class="lb-val"><b>' + (a.thru ? v.b : '–') + '</b><span>' + (a.thru ? v.s : 'sin cargar') + '</span></span></button>';
    });
  }
  return h + '</section></div>';
}

function totalEquipo(cid, k) {
  var cs = (cid === 'general') ? E.canchas : E.canchas.filter(function (c) { return c.id === cid; });
  var pts = 0, n = 0, jugando = 0;
  E.jugadores.forEach(function (j) {
    if (j.equipo !== k) return;
    n++; var t = 0, hay = false;
    cs.forEach(function (c) { var r = calc(c, j); t += r.pts; if (r.thru) hay = true; });
    if (hay) jugando++;
    pts += t;
  });
  return { pts: pts, n: n, jugando: jugando };
}
function panelEquipos(cid) {
  var a = totalEquipo(cid, 'azul'), r = totalEquipo(cid, 'rojo');
  if (!a.n && !r.n) return '';
  var tot = a.pts + r.pts, pa = tot ? Math.round(a.pts / tot * 100) : 50;
  var estado = a.pts === r.pts ? 'empatados' :
    (a.pts > r.pts ? nombreEquipo('azul') + ' arriba por ' + (a.pts - r.pts)
                   : nombreEquipo('rojo') + ' arriba por ' + (r.pts - a.pts));
  return '<section class="card"><div class="lb-cab"><h2>Copa Ryder</h2><span class="eyebrow">' + esc(estado) + '</span></div>' +
    '<div class="marcador-eq">' +
    '<div class="lado"><b class="txt-azul">' + a.pts + '</b><span class="txt-azul">' + esc(nombreEquipo('azul')) + '</span>' +
    '<i>' + a.n + ' jugadores' + (a.jugando ? ' · ' + a.jugando + ' con tarjeta' : '') + '</i></div>' +
    '<div class="vs">vs</div>' +
    '<div class="lado"><b class="txt-rojo">' + r.pts + '</b><span class="txt-rojo">' + esc(nombreEquipo('rojo')) + '</span>' +
    '<i>' + r.n + ' jugadores' + (r.jugando ? ' · ' + r.jugando + ' con tarjeta' : '') + '</i></div></div>' +
    '<div class="barra-eq"><i class="a" style="width:' + pa + '%"></i><i class="r" style="width:' + (100 - pa) + '%"></i></div></section>';
}

function vistaCargar() {
  var c = canchaActual(), j = yo();
  if (!c || !j) return '<p class="vacio">Cargando…</p>';
  var r = calc(c, j), i = Math.min(Math.max(UI.hoyo, 0), 17), o = r.hoyos[i];
  var ida = 0, vta = 0, tot = 0;
  r.hoyos.forEach(function (x, k) { if (x.g != null) { tot += x.g; if (k < 9) ida += x.g; else vta += x.g; } });

  var h = '<div class="pila">' +
    '<div class="candado solo"><span>🔒</span><span>Estás cargando <b class="' + claseTxt(j).trim() + '">tu</b> tarjeta. La de cada uno la carga su dueño, nadie más.</span></div>' +
    chipsCancha(c.id, 'sel-cancha', false) +
    '<section class="card"><div class="hoyo">' +
    '<div class="eyebrow">' + esc(c.nombre) + '</div><div class="n">' + (i + 1) + '</div>' +
    '<div class="datos"><span class="pin">Par ' + o.par + '</span><span class="pin">SI ' + o.si + '</span>' +
    (o.rec !== 0 ? '<span class="pin recibe">' + (o.rec > 0 ? 'recibe ' + o.rec + ' golpe' + (o.rec > 1 ? 's' : '') : 'devuelve ' + (-o.rec)) + '</span>'
                 : '<span class="pin">sin golpe</span>') + '</div>' +
    '<div class="marcador"><button class="rd" data-acc="menos" aria-label="Un golpe menos">−</button>' +
    '<span class="val' + (o.g == null ? ' sin' : '') + '">' + (o.g == null ? '–' : o.g) + '</span>' +
    '<button class="rd" data-acc="mas" aria-label="Un golpe más">+</button></div>' +
    '<div class="hint">' + (o.g == null ? 'Tocá un resultado o usá + / −'
      : 'Neto ' + o.neto + ' · <b>' + o.pts + ' punto' + (o.pts === 1 ? '' : 's') + '</b>') + '</div>' +
    '<div class="rapidos">' +
    [[o.par - 2, 'Eagle'], [o.par - 1, 'Birdie'], [o.par, 'Par'], [o.par + 1, 'Bogey']].map(function (q) {
      return '<button data-acc="set" data-v="' + q[0] + '"' + (o.g === q[0] ? ' style="border-color:var(--verde)"' : '') +
        '><b>' + q[0] + '</b>' + q[1] + '</button>';
    }).join('') +
    '<button class="brr" data-acc="borrar"><b>–</b>Borrar</button></div>' +
    '<div class="navh"><button data-acc="hoyo-prev"' + (i === 0 ? ' disabled' : '') + '>← Hoyo ' + (i || 1) + '</button>' +
    '<button class="pri" data-acc="hoyo-next">' + (i === 17 ? 'Terminar' : 'Hoyo ' + (i + 2) + ' →') + '</button></div>' +
    '<div class="dots">' + r.hoyos.map(function (x, k) {
      return '<button data-acc="ir-hoyo" data-v="' + k + '" class="' + (x.g != null ? 'hecho' : '') + '" aria-current="' + (k === i) + '">' + (k + 1) + '</button>';
    }).join('') + '</div></div>' +
    '<div class="puntos"><div><b>' + (ida || '–') + '</b><span>Ida</span></div>' +
    '<div><b>' + (vta || '–') + '</b><span>Vuelta</span></div>' +
    '<div><b>' + (tot || '–') + '</b><span>Total</span></div>' +
    '<div><b>' + (r.thru ? signo(r.vsPar) : '–') + '</b><span>vs par</span></div>' +
    '<div><b>' + r.pts + '</b><span>Puntos</span></div></div></section></div>';
  return h;
}

function vistaTarjetas() {
  var c = canchaActual(), modo = UI.vistaTc;
  var h = '<div class="pila">' + chipsCancha(c.id, 'sel-cancha', false) +
    '<div class="seg" role="group">' +
    '<button data-acc="vista-tc" data-v="bruto" aria-pressed="' + (modo === 'bruto') + '">Bruto</button>' +
    '<button data-acc="vista-tc" data-v="neto" aria-pressed="' + (modo === 'neto') + '">Neto</button>' +
    '<button data-acc="vista-tc" data-v="pts" aria-pressed="' + (modo === 'pts') + '">Puntos</button></div>' +
    '<section class="card"><div class="sec-tit"><h2>' + esc(c.nombre) + '</h2><span class="eyebrow">Día ' + c.dia + '</span></div>' +
    '<div class="scroll"><table class="tc"><thead>';
  var enc = '<tr><th class="lbl">Hoyo</th>';
  for (var k = 0; k < 18; k++) { enc += '<th>' + (k + 1) + '</th>'; if (k === 8) enc += '<th class="tot">Ida</th>'; }
  enc += '<th class="tot">Vta</th><th class="tot">Tot</th><th class="tot">Pts</th></tr>';
  var fPar = '<tr><th class="lbl">Par</th>', so = 0, si = 0;
  for (var a = 0; a < 18; a++) {
    var pv = Number(c.par[a]) || 4; fPar += '<th>' + pv + '</th>';
    if (a < 9) so += pv; else si += pv;
    if (a === 8) fPar += '<th class="tot">' + so + '</th>';
  }
  fPar += '<th class="tot">' + si + '</th><th class="tot">' + (so + si) + '</th><th class="tot">–</th></tr>';
  var fSi = '<tr><th class="lbl">Hcp hoyo</th>';
  for (var b = 0; b < 18; b++) { fSi += '<th>' + (Number(c.si[b]) || (b + 1)) + '</th>'; if (b === 8) fSi += '<th class="tot"></th>'; }
  fSi += '<th class="tot"></th><th class="tot"></th><th class="tot"></th></tr>';
  h += enc + fPar + fSi + '</thead><tbody>';

  E.jugadores.forEach(function (j) {
    var r = calc(c, j), o = 0, n = 0, t = 0;
    var fila = '<tr><td class="lbl' + claseTxt(j) + '">' + esc(nombreCorto(j.nombre)) + '</td>';
    r.hoyos.forEach(function (x, k) {
      var val = '·', cls = '';
      if (x.g != null) {
        val = (modo === 'bruto') ? x.g : (modo === 'neto' ? x.neto : x.pts);
        if (modo !== 'pts') {
          var ref = (modo === 'bruto' ? x.g : x.neto) - x.par;
          if (ref <= -2) cls = 'marca cc'; else if (ref === -1) cls = 'marca c';
          else if (ref === 1) cls = 'marca s'; else if (ref >= 2) cls = 'marca ss';
        }
        if (k < 9) o += Number(val); else n += Number(val); t += Number(val);
      }
      fila += '<td>' + (cls ? '<span class="' + cls + '">' + val + '</span>' : val) + '</td>';
      if (k === 8) fila += '<td class="tot">' + (o || '·') + '</td>';
    });
    h += fila + '<td class="tot">' + (n || '·') + '</td><td class="tot">' + (t || '·') + '</td><td class="tot">' + r.pts + '</td></tr>';
  });
  return h + '</tbody></table></div><div class="acc"><span class="hint">Círculo rojo = bajo par · cuadrado azul = sobre par. Doble marco: eagle o doble bogey.</span></div></section></div>';
}

function vistaJugadores() {
  var h = '<div class="pila"><section class="card"><div class="sec-tit"><h2>Los jugadores</h2>' +
    '<span class="eyebrow">' + E.jugadores.length + ' registrados</span></div>';
  if (!E.jugadores.length) h += '<p class="vacio">Todavía no se registró nadie.</p>';
  E.jugadores.forEach(function (j) {
    var t = acumulado('general').filter(function (a) { return String(a.jug.matricula) === String(j.matricula); })[0];
    h += '<div class="jug">' + avatar(j) +
      '<span><span class="lb-nom' + claseTxt(j) + '">' + esc(j.nombre) +
      (SES && String(SES.matricula) === String(j.matricula) ? ' <span class="eyebrow">· vos</span>' : '') + '</span>' +
      '<span class="lb-meta">Mat. ' + esc(j.matricula) + ' · HCP ' + esc(j.handicap) + ' · ' + esc(nombreEquipo(j.equipo)) +
      (j.rol === 'admin' ? ' · organizador' : '') + (t && t.thru ? ' · ' + t.pts + ' pts' : '') + '</span></span>' +
      (puedeEditar(j.matricula)
        ? '<button class="btn fin" data-acc="ir-perfil">Editar</button>'
        : '<span class="eyebrow" title="Solo lo edita su dueño">🔒</span>') +
      '</div>';
  });
  return h + '</section><div class="aviso"><span>🎯</span><span>Cada uno entra con su matrícula y su contraseña y aparece acá automáticamente. Nadie edita los datos ni la tarjeta de otro, el organizador tampoco.</span></div></div>';
}

function vistaCanchas() {
  var admin = esAdmin();
  var h = '<div class="pila">';
  if (!admin) h += '<div class="candado solo"><span>🔒</span><span>Las canchas las carga el organizador. Acá las ves como quedaron.</span></div>';
  var faltan = E.canchas.filter(function (c) { return !c.confirmada; });
  if (faltan.length) h += '<div class="aviso"><span>⚠️</span><span><b>Falta' + (faltan.length > 1 ? 'n ' : ' ') + faltan.length + ' tarjeta' + (faltan.length > 1 ? 's' : '') + '.</b> ' +
    faltan.map(function (c) { return esc(c.nombre) + ' (par ' + c.par.reduce(function (m, n) { return m + n; }, 0) + ' provisorio)'; }).join(' y ') +
    '. El par y el índice de cada hoyo definen los netos y los puntos.</span></div>';

  E.canchas.forEach(function (c) {
    var totPar = c.par.reduce(function (m, n) { return m + (Number(n) || 0); }, 0);
    var abierta = UI.editando === c.id;
    h += '<section class="card"><div class="sec-tit"><h2>Día ' + c.dia + ' · ' + esc(c.nombre) + '</h2>' +
      '<span class="pin' + (c.confirmada ? '' : ' recibe') + '">par ' + totPar + (c.confirmada ? ' · oficial' : ' · provisorio') + '</span></div>' +
      '<div class="grid2"><div class="campo"><label for="c-' + c.id + '">Cancha</label>' +
      '<input id="c-' + c.id + '" type="text" value="' + esc(c.nombre) + '" data-acc="ed-cancha" data-v="' + c.id + '"' + (admin ? '' : ' disabled') + '></div></div>' +
      '<div class="acc" style="padding-top:0"><button class="btn fin" data-acc="abrir-cancha" data-v="' + c.id + '">' +
      (abierta ? '▲ Ocultar los 18 hoyos' : '▼ Ver y editar los 18 hoyos') + '</button></div>';
    if (abierta) {
      h += '<div class="hoyo-ed" style="padding-bottom:8px"><span></span><span class="eyebrow">Par</span><span class="eyebrow">Hcp hoyo</span></div>';
      for (var i = 0; i < 18; i++) {
        h += '<div class="hoyo-ed"><span>' + (i + 1) + '</span>' +
          '<input type="number" min="3" max="6" value="' + c.par[i] + '" data-acc="ed-par" data-v="' + c.id + '" data-i="' + i + '" aria-label="Par hoyo ' + (i + 1) + '"' + (admin ? '' : ' disabled') + '>' +
          '<input type="number" min="1" max="18" value="' + c.si[i] + '" data-acc="ed-si" data-v="' + c.id + '" data-i="' + i + '" aria-label="Índice hoyo ' + (i + 1) + '"' + (admin ? '' : ' disabled') + '></div>';
      }
      if (admin) h += '<div class="acc"><button class="btn' + (c.confirmada ? '' : ' pri') + '" data-acc="confirmar" data-v="' + c.id + '">' +
        (c.confirmada ? '✓ Tarjeta oficial' : 'Marcar como tarjeta oficial') + '</button>' +
        '<span class="hint" style="flex:1;min-width:180px">El índice va del 1 al 18: 1 es el hoyo más difícil.</span></div>';
    }
    h += '</section>';
  });

  if (admin) h += '<section class="card"><div class="sec-tit"><h2>El torneo</h2></div>' +
    '<div class="grid2"><div class="campo"><label for="t-azul">Equipo azul</label>' +
    '<input id="t-azul" type="text" value="' + esc(nombreEquipo('azul')) + '" data-acc="ed-eq" data-v="azul"></div>' +
    '<div class="campo"><label for="t-rojo">Equipo rojo</label>' +
    '<input id="t-rojo" type="text" value="' + esc(nombreEquipo('rojo')) + '" data-acc="ed-eq" data-v="rojo"></div></div>' +
    '<div class="acc"><button class="btn" data-acc="exportar">Descargar planilla (CSV)</button>' +
    '<button class="btn fin peli" data-acc="reset">Borrar todas las tarjetas</button></div></section>';
  return h + '</div>';
}

function vistaPerfil() {
  var y = yo();
  if (!y) return '<p class="vacio">Cargando…</p>';
  var golpes = E.canchas.map(function (c) {
    var n = 0; for (var i = 0; i < 18; i++) n += golpesHoyo(hcpJuego(y), Number(c.si[i]) || (i + 1));
    return esc(c.nombre) + ': ' + n;
  }).join(' · ');
  return '<div class="pila">' + bloqueInstalar() + '<section class="card">' +
    '<div class="perfil-cab"><div class="perfil-foto' + claseEq(y) + '">' +
    (y.fotoId ? '<img src="https://drive.google.com/thumbnail?id=' + esc(y.fotoId) + '&sz=w320" alt="">' : esc(inicial(y))) + '</div>' +
    '<div><h2 class="' + claseTxt(y).trim() + '">' + esc(y.nombre) + '</h2>' +
    '<div class="lb-meta">Matrícula ' + esc(y.matricula) + ' · HCP ' + esc(y.handicap) +
    ' · juega con ' + hcpJuego(y) + ' golpes · ' + esc(nombreEquipo(y.equipo)) + '</div></div></div>' +
    '<div class="grid2">' +
    '<div class="campo"><label for="p-nom">Nombre</label><input id="p-nom" type="text" value="' + esc(y.nombre) + '" data-acc="ed-perfil" data-v="nombre"></div>' +
    '<div class="campo"><label for="p-hcp">Handicap</label><input id="p-hcp" type="number" step="0.1" value="' + esc(y.handicap) + '" data-acc="ed-perfil" data-v="handicap"></div>' +
    '<div class="campo"><label for="p-club">Club</label><input id="p-club" type="text" value="' + esc(y.club) + '" placeholder="opcional" data-acc="ed-perfil" data-v="club"></div>' +
    '<div class="campo"><label for="p-apo">Apodo</label><input id="p-apo" type="text" value="' + esc(y.apodo || '') + '" placeholder="opcional" data-acc="ed-perfil" data-v="apodo"></div></div>' +
    '<div class="grid2" style="grid-template-columns:1fr"><div class="campo"><label>Equipo</label>' +
    '<div class="pick-eq"><button class="a" data-acc="mi-equipo" data-v="azul" aria-pressed="' + (y.equipo === 'azul') + '">' + esc(nombreEquipo('azul')) + '</button>' +
    '<button class="r" data-acc="mi-equipo" data-v="rojo" aria-pressed="' + (y.equipo === 'rojo') + '">' + esc(nombreEquipo('rojo')) + '</button></div></div></div>' +
    '<div class="candado"><span>⛳</span><span>Con handicap ' + esc(y.handicap) + ' recibís ' + golpes + ' golpes.</span></div></section>' +
    '<section class="card"><div class="sec-tit"><h2>Tu acceso</h2></div>' +
    '<div class="grid2"><div class="campo"><label for="p-pass">Cambiar contraseña</label>' +
    '<input id="p-pass" type="password" placeholder="mínimo 4 caracteres" data-acc="ed-pass"></div></div>' +
    '<div class="candado" style="border-top:0"><span>🔒</span><span>Editás <b>tu</b> perfil y <b>tu</b> tarjeta.' +
    (esAdmin() ? ' Como organizador además cargás las canchas y los nombres de los equipos — pero los datos y las tarjetas de los demás tampoco los tocás.' : '') + '</span></div>' +
    '<div class="acc"><button class="btn fin" data-acc="salir">Cerrar sesión en este celular</button></div></section></div>';
}

/* ============ armado ============ */
var TABS = [['posiciones', 'Posiciones'], ['cargar', 'Cargar'], ['tarjetas', 'Tarjetas'], ['jugadores', 'Jugadores'], ['canchas', 'Canchas']];

function barraEstado() {
  if (COLA.length && !navigator.onLine)
    return '<div class="barra-estado">📴 Sin señal · ' + COLA.length + ' golpe' + (COLA.length > 1 ? 's' : '') + ' esperando para subir</div>';
  if (sincronizando) return '<div class="barra-estado sync"><i class="girar"></i>Sincronizando…</div>';
  if (COLA.length) return '<div class="barra-estado">⏳ ' + COLA.length + ' cambio' + (COLA.length > 1 ? 's' : '') + ' sin subir · <button class="btn fin" data-acc="sync">reintentar</button></div>';
  if (!navigator.onLine) return '<div class="barra-estado">📴 Sin señal · todo lo que cargues se guarda igual</div>';
  return '';
}
function pintar() {
  var app = document.getElementById('app');
  if (!SES) { app.innerHTML = vistaIngreso(); return; }
  if (!E) { app.innerHTML = '<div class="pantalla"><p class="vacio">Cargando el torneo…</p></div>'; return; }
  var y = yo();
  var vista = UI.tab === 'cargar' ? vistaCargar() : UI.tab === 'tarjetas' ? vistaTarjetas() :
    UI.tab === 'jugadores' ? vistaJugadores() : UI.tab === 'canchas' ? vistaCanchas() :
    UI.tab === 'perfil' ? vistaPerfil() : vistaPosiciones();
  app.innerHTML = barraEstado() + '<div class="wrap">' +
    '<div class="cab-top">' +
    '<button class="chip-estado" data-acc="info"><span class="punto' + (navigator.onLine ? ' vivo' : ' gris') + '"></span>' +
    (navigator.onLine ? 'En vivo' : 'Sin señal') + '</button>' +
    '<button class="btn-perfil" data-acc="ir-perfil">' + avatar(y) +
    '<span class="nom' + claseTxt(y) + '">' + esc(nombreCorto(y ? y.nombre : '')) + '</span></button></div>' +
    '<header class="cab"><div class="crest">GT</div><div class="tit"><h1>' + esc(E.torneo.nombre) + '</h1>' +
    '<div class="sub">' + esc(E.torneo.sede) + ' · ' + E.canchas.length + ' canchas</div></div></header>' +
    '<nav class="tabs">' + TABS.map(function (t) {
      return '<button data-acc="tab" data-v="' + t[0] + '" aria-current="' + (UI.tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</nav><main>' + vista + '</main>' +
    '<footer class="pie">' + esc(E.torneo.nombre) + ' · ' + esc(E.torneo.edicion || '') +
    (E.sello ? '<small>actualizado ' + hora(E.sello) + '</small>' : '') + '</footer></div>';
}

/* ============ acciones ============ */
document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-acc]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  var a = b.getAttribute('data-acc'), v = b.getAttribute('data-v');

  if (a === 'modo') { UI.ingreso = v; ultimoError = ''; pintar(); return; }
  if (a === 'entrar' || a === 'registrar') { ingresar(a === 'registrar'); return; }
  if (a === 'salir') { if (confirm('¿Cerrar sesión en este celular?')) salir(); return; }
  if (a === 'sync') { sincronizar(); return; }
  if (a === 'probar') { probarConexion(b); return; }
  if (a === 'instalar') {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    promptInstalar.userChoice.then(function () { promptInstalar = null; refrescarInstalar(); },
                                   function () { promptInstalar = null; refrescarInstalar(); });
    return;
  }
  if (a === 'info') { alert(textoInfo()); return; }
  if (!E) return;

  if (a === 'tab') { UI.tab = v; UI.editando = null; }
  else if (a === 'ir-perfil') { UI.tab = 'perfil'; }
  else if (a === 'lb-cancha') { UI.canchaLb = v; }
  else if (a === 'metrica') { UI.metrica = v; }
  else if (a === 'sel-cancha') { UI.cancha = v; UI.hoyo = primerLibre(); }
  else if (a === 'vista-tc') { UI.vistaTc = v; }
  else if (a === 'ver-jug') { UI.canchaLb = UI.canchaLb; }
  else if (a === 'ir-hoyo') { UI.hoyo = Number(v); }
  else if (a === 'hoyo-prev') { UI.hoyo = Math.max(0, UI.hoyo - 1); }
  else if (a === 'hoyo-next') { if (UI.hoyo === 17) { UI.tab = 'posiciones'; UI.canchaLb = canchaActual().id; } else UI.hoyo++; }
  else if (a === 'mas' || a === 'menos' || a === 'set' || a === 'borrar') { anotarGolpe(a, v); return; }
  else if (a === 'abrir-cancha') { UI.editando = (UI.editando === v ? null : v); }
  else if (a === 'confirmar') { var c = cancha(v); accionar({ accion: 'cancha', id: v, confirmada: !c.confirmada }); return; }
  else if (a === 'mi-equipo') { accionar({ accion: 'perfil', equipo: v }); return; }
  else if (a === 'reset') { if (confirm('Esto borra TODAS las tarjetas de las 3 canchas. ¿Seguro?')) accionar({ accion: 'borrar' }); return; }
  else if (a === 'exportar') { exportar(); return; }
  else return;
  guardarUI(); pintar();
});

document.addEventListener('change', function (ev) {
  var el = ev.target.closest('[data-acc]');
  if (!el || !E) return;
  var a = el.getAttribute('data-acc'), v = el.getAttribute('data-v'), i = Number(el.getAttribute('data-i'));
  if (a === 'ed-perfil') { var p = { accion: 'perfil' }; p[v] = el.value.trim(); accionar(p); }
  else if (a === 'ed-pass') { if (el.value.length >= 4) accionar({ accion: 'perfil', password: el.value }).then(function () { el.value = ''; alert('Contraseña cambiada.'); }); }
  else if (a === 'ed-cancha') { accionar({ accion: 'cancha', id: v, nombre: el.value.trim() }); }
  else if (a === 'ed-par' || a === 'ed-si') {
    var c = cancha(v); if (!c) return;
    var par = c.par.slice(), si = c.si.slice();
    if (a === 'ed-par') par[i] = Math.min(6, Math.max(3, Number(el.value) || 4));
    else si[i] = Math.min(18, Math.max(1, Number(el.value) || 1));
    accionar({ accion: 'cancha', id: v, par: par, si: si });
  }
  else if (a === 'ed-eq') { var q = { accion: 'equipos' }; q[v] = el.value.trim(); accionar(q); }
});

function ingresar(alta) {
  var mat = (document.getElementById('i-mat') || {}).value || '';
  var pass = (document.getElementById('i-pass') || {}).value || '';
  var cuerpo = { accion: alta ? 'registrar' : 'login', matricula: mat.trim(), password: pass };
  if (alta) {
    cuerpo.nombre = (document.getElementById('i-nom') || {}).value || '';
    cuerpo.handicap = (document.getElementById('i-hcp') || {}).value || 0;
    cuerpo.claveViaje = (document.getElementById('i-clave') || {}).value || '';
  }
  ultimoError = '';
  pedir(cuerpo).then(function (res) {
    if (res && res.ok) {
      SES = { token: res.token, matricula: res.jugador.matricula };
      guardarLS(LS.ses, SES);
      adoptar(res.estado);
      UI.tab = 'posiciones';
      guardarUI(); pintar(); arrancarReloj();
    } else { ultimoError = (res && res.error) || 'fallo'; pintar(); }
  }, function (err) { ultimoError = (err && err.message) || 'sin_conexion'; pintar(); });
}

function primerLibre() {
  var c = canchaActual(), y = yo();
  if (!c || !y) return 0;
  var t = hoyosDe(c.id, y.matricula);
  for (var i = 0; i < 18; i++) if (t[i] == null) return i;
  return 17;
}

function anotarGolpe(a, v) {
  var c = canchaActual(), y = yo();
  if (!c || !y || !puedeEditar(y.matricula)) return;
  var arr = hoyosDe(c.id, y.matricula);
  var par = Number(c.par[UI.hoyo]) || 4, act = arr[UI.hoyo];
  var nuevo;
  if (a === 'borrar') nuevo = null;
  else if (a === 'set') nuevo = Math.max(1, Number(v));
  else if (a === 'mas') nuevo = (act == null ? par : act + 1);
  else nuevo = (act == null ? par : Math.max(1, act - 1));

  // 1) se aplica al instante en el celular
  var t = null;
  for (var i = 0; i < E.tarjetas.length; i++)
    if (E.tarjetas[i].cancha === c.id && String(E.tarjetas[i].matricula) === String(y.matricula)) { t = E.tarjetas[i]; break; }
  if (!t) { t = { cancha: c.id, matricula: String(y.matricula), hoyos: new Array(18).fill(null) }; E.tarjetas.push(t); }
  t.hoyos[UI.hoyo] = nuevo;
  guardarLS(LS.est, E);

  // 2) se encola y se sube cuando haya señal
  COLA = COLA.filter(function (x) {
    return !(x.cancha === c.id && String(x.matricula) === String(y.matricula) && x.hoyo === UI.hoyo + 1);
  });
  COLA.push({ cancha: c.id, matricula: String(y.matricula), hoyo: UI.hoyo + 1, golpes: nuevo });
  guardarLS(LS.cola, COLA);

  if (a === 'set' && UI.hoyo < 17) UI.hoyo++;
  guardarUI(); pintar();
  sincronizar();
}

function exportar() {
  var f = ['Dia,Cancha,Matricula,Jugador,HCP,' + Array.apply(null, Array(18)).map(function (_, i) { return 'H' + (i + 1); }).join(',') + ',Bruto,Neto,Puntos'];
  E.canchas.forEach(function (c) {
    E.jugadores.forEach(function (j) {
      var r = calc(c, j); if (!r.thru) return;
      f.push([c.dia, '"' + c.nombre.replace(/"/g, '""') + '"', j.matricula, '"' + j.nombre.replace(/"/g, '""') + '"', j.handicap]
        .concat(r.hoyos.map(function (x) { return x.g == null ? '' : x.g; }))
        .concat([r.bruto, r.neto, r.pts]).join(','));
    });
  });
  var texto = f.join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = 'golf-tour-mdq.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function probarConexion(boton) {
  boton.textContent = 'Probando…';
  pedir({ accion: 'ping' }).then(function (res) {
    boton.textContent = 'Probar la conexión con la planilla';
    alert(res && res.ok ? '✅ La planilla responde bien. El problema no es la conexión.'
                        : '⚠️ Respondió pero con un error: ' + JSON.stringify(res));
  }, function (err) {
    boton.textContent = 'Probar la conexión con la planilla';
    alert('❌ ' + textoError((err && err.message) || 'sin_conexion') +
      (err && err.detalle ? '\n\nLo que contestó Google:\n' + err.detalle : ''));
  });
}
function textoInfo() {
  if (!navigator.onLine) return 'Sin señal. Podés seguir cargando: los golpes quedan guardados en el celular y se suben solos cuando vuelva la conexión.';
  return 'En vivo: cada golpe que cargás se sube a la planilla y aparece en el celular de todos.';
}

/* ============ arranque ============ */
function arrancarReloj() {
  if (reloj) clearInterval(reloj);
  reloj = setInterval(function () {
    if (document.hidden || !navigator.onLine || !SES) return;
    if (COLA.length) sincronizar(); else traerEstado().then(pintar, function () {});
  }, 20000);
}
window.addEventListener('online', function () { pintar(); sincronizar().then(traerEstado).then(pintar, function () {}); });
window.addEventListener('offline', pintar);
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && SES && navigator.onLine) { sincronizar(); traerEstado().then(pintar, function () {}); }
});

pintar();
if (SES) {
  arrancarReloj();
  sincronizar().then(function () { return traerEstado(); }).then(pintar, function () { pintar(); });
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
})();
