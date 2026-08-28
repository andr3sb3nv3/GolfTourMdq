# Golf Tour Mdq — PWA

App de resultados del viaje de golf a Mar del Plata. Se instala en el celular,
funciona sin señal y guarda todo en una planilla de Google.

- **Frente:** HTML/CSS/JS sin dependencias, servido como sitio estático.
- **Fondo:** Google Apps Script pegado a la planilla `Golf Tour Mdq — Base de datos`.
- **Sesión:** matrícula + contraseña. La contraseña se guarda hasheada (SHA-256 + salt), nunca en texto plano.
- **Sin señal:** los golpes se guardan en el celular y se suben solos cuando vuelve la conexión.

## Puesta en marcha

### 1. El backend (una sola vez, ~5 minutos)

1. Abrir la planilla **Golf Tour Mdq — Base de datos** (carpeta `Golf Tour Mdq` del Drive).
2. **Extensiones → Apps Script**.
3. Borrar lo que haya y pegar todo `Codigo.gs`. Guardar.
4. Elegir la función `configurar` y **Ejecutar**. Google va a pedir autorización: aceptar.
   Eso crea las pestañas `Config`, `Jugadores`, `Canchas`, `Tarjetas` y `Log`, y carga
   las tres canchas en el orden de juego.
5. **Implementar → Nueva implementación → Aplicación web**
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier usuario**
6. Copiar la URL que termina en `/exec`.

La clave del viaje arranca en `MDQ2026` y se cambia en la pestaña `Config`.
Es la que hay que pasarle a los 12 para que puedan darse de alta.

### 2. El frente

1. Pegar la URL del paso 6 en `config.js`:
   ```js
   window.GTM_CONFIG = { api: 'https://script.google.com/macros/s/AKfy.../exec' };
   ```
2. Subir esta carpeta a cualquier hosting con HTTPS. Dos opciones:
   - **GitHub Pages:** repo nuevo → subir los archivos → Settings → Pages →
     *Deploy from a branch* → `main` / `root`.
   - **Netlify Drop:** arrastrar la carpeta a `app.netlify.com/drop`.
3. Abrir el link en el celular y elegir **Agregar a pantalla de inicio** / **Instalar**.

### 3. El primer usuario es el organizador

El primero que se registra queda como `admin` automáticamente. Registrate vos
primero. Después, cada jugador entra con **Primera vez**, pone su matrícula, elige
su contraseña, su nombre y su handicap, y queda dado de alta en la planilla.

## Quién puede qué

| | Su perfil | Su tarjeta | Perfil ajeno | Tarjeta ajena | Canchas y equipos |
|---|---|---|---|---|---|
| Jugador | sí | sí | no | no | no |
| Organizador | sí | sí | **no** | **no** | sí |

Nadie edita los datos de otro, el organizador tampoco. Si hace falta un segundo
organizador, se cambia a mano la columna `rol` en la pestaña `Jugadores`.

## Estructura de la planilla

- `Config` — nombre del torneo, sede, nombres de los equipos, clave del viaje, salt.
- `Jugadores` — matrícula, nombre, apodo, handicap, equipo, rol, club, fotoId, hash, alta, último acceso.
- `Canchas` — una fila por cancha con `par1..par18` y `si1..si18`.
- `Tarjetas` — una fila por cancha y jugador con `h1..h18`.
- `Log` — quién hizo qué y cuándo.

## Archivos

| Archivo | Qué es |
|---|---|
| `Codigo.gs` | Backend de Apps Script. No se sube al hosting: va en la planilla. |
| `index.html` | Caparazón de la app. |
| `app.css` | Estilos: fondo blanco, números negros, colores de equipo. |
| `app.js` | Toda la app: cálculo, vistas, sesión y cola offline. |
| `config.js` | La URL del backend. Es lo único que hay que editar. |
| `sw.js` | Service worker: cachea la app para que abra sin señal. |
| `manifest.webmanifest` | Hace que se pueda instalar. |
| `icono-*.png` | Íconos de la app. |

## Cuidados

- La cuota de Apps Script en cuentas gratuitas es de ~90 minutos de ejecución por día.
  Por eso el estado se cachea 15 segundos del lado del servidor y la app consulta
  cada 20 segundos solo cuando está abierta y visible.
- Las contraseñas nunca viajan ni se guardan en claro, pero esto es seguridad de
  club de golf: alcanza para que nadie te toque la tarjeta, no para datos sensibles.
- No compartas la pestaña `Jugadores` publicándola en la web: ahí viven los hashes.
