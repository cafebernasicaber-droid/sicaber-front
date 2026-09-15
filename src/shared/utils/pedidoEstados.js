// ─────────────────────────────────────────────────────────────
//  Flujo de estados de un pedido — fuente de verdad en el FRONTEND
//
//  Secuencia NUEVA (4 estados visibles para el cliente, iguales para
//  domicilio y para "recoger en el local"):
//
//     Pendiente → En proceso → En camino → Entregado
//
//  + 'pendiente_verificacion' como PASO PREVIO a 'pendiente', solo para
//    pagos con comprobante (Nequi / Llave Bancolombia): mientras el cajero
//    no aprueba el comprobante, el pedido está "Verificando pago".
//  + 'cancelado' / 'anulado' como únicas salidas fuera de la secuencia.
//
//  Cambio respecto a la versión anterior: se ELIMINÓ 'listo'. El estado
//  "preparado / listo para entregar" ahora es 'en_camino', que se muestra
//  con una etiqueta distinta según el tipo de entrega:
//     - domicilio  → "En camino"
//     - local      → "Listo para recoger"
//
//  `normalizarEstadoPedido` mapea los valores legados ('en_preparacion',
//  'listo') a los canónicos, para que un pedido viejo guardado en la BD con
//  'listo' se siga mostrando bien mientras el backend migra su lado.
// ─────────────────────────────────────────────────────────────

// Secuencia oficial del avance de un pedido. 'cancelado' NO vive aquí.
export const SECUENCIA_ESTADOS_PEDIDO = [
  'pendiente_verificacion', 'pendiente', 'en_proceso', 'en_camino', 'entregado',
];

// Estados desde los que NO se acepta ningún cambio de estado.
export const ESTADOS_PEDIDO_TERMINALES = ['entregado', 'cancelado', 'anulado'];

export const MENSAJE_NO_RETROCEDER = 'No se puede retroceder el estado de un pedido.';

// Valores legados → canónicos:
//   'en_preparacion' (front viejo) → 'en_proceso'
//   'listo'          (secuencia vieja) → 'en_camino'
export const normalizarEstadoPedido = (estado) => {
  if (estado === 'en_preparacion') return 'en_proceso';
  if (estado === 'listo') return 'en_camino';
  return estado;
};

export const esEstadoPedidoTerminal = (estado) =>
  ESTADOS_PEDIDO_TERMINALES.includes(normalizarEstadoPedido(estado));

// Punto 3 del pedido del usuario (editar pedido): "Editar pedido" (agregar
// o quitar productos) solo debe ofrecerse MIENTRAS el pedido no ha llegado
// a "Listo para recoger" (en_camino) — una vez ahí, el bartender ya lo dio
// por terminado y cambiar el carrito no tendría ningún efecto en la
// preparación real. Se compara por ÍNDICE en la secuencia oficial (no con
// una lista de estados "permitidos" a mano) para que, si la secuencia
// cambia algún día, esta regla se actualice sola. 'cancelado'/'anulado' no
// viven en la secuencia (índice -1) — un pedido cancelado tampoco se debe
// poder "editar", así que se excluye aparte.
export const puedeEditarProductosPedido = (estado) => {
  const e = normalizarEstadoPedido(estado);
  if (e === 'cancelado' || e === 'anulado') return false;
  const idx = SECUENCIA_ESTADOS_PEDIDO.indexOf(e);
  const idxListo = SECUENCIA_ESTADOS_PEDIDO.indexOf('en_camino');
  return idx !== -1 && idx < idxListo;
};

// Etiqueta visible de un estado. Para 'en_camino' depende del tipo de
// entrega ('domicilio' → "En camino"; cualquier otra cosa → "Listo para
// recoger"). El resto de estados no dependen del tipo.
const ETIQUETAS_BASE = {
  pendiente_verificacion: 'Verificando pago',
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  anulado: 'Anulado',
};
export const etiquetaEstadoPedido = (estado, tipo) => {
  const e = normalizarEstadoPedido(estado);
  if (e === 'en_camino') return tipo === 'domicilio' ? 'En camino' : 'Listo para recoger';
  return ETIQUETAS_BASE[e] || estado;
};

// Filtra `opciones` dejando solo el estado ACTUAL y los POSTERIORES de
// `secuencia` (nunca los anteriores). Un estado terminal ('entregado',
// 'cancelado', 'anulado') devuelve [] — el selector queda sin opciones y
// debe deshabilitarse. Los estados que no estén en `secuencia` se
// descartan (evita ofrecer un valor que el backend rechazaría).
export const filtrarEstadosPedidoDisponibles = (
  estadoActual,
  opciones,
  { secuencia = SECUENCIA_ESTADOS_PEDIDO } = {},
) => {
  if (esEstadoPedidoTerminal(estadoActual)) return [];
  const idxActual = secuencia.indexOf(normalizarEstadoPedido(estadoActual));
  return (opciones || []).filter((s) => {
    const idx = secuencia.indexOf(normalizarEstadoPedido(s));
    if (idx === -1) return false;
    if (idxActual === -1) return true; // estado actual desconocido: no se puede comparar
    return idx >= idxActual;
  });
};

// ¿Sería un retroceso? 'cancelado' nunca cuenta como retroceso.
export const esRetrocesoEstadoPedido = (
  estadoActual,
  estadoNuevo,
  secuencia = SECUENCIA_ESTADOS_PEDIDO,
) => {
  if (estadoNuevo === 'cancelado') return false;
  const a = secuencia.indexOf(normalizarEstadoPedido(estadoActual));
  const b = secuencia.indexOf(normalizarEstadoPedido(estadoNuevo));
  return a !== -1 && b !== -1 && b < a;
};

// Mensaje amigable a partir del error que devuelve el backend (que dice
// literalmente «No se puede retroceder de "x" a "y"»).
export const mensajeErrorEstadoPedido = (err, fallback = 'No se pudo cambiar el estado del pedido.') => {
  const raw = (err && err.message) || '';
  if (/retroceder/i.test(raw)) return MENSAJE_NO_RETROCEDER;
  return raw || fallback;
};

// ─────────────────────────────────────────────────────────────
//  Colores y etiquetas de estado — FUENTE ÚNICA para todas las vistas
//
//  Antes cada vista tenía su propia tabla: ESTADO_CONFIG en
//  features/pedidos/data/datos.js (Admin) y STATUS_CFG dentro de
//  CajeroPage.jsx. Las dos se fueron separando y el MISMO estado terminaba
//  pintado distinto según quién mirara:
//
//    estado       Admin                  Cajero
//    ─────────────────────────────────────────────────────
//    entregado    #388E3C (verde)        #7E57C2 (morado)
//    pendiente    #F57F17               #FFB300
//    en_proceso   #1565C0               #42A5F5
//    cancelado    #B71C1C               #EF5350
//    anulado      existía                NO EXISTÍA  ← bug
//
//  El último era el peor: el cajero hacía STATUS_CFG[order.estado] sin
//  normalizar y con respaldo a 'pendiente', así que un pedido ANULADO se le
//  mostraba al cajero como "Pendiente" — un pedido cerrado apareciendo como
//  activo. Ahora ambas vistas leen de acá.
// ─────────────────────────────────────────────────────────────
export const ESTADO_PEDIDO_CFG = {
  pendiente_verificacion: { label: 'Verificando pago', color: '#AD1457', bg: '#FCE4EC' },
  pendiente:  { label: 'Pendiente',  color: '#F57F17', bg: '#FFF8E1' },
  en_proceso: { label: 'En proceso', color: '#1565C0', bg: '#E3F2FD' },
  en_camino:  { label: 'En camino',  color: '#00838F', bg: '#E0F7FA' },
  entregado:  { label: 'Entregado',  color: '#388E3C', bg: '#F1F8E9' },
  cancelado:  { label: 'Cancelado',  color: '#B71C1C', bg: '#FFEBEE' },
  anulado:    { label: 'Anulado',    color: '#757575', bg: '#EEEEEE' },
  // 'pagado' y 'devuelto' NO son estados del pedido sino de la VENTA
  // asociada; el cajero los muestra igual en su tarjeta, así que se
  // mantienen para que no se caiga a un respaldo equivocado.
  pagado:     { label: 'Pagado',     color: '#7E57C2', bg: '#EDE7F6' },
  devuelto:   { label: 'Devuelto',   color: '#FF7043', bg: '#FBE9E7' },
};

// Devuelve SIEMPRE una config válida, normalizando primero los valores
// legados ('listo' → 'en_camino', 'en_preparacion' → 'en_proceso') y
// resolviendo la etiqueta según el tipo de entrega ('En camino' para
// domicilio, 'Listo para recoger' para local).
//
// El respaldo es 'anulado' (gris neutro) y no 'pendiente': si aparece un
// estado desconocido es preferible que se vea inerte a que se muestre como
// un pedido activo que alguien tiene que atender.
export const configEstadoPedido = (estado, tipo) => {
  const e = normalizarEstadoPedido(estado);
  const base = ESTADO_PEDIDO_CFG[e] || ESTADO_PEDIDO_CFG.anulado;
  return { ...base, label: etiquetaEstadoPedido(estado, tipo) };
};

// ─────────────────────────────────────────────────────────────
//  ESTADO DEL PAGO — campo `estado_pago`, SEPARADO de `estado`
//
//  Contrato del backend (CAMBIOS.md, Ronda 22 / secciones B4 y C4): toda
//  respuesta que devuelve un pedido trae `estado_pago` como campo propio,
//  independiente de `estado`. Valores:
//    'rechazado'              → comprobante rechazado (el pedido queda
//                                'cancelado' Y con comprobante_motivo_rechazo).
//    'pendiente_verificacion' → comprobante subido/por subir, sin revisar.
//    'aprobado'               → pago_confirmado = true.
//    'pendiente'              → el resto (efectivo/local sin cobrar aún, o
//                                cancelado por CUALQUIER otra razón).
//
//  El frontend decide "Contactar con nosotros" vs "Ver factura" leyendo
//  SOLO `estado_pago === 'rechazado'` — nunca combinando estado +
//  comprobante_motivo_rechazo a mano.
// ─────────────────────────────────────────────────────────────
export const ESTADOS_PAGO_VALIDOS = ['pendiente', 'pendiente_verificacion', 'aprobado', 'rechazado'];

// ── Método de pago — etiqueta visible (B1) ───────────────────
// El valor interno que viaja al backend NO cambia: 'efectivo' | 'nequi' |
// 'transferencia' (constante METODOS_PAGO_VALIDOS del backend). Solo se
// traduce el texto que ve el usuario: 'transferencia' → "Llave Bancolombia".
export const METODOS_PAGO_VALIDOS = ['efectivo', 'nequi', 'transferencia'];
const METODO_PAGO_LABEL = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  transferencia: 'Llave Bancolombia',
};
export const etiquetaMetodoPago = (pago) => METODO_PAGO_LABEL[pago] || pago || '—';

// Lee el estado del pago de un pedido. Prioriza el campo `estado_pago` del
// backend; si un pedido viejo (o una respuesta parcial) no lo trae, lo
// deriva con la MISMA lógica del backend a partir de campos que sí existen.
export const estadoPagoDe = (pedido) => {
  if (!pedido) return 'pendiente';
  const raw = pedido.estado_pago ?? pedido.estadoPago ?? null;
  if (raw && ESTADOS_PAGO_VALIDOS.includes(raw)) return raw;
  // Derivación de respaldo (mismo criterio que calcularEstadoPago del backend):
  const motivo = pedido.comprobante_motivo_rechazo ?? pedido.comprobanteMotivoRechazo ?? pedido.motivo_rechazo;
  const est = normalizarEstadoPedido(pedido.estado);
  if (est === 'cancelado' && motivo) return 'rechazado';
  if (est === 'pendiente_verificacion') return 'pendiente_verificacion';
  if (pedido.pago_confirmado === true || pedido.pagoConfirmado === true || pedido.pago_confirmado === 1) return 'aprobado';
  return 'pendiente';
};

export const ESTADO_PAGO_CFG = {
  pendiente:               { label: 'Pago pendiente',   color: '#F57F17', bg: '#FFF8E1' },
  pendiente_verificacion:  { label: 'Verificando pago', color: '#AD1457', bg: '#FCE4EC' },
  aprobado:                { label: 'Pago aprobado',    color: '#2E7D32', bg: '#E8F5E9' },
  rechazado:               { label: 'Pago rechazado',   color: '#C62828', bg: '#FFEBEE' },
};

export const configEstadoPago = (pedido) => {
  const ep = estadoPagoDe(pedido);
  return { ...(ESTADO_PAGO_CFG[ep] || ESTADO_PAGO_CFG.pendiente), estadoPago: ep };
};

// ¿Mostrar "Contactar con nosotros" en vez de "Ver factura"?  SOLO si el
// pago fue rechazado (contrato B6).
export const pagoFueRechazado = (pedido) => estadoPagoDe(pedido) === 'rechazado';

// ─────────────────────────────────────────────────────────────
//  ESTADO DE LA DEVOLUCIÓN — campo `estado_devolucion`, SEPARADO de
//  `estado` y de `estado_pago` (mismo criterio de no mezclar conceptos).
//
//  Contrato del backend (CAMBIOS.md, Ronda 23 sección 3): TODA respuesta
//  que devuelve un pedido (GET /pedidos, GET /pedidos/mis-pedidos,
//  GET /pedidos/:id, y el pedido adjunto en PATCH /devoluciones/:id/estado)
//  trae `estado_devolucion`, calculado sumando TODAS las devoluciones
//  APROBADAS de ese pedido contra lo comprado:
//    'ninguna' → sin devoluciones aprobadas.
//    'parcial' → se devolvió parte del pedido (no todas las líneas/cantidades).
//    'total'   → se devolvió el pedido completo.
//  Cada línea de `productos[]` trae además `cantidadDevuelta` y `devuelto`
//  (booleano) — para marcar solo la línea que de verdad se devolvió.
// ─────────────────────────────────────────────────────────────
export const ESTADOS_DEVOLUCION_VALIDOS = ['ninguna', 'parcial', 'total'];

export const estadoDevolucionDe = (pedido) => {
  const raw = pedido?.estado_devolucion ?? pedido?.estadoDevolucion ?? 'ninguna';
  return ESTADOS_DEVOLUCION_VALIDOS.includes(raw) ? raw : 'ninguna';
};

export const ESTADO_DEVOLUCION_CFG = {
  parcial: { label: 'Devolución parcial', color: '#EF6C00', bg: '#FFF3E0' },
  total:   { label: 'Devuelto',           color: '#C62828', bg: '#FFEBEE' },
};

// null cuando no hay devolución que mostrar ('ninguna') — el badge
// correspondiente se omite en vez de pintar un chip vacío.
export const configEstadoDevolucion = (pedido) => {
  const ed = estadoDevolucionDe(pedido);
  return ed === 'ninguna' ? null : { ...ESTADO_DEVOLUCION_CFG[ed], estadoDevolucion: ed };
};

// Mensaje de contacto para el cliente cuando su pago fue rechazado —
// identifica el pedido por su id real. Se usa con WA_NUMERO (el número de
// WhatsApp que ya vive en el frontend).
export const mensajeContactoPagoRechazado = (pedido) => {
  const id = pedido?.id ?? pedido?.numero ?? '';
  const motivo = pedido?.comprobante_motivo_rechazo ?? pedido?.comprobanteMotivoRechazo ?? '';
  return (
    `Hola, escribo por mi pedido #${id}. ` +
    `El pago aparece como rechazado${motivo ? ` (motivo: ${motivo})` : ''} y necesito ayuda para resolverlo.`
  );
};
