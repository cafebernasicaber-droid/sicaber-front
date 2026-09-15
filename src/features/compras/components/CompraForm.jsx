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
import SearchSelect from '../../../shared/components/SearchSelect';
import { useAuth } from '../../../shared/contexts/AuthContext';
import './CompraForm.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';
import { estadoStockDe, insumoEnLocal, STOCK_OK, STOCK_AGOTADO, STOCK_BAJO_MINIMO } from '../../../shared/constants/insumoTipos';

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
  // batch 5 item 2 — local al que entra el stock comprado (obligatorio).
  localId: '',
  localNombre: '',
  fecha: getTodayStr(),
  observaciones: '',
  // batch 7 item 5 — arranca vacío: los insumos se agregan uno a uno
  // desde el panel izquierdo a la lista del panel derecho.
  items: []
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
// Redondeado a 2 decimales para cortar el ruido de coma flotante de JS
// (ej. 3 * 0.1 = 0.30000000000000004) en el resumen "Se sumarán X al stock".
const redondearCantidad = (n) => Math.round((Number(n) || 0) * 100) / 100;
const stockRealItem = (it) => {
  const cantidadPresentaciones = Number(it.presentacionCantidad || 0);
  if (it.presentacionMultiNivel) {
    return redondearCantidad(cantidadPresentaciones * Number(it.presentacionUnidadesInternas || 0) * Number(it.presentacionContenidoUnidadInterna || 0));
  }
  return redondearCantidad(cantidadPresentaciones * Number(it.presentacionContenido || 0));
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

const CompraForm = ({ onSubmit, onCancel, serverError, onManagePresentaciones }) => {
  const { user } = useAuth();
  // Rol con local fijo (cajero / bartender): su `sede` es el nombre de un
  // local real. Superadministrador y Administrador tienen sede 'Ambos' (o
  // vacía) y pueden comprar para cualquier local.
  const sedeUsuario = user?.sede && user.sede !== 'Ambos' ? user.sede : null;
  const [form, setForm] = useState(EMPTY_FORM);
  const itemsWrapRef = useRef();
  const proveedorRef = useRef();
  const localRef = useRef();
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
  // batch 5 item 2 — locales activos (CRUD de Locales del módulo Empleados).
  // GET /locales ya devuelve SOLO los activos: no se aplica ningún filtro
  // extra en el front para no excluir locales por accidente (ej. dirección
  // vacía) — bug corregido en batch 6.
  const [locales, setLocales] = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);
  // Local del rol operativo, resuelto contra el catálogo real (por nombre o id).
  const localFijoObj = sedeUsuario
    ? locales.find(l => l.nombre === sedeUsuario || String(l.id) === String(sedeUsuario)) || null
    : null;
  // Cajero / bartender: la compra entra SIEMPRE a su propio local — se
  // prefija y el campo se muestra como texto fijo, no como desplegable.
  useEffect(() => {
    if (!sedeUsuario) return;
    setForm(prev => {
      const id = localFijoObj ? String(localFijoObj.id) : sedeUsuario;
      const nombre = localFijoObj ? localFijoObj.nombre : sedeUsuario;
      return (String(prev.localId) === String(id) && prev.localNombre === nombre)
        ? prev : { ...prev, localId: id, localNombre: nombre };
    });
    setErrors(prev => (prev.localId ? { ...prev, localId: '' } : prev));
    // eslint-disable-next-line
  }, [sedeUsuario, localFijoObj?.id]);
  const seleccionarLocal = (value) => {
    const loc = locales.find(l => String(l.id) === String(value));
    setForm(prev => ({ ...prev, localId: value, localNombre: loc ? loc.nombre : '' }));
    setTouched(prev => ({ ...prev, localId: true }));
    setErrors(prev => ({ ...prev, localId: loc ? '' : 'Selecciona el local' }));
  };
  // Catálogo real de Tipos de Presentación (Caja, Paquete, Bolsa, y
  // cualquiera que se haya agregado) — solo se muestran los activos.
  // "Unitario" es una excepción fija, siempre presente, que nunca viene
  // de este catálogo.
  const { tipos: tiposPresentacionCatalogo } = useTiposPresentacion();
  const tiposPresentacionActivos = tiposPresentacionCatalogo.filter(t => t.estado === 'Activo').map(t => t.nombre);
  const [todosInsumos, setTodosInsumos] = useState([]);
  useEffect(() => {
    insumosService.getAll()
      .then(d => setTodosInsumos(Array.isArray(d) ? d.filter(i => i.estado === 'Activo') : []))
      .catch(() => setTodosInsumos([]));
  }, []);

  // batch 7 item 4 — proveedor e insumo son independientes: el selector de
  // insumo lista TODOS los insumos activos, sin filtrar por el proveedor
  // elegido (el insumo ya no tiene relación con proveedor).
  const insumosFiltrados = todosInsumos;

  // El comprobante de compra es SIEMPRE opcional (nunca lo exigió el
  // backend: comprobante_url no tiene NOT NULL ni ninguna validación que
  // lo requiera — esta obligatoriedad era puramente del formulario). Se
  // deja la constante (en vez de borrar todo lo que la usa) para no tener
  // que tocar el resto del flujo de validación/confirmación del OCR más
  // abajo, que sigue aplicando igual CUANDO sí se adjunta un comprobante.
  const comprobanteEsObligatorio = false;

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
    if (!items || items.length === 0) return 'Agrega al menos un insumo a la compra.';
    const itemInvalido = items.some(it => !esItemValido(it));
    return itemInvalido ? 'Revisa los insumos: cada uno necesita tipo, contenido y precio válidos (mínimo $1.000).' : '';
  };

  const validate = () => {
    const errs = {};
    if (!form.proveedorNombre.trim()) errs.proveedorNombre = 'Selecciona un proveedor';
    if (!form.localId) errs.localId = 'Selecciona el local';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    else if (form.fecha > getTodayStr()) errs.fecha = 'No puedes registrar una compra con fecha futura.';
    const itemsErr = validateItems(form.items);
    if (itemsErr) errs.items = itemsErr;
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
    // batch 7 item 4 — al elegir proveedor ya NO se limpian los insumos:
    // proveedor e insumo son independientes.
    setForm(prev => ({ ...prev, proveedorId: value, proveedorNombre: prov ? prov.nombre : '' }));
    setTouched(prev => ({ ...prev, proveedorNombre: true }));
    setErrors(prev => ({ ...prev, proveedorNombre: prov ? '' : 'Selecciona un proveedor' }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'proveedorId') {
      seleccionarProveedor(value);
      return;
    } else if (name === 'fecha') {
      // hoy o pasado; una fecha futura se acota a hoy
      setForm(prev => ({ ...prev, fecha: value && value <= getTodayStr() ? value : getTodayStr() }));
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

  // ── batch 7 item 5 — panel IZQUIERDO: se configura UN insumo (itemDraft)
  //    y con "Agregar" se pasa a la lista del panel derecho (form.items). ──
  const [itemDraft, setItemDraft] = useState({ ...EMPTY_ITEM });
  // Ver el comentario largo en RegistrarCompraPage.jsx (mismo patrón): no
  // se puede derivar el modo del toggle solo de presentacionTipo === ''
  // porque ese valor representa dos cosas distintas (ningún modo elegido
  // todavía, o "por presentación" elegido pero sin tipo concreto aún).
  const [modoCompra, setModoCompra] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draftError, setDraftError] = useState('');

  const handleDraftInsumo = (nombreInsumo) => {
    const insumo = todosInsumos.find(i => i.nombre === nombreInsumo);
    setItemDraft({
      ...EMPTY_ITEM,
      insumo: nombreInsumo,
      insumoId: insumo ? insumo.id : '',
      unidad: insumo ? (insumo.unidadMedida || '') : '',
    });
    setModoCompra(null);
    setDraftError('');
  };

  const handleDraftPresentacion = (field, value) => {
    setDraftError('');
    setItemDraft(prev => {
      const it = { ...prev };
      if (field === 'presentacionTipo') {
        const eraUnitario = it.presentacionTipo === 'Unitario';
        const esUnitario = value === 'Unitario';
        return {
          ...it,
          presentacionTipo: value,
          presentacionCantidad: esUnitario ? '1' : (eraUnitario ? '' : it.presentacionCantidad),
          presentacionMultiNivel: esUnitario ? false : it.presentacionMultiNivel,
          presentacionUnidadesInternas: esUnitario ? '' : it.presentacionUnidadesInternas,
          presentacionContenidoUnidadInterna: esUnitario ? '' : it.presentacionContenidoUnidadInterna,
        };
      }
      const esEntero = it.unidad === 'unidad';
      let v = value;
      if (field === 'presentacionCantidad') { v = filtrarNumero(value, 0, 999999); if (v === '0') v = ''; }
      else if (field === 'presentacionContenido') { v = filtrarNumero(value, esEntero ? 0 : 2, 999999.99); if (esEntero && v === '0') v = ''; }
      else if (field === 'presentacionPrecio') { v = filtrarNumero(value, 0, 999999999); if (v === '0') v = ''; }
      else if (field === 'presentacionUnidadesInternas') { v = filtrarNumero(value, 0, 999999); if (v === '0') v = ''; }
      else if (field === 'presentacionContenidoUnidadInterna') { v = filtrarNumero(value, esEntero ? 0 : 2, 999999.99); if (esEntero && v === '0') v = ''; }
      return { ...it, [field]: v };
    });
  };

  const handleDraftToggleMulti = () => setItemDraft(prev => prev.presentacionMultiNivel
    ? { ...prev, presentacionMultiNivel: false, presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '' }
    : { ...prev, presentacionMultiNivel: true, presentacionContenido: '' });

  const limpiarDraftCero = (field) =>
    setItemDraft(prev => Number(prev[field]) === 0 ? { ...prev, [field]: '' } : prev);

  const limpiarDraft = () => { setItemDraft({ ...EMPTY_ITEM }); setModoCompra(null); setEditingIdx(null); setDraftError(''); };

  const agregarItemDraft = () => {
    if (!itemDraft.insumo) { setDraftError('Elige el insumo.'); return; }
    if (!esItemValido(itemDraft)) { setDraftError('Completa tipo, contenido y precio válidos (mínimo $1.000).'); return; }
    const dup = form.items.some((it, i) => i !== editingIdx && it.insumoId && String(it.insumoId) === String(itemDraft.insumoId));
    if (dup) { setDraftError('Ese insumo ya está en la lista.'); return; }
    setForm(prev => {
      const items = [...prev.items];
      if (editingIdx != null) items[editingIdx] = { ...itemDraft };
      else items.push({ ...itemDraft });
      return { ...prev, items };
    });
    setTouched(prev => ({ ...prev, items: true }));
    setErrors(prev => ({ ...prev, items: '' }));
    limpiarDraft();
  };

  const editarItem = (idx) => {
    setItemDraft({ ...form.items[idx] });
    setModoCompra(form.items[idx].presentacionTipo === 'Unitario' ? 'unitaria' : 'presentacion');
    setEditingIdx(idx);
    setDraftError('');
  };
  const quitarItem = (idx) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    if (editingIdx === idx) limpiarDraft();
    else if (editingIdx != null && idx < editingIdx) setEditingIdx(editingIdx - 1);
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

    const cantidadReal = redondearCantidad(cantidadPresentaciones * contenidoPorPresentacion);
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
      // await: mantiene el botón deshabilitado (disabled incluye
      // `subiendoComprobante`) hasta que el POST termina, para que un
      // segundo clic no registre la compra dos veces.
      await onSubmit({
        ...form,
        local_id: form.localId,
        localId: form.localId,
        localNombre: form.localNombre,
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
          itemsWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        <div ref={proveedorRef} className={`fg ${errors.proveedorNombre ? 'fg-error' : ''}`}>
          <label>Proveedor <span className="req">*</span></label>
          {proveedores.length > 0 ? (
            <SearchSelect
              value={form.proveedorId}
              options={proveedores.map(p => ({ value: p.id, label: p.nombre, sub: [p.nit, p.numeroDocumento].filter(Boolean).join(' ') }))}
              onChange={seleccionarProveedor}
              placeholder="Buscar proveedor por nombre, NIT o documento..."
              emptyMessage="No hay proveedores activos."
              hasError={!!errors.proveedorNombre}
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

        {/* batch 5 item 2 — Local (obligatorio), mismo buscador con lupa
            que Proveedor. El stock comprado entra solo a este local.
            batch 9.7 item 2 — según el rol:
             · Superadmin / Admin (sede 'Ambos') → desplegable con TODOS
               los locales activos, sin avisos de configuración.
             · Cajero / bartender → su propio local, prefijado y como
               texto fijo (no un desplegable de una sola opción). */}
        <div ref={localRef} className={`fg ${errors.localId ? 'fg-error' : ''}`}>
          <label>Local <span className="req">*</span></label>
          {sedeUsuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1.5px solid var(--border-input)', borderRadius: 8, background: 'var(--bg-hover, rgba(128,128,128,.08))', fontSize: 14, color: 'var(--text-secondary)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
              <strong style={{ color: 'var(--text-primary)' }}>{form.localNombre || sedeUsuario}</strong>
            </div>
          ) : locales.length > 0 ? (
            <SearchSelect
              value={form.localId}
              options={locales.map(l => ({
                value: l.id,
                label: l.nombre,
                sub: (l.direccion && !/^(pegar|—|-|n\/a|sin)/i.test(l.direccion.trim())) ? l.direccion.trim() : '',
                subPlaceholder: 'Sin dirección registrada',
              }))}
              onChange={seleccionarLocal}
              placeholder="Buscar local por nombre o dirección..."
              emptyMessage="No hay locales activos."
              hasError={!!errors.localId}
            />
          ) : (
            <div style={{ padding: '10px 14px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227' }}>
              ⚠ No hay locales activos registrados. Créalos en Empleados → Locales.
            </div>
          )}
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            {sedeUsuario
              ? 'La compra entra al stock de tu local.'
              : 'El stock de esta compra entra únicamente al local seleccionado.'}
          </span>
          {errors.localId
            ? <span className="err-msg">{errors.localId}</span>
            : touched.localId && form.localId && !sedeUsuario && <span className="ok-msg">✓ Válido</span>}
        </div>

        <div ref={fechaRef} className={`fg ${errors.fecha ? 'fg-error' : ''}`}>
          <label>Fecha de compra <span className="req">*</span></label>
          {/* batch 7 item 7 — hoy y cualquier fecha pasada; las futuras
              quedan deshabilitadas en el calendario (max), no solo
              rechazadas al guardar. */}
          <input
            type="date" name="fecha" value={form.fecha}
            max={getTodayStr()}
            onChange={handleChange}
          />
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Puedes registrar la compra con la fecha de hoy o una fecha pasada. No se permiten fechas futuras.
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

      {/* batch 7 item 5 — dos paneles: IZQ configura un insumo, DER lista
          los añadidos (scroll propio, numeración sin huecos, contador). */}
      <div className="compra-items-wrap" ref={itemsWrapRef}>
        <div className="compra-items-header">
          <span className="compra-items-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Insumos de la compra
          </span>
        </div>

        {errors.items && <div className="items-error-msg">{errors.items}</div>}

        <div className="compra-items-2col">
          {/* ── Panel IZQUIERDO: adquisición de UN insumo ── */}
          <div className="compra-panel compra-panel--config">
            <div className="compra-panel__title">
              {editingIdx != null ? `Editando insumo #${editingIdx + 1}` : 'Configurar insumo a añadir'}
            </div>

            <div className="fg">
              <label>Insumo</label>
              {insumosFiltrados.length > 0 ? (
                <SearchSelect
                  value={itemDraft.insumoId}
                  options={insumosFiltrados
                    .filter(i => !form.items.some((it, i2) => i2 !== editingIdx && it.insumoId && String(it.insumoId) === String(i.id)))
                    .map(i => ({ value: i.id, label: i.nombre, sub: i.unidadMedida ? `Unidad: ${i.unidadMedida}` : '' }))}
                  onChange={(insumoId) => {
                    const insumo = insumosFiltrados.find(i => String(i.id) === String(insumoId));
                    if (insumo) handleDraftInsumo(insumo.nombre);
                  }}
                  placeholder="Buscar insumo…"
                  loading={todosInsumos.length === 0}
                  emptyMessage="No hay insumos activos registrados."
                />
              ) : (
                <input type="text" placeholder="No hay insumos activos registrados" readOnly
                  style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}/>
              )}
              {itemDraft.unidad && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Unidad de medida: <strong>{itemDraft.unidad}</strong>
                </span>
              )}
            </div>

            {itemDraft.insumo && (() => {
              const esUnitario = itemDraft.presentacionTipo === 'Unitario';
              const contenidoEsEntero = itemDraft.unidad === 'unidad';
              const insumoSel = todosInsumos.find(i => i.nombre === itemDraft.insumo);
              // ronda 22 / A — la alerta es POR LOCAL: refleja el stock del
              // insumo en el local al que ENTRA esta compra (form.localId),
              // no el consolidado. 3 niveles distintos (agotado / bajo
              // mínimo / stock bajo), mismo contrato que Insumos.
              const insumoEnLocalSel = insumoSel ? insumoEnLocal(insumoSel, form.localId) : null;
              const estStock = insumoEnLocalSel ? estadoStockDe(insumoEnLocalSel) : STOCK_OK;
              const alertaStock = estStock !== STOCK_OK;
              const critico = estStock === STOCK_AGOTADO || estStock === STOCK_BAJO_MINIMO;
              const etiquetaStock = estStock === STOCK_AGOTADO ? 'Agotado'
                : estStock === STOCK_BAJO_MINIMO ? 'Bajo el mínimo' : 'Stock bajo';
              return (
              <>
                {alertaStock && (
                  <div className={`item-stock-bajo-alert${critico ? ' item-stock-bajo-alert--critico' : ''}`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span><strong>{etiquetaStock}</strong> de "{insumoSel.nombre}"{form.localNombre ? ` en ${form.localNombre}` : ''}: {insumoEnLocalSel.stockActual} {insumoSel.unidadMedida} (mínimo {insumoEnLocalSel.stockMinimo}).</span>
                  </div>
                )}
                <div className="item-presentacion-panel">
                  <div className="fg" style={{ gridColumn: '1 / -1' }}>
                    <label>Modo de compra</label>
                    <div className="compra-modo-toggle" role="tablist" aria-label="Modo de compra">
                      <button type="button" role="tab" aria-selected={modoCompra === 'unitaria'}
                        className={`compra-modo-toggle__btn ${modoCompra === 'unitaria' ? 'is-active' : ''}`}
                        onClick={() => { setModoCompra('unitaria'); handleDraftPresentacion('presentacionTipo', 'Unitario'); }}>
                        Compra unitaria (directa)
                      </button>
                      <button type="button" role="tab" aria-selected={modoCompra === 'presentacion'}
                        className={`compra-modo-toggle__btn ${modoCompra === 'presentacion' ? 'is-active' : ''}`}
                        onClick={() => { setModoCompra('presentacion'); handleDraftPresentacion('presentacionTipo', ''); }}>
                        Por presentación
                      </button>
                    </div>
                    {modoCompra && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                        {modoCompra === 'unitaria'
                          ? 'Compraste el insumo directo, sin caja/paquete/bolsa que lo agrupe.'
                          : 'El insumo vino agrupado en una presentación (caja, paquete, bolsa...).'}
                      </span>
                    )}
                  </div>

                  {modoCompra === 'presentacion' && (
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
                      <select value={itemDraft.presentacionTipo} onChange={e => handleDraftPresentacion('presentacionTipo', e.target.value)}>
                        <option value="">-- Seleccionar --</option>
                        {tiposPresentacionActivos.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Antes estos campos ya se mostraban con solo NO ser
                      "Unitario" (`!esUnitario`), lo que los dejaba visibles
                      incluso sin haber elegido todavía un tipo concreto en
                      el desplegable de arriba. Ahora esperan a que el modo
                      esté resuelto (Unitario, o un tipo de presentación ya
                      elegido) antes de aparecer. */}
                  {itemDraft.presentacionTipo !== '' && (
                    <>
                      {!esUnitario && (
                        <div className="fg">
                          <label>{itemDraft.presentacionTipo ? `Cantidad de ${pluralPresentacion(itemDraft.presentacionTipo)}` : 'Cantidad de presentaciones'}</label>
                          <input type="number" step="1"
                            placeholder={preguntaCantidadPresentacion(itemDraft.presentacionTipo)}
                            value={itemDraft.presentacionCantidad}
                            onChange={e => handleDraftPresentacion('presentacionCantidad', e.target.value)}
                            onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}/>
                        </div>
                      )}

                      {!esUnitario && itemDraft.presentacionMultiNivel ? (
                        <>
                          <div className="fg">
                            <label>{`¿Cuántas unidades trae cada ${(itemDraft.presentacionTipo || 'presentación').toLowerCase()}?`}</label>
                            <input type="number" step="1" placeholder="Ej: 10"
                              value={itemDraft.presentacionUnidadesInternas}
                              onChange={e => handleDraftPresentacion('presentacionUnidadesInternas', e.target.value)}
                              onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}/>
                          </div>
                          <div className="fg">
                            <label>{`¿Cuánto contiene cada unidad interna${itemDraft.unidad ? ` (${itemDraft.unidad})` : ''}?`}</label>
                            <input type="number" step={contenidoEsEntero ? '1' : '0.01'}
                              placeholder={contenidoEsEntero ? 'Ej: 1' : 'Ej: 5'}
                              value={itemDraft.presentacionContenidoUnidadInterna}
                              onChange={e => handleDraftPresentacion('presentacionContenidoUnidadInterna', e.target.value)}
                              onBlur={() => limpiarDraftCero('presentacionContenidoUnidadInterna')}
                              onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}/>
                          </div>
                        </>
                      ) : (
                        <div className="fg">
                          <label>{esUnitario ? 'Cantidad recibida' : preguntaContenidoPresentacion(itemDraft.unidad, itemDraft.presentacionTipo)}</label>
                          <input type="number" step={contenidoEsEntero ? '1' : '0.01'}
                            placeholder={contenidoEsEntero ? 'Ej: 25' : 'Ej: 5.5'}
                            value={itemDraft.presentacionContenido}
                            onChange={e => handleDraftPresentacion('presentacionContenido', e.target.value)}
                            onBlur={() => limpiarDraftCero('presentacionContenido')}
                            onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}/>
                        </div>
                      )}

                      <div className="fg">
                        <label>Precio por {(itemDraft.presentacionTipo || 'presentación').toLowerCase()}</label>
                        <input type="number" step="1" placeholder="Ej: 10000 (mín. $1.000)"
                          title="Escribe el precio en pesos, sin puntos ni comas."
                          value={itemDraft.presentacionPrecio}
                          onChange={e => handleDraftPresentacion('presentacionPrecio', e.target.value)}
                          onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}/>
                      </div>

                      {!esUnitario && (
                        <div className="fg" style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={!!itemDraft.presentacionMultiNivel} onChange={handleDraftToggleMulti}/>
                            No conozco el contenido total, pero sé cuántas unidades trae y cuánto contiene cada una
                          </label>
                        </div>
                      )}
                      {stockRealItem(itemDraft) > 0 && (
                        <div className="item-presentacion-info">
                          ℹ Se sumarán <strong>{stockRealItem(itemDraft)} {itemDraft.unidad}</strong> al stock — informativo, no se usa para el valor de la compra.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
              );
            })()}

            {draftError && <div className="items-error-msg" style={{ margin: '8px 0 0' }}>{draftError}</div>}

            <div className="compra-panel__actions">
              {editingIdx != null && (
                <button type="button" className="btn-form-cancel" onClick={limpiarDraft}>Cancelar</button>
              )}
              <button type="button" className="btn-add-item"
                onClick={agregarItemDraft}
                disabled={!itemDraft.insumo || !esItemValido(itemDraft)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {editingIdx != null ? 'Guardar cambios' : 'Agregar a la compra'}
              </button>
            </div>
          </div>

          {/* ── Panel DERECHO: lista de insumos añadidos ── */}
          <div className="compra-panel compra-panel--list">
            <div className="compra-panel__title">
              Insumos añadidos
              <span className="compra-items-count">{form.items.length}</span>
            </div>
            <div className="compra-panel__scroll">
              {form.items.length === 0 ? (
                <div className="compra-panel__empty">
                  Todavía no has añadido ningún insumo. Configúralo a la izquierda y pulsa “Agregar a la compra”.
                </div>
              ) : form.items.map((it, idx) => (
                <div key={idx} className={`compra-list-item ${editingIdx === idx ? 'is-editing' : ''} ${!esItemValido(it) ? 'is-invalid' : ''}`}>
                  <span className="compra-list-item__n">{idx + 1}</span>
                  <div className="compra-list-item__body">
                    <div className="compra-list-item__name">{it.insumo}</div>
                    <div className="compra-list-item__meta">
                      {(it.presentacionTipo || 'Por presentación')} · {stockRealItem(it)} {it.unidad} · {formatCOP(subtotalItem(it))}
                    </div>
                  </div>
                  <div className="compra-list-item__actions">
                    <button type="button" title="Editar" onClick={() => editarItem(idx)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button type="button" title="Quitar" onClick={() => quitarItem(idx)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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

      {/* Punto 1 — mismo cambio que RegistrarCompraPage.jsx: el comprobante
          nunca fue obligatorio en el backend, se corrige el label. */}
      <div ref={comprobanteRef} className={`fg fg-full ${errors.comprobante ? 'fg-error' : ''}`} style={{ marginTop: 4 }}>
        <label>Comprobante de compra <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>(opcional)</span></label>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 8px' }}>
          Sube una foto o captura clara del comprobante (JPG, JPEG o PNG) si tienes una a mano. El sistema lee el total automáticamente y lo compara con el total de esta compra ({formatCOP(totalFinal)}) — es solo informativo, no impide guardar.
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