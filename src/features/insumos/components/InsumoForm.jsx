import React, { useState, useEffect, useRef } from 'react';
import insumosService from '../services/insumosService';
import categoriasInsumosService from '../services/categoriasInsumosService';
import localesService from '../../../shared/services/localesService';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { normalizarComparacion } from '../../../shared/utils/textFormat';
import './InsumoForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_FORM = {
  nombre: '',
  categoria: '',
  categoriaId: '',
  unidadMedida: '',
  stockActual: '',
  stockMinimo: '',
  descripcion: '',
  estado: 'Activo',
  tamanoOz: '',
  // Solo lo usa el selector manual de local del superadmin (sin local_id
  // fijo). Para todos los demás usuarios queda vacío y el backend asigna el
  // local desde el JWT.
  localId: '',
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

// ── "Stock actual" al crear (stock inicial) ─────────────────────────────
// Mismo criterio ya usado en Compras: entero sin decimales si la unidad de
// medida es "unidad" (como "Cantidad de presentaciones"); con hasta 2
// decimales para cualquier otra unidad (como "Contenido por presentación").
// Nunca negativo — el filtro de escritura ya lo impide (solo deja dígitos
// y el punto decimal). `esEntero` se pasa explícito (no se lee de un
// closure) para poder refiltrar correctamente el valor ya escrito justo
// en el momento en que la unidad de medida CAMBIA, antes de que el nuevo
// valor de `form.unidadMedida` termine de aplicarse.
const STOCK_INICIAL_MAX = 999999.99;
const filtrarStockInicial = (valor, esEntero) => {
  let v = valor.replace(/[^0-9.]/g, '');
  if (esEntero) {
    v = v.replace(/\./g, '');
  } else {
    const partes = v.split('.');
    if (partes.length > 2) v = partes[0] + '.' + partes.slice(1).join('');
    const [entero, decimales] = v.split('.');
    v = decimales !== undefined ? `${entero}.${decimales.slice(0, 2)}` : v;
  }
  if (v !== '' && v !== '.' && Number(v) > STOCK_INICIAL_MAX) v = String(STOCK_INICIAL_MAX);
  return v;
};

// Selector con buscador — mismo campo de siempre, pero con un input de
// texto que filtra las opciones en tiempo real. Mismo componente ya usado
// en el formulario de Compras, replicado acá para el selector de
// Categoría de este formulario.
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

const InsumoForm = ({ initialData, onSubmit, onCancel, isEditing, serverError, onManageCategorias, insumosExistentes = [] }) => {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // Qué campos ya tocó el usuario (onChange en selects/checkbox, onBlur en
  // texto) — solo esos muestran el check de válido; el mensaje de error, en
  // cambio, se muestra apenas exista (incluido al enviar, para campos que
  // el usuario nunca llegó a tocar).
  const [touched, setTouched] = useState({});
  const [tamanoOzEsOtro, setTamanoOzEsOtro] = useState(false);
  // Stock inicial (solo al CREAR) — colapsado por defecto: mientras no se
  // haga clic en "¿Ya hay cantidad existente?", el campo no existe en el
  // formulario y el insumo se crea en 0, exactamente como funcionaba antes
  // de este cambio. Este estado nunca se lee ni se muestra en modo edición
  // (ver el bloque `isEditing ? ... : ...` del campo "Stock actual" más
  // abajo) — es la garantía de que esta función es exclusiva de creación.
  const [mostrarStockInicial, setMostrarStockInicial] = useState(false);
  // Refs para el autoscroll/foco al primer campo con error al enviar —
  // en el mismo orden visual en que aparecen en el formulario.
  const nombreRef = useRef();
  const localRef = useRef();
  const categoriaRef = useRef();
  const unidadRef = useRef();
  const tamanoOzRef = useRef();
  const stockMinimoRef = useRef();

  useEffect(() => {
    if (initialData) {
      setForm({
        nombre:       initialData.nombre       || '',
        categoria:    initialData.categoria    || '',
        categoriaId:  initialData.categoriaId  || '',
        unidadMedida: initialData.unidadMedida || '',
        stockActual:  initialData.stockActual  ?? 0,
        stockMinimo:  initialData.stockMinimo  ?? '',
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

  // El local NO se elige a mano: el backend lo asigna solo, según el local
  // de trabajo del usuario autenticado (usuarios.local_id, que viaja en el
  // JWT). Aquí solo se muestra como dato fijo para que el usuario sepa
  // dónde va a quedar el insumo. Al editar, se muestra el local YA guardado
  // del insumo (initialData.localNombre) y tampoco se puede cambiar.
  const [locales, setLocales] = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);

  // El superadmin (o un administrador) SIN local_id fijo elige el local a
  // mano con un selector. Cualquier otro usuario con local_id asignado
  // mantiene el campo de solo lectura.
  const puedeElegirLocal = !isEditing && (user?.localId == null) && (user?.esSuperadmin || user?.esAdmin);

  const localActual = isEditing
    ? { id: initialData?.localId ?? null, nombre: initialData?.localNombre || '' }
    : puedeElegirLocal
      ? (() => {
          const sel = locales.find(l => String(l.id) === String(form.localId));
          return { id: form.localId || null, nombre: sel?.nombre || '' };
        })()
      : (() => {
          const porId = user?.localId != null
            ? locales.find(l => String(l.id) === String(user.localId))
            : null;
          return { id: user?.localId ?? null, nombre: porId?.nombre || (user?.sede && user.sede !== 'Ambos' ? user.sede : '') };
        })();
  // Aviso "sin local asignado" solo para usuarios que NO pueden elegirlo
  // (un cajero/bartender sin local — que sí debe pedirle a un admin).
  const sinLocalAsignado = !isEditing && !puedeElegirLocal && !localActual.nombre && (user?.localId == null);

  // Acepta un snapshot de formulario explícito (f) para poder validar el
  // valor que se ACABA de escribir/seleccionar antes de que termine de
  // aplicarse el setForm — así la validación en tiempo real siempre mira
  // el valor real, no el de un render atrás.
  // Duplicado = mismo nombre normalizado Y mismo local. El mismo nombre en
  // OTRO local es válido (cada local tiene su propio insumo, con su propio
  // stock) — coherente con la unicidad por local del backend. Se compara
  // contra la lista de insumos ya cargada (insumosExistentes), en vivo.
  const existeInsumoDuplicado = (nombre, f = form) => {
    const norm = normalizarComparacion(nombre);
    if (!norm) return false;
    const idActual = initialData?.id;
    // Con selector manual, el local a comparar es el que está elegido en el
    // snapshot `f` (no el de un render atrás).
    const localId = puedeElegirLocal ? (f.localId || null) : localActual.id;
    const localNombreNorm = normalizarComparacion(
      puedeElegirLocal ? (locales.find(l => String(l.id) === String(f.localId))?.nombre || '') : localActual.nombre
    );
    return insumosExistentes.some(i => {
      if (idActual != null && String(i.id) === String(idActual)) return false;
      if (normalizarComparacion(i.nombre) !== norm) return false;
      if (localId != null && i.localId != null) return String(i.localId) === String(localId);
      return !!localNombreNorm && normalizarComparacion(i.localNombre) === localNombreNorm;
    });
  };

  const validate = (f = form) => {
    const errs = {};
    if (!f.nombre.trim())      errs.nombre       = 'El nombre es obligatorio';
    else if (existeInsumoDuplicado(f.nombre, f)) errs.nombre = 'Ya existe un insumo con ese nombre en este local';
    if (!f.categoria)          errs.categoria    = 'Selecciona una categoría';
    if (f.unidadMedida === 'oz' && (f.tamanoOz === '' || isNaN(f.tamanoOz) || Number(f.tamanoOz) <= 0)) {
      errs.tamanoOz = 'Selecciona o escribe el tamaño del vaso';
    }
    if (!f.unidadMedida)       errs.unidadMedida = 'Selecciona una unidad de medida';
    if (puedeElegirLocal && !f.localId) errs.localId = 'Selecciona el local en el que se registrará el insumo';
    if (f.stockMinimo === '' || isNaN(f.stockMinimo) || Number(f.stockMinimo) < 1) errs.stockMinimo = 'El stock mínimo debe ser 1 o mayor';
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
    let newForm = { ...form, [name]: type === 'checkbox' ? checked : v };
    // Si cambia la Unidad de medida y ya había algo escrito en "Stock
    // actual" (stock inicial), se refiltra contra la nueva regla —
    // entero si la nueva unidad es "unidad", con hasta 2 decimales para
    // cualquier otra. Evita que quede, por ejemplo, "5.5" guardado bajo
    // una unidad que ya no admite decimales.
    if (name === 'unidadMedida' && newForm.stockActual !== '') {
      newForm = { ...newForm, stockActual: filtrarStockInicial(String(newForm.stockActual), v === 'unidad') };
    }
    setForm(newForm);
    // Validación no agresiva: la primera interacción con un campo (onChange)
    // NUNCA introduce una alerta nueva — solo revalida en vivo si el campo
    // YA tiene un error visible (para limpiarlo tan pronto el valor quede
    // correcto). La alerta nueva solo aparece al salir del campo (onBlur)
    // o al enviar el formulario.
    if (errors[name]) touchAndValidate(name, newForm);
  };

  // onBlur genérico — ya no es el único momento en que se valida (ver
  // handleChange arriba), pero se deja como respaldo silencioso.
  const handleBlur = (e) => touchAndValidate(e.target.name);

  const handleCategoriaChange = (selectedId) => {
    const cat = categoriasDisponibles.find(c => String(c.id) === String(selectedId));
    const nombreCat = cat ? cat.nombre : '';
    const newForm = { ...form, categoriaId: selectedId, categoria: nombreCat };
    setForm(newForm);
    touchAndValidate('categoria', newForm);
  };

  // Selector manual de local (solo superadmin/admin sin local fijo).
  const handleLocalChange = (e) => {
    const newForm = { ...form, localId: e.target.value };
    setForm(newForm);
    touchAndValidate('localId', newForm);
    // El nombre duplicado se evalúa por local — al cambiar de local hay que
    // revalidarlo también.
    if (touched.nombre) touchAndValidate('nombre', newForm);
  };

  // Cambio del campo "Stock actual" (stock inicial) — solo existe cuando
  // mostrarStockInicial es true, y eso solo puede pasar en creación.
  const esUnidadEntera = form.unidadMedida === 'unidad';
  const handleStockInicialChange = (e) => {
    const v = filtrarStockInicial(e.target.value, esUnidadEntera);
    setForm(prev => ({ ...prev, stockActual: v }));
  };
  const quitarStockInicial = () => {
    setMostrarStockInicial(false);
    setForm(prev => ({ ...prev, stockActual: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Marca TODOS los campos como tocados al enviar — así se disparan
      // las alertas de los campos obligatorios que el usuario nunca llegó
      // a tocar (antes solo se marcaban los que ya habían pasado por
      // onChange/onBlur; un campo intacto podía quedar inválido pero sin
      // mensaje visible hasta que el usuario lo tocara por su cuenta).
      setTouched(prev => ({ ...prev, ...Object.fromEntries(Object.keys(errs).map(k => [k, true])) }));
      setTimeout(() => {
        if (errs.nombre) nombreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.localId) localRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.categoria) categoriaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.unidadMedida) unidadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.tamanoOz) tamanoOzRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.stockMinimo) stockMinimoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    onSubmit({
      ...form,
      stockMinimo: Math.max(1, parseInt(form.stockMinimo, 10) || 1),
      // Stock inicial — exclusivo de creación. Si no se usó el enlace
      // "¿Ya hay cantidad existente?" (mostrarStockInicial=false), se
      // envía 0 exactamente como ya funcionaba antes de este cambio. Al
      // editar, el campo nunca se muestra (ver isEditing más abajo en el
      // JSX): form.stockActual sigue siendo el valor ya guardado del
      // insumo, de solo lectura, y se envía tal cual sin tocar.
      stockActual: isEditing
        ? form.stockActual
        : (mostrarStockInicial && form.stockActual !== '' ? Number(form.stockActual) : 0),
      tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
      // Solo el superadmin sin local fijo manda local_id (snake_case, que es
      // lo que lee POST /insumos). El resto no lo envía: el backend lo toma
      // del JWT. Al editar nunca se envía (el local es inmutable).
      ...(puedeElegirLocal && form.localId ? { local_id: Number(form.localId) } : {}),
    });
  };

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
        <div ref={nombreRef} className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
          <label>Nombre del insumo <span className="req">*</span></label>
          <input type="text" name="nombre" value={form.nombre} onChange={handleChange} onBlur={handleBlur} placeholder="Ej: Café tostado fino" maxLength={CAMPO_MAX} />
          <div style={{fontSize:11,color:enElTope(form.nombre,CAMPO_MAX)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.nombre,CAMPO_MAX)}</div>
          {errors.nombre
            ? <span className="err-msg">{errors.nombre}</span>
            : touched.nombre && form.nombre.trim() && <span className="ok-msg">✓ Válido</span>}
        </div>

        {/* Local. Al editar: dato fijo (inmutable). Al crear: el superadmin/
            admin sin local_id fijo lo ELIGE con un selector; cualquier otro
            usuario lo ve fijo (asignado por el backend según su local de
            trabajo). */}
        <div ref={localRef} className={`fg ${errors.localId ? 'fg-error' : ''}`}>
          <label>Local {!isEditing && <span className="req">*</span>}</label>
          {(!isEditing && puedeElegirLocal) ? (
            <>
              {locales.length === 0 ? (
                <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 12, color: '#C9A227' }}>
                  No hay locales activos registrados. Crea uno en Gestión de Empleados → Locales.
                </div>
              ) : (
                <select name="localId" value={form.localId} onChange={handleLocalChange}>
                  <option value="">-- Seleccionar local --</option>
                  {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Tu usuario no tiene un local fijo asignado: elige en cuál se registrará este insumo. Una vez creado, no se podrá cambiar.
              </span>
              {errors.localId
                ? <span className="err-msg">{errors.localId}</span>
                : touched.localId && form.localId && <span className="ok-msg">✓ Válido</span>}
            </>
          ) : isEditing ? (
            <>
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {localActual.nombre || '—'}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                El local no se puede cambiar después de crear el insumo.
              </span>
            </>
          ) : sinLocalAsignado ? (
            <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 12, color: '#C9A227', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Tu usuario no tiene un local de trabajo asignado. Pide a un administrador que te asigne uno antes de registrar insumos.</span>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 14px', background: 'rgba(76,175,80,0.10)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: '#4CAF50' }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Se registrará en: <strong>{localActual.nombre}</strong>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                El local se asigna automáticamente según tu local de trabajo y no se puede cambiar.
              </span>
            </>
          )}
        </div>

        <div ref={categoriaRef} className={`fg ${errors.categoria ? 'fg-error' : ''}`}>
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
            <BuscadorSelect
              value={form.categoriaId}
              options={categoriasDisponibles.map(c => ({ value: c.id, label: c.nombre }))}
              onChange={handleCategoriaChange}
              placeholder="Buscar categoría..."
              emptyMessage="Ninguna categoría coincide con esa búsqueda."
            />
          )}
          {errors.categoria
            ? <span className="err-msg">{errors.categoria}</span>
            : touched.categoria && form.categoria && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={unidadRef} className={`fg ${errors.unidadMedida ? 'fg-error' : ''}`}>
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
          <div ref={tamanoOzRef} className={`fg ${errors.tamanoOz ? 'fg-error' : ''}`}>
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

        {/* "Stock actual" — al EDITAR es un dato fijo de solo lectura, tal
            como ya funcionaba. Al CREAR, en su lugar aparece el enlace
            "¿Ya hay cantidad existente?" y, si se hace clic, el campo para
            digitar el stock inicial — función exclusiva de creación, sin
            ninguna forma de acceder a ella después (ver el `isEditing ?`
            de abajo: la rama de creación vive ÍNTEGRAMENTE en el `else`). */}
        {isEditing ? (
          <div className="fg">
            <label>Stock actual</label>
            <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              {form.stockActual} {form.unidadMedida}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              El stock actual solo aumenta al registrar una compra y disminuye al anularla.
            </span>
          </div>
        ) : (
          <div className="fg">
            {!mostrarStockInicial ? (
              <>
                <label>&nbsp;</label>
                <button
                  type="button"
                  onClick={() => setMostrarStockInicial(true)}
                  style={{ background: 'none', border: '1.5px dashed var(--border-input)', borderRadius: 8, padding: '10px 14px', color: 'var(--color-green,#4CAF50)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  + ¿Ya hay cantidad existente?
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Úsalo solo si ya tienes existencias físicas de este insumo al momento de registrarlo. Si no, se crea en 0 (como siempre) y solo sube con compras.
                </span>
              </>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>Stock actual (inicial)</span>
                  <button type="button" onClick={quitarStockInicial}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    Quitar
                  </button>
                </label>
                <input
                  type="number"
                  step={esUnidadEntera ? '1' : '0.01'}
                  placeholder={esUnidadEntera ? 'Ej: 25' : 'Ej: 12.5'}
                  value={form.stockActual}
                  onChange={handleStockInicialChange}
                  onKeyDown={e => {
                    if (esUnidadEntera && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    else if (!esUnidadEntera && ['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  autoFocus
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Cantidad que ya existe físicamente de este insumo — se usará como stock inicial en vez de 0. Solo disponible en este momento; no podrás volver a ajustarlo aquí después de crear el insumo (usa Compras para sumar stock más adelante).
                </span>
              </>
            )}
          </div>
        )}

        <div ref={stockMinimoRef} className={`fg ${errors.stockMinimo ? 'fg-error' : ''}`}>
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
        <button type="submit" className="btn-form-submit" disabled={categoriasDisponibles.length === 0 || Object.values(errors).some(Boolean)}>
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