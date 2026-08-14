import React, { useState, useEffect } from 'react';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import fichasTecnicasService from '../services/fichasTecnicasService';
import productosService from '../../productos/services/productosService';
import insumosService from '../../insumos/services/insumosService';
import toppingsService from '../../toppings/services/toppingsService';
import adicionesService from '../../adiciones/services/adicionesService';
import InsumoSearchSelect from '../../../shared/components/InsumoSearchSelect';
import '../../insumos/pages/InsumosPage.css';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
const fmtPct = n => `${Math.round((n||0)*100)}%`;
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

// Vocabulario de "Tipo de preparación" — un único origen de verdad que
// comparten el formulario y el filtro del listado (antes solo vivía inline
// dentro del formulario, duplicándose si se necesitaba en otro lado).
const CATEGORIAS_PREP = ['Caliente','Frío','Batido','Al vapor','Sin preparación'];

// Margen de ganancia mínimo esperado por el negocio (30%). Se usa solo para
// advertir al administrador — nunca bloquea el guardado de la ficha.
const MARGEN_MINIMO = 0.30;

// Un insumo es "vaso" si pertenece a una categoría de insumos cuyo nombre
// contiene "vaso" o "desechable" (ej. "Insumos desechables (Vasos)" o,
// igual de válido, simplemente "Insumos desechables") — la categoría se
// gestiona en Postgres (categorias_insumos), no hay ninguna lista de
// insumos hardcodeada aquí. Esto separa "Insumos requeridos" (consumibles)
// de "Vaso utilizado" de forma explícita en vez de inferirlo de la unidad
// de medida (antes cualquier insumo en "oz" se trataba como vaso, lo que
// permitía elegir un vaso como ingrediente consumible y viceversa).
const esCategoriaVaso = insumo => {
  const nombreCat = (insumo?.categoria || '').toLowerCase();
  return nombreCat.includes('vaso') || nombreCat.includes('desechable');
};

// Íconos reutilizados en todo el módulo (reemplazan los emoji ✏️/💾/📋/💡/⏳
// que antes se mezclaban con este mismo estilo de SVG, para que Fichas
// Técnicas use un único lenguaje visual).
const IconEditar = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconGuardar = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IconMas = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconInfo = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
const IconAlerta = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>;
const IconX = (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
// InsumoSearchSelect (buscador con lupa para elegir insumo) vive en
// src/shared/components/InsumoSearchSelect.jsx — se extrajo de acá para
// poder reutilizarlo también en el formulario de Topping.

// El backend puede devolver el identificador como `id_ficha` o como `id`
// según el endpoint. Este helper evita que el frontend rompa si el nombre
// del campo cambia — antes se asumía siempre `id_ficha` y al ser `undefined`
// fallaban tanto el borrado (500 "sintaxis no válida para integer") como
// las keys de React (todas las filas compartían la misma key undefined).
const getFichaId = f => f?.id_ficha ?? f?.id;

// ── FORM MODAL ──────────────────────────────────────────────────────────────
function ModalFichaForm({ fichaInicial, fichasExistentes = [], onSave, onClose, onEditExisting }) {
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos]     = useState([]);
  // Catálogo de adiciones (universales, aplican a todo el menú) — se usa
  // solo para la "Vista previa de preparación" de más abajo, ninguna otra
  // parte de este formulario las necesitaba hasta ahora.
  const [adiciones, setAdiciones] = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => setProductos(Array.isArray(d) ? d.filter(p=>p.estado==='Activo') : [])).catch(()=>{});
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(()=>{});
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a=>a.estado==='Activo') : [])).catch(()=>{});
  }, []);
  const def = fichaInicial ? {
    id_producto: String(fichaInicial.id_producto),
    categoria_prep: fichaInicial.categoria_prep,
    porciones: String(fichaInicial.porciones),
    tiempo_prep: String(fichaInicial.tiempo_prep),
    costo_estimado: String(fichaInicial.costo_estimado),
    estado: fichaInicial.estado,
    notas: fichaInicial.notas || '',
    resumen_prep: fichaInicial.resumen_prep || '',
    preparacion: fichaInicial.preparacion || '',
    vaso_id: fichaInicial.vaso_id ? String(fichaInicial.vaso_id) : '',
    // Antes: fichaInicial.insumos.map(...) — si el backend no traía el
    // arreglo `insumos` en la ficha, esto tronaba al abrir "Editar".
    insumos: (fichaInicial.insumos || []).map(i => ({ id_insumo: String(i.id_insumo), cantidad: String(i.cantidad), unidad: i.unidad })),
    // 3 — si el backend ya trae `toppings_ficha` en la propia ficha (nuevo
    // campo, cantidad de cada topping específica de este producto), se
    // prefilena directo desde ahí. Si no viene (fichas guardadas antes de
    // este cambio), se prefilena aparte a partir del catálogo de toppings
    // — ver el efecto más abajo.
    toppings: Array.isArray(fichaInicial.toppings_ficha) && fichaInicial.toppings_ficha.length > 0
      ? fichaInicial.toppings_ficha.map(t => ({ id_insumo: String(t.id_insumo), cantidad: String(t.cantidad), unidad: t.unidad || 'g' }))
      : [],
  } : {
    id_producto:'', categoria_prep:'Caliente', porciones:'1', tiempo_prep:'5',
    costo_estimado:'', estado:true, notas:'', resumen_prep:'', preparacion:'', vaso_id:'',
    insumos:[{ id_insumo:'', cantidad:'', unidad:'g' }],
    toppings:[],
  };

  const [form, setForm] = useState(def);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // 2 — Toppings: se manejan como registros aparte en la tabla `toppings`
  // (nombre + insumo_id + cantidad + productos_ids), ligados SIEMPRE a un
  // único producto (productos_ids: [id_producto]) — a diferencia de un
  // topping "universal" creado desde el módulo Toppings, o de una Adición
  // (otro módulo, siempre paga y aplica a todos los productos). Cargamos el
  // catálogo completo una vez para poder detectar los que ya pertenecen a
  // este producto y prefilenar el formulario al editar.
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
    if (!toppingsListo || toppingsPrefilled) return;
    setToppingsPrefilled(true);
    if (!fichaInicial) return;
    const idProd = Number(fichaInicial.id_producto);
    // Solo los toppings creados desde ESTA pantalla (tienen insumo_id y
    // están ligados a un único producto) — un topping universal creado
    // desde el módulo Toppings no debe aparecer aquí ni ser tocado por
    // este formulario.
    const propios = toppingsCatalogo.filter(t =>
      t.insumo_id && Array.isArray(t.productos_ids) && t.productos_ids.length === 1 && Number(t.productos_ids[0]) === idProd
    );
    // Estos ids se usan para saber, al guardar, cuáles registros del
    // catálogo hay que borrar si el usuario los quita del formulario —
    // eso aplica igual sin importar de dónde se haya prefilenado `form.toppings`.
    setToppingsIniciales(propios);
    // 3 — si `def` ya prefilenó form.toppings desde `fichaInicial.toppings_ficha`
    // (el nuevo campo), no lo pisamos con lo que haya en el catálogo — solo
    // rellenamos acá como respaldo para fichas guardadas antes de que
    // existiera `toppings_ficha`.
    if (fichaInicial.toppings_ficha?.length > 0) return;
    if (propios.length > 0) {
      setForm(f => ({...f, toppings: propios.map(t => ({ _toppingId: t.id, id_insumo: String(t.insumo_id), cantidad: String(t.cantidad ?? ''), unidad: t.unidad || 'g' }))}));
    }
  }, [toppingsListo, toppingsCatalogo, fichaInicial]);

  const prodSel = productos.find(p => p.id === Number(form.id_producto));
  // Insumos consumibles (todo lo que NO es un vaso) para "Insumos
  // requeridos", y vasos activos (categoría "…Vasos…") para "Vaso
  // utilizado" — ambas listas vienen del mismo `insumos` ya cargado desde
  // Postgres, solo separadas por categoría para que nunca se mezclen.
  const insumosConsumibles = insumos.filter(i => !esCategoriaVaso(i));
  const vasosDisponibles = insumos.filter(i => esCategoriaVaso(i) && i.estado === 'Activo');
  const vasoSel = insumos.find(i => String(i.id) === String(form.vaso_id));

  // 3 — un producto solo puede tener una ficha técnica activa. Si estamos
  // creando (no editando) y el producto elegido ya tiene una ficha activa,
  // avisamos y ofrecemos saltar directo a editarla en vez de dejar crear
  // una segunda. El backend valida lo mismo (400) como respaldo por si este
  // filtro del frontend falla (ej. `fichasExistentes` desactualizado).
  const fichaDuplicada = !fichaInicial && form.id_producto
    ? fichasExistentes.find(f => Number(f.id_producto) === Number(form.id_producto) && f.estado)
    : null;

  // 16.6 — Validación automática de margen y costo de producción: costo
  // real calculado a partir de los insumos consumibles de la ficha MÁS el
  // vaso seleccionado (cantidad/1 × precio unitario registrado en
  // Postgres para cada uno), no del campo manual "Costo estimado". Los
  // toppings no suman costo porque en este sistema nunca lo tienen (tabla
  // `toppings` sin columna precio — siempre son gratuitos). Se recalcula
  // en cada render, así que reacciona al instante a cambios en
  // insumos/cantidades/vaso/producto.
  const costoInsumos = form.insumos.reduce((s, i) => {
    const insumo = insumos.find(x => String(x.id) === String(i.id_insumo));
    const cant = Number(i.cantidad) || 0;
    return s + cant * (insumo?.precioUnitario || 0);
  }, 0);
  const costoCalculado = costoInsumos + (vasoSel?.precioUnitario || 0);
  const margenCalculado = prodSel && prodSel.precio > 0 ? (prodSel.precio - costoCalculado) / prodSel.precio : null;
  // Advertencia (no bloquea): margen por debajo del mínimo del negocio.
  const margenBajo = prodSel && costoCalculado > 0 && margenCalculado !== null && margenCalculado < MARGEN_MINIMO;
  // Bloqueo (sí impide guardar): el costo iguala o supera el precio de venta.
  const costoSuperaPrecio = !!(prodSel && costoCalculado > 0 && costoCalculado >= prodSel.precio);
  // 5 — Bloqueo aparte: el campo manual "Costo estimado" tampoco puede
  // igualar o superar el precio de venta — es un chequeo distinto al de
  // arriba (que compara el costo CALCULADO desde insumos+vaso): este
  // compara lo que el usuario escribió a mano, en vivo mientras digita
  // (no solo al enviar). Antes solo bloqueaba si era estrictamente mayor
  // (>) y no había ninguna alerta visible hasta intentar guardar.
  const costoEstimadoSuperaPrecio = !!(prodSel && form.costo_estimado && !isNaN(form.costo_estimado) && Number(form.costo_estimado) >= prodSel.precio);

  const setF = (k, v) => { setForm(f => ({...f, [k]:v})); setErrors(e => ({...e, [k]:''})); };
  const addIns = () => setForm(f => ({...f, insumos:[...f.insumos, {id_insumo:'',cantidad:'',unidad:'g'}]}));
  const removeIns = i => setForm(f => ({...f, insumos:f.insumos.filter((_,idx)=>idx!==i)}));
  const setIns = (i,k,v) => setForm(f => { const ins=[...f.insumos]; ins[i]={...ins[i],[k]:v}; return {...f,insumos:ins}; });

  // 2 — mismos handlers que los de "Insumos requeridos", para la sección
  // de Toppings del formulario.
  const addTop = () => setForm(f => ({...f, toppings:[...f.toppings, {id_insumo:'',cantidad:'',unidad:'g'}]}));
  const removeTop = i => setForm(f => ({...f, toppings:f.toppings.filter((_,idx)=>idx!==i)}));
  const setTop = (i,k,v) => setForm(f => { const t=[...f.toppings]; t[i]={...t[i],[k]:v}; return {...f,toppings:t}; });

  // Ids de insumo ya elegidos en las OTRAS filas de una misma lista (no la
  // propia), para que el buscador de esa fila no vuelva a ofrecerlos —
  // evita agregar el mismo insumo dos veces como "Insumo requerido" (o dos
  // veces como "Topping"). Se usa por separado para cada lista.
  const idsUsadosEnOtrasFilas = (lista, idx) =>
    new Set(lista.filter((_,j) => j!==idx).map(r => r.id_insumo).filter(Boolean).map(String));

  // ── Vista previa de preparación ("Simular receta") ──────────────────────
  // Puramente visual: no guarda nada ni llama al backend, solo combina lo
  // que ya está cargado en el formulario (form.insumos, form.toppings) con
  // el catálogo de adiciones para simular cómo quedaría la receta con una
  // combinación elegida por el administrador.
  const [previewAbierto, setPreviewAbierto] = useState(false);
  // Los toppings de la ficha aparecen todos marcados por defecto (igual que
  // le llegan al cliente); acá solo se guardan los que el admin DESmarcó.
  const [previewToppingsFuera, setPreviewToppingsFuera] = useState(() => new Set());
  const [previewAdicionesSel, setPreviewAdicionesSel] = useState(() => new Set());
  const previewToggleTopping = idx => setPreviewToppingsFuera(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });
  const previewToggleAdicion = id => setPreviewAdicionesSel(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const nombreInsumoPreview = id => insumos.find(x => String(x.id) === String(id))?.nombre || `Insumo #${id}`;
  const previewToppingsIncluidos = form.toppings
    .map((t, idx) => ({ ...t, _idx: idx }))
    .filter(t => t.id_insumo && !previewToppingsFuera.has(t._idx));
  const previewAdicionesIncluidas = adiciones.filter(a => previewAdicionesSel.has(a.id));
  // Combina insumos base + los que aportan los toppings marcados + los que
  // aportan las adiciones seleccionadas, sumando cantidades cuando se
  // repite el mismo insumo (ej. la ficha ya usa leche y una adición también).
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

  const validate = () => {
    const er = {};
    if (!form.id_producto) er.id_producto = 'Selecciona un producto';
    if (!form.porciones || isNaN(form.porciones) || Number(form.porciones)<1) er.porciones = 'Número ≥ 1';
    if (!form.tiempo_prep || isNaN(form.tiempo_prep) || Number(form.tiempo_prep)<1) er.tiempo_prep = 'Número ≥ 1';
    if (!form.costo_estimado || isNaN(form.costo_estimado)) er.costo_estimado = 'Valor numérico requerido';
    else if (costoEstimadoSuperaPrecio) er.costo_estimado = 'El costo estimado supera o iguala el valor de venta del producto. Revisa la ficha para evitar pérdidas.';
    if (!form.preparacion.trim()) er.preparacion = 'La preparación es obligatoria';
    if (form.insumos.some(i => !i.id_insumo || !i.cantidad || isNaN(i.cantidad))) er.insumos = 'Completa todos los insumos';
    if (!form.vaso_id) er.vaso_id = 'Selecciona el vaso utilizado para este producto';
    // 2 — los toppings son opcionales (la ficha puede no tener ninguno),
    // pero una fila que ya se empezó a llenar debe completarse o quitarse.
    if (form.toppings.some(t => (t.id_insumo || t.cantidad) && (!t.id_insumo || !t.cantidad || isNaN(t.cantidad)))) {
      er.toppings = 'Completa o quita las filas de toppings incompletas';
    }
    // Bloqueo real: no se puede guardar una ficha cuyo costo de producción
    // (insumos + vaso) iguale o supere el precio de venta del producto.
    if (costoSuperaPrecio) {
      er.general = 'El costo estimado de producción supera o iguala el precio de venta del producto. Revise la ficha técnica para evitar pérdidas.';
    }
    // 3 — bloqueo frontend de duplicados (ver fichaDuplicada arriba). El
    // backend valida lo mismo con un 400 que queda cubierto por el
    // try/catch de handleSubmit si este filtro llega a fallar.
    if (fichaDuplicada) {
      er.id_producto = 'Este producto ya tiene una ficha técnica activa. Edítala en vez de crear una nueva.';
    }
    setErrors(er); return Object.keys(er).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); await new Promise(r => setTimeout(r, 600)); setLoading(false);
    // 3 — cantidad de cada topping específica de este producto: va en el
    // campo `toppings_ficha` de la propia ficha (igual que `insumos`), no
    // solo como registros aparte en la tabla `toppings` (ver el sync más
    // abajo, que se mantiene por compatibilidad con la selección de
    // toppings por defecto del Cajero).
    const toppingsFicha = form.toppings
      .filter(t => t.id_insumo && t.cantidad && !isNaN(t.cantidad))
      .map(t => ({ id_insumo: Number(t.id_insumo), cantidad: Number(t.cantidad), unidad: t.unidad }));
    // `toppings` (crudo, con _toppingId de uso interno) no se manda tal
    // cual — se excluye del spread para no confundir al backend con dos
    // campos de toppings a la vez; lo que se envía es `toppings_ficha`.
    const { toppings: _formTopRaw, ...formSinToppingsRaw } = form;
    const data = { ...formSinToppingsRaw, id_producto:Number(form.id_producto), porciones:Number(form.porciones), tiempo_prep:Number(form.tiempo_prep), costo_estimado:Number(form.costo_estimado), vaso_id:Number(form.vaso_id), toppings_ficha: toppingsFicha };
    // api.js lanza (throw) cuando el backend responde con error — ej. la
    // validación real de "el costo estimado supera el precio de venta".
    // Sin try/catch esa excepción quedaba sin capturar: el modal no
    // mostraba nada y el usuario veía como si "no se guardara" sin motivo.
    try {
      const r = fichaInicial ? await fichasTecnicasService.update(getFichaId(fichaInicial), data) : await fichasTecnicasService.create(data);
      if (r.error) { setErrors({general:r.error}); return; }

      // 2 — sincroniza los toppings ligados a este producto: crea/actualiza
      // los que quedaron en el formulario y elimina los que el usuario quitó.
      // No se hace antes de guardar la ficha (si la ficha falla, no queremos
      // dejar toppings huérfanos), y si esta parte falla no se revierte el
      // guardado de la ficha — ya quedó guardada — solo se avisa aparte.
      try {
        const idProd = Number(form.id_producto);
        const filasValidas = form.toppings.filter(t => t.id_insumo && t.cantidad && !isNaN(t.cantidad));
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
        // La ficha ya quedó guardada — no revertimos eso — pero no cerramos
        // el modal para que el error sea visible y el usuario pueda
        // reintentar (guardar de nuevo es seguro: no se duplica la ficha,
        // el backend la reconoce como ya existente si hiciera falta).
        setErrors({general: 'La ficha se guardó, pero no se pudieron actualizar sus toppings: ' + (topErr.message || 'error desconocido')});
        return;
      }

      onSave(r);
    } catch (err) {
      setErrors({general: err.message || 'No se pudo guardar la ficha técnica.'});
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:720,
        maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 28px 16px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',flexShrink:0}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:'var(--text-primary)'}}>{fichaInicial ? 'Editar ficha técnica' : 'Nueva ficha técnica'}</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{fichaInicial ? `Modificando: ${productos.find(p=>p.id===fichaInicial.id_producto)?.nombre}` : 'Registra los ingredientes y el proceso de preparación'}</div>
            </div>
          </div>
          <button onClick={onClose} title="Cerrar" style={{width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
            <IconX/>
          </button>
        </div>

        {/* Body - form */}
        <form onSubmit={handleSubmit} style={{padding:'20px 28px'}}>
          {errors.general && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 16px',borderRadius:8,marginBottom:20,fontSize:13}}>⚠ {errors.general}</div>}

          {/* 1. Producto */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>1. Producto</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Producto *</label>
                <select value={form.id_producto} onChange={e => setF('id_producto', e.target.value)}
                  title="Producto del menú al que pertenece esta ficha técnica"
                  style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors.id_producto?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
                  <option value="">— Seleccionar —</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>)}
                </select>
                {errors.id_producto && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors.id_producto}</div>}
                {/* 3 — aviso de duplicado, con salida directa a editar la
                    ficha existente en vez de dejar avanzar hacia una
                    segunda ficha para el mismo producto. */}
                {fichaDuplicada && (
                  <div style={{background:'rgba(245,176,0,0.12)',border:'1px solid rgba(245,176,0,0.4)',borderRadius:8,padding:'8px 10px',marginTop:6,fontSize:12,color:'#F57F17',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <IconAlerta style={{flexShrink:0}}/>
                    <span style={{flex:1}}>Este producto ya tiene una ficha técnica activa.</span>
                    <button type="button" onClick={() => onEditExisting && onEditExisting(fichaDuplicada)}
                      style={{padding:'4px 10px',borderRadius:6,border:'1.5px solid #F57F17',background:'transparent',color:'#F57F17',cursor:'pointer',fontSize:11,fontWeight:700}}>
                      Editar ficha existente
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Tipo de preparación</label>
                <select value={form.categoria_prep} onChange={e => setF('categoria_prep', e.target.value)}
                  title="Cómo se prepara este producto"
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
                  {CATEGORIAS_PREP.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {prodSel && (
              <div style={{background:'var(--color-green-glow)',borderRadius:8,padding:'10px 14px',marginTop:10,display:'flex',gap:20,fontSize:13,flexWrap:'wrap'}}>
                <span><strong>Nombre:</strong> {prodSel.nombre}</span>
                {/* 4 — categoría del producto autocompletada al elegirlo:
                    solo informativa/de referencia, no es el mismo campo que
                    "Tipo de preparación" (categoria_prep) de la ficha. */}
                <span title="Categoría del producto — solo informativa, no es el 'Tipo de preparación' de la ficha"><strong>Categoría (ref.):</strong> {prodSel.categoria}</span>
                <span><strong>Precio venta:</strong> <span style={{color:'var(--color-green)',fontWeight:700}}>{fmt(prodSel.precio)}</span></span>
                {form.costo_estimado && !isNaN(form.costo_estimado) && <span><strong>Margen:</strong> <span style={{color:'var(--color-green)',fontWeight:700}}>{fmt(prodSel.precio - Number(form.costo_estimado))}</span></span>}
              </div>
            )}
            {/* 16.6 — costo/margen calculado a partir de insumos + vaso, en
                vivo mientras se edita. Por debajo del margen mínimo del
                negocio: solo advierte. Costo ≥ precio de venta: bloquea el
                guardado (ver validate()) y se muestra en rojo aquí mismo,
                antes de que el usuario intente guardar. */}
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

          {/* 2. Parámetros */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>2. Parámetros de producción</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12}}>
              {[
                ['Unidad *','porciones','number','Cuántas unidades del producto final rinde esta ficha (ej: 1 vaso preparado)'],
                ['Tiempo (min) *','tiempo_prep','number','Tiempo estimado de preparación en minutos'],
                ['Costo estimado (COP) *','costo_estimado','number','Costo de producción estimado manualmente (referencia interna)'],
              ].map(([label,key,type,tip]) => (
                <div key={key}>
                  <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>{label}</label>
                  <input type={type} min="0" value={form[key]} onChange={e => setF(key, e.target.value)} title={tip}
                    style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors[key]?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
                  {errors[key] && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors[key]}</div>}
                  {/* 4 — precio de venta del producto, visible y permanente
                      junto a "Costo estimado" como referencia mientras se
                      digita (no depende de haber escrito nada todavía). */}
                  {key === 'costo_estimado' && prodSel && (
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>
                      Precio de venta: <strong style={{color:'var(--color-green)'}}>{fmt(prodSel.precio)}</strong>
                    </div>
                  )}
                  {/* 5 — alerta en vivo (onChange, no solo al guardar): si lo
                      que el usuario está escribiendo iguala o supera el
                      precio de venta del producto, se avisa de inmediato
                      bajo el campo, sin esperar a intentar guardar. */}
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

          {/* 3. Insumos */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>3. Insumos requeridos</div>
            {errors.insumos && <div style={{fontSize:12,color:'#E53935',marginBottom:10}}>{errors.insumos}</div>}
            <div style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:6}}>
              {['Insumo','Cantidad','Unidad',''].map((h,i) => <div key={i} style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5}}>{h}</div>)}
            </div>
            {form.insumos.map((ins, i) => {
              const insumoSel = insumos.find(s => String(s.id) === String(ins.id_insumo));
              return (
              <div key={i} style={{display:'grid',gridTemplateColumns:'3fr 1fr 1fr auto',gap:8,marginBottom:8}}>
                {/* 1 — buscador con lupa en vez del <select> plano: filtra
                    por nombre en tiempo real sobre la lista de insumos ya
                    cargada (no hace falta un ?q= al backend por cada tecla,
                    la lista de insumos no es tan grande como para paginar). */}
                <InsumoSearchSelect insumos={insumosConsumibles} value={ins.id_insumo}
                  excludeIds={idsUsadosEnOtrasFilas(form.insumos, i)}
                  onSelect={found => { setIns(i,'id_insumo',String(found.id)); setIns(i,'unidad',found.unidadMedida||'g'); }}
                  placeholder="Buscar insumo..." hasError={!!errors.insumos && !ins.id_insumo}/>
                <input type="number" min="0" step="0.1" placeholder="Cant." value={ins.cantidad} onChange={e => setIns(i,'cantidad',e.target.value)}
                  title="Cantidad a utilizar, en la unidad del insumo"
                  style={{padding:'9px 10px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:12,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
                {/* 16.4 — la unidad no es editable: siempre es la registrada en
                    Postgres para el insumo elegido (insumos.unidad), para que
                    nunca se pueda guardar una unidad distinta a la real. */}
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

          {/* 4. Toppings — a diferencia de "Insumos requeridos" (siempre se
              consumen), estos quedan registrados como toppings ligados
              ÚNICAMENTE a este producto (ver toggleProducto/productos_ids
              en el módulo Toppings). No confundir con las Adiciones (otro
              módulo aparte): las adiciones son de pago y aplican por igual
              a TODOS los productos; estos toppings son gratuitos y pueden
              variar de un producto a otro. */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
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
                      <input type="number" min="0" step="0.1" placeholder="Cant." value={top.cantidad} onChange={e => setTop(i,'cantidad',e.target.value)}
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

          {/* Vista previa de preparación — bloque colapsable, solo lectura/
              simulación: no guarda nada ni llama al backend, combina lo que
              ya está cargado en el formulario en el momento. */}
          <div className="insumos-card" style={{padding:'0',marginBottom:14,overflow:'hidden'}}>
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
                  {/* Toppings de esta ficha — todos marcados por defecto,
                      igual que le aparecen al cliente. */}
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

                  {/* Adiciones universales — ninguna marcada por defecto,
                      el admin simula cuáles pudo haber elegido el cliente. */}
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

                {/* Resultado combinado en vivo */}
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

                {/* Preparación — igual para cualquier variante, solo cambian
                    los insumos de arriba. */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Preparación</div>
                  {form.preparacion.trim() ? (
                    <ol style={{paddingLeft:20,margin:0}}>
                      {form.preparacion.split('\n').filter(s=>s.trim()).map((paso,i) => (
                        <li key={i} style={{fontSize:13,color:'var(--text-primary)',marginBottom:6,lineHeight:1.6}}>{paso.replace(/^\d+\.\s*/,'')}</li>
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
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
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
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>5. Proceso de preparación</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Resumen</label>
              <input type="text" value={form.resumen_prep} onChange={e => setF('resumen_prep', e.target.value)} placeholder="Descripción corta del proceso..."
                title="Descripción breve, opcional, del proceso de preparación"
                style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Pasos detallados *</label>
              <textarea value={form.preparacion} onChange={e => setF('preparacion', e.target.value)} rows={4}
                placeholder={'1. Primer paso...\n2. Segundo paso...\n3. Tercer paso...'}
                title="Pasos numerados del proceso de preparación"
                style={{width:'100%',padding:'10px 12px',border:`1.5px solid ${errors.preparacion?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:13,outline:'none',resize:'vertical',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
              {errors.preparacion && <div style={{fontSize:11,color:'#E53935',marginTop:3}}>{errors.preparacion}</div>}
            </div>
          </div>

          {/* 6. Notas */}
          <div className="insumos-card" style={{padding:'20px 24px',marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>6. Notas opcionales</div>
            <textarea value={form.notas} onChange={e => setF('notas', e.target.value)} rows={3}
              placeholder="Temperatura de servicio, variaciones, observaciones..."
              title="Observaciones adicionales, opcionales"
              style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',resize:'vertical',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-add" disabled={loading || costoSuperaPrecio || costoEstimadoSuperaPrecio || !!fichaDuplicada}
              title={costoSuperaPrecio || costoEstimadoSuperaPrecio ? 'El costo de producción supera o iguala el precio de venta — corrige la ficha antes de guardar' : fichaDuplicada ? 'Este producto ya tiene una ficha técnica activa' : undefined}
              style={{display:'flex',alignItems:'center',gap:6}}>
              {loading ? 'Guardando...' : fichaInicial ? <><IconGuardar/> Actualizar ficha</> : <><IconMas/> Registrar ficha técnica</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DETALLE MODAL ────────────────────────────────────────────────────────────
function ModalDetalleFicha({ ficha, onClose, onEditar, onAnular }) {
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos]     = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => setProductos(Array.isArray(d) ? d : [])).catch(()=>{});
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const p = productos.find(x => x.id === ficha.id_producto);
  const pasos = (ficha.preparacion || '').split('\n').filter(x => x.trim());
  // Antes: ficha.insumos (sin respaldo) — si el backend no traía el
  // arreglo, tronaba al abrir el detalle de esa ficha.
  const fichaInsumos = ficha.insumos || [];

  // 16.6 — mismo cálculo de costo/margen que en el formulario (insumos +
  // vaso), para que la advertencia siga visible al ver el detalle de una
  // ficha ya guardada.
  const vasoSel = insumos.find(i => String(i.id) === String(ficha.vaso_id));
  const costoCalculado = fichaInsumos.reduce((s, i) => {
    const insumo = insumos.find(x => x.id === i.id_insumo);
    return s + (Number(i.cantidad) || 0) * (insumo?.precioUnitario || 0);
  }, 0) + (vasoSel?.precioUnitario || 0);
  const margenCalculado = p && p.precio > 0 ? (p.precio - costoCalculado) / p.precio : null;
  const margenBajo = p && costoCalculado > 0 && margenCalculado !== null && margenCalculado < MARGEN_MINIMO;
  const costoSuperaPrecio = !!(p && costoCalculado > 0 && costoCalculado >= p.precio);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:680,
        maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:'var(--text-primary)'}}>{p?.nombre || 'Ficha técnica'}</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{ficha.categoria_prep} · {ficha.porciones} unidad{ficha.porciones>1?'es':''} · {ficha.tiempo_prep} min</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <Tooltip label="Editar">
              <button className="btn-add" onClick={onEditar} style={{padding:'8px',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}><IconEditar/></button>
            </Tooltip>
            <AnularButton onClick={onAnular} className="btn-confirm-danger" style={{padding:'8px',fontSize:12,borderRadius:8}}/>
            <button onClick={onClose} title="Cerrar" style={{width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
              <IconX width="15" height="15"/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{padding:'20px 24px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Información general</div>
              {[['Producto',p?.nombre||'—'],['Categoría',p?.categoria||'—'],['Tipo prep.',ficha.categoria_prep],['Registrada',fmtFecha(ficha.fecha_registro)]].map(([k,v]) => (
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text-secondary)',fontWeight:600}}>{k}</span>
                  <span style={{color:'var(--text-primary)',fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Costos y márgenes</div>
              {[['Precio de venta',fmt(p?.precio||0),true],['Costo estimado',fmt(ficha.costo_estimado),false],['Margen estimado',fmt((p?.precio||0)-ficha.costo_estimado),true]].map(([k,v,green]) => (
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text-secondary)',fontWeight:600}}>{k}</span>
                  <span style={{color:green?'var(--color-green)':'var(--text-primary)',fontWeight:700}}>{v}</span>
                </div>
              ))}
              {margenCalculado !== null && costoCalculado > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0 0',fontSize:12,gap:8}}>
                  <span style={{color: costoSuperaPrecio ? '#E53935' : margenBajo ? '#F57F17' : 'var(--text-secondary)',fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
                    {(costoSuperaPrecio || margenBajo) && <IconAlerta width="12" height="12"/>} Margen por insumos + vaso ({fmtPct(margenCalculado)})
                  </span>
                  {costoSuperaPrecio
                    ? <span style={{color:'#E53935',fontWeight:700,textAlign:'right'}}>Costo ≥ precio de venta</span>
                    : margenBajo && <span style={{color:'#F57F17',fontWeight:700,textAlign:'right'}}>Bajo el mínimo ({fmtPct(MARGEN_MINIMO)})</span>}
                </div>
              )}
            </div>
          </div>

          <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)',marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Insumos requeridos ({fichaInsumos.length})</div>
            {fichaInsumos.length === 0 && (
              <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>Esta ficha no tiene insumos registrados.</p>
            )}
            {fichaInsumos.map((ins, i) => {
              const insumo = insumos.find(s => s.id === ins.id_insumo);
              return (
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:6,background:i%2===0?'var(--bg-hover)':'transparent',fontSize:13}}>
                  <span style={{fontWeight:600,color:'var(--text-primary)'}}>{insumo?.nombre||`Insumo #${ins.id_insumo}`}</span>
                  <span style={{color:'var(--text-secondary)'}}>{ins.cantidad} {ins.unidad}</span>
                </div>
              );
            })}
          </div>

          <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)',marginBottom:ficha.notas?14:0}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10}}>Proceso de preparación</div>
            {ficha.resumen_prep && <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:10}}>{ficha.resumen_prep}</p>}
            <ol style={{paddingLeft:20,margin:0}}>
              {pasos.map((paso,i) => <li key={i} style={{fontSize:13,color:'var(--text-primary)',marginBottom:7,lineHeight:1.6}}>{paso.replace(/^\d+\.\s*/,'')}</li>)}
            </ol>
          </div>

          {ficha.notas && (
            <div style={{background:'var(--bg-surface-2)',borderRadius:12,padding:'14px 18px',border:'1px solid rgba(245,176,0,0.35)',marginTop:14}}>
              <div style={{fontWeight:700,marginBottom:6,color:'var(--text-primary)',display:'flex',alignItems:'center',gap:6}}><IconInfo/> Notas</div>
              <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,margin:0}}>{ficha.notas}</p>
            </div>
          )}

          <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function FichasTecnicasPage() {
  const [fichas, setFichas]         = useState([]);
  const [query, setQuery]           = useState('');
  // 16.2 / 16.3 — filtros adicionales, combinados con la búsqueda por texto.
  const [catFiltro, setCatFiltro]         = useState('todas');
  const [tipoPrepFiltro, setTipoPrepFiltro] = useState('todos');
  const [estadoFiltro, setEstadoFiltro]   = useState('todos');
  const [modal, setModal]           = useState(null); // null | 'ver' | 'nuevo' | 'editar'
  const [fichaActual, setFichaActual] = useState(null);
  const [deleteTarget, setDel]      = useState(null);
  const [success, setSuccess]       = useState('');
  const [page, setPage]             = useState(1);
  // Error visible de carga de la lista (ej. 401 por sesión expirada). Antes
  // el .catch(()=>{}) del refresh se tragaba el error y la lista quedaba
  // vacía en silencio, indistinguible de "no hay fichas registradas".
  const [listError, setListError]   = useState('');
  const PER_PAGE = 4;

  const refresh  = () => {
    setListError('');
    fichasTecnicasService.getAll()
      .then(d => setFichas(Array.isArray(d) ? d : []))
      .catch(err => setListError(err?.message || 'No se pudo cargar la lista de fichas técnicas. Intenta de nuevo o vuelve a iniciar sesión.'));
  };
  const showOk   = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const closeModal = () => { setModal(null); setFichaActual(null); };

  // Carga inicial de la lista al entrar a la página — antes no existía y
  // `fichas` solo se poblaba después de crear/editar/anular/togglear algo.
  useEffect(() => { refresh(); }, []);

  // Antes: stats.avgTiempo se usaba en el header de estadísticas pero nunca
  // se calculaba (quedaba "undefined min"). Ahora se calcula el promedio real.
  const stats = {
    total: fichas.length,
    activas: fichas.filter(f=>f.estado).length,
    inactivas: fichas.filter(f=>!f.estado).length,
    avgTiempo: fichas.length ? Math.round(fichas.reduce((s,f)=>s+(f.tiempo_prep||0),0) / fichas.length) : 0,
  };

  const [productos, setProductos] = useState([]);
  const [insumos,   setInsumos]   = useState([]);
  useEffect(() => {
    productosService.getAll().then(d => setProductos(Array.isArray(d) ? d : [])).catch(()=>{});
    insumosService.getAll().then(d => setInsumos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const getProd   = id => productos.find(p => p.id === id);
  // Categorías disponibles para el filtro, derivadas de los productos ya
  // vinculados a alguna ficha (no de todo el catálogo, para no mostrar
  // categorías vacías en el filtro).
  const categoriasDisponibles = [...new Set(fichas.map(f => getProd(f.id_producto)?.categoria).filter(Boolean))];

  const displayed = fichas.filter(f => {
    const p = getProd(f.id_producto);
    const q = query.trim().toLowerCase();
    const matchQuery = !q || (p?.nombre||'').toLowerCase().includes(q) || f.categoria_prep.toLowerCase().includes(q);
    const matchCat   = catFiltro === 'todas' || p?.categoria === catFiltro;
    const matchTipo  = tipoPrepFiltro === 'todos' || f.categoria_prep === tipoPrepFiltro;
    const matchEstado = estadoFiltro === 'todos' || (estadoFiltro === 'activas' ? !!f.estado : !f.estado);
    return matchQuery && matchCat && matchTipo && matchEstado;
  });

  const totalPages = Math.ceil(displayed.length / PER_PAGE);
  const paginated  = displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleDelete = async () => {
    await fichasTecnicasService.remove(getFichaId(deleteTarget));
    refresh(); showOk('Ficha técnica anulada'); setDel(null); closeModal();
  };

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {listError && (
          <div style={{background:'rgba(229,57,53,0.12)',border:'1px solid rgba(229,57,53,0.35)',color:'#E53935',padding:'12px 16px',borderRadius:10,marginBottom:16,fontSize:13,display:'flex',alignItems:'center',gap:8}}>
            <IconAlerta style={{flexShrink:0}}/>
            <span>{listError}</span>
            <button onClick={refresh} title="Reintentar carga" style={{marginLeft:'auto',padding:'6px 12px',borderRadius:8,border:'1.5px solid rgba(229,57,53,0.4)',background:'transparent',color:'#E53935',cursor:'pointer',fontSize:12,fontWeight:700}}>Reintentar</button>
          </div>
        )}

        {/* ── Modales ── */}
        {modal === 'ver' && fichaActual && (
          <ModalDetalleFicha
            ficha={fichaActual}
            onClose={closeModal}
            onEditar={() => setModal('editar')}
            onAnular={() => setDel(fichaActual)}
          />
        )}
        {(modal === 'nuevo' || modal === 'editar') && (
          <ModalFichaForm
            // key fuerza el remount del formulario al pasar de "nueva ficha"
            // a "editar la ficha existente" (ver onEditExisting más abajo):
            // sin esto, React reutiliza la misma instancia y el estado
            // interno del form (cargado solo una vez desde fichaInicial)
            // nunca se actualiza con los datos de la ficha ya existente.
            key={modal === 'editar' && fichaActual ? `editar-${getFichaId(fichaActual)}` : 'nuevo'}
            fichaInicial={modal === 'editar' ? fichaActual : null}
            fichasExistentes={fichas}
            onClose={closeModal}
            onSave={() => { refresh(); showOk(modal === 'editar' ? 'Ficha técnica actualizada' : 'Ficha técnica creada'); closeModal(); }}
            // 4.3 — si el usuario elige, dentro del formulario de "nueva
            // ficha", un producto que ya tiene una ficha activa, saltamos
            // directo a editar esa ficha existente en vez de permitir una
            // segunda para el mismo producto.
            onEditExisting={ficha => { setFichaActual(ficha); setModal('editar'); }}
          />
        )}
        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDel(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
              <h3>¿Anular ficha técnica?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{getProd(deleteTarget.id_producto)?.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" title="Cerrar sin anular" onClick={() => setDel(null)}>Cancelar</button>
                <button className="btn-confirm-danger" title="Confirmar anulación de la ficha" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Fichas Técnicas</h1>
            <p className="page-subtitle">Gestiona las fichas de preparación de cada producto del menú</p>
          </div>
          <button className="btn-add" title="Crear una nueva ficha técnica" onClick={() => { setFichaActual(null); setModal('nuevo'); }}>
            <IconMas width="18" height="18"/>
            Nueva ficha técnica
          </button>
        </div>

        {/* ── Stats ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          {[{l:'Total fichas',v:stats.total,c:'#1565C0'},{l:'Activas',v:stats.activas,c:'#2E7D32'},{l:'Inactivas',v:stats.inactivas,c:'#757575'},{l:'Tiempo prom.',v:stats.avgTiempo+' min',c:'#E65100'}].map((s,i) => (
            <div key={i} style={{background:'var(--stat-card-bg)',borderRadius:12,padding:'16px 18px',borderTop:`3px solid ${s.c}`,boxShadow:'var(--stat-card-shadow)',border:`1px solid var(--border)`,borderTopColor:s.c}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>{s.l}</div>
              <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="insumos-toolbar" style={{flexWrap:'wrap'}}>
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input type="text" className="search-input" title="Buscar ficha técnica por nombre de producto o tipo de preparación" placeholder="Buscar por producto o tipo de preparación..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/>
              {query && <button className="search-clear" title="Limpiar búsqueda" onClick={() => setQuery('')}><IconX/></button>}
            </div>
          </div>
          <select value={catFiltro} onChange={e => { setCatFiltro(e.target.value); setPage(1); }} title="Filtrar por categoría del producto"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={tipoPrepFiltro} onChange={e => { setTipoPrepFiltro(e.target.value); setPage(1); }} title="Filtrar por tipo de preparación"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todos">Todos los tipos de preparación</option>
            {CATEGORIAS_PREP.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }} title="Filtrar por estado de la ficha"
            style={{padding:'9px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}>
            <option value="todos">Todos los estados</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </select>
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{displayed.length} ficha{displayed.length!==1?'s':''}</span>
        </div>

        {/* ── Tabla ── */}
        <div className="insumos-card">
          {displayed.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
              <h3>{query || catFiltro!=='todas' || tipoPrepFiltro!=='todos' || estadoFiltro!=='todos' ? 'Sin coincidencias' : 'No hay fichas técnicas'}</h3>
              <p>Crea fichas técnicas para documentar la preparación de cada producto</p>
              {!query && <button className="btn-add-first" onClick={() => setModal('nuevo')}>Nueva ficha técnica</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead><tr><th>Producto</th><th>Categoría</th><th>Tipo prep.</th><th>Unidad</th><th>Tiempo</th><th>Insumos</th><th>Costo</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {paginated.map(f => {
                    const p = getProd(f.id_producto);
                    return (
                      <tr key={getFichaId(f)}>
                        <td>
                          <div className="td-nombre">{p?.nombre||'—'}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>{p ? fmt(p.precio) : ''}</div>
                        </td>
                        <td><span className="badge-cat">{p?.categoria||'—'}</span></td>
                        <td style={{fontSize:12,color:'var(--text-secondary)'}}>{f.categoria_prep}</td>
                        <td style={{textAlign:'center',fontWeight:600}}>{f.porciones}</td>
                        <td style={{fontWeight:600}}>{f.tiempo_prep} min</td>
                        {/* Antes: f.insumos.length — tronaba si el backend no incluía
                            el arreglo `insumos` en la ficha. Ahora usa respaldo a 0. */}
                        <td><span style={{fontSize:12,color:'var(--text-secondary)'}}>{(f.insumos?.length ?? 0)} ingr.</span></td>
                        <td style={{fontWeight:600,color:'#E65100'}}>{fmt(f.costo_estimado)}</td>
                        <td>
                          <button className={`toggle-btn ${f.estado?'toggle-on':'toggle-off'}`} onClick={async () => { await fichasTecnicasService.toggleEstado?.(getFichaId(f)); refresh(); }} title={f.estado?'Activa':'Inactiva'}>
                            <span className="toggle-thumb"/>
                          </button>
                        </td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Ver detalle">
                              <button className="btn-ver" onClick={() => { setFichaActual(f); setModal('ver'); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => { setFichaActual(f); setModal('editar'); }}>
                                <IconEditar width="16" height="16"/>
                              </button>
                            </Tooltip>
                            <AnularButton onClick={() => setDel(f)}/>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderTop:'1px solid var(--border)',marginTop:4}}>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>
                Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,displayed.length)} de {displayed.length} fichas
              </span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} title="Página anterior"
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border-input)',background:page===1?'var(--bg-surface-3)':'var(--bg-surface)',color:page===1?'var(--text-muted)':'var(--text-primary)',cursor:page===1?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>← Ant.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{padding:'6px 11px',borderRadius:8,border:`1.5px solid ${n===page?'var(--color-green)':'var(--border)'}`,background:n===page?'var(--color-green)':'var(--bg-surface)',color:n===page?'#ffffff':'var(--text-primary)',cursor:'pointer',fontSize:13,fontWeight:700}}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} title="Página siguiente"
                  style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid var(--border-input)',background:page===totalPages?'var(--bg-surface-3)':'var(--bg-surface)',color:page===totalPages?'var(--text-muted)':'var(--text-primary)',cursor:page===totalPages?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>Sig. →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}