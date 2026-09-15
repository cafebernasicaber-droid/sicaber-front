// ─────────────────────────────────────────────────────────────
//  src/features/pedidos/components/ModalDetallePedido.jsx
//
//  Modal de detalle de un pedido, compartido por PedidosPage
//  ("Gestión de Pedidos") y PagosPendientesPage ("Pagos pendientes")
//  — antes vivía duplicado dentro de PedidosPage.
//
//  Muestra: datos del pedido, total, comprobante (imagen incluida),
//  el detalle COMPLETO de cada producto con sus adiciones/toppings y
//  precios unitarios, y — si el comprobante fue rechazado — el motivo
//  del rechazo (punto 7).
//
//  Estructura visual: alineada con el modal "Ver detalle" de Ventas
//  (mismas clases estándar de shared/styles/modales.css — modal-head,
//  modal-seccion, modal-fila, modal-pie…) para que ambos se vean y se
//  sientan como el mismo componente en vez de dos diseños distintos.
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';

import { etiquetaEstadoPedido, configEstadoPedido, etiquetaMetodoPago } from '../../../shared/utils/pedidoEstados';
import { EstadoPagoBadge, EstadoDevolucionBadge } from '../../../shared/components/EstadosPedido';

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// Lista de "extras" de un ítem (adiciones + toppings), normalizada a
// { nombre, precio, cantidad } sin importar de qué forma venga guardada.
function extrasDeItem(item) {
  const fuentes = [
    ...(Array.isArray(item.adiciones) ? item.adiciones : []),
    ...(Array.isArray(item.toppings)  ? item.toppings  : []),
  ];
  return fuentes.map(e => (typeof e === 'string'
    ? { nombre: e, precio: 0, cantidad: 1 }
    : { nombre: e.nombre || e.name || 'Extra', precio: Number(e.precio || e.price || 0), cantidad: e.cantidad || 1 }));
}

export default function ModalDetallePedido({ pedido, onClose, onCambiarEstado, onAprobarPago, onRechazarPago }) {
  const { hasPermiso } = useAuth();
  const puedeGestionar = hasPermiso('pedidos', 'gestionar');
  // Igual que en PedidosPage: normalizado, para que un estado legado de la
  // base ('listo') no deje la etiqueta sin color.
  const cfg = configEstadoPedido(pedido.estado, pedido.tipo);
  const estadoLabel = etiquetaEstadoPedido(pedido.estado, pedido.tipo);
  const productos      = Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []);
  const comprobanteImg = pedido.comprobanteImg || pedido.comprobante_img || null;
  const motivoRechazo  = pedido.comprobante_motivo_rechazo || pedido.comprobanteMotivoRechazo || null;
  const direccionAlt   = pedido.direccion_alternativa || pedido.direccionAlternativa || null;
  const esDomicilio    = pedido.tipo === 'domicilio';
  const horaTxt = pedido.hora || (pedido.created_at ? new Date(pedido.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—');
  const puedeVerificar = pedido.estado === 'pendiente_verificacion' && onCambiarEstado && puedeGestionar;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 620, textAlign: 'left', padding: 0 }} onClick={e => e.stopPropagation()}>

        {/* Cabecera estándar (misma estructura que Ventas, Ficha técnica y Compras) */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-head__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 L18 2 L18 22 L6 22 Z" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
            </div>
            <div>
              <div className="modal-head__title">Pedido #{pedido.id}</div>
              <div className="modal-head__sub">{pedido.cliente || pedido.mesa || 'Sin cliente'} · {esDomicilio ? 'A domicilio' : 'En local'} · {horaTxt}</div>
            </div>
          </div>
          {/* C5 — estado del PEDIDO y estado del PAGO, dos badges separados. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <span style={{ background: cfg.bg, color: cfg.color, padding: '5px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{estadoLabel}</span>
              {/* soloSiRelevante: si el pago sigue "pendiente" no aporta nada
                  repetir esa misma palabra en un segundo badge junto al estado
                  del pedido — se oculta y solo se muestra cuando aporta info
                  nueva (verificando / aprobado / rechazado). */}
              <EstadoPagoBadge pedido={pedido} soloSiRelevante />
              {/* Ronda 23 item 3 — "Devuelto"/"Devolución parcial" cuando aplica. */}
              <EstadoDevolucionBadge pedido={pedido} />
            </div>
            <button onClick={onClose} title="Cerrar" className="modal-close-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Dos columnas de datos, mismo formato de tarjeta que Ventas. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="modal-seccion" style={{ marginBottom: 0 }}>
              <div className="modal-seccion__titulo">Información general</div>
              {[
                ['Cliente', pedido.cliente || pedido.mesa || '—'],
                ['Tipo',    esDomicilio ? 'A domicilio' : 'En local'],
                ['Local',   pedido.sede || '—'],
                ['Hora',    horaTxt],
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
                ['Método',       etiquetaMetodoPago(pedido.pago)],
                // Punto 2 — mismo criterio que la columna de la tabla:
                // prioriza el nombre resuelto por el vínculo real
                // (atendido_por → usuarios), con `barista` (texto libre)
                // como respaldo para pedidos que no lo tengan.
                ['Atendido por', pedido.atendidoPorNombre || pedido.barista || '—'],
                ['Domiciliario', esDomicilio ? (pedido.domiciliario || '—') : 'N/A'],
              ].map(([k, v]) => (
                <div key={k} className="modal-fila">
                  <span className="modal-fila__k">{k}</span>
                  <span className="modal-fila__v">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {esDomicilio && direccionAlt && (
            <div className="modal-seccion">
              <div className="modal-seccion__titulo">Dirección de entrega indicada por el cliente</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>{direccionAlt}</p>
            </div>
          )}

          <div className="modal-seccion" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 13 }}>Total del pedido</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-green)' }}>{fmt(pedido.total)}</span>
          </div>

          {motivoRechazo && (
            <div className="modal-seccion" style={{ background: 'rgba(183,28,28,0.08)', border: '1px solid rgba(183,28,28,0.25)' }}>
              <div className="modal-seccion__titulo" style={{ color: '#B71C1C' }}>Motivo del rechazo del comprobante</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>{motivoRechazo}</p>
            </div>
          )}

          {/* Punto 5 — antes esta sección entera desaparecía cuando no
              había comprobante (ej. pago en efectivo), sin dejar claro si
              "no hace falta" o "falta subirlo". Ahora siempre se muestra,
              con un mensaje según el método — mismo criterio que el punto
              1 aplicó en Compras. */}
          <div className="modal-seccion">
            <div className="modal-seccion__titulo">Comprobante de pago</div>
            {pedido.comprobante ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>{pedido.comprobante}</p>
                {comprobanteImg && (
                  <img src={comprobanteImg} alt="Comprobante"
                    style={{ marginTop: 10, width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'zoom-in', background: '#fafafa' }}
                    onClick={() => window.open(comprobanteImg, '_blank')} />
                )}
              </>
            ) : pedido.pago === 'efectivo' ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>— Pago en efectivo: no requiere comprobante.</p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>— Sin comprobante adjunto.</p>
            )}
          </div>

          {/* Productos, mismo estilo de filas alternas que usa Ventas. */}
          <div className="modal-seccion">
            <div className="modal-seccion__titulo">Productos ({productos.length})</div>
            {productos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Sin productos registrados.</p>
            ) : productos.map((x, i) => {
              const nombre = x.nombre || (typeof x === 'string' ? x : 'Producto');
              const cant = x.cantidad || 1;
              const base = Number(x.precio ?? x.precioBase ?? 0);
              const extras = extrasDeItem(x);
              const unit = base + extras.reduce((s, e) => s + e.precio * (e.cantidad || 1), 0);
              const sub  = x.precioTotal ? Number(x.precioTotal) * cant
                          : x.precioFinal ? Number(x.precioFinal) * cant
                          : unit * cant;
              return (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--bg-hover)' : 'transparent', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {nombre}
                      {cant > 1 && (
                        <span style={{ background: 'var(--color-green)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, marginLeft: 6, fontWeight: 700 }}>x{cant}</span>
                      )}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--color-green)', whiteSpace: 'nowrap' }}>{fmt(sub)}</span>
                  </div>
                  {base > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 12, marginTop: 3 }}>
                      <span>Producto base</span><span>{fmt(base)}</span>
                    </div>
                  )}
                  {extras.map((e, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 12, marginTop: 3 }}>
                      <span>+ {e.nombre}{e.cantidad > 1 ? ` x${e.cantidad}` : ''}</span>
                      <span style={{ color: e.precio > 0 ? '#F57F17' : 'var(--color-green)' }}>{e.precio ? `+${fmt(e.precio * (e.cantidad || 1))}` : 'Incluido'}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {puedeVerificar && (
            <div className="modal-seccion" style={{ background: 'rgba(173,20,87,0.1)', border: '1px solid rgba(173,20,87,0.25)' }}>
              <p style={{ margin: 0, color: '#AD1457', fontSize: 12.5, fontWeight: 600 }}>
                ⚠ Verifica el comprobante de pago para continuar. El pedido no puede pasar a "En proceso" hasta aprobarlo.
              </p>
            </div>
          )}

          <div className="modal-pie">
            {puedeVerificar ? (
              <>
                {/* Pie de modal: se usan los botones de confirmación estándar
                    (los mismos de Insumos, Compras, Ventas…), no los de acción
                    de tabla — .btn-anular y .btn-add pertenecen a las filas. */}
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