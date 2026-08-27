import React, { useState, useEffect } from 'react';
import insumosService from '../services/insumosService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import categoriasInsumosService from '../services/categoriasInsumosService';
import './InsumoForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_FORM = {
  nombre: '',
  categoria: '',
  categoriaId: '',
  unidadMedida: '',
  stockActual: '',
  stockMinimo: '',
  proveedor: '',
  proveedorId: '',
  descripcion: '',
  estado: 'Activo',
  tamanoOz: '',
  // 2 — solo informativo: no cambia ninguna lógica de stock ni de costo,
  // es para poder filtrar/encontrar más rápido los insumos candidatos a
  // topping al armar la sección "Toppings" de una ficha técnica.
  esTopping: false,
};

// Los vasos ya NO son una categoría especial ni una lista definida en el
// código: cualquier insumo cuya unidad de medida sea "oz" se trata como un
// vaso y muestra el campo de tamaño. Las opciones de abajo son solo atajos
// comunes en el selector — "Otro" permite escribir cualquier tamaño nuevo,
// así que no es una lista cerrada.
const TAMANOS_OZ_PRESET = [4, 7, 9, 12, 14, 16, 20, 24];

// Topes propios de este formulario: 60 caracteres para el nombre del
// insumo, 200 para la descripción — mismo criterio que Proveedores,
// reemplazan al CAMPO_MAX/DESCRIPCION compartidos (150/500), que
// siguen usándose sin cambios en otros módulos.
const CAMPO_MAX = 60;
const DESCRIPCION_INSUMO_MAX = 200;

// Nombre del insumo: letras, números, espacios y la puntuación normal de
// un nombre de producto (paréntesis, guiones, comas, %). Nada de espacio
// como primer carácter.
const filtrarNombreInsumo = (v) => v.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,%()-]/g, '');
const sinEspacioAlInicio = (v) => v.replace(/^\s+/, '');

const InsumoForm = ({ initialData, onSubmit, onCancel, isEditing, serverError, onManageCategorias }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // Qué campos ya tocó el usuario (onChange en selects/checkbox, onBlur en
  // texto) — solo esos muestran el check de válido; el mensaje de error, en
  // cambio, se muestra apenas exista (incluido al enviar, para campos que
  // el usuario nunca llegó a tocar).
  const [touched, setTouched] = useState({});
  const [tamanoOzEsOtro, setTamanoOzEsOtro] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm({
        nombre:       initialData.nombre       || '',
        categoria:    initialData.categoria    || '',
        categoriaId:  initialData.categoriaId  || '',
        unidadMedida: initialData.unidadMedida || '',
        stockActual:  initialData.stockActual  ?? 0,
        stockMinimo:  initialData.stockMinimo  ?? '',
        proveedor:    initialData.proveedor    || '',
        proveedorId:  initialData.proveedorId  || '',
        descripcion:  initialData.descripcion  || '',
        estado:       initialData.estado !== undefined ? initialData.estado : 'Activo',
        tamanoOz:     initialData.tamanoOz     ?? '',
        esTopping:    !!initialData.esTopping,
      });
      setTamanoOzEsOtro(
        initialData.tamanoOz != null && initialData.tamanoOz !== '' && !TAMANOS_OZ_PRESET.includes(Number(initialData.tamanoOz))
      );
    }
  }, [initialData, isEditing]);

  // Solo unidades de medida reales del insumo. "Caja", "paquete", "bolsa" y
  // "docena" NO son unidades de medida — son presentaciones de compra (cómo
  // lo empaca el proveedor), y se manejan aparte en el formulario de
  // Registrar Compra ("Comprar por presentación"), nunca aquí.
  const unidades    = ['kg', 'g', 'lb', 'oz', 'L', 'mL', 'unidad'];
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  useEffect(() => {
    categoriasInsumosService.getAll()
      .then(d => setCategoriasDisponibles(Array.isArray(d) ? d.filter(c => c.estado === 'Activo') : []))
      .catch(() => setCategoriasDisponibles([]));
  }, []);
  const [proveedores, setProveedores] = useState([]);
  useEffect(() => {
    proveedoresService.getAll()
      .then(d => setProveedores(Array.isArray(d) ? d : []))
      .catch(() => setProveedores([]));
  }, []);

  // Acepta un snapshot de formulario explícito (f) para poder validar el
  // valor que se ACABA de escribir/seleccionar antes de que termine de
  // aplicarse el setForm — así la validación en tiempo real siempre mira
  // el valor real, no el de un render atrás.
  const validate = (f = form) => {
    const errs = {};
    if (!f.nombre.trim())      errs.nombre       = 'El nombre es obligatorio';
    if (!f.categoria)          errs.categoria    = 'Selecciona una categoría';
    if (f.unidadMedida === 'oz' && (f.tamanoOz === '' || isNaN(f.tamanoOz) || Number(f.tamanoOz) <= 0)) {
      errs.tamanoOz = 'Selecciona o escribe el tamaño del vaso';
    }
    if (!f.unidadMedida)       errs.unidadMedida = 'Selecciona una unidad de medida';
    if (f.stockMinimo === '' || isNaN(f.stockMinimo) || Number(f.stockMinimo) < 1) errs.stockMinimo = 'El stock mínimo debe ser 1 o mayor';
    if (proveedoresActivos.length > 0 && !f.proveedor.trim()) errs.proveedor = 'Selecciona un proveedor';
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
    let v = value;
    if (name === 'nombre') {
      v = sinEspacioAlInicio(filtrarNombreInsumo(v)).slice(0, CAMPO_MAX);
    } else if (name === 'descripcion') {
      v = sinEspacioAlInicio(v).slice(0, DESCRIPCION_INSUMO_MAX);
    }
    const newForm = { ...form, [name]: type === 'checkbox' ? checked : v };
    setForm(newForm);
    // Validación en tiempo real: antes "nombre" y "stockMinimo" solo se
    // validaban al perder el foco (onBlur) — cualquier campo con una
    // regla en validate() ahora se revisa en cada tecla, igual que ya
    // hacían los selects (categoría/unidad/proveedor) y el checkbox.
    if (type === 'checkbox' || name === 'unidadMedida' || name === 'nombre' || name === 'stockMinimo') {
      touchAndValidate(name, newForm);
    } else if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // onBlur genérico — ya no es el único momento en que se valida (ver
  // handleChange arriba), pero se deja como respaldo silencioso.
  const handleBlur = (e) => touchAndValidate(e.target.name);

  const handleCategoriaChange = (e) => {
    const selectedId = e.target.value;
    const cat = categoriasDisponibles.find(c => String(c.id) === selectedId);
    const nombreCat = cat ? cat.nombre : '';
    const newForm = { ...form, categoriaId: selectedId, categoria: nombreCat };
    setForm(newForm);
    touchAndValidate('categoria', newForm);
  };

  const handleProveedorChange = (e) => {
    const selectedId = e.target.value;
    const prov = proveedores.find(p => String(p.id) === selectedId);
    const newForm = { ...form, proveedorId: selectedId, proveedor: prov ? prov.nombre : '' };
    setForm(newForm);
    touchAndValidate('proveedor', newForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (noHayProveedores) {
      window.alert('No hay proveedores disponibles. Registra un proveedor o activa uno existente en Gestión de Proveedores antes de crear un insumo.');
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit({
      ...form,
      stockMinimo: Math.max(1, parseInt(form.stockMinimo, 10) || 1),
      tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
    });
  };

  // "Disponible" significa que existe al menos un proveedor Activo — no basta
  // con que existan proveedores si todos están inactivos.
  const proveedoresActivos = proveedores.filter(p => p.estado === 'Activo');
  const noHayProveedores = proveedoresActivos.length === 0;
  // Al editar, si el proveedor ya asignado quedó inactivo mientras tanto,
  // lo seguimos mostrando en la lista para no perder la selección actual.
  const proveedorActualInactivo = isEditing && form.proveedorId && !proveedoresActivos.some(p => String(p.id) === String(form.proveedorId))
    ? proveedores.find(p => String(p.id) === String(form.proveedorId))
    : null;
  const opcionesProveedor = proveedorActualInactivo ? [...proveedoresActivos, proveedorActualInactivo] : proveedoresActivos;

  return (
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="form-server-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {serverError}
        </div>
      )}

      <div className="form-grid">
        <div className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
          <label>Nombre del insumo <span className="req">*</span></label>
          <input type="text" name="nombre" value={form.nombre} onChange={handleChange} onBlur={handleBlur} placeholder="Ej: Café tostado fino" maxLength={CAMPO_MAX} />
          <div style={{fontSize:11,color:enElTope(form.nombre,CAMPO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombre,CAMPO_MAX)}</div>
          {errors.nombre
            ? <span className="err-msg">{errors.nombre}</span>
            : touched.nombre && form.nombre.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className={`fg ${errors.categoria ? 'fg-error' : ''}`}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Categoría <span className="req">*</span></span>
            {onManageCategorias && (
              <button type="button" onClick={onManageCategorias}
                style={{ background: 'none', border: 'none', color: 'var(--color-green,#4CAF50)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                Gestionar categorías
              </button>
            )}
          </label>
          {categoriasDisponibles.length === 0 ? (
            <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 12, color: '#C9A227', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>
                No hay categorías registradas. {onManageCategorias
                  ? <button type="button" onClick={onManageCategorias} style={{ display:'inline', background:'none',border:'none',padding:0,margin:0,color:'#C9A227',fontWeight:700,textDecoration:'underline',cursor:'pointer',font:'inherit' }}>Crea una primero en "Gestionar categorías"</button>
                  : 'Crea una primero en "Gestionar categorías" antes de registrar un insumo.'}
              </span>
            </div>
          ) : (
            <select name="categoria" value={form.categoriaId} onChange={handleCategoriaChange}>
              <option value="">-- Seleccionar --</option>
              {categoriasDisponibles.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {errors.categoria
            ? <span className="err-msg">{errors.categoria}</span>
            : touched.categoria && form.categoria && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className={`fg ${errors.unidadMedida ? 'fg-error' : ''}`}>
          <label>Unidad de medida <span className="req">*</span></label>
          {isEditing ? (
            <>
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {form.unidadMedida || '—'}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                La unidad de medida no se puede cambiar después de crear el insumo.
              </span>
            </>
          ) : (
            <>
              <select name="unidadMedida" value={form.unidadMedida} onChange={handleChange}>
                <option value="">-- Seleccionar --</option>
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Elige con cuidado: una vez registrado el insumo, esta unidad queda fija y no se podrá cambiar.
              </span>
            </>
          )}
          {errors.unidadMedida
            ? <span className="err-msg">{errors.unidadMedida}</span>
            : touched.unidadMedida && form.unidadMedida && <span className="ok-msg">✓ Válido</span>}
        </div>

        {form.unidadMedida === 'oz' && (
          <div className={`fg ${errors.tamanoOz ? 'fg-error' : ''}`}>
            <label>Tamaño del vaso (oz) <span className="req">*</span></label>
            <select
              value={tamanoOzEsOtro ? 'otro' : (form.tamanoOz !== '' ? String(form.tamanoOz) : '')}
              onChange={e => {
                const v = e.target.value;
                let newForm;
                if (v === 'otro') {
                  setTamanoOzEsOtro(true);
                  newForm = { ...form, tamanoOz: '' };
                } else {
                  setTamanoOzEsOtro(false);
                  newForm = { ...form, tamanoOz: v };
                }
                setForm(newForm);
                touchAndValidate('tamanoOz', newForm);
              }}
            >
              <option value="">-- Seleccionar --</option>
              {TAMANOS_OZ_PRESET.map(oz => <option key={oz} value={oz}>{oz} oz</option>)}
              <option value="otro">Otro...</option>
            </select>
            {tamanoOzEsOtro && (
              <input
                type="number" step="0.1" placeholder="Escribe el tamaño en oz" style={{ marginTop: 8 }}
                value={form.tamanoOz}
                onChange={e => {
                  const newForm = { ...form, tamanoOz: e.target.value };
                  setForm(newForm);
                  // Validación en tiempo real — antes solo se validaba al
                  // salir del campo (onBlur).
                  touchAndValidate('tamanoOz', newForm);
                }}
                onBlur={() => touchAndValidate('tamanoOz')}
              />
            )}
            {errors.tamanoOz
              ? <span className="err-msg">{errors.tamanoOz}</span>
              : touched.tamanoOz && form.tamanoOz !== '' && <span className="ok-msg">✓ Válido</span>}
          </div>
        )}

        <div className={`fg ${errors.proveedor ? 'fg-error' : ''}`}>
          <label>Proveedor <span className="req">*</span></label>
          {noHayProveedores ? (
            <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 12, color: '#C9A227', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>No hay proveedores disponibles (no hay ninguno registrado, o todos están inactivos). Ve a Gestión de Proveedores para registrar o activar uno antes de continuar.</span>
            </div>
          ) : (
            <select
              value={form.proveedorId}
              onChange={handleProveedorChange}
            >
              <option value="">-- Seleccionar proveedor --</option>
              {opcionesProveedor.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.estado !== 'Activo' ? ' (Inactivo)' : ''}</option>
              ))}
            </select>
          )}
          {errors.proveedor
            ? <span className="err-msg">{errors.proveedor}</span>
            : touched.proveedor && form.proveedor.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        {isEditing && (
          <div className="fg">
            <label>Stock actual</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              {form.stockActual} {form.unidadMedida}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              El stock actual solo aumenta al registrar una compra y disminuye al anularla.
            </span>
          </div>
        )}

        <div className={`fg ${errors.stockMinimo ? 'fg-error' : ''}`}>
          <label>Stock mínimo <span className="req">*</span></label>
          <input
            type="number" name="stockMinimo" value={form.stockMinimo}
            onChange={e => {
              const val = e.target.value;
              if (val !== '' && Number(val) < 1) return;
              handleChange(e);
            }}
            onBlur={handleBlur}
            placeholder="1" step="1"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Se mostrará alerta cuando el stock caiga por debajo de este valor
          </span>
          {errors.stockMinimo
            ? <span className="err-msg">{errors.stockMinimo}</span>
            : touched.stockMinimo && form.stockMinimo !== '' && <span className="ok-msg">✓ Válido</span>}
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

        {/* 2 — solo informativo (no toca stock ni costo): facilita
            encontrar este insumo al armar la sección "Toppings" de una
            ficha técnica. */}
        <div className="fg">
          <label>&nbsp;</label>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'10px 0' }}>
            <input type="checkbox" name="esTopping" checked={form.esTopping} onChange={handleChange}
              style={{ width:16, height:16, cursor:'pointer', accentColor:'#4CAF50' }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Este insumo se usa como topping</span>
          </label>
        </div>

        <div className="fg fg-full">
          <label>Descripción</label>
          <textarea name="descripcion" value={form.descripcion} onChange={handleChange}
            onBlur={() => setForm(prev => ({ ...prev, descripcion: prev.descripcion.trimEnd() }))}
            placeholder="Descripción breve del insumo..." rows={3} maxLength={DESCRIPCION_INSUMO_MAX} />
          <div style={{fontSize:11,color:enElTope(form.descripcion,DESCRIPCION_INSUMO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.descripcion,DESCRIPCION_INSUMO_MAX)}</div>
        </div>
      </div>

      <div className="form-footer">
        <button type="button" className="btn-form-cancel" onClick={onCancel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancelar
        </button>
        <button type="submit" className="btn-form-submit" disabled={noHayProveedores || categoriasDisponibles.length === 0 || Object.values(errors).some(Boolean)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isEditing
              ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
            }
          </svg>
          {isEditing ? 'Guardar cambios' : 'Registrar insumo'}
        </button>
      </div>
    </form>
  );
};

export default InsumoForm;