import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import useClientes from '../hooks/useClientes';
import ClienteRegistroModal from '../components/ClienteRegistroModal';
import ClienteEditarModal from '../components/ClienteEditarModal';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import '../../insumos/pages/InsumosPage.css';

const ClientesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clientes, remove, toggleEstado, refresh } = useClientes();
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalCliente, setModalCliente] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Si llegamos aquí desde "Ver cliente → Editar", abrimos el modal
  // automáticamente para ese cliente (la edición ya no es una ruta aparte).
  useEffect(() => {
    const editId = location.state?.editId;
    if (editId && clientes.length > 0) {
      const c = clientes.find(cl => cl.id === editId);
      if (c) setEditTarget(c);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, clientes, navigate, location.pathname]);

  const shown = query.trim()
    ? clientes.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()) || (c.correo||'').toLowerCase().includes(query.toLowerCase()) || (c.telefono||'').includes(query))
    : clientes;

  const handleDelete = () => {
    const r = remove(deleteTarget.id);
    if (r.error) { setDeleteError(r.error); return; }
    setSuccess(`Cliente "${deleteTarget.nombre}" eliminado.`);
    setDeleteTarget(null); setDeleteError('');
    setTimeout(() => setSuccess(''), 3000);
  };

  const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        {modalCliente && (
          <ClienteRegistroModal
            onClose={() => setModalCliente(false)}
            onCreated={() => { setModalCliente(false); refresh(); setSuccess('Cliente registrado correctamente.'); setTimeout(() => setSuccess(''), 3000); }}
          />
        )}

        {editTarget && (
          <ClienteEditarModal
            cliente={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={() => { setEditTarget(null); refresh(); setSuccess('Cliente actualizado correctamente.'); setTimeout(() => setSuccess(''), 3000); }}
          />
        )}

        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Clientes</h1>
            <p className="page-subtitle">{clientes.length} cliente{clientes.length!==1?'s':''} registrado{clientes.length!==1?'s':''}</p>
          </div>
          <button className="btn-add" onClick={() => setModalCliente(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo cliente
          </button>
        </div>

        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre, correo o teléfono..." value={query} onChange={e => setQuery(e.target.value)} />
              {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{shown.length} cliente{shown.length!==1?'s':''}</span>
        </div>

        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3>{query ? 'Sin resultados' : 'Aún no hay clientes'}</h3>
              <p>{query ? 'Intenta otro término.' : 'Los clientes aparecen aquí cuando se registran en la landing page, o puedes registrarlos tú mismo con el botón "Nuevo cliente".'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Teléfono</th><th>Dirección</th><th>Estado</th><th>Registro</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(58,158,66,0.15)',color:'var(--color-green)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,flexShrink:0}}>
                            {c.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="td-nombre">{c.nombre}</div>
                            <div style={{fontSize:12,color:'var(--text-muted)'}}>{c.correo}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{color:'var(--text-muted)',fontSize:13}}>{c.telefono||'—'}</td>
                      <td style={{color:'var(--text-muted)',fontSize:13,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.direccion||'—'}</td>
                      <td>
                        <button
                          className={`toggle-btn ${c.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          onClick={() => toggleEstado(c.id)}
                          title={c.estado === 'Activo' ? 'Activo' : 'Inactivo'}
                        >
                          <span className="toggle-thumb"/>
                        </button>
                      </td>
                      <td style={{color:'var(--text-muted)',fontSize:13}}>{fmt(c.fechaRegistro)}</td>
                      <td>
                        <div className="actions-group">
                          <Tooltip label="Ver">
                            <button className="btn-ver" onClick={() => navigate(`/admin/clientes/ver/${c.id}`)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          </Tooltip>
                          <Tooltip label="Editar">
                            <button className="btn-editar" onClick={() => setEditTarget(c)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </Tooltip>
                          <AnularButton onClick={() => { setDeleteError(''); setDeleteTarget(c); }}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>¿Anular este cliente?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              {deleteError && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'8px 12px',borderRadius:8,marginBottom:16,fontSize:13}}>⚠ {deleteError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ClientesPage;