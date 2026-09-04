import React, { useState, useEffect } from 'react';
import Layout from '../../../shared/components/Layout';
import pedidosService from '../services/pedidosService';
import empleadosService from '../../empleados/services/empleadosService';
import clientesService from '../../clientes/services/clientesService';
import productosService from '../../productos/services/productosService';
import adicionesService from '../../adiciones/services/adicionesService';
import ventasService from '../../ventas/services/ventasService';
import notificacionesService from '../../notificaciones/services/notificacionesService';
import localesService from '../../../shared/services/localesService';
import { ESTADO_CONFIG } from '../data/datos';
import {
  filtrarEstadosPedidoDisponibles, esEstadoPedidoTerminal,
  esRetrocesoEstadoPedido, mensajeErrorEstadoPedido, MENSAJE_NO_RETROCEDER,
  etiquetaEstadoPedido, normalizarEstadoPedido, configEstadoPedido,
} from '../../../shared/utils/pedidoEstados';
import { useAuth } from '../../../shared/contexts/AuthContext';
import ModalDetallePedido from '../components/ModalDetallePedido';
import PagosPendientesPanel from '../components/PagosPendientesPanel';
import PedidoBuilder from '../components/PedidoBuilder';
import '../components/PedidoBuilder.css';

// Secuencia de estados del pedido en la vista de Admin — la misma para
// domicilio y para recoger en local (punto 9):
//   pendiente_verificacion → pendiente → en_proceso → en_camino → entregado
// Se quitó 'listo'. 'en_camino' se muestra como "En camino" (domicilio) o
// "Listo para recoger" (local) — lo resuelve etiquetaEstadoPedido().
// 'cancelado'/'anulado' quedan fuera (salidas aparte).
const SECUENCIA_PEDIDO_ADMIN = ['pendiente_verificacion', 'pendiente', 'en_proceso', 'en_camino', 'entregado'];
import LocalFiltro from '../../../shared/components/LocalFiltro';
import Tooltip from '../../../shared/components/Tooltip';
import AnularButton from '../../../shared/components/AnularButton';
import './PedidosPage.css';

const METODOS_PAGO_LABEL = { nequi: 'Nequi', transferencia: 'Llave Bancolombia', efectivo: 'Efectivo en caja' };

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const POR_PAGINA = 8;

/* ── MODAL NUEVO / EDITAR PEDIDO ── */
function ModalPedido({ pedido, onClose, onSave }) {
  const isEdit = !!pedido;
  const [empleados,     setEmpleados]     = useState([]);
  const [clientesLista, setClientesLista] = useState([]);
  const [productosMenu, setProductosMenu] = useState([]);
  const [adiciones,     setAdiciones]     = useState([]);
  // 3 — locales físicos de recogida (GET /locales), para el selector que
  // aparece cuando el tipo de entrega es "En el Local" — distinto de
  // `sede` (Local 1/Local 2, a quién atiende el pedido).
  const [locales, setLocales] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [emps, cls, prods, adics, locs] = await Promise.allSettled([
        empleadosService.getAll(),
        clientesService.getAll(),
        productosService.getActivos ? productosService.getActivos() : productosService.getAll(),
        adicionesService.getAll ? adicionesService.getAll() : Promise.resolve([]),
        localesService.getActivos(),
      ]);
      if (emps.status  === 'fulfilled') setEmpleados(emps.value   || []);
      if (cls.status   === 'fulfilled') setClientesLista((cls.value || []).filter(c => c.estado !== false));
      if (prods.status === 'fulfilled') setProductosMenu(prods.value || []);
      if (adics.status === 'fulfilled') setAdiciones(adics.value  || []);
      if (locs.status  === 'fulfilled') setLocales((Array.isArray(locs.value) ? locs.value : []).filter(l => l.estado !== false && l.estado !== 'Inactivo'));
    };
    load();
  }, []);

  const atienden = empleados.filter(e => e.estado === 'Activo' && e.cargo !== 'Domiciliario');
  const domis    = empleados.filter(e => e.estado === 'Activo' && e.cargo === 'Domiciliario');
  const cats     = ['Todos', ...new Set(productosMenu.map(p => p.categoria))];

  // Al editar, partimos de los productos ya guardados en el pedido
  // (backend: "items", alias "productos"). Normalizamos precioTotal/
  // cantidad porque pedidos creados desde la landing usan "precioFinal"
  // en vez de "precioTotal".
  const productosIniciales = pedido
    ? (Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []))
        .map(x => ({ ...x, precioTotal: x.precioTotal ?? x.precioFinal ?? x.precio, cantidad: x.cantidad || 1 }))
    : [];

  const [f, setF] = useState({
    cliente:      pedido?.cliente || '',
    tipo:         pedido?.tipo || 'local',
    pago:         pedido?.pago || 'efectivo',
    productos:    productosIniciales,
    barista:      pedido?.barista || '',
    domiciliario: pedido?.domiciliario || '',
    // Local para el que es este pedido. El admin gestiona los dos locales,
    // así que debe elegir a cuál va destinado cada pedido que crea.
    sede:         pedido?.sede || '',
    // 3 — local físico de recogida (tabla `locales`, GET /locales) — solo
    // aplica cuando tipo:'local'. Mismo campo que ya usa la Landing.
    localId:      pedido?.localId ? String(pedido.localId) : '',
    localNombre:  pedido?.localNombre || '',
  });
  const [cat, setCat]            = useState('Todos');
  const [busquedaProd, setBusquedaProd] = useState('');
  const [prodSel, setProdSel]    = useState(null);
  const [adicsSelec, setAdicsSelec] = useState([]);
  const [cantSel, setCantSel]    = useState(1);

  // 4 — las adiciones son universales: aplican a todos los productos por
  // igual, nunca filtradas por categoría ni producto (la tabla "adiciones"
  // ni siquiera tiene columna "categoria" — el filtro anterior comparaba
  // contra un campo que no existe y por eso nunca hacía nada; se deja
  // explícito para que no parezca un filtro real y alguien confíe en él).
  const adicsParaProd = prodSel ? adiciones : [];
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const getCant = id => (f.productos.find(x => x.id === id) || {}).cantidad || 0;

  const seleccionarProd = (prod) => { setProdSel(prod); setAdicsSelec([]); setCantSel(1); };
  const toggleAdic = (a) => setAdicsSelec(prev => prev.find(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]);

  const confirmarAgregar = () => {
    const extraTotal = adicsSelec.reduce((s, a) => s + a.precio, 0);
    const precioTotal = prodSel.precio + extraTotal;
    const item = { ...prodSel, adiciones: adicsSelec, precioTotal, cantidad: cantSel };
    const existe = f.productos.find(x => x.id === prodSel.id);
    set('productos', existe ? f.productos.map(x => x.id === prodSel.id ? item : x) : [...f.productos, item]);
    setProdSel(null); setAdicsSelec([]); setCantSel(1);
  };

  const removeProd = id => set('productos', f.productos.filter(x => x.id !== id));
  const cambiarCant = (id, delta) => {
    const nueva = (getCant(id) || 0) + delta;
    if (nueva <= 0) removeProd(id);
    else set('productos', f.productos.map(x => x.id === id ? { ...x, cantidad: nueva } : x));
  };

  const prods = (() => {
    let list = cat === 'Todos' ? productosMenu : productosMenu.filter(p => p.categoria === cat);
    if (busquedaProd.trim()) list = list.filter(p => p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()));
    return list;
  })();

  const total = f.productos.reduce((s, p) => s + (p.precioTotal || p.precio) * (p.cantidad || 1), 0);

  const crear = () => {
    if (!f.productos.length) { alert('Selecciona al menos un producto'); return; }
    if (!f.barista)          { alert('Selecciona quién atiende el pedido'); return; }
    if (!f.sede)             { alert('Selecciona el local de este pedido'); return; }
    // "Local de recogida" y "Local *" apuntaban al mismo local físico
    // (mismo `locales`/GET /locales) y se pedían dos veces en dos campos
    // distintos — ahora un único selector ("Local *") llena ambos: `sede`
    // (a quién se le asigna el pedido) y localId/localNombre (local de
    // recogida real, mismo campo que ya usa el checkout del cliente).
    if (f.tipo === 'local' && !f.localId) { alert('Selecciona el local donde el cliente recogerá el pedido'); return; }
    if (f.tipo === 'domicilio' && !f.domiciliario) { alert('Selecciona un domiciliario'); return; }
    if (f.tipo === 'domicilio' && (!isEdit || pedido.tipo !== 'domicilio')) {
      const ok = window.confirm('⚠️ El servicio a domicilio solo cubre la comuna 8 y 9 de Medellín.\n\n¿Continuar?');
      if (!ok) return;
    }
    if (isEdit) {
      onSave({ ...f, total, id: pedido.id });
    } else {
      onSave({ ...f, total, hora: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}), estado: 'pendiente' });
    }
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal pd-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-head">
          <div>
            <div className="pd-modal-eyebrow">{isEdit ? 'Editar pedido' : 'Nuevo pedido'}</div>
            <div className="pd-modal-id" style={{ fontSize: 18 }}>{isEdit ? `Pedido #${pedido.id}` : 'Completa los datos'}</div>
          </div>
        </div>

        <div className="pd-form-row">
          <div className="pd-form-group">
            <label>Cliente <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:12}}>(opcional)</span></label>
            <input
              type="text"
              placeholder="Nombre del cliente o dejar vacío"
              value={f.cliente}
              onChange={e => set('cliente', e.target.value)}
              list="clientes-sugeridos"
            />
            <datalist id="clientes-sugeridos">
              {clientesLista.map(c => <option key={c.id} value={c.nombre}>{c.nombre} — {c.correo}</option>)}
            </datalist>
          </div>
          <div className="pd-form-group">
            <label>Método de pago</label>
            <select value={f.pago} onChange={e => set('pago', e.target.value)}>
              {/* Mismos 3 métodos que Landing/Cajero — sin Tarjeta ni Daviplata. */}
              {['efectivo','nequi','transferencia'].map(p => <option key={p} value={p}>{METODOS_PAGO_LABEL[p]}</option>)}
            </select>
          </div>
        </div>

        <div className="pd-form-group">
          <label>Tipo de entrega</label>
          {/* Los domicilios solo aplican a pedidos que el cliente hace por su
              cuenta desde la tienda/app — un pedido creado a mano por el
              admin siempre es para recoger en el local. Se mantiene la
              opción "A Domicilio" únicamente si se está editando un pedido
              que YA es a domicilio (no se le cambia el tipo a un pedido real
              del cliente solo por abrirlo en el admin). */}
          {(isEdit && pedido.tipo === 'domicilio') ? (
            <div className="pd-tipo-selector">
              {[{val:'local',lbl:'En el Local',ic:'🏠'},{val:'domicilio',lbl:'A Domicilio',ic:'🛵'}].map(t => (
                <div key={t.val} className={`pd-tipo-option ${f.tipo===t.val?'pd-tipo-selected':''}`} onClick={() => set('tipo', t.val)}>
                  <span>{t.ic}</span><span>{t.lbl}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="pd-tipo-selector">
                <div className="pd-tipo-option pd-tipo-selected">
                  <span>🏠</span><span>En el Local</span>
                </div>
              </div>
              <p className="pd-hint" style={{marginTop:6}}>
                Los pedidos a domicilio solo se piden desde la tienda del cliente.
              </p>
            </>
          )}
        </div>

        {/* Antes: dos campos pidiendo lo mismo — "Local de recogida"
            (select) y "Local *" (botones), ambos sacados del mismo GET
            /locales. Ahora un único selector llena los dos campos que
            espera el backend: `sede` (a qué local/personal se asigna el
            pedido) y localId/localNombre (local de recogida, mismo campo
            que ya usa el checkout del cliente). */}
        <div className="pd-form-group">
          <label>Local <span className="required">*</span></label>
          {locales.length === 0 ? (
            <p className="pd-hint">No hay locales activos registrados.</p>
          ) : (
            <div className="pd-tipo-selector">
              {locales.map(l => (
                <div key={l.id} className={`pd-tipo-option ${f.sede===l.nombre?'pd-tipo-selected':''}`}
                  onClick={() => setF(p => ({ ...p, sede: l.nombre, localId: String(l.id), localNombre: l.nombre }))}>
                  <span>🏪</span><span>{l.nombre}</span>
                </div>
              ))}
            </div>
          )}
          <p className="pd-hint" style={{marginTop:6}}>
            {f.tipo === 'local'
              ? 'El local donde el cliente recogerá el pedido, y el único cajero/bartender que lo verá.'
              : 'El pedido solo aparecerá para el cajero y el bartender de ese local.'}
          </p>
        </div>

        <div className="pd-personal-section">
          <div className="pd-personal-title">Personal asignado</div>
          <div className="pd-personal-cols">
            <div className="pd-personal-col">
              <label>Atendido por *</label>
              {atienden.length === 0 ? <p className="pd-hint">Sin trabajadores activos</p> : (
                <div className="pd-worker-grid">
                  {atienden.map(e => (
                    <div key={e.id} className={`pd-worker-card ${f.barista===e.nombre?'pd-worker-sel':''}`} onClick={() => set('barista', e.nombre)}>
                      <div className="pd-worker-av">{e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                      <div className="pd-worker-name">{e.nombre.split(' ')[0]}</div>
                      <div className="pd-worker-cargo">{e.cargo}</div>
                      {f.barista===e.nombre && <div className="pd-worker-check">✓</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {f.tipo === 'domicilio' && (
              <div className="pd-personal-col">
                <label>Domiciliario *</label>
                {domis.length === 0 ? (
                  <div className="pd-domi-empty"><span>🛵</span><span>Sin domiciliarios activos.</span></div>
                ) : (
                  <div className="pd-worker-grid">
                    {domis.map(e => (
                      <div key={e.id} className={`pd-worker-card pd-domi-card ${f.domiciliario===e.nombre?'pd-worker-sel':''}`} onClick={() => set('domiciliario', e.nombre)}>
                        <div className="pd-worker-av pd-domi-av">{e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
                        <div className="pd-worker-name">{e.nombre.split(' ')[0]}</div>
                        <div className="pd-worker-cargo">🛵</div>
                        {f.domiciliario===e.nombre && <div className="pd-worker-check">✓</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pd-form-group">
          <label>Productos del menú</label>
          <div className="pd-prod-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="pd-prod-search-input" placeholder="Buscar producto..." value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)}/>
            {busquedaProd && <button className="pd-prod-search-clear" onClick={() => setBusquedaProd('')}>✕</button>}
          </div>
          <div className="pd-cats">
            {cats.map(c => <button key={c} className={`pd-cat-btn ${cat===c?'pd-cat-on':''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="pd-prod-grid-v2">
            {prods.length === 0 ? (
              <div className="pd-prod-grid-v2__empty">Sin productos{busquedaProd ? ` para "${busquedaProd}"` : ''}</div>
            ) : prods.map(p => {
              const cant = getCant(p.id);
              const activo = prodSel?.id === p.id;
              return (
                <div key={p.id} className={`pd-prod-card-v2${cant>0?' pd-prod-card-v2--sel':''}${activo?' pd-prod-card-v2--active':''}`} onClick={() => seleccionarProd(p)}>
                  {cant > 0 && <div className="pd-prod-card-v2__badge">{cant}</div>}
                  <div className="pd-prod-card-v2__body">
                    <div className="pd-prod-card-v2__cat">{p.categoria}</div>
                    <div className="pd-prod-card-v2__name">{p.nombre}</div>
                    <div className="pd-prod-card-v2__price">{fmt(p.precio)}</div>
                  </div>
                  <div className="pd-prod-card-v2__add-btn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </div>
                </div>
              );
            })}
          </div>

          {prodSel && (
            <div className="pd-add-panel">
              <div className="pd-add-panel__head">
                <div>
                  <div className="pd-add-panel__prod-name">{prodSel.nombre}</div>
                  <div className="pd-add-panel__prod-price">Precio base: {fmt(prodSel.precio)}</div>
                </div>
                <button className="pd-add-panel__close" onClick={() => { setProdSel(null); setAdicsSelec([]); setCantSel(1); }}>✕</button>
              </div>
              {adicsParaProd.length > 0 ? (
                <div className="pd-add-panel__section">
                  <div className="pd-add-panel__label">Adiciones disponibles</div>
                  <div className="pd-add-chips">
                    {adicsParaProd.map(a => {
                      const sel = adicsSelec.find(x => x.id === a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAdic(a)} className={`pd-add-chip${sel?' pd-add-chip--sel':''}`}>
                          {a.nombre}<span className="pd-add-chip__price"> +{fmt(a.precio)}</span>
                          {sel && <span className="pd-add-chip__check"> ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="pd-add-panel__empty">No hay adiciones disponibles.</p>}
              <div className="pd-add-panel__footer">
                <div className="pd-add-panel__qty">
                  <span className="pd-add-panel__label">Cantidad</span>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <button className="pd-sel-qty-btn" onClick={() => setCantSel(c => Math.max(1,c-1))}>−</button>
                    <span style={{fontWeight:700,minWidth:20,textAlign:'center',fontSize:14}}>{cantSel}</span>
                    <button className="pd-sel-qty-btn" onClick={() => setCantSel(c => c+1)}>+</button>
                  </div>
                </div>
                <div className="pd-add-panel__total">Total: <strong>{fmt((prodSel.precio + adicsSelec.reduce((s,a)=>s+a.precio,0))*cantSel)}</strong></div>
                <div className="pd-add-panel__actions">
                  <button className="btn-cancel" onClick={() => { setProdSel(null); setAdicsSelec([]); setCantSel(1); }}>Cancelar</button>
                  <button className="btn-confirm-primary" onClick={confirmarAgregar}>Agregar al pedido</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {f.productos.length > 0 && (
          <div className="pd-form-group">
            <label>Seleccionados ({f.productos.length})</label>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {f.productos.map(p => (
                <div key={p.id} className="pd-sel-item">
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13}}>{p.nombre}</div>
                    {p.adiciones?.length > 0 && <div className="pd-sel-item__adics">+ {p.adiciones.map(a=>a.nombre).join(', ')}</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <button onClick={() => cambiarCant(p.id,-1)} className="pd-sel-qty-btn">−</button>
                      <span style={{fontWeight:700,minWidth:18,textAlign:'center',fontSize:13}}>{p.cantidad}</span>
                      <button onClick={() => cambiarCant(p.id,+1)} className="pd-sel-qty-btn">+</button>
                    </div>
                    <span style={{fontWeight:700,color:'#2E7D32',minWidth:64,textAlign:'right',fontSize:13}}>{fmt((p.precioTotal||p.precio)*p.cantidad)}</span>
                    <button onClick={() => removeProd(p.id)} style={{background:'none',border:'none',color:'#E53935',cursor:'pointer',fontSize:18,lineHeight:1,padding:0}}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {f.productos.length > 0 && (
          <div className="pd-resumen">
            <span>{f.productos.length} producto{f.productos.length!==1?'s':''}</span>
            <strong>Total: {fmt(total)}</strong>
          </div>
        )}

        <div className="pd-modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm-primary" onClick={crear}>{isEdit ? '💾 Guardar cambios' : 'Crear pedido'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function PedidosPage() {
  const { user, hasPermiso } = useAuth();
  // Filtro por local (Administración): 'todos' para Administrador/
  // Superadministrador (sede='Ambos'); cualquier otro usuario queda fijo
  // en su propia sede — ver LocalFiltro.
  // 7 — valor "sin filtrar" de localSel: para un cajero/bartender fijo a su
  // propio local (LocalFiltro ni siquiera le deja elegir otro) es su propia
  // sede; para Administrador (sede='Ambos') es 'todos'. "Limpiar filtros"
  // vuelve acá, no siempre a 'todos'.
  const localSelDefault = user?.sede && user.sede !== 'Ambos' ? user.sede : 'todos';
  const [localSel, setLocalSel] = useState(localSelDefault);
  const [pedidos,      setPedidos]  = useState([]);
  const [stats,        setStats]    = useState({ total:0, pendiente:0, porVerificar:0, proceso:0, ventas:0 });
  // Pestaña activa: 'activos' (pedidos en curso) | 'pagos' (comprobantes
  // por verificar). "Pagos pendientes" es una sección de ESTA vista, no un
  // módulo aparte.
  const [vista,        setVista]    = useState('activos');
  const [modal,        setModal]    = useState(false);
  const [editTarget,   setEditTarget] = useState(null);
  const [detalle,      setDetalle]  = useState(null);
  const [deleteTarget, setDel]      = useState(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [buscar,       setBuscar]   = useState('');
  const [pagina,       setPagina]   = useState(1);
  const [success,      setSuccess]  = useState('');
  const refresh = async () => {
    const [p, s] = await Promise.allSettled([pedidosService.getAll(), pedidosService.getStats()]);
    if (p.status === 'fulfilled') setPedidos(p.value || []);
    if (s.status === 'fulfilled') setStats(s.value  || stats);
  };

  useEffect(() => { refresh(); }, []);

  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const [error, setError] = useState('');
  const showErr = msg => { setError(msg); setTimeout(() => setError(''), 5000); };

  const guardar = async f => {
    try {
      if (f.id) {
        await pedidosService.update(f.id, f);
        await refresh();
        setEditTarget(null); setPagina(1); showOk(`Pedido #${f.id} actualizado correctamente`);
      } else {
        await pedidosService.create(f);
        await refresh();
        setModal(false); setPagina(1); showOk('Pedido creado correctamente');
      }
    } catch (err) {
      showErr(err.message || 'No se pudo guardar el pedido. Revisa tu conexión con la API.');
    }
  };

  // Devuelve true/false para que quien llame (aprobarPago, confirmarRechazo,
  // handleAnularPedido, ...) sepa si el cambio realmente ocurrió antes de
  // seguir con sus propias acciones "de éxito" (notificar al cliente,
  // mostrar el toast, cerrar el modal) — si esta función tragara el error
  // sin devolver nada, esos callers seguirían de largo como si el cambio
  // hubiera funcionado.
  const cambiarEstado = async (id, nuevoEstado) => {
    const pedidoActual = pedidos.find(p => p.id === id);
    // Un pedido terminal (entregado/cancelado/anulado) no cambia de estado.
    if (pedidoActual && esEstadoPedidoTerminal(pedidoActual.estado) && nuevoEstado !== pedidoActual.estado) {
      showErr('Este pedido ya está cerrado y no puede cambiar de estado.');
      return false;
    }
    // No se puede retroceder dentro de la secuencia (misma regla que el
    // backend) — se avisa sin llegar a hacer la petición.
    if (pedidoActual && esRetrocesoEstadoPedido(pedidoActual.estado, nuevoEstado, SECUENCIA_PEDIDO_ADMIN)) {
      showErr(MENSAJE_NO_RETROCEDER);
      return false;
    }
    if (pedidoActual && pedidoActual.estado === 'pendiente_verificacion') {
      if (nuevoEstado !== 'en_proceso' && nuevoEstado !== 'cancelado') return false;
    }
    // api.js lanza (throw) cuando el backend rechaza el cambio (ej. "El
    // pedido debe tener el pago confirmado antes de pasar a preparación",
    // o un retroceso de estado). Sin try/catch esa excepción quedaba sin
    // capturar: no se mostraba nada y el clic parecía "no hacer nada".
    let respuesta;
    try {
      respuesta = await pedidosService.cambiarEstado(id, nuevoEstado);
    } catch (err) {
      showErr(mensajeErrorEstadoPedido(err, 'No se pudo cambiar el estado del pedido.'));
      return false;
    }
    // Al marcar el pedido "en camino / listo para recoger" (antes 'listo')
    // se crea automáticamente la venta si aún no existe, para que el cajero
    // pueda cobrarla al entregar.
    if (normalizarEstadoPedido(nuevoEstado) === 'en_camino') {
      try {
        const ventas = await ventasService.getAll();
        const pedido = pedidos.find(p => p.id === id);
        const ventasExistentes = (ventas || []).map(v => v.id_pedido);
        if (pedido && !ventasExistentes.includes(pedido.id)) {
          await ventasService.crearDesde(id);
        }
      } catch(e) { console.error('Error auto-creando venta', e); }
    }
    // Al entregar, el pedido desaparece de esta lista (ver el filtro de
    // `activos`). Sin este aviso la fila simplemente se esfuma y parece que
    // se borró algo.
    if (normalizarEstadoPedido(nuevoEstado) === 'entregado') {
      // `avisoInventario` llega cuando la venta se registró pero algún insumo
      // de la receta no existe en el local y no se pudo descontar. Antes esto
      // era un 409 que impedía entregar el pedido; ahora es una advertencia,
      // porque el producto ya se preparó y bloquear el registro no devuelve
      // el insumo al almacén — solo esconde la venta.
      if (respuesta?.avisoInventario) showErr(respuesta.avisoInventario);
      else showOk(`Pedido #${id} entregado. Pasó al módulo de Ventas y sale de esta lista.`);
    }
    await refresh();
    return true;
  };

  const cerrarAnular = () => { setDel(null); setAnularMotivo(''); };

  // "Anular pedido" — cancelación permanente: estado 'cancelado' + motivo +
  // notificación al cliente. No es un estado nuevo. (La verificación de
  // comprobantes de pago se gestiona en su propia página: PagosPendientesPage.)
  const handleAnularPedido = async () => {
    const ok = await cambiarEstado(deleteTarget.id, 'cancelado');
    if (!ok) return;
    notificacionesService.create({
      clienteId: deleteTarget.cliente_id,
      pedidoId: deleteTarget.id,
      tipo: 'pedido_anulado',
      mensaje: `❌ Tu pedido fue anulado. Motivo: ${anularMotivo.trim() || 'No especificado'}.`,
    });
    showOk(`Pedido #${deleteTarget.id} anulado`);
    cerrarAnular();
  };

  const pedidosLocal = localSel === 'todos' ? pedidos : pedidos.filter(p => p.sede === localSel);
  // Pestaña "Pedidos activos": todo lo que no esté anulado ni pendiente de
  // verificación de pago. Los 'pendiente_verificacion' viven en la pestaña
  // "Pagos pendientes" (misma vista).
  const pagosPendientesCount = pedidosLocal.filter(p => p.estado === 'pendiente_verificacion').length;
  // Un pedido ENTREGADO ya cumplió su ciclo: el backend le crea la venta en
  // la misma transacción que lo marca entregado (ver crearVentaDesdePedido
  // en routes/index.js), así que a partir de ese momento su sitio es el
  // módulo de Ventas, no éste. Antes se quedaba en la lista para siempre,
  // mezclando pedidos cerrados con los que todavía hay que atender.
  // Se filtra ACÁ y no en GET /pedidos a propósito: esa misma ruta la usan
  // el cliente para su historial ("Mis pedidos"), el Cajero, el Bartender y
  // la campana de domicilios — y todos ellos SÍ necesitan ver los
  // entregados. Filtrar en el backend los dejaría a todos sin historial.
  const activos = pedidosLocal.filter(p =>
    p.estado !== 'anulado' &&
    p.estado !== 'pendiente_verificacion' &&
    normalizarEstadoPedido(p.estado) !== 'entregado'
  );
const base = activos;

const lq = buscar.toLowerCase().trim();
// Busca el texto en CUALQUIER dato registrado del pedido: número, cliente,
// mesa, estado, tipo, método de pago, sede, teléfono, dirección, quien lo
// atendió (barista/domiciliario) y el nombre de los productos. Antes solo
// miraba cliente/mesa, estado y productos, así que buscar por el número de
// pedido o por el método de pago no devolvía nada.
const pedidoMatchesTexto = (p, q) => {
  const campos = [
    p.cliente, p.mesa, p.estado, p.tipo, p.metodo_pago, p.sede,
    p.telefono, p.direccion, p.barista, p.domiciliario,
  ];
  if (campos.some(c => String(c || '').toLowerCase().includes(q))) return true;
  if (String(p.id ?? '').toLowerCase().includes(q)) return true;
  const prods = Array.isArray(p.productos) ? p.productos : (Array.isArray(p.items) ? p.items : []);
  return prods.some(x => (x.nombre || (typeof x === 'string' ? x : '')).toLowerCase().includes(q));
};
const filtrados = lq
  ? base.filter(p => pedidoMatchesTexto(p, lq))
  : base;
  const ordenados  = [...filtrados].sort((a,b) => Number(b.id) - Number(a.id));
  const totalPags  = Math.ceil(ordenados.length / POR_PAGINA);
  const paginados  = ordenados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const statCards = [
    { label:'Total pedidos',  value: stats.total,        color:'#6D4C41', bg:'#EFEBE9' },
    { label:'Por verificar',  value: stats.porVerificar, color:'#AD1457', bg:'#FCE4EC' },
    { label:'Pendientes',     value: stats.pendiente,    color:'#F57F17', bg:'#FFF8E1' },
    { label:'En proceso',     value: stats.proceso,      color:'#1565C0', bg:'rgba(25,118,210,0.12)' },
    { label:'Ventas del día', value: fmt(stats.ventas),  color:'#2E7D32', bg:'#E8F5E9', big:true },
  ];

  return (
    <Layout>
      <div className="pd-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {error   && <div className="toast toast-error">⚠ {error}</div>}
        {modal && (
          <div className="pb-modal-overlay" onClick={() => setModal(false)}>
            <div className="pb-modal" onClick={e => e.stopPropagation()}>
              <div className="pb-modal__head">
                <h2>Nuevo pedido</h2>
                <button className="pb-modal__x" onClick={() => setModal(false)}>✕</button>
              </div>
              <div className="pb-modal__body">
                <PedidoBuilder
                  mode="admin"
                  showToast={m => (m.startsWith('✕') ? showErr(m.replace(/^✕\s*/, '')) : showOk(m.replace(/^✓\s*/, '')))}
                  onCancel={() => setModal(false)}
                  onCreated={() => { setModal(false); setPagina(1); refresh(); }}
                />
              </div>
            </div>
          </div>
        )}
        {editTarget && <ModalPedido pedido={editTarget} onClose={() => setEditTarget(null)} onSave={guardar} />}
        {detalle && <ModalDetallePedido onClose={() => setDetalle(null)} pedido={detalle} onCambiarEstado={cambiarEstado} />}

        <div className="page-header">
          <div>
            <h1 className="page-title">Gestión de Pedidos</h1>
            <p className="page-subtitle">Control de pedidos en tiempo real</p>
          </div>
          {hasPermiso('pedidos', 'gestionar') && (
            <button className="btn-add" onClick={() => setModal(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo pedido
            </button>
          )}
        </div>

        <div className="pd-stats">
          {statCards.map((s,i) => (
            <div className="pd-stat" key={i} style={{ borderTop:`3px solid ${s.color}` }}>
              <div className="pd-stat-label">{s.label}</div>
              <div className={`pd-stat-value${s.big ? ' pd-stat-value--money' : ''}`} style={{ color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="insumos-card">
          <div className="pd-tabs-row">
            <div className="pd-tabs">
              <button
                className={`pd-tab ${vista === 'activos' ? 'pd-tab--on' : ''}`}
                onClick={() => { setVista('activos'); setPagina(1); }}>
                Pedidos activos <span className="pd-tab__count">{activos.length}</span>
              </button>
              <button
                className={`pd-tab ${vista === 'pagos' ? 'pd-tab--on' : ''} ${pagosPendientesCount > 0 ? 'pd-tab--alert' : ''}`}
                onClick={() => { setVista('pagos'); setPagina(1); }}>
                💳 Pagos pendientes{pagosPendientesCount > 0 ? <span className="pd-tab__count pd-tab__count--alert">{pagosPendientesCount}</span> : null}
              </button>
            </div>
            <LocalFiltro value={localSel} onChange={v => { setLocalSel(v); setPagina(1); }} sedeUsuario={user?.sede} style={{ padding: '8px 14px' }}/>
          </div>

          {vista === 'pagos' ? (
            <PagosPendientesPanel
              pedidos={pedidosLocal}
              onChanged={refresh}
              showOk={showOk}
              showErr={showErr}
            />
          ) : (
          <>
          <div className="pd-toolbar">
            <div className="search-group">
              <div className="search-wrap">
                <span className="search-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <input className="search-input" placeholder="Buscar por N.º, cliente, producto, estado o pago..." value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1); }}/>
                {buscar && <button className="search-clear" onClick={() => setBuscar('')}>✕</button>}
              </div>
            </div>
            {(buscar || localSel !== localSelDefault) && (
              <button className="btn-limpiar-filtros" title="Limpiar filtros"
                onClick={() => { setBuscar(''); setLocalSel(localSelDefault); setPagina(1); }}>
                ✕ Limpiar filtros
              </button>
            )}
            <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{filtrados.length} pedido{filtrados.length!==1?'s':''}</span>
          </div>

          {paginados.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              </div>
              <h3>{buscar ? 'Sin coincidencias' : 'No hay pedidos'}</h3>
              <p>{buscar ? `Sin resultados para "${buscar}"` : 'Crea el primer pedido del día usando el botón "Nuevo pedido" de arriba'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table pd-table-compact">
                <thead>
                  <tr><th>#</th><th>Cliente</th><th>Tipo</th><th>Local</th><th>Atendido por</th><th>Domiciliario</th><th>Productos</th><th>Total</th><th>Hora</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {paginados.map(p => {
                    const prods = Array.isArray(p.productos) ? p.productos : (Array.isArray(p.items) ? p.items : []);
                    const vis   = prods.slice(0,2).map(x=>`${x.nombre||x}${x.cantidad>1?` x${x.cantidad}`:''}`).join(', ');
                    const extra = prods.length - 2;
                    // configEstadoPedido en vez de ESTADO_CONFIG[p.estado]: normaliza
                    // los valores legados de la BD ('listo', 'en_preparacion'), que
                    // indexados en crudo caían al objeto vacío y dejaban la etiqueta
                    // sin color ni texto.
                    const cfg   = configEstadoPedido(p.estado, p.tipo);
                    const hora  = p.hora || (p.created_at ? new Date(p.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—');
                    return (
                      <tr key={p.id}>
                        <td className="td-id">#{p.id}</td>
                        <td className="td-nombre">{p.cliente || p.mesa || '—'}</td>
                        <td>
                          <span className={`pd-tipo-badge ${p.tipo==='domicilio'?'pd-tipo-badge--domi':'pd-tipo-badge--local'}`}>
                            <span aria-hidden="true">{p.tipo==='domicilio'?'🛵':'🏬'}</span>
                            {p.tipo==='domicilio'?'Domicilio':'En local'}
                          </span>
                        </td>
                        <td>{p.sede ? <span className="badge-cat" style={{background:'rgba(25,118,210,0.12)',color:'#1976D2'}}>{p.sede}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td>{p.barista ? <span className="pd-pill-barista">{p.barista}</span> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                        <td>{p.tipo==='domicilio' ? (p.domiciliario ? <span className="pd-pill-domi">🛵 {p.domiciliario}</span> : <span style={{color:'var(--text-muted)'}}>—</span>) : <span style={{color:'#ccc'}}>N/A</span>}</td>
                        <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:180}}>
                          {vis}
                          <button className="btn-ver-mas" onClick={() => setDetalle(p)} style={{marginLeft:4}}>
                            {extra > 0 ? `+${extra} más` : 'ver'}
                          </button>
                        </td>
                        <td style={{fontWeight:700,color:'#2E7D32',fontSize:13}}>{fmt(p.total)}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{hora}</td>
                        <td>
                          {(() => {
                            const estadoLabel = etiquetaEstadoPedido(p.estado, p.tipo);
                            if (!hasPermiso('pedidos', 'gestionar') || p.estado === 'anulado') {
                              return <span className="pd-badge" style={{background:cfg.bg,color:cfg.color}}>{estadoLabel}</span>;
                            }
                            // El desplegable ofrece SOLO el estado actual y los
                            // posteriores de la secuencia (nunca los anteriores).
                            // Un pedido terminal (entregado / cancelado) deja el
                            // <select> deshabilitado. Misma secuencia de 4
                            // estados para domicilio y para local (punto 9).
                            const bloqueado = esEstadoPedidoTerminal(p.estado);
                            const base = ['pendiente', 'en_proceso', 'en_camino', 'entregado'];
                            const disponibles = filtrarEstadosPedidoDisponibles(p.estado, base, { secuencia: SECUENCIA_PEDIDO_ADMIN });
                            const opciones = bloqueado ? [] : [...disponibles, 'cancelado'];
                            return (
                              <select className="pd-estado-select" value={normalizarEstadoPedido(p.estado)} disabled={bloqueado}
                                title={bloqueado ? 'Este pedido ya está cerrado — no se puede cambiar de estado' : undefined}
                                style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.color + '55', ...(bloqueado ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                                onChange={e => cambiarEstado(p.id, e.target.value)}>
                                {bloqueado ? (
                                  <option value={normalizarEstadoPedido(p.estado)}>{estadoLabel}</option>
                                ) : (
                                  <>
                                    {!opciones.includes(normalizarEstadoPedido(p.estado)) && <option value={normalizarEstadoPedido(p.estado)} disabled>{estadoLabel}</option>}
                                    {opciones.map(k => <option key={k} value={k}>{k === 'cancelado' ? 'Cancelado' : etiquetaEstadoPedido(k, p.tipo)}</option>)}
                                  </>
                                )}
                              </select>
                            );
                          })()}
                        </td>
                        <td>
                          <div className="actions-group">
                            {hasPermiso('pedidos', 'ver') && (
                              <Tooltip label="Ver detalle">
                                <button className="btn-ver" onClick={() => setDetalle(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                              </Tooltip>
                            )}
                            {p.estado!=='entregado'&&p.estado!=='cancelado' && hasPermiso('pedidos', 'gestionar') && (
                              <Tooltip label="Editar pedido">
                                <button className="btn-editar" onClick={() => setEditTarget(p)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                              </Tooltip>
                            )}
{normalizarEstadoPedido(p.estado)!=='en_camino'&&p.estado!=='entregado' && hasPermiso('pedidos', 'eliminar') && (
  <AnularButton onClick={() => setDel(p)}/>
)}                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPags > 1 && (
            <div className="pd-paginacion">
              <button className="btn-cancel" disabled={pagina===1} onClick={() => setPagina(p=>Math.max(1,p-1))}>Anterior</button>
              {Array.from({length:totalPags},(_,i)=>i+1).map(n => (
                <button key={n} className={n===pagina?'btn-confirm-primary':'btn-cancel'} style={{padding:'6px 14px'}} onClick={() => setPagina(n)}>{n}</button>
              ))}
              <button className="btn-cancel" disabled={pagina===totalPags} onClick={() => setPagina(p=>Math.min(totalPags,p+1))}>Siguiente</button>
              <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:8}}>{ordenados.length} registros · Pág {pagina}/{totalPags}</span>
            </div>
          )}
          </>
          )}
        </div>

        {deleteTarget && (
          <div className="modal-overlay" onClick={cerrarAnular}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-icon modal-icon-danger">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </div>
              <h3>Anular pedido #{deleteTarget.id}</h3>
              <p>Esta acción es <strong>permanente</strong> y se notificará al cliente.</p>
              <textarea
                className="pd-alt-address__input"
                style={{width:'100%',minHeight:70,resize:'vertical',fontFamily:'inherit',fontSize:13,padding:10,borderRadius:8,border:'1.5px solid var(--border)',marginTop:4}}
                placeholder="Motivo de la anulación (opcional)"
                value={anularMotivo}
                onChange={e => setAnularMotivo(e.target.value)}
              />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={cerrarAnular}>Cancelar</button>
                <button className="btn-confirm-danger" onClick={handleAnularPedido}>Sí, anular pedido</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}