import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import fichasTecnicasService from '../services/fichasTecnicasService';
import productosService from '../../productos/services/productosService';
import insumosService from '../../insumos/services/insumosService';
import '../../insumos/pages/InsumosPage.css';
import { CATEGORIAS_PREP } from '../../../shared/utils/tiposPreparacion';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
const fmtPct = n => `${Math.round((n||0)*100)}%`;
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

// Margen de ganancia mínimo esperado por el negocio (30%). Se usa solo para
// advertir al administrador — nunca bloquea el guardado de la ficha.
const MARGEN_MINIMO = 0.30;

// Íconos reutilizados en todo el módulo.
const IconEditar = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconMas = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconInfo = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
const IconAlerta = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>;
const IconX = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

// El backend puede devolver el identificador como `id_ficha` o como `id`
// según el endpoint.
const getFichaId = f => f?.id_ficha ?? f?.id;

// ── DETALLE MODAL ────────────────────────────────────────────────────────────
// Se conserva como modal (no como página completa): es una vista de solo
// lectura, compacta, que no necesitaba el espacio adicional que sí
// requería el formulario de 4 pasos (ver FichaTecnicaFormPage.jsx).
function ModalDetalleFicha({ ficha, onClose, onEditar, onAnular }) {
  const { hasPermiso } = useAuth();
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos]     = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => setProductos(Array.isArray(d) ? d : [])).catch(()=>{});
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const p = productos.find(x => String(x.id) === String(ficha.id_producto));
  const pasos = (ficha.preparacion || '').split('\n').filter(x => x.trim());
  const fichaInsumos = ficha.insumos || [];

  const vasoSel = insumos.find(i => String(i.id) === String(ficha.vaso_id));
  const costoCalculado = fichaInsumos.reduce((s, i) => {
    const insumo = insumos.find(x => String(x.id) === String(i.id_insumo));
    return s + (Number(i.cantidad) || 0) * (insumo?.precioUnitario || 0);
  }, 0) + (vasoSel?.precioUnitario || 0);
  const margenCalculado = p && p.precio > 0 ? (p.precio - costoCalculado) / p.precio : null;
  const margenBajo = p && costoCalculado > 0 && margenCalculado !== null && margenCalculado < MARGEN_MINIMO;
  const costoSuperaPrecio = !!(p && costoCalculado > 0 && costoCalculado >= p.precio);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:680,
        maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:'var(--text-primary)'}}>{p?.nombre || 'Ficha técnica'}</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{ficha.categoria_prep} · {ficha.porciones} unidad{ficha.porciones>1?'es':''} · {ficha.tiempo_prep} min</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {hasPermiso('fichas', 'editar') && (
              <Tooltip label="Editar">
                <button className="btn-add" onClick={onEditar} style={{padding:'8px',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}><IconEditar/></button>
              </Tooltip>
            )}
            {hasPermiso('fichas', 'eliminar') && (
              <AnularButton onClick={onAnular} className="btn-confirm-danger" style={{padding:'8px',fontSize:12,borderRadius:8}}/>
            )}
            <button onClick={onClose} title="Cerrar" style={{width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
              <IconX width="15" height="15"/>
            </button>
          </div>
        </div>

        <div style={{padding:'20px 24px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Información general</div>
              {[['Producto',p?.nombre||'—'],['Categoría',p?.categoria||'—'],['Tipo prep.',ficha.categoria_prep],['Registrada',fmtFecha(ficha.fecha_registro)]].map(([k,v]) => (
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text-secondary)',fontWeight:600}}>{k}</span>
                  <span style={{color:'var(--text-primary)',fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Costos y márgenes</div>
              {[['Precio de venta',fmt(p?.precio||0),true],['Costo estimado',fmt(ficha.costo_estimado),false],['Margen estimado',fmt((p?.precio||0)-ficha.costo_estimado),true]].map(([k,v,green]) => (
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text-secondary)',fontWeight:600}}>{k}</span>
                  <span style={{color:green?'var(--color-green)':'var(--text-primary)',fontWeight:700}}>{v}</span>
                </div>
              ))}
              {margenCalculado !== null && costoCalculado > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0 0',fontSize:12,gap:8}}>
                  <span style={{color: costoSuperaPrecio ? '#E53935' : margenBajo ? '#F57F17' : 'var(--text-secondary)',fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
                    {(costoSuperaPrecio || margenBajo) && <IconAlerta width="12" height="12"/>} Margen por insumos + vaso ({fmtPct(margenCalculado)})
                  </span>
                  {costoSuperaPrecio
                    ? <span style={{color:'#E53935',fontWeight:700,textAlign:'right'}}>Costo ≥ precio de venta</span>
                    : margenBajo && <span style={{color:'#F57F17',fontWeight:700,textAlign:'right'}}>Bajo el mínimo ({fmtPct(MARGEN_MINIMO)})</span>}
                </div>
              )}
            </div>
          </div>

          <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Insumos requeridos ({fichaInsumos.length})</div>
            {fichaInsumos.length === 0 && (
              <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>Esta ficha no tiene insumos registrados.</p>
            )}
            {fichaInsumos.map((ins, i) => {
              const insumo = insumos.find(s => String(s.id) === String(ins.id_insumo));
              return (
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:6,background:i%2===0?'var(--bg-hover)':'transparent',fontSize:13}}>
                  <span style={{fontWeight:600,color:'var(--text-primary)'}}>{insumo?.nombre||`Insumo #${ins.id_insumo}`}</span>
                  <span style={{color:'var(--text-secondary)'}}>{ins.cantidad} {ins.unidad}</span>
                </div>
              );
            })}
          </div>

          <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)',marginBottom:ficha.notas?14:0}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Proceso de preparación</div>
            {ficha.resumen_prep && <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:10}}>{ficha.resumen_prep}</p>}
            <ol style={{paddingLeft:20,margin:0}}>
              {pasos.map((paso,i) => <li key={i} style={{fontSize:13,color:'var(--text-primary)',marginBottom:7,lineHeight:1.6}}>{paso.replace(/^\d+\.\s*/,'')}</li>)}
            </ol>
          </div>

          {ficha.notas && (
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'14px 18px',border:'1px solid rgba(245,176,0,0.35)',marginTop:14}}>
              <div style={{fontWeight:700,marginBottom:6,color:'var(--text-primary)',display:'flex',alignItems:'center',gap:6}}><IconInfo/> Notas</div>
              <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,margin:0}}>{ficha.notas}</p>
            </div>
          )}

          <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function FichasTecnicasPage() {
  const { hasPermiso } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [fichas, setFichas]         = useState([]);
  const [query, setQuery]           = useState('');
  const [catFiltro, setCatFiltro]         = useState('todas');
  const [tipoPrepFiltro, setTipoPrepFiltro] = useState('todos');
  const [estadoFiltro, setEstadoFiltro]   = useState('todos');
  // El formulario de crear/editar ya no es un modal (ver
  // FichaTecnicaFormPage.jsx, rutas /fichas-tecnicas/nueva y
  // /fichas-tecnicas/editar/:id) — "modal" acá solo controla el detalle
  // de solo lectura ("ver"), que sí se mantiene como modal.
  const [modal, setModal]           = useState(null); // null | 'ver'
  const [fichaActual, setFichaActual] = useState(null);
  const [deleteTarget, setDel]      = useState(null);
  const [success, setSuccess]       = useState('');
  const [page, setPage]             = useState(1);
  const [listError, setListError]   = useState('');
  const PER_PAGE = 4;

  const refresh  = () => {
    setListError('');
    fichasTecnicasService.getAll()
      .then(d => setFichas(Array.isArray(d) ? d : []))
      .catch(err => setListError(err?.message || 'No se pudo cargar la lista de fichas técnicas. Intenta de nuevo o vuelve a iniciar sesión.'));
  };
  const showOk   = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const closeModal = () => { setModal(null); setFichaActual(null); };

  useEffect(() => { refresh(); }, []);

  // Mensaje de éxito tras crear/editar una ficha desde la página completa
  // (FichaTecnicaFormPage navega de vuelta con esto en location.state) —
  // mismo patrón ya usado entre RegistrarCompraPage → ComprasPage.
  useEffect(() => {
    if (location.state?.successMsg) {
      showOk(location.state.successMsg);
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const stats = {
    total: fichas.length,
    activas: fichas.filter(f=>f.estado).length,
    inactivas: fichas.filter(f=>!f.estado).length,
    avgTiempo: fichas.length ? Math.round(fichas.reduce((s,f)=>s+(f.tiempo_prep||0),0) / fichas.length) : 0,
  };

  const [productos, setProductos] = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => setProductos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const getProd   = id => productos.find(p => p.id === id);
  const categoriasDisponibles = [...new Set(fichas.map(f => getProd(f.id_producto)?.categoria).filter(Boolean))];

  const displayed = fichas.filter(f => {
    const p = getProd(f.id_producto);
    const q = query.trim().toLowerCase();
    const matchQuery = !q || (p?.nombre||'').toLowerCase().includes(q) || (f.categoria_prep||'').toLowerCase().includes(q);
    const matchCat   = catFiltro === 'todas' || p?.categoria === catFiltro;
    const matchTipo  = tipoPrepFiltro === 'todos' || f.categoria_prep === tipoPrepFiltro;
    const matchEstado = estadoFiltro === 'todos' || (estadoFiltro === 'activas' ? !!f.estado : !f.estado);
    return matchQuery && matchCat && matchTipo && matchEstado;
  });

  const totalPages = Math.ceil(displayed.length / PER_PAGE);
  const paginated  = displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleToggleEstado = async (ficha) => {
    setListError('');
    try {
      await fichasTecnicasService.toggleEstado?.(getFichaId(ficha));
      refresh();
    } catch (err) {
      setListError(err?.message || 'No se pudo cambiar el estado de la ficha técnica.');
    }
  };

  const handleDelete = async () => {
    try {
      await fichasTecnicasService.remove(getFichaId(deleteTarget));
      refresh(); showOk('Ficha técnica anulada'); setDel(null); closeModal();
    } catch (err) {
      setDel(null);
      setListError(err?.message || 'No se pudo anular la ficha técnica.');
    }
  };

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {listError && (
          <div style={{background:'rgba(229,57,53,0.12)',border:'1px solid rgba(229,57,53,0.35)',color:'#E53935',padding:'12px 16px',borderRadius:10,marginBottom:16,fontSize:13,display:'flex',alignItems:'center',gap:8}}>
            <IconAlerta style={{flexShrink:0}}/>
            <span>{listError}</span>
            <button onClick={refresh} title="Reintentar carga" style={{marginLeft:'auto',padding:'6px 12px',borderRadius:8,border:'1.5px solid rgba(229,57,53,0.4)',background:'transparent',color:'#E53935',cursor:'pointer',fontSize:12,fontWeight:700}}>Reintentar</button>
          </div>
        )}

        {/* ── Modal: solo el detalle de solo lectura ── */}
        {modal === 'ver' && fichaActual && (
          <ModalDetalleFicha
            ficha={fichaActual}
            onClose={closeModal}
            onEditar={() => navigate(`/fichas-tecnicas/editar/${getFichaId(fichaActual)}`)}
            onAnular={() => setDel(fichaActual)}
          />
        )}
        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDel(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
              <h3>¿Anular ficha técnica?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{getProd(deleteTarget.id_producto)?.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" title="Cerrar sin anular" onClick={() => setDel(null)}>Cancelar</button>
                <button className="btn-confirm-danger" title="Confirmar anulación de la ficha" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Fichas Técnicas</h1>
            <p className="page-subtitle">Gestiona las fichas de preparación de cada producto del menú</p>
          </div>
          {hasPermiso('fichas', 'crear') && (
            <button className="btn-add" title="Crear una nueva ficha técnica" onClick={() => navigate('/fichas-tecnicas/nueva')}>
              <IconMas width="18" height="18"/>
              Nueva ficha técnica
            </button>
          )}
        </div>

        {/* ── Stats ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          {[{l:'Total fichas',v:stats.total,c:'#1565C0'},{l:'Activas',v:stats.activas,c:'#2E7D32'},{l:'Inactivas',v:stats.inactivas,c:'#757575'},{l:'Tiempo prom.',v:stats.avgTiempo+' min',c:'#E65100'}].map((s,i) => (
            <div key={i} style={{background:'var(--stat-card-bg)',borderRadius:12,padding:'16px 18px',borderTop:`3px solid ${s.c}`,boxShadow:'var(--stat-card-shadow)',border:`1px solid var(--border)`,borderTopColor:s.c}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>{s.l}</div>
              <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="insumos-toolbar" style={{flexWrap:'wrap'}}>
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input type="text" className="search-input" title="Buscar ficha técnica por nombre de producto o tipo de preparación" placeholder="Buscar por producto o tipo de preparación..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/>
              {query && <button className="search-clear" title="Limpiar búsqueda" onClick={() => setQuery('')}><IconX/></button>}
            </div>
          </div>
          <select value={catFiltro} onChange={e => { setCatFiltro(e.target.value); setPage(1); }} title="Filtrar por categoría del producto"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={tipoPrepFiltro} onChange={e => { setTipoPrepFiltro(e.target.value); setPage(1); }} title="Filtrar por tipo de preparación"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todos">Todos los tipos de preparación</option>
            {CATEGORIAS_PREP.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }} title="Filtrar por estado de la ficha"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todos">Todos los estados</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </select>
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{displayed.length} ficha{displayed.length!==1?'s':''}</span>
        </div>

        {/* ── Tabla ── */}
        <div className="insumos-card">
          {displayed.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
              <h3>{query || catFiltro!=='todas' || tipoPrepFiltro!=='todos' || estadoFiltro!=='todos' ? 'Sin coincidencias' : 'No hay fichas técnicas'}</h3>
              <p>Crea fichas técnicas para documentar la preparación de cada producto</p>
              {!query && hasPermiso('fichas', 'crear') && <button className="btn-add-first" onClick={() => navigate('/fichas-tecnicas/nueva')}>Nueva ficha técnica</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead><tr><th>Producto</th><th>Categoría</th><th>Tipo prep.</th><th>Unidad</th><th>Tiempo</th><th>Insumos</th><th>Costo</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {paginated.map(f => {
                    const p = getProd(f.id_producto);
                    return (
                      <tr key={getFichaId(f)}>
                        <td>
                          <div className="td-nombre">{p?.nombre||'—'}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>{p ? fmt(p.precio) : ''}</div>
                        </td>
                        <td><span className="badge-cat">{p?.categoria||'—'}</span></td>
                        <td style={{fontSize:12,color:'var(--text-secondary)'}}>{f.categoria_prep}</td>
                        <td style={{textAlign:'center',fontWeight:600}}>{f.porciones}</td>
                        <td style={{fontWeight:600}}>{f.tiempo_prep} min</td>
                        <td><span style={{fontSize:12,color:'var(--text-secondary)'}}>{(f.insumos?.length ?? 0)} ingr.</span></td>
                        <td style={{fontWeight:600,color:'#E65100'}}>{fmt(f.costo_estimado)}</td>
                        <td>
                          {hasPermiso('fichas', 'editar') ? (
                            <button className={`toggle-btn ${f.estado?'toggle-on':'toggle-off'}`} onClick={() => handleToggleEstado(f)} title={f.estado?'Activa (clic para desactivar)':'Inactiva (clic para activar)'}>
                              <span className="toggle-thumb"/>
                            </button>
                          ) : (
                            <span className={`toggle-btn ${f.estado?'toggle-on':'toggle-off'}`} style={{cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                          )}
                        </td>
                        <td>
                          <div className="actions-group">
                            {hasPermiso('fichas', 'ver') && (
                              <Tooltip label="Ver detalle">
                                <button className="btn-ver" onClick={() => { setFichaActual(f); setModal('ver'); }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                              </Tooltip>
                            )}
                            {hasPermiso('fichas', 'editar') && (
                              <Tooltip label="Editar">
                                <button className="btn-editar" onClick={() => navigate(`/fichas-tecnicas/editar/${getFichaId(f)}`)}>
                                  <IconEditar width="16" height="16"/>
                                </button>
                              </Tooltip>
                            )}
                            {hasPermiso('fichas', 'eliminar') && <AnularButton onClick={() => setDel(f)}/>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderTop:'1px solid var(--border)',marginTop:4}}>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>
                Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,displayed.length)} de {displayed.length} fichas
              </span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} title="Página anterior"
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border-input)',background:page===1?'var(--bg-surface-3)':'var(--bg-surface)',color:page===1?'var(--text-muted)':'var(--text-primary)',cursor:page===1?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>← Ant.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{padding:'6px 11px',borderRadius:8,border:`1.5px solid ${n===page?'var(--color-green)':'var(--border)'}`,background:n===page?'var(--color-green)':'var(--bg-surface)',color:n===page?'#ffffff':'var(--text-primary)',cursor:'pointer',fontSize:13,fontWeight:700}}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} title="Página siguiente"
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border-input)',background:page===totalPages?'var(--bg-surface-3)':'var(--bg-surface)',color:page===totalPages?'var(--text-muted)':'var(--text-primary)',cursor:page===totalPages?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>Sig. →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}