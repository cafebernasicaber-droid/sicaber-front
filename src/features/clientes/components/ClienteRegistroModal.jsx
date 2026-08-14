import React, { useState } from 'react';
import clientesService from '../services/clientesService';

// ── Datos de ubicación (mismo catálogo usado en Editar cliente) ───────────────
const DEPARTAMENTOS = {
  'Antioquia':        ['Medellín','Bello','Itagüí','Envigado','Sabaneta','Rionegro','Apartadó','Turbo'],
  'Bogotá D.C.':       ['Bogotá'],
  'Valle del Cauca':   ['Cali','Buenaventura','Palmira','Tuluá','Cartago'],
  'Cundinamarca':      ['Soacha','Facatativá','Zipaquirá','Chía','Fusagasugá'],
  'Atlántico':         ['Barranquilla','Soledad','Malambo'],
  'Bolívar':           ['Cartagena','Magangué','Turbaco'],
  'Santander':         ['Bucaramanga','Floridablanca','Girón','Piedecuesta'],
  'Córdoba':           ['Montería','Lorica','Sahagún'],
  'Nariño':            ['Pasto','Tumaco','Ipiales'],
  'Risaralda':         ['Pereira','Dosquebradas','Santa Rosa de Cabal'],
  'Tolima':            ['Ibagué','Espinal','Melgar'],
  'Huila':             ['Neiva','Pitalito','Garzón'],
  'Cauca':             ['Popayán','Santander de Quilichao'],
};
const COMUNAS_MEDELLIN = ['Comuna 8 - Villa Hermosa', 'Comuna 9 - Buenos Aires'];

const EMPTY = {
  nombre: '', correo: '', telefono: '',
  tipoDoc: 'Cédula de Ciudadanía', tipoDocOtro: '', numeroDoc: '',
  departamento: 'Antioquia', municipio: 'Medellín', comuna: '',
  direccion: '', password: '', confirm: '',
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

  const municipios = DEPARTAMENTOS[form.departamento] || [];

  const handleDepartamento = (dep) => {
    setForm(f => ({ ...f, departamento: dep, municipio: (DEPARTAMENTOS[dep] || [])[0] || '', comuna: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim())  { setError('El nombre es obligatorio.'); return; }
    if (!form.correo.trim())  { setError('El correo es obligatorio.'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener mínimo 6 caracteres.'); return; }
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
                  <input style={inputStyle} type="text" placeholder="Nombre completo" required
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
                <input style={inputStyle} type="email" placeholder="correo@ejemplo.com" required
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
                  <input style={inputStyle} type="text" placeholder="Ej: Pasaporte, Permiso Especial..." required
                    value={form.tipoDocOtro} onChange={e => set('tipoDocOtro', e.target.value)} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Departamento</label>
                  <select style={inputStyle} value={form.departamento}
                    onChange={e => handleDepartamento(e.target.value)}>
                    {Object.keys(DEPARTAMENTOS).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Municipio / Ciudad</label>
                  <select style={inputStyle} value={form.municipio} onChange={e => set('municipio', e.target.value)}>
                    {municipios.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {form.municipio === 'Medellín' && (
                <div>
                  <label style={labelStyle}>
                    Comuna <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(domicilios solo en comunas 8 y 9)</span>
                  </label>
                  <select style={inputStyle} value={form.comuna} onChange={e => set('comuna', e.target.value)}>
                    <option value="">Seleccionar comuna...</option>
                    {COMUNAS_MEDELLIN.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>Dirección</label>
                <input style={inputStyle} type="text" placeholder="Ej: Calle 10 # 43-20"
                  value={form.direccion} onChange={e => set('direccion', e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Contraseña *</label>
                  <input style={inputStyle} type="password" placeholder="Mín. 6 caracteres" required
                    value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Confirmar contraseña *</label>
                  <input style={inputStyle} type="password" placeholder="Repite la contraseña" required
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
