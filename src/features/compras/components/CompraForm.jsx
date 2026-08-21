import React, { useState, useEffect, useRef } from 'react';
import comprasService from '../services/comprasService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import insumosService from '../../insumos/services/insumosService';
import { uploadToCloudinary } from '../../../shared/services/cloudinaryService';
import { validarArchivoComprobante, procesarComprobante, normalizarFechaComprobante } from '../../../shared/services/ocrService';
import ImageLightbox from '../../../shared/components/ImageLightbox';
import '../../../shared/components/ImageLightbox.css';
import './CompraForm.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

const EMPTY_ITEM = {
  insumo: '', insumoId: '', cantidad: '', precioUnitario: '', unidad: '',
  // "Comprar por presentación": modo libre por ítem, no se guarda como
  // preferencia del insumo ni se recuerda entre compras — siempre arranca
  // en 'directo'. Los campos presentacion* solo se usan cuando modo es
  // 'presentacion'; ver handleModoChange/handlePresentacionChange.
  modo: 'directo',
  presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
};

// Tipos de presentación de compra — NO son unidades de medida del insumo,
// son cómo lo empaca el proveedor. "Caja"/"Bolsa"/"Docena" son femeninos,
// "Paquete" es masculino; se usa para las preguntas "¿Cuántas/os...?".
const TIPOS_PRESENTACION = ['Caja', 'Paquete', 'Bolsa', 'Docena'];
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
  fecha: getTodayStr(),
  observaciones: '',
  items: [{ ...EMPTY_ITEM }]
};

const formatCOP = (val) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(val) || 0);

// Quita tildes/mayúsculas para comparaciones de texto tolerantes (usado al
// contrastar el texto leído por OCR con el nombre del proveedor).
const normalizarTexto = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\x00-\x7F]/g, '').trim();

// ── "Comprar por presentación" — helpers ────────────────────────────────────
// Subtotal SIEMPRE en la unidad en la que el usuario compró: en modo
// "directo" es cantidad×precio por unidad real; en modo "presentación" es
// cantidad_presentaciones×precio_presentacion — nunca se convierte a la
// unidad real para este cálculo (así lo pidió el negocio).
const subtotalItem = (it) => it.modo === 'presentacion'
  ? Number(it.presentacionCantidad || 0) * Number(it.presentacionPrecio || 0)
  : Number(it.cantidad || 0) * Number(it.precioUnitario || 0);

// Stock real que se sumará al insumo — solo informativo, se muestra pero no
// se usa para el valor de la compra.
const stockRealItem = (it) => it.modo === 'presentacion'
  ? Number(it.presentacionCantidad || 0) * Number(it.presentacionContenido || 0)
  : Number(it.cantidad || 0);

const cuantosCuantas = (tipo, unidad) => {
  if (unidad != null) return unidad === 'unidad' ? 'Cuántas' : 'Cuántos';
  return presentacionEsMasculina(tipo) ? 'Cuántos' : 'Cuántas';
};

// "¿Cuántas cajas compraste?"
const preguntaCantidadPresentacion = (tipo) =>
  `¿${cuantosCuantas(tipo)} ${pluralPresentacion(tipo).toLowerCase()} compraste?`;

// "¿Cuántos kg trae cada caja?" / "¿Cuántas unidades trae cada paquete?"
const preguntaContenidoPresentacion = (unidad, tipo) => {
  const tipoLabel = (tipo || 'presentación').toLowerCase();
  if (!unidad) return `¿Cuánto trae cada ${tipoLabel}?`;
  const cantidadLabel = unidad === 'unidad' ? 'unidades' : unidad;
  return `¿${cuantosCuantas(null, unidad)} ${cantidadLabel} trae cada ${tipoLabel}?`;
};

const CompraForm = ({ onSubmit, onCancel, serverError }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  // ── Comprobante de compra + validación OCR ──────────────────────────────
  const [comprobanteFile, setComprobanteFile]   = useState(null);
  const [comprobanteError, setComprobanteError] = useState('');
  const [procesandoOCR, setProcesandoOCR]       = useState(false);
  const [progresoOCR, setProgresoOCR]           = useState(0);
  const [comprobanteOk, setComprobanteOk]       = useState(false); // true solo si el OCR no encontró ninguna diferencia
  const [totalDetectadoOCR, setTotalDetectadoOCR] = useState(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [zoomComprobante, setZoomComprobante] = useState(false);
  const comprobanteInputRef = useRef();
  const [arrastrandoComprobante, setArrastrandoComprobante] = useState(false);
  // Resumen de lo que el OCR detectó (fecha/NIT/proveedor/total) + las
  // advertencias derivadas de contrastarlo con la compra. El OCR ya no
  // bloquea el registro — solo informa; ver validate()/handleSubmit.
  const [chequeoOCR, setChequeoOCR] = useState(null);
  const [confirmarPeseAdvertencia, setConfirmarPeseAdvertencia] = useState(false);

  // Descuento opcional (0-100%) sobre el total de la compra
  const [descuento, setDescuento] = useState('');

  const [proveedores, setProveedores] = useState([]);
  useEffect(() => {
    proveedoresService.getAll()
      .then(d => setProveedores(Array.isArray(d) ? d.filter(p => p.estado === 'Activo') : []))
      .catch(() => setProveedores([]));
  }, []);
  const [todosInsumos, setTodosInsumos] = useState([]);
  useEffect(() => {
    insumosService.getAll()
      // BUG CORREGIDO: `estado` en la base de datos es un string
      // ('Activo'/'Inactivo'), no un booleano — comparar con `!== false`
      // nunca excluía nada, así que insumos inactivos seguían apareciendo
      // como opción al registrar una compra.
      .then(d => setTodosInsumos(Array.isArray(d) ? d.filter(i => i.estado === 'Activo') : []))
      .catch(() => setTodosInsumos([]));
  }, []);

  const insumosFiltrados = form.proveedorId
    ? todosInsumos.filter(i =>
        String(i.proveedorId) === String(form.proveedorId) ||
        i.proveedor === form.proveedorNombre
      )
    : [];

  const validate = () => {
    const errs = {};
    if (!form.proveedorNombre.trim()) errs.proveedorNombre = 'Selecciona un proveedor';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    else if (form.fecha > getTodayStr()) errs.fecha = 'La fecha no puede ser futura — una compra es un hecho ya ocurrido';
    const itemInvalido = form.items.some(it => {
      if (!it.insumo.trim()) return true;
      if (it.modo === 'presentacion') {
        const cantidadPresentOk = it.presentacionCantidad !== '' && !isNaN(it.presentacionCantidad) &&
          Number(it.presentacionCantidad) > 0 && Number.isInteger(Number(it.presentacionCantidad));
        const contenidoOk = it.presentacionContenido !== '' && !isNaN(it.presentacionContenido) &&
          Number(it.presentacionContenido) > 0 &&
          (it.unidad === 'unidad' ? Number.isInteger(Number(it.presentacionContenido)) : true);
        const precioOk = it.presentacionPrecio !== '' && !isNaN(it.presentacionPrecio) && Number(it.presentacionPrecio) >= 1000;
        return !it.presentacionTipo || !cantidadPresentOk || !contenidoOk || !precioOk;
      }
      return it.cantidad === '' || isNaN(it.cantidad) || Number(it.cantidad) <= 0 ||
        it.precioUnitario === '' || isNaN(it.precioUnitario) || Number(it.precioUnitario) < 1000;
    });
    if (itemInvalido) errs.items = 'Revisa los insumos: cada uno necesita nombre, cantidad y precio válidos (mínimo $1.000).';
    if (descuento !== '' && (isNaN(descuento) || Number(descuento) < 0 || Number(descuento) > 100)) {
      errs.descuento = 'El descuento debe ser un porcentaje entre 0 y 100.';
    }
    // El comprobante (archivo) es obligatorio; que el OCR haya "coincidido"
    // ya NO lo es — es solo informativo. Si el OCR encontró diferencias (o
    // no pudo verificar nada), se exige un check explícito de confirmación
    // en vez de bloquear el registro de la compra.
    if (!comprobanteFile) errs.comprobante = 'El comprobante de compra es obligatorio.';
    else if (procesandoOCR) errs.comprobante = 'Espera a que termine el análisis del comprobante.';
    else if (!comprobanteOk && !confirmarPeseAdvertencia) {
      errs.comprobante = 'Marca la casilla de confirmación para continuar con el comprobante tal como está.';
    }
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'proveedorId') {
      const prov = proveedores.find(p => String(p.id) === value);
      setForm(prev => ({
        ...prev,
        proveedorId:     value,
        proveedorNombre: prov ? prov.nombre : '',
        items:           [{ ...EMPTY_ITEM }]
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleItemChange = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      if (field === 'cantidad') {
        // Solo enteros: eliminar decimales y caracteres no numéricos
        const soloEntero = value.replace(/[^0-9]/g, '');
        items[idx] = { ...items[idx], cantidad: soloEntero };
        // Si la cantidad queda inválida, limpiar precio
        if (!soloEntero || Number(soloEntero) <= 0) {
          items[idx].precioUnitario = '';
        }
      } else {
        items[idx] = { ...items[idx], [field]: value };
      }
      return { ...prev, items };
    });
    if (errors.items) setErrors(prev => ({ ...prev, items: '' }));
  };

  const handleInsumoSelect = (idx, nombreInsumo) => {
    const insumo = todosInsumos.find(i => i.nombre === nombreInsumo);
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        insumo:         nombreInsumo,
        insumoId:       insumo ? insumo.id : '',
        unidad:         insumo ? (insumo.unidadMedida || '') : items[idx].unidad,
        cantidad:       '',         // usuario ingresa cantidad
        precioUnitario: '',         // usuario ingresa precio del día
        // Cambiar de insumo empieza el modo de compra desde cero: "libre en
        // cada compra" — no se arrastra ni el modo ni los datos de la
        // presentación anterior.
        modo: 'directo',
        presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
      };
      return { ...prev, items };
    });
    if (errors.items) setErrors(prev => ({ ...prev, items: '' }));
  };

  // Alterna Directo <-> Por presentación para un ítem. Limpia los campos del
  // modo que se abandona para no arrastrar datos a medio llenar.
  const handleModoChange = (idx, modo) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = modo === 'presentacion'
        ? { ...items[idx], modo, cantidad: '', precioUnitario: '' }
        : { ...items[idx], modo, presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '' };
      return { ...prev, items };
    });
    if (errors.items) setErrors(prev => ({ ...prev, items: '' }));
  };

  const handlePresentacionChange = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      let v = value;
      if (field === 'presentacionCantidad') {
        // Cantidad de cajas/paquetes/etc.: siempre entero
        v = value.replace(/[^0-9]/g, '');
      } else if (field === 'presentacionContenido') {
        // Contenido por presentación: entero si la unidad real es "unidad",
        // decimal si es kg/g/lb/oz/L/mL.
        v = items[idx].unidad === 'unidad' ? value.replace(/[^0-9]/g, '') : value.replace(/[^0-9.]/g, '');
      }
      items[idx] = { ...items[idx], [field]: v };
      return { ...prev, items };
    });
    if (errors.items) setErrors(prev => ({ ...prev, items: '' }));
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  };

  const removeItem = (idx) => {
    if (form.items.length === 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
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
      // PDF: esta versión no convierte PDF a imagen para el análisis OCR,
      // así que no se puede verificar automáticamente el total. El
      // comprobante se adjunta igual — el usuario solo debe confirmarlo.
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
        // Aunque el OCR no haya podido validar el total, la fecha/NIT sí
        // pueden haberse leído — se muestran igual en el recuadro de datos.
        if (resultado.fechaDetectada || resultado.nitDetectado) {
          setChequeoOCR({
            fecha: resultado.fechaDetectada || null,
            fechaCoincide: fechaNormalizada ? fechaNormalizada === form.fecha : null,
            nit: resultado.nitDetectado || null,
            nitCoincide: null,
            proveedorCoincide: null,
            total: null,
            totalCoincide: null,
            advertencias: [],
          });
        }
        return;
      }

      setTotalDetectadoOCR(resultado.total);

      // El OCR es informativo: nunca bloquea el registro de la compra, solo
      // reúne advertencias para que el usuario las revise y confirme.
      const advertencias = [];

      const totalCoincide = resultado.total === totalFinal;
      if (!totalCoincide) {
        advertencias.push(`El total del comprobante (${formatCOP(resultado.total)}) no coincide con el total de la compra (${formatCOP(totalFinal)}).`);
      }

      let nitCoincide = null;
      // El documento a comparar depende del tipo de persona: Jurídica usa
      // "nit"; Natural solo tiene un NIT real para comparar cuando eligió
      // "NIT" como tipo de documento (con CC/TI/CE/Pasaporte no hay nada
      // que comparar contra un NIT detectado, así que se omite el aviso).
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

      setChequeoOCR({
        fecha: resultado.fechaDetectada || null, fechaCoincide,
        nit: resultado.nitDetectado || null, nitCoincide,
        proveedorCoincide,
        total: resultado.total, totalCoincide,
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

  // El resto del sistema (stock, total, historial) trabaja en "cantidad de
  // la unidad real × precio por unidad real" — igual que el modo "directo"
  // de siempre. En modo "presentación" derivamos esos mismos dos números a
  // partir de lo que el usuario contestó (cajas/paquetes, contenido y
  // precio por presentación), preservando el valor exacto de la compra
  // (nunca se "pierde" plata al convertir). Los datos de la presentación
  // también viajan aparte, por si el backend los quiere guardar para
  // trazabilidad, pero cantidad/precioUnitario ya quedan listos para que
  // el resto del sistema los use sin saber que existió un modo especial.
  const prepararItemParaEnvio = (it) => {
    if (it.modo === 'presentacion') {
      const cantidadPresentaciones = Number(it.presentacionCantidad) || 0;
      const contenidoPorPresentacion = Number(it.presentacionContenido) || 0;
      const precioPresentacion = Number(it.presentacionPrecio) || 0;
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
        },
      };
    }
    return {
      insumo: it.insumo, unidad: it.unidad,
      cantidad: parseInt(it.cantidad, 10),
      precioUnitario: Number(it.precioUnitario),
    };
  };

  // 3 — aparte del checkbox de "revisé el comprobante" (que ya bloquea el
  // botón hasta marcarse), se pide una confirmación explícita en un diálogo
  // cuando el OCR no pudo validar el comprobante automáticamente — recién
  // ahí, si el admin confirma, se sube el archivo y se manda la compra.
  const [confirmSinValidar, setConfirmSinValidar] = useState(false);

  const enviarCompra = async () => {
    setSubiendoComprobante(true);
    try {
      const comprobanteUrl = await uploadToCloudinary(comprobanteFile);
      onSubmit({
        ...form,
        items: form.items.map(prepararItemParaEnvio),
        total: totalFinal,
        total_bruto: totalBruto,
        descuento: descuentoNum,
        comprobante_url: comprobanteUrl,
        comprobante_verificado: comprobanteOk,
        comprobante_total_ocr: totalDetectadoOCR,
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
      return;
    }
    // El OCR no validó el total automáticamente (no coincidió, o no se pudo
    // leer) — se pide confirmar explícitamente antes de mandar la compra,
    // en vez de enviarla directo.
    if (!comprobanteOk) {
      setConfirmSinValidar(true);
      return;
    }
    await enviarCompra();
  };

  return (
    <>
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">

        <div className={`fg ${errors.proveedorNombre ? 'fg-error' : ''}`}>
          <label>Proveedor <span className="req">*</span></label>
          {proveedores.length > 0 ? (
            <select name="proveedorId" value={form.proveedorId} onChange={handleChange}>
              <option value="">-- Seleccionar proveedor --</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          ) : (
            <div style={{ padding: '10px 14px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227' }}>
              ⚠ No hay proveedores activos registrados.
            </div>
          )}
          {errors.proveedorNombre && <span className="err-msg">{errors.proveedorNombre}</span>}
        </div>

        <div className={`fg ${errors.fecha ? 'fg-error' : ''}`}>
          <label>Fecha de compra <span className="req">*</span></label>
          <input
            type="date" name="fecha" value={form.fecha}
            onChange={handleChange}
          />
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
          </span>
          <button type="button" className="btn-add-item" onClick={addItem} disabled={!form.proveedorId}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Agregar insumo
          </button>
        </div>

        {form.proveedorId && insumosFiltrados.length === 0 && (
          <div style={{ padding: '12px 16px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227', marginBottom: 10 }}>
            ⚠ El proveedor seleccionado no tiene insumos asociados. Registra insumos para este proveedor en Gestión de Insumos.
          </div>
        )}

        {errors.items && <div className="items-error-msg">{errors.items}</div>}

        <div className="items-table-head">
          <span>Insumo</span>
          <span>Unidad</span>
          <span>Modo</span>
          <span>Cantidad</span>
          <span>Precio unit. (pagado hoy)</span>
          <span>Subtotal</span>
          <span></span>
        </div>

        {form.items.map((item, idx) => {
          const enPresentacion = item.modo === 'presentacion';
          const contenidoEsEntero = item.unidad === 'unidad';
          return (
          <div key={idx} className="item-block">
            <div className="item-row">
              {form.proveedorId && insumosFiltrados.length > 0 ? (
                <select value={item.insumo} onChange={e => handleInsumoSelect(idx, e.target.value)}>
                  <option value="">-- Seleccionar insumo --</option>
                  {insumosFiltrados.map(i => (
                    <option key={i.id} value={i.nombre}>{i.nombre}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={form.proveedorId ? 'Sin insumos para este proveedor' : 'Selecciona un proveedor primero'}
                  value={item.insumo}
                  readOnly
                  style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                />
              )}
              <input
                type="text"
                value={item.unidad}
                readOnly
                placeholder="—"
                style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
              />

              {/* Modo de compra: libre por ítem, no se recuerda entre compras */}
              <div className="item-modo-toggle">
                <button type="button" className={!enPresentacion ? 'active' : ''} onClick={() => handleModoChange(idx, 'directo')}>
                  Directo
                </button>
                <button type="button" className={enPresentacion ? 'active' : ''} disabled={!item.insumo}
                  onClick={() => handleModoChange(idx, 'presentacion')} title={!item.insumo ? 'Selecciona un insumo primero' : ''}>
                  Presentación
                </button>
              </div>

              {enPresentacion ? (
                <>
                  <div className="item-presentacion-hint">Detalle abajo ↓</div>
                  <div className="item-presentacion-hint" aria-hidden="true"></div>
                </>
              ) : (
                <>
                  <input
                    type="number" placeholder="0" step="1"
                    value={item.cantidad}
                    onChange={e => handleItemChange(idx, 'cantidad', e.target.value)}
                    onKeyDown={e => {
                      // Bloquear punto, coma y e (notación científica)
                      if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                  />
                  {(() => {
                    const cantidadValida = item.cantidad !== '' && !isNaN(item.cantidad) && Number(item.cantidad) >= 1 && Number.isInteger(Number(item.cantidad));
                    return (
                      <input
                        type="number" placeholder={cantidadValida ? 'Mín. $1.000' : 'Ingresa cantidad primero'} step="1"
                        value={item.precioUnitario}
                        disabled={!cantidadValida}
                        onChange={e => handleItemChange(idx, 'precioUnitario', e.target.value)}
                        style={!cantidadValida ? { background: 'var(--bg-surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                      />
                    );
                  })()}
                </>
              )}

              <span className="item-subtotal">
                {formatCOP(subtotalItem(item))}
              </span>
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

            {/* 4 — recordatorio de "conviene comprarlo": mismo criterio de
                stock bajo que usa Insumos (stockActual <= stockMinimo),
                visible apenas se elige el insumo, sin importar el modo
                (directo o por presentación). */}
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

            {enPresentacion && (
              <div className="item-presentacion-panel">
                <div className="fg">
                  <label>Tipo de presentación</label>
                  <select value={item.presentacionTipo} onChange={e => handlePresentacionChange(idx, 'presentacionTipo', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {TIPOS_PRESENTACION.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
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
                <div className="fg">
                  <label>{preguntaContenidoPresentacion(item.unidad, item.presentacionTipo)}</label>
                  <input
                    type="number" step={contenidoEsEntero ? '1' : '0.01'}
                    placeholder={contenidoEsEntero ? 'Ej: 25' : 'Ej: 5.5'}
                    value={item.presentacionContenido}
                    onChange={e => handlePresentacionChange(idx, 'presentacionContenido', e.target.value)}
                    onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                  />
                </div>
                <div className="fg">
                  <label>Precio por {(item.presentacionTipo || 'presentación').toLowerCase()}</label>
                  <input
                    type="number" step="1" placeholder="Mín. $1.000"
                    value={item.presentacionPrecio}
                    onChange={e => handlePresentacionChange(idx, 'presentacionPrecio', e.target.value)}
                  />
                </div>
                {stockRealItem(item) > 0 && (
                  <div className="item-presentacion-info">
                    ℹ Se sumarán <strong>{stockRealItem(item)} {item.unidad}</strong> al stock{item.insumo ? ` de "${item.insumo}"` : ''} — este número es informativo, no se usa para el valor de la compra.
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}

        {descuentoNum > 0 && (
          <div className="compra-total-row" style={{ fontWeight: 500, fontSize: 13 }}>
            <span>Subtotal (sin descuento)</span>
            <span>{formatCOP(totalBruto)}</span>
          </div>
        )}
        <div className="compra-total-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Descuento (%)
            <input
              type="number" step="0.01" placeholder="0"
              value={descuento}
              onChange={e => { setDescuento(e.target.value); if (errors.descuento) setErrors(prev => ({ ...prev, descuento: '' })); }}
              style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: `1.5px solid ${errors.descuento ? '#EF5350' : 'var(--border-input)'}`, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </span>
          {descuentoNum > 0 && <span style={{ color: '#C9A227', fontWeight: 600 }}>-{formatCOP(totalBruto - totalFinal)}</span>}
        </div>
        {errors.descuento && <div className="items-error-msg">{errors.descuento}</div>}
        <div className="compra-total-row">
          <span>Total de la compra</span>
          <span className="compra-total-value">{formatCOP(totalFinal)}</span>
        </div>
      </div>

      {/* ── Comprobante de compra + validación OCR ── */}
      <div className={`fg fg-full ${errors.comprobante ? 'fg-error' : ''}`} style={{ marginTop: 4 }}>
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

        {/* Error simple: archivo inválido (tipo/tamaño), antes de que exista un
            comprobante cargado — no forma parte del informe OCR unificado. */}
        {!procesandoOCR && comprobanteError && !comprobanteFile && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(229,57,53,0.12)', color: '#EF5350', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {comprobanteError}
          </div>
        )}

        {/* ── Informe de validación OCR — un solo bloque visual, orden fijo:
            1) aviso general, 2) recuadro de datos detectados
            (Fecha/NIT/Proveedor/Total), 3) advertencias (sin duplicados).
            El OCR es informativo: nunca bloquea el registro, solo exige
            un check de confirmación cuando encuentra diferencias. ── */}
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
              {/* 1) Aviso general */}
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

              {/* 2) Recuadro de datos detectados (Fecha / NIT / Proveedor / Total) */}
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

              {/* 3) Advertencias — deduplicadas, todas juntas debajo */}
              {chequeoOCR?.advertencias?.length > 0 && (
                <ul style={{ margin: 0, padding: '10px 14px 10px 30px', fontSize: 12.5, color: '#C9A227', background: 'rgba(201,162,39,0.06)', borderTop: `1px solid ${colores.borde}` }}>
                  {chequeoOCR.advertencias.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                </ul>
              )}

              {/* Confirmación explícita cuando el OCR no dio un match limpio */}
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
        <button type="submit" className="btn-form-submit" disabled={procesandoOCR || subiendoComprobante || !comprobanteFile || (!comprobanteOk && !confirmarPeseAdvertencia)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {subiendoComprobante ? 'Guardando...' : 'Registrar compra'}
        </button>
      </div>
    </form>

    {/* 3 — el OCR no pudo validar el comprobante automáticamente (no se
        pudo leer el total, o no coincidió); antes de mandar la compra igual
        se pide esta confirmación aparte del checkbox de "revisé el
        comprobante" de más arriba. */}
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