import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pedidosService from '../features/pedidos/services/pedidosService';
import clientesService from '../features/clientes/services/clientesService';
import PedidoProgreso from '../shared/components/PedidoProgreso';
import '../shared/components/PedidoProgreso.css';
import './Landing.css';

const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);
const METODOS_PAGO_LABEL = { nequi: 'Nequi', transferencia: 'Transferencia', efectivo: 'Efectivo en caja' };
const estadoColor = { pendiente_verificacion: '#F57F17', pendiente: '#f59e0b', en_proceso: '#3b82f6', listo: '#10b981', en_camino: '#00838F', entregado: '#6b7280', cancelado: '#ef4444' };
const estadoLabel = { pendiente_verificacion: 'Verificando pago', pendiente: 'Pendiente', en_proceso: 'En proceso', listo: 'Listo', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };

// Página completa con el historial de pedidos del cliente (antes vivía como
// una pestaña dentro del modal "Mi perfil"). "Volver a comprar" y
// "Solicitar devolución" dependen del carrito/modales que viven en Landing,
// así que aquí solo dejamos una intención guardada en sessionStorage y
// navegamos a "/" — Landing la recoge y ejecuta la acción real.
const MisPedidosPage = () => {
  const navigate = useNavigate();
  const [clienteSession, setClienteSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sicaber_cliente_session')); } catch { return null; }
  });
  const [clienteData, setClienteData] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!clienteSession) { navigate('/'); return; }
    let activo = true;
    (async () => {
      try {
        const [items, c] = await Promise.all([
          pedidosService.getAll().catch(() => []),
          clientesService.getById(clienteSession.id).catch(() => null),
        ]);
        if (!activo) return;
        setClienteData(c);
        setPedidos(
          (items || [])
            .filter(p => p.cliente_id === clienteSession.id || p.cliente === clienteSession.nombre)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        );
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [clienteSession, navigate]);

  const verFacturaPedido = (pedido) => {
    const w = window.open('', '_blank');
    if (!w) { window.alert('Habilita las ventanas emergentes para ver la factura'); return; }
    const filas = [];
    (pedido.productos || []).forEach(i => {
      const cant = i.cantidad || 1;
      const precioBase = (i.precio || 0) * cant;
      filas.push({ desc: `${i.nombre} x${cant}`, precio: precioBase, esBase: true });
      (i.toppings || []).forEach(t => {
        if ((t.precio || 0) > 0) filas.push({ desc: `  + ${t.nombre} x${cant}`, precio: t.precio * cant, esBase: false });
        else filas.push({ desc: `  + ${t.nombre} (gratis)`, precio: 0, esBase: false });
      });
      (i.adiciones || []).forEach(a => {
        filas.push({ desc: `  + ${a.nombre} x${cant}`, precio: (a.precio || 0) * cant, esBase: false });
      });
    });
    const filasHtml = filas.map(f =>
      `<tr>
        <td style="${f.esBase ? '' : 'color:#666;padding-left:18px;font-size:12px;'}">${f.desc}</td>
        <td style="text-align:right;${f.esBase ? '' : 'color:#666;font-size:12px;'}">${f.precio > 0 ? fmt(f.precio) : (f.desc.includes('gratis') ? 'Gratis' : '')}</td>
      </tr>`
    ).join('');
    w.document.write(`<html><head><title>Factura Pedido #${pedido.id}</title><style>body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:480px;margin:0 auto;}h1{font-size:20px;color:#5C3D2E;}table{width:100%;border-collapse:collapse;margin-top:12px;}td{padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px;}tfoot td{font-weight:800;font-size:15px;border-top:2px solid #333;border-bottom:none;padding-top:10px;}</style></head><body><h1>☕ Café Don Berna</h1><p>Pedido #${pedido.id} · ${pedido.hora || ''}</p><p>Cliente: ${clienteData?.nombre || ''}</p><p>Método de pago: ${METODOS_PAGO_LABEL[pedido.pago] || pedido.pago || ''}</p><table><tbody>${filasHtml}</tbody><tfoot><tr><td>Total</td><td style="text-align:right;">${fmt(pedido.total)}</td></tr></tfoot></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const volverAComprar = (pedido) => {
    sessionStorage.setItem('sicaber_repetir_pedido', JSON.stringify(pedido));
    navigate('/');
  };

  const solicitarDevolucion = (pedido) => {
    sessionStorage.setItem('sicaber_devolucion_pedido', JSON.stringify(pedido));
    navigate('/');
  };

  return (
    <div className="lx-root" style={{ minHeight: '100vh', background: 'var(--lx-bg)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 60px' }}>
        <button
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--lx-muted)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', marginBottom: 20, padding: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Volver al menú
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--lx-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--lx-text)', margin: 0 }}>Historial de pedidos</h1>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--lx-muted)' }}>Cargando...</div>
        ) : pedidos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--lx-muted)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Aún no tienes pedidos</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>¡Haz tu primer pedido desde el menú!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} en total</div>
            {pedidos.map(p => (
              <div key={p.id} style={{ border: '1px solid var(--lx-border)', borderRadius: 12, padding: '14px 16px', background: 'rgba(128,128,128,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--lx-text)' }}>Pedido #{p.id}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: estadoColor[p.estado] + '25', color: estadoColor[p.estado] }}>{estadoLabel[p.estado] || p.estado}</span>
                </div>
                {Array.isArray(p.productos) && p.productos.length > 0 && <div style={{ fontSize: 12, color: 'var(--lx-muted)', marginBottom: 6 }}>{p.productos.map(x => `${x.nombre || x} x${x.cantidad || 1}`).join(' · ')}</div>}
                {/* 4 — local elegido para recoger, visible en el historial. */}
                {p.tipo === 'local' && p.localNombre && (
                  <div style={{ fontSize: 12, color: 'var(--lx-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    🏠 Recoger en: <strong style={{ color: 'var(--lx-text)' }}>{p.localNombre}</strong>
                  </div>
                )}
                {p.estado !== 'entregado' && p.estado !== 'cancelado' && p.estado !== 'anulado' && (
                  <div style={{ margin: '10px 0', padding: '10px 12px', borderRadius: 10, background: 'rgba(128,128,128,.06)' }}>
                    <PedidoProgreso estado={p.estado} pago={p.pago} tipo={p.tipo} orientacion="horizontal" />
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--lx-muted)' }}>{p.fechaCreacion || p.created_at ? new Date(p.fechaCreacion || p.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}{p.hora ? ` · ${p.hora}` : ''}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#4CAF50' }}>{fmt(p.total)}</span>
                </div>
                <button onClick={() => verFacturaPedido(p)}
                  style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: '1.5px solid var(--lx-border)', background: 'transparent', color: 'var(--lx-text)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                  Ver factura
                </button>
                <button onClick={() => volverAComprar(p)}
                  style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: '1.5px solid var(--lx-green)', background: 'transparent', color: 'var(--lx-green)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                  Volver a comprar
                </button>
                {(p.estado === 'entregado' || p.estado === 'listo') && (
                  <button onClick={() => solicitarDevolucion(p)}
                    style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: '1.5px solid #EF5350', background: 'transparent', color: '#EF5350', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                    Solicitar devolución
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MisPedidosPage;
