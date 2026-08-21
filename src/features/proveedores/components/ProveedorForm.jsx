import React, { useState, useEffect } from 'react';
import proveedoresService from '../services/proveedoresService';
import './ProveedorForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_FORM = {
  tipoPersona: 'Juridica', // 'Natural' | 'Juridica' — decidido por el toggle, no es un campo seleccionable dentro del formulario
  nombre: '',        // Persona Jurídica: Razón social. Persona Natural: se recalcula como "Nombres Apellidos".
  nombres: '',        // solo Persona Natural
  apellidos: '',       // solo Persona Natural
  tipoDocumento: 'CC', // solo Persona Natural: CC | TI | CE | Pasaporte | NIT
  numeroDocumento: '', // solo Persona Natural
  nit: '',        // solo Persona Jurídica
  telefono: '',
  correo: '',
  direccion: '',
  ciudad: '',
  observaciones: '',
  estado: 'Activo'
};

// Mismo catálogo de municipios ya usado en Clientes (ClienteRegistroModal /
// ClienteEditarModal) para no inventar una lista nueva — Medellín primero.
const CIUDADES = ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Sabaneta', 'Rionegro', 'Apartadó', 'Turbo'];

const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'Pasaporte', 'NIT'];

// ── Topes de longitud propios de este formulario, sin equivalente todavía
// en shared/utils/limitesTexto.js (que solo trae NOMBRE/DESCRIPCION/etc.).
// Mismo criterio: son topes razonables por tipo de campo, pero — igual que
// advierte ese archivo — todavía QUEDAN PENDIENTES de reflejarse en el
// backend (validaciones.js) para que la restricción sea real, no solo de
// interfaz.
const TELEFONO_LEN = 10;
// Topes propios de este formulario: 60 caracteres para los campos de
// texto normales (nombre/razón social/etc.), 200 para la descripción u
// observaciones — reemplazan al LIMITES.NOMBRE compartido (150), que
// sigue usándose sin cambios en otros módulos.
const CAMPO_MAX = 60;
const OBSERVACIONES_PROVEEDOR_MAX = 200;
const CORREO_MAX = 150;
const DIRECCION_MAX = 200;

// Solo letras (con tildes/ñ) y espacios — un nombre de persona no lleva
// números ni símbolos.
const soloLetrasYEspacios = (v) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
// Letras, números, espacios y la puntuación normal de una razón social
// (S.A.S, Ltda., "El Buen Café & Cía.", guiones, apóstrofes).
const filtrarRazonSocial = (v) => v.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,&'-]/g, '');
// Sin espacio como PRIMER caracter (evita "   Juan" escrito a mano). No
// afecta un espacio que venga en medio del texto ni el de un pegado.
const sinEspacioAlInicio = (v) => v.replace(/^\s+/, '');

// Dígito de verificación del NIT (algoritmo DIAN, módulo 11).
const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
const calcularDigitoVerificacionNIT = (numero) => {
  const digitos = String(numero).split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (PESOS_NIT[i] || 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
};

// NIT de Persona Jurídica — misma regla de formato de siempre (6-10
// dígitos + DV). Ahora, igual que en Persona Natural, el mensaje sí dice
// cuál es el dígito correcto en vez de solo decir "no es válido".
const validarNitJuridica = (valor) => {
  if (!/^[0-9]{6,10}-[0-9]$/.test(valor)) return 'Formato inválido. Ejemplo: 900123456-1';
  const [numero, digito] = valor.split('-');
  const dvEsperado = calcularDigitoVerificacionNIT(numero);
  if (dvEsperado !== Number(digito)) return `El dígito de verificación no es correcto (debería ser ${dvEsperado}).`;
  return '';
};

// NIT como tipo de documento de Persona Natural — regla exacta pedida:
// exactamente 9 números + guion + dígito verificador.
const validarNitNatural = (valor) => {
  if (!/^[0-9]{9}-[0-9]$/.test(valor)) return 'Formato inválido. Debe ser exactamente 9 números, guion, dígito verificador. Ejemplo: 900123456-1';
  const [numero, digito] = valor.split('-');
  const dvEsperado = calcularDigitoVerificacionNIT(numero);
  if (dvEsperado !== Number(digito)) return `El dígito de verificación no es correcto (debería ser ${dvEsperado}).`;
  return '';
};

// Validación del número de documento según el tipo elegido (Persona
// Natural). CC/TI: solo dígitos, 6 a 11. CE/Pasaporte: alfanumérico,
// 6 a 12. NIT: la regla exacta de arriba (validarNitNatural).
const validarNumeroDocumento = (tipo, valor) => {
  if (tipo === 'NIT') return validarNitNatural(valor);
  if (tipo === 'CC' || tipo === 'TI') {
    if (!/^[0-9]{6,11}$/.test(valor)) return `${tipo} inválida. Debe tener entre 6 y 11 dígitos.`;
    return '';
  }
  // CE | Pasaporte
  if (!/^[a-zA-Z0-9]{6,12}$/.test(valor)) return `${tipo} inválido. Debe tener entre 6 y 12 caracteres alfanuméricos.`;
  return '';
};

// Filtro de escritura del campo "Número de documento", según el tipo
// elegido — se aplica mientras se escribe, no solo al enviar.
const filtrarNumeroDocumento = (tipo, v) => {
  if (tipo === 'NIT') return v.replace(/[^0-9-]/g, '').slice(0, 11); // 900123456-1 = 11 caracteres
  if (tipo === 'CC' || tipo === 'TI') return v.replace(/[^0-9]/g, '').slice(0, 11);
  return v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12); // CE | Pasaporte
};

const ProveedorForm = ({ initialData, onSubmit, onCancel, isEditing, duplicateFields = [] }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setForm({
        tipoPersona:     initialData.tipoPersona     || 'Juridica',
        nombre:          initialData.nombre          || '',
        nombres:         initialData.nombres         || '',
        apellidos:       initialData.apellidos       || '',
        tipoDocumento:   initialData.tipoDocumento   || 'CC',
        numeroDocumento: initialData.numeroDocumento || '',
        nit:             initialData.nit             || '',
        telefono:        initialData.telefono        || '',
        correo:          initialData.correo          || '',
        direccion:       initialData.direccion       || '',
        ciudad:          initialData.ciudad          || '',
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
  };

  const validate = () => {
    const errs = {};
    if (esNatural) {
      if (!form.nombres.trim())   errs.nombres   = 'Los nombres son obligatorios';
      if (!form.apellidos.trim()) errs.apellidos = 'Los apellidos son obligatorios';
      if (!form.numeroDocumento.trim()) {
        errs.numeroDocumento = 'El número de documento es obligatorio';
      } else {
        const err = validarNumeroDocumento(form.tipoDocumento, form.numeroDocumento.trim());
        if (err) errs.numeroDocumento = err;
      }
    } else {
      if (!form.nombre.trim()) errs.nombre = 'La razón social es obligatoria';
      if (!form.nit.trim()) {
        errs.nit = 'El NIT es obligatorio';
      } else {
        const err = validarNitJuridica(form.nit.trim());
        if (err) errs.nit = err;
      }
    }
    if (!form.telefono.trim()) errs.telefono = 'El teléfono es obligatorio';
    else if (form.telefono.length !== TELEFONO_LEN) errs.telefono = `El teléfono debe tener exactamente ${TELEFONO_LEN} dígitos`;
    if (!form.correo.trim())   errs.correo   = 'El correo es obligatorio';
    else if (!/\S+@\S+\.\S+/.test(form.correo)) errs.correo = 'Ingresa un correo válido';
    if (!form.ciudad)          errs.ciudad    = 'Selecciona una ciudad';
    return errs;
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
    if (name === 'nombres' || name === 'apellidos') {
      v = sinEspacioAlInicio(soloLetrasYEspacios(v)).slice(0, CAMPO_MAX);
    } else if (name === 'nombre') { // Razón social
      v = sinEspacioAlInicio(filtrarRazonSocial(v)).slice(0, CAMPO_MAX);
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

    setForm(prev => ({ ...prev, [name]: v }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // Al cambiar el tipo de documento, lo que ya estaba escrito en "Número
  // de documento" se vuelve a filtrar con la regla del nuevo tipo (ej: si
  // tenía letras y pasa de CE a CC, se limpian).
  const handleTipoDocumentoChange = (e) => {
    const nuevoTipo = e.target.value;
    setForm(prev => ({ ...prev, tipoDocumento: nuevoTipo, numeroDocumento: filtrarNumeroDocumento(nuevoTipo, prev.numeroDocumento) }));
    if (errors.numeroDocumento) setErrors(prev => ({ ...prev, numeroDocumento: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    // "nombre" siempre queda con un valor de despliegue coherente, para
    // que el listado, la búsqueda y el detalle de Proveedores (que leen
    // p.nombre) sigan funcionando igual sin importar el tipo de persona.
    const payload = esNatural
      ? { ...form, nombre: `${form.nombres.trim()} ${form.apellidos.trim()}`.trim(), nit: '' }
      : { ...form, nombres: '', apellidos: '', tipoDocumento: '', numeroDocumento: '' };

    onSubmit(payload, (dupFields) => {
      const dupErrs = {};
      const labels = { nombre: 'Ya existe un proveedor con este nombre/razón social', nit: 'Ya existe un proveedor con este NIT', numeroDocumento: 'Ya existe un proveedor con este número de documento', telefono: 'Ya existe un proveedor con este teléfono', correo: 'Ya existe un proveedor con este correo electrónico' };
      (dupFields || []).forEach(f => { dupErrs[f] = labels[f] || 'Valor duplicado'; });
      setErrors(prev => ({ ...prev, ...dupErrs }));
    });
  };

  return (
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      {/* Toggle Persona Natural / Persona Jurídica — reemplaza cualquier
          campo seleccionable de "tipo de persona": es la propia elección
          la que determina la estructura del formulario de aquí en adelante. */}
      <div className="fg fg-full tipo-persona-field" style={{ marginBottom: 8 }}>
        <label>Tipo de persona</label>
        <div className="tipo-persona-toggle-wrap">
          <div className="tipo-persona-toggle">
            <button type="button"
              className={`tp-btn ${!esNatural ? 'tp-btn-active' : ''}`}
              onClick={() => cambiarTipoPersona('Juridica')}>
              Persona Jurídica
            </button>
            <button type="button"
              className={`tp-btn ${esNatural ? 'tp-btn-active' : ''}`}
              onClick={() => cambiarTipoPersona('Natural')}>
              Persona Natural
            </button>
          </div>
        </div>
      </div>

      <div className="form-grid">

        {esNatural ? (
          <>
            <div className={`fg ${errors.nombres ? 'fg-error' : ''}`}>
              <label>Nombres <span className="req">*</span></label>
              <input type="text" name="nombres" value={form.nombres}
                onChange={handleChange} placeholder="Ej: Juan Carlos" maxLength={CAMPO_MAX} />
              <div style={{fontSize:11,color:enElTope(form.nombres,CAMPO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombres,CAMPO_MAX)}</div>
              {errors.nombres && <span className="err-msg">{errors.nombres}</span>}
            </div>

            <div className={`fg ${errors.apellidos ? 'fg-error' : ''}`}>
              <label>Apellidos <span className="req">*</span></label>
              <input type="text" name="apellidos" value={form.apellidos}
                onChange={handleChange} placeholder="Ej: Gómez Restrepo" maxLength={CAMPO_MAX} />
              <div style={{fontSize:11,color:enElTope(form.apellidos,CAMPO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.apellidos,CAMPO_MAX)}</div>
              {errors.apellidos && <span className="err-msg">{errors.apellidos}</span>}
            </div>

            <div className="fg">
              <label>Tipo de documento <span className="req">*</span></label>
              <select name="tipoDocumento" value={form.tipoDocumento} onChange={handleTipoDocumentoChange}>
                {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className={`fg ${errors.numeroDocumento ? 'fg-error' : ''}`}>
              <label>Número de documento <span className="req">*</span></label>
              <input type="text" name="numeroDocumento" value={form.numeroDocumento}
                onChange={handleChange}
                placeholder={form.tipoDocumento === 'NIT' ? 'Ej: 900123456-1' : 'Ej: 1020304050'} />
              {errors.numeroDocumento && <span className="err-msg">{errors.numeroDocumento}</span>}
            </div>
          </>
        ) : (
          <>
            <div className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
              <label>Razón social <span className="req">*</span></label>
              <input type="text" name="nombre" value={form.nombre}
                onChange={handleChange} placeholder="Ej: Distribuidora Central S.A.S" maxLength={CAMPO_MAX} />
              <div style={{fontSize:11,color:enElTope(form.nombre,CAMPO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombre,CAMPO_MAX)}</div>
              {errors.nombre && <span className="err-msg">{errors.nombre}</span>}
            </div>

            <div className={`fg ${errors.nit ? 'fg-error' : ''}`}>
              <label>NIT <span className="req">*</span></label>
              <input type="text" name="nit" value={form.nit}
                onChange={handleChange} placeholder="Ej: 900123456-1" maxLength={11} />
              <span style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,display:'block' }}>Formato: 900123456-1</span>
              {errors.nit && <span className="err-msg">{errors.nit}</span>}
            </div>
          </>
        )}

        <div className={`fg ${errors.telefono ? 'fg-error' : ''}`}>
          <label>Teléfono <span className="req">*</span></label>
          <input type="text" inputMode="numeric" name="telefono" value={form.telefono}
            onChange={handleChange} placeholder="Ej: 3001234567" maxLength={TELEFONO_LEN} />
          {errors.telefono && <span className="err-msg">{errors.telefono}</span>}
        </div>

        <div className={`fg ${errors.correo ? 'fg-error' : ''}`}>
          <label>Correo electrónico <span className="req">*</span></label>
          <input type="text" name="correo" value={form.correo}
            onChange={handleChange} placeholder="proveedor@correo.com" maxLength={CORREO_MAX} />
          {errors.correo && <span className="err-msg">{errors.correo}</span>}
        </div>

        <div className={`fg ${errors.ciudad ? 'fg-error' : ''}`}>
          <label>Ciudad <span className="req">*</span></label>
          <select name="ciudad" value={form.ciudad} onChange={handleChange}>
            <option value="">Seleccionar ciudad</option>
            {CIUDADES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {errors.ciudad && <span className="err-msg">{errors.ciudad}</span>}
        </div>

        <div className="fg">
          <label>Dirección</label>
          <input type="text" name="direccion" value={form.direccion}
            onChange={handleChange} placeholder="Ej: Cra 50 #30-20" maxLength={DIRECCION_MAX} />
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
        <button type="submit" className="btn-form-submit">
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
  );
};

export default ProveedorForm;