import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import pedidosService      from '../../pedidos/services/pedidosService';
import devolucionesService from '../../devoluciones/services/devolucionesService';
import ventasService       from '../../ventas/services/ventasService';
import notificacionesService from '../../notificaciones/services/notificacionesService';
// 4 — para mostrar los insumos de la ficha técnica en el detalle del
// pedido, igual que ya lo hace Bartender (mismo criterio de solo-lectura).
import fichasTecnicasService from '../../fichasTecnicas/services/fichasTecnicasService';
import insumosService        from '../../insumos/services/insumosService';
import DomiciliosBell      from '../../../shared/components/DomiciliosBell';
import PedidoBuilder       from '../../pedidos/components/PedidoBuilder';
import {
  filtrarEstadosPedidoDisponibles, esEstadoPedidoTerminal,
  normalizarEstadoPedido, mensajeErrorEstadoPedido, etiquetaEstadoPedido,
  ESTADO_PEDIDO_CFG, configEstadoPedido,
} from '../../../shared/utils/pedidoEstados';
import './CajeroPage.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';
const fmtHora  = iso => iso ? new Intl.DateTimeFormat('es-CO',{timeStyle:'short'}).format(new Date(iso)) : '—';

// Secuencia NUEVA: Pendiente → En proceso → En camino → Entregado (se quitó
// "Listo"). El estado "preparado" ahora es 'en_camino' — se muestra como
// "En camino" (domicilio) o "Listo para recoger" (local); usar
// etiquetaEstadoPedido(estado, tipo) para el texto exacto.
// STATUS_CFG conserva el nombre para no tocar los ~6 usos de este archivo,
// pero ya no es una tabla propia: es la fuente única compartida con el Admin.
// Antes eran dos tablas distintas que se habían desincronizado (ver el
// comentario en shared/utils/pedidoEstados.js).
const STATUS_CFG = ESTADO_PEDIDO_CFG;

const DEV_EST_CFG = {
  pendiente: { bg:'#FFF8E1', color:'#F57F17', label:'Pendiente', ico:'⏳' },
  aprobada:  { bg:'#E8F5E9', color:'#2E7D32', label:'Aprobada',  ico:'✅' },
  rechazada: { bg:'#FFEBEE', color:'#C62828', label:'Rechazada', ico:'❌' },
};

const FILTERS   = ['all', 'pendiente_verificacion', 'pendiente', 'en_proceso', 'en_camino', 'pagado'];
// 1 — unificado con los métodos de pago de la Landing pública (ver
// src/landing/Landing.jsx, const METODOS de PedidoWizard) para que el
// cajero registre el cobro con el mismo vocabulario que ve el cliente.
// Exactamente 3: Efectivo, Nequi, Transferencia — sin Tarjeta ni ningún
// otro valor suelto.
const METODOS   = ['Efectivo', 'Nequi', 'Transferencia'];
const PAGE_SIZE = 6;

// 7 — la secuencia oficial de estados del pedido vive ahora en
// shared/utils/pedidoEstados.js (espeja la del backend, con 'en_proceso' —
// no 'en_preparacion'). Un cajero puede avanzar o saltar pasos, nunca
// retroceder; 'cancelado' es una salida aparte disponible salvo cuando el
// pedido ya está entregado.

// 1 — un pedido en 'pendiente' necesita UNA de estas dos confirmaciones
// antes de poder pasar a "En preparación", según su método de pago — nunca
// las dos, y nunca ninguna otra cosa relacionada con comprobantes si es
// efectivo (ver también el aviso 2 más abajo, punto 1 de la tarea).
//
// BUG CORREGIDO: estos dos helpers leían campos que el backend NUNCA
// devuelve (`cobro_confirmado`, `comprobante_aprobado`). El backend usa una
// única columna `pago_confirmado` (la marca tanto PATCH /:id/confirmar-pago
// como PATCH /:id/comprobante/aprobar). Con el nombre viejo, `cobroYaConfirmado`
// siempre daba false: después de "Confirmar cobro", la tarjeta seguía
// mostrando ese botón y NUNCA aparecía "Estado", así que el cajero no podía
// avanzar el pedido — sin depender de ninguna acción del Admin, era el
// propio frontend el que lo dejaba trancado. Se leen los alias camelCase y
// snake_case por si algún endpoint los expone distinto.
const cobroYaConfirmado = order =>
  !!(order.pago_confirmado ?? order.pagoConfirmado ?? order.cobroConfirmado ?? order.cobro_confirmado);
const comprobanteYaAprobado = order =>
  !!(order.pago_confirmado ?? order.pagoConfirmado ?? order.comprobanteAprobado ?? order.comprobante_aprobado);
const esPagoTransferencia = order => order.pago === 'nequi' || order.pago === 'transferencia';
// Efectivo (o sin método registrado, ej. mostrador) — el cajero confirma
// que ya recibió el dinero en mano. Aplica sin importar quién creó el
// pedido (mostrador, landing en efectivo, o admin), porque en todos esos
// casos nadie más lo confirmó todavía.
const necesitaConfirmarCobro = order => order.estado === 'pendiente' && !esPagoTransferencia(order) && !cobroYaConfirmado(order);
// Nequi/Transferencia — el cliente ya adjuntó su comprobante en su propio
// checkout; acá solo falta que alguien lo apruebe/rechace. Los pedidos que
// vinieron de la Landing por este medio ya pasaron por
// 'pendiente_verificacion' (aprobado ahí) antes de llegar a 'pendiente',
// así que esto solo debería activarse para pedidos creados directo por
// Cajero/Admin sin pasar por ese paso.
const necesitaAprobarComprobantePendiente = order =>
  order.estado === 'pendiente' && esPagoTransferencia(order) && order.origen !== 'landing' && !comprobanteYaAprobado(order);

function OrderCard({ order, onStatus, onPay, onDevolucion, onVerificar, onConfirmarCobro, onDetail, onReclamar }) {
  // Antes: STATUS_CFG[order.estado] || STATUS_CFG.pendiente — sin normalizar
  // y con respaldo a 'pendiente'. Un pedido ANULADO no estaba en la tabla y
  // se le mostraba al cajero como "Pendiente", es decir, un pedido cerrado
  // apareciendo como activo. configEstadoPedido normaliza los valores
  // legados y resuelve la etiqueta según el tipo ("Listo para recoger" en
  // lugar de "En camino" cuando el pedido es para recoger en el local).
  const cfg    = configEstadoPedido(order.estado, order.tipo);
  const isPaid = order.estado === 'pagado';
  const isVerificando = order.estado === 'pendiente_verificacion';
  const faltaCobro = necesitaConfirmarCobro(order);
  const faltaAprobarComprobante = necesitaAprobarComprobantePendiente(order);
  const estadoNorm = normalizarEstadoPedido(order.estado);
  const canPay = estadoNorm === 'en_camino' || estadoNorm === 'entregado';
  const canDev = estadoNorm === 'en_camino' || estadoNorm === 'entregado' || order.estado === 'pagado';
  const prods  = order.productos || order.items || [];
  // Un pedido sin "sede" es uno de cliente (o creado por el Admin) que
  // todavía no ha sido tomado por ningún local — mismo criterio que ya usa
  // Bartender (BartenderCard, sinAsignar). En cuanto un cajero/bartender lo
  // reclama, PATCH /pedidos/:id/tomar le asigna la sede y deja de aparecer
  // como disponible para los demás locales.
  const sinAsignar = !order.sede;
  const isPending  = order.estado === 'pendiente';

  return (
    <div className="cj-card" style={isPaid ? {opacity:0.82} : {}}>
      <div className="cj-card__accent" style={{ background: cfg.color }}/>
      <div className="cj-card__head">
        <div>
          <div className="cj-card__num">Pedido #{order.id}</div>
          <div className="cj-card__client">{order.cliente || '—'}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {/* 4 — receta/insumos del producto, por si el cliente pregunta;
              mismo criterio de solo-lectura que ya usa Bartender. */}
          <button onClick={() => onDetail(order)} title="Ver insumos y receta de este pedido"
            style={{width:26,height:26,borderRadius:'50%',border:'1.5px solid rgba(255,255,255,.15)',background:'transparent',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          {sinAsignar ? (
            <span className="cj-badge" style={{ background: '#E3F2FD', color: '#1565C0' }}>🔓 Sin local</span>
          ) : (
            <span className="cj-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          )}
        </div>
      </div>
      <div className="cj-card__items">
        {prods.slice(0, 4).map((it, i) => {
          const toppingsItem = Array.isArray(it.toppings) ? it.toppings : [];
          // "Incluidos por defecto" = toppings sin costo adicional (gratuitos);
          // "adicionales" = los que sí tienen un precio extra, elegidos por el
          // cliente al personalizar el producto. Antes esto no se mostraba en
          // absoluto en la tarjeta del cajero.
          const toppingsIncluidos   = toppingsItem.filter(t => !t.precio || t.gratuito);
          const toppingsAdicionales = toppingsItem.filter(t => t.precio && !t.gratuito);
          const adicionesItem = Array.isArray(it.adiciones) ? it.adiciones : [];
          return (
            <div key={i} className="cj-card__item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span className="cj-card__qty">{it.cantidad || it.qty || 1}×</span>
                <span className="cj-card__name">{it.nombre || it.name}</span>
                <span className="cj-card__price">{fmt((it.precio || 0) * (it.cantidad || 1))}</span>
              </div>
              {toppingsIncluidos.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 22 }}>
                  Incluye: {toppingsIncluidos.map(t => t.nombre).join(', ')}
                </div>
              )}
              {toppingsAdicionales.length > 0 && (
                <div style={{ fontSize: 11, color: '#2E7D32', paddingLeft: 22 }}>
                  + Toppings extra: {toppingsAdicionales.map(t => t.nombre).join(', ')}
                </div>
              )}
              {adicionesItem.length > 0 && (
                <div style={{ fontSize: 11, color: '#2E7D32', paddingLeft: 22 }}>
                  + Adiciones: {adicionesItem.map(a => a.nombre).join(', ')}
                </div>
              )}
            </div>
          );
        })}
        {prods.length > 4 && <div className="cj-card__more">+{prods.length - 4} más</div>}
      </div>
      <div className="cj-card__foot">
        <span className="cj-card__meta">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {order.hora || (order.fechaCreacion ? new Date(order.fechaCreacion).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—')}
        </span>
        <span className="cj-card__total">{fmt(order.total)}</span>
      </div>
      {/* 1/2 — pago por Nequi/Transferencia sin comprobante aprobado
          todavía: no hay forma de avanzar el estado del pedido (ni
          "Estado" ni "En preparación") hasta aprobarlo — este aviso deja
          claro por qué, en vez de dejar la tarjeta sin explicación. Nunca
          aparece para pedidos en efectivo. */}
      {(isVerificando || faltaAprobarComprobante) && (
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:'#AD1457',margin:'0 18px 8px',padding:'8px 10px',background:'rgba(173,20,87,0.08)',borderRadius:8}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Verifica el comprobante de pago para continuar
        </div>
      )}
      <div className="cj-card__actions">
        {isPending && sinAsignar ? (
          // 4 — pedido creado sin local (ej. desde la Landing, o por el
          // Admin) — el primer cajero/bartender que lo vea lo reclama para
          // su local; deja de estar disponible para los demás en cuanto se
          // confirma (UPDATE atómico en el backend, ver pedidosService.tomar).
          <button className="cj-btn cj-btn--primary" style={{flex:1}} onClick={() => onReclamar(order.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            Reclamar pedido
          </button>
        ) : isVerificando || faltaAprobarComprobante ? (
          // 1 — Nequi/Transferencia: el cliente ya adjuntó su comprobante en
          // su propio checkout, así que acá solo se verifica (aprueba o
          // rechaza) — nunca se le pide al cajero que suba/mande uno nuevo.
          <button className="cj-btn cj-btn--primary" style={{flex:1}} onClick={() => onVerificar(order)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Verificar pago
          </button>
        ) : isPaid ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flex:1,gap:8}}>
            <span style={{fontSize:11,color:'#9575CD',fontWeight:700,letterSpacing:0.3}}>🔒 Ya pagado</span>
            <button className="cj-btn cj-btn--ghost" style={{fontSize:11,padding:'5px 10px'}} onClick={() => onDevolucion(order)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.04"/></svg>
              Devolución
            </button>
          </div>
        ) : faltaCobro ? (
          // 6 — paso obligatorio antes de que el pedido pueda avanzar a
          // preparación: confirmar que el cliente ya pagó (efectivo/local).
          <button className="cj-btn cj-btn--primary" style={{flex:1}} onClick={() => onConfirmarCobro(order)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
            Confirmar cobro
          </button>
        ) : (
          <>
            <button className="cj-btn cj-btn--ghost" onClick={() => onStatus(order)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Estado
            </button>
            {canPay && (
              <button className="cj-btn cj-btn--primary" onClick={() => onPay(order)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
                Cobrar
              </button>
            )}
            {canDev && !canPay && (
              <button className="cj-btn cj-btn--ghost" style={{fontSize:12,padding:'6px 10px'}} onClick={() => onDevolucion(order)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.04"/></svg>
                Devolución
              </button>
            )}
            {!canPay && !canDev && (
              <button className="cj-btn cj-btn--disabled" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
                Pago
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusModal({ order, onClose, onSave }) {
  const [sel, setSel]           = useState(order?.estado || 'pendiente');
  const [razonCancel, setRazon] = useState('');
  useEffect(() => { if (order) { setSel(normalizarEstadoPedido(order.estado)); setRazon(''); } }, [order]);
  if (!order || order.estado === 'pagado') return null;
  // 7 — el desplegable solo ofrece el estado ACTUAL y los posteriores de la
  // secuencia (nunca los anteriores). 'cancelado' se agrega como salida
  // aparte salvo que el pedido ya sea terminal. Un pedido 'entregado' queda
  // BLOQUEADO: se muestran todos los estados pero deshabilitados.
  const bloqueado = esEstadoPedidoTerminal(order.estado);
  const secuencia = ['pendiente', 'en_proceso', 'en_camino', 'entregado'];
  const disponibles = filtrarEstadosPedidoDisponibles(order.estado, secuencia);
  const opts = bloqueado ? secuencia : [...disponibles, 'cancelado'];
  // 6 — mientras no se confirme el cobro (pedidos de mostrador/efectivo en
  // 'pendiente'), la opción de pasar a "En proceso" queda deshabilitada.
  const faltaCobro = necesitaConfirmarCobro(order);
  const optDeshabilitada = (s) => bloqueado || (faltaCobro && normalizarEstadoPedido(s) === 'en_proceso');
  const guardarDeshabilitado = bloqueado || (faltaCobro && normalizarEstadoPedido(sel) === 'en_proceso');
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Actualizar Estado</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          {bloqueado && (
            <div style={{background:'rgba(126,87,194,0.12)',border:'1px solid rgba(126,87,194,0.35)',color:'#5E35B1',padding:'9px 12px',borderRadius:8,fontSize:12,marginBottom:10}}>
              🔒 Este pedido ya fue {STATUS_CFG[normalizarEstadoPedido(order.estado)]?.label?.replace(' ✓','').toLowerCase() || 'cerrado'} y no puede cambiar de estado.
            </div>
          )}
          {!bloqueado && faltaCobro && (
            <div style={{background:'rgba(255,179,0,0.12)',border:'1px solid rgba(255,179,0,0.35)',color:'#F57F17',padding:'9px 12px',borderRadius:8,fontSize:12,marginBottom:10}}>
              ⚠ Confirma el cobro de este pedido antes de pasarlo a "En proceso".
            </div>
          )}
          <div className="cj-status-options">
            {opts.map(s => {
              const cfg = STATUS_CFG[s];
              const disabled = optDeshabilitada(s);
              return (
                <div key={s} className={`cj-status-opt ${sel===s?'selected':''}`} onClick={() => !disabled && setSel(s)}
                  title={disabled ? (bloqueado ? 'El pedido ya fue entregado' : 'Confirma el cobro primero') : undefined}
                  style={{
                    ...(sel===s ? {borderColor:cfg.color,background:cfg.bg} : {}),
                    ...(disabled ? {opacity:0.4,cursor:'not-allowed'} : {}),
                  }}>
                  <span className="cj-status-dot" style={{background:cfg.color}}/>
                  {s === 'cancelado' ? 'Cancelado' : etiquetaEstadoPedido(s, order.tipo)}
                  {sel===s && <span className="cj-status-check">✓</span>}
                </div>
              );
            })}
          </div>
          {!bloqueado && sel === 'cancelado' && (
            <div style={{marginTop:4}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5}}>
                Razón de cancelación <span style={{fontWeight:400,textTransform:'none'}}>(opcional)</span>
              </label>
              <textarea value={razonCancel} onChange={e => setRazon(e.target.value)}
                placeholder="Ej: Cliente desistió, error en el pedido..." rows={2}
                style={{width:'100%',background:'var(--bg-surface-3)',border:'1.5px solid var(--border-input)',borderRadius:8,color:'var(--text-primary)',fontSize:13,padding:'10px 12px',resize:'vertical',fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" disabled={guardarDeshabilitado}
            title={bloqueado ? 'El pedido ya fue entregado' : (faltaCobro && normalizarEstadoPedido(sel) === 'en_proceso') ? 'Confirma el cobro antes de pasar a preparación' : undefined}
            onClick={() => { if (guardarDeshabilitado) return; onSave(sel, razonCancel.trim()); onClose(); }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// 6 — confirmación del cobro en efectivo/local, paso obligatorio antes de
// que el pedido pueda pasar a "En preparación" (ver necesitaConfirmarCobro).
function ConfirmCobroModal({ order, onClose, onConfirm }) {
  if (!order) return null;
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal cj-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Confirmar cobro</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <div className="cj-pay-total"><span>Total a cobrar</span><strong>{fmt(order.total)}</strong></div>
          <p style={{fontSize:13,color:'var(--text-secondary)',margin:0}}>
            Confirma que ya recibiste el pago de este pedido. Solo después de esto podrá pasar a <strong>En preparación</strong>.
          </p>
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" onClick={onConfirm}>✓ Confirmar cobro</button>
        </div>
      </div>
    </div>
  );
}

// 4 — detalle de solo lectura del pedido: para cada producto muestra los
// insumos de su ficha técnica (nombre + cantidad) y, aparte, los
// toppings/adiciones elegidos para ESA unidad — mismo criterio que ya usa
// el detalle del Bartender, para que el cajero pueda responder si el
// cliente pregunta qué lleva el producto, sin tener que llamar a nadie.
// 5 — pedidos a domicilio: dirección completa + Aceptar/Rechazar, para que
// el cajero/domiciliario que lo ve decida si le queda bien logísticamente
// antes de comprometerse a entregarlo.
// - "Aceptar" → PATCH /pedidos/:id/aceptar-domicilio: la entrega queda a su
//   nombre (domiciliario_id); si otro ya la aceptó, el backend responde 409.
// - "Rechazar" → si ya la había aceptado, la libera (rechazar-domicilio,
//   vuelve a quedar disponible); si nadie la ha aceptado todavía, "rechazar"
//   significa que ESTE pedido no se puede entregar desde acá — se cancela
//   con motivo (mismo mecanismo que "Anular pedido" en Administración), no
//   hay un estado de negocio "rechazado" aparte en el backend.
function DomicilioBlock({ order, onAceptar, onRechazar }) {
  if (order.tipo !== 'domicilio') return null;
  const direccion = order.direccionAlternativa || order.direccion_alternativa || 'Sin dirección registrada';
  const yaAceptadoPorMi = !!order.domiciliario_id;
  return (
    <div style={{background:'rgba(66,165,245,0.08)',border:'1px solid rgba(66,165,245,0.25)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,color:'#42A5F5',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Entrega a domicilio
      </div>
      <div style={{fontSize:13,color:'var(--text-primary)',fontWeight:600,marginBottom:10}}>{direccion}</div>
      <div style={{display:'flex',gap:8}}>
        {!yaAceptadoPorMi ? (
          <>
            <button className="cj-btn cj-btn--primary" style={{flex:1}} onClick={() => onAceptar(order)}>✓ Aceptar</button>
            <button className="cj-btn cj-btn--danger" style={{flex:1}} onClick={() => onRechazar(order)}>✕ Rechazar</button>
          </>
        ) : (
          <button className="cj-btn cj-btn--danger" style={{flex:1}} onClick={() => onRechazar(order)}>✕ Liberar entrega</button>
        )}
      </div>
    </div>
  );
}

function PedidoDetalleModal({ order, onClose, onAceptarDomicilio, onRechazarDomicilio }) {
  const [productosConFicha, setProductosConFicha] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(() => setInsumos([]));
  }, []);

  useEffect(() => {
    if (!order) return;
    setCargando(true);
    const productos = order.productos || order.items || [];
    let cancelado = false;
    Promise.all(
      productos.map(it =>
        fichasTecnicasService.getByProducto(Number(it.id) || Number(it.id_producto))
          .then(ficha => ({ ...it, ficha }))
          .catch(() => ({ ...it, ficha: null }))
      )
    ).then(resultado => {
      if (!cancelado) { setProductosConFicha(resultado); setCargando(false); }
    });
    return () => { cancelado = true; };
  }, [order]);

  if (!order) return null;
  const nombreInsumo = id => insumos.find(i => i.id === id || String(i.id) === String(id))?.nombre || `Insumo #${id}`;

  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" style={{maxWidth:520,maxHeight:'85vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Insumos del pedido</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <DomicilioBlock order={order} onAceptar={onAceptarDomicilio} onRechazar={onRechazarDomicilio} />
          {cargando ? (
            <p style={{fontSize:13,color:'var(--text-muted)'}}>Cargando...</p>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {productosConFicha.map((it, i) => {
                const fichaInsumos = it.ficha?.insumos || [];
                const toppings  = Array.isArray(it.toppings) ? it.toppings : [];
                const adiciones = Array.isArray(it.adiciones) ? it.adiciones : [];
                return (
                  <div key={i} style={{background:'var(--bg-surface-3, rgba(255,255,255,.03))',borderRadius:10,padding:'12px 14px',border:'1px solid rgba(255,255,255,.07)'}}>
                    <div style={{fontWeight:700,fontSize:13,color:'var(--text-primary)',marginBottom:6}}>
                      {it.cantidad || it.qty || 1}× {it.nombre || it.name}
                    </div>
                    {!it.ficha ? (
                      <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>Sin ficha técnica activa registrada.</p>
                    ) : fichaInsumos.length === 0 ? (
                      <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>Esta ficha no tiene insumos registrados.</p>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        {fichaInsumos.map((ins, j) => (
                          <div key={j} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)'}}>
                            <span>{nombreInsumo(ins.id_insumo)}</span>
                            <strong style={{color:'var(--text-primary)'}}>{ins.cantidad} {ins.unidad}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {(toppings.length > 0 || adiciones.length > 0) && (
                      <div style={{marginTop:8,paddingTop:8,borderTop:'1px dashed rgba(255,255,255,.1)',fontSize:12}}>
                        {toppings.length > 0 && <div style={{color:'var(--text-secondary)'}}>🧋 Toppings: {toppings.map(t=>t.nombre).join(', ')}</div>}
                        {adiciones.length > 0 && <div style={{color:'#2E7D32',marginTop:2}}>➕ Adiciones: {adiciones.map(a=>a.nombre).join(', ')}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ order, onClose, onConfirm }) {
  const [method, setMethod] = useState(null);
  useEffect(() => { setMethod(null); }, [order]);
  if (!order) return null;
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Confirmar Pago</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <div className="cj-pay-total"><span>Total a cobrar</span><strong>{fmt(order.total)}</strong></div>
          <p className="cj-pay-label">Método de pago</p>
          <div className="cj-pay-methods">
            {METODOS.map(m => (
              <div key={m} className={`cj-pay-method ${method===m?'selected':''}`} onClick={() => setMethod(m)}>
                {m}{method===m && <span className="cj-status-check">✓</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" disabled={!method} onClick={() => method && onConfirm(method)}>Confirmar pago</button>
        </div>
      </div>
    </div>
  );
}

function DevConfirmModal({ dev, accion, onClose, onConfirm, venta }) {
  const esAprobar = accion === 'aprobar';
  // El backend ahora exige un motivo al rechazar una devolución y lo guarda
  // en devoluciones.motivo_rechazo. Sin este campo el cajero mandaría el
  // PATCH sin motivo y recibiría un 400: el rechazo dejaría de funcionar.
  // Mismo requisito y mismo mínimo que en el panel de Admin.
  const [motivo, setMotivo] = useState('');
  const [errMotivo, setErrMotivo] = useState('');
  const MIN_MOTIVO = 10;

  const confirmar = () => {
    if (esAprobar) return onConfirm();
    const limpio = motivo.trim();
    if (limpio.length < MIN_MOTIVO) {
      setErrMotivo(`El motivo debe tener al menos ${MIN_MOTIVO} caracteres.`);
      return;
    }
    onConfirm(limpio);
  };

  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal cj-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>{esAprobar ? 'Aprobar devolución' : 'Rechazar devolución'}</h3><p>Devolución #{dev.id}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <p style={{color:'var(--text-secondary)',fontSize:13,margin:0}}>
            {esAprobar
              ? <>Al aprobar, la venta <strong style={{color:'var(--text-primary)'}}>#{dev.pedido_id} de {venta?.cliente}</strong> quedará como <strong style={{color:'#81C784'}}>Devuelta</strong>.</>
              : <>Al rechazar, la venta <strong style={{color:'var(--text-primary)'}}>#{dev.pedido_id} de {venta?.cliente}</strong> recuperará el estado <strong style={{color:'#EF9A9A'}}>Vendida</strong>.</>
            }
          </p>

          {!esAprobar && (
            <div style={{marginTop:14}}>
              <label style={{display:'block',fontSize:12.5,fontWeight:600,color:'var(--text-primary)',marginBottom:6}}>
                Motivo del rechazo <span style={{color:'#EF5350'}}>*</span>
              </label>
              <textarea value={motivo} rows={3} autoFocus
                onChange={e => { setMotivo(e.target.value); if (errMotivo) setErrMotivo(''); }}
                placeholder="Explica por qué se rechaza esta devolución (mínimo 10 caracteres)..."
                style={{width:'100%',padding:'9px 12px',borderRadius:8,fontSize:13,resize:'vertical',boxSizing:'border-box',
                  border:`1.5px solid ${errMotivo ? '#EF5350' : 'var(--border-input)'}`,
                  background:'var(--bg-hover)',color:'var(--text-primary)',outline:'none'}}/>
              {errMotivo && <div style={{fontSize:11,color:'#EF5350',marginTop:4}}>{errMotivo}</div>}
              <p style={{fontSize:11,color:'var(--text-muted)',marginTop:6,marginBottom:0}}>
                Queda guardado y se muestra en el detalle de la devolución.
              </p>
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          {esAprobar
            ? <button className="cj-btn cj-btn--primary" onClick={confirmar}>✅ Aprobar</button>
            : <button className="cj-btn" style={{background:'#C62828',color:'#fff',border:'none'}} onClick={confirmar}>❌ Rechazar</button>
          }
        </div>
      </div>
    </div>
  );
}

function DevRegistrarModal({ pedido, onClose, onSave }) {
  const productos   = pedido?.productos || [];
  const tieneVarios = productos.length >= 2;
  const [productosSelec, setProdsSelec] = useState(productos);
  const [motivo, setMotivo]             = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  const toggleProducto = prod =>
    setProdsSelec(prev =>
      prev.find(p => p.id === prod.id) ? prev.filter(p => p.id !== prod.id) : [...prev, prod]
    );

  const montoDevolucion = tieneVarios
    ? productosSelec.reduce((s, p) => s + (p.precioTotal || p.precio || 0) * (p.cantidad || 1), 0)
    : pedido?.total || 0;

  const esParcial      = tieneVarios && productosSelec.length > 0 && productosSelec.length < productos.length;
  const tipoDevolucion = !tieneVarios ? 'total' : esParcial ? 'parcial' : 'total';

  const handleSubmit = async () => {
    setError('');
    if (tieneVarios && productosSelec.length === 0) { setError('Selecciona al menos un producto a devolver'); return; }
    if (!motivo.trim() || motivo.trim().length < 10) { setError('El motivo debe tener al menos 10 caracteres'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    try {
      const rv = await ventasService.crearDesde(pedido.id);
      if (!rv || rv.error) { setError('No se pudo vincular la venta: ' + (rv?.error || 'Error desconocido')); setLoading(false); return; }
      // El backend espera pedido_id / monto / items (no id_venta / monto_devolucion /
      // productos_devueltos), o el INSERT queda con pedido_id nulo y nunca se
      // vuelve a poder relacionar la devolución con su venta.
      const r = await devolucionesService.create({
        pedido_id: pedido.id, motivo: motivo.trim(), tipo: tipoDevolucion,
        items: tieneVarios ? productosSelec : productos, monto: montoDevolucion,
      });
      if (r && r.error) { setError(r.error); setLoading(false); return; }
      setLoading(false);
      onSave();
    } catch(e) { setError(e.message || 'Error al registrar'); setLoading(false); }
  };

  if (!pedido) return null;
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" style={{maxWidth:500,maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Registrar devolución</h3><p>Pedido #{pedido.id} · {pedido.cliente} · {fmt(pedido.total)}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body" style={{gap:14}}>
          {error && <div style={{background:'rgba(239,83,80,0.15)',color:'#EF9A9A',padding:'10px 14px',borderRadius:8,fontSize:13}}>⚠ {error}</div>}
          {tieneVarios && (
            <div style={{background:'var(--bg-hover)',borderRadius:10,padding:'14px 16px',border:'1.5px solid var(--border-input)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <label style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5}}>Productos a devolver *</label>
                <div style={{display:'flex',gap:8}}>
                  <button type="button" onClick={() => setProdsSelec(productos)} style={{fontSize:11,fontWeight:700,color:'#81C784',background:'none',border:'none',cursor:'pointer'}}>Todos</button>
                  <button type="button" onClick={() => setProdsSelec([])} style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer'}}>Ninguno</button>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {productos.map((p, i) => {
                  const sel = !!productosSelec.find(x => x.id === p.id);
                  const subtotal = (p.precioTotal || p.precio || 0) * (p.cantidad || 1);
                  return (
                    <label key={p.id||i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,cursor:'pointer',background:sel?'rgba(76,175,80,0.12)':'rgba(255,255,255,0.03)',border:`1.5px solid ${sel?'#4CAF50':'rgba(255,255,255,0.1)'}`}}>
                      <input type="checkbox" checked={sel} onChange={() => toggleProducto(p)} style={{width:15,height:15,accentColor:'#4CAF50',cursor:'pointer',flexShrink:0}}/>
                      <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{p.nombre || p}{p.cantidad > 1 && <span style={{marginLeft:6,background:'#4CAF50',color:'white',padding:'1px 5px',borderRadius:4,fontSize:10,fontWeight:700}}>x{p.cantidad}</span>}</span>
                      {subtotal > 0 && <span style={{fontSize:12,fontWeight:700,color:sel?'#81C784':'rgba(255,255,255,0.4)'}}>{fmt(subtotal)}</span>}
                    </label>
                  );
                })}
              </div>
              {productosSelec.length > 0 && (
                <div style={{marginTop:10,padding:'8px 12px',background:'rgba(76,175,80,0.08)',borderRadius:8,border:'1px solid rgba(76,175,80,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)'}}>{productosSelec.length} de {productos.length} · <strong style={{color:'#81C784'}}>{esParcial?'Parcial':'Total'}</strong></span>
                  <span style={{fontSize:13,fontWeight:800,color:'#81C784'}}>{fmt(montoDevolucion)}</span>
                </div>
              )}
            </div>
          )}
          {!tieneVarios && (
            <div style={{background:'rgba(255,183,77,0.1)',borderRadius:8,padding:'12px 16px',fontSize:13,border:'1px solid rgba(255,183,77,0.25)',color:'#FFD54F'}}>
              ⚡ Se devolverá el total del pedido: <strong>{fmt(pedido.total)}</strong>
            </div>
          )}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5}}>Motivo *</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el motivo de la devolución (mínimo 10 caracteres)..." rows={3}
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',background:'var(--bg-surface-3)',color:'var(--text-primary)',boxSizing:'border-box'}}/>
          </div>
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" disabled={loading} onClick={handleSubmit}>{loading ? '⏳ Registrando...' : '↩ Registrar devolución'}</button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
//  VentasTab — módulo de Ventas dentro de la vista del Cajero
//
//  El Cajero es quien cobra, así que necesita poder consultar lo vendido
//  sin salir de su pantalla: hasta ahora Ventas solo existía en el panel
//  de Admin (/ventas), una ruta que además está protegida por permiso.
//
//  Replica las funciones básicas del módulo del Admin —contadores,
//  búsqueda, filtro por estado, tabla paginada y detalle de la venta—
//  usando el mismo estilo visual que DevolucionesTab, que es el patrón
//  que ya sigue esta pantalla.
//
//  Diferencia deliberada con el Admin: NO se ofrece "registrar venta
//  manualmente". La venta se crea sola cuando el pedido pasa a entregado
//  (crearVentaDesdePedido en el backend, dentro de la misma transacción
//  que descuenta el inventario). Dejar que el cajero la cree a mano
//  abriría la puerta a ventas duplicadas sobre el mismo pedido.
//
//  El filtro por local es el mismo `sedeFiltro` que ya usan los otros
//  tabs: un cajero de un local nunca ve las ventas de otro.
// ─────────────────────────────────────────────────────────────
const VENTA_EST_CFG = {
  vendido:  { bg:'#E8F5E9', color:'#2E7D32', label:'Vendido'  },
  devuelto: { bg:'#FFEBEE', color:'#C62828', label:'Devuelto' },
};

function ModalDetalleVentaCajero({ venta, onClose }) {
  const prods = Array.isArray(venta.productos) ? venta.productos : [];
  const cfg = VENTA_EST_CFG[venta.estado] || {};
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal cj-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div>
            <h3>Venta #{venta.id_venta ?? venta.id}</h3>
            <p>Pedido #{venta.id_pedido ?? venta.pedido_id} · {venta.cliente || 'Sin cliente'}</p>
          </div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            {[
              ['Fecha',  fmtFechaHoraVenta(venta.fecha)],
              ['Método', venta.metodo_pago || '—'],
              ['Tipo',   venta.tipo_venta || '—'],
              ['Local',  venta.sede || '—'],
            ].map(([k,v]) => (
              <div key={k}>
                <div style={{fontSize:10.5,textTransform:'uppercase',letterSpacing:0.5,color:'var(--text-muted)',fontWeight:700}}>{k}</div>
                <div style={{fontSize:13,color:'var(--text-primary)',marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:10.5,textTransform:'uppercase',letterSpacing:0.5,color:'var(--text-muted)',fontWeight:700,marginBottom:6}}>Productos</div>
          {prods.length === 0 ? (
            <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>Sin productos registrados.</p>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {prods.map((it,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13,color:'var(--text-secondary)'}}>
                  <span>{(it.cantidad ? it.cantidad + '× ' : '') + (it.nombre || String(it))}</span>
                  {it.precio != null && <span style={{color:'var(--text-primary)',fontWeight:600}}>{fmtMoneda((it.precio||0)*(it.cantidad||1))}</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-input)'}}>
            <span style={{background:cfg.bg,color:cfg.color,padding:'4px 12px',borderRadius:100,fontSize:12,fontWeight:700}}>{cfg.label || venta.estado}</span>
            <strong style={{fontSize:18,color:'#2E7D32'}}>{fmtMoneda(venta.total)}</strong>
          </div>
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

const fmtMoneda = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
const fmtFechaHoraVenta = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(d);
};

function VentasTab({ sedeFiltro }) {
  const [ventas, setVentas] = useState([]);
  const [query, setQuery]   = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState(null);
  const POR_PAG = 8;

  useEffect(() => {
    ventasService.getAll(sedeFiltro)
      .then(d => setVentas(Array.isArray(d) ? d : []))
      .catch(() => setVentas([]));
  }, [sedeFiltro]);

  const stats = {
    total:    ventas.length,
    vendido:  ventas.filter(v => v.estado === 'vendido').length,
    devuelto: ventas.filter(v => v.estado === 'devuelto').length,
    ingresos: ventas.filter(v => v.estado === 'vendido').reduce((s,v) => s + (Number(v.total)||0), 0),
  };

  const lq = query.toLowerCase().trim();
  const filtradas = ventas.filter(v => {
    const mq = !lq
      || String(v.id_venta ?? v.id).includes(lq)
      || String(v.id_pedido ?? v.pedido_id).includes(lq)
      || (v.cliente||'').toLowerCase().includes(lq)
      || (v.metodo_pago||'').toLowerCase().includes(lq);
    const me = filtro === 'todos' || v.estado === filtro;
    return mq && me;
  });
  const ordenadas = [...filtradas].sort((a,b) => (b.id_venta ?? b.id ?? 0) - (a.id_venta ?? a.id ?? 0));
  const totalPags = Math.ceil(ordenadas.length / POR_PAG);
  const paginadas = ordenadas.slice((pagina-1)*POR_PAG, pagina*POR_PAG);

  const statCards = [
    { label:'Total ventas', value: stats.total,    color:'#42A5F5' },
    { label:'Vendidas',     value: stats.vendido,  color:'#4CAF50' },
    { label:'Devueltas',    value: stats.devuelto, color:'#EF5350' },
    { label:'Ingresos',     value: fmtMoneda(stats.ingresos), color:'#2E7D32' },
  ];

  return (
    <div style={{padding:'0 4px'}}>
      {detalle && <ModalDetalleVentaCajero venta={detalle} onClose={() => setDetalle(null)}/>}

      <div style={{marginBottom:16}}>
        <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--text-primary)'}}>Ventas</h2>
        <p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-muted)'}}>
          Las ventas se registran solas cuando el pedido pasa a entregado
        </p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {statCards.map((s,i) => (
          <div key={i} style={{background:'var(--bg-hover)',borderRadius:10,padding:'12px 14px',borderTop:`3px solid ${s.color}`}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:3}}>{s.label}</div>
            <div style={{fontSize: typeof s.value === 'string' ? 17 : 22,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,maxWidth:340}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',pointerEvents:'none'}}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Buscar por cliente, N.º de venta o pedido..." value={query}
            onChange={e => { setQuery(e.target.value); setPagina(1); }}
            style={{width:'100%',padding:'9px 12px 9px 32px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-hover)',color:'var(--text-primary)',boxSizing:'border-box'}}/>
          {query && <button onClick={() => setQuery('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14}}>✕</button>}
        </div>
        <select value={filtro} onChange={e => { setFiltro(e.target.value); setPagina(1); }}
          style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-hover)',color:'var(--text-primary)'}}>
          <option value="todos">Todos los estados</option>
          <option value="vendido">Vendido</option>
          <option value="devuelto">Devuelto</option>
        </select>
        <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:'auto'}}>{filtradas.length} venta{filtradas.length!==1?'s':''}</span>
      </div>

      {paginadas.length === 0 ? (
        <div style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}>
          <div style={{fontSize:32,marginBottom:10}}>🧾</div>
          <h3 style={{margin:'0 0 6px',color:'var(--text-secondary)'}}>{query||filtro!=='todos'?'Sin coincidencias':'No hay ventas todavía'}</h3>
          <p style={{margin:0,fontSize:13}}>{query||filtro!=='todos'?'Prueba con otros filtros':'Se crean al marcar un pedido como entregado'}</p>
        </div>
      ) : (
        <>
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.08)'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'var(--bg-hover)'}}>
                  {['#','Pedido','Cliente','Fecha','Total','Método','Tipo','Estado','Acciones'].map(h => (
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginadas.map(v => {
                  const cfg = VENTA_EST_CFG[v.estado] || {};
                  return (
                    <tr key={v.id_venta ?? v.id} style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                      <td style={{padding:'11px 14px',fontWeight:700,color:'var(--text-primary)'}}>{v.id_venta ?? v.id}</td>
                      <td style={{padding:'11px 14px',fontSize:12,fontWeight:600,color:'var(--text-muted)'}}>#{v.id_pedido ?? v.pedido_id}</td>
                      <td style={{padding:'11px 14px',color:'var(--text-primary)'}}>{v.cliente || '—'}</td>
                      <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{fmtFechaHoraVenta(v.fecha)}</td>
                      <td style={{padding:'11px 14px',fontWeight:700,color:'#2E7D32',whiteSpace:'nowrap'}}>{fmtMoneda(v.total)}</td>
                      <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)'}}>{v.metodo_pago || '—'}</td>
                      <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)'}}>{v.tipo_venta || '—'}</td>
                      <td style={{padding:'11px 14px'}}>
                        <span style={{background:cfg.bg,color:cfg.color,padding:'3px 10px',borderRadius:100,fontSize:11.5,fontWeight:700,whiteSpace:'nowrap'}}>{cfg.label || v.estado}</span>
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        <button className="cj-btn cj-btn--ghost" style={{padding:'4px 10px',fontSize:12}} onClick={() => setDetalle(v)}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPags > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginTop:14}}>
              <button className="cj-btn cj-btn--ghost" style={{padding:'5px 12px',fontSize:12}}
                disabled={pagina===1} onClick={() => setPagina(p => Math.max(1,p-1))}>← Anterior</button>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>Página {pagina} de {totalPags}</span>
              <button className="cj-btn cj-btn--ghost" style={{padding:'5px 12px',fontSize:12}}
                disabled={pagina===totalPags} onClick={() => setPagina(p => Math.min(totalPags,p+1))}>Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DevolucionesTab({ showToast, sedeFiltro }) {
  const [devs, setDevs]       = useState([]);
  const [ventas, setVentas]   = useState([]);
  const [query, setQuery]     = useState('');
  const [filtro, setFiltro]   = useState('todos');
  const [confirm, setConfirm] = useState(null);
  const [pagina, setPagina]   = useState(1);
  const POR_PAG = 8;

  // Igual que el tab de "Pedidos activos": un cajero de Local 1/Local 2 solo
  // debe ver sus propias ventas y devoluciones, nunca las de otro local.
  const refresh = () => {
    devolucionesService.getAll(sedeFiltro).then(d => setDevs(Array.isArray(d) ? d : [])).catch(()=>{});
    ventasService.getAll(sedeFiltro).then(d => setVentas(Array.isArray(d) ? d : [])).catch(()=>{});
  };
  useEffect(() => { refresh(); }, [sedeFiltro]);

  // La devolución guarda pedido_id (no id_venta), y la venta relacionada
  // también se referencia por pedido_id, así que hay que cruzar por ahí.
  const getVenta = (pedidoId) => ventas.find(v => v.pedido_id === pedidoId);

  const stats = {
    pendiente:  devs.filter(d=>d.estado==='pendiente').length,
    aprobada:   devs.filter(d=>d.estado==='aprobada').length,
    rechazada:  devs.filter(d=>d.estado==='rechazada').length,
    total:      devs.length,
  };

  const lq = query.toLowerCase().trim();
  const filtradas = devs.filter(d => {
    const v  = getVenta(d.pedido_id);
    const mq = !lq || String(d.id).includes(lq) || String(d.pedido_id).includes(lq)
               || (v?.cliente||'').toLowerCase().includes(lq)
               || (d.motivo||'').toLowerCase().includes(lq);
    const me = filtro === 'todos' || d.estado === filtro;
    return mq && me;
  });
  const ordenadas = [...filtradas].sort((a,b) => b.id - a.id);
  const totalPags = Math.ceil(ordenadas.length / POR_PAG);
  const paginadas = ordenadas.slice((pagina-1)*POR_PAG, pagina*POR_PAG);

  const handleAccion = (dev, accion, motivoRechazo) => {
    devolucionesService.cambiarEstado(dev.id, accion === 'aprobar' ? 'aprobada' : 'rechazada', motivoRechazo)
      .then(() => { refresh(); showToast(accion === 'aprobar' ? '✅ Devolución aprobada' : '❌ Devolución rechazada'); })
      .catch((err) => showToast(err.message || 'No se pudo actualizar la devolución.'));
    setConfirm(null);
  };

  const statCards = [
    { label:'Total',      value: stats.total,    color:'#42A5F5' },
    { label:'Pendientes', value: stats.pendiente, color:'#FFB300' },
    { label:'Aprobadas',  value: stats.aprobada,  color:'#4CAF50' },
    { label:'Rechazadas', value: stats.rechazada, color:'#EF5350' },
  ];

  return (
    <div style={{padding:'0 4px'}}>
      {confirm && (
        <DevConfirmModal
          dev={confirm.dev} accion={confirm.accion} venta={getVenta(confirm.dev?.pedido_id)}
          onClose={() => setConfirm(null)}
          onConfirm={(motivoRechazo) => handleAccion(confirm.dev, confirm.accion, motivoRechazo)}
        />
      )}
      <div style={{marginBottom:16}}>
        <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--text-primary)'}}>Devoluciones</h2>
        <p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-muted)'}}>Inicia una devolución desde la tarjeta del pedido</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {statCards.map((s,i) => (
          <div key={i} style={{background:'var(--bg-hover)',borderRadius:10,padding:'12px 14px',borderTop:`3px solid ${s.color}`}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:3}}>{s.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,maxWidth:340}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',pointerEvents:'none'}}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Buscar por cliente, motivo, ID..." value={query}
            onChange={e => { setQuery(e.target.value); setPagina(1); }}
            style={{width:'100%',padding:'9px 12px 9px 32px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-hover)',color:'var(--text-primary)',boxSizing:'border-box'}}/>
          {query && <button onClick={() => setQuery('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14}}>✕</button>}
        </div>
        <select value={filtro} onChange={e => { setFiltro(e.target.value); setPagina(1); }}
          style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-hover)',color:'var(--text-primary)'}}>
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:'auto'}}>{filtradas.length} devolución{filtradas.length!==1?'es':''}</span>
      </div>
      {paginadas.length === 0 ? (
        <div style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}>
          <div style={{fontSize:32,marginBottom:10}}>↩️</div>
          <h3 style={{margin:'0 0 6px',color:'var(--text-secondary)'}}>{query||filtro!=='todos'?'Sin coincidencias':'No hay devoluciones'}</h3>
          <p style={{margin:0,fontSize:13}}>{query||filtro!=='todos'?'Prueba con otros filtros':'Inicia una devolución desde la tarjeta del pedido'}</p>
        </div>
      ) : (
        <>
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.08)'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'var(--bg-hover)'}}>
                  {['#','Venta','Cliente','Fecha','Tipo','Motivo','Estado','Acciones'].map(h => (
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginadas.map(d => {
                  const v    = getVenta(d.pedido_id);
                  const eCfg = DEV_EST_CFG[d.estado] || {};
                  return (
                    <tr key={d.id} style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                      <td style={{padding:'10px 14px',color:'var(--text-secondary)',fontWeight:700}}>{d.id}</td>
                      <td style={{padding:'10px 14px',color:'var(--text-secondary)',fontWeight:600,fontSize:12}}>#{d.pedido_id}</td>
                      <td style={{padding:'10px 14px'}}>
                        <div style={{fontWeight:600,color:'var(--text-primary)'}}>{v?.cliente||'—'}</div>
                        {v && <div style={{fontSize:11,color:'var(--text-muted)'}}>{fmt(v.total)}</div>}
                      </td>
                      <td style={{padding:'10px 14px',color:'var(--text-secondary)',fontSize:12,whiteSpace:'nowrap'}}>
                        <div>{fmtFecha(d.created_at)}</div>
                        <div style={{fontSize:11,color:'var(--cj-text-3)'}}>{fmtHora(d.created_at)}</div>
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:100,background:'rgba(255,255,255,0.08)',color:'var(--text-secondary)'}}>{d.tipo==='total'?'Total':'Parcial'}</span>
                      </td>
                      <td style={{padding:'10px 14px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'var(--text-secondary)'}} title={d.motivo}>{d.motivo}</td>
                      <td style={{padding:'10px 14px'}}>
                        <span style={{background:eCfg.bg,color:eCfg.color,padding:'4px 10px',borderRadius:100,fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>{eCfg.ico} {eCfg.label}</span>
                      </td>
                      <td style={{padding:'10px 14px'}}>
                        {d.estado === 'pendiente' ? (
                          <div style={{display:'flex',gap:6}}>
                            <button title="Aprobar" onClick={() => setConfirm({dev:d,accion:'aprobar'})}
                              style={{padding:'5px 10px',background:'rgba(76,175,80,0.15)',border:'1px solid rgba(76,175,80,0.3)',borderRadius:6,cursor:'pointer',color:'#81C784',fontSize:12,fontWeight:700}}>✅</button>
                            <button title="Rechazar" onClick={() => setConfirm({dev:d,accion:'rechazar'})}
                              style={{padding:'5px 10px',background:'rgba(239,83,80,0.15)',border:'1px solid rgba(239,83,80,0.3)',borderRadius:6,cursor:'pointer',color:'#EF9A9A',fontSize:12,fontWeight:700}}>❌</button>
                          </div>
                        ) : <span style={{fontSize:11,color:'var(--cj-text-3)'}}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPags > 1 && (
            <div className="cj-pagination" style={{marginTop:12}}>
              <button className="cj-page-btn" disabled={pagina===1} onClick={() => setPagina(p=>p-1)}>← Ant.</button>
              {Array.from({length:totalPags},(_,i)=>i+1).map(n => (
                <button key={n} className={`cj-page-btn ${n===pagina?'cj-page-btn--on':''}`} onClick={() => setPagina(n)}>{n}</button>
              ))}
              <button className="cj-page-btn" disabled={pagina===totalPags} onClick={() => setPagina(p=>p+1)}>Sig. →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VerifyPayModal({ order, onClose, onAprobar, onRechazar }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const motivoValido = motivo.trim().length >= 5;
  if (!order) return null;
  // Mismos campos que usa el Admin (PedidosPage/ModalDetalle): el backend
  // devuelve la imagen del comprobante como `comprobanteImg` (alias) y
  // `comprobante_img` (columna). `comprobante` es solo la nota de texto
  // (ej. "Enviado por WhatsApp") — NO debe condicionar que se vea la
  // imagen. Antes acá solo se miraba `order.comprobanteImg` y solo si
  // `order.comprobante` era truthy, así que el cajero no veía el
  // comprobante en varios casos donde el Admin sí lo ve.
  const comprobanteImg = order.comprobanteImg || order.comprobante_img || null;
  const notaComprobante = order.comprobante && order.comprobante !== 'Enviado por WhatsApp' ? order.comprobante : null;
  const esWhatsApp = order.comprobante === 'Enviado por WhatsApp';
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Verificar pago</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <span style={{fontSize:13,color:'var(--text-muted)'}}>Total del pedido</span>
            <span style={{fontSize:17,fontWeight:800}}>{fmt(order.total)}</span>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Comprobante enviado por el cliente</div>
            {comprobanteImg ? (
              <>
                <img src={comprobanteImg} alt="Comprobante de pago"
                  style={{width:'100%',maxHeight:340,objectFit:'contain',borderRadius:10,border:'1.5px solid var(--border-input)',background:'var(--bg-surface-2, rgba(128,128,128,.06))',cursor:'zoom-in'}}
                  title="Clic para ver en tamaño completo"
                  onClick={() => window.open(comprobanteImg,'_blank')}/>
                <button type="button" onClick={() => window.open(comprobanteImg,'_blank')}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',marginTop:8,padding:'7px 0',borderRadius:8,border:'1.5px solid var(--border-input)',background:'transparent',color:'var(--text-primary)',fontWeight:600,fontSize:12,cursor:'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                  Ver comprobante completo
                </button>
              </>
            ) : esWhatsApp ? (
              <div style={{fontSize:13,color:'var(--text-secondary)',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:10}}>📱 El cliente confirmó el pago por WhatsApp (sin imagen adjunta).</div>
            ) : notaComprobante ? (
              <div style={{fontSize:13,color:'var(--text-secondary)',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:10}}>{notaComprobante}</div>
            ) : (
              <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>El cliente no adjuntó comprobante.</p>
            )}
          </div>
        </div>
        {rechazando && (
          <div className="cj-modal__body" style={{ paddingTop: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C62828', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Motivo del rechazo (obligatorio)
            </div>
            <textarea
              autoFocus
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: El valor del comprobante no coincide con el total del pedido."
              rows={3}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: `1.5px solid ${motivo && !motivoValido ? '#E53935' : 'var(--border-input)'}`, background: 'var(--bg-input, transparent)', color: 'var(--text-primary)' }}
            />
            {motivo && !motivoValido && (
              <div style={{ fontSize: 12, color: '#E53935', marginTop: 4 }}>Escribe un motivo de al menos 5 caracteres. Se le mostrará al cliente.</div>
            )}
          </div>
        )}
        <div className="cj-modal__foot">
          {rechazando ? (
            <>
              <button className="cj-btn" onClick={() => { setRechazando(false); setMotivo(''); }}>← Volver</button>
              <button className="cj-btn cj-btn--danger" disabled={!motivoValido}
                style={!motivoValido ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                onClick={() => { onRechazar(order, motivo.trim()); onClose(); }}>✕ Confirmar rechazo</button>
            </>
          ) : (
            <>
              <button className="cj-btn cj-btn--danger" onClick={() => setRechazando(true)}>✕ Rechazar pago</button>
              <button className="cj-btn cj-btn--primary" onClick={() => { onAprobar(order); onClose(); }}>✓ Aprobar pago</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CajeroPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate         = useNavigate();
  const [tab, setTab]             = useState('pedidos');
  const [orders, setOrders]       = useState([]);
  const [filter, setFilter]       = useState('all');
  const [page, setPage]           = useState(1);
  const [statusOrder, setStatus]  = useState(null);
  const [payOrder, setPay]        = useState(null);
  const [verifyOrder, setVerify]  = useState(null);
  const [cobroOrder, setCobroOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [devPedido, setDevPedido] = useState(null);
  const [toast, setToast]         = useState('');
  const [showLogout, setLogout]   = useState(false);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2800); };
  // El Administrador (sede='Ambos') ve todos los pedidos; un cajero de
  // Local 1/Local 2 solo debe ver y cobrar los pedidos de su propio local.
  const sedeFiltro = user?.sede && user.sede !== 'Ambos' ? user.sede : undefined;
  const refresh   = () => { pedidosService.getAll(sedeFiltro).then(d => setOrders(Array.isArray(d) ? d : [])).catch(()=>{}); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { const t = setInterval(refresh, 8000); return () => clearInterval(t); }, []);

  // 6 — estadísticas visibles del cajero: "Pedidos atendidos" (los que él
  // mismo atendió, por nombre — campo `barista` del pedido) y "Ventas
  // realizadas" (de su local; ventas no guarda "atendido por" individual,
  // así que a nivel de local es lo más preciso que expone el backend hoy —
  // ver GET /ventas/stats, que no filtra por cajero ni por sede).
  const [ventasCajero, setVentasCajero] = useState([]);
  useEffect(() => {
    ventasService.getAll(sedeFiltro).then(d => setVentasCajero(Array.isArray(d) ? d : [])).catch(() => {});
  }, [sedeFiltro, orders.length]);
  const pedidosAtendidos = orders.filter(o => o.barista && (o.barista === user?.nombre || o.barista === user?.username)).length;
  const ventasRealizadas = ventasCajero.filter(v => v.estado !== 'devuelto').length;
  const totalVentasCajero = ventasCajero.filter(v => v.estado !== 'devuelto').reduce((s, v) => s + (Number(v.total) || 0), 0);
  const filtered   = filter === 'all' ? orders : orders.filter(o => normalizarEstadoPedido(o.estado) === filter);
  const sorted     = [...filtered].sort((a,b) => Number(b.id) - Number(a.id));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  // El polling (refresh cada 8s) puede reducir la lista —p.ej. se entregaron
  // pedidos y ahora hay menos páginas—: si la página actual quedó fuera de
  // rango, volver a la última válida en vez de mostrar la lista vacía.
  useEffect(() => {
    setPage(p => (p > totalPages ? Math.max(1, totalPages) : p));
  }, [totalPages]);
  const counts = {
    pendiente_verificacion: orders.filter(o=>o.estado==='pendiente_verificacion').length,
    pendiente:      orders.filter(o=>o.estado==='pendiente').length,
    domicilio:      orders.filter(o=>o.tipo==='domicilio'&&(o.estado==='pendiente'||normalizarEstadoPedido(o.estado)==='en_proceso')).length,
    en_proceso:     orders.filter(o=>normalizarEstadoPedido(o.estado)==='en_proceso').length,
    en_camino:      orders.filter(o=>normalizarEstadoPedido(o.estado)==='en_camino').length,
    pagado:         orders.filter(o=>o.estado==='pagado').length,
  };
  const handleStatusOpen = order => {
    if (order.estado === 'pagado') { showToast('🔒 Este pedido ya fue pagado'); return; }
    setStatus(order);
  };
  const handleStatusSave = useCallback(async (newStatus, razon) => {
    if (!statusOrder || statusOrder.estado === 'pagado') return;
    try {
      const respuesta = await pedidosService.cambiarEstado(statusOrder.id, newStatus);
      if (razon) await pedidosService.actualizarCampo?.(statusOrder.id, 'razonCancelacion', razon);
      refresh();
      // Al entregar, el backend puede devolver `avisoInventario`: la venta se
      // registró pero algún insumo de la receta no existe en este local y no
      // se pudo descontar. Antes eso era un 409 que impedía entregar; ahora
      // se avisa y ya. Se muestra con '✕' para que salga en rojo, porque hay
      // inventario que quedó sin ajustar y alguien tiene que revisarlo.
      if (respuesta?.avisoInventario) showToast('✕ ' + respuesta.avisoInventario);
      else showToast(`Estado → "${STATUS_CFG[newStatus]?.label}"${razon ? ` · ${razon.substring(0,30)}` : ''}`);
    } catch (e) {
      // El backend rechaza con 400 cualquier retroceso de estado — se
      // traduce a un mensaje claro (ver mensajeErrorEstadoPedido).
      showToast('✕ ' + mensajeErrorEstadoPedido(e, 'Error al cambiar estado.'));
    }
  }, [statusOrder]);
  const handlePayConfirm = useCallback(async method => {
    if (!payOrder) return;
    try {
      // El estado correcto tras cobrar es "pagado" (no "entregado").
      // STATUS_CFG, los filtros y el bloqueo del botón "Cobrar" dependen
      // de que el pedido quede exactamente en estado 'pagado'.
      await pedidosService.cambiarEstado(payOrder.id, 'pagado');
      await ventasService.crearDesde(payOrder.id);
      refresh();
      showToast(`✓ Pago confirmado — ${method}`);
      setPay(null);
    } catch(e) { showToast('Error al confirmar pago: ' + e.message); }
  }, [payOrder]);
  // 5 — endpoints dedicados de verificación de comprobante (no el genérico
  // cambiarEstado): al aprobar, el backend deja el pedido en 'pendiente'
  // (pago confirmado, puede empezar a prepararse — antes esto saltaba
  // directo a 'en_proceso', saltándose el paso de pago confirmado).
  const handleVerifyAprobar = useCallback(async order => {
    try {
      await pedidosService.aprobarComprobante(order.id);
      refresh();
      showToast(`✓ Pago de #${order.id} aprobado`);
    } catch (e) { showToast('✕ Error al aprobar el pago: ' + e.message); }
  }, []);
  const handleVerifyRechazar = useCallback(async (order, motivo) => {
    try {
      // El motivo es obligatorio (lo exige el modal): el backend lo guarda
      // y el cliente lo ve en el detalle de su pedido.
      await pedidosService.rechazarComprobante(order.id, motivo);
      notificacionesService.create({
        clienteId: order.cliente_id,
        pedidoId: order.id,
        tipo: 'pago_rechazado',
        mensaje: `❌ Tu pago fue rechazado. Motivo: ${motivo}. Puedes volver a comprar y subir un nuevo comprobante desde "Mis pedidos".`,
      });
      refresh();
      showToast(`✕ Pago de #${order.id} rechazado`);
    } catch (e) { showToast('✕ Error al rechazar el pago: ' + e.message); }
  }, []);
  // 1 — confirma el cobro en efectivo; hasta que esto no ocurra el pedido
  // no puede pasar a "En preparación" (ver necesitaConfirmarCobro y el
  // bloqueo correspondiente en StatusModal). Antes llamaba a
  // pedidosService.confirmarCobro (ruta /confirmar-cobro, 404) — corregido
  // a confirmarPago (/confirmar-pago).
  const handleConfirmarCobro = useCallback(async () => {
    if (!cobroOrder) return;
    try {
      await pedidosService.confirmarPago(cobroOrder.id);
      refresh();
      showToast(`✓ Cobro de #${cobroOrder.id} confirmado`);
      setCobroOrder(null);
    } catch (e) { showToast('✕ Error al confirmar el cobro: ' + e.message); }
  }, [cobroOrder]);
  // 4 — reclamar un pedido sin local asignado (mismo mecanismo que ya usa
  // Bartender: PATCH /pedidos/:id/tomar, atómico en el backend).
  const handleReclamar = useCallback(async id => {
    try {
      await pedidosService.tomar(id);
      refresh();
      showToast(`✓ Pedido #${id} reclamado para tu local`);
    } catch (e) {
      showToast('✕ ' + (e.message || 'No se pudo reclamar el pedido.'));
    }
  }, []);
  // 5 — Aceptar/Rechazar la entrega de un pedido a domicilio (ver
  // DomicilioBlock más arriba para el porqué de cada caso).
  const handleAceptarDomicilio = useCallback(async order => {
    try {
      await pedidosService.aceptarDomicilio(order.id);
      refresh();
      setDetailOrder(null);
      showToast(`✓ Domicilio del pedido #${order.id} aceptado`);
    } catch (e) { showToast('✕ ' + (e.message || 'No se pudo aceptar el domicilio.')); }
  }, []);
  const handleRechazarDomicilio = useCallback(async order => {
    try {
      if (order.domiciliario_id) {
        // Ya lo había aceptado este mismo usuario — lo libera.
        await pedidosService.rechazarDomicilio(order.id);
        showToast(`Entrega del pedido #${order.id} liberada`);
      } else {
        // Nadie lo ha aceptado todavía: "rechazar" acá significa que este
        // pedido no se puede entregar desde este local — se cancela.
        if (!window.confirm(`¿Rechazar el pedido a domicilio #${order.id}? Quedará cancelado.`)) return;
        await pedidosService.cambiarEstado(order.id, 'cancelado');
        showToast(`✕ Pedido #${order.id} rechazado`);
      }
      refresh();
      setDetailOrder(null);
    } catch (e) { showToast('✕ ' + (e.message || 'No se pudo rechazar el domicilio.')); }
  }, []);
  const now      = new Date();
  const dateStr  = now.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
  const [cajDevs, setCajDevs] = React.useState([]);
  React.useEffect(() => { devolucionesService.getAll(sedeFiltro).then(d => setCajDevs(Array.isArray(d) ? d : [])).catch(()=>{}); }, [sedeFiltro]);
  const devCount = cajDevs.filter(d=>d.estado==='pendiente').length;

  return (
    <div className="cj-root">
      {toast && <div className="cj-toast">{toast}</div>}
      <aside className="cj-sidebar">
        <div className="cj-sidebar__logo">
          <div className="cj-sidebar__logo-ring">
            <img src="/img/Logotipo_blanco.png" alt="Sicaber" style={{width:40,height:40,objectFit:'contain',filter:'none',padding:4}}/>
          </div>
          <span className="cj-sidebar__brand">SICABER</span>
          <span className="cj-sidebar__sub">Módulo Cajero</span>
        </div>
        <nav className="cj-sidebar__nav">
          <div className="cj-sidebar__section">Principal</div>
          <button className={`cj-sidebar__item ${tab==='nuevo'?'cj-sidebar__item--active':''}`} onClick={() => setTab('nuevo')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo pedido
          </button>
          <button className={`cj-sidebar__item ${tab==='pedidos'?'cj-sidebar__item--active':''}`} onClick={() => setTab('pedidos')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Pedidos activos
            {(counts.pendiente_verificacion + counts.pendiente) > 0 && (
              <span className="cj-sidebar__badge" style={counts.pendiente_verificacion>0?{background:'#AD1457'}:{}}>{counts.pendiente_verificacion + counts.pendiente}</span>
            )}
          </button>
          <button className={`cj-sidebar__item ${tab==='devoluciones'?'cj-sidebar__item--active':''}`} onClick={() => setTab('devoluciones')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.04"/></svg>
            Devoluciones
            {devCount > 0 && <span className="cj-sidebar__badge">{devCount}</span>}
          </button>
          <button className={`cj-sidebar__item ${tab==='ventas'?'cj-sidebar__item--active':''}`} onClick={() => setTab('ventas')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2h12l4 4v16H4z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="13" y2="18"/></svg>
            Ventas
          </button>
          {/* El módulo de Compras NO es para el Cajero: se quitó del sidebar.
              La ruta /compras además está protegida por permiso ('compras')
              en routes.jsx, así que tampoco es accesible escribiendo la URL.
              (Aprobar/rechazar comprobantes de PEDIDOS se hace desde
              "Pedidos activos" → Verificar pago, no desde Compras.) */}
          <div className="cj-sidebar__section">Mi desempeño</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,padding:'0 4px 10px'}}>
            <div style={{background:'rgba(76,175,80,0.1)',border:'1px solid rgba(76,175,80,0.25)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
              <div style={{fontSize:20,fontWeight:800,color:'#4CAF50',lineHeight:1}}>{pedidosAtendidos}</div>
              <div style={{fontSize:10,color:'var(--cj-text-3, var(--text-muted))',fontWeight:600,marginTop:4}}>Pedidos atendidos</div>
            </div>
            <div style={{background:'rgba(126,87,194,0.1)',border:'1px solid rgba(126,87,194,0.25)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}
              title={`Total: ${fmt(totalVentasCajero)}`}>
              <div style={{fontSize:20,fontWeight:800,color:'#9575CD',lineHeight:1}}>{ventasRealizadas}</div>
              <div style={{fontSize:10,color:'var(--cj-text-3, var(--text-muted))',fontWeight:600,marginTop:4}}>Ventas realizadas</div>
            </div>
          </div>
          <div className="cj-sidebar__section">Resumen</div>
          <div className="cj-sidebar__stats">
            {[
              { dot:'#AD1457', label:'Por verificar', val: counts.pendiente_verificacion },
              { dot:'#FFB300', label:'Pendientes',    val: counts.pendiente },
              { dot:'#42A5F5', label:'En proceso',    val: counts.en_proceso },
              { dot:'#00838F', label:'En camino',     val: counts.en_camino },
              { dot:'#7E57C2', label:'Pagados',       val: counts.pagado },
            ].map(s => (
              <div key={s.label} className="cj-sidebar__stat">
                <span className="cj-sidebar__stat-dot" style={{background:s.dot}}/>
                <span>{s.label}</span><strong>{s.val}</strong>
              </div>
            ))}
          </div>
        </nav>
        <div className="cj-sidebar__bottom">
          <div className="cj-sidebar__user">
            <div className="cj-sidebar__avatar">{(user?.nombre||user?.username||'C').charAt(0).toUpperCase()}</div>
            <div className="cj-sidebar__user-info">
              <span className="cj-sidebar__username">{user?.nombre||user?.username}</span>
              <span className="cj-sidebar__role">{user?.role||'Cajero'}</span>
            </div>
          </div>
          <button className="cj-sidebar__logout" onClick={() => setLogout(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Salir
          </button>
        </div>
      </aside>
      <main className="cj-main">
        <div className="cj-topbar">
          <div className="cj-topbar__title">{tab==='nuevo'?'Nuevo Pedido':tab==='devoluciones'?'Devoluciones':tab==='ventas'?'Ventas':'Pedidos Activos'}</div>
          {tab === 'pedidos' && <span className="cj-topbar__date">{dateStr}</span>}
          <div style={{flex:1}}/>
          <DomiciliosBell onVerTodos={() => setTab('pedidos')} />
          <button className="theme-toggle-btn" onClick={toggleTheme} title={theme==='dark'?'Modo claro':'Modo oscuro'}>
            {theme === 'dark'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <div className="cj-online-pill"><span className="cj-pulse"/>En línea</div>
          {tab === 'pedidos' && <button className="cj-icon-btn" onClick={refresh} title="Actualizar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>}
        </div>
        <div className="cj-content">
          {tab === 'nuevo' && <PedidoBuilder mode="cajero" showToast={showToast} onCreated={() => { refresh(); setTab('pedidos'); }}/>}
          {tab === 'devoluciones' && <DevolucionesTab showToast={showToast} sedeFiltro={sedeFiltro}/>}
          {tab === 'ventas' && <VentasTab sedeFiltro={sedeFiltro}/>}
          {tab === 'pedidos' && (
            <>
              <div className="cj-filters">
                {FILTERS.map(f => {
                  const cfg = STATUS_CFG[f];
                  return (
                    <button key={f} className={`cj-chip ${filter===f?'cj-chip--on':''}`} onClick={() => { setFilter(f); setPage(1); }}>
                      {cfg && <span className="cj-chip__dot" style={{background:cfg.color}}/>}
                      {f==='all'?'Todos':cfg?.label||f}
                      {f!=='all' && counts[f]>0 && <span className="cj-chip__count">{counts[f]}</span>}
                    </button>
                  );
                })}
                <div style={{flex:1}}/>
                <span className="cj-count-label">{filtered.length} pedido{filtered.length!==1?'s':''}</span>
              </div>
              {filtered.length === 0 ? (
                <div className="cj-empty">
                  <div className="cj-empty__icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
                  <h3>Sin pedidos</h3>
                  <p>{filter==='all'?<span>No hay pedidos aún. <button className="cj-link" onClick={() => setTab('nuevo')}>Crear uno →</button></span>:`No hay pedidos con estado "${STATUS_CFG[filter]?.label}".`}</p>
                </div>
              ) : (
                <div className="cj-grid">
                  {pageItems.map(order => <OrderCard key={order.id} order={order} onStatus={handleStatusOpen} onPay={setPay} onDevolucion={setDevPedido} onVerificar={setVerify} onConfirmarCobro={setCobroOrder} onDetail={setDetailOrder} onReclamar={handleReclamar}/>)}
                </div>
              )}
              {totalPages > 1 && (
                <div className="cj-pagination">
                  <button className="cj-page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>← Ant.</button>
                  {Array.from({length:totalPages},(_,i)=>i+1).map(n => <button key={n} className={`cj-page-btn ${n===page?'cj-page-btn--on':''}`} onClick={() => setPage(n)}>{n}</button>)}
                  <button className="cj-page-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>Sig. →</button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {statusOrder && <StatusModal order={statusOrder} onClose={() => setStatus(null)} onSave={handleStatusSave}/>}
      {payOrder && <PayModal order={payOrder} onClose={() => setPay(null)} onConfirm={handlePayConfirm}/>}
      {verifyOrder && <VerifyPayModal order={verifyOrder} onClose={() => setVerify(null)} onAprobar={handleVerifyAprobar} onRechazar={handleVerifyRechazar}/>}
      {detailOrder && <PedidoDetalleModal order={detailOrder} onClose={() => setDetailOrder(null)} onAceptarDomicilio={handleAceptarDomicilio} onRechazarDomicilio={handleRechazarDomicilio}/>}
      {cobroOrder && <ConfirmCobroModal order={cobroOrder} onClose={() => setCobroOrder(null)} onConfirm={handleConfirmarCobro}/>}
      {devPedido && <DevRegistrarModal pedido={devPedido} onClose={() => setDevPedido(null)} onSave={() => { setDevPedido(null); showToast('↩ Devolución registrada correctamente'); refresh(); }}/>}
      {showLogout && (
        <div className="cj-modal-mask" onClick={() => setLogout(false)}>
          <div className="cj-modal cj-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="cj-modal__head"><h3>¿Cerrar sesión?</h3><button className="cj-modal__x" onClick={() => setLogout(false)}>✕</button></div>
            <div className="cj-modal__body"><p style={{color:'var(--text-secondary)',fontSize:14}}>¿Estás seguro de que deseas salir?</p></div>
            <div className="cj-modal__foot">
              <button className="cj-btn cj-btn--ghost" onClick={() => setLogout(false)}>Cancelar</button>
              <button className="cj-btn cj-btn--danger" onClick={() => { logout(); navigate('/'); }}>Sí, salir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}