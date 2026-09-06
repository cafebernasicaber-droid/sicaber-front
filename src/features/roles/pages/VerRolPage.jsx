import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import rolesService from '../services/rolesService';
import './Roles.css';

const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso)) : '—';

// rol.permisos puede llegar como array o como string JSON según la fila
// venga de una consulta directa o de un JOIN — mismo caso ya manejado en
// RolesPage (ver getPermisos ahí). Sin esto, un rol cuyo permisos venga
// como string mostraría "0 permisos" aunque sí los tenga.
const getPermisos = (rol) => {
  if (!rol?.permisos) return [];
  if (Array.isArray(rol.permisos)) return rol.permisos;
  try { return JSON.parse(rol.permisos); } catch { return []; }
};

const VerRolPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [rol, setRol] = useState(null);
  const [loading, setLoading] = useState(true);
  const modulos = rolesService.getModulosPermisos();

  useEffect(() => {
    let activo = true;
    setLoading(true);
    rolesService.getById(parseInt(id))
      .then(data => { if (activo) setRol(data || null); })
      .catch(() => { if (activo) setRol(null); })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [id]);

  if (loading) return (
    <Layout>
      <div className="mod-root">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver</button>
        <p>Cargando rol…</p>
      </div>
    </Layout>
  );

  if (!rol) return (
    <Layout>
      <div className="mod-root">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver</button>
        <p>Rol no encontrado.</p>
      </div>
    </Layout>
  );

  const colorRol = rol.color || rolesService.getColor(rol.nombre);
  const permisosRol = getPermisos(rol);
  const modulosConAcceso = modulos
    .map(mod => ({ ...mod, asignados: mod.permisos.filter(p => permisosRol.includes(p.id)) }))
    .filter(mod => mod.asignados.length > 0);
  const totalPermisosPosibles = rolesService.getTodosLosPermisos().length;

  return (
    <Layout>
      <div className="mod-root ver-rol-root">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver a roles</button>

        <div className="ver-rol-grid">
          {/* ── Columna izquierda: resumen del rol ── */}
          <div className="ver-card ver-rol-summary">
            <div className="ver-icon ver-icon--lg" style={{background: colorRol+'18', border:`1.5px solid ${colorRol}33`, color: colorRol}}>
              {rolesService.getIcon(rol.nombre)}
            </div>
            <div className="ver-nombre" style={{marginTop:14}}>{rol.nombre}</div>
            {rol.esAdmin && <span className="badge-admin" style={{marginTop:6}}>Admin</span>}
            <div className="ver-desc" style={{marginTop:8}}>{rol.descripcion || 'Sin descripción.'}</div>

            <div className="ver-rol-stats">
              <div className="ver-rol-stat">
                <div className="ver-rol-stat__num" style={{color: colorRol}}>{modulosConAcceso.length}</div>
                <div className="ver-rol-stat__label">Módulo{modulosConAcceso.length!==1?'s':''} con acceso</div>
              </div>
              <div className="ver-rol-stat">
                <div className="ver-rol-stat__num" style={{color: colorRol}}>{permisosRol.length}</div>
                <div className="ver-rol-stat__label">de {totalPermisosPosibles} permisos</div>
              </div>
            </div>

            <div className="ver-rol-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              Creado el {fmtFecha(rol.created_at)}
            </div>
          </div>

          {/* ── Columna derecha: módulos y permisos ── */}
          <div className="ver-card ver-rol-modulos">
            <div className="ver-rol-modulos__title">
              Módulos y permisos
              <span className="ver-rol-modulos__count">{modulosConAcceso.length}</span>
            </div>

            {modulosConAcceso.length === 0 ? (
              <div className="ver-rol-empty">Este rol todavía no tiene permisos asignados.</div>
            ) : (
              <div className="ver-modulo-grid">
                {modulosConAcceso.map(mod => (
                  <div className="ver-modulo-card" key={mod.modulo}>
                    <div className="ver-modulo-name">{mod.modulo}</div>
                    <div className="ver-permisos-list">
                      {mod.asignados.map(p => (
                        <span className="ver-permiso-chip" key={p.id}>✓ {p.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default VerRolPage;