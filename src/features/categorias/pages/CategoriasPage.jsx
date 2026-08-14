import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import categoriasService from '../services/categoriasService';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import '../../insumos/pages/InsumosPage.css';
import '../../productos/pages/Modulos.css';

const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

function CategoriaFormModal({ inicial, onClose, onSave }) {
  const [form, setForm] = React.useState(inicial || { nombre:'', descripcion:'', imagen:'', estado:'Activo' });
  const [error, setError] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [imgError, setImgError] = React.useState('');
  const fileInputRef = React.useRef(null);
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const processFile = file => {
    setImgError('');
    if (!file) return;
    const allowed = ['image/png','image/jpeg','image/jpg','image/webp','image/gif'];
    if (!allowed.includes(file.type)) { setImgError('Solo se aceptan PNG, JPG, WEBP o GIF.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImgError('La imagen no puede superar 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => setForm(f => ({...f, imagen: e.target.result}));
    reader.readAsDataURL(file);
  };

  const onDragOver  = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave = ()  => setDragging(false);
  const onDrop      = e  => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); };
  const onFileChange = e => processFile(e.target.files[0]);
  const removeImage  = () => { setForm(f=>({...f,imagen:''})); setImgError(''); if(fileInputRef.current) fileInputRef.current.value=''; };

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
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
            <input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Bebidas Calientes" required />
          </div>
          <div className="mod-form-group">
            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Describe la categoría..." rows={3} />
          </div>

          {/* Imagen drag & drop */}
          <div className="mod-form-group">
            <label>Imagen de la categoría</label>
            {!form.imagen ? (
              <div
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border:`2px dashed ${dragging?'#5DBB63':'var(--border-input)'}`,
                  borderRadius:10, padding:'24px 16px', textAlign:'center',
                  cursor:'pointer',
                  background: dragging ? 'rgba(93,187,99,0.08)' : 'var(--bg-surface-2)',
                  transition:'all 0.2s', userSelect:'none',
                }}>
                <div style={{display:'flex',justifyContent:'center'}}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--text-secondary)',marginBottom:10}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>Arrastra tu imagen aquí</p>
                <p style={{margin:'3px 0 10px',fontSize:12,color:'var(--text-muted)'}}>o haz clic para seleccionarla</p>
                <span style={{display:'inline-block',padding:'5px 16px',background:'#4CAF50',color:'white',borderRadius:20,fontSize:12,fontWeight:600,boxShadow:'0 0 12px rgba(93,187,99,0.35)'}}>
                  Seleccionar imagen
                </span>
                
              </div>
            ) : (
              <div style={{position:'relative',display:'inline-block'}}>
                <img src={form.imagen} alt="preview"
                  style={{width:110,height:110,borderRadius:10,objectFit:'cover',border:'2px solid #4CAF50',display:'block'}} />
                <button type="button" onClick={removeImage}
                  style={{position:'absolute',top:-8,right:-8,width:24,height:24,borderRadius:'50%',
                    background:'#E53935',border:'none',color:'white',fontSize:14,fontWeight:700,
                    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                    boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}>×</button>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{marginTop:6,display:'block',fontSize:12,color:'#4CAF50',background:'none',
                    border:'none',cursor:'pointer',fontWeight:600,padding:0}}>
                  Cambiar imagen
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              style={{display:'none'}} onChange={onFileChange} />
            {imgError && <p style={{margin:'4px 0 0',fontSize:12,color:'#E53935',fontWeight:600}}>⚠ {imgError}</p>}
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

export default function CategoriasPage() {
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

  const refresh = () => {
    categoriasService.getAll()
      .then(d => setCats(Array.isArray(d) ? d : []))
      .catch(() => setCats([]));
  };
  const showOk = msg => { setSuccess(msg); setTimeout(()=>setSuccess(''),3000); };

  const shown = query.trim()
    ? cats.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()) || (c.descripcion||'').toLowerCase().includes(query.toLowerCase()))
    : cats;
  const totalPages = Math.ceil(shown.length / PER_PAGE);
  const paginated = shown.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const handleSearch = val => { setQuery(val); setPage(1); };

  const handleDelete = async () => {
    // Guard: check if any products use this category
    const productosConCategoria = (JSON.parse(localStorage.getItem('sicaber_productos_menu')||'[]'))
      .filter(p => p.categoria === deleteTarget.nombre);
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

        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Categorías</h1>
            <p className="page-subtitle">Organiza los productos del menú por categoría</p>
          </div>
          <button className="btn-add" onClick={() => setModal('new')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva categoría
          </button>
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
              {!query && <button className="btn-add-first" onClick={()=>setModal('new')}>
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
                        <button className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`}
                          onClick={async ()=>{await categoriasService.toggleEstado(c.id);refresh();}} title={c.estado}>
                          <span className="toggle-thumb"/>
                        </button>
                      </td>
                      <td style={{fontSize:13,color:'var(--text-muted)'}}>{fmt(c.fechaCreacion)}</td>
                      <td>
                        <div className="actions-group">
                          <Tooltip label="Editar">
                            <button className="btn-editar" onClick={()=>setModal(c)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </Tooltip>
                          <AnularButton onClick={()=>setDel(c)}/>
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
                      <div className="prod-card__price" style={{fontSize:12,color:'var(--text-muted)'}}>{fmt(c.fechaCreacion)}</div>
                    </div>
                    <div className="prod-card__foot">
                      <button className={`toggle-btn ${c.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{transform:'scale(0.85)'}} onClick={async ()=>{await categoriasService.toggleEstado(c.id);refresh();}}><span className="toggle-thumb"/></button>
                      <div className="actions-group">
                        <Tooltip label="Editar">
                          <button className="btn-editar" onClick={()=>setModal(c)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        </Tooltip>
                        <AnularButton size={15} onClick={()=>setDel(c)}/>
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