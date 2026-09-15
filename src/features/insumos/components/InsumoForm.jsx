import React, { useState, useEffect, useRef } from 'react';
import insumosService from '../services/insumosService';
import categoriasInsumosService from '../services/categoriasInsumosService';
import SearchSelect from '../../../shared/components/SearchSelect';
import './InsumoForm.css';
import { contador, enElTope } from '../../../shared/utils/limitesTexto';
import { permiteDecimales, errorCantidad, desglosePorLocal } from '../../../shared/constants/insumoTipos';
import { construirPayloadInsumo } from './construirPayloadInsumo';

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
  // batch 8 item 3 — la opción de "tipo de uso" (topping / adición) se
  // eliminó del insumo. Esa configuración vive ahora en los módulos de
  // Toppings y Adiciones (insumo + cantidad por uso).
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

const InsumoForm = ({ initialData, onSubmit, onCancel, isEditing, serverError, onManageCategorias, locales = [], localActivoId }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  // batch 3 item 3 — stock por local
  //  · CREATE: "Stock actual" arranca en 0; el enlace "¿Ya hay cantidad
  //    existente?" revela cantidad + a qué local corresponde (el resto en 0).
  //  · EDIT: ver `localEdicion` más abajo — Cambio 1 lo reemplazó por un
  //    único local (el activo), no una fila por cada uno.
  const [stockInicialAbierto, setStockInicialAbierto] = useState(false);
  const [stockInicial, setStockInicial] = useState({ cantidad: '' });
  // batch 10 — CREAR: un insumo se registra para UN SOLO local de partida.
  // Ya no hay "Todos los locales" ni multi-select al crear. Ese mismo
  // local recibe el stock inicial (si lo hay).
  const [localCreacion, setLocalCreacion] = useState('');
  // Cambio 1 (edición por local) — ANTES este formulario editaba los 4
  // locales a la vez desde cualquier pestaña (casillas "dónde está activo"
  // + una tabla de stock con una fila por local): estando en Villa Liliam
  // se podía, sin querer, cambiar el mínimo o desactivar el insumo en 3
  // Esquinas. `localEdicion` es el ÚNICO estado editable ahora: los datos
  // (activo/stock actual/stock mínimo) de ESE local — el que ya está
  // "quemado" por la pestaña activa del listado (`localActivoId`), igual
  // que ya pasaba al CREAR. Los otros locales ni se leen ni se muestran.
  const [localEdicion, setLocalEdicion] = useState({ activo: true, stockActual: '0', stockMinimo: '' });
  // Local de partida por defecto = la pestaña de local activa en el listado.
  useEffect(() => {
    if (isEditing) return;
    if (localActivoId != null && localActivoId !== '' && localActivoId !== 'todos') {
      setLocalCreacion(String(localActivoId));
    }
  }, [localActivoId, isEditing]);
  // Qué campos ya tocó el usuario (onChange en selects/checkbox, onBlur en
  // texto) — solo esos muestran el check de válido; el mensaje de error, en
  // cambio, se muestra apenas exista (incluido al enviar, para campos que
  // el usuario nunca llegó a tocar).
  const [touched, setTouched] = useState({});
  const [tamanoOzEsOtro, setTamanoOzEsOtro] = useState(false);
  // Guarda contra envíos repetidos mientras la petición está en curso
  // (en la consola se veían 8 POST seguidos con 400 por clics repetidos).
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // Para llevar el aviso de error del servidor a la vista: aparece arriba
  // del formulario y el botón de guardar está abajo, así que sin esto el
  // usuario no lo veía y volvía a hacer clic.
  const serverErrorRef = useRef(null);
  useEffect(() => {
    if (serverError && serverErrorRef.current) {
      serverErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [serverError]);

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
      });
      setTamanoOzEsOtro(
        initialData.tamanoOz != null && initialData.tamanoOz !== '' && !TAMANOS_OZ_PRESET.includes(Number(initialData.tamanoOz))
      );
    }
  }, [initialData, isEditing]);

  // batch 10 — al CREAR, la cantidad inicial entra al único local de
  // partida (`localCreacion`): ya no hay un segundo selector "¿a qué
  // local va la cantidad?" porque no hay ambigüedad posible.
  const nombreLocalCreacion =
    (locales.find(l => String(l.id) === String(localCreacion)) || {}).nombre || '';

  // Cambio 1 — al EDITAR, se lee SOLO la fila del desglose que corresponde
  // a `localActivoId` (la pestaña de local activa en el listado — la misma
  // fuente que ya usaba CREAR más arriba). Antes esto construía una fila
  // por CADA local de `locales`; ahora ni siquiera se recorre esa lista.
  // Todo insumo tiene fila en insumo_local para todos los locales desde
  // que se crea (backend: siembra al crear + backfill al arrancar), así
  // que no hacía falta un valor por defecto "sin fila" distinto de 0.
  const nombreLocalEdicion =
    (locales.find(l => String(l.id) === String(localActivoId)) || {}).nombre || '';
  useEffect(() => {
    if (!isEditing || !initialData || localActivoId == null || localActivoId === '') return;
    const desg = initialData.desglose || desglosePorLocal(initialData);
    const fila = desg.find(d => String(d.localId) === String(localActivoId));
    setLocalEdicion({
      activo: fila ? fila.activo !== false : true,
      stockActual: fila ? String(fila.stockActual) : '0',
      stockMinimo: fila && fila.stockMinimo != null ? String(fila.stockMinimo) : '0',
    });
  }, [initialData, isEditing, localActivoId]);

  // Solo unidades de medida reales del insumo. "Caja", "paquete", "bolsa" y
  // "docena" NO son unidades de medida — son presentaciones de compra (cómo
  // lo empaca el proveedor), y se manejan aparte en el formulario de
  // Registrar Compra ("Comprar por presentación"), nunca aquí.
  const unidades    = ['kg', 'g', 'lb', 'oz', 'L', 'mL', 'unidad'];
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [categoriasLoading, setCategoriasLoading] = useState(true);
  useEffect(() => {
    categoriasInsumosService.getAll()
      .then(d => setCategoriasDisponibles(Array.isArray(d) ? d.filter(c => c.estado === 'Activo') : []))
      .catch(() => setCategoriasDisponibles([]))
      .finally(() => setCategoriasLoading(false));
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
    // batch 7 item 2 — el proveedor ya no forma parte del insumo.
    // batch 8 item 3 — el tipo de uso (topping/adición) ya no vive aquí.
    // batch 10 — al CREAR: un solo local de partida, obligatorio.
    // Cambio 1 — al EDITAR ya no se "elige" ningún local (antes había que
    // marcar al menos uno de la lista completa): el local viene fijo de la
    // pestaña activa del listado. Si por lo que sea no llega ninguno
    // (imposible hoy con la navegación normal — confirmado con el usuario
    // que esto es solo una salvaguarda), se bloquea el guardado en vez de
    // adivinar a qué local aplicar los cambios.
    if ((locales || []).length > 0) {
      if (!isEditing) {
        if (!localCreacion) errs.localCreacion = 'Elige el local donde se registra este insumo';
      } else if (localActivoId == null || localActivoId === '') {
        errs.localActivo = 'Elige un local en la pestaña superior antes de editar este insumo.';
      }
    }
    // batch 3 item 3 — stock por local
    if (!isEditing) {
      const eMin = errorCantidad(f.stockMinimo, f.unidadMedida, { min: 1 });
      if (eMin) errs.stockMinimo = eMin === 'Requerido' ? 'El stock mínimo es obligatorio' : eMin.replace('Debe ser 1 o mayor', 'El stock mínimo debe ser 1 o mayor');
      // Stock inicial: solo se valida el FORMATO de la cantidad si el
      // panel está abierto y hay algo escrito. El local ya no se pide
      // aparte: es el local de partida elegido arriba.
      const cantEscrita = stockInicialAbierto && String(stockInicial.cantidad).trim() !== '';
      if (cantEscrita) {
        const eC = errorCantidad(stockInicial.cantidad, f.unidadMedida, { min: 0, obligatorio: false });
        if (eC) errs.stockInicial = eC;
      }
    } else if (localActivoId != null && localActivoId !== '') {
      // Cambio 1 — un solo campo que validar (el mínimo del local actual),
      // no una lista de filas.
      const eMinLocal = errorCantidad(localEdicion.stockMinimo, f.unidadMedida, { min: 0 });
      if (eMinLocal) errs.localEdicion = eMinLocal;
    }
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

  const handleCategoriaChange = (selectedId) => {
    const cat = categoriasDisponibles.find(c => String(c.id) === String(selectedId));
    const newForm = { ...form, categoriaId: String(selectedId), categoria: cat ? cat.nombre : '' };
    setForm(newForm);
    touchAndValidate('categoria', newForm);
  };

  // batch 7 item 3 — al abrir "¿Hay cantidad existente?" se autocompleta
  // Observaciones (descripcion) con un texto por defecto, SOLO si el
  // usuario todavía no escribió nada ahí (no se sobrescribe lo suyo).
  const OBS_CANTIDAD_EXISTENTE = 'Comenzó con cantidad existente';
  const abrirStockInicial = () => {
    setStockInicialAbierto(true);
    setForm(prev => prev.descripcion.trim()
      ? prev
      : { ...prev, descripcion: OBS_CANTIDAD_EXISTENTE });
  };
  const cerrarStockInicial = () => {
    setStockInicialAbierto(false);
    setStockInicial({ cantidad: '' });
    setErrors(prev => ({ ...prev, stockInicial: '' }));
    // Si la observación quedó exactamente con el texto autocompletado
    // (nunca lo editaron), se limpia al cancelar.
    setForm(prev => prev.descripcion.trim() === OBS_CANTIDAD_EXISTENTE
      ? { ...prev, descripcion: '' }
      : prev);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return; // envío en curso — ignora clics extra
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Lleva a la vista el primer campo con error (el botón de guardar
      // está al fondo del modal).
      requestAnimationFrame(() => {
        const first = document.querySelector('.insumo-form .fg-error, .insumo-form .err-msg');
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    // El payload se arma en una función PURA (construirPayloadInsumo):
    // así el body no depende de ninguna carrera de useEffect. Al CREAR,
    // `localCreacion` es el único local de partida (va tanto en
    // localesSeleccionados como en local_id).
    const payload = construirPayloadInsumo({
      form, isEditing, locales,
      localCreacionId: localCreacion,
      stockInicial: { cantidad: stockInicialAbierto ? stockInicial.cantidad : '' },
      // Cambio 1 — un solo local (el activo), no las 3 props de
      // multi-local que este formulario mandaba antes.
      localActivoId, localEdicion,
    });

    // Deja el payload EXACTO en consola para poder compararlo con lo que
    // espera la API (DevTools > Console). No expone datos sensibles.
    // eslint-disable-next-line no-console
    console.debug('[InsumoForm] POST /insumos payload →', JSON.parse(JSON.stringify(payload)));

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  // El backend a veces responde con mensajes en voseo, con jerga
  // ("campo local_id") o planteando el rol como una carencia ("como
  // Superadmin no tenés local fijo"). Se normalizan a la misma persona
  // verbal del resto del sistema y se les quita esa jerga/preámbulo —
  // pero el mensaje SIEMPRE se muestra: si el guardado falló, el usuario
  // tiene que enterarse.
  const humanizarMensaje = (msg = '') => {
    let m = (msg || '')
      .replace(/\s*\(\s*campo\s+[a-z_]+\s*\)/gi, '')
      .replace(/\bcampo\s+local_id\b/gi, 'local')
      .replace(/\blocal_id\b/gi, 'local')
      .replace(/\bno ten[eé]s\b/gi, 'no tienes')
      .replace(/\bten[eé]s\b/gi, 'tienes')
      .replace(/\bemp[ie]zá\b/gi, 'empieza')
      .replace(/\belegí\b/gi, 'elige')
      .replace(/\bseleccioná\b/gi, 'selecciona')
      .replace(/\bindicá\b/gi, 'indica')
      .replace(/\basigná\b/gi, 'asigna')
      .replace(/\bdeb[eé]s\b/gi, 'debes')
      .replace(/^\s*como\s+(super)?administrador[^:.]*?(no tienes un local fijo|sin local fijo)[^:.]*[:.]\s*/i, '')
      .replace(/^\s*(no tienes un local fijo|tu usuario no está asignado a un local fijo)[^:.]*[:.]\s*/i, '')
      .trim();
    if (m) m = m.charAt(0).toUpperCase() + m.slice(1);
    if (m && !/[.!?]$/.test(m)) m += '.';
    return m;
  };
  const serverErrorMsg = humanizarMensaje(serverError);

  return (
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="form-server-error" ref={serverErrorRef} role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {serverErrorMsg}
        </div>
      )}

      {/* Cambio 1 (edición de insumos por local) — el usuario pidió
          explícitamente que quedara claro qué cambia dónde: nombre,
          categoría y unidad de medida son del CATÁLOGO (un solo insumo,
          válido en los 4 locales — la unidad en particular no puede variar
          porque la ficha técnica que lo usa es igual de global), mientras
          que el stock y la disponibilidad (más abajo) son solo de un
          local. Un aviso arriba de todo, antes de que el usuario toque
          nada, en vez de 3 notas sueltas junto a cada campo. */}
      {isEditing && (
        <div className="insumo-alert insumo-alert--info insumo-alert--tight" style={{ marginBottom: 14 }}>
          <span className="insumo-alert__icon">ℹ</span>
          <span>
            <strong>Nombre, categoría y unidad de medida</strong> son del insumo completo — cambian en <strong>todos los locales</strong> a la vez.{' '}
            <strong>Stock y disponibilidad</strong> (más abajo) son solo de{' '}
            {localActivoId != null && localActivoId !== ''
              ? <strong>{(locales.find(l => String(l.id) === String(localActivoId)) || {}).nombre || 'este local'}</strong>
              : 'este local'}.
          </span>
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
            <div className="insumo-alert insumo-alert--warning insumo-alert--tight">
              <span className="insumo-alert__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <span>
                No hay categorías registradas. {onManageCategorias
                  ? <button type="button" onClick={onManageCategorias} className="insumo-alert__link">Crea una primero en "Gestionar categorías"</button>
                  : 'Crea una primero en "Gestionar categorías" antes de registrar un insumo.'}
              </span>
            </div>
          ) : (
            <SearchSelect
              value={form.categoriaId}
              options={categoriasDisponibles.map(c => ({ value: c.id, label: c.nombre }))}
              onChange={handleCategoriaChange}
              loading={categoriasLoading}
              placeholder="Buscar categoría…"
              emptyMessage="No hay categorías activas."
              hasError={!!errors.categoria}
            />
          )}
          {errors.categoria
            ? <span className="err-msg">{errors.categoria}</span>
            : touched.categoria && form.categoria && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div className={`fg ${errors.unidadMedida ? 'fg-error' : ''}`}>
          <label>Unidad de medida <span className="req">*</span></label>
          {isEditing ? (
            <>
              <div className="insumo-locked-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {form.unidadMedida || '—'}
              </div>
              <span className="insumo-locked-hint">
                La unidad de medida no se puede cambiar después de crear el insumo.
              </span>
            </>
          ) : (
            <>
              <select name="unidadMedida" value={form.unidadMedida} onChange={handleChange}>
                <option value="">-- Seleccionar --</option>
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <div className="insumo-alert insumo-alert--warning insumo-alert--tight">
                <span className="insumo-alert__icon">⚠</span>
                <span>Elige con cuidado: una vez registrado el insumo, esta unidad queda fija y no se podrá cambiar.</span>
              </div>
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

        {/* batch 7 item 2 — el campo Proveedor se eliminó del insumo. */}

        {/* batch 10 — CREAR: un insumo se registra para UN SOLO local de
            partida. Selector simple, obligatorio; ese local recibe el
            stock inicial (sin un segundo selector). */}
        {locales.length > 0 && !isEditing && (
          <div className={`fg fg-full ${errors.localCreacion ? 'fg-error' : ''}`}>
            <label>Local donde se registra el insumo <span className="req">*</span></label>
            <SearchSelect
              value={localCreacion}
              options={locales.map(l => ({ value: String(l.id), label: l.nombre }))}
              onChange={(id) => {
                setLocalCreacion(String(id));
                setTouched(t => ({ ...t, localCreacion: true }));
                setErrors(e => ({ ...e, localCreacion: '' }));
              }}
              placeholder="Buscar local…"
              emptyMessage="No hay locales activos."
              hasError={!!errors.localCreacion}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
              El insumo queda registrado en este local. El stock real entra después desde <strong>Registrar Compra</strong>. Podrás activarlo en otros locales cuando lo edites.
            </span>
            {errors.localCreacion
              ? <span className="err-msg">{errors.localCreacion}</span>
              : touched.localCreacion && localCreacion && <span className="ok-msg">✓ Válido</span>}
          </div>
        )}

        {/* Cambio 1 (edición de insumos por local) — ANTES esta sección era
            una fila de casillas con los 4 locales a la vez: estando en
            Villa Liliam se podía desmarcar/marcar 3 Esquinas sin querer, y
            además ese payload nunca llegaba a guardarse (PUT /insumos/:id
            nunca lo procesó — bug real, no una mejora cosmética). Ahora
            solo se MUESTRA el local actual (fijo, viene de la pestaña
            activa del listado — `localActivoId` — igual que ya pasaba al
            crear): no hay nada que elegir ni que desmarcar por error. */}
        {locales.length > 0 && isEditing && (
          <div className={`fg fg-full ${errors.localActivo ? 'fg-error' : ''}`}>
            <label>Local que estás editando <span className="req">*</span></label>
            {localActivoId == null || localActivoId === '' ? (
              <div className="insumo-alert insumo-alert--warning insumo-alert--tight">
                <span className="insumo-alert__icon">⚠</span>
                <span>Elige un local en la pestaña de arriba del listado antes de editar este insumo.</span>
              </div>
            ) : (
              <>
                <div className="insumo-locked-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9v.01M9 12v.01M9 15v.01M15 9v.01M15 12v.01M15 15v.01"/>
                  </svg>
                  {nombreLocalEdicion || '—'}
                </div>
                <span className="insumo-locked-hint">
                  El stock y la disponibilidad de abajo son SOLO de este local — para editar otro, cámbialo en la pestaña de arriba y vuelve a abrir "Editar". Nombre, categoría y unidad de medida (arriba) son del insumo completo y aplican a todos los locales por igual.
                </span>
              </>
            )}
            {errors.localActivo && <span className="err-msg">{errors.localActivo}</span>}
          </div>
        )}

        {/* batch 3 item 3 / batch 9.6 item 3 — bloque de Stock: el MÍNIMO es
            único para el insumo; el stock ACTUAL entra a un solo local. Los
            dos conceptos van en columnas separadas por un divisor para que
            no se lean como si hablaran de lo mismo. */}
        {!isEditing ? (
          <div className="stock-block">
            <div className="form-section-title" style={{ marginBottom: 0 }}>Stock</div>
            <div className="stock-block__intro">
              <span>· El <strong>stock mínimo</strong> es un único valor para el insumo — el nivel que dispara la alerta de "stock bajo".</span>
              <span>· El <strong>stock actual</strong> es <strong>por local</strong>: la cantidad inicial entra al local de partida{nombreLocalCreacion ? <> (<strong>{nombreLocalCreacion}</strong>)</> : ''} y los demás quedan en 0.</span>
            </div>

            <div className="stock-cols">
              <div className={`stock-col ${errors.stockMinimo ? 'fg fg-error' : 'fg'}`}>
                <label>Stock mínimo <span className="req">*</span></label>
                <input
                  type="number" name="stockMinimo" value={form.stockMinimo}
                  step={permiteDecimales(form.unidadMedida) ? 'any' : '1'}
                  onChange={e => { const nf = { ...form, stockMinimo: e.target.value }; setForm(nf); touchAndValidate('stockMinimo', nf); }}
                  onBlur={handleBlur}
                  placeholder={permiteDecimales(form.unidadMedida) ? 'Ej: 2.5' : '1'}
                />
                <span className="stock-help">
                  Igual para todos los locales. Podrás ajustarlo por local cuando edites el insumo.
                  {form.unidadMedida && !permiteDecimales(form.unidadMedida) && ' La unidad "unidad" solo admite enteros.'}
                </span>
                {errors.stockMinimo
                  ? <span className="err-msg">{errors.stockMinimo}</span>
                  : touched.stockMinimo && form.stockMinimo !== '' && <span className="ok-msg">✓ Válido</span>}
              </div>

              <div className={`stock-col stock-col--actual ${errors.stockInicial ? 'fg fg-error' : 'fg'}`}>
                <label>Stock actual <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(opcional)</span></label>
                {!stockInicialAbierto ? (
                  <>
                    <button type="button" onClick={abrirStockInicial}
                      style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px dashed var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--color-green,#4CAF50)', fontWeight:700, cursor: 'pointer' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      ¿Hay cantidad existente?
                    </button>
                    <span className="stock-help">
                      Si no, el insumo se crea con 0 en todos los locales.
                    </span>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="number" step={permiteDecimales(form.unidadMedida) ? 'any' : '1'}
                      placeholder={`Cantidad existente (${form.unidadMedida || 'unidad'})`}
                      value={stockInicial.cantidad}
                      onChange={e => { setStockInicial(s => ({ ...s, cantidad: e.target.value })); setErrors(prev => ({ ...prev, stockInicial: '' })); }}
                    />
                    {/* batch 10 — la cantidad inicial entra al local de
                        partida elegido arriba; ya no hay un segundo selector. */}
                    <div className={`stock-inicial-fijo${nombreLocalCreacion ? '' : ' stock-inicial-fijo--muted'}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>{nombreLocalCreacion
                        ? <>Entra a <strong>{nombreLocalCreacion}</strong>.</>
                        : <>Elige primero el local, arriba.</>}</span>
                    </div>
                    <span className="stock-help">
                      Solo ese local recibe la cantidad inicial; el resto queda en 0.
                    </span>
                    <button type="button" onClick={cerrarStockInicial}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                      Cancelar — dejar todo en 0
                    </button>
                  </div>
                )}
                {errors.stockInicial && <span className="err-msg">{errors.stockInicial}</span>}
              </div>
            </div>
          </div>
        ) : (
          // Cambio 1 — ANTES: tabla con una fila de stock actual/mínimo por
          // CADA local (los 4 editables desde cualquier pestaña). AHORA:
          // los mismos 2 datos, pero SOLO del local activo — mismo layout
          // de 2 columnas (`stock-cols`) que ya usaba la pantalla de crear,
          // para que se sienta el mismo formulario, no uno distinto.
          <div className="stock-block">
            <div className="form-section-title" style={{ marginBottom: 0 }}>
              Stock {nombreLocalEdicion ? <>en <strong>{nombreLocalEdicion}</strong></> : ''}
            </div>
            <div className="stock-block__intro">
              <span>· Estos datos son <strong>solo de este local</strong> — no afectan el stock ni el mínimo de los demás.</span>
            </div>
            <div className="stock-cols">
              <div className="stock-col fg">
                <label>Stock actual</label>
                {/* Solo lectura a propósito: el stock actual NUNCA se edita
                    a mano — cambia únicamente al registrar o anular una
                    compra (ver CompraForm / PATCH /compras/:id/anular).
                    Antes había un <input> acá que dejaba escribir cualquier
                    número, pero el backend (PUT /insumos/:id) nunca lo leyó
                    — el cambio no se guardaba, solo parecía funcionar. */}
                <div className="insumo-locked-box">{localEdicion.stockActual} {form.unidadMedida}</div>
                <span className="stock-help">Cambia solo al registrar o anular una compra en este local.</span>
              </div>
              <div className={`stock-col ${errors.localEdicion ? 'fg fg-error' : 'fg'}`}>
                <label>Stock mínimo <span className="req">*</span></label>
                <input
                  type="number" step={permiteDecimales(form.unidadMedida) ? 'any' : '1'}
                  value={localEdicion.stockMinimo}
                  onChange={e => setLocalEdicion(prev => ({ ...prev, stockMinimo: e.target.value }))}
                  placeholder={permiteDecimales(form.unidadMedida) ? 'Ej: 2.5' : '1'}
                />
                <span className="stock-help">
                  Aplica solo a {nombreLocalEdicion || 'este local'}.
                  {form.unidadMedida && !permiteDecimales(form.unidadMedida) && ' La unidad "unidad" solo admite enteros.'}
                </span>
                {errors.localEdicion && <span className="err-msg">{errors.localEdicion}</span>}
              </div>
            </div>
            {/* "Activo en este local" — distinto del interruptor "Estado"
                de más abajo: ESE es global (todo el catálogo del insumo);
                ESTE decide si se OFRECE en el local actual (insumo_local.
                activo) sin afectar a los demás. */}
            <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, cursor:'pointer' }}>
              <input type="checkbox" checked={localEdicion.activo}
                onChange={e => setLocalEdicion(prev => ({ ...prev, activo: e.target.checked }))}
                style={{ width:15, height:15, accentColor:'#4CAF50', cursor:'pointer' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>
                Activo en {nombreLocalEdicion || 'este local'}
              </span>
            </label>
            <span className="stock-help" style={{ display:'block', marginTop:4 }}>
              Si lo desmarcas, el insumo deja de ofrecerse en {nombreLocalEdicion || 'este local'} — no se elimina, y sigue disponible en los demás locales donde ya estaba activo.
            </span>
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

        {/* batch 8 item 3 — la sección "Tipo de uso" (topping / adición) se
            eliminó: eso se configura en los módulos Toppings y Adiciones. */}

        <div className="fg fg-full">
          <label>Observaciones</label>
          <textarea name="descripcion" value={form.descripcion} onChange={handleChange}
            onBlur={() => setForm(prev => ({ ...prev, descripcion: prev.descripcion.trimEnd() }))}
            placeholder="Observaciones del insumo..." rows={3} maxLength={DESCRIPCION_INSUMO_MAX} />
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
        <button type="submit" className="btn-form-submit" disabled={submitting || categoriasDisponibles.length === 0 || Object.values(errors).some(Boolean)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isEditing
              ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
            }
          </svg>
          {submitting ? (isEditing ? 'Guardando…' : 'Registrando…') : (isEditing ? 'Guardar cambios' : 'Registrar insumo')}
        </button>
      </div>
    </form>
  );
};

export default InsumoForm;