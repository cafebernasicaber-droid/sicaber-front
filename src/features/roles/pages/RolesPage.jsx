import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import useRoles from '../hooks/useRoles';
import useUsuarios from '../../usuarios/hooks/useUsuarios';
import rolesService from '../services/rolesService';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import '../../insumos/pages/InsumosPage.css';
import './Roles.css';

const RolesPage = () => {
  const navigate = useNavigate();
  const { hasPermiso } = useAuth();
  const { roles, remove } = useRoles();
  const { usuarios } = useUsuarios();
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');
  const location = useLocation();

useEffect(() => {
  if (location.state?.success) {
    setSuccess(location.state.success);
    window.history.replaceState({}, document.title); // limpia el state para que no reaparezca al recargar
    setTimeout(() => setSuccess(''), 3000);
  }
}, [location.state]);

  const total = rolesService.getTodosLosPermisos().length;

  // Normaliza permisos: la API puede devolver array o JSON string
  const getPermisos = (rol) => {
    if (!rol.permisos) return [];
    if (Array.isArray(rol.permisos)) return rol.permisos;
    try { return JSON.parse(rol.permisos); } catch { return []; }
  };

  // El color elegido en el formulario de creación/edición se guarda en
  // rol.color; si el backend no lo trae (roles antiguos o los 3 fijos del
  // sistema) se usa el mapeo estático por nombre como respaldo.
  const getColor = (rol) => rol.color || rolesService.getColor(rol.nombre);
  const getIcon  = (rol) => rolesService.getIcon(rol.nombre);

  const shownFiltered = query.trim()
    ? roles.filter(r => r.nombre.toLowerCase().includes(query.toLowerCase()) || (r.descripcion||'').toLowerCase().includes(query.toLowerCase()))
    : roles;
  const shown = [...shownFiltered].sort((a, b) => Number(a.id) - Number(b.id));

  const handleDelete = async () => {
  const usuariosConEsteRol = usuarios.filter(u => u.rol === deleteTarget.nombre);
  if (usuariosConEsteRol.length > 0) {
    setDeleteError(`No se puede eliminar: hay ${usuariosConEsteRol.length} usuario(s) con este rol asignado.`);
    return;
  }
  try {
    await remove(deleteTarget.id);
    setDeleteTarget(null); setDeleteError('');
    setSuccess(`Rol "${deleteTarget.nombre}" eliminado.`);
    setTimeout(() => setSuccess(''), 3000);
  } catch (e) {
    setDeleteError(e.message || 'No se pudo eliminar');
  }
};

  return (
    <Layout>
      <div className="mod-root roles-page-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        <div className="page-header roles-page-header" style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Gestión de Roles</h1>
            <p className="page-subtitle">Administra los roles y permisos del sistema</p>
          </div>
          {hasPermiso('roles', 'crear') && (
            <button className="btn-nuevo-rol" onClick={() => navigate('/admin/roles/nuevo')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nuevo rol
            </button>
          )}
        </div>

        <div className="insumos-toolbar" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'nowrap'}}>
          <div className="search-group" style={{flex:'1 1 auto',minWidth:160}}>
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input className="search-input" placeholder="Buscar rol..." value={query} onChange={e => setQuery(e.target.value)} />
              {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          {query && (
            <button className="btn-limpiar-filtros" title="Limpiar filtros" onClick={() => setQuery('')}>
              ✕ Limpiar filtros
            </button>
          )}
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto',flex:'0 0 auto',whiteSpace:'nowrap'}}>{shown.length} rol{shown.length !== 1 ? 'es' : ''}</span>
        </div>

        {shown.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🛡️</div>
            <h3>{query ? 'Sin coincidencias' : 'No hay roles'}</h3>
            <p>{query ? `Sin roles para "${query}"` : 'No se encontraron roles'}</p>
          </div>
        ) : (
          <div className="roles-grid">
            {shown.map(rol => {
              const permisos = getPermisos(rol);
              const color = getColor(rol);
              const pct = total > 0 ? Math.round((permisos.length / total) * 100) : 0;
              return (
                <div className="rol-card" key={rol.id}>
                  <div className="rol-card__stripe" style={{background: color}}/>
                  <div className="rol-card__head">
                    <div className="rol-card__icon" style={{background: color+'18', border: `1.5px solid ${color}33`}}>
                      <span style={{fontSize:20}}>{getIcon(rol)}</span>
                    </div>
                    <div className="rol-card__info">
                      <div className="rol-card__name">{rol.nombre}</div>
                      <div className="rol-card__date">{rol.created_at ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(rol.created_at)) : '—'}</div>
                    </div>
                  </div>
                  <p className="rol-card__desc">{rol.descripcion || <em style={{color:'#bbb'}}>Sin descripción</em>}</p>
                  <div className="rol-card__perms">
                    <div className="rol-card__perms-header">
                      <span>Permisos</span>
                      <strong style={{color}}>{permisos.length}<span style={{color:'#bbb',fontWeight:400}}>/{total}</span></strong>
                    </div>
                    <div className="perm-bar"><div className="perm-bar__fill" style={{width:`${pct}%`, background: color}}/></div>
                    <div className="perm-pct">{pct}% de cobertura</div>
                  </div>
                  <div className="rol-card__actions">
                    {hasPermiso('roles', 'ver') && (
                      <Tooltip label="Ver detalle">
                        <button className="btn-ver" onClick={() => navigate(`/admin/roles/ver/${rol.id}`)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                      </Tooltip>
                    )}
                    <div style={{marginLeft:'auto', display:'flex', gap:8}}>
                      {hasPermiso('roles', 'editar') && (
                        <Tooltip label="Editar">
                          <button className="btn-icon btn-icon--edit" onClick={() => navigate(`/admin/roles/editar/${rol.id}`)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </Tooltip>
                      )}
                      {hasPermiso('roles', 'eliminar') && (
                        <AnularButton size={14} className="btn-icon btn-icon--del" onClick={() => { setDeleteError(''); setDeleteTarget(rol); }}/>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">✕</div>
              <h3>¿Eliminar este rol?</h3>
              <p>Esta acción es <strong>permanente</strong> y no se puede deshacer.</p>
              <div className="modal-detail" style={{borderLeft:`4px solid #E53935`}}>"{deleteTarget.nombre}"</div>
              {deleteError && <div className="modal-error">⚠ {deleteError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RolesPage;