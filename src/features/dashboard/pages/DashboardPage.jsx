import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../../shared/components/Layout';
import { descargarExcel } from '../../../shared/utils/excelExport';
import clientesService from '../../clientes/services/clientesService';
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
import DateRangeFilter from '../../../shared/components/DateRangeFilter';
// Bug real corregido: este Dashboard tenía su PROPIA tabla de labels/colores
// de estado, separada de la fuente única que ya usan PedidosPage/CajeroPage/
// BartenderPage (pedidoEstados.js) — y la suya seguía usando el nombre
// legado 'listo', que el backend ya no guarda NUNCA (el estado real es
// 'en_camino', ver pedidos_estado_check). Resultado: cualquier pedido
// "Listo para recoger"/"En camino" no caía en ningún bucket del donut (se
// perdía del conteo) y en la lista de "Pedidos recientes" se mostraba con
// el badge gris de "estado desconocido" y el texto crudo "en_camino".
import { configEstadoPedido } from '../../../shared/utils/pedidoEstados';
import '../../insumos/pages/InsumosPage.css';
import './DashboardPage.css';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);

// Nombre del negocio para el encabezado del reporte Excel exportado.
const EMPRESA = 'Café Don Berna';
// dd-mm-aaaa, para el nombre del archivo — más legible que el ISO (aaaa-mm-dd)
// en un nombre de archivo pensado para que alguien lo lea, no lo ordene.
const ddmmaaaa = (iso) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };

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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, flexWrap:'wrap' }}>
      <svg width={150} height={150} viewBox="0 0 140 140" style={{ flexShrink:0 }}>
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
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {segments.map((seg,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:seg.color, flexShrink:0 }}/>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{seg.label}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto' }}>{seg.value}</span>
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
  const [exportando, setExportando] = useState(false);

  // ── Estado para todos los datos async ───────────────────────────────────
  const [clientes,    setClientes]    = useState([]);
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
        const [cl, com, ped, emp, prod, ven, dev, usr] = await Promise.allSettled([
          clientesService.getAll(),
          comprasService.getAll(),
          pedidosService.getAll(),
          empleadosService.getAll(),
          productosService.getAll(),
          ventasService.getAll(),
          devolucionesService.getAll(),
          usuariosService.getAll(),
        ]);
        if (cl.status  === 'fulfilled') setClientes(cl.value  || []);
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
  // Antes "Compras" era la única lista de la página que NO respetaba el
  // filtro de local — ni la tarjeta "Compras pendientes" en pantalla ni la
  // hoja de Compras del Excel exportado (ver comentario en
  // exportarResumenExcel). `sede`/`local_nombre`: mismos campos que ya usa
  // el resto del código de compras.
  const comprasF      = localSel === 'todos' ? compras      : compras.filter(c => (c.sede || c.local_nombre) === localSel);
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
  // item 11 — la lista/alerta de "Insumos con stock bajo" se quitó del
  // Dashboard: esa información vive en Insumos (filtro "Ver solo stock bajo").
  const comprasPend      = comprasF.filter(c => c.estado === 'Pendiente');
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

  const pedidosDonut = [
    { label:'Verificar pago', value: pedidosF.filter(p=>p.estado==='pendiente_verificacion').length, color:'#AD1457' },
    { label:'Pendiente',      value: pedidosF.filter(p=>p.estado==='pendiente').length,              color:'#FF9800' },
    { label:'En proceso',     value: pedidosF.filter(p=>p.estado==='en_proceso').length,             color:'#2196F3' },
    // 'en_camino' es el estado real (ver comentario del import de arriba):
    // agrupa domicilio ("En camino") y recoger ("Listo para recoger") bajo
    // una sola etiqueta neutra porque este donut mezcla ambos tipos.
    { label:'Listo/En camino',value: pedidosF.filter(p=>p.estado==='en_camino').length,              color:'#9C27B0' },
    { label:'Entregado',      value: pedidosF.filter(p=>p.estado==='entregado').length,              color:'#4CAF50' },
    { label:'Cancelado',      value: pedidosF.filter(p=>p.estado==='cancelado').length,              color:'#EF5350' },
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

  // Diseño del PDF: mismo criterio visual que el dashboard en pantalla
  // (tarjetas de resumen, grid de indicadores a color, tabla de ventas con
  // total, y las dos distribuciones —ventas/pedidos— como barras de
  // colores en vez de donuts, que no se replican bien en HTML impreso).
  // ── Exportación a Excel ────────────────────────────────────────────────
  // Antes esto abría una ventana con HTML y llamaba a window.print() para
  // que el navegador lo guardara como PDF. Un PDF se mira; una hoja de
  // cálculo se trabaja: se filtra, se suma, se pega en otro informe. Por
  // eso el reporte pasó a Excel, y de paso se amplió — el PDF cabía en una
  // página y mostraba solo los agregados; acá va también el detalle fila
  // por fila de ventas, pedidos, devoluciones, compras y catálogo.
  //
  // El libro se genera con ExcelJS (ver shared/utils/excelExport.js) —
  // .xlsx real, con el nombre del negocio, colores de marca sutiles en los
  // encabezados y ancho de columna según el contenido. `descargarExcel`
  // es async (ExcelJS se importa recién acá, de forma diferida) — de ahí
  // el estado `exportando`, para no dejar que un segundo clic dispare una
  // segunda descarga mientras la primera todavía se está armando.
  const exportarResumenExcel = async () => {
    if (exportando) return;
    setExportando(true);
    try {
    const fechaLarga = iso => new Date(iso + 'T00:00:00')
      .toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const fechaCorta = valor => {
      if (!valor) return '—';
      const d = new Date(valor);
      return isNaN(d) ? String(valor).slice(0, 10)
        : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const horaDe = valor => {
      if (!valor) return '';
      const d = new Date(valor);
      return isNaN(d) ? '' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };
    const diaSemana = iso => new Date(iso + 'T00:00:00')
      .toLocaleDateString('es-CO', { weekday: 'long' });

    const rangoLabel = rango.desde === rango.hasta
      ? fechaLarga(rango.desde)
      : `${fechaLarga(rango.desde)} al ${fechaLarga(rango.hasta)}`;
    const localLabel = localSel === 'todos' ? 'Todos los locales' : localSel;
    const promedioDiario = ventasPorDia.length ? totalVentasPeriodo / ventasPorDia.length : 0;
    const ticketPromedio = cantidadVentasPeriodo ? totalVentasPeriodo / cantidadVentasPeriodo : 0;
    const generado = new Date().toLocaleString('es-CO',
      { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const subtitulos = [
      `Periodo: ${rangoLabel}`,
      `Local: ${localLabel}`,
      `Generado: ${generado}`,
    ];

    // ── Hoja 1 · Resumen ────────────────────────────────────────────────
    const hojaResumen = {
      nombre: 'Resumen',
      empresa: EMPRESA,
      titulo: 'Reporte de Ventas y Pedidos',
      subtitulos,
      datos: [
        ['##', 'VENTAS DEL PERIODO'],
        ['Total facturado', totalVentasPeriodo, 'moneda'],
        ['Número de ventas', cantidadVentasPeriodo, 'numero'],
        ['Ticket promedio', Math.round(ticketPromedio), 'moneda'],
        ['Promedio diario', Math.round(promedioDiario), 'moneda'],
        ['Días en el rango', ventasPorDia.length, 'numero'],
        ['Mejor día', mejorDia ? `${diaSemana(mejorDia.fecha)}, ${fechaCorta(mejorDia.fecha + 'T00:00:00')}` : 'Sin ventas en el rango'],
        ['Venta del mejor día', mejorDia ? mejorDia.value : 0, 'moneda'],
        ['---'],
        // "Estado de ventas/pedidos" — mismo criterio que sus tarjetas en
        // pantalla ("Distribución actual" / "Todos los pedidos"): son el
        // estado ACTUAL de la operación, no un corte del periodo elegido
        // arriba. Se aclara acá para que el Excel no contradiga su propio
        // encabezado "Periodo: …".
        ['##', 'ESTADO DE VENTAS (actual, no solo del periodo)'],
        ...ventasDonut.map(d => [d.label, d.value, 'numero']),
        ['Total de ventas registradas', ventasStats.total || 0, 'numero'],
        ['---'],
        ['##', 'ESTADO DE PEDIDOS (actual, no solo del periodo)'],
        ...pedidosDonut.map(d => [d.label, d.value, 'numero']),
        ['Total de pedidos', pedidosF.length, 'numero'],
        ['---'],
        ['##', 'INDICADORES GENERALES'],
        ...statCards.map(c => [c.label, c.value, 'numero']),
        ['Empleados activos', empleadosActivos, 'numero'],
        ['Compras pendientes', comprasPend.length, 'numero'],
        ['Pedidos a domicilio en curso', pedidosDomicilio, 'numero'],
        ['Pedidos por verificar pago', pedidosPorVerificar, 'numero'],
        ['Pedidos del cliente pendientes', pedidosPendLanding, 'numero'],
      ],
      nota: 'Documento informativo generado por SICABER. No constituye comprobante fiscal.',
    };

    // ── Hoja 2 · Ventas por día ─────────────────────────────────────────
    const ventasDelDia = f => ventasEnRango.filter(v => (v.fecha || v.created_at || '').slice(0, 10) === f);
    const hojaPorDia = {
      nombre: 'Ventas por dia',
      empresa: EMPRESA,
      titulo: 'Ventas por día',
      subtitulos,
      columnas: [
        { titulo: 'Fecha',           tipo: 'texto'   },
        { titulo: 'Día',             tipo: 'texto'   },
        { titulo: 'N.º de ventas',   tipo: 'numero'  },
        { titulo: 'Total del día',   tipo: 'moneda'  },
        { titulo: 'Ticket promedio', tipo: 'moneda'  },
        { titulo: '% del periodo',   tipo: 'decimal' },
      ],
      filas: ventasPorDia.map(d => {
        const delDia = ventasDelDia(d.fecha);
        return [
          fechaCorta(d.fecha + 'T00:00:00'),
          diaSemana(d.fecha),
          delDia.length,
          d.value,
          delDia.length ? Math.round(d.value / delDia.length) : 0,
          totalVentasPeriodo ? (d.value * 100) / totalVentasPeriodo : 0,
        ];
      }),
      totales: ['TOTAL', '', cantidadVentasPeriodo, totalVentasPeriodo, '', ''],
    };

    // ── Hoja 3 · Detalle de ventas ──────────────────────────────────────
    const hojaVentas = {
      nombre: 'Detalle de ventas',
      empresa: EMPRESA,
      titulo: 'Detalle de ventas del periodo',
      subtitulos,
      columnas: [
        { titulo: 'Venta',  tipo: 'texto'  },
        { titulo: 'Pedido', tipo: 'texto'  },
        { titulo: 'Fecha',  tipo: 'texto'  },
        { titulo: 'Hora',   tipo: 'texto'  },
        { titulo: 'Local',  tipo: 'texto'  },
        { titulo: 'Estado', tipo: 'texto'  },
        { titulo: 'Total',  tipo: 'moneda' },
      ],
      filas: [...ventasEnRango]
        .sort((a, b) => String(b.fecha || b.created_at || '').localeCompare(String(a.fecha || a.created_at || '')))
        .map(v => [
          `#${v.id}`,
          v.pedido_id ? `#${v.pedido_id}` : '—',
          fechaCorta(v.fecha || v.created_at),
          horaDe(v.fecha || v.created_at),
          v.sede || '—',
          v.estado || '—',
          Number(v.total) || 0,
        ]),
      totales: ['', '', '', '', '', 'TOTAL', totalVentasPeriodo],
      nota: ventasEnRango.length ? '' : 'No hubo ventas en el rango seleccionado.',
    };

    // ── Hoja 4 · Pedidos ────────────────────────────────────────────────
    const pedidosEnRango = pedidosF.filter(p =>
      enRango(p.created_at || p.fechaCreacion, rango.desde, rango.hasta));
    const resumirItems = p => {
      const items = p.items || p.productos || [];
      if (!Array.isArray(items) || !items.length) return '—';
      return items.map(i => `${i.cantidad || 1}x ${i.nombre || i.producto || '?'}`).join(', ');
    };
    const hojaPedidos = {
      nombre: 'Pedidos',
      empresa: EMPRESA,
      titulo: 'Pedidos del periodo',
      subtitulos,
      columnas: [
        { titulo: 'Pedido',    tipo: 'texto'  },
        { titulo: 'Fecha',     tipo: 'texto'  },
        { titulo: 'Hora',      tipo: 'texto'  },
        { titulo: 'Cliente',   tipo: 'texto'  },
        { titulo: 'Tipo',      tipo: 'texto'  },
        { titulo: 'Local',     tipo: 'texto'  },
        { titulo: 'Origen',    tipo: 'texto'  },
        { titulo: 'Estado',    tipo: 'texto'  },
        { titulo: 'Productos', tipo: 'texto'  },
        { titulo: 'Total',     tipo: 'moneda' },
      ],
      filas: [...pedidosEnRango]
        .sort((a, b) => (b.id || 0) - (a.id || 0))
        .map(p => [
          `#${p.id}`,
          fechaCorta(p.created_at || p.fechaCreacion),
          p.hora || horaDe(p.created_at || p.fechaCreacion),
          p.cliente || '—',
          p.tipo || '—',
          p.sede || '—',
          p.origen || '—',
          p.estado || '—',
          resumirItems(p),
          Number(p.total) || 0,
        ]),
      totales: ['', '', '', '', '', '', '', '', 'TOTAL', pedidosEnRango.reduce((s, p) => s + (Number(p.total) || 0), 0)],
      nota: pedidosEnRango.length ? '' : 'No hubo pedidos en el rango seleccionado.',
    };

    // ── Hoja 5 · Devoluciones ───────────────────────────────────────────
    // Antes esta hoja no respetaba el rango de fechas del Dashboard (solo
    // el local) — exportaba TODAS las devoluciones históricas de ese local
    // sin importar el periodo elegido. Se corrige para que "Periodo" en el
    // encabezado sea cierto también acá.
    const devolucionesEnRango = devolucionesF.filter(d =>
      enRango(d.fecha || d.created_at, rango.desde, rango.hasta));
    const hojaDevoluciones = {
      nombre: 'Devoluciones',
      empresa: EMPRESA,
      titulo: 'Devoluciones del periodo',
      subtitulos,
      columnas: [
        { titulo: 'Devolución', tipo: 'texto'  },
        { titulo: 'Venta',      tipo: 'texto'  },
        { titulo: 'Fecha',      tipo: 'texto'  },
        { titulo: 'Local',      tipo: 'texto'  },
        { titulo: 'Estado',     tipo: 'texto'  },
        { titulo: 'Motivo',     tipo: 'texto'  },
        { titulo: 'Monto',      tipo: 'moneda' },
      ],
      filas: devolucionesEnRango.map(d => [
        `#${d.id}`,
        d.venta_id ? `#${d.venta_id}` : '—',
        fechaCorta(d.fecha || d.created_at),
        d.sede || '—',
        d.estado || '—',
        d.motivo || '—',
        Number(d.monto || d.total) || 0,
      ]),
      totales: ['', '', '', '', '', 'TOTAL', devolucionesEnRango.reduce((s, d) => s + (Number(d.monto || d.total) || 0), 0)],
      nota: devolucionesEnRango.length ? '' : 'No hubo devoluciones en el rango seleccionado.',
    };

    // ── Hoja 6 · Compras ────────────────────────────────────────────────
    // Antes esta hoja exportaba TODAS las compras registradas, de
    // cualquier fecha y cualquier local (comprasF ya filtra por local, a
    // nivel de página) — el rango de fechas es lo que faltaba acá.
    const comprasEnRango = comprasF.filter(c => enRango(c.fecha || c.created_at, rango.desde, rango.hasta));
    const hojaCompras = {
      nombre: 'Compras',
      empresa: EMPRESA,
      titulo: 'Compras del periodo',
      subtitulos,
      columnas: [
        { titulo: 'Compra',    tipo: 'texto'  },
        { titulo: 'Fecha',     tipo: 'texto'  },
        { titulo: 'Proveedor', tipo: 'texto'  },
        { titulo: 'Local',     tipo: 'texto'  },
        { titulo: 'Estado',    tipo: 'texto'  },
        { titulo: 'Total',     tipo: 'moneda' },
      ],
      filas: comprasEnRango.map(c => [
        `#${c.id}`,
        fechaCorta(c.fecha || c.created_at),
        c.proveedor || c.proveedor_nombre || '—',
        c.sede || c.local_nombre || '—',
        c.estado || '—',
        Number(c.total) || 0,
      ]),
      totales: ['', '', '', '', 'TOTAL', comprasEnRango.reduce((s, c) => s + (Number(c.total) || 0), 0)],
      nota: comprasEnRango.length ? '' : 'No hubo compras en el rango seleccionado.',
    };

    // ── Hoja 7 · Productos más vendidos ─────────────────────────────────
    const rankingProductos = (() => {
      const acumulado = new Map();
      pedidosEnRango.forEach(p => {
        const items = p.items || p.productos || [];
        if (!Array.isArray(items)) return;
        items.forEach(i => {
          const nombre = i.nombre || i.producto || 'Sin nombre';
          const cantidad = Number(i.cantidad) || 1;
          // Mismo criterio que ya usa el historial del cliente en Landing.jsx
          // para el subtotal de una línea: `precioTotal`/`precio` es el
          // precio POR UNIDAD (con toppings/adiciones ya incluidos si los
          // tiene), no el total de la línea — hay que multiplicarlo por
          // `cantidad` acá también.
          const monto = Number(i.precioTotal ?? i.precio ?? 0) * cantidad;
          const acc = acumulado.get(nombre) || { cantidad: 0, total: 0 };
          acc.cantidad += cantidad;
          acc.total += monto;
          acumulado.set(nombre, acc);
        });
      });
      return [...acumulado.entries()]
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.cantidad - a.cantidad);
    })();
    const hojaProductosVendidos = {
      nombre: 'Productos mas vendidos',
      empresa: EMPRESA,
      titulo: 'Productos más vendidos del periodo',
      subtitulos,
      columnas: [
        { titulo: 'Producto',        tipo: 'texto'  },
        { titulo: 'Unidades vendidas', tipo: 'numero' },
        { titulo: 'Ingresos generados', tipo: 'moneda' },
      ],
      filas: rankingProductos.map(p => [p.nombre, p.cantidad, Math.round(p.total)]),
      totales: ['TOTAL', rankingProductos.reduce((s, p) => s + p.cantidad, 0), Math.round(rankingProductos.reduce((s, p) => s + p.total, 0))],
      nota: rankingProductos.length ? '' : 'No hubo productos vendidos en el rango seleccionado.',
    };

    // ── Hoja 8 · Catálogo ───────────────────────────────────────────────
    // Sin filtro de fecha/local a propósito: es el catálogo VIGENTE del
    // menú (precio actual), no una foto histórica del periodo elegido.
    const hojaProductos = {
      nombre: 'Catalogo',
      empresa: EMPRESA,
      titulo: 'Catálogo de productos',
      subtitulos: [`Generado: ${generado}`],
      columnas: [
        { titulo: 'Producto',  tipo: 'texto'  },
        { titulo: 'Categoría', tipo: 'texto'  },
        { titulo: 'Estado',    tipo: 'texto'  },
        { titulo: 'Precio',    tipo: 'moneda' },
      ],
      filas: [...productos]
        .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')))
        .map(p => [
          p.nombre || '—',
          p.categoria || p.categoria_nombre || '—',
          p.estado || '—',
          Number(p.precio) || 0,
        ]),
    };

    // "Reporte_SICABER_dd-mm-aaaa_a_dd-mm-aaaa[_Local]" — el rango real
    // exportado, no un nombre genérico que se pisaría entre descargas.
    const sufijoLocal = localSel === 'todos' ? '' : '_' + String(localSel).replace(/[^A-Za-z0-9]+/g, '-');
    const nombreArchivo = `Reporte_SICABER_${ddmmaaaa(rango.desde)}_a_${ddmmaaaa(rango.hasta)}${sufijoLocal}`;

    await descargarExcel(nombreArchivo, [
      hojaResumen, hojaPorDia, hojaVentas, hojaPedidos,
      hojaDevoluciones, hojaCompras, hojaProductosVendidos, hojaProductos,
    ]);
    } finally {
      setExportando(false);
    }
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
              <DateRangeFilter
                desde={rangoCustom.desde} hasta={rangoCustom.hasta} maxToday showClear={false}
                title="Rango de fechas personalizado"
                onChange={({ desde, hasta }) => { setDatePreset('custom'); setRangoCustom({ desde, hasta }); }}
              />
            </div>
            <LocalFiltro value={localSel} onChange={setLocalSel} sedeUsuario={user?.sede} style={{marginLeft:8}}/>
            <button onClick={exportarResumenExcel} disabled={exportando}
              style={{display:'flex',alignItems:'center',gap:6,padding:'7px 16px',borderRadius:8,border:'1.5px solid #4CAF50',background:'#4CAF50',color:'white',fontSize:12,fontWeight:700,cursor:exportando?'default':'pointer',opacity:exportando?0.7:1}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {exportando ? 'Generando...' : 'Exportar Excel'}
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
        {(comprasPend.length>0||pedStats.pendiente>0||pedidosPendLanding>0||pedidosPorVerificar>0||devStats.pendiente>0) && (
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
            {/* La tarjeta "N pedidos a domicilio activos" se quitó: duplicaba
                la campanita de domicilios (DomiciliosBell, en el header del
                Layout) que ya cumple ese aviso. `pedidosDomicilio` se
                conserva para el resumen exportable de más arriba. */}
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
            <div className="dash-chart-body">
              {ventasParaGrafico.every(d => d.value === 0)
                ? <div className="dash-empty">No hay ventas registradas en este rango de fechas.</div>
                : <BarChartMoney data={ventasParaGrafico} color="#4CAF50"/>}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card__header"><div><h3>Estado de ventas</h3><p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Distribución actual</p></div></div>
            <div className="dash-chart-body"><DonutChart segments={ventasDonut}/></div>
          </div>

          <div className="dash-card">
            <div className="dash-card__header"><div><h3>Estado de pedidos</h3><p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Todos los pedidos</p></div></div>
            <div className="dash-chart-body"><DonutChart segments={pedidosDonut}/></div>
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
                // Antes esta tarjeta tenía su propia tabla de labels/colores
                // (sin 'en_camino' — ver el comentario junto al import de
                // configEstadoPedido). Ahora lee de la MISMA fuente que ya
                // usan PedidosPage/CajeroPage/BartenderPage, con la etiqueta
                // correcta según el tipo de entrega de ESTE pedido puntual
                // ("Listo para recoger" vs "En camino").
                const cfg = configEstadoPedido(p.estado, p.tipo);
                return (
                  <div className="dash-list__item" key={p.id}>
                    <div className="dash-list__avatar" style={{background:'#F3E5F5',color:'#7B1FA2'}}>
                      <Icon d={ICONS.pedidos} size={14} stroke="#7B1FA2" sw={2}/>
                    </div>
                    <div className="dash-list__info">
                      <div className="dash-list__name">#{p.id} — {p.cliente || p.mesa || '—'}</div>
                      <div className="dash-list__email">{fmt(p.total)}</div>
                    </div>
                    <span className="dash-list__badge" style={{background:cfg.bg,color:cfg.color}}>{cfg.label}</span>
                  </div>
                );
              })}</div>
            }
          </div>

        </div>

      </div>
    </Layout>
  );
}