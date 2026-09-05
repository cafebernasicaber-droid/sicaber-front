// ─────────────────────────────────────────────────────────────
//  src/features/pedidos/components/PedidoBuilder.jsx
//
//  Constructor de pedidos COMPARTIDO por el Cajero y el Admin.
//  Antes el Cajero (CajeroPage) y el Admin (PedidosPage) tenían dos
//  formularios distintos con lógica duplicada; ahora los dos usan
//  este mismo componente y el mismo diseño (catálogo a la izquierda,
//  carrito a la derecha, panel de adiciones/toppings).
//
//  `mode`:
//    - 'cajero' → pedido de mostrador; sede = la del cajero; sin
//                 selector de local ni "atendido por" (es el cajero).
//    - 'admin'  → además pide: tipo de entrega, método de pago, local
//                 y quién atiende (y domiciliario si es a domicilio).
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import productosService from '../../productos/services/productosService';
import toppingsService from '../../toppings/services/toppingsService';
import adicionesService from '../../adiciones/services/adicionesService';
import clientesService from '../../clientes/services/clientesService';
import empleadosService from '../../empleados/services/empleadosService';
import localesService from '../../../shared/services/localesService';
import pedidosService from '../services/pedidosService';
import { toppingsParaProducto } from '../../../shared/utils/toppings';
import '../../cajero/pages/CajeroPage.css';
import './PedidoBuilder.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'nequi', label: 'Nequi' },
  { id: 'transferencia', label: 'Llave Bancolombia' },
];

// ── Selector de cliente (escribir / buscar registrado / mesa) ──
function ClienteSelector({ value, onChange }) {
  const [todosClientes, setTodosClientes] = useState([]);
  useEffect(() => {
    clientesService.getAll().then(d => setTodosClientes(Array.isArray(d) ? d : [])).catch(() => {});
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

export default function PedidoBuilder({ mode = 'cajero', onCreated, showToast, onCancel }) {
  const isAdmin = mode === 'admin';
  const { user } = useAuth();

  const [productos, setProductos] = useState([]);
  const [toppings, setToppings]   = useState([]);
  const [adiciones, setAdiciones] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [locales, setLocales]     = useState([]);

  useEffect(() => {
    productosService.getActivos().then(d => setProductos(Array.isArray(d) ? d : [])).catch(() => setProductos([]));
    toppingsService.getAll().then(d => setToppings(Array.isArray(d) ? d.filter(t => t.estado === 'Activo') : [])).catch(() => setToppings([]));
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a => a.estado === 'Activo') : [])).catch(() => setAdiciones([]));
    if (isAdmin) {
      empleadosService.getAll().then(d => setEmpleados(Array.isArray(d) ? d : [])).catch(() => setEmpleados([]));
      localesService.getActivos().then(d => setLocales((Array.isArray(d) ? d : []).filter(l => l.estado !== false && l.estado !== 'Inactivo'))).catch(() => setLocales([]));
    }
  }, [isAdmin]);

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

  // ── Campos extra del modo admin ──
  const [tipoEntrega, setTipoEntrega] = useState('local');
  const [metodoPago, setMetodoPago]   = useState('efectivo');
  const [sedeSel, setSedeSel]         = useState('');   // nombre del local
  const [localIdSel, setLocalIdSel]   = useState('');   // id del local
  const [barista, setBarista]         = useState('');
  const [domiciliario, setDomiciliario] = useState('');
  const [direccion, setDireccion]     = useState('');

  const atienden = useMemo(() => empleados.filter(e => e.estado === 'Activo' && e.cargo !== 'Domiciliario'), [empleados]);
  const domis    = useMemo(() => empleados.filter(e => e.estado === 'Activo' && e.cargo === 'Domiciliario'), [empleados]);

  const adicsParaProd    = useMemo(() => prodSel ? adiciones : [], [prodSel, adiciones]);
  const toppingsParaProd = useMemo(() => toppingsParaProducto(toppings, prodSel?.id), [prodSel, toppings]);
  const filtrados = useMemo(() => {
    let p = catSel === 'Todas' ? productos : productos.filter(x => x.categoria === catSel);
    if (busqueda.trim()) p = p.filter(x => x.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    return p;
  }, [productos, catSel, busqueda]);

  const itemPrecio = item => item.producto.precio + (item.adiciones||[]).reduce((s,a)=>s+a.precio,0);
  const total      = carrito.reduce((s,i)=>s+itemPrecio(i)*i.cantidad, 0);

  const seleccionarProd = prod => {
    const enCart = carrito.find(i => i.producto.id === prod.id);
    setProdSel(prod);
    setAdicsSelec(enCart?.adiciones||[]);
    setToppingsSelec(enCart ? (enCart.toppings||[]) : toppingsParaProducto(toppings, prod.id));
    setCantSel(enCart?.cantidad||1);
  };
  const toggleAdic    = a => setAdicsSelec(prev => prev.find(x=>x.id===a.id) ? prev.filter(x=>x.id!==a.id) : [...prev,a]);
  const toggleTopping = t => setToppingsSelec(prev => prev.find(x=>x.id===t.id) ? prev.filter(x=>x.id!==t.id) : [...prev,t]);
  const confirmarAgregar = () => {
    setCarrito(prev => [...prev, { producto: prodSel, adiciones: adicsSelec, toppings: toppingsSelec, cantidad: cantSel, _cartKey: `${prodSel.id}-${Date.now()}` }]);
    setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1);
  };
  const cerrarPanel    = () => { setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const removeFromCart = k => setCarrito(prev => prev.filter(i => i._cartKey !== k));
  const changeQty      = (k, d) => setCarrito(prev => prev.map(i => i._cartKey===k ? {...i,cantidad:Math.max(1,i.cantidad+d)} : i));

  const elegirLocal = (l) => { setSedeSel(l.nombre); setLocalIdSel(String(l.id)); };

  const handleCrear = () => {
    if (carrito.length === 0) { showToast('Agrega al menos un producto'); return; }
    if (isAdmin) {
      if (!sedeSel)      { showToast('Selecciona el local del pedido'); return; }
      if (!barista)      { showToast('Selecciona quién atiende el pedido'); return; }
      if (tipoEntrega === 'domicilio' && !domiciliario) { showToast('Selecciona un domiciliario'); return; }
    }
    setSaving(true);
    const now = new Date();
    const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const productosPayload = carrito.map(i => ({
      id: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio,
      adiciones: i.adiciones||[], toppings: i.toppings||[],
      precioTotal: itemPrecio(i), cantidad: i.cantidad,
    }));
    const nuevoPedido = isAdmin
      ? {
          cliente: cliente.trim() || 'Cliente mostrador',
          clienteId: null,
          productos: productosPayload, total,
          notas: notas.trim() || null,
          estado: 'pendiente', origen: 'admin', hora,
          tipo: tipoEntrega,
          pago: metodoPago,
          sede: sedeSel,
          localId: tipoEntrega === 'local' ? localIdSel : null,
          localNombre: tipoEntrega === 'local' ? sedeSel : null,
          barista,
          domiciliario: tipoEntrega === 'domicilio' ? domiciliario : null,
          direccionAlternativa: tipoEntrega === 'domicilio' ? (direccion.trim() || null) : null,
        }
      : {
          cliente: cliente.trim() || 'Cliente mostrador',
          productos: productosPayload, total,
          notas: notas.trim() || null,
          estado: 'pendiente', origen: 'cajero', hora, tipo: 'mostrador',
          sede: user?.sede || '',
        };
    setTimeout(async () => {
      try {
        await pedidosService.create(nuevoPedido);
        showToast(`✓ Pedido creado — ${fmt(total)}`);
        setCarrito([]); setCliente(''); setNotas(''); setDireccion('');
        onCreated();
      } catch (e) {
        showToast('✕ Error al crear el pedido: ' + e.message);
      } finally {
        setSaving(false);
      }
    }, 400);
  };

  return (
    <div className="cj-nuevo pb-scope">
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
        <div className="cj-cart__head"><h3>{isAdmin ? 'Nuevo pedido' : 'Carrito'}</h3><span className="cj-cart__count">{carrito.reduce((s,i)=>s+i.cantidad,0)} ítem{carrito.length!==1?'s':''}</span></div>

        <div className="cj-cart__field">
          <label>Cliente / Mesa <span style={{color:'var(--cj-text-3)',fontWeight:400}}>(opcional)</span></label>
          <ClienteSelector value={cliente} onChange={setCliente}/>
        </div>

        {isAdmin && (
          <>
            <div className="cj-cart__field">
              <label>Tipo de entrega</label>
              <div className="pb-toggle">
                {[{v:'local',ic:'🏬',l:'En el local'},{v:'domicilio',ic:'🛵',l:'A domicilio'}].map(t => (
                  <button key={t.v} type="button" className={`pb-toggle__btn ${tipoEntrega===t.v?'pb-toggle__btn--on':''}`} onClick={() => setTipoEntrega(t.v)}>
                    <span>{t.ic}</span> {t.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="cj-cart__field">
              <label>Método de pago</label>
              <select className="cj-input" value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                {METODOS_PAGO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <div className="cj-cart__field">
              <label>Local <span style={{color:'#E53935'}}>*</span></label>
              {locales.length === 0 ? (
                <p style={{fontSize:12,color:'var(--cj-text-3)'}}>No hay locales activos.</p>
              ) : (
                <div className="pb-chips">
                  {locales.map(l => (
                    <button key={l.id} type="button" className={`pb-chip ${sedeSel===l.nombre?'pb-chip--on':''}`} onClick={() => elegirLocal(l)}>
                      🏪 {l.nombre}{sedeSel===l.nombre && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="cj-cart__field">
              <label>Atendido por <span style={{color:'#E53935'}}>*</span></label>
              {atienden.length === 0 ? (
                <p style={{fontSize:12,color:'var(--cj-text-3)'}}>Sin trabajadores activos.</p>
              ) : (
                <div className="pb-chips">
                  {atienden.map(e => (
                    <button key={e.id} type="button" className={`pb-chip ${barista===e.nombre?'pb-chip--on':''}`} onClick={() => setBarista(barista===e.nombre?'':e.nombre)}>
                      {e.nombre.split(' ')[0]}{barista===e.nombre && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {tipoEntrega === 'domicilio' && (
              <>
                <div className="cj-cart__field">
                  <label>Domiciliario <span style={{color:'#E53935'}}>*</span></label>
                  {domis.length === 0 ? (
                    <p style={{fontSize:12,color:'var(--cj-text-3)'}}>Sin domiciliarios activos.</p>
                  ) : (
                    <div className="pb-chips">
                      {domis.map(e => (
                        <button key={e.id} type="button" className={`pb-chip ${domiciliario===e.nombre?'pb-chip--on':''}`} onClick={() => setDomiciliario(domiciliario===e.nombre?'':e.nombre)}>
                          🛵 {e.nombre.split(' ')[0]}{domiciliario===e.nombre && ' ✓'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="cj-cart__field">
                  <label>Dirección de entrega <span style={{color:'var(--cj-text-3)',fontWeight:400}}>(opcional)</span></label>
                  <input className="cj-input" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej: Calle 45 #23-10, apto 301"/>
                </div>
              </>
            )}
          </>
        )}

        <div className="cj-cart__items">
          {carrito.length === 0 ? (
            <div className="cj-cart__empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg><p>Selecciona productos del catálogo</p></div>
          ) : carrito.map(item => (
            <div key={item._cartKey||item.producto.id} className="cj-cart__item">
              <div className="cj-cart__item-info">
                <div className="cj-cart__item-name">{item.producto.nombre}</div>
                {item.adiciones?.length > 0 && <div className="cj-cart__item-adics" style={{fontSize:10,marginTop:1}}>{item.adiciones.map(a=>a.nombre).join(', ')}</div>}
                {item.toppings?.length > 0 && <div style={{fontSize:10,color:'var(--cj-text-3)',marginTop:1}}>🧋 {item.toppings.map(t=>t.nombre).join(', ')}</div>}
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
            <label>Nota para el bartender <span style={{color:'var(--cj-text-3)',fontWeight:400}}>(opcional)</span></label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Sin azúcar, extra caliente..." rows={2}/>
          </div>
        )}

        <div className="cj-cart__foot">
          {carrito.length > 0 && <div className="cj-cart__total-row"><span>Total</span><strong>{fmt(total)}</strong></div>}
          <button className="cj-btn cj-btn--primary cj-btn--full" onClick={handleCrear} disabled={carrito.length===0||saving}>
            {saving ? 'Creando pedido...' : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Crear pedido · {fmt(total)}</>}
          </button>
          {carrito.length > 0 && <button className="cj-btn cj-btn--ghost cj-btn--full" onClick={() => setCarrito([])}>Limpiar carrito</button>}
          {isAdmin && onCancel && <button className="cj-btn cj-btn--ghost cj-btn--full" onClick={onCancel}>Cancelar</button>}
        </div>
      </div>
    </div>
  );
}
