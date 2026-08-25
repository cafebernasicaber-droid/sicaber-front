// ─────────────────────────────────────────────────────────────
//  src/features/bartender/pages/BartenderPage.jsx
//  ARCHIVO NUEVO
//
//  Vista completa del bartender integrada en el proyecto admin.
//  Usa el mismo pedidosService. Solo muestra pedidos activos
//  (pendiente, en_preparacion) para que el bartender los prepare.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useTheme } from '../../../shared/contexts/ThemeContext';
import pedidosService from '../../pedidos/services/pedidosService';
import fichasTecnicasService from '../../fichasTecnicas/services/fichasTecnicasService';
import insumosService from '../../insumos/services/insumosService';
import './BartenderPage.css';

// ── Utilidades ───────────────────────────────────────────────
const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

const STATUS_CFG = {
  pendiente:      { label: 'Pendiente',      color: '#FFB300', bg: '#FFF8E1' },
  en_preparacion: { label: 'En preparación', color: '#42A5F5', bg: '#E3F2FD' },
  en_proceso:     { label: 'En proceso',     color: '#42A5F5', bg: '#E3F2FD' },
  listo:          { label: 'Listo ✓',        color: '#4CAF50', bg: '#E8F5E9' },
};

const FILTERS = [
  { key: 'all',            label: 'Todos'          },
  { key: 'pendiente',      label: 'Pendiente'      },
  { key: 'en_preparacion', label: 'En preparación' },
];

const PAGE_SIZE = 6;

// ── Tarjeta de pedido del bartender ─────────────────────────
function BartenderCard({ order, onStart, onReady, onDetail, onTomar }) {
  const cfg      = STATUS_CFG[order.estado] || STATUS_CFG.pendiente;
  const isPending = order.estado === 'pendiente';
  const isPrep    = order.estado === 'en_preparacion' || order.estado === 'en_proceso';
  const productos = order.productos || order.items || [];
  // Un pedido sin "sede" es uno de cliente que todavía no ha sido tomado
  // por ningún local (ver PATCH /pedidos/:id/tomar en el backend).
  const sinAsignar = !order.sede;

  return (
    <div className={`bt-card ${isPrep ? 'bt-card--prep' : ''}`}>
      <div className="bt-card__accent" style={{ background: cfg.color }} />

      <div className="bt-card__head">
        <div>
          <div className="bt-card__num">Pedido #{order.id}</div>
          <div className="bt-card__client">{order.cliente || '—'}</div>
        </div>
        <div>
          {sinAsignar ? (
            <span className="bt-badge" style={{ background: '#E3F2FD', color: '#1565C0' }}>
              🔓 Disponible para ambos locales
            </span>
          ) : (
            <span className="bt-badge" style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
          )}
          {isPending && !sinAsignar && <div className="bt-card__urgency">⏳ Esperando</div>}
          {isPrep    && <div className="bt-card__urgency bt-card__urgency--blue">🔄 Preparando</div>}
        </div>
      </div>

      {/* Lista de ítems con checkboxes visuales */}
      <div className="bt-card__items">
        {productos.map((it, i) => (
          <div key={i} className="bt-card__item">
            <div className="bt-card__item-check">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <span className="bt-card__qty">{it.cantidad || it.qty || 1}×</span>
            <span className="bt-card__name">{it.nombre || it.name}</span>
          </div>
        ))}
      </div>

      {/* Nota del pedido */}
      {order.notas && (
        <div className="bt-card__note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {order.notas}
        </div>
      )}

      <div className="bt-card__foot">
        <span className="bt-card__time">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {order.hora || new Date(order.fechaCreacion || Date.now()).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="bt-card__total">{fmt(order.total)}</span>
      </div>

      <div className="bt-card__actions">
        <button className="bt-btn bt-btn--ghost" onClick={() => onDetail(order)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Detalle
        </button>

        {isPending && sinAsignar && (
          <button className="bt-btn bt-btn--amber" onClick={() => onTomar(order.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Tomar pedido
          </button>
        )}

        {isPending && !sinAsignar && (
          <button className="bt-btn bt-btn--amber" onClick={() => onStart(order.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Iniciar
          </button>
        )}

        {isPrep && (
          <button className="bt-btn bt-btn--green" onClick={() => onReady(order.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Listo
          </button>
        )}
      </div>
    </div>
  );
}

// ── Componente de receta colapsable ──────────────────────────
// Solo lectura: el bartender consulta la ficha técnica para preparar el
// pedido, pero cualquier corrección se hace desde Fichas Técnicas (no hay
// ningún control de edición aquí).
//
// Dos bloques bien separados por diseño:
// - "RECETA": lo que viene de la ficha técnica (insumos + pasos) — es
//   siempre igual para ese producto, sin importar qué pidió el cliente.
// - "PERSONALIZACIÓN DE ESTE PEDIDO": lo que el cliente eligió para ESTA
//   unidad puntual (toppings/adiciones de `it.toppings`/`it.adiciones`,
//   ya resueltos en el propio pedido). Como cada unidad es una entrada
//   aparte en `order.productos` (aun si es el mismo producto repetido con
//   configuraciones distintas — ver DetailModal), este bloque siempre
//   corresponde a UNA sola unidad, nunca a un combinado de varias.
// Combina insumos base (ficha) + lo que consumen los toppings que el
// cliente mantuvo + lo que consumen las adiciones que eligió, en una sola
// lista por id_insumo (sumando cantidades si el mismo insumo aparece en
// más de una fuente) — es el fallback si el pedido todavía no trae el
// cálculo ya resuelto desde el backend (ver `recetaBackend` en RecetaItem).
function combinarRecetaPedido(fichaInsumos, toppings, adiciones, nombreInsumo) {
  const mapa = new Map();
  const agregar = (idInsumo, cantidad, unidad) => {
    if (!idInsumo || !cantidad || isNaN(cantidad)) return;
    const key = String(idInsumo);
    const previo = mapa.get(key);
    if (previo) mapa.set(key, { ...previo, cantidad: previo.cantidad + Number(cantidad) });
    else mapa.set(key, { nombre: nombreInsumo(idInsumo), cantidad: Number(cantidad), unidad });
  };
  (fichaInsumos || []).forEach(i => agregar(i.id_insumo, i.cantidad, i.unidad));
  (toppings || []).forEach(t => agregar(t.insumo_id, t.cantidad, t.unidad));
  (adiciones || []).forEach(a => agregar(a.insumo_id, a.cantidad, a.unidad));
  return Array.from(mapa.values());
}

function RecetaItem({ nombre, ficha, insumos, toppingsPedido, adicionesPedido, recetaBackend }) {
  const [open, setOpen] = useState(false);
  const fichaInsumos = ficha.insumos || [];
  const nombreInsumo = id => insumos.find(i => i.id === id || String(i.id) === String(id))?.nombre || `Insumo #${id}`;
  const toppings  = Array.isArray(toppingsPedido) ? toppingsPedido : [];
  const adiciones = Array.isArray(adicionesPedido) ? adicionesPedido : [];
  const tienePersonalizacion = toppings.length > 0 || adiciones.length > 0;
  // 2 — "Receta de este pedido": si el backend ya manda el resultado
  // combinado (insumos base + toppings mantenidos + adiciones elegidas),
  // se usa tal cual; si no, se calcula acá con los mismos datos que ya
  // tenemos, para que la sección nunca quede vacía.
  const recetaCombinada = Array.isArray(recetaBackend) && recetaBackend.length > 0
    ? recetaBackend.map(r => ({ nombre: r.nombre || nombreInsumo(r.id_insumo), cantidad: r.cantidad, unidad: r.unidad }))
    : combinarRecetaPedido(fichaInsumos, toppings, adiciones, nombreInsumo);
  return (
    <div className="bt-recipe">
      <button className="bt-recipe__toggle" onClick={() => setOpen(v => !v)}>
        <div className="bt-recipe__toggle-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span>{nombre}</span>
        </div>
        <div className="bt-recipe__toggle-meta">
          {tienePersonalizacion && <span className="bt-recipe__custom-flag" title="Esta unidad tiene personalización">🔧</span>}
          {ficha.tiempo_prep > 0 && <span className="bt-recipe__time">⏱ {ficha.tiempo_prep} min</span>}
          <span className="bt-recipe__chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="bt-recipe__body">
          {/* ── RECETA — fija, igual para cualquier pedido de este producto ── */}
          <div className="bt-recipe__group-label">Receta</div>
          {ficha.resumen_prep && <p className="bt-recipe__summary">{ficha.resumen_prep}</p>}
          {/* Insumos/ingredientes de la ficha — antes esta vista solo
              mostraba el texto de "preparacion", sin la lista de qué
              insumos y cuánto de cada uno lleva el producto. */}
          {fichaInsumos.length > 0 && (
            <div className="bt-recipe__ingredients">
              <div className="bt-recipe__section-label">Insumos</div>
              {fichaInsumos.map((ins, i) => (
                <div key={i} className="bt-recipe__ingredient-row">
                  <span>{nombreInsumo(ins.id_insumo)}</span>
                  <strong>{ins.cantidad} {ins.unidad}</strong>
                </div>
              ))}
            </div>
          )}
          {ficha.preparacion && (
            <div className="bt-recipe__steps">
              {ficha.preparacion.split('\n').filter(s => s.trim()).map((step, i) => (
                <div key={i} className="bt-recipe__step">{step}</div>
              ))}
            </div>
          )}
          {ficha.notas && (
            <div className="bt-recipe__note-text">
              <strong>Nota:</strong> {ficha.notas}
            </div>
          )}

          {/* ── PERSONALIZACIÓN DE ESTE PEDIDO — variable, propia de esta
              unidad puntual (bloque visualmente distinto a la receta para
              que se note de un vistazo qué es fijo y qué pidió el cliente). ── */}
          {tienePersonalizacion && (
            <div className="bt-recipe__custom">
              <div className="bt-recipe__custom-title">🔧 Personalización de este pedido</div>
              {toppings.length > 0 && (
                <div className="bt-recipe__custom-group">
                  <div className="bt-recipe__custom-sublabel">Toppings elegidos</div>
                  {toppings.map((t, i) => (
                    <div key={i} className="bt-recipe__custom-row"><span>🧋 {t.nombre}</span></div>
                  ))}
                </div>
              )}
              {adiciones.length > 0 && (
                <div className="bt-recipe__custom-group">
                  <div className="bt-recipe__custom-sublabel">Adiciones elegidas</div>
                  {adiciones.map((a, i) => (
                    <div key={i} className="bt-recipe__custom-row"><span>➕ {a.nombre}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── RECETA DE ESTE PEDIDO — el resultado ya combinado (base +
              toppings mantenidos + adiciones elegidas) para preparar ESTA
              unidad puntual. Distinta de la ficha técnica "estándar" de
              arriba: puede variar de una unidad a otra dentro del mismo
              pedido, por eso vive en su propio bloque, con su propio color. ── */}
          {recetaCombinada.length > 0 && (
            <div className="bt-recipe__final">
              <div className="bt-recipe__final-title">🧾 Para este pedido en particular</div>
              <p className="bt-recipe__final-hint">Insumos base + toppings mantenidos + adiciones elegidas, combinados — puede variar de una unidad a otra.</p>
              {recetaCombinada.map((r, i) => (
                <div key={i} className="bt-recipe__final-row">
                  <span>{r.nombre}</span>
                  <strong>{r.cantidad} {r.unidad || ''}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal de detalle del pedido ──────────────────────────────
function DetailModal({ order, onClose }) {
  const [productosConFicha, setProductosConFicha] = useState([]);
  // Catálogo de insumos, para resolver id_insumo → nombre en la lista de
  // ingredientes de cada receta (la ficha solo trae ids).
  const [insumos, setInsumos] = useState([]);
  useEffect(() => {
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(() => setInsumos([]));
  }, []);

  useEffect(() => {
    if (!order) return;
    const productos = order.productos || order.items || [];
    let cancelado = false;
    Promise.all(
      productos.map(it =>
        fichasTecnicasService.getByProducto(Number(it.id) || Number(it.id_producto))
          .then(ficha => ({ ...it, ficha }))
          .catch(() => ({ ...it, ficha: null }))
      )
    ).then(resultado => {
      if (!cancelado) setProductosConFicha(resultado.filter(it => it.ficha && it.ficha.estado));
    });
    return () => { cancelado = true; };
  }, [order]);

  if (!order) return null;
  const productos = order.productos || order.items || [];

  return (
    <div className="bt-modal-mask" onClick={onClose}>
      <div className="bt-modal" onClick={e => e.stopPropagation()}>
        <div className="bt-modal__head">
          <div>
            <h3>Detalle del Pedido</h3>
            <p>#{order.id} · {order.cliente}</p>
          </div>
          <button className="bt-modal__x" onClick={onClose}>✕</button>
        </div>
        <div className="bt-modal__body" style={{maxHeight:'65vh',overflowY:'auto'}}>
          <div className="bt-modal__section-label">Productos a preparar</div>
          <div className="bt-detail-items">
            {productos.map((it, i) => (
              <div key={i} className="bt-detail-item">
                <div className="bt-detail-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                    <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
                  </svg>
                </div>
                <div>
                  <div className="bt-detail-name">{it.nombre || it.name}</div>
                  <div className="bt-detail-qty">Cantidad: {it.cantidad || it.qty || 1}</div>
                </div>
                <span className="bt-detail-price">{fmt((it.precio || it.price || 0) * (it.cantidad || it.qty || 1))}</span>
              </div>
            ))}
          </div>

          {order.notas && (
            <div className="bt-modal__note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <strong>Nota:</strong> {order.notas}
            </div>
          )}

          {/* Recetas de preparación – solo visible en el módulo bartender */}
          {productosConFicha.length > 0 && (
            <div>
              <div className="bt-modal__section-label" style={{marginBottom:4,color:'var(--bt-green-d)'}}>
                Recetas de preparación
              </div>
              <p style={{fontSize:11,color:'var(--text-muted)',margin:'0 0 8px'}}>Solo consulta — la edición se hace desde Fichas Técnicas.</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {productosConFicha.map((it, i) => (
                  <RecetaItem key={i} nombre={it.nombre || it.name} ficha={it.ficha} insumos={insumos} toppingsPedido={it.toppings} adicionesPedido={it.adiciones}
                    // 2 — nombres candidatos del campo ya calculado que
                    // pueda estar mandando el backend; si ninguno viene,
                    // RecetaItem lo arma solo con lo que ya tenemos.
                    recetaBackend={it.recetaEfectiva || it.recetaPedido || it.receta_efectiva || it.insumosCalculados || null}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="bt-modal__total">
            <span>Total del pedido</span>
            <strong>{fmt(order.total)}</strong>
          </div>
        </div>
        <div className="bt-modal__foot">
          <button className="bt-sidebar__logout" style={{width:'auto'}} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────
export default function BartenderPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate         = useNavigate();

  const [orders, setOrders]   = useState([]);
  const [filter, setFilter]   = useState('all');
  const [page, setPage]       = useState(1);
  const [detail, setDetail]   = useState(null);
  const [toast, setToast]     = useState('');
  const [showLogout, setShowLogout] = useState(false);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const refresh = useCallback(() => {
    // El bartender solo debe ver pedidos de su propio local; si es
    // Administrador (sede='Ambos') ve los de los dos locales, igual que
    // antes.
    const sedeFiltro = user?.sede && user.sede !== 'Ambos' ? user.sede : undefined;
    pedidosService.getAll(sedeFiltro)
      .then(all => {
        const lista = Array.isArray(all) ? all : [];
        // Bartender solo ve pedidos activos (no pagados, no cancelados, no entregados)
        const activos = lista.filter(o =>
          o.estado === 'pendiente' ||
          o.estado === 'en_preparacion' ||
          o.estado === 'en_proceso'
        );
        setOrders(activos);
      })
      .catch(() => setOrders([]));
  }, [user]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const filtered = filter === 'all'
    ? orders
    : orders.filter(o => o.estado === filter || (filter === 'en_preparacion' && o.estado === 'en_proceso'));

  const sorted     = [...filtered].sort((a, b) => Number(b.id) - Number(a.id));
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    pendiente:      orders.filter(o => o.estado === 'pendiente').length,
    en_preparacion: orders.filter(o => o.estado === 'en_preparacion' || o.estado === 'en_proceso').length,
  };

  const handleStart = useCallback((id) => {
    pedidosService.cambiarEstado(id, 'en_preparacion')
      .then(() => { refresh(); showToast('¡Preparación iniciada!'); })
      .catch((err) => showToast(err.message || 'No se pudo actualizar el pedido.'));
  }, [refresh]);

  const handleReady = useCallback((id) => {
    pedidosService.cambiarEstado(id, 'listo')
      .then(() => { refresh(); showToast('✓ Pedido marcado como listo'); })
      .catch((err) => showToast(err.message || 'No se pudo actualizar el pedido.'));
  }, [refresh]);

  // Reclama un pedido de cliente sin local asignado para el local del
  // bartender logueado. En el .catch también se refresca la lista: si el
  // otro local ya lo tomó primero (409), el pedido debe desaparecer de
  // aquí igual, mostrando el mensaje de error tal cual lo manda el backend.
  const handleTomar = useCallback((id) => {
    pedidosService.tomar(id)
      .then(() => { refresh(); showToast('✓ Pedido tomado para tu local'); })
      .catch((err) => { refresh(); showToast(err.message || 'No se pudo tomar el pedido.'); });
  }, [refresh]);

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div className="bt-root">
      {toast && <div className="bt-toast">{toast}</div>}

      {/* ── Sidebar ── */}
      <aside className="bt-sidebar">
        <div className="bt-sidebar__logo">
          <div className="bt-sidebar__logo-ring">
            <img src="/img/Logotipo_blanco.png" alt="Sicaber" style={{width:40,height:40,objectFit:'contain',filter:'none',padding:4}}/>
          </div>
          <span className="bt-sidebar__brand">SICABER</span>
          <span className="bt-sidebar__sub">Módulo Bartender</span>
        </div>

        <nav className="bt-sidebar__nav">
          <div className="bt-sidebar__section">Cola de trabajo</div>

          <button className="bt-sidebar__item bt-sidebar__item--active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
            Mis pedidos
            {counts.pendiente > 0 && (
              <span className="bt-sidebar__badge">{counts.pendiente}</span>
            )}
          </button>

          <div className="bt-sidebar__section">Estado actual</div>

          <div className="bt-sidebar__stats">
            <div className="bt-sidebar__stat">
              <span className="bt-sidebar__stat-dot" style={{ background: '#FFB300' }}/>
              <span>Pendientes</span>
              <strong>{counts.pendiente}</strong>
            </div>
            <div className="bt-sidebar__stat">
              <span className="bt-sidebar__stat-dot" style={{ background: '#42A5F5' }}/>
              <span>Preparando</span>
              <strong>{counts.en_preparacion}</strong>
            </div>
            <div className="bt-sidebar__stat">
              <span className="bt-sidebar__stat-dot" style={{ background: '#4CAF50' }}/>
              <span>Total activos</span>
              <strong>{orders.length}</strong>
            </div>
          </div>

          <div className="bt-sidebar__section">Información</div>
          <div className="bt-sidebar__info">
            <div className="bt-sidebar__info-row">
              <span>🟡</span> Pendiente = sin iniciar
            </div>
            <div className="bt-sidebar__info-row">
              <span>🔵</span> En prep. = estás trabajando
            </div>
            <div className="bt-sidebar__info-row">
              <span>🟢</span> Listo = cajero puede cobrar
            </div>
          </div>
        </nav>

        <div className="bt-sidebar__bottom">
          <div className="bt-sidebar__user">
            <div className="bt-sidebar__avatar">
              {(user?.nombre || user?.username || 'B').charAt(0).toUpperCase()}
            </div>
            <div className="bt-sidebar__user-info">
              <span className="bt-sidebar__username">{user?.nombre || user?.username}</span>
              <span className="bt-sidebar__role">{user?.role || 'Bartender'}</span>
            </div>
          </div>
          <button className="bt-sidebar__logout" onClick={() => setShowLogout(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Salir
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="bt-main">

        {/* Topbar */}
        <div className="bt-topbar">
          <div className="bt-topbar__title">Cola de Preparación</div>
          <div style={{ flex: 1 }} />
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <div className="bt-online-pill">
            <span className="bt-pulse"/>
            Activo
          </div>
          <button className="bt-icon-btn" onClick={refresh} title="Actualizar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="bt-content">

          {/* Filtros */}
          <div className="bt-filters">
            {FILTERS.map(f => {
              const cfg = STATUS_CFG[f.key];
              return (
                <button
                  key={f.key}
                  className={`bt-chip ${filter === f.key ? 'bt-chip--on' : ''}`}
                  onClick={() => { setFilter(f.key); setPage(1); }}
                >
                  {cfg && <span className="bt-chip__dot" style={{ background: cfg.color }}/>}
                  {f.label}
                  {f.key !== 'all' && counts[f.key] > 0 && (
                    <span className="bt-chip__count">{counts[f.key]}</span>
                  )}
                </button>
              );
            })}
            <div style={{ flex: 1 }}/>
            <span className="bt-count-label">{filtered.length} en cola</span>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="bt-empty">
              <div className="bt-empty__icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                </svg>
              </div>
              <h3>Cola vacía</h3>
              <p>{filter === 'all'
                ? 'No hay pedidos activos. Los nuevos pedidos del cajero aparecerán aquí automáticamente.'
                : `No hay pedidos con estado "${STATUS_CFG[filter]?.label}".`}
              </p>
            </div>
          ) : (
            <div className="bt-grid">
              {pageItems.map(order => (
                <BartenderCard
                  key={order.id}
                  order={order}
                  onStart={handleStart}
                  onReady={handleReady}
                  onDetail={setDetail}
                  onTomar={handleTomar}
                />
              ))}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="bt-pagination">
              <button className="bt-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Ant.</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  className={`bt-page-btn ${n === page ? 'bt-page-btn--on' : ''}`}
                  onClick={() => setPage(n)}
                >{n}</button>
              ))}
              <button className="bt-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sig. →</button>
            </div>
          )}
        </div>
      </main>

      {/* Modales */}
      {detail && <DetailModal order={detail} onClose={() => setDetail(null)} />}

      {showLogout && (
        <div className="bt-modal-mask" onClick={() => setShowLogout(false)}>
          <div className="bt-modal bt-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="bt-modal__head">
              <h3>¿Cerrar sesión?</h3>
              <button className="bt-modal__x" onClick={() => setShowLogout(false)}>✕</button>
            </div>
            <div className="bt-modal__body">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>¿Estás seguro de que deseas salir?</p>
            </div>
            <div className="bt-modal__foot">
              <button className="bt-btn bt-btn--ghost" onClick={() => setShowLogout(false)}>Cancelar</button>
              <button className="bt-btn bt-btn--danger" onClick={handleLogout}>Sí, salir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}