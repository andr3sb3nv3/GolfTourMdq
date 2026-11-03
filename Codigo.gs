/**
 * GOLF TOUR MDQ — backend
 * Se pega en la planilla "Golf Tour Mdq — Base de datos":
 *   Extensiones → Apps Script → pegar esto → Guardar
 *   Ejecutar  configurar()  UNA sola vez, al estrenar la planilla. Después
 *   nunca más: borra todo. Para actualizar el código alcanza con pegar esto
 *   y correr las funciones  migrar…()  , que no borran nada.
 *   Implementar → Nueva implementación → Aplicación web
 *      Ejecutar como: Yo    ·    Quién tiene acceso: Cualquier usuario
 *   Copiar la URL que termina en /exec y pasársela a la app.
 */

var SS_ID = '1aroTWtBKWw8xb9d7Lliki0cCXZvbjdgrxHqB8fqlZtI';
var CACHE_SEG = 15;          // segundos que se cachea el estado (cuida la cuota diaria)
var TOKEN_DIAS = 60;         // duración de la sesión en el celular

var HOJAS = {
  Config:    ['clave', 'valor'],
  Jugadores: ['matricula', 'nombre', 'apodo', 'handicap', 'equipo', 'rol', 'club', 'fotoId', 'hash', 'alta', 'ultimoAcceso', 'resetCodigo', 'resetVence'],
  Canchas:   ['id', 'dia', 'nombre', 'confirmada', 'formato'],   // + par1..par18 + si1..si18
  Tarjetas:  ['cancha', 'matricula'],                 // + h1..h18 + actualizado
  Partidos:  ['id', 'cancha', 'formato', 'usa1', 'usa2', 'eur1', 'eur2', 'usa3', 'eur3', 'hcpUsa', 'hcpEur'],   // usa3/eur3 y hcp del equipo: scramble de a 3
  TarjetasEquipo: ['partido', 'lado'],               // + h1..h18 + actualizado
  Partidas:  ['id', 'fecha', 'cancha', 'modalidad', 'jugadores', 'creador', 'hoja', 'resultado'],
  Log:       ['fecha', 'matricula', 'accion', 'detalle']
};
for (var i = 1; i <= 18; i++) HOJAS.Canchas.push('par' + i);
for (var i = 1; i <= 18; i++) HOJAS.Canchas.push('si' + i);
for (var i = 1; i <= 18; i++) HOJAS.Tarjetas.push('h' + i);
HOJAS.Tarjetas.push('actualizado');
for (var i = 1; i <= 18; i++) HOJAS.TarjetasEquipo.push('h' + i);
HOJAS.TarjetasEquipo.push('actualizado');
HOJAS.TarjetasEquipo.push('salidas');   // scramble: de quién fue la salida en cada hoyo (matrículas separadas por coma)

/* ============================================================
   REVISAR — qué hay cargado hoy en la planilla.
   Está primera a propósito: el editor de Apps Script deja seleccionada la
   primera función del archivo, así que es la que se ejecuta si alguien le da
   a "Ejecutar" sin mirar el desplegable. Esta no toca nada.
   ============================================================ */
function revisar() {
  var ss = SpreadsheetApp.openById(SS_ID), salida = [];
  ss.getSheets().forEach(function (h) {
    salida.push(h.getName() + ': ' + Math.max(0, h.getLastRow() - 1) + ' fila(s)');
  });
  var texto = salida.join('\n');
  Logger.log(texto);
  return texto;
}

/* ============================================================
   CONFIGURACIÓN INICIAL — deja TODAS las hojas en cero.
   Sirve una sola vez, al estrenar la planilla. Después no se toca nunca más:
   borra jugadores, tarjetas y partidas. Por eso ahora se planta sola si
   encuentra datos cargados.
   ============================================================ */
function configurar() {
  var jug = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  if (jug && jug.getLastRow() > 1) {
    throw new Error('NO se hizo nada. Hay ' + (jug.getLastRow() - 1) + ' jugador(es) cargados y ' +
      'configurar() borra TODA la planilla. Para las actualizaciones de código no hace falta ' +
      'correr nada de esto: alcanza con las funciones migrar…(), que no borran. ' +
      'Si de verdad querés arrancar de cero, corré borrarTodoYEmpezarDeNuevo().');
  }
  borrarTodoYEmpezarDeNuevo();
}

function borrarTodoYEmpezarDeNuevo() {
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
  cfg.getRange(2, 1, 6, 2).setValues([
    ['torneo',      'Ryder MDQ'],
    ['sede',        'Mar del Plata'],
    ['edicion',     '2026'],
    ['equipoAzul',  'Team Europe'],
    ['equipoRojo',  'Team USA'],
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
    ['miramar',     1, 'Miramar Links',    false, ''].concat(provMira.par, provMira.si),
    ['acantilados', 2, 'Acantilados Golf', false, ''].concat(provAcan.par, provAcan.si),
    ['marayui',     2, 'Marayui Golf',     false, 'scramble'].concat([4,4,3,5,4,4,3,5,4, 4,4,3,5,4,4,3,5,4], [1,3,5,7,9,11,13,15,17, 2,4,6,8,10,12,14,16,18]),
    ['catedral',    3, 'La Catedral',      true , ''].concat(catedral.par, catedral.si)
  ];
  ss.getSheetByName('Canchas').getRange(2, 1, canchas.length, canchas[0].length).setValues(canchas);

  SpreadsheetApp.flush();
  Logger.log('Listo. Cada jugador se registra con su matrícula y un PIN de 4 números.');
  return 'ok';
}

/**
 * MIGRACIÓN — correr UNA sola vez, después de pegar esta versión del código.
 * Agrega la columna "formato" a la pestaña Canchas sin tocar nada de lo cargado.
 * NO correr configurar() de nuevo: eso borra jugadores y tarjetas.
 */
/**
 * MIGRACIÓN SCRAMBLE — correr UNA vez después de pegar esta versión. No borra nada.
 *  · Agrega Marayui Golf (sábado a la tarde, scramble de a 3, 9 hoyos) si no está.
 *  · Ordena los días como quedó la gira: vie Miramar · sáb Acantilados y Marayui · dom La Catedral.
 *  · Agrega las columnas usa3 y eur3 a Partidos.
 * La tarjeta de Marayui queda provisoria: cargá la oficial desde la app (Canchas).
 */
function migrarScramble() {
  var ss = SpreadsheetApp.openById(SS_ID), hechas = [];
  var hoja = ss.getSheetByName('Canchas');
  var v = hoja.getDataRange().getValues();
  var fila = {};
  for (var i = 1; i < v.length; i++) fila[String(v[i][0])] = i + 1;
  if (!fila.marayui) {
    var par = [4,4,3,5,4,4,3,5,4, 4,4,3,5,4,4,3,5,4], si = [1,3,5,7,9,11,13,15,17, 2,4,6,8,10,12,14,16,18];
    hoja.appendRow(['marayui', 2, 'Marayui Golf', false, 'scramble'].concat(par, si));
    hechas.push('Marayui agregada (tarjeta provisoria)');
  }
  var dias = { miramar: 1, acantilados: 2, marayui: 2, catedral: 3 };
  Object.keys(dias).forEach(function (id) {
    if (!fila[id]) return;
    if (Number(hoja.getRange(fila[id], 2).getValue()) !== dias[id]) { hoja.getRange(fila[id], 2).setValue(dias[id]); hechas.push(id + ' → día ' + dias[id]); }
  });
  var pt = ss.getSheetByName('Partidos');
  if (pt) { var antes = pt.getLastColumn(); columnasTrio(pt); if (pt.getLastColumn() > antes) hechas.push('Partidos: columnas usa3, eur3, hcpUsa y hcpEur'); }
  var te = ss.getSheetByName('TarjetasEquipo');
  if (te) { var antesT = te.getLastColumn(); columnasAlFinal(te, ['salidas']); if (te.getLastColumn() > antesT) hechas.push('TarjetasEquipo: columna salidas'); }
  limpiarCache();
  var texto = hechas.length ? hechas.join('\n') : 'Ya estaba todo, no se tocó nada.';
  Logger.log(texto);
  return texto;
}

/**
 * MIGRACIÓN 2 — crea las pestañas del match play sin tocar lo cargado.
 */
function migrarPartidos() {
  var ss = SpreadsheetApp.openById(SS_ID), hechas = [];
  ['Partidos', 'TarjetasEquipo'].forEach(function (nombre) {
    if (ss.getSheetByName(nombre)) return;
    var h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, HOJAS[nombre].length).setValues([HOJAS[nombre]])
      .setFontWeight('bold').setBackground('#EDF0E8');
    h.setFrozenRows(1);
    hechas.push(nombre);
  });
  limpiarCache();
  return hechas.length ? 'Creadas: ' + hechas.join(', ') : 'Ya estaban, no se tocó nada.';
}

/**
 * MIGRACIÓN 3 — columnas para restablecer contraseñas. No toca nada de lo cargado.
 */
function migrarReset() {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  var cab = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
  var faltan = ['resetCodigo', 'resetVence'].filter(function (c) { return cab.indexOf(c) < 0; });
  if (!faltan.length) return 'Ya estaba migrada, no se tocó nada.';
  faltan.forEach(function (c) {
    var col = hoja.getLastColumn() + 1;
    hoja.getRange(1, col).setValue(c).setFontWeight('bold').setBackground('#EDF0E8');
  });
  limpiarCache();
  return 'Listo: ' + faltan.join(' y ') + '.';
}

/**
 * MIGRACIÓN 4 — índice de partidas rápidas. Cada partida además crea su
 * propia hoja, así queda el historial de todas las vueltas sueltas.
 */
function migrarRapidas() {
  var ss = SpreadsheetApp.openById(SS_ID);
  if (ss.getSheetByName('Partidas')) return 'Ya estaba, no se tocó nada.';
  var h = ss.insertSheet('Partidas');
  h.getRange(1, 1, 1, HOJAS.Partidas.length).setValues([HOJAS.Partidas])
    .setFontWeight('bold').setBackground('#EDF0E8');
  h.setFrozenRows(1);
  limpiarCache();
  return 'Listo: hoja Partidas creada.';
}

function migrarFormato() {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Canchas');
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  if (cab.indexOf('formato') >= 0) return 'Ya estaba migrada, no se tocó nada.';
  hoja.insertColumnAfter(4);                       // queda entre "confirmada" y "par1"
  hoja.getRange(1, 5).setValue('formato').setFontWeight('bold').setBackground('#EDF0E8');
  limpiarCache();
  return 'Listo: columna "formato" agregada.';
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
      case 'diag':      return diagnostico();
      case 'registrar': return registrar(p);
      case 'login':     return login(p);
      case 'estado':    return { ok: true, estado: estado(p.token) };
      case 'golpes':    return guardarGolpes(p);
      case 'perfil':    return guardarPerfil(p);
      case 'foto':      return guardarFoto(p);
      case 'cancha':    return guardarCancha(p);
      case 'equipos':   return guardarEquipos(p);
      case 'torneo':    return guardarTorneo(p);
      case 'partidos':  return guardarPartidos(p);
      case 'golpesEquipo': return guardarGolpesEquipo(p);
      case 'hcpEquipo': return guardarHcpEquipo(p);
      case 'resetPedir':   return resetPedir(p);
      case 'resetAplicar': return resetAplicar(p);
      case 'resetPendientes': return resetPendientes(p);
      case 'prCrear':   return prCrear(p);
      case 'prGuardar': return prGuardar(p);
      case 'prLista':   return prLista(p);
      case 'prLeer':    return prLeer(p);
      case 'borrar':    return borrarTarjetas(p);
      case 'avisos':    return avisosPublicos(p);
      case 'pushClave': return pushClave();
      case 'pushAlta':  return pushAlta(p);
      case 'pushBaja':  return pushBaja(p);
      case 'pushPrueba': return pushPrueba(p);
      default:          return { ok: false, error: 'accion_desconocida' };
    }
  } catch (err) {
    var msg = String(err && err.message || err);
    // exigir() lanza estos dos. Son del pedido, no del servidor: si caen en el
    // catch genérico, la app dice "falló el servidor" cuando lo único que pasa
    // es que hay que volver a entrar.
    if (msg === 'sesion_vencida' || msg === 'solo_admin') return { ok: false, error: msg };
    return { ok: false, error: 'error_servidor', detalle: msg };
  }
}

/* ============================================================
   DIAGNÓSTICO — se abre en el navegador con  ?accion=diag
   Corre uno por uno los pasos que hace crear una partida rápida y dice
   cuál se rompe. No pide sesión y no toca datos: la hoja de prueba que
   crea la borra enseguida.
   ============================================================ */
function diagnostico() {
  var r = { ok: true, pasos: [] };
  function paso(nombre, fn) {
    try {
      r.pasos.push(nombre + ' → ' + fn());
    } catch (e) {
      r.ok = false;
      r.pasos.push(nombre + ' → ERROR: ' + String(e && e.message || e));
    }
  }
  paso('abrir la planilla', function () { return SpreadsheetApp.openById(SS_ID).getName(); });
  paso('hojas que tiene', function () {
    return SpreadsheetApp.openById(SS_ID).getSheets().length;
  });
  paso('hoja Partidas', function () {
    return SpreadsheetApp.openById(SS_ID).getSheetByName('Partidas')
      ? 'existe' : 'FALTA — hay que correr migrarRapidas()';
  });
  paso('salt en Config', function () {
    return config().salt ? 'está' : 'FALTA — sin esto no se puede validar ninguna sesión';
  });
  paso('firmar un token', function () { return firmar('prueba') ? 'anda' : 'devolvió vacío'; });
  paso('candado del script', function () {
    var l = LockService.getScriptLock();
    if (!l.tryLock(3000)) return 'OCUPADO — hay otra ejecución trabada tomándolo';
    l.releaseLock();
    return 'libre';
  });
  paso('crear y borrar una hoja', function () {
    var ss = SpreadsheetApp.openById(SS_ID);
    var h = ss.insertSheet('PR diag ' + Date.now());
    ss.deleteSheet(h);
    return 'anda';
  });
  paso('partidas ya guardadas', function () { return leer('Partidas').length; });
  paso('jugadores registrados', function () { return leer('Jugadores').length; });
  paso('avisos push', function () {
    if (typeof BigInt === 'undefined') return 'ERROR: este Apps Script no tiene BigInt (activar el runtime V8)';
    var c = clavesVapid();
    return c.pub ? 'clave lista · ' + leer('Suscripciones').length + ' celular(es) anotados' : 'FALTA la clave';
  });
  // Un paso puede fallar sin lanzar (una hoja que falta, el candado tomado):
  // el resumen tiene que reflejarlo igual.
  r.ok = !r.pasos.some(function (p) { return /ERROR|FALTA|OCUPADO/.test(p); });
  r.resumen = r.ok ? 'Todo en orden.' : 'Hay algo roto: mirá el paso que dice ERROR, FALTA u OCUPADO.';
  return r;
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
  // Para entrar alcanza con la matrícula y un PIN de cuatro números: ya no hay
  // clave del viaje. La fila claveViaje de la hoja Config queda sin uso.
  if (!/^\d{4}$/.test(pass)) return { ok: false, error: 'password_corta' };

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
   CONTRASEÑA OLVIDADA
   El jugador pide un código; el código le llega al organizador
   (por mail y dentro de la app) y él se lo pasa. Dura 30 minutos
   y sirve una sola vez.
   ============================================================ */
var RESET_MIN = 30;

function correoOrganizador() {
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}
function avisarPorMail(asunto, cuerpo) {
  var para = correoOrganizador();
  if (!para) return;
  try { MailApp.sendEmail(para, asunto, cuerpo); } catch (e) {}
}
function filaJugador(mat) {
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  var fila = buscarFila(hoja, function (v) { return String(v[0]).trim() === String(mat).trim(); });
  return fila ? { hoja: hoja, fila: fila } : null;
}

function resetPedir(p) {
  var mat = String(p.matricula || '').trim();
  var j = jugadorPorMatricula(mat);
  if (!j) return { ok: false, error: 'no_registrado' };
  var ref = filaJugador(mat);
  if (!ref) return { ok: false, error: 'no_encontrado' };
  if (ref.hoja.getLastColumn() < 13) return { ok: false, error: 'falta_migrar' };

  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  ref.hoja.getRange(ref.fila, 12).setValue(codigo);
  ref.hoja.getRange(ref.fila, 13).setValue(Date.now() + RESET_MIN * 60000);

  var texto = j.nombre + ' (matrícula ' + mat + ') se olvidó la contraseña y pidió un código.'
    + '\n\nCÓDIGO: ' + codigo
    + '\n\nVence en ' + RESET_MIN + ' minutos y sirve una sola vez.'
    + '\nPasáselo para que lo ponga en la app junto con su contraseña nueva.'
    + '\n\nSi no fue él, ignorá este mail: sin el código no puede cambiar nada.';
  avisarPorMail('Golf Tour Mdq · código para ' + j.nombre, texto);

  anotar(mat, 'reset', 'pidió un código');
  limpiarCache();
  return { ok: true, organizador: nombreOrganizador() };
}

function resetAplicar(p) {
  var mat = String(p.matricula || '').trim();
  var j = jugadorPorMatricula(mat);
  if (!j) return { ok: false, error: 'no_registrado' };
  if (!/^\d{4}$/.test(String(p.password || ''))) return { ok: false, error: 'password_corta' };
  if (!j.resetCodigo || String(j.resetCodigo).trim() !== String(p.codigo || '').trim())
    return { ok: false, error: 'codigo_invalido' };
  if (Number(j.resetVence || 0) < Date.now()) return { ok: false, error: 'codigo_vencido' };

  var ref = filaJugador(mat);
  ref.hoja.getRange(ref.fila, 9).setValue(hashear(mat, String(p.password)));
  ref.hoja.getRange(ref.fila, 12).setValue('');
  ref.hoja.getRange(ref.fila, 13).setValue('');
  anotar(mat, 'reset', 'cambió su contraseña con el código');
  limpiarCache();
  return { ok: true, token: emitirToken(mat), jugador: sinHash(jugadorPorMatricula(mat)), estado: estadoCrudo() };
}

function resetPendientes(p) {
  exigir(p.token, true);
  var ahora = Date.now();
  return { ok: true, pedidos: leer('Jugadores').filter(function (j) {
    return j.resetCodigo && Number(j.resetVence || 0) > ahora;
  }).map(function (j) {
    return { matricula: String(j.matricula), nombre: j.nombre, codigo: String(j.resetCodigo),
             minutos: Math.max(0, Math.round((Number(j.resetVence) - ahora) / 60000)) };
  }) };
}
function nombreOrganizador() {
  var a = leer('Jugadores').filter(function (j) { return j.rol === 'admin'; })[0];
  return a ? a.nombre : 'el organizador';
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
    partidos: leer('Partidos').map(function (m) {
      return { id: String(m.id), cancha: m.cancha, formato: m.formato,
               usa: [String(m.usa1 || ''), String(m.usa2 || ''), String(m.usa3 || '')].filter(Boolean),
               eur: [String(m.eur1 || ''), String(m.eur2 || ''), String(m.eur3 || '')].filter(Boolean),
               hcpUsa: hcpONull(m.hcpUsa), hcpEur: hcpONull(m.hcpEur) };
    }),
    tarjetasEquipo: leer('TarjetasEquipo').map(function (t) {
      var h = [];
      for (var i = 1; i <= 18; i++) { var v = t['h' + i]; h.push(v === '' || v === null ? null : Number(v)); }
      var sal = String(t.salidas || '').split(',').slice(0, 18).map(function (x) { return String(x).trim() || null; });
      while (sal.length < 18) sal.push(null);
      return { partido: String(t.partido), lado: t.lado, hoyos: h, salidas: sal };
    }),
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
/* ¿Están los dos en el mismo partido de esa cancha? Es lo único que habilita
   cargarle la tarjeta a otro. */
function mismaLinea(a, b, cid) {
  var ms = leer('Partidos').filter(function (m) { return m.cancha === cid; });
  for (var i = 0; i < ms.length; i++) {
    var en = [ms[i].usa1, ms[i].usa2, ms[i].usa3, ms[i].eur1, ms[i].eur2, ms[i].eur3]
      .map(function (x) { return String(x || '').trim(); });
    if (en.indexOf(String(a).trim()) >= 0 && en.indexOf(String(b).trim()) >= 0) return true;
  }
  return false;
}

function guardarGolpes(p) {
  /* Cada uno carga su tarjeta. La única excepción: en la Ryder anota uno solo
     por toda la línea, así que se admite cargarle la tarjeta a alguien del
     mismo partido. Fuera de tu partido, nadie te toca la tarjeta: tampoco el
     organizador. */
  var j = exigir(p.token);
  var mat = String(p.matricula || j.matricula).trim();
  var cambios = p.hoyos || [];        // [{hoyo:1..18, golpes:4|null}]
  if (!p.cancha || !cambios.length) return { ok: false, error: 'faltan_datos' };
  if (mat !== String(j.matricula).trim() && !mismaLinea(j.matricula, mat, p.cancha))
    return { ok: false, error: 'no_es_tu_linea' };

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
    var antes = valores.slice();
    cambios.forEach(function (c) {
      var k = Number(c.hoyo) - 1;
      if (k < 0 || k > 17) return;
      valores[k] = (c.golpes === null || c.golpes === '' || c.golpes === undefined) ? '' : Number(c.golpes);
    });
    hoja.getRange(fila, 3, 1, 18).setValues([valores]);
    hoja.getRange(fila, 21).setValue(new Date());
    publicarAvisos(avisosDeTarjeta(p.cancha, antes, valores, function () {
      return { quien: nombreAviso(jugadorPorMatricula(mat)) };
    }), j.matricula);
    anotar(j.matricula, 'golpes', p.cancha + ' · ' + cambios.length + ' hoyo(s)' +
      (mat === String(j.matricula).trim() ? '' : ' · por ' + mat));
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
  if (p.password && /^\d{4}$/.test(String(p.password))) hoja.getRange(fila, 9).setValue(hashear(mat, String(p.password)));
  anotar(j.matricula, 'perfil', 'actualizó su perfil');
  limpiarCache();
  return { ok: true, estado: estadoCrudo() };
}

/**
 * Foto de perfil. Llega como data URL, se guarda en la subcarpeta "Fotos"
 * del Drive y en la planilla queda solo el id del archivo.
 * OJO: usa DriveApp, así que la primera vez Google pide autorizar de nuevo.
 */
function carpetaFotos() {
  var padre = DriveApp.getFileById(SS_ID).getParents().next();
  var it = padre.getFoldersByName('Fotos');
  return it.hasNext() ? it.next() : padre.createFolder('Fotos');
}
function guardarFoto(p) {
  var j = exigir(p.token);
  var m = String(p.foto || '').match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!m) return { ok: false, error: 'foto_invalida' };

  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'foto-' + j.matricula + '.jpg');
  if (blob.getBytes().length > 3000000) return { ok: false, error: 'foto_muy_grande' };

  if (j.fotoId) { try { DriveApp.getFileById(String(j.fotoId)).setTrashed(true); } catch (e) {} }
  var archivo = carpetaFotos().createFile(blob);
  try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Jugadores');
  var fila = buscarFila(hoja, function (v) { return String(v[0]).trim() === String(j.matricula).trim(); });
  if (!fila) return { ok: false, error: 'no_encontrado' };
  hoja.getRange(fila, 8).setValue(archivo.getId());
  anotar(j.matricula, 'foto', 'subió su foto');
  limpiarCache();
  return { ok: true, fotoId: archivo.getId(), estado: estadoCrudo() };
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

function guardarTorneo(p) {
  exigir(p.token, true);
  if (p.nombre) escribirConfig('torneo', String(p.nombre));
  if (p.sede) escribirConfig('sede', String(p.sede));
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

/**
 * El organizador arma los partidos de una jornada. Reemplaza los de esa cancha.
 * lista: [{ usa:[mat,mat], eur:[mat,mat] }]  — en singles, un solo jugador por lado.
 */
function guardarPartidos(p) {
  var j = exigir(p.token, true);
  if (!p.cancha) return { ok: false, error: 'faltan_datos' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var hoja = ss.getSheetByName('Partidos');
    if (!hoja) return { ok: false, error: 'falta_migrar' };

    // se borran los de esta cancha, de abajo hacia arriba
    if (hoja.getLastRow() > 1) {
      var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
      for (var i = datos.length - 1; i >= 0; i--) if (datos[i][1] === p.cancha) hoja.deleteRow(i + 2);
    }
    columnasTrio(hoja);
    var fmt = String(p.formato || '');
    (p.lista || []).forEach(function (m, k) {
      var usa = m.usa || [], eur = m.eur || [];
      hoja.appendRow([p.cancha + '-' + (k + 1), p.cancha, fmt,
        String(usa[0] || ''), String(usa[1] || ''), String(eur[0] || ''), String(eur[1] || ''),
        String(usa[2] || ''), String(eur[2] || '')]);
    });
    anotar(j.matricula, 'partidos', p.cancha + ' · ' + (p.lista || []).length + ' partido(s) de ' + (fmt || 'sin formato'));
    limpiarCache();
    return { ok: true, estado: estadoCrudo() };
  } finally { lock.releaseLock(); }
}

/* La pestaña Partidos nació con dos jugadores por lado. Para el scramble de a 3
   se agregan las columnas usa3, eur3, hcpUsa y hcpEur al final, sin mover nada de lo cargado. */
function columnasTrio(hoja) { return columnasAlFinal(hoja, ['usa3', 'eur3', 'hcpUsa', 'hcpEur']); }
// Agrega las columnas que falten al final y devuelve la cabecera como quedó.
function columnasAlFinal(hoja, nombres) {
  var cab = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0].map(String);
  nombres.forEach(function (c) {
    if (cab.indexOf(c) >= 0) return;
    cab.push(c);
    hoja.getRange(1, cab.length).setValue(c).setFontWeight('bold').setBackground('#EDF0E8');
  });
  return cab;
}
function hcpONull(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * Scramble: el handicap de juego de cada equipo lo fija el comité (el organizador).
 * p.hcp vacío = vuelve a la fórmula de la app.
 */
function guardarHcpEquipo(p) {
  var j = exigir(p.token, true);
  if (p.lado !== 'usa' && p.lado !== 'eur') return { ok: false, error: 'faltan_datos' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Partidos');
    if (!hoja) return { ok: false, error: 'falta_migrar' };
    var cab = columnasTrio(hoja);
    var fila = buscarFila(hoja, function (v) { return String(v[0]) === String(p.partido); });
    if (!fila) return { ok: false, error: 'partido_inexistente' };
    var n = hcpONull(p.hcp);
    hoja.getRange(fila, cab.indexOf(p.lado === 'usa' ? 'hcpUsa' : 'hcpEur') + 1).setValue(n === null ? '' : n);
    anotar(j.matricula, 'hcpEquipo', p.partido + ' · ' + p.lado + ' · ' + (n === null ? 'fórmula' : n));
    limpiarCache();
    return { ok: true, estado: estadoCrudo() };
  } finally { lock.releaseLock(); }
}

/**
 * Foursomes y scramble: el lado juega una sola pelota, así que la tarjeta es del LADO.
 * En la Ryder anota uno por toda la línea: cualquiera que juegue el partido puede
 * cargar la tarjeta de cualquiera de los dos lados (p.lado). Si no viene p.lado
 * (versiones viejas de la app), se carga la de su propio lado, como antes.
 */
function guardarGolpesEquipo(p) {
  var j = exigir(p.token);
  var partidos = leer('Partidos');
  var m = null;
  for (var i = 0; i < partidos.length; i++) if (String(partidos[i].id) === String(p.partido)) m = partidos[i];
  if (!m) return { ok: false, error: 'partido_inexistente' };

  var mat = String(j.matricula);
  var miLado = (String(m.usa1) === mat || String(m.usa2) === mat || String(m.usa3 || '') === mat) ? 'usa'
             : (String(m.eur1) === mat || String(m.eur2) === mat || String(m.eur3 || '') === mat) ? 'eur' : null;
  if (!miLado) return { ok: false, error: 'no_jugas_ese_partido' };
  var lado = (p.lado === 'usa' || p.lado === 'eur') ? p.lado : miLado;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('TarjetasEquipo');
    var fila = buscarFila(hoja, function (v) { return String(v[0]) === String(p.partido) && v[1] === lado; });
    if (!fila) {
      var nueva = [String(p.partido), lado];
      for (var k = 0; k < 18; k++) nueva.push('');
      nueva.push(new Date());
      hoja.appendRow(nueva);
      fila = hoja.getLastRow();
    }
    var valores = hoja.getRange(fila, 3, 1, 18).getValues()[0];
    var antes = valores.slice();
    (p.hoyos || []).forEach(function (c) {
      var k = Number(c.hoyo) - 1;
      if (k < 0 || k > 17) return;
      valores[k] = (c.golpes === null || c.golpes === '' || c.golpes === undefined) ? '' : Number(c.golpes);
    });
    hoja.getRange(fila, 3, 1, 18).setValues([valores]);
    hoja.getRange(fila, 21).setValue(new Date());
    // scramble: de quién fue la salida elegida (solo si la app lo manda)
    var conSalida = (p.hoyos || []).filter(function (c) { return c.salida !== undefined; });
    if (conSalida.length) {
      var col = columnasAlFinal(hoja, ['salidas']).indexOf('salidas') + 1;
      var sal = String(hoja.getRange(fila, col).getValue() || '').split(',');
      while (sal.length < 18) sal.push('');
      conSalida.forEach(function (c) {
        var k = Number(c.hoyo) - 1;
        if (k >= 0 && k < 18) sal[k] = String(c.salida || '').replace(/,/g, '').trim();
      });
      hoja.getRange(fila, col).setNumberFormat('@').setValue(sal.slice(0, 18).join(','));
    }
    publicarAvisos(avisosDeTarjeta(m.cancha, antes, valores, function () { return avisoEquipo(m, lado); }), mat);
    anotar(mat, 'golpesEquipo', p.partido + ' · lado ' + lado);
    limpiarCache();
    return { ok: true, estado: estadoCrudo() };
  } finally { lock.releaseLock(); }
}

/* ============================================================
   PARTIDAS RÁPIDAS
   Cada partida vive en su propia hoja y queda listada en "Partidas".
   ============================================================ */
function prHojaNombre(id) { return 'PR ' + id; }
// Acá se escribe con coma decimal, y Number('10,5') es NaN.
function numHcp(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function prCrear(p) {
  var j = exigir(p.token);
  var ss = SpreadsheetApp.openById(SS_ID);
  var indice = ss.getSheetByName('Partidas');
  if (!indice) return { ok: false, error: 'falta_migrar' };

  var jug = p.jugadores || [];
  if (jug.length < 2 || jug.length > 4) return { ok: false, error: 'jugadores_invalidos' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // insertSheet revienta si ya existe una hoja con ese nombre, y el id tiene
    // resolución de un segundo: si dos partidas arrancan juntas, se desempata.
    var id = Utilities.formatDate(new Date(), 'GMT-3', 'yyyyMMdd-HHmmss'), base = id, n = 2;
    while (ss.getSheetByName(prHojaNombre(id))) { id = base + '-' + n; n++; }
    var hoja = ss.insertSheet(prHojaNombre(id));

    hoja.getRange(1, 1, 4, 2).setValues([
      ['Partida rápida', id],
      ['Fecha', new Date()],
      ['Cancha', String(p.cancha || '')],
      ['Modalidad', String(p.modalidad || '')]
    ]);
    hoja.getRange(1, 1, 4, 1).setFontWeight('bold');

    var cab = ['Jugador', 'HCP', 'Equipo'];
    for (var i = 1; i <= 18; i++) cab.push('H' + i);
    cab.push('Bruto', 'Neto', 'Resultado');
    hoja.getRange(6, 1, 1, cab.length).setValues([cab])
      .setFontWeight('bold').setBackground('#EDF0E8');
    hoja.setFrozenRows(6);

    var filas = jug.map(function (x) {
      var f = [String(x.nombre || ''), numHcp(x.hcp), String(x.equipo || '')];
      for (var k = 0; k < 18; k++) f.push('');
      return f.concat(['', '', '']);
    });
    hoja.getRange(7, 1, filas.length, filas[0].length).setValues(filas);

    indice.appendRow([id, new Date(), String(p.cancha || ''), String(p.modalidad || ''),
      jug.map(function (x) { return x.nombre; }).join(', '), j.matricula, prHojaNombre(id), '']);

    anotar(j.matricula, 'partidaRapida', id + ' · ' + p.cancha + ' · ' + p.modalidad);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function prGuardar(p) {
  exigir(p.token);
  var ss = SpreadsheetApp.openById(SS_ID);
  var hoja = ss.getSheetByName(prHojaNombre(p.id));
  if (!hoja) return { ok: false, error: 'partida_inexistente' };

  var jug = p.jugadores || [];
  var filas = jug.map(function (x) {
    var f = [String(x.nombre || ''), numHcp(x.hcp), String(x.equipo || '')];
    for (var k = 0; k < 18; k++) {
      var v = (x.hoyos || [])[k];
      f.push(v === null || v === undefined || v === '' ? '' : Number(v));
    }
    return f.concat([x.bruto || '', x.neto || '', String(x.resultado || '')]);
  });
  if (filas.length) hoja.getRange(7, 1, filas.length, filas[0].length).setValues(filas);

  if (p.resultado) {
    var indice = ss.getSheetByName('Partidas');
    var fila = buscarFila(indice, function (v) { return String(v[0]) === String(p.id); });
    if (fila) indice.getRange(fila, 8).setValue(String(p.resultado));
  }
  return { ok: true };
}

function prLista(p) {
  exigir(p.token);
  return { ok: true, partidas: leer('Partidas').map(function (x) {
    return { id: String(x.id), fecha: x.fecha, cancha: x.cancha, modalidad: x.modalidad,
             jugadores: x.jugadores, resultado: x.resultado };
  }).reverse().slice(0, 40) };
}

function prLeer(p) {
  exigir(p.token);
  var hoja = SpreadsheetApp.openById(SS_ID).getSheetByName(prHojaNombre(p.id));
  if (!hoja) return { ok: false, error: 'partida_inexistente' };
  var enc = hoja.getRange(1, 1, 4, 2).getValues();
  var ult = hoja.getLastRow();
  var cuerpo = ult >= 7 ? hoja.getRange(7, 1, ult - 6, 24).getValues() : [];
  return { ok: true, partida: {
    id: String(enc[0][1]), cancha: String(enc[2][1]), modalidad: String(enc[3][1]),
    jugadores: cuerpo.filter(function (f) { return f[0]; }).map(function (f) {
      var hoyos = [];
      for (var i = 3; i < 21; i++) hoyos.push(f[i] === '' ? null : Number(f[i]));
      return { nombre: f[0], hcp: Number(f[1]) || 0, equipo: f[2], hoyos: hoyos };
    })
  } };
}

/* ============================================================
   AVISOS PUSH — birdies, águilas y compañía
   Cuando alguien anota un golpe bajo par, les llega una notificación a todos
   los que activaron los avisos en el celular (menos al que lo anotó).
   Es Web Push estándar, sin servicios de terceros: las claves (VAPID) las
   genera este script la primera vez y quedan en Propiedades del script.
   El aviso viaja vacío; el celular, al recibirlo, pide el texto con
   ?accion=avisos . Así no hace falta cifrar nada.
   ============================================================ */
var AVISOS_HORAS = 6;        // un aviso más viejo que esto ya no se muestra
var AVISOS_MAX = 40;

function hojaSuscripciones() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var h = ss.getSheetByName('Suscripciones');
  if (!h) { h = ss.insertSheet('Suscripciones'); h.appendRow(['endpoint', 'matricula', 'alta', 'dispositivo']); }
  return h;
}

/* Texto del aviso según cuántos golpes bajo par. Cada uno con su pájaro. */
function textoAviso(quien, golpes, par) {
  var bajo = par - golpes;
  if (golpes === 1) return '🦅⛳ ¡HOYO EN UNO de ' + quien + '!';
  if (bajo >= 3) return '🕊️ ¡ALBATROS de ' + quien + '!';
  if (bajo === 2) return '🦅 ¡Águila de ' + quien + '!';
  return '🐦 ¡Birdie de ' + quien + '!';
}
/* Foursomes y scramble: el birdie es del equipo, van todos los nombres. */
function avisoEquipo(m, lado) {
  var nombres = [m[lado + '1'], m[lado + '2'], m[lado + '3']].filter(function (x) { return String(x || '').trim(); })
    .map(function (x) { return nombreAviso(jugadorPorMatricula(x)); });
  var cfg = config(), eq = lado === 'usa' ? cfg.equipoRojo : cfg.equipoAzul;   // en la app, usa = rojo
  var fmt = m.formato === 'scramble' ? 'scramble' : m.formato === 'foursomes' ? 'foursomes' : String(m.formato || '');
  return { quien: unirNombres(nombres), extra: [fmt, eq].filter(Boolean).join(', ') };
}
function nombreAviso(j) { return j ? String(j.apodo || j.nombre || j.matricula) : '?'; }
function unirNombres(n) { return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1]; }

/* Compara la tarjeta antes y después de guardar y arma un aviso por cada
   hoyo que quedó bajo par y antes no tenía ese número. */
function avisosDeTarjeta(canchaId, antes, despues, quienFn) {
  var hay = false;
  for (var q = 0; q < 18; q++) {
    var gq = Number(despues[q]);
    if (despues[q] !== '' && gq > 0 && gq <= 5 && String(antes[q]) !== String(gq)) hay = true;
  }
  if (!hay) return [];               // lo normal: nada bajo par, ni se lee la cancha
  var c = null, quien = null;
  leer('Canchas').forEach(function (x) { if (x.id === canchaId) c = x; });
  if (!c) return [];
  var lista = [];
  for (var k = 0; k < 18; k++) {
    var g = despues[k], v = antes[k];
    if (g === '' || g === null || g === undefined) continue;
    g = Number(g);
    if (!(g > 0) || String(v) === String(g)) continue;
    var par = Number(c['par' + (k + 1)]) || 4;
    if (g >= par) continue;
    if (!quien) quien = quienFn();
    lista.push({ titulo: textoAviso(quien.quien, g, par),
                 cuerpo: 'Hoyo ' + (k + 1) + ' (par ' + par + ') en ' + g + ' golpe' + (g > 1 ? 's' : '') +
                         ' · ' + c.nombre + (quien.extra ? ' · ' + quien.extra : '') });
  }
  return lista;
}

function leerAvisos() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('avisos') || '[]'); }
  catch (e) { return []; }
}
function guardarAvisos(nuevos) {
  var limite = Date.now() - AVISOS_HORAS * 3600000;
  var lista = leerAvisos().filter(function (a) { return a.t > limite; }).concat(nuevos);
  PropertiesService.getScriptProperties().setProperty('avisos', JSON.stringify(lista.slice(-AVISOS_MAX)));
}

/* Lo llaman guardarGolpes y guardarGolpesEquipo. Nunca rompe el guardado. */
function publicarAvisos(lista, autor) {
  if (!lista || !lista.length) return;
  try {
    var t = Date.now();
    lista.forEach(function (a, i) { a.id = t + '-' + i + '-' + Math.floor(Math.random() * 1e6); a.t = t; });
    guardarAvisos(lista);
    var subs = leer('Suscripciones').filter(function (s) {
      return s.endpoint && String(s.matricula).trim() !== String(autor).trim();
    });
    enviarPush(subs.map(function (s) { return String(s.endpoint); }));
  } catch (e) { anotar(autor, 'push_error', String(e && e.message || e)); }
}

function avisosPublicos(p) {
  var limite = Date.now() - AVISOS_HORAS * 3600000, ep = String(p.ep || '');
  return { ok: true, avisos: leerAvisos().filter(function (a) {
    return a.t > limite && (!a.ep || a.ep === ep);
  }).map(function (a) { return { id: a.id, t: a.t, titulo: a.titulo, cuerpo: a.cuerpo }; }) };
}

function pushAlta(p) {
  var j = exigir(p.token);
  var ep = String(p.endpoint || '');
  if (!/^https:\/\//.test(ep)) return { ok: false, error: 'faltan_datos' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = hojaSuscripciones();
    var fila = buscarFila(hoja, function (v) { return String(v[0]) === ep; });
    var datos = [ep, String(j.matricula), new Date(), String(p.dispositivo || '').slice(0, 80)];
    if (fila) hoja.getRange(fila, 1, 1, 4).setValues([datos]); else hoja.appendRow(datos);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function pushBaja(p) {
  exigir(p.token);
  borrarSuscripciones([String(p.endpoint || '')]);
  return { ok: true };
}
function borrarSuscripciones(eps) {
  if (!eps.length) return;
  var hoja = hojaSuscripciones();
  if (hoja.getLastRow() < 2) return;
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (var i = datos.length - 1; i >= 0; i--) if (eps.indexOf(String(datos[i][0])) >= 0) hoja.deleteRow(i + 2);
}

/* Botón "Probar" de la app: un aviso que solo ve el celular que lo pidió. */
function pushPrueba(p) {
  var j = exigir(p.token);
  var ep = String(p.endpoint || '');
  if (!/^https:\/\//.test(ep)) return { ok: false, error: 'faltan_datos' };
  var t = Date.now();
  guardarAvisos([{ id: t + '-prueba', t: t, ep: ep, titulo: '🐦 ¡Birdie de prueba!',
                   cuerpo: 'Así te va a llegar el aviso cuando alguien haga birdie, ' + nombreAviso(j) + '.' }]);
  var r = enviarPush([ep]);
  return { ok: r.enviados > 0, enviados: r.enviados, error: r.enviados ? '' : 'push_rechazado', detalle: r.detalle };
}

function pushClave() { return { ok: true, clave: clavesVapid().pub }; }

/* Manda el push vacío a cada celular. Los que el servicio da por muertos
   (404/410: desinstalaron la app o revocaron el permiso) se borran. */
function enviarPush(eps) {
  var r = { enviados: 0, detalle: '' };
  if (!eps.length) return r;
  var claves = clavesVapid();
  var pedidos = eps.map(function (ep) {
    return { url: ep, method: 'post', muteHttpExceptions: true, payload: '',
             headers: { TTL: String(AVISOS_HORAS * 3600), Urgency: 'high',
                        Authorization: 'vapid t=' + jwtVapid(ep, claves) + ', k=' + claves.pub } };
  });
  var muertos = [];
  UrlFetchApp.fetchAll(pedidos).forEach(function (res, i) {
    var c = res.getResponseCode();
    if (c >= 200 && c < 300) r.enviados++;
    else {
      if (c === 404 || c === 410) muertos.push(eps[i]);
      r.detalle = c + ' ' + String(res.getContentText() || '').slice(0, 120);
    }
  });
  if (muertos.length) borrarSuscripciones(muertos);
  return r;
}

/* ---------- VAPID: firma ES256 (ECDSA P-256 + SHA-256) a mano ----------
   Apps Script no trae ECDSA, así que va acá con BigInt. Son ~60 líneas de
   matemática de curva elíptica; está probado contra la firma de Node. */
var EC_ = null;
function ec() {
  if (EC_) return EC_;
  var B = BigInt, p = B('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  EC_ = { p: p, a: p - B(3), n: B('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
          G: [B('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
              B('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')],
          Z: B(0), U: B(1), D: B(2), T: B(3) };
  return EC_;
}
function ecMod(a, m) { var r = a % m; return r < ec().Z ? r + m : r; }
function ecInv(a, m) {
  var C = ec(), lm = C.U, hm = C.Z, low = ecMod(a, m), high = m;
  while (low > C.U) {
    var q = high / low, nm = hm - lm * q, nw = high - low * q;
    hm = lm; high = low; lm = nm; low = nw;
  }
  return ecMod(lm, m);
}
function ecSuma(P, Q) {
  if (!P) return Q;
  if (!Q) return P;
  var C = ec(), p = C.p, l;
  if (P[0] === Q[0]) {
    if (ecMod(P[1] + Q[1], p) === C.Z) return null;
    l = ecMod((C.T * P[0] * P[0] + C.a) * ecInv(C.D * P[1], p), p);
  } else {
    l = ecMod((Q[1] - P[1]) * ecInv(Q[0] - P[0], p), p);
  }
  var x = ecMod(l * l - P[0] - Q[0], p);
  return [x, ecMod(l * (P[0] - x) - P[1], p)];
}
function ecPor(k, P) {
  var C = ec(), R = null, A = P;
  while (k > C.Z) {
    if ((k & C.U) === C.U) R = ecSuma(R, A);
    A = ecSuma(A, A);
    k = k >> C.U;
  }
  return R;
}
function bytesABig(b) {
  var h = '0x0';
  for (var i = 0; i < b.length; i++) h += ('0' + (b[i] & 255).toString(16)).slice(-2);
  return BigInt(h);
}
function bigABytes(x) {
  var h = x.toString(16);
  while (h.length < 64) h = '0' + h;
  var b = [];
  for (var i = 0; i < 64; i += 2) { var v = parseInt(h.substr(i, 2), 16); b.push(v > 127 ? v - 256 : v); }
  return b;
}
function b64u(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function sha256(b) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b); }

function clavesVapid() {
  var props = PropertiesService.getScriptProperties();
  var priv = props.getProperty('vapidPriv'), pub = props.getProperty('vapidPub');
  if (priv && pub) return { d: BigInt('0x' + priv), pub: pub };
  var C = ec(), d = C.Z;
  while (d === C.Z) {
    var azar = '';
    for (var i = 0; i < 6; i++) azar += Utilities.getUuid();
    d = ecMod(bytesABig(sha256(Utilities.newBlob(azar + Date.now() + Math.random()).getBytes())), C.n);
  }
  var Q = ecPor(d, C.G);
  pub = b64u([4].concat(bigABytes(Q[0]), bigABytes(Q[1])));
  priv = d.toString(16);
  props.setProperties({ vapidPriv: priv, vapidPub: pub });
  return { d: d, pub: pub };
}

function firmarES256(texto, d) {
  var C = ec(), msg = Utilities.newBlob(texto).getBytes();
  var e = bytesABig(sha256(msg)), db = bigABytes(d);
  for (var intento = 0; intento < 50; intento++) {
    var semilla = sha256(msg).concat(Utilities.newBlob(Utilities.getUuid() + intento).getBytes());
    var k = ecMod(bytesABig(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, semilla, db)), C.n);
    if (k === C.Z) continue;
    var r = ecMod(ecPor(k, C.G)[0], C.n);
    if (r === C.Z) continue;
    var s = ecMod(ecInv(k, C.n) * (e + r * d), C.n);
    if (s === C.Z) continue;
    return b64u(bigABytes(r).concat(bigABytes(s)));
  }
  throw new Error('no_se_pudo_firmar');
}

/* Un JWT por servicio de push (Google, Apple, Mozilla), guardado 50 minutos. */
function jwtVapid(endpoint, claves) {
  var aud = endpoint.match(/^https:\/\/[^\/]+/)[0];
  var cache = CacheService.getScriptCache(), llave = 'jwt:' + aud;
  var guardado = cache.get(llave);
  if (guardado) return guardado;
  var correo = correoOrganizador();
  var cuerpo = { aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
                 sub: correo ? 'mailto:' + correo : 'https://andr3sb3nv3.github.io/GolfTourMdq/' };
  var sinFirma = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u(JSON.stringify(cuerpo));
  var jwt = sinFirma + '.' + firmarES256(sinFirma, claves.d);
  cache.put(llave, jwt, 3000);
  return jwt;
}

/* Correr UNA vez desde el editor después de pegar esta versión: Google pide
   el permiso nuevo ("conectarse a un servicio externo", para mandar los push),
   se generan las claves y se crea la pestaña Suscripciones. No toca nada más. */
function activarAvisos() {
  var c = clavesVapid();
  hojaSuscripciones();
  try { UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true }); } catch (e) {}
  Logger.log('Avisos listos. Clave pública: ' + c.pub);
  return c.pub;
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
