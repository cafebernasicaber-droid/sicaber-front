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
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';

import { etiquetaEstadoPedido, configEstadoPedido } from '../../../shared/utils/pedidoEstados';

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
  const productos     = Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []);
  const comprobanteImg = pedido.comprobanteImg || pedido.comprobante_img || null;
  const motivoRechazo  = pedido.comprobante_motivo_rechazo || pedido.comprobanteMotivoRechazo || null;
  const direccionAlt   = pedido.direccion_alternativa || pedido.direccionAlternativa || null;

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="pd-modal-head">
          <div>
            <div className="pd-modal-eyebrow">Pedido</div>
            <div className="pd-modal-id">#{pedido.id}</div>
          </div>
          <span className="pd-badge" style={{ background: cfg.bg, color: cfg.color }}>{estadoLabel}</span>
        </div>
        <div className="pd-modal-grid">
          {[
            ['Cliente',        pedido.cliente      || pedido.mesa || '—', true],
            ['Tipo',           pedido.tipo === 'domicilio' ? 'A domicilio' : 'En local'],
            ['Local',          pedido.sede          || '—'],
            ['Método de pago', pedido.pago          || '—'],
            ['Hora',           pedido.hora || (pedido.created_at ? new Date(pedido.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—')],
            ['Atendido por',   pedido.barista       || '—'],
            ['Domiciliario',   pedido.tipo === 'domicilio' ? (pedido.domiciliario || '—') : 'N/A'],
          ].map(([label, val, bold], i) => (
            <div className="pd-info-card" key={i}>
              <div className="pd-info-label">{label}</div>
              <div className="pd-info-val" style={bold ? { fontWeight: 700 } : {}}>{val}</div>
            </div>
          ))}
        </div>

        {pedido.tipo === 'domicilio' && direccionAlt && (
          <div className="pd-info-card" style={{ marginBottom: 14 }}>
            <div className="pd-info-label">Dirección de entrega indicada por el cliente</div>
            <div className="pd-info-val">{direccionAlt}</div>
          </div>
        )}

        <div className="pd-total-card">
          <span className="pd-info-label">Total</span>
          <span className="pd-total-amt">{fmt(pedido.total)}</span>
        </div>

        {motivoRechazo && (
          <div className="pd-info-card" style={{ marginBottom: 14, background: 'rgba(183,28,28,0.08)', border: '1px solid rgba(183,28,28,0.25)' }}>
            <div className="pd-info-label" style={{ color: '#B71C1C' }}>Motivo del rechazo del comprobante</div>
            <div className="pd-info-val">{motivoRechazo}</div>
          </div>
        )}

        {pedido.comprobante && (
          <div className="pd-info-card" style={{ marginBottom: 14 }}>
            <div className="pd-info-label">Comprobante de pago</div>
            <div className="pd-info-val">{pedido.comprobante}</div>
            {comprobanteImg && (
              <img src={comprobanteImg} alt="Comprobante"
                style={{ marginTop: 10, width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'zoom-in', background: '#fafafa' }}
                onClick={() => window.open(comprobanteImg, '_blank')}/>
            )}
          </div>
        )}

        <div className="pd-productos-section">
          <div className="pd-info-label" style={{ marginBottom: 10 }}>Detalle del pedido</div>
          {productos.length > 0
            ? productos.map((x, i) => {
                const nombre = x.nombre || (typeof x === 'string' ? x : 'Producto');
                const cant = x.cantidad || 1;
                const base = Number(x.precio ?? x.precioBase ?? 0);
                const extras = extrasDeItem(x);
                const unit = base + extras.reduce((s, e) => s + e.precio * (e.cantidad || 1), 0);
                const sub  = x.precioTotal ? Number(x.precioTotal) * cant
                            : x.precioFinal ? Number(x.precioFinal) * cant
                            : unit * cant;
                return (
                  <div key={i} className={`pd-prod-row ${i % 2 === 0 ? 'pd-prod-row-alt' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span className="pd-prod-name">
                        {nombre}
                        <span className="pd-prod-qty-badge">x{cant}</span>
                      </span>
                      <span className="pd-prod-sub">{fmt(sub)}</span>
                    </div>
                    {base > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Producto base</span><span>{fmt(base)}</span>
                      </div>
                    )}
                    {extras.map((e, j) => (
                      <div key={j} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>+ {e.nombre}{e.cantidad > 1 ? ` x${e.cantidad}` : ''}</span>
                        <span>{e.precio ? `+${fmt(e.precio * (e.cantidad || 1))}` : 'Incluido'}</span>
                      </div>
                    ))}
                  </div>
                );
              })
            : <p className="pd-no-prods">Sin productos registrados</p>
          }
        </div>

        {pedido.estado === 'pendiente_verificacion' && onCambiarEstado && puedeGestionar && (
          <div style={{ background: 'rgba(173,20,87,0.1)', color: '#AD1457', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12.5, fontWeight: 600 }}>
            ⚠ Verifica el comprobante de pago para continuar. El pedido no puede pasar a "En proceso" hasta aprobarlo.
          </div>
        )}
        <div className="pd-modal-actions">
          {pedido.estado === 'pendiente_verificacion' && onCambiarEstado && puedeGestionar ? (
            <>
              <button className="btn-anular" onClick={() => { onClose(); onRechazarPago ? onRechazarPago(pedido) : onCambiarEstado(pedido.id, 'cancelado'); }}>✕ Rechazar pago</button>
              <button className="btn-add" onClick={() => { onClose(); onAprobarPago ? onAprobarPago(pedido) : onCambiarEstado(pedido.id, 'en_proceso'); }}>✓ Aprobar pago</button>
            </>
          ) : (
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
          )}
        </div>
      </div>
    </div>
  );
}
