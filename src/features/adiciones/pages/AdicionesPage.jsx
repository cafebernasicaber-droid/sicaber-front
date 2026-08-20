// ─────────────────────────────────────────────────────────────
//  src/features/adiciones/pages/AdicionesPage.jsx
//  Módulo exclusivo de Adiciones.
//  Combos fue movido a src/features/combos/pages/CombosPage.jsx
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import adicionesService from '../services/adicionesService';
import insumosService from '../../insumos/services/insumosService';
import InsumoSearchSelect from '../../../shared/components/InsumoSearchSelect';
import '../../insumos/pages/InsumosPage.css';
import '../../productos/pages/Modulos.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// ── ImageUploader ────────────────────────────────────────────
function ImageUploader({ value, onChange }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const processFile = file => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => onChange(e.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => processFile(e.target.files[0])} />
      {value ? (
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <img src={value} alt="preview"
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1.5px solid #E0E0E0', display: 'block' }} />
          <button type="button" onClick={e => { e.stopPropagation(); onChange(''); }}
            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✕</button>
        </div>
      ) : (
        <div onClick={() => inputRef.current.click()}
          onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          style={{ border: `2px dashed ${dragging ? '#4CAF50' : '#CCCCCC'}`, borderRadius: 10, background: dragging ? '#F1F8F1' : '#FAFAFA', padding: '24px 16px', textAlign: 'center', cursor: 'pointer' }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Arrastra tu imagen aquí</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>o haz clic para seleccionarla</p>
          <button type="button" onClick={() => inputRef.current.click()}
            style={{ background: 'linear-gradient(135deg,#4CAF50,#388E3C)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Seleccionar imagen
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal Adición ────────────────────────────────────────────
function AdicionModal({ inicial, insumos, onClose, onSave }) {
  const [form, setForm] = useState(
    inicial
      ? { ...inicial, cantidad: inicial.cantidad ?? '' }
      : { nombre: '', precio: '', descripcion: '', imagen: '', estado: 'Activo', insumo_id: null, cantidad: '' }
  );
  const [error, setError] = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  // 1 — igual que en Toppings: selector de insumo opcional (buscador con
  // lupa compartido) + cantidad que consume esta adición. No cambia el
  // precio ni el comportamiento de venta — es solo para poder descontar
  // stock/costo real cuando la adición sí consume un insumo (ej. "Leche de
  // coco" sí gasta insumo; "Vaso personalizado" quizás no).
  const insumoSel = insumos.find(i => String(i.id) === String(form.insumo_id));

  // Contador de palabras de la descripción, visible mientras se escribe.
  const palabrasDescripcion = (form.descripcion || '').trim() ? (form.descripcion || '').trim().split(/\s+/) : [];

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (form.nombre !== form.nombre.trimStart()) { setError('El nombre no puede empezar con un espacio en blanco.'); return; }
    if (!form.nombre.trim()) { setError('El nombre de la adición es obligatorio.'); return; }
    const precioNum = Number(form.precio);
    if (form.precio === '' || isNaN(precioNum) || precioNum < 0) { setError('Ingresa un precio válido (mayor o igual a 0).'); return; }
    if (form.insumo_id && form.cantidad !== '' && (isNaN(form.cantidad) || Number(form.cantidad) < 0)) {
      setError('La cantidad consumida debe ser un número válido (mayor o igual a 0).');
      return;
    }
    if (form.descripcion && form.descripcion !== form.descripcion.trimStart()) {
      setError('La descripción no puede empezar con un espacio en blanco.');
      return;
    }
    if (palabrasDescripcion.length > 20) {
      setError(`La descripción no puede tener más de 20 palabras (tiene ${palabrasDescripcion.length}).`);
      return;
    }
    const payload = { ...form, nombre: form.nombre.trim(), descripcion: (form.descripcion || '').trim(), precio: precioNum, cantidad: form.insumo_id && form.cantidad !== '' ? Number(form.cantidad) : null };
    try {
      const r = inicial ? await adicionesService.update(inicial.id, payload) : await adicionesService.create(payload);
      if (r?.error) { setError(r.error); return; }
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la adición.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box"
        style={{ maxWidth: 520, textAlign: 'left', padding: '32px 36px' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{inicial ? 'Editar adición' : 'Nueva adición'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {inicial ? `Modificando: ${inicial.nombre}` : 'Agrega una adición al menú'}
        </p>
        {error && (
          <div style={{ background: 'rgba(229,57,53,0.12)', color: 'var(--color-red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mod-form-group">
              <label>Nombre <span className="required">*</span></label>
              <input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Leche de coco" />
            </div>
            <div className="mod-form-group">
              <label>Precio COP <span className="required">*</span></label>
              <input type="number" value={form.precio} onChange={set('precio')} placeholder="1500" />
            </div>
          </div>
          <div className="mod-form-group">
            <label>Insumo asociado <span style={{fontWeight:400,color:'var(--text-muted)'}}>(opcional)</span></label>
            <p style={{fontSize:12,color:'var(--text-muted)',marginTop:0,marginBottom:8}}>
              Déjalo vacío si esta adición es solo un extra de precio sin consumo real de insumos.
            </p>
            <InsumoSearchSelect
              insumos={insumos}
              value={form.insumo_id}
              onSelect={found => setForm(f => ({...f, insumo_id: found.id}))}
              placeholder="Buscar insumo..."
            />
            {insumoSel && (
              <>
                <div style={{marginTop:10}}>
                  <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>
                    Cantidad de {insumoSel.unidadMedida || 'unidad'} que consume <span style={{fontWeight:400,color:'var(--text-muted)'}}>(opcional)</span>
                  </label>
                  <input type="number" step="0.1" value={form.cantidad} onChange={set('cantidad')}
                    placeholder={`Ej: 1 ${insumoSel.unidadMedida || ''}`}
                    style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13,outline:'none'}}/>
                </div>
                <button type="button" onClick={() => setForm(f => ({...f, insumo_id: null, cantidad: ''}))}
                  style={{marginTop:6,background:'none',border:'none',padding:0,color:'var(--text-muted)',fontSize:12,textDecoration:'underline',cursor:'pointer'}}>
                  Quitar insumo asociado
                </button>
              </>
            )}
          </div>
          <div className="mod-form-group">
            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Descripción opcional..." rows={2} maxLength={LIMITES.DESCRIPCION} />
            <div style={{fontSize:11,color:enElTope(form.descripcion,LIMITES.DESCRIPCION)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.descripcion,LIMITES.DESCRIPCION)}</div>
            <div style={{ fontSize: 11, color: palabrasDescripcion.length > 20 ? '#E53935' : 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {palabrasDescripcion.length}/20 palabras
            </div>
          </div>
          <div className="mod-form-group">
            <label>Imagen de la adición</label>
            <ImageUploader value={form.imagen} onChange={val => setForm(f => ({ ...f, imagen: val }))} />
          </div>
          <div className="switch-wrap">
            <button type="button" className={`toggle-btn ${form.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
              onClick={() => setForm(f => ({ ...f, estado: f.estado === 'Activo' ? 'Inactivo' : 'Activo' }))}>
              <span className="toggle-thumb" />
            </button>
            <span className={`toggle-label-text ${form.estado === 'Activo' ? 'on' : 'off'}`}>{form.estado}</span>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary">
              {inicial ? '💾 Guardar' : '+ Crear adición'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(iso)) : '—';

// ── Modal "Ver detalle" ──────────────────────────────────────
function AdicionDetalleModal({ adicion: a, insumos, onClose }) {
  const insumoSel = insumos.find(i => String(i.id) === String(a.insumo_id));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480, textAlign: 'left', padding: '32px 36px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{a.nombre}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Detalle de la adición</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            ['Precio', fmt(a.precio)],
            ['Estado', a.estado === 'Activo' ? '✅ Activo' : '❌ Inactivo'],
            ['Insumo asociado', insumoSel ? insumoSel.nombre : 'Ninguno (solo extra de precio)'],
            ['Cantidad consumida', insumoSel && a.cantidad != null ? `${a.cantidad} ${insumoSel.unidadMedida || ''}` : '—'],
            ['Fecha de creación', fmtFecha(a.created_at)],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Descripción</div>
          <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{a.descripcion || <em style={{ color: '#bbb' }}>Sin descripción</em>}</p>
        </div>
        {a.imagen && <img src={a.imagen} alt={a.nombre} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginBottom: 16 }} onError={e => { e.target.style.display = 'none'; }}/>}
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Paginación ────────────────────────────────────────────────
const PER_PAGE = 5;

function Pagination({ page, total, perPage, onPage }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Mostrando {from}–{to} de {total}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: page === 1 ? '#f5f5f5' : 'white', color: page === 1 ? '#000000' : '#333', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>← Ant.</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
          <button key={n} onClick={() => onPage(n)}
            style={{ padding: '6px 11px', borderRadius: 8, border: `1.5px solid ${n === page ? '#4CAF50' : '#ddd'}`, background: n === page ? 'var(--color-green)' : 'var(--bg-surface)', color: n === page ? '#ffffff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {n}
          </button>
        ))}
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: page === totalPages ? 'var(--bg-surface-3)' : 'var(--bg-surface)', color: page === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>Sig. →</button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function AdicionesPage() {
  const [adiciones, setAdiciones] = useState([]);
  const [insumos, setInsumos] = useState([]);
  useEffect(() => {
    adicionesService.getAll()
      .then(d => setAdiciones(Array.isArray(d) ? d : []))
      .catch(() => setAdiciones([]));
    // 1 — catálogo de insumos para el selector "Insumo asociado" del modal.
    insumosService.getAll()
      .then(d => setInsumos(Array.isArray(d) ? d : []))
      .catch(() => setInsumos([]));
  }, []);
  const [query,     setQuery]     = useState('');
  const [modal,     setModal]     = useState(null);
  const [verAdic,   setVerAdic]   = useState(null);
  const [delAdic,   setDelAdic]   = useState(null);
  const [page,      setPage]      = useState(1);
  const [success,   setSuccess]   = useState('');
  // Filtro por estado y ordenamiento (nombre A-Z / Z-A, precio mayor o
  // menor) — antes la tabla solo se podía buscar por nombre y siempre
  // llegaba en el orden que devolvía el backend.
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [orden,        setOrden]        = useState('nombre_az');
  // Adición pendiente de confirmar el cambio de estado: antes el toggle se
  // aplicaba de inmediato al primer clic, sin preguntar nada.
  const [estadoTarget, setEstadoTarget] = useState(null);

  const showOk  = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const refresh = () => {
    adicionesService.getAll()
      .then(d => setAdiciones(Array.isArray(d) ? d : []))
      .catch(() => setAdiciones([]));
  };

  // El buscador ahora cubre nombre Y descripción (las dos columnas de texto
  // visibles en la tabla).
  const q = query.trim().toLowerCase();
  let filtradas = q
    ? adiciones.filter(a =>
        (a.nombre      || '').toLowerCase().includes(q) ||
        (a.descripcion || '').toLowerCase().includes(q))
    : adiciones;
  if (estadoFiltro !== 'Todos') filtradas = filtradas.filter(a => (a.estado || 'Activo') === estadoFiltro);

  const COMPARADORES = {
    nombre_az:     (a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }),
    nombre_za:     (a, b) => (b.nombre || '').localeCompare(a.nombre || '', 'es', { sensitivity: 'base' }),
    precio_mayor:  (a, b) => (Number(b.precio) || 0) - (Number(a.precio) || 0),
    precio_menor:  (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
  };
  const shown     = [...filtradas].sort(COMPARADORES[orden] || COMPARADORES.nombre_az);
  const paginated = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        {/* ── Header ── */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Adiciones</h1>
            <p className="page-subtitle">Complementos y extras disponibles para los productos del menú</p>
          </div>
          <button className="btn-add" onClick={() => setModal('new')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva adición
          </button>
        </div>

        {/* ── Modal ── */}
        {modal && (
          <AdicionModal
            inicial={modal === 'new' ? null : modal}
            insumos={insumos}
            onClose={() => setModal(null)}
            onSave={() => {
              refresh();
              setModal(null);
              showOk(modal === 'new' ? 'Adición creada' : 'Adición actualizada');
            }}
          />
        )}

        {verAdic && (
          <AdicionDetalleModal adicion={verAdic} insumos={insumos} onClose={() => setVerAdic(null)}/>
        )}

        {/* ── Toolbar ── */}
        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre o descripción..." value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }} />
              {query && <button className="search-clear" onClick={() => { setQuery(''); setPage(1); }}>✕</button>}
            </div>
          </div>
          <select value={orden} onChange={e => { setOrden(e.target.value); setPage(1); }}
            title="Ordenar adiciones"
            style={{ padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
            <option value="nombre_az">Nombre (A - Z)</option>
            <option value="nombre_za">Nombre (Z - A)</option>
            <option value="precio_mayor">Precio (mayor a menor)</option>
            <option value="precio_menor">Precio (menor a mayor)</option>
          </select>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }}
            title="Filtrar adiciones por estado"
            style={{ padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activas</option>
            <option value="Inactivo">Inactivas</option>
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {shown.length} adición{shown.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {/* ── Tabla ── */}
        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
              </div>
              <h3>{query ? 'Sin coincidencias' : 'No hay adiciones'}</h3>
              <p>{query ? `Sin resultados para "${query}"` : 'Crea la primera adición del menú'}</p>
              {!query && <button className="btn-add-first" onClick={() => setModal('new')}>Nueva adición</button>}
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="insumos-table">
                  <thead>
                    <tr><th>Nombre</th><th>Precio</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {paginated.map(a => (
                      <tr key={a.id}>
                        <td className="td-nombre">{a.nombre}</td>
                        <td style={{ fontWeight: 700, color: '#4CAF50' }}>{fmt(a.precio)}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.descripcion || '—'}
                        </td>
                        <td>
                          <button className={`toggle-btn ${a.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                            title={a.estado === 'Activo' ? 'Desactivar adición' : 'Activar adición'}
                            onClick={() => setEstadoTarget(a)}>
                            <span className="toggle-thumb" />
                          </button>
                        </td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Ver detalle">
                              <button className="btn-ver" onClick={() => setVerAdic(a)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => setModal(a)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                            </Tooltip>
                            <AnularButton onClick={() => setDelAdic(a)}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={shown.length} perPage={PER_PAGE} onPage={setPage} />
            </>
          )}
        </div>

        {/* ── Modal confirmar cambio de estado ── */}
        {/* Antes el toggle aplicaba el cambio al primer clic, sin preguntar:
            desactivar una adición por error la sacaba del menú al instante y
            sin aviso. Ahora se confirma igual que la anulación. */}
        {estadoTarget && (
          <div className="modal-overlay" onClick={() => setEstadoTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon" style={{ background: estadoTarget.estado === 'Activo' ? 'rgba(245,127,23,0.15)' : 'rgba(76,175,80,0.15)', color: estadoTarget.estado === 'Activo' ? '#F57F17' : '#4CAF50' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
              </div>
              <h3>{estadoTarget.estado === 'Activo' ? '¿Desactivar esta adición?' : '¿Activar esta adición?'}</h3>
              <p>
                {estadoTarget.estado === 'Activo'
                  ? 'Dejará de estar disponible para agregar a los productos del menú.'
                  : 'Volverá a estar disponible para agregar a los productos del menú.'}
              </p>
              <div className="modal-detail">"{estadoTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setEstadoTarget(null)}>Cancelar</button>
                <button className="btn-add" onClick={async () => {
                  const objetivo = estadoTarget;
                  setEstadoTarget(null);
                  try {
                    await adicionesService.toggleEstado(objetivo.id);
                    refresh();
                    showOk(`Adición "${objetivo.nombre}" ${objetivo.estado === 'Activo' ? 'desactivada' : 'activada'}.`);
                  } catch (err) {
                    showOk(err.message || 'No se pudo cambiar el estado de la adición.');
                  }
                }}>
                  Sí, {estadoTarget.estado === 'Activo' ? 'desactivar' : 'activar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal eliminar ── */}
        {delAdic && (
          <div className="modal-overlay" onClick={() => setDelAdic(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </div>
              <h3>¿Anular adición?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{delAdic.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDelAdic(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={async () => {
                  try {
                    await adicionesService.remove(delAdic.id);
                    refresh();
                    showOk(`Adición "${delAdic.nombre}" anulada`);
                  } catch (err) {
                    showOk(err.message || 'No se pudo anular la adición.');
                  }
                  setDelAdic(null);
                }}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}