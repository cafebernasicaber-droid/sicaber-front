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
    // 403 = sesión válida pero SIN permiso para esta acción. A diferencia
    // del 401, NO se cierra la sesión. El backend ya bloquea de verdad
    // (permitirRoles / requierePermiso); aquí solo damos la señal para que
    // un aviso global lo comunique — antes cada pantalla lo manejaba a su
    // manera (o lo tragaba en silencio en un `.catch(() => setX([]))`).
    // Esto es PRESENTACIÓN, no seguridad: no duplica la lógica de permisos.
    const mensaje403 = data.error || 'No tienes permiso para realizar esta acción.';
    if (res.status === 403) {
      try {
        window.dispatchEvent(new CustomEvent('sicaber:forbidden', { detail: { message: mensaje403 } }));
      } catch { /* entorno sin window (SSR/tests) — el throw de abajo sigue informando */ }
    }
    // Propaga el mensaje de error del servidor, y cualquier dato extra que
    // haya mandado (ej. insumosAsociados en la eliminación inteligente de
    // categorías), no solo duplicateFields como antes.
    throw Object.assign(new Error(res.status === 403 ? mensaje403 : (data.error || 'Error en la solicitud')), {
      status: res.status,
      forbidden: res.status === 403,
      ...data,
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
  getAll:  ()       => get ('/empleados'),
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

// ── PROVEEDORES ──────────────────────────────────────────────
export const proveedoresApi = {
  getAll:        ()       => get ('/proveedores'),
  getById:       (id)     => get (`/proveedores/${id}`),
  create:        (data)   => post('/proveedores', data),
  update:        (id, d)  => put (`/proveedores/${id}`, d),
  remove:        (id)     => del (`/proveedores/${id}`),
  toggleEstado:  (id)     => patch(`/proveedores/${id}/estado`),
};

// ── CIUDADES (Proveedores) ───────────────────────────────────
// El campo "Ciudad" del formulario de Proveedores estaba fijo en
// "Medellín" — ahora es un catálogo gestionable, mismo patrón exacto que
// tiposPresentacionApi de arriba: sin `remove`, solo `toggleEstado`
// (desactivar). A diferencia de tipos_presentacion (con "Unitario" como
// excepción fija), acá NINGUNA ciudad tiene trato especial — ni siquiera
// Medellín, que solo es la primera de la siembra inicial.
export const ciudadesApi = {
  getAll:       ()       => get   ('/ciudades'),
  create:       (data)   => post  ('/ciudades', data),
  update:       (id, d)  => put   (`/ciudades/${id}`, d),
  toggleEstado: (id)     => patch (`/ciudades/${id}/estado`),
};

// ── INSUMOS ──────────────────────────────────────────────────
export const insumosApi = {
  getAll:  ()       => get ('/insumos'),
  getById: (id)     => get (`/insumos/${id}`),
  create:  (data)   => post('/insumos', data),
  update:  (id, d)  => put (`/insumos/${id}`, d),
  remove:  (id)     => del (`/insumos/${id}`),
  toggleEstado: (id)   => patch(`/insumos/${id}/estado`),
};

// ── CATEGORÍAS DE INSUMOS ───────────────────────────────────────
// Sin `remove` ni `recategorizar`: una categoría de insumo es solo una
// etiqueta para organizar/filtrar (insumos.categoria_id tiene ON DELETE
// SET NULL) — mismo patrón simple que ciudadesApi/tiposPresentacionApi.
// Nunca se elimina, solo se desactiva.
export const categoriasInsumosApi = {
  getAll:       ()       => get   ('/categorias-insumos'),
  getById:      (id)     => get   (`/categorias-insumos/${id}`),
  create:       (data)   => post  ('/categorias-insumos', data),
  update:       (id, d)  => put   (`/categorias-insumos/${id}`, d),
  toggleEstado: (id)     => patch (`/categorias-insumos/${id}/estado`),
};

// ── TIPOS DE PRESENTACIÓN (Compras) ─────────────────────────────
// Antes una lista fija en el código del formulario de compra (Caja,
// Paquete, Bolsa) — ahora un catálogo gestionable, mismo patrón simple
// que categoriasInsumosApi/ciudadesApi de arriba: agregar, editar,
// desactivar. "Unitario" NO pasa por este servicio: sigue siendo una
// opción fija y especial del sistema, manejada aparte por el propio
// formulario de compra.
export const tiposPresentacionApi = {
  getAll:       ()       => get   ('/tipos-presentacion'),
  create:       (data)   => post  ('/tipos-presentacion', data),
  update:       (id, d)  => put   (`/tipos-presentacion/${id}`, d),
  toggleEstado: (id)     => patch (`/tipos-presentacion/${id}/estado`),
};

// ── COMPRAS ──────────────────────────────────────────────────
// getActivas / getHistorial aceptan un localId opcional → el backend
// (GET /compras?local_id= y GET /compras/historial?local_id=) filtra las
// compras por local. Sin el argumento (o vacío / 'todos') devuelve todas,
// igual que antes.
const conLocal = (path, localId) =>
  (localId && localId !== 'todos') ? `${path}${path.includes('?') ? '&' : '?'}local_id=${encodeURIComponent(localId)}` : path;
export const comprasApi = {
  getActivas:  (localId)  => get (conLocal('/compras', localId)),
  getHistorial:(localId)  => get (conLocal('/compras/historial', localId)),
  getById:     (id)       => get (`/compras/${id}`),
  create:      (data)     => post('/compras', data),
  anular:      (id, mot)  => patch(`/compras/${id}/anular`, { motivo: mot }),
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
  aprobarComprobante:  (id) => patch(`/pedidos/${id}/comprobante/aprobar`, {}),
  rechazarComprobante: (id, motivo) => patch(`/pedidos/${id}/comprobante/rechazar`, { motivo }),
  confirmarPago: (id) => patch(`/pedidos/${id}/confirmar-pago`, {}),
  aceptarDomicilio:  (id) => patch(`/pedidos/${id}/aceptar-domicilio`, {}),
  rechazarDomicilio: (id) => patch(`/pedidos/${id}/rechazar-domicilio`, {}),
};

// ── VENTAS ───────────────────────────────────────────────────
export const ventasApi = {
  getAll:        (sede)       => get (sede ? `/ventas?sede=${encodeURIComponent(sede)}` : '/ventas'),
  getStats:      ()           => get ('/ventas/stats'),
  getById:       (id)         => get (`/ventas/${id}`),
  crearDesde:    (id_pedido)  => post('/ventas/desde-pedido', { id_pedido }),
  cambiarEstado: (id, estado) => patch(`/ventas/${id}/estado`, { estado }),
};

// ── DEVOLUCIONES ─────────────────────────────────────────────
export const devolucionesApi = {
  getAll:        (sede)       => get (sede ? `/devoluciones?sede=${encodeURIComponent(sede)}` : '/devoluciones'),
  create:        (data)       => post('/devoluciones', data),
  cambiarEstado: (id, estado, motivoRechazo) => patch(`/devoluciones/${id}/estado`, { estado, motivo_rechazo: motivoRechazo || null }),
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