import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import useRoles from '../hooks/useRoles';
import rolesService from '../services/rolesService';
import './Roles.css';

const RolFormPage = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
 const { roles, create, update } = useRoles();
  const modulos = rolesService.getModulosPermisos();
  const colores = rolesService.COLORES;

  const [form, setForm] = useState({ nombre: '', descripcion: '', color: colores[0], permisos: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Acordeón de permisos: antes los 18 módulos (Dashboard, Usuarios, Roles,
  // Clientes...) se mostraban todos expandidos a la vez, con un scroll
  // larguísimo. Ahora solo un módulo puede estar abierto a la vez —
  // guardamos su nombre acá; colapsar/expandir es puramente visual y no
  // toca form.permisos, así que los permisos ya marcados de un módulo
  // colapsado se conservan.
  const [moduloAbierto, setModuloAbierto] = useState(null);

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
          color:       rol.color || rolesService.getColor(rol.nombre),
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

  const nombreLimpio = form.nombre.trim();

  // Regla: siempre debe tener nombre
  if (!nombreLimpio) {
    setError('El nombre del rol es obligatorio.');
    return;
  }

  // Regla: el nombre solo puede tener letras y números
  const soloLetrasYNumeros = /^[a-zA-Z0-9À-ÿñÑ\s]+$/;
  if (!soloLetrasYNumeros.test(nombreLimpio)) {
    setError('El nombre del rol solo puede contener letras y números.');
    return;
  }

  // Regla: no se puede repetir el nombre de un rol existente
  const nombreDuplicado = roles.some(r =>
    r.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase() &&
    String(r.id) !== String(id) // se excluye a sí mismo cuando estás editando
  );
  if (nombreDuplicado) {
    setError('Ya existe un rol con ese nombre.');
    return;
  }

  // Regla: no se puede crear/dejar un rol sin permisos
  if (form.permisos.length === 0) {
    setError('Debes seleccionar al menos un permiso para el rol.');
    return;
  }

  setLoading(true);
  try {
    if (mode === 'edit') {
      await update(id, { nombre: nombreLimpio, descripcion: form.descripcion, color: form.color, permisos: form.permisos });
      navigate('/admin/roles', { state: { success: `Rol "${nombreLimpio}" actualizado correctamente.` } });
    } else {
      await create({ nombre: nombreLimpio, descripcion: form.descripcion, color: form.color, permisos: form.permisos });
      navigate('/admin/roles', { state: { success: `Rol "${nombreLimpio}" creado correctamente.` } });
    }
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
                    <input type="text" placeholder="Ej: Vendedor"
                      value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Color identificador</label>
                    <div className="colors-grid">
                      {colores.map(c => (
                        <button key={c}
                          type="button"
                          aria-label={`Color ${c}`}
                          aria-pressed={form.color === c}
                          className={`color-dot ${form.color === c ? 'color-dot--selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setForm(f => ({ ...f, color: c }))}
                        >
                          {/* Check visible sobre el color elegido — además del
                              borde/escala de .color-dot--selected, para que la
                              selección sea inconfundible sin importar el tema. */}
                          {form.color === c && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
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
                    const seleccionados = ids.filter(pid => form.permisos.includes(pid)).length;
                    const abierto = moduloAbierto === mod.modulo;
                    return (
                      <div className={`modulo-block ${abierto ? 'modulo-block--abierto' : ''}`} key={mod.modulo}>
                        <div
                          className="modulo-header modulo-header--clickable"
                          onClick={() => setModuloAbierto(m => m === mod.modulo ? null : mod.modulo)}
                        >
                          <span className="modulo-header__left">
                            <svg className="modulo-chevron" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}
                              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                            <span className="modulo-name">{mod.modulo}</span>
                            {seleccionados > 0 && <span className="modulo-count">{seleccionados}/{ids.length}</span>}
                          </span>
                          <button type="button" className="modulo-toggle"
                            onClick={(e) => { e.stopPropagation(); toggleModulo(mod); }}>
                            {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                          </button>
                        </div>
                        {abierto && (
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
                        )}
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