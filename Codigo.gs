/**
 * GOLF TOUR MDQ — backend
 * Se pega en la planilla "Golf Tour Mdq — Base de datos":
 *   Extensiones → Apps Script → pegar esto → Guardar
 *   Ejecutar la función  configurar()  una sola vez (autoriza los permisos)
 *   Implementar → Nueva implementación → Aplicación web
 *      Ejecutar como: Yo    ·    Quién tiene acceso: Cualquier usuario
 *   Copiar la URL que termina en /exec y pasársela a la app.
 */

var SS_ID = '1aroTWtBKWw8xb9d7Lliki0cCXZvbjdgrxHqB8fqlZtI';
var CACHE_SEG = 15;          // segundos que se cachea el estado (cuida la cuota diaria)
var TOKEN_DIAS = 60;         // duración de la sesión en el celular

var HOJAS = {
  Config:    ['clave', 'valor'],
  Jugadores: ['matricula', 'nombre', 'apodo', 'handicap', 'equipo', 'rol', 'club', 'fotoId', 'hash', 'alta', 'ultimoAcceso'],
  Canchas:   ['id', 'dia', 'nombre', 'confirmada', 'formato'],   // + par1..par18 + si1..si18
  Tarjetas:  ['cancha', 'matricula'],                 // + h1..h18 + actualizado
  Log:       ['fecha', 'matricula', 'accion', 'detalle']
};
for (var i = 1; i <= 18; i++) HOJAS.Canchas.push('par' + i);
for (var i = 1; i <= 18; i++) HOJAS.Canchas.push('si' + i);
for (var i = 1; i <= 18; i++) HOJAS.Tarjetas.push('h' + i);
HOJAS.Tarjetas.push('actualizado');

/* ============================================================
   CONFIGURACIÓN INICIAL — correr una sola vez
   ============================================================ */
function configurar() {
  var ss = SpreadsheetApp.openById(SS_ID);

  Object.keys(HOJAS).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (!h) h = ss.insertSheet(nombre);
    h.clear();
    h.getRange(1, 1, 1, HOJAS[nombre].length).setValues([HOJAS[nombre]])
      .setFontWeight('bold').setBackground('#EDF0E8');
    h.setFrozenRows(1);
  });

  var vacia = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja1');
  if (vacia && ss.getSheets().length > 1) ss.deleteSheet(vacia);

  var cfg = ss.getSheetByName('Config');
  cfg.getRange(2, 1, 7, 2).setValues([
    ['torneo',      'Golf Tour Mdq'],
    ['sede',        'Mar del Plata'],
    ['edicion',     '2026'],
    ['equipoAzul',  'Team Europe'],
    ['equipoRojo',  'Team USA'],
    ['claveViaje',  'MDQ2026'],
    ['salt',        Utilities.getUuid()]
  ]);

  // Tres canchas en el orden de juego. Acantilados y Miramar quedan con un
  // molde provisorio hasta que se carguen las tarjetas oficiales.
  var provAcan = { par: [4,4,3,5,4,4,3,4,4, 4,3,4,5,4,3,4,4,4],
                   si:  [5,3,17,11,1,9,15,7,13, 6,12,4,10,2,18,8,14,16] };
  var provMira = { par: [4,4,3,5,4,4,3,4,5, 4,3,5,4,4,3,4,5,4],
                   si:  [5,3,17,11,1,9,15,7,13, 6,12,4,10,2,18,8,14,16] };
  var catedral = { par: [4,3,5,4,3,4,5,3,4, 4,4,3,5,3,4,4,4,4],
                   si:  [3,13,1,11,15,7,5,17,9, 14,8,16,4,18,6,10,2,12] };

  // el formato de equipos de cada día se define el mismo día; arranca vacío
  var canchas = [
    ['acantilados', 1, 'Acantilados Golf', false, ''].concat(provAcan.par, provAcan.si),
    ['miramar',     2, 'Miramar Links',    false, ''].concat(provMira.par, provMira.si),
    ['catedral',    3, 'La Catedral',      true , ''].concat(catedral.par, catedral.si)
  ];
  ss.getSheetByName('Canchas').getRange(2, 1, canchas.length, canchas[0].length).setValues(canchas);

  SpreadsheetApp.flush();
  Logger.log('Listo. Clave del viaje: MDQ2026 — cambiala en la pestaña Config si querés.');
  return 'ok';
}

/* ============================================================
   ENTRADAS HTTP
   ============================================================ */
function doGet(e)  { return responder(despachar((e && e.parameter) || {})); }
function doPost(e) {
  var cuerpo = {};
  try { cuerpo = JSON.parse(e.postData.contents); } catch (err) {}
  return responder(despachar(cuerpo));
}
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function despachar(p) {
  try {
    switch (p.accion) {
      case 'ping':      return { ok: true, version: 1 };
      case 'registrar': return registrar(p);
      case 'login':     return login(p);
      case 'estado':    return { ok: true, estado: estado(p.token) };
      case 'golpes':    return guardarGolpes(p);
      case 'perfil':    return guardarPerfil(p);
      case 'cancha':    return guardarCancha(p);
      case 'equipos':   return guardarEquipos(p);
      case 'borrar':    return borrarTarjetas(p);
      default:          return { ok: false, error: 'accion_desconocida' };
    }
  } catch (err) {
    return { ok: false, error: 'error_servidor', detalle: String(err && err.message || err) };
  }
}

/* ============================================================
   SESIÓN
   ============================================================ */
function config() {
  var filas = leer('Config'), c = {};
  filas.forEach(function (f) { c[f.clave] = f.valor; });
  return c;
}
function hashear(matricula, password) {
  var salt = config().salt;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    salt + '|' + String(matricula).trim() + '|' + String(password), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
function firmar(texto) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(texto, config().salt));
}
function emitirToken(matricula) {
  var venceEl = Date.now() + TOKEN_DIAS * 86400000;
  var cuerpo = Utilities.base64EncodeWebSafe(matricula + '|' + venceEl);
  return cuerpo + '.' + firmar(cuerpo);
}
function sesion(token) {
  if (!token || token.indexOf('.') < 0) return null;
  var partes = token.split('.');
  if (firmar(partes[0]) !== partes[1]) return null;
  var claro = Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString();
  var trozos = claro.split('|');
  if (Number(trozos[1]) < Date.now()) return null;
  return jugadorPorMatricula(trozos[0]);
}
function exigir(token, admin) {
  var j = sesion(token);
  if (!j) throw new Error('sesion_vencida');
  if (admin && j.rol !== 'admin') throw new Error('solo_admin');
  return j;
}

/* ============================================================
   ALTA E INGRESO
   ============================================================ */
function registrar(p) {
  var mat = String(p.matricula || '').trim();
  var pass = String(p.password || '');
  if (!mat) return { ok: false, error: 'falta_matricula' };
  if (pass.length < 4) return { ok: false, error: 'password_corta' };
  if (String(p.claveViaje || '').trim().toUpperCase() !== String(config().claveViaje).trim().toUpperCase())
    return { ok: false, error: 'clave_viaje_invalida' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (jugadorPorMatricula(mat)) return { ok: false, error: 'ya_registrado' };
    var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
    var primero = hoja.getLastRow() < 2;
    var equipo = p.equipo === 'rojo' ? 'rojo' : (p.equipo === 'azul' ? 'azul' : (contarEquipo('azul') <= contarEquipo('rojo') ? 'azul' : 'rojo'));
    hoja.appendRow([mat, String(p.nombre || '').trim() || ('Matrícula ' + mat), String(p.apodo || ''),
      Number(p.handicap) || 0, equipo, primero ? 'admin' : 'jugador', String(p.club || ''), '',
      hashear(mat, pass), new Date(), new Date()]);
    anotar(mat, 'alta', primero ? 'primer jugador, queda como admin' : 'se registró');
    limpiarCache();
    var j = jugadorPorMatricula(mat);
    return { ok: true, token: emitirToken(mat), jugador: sinHash(j), estado: estadoCrudo() };
  } finally { lock.releaseLock(); }
}

function login(p) {
  var mat = String(p.matricula || '').trim();
  var j = jugadorPorMatricula(mat);
  if (!j) return { ok: false, error: 'no_registrado' };
  if (j.hash !== hashear(mat, String(p.password || ''))) return { ok: false, error: 'password_incorrecta' };
  tocarAcceso(mat);
  return { ok: true, token: emitirToken(mat), jugador: sinHash(j), estado: estadoCrudo() };
}

/* ============================================================
   LECTURA
   ============================================================ */
function estado(token) {
  if (token && !sesion(token)) throw new Error('sesion_vencida');
  return estadoCrudo();
}
function estadoCrudo() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('estado');
  if (guardado) return JSON.parse(guardado);

  var cfg = config();
  var salida = {
    torneo: { nombre: cfg.torneo, sede: cfg.sede, edicion: cfg.edicion },
    equipos: { azul: { nombre: cfg.equipoAzul }, rojo: { nombre: cfg.equipoRojo } },
    jugadores: leer('Jugadores').map(sinHash),
    canchas: leer('Canchas').map(function (c) {
      var par = [], si = [];
      for (var i = 1; i <= 18; i++) { par.push(Number(c['par' + i]) || 4); si.push(Number(c['si' + i]) || i); }
      return { id: c.id, dia: Number(c.dia), nombre: c.nombre,
               confirmada: c.confirmada === true || c.confirmada === 'TRUE',
               formato: c.formato || '', par: par, si: si };
    }).sort(function (a, b) { return a.dia - b.dia; }),
    tarjetas: leer('Tarjetas').map(function (t) {
      var h = [];
      for (var i = 1; i <= 18; i++) { var v = t['h' + i]; h.push(v === '' || v === null ? null : Number(v)); }
      return { cancha: t.cancha, matricula: String(t.matricula), hoyos: h, actualizado: t.actualizado };
    }),
    sello: new Date().toISOString()
  };
  cache.put('estado', JSON.stringify(salida), CACHE_SEG);
  return salida;
}

/* ============================================================
   ESCRITURA
   ============================================================ */
function guardarGolpes(p) {
  // Cada jugador carga SOLO su tarjeta. El organizador tampoco puede tocar la de otro.
  var j = exigir(p.token);
  var mat = j.matricula;
  var cambios = p.hoyos || [];        // [{hoyo:1..18, golpes:4|null}]
  if (!p.cancha || !cambios.length) return { ok: false, error: 'faltan_datos' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Tarjetas');
    var fila = buscarFila(hoja, function (v) { return v[0] === p.cancha && String(v[1]) === String(mat); });
    if (!fila) {
      var nueva = [p.cancha, mat];
      for (var i = 0; i < 18; i++) nueva.push('');
      nueva.push(new Date());
      hoja.appendRow(nueva);
      fila = hoja.getLastRow();
    }
    var valores = hoja.getRange(fila, 3, 1, 18).getValues()[0];
    cambios.forEach(function (c) {
      var k = Number(c.hoyo) - 1;
      if (k < 0 || k > 17) return;
      valores[k] = (c.golpes === null || c.golpes === '' || c.golpes === undefined) ? '' : Number(c.golpes);
    });
    hoja.getRange(fila, 3, 1, 18).setValues([valores]);
    hoja.getRange(fila, 21).setValue(new Date());
    anotar(j.matricula, 'golpes', p.cancha + ' · ' + cambios.length + ' hoyo(s)');
    limpiarCache();
    return { ok: true, estado: estadoCrudo() };
  } finally { lock.releaseLock(); }
}

function guardarPerfil(p) {
  // Cada uno edita SOLO su perfil, el organizador incluido.
  var j = exigir(p.token);
  var mat = j.matricula;
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  var fila = buscarFila(hoja, function (v) { return String(v[0]) === String(mat); });
  if (!fila) return { ok: false, error: 'no_encontrado' };

  var campos = { nombre: 2, apodo: 3, handicap: 4, equipo: 5, club: 7, fotoId: 8 };
  Object.keys(campos).forEach(function (k) {
    if (p[k] === undefined || p[k] === null) return;
    var v = (k === 'handicap') ? (Number(p[k]) || 0) : String(p[k]);
    if (k === 'equipo' && v !== 'azul' && v !== 'rojo') return;
    hoja.getRange(fila, campos[k]).setValue(v);
  });
  if (p.password && String(p.password).length >= 4) hoja.getRange(fila, 9).setValue(hashear(mat, String(p.password)));
  anotar(j.matricula, 'perfil', 'actualizó su perfil');
  limpiarCache();
  return { ok: true, estado: estadoCrudo() };
}

function guardarCancha(p) {
  exigir(p.token, true);
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Canchas');
  var fila = buscarFila(hoja, function (v) { return v[0] === p.id; });
  if (!fila) return { ok: false, error: 'no_encontrada' };
  if (p.nombre) hoja.getRange(fila, 3).setValue(String(p.nombre));
  if (p.confirmada !== undefined) hoja.getRange(fila, 4).setValue(!!p.confirmada);
  if (p.formato !== undefined) hoja.getRange(fila, 5).setValue(String(p.formato || ''));
  if (p.par && p.par.length === 18) hoja.getRange(fila, 6, 1, 18).setValues([p.par.map(Number)]);
  if (p.si && p.si.length === 18) hoja.getRange(fila, 24, 1, 18).setValues([p.si.map(Number)]);
  anotar(sesion(p.token).matricula, 'cancha', p.id);
  limpiarCache();
  return { ok: true, estado: estadoCrudo() };
}

function guardarEquipos(p) {
  exigir(p.token, true);
  if (p.azul) escribirConfig('equipoAzul', String(p.azul));
  if (p.rojo) escribirConfig('equipoRojo', String(p.rojo));
  limpiarCache();
  return { ok: true, estado: estadoCrudo() };
}

function borrarTarjetas(p) {
  var j = exigir(p.token, true);
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Tarjetas');
  if (hoja.getLastRow() > 1) hoja.deleteRows(2, hoja.getLastRow() - 1);
  anotar(j.matricula, 'borrar', 'borró todas las tarjetas');
  limpiarCache();
  return { ok: true, estado: estadoCrudo() };
}

/* ============================================================
   AYUDANTES
   ============================================================ */
function leer(nombre) {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var cab = datos.shift();
  return datos.map(function (f) {
    var o = {};
    cab.forEach(function (c, i) { o[c] = f[i]; });
    return o;
  });
}
function buscarFila(hoja, cumple) {
  if (hoja.getLastRow() < 2) return null;
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
  for (var i = 0; i < datos.length; i++) if (cumple(datos[i])) return i + 2;
  return null;
}
function jugadorPorMatricula(mat) {
  var todos = leer('Jugadores');
  for (var i = 0; i < todos.length; i++) if (String(todos[i].matricula).trim() === String(mat).trim()) return todos[i];
  return null;
}
function sinHash(j) {
  return { matricula: String(j.matricula), nombre: j.nombre, apodo: j.apodo,
           handicap: Number(j.handicap) || 0, equipo: j.equipo || 'azul',
           rol: j.rol || 'jugador', club: j.club || '', fotoId: j.fotoId || '' };
}
function contarEquipo(k) {
  return leer('Jugadores').filter(function (j) { return j.equipo === k; }).length;
}
function tocarAcceso(mat) {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  var fila = buscarFila(hoja, function (v) { return String(v[0]).trim() === String(mat).trim(); });
  if (fila) hoja.getRange(fila, 11).setValue(new Date());
}
function escribirConfig(clave, valor) {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Config');
  var fila = buscarFila(hoja, function (v) { return v[0] === clave; });
  if (fila) hoja.getRange(fila, 2).setValue(valor); else hoja.appendRow([clave, valor]);
}
function anotar(mat, accion, detalle) {
  try { SpreadsheetApp.openById(SS_ID).getSheetByName('Log').appendRow([new Date(), mat, accion, detalle]); } catch (e) {}
}
function limpiarCache() { try { CacheService.getScriptCache().remove('estado'); } catch (e) {} }
