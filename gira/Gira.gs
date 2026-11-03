/* ==================================================================
   GIRA AMIGOLF 2026 · backend de la web de la gira
   Va pegado en la planilla "Gira Golf Mar del Plata Organización":
   Extensiones → Apps Script → pegar todo esto → guardar.

   1. Elegir "configurar" arriba y tocar Ejecutar (la primera vez pide permisos).
      Crea las pestañas que falten y completa los datos nuevos de canchas y viajes.
      Nunca borra ni pisa lo que ya está escrito.
   2. Implementar → Nueva implementación → Aplicación web.
      Ejecutar como: yo · Quién tiene acceso: cualquier usuario.
      Copiar la URL que termina en /exec y pasársela a quien mantiene la web.

   La web lee todo con esa URL y la mesa chica edita desde la web con CLAVE.
   ================================================================== */

var CLAVE = 'ESCRIBI-TU-CLAVE';   // ← poné acá la clave para editar desde la web (no la subas a GitHub)

var COLUMNAS = {"Config": ["clave", "valor"], "Canchas": ["dia", "cancha", "salida", "lineas", "juego", "green_fee", "estado", "gestiona", "nota"], "Agenda": ["fecha", "dia", "hora", "titulo", "detalle", "estado"], "Jugadores": ["nombre", "apodo", "handicap", "nota", "ago", "sep", "oct", "excluido", "equipo", "capitan"], "Viajes": ["jugador", "llega", "como", "auto"], "Pendientes": ["tarea", "detalle", "responsable", "seccion", "hecho"], "Presupuesto": ["rubro", "concepto", "detalle", "por_persona", "estado", "opcional"]};

var DATOS = {
 "Config": [
  {
   "clave": "actualizado",
   "valor": "3/11/2026"
  },
  {
   "clave": "inicio",
   "valor": "2026-11-27"
  },
  {
   "clave": "cuota",
   "valor": "75000"
  },
  {
   "clave": "alias",
   "valor": "Lsantamarina.bru"
  },
  {
   "clave": "tesorero",
   "valor": "Lucas Santamarina (Brubank)"
  },
  {
   "clave": "app",
   "valor": "https://andr3sb3nv3.github.io/GolfTourMdq/"
  }
 ],
 "Canchas": [
  {
   "dia": "Vie 27",
   "cancha": "Miramar Links",
   "salida": "13:40 · 13:50 · 14:00",
   "lineas": "3 de 4",
   "juego": "Stableford + fourball",
   "green_fee": "50000",
   "estado": "Confirmada",
   "gestiona": "Andrés",
   "nota": "Primera ronda."
  },
  {
   "dia": "Sáb 28 AM",
   "cancha": "Acantilados",
   "salida": "Mañana · a definir",
   "lineas": "",
   "juego": "Stableford + fourball",
   "green_fee": "",
   "estado": "Falta reservar",
   "gestiona": "Andrés",
   "nota": "Pedir salidas a la mañana."
  },
  {
   "dia": "Sáb 28 PM",
   "cancha": "Marayui Golf",
   "salida": "16:30 · 16:40 · 16:50 · 17:00",
   "lineas": "4 líneas de 3",
   "juego": "Scramble de a 3 · 9 hoyos",
   "green_fee": "55000",
   "estado": "Confirmada",
   "gestiona": "Andrés",
   "nota": "Cuenta solo para la Ryder. Pagamos 18: hay luz y el que quiera sigue jugando, pero no suma."
  },
  {
   "dia": "Dom 29",
   "cancha": "La Catedral",
   "salida": "13:00",
   "lineas": "3 de 4",
   "juego": "Stableford + fourball",
   "green_fee": "150000",
   "estado": "En trámite",
   "gestiona": "Andrés",
   "nota": "Mar del Plata Golf Club. Después: almuerzo y premios."
  }
 ],
 "Agenda": [
  {
   "fecha": "25",
   "dia": "Mié",
   "hora": "Todo el día",
   "titulo": "Abre la casa",
   "detalle": "Cada uno llega cuando puede.",
   "estado": ""
  },
  {
   "fecha": "26",
   "dia": "Jue",
   "hora": "Opcional",
   "titulo": "Ronda de práctica",
   "detalle": "Cancha a definir.",
   "estado": ""
  },
  {
   "fecha": "27",
   "dia": "Vie",
   "hora": "Media mañana",
   "titulo": "Todos en Mar del Plata",
   "detalle": "Último momento para llegar.",
   "estado": ""
  },
  {
   "fecha": "27",
   "dia": "Vie",
   "hora": "13:40",
   "titulo": "Ronda 1 · Miramar Links",
   "detalle": "Stableford + fourball.",
   "estado": "Confirmada"
  },
  {
   "fecha": "28",
   "dia": "Sáb",
   "hora": "Mañana",
   "titulo": "Ronda 2 · Acantilados",
   "detalle": "Stableford + fourball.",
   "estado": "Falta reservar"
  },
  {
   "fecha": "28",
   "dia": "Sáb",
   "hora": "16:30",
   "titulo": "Ronda 3 · Marayui Golf",
   "detalle": "Scramble de a 3, 9 hoyos: cuenta para la Ryder. Después, el que quiera sigue los otros 9.",
   "estado": "Confirmada"
  },
  {
   "fecha": "28",
   "dia": "Sáb",
   "hora": "Noche",
   "titulo": "Previa en la casa",
   "detalle": "Bruto, opcional.",
   "estado": ""
  },
  {
   "fecha": "29",
   "dia": "Dom",
   "hora": "13:00",
   "titulo": "Ronda 4 · La Catedral",
   "detalle": "Almuerzo y entrega de premios.",
   "estado": "En trámite"
  }
 ],
 "Jugadores": [
  {
   "nombre": "Facundo Urtubey",
   "apodo": "Chino",
   "handicap": "Sin handicap",
   "nota": "Falta sacarlo.",
   "ago": "",
   "sep": "",
   "oct": "",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Andrés Benvenuto",
   "apodo": "Benve",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "Sí",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Tobías Benítez Cruz",
   "apodo": "Toba",
   "handicap": "Activo",
   "nota": "",
   "ago": "👍",
   "sep": "✅",
   "oct": "ok",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Francisco Socas",
   "apodo": "Fran",
   "handicap": "A resolver",
   "nota": "Traspaso al Jockey.",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Sebastián Bergadá",
   "apodo": "Sebas",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Santiago Beccar Varela",
   "apodo": "Nari",
   "handicap": "A resolver",
   "nota": "Confirmar si está activo.",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Bautista Caputo",
   "apodo": "Bauti",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Lucas Santamarina",
   "apodo": "Luqui",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Matías Arizu",
   "apodo": "Mati",
   "handicap": "Activo",
   "nota": "",
   "ago": "🆗",
   "sep": "🆗",
   "oct": "",
   "excluido": "",
   "equipo": "",
   "capitan": "Sí"
  },
  {
   "nombre": "Joaquín Viboud",
   "apodo": "Vibu",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "✅",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Ignacio Paz",
   "apodo": "Ini",
   "handicap": "Activo",
   "nota": "",
   "ago": "✅",
   "sep": "✅",
   "oct": "",
   "excluido": "",
   "equipo": "",
   "capitan": ""
  },
  {
   "nombre": "Mateo Gazzera",
   "apodo": "Mate",
   "handicap": "Activo",
   "nota": "",
   "ago": "⛳",
   "sep": "⛳",
   "oct": "",
   "excluido": "",
   "equipo": "",
   "capitan": "Sí"
  }
 ],
 "Viajes": [
  {
   "jugador": "Andrés Benvenuto",
   "llega": "Mié 25",
   "como": "Maneja y sale primero. Abre la casa.",
   "auto": "Auto de Benve"
  },
  {
   "jugador": "Ignacio Paz",
   "llega": "Mié 25",
   "como": "Va con Benve.",
   "auto": "Auto de Benve"
  },
  {
   "jugador": "Sebastián Bergadá",
   "llega": "Mié 25",
   "como": "",
   "auto": "Auto de Benve"
  },
  {
   "jugador": "Tobías Benítez Cruz",
   "llega": "Jue 26 o vie temprano",
   "como": "Desde Córdoba. Lucas le lleva los palos.",
   "auto": ""
  }
 ],
 "Pendientes": [
  {
   "tarea": "Pagar la 3ª cuota",
   "detalle": "Venció el 31/10.",
   "responsable": "Cada uno",
   "seccion": "pagos",
   "hecho": ""
  },
  {
   "tarea": "Reservar Acantilados",
   "detalle": "Sábado a la mañana.",
   "responsable": "Andrés",
   "seccion": "reservas",
   "hecho": ""
  },
  {
   "tarea": "Confirmar La Catedral",
   "detalle": "Domingo 13:00. Pasar matrículas y pagar.",
   "responsable": "Andrés",
   "seccion": "reservas",
   "hecho": ""
  },
  {
   "tarea": "Juntada en Green: draft",
   "detalle": "Fecha a confirmar.",
   "responsable": "Lucas · Mateo · Mati",
   "seccion": "formato",
   "hecho": ""
  },
  {
   "tarea": "Handicap de todos",
   "detalle": "Chino, Fran y Nari.",
   "responsable": "Ellos",
   "seccion": "jugadores",
   "hecho": ""
  },
  {
   "tarea": "Armar los autos",
   "detalle": "El que maneja avisa lugares.",
   "responsable": "Todos",
   "seccion": "autos",
   "hecho": ""
  },
  {
   "tarea": "Chombas y premios",
   "detalle": "Juntar talles.",
   "responsable": "Lucas · Mateo",
   "seccion": "merch",
   "hecho": ""
  },
  {
   "tarea": "App en Stableford",
   "detalle": "",
   "responsable": "Andrés",
   "seccion": "formato",
   "hecho": ""
  },
  {
   "tarea": "Miramar confirmado",
   "detalle": "Vie 27, 13:40 a 14:00.",
   "responsable": "Andrés",
   "seccion": "reservas",
   "hecho": "Sí"
  },
  {
   "tarea": "Marayui confirmado",
   "detalle": "Sáb 28, 16:30 a 17:00, 4 líneas.",
   "responsable": "Andrés",
   "seccion": "reservas",
   "hecho": "Sí"
  }
 ],
 "Presupuesto": [
  {
   "rubro": "Viaje",
   "concepto": "Nafta",
   "detalle": "Autos de a 4 (3 autos). Unos 1.000 km por auto entre ida, vuelta y traslados a las canchas: ~105 litros a $1.800. Toba viene de Córdoba: su viaje va aparte.",
   "por_persona": "47250",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Viaje",
   "concepto": "Peajes",
   "detalle": "Ruta 2 ida y vuelta: ~$35.000 por auto, dividido 4.",
   "por_persona": "8750",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Comidas afuera",
   "concepto": "Almuerzo del sábado en Marayui",
   "detalle": "Clubhouse, antes de salir. Con bebida.",
   "por_persona": "35000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Comidas afuera",
   "concepto": "Almuerzo del domingo en La Catedral",
   "detalle": "Después de la ronda, con la entrega de premios.",
   "por_persona": "40000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Casa y súper",
   "concepto": "Asado del viernes",
   "detalle": "Carne, achuras, pan y ensalada para 12.",
   "por_persona": "16000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Casa y súper",
   "concepto": "Previa del sábado",
   "detalle": "Picada y algo para comer en la casa.",
   "por_persona": "12000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Casa y súper",
   "concepto": "Desayunos y almuerzo del viernes",
   "detalle": "Desayunos de vie, sáb y dom, y algo liviano antes de Miramar.",
   "por_persona": "12000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Casa y súper",
   "concepto": "Bebidas",
   "detalle": "Cerveza, vino, fernet, gaseosas y agua para todo el fin de semana.",
   "por_persona": "30000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Casa y súper",
   "concepto": "Carbón, hielo y descartables",
   "detalle": "Más bolsas, servilletas y lo que falte en la casa.",
   "por_persona": "5000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Merch y premios",
   "concepto": "Chomba del equipo",
   "detalle": "Del color del equipo, con apellido. Green Golf.",
   "por_persona": "45000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Merch y premios",
   "concepto": "Premios",
   "detalle": "Campeón Stableford y equipo ganador de la Ryder.",
   "por_persona": "10000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Imprevistos",
   "concepto": "Varios",
   "detalle": "Pelotas perdidas, café en las canchas y propinas.",
   "por_persona": "15000",
   "estado": "Estimado",
   "opcional": ""
  },
  {
   "rubro": "Aparte",
   "concepto": "Salida a Bruto",
   "detalle": "Sábado a la noche: entrada y tragos. Opcional.",
   "por_persona": "40000",
   "estado": "Estimado",
   "opcional": "Sí"
  },
  {
   "rubro": "Aparte",
   "concepto": "Llegar antes (mié o jue)",
   "detalle": "Comida extra en la casa, por día.",
   "por_persona": "15000",
   "estado": "Estimado",
   "opcional": "Sí"
  },
  {
   "rubro": "Aparte",
   "concepto": "Ronda de práctica del jueves",
   "detalle": "Green fee aparte, según la cancha.",
   "por_persona": "",
   "estado": "A definir",
   "opcional": "Sí"
  }
 ]
};

var LISTAS = {
  'Canchas.estado': ['Confirmada', 'En trámite', 'Falta reservar'],
  'Agenda.estado': ['', 'Confirmada', 'En trámite', 'Falta reservar'],
  'Jugadores.handicap': ['Activo', 'A resolver', 'Sin handicap'],
  'Jugadores.ago': ['', '✅', 'ok'], 'Jugadores.sep': ['', '✅', 'ok'], 'Jugadores.oct': ['', '✅', 'ok'],
  'Jugadores.excluido': ['', 'Sí'], 'Jugadores.capitan': ['', 'Sí'], 'Jugadores.equipo': ['', 'USA', 'Europe'],
  'Pendientes.hecho': ['', 'Sí'],
  'Presupuesto.estado': ['Estimado', 'Confirmado', 'A definir'], 'Presupuesto.opcional': ['', 'Sí']
};

/* Primera ejecución: crea las pestañas que falten. Se puede correr las veces que haga falta. */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hecho = [];
  ayuda_(ss);
  Object.keys(COLUMNAS).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja && hoja.getLastRow() > 0) { hecho.push(nombre + ': ya existía, no se tocó'); return; }
    if (!hoja) hoja = ss.insertSheet(nombre);
    var cols = COLUMNAS[nombre];
    var filas = [cols].concat(DATOS[nombre].map(function (o) { return cols.map(function (c) { return o[c] == null ? '' : String(o[c]); }); }));
    hoja.getRange(1, 1, 300, cols.length).setNumberFormat('@');
    hoja.getRange(1, 1, filas.length, cols.length).setValues(filas);
    hoja.getRange(1, 1, 1, cols.length).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0A2240');
    hoja.setFrozenRows(1);
    cols.forEach(function (c, i) {
      var lista = LISTAS[nombre + '.' + c];
      if (lista) hoja.getRange(2, i + 1, 299, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(lista, true).setAllowInvalid(true).build());
    });
    hoja.autoResizeColumns(1, cols.length);
    hecho.push(nombre + ': creada con ' + DATOS[nombre].length + ' filas');
  });
  hecho = hecho.concat(completar_(ss, 'Canchas', 'cancha'), completar_(ss, 'Viajes', 'jugador'));
  var vacia = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (vacia && vacia.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(vacia);
  Logger.log(hecho.join('\n'));
  return hecho;
}

/* Completa celdas vacías con los datos de este archivo y agrega las filas que falten.
   Busca cada fila por la columna "clave" (ej. el nombre de la cancha). No pisa nada escrito. */
function completar_(ss, nombre, clave) {
  var hoja = ss.getSheetByName(nombre), log = [];
  if (!hoja || hoja.getLastRow() < 1) return log;
  var v = hoja.getDataRange().getDisplayValues();
  var cab = v[0].map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, '_'); });
  var ik = cab.indexOf(clave);
  if (ik < 0) return log;
  DATOS[nombre].forEach(function (o) {
    var i = -1;
    for (var r = 1; r < v.length; r++) if (String(v[r][ik]).trim() === o[clave]) { i = r; break; }
    if (i < 0) {
      var fila = hoja.getLastRow() + 1;
      cab.forEach(function (h, j) { if (h && o[h]) hoja.getRange(fila, j + 1).setNumberFormat('@').setValue(String(o[h])); });
      v.push(cab.map(function (h) { return o[h] || ''; }));
      log.push(nombre + ': agregado ' + o[clave]);
      return;
    }
    cab.forEach(function (h, j) {
      if (h && o[h] && String(v[i][j]).trim() === '') { hoja.getRange(i + 1, j + 1).setNumberFormat('@').setValue(String(o[h])); v[i][j] = o[h]; log.push(nombre + ': ' + o[clave] + ' → ' + h); }
    });
  });
  return log;
}

function ayuda_(ss) {
  if (ss.getSheetByName('Cómo usar')) return;
  var h = ss.insertSheet('Cómo usar', 0);
  var t = [
    ['Planilla de la Gira Amigolf 2026. La web lee estas pestañas y la mesa chica las edita desde la web.', ''],
    ['', ''],
    ['• No cambiar los nombres de las pestañas ni de la fila 1.', ''],
    ['• Se puede editar acá o desde la web (modo edición, con la clave).', ''],
    ['', ''],
    ['Pestaña', 'Qué va'],
    ['Config', 'Datos generales: alias, tesorero, cuota, fecha de inicio.'],
    ['Canchas', 'Una fila por cancha. estado: Confirmada / En trámite / Falta reservar. green_fee: solo números.'],
    ['Agenda', 'Una fila por actividad. fecha: número del día. estado opcional.'],
    ['Jugadores', 'handicap: Activo / A resolver / Sin handicap. ago, sep, oct: ✅ pagó · ok = avisó · vacío = no pagó.'],
    ['Viajes', 'jugador (igual que en Jugadores), llega, como, auto.'],
    ['Pendientes', 'hecho: Sí cuando se cumple.'],
    ['Presupuesto', 'Gastos por persona. por_persona: solo números. opcional: Sí si no suma (va aparte). Los green fees salen de Canchas.']
  ];
  h.getRange(1, 1, t.length, 2).setValues(t);
  h.getRange(1, 1).setFontWeight('bold');
  h.getRange(6, 1, 1, 2).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0A2240');
  h.setColumnWidth(1, 130); h.setColumnWidth(2, 640);
}

/* ---------------- lectura ---------------- */
function leerTodo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = {};
  Object.keys(COLUMNAS).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    out[nombre] = [];
    if (!hoja || hoja.getLastRow() < 2) return;
    var v = hoja.getDataRange().getDisplayValues();
    var cab = v[0].map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, '_'); });
    for (var i = 1; i < v.length; i++) {
      if (!v[i].some(function (x) { return String(x).trim() !== ''; })) continue;
      var o = { _fila: i + 1 };
      cab.forEach(function (h, j) { if (h) o[h] = String(v[i][j]).trim(); });
      out[nombre].push(o);
    }
  });
  return out;
}

function doGet() {
  return json_({ ok: true, datos: leerTodo_() });
}

/* ---------------- escritura ----------------
   POST (text/plain) {clave, cambios:[{pestana, fila, control, datos} | {pestana, nueva:true, datos} | {pestana, fila, control, borrar:true}]}
   "control" es el valor de la primera columna que vio la web: si no coincide, alguien movió filas y se rechaza. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    var valida = CLAVE && CLAVE !== 'ESCRIBI-TU-CLAVE' && CLAVE.length >= 4;
    if (b.accion === 'probar') return json_({ ok: valida && b.clave === CLAVE });
    var conClave = valida && b.clave === CLAVE;
    var cambios = b.cambios || [];
    // Sin clave, cualquiera del grupo puede tachar pendientes y cargar su viaje/auto.
    if (!conClave && (!cambios.length || !cambios.every(publico_))) return json_({ ok: false, error: 'clave' });
    lock.waitLock(15000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!conClave) validarPublico_(ss, cambios);
    var borrar = [];
    cambios.forEach(function (c) {
      var cols = COLUMNAS[c.pestana];
      if (!cols) throw new Error('pestaña desconocida: ' + c.pestana);
      var hoja = ss.getSheetByName(c.pestana);
      if (!hoja) throw new Error('falta la pestaña ' + c.pestana + ': correr configurar');
      var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0]
        .map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, '_'); });
      if (c.nueva) {
        var fila = hoja.getLastRow() + 1;
        escribir_(hoja, fila, cab, c.datos || {});
        return;
      }
      var actual = String(hoja.getRange(c.fila, 1).getDisplayValue()).trim();
      if (actual !== String(c.control || '').trim()) throw new Error('la_planilla_cambio');
      if (c.borrar) borrar.push([hoja, c.fila]);
      else escribir_(hoja, c.fila, cab, c.datos || {});
    });
    borrar.sort(function (a, b2) { return b2[1] - a[1]; }).forEach(function (x) { x[0].deleteRow(x[1]); });
    sello_(ss);
    SpreadsheetApp.flush();
    return json_({ ok: true, datos: leerTodo_() });
  } catch (err) {
    var m = String(err && err.message || err);
    return json_({ ok: false, error: m === 'la_planilla_cambio' ? m : 'error_servidor', detalle: m });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* Cambios permitidos sin clave: tachar un pendiente y cargar o editar un viaje. */
function publico_(c) {
  if (!c || c.borrar) return false;
  var campos = Object.keys(c.datos || {});
  var solo = function (permitidos) { return campos.length && campos.every(function (k) { return permitidos.indexOf(k) >= 0; }); };
  if (c.pestana === 'Pendientes') return !c.nueva && solo(['hecho']) && ['', 'Sí'].indexOf(String(c.datos.hecho)) >= 0;
  if (c.pestana === 'Viajes') return solo(['jugador', 'llega', 'como', 'auto']) && campos.every(function (k) { return String(c.datos[k] || '').length <= 200; });
  return false;
}
function validarPublico_(ss, cambios) {
  var todo = leerTodo_();
  var nombres = todo.Jugadores.map(function (j) { return j.nombre; });
  var viajes = todo.Viajes.map(function (v) { return v.jugador; });
  cambios.forEach(function (c) {
    if (c.pestana !== 'Viajes') return;
    var j = c.datos.jugador;
    if (j != null && nombres.indexOf(j) < 0) throw new Error('jugador desconocido: ' + j);
    if (c.nueva && (!j || viajes.indexOf(j) >= 0)) throw new Error('la_planilla_cambio');
  });
}

function escribir_(hoja, fila, cab, datos) {
  cab.forEach(function (h, j) {
    if (!h || !(h in datos)) return;
    var celda = hoja.getRange(fila, j + 1);
    celda.setNumberFormat('@');
    celda.setValue(String(datos[h] == null ? '' : datos[h]));
  });
}

function sello_(ss) {
  var hoja = ss.getSheetByName('Config');
  if (!hoja) return;
  var v = hoja.getDataRange().getDisplayValues();
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'd/M/yyyy HH:mm');
  for (var i = 1; i < v.length; i++) if (v[i][0] === 'actualizado') { hoja.getRange(i + 1, 2).setNumberFormat('@').setValue(hoy); return; }
  hoja.appendRow(['actualizado', hoy]);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
