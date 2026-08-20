import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import rolesService from '../services/rolesService';
import './Roles.css';

const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso)) : '—';

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
      <div className="mod-root mod-root--wide">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver</button>
        <p>Cargando rol…</p>
      </div>
    </Layout>
  );

  if (!rol) return (
    <Layout>
      <div className="mod-root mod-root--wide">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver</button>
        <p>Rol no encontrado.</p>
      </div>
    </Layout>
  );

  const colorRol = rol.color || rolesService.getColor(rol.nombre);

  return (
    <Layout>
      <div className="mod-root mod-root--wide">
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver a roles</button>
        <div className="ver-card">
          <div className="ver-header">
            <div className="ver-icon" style={{background: colorRol+'18', border:`1.5px solid ${colorRol}33`}}>
  {rolesService.getIcon(rol.nombre)}
</div>
            <div style={{flex:1}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div className="ver-nombre">{rol.nombre}</div>
                {rol.esAdmin && <span className="badge-admin">Admin</span>}
              </div>
              <div className="ver-desc">{rol.descripcion || 'Sin descripción.'}</div>
              <div style={{fontSize:12, color:'var(--text-muted)', marginTop:6}}>
                Creado el {fmtFecha(rol.created_at)}
              </div>
            </div>
          {/*   {!rol.esAdmin && (
              <button className="btn-nuevo" onClick={() => navigate(`/admin/roles/editar/${rol.id}`)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                Editar
              </button>
            )} */}
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:13, fontWeight:700, color:'var(--text-secondary)', marginBottom:14}}>
              Permisos asignados ({(rol.permisos || []).length})
            </div>
            {modulos.map(mod => {
              const asignados = mod.permisos.filter(p => (rol.permisos || []).includes(p.id));
              if (asignados.length === 0) return null;
              return (
                <div className="ver-modulo" key={mod.modulo}>
                  <div className="ver-modulo-name">{mod.modulo}</div>
                  <div className="ver-permisos-list">
                    {asignados.map(p => (
                      <span className="ver-permiso-chip" key={p.id}>{p.label}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default VerRolPage;
