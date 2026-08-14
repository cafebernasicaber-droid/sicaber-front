import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import usuariosService from '../services/usuariosService';
import rolesService from '../../roles/services/rolesService';
import '../../roles/pages/Roles.css';

const VerUsuarioPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [u, setU] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([usuariosService.getById(parseInt(id)), rolesService.getAll()])
      .then(([usuario, listaRoles]) => {
        setU(usuario || null);
        setRoles(Array.isArray(listaRoles) ? listaRoles : []);
      })
      .catch(() => setU(null))
      .finally(() => setLoading(false));
  }, [id]);

  const rol = u ? roles.find(r => r.id === u.rolId) : null;
  const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'long'}).format(new Date(iso)) : '—';

  if (loading) return (
    <Layout><div className="mod-root">
      <p>Cargando...</p>
    </div></Layout>
  );

  if (!u) return (
    <Layout><div className="mod-root">
      <button className="btn-back" onClick={() => navigate('/admin/usuarios')}>← Volver</button>
      <p>Usuario no encontrado.</p>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="mod-root">
        <button className="btn-back" onClick={() => navigate('/admin/usuarios')}>← Volver a usuarios</button>
        <div className="ver-card">
          <div className="ver-header">
            <div className="ver-icon" style={{background:(rol?.color||'#888')+'18', border:`1.5px solid ${rol?.color||'#888'}33`, fontSize:28}}>
              {u.nombre.charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div className="ver-nombre">{u.nombre}</div>
                {u.esAdmin && <span className="badge-admin">Admin</span>}
              </div>
              <div className="ver-desc">@{u.username}</div>
            </div>
            <button className="btn-edit-ver" onClick={() => navigate(`/admin/usuarios/editar/${u.id}`)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              Editar</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
            {[
              ['Correo', u.correo||'—'],
              ['Teléfono', u.telefono||'—'],
              ['Dirección', u.direccion||'—'],
              ['Rol', rol?.nombre||'Sin rol'],
              ['Estado', u.estado === 'Activo' ? '✅ Activo' : '❌ Inactivo'],
              ['Fecha de creación', fmt(u.fechaCreacion)],
            ].map(([label,val],i) => (
              <div key={i} style={{background:'var(--bg-surface-2)',borderRadius:10,padding:'12px 16px',border:'1px solid var(--border)'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>{label}</div>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default VerUsuarioPage;