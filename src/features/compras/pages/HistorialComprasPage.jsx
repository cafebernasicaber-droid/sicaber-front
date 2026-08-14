import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import comprasService from '../services/comprasService';
import './ComprasPage.css';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
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
function ModalVerCompra({ compra, onClose }) {
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
            <div style={{ width:44,height:44,borderRadius:12,flexShrink:0,
              background: esAnulada ? 'linear-gradient(135deg,#E53935,#B71C1C)' : 'linear-gradient(135deg,#4CAF50,#388E3C)',
              display:'flex',alignItems:'center',justifyContent:'center',color:'white' }}>
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
                  : <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(46,125,50,.2)',color:'#81C784',border:'1px solid rgba(129,199,132,.3)' }}>Completada</span>
                }
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover,rgba(128,128,128,.12))',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
            <div style={{ background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12 }}>Información General</div>
              {[
                ['Proveedor',  formatoTitulo(compra.proveedorNombre)],
                ['Fecha',      compra.fecha],
                ...(descuento > 0 && totalBruto != null ? [
                  ['Subtotal',  formatCOP(totalBruto)],
                  ['Descuento', <span style={{ color:'#C9A227', fontWeight:700 }}>{descuento}% (-{formatCOP(totalBruto - compra.total)})</span>],
                ] : []),
                ['Total',      <span style={{ fontWeight:800,color:'#FFCC80' }}>{formatCOP(compra.total)}</span>],
                ['Estado',     esAnulada ? 'Anulada' : 'Completada'],
                ['Registrado', formatDate(compra.fechaCreacion)],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12 }}>Resumen</div>
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
                <div style={{ marginTop:10,fontSize:12,color:'var(--text-muted)' }}>
                  <span style={{ fontWeight:600 }}>Notas:</span> {compra.observaciones}
                </div>
              )}
            </div>
          </div>

          {/* Tabla insumos */}
          <div style={{ background:'var(--bg-surface-2)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10 }}>Detalle de Insumos</div>
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
                    <tr key={idx} style={{ borderBottom:'1px solid rgba(255,255,255,.07)' }}>
                      <td style={{ padding:'7px 8px',fontWeight:600 }}>{formatoTitulo(item.insumo)}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text-muted)' }}>{item.unidad || '—'}</td>
                      <td style={{ padding:'7px 8px' }}>{item.cantidad}</td>
                      <td style={{ padding:'7px 8px' }}>{formatCOP(item.precioUnitario)}</td>
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
            <div style={{ background:'var(--bg-surface-2)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10 }}>Comprobante de compra</div>
              <div style={{ position:'relative', width:'100%', maxHeight:260, borderRadius:8, overflow:'hidden', background:'var(--bg-surface-3)' }}>
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

          <div style={{ display:'flex',justifyContent:'flex-end' }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página Historial ──────────────────────────────────────────────────────────
const HistorialComprasPage = () => {
  const navigate = useNavigate();
  const [desde, setDesde]       = useState('');
  const [hasta, setHasta]       = useState('');
  const [verCompra, setVerCompra] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    comprasService.getHistorial()
      .then(data => { if (activo) setHistorial(Array.isArray(data) ? data : []); })
      .catch(() => { if (activo) setHistorial([]); })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, []);

  const filtrado = useMemo(() => {
    return (Array.isArray(historial) ? historial : []).filter(c => {
      const fecha = (c.fecha || c.fechaCreacion || '').substring(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }, [historial, desde, hasta]);

  const totalHistorial   = filtrado.length;
  const totalAnuladas    = filtrado.filter(c => c.estado === 'anulada').length;
  const totalCompletadas = filtrado.filter(c => c.estado !== 'anulada').length;
  const totalMonto       = filtrado.reduce((acc, c) => acc + (Number(c.total) || 0), 0);

  return (
    <Layout>
      <div className="insumos-root">

        {/* Modal Ver */}
        {verCompra && (
          <ModalVerCompra compra={verCompra} onClose={() => setVerCompra(null)} />
        )}

        <div className="breadcrumb" style={{ marginBottom:16,display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--text-muted)' }}>
          <button onClick={() => navigate('/compras')} style={{ background:'none',border:'none',cursor:'pointer',color:'#388E3C',fontWeight:600,padding:0,fontSize:13 }}>
            Compras a Proveedores
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span>Historial</span>
        </div>

        <div className="page-header">
          <h1 className="page-title">Historial de Compras</h1>
          <p className="page-subtitle">Compras antiguas (&gt;30 días) y anuladas</p>
        </div>

        {/* Resumen */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24 }}>
          {[
            { label:'Total en historial', value: totalHistorial,          color:'#1565C0', bg:'rgba(25,118,210,0.12)' },
            { label:'Completadas',        value: totalCompletadas,        color:'#2E7D32', bg:'#E8F5E9' },
            { label:'Anuladas',           value: totalAnuladas,           color:'#B71C1C', bg:'#FFEBEE' },
            { label:'Monto total',        value: formatCOP(totalMonto),   color:'#4E342E', bg:'#EFEBE9', isText:true },
          ].map(({ label, value, color, bg, isText }) => (
            <div key={label} style={{ background:'var(--stat-card-bg)',borderRadius:12,padding:'16px 20px',border:`1px solid var(--border)`,borderTop:`3px solid ${color}`,boxShadow:'var(--stat-card-shadow)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:isText?16:26,fontWeight:800,color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filtros por fecha */}
        <div style={{ display:'flex',gap:12,alignItems:'center',marginBottom:16,flexWrap:'wrap' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <label style={{ fontSize:13,fontWeight:600,color:'var(--text-secondary)' }}>Desde:</label>
            <input type="date" value={desde}
              onChange={e => { setDesde(e.target.value); }}
              style={{ padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)' }} />
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <label style={{ fontSize:13,fontWeight:600,color:'var(--text-secondary)' }}>Hasta:</label>
            <input type="date" value={hasta}
              onChange={e => { setHasta(e.target.value); }}
              style={{ padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)' }} />
          </div>
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); }}
              style={{ padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontSize:13,cursor:'pointer' }}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="insumos-card">
          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3>Cargando historial…</h3>
            </div>
          ) : filtrado.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3>No hay registros en el historial</h3>
              <p>Las compras mayores a 30 días o anuladas aparecerán aquí</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Proveedor</th><th>Fecha</th>
                    <th>Insumos</th><th>Total</th><th>Descuento</th><th>Estado</th><th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrado.map(c => {
                    const esAnulada = c.estado === 'anulada';
                    return (
                      <tr key={c.id}>
                        <td className="td-nombre">{formatoTitulo(c.proveedorNombre)}</td>
                        <td>{c.fecha}</td>
                        <td>
                          <div className="items-nombres">
                            {(c.items || []).slice(0,3).map((it, i) => (
                              <span key={i} className="badge-insumo">{formatoTitulo(it.insumo)}</span>
                            ))}
                            {(c.items || []).length > 3 && (
                              <span className="badge-insumo">+{c.items.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="td-total">{formatCOP(c.total)}</td>
                        <td>{Number(c.descuento) > 0 ? <span style={{ color:'#C9A227', fontWeight:700 }}>{Number(c.descuento)}%</span> : '—'}</td>
                        <td>
                          {esAnulada ? (
                            <span style={{ padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(183,28,28,.25)',color:'#EF9A9A',border:'1px solid rgba(239,83,80,.3)' }}>
                              Anulada
                            </span>
                          ) : (
                            <span style={{ padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(46,125,50,.2)',color:'#81C784',border:'1px solid rgba(129,199,132,.3)' }}>
                              Completada
                            </span>
                          )}
                        </td>
                        <td>
                          <Tooltip label="Ver detalle">
                            <button className="btn-ver" onClick={() => setVerCompra(c)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                              </svg>
                            </button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default HistorialComprasPage;
