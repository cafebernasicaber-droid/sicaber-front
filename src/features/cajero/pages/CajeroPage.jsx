import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import pedidosService      from '../../pedidos/services/pedidosService';
import devolucionesService from '../../devoluciones/services/devolucionesService';
import ventasService       from '../../ventas/services/ventasService';
// 4 — para mostrar los insumos de la ficha técnica en el detalle del
// pedido, igual que ya lo hace Bartender (mismo criterio de solo-lectura).
import fichasTecnicasService from '../../fichasTecnicas/services/fichasTecnicasService';
import insumosService        from '../../insumos/services/insumosService';
import DomiciliosBell      from '../../../shared/components/DomiciliosBell';
// El panel de "Nuevo pedido" (catálogo + carrito) se extrajo a un
// componente compartido — lo reutiliza el Admin desde Pedidos, en modal.
import NuevoPedidoPanel from '../../pedidos/components/NuevoPedidoPanel';
// Usados por DevConfirmModal (motivo de rechazo obligatorio) y por
// handleAccion (aviso al cliente al resolver una devolución).
import { LIMITES, contador } from '../../../shared/utils/limitesTexto';
import notificacionesService from '../../notificaciones/services/notificacionesService';
// Ronda 23 — se quitó el badge de EstadoPagoBadge ("Pago aprobado" /
// "Pago pendiente") de la tarjeta del cajero: duplicaba información con el
// estado del pedido y confundía (ej. "Pendiente" + "Pago aprobado" a la
// vez). El estado del pago sigue disponible en el detalle del pedido.
import { ESTADO_PEDIDO_CFG, configEstadoPedido, normalizarEstadoPedido, esEstadoPedidoTerminal, estadoDevolucionDe } from '../../../shared/utils/pedidoEstados';
import './CajeroPage.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';
const fmtHora  = iso => iso ? new Intl.DateTimeFormat('es-CO',{timeStyle:'short'}).format(new Date(iso)) : '—';

// Ronda 22 / C1 — mismos nombres/colores por estado que Admin y Cliente
// (fuente única: pedidoEstados.js). 'en_preparacion'/'listo' son valores
// LEGADOS que el backend ya no acepta — se mapean a 'en_proceso'/'en_camino'.
const STATUS_CFG = {
  ...ESTADO_PEDIDO_CFG,
  en_preparacion: ESTADO_PEDIDO_CFG.en_proceso,
  listo:          ESTADO_PEDIDO_CFG.en_camino,
};

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
// B1 — "Llave Bancolombia" es la etiqueta visible de 'transferencia'.
const METODOS   = ['Efectivo', 'Nequi', 'Llave Bancolombia'];
const PAGE_SIZE = 6;

// 7 — secuencia oficial de estados del pedido: un cajero puede avanzar pero
// nunca retroceder dentro de ella ('devuelto'/'cancelado' son salidas
// aparte, no forman parte de esta progresión y siguen disponibles siempre).
const SECUENCIA_ESTADOS = ['pendiente_verificacion', 'pendiente', 'en_proceso', 'en_camino', 'entregado'];

// 1 — un pedido en 'pendiente' necesita UNA de estas dos confirmaciones
// antes de poder pasar a "En preparación", según su método de pago — nunca
// las dos, y nunca ninguna otra cosa relacionada con comprobantes si es
// efectivo (ver también el aviso 2 más abajo, punto 1 de la tarea).
// Fix — el backend guarda esto en la columna `pago_confirmado` (ver PATCH
// /pedidos/:id/confirmar-pago: "UPDATE pedidos SET pago_confirmado = TRUE
// ..."), y lo devuelve tal cual (snake_case, sin ningún mapeo a camelCase
// en el frontend). Antes esta función miraba `cobroConfirmado` /
// `cobro_confirmado` — campos que nunca existieron en la respuesta — así
// que SIEMPRE daba false. El cobro sí quedaba confirmado en el backend
// (por eso el toast de éxito), pero la tarjeta nunca se enteraba y
// "Confirmar cobro" seguía pidiéndose una y otra vez.
const cobroYaConfirmado = order => !!(order.pagoConfirmado ?? order.pago_confirmado);
// Fix — mismo error de nombre que cobroYaConfirmado (ver arriba): el
// backend no tiene ninguna columna `comprobante_aprobado`. Aprobar el
// comprobante (PATCH /:id/comprobante/aprobar) hace exactamente lo mismo
// que confirmar el cobro en efectivo — "UPDATE pedidos SET estado =
// 'pendiente', pago_confirmado = TRUE" — así que ambos casos (efectivo y
// transferencia) se rastrean con la MISMA columna `pago_confirmado`.
const comprobanteYaAprobado = order => !!(order.pagoConfirmado ?? order.pago_confirmado);
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

// Fix — "pagado" NUNCA es un valor válido de `pedidos.estado` en el
// backend (su enum real es: pendiente_verificacion, pendiente, en_proceso,
// en_camino, entregado, cancelado). Lo "pagado" vive en la tabla `ventas`
// (estado='vendido'), asociada al pedido por `pedido_id`. Por eso
// `order.estado === 'pagado'` nunca era true — venía siempre `isPaid =
// false`, el botón "Cobrar" no desaparecía nunca y el intento de forzarlo
// vía cambiarEstado(id,'pagado') moría con "Estado no reconocido: pagado".
// Ahora `isPaid` llega como prop, calculado en el padre a partir de si ya
// existe una venta (no devuelta) para este pedido.
function OrderCard({ order, isPaid, onStatus, onPay, onDevolucion, onVerificar, onConfirmarCobro, onDetail, onReclamar }) {
  const estadoNorm = normalizarEstadoPedido(order.estado);
  const cfg    = configEstadoPedido(order.estado, order.tipo);
  const isVerificando = estadoNorm === 'pendiente_verificacion';
  const faltaAprobarComprobante = necesitaAprobarComprobantePendiente(order);
  // Fix — "Cobrar" se habilita en cualquier estado ACTIVO del pedido
  // (Pendiente, En proceso, En camino, Entregado), siempre que no esté ya
  // pagado NI cancelado. Antes solo permitía en_camino/entregado; luego,
  // al quitar esa restricción, se me quedó afuera excluir 'cancelado' —
  // por eso un pedido "Cancelado" (ej. #117) también mostraba "Cobrar",
  // cuando nunca debería poder cobrarse algo que se canceló.
  // Reglas de cobro y devolución (revisión 2026-09-11):
  //   · Cobrar   → en CUALQUIER momento mientras no esté ya pagado, sin
  //     importar el estado; lo único que nunca se cobra es un pedido
  //     'cancelado'. Se deja habilitado incluso en 'entregado': si por lo
  //     que sea un pedido llegó ahí sin cobrarse (datos viejos, un ajuste
  //     manual), tiene que poder cobrarse igual — bloquearlo dejaría plata
  //     imposible de registrar.
  //   · Entregar → esa ES la restricción real: no se marca como entregado
  //     un pedido sin cobrar. El bloqueo vive en StatusModal, y la opción
  //     se muestra apagada con el motivo, no escondida.
  //   · Devolver → solo un pedido PAGADO y ya ENTREGADO. Antes bastaba con
  //     estar pagado (o ir 'en_camino'), así que se podía devolver algo que
  //     el cliente todavía no había recibido.
  const canPay = !isPaid && estadoNorm !== 'cancelado';
  const canDev = isPaid && estadoNorm === 'entregado';
  // El pedido pagado pero aún NO entregado conserva el botón "Estado": es
  // justamente el caso que hay que poder cerrar (cobrado → entregado).
  const canStatus = estadoNorm !== 'cancelado' && estadoNorm !== 'entregado';
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
          {/* C5 — antes acá también iba EstadoPagoBadge ("Pago aprobado" /
              "Pago pendiente") debajo del estado del pedido; se quitó por
              redundante/confuso (ej. mostraba "Pendiente" + "Pago
              aprobado" a la vez en la misma tarjeta). */}
          <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
            {sinAsignar ? (
              <span className="cj-badge" style={{ background: '#E3F2FD', color: '#1565C0' }}>🔓 Sin local</span>
            ) : (
              <span className="cj-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            )}
          </div>
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
          // Pagado. Antes esta rama solo ofrecía "Devolución" y escondía
          // "Estado", así que un pedido cobrado quedaba congelado y NUNCA
          // podía marcarse como entregado — el caso más común del turno.
          // Ahora: mientras no esté entregado se sigue viendo "Estado"
          // (para cerrarlo), y la devolución aparece solo una vez entregado.
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flex:1,gap:8}}>
            <span style={{fontSize:11,color:'#9575CD',fontWeight:700,letterSpacing:0.3}}>🔒 Ya pagado</span>
            <div style={{display:'flex',gap:6}}>
              {canStatus && (
                <button className="cj-btn cj-btn--ghost" style={{fontSize:11,padding:'5px 10px'}} onClick={() => onStatus(order)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Estado
                </button>
              )}
              {canDev && (
                <button className="cj-btn cj-btn--ghost" style={{fontSize:11,padding:'5px 10px'}} onClick={() => onDevolucion(order)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.04"/></svg>
                  Devolución
                </button>
              )}
            </div>
          </div>
        ) : (
          // Fix — antes acá iba una rama aparte para "Confirmar cobro"
          // (pedidos en efectivo recién creados, 'pendiente'), un paso que
          // se pedía SIEMPRE al principio, antes de poder hacer nada más
          // con el pedido — y que además duplicaba con "Cobrar" (dos
          // "estados de cobro" distintos para la misma plata). El backend
          // nunca exigió ese paso para efectivo (solo bloquea avanzar a
          // 'en_proceso' sin pago confirmado cuando el método es
          // transferencia/Nequi — ver pagoRequiereComprobante en el
          // backend). Ahora el cobro real (registrar la venta) se hace con
          // el único botón "Cobrar", disponible en cualquier momento del
          // proceso del pedido, no solo al principio.
          <>
            {canStatus && (
              <button className="cj-btn cj-btn--ghost" onClick={() => onStatus(order)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Estado
              </button>
            )}
            {canPay && (
              <button className="cj-btn cj-btn--primary" onClick={() => onPay(order)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
                Cobrar
              </button>
            )}
            {!canPay && (
              <button className="cj-btn cj-btn--disabled" disabled
                title="Un pedido cancelado no se puede cobrar">
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

function StatusModal({ order, isPaid, error, saving, onClose, onSave }) {
  const [sel, setSel]           = useState(order?.estado || 'pendiente');
  const [razonCancel, setRazon] = useState('');
  useEffect(() => { if (order) { setSel(order.estado); setRazon(''); } }, [order]);
  // Fix — antes solo bloqueaba 'pagado'; 'cancelado'/'entregado' también
  // son terminales (ver esEstadoPedidoTerminal / handleStatusOpen, que ya
  // no deja llegar hasta acá en el flujo normal — esto es solo blindaje).
  // [DIAG] Este guard devuelve null EN SILENCIO: si se cumple, el usuario
  // pulsa "Estado" y no pasa absolutamente nada. Se deja trazado para
  // poder verlo en consola. Quitar cuando el caso esté cerrado.
  if (!order || order.estado === 'pagado' || esEstadoPedidoTerminal(order.estado)) {
    console.warn('[DIAG StatusModal] no se renderiza:', {
      hayOrder: !!order, estado: order?.estado,
      esTerminal: order ? esEstadoPedidoTerminal(order.estado) : null,
    });
    return null;
  }
  // 7 — no se puede retroceder dentro de la secuencia principal de estados;
  // 'devuelto' y 'cancelado' quedan siempre disponibles como salidas aparte.
  // C1/C3 — solo valores de estado que el backend acepta
  // (ESTADOS_PEDIDO_VALIDOS): pendiente / en_proceso / en_camino / entregado
  // / cancelado. 'devuelto' es un estado de la VENTA (flujo aparte, botón
  // "Registrar devolución"), no una transición de este selector.
  // Fix — 'cancelado' no vive en SECUENCIA_ESTADOS a propósito (índice
  // -1), pero antes ese -1 se interpretaba igual que "estado actual
  // desconocido" y dejaba pasar TODAS las opciones sin filtrar. Con el
  // guard de arriba esta rama ya no debería alcanzar a order.estado ===
  // 'cancelado', pero se deja explícito por si acaso.
  const idxActual = order.estado === 'cancelado' ? Infinity : SECUENCIA_ESTADOS.indexOf(normalizarEstadoPedido(order.estado));
  const opts = ['pendiente','en_proceso','en_camino','entregado','cancelado'].filter(s => {
    const idx = SECUENCIA_ESTADOS.indexOf(s);
    return idx === -1 || idxActual === -1 || idx >= idxActual;
  });
  // Regla nueva: a 'entregado' solo se llega con el pedido YA COBRADO.
  // No se esconde la opción (escondida, el cajero no entiende por qué le
  // faltan estados): se muestra deshabilitada y con el motivo a la vista.
  const entregaBloqueada = s => s === 'entregado' && !isPaid;
  // [DIAG] Qué opciones quedaron disponibles y por qué.
  console.log('[DIAG StatusModal] abierto', { id: order.id, estado: order.estado, idxActual, opts, isPaid });
  return (
    <div className="cj-modal-mask" onClick={onClose}>
      <div className="cj-modal" onClick={e => e.stopPropagation()}>
        <div className="cj-modal__head">
          <div><h3>Actualizar Estado</h3><p>Pedido #{order.id} · {order.cliente}</p></div>
          <button className="cj-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="cj-modal__body">
          <div className="cj-status-options">
            {opts.map(s => {
              const cfg = configEstadoPedido(s, order.tipo);
              // etiqueta dependiente del tipo de entrega ('en_camino' →
              // "En camino" / "Listo para recoger")
              const label = cfg.label;
              const bloqueada = entregaBloqueada(s);
              return (
                <div key={s}
                  className={`cj-status-opt ${sel===s?'selected':''} ${bloqueada?'cj-status-opt--locked':''}`}
                  onClick={() => { if (!bloqueada) setSel(s); }}
                  title={bloqueada ? 'Cobra el pedido antes de marcarlo como entregado' : ''}
                  style={sel===s && !bloqueada ? {borderColor:cfg.color,background:cfg.bg} : {}}>
                  <span className="cj-status-dot" style={{background:cfg.color}}/>
                  {label}
                  {bloqueada && <span className="cj-status-lock">🔒 Cobra primero</span>}
                  {sel===s && !bloqueada && <span className="cj-status-check">✓</span>}
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
          {/* El backend rechaza ciertas transiciones con un motivo concreto
              (409: comprobante sin aprobar, retroceso de estado, pedido de
              otro local...). Ese texto se perdía en un toast de 2,8 s
              porque el modal se cerraba antes: quedaba la sensación de que
              "no deja seguir con los estados" sin decir por qué. */}
          {error && (
            <div style={{marginTop:12,padding:'10px 12px',borderRadius:8,background:'rgba(229,57,53,0.10)',border:'1px solid rgba(229,57,53,0.35)'}}>
              <div style={{display:'flex',gap:7,alignItems:'flex-start'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'#E53935',marginBottom:3}}>No se pudo cambiar el estado</div>
                  <div style={{fontSize:12,lineHeight:1.45,color:'var(--text-primary,#333)'}}>{error}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" disabled={entregaBloqueada(sel) || saving}
            onClick={() => { if (entregaBloqueada(sel) || saving) return; onSave(sel, razonCancel.trim()); }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
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

function PayModal({ order, onClose, onConfirm, error, saving }) {
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
          {/* El backend rechaza el cobro con un motivo concreto (ej. "el
              pedido no tiene un local válido resuelto"). Antes ese texto
              solo pasaba por un toast de 2,8 s y se perdía: quedaba la
              sensación de que el botón "no hacía nada". Ahora el error se
              queda fijo en el modal, con el modal abierto. */}
          {error && (
            <div style={{marginTop:12,padding:'10px 12px',borderRadius:8,background:'rgba(229,57,53,0.10)',border:'1px solid rgba(229,57,53,0.35)'}}>
              <div style={{display:'flex',gap:7,alignItems:'flex-start'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'#E53935',marginBottom:3}}>No se pudo registrar el cobro</div>
                  <div style={{fontSize:12,lineHeight:1.45,color:'var(--text-primary,#333)'}}>{error}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="cj-btn cj-btn--primary" disabled={!method || saving} onClick={() => method && !saving && onConfirm(method)}>
            {saving ? 'Registrando...' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DevConfirmModal({ dev, accion, onClose, onConfirm, venta }) {
  const esAprobar = accion === 'aprobar';
  // Mismo motivo obligatorio que exige el backend al rechazar (mínimo 10
  // caracteres). Sin este campo el rechazo desde el Cajero moría con un 400,
  // igual que pasaba en el módulo de Devoluciones del Admin.
  const [motivo, setMotivo] = useState('');
  const motivoValido = motivo.trim().length >= LIMITES.MOTIVO_MINIMO;
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
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:6}}>
                Motivo del rechazo <span style={{color:'#EF5350'}}>*</span>
              </label>
              <textarea
                autoFocus
                value={motivo}
                onChange={e => setMotivo(e.target.value.replace(/^\s+/, '').slice(0, LIMITES.MOTIVO))}
                placeholder="Explica por qué se rechaza (mínimo 10 caracteres)..."
                rows={3} maxLength={LIMITES.MOTIVO}
                style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',borderRadius:8,fontSize:13,fontFamily:'inherit',resize:'vertical',background:'var(--bg-input)',color:'var(--text-primary)',border:`1.5px solid ${motivo && !motivoValido ? '#EF5350' : 'var(--border-input)'}`}}
              />
              <div style={{fontSize:11,color:'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(motivo,LIMITES.MOTIVO)}</div>
              {motivo && !motivoValido && (
                <div style={{fontSize:12,color:'#EF5350',marginTop:2}}>El motivo debe tener al menos {LIMITES.MOTIVO_MINIMO} caracteres.</div>
              )}
            </div>
          )}
        </div>
        <div className="cj-modal__foot">
          <button className="cj-btn cj-btn--ghost" onClick={onClose}>Cancelar</button>
          {esAprobar
            ? <button className="cj-btn cj-btn--primary" onClick={() => onConfirm()}>✅ Aprobar</button>
            : <button className="cj-btn" style={{background:'#C62828',color:'#fff',border:'none',opacity:motivoValido?1:0.5,cursor:motivoValido?'pointer':'not-allowed'}}
                disabled={!motivoValido} onClick={() => onConfirm(motivo.trim())}>❌ Rechazar</button>
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

  const handleAccion = (dev, accion, motivoRechazo) => {
    devolucionesService.cambiarEstado(dev.id, accion === 'aprobar' ? 'aprobada' : 'rechazada', motivoRechazo)
      .then(() => {
        // Mismo aviso al cliente que ya se manda al aprobar/rechazar un
        // comprobante de pago. `cliente_id` lo devuelve DEV_SELECT.
        notificacionesService.create({
          clienteId: dev.cliente_id,
          pedidoId: dev.pedido_id,
          tipo: accion === 'aprobar' ? 'devolucion_aprobada' : 'devolucion_rechazada',
          mensaje: accion === 'aprobar'
            ? `✅ Tu solicitud de devolución del pedido #${dev.pedido_id} fue aprobada. Nos pondremos en contacto para gestionar el reembolso.`
            : `❌ Tu solicitud de devolución del pedido #${dev.pedido_id} fue rechazada. Motivo: ${motivoRechazo}`,
        });
        refresh();
        showToast(accion === 'aprobar' ? '✅ Devolución aprobada' : '❌ Devolución rechazada');
        // El modal solo se cierra si la operación salió bien: antes se
        // cerraba siempre, así que un fallo dejaba al usuario sin la
        // devolución actualizada y sin forma de reintentar.
        setConfirm(null);
      })
      .catch((err) => showToast(err.message || 'No se pudo actualizar la devolución.'));
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
  const [ventasCajero, setVentasCajero] = useState([]);
  const [statusOrder, setStatus]  = useState(null);
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [payOrder, setPay]        = useState(null);
  const [payError, setPayError]   = useState('');
  const [paySaving, setPaySaving] = useState(false);
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
  // Fix (2026-09-11) — "Cobrar" no surtía efecto en la tarjeta.
  // `refresh()` solo recargaba PEDIDOS, y la lista de ventas (de donde sale
  // `pedidosPagadosIds`, es decir quién está pagado) se recargaba en un
  // useEffect cuya dependencia era `orders.length`. Cobrar no cambia la
  // CANTIDAD de pedidos — el pedido sigue existiendo, solo que ahora tiene
  // una venta asociada — así que ese efecto no volvía a dispararse nunca:
  // el backend registraba la venta y mostraba "✓ Pago confirmado", pero la
  // tarjeta seguía ofreciendo "Cobrar" hasta que por casualidad entrara un
  // pedido nuevo y cambiara el length. Ahora `refresh()` recarga ambas
  // cosas juntas, que es lo que significa "refrescar la pantalla".
  const recargarVentas = useCallback(() =>
    ventasService.getAll(sedeFiltro).then(d => setVentasCajero(Array.isArray(d) ? d : [])).catch(() => {}),
  [sedeFiltro]);
  const refresh = useCallback(() => Promise.all([
    pedidosService.getAll(sedeFiltro).then(d => setOrders(Array.isArray(d) ? d : [])).catch(()=>{}),
    recargarVentas(),
  ]), [sedeFiltro, recargarVentas]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  // 6 — estadísticas visibles del cajero: "Pedidos atendidos" (los que él
  // mismo atendió, por nombre — campo `barista` del pedido) y "Ventas
  // realizadas" (de su local; ventas no guarda "atendido por" individual,
  // así que a nivel de local es lo más preciso que expone el backend hoy —
  // ver GET /ventas/stats, que no filtra por cajero ni por sede).
  // (la carga de ventasCajero vive ahora en refresh/recargarVentas, arriba:
  // dependía de orders.length, que no cambia al cobrar — ver el comentario)
  const pedidosAtendidos = orders.filter(o => o.barista && (o.barista === user?.nombre || o.barista === user?.username)).length;
  const ventasRealizadas = ventasCajero.filter(v => v.estado !== 'devuelto').length;
  const totalVentasCajero = ventasCajero.filter(v => v.estado !== 'devuelto').reduce((s, v) => s + (Number(v.total) || 0), 0);
  // Fix — "pagado" no es un estado del pedido, es la existencia de una
  // venta (no devuelta) asociada a él. `ventasCajero` ya se carga arriba
  // para las estadísticas del cajero; se reutiliza acá para saber qué
  // pedidos ya están cobrados (pedido_id / id_pedido según venga del
  // backend) y así ocultarles el botón "Cobrar" de una vez por todas.
  const pedidosPagadosIds = new Set(
    ventasCajero.filter(v => v.estado !== 'devuelto').map(v => String(v.pedido_id ?? v.id_pedido))
  );
  const esPagado = order => pedidosPagadosIds.has(String(order.id));
  // Se normalizan los valores legados ('en_preparacion'→'en_proceso',
  // 'listo'→'en_camino') para comparar contra el conjunto real del backend.
  const estN = o => normalizarEstadoPedido(o.estado);
  // Un pedido con devolución aprobada (parcial o total) deja de ser un
  // pedido "activo" para el cajero — ya no se lista acá (con badge
  // "Devuelto" o sin él); a partir de ahora solo se consulta desde el
  // módulo de Devoluciones.
  const sinDevolucion = o => estadoDevolucionDe(o) === 'ninguna';
  const filtered   = (filter === 'all' ? orders : filter === 'pagado' ? orders.filter(esPagado) : orders.filter(o => estN(o) === filter)).filter(sinDevolucion);
  const sorted     = [...filtered].sort((a,b) => Number(b.id) - Number(a.id));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems  = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const counts = {
    pendiente_verificacion: orders.filter(o=>estN(o)==='pendiente_verificacion').length,
    pendiente:      orders.filter(o=>estN(o)==='pendiente').length,
    domicilio:      orders.filter(o=>o.tipo==='domicilio'&&(estN(o)==='pendiente'||estN(o)==='en_proceso')).length,
    en_proceso:     orders.filter(o=>estN(o)==='en_proceso').length,
    en_camino:      orders.filter(o=>estN(o)==='en_camino').length,
    pagado:         orders.filter(esPagado).length,
  };
  const handleStatusOpen = order => {
    // [DIAG] Traza del click en "Estado". Quitar cuando el caso esté cerrado.
    console.log('[DIAG handleStatusOpen] click', {
      id: order?.id, estado: order?.estado,
      normalizado: normalizarEstadoPedido(order?.estado),
      esTerminal: esEstadoPedidoTerminal(order?.estado),
      pagado: esPagado(order),
    });
    setStatusError('');
    // Antes acá se rechazaba cualquier pedido ya pagado ("🔒 Este pedido ya
    // fue pagado"), lo que dejaba el pedido cobrado congelado en su estado:
    // no había forma de marcarlo como entregado y, por lo tanto, tampoco de
    // llegar a la devolución (que ahora exige pagado + entregado). Cobrar y
    // avanzar el estado son dos ejes independientes; el único bloqueo real
    // es el inverso — no entregar sin cobrar, que se aplica en StatusModal.
    // Fix — 'cancelado' y 'entregado' son estados TERMINALES: el backend
    // (PATCH /pedidos/:id/estado) los rechaza con 409 sin importar qué se
    // intente mandar ("...ya está 'cancelado' y no admite más cambios de
    // estado."). Antes el modal igual se abría mostrando las 5 opciones
    // como si nada (el cálculo de opciones interpretaba mal el "no
    // encontrado" de 'cancelado' en SECUENCIA_ESTADOS como "mostrar
    // todas"), así que el cajero elegía un estado, le daba Guardar, y
    // siempre fallaba — daba la sensación de que "no le salían" los demás
    // estados. Ahora se avisa de una vez, sin dejar abrir el modal.
    if (esEstadoPedidoTerminal(order.estado)) {
      showToast(`🔒 Este pedido ya está "${STATUS_CFG[normalizarEstadoPedido(order.estado)]?.label || order.estado}" y no admite más cambios de estado.`);
      return;
    }
    setStatus(order);
  };
  const handleStatusSave = useCallback(async (newStatus, razon) => {
    if (!statusOrder) return;
    try {
      setStatusError(''); setStatusSaving(true);
      await pedidosService.cambiarEstado(statusOrder.id, newStatus);
      if (razon) await pedidosService.actualizarCampo?.(statusOrder.id, 'razonCancelacion', razon);
      await refresh();
      showToast(`Estado → "${STATUS_CFG[newStatus]?.label}"${razon ? ` · ${razon.substring(0,30)}` : ''}`);
      setStatus(null);
    } catch (e) {
      // El modal NO se cierra: antes se cerraba pasara lo que pasara (el
      // onClose iba en el mismo onClick que el guardado), así que el error
      // llegaba a una pantalla donde ya no había contexto.
      console.error('[estado] PATCH /pedidos/:id/estado falló:', e);
      setStatusError(e.message || 'Error desconocido al cambiar el estado.');
    } finally { setStatusSaving(false); }
  }, [statusOrder, refresh]);
  const handlePayConfirm = useCallback(async method => {
    if (!payOrder) return;
    try {
      // Fix — "pagado" no existe como valor de `pedidos.estado` en el
      // backend (su enum real es pendiente_verificacion, pendiente,
      // en_proceso, en_camino, entregado, cancelado); intentar forzarlo con
      // cambiarEstado(id,'pagado') siempre respondía 400 "Estado no
      // reconocido: pagado" y el cobro nunca quedaba registrado. Lo único
      // que hace falta es crear la venta — POST /ventas/desde-pedido ya
      // descuenta el inventario y deja la venta en estado='vendido'; con
      // eso el pedido pasa a considerarse pagado (ver pedidosPagadosIds).
      setPayError(''); setPaySaving(true);
      await ventasService.crearDesde(payOrder.id);
      // Hueco detectado: "Cobrar" creaba la VENTA pero dejaba el pedido con
      // pago_confirmado = false. El backend usa ese flag en
      // PATCH /pedidos/:id/estado para bloquear con 409 cualquier estado a
      // partir de 'en_proceso' cuando el método exige comprobante, así que
      // un pedido ya cobrado se quedaba sin poder avanzar. Se marca también
      // a nivel de pedido, best-effort: la ruta responde 400 para
      // Nequi/Transferencia (esos se confirman aprobando el comprobante),
      // y eso NO es un fallo del cobro — la venta ya quedó registrada.
      try { await pedidosService.confirmarPago(payOrder.id); }
      catch (err) { console.info('[cobro] pago_confirmado no aplicable a este pedido:', err.message); }
      // await: sin esperar la recarga, el toast aparecía antes de que la
      // tarjeta supiera del cobro y quedaba un parpadeo con "Cobrar" aún
      // visible.
      await refresh();
      showToast(`✓ Pago confirmado — ${method}`);
      setPay(null);
    } catch(e) {
      // El modal se queda ABIERTO con el motivo a la vista. Antes se
      // mostraba solo en un toast efímero y el cajero volvía a intentar
      // sin saber qué estaba fallando (de ahí los 4 POST seguidos con 400
      // en la consola).
      console.error('[cobro] POST /ventas/desde-pedido falló:', e);
      setPayError(e.message || 'Error desconocido al registrar la venta.');
    } finally { setPaySaving(false); }
  }, [payOrder, refresh]);
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
          {/* El enlace a Compras que vivía acá se quitó: el rol Cajero no
              tiene (ni debe tener) el permiso "ver_compras" — el comentario
              anterior decía que "el backend ya permite esta ruta para
              cualquier rol autenticado", pero eso ignoraba el permiso real
              del rol. Con el enlace visible pero sin el permiso, un cajero
              caía en /acceso-no-autorizado al hacer clic — peor que no
              mostrarlo. Compras es un módulo de Admin, no de Cajero. */}
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
              { dot:'#1565C0', label:'En proceso',    val: counts.en_proceso },
              { dot:'#00838F', label:'En camino/listos', val: counts.en_camino },
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
          {tab === 'nuevo' && <NuevoPedidoPanel modo="cajero" showToast={showToast} onCreated={() => { refresh(); setTab('pedidos'); }}/>}
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
                  {pageItems.map(order => <OrderCard key={order.id} order={order} isPaid={esPagado(order)} onStatus={handleStatusOpen} onPay={setPay} onDevolucion={setDevPedido} onVerificar={setVerify} onConfirmarCobro={setCobroOrder} onDetail={setDetailOrder} onReclamar={handleReclamar}/>)}
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
      {statusOrder && <StatusModal order={statusOrder} isPaid={esPagado(statusOrder)} error={statusError} saving={statusSaving} onClose={() => { setStatus(null); setStatusError(''); }} onSave={handleStatusSave}/>}
      {payOrder && <PayModal order={payOrder} error={payError} saving={paySaving} onClose={() => { setPay(null); setPayError(''); }} onConfirm={handlePayConfirm}/>}
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