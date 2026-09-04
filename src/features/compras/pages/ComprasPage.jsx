import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useCompras from '../hooks/useCompras';
import useTiposPresentacion from '../hooks/useTiposPresentacion';
import CompraForm from '../components/CompraForm';
import { filtrarBusqueda } from '../../../shared/utils/busqueda';
import localesService from '../../../shared/services/localesService';
import { useAuth } from '../../../shared/contexts/AuthContext';
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
// `compras.fecha` es una columna DATE: el backend la serializa como ISO
// ("2026-09-01T05:00:00.000Z"). En la tabla/detalle solo interesa el día.
const soloFecha = (v) => (v ? String(v).slice(0, 10) : '—');

// ── Modal Ver Compra ──────────────────────────────────────────────────────────
function ModalVerCompra({ compra, onClose, onAnular, puedeAnular = true }) {
  const esAnulada = compra.estado === 'anulada';
  const [zoomComprobante, setZoomComprobante] = useState(false);
  const [insumosExpandidos, setInsumosExpandidos] = useState(false);
  const LIMITE_INSUMOS_VISIBLES = 5;
  const comprobanteUrl = compra.comprobante_url || compra.comprobanteUrl || '';
  const totalBruto = compra.total_bruto ?? compra.totalBruto;
  const descuento  = Number(compra.descuento) || 0;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:680,
        maxHeight:'90vh', overflowY:'auto', overflowX:'hidden',
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
                  : <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(46,125,50,.2)',color:'#81C784',border:'1px solid rgba(129,199,132,.3)' }}>Registrada</span>
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
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Información general</div>
              {[
                ['ID', <span style={{ fontFamily:'monospace',fontSize:12,color:'#81C784',background:'rgba(76,175,80,.12)',padding:'2px 8px',borderRadius:6 }}>{compra.id}</span>],
                ['Proveedor',    formatoTitulo(compra.proveedorNombre)],
                ['Local',        compra.localNombre || '—'],
                ['Fecha',        soloFecha(compra.fecha)],
                ...(descuento > 0 && totalBruto != null ? [['Subtotal', formatCOP(totalBruto)]] : []),
                ['Total',        <span style={{ fontWeight:800,color:'#FFCC80' }}>{formatCOP(compra.total)}</span>],
                ['Descuento',    descuento > 0
                  ? <span style={{ color:'#C9A227', fontWeight:700 }}>{descuento}% (-{formatCOP((totalBruto ?? compra.total) - compra.total)})</span>
                  : <span style={{ color:'var(--text-secondary)' }}>Sin descuento</span>],
                ['Estado',       esAnulada ? 'Anulada' : 'Registrada'],
                ['Registrado',   formatDate(compra.fechaCreacion)],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Resumen</div>
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
                <div style={{ marginTop:10,fontSize:12,color:'var(--text-secondary)',wordBreak:'break-word',overflowWrap:'anywhere' }}>
                  <span style={{ fontWeight:600 }}>Notas:</span> {compra.observaciones}
                </div>
              )}
            </div>
          </div>

          {/* Tabla insumos */}
          <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:10 }}>Detalle de insumos</div>
            {compra.items && compra.items.length > 0 ? (
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid rgba(255,255,255,.1)' }}>
                    {['Insumo','Unidad','Cantidad','Subtotal'].map(h => (
                      <th key={h} style={{ padding:'6px 8px',textAlign:'left',fontWeight:700,color:'var(--text-secondary)',fontSize:12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(insumosExpandidos ? compra.items : compra.items.slice(0, LIMITE_INSUMOS_VISIBLES)).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 8px' }}>
                        <div style={{ fontWeight:600,color:'var(--text-primary)' }}>{formatoTitulo(item.insumo)}</div>
                        {item.presentacion && (
                          <div style={{ fontSize:11,color:'var(--text-muted)',marginTop:2 }}>
                            {item.presentacion.tipo === 'Unitario'
                              ? `Unitario (sin presentación) — ${item.presentacion.contenidoPorPresentacion} ${item.unidad}`
                              : item.presentacion.unidadesInternasPorPresentacion
                                ? `${item.presentacion.cantidad} ${item.presentacion.tipo}(s) × ${item.presentacion.unidadesInternasPorPresentacion} × ${item.presentacion.contenidoPorUnidadInterna} ${item.unidad}`
                                : `${item.presentacion.cantidad} ${item.presentacion.tipo}(s) × ${item.presentacion.contenidoPorPresentacion} ${item.unidad}`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'7px 8px',color:'var(--text-secondary)' }}>{item.unidad || '—'}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text-primary)' }}>{item.cantidad}</td>
                      <td style={{ padding:'7px 8px',fontWeight:700,color:'#FFCC80' }}>{formatCOP(item.cantidad * item.precioUnitario)}</td>
                    </tr>
                  ))}
                  {!insumosExpandidos && compra.items.length > LIMITE_INSUMOS_VISIBLES && (
                    <tr>
                      <td colSpan="4" style={{ padding:'10px 8px', textAlign:'center' }}>
                        <button type="button" onClick={() => setInsumosExpandidos(true)}
                          style={{ background:'#4CAF50', color:'white', border:'none', borderRadius:20, padding:'6px 16px', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                          +{compra.items.length - LIMITE_INSUMOS_VISIBLES} más — ver todos
                        </button>
                      </td>
                    </tr>
                  )}
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
          {comprobanteUrl && (() => {
            const ocr = compra.ocrResultado || {};
            const totalOcr = compra.comprobante_total_ocr ?? compra.comprobanteTotalOcr;
            const diferencia = (totalOcr != null) ? Number(compra.total) - Number(totalOcr) : null;
            const hayAdvertencias = ocr.advertencias && ocr.advertencias.length > 0;
            const estadoTexto = hayAdvertencias ? 'Válido con advertencias' : (totalOcr != null ? 'Válido' : 'Sin verificar');
            const estadoColor = hayAdvertencias ? '#C9A227' : (totalOcr != null ? '#4CAF50' : 'var(--text-secondary)');
            return (
              <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14,display:'grid',gridTemplateColumns:'1fr auto',gap:20 }}>
                <div>
                  <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Resultado de validación OCR</div>
                  {[
                    ['Estado', <span style={{ color:estadoColor, fontWeight:700 }}>{hayAdvertencias ? '⚠ ' : ''}{estadoTexto}</span>],
                    ['Confianza OCR', ocr.confianza != null ? `${ocr.confianza}% — ${(() => {
                      const n = (ocr.advertencias || []).length;
                      if (n === 0) return 'Lectura confiable';
                      if (n === 1) return 'Lectura con una inconsistencia';
                      return 'Lectura con varias inconsistencias';
                    })()}` : '—'],
                    ['Total registrado', formatCOP(compra.total)],
                    ['Total detectado', totalOcr != null ? formatCOP(totalOcr) : '—'],
                    ['Diferencia', diferencia == null ? '—' : (diferencia === 0 ? 'Sin diferencia' : formatCOP(Math.abs(diferencia)))],
                    ['Fecha detectada', ocr.fecha || '—'],
                    ['NIT detectado', ocr.nit || '—'],
                    ['Proveedor detectado', ocr.proveedorCoincide == null ? '—' : (ocr.proveedorCoincide ? 'Coincide con el proveedor registrado' : 'No coincide con el proveedor registrado')],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                      <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                      <span style={{ fontWeight:600,color:'var(--text-primary)',textAlign:'right' }}>{val}</span>
                    </div>
                  ))}
                  {hayAdvertencias && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:12.5,fontWeight:700,color:'var(--text-secondary)',marginBottom:6 }}>Advertencias generadas durante el análisis</div>
                      <ul style={{ margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4 }}>
                        {ocr.advertencias.map((a, i) => <li key={i} style={{ fontSize:12.5,color:'#C9A227' }}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Comprobante original</div>
                  <div style={{ position:'relative', width:130, height:130, borderRadius:8, overflow:'hidden', background:'var(--bg-surface-2)', border:'1px solid var(--border)' }}>
                    <img src={comprobanteUrl} alt="Comprobante de compra" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor:'zoom-in' }} onClick={() => setZoomComprobante(true)} />
                    <button type="button" className="ilb-zoom-trigger" title="Ver completo / Zoom"
                      onClick={() => setZoomComprobante(true)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    </button>
                  </div>
                </div>
                {zoomComprobante && (
                  <ImageLightbox src={comprobanteUrl} alt="Comprobante de compra" onClose={() => setZoomComprobante(false)} />
                )}
              </div>
            );
          })()}

          {/* Acciones */}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            {!esAnulada && puedeAnular && (
              <AnularButton size={14} className="" label="Anular" onClick={onAnular}
                style={{ padding:10,background:'linear-gradient(135deg,#E53935,#B71C1C)',border:'none',borderRadius:10,color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}/>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Gestionar tipos de presentación ─────────────────────────────────
function ModalTiposPresentacion({ onClose }) {
  const { tipos, create, update, toggleEstado } = useTiposPresentacion();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre del tipo de presentación es obligatorio.'); return; }
    setLoading(true);
    try {
      const r = await create({ nombre: nombre.trim() });
      if (r?.error) { setError(r.error); return; }
      setNombre('');
    } catch (err) {
      setError(err.message || 'No se pudo crear el tipo de presentación.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (t) => { setError(''); setEditId(t.id); setEditNombre(t.nombre); };
  const cancelEdit = () => { setEditId(null); setEditNombre(''); };

  const saveEdit = async (t) => {
    setError('');
    if (!editNombre.trim()) { setError('El nombre del tipo de presentación es obligatorio.'); return; }
    if (editNombre.trim() === t.nombre) { cancelEdit(); return; }
    setEditLoading(true);
    try {
      const r = await update(t.id, { nombre: editNombre.trim() });
      if (r?.error) { setError(r.error); return; }
      cancelEdit();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cambio.');
    } finally {
      setEditLoading(false);
    }
  };

  // Desactivar/activar: no borra nada. Un tipo de presentación no queda
  // "pegado" a ninguna compra ya registrada (esa conserva el nombre del
  // tipo en su propio registro) — solo deja de aparecer como opción para
  // compras futuras. Sin bloqueo por compras históricas asociadas, a
  // diferencia de proveedores o categorías de insumo.
  const handleToggleEstado = async (t) => {
    setError('');
    setToggleLoadingId(t.id);
    try {
      const r = await toggleEstado(t.id);
      if (r?.error) setError(r.error);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado del tipo de presentación.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.5)', animation: 'popIn .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Gestionar tipos de presentación</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            "Unitario" es una opción fija del sistema y no aparece aquí — no se puede editar, desactivar ni eliminar.
          </p>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nuevo tipo (ej: Botella, Galón)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={loading} className="btn-add" style={{ padding: '0 16px' }}>
              {loading ? 'Creando...' : '+ Crear'}
            </button>
          </form>

          {tipos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aún no hay tipos de presentación registrados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tipos.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-3)', border: '1px solid var(--border)' }}>
                  {editId === t.id ? (
                    <>
                      <input
                        type="text" autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(t); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, marginRight: 10, padding: '6px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => saveEdit(t)} disabled={editLoading} title="Guardar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(76,175,80,0.15)', color: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button onClick={cancelEdit} title="Cancelar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.estado === 'Activo' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.nombre}</span>
                        <span style={{ padding:'2px 8px',borderRadius:20,fontSize:10.5,fontWeight:700,background:t.estado==='Activo'?'rgba(76,175,80,.15)':'rgba(158,158,158,.18)',color:t.estado==='Activo'?'#4CAF50':'#9E9E9E' }}>
                          {t.estado === 'Activo' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          onClick={() => handleToggleEstado(t)}
                          disabled={toggleLoadingId === t.id}
                          title={t.estado === 'Activo' ? 'Desactivar tipo' : 'Activar tipo'}
                          className={`toggle-btn ${t.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          style={{ opacity: toggleLoadingId === t.id ? 0.5 : 1 }}>
                          <span className="toggle-thumb"/>
                        </button>
                        <button onClick={() => startEdit(t)} title="Editar nombre"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const ComprasPage = () => {
  const navigate = useNavigate();
  // Tarea 1, punto 1b: gating de acciones por permiso real (antes ComprasPage
  // no usaba hasPermiso). El módulo Compras usa 'anular' (no 'eliminar').
  // El backend bloquea de verdad; esto es solo presentación.
  const { hasPermiso } = useAuth();
  const puedeCrear  = hasPermiso('compras', 'crear');
  const puedeAnular = hasPermiso('compras', 'anular');
  const puedeVer    = hasPermiso('compras', 'ver');
  // Filtro por local — consume GET /compras?local_id= vía useCompras.
  // 'todos' = sin filtro. Los locales se cargan de GET /locales (nunca
  // hardcodeados), mismo patrón que el listado de Insumos.
  const [localFiltro, setLocalFiltro]   = useState('todos');
  const [locales, setLocales]           = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);
  const { compras, anular, create, refresh } = useCompras(localFiltro);
  const [query, setQuery]               = useState('');
  const [filtered, setFiltered]         = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTiposModal, setShowTiposModal] = useState(false);
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
    const val = filtrarBusqueda(e.target.value);
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
            puedeAnular={puedeAnular}
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
                  onChange={e => {
                    const v = e.target.value.replace(/^\s+/, '').slice(0, 500);
                    setMotivoAnulacion(v);
                    if (motivoError) setMotivoError('');
                  }}
                  placeholder="Describe el motivo de la anulación..."
                  rows={3} maxLength={500}
                  style={{ width:'100%',boxSizing:'border-box',padding:'8px 12px',borderRadius:8,border:`1px solid ${motivoError?'#E53935':'#ddd'}`,fontSize:13,resize:'vertical' }}
                />
                <div style={{ fontSize:11,color: motivoAnulacion.length >= 500 ? '#E53935' : 'var(--text-muted)',textAlign:'right',marginTop:3 }}>{motivoAnulacion.length} / 500</div>
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
              placeholder="Buscar por proveedor o fecha..." maxLength={70}
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

          <select
            value={localFiltro}
            onChange={e => setLocalFiltro(e.target.value)}
            title="Filtrar compras por local"
            style={{ padding:'9px 14px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-surface)',color:'var(--text-primary)' }}
          >
            <option value="todos">Todos los locales</option>
            {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>

          <div style={{ display:'flex',gap:8,marginLeft:'auto' }}>
            <button
              style={{ padding:'10px 18px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-surface-3)',color:'var(--text-secondary)',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}
              onClick={() => navigate(localFiltro !== 'todos' ? `/compras/historial?local=${localFiltro}` : '/compras/historial')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Historial
            </button>
            {puedeCrear && (
              <button className="btn-add" onClick={() => setShowAddModal(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Registrar compra
              </button>
            )}
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
                  {puedeCrear && (
                    <button className="btn-add-first" onClick={() => setShowAddModal(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Registrar primera compra
                    </button>
                  )}
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
                    <th>Proveedor</th><th>Local</th><th>Fecha</th>
                    <th>Insumos</th><th>Total</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(c => (
                    <tr key={c.id}>
                      <td className="td-nombre">{formatoTitulo(c.proveedorNombre)}</td>
                      <td>{c.localNombre || '—'}</td>
                      <td>{soloFecha(c.fecha)}</td>
                      <td>
                        <div className="items-nombres">
                          {c.items && c.items.length > 0
                            ? (
                              <>
                                {c.items.slice(0, 3).map((it, i) => <span key={i} className="badge-insumo">{formatoTitulo(it.insumo)}</span>)}
                                {c.items.length > 3 && (
                                  <button type="button" onClick={() => setVerTarget(c)}
                                    className="badge-insumo" style={{ background:'#4CAF50', color:'white', border:'none', cursor:'pointer', fontWeight:700 }}>
                                    +{c.items.length - 3}
                                  </button>
                                )}
                              </>
                            )
                            : <span className="badge-items">Sin insumos</span>
                          }
                        </div>
                      </td>
                      <td className="td-total">{formatCOP(c.total)}</td>
                      <td>
                        <span style={{ padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(58,158,66,0.15)',color:'var(--color-green)',border:'1px solid #A5D6A7' }}>
                          Registrada
                        </span>
                      </td>
                      <td>
                        <div className="actions-group">
                          {puedeVer && (
                            <Tooltip label="Ver detalle">
                              <button className="btn-accion btn-accion-ver" onClick={() => setVerTarget(c)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {puedeAnular && (
                            <AnularButton size={14} className="btn-accion btn-accion-eliminar" label="Anular" onClick={() => openAnular(c)}/>
                          )}
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
                <CompraForm onSubmit={handleAddSubmit} onCancel={() => setShowAddModal(false)} onManagePresentaciones={() => setShowTiposModal(true)} />
              </div>
            </div>
          </div>
        )}

        {showTiposModal && (
          <ModalTiposPresentacion onClose={() => setShowTiposModal(false)} />
        )}
      </div>
    </Layout>
  );
};

export default ComprasPage;