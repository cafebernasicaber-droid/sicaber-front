import React, { useState, useEffect, useRef } from 'react';
import insumosService from '../services/insumosService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import categoriasInsumosService from '../services/categoriasInsumosService';
import './InsumoForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';
import { TIPO_USO_OPCIONES, tiposUsoDe, tiposUsoPayload, permiteDecimales, errorCantidad, localesStockPayload, desglosePorLocal } from '../../../shared/constants/insumoTipos';

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
  // Cambio 4 — tipo de uso (selección múltiple, al menos uno). Mapean a
  // los flags es_insumo / es_adicion_sin_costo / es_topping del backend.
  // `esTopping` se mantiene además por compatibilidad con el código que
  // aún lo lee (ver tiposUsoPayload en shared/constants/insumoTipos.js).
  es_insumo: true,
  es_adicion_sin_costo: false,
  es_topping: false,
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

// Selector con buscador — mismo campo de siempre, pero con un input de
// texto que filtra las opciones en tiempo real. Mismo componente ya usado
// en el formulario de Compras, replicado acá para el selector de
// Proveedor de este formulario.
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

const InsumoForm = ({ initialData, onSubmit, onCancel, isEditing, serverError, onManageCategorias, locales = [], localActivoId }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // batch 3 item 3 — stock por local
  //  · CREATE: "Stock actual" arranca en 0; el enlace "¿Ya hay cantidad
  //    existente?" revela cantidad + a qué local corresponde (el resto en 0).
  //  · EDIT: una fila por local con su stock actual y su stock mínimo.
  const [stockInicialAbierto, setStockInicialAbierto] = useState(false);
  const [stockInicial, setStockInicial] = useState({ cantidad: '', localId: '' });
  const [localesStock, setLocalesStock] = useState([]);
  const setLocalRow = (idx, key, val) =>
    setLocalesStock(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  // batch 4 item 7 — en qué locales EXISTE el insumo (independiente del stock).
  //  · CREATE: "Todos los locales" por defecto, o elegir específicos.
  //  · EDIT: casillas por local, editable.
  const [todosLocales, setTodosLocales] = useState(true);
  const [localesActivos, setLocalesActivos] = useState([]); // ids (string)
  const toggleLocalActivo = (id) => {
    setTodosLocales(false);
    setLocalesActivos(prev => {
      const s = String(id);
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
      setErrors(e => ({ ...e, localesActivos: '' }));
      return next;
    });
  };
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
        ...tiposUsoDe(initialData),
      });
      setTamanoOzEsOtro(
        initialData.tamanoOz != null && initialData.tamanoOz !== '' && !TAMANOS_OZ_PRESET.includes(Number(initialData.tamanoOz))
      );
    }
  }, [initialData, isEditing]);

  // Grid de stock por local al editar: una fila por local ACTIVO, prefilada
  // desde el desglose insumo_local (0 / stock mínimo base si el insumo no
  // tiene fila en ese local). Se reconstruye si `locales` llega después.
  useEffect(() => {
    if (!isEditing || !initialData) return;
    const desg = initialData.desglose || desglosePorLocal(initialData);
    const minBase = initialData.stockMinimo != null && initialData.stockMinimo !== '' ? String(initialData.stockMinimo) : '0';
    setLocalesStock((locales || []).map(l => {
      const d = desg.find(x => String(x.localId) === String(l.id));
      return {
        localId: String(l.id),
        localNombre: l.nombre,
        stockActual: d ? String(d.stockActual) : '0',
        stockMinimo: d && d.stockMinimo != null ? String(d.stockMinimo) : minBase,
      };
    }));
  }, [locales, initialData, isEditing]);

  // Al crear: si el usuario ya eligió un local en las pestañas de la vista
  // (localActivoId distinto de 'todos'), lo proponemos como destino de la
  // cantidad inicial.
  useEffect(() => {
    if (!isEditing && localActivoId && localActivoId !== 'todos') {
      setStockInicial(s => (s.localId ? s : { ...s, localId: String(localActivoId) }));
    }
  }, [isEditing, localActivoId]);

  // batch 4 item 7 — locales donde el insumo está activo (edición).
  useEffect(() => {
    if (!isEditing || !initialData) return;
    const explicit =
      initialData.localesActivos || initialData.locales_activos ||
      initialData.localesIds || initialData.locales_ids || null;
    let ids;
    if (Array.isArray(explicit) && explicit.length) {
      ids = explicit.map(x => String(x.id ?? x));
    } else {
      // fallback: locales que tienen fila en el desglose
      const desg = initialData.desglose || desglosePorLocal(initialData);
      ids = desg.map(d => String(d.localId));
      if (!ids.length) ids = (locales || []).map(l => String(l.id)); // sin datos → todos
    }
    setLocalesActivos(ids);
    setTodosLocales(locales.length > 0 && ids.length === locales.length);
  }, [initialData, isEditing, locales]);

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
    if (!f.es_insumo && !f.es_adicion_sin_costo && !f.es_topping) errs.tipoUso = 'Marca al menos un tipo de uso';
    // batch 4 item 7 — en qué locales existe el insumo
    if ((locales || []).length > 0) {
      const elegidos = todosLocales ? locales.map(l => String(l.id)) : localesActivos;
      if (elegidos.length === 0) errs.localesActivos = 'Elige al menos un local (o "Todos los locales")';
    }
    // batch 3 item 3 — stock por local
    if (!isEditing) {
      const eMin = errorCantidad(f.stockMinimo, f.unidadMedida, { min: 1 });
      if (eMin) errs.stockMinimo = eMin === 'Requerido' ? 'El stock mínimo es obligatorio' : eMin.replace('Debe ser 1 o mayor', 'El stock mínimo debe ser 1 o mayor');
      if (stockInicialAbierto) {
        const eC = errorCantidad(stockInicial.cantidad, f.unidadMedida, { min: 0 });
        if (eC) errs.stockInicial = eC === 'Requerido' ? 'Escribe la cantidad existente' : eC;
        else if (!stockInicial.localId) errs.stockInicial = 'Elige a qué local corresponde esa cantidad';
      }
    } else {
      const filaMala = localesStock.some(r =>
        errorCantidad(r.stockActual, f.unidadMedida, { min: 0 }) ||
        errorCantidad(r.stockMinimo, f.unidadMedida, { min: 0 })
      );
      if (filaMala) errs.localesStock = 'Corrige los valores de stock por local';
    }
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

  // Cambio 4 — marca/desmarca un tipo de uso y revalida la regla de
  // "al menos uno" en vivo.
  const handleTipoUso = (key) => {
    const newForm = { ...form, [key]: !form[key] };
    setForm(newForm);
    touchAndValidate('tipoUso', newForm);
  };

  const handleProveedorChange = (e) => {
    const selectedId = e.target.value;
    const prov = proveedores.find(p => String(p.id) === String(selectedId));
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
    const dec = permiteDecimales(form.unidadMedida);
    const num = (v) => (dec ? Number(v) : Math.round(Number(v))) || 0;
    const payload = {
      ...form,
      tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
      ...tiposUsoPayload(form),
    };
    // batch 4 item 7 — locales donde existe el insumo
    const localesIds = (todosLocales ? (locales || []).map(l => String(l.id)) : localesActivos)
      .map(id => (isNaN(Number(id)) ? id : Number(id)));
    if (localesIds.length) {
      payload.locales_ids = localesIds;
      payload.localesIds = localesIds;
      payload.todos_locales = todosLocales;
    }
    if (!isEditing) {
      const min = dec ? Math.max(1, Number(form.stockMinimo) || 1) : Math.max(1, Math.round(Number(form.stockMinimo) || 1));
      payload.stockMinimo = min;
      payload.stock_minimo = min;
      if (stockInicialAbierto && stockInicial.localId) {
        payload.stockInicial = num(stockInicial.cantidad);
        payload.stock_inicial = payload.stockInicial;
        payload.localInicialId = stockInicial.localId;
        payload.local_inicial_id = stockInicial.localId;
      } else {
        payload.stockInicial = 0;
        payload.stock_inicial = 0;
      }
    } else {
      const filas = localesStock.map(r => ({ localId: r.localId, stockActual: num(r.stockActual), stockMinimo: num(r.stockMinimo) }));
      Object.assign(payload, localesStockPayload(filas));
      // valor representativo para cualquier lector antiguo del campo plano
      payload.stockMinimo = filas.length ? filas[0].stockMinimo : Number(form.stockMinimo) || 0;
    }
    onSubmit(payload);
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
            <BuscadorSelect
              value={form.proveedorId}
              options={opcionesProveedor.map(p => ({ value: p.id, label: `${p.nombre}${p.estado !== 'Activo' ? ' (Inactivo)' : ''}` }))}
              onChange={(id) => handleProveedorChange({ target: { value: id } })}
              placeholder="Buscar proveedor..."
              emptyMessage="Ningún proveedor coincide con esa búsqueda."
            />
          )}
          {errors.proveedor
            ? <span className="err-msg">{errors.proveedor}</span>
            : touched.proveedor && form.proveedor.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        {/* batch 4 item 7 — en qué locales EXISTE el insumo (no es el stock). */}
        {locales.length > 0 && (
          <div className={`fg fg-full ${errors.localesActivos ? 'fg-error' : ''}`}>
            <label>{isEditing ? 'Locales donde está activo el insumo' : '¿En qué locales existe este insumo?'} <span className="req">*</span></label>
            {!isEditing && (
              <div style={{ display:'flex', gap:8, marginTop:4, marginBottom:8, flexWrap:'wrap' }}>
                <button type="button" onClick={() => { setTodosLocales(true); setLocalesActivos(locales.map(l => String(l.id))); setErrors(e => ({ ...e, localesActivos:'' })); }}
                  style={{ padding:'7px 14px', borderRadius:20, border:`1.5px solid ${todosLocales ? '#4CAF50' : 'var(--border-input)'}`, background: todosLocales ? 'rgba(76,175,80,0.12)' : 'transparent', color: todosLocales ? '#2E7D32' : 'var(--text-secondary)', fontWeight:700, fontSize:12.5, cursor:'pointer' }}>
                  Todos los locales
                </button>
                <button type="button" onClick={() => setTodosLocales(false)}
                  style={{ padding:'7px 14px', borderRadius:20, border:`1.5px solid ${!todosLocales ? '#4CAF50' : 'var(--border-input)'}`, background: !todosLocales ? 'rgba(76,175,80,0.12)' : 'transparent', color: !todosLocales ? '#2E7D32' : 'var(--text-secondary)', fontWeight:700, fontSize:12.5, cursor:'pointer' }}>
                  Locales específicos
                </button>
              </div>
            )}
            {(isEditing || !todosLocales) && (
              // batch 6 item 4 — grilla (no una sola fila): se acomoda en
              // columnas cuando hay muchos locales, sin desbordar.
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:8, marginTop:4 }}>
                {locales.map(l => {
                  const checked = todosLocales || localesActivos.includes(String(l.id));
                  return (
                    <label key={l.id} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 12px', borderRadius:10, cursor:'pointer', minWidth:0, border:`1.5px solid ${checked ? '#4CAF50' : 'var(--border-input)'}`, background: checked ? 'rgba(76,175,80,0.10)' : 'var(--bg-surface)' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleLocalActivo(l.id)}
                        style={{ width:15, height:15, flexShrink:0, accentColor:'#4CAF50', cursor:'pointer' }}/>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.nombre}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
              Este selector solo define en qué locales <strong>existe</strong> el insumo. El stock real se suma después desde <strong>Registrar Compra</strong>, según el local que se elija allí.
            </span>
            {errors.localesActivos && <span className="err-msg">{errors.localesActivos}</span>}
          </div>
        )}

        {/* batch 3 item 3 — Stock actual + Stock mínimo. Por local. */}
        {!isEditing ? (
          <>
            <div className={`fg ${errors.stockMinimo ? 'fg-error' : ''}`}>
              <label>Stock mínimo <span className="req">*</span></label>
              <input
                type="number" name="stockMinimo" value={form.stockMinimo}
                step={permiteDecimales(form.unidadMedida) ? 'any' : '1'}
                onChange={e => { const nf = { ...form, stockMinimo: e.target.value }; setForm(nf); touchAndValidate('stockMinimo', nf); }}
                onBlur={handleBlur}
                placeholder={permiteDecimales(form.unidadMedida) ? 'Ej: 2.5' : '1'}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Se aplica a todos los locales al crear; luego se ajusta por local al editar.
                {form.unidadMedida && !permiteDecimales(form.unidadMedida) && ' La unidad "unidad" solo admite enteros.'}
              </span>
              {errors.stockMinimo
                ? <span className="err-msg">{errors.stockMinimo}</span>
                : touched.stockMinimo && form.stockMinimo !== '' && <span className="ok-msg">✓ Válido</span>}
            </div>

            <div className={`fg ${errors.stockInicial ? 'fg-error' : ''}`}>
              <label>Stock actual</label>
              {!stockInicialAbierto ? (
                <>
                  <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    0 {form.unidadMedida}
                  </div>
                  <button type="button" onClick={() => setStockInicialAbierto(true)}
                    style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--color-green,#4CAF50)', fontSize: 12.5, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
                    ¿Ya hay cantidad existente?
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="number" step={permiteDecimales(form.unidadMedida) ? 'any' : '1'}
                    placeholder={`Cantidad existente (${form.unidadMedida || 'unidad'})`}
                    value={stockInicial.cantidad}
                    onChange={e => { setStockInicial(s => ({ ...s, cantidad: e.target.value })); setErrors(prev => ({ ...prev, stockInicial: '' })); }}
                  />
                  <select value={stockInicial.localId}
                    onChange={e => { setStockInicial(s => ({ ...s, localId: e.target.value })); setErrors(prev => ({ ...prev, stockInicial: '' })); }}>
                    <option value="">— ¿A qué local corresponde? —</option>
                    {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Solo este local recibe la cantidad inicial; el resto de locales queda en 0.
                  </span>
                  <button type="button" onClick={() => { setStockInicialAbierto(false); setStockInicial({ cantidad: '', localId: '' }); setErrors(prev => ({ ...prev, stockInicial: '' })); }}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                    Cancelar — dejar todo en 0
                  </button>
                </div>
              )}
              {errors.stockInicial && <span className="err-msg">{errors.stockInicial}</span>}
            </div>
          </>
        ) : (
          <div className={`fg fg-full ${errors.localesStock ? 'fg-error' : ''}`}>
            <label>Stock por local</label>
            {locales.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No hay locales activos registrados.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) 1fr 1fr', gap: '6px 10px', alignItems: 'start' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Local</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stock actual</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stock mínimo</div>
                {localesStock.map((row, idx) => {
                  const eA = errorCantidad(row.stockActual, form.unidadMedida, { min: 0 });
                  const eM = errorCantidad(row.stockMinimo, form.unidadMedida, { min: 0 });
                  const stepAttr = permiteDecimales(form.unidadMedida) ? 'any' : '1';
                  return (
                    <React.Fragment key={row.localId}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', paddingTop: 9 }}>{row.localNombre}</div>
                      <div>
                        <input type="number" step={stepAttr} value={row.stockActual}
                          onChange={e => setLocalRow(idx, 'stockActual', e.target.value)}
                          style={eA ? { borderColor: '#EF5350' } : undefined}/>
                        {eA && <div className="err-msg">{eA}</div>}
                      </div>
                      <div>
                        <input type="number" step={stepAttr} value={row.stockMinimo}
                          onChange={e => setLocalRow(idx, 'stockMinimo', e.target.value)}
                          style={eM ? { borderColor: '#EF5350' } : undefined}/>
                        {eM && <div className="err-msg">{eM}</div>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
              El stock actual también cambia al registrar o anular compras.
              {form.unidadMedida && (permiteDecimales(form.unidadMedida)
                ? ` La unidad "${form.unidadMedida}" admite decimales.`
                : ' La unidad "unidad" solo admite enteros.')}
            </span>
            {errors.localesStock && <span className="err-msg">{errors.localesStock}</span>}
          </div>
        )}

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

        {/* Cambio 4 — Tipo de uso (selección múltiple: uno, dos o los tres).
            Mapea a es_insumo / es_adicion_sin_costo / es_topping. */}
        <div className={`fg fg-full ${errors.tipoUso ? 'fg-error' : ''}`}>
          <label>Tipo de uso <span className="req">*</span></label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:4 }}>
            {TIPO_USO_OPCIONES.map(op => {
              const checked = !!form[op.key];
              return (
                <label key={op.key}
                  style={{
                    display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer',
                    padding:'10px 12px', borderRadius:10, flex:'1 1 180px',
                    border:`1.5px solid ${checked ? '#4CAF50' : 'var(--border-input)'}`,
                    background: checked ? 'rgba(76,175,80,0.10)' : 'var(--bg-surface)',
                    transition:'all .15s',
                  }}>
                  <input type="checkbox" checked={checked} onChange={() => handleTipoUso(op.key)}
                    style={{ width:16, height:16, marginTop:1, cursor:'pointer', accentColor:'#4CAF50' }}/>
                  <span>
                    <span style={{ display:'block', fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{op.label}</span>
                    <span style={{ display:'block', fontSize:11.5, color:'var(--text-muted)', marginTop:2 }}>{op.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.tipoUso
            ? <span className="err-msg">{errors.tipoUso}</span>
            : (touched.tipoUso && <span className="ok-msg">✓ Válido</span>)}
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