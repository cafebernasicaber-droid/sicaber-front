import React, { useState, useEffect } from 'react';
import proveedoresService from '../services/proveedoresService';
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
  ciudad: '',
  observaciones: '',
  estado: 'Activo'
};

// Mismo catálogo de municipios ya usado en Clientes (ClienteRegistroModal /
// ClienteEditarModal) para no inventar una lista nueva — Medellín primero.
const CIUDADES = ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Sabaneta', 'Rionegro', 'Apartadó', 'Turbo'];

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
// Jurídica) comparten las mismas reglas: ahora es un campo unificado
// (antes Nombres + Apellidos, 60 cada uno, por separado), así que el
// máximo sube a 100 para no quedar corto con nombres compuestos de varias
// palabras.
const NOMBRE_COMPLETO_MIN = 3;
const NOMBRE_COMPLETO_MAX = 100;
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
// contacto" (Persona Jurídica) — mismas reglas para ambos: 3 a 100
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

const ProveedorForm = ({ initialData, onSubmit, onCancel, isEditing, duplicateFields = [] }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // Qué campos ya tocó el usuario (onBlur en texto, onChange en selects) —
  // solo esos muestran el check de válido; el error, en cambio, se muestra
  // apenas exista (incluido al enviar, para campos nunca tocados).
  const [touched, setTouched] = useState({});

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
    if (!f.ciudad)          errs.ciudad    = 'Selecciona una ciudad';
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
    // "ciudad" es un select — una elección completa apenas cambia, se
    // valida de inmediato. Los campos de texto solo limpian su error
    // mientras se escribe; se validan al perder el foco (ver handleBlur),
    // para no marcar error a mitad de tecleo.
    // Validación en tiempo real para TODOS los campos: antes solo
    // "ciudad" (un select) se validaba de inmediato; los campos de texto
    // (Nombre completo, Persona de contacto, Razón Social, Documento,
    // NIT, Teléfono, Correo) esperaban a que el usuario saliera del
    // campo (onBlur) para mostrar o quitar el error.
    touchAndValidate(name, newForm);
  };

  // onBlur genérico para los campos de texto validados.
  const handleBlur = (e) => touchAndValidate(e.target.name);

  // Al cambiar el tipo de documento, lo que ya estaba escrito en "Número
  // de documento" se vuelve a filtrar con la regla del nuevo tipo (ej: si
  // tenía letras y pasa de CE a CC, se limpian).
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
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

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
            <div className={`fg ${errors.nombreCompleto ? 'fg-error' : ''}`}>
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

            <div className={`fg ${errors.numeroDocumento ? 'fg-error' : ''}`}>
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
            <div className={`fg ${errors.nit ? 'fg-error' : ''}`}>
              <label>NIT <span className="req">*</span></label>
              <input type="text" name="nit" value={form.nit}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: 900123456-1" maxLength={11} />
              <span style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,display:'block' }}>Formato: 9 dígitos, guion, dígito de verificación (ej: 900123456-1).</span>
              {errors.nit
                ? <span className="err-msg">{errors.nit}</span>
                : touched.nit && form.nit.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
              <label>Razón social <span className="req">*</span></label>
              <input type="text" name="nombre" value={form.nombre}
                onChange={handleChange} onBlur={handleBlur} placeholder="Ej: Distribuidora Central S.A.S" maxLength={RAZON_SOCIAL_MAX} />
              <div style={{fontSize:11,color:enElTope(form.nombre,RAZON_SOCIAL_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombre,RAZON_SOCIAL_MAX)}</div>
              <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Entre {RAZON_SOCIAL_MIN} y {RAZON_SOCIAL_MAX} caracteres. Admite números, puntos, guiones y "&".</span>
              {errors.nombre
                ? <span className="err-msg">{errors.nombre}</span>
                : touched.nombre && form.nombre.trim() && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div className={`fg ${errors.personaContacto ? 'fg-error' : ''}`}>
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

        <div className={`fg ${errors.telefono ? 'fg-error' : ''}`}>
          <label>Teléfono <span className="req">*</span></label>
          <input type="text" inputMode="numeric" name="telefono" value={form.telefono}
            onChange={handleChange} onBlur={handleBlur} placeholder="Ej: 3001234567" maxLength={TELEFONO_LEN} />
          <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Exactamente {TELEFONO_LEN} dígitos.</span>
          {errors.telefono
            ? <span className="err-msg">{errors.telefono}</span>
            : touched.telefono && form.telefono.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className={`fg ${errors.correo ? 'fg-error' : ''}`}>
          <label>Correo electrónico <span className="req">*</span></label>
          <input type="text" name="correo" value={form.correo}
            onChange={handleChange} onBlur={handleBlur} placeholder="proveedor@correo.com" maxLength={CORREO_MAX} />
          <span style={{ fontSize:12,color:'var(--text-muted)',display:'block' }}>Máximo {CORREO_MAX} caracteres.</span>
          {errors.correo
            ? <span className="err-msg">{errors.correo}</span>
            : touched.correo && form.correo.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className={`fg ${errors.ciudad ? 'fg-error' : ''}`}>
          <label>Ciudad <span className="req">*</span></label>
          <select name="ciudad" value={form.ciudad} onChange={handleChange}>
            <option value="">Seleccionar ciudad</option>
            {CIUDADES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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
  );
};

export default ProveedorForm;