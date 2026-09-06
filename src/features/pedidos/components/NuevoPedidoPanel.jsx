import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import pedidosService     from '../services/pedidosService';
import productosService    from '../../productos/services/productosService';
import adicionesService    from '../../adiciones/services/adicionesService';
import toppingsService     from '../../toppings/services/toppingsService';
import clientesService     from '../../clientes/services/clientesService';
import empleadosService    from '../../empleados/services/empleadosService';
import localesService      from '../../../shared/services/localesService';
import { toppingsParaProducto } from '../../../shared/utils/toppings';
// El catálogo + carrito reutilizan exactamente los mismos estilos `cj-*`
// que la vista del Cajero — se importa su hoja para tenerlos disponibles.
import '../../cajero/pages/CajeroPage.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// ── Selector de Cliente / Mesa (idéntico al del Cajero) ──────────────────
function ClienteSelector({ value, onChange }) {
  const [todosClientes, setTodosClientes] = useState([]);
  useEffect(() => {
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

// ── Panel de creación de pedido (catálogo + carrito lateral) ─────────────
// Un solo componente para Cajero y Admin. Diferencias resueltas con props:
//  · modo="cajero" (default): el pedido queda con el local (sede) y el
//    usuario del cajero, sin selectores extra.
//  · modo="admin": el admin elige el LOCAL destino y quién lo ATIENDE;
//    ambos obligatorios antes de poder crear.
export default function NuevoPedidoPanel({ modo = 'cajero', onCreated, showToast, onCartChange }) {
  const esAdmin = modo === 'admin';
  const { user } = useAuth();
  const [productos, setProductos] = useState([]);
  const [toppings, setToppings]   = useState([]);
  const [adiciones, setAdiciones] = useState([]);
  const [locales, setLocales]     = useState([]);
  const [empleados, setEmpleados] = useState([]);
  useEffect(() => {
    productosService.getActivos().then(d => setProductos(Array.isArray(d) ? d : [])).catch(() => setProductos([]));
    toppingsService.getAll().then(d => setToppings(Array.isArray(d) ? d.filter(t => t.estado === 'Activo') : [])).catch(() => setToppings([]));
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a => a.estado === 'Activo') : [])).catch(() => setAdiciones([]));
    if (esAdmin) {
      localesService.getActivos().then(d => setLocales(Array.isArray(d) ? d.filter(l => l.estado !== false && l.estado !== 'Inactivo') : [])).catch(() => setLocales([]));
      empleadosService.getAll().then(d => setEmpleados(Array.isArray(d) ? d.filter(e => e.estado === 'Activo' && e.cargo !== 'Domiciliario') : [])).catch(() => setEmpleados([]));
    }
  }, [esAdmin]);

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
  // admin — local destino + quién atiende
  const [localSel, setLocalSel]     = useState('');
  const [atendidoPor, setAtendidoPor] = useState('');
  const [errAdmin, setErrAdmin]     = useState('');

  // Avisa al contenedor (modal) si el carrito tiene ítems, para pedir
  // confirmación antes de cerrar.
  useEffect(() => { onCartChange?.(carrito.length > 0); }, [carrito, onCartChange]);

  const adicsParaProd = useMemo(() => prodSel ? adiciones : [], [prodSel, adiciones]);
  const toppingsParaProd = useMemo(() => toppingsParaProducto(toppings, prodSel?.id), [prodSel, toppings]);
  const filtrados = useMemo(() => {
    let p = catSel === 'Todas' ? productos : productos.filter(x => x.categoria === catSel);
    if (busqueda.trim()) p = p.filter(x => x.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    return p;
  }, [productos, catSel, busqueda]);
  const itemPrecio = item => item.producto.precio + (item.adiciones||[]).reduce((s,a)=>s+a.precio,0);
  const total = carrito.reduce((s,i)=>s+itemPrecio(i)*i.cantidad, 0);

  const seleccionarProd = prod => {
    const enCart = carrito.find(i => i.producto.id === prod.id);
    setProdSel(prod);
    setAdicsSelec(enCart?.adiciones||[]);
    setToppingsSelec(enCart ? (enCart.toppings||[]) : toppingsParaProducto(toppings, prod.id));
    setCantSel(enCart?.cantidad||1);
  };
  const toggleAdic    = a => setAdicsSelec(prev => prev.find(x=>x.id===a.id) ? prev.filter(x=>x.id!==a.id) : [...prev,a]);
  const toggleTopping = t => setToppingsSelec(prev => prev.find(x=>x.id===t.id) ? prev.filter(x=>x.id!==t.id) : [...prev,t]);
  const confirmarAgregar = () => { setCarrito(prev => [...prev, { producto: prodSel, adiciones: adicsSelec, toppings: toppingsSelec, cantidad: cantSel, _cartKey: `${prodSel.id}-${Date.now()}` }]); setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const cerrarPanel   = () => { setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const removeFromCart = k => setCarrito(prev => prev.filter(i => i._cartKey !== k));
  const changeQty      = (k, d) => setCarrito(prev => prev.map(i => i._cartKey===k ? {...i,cantidad:Math.max(1,i.cantidad+d)} : i));

  const handleCrear = () => {
    if (carrito.length === 0) { showToast?.('Agrega al menos un producto'); return; }
    if (esAdmin) {
      if (!localSel) { setErrAdmin('Selecciona el local del pedido'); return; }
      if (!atendidoPor) { setErrAdmin('Selecciona quién atiende el pedido'); return; }
    }
    setErrAdmin('');
    setSaving(true);
    const now = new Date();
    const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const locObj = locales.find(l => String(l.id) === String(localSel));
    const nuevoPedido = {
      cliente: cliente.trim() || 'Cliente mostrador',
      productos: carrito.map(i => ({ id: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio, adiciones: i.adiciones||[], toppings: i.toppings||[], precioTotal: itemPrecio(i), cantidad: i.cantidad })),
      total, notas: notas.trim()||null, estado: 'pendiente',
      origen: esAdmin ? 'admin' : 'cajero',
      hora, tipo: 'mostrador',
      sede: esAdmin ? (locObj ? locObj.nombre : '') : (user?.sede || ''),
      ...(esAdmin ? { localId: localSel, localNombre: locObj ? locObj.nombre : '', barista: atendidoPor } : { barista: user?.nombre || user?.username || '' }),
    };
    setTimeout(async () => {
      try {
        await pedidosService.create(nuevoPedido);
        showToast?.(`✓ Pedido creado — ${fmt(total)}`);
        setCarrito([]); setCliente(''); setNotas('');
        onCreated?.();
      } catch (e) {
        showToast?.('✕ Error al crear el pedido: ' + e.message);
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

        <div className="np-cart-body">
        {esAdmin && (
          <div className="np-cart-sticky">
            <div className="cj-cart__field">
              <label>Local <span style={{color:'#EF5350'}}>*</span></label>
              <select value={localSel} onChange={e => { setLocalSel(e.target.value); setErrAdmin(''); }}
                style={{width:'100%',padding:'9px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',fontSize:13}}>
                <option value="">— Seleccionar local —</option>
                {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <div className="cj-cart__field">
              <label>Atendido por <span style={{color:'#EF5350'}}>*</span></label>
              <select value={atendidoPor} onChange={e => { setAtendidoPor(e.target.value); setErrAdmin(''); }}
                style={{width:'100%',padding:'9px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',fontSize:13}}>
                <option value="">— Seleccionar —</option>
                {empleados.map(e => <option key={e.id} value={e.nombre}>{e.nombre}{e.cargo ? ` · ${e.cargo}` : ''}</option>)}
              </select>
            </div>
          </div>
        )}

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
        {errAdmin && <div style={{color:'#EF5350',fontSize:12.5,fontWeight:600,padding:'6px 18px 0'}}>⚠ {errAdmin}</div>}
        </div>{/* /np-cart-body */}
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
