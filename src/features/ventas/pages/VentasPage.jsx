import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import ventasService from '../services/ventasService';
import pedidosService from '../../pedidos/services/pedidosService';
import devolucionesService from '../../devoluciones/services/devolucionesService';
import { useAuth } from '../../../shared/contexts/AuthContext';
import LocalFiltro from '../../../shared/components/LocalFiltro';
import Tooltip from '../../../shared/components/Tooltip';
import '../../insumos/pages/InsumosPage.css';
import './VentasPage.css';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
const fmtFecha = iso => iso ? new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'}).format(new Date(iso)) : '—';
const fmtHora  = iso => iso ? new Intl.DateTimeFormat('es-CO',{timeStyle:'short'}).format(new Date(iso)) : '—';

// El backend puede devolver el identificador de venta/devolución como
// `id_venta`/`id_dev` o simplemente `id`. Antes se asumía siempre el nombre
// largo; si venía distinto o `undefined`, todas las filas de la tabla
// terminaban con la misma key (o "undefined") y React lo marcaba con el
// warning "Each child in a list should have a unique key prop".
const getVentaId = v => v?.id_venta ?? v?.id;
const getDevId   = d => d?.id_dev   ?? d?.id;

// Mismos 3 métodos que Landing/Cajero/Pedidos — sin Tarjeta ni Daviplata.
const METODOS = ['Efectivo','Nequi','Transferencia'];

const ESTADO_CFG = {
  vendido:  { bg:'#E8F5E9', color:'#2E7D32', label:'Vendido' },
  devuelto: { bg:'#FFEBEE', color:'#C62828', label:'Devuelto' },
};

function ModalRegistrarVenta({ onClose, onSave }) {
  const [pedidosEntregados, setPedidosEntregados] = useState([]);
  const [ventasExistentes, setVentasExistentes]   = useState([]);
  useEffect(() => {
    pedidosService.getAll().then(d => setPedidosEntregados(Array.isArray(d) ? d.filter(p=>p.estado==='entregado') : [])).catch(()=>{});
    ventasService.getAll().then(d => setVentasExistentes(Array.isArray(d) ? d.map(v=>v.id_pedido) : [])).catch(()=>{});
  }, []);
  const disponibles = pedidosEntregados.filter(p => !ventasExistentes.includes(p.id));

  const [form, setForm] = useState({ id_pedido: '', metodo_pago: 'Efectivo', tipo_venta: 'Local' });
  const [error, setError] = useState('');

  const pedidoSel = disponibles.find(p => p.id === form.id_pedido);

  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    if (!form.id_pedido) { setError('Selecciona un pedido'); return; }
    setLoadingSubmit(true);
    try {
      // El backend solo necesita id_pedido; método de pago y tipo de venta
      // ya viven en el pedido (columnas pago/tipo) y se leen por el JOIN.
      await ventasService.crearDesde(form.id_pedido);
      onSave();
    } catch (err) {
      setError(err.message || 'No se pudo registrar la venta');
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:500,textAlign:'left',padding:'32px 36px'}} onClick={e=>e.stopPropagation()}>
        <h3 style={{marginBottom:4}}>Registrar venta</h3>
        <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>Genera una venta desde un pedido entregado</p>
        {error && <div style={{background:'rgba(229,57,53,0.12)',color:'var(--color-red)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>⚠ {error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Pedido entregado *</label>
              {disponibles.length === 0 ? (
                <p style={{color:'#E65100',fontSize:13}}>No hay pedidos entregados sin venta registrada.</p>
              ) : (
                <select value={form.id_pedido} onChange={e => setForm(f => ({...f, id_pedido: e.target.value}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-surface)'}}>
                  <option value="">Seleccionar pedido...</option>
                  {disponibles.map(p => (
                    <option key={p.id} value={p.id}>#{p.id} — {p.cliente} — {fmt(p.total)}</option>
                  ))}
                </select>
              )}
            </div>
            {pedidoSel && (
              <div style={{background:'var(--bg-surface-2)',borderRadius:8,padding:'12px 16px',fontSize:13}}>
                <div style={{fontWeight:700,marginBottom:6}}>Pedido #{pedidoSel.id}</div>
                <div style={{color:'var(--text-secondary)'}}>Cliente: {pedidoSel.cliente}</div>
                <div style={{color:'var(--text-secondary)'}}>Total: <strong style={{color:'#2E7D32'}}>{fmt(pedidoSel.total)}</strong></div>
                <div style={{color:'var(--text-secondary)'}}>Tipo: {pedidoSel.tipo === 'domicilio' ? 'Domicilio' : 'Local'}</div>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Método de pago</label>
                <select value={form.metodo_pago} onChange={e => setForm(f => ({...f, metodo_pago: e.target.value}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-surface)'}}>
                  {METODOS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Tipo de venta</label>
                <select value={form.tipo_venta} onChange={e => setForm(f => ({...f, tipo_venta: e.target.value}))}
                  style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-surface)'}}>
                  <option>Local</option><option>Domicilio</option>
                </select>
              </div>
            </div>
          </div>
          <div className="modal-actions" style={{justifyContent:'flex-end',marginTop:20}}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-confirm-primary" disabled={!form.id_pedido}>✓ Registrar venta</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalDetalle({ venta, onClose, onNavigateDev, todasDevs = [] }) {
  const devs = todasDevs.filter(d => d.pedido_id === venta.id_pedido);
  const cfg  = ESTADO_CFG[venta.estado] || {};
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:560,textAlign:'left',padding:'32px 36px',maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',letterSpacing:1,textTransform:'uppercase'}}>Venta</div>
            <div style={{fontSize:24,fontWeight:800}}>#{getVentaId(venta)}</div>
          </div>
          <span style={{background:cfg.bg,color:cfg.color,padding:'5px 14px',borderRadius:100,fontSize:12,fontWeight:700}}>{cfg.label}</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[['Cliente',venta.cliente],['Pedido','#'+venta.id_pedido],['Fecha',fmtFecha(venta.fecha)],['Hora',fmtHora(venta.fecha)],['Método',venta.metodo_pago],['Tipo',venta.tipo_venta]].map(([k,v]) => (
            <div key={k} style={{background:'var(--bg-surface-2)',borderRadius:8,padding:'10px 14px'}}>
              <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>{k}</div>
              <div style={{fontSize:14,fontWeight:600,marginTop:3}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{background:'var(--bg-surface-2)',borderRadius:8,padding:'12px 16px',marginBottom:16,display:'flex',justifyContent:'space-between'}}>
          <span style={{fontWeight:600,color:'var(--text-secondary)'}}>Total</span>
          <span style={{fontSize:20,fontWeight:800,color:'#2E7D32'}}>{fmt(venta.total)}</span>
        </div>
        {Array.isArray(venta.productos) && venta.productos.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Productos</div>
            {venta.productos.map((p,i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',borderRadius:6,background:i%2===0?'#F5F5F5':'transparent',fontSize:13}}>
                <span>{p.nombre||p} {p.cantidad>1&&<span style={{background:'#2E7D32',color:'white',padding:'1px 5px',borderRadius:4,fontSize:10,marginLeft:4}}>x{p.cantidad}</span>}</span>
                {p.precio && <span style={{fontWeight:600,color:'#2E7D32'}}>{fmt(p.precio*(p.cantidad||1))}</span>}
              </div>
            ))}
            {Array.isArray(venta.toppings) && venta.toppings.length > 0 && (
              <div style={{marginTop:8,paddingTop:8,borderTop:'1px dashed #ddd'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Toppings:</div>
                {venta.toppings.map((t,i) => (
                  <div key={i} style={{fontSize:12,color:'var(--text-secondary)',padding:'2px 0'}}>{t.nombre} {t.precio>0?<span style={{color:'#F57F17'}}>+{fmt(t.precio)}</span>:<span style={{color:'#2E7D32'}}>Gratis</span>}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {devs.length > 0 && (
          <div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>Devoluciones ({devs.length})</div>
            {devs.map(d => {
              const dCfg = {pendiente:{bg:'#FFF8E1',c:'#F57F17'},aprobada:{bg:'#E8F5E9',c:'#2E7D32'},rechazada:{bg:'#FFEBEE',c:'#C62828'}}[d.estado]||{};
              return (
                <div key={getDevId(d)} style={{background:dCfg.bg,borderRadius:8,padding:'10px 14px',marginBottom:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                    <span style={{fontWeight:700,fontSize:13}}>Dev. #{getDevId(d)}</span>
                    <span style={{color:dCfg.c,fontWeight:700,fontSize:12}}>{d.estado.toUpperCase()}</span>
                  </div>
                  {Array.isArray(d.productos_devueltos) && d.productos_devueltos.length > 0 && (
                    <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:3}}>
                      Productos: {d.productos_devueltos.map(p => p.nombre||p).join(', ')}
                    </div>
                  )}
                  {d.monto_devolucion && (
                    <div style={{fontSize:12,fontWeight:600,color:'#E65100',marginBottom:3}}>
                      Monto: {fmt(d.monto_devolucion)}
                    </div>
                  )}
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>{d.motivo}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="modal-actions" style={{justifyContent:'space-between',marginTop:20}}>
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
          {venta.estado === 'vendido' && (
            <button className="btn-confirm-primary" onClick={() => { onClose(); onNavigateDev(venta); }}>↩ Registrar devolución</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VentasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Igual criterio que en Pedidos: 'todos' solo para sede='Ambos'
  // (Administrador/Superadministrador); el resto queda fijo en su local.
  const [localSel, setLocalSel] = useState(user?.sede && user.sede !== 'Ambos' ? user.sede : 'todos');
  const [ventas, setVentas]       = useState([]);
  const [todasDevs, setTodasDevs] = useState([]);
  useEffect(() => {
    ventasService.getAll().then(d => setVentas(Array.isArray(d) ? d : [])).catch(()=>{});
    devolucionesService.getAll().then(d => setTodasDevs(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const [query, setQuery]       = useState('');
  const [filtroEstado, setFiltro] = useState('todos');
  const [modal, setModal]       = useState(null); // null | 'new' | venta
  const [detalle, setDetalle]   = useState(null);
  const [success, setSuccess]   = useState('');
  const [pagina, setPagina]     = useState(1);
  const POR_PAG = 10;

  const refresh = () => {
    ventasService.getAll()
      .then(d => setVentas(Array.isArray(d) ? d : []))
      .catch(() => setVentas([]));
  };
  const showOk = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  // Antes: `ventasService.getStats()` llama a la API (devuelve una Promise)
  // pero se usaba como si fuera un objeto ya resuelto, así que
  // `stats.total`, `stats.vendido`, etc. siempre eran `undefined` y las
  // tarjetas de arriba se veían vacías. Se calcula localmente a partir de
  // la lista que ya se cargó, igual que hace la página de Devoluciones.
  const stats = {
    total:         ventas.length,
    vendido:       ventas.filter(v => v.estado === 'vendido').length,
    devuelto:      ventas.filter(v => v.estado === 'devuelto').length,
    totalIngresos: ventas.filter(v => v.estado === 'vendido').reduce((s,v) => s + (v.total || 0), 0),
  };

  const lq = query.toLowerCase().trim();
  const filtradas = ventas.filter(v => {
    // Antes: `ventasService.search` no existe en el servicio (solo tiene
    // getAll/getStats/getById/crearDesde/cambiarEstado). Llamarlo lanzaba
    // "ventasService.search is not a function" apenas el usuario escribía
    // algo en el buscador, tumbando toda la página de Ventas.
    const mq = !lq || String(getVentaId(v)).includes(lq) || (v.cliente||'').toLowerCase().includes(lq) || (v.metodo_pago||'').toLowerCase().includes(lq);
    const me = filtroEstado === 'todos' || v.estado === filtroEstado;
    const ml = localSel === 'todos' || v.sede === localSel;
    return mq && me && ml;
  });
  const ordenadas  = [...filtradas].sort((a,b) => (getVentaId(b)||0) - (getVentaId(a)||0));
  const totalPags  = Math.ceil(ordenadas.length / POR_PAG);
  const paginadas  = ordenadas.slice((pagina-1)*POR_PAG, pagina*POR_PAG);

  const handleNavigateDev = venta => {
    // Go to devoluciones page with prefilled venta
    localStorage.setItem('sicaber_dev_prefill', JSON.stringify({ id_venta: getVentaId(venta) }));
    navigate('/devoluciones');
  };

  const statCards = [
    { label:'Total ventas',   value: stats.total,    color:'#1565C0', bg:'rgba(25,118,210,0.12)' },
    { label:'Vendidas',       value: stats.vendido,  color:'#2E7D32', bg:'#E8F5E9' },
    { label:'Devueltas',      value: stats.devuelto, color:'#C62828', bg:'#FFEBEE' },
    { label:'Total ingresos', value: fmt(stats.totalIngresos), color:'#2E7D32', bg:'#F1F8E9', big:true },
  ];

  return (
    <Layout>
      <div className="insumos-root">
        {success && <div className="toast toast-success">✓ {success}</div>}
        {detalle && <ModalDetalle todasDevs={todasDevs} venta={detalle} onClose={() => setDetalle(null)} onNavigateDev={handleNavigateDev}/>}

        <div className="page-header" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 className="page-title">Ventas</h1>
            <p className="page-subtitle">Registro y control de ventas del negocio</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          {statCards.map((s,i) => (
            <div key={i} style={{background:'var(--stat-card-bg)',borderRadius:12,padding:'16px 18px',borderTop:`3px solid ${s.color}`,boxShadow:'var(--stat-card-shadow)',border:`1px solid var(--border)`,borderTopColor:s.color}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:s.big?16:26,fontWeight:800,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="insumos-card">
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 20px',borderBottom:'1px solid #eee',flexWrap:'wrap'}}>
            <div className="search-group" style={{flex:1,maxWidth:400}}>
              <div className="search-wrap">
                <span className="search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                <input className="search-input" placeholder="Buscar por cliente, ID o método..." value={query} onChange={e => { setQuery(e.target.value); setPagina(1); }}/>
                {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
              </div>
            </div>
            <select value={filtroEstado} onChange={e => { setFiltro(e.target.value); setPagina(1); }}
              style={{padding:'10px 14px',border:'1.5px solid var(--border-input)',borderRadius:8,fontSize:13,outline:'none',background:'var(--bg-surface)'}}>
              <option value="todos">Todos los estados</option>
              <option value="vendido">Vendido</option>
              <option value="devuelto">Devuelto</option>
            </select>
            <LocalFiltro value={localSel} onChange={v => { setLocalSel(v); setPagina(1); }} sedeUsuario={user?.sede}/>
            <span style={{fontSize:13,color:'var(--text-muted)',marginLeft:'auto'}}>{filtradas.length} venta{filtradas.length!==1?'s':''}</span>
          </div>

          {paginadas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg></div>
              <h3>{query || filtroEstado !== 'todos' ? 'Sin coincidencias' : 'No hay ventas registradas'}</h3>
              <p>{query ? `Sin resultados para "${query}"` : 'Registra ventas desde pedidos entregados'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="insumos-table">
                <thead><tr><th>#</th><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Método</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {paginadas.map(v => {
                    const cfg = ESTADO_CFG[v.estado] || {};
                    const devs = todasDevs.filter(d => d.pedido_id === v.id_pedido);
                    const devPend = devs.find(d => d.estado === 'pendiente');
                    return (
                      <tr key={getVentaId(v)}>
                        <td className="td-id">{getVentaId(v)}</td>
                        <td><span style={{fontSize:12,fontWeight:600,color:'var(--text-muted)'}}>#{v.id_pedido}</span></td>
                        <td>
                          <div className="td-nombre">{v.cliente}</div>
                          {devPend && <div style={{fontSize:11,color:'#E65100',fontWeight:600}}>↩ Dev. pendiente #{getDevId(devPend)}</div>}
                        </td>
                        <td style={{fontSize:13,color:'var(--text-secondary)'}}>
                          <div>{fmtFecha(v.fecha)}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>{fmtHora(v.fecha)}</div>
                        </td>
                        <td style={{fontWeight:700,color:'#2E7D32'}}>{fmt(v.total)}</td>
                        <td style={{fontSize:13}}>{v.metodo_pago}</td>
                        <td><span className="badge-cat">{v.tipo_venta}</span></td>
                        <td><span style={{background:cfg.bg,color:cfg.color,padding:'4px 12px',borderRadius:100,fontSize:12,fontWeight:700}}>{cfg.label||v.estado}</span></td>
                        <td>
                          <div className="actions-group">
                            <Tooltip label="Ver detalle">
                              <button className="btn-ver" onClick={() => setDetalle(v)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              </button>
                            </Tooltip>
                            {v.estado === 'vendido' && (
                              <Tooltip label="Registrar devolución">
                                <button onClick={() => handleNavigateDev(v)}
                                  style={{padding:4,background:'transparent',border:'none',cursor:'pointer',color:'#F57F17'}}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPags > 1 && (
            <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,padding:'14px',borderTop:'1px solid #eee'}}>
              <button className="btn-cancel" style={{padding:'6px 14px'}} disabled={pagina===1} onClick={() => setPagina(p => p-1)}>Anterior</button>
              {Array.from({length:totalPags},(_,i)=>i+1).map(n => (
                <button key={n} className={n===pagina?'btn-confirm-primary':'btn-cancel'} style={{padding:'6px 14px'}} onClick={() => setPagina(n)}>{n}</button>
              ))}
              <button className="btn-cancel" style={{padding:'6px 14px'}} disabled={pagina===totalPags} onClick={() => setPagina(p => p+1)}>Siguiente</button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}