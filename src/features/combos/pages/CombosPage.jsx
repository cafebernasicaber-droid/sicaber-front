// ─────────────────────────────────────────────────────────────
//  src/features/combos/pages/CombosPage.jsx
//  Módulo independiente de Combos.
//  Conectado con: productos + adiciones
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import combosService from '../services/combosService';
import productosService from '../../productos/services/productosService';
import adicionesService from '../../adiciones/services/adicionesService';
import toppingsService from '../../toppings/services/toppingsService';
import { toppingsParaProducto } from '../../../shared/utils/toppings';
import '../../insumos/pages/InsumosPage.css';
import '../../productos/pages/Modulos.css';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// La columna fecha_inicio/fecha_fin es tipo timestamp en Postgres — pg la
// devuelve como fecha+hora completa ("2026-08-19T05:00:00.000Z"), no como
// "YYYY-MM-DD" plano. Cortar a los primeros 10 caracteres antes de separar
// evita que la hora ("T05:00:00.000Z") se cuele como si fuera el día.
const soloFecha = (iso) => iso ? String(iso).slice(0, 10) : '';
const formatFecha = (iso) => {
  const f = soloFecha(iso);
  if (!f) return null;
  const [y, m, d] = f.split('-');
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
};

// combosService.hoy() no existe (nunca se agregó a ese servicio) — se
// llamaba igual más abajo en este archivo, un TypeError en espera de pasar
// que quedó oculto hasta ahora: solo se ejecutaba si un combo tenía
// fecha_fin, y eso nunca ocurría por el bug de guardado del backend
// (arreglado aparte). Con las fechas ya guardándose de verdad, este helper
// evita que la tarjeta se rompa apenas un combo tenga fecha de fin.
const hoyStr = () => new Date().toISOString().slice(0, 10);

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

// ── Modal Combo ───────────────────────────────────────────────
function ComboModal({ inicial, onClose, onSave }) {
  const [todosProductos, setTodosProductos] = useState([]);
  useEffect(() => {
    productosService.getActivos().then(d => setTodosProductos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const [todasAdiciones, setTodasAdiciones] = useState([]);
  useEffect(() => {
    adicionesService.getAll().then(d => setTodasAdiciones(Array.isArray(d) ? d.filter(a=>a.estado==='Activo') : [])).catch(()=>{});
  }, []);
  const [todosToppings, setTodosToppings] = useState([]);
  useEffect(() => {
    toppingsService.getAll().then(d => setTodosToppings(Array.isArray(d) ? d.filter(t=>t.estado==='Activo') : [])).catch(()=>{});
  }, []);

  // Cada producto del combo se guarda en el mismo arreglo `items` que ya
  // existe en la tabla `combos` (columna jsonb) y que el backend ya
  // persiste sin cambios — antes el formulario armaba `productos` y
  // `adiciones` (esta última a nivel de combo, no por producto), campos
  // que el backend nunca leía, así que lo seleccionado se perdía al
  // guardar y "Editar" siempre abría el combo vacío. Ahora cada producto
  // es un objeto independiente con su propia cantidad/toppings/adiciones,
  // así ningún producto puede pisar la configuración de otro.
  const hoy = hoyStr();
  // El backend guarda las fechas de vigencia como fecha_inicio/fecha_fin
  // (snake_case, columnas reales de la tabla) — leerlas como
  // inicial.fechaInicio/inicial.fechaFin siempre daba undefined, así que al
  // abrir "Editar" las fechas aparecían vacías aunque sí estuvieran
  // guardadas.
  const [form, setForm] = useState(
    inicial
      ? { ...inicial,
          fechaInicio: soloFecha(inicial.fechaInicio || inicial.fecha_inicio),
          fechaFin:    soloFecha(inicial.fechaFin    || inicial.fecha_fin),
          productos: (inicial.items || []).map(p => ({
            id: p.id, nombre: p.nombre, precioOriginal: p.precioOriginal,
            cantidad: p.cantidad || 1, toppings: p.toppings || [], adiciones: p.adiciones || [],
          })) }
      : { nombre: '', descripcion: '', precio: '', imagen: '', estado: 'Activo', productos: [], fechaInicio: '', fechaFin: '' }
  );
  const [error, setError] = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const totalOriginal = (form.productos || []).reduce((s, p) => {
    const adicionesTotal = (p.adiciones || []).reduce((s2, a) => s2 + (Number(a.precio) || 0), 0);
    return s + ((p.precioOriginal || 0) + adicionesTotal) * (p.cantidad || 1);
  }, 0);
  const ahorro = totalOriginal > 0 && Number(form.precio) > 0 ? totalOriginal - Number(form.precio) : 0;

  const toggleProducto = prod => {
    setForm(f => {
      const existe = f.productos.find(p => p.id === prod.id);
      return {
        ...f,
        productos: existe
          ? f.productos.filter(p => p.id !== prod.id)
          : [...f.productos, { id: prod.id, nombre: prod.nombre, precioOriginal: prod.precio, cantidad: 1, toppings: [], adiciones: [] }],
      };
    });
  };

  // Todos los "set" de abajo actualizan únicamente el producto con ese id
  // dentro del arreglo — los demás productos del combo quedan intactos.
  const setProductoField = (prodId, updater) => setForm(f => ({
    ...f,
    productos: f.productos.map(p => p.id === prodId ? updater(p) : p),
  }));
  const cambiarCantidad = (prodId, delta) => setProductoField(prodId, p => ({ ...p, cantidad: Math.max(1, (p.cantidad || 1) + delta) }));
  const toggleProductoTopping = (prodId, topping) => setProductoField(prodId, p => {
    const sel = p.toppings.find(t => t.id === topping.id);
    return { ...p, toppings: sel ? p.toppings.filter(t => t.id !== topping.id) : [...p.toppings, { id: topping.id, nombre: topping.nombre }] };
  });
  const toggleProductoAdicion = (prodId, adic) => setProductoField(prodId, p => {
    const sel = p.adiciones.find(a => a.id === adic.id);
    return { ...p, adiciones: sel ? p.adiciones.filter(a => a.id !== adic.id) : [...p.adiciones, { id: adic.id, nombre: adic.nombre, precio: adic.precio }] };
  });

  const [saving, setSaving] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim()) { setError('El nombre del combo es obligatorio.'); return; }
    const precioNum = Number(form.precio);
    if (form.precio === '' || isNaN(precioNum) || precioNum < 0) { setError('Ingresa un precio válido (mayor o igual a 0).'); return; }
    if (form.fechaInicio && form.fechaInicio < hoy) {
      setError('La fecha de inicio no puede ser anterior a hoy.'); return;
    }
    if (form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio) {
      setError('La fecha de fin no puede ser anterior a la de inicio.'); return;
    }
    if ((form.productos || []).length === 0) {
      setError('Agrega al menos un producto al combo.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, items: form.productos };
      inicial
        ? await combosService.update(inicial.id, payload)
        : await combosService.create(payload);
      onSave();
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el combo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box"
        style={{ maxWidth: 620, textAlign: 'left', padding: '32px 36px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{inicial ? 'Editar combo' : 'Nuevo combo'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {inicial ? `Modificando: ${inicial.nombre}` : 'Crea un combo con precio especial'}
        </p>
        {error && (
          <div style={{ background: 'rgba(229,57,53,0.12)', color: 'var(--color-red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre + Precio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mod-form-group">
              <label>Nombre del combo <span className="required">*</span></label>
              <input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Combo Mañanero" />
            </div>
            <div className="mod-form-group">
              <label>Precio especial COP <span className="required">*</span></label>
              <input type="number" value={form.precio} onChange={set('precio')} placeholder="Ej: 3500" />
            </div>
          </div>

          {/* Vista previa del ahorro */}
          {totalOriginal > 0 && Number(form.precio) > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: ahorro > 0 ? 'rgba(93,187,99,0.15)' : 'rgba(255,183,0,0.12)',
              border: `1px solid ${ahorro > 0 ? '#C8E6C9' : '#FFE082'}`,
              borderRadius: 10, padding: '10px 16px',
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Precio individual: <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{fmt(totalOriginal)}</span>
              </div>
              {ahorro > 0
                ? <span style={{ fontWeight: 700, color: '#2E7D32', fontSize: 13 }}>✓ Cliente ahorra {fmt(ahorro)}</span>
                : <span style={{ fontWeight: 700, color: '#F57F17', fontSize: 13 }}>⚠ El precio combo es mayor al individual</span>
              }
            </div>
          )}

          {/* Fechas de vigencia */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="mod-form-group">
              <label>Fecha de inicio <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
              <input type="date" value={form.fechaInicio || ''} onChange={set('fechaInicio')} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Desde cuándo aparece el combo en el menú
              </span>
            </div>
            <div className="mod-form-group">
              <label>Fecha de fin <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
              <input type="date" value={form.fechaFin || ''} onChange={set('fechaFin')} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Al vencer se desactiva automáticamente
              </span>
            </div>
          </div>

          {/* Descripción */}
          <div className="mod-form-group">
            <label>Descripción <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
            <textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: Ideal para empezar el día..." rows={2} maxLength={LIMITES.DESCRIPCION} />
            <div style={{fontSize:11,color:enElTope(form.descripcion,LIMITES.DESCRIPCION)?'#E53935':'var(--text-muted)',textAlign:'right',marginTop:3}}>{contador(form.descripcion,LIMITES.DESCRIPCION)}</div>
          </div>

          {/* Selección de productos */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Productos incluidos en el combo
            </label>
            {todosProductos.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay productos activos disponibles.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {todosProductos.map(p => {
                  const sel = form.productos.find(x => x.id === p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProducto(p)}
                      style={{
                        padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${sel ? '#4CAF50' : '#ddd'}`,
                        background: sel ? 'rgba(93,187,99,0.15)' : 'var(--bg-surface)',
                        color: sel ? '#2E7D32' : '#555',
                        transition: 'all .15s',
                      }}>
                      {p.nombre} · {fmt(p.precio)}
                      {sel && <span style={{ marginLeft: 5 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Configuración independiente de cada producto del combo:
              cantidad, toppings (solo los que aplican a ESE producto) y
              adiciones (propias de ese producto, nunca compartidas). */}
          {form.productos.length > 0 && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                Configura cada producto del combo
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {form.productos.map(p => {
                  const toppingsDisponibles = toppingsParaProducto(todosToppings, p.id);
                  return (
                    <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-surface-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{p.nombre}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button type="button" onClick={() => cambiarCantidad(p.id, -1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--bg-surface)', cursor: 'pointer' }}>−</button>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{p.cantidad}</span>
                            <button type="button" onClick={() => cambiarCantidad(p.id, 1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--bg-surface)', cursor: 'pointer' }}>+</button>
                          </div>
                          <button type="button" onClick={() => toggleProducto(p)} title="Quitar producto del combo"
                            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(229,57,53,0.12)', color: '#E53935', cursor: 'pointer' }}>✕</button>
                        </div>
                      </div>

                      {toppingsDisponibles.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>Toppings de este producto</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {toppingsDisponibles.map(t => {
                              const sel = p.toppings.find(x => x.id === t.id);
                              return (
                                <button key={t.id} type="button" onClick={() => toggleProductoTopping(p.id, t)}
                                  style={{ padding: '5px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: `1.5px solid ${sel ? '#4CAF50' : 'var(--border)'}`,
                                    background: sel ? 'rgba(93,187,99,0.15)' : 'var(--bg-surface)',
                                    color: sel ? '#2E7D32' : '#555' }}>
                                  {t.nombre}{sel && ' ✓'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {todasAdiciones.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>Adiciones de este producto</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {todasAdiciones.map(a => {
                              const sel = p.adiciones.find(x => x.id === a.id);
                              return (
                                <button key={a.id} type="button" onClick={() => toggleProductoAdicion(p.id, a)}
                                  style={{ padding: '5px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: `1.5px solid ${sel ? '#FF8F00' : 'var(--border)'}`,
                                    background: sel ? 'rgba(255,183,0,0.10)' : 'var(--bg-surface)',
                                    color: sel ? '#E65100' : '#555' }}>
                                  {a.nombre} · {fmt(a.precio)}{sel && ' ✓'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Imagen */}
          <div className="mod-form-group">
            <label>Imagen del combo <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
            <ImageUploader value={form.imagen} onChange={val => setForm(f => ({ ...f, imagen: val }))} />
          </div>

         {/* Estado - Solo al editar */}
{inicial && (
  <div className="switch-wrap">
    <button
      type="button"
      className={`toggle-btn ${form.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
      onClick={() =>
        setForm(f => ({
          ...f,
          estado: f.estado === 'Activo' ? 'Inactivo' : 'Activo'
        }))
      }
    >
      <span className="toggle-thumb" />
    </button>

    <span className={`toggle-label-text ${form.estado === 'Activo' ? 'on' : 'off'}`}>
      {form.estado}
    </span>
  </div>
)}
          <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary" disabled={saving}>
              {saving ? 'Guardando…' : (inicial ? '💾 Guardar' : '+ Crear combo')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal "Ver detalle" ──────────────────────────────────────
// Muestra toda la información del combo: productos incluidos (con sus
// toppings/adiciones), precio, descuento/ahorro frente al precio
// individual, vigencia (inicio/fin) y estado — todo lo que la tarjeta ya
// insinúa pero no siempre alcanza a mostrar completo.
function ComboDetalleModal({ combo, onClose }) {
  const totalOrig = (combo.items || []).reduce((s, p) => {
    const adicionesTotal = (p.adiciones || []).reduce((s2, a) => s2 + (Number(a.precio) || 0), 0);
    return s + ((p.precioOriginal || 0) + adicionesTotal) * (p.cantidad || 1);
  }, 0);
  const ahorro = totalOrig > combo.precio ? totalOrig - combo.precio : 0;
  const fechaInicio = soloFecha(combo.fecha_inicio || combo.fechaInicio) || soloFecha(combo.created_at);
  const fechaFin    = soloFecha(combo.fecha_fin    || combo.fechaFin);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520, textAlign: 'left', padding: '32px 36px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          {combo.imagen
            ? <img src={combo.imagen} alt={combo.nombre} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} onError={e => e.target.style.display = 'none'}/>
            : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🎁</div>
          }
          <div>
            <h3 style={{ margin: 0 }}>{combo.nombre}</h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: combo.estado === 'Activo' ? '#2E7D32' : 'var(--text-muted)' }}>
              {combo.estado === 'Activo' ? '● Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Precio combo</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#4CAF50' }}>{fmt(combo.precio)}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Precio individual</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textDecoration: totalOrig > 0 ? 'line-through' : 'none' }}>{totalOrig > 0 ? fmt(totalOrig) : '—'}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ahorro / descuento</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: ahorro > 0 ? '#E53935' : 'var(--text-primary)' }}>{ahorro > 0 ? fmt(ahorro) : 'Sin ahorro'}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vigencia</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {fechaInicio ? `Desde ${formatFecha(fechaInicio)}` : '—'}{fechaFin ? ` — Hasta ${formatFecha(fechaFin)}` : ''}
            </div>
          </div>
        </div>

        {combo.descripcion && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Descripción</div>
            <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{combo.descripcion}</p>
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Productos incluidos ({combo.items?.length || 0})
          </div>
          {(combo.items || []).length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Este combo no tiene productos configurados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {combo.items.map((p, i) => (
                <div key={p.id ?? i} style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.nombre}
                    {p.precioOriginal != null && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}> · {fmt(p.precioOriginal)} c/u</span>}
                  </div>
                  {p.toppings?.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Toppings: {p.toppings.map(t => t.nombre).join(', ')}</div>
                  )}
                  {p.adiciones?.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Adiciones: {p.adiciones.map(a => a.nombre).join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Paginación ────────────────────────────────────────────────
const PER_PAGE = 6;

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
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border-input)', background: page === 1 ? 'var(--bg-surface-3)' : 'var(--bg-surface)', color: page === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>← Ant.</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
          <button key={n} onClick={() => onPage(n)}
            style={{ padding: '6px 11px', borderRadius: 8, border: `1.5px solid ${n === page ? '#4CAF50' : '#ddd'}`, background: n === page ? 'var(--color-green)' : 'var(--bg-surface)', color: n === page ? '#ffffff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {n}
          </button>
        ))}
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border-input)', background: page === totalPages ? 'var(--bg-surface-3)' : 'var(--bg-surface)', color: page === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>Sig. →</button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function CombosPage() {
  const [combos,     setCombos]     = useState([]);
  const [query,      setQuery]      = useState('');
  const [modal,      setModal]      = useState(null);
  const [verCombo,   setVerCombo]   = useState(null);
  const [delCombo,   setDelCombo]   = useState(null);
  // Combo pendiente de confirmar el cambio de estado — antes el botón
  // Activar/Desactivar aplicaba el cambio al primer clic, sin preguntar.
  const [estadoTarget, setEstadoTarget] = useState(null);
  const [page,       setPage]       = useState(1);
  const [success,    setSuccess]    = useState('');
  // Filtros que faltaban por completo en este módulo: estado, rango de
  // precio y rango de fechas de vigencia. Antes solo se podía buscar por
  // nombre.
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [precioMin,    setPrecioMin]    = useState('');
  const [precioMax,    setPrecioMax]    = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');

  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const refresh = () => { combosService.getAll().then(d => setCombos(Array.isArray(d) ? d : [])).catch(()=>{}); };

  useEffect(() => {
    combosService.getAll().then(d => setCombos(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []); // solo al montar

  // Buscador ampliado: nombre, descripción y también el nombre de los
  // productos incluidos en el combo.
  const q = query.trim().toLowerCase();
  let shown = q
    ? combos.filter(c =>
        (c.nombre      || '').toLowerCase().includes(q) ||
        (c.descripcion || '').toLowerCase().includes(q) ||
        (c.items || []).some(p => (p.nombre || '').toLowerCase().includes(q)))
    : combos;
  if (estadoFiltro !== 'Todos') shown = shown.filter(c => (c.estado || 'Activo') === estadoFiltro);
  if (precioMin !== '') shown = shown.filter(c => (Number(c.precio) || 0) >= Number(precioMin));
  if (precioMax !== '') shown = shown.filter(c => (Number(c.precio) || 0) <= Number(precioMax));
  // Rango de vigencia: se compara contra fecha_inicio/fecha_fin (soloFecha
  // ya recorta el timestamp que devuelve Postgres a YYYY-MM-DD, el mismo
  // formato del <input type="date">).
  if (fechaDesde) shown = shown.filter(c => { const d = soloFecha(c.fechaInicio || c.fecha_inicio); return d && d >= fechaDesde; });
  if (fechaHasta) shown = shown.filter(c => { const d = soloFecha(c.fechaFin    || c.fecha_fin);    return d && d <= fechaHasta; });

  const hayFiltros = !!(q || estadoFiltro !== 'Todos' || precioMin !== '' || precioMax !== '' || fechaDesde || fechaHasta);
  const paginated = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        {/* ── Header ── */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Combos</h1>
            <p className="page-subtitle">Combos especiales con precio promocional para los clientes del menú</p>
          </div>
          <button className="btn-add" onClick={() => setModal('new')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo combo
          </button>
        </div>

        {/* ── Modal ── */}
        {modal && (
          <ComboModal
            inicial={modal === 'new' ? null : modal}
            onClose={() => setModal(null)}
            onSave={() => {
              refresh();
              setModal(null);
              showOk(modal === 'new' ? 'Combo creado' : 'Combo actualizado');
            }}
          />
        )}

        {verCombo && (
          <ComboDetalleModal combo={verCombo} onClose={() => setVerCombo(null)} />
        )}

        {/* ── Toolbar ── */}
        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </span>
              <input className="search-input" placeholder="Buscar por combo, descripción o producto..." value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }} />
              {query && <button className="search-clear" onClick={() => { setQuery(''); setPage(1); }}>✕</button>}
            </div>
          </div>
          <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); setPage(1); }}
            title="Filtrar combos por estado"
            style={{ padding: '9px 12px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activos</option>
            <option value="Inactivo">Inactivos</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Filtrar combos por precio">
            <input type="number" placeholder="Precio mín." value={precioMin}
              onChange={e => { setPrecioMin(e.target.value); setPage(1); }}
              style={{ width: 105, padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>–</span>
            <input type="number" placeholder="Precio máx." value={precioMax}
              onChange={e => { setPrecioMax(e.target.value); setPage(1); }}
              style={{ width: 105, padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Filtrar combos por vigencia">
            <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              style={{ padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>–</span>
            <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              style={{ padding: '9px 10px', border: '1.5px solid var(--border-input)', borderRadius: 8, fontSize: 12.5, background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}/>
            {(fechaDesde || fechaHasta) && (
              <button className="search-clear" title="Limpiar filtro de fechas"
                onClick={() => { setFechaDesde(''); setFechaHasta(''); setPage(1); }}>✕</button>
            )}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {shown.length} combo{shown.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Tarjetas ── */}
        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" style={{ fontSize: 36 }}>🎁</div>
              <h3>{hayFiltros ? 'Sin coincidencias' : 'No hay combos'}</h3>
              <p>{query ? `Sin resultados para "${query}"` : hayFiltros ? 'Ningún combo cumple los filtros aplicados' : 'Crea el primer combo especial del menú'}</p>
              {!hayFiltros && <button className="btn-add-first" onClick={() => setModal('new')}>Nuevo combo</button>}
            </div>
          ) : (
            <>
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {paginated.map(combo => {
                  const totalOrig = (combo.items || []).reduce((s, p) => {
                    const adicionesTotal = (p.adiciones || []).reduce((s2, a) => s2 + (Number(a.precio) || 0), 0);
                    return s + ((p.precioOriginal || 0) + adicionesTotal) * (p.cantidad || 1);
                  }, 0);
                  const ahorro = totalOrig > combo.precio ? totalOrig - combo.precio : 0;
                  // El backend devuelve fecha_inicio/fecha_fin (snake_case,
                  // columnas reales) — leer combo.fechaInicio/fechaFin daba
                  // siempre undefined, así que la fecha de inicio nunca
                  // aparecía en la tarjeta.
                  // "Desde" siempre se muestra: si no se definió una fecha de
                  // inicio de vigencia explícita, el combo está vigente desde
                  // que se creó — se usa created_at como respaldo. "Hasta"
                  // solo se muestra si de verdad tiene una fecha de fin.
                  const fechaInicio = soloFecha(combo.fecha_inicio || combo.fechaInicio) || soloFecha(combo.created_at);
                  const fechaFin    = soloFecha(combo.fecha_fin    || combo.fechaFin);
                  return (
                    <div key={combo.id} style={{
                      background: 'var(--bg-surface)', borderRadius: 14,
                      border: `1.5px solid ${combo.estado === 'Activo' ? 'var(--color-green)' : 'var(--border)'}`,
                      overflow: 'hidden',
                      boxShadow: combo.estado === 'Activo' ? '0 4px 16px rgba(76,175,80,0.1)' : '0 2px 8px rgba(0,0,0,0.05)',
                      // Antes: cada tarjeta era un bloque normal, así que los
                      // botones de acción quedaban a distinta altura entre
                      // tarjetas según cuánto contenido tuviera arriba
                      // (descripción, fechas, productos incluidos). Con la
                      // tarjeta como columna flex y los botones con
                      // marginTop:auto más abajo, siempre quedan anclados
                      // abajo del todo, sin importar el contenido de arriba.
                      display: 'flex', flexDirection: 'column',
                    }}>
                      {/* Imagen o placeholder */}
                      <div style={{ height: 110, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                        {combo.imagen
                          ? <img src={combo.imagen} alt={combo.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 40 }}>🎁</span>
                        }
                        <span style={{
                          position: 'absolute', top: 8, right: 8,
                          background: combo.estado === 'Activo' ? 'rgba(93,187,99,0.15)' : 'var(--bg-surface-3)',
                          color: combo.estado === 'Activo' ? '#5DBB63' : 'var(--text-muted)',
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                        }}>
                          {combo.estado === 'Activo' ? '● Activo' : 'Inactivo'}
                        </span>
                        {/* Badge de vencimiento próximo */}
                        {combo.estado === 'Activo' && fechaFin && (() => {
                          const today = hoyStr();
                          const diff = Math.ceil((new Date(fechaFin) - new Date(today)) / 86400000);
                          if (diff < 0) return <span style={{ position:'absolute', bottom:8, left:8, background:'#B71C1C', color:'white', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>Vencido</span>;
                          if (diff <= 3) return <span style={{ position:'absolute', bottom:8, left:8, background:'#E65100', color:'white', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>Vence en {diff}d</span>;
                          return null;
                        })()}
                      </div>

                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{combo.nombre}</div>
                        {combo.descripcion && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{combo.descripcion}</div>}

                        {/* Fechas de vigencia — "Desde" siempre (con
                            respaldo en created_at), "Hasta" solo si el
                            combo tiene una fecha de fin definida. */}
                        {fechaInicio && (
                          <div style={{ display:'flex', gap:10, marginBottom:8, flexWrap:'wrap' }}>
                            <span style={{ fontSize:11, color:'var(--text-secondary)', background:'var(--bg-surface-2)', borderRadius:6, padding:'2px 8px', display:'flex', alignItems:'center', gap:4 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                              Desde {formatFecha(fechaInicio)}
                            </span>
                            {fechaFin && (
                              <span style={{ fontSize:11, color:'var(--text-secondary)', background:'var(--bg-surface-2)', borderRadius:6, padding:'2px 8px', display:'flex', alignItems:'center', gap:4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                Hasta {formatFecha(fechaFin)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Productos incluidos, cada uno con sus propios toppings/adiciones */}
                        {combo.items?.length > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, background: 'var(--bg-surface-2)', borderRadius: 6, padding: '6px 8px' }}>
                            {combo.items.map((p, i) => (
                              <div key={p.id ?? i} style={{ marginBottom: i < combo.items.length - 1 ? 4 : 0 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.cantidad > 1 ? `${p.cantidad}× ` : ''}{p.nombre}</span>
                                {(p.toppings?.length > 0 || p.adiciones?.length > 0) && (
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    {' '}({[...(p.toppings || []).map(t => t.nombre), ...(p.adiciones || []).map(a => a.nombre)].join(', ')})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 18, fontWeight: 900, color: '#4CAF50' }}>{fmt(combo.precio)}</span>
                          {totalOrig > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'line-through' }}>{fmt(totalOrig)}</span>}
                          {ahorro > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, background: '#E53935', color: 'white', padding: '2px 8px', borderRadius: 20 }}>
                              Ahorras {fmt(ahorro)}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                          <button onClick={() => setEstadoTarget(combo)}
                            style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1.5px solid ${combo.estado === 'Activo' ? '#E53935' : 'var(--color-green)'}`, background: 'var(--bg-surface)', color: combo.estado === 'Activo' ? '#E53935' : 'var(--color-green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            {combo.estado === 'Activo' ? 'Desactivar' : 'Activar'}
                          </button>
                          <Tooltip label="Ver detalle" position="bottom">
                            <button onClick={() => setVerCombo(combo)}
                              style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          </Tooltip>
                          <Tooltip label="Editar" position="bottom">
                            <button onClick={() => setModal(combo)}
                              style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </Tooltip>
                          <AnularButton size={14} position="bottom" onClick={() => setDelCombo(combo)} className=""
                            style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid rgba(229,57,53,0.25)', background: 'rgba(229,57,53,0.08)', color: '#E53935', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination page={page} total={shown.length} perPage={PER_PAGE} onPage={setPage} />
            </>
          )}
        </div>

        {/* ── Modal confirmar activar/desactivar ── */}
        {estadoTarget && (
          <div className="modal-overlay" onClick={() => setEstadoTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon" style={{ background: estadoTarget.estado === 'Activo' ? 'rgba(245,127,23,0.15)' : 'rgba(76,175,80,0.15)', color: estadoTarget.estado === 'Activo' ? '#F57F17' : '#4CAF50' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
              </div>
              <h3>{estadoTarget.estado === 'Activo' ? '¿Deseas desactivar este combo?' : '¿Deseas activar este combo?'}</h3>
              <p>
                {estadoTarget.estado === 'Activo'
                  ? 'Dejará de estar disponible en la landing pública.'
                  : 'Volverá a estar disponible en la landing pública.'}
              </p>
              <div className="modal-detail">"{estadoTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setEstadoTarget(null)}>Cancelar</button>
                <button className="btn-add" onClick={async () => {
                  const objetivo = estadoTarget;
                  setEstadoTarget(null);
                  try {
                    await combosService.toggleEstado(objetivo.id);
                    refresh();
                    showOk(`Combo "${objetivo.nombre}" ${objetivo.estado === 'Activo' ? 'desactivado' : 'activado'} correctamente.`);
                  } catch (err) {
                    showOk(err.message || 'No se pudo cambiar el estado del combo.');
                  }
                }}>
                  {estadoTarget.estado === 'Activo' ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal eliminar ── */}
        {delCombo && (
          <div className="modal-overlay" onClick={() => setDelCombo(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">🎁</div>
              <h3>¿Detener combo?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{delCombo.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDelCombo(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={async () => {
                  try {
                    await combosService.remove(delCombo.id);
                    refresh();
                    showOk(`Combo "${delCombo.nombre}" anulado`);
                  } catch (err) {
                    showOk(err.message || 'No se pudo anular el combo.');
                  }
                  setDelCombo(null);
                }}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}