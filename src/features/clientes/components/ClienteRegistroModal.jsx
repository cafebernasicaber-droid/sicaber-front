import React, { useState } from 'react';
import clientesService from '../services/clientesService';
import { errorPassword } from '../../../shared/utils/passwordPolicy';
import PasswordRequisitos from '../../../shared/components/PasswordRequisitos';

// El registro ya NO captura ubicación (departamento, municipio, comuna ni
// dirección) — por eso también desapareció el catálogo de departamentos que
// vivía acá. Una cuenta de cliente sirve para ver el catálogo; la dirección
// se pide, y es obligatoria, recién al registrar un pedido a domicilio.
// El catálogo sigue existiendo en ClienteEditarModal, que no se tocó: quien
// ya tenga una comuna guardada puede seguir corrigiéndola desde ahí.
const EMPTY = {
  nombre: '', correo: '', telefono: '',
  tipoDoc: 'Cédula de Ciudadanía', tipoDocOtro: '', numeroDoc: '',
  password: '', confirm: '',
};

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1.5px solid var(--border-input)',
  borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--bg-surface)',
  boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-primary)',
};

// ── Modal: Registrar cliente (uso administrativo) ─────────────────────────────
// Se puede usar tanto desde el módulo de Usuarios como desde el módulo de Clientes.
const ClienteRegistroModal = ({ onClose, onCreated }) => {
  const [form, setForm]       = useState(EMPTY);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim())  { setError('El nombre es obligatorio.'); return; }
    if (!form.correo.trim())  { setError('El correo es obligatorio.'); return; }
    if (!/\S+@\S+\.\S+/.test(form.correo)) { setError('Ingresa un correo electrónico válido.'); return; }
    if (!form.password)      { setError('La contraseña es obligatoria.'); return; }
    // Regla única compartida con el backend. Antes aquí se pedían 6
    // caracteres y el servidor exige 10: el registro se rechazaba después
    // de que este formulario ya lo había dado por bueno.
    const errPw = errorPassword(form.password);
    if (errPw) { setError(errPw); return; }
    if (!form.confirm)       { setError('Debes confirmar la contraseña.'); return; }
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (form.tipoDoc === 'Otros' && !form.tipoDocOtro.trim()) { setError('Escribe el nombre del tipo de documento.'); return; }

    setLoading(true);
    const { confirm, tipoDocOtro, ...datos } = form;
    datos.tipoDoc = form.tipoDoc === 'Otros' ? form.tipoDocOtro.trim() : form.tipoDoc;
    const r = await clientesService.register(datos);
    setLoading(false);
    if (r.error) { setError(r.error); return; }
    onCreated && onCreated(r.data);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usuario-modal-box" style={{ width: '100%', maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="usuario-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(58,158,66,0.15)', color: 'var(--color-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              👥
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Registrar cliente</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Crea una cuenta de cliente para la tienda en línea</div>
            </div>
          </div>
          <button className="usuario-modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="usuario-modal-body">
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: 'var(--color-red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Nombre completo *</label>
                  <input style={inputStyle} type="text" placeholder="Nombre completo"
                    value={form.nombre} onChange={e => set('nombre', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input style={inputStyle} type="tel" placeholder="300 000 0000"
                    value={form.telefono} onChange={e => set('telefono', e.target.value)} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Correo electrónico *</label>
                <input style={inputStyle} type="text" placeholder="correo@ejemplo.com"
                  value={form.correo} onChange={e => set('correo', e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Tipo de documento</label>
                  <select style={inputStyle} value={form.tipoDoc} onChange={e => { set('tipoDoc', e.target.value); if (e.target.value !== 'Otros') set('tipoDocOtro', ''); }}>
                    <option>Cédula de Ciudadanía</option>
                    <option>Tarjeta de Identidad</option>
                    <option>Cédula de Extranjería</option>
                    <option>Otros</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Número de documento</label>
                  <input style={inputStyle} type="text" placeholder="Ej: 1234567890"
                    value={form.numeroDoc} onChange={e => set('numeroDoc', e.target.value)} />
                </div>
              </div>

              {form.tipoDoc === 'Otros' && (
                <div>
                  <label style={labelStyle}>¿Cuál documento? *</label>
                  <input style={inputStyle} type="text" placeholder="Ej: Pasaporte, Permiso Especial..."
                    value={form.tipoDocOtro} onChange={e => set('tipoDocOtro', e.target.value)} />
                </div>
              )}

              {/* Aviso de cobertura en lugar de los campos de ubicación: el
                  cliente queda registrado y puede ver el catálogo sin
                  importar dónde viva; la dirección se le pide (obligatoria)
                  al momento de registrar un pedido a domicilio. */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(93,187,99,0.10)', border: '1px solid rgba(93,187,99,0.32)', color: 'var(--color-green)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.35 }}>El cliente podrá ver todo el catálogo</strong>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    El servicio a domicilio cubre por ahora solo las <b style={{ color: 'var(--text-primary)' }}>comunas 8 y 9 de Medellín</b>. Si está fuera de esa zona podrá navegar el menú, pero no hacer pedidos a domicilio. La dirección se solicita al registrar el pedido.
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Contraseña *</label>
                  <input style={inputStyle} type="password" placeholder="Contraseña segura"
                    value={form.password} onChange={e => set('password', e.target.value)} />
                  <PasswordRequisitos password={form.password} mostrarSiempre compacto />
                </div>
                <div>
                  <label style={labelStyle}>Confirmar contraseña *</label>
                  <input style={inputStyle} type="password" placeholder="Repite la contraseña"
                    value={form.confirm} onChange={e => set('confirm', e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-confirm-primary" disabled={loading}>
                {loading ? 'Registrando...' : '✅ Registrar cliente'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ClienteRegistroModal;
