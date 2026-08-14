import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import useRoles from '../hooks/useRoles';
import rolesService from '../services/rolesService';
import './Roles.css';

const RolFormPage = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { create, update } = useRoles();
  const modulos = rolesService.getModulosPermisos();
  const colores = rolesService.COLORES;

  const [form, setForm] = useState({ nombre: '', descripcion: '', color: colores[0], permisos: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && id) {
      rolesService.getById(id).then(rol => {
        if (!rol) { navigate('/admin/roles'); return; }
        const permisos = Array.isArray(rol.permisos)
          ? rol.permisos
          : (() => { try { return JSON.parse(rol.permisos || '[]'); } catch { return []; } })();
        setForm({
          nombre:      rol.nombre,
          descripcion: rol.descripcion || '',
          color:       rolesService.getColor(rol.nombre),
          permisos,
        });
      }).catch(() => navigate('/admin/roles'));
    }
  }, [mode, id, navigate]);

  const togglePermiso = (pid) => {
    setForm(f => ({
      ...f,
      permisos: f.permisos.includes(pid)
        ? f.permisos.filter(p => p !== pid)
        : [...f.permisos, pid],
    }));
  };

  const toggleModulo = (modulo) => {
    const ids = modulo.permisos.map(p => p.id);
    const allOn = ids.every(pid => form.permisos.includes(pid));
    setForm(f => ({
      ...f,
      permisos: allOn
        ? f.permisos.filter(p => !ids.includes(p))
        : [...new Set([...f.permisos, ...ids])],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'edit') {
        await update(id, { nombre: form.nombre, descripcion: form.descripcion, permisos: form.permisos });
      } else {
        await create({ nombre: form.nombre, descripcion: form.descripcion, permisos: form.permisos });
      }
      navigate('/admin/roles');
    } catch (err) {
      setError(err.message || 'Error al guardar');
      setLoading(false);
    }
  };

  const isEdit = mode === 'edit';

  return (
    <Layout>
      <div className="mod-root" style={{ maxWidth: '100%' }}>
        <button className="btn-back" onClick={() => navigate('/admin/roles')}>← Volver a roles</button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 820 }}>

            <div className="mod-header" style={{ marginBottom: 24 }}>
              <div className="mod-header__left">
                <div className="mod-header__icon" style={{ background: 'rgba(229,57,53,0.15)', color: '#EF5350' }}>🛡️</div>
                <div>
                  <h1 className="mod-title">{isEdit ? 'Editar rol' : 'Nuevo rol'}</h1>
                  <p className="mod-sub">{isEdit ? `Modificando: ${form.nombre}` : 'Crea un nuevo rol con permisos personalizados'}</p>
                </div>
              </div>
            </div>

            <div className="form-card" style={{ width: '100%', boxSizing: 'border-box' }}>
              {error && <div className="form-error">⚠ {error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Nombre del rol *</label>
                    <input type="text" placeholder="Ej: Vendedor" required
                      value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Color identificador</label>
                    <div className="colors-grid">
                      {colores.map(c => (
                        <div key={c}
                          className={`color-dot ${form.color === c ? 'color-dot--selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setForm({ ...form, color: c })}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Descripción</label>
                  <textarea placeholder="Descripción del rol y sus responsabilidades..."
                    value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
                </div>

                <div className="permisos-section">
                  <label>Permisos del rol ({form.permisos.length} seleccionados)</label>
                  {modulos.map(mod => {
                    const ids = mod.permisos.map(p => p.id);
                    const allOn = ids.every(pid => form.permisos.includes(pid));
                    return (
                      <div className="modulo-block" key={mod.modulo}>
                        <div className="modulo-header">
                          <span className="modulo-name">{mod.modulo}</span>
                          <button type="button" className="modulo-toggle" onClick={() => toggleModulo(mod)}>
                            {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                          </button>
                        </div>
                        <div className="modulo-permisos">
                          {mod.permisos.map(p => (
                            <label className="permiso-item" key={p.id}>
                              <input type="checkbox"
                                checked={form.permisos.includes(p.id)}
                                onChange={() => togglePermiso(p.id)} />
                              <span>{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => navigate('/admin/roles')}>Cancelar</button>
                  <button type="submit" className="btn-nuevo" disabled={loading}>
                    {loading ? 'Guardando...' : (isEdit ? '💾 Guardar cambios' : '✅ Crear rol')}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export const AgregarRolPage = () => <RolFormPage mode="create" />;
export const EditarRolPage  = () => <RolFormPage mode="edit" />;
export default RolFormPage;