import React, { useState, useEffect, useRef } from 'react';
import Layout from '../../../shared/components/Layout';
import toppingsService from '../services/toppingsService';
import productosService from '../../productos/services/productosService';
import insumosService from '../../insumos/services/insumosService';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import InsumoSearchSelect from '../../../shared/components/InsumoSearchSelect';
import '../../insumos/pages/InsumosPage.css';

function ToppingModal({ inicial, productos, insumos, onClose, onSave }) {
  const [form, setForm] = useState(inicial
    ? { ...inicial, cantidad: inicial.cantidad ?? '' }
    : { nombre:'', productos_ids:[], estado:'Activo', insumo_id: null, cantidad: '' });
  const [error, setError] = useState('');
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  // 1 — sugerencia inicial: solo insumos marcados "es para topping" desde
  // Insumos (esTopping). En cuanto se escribe algo en el buscador, la
  // búsqueda deja de limitarse a esta lista y corre sobre TODOS los
  // insumos (ver `preferidos` en InsumoSearchSelect) — por si el insumo
  // correcto no quedó marcado como topping.
  const insumosTopping = insumos.filter(i => i.esTopping);
  const insumoSel = insumos.find(i => String(i.id) === String(form.insumo_id));

  const toggleProducto = (id) => {
    setForm(f => {
      const ids = Array.isArray(f.productos_ids) ? f.productos_ids : [];
      return { ...f, productos_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  };

  const aplicaATodos = !Array.isArray(form.productos_ids) || form.productos_ids.length === 0;

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim()) { setError('El nombre del topping es obligatorio.'); return; }
    if (form.insumo_id && form.cantidad !== '' && (isNaN(form.cantidad) || Number(form.cantidad) < 0)) {
      setError('La cantidad consumida debe ser un número válido (mayor o igual a 0).');
      return;
    }
    // Sin insumo asociado no tiene sentido guardar una cantidad suelta.
    const payload = { ...form, cantidad: form.insumo_id && form.cantidad !== '' ? Number(form.cantidad) : null };
    try {
      const r = inicial
        ? await toppingsService.update(inicial.id, payload)
        : await toppingsService.create(payload);
      if (r?.error) { setError(r.error); return; }
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el topping.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:500,textAlign:'left',padding:'32px 36px'}} onClick={e=>e.stopPropagation()}>
        <h3 style={{marginBottom:4}}>{inicial ? 'Editar topping' : 'Nuevo topping'}</h3>
        <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>{inicial ? `Modificando: ${inicial.nombre}` : 'Agrega un topping al menú (siempre gratuito)'}</p>
        {error && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>⚠ {error}</div>}
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Nombre *</label>
            <input type="text" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Crema batida" style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:14,outline:'none'}}/>
          </div>

          <div>
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Insumo asociado <span style={{fontWeight:400,color:'var(--text-muted)'}}>(opcional)</span></label>
            <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>
              Sugerimos primero los insumos marcados como "topping" en Insumos, pero puedes buscar entre todos si el que necesitas no quedó marcado así.
            </p>
            <InsumoSearchSelect
              insumos={insumos}
              preferidos={insumosTopping}
              value={form.insumo_id}
              onSelect={found => setForm(f => ({...f, insumo_id: found.id}))}
              placeholder="Buscar insumo..."
            />
            {insumoSel && (
              <>
                <div style={{marginTop:10}}>
                  <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>
                    Cantidad de {insumoSel.unidadMedida || 'unidad'} que consume <span style={{fontWeight:400,color:'var(--text-muted)'}}>(opcional)</span>
                  </label>
                  <input type="number" step="0.1" value={form.cantidad} onChange={set('cantidad')}
                    placeholder={`Ej: 1 ${insumoSel.unidadMedida || ''}`}
                    style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13,outline:'none'}}/>
                </div>
                <button type="button" onClick={() => setForm(f => ({...f, insumo_id: null, cantidad: ''}))}
                  style={{marginTop:6,background:'none',border:'none',padding:0,color:'var(--text-muted)',fontSize:12,textDecoration:'underline',cursor:'pointer'}}>
                  Quitar insumo asociado
                </button>
              </>
            )}
          </div>

          <div>
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Productos en los que aplica</label>
            <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>
              Si no seleccionas ninguno, aplicará a <strong>todos</strong> los productos.
            </p>
            {productos.length === 0 ? (
              <div style={{padding:'10px 14px',background:'rgba(245,176,0,0.12)',border:'1px solid rgba(245,176,0,0.3)',borderRadius:8,fontSize:13,color:'#E65100'}}>
                ⚠ No hay productos activos registrados todavía.
              </div>
            ) : (
              <div style={{display:'flex',flexWrap:'wrap',gap:8,maxHeight:180,overflowY:'auto',padding:'2px 2px'}}>
                {productos.map(p => {
                  const sel = Array.isArray(form.productos_ids) && form.productos_ids.includes(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => toggleProducto(p.id)}
                      style={{padding:'6px 12px',borderRadius:100,fontSize:12,fontWeight:600,cursor:'pointer',border:`1.5px solid ${sel?'var(--color-green,#2E7D32)':'var(--border)'}`,background:sel?'rgba(46,125,50,0.12)':'transparent',color:sel?'#2E7D32':'var(--text-secondary)'}}>
                      {p.nombre}{sel && ' ✓'}
                    </button>
                  );
                })}
              </div>
            )}
            {aplicaATodos && (
              <p style={{fontSize:12,color:'#2E7D32',fontWeight:600,marginTop:8}}>✓ Aplica a todos los productos</p>
            )}
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button type="button" className={`toggle-btn ${form.estado==='Activo'?'toggle-on':'toggle-off'}`}
              onClick={() => setForm(f => ({...f, estado: f.estado==='Activo'?'Inactivo':'Activo'}))}>
              <span className="toggle-thumb"/>
            </button>
            <span style={{fontSize:13,fontWeight:600,color:form.estado==='Activo'?'#2E7D32':'#888'}}>{form.estado}</span>
          </div>
          <div className="modal-actions" style={{justifyContent:'flex-end',marginTop:4}}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary">{inicial ? '💾 Guardar cambios' : '✅ Crear topping'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ToppingsPage() {
  const [toppings, setToppings] = useState([]);
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  useEffect(() => {
    toppingsService.getAll()
      .then(d => setToppings(Array.isArray(d) ? d : []))
      .catch(() => setToppings([]));
    productosService.getAll()
      .then(d => setProductos(Array.isArray(d) ? d : []))
      .catch(() => setProductos([]));
    // 1 — catálogo de insumos para el selector "Insumo asociado" del modal.
    insumosService.getAll()
      .then(d => setInsumos(Array.isArray(d) ? d : []))
      .catch(() => setInsumos([]));
  }, []);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | topping
  const [deleteTarget, setDel] = useState(null);
  const [success, setSuccess] = useState('');
  const searchRef = useRef();

  const refresh = () => {
    toppingsService.getAll()
      .then(d => setToppings(Array.isArray(d) ? d : []))
      .catch(() => setToppings([]));
  };
  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const displayed = query.trim()
    ? toppings.filter(t => t.nombre.toLowerCase().includes(query.toLowerCase()))
    : toppings;

  // 1 — el selector del modal solo debe ofrecer productos activos (no
  // tiene sentido ligar un topping nuevo a un producto ya descontinuado).
  // `productos` se mantiene con la lista completa aparte, porque la
  // columna "Aplica a" de la tabla necesita poder resolver el nombre de
  // productos ya asociados aunque después se hayan vuelto Inactivos.
  const productosActivos = productos.filter(p => p.estado === 'Activo');

  const handleDelete = async () => {
    await toppingsService.remove(deleteTarget.id);
    refresh(); showOk(`Topping "${deleteTarget.nombre}" eliminado`); setDel(null);
  };

  const handleToggle = async id => { await toppingsService.toggleEstado(id); refresh(); };

  const nombreProducto = (id) => productos.find(p => p.id === id)?.nombre || `#${id}`;

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>{success}</div>}

        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Toppings</h1>
            <p className="page-subtitle">Personaliza las bebidas con toppings gratuitos, asignados por producto</p>
          </div>
          <button className="btn-add" onClick={() => setModal('new')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo topping
          </button>
        </div>

        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input ref={searchRef} type="text" className="search-input" placeholder="Buscar topping..." value={query} onChange={e => setQuery(e.target.value)}/>
              {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{displayed.length} topping{displayed.length!==1?'s':''}</span>
        </div>

        <div className="insumos-card">
          {displayed.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧋</div>
              <h3>{query ? 'Sin coincidencias' : 'No hay toppings'}</h3>
              <p>Agrega toppings para personalizar las bebidas</p>
              {!query && <button className="btn-add-first" onClick={() => setModal('new')}>Nuevo topping</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead><tr><th>ID</th><th>Nombre</th><th>Aplica a</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {displayed.map(t => {
                    const ids = Array.isArray(t.productos_ids) ? t.productos_ids : [];
                    const aplicaATodos = ids.length === 0;
                    return (
                      <tr key={t.id}>
                        <td className="td-id">{t.id}</td>
                        <td className="td-nombre">{t.nombre}</td>
                        <td style={{fontSize:13,color:'var(--text-muted)'}}>
                          {/* 4 — resumen corto en vez de la lista completa de
                              nombres (que se corta en tablas con varios
                              productos); los nombres siguen disponibles al
                              pasar el mouse encima. */}
                          {aplicaATodos ? (
                            <span style={{background:'#E8F5E9',color:'#2E7D32',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600}}>Aplica a todos</span>
                          ) : (
                            <span title={ids.map(nombreProducto).join(', ')}
                              style={{background:'var(--bg-hover)',color:'var(--text-secondary)',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'default'}}>
                              Aplica a {ids.length} producto{ids.length!==1?'s':''}
                            </span>
                          )}
                        </td>
                        <td>
                          <button className={`toggle-btn ${t.estado==='Activo'?'toggle-on':'toggle-off'}`} onClick={() => handleToggle(t.id)} title={t.estado}>
                            <span className="toggle-thumb"/>
                          </button>
                        </td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => setModal(t)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </Tooltip>
                            <AnularButton onClick={() => setDel(t)}/>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(modal === 'new' || (modal && modal.id)) && (
          <ToppingModal
            inicial={modal === 'new' ? null : modal}
            productos={productosActivos}
            insumos={insumos}
            onClose={() => setModal(null)}
            onSave={() => { refresh(); showOk(modal === 'new' ? 'Topping creado correctamente' : 'Topping actualizado'); setModal(null); }}
          />
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDel(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></div>
              <h3>¿Anular topping?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDel(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
