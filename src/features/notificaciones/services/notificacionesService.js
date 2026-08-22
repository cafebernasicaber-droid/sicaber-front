// ─────────────────────────────────────────────────────────────
//  src/features/notificaciones/services/notificacionesService.js
//
//  Notificaciones simples para el cliente, guardadas en
//  localStorage. Se usan, por ejemplo, para avisarle al cliente
//  que su transferencia/comprobante de pago fue confirmado
//  (o rechazado) por el admin o el cajero.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sicaber_notificaciones';

const getAll = () => {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : [];
  } catch { return []; }
};

const save = items => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

const create = ({ clienteId, pedidoId, tipo, mensaje }) => {
  if (!clienteId) return null; // sin cliente asociado no hay a quién notificar
  const items = getAll();
  const n = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    clienteId,
    pedidoId,
    tipo,            // 'pago_aprobado' | 'pago_rechazado' | ...
    mensaje,
    leida: false,
    fecha: new Date().toISOString(),
  };
  items.push(n);
  save(items);
  return n;
};

const getByCliente = clienteId =>
  getAll()
    .filter(n => n.clienteId === clienteId)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

const getNoLeidas = clienteId => getByCliente(clienteId).filter(n => !n.leida);

const marcarLeida = id => {
  const items = getAll();
  const idx = items.findIndex(n => n.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], leida: true };
  save(items);
  return items[idx];
};

const marcarTodasLeidas = clienteId => {
  const items = getAll().map(n => (n.clienteId === clienteId ? { ...n, leida: true } : n));
  save(items);
};

const notificacionesService = { getAll, create, getByCliente, getNoLeidas, marcarLeida, marcarTodasLeidas };
export default notificacionesService;
