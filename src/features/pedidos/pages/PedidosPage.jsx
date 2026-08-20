import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../../../shared/contexts/AuthContext';
import LocalFiltro from '../../../shared/components/LocalFiltro';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import './PedidosPage.css';

const METODOS_PAGO_LABEL = { nequi: 'Nequi', transferencia: 'Transferencia', efectivo: 'Efectivo en caja' };

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const POR_PAGINA = 8;

/* ── MODAL DETALLE ── */
function ModalDetalle({ pedido, onClose, onCambiarEstado, onAprobarPago, onRechazarPago }) {
  const cfg = ESTADO_CONFIG[pedido.estado] || {};
  // El backend guarda los productos en la columna "items" y la imagen del
  // comprobante en "comprobante_img". El listado ya tenía este fallback,
  // pero el modal de detalle no, así que siempre mostraba "Sin productos
  // registrados" y nunca la imagen del comprobante aunque sí existieran.
  const productos     = Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []);
  const comprobanteImg = pedido.comprobanteImg || pedido.comprobante_img || null;
  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="pd-modal-head">
          <div>
            <div className="pd-modal-eyebrow">Pedido</div>
            <div className="pd-modal-id">#{pedido.id}</div>
          </div>
          <span className="pd-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label || pedido.estado}</span>
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
        <div className="pd-total-card">
          <span className="pd-info-label">Total</span>
          <span className="pd-total-amt">{fmt(pedido.total)}</span>
        </div>
        {pedido.comprobante && (
          <div className="pd-info-card" style={{marginBottom:14}}>
            <div className="pd-info-label">Comprobante de pago</div>
            <div className="pd-info-val">{pedido.comprobante}</div>
            {comprobanteImg && (
              <img src={comprobanteImg} alt="Comprobante"
                style={{marginTop:10,width:'100%',maxHeight:320,objectFit:'contain',borderRadius:10,border:'1.5px solid var(--border)',cursor:'zoom-in',background:'#fafafa'}}
                onClick={() => window.open(comprobanteImg, '_blank')}/>
            )}
          </div>
        )}
        <div className="pd-productos-section">
          <div className="pd-info-label" style={{ marginBottom: 10 }}>Productos</div>
          {productos.length > 0
            ? productos.map((x, i) => {
                const nombre = x.nombre || (typeof x === 'string' ? x : 'Producto');
                const cant = x.cantidad || 1;
                const sub = x.precio ? x.precio * cant : null;
                return (
                  <div key={i} className={`pd-prod-row ${i % 2 === 0 ? 'pd-prod-row-alt' : ''}`}>
                    <span className="pd-prod-name">
                      {nombre}
                      {cant > 1 && <span className="pd-prod-qty-badge">x{cant}</span>}
                      {x.adiciones && x.adiciones.length > 0 && (
                        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{x.adiciones.map(a=>a.nombre||a).join(', ')}</div>
                      )}
                    </span>
                    {sub && <span className="pd-prod-sub">{fmt(sub)}</span>}
                  </div>
                );
              })
            : <p className="pd-no-prods">Sin productos registrados</p>
          }
        </div>
        {pedido.estado === 'pendiente_verificacion' && onCambiarEstado && (
          <div style={{background:'rgba(173,20,87,0.1)',color:'#AD1457',padding:'8px 12px',borderRadius:8,marginBottom:10,fontSize:12.5,fontWeight:600}}>
            ⚠ Verifica el comprobante de pago para continuar. El pedido no puede pasar a "En preparación" hasta aprobarlo.
          </div>
        )}
        <div className="pd-modal-actions">
          {pedido.estado === 'pendiente_verificacion' && onCambiarEstado ? (
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

/* ── MODAL NUEVO / EDITAR PEDIDO ── */
function ModalPedido({ pedido, onClose, onSave }) {
  const isEdit = !!pedido;
  const [empleados,     setEmpleados]     = useState([]);
  const [clientesLista, setClientesLista] = useState([]);
  const [productosMenu, setProductosMenu] = useState([]);
  const [adiciones,     setAdiciones]     = useState([]);
  // 3 — locales físicos de recogida (GET /locales), para el selector que
  // aparece cuando el tipo de entrega es "En el Local" — distinto de
  // `sede` (Local 1/Local 2, a quién atiende el pedido).
  const [locales, setLocales] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [emps, cls, prods, adics, locs] = await Promise.allSettled([
        empleadosService.getAll(),
        clientesService.getAll(),
        productosService.getActivos ? productosService.getActivos() : productosService.getAll(),
        adicionesService.getAll ? adicionesService.getAll() : Promise.resolve([]),
        localesService.getActivos(),
      ]);
      if (emps.status  === 'fulfilled') setEmpleados(emps.value   || []);
      if (cls.status   === 'fulfilled') setClientesLista((cls.value || []).filter(c => c.estado !== false));
      if (prods.status === 'fulfilled') setProductosMenu(prods.value || []);
      if (adics.status === 'fulfilled') setAdiciones(adics.value  || []);
      if (locs.status  === 'fulfilled') setLocales((Array.isArray(locs.value) ? locs.value : []).filter(l => l.estado !== false && l.estado !== 'Inactivo'));
    };
    load();
  }, []);

  const atienden = empleados.filter(e => e.estado === 'Activo' && e.cargo !== 'Domiciliario');
  const domis    = empleados.filter(e => e.estado === 'Activo' && e.cargo === 'Domiciliario');
  const cats     = ['Todos', ...new Set(productosMenu.map(p => p.categoria))];

  // Al editar, partimos de los productos ya guardados en el pedido
  // (backend: "items", alias "productos"). Normalizamos precioTotal/
  // cantidad porque pedidos creados desde la landing usan "precioFinal"
  // en vez de "precioTotal".
  const productosIniciales = pedido
    ? (Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []))
        .map(x => ({ ...x, precioTotal: x.precioTotal ?? x.precioFinal ?? x.precio, cantidad: x.cantidad || 1 }))
    : [];

  const [f, setF] = useState({
    cliente:      pedido?.cliente || '',
    tipo:         pedido?.tipo || 'local',
    pago:         pedido?.pago || 'efectivo',
    productos:    productosIniciales,
    barista:      pedido?.barista || '',
    domiciliario: pedido?.domiciliario || '',
    // Local para el que es este pedido. El admin gestiona los dos locales,
    // así que debe elegir a cuál va destinado cada pedido que crea.
    sede:         pedido?.sede || '',
    // 3 — local físico de recogida (tabla `locales`, GET /locales) — solo
    // aplica cuando tipo:'local'. Mismo campo que ya usa la Landing.
    localId:      pedido?.localId ? String(pedido.localId) : '',
    localNombre:  pedido?.localNombre || '',
  });
  const [cat, setCat]            = useState('Todos');
  const [busquedaProd, setBusquedaProd] = useState('');
  const [prodSel, setProdSel]    = useState(null);
  const [adicsSelec, setAdicsSelec] = useState([]);
  const [cantSel, setCantSel]    = useState(1);

  // 4 — las adiciones son universales: aplican a todos los productos por
  // igual, nunca filtradas por categoría ni producto (la tabla "adiciones"
  // ni siquiera tiene columna "categoria" — el filtro anterior comparaba
  // contra un campo que no existe y por eso nunca hacía nada; se deja
  // explícito para que no parezca un filtro real y alguien confíe en él).
  const adicsParaProd = prodSel ? adiciones : [];
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const getCant = id => (f.productos.find(x => x.id === id) || {}).cantidad || 0;

  const seleccionarProd = (prod) => { setProdSel(prod); setAdicsSelec([]); setCantSel(1); };
  const toggleAdic = (a) => setAdicsSelec(prev => prev.find(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]);

  const confirmarAgregar = () => {
    const extraTotal = adicsSelec.reduce((s, a) => s + a.precio, 0);
    const precioTotal = prodSel.precio + extraTotal;
    const item = { ...prodSel, adiciones: adicsSelec, precioTotal, cantidad: cantSel };
    const existe = f.productos.find(x => x.id === prodSel.id);
    set('productos', existe ? f.productos.map(x => x.id === prodSel.id ? item : x) : [...f.productos, item]);
    setProdSel(null); setAdicsSelec([]); setCantSel(1);
  };

  const removeProd = id => set('productos', f.productos.filter(x => x.id !== id));
  const cambiarCant = (id, delta) => {
    const nueva = (getCant(id) || 0) + delta;
    if (nueva <= 0) removeProd(id);
    else set('productos', f.productos.map(x => x.id === id ? { ...x, cantidad: nueva } : x));
  };

  const prods = (() => {
    let list = cat === 'Todos' ? productosMenu : productosMenu.filter(p => p.categoria === cat);
    if (busquedaProd.trim()) list = list.filter(p => p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()));
    return list;
  })();

  const total = f.productos.reduce((s, p) => s + (p.precioTotal || p.precio) * (p.cantidad || 1), 0);

  const crear = () => {
    if (!f.productos.length) { alert('Selecciona al menos un producto'); return; }
    if (!f.barista)          { alert('Selecciona quién atiende el pedido'); return; }
    if (!f.sede)             { alert('Selecciona el local de este pedido'); return; }
    // "Local de recogida" y "Local *" apuntaban al mismo local físico
    // (mismo `locales`/GET /locales) y se pedían dos veces en dos campos
    // distintos — ahora un único selector ("Local *") llena ambos: `sede`
    // (a quién se le asigna el pedido) y localId/localNombre (local de
    // recogida real, mismo campo que ya usa el checkout del cliente).
    if (f.tipo === 'local' && !f.localId) { alert('Selecciona el local donde el cliente recogerá el pedido'); return; }
    if (f.tipo === 'domicilio' && !f.domiciliario) { alert('Selecciona un domiciliario'); return; }
    if (f.tipo === 'domicilio' && (!isEdit || pedido.tipo !== 'domicilio')) {
      const ok = window.confirm('⚠️ El servicio a domicilio solo cubre la comuna 8 y 9 de Medellín.\n\n¿Continuar?');
      if (!ok) return;
    }
    if (isEdit) {
      onSave({ ...f, total, id: pedido.id });
    } else {
      onSave({ ...f, total, hora: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}), estado: 'pendiente' });
    }
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal pd-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-head">
          <div>
            <div className="pd-modal-eyebrow">{isEdit ? 'Editar pedido' : 'Nuevo pedido'}</div>
            <div className="pd-modal-id" style={{ fontSize: 18 }}>{isEdit ? `Pedido #${pedido.id}` : 'Completa los datos'}</div>
          </div>
        </div>

        <div className="pd-form-row">
          <div className="pd-form-group">
            <label>Cliente <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:12}}>(opcional)</span></label>
            <input
              type="text"
              placeholder="Nombre del cliente o dejar vacío"
              value={f.cliente}
              onChange={e => set('cliente', e.target.value)}
              list="clientes-sugeridos"
            />
            <datalist id="clientes-sugeridos">
              {clientesLista.map(c => <option key={c.id} value={c.nombre}>{c.nombre} — {c.correo}</option>)}
            </datalist>
          </div>
          <div className="pd-form-group">
            <label>Método de pago</label>
            <select value={f.pago} onChange={e => set('pago', e.target.value)}>
              {/* Mismos 3 métodos que Landing/Cajero — sin Tarjeta ni Daviplata. */}
              {['efectivo','nequi','transferencia'].map(p => <option key={p} value={p}>{METODOS_PAGO_LABEL[p]}</option>)}
            </select>
          </div>
        </div>

        <div className="pd-form-group">
          <label>Tipo de entrega</label>
          {/* Los domicilios solo aplican a pedidos que el cliente hace por su
              cuenta desde la tienda/app — un pedido creado a mano por el
              admin siempre es para recoger en el local. Se mantiene la
              opción "A Domicilio" únicamente si se está editando un pedido
              que YA es a domicilio (no se le cambia el tipo a un pedido real
              del cliente solo por abrirlo en el admin). */}
          {(isEdit && pedido.tipo === 'domicilio') ? (
            <div className="pd-tipo-selector">
              {[{val:'local',lbl:'En el Local',ic:'🏠'},{val:'domicilio',lbl:'A Domicilio',ic:'🛵'}].map(t => (
                <div key={t.val} className={`pd-tipo-option ${f.tipo===t.val?'pd-tipo-selected':''}`} onClick={() => set('tipo', t.val)}>
                  <span>{t.ic}</span><span>{t.lbl}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="pd-tipo-selector">
                <div className="pd-tipo-option pd-tipo-selected">
                  <span>🏠</span><span>En el Local</span>
                </div>
              </div>
              <p className="pd-hint" style={{marginTop:6}}>
                Los pedidos a domicilio solo se piden desde la tienda del cliente.
              </p>
            </>
          )}
        </div>

        {/* Antes: dos campos pidiendo lo mismo — "Local de recogida"
            (select) y "Local *" (botones), ambos sacados del mismo GET
            /locales. Ahora un único selector llena los dos campos que
            espera el backend: `sede` (a qué local/personal se asigna el
            pedido) y localId/localNombre (local de recogida, mismo campo
            que ya usa el checkout del cliente). */}
        <div className="pd-form-group">
          <label>Local <span className="required">*</span></label>
          {locales.length === 0 ? (
            <p className="pd-hint">No hay locales activos registrados.</p>
          ) : (
            <div className="pd-tipo-selector">
              {locales.map(l => (
                <div key={l.id} className={`pd-tipo-option ${f.sede===l.nombre?'pd-tipo-selected':''}`}
                  onClick={() => setF(p => ({ ...p, sede: l.nombre, localId: String(l.id), localNombre: l.nombre }))}>
                  <span>🏪</span><span>{l.nombre}</span>
                </div>
              ))}
            </div>
          )}
          <p className="pd-hint" style={{marginTop:6}}>
            {f.tipo === 'local'
              ? 'El local donde el cliente recogerá el pedido, y el único cajero/bartender que lo verá.'
              : 'El pedido solo aparecerá para el cajero y el bartender de ese local.'}
          </p>
        </div>

        <div className="pd-personal-section">
          <div className="pd-personal-title">Personal asignado</div>
          <div className="pd-personal-cols">
            <div className="pd-personal-col">
              <label>Atendido por *</label>
              {atienden.length === 0 ? <p className="pd-hint">Sin trabajadores activos</p> : (
                <div className="pd-worker-grid">
                  {atienden.map(e => (
                    <div key={e.id} className={`pd-worker-card ${f.barista===e.nombre?'pd-worker-sel':''}`} onClick={() => set('barista', e.nombre)}>
                      <div className="pd-worker-av">{e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                      <div className="pd-worker-name">{e.nombre.split(' ')[0]}</div>
                      <div className="pd-worker-cargo">{e.cargo}</div>
                      {f.barista===e.nombre && <div className="pd-worker-check">✓</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {f.tipo === 'domicilio' && (
              <div className="pd-personal-col">
                <label>Domiciliario *</label>
                {domis.length === 0 ? (
                  <div className="pd-domi-empty"><span>🛵</span><span>Sin domiciliarios activos.</span></div>
                ) : (
                  <div className="pd-worker-grid">
                    {domis.map(e => (
                      <div key={e.id} className={`pd-worker-card pd-domi-card ${f.domiciliario===e.nombre?'pd-worker-sel':''}`} onClick={() => set('domiciliario', e.nombre)}>
                        <div className="pd-worker-av pd-domi-av">{e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                        <div className="pd-worker-name">{e.nombre.split(' ')[0]}</div>
                        <div className="pd-worker-cargo">🛵</div>
                        {f.domiciliario===e.nombre && <div className="pd-worker-check">✓</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pd-form-group">
          <label>Productos del menú</label>
          <div className="pd-prod-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="pd-prod-search-input" placeholder="Buscar producto..." value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)}/>
            {busquedaProd && <button className="pd-prod-search-clear" onClick={() => setBusquedaProd('')}>✕</button>}
          </div>
          <div className="pd-cats">
            {cats.map(c => <button key={c} className={`pd-cat-btn ${cat===c?'pd-cat-on':''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="pd-prod-grid-v2">
            {prods.length === 0 ? (
              <div className="pd-prod-grid-v2__empty">Sin productos{busquedaProd ? ` para "${busquedaProd}"` : ''}</div>
            ) : prods.map(p => {
              const cant = getCant(p.id);
              const activo = prodSel?.id === p.id;
              return (
                <div key={p.id} className={`pd-prod-card-v2${cant>0?' pd-prod-card-v2--sel':''}${activo?' pd-prod-card-v2--active':''}`} onClick={() => seleccionarProd(p)}>
                  {cant > 0 && <div className="pd-prod-card-v2__badge">{cant}</div>}
                  <div className="pd-prod-card-v2__body">
                    <div className="pd-prod-card-v2__cat">{p.categoria}</div>
                    <div className="pd-prod-card-v2__name">{p.nombre}</div>
                    <div className="pd-prod-card-v2__price">{fmt(p.precio)}</div>
                  </div>
                  <div className="pd-prod-card-v2__add-btn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </div>
                </div>
              );
            })}
          </div>

          {prodSel && (
            <div className="pd-add-panel">
              <div className="pd-add-panel__head">
                <div>
                  <div className="pd-add-panel__prod-name">{prodSel.nombre}</div>
                  <div className="pd-add-panel__prod-price">Precio base: {fmt(prodSel.precio)}</div>
                </div>
                <button className="pd-add-panel__close" onClick={() => { setProdSel(null); setAdicsSelec([]); setCantSel(1); }}>✕</button>
              </div>
              {adicsParaProd.length > 0 ? (
                <div className="pd-add-panel__section">
                  <div className="pd-add-panel__label">Adiciones disponibles</div>
                  <div className="pd-add-chips">
                    {adicsParaProd.map(a => {
                      const sel = adicsSelec.find(x => x.id === a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAdic(a)} className={`pd-add-chip${sel?' pd-add-chip--sel':''}`}>
                          {a.nombre}<span className="pd-add-chip__price"> +{fmt(a.precio)}</span>
                          {sel && <span className="pd-add-chip__check"> ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="pd-add-panel__empty">No hay adiciones disponibles.</p>}
              <div className="pd-add-panel__footer">
                <div className="pd-add-panel__qty">
                  <span className="pd-add-panel__label">Cantidad</span>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <button className="pd-sel-qty-btn" onClick={() => setCantSel(c => Math.max(1,c-1))}>−</button>
                    <span style={{fontWeight:700,minWidth:20,textAlign:'center',fontSize:14}}>{cantSel}</span>
                    <button className="pd-sel-qty-btn" onClick={() => setCantSel(c => c+1)}>+</button>
                  </div>
                </div>
                <div className="pd-add-panel__total">Total: <strong>{fmt((prodSel.precio + adicsSelec.reduce((s,a)=>s+a.precio,0))*cantSel)}</strong></div>
                <div className="pd-add-panel__actions">
                  <button className="btn-cancel" onClick={() => { setProdSel(null); setAdicsSelec([]); setCantSel(1); }}>Cancelar</button>
                  <button className="btn-confirm-primary" onClick={confirmarAgregar}>Agregar al pedido</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {f.productos.length > 0 && (
          <div className="pd-form-group">
            <label>Seleccionados ({f.productos.length})</label>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {f.productos.map(p => (
                <div key={p.id} className="pd-sel-item">
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13}}>{p.nombre}</div>
                    {p.adiciones?.length > 0 && <div className="pd-sel-item__adics">+ {p.adiciones.map(a=>a.nombre).join(', ')}</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <button onClick={() => cambiarCant(p.id,-1)} className="pd-sel-qty-btn">−</button>
                      <span style={{fontWeight:700,minWidth:18,textAlign:'center',fontSize:13}}>{p.cantidad}</span>
                      <button onClick={() => cambiarCant(p.id,+1)} className="pd-sel-qty-btn">+</button>
                    </div>
                    <span style={{fontWeight:700,color:'#2E7D32',minWidth:64,textAlign:'right',fontSize:13}}>{fmt((p.precioTotal||p.precio)*p.cantidad)}</span>
                    <button onClick={() => removeProd(p.id)} style={{background:'none',border:'none',color:'#E53935',cursor:'pointer',fontSize:18,lineHeight:1,padding:0}}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {f.productos.length > 0 && (
          <div className="pd-resumen">
            <span>{f.productos.length} producto{f.productos.length!==1?'s':''}</span>
            <strong>Total: {fmt(total)}</strong>
          </div>
        )}

        <div className="pd-modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm-primary" onClick={crear}>{isEdit ? '💾 Guardar cambios' : 'Crear pedido'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function PedidosPage() {
  const { user } = useAuth();
  // Filtro por local (Administración): 'todos' para Administrador/
  // Superadministrador (sede='Ambos'); cualquier otro usuario queda fijo
  // en su propia sede — ver LocalFiltro.
  const [localSel, setLocalSel] = useState(user?.sede && user.sede !== 'Ambos' ? user.sede : 'todos');
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

  const guardar = async f => {
    try {
      if (f.id) {
        await pedidosService.update(f.id, f);
        await refresh();
        setEditTarget(null); setPagina(1); showOk(`Pedido #${f.id} actualizado correctamente`);
      } else {
        await pedidosService.create(f);
        await refresh();
        setModal(false); setPagina(1); showOk('Pedido creado correctamente');
      }
    } catch (err) {
      showErr(err.message || 'No se pudo guardar el pedido. Revisa tu conexión con la API.');
    }
  };

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
  const aprobarPago = async (pedido) => {
    // Si el backend rechazó el cambio, cambiarEstado ya mostró el error —
    // no seguimos con la notificación al cliente ni el toast de éxito.
    const ok = await cambiarEstado(pedido.id, 'en_proceso');
    if (!ok) return;
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
  const activos = pedidosLocal.filter(p => p.estado !== 'anulado');
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
        {modal      && <ModalPedido onClose={() => setModal(false)} onSave={guardar} />}
        {editTarget && <ModalPedido pedido={editTarget} onClose={() => setEditTarget(null)} onSave={guardar} />}
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
          <button className="btn-add" onClick={() => setModal(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo pedido
          </button>
        </div>

        <div className="pd-stats">
          {statCards.map((s,i) => (
            <div className="pd-stat" key={i} style={{ borderTop:`3px solid ${s.color}` }}>
              <div className="pd-stat-label">{s.label}</div>
              <div className="pd-stat-value" style={{ color:s.color, fontSize:s.big?'18px':'28px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="insumos-card"><div style={{display:'flex',gap:8,marginBottom:14}}>
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
          {vista === 'pagos' ? (
            pagosPendientes.length === 0 ? (
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
                              <Tooltip label="Ver detalle">
                                <button className="btn-ver" onClick={() => setDetalle(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                              </Tooltip>
                              <button className="btn-anular" title="Rechazar pago" onClick={() => abrirRechazo(p)}>✕ Rechazar</button>
                              <button className="btn-add" title="Aprobar pago" onClick={() => aprobarPago(p)}>✓ Aprobar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
          <>
          <div className="pd-toolbar">
            <div className="search-group">
              <div className="search-wrap">
                <span className="search-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <input className="search-input" placeholder="Buscar por N.º, cliente, producto, estado o pago..." value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1); }}/>
                {buscar && <button className="search-clear" onClick={() => setBuscar('')}>✕</button>}
              </div>
            </div>
            <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{filtrados.length} pedido{filtrados.length!==1?'s':''}</span>
          </div>

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
                  <tr><th>#</th><th>Cliente</th><th>Tipo</th><th>Local</th><th>Atendido por</th><th>Domiciliario</th><th>Productos</th><th>Total</th><th>Hora</th><th>Estado</th><th>Acciones</th></tr>
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
                            {p.tipo==='domicilio'?'🛵 Domicilio':'🏠 Local'}
                          </span>
                        </td>
                        <td>{p.sede ? <span className="badge-cat" style={{background:'rgba(25,118,210,0.12)',color:'#1976D2'}}>{p.sede}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td>{p.barista ? <span className="pd-pill-barista">{p.barista}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td>{p.tipo==='domicilio' ? (p.domiciliario ? <span className="pd-pill-domi">🛵 {p.domiciliario}</span> : <span style={{color:'var(--text-muted)'}}>—</span>) : <span style={{color:'#ccc'}}>N/A</span>}</td>
                        <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:180}}>
                          {vis}
                          <button className="btn-ver-mas" onClick={() => setDetalle(p)} style={{marginLeft:4}}>
                            {extra > 0 ? `+${extra} más` : 'ver'}
                          </button>
                        </td>
                        <td style={{fontWeight:700,color:'#2E7D32',fontSize:13}}>{fmt(p.total)}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{hora}</td>
                        <td>
                          {p.estado==='anulado' ? (
                            <span className="pd-badge" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                          ) : (p.estado==='listo'||p.estado==='entregado'||p.estado==='en_camino') ? (
                            <select className="pd-estado-select" value={p.estado} style={{background:cfg.bg,color:cfg.color,borderColor:cfg.color+'55'}} onChange={e => cambiarEstado(p.id, e.target.value)}>
                              <option value="listo">{ESTADO_CONFIG.listo?.label||'Listo'}</option>
                              {p.tipo==='domicilio' && <option value="en_camino">{ESTADO_CONFIG.en_camino?.label||'En camino'}</option>}
                              <option value="entregado">{ESTADO_CONFIG.entregado?.label||'Entregado'}</option>
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
                              {Object.entries(ESTADO_CONFIG).filter(([k]) => k!=='entregado'&&k!=='pendiente_verificacion'&&k!=='anulado').map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Ver detalle">
                              <button className="btn-ver" onClick={() => setDetalle(p)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                            {p.estado!=='entregado'&&p.estado!=='cancelado' && (
                              <Tooltip label="Editar pedido">
                                <button className="btn-editar" onClick={() => setEditTarget(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                            )}
{p.estado!=='listo'&&p.estado!=='entregado' && (
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