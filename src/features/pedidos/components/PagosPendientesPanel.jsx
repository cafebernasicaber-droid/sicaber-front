// ─────────────────────────────────────────────────────────────
//  src/features/pedidos/components/PagosPendientesPanel.jsx
//
//  "Pagos pendientes" — comprobantes de pago por verificar
//  (estado 'pendiente_verificacion'). Es una PESTAÑA dentro de la
//  vista de Pedidos (PedidosPage), no un módulo aparte: la lista de
//  pedidos y el filtro por local los maneja PedidosPage y se pasan
//  por props.
//
//  Aprobar  → PATCH /pedidos/:id/comprobante/aprobar
//  Rechazar → PATCH /pedidos/:id/comprobante/rechazar  { motivo }
//             El MOTIVO es obligatorio: se le notifica al cliente y
//             queda visible en el detalle de su pedido.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import pedidosService from '../services/pedidosService';
import notificacionesService from '../../notificaciones/services/notificacionesService';
import { ESTADO_CONFIG } from '../data/datos';
import { mensajeErrorEstadoPedido } from '../../../shared/utils/pedidoEstados';
import Tooltip from '../../../shared/components/Tooltip';
import { useAuth } from '../../../shared/contexts/AuthContext';
import ModalDetallePedido from './ModalDetallePedido';

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const METODOS_PAGO_LABEL = { nequi: 'Nequi', transferencia: 'Llave Bancolombia', efectivo: 'Efectivo en caja' };

export default function PagosPendientesPanel({ pedidos, onChanged, showOk, showErr }) {
  const { hasPermiso } = useAuth();
  const [detalle, setDetalle] = useState(null);
  const [rechazoTarget, setRechazoTarget] = useState(null);
  const [rechazoMotivo, setRechazoMotivo] = useState('');

  const pagosPendientes = (pedidos || []).filter(p => p.estado === 'pendiente_verificacion');

  const aprobarPago = async (pedido) => {
    try {
      await pedidosService.aprobarComprobante(pedido.id);
    } catch (err) {
      showErr(mensajeErrorEstadoPedido(err, 'No se pudo aprobar el pago.'));
      return;
    }
    notificacionesService.create({
      clienteId: pedido.cliente_id,
      pedidoId: pedido.id,
      tipo: 'pago_aprobado',
      mensaje: '✅ Tu pago fue aprobado correctamente. Ya estamos preparando tu pedido.',
    });
    showOk(`Pago del pedido #${pedido.id} aprobado`);
    onChanged();
  };

  const abrirRechazo = (pedido) => { setRechazoMotivo(''); setRechazoTarget(pedido); };
  const motivoValido = rechazoMotivo.trim().length >= 5;

  const confirmarRechazo = async () => {
    if (!rechazoTarget || !motivoValido) return;
    const motivo = rechazoMotivo.trim();
    try {
      await pedidosService.rechazarComprobante(rechazoTarget.id, motivo);
    } catch (err) {
      showErr(mensajeErrorEstadoPedido(err, 'No se pudo rechazar el pago.'));
      return;
    }
    notificacionesService.create({
      clienteId: rechazoTarget.cliente_id,
      pedidoId: rechazoTarget.id,
      tipo: 'pago_rechazado',
      mensaje: `❌ Tu pago fue rechazado. Motivo: ${motivo}. Puedes volver a comprar y subir un nuevo comprobante desde "Mis pedidos".`,
    });
    showOk(`Pago del pedido #${rechazoTarget.id} rechazado`);
    setRechazoTarget(null);
    onChanged();
  };

  return (
    <>
      {detalle && (
        <ModalDetallePedido
          pedido={detalle}
          onClose={() => setDetalle(null)}
          onCambiarEstado={() => {}}
          onAprobarPago={(p) => { setDetalle(null); aprobarPago(p); }}
          onRechazarPago={(p) => { setDetalle(null); abrirRechazo(p); }}
        />
      )}

      {rechazoTarget && (
        <div className="modal-overlay" onClick={() => setRechazoTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon modal-icon-danger">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h3>Rechazar pago del pedido #{rechazoTarget.id}</h3>
            <p>Explícale al cliente por qué se rechazó su comprobante. Este motivo <strong>es obligatorio</strong> y se le mostrará en su pedido.</p>
            <textarea
              autoFocus
              style={{ width: '100%', minHeight: 84, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: `1.5px solid ${rechazoMotivo && !motivoValido ? '#E53935' : 'var(--border)'}`, marginTop: 8, background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              placeholder="Ej: El valor del comprobante no coincide con el total del pedido."
              value={rechazoMotivo}
              onChange={e => setRechazoMotivo(e.target.value)}
            />
            {rechazoMotivo && !motivoValido && (
              <div style={{ fontSize: 12, color: '#E53935', marginTop: 4, textAlign: 'left' }}>Escribe un motivo de al menos 5 caracteres.</div>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setRechazoTarget(null)}>Cancelar</button>
              <button className="btn-confirm-danger" onClick={confirmarRechazo} disabled={!motivoValido} style={!motivoValido ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>✕ Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}

      {pagosPendientes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <h3>No hay pagos por verificar</h3>
          <p>Cuando un cliente suba un comprobante de pago, aparecerá aquí para que lo apruebes o lo rechaces.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="insumos-table pd-table-compact">
            <thead>
              <tr><th>N° Pedido</th><th>Cliente</th><th>Método</th><th>Valor</th><th>Fecha</th><th>Hora</th><th>Comprobante</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {pagosPendientes.map(p => {
                const comprobanteImg = p.comprobanteImg || p.comprobante_img || null;
                const fecha = p.created_at ? new Date(p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const hora  = p.hora || (p.created_at ? new Date(p.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—');
                return (
                  <tr key={p.id}>
                    <td className="td-id">#{p.id}</td>
                    <td className="td-nombre">{p.cliente || p.mesa || '—'}</td>
                    <td>{METODOS_PAGO_LABEL[p.pago] || p.pago || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#2E7D32', fontSize: 13 }}>{fmt(p.total)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fecha}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hora}</td>
                    <td>
                      {comprobanteImg ? (
                        <img src={comprobanteImg} alt="Comprobante" onClick={() => window.open(comprobanteImg, '_blank')}
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)', cursor: 'zoom-in' }}/>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin imagen</span>
                      )}
                    </td>
                    <td><span className="pd-badge" style={{ background: ESTADO_CONFIG.pendiente_verificacion.bg, color: ESTADO_CONFIG.pendiente_verificacion.color }}>{ESTADO_CONFIG.pendiente_verificacion.label}</span></td>
                    <td>
                      <div className="actions-group">
                        {hasPermiso('pedidos', 'ver') && (
                          <Tooltip label="Ver detalle">
                            <button className="btn-ver" onClick={() => setDetalle(p)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          </Tooltip>
                        )}
                        {hasPermiso('pedidos', 'gestionar') && (
                          <>
                            <button className="btn-anular" title="Rechazar pago" onClick={() => abrirRechazo(p)}>✕ Rechazar</button>
                            <button className="btn-add" title="Aprobar pago" onClick={() => aprobarPago(p)}>✓ Aprobar</button>
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
    </>
  );
}
