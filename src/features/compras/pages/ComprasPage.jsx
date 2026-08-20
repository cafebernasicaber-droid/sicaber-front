import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useCompras from '../hooks/useCompras';
import CompraForm from '../components/CompraForm';
import './ComprasPage.css';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import ImageLightbox from '../../../shared/components/ImageLightbox';
import '../../../shared/components/ImageLightbox.css';
import { formatoTitulo } from '../../../shared/utils/textFormat';

const formatCOP = (val) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(val) || 0);

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
};

// ── Modal Ver Compra ──────────────────────────────────────────────────────────
function ModalVerCompra({ compra, onClose, onAnular }) {
  const esAnulada = compra.estado === 'anulada';
  const [zoomComprobante, setZoomComprobante] = useState(false);
  const comprobanteUrl = compra.comprobante_url || compra.comprobanteUrl || '';
  const totalBruto = compra.total_bruto ?? compra.totalBruto;
  const descuento  = Number(compra.descuento) || 0;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:680,
        maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ width:44,height:44,borderRadius:12,flexShrink:0,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:800,fontSize:16,color:'var(--text-primary)' }}>Compra #{compra.id}</div>
              <div style={{ display:'flex',gap:6,marginTop:4,flexWrap:'wrap' }}>
                <span className="badge-cat">{formatoTitulo(compra.proveedorNombre)}</span>
                {esAnulada
                  ? <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(183,28,28,.25)',color:'#EF9A9A',border:'1px solid rgba(239,83,80,.3)' }}>Anulada</span>
                  : <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(46,125,50,.2)',color:'#81C784',border:'1px solid rgba(129,199,132,.3)' }}>Activa</span>
                }
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover,rgba(128,128,128,.12))',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12 }}>Información General</div>
              {[
                ['ID', <span style={{ fontFamily:'monospace',fontSize:12,color:'#81C784',background:'rgba(76,175,80,.12)',padding:'2px 8px',borderRadius:6 }}>{compra.id}</span>],
                ['Proveedor',    formatoTitulo(compra.proveedorNombre)],
                ['Fecha',        compra.fecha],
                ...(descuento > 0 && totalBruto != null ? [
                  ['Subtotal',  formatCOP(totalBruto)],
                  ['Descuento', <span style={{ color:'#C9A227', fontWeight:700 }}>{descuento}% (-{formatCOP(totalBruto - compra.total)})</span>],
                ] : []),
                ['Total',        <span style={{ fontWeight:800,color:'#FFCC80' }}>{formatCOP(compra.total)}</span>],
                ['Estado',       esAnulada ? 'Anulada' : 'Activa'],
                ['Registrado',   formatDate(compra.fechaCreacion)],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12 }}>Resumen</div>
              {[
                ['Cantidad de ítems', compra.items?.length || 0],
                ...(esAnulada ? [
                  ['Fecha anulación', formatDate(compra.fechaAnulacion)],
                  ['Motivo',          compra.motivoAnulacion || '—'],
                ] : []),
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
              {compra.observaciones && (
                <div style={{ marginTop:10,fontSize:12,color:'var(--text-secondary)' }}>
                  <span style={{ fontWeight:600 }}>Notas:</span> {compra.observaciones}
                </div>
              )}
            </div>
          </div>

          {/* Tabla insumos */}
          <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10 }}>Detalle de Insumos</div>
            {compra.items && compra.items.length > 0 ? (
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid rgba(255,255,255,.1)' }}>
                    {['Insumo','Unidad','Cantidad','Precio unit.','Subtotal'].map(h => (
                      <th key={h} style={{ padding:'6px 8px',textAlign:'left',fontWeight:700,color:'var(--text-secondary)',fontSize:12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compra.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 8px',fontWeight:600,color:'var(--text-primary)' }}>{formatoTitulo(item.insumo)}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text-secondary)' }}>{item.unidad || '—'}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text-primary)' }}>{item.cantidad}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text-primary)' }}>{formatCOP(item.precioUnitario)}</td>
                      <td style={{ padding:'7px 8px',fontWeight:700,color:'#FFCC80' }}>{formatCOP(item.cantidad * item.precioUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--border)',background:'var(--bg-hover)' }}>
                    <td colSpan="4" style={{ padding:'8px',fontWeight:700,color:'var(--text-secondary)',fontSize:13 }}>Total</td>
                    <td style={{ padding:'8px',fontWeight:800,color:'#FFCC80',fontSize:15 }}>{formatCOP(compra.total)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p style={{ color:'var(--text-secondary)',fontSize:13,margin:0 }}>Sin insumos registrados.</p>
            )}
          </div>

          {/* Comprobante */}
          {comprobanteUrl && (
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10 }}>Comprobante de compra</div>
              <div style={{ position:'relative', width:'100%', maxHeight:260, borderRadius:8, overflow:'hidden', background:'var(--bg-surface-2)' }}>
                <img src={comprobanteUrl} alt="Comprobante de compra" style={{ width:'100%', maxHeight:260, objectFit:'contain', display:'block', margin:'0 auto', cursor:'zoom-in' }} onClick={() => setZoomComprobante(true)} />
                <button type="button" className="ilb-zoom-trigger" title="Ver completo / Zoom"
                  onClick={() => setZoomComprobante(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
              </div>
              {zoomComprobante && (
                <ImageLightbox src={comprobanteUrl} alt="Comprobante de compra" onClose={() => setZoomComprobante(false)} />
              )}
            </div>
          )}

          {/* Acciones */}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            {!esAnulada && (
              <AnularButton size={14} className="" onClick={onAnular}
                style={{ padding:10,background:'linear-gradient(135deg,#E53935,#B71C1C)',border:'none',borderRadius:10,color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}/>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const ComprasPage = () => {
  const navigate = useNavigate();
  const { compras, anular, create, refresh } = useCompras();
  const [query, setQuery]               = useState('');
  const [filtered, setFiltered]         = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [verTarget, setVerTarget]       = useState(null);
  const [anularTarget, setAnularTarget] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [motivoError, setMotivoError]   = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [errorMsg, setErrorMsg]         = useState('');
  const searchRef = useRef();

  const displayed = filtered !== null ? filtered : compras;
  const searched  = query.trim() !== '';

  // Búsqueda local sobre las compras ya cargadas por useCompras. Antes
  // llamaba a "comprasService.search(...)", que nunca existió en el
  // servicio — cada vez que alguien escribía en el buscador, la página
  // tiraba un error ("comprasService.search is not a function").
  // Proveedor e insumos: son los datos visibles en la tabla (columnas
  // "Proveedor" e "Insumos"). El id de la compra se quitó del filtro porque
  // no se muestra en ninguna parte de la tabla/tarjeta, así que buscar por
  // él no coincidía con nada visible en pantalla.
  const buscarCompras = (texto) => {
    const term = texto.toLowerCase();
    return compras.filter(c =>
      (c.proveedorNombre || '').toLowerCase().includes(term) ||
      (c.items || []).some(it => (it.insumo || '').toLowerCase().includes(term))
    );
  };

  // Búsqueda en tiempo real
  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.trim() === '') setFiltered(null);
    else setFiltered(buscarCompras(val));
  };
  const clearSearch = () => { setQuery(''); setFiltered(null); searchRef.current?.focus(); };

  // Antes esto no esperaba (await) ni capturaba nada: create(data) es
  // async y api.js lanza (throw) cuando el backend rechaza la compra (ej.
  // stock/validación), pero como no había ni await ni try/catch, el modal
  // se cerraba y mostraba "¡Compra registrada correctamente!" igual —
  // aunque la compra jamás se hubiera guardado.
  const handleAddSubmit = async (data) => {
    try {
      const r = await create(data);
      if (r?.error) { showError(r.error); return; }
      setShowAddModal(false);
      showSuccess('¡Compra registrada correctamente! El stock fue actualizado.');
    } catch (err) {
      showError(err.message || 'No se pudo registrar la compra.');
    }
  };

  const openAnular = (c) => {
    setVerTarget(null); // cerrar modal ver si está abierto
    setAnularTarget(c);
    setMotivoAnulacion('');
    setMotivoError('');
  };

  const handleAnular = () => {
    if (!anularTarget) return;
    if (!motivoAnulacion.trim()) { setMotivoError('El motivo es obligatorio para anular.'); return; }
    const ok = anular(anularTarget.id, motivoAnulacion.trim());
    if (ok) {
      if (query.trim()) setFiltered(buscarCompras(query));
      else setFiltered(null);
      showSuccess(`Compra #${anularTarget.id} anulada. El stock fue revertido.`);
    } else {
      showError(`No se pudo anular la compra #${anularTarget.id}.`);
    }
    setAnularTarget(null);
    setMotivoAnulacion('');
  };

  const showSuccess = (msg) => { setSuccessMsg(msg); setErrorMsg('');  setTimeout(() => setSuccessMsg(''), 3500); };
  const showError   = (msg) => { setErrorMsg(msg);  setSuccessMsg(''); setTimeout(() => setErrorMsg(''), 4000); };

  return (
    <Layout>
      <div className="insumos-root">
        {successMsg && (
          <div className="toast toast-success">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="toast toast-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Modal Ver Compra */}
        {verTarget && (
          <ModalVerCompra
            compra={verTarget}
            onClose={() => setVerTarget(null)}
            onAnular={() => openAnular(verTarget)}
          />
        )}

        {/* Modal Anular */}
        {anularTarget && (
          <div className="modal-overlay" onClick={() => setAnularTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3>Anular compra</h3>
              <p>El stock de los insumos será <strong>revertido</strong> al anular esta compra.</p>
              <div className="modal-detail">Compra #{anularTarget.id} — {anularTarget.proveedorNombre}</div>
              <div style={{ marginTop:12 }}>
                <label style={{ fontWeight:600,fontSize:13,display:'block',marginBottom:6 }}>
                  Motivo de anulación <span style={{ color:'#E53935' }}>*</span>
                </label>
                <textarea
                  value={motivoAnulacion}
                  onChange={e => { setMotivoAnulacion(e.target.value); if(motivoError) setMotivoError(''); }}
                  placeholder="Describe el motivo de la anulación..."
                  rows={3}
                  style={{ width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${motivoError?'#E53935':'#ddd'}`,fontSize:13,resize:'vertical' }}
                />
                {motivoError && <span style={{ color:'#E53935',fontSize:12 }}>{motivoError}</span>}
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setAnularTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleAnular}>Anular compra</button>
              </div>
            </div>
          </div>
        )}

        <div className="page-header">
          <h1 className="page-title">Compras a Proveedores</h1>
          <p className="page-subtitle">Registro de compras realizadas — últimos 30 días</p>
        </div>

        <div className="insumos-toolbar">
          <div className="search-wrap" style={{ flex:1,maxWidth:480 }}>
            <span className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              ref={searchRef} type="text"
              placeholder="Buscar por proveedor o fecha..."
              value={query} onChange={handleSearch}
              className="search-input"
            />
            {query && (
              <button className="search-clear" onClick={clearSearch} title="Limpiar búsqueda">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ display:'flex',gap:8 }}>
            <button
              style={{ padding:'10px 18px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-surface-3)',color:'var(--text-secondary)',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}
              onClick={() => navigate('/compras/historial')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Historial
            </button>
            <button className="btn-add" onClick={() => setShowAddModal(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Registrar compra
            </button>
          </div>
        </div>

        <div className="insumos-card">
          {displayed.length === 0 ? (
            <div className="empty-state">
              {searched ? (
                <>
                  <div className="empty-icon empty-icon-search">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </div>
                  <h3>No se encontraron coincidencias</h3>
                  <p>No hay compras que coincidan con "<strong>{query}</strong>"</p>
                  <button className="btn-outline-green" onClick={clearSearch}>Ver todas las compras</button>
                </>
              ) : (
                <>
                  <div className="empty-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                  </div>
                  <h3>No hay compras activas</h3>
                  <p>Las compras de los últimos 30 días aparecerán aquí. Las más antiguas van al historial.</p>
                  <button className="btn-add-first" onClick={() => setShowAddModal(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Registrar primera compra
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              {searched && (
                <div className="search-results-info">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  {displayed.length} resultado{displayed.length !== 1 ? 's' : ''} para "{query}"
                </div>
              )}
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Proveedor</th><th>Fecha</th>
                    <th>Insumos</th><th>Total</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(c => (
                    <tr key={c.id}>
                      <td className="td-nombre">{formatoTitulo(c.proveedorNombre)}</td>
                      <td>{c.fecha}</td>
                      <td>
                        <div className="items-nombres">
                          {c.items && c.items.length > 0
                            ? c.items.map((it, i) => <span key={i} className="badge-insumo">{formatoTitulo(it.insumo)}</span>)
                            : <span className="badge-items">Sin insumos</span>
                          }
                        </div>
                      </td>
                      <td className="td-total">{formatCOP(c.total)}</td>
                      <td>
                        <span style={{ padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(58,158,66,0.15)',color:'var(--color-green)',border:'1px solid #A5D6A7' }}>
                          Activa
                        </span>
                      </td>
                      <td>
                        <div className="actions-group">
                          <Tooltip label="Ver detalle">
                            <button className="btn-accion btn-accion-ver" onClick={() => setVerTarget(c)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          </Tooltip>
                          <AnularButton size={14} className="btn-accion btn-accion-eliminar" onClick={() => openAnular(c)}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Registrar Compra */}
        {showAddModal && (
          <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="modal-compra-box" onClick={e => e.stopPropagation()}>
              <div className="modal-compra-header">
                <div className="modal-compra-titulo">
                  <div className="modal-compra-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </div>
                  <div>
                    <h3>Registrar Compra</h3>
                    <p>El stock se actualiza automáticamente al registrar</p>
                  </div>
                </div>
                <button className="modal-compra-close" onClick={() => setShowAddModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="modal-compra-body">
                <CompraForm onSubmit={handleAddSubmit} onCancel={() => setShowAddModal(false)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ComprasPage;