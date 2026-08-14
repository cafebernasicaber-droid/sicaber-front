import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import useUsuarios from '../hooks/useUsuarios';
import usuariosService from '../services/usuariosService';
import rolesService from '../../roles/services/rolesService';
import '../pages/Usuarios.css';
import '../../roles/pages/Roles.css';

const UsuarioFormPage = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { create, update } = useUsuarios();
  const roles = rolesService.getAll();
  const isEdit = mode === 'edit';

  const [form, setForm] = useState({ nombre: '', username: '', correo: '', telefono: '', direccion: '', password: '', rolId: '' });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit && id) {
      usuariosService.getById(parseInt(id)).then(u => {
        if (!u) { navigate('/admin/usuarios'); return; }
        setForm({ nombre: u.nombre, username: u.username, correo: u.correo||'', telefono: u.telefono||'', direccion: u.direccion||'', password: '', rolId: u.rolId||'' });
      }).catch(() => navigate('/admin/usuarios'));
    }
  }, [isEdit, id, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    if (form.password && form.password !== confirm) { setError('Las contraseñas no coinciden.'); setLoading(false); return; }
    const data = { ...form, rolId: parseInt(form.rolId) };
    try {
      const r = isEdit ? await update(parseInt(id), data) : await create(data);
      if (r && r.error) { setError(r.error); setLoading(false); return; }
      navigate('/admin/usuarios');
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el usuario.');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mod-root">
        <button className="btn-back" onClick={() => navigate('/admin/usuarios')}>← Volver a usuarios</button>
        <div className="mod-header" style={{marginBottom:24}}>
          <div className="mod-header__left">
            <div className="mod-header__icon" style={{background:'rgba(25,118,210,0.15)',color:'#64B5F6'}}>👤</div>
            <div>
              <h1 className="mod-title">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h1>
              <p className="mod-sub">{isEdit ? `Modificando: ${form.nombre}` : 'Agrega un nuevo usuario al sistema'}</p>
            </div>
          </div>
        </div>

        <div className="form-card">
          {error && <div className="form-error">⚠ {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Nombre completo *</label>
                <input type="text" placeholder="Nombre completo" required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Nombre de usuario *</label>
                <input type="text" placeholder="usuario_ejemplo" required value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Correo electrónico</label>
                <input type="email" placeholder="correo@ejemplo.com" value={form.correo} onChange={e => setForm({...form, correo: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input type="tel" placeholder="300 000 0000" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Dirección</label>
                <input type="text" placeholder="Ej: Calle 10 # 43-20" value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{isEdit ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}</label>
                <input type="password" placeholder={isEdit ? 'Nueva contraseña...' : 'Mín. 6 caracteres'} required={!isEdit}
                  value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              </div>
              <div className="form-group">
                <label>{isEdit ? 'Confirmar nueva contraseña' : 'Confirmar contraseña *'}</label>
                <input type="password" placeholder="Repite la contraseña" required={!isEdit}
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  style={{borderColor: confirm && form.password && confirm !== form.password ? '#E53935' : confirm && form.password && confirm === form.password ? '#4CAF50' : ''}}/>
                {confirm && form.password && confirm !== form.password && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>Las contraseñas no coinciden</div>}
                {confirm && form.password && confirm === form.password && <div style={{fontSize:11,color:'#4CAF50',marginTop:3}}>✓ Las contraseñas coinciden</div>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Rol *</label>
                <select required value={form.rolId} onChange={e => setForm({...form, rolId: e.target.value})}>
                  <option value="">Seleccionar rol...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => navigate('/admin/usuarios')}>Cancelar</button>
              <button type="submit" className="btn-nuevo" disabled={loading}>
                {loading ? 'Guardando...' : (isEdit ? '💾 Guardar cambios' : '✅ Crear usuario')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export const AgregarUsuarioPage = () => <UsuarioFormPage mode="create" />;
export const EditarUsuarioPage  = () => <UsuarioFormPage mode="edit" />;
export default UsuarioFormPage;