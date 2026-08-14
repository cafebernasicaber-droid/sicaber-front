import React, { useState, useEffect } from 'react';
import proveedoresService from '../services/proveedoresService';
import './ProveedorForm.css';

const EMPTY_FORM = {
  nombre: '',
  nit: '',
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

// Dígito de verificación del NIT (algoritmo DIAN, módulo 11) — antes solo
// se validaba la forma "900123456-1" con una regex, sin comprobar que el
// dígito después del guion fuera matemáticamente correcto.
const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
const calcularDigitoVerificacionNIT = (numero) => {
  const digitos = String(numero).split('').reverse();
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (PESOS_NIT[i] || 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
};

const ProveedorForm = ({ initialData, onSubmit, onCancel, isEditing, duplicateFields = [] }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setForm({
        nombre:        initialData.nombre        || '',
        nit:           initialData.nit           || '',
        telefono:      initialData.telefono      || '',
        correo:        initialData.correo        || '',
        direccion:     initialData.direccion     || '',
        ciudad:        initialData.ciudad        || '',
        observaciones: initialData.observaciones || '',
        estado:        initialData.estado !== undefined ? initialData.estado : 'Activo'
      });
    }
  }, [initialData]);


  const validate = () => {
    const errs = {};
    if (!form.nombre.trim())   errs.nombre   = 'El nombre es obligatorio';
    if (!form.nit.trim())      errs.nit      = 'El NIT es obligatorio';
    else if (!/^[0-9]{6,10}-[0-9]$/.test(form.nit)) errs.nit = 'Formato inválido. Ejemplo: 900123456-1';
    else {
      const [numero, digito] = form.nit.split('-');
      if (calcularDigitoVerificacionNIT(numero) !== Number(digito)) errs.nit = 'El dígito de verificación del NIT no es válido.';
    }
    if (!form.telefono.trim()) errs.telefono = 'El teléfono es obligatorio';
    else if (!/^[0-9]{10}$/.test(form.telefono)) errs.telefono = 'El teléfono debe tener exactamente 10 dígitos';
    if (!form.correo.trim())   errs.correo   = 'El correo es obligatorio';
    else if (!/\S+@\S+\.\S+/.test(form.correo)) errs.correo = 'Ingresa un correo válido';
    if (!form.ciudad)          errs.ciudad    = 'Selecciona una ciudad';
    return errs;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox' && name === 'estado') {
      setForm(prev => ({ ...prev, estado: checked ? 'Activo' : 'Inactivo' }));
    } else {
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit(form, (dupFields) => {
      const dupErrs = {};
      const labels = { nombre: 'Ya existe un proveedor con este nombre', nit: 'Ya existe un proveedor con este NIT', telefono: 'Ya existe un proveedor con este teléfono', correo: 'Ya existe un proveedor con este correo electrónico' };
      (dupFields || []).forEach(f => { dupErrs[f] = labels[f] || 'Valor duplicado'; });
      setErrors(prev => ({ ...prev, ...dupErrs }));
    });
  };

  return (
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">

        <div className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
          <label>Nombre del proveedor <span className="req">*</span></label>
          <input type="text" name="nombre" value={form.nombre}
            onChange={handleChange} placeholder="Ej: Distribuidora Central S.A.S" />
          {errors.nombre && <span className="err-msg">{errors.nombre}</span>}
        </div>

        <div className={`fg ${errors.nit ? 'fg-error' : ''}`}>
          <label>NIT <span className="req">*</span></label>
          <input type="text" name="nit" value={form.nit}
            onChange={handleChange} placeholder="Ej: 900123456-1" />
          <span style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,display:'block' }}>Formato: 900123456-1</span>
          {errors.nit && <span className="err-msg">{errors.nit}</span>}
        </div>

        <div className={`fg ${errors.telefono ? 'fg-error' : ''}`}>
          <label>Teléfono <span className="req">*</span></label>
          <input type="text" name="telefono" value={form.telefono}
            onChange={handleChange} placeholder="Ej: 3001234567" />
          {errors.telefono && <span className="err-msg">{errors.telefono}</span>}
        </div>

        <div className={`fg ${errors.correo ? 'fg-error' : ''}`}>
          <label>Correo electrónico <span className="req">*</span></label>
          <input type="email" name="correo" value={form.correo}
            onChange={handleChange} placeholder="proveedor@correo.com" />
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
            onChange={handleChange} placeholder="Ej: Cra 50 #30-20" />
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
            onChange={handleChange} placeholder="Notas adicionales sobre el proveedor..." rows={3} />
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