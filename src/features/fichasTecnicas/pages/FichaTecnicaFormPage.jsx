import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import fichasTecnicasService from '../services/fichasTecnicasService';
import productosService from '../../productos/services/productosService';
import insumosService from '../../insumos/services/insumosService';
import toppingsService from '../../toppings/services/toppingsService';
import adicionesService from '../../adiciones/services/adicionesService';
import InsumoSearchSelect from '../../../shared/components/InsumoSearchSelect';
import '../../insumos/pages/InsumosPage.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';
// Vocabulario y derivación del tipo de preparación a partir de la categoría
// del producto — espejo exacto del backend (config/tiposPreparacion.js), que
// aplica estas mismas reglas al guardar.
import { CATEGORIAS_PREP, derivarTipoPreparacion, resolverTipoPreparacion } from '../../../shared/utils/tiposPreparacion';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
const fmtPct = n => `${Math.round((n||0)*100)}%`;

// Margen de ganancia mínimo esperado por el negocio (30%). Se usa solo para
// advertir al administrador — nunca bloquea el guardado de la ficha.
const MARGEN_MINIMO = 0.30;

// Un insumo es "vaso" si pertenece a una categoría de insumos cuyo nombre
// contiene "vaso" o "desechable" (ej. "Insumos desechables (Vasos)" o,
// igual de válido, simplemente "Insumos desechables") — la categoría se
// gestiona en Postgres (categorias_insumos), no hay ninguna lista de
// insumos hardcodeada aquí.
const esCategoriaVaso = insumo => {
  const nombreCat = (insumo?.categoria || '').toLowerCase();
  return nombreCat.includes('vaso') || nombreCat.includes('desechable');
};

// Íconos reutilizados en todo el módulo.
const IconMas = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconInfo = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
const IconAlerta = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>;
const IconX = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconGuardar = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;

// El backend puede devolver el identificador como `id_ficha` o como `id`
// según el endpoint — mismo helper ya usado en FichasTecnicasPage.jsx.
const getFichaId = f => f?.id_ficha ?? f?.id;

// ── Página: Nueva / Editar Ficha Técnica ─────────────────────────────────────
// Antes era un modal (ModalFichaForm) superpuesto sobre el listado — ahora
// es una página completa propia, con más espacio para los 4 pasos del
// asistente (Producto, Insumos, Toppings, Vaso y preparación). La lógica
// interna de validación, cálculo de márgenes, sincronización de toppings y
// vista previa de preparación es EXACTAMENTE la misma que ya tenía el
// modal — lo único que cambió es el contenedor (de modal a página) y cómo
// se entra/sale de ella (navegación en vez de props onClose/onSave).
export default function FichaTecnicaFormPage() {
  const navigate = useNavigate();
  const { id } = useParams(); // presente solo al editar (/fichas-tecnicas/editar/:id)
  const esEdicion = !!id;

  // ── Carga inicial: la ficha a editar (si aplica) + el catálogo de fichas
  // ya existentes (para el chequeo de "un producto = una ficha"). Antes el
  // modal recibía `fichaInicial`/`fichasExistentes` ya cargados por el
  // padre (FichasTecnicasPage) — como página independiente, los carga ella
  // misma al entrar.
  const [fichaInicial, setFichaInicial] = useState(null);
  const [fichasExistentes, setFichasExistentes] = useState([]);
  const [cargandoInicial, setCargandoInicial] = useState(esEdicion);
  const [errorCarga, setErrorCarga] = useState('');
  useEffect(() => {
    fichasTecnicasService.getAll()
      .then(d => setFichasExistentes(Array.isArray(d) ? d : []))
      .catch(() => setFichasExistentes([]));
    if (esEdicion) {
      fichasTecnicasService.getById(id)
        .then(f => setFichaInicial(f))
        .catch(err => setErrorCarga(err?.message || 'No se pudo cargar la ficha técnica a editar.'))
        .finally(() => setCargandoInicial(false));
    }
  }, [id, esEdicion]);

  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos]     = useState([]);
  // Catálogo de adiciones (universales, aplican a todo el menú) — se usa
  // solo para la "Vista previa de preparación" de más abajo.
  const [adiciones, setAdiciones] = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => {
      const lista = Array.isArray(d) ? d : [];
      // Se muestran los productos activos y, además, el de la ficha que se
      // está editando aunque esté inactivo: al desactivar una ficha la
      // cascada desactiva también su producto, así que sin esta excepción
      // el producto desaparecía del selector justo al volver a editar esa
      // misma ficha.
      const idActual = fichaInicial ? Number(fichaInicial.id_producto) : null;
      setProductos(lista.filter(p => p.estado === 'Activo' || (idActual && Number(p.id) === idActual)));
    }).catch(()=>{});
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(()=>{});
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a=>a.estado==='Activo') : [])).catch(()=>{});
  }, [fichaInicial]);

  // Al editar, cualquier columna puede venir NULL de fichas guardadas antes
  // de que existieran las validaciones actuales. Sin los respaldos de abajo,
  // String(null) dejaba literalmente el texto "null" dentro del campo.
  const construirDefault = (fi) => {
    const def = fi ? {
      id_producto: fi.id_producto != null ? String(fi.id_producto) : '',
      categoria_prep: fi.categoria_prep || 'Caliente',
      porciones: fi.porciones != null ? String(fi.porciones) : '1',
      tiempo_prep: fi.tiempo_prep != null ? String(fi.tiempo_prep) : '5',
      costo_estimado: fi.costo_estimado != null ? String(fi.costo_estimado) : '',
      estado: fi.estado !== false,
      notas: fi.notas || '',
      resumen_prep: fi.resumen_prep || '',
      preparacion: fi.preparacion || '',
      vaso_id: fi.vaso_id ? String(fi.vaso_id) : '',
      insumos: (fi.insumos || [])
        .filter(i => i && i.id_insumo != null)
        .map(i => ({ id_insumo: String(i.id_insumo), cantidad: i.cantidad != null ? String(i.cantidad) : '', unidad: i.unidad || 'g' })),
      toppings: Array.isArray(fi.toppings_ficha) && fi.toppings_ficha.length > 0
        ? fi.toppings_ficha.map(t => ({ id_insumo: String(t.id_insumo), cantidad: String(t.cantidad), unidad: t.unidad || 'g' }))
        : [],
    } : {
      id_producto:'', categoria_prep:'Caliente', porciones:'1', tiempo_prep:'5',
      costo_estimado:'', estado:true, notas:'', resumen_prep:'', preparacion:'', vaso_id:'',
      insumos:[{ id_insumo:'', cantidad:'', unidad:'g' }],
      toppings:[],
    };
    // Si una ficha antigua quedó guardada sin insumos, el formulario abre
    // igual con una fila vacía lista para llenar en vez de una sección en
    // blanco sin nada donde escribir.
    if (def.insumos.length === 0) def.insumos = [{ id_insumo:'', cantidad:'', unidad:'g' }];
    return def;
  };

  const [form, setForm] = useState(() => construirDefault(null));
  // Cuando fichaInicial termina de cargar (async), se reconstruye el
  // formulario con sus datos reales — antes el modal podía recibir
  // fichaInicial ya resuelta desde el primer render; acá llega un
  // instante después, así que hace falta este efecto.
  useEffect(() => {
    if (fichaInicial) setForm(construirDefault(fichaInicial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaInicial]);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  // Id de la ficha si ya se llegó a crear dentro de esta misma sesión de la
  // página (ver handleSubmit): sirve para que un reintento tras un fallo
  // parcial actualice esa ficha en vez de intentar crear una segunda.
  const [fichaYaCreadaId, setFichaYaCreadaId] = useState(null);

  // ── Asistente paso a paso (4 pasos) ──────────────────────────────────────
  const [paso, setPaso] = useState(1);
  const PASOS = [
    { n: 1, titulo: 'Producto',           desc: 'Elige el producto del menú y ajusta sus parámetros de producción.' },
    { n: 2, titulo: 'Insumos',            desc: 'Agrega los insumos que requiere esta ficha y su cantidad.' },
    { n: 3, titulo: 'Toppings',           desc: 'Toppings gratuitos, específicos de este producto (opcional).' },
    { n: 4, titulo: 'Vaso y preparación', desc: 'Elige el vaso, describe la preparación y guarda la ficha.' },
  ];

  // 2 — Toppings: se manejan como registros aparte en la tabla `toppings`
  // (nombre + insumo_id + cantidad + productos_ids), ligados SIEMPRE a un
  // único producto (productos_ids: [id_producto]).
  const [toppingsCatalogo, setToppingsCatalogo] = useState([]);
  const [toppingsListo, setToppingsListo]       = useState(false);
  const [toppingsIniciales, setToppingsIniciales] = useState([]);
  const [toppingsPrefilled, setToppingsPrefilled] = useState(false);
  useEffect(() => {
    toppingsService.getAll()
      .then(d => setToppingsCatalogo(Array.isArray(d) ? d : []))
      .catch(() => setToppingsCatalogo([]))
      .finally(() => setToppingsListo(true));
  }, []);
  useEffect(() => {
    if (!toppingsListo || toppingsPrefilled || !fichaInicial) return;
    setToppingsPrefilled(true);
    const idProd = Number(fichaInicial.id_producto);
    const propios = toppingsCatalogo.filter(t =>
      t.insumo_id && Array.isArray(t.productos_ids) && t.productos_ids.length === 1 && Number(t.productos_ids[0]) === idProd
    );
    setToppingsIniciales(propios);
    if (fichaInicial.toppings_ficha?.length > 0) return;
    if (propios.length > 0) {
      setForm(f => ({...f, toppings: propios.map(t => ({ _toppingId: t.id, id_insumo: String(t.insumo_id), cantidad: String(t.cantidad ?? ''), unidad: t.unidad || 'g' }))}));
    }
  }, [toppingsListo, toppingsCatalogo, fichaInicial]);

  const prodSel = productos.find(p => p.id === Number(form.id_producto));
  const insumosConsumibles = insumos.filter(i => !esCategoriaVaso(i));
  const vasosDisponibles = insumos.filter(i => esCategoriaVaso(i) && i.estado === 'Activo');
  const vasoSel = insumos.find(i => String(i.id) === String(form.vaso_id));

  // Un producto solo puede tener UNA ficha técnica, activa o inactiva.
  const fichaDuplicada = !esEdicion && form.id_producto
    ? fichasExistentes.find(f => Number(f.id_producto) === Number(form.id_producto))
    : null;

  const tipoPrepDerivado   = derivarTipoPreparacion(prodSel?.categoria);
  const tipoPrepAutomatico = !!(prodSel && tipoPrepDerivado);
  const idProdSel  = prodSel?.id;
  const catProdSel = prodSel?.categoria;
  useEffect(() => {
    if (!idProdSel) return;
    setForm(f => {
      const resuelto = resolverTipoPreparacion(catProdSel, f.categoria_prep);
      return resuelto === f.categoria_prep ? f : { ...f, categoria_prep: resuelto };
    });
  }, [idProdSel, catProdSel]);

  const costoInsumos = form.insumos.reduce((s, i) => {
    const insumo = insumos.find(x => String(x.id) === String(i.id_insumo));
    const cant = Number(i.cantidad) || 0;
    return s + cant * (insumo?.precioUnitario || 0);
  }, 0);
  const costoCalculado = costoInsumos + (vasoSel?.precioUnitario || 0);
  const margenCalculado = prodSel && prodSel.precio > 0 ? (prodSel.precio - costoCalculado) / prodSel.precio : null;
  const margenBajo = prodSel && costoCalculado > 0 && margenCalculado !== null && margenCalculado < MARGEN_MINIMO;
  const costoSuperaPrecio = !!(prodSel && costoCalculado > 0 && costoCalculado >= prodSel.precio);
  const costoEstimadoSuperaPrecio = !!(prodSel && form.costo_estimado && !isNaN(form.costo_estimado) && Number(form.costo_estimado) >= prodSel.precio);

  const setF = (k, v) => { setForm(f => ({...f, [k]:v})); setErrors(e => ({...e, [k]:''})); };
  const addIns = () => setForm(f => ({...f, insumos:[...f.insumos, {id_insumo:'',cantidad:'',unidad:'g'}]}));
  const removeIns = i => setForm(f => ({...f, insumos:f.insumos.filter((_,idx)=>idx!==i)}));
  const setIns = (i,k,v) => setForm(f => { const ins=[...f.insumos]; ins[i]={...ins[i],[k]:v}; return {...f,insumos:ins}; });

  const addTop = () => setForm(f => ({...f, toppings:[...f.toppings, {id_insumo:'',cantidad:'',unidad:'g'}]}));
  const removeTop = i => setForm(f => ({...f, toppings:f.toppings.filter((_,idx)=>idx!==i)}));
  const setTop = (i,k,v) => setForm(f => { const t=[...f.toppings]; t[i]={...t[i],[k]:v}; return {...f,toppings:t}; });

  const idsUsadosEnOtrasFilas = (lista, idx) =>
    new Set(lista.filter((_,j) => j!==idx).map(r => r.id_insumo).filter(Boolean).map(String));

  // ── Vista previa de preparación ("Simular receta") ──────────────────────
  const [previewAbierto, setPreviewAbierto] = useState(false);
  const [previewToppingsFuera, setPreviewToppingsFuera] = useState(() => new Set());
  const [previewAdicionesSel, setPreviewAdicionesSel] = useState(() => new Set());
  const previewToggleTopping = idx => setPreviewToppingsFuera(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });
  const previewToggleAdicion = idAd => setPreviewAdicionesSel(prev => {
    const next = new Set(prev);
    next.has(idAd) ? next.delete(idAd) : next.add(idAd);
    return next;
  });
  const nombreInsumoPreview = idI => insumos.find(x => String(x.id) === String(idI))?.nombre || `Insumo #${idI}`;
  const previewToppingsIncluidos = form.toppings
    .map((t, idx) => ({ ...t, _idx: idx }))
    .filter(t => t.id_insumo && !previewToppingsFuera.has(t._idx));
  const previewAdicionesIncluidas = adiciones.filter(a => previewAdicionesSel.has(a.id));
  const previewInsumosCombinados = (() => {
    const mapa = new Map();
    const agregar = (idInsumo, cantidad, unidad) => {
      if (!idInsumo || !cantidad || isNaN(cantidad)) return;
      const key = String(idInsumo);
      const previo = mapa.get(key);
      if (previo) mapa.set(key, { ...previo, cantidad: previo.cantidad + Number(cantidad) });
      else mapa.set(key, { nombre: nombreInsumoPreview(idInsumo), cantidad: Number(cantidad), unidad: unidad || insumos.find(x=>String(x.id)===String(idInsumo))?.unidadMedida || '' });
    };
    form.insumos.forEach(i => agregar(i.id_insumo, i.cantidad, i.unidad));
    previewToppingsIncluidos.forEach(t => agregar(t.id_insumo, t.cantidad, t.unidad));
    previewAdicionesIncluidas.forEach(a => agregar(a.insumo_id, a.cantidad, a.unidad));
    return Array.from(mapa.values());
  })();

  const errorNumerico = (valor, min, max) => {
    if (valor === '' || valor === null || valor === undefined || isNaN(valor)) return `Ingresa un número entre ${min} y ${max}`;
    const n = Number(valor);
    if (!Number.isInteger(n)) return 'Debe ser un número entero';
    if (n < min || n > max) return `Debe estar entre ${min} y ${max}`;
    return '';
  };

  const hayInsumosRepetidos = (lista) => {
    const ids = lista.map(x => x.id_insumo).filter(Boolean).map(String);
    return new Set(ids).size !== ids.length;
  };

  const validate = () => {
    const er = {};
    if (!form.id_producto) er.id_producto = 'Selecciona un producto';
    er.porciones   = errorNumerico(form.porciones, 1, 1000);
    er.tiempo_prep = errorNumerico(form.tiempo_prep, 1, 1440);
    if (!er.porciones)   delete er.porciones;
    if (!er.tiempo_prep) delete er.tiempo_prep;
    if (form.costo_estimado === '' || isNaN(form.costo_estimado) || Number(form.costo_estimado) < 0) er.costo_estimado = 'Valor numérico ≥ 0 requerido';
    else if (costoEstimadoSuperaPrecio) er.costo_estimado = 'El costo estimado supera o iguala el valor de venta del producto. Revisa la ficha para evitar pérdidas.';
    if (!form.preparacion.trim()) er.preparacion = 'La preparación es obligatoria y no puede contener solo espacios en blanco';
    if (form.insumos.length === 0) er.insumos = 'Agrega al menos un insumo a la ficha técnica';
    else if (form.insumos.some(i => !i.id_insumo || i.cantidad === '' || isNaN(i.cantidad) || Number(i.cantidad) <= 0)) er.insumos = 'Completa todos los insumos con una cantidad mayor a 0';
    else if (hayInsumosRepetidos(form.insumos)) er.insumos = 'No puedes repetir el mismo insumo dos veces';
    if (!form.vaso_id) er.vaso_id = 'Selecciona el vaso utilizado para este producto';
    if (form.toppings.some(t => (t.id_insumo || t.cantidad) && (!t.id_insumo || t.cantidad === '' || isNaN(t.cantidad) || Number(t.cantidad) <= 0))) {
      er.toppings = 'Completa o quita las filas de toppings incompletas (cantidad mayor a 0)';
    } else if (hayInsumosRepetidos(form.toppings)) {
      er.toppings = 'No puedes repetir el mismo insumo dos veces en los toppings';
    }
    if (costoSuperaPrecio) {
      er.general = 'El costo estimado de producción supera o iguala el precio de venta del producto. Revise la ficha técnica para evitar pérdidas.';
    }
    if (fichaDuplicada) {
      er.id_producto = 'Este producto ya tiene una ficha técnica registrada. Edítala en vez de crear una nueva.';
    }
    setErrors(er); return Object.keys(er).length === 0;
  };

  const stepDeCampo = campo => {
    if (['id_producto','porciones','tiempo_prep','costo_estimado'].includes(campo)) return 1;
    if (campo === 'insumos') return 2;
    if (campo === 'toppings') return 3;
    return 4;
  };

  const validarPaso1 = () => {
    const er = { id_producto:'', porciones:'', tiempo_prep:'', costo_estimado:'' };
    if (!form.id_producto) er.id_producto = 'Selecciona un producto';
    else if (fichaDuplicada) er.id_producto = 'Este producto ya tiene una ficha técnica registrada. Edítala en vez de crear una nueva.';
    er.porciones   = errorNumerico(form.porciones, 1, 1000);
    er.tiempo_prep = errorNumerico(form.tiempo_prep, 1, 1440);
    if (form.costo_estimado === '' || isNaN(form.costo_estimado) || Number(form.costo_estimado) < 0) er.costo_estimado = 'Valor numérico ≥ 0 requerido';
    else if (costoEstimadoSuperaPrecio) er.costo_estimado = 'El costo estimado supera o iguala el valor de venta del producto. Revisa la ficha para evitar pérdidas.';
    setErrors(e => ({ ...e, ...er }));
    return !er.id_producto && !er.porciones && !er.tiempo_prep && !er.costo_estimado;
  };

  const validarPaso2 = () => {
    let mensaje = '';
    if (form.insumos.length === 0) mensaje = 'Agrega al menos un insumo a la ficha técnica';
    else if (form.insumos.some(i => !i.id_insumo || i.cantidad === '' || isNaN(i.cantidad) || Number(i.cantidad) <= 0)) mensaje = 'Completa todos los insumos con una cantidad mayor a 0';
    else if (hayInsumosRepetidos(form.insumos)) mensaje = 'No puedes repetir el mismo insumo dos veces';
    setErrors(e => ({ ...e, insumos: mensaje }));
    return !mensaje;
  };

  const validarPaso3 = () => {
    let mensaje = '';
    if (form.toppings.some(t => (t.id_insumo || t.cantidad) && (!t.id_insumo || t.cantidad === '' || isNaN(t.cantidad) || Number(t.cantidad) <= 0))) mensaje = 'Completa o quita las filas de toppings incompletas (cantidad mayor a 0)';
    else if (hayInsumosRepetidos(form.toppings)) mensaje = 'No puedes repetir el mismo insumo dos veces en los toppings';
    setErrors(e => ({ ...e, toppings: mensaje }));
    return !mensaje;
  };

  const handleSiguiente = () => {
    const ok = paso === 1 ? validarPaso1() : paso === 2 ? validarPaso2() : validarPaso3();
    if (ok) setPaso(p => Math.min(4, p + 1));
  };
  const handleAtras = () => setPaso(p => Math.max(1, p - 1));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) {
      setErrors(er => {
        const primerCampo = Object.keys(er).find(k => er[k]);
        if (primerCampo) setPaso(stepDeCampo(primerCampo));
        return er;
      });
      return;
    }
    setLoading(true);
    const toppingsFicha = form.toppings
      .filter(t => t.id_insumo && t.cantidad !== '' && !isNaN(t.cantidad) && Number(t.cantidad) > 0)
      .map(t => ({ id_insumo: Number(t.id_insumo), cantidad: Number(t.cantidad), unidad: t.unidad }));
    const { toppings: _formTopRaw, ...formSinToppingsRaw } = form;
    const data = {
      ...formSinToppingsRaw,
      id_producto: Number(form.id_producto),
      porciones: Number(form.porciones),
      tiempo_prep: Number(form.tiempo_prep),
      costo_estimado: Number(form.costo_estimado),
      vaso_id: Number(form.vaso_id),
      preparacion: form.preparacion.trim(),
      resumen_prep: form.resumen_prep.trim(),
      notas: form.notas.trim(),
      categoria_prep: resolverTipoPreparacion(prodSel?.categoria, form.categoria_prep),
      toppings_ficha: toppingsFicha,
    };
    try {
      const idExistente = fichaInicial ? getFichaId(fichaInicial) : fichaYaCreadaId;
      const r = idExistente
        ? await fichasTecnicasService.update(idExistente, data)
        : await fichasTecnicasService.create(data);
      if (r.error) { setErrors({general:r.error}); setLoading(false); return; }
      if (!idExistente) setFichaYaCreadaId(getFichaId(r));

      try {
        const idProd = Number(form.id_producto);
        const filasValidas = form.toppings.filter(t => t.id_insumo && t.cantidad !== '' && !isNaN(t.cantidad) && Number(t.cantidad) > 0);
        const idsConservados = new Set(filasValidas.filter(t => t._toppingId).map(t => t._toppingId));
        await Promise.all([
          ...filasValidas.map(t => {
            const insumo = insumos.find(x => String(x.id) === String(t.id_insumo));
            const payload = { nombre: insumo?.nombre || 'Topping', productos_ids: [idProd], estado: 'Activo', insumo_id: Number(t.id_insumo), cantidad: Number(t.cantidad) };
            return t._toppingId ? toppingsService.update(t._toppingId, payload) : toppingsService.create(payload);
          }),
          ...toppingsIniciales.filter(ti => !idsConservados.has(ti.id)).map(ti => toppingsService.remove(ti.id)),
        ]);
      } catch (topErr) {
        setErrors({general: 'La ficha se guardó, pero no se pudieron actualizar sus toppings: ' + (topErr.message || 'error desconocido')});
        setLoading(false);
        return;
      }

      // Antes: onSave(r) — el padre (FichasTecnicasPage) refrescaba la lista
      // y mostraba el toast. Como página independiente, se navega de vuelta
      // al listado con el mensaje de éxito en location.state (mismo patrón
      // ya usado entre RegistrarCompraPage → ComprasPage).
      navigate('/fichas-tecnicas', { state: { successMsg: esEdicion ? 'Ficha técnica actualizada' : 'Ficha técnica creada' } });
    } catch (err) {
      setErrors({general: err.message || 'No se pudo guardar la ficha técnica.'});
    } finally {
      setLoading(false);
    }
  };

  if (cargandoInicial) {
    return (
      <Layout>
        <div className="insumos-root">
          <div className="empty-state">
            <h3>Cargando ficha técnica…</h3>
          </div>
        </div>
      </Layout>
    );
  }

  if (esEdicion && !fichaInicial && !cargandoInicial) {
    return (
      <Layout>
        <div className="insumos-root">
          <div style={{background:'rgba(229,57,53,0.12)',border:'1px solid rgba(229,57,53,0.35)',color:'#E53935',padding:'14px 18px',borderRadius:10,fontSize:13}}>
            {errorCarga || 'No se encontró la ficha técnica solicitada.'}
          </div>
          <button className="btn-cancel" style={{marginTop:16}} onClick={() => navigate('/fichas-tecnicas')}>← Volver al listado</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="insumos-root">
        <div className="breadcrumb" style={{ marginBottom:16,display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--text-muted)' }}>
          <button onClick={() => navigate('/fichas-tecnicas')} style={{ background:'none',border:'none',cursor:'pointer',color:'#388E3C',fontWeight:600,padding:0,fontSize:13 }}>
            Fichas Técnicas
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          <span>{esEdicion ? 'Editar' : 'Nueva'}</span>
        </div>

        <div className="page-header">
          <h1 className="page-title">{esEdicion ? 'Editar ficha técnica' : 'Nueva ficha técnica'}</h1>
          <p className="page-subtitle">
            {esEdicion ? `Modificando: ${prodSel?.nombre || '…'}` : 'Registra los ingredientes y el proceso de preparación'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {errors.general && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red,#E53935)',padding:'10px 16px',borderRadius:8,marginBottom:20,fontSize:13}}>⚠ {errors.general}</div>}

          {/* ── Indicador de progreso del asistente ── */}
          <div style={{marginBottom:20, maxWidth:720}}>
            <div style={{display:'flex',alignItems:'flex-start',marginBottom:14}}>
              {PASOS.map((s, idx) => (
                <React.Fragment key={s.n}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,flex:'0 0 auto'}}>
                    <div style={{
                      width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:800,flexShrink:0,transition:'all .2s',
                      border: `2px solid ${s.n<=paso?'#4CAF50':'var(--border-input)'}`,
                      background: s.n<=paso?'#4CAF50':'var(--bg-surface)',
                      color: s.n<=paso?'#fff':'var(--text-muted)',
                    }}>
                      {s.n < paso ? '✓' : s.n}
                    </div>
                    <span style={{fontSize:10.5,fontWeight:700,color: s.n<=paso?'#4CAF50':'var(--text-muted)',textAlign:'center',width:74,lineHeight:1.2}}>{s.titulo}</span>
                  </div>
                  {idx < PASOS.length - 1 && (
                    <div style={{flex:1,height:2,background: s.n<paso?'#4CAF50':'var(--border-input)',margin:'15px 4px 0',transition:'background .2s'}}/>
                  )}
                </React.Fragment>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:800,color:'#4CAF50',textTransform:'uppercase',letterSpacing:0.6}}>
              Paso {paso} de {PASOS.length}
            </div>
            <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)',marginTop:2}}>{PASOS[paso-1].titulo}</div>
            <p style={{fontSize:12.5,color:'var(--text-secondary)',marginTop:4,marginBottom:0}}>{PASOS[paso-1].desc}</p>
          </div>

          {paso > 1 && prodSel && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,background:'var(--color-green-glow)',borderRadius:8,padding:'8px 14px',marginBottom:16,fontSize:12.5,flexWrap:'wrap',maxWidth:720}}>
              <span><strong>{prodSel.nombre}</strong> <span style={{color:'var(--text-secondary)'}}>({prodSel.categoria})</span></span>
              <span>Precio de venta: <strong style={{color:'var(--color-green)'}}>{fmt(prodSel.precio)}</strong></span>
            </div>
          )}

          {/* 1. Producto */}
          {paso === 1 && <>
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>1. Producto</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Producto *</label>
                <select value={form.id_producto} onChange={e => setF('id_producto', e.target.value)}
                  title="Producto del menú al que pertenece esta ficha técnica"
                  style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors.id_producto?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
                  <option value="">— Seleccionar —</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>)}
                </select>
                {errors.id_producto && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors.id_producto}</div>}
                {fichaDuplicada && (
                  <div style={{background:'rgba(245,176,0,0.12)',border:'1px solid rgba(245,176,0,0.4)',borderRadius:8,padding:'8px 10px',marginTop:6,fontSize:12,color:'#F57F17',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <IconAlerta style={{flexShrink:0}}/>
                    <span style={{flex:1}}>
                      Este producto ya tiene una ficha técnica{fichaDuplicada.estado ? '' : ' (inactiva)'}.
                    </span>
                    <button type="button" onClick={() => navigate(`/fichas-tecnicas/editar/${getFichaId(fichaDuplicada)}`)}
                      style={{padding:'4px 10px',borderRadius:6,border:'1.5px solid #F57F17',background:'transparent',color:'#F57F17',cursor:'pointer',fontSize:11,fontWeight:700}}>
                      Editar ficha existente
                    </button>
                  </div>
                )}
              </div>
              <div style={{gridColumn:'span 2'}}>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>
                  Tipo de preparación
                  {tipoPrepAutomatico && <span style={{fontWeight:500,color:'var(--text-muted)',marginLeft:6}}>(automático)</span>}
                </label>
                {tipoPrepAutomatico ? (
                  <div title={`Se toma de la categoría del producto (${prodSel?.categoria || '—'})`}
                    style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,background:'var(--bg-surface-2)',color:'var(--text-secondary)',cursor:'not-allowed',display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontWeight:700,color:'var(--text-primary)'}}>{form.categoria_prep}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)'}}>· según la categoría «{prodSel?.categoria}»</span>
                  </div>
                ) : (
                  <>
                    <select value={form.categoria_prep} onChange={e => setF('categoria_prep', e.target.value)}
                      title="Cómo se prepara este producto"
                      style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
                      {CATEGORIAS_PREP.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                      {prodSel
                        ? `La categoría «${prodSel.categoria || 'sin categoría'}» no indica cómo se prepara: elígelo aquí.`
                        : 'Elige primero un producto para que se complete automáticamente.'}
                    </div>
                  </>
                )}
              </div>
            </div>
            {prodSel && (
              <div style={{background:'var(--color-green-glow)',borderRadius:8,padding:'10px 14px',marginTop:10,display:'flex',gap:20,fontSize:13,flexWrap:'wrap'}}>
                <span><strong>Nombre:</strong> {prodSel.nombre}</span>
                <span><strong>Precio venta:</strong> <span style={{color:'var(--color-green)',fontWeight:700}}>{fmt(prodSel.precio)}</span></span>
                {form.costo_estimado && !isNaN(form.costo_estimado) && <span><strong>Margen:</strong> <span style={{color:'var(--color-green)',fontWeight:700}}>{fmt(prodSel.precio - Number(form.costo_estimado))}</span></span>}
              </div>
            )}
            {margenCalculado !== null && costoCalculado > 0 && (
              <div style={{
                background: costoSuperaPrecio ? 'rgba(229,57,53,0.12)' : margenBajo ? 'rgba(245,176,0,0.12)' : 'var(--color-green-glow)',
                border: costoSuperaPrecio ? '1px solid rgba(229,57,53,0.4)' : margenBajo ? '1px solid rgba(245,176,0,0.4)' : 'none',
                borderRadius:8, padding:'10px 14px', marginTop:10, display:'flex', gap:10, alignItems:'center', fontSize:13,
              }}>
                {costoSuperaPrecio || margenBajo
                  ? <IconAlerta style={{color: costoSuperaPrecio ? '#E53935' : '#F57F17', flexShrink:0}}/>
                  : <IconInfo style={{color:'var(--color-green)',flexShrink:0}}/>}
                <span>
                  <strong>Costo (insumos + vaso):</strong> {fmt(costoCalculado)} · <strong>Margen:</strong>{' '}
                  <span style={{color: costoSuperaPrecio ? '#E53935' : margenBajo ? '#F57F17' : 'var(--color-green)', fontWeight:700}}>{fmtPct(margenCalculado)}</span>
                  {costoSuperaPrecio && <span style={{color:'#E53935',fontWeight:600}}> — El costo estimado de producción supera o iguala el precio de venta del producto. Revise la ficha técnica para evitar pérdidas.</span>}
                  {!costoSuperaPrecio && margenBajo && <span style={{color:'#F57F17'}}> — El margen de ganancia del producto está por debajo del mínimo permitido ({fmtPct(MARGEN_MINIMO)}).</span>}
                </span>
              </div>
            )}
          </div>

          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>2. Parámetros de producción</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12}}>
              {[
                ['Unidad *','porciones','number','Cuántas unidades del producto final rinde esta ficha (ej: 1 vaso preparado)'],
                ['Tiempo (min) *','tiempo_prep','number','Tiempo estimado de preparación en minutos'],
                ['Costo estimado (COP) *','costo_estimado','number','Costo de producción estimado manualmente (referencia interna)'],
              ].map(([label,key,type,tip]) => (
                <div key={key}>
                  <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>{label}</label>
                  <input type={type} value={form[key]} onChange={e => setF(key, e.target.value)} title={tip}
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors[key]?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
                  {errors[key] && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors[key]}</div>}
                  {key === 'costo_estimado' && prodSel && (
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>
                      Precio de venta: <strong style={{color:'var(--color-green)'}}>{fmt(prodSel.precio)}</strong>
                    </div>
                  )}
                  {key === 'costo_estimado' && costoEstimadoSuperaPrecio && (
                    <div style={{fontSize:11,color:'#E53935',marginTop:4,display:'flex',alignItems:'flex-start',gap:5}}>
                      <IconAlerta width="12" height="12" style={{flexShrink:0,marginTop:1}}/>
                      <span>El costo estimado supera o iguala el valor de venta del producto. Revisa la ficha para evitar pérdidas.</span>
                    </div>
                  )}
                </div>
              ))}
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Estado</label>
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8}}>
                  <button type="button" title={form.estado?'Clic para marcar como inactiva':'Clic para marcar como activa'} className={`toggle-btn ${form.estado?'toggle-on':'toggle-off'}`} onClick={() => setF('estado', !form.estado)}><span className="toggle-thumb"/></button>
                  <span style={{fontSize:13,fontWeight:600,color:form.estado?'var(--color-green)':'var(--text-muted)'}}>{form.estado?'Activa':'Inactiva'}</span>
                </div>
              </div>
            </div>
          </div>
          </>}

          {/* 2. Insumos */}
          {paso === 2 && <>
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>3. Insumos requeridos</div>
            {errors.insumos && <div style={{fontSize:12,color:'#E53935',marginBottom:10}}>{errors.insumos}</div>}
            <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:6}}>
              {['Insumo','Cantidad','Unidad',''].map((h,i) => <div key={i} style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5}}>{h}</div>)}
            </div>
            {form.insumos.map((ins, i) => {
              const insumoSel = insumos.find(s => String(s.id) === String(ins.id_insumo));
              return (
              <div key={i} style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:8}}>
                <InsumoSearchSelect insumos={insumosConsumibles} value={ins.id_insumo}
                  excludeIds={idsUsadosEnOtrasFilas(form.insumos, i)}
                  onSelect={found => { setIns(i,'id_insumo',String(found.id)); setIns(i,'unidad',found.unidadMedida||'g'); }}
                  placeholder="Buscar insumo..." hasError={!!errors.insumos && !ins.id_insumo}/>
                <input type="number" step="0.1" placeholder="Cant." value={ins.cantidad} onChange={e => setIns(i,'cantidad',e.target.value)}
                  title="Cantidad a utilizar, en la unidad del insumo"
                  style={{padding:'9px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
                <span title="Unidad de medida registrada para este insumo — no se puede cambiar aquí"
                  style={{padding:'9px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12,background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center'}}>
                  {insumoSel?.unidadMedida || ins.unidad || '—'}
                </span>
                <button type="button" title="Quitar este insumo" onClick={() => removeIns(i)} disabled={form.insumos.length===1}
                  style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #ffcdd2',background:'rgba(229,57,53,0.12)',color:'#EF5350',cursor:'pointer',fontSize:12,opacity:form.insumos.length===1?0.4:1,display:'flex',alignItems:'center',justifyContent:'center'}}><IconX/></button>
              </div>
              );
            })}
            <button type="button" title="Agregar otro insumo a la ficha" onClick={addIns}
              style={{marginTop:6,padding:'7px 14px',background:'transparent',border:'1.5px dashed #4CAF50',borderRadius:8,color:'#4CAF50',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              <IconMas/>
              Agregar insumo
            </button>
          </div>
          </>}

          {/* 3. Toppings */}
          {paso === 3 && <>
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>4. Toppings</div>
            <p style={{fontSize:12,color:'var(--text-muted)',marginTop:0,marginBottom:14}}>
              Toppings gratuitos, específicos de <strong>este producto</strong> (pueden variar entre productos). No son lo mismo que las <strong>Adiciones</strong>, que son de pago y aplican a todo el menú por igual.
            </p>
            {errors.toppings && <div style={{fontSize:12,color:'#E53935',marginBottom:10}}>{errors.toppings}</div>}
            {form.toppings.length === 0 ? (
              <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>Esta ficha no tiene toppings propios todavía.</p>
            ) : (
              <>
                <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:6}}>
                  {['Insumo','Cantidad','Unidad',''].map((h,i) => <div key={i} style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5}}>{h}</div>)}
                </div>
                {form.toppings.map((top, i) => {
                  const insumoSel = insumos.find(s => String(s.id) === String(top.id_insumo));
                  return (
                    <div key={i} style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:8}}>
                      <InsumoSearchSelect insumos={insumosConsumibles} value={top.id_insumo}
                        excludeIds={idsUsadosEnOtrasFilas(form.toppings, i)}
                        onSelect={found => { setTop(i,'id_insumo',String(found.id)); setTop(i,'unidad',found.unidadMedida||'g'); }}
                        placeholder="Buscar insumo para el topping..." hasError={!!errors.toppings && !top.id_insumo}/>
                      <input type="number" step="0.1" placeholder="Cant." value={top.cantidad} onChange={e => setTop(i,'cantidad',e.target.value)}
                        title="Cantidad de este insumo que lleva el topping"
                        style={{padding:'9px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
                      <span title="Unidad de medida registrada para este insumo — no se puede cambiar aquí"
                        style={{padding:'9px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12,background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center'}}>
                        {insumoSel?.unidadMedida || top.unidad || '—'}
                      </span>
                      <button type="button" title="Quitar este topping" onClick={() => removeTop(i)}
                        style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #ffcdd2',background:'rgba(229,57,53,0.12)',color:'#EF5350',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}><IconX/></button>
                    </div>
                  );
                })}
              </>
            )}
            <button type="button" title="Agregar un topping a este producto" onClick={addTop}
              style={{marginTop:6,padding:'7px 14px',background:'transparent',border:'1.5px dashed #4CAF50',borderRadius:8,color:'#4CAF50',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              <IconMas/>
              Agregar topping
            </button>
          </div>
          </>}

          {paso === 4 && <>

          {/* Vista previa de preparación */}
          <div className="insumos-card" style={{padding:'0',marginBottom:14,overflow:'hidden',maxWidth:900}}>
            <button type="button" onClick={() => setPreviewAbierto(v => !v)}
              style={{width:'100%',padding:'16px 24px',background:'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',textAlign:'left'}}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,display:'flex',alignItems:'center',gap:8}}>
                <IconInfo/> Vista previa de preparación
              </span>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>{previewAbierto ? '▲ Ocultar' : '▼ Simular receta'}</span>
            </button>
            {previewAbierto && (
              <div style={{padding:'0 24px 20px'}}>
                <p style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic',margin:'0 0 16px',display:'flex',alignItems:'flex-start',gap:6}}>
                  <IconAlerta width="13" height="13" style={{flexShrink:0,marginTop:1,color:'#F57F17'}}/>
                  Esto no guarda nada, es solo para ver cómo quedaría la preparación con esta combinación — no se envía al backend ni se persiste.
                </p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:16}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Toppings incluidos</div>
                    {form.toppings.filter(t=>t.id_insumo).length === 0 ? (
                      <p style={{fontSize:12,color:'var(--text-muted)'}}>Esta ficha no tiene toppings.</p>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {form.toppings.map((t, idx) => t.id_insumo && (
                          <label key={idx} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer',color:'var(--text-primary)'}}>
                            <input type="checkbox" checked={!previewToppingsFuera.has(idx)} onChange={() => previewToggleTopping(idx)}/>
                            🧋 {nombreInsumoPreview(t.id_insumo)}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Adiciones a simular</div>
                    {adiciones.length === 0 ? (
                      <p style={{fontSize:12,color:'var(--text-muted)'}}>No hay adiciones activas registradas.</p>
                    ) : (
                      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                        {adiciones.map(a => {
                          const sel = previewAdicionesSel.has(a.id);
                          return (
                            <button type="button" key={a.id} onClick={() => previewToggleAdicion(a.id)}
                              style={{padding:'6px 12px',borderRadius:100,fontSize:12,fontWeight:600,cursor:'pointer',border:`1.5px solid ${sel?'var(--color-green,#2E7D32)':'var(--border)'}`,background:sel?'rgba(46,125,50,0.12)':'transparent',color:sel?'#2E7D32':'var(--text-secondary)'}}>
                              {a.nombre}{sel && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{background:'var(--bg-hover)',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Insumos combinados de esta simulación</div>
                  {previewInsumosCombinados.length === 0 ? (
                    <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>Agrega insumos a la ficha para ver el combinado.</p>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {previewInsumosCombinados.map((r, i) => (
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'5px 8px',borderRadius:6,background:i%2===0?'var(--bg-surface)':'transparent'}}>
                          <span style={{color:'var(--text-primary)'}}>{r.nombre}</span>
                          <strong style={{color:'var(--text-secondary)'}}>{r.cantidad} {r.unidad}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Preparación</div>
                  {form.preparacion.trim() ? (
                    <ol style={{paddingLeft:20,margin:0}}>
                      {form.preparacion.split('\n').filter(s=>s.trim()).map((p,i) => (
                        <li key={i} style={{fontSize:13,color:'var(--text-primary)',marginBottom:6,lineHeight:1.6}}>{p.replace(/^\d+\.\s*/,'')}</li>
                      ))}
                    </ol>
                  ) : (
                    <p style={{fontSize:12,color:'var(--text-muted)',margin:0}}>Todavía no escribiste los pasos de preparación.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Vaso utilizado */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>Vaso utilizado</div>
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Vaso principal de este producto *</label>
            <select value={form.vaso_id} onChange={e => setF('vaso_id', e.target.value)}
              title="Insumo tipo vaso (unidad de medida 'oz') en el que se sirve el producto"
              style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors.vaso_id?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
              <option value="">— Seleccionar —</option>
              {vasosDisponibles.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.tamanoOz ? ` - ${v.tamanoOz} oz` : ''}</option>)}
            </select>
            {errors.vaso_id && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors.vaso_id}</div>}
            {vasosDisponibles.length === 0 && (
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>
                No hay vasos activos registrados. Ve a Insumos y registra uno con unidad de medida "oz".
              </div>
            )}
          </div>

          {/* 5. Preparación */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>5. Proceso de preparación</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Resumen</label>
              <input type="text" value={form.resumen_prep} onChange={e => setF('resumen_prep', e.target.value)} placeholder="Descripción corta del proceso..."
                title="Descripción breve, opcional, del proceso de preparación"
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Pasos detallados *</label>
              <textarea value={form.preparacion} onChange={e => setF('preparacion', e.target.value)} rows={6}
                placeholder={'1. Primer paso...\n2. Segundo paso...\n3. Tercer paso...'}
                title="Pasos numerados del proceso de preparación"
                maxLength={LIMITES.PREPARACION}
                style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors.preparacion?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',resize:'vertical',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
              <div style={{fontSize:11,color:enElTope(form.preparacion,LIMITES.PREPARACION)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.preparacion,LIMITES.PREPARACION)}</div>
              {errors.preparacion && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors.preparacion}</div>}
            </div>
          </div>

          {/* 6. Notas */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:16,maxWidth:900}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>6. Notas opcionales</div>
            <textarea value={form.notas} onChange={e => setF('notas', e.target.value)} rows={3}
              placeholder="Temperatura de servicio, variaciones, observaciones..."
              title="Observaciones adicionales, opcionales"
              maxLength={LIMITES.NOTAS_FICHA}
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',resize:'vertical',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
            <div style={{fontSize:11,color:enElTope(form.notas,LIMITES.NOTAS_FICHA)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.notas,LIMITES.NOTAS_FICHA)}</div>
          </div>

          </>}

          {/* Navegación del asistente */}
          <div style={{display:'flex',justifyContent:'space-between',gap:10,maxWidth:900}}>
            <div>
              {paso > 1 && (
                <button type="button" className="btn-cancel" onClick={handleAtras}>← Atrás</button>
              )}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button type="button" className="btn-cancel" onClick={() => navigate('/fichas-tecnicas')}>Cancelar</button>
              {paso < 4 ? (
                <button key="btn-siguiente" type="button" className="btn-add" onClick={handleSiguiente} style={{display:'flex',alignItems:'center',gap:6}}>
                  Siguiente →
                </button>
              ) : (
                <button key="btn-guardar" type="submit" className="btn-add" disabled={loading || costoSuperaPrecio || costoEstimadoSuperaPrecio || !!fichaDuplicada}
                  title={costoSuperaPrecio || costoEstimadoSuperaPrecio ? 'El costo de producción supera o iguala el precio de venta — corrige la ficha antes de guardar' : fichaDuplicada ? 'Este producto ya tiene una ficha técnica registrada' : undefined}
                  style={{display:'flex',alignItems:'center',gap:6}}>
                  {loading ? 'Guardando...' : esEdicion ? <><IconGuardar/> Actualizar ficha</> : <><IconMas/> Guardar ficha técnica</>}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}