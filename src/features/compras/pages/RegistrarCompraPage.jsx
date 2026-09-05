import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import comprasService from '../services/comprasService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import insumosService from '../../insumos/services/insumosService';
import localesService from '../../../shared/services/localesService';
import useCompras from '../hooks/useCompras';
import useTiposPresentacion from '../hooks/useTiposPresentacion';
import { uploadToCloudinary } from '../../../shared/services/cloudinaryService';
import { validarArchivoComprobante, procesarComprobante, normalizarFechaComprobante } from '../../../shared/services/ocrService';
import { normalizarComparacion } from '../../../shared/utils/textFormat';
import ImageLightbox from '../../../shared/components/ImageLightbox';
import '../../../shared/components/ImageLightbox.css';
import Layout from '../../../shared/components/Layout';
import '../components/CompraForm.css';
import './RegistrarCompraPage.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

// ── Mismas constantes/helpers de CompraForm.jsx — sin ningún cambio de
// lógica de cálculo, solo reestructuración de layout. ──────────────────
const EMPTY_ITEM = {
  insumo: '', insumoId: '', unidad: '',
  presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
  presentacionMultiNivel: false,
  presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '',
};

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
  localId: '',
  localNombre: '',
  fecha: getTodayStr(),
  observaciones: '',
  items: [],
};

const formatCOP = (val) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(val) || 0);

const normalizarTexto = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\x00-\x7F]/g, '').trim();

const subtotalItem = (it) =>
  Number(it.presentacionCantidad || 0) * Number(it.presentacionPrecio || 0);

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

// Mismo BuscadorSelect de siempre, sin cambios.
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

// ── Modal: Gestionar tipos de presentación — copia idéntica de la que
// vivía en ComprasPage.jsx, movida acá porque el trigger ("Gestionar
// tipos") ahora vive dentro del Panel de Gestión de esta página. ──────
function ModalTiposPresentacion({ onClose, tipos, create, update, toggleEstado }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre del tipo de presentación es obligatorio.'); return; }
    setLoading(true);
    try {
      const r = await create({ nombre: nombre.trim() });
      if (r?.error) { setError(r.error); return; }
      setNombre('');
    } catch (err) {
      setError(err.message || 'No se pudo crear el tipo de presentación.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (t) => { setError(''); setEditId(t.id); setEditNombre(t.nombre); };
  const cancelEdit = () => { setEditId(null); setEditNombre(''); };

  const saveEdit = async (t) => {
    setError('');
    if (!editNombre.trim()) { setError('El nombre del tipo de presentación es obligatorio.'); return; }
    if (editNombre.trim() === t.nombre) { cancelEdit(); return; }
    setEditLoading(true);
    try {
      const r = await update(t.id, { nombre: editNombre.trim() });
      if (r?.error) { setError(r.error); return; }
      cancelEdit();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cambio.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleEstado = async (t) => {
    setError('');
    setToggleLoadingId(t.id);
    try {
      const r = await toggleEstado(t.id);
      if (r?.error) setError(r.error);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado del tipo de presentación.');
    } finally {
      setToggleLoadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.5)', animation: 'popIn .22s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Gestionar tipos de presentación</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            "Unitario" es una opción fija del sistema y no aparece aquí — no se puede editar, desactivar ni eliminar.
          </p>
          {error && (
            <div style={{ background: 'rgba(229,57,53,0.12)', color: '#EF5350', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nuevo tipo (ej: Botella, Galón)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={loading} className="btn-add" style={{ padding: '0 16px' }}>
              {loading ? 'Creando...' : '+ Crear'}
            </button>
          </form>
          {tipos.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          )}
          {tipos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Aún no hay tipos de presentación registrados.
            </div>
          ) : (() => {
            const tiposFiltrados = busqueda.trim()
              ? tipos.filter(t => normalizarComparacion(t.nombre).includes(normalizarComparacion(busqueda)))
              : tipos;
            if (tiposFiltrados.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ningún tipo coincide con "{busqueda}".
                </div>
              );
            }
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiposFiltrados.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface-3)', border: '1px solid var(--border)' }}>
                  {editId === t.id ? (
                    <>
                      <input
                        type="text" autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(t); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, marginRight: 10, padding: '6px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => saveEdit(t)} disabled={editLoading} title="Guardar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(76,175,80,0.15)', color: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button onClick={cancelEdit} title="Cancelar"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.estado === 'Activo' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.nombre}</span>
                        <span style={{ padding:'2px 8px',borderRadius:20,fontSize:10.5,fontWeight:700,background:t.estado==='Activo'?'rgba(76,175,80,.15)':'rgba(158,158,158,.18)',color:t.estado==='Activo'?'#4CAF50':'#9E9E9E' }}>
                          {t.estado === 'Activo' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          onClick={() => handleToggleEstado(t)}
                          disabled={toggleLoadingId === t.id}
                          title={t.estado === 'Activo' ? 'Desactivar tipo' : 'Activar tipo'}
                          className={`toggle-btn ${t.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          style={{ opacity: toggleLoadingId === t.id ? 0.5 : 1 }}>
                          <span className="toggle-thumb"/>
                        </button>
                        <button onClick={() => startEdit(t)} title="Editar nombre"
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            );
          })()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Página principal — vista de página completa (ya no modal), con 2
// paneles: Gestión (izquierda, configura UN insumo a la vez) y Listado
// (derecha, resumen compacto + numeración estable de los ya agregados).
// ═════════════════════════════════════════════════════════════════════
const RegistrarCompraPage = () => {
  const navigate = useNavigate();
  const { create } = useCompras();

  const [form, setForm] = useState(EMPTY_FORM);
  // El insumo que se está configurando AHORA MISMO en el Panel de Gestión
  // — separado de form.items (el Listado ya confirmado). Nunca se muestra
  // el formulario completo de edición dentro del Listado: solo acá.
  const [itemActual, setItemActual] = useState({ ...EMPTY_ITEM });
  // null = agregando un insumo nuevo. Si no es null, es la _key (no el
  // índice del arreglo) del ítem que se está editando — usar la key en
  // vez del índice evita que una edición se "pierda" o apunte al ítem
  // equivocado si mientras tanto se quita otro ítem del Listado.
  const [editandoKey, setEditandoKey] = useState(null);
  // Qué campos del Panel de Gestión ya tocó el usuario en este ítem — un
  // campo nunca se pinta en rojo si no está acá adentro, sin importar si
  // su valor actual sería inválido. Arranca vacío en cada insumo nuevo
  // (y se reinicia al confirmar/cancelar/editar) para que el estado
  // inicial sea siempre neutro, nunca en rojo desde el primer render.
  const [touchedItemActual, setTouchedItemActual] = useState({});
  const marcarTocado = (field) => setTouchedItemActual(prev => (prev[field] ? prev : { ...prev, [field]: true }));
  const proximaKeyRef = useRef(1);

  const itemRefs = useRef([]);
  const gestionRef = useRef();
  const proveedorRef = useRef();
  const localRef = useRef();
  const fechaRef = useRef();
  const descuentoRef = useRef();
  const comprobanteRef = useRef();
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [errorItemActual, setErrorItemActual] = useState('');

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
  const [serverError, setServerError] = useState('');
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [confirmSinValidar, setConfirmSinValidar] = useState(false);
  const [showTiposModal, setShowTiposModal] = useState(false);

  const [proveedores, setProveedores] = useState([]);
  useEffect(() => {
    proveedoresService.getAll()
      .then(d => setProveedores(Array.isArray(d) ? d.filter(p => p.estado === 'Activo') : []))
      .catch(() => setProveedores([]));
  }, []);
  const [locales, setLocales] = useState([]);
  useEffect(() => {
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, []);
  const {
    tipos: tiposPresentacionCatalogo,
    create: crearTipoPresentacion,
    update: actualizarTipoPresentacion,
    toggleEstado: toggleEstadoTipoPresentacion,
  } = useTiposPresentacion();
  const tiposPresentacionActivos = tiposPresentacionCatalogo.filter(t => t.estado === 'Activo').map(t => t.nombre);
  const TIPOS_PRESENTACION = ['Unitario', ...tiposPresentacionActivos];
  const [todosInsumos, setTodosInsumos] = useState([]);
  useEffect(() => {
    insumosService.getAll()
      .then(d => setTodosInsumos(Array.isArray(d) ? d.filter(i => i.estado === 'Activo') : []))
      .catch(() => setTodosInsumos([]));
  }, []);

  const insumosFiltrados = form.localId
    ? todosInsumos.filter(i => String(i.localId) === String(form.localId))
    : [];

  const comprobanteEsObligatorio = form.items.some(it => it.presentacionTipo !== 'Unitario');

  // ── Validación de UN ítem — misma lógica exacta que ya existía ──────
  const esItemValido = (it) => {
    if (!it.insumo.trim()) return false;
    if (!it.presentacionTipo) return false;
    const esUnitario = it.presentacionTipo === 'Unitario';
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

  const validateItemsList = (items) =>
    items.some(it => !esItemValido(it))
      ? 'Hay insumos en el listado con datos inválidos — revísalos.'
      : '';

  const itemsFueraDelLocal = (items) => {
    if (!form.localId) return [];
    return items
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
    else if (form.fecha > getTodayStr()) errs.fecha = 'La fecha no puede ser futura — una compra es un hecho ya ocurrido.';
    if (form.items.length === 0) {
      errs.items = 'Agrega al menos un insumo a la compra.';
    } else {
      const itemsErr = validateItemsList(form.items);
      if (itemsErr) errs.items = itemsErr;
      const fuera = itemsFueraDelLocal(form.items);
      if (fuera.length) {
        errs.items = `Estos insumos no pertenecen al local seleccionado: ${fuera.join(', ')}. Quítalos o cambia el local de la compra.`;
      }
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
    setForm(prev => ({ ...prev, proveedorId: value, proveedorNombre: prov ? prov.nombre : '' }));
    setTouched(prev => ({ ...prev, proveedorNombre: true }));
    setErrors(prev => ({ ...prev, proveedorNombre: prov ? '' : 'Selecciona un proveedor' }));
  };

  // Cambiar el local vacía el Listado ya confirmado (sus insumos dependían
  // de ese local) — igual que antes, solo que ahora también limpia el
  // Panel de Gestión, por si había algo a medio configurar.
  const seleccionarLocal = (value) => {
    const loc = locales.find(l => String(l.id) === String(value));
    setForm(prev => ({ ...prev, localId: value, localNombre: loc ? loc.nombre : '', items: [] }));
    setItemActual({ ...EMPTY_ITEM });
    setEditandoKey(null);
    setTouchedItemActual({});
    setTouched(prev => ({ ...prev, localId: true }));
    setErrors(prev => ({ ...prev, localId: loc ? '' : 'Selecciona el local de la compra.', items: '' }));
  };

  const filtrarNumero = (valor, maxDecimales, tope) => {
    let v = valor.replace(/[^0-9.]/g, '');
    if (maxDecimales === 0) {
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

  // ── Handlers que operan sobre itemActual (el ítem en configuración) —
  // misma lógica exacta de CompraForm.jsx, solo que ya no reciben un
  // índice de arreglo porque solo existe UN ítem "vivo" a la vez. ──────
  const handleInsumoSelectActual = (nombreInsumo) => {
    const insumo = todosInsumos.find(i => i.nombre === nombreInsumo);
    setItemActual(prev => ({
      ...prev,
      insumo: nombreInsumo,
      insumoId: insumo ? insumo.id : '',
      unidad: insumo ? (insumo.unidadMedida || '') : prev.unidad,
      presentacionTipo: '', presentacionCantidad: '', presentacionContenido: '', presentacionPrecio: '',
      presentacionMultiNivel: false, presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '',
    }));
    setTouchedItemActual({});
    setErrorItemActual('');
  };

  const handlePresentacionChangeActual = (field, value) => {
    let v = value;
    if (field === 'presentacionTipo') {
      marcarTocado(field);
      setItemActual(prev => {
        const eraUnitario = prev.presentacionTipo === 'Unitario';
        const esUnitario = value === 'Unitario';
        return {
          ...prev,
          presentacionTipo: value,
          presentacionCantidad: esUnitario ? '1' : (eraUnitario ? '' : prev.presentacionCantidad),
          presentacionMultiNivel: esUnitario ? false : prev.presentacionMultiNivel,
          presentacionUnidadesInternas: esUnitario ? '' : prev.presentacionUnidadesInternas,
          presentacionContenidoUnidadInterna: esUnitario ? '' : prev.presentacionContenidoUnidadInterna,
        };
      });
      setErrorItemActual('');
      return;
    }
    setItemActual(prev => {
      const esEnteroUnidad = prev.unidad === 'unidad';
      if (field === 'presentacionCantidad') {
        v = filtrarNumero(value, 0, 999999);
        if (v === '0') v = '';
      } else if (field === 'presentacionContenido') {
        v = filtrarNumero(value, esEnteroUnidad ? 0 : 2, 999999.99);
        if (esEnteroUnidad && v === '0') v = '';
      } else if (field === 'presentacionPrecio') {
        v = filtrarNumero(value, 0, 999999999);
        if (v === '0') v = '';
      } else if (field === 'presentacionUnidadesInternas') {
        v = filtrarNumero(value, 0, 999999);
        if (v === '0') v = '';
      } else if (field === 'presentacionContenidoUnidadInterna') {
        v = filtrarNumero(value, esEnteroUnidad ? 0 : 2, 999999.99);
        if (esEnteroUnidad && v === '0') v = '';
      }
      return { ...prev, [field]: v };
    });
    setErrorItemActual('');
  };

  const handleTogglePresentacionMultiActual = () => {
    setItemActual(prev => {
      const activar = !prev.presentacionMultiNivel;
      return activar
        ? { ...prev, presentacionMultiNivel: true, presentacionContenido: '' }
        : { ...prev, presentacionMultiNivel: false, presentacionUnidadesInternas: '', presentacionContenidoUnidadInterna: '' };
    });
  };

  const limpiarSiCeroAlSalirActual = (field) => {
    setItemActual(prev => (Number(prev[field]) === 0 ? { ...prev, [field]: '' } : prev));
  };

  // ── Confirmar el ítem actual: lo agrega al Listado (nuevo) o lo
  // reemplaza en su misma posición (editando) — la numeración nunca se
  // recalcula por posición, vive en _key. ─────────────────────────────
  const confirmarItemActual = () => {
    if (!esItemValido(itemActual)) {
      setErrorItemActual('Completa tipo, contenido y precio válidos (precio mínimo $1.000) antes de agregar el insumo.');
      return;
    }
    const yaExiste = form.items.some(it =>
      it._key !== editandoKey && it.insumoId && String(it.insumoId) === String(itemActual.insumoId)
    );
    if (yaExiste) {
      setErrorItemActual('Este insumo ya está en el listado de la compra — edítalo ahí en vez de agregarlo de nuevo.');
      return;
    }
    setForm(prev => {
      let items;
      if (editandoKey !== null) {
        items = prev.items.map(it => (it._key === editandoKey ? { ...itemActual, _key: editandoKey } : it));
      } else {
        const key = proximaKeyRef.current++;
        items = [...prev.items, { ...itemActual, _key: key }];
      }
      return { ...prev, items };
    });
    setItemActual({ ...EMPTY_ITEM });
    setEditandoKey(null);
    setTouchedItemActual({});
    setErrorItemActual('');
    setTouched(prev => ({ ...prev, items: true }));
  };

  const editarItemDelListado = (key) => {
    const it = form.items.find(i => i._key === key);
    if (!it) return;
    setItemActual({ ...it });
    setEditandoKey(key);
    setTouchedItemActual({});
    setErrorItemActual('');
    gestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelarEdicionItem = () => {
    setItemActual({ ...EMPTY_ITEM });
    setEditandoKey(null);
    setTouchedItemActual({});
    setErrorItemActual('');
  };

  const quitarItemDelListado = (key) => {
    setForm(prev => ({ ...prev, items: prev.items.filter(it => it._key !== key) }));
    // Si el que se quitó era justo el que estaba en edición, se limpia el
    // Panel de Gestión para no dejarlo "editando" un ítem que ya no existe.
    if (editandoKey === key) {
      setItemActual({ ...EMPTY_ITEM });
      setEditandoKey(null);
      setTouchedItemActual({});
    }
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
            nitCoincide: null, proveedorCoincide: null, total: null, totalCoincide: null,
            confianza: resultado.confianza ?? null, advertencias: [],
          });
        }
        return;
      }

      setTotalDetectadoOCR(resultado.total);
      const advertencias = [];
      const totalCoincide = resultado.total === totalFinal;
      if (!totalCoincide) advertencias.push(`El total del comprobante (${formatCOP(resultado.total)}) no coincide con el total de la compra (${formatCOP(totalFinal)}).`);

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
        if (totalCoincide === false) confianzaAjustada -= 40;
        if (nitCoincide === false) confianzaAjustada -= 20;
        if (fechaCoincide === false) confianzaAjustada -= 15;
        if (proveedorCoincide === false) confianzaAjustada -= 15;
        confianzaAjustada = Math.max(0, Math.min(100, confianzaAjustada));
      }

      setChequeoOCR({
        fecha: resultado.fechaDetectada || null, fechaCoincide,
        nit: resultado.nitDetectado || null, nitCoincide,
        proveedorCoincide, total: resultado.total, totalCoincide,
        confianza: confianzaAjustada, advertencias: [...new Set(advertencias)],
      });
      setComprobanteOk(advertencias.length === 0);
    } catch (err) {
      setComprobanteError('No se pudo procesar el comprobante. Intenta con otra foto.');
    } finally {
      setProcesandoOCR(false);
    }
  };

  const prepararItemParaEnvio = (it) => {
    const cantidadPresentaciones = Number(it.presentacionCantidad) || 0;
    const precioPresentacion = Number(it.presentacionPrecio) || 0;
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
        tipo: it.presentacionTipo, cantidad: cantidadPresentaciones,
        contenidoPorPresentacion, precioPresentacion, ...datosExtra,
      },
    };
  };

  const enviarCompra = async () => {
    setSubiendoComprobante(true);
    setServerError('');
    try {
      const comprobanteUrl = comprobanteFile ? await uploadToCloudinary(comprobanteFile) : null;
      const payload = {
        ...form,
        local_id: Number(form.localId) || null,
        items: form.items.map(prepararItemParaEnvio),
        total: totalFinal,
        total_bruto: totalBruto,
        descuento: descuentoNum,
        comprobante_url: comprobanteUrl,
        comprobante_verificado: comprobanteFile ? comprobanteOk : null,
        comprobante_total_ocr: comprobanteFile ? totalDetectadoOCR : null,
        ocr_resultado: chequeoOCR ? {
          fecha: chequeoOCR.fecha, nit: chequeoOCR.nit, confianza: chequeoOCR.confianza,
          proveedorCoincide: chequeoOCR.proveedorCoincide, advertencias: chequeoOCR.advertencias,
        } : null,
      };
      const r = await create(payload);
      if (r?.error) { setServerError(r.error); return; }
      navigate('/compras', { state: { successMsg: '¡Compra registrada correctamente! El stock fue actualizado.' } });
    } catch (err) {
      setServerError(err.message || 'No se pudo registrar la compra.');
    } finally {
      setSubiendoComprobante(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched(prev => ({ ...prev, ...Object.fromEntries(Object.keys(errs).map(k => [k, true])) }));
      setTimeout(() => {
        if (errs.proveedorNombre) proveedorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.localId) localRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.fecha) fechaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.items) gestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (errs.descuento) descuentoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (errs.comprobante) comprobanteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    if (comprobanteFile && !comprobanteOk) { setConfirmSinValidar(true); return; }
    await enviarCompra();
  };

  const contenidoEsEntero = itemActual.unidad === 'unidad';
  const esUnitarioActual = itemActual.presentacionTipo === 'Unitario';

  // Validez por campo — misma regla exacta que ya usa esItemValido para
  // cada uno, solo que expuesta campo por campo (no en bloque) para poder
  // decidir el borde de CADA input por separado. No reemplaza ni modifica
  // esItemValido — es una capa puramente visual encima de la validación
  // que ya existía.
  const campoValido = {
    presentacionTipo: !!itemActual.presentacionTipo,
    presentacionCantidad: esUnitarioActual || (
      itemActual.presentacionCantidad !== '' && !isNaN(itemActual.presentacionCantidad) &&
      Number(itemActual.presentacionCantidad) > 0 && Number.isInteger(Number(itemActual.presentacionCantidad))
    ),
    presentacionUnidadesInternas: itemActual.presentacionUnidadesInternas !== '' && !isNaN(itemActual.presentacionUnidadesInternas) &&
      Number(itemActual.presentacionUnidadesInternas) > 0 && Number.isInteger(Number(itemActual.presentacionUnidadesInternas)),
    presentacionContenidoUnidadInterna: itemActual.presentacionContenidoUnidadInterna !== '' && !isNaN(itemActual.presentacionContenidoUnidadInterna) &&
      Number(itemActual.presentacionContenidoUnidadInterna) > 0 &&
      (contenidoEsEntero ? Number.isInteger(Number(itemActual.presentacionContenidoUnidadInterna)) : true),
    presentacionContenido: itemActual.presentacionContenido !== '' && !isNaN(itemActual.presentacionContenido) &&
      Number(itemActual.presentacionContenido) > 0 &&
      (contenidoEsEntero ? Number.isInteger(Number(itemActual.presentacionContenido)) : true),
    presentacionPrecio: itemActual.presentacionPrecio !== '' && !isNaN(itemActual.presentacionPrecio) && Number(itemActual.presentacionPrecio) >= 1000,
  };
  // Estado inicial siempre neutro: si el usuario no tocó el campo
  // (touchedItemActual[field]), nunca se pinta rojo, sin importar si el
  // valor actual sería inválido. Solo tras tocarlo se decide rojo/neutro.
  const claseCampo = (field) => (touchedItemActual[field] && !campoValido[field]) ? 'fg-error' : '';
  // Mensaje específico por campo, mismo patrón de "err-msg" ya usado en
  // el resto del sistema (Insumos, Proveedores).
  const mensajeCampo = (field) => {
    if (!touchedItemActual[field] || campoValido[field]) return '';
    const mensajes = {
      presentacionTipo: 'Selecciona un tipo de presentación.',
      presentacionCantidad: 'Debe ser un número entero mayor a 0.',
      presentacionUnidadesInternas: 'Debe ser un número entero mayor a 0.',
      presentacionContenidoUnidadInterna: contenidoEsEntero ? 'Debe ser un número entero mayor a 0.' : 'Debe ser mayor a 0.',
      presentacionContenido: contenidoEsEntero ? 'Debe ser un número entero mayor a 0.' : 'Debe ser mayor a 0.',
      presentacionPrecio: 'El precio debe ser mayor o igual a $1.000.',
    };
    return mensajes[field] || 'Este campo es obligatorio.';
  };
  // Borde verde opcional en toda la tarjeta: solo cuando el ítem completo
  // ya es válido Y el usuario alcanzó a tocar al menos un campo (para no
  // mostrarlo "ya perfecto" en el instante en que aparece, antes de que
  // el usuario haya hecho nada).
  const algunCampoTocado = Object.keys(touchedItemActual).length > 0;
  const itemActualCompleto = algunCampoTocado && itemActual.insumo && esItemValido(itemActual);

  return (
    <Layout>
      <div className="registrar-compra-root">
        <div className="page-header">
          <h1 className="page-title">Registrar Compra</h1>
          <p className="page-subtitle">El stock se actualiza automáticamente al registrar</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid" style={{ marginBottom: 20 }}>
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
                type="date" value={form.fecha}
                max={getTodayStr()}
                onChange={e => setForm(prev => ({ ...prev, fecha: e.target.value }))}
              />
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                Puedes elegir cualquier fecha hasta hoy — no se admiten fechas futuras.
              </span>
              {errors.fecha && <span className="err-msg">{errors.fecha}</span>}
            </div>

            <div className="fg fg-full">
              <label>Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={e => setForm(prev => ({ ...prev, observaciones: e.target.value }))}
                placeholder="Notas sobre esta compra..." rows={2}
                maxLength={LIMITES.OBSERVACIONES}
              />
              <div style={{fontSize:11,color:enElTope(form.observaciones,LIMITES.OBSERVACIONES)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.observaciones,LIMITES.OBSERVACIONES)}</div>
            </div>
          </div>

          {/* ── Los 2 paneles ── */}
          <div ref={gestionRef} className="registrar-compra-paneles">

            {/* Panel de Gestión (izquierda) */}
            <div className="panel-gestion">
              <div className="panel-gestion-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                {editandoKey !== null ? `Editando insumo` : 'Configurar insumo'}
              </div>

              {(!form.localId || !form.proveedorId) && (
                <div style={{ padding: '12px 16px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227', margin: '0 16px 12px' }}>
                  ⚠ Elige el <strong>proveedor</strong> y el <strong>local</strong> arriba para poder configurar insumos.
                </div>
              )}

              {form.localId && form.proveedorId && insumosFiltrados.length === 0 && (
                <div style={{ padding: '12px 16px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 13, color: '#C9A227', margin: '0 16px 12px' }}>
                  ⚠ No hay insumos registrados en <strong>{form.localNombre}</strong>. Registra insumos para ese local (Gestión de Insumos).
                </div>
              )}

              {form.localId && form.proveedorId && insumosFiltrados.length > 0 && (
                <div className={`item-block config-tarjeta ${itemActualCompleto ? 'config-tarjeta--completa' : ''}`} style={{ margin: '0 16px 16px' }}>

                  {/* ── Grupo 1: qué vas a comprar ── */}
                  <div className="config-grupo">
                    <div className="config-grupo-titulo">Qué vas a comprar</div>
                    <div className="item-row" style={{ gridTemplateColumns: '2fr 0.8fr' }}>
                      <div className="item-field">
                        <label className="item-field-label">Insumo</label>
                        <BuscadorSelect
                          value={itemActual.insumoId}
                          options={insumosFiltrados
                            .filter(i => !form.items.some(it => it._key !== editandoKey && it.insumoId && String(it.insumoId) === String(i.id)))
                            .map(i => ({ value: i.id, label: i.nombre }))}
                          onChange={(insumoId) => {
                            const insumo = insumosFiltrados.find(i => String(i.id) === String(insumoId));
                            if (insumo) handleInsumoSelectActual(insumo.nombre);
                          }}
                          placeholder="Buscar insumo..."
                          emptyMessage="Ningún insumo disponible coincide con esa búsqueda (los ya agregados al listado no aparecen)."
                        />
                      </div>
                      <div className="item-field">
                        <label className="item-field-label">Unidad</label>
                        <input type="text" value={itemActual.unidad} readOnly placeholder="—"
                          style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}/>
                      </div>
                    </div>

                    {(() => {
                      const insumoSel = todosInsumos.find(i => i.nombre === itemActual.insumo);
                      const stockBajo = insumoSel && Number(insumoSel.stockActual) <= Number(insumoSel.stockMinimo);
                      if (!stockBajo) return null;
                      return (
                        <div className="item-stock-bajo-alert" style={{ margin: '10px 0 0' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>Stock bajo de "{insumoSel.nombre}": quedan {insumoSel.stockActual} {insumoSel.unidadMedida} (mínimo {insumoSel.stockMinimo}) — buen momento para comprarlo.</span>
                        </div>
                      );
                    })()}

                    {itemActual.insumo && (
                      <div className={`fg ${claseCampo('presentacionTipo')}`} style={{ marginTop: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span>Tipo de presentación</span>
                          <button type="button" onClick={() => setShowTiposModal(true)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-green,#4CAF50)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                            Gestionar tipos
                          </button>
                        </label>
                        <BuscadorSelect
                          value={itemActual.presentacionTipo}
                          options={TIPOS_PRESENTACION.map(t => ({ value: t, label: t }))}
                          onChange={(v) => handlePresentacionChangeActual('presentacionTipo', v)}
                          placeholder="Buscar tipo de presentación..."
                          emptyMessage="Ningún tipo coincide con esa búsqueda."
                        />
                        {mensajeCampo('presentacionTipo') && <span className="err-msg">{mensajeCampo('presentacionTipo')}</span>}
                      </div>
                    )}
                  </div>

                  {/* ── Grupo 2: cantidad y precio ── */}
                  {itemActual.insumo && itemActual.presentacionTipo && (
                    <div className="config-grupo config-grupo--cantidad">
                      <div className="config-grupo-titulo">Cantidad y precio</div>
                      <div className="item-presentacion-panel">

                        {!esUnitarioActual && (
                          <div className={`fg ${claseCampo('presentacionCantidad')}`}>
                            <label>{itemActual.presentacionTipo ? `Cantidad de ${pluralPresentacion(itemActual.presentacionTipo)}` : 'Cantidad de presentaciones'}</label>
                            <input
                              type="number" step="1"
                              placeholder={preguntaCantidadPresentacion(itemActual.presentacionTipo)}
                              value={itemActual.presentacionCantidad}
                              onChange={e => handlePresentacionChangeActual('presentacionCantidad', e.target.value)}
                              onBlur={() => marcarTocado('presentacionCantidad')}
                              onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                            />
                            {mensajeCampo('presentacionCantidad') && <span className="err-msg">{mensajeCampo('presentacionCantidad')}</span>}
                          </div>
                        )}

                        {!esUnitarioActual && itemActual.presentacionMultiNivel ? (
                          <>
                            <div className={`fg ${claseCampo('presentacionUnidadesInternas')}`}>
                              <label>{`¿Cuántas unidades trae cada ${(itemActual.presentacionTipo || 'presentación').toLowerCase()}?`}</label>
                              <input
                                type="number" step="1" placeholder="Ej: 10"
                                value={itemActual.presentacionUnidadesInternas}
                                onChange={e => handlePresentacionChangeActual('presentacionUnidadesInternas', e.target.value)}
                                onBlur={() => marcarTocado('presentacionUnidadesInternas')}
                                onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                              />
                              {mensajeCampo('presentacionUnidadesInternas') && <span className="err-msg">{mensajeCampo('presentacionUnidadesInternas')}</span>}
                            </div>
                            <div className={`fg ${claseCampo('presentacionContenidoUnidadInterna')}`}>
                              <label>{`¿Cuánto contiene cada unidad interna${itemActual.unidad ? ` (${itemActual.unidad})` : ''}?`}</label>
                              <input
                                type="number" step={contenidoEsEntero ? '1' : '0.01'}
                                placeholder={contenidoEsEntero ? 'Ej: 1' : 'Ej: 5'}
                                value={itemActual.presentacionContenidoUnidadInterna}
                                onChange={e => handlePresentacionChangeActual('presentacionContenidoUnidadInterna', e.target.value)}
                                onBlur={() => { limpiarSiCeroAlSalirActual('presentacionContenidoUnidadInterna'); marcarTocado('presentacionContenidoUnidadInterna'); }}
                                onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                              />
                              {mensajeCampo('presentacionContenidoUnidadInterna') && <span className="err-msg">{mensajeCampo('presentacionContenidoUnidadInterna')}</span>}
                            </div>
                          </>
                        ) : (
                          <div className={`fg ${claseCampo('presentacionContenido')}`}>
                            <label>{esUnitarioActual ? 'Cantidad recibida' : preguntaContenidoPresentacion(itemActual.unidad, itemActual.presentacionTipo)}</label>
                            <input
                              type="number" step={contenidoEsEntero ? '1' : '0.01'}
                              placeholder={contenidoEsEntero ? 'Ej: 25' : 'Ej: 5.5'}
                              value={itemActual.presentacionContenido}
                              onChange={e => handlePresentacionChangeActual('presentacionContenido', e.target.value)}
                              onBlur={() => { limpiarSiCeroAlSalirActual('presentacionContenido'); marcarTocado('presentacionContenido'); }}
                              onKeyDown={e => { if (contenidoEsEntero && ['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                            />
                            {mensajeCampo('presentacionContenido') && <span className="err-msg">{mensajeCampo('presentacionContenido')}</span>}
                          </div>
                        )}

                        <div className={`fg ${claseCampo('presentacionPrecio')}`}>
                          <label>Precio por {(itemActual.presentacionTipo || 'presentación').toLowerCase()}</label>
                          <input
                            type="number" step="1" placeholder="Ej: 10000 (mín. $1.000)"
                            title="Escribe el precio en pesos, sin puntos ni comas."
                            value={itemActual.presentacionPrecio}
                            onChange={e => handlePresentacionChangeActual('presentacionPrecio', e.target.value)}
                            onBlur={() => marcarTocado('presentacionPrecio')}
                            onKeyDown={e => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                          />
                          {mensajeCampo('presentacionPrecio') && <span className="err-msg">{mensajeCampo('presentacionPrecio')}</span>}
                        </div>

                        {!esUnitarioActual && (
                          <div className="fg" style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                              <input type="checkbox" checked={!!itemActual.presentacionMultiNivel} onChange={handleTogglePresentacionMultiActual} />
                              La presentación trae unidades internas
                            </label>
                          </div>
                        )}
                        {stockRealItem(itemActual) > 0 && (
                          <div className="item-presentacion-info">
                            ℹ Se sumarán <strong>{stockRealItem(itemActual)} {itemActual.unidad}</strong> al stock{itemActual.insumo ? ` de "${itemActual.insumo}"` : ''} — este número es informativo, no se usa para el valor de la compra.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {errorItemActual && (
                    <div className="items-error-msg" style={{ margin: '10px 14px 0' }}>{errorItemActual}</div>
                  )}

                  <div style={{ display: 'flex', gap: 8, padding: '14px', paddingTop: 4 }}>
                    {editandoKey !== null && (
                      <button type="button" className="btn-form-cancel" onClick={cancelarEdicionItem} style={{ flex: '0 0 auto' }}>
                        Cancelar edición
                      </button>
                    )}
                    <button type="button" className="btn-add-item" style={{ flex: 1, justifyContent: 'center' }} onClick={confirmarItemActual}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {editandoKey !== null
                          ? <polyline points="20 6 9 17 4 12"/>
                          : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                      </svg>
                      {editandoKey !== null ? 'Guardar cambios' : 'Agregar insumo'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Panel de Listado (derecha) */}
            <div className="panel-listado">
              <div className="panel-listado-header">
                <span className="compra-items-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
                  </svg>
                  Insumos de la compra
                  {form.items.length > 0 && (
                    <span style={{ background:'#4CAF50', color:'white', borderRadius:20, padding:'2px 10px', fontSize:11.5, fontWeight:700, marginLeft:8 }}>
                      ({form.items.length}) insumo{form.items.length !== 1 ? 's' : ''} añadido{form.items.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>

              {errors.items && (
                <div className="items-error-msg">{errors.items}</div>
              )}

              <div className="panel-listado-scroll">
                {form.items.length === 0 ? (
                  <div className="panel-listado-vacio">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    <span>Todavía no has agregado ningún insumo a esta compra.</span>
                    <span style={{ fontSize: 12, opacity: .8 }}>Configúralo en el panel de la izquierda y presiona "Agregar insumo".</span>
                  </div>
                ) : (
                  form.items.map((it, idx) => {
                    const esEditando = editandoKey === it._key;
                    return (
                      <div key={it._key} ref={el => itemRefs.current[idx] = el}
                        className={`listado-item ${esEditando ? 'listado-item--editando' : ''} ${touched.items && !esItemValido(it) ? 'listado-item--error' : ''}`}>
                        <div className="listado-item-top">
                          <span className="item-block-index">Insumo {idx + 1}</span>
                          <span className="item-block-modo-badge item-block-modo-badge--presentacion">
                            {it.presentacionTipo || 'Por presentación'}
                          </span>
                        </div>
                        <div className="listado-item-nombre">{it.insumo || 'Sin seleccionar'}</div>
                        <div className="listado-item-resumen">
                          {it.presentacionTipo === 'Unitario'
                            ? `Unitario — ${it.presentacionContenido || 0} ${it.unidad}`
                            : it.presentacionMultiNivel
                              ? `${it.presentacionCantidad || 0} ${it.presentacionTipo}(s) × ${it.presentacionUnidadesInternas || 0} × ${it.presentacionContenidoUnidadInterna || 0} ${it.unidad}`
                              : `${it.presentacionCantidad || 0} ${it.presentacionTipo || ''}(s) × ${it.presentacionContenido || 0} ${it.unidad}`}
                        </div>
                        <div className="listado-item-bottom">
                          <span className="listado-item-subtotal">{formatCOP(subtotalItem(it))}</span>
                          <div className="listado-item-acciones">
                            <button type="button" title="Editar" onClick={() => editarItemDelListado(it._key)}
                              className="listado-item-btn listado-item-btn--editar">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button type="button" title="Quitar" onClick={() => quitarItemDelListado(it._key)}
                              className="listado-item-btn listado-item-btn--quitar">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="compra-totales-wrap" style={{ marginTop: 20 }}>
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
                        if (n < 0) v = '0'; else if (n > 100) v = '100';
                      }
                      setDescuento(v);
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

          <div ref={comprobanteRef} className={`fg fg-full ${errors.comprobante ? 'fg-error' : ''}`} style={{ marginTop: 20 }}>
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
                      <input type="checkbox" checked={confirmarPeseAdvertencia} style={{ marginTop: 2 }}
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
            <button type="button" className="btn-form-cancel" onClick={() => navigate('/compras')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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

        {showTiposModal && (
          <ModalTiposPresentacion
            onClose={() => setShowTiposModal(false)}
            tipos={tiposPresentacionCatalogo}
            create={crearTipoPresentacion}
            update={actualizarTipoPresentacion}
            toggleEstado={toggleEstadoTipoPresentacion}
          />
        )}
      </div>
    </Layout>
  );
};

export default RegistrarCompraPage;