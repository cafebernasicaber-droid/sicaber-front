import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import clientesService from '../services/clientesService';
import '../../roles/pages/Roles.css';

// Nota: la edición de clientes ahora se hace mediante un modal
// (ver ClienteEditarModal.jsx, usado desde ClientesPage.jsx). Esta vista
// independiente de "Editar cliente" fue reemplazada por ese modal.

export const VerClientePage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const data = await clientesService.getById(parseInt(id));
        if (activo) setC(data);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [id]);

  const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'long'}).format(new Date(iso)) : '—';

  if (cargando) {
    return (
      <Layout>
        <div className="mod-root">Cargando...</div>
      </Layout>
    );
  }

  if (!c) return (
    <Layout><div className="mod-root">
      <button className="btn-back" onClick={() => navigate('/admin/clientes')}>← Volver</button>
      <p>Cliente no encontrado.</p>
    </div></Layout>
  );

  return (
    <Layout>
      <div className="mod-root">
        <button className="btn-back" onClick={() => navigate('/admin/clientes')}>← Volver a clientes</button>
        <div className="ver-card">
          <div className="ver-header">
            <div className="ver-icon" style={{background:'rgba(58,158,66,0.15)',color:'var(--color-green)',fontSize:28}}>
              {c.nombre.charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div className="ver-nombre">{c.nombre}</div>
              <div className="ver-desc">{c.correo}</div>
            </div>
            <button className="btn-nuevo" onClick={() => navigate('/admin/clientes', { state: { editId: c.id } })}>✏️ Editar</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            {[
              ['Teléfono', c.telefono||'—'],
              ['Tipo de documento', c.tipoDoc||'—'],
              ['Número de documento', c.numeroDoc||'—'],
              ['Departamento', c.departamento||'Antioquia'],
              ['Municipio / Ciudad', c.municipio||'Medellín'],
              ['Dirección', c.direccion||'—'],
              ['Estado', c.estado === 'Activo' ? '✅ Activo' : '❌ Inactivo'],
              ['Fecha de registro', fmt(c.fechaRegistro)],
            ].map(([label,val],i) => (
              <div key={i} style={{background:'var(--bg-surface-2)',borderRadius:10,padding:'12px 16px'}}>
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