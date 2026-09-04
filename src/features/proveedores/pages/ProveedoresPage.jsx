import React, { useState, useRef, useEffect } from 'react';
import useProveedores from '../hooks/useProveedores';
import proveedoresService from '../services/proveedoresService';
import insumosService from '../../insumos/services/insumosService';
import comprasService from '../../compras/services/comprasService';
import { filtrarBusqueda } from '../../../shared/utils/busqueda';
import ProveedorForm from '../components/ProveedorForm';
import './ProveedoresPage.css';
import Layout from '../../../shared/components/Layout';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
// Autorización por permisos: ProveedoresPage era la ÚNICA página del panel
// que no revisaba hasPermiso — mostraba "Agregar", "Editar" y "Eliminar" a
// cualquier rol que tuviera acceso al módulo, aunque solo se le hubiera
// marcado "Ver" en el formulario de Roles. Las otras 17 páginas ya lo
// hacían; esta se quedó atrás.
import { useAuth } from '../../../shared/contexts/AuthContext';

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
};

// Búsqueda por nombre, NIT, correo o ciudad — antes el placeholder decía
// "ciudad" pero el filtro real solo comparaba nombre/NIT/correo, así que
// buscar por ciudad nunca devolvía resultados. Centralizado acá para que
// los 4 lugares que re-filtran (buscar, eliminar, activar/desactivar,
// guardar) queden siempre en sincro.
const filtrarProveedores = (lista, term) => {
  const q = term.toLowerCase();
  return lista.filter(p =>
    p.nombre?.toLowerCase().includes(q) ||
    p.nit?.toLowerCase().includes(q) ||
    p.numeroDocumento?.toLowerCase().includes(q) ||
    p.correo?.toLowerCase().includes(q) ||
    p.ciudad?.toLowerCase().includes(q) ||
    p.telefono?.toLowerCase().includes(q)
  );
};

// ── Modal Ver Proveedor ───────────────────────────────────────────────────────
function ModalVerProveedor({ proveedor, onClose, onEditar, onEliminar, onToggle, tieneCompras, puedeEditar = true, puedeEliminar = true }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
        background:'var(--bg-surface)', borderRadius:18, width:'100%', maxWidth:660,
        maxHeight:'88vh', overflowY:'auto', overflowX:'hidden',
        boxShadow:'0 24px 64px rgba(0,0,0,.5)', animation:'popIn .22s ease',
      }}>
        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ width:44,height:44,borderRadius:12,flexShrink:0,background:'linear-gradient(135deg,#4CAF50,#388E3C)',display:'flex',alignItems:'center',justifyContent:'center',color:'white' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:800,fontSize:16,color:'var(--text-primary)' }}>{proveedor.nombre}</div>
              <div style={{ display:'flex',gap:6,marginTop:4,flexWrap:'wrap' }}>
                <span style={{ padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,
                  background:proveedor.estado==='Activo'?'rgba(46,125,50,.2)':'rgba(255,255,255,.06)',
                  color:proveedor.estado==='Activo'?'#81C784':'#a09880',
                  border:`1px solid ${proveedor.estado==='Activo'?'rgba(76,175,80,.25)':'var(--border)'}` }}>
                  {proveedor.estado==='Activo'?'Activo':'Inactivo'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover,rgba(128,128,128,.12))',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
            {/* Contacto */}
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Información de Contacto</div>
              {[
                [proveedor.tipoPersona === 'Natural' ? proveedor.tipoDocumento : 'NIT', proveedor.tipoPersona === 'Natural' ? proveedor.numeroDocumento : proveedor.nit],
                ...(proveedor.tipoPersona !== 'Natural' && proveedor.personaContacto ? [['Persona de contacto', proveedor.personaContacto]] : []),
                ['Teléfono',  proveedor.telefono],
                ['Correo',    proveedor.correo],
                ['Estado',
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <button className={`toggle-btn ${proveedor.estado==='Activo'?'toggle-on':'toggle-off'}`} onClick={onToggle} style={{ cursor:'pointer' }}>
                      <span className="toggle-thumb"/>
                    </button>
                    <span style={{ fontSize:13,fontWeight:600,color:proveedor.estado==='Activo'?'#81C784':'#a09880' }}>
                      {proveedor.estado==='Activo'?'Activo':'Inactivo'}
                    </span>
                  </div>
                ],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
            {/* Ubicación */}
            <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'16px 18px',border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:12 }}>Ubicación</div>
              {[
                ['Ciudad',    proveedor.ciudad || '—'],
                ['Dirección', proveedor.direccion || '—'],
                ['ID',        <span style={{ fontFamily:'monospace',fontSize:12,color:'#81C784',background:'rgba(76,175,80,.12)',padding:'2px 8px',borderRadius:6 }}>{proveedor.id}</span>],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13 }}>
                  <span style={{ color:'var(--text-secondary)',fontWeight:600 }}>{label}</span>
                  <span style={{ color:'var(--text-primary)',fontWeight:500 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Observaciones */}
          <div style={{ background:'var(--bg-surface-3)',borderRadius:12,padding:'14px 18px',border:'1px solid var(--border)',marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--text-secondary)',letterSpacing:'0.6px',marginBottom:6 }}>Observaciones</div>
            <p style={{ fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,margin:0,wordBreak:'break-word',overflowWrap:'anywhere' }}>{proveedor.observaciones || 'Sin observaciones registradas.'}</p>
            <div style={{ marginTop:10,fontSize:12,color:'var(--text-secondary)' }}>Registrado: {formatDate(proveedor.fechaCreacion)}</div>
          </div>

          {/* Acciones */}
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <button className="btn-cancel" onClick={onClose}>Cerrar</button>
            {puedeEliminar && (
            <AnularButton onClick={onEliminar} size={14} className=""
              label={tieneCompras ? 'Tiene compras registradas — solo puede desactivarse' : 'Eliminar'}
              style={{ padding:10,background: tieneCompras ? 'var(--bg-surface-3)' : 'linear-gradient(135deg,#E53935,#B71C1C)',border:'none',borderRadius:10,color: tieneCompras ? 'var(--text-muted)' : 'white',cursor: tieneCompras ? 'not-allowed' : 'pointer',opacity: tieneCompras ? 0.6 : 1,display:'flex',alignItems:'center',justifyContent:'center' }}/>
            )}
            {puedeEditar && (
            <Tooltip label="Editar proveedor">
              <button className="btn-confirm-primary" onClick={onEditar} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
            </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
// Lista de insumos afectados por una cascada (eliminar o desactivar un
// proveedor), mostrando solo los primeros N y un "+X más" desplegable si
// hay más, para no saturar la alerta de confirmación.
function ListaInsumosAfectados({ insumos, limite = 5 }) {
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? insumos : insumos.slice(0, limite);
  const restantes = insumos.length - limite;
  return (
    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
      {visibles.map(i => <li key={i.id}>{i.nombre}</li>)}
      {!expandido && restantes > 0 && (
        <li style={{ listStyle: 'none', marginLeft: -16, marginTop: 4 }}>
          <button type="button" onClick={() => setExpandido(true)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }}>
            +{restantes} más — ver todos
          </button>
        </li>
      )}
    </ul>
  );
}

const ProveedoresPage = () => {
  const { proveedores, remove, toggleEstado, refresh } = useProveedores();
  // Permisos reales del rol logueado — misma convención que el resto del
  // panel ('crear_proveedores', 'editar_proveedores', 'eliminar_proveedores',
  // ver rolesService.MODULOS_PERMISOS). El Administrador pasa siempre, por
  // el atajo de AuthContext.hasPermiso.
  const { hasPermiso }  = useAuth();
  const puedeCrear      = hasPermiso('proveedores', 'crear');
  const puedeEditar     = hasPermiso('proveedores', 'editar');
  const puedeEliminar   = hasPermiso('proveedores', 'eliminar');
  const [query, setQuery]             = useState('');
  const [filtered, setFiltered]       = useState(null);
  const [tabFiltro, setTabFiltro]     = useState('todos');
  // 1 — paginación, mismo estilo que Insumos: 7 por página, respeta
  // búsqueda/pestaña porque se calcula sobre `displayed`.
  const [page, setPage]               = useState(1);
  const PER_PAGE = 7;
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteInfo, setDeleteInfo]   = useState(null);
  // Proveedor que el usuario intentó eliminar pero tiene compras
  // asociadas — mismo patrón que "deleteBlockedTarget" en InsumosPage: en
  // vez de abrir el modal normal de eliminación, se muestra una alerta
  // centrada explicando por qué no puede eliminarse.
  const [deleteBlockedTarget, setDeleteBlockedTarget] = useState(null);
  const [successMsg, setSuccessMsg]   = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [modal, setModal]             = useState(null); // 'nuevo' | proveedor-obj (editar) | { ver: proveedor-obj }
  const [serverError, setServerError] = useState('');
  const searchRef = useRef();

  // Cargados una sola vez para (a) deshabilitar "Anular" en proveedores con
  // compras y (b) mostrar la vista previa de insumos asociados antes de
  // eliminar — reutiliza los servicios ya existentes de Insumos y Compras,
  // sin duplicar lógica de fetch.
  const [insumosTodos, setInsumosTodos] = useState([]);
  const [comprasTodas, setComprasTodas] = useState([]);
  useEffect(() => {
    insumosService.getAll().then(d => setInsumosTodos(Array.isArray(d) ? d : [])).catch(() => {});
    Promise.all([comprasService.getActivas(), comprasService.getHistorial()])
      .then(([a, h]) => setComprasTodas([...(a || []), ...(h || [])]))
      .catch(() => setComprasTodas([]));
  }, []);
  const proveedoresConCompras = new Set(comprasTodas.map(c => String(c.proveedorId)));

  const base = filtered !== null ? filtered : proveedores;
  const searched = query.trim() !== '';
  const displayedBase = tabFiltro === 'activos'
    ? base.filter(p => p.estado === 'Activo')
    : tabFiltro === 'inactivos'
      ? base.filter(p => p.estado !== 'Activo')
      : base;
  const displayed = [...displayedBase].sort((a, b) => Number(b.id) - Number(a.id));

  // 1 — paginación calculada sobre `displayed` (ya filtrado/buscado).
  const totalPages = Math.ceil(displayed.length / PER_PAGE);
  const paginated  = displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages)); }, [totalPages, page]);

  const totalActivos   = proveedores.filter(p => p.estado === 'Activo').length;
  const totalInactivos = proveedores.filter(p => p.estado !== 'Activo').length;

  const showSuccess = (msg) => { setSuccessMsg(msg); setErrorMsg('');  setTimeout(() => setSuccessMsg(''), 3500); };
  const showError   = (msg) => { setErrorMsg(msg);  setSuccessMsg(''); setTimeout(() => setErrorMsg(''), 4500); };

  // Búsqueda en tiempo real
  const handleSearch = (e) => {
    const val = filtrarBusqueda(e.target.value);
    setQuery(val);
    if (val.trim() === '') { setFiltered(null); }
    else { setFiltered(filtrarProveedores(proveedores, val)); }
    setPage(1);
  };
  const clearSearch = () => { setQuery(''); setFiltered(null); setPage(1); searchRef.current?.focus(); };

  // Antes esto estaba fijo en { insumos: [], tieneCompras: false } — el
  // modal de confirmación siempre mostraba el camino "seguro para eliminar"
  // sin importar el proveedor. Ahora se calcula con los datos reales ya
  // cargados (insumosTodos/comprasTodas) antes de mostrar el modal.
  const openDeleteTarget = (p) => {
    if (proveedoresConCompras.has(String(p.id))) {
      setDeleteBlockedTarget(p);
      return;
    }
    const insumos = insumosTodos.filter(i => String(i.proveedorId) === String(p.id));
    setDeleteInfo({ insumos, tieneCompras: false });
    setDeleteTarget(p);
  };

  const [deactivateConfirm, setDeactivateConfirm] = useState(null); // { origen, proveedorId, proveedorNombre, insumos, data }

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await remove(deleteTarget.id);
      setFiltered(query.trim() ? filtrarProveedores(proveedores, query) : null);
      let msg = `Proveedor "${deleteTarget.nombre}" eliminado correctamente`;
      if (result?.insumosEliminados > 0) {
        msg += `. También se eliminaron ${result.insumosEliminados} insumo(s): ${result.nombresInsumos.join(', ')}`;
      }
      showSuccess(msg);
      setDeleteTarget(null); setDeleteInfo(null);
      // Cerrar modal ver si estaba abierto
      if (modal?.ver) setModal(null);
    } catch (err) {
      showError(err.message || 'No se pudo eliminar el proveedor.');
      setDeleteTarget(null); setDeleteInfo(null);
    }
  };

  const insumosActivosDe = (proveedorId) => insumosTodos.filter(i => String(i.proveedorId) === String(proveedorId) && i.estado === 'Activo');

  // El interruptor rápido ya no desactiva de inmediato: si el proveedor
  // tiene insumos activos asociados, primero se avisa cuáles se van a
  // desactivar junto con él.
  const handleToggle = async (id) => {
    const proveedor = proveedores.find(p => String(p.id) === String(id));
    if (proveedor?.estado === 'Activo') {
      const afectados = insumosActivosDe(id);
      if (afectados.length > 0) {
        setDeactivateConfirm({ origen: 'toggle', proveedorId: id, proveedorNombre: proveedor.nombre, insumos: afectados });
        return;
      }
    }
    await ejecutarToggle(id);
  };

  const ejecutarToggle = async (id) => {
    const proveedor = proveedores.find(p => String(p.id) === String(id));
    const result = await toggleEstado(id);
    if (query.trim()) setFiltered(filtrarProveedores(proveedores, query));
    // Actualizar modal ver si está abierto con este proveedor — se usa el
    // estado real que devolvió el servidor, no una suposición local, para
    // que nunca quede desincronizado del listado.
    if (modal?.ver?.id === id && result?.estado) {
      setModal(prev => ({ ver: { ...prev.ver, estado: result.estado } }));
    }
    if (result?.insumosDesactivados > 0) {
      showSuccess(`Proveedor "${proveedor?.nombre}" desactivado. También se desactivaron ${result.insumosDesactivados} insumo(s): ${result.nombresInsumosDesactivados.join(', ')}`);
    }
  };

  const confirmarDesactivacion = async () => {
    const { origen, proveedorId, data } = deactivateConfirm;
    setDeactivateConfirm(null);
    if (origen === 'toggle') {
      await ejecutarToggle(proveedorId);
    } else {
      await guardarConDesactivacion(proveedorId, data);
    }
  };

  const openVer     = (p) => setModal({ ver: p });
  const openNuevo   = () => { setServerError(''); setModal('nuevo'); };
  const openEditar  = (p) => { setServerError(''); setModal(p); };
  const closeModal  = () => { setModal(null); setServerError(''); };

  // Antes recibía solo (data) — ProveedorForm.handleSubmit llama a
  // onSubmit(form, onDuplicateError) para resaltar el campo exacto que
  // vino duplicado (nombre/nit/telefono/correo), pero como este handler
  // nunca aceptaba ni invocaba ese segundo parámetro, el resaltado de
  // campo duplicado quedaba muerto en el flujo real (solo funcionaba en
  // la página de Agregar Proveedor, ya no usada).
  const handleFormSubmit = async (data, onDuplicateError) => {
    setServerError('');
    const esEdicion = modal && modal !== 'nuevo' && !modal.ver;
    const idActual = esEdicion ? modal.id : null;

    // Verificación local ANTES de tocar el backend: revisa contra la
    // lista de proveedores ya cargada en pantalla. No sustituye la
    // validación real del backend (dos registros simultáneos podrían
    // saltarse esto), pero cubre el caso normal sin esperar una vuelta
    // al servidor, y funciona incluso si el backend todavía no valida
    // esto por su cuenta.
    const dupErrsLocal = {};
    if (data.nombre) {
      const yaExisteNombre = proveedores.some(p =>
        String(p.id) !== String(idActual) &&
        p.nombre?.trim().toLowerCase() === data.nombre.trim().toLowerCase()
      );
      if (yaExisteNombre) dupErrsLocal.nombre = true;
    }
    if (data.correo) {
      const yaExisteCorreo = proveedores.some(p =>
        String(p.id) !== String(idActual) &&
        p.correo?.trim().toLowerCase() === data.correo.trim().toLowerCase()
      );
      if (yaExisteCorreo) dupErrsLocal.correo = true;
    }
    if (data.telefono) {
      const yaExisteTelefono = proveedores.some(p =>
        String(p.id) !== String(idActual) &&
        p.telefono === data.telefono
      );
      if (yaExisteTelefono) dupErrsLocal.telefono = true;
    }
    // El valor del documento de tipo "NIT" es un mismo espacio de
    // identificación sin importar si viene de un proveedor Jurídico
    // (campo nit) o de uno Natural que eligió "NIT" como tipo de
    // documento (campo numeroDocumento) — un mismo NIT no puede repetirse
    // cruzando de un lado al otro.
    const nitDelRegistro = data.tipoPersona === 'Natural'
      ? (data.tipoDocumento === 'NIT' ? data.numeroDocumento : null)
      : data.nit;
    const nitDe = (p) => p.tipoPersona === 'Natural'
      ? (p.tipoDocumento === 'NIT' ? p.numeroDocumento : null)
      : p.nit;

    if (nitDelRegistro) {
      const yaExisteNit = proveedores.some(p =>
        String(p.id) !== String(idActual) && nitDe(p) === nitDelRegistro
      );
      if (yaExisteNit) dupErrsLocal[data.tipoPersona === 'Natural' ? 'numeroDocumento' : 'nit'] = true;
    }
    // El resto de tipos de documento (CC, TI, CE, Pasaporte) sí quedan
    // separados por tipo — solo NIT comparte espacio entre Natural y
    // Jurídica.
    if (data.tipoPersona === 'Natural' && data.tipoDocumento !== 'NIT' && data.numeroDocumento) {
      const yaExiste = proveedores.some(p =>
        String(p.id) !== String(idActual) &&
        p.tipoPersona === 'Natural' &&
        p.tipoDocumento === data.tipoDocumento &&
        p.numeroDocumento === data.numeroDocumento
      );
      if (yaExiste) dupErrsLocal.numeroDocumento = true;
    }
    if (Object.keys(dupErrsLocal).length > 0) {
      if (onDuplicateError) onDuplicateError(Object.keys(dupErrsLocal));
      const mensajes = {
        nombre: 'Ya existe un proveedor con este nombre/razón social.',
        correo: 'Ya existe un proveedor con este correo electrónico.',
        telefono: 'Ya existe un proveedor con este teléfono.',
        nit: 'Ya existe un proveedor con este NIT.',
        numeroDocumento: 'Ya existe un proveedor con este número de documento.',
      };
      setServerError(Object.keys(dupErrsLocal).map(f => mensajes[f]).join(' '));
      return;
    }

    // Punto de desactivación en cascada: si se está editando y el estado
    // pasa de Activo a Inactivo, y el proveedor tiene insumos activos
    // asociados, se pregunta ANTES de guardar — igual que ya se hace con
    // el interruptor rápido.
    if (esEdicion && modal.estado === 'Activo' && data.estado === 'Inactivo') {
      const afectados = insumosActivosDe(modal.id);
      if (afectados.length > 0) {
        setDeactivateConfirm({ origen: 'form', proveedorId: modal.id, proveedorNombre: modal.nombre, insumos: afectados, data });
        return;
      }
    }

    await guardarConDesactivacion(esEdicion ? modal.id : null, data, esEdicion, onDuplicateError);
  };

  const guardarConDesactivacion = async (id, data, esEdicionForzada, onDuplicateError) => {
    const esEdicion = esEdicionForzada ?? (modal && modal !== 'nuevo' && !modal.ver);
    // api.js lanza (throw) cuando el backend responde con error — sin
    // try/catch esa excepción quedaba sin capturar y el modal no mostraba
    // ningún mensaje (mismo bug ya visto en FichasTecnicasPage/useInsumos).
    try {
      if (!esEdicion) {
        await proveedoresService.create(data);
      } else {
        await proveedoresService.update(id, data);
      }
    } catch (err) {
      if (err.duplicateFields && onDuplicateError) onDuplicateError(err.duplicateFields);
      setServerError(err.message || 'No se pudo guardar el proveedor.');
      return;
    }
    refresh();
    if (query.trim()) setFiltered(filtrarProveedores(proveedores, query));
    closeModal();
    showSuccess(esEdicion ? `Proveedor "${data.nombre}" actualizado correctamente` : 'Proveedor registrado correctamente');
  };

  const esEdicion = modal && modal !== 'nuevo' && !modal?.ver;
  const esVer     = modal?.ver;

  const tabStyle = (key) => ({
    padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer',
    fontWeight:600, fontSize:13,
    background: tabFiltro === key ? '#388E3C' : '#f0f0f0',
    color:       tabFiltro === key ? 'white'   : '#555',
    transition:'all .2s',
  });

  return (
    <Layout>
      <div className="insumos-root">
        {successMsg && (
          <div className="toast toast-success">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="toast toast-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Modal Ver */}
        {esVer && (
          <ModalVerProveedor
            proveedor={esVer}
            onClose={closeModal}
            onEditar={() => openEditar(esVer)}
            onEliminar={() => openDeleteTarget(esVer)}
            onToggle={() => handleToggle(esVer.id)}
            tieneCompras={proveedoresConCompras.has(String(esVer.id))}
            puedeEditar={puedeEditar}
            puedeEliminar={puedeEliminar}
          />
        )}

        {/* Modal Agregar / Editar */}
        {(modal === 'nuevo' || esEdicion) && (
          <div className="modal-overlay" onClick={closeModal}>
            <div onClick={e => e.stopPropagation()} className="modal-scroll-suave" style={{
              background:'var(--bg-surface)',borderRadius:16,width:'90%',maxWidth:680,
              maxHeight:'90vh',overflowY:'auto',overflowX:'hidden',
              boxShadow:'0 24px 64px rgba(0,0,0,0.22)',animation:'slideUp .2s ease',
            }}>
              <div style={{ padding:'28px 32px' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
                <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                  <div style={{ width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'white',
                    background: esEdicion ? 'linear-gradient(135deg,#6D4C41,#4E342E)' : 'linear-gradient(135deg,#4CAF50,#388E3C)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {esEdicion
                        ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
                        : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
                      }
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin:0,fontSize:18,fontWeight:800,color:'var(--text-primary)' }}>{esEdicion?'Editar Proveedor':'Nuevo Proveedor'}</h3>
                    <p style={{ margin:0,fontSize:12,color:'var(--text-secondary)' }}>{esEdicion?`Modificando: ${modal.nombre}`:'Completa los campos para registrar un proveedor'}</p>
                  </div>
                </div>
                <button onClick={closeModal} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',fontSize:22,lineHeight:1,padding:4 }}>×</button>
              </div>
              {serverError && (
                <div style={{ background:'rgba(183,28,28,.18)',color:'#EF9A9A',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13,fontWeight:600,border:'1px solid rgba(239,83,80,.3)' }}>
                  ⚠ {serverError}
                </div>
              )}
              <ProveedorForm
                isEditing={esEdicion}
                initialData={esEdicion ? modal : null}
                onSubmit={handleFormSubmit}
                onCancel={closeModal}
              />
              </div>
            </div>
          </div>
        )}

        {/* Modal Anular */}
        {deleteTarget && deleteInfo && (
          <div className="modal-overlay" onClick={() => { setDeleteTarget(null); setDeleteInfo(null); }}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3>¿Eliminar proveedor?</h3>
              {deleteInfo.insumos.length > 0 && (
                <div style={{ background:'rgba(230,115,0,0.10)',border:'1px solid rgba(230,115,0,0.28)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#E65100' }}>
                  ⚠ También se eliminarán los siguientes insumos asociados:
                  <ListaInsumosAfectados insumos={deleteInfo.insumos} />
                </div>
              )}
              <p>Esta acción es <strong>permanente</strong> y no se puede deshacer.</p>
              <div className="modal-detail">"{deleteTarget.nombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => { setDeleteTarget(null); setDeleteInfo(null); }}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleDelete}>Sí, eliminar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: no se puede eliminar (proveedor con compras asociadas) —
            mismo patrón/copy que el equivalente en InsumosPage. Reemplaza
            por completo la alerta lateral roja que existía antes. */}
        {deleteBlockedTarget && (
          <div className="modal-overlay" onClick={() => setDeleteBlockedTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <h3>¿Eliminar proveedor?</h3>
              <p style={{ color:'#B71C1C',fontWeight:600,display:'flex',alignItems:'flex-start',gap:8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink:0,marginTop:2 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>No se puede eliminar "{deleteBlockedTarget.nombre}": tiene compras registradas, desactívalo en su lugar.</span>
              </p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeleteBlockedTarget(null)}>Entendido</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal confirmar desactivación */}
        {deactivateConfirm && (
          <div className="modal-overlay" onClick={() => setDeactivateConfirm(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-warn">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3>¿Desactivar proveedor?</h3>
              <div style={{ background:'rgba(230,115,0,0.10)',border:'1px solid rgba(230,115,0,0.28)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#E65100' }}>
                ⚠ También se desactivarán los siguientes insumos asociados:
                <ListaInsumosAfectados insumos={deactivateConfirm.insumos} />
              </div>
              <div className="modal-detail">"{deactivateConfirm.proveedorNombre}"</div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setDeactivateConfirm(null)}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={confirmarDesactivacion}>Sí, desactivar</button>
              </div>
            </div>
          </div>
        )}

        <div className="page-header">
          <h1 className="page-title">Gestión de Proveedores</h1>
          <p className="page-subtitle">Administra los proveedores del sistema</p>
        </div>

        {/* Pestañas */}
        <div style={{ display:'flex',gap:8,marginBottom:16 }}>
          <button style={tabStyle('todos')}     onClick={() => { setTabFiltro('todos'); setPage(1); }}>Todos ({proveedores.length})</button>
          <button style={tabStyle('activos')}   onClick={() => { setTabFiltro('activos'); setPage(1); }}>Activos ({totalActivos})</button>
          <button style={tabStyle('inactivos')} onClick={() => { setTabFiltro('inactivos'); setPage(1); }}>Inactivos ({totalInactivos})</button>
        </div>

        {/* Toolbar */}
        <div className="insumos-toolbar">
          <div className="search-wrap" style={{ flex:1,maxWidth:480 }}>
            <span className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              ref={searchRef} type="text"
              placeholder="Buscar por nombre, documento, teléfono, correo o ciudad..." maxLength={70}
              value={query} onChange={handleSearch}
              className="search-input"
            />
            {query && (
              <button className="search-clear" onClick={clearSearch}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
          {puedeCrear && (
          <button className="btn-add" onClick={openNuevo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Agregar proveedor
          </button>
          )}
        </div>

        {/* Tabla */}
        <div className="insumos-card">
          {displayed.length === 0 ? (
            <div className="empty-state">
              {searched ? (
                <>
                  <div className="empty-icon empty-icon-search">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                    </svg>
                  </div>
                  <h3>No se encontraron coincidencias</h3>
                  <p>No hay proveedores que coincidan con "<strong>{query}</strong>"</p>
                  <button className="btn-outline-green" onClick={clearSearch}>Ver todos los proveedores</button>
                </>
              ) : (
                <>
                  <div className="empty-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <h3>No hay proveedores{tabFiltro !== 'todos' ? ` ${tabFiltro}` : ''} registrados</h3>
                  <p>
                    {tabFiltro !== 'todos'
                      ? 'Cambia el filtro para ver otros proveedores'
                      : 'Comienza agregando tu primer proveedor al sistema'}
                  </p>
                  {tabFiltro === 'todos' && puedeCrear && (
                    <button className="btn-add-first" onClick={openNuevo}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Agregar primer proveedor
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              {searched && (
                <div className="search-results-info">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  {displayed.length} resultado{displayed.length !== 1 ? 's' : ''} para "{query}"
                </div>
              )}
              <table className="insumos-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Documento</th><th>Correo</th>
                    <th>Teléfono</th><th>Ciudad</th>
                    <th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(p => (
                    <tr key={p.id}>
                      <td className="td-nombre">{p.nombre}</td>
                      <td>{p.tipoPersona === 'Natural' ? `${p.tipoDocumento}: ${p.numeroDocumento}` : p.nit}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.correo || '—'}</td>
                      <td>{p.telefono}</td>
                      <td>{p.ciudad}</td>
                      <td>
                        <button className={`toggle-btn ${p.estado === 'Activo' ? 'toggle-on' : 'toggle-off'}`}
                          onClick={() => handleToggle(p.id)}>
                          <span className="toggle-thumb"/>
                        </button>
                      </td>
                      <td>
                        <div className="actions-group">
                          <Tooltip label="Ver detalle">
                            <button className="btn-accion btn-accion-ver" onClick={() => openVer(p)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          </Tooltip>
                          {puedeEditar && (
                          <Tooltip label="Editar">
                            <button className="btn-accion btn-accion-editar" onClick={() => openEditar(p)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </Tooltip>
                          )}
                          {puedeEliminar && (
                          <AnularButton onClick={() => openDeleteTarget(p)} size={14}
                            className="btn-accion btn-accion-eliminar"
                            label={proveedoresConCompras.has(String(p.id)) ? 'Tiene compras registradas — solo puede desactivarse' : 'Eliminar'}
                            style={proveedoresConCompras.has(String(p.id)) ? { opacity:0.45, cursor:'not-allowed' } : undefined}/>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 1 — paginación: 7 proveedores por página, respeta pestaña y
              búsqueda activas (totalPages/paginated ya salen de `displayed`). */}
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderTop:'1px solid #f0f0f0', marginTop:4 }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Mostrando {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, displayed.length)} de {displayed.length}</span>
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
      </div>
    </Layout>
  );
};

export default ProveedoresPage;