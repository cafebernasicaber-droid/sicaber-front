import React, { useState } from 'react';
import useCiudades from '../hooks/useCiudades';
import { normalizarComparacion } from '../../../shared/utils/textFormat';
import '../../insumos/pages/InsumosPage.css';

// Gestión de Ciudades — mismo patrón visual/interacción que "Gestionar
// categorías" de Insumos (ModalCategoriasInsumo), pero SIN eliminar:
// una ciudad solo se crea, edita o activa/desactiva. Desactivar una
// ciudad no afecta a los proveedores que ya la tenían asignada.
export default function ModalCiudades({ onClose }) {
  const { ciudades, create, update, toggleEstado } = useCiudades();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const existeEquivalente = (valor, ignorarId = null) => {
    const n = normalizarComparacion(valor);
    return ciudades.some(c => String(c.id) !== String(ignorarId) && normalizarComparacion(c.nombre) === n);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre de la ciudad es obligatorio.'); return; }
    if (existeEquivalente(nombre)) { setError(`Ya existe una ciudad equivalente a "${nombre.trim()}".`); return; }
    setLoading(true);
    try {
      const r = await create({ nombre: nombre.trim(), estado: 'Activo' });
      if (r?.error) { setError(r.error); return; }
      setNombre('');
    } catch (err) {
      setError(err.message || 'No se pudo crear la ciudad.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c) => { setError(''); setEditId(c.id); setEditNombre(c.nombre); };
  const cancelEdit = () => { setEditId(null); setEditNombre(''); };
  const saveEdit = async (c) => {
    setError('');
    if (!editNombre.trim()) { setError('El nombre de la ciudad es obligatorio.'); return; }
    if (editNombre.trim() === c.nombre) { cancelEdit(); return; }
    if (existeEquivalente(editNombre, c.id)) { setError(`Ya existe una ciudad equivalente a "${editNombre.trim()}".`); return; }
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

  const esActiva = (c) => c.estado === true || c.estado === 'Activo';
  const handleToggle = async (c) => {
    setError('');
    setToggleLoadingId(c.id);
    try {
      const r = await toggleEstado(c.id);
      if (r?.error) setError(r.error);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la ciudad.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 480,
        maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', overflowX: 'hidden', boxShadow: 'var(--shadow-lg)', animation: 'popIn .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Gestionar ciudades</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>⚠ {error}</div>
          )}

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nueva ciudad (ej: Rionegro)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            <button type="submit" disabled={loading} className="btn-add" style={{ padding: '0 16px' }}>
              {loading ? 'Creando...' : '+ Crear'}
            </button>
          </form>

          {ciudades.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          )}
          {ciudades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aún no hay ciudades registradas.
            </div>
          ) : (() => {
            const ciudadesFiltradas = busqueda.trim()
              ? ciudades.filter(c => normalizarComparacion(c.nombre).includes(normalizarComparacion(busqueda)))
              : ciudades;
            if (ciudadesFiltradas.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ninguna ciudad coincide con "{busqueda}".
                </div>
              );
            }
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ciudadesFiltradas.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-3)', border: '1px solid var(--border)' }}>
                  {editId === c.id ? (
                    <>
                      <input type="text" autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, marginRight: 10, padding: '6px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
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
                        <span style={{ fontSize: 13, fontWeight: 600, color: esActiva(c) ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.nombre}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: esActiva(c) ? 'rgba(76,175,80,.15)' : 'rgba(158,158,158,.18)', color: esActiva(c) ? '#4CAF50' : '#9E9E9E' }}>
                          {esActiva(c) ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => handleToggle(c)} disabled={toggleLoadingId === c.id}
                          title={esActiva(c) ? 'Desactivar ciudad' : 'Activar ciudad'}
                          className={`toggle-btn ${esActiva(c) ? 'toggle-on' : 'toggle-off'}`}
                          style={{ opacity: toggleLoadingId === c.id ? 0.5 : 1 }}>
                          <span className="toggle-thumb" />
                        </button>
                        <button onClick={() => startEdit(c)} title="Editar nombre"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            );
          })()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
