import React, { useState, useEffect, useRef } from 'react';
import Layout from '../../../shared/components/Layout';
import pedidosService from '../services/pedidosService';
import empleadosService from '../../empleados/services/empleadosService';
import clientesService from '../../clientes/services/clientesService';
import productosService from '../../productos/services/productosService';
import adicionesService from '../../adiciones/services/adicionesService';
import ventasService from '../../ventas/services/ventasService';
import notificacionesService from '../../notificaciones/services/notificacionesService';
import localesService from '../../../shared/services/localesService';
import { ESTADO_CONFIG } from '../data/datos';
import { configEstadoPedido, etiquetaMetodoPago, mensajeErrorEstadoPedido, estadoDevolucionDe, puedeEditarProductosPedido, estadoPagoDe } from '../../../shared/utils/pedidoEstados';
import { EstadoPagoBadge } from '../../../shared/components/EstadosPedido';
import { useAuth } from '../../../shared/contexts/AuthContext';
import LocalFiltro from '../../../shared/components/LocalFiltro';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import NuevoPedidoPanel from '../components/NuevoPedidoPanel';
import './PedidosPage.css';

// 13 — "Nuevo pedido" del Admin: mismo componente (catálogo + carrito) que
// el Cajero, presentado como modal amplio con scroll interno propio. Cierra
// con X / Escape / click en el fondo, pidiendo confirmación si el carrito
// tiene ítems.
//
// Punto 3 del pedido del usuario: este MISMO modal ahora también sirve para
// "Editar pedido" — se le pasa `pedidoEditar` (el pedido completo) y
// NuevoPedidoPanel entra en modo edición (carrito precargado, todo lo demás
// oculto/fijo). Antes existía un `ModalPedido` aparte con su propio
// formulario completo (cliente/local/atendido-por/tipo/productos editables
// a la vez) que fue divergiendo del de creación real — el 6º caso del
// patrón de "componentes gemelos" de este proyecto (ver
// sicaber-verificar-componente-real) — se eliminó en vez de mantener dos.
function ModalNuevoPedidoAdmin({ onClose, onCreated, showToast, pedidoEditar = null }) {
  const modoEdicion = !!pedidoEditar;
  const [cartLleno, setCartLleno] = useState(modoEdicion);
  const intentarCerrar = () => {
    // En edición, el carrito arranca lleno con los productos que YA tenía
    // el pedido (no es un carrito "sin confirmar" recién armado) — solo
    // pedir confirmación si de verdad se modificó algo, no por el simple
    // hecho de abrir el modal.
    const mensaje = modoEdicion
      ? 'Tienes cambios sin guardar en este pedido. ¿Cerrar de todas formas?'
      : 'Tienes productos en el carrito sin confirmar. ¿Cerrar de todas formas?';
    if (cartLleno && cambiado && !window.confirm(mensaje)) return;
    onClose();
  };
  // Solo relevante en edición: distingue "el carrito sigue igual a como
  // llegó" de "se agregó/quitó/cambió algo" — así el cierre sin cambios no
  // interrumpe con un confirm innecesario. `onCartChange` (NuevoPedidoPanel)
  // dispara también en el montaje inicial (el carrito ya llega precargado
  // con los productos del pedido) — `primerAviso` descarta esa primera
  // llamada para que "cambiado" solo pase a true con una edición real del
  // usuario, no con la carga inicial.
  const [cambiado, setCambiado] = useState(!modoEdicion);
  const primerAviso = useRef(true);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') intentarCerrar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [cartLleno, cambiado]);
  return (
    <div className="pd-overlay" onClick={intentarCerrar}>
      <div className="pd-nuevo-modal" onClick={e => e.stopPropagation()}>
        <div className="pd-nuevo-modal__head">
          <div>
            <div className="pd-modal-eyebrow">{modoEdicion ? 'Editar pedido' : 'Nuevo pedido'}</div>
            <div className="pd-modal-id" style={{ fontSize: 18 }}>{modoEdicion ? `Pedido #${pedidoEditar.id}` : 'Catálogo y carrito'}</div>
          </div>
          <button className="pd-nuevo-modal__x" onClick={intentarCerrar} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="pd-nuevo-modal__body">
          <NuevoPedidoPanel modo="admin" showToast={showToast} pedidoEditar={pedidoEditar}
            onCartChange={n => {
              setCartLleno(n);
              if (modoEdicion) {
                if (primerAviso.current) { primerAviso.current = false; } else { setCambiado(true); }
              }
            }}
            onCreated={() => { onCreated(); }} />
        </div>
      </div>
    </div>
  );
}

// B1 — "transferencia" se muestra "Llave Bancolombia" (el valor NO cambia).
const METODOS_PAGO_LABEL = { nequi: 'Nequi', transferencia: 'Llave Bancolombia', efectivo: 'Efectivo' };

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const POR_PAGINA = 8;

/* ── MODAL DETALLE ── */
function ModalDetalle({ pedido, onClose, onCambiarEstado, onAprobarPago, onRechazarPago }) {
  const { hasPermiso } = useAuth();
  const puedeGestionar = hasPermiso('pedidos', 'gestionar');
  const cfg = configEstadoPedido(pedido.estado, pedido.tipo);
  // El backend guarda los productos en la columna "items" y la imagen del
  // comprobante en "comprobante_img". El listado ya tenía este fallback,
  // pero el modal de detalle no, así que siempre mostraba "Sin productos
  // registrados" y nunca la imagen del comprobante aunque sí existieran.
  const productos     = Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []);
  const comprobanteImg = pedido.comprobanteImg || pedido.comprobante_img || null;
  const hora = pedido.hora || (pedido.created_at ? new Date(pedido.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—');
  const fecha = pedido.created_at ? new Date(pedido.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : null;
  // Cambio 2 (pedido del usuario) — "de verdad hace falta" mostrar el
  // estado del pago solo cuando dice algo que el estado del pedido no dice
  // ya (verificando/aprobado/rechazado); en 'pendiente' es redundante con
  // el badge principal del encabezado, así que esa fila ni aparece.
  const estadoPago = estadoPagoDe(pedido);
  const mostrarEstadoPago = estadoPago !== 'pendiente';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 620, textAlign: 'left', padding: 0 }} onClick={e => e.stopPropagation()}>
        {/* Cambio 2 — mismo encabezado compacto que ya usa el detalle de
            Ventas (número + cliente + fecha/hora en una sola línea, UNA
            sola etiqueta de estado a la derecha) en vez del bloque verde
            grande que antes ocupaba mucho espacio para poca información,
            y de las DOS etiquetas de estado apiladas (pedido + pago). */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-head__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <div className="modal-head__title">Pedido #{pedido.id}</div>
              <div className="modal-head__sub">{pedido.cliente || pedido.mesa || 'Sin cliente'} · {fecha ? `${fecha} · ` : ''}{hora}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: cfg.bg, color: cfg.color, padding: '5px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{cfg.label || pedido.estado}</span>
            <button onClick={onClose} title="Cerrar" className="modal-close-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Cambio 2 — dos tarjetas lado a lado (mismas clases
              `modal-seccion`/`modal-fila` que ya usa Ventas — no se
              inventó CSS nuevo) en vez de 6 tarjetas sueltas apiladas:
              etiqueta a la izquierda, valor a la derecha, se escanea de
              un vistazo en vez de leer etiqueta-arriba/valor-abajo x6. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} className="pd-detalle-2col">
            <div className="modal-seccion" style={{ marginBottom: 0 }}>
              <div className="modal-seccion__titulo">Información general</div>
              {[
                ['Cliente', pedido.cliente || pedido.mesa || '—'],
                ['Fecha',   fecha || '—'],
                ['Hora',    hora],
                // Prioriza atendidoPorNombre (JOIN real con usuarios vía
                // atendido_por, ver PEDIDO_SELECT) sobre `barista` (texto
                // libre suelto) — mismo criterio ya usado en el listado.
                ['Atendido por', pedido.atendidoPorNombre || pedido.barista || '—'],
              ].map(([k, v]) => (
                <div key={k} className="modal-fila">
                  <span className="modal-fila__k">{k}</span>
                  <span className="modal-fila__v">{v}</span>
                </div>
              ))}
            </div>
            <div className="modal-seccion" style={{ marginBottom: 0 }}>
              <div className="modal-seccion__titulo">Pago y entrega</div>
              {[
                ['Método', etiquetaMetodoPago(pedido.pago)],
                ['Tipo',   pedido.tipo === 'domicilio' ? 'A domicilio' : 'En local'],
                ['Local',  pedido.sede || '—'],
                // Solo aparece cuando dice algo que el badge del
                // encabezado no dice ya (ver `mostrarEstadoPago`) — nunca
                // las dos etiquetas de estado a la vez.
                ...(mostrarEstadoPago ? [['Estado de pago', <EstadoPagoBadge key="ep" pedido={pedido} />]] : []),
              ].map(([k, v]) => (
                <div key={k} className="modal-fila">
                  <span className="modal-fila__k">{k}</span>
                  <span className="modal-fila__v">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* El total en su propia franja destacada, DESPUÉS de los datos
              del pedido (antes aparecía suelto arriba de todo, antes que
              el cliente/tipo/local — mismo lugar y estilo que ya usa
              Ventas para su "Total de la venta"). */}
          <div className="modal-seccion" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 13 }}>Total del pedido</span>
            <span className="modal-monto" style={{ fontSize: 22 }}>{fmt(pedido.total)}</span>
          </div>

          {/* Comprobante: sección propia (puede llevar una imagen grande,
              no cabe como una fila más de "Pago y entrega"). Antes esta
              tarjeta desaparecía por completo sin comprobante (ej. pago en
              efectivo), sin decir si "no hace falta" o "falta subirlo" —
              se muestra siempre, con un mensaje según el método (mismo
              criterio ya aplicado en Compras). */}
          <div className="modal-seccion">
            <div className="modal-seccion__titulo">Comprobante de pago</div>
            {pedido.comprobante ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{pedido.comprobante}</div>
                {comprobanteImg && (
                  <img src={comprobanteImg} alt="Comprobante"
                    style={{ marginTop: 10, width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'zoom-in', background: '#fafafa' }}
                    onClick={() => window.open(comprobanteImg, '_blank')}/>
                )}
              </>
            ) : pedido.pago === 'efectivo' ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>— Pago en efectivo: no requiere comprobante.</p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>— Sin comprobante adjunto.</p>
            )}
          </div>

          {/* Productos: mismo formato que Ventas — tarjeta por línea, badge
              de cantidad junto al nombre, precio alineado a la derecha
              (antes: etiqueta arriba, precio abajo a la derecha del todo,
              menos legible en una fila angosta). */}
          <div className="modal-seccion">
            <div className="modal-seccion__titulo">Productos ({productos.length})</div>
            {productos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Sin productos registrados.</p>
            ) : productos.map((x, i) => {
              const nombre = x.nombre || (typeof x === 'string' ? x : 'Producto');
              const cant = x.cantidad || 1;
              const sub = x.precio ? x.precio * cant : null;
              const adiciones = Array.isArray(x.adiciones) ? x.adiciones : [];
              return (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--bg-hover)' : 'transparent', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {nombre}
                      {cant > 1 && <span style={{ background: 'var(--color-green)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, marginLeft: 6, fontWeight: 700 }}>x{cant}</span>}
                    </span>
                    {sub != null && <span style={{ fontWeight: 700, color: 'var(--color-green)', whiteSpace: 'nowrap' }}>{fmt(sub)}</span>}
                  </div>
                  {adiciones.map((a, j) => (
                    <div key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 12, marginTop: 3 }}>+ {a.nombre || a}</div>
                  ))}
                </div>
              );
            })}
          </div>

          {pedido.estado === 'pendiente_verificacion' && onCambiarEstado && puedeGestionar && (
            <div style={{ background: 'rgba(173,20,87,0.1)', color: '#AD1457', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12.5, fontWeight: 600 }}>
              ⚠ Verifica el comprobante de pago para continuar. El pedido no puede pasar a "En preparación" hasta aprobarlo.
            </div>
          )}
          <div className="modal-pie">
            {pedido.estado === 'pendiente_verificacion' && onCambiarEstado && puedeGestionar ? (
              <>
                {/* Mismo criterio que ModalDetallePedido: en el pie del modal
                    van los botones de confirmación, no los de acción de tabla. */}
                <button className="btn-confirm-danger" onClick={() => { onClose(); onRechazarPago ? onRechazarPago(pedido) : onCambiarEstado(pedido.id, 'cancelado'); }}>✕ Rechazar pago</button>
                <button className="btn-confirm-primary" onClick={() => { onClose(); onAprobarPago ? onAprobarPago(pedido) : onCambiarEstado(pedido.id, 'en_proceso'); }}>✓ Aprobar pago</button>
              </>
            ) : (
              <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function PedidosPage() {
  const { user, hasPermiso } = useAuth();
  // Filtro por local (Administración): 'todos' para Administrador/
  // Superadministrador (sede='Ambos'); cualquier otro usuario queda fijo
  // en su propia sede — ver LocalFiltro.
  // 7 — valor "sin filtrar" de localSel: para un cajero/bartender fijo a su
  // propio local (LocalFiltro ni siquiera le deja elegir otro) es su propia
  // sede; para Administrador (sede='Ambos') es 'todos'. "Limpiar filtros"
  // vuelve acá, no siempre a 'todos'.
  const localSelDefault = user?.sede && user.sede !== 'Ambos' ? user.sede : 'todos';
  const [localSel, setLocalSel] = useState(localSelDefault);
  const [pedidos,      setPedidos]  = useState([]);
  const [stats,        setStats]    = useState({ total:0, pendiente:0, porVerificar:0, proceso:0, listo:0, ventas:0 });
  const [modal,        setModal]    = useState(false);
  const [editTarget,   setEditTarget] = useState(null);
  const [detalle,      setDetalle]  = useState(null);
  const [deleteTarget, setDel]      = useState(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [buscar,       setBuscar]   = useState('');
  const [pagina,       setPagina]   = useState(1);
  const [success,      setSuccess]  = useState('');
const [vista,         setVista]   = useState('activos'); 
  const [rechazoTarget, setRechazoTarget] = useState(null); // pedido en proceso de rechazo (para pedir motivo)
  const [rechazoMotivo, setRechazoMotivo] = useState('');
  const refresh = async () => {
    const [p, s] = await Promise.allSettled([pedidosService.getAll(), pedidosService.getStats()]);
    if (p.status === 'fulfilled') setPedidos(p.value || []);
    if (s.status === 'fulfilled') setStats(s.value  || stats);
  };

  useEffect(() => { refresh(); }, []);

  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const [error, setError] = useState('');
  const showErr = msg => { setError(msg); setTimeout(() => setError(''), 5000); };

  // Devuelve true/false para que quien llame (aprobarPago, confirmarRechazo,
  // handleAnularPedido, ...) sepa si el cambio realmente ocurrió antes de
  // seguir con sus propias acciones "de éxito" (notificar al cliente,
  // mostrar el toast, cerrar el modal) — si esta función tragara el error
  // sin devolver nada, esos callers seguirían de largo como si el cambio
  // hubiera funcionado.
  const cambiarEstado = async (id, nuevoEstado) => {
    const pedidoActual = pedidos.find(p => p.id === id);
    if (pedidoActual && (pedidoActual.estado === 'listo' || pedidoActual.estado === 'entregado' || pedidoActual.estado === 'en_camino')) {
      if (nuevoEstado !== 'listo' && nuevoEstado !== 'entregado' && nuevoEstado !== 'en_camino') return false;
    }
    if (pedidoActual && pedidoActual.estado === 'pendiente_verificacion') {
      if (nuevoEstado !== 'en_proceso' && nuevoEstado !== 'cancelado') return false;
    }
    // api.js lanza (throw) cuando el backend rechaza el cambio (ej. "El
    // pedido debe tener el pago confirmado antes de pasar a preparación").
    // Sin try/catch esa excepción quedaba sin capturar: no se mostraba
    // nada y el clic parecía "no hacer nada".
    try {
      await pedidosService.cambiarEstado(id, nuevoEstado);
    } catch (err) {
      showErr(err.message || 'No se pudo cambiar el estado del pedido.');
      return false;
    }
    if (nuevoEstado === 'listo') {
      try {
        const ventas = await ventasService.getAll();
        const pedido = pedidos.find(p => p.id === id);
        const ventasExistentes = (ventas || []).map(v => v.id_pedido);
        if (pedido && !ventasExistentes.includes(pedido.id)) {
          await ventasService.crearDesde(id);
        }
      } catch(e) { console.error('Error auto-creando venta', e); }
    }
    await refresh();
    return true;
  };

  // ── Aprobar / Rechazar pago (módulo "Pagos pendientes") ──────────────────
  // Además de cambiar el estado, se le avisa al cliente mediante el sistema
  // de notificaciones de la landing (localStorage, sin backend nuevo).
  //
  // Fix: antes esta función llamaba a cambiarEstado(pedido.id, 'en_proceso')
  // directo, saltándose el paso obligatorio de aprobar el comprobante. El
  // backend lo rechazaba con "...su comprobante todavía no fue aprobado.
  // Aprobalo con PATCH /pedidos/:id/comprobante/aprobar antes de pasarlo a
  // 'en_proceso'." y ese texto crudo se mostraba tal cual en el toast.
  // Ahora llama al endpoint correcto (igual que ya hacía, sin este bug,
  // PagosPendientesPanel.jsx): aprobar el comprobante SÍ mueve el pedido a
  // 'en_proceso' del lado del backend, no hace falta el segundo paso.
  const aprobarPago = async (pedido) => {
    try {
      await pedidosService.aprobarComprobante(pedido.id);
    } catch (err) {
      showErr(mensajeErrorEstadoPedido(err, 'No se pudo aprobar el pago.'));
      return false;
    }
    await refresh();
    notificacionesService.create({
      clienteId: pedido.cliente_id,
      pedidoId: pedido.id,
      tipo: 'pago_aprobado',
      mensaje: '✅ Tu pago fue aprobado correctamente. Ya estamos preparando tu pedido.',
    });
    showOk(`Pago del pedido #${pedido.id} aprobado`);
  };

  const abrirRechazo = (pedido) => { setRechazoMotivo(''); setRechazoTarget(pedido); };

  const confirmarRechazo = async () => {
    if (!rechazoTarget) return;
    const motivo = rechazoMotivo.trim() || 'No pudimos verificar tu comprobante de pago.';
    const ok = await cambiarEstado(rechazoTarget.id, 'cancelado');
    if (!ok) return;
    notificacionesService.create({
      clienteId: rechazoTarget.cliente_id,
      pedidoId: rechazoTarget.id,
      tipo: 'pago_rechazado',
      mensaje: `❌ Tu pago fue rechazado. Motivo: ${motivo}. Puedes volver a comprar y subir un nuevo comprobante desde "Mis pedidos".`,
    });
    showOk(`Pago del pedido #${rechazoTarget.id} rechazado`);
    setRechazoTarget(null);
  };

  const cerrarAnular = () => { setDel(null); setAnularMotivo(''); };

  // "Anular pedido" — cancelación permanente. Reutiliza el mismo mecanismo
  // ya usado al rechazar un pago (confirmarRechazo, arriba): estado
  // 'cancelado' + motivo + notificación al cliente. No es un estado nuevo.
  const handleAnularPedido = async () => {
    const ok = await cambiarEstado(deleteTarget.id, 'cancelado');
    if (!ok) return;
    notificacionesService.create({
      clienteId: deleteTarget.cliente_id,
      pedidoId: deleteTarget.id,
      tipo: 'pedido_anulado',
      mensaje: `❌ Tu pedido fue anulado. Motivo: ${anularMotivo.trim() || 'No especificado'}.`,
    });
    showOk(`Pedido #${deleteTarget.id} anulado`);
    cerrarAnular();
  };

  const pedidosLocal = localSel === 'todos' ? pedidos : pedidos.filter(p => p.sede === localSel);
  // "En Stop" se eliminó del todo: ya no existe una vista intermedia
  // reversible aparte de Anular — un pedido anulado queda anulado.
  // Un pedido con devolución aprobada (parcial o total) ya no es un pedido
  // "activo" — deja de listarse acá (con badge "Devuelto" o sin él): a
  // partir de ahora solo se consulta desde el módulo de Devoluciones.
  const activos = pedidosLocal.filter(p => p.estado !== 'anulado' && estadoDevolucionDe(p) === 'ninguna');
const pagosPendientes = pedidosLocal.filter(p => p.estado === 'pendiente_verificacion');
const base = activos;

const lq = buscar.toLowerCase().trim();
// Busca el texto en CUALQUIER dato registrado del pedido: número, cliente,
// mesa, estado, tipo, método de pago, sede, teléfono, dirección, quien lo
// atendió (barista/domiciliario) y el nombre de los productos. Antes solo
// miraba cliente/mesa, estado y productos, así que buscar por el número de
// pedido o por el método de pago no devolvía nada.
const pedidoMatchesTexto = (p, q) => {
  const campos = [
    p.cliente, p.mesa, p.estado, p.tipo, p.metodo_pago, p.sede,
    p.telefono, p.direccion, p.barista, p.domiciliario,
  ];
  if (campos.some(c => String(c || '').toLowerCase().includes(q))) return true;
  if (String(p.id ?? '').toLowerCase().includes(q)) return true;
  const prods = Array.isArray(p.productos) ? p.productos : (Array.isArray(p.items) ? p.items : []);
  return prods.some(x => (x.nombre || (typeof x === 'string' ? x : '')).toLowerCase().includes(q));
};
const filtrados = lq
  ? base.filter(p => pedidoMatchesTexto(p, lq))
  : base;
  const ordenados  = [...filtrados].sort((a,b) => Number(b.id) - Number(a.id));
  const totalPags  = Math.ceil(ordenados.length / POR_PAGINA);
  const paginados  = ordenados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const statCards = [
    { label:'Total pedidos',  value: stats.total,        color:'#6D4C41', bg:'#EFEBE9' },
    { label:'Por verificar',  value: stats.porVerificar, color:'#AD1457', bg:'#FCE4EC' },
    { label:'Pendientes',     value: stats.pendiente,    color:'#F57F17', bg:'#FFF8E1' },
    { label:'En proceso',     value: stats.proceso,      color:'#1565C0', bg:'rgba(25,118,210,0.12)' },
    { label:'Ventas del día', value: fmt(stats.ventas),  color:'#2E7D32', bg:'#E8F5E9', big:true },
  ];

  return (
    <Layout>
      <div className="pd-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {error   && <div className="toast toast-error">⚠ {error}</div>}
        {modal      && <ModalNuevoPedidoAdmin
          onClose={() => setModal(false)} showToast={showOk}
          onCreated={() => { setModal(false); setPagina(1); refresh(); showOk('Pedido creado correctamente'); }} />}
        {/* Punto 3 — "Editar pedido" reutiliza el mismo modal/formulario que
            "Nuevo pedido" (ver el comentario largo en ModalNuevoPedidoAdmin),
            en vez del `ModalPedido` que existía aparte. */}
        {editTarget && <ModalNuevoPedidoAdmin pedidoEditar={editTarget} onClose={() => setEditTarget(null)} showToast={showOk}
          onCreated={() => { setEditTarget(null); setPagina(1); refresh(); }} />}
        {detalle && <ModalDetalle onClose={() => setDetalle(null)} pedido={detalle} onCambiarEstado={cambiarEstado} onAprobarPago={aprobarPago} onRechazarPago={abrirRechazo} />}
        {rechazoTarget && (
          <div className="modal-overlay" onClick={() => setRechazoTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <h3>Rechazar pago del pedido #{rechazoTarget.id}</h3>
              <p>Cuéntale al cliente por qué se rechazó su comprobante. Este motivo se le notificará.</p>
              <textarea
                className="pd-alt-address__input"
                style={{width:'100%',minHeight:80,resize:'vertical',fontFamily:'inherit',fontSize:13,padding:10,borderRadius:8,border:'1.5px solid var(--border)',marginTop:8}}
                placeholder="Ej: El valor del comprobante no coincide con el total del pedido."
                value={rechazoMotivo}
                onChange={e => setRechazoMotivo(e.target.value)}
              />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setRechazoTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={confirmarRechazo}>✕ Confirmar rechazo</button>
              </div>
            </div>
          </div>
        )}

        <div className="page-header">
          <div>
            <h1 className="page-title">Gestión de Pedidos</h1>
            <p className="page-subtitle">Control de pedidos en tiempo real</p>
          </div>
          {hasPermiso('pedidos', 'gestionar') && (
            <button className="btn-add" onClick={() => setModal(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo pedido
            </button>
          )}
        </div>

        <div className="pd-stats">
          {statCards.map((s,i) => (
            <div className="pd-stat" key={i} style={{ borderTop:`3px solid ${s.color}` }}>
              <div className="pd-stat-label">{s.label}</div>
              <div className="pd-stat-value" style={{ color:s.color, fontSize:s.big?'18px':'28px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* item 6 / batch 6 item 2 — pestañas + selector de local y buscador
            + contador en UN solo card (dos filas con divisor). La tabla va
            en su propio card aparte. */}
        <div className="sic-stack">
          <div className="sic-block sic-filterbar">
            <div className="sic-filterbar__row">
              <button
                onClick={() => { setVista('activos'); setPagina(1); }}
                className={vista==='activos' ? 'btn-confirm-primary' : 'btn-cancel'}
              >
                Pedidos activos ({activos.length})
              </button>
              <button
                onClick={() => { setVista('pagos'); setPagina(1); }}
                className={vista==='pagos' ? 'btn-confirm-primary' : 'btn-cancel'}
                style={vista!=='pagos' && pagosPendientes.length>0 ? {borderColor:'#AD1457',color:'#AD1457'} : undefined}
              >
                💳 Pagos pendientes {pagosPendientes.length > 0 ? `(${pagosPendientes.length})` : ''}
              </button>
              <div style={{flex:1}}/>
              <LocalFiltro value={localSel} onChange={v => { setLocalSel(v); setPagina(1); }} sedeUsuario={user?.sede}/>
            </div>
            {vista !== 'pagos' && (
              <div className="sic-filterbar__row sic-filterbar__row--sep">
                <div className="search-group" style={{ flex:'1 1 260px' }}>
                  <div className="search-wrap">
                    <span className="search-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </span>
                    <input className="search-input" placeholder="Buscar por N.º, cliente, producto, estado o pago..." value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1); }}/>
                    {buscar && <button className="search-clear" onClick={() => setBuscar('')}>✕</button>}
                  </div>
                </div>
                {(buscar || localSel !== localSelDefault) && (
                  <button className="btn-limpiar-filtros" title="Limpiar filtros"
                    onClick={() => { setBuscar(''); setLocalSel(localSelDefault); setPagina(1); }}>
                    ✕ Limpiar filtros
                  </button>
                )}
                <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{filtrados.length} pedido{filtrados.length!==1?'s':''}</span>
              </div>
            )}
          </div>
          {vista === 'pagos' ? (
            <div className="sic-block sic-block--table">
            {pagosPendientes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </div>
                <h3>No hay pagos por verificar</h3>
                <p>Cuando un cliente suba un comprobante o confirme por WhatsApp, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="insumos-table">
                  <thead>
                    <tr><th>N° Pedido</th><th>Cliente</th><th>Método</th><th>Valor</th><th>Fecha</th><th>Hora</th><th>Comprobante</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {pagosPendientes.map(p => {
                      const comprobanteImg = p.comprobanteImg || p.comprobante_img || null;
                      const fecha = p.created_at ? new Date(p.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
                      const hora  = p.hora || (p.created_at ? new Date(p.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—');
                      return (
                        <tr key={p.id}>
                          <td className="td-id">#{p.id}</td>
                          <td className="td-nombre">{p.cliente || p.mesa || '—'}</td>
                          <td>{METODOS_PAGO_LABEL[p.pago] || p.pago || '—'}</td>
                          <td style={{fontWeight:700,color:'#2E7D32',fontSize:13}}>{fmt(p.total)}</td>
                          <td style={{fontSize:12,color:'var(--text-muted)'}}>{fecha}</td>
                          <td style={{fontSize:12,color:'var(--text-muted)'}}>{hora}</td>
                          <td>
                            {comprobanteImg ? (
                              <img src={comprobanteImg} alt="Comprobante" onClick={() => window.open(comprobanteImg,'_blank')}
                                style={{width:44,height:44,objectFit:'cover',borderRadius:8,border:'1.5px solid var(--border)',cursor:'zoom-in'}}/>
                            ) : (
                              <span style={{fontSize:11,color:'var(--text-muted)'}}>{p.comprobante === 'Enviado por WhatsApp' ? '📱 WhatsApp' : 'Sin imagen'}</span>
                            )}
                          </td>
                          <td><span className="pd-badge" style={{background:ESTADO_CONFIG.pendiente_verificacion.bg,color:ESTADO_CONFIG.pendiente_verificacion.color}}>{ESTADO_CONFIG.pendiente_verificacion.label}</span></td>
                          <td>
                            <div className="actions-group">
                              {hasPermiso('pedidos', 'ver') && (
                                <Tooltip label="Ver detalle">
                                  <button className="btn-ver" onClick={() => setDetalle(p)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  </button>
                                </Tooltip>
                              )}
                              {/* Mismos botones de acción estándar que usa
                                  PagosPendientesPanel: antes "Aprobar" era un
                                  .btn-add de 44px de alto dentro de la fila. */}
                              {hasPermiso('pedidos', 'gestionar') && (
                                <>
                                  <button className="btn-accion-rechazar" title="Rechazar pago" onClick={() => abrirRechazo(p)}>✕ Rechazar</button>
                                  <button className="btn-accion-aprobar" title="Aprobar pago" onClick={() => aprobarPago(p)}>✓ Aprobar</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          ) : (
          <>
          <div className="sic-block sic-block--table">
          {paginados.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              </div>
              <h3>{buscar ? 'Sin coincidencias' : 'No hay pedidos'}</h3>
              <p>{buscar ? `Sin resultados para "${buscar}"` : 'Crea el primer pedido del día usando el botón "Nuevo pedido" de arriba'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  {/* 2 — columna "Domiciliario" eliminada (solo mostraba "—"/"N/A").
                      "Atendido por" se mantiene. */}
                  <tr><th>#</th><th>Cliente</th><th>Tipo</th><th>Local</th><th>Atendido por</th><th>Productos</th><th>Total</th><th>Hora</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map(p => {
                    const prods = Array.isArray(p.productos) ? p.productos : (Array.isArray(p.items) ? p.items : []);
                    const vis   = prods.slice(0,2).map(x=>`${x.nombre||x}${x.cantidad>1?` x${x.cantidad}`:''}`).join(', ');
                    const extra = prods.length - 2;
                    const cfg   = ESTADO_CONFIG[p.estado] || {};
                    const hora  = p.hora || (p.created_at ? new Date(p.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—');
                    return (
                      <tr key={p.id}>
                        <td className="td-id">#{p.id}</td>
                        <td className="td-nombre">{p.cliente || p.mesa || '—'}</td>
                        <td>
                          <span className={`badge-cat ${p.tipo==='domicilio'?'pd-badge-domi':'pd-badge-local'}`}>
                            {p.tipo==='domicilio'?'Domicilio':'Local'}
                          </span>
                        </td>
                        <td>{p.sede ? <span className="badge-cat" style={{background:'rgba(25,118,210,0.12)',color:'#1976D2'}}>{p.sede.replace(/^local\s+/i, '')}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        {/* Punto 2 — prioriza atendidoPorNombre (viene de un
                            JOIN real con `usuarios` vía atendido_por, ver
                            PEDIDO_SELECT en el backend) sobre `barista`
                            (texto libre, sin vínculo a ninguna cuenta) —
                            pedidos viejos o de un cajero autoatendiéndose
                            siguen mostrando algo gracias al respaldo. */}
                        <td>{(p.atendidoPorNombre || p.barista) ? <span className="pd-pill-barista">{p.atendidoPorNombre || p.barista}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:180}}>
                          {vis}
                          <button className="btn-ver-mas" onClick={() => setDetalle(p)} style={{marginLeft:4}}>
                            {extra > 0 ? `+${extra} más` : 'ver'}
                          </button>
                        </td>
                        <td style={{fontWeight:700,color:'#2E7D32',fontSize:13}}>{fmt(p.total)}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{hora}</td>
                        <td>
                          <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-start'}}>
                          {!hasPermiso('pedidos', 'gestionar') ? (
                            <span className="pd-badge" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                          ) : p.estado==='anulado' ? (
                            <span className="pd-badge" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                          ) : p.estado==='entregado' ? (
                            // Terminal: sin transiciones (el backend rechaza cualquier cambio).
                            <span className="pd-badge" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                          ) : (p.estado==='listo'||p.estado==='en_camino') ? (
                            // C1/C3 — 'listo' es un valor legado que el backend ya
                            // no acepta: la única transición real desde "En camino /
                            // Listo para recoger" es "Entregado".
                            <select className="pd-estado-select" value={'en_camino'} style={{background:cfg.bg,color:cfg.color,borderColor:cfg.color+'55'}} onChange={e => cambiarEstado(p.id, e.target.value)}>
                              <option value="en_camino">{configEstadoPedido('en_camino', p.tipo).label}</option>
                              <option value="entregado">{ESTADO_CONFIG.entregado.label}</option>
                            </select>
                          ) : p.estado==='pendiente_verificacion' ? (
                            // 2 — mientras no se apruebe el comprobante, la
                            // única salida es aprobar/rechazar el pago: no
                            // hay forma de saltar a "En preparación" desde
                            // acá (no aparece esa opción en el select).
                            <Tooltip label="Verifica el comprobante de pago para continuar">
                              <select className="pd-estado-select" value={p.estado} style={{background:cfg.bg,color:cfg.color,borderColor:cfg.color+'55'}}
                                title="Verifica el comprobante de pago para continuar"
                                onChange={e => e.target.value==='en_proceso' ? aprobarPago(p) : e.target.value==='cancelado' ? abrirRechazo(p) : null}>
                                <option value="pendiente_verificacion">{ESTADO_CONFIG.pendiente_verificacion?.label||'Verificar pago'}</option>
                                <option value="en_proceso">✓ Aprobar pago</option>
                                <option value="cancelado">✕ Rechazar pago</option>
                              </select>
                            </Tooltip>
                          ) : (
                            <select className="pd-estado-select" value={p.estado} style={{background:cfg.bg,color:cfg.color,borderColor:cfg.color+'55'}} onChange={e => cambiarEstado(p.id, e.target.value)}>
                              {/* 'anulado' queda fuera a propósito: anular un
                                  pedido solo debe pasar por el botón
                                  dedicado (con motivo), no como una
                                  transición más de este selector genérico. */}
                              {Object.keys(ESTADO_CONFIG).filter(k => k!=='entregado'&&k!=='pendiente_verificacion'&&k!=='anulado').map(k => <option key={k} value={k}>{configEstadoPedido(k, p.tipo).label}</option>)}
                            </select>
                          )}
                          </div>
                        </td>
                        <td>
                          <div className="actions-group">
                            {hasPermiso('pedidos', 'ver') && (
                              <Tooltip label="Ver detalle">
                                <button className="btn-ver" onClick={() => setDetalle(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                              </Tooltip>
                            )}
                            {/* Punto 3 — "Editar pedido" (agregar/quitar
                                productos) solo tiene sentido MIENTRAS el
                                pedido no ha llegado a "Listo para recoger":
                                una vez ahí ya se dio por terminado, cambiar
                                el carrito no cambiaría nada real. Antes el
                                botón se ocultaba solo en 'entregado'/
                                'cancelado' — seguía apareciendo también en
                                'en_camino' ("Listo para recoger"). */}
                            {puedeEditarProductosPedido(p.estado) && hasPermiso('pedidos', 'gestionar') && (
                              <Tooltip label="Editar pedido">
                                <button className="btn-editar" onClick={() => setEditTarget(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                            )}
{p.estado!=='listo'&&p.estado!=='entregado' && hasPermiso('pedidos', 'eliminar') && (
  <AnularButton onClick={() => setDel(p)}/>
)}                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPags > 1 && (
            <div className="pd-paginacion">
              <button className="btn-cancel" disabled={pagina===1} onClick={() => setPagina(p=>Math.max(1,p-1))}>Anterior</button>
              {Array.from({length:totalPags},(_,i)=>i+1).map(n => (
                <button key={n} className={n===pagina?'btn-confirm-primary':'btn-cancel'} style={{padding:'6px 14px'}} onClick={() => setPagina(n)}>{n}</button>
              ))}
              <button className="btn-cancel" disabled={pagina===totalPags} onClick={() => setPagina(p=>Math.min(totalPags,p+1))}>Siguiente</button>
              <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:8}}>{ordenados.length} registros · Pág {pagina}/{totalPags}</span>
            </div>
          )}
          </div>
          </>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={cerrarAnular}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>Anular pedido #{deleteTarget.id}</h3>
              <p>Esta acción es <strong>permanente</strong> y se notificará al cliente.</p>
              <textarea
                className="pd-alt-address__input"
                style={{width:'100%',minHeight:70,resize:'vertical',fontFamily:'inherit',fontSize:13,padding:10,borderRadius:8,border:'1.5px solid var(--border)',marginTop:4}}
                placeholder="Motivo de la anulación (opcional)"
                value={anularMotivo}
                onChange={e => setAnularMotivo(e.target.value)}
              />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={cerrarAnular}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleAnularPedido}>Sí, anular pedido</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}