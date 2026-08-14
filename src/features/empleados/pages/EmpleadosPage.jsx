import React, { useState, useEffect } from 'react';
import Layout from '../../../shared/components/Layout';
import useEmpleados from '../hooks/useEmpleados';
import empleadosService from '../services/empleadosService';
import localesService from '../../../shared/services/localesService';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import './EmpleadosPage.css';

const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso)) : '—';

const CARGO_COLORS = {
  'Barista': { bg: '#E8F5E9', color: '#2E7D32' },
  'Cajero': { bg: 'rgba(25,118,210,0.12)', color: '#1976D2' },
  'Domiciliario': { bg: '#FFF8E1', color: '#F57F17' },
  'Administrador': { bg: '#FFEBEE', color: '#B71C1C' },
  'Asistente': { bg: '#F3E5F5', color: '#6A1B9A' },
};

export function EmpleadoModal({ initial, onClose, onSave }) {
  const cargos = ['Bartender', 'Cajero', 'Administrador'];
  const [form, setForm] = useState(initial || { nombre: '', cargo: '', telefono: '', correo: '', estado: 'Activo', tipoDoc: 'Cédula de Ciudadanía', numeroDoc: '', direccion: '', username: '', password: '', sede: 'Local 1' });
  const esLoginCargo = ['cajero', 'bartender'].some(c => (form.cargo || '').toLowerCase().includes(c));
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const [saving, setSaving] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (esLoginCargo && !form.sede) { setError('Selecciona a qué local pertenece este empleado.'); return; }
    if (form.password && form.password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      initial
        ? await empleadosService.update(initial.id, form)
        : await empleadosService.create(form);
      onSave();
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el empleado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480, textAlign: 'left', padding: '32px 36px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{initial ? 'Editar empleado' : 'Nuevo empleado'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {initial ? `Modificando: ${initial.nombre}` : 'Agrega un empleado al equipo'}
        </p>
        {error && <div style={{ background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13 }}>⚠ {error}</div>}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="emp-form-row">
            <div className="emp-form-group">
              <label>Nombre completo *</label>
              <input type="text" required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Nombre del empleado" />
            </div>
            <div className="emp-form-group">
              <label>Cargo *</label>
              <select required value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})}>
                <option value="">Seleccionar cargo...</option>
                {cargos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="emp-form-row">
            <div className="emp-form-group">
              <label>Teléfono</label>
              <input type="tel" value={form.telefono||''} onChange={e => setForm({...form, telefono: e.target.value})} placeholder="300 000 0000" />
            </div>
            <div className="emp-form-group">
              <label>Correo</label>
              <input type="email" value={form.correo||''} onChange={e => setForm({...form, correo: e.target.value})} placeholder="correo@ejemplo.com" />
            </div>
          </div>
          <div className="emp-form-row">
            <div className="emp-form-group">
              <label>Tipo de documento</label>
              <select value={form.tipoDoc} onChange={e => setForm({...form, tipoDoc: e.target.value})}>
                <option>Cédula de Ciudadanía</option>
                <option>Tarjeta de Identidad</option>
                <option>Cédula de Extranjería</option>
                <option>Pasaporte</option>
              </select>
            </div>
            <div className="emp-form-group">
              <label>Número de documento *</label>
              <input type="text" required value={form.numeroDoc||''} onChange={e => setForm({...form, numeroDoc: e.target.value})} placeholder="Ej: 1234567890" />
            </div>
          </div>
          <div className="emp-form-row">
            <div className="emp-form-group" style={{gridColumn:'1/-1'}}>
              <label>Dirección de residencia</label>
              <input type="text" value={form.direccion||''} onChange={e => setForm({...form, direccion: e.target.value})} placeholder="Ej: Calle 10 # 43-20" />
            </div>
          </div>
          <div className="emp-form-row">
            <div className="emp-form-group" style={{gridColumn:'1/-1'}}>
              <label>
                Usuario del sistema {esLoginCargo ? '*' : '(opcional)'}
                {esLoginCargo && <span style={{fontSize:11,color:'#1976D2',marginLeft:6}}>requerido para iniciar sesión</span>}
              </label>
              <input
                type="text"
                required={esLoginCargo && !initial}
                value={form.username||''}
                onChange={e => setForm({...form, username: e.target.value})}
                placeholder="Usuario con el que iniciará sesión"
              />
            </div>
          </div>
          {esLoginCargo && (
            <div className="emp-form-row">
              <div className="emp-form-group" style={{gridColumn:'1/-1'}}>
                <label>
                  Local *
                  <span style={{fontSize:11,color:'#1976D2',marginLeft:6}}>a qué local pertenece este {form.cargo.toLowerCase()}</span>
                </label>
                <select required value={form.sede || 'Local 1'} onChange={e => setForm({...form, sede: e.target.value})}>
                  <option value="Local 1">Local 1</option>
                  <option value="Local 2">Local 2</option>
                </select>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  Este {form.cargo.toLowerCase()} solo verá y atenderá los pedidos de ese local.
                </div>
              </div>
            </div>
          )}
          <div className="emp-form-row">
            <div className="emp-form-group">
              <label>{initial ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}</label>
              <input type="password" required={!initial} value={form.password||''} onChange={e => setForm({...form, password: e.target.value})} placeholder="Mín. 6 caracteres" />
            </div>
            <div className="emp-form-group">
              <label>{initial ? 'Confirmar nueva contraseña' : 'Confirmar contraseña *'}</label>
              <input type="password" required={!initial} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña"
                style={{borderColor: confirm && form.password && confirm !== form.password ? '#E53935' : confirm && form.password && confirm === form.password ? '#4CAF50' : ''}}/>
              {confirm && form.password && confirm !== form.password && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>Las contraseñas no coinciden</div>}
              {confirm && form.password && confirm === form.password && <div style={{fontSize:11,color:'#4CAF50',marginTop:3}}>✓ Coinciden</div>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <label className="emp-switch">
              <input type="checkbox" checked={form.estado === 'Activo'} onChange={e => setForm({...form, estado: e.target.checked ? 'Activo' : 'Inactivo'})} />
              <span className="emp-slider"/>
            </label>
            <span style={{ fontSize:13, fontWeight:600, color: form.estado === 'Activo' ? '#2E7D32' : '#888' }}>
              {form.estado === 'Activo' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div className="modal-actions" style={{ justifyContent:'flex-end', marginTop:4 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary" disabled={saving}>
              {saving ? 'Guardando…' : (initial ? '💾 Guardar cambios' : '✅ Crear empleado')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Locales (solo lectura + activar/desactivar) ─────────────────────────
// 4 — por ahora no se pueden crear locales nuevos desde acá, solo
// activar/desactivar los que ya existen (Villa Liliam, 3 Esquinas).
function LocalesTab({ showOk }) {
  const [locales, setLocales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const refresh = () => {
    // GET /locales/todos — a diferencia del selector del checkout (que
    // solo trae activos), acá se necesitan ver también los inactivos para
    // poder reactivarlos.
    localesService.getAll()
      .then(d => { setLocales(Array.isArray(d) ? d : []); setError(''); })
      .catch(err => setError(err.message || 'No se pudo cargar la lista de locales.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  const esActivo = loc => loc.estado === true || loc.estado === 'Activo';
  const handleToggle = async loc => {
    try {
      await localesService.toggleEstado(loc.id);
      refresh();
      showOk(`"${loc.nombre}" ahora está ${esActivo(loc) ? 'inactivo' : 'activo'}`);
    } catch (err) {
      window.alert(err.message || 'No se pudo cambiar el estado del local.');
    }
  };

  return (
    <div className="insumos-card">
      {loading ? (
        <div className="empty-state"><p>Cargando locales...</p></div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>No se pudo cargar</h3>
          <p>{error}</p>
        </div>
      ) : locales.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏠</div>
          <h3>No hay locales registrados</h3>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="insumos-table">
            <thead><tr><th>Nombre</th><th>Dirección</th><th>Estado</th></tr></thead>
            <tbody>
              {locales.map(l => (
                <tr key={l.id}>
                  <td className="td-nombre">{l.nombre}</td>
                  <td style={{ fontSize:13, color:'var(--text-secondary)' }}>{l.direccion || '—'}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button className={`toggle-btn ${esActivo(l) ? 'toggle-on' : 'toggle-off'}`} onClick={() => handleToggle(l)}>
                        <span className="toggle-thumb"/>
                      </button>
                      <span style={{ fontSize:12, fontWeight:600, color: esActivo(l) ? '#2E7D32' : '#888' }}>
                        {esActivo(l) ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function EmpleadosPage() {
  const { empleados, refresh, toggleActivo, remove } = useEmpleados();
  const [modal, setModal]         = useState(null); // null | 'new' | empleado
  const [deleteTarget, setDel]    = useState(null);
  const [query, setQuery]         = useState('');
  const [success, setSuccess]     = useState('');
  // 4 — pestaña "Locales" dentro de este mismo módulo.
  const [tab, setTab]             = useState('empleados'); // 'empleados' | 'locales'

  const shownFiltered = query.trim()
    ? empleados.filter(e => e.nombre.toLowerCase().includes(query.toLowerCase()) || e.cargo.toLowerCase().includes(query.toLowerCase()))
    : empleados;
  const shown = [...shownFiltered].sort((a, b) => Number(b.id) - Number(a.id));

  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleDelete = () => {
    remove(deleteTarget.id);
    showOk(`Empleado "${deleteTarget.nombre}" eliminado`);
    setDel(null);
  };

  return (
    <Layout>
      <div style={{ position:'relative' }}>
        {success && <div className="toast toast-success">✓ {success}</div>}

        {(modal === 'new' || (modal && modal.id)) && (
          <EmpleadoModal
            initial={modal === 'new' ? null : modal}
            onClose={() => setModal(null)}
            onSave={() => { refresh(); setModal(null); showOk(modal === 'new' ? 'Empleado creado correctamente' : 'Empleado actualizado'); }}
          />
        )}

        <div className="page-header">
          <div>
            <h1 className="page-title">Gestión de Empleados</h1>
            <p className="page-subtitle">Administra el equipo de trabajo y los locales del negocio</p>
          </div>
          {tab === 'empleados' && (
            <button className="btn-add" onClick={() => setModal('new')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Agregar empleado
            </button>
          )}
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <button
            onClick={() => setTab('empleados')}
            style={{ padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background: tab==='empleados' ? '#388E3C' : '#f0f0f0', color: tab==='empleados' ? 'white' : '#555' }}>
            Empleados ({empleados.length})
          </button>
          <button
            onClick={() => setTab('locales')}
            style={{ padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background: tab==='locales' ? '#388E3C' : '#f0f0f0', color: tab==='locales' ? 'white' : '#555' }}>
            🏠 Locales
          </button>
        </div>

        {tab === 'locales' ? (
          <LocalesTab showOk={showOk}/>
        ) : (
        <>
        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre o cargo..." value={query} onChange={e => setQuery(e.target.value)} />
              {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          <span style={{ fontSize:13, color:'var(--text-muted)', marginLeft:'auto' }}>{shown.length} empleado{shown.length!==1?'s':''}</span>
        </div>

        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <h3>{query ? 'Sin coincidencias' : 'No hay empleados'}</h3>
              <p>{query ? `Sin resultados para "${query}"` : 'Agrega el primer empleado'}</p>
              {!query && <button className="btn-add" onClick={() => setModal('new')}>Agregar empleado</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr><th>Empleado</th><th>Cargo</th><th>Local</th><th>Teléfono</th><th>Correo</th><th>Ingreso</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {shown.map(e => {
                    const cfg = CARGO_COLORS[e.cargo] || { bg: 'var(--bg-surface-2)', color: 'var(--text-secondary)' };
                    return (
                      <tr key={e.id}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div className="emp-avatar">{e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13, color:'var(--text-primary)' }}>{e.nombre}</div>
                              <div style={{ fontSize:11, color:'var(--text-muted)' }}>ID #{e.id}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className="badge-cat" style={{ background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.color}33` }}>{e.cargo}</span></td>
                        <td>
                          {['Cajero','Bartender'].includes(e.cargo)
                            ? <span className="badge-cat" style={{background:'rgba(25,118,210,0.12)',color:'#1976D2'}}>{e.sede || 'Local 1'}</span>
                            : <span style={{color:'var(--text-muted)'}}>—</span>}
                        </td>
                        <td style={{ fontSize:13, color:'var(--text-secondary)' }}>{e.telefono || '—'}</td>
                        <td style={{ fontSize:13, color:'var(--text-secondary)' }}>{e.correo || '—'}</td>
                        <td style={{ fontSize:12, color:'var(--text-muted)' }}>{fmt(e.fechaIngreso)}</td>
                        <td>
                          <button className={`toggle-btn ${e.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`} onClick={() => toggleActivo(e.id)}>
                            <span className="toggle-thumb"/>
                          </button>
                        </td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Editar">
                              <button className="btn-ver" onClick={() => setModal(e)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </Tooltip>
                            <AnularButton size={14} onClick={() => setDel(e)}/>
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
        </>
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDel(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>¿Detener empleado?</h3>
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