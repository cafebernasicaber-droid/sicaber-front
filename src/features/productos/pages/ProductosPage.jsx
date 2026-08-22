// ─────────────────────────────────────────────────────────────
//  src/features/productos/pages/ProductosPage.jsx
//  Cambio: descuento ahora tiene fechaInicioDesc y fechaFinDesc.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import productosService, { descuentoVigente, calcPrecioFinal } from '../services/productosService';
import categoriasService from '../../categorias/services/categoriasService';
import ImageUploader from '../../../shared/components/ImageUploader';
import '../../insumos/pages/InsumosPage.css';
import './Modulos.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// ── Modal de creación / edición ─────────────────────────────
function ProductoModal({ inicial, productos, onClose, onSave }) {
  const [categorias, setCategorias] = useState([]);
  useEffect(() => {
    categoriasService.getAll()
      .then(d => setCategorias(Array.isArray(d) ? d.map(c=>c.nombre) : []))
      .catch(() => setCategorias([]));
  }, []);
  const hoy = new Date().toISOString().split('T')[0];

  // El backend guarda las fechas de descuento como fecha_inicio_desc /
  // fecha_fin_desc (snake_case) — leerlas como fechaInicioDesc/fechaFinDesc
  // (como se hacía antes) siempre daba undefined, así que al abrir "Editar"
  // el formulario mostraba las fechas vacías aunque el producto sí tuviera
  // un descuento programado.
  const [form, setForm] = React.useState(
    inicial
      ? {
          ...inicial,
          descuento:      inicial.descuento || '',
          fechaInicioDesc: inicial.fecha_inicio_desc || '',
          fechaFinDesc:    inicial.fecha_fin_desc    || '',
        }
      : {
          nombre: '', categoria: '', precio: '', descuento: '',
          fechaInicioDesc: '', fechaFinDesc: '',
          descripcion: '', imagen: '', estado: 'Activo',
        }
  );
  const [error, setError] = React.useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Preview del precio con descuento
  const precioDesc = form.precio && form.descuento && Number(form.descuento) > 0
    ? Math.round(Number(form.precio) * (1 - Math.min(Number(form.descuento), 99) / 100))
    : null;

  // Estado de vigencia del descuento
  const vigenciaLabel = () => {
    if (!form.descuento || Number(form.descuento) <= 0) return null;
    const h = hoy;
    if (form.fechaInicioDesc && h < form.fechaInicioDesc) return { text: '⏳ Programado — aún no inicia', color: '#FF8F00' };
    if (form.fechaFinDesc    && h > form.fechaFinDesc)    return { text: '⛔ Vencido',                    color: '#E53935' };
    return { text: '✅ Vigente hoy',                                                                        color: '#2E7D32' };
  };
  const vigencia = vigenciaLabel();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    // Toda la validación vive acá en JS (sin required/min/max nativos del
    // navegador) para poder mostrar los errores con el mismo estilo que ya
    // usa Roles, en vez del globo de validación por defecto del navegador.
    const nombreLimpio = (form.nombre || '').trim();
    if (!nombreLimpio) { setError('El nombre del producto es obligatorio.'); return; }

    if (!form.categoria) { setError('Selecciona una categoría.'); return; }

    const precioNum = Number(form.precio);
    if (form.precio === '' || isNaN(precioNum) || precioNum < 0) {
      setError('Ingresa un precio válido (mayor o igual a 0).');
      return;
    }

    // Nombre único: se valida contra los productos ya cargados (excluyendo
    // el propio al editar) para avisar de inmediato, sin esperar el 400 que
    // ahora también devuelve el backend si el nombre está repetido.
    const nombreDuplicado = (productos || []).some(p =>
      p.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase() &&
      String(p.id) !== String(inicial?.id)
    );
    if (nombreDuplicado) { setError('Ya existe un producto con ese nombre.'); return; }

    if (form.descuento && (Number(form.descuento) < 0 || Number(form.descuento) > 99)) {
      setError('El descuento debe estar entre 0 y 99%.');
      return;
    }
    if (form.descuento && Number(form.descuento) > 0) {
      if (!form.fechaInicioDesc) { setError('Ingresa la fecha de inicio del descuento.'); return; }
      if (!form.fechaFinDesc)    { setError('Ingresa la fecha de fin del descuento.');    return; }
      if (form.fechaInicioDesc < hoy) { setError('La fecha de inicio no puede ser anterior a hoy.'); return; }
      if (form.fechaFinDesc < form.fechaInicioDesc) { setError('La fecha de fin no puede ser anterior a la de inicio.'); return; }
    }

    // El backend espera fecha_inicio_desc / fecha_fin_desc (snake_case);
    // antes se mandaban como fechaInicioDesc/fechaFinDesc y el backend
    // simplemente las ignoraba, por lo que el descuento nunca quedaba
    // guardado al editar un producto.
    const payload = {
      ...form,
      nombre:           nombreLimpio,
      precio:           precioNum,
      descripcion:      (form.descripcion || '').trim(),
      descuento:        form.descuento ? Number(form.descuento) : 0,
      fecha_inicio_desc: form.descuento && Number(form.descuento) > 0 ? form.fechaInicioDesc : '',
      fecha_fin_desc:    form.descuento && Number(form.descuento) > 0 ? form.fechaFinDesc    : '',
    };
    delete payload.fechaInicioDesc;
    delete payload.fechaFinDesc;
    try {
      const r = inicial
        ? await productosService.update(inicial.id, payload)
        : await productosService.create(payload);
      if (r?.error) { setError(r.error); return; }
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el producto.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 620, textAlign: 'left', padding: '32px 36px', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 4 }}>{inicial ? 'Editar producto' : 'Nuevo producto'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {inicial ? `Modificando: ${inicial.nombre}` : 'Agrega un producto al menú'}
        </p>
        {error && (
          <div style={{ background: 'rgba(229,57,53,0.12)', color: 'var(--color-red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre */}
          <div className="mod-form-group">
            <label>Nombre <span className="required">*</span></label>
            <input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Capuchino" />
          </div>

          {/* Categoría + Precio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mod-form-group">
              <label>Categoría <span className="required">*</span></label>
              <select value={form.categoria} onChange={set('categoria')}>
                <option value="">Seleccionar...</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="mod-form-group">
              <label>Precio COP <span className="required">*</span></label>
              <input type="number" value={form.precio} onChange={set('precio')} placeholder="Ej: 4500" />
            </div>
          </div>

          {/* ── SECCIÓN DESCUENTO ── */}
          <div style={{
            background:'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>
              🏷️ Descuento (opcional)
            </div>

            {/* % descuento */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'flex-start' }}>
              <div className="mod-form-group" style={{ margin: 0 }}>
                <label>Porcentaje %</label>
                <input
                  type="number" value={form.descuento} onChange={set('descuento')}
                  placeholder="Ej: 20"
                />
              </div>
              {/* Preview precio con descuento */}
              <div style={{ paddingTop: 22 }}>
                {precioDesc ? (
                  <div style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Vista previa:</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#E53935' }}>{fmt(precioDesc)}</span>
                      <span style={{ fontSize: 13, color: '#bbb', textDecoration: 'line-through' }}>{fmt(Number(form.precio))}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#E53935', color: 'white', padding: '2px 8px', borderRadius: 20 }}>
                        -{form.descuento}%
                      </span>
                    </div>
                    {vigencia && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: vigencia.color, marginTop: 6 }}>
                        {vigencia.text}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Ingresa un % para ver la vista previa
                  </div>
                )}
              </div>
            </div>

            {/* Fechas — solo si hay descuento */}
            {form.descuento && Number(form.descuento) > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                <div className="mod-form-group" style={{ margin: 0 }}>
                  <label>Fecha inicio <span className="required">*</span></label>
                  <input
                    type="date" value={form.fechaInicioDesc}
                    onChange={set('fechaInicioDesc')}
                  />
                </div>
                <div className="mod-form-group" style={{ margin: 0 }}>
                  <label>Fecha fin <span className="required">*</span></label>
                  <input
                    type="date" value={form.fechaFinDesc}
                    onChange={set('fechaFinDesc')}
                  />
                </div>
              </div>
            )}

            {/* Info */}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              El descuento solo aparece en la landing durante las fechas establecidas.
              Si no pones fechas, no se habilitará.
            </p>
          </div>

          {/* Descripción */}
          <div className="mod-form-group">
            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Describe el producto..." rows={3} />
          </div>

          {/* Imagen Cloudinary */}
          <ImageUploader
            value={form.imagen}
            onChange={url => setForm(f => ({ ...f, imagen: url }))}
          />

          {/* Estado */}
          <div className="switch-wrap">
            <button
              type="button"
              className={`toggle-btn ${form.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
              onClick={() => setForm(f => ({ ...f, estado: f.estado === 'Activo' ? 'Inactivo' : 'Activo' }))}
            >
              <span className="toggle-thumb" />
            </button>
            <span className={`toggle-label-text ${form.estado === 'Activo' ? 'on' : 'off'}`}>{form.estado}</span>
          </div>

          <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary">
              {inicial ? '💾 Guardar' : '+ Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal "Ver detalles" ─────────────────────────────────────
// Muestra todos los campos del producto que no caben en la tabla/tarjeta
// principal: descripción completa, fechas de descuento, categoría, estado.
function ProductoDetalleModal({ producto: p, onClose }) {
  const vigente = descuentoVigente(p);
  const pd      = vigente ? calcPrecioFinal(p) : null;
  const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso + 'T00:00:00')) : '—';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520, textAlign: 'left', padding: '28px 32px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          {p.imagen
            ? <img src={p.imagen} alt={p.nombre} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} onError={e => e.target.style.display='none'}/>
            : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>☕</div>
          }
          <div>
            <h3 style={{ margin: 0 }}>{p.nombre}</h3>
            <span className="badge-cat">{p.categoria || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Precio</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {pd ? <>{fmt(pd)} <span style={{ fontSize: 12, color: '#bbb', textDecoration: 'line-through', fontWeight: 400 }}>{fmt(p.precio)}</span></> : fmt(p.precio)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estado</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: p.estado === 'Activo' ? '#2E7D32' : '#888' }}>{p.estado}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descuento</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{p.descuento > 0 ? `${p.descuento}%` : 'Sin descuento'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vigencia</div>
            <div style={{ fontSize: 13 }}>
              {p.descuento > 0
                ? <>{fmtFecha(p.fecha_inicio_desc)} — {fmtFecha(p.fecha_fin_desc)}</>
                : '—'}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Descripción</div>
          <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{p.descripcion || <em style={{ color: '#bbb' }}>Sin descripción</em>}</p>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────
export default function ProductosPage() {
  const { hasPermiso } = useAuth();
  const [productos, setProductos] = useState([]);
  useEffect(() => {
    productosService.getAll()
      .then(d => setProductos(Array.isArray(d) ? d : []))
      .catch(() => setProductos([]));
  }, []);
  const [query,     setQuery]     = useState('');
  const [catFilter, setCatFilter] = useState('Todas');
  // Filtro por precio (columna "Precio" ya visible en la tabla/tarjeta) —
  // rango mín/máx además de la búsqueda por nombre.
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  // Filtro "solo con descuento activo" — reusa descuentoVigente (misma
  // columna "Descuento" ya visible en la tabla/tarjeta), así que un
  // descuento programado a futuro o ya vencido no cuenta como activo.
  const [soloDescuento, setSoloDescuento] = useState(false);
  // Filtro por estado (Activo / Inactivo) — la columna ya estaba en la
  // tabla pero no se podía acotar la lista por ella.
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [vista,     setVista]     = useState('tabla');
  const [modal,     setModal]     = useState(null);
  const [verTarget, setVerTarget] = useState(null);
  const [deleteTarget, setDel]    = useState(null);
  const [success,   setSuccess]   = useState('');
  const [page,      setPage]      = useState(1);
  const PER_PAGE = 5;

  const refresh = () => {
    productosService.getAll()
      .then(d => setProductos(Array.isArray(d) ? d : []))
      .catch(() => setProductos([]));
  };
  const showOk  = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const cats       = ['Todas', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  // El buscador ahora cubre también la descripción y el id, además de
  // nombre y categoría.
  const q          = query.trim().toLowerCase();
  let shown        = q
    ? productos.filter(p =>
        (p.nombre      || '').toLowerCase().includes(q) ||
        (p.categoria   || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q) ||
        String(p.id).includes(q))
    : productos;
  if (catFilter !== 'Todas') shown = shown.filter(p => p.categoria === catFilter);
  if (estadoFiltro !== 'Todos') shown = shown.filter(p => (p.estado || 'Activo') === estadoFiltro);
  if (precioMin !== '') shown = shown.filter(p => Number(p.precio) >= Number(precioMin));
  if (precioMax !== '') shown = shown.filter(p => Number(p.precio) <= Number(precioMax));
  if (soloDescuento) shown = shown.filter(p => descuentoVigente(p) !== null);
  const sorted     = [...shown].sort((a, b) => Number(b.id) - Number(a.id));
  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const paginated  = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleDelete = async () => {
    try {
      await productosService.remove(deleteTarget.id);
      refresh();
      showOk(`Producto "${deleteTarget.nombre}" eliminado`);
    } catch (err) {
      showOk(err.message || 'No se pudo eliminar el producto.');
    }
    setDel(null);
  };

  // Renderiza precio con descuento vigente o precio normal
  const renderPrecio = (p, small = false) => {
    const vigente = descuentoVigente(p);
    const pd      = vigente ? calcPrecioFinal(p) : null;
    const sz      = small ? { main: 13, orig: 11 } : { main: 14, orig: 12 };
    if (pd) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: '#E53935', fontSize: sz.main }}>{fmt(pd)}</span>
          <span style={{ fontSize: sz.orig, color: '#bbb', textDecoration: 'line-through' }}>{fmt(p.precio)}</span>
          <span style={{ fontSize: 10, fontWeight: 700, background: '#E53935', color: 'white', padding: '1px 6px', borderRadius: 10 }}>-{p.descuento}%</span>
        </div>
      );
    }
    return <span style={{ fontWeight: 700, color: '#4CAF50', fontSize: sz.main }}>{fmt(p.precio)}</span>;
  };

  // Badge de estado del descuento en tabla
  const renderDescuentoBadge = p => {
    if (!p.descuento || p.descuento <= 0) return <span style={{ color: '#bbb', fontSize: 12 }}>—</span>;
    const vigente = descuentoVigente(p);
    const hoy = new Date().toISOString().split('T')[0];
    let label = '', bg = '', color = '';
    if (vigente) { label = `✅ -${p.descuento}% vigente`; bg = '#E8F5E9'; color = '#2E7D32'; }
    else if (p.fecha_inicio_desc && hoy < p.fecha_inicio_desc) { label = `⏳ -${p.descuento}% programado`; bg = '#FFF8E1'; color = '#FF8F00'; }
    else { label = `⛔ -${p.descuento}% vencido`; bg = '#FFEBEE'; color = '#E53935'; }
    return (
      <span style={{ background: bg, color, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    );
  };

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        {modal && (
          <ProductoModal
            inicial={modal === 'new' ? null : modal}
            productos={productos}
            onClose={() => setModal(null)}
            onSave={() => { refresh(); setModal(null); showOk(modal === 'new' ? 'Producto creado' : 'Producto actualizado'); }}
          />
        )}

        {verTarget && (
          <ProductoDetalleModal producto={verTarget} onClose={() => setVerTarget(null)} />
        )}

        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Productos del Menú</h1>
            <p className="page-subtitle">Gestiona los productos visibles en la landing page</p>
          </div>
          {hasPermiso('productos', 'crear') && (
            <button className="btn-add" onClick={() => setModal('new')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nuevo producto
            </button>
          )}
        </div>

        <div className="insumos-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre, categoría o descripción..."
                value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/>
              {query && <button className="search-clear" onClick={() => { setQuery(''); setPage(1); }}>✕</button>}
            </div>
          </div>
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            title="Filtrar productos por categoría"
            style={{ padding: '10px 14px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }}
            title="Filtrar productos por estado"
            style={{ padding: '10px 14px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}>
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activos</option>
            <option value="Inactivo">Inactivos</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" placeholder="Precio mín." value={precioMin}
              onChange={e => { setPrecioMin(e.target.value); setPage(1); }}
              style={{ width: 110, padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>–</span>
            <input type="number" placeholder="Precio máx." value={precioMax}
              onChange={e => { setPrecioMax(e.target.value); setPage(1); }}
              style={{ width: 110, padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
            {(precioMin !== '' || precioMax !== '') && (
              <button className="search-clear" onClick={() => { setPrecioMin(''); setPrecioMax(''); setPage(1); }}>✕</button>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={soloDescuento} onChange={e => { setSoloDescuento(e.target.checked); setPage(1); }}/>
            Solo con descuento activo
          </label>
          {(query || catFilter !== 'Todas' || estadoFiltro !== 'Todos' || precioMin !== '' || precioMax !== '' || soloDescuento) && (
            <button className="btn-limpiar-filtros" title="Limpiar filtros"
              onClick={() => { setQuery(''); setCatFilter('Todas'); setEstadoFiltro('Todos'); setPrecioMin(''); setPrecioMax(''); setSoloDescuento(false); setPage(1); }}>
              ✕ Limpiar filtros
            </button>
          )}
         <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
  {['tabla','grid'].map(v => (
    <button key={v} onClick={() => setVista(v)} style={{
      padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--border)',
      background: vista===v ? 'var(--color-green)' : 'var(--bg-surface)',
      color: vista===v ? '#ffffff' : 'var(--text-secondary)',
      fontSize: 13, fontWeight: 600,
    }}>{v === 'tabla' ? 'Tabla' : 'Tarjetas'}</button>
  ))}
</div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{shown.length} producto{shown.length!==1?'s':''}</span>
        </div>

        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
                </svg>
              </div>
              <h3>Sin productos</h3>
              <p>{query ? `Sin resultados para "${query}"` : catFilter !== 'Todas' ? `Sin productos en "${catFilter}"` : soloDescuento ? 'Ningún producto tiene un descuento activo ahora mismo' : 'Crea el primer producto'}</p>
              {!query && catFilter === 'Todas' && !soloDescuento && hasPermiso('productos', 'crear') && <button className="btn-add-first" onClick={() => setModal('new')}>Nuevo producto</button>}
            </div>
          ) : vista === 'tabla' ? (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr><th>Imagen</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Descuento</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginated.map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.imagen
                          ? <img src={p.imagen} alt={p.nombre} style={{ width:42, height:42, borderRadius:8, objectFit:'cover' }} onError={e => e.target.style.display='none'}/>
                          : <div style={{ width:42, height:42, borderRadius:8, background:'var(--bg-surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>☕</div>
                        }
                      </td>
                      <td className="td-nombre">{p.nombre}</td>
                      <td><span className="badge-cat">{p.categoria||'—'}</span></td>
                      <td>{renderPrecio(p)}</td>
                      <td>{renderDescuentoBadge(p)}</td>
                      <td>
                        {hasPermiso('productos', 'editar') ? (
                          <button className={`toggle-btn ${p.estado==='Activo'?'toggle-on':'toggle-off'}`}
                            onClick={async () => {
                              try { await productosService.toggleEstado(p); refresh(); }
                              catch (err) { showOk(err.message || 'No se pudo cambiar el estado del producto.'); }
                            }}>
                            <span className="toggle-thumb"/>
                          </button>
                        ) : (
                          <span className={`toggle-btn ${p.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                        )}
                      </td>
                      <td>
                        <div className="actions-group">
                          {hasPermiso('productos', 'ver') && (
                            <Tooltip label="Ver detalles">
                              <button className="btn-ver" onClick={() => setVerTarget(p)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('productos', 'editar') && (
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => setModal(p)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('productos', 'eliminar') && <AnularButton onClick={() => setDel(p)}/>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              <div className="prod-grid">
                {paginated.map(p => {
                  const vigente = descuentoVigente(p);
                  const pd      = vigente ? calcPrecioFinal(p) : null;
                  return (
                    <div className="prod-card" key={p.id}>
                      <div style={{ position: 'relative' }}>
                        {p.imagen
                          ? <img className="prod-card__img" src={p.imagen} alt={p.nombre} onError={e => e.target.style.display='none'}/>
                          : <div className="prod-card__placeholder">☕</div>
                        }
                        {vigente && p.descuento > 0 && (
                          <span style={{ position:'absolute', top:8, left:8, background:'#E53935', color:'white', fontSize:11, fontWeight:800, padding:'3px 8px', borderRadius:20 }}>
                            -{p.descuento}%
                          </span>
                        )}
                      </div>
                      <div className="prod-card__body">
                        <div className="prod-card__name">{p.nombre}</div>
                        <div className="prod-card__cat">{p.categoria}</div>
                        <div style={{ marginTop:4 }}>{renderPrecio(p, true)}</div>
                      </div>
                      <div className="prod-card__foot">
                        {hasPermiso('productos', 'editar') ? (
                          <button className={`toggle-btn ${p.estado==='Activo'?'toggle-on':'toggle-off'}`}
                            style={{ transform:'scale(0.85)' }}
                            onClick={async () => {
                              try { await productosService.toggleEstado(p); refresh(); }
                              catch (err) { showOk(err.message || 'No se pudo cambiar el estado del producto.'); }
                            }}>
                            <span className="toggle-thumb"/>
                          </button>
                        ) : (
                          <span className={`toggle-btn ${p.estado==='Activo'?'toggle-on':'toggle-off'}`} style={{transform:'scale(0.85)',cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                        )}
                        <div className="actions-group">
                          {hasPermiso('productos', 'ver') && (
                            <Tooltip label="Ver detalles">
                              <button className="btn-ver" onClick={() => setVerTarget(p)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('productos', 'editar') && (
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => setModal(p)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('productos', 'eliminar') && <AnularButton size={15} onClick={() => setDel(p)}/>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderTop:'1px solid #f0f0f0', marginTop:4 }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, shown.length)} de {shown.length}</span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid rgba(255,255,255,.12)', background:page===1?'#f5f5f5':'white', color:page===1?'#bbb':'#333', cursor:page===1?'not-allowed':'pointer', fontSize:13, fontWeight:600 }}>← Ant.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    style={{ padding:'6px 11px', borderRadius:8, border:`1.5px solid ${n===page?'#4CAF50':'#ddd'}`, background:n===page?'#4CAF50':'white', color:n===page?'white':'#333', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid rgba(255,255,255,.12)', background:page===totalPages?'#f5f5f5':'white', color:page===totalPages?'#bbb':'#333', cursor:page===totalPages?'not-allowed':'pointer', fontSize:13, fontWeight:600 }}>Sig. →</button>
              </div>
            </div>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDel(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
              </div>
              <h3>¿Detener producto?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDel(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}