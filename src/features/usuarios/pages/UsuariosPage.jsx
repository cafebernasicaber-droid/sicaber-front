import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import useUsuarios from '../hooks/useUsuarios';
import rolesService from '../../roles/services/rolesService';
import useClientes from '../../clientes/hooks/useClientes';
import useProveedores from '../../proveedores/hooks/useProveedores';
import useEmpleados from '../../empleados/hooks/useEmpleados';
import { EmpleadoModal } from '../../empleados/pages/EmpleadosPage';
// Formularios NATIVOS del módulo de Clientes. Registrar/editar un cliente
// desde esta pantalla abre exactamente el mismo formulario que se usa en
// Clientes — antes había aquí una copia aparte (ModalFormCliente) que pedía
// campos distintos y perdía datos (la comuna, por ejemplo).
import ClienteRegistroModal from '../../clientes/components/ClienteRegistroModal';
import ClienteEditarModal from '../../clientes/components/ClienteEditarModal';
import localesService from '../../../shared/services/localesService';
// Regla ÚNICA de contraseña (espejo del backend) + checklist visible en vivo.
// Antes esta pantalla exigía 6 caracteres y el servidor 10: el formulario
// decía que estaba bien y la API la rechazaba después.
import { errorPassword } from '../../../shared/utils/passwordPolicy';
import PasswordRequisitos from '../../../shared/components/PasswordRequisitos';
import '../../insumos/pages/InsumosPage.css';
import './Usuarios.css';
import './Usuarios.modal.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso)) : '—';
const fmtLong = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso)) : '—';

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1.5px solid var(--border-input)',
  borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--bg-surface)',
  boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-primary)',
};

// ── Tipos de registro disponibles desde el módulo de Usuarios ────────────────
// Antes: 4 tarjetas fijas escritas en el código (Administrador, Cliente,
// Cajero, Bartender) — un rol nuevo creado en Gestión de Roles (ej.
// "Supervisor") nunca aparecía acá aunque sí existiera en la tabla `roles`.
//
// Cliente sigue aparte: no es una fila de la tabla `roles` sino su propio
// flujo de registro (tabla `clientes`, formulario distinto). Administrador,
// Cajero y Bartender mantienen su ícono/color propio y SIEMPRE se ofrecen
// como tarjeta aunque todavía no exista una fila para ellos en `roles` (para
// no perder la opción de registrar un Cajero si nadie lo creó ahí todavía).
// Cualquier otro rol activo que devuelva GET /roles (incluido uno nuevo)
// aparece como tarjeta extra con un ícono/color genérico por defecto.
const TIPO_CLIENTE = { key: 'Cliente', label: 'Cliente', color: '#00ACC1', desc: 'Cuenta para comprar en la tienda en línea' };
const ROLES_FIJOS_INFO = {
  'Administrador': {  color: '#E53935', desc: 'Acceso total al sistema, igual que el admin principal' },
  'Cajero':        {  color: '#FB8C00', desc: 'Acceso al módulo de caja y ventas' },
  'Bartender':     {  color: '#43A047', desc: 'Acceso al módulo de preparación de pedidos' },
};
const ROLES_FIJOS_NOMBRES = Object.keys(ROLES_FIJOS_INFO);

// Roles que en el sistema NO son "un usuario suelto" sino un EMPLEADO con
// su cuenta de acceso: registrarlos crea una fila en `empleados` Y su
// usuario en `usuarios` (ver POST /empleados en el backend, constante
// CARGOS_CON_LOGIN, que contiene exactamente estos dos). Por eso al elegir
// "registrar un Bartender" desde esta pantalla se abre el formulario real de
// Empleados (documento, dirección, local, usuario y contraseña) y no el
// formulario genérico de usuario.
//
// ⚠️ "Administrador" queda FUERA a propósito, aunque el módulo de Empleados
// lo ofrezca como cargo: el backend solo crea cuenta de acceso para Cajero y
// Bartender, así que un Administrador registrado por esa vía quedaría sin
// usuario y NO podría iniciar sesión. Los administradores y cualquier rol
// personalizado siguen usando ModalFormUsuario, que es su formulario propio.
const ROLES_DE_EMPLEADO = ['Cajero', 'Bartender'];
const esRolDeEmpleado = (rol) => ROLES_DE_EMPLEADO.some(r => r.toLowerCase() === String(rol || '').trim().toLowerCase());
// `roles` es opcional: sin la lista real solo se pierde la descripción
// personalizada de un rol nuevo (queda un texto genérico) — el ícono y el
// color siempre funcionan igual, así que cualquier llamado existente que no
// tenía cómo pasar `roles` (ModalVerUsuario, ModalFormUsuario) sigue
// funcionando sin cambios.
const getTipoInfo = (key, roles) => {
  if (key === 'Cliente') return TIPO_CLIENTE;
  const fijo = ROLES_FIJOS_INFO[key];
  if (fijo) return { key, label: key, icon: fijo.icon, color: fijo.color, desc: fijo.desc };
  const rol = Array.isArray(roles) ? roles.find(r => r.nombre === key) : null;
  return { key, label: key, icon: '👤', color: rolesService.getColor(key), desc: rol?.descripcion || 'Rol personalizado creado en Gestión de Roles' };
};
// Lista de tarjetas para "¿Qué deseas registrar?": Cliente + los 3 roles
// fijos + cualquier otro rol activo devuelto por GET /roles.
const construirTiposRegistro = (roles) => {
  const rolesList = Array.isArray(roles) ? roles : [];
  const fijos = ['Administrador', 'Cajero', 'Bartender'];
  const yaListados = new Set(['cliente', ...fijos.map(f => f.toLowerCase())]);
  const extras = rolesList
    .filter(r => r.nombre && !yaListados.has(r.nombre.trim().toLowerCase()))
    .map(r => getTipoInfo(r.nombre, rolesList));
  return [TIPO_CLIENTE, ...fijos.map(f => getTipoInfo(f, rolesList)), ...extras];
};

// (Las listas de departamentos/municipios/comunas ya no viven aquí: eran del
// formulario de cliente propio de esta pantalla, que se retiró en favor de
// los formularios nativos del módulo de Clientes — ellos traen su propio
// catálogo de ubicación, que es el mismo.)

// ── Modal: Seleccionar tipo de registro ───────────────────────────────────────
function ModalSeleccionarTipo({ tipos, onSelect, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usuario-modal-box" style={{ width: '100%', maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="usuario-modal-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>¿Qué deseas registrar?</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Elige el tipo de cuenta que vas a crear</div>
          </div>
          <button className="usuario-modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="usuario-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {tipos.map(t => (
              <button key={t.key} type="button" onClick={() => onSelect(t.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                  padding: '16px', borderRadius: 12, border: `1.5px solid ${t.color}33`,
                  background: t.color + '12', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: t.color }}>{t.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Ver usuario / cliente / proveedor ──────────────────────────────────
function ModalVerUsuario({ item, onClose, onEditar }) {
  const tipoInfo = getTipoInfo(item.tipo) || { color: '#888' };
  const campos = [
    ['Correo',            item.correo    || '—'],
    ['Teléfono',          item.telefono  || '—'],
    ['Dirección',         item.direccion || '—'],
    ['Tipo de cuenta',    item.esAdmin ? 'Administrador' : (item.rolNombre || 'Sin rol')],
    // Solo Cajero/Bartender tienen un local asignado; el Administrador
    // opera 'Ambos' y a Clientes/Proveedores/Empleados no les aplica.
    ...(item.sede && (item.rolNombre === 'Cajero' || item.rolNombre === 'Bartender')
      ? [['Local', item.sede]] : []),
    ['Estado',            item.estado === 'Activo' ? '✅ Activo' : '❌ Inactivo'],
    ['Fecha de registro', fmtLong(item.fecha)],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usuario-modal-box" style={{ width: '100%', maxWidth: 500 }} onClick={e => e.stopPropagation()}>

        <div className="usuario-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: (item.rolColor || tipoInfo.color || '#888') + '20', color: item.rolColor || tipoInfo.color || '#888',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
            }}>
              {item.nombre.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color:'var(--text-primary)' }}>{item.nombre}</span>
                {item.esSuperAdmin ? (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(229,57,53,0.12)', color: '#E53935', padding: '2px 7px', borderRadius: 100 }}>
                    SUPERADMIN
                  </span>
                ) : item.esAdmin && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(25,118,210,0.12)', color: '#1565C0', padding: '2px 7px', borderRadius: 100 }}>
                    ADMIN
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {item.username ? `@${item.username}` : item.correo}
              </div>
            </div>
          </div>
          <button className="usuario-modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="usuario-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {campos.map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '11px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            <button className="btn-confirm-primary" onClick={onEditar}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg> Editar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Crear / Editar usuario interno (Cajero, Bartender, Administrador...) ─
function ModalFormUsuario({ usuario, roles, tipoFijo, isSuperAdmin, onCreate, onUpdate, onClose }) {
  const isEdit = !!usuario;
  // La tabla "usuarios" del backend solo tiene una columna de texto "rol"
  // (no hay relación con la tabla "roles"), así que el valor que se guarda
  // siempre es el nombre del rol, nunca un id.
  const [form, setForm]       = useState({
    nombre:   usuario?.nombre   || '',
    username: usuario?.username || '',
    correo:   usuario?.correo   || '',
    password: '',
    rol:      usuario?.rol || tipoFijo || '',
    // Local físico al que queda asignado el usuario. Solo aplica a
    // Cajero y Bartender: el Administrador siempre opera 'Ambos' locales.
    sede:     usuario?.sede || '',
  });
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Antes: <option value="Local 1">/<option value="Local 2"> fijos en el
  // código — no reflejaban los locales reales (GET /locales).
  const [locales, setLocales] = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Opciones del selector de rol: los 3 roles fijos del sistema + cualquier
  // rol personalizado creado en Gestión de Roles (todos son solo texto).
  const rolesOpciones = Array.from(new Set([...ROLES_FIJOS_NOMBRES, ...roles.map(r => r.nombre)]));

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim())   { setError('El nombre completo es obligatorio.'); return; }
    if (!form.username.trim()) { setError('El nombre de usuario es obligatorio.'); return; }
    if (form.correo && !/\S+@\S+\.\S+/.test(form.correo)) { setError('Ingresa un correo electrónico válido.'); return; }
    if (!isEdit && !form.password) { setError('La contraseña es obligatoria.'); return; }
    // Al editar, la contraseña es opcional: solo se valida si escribieron una
    // nueva (dejarla en blanco significa "no cambiarla").
    if (form.password) {
      const errPw = errorPassword(form.password);
      if (errPw) { setError(errPw); return; }
    }
    if (!isEdit && !confirm) { setError('Debes confirmar la contraseña.'); return; }
    if (!form.rol) { setError('Selecciona un rol.'); return; }
    // El local solo es obligatorio para Cajero y Bartender: son los roles
    // que operan pedidos de un local específico. El Administrador siempre
    // se guarda con sede='Ambos' en el backend, sin importar esto.
    if (form.rol !== 'Administrador' && !form.sede) {
      setError('Selecciona a qué local pertenece este usuario.');
      return;
    }
    if (form.password && form.password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const data = { nombre: form.nombre, username: form.username, correo: form.correo, password: form.password, rol: form.rol, sede: form.sede };
    try {
      const r = isEdit ? await onUpdate(usuario.id, data) : await onCreate(data);
      if (r && r.error) { setError(r.error); setLoading(false); return; }
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el usuario.');
      setLoading(false);
    }
  };

  const pwMatch   = confirm && form.password && confirm === form.password;
  const pwNoMatch = confirm && form.password && confirm !== form.password;
  const tipoInfo = tipoFijo ? getTipoInfo(tipoFijo) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usuario-modal-box" style={{ width: '100%', maxWidth: 560 }} onClick={e => e.stopPropagation()}>

        <div className="usuario-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: (tipoInfo?.color || '#1976D2') + '20', color: tipoInfo?.color || '#1565C0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {tipoInfo?.icon || '👤'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color:'var(--text-primary)' }}>
                {isEdit ? 'Editar usuario' : `Nuevo ${tipoFijo || 'usuario'}`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {isEdit ? (isSuperAdmin ? `Modificando: ${usuario.nombre} (Superadministrador)` : `Modificando: ${usuario.nombre}`) : `Registra un nuevo ${(tipoFijo || 'usuario').toLowerCase()} en el sistema`}
              </div>
            </div>
          </div>
          <button className="usuario-modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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

              {/* Fila 1: Nombre y Username */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Nombre completo *</label>
                  <input style={inputStyle} type="text" placeholder="Nombre completo"
                    value={form.nombre} onChange={e => set('nombre', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Nombre de usuario *</label>
                  <input style={inputStyle} type="text" placeholder="usuario_ejemplo"
                    value={form.username} onChange={e => set('username', e.target.value)} />
                </div>
              </div>

              {/* Fila 2: Correo */}
              <div>
                <label style={labelStyle}>Correo electrónico</label>
                <input style={inputStyle} type="text" placeholder="correo@ejemplo.com"
                  value={form.correo} onChange={e => set('correo', e.target.value)} />
              </div>

              {/* Fila 3: Contraseñas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>
                    {isEdit ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}
                  </label>
                  <input style={inputStyle} type="password"
                    placeholder={isEdit ? 'Nueva contraseña...' : 'Contraseña segura'}
                    value={form.password} onChange={e => set('password', e.target.value)} />
                  <PasswordRequisitos password={form.password} mostrarSiempre={!isEdit} compacto />
                </div>
                <div>
                  <label style={labelStyle}>
                    {isEdit ? 'Confirmar nueva contraseña' : 'Confirmar contraseña *'}
                  </label>
                  <input
                    style={{ ...inputStyle, borderColor: pwNoMatch ? '#E53935' : pwMatch ? '#4CAF50' : '#ddd' }}
                    type="password" placeholder="Repite la contraseña"
                    value={confirm} onChange={e => setConfirm(e.target.value)} />
                  {pwNoMatch && <div style={{ fontSize: 11, color: '#E53935', marginTop: 3 }}>Las contraseñas no coinciden</div>}
                  {pwMatch   && <div style={{ fontSize: 11, color: '#4CAF50', marginTop: 3 }}>✓ Las contraseñas coinciden</div>}
                </div>
              </div>

              {/* Fila 4: Rol */}
              <div style={{ maxWidth: '50%', paddingRight: 6 }}>
                <label style={labelStyle}>Rol *</label>
                {isSuperAdmin ? (
                  <>
                    <span className="rol-chip"
                      style={{ background: 'rgba(229,57,53,0.12)', color: '#E53935', border: '1px solid rgba(229,57,53,0.3)', display: 'inline-flex' }}>
                      <span className="rol-chip__dot" style={{ background: '#E53935' }}/>
                      {form.rol} (Superadmin)
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                      El rol del Superadministrador no se puede modificar.
                    </div>
                  </>
                ) : tipoFijo && !isEdit ? (
                  <span className="rol-chip"
                    style={{ background: (tipoInfo?.color || '#888') + '15', color: tipoInfo?.color || '#888', border: `1px solid ${(tipoInfo?.color || '#888')}33`, display: 'inline-flex' }}>
                    <span className="rol-chip__dot" style={{ background: tipoInfo?.color || '#888' }}/>
                    {tipoFijo}
                  </span>
                ) : (
                  <select style={inputStyle}
                    value={form.rol} onChange={e => set('rol', e.target.value)}>
                    <option value="">Seleccionar rol...</option>
                    {rolesOpciones.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
                  </select>
                )}
              </div>

              {/* Fila 5: Local — aplica a cualquier rol que no sea
                  Administrador (Cajero, Bartender, o cualquier rol de
                  empleado creado en Gestión de Roles). El Administrador
                  siempre queda con sede='Ambos' en el backend, así que no
                  necesita elegir local. Se muestra también al cambiar el
                  rol de alguien hacia uno de estos roles, para poder
                  reasignarlo a un local en el mismo momento. */}
              {form.rol && form.rol !== 'Administrador' && (
                <div style={{ maxWidth: '50%', paddingRight: 6 }}>
                  <label style={labelStyle}>Local *</label>
                  <select style={inputStyle}
                    value={form.sede === 'Ambos' ? '' : form.sede} onChange={e => set('sede', e.target.value)}>
                    <option value="">Seleccionar local...</option>
                    {locales.map(l => <option key={l.id} value={l.nombre}>{l.nombre}</option>)}
                    {/* Conserva un local de una versión anterior que ya no
                        existe en `locales`, para no perder el dato hasta
                        que se reasigne. */}
                    {form.sede && form.sede !== 'Ambos' && !locales.some(l => l.nombre === form.sede) && (
                      <option value={form.sede}>{form.sede} (local antiguo, reasignar)</option>
                    )}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                    Los pedidos de este local son los únicos que este usuario podrá ver y atender.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-confirm-primary" disabled={loading}>
                {loading ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : '✅ Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Modal de cliente: se usan los formularios NATIVOS del módulo de
// Clientes (ClienteRegistroModal / ClienteEditarModal, importados arriba).
// Aquí vivía una copia propia, `ModalFormCliente`, que se eliminó: pedía
// campos distintos a los del registro real de un cliente (sin la opción
// "Otros" en el tipo de documento) y enviaba la comuna a un endpoint que no
// la leía, así que ese dato se perdía en silencio al guardar.

// ── Modal: Crear / Editar proveedor ───────────────────────────────────────────
function ModalFormProveedor({ proveedor, onCreate, onUpdate, onClose }) {
  const isEdit = !!proveedor;
  const [form, setForm] = useState({
    nombre: proveedor?.nombre || '', nit: proveedor?.nit || '', telefono: proveedor?.telefono || '',
    correo: proveedor?.correo || '', direccion: proveedor?.direccion || '', estado: proveedor?.estado || 'Activo',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim())   { setError('El nombre es obligatorio.'); return; }
    if (!form.nit.trim())      { setError('El NIT/RUT es obligatorio.'); return; }
    if (!/^[0-9]{6,10}-[0-9]$/.test(form.nit)) { setError('Formato de NIT inválido. Ejemplo: 900123456-1'); return; }
    if (!form.telefono.trim()) { setError('El teléfono es obligatorio.'); return; }
    if (!form.correo.trim())   { setError('El correo es obligatorio.'); return; }
    if (!/\S+@\S+\.\S+/.test(form.correo)) { setError('Ingresa un correo válido.'); return; }

    setLoading(true);
    try {
      const r = isEdit ? await onUpdate(proveedor.id, form) : await onCreate(form);
      if (r && r.error) { setError(r.error); setLoading(false); return; }
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el proveedor.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usuario-modal-box" style={{ width: '100%', maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="usuario-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(142,36,170,0.15)', color: '#8E24AA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              🚚
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isEdit ? `Modificando: ${proveedor.nombre}` : 'Registra una empresa o persona proveedora'}</div>
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
                  <label style={labelStyle}>Nombre del proveedor *</label>
                  <input style={inputStyle} type="text" placeholder="Ej: Distribuidora Central S.A.S"
                    value={form.nombre} onChange={e => set('nombre', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>NIT / RUT *</label>
                  <input style={inputStyle} type="text" placeholder="Ej: 900123456-1"
                    value={form.nit} onChange={e => set('nit', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Teléfono *</label>
                  <input style={inputStyle} type="text" placeholder="Ej: 3001234567"
                    value={form.telefono} onChange={e => set('telefono', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Correo electrónico *</label>
                  <input style={inputStyle} type="text" placeholder="proveedor@correo.com"
                    value={form.correo} onChange={e => set('correo', e.target.value)} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Dirección</label>
                <input style={inputStyle} type="text" placeholder="Ej: Cra 50 #30-20"
                  value={form.direccion} onChange={e => set('direccion', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-confirm-primary" disabled={loading}>
                {loading ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : '✅ Registrar proveedor'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const UsuariosPage = () => {
  const { hasPermiso } = useAuth();
  // Autorización por permisos, punto 4: esta pantalla combina dos recursos
  // distintos en una sola tabla (usuarios internos + clientes, ver
  // usuarioRows/clienteRows más abajo) — cada fila gobierna su propio
  // permiso según su `tipo`, no siempre 'usuarios'.
  const moduloDe = item => (item.tipo === 'usuario' ? 'usuarios' : 'clientes');
  const { usuarios, create, update, remove, toggleEstado, refresh: refreshUsuarios } = useUsuarios();
  const { clientes, remove: removeCliente, toggleEstado: toggleClienteEstado, refresh: refreshClientes } = useClientes();
  const { proveedores, create: createProveedor, update: updateProveedor, remove: removeProveedor, toggleEstado: toggleProveedorEstado } = useProveedores();
  // ⚠️ Esta línea estaba COMENTADA, pero las tres funciones que devuelve se
  // seguían usando más abajo: handleToggleEstado (tipo 'Empleado'),
  // handleDelete (tipo 'Empleado') y el onSave del EmpleadoModal
  // (refreshEmpleados). Al no existir, cualquiera de esos tres caminos
  // reventaba con "ReferenceError: refreshEmpleados is not defined" — el
  // caso más fácil de reproducir es registrar/editar un empleado desde esta
  // pantalla: se guardaba en el servidor, pero la pantalla se caía justo
  // después, al refrescar.
  //
  // Se restaura solo lo que de verdad se usa: `empleados` (la lista) sigue
  // fuera a propósito, porque las filas de empleados ya no se mezclan en la
  // tabla unificada de esta página (ver empleadoRows, comentado más abajo).
  const { remove: removeEmpleado, toggleActivo: toggleEmpleadoEstado, refresh: refreshEmpleados } = useEmpleados();
  const [query, setQuery]           = useState('');
  const [rolFiltro, setRolFiltro]   = useState('Todos');
  // Filtro por fecha de registro (columna "Registro" ya visible en la
  // tabla) — rango desde/hasta, además de la búsqueda por nombre/usuario/correo.
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage]             = useState(1);
  const PER_PAGE = 8;
  // modal: null | 'tipo' | 'nuevo' | 'editar' | 'ver'
  const [modal, setModal]           = useState(null);
  const [registroTipo, setRegistroTipo] = useState(null); // 'Cliente' | 'Cajero' | 'Bartender' | 'Proveedor'
  const [targetItem, setTargetItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError]   = useState('');
  const [success, setSuccess]           = useState('');
  const [errorMsg, setErrorMsg]         = useState('');
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    rolesService.getAll()
      .then(d => setRoles(Array.isArray(d) ? d : []))
      .catch(() => setRoles([]));
  }, []);
  // Tarjetas de "¿Qué deseas registrar?" — Cliente + roles fijos + cualquier
  // otro rol activo que exista en Gestión de Roles, recalculado cada vez que
  // cambia `roles` (ej. justo después de crear un rol nuevo).
  const tiposRegistro = construirTiposRegistro(roles);

  // ── Construcción del listado combinado ──────────────────────────────────────
  // El backend de "usuarios" solo maneja: id, nombre, username, correo, rol (texto), estado, created_at.
  // No existe rolId ni telefono/direccion para usuarios internos.
  const usuarioRows = usuarios.map(u => {
    const esAdmin = u.rol === 'Administrador';
    // esSuperAdmin viene directo del backend (columna es_superadmin) y es
    // la única marca que bloquea cambios de rol/estado y la eliminación.
    // esAdmin (cosmético, "cualquiera con rol Administrador") ya NO
    // restringe nada: solo el Superadministrador es intocable.
    const esSuperAdmin = !!u.es_superadmin;
    return {
      tipo: 'usuario', id: u.id, key: `usuario-${u.id}`,
      nombre: u.nombre, username: u.username, correo: u.correo, telefono: '', direccion: '',
      estado: u.estado, fecha: u.created_at, esAdmin, esSuperAdmin,
      rolNombre: u.rol || 'Sin rol', rolColor: rolesService.getColor(u.rol),
      filtroKey: esAdmin ? 'Administrador' : (u.rol || 'Sin rol'),
      sede: u.sede,
      raw: u,
    };
  });
  const clienteRows = clientes.map(c => ({
    tipo: 'Cliente', id: c.id, key: `cliente-${c.id}`,
    nombre: c.nombre, username: '', correo: c.correo, telefono: c.telefono, direccion: c.direccion,
    estado: c.estado, fecha: c.created_at, esAdmin: false,
    rolNombre: 'Cliente', rolColor: getTipoInfo('Cliente').color,
    filtroKey: 'Cliente',
    raw: c,
  }));
  /* const proveedorRows = proveedores.map(p => ({
    tipo: 'Proveedor', id: p.id, key: `proveedor-${p.id}`,
    nombre: p.nombre, username: '', correo: p.correo, telefono: p.telefono, direccion: p.direccion,
    estado: p.estado, fecha: p.created_at, esAdmin: false,
    rolNombre: 'Proveedor', rolColor: getTipoInfo('Proveedor').color,
    filtroKey: 'Proveedor',
    raw: p,
  })); */

  /* const empleadoRows = empleados.map(e => ({
    tipo: 'Empleado', id: e.id, key: `empleado-${e.id}`,
    nombre: e.nombre, username: '', correo: e.correo, telefono: e.telefono, direccion: '',
    estado: e.estado, fecha: e.created_at, esAdmin: false,
    rolNombre: e.cargo || 'Empleado', rolColor: getTipoInfo('Empleado').color,
    filtroKey: 'Empleado',
    raw: e,
  })); */

  // Lista unificada: usuarios internos + clientes + proveedores + empleados.
  // Todas estas vistas leen y escriben sobre la misma tabla de cada entidad
  // en el backend, así que activar/desactivar aquí o en la vista propia de
  // cada módulo (Clientes, Proveedores, Empleados) siempre queda reflejado
  // en ambos lados: cada página vuelve a consultar la API al cargar.
  const allRows = [...usuarioRows, ...clienteRows, /* ...proveedorRows, */ /* ...empleadoRows */];

  // ── Filtro por rol (con conteo de cada uno) ─────────────────────────────
  const rolFiltroOptions = (() => {
    const counts = new Map();
    allRows.forEach(r => {
      if (!counts.has(r.filtroKey)) counts.set(r.filtroKey, { key: r.filtroKey, count: 0, color: r.rolColor || '#888' });
      counts.get(r.filtroKey).count += 1;
    });
    const ordenFijo = ['Administrador', 'Cliente', ...ROLES_FIJOS_NOMBRES.filter(n => n !== 'Administrador')].filter(k => counts.has(k));
    const extras = Array.from(counts.keys()).filter(k => !ordenFijo.includes(k));
    return [...ordenFijo, ...extras].map(k => counts.get(k));
  })();

  const rolFilteredRows = rolFiltro === 'Todos' ? allRows : allRows.filter(r => r.filtroKey === rolFiltro);

  // El buscador ahora cubre TODOS los campos de la fila, no solo
  // nombre/usuario/correo: también teléfono, dirección, rol, sede, estado y
  // el id — así se puede encontrar a alguien por cualquier dato registrado.
  const q = query.trim().toLowerCase();
  let shownFiltered = q
    ? rolFilteredRows.filter(u =>
        (u.nombre    || '').toLowerCase().includes(q) ||
        (u.username  || '').toLowerCase().includes(q) ||
        (u.correo    || '').toLowerCase().includes(q) ||
        (u.telefono  || '').toLowerCase().includes(q) ||
        (u.direccion || '').toLowerCase().includes(q) ||
        (u.rolNombre || '').toLowerCase().includes(q) ||
        (u.sede      || '').toLowerCase().includes(q) ||
        (u.estado    || '').toLowerCase().includes(q) ||
        String(u.id).includes(q))
    : rolFilteredRows;
  if (fechaDesde) shownFiltered = shownFiltered.filter(u => u.fecha && String(u.fecha).slice(0,10) >= fechaDesde);
  if (fechaHasta) shownFiltered = shownFiltered.filter(u => u.fecha && String(u.fecha).slice(0,10) <= fechaHasta);

  // El admin siempre queda anclado de primero; el resto ordenado por fecha de registro (más reciente primero)
  const shown = [...shownFiltered].sort((a, b) => {
    if (a.esAdmin !== b.esAdmin) return a.esAdmin ? -1 : 1;
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
    if (fb !== fa) return fb - fa;
    return Number(b.id) - Number(a.id);
  });

  // ── Paginación (máx. 8 por página) ──────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paginated = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const showErr = msg => { setErrorMsg(msg); setTimeout(() => setErrorMsg(''), 5000); };

  const openNuevo   = ()  => { setRegistroTipo(null); setModal('tipo'); };
  const seleccionarTipo = (tipo) => { setRegistroTipo(tipo); setModal('nuevo'); };
  const openEditar  = it  => { setTargetItem(it); setRegistroTipo(it.tipo === 'usuario' ? null : it.tipo); setModal('editar'); };
  const openVer     = it  => { setTargetItem(it); setModal('ver'); };
  const closeModal  = ()  => { setModal(null); setTargetItem(null); setRegistroTipo(null); };

  // ── Crear ────────────────────────────────────────────────────────────────
  const handleCreateUsuario = async data => {
    const r = await create(data);
    if (r?.error) return r;
    showOk(`${registroTipo || 'Usuario'} registrado correctamente.`);
    closeModal();
    return r;
  };

  const handleCreateProveedor = async data => {
    const r = await createProveedor(data);
    if (r?.error) return r;
    showOk('Proveedor registrado correctamente.');
    closeModal();
    return r;
  };

  // ── Actualizar ───────────────────────────────────────────────────────────
  const handleUpdateUsuario = async (id, data) => {
    const r = await update(id, data);
    if (r?.error) return r;
    showOk('Usuario actualizado correctamente.');
    closeModal();
    return r;
  };

  const handleUpdateProveedor = async (id, data) => {
    const r = await updateProveedor(id, data);
    if (r?.error) return r;
    showOk('Proveedor actualizado correctamente.');
    closeModal();
    return r;
  };

  // ── Toggle estado / eliminar ────────────────────────────────────────────
  const handleToggleEstado = async (item) => {
    if (item.esSuperAdmin) return;
    try {
      if (item.tipo === 'usuario')        await toggleEstado(item.id);
      else if (item.tipo === 'Cliente')   await toggleClienteEstado(item.id);
      else if (item.tipo === 'Proveedor') await toggleProveedorEstado(item.id);
      else if (item.tipo === 'Empleado')  await toggleEmpleadoEstado(item.id);
    } catch (err) {
      showErr(err.message || 'No se pudo cambiar el estado. Revisa tu conexión con la API.');
    }
  };

  const handleDelete = async () => {
    try {
      let r;
      if (deleteTarget.tipo === 'usuario')        r = await remove(deleteTarget.id);
      else if (deleteTarget.tipo === 'Cliente')   r = await removeCliente(deleteTarget.id);
      else if (deleteTarget.tipo === 'Proveedor') r = await removeProveedor(deleteTarget.id);
      else if (deleteTarget.tipo === 'Empleado')  r = await removeEmpleado(deleteTarget.id);
      if (r && r.error) { setDeleteError(r.error); return; }
      showOk(`"${deleteTarget.nombre}" eliminado.`);
      setDeleteTarget(null); setDeleteError('');
    } catch (err) {
      setDeleteError(err.message || 'No se pudo anular. Revisa tu conexión con la API.');
    }
  };

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {errorMsg && <div className="toast toast-error">⚠ {errorMsg}</div>}

        {/* ── Modales ── */}
        {modal === 'tipo' && (
          <ModalSeleccionarTipo tipos={tiposRegistro} onSelect={seleccionarTipo} onClose={closeModal} />
        )}

        {modal === 'ver' && targetItem && (
          <ModalVerUsuario
            item={targetItem}
            onClose={closeModal}
            onEditar={() => { setRegistroTipo(targetItem.tipo === 'usuario' ? null : targetItem.tipo); setModal('editar'); }}
          />
        )}

        {/* ── Cliente ──────────────────────────────────────────────────────
            Registrar y editar un cliente abre EXACTAMENTE los mismos
            formularios del módulo de Clientes (ClienteRegistroModal /
            ClienteEditarModal). Antes esta pantalla tenía su propia copia
            (ModalFormCliente) que pedía campos distintos: no permitía elegir
            "Otros" como tipo de documento y enviaba la comuna a un endpoint
            que no la leía, así que ese dato se perdía. */}
        {modal === 'nuevo' && registroTipo === 'Cliente' && (
          <ClienteRegistroModal
            onClose={closeModal}
            onCreated={() => {
              refreshClientes();
              showOk('Cliente registrado correctamente.');
              closeModal();
            }}
          />
        )}

        {modal === 'editar' && registroTipo === 'Cliente' && targetItem?.raw && (
          <ClienteEditarModal
            cliente={targetItem.raw}
            onClose={closeModal}
            onSaved={() => {
              refreshClientes();
              showOk('Cliente actualizado correctamente.');
              closeModal();
            }}
          />
        )}

        {(modal === 'nuevo' || modal === 'editar') && registroTipo === 'Proveedor' && (
          <ModalFormProveedor
            proveedor={modal === 'editar' ? targetItem?.raw : null}
            onCreate={handleCreateProveedor}
            onUpdate={handleUpdateProveedor}
            onClose={closeModal}
          />
        )}

        {/* ── Empleado ─────────────────────────────────────────────────────
            Dos caminos hasta el MISMO formulario del módulo de Empleados:
              • registroTipo === 'Empleado'        → como siempre;
              • registroTipo Cajero/Bartender      → al elegir esa tarjeta en
                "¿Qué deseas registrar?", con el cargo ya fijado.
            Al guardar se refrescan las DOS listas: el backend crea el
            empleado y, además, su cuenta en `usuarios`, así que la fila nueva
            tiene que aparecer también en la tabla de esta pantalla. */}
        {modal === 'nuevo' && (registroTipo === 'Empleado' || esRolDeEmpleado(registroTipo)) && (
          <EmpleadoModal
            cargoFijo={esRolDeEmpleado(registroTipo) ? registroTipo : undefined}
            initial={null}
            onClose={closeModal}
            onSave={() => {
              refreshEmpleados();
              refreshUsuarios();
              showOk(`${registroTipo === 'Empleado' ? 'Empleado' : registroTipo} registrado correctamente.`);
              closeModal();
            }}
          />
        )}

        {modal === 'editar' && registroTipo === 'Empleado' && (
          <EmpleadoModal
            initial={targetItem?.raw || null}
            onClose={closeModal}
            onSave={() => {
              refreshEmpleados();
              refreshUsuarios();
              showOk('Empleado actualizado correctamente.');
              closeModal();
            }}
          />
        )}

        {/* ── Usuario interno ──────────────────────────────────────────────
            Administrador y cualquier rol personalizado creado en Gestión de
            Roles: este ES su formulario propio (no existe otro). También se
            usa para EDITAR cualquier fila de la tabla `usuarios`, incluidos
            los Cajeros/Bartenders — editar ahí cambia la cuenta de acceso,
            que es justo lo que muestra esta pantalla; para cambiar el resto
            de datos del empleado se entra por el módulo de Empleados. */}
        {(modal === 'nuevo' || modal === 'editar')
          && registroTipo !== 'Cliente' && registroTipo !== 'Proveedor' && registroTipo !== 'Empleado'
          && !(modal === 'nuevo' && esRolDeEmpleado(registroTipo)) && (
          <ModalFormUsuario
            usuario={modal === 'editar' ? targetItem?.raw : null}
            roles={roles}
            tipoFijo={modal === 'nuevo' ? registroTipo : null}
            isSuperAdmin={modal === 'editar' ? !!targetItem?.esSuperAdmin : false}
            onCreate={handleCreateUsuario}
            onUpdate={handleUpdateUsuario}
            onClose={closeModal}
          />
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
              </div>
              <h3>¿Anular este registro?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              {deleteError && (
                <div style={{ background: '#FFEBEE', color: '#B71C1C', padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  ⚠ {deleteError}
                </div>
              )}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(''); }}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Usuarios del sistema</h1>
            <p className="page-subtitle">
              {shown.length} cuenta{shown.length !== 1 ? 's' : ''} registrada{shown.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {hasPermiso('usuarios', 'crear') && (
              <button className="btn-add" onClick={openNuevo}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Registrar usuario
              </button>
            )}
          </div>
        </div>

        {/* ── Filtro por rol (con conteo) ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => { setRolFiltro('Todos'); setPage(1); }}
            style={{
              padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13, transition: 'all .2s',
              background: rolFiltro === 'Todos' ? 'var(--text-primary)' : '#f0f0f0',
              color: rolFiltro === 'Todos' ? 'white' : '#555',
            }}
          >
            Todos ({allRows.length})
          </button>
          {rolFiltroOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => { setRolFiltro(opt.key); setPage(1); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
                fontWeight: 700, fontSize: 13, transition: 'all .2s',
                border: `1.5px solid ${opt.color}55`,
                background: rolFiltro === opt.key ? opt.color : (opt.color + '12'),
                color: rolFiltro === opt.key ? 'white' : opt.color,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: rolFiltro === opt.key ? 'white' : opt.color,
              }}/>
              {opt.key} ({opt.count})
            </button>
          ))}
        </div>

        {/* ── Buscador ── */}
        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre, usuario o correo..."
                value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
              {query && <button className="search-clear" onClick={() => { setQuery(''); setPage(1); }}>✕</button>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <label style={{fontSize:12,color:'var(--text-muted)'}}>Registrado entre</label>
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              style={{padding:'8px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)',outline:'none'}}/>
            <span style={{color:'var(--text-muted)',fontSize:13}}>–</span>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              style={{padding:'8px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,background:'var(--bg-input)',color:'var(--text-primary)',outline:'none'}}/>
            {(fechaDesde || fechaHasta) && (
              <button className="search-clear" onClick={() => { setFechaDesde(''); setFechaHasta(''); setPage(1); }}>✕</button>
            )}
          </div>
          {(query || rolFiltro !== 'Todos' || fechaDesde || fechaHasta) && (
            <button className="btn-limpiar-filtros" title="Limpiar filtros"
              onClick={() => { setQuery(''); setRolFiltro('Todos'); setFechaDesde(''); setFechaHasta(''); setPage(1); }}>
              ✕ Limpiar filtros
            </button>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {shown.length} resultado{shown.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Tabla ── */}
        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3>{query || rolFiltro !== 'Todos' || fechaDesde || fechaHasta ? 'Sin resultados' : 'No hay usuarios'}</h3>
              <p>
                {query
                  ? 'Intenta con otro término.'
                  : rolFiltro !== 'Todos'
                    ? `No hay registros con el rol "${rolFiltro}".`
                    : (fechaDesde || fechaHasta)
                      ? 'No hay registros en ese rango de fechas.'
                      : 'Registra el primer usuario del sistema.'}
              </p>
              {!query && rolFiltro === 'Todos' && !fechaDesde && !fechaHasta && (
                <button className="btn-add-first" onClick={openNuevo}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Registrar usuario
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Usuario</th><th>Correo</th><th>Tipo</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(u => (
                    <tr key={u.key}>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell__avatar"
                            style={{ background: (u.rolColor || '#888') + '22', color: u.rolColor || '#888' }}>
                            {u.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="user-cell__name">{u.nombre}</div>
                            <div className="user-cell__user">Creado: {fmt(u.fecha)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td-muted">{u.correo || '—'}</td>
                      <td>
                        <span className="rol-chip"
                          style={{ background: u.rolColor + '15', color: u.rolColor, border: `1px solid ${u.rolColor}33` }}>
                          <span className="rol-chip__dot" style={{ background: u.rolColor }}/>
                          {u.esAdmin ? 'Administrador' : u.rolNombre}
                        </span>
                      </td>
                      <td>
                        {hasPermiso(moduloDe(u), 'editar') ? (
                          <button
                            className={`toggle-btn ${u.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                            onClick={() => !u.esSuperAdmin && handleToggleEstado(u)}
                            style={{ cursor: u.esSuperAdmin ? 'default' : 'pointer' }}
                            title={u.esSuperAdmin ? 'El estado del Superadministrador no se puede modificar' : (u.estado === 'Activo' ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar')}
                          >
                            <span className="toggle-thumb"/>
                          </button>
                        ) : (
                          <span className={`toggle-btn ${u.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`} style={{ cursor: 'default', opacity: 0.6 }} title={u.estado}>
                            <span className="toggle-thumb"/>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="actions-group">
                          {hasPermiso(moduloDe(u), 'ver') && (
                            <Tooltip label="Ver">
                              <button className="btn-ver" onClick={() => openVer(u)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                </svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso(moduloDe(u), 'editar') && (
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => openEditar(u)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            </Tooltip>
                          )}
                          {!u.esSuperAdmin && hasPermiso(moduloDe(u), 'eliminar') && (
                            <AnularButton size={14} onClick={() => { setDeleteError(''); setDeleteTarget(u); }}/>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #f0f0f0', marginTop: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Mostrando {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, shown.length)} de {shown.length}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,.12)', background: page === 1 ? '#f5f5f5' : 'white', color: page === 1 ? '#bbb' : '#333', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>← Ant.</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{ padding: '6px 11px', borderRadius: 8, border: `1.5px solid ${n === page ? '#4CAF50' : '#ddd'}`, background: n === page ? '#4CAF50' : 'white', color: n === page ? 'white' : '#333', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,.12)', background: page === totalPages ? '#f5f5f5' : 'white', color: page === totalPages ? '#bbb' : '#333', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>Sig. →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default UsuariosPage;