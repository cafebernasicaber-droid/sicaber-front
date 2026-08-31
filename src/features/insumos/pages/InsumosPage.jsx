import React, { useState, useRef, useEffect } from 'react';
import useInsumos from '../hooks/useInsumos';
import useCategoriasInsumos from '../hooks/useCategoriasInsumos';
import comprasService from '../../compras/services/comprasService';
import InsumoForm from '../components/InsumoForm';
import { filtrarBusqueda } from '../../../shared/utils/busqueda';
import { normalizarComparacion } from '../../../shared/utils/textFormat';
import './InsumosPage.css';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';

const formatCOP = v =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const formatDate = iso =>
  iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '—';

// ── Modal: Ver insumo ─────────────────────────────────────────────────────────
function ModalVerInsumo({ insumo, onClose, onEditar, onEliminar, onToggle, deshabilitarEliminar }) {
  const stockOk = insumo.stockActual >= insumo.stockMinimo;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:640,
        maxHeight:'88vh', overflowY:'auto', overflowX:'hidden',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44,height:44,borderRadius:12,flexShrink:0,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'var(--text-primary)' }}>{insumo.nombre}</div>
              <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
                <span className="badge-cat">{insumo.categoria}</span>
                <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:insumo.estado==='Activo'?'#E8F5E9':'#F5F5F5',color:insumo.estado==='Activo'?'#2E7D32':'#888',border:`1px solid ${insumo.estado==='Activo'?'#A5D6A7':'#ccc'}` }}>{insumo.estado==='Activo'?'Activo':'Inactivo'}</span>
                {!stockOk && <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(230,115,0,0.15)',color:'#FF8A65',border:'1px solid #FFCC80' }}>⚠ Stock bajo</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Información General</div>
              {[
                ['ID', <span style={{ fontFamily:'monospace',fontSize:12,color:'#81C784',background:'rgba(76,175,80,.12)',padding:'2px 8px',borderRadius:6 }}>{insumo.id}</span>],
                ['Categoría', <span className="badge-cat">{insumo.categoria}</span>],
                ['Unidad medida', insumo.unidadMedida],
                ['Proveedor', insumo.proveedor || '—'],
                ['Estado',
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <button className={`toggle-btn ${insumo.estado==='Activo'?'toggle-on':'toggle-off'}`} onClick={onToggle} style={{ cursor:'pointer' }}><span className="toggle-thumb"/></button>
                    <span style={{ fontSize:13,fontWeight:600,color:insumo.estado==='Activo'?'#81C784':'#888' }}>{insumo.estado==='Activo'?'Activo':'Inactivo'}</span>
                  </div>
                ],
              ].map(([label, val], idx, arr) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Stock & Precio</div>
              {[
                ['Stock actual', <span style={{ fontWeight:800,fontSize:15,color:stockOk?'#81C784':'#EF5350' }}>{insumo.stockActual} {insumo.unidadMedida}</span>],
                ['Stock mínimo', `${insumo.stockMinimo} ${insumo.unidadMedida}`],
                ['Último precio pagado', insumo.precioUnitario ? <span style={{ fontWeight:700,color:'#FFCC80' }}>{formatCOP(insumo.precioUnitario)}</span> : <span style={{ color:'var(--text-secondary)' }}>Sin compras aún</span>],
              ].map(([label, val], idx, arr) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:6 }}>Descripción</div>
            <p style={{ fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,margin:0,wordBreak:'break-word',overflowWrap:'anywhere' }}>{insumo.descripcion || 'Sin descripción registrada.'}</p>
            <div style={{ marginTop:10,fontSize:12,color:'var(--text-secondary)' }}>Registrado: {formatDate(insumo.fechaCreacion)}</div>
          </div>
          {!stockOk && (
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'rgba(230,115,0,0.10)',border:'1px solid rgba(230,115,0,0.28)',borderRadius:10,marginBottom:14,fontSize:13,color:'#E65100' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span><strong>Alerta de stock:</strong> El stock actual está por debajo del mínimo requerido.</span>
            </div>
          )}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            <AnularButton onClick={onEliminar} size={14} className=""
              label={deshabilitarEliminar ? 'Tiene compras registradas — solo puede desactivarse' : 'Eliminar'}
              style={{ padding:10,background: deshabilitarEliminar ? '#9E9E9E' : 'linear-gradient(135deg,#E53935,#B71C1C)',border:'none',borderRadius:10,color:'white',cursor: deshabilitarEliminar ? 'not-allowed' : 'pointer',opacity: deshabilitarEliminar ? 0.6 : 1,display:'flex',alignItems:'center',justifyContent:'center' }}/>
            <Tooltip label="Editar insumo">
              <button className="btn-confirm-primary" onClick={onEditar} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Agregar / Editar insumo ────────────────────────────────────────────
function ModalFormInsumo({ insumo, prefill, onCreate, onUpdate, onClose, onManageCategorias }) {
  const isEdit = !!insumo;
  const [serverError, setServerError] = useState('');

  const handleSubmit = async data => {
    const r = isEdit ? await onUpdate(insumo.id, data) : await onCreate(data);
    if (r?.error) { setServerError(r.error); return; }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background:'var(--bg-surface)',borderRadius:18,width:'100%',maxWidth:680,
        maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)',animation:'popIn .22s ease',
      }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ width:42,height:42,borderRadius:10,flexShrink:0,background:isEdit?'linear-gradient(135deg,#6D4C41,#4E342E)':'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white' }}>
              {isEdit
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              }
            </div>
            <div>
              <div style={{ fontWeight:800,fontSize:15,color:'var(--text-primary)' }}>{isEdit?'Editar insumo':'Agregar insumo'}</div>
              <div style={{ fontSize:12,color:'var(--text-secondary)' }}>{isEdit?`Modificando: ${insumo.nombre}`:'Completa los campos para registrar un nuevo insumo'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding:'20px 24px' }}>
          <InsumoForm
            initialData={insumo || prefill || undefined}
            isEditing={isEdit}
            serverError={serverError}
            onSubmit={handleSubmit}
            onCancel={onClose}
            onManageCategorias={onManageCategorias}
          />
        </div>
      </div>
    </div>
  );
}

// ── Modal: Gestionar categorías de insumos ───────────────────────────────────
function ModalCategoriasInsumo({ onClose }) {
  const { categorias, create, update, remove, toggleEstado, recategorizar } = useCategoriasInsumos();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);

  const existeCategoriaEquivalente = (valor, ignorarId = null) => {
    const normalizado = normalizarComparacion(valor);
    return categorias.some(c =>
      String(c.id) !== String(ignorarId) && normalizarComparacion(c.nombre) === normalizado
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre de la categoría es obligatorio.'); return; }
    if (existeCategoriaEquivalente(nombre)) {
      setError(`Ya existe una categoría equivalente a "${nombre.trim()}".`);
      return;
    }
    setLoading(true);
    try {
      const r = await create({ nombre: nombre.trim(), estado: 'Activo' });
      if (r?.error) { setError(r.error); return; }
      setNombre('');
    } catch (err) {
      setError(err.message || 'No se pudo crear la categoría. Verifica que el backend tenga la ruta /categorias-insumos.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c) => { setError(''); setEditId(c.id); setEditNombre(c.nombre); };
  const cancelEdit = () => { setEditId(null); setEditNombre(''); };

  const saveEdit = async (c) => {
    setError('');
    if (!editNombre.trim()) { setError('El nombre de la categoría es obligatorio.'); return; }
    if (editNombre.trim() === c.nombre) { cancelEdit(); return; }
    if (existeCategoriaEquivalente(editNombre, c.id)) {
      setError(`Ya existe una categoría equivalente a "${editNombre.trim()}".`);
      return;
    }
    setEditLoading(true);
    try {
      const r = await update(c.id, { nombre: editNombre.trim(), estado: c.estado });
      if (r?.error) { setError(r.error); return; }
      cancelEdit();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cambio.');
    } finally {
      setEditLoading(false);
    }
  };

  // Desactivar/activar una categoría: NO borra nada, NO afecta insumos ya
  // creados con ella — solo controla si sigue apareciendo como opción
  // sugerible al crear/editar un insumo nuevo (ver el filtro por
  // estado==='Activo' en InsumoForm.jsx, que ya excluye las desactivadas).
  const handleToggleEstado = async (c) => {
    setError('');
    setToggleLoadingId(c.id);
    try {
      const r = await toggleEstado(c.id);
      if (r?.error) setError(r.error);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la categoría.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  const [recategorizarTarget, setRecategorizarTarget] = useState(null);

  const handleDelete = async () => {
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      if (err.status === 409 && err.insumosAsociados) {
        setRecategorizarTarget({ id: deleteTarget.id, nombre: deleteTarget.nombre, insumos: err.insumos || [], insumosAsociados: err.insumosAsociados });
        setDeleteTarget(null);
        return;
      }
      setError(err.message || 'No se pudo eliminar la categoría.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.5)', animation: 'popIn .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Gestionar categorías de insumos</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nueva categoría (ej: Lácteos)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={loading} className="btn-add" style={{ padding: '0 16px' }}>
              {loading ? 'Creando...' : '+ Crear'}
            </button>
          </form>

          {categorias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aún no hay categorías registradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categorias.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-3)', border: '1px solid var(--border)' }}>
                  {editId === c.id ? (
                    <>
                      <input
                        type="text" autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, marginRight: 10, padding: '6px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => saveEdit(c)} disabled={editLoading} title="Guardar"
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
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.estado === 'Activo' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.nombre}</span>
                        <span style={{ padding:'2px 8px',borderRadius:20,fontSize:10.5,fontWeight:700,background:c.estado==='Activo'?'rgba(76,175,80,.15)':'rgba(158,158,158,.18)',color:c.estado==='Activo'?'#4CAF50':'#9E9E9E' }}>
                          {c.estado === 'Activo' ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          onClick={() => handleToggleEstado(c)}
                          disabled={toggleLoadingId === c.id}
                          title={c.estado === 'Activo' ? 'Desactivar categoría' : 'Activar categoría'}
                          className={`toggle-btn ${c.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          style={{ opacity: toggleLoadingId === c.id ? 0.5 : 1 }}>
                          <span className="toggle-thumb"/>
                        </button>
                        <button onClick={() => startEdit(c)} title="Editar nombre"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <AnularButton size={14} className="" onClick={() => setDeleteTarget(c)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(229,57,53,0.12)', color: '#EF5350', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}/>
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

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </div>
              <h3>¿Eliminar "{deleteTarget.nombre}"?</h3>
              <p>Si tiene insumos asociados, te pediremos recategorizarlos primero. Si solo quieres dejar de usarla para insumos nuevos sin perder el historial, considera <strong>desactivarla</strong> en vez de eliminarla.</p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, eliminar</button>
              </div>
            </div>
          </div>
        )}
        {recategorizarTarget && (
          <ModalRecategorizar
            target={recategorizarTarget}
            categorias={categorias.filter(c => c.id !== recategorizarTarget.id && c.estado === 'Activo')}
            onRecategorizar={recategorizar}
            onClose={() => setRecategorizarTarget(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Modal: Recategorizar insumos antes de eliminar una categoría ───────────
function ModalRecategorizar({ target, categorias, onRecategorizar, onClose }) {
  const [modo, setModo] = useState('existente');
  const [categoriaId, setCategoriaId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirmar = async () => {
    setError('');
    if (modo === 'existente' && !categoriaId) { setError('Selecciona la nueva categoría.'); return; }
    if (modo === 'nueva' && !nuevoNombre.trim()) { setError('Escribe el nombre de la nueva categoría.'); return; }
    setLoading(true);
    try {
      const payload = modo === 'existente'
        ? { nuevaCategoriaId: categoriaId }
        : { nuevaCategoriaNombre: nuevoNombre.trim() };
      const r = await onRecategorizar(target.id, payload);
      if (r?.error) { setError(r.error); return; }
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo recategorizar los insumos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 460,
        boxShadow: '0 24px 64px rgba(0,0,0,.5)', animation: 'popIn .22s ease',
      }}>
        <div style={{ padding: '22px 24px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,124,0,0.15)', color: '#F57C00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>"{target.nombre}" tiene insumos</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{target.insumosAsociados} insumo{target.insumosAsociados !== 1 ? 's' : ''} registrado{target.insumosAsociados !== 1 ? 's' : ''}: {target.insumos.slice(0, 4).join(', ')}{target.insumos.length > 4 ? '…' : ''}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px 24px' }}>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" onClick={() => setModo('existente')}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: modo === 'existente' ? '1.5px solid var(--color-green,#4CAF50)' : '1.5px solid var(--border-input)',
                background: modo === 'existente' ? 'rgba(76,175,80,0.10)' : 'transparent',
                color: modo === 'existente' ? 'var(--color-green,#4CAF50)' : 'var(--text-secondary)' }}>
              Mover a categoría existente
            </button>
            <button type="button" onClick={() => setModo('nueva')}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: modo === 'nueva' ? '1.5px solid var(--color-green,#4CAF50)' : '1.5px solid var(--border-input)',
                background: modo === 'nueva' ? 'rgba(76,175,80,0.10)' : 'transparent',
                color: modo === 'nueva' ? 'var(--color-green,#4CAF50)' : 'var(--text-secondary)' }}>
              Crear categoría nueva
            </button>
          </div>

          {modo === 'existente' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Nueva categoría</label>
              <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                <option value="">-- Seleccionar --</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {categorias.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>No hay otras categorías activas. Crea una nueva en su lugar.</div>
              )}
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Nombre de la nueva categoría</label>
              <input type="text" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Ej: Desechables"
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn-confirm-primary" disabled={loading} onClick={handleConfirmar}>
              {loading ? 'Aplicando...' : 'Recategorizar y eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const InsumosPage = () => {
  const { insumos, create, update, remove, toggleEstado, refresh } = useInsumos();
  const [comprasTodas, setComprasTodas] = useState([]);
  useEffect(() => {
    Promise.all([comprasService.getActivas(), comprasService.getHistorial()])
      .then(([a, h]) => setComprasTodas([...(a || []), ...(h || [])]))
      .catch(() => setComprasTodas([]));
  }, []);
  const insumoTieneCompras = (ins) => comprasTodas.some(c => (c.items || []).some(it =>
    it.insumoId ? String(it.insumoId) === String(ins.id) : it.insumo === ins.nombre
  ));
  const [query, setQuery]           = useState('');
  const [filtered, setFiltered]     = useState(null);
  const [tabFiltro, setTabFiltro]   = useState('todos');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [page, setPage]             = useState(1);
  const PER_PAGE = 7;
  const [modal, setModal]           = useState(null);
  const [targetInsumo, setTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedTarget, setDeleteBlockedTarget] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const searchRef = useRef();

  const base     = filtered !== null ? filtered : insumos;
  const searched = query.trim() !== '';

  const esStockBajo = i => i.estado === 'Activo' && Number(i.stockActual) <= Number(i.stockMinimo);

  const displayedBase = (tabFiltro === 'activos'
    ? base.filter(i => i.estado === 'Activo')
    : tabFiltro === 'inactivos'
      ? base.filter(i => i.estado !== 'Activo')
      : base
  ).filter(i => !soloStockBajo || esStockBajo(i));
  const displayed = [...displayedBase].sort((a, b) => Number(b.id) - Number(a.id));

  const totalPages = Math.ceil(displayed.length / PER_PAGE);
  const paginated  = displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages, page]);

  const totalActivos   = insumos.filter(i => i.estado === 'Activo').length;
  const totalInactivos = insumos.filter(i => i.estado !== 'Activo').length;

  const stockBajoList = insumos.filter(esStockBajo);

  const showOk  = msg => { setSuccessMsg(msg); setErrorMsg('');  setTimeout(() => setSuccessMsg(''), 3500); };
  const showErr = msg => { setErrorMsg(msg);  setSuccessMsg(''); setTimeout(() => setErrorMsg(''), 4500); };
  const closeModal = () => { setModal(null); setTarget(null); };

  const buscarInsumos = (texto) => {
    const term = texto.toLowerCase();
    return insumos.filter(i =>
      (i.nombre || '').toLowerCase().includes(term) ||
      (i.categoria || '').toLowerCase().includes(term)
    );
  };

  const handleSearch = e => {
    const val = filtrarBusqueda(e.target.value);
    setQuery(val);
    if (!val.trim()) setFiltered(null);
    else setFiltered(buscarInsumos(val));
    setPage(1);
  };
  const clearSearch = () => { setQuery(''); setFiltered(null); setPage(1); searchRef.current?.focus(); };

  const handleCreate = async data => {
    const r = await create(data);
    if (r?.error) return r;
    showOk('Insumo registrado correctamente.');
    closeModal();
    return r;
  };

  const handleUpdate = async (id, data) => {
    const r = await update(id, data);
    if (r?.error) return r;
    showOk('Insumo actualizado correctamente.');
    closeModal();
    if (query.trim()) setFiltered(buscarInsumos(query));
    return r;
  };

  const handleDelete = async () => {
    const result = await remove(deleteTarget.id);
    if (result?.error) {
      showErr(result.error);
      setDeleteTarget(null);
      return;
    }
    if (query.trim()) setFiltered(buscarInsumos(query));
    else setFiltered(null);
    showOk(`Insumo "${deleteTarget.nombre}" anulado correctamente.`);
    setDeleteTarget(null);
    if (modal === 'ver') closeModal();
  };

  const handleEliminarClick = (ins) => {
    if (insumoTieneCompras(ins)) {
      setDeleteBlockedTarget(ins);
      return;
    }
    setDeleteTarget(ins);
  };

  const handleToggle = async id => {
    await toggleEstado(id);
    if (query.trim()) setFiltered(buscarInsumos(query));
    if (modal === 'ver' && targetInsumo?.id === id) {
      setTarget(prev => ({ ...prev, estado: prev.estado === 'Activo' ? 'Inactivo' : 'Activo' }));
    }
  };

  const tabStyle = (key) => ({
    padding: '7px 18px',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    background: tabFiltro === key ? '#388E3C' : '#f0f0f0',
    color: tabFiltro === key ? 'white' : '#555',
    transition: 'all .2s',
  });

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

        {modal === 'ver' && targetInsumo && (
          <ModalVerInsumo
            insumo={targetInsumo}
            onClose={closeModal}
            onEditar={() => setModal('editar')}
            onEliminar={() => handleEliminarClick(targetInsumo)}
            onToggle={() => handleToggle(targetInsumo.id)}
            deshabilitarEliminar={insumoTieneCompras(targetInsumo)}
          />
        )}
        {(modal === 'nuevo' || modal === 'editar') && (
          <ModalFormInsumo
            insumo={modal === 'editar' ? targetInsumo : null}
            prefill={null}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onClose={closeModal}
            onManageCategorias={() => setModal('categorias')}
          />
        )}
        {modal === 'categorias' && (
          <ModalCategoriasInsumo onClose={() => setModal(targetInsumo ? 'editar' : null)} />
        )}
        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3>¿Detener insumo?</h3>
              <p>Esta acción es <strong>permanente</strong> y no se puede deshacer.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}

        {deleteBlockedTarget && (
          <div className="modal-overlay" onClick={() => setDeleteBlockedTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3>¿Eliminar insumo?</h3>
              <p style={{ color:'#B71C1C',fontWeight:600,display:'flex',alignItems:'flex-start',gap:8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink:0,marginTop:2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>No se puede eliminar "{deleteBlockedTarget.nombre}": tiene compras registradas, desactívalo en su lugar.</span>
              </p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteBlockedTarget(null)}>Entendido</button>
              </div>
            </div>
          </div>
        )}

        <div className="page-header">
          <h1 className="page-title">Gestión de Insumos</h1>
          <p className="page-subtitle">Administra los insumos del sistema</p>
        </div>

        {stockBajoList.length > 0 && (
          <div style={{
            marginBottom: 18, borderRadius: 12, padding: '14px 18px',
            background: 'rgba(230,115,0,0.12)', border: '1.5px solid rgba(230,115,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 14, fontWeight: 800, color: '#E65100' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{stockBajoList.length} insumo{stockBajoList.length !== 1 ? 's' : ''} con stock bajo — revisa antes de que se agoten</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stockBajoList.map(i => (
                <div key={i.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 14px', borderRadius: 10,
                  background: 'var(--bg-surface)', border: '1px solid rgba(230,115,0,0.35)', fontSize: 12, color: '#E65100',
                }}>
                  <span style={{ fontWeight: 700 }}>{i.nombre}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Quedan: <strong style={{ color:'#E65100' }}>{i.stockActual} {i.unidadMedida || ''}</strong> (mínimo: {i.stockMinimo})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center' }}>
          <button style={tabStyle('todos')} onClick={() => { setTabFiltro('todos'); setPage(1); }}>
            Todos ({insumos.length})
          </button>
          <button style={tabStyle('activos')} onClick={() => { setTabFiltro('activos'); setPage(1); }}>
            Activos ({totalActivos})
          </button>
          <button style={tabStyle('inactivos')} onClick={() => { setTabFiltro('inactivos'); setPage(1); }}>
            Inactivos ({totalInactivos})
          </button>
          <button
            onClick={() => { setSoloStockBajo(v => !v); setPage(1); }}
            title={soloStockBajo ? 'Quitar filtro de stock bajo' : 'Mostrar solo insumos con stock bajo'}
            style={{
              padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
              display:'flex', alignItems:'center', gap:6, marginLeft:'auto', transition:'all .2s',
              background: soloStockBajo ? '#E65100' : '#f0f0f0',
              color: soloStockBajo ? 'white' : '#555',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {soloStockBajo ? 'Viendo solo stock bajo' : 'Ver solo stock bajo'} ({stockBajoList.length})
          </button>
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
              placeholder="Buscar por nombre o categoría..." maxLength={70}
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
          <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
            <button className="btn-add" style={{ margin: 0 }} onClick={() => setModal('categorias')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v4H4z"/><path d="M4 10h10v4H4z"/><path d="M4 16h6v4H4z"/></svg>
              Gestionar categorías
            </button>
            <button className="btn-add" style={{ margin: 0 }} onClick={() => { setTarget(null); setModal('nuevo'); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Agregar insumo
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
                  <p>No hay insumos que coincidan con "<strong>{query}</strong>"</p>
                  <button className="btn-outline-green" onClick={clearSearch}>Ver todos los insumos</button>
                </>
              ) : soloStockBajo ? (
                <>
                  <div className="empty-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <h3>Ningún insumo{tabFiltro !== 'todos' ? ` ${tabFiltro}` : ''} está en stock bajo</h3>
                  <p>Todo el stock está por encima de su mínimo.</p>
                  <button className="btn-outline-green" onClick={() => setSoloStockBajo(false)}>Ver todos los insumos</button>
                </>
              ) : (
                <>
                  <div className="empty-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                  <h3>No hay insumos{tabFiltro !== 'todos' ? ` ${tabFiltro}` : ''} registrados</h3>
                  <p>
                    {tabFiltro !== 'todos'
                      ? `Cambia el filtro para ver otros insumos`
                      : 'Comienza agregando el primer insumo al sistema'}
                  </p>
                  {tabFiltro === 'todos' && (
                    <button className="btn-add-first" onClick={() => { setTarget(null); setModal('nuevo'); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Agregar primer insumo
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
                    <th>Nombre</th><th>Categoría</th>
                    <th>Unidad/Medida</th><th>Stock</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(ins => {
                    const stockReal = Math.max(0, ins.stockActual);
                    const sinStock  = stockReal === 0;
                    const stockBajo = esStockBajo(ins);
                    return (
                      <tr key={ins.id}>
                        <td className="td-nombre">
                          {ins.nombre}
                        </td>
                        <td><span className="badge-cat">{ins.categoria}</span></td>
                        <td>{ins.unidadMedida}</td>
                        <td className="td-stock">
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span>{stockReal} {ins.unidadMedida}</span>
                            {sinStock ? (
                              <span style={{ display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(229,57,53,0.12)',color:'#EF5350',border:'1px solid #EF9A9A' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Sin stock
                              </span>
                            ) : stockBajo && (
                              <span style={{ display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(230,115,0,0.15)',color:'#E65100',border:'1px solid #FFCC80' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                Stock bajo
                              </span>
                            )}
                          </div>
                        </td>
                        <td >
                          <button className={`toggle-btn ${ins.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                            onClick={() => handleToggle(ins.id)}>
                            <span className="toggle-thumb"/>
                          </button>
                        </td>
                        <td >
                          <div className="actions-group">
                            <Tooltip label="Ver detalle">
                              <button className="btn-accion btn-accion-ver"
                                onClick={() => { setTarget(ins); setModal('ver'); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                            <Tooltip label="Editar">
                              <button className="btn-accion btn-accion-editar"
                                onClick={() => { setTarget(ins); setModal('editar'); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </Tooltip>
                            <AnularButton onClick={() => handleEliminarClick(ins)} size={14}
                              className="btn-accion btn-accion-eliminar"
                              label={insumoTieneCompras(ins) ? 'Tiene compras registradas — solo puede desactivarse' : 'Eliminar'}
                              style={insumoTieneCompras(ins) ? { opacity:0.45, cursor:'not-allowed' } : undefined}/>
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
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderTop:'1px solid #f0f0f0', marginTop:4 }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, displayed.length)} de {displayed.length}</span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:page===1?'#f5f5f5':'white', color:page===1?'#bbb':'#333', cursor:page===1?'not-allowed':'pointer', fontSize:13, fontWeight:600 }}>← Ant.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{ padding:'6px 11px', borderRadius:8, border:`1.5px solid ${n===page?'#4CAF50':'#ddd'}`, background:n===page?'#4CAF50':'white', color:n===page?'white':'#333', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:page===totalPages?'#f5f5f5':'white', color:page===totalPages?'#bbb':'#333', cursor:page===totalPages?'not-allowed':'pointer', fontSize:13, fontWeight:600 }}>Sig. →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default InsumosPage;