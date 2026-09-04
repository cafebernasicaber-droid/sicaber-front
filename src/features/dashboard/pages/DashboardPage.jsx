import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import clientesService from '../../clientes/services/clientesService';
import insumosService from '../../insumos/services/insumosService';
import proveedoresService from '../../proveedores/services/proveedoresService';
import comprasService from '../../compras/services/comprasService';
import pedidosService from '../../pedidos/services/pedidosService';
import empleadosService from '../../empleados/services/empleadosService';
import usuariosService from '../../usuarios/services/usuariosService';
import productosService from '../../productos/services/productosService';
import categoriasService from '../../categorias/services/categoriasService';
import adicionesService from '../../adiciones/services/adicionesService';
import toppingsService from '../../toppings/services/toppingsService';
import ventasService from '../../ventas/services/ventasService';
import devolucionesService from '../../devoluciones/services/devolucionesService';
import { useAuth } from '../../../shared/contexts/AuthContext';
import LocalFiltro from '../../../shared/components/LocalFiltro';
import { normalizarEstadoPedido, etiquetaEstadoPedido } from '../../../shared/utils/pedidoEstados';
import '../../insumos/pages/InsumosPage.css';
import './DashboardPage.css';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);

const toISODate = d => {
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return z.toISOString().slice(0,10);
};
const todayISO = () => toISODate(new Date());

const rangoPreset = (preset) => {
  const hoy = new Date();
  if (preset === 'hoy') { const f = toISODate(hoy); return { desde: f, hasta: f }; }
  if (preset === '7d') { const i = new Date(hoy); i.setDate(i.getDate()-6); return { desde: toISODate(i), hasta: toISODate(hoy) }; }
  if (preset === '30d') { const i = new Date(hoy); i.setDate(i.getDate()-29); return { desde: toISODate(i), hasta: toISODate(hoy) }; }
  if (preset === 'mes_actual') { const i = new Date(hoy.getFullYear(), hoy.getMonth(), 1); return { desde: toISODate(i), hasta: toISODate(hoy) }; }
  if (preset === 'mes_pasado') { const i = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1); const f = new Date(hoy.getFullYear(), hoy.getMonth(), 0); return { desde: toISODate(i), hasta: toISODate(f) }; }
  return rangoPreset('30d');
};

const enRango = (isoFecha, desde, hasta) => {
  if (!isoFecha) return false;
  const f = isoFecha.slice(0,10);
  return f >= desde && f <= hasta;
};

const listaDias = (desde, hasta) => {
  const dias = []; let cur = new Date(desde+'T00:00:00'); const fin = new Date(hasta+'T00:00:00'); let g = 0;
  while (cur <= fin && g < 366) { dias.push(toISODate(cur)); cur.setDate(cur.getDate()+1); g++; }
  return dias;
};

const Icon = ({ d, size=16, stroke='currentColor', sw=1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
);

const ICONS = {
  usuarios:    'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  clientes:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  pedidos:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  empleados:   'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8L6 7h12l-2-4z',
  ventas:      'M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6',
  devoluciones:'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  productos:   'M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3',
  toppings:    'M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 01-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z',
  adiciones:   'M12 5v14M5 12h14',
  insumos:     'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4',
  proveedores: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10',
  alert_warn:  'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  alert_truck: 'M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M9 17a2 2 0 100 4 2 2 0 000-4zM20 17a2 2 0 100 4 2 2 0 000-4zM14 9h4l3 5v3h-7V9z',
  alert_back:  'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  check:       'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  trending:    'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  chevron:     'M6 9l6 6 6-6',
};

function BarChart({ data, color='#4CAF50' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 380, H = 140, PAD = 32, BAR_W = 24;
  const step = (W - PAD * 2) / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 40}`} style={{ display:'block' }}>
      {[0,.25,.5,.75,1].map((pct,i) => { const y = PAD + (H - PAD) * (1 - pct); return <line key={i} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F0F0F0" strokeWidth="1"/>; })}
      {data.map((d, i) => {
        const x = PAD + i * step + step/2 - BAR_W/2;
        const barH = ((d.value / max) * (H - PAD)) || 2;
        const y = PAD + (H - PAD) - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={BAR_W} height={barH} rx="5" fill={color} opacity="0.85"/>
            {d.value > 0 && <text x={x + BAR_W/2} y={y - 5} textAnchor="middle" fontSize="10" fill="#888" fontFamily="'Open Sans',sans-serif">{d.value}</text>}
            <text x={x + BAR_W/2} y={H + 20} textAnchor="middle" fontSize="10" fill="#AAAAAA" fontFamily="'Open Sans',sans-serif">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const fmtCorto = n => {
  if (n >= 1000000) return `$${(n/1000000).toFixed(1).replace('.0','')}M`;
  if (n >= 1000) return `$${Math.round(n/1000)}k`;
  return `$${n}`;
};

function BarChartMoney({ data, color='#4CAF50' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 380, H = 140, PAD = 32;
  const BAR_W = data.length > 20 ? 10 : data.length > 10 ? 16 : 24;
  const step = (W - PAD * 2) / data.length;
  const labelEvery = data.length > 20 ? Math.ceil(data.length / 10) : 1;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 40}`} style={{ display:'block' }}>
      {[0,.25,.5,.75,1].map((pct,i) => { const y = PAD + (H - PAD) * (1 - pct); return <line key={i} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F0F0F0" strokeWidth="1"/>; })}
      {data.map((d, i) => {
        const x = PAD + i * step + step/2 - BAR_W/2;
        const barH = ((d.value / max) * (H - PAD)) || 1;
        const y = PAD + (H - PAD) - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={BAR_W} height={barH} rx="4" fill={color} opacity="0.85"/>
            {d.value > 0 && BAR_W >= 16 && <text x={x + BAR_W/2} y={y - 5} textAnchor="middle" fontSize="9" fill="#888" fontFamily="'Open Sans',sans-serif">{fmtCorto(d.value)}</text>}
            {i % labelEvery === 0 && <text x={x + BAR_W/2} y={H + 20} textAnchor="middle" fontSize="9" fill="#AAAAAA" fontFamily="'Open Sans',sans-serif">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments }) {
  const total = segments.reduce((s,g) => s + g.value, 0) || 1;
  const R = 54, CX = 70, CY = 70, STROKE = 18;
  let offset = 0;
  const circ = 2 * Math.PI * R;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', justifyContent:'center' }}>
      <svg width={140} height={140} style={{ flexShrink:0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F5F5F5" strokeWidth={STROKE}/>
        {segments.filter(s => s.value > 0).map((seg, i) => {
          const dash = (seg.value / total) * circ;
          const gap  = circ - dash;
          const el = (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none"
              stroke={seg.color} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circ / total + circ * 0.25}
              strokeLinecap="butt"
              style={{ transition:'stroke-dasharray .5s ease' }}
            />
          );
          offset += seg.value;
          return el;
        })}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text-primary)" fontFamily="'Montserrat',sans-serif">{total}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fill="#AAAAAA" fontFamily="'Open Sans',sans-serif">TOTAL</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:8, flex:'1 1 130px', minWidth:0 }}>
        {segments.map((seg,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:seg.color, flexShrink:0 }}/>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{seg.label}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto', flexShrink:0 }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [datePreset, setDatePreset] = useState('30d');
  const [rangoCustom, setRangoCustom] = useState(() => rangoPreset('30d'));
  // Filtro por local (Administración): 'todos' solo para sede='Ambos'
  // (Administrador/Superadministrador); el resto queda fijo en su local.
  // Igual criterio que ya usan CajeroPage/BartenderPage para pedidos.
  const [localSel, setLocalSel] = useState(user?.sede && user.sede !== 'Ambos' ? user.sede : 'todos');

  // ── Estado para todos los datos async ───────────────────────────────────
  const [clientes,    setClientes]    = useState([]);
  const [insumos,     setInsumos]     = useState([]);
  // Alerta de stock bajo: colapsada de entrada (solo el resumen); al tocarla
  // se despliega el detalle con el local de cada insumo.
  const [stockBajoOpen, setStockBajoOpen] = useState(false);
  const [compras,     setCompras]     = useState([]);
  const [pedidos,     setPedidos]     = useState([]);
  const [empleados,   setEmpleados]   = useState([]);
  const [usuarios,    setUsuarios]    = useState([]);
  const [productos,   setProductos]   = useState([]);
  const [ventas,      setVentas]      = useState([]);
  const [devoluciones,setDevoluciones]= useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [cl, ins, com, ped, emp, prod, ven, dev, usr] = await Promise.allSettled([
          clientesService.getAll(),
          insumosService.getAll(),
          comprasService.getAll(),
          pedidosService.getAll(),
          empleadosService.getAll(),
          productosService.getAll(),
          ventasService.getAll(),
          devolucionesService.getAll(),
          usuariosService.getAll(),
        ]);
        if (cl.status  === 'fulfilled') setClientes(cl.value  || []);
        if (ins.status === 'fulfilled') setInsumos(ins.value  || []);
        if (com.status === 'fulfilled') setCompras(com.value  || []);
        if (ped.status === 'fulfilled') setPedidos(ped.value  || []);
        if (emp.status === 'fulfilled') setEmpleados(emp.value|| []);
        if (prod.status=== 'fulfilled') setProductos(prod.value||[]);
        if (ven.status === 'fulfilled') setVentas(ven.value   || []);
        if (dev.status === 'fulfilled') setDevoluciones(dev.value || []);
        if (usr.status === 'fulfilled') setUsuarios(usr.value || []);
      } catch(e) { console.error('Dashboard load error', e); }
    };
    load();
  }, []);

  // Los pedidos/ventas/devoluciones ya vienen completos; el filtro de local
  // se aplica del lado del cliente (sin recargar la página) para que todas
  // las tarjetas, gráficos y alertas de abajo respeten el local elegido.
  const pedidosF      = localSel === 'todos' ? pedidos      : pedidos.filter(p => p.sede === localSel);
  const ventas_       = localSel === 'todos' ? ventas       : ventas.filter(v => v.sede === localSel);
  const devolucionesF = localSel === 'todos' ? devoluciones : devoluciones.filter(d => d.sede === localSel);
  const pedStats = {
    pendiente: pedidosF.filter(p => p.estado === 'pendiente').length,
    ventas: pedidosF
      .filter(p => (p.created_at||'').slice(0,10) === todayISO() && !['cancelado','anulado'].includes(p.estado))
      .reduce((s,p) => s + (Number(p.total)||0), 0),
  };
  const ventasStats = {
    total:    ventas_.length,
    vendido:  ventas_.filter(v => v.estado === 'vendido').length,
    devuelto: ventas_.filter(v => v.estado === 'devuelto').length,
  };
  const devStats = { pendiente: devolucionesF.filter(d => (d.estado||'').toLowerCase() === 'pendiente').length };

  const rango = datePreset === 'custom' ? rangoCustom : rangoPreset(datePreset);

  const handlePreset = (p) => {
    setDatePreset(p);
    if (p !== 'custom') setRangoCustom(rangoPreset(p));
  };

  // Derived data
  const insumosLow       = insumos.filter(i => i.stockActual < i.stockMinimo);
  const comprasPend      = compras.filter(c => c.estado === 'Pendiente');
  const empleadosActivos = empleados.filter(e => e.estado === 'Activo').length;
  const pedidosPendLanding   = pedidosF.filter(p => p.origen === 'landing' && p.estado === 'pendiente').length;
  const pedidosDomicilio     = pedidosF.filter(p => p.tipo === 'domicilio' && (p.estado === 'pendiente' || p.estado === 'en_proceso')).length;
  const pedidosPorVerificar  = pedidosF.filter(p => p.estado === 'pendiente_verificacion').length;
  const pedidosHoyCount      = pedidosF.filter(p => (p.fechaCreacion || p.created_at || '').slice(0,10) === todayISO()).length;

  const ventasEnRango = useMemo(() => {
    return ventas_.filter(v => v.estado === 'vendido' && enRango(v.fecha || v.created_at, rango.desde, rango.hasta));
  }, [ventas_, rango.desde, rango.hasta]);

  const totalVentasPeriodo    = ventasEnRango.reduce((s,v) => s + (Number(v.total)||0), 0);
  const cantidadVentasPeriodo = ventasEnRango.length;

  const ventasPorDia = useMemo(() => {
    const dias = listaDias(rango.desde, rango.hasta);
    return dias.map(f => {
      const d = new Date(f+'T00:00:00');
      const totalDia = ventasEnRango.filter(v => (v.fecha||v.created_at||'').slice(0,10) === f)
        .reduce((s,v) => s + (Number(v.total)||0), 0);
      return { label: d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit'}), value: totalDia, fecha: f };
    });
  }, [rango.desde, rango.hasta, ventasEnRango]);

  const mejorDia = useMemo(() => {
    if (!ventasPorDia.length) return null;
    const top = ventasPorDia.reduce((max, d) => d.value > max.value ? d : max, ventasPorDia[0]);
    return top.value > 0 ? top : null;
  }, [ventasPorDia]);

  const ventasParaGrafico = useMemo(() => {
    if (ventasPorDia.length <= 31) return ventasPorDia;
    const grupos = [];
    for (let i = 0; i < ventasPorDia.length; i += 7) {
      const semana = ventasPorDia.slice(i, i + 7);
      const total = semana.reduce((s,d) => s + d.value, 0);
      grupos.push({ label: semana[0].label, value: total, fecha: semana[0].fecha });
    }
    return grupos;
  }, [ventasPorDia]);

  const ventasDonut = [
    { label:'Vendidas',  value: ventasStats.vendido  || 0, color:'#4CAF50' },
    { label:'Devueltas', value: ventasStats.devuelto || 0, color:'#EF5350' },
  ];

  const cuentaEstado = (est) => pedidosF.filter(p => normalizarEstadoPedido(p.estado) === est).length;
  const pedidosDonut = [
    { label:'Verificar pago', value: cuentaEstado('pendiente_verificacion'), color:'#AD1457' },
    { label:'Pendiente',      value: cuentaEstado('pendiente'),              color:'#FF9800' },
    { label:'En proceso',     value: cuentaEstado('en_proceso'),             color:'#2196F3' },
    { label:'En camino',      value: cuentaEstado('en_camino'),              color:'#00838F' },
    { label:'Entregado',      value: cuentaEstado('entregado'),              color:'#4CAF50' },
    { label:'Cancelado',      value: cuentaEstado('cancelado'),              color:'#EF5350' },
  ];

  const statCards = [
    { label:'Clientes',       value: clientes.length,   icon:ICONS.clientes,     color:'#2E7D32', bg:'#E8F5E9',              path:'/admin/clientes' },
    { label:'Usuarios',       value: usuarios.length,   icon:ICONS.usuarios,     color:'#1565C0', bg:'#E3F2FD',              path:'/admin/usuarios' },
    { label:'Pedidos hoy',    value: pedidosHoyCount,   icon:ICONS.pedidos,      color:'#7B1FA2', bg:'#F3E5F5',              path:'/pedidos' },
    { label:'Ventas',         value: ventasStats.total||0, icon:ICONS.ventas,    color:'#2E7D32', bg:'#E8F5E9',              path:'/ventas' },
    { label:'Dev. pendientes',value: devStats.pendiente||0,icon:ICONS.devoluciones,color:'#F57F17',bg:'#FFF8E1',             path:'/devoluciones' },
    { label:'Productos',      value: productos.length,  icon:ICONS.productos,    color:'#6D4C41', bg:'#EFEBE9',              path:'/productos' },
  ];

  const recentClientes = [...clientes].sort((a,b) => b.id - a.id).slice(0,5);

  const exportarResumenPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rangoLabel = rango.desde === rango.hasta
      ? new Date(rango.desde+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'})
      : `${new Date(rango.desde+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})} — ${new Date(rango.hasta+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}`;
    const filasDias  = ventasPorDia.map(d => `<tr><td>${d.label}</td><td style="text-align:right;">${fmt(d.value)}</td></tr>`).join('');
    const filasStats = statCards.map(s  => `<tr><td>${s.label}</td><td style="text-align:right;font-weight:700;">${s.value}</td></tr>`).join('');
    w.document.write(`<html><head><title>Resumen Dashboard</title><style>body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:640px;margin:0 auto;}h1{font-size:22px;color:#2E7D32;}table{width:100%;border-collapse:collapse;}td{padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;}</style></head><body><h1>☕ Café Don Berna — Resumen del Dashboard</h1><p>Periodo: ${rangoLabel} · Generado: ${new Date().toLocaleString('es-CO')}</p><h2>Indicadores</h2><table>${filasStats}</table><h2>Ventas por día</h2><table>${filasDias}</table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return (
    <Layout>
      <div className="dash">

        {/* ── FILTRO DE FECHAS ── */}
        <div className="dash-datefilter">
          <div className="dash-datefilter__presets">
            {[{id:'hoy',label:'Hoy'},{id:'7d',label:'7 días'},{id:'30d',label:'30 días'},{id:'mes_actual',label:'Este mes'},{id:'mes_pasado',label:'Mes pasado'}].map(p => (
              <button key={p.id} onClick={() => handlePreset(p.id)}
                className={`dash-datefilter__btn ${datePreset===p.id ? 'dash-datefilter__btn--on' : ''}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div className="dash-datefilter__custom">
              <input type="date" value={rangoCustom.desde} max={todayISO()} onChange={e => { setDatePreset('custom'); setRangoCustom(r => ({...r, desde: e.target.value})); }}/>
              <span>—</span>
              <input type="date" value={rangoCustom.hasta} max={todayISO()} onChange={e => { setDatePreset('custom'); setRangoCustom(r => ({...r, hasta: e.target.value})); }}/>
            </div>
            <LocalFiltro value={localSel} onChange={setLocalSel} sedeUsuario={user?.sede} style={{marginLeft:8}}/>
            <button onClick={exportarResumenPDF}
              style={{display:'flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:8,border:'1.5px solid #4CAF50',background:'#4CAF50',color:'white',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Exportar PDF
            </button>
          </div>
        </div>

        {/* ── RESUMEN DEL PERIODO ── */}
        <div className="dash-period-summary">
          <div className="dash-period-card">
            <div className="dash-period-card__label">Ventas del periodo</div>
            <div className="dash-period-card__value">{fmt(totalVentasPeriodo)}</div>
            <div className="dash-period-card__sub">{cantidadVentasPeriodo} venta{cantidadVentasPeriodo!==1?'s':''}</div>
          </div>
          <div className="dash-period-card">
            <div className="dash-period-card__label">Mejor día del periodo</div>
            <div className="dash-period-card__value">{mejorDia ? fmt(mejorDia.value) : '—'}</div>
            <div className="dash-period-card__sub">{mejorDia ? new Date(mejorDia.fecha+'T00:00:00').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'}) : 'Sin ventas en el rango'}</div>
          </div>
          <div className="dash-period-card">
            <div className="dash-period-card__label">Promedio diario</div>
            <div className="dash-period-card__value">{fmt(ventasPorDia.length ? totalVentasPeriodo / ventasPorDia.length : 0)}</div>
            <div className="dash-period-card__sub">{ventasPorDia.length} día{ventasPorDia.length!==1?'s':''} en el rango</div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="dash-stats">
          {statCards.map((s,i) => (
            <div className="dash-stat" key={i} onClick={() => navigate(s.path)} style={{cursor:'pointer'}}>
              <div className="dash-stat__icon" style={{background:s.bg, color:s.color}}>
                <Icon d={s.icon} size={18} stroke={s.color} sw={2}/>
              </div>
              <div>
                <div className="dash-stat__value" style={{color:s.color}}>{s.value}</div>
                <div className="dash-stat__label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── ALERTS ── */}
        {(insumosLow.length>0||comprasPend.length>0||pedStats.pendiente>0||pedidosPendLanding>0||pedidosPorVerificar>0||devStats.pendiente>0||pedidosDomicilio>0) && (
          <div className="dash-alerts">
            {pedidosPorVerificar>0 && (
              <div className="dash-alert dash-alert--magenta" onClick={()=>navigate('/pedidos')}>
                <Icon d={ICONS.alert_warn} size={18} sw={2}/>
                <div><strong>{pedidosPorVerificar} pedido{pedidosPorVerificar>1?'s':''} con pago por verificar</strong><p>El cliente ya subió el comprobante, falta confirmar el pago</p></div>
              </div>
            )}
            {pedidosPendLanding>0 && (
              <div className="dash-alert dash-alert--green" onClick={()=>navigate('/pedidos')}>
                <Icon d={ICONS.alert_truck} size={18} sw={2}/>
                <div><strong>{pedidosPendLanding} pedido{pedidosPendLanding>1?'s':''} desde la landing</strong><p>Clientes esperando confirmación de domicilio</p></div>
              </div>
            )}
            {pedidosDomicilio>0 && (
              <div className="dash-alert dash-alert--green" onClick={()=>navigate('/pedidos')} style={{borderLeft:'4px solid #FF6F00'}}>
                <Icon d={ICONS.alert_truck} size={18} sw={2}/>
                <div><strong>🛵 {pedidosDomicilio} pedido{pedidosDomicilio>1?'s':''} a domicilio activo{pedidosDomicilio>1?'s':''}</strong><p>Pedidos en camino o pendientes de despacho</p></div>
              </div>
            )}
            {devStats.pendiente>0 && (
              <div className="dash-alert dash-alert--warn" onClick={()=>navigate('/devoluciones')}>
                <Icon d={ICONS.alert_back} size={18} sw={2}/>
                <div><strong>{devStats.pendiente} devolución{devStats.pendiente>1?'es':''} pendiente{devStats.pendiente>1?'s':''}</strong><p>Requieren aprobación o rechazo</p></div>
              </div>
            )}
            {pedStats.pendiente>0 && (
              <div className="dash-alert dash-alert--purple" onClick={()=>navigate('/pedidos')}>
                <Icon d={ICONS.pedidos} size={18} sw={2}/>
                <div><strong>{pedStats.pendiente} pedido{pedStats.pendiente>1?'s':''} pendiente{pedStats.pendiente>1?'s':''}</strong><p>Ventas del día: {fmt(pedStats.ventas)}</p></div>
              </div>
            )}
            {insumosLow.length>0 && (
              <div className="dash-alert dash-alert--warn" style={{ flexDirection:'column', alignItems:'stretch', gap:0 }}>
                {/* Resumen — sin la lista de nombres. Al tocar se despliega
                    el detalle con el local de cada insumo. */}
                <div
                  onClick={()=>setStockBajoOpen(o=>!o)}
                  role="button" aria-expanded={stockBajoOpen}
                  title={stockBajoOpen ? 'Ocultar detalle' : 'Ver detalle por local'}
                  style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', width:'100%' }}>
                  <Icon d={ICONS.alert_warn} size={18} sw={2}/>
                  <div style={{ flex:1 }}>
                    <strong>{insumosLow.length} insumo{insumosLow.length>1?'s':''} con stock bajo</strong>
                    <p>{stockBajoOpen ? 'Detalle por local' : 'Toca para ver el detalle por local'}</p>
                  </div>
                  <span style={{ display:'inline-flex', transform: stockBajoOpen ? 'rotate(180deg)' : 'none', transition:'transform .15s' }}>
                    <Icon d={ICONS.chevron} size={16} sw={2}/>
                  </span>
                </div>
                {stockBajoOpen && (
                  <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
                    {insumosLow.map(i => (
                      <div key={i.id}
                        onClick={(e)=>{ e.stopPropagation(); navigate('/insumos'); }}
                        title="Abrir Gestión de Insumos"
                        style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
                          padding:'8px 12px', borderRadius:8, cursor:'pointer',
                          background:'var(--bg-surface, rgba(255,255,255,.6))', border:'1px solid rgba(230,115,0,0.3)' }}>
                        <span style={{ fontWeight:700, color:'#E65100' }}>{i.nombre}</span>
                        <span style={{ color:'var(--text-secondary)' }}>— {i.localNombre || 'Sin local asignado'}</span>
                        <span style={{ marginLeft:'auto', fontWeight:600, color:'#E65100' }}>
                          {i.stockActual} / {i.stockMinimo} {i.unidadMedida || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CHARTS ── */}
        <div className="dash-charts">
          <div className="dash-card">
            <div className="dash-card__header">
              <div>
                <h3>Ventas por día</h3>
                <p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>
                  {rango.desde === rango.hasta
                    ? new Date(rango.desde+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'})
                    : `${new Date(rango.desde+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'})} – ${new Date(rango.hasta+'T00:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'})}`}
                </p>
              </div>
            </div>
            {ventasParaGrafico.every(d => d.value === 0)
              ? <div className="dash-empty">No hay ventas registradas en este rango de fechas.</div>
              : <BarChartMoney data={ventasParaGrafico} color="#4CAF50"/>}
          </div>

          <div className="dash-card">
            <div className="dash-card__header"><div><h3>Estado de ventas</h3><p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Distribución actual</p></div></div>
            <DonutChart segments={ventasDonut}/>
          </div>

          <div className="dash-card">
            <div className="dash-card__header"><div><h3>Estado de pedidos</h3><p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Todos los pedidos</p></div></div>
            <DonutChart segments={pedidosDonut}/>
          </div>
        </div>

        {/* ── LISTS GRID ── */}
        <div className="dash-grid">
          <div className="dash-card">
            <div className="dash-card__header">
              <h3>Últimos clientes</h3>
              <button className="dash-card__link" onClick={()=>navigate('/admin/clientes')}>Ver todos →</button>
            </div>
            {recentClientes.length===0
              ? <div className="dash-empty">Aún no hay clientes registrados.</div>
              : <div className="dash-list">{recentClientes.map(c=>(
                <div className="dash-list__item" key={c.id}>
                  <div className="dash-list__avatar">{c.nombre.charAt(0).toUpperCase()}</div>
                  <div className="dash-list__info">
                    <div className="dash-list__name">{c.nombre}</div>
                    <div className="dash-list__email">{c.correo}</div>
                  </div>
                  <span className={`dash-list__badge ${c.estado==='Activo'?'dash-list__badge--green':'dash-list__badge--gray'}`}>{c.estado==='Activo'?'Activo':'Inactivo'}</span>
                </div>
              ))}</div>
            }
          </div>

          <div className="dash-card">
            <div className="dash-card__header">
              <h3>Pedidos recientes</h3>
              <button className="dash-card__link" onClick={()=>navigate('/pedidos')}>Ver todos →</button>
            </div>
            {pedidosF.length===0
              ? <div className="dash-empty">No hay pedidos registrados.</div>
              : <div className="dash-list">{[...pedidosF].sort((a,b)=>String(b.id).localeCompare(String(a.id))).slice(0,5).map(p=>{
                const cfg={pendiente_verificacion:{c:'#AD1457',bg:'#FCE4EC'},pendiente:{c:'#F57F17',bg:'#FFF8E1'},en_proceso:{c:'#1565C0',bg:'rgba(25,118,210,0.12)'},en_camino:{c:'#00838F',bg:'#E0F7FA'},entregado:{c:'#388E3C',bg:'#F1F8E9'},cancelado:{c:'#B71C1C',bg:'#FFEBEE'}};
                const estNorm = normalizarEstadoPedido(p.estado);
                const c = cfg[estNorm]||{c:'#888',bg:'#F5F5F5'};
                return (
                  <div className="dash-list__item" key={p.id}>
                    <div className="dash-list__avatar" style={{background:'#F3E5F5',color:'#7B1FA2'}}>
                      <Icon d={ICONS.pedidos} size={14} stroke="#7B1FA2" sw={2}/>
                    </div>
                    <div className="dash-list__info">
                      <div className="dash-list__name">#{p.id} — {p.cliente || p.mesa || '—'}</div>
                      <div className="dash-list__email">{fmt(p.total)}</div>
                    </div>
                    <span className="dash-list__badge" style={{background:c.bg,color:c.c}}>{etiquetaEstadoPedido(p.estado, p.tipo)}</span>
                  </div>
                );
              })}</div>
            }
          </div>

          <div className="dash-card">
            <div className="dash-card__header">
              <h3>Insumos — stock bajo</h3>
              <button className="dash-card__link" onClick={()=>navigate('/insumos')}>Ver todos →</button>
            </div>
            {insumosLow.length===0
              ? <div className="dash-empty"><Icon d={ICONS.check} size={20} stroke="#4CAF50" sw={2}/> Todos los insumos tienen stock suficiente.</div>
              : <div className="dash-list">{insumosLow.slice(0,5).map(i=>(
                <div className="dash-list__item" key={i.id}>
                  <div className="dash-list__avatar" style={{background:'rgba(230,115,0,0.15)',color:'#FF8A65'}}>
                    <Icon d={ICONS.insumos} size={14} stroke="#E65100" sw={2}/>
                  </div>
                  <div className="dash-list__info">
                    <div className="dash-list__name">{i.nombre}</div>
                    <div className="dash-list__email">{i.stockActual} / {i.stockMinimo} {i.unidadMedida} · {i.localNombre || 'Sin local'}</div>
                  </div>
                  <span className="dash-list__badge dash-list__badge--warn">Stock bajo</span>
                </div>
              ))}</div>
            }
          </div>
        </div>

      </div>
    </Layout>
  );
}