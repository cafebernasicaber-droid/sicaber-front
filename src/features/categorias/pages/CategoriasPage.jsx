import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import categoriasService from '../services/categoriasService';
import productosService from '../../productos/services/productosService';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import '../../insumos/pages/InsumosPage.css';
import '../../productos/pages/Modulos.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

function CategoriaFormModal({ inicial, onClose, onSave }) {
  const [form, setForm] = React.useState(inicial || { nombre:'', descripcion:'', estado:'Activo' });
  const [error, setError] = React.useState('');
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim()) { setError('El nombre de la categoría es obligatorio.'); return; }
    try {
      const r = inicial
        ? await categoriasService.update(inicial.id, form)
        : await categoriasService.create(form);
      if (r?.error) { setError(r.error); return; }
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la categoría.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:520,textAlign:'left',padding:'32px 36px'}} onClick={e=>e.stopPropagation()}>
        <h3 style={{marginBottom:4}}>{inicial?'Editar categoría':'Nueva categoría'}</h3>
        <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>{inicial?`Modificando: ${inicial.nombre}`:'Agrega una categoría al menú'}</p>
        {error && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>⚠ {error}</div>}
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="mod-form-group">
            <label>Nombre <span className="required">*</span></label>
            <input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Bebidas Calientes" />
          </div>
          <div className="mod-form-group">
            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Describe la categoría..." rows={3} maxLength={LIMITES.DESCRIPCION} />
            <div style={{fontSize:11,color:enElTope(form.descripcion,LIMITES.DESCRIPCION)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.descripcion,LIMITES.DESCRIPCION)}</div>
          </div>

          <div className="switch-wrap">
            <button type="button" className={`toggle-btn ${form.estado==='Activo'?'toggle-on':'toggle-off'}`}
              onClick={()=>setForm(f=>({...f,estado:f.estado==='Activo'?'Inactivo':'Activo'}))}>
              <span className="toggle-thumb"/>
            </button>
            <span className={`toggle-label-text ${form.estado==='Activo'?'on':'off'}`}>{form.estado}</span>
          </div>
          <div className="modal-actions" style={{justifyContent:'flex-end',marginTop:4}}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary">{inicial?'💾 Guardar':'+ Crear categoría'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal "Ver detalle" — antes no existía para Categorías ──────────────
function CategoriaDetalleModal({ categoria: c, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480, textAlign: 'left', padding: '32px 36px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          {c.imagen
            ? <img src={c.imagen} alt={c.nombre} style={{ width:56, height:56, borderRadius:10, objectFit:'cover' }} onError={e=>{e.target.style.display='none';}}/>
            : <div style={{ width:56, height:56, borderRadius:10, background:'var(--bg-surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>📂</div>}
          <div>
            <h3 style={{ margin:0 }}>{c.nombre}</h3>
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>ID #{c.id}</p>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
          <div style={{ background:'var(--bg-surface)', borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Estado</div>
            <div style={{ fontSize:13, fontWeight:600, color: c.estado === 'Activo' ? '#2E7D32' : '#888' }}>{c.estado === 'Activo' ? '✅ Activo' : '❌ Inactivo'}</div>
          </div>
          <div style={{ background:'var(--bg-surface)', borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Fecha de creación</div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{fmt(c.created_at || c.fechaCreacion)}</div>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>Descripción</div>
          <p style={{ fontSize:13, margin:0, whiteSpace:'pre-wrap' }}>{c.descripcion || <em style={{ color:'#bbb' }}>Sin descripción</em>}</p>
        </div>
        <div className="modal-actions" style={{ justifyContent:'flex-end' }}>
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  const { hasPermiso } = useAuth();
  const [cats, setCats] = useState([]);
  useEffect(() => {
    categoriasService.getAll()
      .then(d => setCats(Array.isArray(d) ? d : []))
      .catch(() => setCats([]));
  }, []);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | categoria
  const [deleteTarget, setDel] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');

  const [page, setPage] = useState(1);
  const PER_PAGE = 5;
  const [vista, setVista] = useState('tabla');
  const [verTarget, setVerTarget] = useState(null);
  // Filtro por fecha de creación (columna "Creación" ya visible en la
  // tabla) — rango desde/hasta, además de la búsqueda por nombre/descripción.
  // Filtro por estado (Activo / Inactivo) — el documento pedía sobre todo
  // poder listar las categorías activas o inactivas por separado.
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const refresh = () => {
    categoriasService.getAll()
      .then(d => setCats(Array.isArray(d) ? d : []))
      .catch(() => setCats([]));
  };
  const showOk = msg => { setSuccess(msg); setTimeout(()=>setSuccess(''),3000); };

  let shown = query.trim()
    ? cats.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()) || (c.descripcion||'').toLowerCase().includes(query.toLowerCase()))
    : cats;
  if (estadoFiltro !== 'Todos') shown = shown.filter(c => (c.estado || 'Activo') === estadoFiltro);
  if (fechaDesde) shown = shown.filter(c => c.created_at && String(c.created_at).slice(0,10) >= fechaDesde);
  if (fechaHasta) shown = shown.filter(c => c.created_at && String(c.created_at).slice(0,10) <= fechaHasta);
  const totalPages = Math.ceil(shown.length / PER_PAGE);
  const paginated = shown.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const handleSearch = val => { setQuery(val); setPage(1); };

  const handleDelete = async () => {
    // Antes esta comprobación leía los productos de
    // localStorage['sicaber_productos_menu'], una clave que quedó de la
    // versión anterior sin backend y que hoy NADIE escribe: siempre
    // devolvía [], así que el aviso "tiene productos asociados" nunca
    // aparecía y se podía borrar una categoría en uso, dejando esos
    // productos apuntando a una categoría inexistente.
    // Ahora se consulta la lista real de productos a la API.
    let productosConCategoria = [];
    try {
      const todos = await productosService.getAll();
      const nombreCat = String(deleteTarget.nombre || '').trim().toLowerCase();
      productosConCategoria = (Array.isArray(todos) ? todos : [])
        .filter(p => String(p.categoria || '').trim().toLowerCase() === nombreCat);
    } catch {
      // Si la consulta falla no se bloquea el borrado por nuestra cuenta:
      // el backend tiene su propia verificación y responderá con el error.
      productosConCategoria = [];
    }
    if (productosConCategoria.length > 0) {
      setDel(null);
      setDeleteError(`No se puede eliminar la categoría "${deleteTarget.nombre}" porque tiene ${productosConCategoria.length} producto${productosConCategoria.length>1?'s':''} asociado${productosConCategoria.length>1?'s':''}. Reasigna o elimina esos productos primero.`);
      setTimeout(() => setDeleteError(''), 6000);
      return;
    }
    try {
      const r = await categoriasService.remove(deleteTarget.id);
      if (r?.error) { alert(r.error); return; }
      refresh(); showOk(`Categoría "${deleteTarget.nombre}" eliminada`); setDel(null);
    } catch (err) {
      alert(err.message || 'No se pudo eliminar la categoría.');
    }
  };

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {deleteError && (
          <div className="toast" style={{background:'rgba(229,57,53,0.15)',color:'var(--color-red)',border:'1px solid rgba(229,57,53,0.3)',top:24,right:28,position:'fixed',zIndex:2000,display:'flex',alignItems:'center',gap:10,padding:'14px 20px',borderRadius:10,fontSize:13,fontWeight:600,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxWidth:420,animation:'slideInRight 0.3s ease'}}>
            ⚠️ {deleteError}
          </div>
        )}
        {modal && (
          <CategoriaFormModal
            inicial={modal === 'new' ? null : modal}
            onClose={() => setModal(null)}
            onSave={() => { refresh(); setModal(null); showOk(modal==='new'?'Categoría creada':'Categoría actualizada'); }}
          />
        )}

        {verTarget && (
          <CategoriaDetalleModal categoria={verTarget} onClose={() => setVerTarget(null)}/>
        )}

        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Categorías</h1>
            <p className="page-subtitle">Organiza los productos del menú por categoría</p>
          </div>
          {hasPermiso('categorias', 'crear') && (
            <button className="btn-add" onClick={() => setModal('new')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nueva categoría
            </button>
          )}
        </div>

        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input className="search-input" placeholder="Buscar categoría..." value={query}
                onChange={e=>handleSearch(e.target.value)} />
              {query && <button className="search-clear" onClick={()=>handleSearch('')}>✕</button>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <label style={{fontSize:12,color:'var(--text-muted)'}}>Creada entre</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              style={{padding:'8px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)',outline:'none'}}/>
            <span style={{color:'var(--text-muted)',fontSize:13}}>–</span>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              style={{padding:'8px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)',outline:'none'}}/>
            {(fechaDesde || fechaHasta) && (
              <button className="search-clear" onClick={() => { setFechaDesde(''); setFechaHasta(''); setPage(1); }}>✕</button>
            )}
          </div>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }}
            title="Filtrar categorías por estado"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12.5,background:'var(--bg-input)',color:'var(--text-primary)',outline:'none',cursor:'pointer'}}>
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activas</option>
            <option value="Inactivo">Inactivas</option>
          </select>
          {(query || fechaDesde || fechaHasta || estadoFiltro !== 'Todos') && (
            <button className="btn-limpiar-filtros" title="Limpiar filtros"
              onClick={() => { handleSearch(''); setFechaDesde(''); setFechaHasta(''); setEstadoFiltro('Todos'); setPage(1); }}>
              ✕ Limpiar filtros
            </button>
          )}
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{shown.length} categoría{shown.length!==1?'s':''}</span>
          <div style={{display:'flex',gap:4,marginLeft:12}}>
            <button onClick={()=>setVista('tabla')} title="Vista tabla"
              style={{padding:'6px 10px',borderRadius:8,border:`1.5px solid ${vista==='tabla'?'#4CAF50':'#ddd'}`,background:vista==='tabla'?'#E8F5E9':'white',cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vista==='tabla'?'#4CAF50':'#888'} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </button>
            <button onClick={()=>setVista('cards')} title="Vista tarjetas"
              style={{padding:'6px 10px',borderRadius:8,border:`1.5px solid ${vista==='cards'?'#4CAF50':'#ddd'}`,background:vista==='cards'?'#E8F5E9':'white',cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vista==='cards'?'#4CAF50':'#888'} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
          </div>
        </div>

        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <h3>{query ? 'Sin coincidencias' : 'No hay categorías'}</h3>
              <p>{query ? `Sin resultados para "${query}"` : 'Crea la primera categoría del menú'}</p>
              {!query && hasPermiso('categorias', 'crear') && <button className="btn-add-first" onClick={()=>setModal('new')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nueva categoría
              </button>}
            </div>
          ) : vista === 'tabla' ? (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr><th>Imagen</th><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Creación</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <tr key={c.id}>
                      <td>
                        {c.imagen
                          ? <img src={c.imagen} alt={c.nombre} style={{width:40,height:40,borderRadius:8,objectFit:'cover'}} onError={e=>e.target.style.display='none'}/>
                          : <div style={{width:40,height:40,borderRadius:8,background:'var(--bg-surface-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📂</div>
                        }
                      </td>
                      <td className="td-nombre">{c.nombre}</td>
                      <td style={{fontSize:13,color:'var(--text-secondary)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descripcion||'—'}</td>
                      <td>
                        {hasPermiso('categorias', 'editar') ? (
                          <button className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`}
                            onClick={async ()=>{await categoriasService.toggleEstado(c.id);refresh();}} title={c.estado}>
                            <span className="toggle-thumb"/>
                          </button>
                        ) : (
                          <span className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                        )}
                      </td>
                      <td style={{fontSize:13,color:'var(--text-muted)'}}>{fmt(c.created_at || c.fechaCreacion)}</td>
                      <td>
                        <div className="actions-group">
                          {hasPermiso('categorias', 'ver') && (
                            <Tooltip label="Ver detalle">
                              <button className="btn-ver" onClick={()=>setVerTarget(c)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('categorias', 'editar') && (
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={()=>setModal(c)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('categorias', 'eliminar') && <AnularButton onClick={()=>setDel(c)}/>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{padding:20}}>
              <div className="prod-grid">
                {paginated.map(c => (
                  <div className="prod-card" key={c.id}>
                    {c.imagen
                      ? <img className="prod-card__img" src={c.imagen} alt={c.nombre} onError={e=>e.target.style.display='none'}/>
                      : <div className="prod-card__placeholder">📂</div>
                    }
                    <div className="prod-card__body">
                      <div className="prod-card__name">{c.nombre}</div>
                      <div className="prod-card__cat" style={{fontSize:12,color:'var(--text-muted)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descripcion||'Sin descripción'}</div>
                      <div className="prod-card__price" style={{fontSize:12,color:'var(--text-muted)'}}>{fmt(c.created_at || c.fechaCreacion)}</div>
                    </div>
                    <div className="prod-card__foot">
                      {hasPermiso('categorias', 'editar') ? (
                        <button className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{transform:'scale(0.85)'}} onClick={async ()=>{await categoriasService.toggleEstado(c.id);refresh();}}><span className="toggle-thumb"/></button>
                      ) : (
                        <span className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{transform:'scale(0.85)',cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                      )}
                      <div className="actions-group">
                        {hasPermiso('categorias', 'ver') && (
                          <Tooltip label="Ver detalle">
                            <button className="btn-ver" onClick={()=>setVerTarget(c)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                          </Tooltip>
                        )}
                        {hasPermiso('categorias', 'editar') && (
                          <Tooltip label="Editar">
                            <button className="btn-editar" onClick={()=>setModal(c)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                          </Tooltip>
                        )}
                        {hasPermiso('categorias', 'eliminar') && <AnularButton size={15} onClick={()=>setDel(c)}/>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderTop:'1px solid #f0f0f0',marginTop:4}}>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>
                Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,shown.length)} de {shown.length} categorías
              </span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border)',background:page===1?'var(--bg-surface-3)':'var(--bg-surface)',color:page===1?'var(--text-muted)':'var(--text-primary)',cursor:page===1?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>← Ant.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{padding:'6px 11px',borderRadius:8,border:`1.5px solid ${n===page?'#4CAF50':'#ddd'}`,background:n===page?'#4CAF50':'white',color:n===page?'white':'#333',cursor:'pointer',fontSize:13,fontWeight:700}}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border)',background:page===totalPages?'var(--bg-surface-3)':'var(--bg-surface)',color:page===totalPages?'var(--text-muted)':'var(--text-primary)',cursor:page===totalPages?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>Sig. →</button>
              </div>
            </div>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={()=>setDel(null)}>
            <div className="modal-box" onClick={e=>e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>¿Detener categoría?</h3>
              <p>Los productos de esta categoría quedarán sin categoría asignada.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={()=>setDel(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}