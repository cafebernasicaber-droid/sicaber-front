import React, { useState, useEffect } from 'react';
import insumosService from '../services/insumosService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import categoriasInsumosService from '../services/categoriasInsumosService';
import './InsumoForm.css';

const EMPTY_FORM = {
  nombre: '',
  categoria: '',
  categoriaId: '',
  unidadMedida: '',
  stockActual: '',
  stockMinimo: '',
  proveedor: '',
  proveedorId: '',
  descripcion: '',
  estado: 'Activo',
  tamanoOz: '',
  // 2 — solo informativo: no cambia ninguna lógica de stock ni de costo,
  // es para poder filtrar/encontrar más rápido los insumos candidatos a
  // topping al armar la sección "Toppings" de una ficha técnica.
  esTopping: false,
};

// Los vasos ya NO son una categoría especial ni una lista definida en el
// código: cualquier insumo cuya unidad de medida sea "oz" se trata como un
// vaso y muestra el campo de tamaño. Las opciones de abajo son solo atajos
// comunes en el selector — "Otro" permite escribir cualquier tamaño nuevo,
// así que no es una lista cerrada.
const TAMANOS_OZ_PRESET = [4, 7, 9, 12, 14, 16, 20, 24];

const tieneComprasActivas = (insumoNombre) => {
  try {
    const compras = JSON.parse(localStorage.getItem('sicaber_compras') || '[]');
    const nombre = (insumoNombre || '').toLowerCase().trim();
    return compras
      .filter(c => c.estado !== 'anulada')
      .some(c => (c.items || []).some(it =>
        (it.insumo || '').toLowerCase().trim() === nombre
      ));
  } catch { return false; }
};

const InsumoForm = ({ initialData, onSubmit, onCancel, isEditing, serverError, onManageCategorias }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [hasActiveCompras, setHasActiveCompras] = useState(false);
  const [tamanoOzEsOtro, setTamanoOzEsOtro] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm({
        nombre:       initialData.nombre       || '',
        categoria:    initialData.categoria    || '',
        categoriaId:  initialData.categoriaId  || '',
        unidadMedida: initialData.unidadMedida || '',
        stockActual:  initialData.stockActual  ?? '',
        stockMinimo:  initialData.stockMinimo  ?? '',
        proveedor:    initialData.proveedor    || '',
        proveedorId:  initialData.proveedorId  || '',
        descripcion:  initialData.descripcion  || '',
        estado:       initialData.estado !== undefined ? initialData.estado : 'Activo',
        tamanoOz:     initialData.tamanoOz     ?? '',
        esTopping:    !!initialData.esTopping,
      });
      setTamanoOzEsOtro(
        initialData.tamanoOz != null && initialData.tamanoOz !== '' && !TAMANOS_OZ_PRESET.includes(Number(initialData.tamanoOz))
      );
      if (isEditing && initialData.nombre) {
        setHasActiveCompras(tieneComprasActivas(initialData.nombre));
      }
    }
  }, [initialData, isEditing]);

  // Solo unidades de medida reales del insumo. "Caja", "paquete", "bolsa" y
  // "docena" NO son unidades de medida — son presentaciones de compra (cómo
  // lo empaca el proveedor), y se manejan aparte en el formulario de
  // Registrar Compra ("Comprar por presentación"), nunca aquí.
  const unidades    = ['kg', 'g', 'lb', 'oz', 'L', 'mL', 'unidad'];
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  useEffect(() => {
    categoriasInsumosService.getAll()
      .then(d => setCategoriasDisponibles(Array.isArray(d) ? d.filter(c => c.estado === 'Activo') : []))
      .catch(() => setCategoriasDisponibles([]));
  }, []);
  const [proveedores, setProveedores] = useState([]);
  useEffect(() => {
    proveedoresService.getAll()
      .then(d => setProveedores(Array.isArray(d) ? d : []))
      .catch(() => setProveedores([]));
  }, []);

  const validate = () => {
    const errs = {};
    if (!form.nombre.trim())      errs.nombre       = 'El nombre es obligatorio';
    if (!form.categoria)          errs.categoria    = 'Selecciona una categoría';
    if (form.unidadMedida === 'oz' && (form.tamanoOz === '' || isNaN(form.tamanoOz) || Number(form.tamanoOz) <= 0)) {
      errs.tamanoOz = 'Selecciona o escribe el tamaño del vaso';
    }
    if (!form.unidadMedida)       errs.unidadMedida = 'Selecciona una unidad de medida';
    if (form.stockActual === '' || isNaN(form.stockActual) || Number(form.stockActual) < 0) errs.stockActual = 'El stock actual debe ser 0 o mayor';
    if (form.stockMinimo === '' || isNaN(form.stockMinimo) || Number(form.stockMinimo) < 1) errs.stockMinimo = 'El stock mínimo debe ser 1 o mayor';
    if (proveedoresActivos.length > 0 && !form.proveedor.trim()) errs.proveedor = 'Selecciona un proveedor';
    return errs;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox' && name === 'estado') {
      setForm(prev => ({ ...prev, estado: checked ? 'Activo' : 'Inactivo' }));
    } else {
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleCategoriaChange = (e) => {
    const selectedId = e.target.value;
    const cat = categoriasDisponibles.find(c => String(c.id) === selectedId);
    const nombreCat = cat ? cat.nombre : '';
    setForm(prev => ({ ...prev, categoriaId: selectedId, categoria: nombreCat }));
    if (errors.categoria) setErrors(prev => ({ ...prev, categoria: '' }));
  };

  const handleProveedorChange = (e) => {
    const selectedId = e.target.value;
    const prov = proveedores.find(p => String(p.id) === selectedId);
    setForm(prev => ({
      ...prev,
      proveedorId: selectedId,
      proveedor: prov ? prov.nombre : ''
    }));
    if (errors.proveedor) setErrors(prev => ({ ...prev, proveedor: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (noHayProveedores) {
      window.alert('No hay proveedores disponibles. Registra un proveedor o activa uno existente en Gestión de Proveedores antes de crear un insumo.');
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit({
      ...form,
      stockActual: parseInt(form.stockActual, 10) || 0,
      stockMinimo: Math.max(1, parseInt(form.stockMinimo, 10) || 1),
      tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
    });
  };

  // "Disponible" significa que existe al menos un proveedor Activo — no basta
  // con que existan proveedores si todos están inactivos.
  const proveedoresActivos = proveedores.filter(p => p.estado === 'Activo');
  const noHayProveedores = proveedoresActivos.length === 0;
  // Al editar, si el proveedor ya asignado quedó inactivo mientras tanto,
  // lo seguimos mostrando en la lista para no perder la selección actual.
  const proveedorActualInactivo = isEditing && form.proveedorId && !proveedoresActivos.some(p => String(p.id) === String(form.proveedorId))
    ? proveedores.find(p => String(p.id) === String(form.proveedorId))
    : null;
  const opcionesProveedor = proveedorActualInactivo ? [...proveedoresActivos, proveedorActualInactivo] : proveedoresActivos;

  return (
    <form className="insumo-form" onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="form-server-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {serverError}
        </div>
      )}

      <div className="form-grid">
        <div className={`fg ${errors.nombre ? 'fg-error' : ''}`}>
          <label>Nombre del insumo <span className="req">*</span></label>
          <input type="text" name="nombre" value={form.nombre} onChange={handleChange} placeholder="Ej: Café tostado fino" />
          {errors.nombre && <span className="err-msg">{errors.nombre}</span>}
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
            <div style={{ padding: '10px 14px', background: 'rgba(245,176,0,0.12)', border: '1px solid rgba(245,176,0,0.3)', borderRadius: 8, fontSize: 13, color: '#E65100' }}>
              ⚠ No hay categorías registradas. {onManageCategorias
                ? <button type="button" onClick={onManageCategorias} style={{ background:'none',border:'none',padding:0,color:'#E65100',fontWeight:700,textDecoration:'underline',cursor:'pointer' }}>Crea una primero en "Gestionar categorías"</button>
                : 'Crea una primero en "Gestionar categorías" antes de registrar un insumo.'}
            </div>
          ) : (
            <select name="categoria" value={form.categoriaId} onChange={handleCategoriaChange}>
              <option value="">-- Seleccionar --</option>
              {categoriasDisponibles.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {errors.categoria && <span className="err-msg">{errors.categoria}</span>}
        </div>

        <div className={`fg ${errors.unidadMedida ? 'fg-error' : ''}`}>
          <label>Unidad de medida <span className="req">*</span></label>
          {isEditing ? (
            <>
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover, rgba(128,128,128,.08))', border: '1px solid var(--border-input)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                🔒 {form.unidadMedida || '—'}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                La unidad de medida no se puede cambiar después de crear el insumo.
              </span>
            </>
          ) : (
            <>
              <select name="unidadMedida" value={form.unidadMedida} onChange={handleChange}>
                <option value="">-- Seleccionar --</option>
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 8, fontSize: 12, color: '#C9A227', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span>⚠</span>
                <span>Elige con cuidado: una vez registrado el insumo, esta unidad queda fija y no se podrá cambiar.</span>
              </div>
            </>
          )}
          {errors.unidadMedida && <span className="err-msg">{errors.unidadMedida}</span>}
        </div>

        {form.unidadMedida === 'oz' && (
          <div className={`fg ${errors.tamanoOz ? 'fg-error' : ''}`}>
            <label>Tamaño del vaso (oz) <span className="req">*</span></label>
            <select
              value={tamanoOzEsOtro ? 'otro' : (form.tamanoOz !== '' ? String(form.tamanoOz) : '')}
              onChange={e => {
                const v = e.target.value;
                if (v === 'otro') {
                  setTamanoOzEsOtro(true);
                  setForm(prev => ({ ...prev, tamanoOz: '' }));
                } else {
                  setTamanoOzEsOtro(false);
                  setForm(prev => ({ ...prev, tamanoOz: v }));
                }
                if (errors.tamanoOz) setErrors(prev => ({ ...prev, tamanoOz: '' }));
              }}
            >
              <option value="">-- Seleccionar --</option>
              {TAMANOS_OZ_PRESET.map(oz => <option key={oz} value={oz}>{oz} oz</option>)}
              <option value="otro">Otro...</option>
            </select>
            {tamanoOzEsOtro && (
              <input
                type="number" min="0.1" step="0.1" placeholder="Escribe el tamaño en oz" style={{ marginTop: 8 }}
                value={form.tamanoOz}
                onChange={e => { setForm(prev => ({ ...prev, tamanoOz: e.target.value })); if (errors.tamanoOz) setErrors(prev => ({ ...prev, tamanoOz: '' })); }}
              />
            )}
            {errors.tamanoOz && <span className="err-msg">{errors.tamanoOz}</span>}
          </div>
        )}

        <div className={`fg ${errors.proveedor ? 'fg-error' : ''}`}>
          <label>Proveedor <span className="req">*</span></label>
          {noHayProveedores ? (
            <div style={{ padding: '10px 14px', background: 'rgba(245,176,0,0.12)', border: '1px solid rgba(245,176,0,0.3)', borderRadius: 8, fontSize: 13, color: '#E65100' }}>
              ⚠ No hay proveedores disponibles (no hay ninguno registrado, o todos están inactivos). Ve a Gestión de Proveedores para registrar o activar uno antes de continuar.
            </div>
          ) : (
            <select
              value={form.proveedorId}
              onChange={handleProveedorChange}
            >
              <option value="">-- Seleccionar proveedor --</option>
              {opcionesProveedor.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.estado !== 'Activo' ? ' (Inactivo)' : ''}</option>
              ))}
            </select>
          )}
          {errors.proveedor && <span className="err-msg">{errors.proveedor}</span>}
        </div>

        <div className={`fg ${errors.stockActual ? 'fg-error' : ''}`}>
          <label>Stock actual <span className="req">*</span></label>
          {isEditing && hasActiveCompras ? (
            <div style={{ padding: '10px 14px', background: 'rgba(229,57,53,.1)', border: '1px solid rgba(239,83,80,.3)', borderRadius: 8, fontSize: 13, color: '#EF9A9A', lineHeight: 1.5 }}>
              🔒 <strong style={{color:'#EF5350'}}>Stock bloqueado:</strong> Este insumo tiene compras activas. Para ajustar el stock, primero anula las compras correspondientes.
              <div style={{ marginTop:6, fontWeight:700, color:'var(--text-primary)' }}>Stock actual: {form.stockActual}</div>
            </div>
          ) : (
            <>
              <input
                type="number" name="stockActual" value={form.stockActual}
                onChange={e => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) < 0) return;
                  handleChange(e);
                }}
                placeholder="0" min="0" step="1"
              />
              {isEditing && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Puedes corregir el stock manualmente. No puede ser menor a 0.
                </span>
              )}
            </>
          )}
          {errors.stockActual && <span className="err-msg">{errors.stockActual}</span>}
        </div>

        <div className={`fg ${errors.stockMinimo ? 'fg-error' : ''}`}>
          <label>Stock mínimo <span className="req">*</span></label>
          <input
            type="number" name="stockMinimo" value={form.stockMinimo}
            onChange={e => {
              const val = e.target.value;
              if (val !== '' && Number(val) < 1) return;
              handleChange(e);
            }}
            placeholder="1" min="1" step="1"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Se mostrará alerta cuando el stock caiga por debajo de este valor
          </span>
          {errors.stockMinimo && <span className="err-msg">{errors.stockMinimo}</span>}
        </div>

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

        {/* 2 — solo informativo (no toca stock ni costo): facilita
            encontrar este insumo al armar la sección "Toppings" de una
            ficha técnica. */}
        <div className="fg">
          <label>&nbsp;</label>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'10px 0' }}>
            <input type="checkbox" name="esTopping" checked={form.esTopping} onChange={handleChange}
              style={{ width:16, height:16, cursor:'pointer', accentColor:'#4CAF50' }}/>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Este insumo se usa como topping</span>
          </label>
        </div>

        <div className="fg fg-full">
          <label>Descripción</label>
          <textarea name="descripcion" value={form.descripcion} onChange={handleChange} placeholder="Descripción opcional del insumo..." rows={3} />
        </div>
      </div>

      <div className="form-footer">
        <button type="button" className="btn-form-cancel" onClick={onCancel}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Cancelar
        </button>
        <button type="submit" className="btn-form-submit" disabled={noHayProveedores || categoriasDisponibles.length === 0}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isEditing
              ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
            }
          </svg>
          {isEditing ? 'Guardar cambios' : 'Registrar insumo'}
        </button>
      </div>
    </form>
  );
};

export default InsumoForm;