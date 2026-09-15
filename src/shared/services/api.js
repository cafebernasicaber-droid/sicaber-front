// ─────────────────────────────────────────────────────────────
//  src/shared/services/api.js
//
//  Cliente HTTP centralizado para consumir la API de Sicaber.
//  Todos los servicios del frontend deben usar este módulo
//  en vez de llamar a fetch directamente.
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
// TEMPORAL — quitar una vez confirmada la URL pública. Abre la consola del
// navegador (F12) y recarga: si dice "localhost:4000", el .env no se está
// leyendo (revisa que reiniciaste `npm start`, no solo guardaste el archivo).
console.log('[api.js] BASE_URL =', BASE_URL);

// ── Helpers de token ─────────────────────────────────────────
export const getToken    = () => localStorage.getItem('sicaber_token');
export const setToken    = (t) => localStorage.setItem('sicaber_token', t);
export const removeToken = () => localStorage.removeItem('sicaber_token');

// ── Sesión expirada / token inválido ──────────────────────────
// Cuando el backend responde 401, el token guardado ya no sirve
// (expiró o nunca fue válido). Antes esto se dejaba pasar en silencio:
// el usuario seguía "logueado" en localStorage (sicaber_session) pero
// TODAS las peticiones fallaban con 401 para siempre.
// Aquí limpiamos la sesión y emitimos un evento global; AuthContext
// escucha este evento y redirige al login.
const handleUnauthorized = () => {
  // Antes: al expirar el token (8h) esto solo limpiaba la sesión y
  // redirigía silenciosamente a "/" — como "/" es el storefront público
  // (Landing), un administrador trabajando en Insumos/Fichas Técnicas
  // quedaba tirado ahí sin ninguna explicación, indistinguible de "la
  // página se rompió". Este flag deja constancia de *por qué* se cerró la
  // sesión para que Landing pueda abrir el modal de login con un mensaje
  // claro en vez de dejar al usuario adivinando.
  sessionStorage.setItem('sicaber_session_expired', '1');
  removeToken();
  localStorage.removeItem('sicaber_session');
  window.dispatchEvent(new Event('sicaber:unauthorized'));
};

// ── Mensaje de error legible desde la respuesta del backend ──────────
// Antes solo se miraba `data.error`: si el backend respondía con otra
// forma (`message`, `errors: [...]`, `errors: {campo: msg}`, un 400 de
// express-validator, o directamente sin cuerpo JSON) el frontend se
// quedaba con "Error en la solicitud" genérico — o, peor, con undefined —
// y el formulario parecía no hacer nada. Acá se cubren las formas
// habituales y, si el error viene atado a un campo, se antepone su nombre.
const mensajeDeError = (data, status) => {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    // Formas planas más comunes.
    const plano = data.error || data.message || data.msg || data.detail || data.mensaje;
    if (typeof plano === 'string' && plano.trim()) return plano.trim();

    // Colección de errores por campo: array [{ field/param/path, msg/message }]
    // o objeto { campo: "mensaje" }.
    const col = data.errors || data.errores || data.validationErrors || data.fields;
    if (Array.isArray(col) && col.length) {
      return col
        .map(e => {
          const campo = e.field || e.param || e.path || e.campo || e.name;
          const msg = e.msg || e.message || e.error || (typeof e === 'string' ? e : '');
          return campo && msg ? `${campo}: ${msg}` : (msg || campo);
        })
        .filter(Boolean)
        .join(' · ');
    }
    if (col && typeof col === 'object') {
      const partes = Object.entries(col)
        .map(([campo, msg]) => {
          const t = Array.isArray(msg) ? msg.join(', ') : (typeof msg === 'object' ? (msg.msg || msg.message) : msg);
          return t ? `${campo}: ${t}` : '';
        })
        .filter(Boolean);
      if (partes.length) return partes.join(' · ');
    }
  }
  // Sin cuerpo aprovechable: al menos deja claro que el servidor rechazó.
  return status
    ? `El servidor rechazó la solicitud (error ${status}). Revisa los datos e inténtalo de nuevo.`
    : 'No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.';
};

// ── Fetch base ───────────────────────────────────────────────
const request = async (method, path, body = null, publicRoute = false) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token && !publicRoute) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Si el token expiró o es inválido, cerramos sesión de una vez
    // en vez de dejar que cada pantalla siga pidiendo datos y
    // reciba 401 por siempre.
    if (res.status === 401 && !publicRoute) {
      handleUnauthorized();
    }
    // Propaga el mensaje de error del servidor (en todas sus formas
    // habituales, ver mensajeDeError), y cualquier dato extra que haya
    // mandado (ej. insumosAsociados en la eliminación inteligente de
    // categorías), no solo duplicateFields como antes.
    throw Object.assign(new Error(mensajeDeError(data, res.status)), {
      status: res.status,
      ...(data && typeof data === 'object' ? data : {}),
    });
  }
  return data;
};

export const get    = (path, pub)        => request('GET',    path, null, pub);
export const post   = (path, body, pub)  => request('POST',   path, body, pub);
export const put    = (path, body)       => request('PUT',    path, body);
export const patch  = (path, body)       => request('PATCH',  path, body);
export const del    = (path)             => request('DELETE', path);

// ── AUTH ─────────────────────────────────────────────────────
export const authApi = {
  // publicRoute=true en ambos: el formulario de login intenta primero
  // /auth/login y, si falla (porque quien inicia sesión es un cliente,
  // no un admin), recién intenta /auth/cliente/login. Sin este flag,
  // ese primer 401 "esperado" disparaba handleUnauthorized() y borraba
  // cualquier sesión ya guardada en el navegador (ej. un cajero logueado).
  loginAdmin:      (u, p)    => post('/auth/login',            { username: u, password: p }, true),
  loginCliente:    (c, p)    => post('/auth/cliente/login',    { correo: c,   password: p }, true),
  registroCliente: (datos)   => post('/auth/cliente/registro', datos, true),
  me:              ()        => get ('/auth/me'),
};

// ── ROLES ────────────────────────────────────────────────────
export const rolesApi = {
  getAll:   ()       => get ('/roles'),
  getById:  (id)     => get (`/roles/${id}`),
  create:   (data)   => post('/roles', data),
  update:   (id, d)  => put (`/roles/${id}`, d),
  remove:   (id)     => del (`/roles/${id}`),
  // Activa/desactiva el rol (el backend decide el estado nuevo — invierte
  // el actual). Desactivar desactiva EN CASCADA a los usuarios con ese rol;
  // la respuesta trae `usuariosDesactivados` con el conteo real. Desactivar
  // "Administrador" siempre responde 409 (mensaje ya viene armado del
  // backend, se propaga tal cual vía el throw de request()).
  toggleEstado: (id) => patch(`/roles/${id}/estado`),
};

// ── USUARIOS ─────────────────────────────────────────────────
export const usuariosApi = {
  getAll:        ()       => get ('/usuarios'),
  getById:       (id)     => get (`/usuarios/${id}`),
  create:        (data)   => post('/usuarios', data),
  update:        (id, d)  => put (`/usuarios/${id}`, d),
  remove:        (id)     => del (`/usuarios/${id}`),
  toggleEstado:  (id)     => patch(`/usuarios/${id}/estado`),
};

// ── CLIENTES ─────────────────────────────────────────────────
export const clientesApi = {
  getAll:         ()       => get ('/clientes'),
  getById:        (id)     => get (`/clientes/${id}`),
  update:         (id, d)  => put (`/clientes/${id}`, d),
  remove:         (id)     => del (`/clientes/${id}`),
  toggleEstado:   (id)     => patch(`/clientes/${id}/estado`),
  miPerfil:       ()       => get ('/clientes/mi-perfil'),
  actualizarPerfil:(data)  => put ('/clientes/mi-perfil', data),
};

// ── EMPLEADOS ────────────────────────────────────────────────
export const empleadosApi = {
  // localId opcional — el backend ya soporta filtrar por local (?local_id=)
  // para listar "los empleados de este local" sin traer todos y filtrar acá
  // (punto 2: selector de cajeros por local en Nuevo Pedido).
  getAll:  (localId)  => get (localId ? `/empleados?local_id=${localId}` : '/empleados'),
  getById: (id)     => get (`/empleados/${id}`),
  create:  (data)   => post('/empleados', data),
  update:  (id, d)  => put (`/empleados/${id}`, d),
  remove:  (id)     => del (`/empleados/${id}`),
  toggleEstado: (id)   => patch(`/empleados/${id}/estado`),
};

// ── LOCALES (puntos físicos de recogida, ej. "Local Villa Liliam") ───
// Distinto del campo `sede` de pedidos/usuarios ('Local 1'/'Local 2'/
// 'Ambos', usado para asignar personal y filtrar qué pedidos ve cada
// cajero/bartender) — esto es el catálogo real de locales que el cliente
// elige en el checkout de la Landing al pedir "Recoger en el local".
// Público (igual que categorías/productos/toppings) porque la Landing
// necesita listarlos sin depender de que el cliente ya esté autenticado.
export const localesApi = {
  // Solo activos, público — para el checkout de la Landing y cualquier
  // selector de "a qué local va este pedido" (mismo patrón que
  // productosApi.getActivos vs .getAll).
  getActivos:   ()       => get ('/locales', true),
  // Todos (activos e inactivos), protegido — para la administración de
  // locales (activar/desactivar).
  getAll:       ()       => get ('/locales/todos'),
  getById:      (id)     => get (`/locales/${id}`, true),
  create:       (data)   => post('/locales', data),
  update:       (id, d)  => put (`/locales/${id}`, d),
  remove:       (id)     => del (`/locales/${id}`),
  toggleEstado: (id)     => patch(`/locales/${id}/estado`),
};

// ── MÉTODOS DE PAGO ────────────────────────────────────────────
// El QR se sube directo a Cloudinary desde el frontend (cloudinaryService.js,
// mismo patrón que el comprobante de una compra) — acá solo se manda/lee la
// URL resultante como texto (`url_qr`). Esta tabla es solo lo que se
// MUESTRA en el checkout de la Landing; no reemplaza el enum real de
// pedidos.pago ('efectivo'/'nequi'/'transferencia').
export const metodosPagoApi = {
  // Solo activos, público — el checkout de la Landing los lista sin sesión.
  getActivos:   ()        => get ('/metodos-pago', true),
  // Todos (activos e inactivos), protegido — para la pantalla de gestión.
  getAll:       ()        => get ('/metodos-pago/todos'),
  getById:      (id)      => get (`/metodos-pago/${id}`),
  create:       (data)    => post('/metodos-pago', data),
  update:       (id, d)   => put (`/metodos-pago/${id}`, d),
  // Cambiar (o quitar, mandando null) solo el QR sin reenviar todo el form.
  updateQr:     (id, url) => patch(`/metodos-pago/${id}/qr`, { url_qr: url }),
  toggleEstado: (id)      => patch(`/metodos-pago/${id}/estado`),
};

// ── CATEGORÍAS ───────────────────────────────────────────────
export const categoriasApi = {
  getAll:       ()       => get ('/categorias', true),
  create:       (data)   => post('/categorias', data),
  update:       (id, d)  => put (`/categorias/${id}`, d),
  remove:       (id)     => del (`/categorias/${id}`),
  toggleEstado: (id)     => patch(`/categorias/${id}/estado`),
};

// ── PRODUCTOS ────────────────────────────────────────────────
export const productosApi = {
  getActivos: ()       => get ('/productos', true),
  getAll:     ()       => get ('/productos/todos'),
  getById:    (id)     => get (`/productos/${id}`, true),
  create:     (data)   => post('/productos', data),
  update:     (id, d)  => put (`/productos/${id}`, d),
  remove:     (id)     => del (`/productos/${id}`),
  toggleEstado: (id)   => patch(`/productos/${id}/estado`),
};

// ── TOPPINGS ─────────────────────────────────────────────────
export const toppingsApi = {
  getAll:  ()       => get ('/toppings', true),
  create:  (data)   => post('/toppings', data),
  update:  (id, d)  => put (`/toppings/${id}`, d),
  remove:  (id)     => del (`/toppings/${id}`),
  toggleEstado: (id)   => patch(`/toppings/${id}/estado`),
};

// ── ADICIONES ────────────────────────────────────────────────
export const adicionesApi = {
  getAll:  ()       => get ('/adiciones', true),
  create:  (data)   => post('/adiciones', data),
  update:  (id, d)  => put (`/adiciones/${id}`, d),
  remove:  (id)     => del (`/adiciones/${id}`),
  toggleEstado: (id)   => patch(`/adiciones/${id}/estado`),
};

// ── COMBOS ───────────────────────────────────────────────────
export const combosApi = {
  getActivos:    ()       => get ('/combos', true),
  getAll:        ()       => get ('/combos/todos'),
  create:        (data)   => post('/combos', data),
  update:        (id, d)  => put (`/combos/${id}`, d),
  toggleEstado:  (id)     => patch(`/combos/${id}/estado`),
  remove:        (id)     => del (`/combos/${id}`),
};

// ── CIUDADES (catálogo para el campo Ciudad de Proveedores) ──────
// Mismo patrón que categoriasInsumosApi / tiposPresentacionApi. Sin
// `remove` a propósito: una ciudad nunca se elimina, solo se desactiva
// (los proveedores que ya la tenían la siguen mostrando).
export const ciudadesApi = {
  // Nota: GET /ciudades SÍ exige token en el backend (auth en las 4 rutas
  // de ciudadesRouter) — el `true` que había acá lo marcaba como ruta
  // pública, así que request() nunca mandaba el Authorization header y la
  // llamada moría con 401 "Token requerido" para cualquier usuario
  // logueado. Encontrado al verificar el buscador de "Gestionar
  // ciudades" (Ronda 23 item 4): la lista aparecía vacía porque el
  // fetch fallaba en silencio (el catch de useCiudades la deja en []).
  getAll:       ()       => get   ('/ciudades'),
  create:       (data)   => post  ('/ciudades', data),
  update:       (id, d)  => put   (`/ciudades/${id}`, d),
  toggleEstado: (id)     => patch (`/ciudades/${id}/estado`),
};

// ── PROVEEDORES ──────────────────────────────────────────────
export const proveedoresApi = {
  getAll:        ()       => get ('/proveedores'),
  getById:       (id)     => get (`/proveedores/${id}`),
  create:        (data)   => post('/proveedores', data),
  update:        (id, d)  => put (`/proveedores/${id}`, d),
  remove:        (id)     => del (`/proveedores/${id}`),
  toggleEstado:  (id)     => patch(`/proveedores/${id}/estado`),
};

// ── INSUMOS ──────────────────────────────────────────────────
// ── INSUMOS ──────────────────────────────────────────────────
export const insumosApi = {
  getAll:  (opts = {})  => {
    const qs = new URLSearchParams();
    if (opts.local != null && opts.local !== '' && opts.local !== 'todos') qs.set('local_id', opts.local);
    const q = qs.toString();
    return get(`/insumos${q ? `?${q}` : ''}`);
  },
  getById: (id)     => get (`/insumos/${id}`),
  create:  (data)   => post('/insumos', data),
  update:  (id, d)  => put (`/insumos/${id}`, d),
  remove:  (id)     => del (`/insumos/${id}`),
  toggleEstado: (id)   => patch(`/insumos/${id}/estado`),
  // Edición de insumos POR LOCAL — endpoint ya existente en el backend, sin
  // usar desde el frontend hasta ahora. A diferencia de `update` (arriba),
  // que solo toca las columnas GLOBALES del insumo (nombre/categoría/
  // unidad/estado/descripción — PUT /insumos/:id nunca leyó nada de
  // locales), este PATCH por local no puede afectar a ningún otro local:
  // el id del local va en la URL, y el backend hace UPDATE ... WHERE
  // insumo_id=$1 AND local_id=$2 con COALESCE por campo (si no se manda
  // stockActual, por ejemplo, esa columna ni se toca).
  updateLocal: (id, localId, d) => put(`/insumos/${id}/locales/${localId}`, d),
  // GET /insumos/contadores?local_id= → { todos, activos, inactivos, stockBajo }
  // para ESE local (nunca global — el backend lo exige así). Se usa en la
  // tarjeta de "Locales" para mostrar cuántos insumos tiene cada uno.
  getContadores: (localId) => get(`/insumos/contadores?local_id=${localId}`),
};

// ── CATEGORÍAS DE INSUMOS ───────────────────────────────────────
export const categoriasInsumosApi = {
  getAll:       ()       => get   ('/categorias-insumos'),
  getById:      (id)     => get   (`/categorias-insumos/${id}`),
  create:       (data)   => post  ('/categorias-insumos', data),
  update:       (id, d)  => put   (`/categorias-insumos/${id}`, d),
  remove:       (id)     => del   (`/categorias-insumos/${id}`),
  toggleEstado: (id)     => patch (`/categorias-insumos/${id}/estado`),
  recategorizar:(id, d)  => post  (`/categorias-insumos/${id}/recategorizar`, d),
};

// ── TIPOS DE PRESENTACIÓN (Compras) ─────────────────────────────
// Antes una lista fija en el código del formulario de compra (Caja,
// Paquete, Bolsa) — ahora un catálogo gestionable, mismo patrón que
// categoriasInsumosApi de arriba. Deliberadamente sin `remove` ni
// `recategorizar`: un tipo de presentación no queda "pegado" a una
// entidad persistente como sí ocurre con la relación insumo-categoría,
// así que no necesita ese flujo — "desactivar" (toggleEstado) es
// suficiente. "Unitario" NO pasa por este servicio: sigue siendo una
// opción fija y especial del sistema, manejada aparte por el propio
// formulario de compra.
export const tiposPresentacionApi = {
  getAll:       ()       => get   ('/tipos-presentacion'),
  create:       (data)   => post  ('/tipos-presentacion', data),
  update:       (id, d)  => put   (`/tipos-presentacion/${id}`, d),
  toggleEstado: (id)     => patch (`/tipos-presentacion/${id}/estado`),
};

// ── COMPRAS ──────────────────────────────────────────────────
export const comprasApi = {
  getActivas:  ()         => get ('/compras'),
  getHistorial:()         => get ('/compras/historial'),
  getById:     (id)       => get (`/compras/${id}`),
  create:      (data)     => post('/compras', data),
  // `items` opcional: [{insumo_id, cantidad}, ...] — anula solo esos
  // insumos/cantidades (ver comentario del backend en PATCH
  // /compras/:id/anular). Sin `items`, anula todo lo pendiente de la
  // compra, igual que siempre.
  anular:      (id, mot, items) => patch(`/compras/${id}/anular`, items ? { motivo: mot, items } : { motivo: mot }),
};

// ── PEDIDOS ──────────────────────────────────────────────────
export const pedidosApi = {
  // sede opcional: si se pasa, el backend solo devuelve los pedidos de
  // ese local (usado por Cajero y Bartender). El Administrador no manda
  // sede y ve todos los pedidos, como antes.
  getAll:        (sede)       => get (sede ? `/pedidos?sede=${encodeURIComponent(sede)}` : '/pedidos'),
  getStats:      ()           => get ('/pedidos/stats'),
  getById:       (id)         => get (`/pedidos/${id}`),
  create:        (data)       => post('/pedidos', data, true),
  update:        (id, data)   => put (`/pedidos/${id}`, data),
  cambiarEstado: (id, estado) => patch(`/pedidos/${id}/estado`, { estado }),
  // Reclama un pedido de cliente sin local asignado (sede = NULL) para el
  // local del usuario logueado. Ver PATCH /pedidos/:id/tomar en el backend.
  tomar:         (id)         => patch(`/pedidos/${id}/tomar`, {}),
  remove:        (id)         => del (`/pedidos/${id}`),
  // Verificación del comprobante de pago (pedidos por Nequi/Transferencia
  // con comprobante ya adjuntado por el cliente en su checkout). Al
  // aprobar, el backend deja el pedido en 'pendiente' (pago confirmado,
  // listo para pasar a preparación); al rechazar, lo cancela. Rutas
  // corregidas: las anteriores (/aprobar-comprobante, /rechazar-comprobante)
  // no existen en el backend y devolvían 404.
  aprobarComprobante:  (id) => patch(`/pedidos/${id}/comprobante/aprobar`, {}),
  rechazarComprobante: (id) => patch(`/pedidos/${id}/comprobante/rechazar`, {}),
  // Cobro en efectivo: confirma que el cajero ya recibió el pago ANTES de
  // que el pedido pueda pasar a 'en_preparacion'. Distinto del pago por
  // transferencia (arriba, se aprueba con comprobante) y de "Cobrar" al
  // entregar (ventasApi). Antes apuntaba a /confirmar-cobro (404); la ruta
  // real del backend es /confirmar-pago.
  confirmarPago: (id) => patch(`/pedidos/${id}/confirmar-pago`, {}),
  // Domicilio: el cajero/domiciliario que ve el pedido primero lo acepta
  // (queda asignado a él vía domiciliario_id) o, si ya lo había aceptado,
  // lo libera de nuevo (vuelve a quedar disponible para otro). No es lo
  // mismo que "tomar" (arriba, asigna el pedido completo a un local) — esto
  // es "quién de los repartidores/cajeros de ESE local se hace cargo de la
  // entrega puntual".
  aceptarDomicilio:  (id) => patch(`/pedidos/${id}/aceptar-domicilio`, {}),
  rechazarDomicilio: (id) => patch(`/pedidos/${id}/rechazar-domicilio`, {}),
  // Verificación de cobertura de domicilios EN VIVO (paso 2 del checkout de
  // la Landing), sin crear el pedido — público, igual que create.
  verificarCobertura: (direccion) => post('/pedidos/verificar-cobertura', { direccion }, true),
};

// ── VENTAS ───────────────────────────────────────────────────
export const ventasApi = {
  // sede opcional: igual que pedidosApi.getAll, si se pasa el backend solo
  // devuelve las ventas de ese local (cajero) o acota la vista de admin.
  getAll:        (sede)       => get (sede ? `/ventas?sede=${encodeURIComponent(sede)}` : '/ventas'),
  getStats:      ()           => get ('/ventas/stats'),
  getById:       (id)         => get (`/ventas/${id}`),
  crearDesde:    (id_pedido)  => post('/ventas/desde-pedido', { id_pedido }),
  cambiarEstado: (id, estado) => patch(`/ventas/${id}/estado`, { estado }),
};

// ── DEVOLUCIONES ─────────────────────────────────────────────
export const devolucionesApi = {
  // sede opcional: mismo criterio que ventasApi.getAll.
  getAll:        (sede)       => get (sede ? `/devoluciones?sede=${encodeURIComponent(sede)}` : '/devoluciones'),
  create:        (data)       => post('/devoluciones', data),
  // El backend exige `motivo_rechazo` (mínimo 10 caracteres) cuando el estado
  // es 'rechazada' — ver PATCH /devoluciones/:id/estado. Antes esta función
  // solo mandaba { estado }, así que TODO rechazo de devolución moría con un
  // 400 y la devolución nunca cambiaba de estado. Al aprobar no se envía el
  // campo, igual que antes.
  cambiarEstado: (id, estado, motivoRechazo) =>
    patch(`/devoluciones/${id}/estado`, motivoRechazo
      ? { estado, motivo_rechazo: motivoRechazo }
      : { estado }),
};

// ── FICHAS TÉCNICAS ──────────────────────────────────────────
export const fichasTecnicasApi = {
  getAll:  ()       => get ('/fichas-tecnicas'),
  getById: (id)     => get (`/fichas-tecnicas/${id}`),
  create:  (data)   => post('/fichas-tecnicas', data),
  update:  (id, d)  => put (`/fichas-tecnicas/${id}`, d),
  remove:  (id)     => del (`/fichas-tecnicas/${id}`),
  toggleEstado: (id) => patch(`/fichas-tecnicas/${id}/estado`),
};

// ── DISPONIBILIDAD (pública) ──────────────────────────────────
// A diferencia de fichasTecnicasApi/insumosApi (protegidas: exponen
// costos, proveedores y recetas), esta ruta solo devuelve
// { id_producto, stock_disponible } y no requiere sesión — es la que debe
// usar cualquier pantalla de cara al cliente (Landing) para saber cuántas
// unidades de un producto se pueden vender según el inventario real.
export const disponibilidadApi = {
  getAll: () => get('/disponibilidad', true),
};

// ── RESEÑAS ──────────────────────────────────────────────────
export const resenasApi = {
  getAprobadas: ()       => get ('/resenas', true),
  getAll:       ()       => get ('/resenas/todas'),
  create:       (data)   => post('/resenas', data),
  aprobar:      (id)     => patch(`/resenas/${id}/aprobar`),
  remove:       (id)     => del (`/resenas/${id}`),
};