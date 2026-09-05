import React, { useState, useEffect, useRef } from 'react';
import proveedoresService from '../services/proveedoresService';
import ciudadesService from '../services/ciudadesService';
import { normalizarComparacion } from '../../../shared/utils/textFormat';
import './ProveedorForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_FORM = {
  tipoPersona: 'Natural', // 'Natural' | 'Juridica' — decidido por el toggle, no es un campo seleccionable dentro del formulario
  nombre: '',        // Persona Jurídica: Razón social. Persona Natural: se recalcula como "Nombre completo".
  nombreCompleto: '', // solo Persona Natural — reemplaza a los antiguos "nombres" + "apellidos" separados
  personaContacto: '', // solo Persona Jurídica — nombre de la persona con la que se trata dentro de la empresa
  tipoDocumento: 'CC', // solo Persona Natural: CC | CE (TI, Pasaporte y NIT ya no son opciones para Persona Natural)
  numeroDocumento: '', // solo Persona Natural
  nit: '',        // solo Persona Jurídica
  telefono: '',
  correo: '',
  direccion: '',
  // Antes fija en "Medellín" (el cliente solo manejaba proveedores de ahí
  // en ese momento) — ahora es un catálogo dinámico (ver ciudadesService),
  // con las 16 principales ya sembradas y la posibilidad de agregar más
  // desde el propio formulario ("+ Añadir ciudad"). Medellín se mantiene
  // como valor por defecto al crear (sigue siendo el caso más común), pero
  // ya es un campo editable de verdad, no un texto fijo.
  ciudad: 'Medellín',
  observaciones: '',
  estado: 'Activo'
};

// Persona Natural ya no admite TI, Pasaporte ni NIT como tipo de
// documento — solo Cédula de Ciudadanía y Cédula de Extranjería.
const TIPOS_DOCUMENTO = ['CC', 'CE'];

// ── Topes de longitud propios de este formulario, sin equivalente todavía
// en shared/utils/limitesTexto.js (que solo trae NOMBRE/DESCRIPCION/etc.).
// Mismo criterio: son topes razonables por tipo de campo, pero — igual que
// advierte ese archivo — todavía QUEDAN PENDIENTES de reflejarse en el
// backend (validaciones.js) para que la restricción sea real, no solo de
// interfaz.
const TELEFONO_LEN = 10;
// "Nombre completo" (Persona Natural) y "Persona de contacto" (Persona
// Jurídica) comparten las mismas reglas.
const NOMBRE_COMPLETO_MIN = 3;
const NOMBRE_COMPLETO_MAX = 60;
// Razón Social tiene sus propias reglas, más permisivas en símbolos pero
// con el mismo tope de 60 que ya tenía.
const RAZON_SOCIAL_MIN = 3;
const RAZON_SOCIAL_MAX = 60;
const OBSERVACIONES_PROVEEDOR_MAX = 200;
const CORREO_MAX = 150;
const DIRECCION_MAX = 200;

// Solo letras (con tildes/ñ) y espacios — usado por "Nombre completo" y
// "Persona de contacto": un nombre de persona no lleva números ni símbolos.
const soloLetrasYEspacios = (v) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
// Letras, números, espacios, puntos, guiones y "&" — la puntuación real
// de una razón social (S.A.S., 3M Colombia, Coca-Cola, Pérez & Hijos
// Ltda.). Deliberadamente NO incluye coma ni apóstrofe: la especificación
// solo autoriza letras/tildes/ñ/espacios/números/puntos/guiones/"&".
const filtrarRazonSocial = (v) => v.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.&-]/g, '');
// Colapsa 2+ espacios seguidos a uno solo, mientras se escribe — evita
// "Juan   Pérez" con espacios de más en medio del nombre.
const colapsarEspacios = (v) => v.replace(/\s{2,}/g, ' ');
// Sin espacio como PRIMER caracter (evita "   Juan" escrito a mano). No
// afecta un espacio que venga en medio del texto ni el de un pegado.
const sinEspacioAlInicio = (v) => v.replace(/^\s+/, '');

// Validación de "Nombre completo" (Persona Natural) / "Persona de
// contacto" (Persona Jurídica) — mismas reglas para ambos: 3 a 60
// caracteres, sin espacios de sobra, no puede ser solo espacios en
// blanco. El filtro de escritura ya se encarga de bloquear números y
// símbolos, así que acá solo queda validar longitud/contenido real.
const validarNombreCompleto = (valor) => {
  const limpio = valor.trim();
  if (!limpio) return 'Este campo no puede quedar vacío ni contener solo espacios.';
  if (limpio.length < NOMBRE_COMPLETO_MIN) return `Debe tener al menos ${NOMBRE_COMPLETO_MIN} caracteres.`;
  if (limpio.length > NOMBRE_COMPLETO_MAX) return `No puede superar los ${NOMBRE_COMPLETO_MAX} caracteres.`;
  return '';
};

// Validación de "Razón Social" — reglas propias, distintas a Nombre
// completo (sí admite números y la puntuación normal de una razón social).
const validarRazonSocial = (valor) => {
  const limpio = valor.trim();
  if (!limpio) return 'La razón social es obligatoria.';
  if (limpio.length < RAZON_SOCIAL_MIN) return `Debe tener al menos ${RAZON_SOCIAL_MIN} caracteres.`;
  if (limpio.length > RAZON_SOCIAL_MAX) return `No puede superar los ${RAZON_SOCIAL_MAX} caracteres.`;
  return '';
};

// Dígito de verificación del NIT (algoritmo DIAN, módulo 11).
const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
const calcularDigitoVerificacionNIT = (numero) => {
  const digitos = String(numero).split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (PESOS_NIT[i] || 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
};

// NIT de Persona Jurídica — misma regla de formato de siempre (6-10
// dígitos + DV), con mensaje que indica cuál es el dígito correcto.
const validarNitJuridica = (valor) => {
  if (!/^[0-9]{6,10}-[0-9]$/.test(valor)) return 'Formato inválido. Ejemplo: 900123456-1';
  const [numero, digito] = valor.split('-');
  const dvEsperado = calcularDigitoVerificacionNIT(numero);
  if (dvEsperado !== Number(digito)) return `El dígito de verificación no es correcto (debería ser ${dvEsperado}).`;
  return '';
};

// Validación del número de documento según el tipo elegido (Persona
// Natural). Ahora solo existen CC y CE — ambas 6 a 11/12 según el tipo.
const validarNumeroDocumento = (tipo, valor) => {
  if (tipo === 'CC') {
    if (!/^[0-9]{6,11}$/.test(valor)) return 'Cédula de Ciudadanía inválida. Debe tener entre 6 y 11 dígitos.';
    return '';
  }
  // CE
  if (!/^[a-zA-Z0-9]{6,12}$/.test(valor)) return 'Cédula de Extranjería inválida. Debe tener entre 6 y 12 caracteres alfanuméricos.';
  return '';
};

// Texto de ayuda del rango permitido, según el tipo de documento elegido.
const rangoNumeroDocumento = (tipo) => tipo === 'CC'
  ? 'Entre 6 y 11 dígitos.'
  : 'Entre 6 y 12 caracteres alfanuméricos.';

// Filtro de escritura del campo "Número de documento", según el tipo
// elegido — se aplica mientras se escribe, no solo al enviar.
const filtrarNumeroDocumento = (tipo, v) => {
  if (tipo === 'CC') return v.replace(/[^0-9]/g, '').slice(0, 11);
  return v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12); // CE
};

// Selector con buscador — mismo componente ya usado en Compras e Insumos.
function BuscadorSelect({ value, options, onChange, placeholder, disabled, emptyMessage }) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setTexto('');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const selected = options.find(o => String(o.value) === String(value));
  const filtrados = texto.trim()
    ? options.filter(o => {
        const t = texto.trim().toLowerCase();
        return o.label.toLowerCase().includes(t) || (o.sub && o.sub.toLowerCase().includes(t));
      })
    : options;

  const abrir = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <div ref={wrapRef} className="buscador-select-wrap">
      <input
        ref={inputRef}
        type="text"
        className="buscador-select-input"
        disabled={disabled}
        value={open ? (texto || (selected ? selected.label : '')) : (selected ? selected.label : '')}
        onFocus={abrir}
        onClick={abrir}
        onChange={e => { setTexto(e.target.value); if (!open) setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
      />
      <svg className="buscador-select-icon-lupa" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      {open && !disabled && (
        <div className="buscador-dropdown">
          {filtrados.length === 0 ? (
            <div className="buscador-dropdown-empty">{emptyMessage || 'Sin resultados.'}</div>
          ) : filtrados.map(o => (
            <div
              key={o.value}
              className={`buscador-dropdown-item ${selected && String(selected.value) === String(o.value) ? 'is-selected' : ''}`}
              onMouseDown={() => { onChange(o.value); setOpen(false); setTexto(''); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal: Añadir / gestionar ciudades ─────────────────────────────────
// Mismo patrón exacto que "Gestionar tipos de presentación" en Compras:
// crear, editar el nombre, activar/desactivar. Sin eliminar — ninguna
// ciudad se puede borrar del catálogo, solo desactivar (ver ciudadesApi).
function ModalCiudades({ onClose, onCiudadesActualizadas }) {
  const [ciudades, setCiudades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const recargar = () => {
    ciudadesService.getAll()
      .then(d => { setCiudades(Array.isArray(d) ? d : []); onCiudadesActualizadas?.(Array.isArray(d) ? d : []); })
      .catch(() => setCiudades([]))
      .finally(() => setCargando(false));
  };
  useEffect(() => { recargar(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre de la ciudad es obligatorio.'); return; }
    setLoading(true);
    try {
      const r = await ciudadesService.create({ nombre: nombre.trim() });
      if (r?.error) { setError(r.error); return; }
      setNombre('');
      recargar();
    } catch (err) {
      setError(err.message || 'No se pudo crear la ciudad.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c) => { setError(''); setEditId(c.id); setEditNombre(c.nombre); };
  const cancelEdit = () => { setEditId(null); setEditNombre(''); };

  const saveEdit = async (c) => {
    setError('');
    if (!editNombre.trim()) { setError('El nombre de la ciudad es obligatorio.'); return; }
    if (editNombre.trim() === c.nombre) { cancelEdit(); return; }
    setEditLoading(true);
    try {
      const r = await ciudadesService.update(c.id, { nombre: editNombre.trim() });
      if (r?.error) { setError(r.error); return; }
      cancelEdit();
      recargar();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cambio.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleEstado = async (c) => {
    setError('');
    setToggleLoadingId(c.id);
    try {
      const r = await ciudadesService.toggleEstado(c.id);
      if (r?.error) setError(r.error);
      else recargar();
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de la ciudad.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.5)', animation: 'popIn .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Gestionar ciudades</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Una ciudad no se puede eliminar del catálogo — solo desactivarse, para que deje de aparecer como opción en proveedores nuevos.
          </p>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nueva ciudad (ej: Montería)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={loading} className="btn-add" style={{ padding: '0 16px' }}>
              {loading ? 'Creando...' : '+ Crear'}
            </button>
          </form>
          {!cargando && ciudades.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          )}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</div>
          ) : ciudades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aún no hay ciudades registradas.
            </div>
          ) : (() => {
            const ciudadesFiltradas = busqueda.trim()
              ? ciudades.filter(c => normalizarComparacion(c.nombre).includes(normalizarComparacion(busqueda)))
              : ciudades;
            if (ciudadesFiltradas.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ninguna ciudad coincide con "{busqueda}".
                </div>
              );
            }
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ciudadesFiltradas.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-3)', border: '1px solid var(--border)' }}>
                  {editId === c.id ? (
                    <>
                      <input
                        type="text" autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, marginRight: 10, padding: '6px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => saveEdit(c)} disabled={editLoading} title="Guardar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(76,175,80,0.15)', color: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button onClick={cancelEdit} title="Cancelar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.estado === 'Activo' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.nombre}</span>
                        <span style={{ padding:'2px 8px',borderRadius:20,fontSize:10.5,fontWeight:700,background:c.estado==='Activo'?'rgba(76,175,80,.15)':'rgba(158,158,158,.18)',color:c.estado==='Activo'?'#4CAF50':'#9E9E9E' }}>
                          {c.estado === 'Activo' ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          onClick={() => handleToggleEstado(c)}
                          disabled={toggleLoadingId === c.id}
                          title={c.estado === 'Activo' ? 'Desactivar ciudad' : 'Activar ciudad'}
                          className={`toggle-btn ${c.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          style={{ opacity: toggleLoadingId === c.id ? 0.5 : 1 }}>
                          <span className="toggle-thumb"/>
                        </button>
                        <button onClick={() => startEdit(c)} title="Editar nombre"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            );
          })()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ProveedorForm = ({ initialData, onSubmit, onCancel, isEditing, duplicateFields = [] }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // Qué campos ya tocó el usuario (onBlur en texto, onChange en selects) —
  // solo esos muestran el check de válido; el error, en cambio, se muestra
  // apenas exista (incluido al enviar, para campos nunca tocados).
  const [touched, setTouched] = useState({});

  // Catálogo dinámico de ciudades (ver ciudadesService) — reemplaza el
  // texto fijo "Medellín" que tenía este campo antes.
  const [ciudades, setCiudades] = useState([]);
  useEffect(() => {
    ciudadesService.getAll()
      .then(d => setCiudades(Array.isArray(d) ? d : []))
      .catch(() => setCiudades([]));
  }, []);
  const [showModalCiudades, setShowModalCiudades] = useState(false);
  // Refs para el autoscroll/foco al primer campo con error al enviar —
  // en el mismo orden visual en que aparecen en el formulario.
  const nombreCompletoRef = useRef();
  const numeroDocumentoRef = useRef();
  const nitRef = useRef();
  const nombreRef = useRef();
  const personaContactoRef = useRef();
  const telefonoRef = useRef();
  const correoRef = useRef();
  const ciudadRef = useRef();

  useEffect(() => {
    if (initialData) {
      setForm({
        tipoPersona:     initialData.tipoPersona     || 'Juridica',
        nombre:          initialData.nombre          || '',
        // Compatibilidad con proveedores ya guardados antes de este
        // cambio (con nombres/apellidos separados): si no existe todavía
        // un "nombreCompleto" propio, se usa el "nombre" ya combinado que
        // todo proveedor (de cualquier época) siempre tiene.
        nombreCompleto:  initialData.nombreCompleto  || initialData.nombre || '',
        personaContacto: initialData.personaContacto || '',
        tipoDocumento:   TIPOS_DOCUMENTO.includes(initialData.tipoDocumento) ? initialData.tipoDocumento : 'CC',
        numeroDocumento: initialData.numeroDocumento || '',
        nit:             initialData.nit             || '',
        telefono:        initialData.telefono        || '',
        correo:          initialData.correo          || '',
        direccion:       initialData.direccion       || '',
        // Antes esto se forzaba siempre a 'Medellín' (el campo era fijo).
        // Ahora, al editar un proveedor ya existente, se respeta la ciudad
        // real que tiene guardada — solo un proveedor NUEVO arranca en
        // 'Medellín' como valor por defecto (ver EMPTY_FORM).
        ciudad:          initialData.ciudad || 'Medellín',
        observaciones:   initialData.observaciones   || '',
        estado:          initialData.estado !== undefined ? initialData.estado : 'Activo'
      });
    }
  }, [initialData]);

  const esNatural = form.tipoPersona === 'Natural';

  // El toggle no es solo un cambio visual: limpia los campos exclusivos
  // del otro tipo de persona, para no arrastrar datos (y errores) que ya
  // no aplican al formulario que se está mostrando.
  const cambiarTipoPersona = (tipo) => {
    setForm(prev => ({
      ...EMPTY_FORM,
      tipoPersona: tipo,
      telefono: prev.telefono, correo: prev.correo, direccion: prev.direccion,
      ciudad: prev.ciudad, observaciones: prev.observaciones, estado: prev.estado,
    }));
    setErrors({});
    setTouched({});
  };

  // Acepta un snapshot de formulario explícito (f) para poder validar el
  // valor que se ACABA de escribir/seleccionar antes de que termine de
  // aplicarse el setForm — así la validación en tiempo real siempre mira
  // el valor real, no el de un render atrás.
  const validate = (f = form) => {
    const errs = {};
    const natural = f.tipoPersona === 'Natural';
    if (natural) {
      const errNombre = validarNombreCompleto(f.nombreCompleto);
      if (errNombre) errs.nombreCompleto = errNombre;
      if (!f.numeroDocumento.trim()) {
        errs.numeroDocumento = 'El número de documento es obligatorio';
      } else {
        const err = validarNumeroDocumento(f.tipoDocumento, f.numeroDocumento.trim());
        if (err) errs.numeroDocumento = err;
      }
    } else {
      const errRazon = validarRazonSocial(f.nombre);
      if (errRazon) errs.nombre = errRazon;
      if (!f.nit.trim()) {
        errs.nit = 'El NIT es obligatorio';
      } else {
        const err = validarNitJuridica(f.nit.trim());
        if (err) errs.nit = err;
      }
      // "Persona de contacto" es obligatoria para Persona Jurídica — un
      // proveedor de este tipo siempre debe tener a alguien identificado
      // con quién tratar dentro de la empresa.
      const errContacto = validarNombreCompleto(f.personaContacto);
      if (errContacto) errs.personaContacto = errContacto;
    }
    if (!f.telefono.trim()) errs.telefono = 'El teléfono es obligatorio';
    else if (f.telefono.length !== TELEFONO_LEN) errs.telefono = `El teléfono debe tener exactamente ${TELEFONO_LEN} dígitos`;
    if (!f.correo.trim())   errs.correo   = 'El correo es obligatorio';
    else if (!/\S+@\S+\.\S+/.test(f.correo)) errs.correo = 'Ingresa un correo válido';
    // Ciudad vuelve a ser un campo real (ya no fijo) — obligatorio, igual
    // que como funcionaba antes de dejarlo en "Medellín" a secas.
    if (!f.ciudad) errs.ciudad = 'Selecciona una ciudad';
    return errs;
  };

  // Marca el campo como tocado y recalcula SOLO su propio error/validez en
  // tiempo real — un campo nunca queda "en rojo" por culpa de otro que
  // apenas se está editando.
  const touchAndValidate = (name, f = form) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    setErrors(prev => ({ ...prev, [name]: validate(f)[name] || '' }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox' && name === 'estado') {
      setForm(prev => ({ ...prev, estado: checked ? 'Activo' : 'Inactivo' }));
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
      return;
    }

    // Cada campo filtra lo que no le corresponde MIENTRAS se escribe (no
    // solo al enviar), y ninguno permite empezar con un espacio.
    let v = value;
    if (name === 'nombreCompleto' || name === 'personaContacto') {
      v = sinEspacioAlInicio(colapsarEspacios(soloLetrasYEspacios(v))).slice(0, NOMBRE_COMPLETO_MAX);
    } else if (name === 'nombre') { // Razón social
      v = sinEspacioAlInicio(filtrarRazonSocial(v)).slice(0, RAZON_SOCIAL_MAX);
    } else if (name === 'numeroDocumento') {
      v = filtrarNumeroDocumento(form.tipoDocumento, v);
    } else if (name === 'nit') {
      v = v.replace(/[^0-9-]/g, '').slice(0, 11);
    } else if (name === 'telefono') {
      v = v.replace(/[^0-9]/g, '').slice(0, TELEFONO_LEN);
    } else if (name === 'correo') {
      v = sinEspacioAlInicio(v).slice(0, CORREO_MAX);
    } else if (name === 'direccion') {
      v = sinEspacioAlInicio(v).slice(0, DIRECCION_MAX);
    } else if (name === 'observaciones') {
      v = sinEspacioAlInicio(v).slice(0, OBSERVACIONES_PROVEEDOR_MAX);
    }

    const newForm = { ...form, [name]: v };
    setForm(newForm);
    // Validación no agresiva: la primera vez que se interactúa con un
    // campo (onChange) NUNCA introduce una alerta nueva — solo revalida
    // en vivo si el campo YA tiene un error visible (para poder LIMPIARLO
    // tan pronto el valor quede correcto). La alerta nueva solo aparece
    // al salir del campo (onBlur, ver abajo) o al enviar el formulario.
    if (errors[name]) touchAndValidate(name, newForm);
  };

  // onBlur genérico para los campos de texto validados.
  const handleBlur = (e) => touchAndValidate(e.target.name);

  // Al cambiar el tipo de documento, lo que ya estaba escrito en "Número
  // de documento" se vuelve a filtrar con la regla del nuevo tipo (ej: si
  // tenía letras y pasa de CE a CC, se limpian).
  // Ciudad ahora pasa por BuscadorSelect (recibe el valor directo, no un
  // evento) en vez del onChange genérico usado por los demás campos.
  const handleCiudadChange = (value) => {
    const newForm = { ...form, ciudad: value };
    setForm(newForm);
    touchAndValidate('ciudad', newForm);
  };

  const handleTipoDocumentoChange = (e) => {
    const nuevoTipo = e.target.value;
    const newForm = { ...form, tipoDocumento: nuevoTipo, numeroDocumento: filtrarNumeroDocumento(nuevoTipo, form.numeroDocumento) };
    setForm(newForm);
    // Si el número de documento ya había sido tocado, se revalida contra
    // la regla del nuevo tipo (ej: pasar de CC a CE invalida un valor que
    // antes era válido).
    if (touched.numeroDocumento) touchAndValidate('numeroDocumento', newForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Marca TODOS los campos con error como tocados al enviar, para que
      // se disparen las alertas de los que el usuario nunca llegó a tocar.
      setTouched(prev => ({ ...prev, ...Object.fromEntries(Object.keys(errs).map(k => [k, true])) }));
      setTimeout(() => {
        if (errs.nombreCompleto) nombreCompletoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.numeroDocumento) numeroDocumentoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.nit) nitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.nombre) nombreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.personaContacto) personaContactoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.telefono) telefonoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.correo) correoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.ciudad) ciudadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    // "nombre" siempre queda con un valor de despliegue coherente, para
    // que el listado, la búsqueda y el detalle de Proveedores (que leen
    // p.nombre) sigan funcionando igual sin importar el tipo de persona.
    const payload = esNatural
      ? { ...form, nombre: form.nombreCompleto.trim(), nit: '', personaContacto: '' }
      : { ...form, nombreCompleto: '', tipoDocumento: '', numeroDocumento: '' };

    onSubmit(payload, (dupFields) => {
      const dupErrs = {};
      const labels = { nombre: 'Ya existe un proveedor con este nombre/razón social', nit: 'Ya existe un proveedor con este NIT', numeroDocumento: 'Ya existe un proveedor con este número de documento', telefono: 'Ya existe un proveedor con este teléfono', correo: 'Ya existe un proveedor con este correo electrónico' };
      (dupFields || []).forEach(f => { dupErrs[f] = labels[f] || 'Valor duplicado'; });
      setErrors(prev => ({ ...prev, ...dupErrs }));
    });
  };

  // Al editar, si la ciudad ya guardada quedó inactiva mientras tanto, se
  // sigue mostrando en la lista (con "(Inactiva)") para no perder la
  // selección actual — mismo criterio ya usado para el proveedor
  // inactivo en InsumoForm.jsx.
  const ciudadesActivas = ciudades.filter(c => c.estado === 'Activo');
  const ciudadActualInactiva = form.ciudad && !ciudadesActivas.some(c => c.nombre === form.ciudad)
    ? ciudades.find(c => c.nombre === form.ciudad)
    : null;
  const opcionesCiudad = ciudadActualInactiva ? [...ciudadesActivas, ciudadActualInactiva] : ciudadesActivas;

  return (
    <>
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      {/* Toggle Persona Natural / Persona Jurídica — reemplaza cualquier
          campo seleccionable de "tipo de persona": es la propia elección
          la que determina la estructura del formulario de aquí en adelante. */}
      <div className="fg fg-full tipo-persona-field" style={{ marginBottom: 8 }}>
        <label>Tipo de persona</label>
        <div className="tipo-persona-toggle-wrap">
          <div className="tipo-persona-toggle">
            <button type="button"
              className={`tp-btn ${esNatural ? 'tp-btn-active' : ''}`}
              onClick={() => cambiarTipoPersona('Natural')}>
              Persona Natural
            </button>
            <button type="button"
              className={`tp-btn ${!esNatural ? 'tp-btn-active' : ''}`}
              onClick={() => cambiarTipoPersona('Juridica')}>
              Persona Jurídica
            </button>
          </div>
        </div>
      </div>

      <div className="form-grid">

        {esNatural ? (
          <>
            <div ref={nombreCompletoRef} className={`fg ${errors.nombreCompleto ? 'fg-error' : ''}`}>
              <label>Nombre completo <span className="req">*</span></label>
              <input type="text" name="nombreCompleto" value={form.nombreCompleto}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: María José Pérez Gómez" maxLength={NOMBRE_COMPLETO_MAX} />
              <div style={{fontSize:11,color:enElTope(form.nombreCompleto,NOMBRE_COMPLETO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombreCompleto,NOMBRE_COMPLETO_MAX)}</div>
              <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Entre {NOMBRE_COMPLETO_MIN} y {NOMBRE_COMPLETO_MAX} caracteres. Solo letras y espacios.</span>
              {errors.nombreCompleto
                ? <span className="err-msg">{errors.nombreCompleto}</span>
                : touched.nombreCompleto && form.nombreCompleto.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div className="fg">
              <label>Tipo de documento <span className="req">*</span></label>
              <select name="tipoDocumento" value={form.tipoDocumento} onChange={handleTipoDocumentoChange}>
                {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div ref={numeroDocumentoRef} className={`fg ${errors.numeroDocumento ? 'fg-error' : ''}`}>
              <label>Número de documento <span className="req">*</span></label>
              <input type="text" name="numeroDocumento" value={form.numeroDocumento}
                onChange={handleChange} onBlur={handleBlur}
                placeholder="Ej: 1020304050" />
              <span style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,display:'block' }}>{rangoNumeroDocumento(form.tipoDocumento)}</span>
              {errors.numeroDocumento
                ? <span className="err-msg">{errors.numeroDocumento}</span>
                : touched.numeroDocumento && form.numeroDocumento.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>
          </>
        ) : (
          <>
            <div ref={nitRef} className={`fg ${errors.nit ? 'fg-error' : ''}`}>
              <label>NIT <span className="req">*</span></label>
              <input type="text" name="nit" value={form.nit}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: 900123456-1" maxLength={11} />
              <span style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,display:'block' }}>Formato: 9 dígitos, guion, dígito de verificación (ej: 900123456-1).</span>
              {errors.nit
                ? <span className="err-msg">{errors.nit}</span>
                : touched.nit && form.nit.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div ref={nombreRef} className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
              <label>Razón social <span className="req">*</span></label>
              <input type="text" name="nombre" value={form.nombre}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: Distribuidora Central S.A.S" maxLength={RAZON_SOCIAL_MAX} />
              <div style={{fontSize:11,color:enElTope(form.nombre,RAZON_SOCIAL_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombre,RAZON_SOCIAL_MAX)}</div>
              <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Entre {RAZON_SOCIAL_MIN} y {RAZON_SOCIAL_MAX} caracteres. Admite números, puntos, guiones y "&".</span>
              {errors.nombre
                ? <span className="err-msg">{errors.nombre}</span>
                : touched.nombre && form.nombre.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div ref={personaContactoRef} className={`fg ${errors.personaContacto ? 'fg-error' : ''}`}>
              <label>Persona de contacto <span className="req">*</span></label>
              <input type="text" name="personaContacto" value={form.personaContacto}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: Laura Ramírez" maxLength={NOMBRE_COMPLETO_MAX} />
              <div style={{fontSize:11,color:enElTope(form.personaContacto,NOMBRE_COMPLETO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.personaContacto,NOMBRE_COMPLETO_MAX)}</div>
              <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Entre {NOMBRE_COMPLETO_MIN} y {NOMBRE_COMPLETO_MAX} caracteres. Solo letras y espacios.</span>
              {errors.personaContacto
                ? <span className="err-msg">{errors.personaContacto}</span>
                : touched.personaContacto && form.personaContacto.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>
          </>
        )}

        <div ref={telefonoRef} className={`fg ${errors.telefono ? 'fg-error' : ''}`}>
          <label>Teléfono <span className="req">*</span></label>
          <input type="text" inputMode="numeric" name="telefono" value={form.telefono}
            onChange={handleChange} onBlur={handleBlur} placeholder="Ej: 3001234567" maxLength={TELEFONO_LEN} />
          <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Exactamente {TELEFONO_LEN} dígitos.</span>
          {errors.telefono
            ? <span className="err-msg">{errors.telefono}</span>
            : touched.telefono && form.telefono.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={correoRef} className={`fg ${errors.correo ? 'fg-error' : ''}`}>
          <label>Correo electrónico <span className="req">*</span></label>
          <input type="text" name="correo" value={form.correo}
            onChange={handleChange} onBlur={handleBlur} placeholder="proveedor@correo.com" maxLength={CORREO_MAX} />
          <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Máximo {CORREO_MAX} caracteres.</span>
          {errors.correo
            ? <span className="err-msg">{errors.correo}</span>
            : touched.correo && form.correo.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={ciudadRef} className={`fg ${errors.ciudad ? 'fg-error' : ''}`}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Ciudad <span className="req">*</span></span>
            <button type="button" onClick={() => setShowModalCiudades(true)}
              style={{ background: 'none', border: 'none', color: 'var(--color-green,#4CAF50)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              + Añadir ciudad
            </button>
          </label>
          {opcionesCiudad.length > 0 ? (
            <BuscadorSelect
              value={form.ciudad}
              options={opcionesCiudad.map(c => ({ value: c.nombre, label: c.nombre + (c.estado !== 'Activo' ? ' (Inactiva)' : '') }))}
              onChange={handleCiudadChange}
              placeholder="Buscar ciudad..."
              emptyMessage="Ninguna ciudad coincide con esa búsqueda."
            />
          ) : (
            <div style={{ padding: '10px 14px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227' }}>
              ⚠ No hay ciudades activas registradas. Usa "+ Añadir ciudad" para crear la primera.
            </div>
          )}
          {errors.ciudad
            ? <span className="err-msg">{errors.ciudad}</span>
            : touched.ciudad && form.ciudad && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className="fg">
          <label>Dirección</label>
          <input type="text" name="direccion" value={form.direccion}
            onChange={handleChange} placeholder="Ej: Cra 50 #30-20" maxLength={DIRECCION_MAX} />
          <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Máximo {DIRECCION_MAX} caracteres.</span>
        </div>
        <div className="fg fg-estado">
          <label>Estado</label>
          <div className="estado-toggle-wrap">
            <label className="switch">
              <input type="checkbox" name="estado" checked={form.estado === 'Activo'} onChange={handleChange} />
              <span className="sw-slider"></span>
            </label>
            <span className={`estado-label ${form.estado === 'Activo' ? 'label-active' : 'label-inactive'}`}>
              {form.estado === 'Activo' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div className="fg fg-full">
          <label>Observaciones</label>
          <textarea name="observaciones" value={form.observaciones}
            onChange={handleChange}
            onBlur={() => setForm(prev => ({ ...prev, observaciones: prev.observaciones.trimEnd() }))}
            placeholder="Notas breves sobre el proveedor..." rows={3}
            maxLength={OBSERVACIONES_PROVEEDOR_MAX} />
          <div style={{fontSize:11,color:enElTope(form.observaciones,OBSERVACIONES_PROVEEDOR_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.observaciones,OBSERVACIONES_PROVEEDOR_MAX)}</div>
        </div>
      </div>

      <div className="form-footer">
        <button type="button" className="btn-form-cancel" onClick={onCancel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancelar
        </button>
        <button type="submit" className="btn-form-submit" disabled={Object.values(errors).some(Boolean)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isEditing
              ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
            }
          </svg>
          {isEditing ? 'Guardar cambios' : 'Registrar proveedor'}
        </button>
      </div>
    </form>

    {showModalCiudades && (
      <ModalCiudades
        onClose={() => setShowModalCiudades(false)}
        onCiudadesActualizadas={setCiudades}
      />
    )}
    </>
  );
};

export default ProveedorForm;