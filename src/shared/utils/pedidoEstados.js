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
