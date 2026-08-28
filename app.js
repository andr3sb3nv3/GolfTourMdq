/* GOLF TOUR MDQ — aplicación */
(function () {
'use strict';

var LS = { ses: 'gtm-sesion', est: 'gtm-estado', cola: 'gtm-cola', ui: 'gtm-ui' };
var API = (window.GTM_CONFIG && window.GTM_CONFIG.api) || '';

var SES = leerLS(LS.ses, null);          // { token, matricula }
var E   = leerLS(LS.est, null);          // último estado conocido del servidor
var COLA = leerLS(LS.cola, []);          // golpes pendientes de sincronizar
var UI = Object.assign({ tab: 'posiciones', cancha: null, canchaLb: 'general',
  metrica: 'neto', hoyo: 0, vistaTc: 'bruto', editando: null, ingreso: 'entrar', canchaRyder: null,
  jugador: null }, leerLS(LS.ui, {}));

var sincronizando = false, ultimoError = '', reloj = null, promptInstalar = null;
var TEST = leerLS('gtm-test-on', false);
var PROD = null;                     // acá se guarda el estado real mientras estás en testeo

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
function yo() {
  if (TEST) return jugador(UI.yoTest) || (E && E.jugadores[0]) || null;
  return SES ? jugador(SES.matricula) : null;
}
function esAdmin() { var y = yo(); return !!y && y.rol === 'admin'; }
function puedeEditar(mat) { var y = yo(); return !!y && String(mat) === String(y.matricula); }
function nombreEquipo(k) { return (E && E.equipos && E.equipos[k] && E.equipos[k].nombre) || (k === 'azul' ? 'Azul' : 'Rojo'); }
function claseEq(j) { return j && j.equipo === 'azul' ? ' eq-azul' : (j && j.equipo === 'rojo' ? ' eq-rojo' : ''); }
function claseTxt(j) { return j && j.equipo === 'azul' ? ' txt-azul' : (j && j.equipo === 'rojo' ? ' txt-rojo' : ''); }
function avatar(j, extra) {
  var c = 'av' + claseEq(j) + (extra ? ' ' + extra : '');
  if (j && j.foto) return '<img class="' + c + '" src="' + j.foto + '" alt="">';
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
function calc(c, j) { return calcTarjeta(c, hoyosDe(c.id, j.matricula), hcpJuego(j)); }
function calcTarjeta(c, arr, p) {
  arr = arr || [];
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
  // Medal play neto: manda el total de golpes netos; al lado, cómo va contra el par
  if (UI.metrica === 'neto') return { b: a.neto, s: signo(a.vsParNeto) + ' neto' };
  return { b: a.bruto, s: signo(a.vsPar) + ' bruto' };
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
  if (TEST || !SES) return Promise.resolve();
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
  if (TEST || sincronizando || !navigator.onLine || !SES || !COLA.length) return Promise.resolve();
  sincronizando = true; pintar();
  var lote = COLA.slice(0, 40);
  var grupos = {};
  lote.forEach(function (x) {
    var k = x.partido ? 'p:' + x.partido : 'c:' + x.cancha;
    (grupos[k] = grupos[k] || []).push(x);
  });
  var cadena = Promise.resolve();
  Object.keys(grupos).forEach(function (k) {
    cadena = cadena.then(function () {
      var items = grupos[k];
      var cuerpo = k.charAt(0) === 'p'
        ? { accion: 'golpesEquipo', token: SES.token, partido: k.slice(2) }
        : { accion: 'golpes', token: SES.token, cancha: k.slice(2) };
      cuerpo.hoyos = items.map(function (x) { return { hoyo: x.hoyo, golpes: x.golpes }; });
      return pedir(cuerpo).then(function (res) {
        if (res && res.ok) {
          COLA = COLA.filter(function (x) { return items.indexOf(x) < 0; });
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
function accionarTest(c) {
  var y = yo();
  if (c.accion === 'perfil') {
    ['nombre', 'apodo', 'club'].forEach(function (k) { if (c[k] !== undefined) y[k] = c[k]; });
    if (c.handicap !== undefined) y.handicap = Number(c.handicap) || 0;
    if (c.equipo) y.equipo = c.equipo;
    if (c.fotoId === '') { delete y.foto; y.fotoId = ''; }
  } else if (c.accion === 'foto') { y.foto = c.foto; }
  else if (c.accion === 'cancha') {
    var cc = cancha(c.id);
    if (cc) {
      if (c.nombre) cc.nombre = c.nombre;
      if (c.confirmada !== undefined) cc.confirmada = c.confirmada;
      if (c.formato !== undefined) cc.formato = c.formato;
      if (c.par) cc.par = c.par;
      if (c.si) cc.si = c.si;
    }
  } else if (c.accion === 'equipos') {
    if (c.azul) E.equipos.azul.nombre = c.azul;
    if (c.rojo) E.equipos.rojo.nombre = c.rojo;
  } else if (c.accion === 'partidos') {
    E.partidos = (E.partidos || []).filter(function (m) { return m.cancha !== c.cancha; })
      .concat((c.lista || []).map(function (m, k) {
        return { id: c.cancha + '-' + (k + 1), cancha: c.cancha, formato: c.formato, usa: m.usa, eur: m.eur };
      }));
  } else if (c.accion === 'borrar') { E.tarjetas = []; E.tarjetasEquipo = []; }
  E.sello = new Date().toISOString();
  guardarTest(); pintar();
  return Promise.resolve({ ok: true });
}
function accionar(cuerpo) {
  if (TEST) return accionarTest(cuerpo);
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
    '<button class="btn fin" data-acc="test-entrar">🧪 Entrar en modo testeo (datos de prueba)</button>' +
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

/* ============ modo testeo ============ */
var APELLIDOS = ['Urtubey', 'Benvenuto', 'Benítez Cruz', 'Socas', 'Bergadá', 'Beccar Varela',
                 'Caputo', 'Santamarina', 'Arizu', 'Viboud', 'Paz', 'Gazzera'];

function golpeFicticio(par, hcp) {
  var extra = hcp / 18;                       // golpes de más esperados por hoyo
  var r = Math.random(), d;
  if (r < 0.05) d = -1;                       // birdie
  else if (r < 0.45) d = 0;                   // par
  else if (r < 0.85) d = 1;                   // bogey
  else d = 2;                                 // doble
  if (Math.random() < extra * 0.5) d += 1;    // los de handicap alto pinchan más seguido
  return Math.max(1, par + d);
}

function generarTest() {
  var base = leerLS(LS.est, null);
  var canchas = (base && base.canchas && base.canchas.length === 3)
    ? JSON.parse(JSON.stringify(base.canchas))
    : [{ id: 'acantilados', dia: 1, nombre: 'Acantilados Golf', confirmada: false,
         par: [4,4,3,5,4,4,3,4,4,4,3,4,5,4,3,4,4,4], si: [5,3,17,11,1,9,15,7,13,6,12,4,10,2,18,8,14,16] },
       { id: 'miramar', dia: 2, nombre: 'Miramar Links', confirmada: false,
         par: [4,4,3,5,4,4,3,4,5,4,3,5,4,4,3,4,5,4], si: [5,3,17,11,1,9,15,7,13,6,12,4,10,2,18,8,14,16] },
       { id: 'catedral', dia: 3, nombre: 'La Catedral', confirmada: true,
         par: [4,3,5,4,3,4,5,3,4,4,4,3,5,3,4,4,4,4], si: [3,13,1,11,15,7,5,17,9,14,8,16,4,18,6,10,2,12] }];
  canchas[0].formato = 'fourball'; canchas[1].formato = 'foursomes'; canchas[2].formato = 'singles';

  var jugadores = APELLIDOS.map(function (ap, i) {
    return { matricula: String(9001 + i), nombre: ap, apodo: '',
             handicap: Math.round((2 + Math.random() * 26) * 10) / 10,
             equipo: i % 2 ? 'rojo' : 'azul', rol: i === 0 ? 'admin' : 'jugador',
             club: '', fotoId: '' };
  });

  var tarjetas = [];
  canchas.forEach(function (c) {
    jugadores.forEach(function (j) {
      tarjetas.push({ cancha: c.id, matricula: j.matricula,
        hoyos: c.par.map(function (par) { return golpeFicticio(par, j.handicap); }) });
    });
  });

  var porHcp = function (a, b) { return a.handicap - b.handicap; };
  var usa = jugadores.filter(function (j) { return j.equipo === 'rojo'; }).sort(porHcp);
  var eur = jugadores.filter(function (j) { return j.equipo === 'azul'; }).sort(porHcp);
  var partidos = [], tarjetasEquipo = [];
  canchas.forEach(function (c) {
    var lista = [], i;
    if (c.formato === 'singles') {
      for (i = 0; i < Math.min(usa.length, eur.length); i++)
        lista.push({ usa: [usa[i].matricula], eur: [eur[i].matricula] });
    } else {
      var pu = duplas(usa), pe = duplas(eur);
      for (i = 0; i < Math.min(pu.length, pe.length); i++) lista.push({ usa: pu[i], eur: pe[i] });
    }
    lista.forEach(function (m, k) {
      var id = c.id + '-' + (k + 1);
      partidos.push({ id: id, cancha: c.id, formato: c.formato, usa: m.usa, eur: m.eur });
      if (c.formato === 'foursomes') {
        ['usa', 'eur'].forEach(function (lado) {
          var hcp = m[lado].reduce(function (s, mat) { return s + jugador2(jugadores, mat).handicap; }, 0) / m[lado].length;
          tarjetasEquipo.push({ partido: id, lado: lado,
            hoyos: c.par.map(function (par) { return golpeFicticio(par, hcp * 0.7); }) });
        });
      }
    });
  });

  return {
    torneo: { nombre: 'Golf Tour Mdq', sede: 'Mar del Plata', edicion: '2026' },
    equipos: { azul: { nombre: 'Team Europe' }, rojo: { nombre: 'Team USA' } },
    jugadores: jugadores, canchas: canchas, tarjetas: tarjetas,
    partidos: partidos, tarjetasEquipo: tarjetasEquipo,
    sello: new Date().toISOString(), esTest: true
  };
}
function jugador2(lista, mat) {
  for (var i = 0; i < lista.length; i++) if (String(lista[i].matricula) === String(mat)) return lista[i];
  return { handicap: 18 };
}
function guardarTest() { if (TEST) guardarLS('gtm-test-estado', E); }

function entrarTest(regenerar) {
  if (!TEST) PROD = E;
  var guardado = regenerar ? null : leerLS('gtm-test-estado', null);
  E = guardado || generarTest();
  guardarLS('gtm-test-estado', E);
  TEST = true; guardarLS('gtm-test-on', true);
  UI.yoTest = E.jugadores[0].matricula;
  UI.cancha = E.canchas[0].id; UI.canchaLb = 'general'; UI.canchaRyder = E.canchas[0].id;
  UI.tab = 'posiciones'; UI.hoyo = 0;
  guardarUI(); pintar();
}
function salirTest() {
  TEST = false; guardarLS('gtm-test-on', false);
  E = PROD || leerLS(LS.est, null);
  UI.cancha = (E && E.canchas[0]) ? E.canchas[0].id : null;
  UI.canchaRyder = UI.cancha; UI.tab = 'posiciones';
  guardarUI(); pintar();
  if (SES && navigator.onLine) traerEstado().then(pintar, function () {});
}

function vistaTesteo() {
  var y = yo();
  var h = '<div class="pila">' +
    '<div class="aviso"><span>🧪</span><span><b>Base de prueba.</b> Doce jugadores inventados con las tres vueltas jugadas ' +
    'y handicaps al azar. Todo lo que toques acá queda en este celular: no viaja a la planilla ni lo ve nadie.</span></div>' +
    '<section class="card"><div class="sec-tit"><h2>Jugar como</h2>' +
    '<span class="eyebrow">' + E.jugadores.length + ' jugadores</span></div><div class="login-grid">' +
    E.jugadores.map(function (j) {
      return '<button data-acc="test-yo" data-v="' + j.matricula + '"' +
        (String(j.matricula) === String(UI.yoTest) ? ' style="border-color:var(--verde);box-shadow:inset 0 0 0 1px var(--verde)"' : '') +
        '>' + avatar(j) + '<span><span class="' + claseTxt(j).trim() + '">' + esc(j.nombre) + '</span>' +
        '<i>HCP ' + j.handicap + (j.rol === 'admin' ? ' · organizador' : '') + '</i></span></button>';
    }).join('') + '</div>' +
    '<div class="candado"><span>✏️</span><span>Elegís uno y con <b>Cargar</b> le cambiás los golpes hoyo por hoyo, ' +
    'para ver cómo se mueven las posiciones y los partidos.</span></div></section>' +
    '<section class="card"><div class="sec-tit"><h2>La base</h2></div>' +
    '<div class="candado" style="border-top:0"><span>📋</span><span>Día 1 four-ball · Día 2 foursomes · Día 3 singles. ' +
    'Los partidos ya están armados por handicap y las tarjetas completas.</span></div>' +
    '<div class="acc"><button class="btn" data-acc="test-regenerar">Sortear todo de nuevo</button>' +
    '<button class="btn pri" data-acc="test-salir">Salir del testeo</button></div></section></div>';
  return h;
}

/* ============ match play ============ */
var FORMATOS = { foursomes: 'Foursomes', fourball: 'Four-ball', singles: 'Singles' };
function ph(j) { return Math.round(Number(j.handicap) || 0); }
// Golpes que recibe quien tiene 'diff' de diferencia, en el hoyo de índice si
function golpesDif(diff, si) {
  if (diff <= 0) return 0;
  return Math.floor(diff / 18) + (si <= (diff % 18) ? 1 : 0);
}
function partidosDe(cid) { return (E.partidos || []).filter(function (m) { return m.cancha === cid; }); }
function tarjetaEquipo(pid, lado) {
  var t = (E.tarjetasEquipo || []).filter(function (x) { return x.partido === pid && x.lado === lado; })[0];
  return t ? t.hoyos : [];
}
function partidoDe(cid, mat) {
  var ms = partidosDe(cid);
  for (var i = 0; i < ms.length; i++)
    if (ms[i].usa.indexOf(String(mat)) >= 0 || ms[i].eur.indexOf(String(mat)) >= 0) return ms[i];
  return null;
}
function ladoDe(m, mat) { return m.usa.indexOf(String(mat)) >= 0 ? 'usa' : (m.eur.indexOf(String(mat)) >= 0 ? 'eur' : null); }

/**
 * Devuelve el estado del partido hoyo por hoyo y el resultado.
 * Handicap: diferencia al 100% — el bando de menor handicap juega scratch
 * y el otro recibe la diferencia en los hoyos de menor índice.
 */
function calcularPartido(m) {
  var c = cancha(m.cancha);
  if (!c) return null;
  var fmt = m.formato || c.formato || '';
  var usa = m.usa.map(jugador).filter(Boolean), eur = m.eur.map(jugador).filter(Boolean);
  if (!usa.length || !eur.length) return null;

  var hoyos = [], i;
  if (fmt === 'foursomes') {
    var hu = tarjetaEquipo(m.id, 'usa'), he = tarjetaEquipo(m.id, 'eur');
    var hcpU = usa.reduce(function (s, j) { return s + ph(j); }, 0) / usa.length;
    var hcpE = eur.reduce(function (s, j) { return s + ph(j); }, 0) / eur.length;
    var dif = Math.round(Math.abs(hcpU - hcpE)), recibeUsa = hcpU > hcpE;
    for (i = 0; i < 18; i++) {
      var si = Number(c.si[i]) || (i + 1);
      var gu = hu[i], ge = he[i];
      if (gu == null || ge == null) { hoyos.push({ i: i, usa: null, eur: null, gana: null }); continue; }
      var nu = gu - (recibeUsa ? golpesDif(dif, si) : 0);
      var ne = ge - (recibeUsa ? 0 : golpesDif(dif, si));
      hoyos.push({ i: i, usa: nu, eur: ne, gana: nu < ne ? 'usa' : (ne < nu ? 'eur' : null) });
    }
  } else {
    var todos = usa.concat(eur);
    var base = Math.min.apply(null, todos.map(ph));
    for (i = 0; i < 18; i++) {
      var idx = Number(c.si[i]) || (i + 1);
      var lado = function (equipo) {
        var mejor = null;
        equipo.forEach(function (j) {
          var g = hoyosDe(c.id, j.matricula)[i];
          if (g == null) return;
          var neto = g - golpesDif(ph(j) - base, idx);
          if (mejor === null || neto < mejor) mejor = neto;   // four-ball: la mejor bola
        });
        return mejor;
      };
      var a = lado(usa), b = lado(eur);
      hoyos.push({ i: i, usa: a, eur: b,
        gana: (a == null || b == null) ? null : (a < b ? 'usa' : (b < a ? 'eur' : null)) });
    }
  }

  // Match play de verdad: se recorren los hoyos en orden y el partido se cierra
  // en cuanto la ventaja es mayor que los hoyos que quedan. Lo que se juegue
  // después (habitual entre amigos) no cuenta.
  var arriba = 0, jugados = 0, cerradoEn = 0, k;
  for (k = 0; k < 18; k++) {
    if (hoyos[k].usa == null || hoyos[k].eur == null) break;
    jugados++;
    if (hoyos[k].gana === 'usa') arriba++; else if (hoyos[k].gana === 'eur') arriba--;
    if (Math.abs(arriba) > 18 - jugados) { cerradoEn = jugados; break; }
  }
  var restan = 18 - jugados, dif2 = Math.abs(arriba);
  var r = { m: m, fmt: fmt, hoyos: hoyos, arriba: arriba, jugados: jugados, restan: restan,
            cerradoEn: cerradoEn, usa: usa, eur: eur, cerrado: false, ganador: null,
            puntoUsa: 0, puntoEur: 0 };

  if (jugados === 0) { r.texto = 'sin empezar'; return r; }
  if (cerradoEn) {
    r.cerrado = true;
    r.ganador = arriba > 0 ? 'usa' : 'eur';
    r[arriba > 0 ? 'puntoUsa' : 'puntoEur'] = 1;
    r.texto = restan > 0 ? dif2 + '&' + restan : dif2 + ' arriba';
  } else if (jugados === 18) {
    r.cerrado = true;
    r.puntoUsa = 0.5; r.puntoEur = 0.5;
    r.texto = 'empatado';
  } else {
    r.texto = arriba === 0 ? 'iguales · hoyo ' + jugados
      : dif2 + ' arriba ' + (arriba > 0 ? 'USA' : 'EUR') + ' · hoyo ' + jugados;
  }
  return r;
}
function marcadorRyder(cid) {
  var ms = (cid === 'general') ? (E.partidos || []) : partidosDe(cid);
  var r = { usa: 0, eur: 0, provUsa: 0, provEur: 0, enJuego: 0, total: ms.length };
  ms.forEach(function (m) {
    var p = calcularPartido(m);
    if (!p) return;
    r.usa += p.puntoUsa; r.eur += p.puntoEur;
    if (p.cerrado) { r.provUsa += p.puntoUsa; r.provEur += p.puntoEur; }
    else if (p.jugados) {
      r.enJuego++;
      if (p.arriba > 0) r.provUsa += 1; else if (p.arriba < 0) r.provEur += 1;
      else { r.provUsa += 0.5; r.provEur += 0.5; }
    }
  });
  return r;
}

/* ============ conducción: capitanes y subcapitanes ============ */
// Los dos mejores handicaps son capitanes; el 3.º y el 4.º, subcapitanes.
// Las duplas de conducción quedan 1.º con 4.º y 2.º con 3.º.
function conduccion() {
  var orden = E.jugadores.slice().sort(function (a, b) {
    return (Number(a.handicap) || 99) - (Number(b.handicap) || 99);
  });
  if (orden.length < 4) return null;
  return {
    duplaA: { capitan: orden[0], sub: orden[3] },
    duplaB: { capitan: orden[1], sub: orden[2] },
    orden: orden
  };
}
function bloqueConduccion() {
  var c = conduccion();
  if (!c) return '<div class="aviso"><span>👥</span><span>Con menos de 4 jugadores registrados todavía no se pueden definir capitanes.</span></div>';
  function dupla(d, k) {
    return '<div><div class="k">Dupla ' + k + '</div>' +
      '<div class="v">' + esc(d.capitan.nombre) + ' <em>' + esc(d.capitan.handicap) + '</em>' +
      '<br><span class="hint">con ' + esc(d.sub.nombre) + ' · hcp ' + esc(d.sub.handicap) + '</span></div></div>';
  }
  return '<section class="card"><div class="sec-tit"><h2>Conducción</h2>' +
    '<span class="eyebrow">por handicap</span></div>' +
    '<div class="destacados">' + dupla(c.duplaA, 1) + dupla(c.duplaB, 2) + '</div>' +
    '<div class="candado"><span>🏌️</span><span>Capitanes: los dos mejores handicaps. Subcapitanes: el tercero y el cuarto. ' +
    'Se arma 1.º con 4.º y 2.º con 3.º. Se recalcula solo a medida que cargan sus handicaps.</span></div></section>';
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
  var titulo = (c ? esc(c.nombre) + ' · Día ' + c.dia : esc(E.torneo.nombre) + ' · las 3 vueltas') +
    (UI.metrica === 'neto' ? ' · Medal Play' : '');
  var max = 1; lista.forEach(function (a) { if (UI.metrica === 'stableford' && a.pts > max) max = a.pts; });

  var h = '<div class="pila">' + chipsCancha(UI.canchaLb, 'lb-cancha', true) + panelEquipos(UI.canchaLb) +
    '<div class="seg" role="group">' +
    '<button data-acc="metrica" data-v="neto" aria-pressed="' + (UI.metrica === 'neto') + '">Medal neto</button>' +
    '<button data-acc="metrica" data-v="bruto" aria-pressed="' + (UI.metrica === 'bruto') + '">Bruto</button>' +
    '<button data-acc="metrica" data-v="stableford" aria-pressed="' + (UI.metrica === 'stableford') + '">Stableford</button></div>' +
    '<section class="card lb"><div class="lb-cab"><h2>' + titulo + '</h2><span class="eyebrow">' +
    (UI.metrica === 'stableford' ? 'puntos' : (UI.metrica === 'neto' ? 'golpes netos' : 'golpes brutos')) + '</span></div>';

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

function panelEquipos(cid) {
  if (!(E.partidos || []).length) return '';
  var r = marcadorRyder(cid);
  if (!r.total) return '';
  var c = cid === 'general' ? null : cancha(cid);
  var fmt = c ? (FORMATOS[c.formato] || '') : '';
  var estado = r.provUsa === r.provEur ? 'iguales'
    : (r.provUsa > r.provEur ? nombreEquipo('rojo') : nombreEquipo('azul')) + ' arriba';
  return '<section class="card"><div class="lb-cab"><h2>Ryder Cup</h2><span class="eyebrow">' +
    esc(fmt ? fmt + ' · ' + estado : estado) + '</span></div>' + marcadorHTML(r) +
    '<div class="acc" style="padding-top:10px"><button class="btn fin" data-acc="tab" data-v="ryder">Ver los partidos →</button></div></section>';
}

function vistaRyder() {
  var cid = UI.canchaRyder || (E.canchas[0] && E.canchas[0].id);
  var c = cancha(cid);
  if (!c) return '<p class="vacio">Cargando…</p>';
  var admin = esAdmin(), fmt = c.formato || '';
  var ms = partidosDe(cid), marca = marcadorRyder(cid), gral = marcadorRyder('general');

  var h = '<div class="pila">' + chipsCancha(cid, 'ryder-cancha', false);

  h += '<section class="card"><div class="lb-cab"><h2>Ryder · las 3 jornadas</h2>' +
    '<span class="eyebrow">' + gral.total + ' partidos · ' + fmtPunto(gral.usa + gral.eur) + ' definidos</span></div>' +
    marcadorHTML(gral) + '</section>';

  h += '<section class="card"><div class="sec-tit"><h2>' + esc(c.nombre) + ' · Día ' + c.dia + '</h2>' +
    '<span class="pin' + (fmt ? '' : ' recibe') + '">' + (FORMATOS[fmt] || 'sin definir') + '</span></div>' +
    selectorModalidad(c, admin);

  if (!fmt) {
    h += '<p class="vacio">' + (admin
      ? 'Elegí acá arriba con qué se juega hoy y después armá los partidos.'
      : 'El organizador todavía no definió la modalidad de este día.') + '</p></section></div>';
    return h;
  }

  if (!ms.length) {
    h += '<p class="vacio">Todavía no están armados los partidos de esta jornada.</p>';
    if (admin) h += '<div class="acc"><button class="btn pri" data-acc="armar" data-v="' + cid + '">Armar los partidos</button>' +
      '<span class="hint">' + (fmt === 'singles' ? '6 duelos individuales' : '3 partidos de a dos') +
      ', repartidos por handicap. Después los podés cambiar uno por uno.</span></div>';
    return h + '</section></div>';
  }

  h += marcadorHTML(marca) + '</section>';

  ms.forEach(function (m, k) {
    var p = calcularPartido(m);
    if (!p) return;
    var nombres = function (eq) {
      return eq.map(function (j) { return esc(nombreCorto(j.nombre)) + ' <i>' + esc(j.handicap) + '</i>'; }).join(' + ');
    };
    var estado = p.cerrado ? (p.ganador ? (p.ganador === 'usa' ? 'txt-rojo' : 'txt-azul') : '') : '';
    h += '<section class="card partido"><div class="p-cab"><span class="eyebrow">Partido ' + (k + 1) + '</span>' +
      '<span class="p-estado ' + estado + '">' + esc(p.texto) + '</span></div>' +
      '<div class="p-lados">' +
      '<div class="p-lado txt-rojo' + (p.ganador === 'usa' ? ' gana' : '') + '">' + nombres(p.usa) + '</div>' +
      '<div class="p-vs">vs</div>' +
      '<div class="p-lado txt-azul' + (p.ganador === 'eur' ? ' gana' : '') + '">' + nombres(p.eur) + '</div>' +
      '</div>' + tiraHoyos(p) + '</section>';
  });

  if (admin) h += '<div class="acc"><button class="btn fin" data-acc="armar" data-v="' + cid + '">Rearmar los partidos de esta jornada</button></div>';
  h += '<div class="candado solo"><span>⛳</span><span>Handicap por <b>diferencia al 100%</b>: el bando de menor handicap juega scratch y el otro recibe la diferencia en los hoyos de menor índice.</span></div>';
  return h + '</div>';
}

// La modalidad se decide el mismo día: no hay nada atado a la jornada.
function selectorModalidad(c, admin) {
  if (!admin) return '<div class="candado"><span>🎛️</span><span>Se juega <b>' +
    (FORMATOS[c.formato] || 'con la modalidad que defina el organizador') + '</b>. La elige él antes de salir.</span></div>';
  return '<div class="grid2" style="grid-template-columns:1fr"><div class="campo">' +
    '<label>Con qué se juega hoy</label><div class="pick-eq pick-4">' +
    [['foursomes', 'Foursomes'], ['fourball', 'Four-ball'], ['singles', 'Singles'], ['', 'Sin definir']]
      .map(function (f) {
        return '<button data-acc="formato" data-v="' + c.id + '" data-i="' + f[0] + '" aria-pressed="' +
          ((c.formato || '') === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
    '<span class="hint">Cualquiera de las tres, cualquier día. Si cambiás la modalidad se borran los partidos ya armados de esta jornada.</span>' +
    '</div></div>';
}

function marcadorHTML(r) {
  var tot = r.provUsa + r.provEur, pa = tot ? Math.round(r.provUsa / tot * 100) : 50;
  return '<div class="marcador-eq">' +
    '<div class="lado"><b class="txt-rojo">' + fmtPunto(r.usa) + '</b>' +
    '<span class="txt-rojo">' + esc(nombreEquipo('rojo')) + '</span>' +
    (r.enJuego ? '<i>proyectado ' + fmtPunto(r.provUsa) + '</i>' : '') + '</div>' +
    '<div class="vs">vs</div>' +
    '<div class="lado"><b class="txt-azul">' + fmtPunto(r.eur) + '</b>' +
    '<span class="txt-azul">' + esc(nombreEquipo('azul')) + '</span>' +
    (r.enJuego ? '<i>proyectado ' + fmtPunto(r.provEur) + '</i>' : '') + '</div></div>' +
    '<div class="barra-eq"><i class="r" style="width:' + pa + '%"></i><i class="a" style="width:' + (100 - pa) + '%"></i></div>';
}
function fmtPunto(n) { return (Math.round(n * 2) / 2).toString().replace('.5', '½').replace(/^0½$/, '½'); }
function tiraHoyos(p) {
  var h = '<div class="p-hoyos">';
  p.hoyos.forEach(function (x, k) {
    if (p.cerradoEn && k >= p.cerradoEn) { h += '<i class="fin">' + (k + 1) + '</i>'; return; }
    var cls = x.gana === 'usa' ? 'u' : (x.gana === 'eur' ? 'e' : (x.usa != null && x.eur != null ? 'h' : ''));
    h += '<i class="' + cls + '" title="Hoyo ' + (k + 1) + '">' + (k + 1) + '</i>';
  });
  return h + '</div>';
}

function esFoursomes(c, j) {
  if (!c || c.formato !== 'foursomes') return null;
  var m = partidoDe(c.id, j.matricula);
  return m ? { m: m, lado: ladoDe(m, j.matricula) } : null;
}
function vistaCargar() {
  var c = canchaActual(), j = yo();
  if (!c || !j) return '<p class="vacio">Cargando…</p>';
  var fs = esFoursomes(c, j);
  var arr = fs ? tarjetaEquipo(fs.m.id, fs.lado) : hoyosDe(c.id, j.matricula);
  var r = fs ? calcTarjeta(c, arr, 0) : calc(c, j);
  var i = Math.min(Math.max(UI.hoyo, 0), 17), o = r.hoyos[i];
  var ida = 0, vta = 0, tot = 0;
  r.hoyos.forEach(function (x, k) { if (x.g != null) { tot += x.g; if (k < 9) ida += x.g; else vta += x.g; } });

  var aviso;
  if (fs) {
    var pareja = fs.m[fs.lado].map(jugador).filter(Boolean).map(function (x) { return nombreCorto(x.nombre); });
    aviso = '<div class="candado solo"><span>🤝</span><span><b>Foursomes:</b> una sola pelota para ' +
      esc(pareja.join(' y ')) + '. Lo que cargues acá cuenta para los dos — que lo cargue uno solo.</span></div>';
  } else {
    aviso = '<div class="candado solo"><span>🔒</span><span>Estás cargando <b class="' + claseTxt(j).trim() +
      '">tu</b> tarjeta. La de cada uno la carga su dueño, nadie más.</span></div>';
  }

  var h = '<div class="pila">' + aviso + chipsCancha(c.id, 'sel-cancha', false) +
    '<section class="card"><div class="hoyo">' +
    '<div class="eyebrow">' + esc(c.nombre) + '</div><div class="n">' + (i + 1) + '</div>' +
    '<div class="datos"><span class="pin">Par ' + o.par + '</span><span class="pin">SI ' + o.si + '</span>' +
    (fs ? '<span class="pin recibe">golpes de match play</span>'
        : (o.rec !== 0 ? '<span class="pin recibe">' + (o.rec > 0 ? 'recibe ' + o.rec + ' golpe' + (o.rec > 1 ? 's' : '') : 'devuelve ' + (-o.rec)) + '</span>'
                       : '<span class="pin">sin golpe</span>')) + '</div>' +
    '<div class="marcador"><button class="rd" data-acc="menos" aria-label="Un golpe menos">−</button>' +
    '<span class="val' + (o.g == null ? ' sin' : '') + '">' + (o.g == null ? '–' : o.g) + '</span>' +
    '<button class="rd" data-acc="mas" aria-label="Un golpe más">+</button></div>' +
    '<div class="hint">' + (o.g == null ? 'Tocá un resultado o usá + / −'
      : (fs ? 'Golpes de la pareja en este hoyo: <b>' + o.g + '</b>'
            : 'Neto ' + o.neto + ' · <b>' + o.pts + ' punto' + (o.pts === 1 ? '' : 's') + '</b>')) + '</div>' +
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
  h += '</section>' + bloqueConduccion();
  return h + '<div class="aviso"><span>🎯</span><span>Cada uno entra con su matrícula y su contraseña y aparece acá automáticamente. Nadie edita los datos ni la tarjeta de otro, el organizador tampoco.</span></div></div>';
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
    h += '<div class="candado"><span>🎛️</span><span>La modalidad de equipos de este día (' +
      (FORMATOS[c.formato] || 'sin definir') + ') se elige en la pestaña <b>Ryder</b>.</span></div>';
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
    (y.foto ? '<img src="' + y.foto + '" alt="">'
            : (y.fotoId ? '<img src="https://drive.google.com/thumbnail?id=' + esc(y.fotoId) + '&sz=w320" alt="">'
                        : esc(inicial(y)))) + '</div>' +
    '<div><h2 class="' + claseTxt(y).trim() + '">' + esc(y.nombre) + '</h2>' +
    '<div class="lb-meta">Matrícula ' + esc(y.matricula) + ' · HCP ' + esc(y.handicap) +
    ' · juega con ' + hcpJuego(y) + ' golpes · ' + esc(nombreEquipo(y.equipo)) + '</div>' +
    '<div class="fotos">' +
    '<label class="subir">🖼️ Galería<input type="file" accept="image/*" data-acc="ed-foto"></label>' +
    '<label class="subir">📷 Cámara<input type="file" accept="image/*" capture="environment" data-acc="ed-foto"></label>' +
    ((y.foto || y.fotoId) ? '<button class="btn fin" data-acc="quitar-foto">Quitar</button>' : '') +
    '</div></div></div>' +
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
var TABS = [['posiciones', 'Medal'], ['ryder', 'Ryder'], ['cargar', 'Cargar'], ['tarjetas', 'Tarjetas'], ['jugadores', 'Jugadores'], ['canchas', 'Canchas']];

function desplegableJugadores() {
  if (!TEST || !UI.selector) return '';
  var y = yo();
  return '<div class="drop-fondo" data-acc="cerrar-selector"></div>' +
    '<div class="drop"><div class="tit">Entrar como</div>' +
    E.jugadores.map(function (j) {
      var soy = String(j.matricula) === String(UI.yoTest);
      return '<button data-acc="test-yo" data-v="' + j.matricula + '" aria-current="' + soy + '">' +
        avatar(j) + '<span><span class="' + claseTxt(j).trim() + '">' + esc(j.nombre) + '</span>' +
        '<i>HCP ' + j.handicap + ' · ' + esc(nombreEquipo(j.equipo)) +
        (j.rol === 'admin' ? ' · organizador' : '') + '</i></span>' +
        (soy ? '<span class="tick">✓</span>' : '') + '</button>';
    }).join('') +
    '<button data-acc="ver-perfil"><span class="av">👤</span><span>Ver el perfil de ' +
    esc(nombreCorto(y ? y.nombre : '')) + '<i>editar nombre, handicap, equipo y foto</i></span></button></div>';
}

function barraEstado() {
  if (TEST) return '<div class="barra-estado test">🧪 Modo testeo · datos inventados, no tocan la planilla' +
    ' · <button class="btn fin" data-acc="test-salir">salir</button></div>';
  if (COLA.length && !navigator.onLine)
    return '<div class="barra-estado">📴 Sin señal · ' + COLA.length + ' golpe' + (COLA.length > 1 ? 's' : '') + ' esperando para subir</div>';
  if (sincronizando) return '<div class="barra-estado sync"><i class="girar"></i>Sincronizando…</div>';
  if (COLA.length) return '<div class="barra-estado">⏳ ' + COLA.length + ' cambio' + (COLA.length > 1 ? 's' : '') + ' sin subir · <button class="btn fin" data-acc="sync">reintentar</button></div>';
  if (!navigator.onLine) return '<div class="barra-estado">📴 Sin señal · todo lo que cargues se guarda igual</div>';
  return '';
}
function pintar() {
  var app = document.getElementById('app');
  if (!SES && !TEST) { app.innerHTML = vistaIngreso(); return; }
  if (!E) { app.innerHTML = '<div class="pantalla"><p class="vacio">Cargando el torneo…</p></div>'; return; }
  var y = yo();
  var vista = UI.tab === 'cargar' ? vistaCargar() : UI.tab === 'tarjetas' ? vistaTarjetas() :
    UI.tab === 'jugadores' ? vistaJugadores() : UI.tab === 'canchas' ? vistaCanchas() :
    UI.tab === 'ryder' ? vistaRyder() : UI.tab === 'perfil' ? vistaPerfil() :
    UI.tab === 'testeo' ? vistaTesteo() : vistaPosiciones();
  app.innerHTML = barraEstado() + '<div class="wrap">' +
    '<div class="cab-top">' +
    '<button class="chip-estado" data-acc="info"><span class="punto' + (navigator.onLine ? ' vivo' : ' gris') + '"></span>' +
    (navigator.onLine ? 'En vivo' : 'Sin señal') + '</button>' +
    '<div class="cab-der">' +
    '<button class="chip-test' + (TEST ? ' on' : '') + '" ' +
    (TEST ? 'data-acc="tab" data-v="testeo"' : 'data-acc="test-entrar"') + '>🧪 Testeo</button>' +
    '<button class="btn-perfil" data-acc="ir-perfil">' + avatar(y) +
    '<span class="nom' + claseTxt(y) + '">' + esc(nombreCorto(y ? y.nombre : '')) + '</span></button></div></div>' +
    desplegableJugadores() +
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
  if (a === 'quitar-foto') { accionar({ accion: 'perfil', fotoId: '' }); return; }
  if (a === 'test-entrar') { entrarTest(false); return; }
  if (a === 'test-salir') { salirTest(); return; }
  if (a === 'test-regenerar') { if (confirm('Se sortean de nuevo handicaps, tarjetas y partidos. ¿Seguimos?')) entrarTest(true); return; }
  if (a === 'test-yo') { UI.yoTest = v; UI.hoyo = 0; UI.selector = false; guardarUI(); pintar(); return; }
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
  else if (a === 'ir-perfil') {
    if (TEST) { UI.selector = !UI.selector; guardarUI(); pintar(); return; }
    UI.tab = 'perfil';
  }
  else if (a === 'cerrar-selector') { UI.selector = false; guardarUI(); pintar(); return; }
  else if (a === 'ver-perfil') { UI.selector = false; UI.tab = 'perfil'; }
  else if (a === 'lb-cancha') { UI.canchaLb = v; }
  else if (a === 'ryder-cancha') { UI.canchaRyder = v; }
  else if (a === 'armar') { armarPartidos(v); return; }
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
  else if (a === 'formato') {
    var nuevo = b.getAttribute('data-i'), cc = cancha(v);
    if (!cc || (cc.formato || '') === nuevo) return;
    var hay = partidosDe(v).length;
    if (hay && !confirm('Cambiar la modalidad borra los ' + hay + ' partido(s) ya armados de este día. ¿Seguimos?')) return;
    accionar({ accion: 'cancha', id: v, formato: nuevo }).then(function () {
      if (hay) return accionar({ accion: 'partidos', cancha: v, formato: nuevo, lista: [] });
    });
    return;
  }
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
  if (a === 'ed-foto') { if (el.files && el.files[0]) subirFoto(el.files[0]); el.value = ''; return; }
  else if (a === 'ed-perfil') { var p = { accion: 'perfil' }; p[v] = el.value.trim(); accionar(p); }
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

function duplas(eq) {
  var r = [], a = 0, b = eq.length - 1;
  while (a < b) { r.push([String(eq[a].matricula), String(eq[b].matricula)]); a++; b--; }   // el mejor con el último
  if (a === b) r.push([String(eq[a].matricula)]);
  return r;
}
function armarPartidos(cid) {
  var c = cancha(cid);
  if (!c || !c.formato) { alert('Primero elegí el formato de la jornada en la pestaña Canchas.'); return; }
  var porHcp = function (a, b) { return (Number(a.handicap) || 99) - (Number(b.handicap) || 99); };
  var usa = E.jugadores.filter(function (j) { return j.equipo === 'rojo'; }).sort(porHcp);
  var eur = E.jugadores.filter(function (j) { return j.equipo === 'azul'; }).sort(porHcp);
  if (!usa.length || !eur.length) { alert('Faltan jugadores en alguno de los dos equipos.'); return; }

  var lista = [], i, n;
  if (c.formato === 'singles') {
    n = Math.min(usa.length, eur.length);
    for (i = 0; i < n; i++) lista.push({ usa: [String(usa[i].matricula)], eur: [String(eur[i].matricula)] });
  } else {
    var pu = duplas(usa), pe = duplas(eur);
    n = Math.min(pu.length, pe.length);
    for (i = 0; i < n; i++) lista.push({ usa: pu[i], eur: pe[i] });
  }
  if (!confirm('Se van a armar ' + lista.length + ' partido(s) de ' + FORMATOS[c.formato] +
    ' emparejando por handicap. Si ya había partidos en este día, se reemplazan. ¿Seguimos?')) return;
  accionar({ accion: 'partidos', cancha: cid, formato: c.formato, lista: lista });
}

function primerLibre() {
  var c = canchaActual(), y = yo();
  if (!c || !y) return 0;
  var fs = esFoursomes(c, y);
  var t = fs ? tarjetaEquipo(fs.m.id, fs.lado) : hoyosDe(c.id, y.matricula);
  for (var i = 0; i < 18; i++) if (t[i] == null) return i;
  return 17;
}

function anotarGolpe(a, v) {
  var c = canchaActual(), y = yo();
  if (!c || !y || !puedeEditar(y.matricula)) return;
  var fs = esFoursomes(c, y);
  var arr = fs ? tarjetaEquipo(fs.m.id, fs.lado) : hoyosDe(c.id, y.matricula);
  var par = Number(c.par[UI.hoyo]) || 4, act = arr[UI.hoyo];
  var nuevo;
  if (a === 'borrar') nuevo = null;
  else if (a === 'set') nuevo = Math.max(1, Number(v));
  else if (a === 'mas') nuevo = (act == null ? par : act + 1);
  else nuevo = (act == null ? par : Math.max(1, act - 1));

  // 1) se aplica al instante en el celular
  var t = null, i;
  if (fs) {
    E.tarjetasEquipo = E.tarjetasEquipo || [];
    for (i = 0; i < E.tarjetasEquipo.length; i++)
      if (E.tarjetasEquipo[i].partido === fs.m.id && E.tarjetasEquipo[i].lado === fs.lado) { t = E.tarjetasEquipo[i]; break; }
    if (!t) { t = { partido: fs.m.id, lado: fs.lado, hoyos: new Array(18).fill(null) }; E.tarjetasEquipo.push(t); }
  } else {
    for (i = 0; i < E.tarjetas.length; i++)
      if (E.tarjetas[i].cancha === c.id && String(E.tarjetas[i].matricula) === String(y.matricula)) { t = E.tarjetas[i]; break; }
    if (!t) { t = { cancha: c.id, matricula: String(y.matricula), hoyos: new Array(18).fill(null) }; E.tarjetas.push(t); }
  }
  t.hoyos[UI.hoyo] = nuevo;
  if (TEST) {
    guardarTest();
    if (a === 'set' && UI.hoyo < 17) UI.hoyo++;
    guardarUI(); pintar();
    return;
  }
  guardarLS(LS.est, E);

  // 2) se encola y se sube cuando haya señal
  var clave = fs ? { partido: fs.m.id } : { cancha: c.id, matricula: String(y.matricula) };
  COLA = COLA.filter(function (x) {
    return !((fs ? x.partido === fs.m.id : (x.cancha === c.id && !x.partido)) && x.hoyo === UI.hoyo + 1);
  });
  COLA.push(Object.assign({ hoyo: UI.hoyo + 1, golpes: nuevo }, clave));
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

function subirFoto(file) {
  if (!file || !/^image\//.test(file.type)) { alert('Elegí una imagen.'); return; }
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      try {
        var L = 320, cv = document.createElement('canvas'); cv.width = L; cv.height = L;
        var ctx = cv.getContext('2d'), lado = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, L, L);
        var datos = cv.toDataURL('image/jpeg', 0.75);
        accionar({ accion: 'foto', foto: datos });
      } catch (e) { alert('No se pudo procesar esa imagen. Probá con otra.'); }
    };
    img.onerror = function () { alert('No se pudo abrir esa imagen. Probá con otra.'); };
    img.src = fr.result;
  };
  fr.onerror = function () { alert('No se pudo leer el archivo.'); };
  fr.readAsDataURL(file);
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
    if (TEST || document.hidden || !navigator.onLine || !SES) return;
    if (COLA.length) sincronizar(); else traerEstado().then(pintar, function () {});
  }, 20000);
}
window.addEventListener('online', function () { pintar(); sincronizar().then(traerEstado).then(pintar, function () {}); });
window.addEventListener('offline', pintar);
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && SES && navigator.onLine) { sincronizar(); traerEstado().then(pintar, function () {}); }
});

if (TEST) {
  PROD = E;
  E = leerLS('gtm-test-estado', null) || generarTest();
  if (!UI.yoTest) UI.yoTest = E.jugadores[0].matricula;
}
pintar();
if (SES && !TEST) {
  arrancarReloj();
  sincronizar().then(function () { return traerEstado(); }).then(pintar, function () { pintar(); });
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
})();
