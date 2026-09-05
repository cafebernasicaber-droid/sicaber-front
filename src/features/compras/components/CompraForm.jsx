import React, { useState, useEffect, useRef } from 'react';
import comprasService from '../services/comprasService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import insumosService from '../../insumos/services/insumosService';
import localesService from '../../../shared/services/localesService';
import useTiposPresentacion from '../hooks/useTiposPresentacion';
import { uploadToCloudinary } from '../../../shared/services/cloudinaryService';
import { validarArchivoComprobante, procesarComprobante, normalizarFechaComprobante } from '../../../shared/services/ocrService';
import ImageLightbox from '../../../shared/components/ImageLightbox';
import '../../../shared/components/ImageLightbox.css';
import './CompraForm.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_ITEM = {
  insumo: '', insumoId: '', unidad: '',
  // "Por presentación" es ahora el único modo de compra que existe — no
  // hay campo "modo" en el estado del ítem, todo se registra a través de
  // los campos presentacion*.
  presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
  // Mini-presentación (opcional, desactivada por defecto): cuando el
  // cliente no conoce el contenido TOTAL de la presentación pero sí sabe
  // cuántas unidades internas trae y cuánto contiene cada una — el
  // sistema hace esa multiplicación en vez de pedírsela ya calculada.
  // Exclusivo de Caja/Paquete/Bolsa — no aplica a "Unitario".
  presentacionMultiNivel: false,
  presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '',
};

// "Unitario" NO es un tipo gestionable — sigue siendo una opción fija y
// especial del sistema (Cantidad de presentaciones fija en 1, sin
// checkbox de nivel 3), separada del catálogo dinámico. Los demás tipos
// (Caja, Paquete, Bolsa, y cualquiera que se agregue) vienen del
// catálogo real vía useTiposPresentacion — ver dentro de CompraForm.
const presentacionEsMasculina = (tipo) => tipo === 'Paquete';
const pluralPresentacion = (tipo) => (tipo ? `${tipo}s` : 'presentaciones');

const getTodayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const EMPTY_FORM = {
  proveedorId: '',
  proveedorNombre: '',
  // A diferencia de Insumos (local automático), en Compras el local lo
  // ELIGE el usuario y es obligatorio: define a qué local/división se le
  // suma el stock de esta compra. El buscador de insumos de abajo solo
  // muestra los insumos de este local.
  localId: '',
  localNombre: '',
  fecha: getTodayStr(),
  observaciones: '',
  items: [{ ...EMPTY_ITEM }]
};

const formatCOP = (val) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(val) || 0);

const normalizarTexto = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\x00-\x7F]/g, '').trim();

const subtotalItem = (it) =>
  Number(it.presentacionCantidad || 0) * Number(it.presentacionPrecio || 0);

// Stock real que se sumará al insumo — solo informativo, se muestra pero no
// se usa para el valor de la compra. Con tipo "Unitario", presentacionCantidad
// es siempre 1 (fijado al elegir el tipo), así que la fórmula se reduce
// naturalmente a "= Contenido por presentación", sin necesitar una rama
// aparte. Modo mini-presentación (opcional, solo Caja/Paquete/Bolsa): agrega
// un nivel más de multiplicación cuando el usuario no conoce el contenido
// total, solo sus partes.
const stockRealItem = (it) => {
  const cantidadPresentaciones = Number(it.presentacionCantidad || 0);
  if (it.presentacionMultiNivel) {
    return cantidadPresentaciones * Number(it.presentacionUnidadesInternas || 0) * Number(it.presentacionContenidoUnidadInterna || 0);
  }
  return cantidadPresentaciones * Number(it.presentacionContenido || 0);
};

const cuantosCuantas = (tipo, unidad) => {
  if (unidad != null) return unidad === 'unidad' ? 'Cuántas' : 'Cuántos';
  return presentacionEsMasculina(tipo) ? 'Cuántos' : 'Cuántas';
};

const preguntaCantidadPresentacion = (tipo) =>
  `¿${cuantosCuantas(tipo)} ${pluralPresentacion(tipo).toLowerCase()} compraste?`;

const preguntaContenidoPresentacion = (unidad, tipo) => {
  const tipoLabel = (tipo || 'presentación').toLowerCase();
  if (!unidad) return `¿Cuánto trae cada ${tipoLabel}?`;
  const cantidadLabel = unidad === 'unidad' ? 'unidades' : unidad;
  return `¿${cuantosCuantas(null, unidad)} ${cantidadLabel} trae cada ${tipoLabel}?`;
};

// Selector con buscador — mismo campo de siempre (mismo lugar, misma
// apariencia general), pero con un input de texto que filtra las
// opciones en tiempo real en vez de tener que desplazarse por una lista
// larga. `options` es [{ value, label, sub? }] — `sub` es texto adicional
// donde también se busca (ej. NIT) sin mostrarse en la opción.
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

  // Al abrir, el campo NO se borra — sigue mostrando lo ya elegido, con
  // todo el texto seleccionado (igual que cualquier campo de búsqueda con
  // un valor precargado), listo para que escribir lo reemplace de
  // inmediato. Así se ve exactamente como un select normal hasta que el
  // usuario decide escribir para filtrar.
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

const CompraForm = ({ onSubmit, onCancel, serverError, onManagePresentaciones }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const itemRefs = useRef([]);
  const proveedorRef = useRef();
  const fechaRef = useRef();
  const descuentoRef = useRef();
  const comprobanteRef = useRef();
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const [comprobanteFile, setComprobanteFile]   = useState(null);
  const [comprobanteError, setComprobanteError] = useState('');
  const [procesandoOCR, setProcesandoOCR]       = useState(false);
  const [progresoOCR, setProgresoOCR]           = useState(0);
  const [comprobanteOk, setComprobanteOk]       = useState(false);
  const [totalDetectadoOCR, setTotalDetectadoOCR] = useState(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [zoomComprobante, setZoomComprobante] = useState(false);
  const comprobanteInputRef = useRef();
  const [arrastrandoComprobante, setArrastrandoComprobante] = useState(false);
  const [chequeoOCR, setChequeoOCR] = useState(null);
  const [confirmarPeseAdvertencia, setConfirmarPeseAdvertencia] = useState(false);

  const [descuento, setDescuento] = useState('0');

  const [proveedores, setProveedores] = useState([]);
  useEffect(() => {
    proveedoresService.getAll()
      .then(d => setProveedores(Array.isArray(d) ? d.filter(p => p.estado === 'Activo') : []))
      .catch(() => setProveedores([]));
  }, []);
  // Catálogo de locales (GET /locales, solo activos) — para el selector
  // "Local" obligatorio de la compra.
  const [locales, setLocales] = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);
  const localRef = useRef();
  // Catálogo real de Tipos de Presentación (Caja, Paquete, Bolsa, y
  // cualquiera que se haya agregado) — solo se muestran los activos.
  // "Unitario" es una excepción fija, siempre presente, que nunca viene
  // de este catálogo.
  const { tipos: tiposPresentacionCatalogo } = useTiposPresentacion();
  const tiposPresentacionActivos = tiposPresentacionCatalogo.filter(t => t.estado === 'Activo').map(t => t.nombre);
  const TIPOS_PRESENTACION = ['Unitario', ...tiposPresentacionActivos];
  const [todosInsumos, setTodosInsumos] = useState([]);
  useEffect(() => {
    insumosService.getAll()
      .then(d => setTodosInsumos(Array.isArray(d) ? d.filter(i => i.estado === 'Activo') : []))
      .catch(() => setTodosInsumos([]));
  }, []);

  // El insumo depende ÚNICAMENTE del local — proveedor e insumo son
  // independientes entre sí, solo se relacionan al momento de esta
  // compra puntual (quien registra decide qué insumo abasteció este
  // proveedor). Si por algún dato viejo un insumo no tiene localId, no
  // aparece (el backend igual lo rechazaría por no pertenecer al local
  // de la compra).
  const insumosFiltrados = form.localId
    ? todosInsumos.filter(i => String(i.localId) === String(form.localId))
    : [];

  // El comprobante es obligatorio salvo que todos los ítems sean de tipo
  // "Unitario" (comportamiento heredado del extinto modo "Directo") — si
  // hay al menos un ítem con Caja/Paquete/Bolsa, o sin tipo elegido aún,
  // el comprobante se exige igual que siempre.
  const comprobanteEsObligatorio = form.items.some(it => it.presentacionTipo !== 'Unitario');

  const esItemValido = (it) => {
    if (!it.insumo.trim()) return false;
    if (!it.presentacionTipo) return false;
    const esUnitario = it.presentacionTipo === 'Unitario';
    // "Unitario" fija Cantidad de presentaciones en 1 internamente — no
    // hay nada que el usuario deba llenar ni validar ahí.
    const cantidadPresentOk = esUnitario || (
      it.presentacionCantidad !== '' && !isNaN(it.presentacionCantidad) &&
      Number(it.presentacionCantidad) > 0 && Number.isInteger(Number(it.presentacionCantidad))
    );
    let contenidoOk;
    if (!esUnitario && it.presentacionMultiNivel) {
      const unidadesOk = it.presentacionUnidadesInternas !== '' && !isNaN(it.presentacionUnidadesInternas) &&
        Number(it.presentacionUnidadesInternas) > 0 && Number.isInteger(Number(it.presentacionUnidadesInternas));
      const contUnidadOk = it.presentacionContenidoUnidadInterna !== '' && !isNaN(it.presentacionContenidoUnidadInterna) &&
        Number(it.presentacionContenidoUnidadInterna) > 0 &&
        (it.unidad === 'unidad' ? Number.isInteger(Number(it.presentacionContenidoUnidadInterna)) : true);
      contenidoOk = unidadesOk && contUnidadOk;
    } else {
      contenidoOk = it.presentacionContenido !== '' && !isNaN(it.presentacionContenido) &&
        Number(it.presentacionContenido) > 0 &&
        (it.unidad === 'unidad' ? Number.isInteger(Number(it.presentacionContenido)) : true);
    }
    const precioOk = it.presentacionPrecio !== '' && !isNaN(it.presentacionPrecio) && Number(it.presentacionPrecio) >= 1000;
    return cantidadPresentOk && contenidoOk && precioOk;
  };

  const validateItems = (items) => {
    const itemInvalido = items.some(it => !esItemValido(it));
    return itemInvalido ? 'Revisa los insumos: cada uno necesita tipo, contenido y precio válidos (mínimo $1.000).' : '';
  };

  // Índice del primer ítem con error (en el orden en que aparecen en
  // pantalla) — usado para llevar el scroll exactamente ahí, no solo
  // avisar que "algo" está mal.
  const primerIndiceItemInvalido = (items) => items.findIndex(it => !esItemValido(it));

  // Todo insumo elegido tiene que pertenecer al local de la compra. Con el
  // buscador ya filtrado esto no debería fallar, pero se revalida antes de
  // enviar por si el local se cambió después de elegir insumos (o por un
  // dato inconsistente): se bloquea con un mensaje claro.
  const itemsFueraDelLocal = () => {
    if (!form.localId) return [];
    return form.items
      .filter(it => it.insumo && it.insumoId)
      .filter(it => {
        const ins = todosInsumos.find(i => String(i.id) === String(it.insumoId));
        return !ins || String(ins.localId) !== String(form.localId);
      })
      .map(it => it.insumo);
  };

  const validate = () => {
    const errs = {};
    if (!form.proveedorNombre.trim()) errs.proveedorNombre = 'Selecciona un proveedor';
    if (!form.localId) errs.localId = 'Selecciona el local de la compra.';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    else if (form.fecha !== getTodayStr()) errs.fecha = 'Solo puedes registrar la compra con la fecha de hoy.';
    const itemsErr = validateItems(form.items);
    if (itemsErr) errs.items = itemsErr;
    const fuera = itemsFueraDelLocal();
    if (fuera.length) {
      errs.items = `Estos insumos no pertenecen al local seleccionado: ${fuera.join(', ')}. Quítalos o cambia el local de la compra.`;
    }
    if (descuento !== '' && (isNaN(descuento) || Number(descuento) < 0 || Number(descuento) > 100)) {
      errs.descuento = 'El descuento debe ser un porcentaje entre 0 y 100.';
    }
    if (comprobanteEsObligatorio && !comprobanteFile) {
      errs.comprobante = 'El comprobante de compra es obligatorio en compras por presentación.';
    } else if (comprobanteFile) {
      if (procesandoOCR) errs.comprobante = 'Espera a que termine el análisis del comprobante.';
      else if (!comprobanteOk && !confirmarPeseAdvertencia) {
        errs.comprobante = 'Marca la casilla de confirmación para continuar con el comprobante tal como está.';
      }
    }
    return errs;
  };

  const seleccionarProveedor = (value) => {
    const prov = proveedores.find(p => String(p.id) === String(value));
    setForm(prev => ({
      ...prev,
      proveedorId:     value,
      proveedorNombre: prov ? prov.nombre : '',
    }));
    setTouched(prev => ({ ...prev, proveedorNombre: true }));
    setErrors(prev => ({ ...prev, proveedorNombre: prov ? '' : 'Selecciona un proveedor' }));
  };

  // Cambiar el local reinicia los insumos ya elegidos (igual que al cambiar
  // el proveedor): sus opciones dependen del local, así que no tiene sentido
  // arrastrar una selección de otro local.
  const seleccionarLocal = (value) => {
    const loc = locales.find(l => String(l.id) === String(value));
    setForm(prev => ({
      ...prev,
      localId:     value,
      localNombre: loc ? loc.nombre : '',
      items:       [{ ...EMPTY_ITEM }],
    }));
    setTouched(prev => ({ ...prev, localId: true }));
    setErrors(prev => ({ ...prev, localId: loc ? '' : 'Selecciona el local de la compra.', items: '' }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'proveedorId') {
      seleccionarProveedor(value);
      return;
    } else if (name === 'fecha') {
      setForm(prev => ({ ...prev, fecha: value === getTodayStr() ? value : getTodayStr() }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const filtrarNumero = (valor, maxDecimales, tope) => {
    let v = valor.replace(/[^0-9.]/g, '');
    if (maxDecimales === 0) {
      // Pesos enteros: cualquier punto se trata como separador visual de
      // miles (así se escribe en Colombia) y se elimina por completo —
      // nunca se malinterpreta como decimal, sea que se escriba tecla por
      // tecla o se pegue de golpe (ej. "1.000.000" -> "1000000").
      v = v.replace(/\./g, '');
    } else {
      const partes = v.split('.');
      if (partes.length > 2) v = partes[0] + '.' + partes.slice(1).join('');
      const [entero, decimales] = v.split('.');
      v = decimales !== undefined ? `${entero}.${decimales.slice(0, maxDecimales)}` : v;
    }
    if (v !== '' && v !== '.' && Number(v) > tope) v = String(tope);
    return v;
  };

  const handleInsumoSelect = (idx, nombreInsumo) => {
    const insumo = todosInsumos.find(i => i.nombre === nombreInsumo);

    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      insumo:         nombreInsumo,
      insumoId:       insumo ? insumo.id : '',
      unidad:         insumo ? (insumo.unidadMedida || '') : items[idx].unidad,
      presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
      presentacionMultiNivel: false, presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '',
    };
    setForm(prev => ({ ...prev, items }));
    setTouched(prev => ({ ...prev, items: true }));
    setErrors(prev => ({ ...prev, items: validateItems(items) }));
  };

  const handlePresentacionChange = (idx, field, value) => {
    const items = [...form.items];
    let v = value;
    if (field === 'presentacionTipo') {
      const eraUnitario = items[idx].presentacionTipo === 'Unitario';
      const esUnitario = value === 'Unitario';
      items[idx] = {
        ...items[idx],
        presentacionTipo: value,
        // "Unitario" fija la cantidad en 1 (oculta) y no admite el
        // checkbox de nivel 3; al salir de "Unitario" hacia otro tipo, se
        // limpia para que el usuario la vuelva a llenar — nunca se
        // auto-convierte un valor entre tipos.
        presentacionCantidad: esUnitario ? '1' : (eraUnitario ? '' : items[idx].presentacionCantidad),
        presentacionMultiNivel: esUnitario ? false : items[idx].presentacionMultiNivel,
        presentacionUnidadesInternas: esUnitario ? '' : items[idx].presentacionUnidadesInternas,
        presentacionContenidoUnidadInterna: esUnitario ? '' : items[idx].presentacionContenidoUnidadInterna,
      };
      setForm(prev => ({ ...prev, items }));
      setTouched(prev => ({ ...prev, items: true }));
      setErrors(prev => ({ ...prev, items: validateItems(items) }));
      return;
    }
    if (field === 'presentacionCantidad') {
      v = filtrarNumero(value, 0, 999999);
      if (v === '0') v = ''; // entero puro — nunca puede quedar en 0
    } else if (field === 'presentacionContenido') {
      const esEntero = items[idx].unidad === 'unidad';
      v = filtrarNumero(value, esEntero ? 0 : 2, 999999.99);
      if (esEntero && v === '0') v = ''; // entero puro (piezas) — nunca 0
      // Si admite decimales, "0" se deja transitar (para poder escribir
      // "0.5"); se limpia si queda así al salir del campo (ver onBlur).
    } else if (field === 'presentacionPrecio') {
      v = filtrarNumero(value, 0, 999999999);
      if (v === '0') v = ''; // entero puro — nunca puede quedar en 0
    } else if (field === 'presentacionUnidadesInternas') {
      // Unidades internas por presentación (ej. bolsas dentro de la caja): entero.
      v = filtrarNumero(value, 0, 999999);
      if (v === '0') v = ''; // entero puro — nunca puede quedar en 0
    } else if (field === 'presentacionContenidoUnidadInterna') {
      // Contenido por unidad interna (ej. kg por bolsa): decimal según unidad.
      const esEntero = items[idx].unidad === 'unidad';
      v = filtrarNumero(value, esEntero ? 0 : 2, 999999.99);
      if (esEntero && v === '0') v = ''; // entero puro — nunca 0
    }
    items[idx] = { ...items[idx], [field]: v };
    setForm(prev => ({ ...prev, items }));
    setTouched(prev => ({ ...prev, items: true }));
    setErrors(prev => ({ ...prev, items: validateItems(items) }));
  };

  // Activa/desactiva el modo de mini-presentación para un ítem. Al
  // activar, limpia "Contenido por presentación" (deja de estar en uso).
  // Al desactivar, limpia los 2 campos nuevos y deja el campo simple
  // vacío otra vez — nunca se intenta auto-convertir un valor entre modos.
  const handleTogglePresentacionMulti = (idx) => {
    const items = [...form.items];
    const activar = !items[idx].presentacionMultiNivel;
    items[idx] = activar
      ? { ...items[idx], presentacionMultiNivel: true, presentacionContenido: '' }
      : { ...items[idx], presentacionMultiNivel: false, presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '' };
    setForm(prev => ({ ...prev, items }));
    setTouched(prev => ({ ...prev, items: true }));
    setErrors(prev => ({ ...prev, items: validateItems(items) }));
  };

  // Los campos de contenido decimal (Contenido por presentación, Contenido
  // por unidad interna) dejan pasar "0" mientras se escribe, para no
  // bloquear "0.5" a mitad de tecleo. Al salir del campo, si quedó
  // exactamente en 0, se limpia — nunca puede quedar guardado en 0.
  const limpiarSiCeroAlSalir = (idx, field) => {
    const items = [...form.items];
    if (Number(items[idx][field]) === 0) {
      items[idx] = { ...items[idx], [field]: '' };
      setForm(prev => ({ ...prev, items }));
      setErrors(prev => ({ ...prev, items: validateItems(items) }));
    }
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
    setTimeout(() => {
      const nuevoIdx = itemRefs.current.length - 1;
      itemRefs.current[nuevoIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const removeItem = (idx) => {
    if (form.items.length === 1) return;
    const items = form.items.filter((_, i) => i !== idx);
    setForm(prev => ({ ...prev, items }));
    if (touched.items) setErrors(prev => ({ ...prev, items: validateItems(items) }));
  };

  const totalBruto = (form.items || []).reduce((sum, it) => sum + subtotalItem(it), 0);
  const descuentoNum = descuento === '' ? 0 : Math.min(100, Math.max(0, Number(descuento) || 0));
  const totalFinal = Math.round(totalBruto - (totalBruto * descuentoNum / 100));

  const handleComprobanteFile = async (file) => {
    setComprobanteError('');
    setComprobanteOk(false);
    setTotalDetectadoOCR(null);
    setChequeoOCR(null);
    setConfirmarPeseAdvertencia(false);
    setComprobantePreview('');
    if (!file) { setComprobanteFile(null); return; }

    const check = validarArchivoComprobante(file);
    if (!check.valid) { setComprobanteError(check.error); setComprobanteFile(null); return; }
    setComprobanteFile(file);
    if (file.type.startsWith('image/')) setComprobantePreview(URL.createObjectURL(file));

    if (check.requiereConversion) {
      setComprobanteError('El análisis automático de esta versión no procesa archivos PDF, así que no se pudo comparar el total ni otros datos automáticamente. El comprobante se adjuntará igual: revísalo y confirma abajo para continuar.');
      return;
    }

    if (totalBruto <= 0) {
      setComprobanteError('Agrega los insumos de la compra (con cantidad y precio) antes de subir el comprobante, para poder comparar el total.');
      return;
    }

    setProcesandoOCR(true);
    setProgresoOCR(0);
    try {
      const resultado = await procesarComprobante(file, setProgresoOCR);
      const fechaNormalizada = normalizarFechaComprobante(resultado.fechaDetectada);
      const proveedorSel = proveedores.find(p => String(p.id) === form.proveedorId);

      if (!resultado.ok) {
        setComprobanteError(resultado.error);
        if (resultado.fechaDetectada || resultado.nitDetectado) {
          setChequeoOCR({
            fecha: resultado.fechaDetectada || null,
            fechaCoincide: fechaNormalizada ? fechaNormalizada === form.fecha : null,
            nit: resultado.nitDetectado || null,
            nitCoincide: null,
            proveedorCoincide: null,
            total: null,
            totalCoincide: null,
            confianza: resultado.confianza ?? null,
            advertencias: [],
          });
        }
        return;
      }

      setTotalDetectadoOCR(resultado.total);

      const advertencias = [];

      const totalCoincide = resultado.total === totalFinal;
      if (!totalCoincide) {
        advertencias.push(`El total del comprobante (${formatCOP(resultado.total)}) no coincide con el total de la compra (${formatCOP(totalFinal)}).`);
      }

      let nitCoincide = null;
      const documentoNitProveedor = proveedorSel?.tipoPersona === 'Natural'
        ? (proveedorSel?.tipoDocumento === 'NIT' ? proveedorSel?.numeroDocumento : null)
        : proveedorSel?.nit;
      if (documentoNitProveedor && resultado.nitDetectado) {
        const nitLimpio = String(documentoNitProveedor).replace(/[.\-\s]/g, '');
        nitCoincide = !!nitLimpio && nitLimpio === resultado.nitDetectado;
        if (!nitCoincide) advertencias.push('El NIT detectado en el comprobante no coincide con el del proveedor seleccionado.');
      }

      let fechaCoincide = null;
      if (fechaNormalizada) {
        fechaCoincide = fechaNormalizada === form.fecha;
        if (!fechaCoincide) advertencias.push('La fecha del comprobante no coincide con la fecha registrada de la compra.');
      }

      let proveedorCoincide = null;
      if (proveedorSel?.nombre && resultado.texto) {
        const primeraPalabra = normalizarTexto(proveedorSel.nombre).split(' ')[0];
        if (primeraPalabra && primeraPalabra.length >= 3) {
          proveedorCoincide = normalizarTexto(resultado.texto).includes(primeraPalabra);
          if (!proveedorCoincide) advertencias.push('No se encontró el nombre del proveedor en el texto del comprobante.');
        }
      }

      let confianzaAjustada = resultado.confianza ?? null;
      if (confianzaAjustada != null) {
        if (totalCoincide === false)     confianzaAjustada -= 40;
        if (nitCoincide === false)       confianzaAjustada -= 20;
        if (fechaCoincide === false)     confianzaAjustada -= 15;
        if (proveedorCoincide === false) confianzaAjustada -= 15;
        confianzaAjustada = Math.max(0, Math.min(100, confianzaAjustada));
      }

      setChequeoOCR({
        fecha: resultado.fechaDetectada || null, fechaCoincide,
        nit: resultado.nitDetectado || null, nitCoincide,
        proveedorCoincide,
        total: resultado.total, totalCoincide,
        confianza: confianzaAjustada,
        advertencias: [...new Set(advertencias)],
      });
      setComprobanteOk(advertencias.length === 0);
    } catch (err) {
      setComprobanteError('No se pudo procesar el comprobante. Intenta con otra foto.');
    } finally {
      setProcesandoOCR(false);
    }
  };

  const [subiendoComprobante, setSubiendoComprobante] = useState(false);

  const prepararItemParaEnvio = (it) => {
    const cantidadPresentaciones = Number(it.presentacionCantidad) || 0;
    const precioPresentacion = Number(it.presentacionPrecio) || 0;

    // "contenidoPorPresentacion" siempre queda calculado y guardado — en
    // modo simple (incluido "Unitario", donde cantidadPresentaciones ya
    // es 1) es lo que el usuario escribió directamente; en modo
    // mini-presentación se DERIVA (unidades internas × contenido por
    // unidad), para que cualquier código que ya lea este campo (ej.
    // anular, historial) siga funcionando sin saber que existió un
    // sub-modo especial.
    let contenidoPorPresentacion;
    const datosExtra = {};
    if (it.presentacionMultiNivel) {
      const unidadesInternas = Number(it.presentacionUnidadesInternas) || 0;
      const contenidoPorUnidadInterna = Number(it.presentacionContenidoUnidadInterna) || 0;
      contenidoPorPresentacion = unidadesInternas * contenidoPorUnidadInterna;
      datosExtra.unidadesInternasPorPresentacion = unidadesInternas;
      datosExtra.contenidoPorUnidadInterna = contenidoPorUnidadInterna;
    } else {
      contenidoPorPresentacion = Number(it.presentacionContenido) || 0;
    }

    const cantidadReal = cantidadPresentaciones * contenidoPorPresentacion;
    const precioUnitarioEfectivo = cantidadReal > 0
      ? (precioPresentacion * cantidadPresentaciones) / cantidadReal
      : 0;
    return {
      insumo: it.insumo, unidad: it.unidad,
      cantidad: cantidadReal,
      precioUnitario: precioUnitarioEfectivo,
      presentacion: {
        tipo: it.presentacionTipo,
        cantidad: cantidadPresentaciones,
        contenidoPorPresentacion,
        precioPresentacion,
        ...datosExtra,
      },
    };
  };

  const [confirmSinValidar, setConfirmSinValidar] = useState(false);

  const enviarCompra = async () => {
    setSubiendoComprobante(true);
    try {
      const comprobanteUrl = comprobanteFile ? await uploadToCloudinary(comprobanteFile) : null;
      onSubmit({
        ...form,
        // El backend (POST /compras) lee req.body.local_id: define a qué
        // local se le suma el stock y valida que cada insumo pertenezca a él.
        local_id: Number(form.localId) || null,
        items: form.items.map(prepararItemParaEnvio),
        total: totalFinal,
        total_bruto: totalBruto,
        descuento: descuentoNum,
        comprobante_url: comprobanteUrl,
        comprobante_verificado: comprobanteFile ? comprobanteOk : null,
        comprobante_total_ocr: comprobanteFile ? totalDetectadoOCR : null,
        ocr_resultado: chequeoOCR ? {
          fecha: chequeoOCR.fecha, nit: chequeoOCR.nit,
          confianza: chequeoOCR.confianza,
          proveedorCoincide: chequeoOCR.proveedorCoincide,
          advertencias: chequeoOCR.advertencias,
        } : null,
      });
    } catch (err) {
      setErrors(prev => ({ ...prev, comprobante: 'No se pudo subir el comprobante. Intenta de nuevo.' }));
    } finally {
      setSubiendoComprobante(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Llevar la vista hasta el primer error, en el mismo orden en que
      // aparece en el formulario — así el usuario nunca se queda sin
      // saber por qué no lo dejó registrar la compra.
      setTimeout(() => {
        if (errs.proveedorNombre) {
          proveedorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errs.localId) {
          localRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errs.fecha) {
          fechaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errs.items) {
          const idx = primerIndiceItemInvalido(form.items);
          const el = idx !== -1 ? itemRefs.current[idx] : null;
          (el || itemRefs.current[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errs.descuento) {
          descuentoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (errs.comprobante) {
          comprobanteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }
    if (comprobanteFile && !comprobanteOk) {
      setConfirmSinValidar(true);
      return;
    }
    await enviarCompra();
  };

  return (
    <>
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">

        <div ref={localRef} className={`fg ${errors.localId ? 'fg-error' : ''}`}>
          <label>Local <span className="req">*</span></label>
          {locales.length > 0 ? (
            <BuscadorSelect
              value={form.localId}
              options={locales.map(l => ({ value: l.id, label: l.nombre, sub: l.direccion || '' }))}
              onChange={seleccionarLocal}
              placeholder="Elige el local al que se suma el stock..."
              emptyMessage="Ningún local coincide con esa búsqueda."
            />
          ) : (
            <div style={{ padding: '10px 14px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227' }}>
              ⚠ No hay locales activos registrados.
            </div>
          )}
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            El stock de esta compra se suma a este local. El buscador de insumos solo mostrará los de este local.
          </span>
          {errors.localId
            ? <span className="err-msg">{errors.localId}</span>
            : touched.localId && form.localId && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={proveedorRef} className={`fg ${errors.proveedorNombre ? 'fg-error' : ''}`}>
          <label>Proveedor <span className="req">*</span></label>
          {proveedores.length > 0 ? (
            <BuscadorSelect
              value={form.proveedorId}
              options={proveedores.map(p => ({ value: p.id, label: p.nombre, sub: [p.nit, p.numeroDocumento].filter(Boolean).join(' ') }))}
              onChange={seleccionarProveedor}
              placeholder="Buscar proveedor por nombre, NIT o documento..."
              emptyMessage="Ningún proveedor activo coincide con esa búsqueda."
            />
          ) : (
            <div style={{ padding: '10px 14px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227' }}>
              ⚠ No hay proveedores activos registrados.
            </div>
          )}
          {errors.proveedorNombre
            ? <span className="err-msg">{errors.proveedorNombre}</span>
            : touched.proveedorNombre && form.proveedorNombre && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={fechaRef} className={`fg ${errors.fecha ? 'fg-error' : ''}`}>
          <label>Fecha de compra <span className="req">*</span></label>
          <input
            type="date" name="fecha" value={form.fecha}
            min={getTodayStr()} max={getTodayStr()}
            onChange={handleChange}
          />
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Solo puedes registrar la compra con la fecha de hoy.
          </span>
          {errors.fecha && <span className="err-msg">{errors.fecha}</span>}
        </div>

        <div className="fg fg-full">
          <label>Observaciones</label>
          <textarea
            name="observaciones" value={form.observaciones}
            onChange={handleChange} placeholder="Notas sobre esta compra..." rows={2}
            maxLength={LIMITES.OBSERVACIONES}
          />
          <div style={{fontSize:11,color:enElTope(form.observaciones,LIMITES.OBSERVACIONES)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.observaciones,LIMITES.OBSERVACIONES)}</div>
        </div>
      </div>

      <div className="compra-items-wrap">
        <div className="compra-items-header">
          <span className="compra-items-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Insumos de la compra
            {form.items.filter(it => it.insumo).length > 0 && (
              <span style={{ background:'#4CAF50', color:'white', borderRadius:20, padding:'2px 10px', fontSize:11.5, fontWeight:700, marginLeft:8 }}>
                {form.items.filter(it => it.insumo).length}
              </span>
            )}
          </span>
          <button type="button" className="btn-add-item" onClick={addItem} disabled={!form.proveedorId || !form.localId}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Agregar insumo
          </button>
        </div>

        {!form.localId && (
          <div style={{ padding: '12px 16px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227', marginBottom: 10 }}>
            ⚠ Elige el <strong>local</strong> de la compra para poder agregar insumos.
          </div>
        )}

        {form.localId && insumosFiltrados.length === 0 && (
          <div style={{ padding: '12px 16px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227', marginBottom: 10 }}>
            ⚠ No hay insumos registrados en <strong>{form.localNombre}</strong>. Registra insumos para ese local (Gestión de Insumos).
          </div>
        )}

        {errors.items
          ? <div className="items-error-msg">{errors.items}</div>
          : touched.items && <div className="ok-msg" style={{ padding: '4px 18px 0' }}>✓ Insumos válidos</div>}

        {form.items.map((item, idx) => {
          const contenidoEsEntero = item.unidad === 'unidad';
          return (
          <div key={idx} ref={el => itemRefs.current[idx] = el} className={`item-block ${touched.items && !esItemValido(item) ? 'item-block--error' : ''}`}>
            <div className="item-block-header">
              <div className="item-block-title">
                <span className="item-block-index">Insumo {idx + 1}</span>
                <span className="item-block-name">{item.insumo || 'Sin seleccionar'}</span>
              </div>
              <span className="item-block-modo-badge item-block-modo-badge--presentacion">
                {item.presentacionTipo || 'Por presentación'}
              </span>
            </div>
            <div className="item-row">
              <div className="item-field">
                <label className="item-field-label">Insumo</label>
                {form.localId && insumosFiltrados.length > 0 ? (
                  <BuscadorSelect
                    value={item.insumoId}
                    options={insumosFiltrados
                      .filter(i => !form.items.some((it, i2) => i2 !== idx && it.insumoId && String(it.insumoId) === String(i.id)))
                      .map(i => ({ value: i.id, label: i.nombre }))}
                    onChange={(insumoId) => {
                      const insumo = insumosFiltrados.find(i => String(i.id) === String(insumoId));
                      if (insumo) handleInsumoSelect(idx, insumo.nombre);
                    }}
                    placeholder="Buscar insumo..."
                    emptyMessage="Ningún insumo disponible coincide con esa búsqueda (los ya elegidos en otra línea no aparecen)."
                  />
                ) : (
                  <input
                    type="text"
                    placeholder={!form.localId ? 'Selecciona el local primero' : 'Sin insumos en este local'}
                    value={item.insumo}
                    readOnly
                    style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                  />
                )}
              </div>

              <div className="item-field">
                <label className="item-field-label">Unidad</label>
                <input
                  type="text"
                  value={item.unidad}
                  readOnly
                  placeholder="—"
                  style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                />
              </div>

              <div className="item-field">
                <label className="item-field-label">Cantidad</label>
                <div className="item-presentacion-hint">Detalle abajo ↓</div>
              </div>
              <div className="item-field">
                <label className="item-field-label">Precio de la compra</label>
                <div className="item-presentacion-hint" aria-hidden="true"></div>
              </div>

              <div className="item-field">
                <label className="item-field-label item-field-label--right">Subtotal</label>
                <span className="item-subtotal">
                  {formatCOP(subtotalItem(item))}
                </span>
              </div>
              <button
                type="button" className="btn-remove-item"
                onClick={() => removeItem(idx)}
                disabled={form.items.length === 1}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>

              </button>
            </div>

            {(() => {
              const insumoSel = todosInsumos.find(i => i.nombre === item.insumo);
              const stockBajo = insumoSel && Number(insumoSel.stockActual) <= Number(insumoSel.stockMinimo);
              if (!stockBajo) return null;
              return (
                <div className="item-stock-bajo-alert">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span>Stock bajo de "{insumoSel.nombre}": quedan {insumoSel.stockActual} {insumoSel.unidadMedida} (mínimo {insumoSel.stockMinimo}) — buen momento para comprarlo.</span>
                </div>
              );
            })()}

            {(() => {
              const esUnitario = item.presentacionTipo === 'Unitario';
              return (
              <div className="item-presentacion-panel">
                <div className="fg">
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>Tipo de presentación</span>
                    {onManagePresentaciones && (
                      <button type="button" onClick={onManagePresentaciones}
                        style={{ background: 'none', border: 'none', color: 'var(--color-green,#4CAF50)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        Gestionar tipos
                      </button>
                    )}
                  </label>
                  <select value={item.presentacionTipo} onChange={e => handlePresentacionChange(idx, 'presentacionTipo', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {TIPOS_PRESENTACION.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {!esUnitario && (
                  <div className="fg">
                    <label>{item.presentacionTipo ? `Cantidad de ${pluralPresentacion(item.presentacionTipo)}` : 'Cantidad de presentaciones'}</label>
                    <input
                      type="number" step="1"
                      placeholder={preguntaCantidadPresentacion(item.presentacionTipo)}
                      value={item.presentacionCantidad}
                      onChange={e => handlePresentacionChange(idx, 'presentacionCantidad', e.target.value)}
                      onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                    />
                  </div>
                )}

                {!esUnitario && item.presentacionMultiNivel ? (
                  <>
                    <div className="fg">
                      <label>{`¿Cuántas unidades trae cada ${(item.presentacionTipo || 'presentación').toLowerCase()}?`}</label>
                      <input
                        type="number" step="1"
                        placeholder="Ej: 10"
                        value={item.presentacionUnidadesInternas}
                        onChange={e => handlePresentacionChange(idx, 'presentacionUnidadesInternas', e.target.value)}
                        onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                      />
                    </div>
                    <div className="fg">
                      <label>{`¿Cuánto contiene cada unidad interna${item.unidad ? ` (${item.unidad})` : ''}?`}</label>
                      <input
                        type="number" step={contenidoEsEntero ? '1' : '0.01'}
                        placeholder={contenidoEsEntero ? 'Ej: 1' : 'Ej: 5'}
                        value={item.presentacionContenidoUnidadInterna}
                        onChange={e => handlePresentacionChange(idx, 'presentacionContenidoUnidadInterna', e.target.value)}
                        onBlur={() => limpiarSiCeroAlSalir(idx, 'presentacionContenidoUnidadInterna')}
                        onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="fg">
                    <label>{esUnitario ? 'Cantidad recibida' : preguntaContenidoPresentacion(item.unidad, item.presentacionTipo)}</label>
                    <input
                      type="number" step={contenidoEsEntero ? '1' : '0.01'}
                      placeholder={contenidoEsEntero ? 'Ej: 25' : 'Ej: 5.5'}
                      value={item.presentacionContenido}
                      onChange={e => handlePresentacionChange(idx, 'presentacionContenido', e.target.value)}
                      onBlur={() => limpiarSiCeroAlSalir(idx, 'presentacionContenido')}
                      onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                    />
                  </div>
                )}

                <div className="fg">
                  <label>Precio por {(item.presentacionTipo || 'presentación').toLowerCase()}</label>
                  <input
                    type="number" step="1" placeholder="Ej: 10000 (mín. $1.000)"
                    title="Escribe el precio en pesos, sin puntos ni comas."
                    value={item.presentacionPrecio}
                    onChange={e => handlePresentacionChange(idx, 'presentacionPrecio', e.target.value)}
                    onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                  />
                </div>

                {/* Mini-presentación: opcional, desactivada por defecto —
                    exclusiva de Caja/Paquete/Bolsa. "Unitario" no la usa.
                    Va al final de todos los campos numéricos, no en medio,
                    para que Tipo/Cantidad/Contenido/Precio queden en una
                    sola fila alineada cuando está desmarcada (el caso por
                    defecto). */}
                {!esUnitario && (
                  <div className="fg" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={!!item.presentacionMultiNivel}
                        onChange={() => handleTogglePresentacionMulti(idx)}
                      />
                      No conozco el contenido total, pero sé cuántas unidades trae y cuánto contiene cada una
                    </label>
                  </div>
                )}
                {stockRealItem(item) > 0 && (
                  <div className="item-presentacion-info">
                    ℹ Se sumarán <strong>{stockRealItem(item)} {item.unidad}</strong> al stock{item.insumo ? ` de "${item.insumo}"` : ''} — este número es informativo, no se usa para el valor de la compra.
                  </div>
                )}
              </div>
              );
            })()}
          </div>
          );
        })}
      </div>

      <div className="compra-totales-wrap">
        {descuentoNum > 0 && (
          <div className="compra-total-row" style={{ fontWeight: 500, fontSize: 13 }}>
            <span>Subtotal (sin descuento)</span>
            <span>{formatCOP(totalBruto)}</span>
          </div>
        )}
        <div ref={descuentoRef} className="compra-total-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              ¿La compra tuvo descuento? (%)
              <input
                type="number" min="0" max="100" step="0.01" placeholder="0"
                value={descuento}
                onChange={e => {
                  let v = e.target.value;
                  if (v !== '') {
                    const n = Number(v);
                    if (n < 0) v = '0';
                    else if (n > 100) v = '100';
                  }
                  setDescuento(v);
                  // Validación en tiempo real — antes esto solo pasaba en
                  // onBlur (al salir del campo).
                  setTouched(prev => ({ ...prev, descuento: true }));
                  const invalido = v !== '' && (isNaN(v) || Number(v) < 0 || Number(v) > 100);
                  setErrors(prev => ({ ...prev, descuento: invalido ? 'El descuento debe ser un porcentaje entre 0 y 100.' : '' }));
                }}
                onBlur={() => {
                  setTouched(prev => ({ ...prev, descuento: true }));
                  const invalido = descuento !== '' && (isNaN(descuento) || Number(descuento) < 0 || Number(descuento) > 100);
                  setErrors(prev => ({ ...prev, descuento: invalido ? 'El descuento debe ser un porcentaje entre 0 y 100.' : '' }));
                }}
                onKeyDown={e => { if (e.key === '-' || e.key === 'e' || e.key === '+') e.preventDefault(); }}
                style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: `1.5px solid ${errors.descuento ? '#EF5350' : 'var(--border-input)'}`, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </span>
            {descuentoNum > 0 && <span style={{ color: '#C9A227', fontWeight: 600 }}>-{formatCOP(totalBruto - totalFinal)}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: descuentoNum > 0 ? '#C9A227' : 'var(--text-secondary)', fontWeight: descuentoNum > 0 ? 600 : 400 }}>
            {descuentoNum > 0
              ? `Se aplicó un descuento del ${descuentoNum}% — el total queda en ${formatCOP(totalFinal)}.`
              : 'Sin descuento.'}
          </div>
        </div>
        {errors.descuento && <div className="items-error-msg">{errors.descuento}</div>}
        <div className="compra-total-row compra-total-row--sticky">
          <span>Total de la compra</span>
          <span className="compra-total-value">{formatCOP(totalFinal)}</span>
        </div>
      </div>

      <div ref={comprobanteRef} className={`fg fg-full ${errors.comprobante ? 'fg-error' : ''}`} style={{ marginTop: 4 }}>
        <label>Comprobante de compra <span className="req">*</span></label>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 8px' }}>
          Sube una foto o captura clara del comprobante (JPG, JPEG o PNG). El sistema lee el total automáticamente y lo compara con el total de esta compra ({formatCOP(totalFinal)}) — es solo informativo, no impide guardar.
        </p>

        <div
          onClick={() => comprobanteInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setArrastrandoComprobante(true); }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setArrastrandoComprobante(false); }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation(); setArrastrandoComprobante(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleComprobanteFile(f);
          }}
          style={{
            border: `1.5px dashed ${arrastrandoComprobante ? 'var(--color-green,#4CAF50)' : 'var(--border-input)'}`,
            borderRadius: 10, padding: comprobantePreview ? 12 : '22px 16px', textAlign: 'center', cursor: 'pointer',
            background: arrastrandoComprobante ? 'rgba(76,175,80,0.06)' : 'transparent', transition: 'all .15s',
          }}
        >
          {comprobantePreview ? (
            <div style={{ position: 'relative', width: '100%', height: 220 }}>
              <img src={comprobantePreview} alt="Comprobante" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
              <button type="button" className="ilb-zoom-trigger" title="Ver completo / Zoom"
                onClick={e => { e.stopPropagation(); setZoomComprobante(true); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Arrastra el comprobante aquí, o haz clic para subir</span>
              <span style={{ fontSize: 11 }}>JPG, PNG o PDF</span>
            </div>
          )}
        </div>
        <input
          ref={comprobanteInputRef} type="file" style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          onChange={e => handleComprobanteFile(e.target.files?.[0] || null)}
        />
        {comprobantePreview && (
          <button type="button" onClick={() => setZoomComprobante(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 8, padding: '7px 0', borderRadius: 8, border: '1.5px solid var(--border-input)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Ver comprobante completo
          </button>
        )}
        {zoomComprobante && comprobantePreview && (
          <ImageLightbox src={comprobantePreview} alt="Comprobante de compra" onClose={() => setZoomComprobante(false)} />
        )}

        {procesandoOCR && (
          <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface-2, #F5F5F5)', border: '1px solid rgba(0,0,0,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600 }}>
              <span className="spinner-sm" style={{ width: 14, height: 14, border: '2px solid rgba(76,175,80,.25)', borderTopColor: '#4CAF50', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
              Analizando comprobante... {progresoOCR}%
            </div>
            <div style={{ marginTop: 8, height: 6, borderRadius: 4, background: 'rgba(0,0,0,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progresoOCR}%`, background: '#4CAF50', transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {!procesandoOCR && comprobanteError && !comprobanteFile && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(229,57,53,0.12)', color: '#EF5350', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {comprobanteError}
          </div>
        )}

        {!procesandoOCR && comprobanteFile && (comprobanteError || chequeoOCR) && (() => {
          const esErrorDuro = !!comprobanteError && !(chequeoOCR?.advertencias?.length);
          const tono = comprobanteOk ? 'ok' : esErrorDuro ? 'error' : 'warn';
          const colores = {
            ok:    { fondo: 'rgba(76,175,80,0.08)',   borde: 'rgba(76,175,80,0.3)',   texto: '#4CAF50' },
            warn:  { fondo: 'rgba(201,162,39,0.10)',  borde: 'rgba(201,162,39,0.35)', texto: '#C9A227' },
            error: { fondo: 'rgba(229,57,53,0.10)',   borde: 'rgba(239,83,80,0.3)',   texto: '#EF5350' },
          }[tono];
          return (
            <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: `1px solid ${colores.borde}` }}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, background: colores.fondo, color: colores.texto }}>
                {tono === 'ok'
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                }
                <span>
                  {tono === 'ok'
                    ? 'El comprobante coincide correctamente con la compra.'
                    : esErrorDuro
                      ? comprobanteError
                      : 'Encontramos diferencias entre el comprobante y la compra — revísalas antes de continuar.'}
                </span>
              </div>

              {chequeoOCR && (
                <div style={{ padding: '12px 14px', background: 'var(--bg-surface-2, #FAFAFA)', display: 'grid', gap: 6, borderTop: `1px solid ${colores.borde}` }}>
                  {[
                    ['Fecha',     chequeoOCR.fecha || 'No detectada', chequeoOCR.fechaCoincide],
                    ['NIT',       chequeoOCR.nit || 'No detectado',   chequeoOCR.nitCoincide],
                    ['Proveedor', chequeoOCR.proveedorCoincide === null ? 'No se pudo verificar' : (chequeoOCR.proveedorCoincide ? 'Coincide' : 'No coincide'), chequeoOCR.proveedorCoincide],
                    ...(chequeoOCR.total != null ? [['Total', formatCOP(chequeoOCR.total), chequeoOCR.totalCoincide]] : []),
                  ].map(([label, valor, coincide]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontWeight: 700, color: coincide === false ? '#C9A227' : coincide === true ? '#4CAF50' : 'var(--text-primary)' }}>
                        {valor} {coincide === true ? '✓' : coincide === false ? '⚠' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {chequeoOCR?.advertencias?.length > 0 && (
                <ul style={{ margin: 0, padding: '10px 14px 10px 30px', fontSize: 12.5, color: '#C9A227', background: 'rgba(201,162,39,0.06)', borderTop: `1px solid ${colores.borde}` }}>
                  {chequeoOCR.advertencias.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                </ul>
              )}

              {!comprobanteOk && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', borderTop: `1px solid ${colores.borde}`, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={confirmarPeseAdvertencia} style={{ marginTop: 2 }}
                    onChange={e => { setConfirmarPeseAdvertencia(e.target.checked); if (errors.comprobante) setErrors(prev => ({ ...prev, comprobante: '' })); }}
                  />
                  Revisé el comprobante y confirmo que corresponde a esta compra.
                </label>
              )}
              {errors.comprobante && (
                <div style={{ padding: '0 14px 10px', fontSize: 12, color: '#EF5350', fontWeight: 600 }}>{errors.comprobante}</div>
              )}
            </div>
          );
        })()}

        {!comprobanteFile && errors.comprobante && <span className="err-msg">{errors.comprobante}</span>}
      </div>

      {serverError && (
        <div className="form-server-error" style={{ marginTop: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {serverError}
        </div>
      )}

      <div className="form-footer">
        <button type="button" className="btn-form-cancel" onClick={onCancel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancelar
        </button>
        <button type="submit" className="btn-form-submit" disabled={procesandoOCR || subiendoComprobante || (comprobanteEsObligatorio && !comprobanteFile) || (comprobanteFile && !comprobanteOk && !confirmarPeseAdvertencia) || Object.values(errors).some(Boolean)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {subiendoComprobante ? 'Guardando...' : 'Registrar compra'}
        </button>
      </div>
    </form>

    {confirmSinValidar && (
      <div className="modal-overlay" onClick={() => setConfirmSinValidar(false)}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <div className="modal-icon modal-icon-danger">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h3>¿Registrar sin validar el comprobante?</h3>
          <p>El comprobante no pudo validarse automáticamente. ¿Estás seguro de que quieres continuar de todas formas?</p>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={() => setConfirmSinValidar(false)}>Cancelar</button>
            <button type="button" className="btn-confirm-danger" disabled={subiendoComprobante}
              onClick={() => { setConfirmSinValidar(false); enviarCompra(); }}>
              {subiendoComprobante ? 'Guardando...' : 'Sí, continuar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CompraForm;