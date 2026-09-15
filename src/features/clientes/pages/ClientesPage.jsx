import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import Layout from '../../../shared/components/Layout';
import useClientes from '../hooks/useClientes';
import ClienteRegistroModal from '../components/ClienteRegistroModal';
import ClienteEditarModal from '../components/ClienteEditarModal';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import metodosPagoService from '../../../shared/services/metodosPagoService';
import { uploadToCloudinary, validateImageFile } from '../../../shared/services/cloudinaryService';
import { LIMITES, contador, enElTope } from '../../../shared/utils/limitesTexto';
import '../../insumos/pages/InsumosPage.css';

// ── Métodos de pago dinámicos (checkout de la Landing) ─────────────────────
// El QR se sube directo a Cloudinary (mismo mecanismo que ya usa el
// comprobante de una compra — cloudinaryService.js) y solo se guarda la URL
// resultante; el backend (metodos_pago) no sabe nada de archivos, solo de
// texto. Es opcional a propósito: un método puede crearse sin QR (ej.
// "Efectivo contra entrega" no necesita uno) y agregárselo después.
function MetodoPagoFormModal({ inicial, onClose, onSave }) {
  const [form, setForm] = useState({
    nombre: inicial?.nombre || '',
    descripcion: inicial?.descripcion || '',
  });
  const [urlQr, setUrlQr] = useState(inicial?.urlQr || '');       // ya subido (edición) o recién subido
  const [qrFile, setQrFile] = useState(null);                     // pendiente de subir
  const [qrPreview, setQrPreview] = useState(inicial?.urlQr || ''); // blob local o urlQr ya existente
  const [qrError, setQrError] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [subiendoQr, setSubiendoQr] = useState(false);
  const fileInputRef = useRef(null);
  const nombreRef = useRef(null);

  const validate = (f = form) => {
    const er = {};
    if (!f.nombre.trim()) er.nombre = 'El nombre del método de pago es obligatorio';
    return er;
  };
  const setField = (k, v) => {
    const nf = { ...form, [k]: v };
    setForm(nf);
    if (errors[k]) setErrors(e => ({ ...e, [k]: validate(nf)[k] || '' }));
  };
  const handleBlur = (k) => {
    setTouched(t => ({ ...t, [k]: true }));
    setErrors(e => ({ ...e, [k]: validate()[k] || '' }));
  };
  const okField = (k) => touched[k] && !errors[k] && form[k].trim();

  const handleQrFile = (file) => {
    setQrError('');
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.valid) { setQrError(check.error); return; }
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
  };
  const quitarQr = () => {
    setQrFile(null);
    setQrPreview('');
    setUrlQr('');
    setQrError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    const er = validate();
    if (Object.keys(er).length) {
      setErrors(er);
      setTouched({ nombre: true });
      nombreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nombreRef.current?.focus?.();
      return;
    }
    setSaving(true);
    try {
      let urlQrFinal = urlQr || null;
      // Solo se sube a Cloudinary si el usuario eligió un archivo NUEVO —
      // si está editando y no tocó el QR, urlQr ya trae la URL existente.
      if (qrFile) {
        setSubiendoQr(true);
        urlQrFinal = await uploadToCloudinary(qrFile);
        setSubiendoQr(false);
      }
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        url_qr: urlQrFinal,
      };
      const r = inicial
        ? await metodosPagoService.update(inicial.id, payload)
        : await metodosPagoService.create(payload);
      if (r?.error) { setError(r.error); setSaving(false); return; }
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el método de pago.');
      setSaving(false);
      setSubiendoQr(false);
    }
  };

  const inputStyle = (k) => ({ borderColor: errors[k] ? '#EF5350' : (okField(k) ? '#4CAF50' : undefined) });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460, textAlign: 'left', padding: '32px 36px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{inicial ? 'Editar método de pago' : 'Nuevo método de pago'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {inicial ? `Modificando: ${inicial.nombre}` : 'Se mostrará en el checkout de la tienda online'}
        </p>
        {error && <div style={{ background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13 }}>⚠ {error}</div>}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }} noValidate>
          <div className="emp-form-group">
            <label>Nombre <span style={{ color:'#EF5350' }}>*</span></label>
            <input ref={nombreRef} type="text" value={form.nombre} style={inputStyle('nombre')} maxLength={LIMITES.NOMBRE_CORTO}
              onChange={e => setField('nombre', e.target.value)} onBlur={() => handleBlur('nombre')}
              placeholder="Ej: Nequi, Bancolombia QR..." />
            {errors.nombre ? <span className="err-msg">{errors.nombre}</span> : okField('nombre') && <span className="ok-msg">✓ Válido</span>}
          </div>
          <div className="emp-form-group">
            <label>Descripción <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12 }}>(número, llave o instrucción — opcional)</span></label>
            <textarea value={form.descripcion} rows={2} maxLength={LIMITES.DESCRIPCION}
              onChange={e => setField('descripcion', e.target.value)}
              placeholder="Ej: 300 123 4567, o Llave: cafedonberna@bancolombia" />
            <div style={{ fontSize:11, color: enElTope(form.descripcion, LIMITES.DESCRIPCION) ? '#E53935' : 'var(--text-muted)', textAlign:'right', marginTop:3 }}>
              {contador(form.descripcion, LIMITES.DESCRIPCION)}
            </div>
          </div>
          <div className="emp-form-group">
            <label>Imagen QR <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12 }}>(opcional)</span></label>
            {qrPreview ? (
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <img src={qrPreview} alt="Vista previa del QR" style={{ width:96, height:96, objectFit:'contain', borderRadius:10, border:'1.5px solid var(--border-input)', background:'var(--bg-surface-2)' }}/>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <button type="button" className="btn-cancel" style={{ padding:'6px 12px', fontSize:12.5 }} onClick={() => fileInputRef.current?.click()}>
                    Cambiar imagen
                  </button>
                  <button type="button" onClick={quitarQr} style={{ background:'none', border:'none', color:'#E53935', fontSize:12, fontWeight:600, cursor:'pointer', padding:0, textAlign:'left' }}>
                    Quitar QR
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-cancel" style={{ width:'100%', padding:'14px', border:'1.5px dashed var(--border-input)', borderRadius:8 }}
                onClick={() => fileInputRef.current?.click()}>
                📷 Subir imagen QR
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display:'none' }}
              onChange={e => handleQrFile(e.target.files?.[0])}/>
            {qrError && <span className="err-msg">{qrError}</span>}
            <span style={{ display:'block', fontSize:11.5, color:'var(--text-muted)', marginTop:4 }}>
              El cliente lo verá al elegir este método de pago en el checkout.
            </span>
          </div>
          <div className="modal-actions" style={{ justifyContent:'flex-end', marginTop:4 }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary" disabled={saving}>
              {subiendoQr ? 'Subiendo QR…' : saving ? 'Guardando…' : (inicial ? '💾 Guardar cambios' : '✅ Crear método')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MetodosPagoTab({ showOk }) {
  const [metodos, setMetodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | metodo

  const refresh = () => {
    metodosPagoService.getAll()
      .then(d => { setMetodos(Array.isArray(d) ? d : []); setError(''); })
      .catch(err => setError(err.message || 'No se pudo cargar la lista de métodos de pago.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  const handleToggle = async (m) => {
    try {
      await metodosPagoService.toggleEstado(m.id);
      refresh();
      showOk(`"${m.nombre}" ahora está ${m.activo ? 'inactivo' : 'activo'}`);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado.');
    }
  };

  return (
    <div>
      {modal && (
        <MetodoPagoFormModal
          inicial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); refresh(); showOk(modal === 'new' ? 'Método de pago creado.' : 'Método de pago actualizado.'); }}
        />
      )}

      <div style={{ display:'flex', justifyContent:'flex-end', padding:'16px 20px 0' }}>
        <button className="btn-add" onClick={() => setModal('new')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo método de pago
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Cargando métodos de pago...</p></div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>No se pudo cargar</h3>
          <p>{error}</p>
        </div>
      ) : metodos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💳</div>
          <h3>No hay métodos de pago registrados</h3>
          <p>Créalos con el botón "Nuevo método de pago" — aparecerán en el checkout de la tienda online.</p>
        </div>
      ) : (
        <div className="locales-grid" style={{ padding: '16px 20px' }}>
          {metodos.map(m => (
            <div key={m.id} className={`local-card ${m.activo ? '' : 'local-card--inactivo'}`}>
              <div className="local-card__head">
                <div className="local-card__title">
                  <span className="local-card__icon">💳</span>
                  <span className="local-card__name" title={m.nombre}>{m.nombre}</span>
                </div>
                <span className={`local-card__estado ${m.activo ? 'is-on' : 'is-off'}`}>
                  {m.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div style={{ display:'flex', gap:12, padding:'10px 16px' }}>
                {m.urlQr ? (
                  <img src={m.urlQr} alt={`QR de ${m.nombre}`} style={{ width:64, height:64, objectFit:'contain', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-surface-2)', flexShrink:0 }}/>
                ) : (
                  <div style={{ width:64, height:64, borderRadius:8, border:'1px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--text-muted)', textAlign:'center', flexShrink:0 }}>
                    Sin QR
                  </div>
                )}
                <div style={{ fontSize:12.5, color:'var(--text-muted)', overflow:'hidden' }}>
                  {m.descripcion || <em>Sin descripción</em>}
                </div>
              </div>
              <div className="local-card__actions">
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <button className={`toggle-btn ${m.activo ? 'toggle-on' : 'toggle-off'}`} onClick={() => handleToggle(m)} title={m.activo ? 'Desactivar' : 'Activar'}>
                    <span className="toggle-thumb"/>
                  </button>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>{m.activo ? 'Visible en checkout' : 'Oculto en checkout'}</span>
                </div>
                <div className="actions-group">
                  <Tooltip label="Editar">
                    <button className="btn-accion btn-accion-editar" onClick={() => setModal(m)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ClientesPage = () => {
  const { hasPermiso, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientes, remove, toggleEstado, refresh } = useClientes();
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalCliente, setModalCliente] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  // Ítem 2 — "Métodos de pago" vive como pestaña acá adentro, mismo patrón
  // que "Locales" dentro de Gestión de Empleados. El backend restringe TODA
  // la administración de metodos_pago (incluido listar /todos) a rol
  // exactamente 'Administrador' — la pestaña se oculta para cualquier otro
  // rol en vez de mostrar un tab que siempre va a fallar con 403.
  const [tab, setTab] = useState('clientes'); // 'clientes' | 'metodos'
  const esAdministrador = !!user?.esAdmin;
  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  // Si llegamos aquí desde "Ver cliente → Editar", abrimos el modal
  // automáticamente para ese cliente (la edición ya no es una ruta aparte).
  useEffect(() => {
    const editId = location.state?.editId;
    if (editId && clientes.length > 0) {
      const c = clientes.find(cl => cl.id === editId);
      if (c) setEditTarget(c);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, clientes, navigate, location.pathname]);

  const shown = query.trim()
    ? clientes.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()) || (c.correo||'').toLowerCase().includes(query.toLowerCase()) || (c.telefono||'').includes(query))
    : clientes;

  const handleDelete = () => {
    const r = remove(deleteTarget.id);
    if (r.error) { setDeleteError(r.error); return; }
    setSuccess(`Cliente "${deleteTarget.nombre}" eliminado.`);
    setDeleteTarget(null); setDeleteError('');
    setTimeout(() => setSuccess(''), 3000);
  };

  const fmt = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}

        {modalCliente && (
          <ClienteRegistroModal
            onClose={() => setModalCliente(false)}
            onCreated={() => { setModalCliente(false); refresh(); setSuccess('Cliente registrado correctamente.'); setTimeout(() => setSuccess(''), 3000); }}
          />
        )}

        {editTarget && (
          <ClienteEditarModal
            cliente={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={() => { setEditTarget(null); refresh(); setSuccess('Cliente actualizado correctamente.'); setTimeout(() => setSuccess(''), 3000); }}
          />
        )}

        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Clientes</h1>
            <p className="page-subtitle">
              {tab === 'clientes'
                ? `${clientes.length} cliente${clientes.length!==1?'s':''} registrado${clientes.length!==1?'s':''}`
                : 'Métodos de pago disponibles en el checkout de la tienda online'}
            </p>
          </div>
          {tab === 'clientes' && (
            <button className="btn-add" onClick={() => setModalCliente(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nuevo cliente
            </button>
          )}
        </div>

        {esAdministrador && (
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button
              onClick={() => setTab('clientes')}
              style={{ padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background: tab==='clientes' ? '#388E3C' : '#f0f0f0', color: tab==='clientes' ? 'white' : '#555' }}>
              Clientes ({clientes.length})
            </button>
            <button
              onClick={() => setTab('metodos')}
              style={{ padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background: tab==='metodos' ? '#388E3C' : '#f0f0f0', color: tab==='metodos' ? 'white' : '#555' }}>
              💳 Métodos de pago
            </button>
          </div>
        )}

        {tab === 'metodos' && esAdministrador ? (
          <MetodosPagoTab showOk={showOk}/>
        ) : (
        <>
        <div className="insumos-toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nombre, correo o teléfono..." value={query} onChange={e => setQuery(e.target.value)} />
              {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
            </div>
          </div>
          <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{shown.length} cliente{shown.length!==1?'s':''}</span>
        </div>

        <div className="insumos-card">
          {shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3>{query ? 'Sin resultados' : 'Aún no hay clientes'}</h3>
              <p>{query ? 'Intenta otro término.' : 'Los clientes aparecen aquí cuando se registran en la landing page, o puedes registrarlos tú mismo con el botón "Nuevo cliente".'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Teléfono</th><th>Dirección</th><th>Estado</th><th>Registro</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(58,158,66,0.15)',color:'var(--color-green)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,flexShrink:0}}>
                            {c.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="td-nombre">{c.nombre}</div>
                            <div style={{fontSize:12,color:'var(--text-muted)'}}>{c.correo}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{color:'var(--text-muted)',fontSize:13}}>{c.telefono||'—'}</td>
                      <td style={{color:'var(--text-muted)',fontSize:13,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.direccion||'—'}</td>
                      <td>
                        {hasPermiso('clientes', 'editar') ? (
                          <button
                            className={`toggle-btn ${c.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                            onClick={() => toggleEstado(c.id)}
                            title={c.estado === 'Activo' ? 'Activo' : 'Inactivo'}
                          >
                            <span className="toggle-thumb"/>
                          </button>
                        ) : (
                          <span className={`toggle-btn ${c.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`} style={{cursor:'default',opacity:0.6}}><span className="toggle-thumb"/></span>
                        )}
                      </td>
                      <td style={{color:'var(--text-muted)',fontSize:13}}>{fmt(c.fechaRegistro)}</td>
                      <td>
                        <div className="actions-group">
                          {hasPermiso('clientes', 'ver') && (
                            <Tooltip label="Ver">
                              <button className="btn-ver" onClick={() => navigate(`/admin/clientes/ver/${c.id}`)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('clientes', 'editar') && (
                            <Tooltip label="Editar">
                              <button className="btn-editar" onClick={() => setEditTarget(c)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </Tooltip>
                          )}
                          {hasPermiso('clientes', 'eliminar') && (
                            <AnularButton onClick={() => { setDeleteError(''); setDeleteTarget(c); }}/>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>¿Anular este cliente?</h3>
              <p>Esta acción es <strong>permanente</strong>.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              {deleteError && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'8px 12px',borderRadius:8,marginBottom:16,fontSize:13}}>⚠ {deleteError}</div>}
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, anular</button>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </Layout>
  );
};

export default ClientesPage;