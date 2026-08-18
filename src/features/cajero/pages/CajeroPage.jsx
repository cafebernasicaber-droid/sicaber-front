import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import pedidosService      from '../../pedidos/services/pedidosService';
import productosService    from '../../productos/services/productosService';
import adicionesService    from '../../adiciones/services/adicionesService';
import toppingsService     from '../../toppings/services/toppingsService';
import clientesService     from '../../clientes/services/clientesService';
import devolucionesService from '../../devoluciones/services/devolucionesService';
import ventasService       from '../../ventas/services/ventasService';
// 4 — para mostrar los insumos de la ficha técnica en el detalle del
// pedido, igual que ya lo hace Bartender (mismo criterio de solo-lectura).
import fichasTecnicasService from '../../fichasTecnicas/services/fichasTecnicasService';
import insumosService        from '../../insumos/services/insumosService';
import DomiciliosBell      from '../../../shared/components/DomiciliosBell';
import { toppingsParaProducto } from '../../../shared/utils/toppings';
import './CajeroPage.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';
const fmtHora  = iso => iso ? new Intl.DateTimeFormat('es-CO',{timeStyle:'short'}).format(new Date(iso)) : '—';

const STATUS_CFG = {
  pendiente_verificacion: { label: 'Verificar pago',  color: '#AD1457', bg: '#FCE4EC' },
  pendiente:      { label: 'Pendiente',      color: '#FFB300', bg: '#FFF8E1' },
  en_preparacion: { label: 'En preparación', color: '#42A5F5', bg: '#E3F2FD' },
  en_proceso:     { label: 'En proceso',     color: '#42A5F5', bg: '#E3F2FD' },
  listo:          { label: 'Listo ✓',        color: '#4CAF50', bg: '#E8F5E9' },
  entregado:      { label: 'Entregado',      color: '#7E57C2', bg: '#EDE7F6' },
  pagado:         { label: 'Pagado',         color: '#7E57C2', bg: '#EDE7F6' },
  devuelto:       { label: 'Devuelto',       color: '#FF7043', bg: '#FBE9E7' },
  cancelado:      { label: 'Cancelado',      color: '#EF5350', bg: '#FFEBEE' },
};

const DEV_EST_CFG = {
  pendiente: { bg:'#FFF8E1', color:'#F57F17', label:'Pendiente', ico:'⏳' },
  aprobada:  { bg:'#E8F5E9', color:'#2E7D32', label:'Aprobada',  ico:'✅' },
  rechazada: { bg:'#FFEBEE', color:'#C62828', label:'Rechazada', ico:'❌' },
};

const FILTERS   = ['all', 'pendiente_verificacion', 'pendiente', 'en_preparacion', 'listo', 'pagado'];
// 1 — unificado con los métodos de pago de la Landing pública (ver
// src/landing/Landing.jsx, const METODOS de PedidoWizard) para que el
// cajero registre el cobro con el mismo vocabulario que ve el cliente.
// Exactamente 3: Efectivo, Nequi, Transferencia — sin Tarjeta ni ningún
// otro valor suelto.
const METODOS   = ['Efectivo', 'Nequi', 'Transferencia'];
const PAGE_SIZE = 6;

// 7 — secuencia oficial de estados del pedido: un cajero puede avanzar pero
// nunca retroceder dentro de ella ('devuelto'/'cancelado' son salidas
// aparte, no forman parte de esta progresión y siguen disponibles siempre).
const SECUENCIA_ESTADOS = ['pendiente_verificacion', 'pendiente', 'en_preparacion', 'listo', 'entregado'];

// 1 — un pedido en 'pendiente' necesita UNA de estas dos confirmaciones
// antes de poder pasar a "En preparación", según su método de pago — nunca
// las dos, y nunca ninguna otra cosa relacionada con comprobantes si es
// efectivo (ver también el aviso 2 más abajo, punto 1 de la tarea).
const cobroYaConfirmado = order => !!(order.cobroConfirmado ?? order.cobro_confirmado);
const comprobanteYaAprobado = order => !!(order.comprobanteAprobado ?? order.comprobante_aprobado);
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

function OrderCard({ order, onStatus, onPay, onDevolucion, onVerificar, onConfirmarCobro, onDetail }) {
  const cfg    = STATUS_CFG[order.estado] || STATUS_CFG.pendiente;
  const isPaid = order.estado === 'pagado';
  const isVerificando = order.estado === 'pendiente_verificacion';
  const faltaCobro = necesitaConfirmarCobro(order);
  const faltaAprobarComprobante = necesitaAprobarComprobantePendiente(order);
  const canPay = order.estado === 'listo' || order.estado === 'entregado';
  const canDev = order.estado === 'listo' || order.estado === 'entregado' || order.estado === 'pagado';
  const prods  = order.productos || order.items || [];

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
          <span className="cj-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
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
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:'#AD1457',marginBottom:6}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Verifica el comprobante de pago para continuar
        </div>
      )}
      <div className="cj-card__actions">
        {isVerificando || faltaAprobarComprobante ? (
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
  useEffect(() => { if (order) { setSel(order.estado); setRazon(''); } }, [order]);
  if (!order || order.estado === 'pagado') return null;
  // 7 — no se puede retroceder dentro de la secuencia principal de estados;
  // 'devuelto' y 'cancelado' quedan siempre disponibles como salidas aparte.
  const idxActual = SECUENCIA_ESTADOS.indexOf(order.estado);
  const opts = ['pendiente','en_preparacion','listo','entregado','devuelto','cancelado'].filter(s => {
    const idx = SECUENCIA_ESTADOS.indexOf(s);
    return idx === -1 || idxActual === -1 || idx >= idxActual;
  });
  // 6 — mientras no se confirme el cobro (pedidos de mostrador/efectivo en
  // 'pendiente'), la opción de pasar a "En preparación" queda deshabilitada.
  const faltaCobro = necesitaConfirmarCobro(order);
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Actualizar Estado</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          {faltaCobro && (
            <div style={{background:'rgba(255,179,0,0.12)',border:'1px solid rgba(255,179,0,0.35)',color:'#F57F17',padding:'9px 12px',borderRadius:8,fontSize:12,marginBottom:10}}>
              ⚠ Confirma el cobro de este pedido antes de pasarlo a "En preparación".
            </div>
          )}
          <div className="cj-status-options">
            {opts.map(s => {
              const cfg = STATUS_CFG[s];
              const disabled = faltaCobro && s === 'en_preparacion';
              return (
                <div key={s} className={`cj-status-opt ${sel===s?'selected':''}`} onClick={() => !disabled && setSel(s)}
                  title={disabled ? 'Confirma el cobro primero' : undefined}
                  style={{
                    ...(sel===s ? {borderColor:cfg.color,background:cfg.bg} : {}),
                    ...(disabled ? {opacity:0.4,cursor:'not-allowed'} : {}),
                  }}>
                  <span className="cj-status-dot" style={{background:cfg.color}}/>
                  {cfg.label}
                  {sel===s && <span className="cj-status-check">✓</span>}
                </div>
              );
            })}
          </div>
          {sel === 'cancelado' && (
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
          <button className="cj-btn cj-btn--primary" disabled={faltaCobro && sel === 'en_preparacion'}
            title={faltaCobro && sel === 'en_preparacion' ? 'Confirma el cobro antes de pasar a preparación' : undefined}
            onClick={() => { onSave(sel, razonCancel.trim()); onClose(); }}>Guardar</button>
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
function PedidoDetalleModal({ order, onClose }) {
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
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          {esAprobar
            ? <button className="cj-btn cj-btn--primary" onClick={onConfirm}>✅ Aprobar</button>
            : <button className="cj-btn" style={{background:'#C62828',color:'#fff',border:'none'}} onClick={onConfirm}>❌ Rechazar</button>
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

  const handleAccion = (dev, accion) => {
    devolucionesService.cambiarEstado(dev.id, accion === 'aprobar' ? 'aprobada' : 'rechazada')
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
          onConfirm={() => handleAccion(confirm.dev, confirm.accion)}
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

function ClienteSelector({ value, onChange }) {
  const [todosClientes, setTodosClientes] = React.useState([]);
  React.useEffect(() => {
    clientesService.getAll().then(d => setTodosClientes(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const [modo, setModo]         = useState('libre');
  const [query, setQuery]       = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const MESAS = ['Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5','Mesa 6','Mesa 7','Mesa 8','Mesa 9','Mesa 10'];
  const clientesFiltrados = useMemo(() => {
    const lista = Array.isArray(todosClientes) ? todosClientes : [];
    if (!query.trim()) return lista.slice(0, 8);
    const q = query.toLowerCase();
    return lista.filter(c => (c.nombre||'').toLowerCase().includes(q)||(c.telefono||'').includes(q)||(c.correo||'').toLowerCase().includes(q)).slice(0, 8);
  }, [todosClientes, query]);
  const seleccionarCliente = c => { onChange(c.nombre); setQuery(c.nombre); setShowDrop(false); };
  const copiar = async t => { try { await navigator.clipboard.writeText(t); } catch {} };
  return (
    <div className="cj-cliente-selector">
      <div className="cj-cliente-tabs">
        <button className={`cj-cliente-tab ${modo==='libre'?'active':''}`} onClick={() => { setModo('libre'); onChange(''); setQuery(''); }} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Escribir
        </button>
        <button className={`cj-cliente-tab ${modo==='buscar'?'active':''}`} onClick={() => { setModo('buscar'); onChange(''); setQuery(''); }} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Cliente registrado
        </button>
        <button className={`cj-cliente-tab ${modo==='mesa'?'active':''}`} onClick={() => { setModo('mesa'); onChange(''); setQuery(''); }} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Mesa
        </button>
      </div>
      {modo === 'libre' && (
        <div className="cj-cliente-input-wrap">
          <input value={value} onChange={e => onChange(e.target.value)} placeholder="Ej: Juan García / Domicilio #5..." className="cj-cliente-input"/>
          {value && <button className="cj-cliente-copy" title="Copiar" type="button" onClick={() => copiar(value)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>}
        </div>
      )}
      {modo === 'buscar' && (
        <div className="cj-cliente-search-wrap">
          <div className="cj-cliente-input-wrap">
            <input value={query} onChange={e => { setQuery(e.target.value); onChange(e.target.value); setShowDrop(true); }} onFocus={() => setShowDrop(true)} placeholder="Buscar por nombre, teléfono o correo..." className="cj-cliente-input cj-cliente-input--search"/>
            {query && <button className="cj-cliente-copy" type="button" onClick={() => { setQuery(''); onChange(''); }}>✕</button>}
          </div>
          {showDrop && (
            <div className="cj-cliente-drop">
              {todosClientes.length === 0
                ? <div className="cj-cliente-drop__empty">No hay clientes registrados</div>
                : clientesFiltrados.length === 0
                  ? <div className="cj-cliente-drop__empty">Sin resultados para "{query}"</div>
                  : clientesFiltrados.map(c => (
                    <div key={c.id} className={`cj-cliente-drop__item ${value===c.nombre?'selected':''}`} onClick={() => seleccionarCliente(c)}>
                      <div className="cj-cliente-drop__avatar">{(c.nombre||'?').charAt(0).toUpperCase()}</div>
                      <div className="cj-cliente-drop__info">
                        <span className="cj-cliente-drop__name">{c.nombre}</span>
                        {(c.telefono||c.correo) && <span className="cj-cliente-drop__meta">{c.telefono||c.correo}</span>}
                      </div>
                      {value===c.nombre && <span className="cj-status-check">✓</span>}
                    </div>
                  ))
              }
              <div className="cj-cliente-drop__footer" onClick={() => setShowDrop(false)}>Cerrar</div>
            </div>
          )}
        </div>
      )}
      {modo === 'mesa' && (
        <div className="cj-mesa-wrap">
          <div className="cj-mesa-chips">
            {MESAS.map(m => (
              <button key={m} type="button" className={`cj-mesa-chip ${value===m?'active':''}`} onClick={() => onChange(value===m?'':m)}>
                {m}{value===m&&' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NuevoPedido({ onCreated, showToast }) {
  const { user } = useAuth();
  const [productos, setProductos] = React.useState([]);
  const [toppings, setToppings]   = React.useState([]);
  const [adiciones, setAdiciones] = React.useState([]);
  React.useEffect(() => {
    productosService.getActivos().then(d => setProductos(Array.isArray(d) ? d : [])).catch(() => setProductos([]));
    toppingsService.getAll().then(d => setToppings(Array.isArray(d) ? d.filter(t => t.estado === 'Activo') : [])).catch(() => setToppings([]));
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a => a.estado === 'Activo') : [])).catch(() => setAdiciones([]));
  }, []);
  const categorias = useMemo(() => ['Todas', ...new Set((Array.isArray(productos)?productos:[]).map(p => p.categoria))], [productos]);
  const [catSel, setCatSel]         = useState('Todas');
  const [busqueda, setBusqueda]     = useState('');
  const [carrito, setCarrito]       = useState([]);
  const [cliente, setCliente]       = useState('');
  const [notas, setNotas]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [prodSel, setProdSel]       = useState(null);
  const [adicsSelec, setAdicsSelec] = useState([]);
  const [toppingsSelec, setToppingsSelec] = useState([]);
  const [cantSel, setCantSel]       = useState(1);
  // adicionesService.getByCategoria nunca existió — esa llamada siempre
  // devolvía undefined (por el ?. ) y por eso las adiciones jamás
  // aparecían en el panel del cajero. La tabla "adiciones" tampoco tiene
  // columna "categoria" (solo nombre/precio/estado), así que, igual que
  // en Landing.jsx, las adiciones aplican a cualquier producto.
  const adicsParaProd = useMemo(() => prodSel ? adiciones : [], [prodSel, adiciones]);
  // Un topping con productos_ids vacío o ausente aplica a cualquier producto;
  // si trae ids, solo aplica a los productos que estén en ese array (misma
  // regla que ya usa la vista de cliente en Landing.jsx).
  const toppingsParaProd = useMemo(() => toppingsParaProducto(toppings, prodSel?.id), [prodSel, toppings]);
  const filtrados = useMemo(() => {
    let p = catSel === 'Todas' ? productos : productos.filter(x => x.categoria === catSel);
    if (busqueda.trim()) p = p.filter(x => x.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    return p;
  }, [productos, catSel, busqueda]);
  const itemPrecio = item => item.producto.precio + (item.adiciones||[]).reduce((s,a)=>s+a.precio,0);
  const total      = carrito.reduce((s,i)=>s+itemPrecio(i)*i.cantidad, 0);
  // 4 — si el producto no está ya en el carrito, sus toppings aplicables
  // (toppingsParaProducto: universales o ligados a este producto) vienen
  // premarcados/incluidos por defecto; el cajero puede desmarcarlos antes
  // de confirmar, pero la lista nunca arranca vacía si el producto tiene
  // toppings definidos. Si ya estaba en el carrito, respetamos lo que el
  // cajero ya había elegido para ese ítem.
  const seleccionarProd  = prod => {
    const enCart = carrito.find(i => i.producto.id === prod.id);
    setProdSel(prod);
    setAdicsSelec(enCart?.adiciones||[]);
    setToppingsSelec(enCart ? (enCart.toppings||[]) : toppingsParaProducto(toppings, prod.id));
    setCantSel(enCart?.cantidad||1);
  };
  const toggleAdic       = a => setAdicsSelec(prev => prev.find(x=>x.id===a.id) ? prev.filter(x=>x.id!==a.id) : [...prev,a]);
  const toggleTopping    = t => setToppingsSelec(prev => prev.find(x=>x.id===t.id) ? prev.filter(x=>x.id!==t.id) : [...prev,t]);
  const confirmarAgregar = () => { setCarrito(prev => [...prev, { producto: prodSel, adiciones: adicsSelec, toppings: toppingsSelec, cantidad: cantSel, _cartKey: `${prodSel.id}-${Date.now()}` }]); setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const cerrarPanel    = () => { setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const removeFromCart = k => setCarrito(prev => prev.filter(i => i._cartKey !== k));
  const changeQty      = (k, d) => setCarrito(prev => prev.map(i => i._cartKey===k ? {...i,cantidad:Math.max(1,i.cantidad+d)} : i));
  const handleCrear = () => {
    if (carrito.length === 0) { showToast('Agrega al menos un producto'); return; }
    setSaving(true);
    const now = new Date();
    // Ojo: la columna "hora" en la BD es VARCHAR(10). El formato con
    // toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'}) genera
    // strings tipo "04:59 p. m." (11 caracteres) que exceden ese límite y
    // hacen fallar el INSERT en Postgres. Usamos formato 24h "HH:MM" (5 chars).
    const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const nuevoPedido = {
      cliente: cliente.trim() || 'Cliente mostrador',
      productos: carrito.map(i => ({ id: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio, adiciones: i.adiciones||[], toppings: i.toppings||[], precioTotal: itemPrecio(i), cantidad: i.cantidad })),
      total, notas: notas.trim()||null, estado: 'pendiente', origen: 'cajero',
      hora, tipo: 'mostrador',
      // El pedido queda marcado con el local del cajero que lo crea, para
      // que solo el bartender (y el cajero) de ese mismo local lo vean.
      sede: user?.sede || '',
    };
    setTimeout(async () => {
      try {
        await pedidosService.create(nuevoPedido);
        showToast(`✓ Pedido creado — ${fmt(total)}`);
        setCarrito([]); setCliente(''); setNotas('');
        onCreated();
      } catch (e) {
        showToast('✕ Error al crear el pedido: ' + e.message);
      } finally {
        setSaving(false);
      }
    }, 400);
  };
  return (
    <div className="cj-nuevo">
      <div className="cj-nuevo__catalog">
        <div className="cj-nuevo__search-row">
          <div className="cj-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="cj-search-input" placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
            {busqueda && <button className="cj-search-clear" onClick={() => setBusqueda('')}>✕</button>}
          </div>
        </div>
        <div className="cj-cat-chips">
          {categorias.map(c => <button key={c} className={`cj-cat-chip ${catSel===c?'cj-cat-chip--on':''}`} onClick={() => setCatSel(c)}>{c}</button>)}
        </div>
        <div className="cj-prod-grid">
          {filtrados.length === 0 ? <div className="cj-prod-empty">Sin productos</div> : filtrados.map(prod => {
            const enCart = carrito.find(i => i.producto.id === prod.id);
            const activo = prodSel?.id === prod.id;
            return (
              <div key={prod.id} className={`cj-prod-card ${enCart?'cj-prod-card--in-cart':''} ${activo?'cj-prod-card--active':''}`} onClick={() => seleccionarProd(prod)}>
                <div className="cj-prod-card__img">
                  {prod.imagen && !prod.imagen.startsWith('PEGAR') ? <img src={prod.imagen} alt={prod.nombre} onError={e => e.target.style.display='none'}/> : <span>☕</span>}
                  {enCart && <div className="cj-prod-card__qty-badge">{enCart.cantidad}</div>}
                </div>
                <div className="cj-prod-card__body">
                  <div className="cj-prod-card__cat">{prod.categoria}</div>
                  <div className="cj-prod-card__name">{prod.nombre}</div>
                  <div className="cj-prod-card__price">{fmt(prod.precio)}</div>
                </div>
                <button className="cj-prod-card__add"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
              </div>
            );
          })}
        </div>
        {prodSel && (
          <div className="cj-add-panel">
            <div className="cj-add-panel__head">
              <div><div className="cj-add-panel__prod-name">{prodSel.nombre}</div><div className="cj-add-panel__prod-price">Base: {fmt(prodSel.precio)}</div></div>
              <button className="cj-add-panel__close" onClick={cerrarPanel}>✕</button>
            </div>
            {adicsParaProd.length > 0 ? (
              <div className="cj-add-panel__section">
                <div className="cj-add-panel__label">Adiciones disponibles</div>
                <div className="cj-add-chips">
                  {adicsParaProd.map(a => { const sel = adicsSelec.find(x=>x.id===a.id); return (<button key={a.id} onClick={() => toggleAdic(a)} className={`cj-add-chip${sel?' cj-add-chip--sel':''}`}>{a.nombre}<span className="cj-add-chip__price"> +{fmt(a.precio)}</span>{sel&&<span> ✓</span>}</button>); })}
                </div>
              </div>
            ) : <p className="cj-add-panel__empty">Sin adiciones para esta categoría.</p>}
            {toppingsParaProd.length > 0 && (
              <div className="cj-add-panel__section">
                <div className="cj-add-panel__label">Toppings (gratis)</div>
                <div className="cj-add-chips">
                  {toppingsParaProd.map(t => { const sel = toppingsSelec.find(x=>x.id===t.id); return (<button key={t.id} onClick={() => toggleTopping(t)} className={`cj-add-chip${sel?' cj-add-chip--sel':''}`}>{t.nombre}{sel&&<span> ✓</span>}</button>); })}
                </div>
              </div>
            )}
            <div className="cj-add-panel__footer">
              <div className="cj-add-panel__qty">
                <span className="cj-add-panel__label">Cantidad</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button className="cj-qty-btn" onClick={() => setCantSel(c=>Math.max(1,c-1))}>−</button>
                  <span className="cj-qty-val">{cantSel}</span>
                  <button className="cj-qty-btn" onClick={() => setCantSel(c=>c+1)}>+</button>
                </div>
              </div>
              <div className="cj-add-panel__total">Total: <strong>{fmt((prodSel.precio+adicsSelec.reduce((s,a)=>s+a.precio,0))*cantSel)}</strong></div>
              <div className="cj-add-panel__actions">
                <button className="cj-btn cj-btn--ghost" onClick={cerrarPanel}>Cancelar</button>
                <button className="cj-btn cj-btn--primary" onClick={confirmarAgregar}>Agregar al pedido</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="cj-nuevo__cart">
        <div className="cj-cart__head"><h3>Carrito</h3><span className="cj-cart__count">{carrito.reduce((s,i)=>s+i.cantidad,0)} ítem{carrito.length!==1?'s':''}</span></div>
        <div className="cj-cart__field">
          <label>Cliente / Mesa <span style={{color:'var(--cj-text-3)',fontWeight:400}}>(opcional)</span></label>
          <ClienteSelector value={cliente} onChange={setCliente}/>
        </div>
        <div className="cj-cart__items">
          {carrito.length === 0 ? (
            <div className="cj-cart__empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg><p>Selecciona productos del catálogo</p></div>
          ) : carrito.map(item => (
            <div key={item._cartKey||item.producto.id} className="cj-cart__item">
              <div className="cj-cart__item-info">
                <div className="cj-cart__item-name">{item.producto.nombre}</div>
                {item.adiciones?.length > 0 && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>{item.adiciones.map(a=>a.nombre).join(', ')}</div>}
                {item.toppings?.length > 0 && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>🧋 {item.toppings.map(t=>t.nombre).join(', ')}</div>}
                <div className="cj-cart__item-price">{fmt(itemPrecio(item))} c/u</div>
              </div>
              <div className="cj-cart__item-ctrl">
                <button className="cj-qty-btn" onClick={() => changeQty(item._cartKey||item.producto.id,-1)}>−</button>
                <span className="cj-qty-val">{item.cantidad}</span>
                <button className="cj-qty-btn" onClick={() => changeQty(item._cartKey||item.producto.id,+1)}>+</button>
              </div>
              <div className="cj-cart__item-sub">{fmt(itemPrecio(item)*item.cantidad)}</div>
              <button className="cj-cart__item-del" onClick={() => removeFromCart(item._cartKey||item.producto.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
        {carrito.length > 0 && (
          <div className="cj-cart__field">
            <label>Nota para el bartender <span style={{color:'var(--text-muted)',fontWeight:400}}>(opcional)</span></label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Sin azúcar, extra caliente..." rows={2}/>
          </div>
        )}
        <div className="cj-cart__foot">
          {carrito.length > 0 && <div className="cj-cart__total-row"><span>Total</span><strong>{fmt(total)}</strong></div>}
          <button className="cj-btn cj-btn--primary cj-btn--full" onClick={handleCrear} disabled={carrito.length===0||saving}>
            {saving ? 'Creando pedido...' : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Crear pedido · {fmt(total)}</>}
          </button>
          {carrito.length > 0 && <button className="cj-btn cj-btn--ghost cj-btn--full" onClick={() => setCarrito([])}>Limpiar carrito</button>}
        </div>
      </div>
    </div>
  );
}

function VerifyPayModal({ order, onClose, onAprobar, onRechazar }) {
  if (!order) return null;
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
          {order.comprobante ? (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Comprobante enviado por el cliente</div>
              {order.comprobanteImg && <img src={order.comprobanteImg} alt="Comprobante" style={{width:'100%',maxHeight:320,objectFit:'contain',borderRadius:10,border:'1.5px solid var(--border-input)',cursor:'zoom-in'}} onClick={() => window.open(order.comprobanteImg,'_blank')}/>}
            </div>
          ) : <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>El cliente no adjuntó comprobante.</p>}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--danger" onClick={() => { onRechazar(order); onClose(); }}>✕ Rechazar pago</button>
          <button className="cj-btn cj-btn--primary" onClick={() => { onAprobar(order); onClose(); }}>✓ Aprobar pago</button>
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
  const filtered   = filter === 'all' ? orders : orders.filter(o => o.estado === filter || (filter === 'en_preparacion' && o.estado === 'en_proceso'));
  const sorted     = [...filtered].sort((a,b) => Number(b.id) - Number(a.id));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const counts = {
    pendiente_verificacion: orders.filter(o=>o.estado==='pendiente_verificacion').length,
    pendiente:      orders.filter(o=>o.estado==='pendiente').length,
    domicilio:      orders.filter(o=>o.tipo==='domicilio'&&(o.estado==='pendiente'||o.estado==='en_preparacion')).length,
    en_preparacion: orders.filter(o=>o.estado==='en_preparacion'||o.estado==='en_proceso').length,
    listo:          orders.filter(o=>o.estado==='listo').length,
    pagado:         orders.filter(o=>o.estado==='pagado').length,
  };
  const handleStatusOpen = order => {
    if (order.estado === 'pagado') { showToast('🔒 Este pedido ya fue pagado'); return; }
    setStatus(order);
  };
  const handleStatusSave = useCallback(async (newStatus, razon) => {
    if (!statusOrder || statusOrder.estado === 'pagado') return;
    try {
      await pedidosService.cambiarEstado(statusOrder.id, newStatus);
      if (razon) await pedidosService.actualizarCampo?.(statusOrder.id, 'razonCancelacion', razon);
      refresh();
      showToast(`Estado → "${STATUS_CFG[newStatus]?.label}"${razon ? ` · ${razon.substring(0,30)}` : ''}`);
    } catch (e) {
      showToast('✕ Error al cambiar estado: ' + e.message);
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
  const handleVerifyRechazar = useCallback(async order => {
    try {
      await pedidosService.rechazarComprobante(order.id);
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
          {/* 5 — Compras: mismo módulo que usa el Admin (aprobar/rechazar
              comprobantes de compras a proveedores), el backend ya permite
              esta ruta para cualquier rol autenticado, así que solo hacía
              falta el enlace. Navega a la página completa (no es un tab
              embebido como Devoluciones, es un módulo grande aparte). */}
          <button className="cj-sidebar__item" onClick={() => navigate('/compras')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Compras
          </button>
          <div className="cj-sidebar__section">Resumen</div>
          <div className="cj-sidebar__stats">
            {[
              { dot:'#AD1457', label:'Por verificar', val: counts.pendiente_verificacion },
              { dot:'#FFB300', label:'Pendientes',    val: counts.pendiente },
              { dot:'#42A5F5', label:'En prep.',      val: counts.en_preparacion },
              { dot:'#4CAF50', label:'Listos',        val: counts.listo },
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
          <div className="cj-topbar__title">{tab==='nuevo'?'Nuevo Pedido':tab==='devoluciones'?'Devoluciones':'Pedidos Activos'}</div>
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
          {tab === 'nuevo' && <NuevoPedido showToast={showToast} onCreated={() => { refresh(); setTab('pedidos'); }}/>}
          {tab === 'devoluciones' && <DevolucionesTab showToast={showToast} sedeFiltro={sedeFiltro}/>}
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
                  {pageItems.map(order => <OrderCard key={order.id} order={order} onStatus={handleStatusOpen} onPay={setPay} onDevolucion={setDevPedido} onVerificar={setVerify} onConfirmarCobro={setCobroOrder} onDetail={setDetailOrder}/>)}
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
      {detailOrder && <PedidoDetalleModal order={detailOrder} onClose={() => setDetailOrder(null)}/>}
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